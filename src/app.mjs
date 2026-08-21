import { analyzeRows, parseCSV, publicAnalysis, reportMarkdown, DEFAULT_CONFIG } from './analyzer.mjs';
import { evidenceBundle, localEvidenceDraft } from './ai-draft.mjs';
import { compareResults } from './compare.mjs';
import { CUSTOM_PROFILE_ID, DEVICE_PROFILES, getProfile, profilesFromPackage } from './profiles.mjs';
import { appendHistory, clearHistory, readHistory } from './history.mjs';
import { sha256Hex } from './provenance.mjs';
import { buildEnterpriseWorkbook, parseDataWorkbook, parseParameterWorkbook, workbookArrayBuffer } from './excel-workflow.mjs';
import { addNativeChartToWorkbook } from './xlsx-charts.mjs';
import { parseDurabilityDocx } from './docx-workflow.mjs';
import { durabilityAlertPayload, sendFeishuAlert } from './feishu-alerts.mjs';

const $ = (selector) => document.querySelector(selector);
const state = { rows: [], fileName: '演示样本 · electrolyzer_run_017.csv', result: null, aiDraft: null, baselineResult: null, comparison: null, history: [], profileCatalog: [...DEVICE_PROFILES], fieldMapping: {}, profileOrganization: '内置演示配置', rawDataHash: null, parameterConfig: null, durabilityReports: [] };

const fmt = (value, digits = 1) => value === null || value === undefined || Number.isNaN(value) ? '—' : Number(value).toFixed(digits);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

function ensureExtendedMetadataFields() {
  const container = $('.metadata-details');
  if (!container || $('#metadata-test-plan')) return;
  container.insertAdjacentHTML('beforeend', '<label>测试计划/工况序列<input id="metadata-test-plan" type="text" placeholder="计划编号、稳态/动态/启停段"></label><label>数据采集计划<textarea id="metadata-acquisition" rows="2" placeholder="采样频率、同步时钟、通道/质量状态"></textarea></label><label>试验前检查记录<textarea id="metadata-precheck" rows="2" placeholder="设备、气液路、传感器、安全状态检查记录"></textarea></label><label>仪器精度/量程要求<textarea id="metadata-instrument-accuracy" rows="2" placeholder="电压、电流、流量、压力、温度、纯度仪器精度和量程"></textarea></label><label>环境/安全条件<textarea id="metadata-environment" rows="2" placeholder="环境温度、湿度、压力及安全前置条件"></textarea></label><label>不确定度/误差策略<textarea id="metadata-uncertainty" rows="2" placeholder="测量不确定度、误差或缺失值处理策略"></textarea></label><label>原始数据引用/哈希<input id="metadata-raw-ref" type="text" placeholder="文件编号、对象路径或 SHA-256"></label>');
}

async function bindRawDataHash(text) {
  const hash = await sha256Hex(text);
  if (!hash) return null;
  state.rawDataHash = hash;
  const input = $('#metadata-raw-ref');
  if (input && (!input.value.trim() || input.dataset.generated === 'true')) {
    input.value = `SHA-256:${hash}`;
    input.dataset.generated = 'true';
  }
  return hash;
}

ensureExtendedMetadataFields();

function configFromUI() {
  const profileId = $('#profile-select').value;
  const profile = profileId === CUSTOM_PROFILE_ID ? null : getProfile(profileId, state.profileCatalog);
  const optionalNumber = (id) => { const value = $(`#${id}`)?.value?.trim(); return value ? Number(value) : null; };
  return {
    maxTemperatureC: Number($('#max-temperature').value) || DEFAULT_CONFIG.maxTemperatureC,
    maxPressureBar: Number($('#max-pressure').value) || DEFAULT_CONFIG.maxPressureBar,
    maxLeakPpm: Number($('#max-leak').value) || DEFAULT_CONFIG.maxLeakPpm,
    maxVoltageStdV: Number($('#max-voltage-std').value) || DEFAULT_CONFIG.maxVoltageStdV,
    maxPressureDriftBarPerMin: Number($('#max-pressure-drift').value) || DEFAULT_CONFIG.maxPressureDriftBarPerMin,
    profileId,
    profileName: profile?.name ?? '自定义阈值',
    profileSource: profile?.source ?? '用户当前会话输入',
    profileOrganization: state.profileOrganization,
    approvalStatus: profile?.approvalStatus ?? 'pending',
    applicationScope: profile?.applicationScope ?? null,
    intendedUse: profile?.intendedUse ?? null,
    methodId: profile?.methodId ?? null,
    revision: profile?.revision ?? null,
    standardRefs: profile?.standardRefs ?? [],
    requiredMetadata: profile?.requiredMetadata ?? [],
    requiredMeasurements: profile?.requiredMeasurements ?? [],
    requiredPhases: profile?.requiredPhases ?? [],
    acceptanceCriteria: profile?.acceptanceCriteria ?? {},
    uncertaintyModelRequired: profile?.uncertaintyModelRequired ?? false,
    uncertaintyModel: profile?.uncertaintyModel ?? null,
    fieldMapping: state.fieldMapping,
    vehicleTargets: ($('#vehicle-targets')?.value || '').split(',').map((value) => Number(value.trim())).filter(Number.isFinite),
    vehicleCurrentToleranceA: Number($('#vehicle-tolerance')?.value) || 5,
    vehicleMinimumDurationS: Number($('#vehicle-duration')?.value) || 180,
    parameterConfig: state.parameterConfig,
    durabilityReports: state.durabilityReports,
    durabilityRules: { maxDeviationMv: optionalNumber('durability-max-deviation'), minAverageCellVoltageMv: optionalNumber('durability-min-cell-voltage') },
    testMetadata: {
      testPurpose: $('#metadata-purpose').value.trim(),
      testPlanRef: $('#metadata-test-plan').value.trim(),
      acquisitionPlan: $('#metadata-acquisition').value.trim(),
      preCheckRecord: $('#metadata-precheck').value.trim(),
      instrumentIds: $('#metadata-instruments').value.trim(),
      instrumentAccuracy: $('#metadata-instrument-accuracy').value.trim(),
      calibrationRefs: $('#metadata-calibration').value.trim(),
      environment: $('#metadata-environment').value.trim(),
      operator: $('#metadata-operator').value.trim(),
      formulaRefs: $('#metadata-formulas').value.trim(),
      uncertaintyPolicy: $('#metadata-uncertainty').value.trim(),
      rawDataRef: $('#metadata-raw-ref').value.trim(),
      signoff: $('#metadata-signoff').value.trim()
    }
  };
}

function renderProfileOptions() {
  $('#profile-select').innerHTML = `${state.profileCatalog.map((profile) => `<option value="${profile.id}">${profile.name}</option>`).join('')}<option value="${CUSTOM_PROFILE_ID}">自定义阈值 · 当前会话</option>`;
}

function applyProfile(profileId) {
  const profile = getProfile(profileId, state.profileCatalog);
  $('#profile-select').value = profileId;
  if (profileId !== CUSTOM_PROFILE_ID) {
    $('#max-temperature').value = profile.thresholds.maxTemperatureC;
    $('#max-pressure').value = profile.thresholds.maxPressureBar;
    $('#max-leak').value = profile.thresholds.maxLeakPpm;
    $('#max-voltage-std').value = profile.thresholds.maxVoltageStdV;
    $('#max-pressure-drift').value = profile.thresholds.maxPressureDriftBarPerMin;
    const references = profile.standardRefs?.length ? ` · 标准 ${profile.standardRefs.map((reference) => reference.id).join('、')}` : '';
    $('#profile-note').textContent = `${state.profileOrganization} · ${profile.source} · ${profile.approvalStatus || '未指定审批状态'}${references} · ${profile.description}`;
  } else {
    $('#profile-note').textContent = '自定义阈值只在当前浏览器会话生效，正式标准需经过企业审批。';
  }
}

function applyProfilePackage(packageResult) {
  state.profileCatalog = packageResult.profiles;
  state.fieldMapping = packageResult.fieldMapping;
  state.profileOrganization = packageResult.organization;
  renderProfileOptions();
  applyProfile(state.profileCatalog[0].id);
  $('#profile-import-status').textContent = `${packageResult.organization} · 已导入 ${packageResult.profiles.length} 个 profile`;
  if (state.rows.length) render(analyzeRows(state.rows, configFromUI()));
}

function verdictLabel(verdict) {
  return verdict === 'PASS' ? '通过' : verdict === 'WARN' ? '需复核' : '未通过';
}

function renderMetrics(result) {
  const { metrics } = result;
  if (result.datasetType === 'vehicle') {
    const dataset = result.dataset;
    const low350 = dataset.insulation.points.filter((point) => point.minimumKohm < 350).length;
    const low250 = dataset.insulation.points.filter((point) => point.minimumKohm < 250).length;
    const cards = [
      ['自动判定', verdictLabel(result.verdict), result.verdict.toLowerCase(), '企业规则待签核'],
      ['数据完整率', `${fmt(metrics.completenessPct)}%`, metrics.completenessPct >= 98 ? 'good' : 'warn', `${metrics.sampleCount} 条车辆记录`],
      ['运行时长', `${fmt(metrics.durationS / 3600, 1)} h`, 'neutral', 'Timestamp 相对首条记录'],
      ['峰值净功率', `${fmt(metrics.peakPowerW / 1000, 1)} kW`, 'neutral', 'FC_NetPwrOut'],
      ['平均单体电压', `${fmt(metrics.steadyVoltageMeanV, 3)} V`, 'neutral', 'FC_AvgCellVoltage'],
      ['有效绝缘窗口', `${dataset.insulation.points.length}`, 'good', `${dataset.insulation.validCount} 条有效记录`],
      ['低于 350 kΩ', `${low350}`, low350 ? 'warn' : 'good', '10 分钟窗口最小值'],
      ['低于 250 kΩ', `${low250}`, low250 ? 'danger' : 'good', '10 分钟窗口最小值']
    ];
    $('#metric-grid').innerHTML = cards.map(([label, value, tone, note]) => `<article class="metric-card ${tone}"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join('');
    return;
  }
  if (result.datasetType === 'stack') {
    const dataset = result.dataset;
    const cards = [
      ['自动判定', verdictLabel(result.verdict), result.verdict.toLowerCase(), '企业规则待签核'],
      ['数据完整率', `${fmt(metrics.completenessPct)}%`, metrics.completenessPct >= 98 ? 'good' : 'warn', `${metrics.sampleCount} 条时序记录`],
      ['时间跨度', `${fmt(metrics.durationS / 3600, 1)} h`, 'neutral', '测试时间相对首条记录'],
      ['峰值功率', `${fmt(dataset.metrics.peakPowerKw, 2)} kW`, 'neutral', '功率列'],
      ['平均单片电压', `${fmt(dataset.metrics.averageCellVoltageV, 3)} V`, 'neutral', '平均电压列'],
      ['最大单片极差', `${fmt(dataset.metrics.cellSpreadMaxV, 3)} V`, 'warn', '单片通道 max-min'],
      ['单片通道', `${dataset.cellChannelCount}`, dataset.configuredCellCount && dataset.configuredCellCount !== dataset.cellChannelCount ? 'warn' : 'good', `片数参数 ${dataset.configuredCellCount || '—'}`],
      ['时间戳重复', `${result.quality.duplicateTimestampCount}`, result.quality.duplicateTimestampCount ? 'warn' : 'good', '采样分辨率复核']
    ];
    $('#metric-grid').innerHTML = cards.map(([label, value, tone, note]) => `<article class="metric-card ${tone}"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join('');
    return;
  }
  if (result.datasetType === 'durability') {
    const dataset = result.dataset;
    const lowVoltage = dataset.points.filter((point) => point.averageCellVoltageMv !== null && dataset.rules.minAverageCellVoltageMv !== null && point.averageCellVoltageMv < dataset.rules.minAverageCellVoltageMv).length;
    const highDeviation = dataset.points.filter((point) => point.averageDeviationMv !== null && dataset.rules.maxDeviationMv !== null && point.averageDeviationMv > dataset.rules.maxDeviationMv).length;
    const cards = [
      ['自动判定', verdictLabel(result.verdict), result.verdict.toLowerCase(), '原始耐久结果 + 当前规则'],
      ['功率点记录', `${dataset.points.length}`, 'neutral', `${dataset.targetPowers.length} 个目标功率`],
      ['峰值净功率', `${fmt(metrics.peakPowerW / 1000, 1)} kW`, 'neutral', '净输出功率'],
      ['最低平均单体', `${fmt(Math.min(...dataset.points.map((point) => point.averageCellVoltageMv).filter((value) => value !== null), 0), 0)} mV`, lowVoltage ? 'warn' : 'good', dataset.rules.minAverageCellVoltageMv === null ? '阈值未配置' : `阈值 ${dataset.rules.minAverageCellVoltageMv} mV`],
      ['最大离均差', `${fmt(Math.max(...dataset.points.map((point) => point.averageDeviationMv).filter((value) => value !== null), 0), 0)} mV`, highDeviation ? 'warn' : 'good', dataset.rules.maxDeviationMv === null ? '阈值未配置' : `阈值 ${dataset.rules.maxDeviationMv} mV`],
      ['原始报告', `${dataset.reports.length}`, 'neutral', dataset.reports.some((report) => String(report.metadata?.测试结果 || '').includes('未通过')) ? '含未通过报告' : '未发现未通过标记']
    ];
    $('#metric-grid').innerHTML = cards.map(([label, value, tone, note]) => `<article class="metric-card ${tone}"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join('');
    return;
  }
  const cards = [
    ['自动判定', verdictLabel(result.verdict), result.verdict.toLowerCase(), '当前规则下的首轮分流'],
    ['数据完整率', `${fmt(metrics.completenessPct)}%`, metrics.completenessPct >= 98 ? 'good' : 'warn', `${metrics.sampleCount} 条记录`],
    ['峰值功率', `${fmt(metrics.peakPowerW)} W`, 'neutral', '电流 × 电压'],
    ['产氢量', `${fmt(metrics.hydrogenVolumeNl, 3)} NL`, 'neutral', '流量梯形积分'],
    ['单位制氢电耗', `${fmt(metrics.specificEnergyKWhPerNm3, 3)} kWh/Nm³`, 'neutral', '电能 ÷ 产氢量'],
    ['最低氢气纯度', `${fmt(metrics.minimumHydrogenPurityPct, 3)}%`, metrics.minimumHydrogenPurityPct === null ? 'warn' : 'neutral', metrics.minimumHydrogenPurityPct === null ? '未提供纯度字段' : '纯度最低值'],
    ['稳态电压波动', `${fmt(metrics.steadyVoltageStdV, 3)} V`, metrics.steadyVoltageStdV <= result.config.maxVoltageStdV ? 'good' : 'warn', '标准差'],
    ['峰值温度', `${fmt(metrics.peakTemperatureC)} °C`, metrics.peakTemperatureC <= result.config.maxTemperatureC ? 'good' : 'danger', `阈值 ${result.config.maxTemperatureC} °C`],
    ['峰值压力', `${fmt(metrics.peakPressureBar)} bar`, metrics.peakPressureBar <= result.config.maxPressureBar ? 'good' : 'danger', `阈值 ${result.config.maxPressureBar} bar`],
    ['峰值泄漏监测', `${fmt(metrics.peakLeakPpm)} ppm`, metrics.peakLeakPpm <= result.config.maxLeakPpm ? 'good' : 'danger', `阈值 ${result.config.maxLeakPpm} ppm`],
    ['压力漂移', `${fmt(metrics.pressureDriftBarPerMin, 2)} bar/min`, Math.abs(metrics.pressureDriftBarPerMin) <= result.config.maxPressureDriftBarPerMin ? 'good' : 'warn', '线性趋势']
  ];
  $('#metric-grid').innerHTML = cards.map(([label, value, tone, note]) => `<article class="metric-card ${tone}"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join('');
}

function renderIssues(result) {
  const severityLabel = { critical: '高优先级', warn: '建议复核', info: '信息' };
  $('#issue-list').innerHTML = result.issues.map((item) => `<article class="issue ${item.severity}"><div class="issue-mark">${item.severity === 'critical' ? '!' : item.severity === 'warn' ? '~' : 'i'}</div><div><div class="issue-heading"><b>${escapeHtml(item.title)}</b><span>${severityLabel[item.severity]}</span></div><p>${escapeHtml(item.evidence)}</p><small>建议动作：${escapeHtml(item.recommendation)}</small></div></article>`).join('');
  $('#issue-count').textContent = `${result.issues.filter((item) => item.severity !== 'info').length} 项需要关注`;
}

function renderPhases(result) {
  $('#phase-list').innerHTML = result.phases.map((phase) => `<div class="phase-row"><span class="phase-dot"></span><span>${escapeHtml(phase.phase)}</span><b>${phase.count} samples</b><small>${fmt(phase.durationS, 0)} s</small></div>`).join('');
}

function renderComparison(comparison = state.comparison) {
  if (!comparison) {
    $('#compare-status').textContent = '未加载基线';
    $('#compare-summary').textContent = '载入演示基线，查看当前批次相对变化。';
    $('#compare-table').innerHTML = '';
    $('#compare-risks').innerHTML = '';
    return;
  }
  $('#compare-status').textContent = comparison.verdictTransition;
  $('#compare-summary').textContent = comparison.summary;
  $('#compare-table').innerHTML = comparison.changes.map((change) => `<div class="compare-row"><span>${escapeHtml(change.label)}</span><b>${change.current === null ? '—' : `${fmt(change.current, change.digits)} ${change.unit}`}</b><small class="${change.direction}">${change.delta === null ? '—' : `${change.delta > 0 ? '+' : ''}${fmt(change.delta, change.digits)} ${change.unit}`}</small></div>`).join('');
  const newRisk = comparison.newIssues.length ? `<div><b>新增</b>：${comparison.newIssues.map((item) => escapeHtml(item.title)).join('、')}</div>` : '<div><b>新增</b>：无</div>';
  const resolvedRisk = comparison.resolvedIssues.length ? `<div><b>已消除</b>：${comparison.resolvedIssues.map((item) => escapeHtml(item.title)).join('、')}</div>` : '<div><b>已消除</b>：无</div>';
  $('#compare-risks').innerHTML = `${newRisk}${resolvedRisk}`;
}

function renderHistory(history = state.history) {
  $('#history-status').textContent = `${history.length} 条摘要`;
  $('#history-list').innerHTML = history.length ? history.map((item) => `<div class="history-row"><span><b>${escapeHtml(item.fileName)}</b><small>${new Date(item.savedAt).toLocaleString('zh-CN')} · ${escapeHtml(item.config?.profileName ?? '未指定模板')}</small></span><strong class="${String(item.verdict).toLowerCase()}">${verdictLabel(item.verdict)}</strong></div>`).join('') : '<div class="history-empty">还没有保存批次。保存后只保留摘要，不保留原始行。</div>';
}

function renderSchema(result) {
  const fields = Object.keys(result.schema.mapping);
  $('#schema-table').innerHTML = fields.map((field) => {
    const source = result.schema.mapping[field];
    const transform = result.schema.conversions[field];
    return `<div class="schema-row"><code>${escapeHtml(field)}</code><span>${escapeHtml(source)}</span><small>${escapeHtml(transform?.label || '原单位')}</small></div>`;
  }).join('');
  $('#schema-warnings').innerHTML = result.schema.mappingWarnings.length ? result.schema.mappingWarnings.map((warning) => `<div>⚠ ${escapeHtml(warning)}</div>`).join('') : '';
}

function renderWorkflow(result) {
  const statusLabels = { ready: '已具备', needs_input: '待补齐', needs_review: '需复核', blocked: '已阻断' };
  const statusClass = (status) => status.replaceAll('_', '-');
  $('#workflow-status').textContent = result.workflow?.status || '未评估';
  $('#workflow-next').textContent = result.workflow?.nextAction || '需人工确认。';
  $('#workflow-list').innerHTML = (result.workflow?.steps || []).map((step) => `<div class="workflow-row ${statusClass(step.status)}"><span class="workflow-mark">${step.status === 'ready' ? '✓' : step.status === 'blocked' ? '!' : '·'}</span><span><b>${escapeHtml(step.label)}</b><small>${escapeHtml(step.evidence)}</small></span><em>${statusLabels[step.status] || step.status}</em></div>`).join('');
}

function drawChart(result) {
  const canvas = $('#trend-chart');
  const ctx = canvas.getContext('2d');
  const width = canvas.clientWidth * devicePixelRatio;
  const height = canvas.clientHeight * devicePixelRatio;
  canvas.width = width; canvas.height = height;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  const w = canvas.clientWidth; const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  if (result.datasetType) {
    const rows = result.rows.filter((row) => row.timestamp_s !== null);
    const pad = { left: 36, right: 18, top: 18, bottom: 28 };
    const series = result.datasetType === 'vehicle'
      ? [['current_a', '#ef8f62', '电流'], ['net_power_kw', '#5bd4c0', '净功率'], ['isolation_kohm', '#7c9df2', '绝缘']]
      : [['current_a', '#ef8f62', '电流'], ['avg_cell_voltage_v', '#5bd4c0', '平均单片电压'], ['power_kw', '#7c9df2', '功率']];
    const x = (index) => pad.left + (index / Math.max(rows.length - 1, 1)) * (w - pad.left - pad.right);
    const yFor = (field, value) => {
      const values = rows.map((row) => row[field]).filter((item) => item !== null);
      const min = Math.min(...values, 0); const max = Math.max(...values, 1); const span = max - min || 1;
      return h - pad.bottom - ((value - min) / span) * (h - pad.top - pad.bottom);
    };
    ctx.strokeStyle = 'rgba(154, 172, 184, .14)'; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i += 1) { const gy = pad.top + i * ((h - pad.top - pad.bottom) / 3); ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(w - pad.right, gy); ctx.stroke(); }
    series.forEach(([field, color]) => { ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.beginPath(); let started = false; rows.forEach((row, index) => { if (row[field] === null) return; const pointX = x(index); const pointY = yFor(field, row[field]); if (!started) { ctx.moveTo(pointX, pointY); started = true; } else ctx.lineTo(pointX, pointY); }); ctx.stroke(); });
    ctx.font = '11px Avenir Next, sans-serif';
    series.forEach(([field, color, label], index) => { ctx.fillStyle = color; ctx.fillRect(pad.left + index * 86, h - 13, 12, 2); ctx.fillText(label, pad.left + 18 + index * 86, h - 9); });
    return;
  }
  const pad = { left: 36, right: 18, top: 18, bottom: 28 };
  const rows = result.rows.filter((row) => row.timestamp_s !== null);
  const x = (index) => pad.left + (index / Math.max(rows.length - 1, 1)) * (w - pad.left - pad.right);
  const yTemp = (value) => h - pad.bottom - ((value - 20) / 70) * (h - pad.top - pad.bottom);
  const yPressure = (value) => h - pad.bottom - ((value - 20) / 15) * (h - pad.top - pad.bottom);
  ctx.strokeStyle = 'rgba(154, 172, 184, .14)'; ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) { const gy = pad.top + i * ((h - pad.top - pad.bottom) / 3); ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(w - pad.right, gy); ctx.stroke(); }
  const line = (field, color, mapper) => { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); rows.forEach((row, index) => { const value = row[field]; if (value === null) return; const pointX = x(index); const pointY = mapper(value); index ? ctx.lineTo(pointX, pointY) : ctx.moveTo(pointX, pointY); }); ctx.stroke(); };
  line('temperature_c', '#ef8f62', yTemp); line('pressure_bar', '#5bd4c0', yPressure);
  ctx.font = '11px Avenir Next, sans-serif'; ctx.fillStyle = '#a4b5bd'; ctx.fillText('°C', 8, pad.top + 3); ctx.fillText('bar', w - 28, pad.top + 3);
  ctx.fillStyle = '#ef8f62'; ctx.fillRect(pad.left, h - 13, 12, 2); ctx.fillText('温度', pad.left + 18, h - 9);
  ctx.fillStyle = '#5bd4c0'; ctx.fillRect(pad.left + 70, h - 13, 12, 2); ctx.fillText('压力', pad.left + 88, h - 9);
}

function drawEnterpriseChart(result) {
  const canvas = $('#enterprise-chart');
  if (!canvas || !result.datasetType) return;
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 640; const height = canvas.clientHeight || 245;
  canvas.width = width * dpr; canvas.height = height * dpr;
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  const pad = { left: 46, right: 24, top: 20, bottom: 32 };
  const plotW = width - pad.left - pad.right; const plotH = height - pad.top - pad.bottom;
  const grid = () => { ctx.strokeStyle = 'rgba(154,172,184,.16)'; ctx.lineWidth = 1; for (let i = 0; i < 4; i += 1) { const y = pad.top + i * plotH / 3; ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke(); } };
  const label = (value, x, y, color = '#71838a') => { ctx.fillStyle = color; ctx.font = '10px Avenir Next, sans-serif'; ctx.fillText(String(value), x, y); };
  if (result.datasetType === 'vehicle') {
    const points = result.dataset.insulation.points || [];
    if (!points.length) { label('暂无有效绝缘阻值窗口', pad.left, pad.top + 20); return; }
    const values = points.map((point) => point.minimumKohm); const max = Math.max(400, ...values); const min = Math.min(0, ...values); const span = max - min || 1;
    const x = (index) => pad.left + index / Math.max(points.length - 1, 1) * plotW; const y = (value) => pad.top + (max - value) / span * plotH;
    grid();
    for (const threshold of [350, 250]) { ctx.strokeStyle = threshold === 350 ? '#e0aa49' : '#c84e48'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(pad.left, y(threshold)); ctx.lineTo(width - pad.right, y(threshold)); ctx.stroke(); ctx.setLineDash([]); label(`${threshold} kΩ`, width - pad.right - 42, y(threshold) - 4, ctx.strokeStyle); }
    ctx.strokeStyle = '#5bd4c0'; ctx.lineWidth = 1.8; ctx.beginPath(); points.forEach((point, index) => { const px = x(index); const py = y(point.minimumKohm); index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke();
    points.forEach((point, index) => { ctx.fillStyle = point.status === 4 ? '#7c9df2' : '#5bd4c0'; ctx.beginPath(); ctx.arc(x(index), y(point.minimumKohm), 3.2, 0, Math.PI * 2); ctx.fill(); });
    label('绝缘阻值（kΩ）', pad.left, 12, '#13262d'); label('时间窗口', width - 60, height - 8);
    return;
  }
  if (result.datasetType === 'durability') {
    const points = (result.dataset.points || []).filter((point) => Number.isFinite(point.targetPowerKw) && Number.isFinite(point.averageCellVoltageMv));
    if (!points.length) { label('暂无可绘制的耐久功率点', pad.left, pad.top + 20); return; }
    const xValues = points.map((point) => point.targetPowerKw); const yValues = points.map((point) => point.averageCellVoltageMv); const xMin = Math.min(...xValues); const xMax = Math.max(...xValues); const yMin = Math.min(...yValues) - 10; const yMax = Math.max(...yValues) + 10; const xSpan = xMax - xMin || 1; const ySpan = yMax - yMin || 1;
    const x = (value) => pad.left + (value - xMin) / xSpan * plotW; const y = (value) => pad.top + (yMax - value) / ySpan * plotH;
    grid();
    const sorted = [...points].sort((a, b) => a.targetPowerKw - b.targetPowerKw); ctx.strokeStyle = '#5bd4c0'; ctx.lineWidth = 1.8; ctx.beginPath(); sorted.forEach((point, index) => { const px = x(point.targetPowerKw); const py = y(point.averageCellVoltageMv); index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke();
    points.forEach((point) => { const low = result.dataset.rules.minAverageCellVoltageMv !== null && point.averageCellVoltageMv < result.dataset.rules.minAverageCellVoltageMv; const high = result.dataset.rules.maxDeviationMv !== null && point.averageDeviationMv > result.dataset.rules.maxDeviationMv; ctx.fillStyle = low || high ? '#c84e48' : '#127f79'; ctx.beginPath(); ctx.arc(x(point.targetPowerKw), y(point.averageCellVoltageMv), 4, 0, Math.PI * 2); ctx.fill(); });
    label('平均单体电压（mV）', pad.left, 12, '#13262d'); label('目标功率（kW）', width - 84, height - 8); return;
  }
  const points = (result.dataset.performancePoints || []).filter((point) => Number.isFinite(point.averageCellVoltageV));
  if (!points.length) { label('暂无有效极化点；请导入目标工况参数并确认稳定区间', pad.left, pad.top + 20); return; }
  const xValues = points.map((point) => point.averageCurrentDensity ?? point.averageCurrentA).filter(Number.isFinite); const yValues = points.map((point) => point.averageCellVoltageV).filter(Number.isFinite);
  const xMin = Math.min(...xValues); const xMax = Math.max(...xValues); const yMin = Math.min(...yValues) - 0.01; const yMax = Math.max(...yValues) + 0.01; const xSpan = xMax - xMin || 1; const ySpan = yMax - yMin || 1;
  const x = (value) => pad.left + (value - xMin) / xSpan * plotW; const y = (value) => pad.top + (yMax - value) / ySpan * plotH;
  grid();
  const sorted = [...points].sort((a, b) => (a.averageCurrentDensity ?? a.averageCurrentA) - (b.averageCurrentDensity ?? b.averageCurrentA));
  ctx.strokeStyle = '#5bd4c0'; ctx.lineWidth = 1.8; ctx.beginPath(); sorted.forEach((point, index) => { const px = x(point.averageCurrentDensity ?? point.averageCurrentA); const py = y(point.averageCellVoltageV); index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke();
  points.forEach((point) => { const px = x(point.averageCurrentDensity ?? point.averageCurrentA); const py = y(point.averageCellVoltageV); ctx.fillStyle = point.status === 'short_stable' ? '#e0aa49' : '#127f79'; ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill(); });
  label(`平均单片电压（V）`, pad.left, 12, '#13262d'); label(`电流密度/电流`, width - 86, height - 8);
}

function renderReport(result, draft = state.aiDraft) {
  const status = verdictLabel(result.verdict);
  $('#report-status').textContent = draft ? '自动报告初稿' : `${status} · ${result.issues.length} 条结论`;
  if (draft?.draft) {
    $('#report-preview').innerHTML = `<div class="report-head"><span>REPORT DRAFT / STRUCTURED EVIDENCE</span><strong>${status}</strong></div><pre class="draft-text">${escapeHtml(draft.draft)}</pre><div class="report-foot">初稿只引用结构化测试证据；正式发布前仍需工程师签核。</div>`;
    return;
  }
  $('#report-preview').innerHTML = `<div class="report-head"><span>自动报告 / ${escapeHtml(state.fileName)}</span><strong>${status}</strong></div><h3>测试结论</h3><p>${escapeHtml(result.narrative)}</p><h3>异常与建议</h3><ul>${result.issues.map((item) => `<li><b>${escapeHtml(item.title)}</b>：${escapeHtml(item.evidence)}。${escapeHtml(item.recommendation)}</li>`).join('')}</ul><div class="report-foot">阈值、原始样本、计算指标和建议动作可追溯；正式报告需经工程师签核。</div>`;
}

function renderEnterprisePanel(result) {
  const panel = $('#enterprise-panel');
  if (!result.datasetType) { panel.hidden = true; return; }
  panel.hidden = false;
  const dataset = result.dataset;
  $('#enterprise-title').textContent = dataset.label;
  $('#enterprise-subtitle').textContent = result.datasetType === 'vehicle' ? '运行信号、目标电流段、绝缘阻值与趋势预警' : result.datasetType === 'durability' ? '耐久功率点、原始报告结果与可配置预警' : '字段映射、单片通道一致性与测试数据质量';
  $('#enterprise-contract').textContent = dataset.sourceContract;
  if (result.datasetType === 'vehicle') {
    const targets = $('#vehicle-targets');
    if (targets && !targets.dataset.initialized) { targets.value = dataset.targetCurrents.join(','); targets.dataset.initialized = 'true'; }
    const points = dataset.performancePoints.length
      ? dataset.performancePoints.map((point) => `<tr><td>${point.targetCurrentA}</td><td>${fmt(point.durationS, 0)}</td><td>${fmt(point.averageCellVoltageV, 3)}</td><td>${fmt(point.averageCellDeviationMv, 1)}</td><td>${fmt(point.averageNetPowerKw, 2)}</td></tr>`).join('')
      : '<tr><td colspan="5">未形成有效目标电流段；输入目标电流并点击“应用阈值并重新分析”。</td></tr>';
    const forecast = Object.values(dataset.insulation.forecast).map((item) => `<span><b>${item.threshold} kΩ</b> ${item.trend.slopePerDay === null ? '趋势不足' : `${fmt(item.trend.slopePerDay, 2)} kΩ/日`} · ${item.forecast?.status === 'forecast' ? `预计 ${fmt(item.forecast.days, 1)} 日触及` : item.forecast?.status === 'already_below' ? '已有低于报警线的窗口' : '未形成下降预测'}</span>`).join('');
    $('#enterprise-controls').innerHTML = `<label>目标电流 A（逗号分隔）<input id="vehicle-targets" type="text" value="${escapeHtml(dataset.targetCurrents.join(','))}" placeholder="例如 95,105,115"></label><label>允许波动 A<input id="vehicle-tolerance" type="number" value="${dataset.targetToleranceA}" step="1"></label><label>最短持续 s<input id="vehicle-duration" type="number" value="${dataset.minimumDurationS}" step="10"></label>`;
    $('#enterprise-summary').innerHTML = `<div class="enterprise-facts"><span><b>${dataset.stateCounts['4'] || 0}</b> 条运行态</span><span><b>${dataset.stateCounts['8'] || 0}</b> 条上电非运行态</span><span><b>${dataset.insulation.validCount}</b> 条绝缘有效记录</span><span><b>${dataset.insulation.points.length}</b> 个 10 分钟窗口</span></div><div class="enterprise-forecast">${forecast}</div>`;
    $('#enterprise-table').innerHTML = `<h3>目标电流段统计</h3><table><thead><tr><th>目标 A</th><th>有效持续 s</th><th>平均单体 V</th><th>离均差 mV</th><th>净功率 kW</th></tr></thead><tbody>${points}</tbody></table>`;
    return;
  }
  if (result.datasetType === 'durability') {
    const points = dataset.points.map((point) => `<tr><td>${fmt(point.targetPowerKw, 1)}</td><td>${fmt(point.netPowerKw, 1)}</td><td>${fmt(point.averageCellVoltageMv, 0)}</td><td>${fmt(point.averageDeviationMv, 0)}</td><td>${fmt(point.voltageVariance, 0)}</td></tr>`).join('');
    const reports = dataset.reports.map((report) => `<span><b>${escapeHtml(report.metadata?.测试方案 || '耐久报告')}</b> ${escapeHtml(report.metadata?.测试结果 || '未标注')} · ${report.points.length} 个功率点</span>`).join('');
    $('#enterprise-controls').innerHTML = `<label>离均差预警 mV（可选）<input id="durability-max-deviation" type="number" value="${dataset.rules.maxDeviationMv ?? ''}" placeholder="企业填写" step="1"></label><label>平均单体电压下限 mV（可选）<input id="durability-min-cell-voltage" type="number" value="${dataset.rules.minAverageCellVoltageMv ?? ''}" placeholder="企业填写" step="1"></label><label>飞书机器人 Webhook（可选）<input id="feishu-webhook" type="url" placeholder="企业批准后填写"></label><label>签名密钥（可选）<input id="feishu-secret" type="password" placeholder="仅当前会话"></label><button id="preview-feishu" class="quiet-button" type="button">预览飞书告警 JSON</button><button id="send-feishu" class="outline-button" type="button">确认发送飞书</button><span id="feishu-alert-status" class="enterprise-note">未发送；默认只生成预览。</span>`;
    $('#preview-feishu').onclick = async () => {
      const payload = durabilityAlertPayload(result, state.fileName);
      try { await navigator.clipboard?.writeText(JSON.stringify(payload, null, 2)); $('#feishu-alert-status').textContent = '告警 JSON 已复制；尚未发送。'; } catch { $('#feishu-alert-status').textContent = '告警 JSON 已生成，但浏览器不允许自动复制。'; }
    };
    $('#send-feishu').onclick = async () => {
      $('#feishu-alert-status').textContent = '发送中…';
      const directUrl = $('#feishu-webhook').value.trim();
      let response;
      try {
        const serverResponse = await fetch('api/feishu-alert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: state.fileName, result: { verdict: result.verdict, dataset: { targetPowers: result.dataset.targetPowers, points: [] }, issues: result.issues } }) });
        if (serverResponse.status !== 404) response = await serverResponse.json();
      } catch {}
      if (!response && directUrl) response = await sendFeishuAlert(result, { webhookUrl: directUrl, secret: $('#feishu-secret').value, fileName: state.fileName });
      if (!response) response = { ok: false, mode: 'dry-run', reason: 'server_not_configured_and_webhook_missing' };
      $('#feishu-alert-status').textContent = response.ok ? `已发送（${response.mode === 'server' ? '服务端' : '浏览器'}，HTTP ${response.status || 200}）；仍需核对飞书群消息。` : response.mode === 'dry-run' ? '未配置服务端通道或浏览器 Webhook，保持 dry-run。' : `未发送：${response.reason || '飞书返回失败'}。`;
    };
    $('#enterprise-summary').innerHTML = `<div class="enterprise-facts"><span><b>${dataset.points.length}</b> 个功率点</span><span><b>${dataset.targetPowers.length}</b> 个目标功率</span><span><b>${dataset.rules.maxDeviationMv ?? '—'}</b> mV 离均差规则</span><span><b>${dataset.rules.minAverageCellVoltageMv ?? '—'}</b> mV 电压规则</span></div><div class="enterprise-forecast">${reports}</div>`;
    $('#enterprise-table').innerHTML = `<h3>耐久功率点统计</h3><table><thead><tr><th>目标功率 kW</th><th>净输出 kW</th><th>平均单体 mV</th><th>离均差 mV</th><th>电压方差</th></tr></thead><tbody>${points}</tbody></table>`;
    return;
  }
  const parameterStatus = dataset.parameterConfig ? (dataset.parameterConfig.ok ? '参数工作簿已校验' : `参数工作簿错误 ${dataset.parameterConfig.errors.length} 项`) : '未导入目标工况参数';
  const platformRows = dataset.platforms?.length ? dataset.platforms.map((item) => `<tr><td>${escapeHtml(item.conditionId)}</td><td>${fmt(item.targetCurrentA, 2)}</td><td>${fmt(item.effectiveDurationS, 0)}</td><td>${escapeHtml(item.status)}</td></tr>`).join('') : '<tr><td colspan="4">未形成电流平台；先导入参数工作簿。</td></tr>';
  $('#enterprise-controls').innerHTML = `<span class="enterprise-note">${escapeHtml(parameterStatus)} · ${dataset.parameterConfig?.ok ? '平台和稳定区间按参数表计算' : '当前只输出实际时序和单片一致性摘要，不作目标符合性判定'}</span>`;
  $('#enterprise-summary').innerHTML = `<div class="enterprise-facts"><span><b>${dataset.cellChannelCount}</b> 个导出单片通道</span><span><b>${dataset.configuredCellCount || '—'}</b> 片数参数</span><span><b>${fmt(dataset.metrics.averageCurrentA, 2)}</b> A 平均电流</span><span><b>${fmt(dataset.metrics.cellSpreadMaxV, 3)}</b> V 最大极差</span><span><b>${dataset.platforms?.length || 0}</b> 个电流平台</span><span><b>${dataset.performancePoints?.length || 0}</b> 个有效稳定区间</span></div>`;
  $('#enterprise-table').innerHTML = `<h3>电流平台与稳定区间</h3><table><thead><tr><th>工况</th><th>目标电流 A</th><th>有效持续 s</th><th>状态</th></tr></thead><tbody>${platformRows}</tbody></table><h3>实际字段映射</h3><div class="enterprise-map">${Object.entries(dataset.sourceFieldMap).filter(([, source]) => source).map(([field, source]) => `<span><code>${escapeHtml(field)}</code><b>←</b>${escapeHtml(source)}</span>`).join('')}</div>`;
}

function render(result) {
  state.result = result;
  state.aiDraft = null;
  state.baselineResult = null;
  state.comparison = null;
  $('#file-name').textContent = state.fileName;
  $('#source-count').textContent = `${result.metrics.sampleCount} 条记录 · ${fmt(result.metrics.durationS, 0)} 秒${result.dataset?.label ? ` · ${result.dataset.label}` : ''}`;
  const convertedUnits = Object.values(result.schema.conversions).filter((item) => item.mode !== 'identity').length;
  const phaseFallback = result.schema.missingOptionalHeaders.includes('phase') ? ' · 工况字段缺失，使用活动窗口' : '';
  const purityNotice = result.schema.missingOptionalHeaders.includes('hydrogen_purity_pct') ? ' · 纯度字段未提供' : '';
  $('#schema-notice').textContent = result.dataset ? `${result.dataset.label} · 字段映射 ${result.schema.mappedCount}/${result.schema.fieldCount}` : `字段映射 ${result.schema.mappedCount}/${result.schema.fieldCount}${convertedUnits ? ` · ${convertedUnits} 项单位换算` : ''}${phaseFallback}${purityNotice}`;
  $('#verdict-chip').textContent = verdictLabel(result.verdict);
  $('#verdict-chip').className = `verdict-chip ${result.verdict.toLowerCase()}`;
  const complianceClass = result.compliance.status.toLowerCase().replaceAll('_', '-');
  $('#compliance-chip').textContent = result.compliance.label;
  $('#compliance-chip').className = `compliance-chip ${complianceClass}`;
  renderMetrics(result); renderIssues(result); renderPhases(result); renderWorkflow(result); renderReport(result); renderEnterprisePanel(result); drawChart(result); drawEnterpriseChart(result);
  renderComparison();
  renderHistory();
  renderSchema(result);
  $('#last-run').textContent = `最近分析 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
}

async function loadCsv(url, name) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`无法读取 ${url}`);
  const text = await response.text();
  await bindRawDataHash(text);
  state.rows = parseCSV(text);
  state.fileName = name;
  render(analyzeRows(state.rows, configFromUI()));
}

async function readUserFile(file) {
  const buffer = await file.arrayBuffer();
  const encoding = /\.(txt|tsv)$/i.test(file.name) ? 'gb18030' : 'utf-8';
  try { return new TextDecoder(encoding).decode(buffer); } catch { return new TextDecoder('utf-8').decode(buffer); }
}

async function readSelectedDataFiles(files) {
  const entries = [];
  for (const file of files) {
    if (/\.docx$/i.test(file.name)) {
      const report = await parseDurabilityDocx(await file.arrayBuffer());
      entries.push({ name: file.name, rows: report.points.map((point) => ({ ...point, source_file: file.name })), durabilityReport: report, text: `DOCX:${file.name}\n${JSON.stringify(report)}` });
    } else if (/\.(xlsx|xlsm)$/i.test(file.name)) {
      const workbookResult = parseDataWorkbook(await file.arrayBuffer());
      if (!workbookResult.ok) throw new Error(workbookResult.errors.join('；'));
      entries.push({ name: file.name, rows: workbookResult.rows, text: `SHEET:${workbookResult.sheetName}\n${JSON.stringify(workbookResult.rows)}` });
    } else {
      const text = await readUserFile(file);
      entries.push({ name: file.name, rows: parseCSV(text), text });
    }
  }
  const rows = entries.flatMap(({ rows: fileRows }) => fileRows);
  const first = rows[0] || {};
  const timeField = ['Timestamp', '测试时间', '时间'].find((field) => Object.hasOwn(first, field));
  if (timeField === 'Timestamp') rows.sort((a, b) => String(a[timeField]).localeCompare(String(b[timeField])));
  return { entries, rows, durabilityReports: entries.map((entry) => entry.durabilityReport).filter(Boolean), hashText: entries.map(({ name, text }) => `FILE:${name}\n${text}`).join('\n') };
}

async function loadSample() {
  await loadCsv('sample-data/test_run_001.csv', '演示样本 · electrolyzer_run_017.csv');
}

async function loadLegacySample() {
  await loadCsv('sample-data/test_run_legacy_cn.csv', '中文单位样本 · legacy_run_cn.csv');
}

$('#file-input').addEventListener('change', async (event) => {
  const files = [...event.target.files];
  if (!files.length) return;
  try {
    const loaded = await readSelectedDataFiles(files);
    await bindRawDataHash(loaded.hashText);
    state.durabilityReports = loaded.durabilityReports;
    state.rows = loaded.rows; state.fileName = loaded.entries.length === 1 ? loaded.entries[0].name : `多文件批次 · ${loaded.entries.length} 个文件`;
    render(analyzeRows(state.rows, configFromUI()));
  } catch (error) {
    $('#schema-notice').textContent = `导入失败：${error.message}`;
  }
});
$('#reanalyze').addEventListener('click', () => { if (state.rows.length) render(analyzeRows(state.rows, configFromUI())); });
$('#profile-select').addEventListener('change', () => { applyProfile($('#profile-select').value); if (state.rows.length) render(analyzeRows(state.rows, configFromUI())); });
['max-temperature', 'max-pressure', 'max-leak', 'max-voltage-std', 'max-pressure-drift'].forEach((id) => document.querySelector(`#${id}`).addEventListener('input', () => { $('#profile-select').value = CUSTOM_PROFILE_ID; applyProfile(CUSTOM_PROFILE_ID); }));
$('#load-demo').addEventListener('click', loadSample);
$('#load-legacy').addEventListener('click', loadLegacySample);
$('#profile-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const packageResult = profilesFromPackage(JSON.parse(await file.text()));
    if (!packageResult.ok) throw new Error(packageResult.errors.join('；'));
    applyProfilePackage(packageResult);
  } catch (error) {
    $('#profile-import-status').textContent = `导入失败：${error.message}`;
  }
});
$('#parameter-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const parsed = parseParameterWorkbook(await file.arrayBuffer());
    state.parameterConfig = parsed;
    $('#parameter-import-status').textContent = parsed.ok ? `已校验：${parsed.parameterSheet} + ${parsed.targetSheet} · ${parsed.targetConditions.length} 个目标工况` : `导入失败：${parsed.errors.join('；')}`;
    if (state.rows.length) render(analyzeRows(state.rows, configFromUI()));
  } catch (error) {
    state.parameterConfig = null;
    $('#parameter-import-status').textContent = `导入失败：${error.message}`;
  }
});
$('#metadata-raw-ref').addEventListener('input', (event) => { event.target.dataset.generated = 'false'; });
$('#load-profile-demo').addEventListener('click', async () => {
  try {
    const response = await fetch('config/enterprise-profile.example.json');
    if (!response.ok) throw new Error('示例配置读取失败');
    const packageResult = profilesFromPackage(await response.json());
    if (!packageResult.ok) throw new Error(packageResult.errors.join('；'));
    const sampleResponse = await fetch('sample-data/test_run_legacy_cn.csv');
    if (!sampleResponse.ok) throw new Error('配置匹配样本读取失败');
    const sampleText = await sampleResponse.text();
    await bindRawDataHash(sampleText);
    state.rows = parseCSV(sampleText);
    state.fileName = '企业配置示例 · legacy_run_cn.csv';
    applyProfilePackage(packageResult);
  } catch (error) {
    $('#profile-import-status').textContent = `导入失败：${error.message}`;
  }
});
$('#save-history').addEventListener('click', () => {
  if (!state.result) return;
  const previous = state.history[0];
  state.history = appendHistory(window.localStorage, state.result, state.fileName);
  if (previous) state.comparison = compareResults(previous, state.result, { baselineName: previous.fileName, currentName: state.fileName });
  renderHistory();
  renderComparison();
  $('#history-status').textContent = previous ? '已保存并完成上一批对比' : '已保存当前批次';
});
$('#clear-history').addEventListener('click', () => { state.history = clearHistory(window.localStorage); state.comparison = null; renderHistory(); renderComparison(); });
$('#compare-demo').addEventListener('click', async () => {
  if (!state.result) return;
  const button = $('#compare-demo');
  button.disabled = true;
  button.textContent = '对比中…';
  try {
    const response = await fetch('sample-data/test_run_baseline.csv');
    if (!response.ok) throw new Error('基线文件读取失败');
    state.baselineResult = analyzeRows(parseCSV(await response.text()), configFromUI());
    state.comparison = compareResults(state.baselineResult, state.result, { baselineName: '演示基线 · baseline_run.csv', currentName: state.fileName });
    renderComparison(state.comparison);
  } catch (error) {
    $('#compare-status').textContent = '对比失败';
    $('#compare-summary').textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = '载入演示基线并对比';
  }
});
$('#generate-ai').addEventListener('click', async () => {
  if (!state.result) return;
  const button = $('#generate-ai');
  button.disabled = true;
  button.textContent = '处理中…';
  const localFallback = (reason) => ({ mode: 'local-evidence', provider: 'local', fallbackReason: reason, draft: localEvidenceDraft(state.result), evidence: evidenceBundle(state.result, state.comparison) });
  try {
    const response = await fetch('api/ai-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(evidenceBundle(state.result, state.comparison)) });
    if (!response.ok) state.aiDraft = localFallback(`api_http_${response.status}`);
    else state.aiDraft = await response.json();
    renderReport(state.result, state.aiDraft);
  } catch (error) {
    state.aiDraft = localFallback('api_unavailable');
    renderReport(state.result, state.aiDraft);
  } finally {
    button.disabled = false;
    button.textContent = '生成报告初稿';
  }
});
$('#download-report').addEventListener('click', () => { const blob = new Blob([reportMarkdown(state.result, state.fileName, { comparison: state.comparison, aiDraft: state.aiDraft })], { type: 'text/markdown;charset=utf-8' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${state.fileName.replace(/\.csv$/i, '')}-自动报告.md`; link.click(); URL.revokeObjectURL(link.href); });
$('#download-xlsx').addEventListener('click', async () => {
  if (!state.result) return;
  try {
    const workbook = buildEnterpriseWorkbook(state.result, state.fileName, { parameterConfig: state.parameterConfig });
    const rawWorkbook = workbookArrayBuffer(workbook);
    const workbookBytes = await addNativeChartToWorkbook(rawWorkbook, state.result.dataset || {});
    const blob = new Blob([workbookBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${state.fileName.replace(/\.(csv|txt|tsv)$/i, '')}-TestLens报告.xlsx`; link.click(); URL.revokeObjectURL(link.href);
  } catch (error) {
    $('#report-status').textContent = `Excel 导出失败：${error.message}`;
  }
});
$('#download-json').addEventListener('click', () => { const blob = new Blob([JSON.stringify({ ...publicAnalysis(state.result), comparison: state.comparison, aiDraft: state.aiDraft }, null, 2)], { type: 'application/json;charset=utf-8' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${state.fileName.replace(/\.csv$/i, '')}-分析证据.json`; link.click(); URL.revokeObjectURL(link.href); });
window.addEventListener('resize', () => { if (state.result) { drawChart(state.result); drawEnterpriseChart(state.result); } });
ensureExtendedMetadataFields();
renderProfileOptions();
applyProfile('electrolyzer-demo');
state.history = readHistory(window.localStorage);
renderHistory();
loadSample();
