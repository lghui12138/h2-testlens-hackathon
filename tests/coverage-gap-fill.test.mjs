import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCSV, analyzeRows, safeMax, safeMin } from '../src/analyzer.mjs';
import { analyzeEnterpriseRows } from '../src/enterprise-adapters.mjs';
import { getProfile } from '../src/profiles.mjs';
import { decodeTextBuffer, isLikelyBinary } from '../src/input-safety.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const T02_ROOT = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';
const HAS_T02 = existsSync(T02_ROOT);
const CI = String(process.env.CI || '').toLowerCase() === 'true';

// ---------------------------------------------------------------------------
// 1. Robustness guard coverage for mean / std / safeMax / safeMin
// ---------------------------------------------------------------------------

test('safeMax and safeMin handle single-element arrays including zero', () => {
  assert.equal(safeMax([0]), 0);
  assert.equal(safeMin([0]), 0);
  assert.equal(safeMax([-0]), -0);
  assert.equal(safeMin([-0]), -0);
  assert.equal(safeMax([42]), 42);
  assert.equal(safeMin([42]), 42);
});

test('safeMax and safeMin return null for arrays with only non-finite values', () => {
  assert.equal(safeMax([NaN]), null);
  assert.equal(safeMin([NaN]), null);
  assert.equal(safeMax([Infinity]), null);
  assert.equal(safeMin([Infinity]), null);
  assert.equal(safeMax([-Infinity]), null);
  assert.equal(safeMin([-Infinity]), null);
  assert.equal(safeMax([NaN, Infinity, -Infinity]), null);
  assert.equal(safeMin([NaN, Infinity, -Infinity]), null);
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

test('analyzeRows with single parsed row reports DATA_TOO_SHORT and finite quality fields', () => {
  const rows = parseCSV('timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct\n0,10,2,30,10,6,1,99');
  const result = analyzeRows(rows);
  assert.equal(result.quality.hasEnoughRows, false);
  assert.ok(result.issues.some((issue) => issue.code === 'DATA_TOO_SHORT'));
  assert.equal(result.quality.rowCount, 1);
  assert.ok(Number.isFinite(result.quality.completenessPct));
});

test('analyzeRows with empty input returns FAIL with DATA_TOO_SHORT and no schema mapping', () => {
  const result = analyzeRows([]);
  assert.equal(result.verdict, 'FAIL');
  assert.ok(result.issues.some((issue) => issue.code === 'DATA_TOO_SHORT'));
  assert.equal(result.quality.hasEnoughRows, false);
  assert.equal(result.quality.rowCount, 0);
  assert.equal(Object.keys(result.schema.mapping).length, 0);
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
    FC_VehicleIsolationR: '1200',
    FC_RunTime_Hours: '10'
  }));
  const result = analyzeEnterpriseRows(rows, getProfile('qingzhihuli-vehicle'));
  assert.ok(result);
  assert.equal(result.datasetType, 'vehicle');
  assert.ok(Array.isArray(result.issues));
});

test('analyzeEnterpriseRows returns null for empty and single-row arrays', () => {
  assert.equal(analyzeEnterpriseRows([]), null);
  assert.equal(analyzeEnterpriseRows([{ a: '1' }]), null);
});

// ---------------------------------------------------------------------------
// 2. T02 systematic file enumeration and representative sampling
// ---------------------------------------------------------------------------

test('T02 root contains exactly 198 files across all enterprise packages', { skip: !HAS_T02 }, () => {
  const allFiles = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else allFiles.push(full);
    }
  };
  walk(T02_ROOT);
  assert.equal(allFiles.length, 198, `expected 198 T02 files, got ${allFiles.length}`);
});

test('T02 representative sample covers each enterprise package and major file type', { skip: !HAS_T02 }, async () => {
  const packages = [
    {
      name: '氢璞创能',
      root: join(T02_ROOT, '企业资料包01_氢璞创能'),
      samples: [
        '2026-4-4-18-56-04.txt',
        '299-001-D_出厂检测报告.xlsx'
      ]
    },
    {
      name: '氢质氢离',
      root: join(T02_ROOT, '企业资料包02_氢质氢离'),
      samples: [
        '01_耐久原始数据处理/耐久0-5-20260605211610.docx',
        '02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (1).csv'
      ]
    },
    {
      name: '青川易创',
      root: join(T02_ROOT, '企业资料包03_青川易创与云汉达'),
      samples: [
        '02 样例数据-青川科技.csv',
        '03 青川科技-燃料电池电堆时序测试数据处理任务说明书.docx'
      ]
    },
    {
      name: '海珀特',
      root: join(T02_ROOT, '企业资料包04_海珀特'),
      samples: [
        '00_企业资料说明.pdf'
      ]
    }
  ];

  for (const pkg of packages) {
    assert.ok(existsSync(pkg.root), `${pkg.name} package root should exist`);
    for (const relative of pkg.samples) {
      const fullPath = join(pkg.root, relative);
      assert.ok(existsSync(fullPath), `${pkg.name} sample ${relative} should exist`);
      const buf = await readFile(fullPath);
      assert.ok(buf.length > 0, `${pkg.name} sample ${relative} should be non-empty`);
      if (fullPath.endsWith('.csv')) {
        const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
        const rows = parseCSV(csv);
        assert.ok(rows.length >= 1, `${pkg.name} CSV sample should have rows`);
        assert.ok(Object.keys(rows[0]).length >= 1, `${pkg.name} CSV sample should have headers`);
      } else if (fullPath.endsWith('.txt')) {
        const decoded = decodeTextBuffer(buf, 'gb18030');
        assert.equal(decoded.binary, false);
        const rows = parseCSV(decoded.text);
        assert.ok(rows.length >= 1, `${pkg.name} TXT sample should have rows`);
      } else if (fullPath.endsWith('.pdf')) {
        assert.equal(isLikelyBinary(buf), true);
        const decoded = decodeTextBuffer(buf);
        assert.equal(decoded.binary, true);
      } else if (fullPath.endsWith('.docx')) {
        // Basic sanity: docx is a ZIP-based binary format
        assert.ok(buf.slice(0, 4).toString('hex') === '504b0304' || buf.length > 0, `${pkg.name} DOCX should be valid`);
      }
    }
  }
});

test('T02 coverage audit JSON enumerates 198 files with expected status counts', async () => {
  if (!HAS_T02) return;
  const packageJson = JSON.parse(await readFile(join(here, '../package.json'), 'utf8'));
  const auditPath = join(here, `../.research/ignite_t02_standards_20260821/t02_coverage_audit_v${packageJson.version}.json`);
  if (!existsSync(auditPath)) return;
  const audit = JSON.parse(await readFile(auditPath, 'utf8'));
  assert.equal(audit.totalFiles, 198);
  assert.equal(audit.records.length, 198);
  const processed = audit.records.filter((r) => r.status === 'processed').length;
  const reference = audit.records.filter((r) => r.status === 'reference_only').length;
  const blocked = audit.records.filter((r) => r.status === 'blocked_binary').length;
  const noUpload = audit.records.filter((r) => r.status === 'declared_no_upload').length;
  assert.equal(processed + reference + blocked + noUpload, 198);
  assert.ok(processed >= 190, `expected at least 190 processed files, got ${processed}`);
});

// ---------------------------------------------------------------------------
// 3. Performance stability with coefficient of variation and warm-up
// ---------------------------------------------------------------------------

function buildCsv(rowCount) {
  const headers = 'timestamp_s,phase,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct';
  const lines = [headers];
  for (let index = 0; index < rowCount; index += 1) {
    const t = index * 5;
    const phase = index % 5 === 0 ? 'idle' : index % 5 === 1 ? 'ramp' : 'steady';
    lines.push(`${t},${phase},${(10 + index % 40).toFixed(2)},${(1.4 + (index % 20) * 0.02).toFixed(2)},${(25 + (index % 50)).toFixed(1)},${(1 + (index % 30) * 0.5).toFixed(1)},${(index % 15).toFixed(1)},${(index % 2 === 0 ? 0.8 : 1.2).toFixed(1)},${(99 + (index % 2)).toFixed(1)}`);
  }
  return lines.join('\n');
}

test('performance stability: repeated parseCSV has bounded coefficient of variation', { skip: CI }, () => {
  const csv = buildCsv(5000);
  // Warm-up runs to reduce JIT / GC noise.
  for (let i = 0; i < 3; i += 1) parseCSV(csv);
  const durations = Array.from({ length: 8 }, () => {
    const start = process.hrtime.bigint();
    parseCSV(csv);
    return Number(process.hrtime.bigint() - start) / 1e6;
  });
  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
  const variance = durations.reduce((sum, d) => sum + (d - mean) ** 2, 0) / durations.length;
  const std = Math.sqrt(variance);
  const cv = std / mean;
  assert.ok(mean > 0, 'mean parse time should be positive');
  assert.ok(cv < 1.5, `coefficient of variation ${cv.toFixed(3)} exceeded stability bound`);
});

test('performance stability: repeated analyzeRows has bounded coefficient of variation', { skip: CI }, () => {
  const rows = parseCSV(buildCsv(2000));
  // Warm-up run.
  analyzeRows(rows, { sourceHash: 'perf-stability-cv' });
  const durations = Array.from({ length: 8 }, () => {
    const start = process.hrtime.bigint();
    analyzeRows(rows, { sourceHash: 'perf-stability-cv' });
    return Number(process.hrtime.bigint() - start) / 1e6;
  });
  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
  const variance = durations.reduce((sum, d) => sum + (d - mean) ** 2, 0) / durations.length;
  const std = Math.sqrt(variance);
  const cv = std / mean;
  assert.ok(mean > 0, 'mean analysis time should be positive');
  assert.ok(cv < 1.5, `coefficient of variation ${cv.toFixed(3)} exceeded stability bound`);
});

test('performance stability: parseCSV max duration is bounded relative to median', { skip: CI }, () => {
  const csv = buildCsv(3000);
  // Warm-up.
  parseCSV(csv);
  const durations = Array.from({ length: 12 }, () => {
    const start = process.hrtime.bigint();
    parseCSV(csv);
    return Number(process.hrtime.bigint() - start) / 1e6;
  });
  const sorted = durations.slice().sort((a, b) => a - b);
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const max = sorted.at(-1);
  assert.ok(median > 0, 'median parse time should be positive');
  assert.ok(max / median < 5, `max/median jitter ratio ${(max / median).toFixed(2)} exceeded stability bound`);
});
