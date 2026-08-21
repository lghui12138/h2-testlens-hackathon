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
  const timeOnly = values.some((value) => /^(\d{1,2}):(\d{2})(?::\d{2})?$/.test(String(value ?? '').trim()));
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

function linearTrend(points) {
  if (points.length < 2) return { slopePerDay: null, intercept: null };
  const xMean = mean(points.map(([x]) => x));
  const yMean = mean(points.map(([, y]) => y));
  const denominator = points.reduce((sum, [x]) => sum + (x - xMean) ** 2, 0);
  if (!denominator) return { slopePerDay: 0, intercept: yMean };
  const slopePerSecond = points.reduce((sum, [x, y]) => sum + (x - xMean) * (y - yMean), 0) / denominator;
  return { slopePerDay: slopePerSecond * 86400, intercept: yMean - slopePerSecond * xMean };
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
  const nonMonotonicCount = timestamps.slice(1).reduce((count, value, index) => count + (value < timestamps[index] ? 1 : 0), 0);
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
    missingCells,
    totalCells,
    completenessPct: totalCells ? ((totalCells - missingCells) / totalCells) * 100 : 0,
    hasEnoughRows: rows.length >= 2,
    usable: rows.length >= 2 && timestamps.length >= 2 && duplicateTimestampCount === 0 && nonMonotonicCount === 0
  };
}

function compliance(config, datasetLabel) {
  return {
    status: 'NOT_READY',
    label: `${datasetLabel} · 企业规则待配置`,
    approvalStatus: config.approvalStatus || 'pending',
    standardRefs: config.standardRefs || [],
    methodId: config.methodId || null,
    revision: config.revision || null,
    applicationScope: config.applicationScope || datasetLabel,
    intendedUse: config.intendedUse || '企业资料结构适配与人工复核前处理',
    missingProfileFields: config.approvalStatus === 'approved' ? [] : ['approved profile'],
    requiredMetadata: config.requiredMetadata || [],
    missingMetadata: [],
    requiredMeasurements: [],
    missingMeasurements: [],
    requiredPhases: [],
    missingPhases: [],
    acceptanceCriteria: config.acceptanceCriteria || {}
  };
}

function commonSchema(mapping, fieldCount = Object.keys(mapping).length) {
  return {
    headers: Object.values(mapping).filter(Boolean),
    mapping,
    conversions: Object.fromEntries(Object.keys(mapping).map((field) => [field, identity])),
    missingHeaders: Object.entries(mapping).filter(([, source]) => !source).map(([field]) => field),
    missingOptionalHeaders: [],
    mappingWarnings: [],
    mappedCount: Object.values(mapping).filter(Boolean).length,
    fieldCount
  };
}

function workflow(dataset, quality, issues, targetConfigured = true) {
  const hardDataIssue = !quality.usable || quality.missingHeaders.length > 0;
  const steps = [
    { id: 'dataset', label: '企业数据集识别', status: 'ready', evidence: dataset.label },
    { id: 'data', label: '原始数据质量', status: hardDataIssue ? 'blocked' : quality.completenessPct >= 98 ? 'ready' : 'needs_review', evidence: `${quality.rowCount} 条记录 · 完整率 ${quality.completenessPct.toFixed(1)}%` },
    { id: 'traceability', label: '字段与时间轴追溯', status: quality.duplicateTimestampCount || quality.nonMonotonicCount ? 'needs_review' : 'ready', evidence: `重复时间戳 ${quality.duplicateTimestampCount} 条 · 逆序 ${quality.nonMonotonicCount} 次` },
    { id: 'rules', label: '企业规则/目标工况', status: targetConfigured ? 'needs_review' : 'needs_input', evidence: targetConfigured ? '已使用当前会话参数' : '尚未提供目标电流或目标工况参数' },
    { id: 'human', label: '工程师复核与签核', status: 'needs_input', evidence: '企业批准规则、异常处置和签核仍需补齐' }
  ];
  const status = hardDataIssue ? 'BLOCKED_DATA' : 'NOT_READY';
  return { status, nextAction: hardDataIssue ? '先修复时间轴或关键字段，再重跑。' : targetConfigured ? '复核分段、趋势和异常证据，再补企业批准规则。' : '输入目标工况/报警规则后重新分析。', steps };
}

function vehicleSegments(rows, targetCurrents, toleranceA, minimumDurationS) {
  const segments = [];
  let active = null;
  const close = (endIndex) => {
    if (!active) return;
    const end = rows[endIndex - 1] ?? rows.at(-1);
    if (end && active.start && end.timestamp_s !== null) {
      const durationS = end.timestamp_s - active.start.timestamp_s;
      const sampleRows = rows.slice(active.startIndex, endIndex);
      const tailRows = sampleRows.filter((row) => row.timestamp_s >= active.start.timestamp_s + Math.min(minimumDurationS, durationS));
      if (durationS >= minimumDurationS) {
        const values = (field, source = tailRows) => source.map((row) => row[field]).filter((value) => value !== null);
        segments.push({
          targetCurrentA: active.target,
          startS: active.start.timestamp_s,
          endS: end.timestamp_s,
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
    const current = row.current_a;
    const target = targetCurrents.find((candidate) => current !== null && Math.abs(current - candidate) <= toleranceA);
    if (target === undefined) { close(index); return; }
    if (!active || active.target !== target) { close(index); active = { target, start: row, startIndex: index }; }
  });
  close(rows.length);
  return segments;
}

function buildDurability(rows, config) {
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
    source_file: row.source_file || null
  }));
  const required = ['timestamp_s', 'target_power_kw', 'average_cell_voltage_mv', 'average_deviation_mv', 'voltage_variance'];
  const quality = qualityFor(normalized, required);
  quality.usable = normalized.length >= 2 && quality.missingHeaders.length === 0 && quality.invalidValueCounts.timestamp_s === 0;
  const reports = Array.isArray(config.durabilityReports) ? config.durabilityReports : [];
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
  const verdict = issues.some((item) => item.severity === 'critical') ? 'FAIL' : 'WARN';
  const mapping = { target_power_kw: '目标功率（kW）', humidity_pct: '湿度', temperature_c: '温度', net_power_kw: '净输出功率', current_a: '电堆电流', average_cell_voltage_mv: '平均单体电压', average_deviation_mv: '离均差', voltage_variance: '电压方差', coolant_in_temp_c: '冷却水入口温度', coolant_out_temp_c: '冷却水出口温度', hfr: 'HFR', lfr: 'LFR' };
  const dataset = {
    kind: 'durability',
    label: '台架耐久数据',
    sourceContract: 'T02-02 · 台架耐久数据统计及预警',
    reports,
    points: normalized,
    targetPowers: [...new Set(normalized.map((point) => point.target_power_kw).filter((value) => value !== null))].sort((a, b) => a - b),
    rules: { maxDeviationMv: Number.isFinite(maxDeviationMv) ? maxDeviationMv : null, minAverageCellVoltageMv: Number.isFinite(minAverageCellVoltageMv) ? minAverageCellVoltageMv : null },
    sourceFieldMap: mapping
  };
  const meanMetric = (field) => mean(normalized.map((point) => point[field]).filter((value) => value !== null));
  const metrics = { sampleCount: normalized.length, durationS: 0, completenessPct: quality.completenessPct, peakPowerW: Math.max(...normalized.map((point) => point.net_power_kw).filter((value) => value !== null), 0) * 1000, steadyVoltageMeanV: meanMetric('average_cell_voltage_mv') === null ? null : meanMetric('average_cell_voltage_mv') / 1000, steadyVoltageStdV: std(normalized.map((point) => point.average_cell_voltage_mv).filter((value) => value !== null)), peakTemperatureC: Math.max(...normalized.map((point) => point.temperature_c).filter((value) => value !== null), 0) || null, peakPressureBar: null, peakLeakPpm: null, hydrogenVolumeNl: null, energyConsumedWh: null, specificEnergyKWhPerNm3: null, minimumHydrogenPurityPct: null, pressureDriftBarPerMin: 0, steadyWindow: '台架耐久功率点', steadySampleCount: normalized.length };
  const workflowResult = workflow(dataset, quality, issues, Object.keys(rules).length > 0);
  return { dataset, datasetType: 'durability', generatedAt: new Date().toISOString(), config: { ...config, datasetType: 'durability' }, rows: normalized, metrics, quality, schema: commonSchema(mapping, Object.keys(mapping).length), compliance: compliance(config, dataset.label), uncertainty: { status: 'not_configured', method: null, coverageFactor: null, metrics: {}, missingFields: [] }, workflow: workflowResult, phases: dataset.targetPowers.map((power) => ({ phase: `目标功率${power}kW`, count: normalized.filter((point) => point.target_power_kw === power).length, startS: null, endS: null, durationS: 0 })), issues, verdict, narrative: verdict === 'FAIL' ? '原始耐久报告或当前规则触发高优先级问题，已阻断放行判断。' : '已完成耐久功率点统计；当前结果仍需企业预警规则和工程师复核。', source: { type: 'docx', rowCount: normalized.length, requiredFields: required } };
}

function buildVehicle(rows, config) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const mapping = Object.fromEntries(VEHICLE_FIELDS.map(([field, source]) => [field, headers.includes(source) ? source : null]));
  const missing = Object.entries(mapping).filter(([, source]) => !source).map(([field]) => field);
  if (missing.length >= 5) return null;
  const times = relativeTimes(rows.map((row) => row[mapping.timestamp_s]));
  const normalized = rows.map((row, index) => ({
    timestamp_s: times[index],
    phase: row[mapping.main_status] === undefined ? '车辆时序' : `状态${String(row[mapping.main_status] ?? '').trim() || '未知'}`,
    main_status: num(row[mapping.main_status]),
    current_a: num(row[mapping.current_a]),
    voltage_v: num(row[mapping.voltage_v]),
    net_power_kw: num(row[mapping.net_power_kw]),
    min_cell_voltage_v: num(row[mapping.min_cell_voltage_v]),
    min_cell_channel: num(row[mapping.min_cell_channel]),
    avg_cell_voltage_v: num(row[mapping.avg_cell_voltage_v]),
    avg_cell_dev_mv: num(row[mapping.avg_cell_dev_mv]),
    cell_voltage_variance: num(row[mapping.cell_voltage_variance]),
    isolation_kohm: num(row[mapping.isolation_kohm]),
    runtime_h: num(row[mapping.runtime_h])
  }));
  const required = Object.keys(mapping).filter((field) => !['main_status', 'min_cell_channel', 'runtime_h'].includes(field));
  const quality = qualityFor(normalized, required);
  quality.missingHeaders = missing;
  quality.usable = quality.usable && missing.length === 0;
  const stateCounts = Object.fromEntries([...new Set(normalized.map((row) => row.main_status).filter((value) => value !== null))].sort((a, b) => a - b).map((state) => [String(state), normalized.filter((row) => row.main_status === state).length]));
  const isolationRows = normalized.filter((row) => [4, 8].includes(row.main_status) && row.isolation_kohm !== null && row.isolation_kohm > 0 && row.isolation_kohm < 9999 && row.isolation_kohm !== 65535);
  const buckets = new Map();
  for (const row of isolationRows) {
    const bucket = Math.floor(row.timestamp_s / 600);
    const key = `${bucket}:${row.main_status}`;
    const current = buckets.get(key) || { bucket, status: row.main_status, values: [], startS: row.timestamp_s, endS: row.timestamp_s };
    current.values.push(row.isolation_kohm); current.startS = Math.min(current.startS, row.timestamp_s); current.endS = Math.max(current.endS, row.timestamp_s); buckets.set(key, current);
  }
  const insulationPoints = [...buckets.values()].map((item) => ({ bucket: item.bucket, status: item.status, startS: item.startS, endS: item.endS, minimumKohm: Math.min(...item.values), sampleCount: item.values.length })).sort((a, b) => a.startS - b.startS);
  const insulationForecast = Object.fromEntries([350, 250].map((threshold) => {
    const points = insulationPoints.map((point) => [point.endS, point.minimumKohm]);
    return [String(threshold), { threshold, trend: linearTrend(points), forecast: forecastToThreshold(points, threshold) }];
  }));
  const targetCurrents = (config.vehicleTargets || []).map(Number).filter(Number.isFinite);
  const performancePoints = vehicleSegments(normalized, targetCurrents, Number(config.vehicleCurrentToleranceA ?? 5), Number(config.vehicleMinimumDurationS ?? 180));
  const issues = [];
  if (missing.length) issues.push({ severity: 'critical', code: 'VEHICLE_SCHEMA_MISSING', title: '车辆燃电信号不完整', evidence: `缺少：${missing.join('、')}`, recommendation: '补充企业定义的车辆信号后再进行趋势和预警判定。' });
  if (quality.duplicateTimestampCount || quality.nonMonotonicCount) issues.push({ severity: 'warn', code: 'VEHICLE_TIME_SEQUENCE', title: '车辆时间轴需要复核', evidence: `重复时间戳 ${quality.duplicateTimestampCount} 条，逆序 ${quality.nonMonotonicCount} 次`, recommendation: '确认多文件拼接、采样时钟和时区口径。' });
  const invalidIsolation = normalized.filter((row) => row.isolation_kohm === null || row.isolation_kohm <= 0 || row.isolation_kohm >= 9999 || row.isolation_kohm === 65535).length;
  if (invalidIsolation) issues.push({ severity: 'info', code: 'ISOLATION_FILTERED', title: '绝缘阻值已按企业规则过滤', evidence: `${invalidIsolation} 条记录未进入 10 分钟最小值统计`, recommendation: '正式报告中保留过滤规则，并核对传感器无效码定义。' });
  if (!targetCurrents.length) issues.push({ severity: 'warn', code: 'VEHICLE_TARGETS_MISSING', title: '未提供性能统计目标电流', evidence: '当前只完成运行信号和绝缘阻值统计，未生成目标电流段平均点', recommendation: '输入目标电流、允许波动范围和最短持续时间后重新分析。' });
  if (!issues.length) issues.push({ severity: 'info', code: 'VEHICLE_DATA_READY', title: '车辆燃电数据已完成结构化分析', evidence: `${normalized.length} 条记录已完成时间轴、运行状态、性能信号和绝缘阻值处理`, recommendation: '进入企业规则确认和工程师签核。' });
  const verdict = issues.some((item) => item.severity === 'critical') ? 'FAIL' : 'WARN';
  const metrics = {
    sampleCount: normalized.length,
    durationS: Math.max(...normalized.map((row) => row.timestamp_s).filter((value) => value !== null), 0),
    completenessPct: quality.completenessPct,
    peakPowerW: Math.max(...normalized.map((row) => row.net_power_kw).filter((value) => value !== null), 0) * 1000,
    steadyVoltageMeanV: mean(normalized.map((row) => row.avg_cell_voltage_v).filter((value) => value !== null)),
    steadyVoltageStdV: std(normalized.map((row) => row.avg_cell_voltage_v).filter((value) => value !== null)),
    peakTemperatureC: null,
    peakPressureBar: null,
    peakLeakPpm: null,
    hydrogenVolumeNl: null,
    energyConsumedWh: null,
    specificEnergyKWhPerNm3: null,
    minimumHydrogenPurityPct: null,
    pressureDriftBarPerMin: 0,
    steadyWindow: '企业车辆运行信号',
    steadySampleCount: normalized.length
  };
  const dataset = {
    kind: 'vehicle',
    label: '企业车辆燃电数据',
    sourceContract: 'T02-02 · 车辆运行数据统计需求',
    stateCounts,
    targetCurrents,
    targetToleranceA: Number(config.vehicleCurrentToleranceA ?? 5),
    minimumDurationS: Number(config.vehicleMinimumDurationS ?? 180),
    performancePoints,
    insulation: { points: insulationPoints, forecast: insulationForecast, validCount: isolationRows.length, invalidCount: invalidIsolation },
    signals: Object.fromEntries(VEHICLE_FIELDS.slice(1).map(([field]) => [field, { source: mapping[field], count: normalized.filter((row) => row[field] !== null).length }]))
  };
  const schema = commonSchema(mapping, VEHICLE_FIELDS.length);
  const workflowResult = workflow(dataset, quality, issues, targetCurrents.length > 0);
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
    compliance: compliance(config, dataset.label),
    uncertainty: { status: 'not_applicable', method: null, coverageFactor: null, metrics: {}, missingFields: [] },
    workflow: workflowResult,
    phases,
    issues,
    verdict,
    narrative: verdict === 'FAIL' ? '车辆数据关键字段不完整，已阻断后续判定。' : '已按企业车辆数据需求完成运行信号、目标电流段和绝缘阻值的结构化统计；报警阈值与正式结论仍需企业规则和工程师签核。',
    source: { type: 'csv', rowCount: normalized.length, requiredFields: Object.keys(mapping) }
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

function durationForSegment(start, end, sampleCount, samplePeriodS) {
  if (Number.isFinite(samplePeriodS) && samplePeriodS > 0 && sampleCount >= 2) return { durationS: (sampleCount - 1) * samplePeriodS, source: 'configured_sample_period' };
  const startS = start?.timestamp_s; const endS = end?.timestamp_s;
  return { durationS: Number.isFinite(startS) && Number.isFinite(endS) ? Math.max(0, endS - startS) : 0, source: 'timestamp' };
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
  if (!conditions.length) return { platforms: [], stableSegments: [], performancePoints: [] };
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
  const chooseCondition = (row) => conditions.map((condition) => ({ condition, distance: row.current_a === null ? Infinity : Math.abs(row.current_a - condition.targetCurrentA) }))
    .filter((item) => item.distance <= currentTolerance).sort((a, b) => a.distance - b.distance)[0] || null;
  const platforms = []; let active = null; let platformSequence = 0;
  const closePlatform = (endIndex) => {
    if (!active) return;
    const end = rows[endIndex - 1] || rows.at(-1); const sampleRows = rows.slice(active.startIndex, endIndex); const duration = durationForSegment(active.start, end, sampleRows.length, samplePeriodS);
    const condition = active.condition; const values = (field) => sampleRows.map((row) => row[field]).filter((value) => value !== null);
    platformSequence += 1;
    platforms.push({
      ...condition,
      platformId: `${condition.conditionId}-${platformSequence}`,
      platformIndex: platformSequence,
      conditionId: condition.conditionId,
      targetCurrentA: condition.targetCurrentA,
      targetCurrentDensity: condition.targetCurrentDensity,
      toleranceA: currentTolerance,
      startS: active.start.timestamp_s,
      endS: end?.timestamp_s ?? null,
      durationS: end?.timestamp_s !== null && active.start.timestamp_s !== null ? Math.max(0, end.timestamp_s - active.start.timestamp_s) : 0,
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
    const match = chooseCondition(row);
    if (!match) { closePlatform(index); return; }
    if (!active || active.condition.conditionId !== match.condition.conditionId) { closePlatform(index); active = { condition: match.condition, start: row, startIndex: index }; }
  });
  closePlatform(rows.length);
  const stableSegments = [];
  for (const platform of platforms) {
    let stable = null;
    const closeStable = (endIndex) => {
      if (!stable) return;
      const end = platform.rows[endIndex - 1] || platform.rows.at(-1); const sampleRows = platform.rows.slice(stable.startIndex, endIndex); const duration = durationForSegment(stable.start, end, sampleRows.length, samplePeriodS);
      const baseStatus = duration.durationS < minStableS ? 'stable_too_short' : duration.durationS < formalSampleS ? 'short_stable' : 'stable_valid';
      let selectedRows = sampleRows;
      if (baseStatus === 'stable_valid' && formalSampleS > 0) {
        if (Number.isFinite(samplePeriodS) && samplePeriodS > 0) selectedRows = sampleRows.slice(-Math.max(2, Math.floor(formalSampleS / samplePeriodS) + 1));
        else selectedRows = sampleRows.filter((row) => row.timestamp_s >= (end?.timestamp_s ?? 0) - formalSampleS);
      }
      const values = (field, source = selectedRows) => source.map((row) => row[field]).filter((value) => value !== null);
      stableSegments.push({
        platformId: platform.platformId,
        platformIndex: platform.platformIndex,
        conditionId: platform.conditionId,
        startS: stable.start.timestamp_s,
        endS: end?.timestamp_s ?? null,
        durationS: end?.timestamp_s !== null && stable.start.timestamp_s !== null ? Math.max(0, end.timestamp_s - stable.start.timestamp_s) : 0,
        effectiveDurationS: duration.durationS,
        selectedDurationS: durationForSegment(selectedRows[0], selectedRows.at(-1), selectedRows.length, samplePeriodS).durationS,
        durationSource: duration.source,
        sampleCount: sampleRows.length,
        selectedSampleCount: selectedRows.length,
        parameterComplete: stable.parameterComplete,
        status: stable.parameterComplete ? baseStatus : 'parameter_incomplete',
        selectionPolicy: baseStatus === 'stable_valid' ? (samplePosition.includes('末') ? `末端${formalSampleS}s` : samplePosition) : '全部有效稳定样本',
        selected: false,
        averageCurrentA: mean(values('current_a')),
        averageCurrentDensity: mean(values('current_density_mAcm2')),
        averageCellVoltageV: mean(values('avg_cell_voltage_v')),
        averageNetPowerKw: mean(values('power_kw')),
        missingParameters: stable.missing,
        rows: sampleRows,
        selectedRows
      });
      stable = null;
    };
    platform.rows.forEach((row, index) => {
      const evaluated = evaluateStableRow(row, platform, rules);
      if (!evaluated.ok) { closeStable(index); return; }
      if (!stable) stable = { start: row, startIndex: index, parameterComplete: evaluated.parameterComplete, missing: evaluated.missing };
    });
    closeStable(platform.rows.length);
  }
  for (const platform of platforms) {
    const selected = stableSegments.filter((segment) => segment.platformId === platform.platformId && ['stable_valid', 'short_stable'].includes(segment.status)).at(-1);
    if (selected) selected.selected = true;
  }
  const performancePoints = stableSegments.filter((segment) => segment.selected).map((segment) => ({ ...segment, status: segment.status === 'short_stable' ? 'short_stable' : 'valid' }));
  return { platforms: platforms.map(({ rows: _rows, ...platform }) => platform), stableSegments: stableSegments.map(({ rows: _rows, selectedRows: _selectedRows, ...segment }) => segment), performancePoints: performancePoints.map(({ rows: _rows, selectedRows: _selectedRows, ...point }) => point) };
}

function buildStack(rows, config) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cellHeaders = headers.filter((header) => /^(单片电压\d+|CELL\d+)/i.test(String(header).trim()));
  const mapping = {
    timestamp_s: findHeader(headers, ['测试时间', '时间']),
    current_a: findHeader(headers, ['实际电流（A）', '实际电流(A)', '电堆电流']),
    voltage_v: findHeader(headers, ['总电压（V）', '总电压(V)', '实际电压（V）', '实际电压', '电堆电压']),
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
    anode_flow_slpm: findHeader(headers, ['阳极流量（SLPM）', '阳极气体流量(L/Min)', '阳极气体流量']),
    cathode_flow_slpm: findHeader(headers, ['阴极流量（SLPM）', '阴极气体流量(L/Min)', '阴极气体流量']),
    coolant_flow_lpm: findHeader(headers, ['循环水流量（L/min）', '电堆循环水流量(L/Min)']),
    internal_resistance: findHeader(headers, ['内阻', '内阻（mΩ）', '内阻(mΩ)'])
  };
  const required = ['timestamp_s', 'current_a', 'voltage_v'];
  const missing = required.filter((field) => !mapping[field]);
  if (missing.length >= 2) return null;
  const times = relativeTimes(rows.map((row) => row[mapping.timestamp_s]));
  const normalized = rows.map((row, index) => {
    const cells = Object.fromEntries(cellHeaders.map((header, cellIndex) => [`cell_${cellIndex + 1}_v`, num(row[header])]));
    return {
      timestamp_s: times[index],
      phase: '电堆时序',
      current_a: num(row[mapping.current_a]),
      voltage_v: num(row[mapping.voltage_v]),
      power_kw: num(row[mapping.power_kw]),
      avg_cell_voltage_v: num(row[mapping.avg_cell_voltage_v]),
      min_cell_voltage_v: num(row[mapping.min_cell_voltage_v]),
      max_cell_voltage_v: num(row[mapping.max_cell_voltage_v]),
      current_density_mAcm2: num(row[mapping.current_density_mAcm2]),
      temperature_c: num(row[mapping.temperature_c]),
      pressure_kpa: num(row[mapping.pressure_kpa]),
      flow_slpm: num(row[mapping.flow_slpm]),
      leak_ppm: num(row[mapping.leak_ppm]),
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
      anode_flow_slpm: num(row[mapping.anode_flow_slpm]),
      cathode_flow_slpm: num(row[mapping.cathode_flow_slpm]),
      coolant_flow_lpm: num(row[mapping.coolant_flow_lpm]),
      internal_resistance: num(row[mapping.internal_resistance]),
      anode_flow_resistance_kpa: num(row[mapping.anode_in_pressure_kpa]) !== null && num(row[mapping.anode_out_pressure_kpa]) !== null ? num(row[mapping.anode_in_pressure_kpa]) - num(row[mapping.anode_out_pressure_kpa]) : null,
      cathode_flow_resistance_kpa: num(row[mapping.cathode_in_pressure_kpa]) !== null && num(row[mapping.cathode_out_pressure_kpa]) !== null ? num(row[mapping.cathode_in_pressure_kpa]) - num(row[mapping.cathode_out_pressure_kpa]) : null,
      coolant_flow_resistance_kpa: num(row[mapping.coolant_in_pressure_kpa]) !== null && num(row[mapping.coolant_out_pressure_kpa]) !== null ? num(row[mapping.coolant_in_pressure_kpa]) - num(row[mapping.coolant_out_pressure_kpa]) : null,
      coolant_temperature_difference_c: num(row[mapping.coolant_out_temp_c]) !== null && num(row[mapping.coolant_in_temp_c]) !== null ? num(row[mapping.coolant_out_temp_c]) - num(row[mapping.coolant_in_temp_c]) : null,
      cells
    };
  });
  const requiredQuality = ['timestamp_s', 'current_a', 'voltage_v', ...cellHeaders.map((_, index) => `cell_${index + 1}_v`)];
  const quality = qualityFor(normalized, requiredQuality);
  quality.missingHeaders = missing;
  quality.usable = quality.usable && missing.length === 0;
  const cellValues = normalized.flatMap((row) => Object.values(row.cells).filter((value) => value !== null));
  const configuredCellCount = Math.max(...normalized.map((row) => row.cell_count).filter((value) => value !== null), 0);
  const rowsWithConfiguredCount = normalized.filter((row) => row.cell_count !== null).length;
  const powerValues = normalized.map((row) => row.power_kw).filter((value) => value !== null);
  const averageCellValues = normalized.map((row) => row.avg_cell_voltage_v).filter((value) => value !== null);
  const cellSpread = normalized.map((row) => {
    const values = Object.values(row.cells).filter((value) => value !== null);
    return values.length ? Math.max(...values) - Math.min(...values) : null;
  }).filter((value) => value !== null);
  const summary = (field) => {
    const values = normalized.map((row) => row[field]).filter((value) => value !== null);
    return { mean: mean(values), min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null, std: std(values) };
  };
  const parameterConfig = config.parameterConfig || null;
  const parameterAnalysis = stackPlatforms(normalized, parameterConfig, config);
  const issues = [];
  if (parameterConfig && !parameterConfig.ok) issues.push({ severity: 'critical', code: 'PARAMETER_WORKBOOK_INVALID', title: '参数工作簿校验未通过', evidence: parameterConfig.errors.join('；'), recommendation: '修正参数代码、单位、偏差和目标工况后再处理。' });
  if (missing.length) issues.push({ severity: 'critical', code: 'STACK_SCHEMA_MISSING', title: '电堆时序关键字段不完整', evidence: `缺少：${missing.join('、')}`, recommendation: '补充时间、电流、电压和单片电压通道后再进行平台/稳定性分析。' });
  if (!cellHeaders.length) issues.push({ severity: 'warn', code: 'STACK_CELL_CHANNELS_MISSING', title: '未发现单片电压通道', evidence: '当前工作表可用于堆级电压/电流和工况统计，但不能完成单片一致性判定', recommendation: '导入包含单片电压列的原始测试表后再做单片异常结论。' });
  if (configuredCellCount && configuredCellCount !== cellHeaders.length) issues.push({ severity: 'warn', code: 'CELL_CHANNEL_COUNT_MISMATCH', title: '单片数量与导出通道数不一致', evidence: `参数表片数 ${configuredCellCount}，导出单片通道 ${cellHeaders.length} 个；有效配置记录 ${rowsWithConfiguredCount} 条`, recommendation: '确认测试台导出列、片数参数和有效通道范围，不能静默截断。' });
  if (quality.duplicateTimestampCount) issues.push({ severity: 'warn', code: 'STACK_TIMESTAMP_RESOLUTION', title: '时间戳分辨率不足以支撑逐秒排序', evidence: `重复时间戳 ${quality.duplicateTimestampCount} 条，当前时间列需要结合采样序号复核`, recommendation: '改用带秒/毫秒的原始时间列或补充采样周期参数。' });
  if (parameterConfig?.ok && parameterAnalysis.performancePoints.some((point) => point.status === 'short_stable')) issues.push({ severity: 'warn', code: 'SHORT_STABLE_WINDOW', title: '稳定区间不足默认统计时长', evidence: `有 ${parameterAnalysis.performancePoints.filter((point) => point.status === 'short_stable').length} 个稳定点达到最短稳定时间但不足默认 ${parameterConfig.parameters.find((item) => item.code === 'DEFAULT_SAMPLE_TIME')?.target ?? 120} s`, recommendation: '保留该点并标记警告；如需正式长窗口曲线，应延长稳定采样。' });
  if (parameterConfig?.ok && !parameterAnalysis.performancePoints.length) issues.push({ severity: 'warn', code: 'STABLE_WINDOW_MISSING', title: '未形成满足参数的稳定区间', evidence: `已读取 ${parameterAnalysis.platforms.length} 个候选平台，但没有稳定区间达到最短稳定时间或参数完整条件`, recommendation: '检查目标工况、稳定判定参数、采样周期和原始时间分辨率。' });
  if (!issues.length) issues.push({ severity: 'info', code: 'STACK_DATA_READY', title: '电堆时序数据已完成结构化分析', evidence: `${normalized.length} 条记录、${cellHeaders.length} 个单片通道已进入统计`, recommendation: '进入企业方法确认和工程师签核。' });
  const verdict = issues.some((item) => item.severity === 'critical') ? 'FAIL' : 'WARN';
  const dataset = {
    kind: 'stack',
    label: '燃料电池电堆时序数据',
    sourceContract: 'T02-03 · 电堆时序数据处理任务说明书',
    cellChannelCount: cellHeaders.length,
    configuredCellCount,
    cellHeaders,
    parameterConfig: parameterConfig ? { ok: parameterConfig.ok, parameterSheet: parameterConfig.parameterSheet, targetSheet: parameterConfig.targetSheet, errors: parameterConfig.errors, warnings: parameterConfig.warnings } : null,
    platforms: parameterAnalysis.platforms,
    stableSegments: parameterAnalysis.stableSegments,
    performancePoints: parameterAnalysis.performancePoints,
    metrics: {
      averageCurrentA: mean(normalized.map((row) => row.current_a).filter((value) => value !== null)),
      averageVoltageV: mean(normalized.map((row) => row.voltage_v).filter((value) => value !== null)),
      peakPowerKw: powerValues.length ? Math.max(...powerValues) : null,
      averageCellVoltageV: mean(averageCellValues),
      cellSpreadMaxV: cellSpread.length ? Math.max(...cellSpread) : null,
      cellSpreadMeanV: mean(cellSpread),
      cellValueStdV: std(cellValues),
      currentDensityMean: mean(normalized.map((row) => row.current_density_mAcm2).filter((value) => value !== null)),
      anodeFlowResistanceKpa: summary('anode_flow_resistance_kpa'),
      cathodeFlowResistanceKpa: summary('cathode_flow_resistance_kpa'),
      coolantFlowResistanceKpa: summary('coolant_flow_resistance_kpa'),
      coolantTemperatureDifferenceC: summary('coolant_temperature_difference_c'),
      internalResistance: summary('internal_resistance')
    },
    sourceFieldMap: {
      ...mapping,
      anode_flow_resistance_kpa: '计算：阳极入口压力 - 阳极出口压力',
      cathode_flow_resistance_kpa: '计算：阴极入口压力 - 阴极出口压力',
      coolant_flow_resistance_kpa: '计算：冷却液入口压力 - 冷却液出口压力',
      coolant_temperature_difference_c: '计算：冷却液出口温度 - 冷却液入口温度'
    }
  };
  const metrics = {
    sampleCount: normalized.length,
    durationS: Math.max(...normalized.map((row) => row.timestamp_s).filter((value) => value !== null), 0),
    completenessPct: quality.completenessPct,
    peakPowerW: powerValues.length ? Math.max(...powerValues) * 1000 : null,
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
    steadySampleCount: normalized.length
  };
  const schema = commonSchema({ ...mapping, ...Object.fromEntries(cellHeaders.map((header, index) => [`cell_${index + 1}_v`, header])) }, Object.keys(mapping).length + cellHeaders.length);
  const workflowResult = workflow(dataset, quality, issues, Boolean(parameterConfig?.ok && parameterConfig.targetConditions?.length));
  return {
    dataset,
    datasetType: 'stack',
    generatedAt: new Date().toISOString(),
    config: { ...config, datasetType: 'stack' },
    rows: normalized,
    metrics,
    quality,
    schema,
    compliance: compliance(config, dataset.label),
    uncertainty: { status: 'not_configured', method: null, coverageFactor: null, metrics: {}, missingFields: [] },
    workflow: workflowResult,
    phases: [{ phase: '电堆时序', count: normalized.length, startS: 0, endS: metrics.durationS, durationS: metrics.durationS }],
    issues,
    verdict,
    narrative: verdict === 'FAIL' ? '电堆时序数据或参数工作簿未通过校验，已阻断正式统计。' : parameterConfig?.ok ? `已完成 ${parameterAnalysis.platforms.length} 个电流平台和 ${parameterAnalysis.performancePoints.length} 个有效稳定区间的处理；正式符合性结论仍需工程师签核。` : '已完成电堆时序字段映射、时间轴质量检查和单片电压一致性摘要；目标工况、稳定区间和正式异常阈值仍需参数工作簿与工程师签核。',
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
