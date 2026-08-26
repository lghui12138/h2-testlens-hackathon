import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCSV, analyzeRows } from '../src/analyzer.mjs';
import { analyzeEnterpriseRows } from '../src/enterprise-adapters.mjs';
import { getProfile } from '../src/profiles.mjs';
import { parseDataWorkbook, setSpreadsheetEngine } from '../src/excel-workflow.mjs';
import { parseDurabilityDocx, setDocxEngine } from '../src/docx-workflow.mjs';
import { decodeTextBuffer, isLikelyBinary } from '../src/input-safety.mjs';
import { loadXlsx } from '../src/xlsx-node-loader.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const T02_ROOT = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';
const HAS_T02 = existsSync(T02_ROOT);
const CI = String(process.env.CI || '').toLowerCase() === 'true';

const SheetJS = await loadXlsx();
setSpreadsheetEngine(SheetJS);

const mammothSource = await readFile(join(here, '../src/vendor/mammoth.browser.min.js'), 'utf8');
const { runInThisContext } = await import('node:vm');
runInThisContext(mammothSource);
setDocxEngine(globalThis.mammoth);

const readRaw = async (relativePath) => {
  if (!HAS_T02) return null;
  const fullPath = join(T02_ROOT, relativePath);
  if (!existsSync(fullPath)) return null;
  return readFile(fullPath);
};

// ---------------------------------------------------------------------------
// 1. T02 inventory and representative sampling
// ---------------------------------------------------------------------------

test('T02 directory contains exactly 198 files with expected type distribution', { skip: !HAS_T02 || CI }, async () => {
  const walk = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await walk(full));
      } else {
        files.push(full);
      }
    }
    return files;
  };
  const allFiles = await walk(T02_ROOT);
  assert.equal(allFiles.length, 198, `expected exactly 198 files in T02, got ${allFiles.length}`);
  const counts = {};
  for (const file of allFiles) {
    const ext = file.split('.').pop()?.toLowerCase() || '';
    counts[ext] = (counts[ext] || 0) + 1;
  }
  assert.equal(counts['csv'] || 0, 171, `expected 171 CSV files, got ${counts['csv'] || 0}`);
  assert.equal(counts['txt'] || 0, 11, `expected 11 TXT files, got ${counts['txt'] || 0}`);
  assert.equal(counts['docx'] || 0, 10, `expected 10 DOCX files, got ${counts['docx'] || 0}`);
  assert.equal(counts['pdf'] || 0, 5, `expected 5 PDF files, got ${counts['pdf'] || 0}`);
  assert.equal(counts['xlsx'] || 0, 1, `expected 1 XLSX file, got ${counts['xlsx'] || 0}`);
});

test('representative T02 sample across 4 enterprise packages parses without crashing', { skip: !HAS_T02 || CI }, async () => {
  const samples = [
    '企业资料包01_氢璞创能/2026-4-4-18-56-04.txt',
    '企业资料包01_氢璞创能/299-001-D_出厂检测报告.xlsx',
    '企业资料包02_氢质氢离/01_耐久原始数据处理/耐久0-5-20260605211610.docx',
    '企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (1).csv',
    '企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv',
    '企业资料包03_青川易创与云汉达/03 青川科技-燃料电池电堆时序测试数据处理任务说明书.docx',
    '企业资料包04_海珀特/00_企业资料说明.pdf',
  ];
  for (const file of samples) {
    const path = join(T02_ROOT, file);
    assert.ok(existsSync(path), `T02 representative sample should exist: ${file}`);
    const buf = await readFile(path);
    assert.ok(Buffer.isBuffer(buf) && buf.length > 0, `${file} should be non-empty`);
    if (file.endsWith('.pdf')) {
      assert.equal(isLikelyBinary(buf), true, `${file} should be binary`);
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Representative CSV / TXT / XLSX / DOCX regression
// ---------------------------------------------------------------------------

test('representative T02 CSV samples produce deterministic parse outputs', { skip: !HAS_T02 || CI }, async () => {
  const samples = [
    { path: '企业资料包01_氢璞创能/2026-4-4-18-56-04.txt', decode: 'gb18030', header: '时间', minRows: 50 },
    { path: '企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (1).csv', decode: null, header: 'Timestamp', minRows: 100 },
    { path: '企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv', decode: null, header: '测试时间', minRows: 38000 }
  ];
  for (const sample of samples) {
    const buf = await readFile(join(T02_ROOT, sample.path));
    const text = sample.decode ? decodeTextBuffer(buf, sample.decode).text : Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
    const rows = parseCSV(text);
    assert.ok(rows.length >= sample.minRows, `${sample.path} should have at least ${sample.minRows} rows, got ${rows.length}`);
    assert.ok(sample.header in rows[0], `${sample.path} should have ${sample.header} header`);
  }
});

test('representative T02 package01 txt files parse through stable entrypoints', { skip: !HAS_T02 || CI }, async () => {
  const samples = [
    '企业资料包01_氢璞创能/2026-4-4-18-56-04.txt',
    '企业资料包01_氢璞创能/2026-4-4-19-00-50.txt',
    '企业资料包01_氢璞创能/2026-4-5-11-32-54.txt'
  ];
  for (const file of samples) {
    const buf = await readFile(join(T02_ROOT, file));
    const decoded = decodeTextBuffer(buf, 'gb18030');
    assert.equal(decoded.binary, false, `${file} should decode as text`);
    assert.ok(!decoded.text.includes('\uFFFD'), `${file} should not contain replacement characters`);
    const rows = parseCSV(decoded.text);
    assert.ok(rows.length >= 50, `${file} should have at least 50 rows, got ${rows.length}`);
    assert.ok('时间' in rows[0], `${file} should have 时间 header`);
    assert.ok('电堆电压' in rows[0], `${file} should have 电堆电压 header`);
  }
});

test('representative T02 package02 vehicle CSV samples parse headers deterministically', { skip: !HAS_T02 || CI }, async () => {
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
    assert.ok('Timestamp' in rows[0], `${file} should have Timestamp header`);
    assert.ok('FC_CurrOut' in rows[0], `${file} should have FC_CurrOut header`);
  }
});

test('representative T02 package02 durability docx files preserve metadata and points', { skip: !HAS_T02 || CI }, async () => {
  const files = [
    '企业资料包02_氢质氢离/01_耐久原始数据处理/耐久0-5-20260605211610.docx',
    '企业资料包02_氢质氢离/01_耐久原始数据处理/耐久5-10-20260606024937.docx',
    '企业资料包02_氢质氢离/01_耐久原始数据处理/耐久10-15-20260606081413.docx'
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

test('representative T02 package03 stack CSV sample parses deterministically', { skip: !HAS_T02 || CI }, async () => {
  const buf = await readFile(join(T02_ROOT, '企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv'));
  const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
  const rows = parseCSV(csv);
  assert.ok(rows.length >= 38000, `expected ~38k rows, got ${rows.length}`);
  assert.ok('实际电流（A）' in rows[0], 'should have expected stack header');
  assert.ok('单片电压1（V）' in rows[0], 'should have expected cell voltage header');
});

// ---------------------------------------------------------------------------
// 3. PDF and binary detection regression
// ---------------------------------------------------------------------------

test('all T02 package04 PDFs are detected as binary and cannot be parsed as text', { skip: !HAS_T02 || CI }, async () => {
  const pdfFiles = readdirSync(join(T02_ROOT, '企业资料包04_海珀特')).filter((file) => file.endsWith('.pdf'));
  assert.ok(pdfFiles.length >= 1, 'package 04 should contain at least one PDF');
  for (const file of pdfFiles) {
    const buf = await readFile(join(T02_ROOT, `企业资料包04_海珀特/${file}`));
    assert.equal(isLikelyBinary(buf), true, `${file} should be binary`);
    const decoded = decodeTextBuffer(buf);
    assert.equal(decoded.binary, true, `${file} should decode as binary`);
  }
});

// ---------------------------------------------------------------------------
// 4. Performance stability for representative real-data samples
// ---------------------------------------------------------------------------

test('performance stability: representative T02 qingchuan 38k parse has bounded jitter', { skip: !HAS_T02 || CI }, async () => {
  const buf = await readFile(join(T02_ROOT, '企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv'));
  const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
  parseCSV(csv);
  const durations = Array.from({ length: 3 }, () => {
    const start = process.hrtime.bigint();
    const rows = parseCSV(csv);
    return { elapsedMs: Number(process.hrtime.bigint() - start) / 1e6, rows: rows.length };
  });
  const sorted = durations.slice().sort((a, b) => a.elapsedMs - b.elapsedMs);
  const median = sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1].elapsedMs + sorted[sorted.length / 2].elapsedMs) / 2 : sorted[Math.floor(sorted.length / 2)].elapsedMs;
  const max = sorted.at(-1).elapsedMs;
  assert.ok(durations.every((d) => d.rows >= 38000), 'row count should stay stable across runs');
  assert.ok(max / median < 3, `real data max/median jitter ratio ${(max / median).toFixed(2)} exceeded stability bound`);
});

test('performance stability: representative T02 hypu txt decode has bounded jitter', { skip: !HAS_T02 || CI }, async () => {
  const buf = await readFile(join(T02_ROOT, '企业资料包01_氢璞创能/2026-4-4-18-56-04.txt'));
  decodeTextBuffer(buf, 'gb18030');
  const durations = Array.from({ length: 3 }, () => {
    const start = process.hrtime.bigint();
    const decoded = decodeTextBuffer(buf, 'gb18030');
    return Number(process.hrtime.bigint() - start) / 1e6;
  });
  const sorted = durations.slice().sort((a, b) => a - b);
  const median = sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : sorted[Math.floor(sorted.length / 2)];
  const max = sorted.at(-1);
  assert.ok(median > 0, 'median decode time should be positive');
  assert.ok(max / median < 3, `real data decode max/median jitter ratio ${(max / median).toFixed(2)} exceeded stability bound`);
});
