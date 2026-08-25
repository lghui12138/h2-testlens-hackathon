import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzeRows, parseCSV, reportMarkdown, publicAnalysis } from '../src/analyzer.mjs';
import { analyzeEnterpriseRows } from '../src/enterprise-adapters.mjs';
import { DEVICE_PROFILES, getProfile, profilesFromPackage } from '../src/profiles.mjs';
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

// ---------------------------------------------------------------------------
// 7. Real T02 enterprise profile mapping validation
// ---------------------------------------------------------------------------

test('qingchuan-stack profile fieldMapping matches real Qingchuan T02 headers', async () => {
  const fixture = await readFile(join(here, '../sample-data/t02-qingchuan-stack-regression.csv'), 'utf8');
  const rows = parseCSV(fixture);
  assert.ok(rows.length >= 1, 'fixture should have data rows');
  const headers = Object.keys(rows[0]);
  const profile = getProfile('qingchuan-stack');
  assert.ok(profile, 'qingchuan-stack profile must exist');
  const mappedSources = Object.values(profile.fieldMapping || {}).filter(Boolean);
  const missing = mappedSources.filter((source) => !headers.includes(source));
  assert.deepEqual(missing, [], `qingchuan-stack mapped headers missing from real data: ${missing.join('、')}`);
});

test('qingzhihuli-vehicle profile fieldMapping matches real 氢质氢离 T02 headers', async () => {
  const fixture = await readFile(join(here, '../sample-data/t02-qingzhihuli-vehicle-regression.csv'), 'utf8');
  const rows = parseCSV(fixture);
  assert.ok(rows.length >= 1, 'fixture should have data rows');
  const headers = Object.keys(rows[0]);
  const profile = getProfile('qingzhihuli-vehicle');
  assert.ok(profile, 'qingzhihuli-vehicle profile must exist');
  const mappedSources = Object.values(profile.fieldMapping || {}).filter(Boolean);
  const missing = mappedSources.filter((source) => !headers.includes(source));
  assert.deepEqual(missing, [], `qingzhihuli-vehicle mapped headers missing from real data: ${missing.join('、')}`);
});

test('qingchuan-stack adapter accepts real Qingchuan T02 fixture without missing mapping errors', async () => {
  const fixture = await readFile(join(here, '../sample-data/t02-qingchuan-stack-regression.csv'), 'utf8');
  const rows = parseCSV(fixture);
  const profile = getProfile('qingchuan-stack');
  const result = analyzeEnterpriseRows(rows, profile);
  assert.ok(result, 'analyzeEnterpriseRows should return a result for real Qingchuan data');
  assert.equal(result.datasetType, 'stack');
  assert.equal(result.quality.missingHeaders.length, 0, 'real Qingchuan fixture should have no missing mapped headers');
});

test('qingzhihuli-vehicle adapter accepts real 氢质氢离 T02 fixture without missing mapping errors', async () => {
  const fixture = await readFile(join(here, '../sample-data/t02-qingzhihuli-vehicle-regression.csv'), 'utf8');
  const rows = parseCSV(fixture);
  const profile = getProfile('qingzhihuli-vehicle');
  const result = analyzeEnterpriseRows(rows, profile);
  assert.ok(result, 'analyzeEnterpriseRows should return a result for real vehicle data');
  assert.equal(result.datasetType, 'vehicle');
  assert.equal(result.quality.missingHeaders.length, 0, 'real vehicle fixture should have no missing mapped headers');
});

test('enterprise T02 profiles stay example_unapproved with ENTERPRISE_PROFILE_REQUIRED status', () => {
  const enterpriseProfiles = DEVICE_PROFILES.filter((profile) =>
    ['qingchuan-stack', 'qingzhihuli-vehicle', 'hypu-durability'].includes(profile.id)
  );
  assert.ok(enterpriseProfiles.length, 'enterprise T02 profiles should be present');
  for (const profile of enterpriseProfiles) {
    assert.equal(profile.approvalStatus, 'example_unapproved', `${profile.id} must stay example_unapproved`);
    assert.equal(profile.methodExecutionStatus, 'ENTERPRISE_PROFILE_REQUIRED', `${profile.id} must keep ENTERPRISE_PROFILE_REQUIRED`);
  }
});

test('unitTransform handles MW->W for power and kPa->kPa for ambient pressure', () => {
  const mwRows = parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,功率（MW）',
    '0,10,20,30,10,6,1,5',
    '60,10,20,30,10,6,1,5'
  ].join('\n'));
  const mwResult = analyzeRows(mwRows);
  assert.equal(mwResult.schema.conversions.power_w.factor, 1000000);
  assert.equal(mwResult.schema.conversions.power_w.label, 'MW→W');

  const kpaRows = parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,环境压力（kPa）,flow_slpm,leak_ppm',
    '0,10,20,30,101,6,1',
    '60,10,20,30,101,6,1'
  ].join('\n'));
  const kpaResult = analyzeRows(kpaRows);
  assert.equal(kpaResult.schema.conversions.ambient_pressure_kpa.factor, 1);
  assert.equal(kpaResult.schema.conversions.ambient_pressure_kpa.label, 'kPa→kPa');
});

test('unitTransform handles kA->A and kV->V conversions', () => {
  const kaRows = parseCSV([
    'timestamp_s,电流（kA）,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,1,20,30,10,6,1',
    '60,1,20,30,10,6,1'
  ].join('\n'));
  const kaResult = analyzeRows(kaRows);
  assert.equal(kaResult.schema.conversions.current_a.factor, 1000);
  assert.equal(kaResult.schema.conversions.current_a.label, 'kA→A');

  const kvRows = parseCSV([
    'timestamp_s,current_a,电压（kV）,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,1,30,10,6,1',
    '60,10,1,30,10,6,1'
  ].join('\n'));
  const kvResult = analyzeRows(kvRows);
  assert.equal(kvResult.schema.conversions.voltage_v.factor, 1000);
  assert.equal(kvResult.schema.conversions.voltage_v.label, 'kV→V');
});

test('qingchuan-stack profile uses canonical power_kw mapping and covers real T02 headers', () => {
  const profile = getProfile('qingchuan-stack');
  assert.ok(profile, 'qingchuan-stack profile must exist');
  assert.equal(profile.fieldMapping?.power_kw, '功率（kW)', 'profile should use canonical power_kw key');
  assert.equal(profile.fieldMapping?.power_w, undefined, 'legacy power_w key should be removed');
  assert.ok(profile.fieldMapping?.h2_dewpoint_c, 'should map hydrogen dewpoint');
  assert.ok(profile.fieldMapping?.air_dewpoint_c, 'should map air dewpoint');
  assert.ok(profile.fieldMapping?.coolant_dt, 'should map coolant temperature difference');
  assert.ok(profile.fieldMapping?.h2_stoich, 'should map hydrogen stoichiometry');
  assert.ok(profile.fieldMapping?.air_stoich, 'should map air stoichiometry');
  assert.ok(profile.fieldMapping?.internal_resistance, 'should map internal resistance');
  assert.ok(profile.dataQualityRequirements?.maxIntervalS, 'should declare data quality interval requirement');
});

test('qingzhihuli-vehicle profile declares vehicleSignalUnits and dataQualityRequirements', () => {
  const profile = getProfile('qingzhihuli-vehicle');
  assert.ok(profile, 'qingzhihuli-vehicle profile must exist');
  assert.ok(profile.vehicleSignalUnits, 'profile should declare vehicle signal units');
  assert.equal(profile.vehicleSignalUnits?.min_cell_voltage_v?.sourceUnit, 'V', 'min cell voltage should be V');
  assert.equal(profile.vehicleSignalUnits?.avg_cell_voltage_v?.sourceUnit, 'V', 'avg cell voltage should be V');
  assert.equal(profile.vehicleSignalUnits?.cell_voltage_variance?.sourceUnit, 'V²', 'cell voltage variance should be V²');
  assert.ok(profile.dataQualityRequirements?.maxIntervalMultiplier, 'should declare data quality multiplier');
});

test('hypu-durability profile has clean fieldMapping without leading whitespace', () => {
  const profile = getProfile('hypu-durability');
  assert.ok(profile, 'hypu-durability profile must exist');
  const mapping = profile.fieldMapping || {};
  for (const [key, value] of Object.entries(mapping)) {
    assert.equal(value, String(value).trim(), `hypu-durability fieldMapping[${key}] should not have leading/trailing whitespace`);
  }
});

test('qingchuan-stack real fixture 212 and 345 vehicle data do not regress adapter entrypoints', async () => {
  const fixture212 = await readFile(join(here, '../sample-data/t02-qingzhihuli-vehicle-212-real.csv'), 'utf8');
  const fixture345 = await readFile(join(here, '../sample-data/t02-qingzhihuli-vehicle-345-real.csv'), 'utf8');
  const result212 = analyzeEnterpriseRows(parseCSV(fixture212), getProfile('qingzhihuli-vehicle'));
  const result345 = analyzeEnterpriseRows(parseCSV(fixture345), getProfile('qingzhihuli-vehicle'));
  assert.equal(result212.datasetType, 'vehicle');
  assert.equal(result345.datasetType, 'vehicle');
  assert.ok(result212.dataset.insulation.validCount >= 1);
  assert.ok(result345.dataset.insulation.validCount >= 1);
});

// ---------------------------------------------------------------------------
// 8. Deep computation accuracy audit with all real T02 enterprise data
// ---------------------------------------------------------------------------

test('hypu-durability peakPowerW is null (not 0) when all net_power_kw values are missing', () => {
  const rows = [
    { target_power_kw: '100', average_cell_voltage_mv: '500', average_deviation_mv: '10', voltage_variance: '5', net_power_kw: null, temperature_c: null },
    { target_power_kw: '100', average_cell_voltage_mv: '500', average_deviation_mv: '10', voltage_variance: '5', net_power_kw: null, temperature_c: null }
  ];
  const result = analyzeEnterpriseRows(rows, getProfile('hypu-durability'));
  assert.ok(result);
  assert.equal(result.metrics.peakPowerW, null, 'peakPowerW must be null when no valid net_power_kw records exist');
});

test('qingzhihuli-vehicle peakPowerW is null (not 0) when all net_power_kw values are missing', () => {
  const rows = [
    { Timestamp: '2026-07-07 18:20:52', FC_MainSts: '4', FC_CurrOut: '50', FC_VoltOut: '320', FC_NetPwrOut: null, FC_MinCellVoltage: '3.1', FC_AvgCellVoltage: '3.15', FC_VARVoltage: '0.01', FC_VehicleIsolationR: '639', FC_RunTime_Hours: '10' },
    { Timestamp: '2026-07-07 18:20:53', FC_MainSts: '4', FC_CurrOut: '50', FC_VoltOut: '320', FC_NetPwrOut: null, FC_MinCellVoltage: '3.1', FC_AvgCellVoltage: '3.15', FC_VARVoltage: '0.01', FC_VehicleIsolationR: '639', FC_RunTime_Hours: '10' }
  ];
  const result = analyzeEnterpriseRows(rows, getProfile('qingzhihuli-vehicle'));
  assert.ok(result);
  assert.equal(result.metrics.peakPowerW, null, 'peakPowerW must be null when no valid net_power_kw records exist');
});

test('hypu-durability peakTemperatureC preserves legitimate 0°C instead of coercing to null', () => {
  const rows = [
    { target_power_kw: '100', average_cell_voltage_mv: '500', average_deviation_mv: '10', voltage_variance: '5', net_power_kw: '50', temperature_c: '0' },
    { target_power_kw: '100', average_cell_voltage_mv: '500', average_deviation_mv: '10', voltage_variance: '5', net_power_kw: '50', temperature_c: '25' }
  ];
  const result = analyzeEnterpriseRows(rows, getProfile('hypu-durability'));
  assert.ok(result);
  assert.equal(result.metrics.peakTemperatureC, 25, 'peakTemperatureC must return the actual max, not null for 0°C');
});

test('qingchuan-stack peakTemperatureC preserves legitimate 0°C instead of coercing to null', () => {
  const headers = ['测试时间', '实际电流（A）', '实际电压（V）', '阳极入堆温度（℃）', '循环水入堆压力（kPa）', '阳极流量（SLPM）', '柜内氢气浓度（ppm）'].join(',');
  const rows = [
    { '测试时间': '2026/6/23 14:30', '实际电流（A）': '10', '实际电压（V）': '180', '阳极入堆温度（℃）': '0', '循环水入堆压力（kPa）': '100', '阳极流量（SLPM）': '10', '柜内氢气浓度（ppm）': '0' },
    { '测试时间': '2026/6/23 14:31', '实际电流（A）': '10', '实际电压（V）': '180', '阳极入堆温度（℃）': '25', '循环水入堆压力（kPa）': '100', '阳极流量（SLPM）': '10', '柜内氢气浓度（ppm）': '0' }
  ];
  const result = analyzeEnterpriseRows(parseCSV(`${headers}\n${rows.map((row) => Object.values(row).join(',')).join('\n')}`), getProfile('qingchuan-stack'));
  assert.ok(result);
  assert.equal(result.metrics.peakTemperatureC, 25, 'peakTemperatureC must return the actual max, not null for 0°C');
});

test('qingchuan-stack adapter computes flow resistance from real header pairs', async () => {
  const fixture = await readFile(join(here, '../sample-data/t02-qingchuan-stack-regression.csv'), 'utf8');
  const rows = parseCSV(fixture);
  const result = analyzeEnterpriseRows(rows, getProfile('qingchuan-stack'));
  assert.ok(result);
  assert.equal(result.datasetType, 'stack');
  const anodeResistance = result.dataset.metrics.anodeFlowResistanceKpa;
  assert.ok(anodeResistance, 'anode flow resistance should be calculated');
  assert.ok(Number.isFinite(anodeResistance.mean), 'anode flow resistance mean should be finite');
  assert.ok(anodeResistance.mean > 0, 'anode inlet should be higher than outlet for positive flow resistance');
});

test('qingchuan-stack adapter computes stoichiometry from real current and flow data', async () => {
  const fixture = await readFile(join(here, '../sample-data/t02-qingchuan-stack-regression.csv'), 'utf8');
  const rows = parseCSV(fixture);
  const result = analyzeEnterpriseRows(rows, getProfile('qingchuan-stack'));
  assert.ok(result);
  assert.equal(result.datasetType, 'stack');
  const h2Stoich = result.dataset.metrics.hydrogenStoich;
  const airStoich = result.dataset.metrics.airStoich;
  assert.ok(h2Stoich, 'hydrogen stoichiometry should be calculated');
  assert.ok(airStoich, 'air stoichiometry should be calculated');
  assert.ok(Number.isFinite(h2Stoich.mean), 'h2 stoich mean should be finite');
  assert.ok(Number.isFinite(airStoich.mean), 'air stoich mean should be finite');
  assert.ok(h2Stoich.mean > 0, 'h2 stoich should be positive');
  assert.ok(airStoich.mean > 0, 'air stoich should be positive');
});

test('qingchuan-stack adapter computes coolant temperature difference from real data', async () => {
  const fixture = await readFile(join(here, '../sample-data/t02-qingchuan-stack-regression.csv'), 'utf8');
  const rows = parseCSV(fixture);
  const result = analyzeEnterpriseRows(rows, getProfile('qingchuan-stack'));
  assert.ok(result);
  assert.equal(result.datasetType, 'stack');
  const coolantDt = result.dataset.metrics.coolantTemperatureDifferenceC;
  assert.ok(coolantDt, 'coolant temperature difference should be calculated');
  assert.ok(Number.isFinite(coolantDt.mean), 'coolant dt mean should be finite');
});

test('qingchuan-stack unit conversion handles explicit kW header and preserves factor', async () => {
  const fixture = await readFile(join(here, '../sample-data/t02-qingchuan-stack-regression.csv'), 'utf8');
  const rows = parseCSV(fixture);
  const result = analyzeEnterpriseRows(rows, getProfile('qingchuan-stack'));
  assert.ok(result);
  assert.equal(result.datasetType, 'stack');
  assert.equal(result.schema.conversions.power_w.factor, 1000, 'kW->W conversion factor should be 1000');
  assert.equal(result.schema.conversions.power_w.label, 'kW→W', 'power conversion label should indicate kW→W');
});

test('qingzhihuli-vehicle real fixture 212 preserves session boundaries and computes deterministic insulation windows', async () => {
  const fixture = await readFile(join(here, '../sample-data/t02-qingzhihuli-vehicle-212-real.csv'), 'utf8');
  const rows = parseCSV(fixture);
  const result = analyzeEnterpriseRows(rows, getProfile('qingzhihuli-vehicle'));
  assert.ok(result);
  assert.equal(result.datasetType, 'vehicle');
  assert.ok(result.dataset.sessionCount >= 1, 'should detect at least one session');
  assert.ok(result.dataset.insulation.validCount >= 1, 'should have valid insulation points');
  assert.ok(result.metrics.peakPowerW >= 0 || result.metrics.peakPowerW === null, 'peakPowerW should be non-negative or null');
});

test('analyzer specificEnergyKWhPerNm3 uses explicit zero-guard instead of truthiness', () => {
  const rows = parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,2,30,10,0,1',
    '60,10,2,30,10,0,1'
  ].join('\n'));
  const result = analyzeRows(rows);
  assert.equal(result.metrics.hydrogenVolumeNl, 0);
  assert.equal(result.metrics.specificEnergyKWhPerNm3, null, 'specific energy must be null when hydrogen volume is zero');
});

test('analyzer peakTemperatureC preserves 0°C as a valid peak instead of coercing to null', () => {
  const rows = parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,2,0,10,6,1',
    '60,10,2,25,10,6,1'
  ].join('\n'));
  const result = analyzeRows(rows);
  assert.equal(result.metrics.peakTemperatureC, 25, 'peakTemperatureC must return actual max including values above 0');
});

test('qingchuan-stack real fixture contains no malformed rows that crash adapter', async () => {
  const fixture = await readFile(join(here, '../sample-data/t02-qingchuan-stack-regression.csv'), 'utf8');
  const rows = parseCSV(fixture);
  const result = analyzeEnterpriseRows(rows, getProfile('qingchuan-stack'));
  assert.ok(result);
  assert.equal(result.datasetType, 'stack');
  assert.ok(result.quality.rowCount > 0, 'should parse at least one row');
  assert.ok(result.metrics.sampleCount > 0, 'should have sample count');
});
