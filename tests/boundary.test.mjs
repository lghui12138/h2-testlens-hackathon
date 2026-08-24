import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, analyzeRows } from '../src/analyzer.mjs';

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
