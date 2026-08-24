import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildT02IntegrationReport } from '../src/t02-report.mjs';

const root = new URL('..', import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));

test('T02 coverage evidence gives every source file an explicit usage ledger', async () => {
  const packageJson = await readJson('package.json');
  const audit = await readJson(`.research/ignite_t02_standards_20260821/t02_coverage_audit_v${packageJson.version}.json`);
  assert.equal(audit.auditVersion, packageJson.version);
  assert.equal(audit.totalFiles, 198);
  assert.equal(audit.records.length, audit.totalFiles);
  assert.equal(audit.utilization.totalRecords, audit.totalFiles);
  assert.equal(audit.utilization.recordsWithUsageLedger, audit.totalFiles);
  assert.equal(audit.utilization.formalConformityClaims, 0);
  assert.equal(audit.utilization.processedRowsEnteredAdapters, 2262283);
  assert.deepEqual(audit.utilization.evidenceDepthCounts, {
    descriptive_interval: 143,
    dynamic_event_only: 13,
    generic_metrics_only: 34,
    reference_boundary: 8
  });
  assert.deepEqual(audit.utilization.dispositionCounts, {
    blocked_binary_boundary: 1,
    declared_no_upload_boundary: 1,
    processed_and_aggregated: 190,
    reference_boundary_only: 6
  });
  for (const record of audit.records) {
    assert.ok(record.usageLedger?.disposition, `missing usage ledger: ${record.path}`);
    assert.equal(record.usageLedger.formalConformityClaim, false, `unexpected conformity claim: ${record.path}`);
    if (record.status === 'processed') {
      assert.ok(['formal_kpi', 'descriptive_interval', 'dynamic_event_only', 'generic_metrics_only'].includes(record.usageLedger.evidenceDepth));
      assert.equal(record.usageLedger.parserExecuted, true);
      assert.equal(record.usageLedger.rowsEnteredAdapter, record.rowCount);
      assert.equal(record.usageLedger.referenceAudit.required, false);
      assert.ok(Array.isArray(record.usageLedger.evidenceSurfaces));
      for (const fields of Object.values(record.usageLedger.fieldUsage?.byRole || {})) assert.ok(fields.every((field) => String(field).trim()), `blank field in usage ledger: ${record.path}`);
    } else {
      assert.equal(record.usageLedger.evidenceDepth, 'reference_boundary');
      assert.equal(record.usageLedger.parserExecuted, false);
      assert.equal(record.usageLedger.rowsEnteredAdapter, 0);
      if (['reference_only', 'declared_no_upload'].includes(record.status)) assert.equal(record.usageLedger.referenceAudit.required, true);
    }
  }
  const durabilityRecords = audit.records.filter((record) => record.usageLedger?.datasetType === 'durability');
  assert.equal(durabilityRecords.length, 8);
  for (const record of durabilityRecords) {
    assert.equal(record.usageLedger.fieldUsage.sourceFieldCount, 14);
    assert.equal(Object.values(record.usageLedger.fieldUsage.roleCounts).reduce((sum, count) => sum + count, 0), 14);
    assert.ok(record.usageLedger.metadataUsage?.sourceFieldCount > 0);
    assert.ok(record.usageLedger.metricNames.includes('averageCellVoltageMv'));
  }
  const referenceBoundaryRecords = audit.records.filter((record) => ['reference_only', 'declared_no_upload'].includes(record.status));
  assert.equal(referenceBoundaryRecords.length, 7);
  for (const record of referenceBoundaryRecords) {
    assert.equal(record.usageLedger.referenceAudit.required, true);
    assert.equal(record.usageLedger.referenceAudit.joinKey, record.path);
    assert.equal(record.usageLedger.referenceAudit.expectedStatus, 'extracted_reference');
  }
  const enterpriseWorkbook = audit.records.find((record) => record.path.endsWith('299-001-D_出厂检测报告.xlsx'));
  assert.ok(enterpriseWorkbook, 'missing enterprise XLSX audit record');
  assert.equal(enterpriseWorkbook.status, 'processed');
  assert.equal(enterpriseWorkbook.sheetNames.length, 8);
  assert.equal(enterpriseWorkbook.analysis.workbookEvidenceSummary.sheetCount, 8);
  assert.equal(enterpriseWorkbook.analysis.workbookEvidenceSummary.parsedSheetCount, 8);
  assert.equal(enterpriseWorkbook.analysis.workbookEvidenceSummary.staticMatrixCount, 4);
  assert.equal(enterpriseWorkbook.analysis.workbookEvidenceSummary.staticMatrixCellCount, 1196);
  assert.equal(enterpriseWorkbook.analysis.workbookEvidenceSummary.staticMatrixValidPointCount, 185089);
  assert.equal(enterpriseWorkbook.analysis.workbookEvidenceSummary.staticMatrixMissingPointCount, 590);
  assert.equal(enterpriseWorkbook.analysis.workbookEvidenceSummary.reportPerformanceCheckCount, 24);
  assert.equal(enterpriseWorkbook.analysis.workbookEvidenceSummary.reportPolarizationPointCount, 27);
  assert.equal(enterpriseWorkbook.analysis.workbookEvidenceSummary.reportStabilityPointCount, 1);
  assert.equal(enterpriseWorkbook.analysis.workbookEvidenceSummary.deviceIdentityFieldCount, 2);
  assert.equal(enterpriseWorkbook.analysis.workbookEvidenceSummary.parameterCatalogRowCount, 24);
  assert.equal(enterpriseWorkbook.analysis.workbookEvidenceSummary.formulaCellCount, 6572);
  assert.equal(enterpriseWorkbook.analysis.workbookEvidenceSummary.cachedFormulaCellCount, 6572);
  assert.equal(enterpriseWorkbook.analysis.workbookEvidenceSummary.uncachedFormulaCellCount, 0);
  assert.equal(enterpriseWorkbook.analysis.workbookEvidenceSummary.formulaReviewStatus, 'review_required');
  assert.ok(enterpriseWorkbook.usageLedger.evidenceSurfaces.includes('workbook_sheet_audit'));
  assert.ok(enterpriseWorkbook.usageLedger.evidenceSurfaces.includes('workbook_static_matrix'));
  assert.ok(enterpriseWorkbook.usageLedger.evidenceSurfaces.includes('workbook_report_evidence'));
  const durabilitySummary = audit.batchAggregation['企业资料包02_氢质氢离'].businessAggregation.durability.crossReportDescriptiveSummary;
  assert.equal(durabilitySummary.reportCount, 8);
  assert.equal(durabilitySummary.comparabilityAudit.auditStatus, 'screened');
  assert.equal(durabilitySummary.comparabilityAudit.comparable, false);
  assert.ok(durabilitySummary.comparabilityAudit.issueCodes.includes('DURABILITY_COMPARABILITY_STACK_MODEL_MISMATCH'));
  assert.equal(audit.batchAggregation['企业资料包02_氢质氢离'].closure.crossReportDurabilityComparabilityAudit, true);
  const dynamic = audit.batchAggregation['企业资料包02_氢质氢离'].businessAggregation.vehicle.dynamicAnalysis;
  assert.equal(dynamic.fileCount, 170);
  assert.equal(dynamic.enabledFileCount, 170);
  assert.equal(dynamic.eventCount, 15281);
  assert.equal(dynamic.settledEventCount, 3727);
  assert.equal(dynamic.unsettledEventCount, 11554);
  assert.equal(dynamic.dataGapCount, 0);
  const dynamicRecord = audit.records.find((record) => record.analysis?.datasetType === 'vehicle');
  assert.equal(dynamicRecord.analysis.dynamicAnalysis.enabled, true);
  assert.ok(dynamicRecord.usageLedger.evidenceSurfaces.includes('dynamic_event_analysis'));
});

test('T02 package field usage separates analysis, cross-check, and catalog-only signals', async () => {
  const packageJson = await readJson('package.json');
  const audit = await readJson(`.research/ignite_t02_standards_20260821/t02_coverage_audit_v${packageJson.version}.json`);
  const stackPackage = audit.batchAggregation['企业资料包01_氢璞创能'];
  const vehiclePackage = audit.batchAggregation['企业资料包02_氢质氢离'];
  assert.ok(stackPackage.fieldUsage.roleCounts.analysis_input > 0);
  assert.ok(stackPackage.fieldUsage.roleCounts.context_or_cross_check > 0);
  assert.ok(stackPackage.fieldUsage.roleCounts.catalog_only > 0);
  assert.equal(vehiclePackage.fieldUsage.roleCounts.analysis_input, 13);
  assert.equal(vehiclePackage.fieldUsage.roleCounts.context_or_cross_check, 33);
  assert.ok(Object.values(stackPackage.fieldUsage.byRole).flat().every((field) => String(field).trim()));
  assert.ok(Object.values(vehiclePackage.fieldUsage.byRole).flat().every((field) => String(field).trim()));
  assert.equal(stackPackage.durabilityFieldUsage?.sourceFieldCount || 0, 0);
  const durabilityPackage = audit.batchAggregation['企业资料包02_氢质氢离'];
  assert.ok(durabilityPackage.durabilityFieldUsage.sourceFieldCount >= 14);
  assert.ok(durabilityPackage.durabilityFieldUsage.roleCounts.analysis_input > 0);
  assert.ok(durabilityPackage.durabilityFieldUsage.roleCounts.context_or_cross_check > 0);
  assert.ok(durabilityPackage.durabilityFieldUsage.metadataFieldUnion.includes('测试结果'));
  assert.ok(durabilityPackage.metricUnion.includes('averageCellVoltageMv'));
  for (const packageName of ['企业资料包01_氢璞创能', '企业资料包02_氢质氢离', '企业资料包03_青川易创与云汉达']) {
    const fieldUsage = audit.batchAggregation[packageName].fieldUsage;
    assert.equal(fieldUsage.roleUnionCount, fieldUsage.sourceFieldCount);
    assert.equal(fieldUsage.unclassifiedSourceFieldCount, 0, `unclassified fields in ${packageName}`);
    assert.equal(fieldUsage.overlappingSourceFieldCount, 0, `overlapping roles in ${packageName}`);
  }
  assert.ok(!stackPackage.closure.crossFileTimeSeriesKpiMerge);
  assert.ok(!stackPackage.closure.enterpriseAcceptanceParallelValidation);
});

test('T02 reference audit exposes keyword evidence completeness without implying standard compliance', async () => {
  const packageJson = await readJson('package.json');
  const audit = await readJson(`.research/ignite_t02_standards_20260821/t02_reference_audit_v${packageJson.version}.json`);
  const summary = audit.sourceEvidenceSummary;
  assert.ok(summary);
  assert.equal(summary.claimsTotal, summary.completeClaims + summary.incompleteClaims);
  assert.equal(summary.incompleteSourceEvidence.length, summary.incompleteClaims);
  assert.equal(summary.incompleteClaims, 0);
  assert.equal(summary.completeClaims, 21);
  assert.match(summary.boundary, /关键词完整性/);
});

test('T02 audit commands default to current versioned evidence artifacts', async () => {
  const packageJson = await readJson('package.json');
  const coverageSource = await readFile(new URL('scripts/t02-coverage-audit.mjs', root), 'utf8');
  const referenceSource = await readFile(new URL('scripts/t02-reference-audit.mjs', root), 'utf8');
  assert.match(coverageSource, /t02_coverage_audit_v\$\{packageVersion\}\.json/);
  assert.match(referenceSource, /t02_reference_audit_v\$\{packageVersion\}\.json/);
  assert.match(coverageSource, /await mkdir\(dirname\(outputPath\)/);
  assert.match(referenceSource, /await mkdir\(dirname\(outputPath\)/);
  assert.equal(packageJson.scripts['t02:coverage'], 'node scripts/t02-coverage-audit.mjs');
  assert.equal(packageJson.scripts['t02:reference'], 'node scripts/t02-reference-audit.mjs');
});

test('T02 integration report exposes every file ledger and preserves non-conformity boundaries', async () => {
  const packageJson = await readJson('package.json');
  const coverage = await readJson(`.research/ignite_t02_standards_20260821/t02_coverage_audit_v${packageJson.version}.json`);
  const reference = await readJson(`.research/ignite_t02_standards_20260821/t02_reference_audit_v${packageJson.version}.json`);
  const report = buildT02IntegrationReport({ coverage, reference });
  assert.equal((report.match(/^\| \d+ \| /gm) || []).length, coverage.totalFiles);
  assert.match(report, /全文件使用台账/);
  assert.match(report, /源 SHA-256/);
  assert.match(report, /字段使用角色（计数）/);
  assert.match(report, /analysis_input=323/);
  assert.match(report, /未分类=0/);
  assert.equal((report.match(/\| [0-9a-f]{64} \|/g) || []).length, coverage.totalFiles);
  assert.match(report, /blocked_binary/);
  assert.match(report, /declared_no_upload/);
  assert.match(report, /不证明 GB\/T 45541-2025/);
  assert.match(report, /不把目录字段升级为标准结论/);
  assert.match(report, /参考内容审计交叉链接：7\/7/);
  assert.match(report, /参考内容审计/);
  assert.match(report, /耐久跨报告可比性筛查/);
  assert.match(report, /DURABILITY_COMPARABILITY_STACK_MODEL_MISMATCH/);
  assert.match(report, /仅作跨报告元数据、功率集合和时间关系筛查/);
  assert.match(report, /字段用途明细（不是每个字段都进入 KPI）/);
  assert.match(report, /证据深度分层/);
  assert.match(report, /高风险字段明细/);
  assert.match(report, /FC_MinCellVoltage/);
  assert.match(report, /692,561/);
  assert.match(report, /generic_metrics_only/);
  assert.match(report, /formal_kpi/);
  assert.match(report, /动态设定变化事件（描述性）/);
  assert.match(report, /不跨文件拼接/);
  assert.match(report, /\| 企业资料包02_氢质氢离 \| vehicle \| 46 \| 13 \| 33 \| 0 \| 0 \| 0 \|/);
  assert.match(report, /\| 企业资料包02_氢质氢离 \| durability \| 14 \| 6 \| 8 \| 0 \| 0 \| 0 \|/);
  assert.doesNotMatch(report, /\/Users\/kili\//);
});
