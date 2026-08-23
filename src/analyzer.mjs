import { comparisonMarkdown } from './compare.mjs';
import { analyzeEnterpriseRows } from './enterprise-adapters.mjs';
import { analyzeSetpointEvents } from './dynamic-events.mjs';
import { EVALUATION_MODES, approvalEvidenceReadiness, fullMethodProfileReadiness, methodImplementationEvidenceReadiness } from './profiles.mjs';
import { efficiencyReadiness, environmentConditionReadiness, measurementMethodReadiness, phaseResultReadiness, testConditionReadiness, testStageReadiness, testStageReadinessForId, testSystemReadiness } from './structured-evidence.mjs';

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

export const OPTIONAL_FIELDS = Object.freeze([
  'phase', 'hydrogen_purity_pct', 'gas_temperature_c', 'gas_pressure_bar',
  'ambient_temperature_c', 'ambient_humidity_pct', 'ambient_pressure_kpa', 'power_w', 'power_setpoint_w'
]);

const ADDITIONAL_STANDARD_FIELDS = Object.freeze([
  'gas_temperature_c', 'gas_pressure_bar', 'ambient_temperature_c',
  'ambient_humidity_pct', 'ambient_pressure_kpa', 'power_w', 'power_setpoint_w'
]);

const PHASE_METRIC_FIELDS = Object.freeze([
  'durationS', 'energyConsumedWh', 'hydrogenVolumeNl', 'specificEnergyKWhPerNm3',
  'powerRangeW', 'maxRampUpWPerS', 'maxRampDownWPerS', 'peakPowerW',
  'minimumPowerW', 'maximumPowerW', 'validDataCoveragePct'
]);

const DESCRIPTIVE_DECISION_CODES = new Set([
  'ALL_CLEAR',
  'TEMP_HIGH',
  'PRESSURE_HIGH',
  'LEAK_HIGH',
  'PURITY_LOW',
  'SPECIFIC_ENERGY_HIGH',
  'VOLTAGE_UNSTABLE',
  'PRESSURE_DRIFT',
  'DURABILITY_REPORT_FAIL',
  'DURABILITY_DEVIATION_HIGH',
  'DURABILITY_CELL_VOLTAGE_LOW',
  'VEHICLE_TARGETS_MISSING',
  'STACK_TARGET_PARAMETERS_MISSING',
  'SHORT_STABLE_WINDOW',
  'STABLE_WINDOW_MISSING'
]);

function applyEvaluationMode(result) {
  const mode = result?.config?.evaluationMode || 'risk_screening';
  if (!EVALUATION_MODES.includes(mode) || mode !== 'descriptive_only') return result;
  const originalVerdict = result.verdict;
  const decisionIssues = (result.issues || []).filter((item) => DESCRIPTIVE_DECISION_CODES.has(item.code));
  const issues = (result.issues || []).map((item) => DESCRIPTIVE_DECISION_CODES.has(item.code)
    ? {
      ...item,
      severity: 'info',
      category: 'descriptive_observation',
      title: `描述性观察：${item.title}`,
      recommendation: `${item.recommendation} 当前 profile 为 descriptive_only，不执行阈值或验收判定。`
    }
    : item);
  if (!issues.length) issues.push({ severity: 'info', code: 'DESCRIPTIVE_ONLY', category: 'evaluation_boundary', title: '仅完成描述性分析', evidence: '已输出字段映射、数据质量、统计指标、趋势和证据；未执行阈值或验收判定。', recommendation: '如需风险筛查或正式验收，请导入企业批准的 risk_screening/acceptance profile。' });
  return {
    ...result,
    config: { ...result.config, evaluationMode: mode },
    evaluation: {
      mode,
      decisionStatus: 'NOT_RUN',
      thresholdEvaluation: 'NOT_RUN',
      acceptanceEvaluation: 'NOT_RUN',
      originalVerdict,
      decisionIssueCount: decisionIssues.length,
      dataQualityStatus: result.quality?.usable === false ? 'BLOCKED' : 'OBSERVED'
    },
    issues,
    verdict: 'DESCRIPTIVE',
    narrative: '已完成描述性字段映射、数据质量、统计指标、趋势和证据整理；当前 profile 未执行阈值、报警或验收判定，不得据此作通过/失败或放行结论。',
    workflow: {
      ...(result.workflow || {}),
      status: 'DESCRIPTIVE_ONLY',
      nextAction: '当前仅供工程师描述性复核；如需风险筛查或正式验收，请导入企业批准 profile。',
      steps: (result.workflow?.steps || []).map((step) => step.id === 'risk'
        ? { ...step, status: 'not_applicable', evidence: 'descriptive_only：未执行风险阈值或验收判定' }
        : step)
    }
  };
}

export const FIELD_ALIASES = Object.freeze({
  timestamp_s: ['timestamp_s', 'timestamp', 'time_s', 'time', '时间戳', '时间'],
  phase: ['phase', 'stage', 'state', '工况', '阶段', '状态'],
  current_a: ['current_a', 'current', 'i_a', 'i', '电流'],
  voltage_v: ['voltage_v', 'voltage', 'u_v', 'u', '电压'],
  power_w: ['power_w', 'power', 'electrical_power', 'input_power', 'power_kw', '电功率', '输入功率', '功率'],
  temperature_c: ['temperature_c', 'temperature', 'temp_c', 'temp', '温度'],
  pressure_bar: ['pressure_bar', 'pressure', 'p_bar', 'p', '压力'],
  flow_slpm: ['flow_slpm', 'flow', 'flow_rate', '流量'],
  leak_ppm: ['leak_ppm', 'leak', 'leakage', 'hydrogen_leak', '泄漏', '泄漏监测'],
  hydrogen_purity_pct: ['hydrogen_purity_pct', 'hydrogen_purity', 'purity_pct', 'purity', 'h2_purity', '氢气纯度', '纯度'],
  gas_temperature_c: ['gas_temperature_c', 'hydrogen_temperature_c', 'h2_temperature_c', 'gas_temperature', 'hydrogen_temperature', '出口气体温度', '氢气温度', '产氢温度'],
  gas_pressure_bar: ['gas_pressure_bar', 'hydrogen_pressure_bar', 'h2_pressure_bar', 'gas_pressure', 'hydrogen_pressure', '出口压力', '氢气压力', '产氢压力'],
  ambient_temperature_c: ['ambient_temperature_c', 'ambient_temperature', 'room_temperature', 'environment_temperature', '环境温度', '环境温度(°C)'],
  ambient_humidity_pct: ['ambient_humidity_pct', 'ambient_humidity', 'relative_humidity', 'humidity', '环境湿度', '相对湿度', '湿度'],
  ambient_pressure_kpa: ['ambient_pressure_kpa', 'ambient_pressure', 'atmospheric_pressure', 'barometric_pressure', '环境压力', '大气压', '气压'],
  power_setpoint_w: ['power_setpoint_w', 'power_setpoint', 'target_power_w', 'command_power_w', '功率设定值', '设定功率', '目标功率'],
  efficiency_pct: ['efficiency_pct', 'efficiency', 'system_efficiency', 'efficiency_percent', '效率', '系统效率', '能效']
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

const parseCSVLine = (line, delimiter = ',') => {
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { values.push(value); value = ''; }
    else value += char;
  }
  values.push(value);
  return values;
};

export function parseCSV(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const delimiter = (lines[0].match(/\t/g) || []).length > (lines[0].match(/,/g) || []).length ? '\t' : ',';
  const headers = parseCSVLine(lines[0], delimiter).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line, delimiter);
    return headers.reduce((row, header, index) => {
      row[header] = (values[index] ?? '').trim();
      return row;
    }, {});
  });
}

const normalizeHeader = (header) => String(header ?? '').toLowerCase().replaceAll('³', '3').replaceAll('²', '2').replace(/[\s_\-/.%()（）()[\]{}]/g, '');

const headerMatches = (header, alias) => {
  const normalizedHeader = normalizeHeader(header);
  const normalizedAlias = normalizeHeader(alias);
  return normalizedHeader === normalizedAlias || (normalizedAlias.length >= 2 && normalizedHeader.includes(normalizedAlias));
};

const HEADER_ROLE_EXCLUSIONS = Object.freeze({
  power_w: ['setpoint', 'target', 'command', '设定', '目标', '指令'],
  power_setpoint_w: ['actual', 'measured', '实测', '实际', '输出'],
  temperature_c: ['gas', 'hydrogen', 'ambient', 'environment', '出口', '产氢', '环境'],
  gas_temperature_c: ['ambient', 'environment', '环境'],
  ambient_temperature_c: ['gas', 'hydrogen', '出口', '产氢'],
  pressure_bar: ['gas', 'hydrogen', 'ambient', 'environment', '出口', '产氢', '环境'],
  gas_pressure_bar: ['ambient', 'environment', '环境'],
  ambient_pressure_kpa: ['gas', 'hydrogen', '出口', '产氢']
});

function headerRoleCompatible(field, header) {
  const raw = String(header ?? '').toLowerCase();
  return !(HEADER_ROLE_EXCLUSIONS[field] || []).some((token) => raw.includes(token));
}

function schemaHeaderCandidates(field, headers, explicitHeader) {
  const aliases = FIELD_ALIASES[field] || [field];
  const eligible = headers.filter((header) => headerRoleCompatible(field, header));
  const normalizedField = normalizeHeader(field);
  const normalizedAliases = aliases.map(normalizeHeader);
  const exactCanonical = eligible.filter((header) => normalizeHeader(header) === normalizedField);
  if (exactCanonical.length) return exactCanonical;
  const exactAlias = eligible.filter((header) => normalizedAliases.includes(normalizeHeader(header)));
  if (exactAlias.length) return exactAlias;
  return eligible.filter((header) => aliases.some((alias) => headerMatches(header, alias)));
}

function unitTransform(field, header) {
  const normalized = normalizeHeader(header);
  if (field === 'timestamp_s') {
    if (normalized.includes('ms') || normalized.includes('毫秒')) return { mode: 'scale', factor: 0.001, label: 'ms→s' };
    if (normalized.includes('min') || normalized.includes('分钟')) return { mode: 'scale', factor: 60, label: 'min→s' };
  }
  if (field === 'current_a' && (normalized.includes('ma') || normalized.includes('毫安'))) return { mode: 'scale', factor: 0.001, label: 'mA→A' };
  if (field === 'voltage_v' && (normalized.includes('mv') || normalized.includes('毫伏'))) return { mode: 'scale', factor: 0.001, label: 'mV→V' };
  if (field === 'power_w' || field === 'power_setpoint_w') {
    if (normalized.includes('kw') || normalized.includes('千瓦')) return { mode: 'scale', factor: 1000, label: 'kW→W' };
  }
  if (field === 'pressure_bar') {
    if (normalized.includes('kpa') || normalized.includes('千帕')) return { mode: 'scale', factor: 0.01, label: 'kPa→bar' };
    if (normalized.includes('mpa') || normalized.includes('兆帕')) return { mode: 'scale', factor: 10, label: 'MPa→bar' };
    if (normalized.endsWith('pa') || normalized.includes('帕')) return { mode: 'scale', factor: 0.00001, label: 'Pa→bar' };
  }
  if (field === 'gas_pressure_bar') {
    if (normalized.includes('kpa') || normalized.includes('千帕')) return { mode: 'scale', factor: 0.01, label: 'kPa→bar' };
    if (normalized.includes('mpa') || normalized.includes('兆帕')) return { mode: 'scale', factor: 10, label: 'MPa→bar' };
    if (normalized.endsWith('pa') || normalized.includes('帕')) return { mode: 'scale', factor: 0.00001, label: 'Pa→bar' };
  }
  if (field === 'ambient_pressure_kpa') {
    if (normalized.includes('mpa') || normalized.includes('兆帕')) return { mode: 'scale', factor: 1000, label: 'MPa→kPa' };
    if (normalized.includes('bar')) return { mode: 'scale', factor: 100, label: 'bar→kPa' };
    if (normalized.endsWith('pa') || normalized.includes('帕')) return { mode: 'scale', factor: 0.001, label: 'Pa→kPa' };
  }
  if (field === 'flow_slpm' && (normalized.includes('m3h') || normalized.includes('nm3h') || normalized.includes('立方米每小时'))) return { mode: 'scale', factor: 1000 / 60, label: 'm³/h→SLPM' };
  if (field === 'leak_ppm' && (normalized.includes('ppb') || normalized.includes('十亿'))) return { mode: 'scale', factor: 0.001, label: 'ppb→ppm' };
  if (['temperature_c', 'gas_temperature_c', 'ambient_temperature_c'].includes(field) && (normalized.includes('fahrenheit') || normalized.includes('华氏') || normalized.endsWith('f'))) return { mode: 'fahrenheit_to_c', factor: 1, label: '°F→°C' };
  return { mode: 'identity', factor: 1, label: '原单位' };
}

function resolveSchema(inputRows, explicitMapping = {}) {
  const headers = [...new Set(inputRows.flatMap((row) => Object.keys(row)))];
  const mapping = {};
  const conversions = {};
  const missingHeaders = [];
  const missingOptionalHeaders = [];
  const mappingWarnings = [];
  for (const field of [...REQUIRED_FIELDS, ...ADDITIONAL_STANDARD_FIELDS]) {
    const explicitHeader = explicitMapping[field];
    if (explicitHeader && !headers.includes(explicitHeader)) mappingWarnings.push(`${field} 配置表头“${explicitHeader}”未在输入文件中找到，已尝试通用别名回退`);
    const candidates = explicitHeader && headers.includes(explicitHeader)
      ? [explicitHeader]
      : schemaHeaderCandidates(field, headers, explicitHeader);
    const sourceHeader = candidates[0];
    if (!sourceHeader) {
      (OPTIONAL_FIELDS.includes(field) ? missingOptionalHeaders : missingHeaders).push(field);
      continue;
    }
    if (candidates.length > 1) mappingWarnings.push(`${field} 存在多个候选表头（${candidates.join('、')}），已选择“${sourceHeader}”；请确认企业字段映射。`);
    mapping[field] = sourceHeader;
    conversions[field] = unitTransform(field, sourceHeader);
  }
  const efficiencyExplicitHeader = explicitMapping.efficiency_pct;
  const efficiencySourceHeader = efficiencyExplicitHeader && headers.includes(efficiencyExplicitHeader)
    ? efficiencyExplicitHeader
    : headers.find((header) => headerMatches(header, 'efficiency_pct'))
      ?? headers.find((header) => FIELD_ALIASES.efficiency_pct.some((alias) => headerMatches(header, alias)));
  if (efficiencySourceHeader) {
    mapping.efficiency_pct = efficiencySourceHeader;
    conversions.efficiency_pct = unitTransform('efficiency_pct', efficiencySourceHeader);
  }
  return {
    headers,
    mapping,
    conversions,
    missingHeaders,
    missingOptionalHeaders,
    mappingWarnings,
    mappedCount: Object.keys(mapping).length,
    fieldCount: REQUIRED_FIELDS.length,
    optionalFieldCount: ADDITIONAL_STANDARD_FIELDS.length
  };
}

function convertValue(rawValue, transform) {
  const value = number(rawValue);
  if (value === null) return null;
  if (transform?.mode === 'fahrenheit_to_c') return (value - 32) * (5 / 9);
  return value * (transform?.factor ?? 1);
}

const slopePerMinute = (rows, field) => {
  const bySession = new Map();
  rows.forEach((row) => {
    if (row.timestamp_s === null || row[field] === null) return;
    const key = sessionKey(row);
    const points = bySession.get(key) || [];
    points.push([row.timestamp_s, row[field]]);
    bySession.set(key, points);
  });
  const fits = [...bySession.values()].map((points) => {
    if (points.length < 2) return null;
    const xMean = mean(points.map(([x]) => x));
    const yMean = mean(points.map(([, y]) => y));
    const numerator = points.reduce((sum, [x, y]) => sum + (x - xMean) * (y - yMean), 0);
    const denominator = points.reduce((sum, [x]) => sum + (x - xMean) ** 2, 0);
    if (!denominator) return null;
    return { slopePerMinute: (numerator / denominator) * 60, spanS: Math.max(...points.map(([x]) => x)) - Math.min(...points.map(([x]) => x)) };
  }).filter(Boolean);
  if (!fits.length) return 0;
  const weight = fits.reduce((sum, fit) => sum + Math.max(fit.spanS, 1), 0);
  return fits.reduce((sum, fit) => sum + fit.slopePerMinute * Math.max(fit.spanS, 1), 0) / weight;
};

function sessionKey(row) {
  if (row?.session_id !== undefined && row?.session_id !== null) return `session:${row.session_id}`;
  if (row?.source_file !== undefined && row?.source_file !== null) return `file:${row.source_file}`;
  return '__single_session__';
}

function sameSession(previous, current) {
  return sessionKey(previous) === sessionKey(current);
}

function sessionDurationSummary(rows) {
  const spans = new Map();
  rows.forEach((row) => {
    if (row.timestamp_s === null) return;
    const key = sessionKey(row);
    const span = spans.get(key) || { min: row.timestamp_s, max: row.timestamp_s };
    span.min = Math.min(span.min, row.timestamp_s);
    span.max = Math.max(span.max, row.timestamp_s);
    spans.set(key, span);
  });
  const durations = [...spans.values()].map((span) => Math.max(0, span.max - span.min));
  return { sessionCount: spans.size, totalDurationS: durations.reduce((sum, duration) => sum + duration, 0), durations };
}

function phaseSummary(rows) {
  const groups = [];
  for (const row of rows) {
    const phase = row.phase || '未标注';
    const last = groups.at(-1);
    const currentSession = sessionKey(row);
    if (!last || last.phase !== phase || last.sessionKey !== currentSession) groups.push({ phase, sessionKey: currentSession, count: 1, start: row.timestamp_s, end: row.timestamp_s });
    else { last.count += 1; last.end = row.timestamp_s; }
  }
  return groups.map((group) => ({
    phase: group.phase,
    sessionId: group.sessionKey === '__single_session__' ? null : group.sessionKey,
    count: group.count,
    startS: group.start,
    endS: group.end,
    durationS: group.start !== null && group.end !== null ? Math.max(0, group.end - group.start) : 0
  }));
}

function issue(severity, code, title, evidence, recommendation) {
  return { severity, code, title, evidence, recommendation };
}

const median = (values) => {
  const sorted = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function qualityReport(rows, schema, config = {}) {
  const missingHeaders = schema.missingHeaders;
  const invalidValueCounts = Object.fromEntries([
    'timestamp_s', ...ANALYZED_NUMERIC_FIELDS
  ].map((field) => [field, rows.filter((row) => row[field] === null).length]));
  const timestampEntries = rows.map((row) => ({ row, timestamp: row.timestamp_s })).filter(({ timestamp }) => timestamp !== null);
  const duplicateTimestampCount = timestampEntries.length - new Set(timestampEntries.map(({ row, timestamp }) => `${sessionKey(row)}:${timestamp}`)).size;
  const timestampDeltas = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (!sameSession(previous, current) || previous.timestamp_s === null || current.timestamp_s === null) continue;
    timestampDeltas.push(current.timestamp_s - previous.timestamp_s);
  }
  const nonMonotonicCount = timestampDeltas.filter((delta) => delta < 0).length;
  const nonPositiveIntervalCount = timestampDeltas.filter((delta) => delta <= 0).length;
  const positiveIntervals = timestampDeltas.filter((delta) => delta > 0);
  const medianIntervalS = median(positiveIntervals);
  const plannedSamplingFrequencyHz = Number(config.testMetadata?.acquisitionRecord?.samplingFrequencyHz);
  const plannedIntervalS = Number.isFinite(plannedSamplingFrequencyHz) && plannedSamplingFrequencyHz > 0 ? 1 / plannedSamplingFrequencyHz : null;
  const effectiveSamplingFrequencyHz = medianIntervalS ? 1 / medianIntervalS : null;
  const samplingIntervalDeviationPct = plannedIntervalS && medianIntervalS !== null
    ? ((medianIntervalS - plannedIntervalS) / plannedIntervalS) * 100
    : null;
  const dataQualityRequirements = config.dataQualityRequirements && typeof config.dataQualityRequirements === 'object'
    ? config.dataQualityRequirements
    : {};
  const configuredMaxIntervalS = Number(dataQualityRequirements.maxIntervalS);
  const intervalMultiplier = Number(dataQualityRequirements.maxIntervalMultiplier);
  const gapLimitS = Number.isFinite(configuredMaxIntervalS) && configuredMaxIntervalS > 0
    ? configuredMaxIntervalS
    : Number.isFinite(intervalMultiplier) && intervalMultiplier > 0 && plannedIntervalS !== null
      ? plannedIntervalS * intervalMultiplier
      : null;
  const samplingGapCount = gapLimitS === null ? null : positiveIntervals.filter((delta) => delta > gapLimitS).length;
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
    nonPositiveIntervalCount,
    observedIntervalCount: positiveIntervals.length,
    minimumIntervalS: positiveIntervals.length ? Math.min(...positiveIntervals) : null,
    maximumIntervalS: positiveIntervals.length ? Math.max(...positiveIntervals) : null,
    medianIntervalS,
    plannedSamplingFrequencyHz: plannedSamplingFrequencyHz > 0 ? plannedSamplingFrequencyHz : null,
    plannedIntervalS,
    effectiveSamplingFrequencyHz,
    samplingIntervalDeviationPct,
    gapLimitS,
    samplingGapCount,
    missingCells,
    totalCells,
    completenessPct: totalCells ? ((totalCells - missingCells) / totalCells) * 100 : 0,
    hasEnoughRows: rows.length >= 2,
    usable: rows.length >= 2 && missingHeaders.length === 0 && invalidValueCounts.timestamp_s === 0
  };
}

const isSteadyPhase = (phase) => ['steady', 'stabilized', 'stable', '稳态', '稳定', '恒定'].includes(String(phase || '').trim().toLowerCase());

const normalizePhaseToken = (phase) => String(phase ?? '').trim().toLowerCase().replace(/[\s_\-（）()]/g, '');

function electricalPower(row) {
  if (row?.power_w !== null && Number.isFinite(row?.power_w)) return row.power_w;
  return row?.current_a !== null && row?.voltage_v !== null ? row.current_a * row.voltage_v : null;
}

function powerCrossCheck(rows) {
  const rawRows = rows.filter((row) => row.power_w !== null);
  const comparable = rawRows.filter((row) => row.current_a !== null && row.voltage_v !== null);
  const differences = comparable.map((row) => Math.abs(row.power_w - row.current_a * row.voltage_v));
  const relativeDifferences = comparable
    .map((row) => Math.abs(row.power_w - row.current_a * row.voltage_v) / Math.max(Math.abs(row.power_w), Math.abs(row.current_a * row.voltage_v), 1e-12) * 100);
  return {
    rawPowerCount: rawRows.length,
    derivedPowerCount: rows.filter((row) => row.power_w === null && row.current_a !== null && row.voltage_v !== null).length,
    comparableCount: comparable.length,
    maxAbsoluteDifferenceW: differences.length ? Math.max(...differences) : null,
    maxRelativeDifferencePct: relativeDifferences.length ? Math.max(...relativeDifferences) : null,
    status: rawRows.length ? (comparable.length ? 'checked' : 'raw_only') : 'derived_only',
    evidence: rawRows.length
      ? comparable.length ? '原始电功率通道已记录，并与电压×电流做独立交叉核算；未配置一致性限值，不自动判定合格。' : '已记录原始电功率通道，但电压或电流不可用于交叉核算。'
      : '未提供原始电功率通道；当前功率/能耗仅由电压×电流派生。'
  };
}

function phaseCoverageReport(config, rows, maxIntervalS = null) {
  const present = new Map();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const raw = String(row.phase || '').trim();
    if (!raw || raw === '未标注') continue;
    const token = normalizePhaseToken(raw);
    for (const required of config.requiredPhases || []) {
      const aliases = [required, ...(config.phaseAliases?.[required] || [])].map(normalizePhaseToken);
      if (!aliases.includes(token)) continue;
      const current = present.get(required) || { id: required, indexes: [], labels: new Set() };
      current.indexes.push(index);
      current.labels.add(raw);
      present.set(required, current);
    }
  }
  const required = (config.requiredPhases || []).map((id) => {
    const item = present.get(id);
    const indexes = item?.indexes || [];
    const timestamps = indexes.map((index) => rows[index].timestamp_s).filter((value) => value !== null);
    let durationS = 0;
    let validSegmentCount = 0;
    let interruptedSegmentCount = 0;
    let nonPositiveIntervalCount = 0;
    for (let position = 1; position < indexes.length; position += 1) {
      const previousIndex = indexes[position - 1];
      const currentIndex = indexes[position];
      if (currentIndex !== previousIndex + 1 || !sameSession(rows[previousIndex], rows[currentIndex])) { interruptedSegmentCount += 1; continue; }
      const deltaS = rows[currentIndex].timestamp_s !== null && rows[previousIndex].timestamp_s !== null
        ? rows[currentIndex].timestamp_s - rows[previousIndex].timestamp_s
        : 0;
      if (deltaS <= 0) { nonPositiveIntervalCount += 1; continue; }
      if (maxIntervalS !== null && deltaS > maxIntervalS) { interruptedSegmentCount += 1; continue; }
      durationS += deltaS;
      validSegmentCount += 1;
    }
    const startS = timestamps.length ? Math.min(...timestamps) : null;
    const endS = timestamps.length ? Math.max(...timestamps) : null;
    const spanS = startS !== null && endS !== null ? Math.max(0, endS - startS) : null;
    return {
      id,
      count: indexes.length,
      startS,
      endS,
      durationS: indexes.length ? durationS : 0,
      validSegmentCount,
      interruptedSegmentCount,
      nonPositiveIntervalCount,
      validDataCoveragePct: spanS && spanS > 0 ? (durationS / spanS) * 100 : indexes.length >= 2 ? 100 : null,
      labels: item ? [...item.labels] : []
    };
  });
  return { required, missing: required.filter((item) => item.count === 0).map((item) => item.id) };
}

function phaseMetricReport(config, rows, maxIntervalS = null) {
  const requirements = config.requiredPhaseMetrics && typeof config.requiredPhaseMetrics === 'object' ? config.requiredPhaseMetrics : {};
  const phaseIds = [...new Set([...(config.requiredPhases || []), ...Object.keys(requirements)])];
  const phases = {};
  const missing = [];
  for (const phaseId of phaseIds) {
    const aliases = [phaseId, ...(config.phaseAliases?.[phaseId] || [])].map(normalizePhaseToken);
    const indexes = rows.map((row, index) => ({ row, index })).filter(({ row }) => aliases.includes(normalizePhaseToken(row.phase))).map(({ index }) => index);
    const powerValues = indexes.map((index) => electricalPower(rows[index])).filter((value) => value !== null);
    const maxPower = powerValues.length ? Math.max(...powerValues) : null;
    const minPower = powerValues.length ? Math.min(...powerValues) : null;
    let durationS = 0;
    let energyConsumedWh = 0;
    let hydrogenVolumeNl = 0;
    let validSegments = 0;
    let interruptedSegmentCount = 0;
    let nonPositiveIntervalCount = 0;
    let skippedGapCount = 0;
    let skippedSessionBoundaryCount = 0;
    const rampRates = [];
    for (let position = 1; position < indexes.length; position += 1) {
      const previousIndex = indexes[position - 1];
      const currentIndex = indexes[position];
      if (currentIndex !== previousIndex + 1) { interruptedSegmentCount += 1; continue; }
      if (!sameSession(rows[previousIndex], rows[currentIndex])) { interruptedSegmentCount += 1; skippedSessionBoundaryCount += 1; continue; }
      const previous = rows[previousIndex];
      const current = rows[currentIndex];
      const deltaS = current.timestamp_s !== null && previous.timestamp_s !== null ? current.timestamp_s - previous.timestamp_s : 0;
      if (deltaS <= 0) { nonPositiveIntervalCount += 1; continue; }
      if (maxIntervalS !== null && deltaS > maxIntervalS) { interruptedSegmentCount += 1; skippedGapCount += 1; continue; }
      durationS += deltaS;
      validSegments += 1;
      const previousPower = electricalPower(previous);
      const currentPower = electricalPower(current);
      if (previousPower !== null && currentPower !== null) {
        energyConsumedWh += ((previousPower + currentPower) / 2) * deltaS / 3600;
        rampRates.push((currentPower - previousPower) / deltaS);
      }
      if (previous.flow_slpm !== null && current.flow_slpm !== null) hydrogenVolumeNl += ((previous.flow_slpm + current.flow_slpm) / 2) * deltaS / 60;
    }
    const completeTime = validSegments > 0 && interruptedSegmentCount === 0 && nonPositiveIntervalCount === 0;
    const completeEnergy = completeTime && indexes.every((index) => electricalPower(rows[index]) !== null);
    const completeVolume = completeTime && indexes.every((index) => rows[index].flow_slpm !== null);
    const phase = {
      phaseId,
      labels: [...new Set(indexes.map((index) => String(rows[index].phase || '未标注')))],
      sampleCount: indexes.length,
      validSegments,
      interruptedSegmentCount,
      nonPositiveIntervalCount,
      startS: indexes.length ? rows[indexes[0]].timestamp_s : null,
      endS: indexes.length ? rows[indexes.at(-1)].timestamp_s : null,
      durationS: validSegments ? durationS : null,
      energyConsumedWh: completeEnergy ? energyConsumedWh : null,
      hydrogenVolumeNl: completeVolume ? hydrogenVolumeNl : null,
      specificEnergyKWhPerNm3: null,
      integrationStatus: completeEnergy && completeVolume ? 'complete' : indexes.length < 2 ? 'insufficient' : skippedGapCount ? 'partial_gap' : skippedSessionBoundaryCount ? 'partial_session_boundary' : !completeTime ? 'partial_interrupted' : 'partial_input',
      skippedGapCount,
      skippedSessionBoundaryCount,
      powerRangeW: maxPower !== null && minPower !== null ? maxPower - minPower : null,
      maxRampUpWPerS: rampRates.length ? Math.max(0, ...rampRates) : null,
      maxRampDownWPerS: rampRates.length ? Math.max(0, ...rampRates.map((rate) => -rate)) : null,
      peakPowerW: maxPower,
      minimumPowerW: minPower,
      maximumPowerW: maxPower,
      validDataCoveragePct: indexes.length >= 2 && rows[indexes[0]].timestamp_s !== null && rows[indexes.at(-1)].timestamp_s !== null && rows[indexes.at(-1)].timestamp_s > rows[indexes[0]].timestamp_s
        ? (durationS / (rows[indexes.at(-1)].timestamp_s - rows[indexes[0]].timestamp_s)) * 100
        : indexes.length >= 2 ? 100 : null
    };
    if (phase.energyConsumedWh !== null && phase.hydrogenVolumeNl !== null && phase.hydrogenVolumeNl > 0) phase.specificEnergyKWhPerNm3 = phase.energyConsumedWh / phase.hydrogenVolumeNl * 1000;
    phases[phaseId] = phase;
    for (const metric of requirements[phaseId] || []) {
      if (!Number.isFinite(phase[metric])) missing.push(`${phaseId}.${metric}`);
    }
  }
  return { required: requirements, phases, missing };
}

function dataQualityReadiness(config, quality, phaseCoverage = { required: [] }) {
  const requirements = config.dataQualityRequirements && typeof config.dataQualityRequirements === 'object' && !Array.isArray(config.dataQualityRequirements)
    ? config.dataQualityRequirements
    : {};
  const configured = Object.keys(requirements).length > 0;
  const missing = [];
  const failed = [];
  if (requirements.requireMonotonicTimestamps && quality.nonMonotonicCount > 0) failed.push(`nonMonotonicCount=${quality.nonMonotonicCount}`);
  if (requirements.requireUniqueTimestamps && quality.duplicateTimestampCount > 0) failed.push(`duplicateTimestampCount=${quality.duplicateTimestampCount}`);
  if (requirements.requirePositiveIntervals && quality.nonPositiveIntervalCount > 0) failed.push(`nonPositiveIntervalCount=${quality.nonPositiveIntervalCount}`);
  if (quality.samplingGapCount !== null && quality.samplingGapCount > 0) failed.push(`samplingGapCount=${quality.samplingGapCount}`);
  if (requirements.requirePlannedSamplingFrequency && quality.plannedSamplingFrequencyHz === null) missing.push('plannedSamplingFrequencyHz');
  const tolerancePct = Number(requirements.samplingRateTolerancePct);
  if (requirements.requireSamplingRateMatch) {
    if (quality.plannedIntervalS === null) missing.push('plannedSamplingFrequencyHz');
    else if (quality.samplingIntervalDeviationPct === null) missing.push('observedSamplingInterval');
    else if (Number.isFinite(tolerancePct) && Math.abs(quality.samplingIntervalDeviationPct) > tolerancePct) failed.push(`samplingIntervalDeviationPct=${quality.samplingIntervalDeviationPct.toFixed(3)}`);
  }
  const minCoveragePct = Number(requirements.minPhaseCoveragePct);
  const phaseCoverageFailures = Number.isFinite(minCoveragePct)
    ? phaseCoverage.required.filter((phase) => phase.count > 0 && (phase.validDataCoveragePct === null || phase.validDataCoveragePct < minCoveragePct)).map((phase) => `${phase.id}.validDataCoveragePct=${phase.validDataCoveragePct ?? '—'}`)
    : [];
  if (phaseCoverageFailures.length) failed.push(...phaseCoverageFailures);
  if (requirements.requireContiguousPhaseRows) {
    const interrupted = phaseCoverage.required.filter((phase) => phase.interruptedSegmentCount > 0).map((phase) => `${phase.id}.interruptedSegmentCount=${phase.interruptedSegmentCount}`);
    if (interrupted.length) failed.push(...interrupted);
  }
  const status = missing.length ? 'missing' : failed.length ? 'failed' : configured ? 'ready' : 'not_configured';
  const evidence = status === 'ready'
    ? `时间轴 ${quality.observedIntervalCount} 个正间隔；中位采样间隔 ${quality.medianIntervalS ?? '—'} s；阶段覆盖规则已核对`
    : status === 'not_configured'
      ? 'profile 未声明额外数据质量门控；系统仍保留观测指标供工程复核'
      : `数据质量门控未通过：${[...missing, ...failed].join('、')}`;
  return { required: configured, status, ready: status === 'ready' || status === 'not_configured', missing, failed, requirements, evidence };
}

function selectSteadyRows(rows) {
  const explicit = rows.filter((row) => isSteadyPhase(row.phase));
  if (explicit.length >= 2) return { rows: explicit, source: 'phase=steady' };
  const active = rows.filter((row) => row.current_a !== null && row.current_a > 0 && row.voltage_v !== null);
  const fallback = active.slice(Math.floor(active.length * 0.4));
  return { rows: fallback.length >= 2 ? fallback : rows, source: explicit.length ? 'phase=steady（样本不足，回退活动窗口）' : '活动窗口回退' };
}

function scopeReadiness(config) {
  const rules = config.scopeRules;
  if (!rules || typeof rules !== 'object') return { status: 'not_configured', ready: false, missing: ['scopeRules'], outOfScope: [], evidence: 'profile 未声明设备适用范围规则' };
  const metadata = config.testMetadata && typeof config.testMetadata === 'object' ? config.testMetadata : {};
  const missing = [];
  const outOfScope = [];
  const deviceFamily = String(metadata.deviceFamily || '').trim();
  if (rules.requiresDeviceFamily && !deviceFamily) missing.push('deviceFamily');
  const checks = [
    ['ratedHydrogenPressureMpa', 'requiresRatedHydrogenPressureMpa', 'maxRatedHydrogenPressureMpa'],
    ['ratedHydrogenProductionM3h', 'requiresRatedHydrogenProductionM3h', 'maxRatedHydrogenProductionM3h']
  ];
  for (const [field, requiredFlag, maxField] of checks) {
    if (!rules[requiredFlag]) continue;
    const value = Number(metadata[field]);
    if (!Number.isFinite(value)) { missing.push(field); continue; }
    if (Number.isFinite(Number(rules[`min${field[0].toUpperCase()}${field.slice(1)}`])) && value < Number(rules[`min${field[0].toUpperCase()}${field.slice(1)}`])) outOfScope.push(`${field}<${rules[`min${field[0].toUpperCase()}${field.slice(1)}`]}`);
    if (Number.isFinite(Number(rules[maxField])) && value > Number(rules[maxField])) outOfScope.push(`${field}>${rules[maxField]}`);
  }
  const status = outOfScope.length ? 'out_of_scope' : missing.length ? 'missing' : 'ready';
  return { status, ready: status === 'ready', missing, outOfScope, evidence: status === 'ready' ? '设备家族与额定范围已由当前会话元数据核对' : status === 'out_of_scope' ? `超出 profile 适用范围：${outOfScope.join('、')}` : `缺少适用范围字段：${missing.join('、')}` };
}

function instrumentReadiness(config) {
  const required = Array.isArray(config.instrumentRequirements) ? config.instrumentRequirements : [];
  if (!required.length) return { ready: false, status: 'not_configured', missing: ['instrumentRequirements'], malformed: [], evidence: 'profile 未声明仪器类别要求' };
  const records = config.testMetadata?.instrumentRecords;
  if (!Array.isArray(records)) return { ready: false, status: 'missing', missing: required, malformed: [], evidence: '缺少结构化 instrumentRecords；自由文本不能替代仪器/精度/校准证据' };
  const malformed = records.filter((record) => !record || typeof record !== 'object' || !String(record.id || '').trim() || !String(record.category || '').trim() || !String(record.accuracy || '').trim() || !String(record.calibrationRef || '').trim());
  const categories = new Set(records.flatMap((record) => Array.isArray(record.category) ? record.category : [record.category]).map((value) => String(value || '').trim()));
  const missing = required.filter((category) => !categories.has(category));
  const status = malformed.length ? 'malformed' : missing.length ? 'missing' : 'ready';
  return { ready: status === 'ready', status, missing, malformed: malformed.length, evidence: status === 'ready' ? `${records.length} 条结构化仪器记录覆盖 ${required.join('、')}` : missing.length ? `缺少仪器类别：${missing.join('、')}` : `${malformed.length} 条仪器记录缺少 id/category/accuracy/calibrationRef` };
}

const TRACEABILITY_VALUE_TYPES = new Set(['text', 'number', 'date', 'reference']);
const TRACEABILITY_DEFAULT_FIELDS = new Set(['testRunId', 'deviceId', 'testType', 'testDate', 'cellCount', 'activeAreaCm2', 'evidenceRef']);
const EDIT_LOG_DEFAULT_FIELDS = ['field', 'oldValueSummary', 'newValueSummary', 'operator', 'timestamp', 'reason'];

function nonEmptyMetadataValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function traceabilityInput(metadata) {
  const nested = metadata.traceability && typeof metadata.traceability === 'object' && !Array.isArray(metadata.traceability) ? metadata.traceability : {};
  return { ...Object.fromEntries([...TRACEABILITY_DEFAULT_FIELDS].filter((field) => nonEmptyMetadataValue(metadata[field])).map((field) => [field, metadata[field]])), ...nested };
}

function traceabilityReadiness(config) {
  const requirements = config.traceabilityRequirements && typeof config.traceabilityRequirements === 'object' && !Array.isArray(config.traceabilityRequirements) ? config.traceabilityRequirements : null;
  const fields = Array.isArray(requirements?.fields) ? requirements.fields : [];
  const required = Boolean(requirements && (requirements.required === true || fields.length || requirements.requireEvidenceRef === true));
  if (!required) return { required: false, ready: true, status: 'not_configured', missing: [], malformed: 0, requiredFieldCount: 0, observedFieldCount: 0, evidence: 'profile 未声明对象追溯字段要求' };
  const metadata = config.testMetadata && typeof config.testMetadata === 'object' ? config.testMetadata : {};
  const input = traceabilityInput(metadata);
  const missing = [];
  const malformed = [];
  for (const field of fields) {
    const id = String(field?.id || '').trim();
    const value = input[id];
    if (!nonEmptyMetadataValue(value)) { missing.push(id || '未命名字段'); continue; }
    const type = field?.valueType || 'text';
    if (type === 'number' && !Number.isFinite(Number(value))) malformed.push(id);
    if (type === 'date' && !/^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+\-Z]+)?$/.test(String(value).trim())) malformed.push(id);
  }
  if (requirements.requireEvidenceRef && !nonEmptyMetadataValue(input.evidenceRef)) missing.push('evidenceRef');
  const status = malformed.length ? 'malformed' : missing.length ? 'missing' : 'ready';
  return { required: true, ready: status === 'ready', status, missing, malformed, requiredFieldCount: fields.length + (requirements.requireEvidenceRef && !fields.some((field) => field?.id === 'evidenceRef') ? 1 : 0), observedFieldCount: Object.keys(input).filter((field) => nonEmptyMetadataValue(input[field])).length, evidence: status === 'ready' ? `${fields.length} 个对象追溯字段和证据引用已记录` : malformed.length ? `对象追溯字段格式错误：${malformed.join('、')}` : `对象追溯证据缺失：${missing.join('、')}` };
}

function editLogReadiness(config) {
  const requirements = config.editLogRequirements && typeof config.editLogRequirements === 'object' && !Array.isArray(config.editLogRequirements) ? config.editLogRequirements : null;
  const minEntries = Number.isInteger(Number(requirements?.minEntries)) ? Number(requirements.minEntries) : requirements?.required === true ? 1 : 0;
  const required = Boolean(requirements && (requirements.required === true || minEntries > 0 || requirements.requireEvidenceRef === true));
  if (!required) return { required: false, ready: true, status: 'not_configured', missing: [], malformed: 0, requiredEntryCount: 0, observedRecordCount: 0, validRecordCount: 0, evidence: 'profile 未声明人工修改审计记录要求' };
  const metadata = config.testMetadata && typeof config.testMetadata === 'object' ? config.testMetadata : {};
  const records = metadata.editLog;
  if (!Array.isArray(records)) return { required: true, ready: false, status: 'missing', missing: ['editLog'], malformed: 0, requiredEntryCount: minEntries, observedRecordCount: 0, validRecordCount: 0, evidence: '缺少结构化 editLog；不能用自由文本替代人工修改记录' };
  const entryFields = Array.isArray(requirements.entryFields) && requirements.entryFields.length ? requirements.entryFields : EDIT_LOG_DEFAULT_FIELDS;
  const missing = records.length < minEntries ? [`minEntries:${minEntries}`] : [];
  let malformed = 0;
  let validRecordCount = 0;
  for (const record of records) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) { malformed += 1; continue; }
    const missingFields = entryFields.filter((field) => !nonEmptyMetadataValue(record[field]));
    if (requirements.requireEvidenceRef && !nonEmptyMetadataValue(record.evidenceRef)) missingFields.push('evidenceRef');
    if (missingFields.length) malformed += 1;
    else validRecordCount += 1;
  }
  const status = malformed ? 'malformed' : missing.length ? 'missing' : 'ready';
  return { required: true, ready: status === 'ready', status, missing, malformed, requiredEntryCount: minEntries, observedRecordCount: records.length, validRecordCount, evidence: status === 'ready' ? `${validRecordCount} 条人工修改记录均含字段摘要、操作者、时间、原因和证据引用` : malformed ? `${malformed} 条人工修改记录缺少必填字段；只接受旧值/新值摘要，不接受未审计覆盖` : `人工修改记录数量不足：${records.length}/${minEntries}` };
}

function acquisitionReadiness(config) {
  const requirements = config.acquisitionRequirements && typeof config.acquisitionRequirements === 'object' && !Array.isArray(config.acquisitionRequirements)
    ? config.acquisitionRequirements
    : null;
  const requiredChannels = Array.isArray(requirements?.requiredChannels) ? requirements.requiredChannels : [];
  const required = Boolean(requirements && (requirements.requireSamplingFrequency || requirements.requireSynchronization || requirements.requireEvidenceRef || requiredChannels.length));
  if (!required) return { ready: true, required: false, status: 'not_configured', missing: [], unitMismatches: [], malformed: 0, requiredChannels: [], observedChannelCount: 0, evidence: 'profile 未声明结构化数据采集证据要求' };
  const record = config.testMetadata?.acquisitionRecord;
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { ready: false, required: true, status: 'missing', missing: ['acquisitionRecord'], unitMismatches: [], malformed: 0, requiredChannels, observedChannelCount: 0, evidence: '缺少结构化 acquisitionRecord；自由文本采集计划不能替代采样、同步和通道证据' };
  const missing = [];
  const unitMismatches = [];
  if (requirements.requireSamplingFrequency && (!Number.isFinite(Number(record.samplingFrequencyHz)) || Number(record.samplingFrequencyHz) <= 0)) missing.push('samplingFrequencyHz');
  if (requirements.requireSynchronization) {
    const synchronization = record.synchronization;
    if (!synchronization || typeof synchronization !== 'object' || Array.isArray(synchronization)) {
      missing.push('synchronization.status', 'synchronization.clockReference');
    } else {
      if (!String(synchronization.status || '').trim()) missing.push('synchronization.status');
      if (!String(synchronization.clockReference || '').trim()) missing.push('synchronization.clockReference');
    }
  }
  if (requirements.requireEvidenceRef && !String(record.evidenceRef || '').trim()) missing.push('evidenceRef');
  const channels = Array.isArray(record.channels) ? record.channels : [];
  const malformed = channels.filter((channel) => !channel || typeof channel !== 'object' || Array.isArray(channel) || !String(channel.field || '').trim() || !String(channel.channelId || '').trim() || !String(channel.unit || '').trim()).length;
  for (const requirement of requiredChannels) {
    const field = typeof requirement === 'string' ? requirement : requirement?.field;
    const expectedUnit = typeof requirement === 'object' ? String(requirement.unit || '').trim() : '';
    const channel = channels.find((candidate) => candidate && String(candidate.field || '').trim() === field);
    if (!channel) missing.push(`channel:${field}`);
    else if (expectedUnit && String(channel.unit || '').trim() !== expectedUnit) unitMismatches.push(`${field}:${String(channel.unit || '未提供')}≠${expectedUnit}`);
  }
  const status = malformed ? 'malformed' : missing.length || unitMismatches.length ? 'missing' : 'ready';
  const evidence = status === 'ready'
    ? `采样频率、同步时钟和 ${channels.length} 个通道均有结构化证据`
    : malformed
      ? `${malformed} 条采集通道记录缺少 field/channelId/unit`
      : `采集证据缺失：${[...missing, ...unitMismatches].join('、')}`;
  return { ready: status === 'ready', required: true, status, missing, unitMismatches, malformed, requiredChannels, observedChannelCount: channels.length, evidence };
}

function preCheckReadiness(config) {
  const requirements = Array.isArray(config.preCheckRequirements) ? config.preCheckRequirements.filter((item) => item && item.required !== false) : [];
  if (!requirements.length) return { ready: true, required: false, status: 'not_configured', missing: [], failed: [], missingEvidence: [], malformed: 0, requiredItems: [], observedItemCount: 0, evidence: 'profile 未声明结构化试验前检查项目' };
  const items = config.testMetadata?.preCheckItems;
  if (!Array.isArray(items)) return { ready: false, required: true, status: 'missing', missing: requirements.map((item) => item.id), failed: [], missingEvidence: [], malformed: 0, requiredItems: requirements, observedItemCount: 0, evidence: '缺少结构化 preCheckItems；自由文本前检查记录不能替代逐项状态和证据引用' };
  const missing = [];
  const failed = [];
  const missingEvidence = [];
  const passStatuses = new Set(['pass', 'passed', 'ok', '通过', '合格']);
  for (const requirement of requirements) {
    const item = items.find((candidate) => candidate && String(candidate.id || '').trim() === requirement.id);
    if (!item) {
      missing.push(requirement.id);
      continue;
    }
    if (!passStatuses.has(String(item.status || '').trim().toLowerCase())) failed.push(`${requirement.id}:${String(item.status || '未填写')}`);
    if (!String(item.evidenceRef || '').trim()) missingEvidence.push(requirement.id);
  }
  const malformed = items.filter((item) => !item || typeof item !== 'object' || Array.isArray(item) || !String(item.id || '').trim() || !String(item.status || '').trim()).length;
  const status = malformed ? 'malformed' : missing.length || failed.length || missingEvidence.length ? 'missing' : 'ready';
  const evidence = status === 'ready'
    ? `${requirements.length} 项试验前检查均为通过状态且有证据引用`
    : malformed
      ? `${malformed} 条前检查记录缺少 id/status`
      : `前检查证据缺失：${[...missing, ...failed, ...missingEvidence].join('、')}`;
  return { ready: status === 'ready', required: true, status, missing, failed, missingEvidence, malformed, requiredItems: requirements, observedItemCount: items.length, evidence };
}

function acceptanceReadiness(config, metrics, phaseMetricResult = { phases: {} }) {
  const legacyRules = [];
  if (config.acceptanceCriteria?.minHydrogenPurityPct !== undefined) legacyRules.push({ metric: 'minimumHydrogenPurityPct', operator: '>=', value: config.acceptanceCriteria.minHydrogenPurityPct, sourceRef: 'profile.acceptanceCriteria.minHydrogenPurityPct' });
  if (config.acceptanceCriteria?.maxSpecificEnergyKWhPerNm3 !== undefined) legacyRules.push({ metric: 'specificEnergyKWhPerNm3', operator: '<=', value: config.acceptanceCriteria.maxSpecificEnergyKWhPerNm3, sourceRef: 'profile.acceptanceCriteria.maxSpecificEnergyKWhPerNm3' });
  const rules = [...(Array.isArray(config.acceptanceRules) ? config.acceptanceRules : []), ...legacyRules];
  const phaseRules = Array.isArray(config.phaseAcceptanceRules) ? config.phaseAcceptanceRules : [];
  if (!rules.length && !phaseRules.length) return { ready: false, status: 'not_configured', missing: ['acceptanceRules'], failed: [], checks: [], evidence: '没有企业批准的验收规则；演示阈值不能替代验收准则' };
  const checks = rules.map((rule) => {
    const actual = metrics[rule.metric];
    const expected = Number(rule.value);
    const pass = Number.isFinite(actual) && Number.isFinite(expected) && (rule.operator === '<=' ? actual <= expected : rule.operator === '>=' ? actual >= expected : rule.operator === '<' ? actual < expected : rule.operator === '>' ? actual > expected : actual === expected);
    return { ...rule, actual, expected, pass, status: Number.isFinite(actual) ? (pass ? 'pass' : 'fail') : 'missing' };
  });
  const phaseChecks = phaseRules.map((rule) => {
    const actual = phaseMetricResult.phases?.[rule.phase]?.[rule.metric];
    const expected = Number(rule.value);
    const pass = Number.isFinite(actual) && Number.isFinite(expected) && (rule.operator === '<=' ? actual <= expected : rule.operator === '>=' ? actual >= expected : rule.operator === '<' ? actual < expected : rule.operator === '>' ? actual > expected : actual === expected);
    return { ...rule, actual, expected, pass, metric: `${rule.phase}.${rule.metric}`, status: Number.isFinite(actual) ? (pass ? 'pass' : 'fail') : 'missing' };
  });
  const allChecks = [...checks, ...phaseChecks];
  const missing = allChecks.filter((check) => check.status === 'missing').map((check) => check.metric);
  const failed = allChecks.filter((check) => check.status === 'fail').map((check) => check.metric);
  return { ready: missing.length === 0 && failed.length === 0, status: missing.length ? 'missing_measurement' : failed.length ? 'failed' : 'ready', missing, failed, checks: allChecks, evidence: missing.length ? `验收规则所需指标缺失：${missing.join('、')}` : failed.length ? `验收规则未通过：${failed.join('、')}` : `${allChecks.length} 条企业验收规则已计算` };
}

function reportReadiness(config, quality) {
  const required = Array.isArray(config.reportRequirements) ? config.reportRequirements : [];
  if (!required.length) return { ready: false, missing: ['reportRequirements'], evidence: 'profile 未声明正式报告字段要求' };
  const metadata = config.testMetadata && typeof config.testMetadata === 'object' ? config.testMetadata : {};
  const available = {
    testPurpose: Boolean(metadata.testPurpose),
    instrumentIds: Boolean(metadata.instrumentIds),
    operator: Boolean(metadata.operator),
    operatorQualification: Boolean(metadata.operatorQualification),
    formulaRefs: Boolean(metadata.formulaRefs),
    charts: Boolean(quality?.rowCount >= 2),
    conclusion: true,
    testPlanRef: Boolean(metadata.testPlanRef),
    acquisitionPlan: Boolean(metadata.acquisitionPlan),
    preCheckRecord: Boolean(metadata.preCheckRecord)
  };
  const missing = required.filter((field) => !available[field]);
  return { ready: missing.length === 0, missing, evidence: missing.length ? `报告字段缺失：${missing.join('、')}` : `${required.length} 类报告字段均有证据` };
}

function complianceReadiness(config, missingMeasurements = [], missingPhases = [], scope = scopeReadiness(config), instruments = instrumentReadiness(config), acceptance = acceptanceReadiness(config, {}), report = reportReadiness(config, {}), phaseMetrics = { missing: [], phases: {} }, acquisition = acquisitionReadiness(config), preCheck = preCheckReadiness(config), testStages = testStageReadiness(config), testConditions = testConditionReadiness(config), measurementMethods = measurementMethodReadiness(config), efficiency = { ready: true, status: 'not_configured' }, testSystem = testSystemReadiness(config), environmentConditions = environmentConditionReadiness(config), phaseResults = phaseResultReadiness(config, phaseMetrics), dataQuality = { ready: true, status: 'not_configured', missing: [], failed: [], evidence: '' }) {
  const missingProfileFields = [];
  const approvalEvidence = approvalEvidenceReadiness(config.approvalEvidence, config.revision, config.approvalStatus);
  const methodExecutionStatus = config.methodExecutionStatus || (config.standardRefs?.length ? 'ENTERPRISE_PROFILE_REQUIRED' : null);
  const methodImplementationEvidence = methodImplementationEvidenceReadiness(config.methodImplementationEvidence, config.methodId, config.revision, methodExecutionStatus);
  const fullMethodProfile = fullMethodProfileReadiness({ ...config, methodExecutionStatus });
  if (!config.profileId) missingProfileFields.push('profileId');
  if (!config.standardRefs?.length) missingProfileFields.push('standardRefs');
  if (!config.methodId || config.methodId === 'demo-rule-set') missingProfileFields.push('methodId');
  if (!config.revision || config.revision === 'demo-v1') missingProfileFields.push('revision');
  if (config.uncertaintyModelRequired && !config.uncertaintyModel) missingProfileFields.push('uncertaintyModel');
  if (methodExecutionStatus === 'FULL_METHOD_IMPLEMENTED' && !methodImplementationEvidence.ready) missingProfileFields.push('methodImplementationEvidence');
  if (!fullMethodProfile.ready) missingProfileFields.push(...fullMethodProfile.missing, ...fullMethodProfile.malformed);
  if (config.approvalStatus === 'approved') {
    if (!approvalEvidence.ready) missingProfileFields.push('approvalEvidence');
    if (!config.scopeRules) missingProfileFields.push('scopeRules');
    if (!config.instrumentRequirements?.length) missingProfileFields.push('instrumentRequirements');
    if (!config.reportRequirements?.length) missingProfileFields.push('reportRequirements');
    if (!config.acceptanceRules?.length && !config.phaseAcceptanceRules?.length && !Object.keys(config.acceptanceCriteria || {}).length) missingProfileFields.push('acceptanceRules');
  }
  const metadata = config.testMetadata && typeof config.testMetadata === 'object' ? config.testMetadata : {};
  const requiredMetadata = Array.isArray(config.requiredMetadata) ? config.requiredMetadata : [];
  const missingMetadata = requiredMetadata.filter((field) => {
    const value = metadata[field];
    return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
  });
  const traceability = traceabilityReadiness(config);
  const editLog = editLogReadiness(config);
  const formalBlockers = missingProfileFields.length || missingMetadata.length || missingMeasurements.length || missingPhases.length || phaseMetrics.missing.length || !approvalEvidence.ready || !methodImplementationEvidence.ready || !scope.ready || !instruments.ready || !acceptance.ready || !report.ready || !acquisition.ready || !preCheck.ready || !testStages.ready || !testConditions.ready || !measurementMethods.ready || !efficiency.ready || !testSystem.ready || !environmentConditions.ready || !phaseResults.ready || !dataQuality.ready || !traceability.ready || !editLog.ready;
  const status = config.approvalStatus !== 'approved' ? 'DEMO_ONLY' : formalBlockers ? 'NOT_READY' : 'READY_FOR_HUMAN_REVIEW';
  const label = status === 'DEMO_ONLY' ? '仅演示，不作标准符合性判定' : status === 'NOT_READY' ? '标准符合性资料不完整' : '可进入人工符合性复核';
  return { status, label, approvalStatus: config.approvalStatus || 'unspecified', approvalEvidence, standardRefs: config.standardRefs || [], methodId: config.methodId || null, revision: config.revision || null, methodSource: config.methodSource || null, methodImplementationEvidence, fullMethodProfile, publicationDate: config.publicationDate || null, effectiveDate: config.effectiveDate || null, standardStatus: config.status || null, scopeEvidence: config.scopeEvidence || null, workflowEvidence: config.workflowEvidence || null, methodExecutionStatus, applicationScope: config.applicationScope || null, intendedUse: config.intendedUse || null, missingProfileFields, requiredMetadata, missingMetadata, requiredMeasurements: config.requiredMeasurements || [], missingMeasurements, requiredPhases: config.requiredPhases || [], missingPhases, requiredPhaseMetrics: config.requiredPhaseMetrics || {}, missingPhaseMetrics: phaseMetrics.missing, phaseMetrics: phaseMetrics.phases, requiredTestStages: config.requiredTestStages || [], workflowSequence: config.workflowSequence || [], testSystemRequirements: config.testSystemRequirements || [], testConditionRequirements: config.testConditionRequirements || null, environmentConditionRequirements: config.environmentConditionRequirements || null, phaseResultRequirements: config.phaseResultRequirements || [], measurementMethodRequirements: config.measurementMethodRequirements || [], efficiencyRequirement: config.efficiencyRequirement || null, acquisitionRequirements: config.acquisitionRequirements || null, preCheckRequirements: config.preCheckRequirements || [], dataQualityRequirements: config.dataQualityRequirements || null, dataQuality, traceabilityRequirements: config.traceabilityRequirements || null, editLogRequirements: config.editLogRequirements || null, traceability, editLog, scope, instruments, acquisition, preCheck, testStages, testSystem, testConditions, environmentConditions, measurementMethods, phaseResults, efficiency, acceptance, report, acceptanceCriteria: config.acceptanceCriteria || {}, acceptanceRules: config.acceptanceRules || [], phaseAcceptanceRules: config.phaseAcceptanceRules || [] };
}

function missingPerformanceMeasurements(config, rows, schema) {
  const required = Array.isArray(config.requiredMeasurements) ? config.requiredMeasurements : [];
  return required.filter((field) => {
    if (field === 'energy_derived') return rows.filter((row) => row.timestamp_s !== null && row.current_a !== null && row.voltage_v !== null).length < 2;
    if (field === 'power_w') return !schema.mapping[field] || rows.filter((row) => row[field] !== null).length < 2;
    return !schema.mapping[field] || rows.filter((row) => row[field] !== null).length < 2;
  });
}

function missingRequiredPhases(config, rows, maxIntervalS = null) {
  return phaseCoverageReport(config, rows, maxIntervalS).missing;
}

function integrateTrapezoid(rows, field, divisor = 1, maxIntervalS = null, evidence = null) {
  let total = 0;
  let segments = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (!sameSession(previous, current)) { evidence && (evidence.skippedSessionBoundaryCount += 1); continue; }
    const deltaS = current.timestamp_s !== null && previous.timestamp_s !== null ? current.timestamp_s - previous.timestamp_s : 0;
    if (deltaS <= 0) { evidence && (evidence.skippedNonPositiveCount += 1); continue; }
    if (maxIntervalS !== null && deltaS > maxIntervalS) { evidence && (evidence.skippedGapCount += 1); continue; }
    if (previous[field] === null || current[field] === null) { evidence && (evidence.skippedMissingCount += 1); continue; }
    total += ((previous[field] + current[field]) / 2) * deltaS / divisor;
    segments += 1;
  }
  if (evidence) evidence.segmentCount = segments;
  return segments ? total : null;
}

function calculateUncertainty(rows, metrics, model, maxIntervalS = null) {
  if (!model) return { status: 'not_configured', method: null, coverageFactor: null, metrics: {}, missingFields: [] };
  const standard = model.standardUncertainty || {};
  const method = model.method;
  const coverageFactor = Number(model.coverageFactor);
  if (method !== 'first_order_rss' || !Number.isFinite(coverageFactor) || coverageFactor <= 0) {
    return {
      status: 'invalid',
      method: method || null,
      coverageFactor: Number.isFinite(coverageFactor) ? coverageFactor : null,
      metrics: {},
      missingFields: [],
      assumptions: [],
      boundary: '不确定度模型方法或覆盖因子不合法；已阻断 profile 的不确定度门控。'
    };
  }
  const u = (field) => Number.isFinite(Number(standard[field])) ? Number(standard[field]) * coverageFactor : null;
  const rss = (values) => {
    const usable = values.filter((value) => Number.isFinite(value));
    return usable.length ? Math.sqrt(usable.reduce((sum, value) => sum + value ** 2, 0)) : null;
  };
  const powerU = (row) => {
    const directPowerU = u('power_w');
    if (row.power_w !== null) return directPowerU;
    const currentU = u('current_a');
    const voltageU = u('voltage_v');
    return row.current_a !== null && row.voltage_v !== null && currentU !== null && voltageU !== null
      ? rss([row.voltage_v * currentU, row.current_a * voltageU])
      : null;
  };
  const integrateFlowU = () => {
    const flowU = u('flow_slpm');
    if (flowU === null) return null;
    const segments = [];
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1];
      const current = rows[index];
      if (!sameSession(previous, current)) continue;
      const deltaS = current.timestamp_s !== null && previous.timestamp_s !== null ? current.timestamp_s - previous.timestamp_s : 0;
      if (deltaS > 0 && (maxIntervalS === null || deltaS <= maxIntervalS) && previous.flow_slpm !== null && current.flow_slpm !== null) segments.push(flowU * deltaS / 60);
    }
    return rss(segments);
  };
  const integrateEnergyU = () => {
    const segments = [];
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1];
      const current = rows[index];
      if (!sameSession(previous, current)) continue;
      const deltaS = current.timestamp_s !== null && previous.timestamp_s !== null ? current.timestamp_s - previous.timestamp_s : 0;
      const previousU = powerU(previous);
      const currentU = powerU(current);
      if (deltaS > 0 && (maxIntervalS === null || deltaS <= maxIntervalS) && previousU !== null && currentU !== null) segments.push(((previousU + currentU) / 2) * deltaS / 3600);
    }
    return rss(segments);
  };
  const energyU = integrateEnergyU();
  const volumeU = integrateFlowU();
  const specificEnergyU = metrics.specificEnergyKWhPerNm3 !== null && metrics.energyConsumedWh !== null && metrics.hydrogenVolumeNl !== null && metrics.energyConsumedWh > 0 && metrics.hydrogenVolumeNl > 0
    && energyU !== null && volumeU !== null
    ? metrics.specificEnergyKWhPerNm3 * Math.sqrt((energyU / metrics.energyConsumedWh) ** 2 + (volumeU / metrics.hydrogenVolumeNl) ** 2)
    : null;
  const missingFields = [];
  const addMissing = (condition, fields) => { if (condition) missingFields.push(...fields); };
  addMissing(metrics.peakTemperatureC !== null && u('temperature_c') === null, ['temperature_c']);
  addMissing(metrics.peakPressureBar !== null && u('pressure_bar') === null, ['pressure_bar']);
  addMissing(metrics.peakLeakPpm !== null && u('leak_ppm') === null, ['leak_ppm']);
  addMissing(metrics.minimumHydrogenPurityPct !== null && u('hydrogen_purity_pct') === null, ['hydrogen_purity_pct']);
  addMissing(metrics.hydrogenVolumeNl !== null && volumeU === null, ['flow_slpm']);
  const hasDirectPower = rows.some((row) => row.power_w !== null);
  const powerFields = hasDirectPower ? ['power_w'] : ['current_a', 'voltage_v'];
  addMissing(metrics.energyConsumedWh !== null && energyU === null, powerFields);
  addMissing(metrics.specificEnergyKWhPerNm3 !== null && specificEnergyU === null, [...new Set([...powerFields, 'flow_slpm'])]);
  const status = missingFields.length ? 'insufficient' : 'calculated';
  return {
    status,
    method,
    coverageFactor,
    missingFields: [...new Set(missingFields)],
    assumptions: [
      '输出为 coverageFactor=k 下的扩展不确定度；输入值按 profile 的 standardUncertainty 解释。',
      '未包含相关性、漂移、校准证书、采样同步和 Type A 重复性分量，不能单独构成完整 GUM 不确定度预算。'
    ],
    boundary: '不确定度传播仅覆盖已声明并可计算的通用 KPI；不替代企业批准的不确定度预算、仪器校准和实验室能力证据。',
    metrics: {
      peakTemperatureC: u('temperature_c'),
      peakPressureBar: u('pressure_bar'),
      peakLeakPpm: u('leak_ppm'),
      minimumHydrogenPurityPct: u('hydrogen_purity_pct'),
      hydrogenVolumeNl: volumeU,
      energyConsumedWh: energyU,
      specificEnergyKWhPerNm3: specificEnergyU
    }
  };
}

function workflowReadiness(config, quality, schema, compliance, verdict, uncertainty) {
  const dataReady = quality.usable && quality.completenessPct >= 98 && quality.duplicateTimestampCount === 0 && quality.nonMonotonicCount === 0 && quality.nonPositiveIntervalCount === 0 && (quality.samplingGapCount === null || quality.samplingGapCount === 0);
  const fieldTraceabilityReady = schema.mappingWarnings.length === 0 && quality.invalidValueCounts.timestamp_s === 0;
  const objectTraceabilityReady = compliance.traceability?.ready === true;
  const editLogReady = compliance.editLog?.ready === true;
  const metadataReady = compliance.missingMetadata.length === 0;
  const signoffReady = Boolean(config.testMetadata?.signoff);
  const performanceReady = compliance.missingMeasurements.length === 0;
  const phaseCoverageReady = compliance.missingPhases.length === 0;
  const phaseMetricsReady = compliance.missingPhaseMetrics.length === 0;
  const testStagesReady = compliance.testStages?.ready;
  const testSystemReady = compliance.testSystem?.ready;
  const testConditionsReady = compliance.testConditions?.ready;
  const environmentConditionsReady = compliance.environmentConditions?.ready;
  const measurementMethodsReady = compliance.measurementMethods?.ready;
  const efficiencyReady = compliance.efficiency?.ready;
  const phaseResultsReady = compliance.phaseResults?.ready;
  const uncertaintyReady = !config.uncertaintyModelRequired || (uncertainty.status === 'calculated' && !(uncertainty.missingFields?.length));
  const scopeReady = compliance.scope?.ready;
  const instrumentReady = compliance.instruments?.ready;
  const acceptanceReady = compliance.acceptance?.ready;
  const reportReady = compliance.report?.ready;
  const approvalEvidenceReady = compliance.approvalEvidence?.ready;
  const acquisitionReady = compliance.acquisition?.ready;
  const preCheckReady = compliance.preCheck?.ready;
  const dataQualityReady = compliance.dataQuality?.ready;
  const configuredSequence = Array.isArray(config.workflowSequence) ? config.workflowSequence : [];
  const sequenceSteps = configuredSequence.map((sequenceStep) => {
    const gate = sequenceStep.gate === 'testStages'
      ? testStageReadinessForId(config, sequenceStep.stage || sequenceStep.id)
      : compliance[sequenceStep.gate];
    const phaseMissing = sequenceStep.phase && (compliance.missingPhases.includes(sequenceStep.phase) || compliance.phaseResults?.missing?.includes(sequenceStep.phase));
    const ready = gate?.ready === true && !phaseMissing;
    const evidence = phaseMissing ? `缺少 ${sequenceStep.phase} 阶段结果证据` : gate?.evidence || '尚未形成结构化证据';
    return { id: `method-${sequenceStep.id}`, label: sequenceStep.label, status: ready ? 'ready' : 'needs_input', evidence };
  });
  const methodSequenceReady = sequenceSteps.every((step) => step.status === 'ready');
  const steps = [
    ...sequenceSteps,
    { id: 'profile', label: '设备家族与测试方法', status: compliance.missingProfileFields.length ? 'needs_input' : 'ready', evidence: compliance.missingProfileFields.length ? `缺少 ${compliance.missingProfileFields.join('、')}` : `${compliance.methodId} · ${compliance.revision}` },
    { id: 'approval-evidence', label: 'profile 审批与修订证据', status: approvalEvidenceReady ? 'ready' : 'needs_input', evidence: compliance.approvalEvidence?.evidence || 'approved profile 未形成审批证据' },
    { id: 'method-implementation-evidence', label: '完整方法实施证据', status: compliance.methodImplementationEvidence?.ready ? 'ready' : 'needs_input', evidence: compliance.methodImplementationEvidence?.evidence || '未声明完整方法实施证据' },
    { id: 'scope', label: '设备适用范围', status: scopeReady ? 'ready' : 'needs_input', evidence: compliance.scope?.evidence || '尚未核对设备家族和额定范围' },
    { id: 'metadata', label: '测试计划与试验前检查', status: metadataReady ? 'ready' : 'needs_input', evidence: metadataReady ? '目的、测试计划、采集计划、前检查、环境、执行者和签核字段齐全' : `缺少 ${compliance.missingMetadata.join('、')}` },
    { id: 'acquisition', label: '结构化数据采集证据', status: acquisitionReady ? 'ready' : 'needs_input', evidence: compliance.acquisition?.evidence || '尚未形成结构化采集证据' },
    { id: 'pre-check', label: '逐项试验前检查状态', status: preCheckReady ? 'ready' : 'needs_input', evidence: compliance.preCheck?.evidence || '尚未形成逐项前检查证据' },
    { id: 'test-stages', label: '标准测试阶段证据', status: testStagesReady ? 'ready' : 'needs_input', evidence: compliance.testStages?.evidence || '尚未形成测试阶段证据' },
    { id: 'test-system', label: '测试系统组成证据', status: testSystemReady ? 'ready' : 'needs_input', evidence: compliance.testSystem?.evidence || '尚未形成测试系统组成证据' },
    { id: 'test-conditions', label: '测试条件与异常处置', status: testConditionsReady ? 'ready' : 'needs_input', evidence: compliance.testConditions?.evidence || '尚未形成测试条件证据' },
    { id: 'environment-conditions', label: '环境条件证据', status: environmentConditionsReady ? 'ready' : 'needs_input', evidence: compliance.environmentConditions?.evidence || '尚未形成环境条件证据' },
    { id: 'instruments', label: '仪器精度与校准溯源', status: instrumentReady ? 'ready' : 'needs_input', evidence: compliance.instruments?.evidence || '尚未形成结构化仪器证据' },
    { id: 'measurement-methods', label: '测量方法与证据引用', status: measurementMethodsReady ? 'ready' : 'needs_input', evidence: compliance.measurementMethods?.evidence || '尚未形成测量方法证据' },
    { id: 'data', label: '原始数据质量', status: dataReady ? 'ready' : 'needs_review', evidence: `${quality.rowCount} 条记录 · 完整率 ${quality.completenessPct.toFixed(1)}%` },
    { id: 'traceability', label: '字段、单位与计算追溯', status: fieldTraceabilityReady ? 'ready' : 'needs_review', evidence: `${schema.mappedCount}/${schema.fieldCount} 字段已映射 · ${Object.values(schema.conversions).filter((item) => item.mode !== 'identity').length} 项单位换算` },
    { id: 'object-traceability', label: '测试对象与运行编号追溯', status: objectTraceabilityReady ? 'ready' : 'needs_input', evidence: compliance.traceability?.evidence || '尚未形成对象追溯证据' },
    { id: 'edit-log', label: '人工修改记录与证据引用', status: editLogReady ? 'ready' : 'needs_input', evidence: compliance.editLog?.evidence || '尚未形成人工修改审计记录' },
    { id: 'data-quality', label: '时间轴与阶段有效覆盖', status: dataQualityReady ? 'ready' : 'needs_input', evidence: compliance.dataQuality?.evidence || '尚未核对采样间隔和阶段连续性' },
    { id: 'coverage', label: '测试段覆盖', status: phaseCoverageReady ? 'ready' : 'needs_input', evidence: phaseCoverageReady ? 'profile 要求的测试段均已出现' : `缺少 ${compliance.missingPhases.join('、')}` },
    { id: 'phase-metrics', label: '启停、稳态与动态计算', status: phaseMetricsReady ? 'ready' : 'needs_input', evidence: phaseMetricsReady ? 'profile 要求的阶段指标均已计算' : `缺少 ${compliance.missingPhaseMetrics.join('、')}` },
    { id: 'phase-results', label: '方法阶段结果证据', status: phaseResultsReady ? 'ready' : 'needs_input', evidence: compliance.phaseResults?.evidence || '尚未形成方法阶段结果证据' },
    { id: 'performance', label: '产氢量、纯度与单位能耗', status: performanceReady ? 'ready' : 'needs_input', evidence: performanceReady ? 'profile 要求的性能测量均有有效数据' : `缺少 ${compliance.missingMeasurements.join('、')}` },
    { id: 'efficiency', label: '效率结果与批准公式', status: efficiencyReady ? 'ready' : 'needs_input', evidence: compliance.efficiency?.evidence || '未配置批准的效率结果/公式' },
    { id: 'acceptance', label: '企业验收规则', status: acceptanceReady ? 'ready' : 'needs_input', evidence: compliance.acceptance?.evidence || '未配置企业批准验收规则' },
    { id: 'uncertainty', label: '测量不确定度模型', status: uncertaintyReady ? 'ready' : 'needs_input', evidence: uncertaintyReady ? (uncertainty.status === 'calculated' ? `${uncertainty.method} · k=${uncertainty.coverageFactor}` : 'profile 未要求不确定度模型') : uncertainty.missingFields?.length ? `缺少输入不确定度：${uncertainty.missingFields.join('、')}` : 'profile 要求模型但未完成有效传播' },
    { id: 'risk', label: '风险处置与复测决定', status: verdict === 'FAIL' ? 'blocked' : verdict === 'WARN' ? 'needs_review' : 'ready', evidence: verdict === 'FAIL' ? '存在高优先级风险，先处置再决定归档' : verdict === 'WARN' ? '存在趋势或质量问题，需要工程师复核' : '当前规则未触发高优先级风险' },
    { id: 'report', label: '报告字段与结论', status: reportReady ? 'ready' : 'needs_input', evidence: compliance.report?.evidence || '报告字段证据不完整' },
    { id: 'signoff', label: '人工签核与归档', status: signoffReady ? 'ready' : 'needs_input', evidence: signoffReady ? config.testMetadata.signoff : '尚未填写人工签核信息' }
  ];
  const methodImplementationReady = compliance.methodImplementationEvidence?.ready;
  const procedureReady = approvalEvidenceReady && methodImplementationReady && metadataReady && scopeReady && instrumentReady && acquisitionReady && preCheckReady && testStagesReady && testSystemReady && testConditionsReady && environmentConditionsReady && measurementMethodsReady && methodSequenceReady && dataReady && fieldTraceabilityReady && objectTraceabilityReady && editLogReady && dataQualityReady && phaseCoverageReady && phaseMetricsReady && phaseResultsReady && performanceReady && efficiencyReady && acceptanceReady && uncertaintyReady && reportReady;
  const status = !quality.usable ? 'BLOCKED_DATA' : compliance.status === 'DEMO_ONLY' ? 'DEMO_ONLY' : compliance.status === 'NOT_READY' || !procedureReady ? 'NOT_READY' : verdict !== 'PASS' ? 'REVIEW_REQUIRED' : !signoffReady ? 'SIGNOFF_REQUIRED' : 'READY_FOR_HUMAN_REVIEW';
  const nextAction = status === 'BLOCKED_DATA' ? '修复数据结构、时间轴或缺失值后重跑。' : status === 'DEMO_ONLY' ? '导入企业批准的 profile、方法版本和验收准则。' : status === 'NOT_READY' ? '补齐 profile 审批状态、方法版本和测试元数据。' : status === 'REVIEW_REQUIRED' ? '处置异常并完成工程师复核，必要时安排复测。' : status === 'SIGNOFF_REQUIRED' ? '由授权测试人员填写签核后归档。' : '可进入人工符合性复核与正式归档。';
  return { status, nextAction, steps, methodSequence: sequenceSteps };
}

function workbookFormulaReviewReadiness(config = {}, workbookEvidence = null) {
  const audit = workbookEvidence?.formulaAudit || config.parameterConfig?.formulaAudit || null;
  const formulaPresent = Boolean(audit && (
    Number(audit.formulaCellCount) > 0
    || Number(audit.externalReferenceCount) > 0
    || Number(audit.externalFunctionCount) > 0
    || audit.macroPresent
    || audit.externalLinksPresent
    || audit.activeContentPresent
  ));
  const required = formulaPresent && (config.evaluationMode === 'acceptance' || config.methodExecutionStatus === 'FULL_METHOD_IMPLEMENTED');
  const auditSource = workbookEvidence?.formulaAudit ? '数据工作簿' : config.parameterConfig?.formulaAudit ? '参数/目标工况工作簿' : '输入工作簿';
  if (!formulaPresent) return { required: false, ready: true, status: 'not_required', audit, missing: [], evidence: '当前输入工作簿未发现公式或活动内容审计信号' };
  if (audit.status === 'blocked_active_content' || audit.macroPresent || audit.externalLinksPresent || audit.activeContentPresent) return { required, ready: false, status: 'blocked_active_content', audit, missing: ['safe_workbook_container'], evidence: '工作簿包含宏、外部链接或活动内容；该输入不进入可验证分析路径' };
  if (audit.status === 'invalid_formula_cache' || Number(audit.errorFormulaCellCount) > 0) return { required, ready: false, status: 'invalid_formula_cache', audit, missing: ['error_formula_cache'], evidence: `${auditSource}发现 ${audit.errorFormulaCellCount || 0} 个公式错误缓存值；错误缓存不进入可验证分析路径` };
  if (!required) return { required: false, ready: true, status: 'review_required_for_acceptance', audit, missing: [], evidence: `${auditSource}发现 ${audit.formulaCellCount} 个公式单元格；当前仅作描述/风险筛查，未把缓存公式值当作正式验收结论` };
  const record = config.testMetadata?.formulaReviewEvidence;
  const missing = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { required: true, ready: false, status: 'missing', audit, missing: ['formulaReviewEvidence'], evidence: `${auditSource}存在公式缓存值，但未提供公式复核证据` };
  for (const field of ['reviewerId', 'reviewedAt', 'evidenceRef', 'sourceHash']) if (!String(record[field] || '').trim()) missing.push(field);
  if (!['cached_values_reviewed', 'recalculated_externally'].includes(String(record.decision || '').trim())) missing.push('decision');
  const reviewedAt = String(record.reviewedAt || '').trim();
  if (reviewedAt && !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(reviewedAt)) missing.push('reviewedAt_format');
  const status = missing.length ? 'missing' : 'ready';
  return { required: true, ready: status === 'ready', status, audit, missing: [...new Set(missing)], evidence: status === 'ready' ? `${auditSource}公式复核证据已绑定 ${audit.formulaCellCount} 个公式单元格、来源哈希和复核决定` : `${auditSource}公式复核证据缺失：${[...new Set(missing)].join('、')}` };
}

export function releaseGate(result) {
  if (result.config?.evaluationMode === 'descriptive_only') return {
    status: 'ANALYSIS_DRAFT',
    ready: false,
    checks: { descriptiveOnly: false, dataQuality: Boolean(result.quality?.usable) },
    blockedReasons: ['descriptive_only'],
    methodExecutionStatus: result.compliance?.methodExecutionStatus || null,
    label: '仅描述性分析，不执行阈值或验收判定'
  };
  const methodExecutionStatus = result.compliance?.methodExecutionStatus;
  const formulaReview = workbookFormulaReviewReadiness(result.config || {}, result.dataset?.workbookEvidence || result.config?.workbookEvidence || null);
  const completeMethod = methodExecutionStatus === 'FULL_METHOD_IMPLEMENTED'
    && result.compliance?.methodImplementationEvidence?.ready === true
    && result.compliance?.fullMethodProfile?.ready === true;
  const checks = {
    approvedProfile: result.compliance?.status === 'READY_FOR_HUMAN_REVIEW',
    approvalEvidence: Boolean(result.compliance?.approvalEvidence?.ready),
    methodImplementationEvidence: Boolean(result.compliance?.methodImplementationEvidence?.ready),
    fullMethodProfileEvidence: Boolean(result.compliance?.fullMethodProfile?.ready),
    scopeReady: Boolean(result.compliance?.scope?.ready),
    instrumentEvidence: Boolean(result.compliance?.instruments?.ready),
    acquisitionEvidence: Boolean(result.compliance?.acquisition?.ready),
    preCheckEvidence: Boolean(result.compliance?.preCheck?.ready),
    measurementCoverage: !(result.compliance?.missingMeasurements?.length),
    phaseCoverage: !(result.compliance?.missingPhases?.length),
    phaseMetricCoverage: !(result.compliance?.missingPhaseMetrics?.length || result.compliance?.phaseMetrics?.missing?.length),
    testStagesEvidence: Boolean(result.compliance?.testStages?.ready),
    testSystemEvidence: Boolean(result.compliance?.testSystem?.ready),
    testConditionsEvidence: Boolean(result.compliance?.testConditions?.ready),
    environmentConditionsEvidence: Boolean(result.compliance?.environmentConditions?.ready),
    measurementMethodsEvidence: Boolean(result.compliance?.measurementMethods?.ready),
    efficiencyEvidence: Boolean(result.compliance?.efficiency?.ready),
    phaseResultsEvidence: Boolean(result.compliance?.phaseResults?.ready),
    acceptanceRules: Boolean(result.compliance?.acceptance?.ready),
    uncertaintyEvidence: !Boolean(result.config?.uncertaintyModelRequired) || result.uncertainty?.status === 'calculated',
    uncertaintyInputCoverage: !Boolean(result.config?.uncertaintyModelRequired) || !(result.uncertainty?.missingFields?.length),
    reportRequirements: Boolean(result.compliance?.report?.ready),
    objectTraceability: Boolean(result.compliance?.traceability?.ready),
    editLogEvidence: Boolean(result.compliance?.editLog?.ready),
    dataQuality: Boolean(result.quality?.usable),
    configuredDataQuality: Boolean(result.compliance?.dataQuality?.ready),
    passingVerdict: result.verdict === 'PASS',
    workflowComplete: result.workflow?.status === 'READY_FOR_HUMAN_REVIEW',
    humanSignoff: Boolean(result.config?.testMetadata?.signoff)
  };
  checks.workbookFormulaReview = !formulaReview.required || formulaReview.ready;
  const blockedReasons = Object.entries(checks).filter(([, pass]) => !pass).map(([id]) => id);
  const standardEvidenceReady = blockedReasons.length === 0 && methodExecutionStatus && methodExecutionStatus !== 'FULL_METHOD_IMPLEMENTED';
  const status = blockedReasons.length ? 'ANALYSIS_DRAFT' : completeMethod ? 'HUMAN_REVIEW_PACKAGE' : standardEvidenceReady ? 'STANDARD_EVIDENCE_PACKAGE' : 'ANALYSIS_DRAFT';
  const label = status === 'HUMAN_REVIEW_PACKAGE'
    ? '人工复核包，仍需授权签核'
    : status === 'STANDARD_EVIDENCE_PACKAGE'
      ? '标准流程证据包，不能替代完整方法执行'
      : '分析草稿，不得作为放行报告';
  return { status, ready: status !== 'ANALYSIS_DRAFT', checks, blockedReasons, methodExecutionStatus: methodExecutionStatus || null, workbookFormulaReview: { required: formulaReview.required, status: formulaReview.status, ready: formulaReview.ready, missing: formulaReview.missing, evidence: formulaReview.evidence }, label };
}

export function analyzeRows(inputRows, suppliedConfig = {}) {
  const safeInput = Array.isArray(inputRows) ? inputRows : [];
  const enterpriseResult = analyzeEnterpriseRows(safeInput, suppliedConfig);
  if (enterpriseResult) {
    const workbookFormulaReview = workbookFormulaReviewReadiness(suppliedConfig, enterpriseResult.dataset?.workbookEvidence || null);
    if (workbookFormulaReview.audit?.formulaCellCount > 0) {
      enterpriseResult.issues = [{
        severity: workbookFormulaReview.required && !workbookFormulaReview.ready ? 'critical' : 'warn',
        code: workbookFormulaReview.status === 'invalid_formula_cache' ? 'WORKBOOK_FORMULA_CACHE_INVALID' : workbookFormulaReview.required && !workbookFormulaReview.ready ? 'WORKBOOK_FORMULA_REVIEW_MISSING' : 'WORKBOOK_FORMULA_CACHE_USED',
        title: workbookFormulaReview.status === 'invalid_formula_cache' ? '工作簿含公式错误缓存值' : workbookFormulaReview.required && !workbookFormulaReview.ready ? '工作簿公式复核证据缺失' : '工作簿含公式缓存值',
        evidence: workbookFormulaReview.evidence,
        recommendation: workbookFormulaReview.required && !workbookFormulaReview.ready
          ? '补充 reviewerId、reviewedAt、evidenceRef、sourceHash 和复核决定；系统不把未复核缓存值用于正式验收。'
          : '当前只作描述/风险筛查；正式验收前由企业批准人员确认公式缓存值或提供外部重算证据。'
      }, ...enterpriseResult.issues];
      if (workbookFormulaReview.required && !workbookFormulaReview.ready) enterpriseResult.verdict = 'FAIL';
    }
    const supported = Array.isArray(suppliedConfig.supportedDatasetTypes) ? suppliedConfig.supportedDatasetTypes : [];
    if (supported.length && !supported.includes(enterpriseResult.datasetType)) {
      enterpriseResult.issues = [{ severity: 'critical', code: 'DATASET_PROFILE_MISMATCH', title: '数据集不在 profile 适用范围内', evidence: `${enterpriseResult.datasetType} 不属于当前 profile 允许的数据集：${supported.join('、')}`, recommendation: '选择适用于当前设备/数据集的企业批准 profile，不要复用其他设备方法。' }, ...enterpriseResult.issues];
      enterpriseResult.verdict = 'FAIL';
      enterpriseResult.narrative = '当前数据集与所选企业 profile 的适用范围不一致，系统已阻断后续结论。';
      enterpriseResult.workflow = { ...enterpriseResult.workflow, status: 'BLOCKED_PROFILE_SCOPE', nextAction: '更换适用的数据集 profile 后重新分析。', steps: (enterpriseResult.workflow?.steps || []).map((step) => step.id === 'dataset' ? { ...step, status: 'blocked', evidence: `profile 仅允许 ${supported.join('、')}，当前为 ${enterpriseResult.datasetType}` } : step) };
    }
    const evaluatedResult = applyEvaluationMode(enterpriseResult);
    evaluatedResult.releaseGate = releaseGate(evaluatedResult);
    return evaluatedResult;
  }
  const { fieldMapping = {}, ...thresholdConfig } = suppliedConfig;
  const config = { ...DEFAULT_CONFIG, ...thresholdConfig };
  const schema = resolveSchema(safeInput, fieldMapping);
  const rows = safeInput.map((row) => ({
    ...row,
    phase: schema.mapping.phase ? String(row[schema.mapping.phase] ?? '').trim() || '未标注' : '未标注',
    timestamp_s: convertValue(row[schema.mapping.timestamp_s], schema.conversions.timestamp_s),
    current_a: convertValue(row[schema.mapping.current_a], schema.conversions.current_a),
    voltage_v: convertValue(row[schema.mapping.voltage_v], schema.conversions.voltage_v),
    power_w: convertValue(row[schema.mapping.power_w], schema.conversions.power_w),
    power_setpoint_w: convertValue(row[schema.mapping.power_setpoint_w], schema.conversions.power_setpoint_w),
    temperature_c: convertValue(row[schema.mapping.temperature_c], schema.conversions.temperature_c),
    pressure_bar: convertValue(row[schema.mapping.pressure_bar], schema.conversions.pressure_bar),
    flow_slpm: convertValue(row[schema.mapping.flow_slpm], schema.conversions.flow_slpm),
    leak_ppm: convertValue(row[schema.mapping.leak_ppm], schema.conversions.leak_ppm),
    hydrogen_purity_pct: convertValue(row[schema.mapping.hydrogen_purity_pct], schema.conversions.hydrogen_purity_pct),
    gas_temperature_c: convertValue(row[schema.mapping.gas_temperature_c], schema.conversions.gas_temperature_c),
    gas_pressure_bar: convertValue(row[schema.mapping.gas_pressure_bar], schema.conversions.gas_pressure_bar),
    ambient_temperature_c: convertValue(row[schema.mapping.ambient_temperature_c], schema.conversions.ambient_temperature_c),
    ambient_humidity_pct: convertValue(row[schema.mapping.ambient_humidity_pct], schema.conversions.ambient_humidity_pct),
    ambient_pressure_kpa: convertValue(row[schema.mapping.ambient_pressure_kpa], schema.conversions.ambient_pressure_kpa)
    ,efficiency_pct: convertValue(row[schema.mapping.efficiency_pct], schema.conversions.efficiency_pct)
  }));
  const quality = qualityReport(rows, schema, config);
  const phaseCoverage = phaseCoverageReport(config, rows, quality.gapLimitS);
  const dataQuality = dataQualityReadiness(config, quality, phaseCoverage);
  const missingMeasurements = missingPerformanceMeasurements(config, rows, schema);
  const missingPhases = missingRequiredPhases(config, rows, quality.gapLimitS);
  const phaseMetrics = phaseMetricReport(config, rows, quality.gapLimitS);
  const dynamicPowerConfig = config.dynamicPowerAnalysis && typeof config.dynamicPowerAnalysis === 'object'
    ? config.dynamicPowerAnalysis
    : {};
  const dynamicRows = rows.map((row) => row.power_w === null && electricalPower(row) !== null
    ? { ...row, power_w: electricalPower(row) }
    : row);
  const dynamicPower = analyzeSetpointEvents(dynamicRows, {
    ...dynamicPowerConfig,
    commandField: dynamicPowerConfig.commandField || 'power_setpoint_w',
    actualField: dynamicPowerConfig.actualField || 'power_w',
    unit: dynamicPowerConfig.unit || 'W',
    powerUnit: dynamicPowerConfig.powerUnit || 'W'
  });
  const valueList = (field, selectedRows = rows) => selectedRows.map((row) => row[field]).filter((value) => value !== null);
  const steadySelection = selectSteadyRows(rows);
  const steadyRows = steadySelection.rows;
  const timestamps = valueList('timestamp_s');
  const temperatures = valueList('temperature_c');
  const pressures = valueList('pressure_bar');
  const leaks = valueList('leak_ppm');
  const steadyVoltage = valueList('voltage_v', steadyRows);
  const powerEvidence = powerCrossCheck(rows);
  const powers = rows.map((row) => electricalPower(row)).filter((value) => value !== null);
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
  const integrationEvidence = {
    maxIntervalS: quality.gapLimitS,
    energyConsumed: { segmentCount: 0, skippedGapCount: 0, skippedMissingCount: 0, skippedNonPositiveCount: 0, skippedSessionBoundaryCount: 0 },
    hydrogenVolume: { segmentCount: 0, skippedGapCount: 0, skippedMissingCount: 0, skippedNonPositiveCount: 0, skippedSessionBoundaryCount: 0 }
  };
  const hydrogenVolumeNl = integrateTrapezoid(rows, 'flow_slpm', 60, quality.gapLimitS, integrationEvidence.hydrogenVolume);
  const energyWh = rows.map((row) => ({ ...row, power_w: electricalPower(row) }));
  const energyConsumedWh = integrateTrapezoid(energyWh, 'power_w', 3600, quality.gapLimitS, integrationEvidence.energyConsumed);
  const specificEnergyKWhPerNm3 = hydrogenVolumeNl && energyConsumedWh !== null ? energyConsumedWh / hydrogenVolumeNl * 1000 : null;
  const uncertainty = calculateUncertainty(rows, { hydrogenVolumeNl, energyConsumedWh, specificEnergyKWhPerNm3 }, config.uncertaintyModel, quality.gapLimitS);
  const scope = scopeReadiness(config);
  const instruments = instrumentReadiness(config);
  const acquisition = acquisitionReadiness(config);
  const preCheck = preCheckReadiness(config);
  const testStages = testStageReadiness(config);
  const testConditions = testConditionReadiness(config);
  const measurementMethods = measurementMethodReadiness(config);
  const efficiency = efficiencyReadiness(config, rows, schema);
  const testSystem = testSystemReadiness(config);
  const environmentConditions = environmentConditionReadiness(config);
  const phaseResults = phaseResultReadiness(config, phaseMetrics);
  const report = reportReadiness(config, quality);
  const timeRef = (times) => times.length ? `，出现于 t=${times.slice(0, 3).join('、')} s` : '';
  const pressureDriftRows = steadyRows.length >= 2 ? steadyRows : rows;
  const sessionSummary = sessionDurationSummary(rows);
  const metrics = {
    sampleCount: rows.length,
    durationS: sessionSummary.totalDurationS,
    sessionDurationS: sessionSummary.totalDurationS,
    sessionCount: sessionSummary.sessionCount,
    completenessPct: quality.completenessPct,
    peakPowerW: powers.length ? Math.max(...powers) : null,
    powerSource: powerEvidence.status,
    powerCrossCheck: powerEvidence,
    integrationEvidence,
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
    efficiency_pct: efficiency.valuePct,
    pressureDriftBarPerMin: slopePerMinute(pressureDriftRows, 'pressure_bar'),
    steadyWindow: steadySelection.source,
    steadySampleCount: steadyRows.length
  };
  const acceptance = acceptanceReadiness(config, metrics, phaseMetrics);
  const compliance = complianceReadiness(config, missingMeasurements, missingPhases, scope, instruments, acceptance, report, phaseMetrics, acquisition, preCheck, testStages, testConditions, measurementMethods, efficiency, testSystem, environmentConditions, phaseResults, dataQuality);
  const workbookFormulaReview = workbookFormulaReviewReadiness(config, config.workbookEvidence || null);
  const issues = [];
  if (dynamicPower.enabled && dynamicPower.status === 'not_available') issues.push(issue('info', 'DYNAMIC_EVENT_FIELDS_MISSING', '动态功率事件分析未执行', dynamicPower.evidence, '补充功率设定值和实测功率字段，或在 profile 中关闭该可选分析。'));
  if (dynamicPower.enabled && dynamicPower.dataGapCount > 0) issues.push(issue('warn', 'DYNAMIC_EVENT_DATA_GAP', '动态事件时间轴存在数据缺口', `识别 ${dynamicPower.dataGapCount} 个超过配置上限的间隔；最大观测间隔 ${dynamicPower.maximumIntervalS ?? '—'} s`, '复核采集计划、时钟同步和文件边界；不使用插值替代原始记录。'));
  if (workbookFormulaReview.audit?.formulaCellCount > 0) issues.push(issue(workbookFormulaReview.required && !workbookFormulaReview.ready ? 'critical' : 'warn', workbookFormulaReview.required && !workbookFormulaReview.ready ? 'WORKBOOK_FORMULA_REVIEW_MISSING' : 'WORKBOOK_FORMULA_CACHE_USED', workbookFormulaReview.required && !workbookFormulaReview.ready ? '工作簿公式复核证据缺失' : '工作簿含公式缓存值', workbookFormulaReview.evidence, workbookFormulaReview.required && !workbookFormulaReview.ready ? '补充公式复核证据后再进入正式验收；系统不执行或重算工作簿公式。' : '正式验收前由企业批准人员复核公式缓存值或外部重算结果。'));
  if (!quality.hasEnoughRows) issues.push(issue('critical', 'DATA_TOO_SHORT', '测试数据不足', `当前只有 ${quality.rowCount} 条记录，至少需要 2 条`, '检查导出文件和测试记录范围。'));
  if (quality.missingHeaders.length) issues.push(issue('critical', 'SCHEMA_MISSING', '缺少分析所需字段', `缺少：${quality.missingHeaders.join('、')}`, '先完成字段映射或导出完整测试日志，再进行判定。'));
  if (schema.missingOptionalHeaders.includes('phase')) issues.push(issue('info', 'PHASE_OPTIONAL', '未提供工况字段', '将使用活动窗口回退估计稳态段', '如企业日志有工况/阶段字段，可在字段映射中补充。'));
  if (schema.missingOptionalHeaders.includes('hydrogen_purity_pct')) issues.push(issue('info', 'PURITY_OPTIONAL', '未提供氢气纯度字段', '当前只计算流量积分和电能积分，不能给出纯度结果', '按企业测试方法补充氢气纯度测量通道或在 profile 中明确不适用。'));
  if (schema.mappingWarnings.length) issues.push(issue('warn', 'MAPPING_OVERRIDE_MISSING', '企业字段映射未完全命中', schema.mappingWarnings.join('；'), '确认配置包表头与当前测试导出文件完全一致。'));
  if (config.approvalStatus === 'approved' && !compliance.approvalEvidence?.ready) issues.push(issue('critical', 'APPROVAL_EVIDENCE_MISSING', 'approved profile 缺少有效审批与修订证据', compliance.approvalEvidence?.evidence || '未提供 approvalEvidence', '补充审批人标识、审批日期、批准依据/工单号、当前 profile 修订号和修订证据引用后再进入人工符合性复核。'));
  if (config.approvalStatus === 'approved' && compliance.traceability?.required && !compliance.traceability.ready) issues.push(issue('critical', 'TRACEABILITY_EVIDENCE_MISSING', '测试对象追溯证据不完整', compliance.traceability.evidence, '补充企业 profile 要求的 testRunId、deviceId、testType、testDate、cellCount、activeAreaCm2 和 evidenceRef；系统不从文件名或数据值猜测。'));
  if (config.approvalStatus === 'approved' && compliance.editLog?.required && !compliance.editLog.ready) issues.push(issue('critical', 'EDIT_LOG_EVIDENCE_MISSING', '人工修改审计记录不完整', compliance.editLog.evidence, '补充字段、旧值摘要、新值摘要、操作者、时间、原因和证据引用；不要用未记录的覆盖操作替代审计记录。'));
  if (config.methodExecutionStatus === 'FULL_METHOD_IMPLEMENTED' && !compliance.methodImplementationEvidence?.ready) issues.push(issue('critical', 'METHOD_IMPLEMENTATION_EVIDENCE_MISSING', '完整方法执行声明缺少结构化实施证据', compliance.methodImplementationEvidence?.evidence || '未提供 methodImplementationEvidence', '补充标准来源、条款/步骤覆盖、每项实施证据、验证人、验证日期、验证引用，并清空未关闭缺口后再声明 FULL_METHOD_IMPLEMENTED。'));
  if (config.methodExecutionStatus === 'FULL_METHOD_IMPLEMENTED' && !compliance.fullMethodProfile?.ready) issues.push(issue('critical', 'FULL_METHOD_PROFILE_EVIDENCE_MISSING', '完整方法 profile 缺少验收、仪器或不确定度前置证据', compliance.fullMethodProfile?.evidence || '未提供完整方法 profile 前置证据', '补充企业批准验收规则、仪器类别要求和有效不确定度模型；在证据齐全前保持分析草稿。'));
  const convertedFields = Object.entries(schema.conversions).filter(([, transform]) => transform.mode !== 'identity');
  if (convertedFields.length) issues.push(issue('info', 'UNIT_CONVERTED', '已自动换算输入单位', convertedFields.map(([field, transform]) => `${field} ${transform.label}`).join('；'), '正式归档前确认原始表头和单位定义。'));
  if (quality.invalidValueCounts.timestamp_s > 0) issues.push(issue('critical', 'TIMESTAMP_INVALID', '时间轴存在无效值', `有 ${quality.invalidValueCounts.timestamp_s} 条记录无法解析 timestamp_s`, '修复时间列格式，避免趋势和漂移计算失真。'));
  if (quality.duplicateTimestampCount > 0 || quality.nonMonotonicCount > 0) issues.push(issue('warn', 'TIME_SEQUENCE', '时间轴需要复核', `重复时间戳 ${quality.duplicateTimestampCount} 条，逆序跳变 ${quality.nonMonotonicCount} 次`, '确认采样时钟、合并文件和排序方式。'));
  if (quality.nonPositiveIntervalCount > 0) issues.push(issue('warn', 'TIME_INTERVAL_INVALID', '时间间隔存在非正值', `非正时间间隔 ${quality.nonPositiveIntervalCount} 个；中位采样间隔 ${quality.medianIntervalS ?? '—'} s`, '确认重复/逆序记录和多文件拼接顺序，修复后再积分。'));
  if (quality.samplingGapCount !== null && quality.samplingGapCount > 0) issues.push(issue('warn', 'SAMPLING_GAP', '时间轴存在采样缺口', `超过当前 profile 缺口上限 ${quality.gapLimitS} s 的间隔 ${quality.samplingGapCount} 个`, '核对数据采集计划、时钟同步和缺失记录；不要用插值结果替代原始证据。'));
  if (dataQuality.failed.length || dataQuality.missing.length) issues.push(issue('critical', 'DATA_QUALITY_GATE', 'profile 数据质量门控未通过', dataQuality.evidence, '补齐采样计划/时间轴/阶段连续性证据后重新分析。'));
  if (quality.completenessPct < 98 && quality.missingHeaders.length === 0) issues.push(issue('warn', 'DATA_GAP', '测试数据存在缺口', `关键数值字段完整率 ${quality.completenessPct.toFixed(1)}%`, '补齐缺失字段后再做正式判定。'));
  if (metrics.peakTemperatureC !== null && metrics.peakTemperatureC > config.maxTemperatureC) issues.push(issue('critical', 'TEMP_HIGH', '温度超过演示阈值', `峰值 ${metrics.peakTemperatureC.toFixed(1)} °C > ${config.maxTemperatureC} °C${timeRef(metrics.peakTemperatureAtS)}`, '检查散热、负载爬升和温度传感器安装。'));
  if (metrics.peakPressureBar !== null && metrics.peakPressureBar > config.maxPressureBar) issues.push(issue('critical', 'PRESSURE_HIGH', '压力超过演示阈值', `峰值 ${metrics.peakPressureBar.toFixed(1)} bar > ${config.maxPressureBar} bar${timeRef(metrics.peakPressureAtS)}`, '暂停升载，检查调压与泄压回路。'));
  if (metrics.peakLeakPpm !== null && metrics.peakLeakPpm > config.maxLeakPpm) issues.push(issue('critical', 'LEAK_HIGH', '泄漏监测值超过演示阈值', `峰值 ${metrics.peakLeakPpm.toFixed(1)} ppm > ${config.maxLeakPpm} ppm${timeRef(metrics.peakLeakAtS)}`, '优先复核密封、采样管路与环境本底。'));
  if (missingMeasurements.length) issues.push(issue('critical', 'PERFORMANCE_FIELD_MISSING', '缺少 profile 要求的性能测量', `缺少：${missingMeasurements.join('、')}`, '补充企业方法要求的测量通道和数据采集记录后再生成正式性能结论。'));
  if (config.uncertaintyModelRequired && uncertainty.status !== 'calculated') issues.push(issue('critical', uncertainty.status === 'invalid' ? 'UNCERTAINTY_MODEL_INVALID' : 'UNCERTAINTY_MODEL_MISSING', 'profile 要求的不确定度传播未完成', uncertainty.boundary || '当前 profile 要求不确定度模型，但没有形成可计算结果', '补充合法的 first_order_rss 模型、coverageFactor 和适用测量标准不确定度。'));
  if (config.uncertaintyModelRequired && uncertainty.missingFields?.length) issues.push(issue('critical', 'UNCERTAINTY_INPUT_MISSING', '不确定度模型未覆盖已计算指标', `缺少输入不确定度：${uncertainty.missingFields.join('、')}`, '为报告中的相关测量量补充企业批准的标准不确定度；不能用默认值或不相干的派生通道替代。'));
  if (missingPhases.length) issues.push(issue('critical', 'PHASE_COVERAGE_MISSING', '缺少 profile 要求的测试段', `缺少：${missingPhases.join('、')}`, '按测试计划补齐对应工况或在 profile 中确认该测试段不适用。'));
  if (phaseMetrics.missing.length) issues.push(issue('critical', 'PHASE_METRIC_MISSING', '缺少 profile 要求的阶段计算指标', `缺少：${phaseMetrics.missing.join('、')}`, '确认相应阶段至少包含可计算的连续时间序列，并补齐功率、流量或工况数据。'));
  if (config.approvalStatus === 'approved' && !scope.ready) issues.push(issue('critical', 'SCOPE_NOT_READY', '设备适用范围未核对', scope.evidence, '补充设备家族、额定产氢压力/产量等适用范围证据；超出标准范围时改用适用方法。'));
  if (config.approvalStatus === 'approved' && !instruments.ready) issues.push(issue('critical', 'INSTRUMENT_EVIDENCE_MISSING', '仪器精度或校准证据不完整', instruments.evidence, '为每个 profile 要求的仪器类别提供结构化 id、精度/量程和校准证书引用。'));
  if (config.approvalStatus === 'approved' && acquisition.required && !acquisition.ready) issues.push(issue('critical', 'ACQUISITION_EVIDENCE_MISSING', '结构化数据采集证据不完整', acquisition.evidence, '补充采样频率、同步时钟、通道清单、单位和采集证据引用；不要用自由文本替代结构化记录。'));
  if (config.approvalStatus === 'approved' && preCheck.required && !preCheck.ready) issues.push(issue('critical', 'PRECHECK_EVIDENCE_MISSING', '试验前检查逐项证据不完整', preCheck.evidence, '为 profile 要求的每个前检查项目填写通过状态和证据引用；不适用项需由企业 profile 明确允许。'));
  if (config.approvalStatus === 'approved' && testStages.required && !testStages.ready) issues.push(issue('critical', 'TEST_STAGE_EVIDENCE_MISSING', '标准测试阶段证据不完整', testStages.evidence, '为 profile 要求的每个测试阶段填写完成状态和证据引用；系统不把自由文本计划视为阶段完成。'));
  if (config.approvalStatus === 'approved' && testSystem.required && !testSystem.ready) issues.push(issue('critical', 'TEST_SYSTEM_EVIDENCE_MISSING', '测试系统组成证据不完整', testSystem.evidence, '为 profile 要求的系统组成项目填写通过状态和证据引用；适用性由企业 profile 确认。'));
  if (config.approvalStatus === 'approved' && testConditions.required && !testConditions.ready) issues.push(issue('critical', 'TEST_CONDITION_EVIDENCE_MISSING', '测试条件或异常处置证据不完整', testConditions.evidence, '补充测试场所、环境条件、系统组成确认和异常处置引用；具体条件值由企业 profile/方法提供。'));
  if (config.approvalStatus === 'approved' && environmentConditions.required && !environmentConditions.ready) issues.push(issue('critical', 'ENVIRONMENT_CONDITION_EVIDENCE_MISSING', '环境条件证据不完整', environmentConditions.evidence, '补充 profile 要求的环境温度、湿度、气压等记录和证据引用；系统不猜标准条件或限值。'));
  if (config.approvalStatus === 'approved' && measurementMethods.required && !measurementMethods.ready) issues.push(issue('critical', 'MEASUREMENT_METHOD_EVIDENCE_MISSING', '测量方法证据不完整', measurementMethods.evidence, '为电输入、气体输出、环境条件和高频采集等 profile 要求提供方法引用、证据和测量字段覆盖；系统不猜仪器精度。'));
  if (config.approvalStatus === 'approved' && efficiency.required && !efficiency.ready) issues.push(issue('critical', 'EFFICIENCY_EVIDENCE_MISSING', '效率结果或批准公式缺失', efficiency.evidence, '提供实测 efficiency_pct，或提供企业批准的效率结果、公式引用和结果证据；系统不会自行推导效率。'));
  if (config.approvalStatus === 'approved' && phaseResults.required && !phaseResults.ready) issues.push(issue('critical', 'PHASE_RESULT_EVIDENCE_MISSING', '方法阶段结果证据不完整', phaseResults.evidence, '为 profile 要求的阶段提供可计算结果字段、阶段状态和证据引用；系统不把通用 KPI 自动宣称为标准结果。'));
  if (config.approvalStatus === 'approved' && !report.ready) issues.push(issue('critical', 'REPORT_FIELDS_MISSING', '正式报告字段证据不完整', report.evidence, '补齐报告所需目的、仪器、执行者、计算方法、图表和结论字段后再进入人工复核。'));
  if (config.approvalStatus === 'approved' && acceptance.status === 'not_configured') issues.push(issue('critical', 'ACCEPTANCE_RULES_MISSING', '缺少企业批准验收规则', acceptance.evidence, '导入由测试负责人批准的验收规则、单位、运算符和来源引用；不要使用演示阈值代替。'));
  if (config.approvalStatus === 'approved' && acceptance.status === 'missing_measurement') issues.push(issue('critical', 'ACCEPTANCE_MEASUREMENT_MISSING', '验收规则所需指标缺失', acceptance.evidence, '补齐规则要求的测量通道或将该规则标记为不适用并由负责人批准。'));
  if (config.approvalStatus === 'approved' && acceptance.status === 'failed') issues.push(issue('critical', 'ACCEPTANCE_RULE_FAIL', '企业验收规则未通过', acceptance.evidence, '先处置异常并按测试方法决定复测、偏差放行或不通过；系统不替代授权人员决定。'));
  const legacyAcceptanceCriteria = config.acceptanceCriteria || {};
  if (legacyAcceptanceCriteria.minHydrogenPurityPct !== undefined && metrics.minimumHydrogenPurityPct !== null && metrics.minimumHydrogenPurityPct < legacyAcceptanceCriteria.minHydrogenPurityPct) issues.push(issue('critical', 'PURITY_LOW', '氢气纯度低于 profile 验收准则', `最低纯度 ${metrics.minimumHydrogenPurityPct.toFixed(3)}% < ${legacyAcceptanceCriteria.minHydrogenPurityPct}%${timeRef(metrics.minimumHydrogenPurityAtS)}`, '复核纯度分析仪、净化系统和采样条件。'));
  if (legacyAcceptanceCriteria.maxSpecificEnergyKWhPerNm3 !== undefined && metrics.specificEnergyKWhPerNm3 !== null && metrics.specificEnergyKWhPerNm3 > legacyAcceptanceCriteria.maxSpecificEnergyKWhPerNm3) issues.push(issue('critical', 'SPECIFIC_ENERGY_HIGH', '单位制氢电耗高于 profile 验收准则', `单位电耗 ${metrics.specificEnergyKWhPerNm3.toFixed(3)} kWh/Nm³ > ${legacyAcceptanceCriteria.maxSpecificEnergyKWhPerNm3} kWh/Nm³`, '复核功率、产氢量、稳态窗口和企业计算方法。'));
  if (metrics.steadyVoltageStdV !== null && metrics.steadyVoltageStdV > config.maxVoltageStdV) issues.push(issue('warn', 'VOLTAGE_UNSTABLE', '稳态电压波动偏大', `稳态标准差 ${metrics.steadyVoltageStdV.toFixed(3)} V > ${config.maxVoltageStdV} V`, '检查供电纹波、负载控制和稳态窗口选择。'));
  if (Math.abs(metrics.pressureDriftBarPerMin) > config.maxPressureDriftBarPerMin) issues.push(issue('warn', 'PRESSURE_DRIFT', '稳态压力仍在漂移', `窗口 ${metrics.steadyWindow} 的压力斜率 ${metrics.pressureDriftBarPerMin.toFixed(2)} bar/min`, '延长稳态时间并复核压力闭环控制。'));
  if (!issues.length) issues.push(issue('info', 'ALL_CLEAR', '未发现超出当前规则的异常', '关键 KPI 均落在演示阈值内', '可进入人工复核与正式归档。'));
  const verdict = issues.some((item) => item.severity === 'critical') ? 'FAIL' : issues.some((item) => item.severity === 'warn') ? 'WARN' : 'PASS';
  const workflow = workflowReadiness(config, quality, schema, compliance, verdict, uncertainty);
  const criticalCount = issues.filter((item) => item.severity === 'critical').length;
  const narrative = verdict === 'FAIL'
    ? `本次测试自动判定为需复核：发现 ${criticalCount} 项高优先级风险。系统已将异常指标、阈值和建议动作绑定到同一证据链，工程师可先处理安全相关项，再决定是否重测。`
    : verdict === 'WARN'
      ? '本次测试未触发高优先级安全规则，但存在需要工程师复核的趋势或数据质量问题，建议在正式归档前补测。'
      : '本次测试关键指标未触发当前规则，建议结合企业标准和设备工况完成最终人工签核。';
  const result = {
    generatedAt: new Date().toISOString(),
    config,
    rows,
    metrics,
    quality,
    schema,
    compliance,
    acquisition,
    preCheck,
    acceptance,
    uncertainty,
    workflow,
    workbookFormulaReview,
    phases: phaseSummary(rows),
    phaseCoverage,
    phaseMetrics,
    dynamicPower,
    issues,
    verdict,
    narrative,
    source: { type: 'csv', rowCount: rows.length, requiredFields: REQUIRED_FIELDS }
  };
  const evaluatedResult = applyEvaluationMode(result);
  evaluatedResult.releaseGate = releaseGate(evaluatedResult);
  return evaluatedResult;
}

export function publicConfig(config = {}) {
  const { testMetadata, durabilityReports, parameterConfig, approvalEvidence, methodImplementationEvidence, workbookEvidence: _workbookEvidence, ...safeConfig } = config || {};
  const metadata = testMetadata && typeof testMetadata === 'object' ? testMetadata : {};
  const metadataPresence = Object.fromEntries(Object.keys(metadata).map((field) => [field, Boolean(metadata[field])]));
  const approval = approvalEvidenceReadiness(approvalEvidence, config?.revision, config?.approvalStatus);
  const methodEvidence = methodImplementationEvidenceReadiness(methodImplementationEvidence, config?.methodId, config?.revision, config?.methodExecutionStatus);
  const traceability = traceabilityReadiness(config);
  const editLog = editLogReadiness(config);
  return {
    ...safeConfig,
    testMetadata: metadataPresence,
    traceabilityEvidence: { required: traceability.required, status: traceability.status, ready: traceability.ready, missing: traceability.missing, malformed: traceability.malformed, requiredFieldCount: traceability.requiredFieldCount, observedFieldCount: traceability.observedFieldCount },
    editLogEvidence: { required: editLog.required, status: editLog.status, ready: editLog.ready, missing: editLog.missing, malformed: editLog.malformed, requiredEntryCount: editLog.requiredEntryCount, observedRecordCount: editLog.observedRecordCount, validRecordCount: editLog.validRecordCount },
    approvalEvidence: {
      required: approval.required,
      present: Boolean(approvalEvidence && typeof approvalEvidence === 'object' && !Array.isArray(approvalEvidence)),
      status: approval.status,
      ready: approval.ready,
      missing: approval.missing,
      malformed: approval.malformed,
      revisionMismatch: approval.revisionMismatch
    },
    methodImplementationEvidence: {
      required: methodEvidence.required,
      status: methodEvidence.status,
      ready: methodEvidence.ready,
      missing: methodEvidence.missing,
      malformed: methodEvidence.malformed,
      incompleteItems: methodEvidence.incompleteItems,
      openGapCount: methodEvidence.openGaps.length,
      sourceRefCount: methodEvidence.sourceRefCount,
      coverageItemCount: methodEvidence.coverageItemCount,
      verifierPresent: methodEvidence.verifierPresent,
      verifiedAtPresent: methodEvidence.verifiedAtPresent,
      verificationRefPresent: methodEvidence.verificationRefPresent,
      methodMismatch: methodEvidence.methodMismatch
    },
    metadataPresent: metadataPresence,
    durabilityReportCount: Array.isArray(durabilityReports) ? durabilityReports.length : 0,
    parameterConfig: parameterConfig && typeof parameterConfig === 'object' ? {
      ok: Boolean(parameterConfig.ok),
      parameterSheet: parameterConfig.parameterSheet || null,
      targetSheet: parameterConfig.targetSheet || null,
      parameterCount: Array.isArray(parameterConfig.parameters) ? parameterConfig.parameters.length : 0,
      targetConditionCount: Array.isArray(parameterConfig.targetConditions) ? parameterConfig.targetConditions.length : 0,
      errors: Array.isArray(parameterConfig.errors) ? parameterConfig.errors : [],
      warnings: Array.isArray(parameterConfig.warnings) ? parameterConfig.warnings : []
    } : null
  };
}

function publicWorkbookEvidence(evidence = null) {
  if (!evidence || typeof evidence !== 'object') return evidence;
  const report = evidence.reportEvidence;
  const catalog = evidence.parameterCatalog;
  return {
    parserVersion: evidence.parserVersion || null,
    sheetNames: Array.isArray(evidence.sheetNames) ? evidence.sheetNames : [],
    summary: evidence.summary || null,
    formulaAudit: evidence.formulaAudit ? {
      status: evidence.formulaAudit.status || null,
      formulaCellCount: evidence.formulaAudit.formulaCellCount || 0,
      formulaSheetCount: evidence.formulaAudit.formulaSheetCount || 0,
      cachedFormulaCellCount: evidence.formulaAudit.cachedFormulaCellCount || 0,
      uncachedFormulaCellCount: evidence.formulaAudit.uncachedFormulaCellCount || 0,
      externalReferenceCount: evidence.formulaAudit.externalReferenceCount || 0,
      externalFunctionCount: evidence.formulaAudit.externalFunctionCount || 0,
      volatileFormulaCount: evidence.formulaAudit.volatileFormulaCount || 0,
      macroPresent: Boolean(evidence.formulaAudit.macroPresent),
      externalLinksPresent: Boolean(evidence.formulaAudit.externalLinksPresent),
      activeContentPresent: Boolean(evidence.formulaAudit.activeContentPresent),
      calculationChainPresent: Boolean(evidence.formulaAudit.calculationChainPresent),
      bySheet: Array.isArray(evidence.formulaAudit.bySheet) ? evidence.formulaAudit.bySheet.map(({ sheetName, formulaCellCount, cachedFormulaCellCount, uncachedFormulaCellCount, externalReferenceCount, externalFunctionCount, volatileFormulaCount }) => ({ sheetName, formulaCellCount, cachedFormulaCellCount, uncachedFormulaCellCount, externalReferenceCount, externalFunctionCount, volatileFormulaCount })) : [],
      boundary: evidence.formulaAudit.boundary || null
    } : null,
    sheetAudit: Array.isArray(evidence.sheetAudit) ? evidence.sheetAudit.map(({ name, role, status, selected, rowCount, nonEmptyRowCount, columnCount, headerRow, evidence: sheetEvidence }) => ({ name, role, status, selected, rowCount, nonEmptyRowCount, columnCount, headerRow, evidence: sheetEvidence })) : [],
    staticCellMatrices: Array.isArray(evidence.staticCellMatrices) ? evidence.staticCellMatrices.map((matrix) => ({ sheetName: matrix.sheetName, role: matrix.role, status: matrix.status, headerRow: matrix.headerRow, cellCount: matrix.cellCount, dataRowCount: matrix.dataRowCount, validPointCount: matrix.validPointCount, missingPointCount: matrix.missingPointCount, completenessPct: matrix.completenessPct, statistics: matrix.statistics, perCell: matrix.perCell })) : [],
    reportEvidence: report ? { sheetName: report.sheetName, role: report.role, status: report.status, metadataFieldNames: report.metadataFieldNames || [], fieldCount: report.fieldCount || 0, performanceChecks: { recordCount: report.performanceChecks?.recordCount || 0, passedCount: report.performanceChecks?.passedCount || 0, failedCount: report.performanceChecks?.failedCount || 0 }, polarizationPointCount: report.polarization?.pointCount || 0, stabilityPointCount: report.stability?.pointCount || 0, cellVoltageSummaryPresent: Boolean(report.cellVoltageSummary), signoffFieldCount: report.signoff?.length || 0, noteCount: report.notes?.length || 0, boundary: report.boundary } : null,
    deviceIdentity: evidence.deviceIdentity ? { sheetName: evidence.deviceIdentity.sheetName, role: evidence.deviceIdentity.role, status: evidence.deviceIdentity.status, fieldCount: evidence.deviceIdentity.fieldCount, boundary: evidence.deviceIdentity.boundary } : null,
    parameterCatalog: catalog ? { sheetName: catalog.sheetName, role: catalog.role, status: catalog.status, productColumnCount: catalog.productColumnCount, parameterRowCount: catalog.parameterRowCount, fieldNames: catalog.fieldNames || [], boundary: catalog.boundary } : null,
    timeSeries: evidence.timeSeries ? { sheetName: evidence.timeSeries.sheetName, headerRow: evidence.timeSeries.headerRow, rowCount: evidence.timeSeries.rowCount, columnCount: evidence.timeSeries.columnCount, boundary: evidence.timeSeries.boundary } : null
  };
}

export function publicDataset(dataset = null) {
  if (!dataset || typeof dataset !== 'object') return dataset;
  const { reports, crossReportSummary, workbookEvidence, ...safeDataset } = dataset;
  const publicCrossReportSummary = crossReportSummary && typeof crossReportSummary === 'object'
    ? {
      ...crossReportSummary,
      byTargetPower: Array.isArray(crossReportSummary.byTargetPower)
        ? crossReportSummary.byTargetPower.map(({ series: _series, ...summary }) => summary)
        : []
    }
    : crossReportSummary;
  return {
    ...safeDataset,
    crossReportSummary: publicCrossReportSummary,
    workbookEvidence: publicWorkbookEvidence(workbookEvidence),
    reports: Array.isArray(reports) ? reports.map((report) => ({
      metadataPresent: Object.fromEntries(Object.keys(report?.metadata || {}).map((field) => [field, Boolean(report.metadata[field])])),
      pointCount: Array.isArray(report?.points) ? report.points.length : 0,
      warningCount: Array.isArray(report?.warnings) ? report.warnings.length : 0
    })) : []
  };
}

function publicCompliance(compliance = {}) {
  if (!compliance || typeof compliance !== 'object') return compliance;
  const safe = { ...compliance };
  if (safe.efficiency && typeof safe.efficiency === 'object') {
    const { formulaRef, sourceRef, ...efficiency } = safe.efficiency;
    safe.efficiency = { ...efficiency, formulaPresent: Boolean(formulaRef), sourceRefPresent: Boolean(sourceRef) };
  }
  if (safe.approvalEvidence && typeof safe.approvalEvidence === 'object') {
    const { approverId: _approverId, approvalDate: _approvalDate, approvalRef: _approvalRef, profileRevision: _profileRevision, profileRevisionRef: _profileRevisionRef, ...approvalEvidence } = safe.approvalEvidence;
    safe.approvalEvidence = approvalEvidence;
  }
  if (safe.methodImplementationEvidence && typeof safe.methodImplementationEvidence === 'object') {
    const { openGaps, ...methodEvidence } = safe.methodImplementationEvidence;
    safe.methodImplementationEvidence = { ...methodEvidence, openGapCount: Array.isArray(openGaps) ? openGaps.length : 0 };
  }
  return safe;
}

export function publicAnalysis(result) {
  const { rows, config, dataset, ...safeResult } = result;
  return { ...safeResult, compliance: publicCompliance(safeResult.compliance), config: publicConfig(config), dataset: publicDataset(dataset) };
}

function enterpriseReportMarkdown(inputResult, fileName, options = {}) {
  const workbook = inputResult.dataset?.workbookEvidence;
  const workbookAppendix = workbook ? `\n\n原始 XLSX 工作表证据摘要：${workbook.summary?.sheetCount ?? workbook.sheetNames?.length ?? 0} 个工作表，已结构化 ${workbook.summary?.parsedSheetCount ?? '—'} 个；主时序表 ${workbook.summary?.selectedTimeSeriesSheet || workbook.timeSeries?.sheetName || '—'}（${workbook.summary?.selectedTimeSeriesRowCount ?? workbook.timeSeries?.rowCount ?? 0} 行）；静态单片矩阵 ${workbook.summary?.staticMatrixCount ?? 0} 个、有效点 ${workbook.summary?.staticMatrixValidPointCount ?? 0}、缺失点 ${workbook.summary?.staticMatrixMissingPointCount ?? 0}；出厂报告检测项目 ${workbook.summary?.reportPerformanceCheckCount ?? 0} 条、报告极化点 ${workbook.summary?.reportPolarizationPointCount ?? 0} 个、报告稳定性点 ${workbook.summary?.reportStabilityPointCount ?? 0} 个；BD 身份字段 ${workbook.summary?.deviceIdentityFieldCount ?? 0} 个；参数目录 ${workbook.summary?.parameterCatalogRowCount ?? 0} 行。公式审计：${workbook.summary?.formulaCellCount ?? workbook.formulaAudit?.formulaCellCount ?? 0} 个公式单元格，缓存值 ${workbook.summary?.cachedFormulaCellCount ?? workbook.formulaAudit?.cachedFormulaCellCount ?? 0} 个，状态 ${workbook.summary?.formulaReviewStatus ?? workbook.formulaAudit?.status ?? '未提供'}；SheetJS 不执行或重算公式，正式验收前必须绑定企业公式复核证据。以上是原始资料追溯/描述性证据，不是国家标准符合性结论。` : '';
  const standardRefs = Array.isArray(inputResult.compliance?.standardRefs) ? inputResult.compliance.standardRefs : [];
  const standardsSection = `\n\n## 标准引用与实施边界\n\n- 标准引用：${standardRefs.length ? standardRefs.map((reference) => `${reference.id} · ${reference.title || '未提供标题'} · ${reference.status || '未声明状态'}`).join('；') : '未配置'}\n- 方法执行状态：${inputResult.compliance?.methodExecutionStatus || '未声明'}；方法 ${inputResult.compliance?.methodId || '未指定'}；版本 ${inputResult.compliance?.revision || '未指定'}\n- 标准引用证据：${inputResult.compliance?.standardReferenceEvidence?.evidence || '未形成标准引用证据'}\n- 方法来源定位：${inputResult.compliance?.methodSource ? `${inputResult.compliance.methodSource.sourceId} · ${inputResult.compliance.methodSource.locator}` : '未配置'}\n- 完整方法实施证据：${inputResult.compliance?.methodImplementationEvidence?.evidence || '当前未声明 FULL_METHOD_IMPLEMENTED'}\n- 完整方法 profile 前置证据：${inputResult.compliance?.fullMethodProfile?.evidence || '当前未声明 FULL_METHOD_IMPLEMENTED'}\n- 范围/流程证据：${inputResult.compliance?.scopeEvidence || '未配置'}；${inputResult.compliance?.workflowEvidence || '未配置'}\n- 边界：上述引用和字段只证明 profile/证据链状态，不证明完整标准试验、仪器精度、计量溯源、安全验证、实验室认可或企业验收结论。`;
  const result = { ...inputResult, narrative: `${inputResult.narrative || ''}${standardsSection}${workbookAppendix}` };
  const status = result.verdict === 'PASS' ? '通过' : result.verdict === 'WARN' ? '需复核' : result.verdict === 'DESCRIPTIVE' ? '仅描述' : '未通过';
  const dataset = result.dataset;
  const uncertainty = result.uncertainty || {};
  const uncertaintyRows = (uncertainty.metricDetails || []).map((item) => `${item.metric}=${item.value ?? '—'} ± ${item.expandedUncertainty ?? '—'} ${item.unit || ''}（${item.status}；${item.source || '—'}）`).join('；');
  const uncertaintySection = `\n\n## 测量不确定度传播（工程辅助）\n\n- 状态：${uncertainty.status || 'not_configured'}${uncertainty.method ? `；方法 ${uncertainty.method}；k=${uncertainty.coverageFactor}` : ''}\n- 已计算指标：${uncertaintyRows || '—'}\n- 缺少输入不确定度：${uncertainty.missingFields?.join('、') || '无'}\n- 说明：${uncertainty.boundary || '未配置企业批准的不确定度模型；不填默认误差。'}\n${(uncertainty.assumptions || []).map((item) => `- 假设/限制：${item}`).join('\n')}`;
  const sessions = Array.isArray(dataset.sessions) ? dataset.sessions : [];
  const sessionEvidence = sessions.length
    ? `\n- 独立会话：${sessions.length} 个；会话边界：${dataset.sessionBoundaryCount ?? Math.max(0, sessions.length - 1)} 个；时序统计、平台/稳定段不跨文件拼接。\n- 会话明细：${sessions.map((session) => `${session.sourceFile || session.sessionId}（${session.rowCount ?? '—'} 条，${session.durationS ?? '—'} s）`).join('；')}`
    : '';
  const common = `# 氢能设备测试自动报告\n\n- 数据文件：${fileName}\n- 数据集：${dataset.label}\n- 自动判定：**${status}（${result.verdict}）**\n- 交付级别：**${result.releaseGate?.status || 'ANALYSIS_DRAFT'}** · ${result.releaseGate?.label || '分析草稿，不得作为放行报告'}\n- 未通过门控：${result.releaseGate?.blockedReasons?.join('、') || '无'}\n- 生成时间：${result.generatedAt}\n- 结论边界：这是企业资料结构适配与工程复核前处理，不是安全认证或企业正式符合性结论。\n\n## 结论\n\n${result.narrative}\n\n## 数据质量与字段追溯\n\n- 记录数：${result.quality.rowCount}\n- 关键字段完整率：${result.quality.completenessPct.toFixed(1)}%\n- 重复时间戳：${result.quality.duplicateTimestampCount} 条；逆序：${result.quality.nonMonotonicCount} 次\n- 字段映射：${Object.entries(result.schema.mapping).filter(([, source]) => source).map(([field, source]) => `${field}←${source}`).join('；')}\n\n## 异常与动作\n\n${result.issues.map((item) => `- **${item.severity.toUpperCase()}｜${item.title}**：${item.evidence}。建议：${item.recommendation}`).join('\n')}${uncertaintySection}\n`;
  if (result.datasetType === 'durability') {
    const points = dataset.points.map((point) => `| ${point.targetPowerKw} | ${point.netPowerKw ?? '—'} | ${point.averageCellVoltageMv ?? '—'} | ${point.averageDeviationMv ?? '—'} | ${point.voltageVariance ?? '—'} |`).join('\n');
    const reports = dataset.reports.map((report) => `- ${report.metadata?.测试方案 || '耐久报告'}：${report.metadata?.测试结果 || '未标注'}；${report.points.length} 个功率点`).join('\n');
    const crossReport = dataset.crossReportSummary?.status === 'descriptive_only'
      ? `\n## 跨报告耐久描述性汇总（非标准判定）\n\n- 报告数：${dataset.crossReportSummary.reportCount}\n- 排序依据：${dataset.crossReportSummary.orderingBasis}\n- 原始报告结果分布：${Object.entries(dataset.crossReportSummary.resultCounts || {}).map(([key, value]) => `${key} ${value} 份`).join('；') || '未标注'}\n- 可比性筛查：${dataset.crossReportSummary.comparabilityAudit?.auditStatus || '未执行'}；${dataset.crossReportSummary.comparabilityAudit?.comparable ? '未发现元数据/功率集合/时间重叠不一致' : `发现 ${dataset.crossReportSummary.comparabilityAudit?.issueCodes?.length || 0} 项需复核问题`}；时间间隔 ${dataset.crossReportSummary.comparabilityAudit?.gapCount ?? '—'} 个、重叠 ${dataset.crossReportSummary.comparabilityAudit?.overlapCount ?? '—'} 个\n- 可比性问题代码：${dataset.crossReportSummary.comparabilityAudit?.issueCodes?.join('、') || '无'}\n- 边界：${dataset.crossReportSummary.boundary}\n- 可比性边界：${dataset.crossReportSummary.comparabilityAudit?.boundary || '未执行元数据筛查'}\n\n| 目标功率(kW) | 报告数 | 平均单体电压首→末(mV) | 首末变化(mV) | 离均差首→末(mV) | 最大离均差(mV) |\n|---:|---:|---:|---:|---:|---:|\n${dataset.crossReportSummary.byTargetPower.map((item) => `| ${item.targetPowerKw} | ${item.reportCount} | ${item.firstAverageCellVoltageMv ?? '—'} → ${item.lastAverageCellVoltageMv ?? '—'} | ${item.averageCellVoltageDeltaMv ?? '—'} | ${item.firstAverageDeviationMv ?? '—'} → ${item.lastAverageDeviationMv ?? '—'} | ${item.maximumAverageDeviationMv ?? '—'} |`).join('\n') || '| — | — | — | — | — | — |'}\n`
      : '';
    return `${common}\n## 耐久功率点统计\n\n${reports}\n${crossReport}\n| 目标功率(kW) | 净输出功率(kW) | 平均单体电压(mV) | 离均差(mV) | 电压方差 |\n|---:|---:|---:|---:|---:|\n${points}\n\n- 离均差预警：${dataset.rules.maxDeviationMv ?? '未配置'} mV\n- 平均单体电压下限：${dataset.rules.minAverageCellVoltageMv ?? '未配置'} mV\n\n## 测试流程门控\n\n- 状态：${result.workflow.status}\n- 下一步：${result.workflow.nextAction}\n${result.workflow.steps.map((step) => `- ${step.status.toUpperCase()}｜${step.label}：${step.evidence}`).join('\n')}\n${options.aiDraft?.draft ? `\n## 报告初稿（结构化证据模式）\n\n${options.aiDraft.draft}\n` : ''}`;
  }
  if (result.datasetType === 'vehicle') {
    const points = dataset.performancePoints.length ? dataset.performancePoints.map((point) => `| ${point.targetCurrentA} | ${point.sourceFile || point.sessionId || '—'} | ${point.startS.toFixed(0)} | ${point.endS.toFixed(0)} | ${point.durationS.toFixed(0)} | ${point.averageCellVoltageV?.toFixed(3) ?? '—'} | ${point.averageNetPowerKw?.toFixed(3) ?? '—'} |`).join('\n') : dataset.inferredSegments?.length ? dataset.inferredSegments.map((point) => `| 描述性 ${point.averageCurrentA?.toFixed?.(2) ?? '—'} | ${point.sourceFile || point.sessionId || '—'} | ${point.startS?.toFixed?.(0) ?? '—'} | ${point.endS?.toFixed?.(0) ?? '—'} | ${point.durationS?.toFixed?.(0) ?? '—'} | ${point.averageCellVoltageV?.toFixed?.(3) ?? '—'} | ${point.averageNetPowerKw?.toFixed?.(3) ?? '—'} |`).join('\n') : '| — | — | — | — | — | — | 未配置目标电流 |';
    const forecast = Object.values(dataset.insulation.forecast).map((item) => `- ${item.threshold} kΩ：趋势 ${item.trend.slopePerDay === null ? '不足以拟合' : `${item.trend.slopePerDay.toFixed(3)} kΩ/日`}；${item.forecast?.status === 'forecast' ? `预计 ${item.forecast.days.toFixed(1)} 日触及` : item.forecast?.status === 'already_below' ? '当前已有点低于该线' : '未形成下降预测'}`).join('\n');
    const trends = [`- 配置横轴：${dataset.trendXAxisLabel || dataset.trendXAxis || '—'}；请求 ${dataset.trendXAxisRequested || '—'}；模型：${dataset.trendModel === 'quadratic' ? '二次多项式' : '线性'}${dataset.trendSelection?.fallbackReason ? `；${dataset.trendSelection.fallbackReason}` : ''}`, ...Object.entries(dataset.performanceTrend || {}).map(([field, trend]) => `- ${field}：模型 ${trend.model || 'linear'}；横轴 ${trend.xLabel || trend.x || '—'}；${trend.pointCount} 点；状态 ${trend.status || '—'}；R² ${trend.rSquared ?? '—'}；斜率/日 ${trend.slopePerDay ?? '—'}`)].join('\n');
    const signalCatalog = (dataset.signalCatalog || []).map((signal) => `| ${signal.source} | ${signal.numericCount}/${signal.rowCount} | ${signal.completenessPct.toFixed(1)}% | ${signal.min ?? '—'} | ${signal.max ?? '—'} |`).join('\n') || '| — | — | — | — | — |';
    const contextChecks = (dataset.crossChecks || []).map((check) => `| ${check.code} | ${check.targetSource} | ${check.actualSource} | ${check.deviation.mean ?? '—'} | ${check.unit} |`).join('\n') || '| — | — | — | — | — |';
    const coverage = dataset.coverage || {};
    return `${common}${sessionEvidence}\n\n## 车辆目标电流段统计\n\n- 目标电流：${dataset.targetCurrents.length ? dataset.targetCurrents.join('、') + ' A' : '未配置'}\n- 允许波动：±${dataset.targetToleranceA} A；最短持续时间：${dataset.minimumDurationS} s\n- 左轴信号：${dataset.signalAxes?.left || dataset.selectedSignal || '未选择'}；右轴信号：${dataset.signalAxes?.right || dataset.secondarySignal || '不显示'}（两轴独立缩放，仅用于展示/核对）\n- 统计时间窗口：${dataset.analysisWindow?.startS ?? 0}–${dataset.analysisWindow?.endS ?? '—'} s；使用 ${dataset.analysisWindow?.rowCount ?? result.quality.rowCount}/${dataset.analysisWindow?.totalRowCount ?? result.quality.rowCount} 条记录\n\n## 字段覆盖边界\n\n- 原始信号总数：${coverage.totalSignals ?? dataset.signalCatalog?.length ?? 0}；进入核心分析/交叉核对：${coverage.analysisSignals ?? '—'}；仅目录保留：${coverage.catalogOnlySignals?.length ?? '—'}\n- 说明：车辆 46 列全部进入信号目录；只有配置为核心输入或交叉核对的字段进入 KPI/趋势，未配置业务规则的字段不自动生成通过/失败结论。\n\n## 可用车辆信号目录\n\n| 原始信号 | 数值记录/总记录 | 完整率(%) | 最小值 | 最大值 | 使用层级 |\n|---|---:|---:|---:|---:|---|\n${(dataset.signalCatalog || []).map((signal) => `| ${signal.source} | ${signal.numericCount}/${signal.rowCount} | ${signal.completenessPct.toFixed(1)}% | ${signal.min ?? '—'} | ${signal.max ?? '—'} | ${signal.usage || '—'} |`).join('\n') || '| — | — | — | — | — | — |'}\n\n## 设定/实测交叉核对\n\n| 检查 | 设定字段 | 实测字段 | 平均偏差 | 单位 |\n|---|---|---|---:|---|\n${contextChecks}\n\n| 目标电流 A | 来源会话 | 起点 s | 终点 s | 持续 s | 平均单体电压 V | 平均净功率 kW |\n|---:|---|---:|---:|---:|---:|---:|\n${points}\n\n## 性能趋势参数\n\n${trends || '- 未配置目标电流点。'}\n\n## 绝缘阻值统计\n\n- 有效记录：${dataset.insulation.validCount}；过滤记录：${dataset.insulation.invalidCount}\n- 10 分钟窗口：${dataset.insulation.points.length} 个\n${forecast}\n\n## 测试流程门控\n\n- 状态：${result.workflow.status}\n- 下一步：${result.workflow.nextAction}\n${result.workflow.steps.map((step) => `- ${step.status.toUpperCase()}｜${step.label}：${step.evidence}`).join('\n')}\n${options.aiDraft?.draft ? `\n## 报告初稿（结构化证据模式）\n\n${options.aiDraft.draft}\n` : ''}`;
  }
  const platformRows = (dataset.platforms || []).map((item) => `| ${item.platformId || item.conditionId} | ${item.targetCurrentA ?? '—'} | ${item.effectiveDurationS ?? item.durationS ?? '—'} | ${item.status || '—'} |`).join('\n') || '| — | — | — | 未配置目标工况 |';
  const comparisonRows = (dataset.performancePoints || []).flatMap((point) => (point.parameterComparisons || []).map((comparison) => `| ${point.platformId || point.conditionId} | ${comparison.code} | ${comparison.target ?? '—'} | ${comparison.actualMean ?? '—'} | ${comparison.actualMin ?? '—'} | ${comparison.actualMax ?? '—'} | ${comparison.actualStd ?? '—'} | ${comparison.absoluteDeviation ?? '—'} | ${comparison.relativeDeviationPct ?? '—'} | ${comparison.exceedDurationS ?? '—'} | ${comparison.exceedRatioPct ?? '—'} | ${comparison.status} |`)).join('\n') || '| — | — | — | — | — | — | — | — | — | — | — | 未配置目标工况 |';
  const coverage = dataset.coverage || {};
  const settingChecks = (dataset.settingCrossChecks || []).map((check) => `| ${check.code} | ${check.targetSource} | ${check.actualSource} | ${check.deviation.mean ?? '—'} | ${check.unit} |`).join('\n') || '| — | — | — | — | — |';
  const feedback = (dataset.feedbackSignals || []).map((signal) => `| ${signal.source} | ${signal.numericCount}/${signal.rowCount} | ${signal.completenessPct.toFixed(1)}% | ${signal.mean ?? '—'} |`).join('\n') || '| — | — | — | — |';
  const relativeStability = `\n- 氢气计量比：${dataset.metrics.hydrogenStoich?.mean ?? '—'}；空气计量比：${dataset.metrics.airStoich?.mean ?? '—'}；公式状态：${dataset.stoich?.status || '未配置'}`
    + (dataset.relativeStability?.enabled && dataset.relativeStability?.rules?.length
      ? `\n\n## 无目标工况时的相对稳定性描述筛选（非正式稳定点）\n\n- 模式：${dataset.relativeStability.center} 中心；窗口 ${dataset.relativeStability.windowS} s；规则 ${dataset.relativeStability.rules.map((rule) => `${rule.code || rule.field} ≤ ${rule.maxDeviation} ${rule.unit || ''}`).join('、')}\n- 候选数：${dataset.inferredSegments?.length || 0}\n- 边界：${dataset.relativeStability.boundary}\n`
      : '');
  return `${common}\n## 电堆一致性摘要\n\n- 导出单片通道：${dataset.cellChannelCount}\n- 片数参数最大值：${dataset.configuredCellCount || '未提供'}\n- 平均电流：${dataset.metrics.averageCurrentA?.toFixed(3) ?? '—'} A\n- 平均电压：${dataset.metrics.averageVoltageV?.toFixed(3) ?? '—'} V\n- 峰值功率：${dataset.metrics.peakPowerKw?.toFixed(3) ?? '—'} kW\n- 平均单片电压：${dataset.metrics.averageCellVoltageV?.toFixed(3) ?? '—'} V\n- 最大单片电压极差：${dataset.metrics.cellSpreadMaxV?.toFixed(3) ?? '—'} V\n- 单片电压总体标准差：${dataset.metrics.cellValueStdV?.toFixed(4) ?? '—'} V\n- 电流平台：${dataset.platforms?.length || 0} 个；有效稳定区间：${dataset.performancePoints?.length || 0} 个${relativeStability}\n## 字段覆盖边界\n\n- 原始信号总数：${coverage.totalSignals ?? '—'}；进入核心分析/交叉核对：${coverage.analysisSignals ?? '—'}；仅目录保留：${coverage.catalogOnlySignals?.length ?? '—'}\n- 说明：127 列原始字段全部进入字段目录；设定值只在存在对应实测字段时做偏差核对，阀/泵反馈保留完整率和分布摘要，未配置业务规则时不自动生成通过/失败结论。\n\n## 设定/实测交叉核对\n\n| 检查 | 设定字段 | 实测字段 | 平均偏差 | 单位 |\n|---|---|---|---:|---|\n${settingChecks}\n\n## 阀/泵反馈摘要\n\n| 原始信号 | 数值记录/总记录 | 完整率(%) | 均值 |\n|---|---:|---:|---:|\n${feedback}\n\n| 平台 | 目标电流(A) | 有效持续(s) | 状态 |\n|---|---:|---:|---|\n${platformRows}\n\n## 目标工况对比\n\n| 平台 | 参数 | 目标 | 实际均值 | 最小 | 最大 | 标准差 | 绝对偏差 | 相对偏差(%) | 超限时长(s) | 超限比例(%) | 状态 |\n|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|\n${comparisonRows}\n\n## 测试流程门控\n\n- 状态：${result.workflow.status}\n- 下一步：${result.workflow.nextAction}\n${result.workflow.steps.map((step) => `- ${step.status.toUpperCase()}｜${step.label}：${step.evidence}`).join('\n')}\n${options.aiDraft?.draft ? `\n## 报告初稿（结构化证据模式）\n\n${options.aiDraft.draft}\n` : ''}`;
}

function addDynamicVehicleSection(result, markdown) {
  const dynamic = result.datasetType === 'vehicle' ? result.dataset?.dynamicAnalysis : null;
  if (!dynamic?.enabled) return markdown;
  const rows = (dynamic.events || []).slice(0, 100).map((event) => `| ${event.id} | ${event.direction === 'up' ? '升载' : '降载'} | ${event.commandFrom} → ${event.commandTo} | ±${event.responseBand.toFixed(3)} | ${event.responseTimeS?.toFixed(3) ?? '—'} | ${Math.max(event.maxActualPowerRampUpPerS ?? 0, event.maxActualPowerRampDownPerS ?? 0).toFixed(3)} | ${event.validDataCoveragePct?.toFixed(2) ?? '—'} | ${event.status} |`).join('\n') || '| — | — | — | — | — | — | — | 未发现事件 |';
  const section = `\n\n## 动态负载事件（设定电流→实测电流；描述性指标）\n\n- 设定字段：${dynamic.commandField}；实测字段：${dynamic.actualField}；实测功率：FC_NetPwrOut\n- 状态：${dynamic.status}；事件数 ${dynamic.eventCount}；已稳定 ${dynamic.settledEventCount}；未稳定 ${dynamic.unsettledEventCount}\n- 数据缺口：${dynamic.dataGapCount}；最大间隔：${dynamic.maximumIntervalS ?? '—'} s\n- 边界：动态事件指标不含 GB/T/企业限值，不生成符合性结论。\n\n| 事件 | 方向 | 设定变化(A) | 响应带(A) | 响应时间(s) | 实测功率最大爬坡(W/s) | 覆盖(%) | 状态 |\n|---|---|---:|---:|---:|---:|---:|---|\n${rows}`;
  return markdown.replace('\n\n| 目标电流 A', `${section}\n\n| 目标电流 A`);
}

function addStackEngineeringSection(result, markdown) {
  if (result.datasetType !== 'stack' || !result.dataset) return markdown;
  const dataset = result.dataset;
  const rows = [
    ['阳极流阻', dataset.metrics.anodeFlowResistanceKpa, 'kPa', dataset.sourceFieldMap.anode_flow_resistance_kpa],
    ['阴极流阻', dataset.metrics.cathodeFlowResistanceKpa, 'kPa', dataset.sourceFieldMap.cathode_flow_resistance_kpa],
    ['冷却液流阻', dataset.metrics.coolantFlowResistanceKpa, 'kPa', dataset.sourceFieldMap.coolant_flow_resistance_kpa],
    ['冷却液温差', dataset.metrics.coolantTemperatureDifferenceC, '°C', dataset.sourceFieldMap.coolant_temperature_difference_c],
    ['循环水电导率', dataset.metrics.coolantConductivityUsCm, 'μS/cm', dataset.sourceFieldMap.coolant_conductivity_us_cm],
    ['氢气入口露点', dataset.metrics.h2DewpointC, '°C', dataset.sourceFieldMap.h2_dewpoint_c || '未提供直接露点字段'],
    ['空气入口露点', dataset.metrics.airDewpointC, '°C', dataset.sourceFieldMap.air_dewpoint_c || '未提供直接露点字段'],
    ['阳极增湿罐水温', dataset.metrics.h2HumidifierWaterTemperatureC, '°C', dataset.sourceFieldMap.h2_humidifier_water_temp_c],
    ['阴极增湿罐水温', dataset.metrics.airHumidifierWaterTemperatureC, '°C', dataset.sourceFieldMap.air_humidifier_water_temp_c],
    ['内阻', dataset.metrics.internalResistance, '原始单位', dataset.sourceFieldMap.internal_resistance || '未提供内阻字段']
  ].map(([label, summary, unit, source]) => `| ${label} | ${summary?.mean ?? '—'} | ${unit} | ${summary?.count ?? 0} | ${source || '未形成映射'} |`).join('\n');
  const powerEvidence = `| 电功率来源 | ${dataset.metrics.powerSource || '—'} | — | ${dataset.metrics.powerCrossCheck?.effectivePowerCount ?? 0} | ${dataset.metrics.powerCrossCheck?.evidence || '—'} |`;
  const cellTimeSeries = (dataset.cellTimeSeriesStats || []).map((item) => `| ${item.source} | ${item.count} | ${item.missingCount} | ${item.completenessPct?.toFixed?.(2) ?? '—'} | ${item.mean?.toFixed?.(4) ?? '—'} | ${item.min?.toFixed?.(4) ?? '—'} | ${item.max?.toFixed?.(4) ?? '—'} | ${item.std?.toFixed?.(4) ?? '—'} |`).join('\n') || '| — | — | — | — | — | — | — |';
  const excludedIntervals = (dataset.excludedIntervals || []).map((item) => `| ${item.platformId || '—'} | ${item.startS ?? '—'} | ${item.endS ?? '—'} | ${item.durationS ?? '—'} | ${item.sampleCount ?? '—'} | ${item.reasonCode || '—'} | ${item.reason || '—'} |`).join('\n') || '| — | — | — | — | — | — | — |';
  const analysisEvidence = `\n\n## 原始电堆单片时序统计（描述性）\n\n| 源字段 | 有效记录 | 缺失记录 | 完整率(%) | 均值(V) | 最小(V) | 最大(V) | 标准差(V) |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${cellTimeSeries}\n\n## 稳定区间排除证据\n\n| 平台 | 起始(s) | 结束(s) | 持续(s) | 样本数 | 原因代码 | 原因 |\n|---|---:|---:|---:|---:|---|---|\n${excludedIntervals}\n\n> 逐片统计与排除区间只记录原始数据覆盖和分析路径，不构成企业限值或标准符合性判定。`;
  const stabilityEvidence = dataset.workbookStabilityCrossCheck ? `\n\n## 原始 XLSX 稳定性描述性交叉核对\n\n- 状态：${dataset.workbookStabilityCrossCheck.status}；报告点 ${dataset.workbookStabilityCrossCheck.reportPointCount ?? 0} 个；匹配 ${dataset.workbookStabilityCrossCheck.matchedCount ?? 0} 个。\n- 边界：${dataset.workbookStabilityCrossCheck.boundary}\n${(dataset.workbookStabilityCrossCheck.matches || []).map((item) => `- 报告源行 ${item.reportSourceRow ?? '—'}：电流 ${item.reportCurrentA ?? '—'} A → 时序 ${item.timeSeriesCurrentA ?? '—'} A（Δ ${item.currentDeltaA ?? '—'}）；电压 ${item.reportVoltageV ?? '—'} V → 时序 ${item.timeSeriesVoltageV ?? '—'} V（Δ ${item.voltageDeltaV ?? '—'}）；功率 ${item.reportPowerKw ?? '—'} → ${item.timeSeriesPowerKw ?? '—'} kW（Δ ${item.powerDeltaKw ?? '—'}）`).join('\n') || '- 未形成可匹配报告点。'}\n` : '';
  const section = `\n## 工程量摘要（统计/核对，不是标准符合性结论）\n\n| 工程量 | 均值 | 单位 | 有效记录 | 来源/公式 |\n|---|---:|---|---:|---|\n${rows}\n${powerEvidence}\n\n> “入口露点”只接受原始字段明确标注为露点的记录；增湿罐水温单独列示，不能替代露点。${analysisEvidence}${stabilityEvidence}`;
  return markdown.replace('\n## 字段覆盖边界\n', `${section}\n## 字段覆盖边界\n`);
}

export function reportMarkdown(result, fileName = 'test-run.csv', options = {}) {
  if (result.config?.evaluationMode === 'descriptive_only' && !options.__descriptiveRendered) {
    const rendered = reportMarkdown({ ...result, config: { ...result.config, evaluationMode: 'risk_screening' } }, fileName, { ...options, __descriptiveRendered: true });
    return rendered
      .replace('本报告使用可配置的演示阈值，不替代企业正式安全标准。', '当前 profile 为 descriptive_only：本报告只输出描述性统计和证据，未执行阈值/验收判定。')
      .replace(/\n## 当前判定阈值\n\n[\s\S]*?(?=\n## 标准适用性与符合性门控)/, '\n## 分析模式\n\n- 当前为 **descriptive_only**。\n- 已输出统计、趋势、字段映射和证据；未执行温度、压力、泄漏、稳定性或企业验收阈值判定。\n- 如需风险筛查或正式验收，必须导入企业批准 profile。\n');
  }
  if (result.datasetType) return addStackEngineeringSection(result, addDynamicVehicleSection(result, enterpriseReportMarkdown(result, fileName, options)));
  const { metrics, quality, schema, issues, phases, verdict, config, narrative } = result;
  const status = verdict === 'PASS' ? '通过' : verdict === 'WARN' ? '需复核' : verdict === 'DESCRIPTIVE' ? '仅描述' : '未通过';
  const mappings = Object.entries(schema.mapping).map(([field, source]) => `${field}←${source}`).join('；');
  const conversions = Object.entries(schema.conversions).filter(([, transform]) => transform.mode !== 'identity').map(([field, transform]) => `${field} ${transform.label}`).join('；') || '无';
  const acceptanceChecks = (result.acceptance?.checks || []).map((check) => `${check.metric} ${check.operator} ${check.expected} → ${check.status}${check.sourceRef ? `（${check.sourceRef}）` : ''}`).join('；') || '未配置企业验收规则';
  const complianceSection = `\n\n## 标准适用性与符合性门控\n\n- 状态：${result.compliance?.status || '未评估'}（${result.compliance?.label || '需人工确认'}）\n- 方法执行状态：${result.compliance?.methodExecutionStatus || '未声明'}\n- 标准状态/日期：${result.compliance?.standardStatus || '未声明'} · 发布 ${result.compliance?.publicationDate || '—'} · 实施 ${result.compliance?.effectiveDate || '—'}\n- profile 审批状态：${result.compliance?.approvalStatus || '未指定'}\n- 测试方法：${result.compliance?.methodId || '未指定'} · 版本：${result.compliance?.revision || '未指定'}\n- 方法来源定位：${result.compliance?.methodSource ? `${result.compliance.methodSource.sourceId} · ${result.compliance.methodSource.locator}` : '未配置'}\n- 适用范围：${result.compliance?.applicationScope || '未指定'}\n- 范围证据：${result.compliance?.scopeEvidence || '未配置'}\n- 流程证据：${result.compliance?.workflowEvidence || '未配置'}\n- 设备范围核对：${result.compliance?.scope?.evidence || '未配置'}\n- 测试对象追溯：${result.compliance?.traceability?.evidence || '未配置'}\n- 人工修改审计：${result.compliance?.editLog?.evidence || '未配置'}\n- 测试系统组成：${result.compliance?.testSystem?.evidence || '未配置'}\n- 测试条件：${result.compliance?.testConditions?.evidence || '未配置'}\n- 环境条件：${result.compliance?.environmentConditions?.evidence || '未配置'}\n- 阶段结果证据：${result.compliance?.phaseResults?.evidence || '未配置'}\n- 仪器/校准证据：${result.compliance?.instruments?.evidence || '未配置'}\n- 数据质量门控：${result.compliance?.dataQuality?.evidence || '未配置'}\n- 验收规则：${result.compliance?.acceptance?.evidence || '未配置'}\n- 验收计算明细：${acceptanceChecks}\n- 报告字段证据：${result.compliance?.report?.evidence || '未配置'}\n- 缺失 profile 字段：${result.compliance?.missingProfileFields?.join('、') || '无'}\n- 缺失测试元数据：${result.compliance?.missingMetadata?.join('、') || '无'}\n- 说明：该状态不是安全认证；正式符合性结论必须由企业标准负责人和测试人员签核。\n`;
  const releaseGateSection = `\n## 报告交付级别\n\n- 状态：**${result.releaseGate?.status || 'ANALYSIS_DRAFT'}**\n- 说明：${result.releaseGate?.label || '分析草稿，不得作为放行报告'}\n- 未通过门控：${result.releaseGate?.blockedReasons?.join('、') || '无'}\n`;
  const workflowSection = `\n## 测试流程完成度\n\n- 流程状态：**${result.workflow?.status || '未评估'}**\n- 下一步：${result.workflow?.nextAction || '需人工确认。'}\n${(result.workflow?.steps || []).map((step) => `- ${step.status.toUpperCase()}｜${step.label}：${step.evidence}`).join('\n')}\n`;
  const metadataSection = `\n## 测试执行与溯源字段\n\n${Object.entries(config.testMetadata || {}).filter(([field]) => !['testStages', 'testConditions', 'measurementMethodRecords', 'efficiencyRecord'].includes(field)).map(([field, value]) => `- ${field}：${String(value || '未填写').replace(/\r?\n/g, '；')}`).join('\n') || '- 当前未填写测试元数据。'}\n`;
  const acceptanceCriteria = result.compliance?.acceptanceCriteria || {};
  const phaseMetricLines = Object.values(result.phaseMetrics?.phases || {}).map((phase) => `- ${phase.phaseId}：${phase.sampleCount} 条，持续 ${phase.durationS?.toFixed(3) ?? '—'} s；有效覆盖 ${phase.validDataCoveragePct?.toFixed(2) ?? '—'}%；中断段 ${phase.interruptedSegmentCount ?? 0}；能耗 ${phase.energyConsumedWh?.toFixed(3) ?? '—'} Wh；产氢 ${phase.hydrogenVolumeNl?.toFixed(3) ?? '—'} NL；单位电耗 ${phase.specificEnergyKWhPerNm3?.toFixed(3) ?? '—'} kWh/Nm³；功率范围 ${phase.powerRangeW?.toFixed(3) ?? '—'} W；最大加/减载速率 ${phase.maxRampUpWPerS?.toFixed(3) ?? '—'} / ${phase.maxRampDownWPerS?.toFixed(3) ?? '—'} W/s；积分状态 ${phase.integrationStatus || '—'}；跳过缺口 ${phase.skippedGapCount ?? 0} 段；文件边界 ${phase.skippedSessionBoundaryCount ?? 0} 个`).join('\n') || '- 当前 profile 未声明阶段计算指标。';
  const dynamicPowerSection = result.dynamicPower?.enabled
    ? `\n## 动态功率事件（描述性指标）\n\n- 状态：${result.dynamicPower.status}\n- 设定字段：${result.dynamicPower.commandField}；实测字段：${result.dynamicPower.actualField}\n- 事件数：${result.dynamicPower.eventCount}；进入响应带并满足保持窗口：${result.dynamicPower.settledEventCount}；未稳定：${result.dynamicPower.unsettledEventCount}\n- 设定/实测有效记录：${result.dynamicPower.commandSampleCount}/${result.dynamicPower.actualSampleCount}\n- 数据缺口：${result.dynamicPower.dataGapCount}；最大间隔：${result.dynamicPower.maximumIntervalS ?? '—'} s\n- 边界：${result.dynamicPower.boundary}\n\n| 事件 | 方向 | 设定变化 | 响应带 | 响应时间(s) | 实测最大爬坡 | 数据覆盖 | 状态 |\n|---|---|---:|---:|---:|---:|---:|---|\n${(result.dynamicPower.events || []).slice(0, 100).map((event) => `| ${event.id} | ${event.direction === 'up' ? '升载' : '降载'} | ${event.commandFrom} → ${event.commandTo} ${result.dynamicPower.unit} | ±${event.responseBand.toFixed(3)} | ${event.responseTimeS?.toFixed(3) ?? '—'} | ${event.maxActualRampUpPerS?.toFixed(3) ?? '—'} / ${event.maxActualRampDownPerS?.toFixed(3) ?? '—'} ${result.dynamicPower.unit}/s | ${event.validDataCoveragePct?.toFixed(2) ?? '—'}% | ${event.status} |`).join('\\n') || '| — | — | — | — | — | — | — | 未发现事件 |'}\n`
    : '';
  const performanceSection = `\n## 性能测量摘要\n\n- 产氢量：${metrics.hydrogenVolumeNl?.toFixed(3) ?? '—'} NL\n- 电能消耗：${metrics.energyConsumedWh?.toFixed(3) ?? '—'} Wh\n- 单位制氢电耗：${metrics.specificEnergyKWhPerNm3?.toFixed(3) ?? '—'} kWh/Nm³（NL→Nm³ 已换算 ×1000）\n- 电功率来源：${metrics.powerSource || '—'}；原始通道 ${metrics.powerCrossCheck?.rawPowerCount ?? 0} 条；交叉核算最大差异 ${metrics.powerCrossCheck?.maxAbsoluteDifferenceW?.toFixed(3) ?? '—'} W（未配置一致性限值，不自动判定合格）\n- 效率结果：${result.compliance?.efficiency?.valuePct?.toFixed?.(3) ?? '—'}%（${result.compliance?.efficiency?.source || '未提供；系统不猜测效率公式'}）\n- 最低氢气纯度：${metrics.minimumHydrogenPurityPct?.toFixed(3) ?? '—'}%${metrics.minimumHydrogenPurityAtS?.length ? `（t=${metrics.minimumHydrogenPurityAtS.slice(0, 3).join('、')} s）` : ''}\n- profile 要求的性能测量缺失：${result.compliance?.missingMeasurements?.join('、') || '无'}\n- profile 要求的测试段缺失：${result.compliance?.missingPhases?.join('、') || '无'}\n- profile 要求的阶段指标缺失：${result.compliance?.missingPhaseMetrics?.join('、') || '无'}\n- 时间轴观测：中位间隔 ${quality.medianIntervalS ?? '—'} s；实际采样频率 ${quality.effectiveSamplingFrequencyHz?.toFixed?.(4) ?? '—'} Hz；最大间隔 ${quality.maximumIntervalS ?? '—'} s；缺口 ${quality.samplingGapCount ?? '未配置'}\n- 测试阶段证据：${result.compliance?.testStages?.evidence || '未配置'}\n- 测试条件证据：${result.compliance?.testConditions?.evidence || '未配置'}\n- 测量方法证据：${result.compliance?.measurementMethods?.evidence || '未配置'}\n- profile 验收准则：${Object.entries(acceptanceCriteria).map(([field, value]) => `${field}=${value}`).join('；') || '未配置，不能据此宣称符合'}\n- 不确定度模型：${result.uncertainty?.status || '未配置'}${result.uncertainty?.method ? ` · ${result.uncertainty.method} · k=${result.uncertainty.coverageFactor}` : ''}\n\n## 按工况阶段计算\n\n${phaseMetricLines}\n`;
  const structuredEvidenceSection = `\n## 方法级结构化证据\n\n- 测试阶段：${result.compliance?.testStages?.evidence || '未配置'}\n- 测试系统组成：${result.compliance?.testSystem?.evidence || '未配置'}\n- 测试条件：${result.compliance?.testConditions?.evidence || '未配置'}\n- 环境条件：${result.compliance?.environmentConditions?.evidence || '未配置'}\n- 测量方法：${result.compliance?.measurementMethods?.evidence || '未配置'}\n- 方法阶段结果：${result.compliance?.phaseResults?.evidence || '未配置'}\n`;
  const comparisonSection = `${complianceSection}${releaseGateSection}${workflowSection}${performanceSection}${dynamicPowerSection}${structuredEvidenceSection}${metadataSection}${options.comparison ? `\n${comparisonMarkdown(options.comparison)}` : ''}${options.aiDraft?.draft ? `\n\n## 报告初稿（结构化证据模式）\n\n${options.aiDraft.draft}\n\n- 生成路径：${options.aiDraft.mode === 'remote-llm' ? '已配置的企业模型服务' : '本地规则回退'}\n\n- fallbackReason：${options.aiDraft.fallbackReason ?? '无'}\n` : ''}`;
  const profileName = config.profileName ?? '未指定设备模板';
  const profileSource = config.profileSource ?? '当前分析配置';
  return `# 氢能设备测试自动报告\n\n- 数据文件：${fileName}\n- 自动判定：**${status}（${verdict}）**\n- 生成时间：${result.generatedAt}\n- 说明：本报告使用可配置的演示阈值，不替代企业正式安全标准。\n\n## 结论摘要\n\n${narrative}\n\n## 数据质量与字段映射\n\n- 记录数：${quality.rowCount}\n- 关键字段完整率：${quality.completenessPct.toFixed(1)}%\n- 缺失字段：${quality.missingHeaders.length ? quality.missingHeaders.join('、') : '无'}\n- 可选缺失字段：${quality.missingOptionalHeaders.length ? quality.missingOptionalHeaders.join('、') : '无'}\n- 字段映射：${mappings || '无'}\n- 单位换算：${conversions}\n- 重复时间戳：${quality.duplicateTimestampCount} 条；逆序跳变：${quality.nonMonotonicCount} 次\n\n## KPI 摘要\n\n| 指标 | 数值 |\n|---|---:|\n| 测试时长 | ${metrics.durationS.toFixed(0)} s |\n| 峰值功率 | ${metrics.peakPowerW?.toFixed(1) ?? '—'} W |\n| 稳态窗口 | ${metrics.steadyWindow}（${metrics.steadySampleCount} 条） |\n| 稳态平均电压 | ${metrics.steadyVoltageMeanV?.toFixed(3) ?? '—'} V |\n| 稳态电压标准差 | ${metrics.steadyVoltageStdV?.toFixed(3) ?? '—'} V |\n| 峰值温度 | ${metrics.peakTemperatureC?.toFixed(1) ?? '—'} °C |\n| 峰值压力 | ${metrics.peakPressureBar?.toFixed(1) ?? '—'} bar |\n| 峰值泄漏监测 | ${metrics.peakLeakPpm?.toFixed(1) ?? '—'} ppm |\n| 压力漂移 | ${metrics.pressureDriftBarPerMin.toFixed(2)} bar/min |\n\n## 异常与建议\n\n${issues.map((item) => `- **${item.severity.toUpperCase()}｜${item.title}**：${item.evidence}。建议：${item.recommendation}`).join('\n')}\n\n## 工况分段\n\n${phases.map((phase) => `- ${phase.phase}：${phase.count} 个样本，${phase.durationS.toFixed(0)} s`).join('\n')}\n\n## 当前判定阈值\n\n- 设备模板：${profileName}\n- 阈值来源：${profileSource}\n- 温度 ≤ ${config.maxTemperatureC} °C\n- 压力 ≤ ${config.maxPressureBar} bar\n- 泄漏监测 ≤ ${config.maxLeakPpm} ppm\n- 稳态电压标准差 ≤ ${config.maxVoltageStdV} V\n- 压力漂移绝对值 ≤ ${config.maxPressureDriftBarPerMin} bar/min\n${comparisonSection}`;
}
