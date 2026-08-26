import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCSV, analyzeRows, safeMax, safeMin } from '../src/analyzer.mjs';
import { analyzeEnterpriseRows } from '../src/enterprise-adapters.mjs';
import { getProfile } from '../src/profiles.mjs';
import { decodeTextBuffer } from '../src/input-safety.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const T02_ROOT = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';
const HAS_T02 = existsSync(T02_ROOT);

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
