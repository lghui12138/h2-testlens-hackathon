import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCSV, analyzeRows } from '../src/analyzer.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('青川 127 列样本缺失单片电压列时降级为电堆堆级分析并告警', () => {
  const headers = [
    '测试时间',
    '实际电流（A）',
    '实际电压（V）',
    '功率（kW）',
    '冷却水入口温度（℃）',
    '阳极入堆压力（kPa）',
    '阳极流量（SLPM）',
    '柜内氢气浓度（ppm）',
    '片数',
    '循环水进出口温差（℃）',
    '氢气入口温度（℃）',
    '空气入口温度（℃）',
    '氢气入口露点温度（℃）',
    '空气入口露点温度（℃）',
    '内阻（mΩ）',
    '氢气计量比',
    '空气计量比',
    '循环水流量（L/min）',
    '循环水电导率（μS/cm）',
    '阴极入堆压力（kPa）',
    '阴极出堆压力（kPa）',
    '循环水入堆压力（kPa）',
    '循环水出堆压力（kPa）',
    '阳极增湿罐水温度（℃）',
    '阴极增湿罐水温度（℃）',
    '氢气化学计量比',
    '空气化学计量比',
    ...Array.from({ length: 100 }, (_, i) => `辅助信号${i + 1}`)
  ].join(',');

  const rows = [
    '0,100,180,18,55,120,150,5,100,5,60,25,-40,-20,5,1.5,2,20,5,110,105,130,125,55,55,1.5,2',
    '10,100,180,18,55,120,150,5,100,5,60,25,-40,-20,5,1.5,2,20,5,110,105,130,125,55,55,1.5,2'
  ].map((line) => line + ',' + '0'.repeat(100)).join('\n');

  const csv = `${headers}\n${rows}`;
  const result = analyzeRows(parseCSV(csv));
  assert.equal(result.datasetType, 'stack');
  assert.ok(result.issues.some((issue) => issue.code === 'STACK_CELL_CHANNELS_MISSING'));
  assert.ok(result.quality.usable || result.verdict === 'WARN' || result.verdict === 'FAIL');
});

test('氢质氢离样本中 FC_MainSts 全为同一有效状态时仍完成绝缘窗口统计', () => {
  const csv = [
    'Timestamp,FC_MainSts,FC_CurrOut,FC_VoltOut,FC_NetPwrOut,FC_MinCellVoltage,FC_MinVoltageChannel,FC_AvgCellVoltage,FC_AvgCellDev,FC_VARVoltage,FC_VehicleIsolationR,FC_RunTime_Hours',
    '0,4,50,320,16,3.1,1,3.15,0.02,0.01,1200,10',
    '600,4,50,320,16,3.1,1,3.15,0.02,0.01,1100,10.2',
    '1200,4,50,320,16,3.1,1,3.15,0.02,0.01,1050,10.4'
  ].join('\n');

  const result = analyzeRows(parseCSV(csv));
  assert.equal(result.datasetType, 'vehicle');
  assert.ok(result.dataset.insulation.points.length >= 1);
  assert.equal(result.dataset.insulation.validCount, 3);
  assert.ok(result.issues.some((issue) => issue.code === 'VEHICLE_UNIT_UNRESOLVED') || result.issues.some((issue) => issue.code === 'VEHICLE_TARGETS_MISSING'));
});

test('极大压力值 9999 仍参与峰值统计并触发压力告警', () => {
  const csv = [
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,2,30,10,6,1',
    '60,10,2,30,9999,6,1'
  ].join('\n');

  const result = analyzeRows(parseCSV(csv));
  assert.equal(result.metrics.peakPressureBar, 9999);
  assert.ok(result.issues.some((issue) => issue.code === 'PRESSURE_HIGH'));
});

test('负电流值不崩溃并保留在信号诊断中', () => {
  const csv = [
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,-5,2,30,10,6,1',
    '60,10,2,30,10,6,1'
  ].join('\n');

  const result = analyzeRows(parseCSV(csv));
  assert.equal(result.metrics.peakPowerW, 20);
  assert.equal(result.rows[0].current_a, -5);
  assert.equal(result.rows[1].current_a, 10);
});

test('时间戳乱序时记录逆序跳变并给出数据质量警告', () => {
  const csv = [
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,2,30,10,6,1',
    '30,10,2,30,10,6,1',
    '20,10,2,30,10,6,1'
  ].join('\n');

  const result = analyzeRows(parseCSV(csv));
  assert.equal(result.quality.nonMonotonicCount, 1);
  assert.ok(result.issues.some((issue) => issue.code === 'TIME_SEQUENCE'));
});

test('重复表头名时后列覆盖前列且不崩溃', () => {
  const csv = [
    'timestamp_s,current_a,voltage_v,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,2.0,2.1,30,10,6,1',
    '60,10,2.2,2.3,30,10,6,1'
  ].join('\n');

  const result = analyzeRows(parseCSV(csv));
  assert.ok(Array.isArray(result.rows));
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].voltage_v, 2.1);
  assert.equal(result.rows[1].voltage_v, 2.3);
});

test('混合逗号与制表符分隔时按首行 majority delimiter 解析', () => {
  const csv = [
    'timestamp_s,current_a,voltage_v',
    '0,10,2',
    '60\t10,2'
  ].join('\n');

  const result = analyzeRows(parseCSV(csv));
  assert.ok(Array.isArray(result.rows));
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].timestamp_s, 0);
  assert.equal(result.rows[0].current_a, 10);
  assert.equal(result.rows[0].voltage_v, 2);
  assert.equal(result.rows[1].timestamp_s, null);
  assert.equal(result.rows[1].current_a, 2);
  assert.equal(result.rows[1].voltage_v, null);
});

test('青川真实样例数据 100 行可进入电堆分析且压力字段正确映射', async () => {
  const realPath = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手/企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv';
  const fixturePath = join(here, '../sample-data/t02-qingchuan-stack-regression.csv');
  const targetPath = existsSync(realPath) ? realPath : fixturePath;
  const text = await readFile(targetPath, 'utf8');
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const sliced = lines.slice(0, 101).join('\n');
  const result = analyzeRows(parseCSV(sliced));
  assert.equal(result.datasetType, 'stack');
  assert.equal(result.schema.mapping.power_kw, '功率（kW)');
  assert.equal(result.schema.mapping.pressure_kpa, '阳极入堆压力（kPa）');
});

test('氢质氢离 FC_* 车辆数据绝缘窗口统计保留所有有效状态', () => {
  const csv = [
    'Timestamp,FC_MainSts,FC_CurrOut,FC_VoltOut,FC_NetPwrOut,FC_MinCellVoltage,FC_MinVoltageChannel,FC_AvgCellVoltage,FC_AvgCellDev,FC_VARVoltage,FC_VehicleIsolationR,FC_RunTime_Hours',
    '2026-07-07 18:20:00,4,95,320,30,0.6,1,0.68,8,10,500,1',
    '2026-07-07 18:21:00,4,95,320,30,0.6,1,0.68,8,10,480,1',
    '2026-07-07 18:22:00,4,95,320,30,0.6,1,0.68,8,10,350,1',
    '2026-07-07 18:23:00,4,95,320,30,0.6,1,0.68,8,10,240,1',
    '2026-07-07 18:24:00,4,95,320,30,0.6,1,0.68,8,10,200,1'
  ].join('\n');

  const result = analyzeRows(parseCSV(csv), { evaluationMode: 'descriptive_only' });
  assert.equal(result.datasetType, 'vehicle');
  assert.equal(result.dataset.insulation.validCount, 5);
  assert.equal(result.dataset.insulation.excludedByStatus, 0);
  assert.ok(result.dataset.insulation.points.length >= 1);
});

test('氢璞创能耐久报告解析保留功率点和企业原始结果', () => {
  const rows = [
    { target_power_kw: '33', net_power_kw: '32.9', average_cell_voltage_mv: '813', average_deviation_mv: '6', voltage_variance: '20', temperature_c: '57.5', source_file: 'hypu-a.docx' },
    { target_power_kw: '58.5', net_power_kw: '53.0', average_cell_voltage_mv: '790', average_deviation_mv: '12', voltage_variance: '25', temperature_c: '60.0', source_file: 'hypu-a.docx' },
    { target_power_kw: '117', net_power_kw: '112.5', average_cell_voltage_mv: '760', average_deviation_mv: '18', voltage_variance: '30', temperature_c: '65.0', source_file: 'hypu-a.docx' },
    { target_power_kw: '156', net_power_kw: '150.0', average_cell_voltage_mv: '720', average_deviation_mv: '25', voltage_variance: '35', temperature_c: '70.0', source_file: 'hypu-b.docx' },
    { target_power_kw: '175.5', net_power_kw: '168.0', average_cell_voltage_mv: '680', average_deviation_mv: '30', voltage_variance: '40', temperature_c: '73.0', source_file: 'hypu-b.docx' },
    { target_power_kw: '195', net_power_kw: '185.0', average_cell_voltage_mv: '650', average_deviation_mv: '35', voltage_variance: '45', temperature_c: '75.0', source_file: 'hypu-b.docx' }
  ];
  const reports = [
    { metadata: { 测试方案: '耐久0-5', 测试结果: '未通过', 电堆型号: 'H3300B' }, points: rows.slice(0, 3) },
    { metadata: { 测试方案: '耐久5-10', 测试结果: '通过', 电堆型号: 'H3300B' }, points: rows.slice(3, 6) }
  ];
  const result = analyzeRows(rows, { durabilityReports: reports, durabilityRules: {} });
  assert.equal(result.datasetType, 'durability');
  assert.equal(result.dataset.points.length, 6);
  assert.deepEqual(result.dataset.targetPowers, [33, 58.5, 117, 156, 175.5, 195]);
  assert.equal(result.dataset.reports.length, 2);
  assert.equal(result.dataset.reports[0].metadata['测试结果'], '未通过');
  assert.equal(result.dataset.reports[0].metadata['电堆型号'], 'H3300B');
  assert.equal(result.dataset.points[0].targetPowerKw, 33);
  assert.equal(result.dataset.points[0].sourceFile, 'hypu-a.docx');
});
