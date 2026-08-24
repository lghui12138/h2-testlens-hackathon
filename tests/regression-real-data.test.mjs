import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzeRows, parseCSV, reportMarkdown, publicAnalysis } from '../src/analyzer.mjs';
import { analyzeEnterpriseRows } from '../src/enterprise-adapters.mjs';
import { getProfile, profilesFromPackage } from '../src/profiles.mjs';
import { sampleRowsForDisplay } from '../src/display-sampling.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// 1. Enterprise adapter edge cases
// ---------------------------------------------------------------------------

test('analyzeEnterpriseRows returns null for empty input', () => {
  assert.equal(analyzeEnterpriseRows([]), null);
  assert.equal(analyzeEnterpriseRows([{ a: '1' }]), null);
});

test('stack adapter warns on missing cell channels even when current and voltage are present', () => {
  const headers = ['时间（s）', '实际电流（A）', '实际电压（V）', '片数'].join(',');
  const rows = ['0,10,180,2', '1,10,180,2'].join('\n');
  const result = analyzeEnterpriseRows(parseCSV(`${headers}\n${rows}`), {});
  assert.ok(result);
  assert.equal(result.datasetType, 'stack');
  assert.ok(result.issues.some((issue) => issue.code === 'STACK_CELL_CHANNELS_MISSING'));
});

test('vehicle adapter filters censored insulation and preserves valid points', () => {
  const headers = [
    'Timestamp','FC_MainSts','FC_CurrOut','FC_VoltOut','FC_NetPwrOut',
    'FC_MinCellVoltage','FC_MinVoltageChannel','FC_AvgCellVoltage','FC_AvgCellDev',
    'FC_VARVoltage','FC_VehicleIsolationR','FC_RunTime_Hours'
  ].join(',');
  const rows = [
    '2026-07-07 18:20:52,8,0,0,0,-24,-1,69,0,70,639,448.92',
    '2026-07-07 18:20:53,8,0,0,0,-23,-1,70,0,70,633,448.93',
    '2026-07-07 18:20:54,4,50,320,16,3.1,1,3.15,0.02,0.01,1200,10',
    '2026-07-07 18:20:55,4,50,320,16,3.1,1,3.15,0.02,0.01,1100,10.1',
    '2026-07-07 18:20:56,4,50,320,16,3.1,1,3.15,0.02,0.01,9999,10.2',
    '2026-07-07 18:20:57,4,50,320,16,3.1,1,3.15,0.02,0.01,65535,10.3'
  ].join('\n');
  const result = analyzeEnterpriseRows(parseCSV(`${headers}\n${rows}`), {});
  assert.ok(result);
  assert.equal(result.datasetType, 'vehicle');
  assert.ok(result.dataset.sessionCount >= 1);
  assert.ok(result.dataset.insulation.validCount >= 1);
  assert.ok(result.dataset.insulation.censoredAboveRange >= 2);
  assert.ok(result.issues.some((issue) => issue.code === 'VEHICLE_UNIT_UNRESOLVED') || result.issues.some((issue) => issue.code === 'VEHICLE_TARGETS_MISSING'));
});

test('vehicle adapter computes deterministic insulation windows from known counts', () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({
    Timestamp: `2026-07-07 18:${(20 + i).toString().padStart(2, '0')}:52`,
    FC_MainSts: '4',
    FC_CurrOut: '50',
    FC_VoltOut: '320',
    FC_NetPwrOut: '16',
    FC_MinCellVoltage: '3.1',
    FC_MinVoltageChannel: '1',
    FC_AvgCellVoltage: '3.15',
    FC_AvgCellDev: '0.02',
    FC_VARVoltage: '0.01',
    FC_VehicleIsolationR: String(1000 + i * 10),
    FC_RunTime_Hours: '10'
  }));
  const result = analyzeEnterpriseRows(rows, {});
  assert.ok(result);
  assert.equal(result.datasetType, 'vehicle');
  assert.ok(result.dataset.insulation.points.length >= 1);
  assert.equal(result.dataset.insulation.validCount, 25);
  assert.ok(result.metrics.durationS >= 24);
});

test('stack adapter rejects duplicate timestamps and detects missing cell channels', () => {
  const headers = ['时间（s）', '实际电流（A）', '实际电压（V）', '单片电压1（V）', '单片电压2（V）', '片数'].join(',');
  const rows = ['0,10,180,3.1,3.2,2', '0,10,180,3.1,3.2,2', '1,10,180,3.1,3.2,2'].join('\n');
  const result = analyzeEnterpriseRows(parseCSV(`${headers}\n${rows}`), {});
  assert.ok(result);
  assert.equal(result.datasetType, 'stack');
  assert.equal(result.quality.duplicateTimestampCount, 1);
  assert.equal(result.dataset.cellChannelCount, 2);
  assert.ok(result.issues.some((issue) => issue.code === 'STACK_TIMESTAMP_RESOLUTION'));
});

// ---------------------------------------------------------------------------
// 2. Real CSV parsing edge cases
// ---------------------------------------------------------------------------

test('parseCSV auto-detects tab-delimited T02 samples', () => {
  const csv = '时间\t电流\t电压\n0\t10\t180\n60\t11\t181';
  const rows = parseCSV(csv);
  assert.deepEqual(rows, [
    { 时间: '0', 电流: '10', 电压: '180' },
    { 时间: '60', 电流: '11', 电压: '181' }
  ]);
});

test('parseCSV preserves real vehicle header names with Chinese units', () => {
  const header = 'Timestamp,FC_MainSts,FC_CurrOut,FC_VoltOut,FC_NetPwrOut,FC_MinCellVoltage,FC_AvgCellVoltage,FC_VARVoltage,FC_VehicleIsolationR,FC_RunTime_Hours';
  const row = '2026-07-07 18:20:52,8.0,0.0,0.0,0.0,-24.0,-1.0,69.0,639.0,448.92';
  const rows = parseCSV(`${header}\n${row}`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['FC_MinCellVoltage'], '-24.0');
  assert.equal(rows[0]['FC_VehicleIsolationR'], '639.0');
});

test('parseCSV handles CRLF, LF, and bare CR without crashing', () => {
  const lf = parseCSV('a,b\n1,2\n3,4');
  const crlf = parseCSV('a,b\r\n1,2\r\n3,4');
  const bareCr = parseCSV('a,b\r1,2\r3,4');
  assert.deepEqual(lf, [{ a: '1', b: '2' }, { a: '3', b: '4' }]);
  assert.deepEqual(crlf, [{ a: '1', b: '2' }, { a: '3', b: '4' }]);
  assert.deepEqual(bareCr, []);
});

test('parseCSV keeps quoted commas and escaped quotes inside fields', () => {
  const csv = 'a,b,c\n"1,1", "he said ""ok""",3';
  const rows = parseCSV(csv);
  assert.deepEqual(rows, [{ a: '1,1', b: 'he said "ok"', c: '3' }]);
});

test('parseCSV tolerates empty trailing fields and blank last line', () => {
  const csv = 'a,b,c\n1,2,\n3,4,5\n';
  const rows = parseCSV(csv);
  assert.deepEqual(rows, [
    { a: '1', b: '2', c: '' },
    { a: '3', b: '4', c: '5' }
  ]);
});

// ---------------------------------------------------------------------------
// 3. Computation accuracy with known values
// ---------------------------------------------------------------------------

test('trapezoid energy integration matches hand calculation for constant power', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,20,30,10,6,1',
    '60,10,20,30,10,6,1'
  ].join('\n')));
  assert.ok(Math.abs(result.metrics.energyConsumedWh - (200 * 60 / 3600)) < 1e-12);
  assert.ok(Math.abs(result.metrics.hydrogenVolumeNl - (6 * 60 / 60)) < 1e-12);
});

test('specific energy equals energy divided by hydrogen volume when both complete', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,2,30,10,6,1',
    '60,10,2,30,10,6,1'
  ].join('\n')));
  const expected = result.metrics.energyConsumedWh / result.metrics.hydrogenVolumeNl;
  assert.ok(Math.abs(result.metrics.specificEnergyKWhPerNm3 - expected) < 1e-12);
});

test('slopePerMinute computes exact linear drift per minute', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,2,30,10,6,1',
    '60,20,2,30,10,6,1',
    '120,30,2,30,10,6,1'
  ].join('\n')));
  assert.ok(Math.abs(result.metrics.pressureDriftBarPerMin - 0) < 1e-12);
  assert.equal(result.quality.rowCount, 3);
});

test('median ignores NaN and returns finite standard deviation for partial data', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,2,30,10,6,1',
    '10,NaN,2,30,10,6,1',
    '20,30,2,30,10,6,1'
  ].join('\n')));
  assert.ok(Number.isFinite(result.metrics.steadyVoltageStdV));
  assert.equal(result.quality.invalidValueCounts.current_a, 1);
});

// ---------------------------------------------------------------------------
// 4. Compliance boundary display
// ---------------------------------------------------------------------------

test('demo profile report contains explicit non-certification boundary', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,2,30,10,6,1',
    '60,10,2,30,10,6,1'
  ].join('\n')));
  const markdown = reportMarkdown(result, 'boundary.csv');
  assert.match(markdown, /不是安全认证/);
  assert.match(markdown, /不替代企业正式安全标准/);
});

test('publicAnalysis strips raw rows, file names, and secrets from compliance display', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,2,30,10,6,1',
    '60,10,2,30,10,6,1'
  ].join('\n')), {
    testMetadata: { operator: 'secret-operator', rawDataRef: '/private/data.csv', calibrationRefs: 'cal-secret' },
    approvalEvidence: { approverId: 'A', approvalDate: '2026-08-22', approvalRef: 'R', profileRevision: '2025', profileRevisionRef: 'RR' }
  });
  const safe = publicAnalysis(result);
  assert.equal('rows' in safe, false);
  assert.equal('datasetType' in safe, false);
  assert.equal(safe.compliance?.approvalEvidence?.approverId, undefined);
  assert.doesNotMatch(JSON.stringify(safe), /secret-operator/);
  assert.doesNotMatch(JSON.stringify(safe), /\/private\/data\.csv/);
  assert.doesNotMatch(JSON.stringify(safe), /cal-secret/);
});

test('compliance status is DEMO_ONLY for unapproved demo profiles', () => {
  const profile = getProfile('electrolyzer-demo');
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,2,30,10,6,1',
    '60,10,2,30,10,6,1'
  ].join('\n')), { ...profile, profileId: profile.id });
  assert.equal(result.compliance.status, 'DEMO_ONLY');
  assert.equal(result.compliance.label, '仅演示，不作标准符合性判定');
});

// ---------------------------------------------------------------------------
// 5. Profile fieldMapping resolution
// ---------------------------------------------------------------------------

test('explicit profile fieldMapping overrides generic alias matching', () => {
  const profile = getProfile('electrolyzer-demo');
  const rows = parseCSV([
    'timestamp_s,current_a,电压(V),temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,2,30,10,6,1',
    '60,10,2,30,10,6,1'
  ].join('\n'));
  const result = analyzeRows(rows, {
    ...profile,
    profileId: profile.id,
    fieldMapping: { voltage_v: '电压(V)' }
  });
  assert.equal(result.schema.mapping.voltage_v, '电压(V)');
  assert.ok(result.issues.every((issue) => issue.code !== 'MAPPING_OVERRIDE_MISSING'));
});

test('unit conversion labels are exposed in schema conversions', () => {
  const rows = parseCSV([
    'timestamp_s,current_a,电压(mV),temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,2000,30,10,6,1',
    '60,10,2000,30,10,6,1'
  ].join('\n'));
  const result = analyzeRows(rows);
  assert.equal(result.schema.conversions.voltage_v.label, 'mV→V');
  assert.equal(result.schema.conversions.voltage_v.factor, 0.001);
});

test('profilesFromPackage rejects invalid dates and non-canonical standard URLs', () => {
  const result = profilesFromPackage({
    schemaVersion: 'h2-testlens.profile.v1',
    organization: 'test',
    profiles: [{
      id: 'bad', name: 'bad', approvalStatus: 'approved', evaluationMode: 'acceptance',
      methodId: 'GB/T 45541-2025', revision: '2025', status: 'current',
      standardRefs: [{ id: 'GB/T 45541-2025', title: 'PEM', uri: 'https://example.com/fake', status: 'current' }],
      methodSource: { sourceId: 'SRC', locator: 'LOC', evidenceType: 'register' },
      scopeEvidence: 'scope', workflowEvidence: 'workflow',
      publicationDate: '2025-99-01', effectiveDate: '2025-07-01',
      approvalEvidence: { approverId: 'A', approvalDate: '2025-99-01', approvalRef: 'R', profileRevision: '2025', profileRevisionRef: 'RR' },
      thresholds: { maxTemperatureC: 1, maxPressureBar: 1, maxLeakPpm: 1, maxVoltageStdV: 1, maxPressureDriftBarPerMin: 1 },
      supportedDatasetTypes: ['generic']
    }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('uri_not_canonical')));
  assert.ok(result.errors.some((error) => error.includes('approvalDate')));
});

// ---------------------------------------------------------------------------
// 6. Mobile-responsive UI elements
// ---------------------------------------------------------------------------

test('static page exposes mobile navigation and responsive breakpoints', async () => {
  const [page, css] = await Promise.all([
    readFile(join(here, '../src/index.html'), 'utf8'),
    readFile(join(here, '../src/styles.css'), 'utf8')
  ]);
  assert.match(page, /mobile-nav/);
  assert.match(css, /@media \(max-width:1080px\)/);
  assert.match(css, /@media \(max-width:680px\)/);
  assert.match(css, /@media \(max-width:[ ]?480px\)/);
  assert.match(css, /@media \(max-width:[ ]?420px\)/);
});

test('Vinext app page embeds mobile nav and responsive CSS classes', async () => {
  const page = await readFile(join(here, '../app/page.tsx'), 'utf8');
  assert.match(page, /mobile-nav/);
  assert.match(page, /mobile-break/);
  assert.match(page, /workspace-grid/);
  assert.match(page, /side-column/);
});

test('CSS switches desktop site nav to mobile nav at small viewports', async () => {
  const css = await readFile(join(here, '../src/styles.css'), 'utf8');
  assert.match(css, /\.mobile-nav \{ display: none; \}/);
  assert.match(css, /@media \(max-width:680px\) \{[\s\S]*\.mobile-nav \{ display: flex;/);
  assert.match(css, /@media \(max-width:680px\) \{[\s\S]*\.site-nav \{ display: none;/);
  assert.match(css, /updateThemeButton/);
});

test('metric grid collapses to fewer columns on small screens via CSS', async () => {
  const css = await readFile(join(here, '../src/styles.css'), 'utf8');
  assert.match(css, /\.metric-grid \{ display: grid; grid-template-columns: repeat\(4,minmax\(0,1fr\)\);/);
  assert.match(css, /@media \(max-width:680px\) \{[\s\S]*\.metric-grid \{ grid-template-columns: repeat\(2,minmax\(0,1fr\)\);/);
  assert.match(css, /@media \(max-width:[ ]?480px\) \{[\s\S]*\.metric-grid \{ grid-template-columns: 1fr;/);
});

test('enterprise table remains usable on touch devices with horizontal scroll', async () => {
  const css = await readFile(join(here, '../src/styles.css'), 'utf8');
  assert.match(css, /\.enterprise-table \{[\s\S]*overflow: auto;/);
  assert.match(css, /@media \(max-width:[ ]?480px\) \{[\s\S]*\.enterprise-table \{ -webkit-overflow-scrolling: touch; overflow-x: auto;/);
});

test('display sampling preserves session boundaries for long time series', () => {
  const rows = Array.from({ length: 7000 }, (_, i) => ({
    timestamp_s: i,
    session_id: i < 3500 ? 'file:a.csv' : 'file:b.csv',
    current_a: '10',
    voltage_v: '2'
  }));
  const sampled = sampleRowsForDisplay(rows, 6000);
  assert.equal(sampled.sampled, true);
  assert.equal(sampled.originalRowCount, 7000);
  assert.ok(sampled.rows.some((row) => row.session_id === 'file:a.csv'));
  assert.ok(sampled.rows.some((row) => row.session_id === 'file:b.csv'));
  assert.ok(sampled.rows.length <= 6000 + 2);
});
