import { analyzeRows, parseCSV, reportMarkdown, DEFAULT_CONFIG } from './analyzer.mjs';
import { evidenceBundle, localEvidenceDraft } from './ai-draft.mjs';
import { compareResults } from './compare.mjs';
import { CUSTOM_PROFILE_ID, DEVICE_PROFILES, getProfile, profilesFromPackage } from './profiles.mjs';
import { appendHistory, clearHistory, readHistory } from './history.mjs';

const $ = (selector) => document.querySelector(selector);
const state = { rows: [], fileName: '演示样本 · electrolyzer_run_017.csv', result: null, aiDraft: null, baselineResult: null, comparison: null, history: [], profileCatalog: [...DEVICE_PROFILES], fieldMapping: {}, profileOrganization: '内置演示配置' };

const fmt = (value, digits = 1) => value === null || value === undefined || Number.isNaN(value) ? '—' : Number(value).toFixed(digits);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

function ensureExtendedMetadataFields() {
  const container = $('.metadata-details');
  if (!container || $('#metadata-test-plan')) return;
  container.insertAdjacentHTML('beforeend', '<label>测试计划/工况序列<input id="metadata-test-plan" type="text" placeholder="计划编号、稳态/动态/启停段"></label><label>数据采集计划<textarea id="metadata-acquisition" rows="2" placeholder="采样频率、同步时钟、通道/质量状态"></textarea></label><label>试验前检查记录<textarea id="metadata-precheck" rows="2" placeholder="设备、气液路、传感器、安全状态检查记录"></textarea></label><label>环境/安全条件<textarea id="metadata-environment" rows="2" placeholder="环境温度、湿度、压力及安全前置条件"></textarea></label><label>不确定度/误差策略<textarea id="metadata-uncertainty" rows="2" placeholder="测量不确定度、误差或缺失值处理策略"></textarea></label><label>原始数据引用/哈希<input id="metadata-raw-ref" type="text" placeholder="文件编号、对象路径或 SHA-256"></label>');
}

function configFromUI() {
  const profileId = $('#profile-select').value;
  const profile = profileId === CUSTOM_PROFILE_ID ? null : getProfile(profileId, state.profileCatalog);
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
    fieldMapping: state.fieldMapping,
    testMetadata: {
      testPurpose: $('#metadata-purpose').value.trim(),
      testPlanRef: $('#metadata-test-plan').value.trim(),
      acquisitionPlan: $('#metadata-acquisition').value.trim(),
      preCheckRecord: $('#metadata-precheck').value.trim(),
      instrumentIds: $('#metadata-instruments').value.trim(),
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
  const cards = [
    ['自动判定', verdictLabel(result.verdict), result.verdict.toLowerCase(), '当前规则下的首轮分流'],
    ['数据完整率', `${fmt(metrics.completenessPct)}%`, metrics.completenessPct >= 98 ? 'good' : 'warn', `${metrics.sampleCount} 条记录`],
    ['峰值功率', `${fmt(metrics.peakPowerW)} W`, 'neutral', '电流 × 电压'],
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

function renderReport(result, draft = state.aiDraft) {
  const status = verdictLabel(result.verdict);
  $('#report-status').textContent = draft ? (draft.mode === 'remote-llm' ? `模型草稿 · ${draft.model}` : '本地证据草稿') : `${status} · ${result.issues.length} 条结论`;
  if (draft?.draft) {
    $('#report-preview').innerHTML = `<div class="report-head"><span>AI DRAFT / evidence-grounded</span><strong>${status}</strong></div><pre class="draft-text">${escapeHtml(draft.draft)}</pre><div class="report-foot">${draft.mode === 'remote-llm' ? '模型只能看到结构化证据；正式发布前仍需工程师签核。' : '当前未配置远程模型，使用本地证据约束草稿；不上传原始样本。'}</div>`;
    return;
  }
  $('#report-preview').innerHTML = `<div class="report-head"><span>自动报告 / ${escapeHtml(state.fileName)}</span><strong>${status}</strong></div><h3>测试结论</h3><p>${escapeHtml(result.narrative)}</p><h3>异常与建议</h3><ul>${result.issues.map((item) => `<li><b>${escapeHtml(item.title)}</b>：${escapeHtml(item.evidence)}。${escapeHtml(item.recommendation)}</li>`).join('')}</ul><div class="report-foot">阈值、原始样本、计算指标和建议动作可追溯；正式报告需经工程师签核。</div>`;
}

function render(result) {
  state.result = result;
  state.aiDraft = null;
  state.baselineResult = null;
  state.comparison = null;
  $('#file-name').textContent = state.fileName;
  $('#source-count').textContent = `${result.metrics.sampleCount} 条记录 · ${fmt(result.metrics.durationS, 0)} 秒`;
  const convertedUnits = Object.values(result.schema.conversions).filter((item) => item.mode !== 'identity').length;
  const phaseFallback = result.schema.missingOptionalHeaders.includes('phase') ? ' · 工况字段缺失，使用活动窗口' : '';
  $('#schema-notice').textContent = `字段映射 ${result.schema.mappedCount}/${result.schema.fieldCount}${convertedUnits ? ` · ${convertedUnits} 项单位换算` : ''}${phaseFallback}`;
  $('#verdict-chip').textContent = verdictLabel(result.verdict);
  $('#verdict-chip').className = `verdict-chip ${result.verdict.toLowerCase()}`;
  const complianceClass = result.compliance.status.toLowerCase().replaceAll('_', '-');
  $('#compliance-chip').textContent = result.compliance.label;
  $('#compliance-chip').className = `compliance-chip ${complianceClass}`;
  renderMetrics(result); renderIssues(result); renderPhases(result); renderWorkflow(result); renderReport(result); drawChart(result);
  renderComparison();
  renderHistory();
  renderSchema(result);
  $('#last-run').textContent = `最近分析 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
}

async function loadCsv(url, name) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`无法读取 ${url}`);
  state.rows = parseCSV(await response.text());
  state.fileName = name;
  render(analyzeRows(state.rows, configFromUI()));
}

async function loadSample() {
  await loadCsv('/sample-data/test_run_001.csv', '演示样本 · electrolyzer_run_017.csv');
}

async function loadLegacySample() {
  await loadCsv('/sample-data/test_run_legacy_cn.csv', '中文单位样本 · legacy_run_cn.csv');
}

$('#file-input').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  state.rows = parseCSV(await file.text()); state.fileName = file.name;
  render(analyzeRows(state.rows, configFromUI()));
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
$('#load-profile-demo').addEventListener('click', async () => {
  try {
    const response = await fetch('/config/enterprise-profile.example.json');
    if (!response.ok) throw new Error('示例配置读取失败');
    const packageResult = profilesFromPackage(await response.json());
    if (!packageResult.ok) throw new Error(packageResult.errors.join('；'));
    const sampleResponse = await fetch('/sample-data/test_run_legacy_cn.csv');
    if (!sampleResponse.ok) throw new Error('配置匹配样本读取失败');
    state.rows = parseCSV(await sampleResponse.text());
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
    const response = await fetch('/sample-data/test_run_baseline.csv');
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
  button.textContent = '生成中…';
  const localFallback = (reason) => ({ mode: 'local-evidence', provider: 'local', fallbackReason: reason, draft: localEvidenceDraft(state.result), evidence: evidenceBundle(state.result, state.comparison) });
  try {
    const response = await fetch('/api/ai-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(evidenceBundle(state.result, state.comparison)) });
    if (!response.ok) state.aiDraft = localFallback(`api_http_${response.status}`);
    else state.aiDraft = await response.json();
    renderReport(state.result, state.aiDraft);
  } catch (error) {
    state.aiDraft = localFallback('api_unavailable');
    renderReport(state.result, state.aiDraft);
  } finally {
    button.disabled = false;
    button.textContent = '生成证据约束草稿';
  }
});
$('#download-report').addEventListener('click', () => { const blob = new Blob([reportMarkdown(state.result, state.fileName, { comparison: state.comparison, aiDraft: state.aiDraft })], { type: 'text/markdown;charset=utf-8' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${state.fileName.replace(/\.csv$/i, '')}-自动报告.md`; link.click(); URL.revokeObjectURL(link.href); });
$('#download-json').addEventListener('click', () => { const blob = new Blob([JSON.stringify({ ...state.result, comparison: state.comparison, aiDraft: state.aiDraft }, null, 2)], { type: 'application/json;charset=utf-8' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${state.fileName.replace(/\.csv$/i, '')}-分析证据.json`; link.click(); URL.revokeObjectURL(link.href); });
window.addEventListener('resize', () => { if (state.result) drawChart(state.result); });
ensureExtendedMetadataFields();
renderProfileOptions();
applyProfile('electrolyzer-demo');
state.history = readHistory(window.localStorage);
renderHistory();
loadSample();
