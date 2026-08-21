let spreadsheetEngine = globalThis.XLSX || null;

export function setSpreadsheetEngine(engine) {
  spreadsheetEngine = engine;
}

function xlsx() {
  const engine = spreadsheetEngine || globalThis.XLSX;
  if (!engine) throw new Error('xlsx_engine_unavailable');
  return engine;
}

const text = (value) => String(value ?? '').trim();
const number = (value) => {
  const raw = text(value).replace(/,/g, '');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};
const normalized = (value) => text(value).toLowerCase().replace(/[\s_\-().（）[\]{}]/g, '');
const truthy = (value) => ['是', '启用', 'true', '1', 'y', 'yes', '√', '✓'].includes(text(value).toLowerCase());

function sheetRows(workbook, name) {
  const sheet = workbook.Sheets[name];
  return sheet ? xlsx().utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) : [];
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
  return rows.slice(headerIndex + 1).map((row) => Object.fromEntries(headers.map((header, index) => [text(header), row[index] ?? '']))).filter((row) => Object.values(row).some((value) => text(value)));
}

const RULE_FIELD_BY_CODE = Object.freeze({
  CURRENT: 'current_a',
  H2_FLOW: 'flow_slpm',
  H2_IN_PRESS: 'pressure_kpa',
  H2_IN_TEMP: 'temperature_c',
  AIR_FLOW: 'flow_slpm',
  AIR_IN_PRESS: 'pressure_kpa',
  AIR_IN_TEMP: 'temperature_c',
  COOLANT_IN_TEMP: 'temperature_c',
  COOLANT_IN_PRESS: 'pressure_kpa',
  COOLANT_DT: 'coolant_dt'
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
    const workbook = xlsx().read(arrayBuffer, { type: 'array', cellDates: true, raw: false });
    const names = workbook.SheetNames || [];
    const parameterSheet = findSheetName(names, ['数据处理设定参数', '数据处理参数', '参数']);
    const targetSheet = findSheetName(names, ['目标工况设定', '目标工况', '工况设定']);
    const errors = []; const warnings = [];
    if (!parameterSheet) errors.push('缺少“数据处理设定参数”工作表');
    if (!targetSheet) errors.push('缺少“目标工况设定”工作表');
    const parameterResult = parameterSheet ? parseParameterSheet(sheetRows(workbook, parameterSheet), parameterSheet) : { errors: [], warnings: [], parameters: [], rules: [] };
    const targetResult = targetSheet ? parseTargetSheet(sheetRows(workbook, targetSheet), targetSheet) : { errors: [], warnings: [], targetConditions: [] };
    errors.push(...parameterResult.errors, ...targetResult.errors);
    warnings.push(...parameterResult.warnings, ...targetResult.warnings);
    for (const rule of parameterResult.parameters.filter((item) => item.enabled && item.required && item.source.includes('目标工况'))) {
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
      source: { type: 'xlsx', parameterSheet, targetSheet, sheetNames: names }
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
    const workbook = xlsx().read(arrayBuffer, { type: 'array', cellDates: true, raw: false });
    const names = workbook.SheetNames || [];
    if (names.some((name) => normalized(name).includes('数据处理设定参数')) && names.some((name) => normalized(name).includes('目标工况'))) {
      return { ok: false, errors: ['当前文件是参数工作簿，请使用“参数/目标工况 Excel”入口'], sheetNames: names, rows: [] };
    }
    const candidates = names.map((name) => {
      const rows = sheetRows(workbook, name); const headerIndex = findDataHeaderRow(rows);
      return { name, rows, headerIndex, dataRows: headerIndex >= 0 ? objectRows(rows, headerIndex) : [] };
    }).filter((candidate) => candidate.headerIndex >= 0 && candidate.dataRows.length);
    if (!candidates.length) return { ok: false, errors: ['未找到同时包含时间、电流和电压字段的时序工作表'], sheetNames: names, rows: [] };
    candidates.sort((a, b) => b.dataRows.length - a.dataRows.length);
    const selected = candidates[0];
    return { ok: true, errors: [], sheetNames: names, sheetName: selected.name, headerRow: selected.headerIndex, rows: selected.dataRows };
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
  const parameterConfig = options.parameterConfig || null;
  addSheet(book, '测试信息', [
    ['字段', '值', '来源/说明'],
    ['数据文件', fileName, '当前浏览器会话'],
    ['数据集', dataset.label || '通用测试数据', '自动识别结果'],
    ['记录数', result.quality.rowCount, '原始输入记录'],
    ['相对时长(s)', result.metrics.durationS, '由时间字段计算；时间质量见数据质量检查'],
    ['自动判定', result.verdict, '不是安全认证或企业放行结论'],
    ['生成时间', result.generatedAt, '系统时间'],
    ['边界', result.narrative, '需要企业批准规则和人工签核']
  ]);
  const parameterRows = [['参数代码', '参数名称', '启用', '目标值', '下偏差', '上偏差', '单位', '连续时间(s)', '标准字段', '来源']];
  for (const item of parameterConfig?.parameters || []) parameterRows.push([item.code, item.name, item.enabled ? '是' : '否', item.target ?? '', item.lowerTolerance ?? '', item.upperTolerance ?? '', item.unit, item.minimumDurationS ?? '', item.field || '', item.source || '参数工作表']);
  if (parameterRows.length === 1) parameterRows.push(['—', '未导入参数工作簿', '', '', '', '', '', '', '', '']);
  addSheet(book, '本次使用参数', parameterRows);
  const targetRows = [['工况编号', '目标电流(A)', '目标电流密度(mA/cm²)', '氢气计量比', '氢气流量', '氢气入口压力', '空气计量比', '空气流量', '冷却液入口温度', '冷却液温差', '冷却液入口压力']];
  for (const item of parameterConfig?.targetConditions || []) targetRows.push([item.conditionId, item.targetCurrentA, item.targetCurrentDensity ?? '', item.h2Stoich ?? '', item.h2Flow ?? '', item.h2InPressure ?? '', item.airStoich ?? '', item.airFlow ?? '', item.coolantInTemp ?? '', item.coolantDt ?? '', item.coolantInPressure ?? '']);
  if (targetRows.length === 1) targetRows.push(['—', '未导入目标工况工作表']);
  addSheet(book, '目标工况设定', targetRows);
  addSheet(book, '字段映射', [['标准字段', '原始字段', '单位/换算', '映射状态'], ...Object.entries(result.schema.mapping).map(([field, source]) => [field, source || '', result.schema.conversions[field]?.label || '原单位', source ? '已映射' : '缺失'])]);
  addSheet(book, '数据质量检查', [['检查项', '数值', '判定'], ['记录数', result.quality.rowCount, result.quality.hasEnoughRows ? '通过' : '错误'], ['完整率(%)', result.quality.completenessPct, result.quality.completenessPct >= 98 ? '通过' : '需复核'], ['重复时间戳', result.quality.duplicateTimestampCount, result.quality.duplicateTimestampCount ? '需复核' : '通过'], ['逆序跳变', result.quality.nonMonotonicCount, result.quality.nonMonotonicCount ? '需复核' : '通过'], ...qualityRows(result).map(([field, invalid, valid, status]) => [`字段：${field}`, `${valid} 有效 / ${invalid} 无效`, status])]);
  const platforms = dataset.platforms || dataset.performancePoints || [];
  const performancePoints = dataset.performancePoints || [];
  addSheet(book, '电流平台', [['平台/工况', '目标电流(A)', '起始(s)', '结束(s)', '持续(s)', '样本数', '判定'], ...platforms.map((item, index) => [item.conditionId || `平台-${index + 1}`, item.targetCurrentA ?? '', item.startS ?? '', item.endS ?? '', item.effectiveDurationS ?? item.durationS ?? '', item.sampleCount ?? '', item.status || '待复核'])]);
  addSheet(book, '稳定区间', [['平台/工况', '起始(s)', '结束(s)', '有效持续(s)', '统计截取(s)', '有效样本数', '参数完整', '选定状态', '说明'], ...(dataset.stableSegments || []).map((item) => [item.platformId || item.conditionId || '', item.startS ?? '', item.endS ?? '', item.effectiveDurationS ?? item.durationS ?? '', item.selectedDurationS ?? '', item.selectedSampleCount ?? item.sampleCount ?? '', item.parameterComplete ? '是' : '否', item.selected ? '自动选定' : '候选', item.status || '待复核'])]);
  addSheet(book, '极化曲线数据', [['工况', '平均电流(A)', '平均电流密度(mA/cm²)', '平均单片电压(V)', '平均净功率(kW)', '有效性'], ...performancePoints.map((item) => [item.platformId || item.conditionId || '', item.averageCurrentA ?? '', item.averageCurrentDensity ?? '', item.averageCellVoltageV ?? '', item.averageNetPowerKw ?? '', item.status || '待复核'])]);
  const metricRows = Object.entries(dataset.metrics || result.metrics).flatMap(([field, value]) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.entries(value).map(([stat, statValue]) => [`${field}.${stat}`, statValue ?? '', '', '结构化计算结果'])
    : [[field, value ?? '', '', '结构化计算结果']]);
  addSheet(book, '实际工况汇总', [['指标', '值', '单位', '证据'], ...metricRows]);
  const comparisonRows = [['工况', '目标电流(A)', '实际平均电流(A)', '偏差(A)', '允许偏差(A)', '符合性']];
  for (const [index, item] of performancePoints.entries()) comparisonRows.push([item.platformId || item.conditionId || `平台-${index + 1}`, item.targetCurrentA ?? '', item.averageCurrentA ?? '', '', item.toleranceA ?? '', '']);
  const comparisonSheet = addSheet(book, '目标工况对比', comparisonRows);
  for (let row = 2; row <= comparisonRows.length; row += 1) {
    const difference = comparisonSheet[`D${row}`];
    if (difference) { difference.f = `C${row}-B${row}`; difference.t = 'n'; difference.v = number(comparisonRows[row - 1][2]) !== null && number(comparisonRows[row - 1][1]) !== null ? number(comparisonRows[row - 1][2]) - number(comparisonRows[row - 1][1]) : undefined; }
    const verdict = comparisonSheet[`F${row}`];
    if (verdict) { verdict.f = `IF(ABS(D${row})<=E${row},"正常","需复核")`; verdict.t = 's'; verdict.v = '需复核'; }
  }
  const cellStats = dataset.cellChannelCount ? [['指标', '值', '单位'], ['导出单片通道', dataset.cellChannelCount, '个'], ['片数参数', dataset.configuredCellCount || '', '个'], ['平均单片电压', dataset.metrics?.averageCellVoltageV ?? '', 'V'], ['最大单片电压极差', dataset.metrics?.cellSpreadMaxV ?? '', 'V'], ['单片电压标准差', dataset.metrics?.cellValueStdV ?? '', 'V']] : [['指标', '值', '单位'], ['当前数据集', '无单片通道摘要', '']];
  addSheet(book, '单片电压统计', cellStats);
  addSheet(book, '异常清单', [['级别', '代码', '标题', '证据', '建议动作'], ...result.issues.map((item) => [item.severity, item.code, item.title, item.evidence, item.recommendation])]);
  if (dataset.kind === 'durability') addSheet(book, '耐久功率点', [['目标功率(kW)', '净输出功率(kW)', '平均单体电压(mV)', '离均差(mV)', '电压方差', '来源文件'], ...(dataset.points || []).map((item) => [item.targetPowerKw ?? '', item.netPowerKw ?? '', item.averageCellVoltageMv ?? '', item.averageDeviationMv ?? '', item.voltageVariance ?? '', item.source_file || 'DOCX报告'])]);
  addSheet(book, '图表数据', [['说明', '本工作簿保留可复核图表数据；实际图形可由企业模板引用本表'], ...(dataset.kind === 'durability' ? (dataset.points || []).map((item) => [item.targetPowerKw ?? '', item.averageCellVoltageMv ?? '', item.averageDeviationMv ?? '', item.voltageVariance ?? '']) : performancePoints.map((item) => [item.platformId || item.conditionId || '', item.targetCurrentA ?? '', item.averageCurrentDensity ?? '', item.averageCellVoltageV ?? '', item.averageNetPowerKw ?? '', item.status || '待复核']))]);
  addSheet(book, '处理日志', [['步骤', '状态', '证据/来源'], ...(result.workflow?.steps || []).map((step) => [step.label, step.status, step.evidence]), ['参数工作簿', parameterConfig?.ok ? '已校验' : '未提供/未通过', parameterConfig ? `${parameterConfig.parameterSheet || ''}；${parameterConfig.targetSheet || ''}` : '需要导入企业参数工作簿'], ['报告边界', '必须保留', '不替代企业标准负责人、测试人员或实验室签核']]);
  book.Props = { Title: 'H₂ TestLens 企业设备测试分析报告', Subject: dataset.label || '氢能设备测试数据', Author: 'H₂ TestLens' };
  return book;
}

export function workbookArrayBuffer(workbook) {
  return xlsx().write(workbook, { bookType: 'xlsx', type: 'array', compression: true });
}
