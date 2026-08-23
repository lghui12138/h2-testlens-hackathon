let spreadsheetEngine = globalThis.XLSX || null;

// Resource-protection boundary, not a standards limit. The largest current
// T02 workbook is about 2.6 MiB; this leaves headroom while preventing an
// unbounded workbook from reaching the vendored SheetJS parser.
export const MAX_WORKBOOK_BYTES = 64 * 1024 * 1024;
export const MAX_WORKBOOK_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;
export const MAX_WORKBOOK_ZIP_ENTRIES = 2048;
export const MAX_WORKBOOK_COMPRESSION_RATIO = 200;

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_EOCD_MIN_BYTES = 22;
const ZIP_MAX_COMMENT_BYTES = 0xffff;

const readU16 = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8);
const readU32 = (bytes, offset) => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] * 0x1000000)) >>> 0;

const decodeZipEntryName = (bytes, offset, length) => {
  const raw = bytes.subarray(offset, offset + length);
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(raw);
  } catch {
    return Array.from(raw, (value) => String.fromCharCode(value)).join('');
  }
};

const workbookBytes = (input) => {
  if (input instanceof Uint8Array) return input;
  if (typeof ArrayBuffer !== 'undefined' && input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (Array.isArray(input)) return Uint8Array.from(input);
  return null;
};

function inspectWorkbookZip(input) {
  const bytes = workbookBytes(input);
  if (!bytes) return { ok: false, error: '工作簿输入不是可读取的字节缓冲区' };
  if (bytes.length < ZIP_EOCD_MIN_BYTES) return { ok: false, error: '工作簿不是完整的 XLSX/XLSM ZIP 容器' };
  const firstSignature = readU32(bytes, 0);
  if (firstSignature !== ZIP_LOCAL_SIGNATURE && firstSignature !== ZIP_EOCD_SIGNATURE) return { ok: false, error: '工作簿不是受支持的 XLSX/XLSM ZIP 容器' };
  const eocdStart = Math.max(0, bytes.length - ZIP_EOCD_MIN_BYTES - ZIP_MAX_COMMENT_BYTES);
  let eocdOffset = -1;
  for (let offset = bytes.length - ZIP_EOCD_MIN_BYTES; offset >= eocdStart; offset -= 1) {
    if (readU32(bytes, offset) === ZIP_EOCD_SIGNATURE) { eocdOffset = offset; break; }
  }
  if (eocdOffset < 0 || eocdOffset + ZIP_EOCD_MIN_BYTES > bytes.length) return { ok: false, error: '工作簿 ZIP 目录缺失或损坏' };
  const entryCount = readU16(bytes, eocdOffset + 10);
  const centralDirectoryBytes = readU32(bytes, eocdOffset + 12);
  const centralDirectoryOffset = readU32(bytes, eocdOffset + 16);
  const commentLength = readU16(bytes, eocdOffset + 20);
  if (entryCount === 0xffff || centralDirectoryBytes === 0xffffffff || centralDirectoryOffset === 0xffffffff) return { ok: false, error: '工作簿使用未启用的 ZIP64 容器，已阻断' };
  if (entryCount > MAX_WORKBOOK_ZIP_ENTRIES) return { ok: false, error: `工作簿 ZIP 条目数超过 ${MAX_WORKBOOK_ZIP_ENTRIES} 条输入安全上限（实际 ${entryCount} 条）` };
  if (eocdOffset + ZIP_EOCD_MIN_BYTES + commentLength > bytes.length || centralDirectoryOffset + centralDirectoryBytes > bytes.length || centralDirectoryOffset > eocdOffset) return { ok: false, error: '工作簿 ZIP 中央目录边界无效' };
  let offset = centralDirectoryOffset;
  let compressedBytes = 0;
  let uncompressedBytes = 0;
  const artifacts = {
    macroEntryCount: 0,
    externalLinkEntryCount: 0,
    activeXEntryCount: 0,
    embeddedObjectEntryCount: 0,
    customXmlEntryCount: 0,
    calculationChainEntryCount: 0
  };
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.length || readU32(bytes, offset) !== ZIP_CENTRAL_SIGNATURE) return { ok: false, error: '工作簿 ZIP 中央目录条目损坏或不完整' };
    const flags = readU16(bytes, offset + 8);
    const method = readU16(bytes, offset + 10);
    const compressedSize = readU32(bytes, offset + 20);
    const uncompressedSize = readU32(bytes, offset + 24);
    const fileNameLength = readU16(bytes, offset + 28);
    const extraLength = readU16(bytes, offset + 30);
    const entryCommentLength = readU16(bytes, offset + 32);
    const localHeaderOffset = readU32(bytes, offset + 42);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) return { ok: false, error: '工作簿 ZIP 条目使用未启用的 ZIP64 容器，已阻断' };
    if (flags & 0x1) return { ok: false, error: '工作簿 ZIP 条目已加密，已阻断' };
    if (method !== 0 && method !== 8) return { ok: false, error: `工作簿 ZIP 使用不受支持的压缩方法（${method}），已阻断` };
    const centralEntryBytes = 46 + fileNameLength + extraLength + entryCommentLength;
    if (offset + centralEntryBytes > bytes.length) return { ok: false, error: '工作簿 ZIP 中央目录条目边界无效' };
    if (localHeaderOffset + 30 > bytes.length || readU32(bytes, localHeaderOffset) !== ZIP_LOCAL_SIGNATURE) return { ok: false, error: '工作簿 ZIP 本地文件头缺失或损坏' };
    const entryName = decodeZipEntryName(bytes, offset + 46, fileNameLength).replaceAll('\\', '/').toLowerCase();
    if (entryName.endsWith('/vbaproject.bin') || entryName === 'vbaproject.bin') artifacts.macroEntryCount += 1;
    if (entryName.includes('/externallinks/') || entryName.includes('externallink')) artifacts.externalLinkEntryCount += 1;
    if (entryName.includes('/activex/') || entryName.includes('activex')) artifacts.activeXEntryCount += 1;
    if (entryName.includes('/embeddings/') || entryName.includes('/oleobjects/')) artifacts.embeddedObjectEntryCount += 1;
    if (entryName.includes('/customxml/') || entryName.startsWith('customxml/')) artifacts.customXmlEntryCount += 1;
    if (entryName.endsWith('/calcchain.xml') || entryName === 'calcchain.xml') artifacts.calculationChainEntryCount += 1;
    compressedBytes += compressedSize;
    uncompressedBytes += uncompressedSize;
    if (uncompressedBytes > MAX_WORKBOOK_UNCOMPRESSED_BYTES) return { ok: false, error: `工作簿 ZIP 声明展开大小超过 ${MAX_WORKBOOK_UNCOMPRESSED_BYTES / 1024 / 1024} MiB 输入安全上限（实际 ${uncompressedBytes} 字节）` };
    offset += centralEntryBytes;
  }
  if (offset !== centralDirectoryOffset + centralDirectoryBytes) return { ok: false, error: '工作簿 ZIP 中央目录长度与条目数不一致' };
  const compressionRatio = compressedBytes > 0 ? uncompressedBytes / compressedBytes : (uncompressedBytes > 0 ? Infinity : 0);
  if (compressionRatio > MAX_WORKBOOK_COMPRESSION_RATIO) return { ok: false, error: `工作簿 ZIP 压缩比超过 ${MAX_WORKBOOK_COMPRESSION_RATIO}:1 输入安全上限（实际 ${compressionRatio.toFixed(1)}:1）` };
  return {
    ok: true,
    container: 'zip',
    entryCount,
    compressedBytes,
    uncompressedBytes,
    compressionRatio: Number.isFinite(compressionRatio) ? Number(compressionRatio.toFixed(3)) : null,
    artifacts: {
      ...artifacts,
      macroPresent: artifacts.macroEntryCount > 0,
      externalLinksPresent: artifacts.externalLinkEntryCount > 0,
      activeContentPresent: artifacts.activeXEntryCount > 0 || artifacts.embeddedObjectEntryCount > 0
    }
  };
}

const workbookInputSafety = (input) => {
  const byteLength = Number(input?.byteLength ?? input?.length);
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    return { ok: false, byteLength: null, error: '工作簿输入不是可读取的字节缓冲区' };
  }
  if (byteLength > MAX_WORKBOOK_BYTES) {
    return { ok: false, byteLength, error: `工作簿超过 ${MAX_WORKBOOK_BYTES / 1024 / 1024} MiB 输入安全上限（实际 ${byteLength} 字节）` };
  }
  const zipSafety = inspectWorkbookZip(input);
  if (!zipSafety.ok) return { ok: false, byteLength, ...zipSafety };
  if (zipSafety.artifacts?.macroPresent) return { ...zipSafety, ok: false, byteLength, error: '工作簿包含 VBA 宏，已在解析器前阻断；宏不属于本工具的可验证输入' };
  if (zipSafety.artifacts?.activeContentPresent) return { ...zipSafety, ok: false, byteLength, error: '工作簿包含 ActiveX/OLE 嵌入对象，已在解析器前阻断；活动内容不属于本工具的可验证输入' };
  if (zipSafety.artifacts?.externalLinksPresent) return { ...zipSafety, ok: false, byteLength, error: '工作簿包含外部链接，已在解析器前阻断；外部数据不进入本地分析' };
  return { ok: true, byteLength, ...zipSafety };
};

export function setSpreadsheetEngine(engine) {
  spreadsheetEngine = engine;
}

function xlsx() {
  const engine = spreadsheetEngine || globalThis.XLSX;
  if (!engine) throw new Error('xlsx_engine_unavailable');
  return engine;
}

const FORMULA_EXTERNAL_REFERENCE_PATTERN = /(?:\[[^\]]+\]|https?:\/\/|file:|\\\\)/i;
const FORMULA_EXTERNAL_FUNCTION_PATTERN = /\b(?:DDE|RTD|WEBSERVICE)\s*\(/i;
const FORMULA_VOLATILE_PATTERN = /\b(?:NOW|TODAY|RAND|RANDBETWEEN|OFFSET|INDIRECT|CELL|INFO|AREAS|FILTERXML)\s*\(/i;

/**
 * Read-only formula provenance for enterprise workbooks.
 * SheetJS exposes formula cells and their cached values; it does not execute
 * or recalculate formulas. The audit deliberately stores counts and risk
 * classes, never the raw formula text in public output.
 */
export function inspectWorkbookFormulaAudit(workbook, inputSafety = {}) {
  const sheets = workbook?.SheetNames || [];
  const bySheet = [];
  let formulaCellCount = 0;
  let formulaSheetCount = 0;
  let cachedFormulaCellCount = 0;
  let uncachedFormulaCellCount = 0;
  let externalReferenceCount = 0;
  let externalFunctionCount = 0;
  let volatileFormulaCount = 0;
  for (const sheetName of sheets) {
    const sheet = workbook.Sheets?.[sheetName] || {};
    let sheetFormulaCellCount = 0;
    let sheetCachedFormulaCellCount = 0;
    let sheetExternalReferenceCount = 0;
    let sheetExternalFunctionCount = 0;
    let sheetVolatileFormulaCount = 0;
    for (const [address, cell] of Object.entries(sheet)) {
      if (address.startsWith('!') || !cell || typeof cell !== 'object') continue;
      const formula = typeof cell.f === 'string' ? cell.f : typeof cell.F === 'string' ? cell.F : '';
      if (!formula) continue;
      sheetFormulaCellCount += 1;
      if (cell.v !== undefined && cell.v !== null && cell.v !== '') sheetCachedFormulaCellCount += 1;
      if (FORMULA_EXTERNAL_REFERENCE_PATTERN.test(formula)) sheetExternalReferenceCount += 1;
      if (FORMULA_EXTERNAL_FUNCTION_PATTERN.test(formula)) sheetExternalFunctionCount += 1;
      if (FORMULA_VOLATILE_PATTERN.test(formula)) sheetVolatileFormulaCount += 1;
    }
    if (sheetFormulaCellCount) {
      formulaSheetCount += 1;
      bySheet.push({ sheetName, formulaCellCount: sheetFormulaCellCount, cachedFormulaCellCount: sheetCachedFormulaCellCount, uncachedFormulaCellCount: sheetFormulaCellCount - sheetCachedFormulaCellCount, externalReferenceCount: sheetExternalReferenceCount, externalFunctionCount: sheetExternalFunctionCount, volatileFormulaCount: sheetVolatileFormulaCount });
    }
    formulaCellCount += sheetFormulaCellCount;
    cachedFormulaCellCount += sheetCachedFormulaCellCount;
    externalReferenceCount += sheetExternalReferenceCount;
    externalFunctionCount += sheetExternalFunctionCount;
    volatileFormulaCount += sheetVolatileFormulaCount;
  }
  uncachedFormulaCellCount = formulaCellCount - cachedFormulaCellCount;
  const artifacts = inputSafety.artifacts || {};
  const macroPresent = Boolean(artifacts.macroPresent);
  const activeContentPresent = Boolean(artifacts.activeContentPresent);
  const externalLinksPresent = Boolean(artifacts.externalLinksPresent);
  const status = macroPresent || activeContentPresent || externalLinksPresent
    ? 'blocked_active_content'
    : formulaCellCount || externalReferenceCount || externalFunctionCount
      ? 'review_required'
      : 'no_formulas';
  return {
    status,
    formulaCellCount,
    formulaSheetCount,
    cachedFormulaCellCount,
    uncachedFormulaCellCount,
    externalReferenceCount,
    externalFunctionCount,
    volatileFormulaCount,
    macroPresent,
    externalLinksPresent,
    activeContentPresent,
    calculationChainPresent: Number(artifacts.calculationChainEntryCount || 0) > 0,
    bySheet,
    boundary: '工作簿公式仅作来源审计；当前 SheetJS 兼容 bundle 读取缓存值，不执行或重算公式。公式缓存值、外部引用和活动内容必须由企业批准人员复核后，才可进入正式验收路径。'
  };
}

const text = (value) => String(value ?? '').trim();
const number = (value) => {
  const raw = text(value).replace(/,/g, '');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};
const normalized = (value) => text(value).toLowerCase().replace(/[\s_\-().（）[\]{}]/g, '');

function evaluateTrendValue(trend, xValue) {
  if (!trend || trend.status !== 'fitted' || !trend.coefficients || !Number.isFinite(xValue)) return null;
  const z = xValue - (trend.xOrigin || 0);
  return (trend.coefficients.quadratic || 0) * z ** 2 + (trend.coefficients.linear || 0) * z + (trend.coefficients.intercept || 0);
}
const truthy = (value) => ['是', '启用', 'true', '1', 'y', 'yes', '√', '✓'].includes(text(value).toLowerCase());

function sheetRows(workbook, name) {
  const sheet = workbook.Sheets[name];
  if (!sheet) return [];
  return xlsx().utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }).map((row) => {
    let end = row.length;
    while (end > 0 && !text(row[end - 1])) end -= 1;
    return row.slice(0, end);
  });
}

function findSheetName(names, candidates) {
  const exact = names.find((name) => candidates.includes(name));
  if (exact) return exact;
  return names.find((name) => candidates.some((candidate) => normalized(name).includes(normalized(candidate)))) || null;
}

function findHeaderRow(rows, requiredTokens) {
  return rows.findIndex((row) => {
    const values = row.map(normalized);
    return requiredTokens.every((token) => values.some((value) => value.includes(normalized(token))));
  });
}

function columnIndex(headers, candidates) {
  const values = headers.map(normalized);
  return candidates.reduce((found, candidate) => {
    if (found >= 0) return found;
    const needle = normalized(candidate);
    return values.findIndex((value) => value === needle || value.includes(needle));
  }, -1);
}

function objectRows(rows, headerIndex) {
  const headers = rows[headerIndex] || [];
  const columns = headers.map((header, index) => ({ header: text(header), index })).filter(({ header }) => header);
  return rows.slice(headerIndex + 1)
    .map((row) => Object.fromEntries(columns.map(({ header, index }) => [header, row[index] ?? ''])))
    .filter((row) => Object.values(row).some((value) => text(value)));
}

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const std = (values) => {
  if (values.length < 2) return values.length ? 0 : null;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
};

function sheetShape(rows) {
  return {
    rowCount: rows.length,
    nonEmptyRowCount: rows.filter((row) => row.some((value) => text(value))).length,
    columnCount: rows.reduce((maximum, row) => Math.max(maximum, row.length), 0)
  };
}

function cellHeaderRow(row) {
  const cells = row.map(text).filter(Boolean);
  if (cells.length < 10) return false;
  return cells.every((value, index) => Number.isInteger(Number(value)) && Number(value) === index + 1);
}

function valueOrText(value) {
  const numeric = number(value);
  return numeric === null ? (text(value) || null) : numeric;
}

function numericSummary(values, expectedCount = values.length) {
  const valid = values.filter((value) => value !== null);
  const minimum = valid.length ? Math.min(...valid) : null;
  const maximum = valid.length ? Math.max(...valid) : null;
  return {
    validCount: valid.length,
    missingCount: Math.max(0, expectedCount - valid.length),
    completenessPct: expectedCount ? valid.length / expectedCount * 100 : 0,
    mean: mean(valid),
    min: minimum,
    max: maximum,
    range: minimum !== null && maximum !== null ? maximum - minimum : null,
    std: std(valid)
  };
}

function parseStaticCellMatrix(rows, sheetName) {
  const headerIndex = rows.findIndex(cellHeaderRow);
  if (headerIndex < 0) return null;
  const header = rows[headerIndex].map(text);
  const columns = header.map((cellId, index) => ({ cellId, index })).filter(({ cellId }) => /^\d+$/.test(cellId));
  const dataRows = rows.slice(headerIndex + 1).filter((row) => columns.some(({ index }) => number(row[index]) !== null));
  const expectedCount = dataRows.length * columns.length;
  const perCell = columns.map(({ cellId, index }) => {
    const values = dataRows.map((row) => number(row[index]));
    return { cellId, ...numericSummary(values, dataRows.length) };
  });
  const allValues = dataRows.flatMap((row) => columns.map(({ index }) => number(row[index])));
  const statistics = numericSummary(allValues, expectedCount);
  return {
    sheetName,
    role: 'static_cell_voltage_matrix',
    status: 'parsed',
    headerRow: headerIndex,
    cellCount: columns.length,
    cellIds: columns.map(({ cellId }) => cellId),
    dataRowCount: dataRows.length,
    validPointCount: statistics.validCount,
    missingPointCount: statistics.missingCount,
    completenessPct: statistics.completenessPct,
    statistics,
    perCell,
    boundary: '静态单片电压矩阵已计算描述性统计；工作表标签和原始数值不自动转换为国家标准限值、验收规则或合格结论。'
  };
}

function parseNumericTable(rows, headerIndex, sheetName, role) {
  if (headerIndex < 0) return null;
  const headers = (rows[headerIndex] || []).map(text);
  const points = [];
  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    if (!row.some((value) => text(value))) break;
    if (number(row[0]) === null) continue;
    points.push({ sourceRow: rowIndex + 1, values: Object.fromEntries(headers.map((header, index) => [header || `列${index + 1}`, valueOrText(row[index])])) });
  }
  return { sheetName, role, headerRow: headerIndex, headers, points, pointCount: points.length };
}

function parseReportEvidence(rows, sheetName) {
  const performanceStart = rows.findIndex((row) => row.some((value) => text(value).includes('性能检测项目')));
  const reportHeaderIndex = rows.findIndex((row) => {
    const values = row.map(normalized);
    return values.some((value) => value.includes('检测项目名称')) && values.some((value) => value.includes('测试结果'));
  });
  const chartStart = rows.findIndex((row, index) => index > reportHeaderIndex && row.some((value) => /^图1[:：]?/.test(text(value))));
  const metadataEnd = performanceStart >= 0 ? performanceStart : (reportHeaderIndex >= 0 ? reportHeaderIndex : rows.length);
  const metadataFields = [];
  for (let rowIndex = 0; rowIndex < metadataEnd; rowIndex += 1) {
    const cells = (rows[rowIndex] || []).map((value, index) => ({ index, value: text(value) })).filter((cell) => cell.value);
    for (let index = 0; index + 1 < cells.length; index += 2) {
      if (cells[index].value.includes('项目')) continue;
      metadataFields.push({ field: cells[index].value, value: cells[index + 1].value, sourceRow: rowIndex + 1 });
    }
  }
  const performanceRecords = [];
  if (reportHeaderIndex >= 0) {
    const end = chartStart >= 0 ? chartStart : rows.length;
    for (let rowIndex = reportHeaderIndex + 1; rowIndex < end; rowIndex += 1) {
      const cells = (rows[rowIndex] || []).map((value) => text(value)).filter(Boolean);
      if (!cells.length || /^图表?/.test(cells[0])) continue;
      const outcome = [...cells].reverse().find((value) => /^(是|否|OK|NG|通过|不通过)$/i.test(value)) || null;
      performanceRecords.push({ sourceRow: rowIndex + 1, item: cells[0], reference: cells[1] || null, measured: cells[2] || null, outcome, values: cells });
    }
  }
  const polarizationHeaderIndex = rows.findIndex((row) => {
    const values = row.map(normalized);
    return values.some((value) => value.includes('电流密度')) && values.some((value) => value.includes('电堆电流')) && values.some((value) => value.includes('电堆功率'));
  });
  const stabilityHeaderIndex = rows.findIndex((row, index) => index > polarizationHeaderIndex && row.map(normalized).some((value) => value.includes('电流密度')) && row.map(normalized).some((value) => value.includes('电堆电流')));
  const cellSummaryHeaderIndex = rows.findIndex((row) => {
    const values = row.map(text);
    return values.includes('OCV') && values.some((value) => value.includes('怠速')) && values.some((value) => value.includes('额定'));
  });
  const cellSummary = cellSummaryHeaderIndex >= 0 ? {
    sheetName,
    headerRow: cellSummaryHeaderIndex,
    headers: (rows[cellSummaryHeaderIndex] || []).map(text).filter(Boolean),
    records: rows.slice(cellSummaryHeaderIndex + 1, cellSummaryHeaderIndex + 3).filter((row) => row.some((value) => text(value))).map((row, offset) => ({ sourceRow: cellSummaryHeaderIndex + offset + 2, values: row.map(valueOrText) }))
  } : null;
  const signoff = rows.flatMap((row, rowIndex) => {
    const cells = row.map((value) => text(value)).filter(Boolean);
    const result = [];
    for (let index = 0; index + 1 < cells.length; index += 1) if (cells[index].includes('测试工程师') || cells[index].includes('审核')) result.push({ field: cells[index], value: cells[index + 1], sourceRow: rowIndex + 1 });
    return result;
  });
  const notes = rows.slice(Math.max(cellSummaryHeaderIndex + 3, 0)).map((row, index) => ({ sourceRow: Math.max(cellSummaryHeaderIndex + 3, 0) + index + 1, text: row.map(text).filter(Boolean).join(' | ') })).filter((item) => item.text);
  const fields = [...new Set(metadataFields.map((field) => field.field))];
  return {
    sheetName,
    role: 'factory_report_evidence',
    status: 'parsed',
    metadataFields,
    metadataFieldNames: fields,
    performanceChecks: { headerRow: reportHeaderIndex, records: performanceRecords, recordCount: performanceRecords.length, passedCount: performanceRecords.filter((record) => /^(是|OK|通过)$/i.test(record.outcome || '')).length, failedCount: performanceRecords.filter((record) => /^(否|NG|不通过)$/i.test(record.outcome || '')).length },
    polarization: parseNumericTable(rows, polarizationHeaderIndex, sheetName, 'polarization_points'),
    stability: parseNumericTable(rows, stabilityHeaderIndex, sheetName, 'stability_points'),
    cellVoltageSummary: cellSummary,
    signoff,
    notes,
    fieldCount: fields.length,
    boundary: '出厂报告中的元数据、检测项目、极化/稳定性摘要、单片汇总和签核字段作为原始报告证据保存；“是否合格”只复述原报告，不升级为本系统标准符合性结论。'
  };
}

function parseDeviceIdentity(rows, sheetName) {
  const records = rows.map((row, rowIndex) => ({ sourceRow: rowIndex + 1, values: row.map(text).filter(Boolean) })).filter((record) => record.values.length);
  return {
    sheetName,
    role: 'device_identity_evidence',
    status: records.length ? 'parsed' : 'empty',
    records,
    fieldCount: records.reduce((sum, record) => sum + record.values.length, 0),
    boundary: 'BD 工作表只用于设备/样品身份追溯，不作为性能指标或验收限值。'
  };
}

function parseParameterCatalog(rows, sheetName) {
  const firstRow = rows[0] || [];
  const parameterRows = rows.slice(1).map((row, offset) => ({ sourceRow: offset + 2, parameter: text(row[0]), values: row.slice(1).map(valueOrText) })).filter((record) => record.parameter || record.values.some((value) => value !== null));
  const productColumnCount = Math.max(0, rows.reduce((maximum, row) => Math.max(maximum, row.length), 0) - 1);
  const productColumns = Array.from({ length: productColumnCount }, (_, index) => ({ columnIndex: index + 2, label: text(firstRow[index + 1]) || null, displayLabel: text(firstRow[index + 1]) || `未命名产品列${index + 1}` }));
  return {
    sheetName,
    role: 'parameter_catalog_evidence',
    status: parameterRows.length ? 'parsed' : 'empty',
    header: text(firstRow[0]),
    productColumns,
    productColumnCount,
    parameterRows,
    parameterRowCount: parameterRows.length,
    fieldNames: parameterRows.map((record) => record.parameter).filter(Boolean),
    boundary: '电堆参数库保留为型号/参数目录和交叉核对证据；未将未命名产品列、文本限值或目录值自动注入企业验收 profile。'
  };
}

function workbookSheetRole(name) {
  const value = normalized(name);
  if (value.includes('出厂功能检测报告') || value.includes('检测报告')) return 'factory_report_evidence';
  if (value === 'bd' || value.includes('bd测试')) return 'device_identity_evidence';
  if (value.includes('参数库')) return 'parameter_catalog_evidence';
  if (value === 'ocv' || /^0?3电密$/.test(value) || /^1?7电密$/.test(value) || /^2?5电密$/.test(value)) return 'static_cell_voltage_matrix';
  return null;
}

export function summarizeWorkbookEvidence(evidence = null) {
  const sheetAudit = Array.isArray(evidence?.sheetAudit) ? evidence.sheetAudit : [];
  const roleCounts = Object.fromEntries([...new Set(sheetAudit.map((sheet) => sheet.role || 'unclassified'))].sort().map((role) => [role, sheetAudit.filter((sheet) => (sheet.role || 'unclassified') === role).length]));
  const matrices = Array.isArray(evidence?.staticCellMatrices) ? evidence.staticCellMatrices : [];
  const report = evidence?.reportEvidence || null;
  const identity = evidence?.deviceIdentity || null;
  const catalog = evidence?.parameterCatalog || null;
  const formulaAudit = evidence?.formulaAudit || null;
  return {
    sheetCount: Array.isArray(evidence?.sheetNames) ? evidence.sheetNames.length : sheetAudit.length,
    parsedSheetCount: sheetAudit.filter((sheet) => sheet.status === 'parsed').length,
    roleCounts,
    selectedTimeSeriesSheet: evidence?.timeSeries?.sheetName || null,
    selectedTimeSeriesRowCount: evidence?.timeSeries?.rowCount ?? 0,
    staticMatrixCount: matrices.length,
    staticMatrixCellCount: matrices.reduce((sum, matrix) => sum + (matrix.cellCount || 0), 0),
    staticMatrixValidPointCount: matrices.reduce((sum, matrix) => sum + (matrix.validPointCount || 0), 0),
    staticMatrixMissingPointCount: matrices.reduce((sum, matrix) => sum + (matrix.missingPointCount || 0), 0),
    reportEvidenceSheetCount: report ? 1 : 0,
    reportMetadataFieldCount: report?.fieldCount || 0,
    reportPerformanceCheckCount: report?.performanceChecks?.recordCount || 0,
    reportPolarizationPointCount: report?.polarization?.pointCount || 0,
    reportStabilityPointCount: report?.stability?.pointCount || 0,
    deviceIdentityFieldCount: identity?.fieldCount || 0,
    parameterCatalogRowCount: catalog?.parameterRowCount || 0,
    parameterCatalogProductColumnCount: catalog?.productColumnCount || 0,
    formulaCellCount: formulaAudit?.formulaCellCount || 0,
    formulaSheetCount: formulaAudit?.formulaSheetCount || 0,
    cachedFormulaCellCount: formulaAudit?.cachedFormulaCellCount || 0,
    uncachedFormulaCellCount: formulaAudit?.uncachedFormulaCellCount || 0,
    formulaExternalReferenceCount: formulaAudit?.externalReferenceCount || 0,
    formulaExternalFunctionCount: formulaAudit?.externalFunctionCount || 0,
    formulaVolatileCount: formulaAudit?.volatileFormulaCount || 0,
    formulaReviewStatus: formulaAudit?.status || 'not_available',
    macroPresent: Boolean(formulaAudit?.macroPresent),
    externalLinksPresent: Boolean(formulaAudit?.externalLinksPresent),
    activeContentPresent: Boolean(formulaAudit?.activeContentPresent),
    boundary: '工作表角色、静态矩阵、报告/身份/参数目录均作为证据摘要使用；这些证据不等于标准全文、批准限值、仪器不确定度或正式放行。'
  };
}

const RULE_FIELD_BY_CODE = Object.freeze({
  CURRENT: 'current_a',
  H2_STOICH: 'h2_stoich',
  H2_FLOW: 'anode_flow_slpm',
  H2_IN_PRESS: 'anode_in_pressure_kpa',
  H2_IN_TEMP: 'anode_in_temp_c',
  H2_DEWPOINT: 'h2_dewpoint_c',
  AIR_STOICH: 'air_stoich',
  AIR_FLOW: 'cathode_flow_slpm',
  AIR_IN_PRESS: 'cathode_in_pressure_kpa',
  AIR_IN_TEMP: 'cathode_in_temp_c',
  AIR_DEWPOINT: 'air_dewpoint_c',
  COOLANT_IN_TEMP: 'coolant_in_temp_c',
  COOLANT_IN_PRESS: 'coolant_in_pressure_kpa',
  COOLANT_DT: 'coolant_temperature_difference_c'
});

const CONDITION_FIELD_BY_CODE = Object.freeze({
  CURRENT: 'targetCurrentA',
  H2_STOICH: 'h2Stoich',
  H2_FLOW: 'h2Flow',
  H2_IN_PRESS: 'h2InPressure',
  H2_IN_TEMP: 'h2InTemp',
  H2_DEWPOINT: 'h2Dewpoint',
  AIR_STOICH: 'airStoich',
  AIR_FLOW: 'airFlow',
  AIR_IN_PRESS: 'airInPressure',
  AIR_IN_TEMP: 'airInTemp',
  AIR_DEWPOINT: 'airDewpoint',
  COOLANT_IN_TEMP: 'coolantInTemp',
  COOLANT_DT: 'coolantDt',
  COOLANT_IN_PRESS: 'coolantInPressure'
});

function parseParameterSheet(rows, sheetName) {
  const headerIndex = findHeaderRow(rows, ['参数代码']);
  if (headerIndex < 0) return { errors: [`${sheetName} 缺少“参数代码”表头`], warnings: [], parameters: [], rules: [] };
  const headers = rows[headerIndex].map(text);
  const columns = {
    code: columnIndex(headers, ['参数代码', '代码']),
    name: columnIndex(headers, ['参数名称', '名称']),
    enabled: columnIndex(headers, ['启用']),
    source: columnIndex(headers, ['基准来源', '来源']),
    target: columnIndex(headers, ['目标值', '基准值', '默认值']),
    lower: columnIndex(headers, ['下偏差', '下限偏差']),
    upper: columnIndex(headers, ['上偏差', '上限偏差']),
    unit: columnIndex(headers, ['单位']),
    duration: columnIndex(headers, ['连续时间', '最短稳定时间']),
    required: columnIndex(headers, ['必需', '必填']),
    field: columnIndex(headers, ['标准字段', 'canonical', '字段'])
  };
  const errors = []; const warnings = []; const parameters = []; const rules = []; const seen = new Set();
  for (const row of rows.slice(headerIndex + 1)) {
    const code = text(row[columns.code]);
    if (!code) continue;
    if (seen.has(code)) { errors.push(`${sheetName} 参数代码重复：${code}`); continue; }
    seen.add(code);
    const item = {
      code,
      name: text(row[columns.name]),
      enabled: columns.enabled < 0 || truthy(row[columns.enabled]),
      source: text(row[columns.source]),
      rawValue: columns.target >= 0 ? text(row[columns.target]) : '',
      target: columns.target >= 0 && !text(row[columns.source]).includes('目标工况') ? number(row[columns.target]) : null,
      lowerTolerance: columns.lower >= 0 ? number(row[columns.lower]) : null,
      upperTolerance: columns.upper >= 0 ? number(row[columns.upper]) : null,
      unit: text(row[columns.unit]),
      minimumDurationS: columns.duration >= 0 ? number(row[columns.duration]) : null,
      required: columns.required >= 0 ? truthy(row[columns.required]) : false,
      field: text(row[columns.field]) || RULE_FIELD_BY_CODE[code] || null
    };
    if (item.minimumDurationS !== null && item.minimumDurationS <= 0) errors.push(`${code} 连续时间必须大于 0`);
    if (item.lowerTolerance !== null && item.upperTolerance !== null && item.lowerTolerance > item.upperTolerance) errors.push(`${code} 下偏差大于上偏差`);
    if (item.enabled && item.required && item.target === null && !item.source.includes('目标工况')) errors.push(`${code} 已启用且必需，但没有固定目标值或目标工况来源`);
    parameters.push(item);
    if (item.enabled && item.field) rules.push(item);
  }
  if (!parameters.length) errors.push(`${sheetName} 没有可读取的参数行`);
  return { errors, warnings, parameters, rules };
}

function parseTargetSheet(rows, sheetName) {
  const headerIndex = findHeaderRow(rows, ['目标电流']);
  if (headerIndex < 0) return { errors: [`${sheetName} 缺少“目标电流”表头`], warnings: [], targetConditions: [] };
  const headers = rows[headerIndex].map(text);
  const columns = {
    id: columnIndex(headers, ['工况编号', '工况']),
    current: columnIndex(headers, ['目标电流']),
    density: columnIndex(headers, ['目标电流密度']),
    h2Stoich: columnIndex(headers, ['氢气计量比']),
    h2Flow: columnIndex(headers, ['氢气流量']),
    h2Pressure: columnIndex(headers, ['氢气入口压力']),
    h2Temp: columnIndex(headers, ['氢气入口温度']),
    h2Dewpoint: columnIndex(headers, ['氢气入口露点']),
    airStoich: columnIndex(headers, ['空气计量比']),
    airFlow: columnIndex(headers, ['空气流量']),
    airPressure: columnIndex(headers, ['空气入口压力']),
    airTemp: columnIndex(headers, ['空气入口温度']),
    airDewpoint: columnIndex(headers, ['空气入口露点']),
    coolantInTemp: columnIndex(headers, ['冷却液入口温度', '循环水入口温度']),
    coolantDt: columnIndex(headers, ['冷却液温差', '进出口温差']),
    coolantPressure: columnIndex(headers, ['冷却液入口压力', '循环水入口压力'])
  };
  const errors = []; const warnings = []; const targetConditions = [];
  for (const row of rows.slice(headerIndex + 1)) {
    if (!row.some((value) => text(value))) continue;
    const targetCurrentA = number(row[columns.current]);
    if (targetCurrentA === null) { errors.push(`${sheetName} 存在无效目标电流`); continue; }
    const providedConditionId = columns.id >= 0 && Boolean(text(row[columns.id]));
    targetConditions.push({
      conditionId: text(row[columns.id]) || `I-${targetCurrentA}`,
      providedConditionId,
      targetCurrentA,
      targetCurrentDensity: columns.density >= 0 ? number(row[columns.density]) : null,
      h2Stoich: columns.h2Stoich >= 0 ? number(row[columns.h2Stoich]) : null,
      h2Flow: columns.h2Flow >= 0 ? number(row[columns.h2Flow]) : null,
      h2InPressure: columns.h2Pressure >= 0 ? number(row[columns.h2Pressure]) : null,
      h2InTemp: columns.h2Temp >= 0 ? number(row[columns.h2Temp]) : null,
      h2Dewpoint: columns.h2Dewpoint >= 0 ? number(row[columns.h2Dewpoint]) : null,
      airStoich: columns.airStoich >= 0 ? number(row[columns.airStoich]) : null,
      airFlow: columns.airFlow >= 0 ? number(row[columns.airFlow]) : null,
      airInPressure: columns.airPressure >= 0 ? number(row[columns.airPressure]) : null,
      airInTemp: columns.airTemp >= 0 ? number(row[columns.airTemp]) : null,
      airDewpoint: columns.airDewpoint >= 0 ? number(row[columns.airDewpoint]) : null,
      coolantInTemp: columns.coolantInTemp >= 0 ? number(row[columns.coolantInTemp]) : null,
      coolantDt: columns.coolantDt >= 0 ? number(row[columns.coolantDt]) : null,
      coolantInPressure: columns.coolantPressure >= 0 ? number(row[columns.coolantPressure]) : null
    });
  }
  if (!targetConditions.length) errors.push(`${sheetName} 没有有效目标工况`);
  if (columns.id < 0) errors.push(`${sheetName} 缺少“工况编号”表头，无法区分重复目标电流点`);
  if (new Set(targetConditions.map((item) => item.conditionId)).size !== targetConditions.length) errors.push(`${sheetName} 工况编号重复`);
  const byCurrent = new Map();
  for (const condition of targetConditions) {
    const list = byCurrent.get(condition.targetCurrentA) || []; list.push(condition); byCurrent.set(condition.targetCurrentA, list);
  }
  for (const [current, list] of byCurrent.entries()) if (list.length > 1 && list.some((condition) => !condition.providedConditionId)) errors.push(`${sheetName} 目标电流 ${current} A 重复但缺少工况编号`);
  return { errors, warnings, targetConditions };
}

export function parseParameterWorkbook(arrayBuffer) {
  try {
    const inputSafety = workbookInputSafety(arrayBuffer);
    if (!inputSafety.ok) return { ok: false, errors: [inputSafety.error], warnings: [], parameters: [], parameterRules: [], targetConditions: [], source: { type: 'xlsx', inputSafety } };
    const workbook = xlsx().read(arrayBuffer, { type: 'array', cellDates: true, raw: false });
    const formulaAudit = inspectWorkbookFormulaAudit(workbook, inputSafety);
    const names = workbook.SheetNames || [];
    const parameterSheet = findSheetName(names, ['数据处理设定参数', '数据处理参数', '参数']);
    const targetSheet = findSheetName(names, ['目标工况设定', '目标工况', '工况设定']);
    const errors = []; const warnings = [];
    if (!parameterSheet) errors.push('缺少“数据处理设定参数”工作表');
    // T02-03 explicitly permits a no-target mode: the parameter sheet can
    // still drive descriptive relative-stability screening, but it cannot
    // produce target conformity or formal polarization points.
    if (!targetSheet) warnings.push('缺少“目标工况设定”工作表；仅允许相对稳定性描述分析，不进行目标符合性判定');
    const parameterResult = parameterSheet ? parseParameterSheet(sheetRows(workbook, parameterSheet), parameterSheet) : { errors: [], warnings: [], parameters: [], rules: [] };
    const targetResult = targetSheet ? parseTargetSheet(sheetRows(workbook, targetSheet), targetSheet) : { errors: [], warnings: [], targetConditions: [] };
    errors.push(...parameterResult.errors, ...targetResult.errors);
    warnings.push(...parameterResult.warnings, ...targetResult.warnings);
    for (const rule of parameterResult.parameters.filter((item) => item.enabled && item.required && item.source.includes('目标工况') && targetSheet)) {
      const conditionField = CONDITION_FIELD_BY_CODE[rule.code];
      if (!conditionField) { errors.push(`${rule.code} 没有可关联的目标工况字段`); continue; }
      const missingConditions = targetResult.targetConditions.filter((condition) => condition[conditionField] === null || condition[conditionField] === undefined).map((condition) => condition.conditionId);
      if (missingConditions.length) errors.push(`${rule.code} 在目标工况中缺少目标值：${missingConditions.join('、')}`);
    }
    const parameterRules = parameterResult.rules.map((rule) => ({ ...rule, target: rule.target }));
    return {
      ok: errors.length === 0,
      errors,
      warnings,
      sheetNames: names,
      parameterSheet,
      targetSheet,
      parameters: parameterResult.parameters,
      parameterRules,
      targetConditions: targetResult.targetConditions,
      analysisMode: !targetSheet && parameterSheet ? 'relative_stability' : 'target_conformity',
      formulaAudit,
      source: { type: 'xlsx', parameterSheet, targetSheet, sheetNames: names, inputSafety, formulaAudit }
    };
  } catch (error) {
    return { ok: false, errors: [`无法读取参数工作簿：${error.message}`], warnings: [], parameters: [], parameterRules: [], targetConditions: [], source: { type: 'xlsx' } };
  }
}

function findDataHeaderRow(rows) {
  return rows.findIndex((row) => {
    const values = row.map(normalized);
    const hasTime = values.some((value) => value.includes('时间') || value.includes('timestamp'));
    const hasSignal = values.some((value) => value.includes('电流') || value.includes('current')) && values.some((value) => value.includes('电压') || value.includes('voltage'));
    return hasTime && hasSignal;
  });
}

export function parseDataWorkbook(arrayBuffer) {
  try {
    const inputSafety = workbookInputSafety(arrayBuffer);
    if (!inputSafety.ok) return { ok: false, errors: [inputSafety.error], sheetNames: [], rows: [], inputSafety };
    const workbook = xlsx().read(arrayBuffer, { type: 'array', cellDates: true, raw: false });
    const formulaAudit = inspectWorkbookFormulaAudit(workbook, inputSafety);
    const names = workbook.SheetNames || [];
    if (names.some((name) => normalized(name).includes('数据处理设定参数')) && names.some((name) => normalized(name).includes('目标工况'))) {
      return { ok: false, errors: ['当前文件是参数工作簿，请使用“参数/目标工况 Excel”入口'], sheetNames: names, rows: [] };
    }
    const rowsBySheet = new Map(names.map((name) => [name, sheetRows(workbook, name)]));
    const candidates = names.map((name) => {
      const rows = rowsBySheet.get(name) || []; const headerIndex = findDataHeaderRow(rows);
      return { name, rows, headerIndex, dataRows: headerIndex >= 0 ? objectRows(rows, headerIndex) : [] };
    }).filter((candidate) => candidate.headerIndex >= 0 && candidate.dataRows.length);
    if (!candidates.length) return { ok: false, errors: ['未找到同时包含时间、电流和电压字段的时序工作表'], sheetNames: names, rows: [] };
    candidates.sort((a, b) => b.dataRows.length - a.dataRows.length);
    const selected = candidates[0];
    const staticCellMatrices = names.map((name) => parseStaticCellMatrix(rowsBySheet.get(name) || [], name)).filter(Boolean);
    const reportSheetName = names.find((name) => workbookSheetRole(name) === 'factory_report_evidence') || null;
    const identitySheetName = names.find((name) => workbookSheetRole(name) === 'device_identity_evidence') || null;
    const parameterCatalogSheetName = names.find((name) => workbookSheetRole(name) === 'parameter_catalog_evidence') || null;
    const reportEvidence = reportSheetName ? parseReportEvidence(rowsBySheet.get(reportSheetName) || [], reportSheetName) : null;
    const deviceIdentity = identitySheetName ? parseDeviceIdentity(rowsBySheet.get(identitySheetName) || [], identitySheetName) : null;
    const parameterCatalog = parameterCatalogSheetName ? parseParameterCatalog(rowsBySheet.get(parameterCatalogSheetName) || [], parameterCatalogSheetName) : null;
    const sheetAudit = names.map((name) => {
      const rows = rowsBySheet.get(name) || [];
      const shape = sheetShape(rows);
      const selectedCandidate = selected.name === name;
      const staticMatrix = staticCellMatrices.find((matrix) => matrix.sheetName === name);
      const role = selectedCandidate ? 'time_series_analysis_input' : staticMatrix?.role || workbookSheetRole(name) || (candidates.some((candidate) => candidate.name === name) ? 'time_series_candidate' : 'unclassified');
      const parsed = selectedCandidate || Boolean(staticMatrix) || name === reportSheetName || name === identitySheetName || name === parameterCatalogSheetName;
      return { name, ...shape, role, status: parsed ? 'parsed' : 'not_used', selected: selectedCandidate, headerRow: selectedCandidate ? selected.headerIndex : staticMatrix?.headerRow ?? null, evidence: selectedCandidate ? `${selected.dataRows.length} 行时间/电流/电压记录进入电堆时序适配器` : staticMatrix ? `${staticMatrix.cellCount} 个单片通道、${staticMatrix.validPointCount} 个有效静态电压点进入描述性矩阵统计` : name === reportSheetName ? '出厂检测报告元数据、检测项目、极化/稳定性摘要和签核字段已结构化' : name === identitySheetName ? 'BD 设备/样品身份字段已结构化' : name === parameterCatalogSheetName ? '电堆参数库目录行和产品列已结构化' : '未识别为当前数据合同中的可用证据角色' };
    });
    const workbookEvidence = {
      parserVersion: 'xlsx-workbook-evidence-v1',
      sheetNames: names,
      sheetAudit,
      formulaAudit,
      timeSeries: { sheetName: selected.name, headerRow: selected.headerIndex, rowCount: selected.dataRows.length, columnCount: new Set(selected.dataRows.flatMap((row) => Object.keys(row))).size, boundary: '只选择字段命中时间/电流/电压合同且记录数最多的时序工作表进入主适配器；其余工作表由角色审计单独保留。' },
      staticCellMatrices,
      reportEvidence,
      deviceIdentity,
      parameterCatalog
    };
    workbookEvidence.summary = summarizeWorkbookEvidence({ ...workbookEvidence, sheetNames: names });
    return { ok: true, errors: [], warnings: [], sheetNames: names, sheetName: selected.name, headerRow: selected.headerIndex, rows: selected.dataRows, workbookEvidence, workbookEvidenceSummary: workbookEvidence.summary, formulaAudit, inputSafety };
  } catch (error) {
    return { ok: false, errors: [`无法读取原始数据工作簿：${error.message}`], sheetNames: [], rows: [] };
  }
}

function setColumns(sheet, rows) {
  const widths = [];
  for (const row of rows) row.forEach((value, index) => { widths[index] = Math.max(widths[index] || 10, Math.min(42, text(value).length + 2)); });
  sheet['!cols'] = widths.map((wch) => ({ wch }));
  return sheet;
}

function addSheet(workbook, name, rows) {
  const sheet = setColumns(xlsx().utils.aoa_to_sheet(rows), rows);
  xlsx().utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
  return sheet;
}

function qualityRows(result) {
  return Object.entries(result.quality.invalidValueCounts || {}).map(([field, invalidCount]) => [field, invalidCount, result.quality.rowCount - invalidCount, invalidCount ? '需复核' : '通过']);
}

export function buildEnterpriseWorkbook(result, fileName = 'test-run.csv', options = {}) {
  const book = xlsx().utils.book_new();
  const dataset = result.dataset || {};
  const workbookEvidence = dataset.workbookEvidence || null;
  const parameterConfig = options.parameterConfig || null;
  addSheet(book, '测试信息', [
    ['字段', '值', '来源/说明'],
    ['数据文件', fileName, '当前浏览器会话'],
    ['数据集', dataset.label || '通用测试数据', '自动识别结果'],
    ['记录数', result.quality.rowCount, '原始输入记录'],
    ['相对时长(s)', result.metrics.durationS, '由时间字段计算；时间质量见数据质量检查'],
    ['自动判定', result.verdict, '不是安全认证或企业放行结论'],
    ['交付级别', result.releaseGate?.status || 'ANALYSIS_DRAFT', result.releaseGate?.label || '分析草稿，不得作为放行报告'],
    ['放行门控', result.releaseGate?.blockedReasons?.join('、') || '无', '只有全部门控通过才可形成 HUMAN_REVIEW_PACKAGE'],
    ['生成时间', result.generatedAt, '系统时间'],
    ['边界', result.narrative, '需要企业批准规则和人工签核']
  ]);
  const uncertainty = result.uncertainty || {};
  const traceability = result.compliance?.traceability || {};
  const editLog = result.compliance?.editLog || {};
  addSheet(book, '测量不确定度', [
    ['指标', '结果值', '扩展不确定度', '单位', '状态', '样本数', '来源/传播路径'],
    ...(uncertainty.metricDetails || []).map((item) => [item.metric, item.value ?? '', item.expandedUncertainty ?? '', item.unit || '', item.status || '', item.sampleCount ?? '', item.source || '']),
    ['模型状态', '', '', '', uncertainty.status || 'not_configured', '', uncertainty.method ? `${uncertainty.method}; k=${uncertainty.coverageFactor}` : '未配置'],
    ['缺少输入不确定度', '', '', '', uncertainty.missingFields?.length ? '需补充' : '无', '', uncertainty.missingFields?.join('、') || ''],
    ['边界', '', '', '', '', '', uncertainty.boundary || '不确定度传播仅作工程辅助，不替代企业批准预算、校准和实验室能力证据'],
    ...(uncertainty.assumptions || []).map((item) => ['假设/限制', '', '', '', '', '', item])
  ]);
  const parameterRows = [['参数代码', '参数名称', '启用', '目标值', '下偏差', '上偏差', '单位', '连续时间(s)', '标准字段', '来源']];
  for (const item of parameterConfig?.parameters || []) parameterRows.push([item.code, item.name, item.enabled ? '是' : '否', item.target ?? '', item.lowerTolerance ?? '', item.upperTolerance ?? '', item.unit, item.minimumDurationS ?? '', item.field || '', item.source || '参数工作表']);
  if (parameterRows.length === 1) parameterRows.push(['—', '未导入参数工作簿', '', '', '', '', '', '', '', '']);
  addSheet(book, '本次使用参数', parameterRows);
  const targetRows = [['工况编号', '目标电流(A)', '目标电流密度(mA/cm²)', '氢气计量比', '氢气流量', '氢气入口压力', '氢气入口温度', '氢气入口露点', '空气计量比', '空气流量', '空气入口压力', '空气入口温度', '空气入口露点', '冷却液入口温度', '冷却液温差', '冷却液入口压力']];
  for (const item of parameterConfig?.targetConditions || []) targetRows.push([item.conditionId, item.targetCurrentA, item.targetCurrentDensity ?? '', item.h2Stoich ?? '', item.h2Flow ?? '', item.h2InPressure ?? '', item.h2InTemp ?? '', item.h2Dewpoint ?? '', item.airStoich ?? '', item.airFlow ?? '', item.airInPressure ?? '', item.airInTemp ?? '', item.airDewpoint ?? '', item.coolantInTemp ?? '', item.coolantDt ?? '', item.coolantInPressure ?? '']);
  if (targetRows.length === 1) targetRows.push(['—', '未导入目标工况工作表']);
  addSheet(book, '目标工况设定', targetRows);
  if (workbookEvidence) {
    addSheet(book, '工作表证据审计', [
      ['工作表', '角色', '状态', '主时序表', '源行数', '非空行数', '有效列数', '表头行', '证据摘要'],
      ...(workbookEvidence.sheetAudit || []).map((sheet) => [sheet.name, sheet.role, sheet.status, sheet.selected ? '是' : '否', sheet.rowCount, sheet.nonEmptyRowCount, sheet.columnCount, sheet.headerRow === null || sheet.headerRow === undefined ? '' : sheet.headerRow + 1, sheet.evidence])
    ]);
    if (workbookEvidence.formulaAudit) {
      const formula = workbookEvidence.formulaAudit;
      addSheet(book, '工作簿公式审计', [
        ['项目', '数值', '边界/说明'],
        ['审计状态', formula.status || 'not_available', formula.boundary || ''],
        ['公式单元格', formula.formulaCellCount ?? 0, '仅统计公式单元格，不保存原始公式文本'],
        ['公式工作表', formula.formulaSheetCount ?? 0, '含至少一个公式的工作表'],
        ['有缓存结果', formula.cachedFormulaCellCount ?? 0, '解析器读取的缓存结果数量'],
        ['无缓存结果', formula.uncachedFormulaCellCount ?? 0, '无缓存结果的公式不应进入正式计算'],
        ['外部引用公式', formula.externalReferenceCount ?? 0, '含工作簿外部引用/URL/文件引用特征'],
        ['外部函数公式', formula.externalFunctionCount ?? 0, '含 DDE/RTD/WEBSERVICE 特征'],
        ['易变函数公式', formula.volatileFormulaCount ?? 0, '含 NOW/RAND/OFFSET 等易变函数特征'],
        ['宏', formula.macroPresent ? '是' : '否', '宏输入在解析前阻断'],
        ['外部链接部件', formula.externalLinksPresent ? '是' : '否', '外部链接输入在解析前阻断'],
        ['活动内容', formula.activeContentPresent ? '是' : '否', 'ActiveX/OLE 输入在解析前阻断']
      ]);
    }
    if (workbookEvidence.staticCellMatrices?.length) {
      addSheet(book, '单片矩阵摘要', [
        ['工作表/工况', '单片数', '数据行', '有效点', '缺失点', '完整率(%)', '均值(V)', '最小(V)', '最大(V)', '极差(V)', '标准差(V)', '边界'],
        ...workbookEvidence.staticCellMatrices.map((matrix) => [matrix.sheetName, matrix.cellCount, matrix.dataRowCount, matrix.validPointCount, matrix.missingPointCount, matrix.completenessPct, matrix.statistics.mean, matrix.statistics.min, matrix.statistics.max, matrix.statistics.range, matrix.statistics.std, matrix.boundary])
      ]);
      addSheet(book, '单片逐片统计', [
        ['工作表/工况', '单片编号', '有效点', '缺失点', '完整率(%)', '均值(V)', '最小(V)', '最大(V)', '极差(V)', '标准差(V)'],
        ...workbookEvidence.staticCellMatrices.flatMap((matrix) => matrix.perCell.map((cell) => [matrix.sheetName, cell.cellId, cell.validCount, cell.missingCount, cell.completenessPct, cell.mean, cell.min, cell.max, cell.range, cell.std]))
      ]);
    }
    if (workbookEvidence.reportEvidence) {
      const report = workbookEvidence.reportEvidence;
      addSheet(book, '出厂报告元数据', [['字段', '原始值', '源行'], ...(report.metadataFields || []).map((item) => [item.field, item.value, item.sourceRow])]);
      addSheet(book, '出厂检测项目', [['源行', '检测项目', '原始标准/条件', '测试结果', '原报告结论', '原始单元格值'], ...(report.performanceChecks?.records || []).map((item) => [item.sourceRow, item.item, item.reference || '', item.measured || '', item.outcome || '', item.values.join(' | ')])]);
      const reportTableRows = (table) => table ? [['源行', ...table.headers], ...(table.points || []).map((point) => [point.sourceRow, ...table.headers.map((header) => point.values[header] ?? '')])] : [];
      if (report.polarization) addSheet(book, '报告极化点', reportTableRows(report.polarization));
      if (report.stability) addSheet(book, '报告稳定性点', reportTableRows(report.stability));
      if (report.cellVoltageSummary) addSheet(book, '报告单片汇总', [['源行', ...report.cellVoltageSummary.headers], ...(report.cellVoltageSummary.records || []).map((record) => [record.sourceRow, ...record.values])]);
      addSheet(book, '报告签核备注', [['类别', '字段/源行', '原始内容'], ...(report.signoff || []).map((item) => ['签核', `${item.field} / ${item.sourceRow}`, item.value]), ...(report.notes || []).map((item) => ['备注', String(item.sourceRow), item.text])]);
    }
    if (workbookEvidence.deviceIdentity) addSheet(book, 'BD身份证据', [['源行', '原始字段/值'], ...(workbookEvidence.deviceIdentity.records || []).map((record) => [record.sourceRow, record.values.join(' | ')])]);
    if (workbookEvidence.parameterCatalog) addSheet(book, '电堆参数目录', [['参数名称', ...workbookEvidence.parameterCatalog.productColumns.map((column) => column.displayLabel)], ...(workbookEvidence.parameterCatalog.parameterRows || []).map((record) => [record.parameter, ...record.values])]);
  }
  if (dataset.workbookStabilityCrossCheck) addSheet(book, 'XLSX稳定性核对', [
    ['状态', '报告源行', '报告电流(A)', '时序源行', '时序时间(s)', '时序电流(A)', '电流差(A)', '报告电压(V)', '时序电压(V)', '电压差(V)', '报告功率(kW)', '时序功率(kW)', '功率差(kW)', '匹配依据', '边界'],
    ...(dataset.workbookStabilityCrossCheck.matches || []).map((item) => [item.status, item.reportSourceRow ?? '', item.reportCurrentA ?? '', item.timeSeriesRow ?? '', item.timeSeriesTimeS ?? '', item.timeSeriesCurrentA ?? '', item.currentDeltaA ?? '', item.reportVoltageV ?? '', item.timeSeriesVoltageV ?? '', item.voltageDeltaV ?? '', item.reportPowerKw ?? '', item.timeSeriesPowerKw ?? '', item.powerDeltaKw ?? '', item.matchBasis || '', dataset.workbookStabilityCrossCheck.boundary || ''])
  ]);
  addSheet(book, '字段映射', [['标准字段', '原始字段', '单位/换算', '映射状态'], ...Object.entries(result.schema.mapping).map(([field, source]) => [field, source || '', result.schema.conversions[field]?.label || '原单位', source ? '已映射' : '缺失'])]);
  addSheet(book, '数据质量检查', [['检查项', '数值', '判定'], ['记录数', result.quality.rowCount, result.quality.hasEnoughRows ? '通过' : '错误'], ['完整率(%)', result.quality.completenessPct, result.quality.completenessPct >= 98 ? '通过' : '需复核'], ['重复时间戳', result.quality.duplicateTimestampCount, result.quality.duplicateTimestampCount ? '需复核' : '通过'], ['逆序跳变', result.quality.nonMonotonicCount, result.quality.nonMonotonicCount ? '需复核' : '通过'], ['独立会话数', result.quality.sessionCount ?? 1, '仅作边界证据'], ['会话边界数', result.quality.sessionBoundaryCount ?? 0, '不跨会话拼接'], ...(result.quality.sessionDurationsS || []).map((session) => [`会话：${session.sourceFile || session.sessionId}`, `${session.rowCount} 条 / ${session.durationS} s`, '会话内统计']), ...qualityRows(result).map(([field, invalid, valid, status]) => [`字段：${field}`, `${valid} 有效 / ${invalid} 无效`, status])]);
  const platforms = dataset.platforms || dataset.performancePoints || [];
  const performancePoints = dataset.performancePoints || [];
  addSheet(book, '电流平台', [['平台/工况', '目标电流(A)', '起始(s)', '结束(s)', '持续(s)', '样本数', '判定'], ...platforms.map((item, index) => [item.conditionId || `平台-${index + 1}`, item.targetCurrentA ?? '', item.startS ?? '', item.endS ?? '', item.effectiveDurationS ?? item.durationS ?? '', item.sampleCount ?? '', item.status || '待复核'])]);
  if (dataset.inferredSegments?.length) addSheet(book, '描述性候选区间', [
    ['区间ID', '来源会话', '起始(s)', '结束(s)', '持续(s)', '平均电流(A)', '实际最小(A)', '实际最大(A)', '平均单片电压(V)', '平均净功率(kW)', '分析性质', '稳定窗口/中心', '目标符合性'],
    ...dataset.inferredSegments.map((item) => [item.candidateId || item.segmentId || '', item.sourceFile || item.sessionId || '', item.startS ?? '', item.endS ?? '', item.durationS ?? item.effectiveDurationS ?? '', item.averageCurrentA ?? '', item.currentMinA ?? '', item.currentMaxA ?? '', item.averageCellVoltageV ?? '', item.averageNetPowerKw ?? '', 'inferred / descriptive_only', item.relativeStability ? `${item.relativeStability.windowS}s / ${item.relativeStability.center}` : '电流连续性', '未判定'])
  ]);
  if (dataset.relativeStability?.enabled && dataset.relativeStability?.rules?.length) addSheet(book, '相对稳定性设置', [
    ['字段/参数', '最大中心偏差', '最大范围', '单位', '窗口(s)', '中心方式', '来源', '边界'],
    ...dataset.relativeStability.rules.map((rule) => [rule.code || rule.field, rule.maxDeviation ?? '', rule.maxRange ?? '', rule.unit || '', dataset.relativeStability.windowS, dataset.relativeStability.center, dataset.relativeStability.source || '配置', dataset.relativeStability.boundary]),
    ['模式', '', '', '', dataset.relativeStability.windowS, dataset.relativeStability.center, dataset.relativeStability.source || '配置', dataset.relativeStability.boundary]
  ]);
  addSheet(book, '稳定区间', [['平台/工况', '区间ID', '起始(s)', '结束(s)', '有效持续(s)', '统计截取(s)', '有效样本数', '参数完整', '选定状态', '自动候选', '选择说明', '说明'], ...(dataset.stableSegments || []).map((item) => [item.platformId || item.conditionId || '', item.segmentId || '', item.startS ?? '', item.endS ?? '', item.effectiveDurationS ?? item.durationS ?? '', item.selectedDurationS ?? '', item.selectedSampleCount ?? item.sampleCount ?? '', item.parameterComplete ? '是' : '否', item.selected ? (item.selectedBy === 'manual' ? '人工改选' : '自动选定') : '候选', item.automaticSelected ? '是' : '否', item.selectionReason || '', item.status || '待复核'])]);
  addSheet(book, '极化曲线数据', [['工况', '平均电流(A)', '平均电流密度(mA/cm²)', '平均单片电压(V)', '平均净功率(kW)', '有效性'], ...performancePoints.map((item) => [item.platformId || item.conditionId || '', item.averageCurrentA ?? '', item.averageCurrentDensity ?? '', item.averageCellVoltageV ?? '', item.averageNetPowerKw ?? '', item.status || '待复核'])]);
  const metricRows = Object.entries(dataset.metrics || result.metrics).flatMap(([field, value]) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.entries(value).map(([stat, statValue]) => [`${field}.${stat}`, statValue ?? '', '', '结构化计算结果'])
    : [[field, value ?? '', '', '结构化计算结果']]);
  addSheet(book, '实际工况汇总', [['指标', '值', '单位', '证据'], ...metricRows]);
  if (dataset.kind === 'stack') addSheet(book, '工程量摘要', [
    ['工程量', '均值', '单位', '有效记录', '来源/公式', '边界'],
    ['阳极流阻', dataset.metrics?.anodeFlowResistanceKpa?.mean ?? '', 'kPa', dataset.metrics?.anodeFlowResistanceKpa?.count ?? 0, dataset.sourceFieldMap?.anode_flow_resistance_kpa || '', '统计/核对，不是标准结论'],
    ['阴极流阻', dataset.metrics?.cathodeFlowResistanceKpa?.mean ?? '', 'kPa', dataset.metrics?.cathodeFlowResistanceKpa?.count ?? 0, dataset.sourceFieldMap?.cathode_flow_resistance_kpa || '', '统计/核对，不是标准结论'],
    ['冷却液流阻', dataset.metrics?.coolantFlowResistanceKpa?.mean ?? '', 'kPa', dataset.metrics?.coolantFlowResistanceKpa?.count ?? 0, dataset.sourceFieldMap?.coolant_flow_resistance_kpa || '', '统计/核对，不是标准结论'],
    ['冷却液温差', dataset.metrics?.coolantTemperatureDifferenceC?.mean ?? '', '°C', dataset.metrics?.coolantTemperatureDifferenceC?.count ?? 0, dataset.sourceFieldMap?.coolant_temperature_difference_c || '', '统计/核对，不是标准结论'],
    ['循环水电导率', dataset.metrics?.coolantConductivityUsCm?.mean ?? '', 'μS/cm', dataset.metrics?.coolantConductivityUsCm?.count ?? 0, dataset.sourceFieldMap?.coolant_conductivity_us_cm || '', '无企业限值时不判定'],
    ['氢气入口露点', dataset.metrics?.h2DewpointC?.mean ?? '', '°C', dataset.metrics?.h2DewpointC?.count ?? 0, dataset.sourceFieldMap?.h2_dewpoint_c || '未提供直接露点字段', '增湿罐水温不能替代露点'],
    ['空气入口露点', dataset.metrics?.airDewpointC?.mean ?? '', '°C', dataset.metrics?.airDewpointC?.count ?? 0, dataset.sourceFieldMap?.air_dewpoint_c || '未提供直接露点字段', '增湿罐水温不能替代露点'],
    ['阳极增湿罐水温', dataset.metrics?.h2HumidifierWaterTemperatureC?.mean ?? '', '°C', dataset.metrics?.h2HumidifierWaterTemperatureC?.count ?? 0, dataset.sourceFieldMap?.h2_humidifier_water_temp_c || '', '独立于入口露点'],
    ['阴极增湿罐水温', dataset.metrics?.airHumidifierWaterTemperatureC?.mean ?? '', '°C', dataset.metrics?.airHumidifierWaterTemperatureC?.count ?? 0, dataset.sourceFieldMap?.air_humidifier_water_temp_c || '', '独立于入口露点'],
    ['内阻', dataset.metrics?.internalResistance?.mean ?? '', '原始单位', dataset.metrics?.internalResistance?.count ?? 0, dataset.sourceFieldMap?.internal_resistance || '未提供内阻字段', '未提供时不填默认值']
  ]);
  const comparisonRows = [['工况/平台', '目标值', '实际均值', '绝对偏差', '允许偏差参考', '符合性', '参数代码', '参数名称', '下偏差', '上偏差', '实际最小值', '实际最大值', '实际标准差', '相对偏差(%)', '超限时长(s)', '超限比例(%)', '有效样本', '超限样本', '规则状态']];
  for (const [index, item] of performancePoints.entries()) {
    const comparisons = Array.isArray(item.parameterComparisons) && item.parameterComparisons.length
      ? item.parameterComparisons
      : [{ code: 'CURRENT', name: '实测电流', target: item.targetCurrentA ?? null, actualMean: item.averageCurrentA ?? null, lowerTolerance: -(item.toleranceA ?? 0), upperTolerance: item.toleranceA ?? 0, actualMin: null, actualMax: null, actualStd: null, relativeDeviationPct: null, exceedDurationS: null, exceedRatioPct: null, validSampleCount: null, exceedSampleCount: null, status: 'undetermined' }];
    for (const comparison of comparisons) comparisonRows.push([item.platformId || item.conditionId || `平台-${index + 1}`, comparison.target ?? '', comparison.actualMean ?? '', '', Math.max(Math.abs(comparison.lowerTolerance ?? 0), Math.abs(comparison.upperTolerance ?? 0)), '', comparison.code, comparison.name, comparison.lowerTolerance ?? '', comparison.upperTolerance ?? '', comparison.actualMin ?? '', comparison.actualMax ?? '', comparison.actualStd ?? '', comparison.relativeDeviationPct ?? '', comparison.exceedDurationS ?? '', comparison.exceedRatioPct ?? '', comparison.validSampleCount ?? '', comparison.exceedSampleCount ?? '', comparison.status || 'undetermined']);
  }
  const comparisonSheet = addSheet(book, '目标工况对比', comparisonRows);
  for (let row = 2; row <= comparisonRows.length; row += 1) {
    const difference = comparisonSheet[`D${row}`];
    if (difference) { difference.f = `C${row}-B${row}`; difference.t = 'n'; difference.v = number(comparisonRows[row - 1][2]) !== null && number(comparisonRows[row - 1][1]) !== null ? number(comparisonRows[row - 1][2]) - number(comparisonRows[row - 1][1]) : undefined; }
    const verdict = comparisonSheet[`F${row}`];
    if (verdict) { verdict.f = `IF(AND(C${row}>=B${row}+I${row},C${row}<=B${row}+J${row}),"正常","需复核")`; verdict.t = 's'; verdict.v = comparisonRows[row - 1][18] === 'normal' ? '正常' : '需复核'; }
  }
  const cellStats = dataset.cellChannelCount ? [['指标', '值', '单位'], ['导出单片通道', dataset.cellChannelCount, '个'], ['片数参数', dataset.configuredCellCount || '', '个'], ['平均单片电压', dataset.metrics?.averageCellVoltageV ?? '', 'V'], ['最大单片电压极差', dataset.metrics?.cellSpreadMaxV ?? '', 'V'], ['单片电压标准差', dataset.metrics?.cellValueStdV ?? '', 'V']] : [['指标', '值', '单位'], ['当前数据集', '无单片通道摘要', '']];
  addSheet(book, '单片电压统计', cellStats);
  addSheet(book, '异常清单', [['级别', '代码', '标题', '证据', '建议动作'], ...result.issues.map((item) => [item.severity, item.code, item.title, item.evidence, item.recommendation])]);
  if (dataset.kind === 'durability') addSheet(book, '耐久功率点', [['目标功率(kW)', '净输出功率(kW)', '平均单体电压(mV)', '离均差(mV)', '电压方差', '来源文件'], ...(dataset.points || []).map((item) => [item.targetPowerKw ?? '', item.netPowerKw ?? '', item.averageCellVoltageMv ?? '', item.averageDeviationMv ?? '', item.voltageVariance ?? '', item.sourceFile || 'DOCX报告'])]);
  if (dataset.kind === 'vehicle') addSheet(book, '车辆信号目录', [
    ['原始信号', '类型', '使用层级', '数值记录', '总记录', '完整率(%)', '最小值', '最大值', '平均值', '标准差', '左轴展示', '右轴展示', '常见离散值'],
    ...(dataset.signalCatalog || []).map((item) => [item.source, item.kind || '', item.usage || '', item.numericCount, item.rowCount, item.completenessPct, item.min ?? '', item.max ?? '', item.mean ?? '', item.std ?? '', item.source === dataset.selectedSignal ? '是' : '否', item.source === dataset.secondarySignal ? '是' : '否', (item.uniqueValues || []).map((entry) => `${entry.value}:${entry.count}`).join('；')])
  ]);
  if (dataset.kind === 'stack') addSheet(book, '电堆字段覆盖', [
    ['原始信号', '类型', '使用层级', '数值记录', '总记录', '完整率(%)', '最小值', '最大值', '平均值', '标准差', '常见离散值'],
    ...(dataset.signalCatalog || []).map((item) => [item.source, item.kind || '', item.usage || '', item.numericCount, item.rowCount, item.completenessPct, item.min ?? '', item.max ?? '', item.mean ?? '', item.std ?? '', (item.uniqueValues || []).map((entry) => `${entry.value}:${entry.count}`).join('；')])
  ]);
  if (dataset.kind === 'vehicle' && (dataset.crossChecks || []).length) addSheet(book, '车辆交叉核对', [['检查', '设定字段', '实测字段', '设定完整率(%)', '实测完整率(%)', '平均偏差', '单位'], ...(dataset.crossChecks || []).map((item) => [item.code, item.targetSource, item.actualSource, item.target.completenessPct, item.actual.completenessPct, item.deviation.mean ?? '', item.unit])]);
  if (dataset.kind === 'stack' && (dataset.settingCrossChecks || []).length) addSheet(book, '设定实测核对', [['检查', '设定字段', '实测字段', '设定完整率(%)', '实测完整率(%)', '平均偏差', '单位'], ...(dataset.settingCrossChecks || []).map((item) => [item.code, item.targetSource, item.actualSource, item.target.completenessPct, item.actual.completenessPct, item.deviation.mean ?? '', item.unit])]);
  const chartRows = dataset.kind === 'durability'
    ? (dataset.points || []).map((item) => [item.targetPowerKw ?? '', item.averageCellVoltageMv ?? '', item.averageDeviationMv ?? '', item.voltageVariance ?? ''])
    : performancePoints.map((item) => {
      const trend = dataset.performanceTrend?.averageCellVoltageV;
      return [item.platformId || item.conditionId || '', item.targetCurrentA ?? '', item.trendX ?? '', item.trendLabel || '', item.averageCellVoltageV ?? '', evaluateTrendValue(trend, item.trendX), item.averageNetPowerKw ?? '', item.status || '待复核'];
    });
  addSheet(book, '图表数据', [['说明', '本工作簿保留可复核图表数据；实际图形可由企业模板引用本表'], ...chartRows]);
  if (dataset.kind === 'vehicle') addSheet(book, '车辆性能趋势', [
    ['平台/区间', '横轴类型', '横轴值', '横轴显示', '模型', '平均单体电压(V)', '拟合电压(V)', '平均净功率(kW)', '状态', '拟合状态', 'R²', '边界'],
    ...performancePoints.map((item) => {
      const trend = dataset.performanceTrend?.averageCellVoltageV;
      return [item.platformId || item.conditionId || item.targetCurrentA || '', dataset.trendXAxisLabel || dataset.trendXAxis || '', item.trendX ?? '', item.trendLabel || '', dataset.trendModel === 'quadratic' ? '二次多项式' : '线性', item.averageCellVoltageV ?? '', evaluateTrendValue(trend, item.trendX), item.averageNetPowerKw ?? '', item.status || '待复核', trend?.status || '未拟合', trend?.rSquared ?? '', '趋势仅作描述性工程证据；不替代企业验收或耐久等效性结论'];
    })
  ]);
  const manifest = Array.isArray(options.manifest) ? options.manifest : [];
  const diff = options.incrementalDiff || { added: [], changed: [], unchanged: [], removed: [] };
  const trendRows = Object.entries(dataset.performanceTrend || {}).map(([field, trend]) => [`性能趋势：${field}`, trend.status === 'fitted' ? '已拟合' : '点数不足/不可拟合', `横轴 ${trend.xLabel || trend.x}；模型 ${trend.model}；点数 ${trend.pointCount}；R² ${trend.rSquared ?? '—'}；斜率/日 ${trend.slopePerDay ?? '—'}`]);
  const durabilitySummaryRows = dataset.kind === 'durability' && dataset.crossReportSummary?.status === 'descriptive_only'
    ? [['耐久跨报告摘要', '描述性汇总', dataset.crossReportSummary.boundary], ['耐久跨报告数', dataset.crossReportSummary.reportCount, `排序依据：${dataset.crossReportSummary.orderingBasis || '未声明'}`], ['耐久跨报告可比性筛查', dataset.crossReportSummary.comparabilityAudit?.auditStatus || '未执行', `可比：${dataset.crossReportSummary.comparabilityAudit?.comparable ? '是' : '否'}；问题 ${dataset.crossReportSummary.comparabilityAudit?.issueCodes?.join('、') || '无'}；间隔 ${dataset.crossReportSummary.comparabilityAudit?.gapCount ?? '—'}；重叠 ${dataset.crossReportSummary.comparabilityAudit?.overlapCount ?? '—'}`], ...Object.entries(dataset.crossReportSummary.resultCounts || {}).map(([result, count]) => [`耐久原始结果：${result}`, count, '原始报告结果分布']), ...(dataset.crossReportSummary.byTargetPower || []).map((item) => [`跨报告目标功率：${item.targetPowerKw} kW`, `${item.firstAverageCellVoltageMv ?? '—'}→${item.lastAverageCellVoltageMv ?? '—'} mV；Δ ${item.averageCellVoltageDeltaMv ?? '—'} mV`, `报告 ${item.reportCount} 份；离均差首末 ${item.firstAverageDeviationMv ?? '—'}→${item.lastAverageDeviationMv ?? '—'} mV；最大 ${item.maximumAverageDeviationMv ?? '—'} mV`])]
    : [];
  const selectionRows = dataset.kind === 'stack' ? (dataset.selectionAudit || []).map((item) => [`稳定区间选择：${item.platformId}`, item.selectionMode === 'manual' ? '人工改选' : item.selectionMode === 'automatic' ? '自动选定' : '未选定', `自动候选 ${item.automaticSegmentId || '—'}；请求 ${item.requestedSegmentId || '—'}；当前 ${item.selectedSegmentId || '—'}${item.selectionError ? `；${item.selectionError}` : ''}`]) : [];
  const datasetLogRows = dataset.kind === 'vehicle'
    ? [['车辆趋势横轴', '已记录', `${dataset.trendXAxisLabel || dataset.trendXAxis || '—'}；请求 ${dataset.trendXAxisRequested || '—'}`], ['车辆趋势模型', '已记录', `${dataset.trendModel === 'quadratic' ? '二次多项式' : '线性'}；二次模型至少需要 3 个有效点`], ['车辆会话边界', '已记录', `${dataset.sessionCount || 1} 个会话；会话内不跨文件拼接`]]
    : dataset.kind === 'stack'
      ? [['电堆会话边界', '已记录', `${dataset.sessionCount || 1} 个会话；平台与稳定区间不跨文件拼接`], ['电堆稳定区间选择', '已记录', `策略 ${dataset.selectionPolicy || '未声明'}；人工改选 ${selectionRows.filter((row) => row[1] === '人工改选').length} 个平台`], ['电堆功率来源', '已记录', `${dataset.metrics?.powerSource || '—'}；${dataset.metrics?.powerCrossCheck?.evidence || '—'}`], ...(dataset.workbookStabilityCrossCheck ? [['XLSX稳定性核对', dataset.workbookStabilityCrossCheck.status, `${dataset.workbookStabilityCrossCheck.matchedCount || 0}/${dataset.workbookStabilityCrossCheck.reportPointCount || 0} 个报告点；${dataset.workbookStabilityCrossCheck.boundary}`]] : [])]
      : [];
  const governanceLogRows = [
    ['测试对象追溯', traceability.ready ? '已记录' : traceability.required ? '待补齐' : '未配置', traceability.evidence || 'profile 未声明对象追溯字段要求'],
    ['人工修改审计', editLog.ready ? '已记录' : editLog.required ? '待补齐' : '未配置', editLog.evidence || 'profile 未声明人工修改审计记录要求']
  ];
  addSheet(book, '处理日志', [['步骤', '状态', '证据/来源'], ...(result.workflow?.steps || []).map((step) => [step.label, step.status, step.evidence]), ...governanceLogRows, ['测量不确定度', uncertainty.status || 'not_configured', uncertainty.boundary || '未配置企业批准模型'], ...trendRows, ...durabilitySummaryRows, ...(dataset.kind === 'vehicle' ? [['车辆左轴信号', '已记录', `${dataset.selectedSignal || '—'}；车辆双轴图左轴`], ['车辆右轴信号', dataset.secondarySignal ? '已记录' : '未选择', `${dataset.secondarySignal || '不显示'}；车辆双轴图右轴`]] : []), ...datasetLogRows, ...(dataset.inferredSegments?.length ? [['描述性候选区间', '已记录', `${dataset.inferredSegments.length} 个；只作 inferred/descriptive_only，不进入目标符合性或正式极化点`]] : []), ...selectionRows, ['参数工作簿', parameterConfig?.ok ? '已校验' : '未提供/未通过', parameterConfig ? `${parameterConfig.parameterSheet || ''}；${parameterConfig.targetSheet || ''}` : '需要导入企业参数工作簿'], ['批次文件 manifest', manifest.length ? '已记录' : '未提供', `文件 ${manifest.length}；新增 ${diff.added.length}；变更 ${diff.changed.length}；未变 ${diff.unchanged.length}；移除 ${diff.removed.length}`], ...manifest.map((entry) => [`文件：${entry.name}`, '批次证据', `记录 ${entry.rowCount ?? '—'}；大小 ${entry.size ?? '—'}；SHA-256 ${entry.hash || '—'}`]), ['报告边界', '必须保留', '不替代企业标准负责人、测试人员或实验室签核']]);
  book.Props = { Title: 'H₂ TestLens 企业设备测试分析报告', Subject: dataset.label || '氢能设备测试数据', Author: 'H₂ TestLens' };
  return book;
}

export function workbookArrayBuffer(workbook) {
  return xlsx().write(workbook, { bookType: 'xlsx', type: 'array', compression: true });
}
