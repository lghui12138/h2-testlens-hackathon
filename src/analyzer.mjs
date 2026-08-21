import { comparisonMarkdown } from './compare.mjs';

export const DEFAULT_CONFIG = Object.freeze({
  maxTemperatureC: 80,
  maxPressureBar: 30,
  maxLeakPpm: 10,
  maxVoltageStdV: 0.12,
  maxPressureDriftBarPerMin: 1.2
});

export const REQUIRED_FIELDS = Object.freeze([
  'timestamp_s', 'phase', 'current_a', 'voltage_v', 'temperature_c', 'pressure_bar', 'flow_slpm', 'leak_ppm', 'hydrogen_purity_pct'
]);

export const OPTIONAL_FIELDS = Object.freeze(['phase', 'hydrogen_purity_pct']);

export const FIELD_ALIASES = Object.freeze({
  timestamp_s: ['timestamp_s', 'timestamp', 'time_s', 'time', '时间戳', '时间'],
  phase: ['phase', 'stage', 'state', '工况', '阶段', '状态'],
  current_a: ['current_a', 'current', 'i_a', 'i', '电流'],
  voltage_v: ['voltage_v', 'voltage', 'u_v', 'u', '电压'],
  temperature_c: ['temperature_c', 'temperature', 'temp_c', 'temp', '温度'],
  pressure_bar: ['pressure_bar', 'pressure', 'p_bar', 'p', '压力'],
  flow_slpm: ['flow_slpm', 'flow', 'flow_rate', '流量'],
  leak_ppm: ['leak_ppm', 'leak', 'leakage', 'hydrogen_leak', '泄漏', '泄漏监测'],
  hydrogen_purity_pct: ['hydrogen_purity_pct', 'hydrogen_purity', 'purity_pct', 'purity', 'h2_purity', '氢气纯度', '纯度']
});

const ANALYZED_NUMERIC_FIELDS = Object.freeze(['current_a', 'voltage_v', 'temperature_c', 'pressure_bar', 'flow_slpm', 'leak_ppm']);
const PERFORMANCE_FIELDS = Object.freeze(['flow_slpm', 'hydrogen_purity_pct', 'energy_derived']);

const number = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const std = (values) => {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
};

const parseCSVLine = (line) => {
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { values.push(value); value = ''; }
    else value += char;
  }
  values.push(value);
  return values;
};

export function parseCSV(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = (values[index] ?? '').trim();
      return row;
    }, {});
  });
}

const normalizeHeader = (header) => String(header ?? '').toLowerCase().replace(/[\s_\-().（）()[\]{}]/g, '');

const headerMatches = (header, alias) => {
  const normalizedHeader = normalizeHeader(header);
  const normalizedAlias = normalizeHeader(alias);
  return normalizedHeader === normalizedAlias || (normalizedAlias.length >= 2 && normalizedHeader.includes(normalizedAlias));
};

function unitTransform(field, header) {
  const normalized = normalizeHeader(header);
  if (field === 'timestamp_s') {
    if (normalized.includes('ms') || normalized.includes('毫秒')) return { mode: 'scale', factor: 0.001, label: 'ms→s' };
    if (normalized.includes('min') || normalized.includes('分钟')) return { mode: 'scale', factor: 60, label: 'min→s' };
  }
  if (field === 'current_a' && (normalized.includes('ma') || normalized.includes('毫安'))) return { mode: 'scale', factor: 0.001, label: 'mA→A' };
  if (field === 'voltage_v' && (normalized.includes('mv') || normalized.includes('毫伏'))) return { mode: 'scale', factor: 0.001, label: 'mV→V' };
  if (field === 'pressure_bar') {
    if (normalized.includes('kpa') || normalized.includes('千帕')) return { mode: 'scale', factor: 0.01, label: 'kPa→bar' };
    if (normalized.includes('mpa') || normalized.includes('兆帕')) return { mode: 'scale', factor: 10, label: 'MPa→bar' };
    if (normalized.endsWith('pa') || normalized.includes('帕')) return { mode: 'scale', factor: 0.00001, label: 'Pa→bar' };
  }
  if (field === 'leak_ppm' && (normalized.includes('ppb') || normalized.includes('十亿'))) return { mode: 'scale', factor: 0.001, label: 'ppb→ppm' };
  if (field === 'temperature_c' && (normalized.includes('fahrenheit') || normalized.includes('华氏') || normalized.endsWith('f'))) return { mode: 'fahrenheit_to_c', factor: 1, label: '°F→°C' };
  return { mode: 'identity', factor: 1, label: '原单位' };
}

function resolveSchema(inputRows, explicitMapping = {}) {
  const headers = [...new Set(inputRows.flatMap((row) => Object.keys(row)))];
  const mapping = {};
  const conversions = {};
  const missingHeaders = [];
  const missingOptionalHeaders = [];
  const mappingWarnings = [];
  for (const field of REQUIRED_FIELDS) {
    const explicitHeader = explicitMapping[field];
    if (explicitHeader && !headers.includes(explicitHeader)) mappingWarnings.push(`${field} 配置表头“${explicitHeader}”未在输入文件中找到，已尝试通用别名回退`);
    const sourceHeader = explicitHeader && headers.includes(explicitHeader)
      ? explicitHeader
      : headers.find((header) => headerMatches(header, field))
        ?? headers.find((header) => FIELD_ALIASES[field].some((alias) => headerMatches(header, alias)));
    if (!sourceHeader) {
      (OPTIONAL_FIELDS.includes(field) ? missingOptionalHeaders : missingHeaders).push(field);
      continue;
    }
    mapping[field] = sourceHeader;
    conversions[field] = unitTransform(field, sourceHeader);
  }
  return {
    headers,
    mapping,
    conversions,
    missingHeaders,
    missingOptionalHeaders,
    mappingWarnings,
    mappedCount: Object.keys(mapping).length,
    fieldCount: REQUIRED_FIELDS.length
  };
}

function convertValue(rawValue, transform) {
  const value = number(rawValue);
  if (value === null) return null;
  if (transform?.mode === 'fahrenheit_to_c') return (value - 32) * (5 / 9);
  return value * (transform?.factor ?? 1);
}

const slopePerMinute = (rows, field) => {
  const points = rows
    .map((row) => [row.timestamp_s, row[field]])
    .filter(([x, y]) => x !== null && y !== null);
  if (points.length < 2) return 0;
  const xMean = mean(points.map(([x]) => x));
  const yMean = mean(points.map(([, y]) => y));
  const numerator = points.reduce((sum, [x, y]) => sum + (x - xMean) * (y - yMean), 0);
  const denominator = points.reduce((sum, [x]) => sum + (x - xMean) ** 2, 0);
  return denominator ? (numerator / denominator) * 60 : 0;
};

function phaseSummary(rows) {
  const groups = [];
  for (const row of rows) {
    const phase = row.phase || '未标注';
    const last = groups.at(-1);
    if (!last || last.phase !== phase) groups.push({ phase, count: 1, start: row.timestamp_s, end: row.timestamp_s });
    else { last.count += 1; last.end = row.timestamp_s; }
  }
  return groups.map((group) => ({
    phase: group.phase,
    count: group.count,
    startS: group.start,
    endS: group.end,
    durationS: group.start !== null && group.end !== null ? Math.abs(group.end - group.start) : 0
  }));
}

function issue(severity, code, title, evidence, recommendation) {
  return { severity, code, title, evidence, recommendation };
}

function qualityReport(rows, schema) {
  const missingHeaders = schema.missingHeaders;
  const invalidValueCounts = Object.fromEntries([
    'timestamp_s', ...ANALYZED_NUMERIC_FIELDS
  ].map((field) => [field, rows.filter((row) => row[field] === null).length]));
  const timestamps = rows.map((row) => row.timestamp_s).filter((value) => value !== null);
  const duplicateTimestampCount = timestamps.length - new Set(timestamps).size;
  const nonMonotonicCount = timestamps.slice(1).reduce((count, timestamp, index) => count + (timestamp < timestamps[index] ? 1 : 0), 0);
  const totalCells = rows.length * ANALYZED_NUMERIC_FIELDS.length;
  const missingCells = rows.reduce((count, row) => count + ANALYZED_NUMERIC_FIELDS.filter((field) => row[field] === null).length, 0);
  const optionalInvalidValueCounts = Object.fromEntries(OPTIONAL_FIELDS.filter((field) => field !== 'phase').map((field) => [field, rows.filter((row) => row[field] === null).length]));
  return {
    rowCount: rows.length,
    missingHeaders,
    missingOptionalHeaders: schema.missingOptionalHeaders,
    invalidValueCounts,
    optionalInvalidValueCounts,
    duplicateTimestampCount,
    nonMonotonicCount,
    missingCells,
    totalCells,
    completenessPct: totalCells ? ((totalCells - missingCells) / totalCells) * 100 : 0,
    hasEnoughRows: rows.length >= 2,
    usable: rows.length >= 2 && missingHeaders.length === 0 && invalidValueCounts.timestamp_s === 0
  };
}

const isSteadyPhase = (phase) => ['steady', 'stabilized', 'stable', '稳态', '稳定', '恒定'].includes(String(phase || '').trim().toLowerCase());

function selectSteadyRows(rows) {
  const explicit = rows.filter((row) => isSteadyPhase(row.phase));
  if (explicit.length >= 2) return { rows: explicit, source: 'phase=steady' };
  const active = rows.filter((row) => row.current_a !== null && row.current_a > 0 && row.voltage_v !== null);
  const fallback = active.slice(Math.floor(active.length * 0.4));
  return { rows: fallback.length >= 2 ? fallback : rows, source: explicit.length ? 'phase=steady（样本不足，回退活动窗口）' : '活动窗口回退' };
}

function complianceReadiness(config, missingMeasurements = []) {
  const missingProfileFields = [];
  if (!config.profileId) missingProfileFields.push('profileId');
  if (!config.standardRefs?.length) missingProfileFields.push('standardRefs');
  if (!config.methodId || config.methodId === 'demo-rule-set') missingProfileFields.push('methodId');
  if (!config.revision || config.revision === 'demo-v1') missingProfileFields.push('revision');
  const metadata = config.testMetadata && typeof config.testMetadata === 'object' ? config.testMetadata : {};
  const requiredMetadata = Array.isArray(config.requiredMetadata) ? config.requiredMetadata : [];
  const missingMetadata = requiredMetadata.filter((field) => {
    const value = metadata[field];
    return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
  });
  const status = config.approvalStatus !== 'approved' ? 'DEMO_ONLY' : missingProfileFields.length || missingMetadata.length || missingMeasurements.length ? 'NOT_READY' : 'READY_FOR_HUMAN_REVIEW';
  const label = status === 'DEMO_ONLY' ? '仅演示，不作标准符合性判定' : status === 'NOT_READY' ? '标准符合性资料不完整' : '可进入人工符合性复核';
  return { status, label, approvalStatus: config.approvalStatus || 'unspecified', standardRefs: config.standardRefs || [], methodId: config.methodId || null, revision: config.revision || null, applicationScope: config.applicationScope || null, intendedUse: config.intendedUse || null, missingProfileFields, requiredMetadata, missingMetadata, requiredMeasurements: config.requiredMeasurements || [], missingMeasurements };
}

function missingPerformanceMeasurements(config, rows, schema) {
  const required = Array.isArray(config.requiredMeasurements) ? config.requiredMeasurements : [];
  return required.filter((field) => {
    if (field === 'energy_derived') return rows.filter((row) => row.timestamp_s !== null && row.current_a !== null && row.voltage_v !== null).length < 2;
    return !schema.mapping[field] || rows.filter((row) => row[field] !== null).length < 2;
  });
}

function integrateTrapezoid(rows, field, divisor = 1) {
  let total = 0;
  let segments = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    const deltaS = current.timestamp_s !== null && previous.timestamp_s !== null ? current.timestamp_s - previous.timestamp_s : 0;
    if (deltaS <= 0 || previous[field] === null || current[field] === null) continue;
    total += ((previous[field] + current[field]) / 2) * deltaS / divisor;
    segments += 1;
  }
  return segments ? total : null;
}

function workflowReadiness(config, quality, schema, compliance, verdict) {
  const dataReady = quality.usable && quality.completenessPct >= 98 && quality.duplicateTimestampCount === 0 && quality.nonMonotonicCount === 0;
  const traceabilityReady = schema.mappingWarnings.length === 0 && quality.invalidValueCounts.timestamp_s === 0;
  const metadataReady = compliance.missingMetadata.length === 0;
  const signoffReady = Boolean(config.testMetadata?.signoff);
  const performanceReady = compliance.missingMeasurements.length === 0;
  const steps = [
    { id: 'profile', label: '设备家族与测试方法', status: compliance.missingProfileFields.length ? 'needs_input' : 'ready', evidence: compliance.missingProfileFields.length ? `缺少 ${compliance.missingProfileFields.join('、')}` : `${compliance.methodId} · ${compliance.revision}` },
    { id: 'metadata', label: '测试计划与仪器溯源', status: metadataReady ? 'ready' : 'needs_input', evidence: metadataReady ? '目的、仪器、校准、执行者、公式、签核字段齐全' : `缺少 ${compliance.missingMetadata.join('、')}` },
    { id: 'data', label: '原始数据质量', status: dataReady ? 'ready' : 'needs_review', evidence: `${quality.rowCount} 条记录 · 完整率 ${quality.completenessPct.toFixed(1)}%` },
    { id: 'traceability', label: '字段、单位与计算追溯', status: traceabilityReady ? 'ready' : 'needs_review', evidence: `${schema.mappedCount}/${schema.fieldCount} 字段已映射 · ${Object.values(schema.conversions).filter((item) => item.mode !== 'identity').length} 项单位换算` },
    { id: 'performance', label: '产氢量、纯度与单位能耗', status: performanceReady ? 'ready' : 'needs_input', evidence: performanceReady ? 'profile 要求的性能测量均有有效数据' : `缺少 ${compliance.missingMeasurements.join('、')}` },
    { id: 'risk', label: '风险处置与复测决定', status: verdict === 'FAIL' ? 'blocked' : verdict === 'WARN' ? 'needs_review' : 'ready', evidence: verdict === 'FAIL' ? '存在高优先级风险，先处置再决定归档' : verdict === 'WARN' ? '存在趋势或质量问题，需要工程师复核' : '当前规则未触发高优先级风险' },
    { id: 'signoff', label: '人工签核与归档', status: signoffReady ? 'ready' : 'needs_input', evidence: signoffReady ? config.testMetadata.signoff : '尚未填写人工签核信息' }
  ];
  const status = !quality.usable ? 'BLOCKED_DATA' : compliance.status === 'DEMO_ONLY' ? 'DEMO_ONLY' : compliance.status === 'NOT_READY' ? 'NOT_READY' : verdict !== 'PASS' ? 'REVIEW_REQUIRED' : !signoffReady ? 'SIGNOFF_REQUIRED' : 'READY_FOR_HUMAN_REVIEW';
  const nextAction = status === 'BLOCKED_DATA' ? '修复数据结构、时间轴或缺失值后重跑。' : status === 'DEMO_ONLY' ? '导入企业批准的 profile、方法版本和验收准则。' : status === 'NOT_READY' ? '补齐 profile 审批状态、方法版本和测试元数据。' : status === 'REVIEW_REQUIRED' ? '处置异常并完成工程师复核，必要时安排复测。' : status === 'SIGNOFF_REQUIRED' ? '由授权测试人员填写签核后归档。' : '可进入人工符合性复核与正式归档。';
  return { status, nextAction, steps };
}

export function analyzeRows(inputRows, suppliedConfig = {}) {
  const safeInput = Array.isArray(inputRows) ? inputRows : [];
  const { fieldMapping = {}, ...thresholdConfig } = suppliedConfig;
  const config = { ...DEFAULT_CONFIG, ...thresholdConfig };
  const schema = resolveSchema(safeInput, fieldMapping);
  const rows = safeInput.map((row) => ({
    ...row,
    phase: schema.mapping.phase ? String(row[schema.mapping.phase] ?? '').trim() || '未标注' : '未标注',
    timestamp_s: convertValue(row[schema.mapping.timestamp_s], schema.conversions.timestamp_s),
    current_a: convertValue(row[schema.mapping.current_a], schema.conversions.current_a),
    voltage_v: convertValue(row[schema.mapping.voltage_v], schema.conversions.voltage_v),
    temperature_c: convertValue(row[schema.mapping.temperature_c], schema.conversions.temperature_c),
    pressure_bar: convertValue(row[schema.mapping.pressure_bar], schema.conversions.pressure_bar),
    flow_slpm: convertValue(row[schema.mapping.flow_slpm], schema.conversions.flow_slpm),
    leak_ppm: convertValue(row[schema.mapping.leak_ppm], schema.conversions.leak_ppm),
    hydrogen_purity_pct: convertValue(row[schema.mapping.hydrogen_purity_pct], schema.conversions.hydrogen_purity_pct)
  }));
  const quality = qualityReport(rows, schema);
  const missingMeasurements = missingPerformanceMeasurements(config, rows, schema);
  const compliance = complianceReadiness(config, missingMeasurements);
  const valueList = (field, selectedRows = rows) => selectedRows.map((row) => row[field]).filter((value) => value !== null);
  const steadySelection = selectSteadyRows(rows);
  const steadyRows = steadySelection.rows;
  const timestamps = valueList('timestamp_s');
  const temperatures = valueList('temperature_c');
  const pressures = valueList('pressure_bar');
  const leaks = valueList('leak_ppm');
  const steadyVoltage = valueList('voltage_v', steadyRows);
  const powers = rows.map((row) => row.current_a !== null && row.voltage_v !== null ? row.current_a * row.voltage_v : null).filter((value) => value !== null);
  const peakWithTimes = (field) => {
    const values = rows.map((row) => row[field]).filter((value) => value !== null);
    if (!values.length) return { value: null, atS: [] };
    const value = Math.max(...values);
    return { value, atS: rows.filter((row) => row[field] === value && row.timestamp_s !== null).map((row) => row.timestamp_s) };
  };
  const peakTemperature = peakWithTimes('temperature_c');
  const peakPressure = peakWithTimes('pressure_bar');
  const peakLeak = peakWithTimes('leak_ppm');
  const purityValues = rows.map((row) => row.hydrogen_purity_pct).filter((value) => value !== null);
  const minimumWithTimes = (field) => {
    const values = rows.map((row) => row[field]).filter((value) => value !== null);
    if (!values.length) return { value: null, atS: [] };
    const value = Math.min(...values);
    return { value, atS: rows.filter((row) => row[field] === value && row.timestamp_s !== null).map((row) => row.timestamp_s) };
  };
  const minimumPurity = minimumWithTimes('hydrogen_purity_pct');
  const hydrogenVolumeNl = integrateTrapezoid(rows, 'flow_slpm', 60);
  const energyWh = rows.map((row) => ({ ...row, power_w: row.current_a !== null && row.voltage_v !== null ? row.current_a * row.voltage_v : null }));
  const energyConsumedWh = integrateTrapezoid(energyWh, 'power_w', 3600);
  const specificEnergyKWhPerNm3 = hydrogenVolumeNl && energyConsumedWh !== null ? energyConsumedWh / hydrogenVolumeNl : null;
  const timeRef = (times) => times.length ? `，出现于 t=${times.slice(0, 3).join('、')} s` : '';
  const pressureDriftRows = steadyRows.length >= 2 ? steadyRows : rows;
  const metrics = {
    sampleCount: rows.length,
    durationS: timestamps.length ? Math.max(...timestamps) - Math.min(...timestamps) : 0,
    completenessPct: quality.completenessPct,
    peakPowerW: powers.length ? Math.max(...powers) : null,
    steadyVoltageMeanV: mean(steadyVoltage),
    steadyVoltageStdV: std(steadyVoltage),
    peakTemperatureC: peakTemperature.value,
    peakTemperatureAtS: peakTemperature.atS,
    peakPressureBar: peakPressure.value,
    peakPressureAtS: peakPressure.atS,
    peakLeakPpm: peakLeak.value,
    peakLeakAtS: peakLeak.atS,
    hydrogenVolumeNl,
    energyConsumedWh,
    specificEnergyKWhPerNm3,
    minimumHydrogenPurityPct: minimumPurity.value,
    minimumHydrogenPurityAtS: minimumPurity.atS,
    pressureDriftBarPerMin: slopePerMinute(pressureDriftRows, 'pressure_bar'),
    steadyWindow: steadySelection.source,
    steadySampleCount: steadyRows.length
  };
  const issues = [];
  if (!quality.hasEnoughRows) issues.push(issue('critical', 'DATA_TOO_SHORT', '测试数据不足', `当前只有 ${quality.rowCount} 条记录，至少需要 2 条`, '检查导出文件和测试记录范围。'));
  if (quality.missingHeaders.length) issues.push(issue('critical', 'SCHEMA_MISSING', '缺少分析所需字段', `缺少：${quality.missingHeaders.join('、')}`, '先完成字段映射或导出完整测试日志，再进行判定。'));
  if (schema.missingOptionalHeaders.includes('phase')) issues.push(issue('info', 'PHASE_OPTIONAL', '未提供工况字段', '将使用活动窗口回退估计稳态段', '如企业日志有工况/阶段字段，可在字段映射中补充。'));
  if (schema.missingOptionalHeaders.includes('hydrogen_purity_pct')) issues.push(issue('info', 'PURITY_OPTIONAL', '未提供氢气纯度字段', '当前只计算流量积分和电能积分，不能给出纯度结果', '按企业测试方法补充氢气纯度测量通道或在 profile 中明确不适用。'));
  if (schema.mappingWarnings.length) issues.push(issue('warn', 'MAPPING_OVERRIDE_MISSING', '企业字段映射未完全命中', schema.mappingWarnings.join('；'), '确认配置包表头与当前测试导出文件完全一致。'));
  const convertedFields = Object.entries(schema.conversions).filter(([, transform]) => transform.mode !== 'identity');
  if (convertedFields.length) issues.push(issue('info', 'UNIT_CONVERTED', '已自动换算输入单位', convertedFields.map(([field, transform]) => `${field} ${transform.label}`).join('；'), '正式归档前确认原始表头和单位定义。'));
  if (quality.invalidValueCounts.timestamp_s > 0) issues.push(issue('critical', 'TIMESTAMP_INVALID', '时间轴存在无效值', `有 ${quality.invalidValueCounts.timestamp_s} 条记录无法解析 timestamp_s`, '修复时间列格式，避免趋势和漂移计算失真。'));
  if (quality.duplicateTimestampCount > 0 || quality.nonMonotonicCount > 0) issues.push(issue('warn', 'TIME_SEQUENCE', '时间轴需要复核', `重复时间戳 ${quality.duplicateTimestampCount} 条，逆序跳变 ${quality.nonMonotonicCount} 次`, '确认采样时钟、合并文件和排序方式。'));
  if (quality.completenessPct < 98 && quality.missingHeaders.length === 0) issues.push(issue('warn', 'DATA_GAP', '测试数据存在缺口', `关键数值字段完整率 ${quality.completenessPct.toFixed(1)}%`, '补齐缺失字段后再做正式判定。'));
  if (metrics.peakTemperatureC !== null && metrics.peakTemperatureC > config.maxTemperatureC) issues.push(issue('critical', 'TEMP_HIGH', '温度超过演示阈值', `峰值 ${metrics.peakTemperatureC.toFixed(1)} °C > ${config.maxTemperatureC} °C${timeRef(metrics.peakTemperatureAtS)}`, '检查散热、负载爬升和温度传感器安装。'));
  if (metrics.peakPressureBar !== null && metrics.peakPressureBar > config.maxPressureBar) issues.push(issue('critical', 'PRESSURE_HIGH', '压力超过演示阈值', `峰值 ${metrics.peakPressureBar.toFixed(1)} bar > ${config.maxPressureBar} bar${timeRef(metrics.peakPressureAtS)}`, '暂停升载，检查调压与泄压回路。'));
  if (metrics.peakLeakPpm !== null && metrics.peakLeakPpm > config.maxLeakPpm) issues.push(issue('critical', 'LEAK_HIGH', '泄漏监测值超过演示阈值', `峰值 ${metrics.peakLeakPpm.toFixed(1)} ppm > ${config.maxLeakPpm} ppm${timeRef(metrics.peakLeakAtS)}`, '优先复核密封、采样管路与环境本底。'));
  if (missingMeasurements.length) issues.push(issue('critical', 'PERFORMANCE_FIELD_MISSING', '缺少 profile 要求的性能测量', `缺少：${missingMeasurements.join('、')}`, '补充企业方法要求的测量通道和数据采集记录后再生成正式性能结论。'));
  const acceptance = config.acceptanceCriteria || {};
  if (acceptance.minHydrogenPurityPct !== undefined && metrics.minimumHydrogenPurityPct !== null && metrics.minimumHydrogenPurityPct < acceptance.minHydrogenPurityPct) issues.push(issue('critical', 'PURITY_LOW', '氢气纯度低于 profile 验收准则', `最低纯度 ${metrics.minimumHydrogenPurityPct.toFixed(3)}% < ${acceptance.minHydrogenPurityPct}%${timeRef(metrics.minimumHydrogenPurityAtS)}`, '复核纯度分析仪、净化系统和采样条件。'));
  if (acceptance.maxSpecificEnergyKWhPerNm3 !== undefined && metrics.specificEnergyKWhPerNm3 !== null && metrics.specificEnergyKWhPerNm3 > acceptance.maxSpecificEnergyKWhPerNm3) issues.push(issue('critical', 'SPECIFIC_ENERGY_HIGH', '单位制氢电耗高于 profile 验收准则', `单位电耗 ${metrics.specificEnergyKWhPerNm3.toFixed(3)} kWh/Nm³ > ${acceptance.maxSpecificEnergyKWhPerNm3} kWh/Nm³`, '复核功率、产氢量、稳态窗口和企业计算方法。'));
  if (metrics.steadyVoltageStdV !== null && metrics.steadyVoltageStdV > config.maxVoltageStdV) issues.push(issue('warn', 'VOLTAGE_UNSTABLE', '稳态电压波动偏大', `稳态标准差 ${metrics.steadyVoltageStdV.toFixed(3)} V > ${config.maxVoltageStdV} V`, '检查供电纹波、负载控制和稳态窗口选择。'));
  if (Math.abs(metrics.pressureDriftBarPerMin) > config.maxPressureDriftBarPerMin) issues.push(issue('warn', 'PRESSURE_DRIFT', '稳态压力仍在漂移', `窗口 ${metrics.steadyWindow} 的压力斜率 ${metrics.pressureDriftBarPerMin.toFixed(2)} bar/min`, '延长稳态时间并复核压力闭环控制。'));
  if (!issues.length) issues.push(issue('info', 'ALL_CLEAR', '未发现超出当前规则的异常', '关键 KPI 均落在演示阈值内', '可进入人工复核与正式归档。'));
  const verdict = issues.some((item) => item.severity === 'critical') ? 'FAIL' : issues.some((item) => item.severity === 'warn') ? 'WARN' : 'PASS';
  const workflow = workflowReadiness(config, quality, schema, compliance, verdict);
  const criticalCount = issues.filter((item) => item.severity === 'critical').length;
  const narrative = verdict === 'FAIL'
    ? `本次测试自动判定为需复核：发现 ${criticalCount} 项高优先级风险。系统已将异常指标、阈值和建议动作绑定到同一证据链，工程师可先处理安全相关项，再决定是否重测。`
    : verdict === 'WARN'
      ? '本次测试未触发高优先级安全规则，但存在需要工程师复核的趋势或数据质量问题，建议在正式归档前补测。'
      : '本次测试关键指标未触发当前规则，建议结合企业标准和设备工况完成最终人工签核。';
  return {
    generatedAt: new Date().toISOString(),
    config,
    rows,
    metrics,
    quality,
    schema,
    compliance,
    workflow,
    phases: phaseSummary(rows),
    issues,
    verdict,
    narrative,
    source: { type: 'csv', rowCount: rows.length, requiredFields: REQUIRED_FIELDS }
  };
}

export function publicAnalysis(result) {
  const { rows, ...safeResult } = result;
  return safeResult;
}

export function reportMarkdown(result, fileName = 'test-run.csv', options = {}) {
  const { metrics, quality, schema, issues, phases, verdict, config, narrative } = result;
  const status = verdict === 'PASS' ? '通过' : verdict === 'WARN' ? '需复核' : '未通过';
  const mappings = Object.entries(schema.mapping).map(([field, source]) => `${field}←${source}`).join('；');
  const conversions = Object.entries(schema.conversions).filter(([, transform]) => transform.mode !== 'identity').map(([field, transform]) => `${field} ${transform.label}`).join('；') || '无';
  const complianceSection = `\n\n## 标准适用性与符合性门控\n\n- 状态：${result.compliance?.status || '未评估'}（${result.compliance?.label || '需人工确认'}）\n- profile 审批状态：${result.compliance?.approvalStatus || '未指定'}\n- 测试方法：${result.compliance?.methodId || '未指定'} · 版本：${result.compliance?.revision || '未指定'}\n- 适用范围：${result.compliance?.applicationScope || '未指定'}\n- 缺失 profile 字段：${result.compliance?.missingProfileFields?.join('、') || '无'}\n- 缺失测试元数据：${result.compliance?.missingMetadata?.join('、') || '无'}\n- 说明：该状态不是安全认证；正式符合性结论必须由企业标准负责人和测试人员签核。\n`;
  const workflowSection = `\n## 测试流程完成度\n\n- 流程状态：**${result.workflow?.status || '未评估'}**\n- 下一步：${result.workflow?.nextAction || '需人工确认。'}\n${(result.workflow?.steps || []).map((step) => `- ${step.status.toUpperCase()}｜${step.label}：${step.evidence}`).join('\n')}\n`;
  const metadataSection = `\n## 测试执行与溯源字段\n\n${Object.entries(config.testMetadata || {}).map(([field, value]) => `- ${field}：${String(value || '未填写').replace(/\r?\n/g, '；')}`).join('\n') || '- 当前未填写测试元数据。'}\n`;
  const performanceSection = `\n## 性能测量摘要\n\n- 产氢量：${metrics.hydrogenVolumeNl?.toFixed(3) ?? '—'} NL\n- 电能消耗：${metrics.energyConsumedWh?.toFixed(3) ?? '—'} Wh\n- 单位制氢电耗：${metrics.specificEnergyKWhPerNm3?.toFixed(3) ?? '—'} kWh/Nm³\n- 最低氢气纯度：${metrics.minimumHydrogenPurityPct?.toFixed(3) ?? '—'}%${metrics.minimumHydrogenPurityAtS?.length ? `（t=${metrics.minimumHydrogenPurityAtS.slice(0, 3).join('、')} s）` : ''}\n- profile 要求的性能测量缺失：${result.compliance?.missingMeasurements?.join('、') || '无'}\n`;
  const comparisonSection = `${complianceSection}${workflowSection}${performanceSection}${metadataSection}${options.comparison ? `\n${comparisonMarkdown(options.comparison)}` : ''}${options.aiDraft?.draft ? `\n\n## AI 报告草稿（${options.aiDraft.mode === 'remote-llm' ? '远程模型' : '本地证据模式'}）\n\n${options.aiDraft.draft}\n\n- fallbackReason：${options.aiDraft.fallbackReason ?? '无'}\n` : ''}`;
  const profileName = config.profileName ?? '未指定设备模板';
  const profileSource = config.profileSource ?? '当前分析配置';
  return `# 氢能设备测试自动报告\n\n- 数据文件：${fileName}\n- 自动判定：**${status}（${verdict}）**\n- 生成时间：${result.generatedAt}\n- 说明：本报告使用可配置的演示阈值，不替代企业正式安全标准。\n\n## 结论摘要\n\n${narrative}\n\n## 数据质量与字段映射\n\n- 记录数：${quality.rowCount}\n- 关键字段完整率：${quality.completenessPct.toFixed(1)}%\n- 缺失字段：${quality.missingHeaders.length ? quality.missingHeaders.join('、') : '无'}\n- 可选缺失字段：${quality.missingOptionalHeaders.length ? quality.missingOptionalHeaders.join('、') : '无'}\n- 字段映射：${mappings || '无'}\n- 单位换算：${conversions}\n- 重复时间戳：${quality.duplicateTimestampCount} 条；逆序跳变：${quality.nonMonotonicCount} 次\n\n## KPI 摘要\n\n| 指标 | 数值 |\n|---|---:|\n| 测试时长 | ${metrics.durationS.toFixed(0)} s |\n| 峰值功率 | ${metrics.peakPowerW?.toFixed(1) ?? '—'} W |\n| 稳态窗口 | ${metrics.steadyWindow}（${metrics.steadySampleCount} 条） |\n| 稳态平均电压 | ${metrics.steadyVoltageMeanV?.toFixed(3) ?? '—'} V |\n| 稳态电压标准差 | ${metrics.steadyVoltageStdV?.toFixed(3) ?? '—'} V |\n| 峰值温度 | ${metrics.peakTemperatureC?.toFixed(1) ?? '—'} °C |\n| 峰值压力 | ${metrics.peakPressureBar?.toFixed(1) ?? '—'} bar |\n| 峰值泄漏监测 | ${metrics.peakLeakPpm?.toFixed(1) ?? '—'} ppm |\n| 压力漂移 | ${metrics.pressureDriftBarPerMin.toFixed(2)} bar/min |\n\n## 异常与建议\n\n${issues.map((item) => `- **${item.severity.toUpperCase()}｜${item.title}**：${item.evidence}。建议：${item.recommendation}`).join('\n')}\n\n## 工况分段\n\n${phases.map((phase) => `- ${phase.phase}：${phase.count} 个样本，${phase.durationS.toFixed(0)} s`).join('\n')}\n\n## 当前判定阈值\n\n- 设备模板：${profileName}\n- 阈值来源：${profileSource}\n- 温度 ≤ ${config.maxTemperatureC} °C\n- 压力 ≤ ${config.maxPressureBar} bar\n- 泄漏监测 ≤ ${config.maxLeakPpm} ppm\n- 稳态电压标准差 ≤ ${config.maxVoltageStdV} V\n- 压力漂移绝对值 ≤ ${config.maxPressureDriftBarPerMin} bar/min\n${comparisonSection}`;
}
