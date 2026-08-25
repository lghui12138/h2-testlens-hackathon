
const safeMax = (values, fallback = null) => {
  let maximum = fallback;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    maximum = maximum === null || maximum === undefined ? value : Math.max(maximum, value);
  }
  return maximum;
};

const safeMin = (values, fallback = null) => {
  let minimum = fallback === undefined ? null : fallback;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    minimum = minimum === null || minimum === undefined ? value : Math.min(minimum, value);
  }
  return minimum;
};
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const timeOf = (row) => finite(row?.session_timestamp_s ?? row?.timestamp_s);

const groupBySession = (rows, sessionField) => {
  const groups = [];
  const bySession = new Map();
  rows.forEach((row, index) => {
    const sessionId = String(row?.[sessionField] ?? row?.session_id ?? 'session-1');
    let group = bySession.get(sessionId);
    if (!group) {
      group = { sessionId, items: [] };
      bySession.set(sessionId, group);
      groups.push(group);
    }
    group.items.push({ row, index });
  });
  return groups;
};

const rateSummary = (points, valueField) => {
  const rates = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const previousTime = timeOf(previous.row);
    const currentTime = timeOf(current.row);
    const previousValue = finite(previous.row[valueField]);
    const currentValue = finite(current.row[valueField]);
    const deltaS = currentTime !== null && previousTime !== null ? currentTime - previousTime : null;
    if (deltaS === null || deltaS <= 0 || previousValue === null || currentValue === null) continue;
    rates.push((currentValue - previousValue) / deltaS);
  }
  return {
    maxRampUpPerS: safeMax(rates, 0),
    maxRampDownPerS: safeMax(rates.map((rate) => -rate), 0)
  };
};

const gapSummary = (points, maxGapS) => {
  const intervals = [];
  for (let index = 1; index < points.length; index += 1) {
    const previousTime = timeOf(points[index - 1].row);
    const currentTime = timeOf(points[index].row);
    if (previousTime === null || currentTime === null) continue;
    const deltaS = currentTime - previousTime;
    if (deltaS > 0) intervals.push(deltaS);
  }
  const gapCount = Number.isFinite(maxGapS) ? intervals.filter((deltaS) => deltaS > maxGapS).length : 0;
  return {
    intervalCount: intervals.length,
    maximumIntervalS: safeMax(intervals),
    gapCount
  };
};

const inBandHold = (points, startIndex, target, band, settleWindowS, maxGapS, actualField) => {
  const startTimeS = timeOf(points[startIndex]?.row);
  const requiredWindowS = Math.max(0, Number(settleWindowS) || 0);
  for (let index = startIndex; index < points.length; index += 1) {
    const actual = finite(points[index].row[actualField]);
    const time = timeOf(points[index].row);
    if (actual === null || time === null || Math.abs(actual - target) > band) continue;
    let previousTime = time;
    let lastTime = time;
    for (let next = index + 1; next < points.length; next += 1) {
      const nextTime = timeOf(points[next].row);
      const nextActual = finite(points[next].row[actualField]);
      if (nextTime === null || nextActual === null || nextTime <= previousTime) break;
      if (Number.isFinite(maxGapS) && nextTime - previousTime > maxGapS) break;
      if (Math.abs(nextActual - target) > band) break;
      previousTime = nextTime;
      lastTime = nextTime;
      if (lastTime - time >= requiredWindowS) return { settledAtS: time, holdEndS: lastTime, startTimeS };
    }
    if (requiredWindowS === 0) return { settledAtS: time, holdEndS: time, startTimeS };
  }
  return null;
};

/**
 * Detects command changes and describes measured response. It deliberately
 * accepts arbitrary canonical fields so vehicle current commands and generic
 * power setpoints use the same traceable event logic.
 */
export function analyzeSetpointEvents(inputRows, options = {}) {
  const enabled = options.enabled === true;
  const commandField = String(options.commandField || 'power_setpoint_w');
  const actualField = String(options.actualField || 'power_w');
  const actualPowerField = options.actualPowerField ? String(options.actualPowerField) : null;
  const sessionField = String(options.sessionField || 'session_id');
  const unit = String(options.unit || 'W');
  const powerUnit = String(options.powerUnit || 'W');
  const minimumStep = Number.isFinite(Number(options.minimumStep)) && Number(options.minimumStep) > 0 ? Number(options.minimumStep) : 1;
  const responseBandPct = Number.isFinite(Number(options.responseBandPct)) && Number(options.responseBandPct) >= 0 ? Number(options.responseBandPct) : 5;
  const minimumResponseBand = Number.isFinite(Number(options.minimumResponseBand)) && Number(options.minimumResponseBand) >= 0 ? Number(options.minimumResponseBand) : 1;
  const settleWindowS = Number.isFinite(Number(options.settleWindowS)) && Number(options.settleWindowS) >= 0 ? Number(options.settleWindowS) : 5;
  const maxGapS = Number.isFinite(Number(options.maxGapS)) && Number(options.maxGapS) > 0 ? Number(options.maxGapS) : null;
  const rows = Array.isArray(inputRows) ? inputRows : [];
  const base = {
    enabled,
    status: enabled ? 'not_available' : 'not_enabled',
    commandField,
    actualField,
    actualPowerField,
    unit,
    powerUnit,
    sampleCount: rows.length,
    commandSampleCount: 0,
    actualSampleCount: 0,
    eventCount: 0,
    settledEventCount: 0,
    unsettledEventCount: 0,
    dataGapCount: 0,
    maximumIntervalS: null,
    events: [],
    boundary: '描述性动态事件指标；不含标准限值、不执行合格/不合格判定。'
  };
  if (!enabled) return base;
  if (!rows.length) return { ...base, evidence: '没有输入记录，未执行动态事件分析。' };
  const commandSampleCount = rows.filter((row) => finite(row?.[commandField]) !== null).length;
  const actualSampleCount = rows.filter((row) => finite(row?.[actualField]) !== null).length;
  if (!commandSampleCount || !actualSampleCount) {
    return {
      ...base,
      commandSampleCount,
      actualSampleCount,
      missingFields: [
        ...(commandSampleCount ? [] : [commandField]),
        ...(actualSampleCount ? [] : [actualField])
      ],
      evidence: `动态事件分析需要设定字段 ${commandField} 和实测字段 ${actualField}；当前未同时提供。`
    };
  }
  const events = [];
  let eventSequence = 0;
  let maximumIntervalS = null;
  let dataGapCount = 0;
  for (const group of groupBySession(rows, sessionField)) {
    const points = group.items;
    const gaps = gapSummary(points, maxGapS);
    maximumIntervalS = maximumIntervalS === null ? gaps.maximumIntervalS : Math.max(maximumIntervalS, gaps.maximumIntervalS ?? 0);
    dataGapCount += gaps.gapCount;
    for (let index = 1; index < points.length; index += 1) {
      const previous = finite(points[index - 1].row[commandField]);
      const current = finite(points[index].row[commandField]);
      if (previous === null || current === null || Math.abs(current - previous) < minimumStep) continue;
      const previousTime = timeOf(points[index - 1].row);
      const currentTime = timeOf(points[index].row);
      if (previousTime === null || currentTime === null || currentTime <= previousTime) continue;
      if (Number.isFinite(maxGapS) && currentTime - previousTime > maxGapS) continue;
      events.push({ group, points, index, sequence: ++eventSequence, from: previous, to: current });
    }
  }
  const eventResults = events.map(({ group, points, index, sequence, from, to }) => {
    const nextEvent = events.find((candidate) => candidate.group === group && candidate.index > index);
    const endIndex = nextEvent ? nextEvent.index : points.length - 1;
    const eventPoints = points.slice(index, endIndex + 1);
    const commandStartS = timeOf(points[index].row);
    const stepSize = Math.abs(to - from);
    const responseBand = Math.max(minimumResponseBand, stepSize * responseBandPct / 100);
    const settled = inBandHold(eventPoints, 0, to, responseBand, settleWindowS, maxGapS, actualField);
    const actualValues = eventPoints.map(({ row }) => finite(row[actualField])).filter((value) => value !== null);
    const actualPowerValues = actualPowerField ? eventPoints.map(({ row }) => finite(row[actualPowerField])).filter((value) => value !== null) : [];
    const actualRate = rateSummary(eventPoints, actualField);
    const actualPowerRate = actualPowerField ? rateSummary(eventPoints, actualPowerField) : { maxRampUpPerS: null, maxRampDownPerS: null };
    const gaps = gapSummary(eventPoints, maxGapS);
    const targetError = actualValues.length ? safeMax(actualValues.map((value) => Math.abs(value - to))) : null;
    const actualAtCommand = finite(points[index].row[actualField]);
    const durationS = timeOf(points.at(-1)?.row) !== null && commandStartS !== null ? Math.max(0, timeOf(points.at(-1).row) - commandStartS) : null;
    const validSpanS = eventPoints.length >= 2 ? eventPoints.reduce((sum, point, pointIndex) => {
      if (!pointIndex) return sum;
      const previousTime = timeOf(eventPoints[pointIndex - 1].row);
      const currentTime = timeOf(point.row);
      return previousTime !== null && currentTime !== null && currentTime > previousTime ? sum + currentTime - previousTime : sum;
    }, 0) : 0;
    const coveragePct = durationS !== null && durationS > 0 ? validSpanS / durationS * 100 : eventPoints.length >= 2 ? 100 : null;
    const status = settled ? 'settled' : actualValues.length < 2 ? 'insufficient_data' : gaps.gapCount ? 'not_settled_gap' : 'not_settled';
    return {
      id: `${group.sessionId}:${sequence}`,
      sessionId: group.sessionId,
      direction: to > from ? 'up' : 'down',
      commandStartS,
      commandFrom: from,
      commandTo: to,
      stepSize,
      responseBand,
      settleWindowS,
      actualAtCommand,
      actualMinimum: safeMin(actualValues),
      actualMaximum: safeMax(actualValues),
      maximumAbsoluteError: targetError,
      responseTimeS: settled && settled.settledAtS !== null ? settled.settledAtS - commandStartS : null,
      settledAtS: settled?.settledAtS ?? null,
      holdEndS: settled?.holdEndS ?? null,
      durationS,
      validDataCoveragePct: coveragePct,
      dataGapCount: gaps.gapCount,
      maximumIntervalS: gaps.maximumIntervalS,
      maxActualRampUpPerS: actualRate.maxRampUpPerS,
      maxActualRampDownPerS: actualRate.maxRampDownPerS,
      actualPowerMinimum: safeMin(actualPowerValues),
      actualPowerMaximum: safeMax(actualPowerValues),
      maxActualPowerRampUpPerS: actualPowerRate.maxRampUpPerS,
      maxActualPowerRampDownPerS: actualPowerRate.maxRampDownPerS,
      status
    };
  });
  const settledEventCount = eventResults.filter((event) => event.status === 'settled').length;
  return {
    ...base,
    status: eventResults.length ? 'calculated' : 'no_events',
    commandSampleCount,
    actualSampleCount,
    eventCount: eventResults.length,
    settledEventCount,
    unsettledEventCount: eventResults.filter((event) => event.status !== 'settled').length,
    dataGapCount,
    maximumIntervalS,
    events: eventResults,
    evidence: eventResults.length
      ? `识别 ${eventResults.length} 个设定变化事件；完成 ${settledEventCount} 个进入响应带并满足 ${settleWindowS} s 保持窗口的描述性响应统计。`
      : `未发现绝对变化达到 ${minimumStep} ${unit} 的设定变化事件。`
  };
}
