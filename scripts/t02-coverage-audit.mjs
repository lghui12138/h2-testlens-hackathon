#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import vm from 'node:vm';
import { parseCSV } from '../src/analyzer.mjs';
import { analyzeEnterpriseRows } from '../src/enterprise-adapters.mjs';
import { parseDataWorkbook, setSpreadsheetEngine, summarizeWorkbookEvidence } from '../src/excel-workflow.mjs';
import { parseDurabilityDocx, setDocxEngine } from '../src/docx-workflow.mjs';
import { decodeTextBuffer } from '../src/input-safety.mjs';
import { loadXlsx } from '../src/xlsx-node-loader.mjs';

setSpreadsheetEngine(await loadXlsx());
let docxReady = false;
const repoRoot = resolve(new URL('..', import.meta.url).pathname);

const ensureDocxEngine = async () => {
  if (docxReady) return;
  vm.runInThisContext(await readFile(`${repoRoot}/src/vendor/mammoth.browser.min.js`, 'utf8'));
  setDocxEngine(globalThis.mammoth);
  docxReady = true;
};

const defaultRoot = process.env.T02_SOURCE_ROOT || `${homedir()}/Downloads/T02_设备测试数据分析与自动报告助手`;
const inputRoot = resolve(process.argv[2] || defaultRoot);
const packageVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const t02ProfilePackage = JSON.parse(await readFile(new URL('../config/t02-profile.example.json', import.meta.url), 'utf8'));
const t02Profiles = Object.fromEntries((t02ProfilePackage.profiles || []).flatMap((profile) => (profile.supportedDatasetTypes || []).map((datasetType) => [datasetType, profile])));

const analysisConfigForPath = (path) => {
  const relativePath = relative(inputRoot, path);
  if (relativePath.includes('/01_耐久原始数据处理/') && extname(path).toLowerCase() === '.docx') return t02Profiles.durability || {};
  if (relativePath.includes('/02_整车数据处理/')) return t02Profiles.vehicle || {};
  return t02Profiles.stack || {};
};

const fileEntries = async (directory) => {
  const entries = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) entries.push(...await fileEntries(path));
    else if (entry.isFile()) entries.push(path);
  }
  return entries.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
};

const hashAndSample = async (path) => {
  const hash = createHash('sha256');
  const sampleChunks = [];
  let sampleBytes = 0;
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    bytes += chunk.length;
    if (sampleBytes < 1024 * 1024) {
      const remaining = 1024 * 1024 - sampleBytes;
      const sampleChunk = chunk.subarray(0, remaining);
      sampleChunks.push(sampleChunk);
      sampleBytes += sampleChunk.length;
    }
  }
  const sample = Buffer.concat(sampleChunks, sampleBytes);
  return { sha256: hash.digest('hex'), bytes, sample };
};

const decodeText = (buffer, encoding = 'utf-8') => {
  const decoded = decodeTextBuffer(buffer, encoding);
  return decoded.binary ? null : decoded.text;
};

const roundNumber = (value, digits = 9) => {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const normalizeNumbers = (value) => {
  if (typeof value === 'number') return roundNumber(value);
  if (Array.isArray(value)) return value.map(normalizeNumbers);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeNumbers(item)]));
  return value;
};

const firstLineStats = (sample, extension) => {
  const text = decodeText(sample);
  if (text === null) return { binary: true, rows: null, columns: null, encoding: 'binary-or-non-text' };
  const lines = text.split(/\r?\n/);
  const header = lines.find((line) => line.trim().length > 0) || '';
  const delimiter = extension === '.csv' ? ',' : '\t';
  return {
    binary: false,
    rows: null,
    columns: header ? header.split(delimiter).length : 0,
    encoding: /^\s*[\u4e00-\u9fff]/.test(header) ? 'utf8-or-compatible' : 'text'
  };
};

const packageName = (path) => {
  const match = relative(inputRoot, path).match(/^(企业资料包\d+_[^/]+)/);
  return match?.[1] || '未分包';
};

const enrichFieldUsage = (fieldUsage, fallbackSourceFields = []) => {
  const base = fieldUsage && typeof fieldUsage === 'object' ? fieldUsage : {};
  const byRole = Object.fromEntries(Object.entries(base.byRole || {}).map(([role, fields]) => [
    role,
    [...new Set((Array.isArray(fields) ? fields : []).map((field) => String(field ?? '').trim()).filter(Boolean))].sort()
  ]));
  const sourceFields = [...new Set([
    ...fallbackSourceFields.map((field) => String(field ?? '').trim()),
    ...Object.values(byRole).flat()
  ].filter(Boolean))].sort();
  const memberships = new Map();
  for (const [role, fields] of Object.entries(byRole)) {
    for (const field of fields) memberships.set(field, [...(memberships.get(field) || []), role]);
  }
  const unclassifiedSourceFields = sourceFields.filter((field) => !memberships.has(field) || memberships.get(field).includes('unclassified'));
  const overlappingSourceFields = sourceFields.filter((field) => (memberships.get(field) || []).length > 1);
  return {
    ...base,
    roleCounts: Object.fromEntries(Object.entries(byRole).map(([role, fields]) => [role, fields.length])),
    byRole,
    sourceFieldCount: sourceFields.length,
    roleUnionCount: sourceFields.length,
    unclassifiedSourceFieldCount: unclassifiedSourceFields.length,
    unclassifiedSourceFields,
    overlappingSourceFieldCount: overlappingSourceFields.length,
    overlappingSourceFields,
    boundary: base.boundary || 'analysis_input 进入结构化指标或阶段处理；context_or_cross_check 进入设定值/反馈核对；catalog_only 只保留字段覆盖和描述性统计；未分类或多角色冲突字段必须人工处置。'
  };
};

const countTextRows = async (path, binary) => {
  if (binary) return null;
  let rows = 0;
  for await (const chunk of createReadStream(path)) {
    for (const byte of chunk) if (byte === 10) rows += 1;
  }
  return rows + 1;
};

const analysisSummary = (result) => {
  if (!result) return null;
  const dataset = result.dataset || {};
  const mapping = result.schema?.mapping || {};
  const signalCatalog = Array.isArray(dataset.signalCatalog)
    ? dataset.signalCatalog.filter((signal) => String(signal?.source ?? '').trim())
    : [];
  const byRole = signalCatalog.length
    ? Object.fromEntries([...new Set(signalCatalog.map((signal) => signal.usage || 'unclassified'))].sort().map((role) => [role, signalCatalog.filter((signal) => (signal.usage || 'unclassified') === role).map((signal) => signal.source).sort()]))
    : { analysis_input: Object.values(mapping).filter(Boolean).sort() };
  const fieldUsage = enrichFieldUsage(result.fieldUsage || {
    sourceFieldCount: signalCatalog.length || Object.values(mapping).filter(Boolean).length,
    byRole,
    boundary: 'analysis_input 进入结构化指标或阶段处理；context_or_cross_check 进入设定值/反馈核对；catalog_only 只保留字段覆盖和描述性统计，不进入正式 KPI 或符合性判定。'
  }, signalCatalog.map((signal) => signal.source));
  return {
    datasetType: result.datasetType,
    mappedFields: result.schema?.mappedCount ?? null,
    mappedFieldNames: Object.keys(mapping).filter((field) => mapping[field]),
    schemaFields: result.schema?.fieldCount ?? null,
    issueCodes: (result.issues || []).map((item) => item.code).slice(0, 12),
    cellChannelCount: result.dataset?.cellChannelCount ?? null,
    signalCount: result.dataset?.signalCatalog?.length ?? null,
    analysisSignalCount: result.dataset?.coverage?.analysisSignals ?? null,
    catalogOnlySignalCount: result.dataset?.coverage?.catalogOnlySignals?.length ?? null,
    numericSignalCount: result.dataset?.coverage?.numericSignals ?? null,
    nonNumericSignalCount: result.dataset?.coverage?.nonNumericSignals ?? null,
    catalogOnlyNumericSignalCount: result.dataset?.coverage?.catalogOnlyNumericSignals?.length ?? null,
    catalogOnlyNonNumericSignalCount: result.dataset?.coverage?.catalogOnlyNonNumericSignals?.length ?? null,
    descriptiveFieldStats: Array.isArray(dataset.signalCatalog) ? dataset.signalCatalog.every((signal) => Object.hasOwn(signal, 'std')) : null,
    targetPowerCount: result.dataset?.targetPowers?.length ?? null,
    descriptiveCandidateCount: dataset.inferredSegments?.length ?? 0,
    formalPerformancePointCount: dataset.performancePoints?.length ?? 0,
    metricNames: Object.keys(result.metrics || {}).filter((key) => Number.isFinite(result.metrics[key])),
    dynamicAnalysis: result.dataset?.dynamicAnalysis ? {
      enabled: result.dataset.dynamicAnalysis.enabled,
      status: result.dataset.dynamicAnalysis.status,
      commandField: result.dataset.dynamicAnalysis.commandField,
      actualField: result.dataset.dynamicAnalysis.actualField,
      actualPowerField: result.dataset.dynamicAnalysis.actualPowerField,
      sampleCount: result.dataset.dynamicAnalysis.sampleCount,
      commandSampleCount: result.dataset.dynamicAnalysis.commandSampleCount,
      actualSampleCount: result.dataset.dynamicAnalysis.actualSampleCount,
      eventCount: result.dataset.dynamicAnalysis.eventCount,
      settledEventCount: result.dataset.dynamicAnalysis.settledEventCount,
      unsettledEventCount: result.dataset.dynamicAnalysis.unsettledEventCount,
      dataGapCount: result.dataset.dynamicAnalysis.dataGapCount,
      maximumIntervalS: result.dataset.dynamicAnalysis.maximumIntervalS,
      boundary: result.dataset.dynamicAnalysis.boundary
    } : null,
    fieldValueDiagnostics: result.dataset?.signalDiagnostics ? {
      reviewSignalCount: result.dataset.signalDiagnostics.reviewSignalCount,
      negativeSignalCount: result.dataset.signalDiagnostics.negativeSignalCount,
      zeroDominantSignalCount: result.dataset.signalDiagnostics.zeroDominantSignalCount,
      constantSignalCount: result.dataset.signalDiagnostics.constantSignalCount,
      parseIssueSignalCount: result.dataset.signalDiagnostics.parseIssueSignalCount,
      reviewSignals: result.dataset.signalDiagnostics.reviewSignals,
      boundary: result.dataset.signalDiagnostics.boundary
    } : null,
    sourceSignalCount: dataset.signalCatalog?.length ?? null,
    fieldUsage,
    metadataUsage: result.metadataUsage || null,
    workbookEvidenceSummary: dataset.workbookEvidence?.summary || null
  };
};

const durabilityFieldUsage = (report) => {
  const headers = [...new Set((report?.headers || []).map((header) => String(header ?? '').trim()).filter(Boolean))];
  const analysisLabels = ['目标功率', '净输出功率', '电堆电流', '平均单体电压', '离均差', '电压方差'];
  const byRole = {
    analysis_input: headers.filter((header) => analysisLabels.some((label) => header.includes(label))),
    context_or_cross_check: headers.filter((header) => !analysisLabels.some((label) => header.includes(label)))
  };
  return {
    sourceFieldCount: headers.length,
    roleUnionCount: headers.length,
    roleCounts: Object.fromEntries(Object.entries(byRole).map(([role, fields]) => [role, fields.length])),
    byRole,
    unclassifiedSourceFieldCount: 0,
    unclassifiedSourceFields: [],
    overlappingSourceFieldCount: 0,
    overlappingSourceFields: [],
    boundary: '耐久 DOCX 表格字段全部进入结构化功率点；核心功率/电堆性能字段进入分析输入，其余已解析字段进入报告/交叉核对，不自动生成标准符合性结论。'
  };
};

const batchContribution = (result) => {
  const dataset = result?.dataset || {};
  const contribution = {
    datasetType: result?.datasetType || null,
    rowCount: result?.source?.rowCount ?? result?.metrics?.sampleCount ?? 0,
    mappedFieldNames: Object.keys(result?.schema?.mapping || {}).filter((field) => result.schema.mapping[field]),
    catalogOnlySignals: (dataset.coverage?.catalogOnlySignals || []).filter((field) => String(field ?? '').trim()),
    analysisSignalCount: dataset.coverage?.analysisSignals ?? null,
    numericSignalCount: dataset.coverage?.numericSignals ?? null,
    nonNumericSignalCount: dataset.coverage?.nonNumericSignals ?? null,
    metricNames: [...new Set([
      ...(result?.metricNames || []),
      ...Object.keys(result?.metrics || {}).filter((key) => Number.isFinite(result.metrics[key])),
      ...Object.keys(result?.dataset?.metrics || {})
    ])].sort(),
    fieldUsage: result?.fieldUsage || analysisSummary(result)?.fieldUsage || null,
    metadataUsage: result?.metadataUsage || analysisSummary(result)?.metadataUsage || null,
    workbookEvidenceSummary: result?.dataset?.workbookEvidence?.summary || result?.workbookEvidenceSummary || null
  };
  if (result?.dataset?.signalDiagnostics) {
    contribution.fieldValueDiagnostics = {
      reviewSignalCount: result.dataset.signalDiagnostics.reviewSignalCount,
      negativeSignalCount: result.dataset.signalDiagnostics.negativeSignalCount,
      zeroDominantSignalCount: result.dataset.signalDiagnostics.zeroDominantSignalCount,
      constantSignalCount: result.dataset.signalDiagnostics.constantSignalCount,
      parseIssueSignalCount: result.dataset.signalDiagnostics.parseIssueSignalCount,
      reviewSignals: result.dataset.signalDiagnostics.reviewSignals,
      boundary: result.dataset.signalDiagnostics.boundary
    };
  }
  if (result?.datasetType === 'vehicle') {
    contribution.vehicle = {
      stateCounts: dataset.stateCounts || {},
      insulationPointCount: dataset.insulation?.points?.length ?? 0,
      performancePointCount: dataset.performancePoints?.length ?? 0,
      descriptiveCandidateCount: dataset.inferredSegments?.length ?? 0,
      descriptiveOnly: dataset.performancePoints?.length === 0 && (dataset.inferredSegments?.length ?? 0) > 0,
      dynamicAnalysis: dataset.dynamicAnalysis ? {
        enabled: dataset.dynamicAnalysis.enabled,
        status: dataset.dynamicAnalysis.status,
        commandField: dataset.dynamicAnalysis.commandField,
        actualField: dataset.dynamicAnalysis.actualField,
        actualPowerField: dataset.dynamicAnalysis.actualPowerField,
        sampleCount: dataset.dynamicAnalysis.sampleCount,
        commandSampleCount: dataset.dynamicAnalysis.commandSampleCount,
        actualSampleCount: dataset.dynamicAnalysis.actualSampleCount,
        eventCount: dataset.dynamicAnalysis.eventCount,
        settledEventCount: dataset.dynamicAnalysis.settledEventCount,
        unsettledEventCount: dataset.dynamicAnalysis.unsettledEventCount,
        dataGapCount: dataset.dynamicAnalysis.dataGapCount,
        maximumIntervalS: dataset.dynamicAnalysis.maximumIntervalS,
        boundary: dataset.dynamicAnalysis.boundary
      } : null
    };
  }
  if (result?.datasetType === 'stack') {
    contribution.stack = {
      signalCount: dataset.signalCatalog?.length ?? 0,
      cellChannelCount: dataset.cellChannelCount ?? 0,
      stableSegmentCount: dataset.stableSegments?.length ?? 0,
      performancePointCount: dataset.performancePoints?.length ?? 0,
      descriptiveCandidateCount: dataset.inferredSegments?.length ?? 0,
      descriptiveOnly: dataset.performancePoints?.length === 0 && (dataset.inferredSegments?.length ?? 0) > 0,
      averageCurrentA: dataset.metrics?.averageCurrentA ?? null,
      averageVoltageV: dataset.metrics?.averageVoltageV ?? null,
      peakPowerKw: dataset.metrics?.peakPowerKw ?? null
    };
  }
  if (result?.datasetType === 'durability') {
    contribution.durability = {
      pointCount: dataset.points?.length ?? 0,
      targetPowersKw: dataset.targetPowers || []
    };
  }
  return contribution;
};

const aggregateFieldValueDiagnostics = (contributions = []) => {
  const records = contributions.map((item) => item?.fieldValueDiagnostics).filter(Boolean);
  const observedFields = new Map();
  for (const record of records) {
    for (const signal of record.reviewSignals || []) {
      const current = observedFields.get(signal.source) || { source: signal.source, fileCount: 0, negativeCount: 0, zeroCount: 0, parseInvalidCount: 0, reasons: new Set() };
      current.fileCount += 1;
      current.negativeCount += Number(signal.negativeCount || 0);
      current.zeroCount += Number(signal.zeroCount || 0);
      current.parseInvalidCount += Number(signal.parseInvalidCount || 0);
      for (const reason of signal.reasons || []) current.reasons.add(reason);
      observedFields.set(signal.source, current);
    }
  }
  return {
    fileCount: contributions.length,
    filesWithDiagnostics: records.length,
    reviewSignalFileCount: records.filter((record) => Number(record.reviewSignalCount || 0) > 0).length,
    reviewSignalOccurrenceCount: records.reduce((sum, record) => sum + Number(record.reviewSignalCount || 0), 0),
    negativeSignalFileCount: records.filter((record) => Number(record.negativeSignalCount || 0) > 0).length,
    zeroDominantSignalFileCount: records.filter((record) => Number(record.zeroDominantSignalCount || 0) > 0).length,
    constantSignalFileCount: records.filter((record) => Number(record.constantSignalCount || 0) > 0).length,
    parseIssueSignalFileCount: records.filter((record) => Number(record.parseIssueSignalCount || 0) > 0).length,
    topObservedReviewFields: [...observedFields.values()]
      .sort((a, b) => b.fileCount - a.fileCount || b.negativeCount - a.negativeCount || b.zeroCount - a.zeroCount || a.source.localeCompare(b.source, 'zh-Hans-CN'))
      .slice(0, 20)
      .map((item) => ({ ...item, reasons: [...item.reasons] })),
    boundary: '全包字段值诊断只汇总原始值分布复核点，不替代企业字段语义、无效码表、单位、校准或标准验收限值。'
  };
};

const referenceKind = (rel, name) => {
  if (name === '00_企业资料说明.pdf') return 'enterprise_brief';
  if (name.includes('任务说明书') || name.includes('需求')) return 'business_requirement';
  if (name.includes('技术开发与应用')) return 'product_technical_reference';
  return 'reference_document';
};

const reportStartMs = (summary) => {
  const value = String(summary?.startTime || '').trim();
  const parsed = Date.parse(value.replaceAll('/', '-').replace(' ', 'T'));
  return Number.isFinite(parsed) ? parsed : null;
};

const reportEndMs = (summary) => {
  const value = String(summary?.endTime || '').trim();
  const parsed = Date.parse(value.replaceAll('/', '-').replace(' ', 'T'));
  return Number.isFinite(parsed) ? parsed : null;
};

const reportComparableSet = (value) => JSON.stringify([...new Set((value || []).map((item) => String(item ?? '').trim()).filter(Boolean))].sort());

const durabilityComparabilityAudit = (ordered) => {
  const checksInput = [
    ['system_name', ordered.map((report) => String(report.systemName || '').trim() || null)],
    ['stack_model', ordered.map((report) => String(report.stackModel || '').trim() || null)],
    ['step_count', ordered.map((report) => Number.isFinite(report.stepCount) ? report.stepCount : null)],
    ['point_count', ordered.map((report) => Number.isFinite(report.pointCount) ? report.pointCount : null)],
    ['target_power_set', ordered.map((report) => reportComparableSet((report.targetPowersKw || []).map((value) => Number(value).toFixed(6))))],
    ['header_set', ordered.map((report) => reportComparableSet(report.headers))]
  ];
  const checks = checksInput.map(([id, values]) => {
    const observed = values.filter((value) => value !== null);
    const distinct = [...new Set(observed.map((value) => JSON.stringify(value)))];
    const missingCount = values.length - observed.length;
    return { id, status: missingCount ? 'incomplete' : distinct.length <= 1 ? 'consistent' : 'mismatch', reportCount: values.length, observedCount: observed.length, missingCount, distinctCount: distinct.length };
  });
  let gapCount = 0;
  let overlapCount = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    const previousEnd = reportEndMs(ordered[index - 1]);
    const currentStart = reportStartMs(ordered[index]);
    if (previousEnd === null || currentStart === null) continue;
    if (currentStart < previousEnd) overlapCount += 1;
    else if (currentStart > previousEnd) gapCount += 1;
  }
  const issueCodes = checks.filter((check) => check.status !== 'consistent').map((check) => `DURABILITY_COMPARABILITY_${check.id.toUpperCase()}_${check.status === 'mismatch' ? 'MISMATCH' : 'EVIDENCE_MISSING'}`);
  if (overlapCount) issueCodes.push('DURABILITY_REPORT_TIME_OVERLAP');
  return {
    status: 'descriptive_only',
    auditStatus: checks.some((check) => check.status === 'incomplete') ? 'not_evaluable' : 'screened',
    comparable: checks.every((check) => check.status === 'consistent') && overlapCount === 0,
    checks,
    completeEndTimeEvidence: ordered.every((report) => reportEndMs(report) !== null),
    gapCount,
    overlapCount,
    issueCodes,
    boundary: '仅作跨报告元数据、功率集合和时间关系筛查；不证明耐久方法、循环等效性、统计显著性或企业验收限值。'
  };
};

const crossReportDurabilitySummary = (records) => {
  const reports = records.map((record) => record.reportSummary).filter(Boolean);
  if (reports.length < 2) return null;
  const completeStartTimes = reports.every((report) => reportStartMs(report) !== null);
  const ordered = [...reports].sort((a, b) => completeStartTimes ? reportStartMs(a) - reportStartMs(b) : a.inputIndex - b.inputIndex);
  const byPower = new Map();
  ordered.forEach((report, reportIndex) => {
    for (const point of report.powerPointSummary) {
      const series = byPower.get(point.targetPowerKw) || [];
      series.push({
        reportIndex,
        reportLabel: report.testPlan || `报告${reportIndex + 1}`,
        startTime: report.startTime,
        testResult: report.testResult,
        averageCellVoltageMv: point.averageCellVoltageMv,
        averageDeviationMv: point.averageDeviationMv,
        netPowerKw: point.netPowerKw,
        voltageVariance: point.voltageVariance
      });
      byPower.set(point.targetPowerKw, series);
    }
  });
  const delta = (first, last) => Number.isFinite(first) && Number.isFinite(last) ? last - first : null;
  const byTargetPower = [...byPower.entries()].sort(([a], [b]) => a - b).map(([targetPowerKw, series]) => {
    const first = series[0] || {};
    const last = series.at(-1) || {};
    const deviations = series.map((item) => item.averageDeviationMv).filter(Number.isFinite);
    return {
      targetPowerKw,
      reportCount: series.length,
      firstAverageCellVoltageMv: first.averageCellVoltageMv ?? null,
      lastAverageCellVoltageMv: last.averageCellVoltageMv ?? null,
      averageCellVoltageDeltaMv: delta(first.averageCellVoltageMv, last.averageCellVoltageMv),
      firstAverageDeviationMv: first.averageDeviationMv ?? null,
      lastAverageDeviationMv: last.averageDeviationMv ?? null,
      averageDeviationDeltaMv: delta(first.averageDeviationMv, last.averageDeviationMv),
      maximumAverageDeviationMv: deviations.length ? Math.max(...deviations) : null
    };
  });
  const resultCounts = {};
  for (const report of ordered) {
    const result = report.testResult || '未标注';
    resultCounts[result] = (resultCounts[result] || 0) + 1;
  }
  return {
    status: 'descriptive_only',
    reportCount: ordered.length,
    orderingBasis: completeStartTimes ? 'metadata.开始时间' : '输入报告顺序',
    completeStartTimeEvidence: completeStartTimes,
    resultCounts,
    comparabilityAudit: durabilityComparabilityAudit(ordered),
    byTargetPower,
    boundary: '仅作跨报告描述性变化摘要；未验证耐久方法、循环等效性、统计显著性或企业验收限值。'
  };
};

const usageLedger = (record) => {
  if (record.status === 'processed') {
    const analysis = record.analysis || {};
    const dynamicEventCount = Number(analysis.dynamicAnalysis?.eventCount || 0);
    const descriptiveCandidateCount = Number(analysis.descriptiveCandidateCount || 0);
    const formalPerformancePointCount = Number(analysis.formalPerformancePointCount || 0);
    const durabilityPointCount = Number(record.batchContribution?.durability?.pointCount || 0);
    const evidenceDepth = formalPerformancePointCount > 0
      ? 'formal_kpi'
      : descriptiveCandidateCount > 0
        ? 'descriptive_interval'
        : dynamicEventCount > 0
          ? 'dynamic_event_only'
          : durabilityPointCount > 0
            ? 'descriptive_interval'
            : 'generic_metrics_only';
    return {
      disposition: 'processed_and_aggregated',
      parserExecuted: true,
      datasetType: record.analysis?.datasetType || null,
      rowsEnteredAdapter: record.rowCount ?? null,
      evidenceDepth,
      evidenceDepthCounts: {
        formalPerformancePointCount,
        descriptiveCandidateCount,
        dynamicEventCount,
        durabilityPointCount,
        genericMetricCount: Array.isArray(analysis.metricNames) ? analysis.metricNames.length : 0
      },
      fieldUsage: record.analysis?.fieldUsage || null,
      metadataUsage: record.analysis?.metadataUsage || null,
      workbookEvidenceSummary: record.analysis?.workbookEvidenceSummary || null,
      metricNames: record.analysis?.metricNames || [],
      evidenceSurfaces: ['sha256_provenance', 'configured_parser', 'enterprise_adapter', 'field_coverage', 'package_aggregation', ...(record.analysis?.dynamicAnalysis?.enabled ? ['dynamic_event_analysis'] : []), ...(record.analysis?.workbookEvidenceSummary ? ['workbook_sheet_audit', 'workbook_static_matrix', 'workbook_report_evidence', 'workbook_formula_audit'] : [])],
      referenceAudit: { required: false, joinKey: record.path, boundary: '原始时序文件不进入独立参考内容审计。' },
      formalConformityClaim: false,
      boundary: '已进入解析器、企业适配器和包级汇总；不代表每个字段都形成 KPI，也不代表标准符合。'
    };
  }
  if (record.status === 'reference_only') {
    return {
      disposition: 'reference_boundary_only',
      evidenceDepth: 'reference_boundary',
      parserExecuted: false,
      datasetType: null,
      rowsEnteredAdapter: 0,
      fieldUsage: null,
      metricNames: [],
      evidenceSurfaces: ['sha256_provenance', 'reference_inventory', 'requirements_or_standard_mapping'],
      referenceAudit: { required: true, joinKey: record.path, expectedStatus: 'extracted_reference', boundary: '由独立 t02-reference-audit 使用 pdftotext/pandoc 提取并核对声明关键词；不进入原始时序适配器。' },
      formalConformityClaim: false,
      boundary: record.referenceUseBoundary || '只用于需求/标准边界映射，不进入原始时序 KPI。'
    };
  }
  if (record.status === 'blocked_binary') {
    return {
      disposition: 'blocked_binary_boundary',
      evidenceDepth: 'reference_boundary',
      parserExecuted: false,
      datasetType: null,
      rowsEnteredAdapter: 0,
      fieldUsage: null,
      metricNames: [],
      evidenceSurfaces: ['sha256_provenance', 'binary_detection', 'blocked_input_log'],
      referenceAudit: { required: false, joinKey: record.path, boundary: '二进制原始导出不进入参考内容审计，等待企业格式或解码器。' },
      formalConformityClaim: false,
      boundary: '保留文件哈希和阻断原因；未伪造文本解析或测试结论。'
    };
  }
  if (record.status === 'declared_no_upload') {
    return {
      disposition: 'declared_no_upload_boundary',
      evidenceDepth: 'reference_boundary',
      parserExecuted: false,
      datasetType: null,
      rowsEnteredAdapter: 0,
      fieldUsage: null,
      metricNames: [],
      evidenceSurfaces: ['sha256_provenance', 'no_upload_declaration'],
      referenceAudit: { required: true, joinKey: record.path, expectedStatus: 'extracted_reference', boundary: '说明文件本身由独立 t02-reference-audit 提取为未上传边界证据，但不作为测试数据。' },
      formalConformityClaim: false,
      boundary: '企业说明声明暂无实际资料文件；不把声明文件当作测试数据。'
    };
  }
  return {
    disposition: `${record.status || 'unknown'}_boundary`,
    evidenceDepth: 'reference_boundary',
    parserExecuted: false,
    datasetType: null,
    rowsEnteredAdapter: record.rowCount ?? 0,
    fieldUsage: null,
    metricNames: [],
    evidenceSurfaces: ['sha256_provenance', 'parser_status_log'],
    referenceAudit: { required: false, joinKey: record.path, boundary: '当前状态未形成独立参考内容审计。' },
    formalConformityClaim: false,
    boundary: record.note || '当前状态未形成结构化测试结论。'
  };
};

const auditFile = async (path, sample, extension, inputIndex) => {
  const rel = relative(inputRoot, path);
  const name = basename(path);
  if (rel.startsWith('企业资料包04_') && name === '00_企业资料说明.pdf') {
    return { status: 'declared_no_upload', parser: '说明文件审计', note: '企业说明明确暂无实际资料文件', referenceKind: 'no_upload_statement' };
  }
  if (extension === '.pdf') {
    return { status: 'reference_only', parser: 'PDF reference inventory', note: '说明/技术参考资料；未将 PDF 内容冒充为结构化测试数据', referenceKind: referenceKind(rel, name), referenceUseBoundary: '进入 T02 需求/标准边界人工映射，不进入原始时序 KPI' };
  }
  if (extension === '.docx' && !rel.includes('01_耐久原始数据处理')) {
    return { status: 'reference_only', parser: 'DOCX requirement/reference reader', note: '需求或任务说明，不作为原始时序行分析', referenceKind: referenceKind(rel, name), referenceUseBoundary: '进入 T02 需求矩阵人工映射，不进入原始时序 KPI' };
  }
  const bytes = await readFile(path);
  if (extension === '.csv' || extension === '.txt' || extension === '.tsv') {
    const encoding = extension === '.csv' ? 'utf-8' : 'gb18030';
    const decoded = decodeTextBuffer(bytes, encoding);
    if (decoded.binary) {
      return { status: 'blocked_binary', parser: 'GB18030/TSV 识别器', binaryReason: decoded.binaryReason || 'unknown', note: `样本包含二进制/不可按当前文本合同解析（${decoded.binaryReason || 'unknown'}）` };
    }
    const text = decoded.text;
    const rows = parseCSV(text || '');
    const dataset = analyzeEnterpriseRows(rows, analysisConfigForPath(path));
    const parserEncoding = decoded.encoding.toUpperCase();
    if (!rows.length) return { status: 'parser_error', parser: `${parserEncoding} text parser`, note: '文本解析后没有数据行', rowCount: 0, columnCount: 0 };
    if (!dataset) return { status: 'parsed_unmapped', parser: `${parserEncoding} text → enterprise adapter`, note: '文本有数据行，但没有命中车辆/电堆结构化适配器', rowCount: rows.length, columnCount: new Set(rows.flatMap((row) => Object.keys(row))).size };
    return {
      status: 'processed',
      parser: `${parserEncoding} text → enterprise adapter → ${dataset.datasetType}`,
      note: '真实解析并进入企业数据适配器与结构化分析入口',
      rowCount: rows.length,
      columnCount: new Set(rows.flatMap((row) => Object.keys(row))).size,
      analysis: analysisSummary(dataset),
      batchContribution: batchContribution(dataset)
    };
  }
  if (extension === '.xlsx' || extension === '.xlsm') {
    const parsed = parseDataWorkbook(bytes);
    if (!parsed.ok) return { status: 'reference_only', parser: 'XLSX data-sheet selector', note: '未命中原始时序工作表；保留为参考/参数资料', sheetNames: parsed.sheetNames || [], errors: parsed.errors || [] };
    const workbookEvidenceSummary = parsed.workbookEvidenceSummary || summarizeWorkbookEvidence(parsed.workbookEvidence);
    const dataset = analyzeEnterpriseRows(parsed.rows, { ...analysisConfigForPath(path), workbookEvidence: parsed.workbookEvidence || null });
    const contribution = batchContribution(dataset || { source: { rowCount: parsed.rows.length }, schema: { mapping: {} }, metrics: { sampleCount: parsed.rows.length }, dataset: {}, metricNames: [] });
    contribution.workbookEvidenceSummary = workbookEvidenceSummary;
    return {
      status: dataset ? 'processed' : 'parsed_unmapped',
      parser: `XLSX data-sheet selector → ${dataset?.datasetType || 'enterprise adapter'}`,
      note: dataset ? '真实选择时序工作表并进入结构化分析入口' : '已读取时序工作表，但未命中车辆/电堆结构化适配器',
      sheetNames: parsed.sheetNames,
      sheetName: parsed.sheetName,
      rowCount: parsed.rows.length,
      columnCount: new Set(parsed.rows.flatMap((row) => Object.keys(row))).size,
      analysis: { ...analysisSummary(dataset), workbookEvidenceSummary }
      ,batchContribution: contribution
    };
  }
  if (extension === '.docx') {
    await ensureDocxEngine();
    const report = await parseDurabilityDocx(bytes);
    const metadata = report.metadata || {};
    const fieldUsage = durabilityFieldUsage(report);
    const metricNames = ['targetPowerKw', 'humidityPct', 'temperatureC', 'netPowerKw', 'stackCurrentA', 'averageCellVoltageMv', 'averageDeviationMv', 'compressorPowerKw', 'pumpPowerKw', 'coolantInTempC', 'coolantOutTempC', 'hfr', 'lfr', 'voltageVariance'];
    const metadataUsage = {
      sourceFieldCount: Object.keys(metadata).length,
      fields: Object.keys(metadata).sort(),
      boundary: '耐久报告元数据仅用于测试方案、时间、型号和原始结果的追溯摘要，不作为时序 KPI 或标准限值。'
    };
    return {
      status: report.points.length ? 'processed' : 'parser_error',
      parser: 'DOCX → durability adapter',
      note: report.points.length ? '真实解析耐久功率点和原始报告元数据' : '耐久文档没有有效功率点',
      rowCount: report.points.length,
      tableCount: report.source?.tableCount ?? null,
      analysis: report.points.length ? { datasetType: 'durability', targetPowerCount: new Set(report.points.map((point) => point.target_power_kw)).size, metricNames, fieldUsage, metadataUsage } : null
      ,batchContribution: report.points.length ? batchContribution({ datasetType: 'durability', source: { rowCount: report.points.length }, dataset: { points: report.points, targetPowers: [...new Set(report.points.map((point) => point.target_power_kw).filter((value) => value !== null))] }, metrics: { sampleCount: report.points.length }, metricNames, schema: { mapping: {} }, fieldUsage, metadataUsage }) : null
      ,reportSummary: report.points.length ? {
        inputIndex,
        testPlan: metadata.测试方案 || null,
        startTime: metadata.开始时间 || null,
        endTime: metadata.结束时间 || null,
        testResult: metadata.测试结果 || null,
        systemName: metadata.系统名称 || null,
        stackModel: metadata.电堆型号 || null,
        stepCount: Number.isFinite(Number(metadata.工步数量)) ? Number(metadata.工步数量) : null,
        pointCount: report.points.length,
        headers: report.headers || [],
        targetPowersKw: [...new Set(report.points.map((point) => point.target_power_kw).filter((value) => value !== null))].sort((a, b) => a - b),
        powerPointSummary: [...report.points.reduce((groups, point) => {
          const power = Number(point.target_power_kw);
          if (!Number.isFinite(power)) return groups;
          const points = groups.get(power) || [];
          points.push(point);
          groups.set(power, points);
          return groups;
        }, new Map())].sort(([a], [b]) => a - b).map(([targetPowerKw, points]) => {
          const average = (field) => {
            const values = points.map((point) => Number(point[field])).filter(Number.isFinite);
            return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
          };
          return { targetPowerKw, pointCountInReport: points.length, averageCellVoltageMv: average('average_cell_voltage_mv'), averageDeviationMv: average('average_deviation_mv'), netPowerKw: average('net_power_kw'), voltageVariance: average('voltage_variance') };
        })
      } : null
    };
  }
  return { status: 'reference_only', parser: 'file inventory', note: '未配置该扩展名的原始数据解析器' };
};

const files = await fileEntries(inputRoot);
const records = [];
const progressEvery = Math.max(1, Number.parseInt(process.env.T02_AUDIT_PROGRESS_EVERY || '25', 10) || 25);
const auditStartedAt = Date.now();
console.error(`[t02:coverage] scanning ${files.length} files; progress every ${progressEvery}`);
for (const [inputIndex, path] of files.entries()) {
  const metadata = await stat(path);
  const { sha256, bytes, sample } = await hashAndSample(path);
  const extension = extname(path).toLowerCase();
  const sampleStats = ['.csv', '.txt', '.tsv'].includes(extension) ? firstLineStats(sample, extension) : { binary: false, rows: null, columns: null, encoding: 'container/document' };
  let classification;
  try {
    classification = await auditFile(path, sample, extension, inputIndex);
  } catch (error) {
    classification = {
      status: 'parser_error',
      parser: 'configured parser',
      note: `解析器异常：${error.message}`,
      error: error.message
    };
  }
  const rowCount = classification.rowCount ?? (['.csv', '.txt', '.tsv'].includes(extension) ? await countTextRows(path, sampleStats.binary) : null);
  const record = {
    path: relative(inputRoot, path),
    package: packageName(path),
    extension: extension || '(none)',
    bytes,
    sha256,
    parser: classification.parser,
    status: classification.status,
    note: classification.note,
    rowCount,
    columnCount: classification.columnCount ?? sampleStats.columns,
    encoding: sampleStats.encoding,
    ...classification
  };
  record.usageLedger = usageLedger(record);
  records.push(record);
  if ((inputIndex + 1) % progressEvery === 0 || inputIndex + 1 === files.length) {
    const elapsedS = ((Date.now() - auditStartedAt) / 1000).toFixed(1);
    console.error(`[t02:coverage] ${inputIndex + 1}/${files.length} files complete (${elapsedS}s)`);
  }
}

const counts = Object.fromEntries([...new Set(records.map((record) => record.status))].sort().map((status) => [status, records.filter((record) => record.status === status).length]));
const evidenceDepthCounts = Object.fromEntries([...new Set(records.map((record) => record.usageLedger?.evidenceDepth || 'unknown'))].sort().map((depth) => [depth, records.filter((record) => (record.usageLedger?.evidenceDepth || 'unknown') === depth).length]));
const packageCounts = Object.fromEntries([...new Set(records.map((record) => record.package))].sort().map((name) => [name, Object.fromEntries([...new Set(records.map((record) => record.status))].sort().map((status) => [status, records.filter((record) => record.package === name && record.status === status).length]))]));
const processedRecords = records.filter((record) => record.status === 'processed' && record.batchContribution);
const duplicateHashes = Object.entries(processedRecords.reduce((accumulator, record) => {
  accumulator[record.sha256] = [...(accumulator[record.sha256] || []), record.path];
  return accumulator;
}, {})).filter(([, paths]) => paths.length > 1).map(([sha256, paths]) => ({ sha256, paths }));
  const batchAggregation = Object.fromEntries([...new Set(processedRecords.map((record) => record.package))].sort().map((packageName) => {
  const packageRecords = processedRecords.filter((record) => record.package === packageName);
  const contributions = packageRecords.map((record) => record.batchContribution);
  const workbookEvidenceRecords = contributions.map((item) => item.workbookEvidenceSummary).filter(Boolean);
  const workbookRoleCounts = {};
  for (const summary of workbookEvidenceRecords) for (const [role, count] of Object.entries(summary.roleCounts || {})) workbookRoleCounts[role] = (workbookRoleCounts[role] || 0) + count;
  const mappedFields = [...new Set(contributions.flatMap((item) => item.mappedFieldNames))].sort();
  const catalogOnlySignals = [...new Set(contributions.flatMap((item) => item.catalogOnlySignals))].sort();
  const datasetTypes = [...new Set(contributions.map((item) => item.datasetType))].sort();
  const statusCounts = Object.fromEntries([...new Set(packageRecords.map((record) => record.status))].map((status) => [status, packageRecords.filter((record) => record.status === status).length]));
  const packageEvidenceDepthCounts = Object.fromEntries([...new Set(packageRecords.map((record) => record.usageLedger?.evidenceDepth || 'unknown'))].sort().map((depth) => [depth, packageRecords.filter((record) => (record.usageLedger?.evidenceDepth || 'unknown') === depth).length]));
  const vehicle = contributions.filter((item) => item.vehicle);
  const stack = contributions.filter((item) => item.stack);
  const durability = contributions.filter((item) => item.durability);
    const durabilityRecords = packageRecords.filter((record) => record.reportSummary);
    const fieldUsageByRole = {};
    for (const item of contributions.filter((contribution) => contribution.datasetType !== 'durability')) {
      for (const [role, fields] of Object.entries(item.fieldUsage?.byRole || {})) fieldUsageByRole[role] = [...new Set([...(fieldUsageByRole[role] || []), ...fields].filter((field) => String(field ?? '').trim()))];
    }
    for (const role of Object.keys(fieldUsageByRole)) fieldUsageByRole[role].sort();
    const fieldRoleMembership = new Map();
    for (const [role, fields] of Object.entries(fieldUsageByRole)) {
      for (const field of fields) fieldRoleMembership.set(field, [...(fieldRoleMembership.get(field) || []), role]);
    }
    const fieldUnion = [...new Set(Object.values(fieldUsageByRole).flat())].sort();
    const unclassifiedSourceFields = fieldRoleMembership.has('unclassified') ? fieldUsageByRole.unclassified : [];
    const overlappingSourceFields = fieldUnion.filter((field) => (fieldRoleMembership.get(field) || []).length > 1);
    const durabilityFieldUsageByRole = {};
    for (const item of contributions.filter((contribution) => contribution.datasetType === 'durability')) {
      for (const [role, fields] of Object.entries(item.fieldUsage?.byRole || {})) durabilityFieldUsageByRole[role] = [...new Set([...(durabilityFieldUsageByRole[role] || []), ...fields].filter((field) => String(field ?? '').trim()))];
    }
    for (const role of Object.keys(durabilityFieldUsageByRole)) durabilityFieldUsageByRole[role].sort();
    const durabilityMetadataFieldUnion = [...new Set(contributions.filter((contribution) => contribution.datasetType === 'durability').flatMap((item) => item.metadataUsage?.fields || []))].sort();
  const stateCounts = {};
  for (const item of vehicle) for (const [state, count] of Object.entries(item.vehicle.stateCounts)) stateCounts[state] = (stateCounts[state] || 0) + count;
  const dynamicRecords = vehicle.map((item) => item.vehicle.dynamicAnalysis).filter(Boolean);
  const dynamicAnalysis = dynamicRecords.length ? {
    fileCount: dynamicRecords.length,
    enabledFileCount: dynamicRecords.filter((item) => item.enabled).length,
    calculatedFileCount: dynamicRecords.filter((item) => item.status === 'calculated').length,
    noEventFileCount: dynamicRecords.filter((item) => item.status === 'no_events').length,
    unavailableFileCount: dynamicRecords.filter((item) => item.status === 'not_available').length,
    sampleCount: dynamicRecords.reduce((sum, item) => sum + (item.sampleCount || 0), 0),
    commandSampleCount: dynamicRecords.reduce((sum, item) => sum + (item.commandSampleCount || 0), 0),
    actualSampleCount: dynamicRecords.reduce((sum, item) => sum + (item.actualSampleCount || 0), 0),
    eventCount: dynamicRecords.reduce((sum, item) => sum + (item.eventCount || 0), 0),
    settledEventCount: dynamicRecords.reduce((sum, item) => sum + (item.settledEventCount || 0), 0),
    unsettledEventCount: dynamicRecords.reduce((sum, item) => sum + (item.unsettledEventCount || 0), 0),
    dataGapCount: dynamicRecords.reduce((sum, item) => sum + (item.dataGapCount || 0), 0),
    maximumIntervalS: Math.max(...dynamicRecords.map((item) => item.maximumIntervalS || 0)),
    commandField: [...new Set(dynamicRecords.map((item) => item.commandField).filter(Boolean))].sort(),
    actualField: [...new Set(dynamicRecords.map((item) => item.actualField).filter(Boolean))].sort(),
    actualPowerField: [...new Set(dynamicRecords.map((item) => item.actualPowerField).filter(Boolean))].sort(),
    boundary: '按源文件/会话分别计算设定变化和实测响应的描述性指标；不跨文件拼接，不含标准限值，不执行合格/不合格判定。'
  } : null;
  return [packageName, {
    processedFileCount: packageRecords.length,
    processedRowCount: contributions.reduce((sum, item) => sum + item.rowCount, 0),
    datasetTypes,
    statusCounts,
    evidenceDepthCounts: packageEvidenceDepthCounts,
    mappedFieldUnion: mappedFields,
    catalogOnlySignalUnion: catalogOnlySignals,
    metricUnion: [...new Set(contributions.flatMap((item) => item.metricNames))].sort(),
    workbookEvidence: workbookEvidenceRecords.length ? {
      fileCount: workbookEvidenceRecords.length,
      sheetCount: workbookEvidenceRecords.reduce((sum, item) => sum + (item.sheetCount || 0), 0),
      parsedSheetCount: workbookEvidenceRecords.reduce((sum, item) => sum + (item.parsedSheetCount || 0), 0),
      roleCounts: workbookRoleCounts,
      selectedTimeSeriesSheets: [...new Set(workbookEvidenceRecords.map((item) => item.selectedTimeSeriesSheet).filter(Boolean))].sort(),
      staticMatrixCount: workbookEvidenceRecords.reduce((sum, item) => sum + (item.staticMatrixCount || 0), 0),
      staticMatrixCellCount: workbookEvidenceRecords.reduce((sum, item) => sum + (item.staticMatrixCellCount || 0), 0),
      staticMatrixValidPointCount: workbookEvidenceRecords.reduce((sum, item) => sum + (item.staticMatrixValidPointCount || 0), 0),
      staticMatrixMissingPointCount: workbookEvidenceRecords.reduce((sum, item) => sum + (item.staticMatrixMissingPointCount || 0), 0),
      reportEvidenceSheetCount: workbookEvidenceRecords.reduce((sum, item) => sum + (item.reportEvidenceSheetCount || 0), 0),
      reportPerformanceCheckCount: workbookEvidenceRecords.reduce((sum, item) => sum + (item.reportPerformanceCheckCount || 0), 0),
      reportPolarizationPointCount: workbookEvidenceRecords.reduce((sum, item) => sum + (item.reportPolarizationPointCount || 0), 0),
      reportStabilityPointCount: workbookEvidenceRecords.reduce((sum, item) => sum + (item.reportStabilityPointCount || 0), 0),
      deviceIdentityFieldCount: workbookEvidenceRecords.reduce((sum, item) => sum + (item.deviceIdentityFieldCount || 0), 0),
      parameterCatalogRowCount: workbookEvidenceRecords.reduce((sum, item) => sum + (item.parameterCatalogRowCount || 0), 0),
      parameterCatalogProductColumnCount: workbookEvidenceRecords.reduce((sum, item) => sum + (item.parameterCatalogProductColumnCount || 0), 0),
      formulaCellCount: workbookEvidenceRecords.reduce((sum, item) => sum + (item.formulaCellCount || 0), 0),
      formulaSheetCount: workbookEvidenceRecords.reduce((sum, item) => sum + (item.formulaSheetCount || 0), 0),
      cachedFormulaCellCount: workbookEvidenceRecords.reduce((sum, item) => sum + (item.cachedFormulaCellCount || 0), 0),
      uncachedFormulaCellCount: workbookEvidenceRecords.reduce((sum, item) => sum + (item.uncachedFormulaCellCount || 0), 0),
      formulaExternalReferenceCount: workbookEvidenceRecords.reduce((sum, item) => sum + (item.formulaExternalReferenceCount || 0), 0),
      formulaExternalFunctionCount: workbookEvidenceRecords.reduce((sum, item) => sum + (item.formulaExternalFunctionCount || 0), 0),
      formulaVolatileCount: workbookEvidenceRecords.reduce((sum, item) => sum + (item.formulaVolatileCount || 0), 0),
      formulaReviewStatus: workbookEvidenceRecords.some((item) => item.formulaReviewStatus === 'blocked_active_content') ? 'blocked_active_content' : workbookEvidenceRecords.some((item) => item.formulaReviewStatus === 'review_required') ? 'review_required' : 'no_formulas',
      macroPresent: workbookEvidenceRecords.some((item) => item.macroPresent === true),
      externalLinksPresent: workbookEvidenceRecords.some((item) => item.externalLinksPresent === true),
      activeContentPresent: workbookEvidenceRecords.some((item) => item.activeContentPresent === true),
      boundary: '包级工作簿证据只汇总工作表角色、静态矩阵数量和报告/目录摘要；不把目录或原始报告结果升级为正式标准符合性。'
    } : null,
    fieldUsage: {
      roleCounts: Object.fromEntries(Object.entries(fieldUsageByRole).map(([role, fields]) => [role, fields.length])),
      byRole: fieldUsageByRole,
      sourceFieldCount: fieldUnion.length,
      roleUnionCount: fieldUnion.length,
      unclassifiedSourceFieldCount: unclassifiedSourceFields.length,
      unclassifiedSourceFields,
      overlappingSourceFieldCount: overlappingSourceFields.length,
      overlappingSourceFields,
      boundary: '每个源字段必须进入 analysis_input、context_or_cross_check 或 catalog_only；未分类和多角色冲突字段不计为完整覆盖。'
    },
    fieldValueDiagnostics: aggregateFieldValueDiagnostics(contributions),
    durabilityFieldUsage: {
      roleCounts: Object.fromEntries(Object.entries(durabilityFieldUsageByRole).map(([role, fields]) => [role, fields.length])),
      byRole: durabilityFieldUsageByRole,
      sourceFieldCount: Object.values(durabilityFieldUsageByRole).reduce((sum, fields) => sum + fields.length, 0),
      metadataFieldUnion: durabilityMetadataFieldUnion
    },
    businessAggregation: {
      vehicle: vehicle.length ? { fileCount: vehicle.length, rowCount: vehicle.reduce((sum, item) => sum + item.rowCount, 0), stateCounts, insulationPointCount: vehicle.reduce((sum, item) => sum + item.vehicle.insulationPointCount, 0), performancePointCount: vehicle.reduce((sum, item) => sum + item.vehicle.performancePointCount, 0), descriptiveCandidateCount: vehicle.reduce((sum, item) => sum + item.vehicle.descriptiveCandidateCount, 0), descriptiveOnlyFileCount: vehicle.filter((item) => item.vehicle.descriptiveOnly).length, dynamicAnalysis } : null,
      stack: stack.length ? { fileCount: stack.length, rowCount: stack.reduce((sum, item) => sum + item.rowCount, 0), signalCount: Math.max(...stack.map((item) => item.stack.signalCount)), cellChannelCount: Math.max(...stack.map((item) => item.stack.cellChannelCount)), stableSegmentCount: stack.reduce((sum, item) => sum + item.stack.stableSegmentCount, 0), performancePointCount: stack.reduce((sum, item) => sum + item.stack.performancePointCount, 0), descriptiveCandidateCount: stack.reduce((sum, item) => sum + item.stack.descriptiveCandidateCount, 0), descriptiveOnlyFileCount: stack.filter((item) => item.stack.descriptiveOnly).length, peakPowerKwMax: Math.max(...stack.map((item) => item.stack.peakPowerKw ?? 0)) } : null,
      durability: durability.length ? { fileCount: durability.length, pointCount: durability.reduce((sum, item) => sum + item.durability.pointCount, 0), targetPowersKw: [...new Set(durability.flatMap((item) => item.durability.targetPowersKw))].sort((a, b) => a - b), crossReportDescriptiveSummary: crossReportDurabilitySummary(durabilityRecords) } : null
    },
    closure: {
      perFileParserCoverage: true,
      packageLevelRowAndFieldAggregation: true,
      crossFileTimeSeriesKpiMerge: false,
      declaredBatchAggregation: { status: 'not_provided', declarationVersion: 'h2-testlens.batch-declaration.v1', requires: ['testRunId', 'sessionGroup', 'fileOrder', 'clockReference', 'samplingFrequencyHz_or_samplingIntervalS', 'restartBoundaries'], boundary: '当前 T02 原始资料未提供企业批次声明；不自动把不同文件合并成连续时序。' },
      descriptiveCandidateIntervals: true,
      crossReportDurabilityTrend: false,
      crossReportDurabilityDescriptiveSummary: Boolean(crossReportDurabilitySummary(durabilityRecords)),
      crossReportDurabilityComparabilityAudit: Boolean(crossReportDurabilitySummary(durabilityRecords)?.comparabilityAudit),
      enterpriseAcceptanceParallelValidation: false
    }
  }];
}));
const summary = {
  audit: 'T02 actual parser coverage audit',
  auditVersion: packageVersion,
  root: 'T02_SOURCE_ROOT',
  sourceRootLabel: 'T02_SOURCE_ROOT',
  pathDisclosure: 'redacted',
  rawDataCopiedIntoRepository: false,
  processedDefinition: '文件已由配置的文本/XLSX/DOCX 解析器读取，并进入对应企业数据适配器或耐久结构化入口；不代表每个字段都参与 KPI，也不代表标准符合性。',
  totalFiles: records.length,
  counts,
  packageCounts,
  duplicateProcessedHashes: duplicateHashes,
  batchAggregation,
  referenceSummary: {
    referenceOnlyCount: records.filter((record) => record.status === 'reference_only').length,
    blockedBinaryCount: records.filter((record) => record.status === 'blocked_binary').length,
    declaredNoUploadCount: records.filter((record) => record.status === 'declared_no_upload').length,
    referenceKinds: Object.fromEntries([...new Set(records.filter((record) => record.referenceKind).map((record) => record.referenceKind))].sort().map((kind) => [kind, records.filter((record) => record.referenceKind === kind).length])),
    boundary: '参考资料用于需求/标准边界人工映射；blocked_binary 文件保留哈希和阻断原因，未伪造解析结果。'
  },
  utilization: {
    ledgerVersion: '1',
    totalRecords: records.length,
    recordsWithUsageLedger: records.filter((record) => record.usageLedger && record.usageLedger.disposition).length,
    dispositionCounts: Object.fromEntries([...new Set(records.map((record) => record.usageLedger?.disposition || 'missing'))].sort().map((disposition) => [disposition, records.filter((record) => (record.usageLedger?.disposition || 'missing') === disposition).length])),
    processedRowsEnteredAdapters: records.filter((record) => record.status === 'processed').reduce((sum, record) => sum + (record.usageLedger?.rowsEnteredAdapter || 0), 0),
    evidenceDepthCounts,
    formalConformityClaims: records.filter((record) => record.usageLedger?.formalConformityClaim === true).length,
    boundary: '每个文件都必须有使用台账；处理、参考、阻断和未上传状态分别保留用途与边界，不把“已处理”扩大解释为“已满足标准”。'
  },
    fieldValueDiagnostics: aggregateFieldValueDiagnostics(processedRecords.map((record) => record.batchContribution)),
  records: records.map(({ batchContribution: _batchContribution, ...record }) => record)
};
const serialized = JSON.stringify(normalizeNumbers(summary), null, 2);
const outputPath = resolve(process.argv[3] || `${repoRoot}/.research/ignite_t02_standards_20260821/t02_coverage_audit_v${packageVersion}.json`);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${serialized}\n`, 'utf8');
const currentAuditName = `t02_coverage_audit_v${packageVersion}.json`;
if (basename(outputPath) === currentAuditName) {
  const blockedReasons = records.filter((record) => record.status === 'blocked_binary').map((record) => record.binaryReason || 'unknown');
  const coverageSummary = `${JSON.stringify({
    schemaVersion: 'h2-testlens.t02-coverage-summary.v1',
    auditVersion: packageVersion,
    totalFiles: records.length,
    counts: summary.counts,
    processedRowsEnteredAdapters: summary.utilization.processedRowsEnteredAdapters,
    formalConformityClaims: summary.utilization.formalConformityClaims,
    fieldDiagnostics: {
      filesWithDiagnostics: summary.fieldValueDiagnostics.filesWithDiagnostics,
      reviewSignalFileCount: summary.fieldValueDiagnostics.reviewSignalFileCount,
      reviewSignalOccurrenceCount: summary.fieldValueDiagnostics.reviewSignalOccurrenceCount,
      negativeSignalFileCount: summary.fieldValueDiagnostics.negativeSignalFileCount,
      zeroDominantSignalFileCount: summary.fieldValueDiagnostics.zeroDominantSignalFileCount,
      constantSignalFileCount: summary.fieldValueDiagnostics.constantSignalFileCount,
      topObservedReviewFields: summary.fieldValueDiagnostics.topObservedReviewFields.slice(0, 8),
      boundary: summary.fieldValueDiagnostics.boundary
    },
    evidenceDepthCounts: summary.utilization.evidenceDepthCounts,
    blockedReasons,
    boundary: summary.utilization.boundary
  }, null, 2)}\n`;
  await writeFile(`${repoRoot}/config/t02-coverage-summary.json`, coverageSummary, 'utf8');
  await writeFile(`${repoRoot}/public/config/t02-coverage-summary.json`, coverageSummary, 'utf8');
}
console.log(JSON.stringify({ outputPath, auditVersion: packageVersion, totalFiles: records.length, processedRowsEnteredAdapters: summary.utilization.processedRowsEnteredAdapters }, null, 2));
