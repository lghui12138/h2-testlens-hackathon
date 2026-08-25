import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCSV, analyzeRows } from '../src/analyzer.mjs';
import { analyzeEnterpriseRows } from '../src/enterprise-adapters.mjs';
import { getProfile } from '../src/profiles.mjs';

const CI = String(process.env.CI || '').toLowerCase() === 'true';
const here = dirname(fileURLToPath(import.meta.url));
const T02_ROOT = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';

const readRaw = async (relativePath) => readFile(join(T02_ROOT, relativePath));

const HEADERS = 'timestamp_s,phase,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct';

function buildRow(index) {
  const t = index * 5;
  const phase = index % 5 === 0 ? 'idle' : index % 5 === 1 ? 'ramp' : 'steady';
  return `${t},${phase},${(10 + index % 40).toFixed(2)},${(1.4 + (index % 20) * 0.02).toFixed(2)},${(25 + (index % 50)).toFixed(1)},${(1 + (index % 30) * 0.5).toFixed(1)},${(index % 15).toFixed(1)},${(index % 2 === 0 ? 0.8 : 1.2).toFixed(1)},${(99 + (index % 2)).toFixed(1)}`;
}

function buildCsv(rowCount) {
  const lines = [HEADERS];
  for (let index = 0; index < rowCount; index += 1) lines.push(buildRow(index));
  return lines.join('\n');
}

const LARGE_CSV_10K = buildCsv(10_000);
const LARGE_CSV_50K = buildCsv(50_000);
const LARGE_CSV_100K = buildCsv(100_000);

const TIMING_HEADER = 'test_name,status,elapsed_ms,rows,peak_heap_mb';
let benchmarkLines = [TIMING_HEADER];

function recordBenchmark(name, status, elapsedMs, rows, peakHeapMb) {
  benchmarkLines.push(`${name},${status},${elapsedMs.toFixed(2)},${rows},${peakHeapMb.toFixed(2)}`);
}

function summarizeBenchmark() {
  const summary = benchmarkLines.join('\n');
  benchmarkLines = [TIMING_HEADER];
  return summary;
}

test('benchmark reporter warm-up', () => {
  recordBenchmark('warmup', 'ok', 0, 0, 0);
});

test('test_parse_large_csv_10k_rows', { skip: CI }, () => {
  const start = process.hrtime.bigint();
  const rows = parseCSV(LARGE_CSV_10K);
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  const heap = process.memoryUsage();
  assert.equal(rows.length, 10_000);
  assert.equal(rows[0].phase, 'idle');
  assert.equal(rows.at(-1).phase, 'steady');
  assert.ok(elapsedMs < 1_000, `10k parse took ${elapsedMs.toFixed(2)} ms`);
  recordBenchmark('test_parse_large_csv_10k_rows', 'ok', elapsedMs, rows.length, heap.heapUsed / 1024 / 1024);
});

test('test_parse_large_csv_100k_rows', { skip: CI }, () => {
  const start = process.hrtime.bigint();
  const rows = parseCSV(LARGE_CSV_100K);
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  const heap = process.memoryUsage();
  assert.equal(rows.length, 100_000);
  assert.ok(elapsedMs < 10_000, `100k parse took ${elapsedMs.toFixed(2)} ms`);
  recordBenchmark('test_parse_large_csv_100k_rows', 'ok', elapsedMs, rows.length, heap.heapUsed / 1024 / 1024);
});

test('test_analyze_large_dataset', { skip: CI }, () => {
  const rows = parseCSV(LARGE_CSV_50K);
  const start = process.hrtime.bigint();
  const result = analyzeRows(rows, { sourceHash: 'perf-benchmark' });
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  const heap = process.memoryUsage();
  assert.ok(result, 'analyzeRows should return a result');
  assert.ok(result.verdict, 'analyzeRows should include a verdict');
  assert.ok(elapsedMs < 30_000, `50k analysis took ${elapsedMs.toFixed(2)} ms`);
  recordBenchmark('test_analyze_large_dataset', 'ok', elapsedMs, rows.length, heap.heapUsed / 1024 / 1024);
});

test('test_memory_usage_large_file', { skip: CI }, () => {
  const before = process.memoryUsage();
  const rows = parseCSV(LARGE_CSV_100K);
  const after = process.memoryUsage();
  const heapDeltaMb = (after.heapUsed - before.heapUsed) / 1024 / 1024;
  assert.ok(rows.length === 100_000, 'parsed row count should be 100k');
  assert.ok(heapDeltaMb < 400, `heap delta ${heapDeltaMb.toFixed(2)} MB exceeded 400 MB budget`);
  recordBenchmark('test_memory_usage_large_file', 'ok', 0, rows.length, heapDeltaMb);
});

test('test_concurrent_file_processing', { skip: CI }, async () => {
  const fileCount = 5;
  const rowCount = 20_000;
  const files = Array.from({ length: fileCount }, () => buildCsv(rowCount));

  const start = process.hrtime.bigint();
  const results = await Promise.all(files.map((csv) => parseCSV(csv)));
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  const heap = process.memoryUsage();

  assert.equal(results.length, fileCount);
  for (const rows of results) assert.equal(rows.length, rowCount);
  assert.ok(elapsedMs < 15_000, `concurrent parse of ${fileCount}x${rowCount} took ${elapsedMs.toFixed(2)} ms`);
  recordBenchmark('test_concurrent_file_processing', 'ok', elapsedMs, fileCount * rowCount, heap.heapUsed / 1024 / 1024);
});

test('performance benchmark summary', { skip: CI }, () => {
  const summary = summarizeBenchmark();
  console.log(summary);
  assert.ok(summary.includes('test_name'), 'benchmark reporter should emit a header row');
});

test('test_parse_real_qingchuan_38k_csv', { skip: CI }, async () => {
  const buf = await readRaw('企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv');
  const start = process.hrtime.bigint();
  const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
  const rows = parseCSV(csv);
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  const heap = process.memoryUsage();
  assert.ok(rows.length >= 38000, `expected ~38k rows, got ${rows.length}`);
  assert.ok(elapsedMs < 30_000, `real 38k qingchuan parse took ${elapsedMs.toFixed(2)} ms`);
  recordBenchmark('test_parse_real_qingchuan_38k_csv', 'ok', elapsedMs, rows.length, heap.heapUsed / 1024 / 1024);
});

test('test_analyze_real_qingchuan_38k_csv', { skip: CI }, async () => {
  const buf = await readRaw('企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv');
  const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
  const rows = parseCSV(csv);
  const start = process.hrtime.bigint();
  const result = analyzeEnterpriseRows(rows, getProfile('qingchuan-stack'));
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  const heap = process.memoryUsage();
  assert.ok(result, 'analyzeEnterpriseRows should return a result for real qingchuan data');
  assert.equal(result.datasetType, 'stack');
  assert.ok(elapsedMs < 30_000, `real 38k qingchuan analysis took ${elapsedMs.toFixed(2)} ms`);
  recordBenchmark('test_analyze_real_qingchuan_38k_csv', 'ok', elapsedMs, rows.length, heap.heapUsed / 1024 / 1024);
});

 test('test_parse_real_qingchuan_38k_csv_with_adapter', { skip: CI }, async () => {
   const buf = await readRaw('企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv');
   const start = process.hrtime.bigint();
   const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
   const rows = parseCSV(csv);
   const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
   assert.ok(rows.length >= 38000, `expected ~38k rows, got ${rows.length}`);
   assert.ok(elapsedMs < 20_000, `real 38k qingchuan parse took ${elapsedMs.toFixed(2)} ms`);
   recordBenchmark('test_parse_real_qingchuan_38k_csv_with_adapter', 'ok', elapsedMs, rows.length, process.memoryUsage().heapUsed / 1024 / 1024);
 });

 test('test_analyze_real_qingchuan_38k_csv_with_profile', { skip: CI }, async () => {
   const buf = await readRaw('企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv');
   const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
   const rows = parseCSV(csv);
   const start = process.hrtime.bigint();
   const result = analyzeEnterpriseRows(rows, getProfile('qingchuan-stack'));
   const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
   assert.ok(result, 'analyzeEnterpriseRows should return a result for real qingchuan data');
   assert.equal(result.datasetType, 'stack');
   assert.ok(elapsedMs < 20_000, `real 38k qingchuan analysis took ${elapsedMs.toFixed(2)} ms`);
   recordBenchmark('test_analyze_real_qingchuan_38k_csv_with_profile', 'ok', elapsedMs, rows.length, process.memoryUsage().heapUsed / 1024 / 1024);
 });
