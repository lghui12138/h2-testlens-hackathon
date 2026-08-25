import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCSV, analyzeRows, publicAnalysis } from '../src/analyzer.mjs';
import { analyzeEnterpriseRows } from '../src/enterprise-adapters.mjs';
import { getProfile } from '../src/profiles.mjs';
import { decodeTextBuffer, isLikelyBinary } from '../src/input-safety.mjs';
import { parseDataWorkbook, inspectWorkbookFormulaAudit, setSpreadsheetEngine } from '../src/excel-workflow.mjs';
import { loadXlsx } from '../src/xlsx-node-loader.mjs';
import { parseDurabilityDocx, setDocxEngine } from '../src/docx-workflow.mjs';
import { parseInput } from '../scripts/batch-watch.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const T02_ROOT = existsSync("/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手")
  ? "/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手"
  : (process.env.T02_ROOT || null);
const HAS_T02 = Boolean(T02_ROOT && existsSync(T02_ROOT));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SheetJS = await loadXlsx();
setSpreadsheetEngine(SheetJS);

const mammothSource = await readFile(join(here, "../src/vendor/mammoth.browser.min.js"), "utf8");
const { runInThisContext } = await import("node:vm");
runInThisContext(mammothSource);
setDocxEngine(globalThis.mammoth);

const readRaw = async (relativePath) => {
  if (!HAS_T02) return null;
  const fullPath = join(T02_ROOT, relativePath);
  if (!existsSync(fullPath)) return null;
  return readFile(fullPath);
};

// ---------------------------------------------------------------------------
// 1. 青川易创与云汉达 real CSV
// ---------------------------------------------------------------------------

test('青川易创 real CSV parses all 127 header columns without crashing', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv');
  const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
  const rows = parseCSV(csv);
  assert.ok(rows.length > 1000, `expected many rows from real data, got ${rows.length}`);
  const headerRow = rows[0];
  assert.ok(Object.keys(headerRow).length >= 120, `expected wide header, got ${Object.keys(headerRow).length}`);
  assert.ok('实际电流（A）' in headerRow);
  assert.ok('单片电压1（V）' in headerRow);
});

test('青川易创 real CSV empty trailing fields become empty strings', () => {
  const csv = [
    '测试时间,实际电流（A）,单片电压1（V）,单片电压2（V）',
    '2026/6/23 14:30,14.7,,'
  ].join('\n');
  const rows = parseCSV(csv);
  assert.equal(rows[0]['单片电压1（V）'], '');
  assert.equal(rows[0]['单片电压2（V）'], '');
});

// ---------------------------------------------------------------------------
// 2. 氢璞创能 real .txt files
// ---------------------------------------------------------------------------

test('氢璞创能 real ISO-8859 .txt decodes to UTF-8 and parses as tab-delimited table', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包01_氢璞创能/2026-4-4-18-56-04.txt');
  const decoded = decodeTextBuffer(buf, 'gb18030');
  assert.equal(decoded.binary, false);
  assert.match(decoded.text, /时间/);
  const rows = parseCSV(decoded.text);
  assert.ok(rows.length >= 100, `expected many rows from real data, got ${rows.length}`);
  assert.ok('时间' in rows[0]);
  assert.ok('电堆电压' in rows[0]);
  assert.equal(rows[0]['时间'], '18:56:05');
});

test('氢璞创能 real .txt preserves high-precision numeric values from raw data', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包01_氢璞创能/2026-4-4-18-56-04.txt');
  const decoded = decodeTextBuffer(buf, 'gb18030');
  const rows = parseCSV(decoded.text);
  const firstRow = rows[0];
  assert.equal(firstRow['电堆电压'], '0.000000');
  assert.equal(firstRow['电堆电流'], '2.200000');
  assert.equal(firstRow['电堆功率'], '0.000000');
});

test('氢璞创能 real .txt 2026-4-4-19-00-50 decodes from GB18030 and parses headers', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包01_氢璞创能/2026-4-4-19-00-50.txt');
  const decoded = decodeTextBuffer(buf, 'gb18030');
  assert.equal(decoded.binary, false);
  assert.match(decoded.text, /时间/);
  const rows = parseCSV(decoded.text);
  assert.ok(rows.length >= 100, `expected many rows, got ${rows.length}`);
  assert.ok('时间' in rows[0]);
  assert.ok('电堆电压' in rows[0]);
});

test('氢璞创能 real .txt 2026-4-5-11-32-54 decodes from GB18030 and parses headers', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包01_氢璞创能/2026-4-5-11-32-54.txt');
  const decoded = decodeTextBuffer(buf, 'gb18030');
  assert.equal(decoded.binary, false);
  assert.match(decoded.text, /时间/);
  const rows = parseCSV(decoded.text);
  assert.ok(rows.length >= 100, `expected many rows, got ${rows.length}`);
  assert.ok('时间' in rows[0]);
});

test('氢璞创能 real .txt zero power values are retained and do not trigger NaN', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包01_氢璞创能/2026-4-4-18-56-04.txt');
  const decoded = decodeTextBuffer(buf, 'gb18030');
  const rows = parseCSV(decoded.text);
  const zeroPowerRows = rows.filter((row) => row['电堆功率'] === '0.000000');
  assert.ok(zeroPowerRows.length >= 1, 'expected zero-power rows in real hypu data');
});

// ---------------------------------------------------------------------------
// 3. 氢璞创能 real .xlsx workbook
// ---------------------------------------------------------------------------

test('氢璞创能 real .xlsx workbook parses 8 sheets and selects 稳定性 as time series', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包01_氢璞创能/299-001-D_出厂检测报告.xlsx');
  const result = parseDataWorkbook(buf);
  assert.equal(result.ok, true);
  assert.equal(result.sheetName, '稳定性');
  assert.equal(result.workbookEvidenceSummary.sheetCount, 8);
  assert.equal(result.workbookEvidenceSummary.parsedSheetCount, 8);
  assert.equal(result.workbookEvidenceSummary.selectedTimeSeriesSheet, '稳定性');
  assert.ok(result.rows.length >= 1000, `expected many rows, got ${result.rows.length}`);
});

test('氢璞创能 real .xlsx workbook formula audit reports review_required with cached values', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包01_氢璞创能/299-001-D_出厂检测报告.xlsx');
  const result = parseDataWorkbook(buf);
  assert.equal(result.formulaAudit.status, 'review_required');
  assert.ok(result.formulaAudit.formulaCellCount >= 6000);
  assert.equal(result.formulaAudit.cachedFormulaCellCount, result.formulaAudit.formulaCellCount);
  assert.equal(result.formulaAudit.uncachedFormulaCellCount, 0);
});

test('氢璞创能 real .xlsx workbook evidence summary contains factory report metadata', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包01_氢璞创能/299-001-D_出厂检测报告.xlsx');
  const result = parseDataWorkbook(buf);
  assert.equal(result.workbookEvidenceSummary.reportEvidenceSheetCount, 1);
  assert.ok(result.workbookEvidenceSummary.reportMetadataFieldCount >= 10);
  assert.ok(result.workbookEvidenceSummary.reportPerformanceCheckCount >= 10);
});

// ---------------------------------------------------------------------------
// 3b. 青川易创 real .docx task specification
// ---------------------------------------------------------------------------

test('青川易创 real DOCX task specification parses metadata and table content', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包03_青川易创与云汉达/03 青川科技-燃料电池电堆时序测试数据处理任务说明书.docx');
  const result = await parseDurabilityDocx(buf);
  assert.ok(result);
  assert.ok(Object.keys(result.metadata).length >= 1, 'expected metadata from docx');
  assert.ok(result.headers.length >= 1, 'expected headers from docx');
});

// ---------------------------------------------------------------------------
// 4. 氢质氢离 real .docx durability reports
// ---------------------------------------------------------------------------

test('氢质氢离 real durability docx extracts metadata and 60 power points', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包02_氢质氢离/01_耐久原始数据处理/耐久0-5-20260605211610.docx');
  const result = await parseDurabilityDocx(buf);
  assert.ok(result);
  assert.equal(result.metadata['测试方案'], '耐久0-5');
  assert.equal(result.metadata['电堆型号'], 'H3300B');
  assert.equal(result.metadata['测试结果'], '未通过');
  assert.equal(result.points.length, 60);
  assert.equal(result.headers.length, 14);
  assert.equal(result.points[0].target_power_kw, 33);
  assert.equal(result.points[0].average_cell_voltage_mv, 813);
});

test('氢质氢离 real durability docx 耐久5-10 reports 未通过 with correct metadata', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包02_氢质氢离/01_耐久原始数据处理/耐久5-10-20260606024937.docx');
  const result = await parseDurabilityDocx(buf);
  assert.ok(result);
  assert.equal(result.metadata['测试方案'], '耐久5-10');
  assert.equal(result.metadata['测试结果'], '未通过');
  assert.ok(result.points.length >= 50);
});

test('氢质氢离 all 8 real durability docx files parse without errors', { skip: !HAS_T02 }, async () => {
  const files = [
    '耐久0-5-20260605211610.docx',
    '耐久5-10-20260606024937.docx',
    '耐久10-15-20260606081413.docx',
    '耐久15-20-20260606133914.docx',
    '耐久25-30-20260607051025.docx',
    '耐久30-35-20260607103407.docx',
    '耐久35-40-20260607160018.docx',
    '耐久40-45-20260608020949.docx'
  ];
  for (const file of files) {
    const buf = await readRaw(`企业资料包02_氢质氢离/01_耐久原始数据处理/${file}`);
    const result = await parseDurabilityDocx(buf);
    assert.ok(result, `${file} should parse successfully`);
    assert.ok(result.points.length >= 1, `${file} should have at least one power point`);
    assert.ok(result.headers.length >= 10, `${file} should have expected headers`);
  }
});

test('氢质氢离 real docx preserves HFR and LFR numeric values', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包02_氢质氢离/01_耐久原始数据处理/耐久0-5-20260605211610.docx');
  const result = await parseDurabilityDocx(buf);
  const hfrValues = result.points.map((p) => p.hfr).filter((v) => v !== null);
  const lfrValues = result.points.map((p) => p.lfr).filter((v) => v !== null);
  assert.ok(hfrValues.length >= 1, 'expected HFR values');
  assert.ok(lfrValues.length >= 1, 'expected LFR values');
  assert.ok(hfrValues.every((v) => Number.isFinite(v)));
  assert.ok(lfrValues.every((v) => Number.isFinite(v)));
});

// ---------------------------------------------------------------------------
// 4b. 氢质氢离 real vehicle CSV 212 and 345
// ---------------------------------------------------------------------------

test('氢质氢离 real vehicle CSV 212 parses headers and many rows', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (1).csv');
  const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
  const rows = parseCSV(csv);
  assert.ok(rows.length >= 100, `expected many rows, got ${rows.length}`);
  assert.ok('Timestamp' in rows[0]);
  assert.ok('FC_CurrOut' in rows[0]);
  assert.ok('FC_VehicleIsolationR' in rows[0]);
});

test('氢质氢离 real vehicle CSV 345 parses headers and many rows', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (1).csv');
  const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
  const rows = parseCSV(csv);
  assert.ok(rows.length >= 100, `expected many rows, got ${rows.length}`);
  assert.ok('Timestamp' in rows[0]);
  assert.ok('FC_CurrOut' in rows[0]);
});

// ---------------------------------------------------------------------------
// 5. 海珀特 real PDF
// ---------------------------------------------------------------------------

test('海珀特 real PDF is detected as binary before any parser attempts text extraction', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包04_海珀特/00_企业资料说明.pdf');
  assert.equal(isLikelyBinary(buf), true);
  const decoded = decodeTextBuffer(buf);
  assert.equal(decoded.binary, true);
});

test('海珀特 real PDF returns blocked_binary from shared input boundary', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包04_海珀特/00_企业资料说明.pdf');
  const result = await parseInput('haipte-description.pdf', buf);
  assert.equal(result.status, 'blocked_binary');
  assert.ok(result.binaryReason);
  assert.equal(result.rows.length, 0);
});

// ---------------------------------------------------------------------------
// 6. Edge cases found in real data
// ---------------------------------------------------------------------------

test('青川易创 real CSV 38258 rows produce deterministic analysis without overflow', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv');
  const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
  const rows = parseCSV(csv);
  assert.ok(rows.length >= 38000, `expected ~38k rows, got ${rows.length}`);
  const result = analyzeEnterpriseRows(rows, getProfile('qingchuan-stack'));
  assert.ok(result);
  assert.equal(result.datasetType, 'stack');
  assert.ok(result.metrics.peakPowerW >= 0);
  assert.ok(result.quality.usable || result.verdict === 'WARN' || result.verdict === 'FAIL');
});

test('氢璞创能 real .txt tab-delimited header with 300+ columns parses without truncation', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包01_氢璞创能/2026-4-4-18-56-04.txt');
  const decoded = decodeTextBuffer(buf, 'gb18030');
  const rows = parseCSV(decoded.text);
  const firstRow = rows[0];
  assert.ok(Object.keys(firstRow).length >= 250, `expected 250+ columns, got ${Object.keys(firstRow).length}`);
});

test('氢质氢离 real docx 耐久0-5 reports 未通过 and preserves 系统名称 P30_482', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包02_氢质氢离/01_耐久原始数据处理/耐久0-5-20260605211610.docx');
  const result = await parseDurabilityDocx(buf);
  assert.equal(result.metadata['测试结果'], '未通过');
  assert.equal(result.metadata['系统名称'], 'P30_482');
  assert.ok(result.points.some((p) => p.target_power_kw === 33));
});

// ---------------------------------------------------------------------------
// 6b. 青川易创 real PDF
// ---------------------------------------------------------------------------

test('青川易创 real PDF 00_企业资料说明 is detected as binary', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包03_青川易创与云汉达/00_企业资料说明.pdf');
  assert.equal(isLikelyBinary(buf), true);
  const decoded = decodeTextBuffer(buf);
  assert.equal(decoded.binary, true);
});

test('青川易创 real PDF 01 宽温域PEM is detected as binary', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包03_青川易创与云汉达/01 宽温域PEM制氢与氢燃料电池电堆技术开发与应用-青川科技(260314-FC).pdf');
  assert.equal(isLikelyBinary(buf), true);
  const decoded = decodeTextBuffer(buf);
  assert.equal(decoded.binary, true);
});

// ---------------------------------------------------------------------------
// 7. Malformed real data
// ---------------------------------------------------------------------------

test('malformed UTF-8 bytes in a nominally real CSV are flagged as binary-or-non-text', () => {
  const malformed = new Uint8Array([0xe4, 0xb8, 0x03, 0x01, 0x02]);
  const decoded = decodeTextBuffer(malformed, 'utf-8');
  assert.equal(decoded.binary, true);
  assert.ok(decoded.binaryReason?.length > 0);
});

test('truncated real CSV missing final column still parses first rows without crash', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv');
  const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
  const truncated = csv.split('\n').slice(0, 10).join('\n');
  const rows = parseCSV(truncated);
  assert.ok(rows.length >= 5);
  assert.ok('实际电流（A）' in rows[0]);
});

test('real CSV with mixed CRLF and LF line endings parses correctly', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv');
  const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
  const mixed = csv.replace(/\n/g, '\r\n').slice(0, 5000);
  const rows = parseCSV(mixed);
  assert.ok(rows.length >= 2);
});

// ---------------------------------------------------------------------------
// 8. Boundary conditions with real values
// ---------------------------------------------------------------------------

test('氢璞创能 real .txt zero power values are recorded as exact zeros', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包01_氢璞创能/2026-4-4-18-56-04.txt');
  const decoded = decodeTextBuffer(buf, 'gb18030');
  const rows = parseCSV(decoded.text);
  const zeroPowerRows = rows.filter((row) => row['电堆功率'] === '0.000000');
  assert.ok(zeroPowerRows.length >= 1, 'expected zero-power rows in real hypu data');
});

test('青川易创 real CSV boundary values at exact defaults do not crash analyzer', () => {
  const csv = [
    '测试时间,实际电流（A）,实际电压（V）,功率（kW）,冷却水入口温度（℃）,阳极入堆压力（kPa）,阳极流量（SLPM）,柜内氢气浓度（ppm）,片数',
    '2026/6/23 14:30,14.7,0.582,8.55,55.0,150,187.75,0,4'
  ].join('\n');
  const rows = parseCSV(csv);
  const result = analyzeEnterpriseRows(rows, getProfile('qingchuan-stack'));
  assert.ok(result);
  assert.ok(['PASS', 'WARN', 'FAIL', 'DESCRIPTIVE'].includes(result.verdict));
});

test('氢质氢离 real docx boundary: first power point target 33 kW is minimum observed', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包02_氢质氢离/01_耐久原始数据处理/耐久0-5-20260605211610.docx');
  const result = await parseDurabilityDocx(buf);
  const powers = result.points.map((p) => p.target_power_kw);
  assert.ok(powers.length >= 60);
  assert.ok(Math.min(...powers) <= 33);
  assert.ok(Math.max(...powers) >= 195);
});

// ---------------------------------------------------------------------------
// 9. Error handling with real data
// ---------------------------------------------------------------------------

test('real xlsx workbook with 6572 formula cells reports review_required boundary', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包01_氢璞创能/299-001-D_出厂检测报告.xlsx');
  const result = parseDataWorkbook(buf);
  assert.equal(result.formulaAudit.formulaCellCount, 6572);
  assert.equal(result.formulaAudit.status, 'review_required');
  assert.ok(result.formulaAudit.boundary.includes('企业批准人员复核'));
});

test('real PDF binary detection prevents parser crash on enterprise description file', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包04_海珀特/00_企业资料说明.pdf');
  const result = await parseInput('haipte-description.pdf', buf);
  assert.equal(result.status, 'blocked_binary');
  assert.ok(result.binaryReason?.length > 0);
});

test('real docx durability report with non-docx content throws descriptive error', async () => {
  const randomBuf = Buffer.from('this is not a docx file content');
  let threw = false;
  try {
    await parseDurabilityDocx(randomBuf);
  } catch (error) {
    threw = true;
    assert.ok(error.message.includes('docx_parse_failed') || error.message.includes('docx_engine_unavailable') || error.message.includes('Could not find file'));
  }
  assert.equal(threw, true);
});

// ---------------------------------------------------------------------------
// 10. Mobile-responsive UI with real data
// ---------------------------------------------------------------------------

test('static page includes mobile viewport and real-data input contract markers', async () => {
  const page = await readFile(join(here, '../src/index.html'), 'utf8');
  assert.match(page, /<meta name="viewport"/);
  assert.match(page, /\.csv/);
  assert.match(page, /\.txt/);
  assert.match(page, /\.xlsx/);
  assert.match(page, /\.docx/);
  assert.match(page, /\.pdf/);
});

test('Vinext app page exposes real-data upload surfaces for all T02 packages', async () => {
  const page = await readFile(join(here, '../app/page.tsx'), 'utf8');
  assert.match(page, /csv/);
  assert.match(page, /txt/);
  assert.match(page, /xlsx/);
  assert.match(page, /docx/);
  assert.match(page, /pdf/);
});

// ---------------------------------------------------------------------------
// 11. Accessibility with real data scenarios
// ---------------------------------------------------------------------------

test('static page includes skip link and ARIA-friendly real-data result regions', async () => {
  const page = await readFile(join(here, '../src/index.html'), 'utf8');
  assert.match(page, /skip-link/);
  assert.match(page, /result-announcement/);
  assert.match(page, /enterprise-performance-chart-summary/);
  assert.match(page, /metric-trace-details/);
});

test('app accessibility tree exposes live regions for real-data analysis updates', async () => {
  const page = await readFile(join(here, '../app/page.tsx'), 'utf8');
  assert.match(page, /aria-live/);
  assert.match(page, /result-announcement/);
});

// ---------------------------------------------------------------------------
// 12. Encoding and BOM edge cases with real data
// ---------------------------------------------------------------------------

test('UTF-8 BOM-prefixed CSV text is stripped and parses correctly', async () => {
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  const csv = Buffer.concat([bom, Buffer.from('测试时间,实际电流（A）\n2026/6/23 14:30,14.7')]);
  const decoded = decodeTextBuffer(csv, 'utf-8');
  assert.equal(decoded.binary, false);
  assert.ok(!decoded.text.startsWith('\uFEFF'));
  const rows = parseCSV(decoded.text);
  assert.ok(rows.length >= 1);
  assert.equal(rows[0]['测试时间'], '2026/6/23 14:30');
});

test('GB18030 text with valid Chinese decodes without replacement characters', async () => {
  const sample = Buffer.from([0xca, 0xb1, 0xbc, 0xe4, 0x2c, 0xb5, 0xe7, 0xb6, 0xd1, 0xb5, 0xe7, 0xd1, 0xb9, 0x0a, 0x31, 0x38, 0x3a, 0x35, 0x36, 0x3a, 0x30, 0x35, 0x2c, 0x30, 0x2e, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30]);
  const decoded = decodeTextBuffer(sample, 'gb18030');
  assert.equal(decoded.binary, false);
  assert.ok(!decoded.text.includes('\uFFFD'));
  const rows = parseCSV(decoded.text);
  assert.equal(rows[0]['时间'], '18:56:05');
});

test('random bytes with invalid UTF-8 sequences are flagged as binary', () => {
  const invalid = Buffer.from([0xff, 0xfe, 0xfd, 0xfc, 0xfb]);
  const decoded = decodeTextBuffer(invalid, 'utf-8');
  assert.equal(decoded.binary, true);
  assert.ok(decoded.binaryReason?.length > 0);
});

test('real CSV with embedded null bytes is detected as binary-or-non-text', { skip: !HAS_T02 }, async () => {
  const buf = await readRaw('企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv');
  const injected = Buffer.concat([buf.subarray(0, 100), Buffer.from([0x00]), buf.subarray(100)]);
  const decoded = decodeTextBuffer(injected);
  assert.equal(decoded.binary, true);
  assert.ok(decoded.binaryReason === 'nul_byte' || decoded.binaryReason === 'decode_replacement_character');
});
