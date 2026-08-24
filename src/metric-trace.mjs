export const METRIC_TRACE_SCHEMA = 'h2-testlens.metric-trace.v1';

const COMMON_FIELDS = Object.freeze({
  completenessPct: ['timestamp_s', 'current_a', 'voltage_v', 'temperature_c', 'pressure_bar', 'flow_slpm', 'leak_ppm'],
  peakPowerW: ['power_w', 'current_a', 'voltage_v', 'timestamp_s'],
  energyConsumedWh: ['power_w', 'current_a', 'voltage_v', 'timestamp_s'],
  hydrogenVolumeNl: ['flow_slpm', 'timestamp_s'],
  specificEnergyKWhPerNm3: ['power_w', 'current_a', 'voltage_v', 'flow_slpm', 'timestamp_s'],
  peakTemperatureC: ['temperature_c', 'timestamp_s'],
  peakPressureBar: ['pressure_bar', 'timestamp_s'],
  peakLeakPpm: ['leak_ppm', 'timestamp_s'],
  minimumHydrogenPurityPct: ['hydrogen_purity_pct', 'timestamp_s'],
  steadyVoltageMeanV: ['voltage_v', 'phase'],
  steadyVoltageStdV: ['voltage_v', 'phase'],
  pressureDriftBarPerMin: ['pressure_bar', 'timestamp_s'],
  efficiency_pct: ['efficiency_pct']
});

const DATASET_FIELDS = Object.freeze({
  averageCurrentA: ['current_a'],
  averageVoltageV: ['voltage_v'],
  peakPowerKw: ['power_w', 'current_a', 'voltage_v'],
  averageCellVoltageV: ['avg_cell_voltage_v', 'cell_*_v'],
  cellSpreadMaxV: ['cell_*_v'],
  cellValueStdV: ['cell_*_v'],
  averageNetPowerKw: ['net_power_kw'],
  steadyVoltageMeanV: ['avg_cell_voltage_v', 'min_cell_voltage_v'],
  steadyVoltageStdV: ['avg_cell_voltage_v'],
  minimumKohm: ['isolation_kohm'],
  averageCellVoltageMv: ['average_cell_voltage_mv'],
  averageDeviationMv: ['average_deviation_mv'],
  voltageVariance: ['voltage_variance'],
  netPowerKw: ['net_power_kw']
});

function numeric(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function validSourceHash(value) {
  const text = String(value || '').trim();
  return /^SHA-256:[0-9a-f]{64}$/i.test(text) ? text : null;
}

function metricValue(metrics, datasetMetrics, name) {
  if (Object.prototype.hasOwnProperty.call(metrics || {}, name)) return metrics[name];
  return datasetMetrics?.[name];
}

function sourceFieldsFor(name, schema = {}, dataset = null) {
  const fields = COMMON_FIELDS[name] || DATASET_FIELDS[name] || [];
  return [...new Set(fields.map((field) => field))];
}

function fieldLabel(field, schema = {}, dataset = null) {
  if (dataset?.sourceFieldMap?.[field]) return dataset.sourceFieldMap[field];
  if (schema.mapping?.[field]) return schema.mapping[field];
  return field;
}

function safeLocator(rows = [], fields = [], metricValueToMatch = null) {
  const fileIds = new Map();
  const tokenFor = (value) => {
    const key = String(value || 'session-unknown');
    if (!fileIds.has(key)) fileIds.set(key, 'file-' + (fileIds.size + 1));
    return fileIds.get(key);
  };
  rows.forEach((row) => tokenFor(row.source_file || row.session_id));
  const usable = rows.filter((row) => fields.some((field) => {
    if (field.includes('*')) return Object.keys(row || {}).some((key) => key.startsWith(field.replace('*', '')));
    return row?.[field] !== null && row?.[field] !== undefined;
  }));
  const selected = metricValueToMatch === null
    ? usable
    : usable.filter((row) => Object.values(row || {}).some((value) => numeric(value) === numeric(metricValueToMatch)));
  const rowsForLocator = selected.length ? selected : usable;
  const groups = new Map();
  for (const row of rowsForLocator) {
    const token = tokenFor(row.source_file || row.session_id);
    const rowNumber = numeric(row.source_row_index);
    const time = numeric(row.session_timestamp_s ?? row.timestamp_s);
    const group = groups.get(token) || { fileToken: token, rowStart: rowNumber === null ? null : rowNumber + 1, rowEnd: rowNumber === null ? null : rowNumber + 1, timeStartS: time, timeEndS: time, count: 0 };
    if (rowNumber !== null) {
      group.rowStart = group.rowStart === null ? rowNumber + 1 : Math.min(group.rowStart, rowNumber + 1);
      group.rowEnd = group.rowEnd === null ? rowNumber + 1 : Math.max(group.rowEnd, rowNumber + 1);
    }
    if (time !== null) {
      group.timeStartS = group.timeStartS === null ? time : Math.min(group.timeStartS, time);
      group.timeEndS = group.timeEndS === null ? time : Math.max(group.timeEndS, time);
    }
    group.count += 1;
    groups.set(token, group);
  }
  return {
    status: groups.size ? 'bound' : 'not_bound',
    groups: [...groups.values()],
    privacy: 'file tokens and row/time ranges only; raw file names and values are excluded'
  };
}

function traceEntry(name, value, fields, rows, schema, dataset, sourceHash, sourceId, evidenceClass, derivation = 'direct') {
  const numericValue = numeric(value);
  const locator = safeLocator(rows, fields, derivation === 'direct' ? numericValue : null);
  return {
    metricName: name,
    value: value ?? null,
    sourceFields: fields,
    sourceFieldLabels: fields.map((field) => field.includes('*') ? field : fieldLabel(field, schema, dataset)),
    evidenceId: 'metric-trace:' + name,
    sourceHash: sourceHash || null,
    sourceHashStatus: sourceHash ? 'bound' : 'not_bound',
    sourceId: sourceId || null,
    evidenceClass,
    locator,
    derivation,
    status: locator.status === 'bound' && sourceHash ? 'bound' : 'partial'
  };
}

export function buildMetricTrace({ metrics = {}, rows = [], schema = {}, source = {}, dataset = null, config = {} } = {}) {
  const datasetMetrics = dataset?.metrics || {};
  const names = [...new Set([...Object.keys(COMMON_FIELDS), ...Object.keys(DATASET_FIELDS)].filter((name) => metricValue(metrics, datasetMetrics, name) !== undefined))];
  const sourceHash = validSourceHash(source.sourceHash || source.rawDataHash);
  const sourceId = source.sourceId || null;
  const evidenceClass = config.evaluationMode === 'descriptive_only' ? 'descriptive_only' : config.approvalStatus === 'approved' ? 'approved_evidence' : 'risk_screening_or_demo';
  const trace = Object.fromEntries(names.map((name) => {
    const value = metricValue(metrics, datasetMetrics, name);
    const fields = sourceFieldsFor(name, schema, dataset);
    const derivation = ['specificEnergyKWhPerNm3', 'energyConsumedWh', 'hydrogenVolumeNl', 'completenessPct'].includes(name) ? 'derived_or_aggregate' : 'direct_or_aggregate';
    return [name, traceEntry(name, value, fields, rows, schema, dataset, sourceHash, sourceId, evidenceClass, derivation)];
  }));
  return { schemaVersion: METRIC_TRACE_SCHEMA, sourceId, sourceHash: sourceHash || null, sourceHashStatus: sourceHash ? 'bound' : 'not_bound', evidenceClass, metrics: trace, boundary: '字段级证据定位用于复核，不等于标准符合性、实验室认可或企业放行证据。' };
}

export function publicMetricTrace(trace = null) {
  if (!trace || typeof trace !== 'object') return null;
  return {
    schemaVersion: trace.schemaVersion || METRIC_TRACE_SCHEMA,
    sourceHash: trace.sourceHash || null,
    sourceHashStatus: trace.sourceHashStatus || 'not_bound',
    sourceId: trace.sourceId || null,
    evidenceClass: trace.evidenceClass || 'unknown',
    boundary: trace.boundary || null,
    metrics: Object.fromEntries(Object.entries(trace.metrics || {}).map(([name, item]) => [name, {
      metricName: item.metricName || name,
      value: item.value ?? null,
      sourceFields: item.sourceFields || [],
      sourceFieldLabels: item.sourceFieldLabels || [],
      evidenceId: item.evidenceId || null,
      sourceHash: item.sourceHash || null,
      sourceHashStatus: item.sourceHashStatus || 'not_bound',
      sourceId: item.sourceId || trace.sourceId || null,
      evidenceClass: item.evidenceClass || trace.evidenceClass || 'unknown',
      locator: item.locator ? { status: item.locator.status, groups: item.locator.groups || [], privacy: item.locator.privacy } : { status: 'not_bound', groups: [], privacy: 'not bound' },
      derivation: item.derivation || 'unknown',
      status: item.status || 'partial'
    }]))
  };
}
