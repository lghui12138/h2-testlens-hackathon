import { acquisitionReadiness, dataQualityReadiness, efficiencyReadiness, environmentConditionReadiness, measurementMethodReadiness, phaseResultReadiness, preCheckReadiness, testConditionReadiness, testStageReadiness, testSystemReadiness } from './structured-evidence.mjs';
import { approvalEvidenceReadiness, fullMethodProfileReadiness, methodImplementationEvidenceReadiness, standardReferenceReadiness } from './profiles.mjs';
import { analyzeSetpointEvents } from './dynamic-events.mjs';

const VEHICLE_FIELDS = Object.freeze([
  ['timestamp_s', 'Timestamp'],
  ['main_status', 'FC_MainSts'],
  ['current_a', 'FC_CurrOut'],
  ['voltage_v', 'FC_VoltOut'],
  ['net_power_kw', 'FC_NetPwrOut'],
  ['min_cell_voltage_v', 'FC_MinCellVoltage'],
  ['min_cell_channel', 'FC_MinVoltageChannel'],
  ['avg_cell_voltage_v', 'FC_AvgCellVoltage'],
  ['avg_cell_dev_mv', 'FC_AvgCellDev'],
  ['cell_voltage_variance', 'FC_VARVoltage'],
  ['isolation_kohm', 'FC_VehicleIsolationR'],
  ['runtime_h', 'FC_RunTime_Hours']
]);

const VEHICLE_CONTEXT_FIELDS = Object.freeze([
  'FC_SysFltRnk', 'FC_ErrorCode', 'FC_SysLoadCurr', 'FC_AirSysSts', 'FC_H2SysSts', 'FC_TMSysSts',
  'RollingCount_0x101', 'FC_MaxCurrAllow', 'FC_MaxPwrAllow', 'FC_HVLockVoltage', 'FC_MaxCellVoltage',
  'FC_MaxVoltageChannel', 'TotalVoltage', 'FC_PurgeTgtEIS', 'FC_RealEISValue', 'FC_PurgeTime',
  'FC_AirPreCPOut', 'FC_ACPPwr', 'FC_AuxFANEn', 'FC_AuxFANRpm', 'FC_H2SupplyReq', 'FC_HSSFltRnk',
  'FC_HSSSysSts', 'FC_HSSErrorCode', 'FC_HSSHighPreu', 'FC_HSSMidPre', 'FC_HSSH2SOC',
  'FC_HSSTripRefuelMass', 'FC_VehicleSpd', 'FC_VehicleKM', 'FC_HydCmPerHundred', 'FC_HydCmInstts',
  'FC_RunTime_Min', 'FC_StartTimes'
]);

const identity = { mode: 'identity', factor: 1, label: '原单位' };

const num = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const std = (values) => {
  if (values.length < 2) return values.length ? 0 : null;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
};

const normalizeHeader = (value) => String(value ?? '')
  .replace(/^\uFEFF/, '')
  .replace(/[\s_\-().（）[\]{}]/g, '')
  .toLowerCase();

const normalizeUnit = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[\s·]/g, '')
  .replace('℃', '°c')
  .replace('度', '');

const UNIT_DEFINITIONS = Object.freeze({
  timestamp_s: { s: 1, sec: 1, second: 1, seconds: 1, ms: 0.001, millisecond: 0.001, milliseconds: 0.001, min: 60, minute: 60, minutes: 60, h: 3600, hr: 3600, hour: 3600 },
  current_a: { a: 1, amp: 1, amps: 1, 安: 1, ma: 0.001, 毫安: 0.001 },
  voltage_v: { v: 1, volt: 1, volts: 1, 伏: 1, mv: 0.001, 毫伏: 0.001 },
  power_kw: { kw: 1, mw: 0.001, w: 0.001, 瓦: 0.001 },
  pressure_kpa: { kpa: 1, pa: 0.001, mpa: 1000, bar: 100, mbar: 0.1 },
  flow_slpm: { slpm: 1, 'nl/min': 1, nlpm: 1, 'nm3/h': 1000 / 60, 'nm3h': 1000 / 60, 'l/s': 60, 'ml/min': 0.001 },
  temperature_c: { '°c': 1, c: 1, 摄氏度: 1 },
  leak_ppm: { ppm: 1, ppb: 0.001 }
});
const UNIT_DISPLAY = Object.freeze({ kw: 'kW', mw: 'MW', w: 'W', kpa: 'kPa', pa: 'Pa', mpa: 'MPa', bar: 'bar', mbar: 'mbar', ma: 'mA', mv: 'mV', a: 'A', v: 'V', ms: 'ms', s: 's', slpm: 'SLPM', ppm: 'ppm', ppb: 'ppb' });

function explicitHeaderUnit(header) {
  const match = String(header ?? '').match(/[（(]([^（）()]+)[)）]\s*$/);
  return match ? normalizeUnit(match[1]) : null;
}

function unitSpec(header, field) {
  const rawUnit = explicitHeaderUnit(header);
  if (!rawUnit) return { field, status: 'implicit', factor: 1, label: '未声明（按 canonical 单位）', rawUnit: null };
  const factor = UNIT_DEFINITIONS[field]?.[rawUnit];
  if (!Number.isFinite(factor)) return { field, status: 'unsupported', factor: null, label: '不支持的单位 ' + rawUnit, rawUnit };
  return { field, status: 'declared', factor, label: (UNIT_DISPLAY[rawUnit] || rawUnit) + '→canonical', rawUnit };
}

function convertEnterpriseValue(value, spec) {
  const raw = num(value);
  if (raw === null && spec?.field === 'timestamp_s' && spec.rawUnit === null) return value === undefined || value === null ? null : value;
  if (raw === null || spec?.status === 'unsupported') return null;
  return raw * (spec?.factor ?? 1);
}

const findHeader = (headers, candidates = []) => {
  const normalized = headers.map((header) => [header, normalizeHeader(header)]);
  for (const candidate of candidates) {
    const needle = normalizeHeader(candidate);
    const exact = normalized.find(([, value]) => value === needle);
    if (exact) return exact[0];
  }
  for (const candidate of candidates) {
    const needle = normalizeHeader(candidate);
    const partial = normalized.find(([, value]) => needle.length > 2 && value.includes(needle));
    if (partial) return partial[0];
  }
  return null;
};

function parseTimestamp(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const numeric = num(text);
  if (numeric !== null && /^[-+]?\d+(\.\d+)?$/.test(text)) return numeric;
  const timeOnly = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/);
  if (timeOnly) return Number(timeOnly[1]) * 3600 + Number(timeOnly[2]) * 60 + Number(timeOnly[3] || 0) + Number(`0.${timeOnly[4] || 0}`);
  const dateTime = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?/);
  if (dateTime) return Date.UTC(Number(dateTime[1]), Number(dateTime[2]) - 1, Number(dateTime[3]), Number(dateTime[4]), Number(dateTime[5]), Number(dateTime[6] || 0), Number((dateTime[7] || '').slice(0, 3).padEnd(3, '0'))) / 1000;
  const parsed = Date.parse(text.replaceAll('/', '-').replace(' ', 'T'));
  return Number.isFinite(parsed) ? parsed / 1000 : null;
}

function relativeTimes(values) {
  const parsed = values.map(parseTimestamp);
  const valid = parsed.filter((value) => value !== null);
  if (!valid.length) return parsed;
  const timeOnly = values.some((value) => /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.test(String(value ?? '').trim()));
  if (!timeOnly) {
    const start = valid[0];
    return parsed.map((value) => value === null ? null : value - start);
  }
  let offset = 0;
  let previous = null;
  const unwrapped = parsed.map((value) => {
    if (value === null) return null;
    if (previous !== null && value + offset < previous) offset += 86400;
    const result = value + offset;
    previous = result;
    return result;
  });
  const start = unwrapped.find((value) => value !== null) ?? 0;
  return unwrapped.map((value) => value === null ? null : value - start);
}

function sessionKey(row) {
  const explicit = String(row?.session_id ?? '').trim();
  if (explicit) return explicit;
  const source = String(row?.source_file ?? '').trim();
  return source || 'session-1';
}

function sessionizedTimes(rows, timestampField) {
  const groups = [];
  const byKey = new Map();
  rows.forEach((row, index) => {
    const key = sessionKey(row);
    let group = byKey.get(key);
    if (!group) {
      group = { key, items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push({ row, index });
  });
  const globalTimes = Array(rows.length).fill(null);
  const localTimes = Array(rows.length).fill(null);
  const sessionIds = Array(rows.length).fill(null);
  const sessions = [];
  let offsetS = 0;
  for (const [sessionIndex, group] of groups.entries()) {
    const values = group.items.map(({ row }) => row[timestampField]);
    const local = relativeTimes(values);
    const valid = local.filter((value) => value !== null);
    const localEndS = valid.length ? Math.max(...valid) : 0;
    for (const [itemIndex, item] of group.items.entries()) {
      const localS = local[itemIndex];
      localTimes[item.index] = localS;
      globalTimes[item.index] = localS === null ? null : localS + offsetS;
      sessionIds[item.index] = group.key;
    }
    sessions.push({
      sessionId: group.key,
      sourceFile: String(group.items[0]?.row?.source_file ?? group.key),
      sessionIndex,
      rowCount: group.items.length,
      startS: offsetS,
      endS: offsetS + localEndS,
      durationS: localEndS,
      validTimestampCount: valid.length
    });
    offsetS += localEndS + 1;
  }
  return { globalTimes, localTimes, sessionIds, sessions };
}

function linearTrend(points) {
  if (points.length < 2) return { slopePerDay: null, intercept: null };
  const xMean = mean(points.map(([x]) => x));
  const yMean = mean(points.map(([, y]) => y));
  const denominator = points.reduce((sum, [x]) => sum + (x - xMean) ** 2, 0);
  if (!denominator) return { slopePerDay: 0, intercept: yMean };
  const slopePerSecond = points.reduce((sum, [x, y]) => sum + (x - xMean) * (y - yMean), 0) / denominator;
  return { slopePerDay: slopePerSecond * 86400, intercept: yMean - slopePerSecond * xMean };
}

function solveLinearSystem(matrix, vector) {
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let pivot = 0; pivot < augmented.length; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < augmented.length; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[best][pivot])) best = row;
    }
    if (Math.abs(augmented[best][pivot]) < 1e-12) return null;
    [augmented[pivot], augmented[best]] = [augmented[best], augmented[pivot]];
    const divisor = augmented[pivot][pivot];
    for (let column = pivot; column < augmented[pivot].length; column += 1) augmented[pivot][column] /= divisor;
    for (let row = 0; row < augmented.length; row += 1) {
      if (row === pivot) continue;
      const factor = augmented[row][pivot];
      for (let column = pivot; column < augmented[row].length; column += 1) augmented[row][column] -= factor * augmented[pivot][column];
    }
  }
  return augmented.map((row) => row.at(-1));
}

function evaluateTrendModel(trend, x) {
  if (!trend || trend.status !== 'fitted' || !Number.isFinite(x) || !trend.coefficients) return null;
  const z = x - trend.xOrigin;
  const quadratic = trend.coefficients.quadratic || 0;
  return quadratic * z ** 2 + (trend.coefficients.linear || 0) * z + (trend.coefficients.intercept || 0);
}

function fitTrendModel(points, requestedModel = 'linear', xUnit = 'h') {
  const clean = points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const model = requestedModel === 'quadratic' ? 'quadratic' : 'linear';
  const xOrigin = clean.length ? mean(clean.map(([x]) => x)) : 0;
  const yMean = clean.length ? mean(clean.map(([, y]) => y)) : null;
  const unitToDay = xUnit === 'h' ? 24 : xUnit === 'day' ? 1 : null;
  const base = { model, pointCount: clean.length, xUnit, xOrigin, coefficients: null, rSquared: null, slopePerDay: null, initialSlopePerDay: null, terminalSlopePerDay: null, status: clean.length < (model === 'quadratic' ? 3 : 2) ? 'insufficient_points' : 'not_fitted' };
  if (base.status === 'insufficient_points') return base;
  const centered = clean.map(([x, y]) => [x - xOrigin, y]);
  let coefficients;
  if (model === 'quadratic') {
    const sums = (power) => centered.reduce((sum, [z]) => sum + z ** power, 0);
    const vector = centered.reduce((accumulator, [z, y]) => [accumulator[0] + z ** 2 * y, accumulator[1] + z * y, accumulator[2] + y], [0, 0, 0]);
    coefficients = solveLinearSystem([[sums(4), sums(3), sums(2)], [sums(3), sums(2), sums(1)], [sums(2), sums(1), centered.length]], vector);
    if (!coefficients) return { ...base, status: 'singular' };
    coefficients = { quadratic: coefficients[0], linear: coefficients[1], intercept: coefficients[2] };
  } else {
    const denominator = centered.reduce((sum, [z]) => sum + z ** 2, 0);
    if (!denominator) return { ...base, status: 'singular' };
    coefficients = {
      quadratic: 0,
      linear: centered.reduce((sum, [z, y]) => sum + z * (y - yMean), 0) / denominator,
      intercept: yMean
    };
  }
  const predictions = clean.map(([x]) => evaluateTrendModel({ ...base, status: 'fitted', coefficients }, x));
  const total = clean.reduce((sum, [, y]) => sum + (y - yMean) ** 2, 0);
  const residual = clean.reduce((sum, [, y], index) => sum + (y - predictions[index]) ** 2, 0);
  const xValues = clean.map(([x]) => x);
  const startX = Math.min(...xValues);
  const endX = Math.max(...xValues);
  const derivative = (x) => coefficients.linear + 2 * coefficients.quadratic * (x - xOrigin);
  return {
    ...base,
    status: 'fitted',
    coefficients,
    rSquared: total > 0 ? 1 - residual / total : 1,
    slopePerDay: unitToDay === null ? null : derivative(endX) * unitToDay,
    initialSlopePerDay: unitToDay === null ? null : derivative(startX) * unitToDay,
    terminalSlopePerDay: unitToDay === null ? null : derivative(endX) * unitToDay
  };
}

function forecastToThreshold(points, threshold) {
  const trend = linearTrend(points);
  if (trend.slopePerDay === null || trend.slopePerDay >= 0 || !points.length) return null;
  const [lastTime, lastValue] = points.at(-1);
  if (lastValue <= threshold) return { threshold, days: 0, status: 'already_below' };
  const days = (lastValue - threshold) / Math.abs(trend.slopePerDay);
  return Number.isFinite(days) ? { threshold, days, status: 'forecast' } : null;
}

function qualityFor(rows, requiredFields) {
  const invalidValueCounts = Object.fromEntries(requiredFields.map((field) => [field, rows.filter((row) => row[field] === null).length]));
  const timestamps = rows.map((row) => row.timestamp_s).filter((value) => value !== null);
  const duplicateTimestampCount = timestamps.length - new Set(timestamps).size;
  const timestampDeltas = timestamps.slice(1).map((value, index) => value - timestamps[index]);
  const nonMonotonicCount = timestampDeltas.filter((delta) => delta < 0).length;
  const nonPositiveIntervalCount = timestampDeltas.filter((delta) => delta <= 0).length;
  const positiveIntervals = timestampDeltas.filter((delta) => delta > 0);
  const totalCells = rows.length * requiredFields.length;
  const missingCells = Object.values(invalidValueCounts).reduce((sum, value) => sum + value, 0);
  return {
    rowCount: rows.length,
    missingHeaders: [],
    missingOptionalHeaders: [],
    invalidValueCounts,
    optionalInvalidValueCounts: {},
    duplicateTimestampCount,
    nonMonotonicCount,
    nonPositiveIntervalCount,
    observedIntervalCount: positiveIntervals.length,
    minimumIntervalS: positiveIntervals.length ? Math.min(...positiveIntervals) : null,
    maximumIntervalS: positiveIntervals.length ? Math.max(...positiveIntervals) : null,
    medianIntervalS: positiveIntervals.length ? [...positiveIntervals].sort((a, b) => a - b)[Math.floor(positiveIntervals.length / 2)] : null,
    plannedSamplingFrequencyHz: null,
    plannedIntervalS: null,
    samplingIntervalDeviationPct: null,
    samplingGapCount: null,
    missingCells,
    totalCells,
    completenessPct: totalCells ? ((totalCells - missingCells) / totalCells) * 100 : 0,
    hasEnoughRows: rows.length >= 2,
    usable: rows.length >= 2 && timestamps.length >= 2 && duplicateTimestampCount === 0 && nonMonotonicCount === 0
  };
}

function summarizeNumericSignal(rows, source) {
  const values = rows.map((row) => num(row[source])).filter((value) => value !== null);
  return {
    source,
    rowCount: rows.length,
    numericCount: values.length,
    completenessPct: rows.length ? values.length / rows.length * 100 : 0,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    mean: mean(values),
    std: std(values)
  };
}

function summarizeDiscreteSignal(rows, source) {
  const values = rows.map((row) => String(row[source] ?? '').trim()).filter(Boolean);
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return {
    source,
    rowCount: rows.length,
    valueCount: values.length,
    completenessPct: rows.length ? values.length / rows.length * 100 : 0,
    uniqueValues: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([value, count]) => ({ value, count }))
  };
}

function signalValueDiagnostics(rows, source, usage) {
  const rawValues = rows.map((row) => String(row[source] ?? '').trim());
  const nonEmptyValues = rawValues.filter(Boolean);
  const numericValues = nonEmptyValues.map((value) => num(value)).filter((value) => value !== null);
  const numericSignal = numericValues.length > 0;
  const parseInvalidCount = numericSignal ? nonEmptyValues.length - numericValues.length : 0;
  const negativeCount = numericValues.filter((value) => value < 0).length;
  const zeroCount = numericValues.filter((value) => value === 0).length;
  const uniqueCount = new Set(nonEmptyValues).size;
  const zeroDominant = numericSignal && numericValues.length > 0 && zeroCount / numericValues.length >= 0.95;
  const constant = numericSignal && uniqueCount <= 1;
  const reviewReasons = [];
  if (parseInvalidCount > 0) reviewReasons.push('数值列含非数值文本');
  if (negativeCount > 0) reviewReasons.push('存在负值，需确认符号/无效码定义');
  if (zeroDominant) reviewReasons.push('零值占比≥95%，需确认停机态、未接入或无效码');
  if (constant) reviewReasons.push('有效值只有一个取值，需确认是否为状态码或未采集');
  const reviewable = parseInvalidCount > 0 || negativeCount > 0 || (zeroDominant && usage === 'analysis_input');
  return {
    nonEmptyCount: nonEmptyValues.length,
    missingCount: rows.length - nonEmptyValues.length,
    parseInvalidCount,
    negativeCount,
    zeroCount,
    zeroPct: numericValues.length ? zeroCount / numericValues.length * 100 : null,
    uniqueCount,
    zeroDominant,
    constant,
    reviewable,
    reviewReasons,
    policy: '不按通用规则删除负值/零值；需结合企业字段定义、设备状态和无效码确认'
  };
}

function signalDiagnosticsSummary(signalCatalog) {
  const reviewSignals = signalCatalog
    .filter((item) => item.reviewable)
    .sort((a, b) => (b.negativeCount + b.zeroCount + b.parseInvalidCount) - (a.negativeCount + a.zeroCount + a.parseInvalidCount));
  return {
    signalCount: signalCatalog.length,
    numericSignalCount: signalCatalog.filter((item) => item.numericCount > 0).length,
    reviewSignalCount: reviewSignals.length,
    negativeSignalCount: signalCatalog.filter((item) => item.negativeCount > 0).length,
    zeroDominantSignalCount: signalCatalog.filter((item) => item.zeroDominant).length,
    constantSignalCount: signalCatalog.filter((item) => item.constant).length,
    parseIssueSignalCount: signalCatalog.filter((item) => item.parseInvalidCount > 0).length,
    reviewSignals: reviewSignals.slice(0, 16).map((item) => ({
      source: item.source,
      usage: item.usage,
      negativeCount: item.negativeCount,
      zeroCount: item.zeroCount,
      zeroPct: item.zeroPct,
      parseInvalidCount: item.parseInvalidCount,
      uniqueCount: item.uniqueCount,
      reasons: item.reviewReasons
    })),
    boundary: '字段级诊断只提示原始值分布和语义复核点，不替代企业无效码表、单位确认或标准验收限值。'
  };
}

function coverageSummary(signalCatalog) {
  const usableSignals = signalCatalog.filter((item) => String(item.source ?? '').trim());
  const counts = Object.fromEntries([...new Set(usableSignals.map((item) => item.usage))].sort().map((usage) => [usage, usableSignals.filter((item) => item.usage === usage).length]));
  const catalogOnly = usableSignals.filter((item) => item.usage === 'catalog_only');
  return {
    totalSignals: usableSignals.length,
    counts,
    analysisSignals: usableSignals.filter((item) => item.usage !== 'catalog_only').length,
    numericSignals: usableSignals.filter((item) => item.numericCount > 0).length,
    nonNumericSignals: usableSignals.filter((item) => item.numericCount === 0).length,
    catalogOnlySignals: catalogOnly.map((item) => item.source),
    catalogOnlyNumericSignals: catalogOnly.filter((item) => item.numericCount > 0).map((item) => item.source),
    catalogOnlyNonNumericSignals: catalogOnly.filter((item) => item.numericCount === 0).map((item) => item.source)
  };
}

function annotateSignalCatalog(rows, headers, mapping, roleBySource = {}) {
  const mappedSources = new Set(Object.values(mapping).filter(Boolean));
  return headers.filter((source) => String(source ?? '').trim()).map((source) => {
    const summary = summarizeNumericSignal(rows, source);
    const discrete = summarizeDiscreteSignal(rows, source);
    const usage = roleBySource[source] || (mappedSources.has(source) ? 'analysis_input' : 'catalog_only');
    return { ...summary, ...signalValueDiagnostics(rows, source, usage), kind: summary.numericCount ? 'numeric_or_mixed' : 'discrete_or_text', uniqueValues: discrete.uniqueValues, usage };
  });
}

function numericSummary(rows, source) {
  const values = rows.map((row) => num(row[source])).filter((value) => value !== null);
  return { source, count: values.length, completenessPct: rows.length ? values.length / rows.length * 100 : 0, min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null, mean: mean(values), std: std(values) };
}

function pairEvidence(rows, pairs) {
  return pairs.map(({ code, target, actual, unit }) => {
    const targetSummary = numericSummary(rows, target);
    const actualSummary = numericSummary(rows, actual);
    const paired = rows.map((row) => [num(row[target]), num(row[actual])]).filter(([a, b]) => a !== null && b !== null).map(([a, b]) => b - a);
    return {
      code,
      targetSource: target,
      actualSource: actual,
      unit,
      target: targetSummary,
      actual: actualSummary,
      deviation: { count: paired.length, min: paired.length ? Math.min(...paired) : null, max: paired.length ? Math.max(...paired) : null, mean: mean(paired), std: std(paired) }
    };
  });
}

function hasNumericValue(rows, field) {
  return rows.some((row) => Number.isFinite(row?.[field]));
}

function enterpriseMeasurementReadiness(config, rows) {
  const requiredMeasurements = Array.isArray(config.requiredMeasurements) ? config.requiredMeasurements : [];
  const missingMeasurements = requiredMeasurements.filter((field) => {
    if (field === 'energy_derived') return rows.filter((row) => Number.isFinite(row.timestamp_s) && Number.isFinite(row.current_a) && Number.isFinite(row.voltage_v)).length < 2;
    // `power_w` is a required raw measurement gate.  The normalized `power_w`
    // value may still be derived from current × voltage for descriptive KPIs,
    // but that derived value cannot satisfy a profile that explicitly requires
    // an original power channel.
    if (field === 'power_w') return !hasNumericValue(rows, 'raw_power_w');
    return !hasNumericValue(rows, field);
  });
  const derivedOnlyPower = requiredMeasurements.includes('power_w')
    && !hasNumericValue(rows, 'raw_power_w')
    && hasNumericValue(rows, 'derived_power_w');
  return {
    required: requiredMeasurements,
    missing: missingMeasurements,
    ready: missingMeasurements.length === 0,
    evidence: missingMeasurements.length
      ? `${derivedOnlyPower ? '已形成派生电流×电压功率，但' : ''}企业适配器未形成要求的原始测量字段：${missingMeasurements.join('、')}`
      : requiredMeasurements.length ? `${requiredMeasurements.length} 项 profile 测量字段有有效数值` : 'profile 未声明必需测量字段'
  };
}

function normalizedPhaseToken(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s_\-（）()]/g, '');
}

function enterprisePhaseReadiness(config, rows, phaseMetrics = { missing: [] }) {
  const requiredPhases = Array.isArray(config.requiredPhases) ? config.requiredPhases : [];
  const aliases = config.phaseAliases && typeof config.phaseAliases === 'object' ? config.phaseAliases : {};
  const observed = rows.map((row) => normalizedPhaseToken(row.phase)).filter(Boolean);
  const missingPhases = requiredPhases.filter((phase) => {
    const accepted = [phase, ...(Array.isArray(aliases[phase]) ? aliases[phase] : [])].map(normalizedPhaseToken);
    return !observed.some((value) => accepted.includes(value));
  });
  const missingPhaseMetrics = Array.isArray(phaseMetrics.missing) ? phaseMetrics.missing : [];
  return {
    required: requiredPhases,
    observed: [...new Set(observed)],
    missing: missingPhases,
    missingMetrics: missingPhaseMetrics,
    ready: missingPhases.length === 0 && missingPhaseMetrics.length === 0,
    evidence: missingPhases.length || missingPhaseMetrics.length
      ? `企业适配器未形成完整测试段证据：${[...missingPhases, ...missingPhaseMetrics].join('、')}`
      : requiredPhases.length || missingPhaseMetrics.length ? 'profile 要求的测试段和阶段指标已具备入口' : 'profile 未声明必需测试段'
  };
}

function enterpriseElectricalPower(row) {
  if (Number.isFinite(row?.power_w)) return row.power_w;
  if (Number.isFinite(row?.power_kw)) return row.power_kw * 1000;
  if (Number.isFinite(row?.net_power_kw)) return row.net_power_kw * 1000;
  return Number.isFinite(row?.current_a) && Number.isFinite(row?.voltage_v) ? row.current_a * row.voltage_v : null;
}

function enterprisePowerCrossCheck(rows) {
  const rawPower = rows.map((row) => row.raw_power_w).filter((value) => Number.isFinite(value));
  const derivedPower = rows.map((row) => row.derived_power_w).filter((value) => Number.isFinite(value));
  const effectivePower = rows.map((row) => enterpriseElectricalPower(row)).filter((value) => Number.isFinite(value));
  const electricalPower = rows.map((row) => Number.isFinite(row.current_a) && Number.isFinite(row.voltage_v) ? row.current_a * row.voltage_v : null).filter((value) => value !== null);
  const differences = rows.map((row) => {
    if (!Number.isFinite(row.raw_power_w) || !Number.isFinite(row.current_a) || !Number.isFinite(row.voltage_v)) return null;
    return Math.abs(row.raw_power_w - row.current_a * row.voltage_v);
  }).filter((value) => value !== null);
  const status = rawPower.length ? 'raw_channel' : derivedPower.length ? 'derived_voltage_times_current' : 'missing';
  return {
    status,
    rawPowerCount: rawPower.length,
    derivedPowerCount: derivedPower.length,
    effectivePowerCount: effectivePower.length,
    voltageCurrentCount: electricalPower.length,
    pairedCount: differences.length,
    maxAbsoluteDifferenceW: differences.length ? Math.max(...differences) : null,
    meanAbsoluteDifferenceW: differences.length ? mean(differences) : null,
    consistencyLimitConfigured: false,
    evidence: status === 'raw_channel'
      ? `原始功率通道 ${rawPower.length} 条；与电流×电压完成 ${differences.length} 条描述性交叉核算`
      : status === 'derived_voltage_times_current'
        ? `未发现原始功率通道；使用 ${derivedPower.length} 条电流×电压派生功率`
        : '未形成原始或派生功率'
  };
}

function notConfiguredUncertainty() {
  return { status: 'not_configured', method: null, coverageFactor: null, metrics: {}, metricDetails: [], missingFields: [], configuredFields: [], assumptions: [], boundary: 'profile 未提供企业批准的不确定度模型；不填默认误差。' };
}

function calculateEnterpriseUncertainty(rows, metrics, model, options = {}) {
  if (!model) return notConfiguredUncertainty();
  const method = model.method;
  const coverageFactor = Number(model.coverageFactor);
  const standard = model.standardUncertainty && typeof model.standardUncertainty === 'object' ? model.standardUncertainty : {};
  if (method !== 'first_order_rss' || !Number.isFinite(coverageFactor) || coverageFactor <= 0) {
    return {
      status: 'invalid',
      method: method || null,
      coverageFactor: Number.isFinite(coverageFactor) ? coverageFactor : null,
      metrics: {},
      metricDetails: [],
      missingFields: [],
      configuredFields: Object.keys(standard),
      assumptions: [],
      boundary: '不确定度模型方法或覆盖因子不合法；已阻断企业 profile 的不确定度门控。'
    };
  }
  const expanded = (field) => Number.isFinite(Number(standard[field])) ? Number(standard[field]) * coverageFactor : null;
  const rss = (values) => {
    const usable = values.filter((value) => Number.isFinite(value));
    return usable.length ? Math.sqrt(usable.reduce((sum, value) => sum + value ** 2, 0)) : null;
  };
  const powerUncertainty = (row) => {
    const direct = expanded('power_w');
    const hasRawPower = Number.isFinite(row?.raw_power_w) || Number.isFinite(row?.net_power_kw) || (Number.isFinite(row?.power_w) && !Number.isFinite(row?.derived_power_w));
    if (hasRawPower) return direct !== null
      ? { value: direct, source: 'power_w 原始/直接功率输入' }
      : { value: null, source: '原始/直接功率存在，但 profile 未提供 power_w 不确定度；不改用派生功率链' };
    const currentU = expanded('current_a') ?? expanded('stack_current_a');
    const voltageU = expanded('voltage_v');
    if (Number.isFinite(row?.current_a) && Number.isFinite(row?.voltage_v) && currentU !== null && voltageU !== null) {
      return { value: rss([row.voltage_v * currentU, row.current_a * voltageU]), source: 'current_a × voltage_v 一阶 RSS' };
    }
    return { value: null, source: '缺少 power_w 或 current_a/voltage_v 不确定度' };
  };
  const fieldUncertainty = (field, scale = 1) => {
    const value = expanded(field);
    return value === null ? null : value * scale;
  };
  const pooledStdUncertainty = (field, sampleCount) => {
    const input = expanded(field);
    const count = Number(sampleCount);
    if (input === null) return { value: null, source: `缺少 ${field} 输入不确定度` };
    if (!Number.isFinite(count) || count <= 1) return { value: null, source: `统计量样本数不足：${count || 0}` };
    return { value: input / Math.sqrt(count - 1), source: `汇总标准差的一阶 RSS 传感器分量（n=${count}；未包含 Type A 重复性）` };
  };
  const metricDetails = [];
  const uncertaintyMetrics = {};
  const missingFields = [];
  const add = (spec, uncertaintyResult) => {
    const value = Number.isFinite(spec.value) ? spec.value : Number.isFinite(metrics?.[spec.metric]) ? metrics[spec.metric] : null;
    if (value === null) return;
    const uncertainty = typeof uncertaintyResult === 'function' ? uncertaintyResult() : uncertaintyResult;
    const expandedValue = typeof uncertainty === 'number' ? uncertainty : uncertainty?.value ?? null;
    if (!Number.isFinite(expandedValue)) {
      if (spec.requiredField) missingFields.push(spec.requiredField);
      metricDetails.push({ metric: spec.metric, value, expandedUncertainty: null, unit: spec.unit, status: 'missing_input_uncertainty', source: uncertainty?.source || spec.source || '未形成传播输入', sampleCount: spec.sampleCount ?? null });
      return;
    }
    uncertaintyMetrics[spec.metric] = expandedValue;
    metricDetails.push({ metric: spec.metric, value, expandedUncertainty: expandedValue, unit: spec.unit, status: 'calculated', source: uncertainty?.source || spec.source || spec.field || '一阶 RSS', sampleCount: spec.sampleCount ?? null });
  };
  for (const spec of options.metricSpecs || []) {
    const powerResult = spec.power ? () => {
      const entries = rows.map(powerUncertainty).filter((item) => Number.isFinite(item.value));
      return entries.length
        ? { value: Math.max(...entries.map((item) => item.value)) * (spec.scale || 1), source: `${[...new Set(entries.map((item) => item.source))].join('；')}；按报告功率单位换算` }
        : { value: null, source: '未形成可传播的功率不确定度' };
    } : null;
    add(spec, spec.uncertainty || powerResult || (spec.sampleStd ? () => pooledStdUncertainty(spec.field, spec.sampleCount) : spec.field ? fieldUncertainty(spec.field, spec.scale || 1) : null));
  }
  if (options.energyMetric) {
    const segments = [];
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1];
      const current = rows[index];
      if (previous?.session_id !== current?.session_id) continue;
      const deltaS = Number.isFinite(previous?.timestamp_s) && Number.isFinite(current?.timestamp_s) ? current.timestamp_s - previous.timestamp_s : 0;
      const previousU = powerUncertainty(previous).value;
      const currentU = powerUncertainty(current).value;
      if (deltaS > 0 && previousU !== null && currentU !== null) segments.push(rss([previousU, currentU]) * deltaS / 3600);
    }
    add(options.energyMetric, { value: rss(segments), source: '连续同会话梯形积分；各时间段一阶 RSS' });
  }
  const configuredFields = Object.keys(standard).filter((field) => Number.isFinite(Number(standard[field])));
  const status = metricDetails.some((item) => item.status === 'calculated') ? 'calculated' : 'insufficient';
  return {
    status,
    method,
    coverageFactor,
    metrics: uncertaintyMetrics,
    metricDetails,
    missingFields: [...new Set(missingFields)],
    configuredFields,
    assumptions: [
      '输出为 coverageFactor=k 下的扩展不确定度；输入值按 profile 的 standardUncertainty 解释。',
      '重复点和积分段采用一阶 RSS；未包含相关性、漂移、校准证书、采样同步和 Type A 重复性分量，不能单独构成完整 GUM 不确定度预算。',
      ...(options.metricSpecs?.some((spec) => spec.sampleStd) ? ['标准差指标只传播独立同分布传感器输入的不确定度分量；不把统计离散程度本身当作测量不确定度。'] : [])
    ],
    boundary: '不确定度传播仅覆盖已声明并可计算的工程 KPI；不替代企业批准的不确定度预算、仪器校准和实验室能力证据。'
  };
}

function workbookPointValue(point, pattern) {
  const entry = Object.entries(point?.values || {}).find(([header]) => pattern.test(String(header)));
  return entry ? num(entry[1]) : null;
}

function workbookStabilityCrossCheck(rows, workbookEvidence) {
  const reportPoints = workbookEvidence?.reportEvidence?.stability?.points || [];
  const timeSeriesSheet = workbookEvidence?.timeSeries?.sheetName || null;
  if (!reportPoints.length) return { status: 'not_available', reportPointCount: 0, matchedCount: 0, matches: [], boundary: '未发现可解析的出厂报告稳定性点。' };
  const candidates = rows.filter((row) => Number.isFinite(row.current_a) && Number.isFinite(row.voltage_v));
  const matches = reportPoints.map((point) => {
    const reportCurrentA = workbookPointValue(point, /电堆电流/);
    const reportVoltageV = workbookPointValue(point, /电堆电压/);
    const reportPowerKw = workbookPointValue(point, /电堆功率/);
    if (reportCurrentA === null || reportVoltageV === null || !candidates.length) return { reportSourceRow: point.sourceRow, reportCurrentA, reportVoltageV, reportPowerKw, status: 'unmatched', reason: '报告点或时序候选字段不足' };
    const selected = candidates.reduce((best, row) => {
      const score = [Math.abs(row.current_a - reportCurrentA), Math.abs(row.voltage_v - reportVoltageV)];
      if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && score[1] < best.score[1])) return { row, score };
      return best;
    }, null);
    const row = selected.row;
    return {
      reportSourceRow: point.sourceRow,
      reportCurrentA,
      reportVoltageV,
      reportPowerKw,
      timeSeriesRow: row.source_row_index ?? null,
      timeSeriesTimeS: row.session_timestamp_s ?? row.timestamp_s ?? null,
      timeSeriesCurrentA: row.current_a,
      timeSeriesVoltageV: row.voltage_v,
      timeSeriesPowerKw: Number.isFinite(enterpriseElectricalPower(row)) ? enterpriseElectricalPower(row) / 1000 : null,
      currentDeltaA: row.current_a - reportCurrentA,
      voltageDeltaV: row.voltage_v - reportVoltageV,
      powerDeltaKw: Number.isFinite(enterpriseElectricalPower(row)) && reportPowerKw !== null ? enterpriseElectricalPower(row) / 1000 - reportPowerKw : null,
      status: 'matched_descriptive_only',
      matchBasis: '先按电流绝对差最小，再按电压绝对差最小'
    };
  });
  return {
    status: matches.some((match) => match.status === 'matched_descriptive_only') ? 'descriptive_only' : 'not_available',
    reportPointCount: reportPoints.length,
    matchedCount: matches.filter((match) => match.status === 'matched_descriptive_only').length,
    timeSeriesSheet,
    matches,
    boundary: '仅按报告稳定性点与主时序中最近电流/电压记录做描述性交叉核对；未验证同批次、同仪器、同工况和企业一致性限值，不生成合格结论。'
  };
}

function phaseIndexesFor(config, rows, phaseId) {
  const aliases = [phaseId, ...(config.phaseAliases?.[phaseId] || [])].map(normalizedPhaseToken);
  return rows.map((row, index) => ({ row, index }))
    .filter(({ row }) => aliases.includes(normalizedPhaseToken(row.phase)))
    .map(({ index }) => index);
}

function sessionSpanS(rows) {
  const spans = new Map();
  for (const row of rows) {
    const session = row.session_id || '__single_session__';
    const time = Number.isFinite(row.session_timestamp_s) ? row.session_timestamp_s : row.timestamp_s;
    if (!Number.isFinite(time)) continue;
    const current = spans.get(session) || { min: time, max: time };
    current.min = Math.min(current.min, time);
    current.max = Math.max(current.max, time);
    spans.set(session, current);
  }
  return [...spans.values()].reduce((sum, span) => sum + Math.max(0, span.max - span.min), 0);
}

function enterprisePhaseCoverage(config, rows) {
  const metricRequirements = config.requiredPhaseMetrics && typeof config.requiredPhaseMetrics === 'object' ? config.requiredPhaseMetrics : {};
  const requiredPhases = [...new Set([...(Array.isArray(config.requiredPhases) ? config.requiredPhases : []), ...Object.keys(metricRequirements)])];
  const required = requiredPhases.map((phaseId) => {
    const indexes = phaseIndexesFor(config, rows, phaseId);
    let durationS = 0;
    let validSegmentCount = 0;
    let interruptedSegmentCount = 0;
    let nonPositiveIntervalCount = 0;
    for (let position = 1; position < indexes.length; position += 1) {
      const previousIndex = indexes[position - 1];
      const currentIndex = indexes[position];
      if (currentIndex !== previousIndex + 1 || rows[currentIndex]?.session_id !== rows[previousIndex]?.session_id) {
        interruptedSegmentCount += 1;
        continue;
      }
      const previous = rows[previousIndex];
      const current = rows[currentIndex];
      const previousTime = Number.isFinite(previous.session_timestamp_s) ? previous.session_timestamp_s : previous.timestamp_s;
      const currentTime = Number.isFinite(current.session_timestamp_s) ? current.session_timestamp_s : current.timestamp_s;
      const deltaS = Number.isFinite(previousTime) && Number.isFinite(currentTime)
        ? currentTime - previousTime
        : 0;
      if (deltaS <= 0) {
        nonPositiveIntervalCount += 1;
        continue;
      }
      durationS += deltaS;
      validSegmentCount += 1;
    }
    const timestamps = indexes.map((index) => rows[index].timestamp_s).filter((value) => Number.isFinite(value));
    const startS = timestamps.length ? Math.min(...timestamps) : null;
    const endS = timestamps.length ? Math.max(...timestamps) : null;
    const spanS = sessionSpanS(indexes.map((index) => rows[index]));
    return {
      id: phaseId,
      count: indexes.length,
      startS,
      endS,
      durationS: validSegmentCount ? durationS : indexes.length ? 0 : null,
      validSegmentCount,
      interruptedSegmentCount,
      nonPositiveIntervalCount,
      validDataCoveragePct: spanS !== null && spanS > 0
        ? (durationS / spanS) * 100
        : indexes.length >= 2 ? 100 : null,
      labels: [...new Set(indexes.map((index) => String(rows[index].phase || '未标注')))]
    };
  });
  return { required, missing: required.filter((phase) => phase.count === 0).map((phase) => phase.id) };
}

function enterprisePhaseMetricReadiness(config, rows) {
  const requirements = config.requiredPhaseMetrics && typeof config.requiredPhaseMetrics === 'object' ? config.requiredPhaseMetrics : {};
  const phaseIds = [...new Set([...(config.requiredPhases || []), ...Object.keys(requirements)])];
  const phases = {};
  const missing = [];
  for (const phaseId of phaseIds) {
    const indexes = phaseIndexesFor(config, rows, phaseId);
    const phaseRows = indexes.map((index) => rows[index]);
    const powers = phaseRows.map(enterpriseElectricalPower).filter((value) => value !== null);
    let durationS = 0;
    let energyConsumedWh = 0;
    let validSegments = 0;
    let interruptedSegmentCount = 0;
    const rampRates = [];
    for (let position = 1; position < indexes.length; position += 1) {
      const previousIndex = indexes[position - 1];
      const currentIndex = indexes[position];
      if (currentIndex !== previousIndex + 1 || rows[currentIndex]?.session_id !== rows[previousIndex]?.session_id) {
        interruptedSegmentCount += 1;
        continue;
      }
      const previous = rows[previousIndex];
      const current = rows[currentIndex];
      const previousTime = Number.isFinite(previous.session_timestamp_s) ? previous.session_timestamp_s : previous.timestamp_s;
      const currentTime = Number.isFinite(current.session_timestamp_s) ? current.session_timestamp_s : current.timestamp_s;
      const deltaS = Number.isFinite(previousTime) && Number.isFinite(currentTime) ? currentTime - previousTime : 0;
      if (deltaS <= 0) { interruptedSegmentCount += 1; continue; }
      durationS += deltaS;
      validSegments += 1;
      const previousPower = enterpriseElectricalPower(previous);
      const currentPower = enterpriseElectricalPower(current);
      if (previousPower !== null && currentPower !== null) {
        energyConsumedWh += ((previousPower + currentPower) / 2) * deltaS / 3600;
        rampRates.push((currentPower - previousPower) / deltaS);
      }
    }
    const timestamps = phaseRows.map((row) => row.timestamp_s).filter((value) => Number.isFinite(value));
    const startS = timestamps.length ? Math.min(...timestamps) : null;
    const endS = timestamps.length ? Math.max(...timestamps) : null;
    const spanS = sessionSpanS(phaseRows);
    const metric = {
      phaseId,
      sampleCount: phaseRows.length,
      durationS: validSegments ? durationS : null,
      energyConsumedWh: validSegments && phaseRows.every((row) => enterpriseElectricalPower(row) !== null) ? energyConsumedWh : null,
      powerRangeW: powers.length ? Math.max(...powers) - Math.min(...powers) : null,
      peakPowerW: powers.length ? Math.max(...powers) : null,
      minimumPowerW: powers.length ? Math.min(...powers) : null,
      maximumPowerW: powers.length ? Math.max(...powers) : null,
      maxRampUpWPerS: rampRates.length ? Math.max(0, ...rampRates) : null,
      maxRampDownWPerS: rampRates.length ? Math.max(0, ...rampRates.map((rate) => -rate)) : null,
      validDataCoveragePct: spanS !== null && spanS > 0 ? (durationS / spanS) * 100 : phaseRows.length >= 2 ? 100 : null,
      validSegments,
      interruptedSegmentCount,
      labels: [...new Set(phaseRows.map((row) => String(row.phase || '未标注')))]
    };
    phases[phaseId] = metric;
    for (const field of requirements[phaseId] || []) if (!Number.isFinite(metric[field])) missing.push(`${phaseId}.${field}`);
  }
  return { required: requirements, phases, missing, phaseCoverage: enterprisePhaseCoverage(config, rows) };
}

function profileGateIssues(complianceResult) {
  const issues = [];
  if (complianceResult.approvalEvidence?.required && !complianceResult.approvalEvidence.ready) issues.push({ severity: 'critical', code: 'APPROVAL_EVIDENCE_MISSING', title: 'approved profile 缺少有效审批与修订证据', evidence: complianceResult.approvalEvidence.evidence, recommendation: '补充审批人标识、审批日期、批准依据/工单号、当前 profile 修订号和修订证据引用后再进入人工符合性复核。' });
  if (complianceResult.methodExecutionStatus === 'FULL_METHOD_IMPLEMENTED' && !complianceResult.methodImplementationEvidence?.ready) issues.push({ severity: 'critical', code: 'METHOD_IMPLEMENTATION_EVIDENCE_MISSING', title: '完整方法执行声明缺少结构化实施证据', evidence: complianceResult.methodImplementationEvidence?.evidence || '未提供 methodImplementationEvidence', recommendation: '补充标准来源、条款/步骤覆盖、每项实施证据、验证人、验证日期、验证引用，并清空未关闭缺口后再声明 FULL_METHOD_IMPLEMENTED。' });
  if (complianceResult.measurements?.missing?.length) issues.push({ severity: 'critical', code: 'PROFILE_MEASUREMENT_MISSING', title: 'profile 要求的测量字段未形成有效数据', evidence: complianceResult.measurements.evidence, recommendation: '补充对应原始通道或选择适用的数据集 profile；不要用其他字段替代。' });
  if (complianceResult.phases?.missing?.length) issues.push({ severity: 'critical', code: 'PROFILE_PHASE_MISSING', title: 'profile 要求的测试段未覆盖', evidence: complianceResult.phases.evidence, recommendation: '补充对应测试段并确认阶段边界，不能把企业适配器摘要当作完整标准试验。' });
  if (complianceResult.phases?.missingMetrics?.length) issues.push({ severity: 'critical', code: 'PROFILE_PHASE_METRIC_MISSING', title: 'profile 要求的阶段指标未执行', evidence: complianceResult.phases.evidence, recommendation: '使用支持阶段 KPI 的原始时间序列和批准方法重新分析。' });
  if (complianceResult.acquisition?.missing?.length || complianceResult.acquisition?.unitMismatches?.length) issues.push({ severity: 'critical', code: 'ACQUISITION_EVIDENCE_MISSING', title: '结构化数据采集证据未形成', evidence: complianceResult.acquisition.evidence, recommendation: '补充采样、同步、通道单位和证据引用；自由文本不能替代采集记录。' });
  if (complianceResult.preCheck?.missing?.length || complianceResult.preCheck?.failed?.length || complianceResult.preCheck?.missingEvidence?.length) issues.push({ severity: 'critical', code: 'PRECHECK_EVIDENCE_MISSING', title: '试验前检查证据未形成', evidence: complianceResult.preCheck.evidence, recommendation: '逐项补充前检查状态和证据引用；不以总说明替代单项记录。' });
  if (complianceResult.dataQuality?.ready === false) issues.push({ severity: 'critical', code: 'DATA_QUALITY_GATE_FAILED', title: 'profile 要求的数据质量门控未通过', evidence: complianceResult.dataQuality.evidence, recommendation: '修复时间轴、采样间隔或阶段连续性后重新分析。' });
  if (complianceResult.phaseMetrics?.missing?.length) issues.push({ severity: 'critical', code: 'PROFILE_PHASE_METRIC_MISSING', title: 'profile 要求的实际阶段指标未形成', evidence: `缺少：${complianceResult.phaseMetrics.missing.join('、')}`, recommendation: '确认原始数据包含对应阶段标签和可计算的连续时间序列。' });
  if (complianceResult.uncertaintyModelRequired && complianceResult.uncertainty?.status !== 'calculated') issues.push({ severity: 'critical', code: complianceResult.uncertainty?.status === 'invalid' ? 'UNCERTAINTY_MODEL_INVALID' : 'UNCERTAINTY_MODEL_MISSING', title: 'profile 要求的不确定度传播未完成', evidence: complianceResult.uncertainty?.boundary || '未形成企业批准的不确定度传播结果', recommendation: '补充合法的 first_order_rss 模型、coverageFactor 和适用测量标准不确定度，并复核未覆盖指标。' });
  if (complianceResult.uncertaintyModelRequired && complianceResult.uncertainty?.missingFields?.length) issues.push({ severity: 'critical', code: 'UNCERTAINTY_INPUT_MISSING', title: '不确定度模型未覆盖已计算指标', evidence: `缺少输入不确定度：${complianceResult.uncertainty.missingFields.join('、')}`, recommendation: '为报告中的相关测量量补充企业批准的标准不确定度；不能用默认值或相邻通道替代。' });
  if (complianceResult.acceptance?.checks?.some((check) => check.provenanceStatus === 'missing')) issues.push({ severity: 'critical', code: 'ACCEPTANCE_PROVENANCE_MISSING', title: '正式验收规则缺少原始测量来源', evidence: '功率类验收指标只能使用原始功率通道；当前结果仅有电流×电压派生功率或缺少原始功率证据。', recommendation: '补充原始 power_w 通道及其单位/校准证据，或将该规则降级为 descriptive_only；不能用派生功率完成正式验收。' });
  return issues;
}

function compliance(config, datasetLabel, metrics, quality, rows = [], schema = {}) {
  const metadata = config.testMetadata && typeof config.testMetadata === 'object' ? config.testMetadata : {};
  const requiredMetadata = Array.isArray(config.requiredMetadata) ? config.requiredMetadata : [];
  const missingMetadata = requiredMetadata.filter((field) => metadata[field] === undefined || metadata[field] === null || metadata[field] === '' || (Array.isArray(metadata[field]) && !metadata[field].length));
  const missingProfileFields = [];
  const approvalEvidence = approvalEvidenceReadiness(config.approvalEvidence, config.revision, config.approvalStatus);
  const methodExecutionStatus = config.methodExecutionStatus || (config.standardRefs?.length ? 'ENTERPRISE_PROFILE_REQUIRED' : null);
  const standardReferenceEvidence = standardReferenceReadiness(config);
  const methodImplementationEvidence = methodImplementationEvidenceReadiness(config.methodImplementationEvidence, config.methodId, config.revision, methodExecutionStatus);
  const fullMethodProfile = fullMethodProfileReadiness({ ...config, methodExecutionStatus });
  if (config.approvalStatus !== 'approved') missingProfileFields.push('approved profile');
  if (config.approvalStatus === 'approved') {
    if (!approvalEvidence.ready) missingProfileFields.push('approvalEvidence');
    if (!standardReferenceEvidence.ready) missingProfileFields.push('standardReferenceEvidence');
    if (config.standardEvidenceBinding !== undefined && !config.standardEvidenceBinding?.ready) missingProfileFields.push('standardEvidenceBinding');
    if (!config.standardRefs?.length) missingProfileFields.push('standardRefs');
    if (!config.methodId || !config.revision) missingProfileFields.push('methodId/revision');
    if (!config.scopeRules) missingProfileFields.push('scopeRules');
    if (!config.instrumentRequirements?.length) missingProfileFields.push('instrumentRequirements');
    if (!config.reportRequirements?.length) missingProfileFields.push('reportRequirements');
    if (!config.acceptanceRules?.length && !Object.keys(config.acceptanceCriteria || {}).length) missingProfileFields.push('acceptanceRules');
  }
  if (methodExecutionStatus === 'FULL_METHOD_IMPLEMENTED' && !methodImplementationEvidence.ready) missingProfileFields.push('methodImplementationEvidence');
  if (methodExecutionStatus === 'FULL_METHOD_IMPLEMENTED' && !fullMethodProfile.ready) missingProfileFields.push('fullMethodProfileEvidence');
  const scopeRules = config.scopeRules;
  const scopeMissing = !scopeRules ? ['scopeRules'] : scopeRules.requiresDeviceFamily && !String(metadata.deviceFamily || '').trim() ? ['deviceFamily'] : [];
  const scope = { ready: scopeMissing.length === 0, status: scopeMissing.length ? 'missing' : 'ready', missing: scopeMissing, evidence: scopeMissing.length ? `缺少适用范围字段：${scopeMissing.join('、')}` : '设备家族适用范围已记录' };
  const instrumentRecords = metadata.instrumentRecords;
  const requiredInstruments = Array.isArray(config.instrumentRequirements) ? config.instrumentRequirements : [];
  const categories = new Set(Array.isArray(instrumentRecords) ? instrumentRecords.flatMap((record) => Array.isArray(record?.category) ? record.category : [record?.category]).map((value) => String(value || '').trim()) : []);
  const instrumentMissing = !requiredInstruments.length ? ['instrumentRequirements'] : !Array.isArray(instrumentRecords) ? requiredInstruments : requiredInstruments.filter((category) => !categories.has(category));
  const instruments = { ready: instrumentMissing.length === 0, status: instrumentMissing.length ? 'missing' : 'ready', missing: instrumentMissing, evidence: instrumentMissing.length ? `缺少结构化仪器类别：${instrumentMissing.join('、')}` : `${instrumentRecords.length} 条仪器记录已覆盖 profile 类别` };
  const rules = [...(Array.isArray(config.acceptanceRules) ? config.acceptanceRules : [])];
  const rawPowerAcceptanceMetrics = new Set(['peakPowerW', 'minimumPowerW', 'maximumPowerW', 'powerRangeW', 'energyConsumedWh', 'specificEnergyKWhPerNm3', 'peakPowerKw', 'averageNetPowerKw']);
  const rawPowerEvidenceReady = Boolean(schema?.mapping?.power_w) && rows.some((row) => Number.isFinite(row?.raw_power_w));
  const checks = rules.map((rule) => {
    const actual = metrics?.[rule.metric];
    const expected = Number(rule.value);
    const provenanceStatus = (config.approvalStatus === 'approved' || config.evaluationMode === 'acceptance') && rawPowerAcceptanceMetrics.has(String(rule.metric)) && !rawPowerEvidenceReady ? 'missing' : 'ready';
    const pass = Number.isFinite(actual) && (rule.operator === '<=' ? actual <= expected : rule.operator === '>=' ? actual >= expected : rule.operator === '<' ? actual < expected : rule.operator === '>' ? actual > expected : actual === expected);
    return { ...rule, actual, expected, provenanceStatus, status: provenanceStatus === 'missing' ? 'missing' : !Number.isFinite(actual) ? 'missing' : pass ? 'pass' : 'fail' };
  });
  const acceptance = rules.length ? { ready: checks.every((check) => check.status === 'pass'), status: checks.some((check) => check.status === 'missing') ? 'missing_measurement' : checks.some((check) => check.status === 'fail') ? 'failed' : 'ready', checks, evidence: checks.some((check) => check.provenanceStatus === 'missing') ? '功率类正式验收规则缺少原始 power_w 测量来源；派生功率仅作描述性 KPI' : checks.every((check) => check.status === 'pass') ? `${checks.length} 条企业验收规则已计算` : '企业验收规则存在缺失或未通过' } : { ready: false, status: 'not_configured', checks: [], evidence: '没有企业批准的验收规则' };
  const reportRequired = Array.isArray(config.reportRequirements) ? config.reportRequirements : [];
  const reportAvailable = { testPurpose: Boolean(metadata.testPurpose), instrumentIds: Boolean(metadata.instrumentIds), operator: Boolean(metadata.operator), formulaRefs: Boolean(metadata.formulaRefs), charts: Boolean(quality?.rowCount >= 2), conclusion: true };
  const reportMissing = reportRequired.filter((field) => !reportAvailable[field]);
  const report = { ready: reportRequired.length > 0 && reportMissing.length === 0, missing: reportMissing, evidence: reportMissing.length ? `报告字段缺失：${reportMissing.join('、')}` : reportRequired.length ? `${reportRequired.length} 类报告字段均有证据` : 'profile 未声明报告字段要求' };
  const testStages = testStageReadiness(config);
  const testSystem = testSystemReadiness(config);
  const testConditions = testConditionReadiness(config);
  const environmentConditions = environmentConditionReadiness(config);
  const measurementMethods = measurementMethodReadiness(config);
  const efficiency = efficiencyReadiness(config, rows, schema);
  const phaseMetrics = enterprisePhaseMetricReadiness(config, rows);
  const phaseResults = phaseResultReadiness(config, phaseMetrics);
  const acquisition = acquisitionReadiness(config);
  const preCheck = preCheckReadiness(config);
  const phaseCoverage = phaseMetrics.phaseCoverage;
  const plannedSamplingFrequencyHz = Number(metadata.acquisitionRecord?.samplingFrequencyHz);
  if (Number.isFinite(plannedSamplingFrequencyHz) && plannedSamplingFrequencyHz > 0) {
    quality.plannedSamplingFrequencyHz = plannedSamplingFrequencyHz;
    quality.plannedIntervalS = 1 / plannedSamplingFrequencyHz;
    if (quality.medianIntervalS !== null) quality.samplingIntervalDeviationPct = ((quality.medianIntervalS - quality.plannedIntervalS) / quality.plannedIntervalS) * 100;
  }
  const configuredMaxIntervalS = Number(config.dataQualityRequirements?.maxIntervalS);
  const intervalMultiplier = Number(config.dataQualityRequirements?.maxIntervalMultiplier);
  const gapLimitS = Number.isFinite(configuredMaxIntervalS) && configuredMaxIntervalS > 0
    ? configuredMaxIntervalS
    : Number.isFinite(intervalMultiplier) && intervalMultiplier > 0 && quality.plannedIntervalS !== null
      ? quality.plannedIntervalS * intervalMultiplier
      : null;
  quality.gapLimitS = gapLimitS;
  quality.samplingGapCount = gapLimitS === null || quality.maximumIntervalS === null ? null : rows.map((row, index) => {
    const next = rows[index + 1];
    return next && Number.isFinite(row.timestamp_s) && Number.isFinite(next.timestamp_s) ? next.timestamp_s - row.timestamp_s : null;
  }).filter((delta) => delta !== null && delta > gapLimitS).length;
  const dataQuality = dataQualityReadiness(config, quality, phaseCoverage);
  const measurements = enterpriseMeasurementReadiness(config, rows);
  const phases = enterprisePhaseReadiness(config, rows, phaseMetrics);
  const uncertaintyModelRequired = config.uncertaintyModelRequired === true;
  const uncertaintyModelConfigured = Boolean(config.uncertaintyModel);
  const standardEvidenceBindingRequired = Boolean(config.standardRefs?.length && config.methodSource);
  const formalBlockers = missingProfileFields.length || missingMetadata.length || !approvalEvidence.ready || !standardReferenceEvidence.ready || (standardEvidenceBindingRequired && config.standardEvidenceBinding?.ready !== true) || !methodImplementationEvidence.ready || !fullMethodProfile.ready || !scope.ready || !instruments.ready || !acceptance.ready || !report.ready || !testStages.ready || !testSystem.ready || !testConditions.ready || !environmentConditions.ready || !measurementMethods.ready || !efficiency.ready || !phaseResults.ready || !acquisition.ready || !preCheck.ready || !dataQuality.ready || phaseMetrics.missing.length || !measurements.ready || !phases.ready || (uncertaintyModelRequired && !uncertaintyModelConfigured);
  const status = config.approvalStatus !== 'approved' ? 'DEMO_ONLY' : formalBlockers ? 'NOT_READY' : 'READY_FOR_HUMAN_REVIEW';
  return { status, label: status === 'DEMO_ONLY' ? '仅演示，不作标准符合性判定' : status === 'NOT_READY' ? `${datasetLabel} · 标准化资料不完整` : `${datasetLabel} · 可进入人工符合性复核`, approvalStatus: config.approvalStatus || 'pending', approvalEvidence, standardReferenceEvidence, methodExecutionStatus, methodImplementationEvidence, fullMethodProfile, standardRefs: config.standardRefs || [], standardEvidenceBinding: config.standardEvidenceBinding || { ready: !config.standardRefs?.length, status: config.standardRefs?.length ? 'missing' : 'not_configured' }, methodId: config.methodId || null, revision: config.revision || null, methodSource: config.methodSource || null, standardStatus: config.status || null, publicationDate: config.publicationDate || null, effectiveDate: config.effectiveDate || null, scopeEvidence: config.scopeEvidence || null, workflowEvidence: config.workflowEvidence || null, applicationScope: config.applicationScope || datasetLabel, intendedUse: config.intendedUse || '企业资料结构适配与人工复核前处理', missingProfileFields, requiredMetadata, missingMetadata, requiredMeasurements: measurements.required, missingMeasurements: measurements.missing, requiredPhases: phases.required, missingPhases: phases.missing, requiredPhaseMetrics: config.requiredPhaseMetrics || {}, missingPhaseMetrics: phases.missingMetrics, phaseMetrics, requiredTestStages: config.requiredTestStages || [], testSystemRequirements: config.testSystemRequirements || [], testConditionRequirements: config.testConditionRequirements || null, environmentConditionRequirements: config.environmentConditionRequirements || null, phaseResultRequirements: config.phaseResultRequirements || [], measurementMethodRequirements: config.measurementMethodRequirements || [], efficiencyRequirement: config.efficiencyRequirement || null, acquisition, preCheck, dataQuality, testStages, testSystem, testConditions, environmentConditions, measurementMethods, phaseResults, efficiency, measurements, phases, acceptanceCriteria: config.acceptanceCriteria || {}, acceptanceRules: config.acceptanceRules || [], scope, instruments, acceptance, report, uncertaintyModelRequired, uncertaintyModelConfigured, uncertainty: uncertaintyModelConfigured ? { status: 'configured_pending_calculation' } : { status: 'not_configured' } };
}

function commonSchema(mapping, fieldCount = Object.keys(mapping).length, conversionOverrides = {}) {
  return {
    headers: Object.values(mapping).filter(Boolean),
    mapping,
    conversions: Object.fromEntries(Object.keys(mapping).map((field) => [field, conversionOverrides[field] || identity])),
    missingHeaders: Object.entries(mapping).filter(([, source]) => !source).map(([field]) => field),
    missingOptionalHeaders: [],
    mappingWarnings: [],
    mappedCount: Object.values(mapping).filter(Boolean).length,
    fieldCount
  };
}

function efficiencyMapping(headers) {
  const source = findHeader(headers, ['efficiency_pct', 'efficiency', 'system_efficiency', 'efficiency_percent', '效率', '系统效率', '能效']);
  return source ? { efficiency_pct: source } : {};
}

function workflow(dataset, quality, issues, targetConfigured = true, complianceResult = null) {
  const hardDataIssue = !quality.usable || quality.missingHeaders.length > 0;
  const issueReview = issues.some((item) => item.severity === 'critical' || item.severity === 'warn');
  const steps = [
    { id: 'dataset', label: '企业数据集识别', status: 'ready', evidence: dataset.label },
    { id: 'data', label: '原始数据质量', status: hardDataIssue ? 'blocked' : quality.completenessPct >= 98 ? 'ready' : 'needs_review', evidence: `${quality.rowCount} 条记录 · 完整率 ${quality.completenessPct.toFixed(1)}%` },
    { id: 'traceability', label: '字段与时间轴追溯', status: quality.duplicateTimestampCount || quality.nonMonotonicCount ? 'needs_review' : 'ready', evidence: `重复时间戳 ${quality.duplicateTimestampCount} 条 · 逆序 ${quality.nonMonotonicCount} 次` },
    { id: 'rules', label: '企业规则/目标工况', status: targetConfigured ? 'needs_review' : 'needs_input', evidence: targetConfigured ? '已使用当前会话参数' : '尚未提供目标电流或目标工况参数' },
    { id: 'approval-evidence', label: 'profile 审批与修订证据', status: complianceResult?.approvalEvidence?.ready ? 'ready' : 'needs_input', evidence: complianceResult?.approvalEvidence?.evidence || 'approved profile 未形成审批证据' },
    { id: 'method-implementation-evidence', label: '完整方法实施证据', status: complianceResult?.methodImplementationEvidence?.ready ? 'ready' : 'needs_input', evidence: complianceResult?.methodImplementationEvidence?.evidence || '未声明完整方法实施证据' },
    { id: 'acquisition', label: '结构化数据采集证据', status: complianceResult?.acquisition?.ready ? 'ready' : 'needs_input', evidence: complianceResult?.acquisition?.evidence || '尚未形成结构化采集证据' },
    { id: 'pre-check', label: '逐项试验前检查状态', status: complianceResult?.preCheck?.ready ? 'ready' : 'needs_input', evidence: complianceResult?.preCheck?.evidence || '尚未形成逐项前检查证据' },
    { id: 'data-quality', label: '时间轴与阶段数据质量', status: complianceResult?.dataQuality?.ready ? 'ready' : 'needs_input', evidence: complianceResult?.dataQuality?.evidence || '尚未核对采样间隔和阶段连续性' },
    { id: 'phase-coverage', label: '测试段与阶段指标', status: complianceResult?.phaseMetrics?.missing?.length || complianceResult?.missingPhases?.length ? 'needs_input' : 'ready', evidence: complianceResult?.phaseMetrics?.missing?.length ? `缺少 ${complianceResult.phaseMetrics.missing.join('、')}` : complianceResult?.missingPhases?.length ? `缺少 ${complianceResult.missingPhases.join('、')}` : 'profile 要求的测试段和阶段指标均已形成' },
    { id: 'scope', label: '设备适用范围', status: complianceResult?.scope?.ready ? 'ready' : 'needs_input', evidence: complianceResult?.scope?.evidence || '尚未核对' },
    { id: 'test-stages', label: '标准测试阶段证据', status: complianceResult?.testStages?.ready ? 'ready' : 'needs_input', evidence: complianceResult?.testStages?.evidence || '尚未核对' },
    { id: 'test-system', label: '测试系统组成证据', status: complianceResult?.testSystem?.ready ? 'ready' : 'needs_input', evidence: complianceResult?.testSystem?.evidence || '尚未核对' },
    { id: 'test-conditions', label: '测试条件与异常处置', status: complianceResult?.testConditions?.ready ? 'ready' : 'needs_input', evidence: complianceResult?.testConditions?.evidence || '尚未核对' },
    { id: 'environment-conditions', label: '环境条件证据', status: complianceResult?.environmentConditions?.ready ? 'ready' : 'needs_input', evidence: complianceResult?.environmentConditions?.evidence || '尚未核对' },
    { id: 'instruments', label: '仪器精度与校准溯源', status: complianceResult?.instruments?.ready ? 'ready' : 'needs_input', evidence: complianceResult?.instruments?.evidence || '尚未核对' },
    { id: 'measurement-methods', label: '测量方法与证据引用', status: complianceResult?.measurementMethods?.ready ? 'ready' : 'needs_input', evidence: complianceResult?.measurementMethods?.evidence || '尚未核对' },
    { id: 'efficiency', label: '效率结果与批准公式', status: complianceResult?.efficiency?.ready ? 'ready' : 'needs_input', evidence: complianceResult?.efficiency?.evidence || '尚未核对' },
    { id: 'uncertainty', label: '测量不确定度传播', status: complianceResult?.uncertaintyModelRequired ? (complianceResult?.uncertainty?.status === 'calculated' && !(complianceResult?.uncertainty?.missingFields?.length) ? 'ready' : 'needs_input') : complianceResult?.uncertainty?.status === 'calculated' ? 'ready' : 'needs_review', evidence: complianceResult?.uncertainty?.missingFields?.length ? `缺少输入不确定度：${complianceResult.uncertainty.missingFields.join('、')}` : complianceResult?.uncertainty?.boundary || (complianceResult?.uncertaintyModelRequired ? 'profile 要求不确定度模型但尚未完成传播' : 'profile 未要求企业不确定度模型') },
    { id: 'phase-results', label: '方法阶段结果证据', status: complianceResult?.phaseResults?.ready ? 'ready' : 'needs_input', evidence: complianceResult?.phaseResults?.evidence || '尚未核对' },
    { id: 'acceptance', label: '企业验收规则', status: complianceResult?.acceptance?.ready ? 'ready' : 'needs_input', evidence: complianceResult?.acceptance?.evidence || '尚未核对' },
    { id: 'report', label: '报告字段与结论', status: complianceResult?.report?.ready ? 'ready' : 'needs_input', evidence: complianceResult?.report?.evidence || '尚未核对' },
    { id: 'human', label: '工程师复核与签核', status: complianceResult?.missingMetadata?.length ? 'needs_input' : 'needs_review', evidence: complianceResult?.missingMetadata?.length ? `缺少 ${complianceResult.missingMetadata.join('、')}` : '企业批准规则和异常处置仍需工程师签核' }
  ];
  const status = hardDataIssue ? 'BLOCKED_DATA' : complianceResult?.status === 'DEMO_ONLY' ? 'DEMO_ONLY' : complianceResult?.status === 'NOT_READY' ? 'NOT_READY' : issueReview ? 'REVIEW_REQUIRED' : 'READY_FOR_HUMAN_REVIEW';
  return { status, nextAction: hardDataIssue ? '先修复时间轴或关键字段，再重跑。' : status === 'NOT_READY' ? '补齐 profile、适用范围、仪器证据、验收规则和报告字段。' : issueReview ? '复核异常证据、完成处置并决定是否复测。' : '可进入人工符合性复核与正式归档。', steps };
}

function vehicleSegments(rows, targetCurrents, toleranceA, minimumDurationS, activeStatuses = [4]) {
  const segments = [];
  const allowedStatuses = new Set(activeStatuses.map(Number).filter(Number.isFinite));
  const hasStatus = rows.some((row) => Number.isFinite(row?.main_status));
  const timeOf = (row) => row?.session_timestamp_s ?? row?.timestamp_s;
  let active = null;
  const close = (endIndex) => {
    if (!active) return;
    const end = rows[endIndex - 1] ?? rows.at(-1);
    if (end && active.start && timeOf(end) !== null) {
      const durationS = timeOf(end) - timeOf(active.start);
      const sampleRows = rows.slice(active.startIndex, endIndex);
      const tailRows = sampleRows.filter((row) => timeOf(row) >= timeOf(active.start) + Math.min(minimumDurationS, durationS));
      if (durationS >= minimumDurationS) {
        const values = (field, source = tailRows) => source.map((row) => row[field]).filter((value) => value !== null);
        segments.push({
          targetCurrentA: active.target,
          sessionId: active.sessionId,
          sourceFile: active.start.source_file || null,
          startS: timeOf(active.start),
          endS: timeOf(end),
          startRuntimeH: active.start.runtime_h,
          endRuntimeH: end.runtime_h,
          startTimestampEpochS: active.start.timestamp_epoch_s,
          endTimestampEpochS: end.timestamp_epoch_s,
          startTimestampRaw: active.start.timestamp_raw || null,
          endTimestampRaw: end.timestamp_raw || null,
          durationS,
          sampleCount: sampleRows.length,
          effectiveSampleCount: tailRows.length,
          averageCurrentA: mean(values('current_a')),
          averageCellVoltageV: mean(values('avg_cell_voltage_v')),
          averageCellDeviationMv: mean(values('avg_cell_dev_mv')),
          averageCellVariance: mean(values('cell_voltage_variance')),
          averageNetPowerKw: mean(values('net_power_kw')),
          status: 'valid'
        });
      }
    }
    active = null;
  };
  rows.forEach((row, index) => {
    if (active && row.session_id !== active.sessionId) close(index);
    if (hasStatus && !allowedStatuses.has(row.main_status)) { close(index); return; }
    const current = row.current_a;
    const target = targetCurrents.find((candidate) => current !== null && Math.abs(current - candidate) <= toleranceA);
    if (target === undefined) { close(index); return; }
    if (!active || active.target !== target) { close(index); active = { target, start: row, startIndex: index, sessionId: row.session_id }; }
  });
  close(rows.length);
  return segments;
}

function chooseVehicleTrendAxis(points, requestedAxis = 'runtime_h') {
  const requested = requestedAxis === 'timestamp' ? 'timestamp' : 'runtime_h';
  const available = {
    runtime_h: points.map((point) => point.startRuntimeH).filter(Number.isFinite),
    timestamp: points.map((point) => point.startTimestampEpochS).filter(Number.isFinite)
  };
  const canFit = (axis) => new Set(available[axis]).size >= 2;
  const axis = canFit(requested) ? requested : canFit(requested === 'runtime_h' ? 'timestamp' : 'runtime_h') ? (requested === 'runtime_h' ? 'timestamp' : 'runtime_h') : requested;
  return {
    requestedAxis: requested,
    axis,
    xUnit: axis === 'runtime_h' ? 'h' : 'day',
    label: axis === 'runtime_h' ? 'FC_RunTime_Hours / 运行时长' : 'Timestamp / 实际日期时间',
    fallbackReason: axis === requested ? null : `${requested} 在正式性能点中没有至少两个不同的有效横轴值，已回退到 ${axis}`,
    availablePointCounts: Object.fromEntries(Object.entries(available).map(([key, values]) => [key, values.length]))
  };
}

function attachVehicleTrendAxis(points, selection) {
  return points.map((point) => {
    const rawX = selection.axis === 'runtime_h' ? point.startRuntimeH : point.startTimestampEpochS;
    const trendX = selection.axis === 'runtime_h' ? rawX : Number.isFinite(rawX) ? rawX / 86400 : null;
    return {
      ...point,
      trendX,
      trendXUnit: selection.xUnit,
      trendLabel: selection.axis === 'runtime_h'
        ? (Number.isFinite(rawX) ? `${rawX.toFixed(3)} h` : null)
        : (Number.isFinite(rawX) ? new Date(rawX * 1000).toISOString() : point.startTimestampRaw || null)
    };
  });
}

function vehicleTrendMetric(points, field, selection, model) {
  const trendPoints = points.map((point) => [point.trendX, point[field]]).filter(([, value]) => Number.isFinite(value));
  return { x: selection.axis, xLabel: selection.label, ...fitTrendModel(trendPoints, model, selection.xUnit) };
}

function descriptiveCurrentBinA(rows, configured, fallback = 5) {
  const values = rows.map((row) => row.current_a).filter(Number.isFinite).sort((a, b) => a - b);
  if (Number.isFinite(Number(configured)) && Number(configured) > 0) return Number(configured);
  if (values.length < 2) return fallback;
  const p05 = values[Math.floor((values.length - 1) * 0.05)];
  const p95 = values[Math.floor((values.length - 1) * 0.95)];
  return Math.max(0.5, Math.min(fallback, (p95 - p05) * 0.01 || fallback));
}

function descriptiveGapLimitS(rows) {
  const intervals = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1]; const current = rows[index];
    if (previous.session_id !== current.session_id) continue;
    const previousS = previous.session_timestamp_s ?? previous.timestamp_s;
    const currentS = current.session_timestamp_s ?? current.timestamp_s;
    if (Number.isFinite(previousS) && Number.isFinite(currentS) && currentS > previousS) intervals.push(currentS - previousS);
  }
  if (!intervals.length) return 60;
  const sorted = [...intervals].sort((a, b) => a - b);
  return Math.max(60, sorted[Math.floor(sorted.length / 2)] * 5);
}

function descriptiveSegmentSummary(sampleRows, index, kind, binWidthA, minimumDurationS) {
  const start = sampleRows[0]; const end = sampleRows.at(-1);
  const timeOf = (row) => row?.session_timestamp_s ?? row?.timestamp_s;
  const values = (field) => sampleRows.map((row) => row[field]).filter(Number.isFinite);
  const currentValues = values('current_a');
  const duration = Number.isFinite(timeOf(start)) && Number.isFinite(timeOf(end))
    ? Math.max(0, timeOf(end) - timeOf(start))
    : 0;
  const prefix = kind === 'vehicle' ? 'vehicle' : 'stack';
  return {
    candidateId: `${prefix}:${start?.session_id || 'session-1'}:inferred-${index + 1}`,
    platformId: kind === 'stack' ? `${start?.session_id || 'session-1'}:inferred-${index + 1}` : null,
    sessionId: start?.session_id || null,
    sourceFile: start?.source_file || null,
    startS: timeOf(start) ?? null,
    endS: timeOf(end) ?? null,
    durationS: duration,
    sampleCount: sampleRows.length,
    effectiveSampleCount: sampleRows.length,
    averageCurrentA: mean(currentValues),
    currentMinA: currentValues.length ? Math.min(...currentValues) : null,
    currentMaxA: currentValues.length ? Math.max(...currentValues) : null,
    currentRangeA: currentValues.length ? Math.max(...currentValues) - Math.min(...currentValues) : null,
    averageCellVoltageV: mean(values('avg_cell_voltage_v')),
    averageCellDeviationMv: mean(values('avg_cell_dev_mv')),
    averageCellVariance: mean(values('cell_voltage_variance')),
    averageNetPowerKw: mean(values('net_power_kw')) ?? mean(values('power_kw')),
    status: duration >= minimumDurationS ? 'inferred_candidate' : 'inferred_too_short',
    classification: 'inferred',
    decisionScope: 'descriptive_only',
    targetProvided: false,
    binWidthA,
    minimumDurationS,
    analysisBasis: 'continuous_current_band_and_time_continuity'
  };
}

function continuousCurrentSegments(rows, { kind, minimumDurationS, binWidthA, activeOnly = false, includeRows = false }) {
  const gapLimitS = descriptiveGapLimitS(rows);
  const segments = []; let active = null; let sequence = 0;
  const close = () => {
    if (!active) return;
    sequence += 1;
    const summary = descriptiveSegmentSummary(active.rows, sequence - 1, kind, binWidthA, minimumDurationS);
    if (summary.status === 'inferred_candidate') {
      if (includeRows) summary._rows = active.rows;
      segments.push(summary);
    }
    active = null;
  };
  rows.forEach((row) => {
    const current = row.current_a;
    const valid = Number.isFinite(current) && current > 0 && (!activeOnly || (Number.isFinite(row.voltage_v) && row.voltage_v > 0 && Number.isFinite(row.net_power_kw) && row.net_power_kw > 0));
    if (!valid) { close(); return; }
    if (active && row.session_id !== active.sessionId) close();
    const previous = active?.rows.at(-1);
    const previousS = previous?.session_timestamp_s ?? previous?.timestamp_s;
    const currentS = row.session_timestamp_s ?? row.timestamp_s;
    const gap = Number.isFinite(previousS) && Number.isFinite(currentS) ? currentS - previousS : 0;
    const bucket = Math.round(current / binWidthA);
    if (active && (active.bucket !== bucket || gap > gapLimitS)) close();
    if (!active) active = { bucket, sessionId: row.session_id, rows: [row] };
    else active.rows.push(row);
  });
  close();
  return { segments, gapLimitS };
}

function inferVehicleSegments(rows, config) {
  const minimumDurationS = Number(config.vehicleInferredMinimumDurationS ?? 180);
  const binWidthA = descriptiveCurrentBinA(rows, config.vehicleInferredBinA, 5);
  const inferred = continuousCurrentSegments(rows, { kind: 'vehicle', minimumDurationS, binWidthA, activeOnly: true });
  return { ...inferred, minimumDurationS, binWidthA };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function relativeStabilityConfig(config, parameterConfig, minimumDurationS) {
  const explicit = config.stackInferredStability && typeof config.stackInferredStability === 'object'
    ? config.stackInferredStability
    : {};
  const parameterRules = Array.isArray(parameterConfig?.parameterRules) ? parameterConfig.parameterRules : [];
  const configuredRules = Array.isArray(explicit.rules) ? explicit.rules : parameterRules;
  const rules = configuredRules.map((rule) => {
    const lower = Number(rule.lowerTolerance);
    const upper = Number(rule.upperTolerance);
    const defaultDeviation = [lower, upper].filter(Number.isFinite).reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
    const maxDeviation = Number.isFinite(Number(rule.maxDeviation)) ? Number(rule.maxDeviation) : defaultDeviation;
    const maxRange = Number.isFinite(Number(rule.maxRange)) ? Number(rule.maxRange) : maxDeviation * 2;
    return {
      code: String(rule.code || rule.field || '').trim(),
      field: String(rule.field || '').trim(),
      unit: rule.unit || '',
      maxDeviation,
      maxRange,
      required: rule.required !== false
    };
  }).filter((rule) => rule.field && rule.maxDeviation > 0 && rule.maxRange > 0);
  const enabled = explicit.enabled === true || parameterConfig?.analysisMode === 'relative_stability';
  const windowS = Number(explicit.windowS ?? minimumDurationS);
  const center = explicit.center === 'median' ? 'median' : 'mean';
  return {
    enabled,
    windowS: Number.isFinite(windowS) && windowS > 0 ? windowS : minimumDurationS,
    center,
    rules,
    source: explicit.rules ? 'config.stackInferredStability' : parameterConfig?.analysisMode === 'relative_stability' ? '参数工作簿' : null,
    boundary: '无目标工况时仅按当前电流连续性和窗口内相对稳定性筛选；不生成目标符合性、正式稳定点或极化性能点。'
  };
}

function descriptiveStableWindows(sampleRows, stability, minimumDurationS) {
  const timeOf = (row) => row?.session_timestamp_s ?? row?.timestamp_s;
  const windows = [];
  for (let startIndex = 0; startIndex < sampleRows.length; startIndex += 1) {
    const startTime = timeOf(sampleRows[startIndex]);
    if (!Number.isFinite(startTime)) continue;
    let endIndex = startIndex;
    while (endIndex + 1 < sampleRows.length) {
      const nextTime = timeOf(sampleRows[endIndex + 1]);
      if (!Number.isFinite(nextTime) || nextTime - startTime > stability.windowS) break;
      endIndex += 1;
    }
    const endTime = timeOf(sampleRows[endIndex]);
    if (!Number.isFinite(endTime) || endTime - startTime < stability.windowS) continue;
    const windowRows = sampleRows.slice(startIndex, endIndex + 1);
    const checks = stability.rules.map((rule) => {
      const values = windowRows.map((row) => row[rule.field]).filter(Number.isFinite);
      if (!values.length) return { ...rule, count: 0, status: rule.required ? 'missing' : 'ignored' };
      const center = stability.center === 'median' ? median(values) : mean(values);
      const minimum = Math.min(...values);
      const maximum = Math.max(...values);
      const range = maximum - minimum;
      const maxAbsoluteDeviation = Math.max(...values.map((value) => Math.abs(value - center)));
      return {
        ...rule,
        count: values.length,
        center,
        min: minimum,
        max: maximum,
        range,
        maxAbsoluteDeviation,
        status: maxAbsoluteDeviation <= rule.maxDeviation && range <= rule.maxRange ? 'stable' : 'unstable'
      };
    });
    if (checks.every((check) => check.status === 'stable' || check.status === 'ignored')) windows.push({ startIndex, endIndex, checks });
  }
  const merged = [];
  for (const window of windows) {
    const current = merged.at(-1);
    if (current && window.startIndex <= current.endIndex + 1) {
      current.endIndex = Math.max(current.endIndex, window.endIndex);
      current.checks = window.checks;
    } else merged.push({ ...window });
  }
  return merged.filter((window) => {
    const start = timeOf(sampleRows[window.startIndex]);
    const end = timeOf(sampleRows[window.endIndex]);
    return Number.isFinite(start) && Number.isFinite(end) && end - start >= minimumDurationS;
  }).map((window) => ({
    ...window,
    startS: timeOf(sampleRows[window.startIndex]),
    endS: timeOf(sampleRows[window.endIndex]),
    durationS: timeOf(sampleRows[window.endIndex]) - timeOf(sampleRows[window.startIndex])
  }));
}

function inferStackSegments(rows, config) {
  const minimumDurationS = Number(config.stackInferredMinimumDurationS ?? 60);
  const binWidthA = descriptiveCurrentBinA(rows, config.stackInferredBinA, 5);
  const inferred = continuousCurrentSegments(rows, { kind: 'stack', minimumDurationS, binWidthA, includeRows: true });
  const stability = relativeStabilityConfig(config, config.parameterConfig, minimumDurationS);
  const inferredSegments = stability.enabled && stability.rules.length
    ? inferred.segments.flatMap((segment) => descriptiveStableWindows(segment._rows || [], stability, minimumDurationS).map((window, index) => {
      const summary = descriptiveSegmentSummary((segment._rows || []).slice(window.startIndex, window.endIndex + 1), index, 'stack', binWidthA, minimumDurationS);
      return {
        ...summary,
        startS: window.startS,
        endS: window.endS,
        durationS: window.durationS,
        analysisBasis: 'continuous_current_band_and_configured_relative_stability_window',
        relativeStability: { windowS: stability.windowS, center: stability.center, checks: window.checks, source: stability.source }
      };
    }))
    : inferred.segments.map(({ _rows: _ignored, ...segment }) => segment);
  const platforms = inferredSegments.map((segment) => ({
    ...segment,
    conditionId: segment.candidateId,
    targetCurrentA: null,
    toleranceA: null,
    status: 'inferred_candidate',
    rows: undefined
  }));
  const stableSegments = inferredSegments.map((segment) => ({
    ...segment,
    segmentId: segment.candidateId,
    conditionId: segment.candidateId,
    selected: false,
    selectedBy: null,
    automaticSelected: false,
    parameterComplete: false,
    missingParameters: ['TARGET_CONDITIONS'],
    selectionPolicy: 'not_selected_without_target_parameters'
  }));
  return {
    platforms,
    stableSegments,
    performancePoints: [],
    selectionAudit: [],
    selectionPolicy: 'not_selected_without_target_parameters',
    inferredSegments,
    relativeStability: stability,
    gapLimitS: inferred.gapLimitS,
    minimumDurationS,
    binWidthA
  };
}

function buildDurability(rows, config) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const efficiencyFields = efficiencyMapping(headers);
  const normalized = rows.map((row, index) => ({
    timestamp_s: index,
    phase: `目标功率${row.target_power_kw ?? '未知'}kW`,
    target_power_kw: num(row.target_power_kw),
    humidity_pct: num(row.humidity_pct),
    temperature_c: num(row.temperature_c),
    net_power_kw: num(row.net_power_kw),
    current_a: num(row.stack_current_a),
    average_cell_voltage_mv: num(row.average_cell_voltage_mv),
    average_deviation_mv: num(row.average_deviation_mv),
    compressor_power_kw: num(row.compressor_power_kw),
    pump_power_kw: num(row.pump_power_kw),
    coolant_in_temp_c: num(row.coolant_in_temp_c),
    coolant_out_temp_c: num(row.coolant_out_temp_c),
    hfr: num(row.hfr),
    lfr: num(row.lfr),
    voltage_variance: num(row.voltage_variance),
    efficiency_pct: num(row[efficiencyFields.efficiency_pct]),
    source_file: row.source_file || null
  }));
  const required = ['timestamp_s', 'target_power_kw', 'average_cell_voltage_mv', 'average_deviation_mv', 'voltage_variance'];
  const quality = qualityFor(normalized, required);
  quality.usable = normalized.length >= 2 && quality.missingHeaders.length === 0 && quality.invalidValueCounts.timestamp_s === 0;
  const reports = Array.isArray(config.durabilityReports) ? config.durabilityReports : [];
  const crossReportSummary = summarizeDurabilityReports(reports);
  const rules = config.durabilityRules || {};
  const maxDeviationMv = Number(rules.maxDeviationMv);
  const minAverageCellVoltageMv = Number(rules.minAverageCellVoltageMv);
  const issues = [];
  for (const report of reports) if (String(report.metadata?.测试结果 || '').includes('未通过')) issues.push({ severity: 'critical', code: 'DURABILITY_REPORT_FAIL', title: '原始耐久报告标记未通过', evidence: `${report.metadata?.测试方案 || '耐久报告'} 的企业原始结果为未通过`, recommendation: '先按原始报告定位异常工步，再决定是否复测或放行。' });
  if (Number.isFinite(maxDeviationMv)) for (const point of normalized.filter((item) => item.average_deviation_mv !== null && item.average_deviation_mv > maxDeviationMv)) issues.push({ severity: 'warn', code: 'DURABILITY_DEVIATION_HIGH', title: '耐久功率点离均差超过当前规则', evidence: `${point.target_power_kw} kW：离均差 ${point.average_deviation_mv} mV > ${maxDeviationMv} mV`, recommendation: '检查单片电压一致性、负载点稳定时间和采集通道。' });
  if (Number.isFinite(minAverageCellVoltageMv)) for (const point of normalized.filter((item) => item.average_cell_voltage_mv !== null && item.average_cell_voltage_mv < minAverageCellVoltageMv)) issues.push({ severity: 'warn', code: 'DURABILITY_CELL_VOLTAGE_LOW', title: '耐久功率点平均单体电压低于当前规则', evidence: `${point.target_power_kw} kW：平均单体电压 ${point.average_cell_voltage_mv} mV < ${minAverageCellVoltageMv} mV`, recommendation: '检查电堆衰减、供氢/供气、冷却条件和单片异常。' });
  const expectedPowers = [33, 58.5, 117, 156, 175.5, 195];
  const missingPowers = expectedPowers.filter((power) => !normalized.some((point) => point.target_power_kw === power));
  if (missingPowers.length) issues.push({ severity: 'warn', code: 'DURABILITY_POWER_POINTS_MISSING', title: '耐久报告缺少目标功率点', evidence: `缺少：${missingPowers.join('、')} kW`, recommendation: '确认原始耐久工步是否完整，不要用相邻功率点替代。' });
  if (!Number.isFinite(maxDeviationMv) && !Number.isFinite(minAverageCellVoltageMv)) issues.push({ severity: 'info', code: 'DURABILITY_RULES_NOT_CONFIGURED', title: '耐久预警阈值未配置', evidence: '当前只保留企业原始测试结果和统计，不自动新增异常判定', recommendation: '由企业负责人填写离均差/平均单体电压预警规则后重新分析。' });
  const pointSummaries = normalized.map((point, index) => ({ targetPowerKw: point.target_power_kw, pointIndex: index + 1, humidityPct: point.humidity_pct, temperatureC: point.temperature_c, netPowerKw: point.net_power_kw, stackCurrentA: point.current_a, averageCellVoltageMv: point.average_cell_voltage_mv, averageDeviationMv: point.average_deviation_mv, compressorPowerKw: point.compressor_power_kw, pumpPowerKw: point.pump_power_kw, coolantInTempC: point.coolant_in_temp_c, coolantOutTempC: point.coolant_out_temp_c, hfr: point.hfr, lfr: point.lfr, voltageVariance: point.voltage_variance, sourceFile: point.source_file }));
  const verdict = issues.some((item) => item.severity === 'critical') ? 'FAIL' : 'WARN';
  const mapping = { target_power_kw: '目标功率（kW）', humidity_pct: '湿度', temperature_c: '温度', net_power_kw: '净输出功率', current_a: '电堆电流', average_cell_voltage_mv: '平均单体电压', average_deviation_mv: '离均差', voltage_variance: '电压方差', coolant_in_temp_c: '冷却水入口温度', coolant_out_temp_c: '冷却水出口温度', hfr: 'HFR', lfr: 'LFR' };
  const dataset = {
    kind: 'durability',
    label: '台架耐久数据',
    sourceContract: 'T02-02 · 台架耐久数据统计及预警',
    reports,
    crossReportSummary,
    points: pointSummaries,
    targetPowers: [...new Set(normalized.map((point) => point.target_power_kw).filter((value) => value !== null))].sort((a, b) => a - b),
    rules: { maxDeviationMv: Number.isFinite(maxDeviationMv) ? maxDeviationMv : null, minAverageCellVoltageMv: Number.isFinite(minAverageCellVoltageMv) ? minAverageCellVoltageMv : null },
    sourceFieldMap: mapping
  };
  const meanMetric = (field) => mean(normalized.map((point) => point[field]).filter((value) => value !== null));
  const metrics = { sampleCount: normalized.length, durationS: 0, completenessPct: quality.completenessPct, peakPowerW: Math.max(...normalized.map((point) => point.net_power_kw).filter((value) => value !== null), 0) * 1000, steadyVoltageMeanV: meanMetric('average_cell_voltage_mv') === null ? null : meanMetric('average_cell_voltage_mv') / 1000, steadyVoltageStdV: std(normalized.map((point) => point.average_cell_voltage_mv).filter((value) => value !== null)) / 1000, peakTemperatureC: Math.max(...normalized.map((point) => point.temperature_c).filter((value) => value !== null), 0) || null, peakPressureBar: null, peakLeakPpm: null, hydrogenVolumeNl: null, energyConsumedWh: null, specificEnergyKWhPerNm3: null, minimumHydrogenPurityPct: null, pressureDriftBarPerMin: 0, steadyWindow: '台架耐久功率点', steadySampleCount: normalized.length };
  const schema = commonSchema({ ...mapping, ...efficiencyFields }, Object.keys(mapping).length + Object.keys(efficiencyFields).length);
  const uncertainty = calculateEnterpriseUncertainty(normalized, metrics, config.uncertaintyModel, {
    metricSpecs: [
      { metric: 'peakPowerW', value: metrics.peakPowerW, unit: 'W', power: true, requiredField: 'power_w' },
      { metric: 'steadyVoltageMeanV', value: metrics.steadyVoltageMeanV, unit: 'V', field: 'average_cell_voltage_mv', scale: 0.001, requiredField: 'average_cell_voltage_mv' },
      { metric: 'steadyVoltageStdV', value: metrics.steadyVoltageStdV, unit: 'V', field: 'average_cell_voltage_mv', scale: 0.001, requiredField: 'average_cell_voltage_mv' }
    ]
  });
  const complianceResult = compliance(config, dataset.label, metrics, quality, normalized, schema);
  complianceResult.uncertainty = uncertainty;
  issues.push(...profileGateIssues(complianceResult));
  const finalVerdict = issues.some((item) => item.severity === 'critical') ? 'FAIL' : verdict;
  const workflowResult = workflow(dataset, quality, issues, Object.keys(rules).length > 0, complianceResult);
  return { dataset, datasetType: 'durability', generatedAt: new Date().toISOString(), config: { ...config, datasetType: 'durability' }, rows: normalized, metrics, quality, schema, compliance: complianceResult, uncertainty, workflow: workflowResult, phases: dataset.targetPowers.map((power) => ({ phase: `目标功率${power}kW`, count: normalized.filter((point) => point.target_power_kw === power).length, startS: null, endS: null, durationS: 0 })), issues, verdict: finalVerdict, narrative: finalVerdict === 'FAIL' ? '原始耐久报告或当前规则触发高优先级问题，已阻断放行判断。' : '已完成耐久功率点统计；当前结果仍需企业预警规则和工程师复核。', source: { type: 'docx', rowCount: normalized.length, requiredFields: required } };
}

function buildVehicle(rows, config) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const efficiencyFields = efficiencyMapping(headers);
  const mapping = Object.fromEntries(VEHICLE_FIELDS.map(([field, source]) => [field, headers.includes(source) ? source : null]));
  const dynamicConfig = config.vehicleDynamicAnalysis && typeof config.vehicleDynamicAnalysis === 'object' ? config.vehicleDynamicAnalysis : {};
  const vehicleSignalUnits = config.vehicleSignalUnits && typeof config.vehicleSignalUnits === 'object' ? config.vehicleSignalUnits : {};
  const vehicleUnitEvidenceRequired = config.vehicleUnitEvidenceRequired === true;
  const unresolvedUnitFields = new Set();
  const invalidSentinelCounts = {};
  const normalizeVehicleCellVoltage = (value, field) => {
    const raw = num(value);
    if (raw === null) return null;
    const declared = vehicleSignalUnits[field];
    const unit = typeof declared === 'string' ? declared : declared?.sourceUnit;
    if (unit === 'mV') return raw / 1000;
    if (unit === 'V') return raw;
    if (vehicleUnitEvidenceRequired && ['min_cell_voltage_v', 'avg_cell_voltage_v', 'cell_voltage_variance'].includes(field)) {
      unresolvedUnitFields.add(field);
      return null;
    }
    if (field === 'cell_voltage_variance' && raw === 65535) {
      invalidSentinelCounts[field] = (invalidSentinelCounts[field] || 0) + 1;
      return null;
    }
    if (['min_cell_voltage_v', 'avg_cell_voltage_v'].includes(field) && (raw < -2.5 || raw > 2.5)) {
      unresolvedUnitFields.add(field);
      return null;
    }
    return raw;
  };
  const dynamicCommandSource = String(dynamicConfig.commandSource || 'FC_SysLoadCurr');
  const missing = Object.entries(mapping).filter(([, source]) => !source).map(([field]) => field);
  if (missing.length >= 5) return null;
  const selectedSignal = headers.includes(config.vehicleSignal) ? config.vehicleSignal : 'FC_CurrOut';
  const defaultSecondarySignal = headers.includes('FC_NetPwrOut') && selectedSignal !== 'FC_NetPwrOut'
    ? 'FC_NetPwrOut'
    : headers.find((source) => source !== selectedSignal && rows.some((row) => num(row[source]) !== null)) || '';
  const requestedSecondarySignal = config.vehicleSignalSecondary === undefined ? null : String(config.vehicleSignalSecondary || '').trim();
  const secondarySignal = requestedSecondarySignal === null
    ? defaultSecondarySignal
    : requestedSecondarySignal && headers.includes(requestedSecondarySignal) && requestedSecondarySignal !== selectedSignal
      ? requestedSecondarySignal
      : '';
  const requestedStartS = config.vehicleStartS === null || config.vehicleStartS === undefined || config.vehicleStartS === '' ? NaN : Number(config.vehicleStartS);
  const requestedEndS = config.vehicleEndS === null || config.vehicleEndS === undefined || config.vehicleEndS === '' ? NaN : Number(config.vehicleEndS);
  const sessionTime = sessionizedTimes(rows, mapping.timestamp_s);
  const vehicleTimeOf = (row) => row?.session_timestamp_s ?? row?.timestamp_s;
  const normalized = rows.map((row, index) => ({
    timestamp_s: sessionTime.globalTimes[index],
    session_timestamp_s: sessionTime.localTimes[index],
    session_id: sessionTime.sessionIds[index],
    source_file: row.source_file || null,
    source_row_index: Number.isInteger(row.source_row_index) ? row.source_row_index : index,
    timestamp_raw: row[mapping.timestamp_s] ?? null,
    timestamp_epoch_s: parseTimestamp(row[mapping.timestamp_s]),
    phase: row[mapping.main_status] === undefined ? '车辆时序' : `状态${String(row[mapping.main_status] ?? '').trim() || '未知'}`,
    main_status: num(row[mapping.main_status]),
    current_a: num(row[mapping.current_a]),
    voltage_v: num(row[mapping.voltage_v]),
    net_power_kw: num(row[mapping.net_power_kw]),
    min_cell_voltage_raw: num(row[mapping.min_cell_voltage_v]),
    min_cell_voltage_v: normalizeVehicleCellVoltage(row[mapping.min_cell_voltage_v], 'min_cell_voltage_v'),
    min_cell_channel: num(row[mapping.min_cell_channel]),
    avg_cell_voltage_raw: num(row[mapping.avg_cell_voltage_v]),
    avg_cell_voltage_v: normalizeVehicleCellVoltage(row[mapping.avg_cell_voltage_v], 'avg_cell_voltage_v'),
    avg_cell_dev_mv: num(row[mapping.avg_cell_dev_mv]),
    cell_voltage_variance_raw: num(row[mapping.cell_voltage_variance]),
    cell_voltage_variance: normalizeVehicleCellVoltage(row[mapping.cell_voltage_variance], 'cell_voltage_variance'),
    isolation_kohm: num(row[mapping.isolation_kohm]),
    runtime_h: num(row[mapping.runtime_h]),
    command_current_a: headers.includes(dynamicCommandSource) ? num(row[dynamicCommandSource]) : null,
    actual_power_w: num(row[mapping.net_power_kw]) === null ? null : num(row[mapping.net_power_kw]) * 1000,
    selected_signal_value: num(row[selectedSignal]),
    secondary_signal_value: secondarySignal ? num(row[secondarySignal]) : null,
    efficiency_pct: num(row[efficiencyFields.efficiency_pct])
  }));
  const required = Object.keys(mapping).filter((field) => !['main_status', 'min_cell_channel', 'runtime_h'].includes(field));
  const quality = qualityFor(normalized, required);
  quality.missingHeaders = missing;
  quality.usable = quality.usable && missing.length === 0;
  quality.sessionCount = sessionTime.sessions.length;
  quality.sessionBoundaryCount = Math.max(0, sessionTime.sessions.length - 1);
  quality.sessionDurationsS = sessionTime.sessions.map((session) => ({ sessionId: session.sessionId, sourceFile: session.sourceFile, durationS: session.durationS, rowCount: session.rowCount }));
  const windowStartS = Number.isFinite(requestedStartS) ? Math.max(0, requestedStartS) : 0;
  const observedEndS = Math.max(...normalized.map(vehicleTimeOf).filter((value) => value !== null), 0);
  const windowEndS = Number.isFinite(requestedEndS) ? Math.min(observedEndS, Math.max(windowStartS, requestedEndS)) : observedEndS;
  const analysisRows = normalized.filter((row) => vehicleTimeOf(row) !== null && vehicleTimeOf(row) >= windowStartS && vehicleTimeOf(row) <= windowEndS);
  const requestedWindow = Number.isFinite(requestedStartS) || Number.isFinite(requestedEndS);
  const rowsForAnalysis = requestedWindow ? analysisRows : normalized;
  const stateCounts = Object.fromEntries([...new Set(rowsForAnalysis.map((row) => row.main_status).filter((value) => value !== null))].sort((a, b) => a - b).map((state) => [String(state), rowsForAnalysis.filter((row) => row.main_status === state).length]));
  const isolationStatusRows = rowsForAnalysis.filter((row) => [4, 8].includes(row.main_status));
  const isolationRows = isolationStatusRows.filter((row) => row.isolation_kohm !== null && row.isolation_kohm > 0 && row.isolation_kohm < 9999 && row.isolation_kohm !== 65535);
  const isolationExcludedByStatus = rowsForAnalysis.length - isolationStatusRows.length;
  const isolationCensoredAboveRange = isolationStatusRows.filter((row) => row.isolation_kohm !== null && (row.isolation_kohm >= 9999 || row.isolation_kohm === 65535)).length;
  const isolationExcludedMissing = isolationStatusRows.filter((row) => row.isolation_kohm === null).length;
  const isolationExcludedNonPositive = isolationStatusRows.filter((row) => row.isolation_kohm !== null && row.isolation_kohm <= 0).length;
  const buckets = new Map();
  for (const row of isolationRows) {
    const bucket = Math.floor((row.session_timestamp_s ?? row.timestamp_s) / 600);
    const key = `${row.session_id}:${bucket}:${row.main_status}`;
    const timeS = vehicleTimeOf(row);
    const current = buckets.get(key) || { bucket, sessionId: row.session_id, status: row.main_status, values: [], startS: timeS, endS: timeS };
    current.values.push(row.isolation_kohm); current.startS = Math.min(current.startS, timeS); current.endS = Math.max(current.endS, timeS); buckets.set(key, current);
  }
  const insulationPoints = [...buckets.values()].map((item) => ({ bucket: item.bucket, sessionId: item.sessionId, status: item.status, startS: item.startS, endS: item.endS, minimumKohm: Math.min(...item.values), sampleCount: item.values.length })).sort((a, b) => a.startS - b.startS);
  const insulationForecast = Object.fromEntries([350, 250].map((threshold) => {
    const points = insulationPoints.map((point) => [point.endS, point.minimumKohm]);
    const crossSessionBoundary = sessionTime.sessions.length > 1 ? '多会话未声明批次关系，不跨会话拟合绝缘趋势或触达预测' : null;
    return [String(threshold), { threshold, trend: crossSessionBoundary ? { slopePerDay: null, intercept: null } : linearTrend(points), forecast: crossSessionBoundary ? null : forecastToThreshold(points, threshold), boundary: crossSessionBoundary }];
  }));
  const targetCurrents = (config.vehicleTargets || []).map(Number).filter(Number.isFinite);
  const activeStatuses = (Array.isArray(config.vehicleActiveStatuses) && config.vehicleActiveStatuses.length ? config.vehicleActiveStatuses : [4]).map(Number).filter(Number.isFinite);
  const hasVehicleStatus = rowsForAnalysis.some((row) => Number.isFinite(row.main_status));
  const excludedPerformanceStatusCount = hasVehicleStatus ? rowsForAnalysis.filter((row) => !activeStatuses.includes(row.main_status)).length : 0;
  const rawPerformancePoints = vehicleSegments(rowsForAnalysis, targetCurrents, Number(config.vehicleCurrentToleranceA ?? 5), Number(config.vehicleMinimumDurationS ?? 180), activeStatuses);
  const inferredAnalysis = targetCurrents.length ? { segments: [], gapLimitS: null, minimumDurationS: null, binWidthA: null } : inferVehicleSegments(rowsForAnalysis, config);
  const rawInferredSegments = inferredAnalysis.segments;
  const requestedTrendAxis = config.vehicleTrendXAxis === 'timestamp' ? 'timestamp' : 'runtime_h';
  const selectedTrendAxis = chooseVehicleTrendAxis(rawPerformancePoints, requestedTrendAxis);
  const trendModel = config.vehicleTrendModel === 'quadratic' ? 'quadratic' : 'linear';
  const performancePoints = attachVehicleTrendAxis(rawPerformancePoints, selectedTrendAxis);
  const inferredSegments = attachVehicleTrendAxis(rawInferredSegments, selectedTrendAxis);
  const vehicleTrend = (points, field) => sessionTime.sessions.length > 1 && config.allowCrossSessionTrend !== true
    ? { x: selectedTrendAxis.axis, xLabel: selectedTrendAxis.label, model: trendModel, pointCount: points.filter((point) => Number.isFinite(point[field])).length, status: 'not_comparable', slopePerDay: null, rSquared: null, boundary: '多会话未提供企业批次声明；不跨会话拟合趋势' }
    : vehicleTrendMetric(points, field, selectedTrendAxis, trendModel);
  const performanceTrend = { averageCellVoltageV: vehicleTrend(performancePoints, 'averageCellVoltageV'), averageCellDeviationMv: vehicleTrend(performancePoints, 'averageCellDeviationMv'), averageCellVariance: vehicleTrend(performancePoints, 'averageCellVariance'), averageNetPowerKw: vehicleTrend(performancePoints, 'averageNetPowerKw') };
  const descriptiveTrend = Object.fromEntries(['averageCellVoltageV', 'averageCellDeviationMv', 'averageCellVariance', 'averageNetPowerKw'].map((field) => [field, vehicleTrend(inferredSegments, field)]));
  const vehicleRoleBySource = Object.fromEntries([
    ...VEHICLE_FIELDS.map(([, source]) => [source, 'analysis_input']),
    ...VEHICLE_CONTEXT_FIELDS.map((source) => [source, 'context_or_cross_check'])
  ]);
  if (dynamicConfig.enabled === true && headers.includes(dynamicCommandSource)) vehicleRoleBySource[dynamicCommandSource] = 'analysis_input';
  const signalCatalog = annotateSignalCatalog(rows, headers, mapping, vehicleRoleBySource);
  const signalDiagnostics = signalDiagnosticsSummary(signalCatalog);
  const contextSignals = signalCatalog.filter((item) => item.usage === 'context_or_cross_check');
  const vehicleCrossChecks = pairEvidence(rows, [
    { code: 'MAX_CURRENT_ALLOW', target: 'FC_MaxCurrAllow', actual: 'FC_CurrOut', unit: 'A' },
    { code: 'MAX_POWER_ALLOW', target: 'FC_MaxPwrAllow', actual: 'FC_NetPwrOut', unit: 'kW' },
    { code: 'TOTAL_VOLTAGE_CROSS_CHECK', target: 'TotalVoltage', actual: 'FC_VoltOut', unit: 'V' },
    { code: 'MIN_MAX_CELL_RANGE', target: 'FC_MinCellVoltage', actual: 'FC_MaxCellVoltage', unit: 'V' }
  ].filter(({ target, actual }) => headers.includes(target) && headers.includes(actual)));
  const dynamicAnalysis = analyzeSetpointEvents(normalized, {
    ...dynamicConfig,
    enabled: dynamicConfig.enabled === true,
    commandField: 'command_current_a',
    actualField: 'current_a',
    actualPowerField: 'actual_power_w',
    unit: 'A',
    powerUnit: 'W'
  });
  const issues = [];
  if (missing.length) issues.push({ severity: 'critical', code: 'VEHICLE_SCHEMA_MISSING', title: '车辆燃电信号不完整', evidence: `缺少：${missing.join('、')}`, recommendation: '补充企业定义的车辆信号后再进行趋势和预警判定。' });
  if (quality.duplicateTimestampCount || quality.nonMonotonicCount) issues.push({ severity: 'warn', code: 'VEHICLE_TIME_SEQUENCE', title: '车辆时间轴需要复核', evidence: `重复时间戳 ${quality.duplicateTimestampCount} 条，逆序 ${quality.nonMonotonicCount} 次`, recommendation: '确认多文件拼接、采样时钟和时区口径。' });
  if (requestedWindow && !analysisRows.length) issues.push({ severity: 'warn', code: 'VEHICLE_WINDOW_EMPTY', title: '时间窗口没有记录', evidence: `请求窗口 ${windowStartS}–${windowEndS} s 未找到记录；本次不回退到全量数据，也不生成该窗口 KPI`, recommendation: '调整起止时间，或先确认时间戳转换和多文件拼接顺序。' });
  if (unresolvedUnitFields.size) issues.push({ severity: 'warn', code: 'VEHICLE_UNIT_UNRESOLVED', title: '车辆单体电压单位未确认', evidence: `${[...unresolvedUnitFields].join('、')} 的原始值超出 V 口径可直接解释的范围，已不进入单体电压均值/趋势；原始值保留在 raw 字段`, recommendation: '在企业 profile 中提供 vehicleSignalUnits.sourceUnit（V 或 mV）及证据后重新分析；不按数量级自动换算。' });
  if (excludedPerformanceStatusCount) issues.push({ severity: 'info', code: 'VEHICLE_PERFORMANCE_STATUS_EXCLUDED', title: '车辆非活动状态未进入正式性能点', evidence: `${excludedPerformanceStatusCount} 条状态 ${[...new Set(rowsForAnalysis.filter((row) => !activeStatuses.includes(row.main_status)).map((row) => row.main_status))].join('、')} 记录被排除；正式目标电流性能点只使用活动状态 ${activeStatuses.join('、')}`, recommendation: '确认企业 FC_MainSts 状态字典；状态 8 等非活动记录可保留作状态/绝缘描述性统计，不进入正式性能点。' });
  if (Object.keys(invalidSentinelCounts).length) issues.push({ severity: 'info', code: 'VEHICLE_INVALID_SENTINEL_FILTERED', title: '车辆字段包含已识别无效哨兵值', evidence: Object.entries(invalidSentinelCounts).map(([field, count]) => `${field}=${count}`).join('；'), recommendation: '确认企业无效码表和状态定义；当前只排除明确的 65535 方差哨兵，不外推其他字段规则。' });
  const invalidIsolation = isolationExcludedMissing + isolationExcludedNonPositive + isolationCensoredAboveRange;
  if (invalidIsolation || isolationExcludedByStatus) issues.push({ severity: 'info', code: 'ISOLATION_FILTERED', title: '绝缘阻值按状态/值类型分层过滤', evidence: `状态外 ${isolationExcludedByStatus} 条；状态4/8内缺失 ${isolationExcludedMissing} 条；非正值 ${isolationExcludedNonPositive} 条；量程上限/哨兵 ${isolationCensoredAboveRange} 条；有效进入10分钟最小值 ${isolationRows.length} 条`, recommendation: '正式报告中保留各类计数，并由企业 profile 确认 9999/10000/65535 的量程或无效码含义。' });
  if (signalDiagnostics.reviewSignalCount) issues.push({ severity: 'warn', code: 'SIGNAL_VALUE_SEMANTICS_REVIEW', title: '原始信号值分布需要语义复核', evidence: `${signalDiagnostics.reviewSignalCount} 个核心/交叉核对字段存在负值、零值集中、常量值或数值解析混合；示例：${signalDiagnostics.reviewSignals.slice(0, 4).map((item) => `${item.source}（${item.reasons.join('、')}）`).join('；')}`, recommendation: '先确认字段单位、设备状态和企业无效码表；系统不自动删除负值/零值，也不把该提示直接转为不合格。' });
  if (dynamicAnalysis.enabled && dynamicAnalysis.status === 'not_available') issues.push({ severity: 'info', code: 'VEHICLE_DYNAMIC_FIELDS_MISSING', title: '车辆动态事件分析未执行', evidence: dynamicAnalysis.evidence, recommendation: `补充 ${dynamicCommandSource} 设定信号或在企业 profile 中关闭该可选分析。` });
  if (dynamicAnalysis.enabled && dynamicAnalysis.dataGapCount > 0) issues.push({ severity: 'warn', code: 'VEHICLE_DYNAMIC_DATA_GAP', title: '车辆动态事件存在采样缺口', evidence: `识别 ${dynamicAnalysis.dataGapCount} 个超过配置上限的间隔；最大观测间隔 ${dynamicAnalysis.maximumIntervalS ?? '—'} s`, recommendation: '复核采集计划、时钟同步和文件边界；不以插值替代原始记录。' });
  if (!targetCurrents.length) issues.push({ severity: 'warn', code: 'VEHICLE_TARGETS_MISSING', title: '未提供性能统计目标电流', evidence: `已发现 ${inferredSegments.length} 个连续电流候选区间，但这些区间仅按实际数据推断，未生成正式目标电流性能点`, recommendation: '导入企业批准的目标电流、允许波动范围和最短持续时间后重新分析；当前候选只用于描述性复核。' });
  if (sessionTime.sessions.length > 1) issues.push({ severity: 'info', code: 'VEHICLE_SESSIONS_PRESERVED', title: '多文件会话边界已保留', evidence: `识别 ${sessionTime.sessions.length} 个独立会话；目标电流段、绝缘窗口不会跨文件拼接`, recommendation: '报告中按来源文件核对每个会话的起止时间和采样连续性。' });
  if (!issues.length) issues.push({ severity: 'info', code: 'VEHICLE_DATA_READY', title: '车辆燃电数据已完成结构化分析', evidence: `${normalized.length} 条记录已完成时间轴、运行状态、性能信号和绝缘阻值处理`, recommendation: '进入企业规则确认和工程师签核。' });
  const verdict = issues.some((item) => item.severity === 'critical') ? 'FAIL' : 'WARN';
  const metrics = {
    sampleCount: rowsForAnalysis.length,
    durationS: !rowsForAnalysis.length || sessionTime.sessions.length > 1 ? null : windowEndS - windowStartS,
    completenessPct: quality.completenessPct,
    peakPowerW: rowsForAnalysis.length ? Math.max(...rowsForAnalysis.map((row) => row.net_power_kw).filter((value) => value !== null), 0) * 1000 : null,
    steadyVoltageMeanV: mean(rowsForAnalysis.map((row) => row.avg_cell_voltage_v).filter((value) => value !== null)),
    steadyVoltageStdV: std(rowsForAnalysis.map((row) => row.avg_cell_voltage_v).filter((value) => value !== null)),
    peakTemperatureC: null,
    peakPressureBar: null,
    peakLeakPpm: null,
    hydrogenVolumeNl: null,
    energyConsumedWh: null,
    specificEnergyKWhPerNm3: null,
    minimumHydrogenPurityPct: null,
    pressureDriftBarPerMin: 0,
    steadyWindow: '企业车辆运行信号',
    steadySampleCount: rowsForAnalysis.length
  };
  const dataset = {
    kind: 'vehicle',
    label: '企业车辆燃电数据',
    sourceContract: 'T02-02 · 车辆运行数据统计需求',
    stateCounts,
    targetCurrents,
    targetToleranceA: Number(config.vehicleCurrentToleranceA ?? 5),
    minimumDurationS: Number(config.vehicleMinimumDurationS ?? 180),
    selectedSignal,
    secondarySignal,
    signalAxes: { left: selectedSignal, right: secondarySignal || null },
    analysisWindow: { startS: windowStartS, endS: windowEndS, rowCount: rowsForAnalysis.length, totalRowCount: normalized.length },
    sessions: sessionTime.sessions,
    sessionCount: sessionTime.sessions.length,
    signalCatalog,
    signalDiagnostics,
    unitDiagnostics: { required: vehicleUnitEvidenceRequired, unresolvedFields: [...unresolvedUnitFields], invalidSentinelCounts, sourceUnits: vehicleSignalUnits, boundary: '未提供企业单位证据时，不按数量级自动换算；超出可解释范围或 profile 要求单位却未声明时，单体电压不进入 V KPI，原始值保留。' },
    coverage: coverageSummary(signalCatalog),
    contextSignals,
    crossChecks: vehicleCrossChecks,
    dynamicAnalysis,
    performancePoints,
    performanceTrend,
    inferredSegments,
    trendXAxis: selectedTrendAxis.axis,
    trendXAxisRequested: selectedTrendAxis.requestedAxis,
    trendXAxisLabel: selectedTrendAxis.label,
    trendModel,
    trendSelection: selectedTrendAxis,
    descriptiveCandidateConfig: { minimumDurationS: inferredAnalysis.minimumDurationS, binWidthA: inferredAnalysis.binWidthA, gapLimitS: inferredAnalysis.gapLimitS, decisionScope: 'descriptive_only' },
    descriptiveTrend,
    insulation: { points: insulationPoints, forecast: insulationForecast, validCount: isolationRows.length, invalidCount: invalidIsolation, excludedByStatus: isolationExcludedByStatus, excludedByValue: isolationExcludedMissing + isolationExcludedNonPositive, excludedByWindow: 0, censoredAboveRange: isolationCensoredAboveRange, validForMinimum: isolationRows.length, boundary: '仅状态4/8且通过当前数值筛选的记录进入10分钟最小值统计；数值语义和量程上限仍需企业确认。' },
    signals: Object.fromEntries(VEHICLE_FIELDS.slice(1).map(([field]) => [field, { source: mapping[field], count: normalized.filter((row) => row[field] !== null).length }]))
  };
  const schema = commonSchema({ ...mapping, ...efficiencyFields }, VEHICLE_FIELDS.length + Object.keys(efficiencyFields).length);
  const uncertainty = calculateEnterpriseUncertainty(normalized, metrics, config.uncertaintyModel, {
    metricSpecs: [
      { metric: 'peakPowerW', value: metrics.peakPowerW, unit: 'W', power: true, requiredField: 'power_w' },
      { metric: 'steadyVoltageMeanV', value: metrics.steadyVoltageMeanV, unit: 'V', field: 'avg_cell_voltage_v', requiredField: 'avg_cell_voltage_v' }
    ]
  });
  const complianceResult = compliance(config, dataset.label, metrics, quality, normalized, schema);
  complianceResult.uncertainty = uncertainty;
  issues.push(...profileGateIssues(complianceResult));
  const finalVerdict = issues.some((item) => item.severity === 'critical') ? 'FAIL' : verdict;
  const workflowResult = workflow(dataset, quality, issues, targetCurrents.length > 0, complianceResult);
  const phases = Object.entries(stateCounts).map(([state, count]) => ({ phase: `状态${state}`, count, startS: null, endS: null, durationS: 0 }));
  return {
    dataset,
    datasetType: 'vehicle',
    generatedAt: new Date().toISOString(),
    config: { ...config, datasetType: 'vehicle' },
    rows: normalized,
    metrics,
    quality,
    schema,
    compliance: complianceResult,
    uncertainty,
    workflow: workflowResult,
    phases,
    issues,
    verdict: finalVerdict,
    narrative: finalVerdict === 'FAIL' ? '车辆数据关键字段不完整或 profile 门控未满足，已阻断后续判定。' : targetCurrents.length ? '已按企业车辆数据需求完成运行信号、目标电流段和绝缘阻值的结构化统计；报警阈值与正式结论仍需企业规则和工程师签核。' : `已完成车辆运行信号、绝缘阻值和 ${inferredSegments.length} 个连续电流候选区间的描述性统计；未提供目标电流参数，未进行目标符合性判定，也未生成正式性能结论。`,
    source: { type: 'csv', rowCount: normalized.length, requiredFields: Object.keys(mapping), availableSignalCount: signalCatalog.length }
  };
}

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

const DEFAULT_STOICH_CONFIG = Object.freeze({
  faradayConstantCPerMol: 96485.33212,
  standardMolarVolumeLPerMol: 22.414,
  oxygenVolumeFraction: 0.2095
});

function durationForSegment(start, end, sampleCount, samplePeriodS) {
  const startS = start?.session_timestamp_s ?? start?.timestamp_s;
  const endS = end?.session_timestamp_s ?? end?.timestamp_s;
  if (Number.isFinite(startS) && Number.isFinite(endS) && endS >= startS) return { durationS: Math.max(0, endS - startS), source: 'timestamp' };
  if (Number.isFinite(samplePeriodS) && samplePeriodS > 0 && sampleCount >= 2) return { durationS: (sampleCount - 1) * samplePeriodS, source: 'configured_sample_period_fallback' };
  return { durationS: 0, source: 'timestamp_missing_or_invalid' };
}

function targetForRule(rule, condition) {
  if (rule.target !== null && rule.target !== undefined) return rule.target;
  const key = CONDITION_FIELD_BY_CODE[rule.code];
  return key ? condition[key] : null;
}

function ruleValue(row, rule) {
  const value = row[rule.field];
  return value === undefined ? null : value;
}

function conditionComparison(rule, condition, rows, samplePeriodS) {
  const target = targetForRule(rule, condition);
  const observed = rows.map((row) => row[rule.field]).filter((value) => Number.isFinite(value));
  const base = {
    code: rule.code,
    name: rule.name || rule.code,
    field: rule.field,
    unit: rule.unit || '',
    target,
    lowerTolerance: rule.lowerTolerance ?? null,
    upperTolerance: rule.upperTolerance ?? null,
    validSampleCount: observed.length,
    exceedSampleCount: 0,
    observedDurationS: 0,
    exceedDurationS: 0,
    exceedRatioPct: null,
    actualMean: mean(observed),
    actualMin: observed.length ? Math.min(...observed) : null,
    actualMax: observed.length ? Math.max(...observed) : null,
    actualStd: std(observed),
    absoluteDeviation: null,
    relativeDeviationPct: null,
    status: 'undetermined'
  };
  if (!Number.isFinite(target) || !observed.length) return base;
  const lower = target + (Number.isFinite(rule.lowerTolerance) ? rule.lowerTolerance : 0);
  const upper = target + (Number.isFinite(rule.upperTolerance) ? rule.upperTolerance : 0);
  let observedDurationS = 0;
  let exceedDurationS = 0;
  let exceedSampleCount = 0;
  rows.forEach((row, index) => {
    const value = row[rule.field];
    if (!Number.isFinite(value)) return;
    const next = rows[index + 1];
    const timestampDelta = next && Number.isFinite(row.timestamp_s) && Number.isFinite(next.timestamp_s) && next.timestamp_s > row.timestamp_s
      ? next.timestamp_s - row.timestamp_s
      : next && Number.isFinite(samplePeriodS) && samplePeriodS > 0 ? samplePeriodS : 0;
    observedDurationS += timestampDelta;
    const exceeded = value < lower || value > upper;
    if (exceeded) { exceedSampleCount += 1; exceedDurationS += timestampDelta; }
  });
  const absoluteDeviation = base.actualMean - target;
  const relativeDeviationPct = target === 0 ? null : absoluteDeviation / Math.abs(target) * 100;
  return {
    ...base,
    lowerBound: lower,
    upperBound: upper,
    observedDurationS,
    exceedDurationS,
    exceedSampleCount,
    exceedRatioPct: observedDurationS > 0 ? exceedDurationS / observedDurationS * 100 : exceedSampleCount / observed.length * 100,
    absoluteDeviation,
    relativeDeviationPct,
    status: base.actualMean < lower || base.actualMean > upper ? 'abnormal' : exceedSampleCount ? 'warning' : 'normal'
  };
}

function evaluateStableRow(row, condition, rules) {
  const missing = []; const exceeded = [];
  for (const rule of rules.filter((item) => item.enabled)) {
    const value = ruleValue(row, rule);
    const target = targetForRule(rule, condition);
    if (value === null || target === null || target === undefined) { missing.push(rule.code); continue; }
    const lower = rule.lowerTolerance ?? 0;
    const upper = rule.upperTolerance ?? 0;
    if (value < target + lower || value > target + upper) exceeded.push({ code: rule.code, value, target, lower, upper });
  }
  return { ok: missing.length === 0 && exceeded.length === 0, parameterComplete: missing.length === 0, missing, exceeded };
}

function stackPlatforms(rows, parameterConfig, fallbackConfig = {}) {
  const conditions = parameterConfig?.targetConditions || [];
  const rules = parameterConfig?.parameterRules || [];
  const parameters = parameterConfig?.parameters || [];
  const selectionOverrides = fallbackConfig.stackSelectionOverrides && typeof fallbackConfig.stackSelectionOverrides === 'object'
    ? fallbackConfig.stackSelectionOverrides
    : {};
  if (!conditions.length) return { platforms: [], stableSegments: [], performancePoints: [], selectionAudit: [], selectionPolicy: 'last_eligible_stable_segment_unless_manual_override' };
  const parameterNumber = (code, fallback) => {
    const item = parameters.find((candidate) => candidate.code === code);
    const value = item?.target ?? num(item?.rawValue);
    return value === null || value === undefined ? fallback : value;
  };
  const parameterText = (code, fallback) => parameters.find((candidate) => candidate.code === code)?.rawValue || fallback;
  const currentRule = rules.find((rule) => rule.code === 'CURRENT');
  const fallbackTolerance = Number(fallbackConfig.currentToleranceA ?? 1);
  const samplePeriodS = Number(fallbackConfig.samplePeriodS);
  const minPlatformS = parameterNumber('MIN_CURRENT_PLATFORM_TIME', Number(fallbackConfig.minimumPlatformS ?? 60));
  const minStableS = parameterNumber('MIN_STABLE_TIME', Number(fallbackConfig.minimumStableS ?? 60));
  const formalSampleS = parameterNumber('DEFAULT_SAMPLE_TIME', Number(fallbackConfig.sampleDurationS ?? 120));
  const samplePosition = parameterText('SAMPLE_POSITION', '稳定区间末端');
  const currentTolerance = currentRule ? Math.max(Math.abs(currentRule.lowerTolerance ?? fallbackTolerance), Math.abs(currentRule.upperTolerance ?? fallbackTolerance)) : fallbackTolerance;
  const gapLimitS = descriptiveGapLimitS(rows);
  const timeOf = (row) => row?.session_timestamp_s ?? row?.timestamp_s;
  const chooseCondition = (row) => {
    const candidates = conditions.map((condition) => ({ condition, distance: row.current_a === null ? Infinity : Math.abs(row.current_a - condition.targetCurrentA) }))
      .filter((item) => item.distance <= currentTolerance).sort((a, b) => a.distance - b.distance);
    if (candidates.length <= 1) return candidates[0] || null;
    const fullyMatched = candidates.filter(({ condition }) => {
      const evaluation = evaluateStableRow(row, condition, rules);
      return evaluation.parameterComplete && evaluation.exceeded.length === 0;
    });
    return (fullyMatched.length === 1 ? fullyMatched[0] : candidates[0]) || null;
  };
  const platforms = []; let active = null; let platformSequence = 0;
  const closePlatform = (endIndex) => {
    if (!active) return;
    const end = rows[endIndex - 1] || rows.at(-1); const sampleRows = rows.slice(active.startIndex, endIndex); const duration = durationForSegment(active.start, end, sampleRows.length, samplePeriodS);
    const condition = active.condition; const values = (field) => sampleRows.map((row) => row[field]).filter((value) => value !== null);
    platformSequence += 1;
    platforms.push({
      ...condition,
      sessionId: active.sessionId,
      sourceFile: active.start.source_file || null,
      platformId: `${condition.conditionId}-${platformSequence}`,
      platformIndex: platformSequence,
      conditionId: condition.conditionId,
      targetCurrentA: condition.targetCurrentA,
      targetCurrentDensity: condition.targetCurrentDensity,
      toleranceA: currentTolerance,
      startS: timeOf(active.start),
      endS: timeOf(end),
      durationS: Number.isFinite(timeOf(end)) && Number.isFinite(timeOf(active.start)) ? Math.max(0, timeOf(end) - timeOf(active.start)) : 0,
      effectiveDurationS: duration.durationS,
      durationSource: duration.source,
      sampleCount: sampleRows.length,
      averageCurrentA: mean(values('current_a')),
      averageCurrentDensity: mean(values('current_density_mAcm2')),
      averageCellVoltageV: mean(values('avg_cell_voltage_v')),
      averageNetPowerKw: mean(values('power_kw')),
      status: duration.durationS >= minPlatformS ? 'candidate' : 'too_short',
      rows: sampleRows
    });
    active = null;
  };
  rows.forEach((row, index) => {
    if (active && row.session_id !== active.sessionId) closePlatform(index);
    const previous = rows[index - 1];
    const previousTime = previous?.session_timestamp_s ?? previous?.timestamp_s;
    const currentTime = row?.session_timestamp_s ?? row?.timestamp_s;
    if (active && previous && previous.session_id === row.session_id && Number.isFinite(previousTime) && Number.isFinite(currentTime) && currentTime - previousTime > gapLimitS) closePlatform(index);
    const match = chooseCondition(row);
    if (!match) { closePlatform(index); return; }
    if (!active || active.condition.conditionId !== match.condition.conditionId) { closePlatform(index); active = { condition: match.condition, start: row, startIndex: index, sessionId: row.session_id }; }
  });
  closePlatform(rows.length);
  const stableSegments = [];
  const excludedIntervals = [];
  for (const platform of platforms) {
    let stable = null; let stableSequence = 0;
    const closeStable = (endIndex, closeReason = null) => {
      if (!stable) return;
      const end = platform.rows[endIndex - 1] || platform.rows.at(-1); const sampleRows = platform.rows.slice(stable.startIndex, endIndex); const duration = durationForSegment(stable.start, end, sampleRows.length, samplePeriodS);
      const baseStatus = duration.durationS < minStableS ? 'stable_too_short' : duration.durationS < formalSampleS ? 'short_stable' : 'stable_valid';
      stableSequence += 1;
      let selectedRows = sampleRows;
      if (baseStatus === 'stable_valid' && formalSampleS > 0) {
        if (Number.isFinite(samplePeriodS) && samplePeriodS > 0) selectedRows = sampleRows.slice(-Math.max(2, Math.floor(formalSampleS / samplePeriodS) + 1));
        else selectedRows = sampleRows.filter((row) => timeOf(row) >= (timeOf(end) ?? 0) - formalSampleS);
      }
      const values = (field, source = selectedRows) => source.map((row) => row[field]).filter((value) => value !== null);
      stableSegments.push({
        platformId: platform.platformId,
        segmentId: `${platform.platformId}:stable-${stableSequence}`,
        segmentIndex: stableSequence,
        platformIndex: platform.platformIndex,
        conditionId: platform.conditionId,
        startS: timeOf(stable.start),
        endS: timeOf(end),
        durationS: Number.isFinite(timeOf(end)) && Number.isFinite(timeOf(stable.start)) ? Math.max(0, timeOf(end) - timeOf(stable.start)) : 0,
        effectiveDurationS: duration.durationS,
        selectedDurationS: durationForSegment(selectedRows[0], selectedRows.at(-1), selectedRows.length, samplePeriodS).durationS,
        durationSource: duration.source,
        sampleCount: sampleRows.length,
        selectedSampleCount: selectedRows.length,
        parameterComplete: stable.parameterComplete,
        status: stable.parameterComplete ? baseStatus : 'parameter_incomplete',
        selectionPolicy: baseStatus === 'stable_valid' ? (samplePosition.includes('末') ? `末端${formalSampleS}s` : samplePosition) : '全部有效稳定样本',
        selected: false,
        selectedBy: null,
        automaticSelected: false,
        selectionReason: null,
        averageCurrentA: mean(values('current_a')),
        averageCurrentDensity: mean(values('current_density_mAcm2')),
        averageCellVoltageV: mean(values('avg_cell_voltage_v')),
        averageNetPowerKw: mean(values('power_kw')),
        parameterComparisons: rules.filter((rule) => rule.enabled).map((rule) => conditionComparison(rule, platform, selectedRows, samplePeriodS)),
        missingParameters: stable.missing,
        exclusionReason: closeReason?.code || null,
        exclusionEvidence: closeReason?.evidence || null,
        rows: sampleRows,
        selectedRows
      });
      if (closeReason || !stable.parameterComplete || !['stable_valid', 'short_stable'].includes(baseStatus)) excludedIntervals.push({
        platformId: platform.platformId,
        conditionId: platform.conditionId,
        sessionId: platform.sessionId,
        sourceFile: platform.sourceFile,
        startS: timeOf(stable.start),
        endS: timeOf(end),
        durationS: duration.durationS,
        sampleCount: sampleRows.length,
        reasonCode: closeReason?.code || (!stable.parameterComplete ? 'PARAMETER_INCOMPLETE' : baseStatus),
        reason: closeReason?.evidence || (!stable.parameterComplete ? `缺少参数：${stable.missing.join('、') || '未形成完整参数记录'}` : `有效持续时间 ${duration.durationS}s 未达到要求`)
      });
      stable = null;
    };
    platform.rows.forEach((row, index) => {
      const evaluated = evaluateStableRow(row, platform, rules);
      if (!evaluated.ok) {
        closeStable(index, {
          code: evaluated.missing.length ? 'MISSING_PARAMETER' : 'OUT_OF_TOLERANCE',
          evidence: evaluated.missing.length ? `缺少参数：${evaluated.missing.join('、')}` : `参数超出允许范围：${evaluated.exceeded.map((item) => `${item.code}=${item.value}，目标 ${item.target}`).join('；')}`
        });
        return;
      }
      if (!stable) stable = { start: row, startIndex: index, parameterComplete: evaluated.parameterComplete, missing: evaluated.missing };
    });
    closeStable(platform.rows.length);
  }
  const selectionAudit = [];
  for (const platform of platforms) {
    const candidates = stableSegments.filter((segment) => segment.platformId === platform.platformId);
    const eligible = candidates.filter((segment) => ['stable_valid', 'short_stable'].includes(segment.status));
    const automatic = eligible.at(-1) || null;
    const requestedSegmentId = typeof selectionOverrides[platform.platformId] === 'string' && selectionOverrides[platform.platformId].trim()
      ? selectionOverrides[platform.platformId].trim()
      : null;
    const manual = requestedSegmentId ? eligible.find((segment) => segment.segmentId === requestedSegmentId) || null : null;
    const selected = manual || automatic;
    const selectionError = requestedSegmentId && !manual
      ? `人工选择 ${requestedSegmentId} 不是该平台的可用稳定区间，已回退自动选择`
      : null;
    for (const segment of candidates) {
      segment.selected = Boolean(selected && segment.segmentId === selected.segmentId);
      segment.automaticSelected = Boolean(automatic && segment.segmentId === automatic.segmentId);
      segment.selectedBy = segment.selected ? (manual ? 'manual' : 'automatic') : null;
      segment.selectionReason = segment.selected
        ? manual ? `人工改选；自动候选为 ${automatic?.segmentId || '无'}` : '自动选择最后一个合格稳定区间'
        : null;
    }
    selectionAudit.push({
      platformId: platform.platformId,
      conditionId: platform.conditionId,
      sourceFile: platform.sourceFile,
      automaticSegmentId: automatic?.segmentId || null,
      requestedSegmentId,
      selectedSegmentId: selected?.segmentId || null,
      selectionMode: manual ? 'manual' : automatic ? 'automatic' : 'none',
      selectionError,
      availableSegmentIds: eligible.map((segment) => segment.segmentId)
    });
  }
  const performancePoints = stableSegments.filter((segment) => segment.selected).map((segment) => ({ ...segment, status: segment.status === 'short_stable' ? 'short_stable' : 'valid' }));
  return {
    platforms: platforms.map(({ rows: _rows, ...platform }) => platform),
    stableSegments: stableSegments.map(({ rows: _rows, selectedRows: _selectedRows, ...segment }) => segment),
    performancePoints: performancePoints.map(({ rows: _rows, selectedRows: _selectedRows, ...point }) => point),
    selectionAudit,
    excludedIntervals,
    selectionPolicy: 'last_eligible_stable_segment_unless_manual_override'
  };
}

function reportStartMs(report) {
  const value = String(report?.metadata?.开始时间 || '').trim();
  if (!value) return null;
  const parsed = Date.parse(value.replaceAll('/', '-').replace(' ', 'T'));
  return Number.isFinite(parsed) ? parsed : null;
}

function reportEndMs(report) {
  const value = String(report?.metadata?.结束时间 || '').trim();
  if (!value) return null;
  const parsed = Date.parse(value.replaceAll('/', '-').replace(' ', 'T'));
  return Number.isFinite(parsed) ? parsed : null;
}

function comparableMetadataValue(report, key) {
  const value = report?.metadata?.[key];
  const text = String(value ?? '').trim();
  return text || null;
}

function comparableTargetPowerSet(report) {
  return JSON.stringify([...new Set((report?.points || []).map((point) => Number(point.target_power_kw)).filter(Number.isFinite))].sort((a, b) => a - b));
}

function comparableHeaderSet(report) {
  return JSON.stringify([...new Set((report?.headers || []).map((header) => String(header ?? '').trim()).filter(Boolean))].sort());
}

function durabilityComparabilityAudit(ordered) {
  const values = [
    ['system_name', ordered.map(({ report }) => comparableMetadataValue(report, '系统名称'))],
    ['stack_model', ordered.map(({ report }) => comparableMetadataValue(report, '电堆型号'))],
    ['step_count', ordered.map(({ report }) => {
      const value = Number(comparableMetadataValue(report, '工步数量'));
      return Number.isFinite(value) ? value : null;
    })],
    ['point_count', ordered.map(({ report }) => report.points?.length || null)],
    ['target_power_set', ordered.map(({ report }) => comparableTargetPowerSet(report))],
    ['header_set', ordered.map(({ report }) => comparableHeaderSet(report))]
  ];
  const checks = values.map(([id, observedValues]) => {
    const observed = observedValues.filter((value) => value !== null);
    const distinct = [...new Set(observed.map((value) => JSON.stringify(value)))];
    const missingCount = observedValues.length - observed.length;
    return {
      id,
      status: missingCount ? 'incomplete' : distinct.length <= 1 ? 'consistent' : 'mismatch',
      reportCount: observedValues.length,
      observedCount: observed.length,
      missingCount,
      distinctCount: distinct.length
    };
  });
  let gapCount = 0;
  let overlapCount = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    const previousEnd = reportEndMs(ordered[index - 1].report);
    const currentStart = ordered[index].startMs;
    if (previousEnd === null || currentStart === null) continue;
    if (currentStart < previousEnd) overlapCount += 1;
    else if (currentStart > previousEnd) gapCount += 1;
  }
  const completeEndTimeEvidence = ordered.every(({ report }) => reportEndMs(report) !== null);
  const issueCodes = checks.filter((check) => check.status !== 'consistent').map((check) => `DURABILITY_COMPARABILITY_${check.id.toUpperCase()}_${check.status === 'mismatch' ? 'MISMATCH' : 'EVIDENCE_MISSING'}`);
  if (overlapCount) issueCodes.push('DURABILITY_REPORT_TIME_OVERLAP');
  return {
    status: 'descriptive_only',
    auditStatus: checks.some((check) => check.status === 'incomplete') ? 'not_evaluable' : 'screened',
    comparable: checks.every((check) => check.status === 'consistent') && overlapCount === 0,
    checks,
    completeEndTimeEvidence,
    gapCount,
    overlapCount,
    issueCodes,
    boundary: '仅作跨报告元数据、功率集合和时间关系筛查；不证明耐久方法、循环等效性、统计显著性或企业验收限值。'
  };
}

function numericDelta(first, last) {
  return Number.isFinite(first) && Number.isFinite(last) ? last - first : null;
}

function summarizeDurabilityReports(reports) {
  const sourceReports = Array.isArray(reports) ? reports.filter((report) => Array.isArray(report?.points) && report.points.length) : [];
  if (!sourceReports.length) return { status: 'not_available', reportCount: 0, orderingBasis: null, byTargetPower: [] };
  const candidates = sourceReports.map((report, inputIndex) => ({
    report,
    inputIndex,
    startMs: reportStartMs(report)
  }));
  const hasCompleteStartTimes = candidates.every((item) => item.startMs !== null);
  const ordered = [...candidates].sort((a, b) => hasCompleteStartTimes ? a.startMs - b.startMs : a.inputIndex - b.inputIndex);
  const byPower = new Map();
  ordered.forEach((item, reportIndex) => {
    const reportPoints = new Map();
    for (const point of item.report.points) {
      const power = Number(point.target_power_kw);
      if (!Number.isFinite(power)) continue;
      const points = reportPoints.get(power) || [];
      points.push(point);
      reportPoints.set(power, points);
    }
    for (const [power, points] of reportPoints) {
      const aggregate = (field) => {
        const values = points.map((point) => Number(point[field])).filter(Number.isFinite);
        return values.length ? mean(values) : null;
      };
      const series = byPower.get(power) || [];
      series.push({
        reportIndex,
        reportLabel: item.report.metadata?.测试方案 || `报告${reportIndex + 1}`,
        startTime: item.report.metadata?.开始时间 || null,
        result: item.report.metadata?.测试结果 || null,
        averageCellVoltageMv: aggregate('average_cell_voltage_mv'),
        averageDeviationMv: aggregate('average_deviation_mv'),
        netPowerKw: aggregate('net_power_kw'),
        voltageVariance: aggregate('voltage_variance'),
        pointCountInReport: points.length
      });
      byPower.set(power, series);
    }
  });
  const comparabilityAudit = durabilityComparabilityAudit(ordered);
  const analysisEligible = comparabilityAudit.comparable === true;
  const summary = [...byPower.entries()].sort(([a], [b]) => a - b).map(([targetPowerKw, series]) => {
    const voltage = series.map((item) => item.averageCellVoltageMv).filter(Number.isFinite);
    const deviation = series.map((item) => item.averageDeviationMv).filter(Number.isFinite);
    const first = series[0] || null;
    const last = series.at(-1) || null;
    return {
      targetPowerKw,
      reportCount: series.length,
      firstReport: first?.reportLabel || null,
      lastReport: last?.reportLabel || null,
      firstAverageCellVoltageMv: first?.averageCellVoltageMv ?? null,
      lastAverageCellVoltageMv: last?.averageCellVoltageMv ?? null,
      averageCellVoltageDeltaMv: analysisEligible ? numericDelta(first?.averageCellVoltageMv, last?.averageCellVoltageMv) : null,
      minimumAverageCellVoltageMv: voltage.length ? Math.min(...voltage) : null,
      maximumAverageCellVoltageMv: voltage.length ? Math.max(...voltage) : null,
      firstAverageDeviationMv: first?.averageDeviationMv ?? null,
      lastAverageDeviationMv: last?.averageDeviationMv ?? null,
      averageDeviationDeltaMv: analysisEligible ? numericDelta(first?.averageDeviationMv, last?.averageDeviationMv) : null,
      deltaStatus: analysisEligible ? 'eligible_descriptive_delta' : 'suppressed_not_comparable',
      maximumAverageDeviationMv: deviation.length ? Math.max(...deviation) : null,
      series
    };
  });
  return {
    status: 'descriptive_only',
    reportCount: ordered.length,
    orderingBasis: hasCompleteStartTimes ? 'metadata.开始时间' : '输入报告顺序',
    completeStartTimeEvidence: hasCompleteStartTimes,
    resultCounts: Object.fromEntries([...new Set(ordered.map((item) => item.report.metadata?.测试结果 || '未标注'))].sort().map((result) => [result, ordered.filter((item) => (item.report.metadata?.测试结果 || '未标注') === result).length])),
    comparabilityAudit,
    analysisEligible,
    byTargetPower: summary,
    boundary: '仅作跨报告描述性变化摘要；未验证耐久方法、循环等效性、统计显著性或企业验收限值，不产生标准符合性结论。'
  };
}

function buildStack(rows, config) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const efficiencyFields = efficiencyMapping(headers);
  const cellHeaders = headers.filter((header) => /^(单片电压\d+|CELL\d+)/i.test(String(header).trim()));
  const mapping = {
    phase: findHeader(headers, ['阶段', '工况', '测试阶段', '工况阶段', 'phase', 'stage']),
    timestamp_s: findHeader(headers, ['测试时间', '时间', '测试时间(ms)', '测试时间（ms）', '测试时间(s)', '测试时间（s）', '时间(ms)', '时间（ms）', '时间(s)', '时间（s）']),
    current_a: findHeader(headers, ['实际电流（A）', '实际电流(A)', '电堆电流']),
    // Prefer the actual stack voltage when both an aggregate/diagnostic
    // `总电压` channel and an electrical `实际电压` channel are exported.
    // The raw power channel is checked against the electrical measurement,
    // not against a diagnostic total that may use a different convention.
    voltage_v: findHeader(headers, ['实际电压（V）', '实际电压(V)', '实际电压', '总电压（V）', '总电压(V)', '电堆电压']),
    power_kw: findHeader(headers, ['功率（kW）', '功率（kW)', '功率(kW)', '电堆功率']),
    avg_cell_voltage_v: findHeader(headers, ['平均电压', '平均单片电压']),
    min_cell_voltage_v: findHeader(headers, ['最小电压（V）', '最小电压(V)', '单片电压最小值']),
    max_cell_voltage_v: findHeader(headers, ['最大电压（V）', '最大电压(V)', '单片电压最大值']),
    current_density_mAcm2: findHeader(headers, ['电流密度（mA/cm2）', '电流密度', '电流密度']),
    temperature_c: findHeader(headers, ['冷却水入口温度（℃）', '冷却水入口温度', '循环水入堆温度（℃）', '循环水入堆温度']),
    pressure_kpa: findHeader(headers, ['阳极入堆压力（kPa）', '阳极气体进堆压力(kpa)', '循环水入堆压力（kPa）']),
    flow_slpm: findHeader(headers, ['阳极流量（SLPM）', '阳极气体流量(L/Min)', '阳极气体流量']),
    leak_ppm: findHeader(headers, ['柜内氢气浓度（ppm）', '氢气浓度', '测试区氢气浓度（ppm）']),
    cell_count: findHeader(headers, ['片数']),
    coolant_dt: findHeader(headers, ['冷却液温差', '循环水进出口温差', '冷却水温差']),
    anode_in_pressure_kpa: findHeader(headers, ['阳极入堆压力（kPa）', '阳极气体进堆压力(kpa)']),
    anode_out_pressure_kpa: findHeader(headers, ['阳极出堆压力（kPa）', '阳极气体出堆压力(kpa)']),
    cathode_in_pressure_kpa: findHeader(headers, ['阴极入堆压力（kPa）', '阴极气体进堆压力(kpa)']),
    cathode_out_pressure_kpa: findHeader(headers, ['阴极出堆压力（kPa）', '阴极气体出堆压力(kpa)']),
    coolant_in_pressure_kpa: findHeader(headers, ['循环水入堆压力（kPa）', '电堆循环水进堆压力(kpa)']),
    coolant_out_pressure_kpa: findHeader(headers, ['循环水出堆压力（kPa）', '电堆循环水出堆压力(kpa)']),
    coolant_in_temp_c: findHeader(headers, ['循环水入堆温度（℃）', '冷却水入口温度（℃）', '冷却水入口温度']),
    coolant_out_temp_c: findHeader(headers, ['循环水出堆温度（℃）', '冷却水出口温度（℃）', '冷却水出口温度']),
    anode_in_temp_c: findHeader(headers, ['阳极入堆温度（℃）', '阳极气体进堆温度（℃）', '氢气入口温度']),
    anode_out_temp_c: findHeader(headers, ['阳极出堆温度（℃）', '阳极气体出堆温度（℃）']),
    cathode_in_temp_c: findHeader(headers, ['阴极入堆温度（℃）', '阴极气体进堆温度（℃）', '空气入口温度']),
    cathode_out_temp_c: findHeader(headers, ['阴极出堆温度（℃）', '阴极气体出堆温度（℃）']),
    h2_dewpoint_c: findHeader(headers, ['氢气入口露点温度', '阳极入口露点温度']),
    air_dewpoint_c: findHeader(headers, ['空气入口露点温度', '阴极入口露点温度']),
    h2_humidifier_water_temp_c: findHeader(headers, ['阳极增湿罐水温度（℃）', '阳极增湿罐水温度']),
    air_humidifier_water_temp_c: findHeader(headers, ['阴极增湿罐水温度（℃）', '阴极增湿罐水温度']),
    anode_flow_slpm: findHeader(headers, ['阳极流量（SLPM）', '阳极气体流量(L/Min)', '阳极气体流量']),
    cathode_flow_slpm: findHeader(headers, ['阴极流量（SLPM）', '阴极气体流量(L/Min)', '阴极气体流量']),
    h2_stoich: findHeader(headers, ['氢气计量比', '氢气化学计量比']),
    air_stoich: findHeader(headers, ['空气计量比', '空气化学计量比']),
    coolant_flow_lpm: findHeader(headers, ['循环水流量（L/min）', '电堆循环水流量(L/Min)']),
    coolant_conductivity_us_cm: findHeader(headers, ['循环水电导率（μS/cm）', '循环水电导率', '冷却水电导率']),
    internal_resistance: findHeader(headers, ['内阻', '内阻（mΩ）', '内阻(mΩ)'])
  };
  const required = ['timestamp_s', 'current_a', 'voltage_v'];
  const missing = required.filter((field) => !mapping[field]);
  if (missing.length >= 2) return null;
  const unitSpecs = {
    timestamp_s: unitSpec(mapping.timestamp_s, 'timestamp_s'),
    current_a: unitSpec(mapping.current_a, 'current_a'),
    voltage_v: unitSpec(mapping.voltage_v, 'voltage_v'),
    power_kw: unitSpec(mapping.power_kw, 'power_kw'),
    avg_cell_voltage_v: unitSpec(mapping.avg_cell_voltage_v, 'voltage_v'),
    min_cell_voltage_v: unitSpec(mapping.min_cell_voltage_v, 'voltage_v'),
    max_cell_voltage_v: unitSpec(mapping.max_cell_voltage_v, 'voltage_v'),
    pressure_kpa: unitSpec(mapping.pressure_kpa, 'pressure_kpa'),
    flow_slpm: unitSpec(mapping.flow_slpm, 'flow_slpm'),
    anode_flow_slpm: unitSpec(mapping.anode_flow_slpm, 'flow_slpm'),
    cathode_flow_slpm: unitSpec(mapping.cathode_flow_slpm, 'flow_slpm'),
    temperature_c: unitSpec(mapping.temperature_c, 'temperature_c'),
    leak_ppm: unitSpec(mapping.leak_ppm, 'leak_ppm')
  };
  const sessionRows = mapping.timestamp_s
    ? rows.map((row) => ({ ...row, [mapping.timestamp_s]: convertEnterpriseValue(row[mapping.timestamp_s], unitSpecs.timestamp_s) }))
    : rows;
  const sessionTime = sessionizedTimes(sessionRows, mapping.timestamp_s);
  const normalized = rows.map((row, index) => {
    const cells = Object.fromEntries(cellHeaders.map((header, cellIndex) => [`cell_${cellIndex + 1}_v`, num(row[header])]));
    return {
      timestamp_s: sessionTime.globalTimes[index],
      session_timestamp_s: sessionTime.localTimes[index],
      session_id: sessionTime.sessionIds[index],
      source_file: row.source_file || null,
      source_row_index: Number.isInteger(row.source_row_index) ? row.source_row_index : index,
      phase: mapping.phase ? String(row[mapping.phase] ?? '').trim() || '未标注' : '未标注',
      current_a: convertEnterpriseValue(row[mapping.current_a], unitSpecs.current_a),
      voltage_v: convertEnterpriseValue(row[mapping.voltage_v], unitSpecs.voltage_v),
      power_kw: convertEnterpriseValue(row[mapping.power_kw], unitSpecs.power_kw),
      raw_power_w: convertEnterpriseValue(row[mapping.power_kw], unitSpecs.power_kw) === null ? null : convertEnterpriseValue(row[mapping.power_kw], unitSpecs.power_kw) * 1000,
      derived_power_w: Number.isFinite(convertEnterpriseValue(row[mapping.current_a], unitSpecs.current_a)) && Number.isFinite(convertEnterpriseValue(row[mapping.voltage_v], unitSpecs.voltage_v)) ? convertEnterpriseValue(row[mapping.current_a], unitSpecs.current_a) * convertEnterpriseValue(row[mapping.voltage_v], unitSpecs.voltage_v) : null,
      power_w: convertEnterpriseValue(row[mapping.power_kw], unitSpecs.power_kw) !== null
        ? convertEnterpriseValue(row[mapping.power_kw], unitSpecs.power_kw) * 1000
        : Number.isFinite(convertEnterpriseValue(row[mapping.current_a], unitSpecs.current_a)) && Number.isFinite(convertEnterpriseValue(row[mapping.voltage_v], unitSpecs.voltage_v))
          ? convertEnterpriseValue(row[mapping.current_a], unitSpecs.current_a) * convertEnterpriseValue(row[mapping.voltage_v], unitSpecs.voltage_v)
          : null,
      avg_cell_voltage_v: convertEnterpriseValue(row[mapping.avg_cell_voltage_v], unitSpecs.avg_cell_voltage_v),
      min_cell_voltage_v: convertEnterpriseValue(row[mapping.min_cell_voltage_v], unitSpecs.min_cell_voltage_v),
      max_cell_voltage_v: convertEnterpriseValue(row[mapping.max_cell_voltage_v], unitSpecs.max_cell_voltage_v),
      current_density_mAcm2: num(row[mapping.current_density_mAcm2]),
      temperature_c: convertEnterpriseValue(row[mapping.temperature_c], unitSpecs.temperature_c),
      pressure_kpa: convertEnterpriseValue(row[mapping.pressure_kpa], unitSpecs.pressure_kpa),
      flow_slpm: convertEnterpriseValue(row[mapping.flow_slpm], unitSpecs.flow_slpm),
      leak_ppm: convertEnterpriseValue(row[mapping.leak_ppm], unitSpecs.leak_ppm),
      cell_count: num(row[mapping.cell_count]),
      coolant_dt: num(row[mapping.coolant_dt]),
      anode_in_pressure_kpa: num(row[mapping.anode_in_pressure_kpa]),
      anode_out_pressure_kpa: num(row[mapping.anode_out_pressure_kpa]),
      cathode_in_pressure_kpa: num(row[mapping.cathode_in_pressure_kpa]),
      cathode_out_pressure_kpa: num(row[mapping.cathode_out_pressure_kpa]),
      coolant_in_pressure_kpa: num(row[mapping.coolant_in_pressure_kpa]),
      coolant_out_pressure_kpa: num(row[mapping.coolant_out_pressure_kpa]),
      coolant_in_temp_c: num(row[mapping.coolant_in_temp_c]),
      coolant_out_temp_c: num(row[mapping.coolant_out_temp_c]),
      anode_in_temp_c: num(row[mapping.anode_in_temp_c]),
      anode_out_temp_c: num(row[mapping.anode_out_temp_c]),
      cathode_in_temp_c: num(row[mapping.cathode_in_temp_c]),
      cathode_out_temp_c: num(row[mapping.cathode_out_temp_c]),
      h2_dewpoint_c: num(row[mapping.h2_dewpoint_c]),
      air_dewpoint_c: num(row[mapping.air_dewpoint_c]),
      h2_humidifier_water_temp_c: num(row[mapping.h2_humidifier_water_temp_c]),
      air_humidifier_water_temp_c: num(row[mapping.air_humidifier_water_temp_c]),
      anode_flow_slpm: convertEnterpriseValue(row[mapping.anode_flow_slpm], unitSpecs.anode_flow_slpm),
      cathode_flow_slpm: convertEnterpriseValue(row[mapping.cathode_flow_slpm], unitSpecs.cathode_flow_slpm),
      h2_stoich: num(row[mapping.h2_stoich]),
      air_stoich: num(row[mapping.air_stoich]),
      coolant_flow_lpm: num(row[mapping.coolant_flow_lpm]),
      coolant_conductivity_us_cm: num(row[mapping.coolant_conductivity_us_cm]),
      internal_resistance: num(row[mapping.internal_resistance]),
      efficiency_pct: num(row[efficiencyFields.efficiency_pct]),
      anode_flow_resistance_kpa: num(row[mapping.anode_in_pressure_kpa]) !== null && num(row[mapping.anode_out_pressure_kpa]) !== null ? num(row[mapping.anode_in_pressure_kpa]) - num(row[mapping.anode_out_pressure_kpa]) : null,
      cathode_flow_resistance_kpa: num(row[mapping.cathode_in_pressure_kpa]) !== null && num(row[mapping.cathode_out_pressure_kpa]) !== null ? num(row[mapping.cathode_in_pressure_kpa]) - num(row[mapping.cathode_out_pressure_kpa]) : null,
      coolant_flow_resistance_kpa: num(row[mapping.coolant_in_pressure_kpa]) !== null && num(row[mapping.coolant_out_pressure_kpa]) !== null ? num(row[mapping.coolant_in_pressure_kpa]) - num(row[mapping.coolant_out_pressure_kpa]) : null,
      coolant_temperature_difference_c: num(row[mapping.coolant_out_temp_c]) !== null && num(row[mapping.coolant_in_temp_c]) !== null ? num(row[mapping.coolant_out_temp_c]) - num(row[mapping.coolant_in_temp_c]) : null,
      cells
    };
  });
  const configuredCellCountHint = Number(config.stoichConfig?.cellCount ?? config.cellCount ?? config.testMetadata?.cellCount);
  const observedCellCount = Math.max(...normalized.map((row) => row.cell_count).filter((value) => value !== null && value > 0), 0);
  const inferredCellCount = configuredCellCountHint > 0 ? configuredCellCountHint : observedCellCount > 0 ? observedCellCount : cellHeaders.length;
  const stoichConfig = {
    ...DEFAULT_STOICH_CONFIG,
    ...(config.stoichConfig || {}),
    cellCount: inferredCellCount > 0 ? inferredCellCount : null
  };
  const theoreticalFlows = (currentA, rowCellCount = null) => {
    const faraday = Number(stoichConfig.faradayConstantCPerMol);
    const molarVolume = Number(stoichConfig.standardMolarVolumeLPerMol);
    const oxygenFraction = Number(stoichConfig.oxygenVolumeFraction);
    const cellCount = Number.isFinite(rowCellCount) && rowCellCount > 0 ? rowCellCount : Number(stoichConfig.cellCount);
    if (![currentA, faraday, molarVolume, oxygenFraction, cellCount].every(Number.isFinite) || faraday <= 0 || molarVolume <= 0 || oxygenFraction <= 0 || cellCount <= 0) return null;
    return {
      h2: currentA * cellCount / (2 * faraday) * molarVolume * 60,
      air: currentA * cellCount / (4 * faraday) / oxygenFraction * molarVolume * 60
    };
  };
  for (const row of normalized) {
    const theoretical = theoreticalFlows(row.current_a, row.cell_count);
    if (row.h2_stoich === null && theoretical?.h2 > 0 && row.anode_flow_slpm !== null) row.h2_stoich = row.anode_flow_slpm / theoretical.h2;
    if (row.air_stoich === null && theoretical?.air > 0 && row.cathode_flow_slpm !== null) row.air_stoich = row.cathode_flow_slpm / theoretical.air;
  }
  const requiredQuality = ['timestamp_s', 'current_a', 'voltage_v', ...cellHeaders.map((_, index) => `cell_${index + 1}_v`)];
  const quality = qualityFor(normalized, requiredQuality);
  const unsupportedUnitFields = Object.entries(unitSpecs).filter(([, spec]) => spec.status === 'unsupported').map(([field, spec]) => `${field}: ${spec.label}`);
  quality.unitConversions = Object.fromEntries(Object.entries(unitSpecs).map(([field, spec]) => [field, { status: spec.status, factor: spec.factor, label: spec.label, rawUnit: spec.rawUnit }]));
  quality.unsupportedUnitFields = unsupportedUnitFields;
  if (unsupportedUnitFields.length) quality.usable = false;
  quality.sessionCount = sessionTime.sessions.length;
  quality.sessionBoundaryCount = Math.max(0, sessionTime.sessions.length - 1);
  quality.sessionDurationsS = sessionTime.sessions.map((session) => ({ sessionId: session.sessionId, sourceFile: session.sourceFile, durationS: session.durationS, rowCount: session.rowCount }));
  quality.missingHeaders = missing;
  quality.usable = quality.usable && missing.length === 0;
  const activeCellValues = (row) => {
    const count = Number.isFinite(row.cell_count) && row.cell_count > 0 ? Math.min(row.cell_count, cellHeaders.length) : cellHeaders.length;
    return Object.values(row.cells).slice(0, count).filter((value) => value !== null);
  };
  const validActiveCellValues = (row) => activeCellValues(row).filter((value) => value > 0);
  const activeCellValuesFor = (row, index) => {
    const count = Number.isFinite(row.cell_count) && row.cell_count > 0 ? Math.min(row.cell_count, cellHeaders.length) : cellHeaders.length;
    return index < count ? row.cells[`cell_${index + 1}_v`] : null;
  };
  const cellValues = normalized.flatMap(validActiveCellValues);
  const rawActiveCellValues = normalized.flatMap(activeCellValues);
  const invalidCellValueCount = rawActiveCellValues.filter((value) => value <= 0).length;
  const configuredCellCount = Math.max(...normalized.map((row) => row.cell_count).filter((value) => value !== null), 0);
  const rowsWithConfiguredCount = normalized.filter((row) => row.cell_count !== null).length;
  const powerValues = normalized.map((row) => row.power_w).filter((value) => value !== null);
  const averageCellValues = normalized.map((row) => row.avg_cell_voltage_v).filter((value) => value !== null);
  const powerCrossCheck = enterprisePowerCrossCheck(normalized);
  const cellSpread = normalized.map((row) => {
    const values = validActiveCellValues(row);
    return values.length ? Math.max(...values) - Math.min(...values) : null;
  }).filter((value) => value !== null);
  const cellTimeSeriesStats = cellHeaders.map((source, index) => {
    const field = `cell_${index + 1}_v`;
    const values = normalized.map((row) => activeCellValuesFor(row, index)).filter((value) => value !== null && value > 0);
    return {
      source,
      field,
      cellIndex: index + 1,
      count: values.length,
      missingCount: normalized.length - values.length,
      completenessPct: normalized.length ? values.length / normalized.length * 100 : 0,
      mean: mean(values),
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      range: values.length ? Math.max(...values) - Math.min(...values) : null,
      std: std(values),
      boundary: '原始电堆时序逐片描述性统计；不含企业限值或标准符合性判定'
    };
  });
  const summary = (field) => {
    const values = normalized.map((row) => row[field]).filter((value) => value !== null);
    return { count: values.length, mean: mean(values), min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null, std: std(values) };
  };
  const parameterConfig = config.parameterConfig || null;
  const hasUsableTargetConditions = Boolean(parameterConfig?.ok && parameterConfig.targetConditions?.length);
  const parameterAnalysisCandidate = hasUsableTargetConditions ? stackPlatforms(normalized, parameterConfig, config) : inferStackSegments(normalized, config);
  const parameterAnalysis = hasUsableTargetConditions && !quality.usable
    ? { ...parameterAnalysisCandidate, platforms: [], stableSegments: [], performancePoints: [], selectionAudit: [], selectionPolicy: 'blocked_data_quality' }
    : parameterAnalysisCandidate;
  const stackRoleBySource = Object.fromEntries([
    ...Object.values(mapping).filter(Boolean).map((source) => [source, 'analysis_input']),
    ...cellHeaders.map((source) => [source, 'analysis_input']),
    ...headers.filter((source) => /设定值|设定|目标值/.test(String(source))).map((source) => [source, 'context_or_cross_check']),
    ...headers.filter((source) => /反馈|泵反馈|阀反馈/.test(String(source))).map((source) => [source, 'context_or_cross_check'])
  ]);
  const signalCatalog = annotateSignalCatalog(rows, headers, mapping, stackRoleBySource);
  const signalDiagnostics = signalDiagnosticsSummary(signalCatalog);
  const settingPairs = [
    { code: 'ANODE_IN_PRESSURE_SETPOINT', target: '阳极入堆压力设定值（kPa）', actual: '阳极入堆压力（kPa）', unit: 'kPa' },
    { code: 'ANODE_OUT_PRESSURE_SETPOINT', target: '阳极出堆压力设定值（kPa）', actual: '阳极出堆压力（kPa）', unit: 'kPa' },
    { code: 'ANODE_IN_TEMP_SETPOINT', target: '阳极入堆温度设定值（℃）', actual: '阳极入堆温度（℃）', unit: '°C' },
    { code: 'CATHODE_IN_PRESSURE_SETPOINT', target: '阴极入堆压力设定值（kPa）', actual: '阴极入堆压力（kPa）', unit: 'kPa' },
    { code: 'CATHODE_OUT_PRESSURE_SETPOINT', target: '阴极出堆压力设定值（kPa）', actual: '阴极出堆压力（kPa）', unit: 'kPa' },
    { code: 'CATHODE_IN_TEMP_SETPOINT', target: '阴极入堆温度设定值（℃）', actual: '阴极入堆温度（℃）', unit: '°C' },
    { code: 'COOLANT_IN_TEMP_SETPOINT', target: '循环水入堆温度设定值（℃）', actual: '循环水入堆温度（℃）', unit: '°C' },
    { code: 'ANODE_FLOW_SETPOINT', target: '阳极流量设定值（SLPM）', actual: '阳极流量（SLPM）', unit: 'SLPM' },
    { code: 'CATHODE_FLOW_SETPOINT', target: '阴极流量设定值（SLPM）', actual: '阴极流量（SLPM）', unit: 'SLPM' },
    { code: 'COOLANT_FLOW_SETPOINT', target: '循环水流量设定值（L/min）', actual: '循环水流量（L/min）', unit: 'L/min' },
    { code: 'CURRENT_SETPOINT', target: '电流设定值（A）', actual: '实际电流（A）', unit: 'A' },
    { code: 'VOLTAGE_SETPOINT', target: '电压设定值（V）', actual: '实际电压（V）', unit: 'V' },
    { code: 'CURRENT_DENSITY_SETPOINT', target: '电流密度设定值（mA/cm2）', actual: '电流密度（mA/cm2）', unit: 'mA/cm²' }
  ].filter(({ target, actual }) => headers.includes(target) && headers.includes(actual));
  const settingCrossChecks = pairEvidence(rows, settingPairs);
  const feedbackSignals = signalCatalog.filter((item) => item.usage === 'context_or_cross_check' && /反馈/.test(item.source));
  const issues = [];
  if (unsupportedUnitFields.length) issues.push({ severity: 'critical', code: 'UNIT_UNSUPPORTED', title: '电堆表头单位无法安全换算', evidence: unsupportedUnitFields.join('；'), recommendation: '补充明确的 canonical 单位或企业单位字典；系统不按数值大小猜测单位。' });
  if (hasUsableTargetConditions && !quality.usable) issues.push({ severity: 'critical', code: 'STACK_DATA_QUALITY_BLOCKS_POINTS', title: '时间轴/关键字段质量未通过，未生成正式稳定点', evidence: `重复时间戳 ${quality.duplicateTimestampCount} 条，逆序 ${quality.nonMonotonicCount} 次，非正间隔 ${quality.nonPositiveIntervalCount} 个；正式目标工况点已阻断`, recommendation: '修复时间轴和关键字段后重新分析；不使用配置采样周期覆盖无效原始时间戳。' });
  if (parameterConfig && !parameterConfig.ok && parameterConfig.analysisMode !== 'relative_stability') issues.push({ severity: 'critical', code: 'PARAMETER_WORKBOOK_INVALID', title: '参数工作簿校验未通过', evidence: parameterConfig.errors.join('；'), recommendation: '修正参数代码、单位、偏差和目标工况后再处理。' });
  if (missing.length) issues.push({ severity: 'critical', code: 'STACK_SCHEMA_MISSING', title: '电堆时序关键字段不完整', evidence: `缺少：${missing.join('、')}`, recommendation: '补充时间、电流、电压和单片电压通道后再进行平台/稳定性分析。' });
  if (!cellHeaders.length) issues.push({ severity: 'warn', code: 'STACK_CELL_CHANNELS_MISSING', title: '未发现单片电压通道', evidence: '当前工作表可用于堆级电压/电流和工况统计，但不能完成单片一致性判定', recommendation: '导入包含单片电压列的原始测试表后再做单片异常结论。' });
  if (configuredCellCount && configuredCellCount !== cellHeaders.length) issues.push({ severity: 'warn', code: 'CELL_CHANNEL_COUNT_MISMATCH', title: '单片数量与导出通道数不一致', evidence: `参数表片数 ${configuredCellCount}，导出单片通道 ${cellHeaders.length} 个；有效配置记录 ${rowsWithConfiguredCount} 条`, recommendation: '确认测试台导出列、片数参数和有效通道范围，不能静默截断。' });
  if (quality.duplicateTimestampCount) issues.push({ severity: 'warn', code: 'STACK_TIMESTAMP_RESOLUTION', title: '时间戳分辨率不足以支撑逐秒排序', evidence: `重复时间戳 ${quality.duplicateTimestampCount} 条，当前时间列需要结合采样序号复核`, recommendation: '改用带秒/毫秒的原始时间列或补充采样周期参数。' });
  if (invalidCellValueCount) issues.push({ severity: 'warn', code: 'STACK_CELL_VALUES_FILTERED', title: '单片电压非正值未进入派生统计', evidence: `${invalidCellValueCount.toLocaleString('zh-CN')} 个逐行有效片位原始值 ≤ 0；原始值仍保留，未作为正常电压参与均值、极差或标准差`, recommendation: '确认停机态/切换态和企业无效码表；补充有效采样状态后再做正式一致性结论。' });
  if (signalDiagnostics.reviewSignalCount) issues.push({ severity: 'warn', code: 'SIGNAL_VALUE_SEMANTICS_REVIEW', title: '原始信号值分布需要语义复核', evidence: `${signalDiagnostics.reviewSignalCount} 个核心/交叉核对字段存在负值、零值集中、常量值或数值解析混合；示例：${signalDiagnostics.reviewSignals.slice(0, 4).map((item) => `${item.source}（${item.reasons.join('、')}）`).join('；')}`, recommendation: '先确认字段单位、设备状态和企业无效码表；系统不自动删除负值/零值，也不把该提示直接转为不合格。' });
  if (sessionTime.sessions.length > 1) issues.push({ severity: 'info', code: 'STACK_SESSIONS_PRESERVED', title: '多文件会话边界已保留', evidence: `识别 ${sessionTime.sessions.length} 个独立会话；电流平台和稳定区间不会跨文件拼接`, recommendation: '按来源文件复核各会话的时间轴、平台顺序和采样连续性。' });
  if (parameterConfig?.ok && parameterAnalysis.performancePoints.some((point) => point.status === 'short_stable')) issues.push({ severity: 'warn', code: 'SHORT_STABLE_WINDOW', title: '稳定区间不足默认统计时长', evidence: `有 ${parameterAnalysis.performancePoints.filter((point) => point.status === 'short_stable').length} 个稳定点达到最短稳定时间但不足默认 ${parameterConfig.parameters.find((item) => item.code === 'DEFAULT_SAMPLE_TIME')?.target ?? 120} s`, recommendation: '保留该点并标记警告；如需正式长窗口曲线，应延长稳定采样。' });
  if (parameterConfig?.ok && !parameterAnalysis.performancePoints.length && hasUsableTargetConditions) issues.push({ severity: 'warn', code: 'STABLE_WINDOW_MISSING', title: '未形成满足参数的稳定区间', evidence: `已读取 ${parameterAnalysis.platforms.length} 个候选平台，但没有稳定区间达到最短稳定时间或参数完整条件`, recommendation: '检查目标工况、稳定判定参数、采样周期和原始时间分辨率。' });
  if (!hasUsableTargetConditions) {
    const relativeMode = parameterAnalysis.relativeStability?.enabled && parameterAnalysis.relativeStability?.rules?.length;
    issues.push({ severity: 'warn', code: 'STACK_TARGET_PARAMETERS_MISSING', title: relativeMode ? '未提供目标工况参数，仅执行相对稳定性描述分析' : '未提供电堆目标工况参数', evidence: relativeMode ? `按 ${parameterAnalysis.relativeStability.center} 中心、${parameterAnalysis.relativeStability.windowS} s 窗口和 ${parameterAnalysis.relativeStability.rules.length} 条可配置规则筛选出 ${parameterAnalysis.inferredSegments?.length || 0} 个描述性候选区间` : `按实际电流连续性发现 ${parameterAnalysis.inferredSegments?.length || 0} 个描述性候选区间；未生成正式稳定区间或极化性能点`, recommendation: '导入企业批准的“目标工况设定”工作表后，才可进入目标符合性和正式极化点路径；当前结果仅供工程师定位复核。' });
  }
  const invalidSelectionAudits = parameterAnalysis.selectionAudit.filter((item) => item.selectionError);
  if (invalidSelectionAudits.length) issues.push({ severity: 'warn', code: 'STACK_SELECTION_OVERRIDE_INVALID', title: '人工稳定区间选择已回退', evidence: invalidSelectionAudits.map((item) => `${item.platformId}：${item.selectionError}`).join('；'), recommendation: '重新选择当前数据批次中列出的可用稳定区间，并保存报告中的人工选择记录。' });
  if (!issues.length) issues.push({ severity: 'info', code: 'STACK_DATA_READY', title: '电堆时序数据已完成结构化分析', evidence: `${normalized.length} 条记录、${cellHeaders.length} 个单片通道已进入统计`, recommendation: '进入企业方法确认和工程师签核。' });
  const verdict = issues.some((item) => item.severity === 'critical') ? 'FAIL' : 'WARN';
  const dataset = {
    kind: 'stack',
    label: '燃料电池电堆时序数据',
    sourceContract: 'T02-03 · 电堆时序数据处理任务说明书',
    workbookEvidence: config.workbookEvidence || null,
    workbookStabilityCrossCheck: workbookStabilityCrossCheck(normalized, config.workbookEvidence),
    cellChannelCount: cellHeaders.length,
    activeCellChannelCount: configuredCellCount || observedCellCount || null,
    cellValueQuality: { rawActiveValueCount: rawActiveCellValues.length, validPositiveValueCount: cellValues.length, nonPositiveValueCount: invalidCellValueCount, boundary: '原始逐片值保留；非正值不进入派生电压统计，不能据此替代企业无效码表或正式验收规则。' },
    cellCountDistribution: Object.fromEntries([...new Set(normalized.map((row) => row.cell_count).filter((value) => value !== null))].sort((a, b) => a - b).map((count) => [String(count), normalized.filter((row) => row.cell_count === count).length])),
    configuredCellCount,
    cellHeaders,
    cellTimeSeriesStats,
    signalCatalog,
    signalDiagnostics,
    sessions: sessionTime.sessions,
    sessionCount: sessionTime.sessions.length,
    coverage: coverageSummary(signalCatalog),
    settingCrossChecks,
    feedbackSignals,
    parameterConfig: parameterConfig ? { ok: parameterConfig.ok, analysisMode: parameterConfig.analysisMode || 'target_conformity', parameterSheet: parameterConfig.parameterSheet, targetSheet: parameterConfig.targetSheet, errors: parameterConfig.errors, warnings: parameterConfig.warnings, formulaAudit: parameterConfig.formulaAudit ? { status: parameterConfig.formulaAudit.status, formulaCellCount: parameterConfig.formulaAudit.formulaCellCount, cachedFormulaCellCount: parameterConfig.formulaAudit.cachedFormulaCellCount, uncachedFormulaCellCount: parameterConfig.formulaAudit.uncachedFormulaCellCount, macroPresent: Boolean(parameterConfig.formulaAudit.macroPresent), externalLinksPresent: Boolean(parameterConfig.formulaAudit.externalLinksPresent), activeContentPresent: Boolean(parameterConfig.formulaAudit.activeContentPresent) } : null } : null,
    platforms: parameterAnalysis.platforms,
    stableSegments: parameterAnalysis.stableSegments,
    performancePoints: parameterAnalysis.performancePoints,
    inferredSegments: parameterAnalysis.inferredSegments || [],
    relativeStability: parameterAnalysis.relativeStability || null,
    selectionAudit: parameterAnalysis.selectionAudit,
    excludedIntervals: parameterAnalysis.excludedIntervals || [],
    selectionPolicy: parameterAnalysis.selectionPolicy,
    metrics: {
      averageCurrentA: mean(normalized.map((row) => row.current_a).filter((value) => value !== null)),
      averageVoltageV: mean(normalized.map((row) => row.voltage_v).filter((value) => value !== null)),
      peakPowerKw: powerValues.length ? Math.max(...powerValues) / 1000 : null,
      averageCellVoltageV: mean(averageCellValues),
      cellSpreadMaxV: cellSpread.length ? Math.max(...cellSpread) : null,
      cellSpreadMeanV: mean(cellSpread),
      cellValueStdV: std(cellValues),
      currentDensityMean: mean(normalized.map((row) => row.current_density_mAcm2).filter((value) => value !== null)),
      anodeFlowResistanceKpa: summary('anode_flow_resistance_kpa'),
      cathodeFlowResistanceKpa: summary('cathode_flow_resistance_kpa'),
      coolantFlowResistanceKpa: summary('coolant_flow_resistance_kpa'),
      coolantTemperatureDifferenceC: summary('coolant_temperature_difference_c'),
      internalResistance: summary('internal_resistance'),
      hydrogenStoich: summary('h2_stoich'),
      airStoich: summary('air_stoich'),
      coolantConductivityUsCm: summary('coolant_conductivity_us_cm'),
      h2DewpointC: summary('h2_dewpoint_c'),
      airDewpointC: summary('air_dewpoint_c'),
      h2HumidifierWaterTemperatureC: summary('h2_humidifier_water_temp_c'),
      airHumidifierWaterTemperatureC: summary('air_humidifier_water_temp_c'),
      anodeOutletTemperatureC: summary('anode_out_temp_c'),
      cathodeOutletTemperatureC: summary('cathode_out_temp_c')
    },
    sourceFieldMap: {
      ...mapping,
      current_a: mapping.current_a ? mapping.current_a + ' · ' + unitSpecs.current_a.label : null, voltage_v: mapping.voltage_v ? mapping.voltage_v + ' · ' + unitSpecs.voltage_v.label : null, power_w: mapping.power_kw ? mapping.power_kw + ' · ' + (UNIT_DISPLAY[unitSpecs.power_kw.rawUnit] || unitSpecs.power_kw.rawUnit || 'kW') + '→W（原始通道）' : '计算：实际电流 × 实际电压（W，派生功率）',
      anode_flow_resistance_kpa: '计算：阳极入口压力 - 阳极出口压力',
      cathode_flow_resistance_kpa: '计算：阴极入口压力 - 阴极出口压力',
      coolant_flow_resistance_kpa: '计算：冷却液入口压力 - 冷却液出口压力',
      coolant_temperature_difference_c: '计算：冷却液出口温度 - 冷却液入口温度',
      h2_stoich: mapping.h2_stoich || '计算：阳极流量 / 理论耗氢量（法拉第常数、标准摩尔体积、片数）',
      air_stoich: mapping.air_stoich || '计算：阴极流量 / 理论耗氧对应空气量（法拉第常数、标准摩尔体积、氧体积分数、片数）',
      coolant_conductivity_us_cm: mapping.coolant_conductivity_us_cm,
      h2_dewpoint_c: mapping.h2_dewpoint_c,
      air_dewpoint_c: mapping.air_dewpoint_c,
      h2_humidifier_water_temp_c: mapping.h2_humidifier_water_temp_c,
      air_humidifier_water_temp_c: mapping.air_humidifier_water_temp_c,
      anode_out_temp_c: mapping.anode_out_temp_c,
      cathode_out_temp_c: mapping.cathode_out_temp_c
    }
  };
  dataset.stoich = {
    status: Number.isFinite(stoichConfig.cellCount) && stoichConfig.cellCount > 0 ? 'calculated_or_raw' : 'not_configured',
    cellCount: stoichConfig.cellCount,
    faradayConstantCPerMol: stoichConfig.faradayConstantCPerMol,
    standardMolarVolumeLPerMol: stoichConfig.standardMolarVolumeLPerMol,
    oxygenVolumeFraction: stoichConfig.oxygenVolumeFraction,
      cellCountSource: normalized.some((row) => Number.isFinite(row.cell_count)) ? '逐行片数字段（缺失时回退 profile/导出通道数）' : 'profile 或导出通道数回退',
      source: '默认物理常数或企业 profile stoichConfig；正式报告需由企业确认温压基准和片数'
  };
  const metrics = {
    sampleCount: normalized.length,
    durationS: Math.max(...normalized.map((row) => row.timestamp_s).filter((value) => value !== null), 0),
    sessionCount: sessionTime.sessions.length,
    sessionDurationS: sessionTime.sessions.reduce((sum, session) => sum + session.durationS, 0),
    completenessPct: quality.completenessPct,
    peakPowerW: powerValues.length ? Math.max(...powerValues) : null,
    powerSource: powerCrossCheck.status,
    powerCrossCheck,
    steadyVoltageMeanV: mean(averageCellValues),
    steadyVoltageStdV: std(averageCellValues),
    peakTemperatureC: Math.max(...normalized.map((row) => row.temperature_c).filter((value) => value !== null), 0) || null,
    peakPressureBar: Math.max(...normalized.map((row) => row.pressure_kpa).filter((value) => value !== null), 0) / 100 || null,
    peakLeakPpm: Math.max(...normalized.map((row) => row.leak_ppm).filter((value) => value !== null), 0) || null,
    hydrogenVolumeNl: null,
    energyConsumedWh: null,
    specificEnergyKWhPerNm3: null,
    minimumHydrogenPurityPct: null,
    pressureDriftBarPerMin: 0,
    steadyWindow: '电堆时序样本',
    steadySampleCount: normalized.length,
    sessionCount: sessionTime.sessions.length,
    sessionDurationS: sessionTime.sessions.reduce((sum, session) => sum + session.durationS, 0)
  };
  // Keep the canonical raw measurement mapping empty when the source has no
  // original power column.  Derived power remains available in rows/metrics
  // and is described separately in the source map and schema conversions.
  const schemaMapping = { ...mapping, power_w: mapping.power_kw || null, ...efficiencyFields, ...Object.fromEntries(cellHeaders.map((header, index) => [`cell_${index + 1}_v`, header])) };
  const schemaConversions = { ...Object.fromEntries(Object.entries(unitSpecs).map(([field, spec]) => [field, { mode: spec.status === 'declared' ? 'scale' : spec.status === 'unsupported' ? 'unsupported' : 'identity', factor: spec.factor, label: spec.label, rawUnit: spec.rawUnit }])), power_w: mapping.power_kw ? { mode: unitSpecs.power_kw.status === 'unsupported' ? 'unsupported' : unitSpecs.power_kw.status === 'declared' ? 'scale' : 'identity', factor: unitSpecs.power_kw.factor === null ? null : unitSpecs.power_kw.factor * 1000, label: (UNIT_DISPLAY[unitSpecs.power_kw.rawUnit] || unitSpecs.power_kw.rawUnit || 'kW') + '→W', rawUnit: unitSpecs.power_kw.rawUnit } : { mode: 'derived', factor: 1, label: '电流×电压派生（W）' } };
  const schema = commonSchema(schemaMapping, Object.keys(schemaMapping).length, schemaConversions);
  schema.derivedFields = mapping.power_kw ? [] : ['power_w'];
  schema.derivedEvidence = mapping.power_kw ? null : 'power_w = 实际电流 × 实际电压；仅用于描述性 KPI，不满足 requiredMeasurements 的原始功率通道要求';
  const cellUncertaintyField = averageCellValues.length ? 'avg_cell_voltage_v' : cellHeaders.length ? 'cell_voltage_v' : null;
  const uncertainty = calculateEnterpriseUncertainty(normalized, metrics, config.uncertaintyModel, {
    metricSpecs: [
      { metric: 'averageCurrentA', value: dataset.metrics.averageCurrentA, unit: 'A', field: 'current_a', requiredField: 'current_a' },
      { metric: 'averageVoltageV', value: dataset.metrics.averageVoltageV, unit: 'V', field: 'voltage_v', requiredField: 'voltage_v' },
      { metric: 'peakPowerW', value: metrics.peakPowerW, unit: 'W', power: true, requiredField: 'power_w' },
      ...(cellUncertaintyField ? [{ metric: 'averageCellVoltageV', value: dataset.metrics.averageCellVoltageV, unit: 'V', field: cellUncertaintyField, requiredField: cellUncertaintyField }] : []),
      ...(cellHeaders.length ? [{ metric: 'cellValueStdV', value: dataset.metrics.cellValueStdV, unit: 'V', field: 'cell_voltage_v', sampleStd: true, sampleCount: cellValues.length, requiredField: 'cell_voltage_v' }] : [])
    ]
  });
  const complianceResult = compliance(config, dataset.label, metrics, quality, normalized, schema);
  complianceResult.uncertainty = uncertainty;
  issues.push(...profileGateIssues(complianceResult));
  const finalVerdict = issues.some((item) => item.severity === 'critical') ? 'FAIL' : verdict;
  const workflowResult = workflow(dataset, quality, issues, Boolean(parameterConfig?.ok && parameterConfig.targetConditions?.length), complianceResult);
  const selectionSummary = parameterAnalysis.selectionAudit.length
    ? `稳定区间选择策略为 ${parameterAnalysis.selectionPolicy}；人工改选 ${parameterAnalysis.selectionAudit.filter((item) => item.selectionMode === 'manual').length} 个平台，当前选择均保留自动候选、请求值和结果区间。`
    : '尚未形成稳定区间选择记录。';
  return {
    dataset,
    datasetType: 'stack',
    generatedAt: new Date().toISOString(),
    config: { ...config, datasetType: 'stack' },
    rows: normalized,
    metrics,
    quality,
    schema,
    compliance: complianceResult,
    uncertainty,
    workflow: workflowResult,
    phases: (() => {
      const groups = [];
      for (const row of normalized) {
        const last = groups.at(-1);
        if (!last || last.phase !== row.phase) groups.push({ phase: row.phase, rows: [row] });
        else last.rows.push(row);
      }
      return groups.map((group) => ({
        phase: group.phase,
        count: group.rows.length,
        startS: group.rows[0]?.timestamp_s ?? null,
        endS: group.rows.at(-1)?.timestamp_s ?? null,
        durationS: group.rows.length >= 2 && Number.isFinite(group.rows.at(-1)?.timestamp_s) && Number.isFinite(group.rows[0]?.timestamp_s)
          ? group.rows.at(-1).timestamp_s - group.rows[0].timestamp_s
          : 0
      }));
    })(),
    issues,
    verdict: finalVerdict,
    narrative: finalVerdict === 'FAIL' ? `电堆时序数据、参数工作簿或 profile 门控未通过校验，已阻断正式统计。${selectionSummary}` : hasUsableTargetConditions ? `已完成 ${parameterAnalysis.platforms.length} 个电流平台和 ${parameterAnalysis.performancePoints.length} 个有效稳定区间的处理；${selectionSummary}正式符合性结论仍需工程师签核。` : parameterAnalysis.relativeStability?.enabled && parameterAnalysis.relativeStability?.rules?.length ? `已完成电堆字段映射、时间轴质量、单片一致性摘要，并按 ${parameterAnalysis.relativeStability.center} 中心和 ${parameterAnalysis.relativeStability.windowS} s 窗口筛选 ${parameterAnalysis.inferredSegments?.length || 0} 个相对稳定性描述候选；未提供目标工况参数，未进行目标符合性判定，也未生成正式极化性能点。` : `已完成电堆时序字段映射、时间轴质量、单片电压一致性摘要和 ${parameterAnalysis.inferredSegments?.length || 0} 个实际电流候选区间的描述性统计；未提供目标工况参数，未进行目标符合性判定，也未生成正式极化性能点。`,
    source: { type: 'csv', rowCount: normalized.length, requiredFields: required }
  };
}
export function analyzeEnterpriseRows(inputRows, config = {}) {
  const rows = Array.isArray(inputRows) ? inputRows : [];
  if (!rows.length) return null;
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (headers.includes('target_power_kw') && headers.includes('average_cell_voltage_mv')) return buildDurability(rows, config);
  if (headers.includes('FC_CurrOut') && headers.includes('FC_VoltOut')) return buildVehicle(rows, config);
  if (headers.some((header) => /实际电流|电堆电流/.test(String(header))) && headers.some((header) => /实际电压|总电压|电堆电压/.test(String(header)))) return buildStack(rows, config);
  return null;
}
