import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzeEnterpriseRows } from '../src/enterprise-adapters.mjs';
import { parseCSV, analyzeRows, publicAnalysis, reportMarkdown } from '../src/analyzer.mjs';
import { DEVICE_PROFILES, getProfile, profilesFromPackage } from '../src/profiles.mjs';
import { compliance } from '../src/enterprise-adapters.mjs';
import { sampleRowsForDisplay } from '../src/display-sampling.mjs';
import { validateBatchDeclaration, observeDeclaredBatch, publicBatchAggregation } from '../src/batch-aggregation.mjs';
import { decodeTextBuffer, isLikelyBinary } from '../src/input-safety.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// 1. Enterprise adapter edge cases
// ============================================================================

test('analyzeEnterpriseRows returns null for arrays shorter than 2 rows', () => {
  assert.equal(analyzeEnterpriseRows([]), null);
  assert.equal(analyzeEnterpriseRows([{ a: '1' }]), null);
});

test('stack adapter warns when cell channels are missing even if current/voltage exist', () => {
  const headers = ['时间（s）', '实际电流（A）', '实际电压（V）', '片数'].join(',');
  const rows = ['0,10,180,2', '1,10,180,2'].join('\n');
  const result = analyzeEnterpriseRows(parseCSV(`${headers}\n${rows}`), {});
  assert.ok(result);
  assert.equal(result.datasetType, 'stack');
  assert.ok(result.issues.some((issue) => issue.code === 'STACK_CELL_CHANNELS_MISSING'));
});

test('stack adapter detects duplicate timestamps and preserves them in diagnostics', () => {
  const headers = ['时间（s）', '实际电流（A）', '实际电压（V）', '单片电压1（V）', '单片电压2（V）', '片数'].join(',');
  const rows = ['0,10,180,2.0,2.1,2', '0,10,180,2.2,2.3,2', '1,10,180,2.4,2.5,2'].join('\n');
  const result = analyzeEnterpriseRows(parseCSV(`${headers}\n${rows}`), {});
  assert.ok(result);
  assert.ok(result.issues.some((issue) => issue.code === 'STACK_DUPLICATE_TIMESTAMP'));
  assert.equal(result.quality.duplicateTimestampCount, 1);
});

test('vehicle adapter excludes censored insulation values above 9999 and sentinel 65535', () => {
  const headers = ['Timestamp','FC_MainSts','FC_CurrOut','FC_VoltOut','FC_NetPwrOut','FC_MinCellVoltage','FC_MinVoltageChannel','FC_AvgCellVoltage','FC_AvgCellDev','FC_VARVoltage','FC_VehicleIsolationR','FC_RunTime_Hours'].join(',');
  const rows = [
    '2026-07-07 18:20:52,4,50,320,16,3.1,1,3.15,0.02,0.01,1200,10',
    '2026-07-07 18:20:53,4,50,320,16,3.1,1,3.15,0.02,0.01,9999,10.1',
    '2026-07-07 18:20:54,4,50,320,16,3.1,1,3.15,0.02,0.01,65535,10.2'
  ].join('\n');
  const result = analyzeEnterpriseRows(parseCSV(`${headers}\n${rows}`), {});
  assert.ok(result);
  assert.equal(result.datasetType, 'vehicle');
  assert.ok(result.dataset.insulation);
  assert.equal(result.dataset.insulation.validCount, 1);
  assert.ok(result.dataset.insulation.censoredAboveRange >= 1);
});

test('vehicle adapter handles missing main_status by disabling performance segmentation', () => {
  const headers = ['Timestamp','FC_MainSts','FC_CurrOut','FC_VoltOut','FC_NetPwrOut','FC_MinCellVoltage','FC_MinVoltageChannel','FC_AvgCellVoltage','FC_AvgCellDev','FC_VARVoltage','FC_VehicleIsolationR','FC_RunTime_Hours'].join(',');
  const rows = [
    '2026-07-07 18:20:52,,50,320,16,3.1,1,3.15,0.02,0.01,1200,10',
    '2026-07-07 18:20:53,,50,320,16,3.1,1,3.15,0.02,0.01,1100,10.1'
  ].join('\n');
  const result = analyzeEnterpriseRows(parseCSV(`${headers}\n${rows}`), {});
  assert.ok(result);
  assert.equal(result.datasetType, 'vehicle');
  assert.ok(result.issues.some((issue) => issue.code === 'VEHICLE_UNIT_UNRESOLVED') || result.issues.some((issue) => issue.code === 'VEHICLE_TARGETS_MISSING'));
});

test('durability adapter reports missing target power points as a data quality issue', () => {
  const rows = [
    { target_power_kw: '33', average_cell_voltage_mv: '800', average_deviation_mv: '10', voltage_variance: '5' },
    { target_power_kw: '33', average_cell_voltage_mv: '810', average_deviation_mv: '12', voltage_variance: '6' }
  ];
  const result = analyzeEnterpriseRows(rows, { datasetType: 'durability' });
  assert.ok(result);
  assert.ok(result.issues.some((issue) => issue.code === 'DURABILITY_POWER_POINTS_MISSING'));
});

test('durability adapter flags a report with failed test metadata', () => {
  const rows = [
    { target_power_kw: '33', average_cell_voltage_mv: '800', average_deviation_mv: '10', voltage_variance: '5', source_file: 'r1.docx' },
    { target_power_kw: '58.5', average_cell_voltage_mv: '810', average_deviation_mv: '12', voltage_variance: '6', source_file: 'r1.docx' }
  ];
  const result = analyzeEnterpriseRows(rows, {
    datasetType: 'durability',
    durabilityReports: [{ metadata: { 测试结果: '未通过', 测试方案: '耐久0-5', 电堆型号: 'H3300B' }, points: rows }]
  });
  assert.ok(result);
  assert.ok(result.issues.some((issue) => issue.code === 'DURABILITY_REPORT_FAIL'));
});

test('compliance retains formal blockers for unapproved profiles with empty standardRefs', () => {
  const result = compliance({
    approvalStatus: 'example_unapproved',
    methodExecutionStatus: 'ENTERPRISE_PROFILE_REQUIRED',
    standardRefs: [],
    requiredMetadata: [],
    acceptanceRules: [],
    acceptanceCriteria: {},
    testMetadata: {}
  }, 'demo', {}, { rowCount: 0, completenessPct: 0, usable: false }, [], {});
  assert.equal(result.status, 'DEMO_ONLY');
  assert.ok(result.boundary.includes('审批状态为 example_unapproved'));
  assert.ok(result.boundary.includes('方法执行状态为 ENTERPRISE_PROFILE_REQUIRED'));
  assert.equal(result.auditTrail.formalBlockers, true);
});

test('compliance counts evidence readiness for approved profiles with missing implementation evidence', () => {
  const result = compliance({
    approvalStatus: 'approved',
    methodExecutionStatus: 'FULL_METHOD_IMPLEMENTED',
    standardRefs: [{ id: 'GB/T 46104-2025', title: 'test', uri: 'https://example.com', status: 'current' }],
    methodId: 'GB/T 46104-2025',
    revision: '2025',
    methodImplementationEvidence: { ready: false, evidence: 'missing' },
    fullMethodProfile: { ready: false, evidence: 'missing' },
    requiredMetadata: ['testPurpose'],
    testMetadata: { testPurpose: '' },
    acceptanceRules: [],
    acceptanceCriteria: {},
    requiredMeasurements: ['current_a'],
    requiredPhases: ['steady'],
    dataQualityRequirements: {}
  }, 'stack', {}, { rowCount: 10, completenessPct: 100, usable: true }, [{ current_a: 10 }], { mapping: { current_a: 'current_a' } });
  assert.equal(result.status, 'NOT_READY');
  assert.ok(result.auditTrail);
  assert.equal(result.auditTrail.formalBlockers, true);
  assert.ok(result.auditTrail.blockerCount > 0);
});

// ============================================================================
// 2. Malformed CSV / TXT / XLSX-inspired parsing edge cases
// ============================================================================

test('parseCSV treats consecutive commas as explicit empty fields', () => {
  const rows = parseCSV('timestamp_s,current_a,voltage_v\n0,10,\n');
  assert.deepEqual(rows, [{ timestamp_s: '0', current_a: '10', voltage_v: '' }]);
});

test('parseCSV ignores Windows BOM and preserves Unicode headers', () => {
  const rows = parseCSV('\uFEFF时间,电流\n0,10\n');
  assert.ok(rows[0].hasOwnProperty('时间'));
  assert.ok(rows[0].hasOwnProperty('电流'));
  assert.equal(rows[0]['电流'], '10');
});

test('parseCSV returns empty array for header-only input', () => {
  assert.deepEqual(parseCSV('timestamp_s,current_a'), []);
});

test('parseCSV keeps commas inside quoted fields from splitting', () => {
  const rows = parseCSV('note\n"1,000",\n"2,000",\n');
  assert.deepEqual(rows, [{ note: '1,000' }, { note: '2,000' }]);
});

test('parseCSV keeps quotes inside quoted fields when doubled', () => {
  const rows = parseCSV('note\n"a ""b"" c",\n');
  assert.deepEqual(rows, [{ note: 'a "b" c' }]);
});

test('parseCSV handles CRLF, LF, and mixed line endings without crashing', () => {
  const mixed = 'a,b\r\n1,2\n3,4\r';
  const rows = parseCSV(mixed);
  assert.ok(rows.length >= 2);
  assert.equal(rows[0].a, '1');
  assert.equal(rows[1].a, '3');
});

test('input boundary rejects buffers with NUL bytes before text parsing', async () => {
  const binary = Uint8Array.from([0x00, 0x01, 0x02]);
  assert.equal(isLikelyBinary(binary), true);
  const decoded = decodeTextBuffer(binary, 'utf-8');
  assert.equal(decoded.binary, true);
  assert.equal(decoded.binaryReason, 'nul_byte');
});

test('input boundary classifies high control-byte ratio buffers as binary', () => {
  const binary = Uint8Array.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a]);
  assert.equal(isLikelyBinary(binary), true);
  assert.equal(decodeTextBuffer(binary, 'utf-8').binaryReason, 'control_byte_ratio');
});

// ============================================================================
// 3. Boundary conditions in calculations and schema behavior
// ============================================================================

test('parseCSV("") returns empty array without throwing', () => {
  assert.deepEqual(parseCSV(''), []);
});

test('parseCSV handles bare CR as non-separator without creating rows', () => {
  const rows = parseCSV('a,b\r1,2\r3,4');
  assert.deepEqual(rows, []);
});

test('analyzeRows treats exactly two rows as sufficient data', () => {
  const result = analyzeRows(parseCSV('timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct\n0,10,2,30,10,6,1,99\n60,10,2,30,10,6,1,99'));
  assert.equal(result.quality.hasEnoughRows, true);
  assert.equal(result.verdict, 'PASS');
});

test('analyzeRows flags single-row inputs as too short', () => {
  const result = analyzeRows(parseCSV('timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct\n0,10,2,30,10,6,1,99'));
  assert.equal(result.quality.hasEnoughRows, false);
  assert.ok(result.issues.some((issue) => issue.code === 'DATA_TOO_SHORT'));
});

test('analyzeRows accepts values exactly at default thresholds', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct',
    '0,10,2,80,30,10,10,99',
    '60,10,2,80,30,10,10,99'
  ].join('\n')));
  assert.equal(result.verdict, 'PASS');
});

test('analyzeRows crosses temperature threshold by 0.01 and triggers a warning', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct',
    '0,10,2,80.01,10,6,1,99',
    '60,10,2,80.01,10,6,1,99'
  ].join('\n')));
  assert.equal(result.verdict, 'WARN');
  assert.ok(result.issues.some((issue) => issue.code === 'TEMP_HIGH'));
});

test('analyzeRows preserves zero current and derives power deterministically', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct',
    '0,0,2,30,10,6,1,99',
    '60,0,2,30,10,6,1,99'
  ].join('\n')));
  assert.equal(result.metrics.minimumCurrentA, 0);
  assert.equal(result.metrics.maximumCurrentA, 0);
  assert.equal(result.metrics.peakPowerW, 0);
});

test('analyzeRows does not crash on extremely long field values', () => {
  const longValue = '9'.repeat(2000);
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct',
    `0,${longValue},2,30,10,6,1,99`,
    `60,${longValue},2,30,10,6,1,99`
  ].join('\n')));
  assert.equal(result.verdict, 'WARN');
  assert.ok(result.issues.some((issue) => issue.code === 'DATA_GAP'));
});

test('analyzeRows handles negative timestamps as valid numeric input', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct',
    '-60,10,2,30,10,6,1,99',
    '0,10,2,30,10,6,1,99'
  ].join('\n')));
  assert.ok(result.quality.usable || result.verdict === 'WARN' || result.verdict === 'FAIL');
  assert.ok(result.issues.some((issue) => issue.code === 'TIME_SEQUENCE'));
});

test('analyzeRows handles missing values as nulls and records completeness', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct',
    '0,,2,30,10,6,1,99',
    '60,10,,30,10,6,1,99'
  ].join('\n')));
  assert.ok(result.quality.completenessPct < 100);
  assert.ok(result.schema.conversions?.current_a || result.schema.missingOptionalHeaders.length >= 0);
});

// ============================================================================
// 4. Error handling and recovery
// ============================================================================

test('reportMarkdown never crashes on missing optional datasets or undefined verdicts', () => {
  const minimal = analyzeRows(parseCSV('timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct\n0,10,2,30,10,6,1,99'));
  const markdown = reportMarkdown(minimal, 'edge.csv');
  assert.match(markdown, /自动判定/);
  assert.match(markdown, /建议/);
});

test('publicAnalysis removes internal rows, source files, and secrets', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct',
    '0,10,2,30,10,6,1,99',
    '60,10,2,30,10,6,1,99'
  ].join('\n')), {
    testMetadata: { operator: 'secret-operator', rawDataRef: '/private/data.csv', calibrationRefs: 'cal-secret' }
  });
  const safe = publicAnalysis(result);
  assert.equal('rows' in safe, false);
  assert.equal('datasetType' in safe, false);
  assert.doesNotMatch(JSON.stringify(safe), /secret-operator/);
  assert.doesNotMatch(JSON.stringify(safe), /\/private\/data\.csv/);
  assert.doesNotMatch(JSON.stringify(safe), /cal-secret/);
});

test('profilesFromPackage rejects invalid dates and non-canonical standard URLs', () => {
  const result = profilesFromPackage({
    schemaVersion: 'h2-testlens.profile.v1',
    organization: 'test',
    profiles: [{
      id: 'bad', name: 'bad', approvalStatus: 'approved', evaluationMode: 'acceptance',
      methodId: 'GB/T 45541-2025', revision: '2025', status: 'current',
      standardRefs: [{ id: 'GB/T 45541-2025', title: 'PEM', uri: 'https://example.com/fake', status: 'current' }],
      methodSource: { sourceId: 'SRC', locator: 'LOC', evidenceType: 'register' }, scopeEvidence: 'scope', workflowEvidence: 'workflow',
      publicationDate: '2025-99-01', effectiveDate: '2025-07-01',
      approvalEvidence: { approverId: 'A', approvalDate: '2025-99-01', approvalRef: 'R', profileRevision: '2025', profileRevisionRef: 'RR' },
      thresholds: { maxTemperatureC: 1, maxPressureBar: 1, maxLeakPpm: 1, maxVoltageStdV: 1, maxPressureDriftBarPerMin: 1 }, supportedDatasetTypes: ['generic']
    }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('uri_not_canonical')));
  assert.ok(result.errors.some((error) => error.includes('approvalDate')));
});

test('batch declaration rejects missing clock, sampling, restart boundaries, and unimported files', () => {
  const declaration = {
    version: 'h2-testlens.batch-declaration.v1',
    groups: [{
      id: 'run-001',
      testRunId: 'TR-001',
      sessionGroup: 'SG-001',
      files: ['a.csv'],
      fileOrder: ['a.csv'],
      clockReference: '',
      samplingFrequencyHz: null,
      restartBoundaries: ['a.csv']
    }]
  };
  const result = validateBatchDeclaration(declaration, [{ name: 'a.csv', status: 'blocked_binary' }]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('clockReference')));
  assert.ok(result.errors.some((error) => error.includes('samplingFrequencyHz')));
  assert.ok(result.errors.some((error) => error.includes('未进入分析器')));
  assert.ok(result.errors.some((error) => error.includes('首文件')));
});

test('batch observation records a rewind boundary when restart boundary is declared', () => {
  const group = validateBatchDeclaration({
    version: 'h2-testlens.batch-declaration.v1',
    groups: [{
      id: 'run-001',
      testRunId: 'TR-001',
      sessionGroup: 'SG-001',
      files: ['a.csv', 'b.csv'],
      fileOrder: ['a.csv', 'b.csv'],
      clockReference: 'DAQ-01',
      samplingFrequencyHz: 1,
      restartBoundaries: ['b.csv']
    }]
  }, [{ name: 'a.csv', status: 'processed' }, { name: 'b.csv', status: 'processed' }]).groups[0];

  const entries = [
    { name: 'a.csv', rows: [{ timestamp_s: '0', phase: 'steady', current_a: '10', voltage_v: '20', temperature_c: '25', pressure_bar: '1', flow_slpm: '3', leak_ppm: '1' }] },
    { name: 'b.csv', rows: [{ timestamp_s: '0', phase: 'steady', current_a: '10', voltage_v: '20', temperature_c: '25', pressure_bar: '1', flow_slpm: '3', leak_ppm: '1' }] }
  ];
  const fileResults = entries.map((entry) => ({ name: entry.name, result: analyzeRows(entry.rows) }));
  const observation = observeDeclaredBatch(group, fileResults);
  assert.equal(observation.status, 'ready');
  assert.equal(observation.crossFile[0].relation, 'rewind');
  assert.equal(observation.crossFile[0].restartBoundaryDeclared, true);
});

test('batch summary redacts identifiers but preserves descriptive boundary text', () => {
  const group = validateBatchDeclaration({
    version: 'h2-testlens.batch-declaration.v1',
    groups: [{
      id: 'run-001',
      testRunId: 'TR-001',
      sessionGroup: 'SG-001',
      files: ['a.csv', 'b.csv'],
      fileOrder: ['a.csv', 'b.csv'],
      clockReference: 'DAQ-01',
      samplingFrequencyHz: 1,
      restartBoundaries: ['b.csv']
    }]
  }, [{ name: 'a.csv', status: 'processed' }, { name: 'b.csv', status: 'processed' }]).groups[0];

  const entries = [
    { name: 'a.csv', rows: [{ timestamp_s: '0', phase: 'steady', current_a: '10', voltage_v: '20', temperature_c: '25', pressure_bar: '1', flow_slpm: '3', leak_ppm: '1' }], rowCount: 1, hash: 'hash-a' },
    { name: 'b.csv', rows: [{ timestamp_s: '0', phase: 'steady', current_a: '10', voltage_v: '20', temperature_c: '25', pressure_bar: '1', flow_slpm: '3', leak_ppm: '1' }], rowCount: 1, hash: 'hash-b' }
  ];
  const fileResults = entries.map((entry) => ({ name: entry.name, result: analyzeRows(entry.rows) }));
  const combined = analyzeRows(group.files.flatMap((name, index) => entries[index].rows));
  const summary = {
    ...group,
    entries: entries.map((entry) => ({ name: entry.name, rowCount: entry.rowCount, hash: entry.hash })),
    fileResults,
    combined
  };
  const publicSummary = publicBatchAggregation(summary);
  assert.equal(publicSummary.testRunId, undefined);
  assert.equal(publicSummary.sessionGroup, undefined);
  assert.ok(publicSummary.boundary.includes('不产生标准符合性'));
});

// ============================================================================
// 5. Mobile-responsive UI and accessibility source checks
// ============================================================================

test('static page includes viewport and skip link for accessibility', async () => {
  const page = await readFile(join(here, '../src/index.html'), 'utf8');
  assert.match(page, /viewport/);
  assert.match(page, /skip-link/);
  assert.match(page, /aria-label/);
});

test('Vinext page exposes mobile nav with ARIA labels and touch-friendly actions', async () => {
  const page = await readFile(join(here, '../app/page.tsx'), 'utf8');
  assert.match(page, /mobile-nav/);
  assert.match(page, /aria-label="移动端页面导航"/);
  assert.match(page, /aria-label="选择测试数据文件"/);
  assert.match(page, /role="region"/);
});

test('CSS preserves focus-visible outlines and reduced motion preferences', async () => {
  const css = await readFile(join(here, '../src/styles.css'), 'utf8');
  assert.match(css, /:focus-visible \{/);
  assert.match(css, /outline: 3px solid var\(--mint\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /touch-action: manipulation/);
});

test('CSS enables horizontal scrolling enterprise tables on small screens', async () => {
  const css = await readFile(join(here, '../src/styles.css'), 'utf8');
  assert.match(css, /\.enterprise-table \{[\s\S]*overflow-x: auto/);
  assert.match(css, /\.enterprise-table table \{[\s\S]*min-width: 640px/);
});

test('app layer uses live regions for status and announcements', async () => {
  const app = await readFile(join(here, '../src/app.mjs'), 'utf8');
  assert.match(app, /role="status"/);
  assert.match(app, /aria-live="polite"/);
  assert.match(app, /aria-atomic="true"/);
  assert.match(app, /result-announcement/);
});

// ============================================================================
// 6. Real T02 regression fixtures and display sampling edge cases
// ============================================================================

test('display sampling preserves session boundaries for large enterprise runs', () => {
  const rows = Array.from({ length: 8000 }, (_, i) => ({
    timestamp_s: i,
    session_id: i < 4000 ? 'file:a.csv' : 'file:b.csv',
    current_a: String(i % 40),
    voltage_v: '2'
  }));
  const sampled = sampleRowsForDisplay(rows, 6000);
  assert.equal(sampled.sampled, true);
  assert.equal(sampled.originalRowCount, 8000);
  assert.ok(sampled.rows.some((row) => row.session_id === 'file:a.csv'));
  assert.ok(sampled.rows.some((row) => row.session_id === 'file:b.csv'));
  assert.ok(sampled.rows.length <= 6000 + 3);
});

test('sample rows keep first and last rows for every detected session', () => {
  const rows = [
    { timestamp_s: '0', session_id: 'a', current_a: '1', voltage_v: '2' },
    { timestamp_s: '1', session_id: 'a', current_a: '1', voltage_v: '2' },
    { timestamp_s: '2', session_id: 'b', current_a: '1', voltage_v: '2' },
    { timestamp_s: '3', session_id: 'b', current_a: '1', voltage_v: '2' }
  ];
  const sampled = sampleRowsForDisplay(rows, 2);
  assert.ok(sampled.rows.some((row) => row.timestamp_s === '0' && row.session_id === 'a'));
  assert.ok(sampled.rows.some((row) => row.timestamp_s === '3' && row.session_id === 'b'));
});
