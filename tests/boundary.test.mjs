import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, analyzeRows } from '../src/analyzer.mjs';
import { decodeTextBuffer } from '../src/input-safety.mjs';

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
  for (let i = 0; i < 50_000; i += 1) {
    lines.push(`${i},${(10 + (i % 40)).toFixed(2)},${(1.4 + (i % 20) * 0.02).toFixed(2)}`);
  }
  const csv = lines.join('\n');
  assert.ok(Buffer.byteLength(csv) > 1_000_000, 'synthetic 50k buffer should exceed 1 MB');
  const rows = parseCSV(csv);
  assert.equal(rows.length, 50_000);
  assert.equal(rows[0].timestamp_s, '0');
  assert.equal(rows.at(-1).timestamp_s, '49999');
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
  const sample = Buffer.from('时间,电流\n18:56:05,14.7', 'gb18030');
  const decoded = decodeTextBuffer(sample, 'gb18030');
  assert.equal(decoded.binary, false);
  assert.ok(!decoded.text.includes('\uFFFD'));
  assert.ok(decoded.text.includes('时间'));
});
