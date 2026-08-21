import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzeRows, parseCSV, publicAnalysis, reportMarkdown } from '../src/analyzer.mjs';
import { generateDraft, validateRemoteDraft } from '../src/ai-draft.mjs';
import { compareResults } from '../src/compare.mjs';
import { getProfile, profilesFromPackage } from '../src/profiles.mjs';
import { appendHistory, clearHistory, readHistory } from '../src/history.mjs';
import { sha256Hex } from '../src/provenance.mjs';
import * as SheetJS from 'xlsx';
import { buildEnterpriseWorkbook, parseParameterWorkbook, setSpreadsheetEngine, workbookArrayBuffer } from '../src/excel-workflow.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const csv = await readFile(join(here, '../sample-data/test_run_001.csv'), 'utf8');
const baselineCsv = await readFile(join(here, '../sample-data/test_run_baseline.csv'), 'utf8');
setSpreadsheetEngine(SheetJS);

test('parses the demo CSV into records', () => {
  const rows = parseCSV(csv);
  assert.equal(rows.length, 25);
  assert.equal(rows[0].phase, 'idle');
  assert.equal(rows.at(-1).timestamp_s, '120');
});

test('computes a deterministic SHA-256 provenance hash without uploading content', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('integrates hydrogen volume and electrical energy from timestamped flow data', () => {
  const result = analyzeRows(parseCSV(baselineCsv));
  assert.ok(result.metrics.hydrogenVolumeNl > 0);
  assert.ok(result.metrics.energyConsumedWh > 0);
  assert.ok(result.metrics.specificEnergyKWhPerNm3 > 0);
  assert.equal(result.metrics.minimumHydrogenPurityPct, null);
});

test('detects pressure and leak risks and preserves traceable evidence', () => {
  const result = analyzeRows(parseCSV(csv));
  assert.equal(result.verdict, 'FAIL');
  assert.ok(result.metrics.peakPressureBar > 30);
  assert.ok(result.metrics.peakLeakPpm > 10);
  assert.ok(result.metrics.peakPressureAtS.includes(75));
  assert.ok(result.metrics.peakLeakAtS.includes(90));
  assert.ok(result.issues.some((item) => item.code === 'PRESSURE_HIGH'));
  assert.ok(result.issues.some((item) => item.code === 'LEAK_HIGH'));
  assert.ok(result.issues.find((item) => item.code === 'PRESSURE_HIGH').evidence.includes('t=75 s'));
  assert.ok(result.phases.some((phase) => phase.phase === 'steady'));
});

test('custom thresholds can turn the same run into a warning', () => {
  const result = analyzeRows(parseCSV(csv), { maxPressureBar: 32, maxLeakPpm: 15 });
  assert.equal(result.verdict, 'WARN');
  assert.ok(result.issues.some((item) => item.code === 'PRESSURE_DRIFT'));
});

test('report contains verdict, metrics, and recommendations', () => {
  const markdown = reportMarkdown(analyzeRows(parseCSV(csv)), 'demo.csv');
  assert.match(markdown, /自动判定/);
  assert.match(markdown, /峰值泄漏监测/);
  assert.match(markdown, /建议/);
  assert.match(reportMarkdown(analyzeRows(parseCSV(csv)), 'ai-demo.csv', { aiDraft: { mode: 'local-evidence', fallbackReason: 'no_endpoint_configured', draft: 'AI 草稿内容' } }), /AI 草稿内容/);
  assert.match(markdown, /测试流程完成度/);
  assert.match(markdown, /导入企业批准的 profile/);
  assert.match(markdown, /性能测量摘要/);
});

test('fails closed on missing schema instead of returning a false pass', () => {
  const result = analyzeRows([{ timestamp_s: '0', current_a: '1' }]);
  assert.equal(result.verdict, 'FAIL');
  assert.ok(result.issues.some((item) => item.code === 'SCHEMA_MISSING'));
  assert.ok(result.issues.some((item) => item.code === 'DATA_TOO_SHORT'));
});

test('uses valid steady rows without index-shifting around a missing voltage', () => {
  const rows = [
    { timestamp_s: '0', phase: 'steady', current_a: '5', voltage_v: '1.8', temperature_c: '30', pressure_bar: '10', flow_slpm: '3', leak_ppm: '1' },
    { timestamp_s: '1', phase: 'steady', current_a: '5', voltage_v: '', temperature_c: '30', pressure_bar: '10', flow_slpm: '3', leak_ppm: '1' },
    { timestamp_s: '2', phase: 'steady', current_a: '5', voltage_v: '1.9', temperature_c: '30', pressure_bar: '10', flow_slpm: '3', leak_ppm: '1' }
  ];
  const result = analyzeRows(rows);
  assert.equal(result.metrics.steadySampleCount, 3);
  assert.equal(result.metrics.steadyVoltageMeanV, 1.85);
});

test('AI draft defaults to local evidence mode and does not include raw rows', async () => {
  const result = analyzeRows(parseCSV(csv));
  const draft = await generateDraft(result, { endpoint: '' });
  assert.equal(draft.mode, 'local-evidence');
  assert.match(draft.draft, /结构化证据/);
  assert.equal('rows' in draft.evidence, false);
});

test('remote AI adapter receives structured evidence only', async () => {
  const result = analyzeRows(parseCSV(csv), { requiredMetadata: ['operator'], testMetadata: { operator: 'operator-secret-name' } });
  let request;
  const draft = await generateDraft(result, {
    endpoint: 'http://model.test/v1/chat/completions',
    apiKey: 'test-key',
    model: 'test-model',
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '基于证据的草稿：当前判定 FAIL，峰值压力 31.2 bar。' } }] }) };
    }
  });
  assert.equal(draft.mode, 'remote-llm');
  assert.match(draft.draft, /当前判定 FAIL/);
  const evidence = JSON.parse(request.messages[1].content);
  assert.equal('rows' in evidence, false);
  assert.equal('testMetadata' in evidence.thresholds, false);
  assert.equal(evidence.thresholds.metadataPresent.operator, true);
  assert.equal(request.messages[1].content.includes('operator-secret-name'), false);
});

test('remote AI output fails closed when it conflicts with verdict or lacks evidence anchors', async () => {
  const result = analyzeRows(parseCSV(csv));
  assert.deepEqual(validateRemoteDraft('当前判定 PASS，峰值压力 31.2 bar。', result), { ok: false, reason: 'grounding_verdict_conflict' });
  assert.deepEqual(validateRemoteDraft('一段没有判定和指标的泛泛而谈。', result), { ok: false, reason: 'grounding_verdict_missing' });
  const fallback = await generateDraft(result, {
    endpoint: 'http://model.test/v1/chat/completions',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '当前判定 PASS，峰值压力 31.2 bar。' } }] }) })
  });
  assert.equal(fallback.mode, 'local-evidence');
  assert.equal(fallback.fallbackReason, 'grounding_verdict_conflict');
});

test('maps Chinese headers and converts common engineering units', () => {
  const legacyRows = parseCSV([
    '时间(ms),工况,电流(mA),电压(mV),温度(°C),压力(kPa),流量,泄漏(ppb)',
    '0,稳态,1000,1800,30,100,3,1000',
    '1000,稳态,1000,1800,31,100,3,1000'
  ].join('\n'));
  const result = analyzeRows(legacyRows);
  assert.deepEqual(result.schema.missingHeaders, []);
  assert.equal(result.schema.mappedCount, 8);
  assert.equal(result.rows[1].timestamp_s, 1);
  assert.equal(result.rows[0].current_a, 1);
  assert.equal(result.rows[0].voltage_v, 1.8);
  assert.equal(result.rows[0].pressure_bar, 1);
  assert.equal(result.rows[0].leak_ppm, 1);
  assert.equal(result.metrics.steadyWindow, 'phase=steady');
  assert.ok(Math.abs(result.metrics.pressureDriftBarPerMin) < 20);
  assert.ok(result.issues.some((item) => item.code === 'UNIT_CONVERTED'));
});

test('phase is optional and uses an explicit fallback window', () => {
  const rows = parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,1,1.8,30,10,3,1',
    '1,1,1.8,31,10,3,1'
  ].join('\n'));
  const result = analyzeRows(rows);
  assert.deepEqual(result.schema.missingHeaders, []);
  assert.deepEqual(result.schema.missingOptionalHeaders, ['phase', 'hydrogen_purity_pct']);
  assert.match(result.metrics.steadyWindow, /活动窗口/);
  assert.ok(result.issues.some((item) => item.code === 'PHASE_OPTIONAL'));
});

test('compares current batch with baseline and identifies new/resolved risks', () => {
  const baseline = analyzeRows(parseCSV(baselineCsv));
  const current = analyzeRows(parseCSV(csv));
  const comparison = compareResults(baseline, current, { baselineName: 'baseline.csv', currentName: 'current.csv' });
  assert.equal(baseline.verdict, 'PASS');
  assert.equal(current.verdict, 'FAIL');
  assert.equal(comparison.verdictTransition, '通过（PASS） → 未通过（FAIL）');
  assert.equal(comparison.riskEscalated, true);
  assert.ok(comparison.newIssues.some((item) => item.code === 'PRESSURE_HIGH'));
  assert.ok(comparison.newIssues.some((item) => item.code === 'LEAK_HIGH'));
  assert.ok(comparison.changes.find((item) => item.field === 'peakPressureBar').delta > 0);
  assert.match(reportMarkdown(current, 'current.csv', { comparison }), /批次对比/);
});

test('profile thresholds are carried into analysis and report provenance', () => {
  const profile = getProfile('fuel-cell-demo');
  const result = analyzeRows(parseCSV(csv), { ...profile.thresholds, profileId: profile.id, profileName: profile.name, profileSource: profile.source });
  assert.equal(result.config.profileId, 'fuel-cell-demo');
  assert.equal(result.config.maxLeakPpm, 5);
  assert.equal(result.config.profileName, '燃料电池 · 演示模板');
  assert.equal(result.verdict, 'FAIL');
  assert.equal(result.compliance.status, 'DEMO_ONLY');
  assert.match(reportMarkdown(result, 'profile.csv'), /燃料电池 · 演示模板/);
});

test('local history stores summaries without raw rows and supports clearing', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
  const result = analyzeRows(parseCSV(csv));
  const saved = appendHistory(storage, result, 'current.csv', '2026-08-21T00:00:00.000Z');
  assert.equal(saved.length, 1);
  assert.equal('rows' in saved[0], false);
  assert.equal(readHistory(storage)[0].fileName, 'current.csv');
  assert.deepEqual(clearHistory(storage), []);
  assert.deepEqual(readHistory(storage), []);
});

test('enterprise profile package validates, imports thresholds, and supplies field mapping', async () => {
  const payload = JSON.parse(await readFile(join(here, '../config/enterprise-profile.example.json'), 'utf8'));
  const imported = profilesFromPackage(payload);
  assert.equal(imported.ok, true);
  assert.equal(imported.organization, '示例企业（请替换）');
  assert.equal(imported.profiles[0].thresholds.maxPressureBar, 30);
  assert.equal(imported.fieldMapping.pressure_bar, '压力(kPa)');
  assert.deepEqual(imported.profiles[0].requiredMeasurements, ['flow_slpm', 'hydrogen_purity_pct']);
  assert.deepEqual(imported.profiles[0].requiredPhases, []);
  assert.deepEqual(imported.profiles[0].acceptanceCriteria, {});
  const legacy = analyzeRows(parseCSV([
    '时间(ms),工况,电流(mA),电压(mV),温度(°C),压力(kPa),流量,泄漏(ppb)',
    '0,稳态,1000,1800,30,100,3,1000',
    '1000,稳态,1000,1800,31,100,3,1000'
  ].join('\n')), { ...imported.profiles[0].thresholds, fieldMapping: imported.fieldMapping, profileId: imported.profiles[0].id, profileName: imported.profiles[0].name, profileSource: imported.profiles[0].source, approvalStatus: imported.profiles[0].approvalStatus, standardRefs: imported.profiles[0].standardRefs, methodId: imported.profiles[0].methodId, revision: imported.profiles[0].revision, applicationScope: imported.profiles[0].applicationScope, requiredMetadata: imported.profiles[0].requiredMetadata });
  assert.equal(legacy.rows[1].timestamp_s, 1);
  assert.equal(legacy.config.profileName, '企业电解槽 · 示例配置');
  assert.equal(legacy.compliance.status, 'DEMO_ONLY');
  assert.equal(legacy.compliance.standardRefs.length, 3);
  assert.deepEqual(profilesFromPackage({ schemaVersion: 'wrong', profiles: [] }).ok, false);
  const invalid = profilesFromPackage({ schemaVersion: 'h2-testlens.profile.v1', organization: '', fieldMapping: { unknown_field: 'x', pressure_bar: 42 }, profiles: [{ id: 'bad id', name: '坏配置', thresholds: { maxTemperatureC: -1, maxPressureBar: 0, maxLeakPpm: 1, maxVoltageStdV: -1, maxPressureDriftBarPerMin: 0 } }] });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((error) => error.includes('profile id 非法')));
  assert.ok(invalid.errors.some((error) => error.includes('fieldMapping 含未知字段')));
  const mismatchedInput = parseCSV([
    '时间(ms),工况,电流(mA),电压(mV),温度(°C),压力(kPa),流量,泄漏(ppb)',
    '0,稳态,1000,1800,30,100,3,1000',
    '1000,稳态,1000,1800,31,100,3,1000'
  ].join('\n'));
  const mismatched = analyzeRows(mismatchedInput, { fieldMapping: { pressure_bar: '企业压力专用列' } });
  assert.ok(mismatched.schema.mappingWarnings.some((warning) => warning.includes('pressure_bar')));
  assert.ok(mismatched.issues.some((item) => item.code === 'MAPPING_OVERRIDE_MISSING'));
});

test('public analysis removes raw rows before integration responses', () => {
  const result = analyzeRows(parseCSV(csv));
  const safe = publicAnalysis(result);
  assert.equal('rows' in safe, false);
  assert.equal(safe.verdict, 'FAIL');
  assert.equal(safe.metrics.sampleCount, 25);
});

test('standards gate distinguishes demo, incomplete, and human-review-ready profiles', () => {
  const base = {
    profileId: 'approved-example',
    profileName: 'Approved example',
    profileSource: 'enterprise method register',
    approvalStatus: 'approved',
    standardRefs: [{ id: 'GB/T 45541-2025', title: 'PEM', uri: 'https://std.samr.gov.cn/example' }],
    methodId: 'GB/T 45541-2025',
    revision: '2025',
    applicationScope: 'PEM electrolyzer performance test',
    requiredMetadata: ['testPurpose', 'instrumentIds', 'calibrationRefs', 'operator', 'formulaRefs', 'signoff']
  };
  const incomplete = analyzeRows(parseCSV(csv), base);
  assert.equal(incomplete.compliance.status, 'NOT_READY');
  const ready = analyzeRows(parseCSV(csv), { ...base, testMetadata: { testPurpose: 'performance', instrumentIds: 'I-1', calibrationRefs: 'C-1', operator: 'operator/qualification', formulaRefs: 'method equation v1', signoff: 'reviewer/2026-08-21' } });
  assert.equal(ready.compliance.status, 'READY_FOR_HUMAN_REVIEW');
  assert.equal(ready.compliance.missingMetadata.length, 0);
  assert.equal(ready.workflow.status, 'REVIEW_REQUIRED');
  assert.ok(ready.workflow.steps.some((step) => step.id === 'signoff' && step.status === 'ready'));
});

test('approved profile plus complete provenance can reach human review readiness on a passing run', () => {
  const profile = {
    profileId: 'approved-example',
    profileName: 'Approved example',
    profileSource: 'enterprise method register',
    approvalStatus: 'approved',
    standardRefs: [{ id: 'GB/T 45541-2025', title: 'PEM', uri: 'https://std.samr.gov.cn/example' }],
    methodId: 'GB/T 45541-2025',
    revision: '2025',
    applicationScope: 'PEM electrolyzer performance test',
    requiredMetadata: ['testPurpose', 'testPlanRef', 'acquisitionPlan', 'preCheckRecord', 'instrumentIds', 'calibrationRefs', 'environment', 'operator', 'formulaRefs', 'uncertaintyPolicy', 'rawDataRef', 'signoff'],
    testMetadata: Object.fromEntries(['testPurpose', 'testPlanRef', 'acquisitionPlan', 'preCheckRecord', 'instrumentIds', 'calibrationRefs', 'environment', 'operator', 'formulaRefs', 'uncertaintyPolicy', 'rawDataRef', 'signoff'].map((field) => [field, `${field}-value`]))
  };
  const result = analyzeRows(parseCSV(baselineCsv), profile);
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.compliance.status, 'READY_FOR_HUMAN_REVIEW');
  assert.equal(result.workflow.status, 'READY_FOR_HUMAN_REVIEW');
  assert.equal(result.workflow.steps.every((step) => step.status === 'ready'), true);
});

test('required performance measurements fail closed when purity is absent', () => {
  const result = analyzeRows(parseCSV(baselineCsv), {
    profileId: 'approved-example',
    profileName: 'Approved example',
    approvalStatus: 'approved',
    standardRefs: [{ id: 'GB/T 45541-2025', title: 'PEM', uri: 'https://std.samr.gov.cn/example' }],
    methodId: 'GB/T 45541-2025',
    revision: '2025',
    requiredMeasurements: ['flow_slpm', 'hydrogen_purity_pct']
  });
  assert.equal(result.compliance.status, 'NOT_READY');
  assert.deepEqual(result.compliance.missingMeasurements, ['hydrogen_purity_pct']);
  assert.ok(result.issues.some((item) => item.code === 'PERFORMANCE_FIELD_MISSING'));
});

test('required test phases fail closed when the input run does not cover them', () => {
  const result = analyzeRows(parseCSV(baselineCsv), {
    profileId: 'approved-example',
    profileName: 'Approved example',
    approvalStatus: 'approved',
    standardRefs: [{ id: 'GB/T 46104-2025', title: 'Power fluctuation', uri: 'https://std.samr.gov.cn/example' }],
    methodId: 'GB/T 46104-2025',
    revision: '2025',
    requiredPhases: ['dynamic']
  });
  assert.equal(result.compliance.status, 'NOT_READY');
  assert.deepEqual(result.compliance.missingPhases, ['dynamic']);
  assert.ok(result.issues.some((item) => item.code === 'PHASE_COVERAGE_MISSING'));
});

test('uncertainty model is required only when the approved profile declares it', () => {
  const base = { profileId: 'approved-example', profileName: 'Approved example', approvalStatus: 'approved', standardRefs: [{ id: 'GB/T 45541-2025', title: 'PEM', uri: 'https://std.samr.gov.cn/example' }], methodId: 'GB/T 45541-2025', revision: '2025', uncertaintyModelRequired: true };
  const missing = analyzeRows(parseCSV(baselineCsv), base);
  assert.equal(missing.compliance.status, 'NOT_READY');
  assert.ok(missing.issues.some((item) => item.code === 'UNCERTAINTY_MODEL_MISSING'));
  const model = { method: 'first_order_rss', coverageFactor: 2, standardUncertainty: { current_a: 0.01, voltage_v: 0.005, temperature_c: 0.2, pressure_bar: 0.02, flow_slpm: 0.05, leak_ppm: 0.5, hydrogen_purity_pct: 0.01 } };
  const ready = analyzeRows(parseCSV(baselineCsv), { ...base, uncertaintyModel: model, testMetadata: { signoff: 'reviewer' } });
  assert.equal(ready.uncertainty.status, 'calculated');
  assert.ok(ready.uncertainty.metrics.energyConsumedWh > 0);
  assert.ok(ready.workflow.steps.some((step) => step.id === 'uncertainty' && step.status === 'ready'));
});

test('recognizes the enterprise vehicle contract and computes target-current and insulation summaries', () => {
  const rows = parseCSV([
    'Timestamp,FC_MainSts,FC_CurrOut,FC_VoltOut,FC_NetPwrOut,FC_MinCellVoltage,FC_MinVoltageChannel,FC_AvgCellVoltage,FC_AvgCellDev,FC_VARVoltage,FC_VehicleIsolationR,FC_RunTime_Hours',
    '2026-07-07 18:20:52,8,95,320,30,0.61,3,0.68,8,12,480,1',
    '2026-07-07 18:23:52,4,95,320,31,0.60,3,0.67,9,13,340,1',
    '2026-07-07 18:24:52,4,95,320,31,0.60,3,0.67,9,13,240,1',
    '2026-07-07 18:25:52,8,0,0,0,0,0,0,0,0,65535,1'
  ].join('\n'));
  const result = analyzeRows(rows, { vehicleTargets: [95], vehicleCurrentToleranceA: 1, vehicleMinimumDurationS: 180 });
  assert.equal(result.datasetType, 'vehicle');
  assert.equal(result.schema.mapping.isolation_kohm, 'FC_VehicleIsolationR');
  assert.equal(result.dataset.performancePoints.length, 1);
  assert.equal(result.dataset.insulation.points.length, 2);
  assert.ok(result.dataset.insulation.invalidCount >= 1);
  assert.equal('rows' in publicAnalysis(result), false);
  assert.match(reportMarkdown(result, 'vehicle.csv'), /目标电流段统计/);
});

test('recognizes the enterprise stack contract, supports tab-delimited Chinese headers, and fails closed on timestamp resolution', () => {
  const rows = parseCSV([
    '时间\t电堆电压\t电堆电流\t电堆功率\t平均电压\tCELL1\tCELL2',
    '23:59:58\t1.40\t10\t0.014\t0.70\t0.69\t0.71',
    '23:59:59\t1.39\t10\t0.014\t0.695\t0.68\t0.71',
    '00:00:01\t1.38\t10\t0.014\t0.69\t0.67\t0.71'
  ].join('\n'));
  const result = analyzeRows(rows);
  assert.equal(result.datasetType, 'stack');
  assert.equal(result.dataset.cellChannelCount, 2);
  assert.equal(result.schema.mapping.current_a, '电堆电流');
  assert.equal(result.metrics.durationS, 3);
  assert.equal(result.quality.duplicateTimestampCount, 0);
  assert.match(result.narrative, /单片电压一致性/);
});

test('reads parameter and target-condition workbooks by header code, computes a stable interval, and writes an auditable workbook', () => {
  const inputBook = SheetJS.utils.book_new();
  SheetJS.utils.book_append_sheet(inputBook, SheetJS.utils.aoa_to_sheet([
    ['参数代码', '参数名称', '启用', '基准来源', '目标值', '下偏差', '上偏差', '单位', '连续时间/s', '必需', '标准字段'],
    ['CURRENT', '实测电流', '是', '目标工况表', '', -1, 1, 'A', 60, '是', 'current_a']
  ]), '数据处理设定参数');
  SheetJS.utils.book_append_sheet(inputBook, SheetJS.utils.aoa_to_sheet([
    ['工况编号', '目标电流', '目标电流密度'],
    ['I-10', 10, 100]
  ]), '目标工况设定');
  const parsed = parseParameterWorkbook(SheetJS.write(inputBook, { type: 'buffer', bookType: 'xlsx' }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.targetConditions[0].targetCurrentA, 10);
  assert.equal(parsed.parameterRules[0].code, 'CURRENT');
  const rows = parseCSV([
    '时间,电堆电压,电堆电流,电堆功率,平均电压,CELL1,CELL2',
    ...Array.from({ length: 61 }, (_, index) => `${index},1.4,10,0.014,0.7,0.69,0.71`)
  ].join('\n'));
  const result = analyzeRows(rows, { parameterConfig: parsed, samplePeriodS: 1, minimumPlatformS: 60, minimumStableS: 60 });
  assert.equal(result.datasetType, 'stack');
  assert.equal(result.dataset.platforms.length, 1);
  assert.equal(result.dataset.performancePoints.length, 1);
  assert.equal(result.dataset.performancePoints[0].status, 'short_stable');
  assert.equal(result.dataset.performancePoints[0].selectedDurationS, 60);
  const output = buildEnterpriseWorkbook(result, 'stack.csv', { parameterConfig: parsed });
  assert.ok(output.SheetNames.includes('目标工况对比'));
  const comparison = output.Sheets['目标工况对比'];
  assert.equal(comparison.D2.f, 'C2-B2');
  assert.ok(workbookArrayBuffer(output).byteLength > 1000);
});

test('keeps repeated current platforms separate and uses the terminal 120-second window for long stable runs', () => {
  const parameterConfig = {
    ok: true,
    parameters: [
      { code: 'CURRENT', rawValue: '', target: null },
      { code: 'MIN_CURRENT_PLATFORM_TIME', rawValue: '60', target: 60 },
      { code: 'MIN_STABLE_TIME', rawValue: '60', target: 60 },
      { code: 'DEFAULT_SAMPLE_TIME', rawValue: '120', target: 120 },
      { code: 'SAMPLE_POSITION', rawValue: '稳定区间末端', target: null }
    ],
    parameterRules: [{ code: 'CURRENT', enabled: true, field: 'current_a', target: null, lowerTolerance: -1, upperTolerance: 1 }],
    targetConditions: [{ conditionId: 'I-10', targetCurrentA: 10 }]
  };
  const rows = parseCSV([
    '时间,电堆电压,电堆电流,电堆功率,平均电压,CELL1,CELL2',
    ...Array.from({ length: 121 }, (_, index) => `${index},1.4,10,${index},0.7,0.69,0.71`),
    '121,1.4,0,0,0.7,0.69,0.71',
    ...Array.from({ length: 121 }, (_, index) => `${122 + index},1.4,10,${200 + index},0.8,0.79,0.81`)
  ].join('\n'));
  const result = analyzeRows(rows, { parameterConfig, samplePeriodS: 1, minimumPlatformS: 60, minimumStableS: 60 });
  assert.equal(result.dataset.platforms.length, 2);
  assert.deepEqual(result.dataset.platforms.map((platform) => platform.platformId), ['I-10-1', 'I-10-2']);
  assert.equal(result.dataset.performancePoints.length, 2);
  assert.deepEqual(result.dataset.performancePoints.map((point) => point.selectedDurationS), [120, 120]);
  assert.deepEqual(result.dataset.performancePoints.map((point) => point.selectionPolicy), ['末端120s', '末端120s']);
});

test('derives fuel-cell stack flow resistance and coolant temperature difference from mapped raw channels', () => {
  const rows = parseCSV([
    '时间,电堆电压,电堆电流,电堆功率,平均电压,CELL1,CELL2,阳极入堆压力（kPa）,阳极出堆压力（kPa）,阴极入堆压力（kPa）,阴极出堆压力（kPa）,循环水入堆压力（kPa）,循环水出堆压力（kPa）,循环水入堆温度（℃）,循环水出堆温度（℃）',
    '00:00:00,1.4,10,0.014,0.7,0.69,0.71,150,140,160,150,120,110,60,65',
    '00:00:01,1.4,10,0.014,0.7,0.69,0.71,151,141,161,151,121,111,60,65'
  ].join('\n'));
  const result = analyzeRows(rows);
  assert.equal(result.datasetType, 'stack');
  assert.equal(result.dataset.metrics.anodeFlowResistanceKpa.mean, 10);
  assert.equal(result.dataset.metrics.cathodeFlowResistanceKpa.mean, 10);
  assert.equal(result.dataset.metrics.coolantFlowResistanceKpa.mean, 10);
  assert.equal(result.dataset.metrics.coolantTemperatureDifferenceC.mean, 5);
  assert.match(result.dataset.sourceFieldMap.anode_flow_resistance_kpa, /计算/);
});
