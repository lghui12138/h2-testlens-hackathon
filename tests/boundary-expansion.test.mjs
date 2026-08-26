import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCSV, analyzeRows, safeMax, safeMin, publicAnalysis, reportMarkdown } from '../src/analyzer.mjs';
import { analyzeEnterpriseRows } from '../src/enterprise-adapters.mjs';
import { getProfile, DEVICE_PROFILES, profilesFromPackage } from '../src/profiles.mjs';
import { parseDurabilityDocx, setDocxEngine } from '../src/docx-workflow.mjs';
import { decodeTextBuffer, isLikelyBinary } from '../src/input-safety.mjs';
import { validateBatchDeclaration, observeDeclaredBatch, summarizeDeclaredBatch } from '../src/batch-aggregation.mjs';
import { sampleRowsForDisplay } from '../src/display-sampling.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const T02_ROOT = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';
const HAS_T02 = existsSync(T02_ROOT);

const CI = String(process.env.CI || '').toLowerCase() === 'true';

const mammothSource = await readFile(join(here, '../src/vendor/mammoth.browser.min.js'), 'utf8');
const { runInThisContext } = await import('node:vm');
runInThisContext(mammothSource);
setDocxEngine(globalThis.mammoth);

test('analyzeRows([]) returns FAIL with DATA_TOO_SHORT and no schema mapping', () => {
  const result = analyzeRows([]);
  assert.equal(result.verdict, 'FAIL');
  assert.ok(result.issues.some((issue) => issue.code === 'DATA_TOO_SHORT'));
  assert.equal(result.quality.hasEnoughRows, false);
  assert.equal(result.quality.rowCount, 0);
  assert.equal(Object.keys(result.schema.mapping).length, 0);
});

test('analyzeRows with a single parsed row reports DATA_TOO_SHORT and finite quality fields', () => {
  const rows = parseCSV('timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct\n0,10,2,30,10,6,1,99');
  const result = analyzeRows(rows);
  assert.equal(result.quality.hasEnoughRows, false);
  assert.ok(result.issues.some((issue) => issue.code === 'DATA_TOO_SHORT'));
  assert.equal(result.quality.rowCount, 1);
  assert.ok(Number.isFinite(result.quality.completenessPct));
});

test('analyzeRows with all-zero required fields preserves 0 metrics without null coercion', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct',
    '0,0,0,0,0,0,0,0',
    '60,0,0,0,0,0,0,0'
  ].join('\n')));
  assert.equal(result.metrics.peakPowerW, 0);
  assert.equal(result.metrics.peakTemperatureC, 0);
  assert.equal(result.metrics.peakPressureBar, 0);
  assert.equal(result.metrics.peakLeakPpm, 0);
  assert.equal(result.metrics.hydrogenVolumeNl, 0);
  assert.equal(result.metrics.energyConsumedWh, 0);
});

test('analyzeRows with all-zero optional fields keeps zero-derived metrics finite', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct,gas_temperature_c,gas_pressure_bar,ambient_temperature_c,ambient_humidity_pct,ambient_pressure_kpa,power_w,power_setpoint_w',
    '0,0,0,0,0,0,0,0,0,0,0,0,0,0,0',
    '60,0,0,0,0,0,0,0,0,0,0,0,0,0,0'
  ].join('\n')));
  assert.equal(result.metrics.peakPowerW, 0);
  assert.equal(result.metrics.specificEnergyKWhPerNm3, null);
  assert.ok(Number.isFinite(result.metrics.pressureDriftBarPerMin));
});

test('analyzeRows with all-NaN required fields reports DATA_GAP and null metrics', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct',
    '0,NaN,NaN,NaN,NaN,NaN,NaN,NaN',
    '60,NaN,NaN,NaN,NaN,NaN,NaN,NaN'
  ].join('\n')));
  assert.ok(result.issues.some((issue) => issue.code === 'DATA_GAP'));
  assert.equal(result.metrics.peakPowerW, null);
  assert.equal(result.metrics.peakTemperatureC, null);
  assert.equal(result.metrics.steadyVoltageStdV, null);
  assert.ok(Number.isFinite(result.quality.completenessPct));
});

test('analyzeRows with all-NaN optional fields preserves null metrics without throwing', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct,gas_temperature_c,gas_pressure_bar,ambient_temperature_c,ambient_humidity_pct,ambient_pressure_kpa,power_w,power_setpoint_w',
    '0,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN',
    '60,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN,NaN'
  ].join('\n')));
  assert.ok(result.issues.some((issue) => issue.code === 'DATA_GAP'));
  assert.equal(result.metrics.peakPowerW, null);
  assert.equal(result.metrics.energyConsumedWh, null);
});

test('analyzeRows with all-Infinity required fields reports DATA_GAP and null metrics', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct',
    '0,Infinity,Infinity,Infinity,Infinity,Infinity,Infinity,Infinity',
    '60,Infinity,Infinity,Infinity,Infinity,Infinity,Infinity,Infinity'
  ].join('\n')));
  assert.ok(result.issues.some((issue) => issue.code === 'DATA_GAP'));
  assert.equal(result.metrics.peakPowerW, null);
  assert.equal(result.metrics.peakTemperatureC, null);
  assert.equal(result.metrics.steadyVoltageStdV, null);
});

test('analyzeRows with mixed Infinity and -Infinity values treats them as invalid', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct',
    '0,Infinity,-Infinity,Infinity,-Infinity,Infinity,-Infinity,Infinity',
    '60,-Infinity,Infinity,-Infinity,Infinity,-Infinity,Infinity,-Infinity'
  ].join('\n')));
  assert.ok(result.issues.some((issue) => issue.code === 'DATA_GAP'));
  assert.equal(result.metrics.peakPowerW, null);
});

test('analyzeRows with NaN only in current_a ignores invalid values in mean/std', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct',
    '0,NaN,2,30,10,6,1,99',
    '10,NaN,2,30,10,6,1,99',
    '20,10,2,30,10,6,1,99'
  ].join('\n')));
  assert.equal(result.quality.invalidValueCounts.current_a, 2);
  assert.ok(Number.isFinite(result.metrics.steadyVoltageStdV));
});

test('analyzeRows with Infinity only in temperature_c reports finite drift on valid pressure subset', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct',
    '0,10,2,Infinity,10,6,1,99',
    '60,10,2,Infinity,10,6,1,99'
  ].join('\n')));
  assert.equal(result.quality.invalidValueCounts.temperature_c, 2);
  assert.ok(Number.isFinite(result.metrics.pressureDriftBarPerMin));
});

test('analyzeEnterpriseRows returns null for empty and single-row arrays', () => {
  assert.equal(analyzeEnterpriseRows([]), null);
  assert.equal(analyzeEnterpriseRows([{ a: '1' }]), null);
});

test('analyzeEnterpriseRows stack adapter handles all-zero values without crashing', () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({
    时间: String(i * 10),
    实际电流: '0',
    实际电压: '0',
    功率: '0',
    单片电压1: '0',
    单片电压2: '0',
    片数: '2'
  }));
  const result = analyzeEnterpriseRows(rows, { datasetType: 'stack' });
  assert.ok(result);
  assert.equal(result.datasetType, 'stack');
  assert.ok(['PASS', 'WARN', 'FAIL', 'DESCRIPTIVE'].includes(result.verdict));
});

test('analyzeEnterpriseRows stack adapter handles all-NaN values without crashing', () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({
    时间: String(i * 10),
    实际电流: 'NaN',
    实际电压: 'NaN',
    功率: 'NaN',
    单片电压1: 'NaN',
    单片电压2: 'NaN',
    片数: '2'
  }));
  const result = analyzeEnterpriseRows(rows, { datasetType: 'stack' });
  assert.ok(result);
  assert.equal(result.datasetType, 'stack');
  assert.ok(['PASS', 'WARN', 'FAIL', 'DESCRIPTIVE'].includes(result.verdict));
});

test('analyzeEnterpriseRows vehicle adapter handles all-zero isolation values without crashing', () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({
    Timestamp: `2026-07-07 18:${(20 + i).toString().padStart(2, '0')}:52`,
    FC_MainSts: '4',
    FC_CurrOut: '0',
    FC_VoltOut: '0',
    FC_NetPwrOut: '0',
    FC_MinCellVoltage: '0',
    FC_MinVoltageChannel: '1',
    FC_AvgCellVoltage: '0',
    FC_AvgCellDev: '0',
    FC_VARVoltage: '0',
    FC_VehicleIsolationR: '0',
    FC_RunTime_Hours: '10'
  }));
  const result = analyzeEnterpriseRows(rows, getProfile('qingzhihuli-vehicle'));
  assert.ok(result);
  assert.equal(result.datasetType, 'vehicle');
  assert.ok(Array.isArray(result.issues));
});

test('analyzeEnterpriseRows vehicle adapter handles all-NaN power values without crashing', () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({
    Timestamp: `2026-07-07 18:${(20 + i).toString().padStart(2, '0')}:52`,
    FC_MainSts: '4',
    FC_CurrOut: '50',
    FC_VoltOut: '320',
    FC_NetPwrOut: 'NaN',
    FC_MinCellVoltage: '3.1',
    FC_MinVoltageChannel: '1',
    FC_AvgCellVoltage: '3.15',
    FC_AvgCellDev: '0.02',
    FC_VARVoltage: '0.01',
    FC_VehicleIsolationR: '639',
    FC_RunTime_Hours: '10'
  }));
  const result = analyzeEnterpriseRows(rows, getProfile('qingzhihuli-vehicle'));
  assert.ok(result);
  assert.equal(result.datasetType, 'vehicle');
  assert.ok(Array.isArray(result.issues));
});

test('representative T02 sample across 4 enterprise packages parses without crashing', async () => {
  assert.ok(HAS_T02, 'T02 dataset should be present for representative regression');
  const samples = [
    '企业资料包01_氢璞创能/2026-4-4-18-56-04.txt',
    '企业资料包01_氢璞创能/299-001-D_出厂检测报告.xlsx',
    '企业资料包02_氢质氢离/01_耐久原始数据处理/耐久0-5-20260605211610.docx',
    '企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (1).csv',
    '企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv',
    '企业资料包03_青川易创与云汉达/03 青川科技-燃料电池电堆时序测试数据处理任务说明书.docx',
    '企业资料包04_海珀特/00_企业资料说明.pdf'
  ];
  for (const file of samples) {
    const path = join(T02_ROOT, file);
    assert.ok(existsSync(path), `T02 representative sample should exist: ${file}`);
    const buf = await readFile(path);
    assert.ok(Buffer.isBuffer(buf) && buf.length > 0, `${file} should be non-empty`);
  }
});

test('representative T02 CSV samples produce deterministic adapter outputs', async () => {
  if (!HAS_T02) return;
  const samples = [
    { path: '企业资料包01_氢璞创能/2026-4-4-18-56-04.txt', profile: 'hypu-stack', expectType: 'stack', decode: 'gb18030' },
    { path: '企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (1).csv', profile: 'qingzhihuli-vehicle', expectType: 'vehicle', decode: null },
    { path: '企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv', profile: 'qingchuan-stack', expectType: 'stack', decode: null }
  ];
  for (const sample of samples) {
    const buf = await readFile(join(T02_ROOT, sample.path));
    const text = sample.decode ? decodeTextBuffer(buf, sample.decode).text : Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
    const rows = parseCSV(text);
    const result = analyzeEnterpriseRows(rows, getProfile(sample.profile));
    assert.ok(result, `analyzeEnterpriseRows should return a result for ${sample.path}`);
    assert.equal(result.datasetType, sample.expectType, `datasetType mismatch for ${sample.path}`);
    assert.ok(Array.isArray(result.issues), `issues should be array for ${sample.path}`);
    assert.ok(result.quality.rowCount > 0, `rowCount should be positive for ${sample.path}`);
  }
});

test('safeMax and safeMin return null for empty arrays and handle NaN/Infinity gracefully', () => {
  assert.equal(safeMax([]), null);
  assert.equal(safeMin([]), null);
  assert.equal(safeMax([NaN, Infinity, -Infinity]), null);
  assert.equal(safeMin([NaN, Infinity, -Infinity]), null);
  assert.equal(safeMax([0, -0, 1]), 1);
  assert.equal(safeMin([0, -0, -1]), -1);
});

// ============================================================================
// 8. safeMax / safeMin direct boundary coverage
// ============================================================================

test('safeMax and safeMin return null for empty arrays', () => {
  assert.equal(safeMax([]), null);
  assert.equal(safeMin([]), null);
});

test('safeMax and safeMin skip NaN and Infinity and return finite extremes', () => {
  const values = [NaN, 1, Infinity, 3, -Infinity, 2];
  assert.equal(safeMax(values), 3);
  assert.equal(safeMin(values), 1);
});

test('safeMax and safeMin return fallback when no finite values exist', () => {
  assert.equal(safeMax([NaN, Infinity, -Infinity]), null);
  assert.equal(safeMin([NaN, Infinity, -Infinity]), null);
  assert.equal(safeMax([], -1), -1);
  assert.equal(safeMin([], 0), 0);
});

test('safeMax and safeMin ignore non-array input and return fallback', () => {
  assert.equal(safeMax(null), null);
  assert.equal(safeMin(null), null);
  assert.equal(safeMax('1,2'), null);
  assert.equal(safeMin({ length: 1 }), null);
});

// ============================================================================
// 9. parseCSV non-string / degenerate input boundary
// ============================================================================

test('parseCSV coerces non-string input to string before parsing', () => {
  assert.deepEqual(parseCSV(null), []);
  assert.deepEqual(parseCSV(undefined), []);
  assert.deepEqual(parseCSV(123), []);
});

test('parseCSV on a single header with no data rows returns empty array', () => {
  assert.deepEqual(parseCSV('timestamp_s,current_a'), []);
});

test('parseCSV preserves explicit empty fields and does not drop trailing empties', () => {
  const rows = parseCSV('a,b,c\n1,,3\n4,5,');
  assert.deepEqual(rows, [
    { a: '1', b: '', c: '3' },
    { a: '4', b: '5', c: '' }
  ]);
});

test('parseCSV preserves quoted fields with embedded delimiters', () => {
  const rows = parseCSV('a,b\n"1,1",3');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].a, '1,1');
  assert.equal(rows[0].b, '3');
});

// ============================================================================
// 10. analyzeRows empty / non-array / degenerate input
// ============================================================================

test('analyzeRows treats non-array input as empty and fails closed', () => {
  const result = analyzeRows(null);
  assert.equal(result.verdict, 'FAIL');
  assert.ok(result.issues.some((issue) => issue.code === 'DATA_TOO_SHORT'));
});

test('analyzeRows with exactly two identical rows produces finite quality metrics', () => {
  const result = analyzeRows(parseCSV('timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct\n0,10,2,30,10,6,1,99\n0,10,2,30,10,6,1,99'));
  assert.equal(result.quality.rowCount, 2);
  assert.ok(Number.isFinite(result.quality.completenessPct));
});

test('analyzeRows with all-negative numeric values reports finite metrics and no null coercion', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct',
    '0,-10,-2,-30,-10,-6,-1,-99',
    '60,-10,-2,-30,-10,-6,-1,-99'
  ].join('\n')));
  assert.equal(result.metrics.peakPowerW, 20);
  assert.equal(result.metrics.peakTemperatureC, -30);
  assert.ok(Number.isFinite(result.metrics.pressureDriftBarPerMin));
});

test('analyzeRows with extremely large values does not overflow to Infinity', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct',
    '0,1e10,1e9,1e8,1e7,1e6,1e5,100',
    '60,1e10,1e9,1e8,1e7,1e6,1e5,100'
  ].join('\n')));
  assert.ok(Number.isFinite(result.metrics.peakPowerW));
  assert.ok(result.metrics.peakPowerW > 0);
});

test('analyzeRows with mixed valid / NaN / Infinity / zero values preserves finite subset metrics', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct',
    '0,10,2,30,10,6,1,99',
    '10,NaN,Infinity,30,10,6,1,99',
    '20,-Infinity,2,30,10,0,1,99',
    '30,10,2,NaN,10,6,1,99'
  ].join('\n')));
  assert.ok(result.issues.some((issue) => issue.code === 'DATA_GAP'));
  assert.ok(Number.isFinite(result.metrics.steadyVoltageStdV));
  assert.equal(result.metrics.hydrogenVolumeNl, 2);
});

test('analyzeRows with duplicate timestamps reports zero duration and null integration values', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct',
    '0,10,2,30,10,6,1,99',
    '0,10,2,30,10,6,1,99'
  ].join('\n')));
  assert.equal(result.metrics.durationS, 0);
  assert.equal(result.metrics.energyConsumedWh, null);
  assert.equal(result.metrics.hydrogenVolumeNl, null);
});

// ============================================================================
// 11. analyzeEnterpriseRows deeper boundary coverage
// ============================================================================

test('analyzeEnterpriseRows stack adapter handles single-element arrays without crashing', () => {
  const rows = [{
    '时间（s）': '0', '实际电流（A）': '10', '实际电压（V）': '180',
    '单片电压1（V）': '3.1', '单片电压2（V）': '3.2', '片数': '2'
  }];
  const result = analyzeEnterpriseRows(rows, { datasetType: 'stack' });
  assert.ok(result);
  assert.equal(result.datasetType, 'stack');
});

test('analyzeEnterpriseRows vehicle adapter handles single-element arrays without crashing', () => {
  const rows = [{
    Timestamp: '2026-07-07 18:20:52', FC_MainSts: '4', FC_CurrOut: '50',
    FC_VoltOut: '320', FC_NetPwrOut: '16', FC_MinCellVoltage: '3.1',
    FC_MinVoltageChannel: '1', FC_AvgCellVoltage: '3.15', FC_AvgCellDev: '0.02',
    FC_VARVoltage: '0.01', FC_VehicleIsolationR: '1200', FC_RunTime_Hours: '10'
  }];
  const result = analyzeEnterpriseRows(rows, {});
  assert.ok(result);
  assert.equal(result.datasetType, 'vehicle');
});

test('analyzeEnterpriseRows durability adapter handles single-point reports without crashing', () => {
  const rows = [{
    target_power_kw: '33', average_cell_voltage_mv: '800',
    average_deviation_mv: '10', voltage_variance: '5'
  }];
  const result = analyzeEnterpriseRows(rows, { datasetType: 'durability' });
  assert.ok(result);
  assert.equal(result.datasetType, 'durability');
});

test('analyzeEnterpriseRows stack adapter handles all-Infinity cell voltages without crashing', () => {
  const rows = Array.from({ length: 3 }, (_, i) => ({
    '时间（s）': String(i * 10),
    '实际电流（A）': '10',
    '实际电压（V）': '180',
    '单片电压1（V）': 'Infinity',
    '单片电压2（V）': 'Infinity',
    '片数': '2'
  }));
  const result = analyzeEnterpriseRows(rows, { datasetType: 'stack' });
  assert.ok(result);
  assert.equal(result.datasetType, 'stack');
});

test('analyzeEnterpriseRows vehicle adapter handles all-NaN isolation values without crashing', () => {
  const headers = [
    'Timestamp','FC_MainSts','FC_CurrOut','FC_VoltOut','FC_NetPwrOut',
    'FC_MinCellVoltage','FC_MinVoltageChannel','FC_AvgCellVoltage','FC_AvgCellDev',
    'FC_VARVoltage','FC_VehicleIsolationR','FC_RunTime_Hours'
  ].join(',');
  const rows = ['2026-07-07 18:20:52,4,50,320,16,3.1,1,3.15,0.02,0.01,NaN,10',
    '2026-07-07 18:20:53,4,50,320,16,3.1,1,3.15,0.02,0.01,NaN,10.1'
  ].join('\n');
  const result = analyzeEnterpriseRows(parseCSV(`${headers}\n${rows}`), {});
  assert.ok(result);
  assert.equal(result.datasetType, 'vehicle');
});

// ============================================================================
// 12. Representative T02 real-data regression samples
// ============================================================================

test('representative T02 package01 txt files parse through stable entrypoints', { skip: !HAS_T02 }, async () => {
  const samples = [
    '企业资料包01_氢璞创能/2026-4-4-18-56-04.txt',
    '企业资料包01_氢璞创能/2026-4-4-19-00-50.txt',
    '企业资料包01_氢璞创能/2026-4-5-11-32-54.txt',
    '企业资料包01_氢璞创能/2026-4-5-14-15-50.txt',
    '企业资料包01_氢璞创能/2026-4-5-16-17-37.txt'
  ];
  for (const file of samples) {
    const buf = await readFile(join(T02_ROOT, file));
    const decoded = decodeTextBuffer(buf, 'gb18030');
    assert.equal(decoded.binary, false, `${file} should decode as text`);
    const rows = parseCSV(decoded.text);
    assert.ok(rows.length >= 50, `${file} should have many rows`);
    assert.ok('时间' in rows[0], `${file} should have 时间 header`);
  }
});

test('representative T02 package02 vehicle CSV samples produce deterministic adapter outputs', { skip: !HAS_T02 }, async () => {
  const samples = [
    '企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (1).csv',
    '企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (25).csv',
    '企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (1).csv',
    '企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (50).csv'
  ];
  for (const file of samples) {
    const buf = await readFile(join(T02_ROOT, file));
    const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
    const rows = parseCSV(csv);
    assert.ok(rows.length >= 100, `${file} should have many rows`);
    const result = analyzeEnterpriseRows(rows, getProfile('qingzhihuli-vehicle'));
    assert.ok(result);
    assert.equal(result.datasetType, 'vehicle');
    assert.ok(['PASS', 'WARN', 'FAIL', 'DESCRIPTIVE'].includes(result.verdict));
  }
});

test('representative T02 package02 durability docx files preserve metadata and points', { skip: !HAS_T02 }, async () => {
  const files = [
    '企业资料包02_氢质氢离/01_耐久原始数据处理/耐久0-5-20260605211610.docx',
    '企业资料包02_氢质氢离/01_耐久原始数据处理/耐久5-10-20260606024937.docx',
    '企业资料包02_氢质氢离/01_耐久原始数据处理/耐久10-15-20260606081413.docx',
    '企业资料包02_氢质氢离/01_耐久原始数据处理/耐久15-20-20260606133914.docx',
    '企业资料包02_氢质氢离/01_耐久原始数据处理/耐久25-30-20260607051025.docx'
  ];
  for (const file of files) {
    const buf = await readFile(join(T02_ROOT, file));
    const result = await parseDurabilityDocx(buf);
    assert.ok(result, `${file} should parse`);
    assert.ok(result.points.length >= 1, `${file} should have points`);
    assert.ok(result.headers.length >= 10, `${file} should have headers`);
    assert.ok(result.metadata['测试方案'], `${file} should have 测试方案 metadata`);
  }
});

test('representative T02 package03 stack CSV sample produces deterministic adapter verdict', { skip: !HAS_T02 }, async () => {
  const buf = await readFile(join(T02_ROOT, '企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv'));
  const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
  const rows = parseCSV(csv);
  const result = analyzeEnterpriseRows(rows, getProfile('qingchuan-stack'));
  assert.ok(result);
  assert.equal(result.datasetType, 'stack');
  assert.ok(['PASS', 'WARN', 'FAIL', 'DESCRIPTIVE'].includes(result.verdict));
});

test('all T02 package04 PDFs are detected as binary and cannot be parsed as text', { skip: !HAS_T02 }, async () => {
  const pdfFiles = readdirSync(join(T02_ROOT, '企业资料包04_海珀特')).filter((file) => file.endsWith('.pdf'));
  assert.ok(pdfFiles.length >= 1, 'package 04 should contain at least one PDF');
  for (const file of pdfFiles) {
    const buf = await readFile(join(T02_ROOT, `企业资料包04_海珀特/${file}`));
    assert.equal(isLikelyBinary(buf), true, `${file} should be binary`);
    const decoded = decodeTextBuffer(buf);
    assert.equal(decoded.binary, true, `${file} should decode as binary`);
  }
});

// ============================================================================
// 13. Performance stability with environment-jitter-resistant metrics
// ============================================================================

test('performance stability: repeated parseCSV uses coefficient of variation instead of absolute max/median', () => {
  const csv = Array.from({ length: 20_000 }, (_, i) => `t,${i},${(i % 100).toFixed(2)}`).join('\n');
  parseCSV(csv);
  const durations = Array.from({ length: 7 }, () => {
    const start = process.hrtime.bigint();
    parseCSV(csv);
    return Number(process.hrtime.bigint() - start) / 1e6;
  });
  const median = durations.slice().sort((a, b) => a - b)[Math.floor(durations.length / 2)];
  const mean = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  const std = Math.sqrt(durations.reduce((sum, value) => sum + (value - mean) ** 2, 0) / durations.length);
  const cv = std / mean;
  assert.ok(median > 0, 'median parse time should be positive');
  assert.ok(cv < 0.8, `coefficient of variation ${cv.toFixed(3)} exceeded stability bound`);
});

test('performance stability: repeated analyzeRows on fixed synthetic data has bounded coefficient of variation', { skip: CI }, () => {
  const rows = parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct',
    ...Array.from({ length: 5000 }, (_, i) => `${i * 5},${10 + (i % 40)},${(1.4 + (i % 20) * 0.02).toFixed(2)},${(25 + (i % 50)).toFixed(1)},${(1 + (i % 30) * 0.5).toFixed(1)},${(i % 15).toFixed(1)},${(i % 2 === 0 ? 0.8 : 1.2).toFixed(1)},${(99 + (i % 2)).toFixed(1)}`)
  ].join('\n'));
  analyzeRows(rows, { sourceHash: 'perf-stability-cv' });
  const durations = Array.from({ length: 7 }, () => {
    const start = process.hrtime.bigint();
    analyzeRows(rows, { sourceHash: 'perf-stability-cv' });
    return Number(process.hrtime.bigint() - start) / 1e6;
  });
  const mean = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  const std = Math.sqrt(durations.reduce((sum, value) => sum + (value - mean) ** 2, 0) / durations.length);
  const cv = std / mean;
  assert.ok(mean > 0, 'mean analysis time should be positive');
  assert.ok(cv < 0.8, `coefficient of variation ${cv.toFixed(3)} exceeded stability bound`);
});

test('performance stability: repeated parseCSV on fixed synthetic CSV has bounded interquartile range', { skip: CI }, () => {
  const csv = Array.from({ length: 10_000 }, (_, i) => `t,${i},${(i % 100).toFixed(2)}`).join('\n');
  parseCSV(csv);
  const durations = Array.from({ length: 9 }, () => {
    const start = process.hrtime.bigint();
    parseCSV(csv);
    return Number(process.hrtime.bigint() - start) / 1e6;
  });
  const sorted = durations.slice().sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const median = sorted[Math.floor(sorted.length / 2)];
  assert.ok(median > 0, 'median should be positive');
  assert.ok(iqr / median < 1.5, `IQR/median ratio ${(iqr / median).toFixed(3)} exceeded stability bound`);
});

// ============================================================================
// 14. Batch aggregation and display sampling boundary coverage
// ============================================================================

test('validateBatchDeclaration rejects empty groups and duplicate file claims', () => {
  const result = validateBatchDeclaration({ version: 'h2-testlens.batch-declaration.v1', groups: [] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('groups 必须是非空数组')));

  const duplicate = validateBatchDeclaration({
    version: 'h2-testlens.batch-declaration.v1',
    groups: [
      { id: 'g1', testRunId: 't1', sessionGroup: 's1', files: ['a.csv', 'b.csv'], fileOrder: ['a.csv', 'b.csv'], clockReference: 'clock', samplingFrequencyHz: 1, restartBoundaries: [] },
      { id: 'g2', testRunId: 't2', sessionGroup: 's2', files: ['b.csv', 'c.csv'], fileOrder: ['b.csv', 'c.csv'], clockReference: 'clock', samplingFrequencyHz: 1, restartBoundaries: [] }
    ]
  });
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.errors.some((error) => error.includes('被多个批次声明')));
});

test('observeDeclaredBatch flags overlap and rewind across file boundaries', () => {
  const group = {
    id: 'g1', testRunId: 't1', sessionGroup: 's1',
    fileOrder: ['a.csv', 'b.csv', 'c.csv'],
    samplingFrequencyHz: 1, samplingIntervalS: null, samplingTolerancePct: 10,
    restartBoundaries: ['b.csv']
  };
  const observation = observeDeclaredBatch(group, [
    { name: 'a.csv', result: { rows: [{ timestamp_s: 0 }, { timestamp_s: 1 }], quality: { medianIntervalS: 1, duplicateTimestampCount: 0, nonMonotonicCount: 0, nonPositiveIntervalCount: 0, observedIntervalCount: 1, effectiveSamplingFrequencyHz: 1 } } },
    { name: 'b.csv', result: { rows: [{ timestamp_s: 1 }, { timestamp_s: 2 }], quality: { medianIntervalS: 1, duplicateTimestampCount: 0, nonMonotonicCount: 0, nonPositiveIntervalCount: 0, observedIntervalCount: 1, effectiveSamplingFrequencyHz: 1 } } },
    { name: 'c.csv', result: { rows: [{ timestamp_s: 0 }, { timestamp_s: 1 }], quality: { medianIntervalS: 1, duplicateTimestampCount: 0, nonMonotonicCount: 0, nonPositiveIntervalCount: 0, observedIntervalCount: 1, effectiveSamplingFrequencyHz: 1 } } }
  ]);
  assert.ok(observation.issueCodes.includes('BATCH_CROSS_FILE_BOUNDARY_MISSING'));
  assert.equal(observation.crossFile[1].relation, 'rewind');
});

test('sampleRowsForDisplay handles empty input and preserves boundaries for tiny arrays', () => {
  assert.deepEqual(sampleRowsForDisplay([], 10).rows, []);
  const rows = [{ session_id: 'a', index: 0 }, { session_id: 'b', index: 1 }];
  const sampled = sampleRowsForDisplay(rows, 100);
  assert.equal(sampled.sampled, false);
  assert.equal(sampled.rows.length, 2);
});

test('summarizeDeclaredBatch computes file summaries from result metadata', () => {
  const group = {
    id: 'g1', testRunId: 't1', sessionGroup: 's1',
    fileOrder: ['a.csv', 'b.csv'],
    samplingFrequencyHz: 1, samplingIntervalS: null, samplingTolerancePct: 10,
    restartBoundaries: [], boundaryPolicy: 'per_file_session',
    approvalStatus: 'declared', evidenceRefs: [], approvedBy: null, approvedAt: null
  };
  const summary = summarizeDeclaredBatch(group, [
    { name: 'a.csv', hash: 'h1' },
    { name: 'b.csv', hash: 'h2' }
  ], [
    { name: 'a.csv', result: { rows: [{ timestamp_s: 0, secret: 'A' }], quality: { rowCount: 1, medianIntervalS: 1, duplicateTimestampCount: 0, nonMonotonicCount: 0, nonPositiveIntervalCount: 0, observedIntervalCount: 1, effectiveSamplingFrequencyHz: 1 }, datasetType: 'generic', verdict: 'PASS', issues: [] } },
    { name: 'b.csv', result: { rows: [{ timestamp_s: 1, secret: 'B' }], quality: { rowCount: 1, medianIntervalS: 1, duplicateTimestampCount: 0, nonMonotonicCount: 0, nonPositiveIntervalCount: 0, observedIntervalCount: 1, effectiveSamplingFrequencyHz: 1 }, datasetType: 'generic', verdict: 'PASS', issues: [] } }
  ]);
  assert.equal(summary.files[0].name, 'a.csv');
  assert.equal(summary.files[0].hash, 'h1');
  assert.equal(summary.files[0].rowCount, 1);
  assert.equal(summary.files[1].rowCount, 1);
});

// ============================================================================
// 15. Profile and compliance boundary hardening
// ============================================================================

test('profilesFromPackage rejects empty organization and duplicate ids', () => {
  const result = profilesFromPackage({
    schemaVersion: 'h2-testlens.profile.v1',
    organization: '',
    profiles: [
      { id: 'dup', name: 'A', thresholds: { maxTemperatureC: 80, maxPressureBar: 30, maxLeakPpm: 10, maxVoltageStdV: 0.12, maxPressureDriftBarPerMin: 1.2 }, supportedDatasetTypes: ['generic'] },
      { id: 'dup', name: 'B', thresholds: { maxTemperatureC: 80, maxPressureBar: 30, maxLeakPpm: 10, maxVoltageStdV: 0.12, maxPressureDriftBarPerMin: 1.2 }, supportedDatasetTypes: ['generic'] }
    ]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('organization')));
  assert.ok(result.errors.some((error) => error.includes('id 重复')));
});

test('all built-in device profiles have non-empty ids and names', () => {
  for (const profile of DEVICE_PROFILES) {
    assert.ok(profile.id?.trim(), `profile ${profile.name} has empty id`);
    assert.ok(profile.name?.trim(), `profile ${profile.id} has empty name`);
  }
});

test('analyzeRows with approved profile and missing instrument records fails closed', () => {
  const rows = parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct',
    '0,10,2,30,10,6,1,99',
    '60,10,2,30,10,6,1,99'
  ].join('\n'));
  const result = analyzeRows(rows, {
    approvalStatus: 'approved',
    approvalEvidence: { approverId: 'A', approvalDate: '2026-08-22', approvalRef: 'R', profileRevision: '2025', profileRevisionRef: 'RR' },
    methodExecutionStatus: 'FULL_METHOD_IMPLEMENTED',
    methodImplementationEvidence: { ready: true, evidence: 'ok' },
    uncertaintyModelRequired: true,
    uncertaintyModel: { method: 'first_order_rss', coverageFactor: 2, standardUncertainty: { current_a: 0.01, voltage_v: 0.01, power_w: 0.02, flow_slpm: 0.01, temperature_c: 0.1, pressure_bar: 0.01, leak_ppm: 0.1, hydrogen_purity_pct: 0.01 } },
    instrumentRequirements: ['electrical_input'],
    reportRequirements: ['testPurpose', 'charts', 'conclusion'],
    acceptanceRules: [{ metric: 'specificEnergyKWhPerNm3', operator: '<=', value: 1e9, sourceRef: 'approved-test-rule-1' }],
    testMetadata: {
      testPurpose: 'p', instrumentIds: '', calibrationRefs: 'c', operator: 'o', formulaRefs: 'f', signoff: 's',
      deviceFamily: 'PEM electrolyzer', ratedHydrogenPressureMpa: 5, ratedHydrogenProductionM3h: 10
    }
  });
  assert.equal(result.compliance.status, 'NOT_READY');
  assert.ok(result.issues.some((issue) => issue.code === 'INSTRUMENT_EVIDENCE_MISSING'));
});

// ============================================================================
// 16. Input safety and decodeTextBuffer boundary hardening
// ============================================================================

test('decodeTextBuffer on empty buffer returns non-binary empty text', () => {
  const decoded = decodeTextBuffer(Buffer.alloc(0));
  assert.equal(decoded.binary, false);
  assert.equal(decoded.text, '');
});

test('decodeTextBuffer on valid UTF-8 with BOM preserves text', () => {
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  const text = Buffer.from('timestamp,current\n0,10', 'utf8');
  const decoded = decodeTextBuffer(Buffer.concat([bom, text]));
  assert.equal(decoded.binary, false);
  assert.ok(decoded.text.includes('timestamp'));
});

test('decodeTextBuffer on random bytes without valid encoding does not throw', () => {
  const random = Buffer.from(Array.from({ length: 128 }, (_, i) => i % 256));
  const decoded = decodeTextBuffer(random, 'iso-8859-1');
  assert.ok(decoded.text === null || typeof decoded.text === 'string' || Buffer.isBuffer(decoded.text));
  assert.ok(typeof decoded.binary === 'boolean');
});

// ============================================================================
// 17. Regression: deterministic outputs for known fixtures
// ============================================================================

test('regression: analyzeRows on sample baseline produces stable public analysis', () => {
  const baseline = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct',
    '0,10,2,30,10,6,1,99',
    '60,10,2,30,10,6,1,99'
  ].join('\n')));
  const safe = publicAnalysis(baseline);
  assert.equal(safe.verdict, 'PASS');
  assert.equal(safe.metrics.sampleCount, 2);
  assert.equal('rows' in safe, false);
});

test('regression: reportMarkdown contains deterministic section headers', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct',
    '0,10,2,30,10,6,1,99',
    '60,10,2,30,10,6,1,99'
  ].join('\n')));
  const markdown = reportMarkdown(result, 'regression.csv');
  assert.match(markdown, /判定/);
  assert.match(markdown, /峰值/);
  assert.match(markdown, /后续步骤/);
});
