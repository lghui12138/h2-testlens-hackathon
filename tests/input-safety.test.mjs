import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeTextBuffer, isLikelyBinary } from '../src/input-safety.mjs';
import { MAX_WORKBOOK_BYTES, MAX_WORKBOOK_COMPRESSION_RATIO, MAX_WORKBOOK_UNCOMPRESSED_BYTES, parseDataWorkbook, parseParameterWorkbook, setSpreadsheetEngine } from '../src/excel-workflow.mjs';
import { loadXlsx } from '../src/xlsx-node-loader.mjs';
import { parseInput } from '../scripts/batch-watch.mjs';

const SheetJS = await loadXlsx();
setSpreadsheetEngine(SheetJS);

test('shared input boundary detects binary content before text parsing', async () => {
  const binary = Uint8Array.from([0x18, 0x1b, 0x03, 0x1a, 0x15, 0x10, 0x19, 0x7c, 0x00]);
  assert.equal(isLikelyBinary(binary), true);
  assert.deepEqual(decodeTextBuffer(binary, 'gb18030'), { binary: true, text: null, encoding: 'binary-or-non-text' });
  const parsed = await parseInput('blocked.txt', binary);
  assert.equal(parsed.status, 'blocked_binary');
  assert.equal(parsed.rows.length, 0);
});

test('shared input boundary keeps ordinary GB18030-like text parseable', () => {
  const text = new TextEncoder().encode('时间\t功率(kW)\r\n0\t10\r\n');
  const decoded = decodeTextBuffer(text, 'utf-8');
  assert.equal(decoded.binary, false);
  assert.match(decoded.text, /功率/);
});

test('shared input boundary accepts explicitly marked UTF-16 tabular text', async () => {
  const source = '\ufeff时间\t功率(kW)\r\n0\t10\r\n';
  const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(source.slice(1), 'utf16le')]);
  const decoded = decodeTextBuffer(bytes, 'gb18030');
  assert.equal(isLikelyBinary(bytes), false);
  assert.equal(decoded.binary, false);
  assert.equal(decoded.encoding, 'utf-16le');
  assert.match(decoded.text, /功率/);
  const parsed = await parseInput('utf16.txt', bytes);
  assert.equal(parsed.status, 'processed');
  assert.equal(parsed.rows.length, 1);
});

test('workbook parsers reject oversized input before invoking SheetJS', () => {
  const oversized = { byteLength: MAX_WORKBOOK_BYTES + 1 };
  const data = parseDataWorkbook(oversized);
  const parameters = parseParameterWorkbook(oversized);
  for (const result of [data, parameters]) {
    assert.equal(result.ok, false);
    assert.match(result.errors[0], /工作簿超过 64 MiB 输入安全上限/);
    assert.equal(result.source?.inputSafety?.byteLength ?? result.inputSafety?.byteLength, MAX_WORKBOOK_BYTES + 1);
  }
});

function syntheticZip({ compressedSize = 1, uncompressedSize = 1, method = 0, fileName = 'xl/workbook.xml' } = {}) {
  const name = Buffer.from(fileName, 'utf8');
  const local = Buffer.alloc(30 + name.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(compressedSize >>> 0, 18);
  local.writeUInt32LE(uncompressedSize >>> 0, 22);
  local.writeUInt16LE(name.length, 26);
  name.copy(local, 30);
  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(compressedSize >>> 0, 20);
  central.writeUInt32LE(uncompressedSize >>> 0, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  name.copy(central, 46);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, eocd]);
}

test('workbook parsers reject malformed ZIP containers before SheetJS', () => {
  const result = parseDataWorkbook(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]));
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /不是完整的 XLSX\/XLSM ZIP 容器/);
});

test('workbook parsers reject ZIP entries with unsafe declared expansion', () => {
  const result = parseParameterWorkbook(syntheticZip({ compressedSize: 1, uncompressedSize: MAX_WORKBOOK_UNCOMPRESSED_BYTES + 1 }));
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /声明展开大小超过 256 MiB/);
});

test('workbook parsers reject ZIP bombs with an unsafe compression ratio', () => {
  const result = parseDataWorkbook(syntheticZip({ compressedSize: 1, uncompressedSize: MAX_WORKBOOK_COMPRESSION_RATIO + 1 }));
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /压缩比超过 200:1/);
});

test('workbook parser audits formula cells without executing or hiding cached values', () => {
  const book = SheetJS.utils.book_new();
  const sheet = SheetJS.utils.aoa_to_sheet([
    ['时间', '电流', '电压', '功率'],
    [0, 1, 2, 2],
    [1, 2, 3, 6]
  ]);
  sheet.D2 = { t: 'n', f: 'B2*C2', v: 2 };
  SheetJS.utils.book_append_sheet(book, sheet, '稳定性');
  const result = parseDataWorkbook(SheetJS.write(book, { type: 'buffer', bookType: 'xlsx' }));
  assert.equal(result.ok, true);
  assert.equal(result.formulaAudit.formulaCellCount, 1);
  assert.equal(result.formulaAudit.cachedFormulaCellCount, 1);
  assert.equal(result.formulaAudit.uncachedFormulaCellCount, 0);
  assert.equal(result.formulaAudit.status, 'review_required');
  assert.equal(result.workbookEvidenceSummary.formulaCellCount, 1);
});

test('workbook parser blocks VBA macro entries before SheetJS', () => {
  const result = parseDataWorkbook(syntheticZip({ fileName: 'xl/vbaProject.bin' }));
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /包含 VBA 宏/);
  assert.equal(result.inputSafety.ok, false);
  assert.equal(result.inputSafety.artifacts.macroPresent, true);
});
