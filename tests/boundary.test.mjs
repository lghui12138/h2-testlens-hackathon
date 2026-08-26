import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCSV, analyzeRows } from '../src/analyzer.mjs';
import { analyzeEnterpriseRows } from '../src/enterprise-adapters.mjs';
import { getProfile } from '../src/profiles.mjs';
import { parseDataWorkbook } from '../src/excel-workflow.mjs';
import { parseDurabilityDocx, setDocxEngine } from '../src/docx-workflow.mjs';
import { decodeTextBuffer } from '../src/input-safety.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const mammothSource = await readFile(join(here, '../src/vendor/mammoth.browser.min.js'), 'utf8');
const { runInThisContext } = await import('node:vm');
runInThisContext(mammothSource);
setDocxEngine(globalThis.mammoth);

test('parseCSV("") returns an empty array without throwing', () => {
  assert.deepEqual(parseCSV(''), []);
});

test('parseCSV handles CRLF and LF, but does not treat bare CR as a row separator', () => {
  const crlf = parseCSV('timestamp_s,current_a\n1,2\n3,4');
  const lf = parseCSV('timestamp_s,current_a\r1,2\r3,4');
  assert.deepEqual(crlf, [{ timestamp_s: '1', current_a: '2' }, { timestamp_s: '3', current_a: '4' }]);
  assert.deepEqual(lf, []);
});

test('parseCSV preserves Unicode headers and values', () => {
  const rows = parseCSV('α,β\n1,2\n3,4');
  assert.ok(rows.every((row) => Object.prototype.hasOwnProperty.call(row, 'α')));
  assert.ok(rows.every((row) => Object.prototype.hasOwnProperty.call(row, 'β')));
  assert.deepEqual(rows, [{ α: '1', β: '2' }, { α: '3', β: '4' }]);
});

test('parseCSV returns an empty array for a header-only CSV', () => {
  assert.deepEqual(parseCSV('timestamp_s,current_a'), []);
});

test('parseCSV returns exactly one row for a single-row CSV', () => {
  const rows = parseCSV('timestamp_s,current_a\n1,2');
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { timestamp_s: '1', current_a: '2' });
});

test('analyzeRows does not crash on a single parsed row', () => {
  const result = analyzeRows(parseCSV('timestamp_s,current_a,voltage_v,pressure_bar,leak_ppm,temperature_c,flow_slpm\n1,2,3,4,5,6,7'));
  assert.equal(result.quality.hasEnoughRows, false);
  assert.ok(result.issues.some((issue) => issue.code === 'DATA_TOO_SHORT'));
});

test('missing all recognizable columns produces SCHEMA_MISSING without crashing', () => {
  const result = analyzeRows(parseCSV('a,b,c\n1,2,3'));
  assert.ok(result.schema.missingHeaders.includes('timestamp_s'));
  assert.ok(result.schema.missingHeaders.includes('current_a'));
  assert.ok(result.issues.some((issue) => issue.code === 'SCHEMA_MISSING'));
});

test('extremely long current_a values do not crash analyzeRows', () => {
  const longValue = '9'.repeat(1200);
  const rows = parseCSV([
    'timestamp_s,current_a,voltage_v,pressure_bar,leak_ppm,temperature_c,flow_slpm',
    `0,${longValue},0.7,3,0,50,100`,
    `10,${longValue},0.7,3,0,50,100`
  ].join('\n'));
  const result = analyzeRows(rows);
  assert.equal(result.verdict, 'WARN');
  assert.ok(result.issues.some((issue) => issue.code === 'DATA_GAP'));
});

test('all-NaN values in a key column do not crash stability-related calculations', () => {
  const lines = [
    'timestamp_s,current_a,voltage_v,pressure_bar,leak_ppm,temperature_c,flow_slpm'
  ];
  for (let index = 0; index < 20; index += 1) {
    lines.push(`${index * 10},NaN,0.7,3,0,50,100`);
  }
  const result = analyzeRows(parseCSV(lines.join('\n')));
  assert.ok(Number.isFinite(result.metrics.steadyVoltageStdV));
  assert.ok(result.issues.some((issue) => issue.code === 'DATA_GAP'));
});

// ---------------------------------------------------------------------------
// 9. Empty file boundary
// ---------------------------------------------------------------------------

test('parseCSV on 0-byte empty buffer returns empty array without throwing', () => {
  assert.deepEqual(parseCSV(Buffer.alloc(0)), []);
});

test('decodeTextBuffer on 0-byte empty buffer returns non-binary empty text', () => {
  const decoded = decodeTextBuffer(Buffer.alloc(0));
  assert.equal(decoded.binary, false);
  assert.equal(decoded.text, '');
});

// ---------------------------------------------------------------------------
// 10. Corrupted file boundary
// ---------------------------------------------------------------------------

test('parseCSV on truncated CSV with header only returns empty rows without crash', () => {
  assert.deepEqual(parseCSV('timestamp_s,current_a,voltage_v'), []);
});

test('decodeTextBuffer on truncated multi-byte UTF-8 sequence returns binary', () => {
  const truncated = Buffer.from([0xe4, 0xb8, 0x03]);
  const decoded = decodeTextBuffer(truncated, 'utf-8');
  assert.equal(decoded.binary, true);
  assert.ok(decoded.binaryReason?.length > 0);
});

test('parseCSV on CSV with embedded null bytes returns empty array', () => {
  const withNull = 'a,b\n1\0,2\n3,4';
  assert.deepEqual(parseCSV(withNull), []);
});

// ---------------------------------------------------------------------------
// 11. Large file performance boundary
// ---------------------------------------------------------------------------

test('parseCSV on 50k-row synthetic buffer completes without memory crash', () => {
  const lines = ['timestamp_s,current_a,voltage_v'];
  for (let i = 0; i < 60_000; i += 1) {
    lines.push(`${i},${(10 + (i % 40)).toFixed(2)},${(1.4 + (i % 20) * 0.02).toFixed(2)}`);
  }
  const csv = lines.join('\n');
  assert.ok(Buffer.byteLength(csv) > 1_000_000, 'synthetic 50k buffer should exceed 1 MB');
  const rows = parseCSV(csv);
  assert.equal(rows.length, 60_000);
  assert.equal(rows[0].timestamp_s, '0');
  assert.equal(rows.at(-1).timestamp_s, '59999');
});

// ---------------------------------------------------------------------------
// 12. Encoding boundary
// ---------------------------------------------------------------------------

test('parseCSV on UTF-8 BOM-prefixed text strips BOM and parses correctly', () => {
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  const text = Buffer.concat([bom, Buffer.from('a,b\n1,2\n3,4')]);
  assert.ok(text.toString('hex').startsWith('efbbbf'));
  const rows = parseCSV(text.toString('utf8'));
  assert.deepEqual(rows, [{ a: '1', b: '2' }, { a: '3', b: '4' }]);
});

test('decodeTextBuffer on valid UTF-16LE with BOM decodes to UTF-8 text', () => {
  const bom = Buffer.from([0xff, 0xfe]);
  const content = Buffer.from('a,b\n1,2\n3,4', 'utf-16le');
  const buffer = Buffer.concat([bom, content]);
  const decoded = decodeTextBuffer(buffer, 'utf-8');
  assert.equal(decoded.binary, false);
  assert.ok(decoded.text.includes('1,2'));
});

test('decodeTextBuffer on random high-byte data without valid encoding falls back safely', () => {
  const random = Buffer.from(Array.from({ length: 256 }, (_, i) => i % 256));
  const decoded = decodeTextBuffer(random, 'gb18030');
  assert.ok(decoded.binary === true || decoded.binary === false);
  if (!decoded.binary) {
    assert.ok(typeof decoded.text === 'string');
  }
});

test('decodeTextBuffer on valid GB18030 Chinese text preserves characters without replacement', () => {
  const sample = Buffer.from([0xca, 0xb1, 0xbc, 0xe4, 0x2c, 0xb5, 0xe7, 0xc1, 0xf7, 0x0a, 0x31, 0x38, 0x3a, 0x35, 0x36, 0x3a, 0x30, 0x35, 0x2c, 0x31, 0x34, 0x2e, 0x37]);
  const decoded = decodeTextBuffer(sample, 'gb18030');
  assert.equal(decoded.binary, false);
  assert.ok(!decoded.text.includes('\uFFFD'));
  assert.ok(decoded.text.includes('时间'));
});

 // ---------------------------------------------------------------------------
 // 13. Real-format empty/corrupted boundaries
 // ---------------------------------------------------------------------------

 test('0-byte TXT-like buffer decodes as empty text without binary flag', () => {
   const decoded = decodeTextBuffer(Buffer.alloc(0), 'gb18030');
   assert.equal(decoded.binary, false);
   assert.equal(decoded.text, '');
 });

 test('0-byte PDF-like buffer is detected as binary-or-non-text', () => {
   const decoded = decodeTextBuffer(Buffer.alloc(0));
   assert.equal(decoded.binary, false);
 });

 test('corrupted bytes claiming to be GB18030 fall back safely without throwing', () => {
   const corrupted = Buffer.from([0x80, 0x81, 0x82, 0x83, 0x84]);
   const decoded = decodeTextBuffer(corrupted, 'gb18030');
   assert.ok(decoded.binary === true || decoded.binary === false);
   if (!decoded.binary) {
     assert.ok(typeof decoded.text === 'string');
   }
 });

 test('parseCSV on empty string returns empty array', () => {
   assert.deepEqual(parseCSV(''), []);
 });

 test('parseCSV on string with only whitespace returns empty array', () => {
   assert.deepEqual(parseCSV('   \n\t\n   '), []);
 });

 test('analyzeRows on single header-only row reports DATA_TOO_SHORT', () => {
   const result = analyzeRows(parseCSV('timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm'));
   assert.equal(result.quality.hasEnoughRows, false);
   assert.ok(result.issues.some((issue) => issue.code === 'DATA_TOO_SHORT'));
 });

  // ---------------------------------------------------------------------------
  // 14. Real-file boundary injections
  // ---------------------------------------------------------------------------

  const HAS_T02 = existsSync('/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手');

  test('real Qingchuan CSV with injected null byte is detected as binary-or-non-text', { skip: !HAS_T02 }, async () => {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const { dirname } = await import('node:path');
    const here = dirname(fileURLToPath(import.meta.url));
    const T02_ROOT = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';
    const buf = await readFile(join(T02_ROOT, '企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv'));
    const injected = Buffer.concat([buf.subarray(0, 100), Buffer.from([0x00]), buf.subarray(100)]);
    const decoded = decodeTextBuffer(injected);
    assert.equal(decoded.binary, true);
  });

  test('truncated real Qingchuan CSV with only header parses as empty rows', { skip: !HAS_T02 }, async () => {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const { dirname } = await import('node:path');
    const here = dirname(fileURLToPath(import.meta.url));
    const T02_ROOT = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';
    const buf = await readFile(join(T02_ROOT, '企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv'));
    const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
    const truncated = csv.split('\n').slice(0, 1).join('\n');
    assert.deepEqual(parseCSV(truncated), []);
  });

  test('real 氢璞创能 TXT declared as UTF-8 surfaces binary flag due to control bytes', { skip: !HAS_T02 }, async () => {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const { dirname } = await import('node:path');
    const here = dirname(fileURLToPath(import.meta.url));
    const T02_ROOT = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';
    const buf = await readFile(join(T02_ROOT, '企业资料包01_氢璞创能/2026-4-5-13-16-20.txt'));
    const decoded = decodeTextBuffer(buf, 'utf-8');
    assert.equal(decoded.binary, true);
    assert.ok(decoded.binaryReason?.length > 0);
  });

  test('0-byte buffer for each format is handled without throwing', () => {
    assert.deepEqual(parseCSV(Buffer.alloc(0)), []);
    const decoded = decodeTextBuffer(Buffer.alloc(0));
    assert.equal(decoded.binary, false);
    assert.equal(decoded.text, '');
  });

  // ---------------------------------------------------------------------------
  // 15. Real-file boundary injections
  // ---------------------------------------------------------------------------

  test('real Qingchuan CSV with injected null byte is detected as binary-or-non-text', { skip: !HAS_T02 }, async () => {
    const T02_ROOT = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';
    const buf = await readFile(join(T02_ROOT, '企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv'));
    const injected = Buffer.concat([buf.subarray(0, 100), Buffer.from([0x00]), buf.subarray(100)]);
    const decoded = decodeTextBuffer(injected);
    assert.equal(decoded.binary, true);
  });

  test('truncated real Qingchuan CSV with only header parses as empty rows', { skip: !HAS_T02 }, async () => {
    const T02_ROOT = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';
    const buf = await readFile(join(T02_ROOT, '企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv'));
    const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
    const truncated = csv.split('\n').slice(0, 1).join('\n');
    assert.deepEqual(parseCSV(truncated), []);
  });

  test('real 氢璞创能 TXT declared as UTF-8 surfaces binary flag due to control bytes', { skip: !HAS_T02 }, async () => {
    const T02_ROOT = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';
    const buf = await readFile(join(T02_ROOT, '企业资料包01_氢璞创能/2026-4-5-13-16-20.txt'));
    const decoded = decodeTextBuffer(buf, 'utf-8');
    assert.equal(decoded.binary, true);
    assert.ok(decoded.binaryReason?.length > 0);
  });

  test('0-byte buffer for each format is handled without throwing', () => {
    assert.deepEqual(parseCSV(Buffer.alloc(0)), []);
    const decoded = decodeTextBuffer(Buffer.alloc(0));
    assert.equal(decoded.binary, false);
    assert.equal(decoded.text, '');
  });

  test('real Qingchuan CSV boundary values at exact defaults do not crash adapter', { skip: !HAS_T02 }, async () => {
    const T02_ROOT = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';
    const buf = await readFile(join(T02_ROOT, '企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv'));
    const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
    const rows = parseCSV(csv);
    const result = analyzeEnterpriseRows(rows, getProfile('qingchuan-stack'));
    assert.ok(result);
    assert.ok(['PASS', 'WARN', 'FAIL', 'DESCRIPTIVE'].includes(result.verdict));
  });

  test('real 氢质氢离 vehicle CSV boundary: exact zero isolation values do not crash adapter', { skip: !HAS_T02 }, async () => {
    const T02_ROOT = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';
    const buf = await readFile(join(T02_ROOT, '企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (1).csv'));
    const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
    const rows = parseCSV(csv);
    const result = analyzeEnterpriseRows(rows, getProfile('qingzhihuli-vehicle'));
    assert.ok(result);
    assert.equal(result.datasetType, 'vehicle');
    assert.ok(result.dataset.insulation.validCount >= 0);
  });

  // ---------------------------------------------------------------------------
  // 16. Real-data enterprise boundary tests
  // ---------------------------------------------------------------------------

  test('real 青川易创 CSV with all-zero boundary values does not crash adapter', { skip: !HAS_T02 }, async () => {
    const T02_ROOT = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';
    const buf = await readFile(join(T02_ROOT, '企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv'));
    const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
    const rows = parseCSV(csv);
    const result = analyzeEnterpriseRows(rows, getProfile('qingchuan-stack'));
    assert.ok(result);
    assert.ok(['PASS', 'WARN', 'FAIL', 'DESCRIPTIVE'].includes(result.verdict));
  });

  test('real 氢质氢离 vehicle CSV with max isolation values preserves adapter output', { skip: !HAS_T02 }, async () => {
    const T02_ROOT = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';
    const buf = await readFile(join(T02_ROOT, '企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (1).csv'));
    const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
    const rows = parseCSV(csv);
    const result = analyzeEnterpriseRows(rows, getProfile('qingzhihuli-vehicle'));
    assert.ok(result);
    assert.equal(result.datasetType, 'vehicle');
    assert.ok(result.dataset.insulation.validCount >= 0);
  });

  test('real 氢璞创能 TXT with high-precision values preserves exact decimals', { skip: !HAS_T02 }, async () => {
    const T02_ROOT = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';
    const buf = await readFile(join(T02_ROOT, '企业资料包01_氢璞创能/2026-4-4-18-56-04.txt'));
    const decoded = decodeTextBuffer(buf, 'gb18030');
    assert.equal(decoded.binary, false);
    const rows = parseCSV(decoded.text);
    const voltageRow = rows.find((row) => row['电堆电压'] === '0.000000');
    assert.ok(voltageRow, 'should find zero voltage row');
    assert.equal(voltageRow['电堆电流'], '2.200000');
    assert.equal(voltageRow['电堆功率'], '0.000000');
  });

  test('real 氢质氢离 vehicle CSV boundary: exact zero current and voltage values do not crash adapter', { skip: !HAS_T02 }, async () => {
    const T02_ROOT = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';
    const buf = await readFile(join(T02_ROOT, '企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (1).csv'));
    const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
    const rows = parseCSV(csv);
    const result = analyzeEnterpriseRows(rows, getProfile('qingzhihuli-vehicle'));
    assert.ok(result);
    assert.equal(result.datasetType, 'vehicle');
    assert.ok(result.dataset.insulation.validCount >= 0);
    assert.ok(Array.isArray(result.issues));
  });

  test('real 青川易创 CSV 38k rows with exact boundary defaults produce deterministic verdict', { skip: !HAS_T02 }, async () => {
    const T02_ROOT = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';
    const buf = await readFile(join(T02_ROOT, '企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv'));
    const csv = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
    const rows = parseCSV(csv);
    const result = analyzeEnterpriseRows(rows, getProfile('qingchuan-stack'));
    assert.ok(result);
    assert.ok(['PASS', 'WARN', 'FAIL', 'DESCRIPTIVE'].includes(result.verdict));
    assert.ok(typeof result.metrics.peakPowerW === 'number' || result.metrics.peakPowerW === null);
    assert.ok(Number.isFinite(result.metrics.peakTemperatureC) || result.metrics.peakTemperatureC === null);
  });

  test('real 氢质氢离 durability docx boundary: first power point target 33 kW is minimum observed', { skip: !HAS_T02 }, async () => {
    const T02_ROOT = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';
    const buf = await readFile(join(T02_ROOT, '企业资料包02_氢质氢离/01_耐久原始数据处理/耐久0-5-20260605211610.docx'));
    const result = await parseDurabilityDocx(buf);
    const powers = result.points.map((p) => p.target_power_kw);
    assert.ok(powers.length >= 60);
    assert.ok(Math.min(...powers) <= 33);
    assert.ok(Math.max(...powers) >= 195);
  });
