import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, analyzeRows } from '../src/analyzer.mjs';

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
