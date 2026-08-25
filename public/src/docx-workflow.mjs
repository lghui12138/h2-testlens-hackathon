let docxEngine = globalThis.mammoth || null;

export function setDocxEngine(engine) {
  docxEngine = engine;
}

const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const number = (value) => {
  const raw = text(value).replace(/,/g, '');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};
const decode = (value) => text(value).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
const stripHtml = (value) => decode(String(value ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '));
const normalized = (value) => text(value).toLowerCase().replace(/[\s_\-().（）[\]{}]/g, '');

function htmlTables(html) {
  return [...String(html).matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((tableMatch) => {
    const table = tableMatch[0];
    return [...table.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((rowMatch) => [...rowMatch[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => stripHtml(cell[1])));
  });
}

const fieldIndex = (headers, aliases) => {
  const values = headers.map(normalized);
  return aliases.reduce((found, alias) => {
    if (found >= 0) return found;
    const needle = normalized(alias);
    return values.findIndex((value) => value === needle || value.includes(needle));
  }, -1);
};

function parseMetadata(rows) {
  const metadata = {};
  for (const row of rows.slice(0, 4)) for (let index = 0; index + 1 < row.length; index += 2) if (row[index]) metadata[text(row[index])] = text(row[index + 1]);
  return metadata;
}

export async function parseDurabilityDocx(input) {
  const engine = docxEngine || globalThis.mammoth;
  if (!engine?.convertToHtml) throw new Error('docx_engine_unavailable');
  let converted;
  const ab = input instanceof ArrayBuffer
    ? input
    : (ArrayBuffer.isView(input)
      ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
      : null);
  try {
    converted = await engine.convertToHtml({ arrayBuffer: ab || input });
  } catch (error) {
    throw new Error(`docx_parse_failed: ${error.message}`);
  }
  const tables = htmlTables(converted.value);
  const rows = tables.flat();
  const headerIndex = rows.findIndex((row) => row.some((cell) => normalized(cell).includes('目标功率')) && row.some((cell) => normalized(cell).includes('平均单体电压')));
  if (headerIndex < 0) {
    if (rows.length > 0) {
      return {
        metadata: parseMetadata(rows),
        headers: rows[0] || [],
        points: [],
        datasetType: 'reference_document'
      };
    }
    throw new Error('未找到耐久功率点表头');
  }
  const headers = rows[headerIndex];
  const columns = {
    targetPowerKw: fieldIndex(headers, ['目标功率']),
    humidityPct: fieldIndex(headers, ['湿度']),
    temperatureC: fieldIndex(headers, ['温度']),
    netPowerKw: fieldIndex(headers, ['净输出功率']),
    stackCurrentA: fieldIndex(headers, ['电堆电流']),
    averageCellVoltageMv: fieldIndex(headers, ['平均单体电压']),
    averageDeviationMv: fieldIndex(headers, ['离均差']),
    compressorPowerKw: fieldIndex(headers, ['空压机功耗']),
    pumpPowerKw: fieldIndex(headers, ['水泵功耗']),
    coolantInTempC: fieldIndex(headers, ['冷却水入口温度']),
    coolantOutTempC: fieldIndex(headers, ['冷却水出口温度']),
    hfr: fieldIndex(headers, ['HFR']),
    lfr: fieldIndex(headers, ['LFR']),
    voltageVariance: fieldIndex(headers, ['电压方差'])
  };
  const points = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const targetPowerKw = number(row[columns.targetPowerKw]);
    if (targetPowerKw === null) continue;
    points.push({
      target_power_kw: targetPowerKw,
      humidity_pct: number(row[columns.humidityPct]),
      temperature_c: number(row[columns.temperatureC]),
      net_power_kw: number(row[columns.netPowerKw]),
      stack_current_a: number(row[columns.stackCurrentA]),
      average_cell_voltage_mv: number(row[columns.averageCellVoltageMv]),
      average_deviation_mv: number(row[columns.averageDeviationMv]),
      compressor_power_kw: number(row[columns.compressorPowerKw]),
      pump_power_kw: number(row[columns.pumpPowerKw]),
      coolant_in_temp_c: number(row[columns.coolantInTempC]),
      coolant_out_temp_c: number(row[columns.coolantOutTempC]),
      hfr: number(row[columns.hfr]),
      lfr: number(row[columns.lfr]),
      voltage_variance: number(row[columns.voltageVariance])
    });
  }
  if (!points.length) throw new Error('耐久功率点表没有有效数据');
  return { metadata: parseMetadata(rows), headers, points, warnings: converted.messages || [], source: { type: 'docx', tableCount: tables.length } };
}
