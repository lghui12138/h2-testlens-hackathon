import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV } from '../src/analyzer.mjs';

test('parseCSV handles a UTF-8 BOM prefix', () => {
  const rows = parseCSV('\uFEFFtimestamp_s,current_a\n0,10\n60,20');
  assert.deepEqual(rows, [
    { timestamp_s: '0', current_a: '10' },
    { timestamp_s: '60', current_a: '20' }
  ]);
});

test('parseCSV ignores an empty last row caused by a trailing newline', () => {
  const rows = parseCSV('timestamp_s,current_a\n0,10\n60,20\n');
  assert.deepEqual(rows, [
    { timestamp_s: '0', current_a: '10' },
    { timestamp_s: '60', current_a: '20' }
  ]);
});

test('parseCSV keeps commas inside quotes from splitting fields', () => {
  const rows = parseCSV('timestamp_s,current_a\n"0,0",10\n"60,60",20');
  assert.deepEqual(rows, [
    { timestamp_s: '0,0', current_a: '10' },
    { timestamp_s: '60,60', current_a: '20' }
  ]);
});

test('parseCSV accepts Windows CRLF line endings', () => {
  const rows = parseCSV('timestamp_s,current_a\r\n0,10\r\n60,20');
  assert.deepEqual(rows, [
    { timestamp_s: '0', current_a: '10' },
    { timestamp_s: '60', current_a: '20' }
  ]);
});

test('parseCSV creates empty strings for consecutive commas', () => {
  const rows = parseCSV('a,b,c\n1,,3');
  assert.deepEqual(rows, [{ a: '1', b: '', c: '3' }]);
});
