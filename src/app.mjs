import { analyzeRows, parseCSV, publicAnalysis, reportMarkdown, DEFAULT_CONFIG } from './analyzer.mjs';
import { evidenceBundle, localEvidenceDraft } from './ai-draft.mjs';
import { compareResults } from './compare.mjs';
import { CUSTOM_PROFILE_ID, DEVICE_PROFILES, getProfile, profilesFromPackage } from './profiles.mjs';
import { canonicalApprovalPayload } from './approval-ledger.mjs';
import { appendHistory, clearHistory, readHistory } from './history.mjs';
import { sha256Bytes, sha256Hex } from './provenance.mjs';
import { buildEnterpriseWorkbook, parseDataWorkbook, parseParameterWorkbook, setSpreadsheetEngine, workbookArrayBuffer } from './excel-workflow.mjs';
import { addNativeChartToWorkbook } from './xlsx-charts.mjs';
import { parseDurabilityDocx, setDocxEngine } from './docx-workflow.mjs';
import { durabilityAlertPayload, sendFeishuAlert } from './feishu-alerts.mjs';
import { diffManifests, manifestFromEntries, readBatchManifest, writeBatchManifest } from './incremental.mjs';
import { sampleRowsForDisplay } from './display-sampling.mjs';
import { ensureBrowserEngines } from './browser-engines.mjs';
import { decodeTextBuffer } from './input-safety.mjs';
import { observeDeclaredBatch, publicBatchAggregation, summarizeDeclaredBatch, validateBatchDeclaration, annotateDeclaredBatchRows } from './batch-aggregation.mjs';

const $ = (selector) => document.querySelector(selector);
const state = { rows: [], fileName: '演示样本 · electrolyzer_run_017.csv', result: null, aiDraft: null, baselineResult: null, comparison: null, history: [], profileCatalog: [...DEVICE_PROFILES], fieldMapping: {}, profileOrganization: '内置演示配置', rawDataHash: null, standardEvidenceRows: [], trustedApprovalRows: [], parameterConfig: null, workbookEvidence: null, durabilityReports: [], currentManifest: [], inputEntries: [], batchDeclarationInput: null, batchValidation: null, batchSummaries: [], incrementalDiff: null, coverageSummary: null, inputSummary: { totalFiles: 1, processed: 1, referenceOnly: 0, blockedBinary: 0, parserErrors: 0 }, stackSelectionOverrides: {}, analysisToken: 0, resultHistory: [], resultHistoryIndex: -1, recentFiles: [], theme: 'dark', complianceHistory: [] };
const assetUrl = (relativePath) => /\/src\/index\.html$/.test(window.location.pathname) ? `../${relativePath}` : `./${relativePath}`;
let standardEvidencePromise = null;
let trustedApprovalPromise = null;
async function ensureStandardEvidenceLedger() {
  if (!standardEvidencePromise) standardEvidencePromise = fetch(assetUrl('config/standard-evidence-ledger.v1.json')).then(async (response) => {
    if (!response.ok) throw new Error('standard_evidence_ledger_unavailable');
    const payload = await response.json();
    state.standardEvidenceRows = Array.isArray(payload.evidenceRows) ? payload.evidenceRows : [];
    return state.standardEvidenceRows;
  }).catch(() => {
    state.standardEvidenceRows = [];
    return state.standardEvidenceRows;
  });
  return standardEvidencePromise;
}
async function ensureTrustedApprovalLedger() {
  if (!trustedApprovalPromise) trustedApprovalPromise = fetch(assetUrl('config/trusted-approval-ledger.v1.json')).then(async (response) => {
    if (!response.ok) throw new Error('trusted_approval_ledger_unavailable');
    const payload = await response.json();
    state.trustedApprovalRows = Array.isArray(payload.approvalRows) ? payload.approvalRows : [];
    return state.trustedApprovalRows;
  }).catch(() => {
    state.trustedApprovalRows = [];
    return state.trustedApprovalRows;
  });
  return trustedApprovalPromise;
}
async function runtimeProfilePackageOptions(payload) {
  const packageHash = await sha256Hex(canonicalApprovalPayload(payload));
  return { requireEvidenceLedger: true, evidenceRows: await ensureStandardEvidenceLedger(), requireApprovalLedger: true, approvalRows: await ensureTrustedApprovalLedger(), packageHashes: Object.fromEntries((payload.profiles || []).map((profile) => [profile.id, packageHash])) };
}
const ANALYSIS_WORKER_THRESHOLD = 10000;
const analysisWorkerState = { worker: null, nextId: 0, pending: new Map() };

const fmt = (value, digits = 1) => value === null || value === undefined || Number.isNaN(value) ? '—' : Number(value).toFixed(digits);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const csvCell = (value) => '"' + String(value ?? '').replaceAll('"', '""') + '"';

function setAnalysisStatus(message, tone = 'neutral') {
  const element = $('#analysis-status');
  if (!element) return;
  element.textContent = message;
  element.dataset.tone = tone;
}

function getTheme() {
  return state.theme || 'dark';
}
function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  try { window.localStorage.setItem('h2-testlens-theme', theme); } catch {}
  updateThemeButton();
}
function toggleTheme() {
  applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}
function updateThemeButton() {
  const button = $('#theme-toggle');
  if (!button) return;
  button.textContent = getTheme() === 'dark' ? '🌙' : '☀️';
  button.setAttribute('aria-label', getTheme() === 'dark' ? '切换到浅色模式' : '切换到深色模式');
}

function showInitialLoadingState() {
  showMetricSkeletons();
  const issueList = $('#issue-list');
  if (issueList && !issueList.children.length) {
    issueList.innerHTML = Array.from({ length: 3 }).map(() => `<div class="issue"><div class="issue-mark skeleton" style="width:25px;height:25px;border-radius:7px;"></div><div><div class="skeleton-text short" style="width:40%"></div><div class="skeleton-text"></div><div class="skeleton-text" style="width:80%"></div></div></div>`).join('');
  }
}
function hideInitialLoadingState() {
  const metricGrid = $('#metric-grid');
  if (metricGrid?.querySelector('.skeleton')) metricGrid.innerHTML = '';
  ['trend-chart', 'enterprise-chart', 'enterprise-performance-chart'].forEach((id) => {
    const wrap = $(`#${id}`)?.parentElement;
    if (wrap) { wrap.classList.remove('chart-loading'); const msg = wrap.querySelector('.chart-skeleton-message'); if (msg) msg.remove(); }
  });
  const issueList = $('#issue-list');
  if (issueList?.querySelector('.issue-mark.skeleton')) issueList.innerHTML = '';
}
function trapFocus(container) {
  if (!container) return;
  const focusable = container.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  container.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    if (event.shiftKey) { if (document.activeElement === first) { event.preventDefault(); last.focus(); } }
    else { if (document.activeElement === last) { event.preventDefault(); first.focus(); } }
  });
}

function getRecentFiles() {
  try {
    const raw = window.localStorage.getItem('h2-testlens-recent-files');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveRecentFile(name, hash) {
  const recent = getRecentFiles().filter((item) => item.name !== name && (hash ? item.hash !== hash : true));
  recent.unshift({ name, hash, loadedAt: new Date().toISOString() });
  const trimmed = recent.slice(0, 10);
  try { window.localStorage.setItem('h2-testlens-recent-files', JSON.stringify(trimmed)); } catch {}
  state.recentFiles = trimmed;
  renderRecentFiles();
}
function renderRecentFiles() {
  const container = $('#recent-files-list');
  if (!container) return;
  const recent = getRecentFiles();
  if (!recent.length) {
    container.innerHTML = '<div class="recent-empty">暂无最近文件</div>';
    return;
  }
  container.innerHTML = recent.map((item) => `<button class="recent-file-chip" data-name="${escapeHtml(item.name)}" data-hash="${escapeHtml(item.hash || '')}" type="button"><span>${escapeHtml(item.name)}</span><small>${new Date(item.loadedAt).toLocaleDateString('zh-CN')}</small></button>`).join('');
}

function pushResultHistory(result) {
  state.resultHistory = state.resultHistory.slice(0, state.resultHistoryIndex + 1);
  state.resultHistory.push(result);
  if (state.resultHistory.length > 5) state.resultHistory.shift();
  state.resultHistoryIndex = state.resultHistory.length - 1;
  updateUndoRedoButtons();
}
function undoResult() {
  if (state.resultHistoryIndex <= 0) return;
  state.resultHistoryIndex -= 1;
  state.result = state.resultHistory[state.resultHistoryIndex];
  render(state.result, false);
  updateUndoRedoButtons();
}
function redoResult() {
  if (state.resultHistoryIndex >= state.resultHistory.length - 1) return;
  state.resultHistoryIndex += 1;
  state.result = state.resultHistory[state.resultHistoryIndex];
  render(state.result, false);
  updateUndoRedoButtons();
}
function updateUndoRedoButtons() {
  const undoButton = $('#undo-result');
  const redoButton = $('#redo-result');
  if (undoButton) undoButton.disabled = state.resultHistoryIndex <= 0;
  if (redoButton) redoButton.disabled = state.resultHistoryIndex >= state.resultHistory.length - 1;
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

function settleAnalysisWorker(error) {
  const pending = [...analysisWorkerState.pending.values()];
  analysisWorkerState.pending.clear();
  analysisWorkerState.worker?.terminate();
  analysisWorkerState.worker = null;
  for (const item of pending) item.reject(error);
}

function getAnalysisWorker() {
  if (typeof globalThis.Worker !== 'function') return null;
  if (analysisWorkerState.worker) return analysisWorkerState.worker;
  try {
    const worker = new globalThis.Worker(new URL('./analysis-worker.mjs', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event) => {
      const payload = event.data || {};
      const pending = analysisWorkerState.pending.get(payload.id);
      if (!pending) return;
      if (payload.type === 'stage') {
        pending.onStage?.(payload.stage, payload.rowCount);
        return;
      }
      analysisWorkerState.pending.delete(payload.id);
      if (payload.type === 'error') pending.reject(new Error(payload.error?.message || 'analysis_worker_failed'));
      else pending.resolve(payload.result);
    });
    worker.addEventListener('error', (event) => settleAnalysisWorker(new Error(event.message || 'analysis_worker_unavailable')));
    analysisWorkerState.worker = worker;
    return worker;
  } catch {
    return null;
  }
}

function analyzeInWorker(rows, config, onStage) {
  const worker = getAnalysisWorker();
  if (!worker) return null;
  const id = ++analysisWorkerState.nextId;
  return new Promise((resolve, reject) => {
    analysisWorkerState.pending.set(id, { resolve, reject, onStage });
    try { worker.postMessage({ id, rows, config }); }
    catch (error) { analysisWorkerState.pending.delete(id); reject(error); }
  });
}

function withDisplayRows(result, analysisEngine = 'main-thread', fallbackReason = null) {
  const display = sampleRowsForDisplay(result.rows);
  return {
    ...result,
    rows: display.rows,
    source: {
      ...result.source,
      analysisEngine,
      ...(fallbackReason ? { analysisFallbackReason: fallbackReason } : {}),
      analyzedRowCount: display.originalRowCount,
      displayRowCount: display.rows.length,
      chartSampling: display.sampled
    }
  };
}

async function analyzeRowsAsync(rows, config, onStage) {
  if (rows.length >= ANALYSIS_WORKER_THRESHOLD) {
    onStage?.('worker', rows.length);
    const workerResult = analyzeInWorker(rows, config, onStage);
    if (workerResult) {
      try { return await workerResult; }
      catch { onStage?.('fallback', rows.length, 'worker_error'); }
    } else {
      onStage?.('fallback', rows.length, 'worker_unavailable');
    }
  }
  await yieldToBrowser();
  onStage?.('analyze', rows.length);
  const fallbackReason = rows.length >= ANALYSIS_WORKER_THRESHOLD ? (typeof globalThis.Worker === 'function' ? 'worker_error' : 'worker_unavailable') : null;
  return withDisplayRows(analyzeRows(rows, config), fallbackReason ? 'main-thread-fallback' : 'main-thread', fallbackReason);
}

async function analyzeCurrent(reason = '重新分析') {
  if (!state.rows.length) return;
  const token = ++state.analysisToken;
  setAnalysisStatus(`${reason}：准备中…`, 'busy');
  document.body.setAttribute('aria-busy', 'true');
  await yieldToBrowser();
  try {
    showMetricSkeletons();
    const result = await analyzeRowsAsync(state.rows, configFromUI(), (stage, rowCount, detail) => {
      if (token !== state.analysisToken) return;
      if (stage === 'worker') setAnalysisStatus(`后台分析中：${rowCount.toLocaleString('zh-CN')} 条记录，页面仍可响应…`, 'busy');
      else if (stage === 'fallback') setAnalysisStatus(detail === 'worker_unavailable' ? '当前页面环境不支持 Worker，切换到主线程分析…' : 'Worker 分析失败，切换到主线程分析…', 'busy');
      else setAnalysisStatus('正在计算指标和流程门控…', 'busy');
    });
    if (token !== state.analysisToken) return;
    result.source = { ...result.source, inputSummary: state.inputSummary };
    const retryButton = $('#retry-analysis');
    if (retryButton) retryButton.hidden = true;
    render(result);
    const sampled = result.source?.chartSampling ? ` · 图表显示 ${result.source.displayRowCount.toLocaleString('zh-CN')} 点` : '';
    const engine = result.source?.analysisEngine === 'worker' ? ' · Worker' : result.source?.analysisEngine === 'main-thread-fallback' ? ' · 主线程回退' : '';
    setAnalysisStatus(`分析完成：${result.metrics.sampleCount.toLocaleString('zh-CN')} 条记录${sampled}${engine}`, 'ready');
    resetBatchProgress();
    document.body.removeAttribute('aria-busy');
    if (state.batchDeclarationInput) void evaluateDeclaredBatch();
  } catch (error) {
    if (token !== state.analysisToken) return;
    const message = error.message || '未知错误';
    resetBatchProgress();
    setAnalysisStatus(`分析失败：${message}`, 'error');
    const notice = $('#schema-notice');
    if (notice) notice.textContent = `分析失败：${message}；请检查数据格式，或点击“重试”再次分析。`;
    const retryButton = $('#retry-analysis');
    if (retryButton) retryButton.hidden = false;
    document.body.removeAttribute('aria-busy');
    return null;
  }
}

function ensureExtendedMetadataFields() {
  const container = $('.metadata-details');
  if (!container) return;
  const additions = [];
  if (!$('#metadata-test-plan')) additions.push('<label>测试计划/工况序列<input id="metadata-test-plan" type="text" placeholder="计划编号、稳态/动态/启停段"></label><label>数据采集计划<textarea id="metadata-acquisition" rows="2" placeholder="采样频率、同步时钟、通道/质量状态"></textarea></label><label>试验前检查记录<textarea id="metadata-precheck" rows="2" placeholder="设备、气液路、传感器、安全状态检查记录"></textarea></label><label>仪器精度/量程要求<textarea id="metadata-instrument-accuracy" rows="2" placeholder="电压、电流、流量、压力、温度、纯度仪器精度和量程"></textarea></label><label>环境/安全条件<textarea id="metadata-environment" rows="2" placeholder="环境温度、湿度、压力及安全前置条件"></textarea></label><label>不确定度/误差策略<textarea id="metadata-uncertainty" rows="2" placeholder="测量不确定度、误差或缺失值处理策略"></textarea></label><label>原始数据引用/哈希<input id="metadata-raw-ref" type="text" placeholder="文件编号、对象路径或 SHA-256"></label>');
  if (!$('#metadata-acquisition-record')) additions.push('<label>结构化采集记录（JSON）<textarea id="metadata-acquisition-record" rows="6" placeholder=\'{"samplingFrequencyHz":10,"synchronization":{"status":"verified","clockReference":"DAQ-CLK-01"},"channels":[{"field":"current_a","channelId":"CH-01","unit":"A"}],"evidenceRef":"ACQ-001"}\'></textarea></label>');
  if (!$('#metadata-precheck-items')) additions.push('<label>结构化前检查项目（JSON）<textarea id="metadata-precheck-items" rows="6" placeholder=\'[{"id":"device_identity","status":"pass","evidenceRef":"PC-001"}]\'></textarea></label>');
  if (!$('#metadata-test-stages')) additions.push('<label>结构化测试阶段（JSON）<textarea id="metadata-test-stages" rows="7" placeholder=\'[{"id":"test_plan","status":"complete","evidenceRef":"TP-001"}]\'></textarea></label>');
  if (!$('#metadata-test-system')) additions.push('<label>测试系统组成证据（JSON）<textarea id="metadata-test-system" rows="8" placeholder=\'[{"id":"power_supply","status":"pass","evidenceRef":"SYS-001"}]\'></textarea></label>');
  if (!$('#metadata-test-conditions')) additions.push('<label>结构化测试条件（JSON）<textarea id="metadata-test-conditions" rows="7" placeholder=\'{"testSite":"台架A","ambientTemperatureC":25,"systemConfigurationRef":"CFG-001","abnormalDispositionRef":"ABN-001","evidenceRef":"COND-001"}\'></textarea></label>');
  if (!$('#metadata-environment-conditions')) additions.push('<label>环境条件证据（JSON）<textarea id="metadata-environment-conditions" rows="6" placeholder=\'{"ambientTemperatureC":25,"ambientHumidityPct":50,"ambientPressureKpa":101,"evidenceRef":"ENV-001"}\'></textarea></label>');
  if (!$('#metadata-measurement-methods')) additions.push('<label>结构化测量方法记录（JSON）<textarea id="metadata-measurement-methods" rows="7" placeholder=\'[{"id":"electrical_input","methodRef":"METHOD-E-001","evidenceRef":"MEAS-E-001"}]\'></textarea></label>');
  if (!$('#metadata-efficiency-record')) additions.push('<label>效率结果记录（JSON）<textarea id="metadata-efficiency-record" rows="5" placeholder=\'{"valuePct":null,"formulaRef":"企业批准公式编号","sourceRef":"效率结果证据编号"}\'></textarea></label>');
  if (!$('#metadata-phase-results')) additions.push('<label>方法阶段结果证据（JSON）<textarea id="metadata-phase-results" rows="8" placeholder=\'[{"phase":"steady","status":"complete","evidenceRef":"RESULT-001"}]\'></textarea></label>');
  if (!$('#metadata-formula-review')) additions.push('<label>工作簿公式复核证据（JSON）<textarea id="metadata-formula-review" rows="5" placeholder=\'{"reviewerId":"工号-001","reviewedAt":"2026-08-23","evidenceRef":"FORMULA-REVIEW-001","sourceHash":"SHA-256:...","decision":"cached_values_reviewed"}\'></textarea></label>');
  if (!$('#metadata-traceability')) additions.push('<label>测试对象追溯信息（JSON）<textarea id="metadata-traceability" rows="6" placeholder=\'{"testRunId":"TR-2026-001","deviceId":"PEM-001","testType":"性能测试","testDate":"2026-08-23","cellCount":100,"activeAreaCm2":100,"evidenceRef":"TRACE-001"}\'></textarea></label>');
  if (!$('#metadata-edit-log')) additions.push('<label>人工修改审计记录（JSON）<textarea id="metadata-edit-log" rows="7" placeholder=\'[{"field":"pressure_bar","oldValueSummary":"原始列值摘要","newValueSummary":"人工修正后摘要","operator":"工号-001","timestamp":"2026-08-23T12:00:00+08:00","reason":"校正单位定义","evidenceRef":"EDIT-001"}]\'></textarea></label>');
  if (additions.length) container.insertAdjacentHTML('beforeend', additions.join(''));
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
  const vehicleTargetsInput = $('#vehicle-targets')?.value?.trim();
  const vehicleSignal = $('#vehicle-signal')?.value?.trim() || '';
  const vehicleSignalSecondary = $('#vehicle-signal-secondary')?.value;
  const vehicleStartS = optionalNumber('vehicle-start-s');
  const vehicleEndS = optionalNumber('vehicle-end-s');
  const durabilityDeviation = optionalNumber('durability-max-deviation');
  const durabilityCellVoltage = optionalNumber('durability-min-cell-voltage');
  const jsonField = (id) => {
    const value = $(`#${id}`)?.value?.trim();
    if (!value) return [];
    try { return JSON.parse(value); } catch { return { __invalidJson: true }; }
  };
  const jsonObjectField = (id) => {
    const value = $(`#${id}`)?.value?.trim();
    if (!value) return {};
    try { return JSON.parse(value); } catch { return { __invalidJson: true }; }
  };
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
    evaluationMode: profile?.evaluationMode ?? 'risk_screening',
    approvalEvidence: profile?.approvalEvidence ?? null,
    applicationScope: profile?.applicationScope ?? null,
    intendedUse: profile?.intendedUse ?? null,
    methodId: profile?.methodId ?? null,
    revision: profile?.revision ?? null,
        standardRefs: profile?.standardRefs ?? [],
        standardEvidenceBinding: profile?.standardEvidenceBinding ?? null,
    methodSource: profile?.methodSource ?? null,
    methodImplementationEvidence: profile?.methodImplementationEvidence ?? null,
    methodExecutionStatus: profile?.methodExecutionStatus ?? null,
    status: profile?.status ?? null,
    publicationDate: profile?.publicationDate ?? null,
    effectiveDate: profile?.effectiveDate ?? null,
    scopeEvidence: profile?.scopeEvidence ?? null,
    workflowEvidence: profile?.workflowEvidence ?? null,
    requiredMetadata: profile?.requiredMetadata ?? [],
    traceabilityRequirements: profile?.traceabilityRequirements ?? null,
    editLogRequirements: profile?.editLogRequirements ?? null,
    requiredMeasurements: profile?.requiredMeasurements ?? [],
    acquisitionRequirements: profile?.acquisitionRequirements ?? null,
    preCheckRequirements: profile?.preCheckRequirements ?? [],
    dataQualityRequirements: profile?.dataQualityRequirements ?? null,
    requiredPhases: profile?.requiredPhases ?? [],
    requiredPhaseMetrics: profile?.requiredPhaseMetrics ?? {},
    phaseAcceptanceRules: profile?.phaseAcceptanceRules ?? [],
    phaseAliases: profile?.phaseAliases ?? {},
    requiredTestStages: profile?.requiredTestStages ?? [],
    workflowSequence: profile?.workflowSequence ?? [],
    testSystemRequirements: profile?.testSystemRequirements ?? [],
    testConditionRequirements: profile?.testConditionRequirements ?? null,
    environmentConditionRequirements: profile?.environmentConditionRequirements ?? null,
    phaseResultRequirements: profile?.phaseResultRequirements ?? [],
    measurementMethodRequirements: profile?.measurementMethodRequirements ?? [],
    dynamicPowerAnalysis: profile?.dynamicPowerAnalysis ?? { enabled: false },
    efficiencyRequirement: profile?.efficiencyRequirement ?? null,
    scopeRules: profile?.scopeRules ?? null,
    instrumentRequirements: profile?.instrumentRequirements ?? [],
    reportRequirements: profile?.reportRequirements ?? [],
    acceptanceRules: profile?.acceptanceRules ?? [],
    supportedDatasetTypes: profile?.supportedDatasetTypes ?? [],
    vehicleTargets: vehicleTargetsInput ? vehicleTargetsInput.split(',').map((value) => Number(value.trim())).filter(Number.isFinite) : profile?.vehicleTargets ?? [],
    vehicleCurrentToleranceA: optionalNumber('vehicle-tolerance') ?? profile?.vehicleCurrentToleranceA ?? 5,
    vehicleMinimumDurationS: optionalNumber('vehicle-duration') ?? profile?.vehicleMinimumDurationS ?? 180,
    vehicleTrendXAxis: $('#vehicle-trend-x-axis')?.value || profile?.vehicleTrendXAxis || 'runtime_h',
    vehicleTrendModel: $('#vehicle-trend-model')?.value || profile?.vehicleTrendModel || 'linear',
    vehicleDynamicAnalysis: profile?.vehicleDynamicAnalysis ?? null,
    vehicleUnitEvidenceRequired: profile?.vehicleUnitEvidenceRequired === true,
    vehicleSignal,
    ...(vehicleSignalSecondary !== undefined ? { vehicleSignalSecondary: vehicleSignalSecondary.trim() } : {}),
    vehicleStartS,
    vehicleEndS,
    durabilityRules: { ...profile?.durabilityRules, ...(durabilityDeviation !== null ? { maxDeviationMv: durabilityDeviation } : {}), ...(durabilityCellVoltage !== null ? { minAverageCellVoltageMv: durabilityCellVoltage } : {}) },
    acceptanceCriteria: profile?.acceptanceCriteria ?? {},
    uncertaintyModelRequired: profile?.uncertaintyModelRequired ?? false,
    uncertaintyModel: profile?.uncertaintyModel ?? null,
    fieldMapping: state.fieldMapping,
    sourceHash: state.rawDataHash ? 'SHA-256:' + state.rawDataHash : null,
    parameterConfig: state.parameterConfig,
    workbookEvidence: state.workbookEvidence,
    stackSelectionOverrides: state.stackSelectionOverrides,
    durabilityReports: state.durabilityReports,
    stoichConfig: profile?.stoichConfig ?? null,
    testMetadata: {
      testPurpose: $('#metadata-purpose').value.trim(),
      testPlanRef: $('#metadata-test-plan').value.trim(),
      acquisitionPlan: $('#metadata-acquisition').value.trim(),
      acquisitionRecord: jsonObjectField('metadata-acquisition-record'),
      preCheckRecord: $('#metadata-precheck').value.trim(),
      preCheckItems: jsonField('metadata-precheck-items'),
      testStages: jsonField('metadata-test-stages'),
      testSystemEvidence: jsonField('metadata-test-system'),
      testConditions: jsonObjectField('metadata-test-conditions'),
      environmentConditions: jsonObjectField('metadata-environment-conditions'),
      measurementMethodRecords: jsonField('metadata-measurement-methods'),
      efficiencyRecord: jsonObjectField('metadata-efficiency-record'),
    phaseResults: jsonField('metadata-phase-results'),
      traceability: jsonObjectField('metadata-traceability'),
      editLog: jsonField('metadata-edit-log'),
      instrumentIds: $('#metadata-instruments').value.trim(),
      instrumentAccuracy: $('#metadata-instrument-accuracy').value.trim(),
      calibrationRefs: $('#metadata-calibration').value.trim(),
      instrumentRecords: jsonField('metadata-instrument-records'),
      environment: $('#metadata-environment').value.trim(),
      operator: $('#metadata-operator').value.trim(),
      operatorQualification: $('#metadata-operator-qualification')?.value?.trim() || '',
      formulaRefs: $('#metadata-formulas').value.trim(),
      formulaReviewEvidence: jsonObjectField('metadata-formula-review'),
      uncertaintyPolicy: $('#metadata-uncertainty').value.trim(),
      rawDataRef: $('#metadata-raw-ref').value.trim(),
      signoff: $('#metadata-signoff').value.trim(),
      deviceFamily: $('#metadata-device-family').value.trim(),
      ratedHydrogenPressureMpa: $('#metadata-rated-pressure').value.trim(),
      ratedHydrogenProductionM3h: $('#metadata-rated-production').value.trim()
    }
  };
}

function renderProfileOptions() {
  $('#profile-select').innerHTML = `${state.profileCatalog.map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}</option>`).join('')}<option value="${escapeHtml(CUSTOM_PROFILE_ID)}">自定义阈值 · 当前会话</option>`;
}

function applyProfile(profileId) {
  const profile = getProfile(profileId, state.profileCatalog);
  if (profileId !== CUSTOM_PROFILE_ID && !profile) {
    $('#profile-note').textContent = `未知 profile：${profileId}；已阻断切换，请选择当前列表中的 profile。`;
    return;
  }
  $('#profile-select').value = profileId;
  const evaluationMode = profileId === CUSTOM_PROFILE_ID ? 'risk_screening' : (profile?.evaluationMode || 'risk_screening');
  const thresholdInputs = ['max-temperature', 'max-pressure', 'max-leak', 'max-voltage-std', 'max-pressure-drift'];
  thresholdInputs.forEach((id) => { const input = $(`#${id}`); if (input) input.disabled = evaluationMode === 'descriptive_only'; });
  const thresholdNote = evaluationMode === 'descriptive_only' ? ' · 当前仅描述性分析，未执行阈值/验收判定' : '';
  if (profileId !== CUSTOM_PROFILE_ID) {
    $('#max-temperature').value = profile.thresholds?.maxTemperatureC ?? DEFAULT_CONFIG.maxTemperatureC;
    $('#max-pressure').value = profile.thresholds?.maxPressureBar ?? DEFAULT_CONFIG.maxPressureBar;
    $('#max-leak').value = profile.thresholds?.maxLeakPpm ?? DEFAULT_CONFIG.maxLeakPpm;
    $('#max-voltage-std').value = profile.thresholds?.maxVoltageStdV ?? DEFAULT_CONFIG.maxVoltageStdV;
    $('#max-pressure-drift').value = profile.thresholds?.maxPressureDriftBarPerMin ?? DEFAULT_CONFIG.maxPressureDriftBarPerMin;
    if (profile.fieldMapping && Object.keys(profile.fieldMapping).length) {
      state.fieldMapping = profile.fieldMapping;
      renderSchema({ mapping: state.fieldMapping, conversions: {}, mappingWarnings: [], sourceFieldMap: state.fieldMapping });
    }
    const references = profile.standardRefs?.length ? ` · 标准 ${profile.standardRefs.map((reference) => reference.id).join('、')}` : '';
    const approvalEvidence = profile.approvalStatus === 'approved' ? (profile.approvalEvidence ? '审批证据已提供' : '审批证据缺失') : '非 approved 路径';
    $('#profile-note').textContent = `${state.profileOrganization} · ${profile.source} · ${profile.approvalStatus || '未指定审批状态'} · ${approvalEvidence}${references} · 模式 ${evaluationMode}${thresholdNote} · ${profile.description}`;
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
  if (state.rows.length) void analyzeCurrent('应用企业配置');
}

function verdictLabel(verdict) {
  return verdict === 'PASS' ? '通过' : verdict === 'WARN' ? '需复核' : verdict === 'DESCRIPTIVE' ? '仅描述' : '未通过';
}

function qualityMeter(completenessPct) {
  const pct = Number.isFinite(completenessPct) ? Math.max(0, Math.min(100, completenessPct)) : null;
  const width = pct === null ? '0%' : `${pct}%`;
  const badge = pct === null ? '' : pct >= 98 ? '<span class="quality-badge good" aria-hidden="true">完整</span>' : pct >= 90 ? '<span class="quality-badge warn" aria-hidden="true">缺口</span>' : '<span class="quality-badge danger" aria-hidden="true">缺口</span>';
  return `<div class="quality-meter" role="progressbar" aria-valuenow="${pct === null ? 0 : pct}" aria-valuemin="0" aria-valuemax="100" aria-label="数据完整率">${badge}<span style="width:${width}"></span></div>`;
}

function showMetricSkeletons() {
  const grid = $('#metric-grid');
  if (!grid) return;
  grid.innerHTML = Array.from({ length: 8 }).map(() => `<article class="metric-card skeleton skeleton-card"><div class="skeleton-text short"></div><div class="skeleton-text"></div><div class="skeleton-text"></div></article>`).join('');
  const chartWrap = $('#trend-chart')?.parentElement;
  if (chartWrap && !chartWrap.querySelector('.chart-skeleton-message')) {
    chartWrap.classList.add('chart-loading');
    chartWrap.insertAdjacentHTML('beforeend', '<div class="chart-skeleton-message empty-state" style="position:absolute;inset:0;z-index:3;pointer-events:none;"><strong>图表加载中</strong><span>分析完成后将在此渲染趋势图</span></div>');
  }
  ['enterprise-chart', 'enterprise-performance-chart'].forEach((id) => {
    const canvas = $(`#${id}`);
    const wrap = canvas?.parentElement;
    if (wrap && !wrap.querySelector('.chart-skeleton-message')) {
      wrap.classList.add('chart-loading');
      wrap.insertAdjacentHTML('beforeend', `<div class="chart-skeleton-message empty-state" style="position:absolute;inset:0;z-index:3;pointer-events:none;"><strong>图表加载中</strong><span>识别到企业数据后将显示专用图表</span></div>`);
    }
  });
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
    $('#metric-grid').innerHTML = cards.map(([label, value, tone, note]) => `<article class="metric-card ${tone}"><span>${label}</span><strong>${value}${label === '数据完整率' ? qualityMeter(metrics.completenessPct) : ''}</strong><small>${note}</small></article>`).join('');
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
    $('#metric-grid').innerHTML = cards.map(([label, value, tone, note]) => `<article class="metric-card ${tone}"><span>${label}</span><strong>${value}${label === '数据完整率' ? qualityMeter(metrics.completenessPct) : ''}</strong><small>${note}</small></article>`).join('');
    if (dataset.dynamicAnalysis?.enabled) {
      const dynamic = dataset.dynamicAnalysis;
      $('#enterprise-summary').insertAdjacentHTML('afterbegin', `<div class="enterprise-facts"><span><b>${dynamic.eventCount}</b> 个动态负载事件</span><span><b>${dynamic.settledEventCount}</b> 个进入响应带</span><span><b>${dynamic.unsettledEventCount}</b> 个未稳定事件</span><span><b>${dynamic.dataGapCount}</b> 个动态数据缺口</span></div><div class="enterprise-note">动态信号：${escapeHtml(dynamic.commandField)} → ${escapeHtml(dynamic.actualField)}；指标仅作描述性响应统计，不含标准限值。</div>`);
    }
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
    $('#metric-grid').innerHTML = cards.map(([label, value, tone, note]) => `<article class="metric-card ${tone}"><span>${label}</span><strong>${value}${label === '数据完整率' ? qualityMeter(metrics.completenessPct) : ''}</strong><small>${note}</small></article>`).join('');
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
  $('#metric-grid').innerHTML = cards.map(([label, value, tone, note]) => `<article class="metric-card ${tone}"><span>${label}</span><strong>${value}${label === '数据完整率' ? qualityMeter(metrics.completenessPct) : ''}</strong><small>${note}</small></article>`).join('');
}

function renderCalculationSummary(result) {
  const element = $('#calculation-summary');
  if (!element) return;
  const metrics = result.metrics || {};
  const datasetMetrics = result.dataset?.metrics || {};
  const quality = result.quality || {};
  const powerSource = metrics.powerSource || datasetMetrics.powerSource || null;
  const powerLabels = { checked: '原始功率 + 电压×电流交叉核算', mixed: '原始功率部分覆盖 · 缺失段派生', raw_only: '原始功率通道（未交叉核算）', derived_only: '电压×电流派生功率', not_available: '当前数据集未提供功率口径' };
  const powerEvidence = metrics.powerCrossCheck || datasetMetrics.powerCrossCheck || {};
  const integrationEvidence = metrics.integrationEvidence || {};
  const skippedIntegrationGaps = Math.max(Number(integrationEvidence.hydrogenVolume?.skippedGapCount || 0), Number(integrationEvidence.energyConsumed?.skippedGapCount || 0));
  const skippedSessionBoundaries = Math.max(Number(integrationEvidence.hydrogenVolume?.skippedSessionBoundaryCount || 0), Number(integrationEvidence.energyConsumed?.skippedSessionBoundaryCount || 0));
  const sessionNote = Number(metrics.sessionCount || 0) > 1 ? ` · ${metrics.sessionCount} 个会话 · 总观测 ${fmt(metrics.sessionDurationS, 3)} s` : '';
  const powerDetail = powerEvidence.maxRelativeDifferencePct !== null && powerEvidence.maxRelativeDifferencePct !== undefined
    ? `最大交叉差异 ${fmt(powerEvidence.maxRelativeDifferencePct, 2)}%`
    : powerEvidence.rawPowerCount ? `${powerEvidence.rawPowerCount} 条原始功率记录` : '未把设定值当作实测功率';
  const timeDetail = quality.medianIntervalS !== undefined
    ? `中位 ${fmt(quality.medianIntervalS, 3)} s · 最大 ${fmt(quality.maximumIntervalS, 3)} s · ${quality.samplingGapCount === null ? '缺口上限未配置' : `缺口 ${quality.samplingGapCount} 个`}${sessionNote}${skippedIntegrationGaps ? ` · 积分跳过 ${skippedIntegrationGaps} 段` : ''}${skippedSessionBoundaries ? ` · 文件边界 ${skippedSessionBoundaries} 个` : ''}`
    : '企业适配器按源文件/会话分别统计';
  const mappingDetail = result.schema
    ? `${result.schema.mappedCount}/${result.schema.fieldCount} 核心字段 · 单位换算 ${Object.values(result.schema.conversions || {}).filter((item) => item.mode !== 'identity').length} 项`
    : `${datasetMetrics.coverage?.analysisSignals ?? '—'} 列进入核心/交叉核对 · 其余保留目录`;
  const uncertainty = result.uncertainty?.status === 'calculated'
    ? `已传播 · k=${result.uncertainty.coverageFactor}`
    : result.uncertainty?.status === 'invalid'
      ? '模型无效，已阻断不确定度门控'
      : '未配置；不代表不确定度为零';
  element.innerHTML = `<div class="calculation-summary-head"><span>计算口径</span><small>结果可追溯，但仍需企业方法与人工复核</small></div><div class="calculation-strip"><span><b>功率</b>${powerLabels[powerSource] || '企业适配器源字段口径'}<small>${powerDetail}</small></span><span><b>时间轴</b>按原始时间戳计算<small>${timeDetail}</small></span><span><b>字段与单位</b>映射后再计算<small>${mappingDetail}</small></span><span><b>不确定度</b>${uncertainty}<small>需要企业批准模型才可进入正式门控</small></span></div>`;
}

function renderMetricTrace(result) {
  const element = $('#metric-trace');
  if (!element) return;
  const entries = Object.values(result.metricTrace?.metrics || {});
  if (!entries.length) {
    element.innerHTML = '<p class="metric-trace-empty">当前分析没有可展示的字段级 trace；不据此声称已绑定原始证据。</p>';
    return;
  }
  const text = (value) => escapeHtml(value === null || value === undefined || value === '' ? '—' : String(value));
  const locatorText = (locator) => (locator?.groups || []).map((group) => {
    const rows = group.rowStart === null ? '行未绑定' : '行 ' + group.rowStart + '–' + group.rowEnd;
    const time = group.timeStartS === null ? '' : '；t ' + fmt(group.timeStartS, 3) + '–' + fmt(group.timeEndS, 3) + ' s';
    return group.fileToken + ' · ' + rows + time;
  }).join('；') || '未绑定';
  const body = entries.map((item) => '<tr><th scope="row">' + text(item.metricName) + '</th><td>' + text(item.sourceFieldLabels?.join('；')) + '</td><td><code>' + text(item.evidenceId) + '</code></td><td>' + text(item.sourceHashStatus) + '</td><td>' + text(locatorText(item.locator)) + '</td><td>' + text(item.derivation) + '</td><td>' + text(item.status) + '</td></tr>').join('');
  element.innerHTML = '<p class="metric-trace-note">trace 只显示 canonical 字段、证据 ID、输入 hash 状态和脱敏定位；它用于工程复核，不等于标准符合性或企业放行证据。</p><div class="metric-trace-scroll"><table><thead><tr><th>指标</th><th>来源字段</th><th>evidenceId</th><th>hash</th><th>定位</th><th>关系</th><th>状态</th></tr></thead><tbody>' + body + '</tbody></table></div>';
}

function renderIssues(result) {
  const severityLabel = { critical: '高优先级', warn: '建议复核', info: '信息' };
  const list = $('#issue-list');
  if (!list) return;
  if (!result.issues.length) {
    list.innerHTML = '<div class="issue"><div class="issue-mark">✓</div><div><div class="issue-heading"><b>未发现需要关注的问题</b><span>信息</span></div><p>当前分析未触发高优先级或建议复核项；正式结论仍需工程师签核。</p><small>建议动作：继续执行企业复核流程，或调整阈值后重新分析。</small></div></div>';
    $('#issue-count').textContent = '0 项需要关注';
    return;
  }
  list.innerHTML = result.issues.map((item) => `<article class="issue ${item.severity}"><div class="issue-mark">${item.severity === 'critical' ? '!' : item.severity === 'warn' ? '~' : 'i'}</div><div><div class="issue-heading"><b>${escapeHtml(item.title)}</b><span>${severityLabel[item.severity]}</span></div><p>${escapeHtml(item.evidence)}</p><small>建议动作：${escapeHtml(item.recommendation)}</small></div></article>`).join('');
  $('#issue-count').textContent = `${result.issues.filter((item) => item.severity !== 'info').length} 项需要关注`;
}

const phaseMetricLabels = {
  durationS: ['持续时间', 's', 0],
  energyConsumedWh: ['电能', 'Wh', 3],
  hydrogenVolumeNl: ['产氢量', 'NL', 3],
  specificEnergyKWhPerNm3: ['单位电耗', 'kWh/Nm³', 3],
  powerRangeW: ['功率范围', 'W', 1],
  maxRampUpWPerS: ['最大加载速率', 'W/s', 3],
  maxRampDownWPerS: ['最大减载速率', 'W/s', 3],
  peakPowerW: ['峰值功率', 'W', 1],
  minimumPowerW: ['最小功率', 'W', 1],
  maximumPowerW: ['最大功率', 'W', 1],
  validDataCoveragePct: ['有效数据覆盖', '%', 2]
};

function phaseMetricMarkup(metric, value) {
  const [label, unit, digits] = phaseMetricLabels[metric];
  return `<span class="phase-metric"><small>${label}</small><b>${fmt(value, digits)} ${unit}</b></span>`;
}

function renderPhases(result) {
  const phaseMetrics = result.phaseMetrics?.phases || {};
  const requiredMetrics = result.compliance?.requiredPhaseMetrics || {};
  const missingMetrics = result.compliance?.missingPhaseMetrics || [];
  const rows = result.phases || [];
  if (!rows.length) {
    $('#phase-list').innerHTML = '<div class="phase-empty">未识别到可展示的工况分段。导入含 phase 或时间戳清晰的稳态/动态数据后，系统会自动分段并显示指标。</div>';
    return;
  }
  $('#phase-list').innerHTML = rows.map((phase) => {
    const metric = Object.values(phaseMetrics).find((item) => item.labels?.includes(phase.phase));
    const fields = metric ? [...new Set(['durationS', ...(requiredMetrics[metric.phaseId] || [])])] : ['durationS'];
    const metricValues = fields.filter((field) => phaseMetricLabels[field]).map((field) => phaseMetricMarkup(field, field === 'durationS' ? (metric?.durationS ?? phase.durationS) : metric[field]));
    const missing = metric ? missingMetrics.filter((item) => item.startsWith(`${metric.phaseId}.`)).map((item) => item.slice(metric.phaseId.length + 1)) : [];
    const missingText = missing.length ? `<small class="phase-missing">待补齐：${missing.map((field) => phaseMetricLabels[field]?.[0] || field).join('、')}</small>` : '';
    const metricStatus = metric?.integrationStatus === 'complete' ? '已计算' : metric?.integrationStatus === 'partial_gap' ? '缺口阻断' : metric ? '需复核' : '分段';
    return `<div class="phase-row"><span class="phase-dot"></span><div class="phase-heading"><span>${escapeHtml(phase.phase)}</span><small>${phase.count} 条样本 · ${fmt(phase.durationS, 0)} s</small></div><b>${metricStatus}</b><div class="phase-metrics">${metricValues.join('')}</div>${missingText}</div>`;
  }).join('');
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
  $('#history-list').innerHTML = history.length ? history.map((item) => `<div class="history-row"><img class="history-thumb" src="${item.thumbnail || ''}" alt="" width="120" height="72" /><span><b>${escapeHtml(item.fileName)}</b><small>${new Date(item.savedAt).toLocaleString('zh-CN')} · ${escapeHtml(item.config?.profileName ?? '未指定模板')}</small></span><strong class="${String(item.verdict).toLowerCase()}">${verdictLabel(item.verdict)}</strong></div>`).join('') : '<div class="history-empty">还没有保存批次。保存后只保留摘要，不保留原始行。</div>';
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

function batchStatusLabel(status) {
  return status === 'ready' ? 'READY · 可继续复核' : status === 'not_ready' ? 'NOT_READY · 暂不汇总' : status === 'invalid' ? '声明无效' : '未提供声明';
}

function batchNumber(value, digits = 3) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : Number(value).toFixed(digits);
}

function renderBatchObservation() {
  const status = $('#batch-observation-status');
  const summary = $('#batch-observation-summary');
  const files = $('#batch-observation-files');
  const issues = $('#batch-observation-issues');
  if (!status || !summary || !files || !issues) return;
  if (!state.batchDeclarationInput) {
    status.textContent = '未提供声明';
    status.dataset.tone = 'neutral';
    summary.innerHTML = '<p class="batch-empty">先导入两个或以上可分析文件，再上传企业提供的批次声明 JSON。系统不会根据文件名或时间戳自行拼接连续试验。</p>';
    files.innerHTML = '';
    issues.innerHTML = '';
    return;
  }
  if (!state.batchValidation?.ok) {
    status.textContent = batchStatusLabel('invalid');
    status.dataset.tone = 'error';
    const count = state.batchValidation?.errors?.length || 0;
    summary.innerHTML = `<p class="batch-empty">声明结构未通过校验：${count} 项。请按示例补齐文件清单、顺序、时钟、采样和重启边界；原始声明值不在页面摘要中展开。</p>`;
    files.innerHTML = '';
    issues.innerHTML = '<div class="batch-issue-row danger"><b>声明门控</b><span>未进入批次分析</span></div>';
    return;
  }
  const publicGroups = state.batchSummaries;
  const groupStatus = publicGroups.length && publicGroups.every((group) => group.observation?.status === 'ready') ? 'ready' : 'not_ready';
  status.textContent = batchStatusLabel(groupStatus);
  status.dataset.tone = groupStatus === 'ready' ? 'ready' : 'error';
  summary.innerHTML = publicGroups.length ? publicGroups.map((group, index) => {
    const sampling = group.observation?.sampling || {};
    const issueCodes = group.observation?.issueCodes || [];
    return `<div class="batch-summary-row"><b>声明组 ${index + 1}</b><span>${group.fileCount} 文件 · ${Number(group.rowCount || 0).toLocaleString('zh-CN')} 行/功率点 · ${escapeHtml(group.status || 'descriptive_only')}</span><small>观测：${escapeHtml(group.observation?.status || 'not_evaluable')} · 采样：声明 ${batchNumber(sampling.declaredIntervalS)} s / 实际中位 ${batchNumber(sampling.observedMedianIntervalS)} s · 偏差 ${batchNumber(sampling.deviationPct)}%</small></div>`;
  }).join('') : '<p class="batch-empty">声明已通过结构校验，但没有可显示的批次组。</p>';
  files.innerHTML = publicGroups.flatMap((group, groupIndex) => (group.observation?.files || []).map((file, fileIndex) => `<div class="batch-file-row"><span>组 ${groupIndex + 1} · 文件 ${fileIndex + 1}</span><b>${escapeHtml(file.status || 'not_evaluable')}</b><small>${Number(file.rowCount || 0).toLocaleString('zh-CN')} 行 · 时间戳 ${file.timestampCount ?? 0} · 严格递增 ${file.strictIncreasing ? '是' : '否'} · 中位间隔 ${batchNumber(file.medianIntervalS)} s</small></div>`)).join('');
  issues.innerHTML = publicGroups.flatMap((group, groupIndex) => (group.observation?.issueCodes || []).map((code) => `<div class="batch-issue-row ${group.observation?.status === 'ready' ? 'info' : 'danger'}"><b>组 ${groupIndex + 1}</b><span>${escapeHtml(code)}</span></div>`)).join('') || '<div class="batch-issue-row info"><b>观测问题</b><span>未发现声明批次门控问题；汇总仍保持 descriptive_only。</span></div>';
}

async function evaluateDeclaredBatch() {
  if (!state.batchDeclarationInput) { state.batchValidation = null; state.batchSummaries = []; renderBatchObservation(); return; }
  const availableEntries = state.inputEntries.map(({ name, status, rows, contentHash, size }) => ({ name, status, rows, contentHash, size }));
  const validation = validateBatchDeclaration(state.batchDeclarationInput, availableEntries);
  state.batchValidation = validation;
  if (!validation.ok) { state.batchSummaries = []; renderBatchObservation(); return; }
  const config = configFromUI();
  const summaries = [];
  for (const group of validation.groups) {
    const groupEntries = group.fileOrder.map((name) => state.inputEntries.find((entry) => entry.name.replaceAll('\\', '/') === name)).filter(Boolean);
    const fileResults = groupEntries.map((entry) => ({ name: entry.name, result: analyzeRows(entry.rows, config) }));
    const datasetTypes = [...new Set(fileResults.map((item) => item.result.datasetType).filter(Boolean))];
    if (datasetTypes.length > 1) {
      summaries.push(publicBatchAggregation({ status: 'descriptive_only', mergeMode: 'declared_grouped_sessions', groupId: group.id, fileCount: groupEntries.length, rowCount: groupEntries.reduce((sum, entry) => sum + entry.rows.length, 0), sampling: { frequencyHz: group.samplingFrequencyHz, intervalS: group.samplingIntervalS, tolerancePct: group.samplingTolerancePct }, observation: { status: 'not_ready', issueCodes: ['BATCH_DATASET_TYPE_MISMATCH'], files: [], crossFile: [], issues: [] }, files: [], boundary: '数据集类型不一致；未生成跨文件描述性结果。' }));
      continue;
    }
    const observation = observeDeclaredBatch(group, fileResults);
    const combinedRows = annotateDeclaredBatchRows(group, groupEntries.map((entry) => ({ name: entry.name, rows: entry.rows })));
    const combinedResult = analyzeRows(combinedRows, config);
    summaries.push(publicBatchAggregation(summarizeDeclaredBatch(group, groupEntries, fileResults, combinedResult, observation)));
  }
  state.batchSummaries = summaries;
  renderBatchObservation();
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
    const windowedRows = result.datasetType === 'vehicle' && result.dataset?.analysisWindow
      ? rows.filter((row) => row.timestamp_s >= result.dataset.analysisWindow.startS && row.timestamp_s <= result.dataset.analysisWindow.endS)
      : rows;
    const chartRows = windowedRows.length ? windowedRows : rows;
    const pad = { left: 36, right: 18, top: 18, bottom: 28 };
    const x = (index) => pad.left + (index / Math.max(chartRows.length - 1, 1)) * (w - pad.left - pad.right);
    if (result.datasetType === 'vehicle') {
      const axes = [
        { field: 'selected_signal_value', color: '#d77cf2', label: result.dataset?.selectedSignal || '左轴信号', axis: 'left' },
        ...(result.dataset?.secondarySignal ? [{ field: 'secondary_signal_value', color: '#5bd4c0', label: result.dataset.secondarySignal, axis: 'right' }] : [])
      ];
      const valuesFor = (field) => chartRows.map((row) => row[field]).filter((item) => Number.isFinite(item));
      const scale = (field) => {
        const values = valuesFor(field);
        const min = values.length ? Math.min(...values) : 0;
        const max = values.length ? Math.max(...values) : 1;
        return { min, max, span: max - min || 1 };
      };
      const scales = Object.fromEntries(axes.map((item) => [item.axis, scale(item.field)]));
      const yFor = (axis, value) => h - pad.bottom - ((value - scales[axis].min) / scales[axis].span) * (h - pad.top - pad.bottom);
      ctx.strokeStyle = 'rgba(154, 172, 184, .14)'; ctx.lineWidth = 1;
      for (let i = 0; i < 4; i += 1) { const gy = pad.top + i * ((h - pad.top - pad.bottom) / 3); ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(w - pad.right, gy); ctx.stroke(); }
      ctx.font = '10px Avenir Next, sans-serif';
      ctx.fillStyle = '#71838a'; ctx.fillText(`${fmt(scales.left.min, 2)}–${fmt(scales.left.max, 2)}`, 4, pad.top + 10);
      if (scales.right) { ctx.fillStyle = '#71838a'; ctx.fillText(`${fmt(scales.right.min, 2)}–${fmt(scales.right.max, 2)}`, w - 62, pad.top + 10); }
      axes.forEach((item) => {
        ctx.strokeStyle = item.color; ctx.lineWidth = 1.8; ctx.beginPath(); let started = false; let previousSession = null;
        chartRows.forEach((row, index) => {
          const value = row[item.field];
          if (!Number.isFinite(value)) { started = false; return; }
          if (previousSession !== null && row.session_id !== previousSession) started = false;
          const pointX = x(index); const pointY = yFor(item.axis, value);
          if (!started) { ctx.moveTo(pointX, pointY); started = true; } else ctx.lineTo(pointX, pointY);
          previousSession = row.session_id;
        }); ctx.stroke();
      });
      ctx.font = '11px Avenir Next, sans-serif';
      axes.forEach((item, index) => { ctx.fillStyle = item.color; ctx.fillRect(pad.left + index * 130, h - 13, 12, 2); ctx.fillText(`${item.axis === 'left' ? '左轴' : '右轴'} · ${item.label}`, pad.left + 18 + index * 130, h - 9); });
      return;
    }
    const series = [['current_a', '#ef8f62', '电流'], ['avg_cell_voltage_v', '#5bd4c0', '平均单片电压'], ['power_kw', '#7c9df2', '功率']];
    const yFor = (field, value) => {
      const values = chartRows.map((row) => row[field]).filter((item) => item !== null);
      const min = Math.min(...values, 0); const max = Math.max(...values, 1); const span = max - min || 1;
      return h - pad.bottom - ((value - min) / span) * (h - pad.top - pad.bottom);
    };
    ctx.strokeStyle = 'rgba(154, 172, 184, .14)'; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i += 1) { const gy = pad.top + i * ((h - pad.top - pad.bottom) / 3); ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(w - pad.right, gy); ctx.stroke(); }
    series.forEach(([field, color]) => { ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.beginPath(); let started = false; let previousSession = null; chartRows.forEach((row, index) => { if (row[field] === null) { started = false; return; } if (previousSession !== null && row.session_id !== previousSession) started = false; const pointX = x(index); const pointY = yFor(field, row[field]); if (!started) { ctx.moveTo(pointX, pointY); started = true; } else ctx.lineTo(pointX, pointY); previousSession = row.session_id; }); ctx.stroke(); });
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
  } catch (error) {
    if (wrap) {
      wrap.classList.remove('chart-loading', 'chart-ready');
      wrap.classList.add('chart-error');
      const existing = wrap.querySelector('.chart-skeleton-message');
      if (!existing) {
        wrap.insertAdjacentHTML('beforeend', '<div class="chart-skeleton-message empty-state" style="position:absolute;inset:0;z-index:3;pointer-events:none;"><strong>图表渲染失败</strong><span>请检查数据格式后重试</span></div>');
      }
    }
  }
}

function drawEnterpriseChart(result) {
  const canvas = $('#enterprise-chart');
  const wrap = canvas?.parentElement;
  if (wrap) { wrap.classList.remove('chart-loading', 'chart-error'); wrap.classList.add('chart-ready'); const msg = wrap.querySelector('.chart-skeleton-message'); if (msg) msg.remove(); }
  if (!canvas || !result.datasetType) return;
  try {
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
  } catch (error) {
    if (wrap) {
      wrap.classList.remove('chart-loading', 'chart-ready');
      wrap.classList.add('chart-error');
      const existing = wrap.querySelector('.chart-skeleton-message');
      if (!existing) {
        wrap.insertAdjacentHTML('beforeend', '<div class="chart-skeleton-message empty-state" style="position:absolute;inset:0;z-index:3;pointer-events:none;"><strong>图表渲染失败</strong><span>请检查数据格式后重试</span></div>');
      }
    }
  }
}

function evaluateChartTrend(trend, xValue) {
  if (!trend || trend.status !== 'fitted' || !trend.coefficients || !Number.isFinite(xValue)) return null;
  const z = xValue - (trend.xOrigin || 0);
  return (trend.coefficients.quadratic || 0) * z ** 2 + (trend.coefficients.linear || 0) * z + (trend.coefficients.intercept || 0);
}

function drawEnterprisePerformanceChart(result) {
  const wrap = $('#enterprise-performance-chart-wrap'); const canvas = $('#enterprise-performance-chart');
  if (!wrap || !canvas) return;
  if (result.datasetType !== 'vehicle') { wrap.hidden = true; return; }
  wrap.hidden = false;
  const formal = Boolean(result.dataset.performancePoints?.length);
  const points = (formal ? result.dataset.performancePoints : result.dataset.inferredSegments || []).filter((point) => Number.isFinite(point.trendX) && Number.isFinite(point.averageCellVoltageV));
  const trend = formal ? result.dataset.performanceTrend?.averageCellVoltageV : result.dataset.descriptiveTrend?.averageCellVoltageV;
  const dpr = window.devicePixelRatio || 1; const width = canvas.clientWidth || 640; const height = canvas.clientHeight || 245; canvas.width = width * dpr; canvas.height = height * dpr;
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  const pad = { left: 50, right: 24, top: 20, bottom: 32 }; const plotW = width - pad.left - pad.right; const plotH = height - pad.top - pad.bottom; ctx.font = '10px Avenir Next, sans-serif'; ctx.fillStyle = '#71838a';
  if (!points.length) { ctx.fillText('暂无可绘制区间；输入企业目标电流后重新分析', pad.left, pad.top + 20); return; }
  const xValues = points.map((point) => point.trendX); const fittedValues = xValues.map((value) => evaluateChartTrend(trend, value)).filter(Number.isFinite); const yValues = points.map((point) => point.averageCellVoltageV).concat(fittedValues); const xMin = Math.min(...xValues); const xMax = Math.max(...xValues); const yMin = Math.min(...yValues) - 0.01; const yMax = Math.max(...yValues) + 0.01; const xSpan = xMax - xMin || 1; const ySpan = yMax - yMin || 1; const x = (value) => pad.left + (value - xMin) / xSpan * plotW; const y = (value) => pad.top + (yMax - value) / ySpan * plotH;
  ctx.strokeStyle = 'rgba(154,172,184,.16)'; for (let i = 0; i < 4; i += 1) { const gy = pad.top + i * plotH / 3; ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(width - pad.right, gy); ctx.stroke(); }
  const sorted = [...points].sort((a, b) => a.trendX - b.trendX); ctx.strokeStyle = '#5bd4c0'; ctx.lineWidth = 1.8; ctx.beginPath(); sorted.forEach((point, index) => { const px = x(point.trendX); const py = y(point.averageCellVoltageV); index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke();
  if (trend?.status === 'fitted') { const lineX = [xMin, xMax]; ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = '#e0aa49'; ctx.lineWidth = 1.6; ctx.beginPath(); lineX.forEach((value, index) => { const px = x(value); const py = y(evaluateChartTrend(trend, value)); index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke(); ctx.restore(); }
  points.forEach((point) => { ctx.fillStyle = point.status === 'short_stable' ? '#e0aa49' : '#127f79'; ctx.beginPath(); ctx.arc(x(point.trendX), y(point.averageCellVoltageV), 4, 0, Math.PI * 2); ctx.fill(); });
  const axisLabel = result.dataset.trendXAxis === 'timestamp' ? '实际日期/时间' : '运行时长（h）'; const modelLabel = trend?.model === 'quadratic' ? '二次多项式' : '线性'; const fitLabel = trend?.status === 'fitted' ? `R² ${fmt(trend.rSquared, 3)}` : '点数不足'; const startLabel = result.dataset.trendXAxis === 'timestamp' ? new Date(xMin * 86400000).toISOString().slice(0, 10) : `${fmt(xMin, 1)} h`; const endLabel = result.dataset.trendXAxis === 'timestamp' ? new Date(xMax * 86400000).toISOString().slice(0, 10) : `${fmt(xMax, 1)} h`;
  ctx.fillStyle = '#13262d'; ctx.fillText(formal ? '平均单体电压（V）' : '描述性候选区间 · 平均单体电压（V）', pad.left, 12); ctx.fillText(`${axisLabel} · ${modelLabel} · ${fitLabel}`, pad.left, height - 20); ctx.textAlign = 'right'; ctx.fillText(endLabel, width - pad.right, height - 8); ctx.textAlign = 'left'; ctx.fillText(startLabel, pad.left, height - 8);
}

function generateHistoryThumbnail(result) {
  try {
    const width = 200; const height = 120;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#0b1a1d'; ctx.fillRect(0, 0, width, height);
    const pad = { left: 26, right: 10, top: 14, bottom: 18 };
    const plotW = width - pad.left - pad.right; const plotH = height - pad.top - pad.bottom;
    const grid = () => { ctx.strokeStyle = 'rgba(154,172,184,.12)'; ctx.lineWidth = 1; for (let i = 0; i < 3; i += 1) { const y = pad.top + i * plotH / 2; ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke(); } };
    const series = (() => {
      if (!result || !Array.isArray(result.rows) || !result.rows.length) return null;
      if (result.datasetType === 'durability') {
        const points = (result.dataset?.points || []).filter((point) => Number.isFinite(point.averageCellVoltageMv));
        if (!points.length) return null;
        const values = points.map((point) => point.averageCellVoltageMv);
        const x = (index) => pad.left + index / Math.max(points.length - 1, 1) * plotW;
        const y = (value) => { const min = Math.min(...values); const max = Math.max(...values); const span = max - min || 1; return pad.top + (max - value) / span * plotH; };
        grid();
        ctx.strokeStyle = '#5bd4c0'; ctx.lineWidth = 1.6; ctx.beginPath(); points.forEach((point, index) => { const px = x(index); const py = y(point.averageCellVoltageMv); index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke();
        return { label: '平均单体 mV', color: '#5bd4c0' };
      }
      const values = result.rows.map((row) => num(row.current_a)).filter(Number.isFinite);
      if (!values.length) return null;
      const x = (index) => pad.left + index / Math.max(result.rows.length - 1, 1) * plotW;
      const y = (value) => { const min = Math.min(...values); const max = Math.max(...values); const span = max - min || 1; return pad.top + (max - value) / span * plotH; };
      grid();
      ctx.strokeStyle = '#5bd4c0'; ctx.lineWidth = 1.6; ctx.beginPath(); values.forEach((value, index) => { const px = x(index); const py = y(value); index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke();
      return { label: '电流 A', color: '#5bd4c0' };
    })();
    if (!series) { ctx.fillStyle = '#71838a'; ctx.font = '10px Avenir Next, sans-serif'; ctx.fillText('暂无时序数据', pad.left, pad.top + 14); }
    ctx.fillStyle = '#a4b5bd'; ctx.font = '9px Avenir Next, sans-serif'; ctx.fillText(series?.label || '', pad.left, height - 4);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function renderReport(result, draft = state.aiDraft) {

function renderComplianceHistory() {
  const container = $('#compliance-history-list');
  if (!container) return;
  const history = state.complianceHistory || [];
  if (!history.length) {
    container.innerHTML = '<div class="compliance-history-empty">暂无标准符合性历史记录；重新分析将追加审计快照。</div>';
    return;
  }
  container.innerHTML = history.map((item) => {
    const statusClass = String(item.status || '').toLowerCase().replaceAll('_', '-');
    const time = new Date(item.savedAt || item.evaluatedAt).toLocaleString('zh-CN');
    const methodInfo = item.methodId ? `方法 ${escapeHtml(item.methodId)}${item.revision ? `/${escapeHtml(item.revision)}` : ''}` : '方法未声明';
    const standardInfo = item.standardRefsCount ? `标准 ${item.standardRefsCount} 项` : '标准未配置';
    const rowCountInfo = item.datasetRowCount ? `${item.datasetRowCount.toLocaleString('zh-CN')} 条记录` : '无数据记录';
    const statusIcon = item.status === 'READY_FOR_HUMAN_REVIEW' ? '✓' : item.status === 'NOT_READY' ? '!' : '·';
    const statusTitle = item.status === 'READY_FOR_HUMAN_REVIEW' ? '可进入人工复核' : item.status === 'NOT_READY' ? '资料不完整' : '仅演示';
    return `<div class="compliance-history-row"><span class="compliance-history-time">${escapeHtml(time)}</span><span class="compliance-history-status ${statusClass}" title="${escapeHtml(statusTitle)}">${statusIcon} ${escapeHtml(item.label || item.status || '未评估')}</span><small>${escapeHtml(methodInfo)} · ${escapeHtml(standardInfo)} · ${escapeHtml(rowCountInfo)}</small><small>审批 ${escapeHtml(item.approvalStatus || '未指定')} · 方法 ${escapeHtml(item.methodExecutionStatus || '未声明')} · 证据 ${item.evidenceReadyCount || 0}/${item.evidenceTotalCount || 0}</small>${item.missingSummary?.length ? `<small class="compliance-history-missing">缺失：${escapeHtml(item.missingSummary.slice(0, 6).join('、'))}${item.missingSummary.length > 6 ? '…' : ''}</small>` : ''}</div>`;
  }).join('');
}
  const status = verdictLabel(result.verdict);
  const gateLabel = result.releaseGate?.status === 'HUMAN_REVIEW_PACKAGE' ? '人工复核包' : result.releaseGate?.status === 'STANDARD_EVIDENCE_PACKAGE' ? '标准流程证据包' : '分析草稿';
  const compliance = result.compliance || {};
  const standardIds = (Array.isArray(compliance.standardRefs) ? compliance.standardRefs : []).map((reference) => reference.id).filter(Boolean);
  const reportFacts = `<div class="report-facts"><span><b>标准引用</b>${escapeHtml(standardIds.length ? standardIds.join('、') : '未配置')}</span><span><b>方法状态</b>${escapeHtml(compliance.methodExecutionStatus || '未声明')}</span><span><b>交付级别</b>${escapeHtml(result.releaseGate?.status || 'ANALYSIS_DRAFT')}</span><span><b>合规结论</b>不由系统自动声明</span></div>`;
  const missingItems = [
    ...(compliance.missingProfileFields || []),
    ...(compliance.missingMeasurements || []),
    ...(compliance.missingPhases || []),
    ...(compliance.missingPhaseMetrics || []),
    ...(compliance.missingMetadata || [])
  ];
  const approvalDetail = compliance.approvalEvidence?.ready ? '审批证据已形成' : (compliance.approvalEvidence?.evidence || '审批证据未形成');
  const standardDetail = compliance.standardReferenceEvidence?.ready ? '标准引用证据已形成' : (compliance.standardReferenceEvidence?.evidence || '标准引用证据未形成');
  const methodDetail = compliance.methodImplementationEvidence?.ready ? '方法实施证据已形成' : (compliance.methodImplementationEvidence?.evidence || '方法实施证据未形成');
  const gateEntries = [
    ['scope', compliance.scope],
    ['instruments', compliance.instruments],
    ['acceptance', compliance.acceptance],
    ['report', compliance.report],
    ['testStages', compliance.testStages],
    ['testSystem', compliance.testSystem],
    ['testConditions', compliance.testConditions],
    ['environmentConditions', compliance.environmentConditions],
    ['measurementMethods', compliance.measurementMethods],
    ['phaseResults', compliance.phaseResults],
    ['efficiency', compliance.efficiency],
    ['measurements', compliance.measurements],
    ['phases', compliance.phases],
    ['acquisition', compliance.acquisition],
    ['preCheck', compliance.preCheck],
    ['dataQuality', compliance.dataQuality]
  ].filter(([, value]) => value && typeof value === 'object');
  const readyGateCount = gateEntries.filter(([, value]) => value.ready).length;
  const gateSummary = gateEntries.length ? `<span><b>证据门控</b>${readyGateCount}/${gateEntries.length} 项就绪</span>` : '';
  const evidenceReadyCount = compliance.auditTrail?.evidenceReadyCount ?? 0;
  const evidenceTotalCount = compliance.auditTrail?.evidenceTotalCount ?? 0;
  const evidencePct = evidenceTotalCount ? Math.round((evidenceReadyCount / evidenceTotalCount) * 100) : 0;
  const evidenceBar = evidenceTotalCount ? `<div class="compliance-evidence-bar" role="progressbar" aria-valuenow="${evidencePct}" aria-valuemin="0" aria-valuemax="100" aria-label="证据就绪比例"><div class="compliance-evidence-bar-fill" style="width:${evidencePct}%"></div><small>证据就绪 ${evidenceReadyCount}/${evidenceTotalCount} · ${evidencePct}%</small></div>` : '';
  const methodId = escapeHtml(compliance.methodId || '未配置');
  const revision = escapeHtml(compliance.revision || '—');
  const standardRefsCount = (compliance.standardRefs || []).length;
  const standardRefsDetail = standardRefsCount ? `${standardRefsCount} 项（${standardIds.length ? standardIds.join('、') : '已绑定'}）` : '未配置';
  const gateRows = gateEntries.map(([key, value]) => {
    const mark = value.ready ? '✓' : value.status === 'missing' || value.status === 'failed' || value.status === 'blocked' ? '!' : '·';
    const statusText = value.ready ? '就绪' : value.status === 'missing' ? '缺失' : value.status === 'failed' ? '未通过' : value.status === 'blocked' ? '已阻断' : '待补齐';
    return `<div class="compliance-gate-row"><span class="compliance-gate-mark">${mark}</span><span class="compliance-gate-label">${escapeHtml(key)}</span><small>${escapeHtml(value.evidence || '无证据')}</small><span class="compliance-gate-status ${value.ready ? 'ready' : value.status === 'missing' || value.status === 'failed' || value.status === 'blocked' ? 'danger' : 'warn'}">${statusText}</span></div>`;
  }).join('');
  const complianceStatusClass = String(result.compliance.status || '').toLowerCase().replaceAll('_', '-');
  const complianceStatusIcon = result.compliance.status === 'READY_FOR_HUMAN_REVIEW' ? '✓' : result.compliance.status === 'NOT_READY' ? '!' : '·';
  const complianceStatusTitle = result.compliance.status === 'READY_FOR_HUMAN_REVIEW' ? '可进入人工复核' : result.compliance.status === 'NOT_READY' ? '资料不完整' : '仅演示';
  const complianceSection = `<div class="compliance-evidence"><div class="compliance-evidence-head"><div><h3>标准符合性证据</h3><small>方法 ${methodId}/${revision} · 标准引用 ${standardRefsDetail} · 审批状态 ${escapeHtml(compliance.approvalStatus || '未指定')}</small></div><span class="compliance-status-badge ${complianceStatusClass}" title="${escapeHtml(complianceStatusTitle)}">${complianceStatusIcon} ${escapeHtml(result.compliance.label || '未评估')}</span></div><div class="compliance-evidence-grid"><span><b>检查标准</b>${escapeHtml(standardIds.length ? standardIds.join('、') : '未配置')}</span><span><b>Profile 审批状态</b>${escapeHtml(compliance.approvalStatus || '未指定')}</span><span><b>方法执行状态</b>${escapeHtml(compliance.methodExecutionStatus || '未声明')}</span><span><b>交付级别</b>${escapeHtml(result.releaseGate?.status || 'ANALYSIS_DRAFT')}</span><span><b>方法编号</b>${methodId}</span><span><b>修订号</b>${revision}</span><span><b>审批证据</b>${escapeHtml(approvalDetail)}</span><span><b>标准引用证据</b>${escapeHtml(standardDetail)}</span><span><b>方法实施证据</b>${escapeHtml(methodDetail)}</span><span><b>边界声明</b>${escapeHtml(compliance.boundary || '')}</span>${gateSummary}</div>${evidenceBar}${gateRows.length ? `<div class="compliance-gate-list">${gateRows.join('')}</div>` : ''}${missingItems.length ? `<p class="compliance-evidence-missing"><b>缺失/待补齐证据：</b>${escapeHtml(missingItems.slice(0, 8).join('、'))}${missingItems.length > 8 ? '…' : ''}</p>` : '<p class="compliance-evidence-ok">已具备基本证据框架。</p>'}</div>`;
  $('#report-status').textContent = draft ? `${gateLabel} · 结构化初稿` : `${gateLabel} · ${status} · ${result.issues.length} 条结论`;
  if (draft?.draft) {
    $('#report-preview').innerHTML = `${reportFacts}${complianceSection}<div class="report-head"><span>REPORT DRAFT / STRUCTURED EVIDENCE</span><strong>${status}</strong></div><pre class="draft-text">${escapeHtml(draft.draft)}</pre><div class="report-foot">初稿只引用结构化测试证据；正式发布前仍需工程师签核。</div>`;
    return;
  }
  const boundary = result.evaluation?.mode === 'descriptive_only' ? '本 profile 仅输出描述性统计和证据，未执行阈值/验收判定；' : '阈值、原始样本、计算指标和建议动作可追溯；';
  $('#report-preview').innerHTML = `${reportFacts}${complianceSection}<div class="report-head"><span>自动报告 / ${escapeHtml(state.fileName)}</span><strong>${status}</strong></div><h3>测试结论</h3><p>${escapeHtml(result.narrative)}</p><h3>异常与建议</h3><ul>${result.issues.map((item) => `<li><b>${escapeHtml(item.title)}</b>：${escapeHtml(item.evidence)}。${escapeHtml(item.recommendation)}</li>`).join('')}</ul><div class="report-foot">${boundary}正式报告需经工程师签核。</div>`;
}

function renderSignalDiagnostics(dataset) {
  const diagnostics = dataset?.signalDiagnostics;
  if (!diagnostics) return '';
  const reviewSignals = Array.isArray(diagnostics.reviewSignals) ? diagnostics.reviewSignals.slice(0, 6) : [];
  const signalRows = reviewSignals.length
    ? `<div class="signal-diagnostic-list">${reviewSignals.map((item) => `<div class="signal-diagnostic-row"><b>${escapeHtml(item.source)}</b><span>${escapeHtml(item.reasons.join('；'))}</span><small>负值 ${Number(item.negativeCount || 0).toLocaleString('zh-CN')} · 零值 ${Number(item.zeroCount || 0).toLocaleString('zh-CN')}${item.zeroPct === null || item.zeroPct === undefined ? '' : ` · ${fmt(item.zeroPct, 1)}%`}</small></div>`).join('')}</div>`
    : '<p class="signal-diagnostic-empty">未发现需要按当前角色提示的值分布复核项。</p>';
  return `<div class="signal-diagnostics"><div class="signal-diagnostics-head"><span>字段值分布复核</span><small>${diagnostics.reviewSignalCount ? `${diagnostics.reviewSignalCount} 个字段待确认` : '当前分布未触发提示'}</small></div><div class="signal-diagnostic-grid"><span><b>${diagnostics.reviewSignalCount || 0}</b>待复核字段</span><span><b>${diagnostics.negativeSignalCount || 0}</b>含负值字段</span><span><b>${diagnostics.zeroDominantSignalCount || 0}</b>零值集中字段</span><span><b>${diagnostics.constantSignalCount || 0}</b>常量字段</span></div>${signalRows}<p class="signal-diagnostic-boundary">${escapeHtml(diagnostics.boundary || '不自动删除原始负值/零值；需结合企业字段定义和无效码表。')}</p></div>`;
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
      : dataset.inferredSegments?.length ? dataset.inferredSegments.map((point) => `<tr><td>描述性 ${fmt(point.averageCurrentA, 2)}</td><td>${fmt(point.durationS, 0)}</td><td>${fmt(point.averageCellVoltageV, 3)}</td><td>${fmt(point.averageCellDeviationMv, 1)}</td><td>${fmt(point.averageNetPowerKw, 2)}</td></tr>`).join('') : '<tr><td colspan="5">未形成有效区间；输入企业目标电流并点击“应用阈值并重新分析”。</td></tr>';
    const forecast = Object.values(dataset.insulation.forecast).map((item) => `<span><b>${item.threshold} kΩ</b> ${item.trend.slopePerDay === null ? '趋势不足' : `${fmt(item.trend.slopePerDay, 2)} kΩ/日`} · ${item.forecast?.status === 'forecast' ? `预计 ${fmt(item.forecast.days, 1)} 日触及` : item.forecast?.status === 'already_below' ? '已有低于报警线的窗口' : '未形成下降预测'}</span>`).join('');
    const primarySignalOptions = (dataset.signalCatalog || []).filter((item) => item.numericCount > 0).map((item) => `<option value="${escapeHtml(item.source)}" ${item.source === dataset.selectedSignal ? 'selected' : ''}>${escapeHtml(item.source)}</option>`).join('');
    const secondarySignalOptions = `<option value="">不显示右轴信号</option>${(dataset.signalCatalog || []).filter((item) => item.numericCount > 0).map((item) => `<option value="${escapeHtml(item.source)}" ${item.source === dataset.secondarySignal ? 'selected' : ''}>${escapeHtml(item.source)}</option>`).join('')}`;
    const endValue = dataset.analysisWindow?.endS ?? '';
    const trendXAxisOptions = `<option value="runtime_h" ${dataset.trendXAxis === 'runtime_h' ? 'selected' : ''}>FC_RunTime_Hours / 运行时长</option><option value="timestamp" ${dataset.trendXAxis === 'timestamp' ? 'selected' : ''}>Timestamp / 实际日期时间</option>`;
    const trendModelOptions = `<option value="linear" ${dataset.trendModel === 'linear' ? 'selected' : ''}>线性趋势</option><option value="quadratic" ${dataset.trendModel === 'quadratic' ? 'selected' : ''}>二次多项式趋势（≥3点）</option>`;
    $('#enterprise-controls').innerHTML = `<label>目标电流 A（逗号分隔）<input id="vehicle-targets" type="text" value="${escapeHtml(dataset.targetCurrents.join(','))}" placeholder="按企业批准目标表填写；留空仅做描述性候选"></label><label>允许波动 A<input id="vehicle-tolerance" type="number" value="${dataset.targetToleranceA}" step="1"></label><label>最短持续 s<input id="vehicle-duration" type="number" value="${dataset.minimumDurationS}" step="10"></label><label>左轴信号<select id="vehicle-signal">${primarySignalOptions}</select></label><label>右轴信号<select id="vehicle-signal-secondary">${secondarySignalOptions}</select></label><label>趋势横轴<select id="vehicle-trend-x-axis">${trendXAxisOptions}</select></label><label>趋势模型<select id="vehicle-trend-model">${trendModelOptions}</select></label><label>起始时间 s<input id="vehicle-start-s" type="number" min="0" value="${dataset.analysisWindow?.startS || 0}" step="1"></label><label>结束时间 s<input id="vehicle-end-s" type="number" min="0" value="${endValue}" step="1"></label>`;
    const voltageTrend = dataset.performanceTrend?.averageCellVoltageV;
    $('#enterprise-summary').innerHTML = `<div class="enterprise-facts"><span><b>${dataset.stateCounts['4'] || 0}</b> 条运行态</span><span><b>${dataset.stateCounts['8'] || 0}</b> 条上电非运行态</span><span><b>${dataset.insulation.validCount}</b> 条绝缘有效记录</span><span><b>${dataset.insulation.points.length}</b> 个 10 分钟窗口</span><span><b>${voltageTrend?.pointCount || 0}</b> 个正式性能趋势点</span><span><b>${dataset.inferredSegments?.length || 0}</b> 个描述性候选区间</span><span><b>${dataset.coverage?.totalSignals || dataset.signalCatalog?.length || 0}</b> 列信号目录</span><span><b>${dataset.sessionCount || 1}</b> 个独立会话</span></div><div class="enterprise-note">当前窗口 ${fmt(dataset.analysisWindow?.startS, 0)}–${fmt(dataset.analysisWindow?.endS, 0)} s · 左轴 ${escapeHtml(dataset.selectedSignal || '—')} · 右轴 ${escapeHtml(dataset.secondarySignal || '不显示')} · 趋势横轴 ${escapeHtml(dataset.trendXAxisLabel || '—')} · 模型 ${dataset.trendModel === 'quadratic' ? '二次多项式' : '线性'}${dataset.trendSelection?.fallbackReason ? ` · ${escapeHtml(dataset.trendSelection.fallbackReason)}` : ''} · ${dataset.analysisWindow?.rowCount || 0}/${dataset.analysisWindow?.totalRowCount || 0} 条记录参与统计 · 会话时长合计 ${fmt(dataset.sessions?.reduce((sum, session) => sum + session.durationS, 0), 0)} s · 核心/交叉核对 ${dataset.coverage?.analysisSignals ?? '—'} 列 · 仅目录 ${dataset.coverage?.catalogOnlySignals?.length ?? '—'} 列${dataset.targetCurrents.length ? '' : ' · 未提供目标电流，候选区间仅作描述性统计'}</div><div class="enterprise-forecast">${forecast}</div>${renderSignalDiagnostics(dataset)}`;
    $('#enterprise-table').innerHTML = `<h3>${dataset.performancePoints.length ? '目标电流段统计' : '描述性候选运行区间（非目标符合性）'}</h3><table><thead><tr><th>${dataset.performancePoints.length ? '目标 A' : '平均电流 A'}</th><th>有效持续 s</th><th>平均单体 V</th><th>离均差 mV</th><th>净功率 kW</th></tr></thead><tbody>${points}</tbody></table>`;
    return;
  }
  if (result.datasetType === 'durability') {
    const points = dataset.points.map((point) => `<tr><td>${fmt(point.targetPowerKw, 1)}</td><td>${fmt(point.netPowerKw, 1)}</td><td>${fmt(point.averageCellVoltageMv, 0)}</td><td>${fmt(point.averageDeviationMv, 0)}</td><td>${fmt(point.voltageVariance, 0)}</td></tr>`).join('');
    const reports = dataset.reports.map((report) => `<span><b>${escapeHtml(report.metadata?.测试方案 || '耐久报告')}</b> ${escapeHtml(report.metadata?.测试结果 || '未标注')} · ${report.points.length} 个功率点</span>`).join('');
    const crossReport = dataset.crossReportSummary?.status === 'descriptive_only' ? dataset.crossReportSummary : null;
    const crossReportRows = crossReport?.byTargetPower?.map((item) => `<tr><td>${fmt(item.targetPowerKw, 1)}</td><td>${item.reportCount}</td><td>${fmt(item.firstAverageCellVoltageMv, 1)} → ${fmt(item.lastAverageCellVoltageMv, 1)}</td><td>${item.deltaStatus === 'suppressed_not_comparable' ? '已抑制（不可比）' : fmt(item.averageCellVoltageDeltaMv, 1)}</td><td>${fmt(item.firstAverageDeviationMv, 1)} → ${fmt(item.lastAverageDeviationMv, 1)}</td><td>${fmt(item.maximumAverageDeviationMv, 1)}</td></tr>`).join('') || '';
    const comparability = crossReport?.comparabilityAudit;
    const crossReportMarkup = crossReport ? `<div class="enterprise-forecast"><b>跨报告描述性汇总 · ${crossReport.reportCount} 份</b><span>排序：${escapeHtml(crossReport.orderingBasis || '未声明')} · 结果：${Object.entries(crossReport.resultCounts || {}).map(([key, value]) => `${escapeHtml(key)} ${value} 份`).join('；') || '未标注'}</span><small>可比性筛查：${escapeHtml(comparability?.auditStatus || '未执行')} · ${comparability?.comparable ? '未发现元数据不一致' : `需复核 ${comparability?.issueCodes?.length || 0} 项`} · 间隔 ${comparability?.gapCount ?? '—'} · 重叠 ${comparability?.overlapCount ?? '—'}</small><small>${escapeHtml(crossReport.boundary)} ${escapeHtml(comparability?.boundary || '')}</small></div>` : '';
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
    $('#enterprise-summary').innerHTML = `<div class="enterprise-facts"><span><b>${dataset.points.length}</b> 个功率点</span><span><b>${dataset.targetPowers.length}</b> 个目标功率</span><span><b>${dataset.rules.maxDeviationMv ?? '—'}</b> mV 离均差规则</span><span><b>${dataset.rules.minAverageCellVoltageMv ?? '—'}</b> mV 电压规则</span></div><div class="enterprise-forecast">${reports}</div>${crossReportMarkup}`;
    $('#enterprise-table').innerHTML = `<h3>耐久功率点统计</h3><table><thead><tr><th>目标功率 kW</th><th>净输出 kW</th><th>平均单体 mV</th><th>离均差 mV</th><th>电压方差</th></tr></thead><tbody>${points}</tbody></table>${crossReport ? `<h3>跨报告耐久描述性汇总（非标准判定）</h3><table><thead><tr><th>目标功率 kW</th><th>报告数</th><th>平均单体电压首→末 mV</th><th>首末变化 mV</th><th>离均差首→末 mV</th><th>最大离均差 mV</th></tr></thead><tbody>${crossReportRows}</tbody></table>` : ''}`;
    return;
  }
  const parameterStatus = dataset.parameterConfig ? `${dataset.parameterConfig.analysisMode === 'relative_stability' ? `参数工作簿已校验 · 无目标工况，仅执行相对稳定性描述分析（${dataset.inferredSegments?.length || 0} 个候选）` : dataset.parameterConfig.ok ? '参数工作簿已校验' : `参数工作簿错误 ${dataset.parameterConfig.errors.length} 项`}${dataset.parameterConfig.formulaAudit?.formulaCellCount ? ` · 公式 ${dataset.parameterConfig.formulaAudit.formulaCellCount} 个，状态 ${dataset.parameterConfig.formulaAudit.status}` : ''}` : `未导入目标工况参数 · 已发现 ${dataset.inferredSegments?.length || 0} 个描述性候选区间`;
  const selectionAudit = dataset.selectionAudit || [];
  const selectionControls = (dataset.platforms || []).map((platform) => {
    const audit = selectionAudit.find((item) => item.platformId === platform.platformId);
    const candidates = (dataset.stableSegments || []).filter((segment) => segment.platformId === platform.platformId && ['stable_valid', 'short_stable'].includes(segment.status));
    const options = [`<option value="">自动：${escapeHtml(audit?.automaticSegmentId || '无可用区间')}</option>`, ...candidates.map((segment) => `<option value="${escapeHtml(segment.segmentId)}" ${segment.selectedBy === 'manual' ? 'selected' : ''}>${escapeHtml(segment.segmentId)} · ${fmt(segment.startS, 0)}–${fmt(segment.endS, 0)} s · ${escapeHtml(segment.status)}</option>`)].join('');
    return `<label class="stack-selection-control">${escapeHtml(platform.platformId)} 稳定区间<select data-stack-selection="${escapeHtml(platform.platformId)}" ${candidates.length ? '' : 'disabled'}>${options}</select><small>${audit?.selectionMode === 'manual' ? '当前为人工改选' : '当前为自动选择'}${audit?.selectionError ? ` · ${escapeHtml(audit.selectionError)}` : ''}</small></label>`;
  }).join('');
  const selectionNote = selectionAudit.length ? `自动策略：${escapeHtml(dataset.selectionPolicy || '未声明')} · 人工改选 ${selectionAudit.filter((item) => item.selectionMode === 'manual').length} 个平台` : '尚未形成可选稳定区间';
  const platformRows = dataset.platforms?.length ? dataset.platforms.map((item) => { const audit = selectionAudit.find((entry) => entry.platformId === item.platformId); return `<tr><td>${escapeHtml(item.conditionId)}</td><td>${fmt(item.targetCurrentA, 2)}</td><td>${fmt(item.effectiveDurationS, 0)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(audit?.selectionMode === 'manual' ? '人工改选' : audit?.selectionMode === 'automatic' ? '自动选定' : '未选定')}</td>`; }).join('') : '<tr><td colspan="5">未形成电流平台；先导入参数工作簿。</td></tr>';
  const comparisonRows = dataset.performancePoints?.flatMap((point) => (point.parameterComparisons || []).map((comparison) => `<tr><td>${escapeHtml(point.platformId || point.conditionId || '')}</td><td>${escapeHtml(comparison.code)}</td><td>${fmt(comparison.target, 3)}</td><td>${fmt(comparison.actualMean, 3)}</td><td>${fmt(comparison.absoluteDeviation, 3)}</td><td>${fmt(comparison.exceedRatioPct, 1)}</td><td>${escapeHtml(comparison.status || '无法判定')}</td></tr>`)).join('') || '<tr><td colspan="7">未形成目标工况对比；请确认参数表和有效稳定区间。</td></tr>';
  $('#enterprise-controls').innerHTML = `<span class="enterprise-note">${escapeHtml(parameterStatus)} · ${dataset.parameterConfig?.ok ? '平台和稳定区间按参数表计算' : '候选按实际电流连续性发现，仅作 descriptive_only，不作目标符合性判定'}</span>${selectionControls ? `<div class="stack-selection-grid"><h3>稳定区间选择</h3><p class="enterprise-note">${selectionNote}。人工改选只改变统计截取对象，不改变原始数据或参数阈值。</p>${selectionControls}</div>` : ''}`;
  document.querySelectorAll('[data-stack-selection]').forEach((select) => select.addEventListener('change', () => {
    const platformId = select.dataset.stackSelection;
    if (select.value) state.stackSelectionOverrides[platformId] = select.value;
    else delete state.stackSelectionOverrides[platformId];
    if (state.rows.length) void analyzeCurrent('改选稳定区间');
  }));
    const cellDistribution = Object.entries(dataset.cellCountDistribution || {}).map(([count, rows]) => `${count}片×${Number(rows).toLocaleString('zh-CN')}行`).join('；') || '未提供逐行片数';
    const cellValueNote = dataset.cellValueQuality ? ` · 逐片原始值 ${Number(dataset.cellValueQuality.rawActiveValueCount || 0).toLocaleString('zh-CN')} 个，进入派生统计 ${Number(dataset.cellValueQuality.validPositiveValueCount || 0).toLocaleString('zh-CN')} 个` : '';
    $('#enterprise-summary').innerHTML = `<div class="enterprise-facts"><span><b>${dataset.cellChannelCount}</b> 个原始单片列</span><span><b>${dataset.activeCellChannelCount || '—'}</b> 个最大有效片数</span><span><b>${fmt(dataset.metrics.averageCurrentA, 2)}</b> A 平均电流</span><span><b>${fmt(dataset.metrics.cellSpreadMaxV, 3)}</b> V 最大极差</span><span><b>${dataset.platforms?.length || 0}</b> 个${dataset.parameterConfig?.ok ? '电流平台' : '描述性候选区间'}</span><span><b>${dataset.performancePoints?.length || 0}</b> 个正式稳定区间</span><span><b>${fmt(dataset.metrics.hydrogenStoich?.mean, 3)}</b> 氢气计量比</span><span><b>${fmt(dataset.metrics.airStoich?.mean, 3)}</b> 空气计量比</span><span><b>${dataset.coverage?.totalSignals || dataset.signalCatalog?.length || 0}</b> 列字段目录</span></div><div class="enterprise-note">逐行片数口径：${escapeHtml(cellDistribution)} · 超出逐行片数的零填充单片列不进入极差、标准差和计量比；非正逐片值不进入派生电压统计${cellValueNote}；核心/交叉核对 ${dataset.coverage?.analysisSignals ?? '—'} 列 · 仅目录 ${dataset.coverage?.catalogOnlySignals?.length ?? '—'} 列 · 设定/实测核对 ${dataset.settingCrossChecks?.length || 0} 组 · 阀/泵反馈 ${dataset.feedbackSignals?.length || 0} 列${dataset.parameterConfig?.ok ? '' : ' · 未提供目标参数，未生成正式极化点'}</div>${renderSignalDiagnostics(dataset)}`;
  const engineeringRows = [
    ['阳极流阻', dataset.metrics.anodeFlowResistanceKpa, 'kPa'],
    ['阴极流阻', dataset.metrics.cathodeFlowResistanceKpa, 'kPa'],
    ['冷却液流阻', dataset.metrics.coolantFlowResistanceKpa, 'kPa'],
    ['冷却液温差', dataset.metrics.coolantTemperatureDifferenceC, '°C'],
    ['循环水电导率', dataset.metrics.coolantConductivityUsCm, 'μS/cm'],
    ['氢气入口露点', dataset.metrics.h2DewpointC, '°C'],
    ['空气入口露点', dataset.metrics.airDewpointC, '°C'],
    ['阳极增湿罐水温', dataset.metrics.h2HumidifierWaterTemperatureC, '°C'],
    ['阴极增湿罐水温', dataset.metrics.airHumidifierWaterTemperatureC, '°C'],
    ['内阻', dataset.metrics.internalResistance, '原始单位']
  ].map(([label, summary, unit]) => `<tr><td>${label}</td><td>${fmt(summary?.mean, 3)}</td><td>${unit}</td><td>${summary?.count ?? 0}</td></tr>`).join('');
  const cellRows = (dataset.cellTimeSeriesStats || []).slice(0, 120).map((item) => `<tr><td>${escapeHtml(item.source)}</td><td>${item.count}</td><td>${item.missingCount}</td><td>${fmt(item.completenessPct, 1)}</td><td>${fmt(item.mean, 4)}</td><td>${fmt(item.min, 4)}</td><td>${fmt(item.max, 4)}</td><td>${fmt(item.std, 4)}</td></tr>`).join('') || '<tr><td colspan="8">未形成逐片时序统计</td></tr>';
  const excludedRows = (dataset.excludedIntervals || []).map((item) => `<tr><td>${escapeHtml(item.platformId || '—')}</td><td>${fmt(item.startS, 1)}</td><td>${fmt(item.endS, 1)}</td><td>${fmt(item.durationS, 1)}</td><td>${item.sampleCount ?? '—'}</td><td>${escapeHtml(item.reasonCode || '—')}</td><td>${escapeHtml(item.reason || '—')}</td></tr>`).join('') || '<tr><td colspan="7">没有被记录的排除区间</td></tr>';
  $('#enterprise-summary').innerHTML += `<h3>工程量摘要（统计/核对，不是标准结论）</h3><table><thead><tr><th>工程量</th><th>均值</th><th>单位</th><th>有效记录</th></tr></thead><tbody>${engineeringRows}</tbody></table><h3>原始单片时序统计（描述性）</h3><table><thead><tr><th>源字段</th><th>有效</th><th>缺失</th><th>完整率%</th><th>均值 V</th><th>最小 V</th><th>最大 V</th><th>标准差 V</th></tr></thead><tbody>${cellRows}</tbody></table><p class="enterprise-note">逐片统计只描述原始通道覆盖，不是单片合格判定。入口露点只接受原始字段明确标注为露点的记录；增湿罐水温不能替代露点。</p>`;
  const coverageRows = dataset.coverage ? `<tr><td>总信号数</td><td>${dataset.coverage.totalSignals}</td><td>—</td><td>—</td></tr><tr><td>分析输入信号</td><td>${dataset.coverage.analysisSignals}</td><td>—</td><td>进入 KPI / 统计 / 交叉核对</td></tr><tr><td>数值信号</td><td>${dataset.coverage.numericSignals}</td><td>—</td><td>可参与描述性统计</td></tr><tr><td>目录保留信号</td><td>${dataset.coverage.catalogOnlySignals?.length || 0}</td><td>—</td><td>仅保留字段目录，不自动生成结论</td></tr>` : '';
  $('#enterprise-table').innerHTML = `<h3>${dataset.parameterConfig?.ok ? '电流平台与稳定区间' : '描述性候选电流区间（非正式稳定区间/极化点）'}</h3><table><thead><tr><th>工况/候选</th><th>目标电流 A</th><th>有效持续 s</th><th>平台状态</th><th>稳定区间选择</th></tr></thead><tbody>${platformRows}</tbody></table><h3>目标工况对比</h3><table><thead><tr><th>平台</th><th>参数</th><th>目标</th><th>实际均值</th><th>绝对偏差</th><th>超限比例 %</th><th>状态</th></tr></thead><tbody>${comparisonRows}</tbody></table><h3>稳定区间排除证据</h3><table><thead><tr><th>平台</th><th>起始 s</th><th>结束 s</th><th>持续 s</th><th>样本</th><th>原因</th><th>说明</th></tr></thead><tbody>${excludedRows}</tbody></table>${coverageRows ? `<h3>数据覆盖与信号角色</h3><table><thead><tr><th>类别</th><th>数量</th><th>单位</th><th>说明</th></tr></thead><tbody>${coverageRows}</tbody></table>` : ''}<h3>实际字段映射</h3><div class="enterprise-map">${Object.entries(dataset.sourceFieldMap).filter(([, source]) => source).map(([field, source]) => `<span><code>${escapeHtml(field)}</code><b>←</b>${escapeHtml(source)}</span>`).join('')}</div>`;
}

function updateAccessibleSummaries(result) {
  const numericRange = (field) => {
    const values = result.rows.map((row) => row[field]).filter(Number.isFinite);
    return values.length ? `${fmt(Math.min(...values), 2)}–${fmt(Math.max(...values), 2)}` : '无有效值';
  };
  const trendSummary = $('#trend-chart-summary');
  if (trendSummary) trendSummary.textContent = `趋势图摘要：${result.rows.length} 条记录；温度 ${numericRange('temperature_c')} °C；压力 ${numericRange('pressure_bar')} bar；时间轴 ${fmt(result.metrics.durationS, 1)} s。`;
  const enterpriseSummary = $('#enterprise-chart-summary');
  if (enterpriseSummary) {
    const dataset = result.dataset || {};
    const points = dataset.performancePoints?.length || dataset.points?.length || dataset.insulation?.points?.length || 0;
    enterpriseSummary.textContent = `企业图表摘要：${dataset.label || '企业数据'}；${points} 个可绘制点；当前仅作描述性统计，不替代标准判定。`;
  }
  const performanceSummary = $('#enterprise-performance-chart-summary');
  if (performanceSummary) {
    const dataset = result.dataset || {};
    const points = dataset.performancePoints?.length || 0;
    performanceSummary.textContent = `企业性能图表摘要：${points} 个性能点；当前仅在具备企业性能证据时显示，不替代标准判定。`;
  }
  const announcement = $('#result-announcement');
  if (announcement) announcement.textContent = `分析完成：${verdictLabel(result.verdict)}；${result.metrics.sampleCount || 0} 条记录；${result.issues?.length || 0} 项风险或提示；正式符合性声明未执行。`;
}

function render(result, pushHistory = true) {
  hideInitialLoadingState();
  if (pushHistory) {
    pushResultHistory(result);
  }
  state.result = result;
  state.aiDraft = null;
  state.baselineResult = null;
  state.comparison = null;
  $('#file-name').textContent = state.fileName;
  const inputSummary = state.inputSummary || {};
  const inputNote = (inputSummary.totalFiles || 1) > 1
    ? ` · ${inputSummary.totalFiles} 文件：${inputSummary.processed} 数据 / ${inputSummary.referenceOnly} 参考 / ${inputSummary.blockedBinary} 阻断 / ${inputSummary.parserErrors || 0} 解析错误`
    : inputSummary.parserErrors
      ? ` · ${inputSummary.parserErrors} 解析错误`
      : '';
  $('#source-count').textContent = `${result.metrics.sampleCount} 条记录 · ${fmt(result.metrics.durationS, 0)} 秒${result.dataset?.label ? ` · ${result.dataset.label}` : ''}${inputNote}`;
  const convertedUnits = Object.values(result.schema.conversions).filter((item) => item.mode !== 'identity').length;
  const phaseFallback = result.schema.missingOptionalHeaders.includes('phase') ? ' · 工况字段缺失，使用活动窗口' : '';
  const purityNotice = result.schema.missingOptionalHeaders.includes('hydrogen_purity_pct') ? ' · 纯度字段未提供' : '';
  const incrementalNotice = state.incrementalDiff ? ` · 批次 +${state.incrementalDiff.added.length}/变${state.incrementalDiff.changed.length}/未变${state.incrementalDiff.unchanged.length}` : '';
  const schemaMissingWarning = (result.issues || []).some((issue) => issue.code === 'SCHEMA_MISSING') ? ' · 未识别到关键字段，请确认文件包含表头和测试数据列' : '';
  $('#schema-notice').textContent = result.dataset ? `${result.dataset.label} · 字段映射 ${result.schema.mappedCount}/${result.schema.fieldCount}${incrementalNotice}${schemaMissingWarning}` : `字段映射 ${result.schema.mappedCount}/${result.schema.fieldCount}${convertedUnits ? ` · ${convertedUnits} 项单位换算` : ''}${phaseFallback}${purityNotice}${incrementalNotice}${schemaMissingWarning}`;
  $('#verdict-chip').textContent = verdictLabel(result.verdict);
  $('#verdict-chip').className = `verdict-chip ${result.verdict.toLowerCase()}`;
  const complianceClass = result.compliance.status.toLowerCase().replaceAll('_', '-');
  $('#compliance-chip').textContent = result.compliance.label;
  $('#compliance-chip').className = `compliance-chip ${complianceClass}`;
  const complianceBoundary = $('#compliance-boundary');
  if (complianceBoundary) {
    complianceBoundary.textContent = result.compliance.boundary || '';
    complianceBoundary.hidden = !result.compliance.boundary;
  }
  const complianceAnnouncement = $('#compliance-announcement');
  if (complianceAnnouncement) {
    complianceAnnouncement.textContent = `标准符合性状态：${result.compliance.label}`;
  }
  const auditTrail = result.compliance?.auditTrail;
  if (auditTrail) {
    const snapshot = { ...auditTrail, savedAt: new Date().toISOString(), fileName: state.fileName };
    state.complianceHistory = [snapshot, ...(state.complianceHistory || [])].slice(0, 20);
  }
  const verdictTooltip = $('#verdict-tooltip');
  if (verdictTooltip) {
    const qualityNote = result.quality?.usable === false && result.quality?.completenessPct === 100
      ? '数据完整率 100%，但时间轴存在重复/非正间隔，已按原始时序做描述性统计，不生成正式稳定区间。'
      : result.quality?.usable
        ? '数据质量通过，已进入正式统计与候选区间生成。'
        : '数据质量未通过，请检查时间轴和关键字段。';
    verdictTooltip.textContent = qualityNote;
    verdictTooltip.hidden = false;
  }
  renderMetrics(result); renderCalculationSummary(result); renderMetricTrace(result); renderIssues(result); renderPhases(result); renderWorkflow(result); renderReport(result); renderEnterprisePanel(result); drawChart(result); drawEnterpriseChart(result); drawEnterprisePerformanceChart(result); updateAccessibleSummaries(result); renderBatchObservation();
  renderComparison();
  renderHistory();
  renderComplianceHistory();
  const saveHistoryTop = $('#save-history-top');
  if (saveHistoryTop) saveHistoryTop.hidden = !state.result;
  renderSchema(result);
  $('#last-run').textContent = `最近分析 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
}

async function loadCsv(url, name) {
  setAnalysisStatus(`读取 ${name}…`, 'busy');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`无法读取 ${url}`);
  const text = await response.text();
  await bindRawDataHash(text);
  state.rows = parseCSV(text);
  state.stackSelectionOverrides = {};
  state.workbookEvidence = null;
  state.fileName = name;
  state.inputEntries = [{ name, size: new TextEncoder().encode(text).byteLength, rows: state.rows, status: 'processed', contentHash: await sha256Hex(text), hashType: 'text' }];
  state.batchDeclarationInput = null;
  state.batchValidation = null;
  state.batchSummaries = [];
  state.inputSummary = { totalFiles: 1, processed: 1, referenceOnly: 0, blockedBinary: 0, parserErrors: 0 };
  state.currentManifest = manifestFromEntries(state.inputEntries);
  state.incrementalDiff = diffManifests(readBatchManifest(window.localStorage), state.currentManifest);
  saveRecentFile(name, state.rawDataHash);
  await analyzeCurrent('载入样本');
}

async function readUserFile(file) {
  const buffer = await file.arrayBuffer();
  const encoding = /\.(txt|tsv)$/i.test(file.name) ? 'gb18030' : 'utf-8';
  return { buffer, ...decodeTextBuffer(buffer, encoding) };
}

async function readSelectedDataFiles(files) {
  const entries = [];
  const inputSummary = { totalFiles: files.length, processed: 0, referenceOnly: 0, blockedBinary: 0, parserErrors: 0 };
  renderBatchQueue(files.map((file, idx) => ({ name: file.webkitRelativePath || file.name, size: file.size, status: idx === 0 ? 'processing' : 'pending' })));
  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const file = files[fileIndex];
    const name = file.webkitRelativePath || file.name;
    setAnalysisStatus(`读取文件 ${fileIndex + 1}/${files.length}：${file.name}`, 'busy');
    setBatchProgress(fileIndex, files.length, '读取中');
    updateBatchQueueItem(files.map((file, idx) => ({ name: file.webkitRelativePath || file.name, size: file.size, status: idx < fileIndex ? 'processed' : idx === fileIndex ? 'processing' : 'pending' })), fileIndex, { status: 'processing' });
    await yieldToBrowser();
    if (/\.pdf$/i.test(name) || (/\.docx$/i.test(name) && !/耐久原始数据处理/.test(name))) {
      const buffer = await file.arrayBuffer();
      entries.push({ name, size: file.size, rows: [], status: 'reference_only', contentHash: await sha256Bytes(buffer), hashType: 'binary', text: `REFERENCE:${name}` });
      inputSummary.referenceOnly += 1;
    } else if (/\.docx$/i.test(name)) {
      await ensureBrowserEngines({ docx: true });
      setDocxEngine(globalThis.mammoth);
      const buffer = await file.arrayBuffer(); const report = await parseDurabilityDocx(buffer);
      const status = report.points.length ? 'processed' : 'parser_error';
      entries.push({ name, size: file.size, rows: report.points.map((point) => ({ ...point, source_file: name })), durabilityReport: report, status, contentHash: await sha256Bytes(buffer), hashType: 'binary', text: `DOCX:${name}\n${JSON.stringify(report)}` });
      inputSummary[status === 'processed' ? 'processed' : 'parserErrors'] += 1;
    } else if (/\.(xlsx|xlsm)$/i.test(name)) {
      await ensureBrowserEngines({ spreadsheet: true });
      setSpreadsheetEngine(globalThis.XLSX);
      const buffer = await file.arrayBuffer(); const workbookResult = parseDataWorkbook(buffer);
      const status = workbookResult.ok ? 'processed' : 'parser_error';
      entries.push({ name, size: file.size, sheetName: workbookResult.sheetName, workbookEvidence: workbookResult.workbookEvidence || null, rows: workbookResult.rows, status, contentHash: await sha256Bytes(buffer), hashType: 'binary', text: `SHEET:${workbookResult.sheetName || 'none'}\n${JSON.stringify(workbookResult.rows)}` });
      inputSummary[status === 'processed' ? 'processed' : 'parserErrors'] += 1;
    } else if (/\.(csv|txt|tsv)$/i.test(name)) {
      const decoded = await readUserFile(file);
      const contentHash = await sha256Bytes(decoded.buffer);
      if (decoded.binary) {
        entries.push({ name, size: file.size, rows: [], status: 'blocked_binary', binaryReason: decoded.binaryReason || 'unknown', contentHash, hashType: 'binary', text: `BLOCKED_BINARY:${name}` });
        inputSummary.blockedBinary += 1;
      } else {
        const parsedRows = parseCSV(decoded.text);
        const isEmpty = !decoded.text.trim();
        const isHeaderOnly = !isEmpty && parsedRows.length === 0 && /[,\t]/.test(decoded.text.trim());
        const status = parsedRows.length ? 'processed' : 'parser_error';
        const entry = { name, size: file.size, rows: parsedRows, status, contentHash, hashType: 'binary', text: decoded.text };
        if (isEmpty) entry.parseHint = '文件为空';
        else if (isHeaderOnly) entry.parseHint = '文件只有表头，缺少数据行';
        entries.push(entry);
        inputSummary[status === 'processed' ? 'processed' : 'parserErrors'] += 1;
      }
    } else {
      const buffer = await file.arrayBuffer();
      entries.push({ name, size: file.size, rows: [], status: 'reference_only', contentHash: await sha256Bytes(buffer), hashType: 'binary', text: `REFERENCE_UNSUPPORTED:${name}` });
      inputSummary.referenceOnly += 1;
    }
  }
  setBatchProgress(files.length, files.length, '整理来源边界');
  setAnalysisStatus(`整理 ${entries.length} 个文件的来源边界…`, 'busy');
  await yieldToBrowser();
  const rows = entries.flatMap((entry) => entry.rows.map((row, sourceRowIndex) => ({
    ...row,
    source_file: entry.name,
    source_row_index: sourceRowIndex,
    session_id: `file:${entry.name}`
  })));
  return { entries, rows, durabilityReports: entries.map((entry) => entry.durabilityReport).filter(Boolean), manifest: manifestFromEntries(entries), hashText: entries.map(({ name, contentHash }) => `FILE:${name}\nSHA-256:${contentHash}`).join('\n'), inputSummary };
}

async function loadSample() {
  await loadCsv(assetUrl('sample-data/test_run_001.csv'), '演示样本 · electrolyzer_run_017.csv');
}

async function loadSampleSafely() {
  try {
    await loadSample();
  } catch (error) {
    setAnalysisStatus(`演示样本读取失败：${error.message}`, 'error');
    $('#schema-notice').textContent = '请刷新页面、检查 Pages 资源，或改为手动导入测试文件。';
  }
}

async function loadCoverageSummary() {
  try {
    const response = await fetch(assetUrl('config/t02-coverage-summary.json'));
    if (!response.ok) return;
    const summary = await response.json();
    state.coverageSummary = summary;
    const counts = summary.counts || {};
    const total = Number(summary.totalFiles || 0);
    const processed = Number(counts.processed || 0);
    const reference = Number(counts.reference_only || 0);
    const blocked = Number(counts.blocked_binary || 0);
    const noUpload = Number(counts.declared_no_upload || 0);
    const setText = (id, value) => { const element = $(`#${id}`); if (element) element.textContent = value; };
    setText('coverage-audit-version', `v${summary.auditVersion || '—'}`);
    setText('coverage-total-files', total.toLocaleString('zh-CN'));
    setText('coverage-processed', processed.toLocaleString('zh-CN'));
    setText('coverage-reference', reference.toLocaleString('zh-CN'));
    setText('coverage-blocked', blocked.toLocaleString('zh-CN'));
    setText('coverage-unuploaded', noUpload.toLocaleString('zh-CN'));
    const fill = $('#coverage-meter-fill');
    if (fill) fill.style.width = `${total > 0 ? Math.min(100, (processed / total) * 100) : 0}%`;
    const note = $('#coverage-note');
    const riskFields = $('#coverage-risk-fields');
    const diagnostics = summary.fieldDiagnostics || {};
    const depth = summary.evidenceDepthCounts || {};
    const diagnosticText = Number.isFinite(Number(diagnostics.reviewSignalFileCount))
      ? `<br>全包字段复核：${Number(diagnostics.reviewSignalFileCount).toLocaleString('zh-CN')} 个文件、${Number(diagnostics.reviewSignalOccurrenceCount || 0).toLocaleString('zh-CN')} 次提示；不自动删除负值/零值<br>证据深度：描述区间 ${Number(depth.descriptive_interval || 0)} · 动态事件 ${Number(depth.dynamic_event_only || 0)} · 通用统计 ${Number(depth.generic_metrics_only || 0)} · 正式性能点 ${Number(depth.formal_kpi || 0)}`
      : '';
    if (riskFields) {
      const topFields = Array.isArray(diagnostics.topObservedReviewFields) ? diagnostics.topObservedReviewFields.slice(0, 5) : [];
      riskFields.innerHTML = topFields.length
        ? `<b>字段值复核重点：</b><br>${topFields.map((item) => `${escapeHtml(item.source)}：${Number(item.fileCount || 0).toLocaleString('zh-CN')} 文件，负值 ${Number(item.negativeCount || 0).toLocaleString('zh-CN')}，零值 ${Number(item.zeroCount || 0).toLocaleString('zh-CN')}`).join('<br>')}<br><span class="muted">仅作字段语义/无效码复核提示，不自动判定异常。</span>`
        : '当前版本未提供字段级复核重点。';
    }
    if (note) note.innerHTML = `处理数据进入适配器：${Number(summary.processedRowsEnteredAdapters || 0).toLocaleString('zh-CN')} 行/功率点 · 正式符合性声明：${Number(summary.formalConformityClaims || 0)}<br>阻断项：${escapeHtml((summary.blockedReasons || ['unknown']).join('、'))}；${escapeHtml(summary.boundary || '保留哈希，不生成测试结论。')}${diagnosticText}`;
  } catch {
    // The hard-coded markup remains a safe fallback for offline/local previews.
  }
}

function downloadCoverageReview() {
  const status = $('#coverage-review-status');
  const fields = state.coverageSummary?.fieldDiagnostics?.topObservedReviewFields;
  if (!Array.isArray(fields) || !fields.length) {
    if (status) status.textContent = '当前版本没有可导出的字段复核重点。';
    return;
  }
  const rows = [
    ['字段', '文件数', '负值数', '零值数', '解析无效值数', '复核原因'],
    ...fields.slice(0, 5).map((item) => [item.source, item.fileCount || 0, item.negativeCount || 0, item.zeroCount || 0, item.parseInvalidCount || 0, (item.reasons || []).join('；')])
  ];
  const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = 'T02-v' + (state.coverageSummary.auditVersion || 'current') + '-字段值复核重点.csv';
  link.click();
  URL.revokeObjectURL(link.href);
  if (status) status.textContent = '已下载 ' + Math.min(fields.length, 5) + ' 个字段复核重点；仅含聚合计数，不含原始数据。';
}

function buildEnhancedMarkdown(result, fileName, schema) {
  const schemaNote = schema?.note || '完整 Python/Excel 报告引擎已开源，见 t02-equipment-test-report-assistant 仓库。';
  const labels = schema?.kpiLabels || {};
  const parts = [
    '# 氢能设备测试增强报告',
    '',
    `- 数据文件：${fileName}`,
    `- 自动判定：**${result.verdict}**`,
    `- 生成时间：${new Date().toISOString()}`,
    `- 来源：${schema?.source || 'h2-testlens-hackathon 前端模拟 + ' + schemaNote}`,
    '',
    '## 结论摘要',
    '',
    result.narrative || '本次测试完成，未见明确异常。',
    '',
    '## 数据质量',
    '',
    `- 记录数：${result.quality?.rowCount ?? 'N/A'}`,
    `- 关键字段完整率：${result.quality?.completenessPct ?? 'N/A'}%`,
    `- 缺失字段：${(result.quality?.missingHeaders || []).join('、') || '无'}`,
    `- 重复时间戳：${result.quality?.duplicateTimestampCount ?? 'N/A'} 条`,
    '',
    '## KPI 摘要',
    '',
    '| 指标 | 数值 |',
    '|---|---:|'
  ];
  const metrics = result.metrics || {};
  const kpiEntries = [
    ['durationS', '测试时长', ' s'],
    ['peakPowerW', '峰值功率', ' W'],
    ['steadyVoltageMeanV', '稳态平均电压', ' V'],
    ['steadyVoltageStdV', '稳态电压标准差', ' V'],
    ['peakTemperatureC', '峰值温度', ' °C'],
    ['peakPressureBar', '峰值压力', ' bar'],
    ['peakLeakPpm', '峰值泄漏监测', ' ppm'],
    ['pressureDriftBarPerMin', '压力漂移', ' bar/min'],
    ['hydrogenVolumeNl', '产氢量', ' NL'],
    ['specificEnergyKWhPerNm3', '单位制氢电耗', ' kWh/Nm³'],
    ['minimumHydrogenPurityPct', '最低氢气纯度', '%']
  ];
  for (const [key, label, unit] of kpiEntries) {
    if (metrics[key] !== undefined && metrics[key] !== null) {
      parts.push(`| ${labels[key] || label} | ${metrics[key]}${unit} |`);
    }
  }
  parts.push('');
  parts.push('## 异常与建议', '');
  if (!(result.issues || []).length) {
    parts.push('- 无异常');
  }
  for (const issue of result.issues || []) {
    parts.push(`- **${issue.severity}｜${issue.title}**：${issue.evidence}。建议：${issue.recommendation}`);
  }
  parts.push('');
  parts.push('## 工况分段', '');
  if (!(result.phases || []).length) {
    parts.push('- 无分段信息');
  }
  for (const phase of result.phases || []) {
    parts.push(`- ${phase.phase}：${phase.count} 个样本，${phase.durationS} s`);
  }
  parts.push('');
  parts.push('## 当前判定阈值', '');
  const thresholdMap = [
    ['maxTemperatureC', '温度', ' °C'],
    ['maxPressureBar', '压力', ' bar'],
    ['maxLeakPpm', '泄漏监测', ' ppm'],
    ['maxVoltageStdV', '稳态电压标准差', ' V'],
    ['maxPressureDriftBarPerMin', '压力漂移绝对值', ' bar/min']
  ];
  for (const [key, label, unit] of thresholdMap) {
    const value = result.config?.[key];
    if (value !== undefined && value !== null) parts.push(`- ${label} ≤ ${value}${unit}`);
  }
  parts.push('');
  parts.push('## 报告说明', '');
  parts.push(schemaNote);
  return parts.join('\n');
}

async function exportEnhancedReport(result, fileName) {
  if (!result) return;
  let schema = null;
  try {
    const response = await fetch(assetUrl('config/enhanced-report-schema.json'));
    if (response.ok) schema = await response.json();
  } catch {
    // 静态 JSON 不可用时继续生成本地增强报告
  }
  const markdown = buildEnhancedMarkdown(result, fileName, schema);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${fileName.replace(/\.(csv|txt|tsv)$/i, '')}-增强报告.md`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function loadReleaseSummary() {
  const element = $('#release-summary');
  if (!element) return;
  try {
    const response = await fetch(assetUrl('config/release-summary.json'));
    if (!response.ok) throw new Error('release_summary_unavailable');
    const summary = await response.json();
    const shortCommit = summary.commit ? String(summary.commit).slice(0, 12) : '未绑定 commit';
    const gateEntries = Object.values(summary.gates || {});
    const allGatesPassed = gateEntries.length > 0 && gateEntries.every((gate) => gate?.status === 'passed');
    const hasPackageNotRun = summary.gates?.packageSmoke?.status === 'not_run';
    const gateStatus = allGatesPassed
      ? '门控已回读'
      : summary.commit && hasPackageNotRun
        ? 'commit 已绑定 · package 未执行'
        : summary.commit && gateEntries.length > 0
          ? 'commit 已绑定 · 门控未全通过'
          : '门控未绑定';
    const t02 = summary.t02 || {};
    element.textContent = `公开版本 v${summary.version || '—'} · ${summary.releaseStatus || 'DEMO_ONLY'} · ${gateStatus} · commit ${shortCommit} · T02 ${t02.totalFiles || 0} 文件 / ${t02.formalConformityClaims || 0} 项正式符合性声明`;
    element.dataset.tone = summary.commit && allGatesPassed ? 'ready' : 'neutral';
  } catch {
    element.textContent = '公开版本状态：未绑定发布 receipt · DEMO_ONLY';
    element.dataset.tone = 'neutral';
  }
}

async function loadLegacySample() {
  try {
    await loadCsv(assetUrl('sample-data/test_run_legacy_cn.csv'), '中文单位样本 · legacy_run_cn.csv');
  } catch (error) {
    setAnalysisStatus(`中文/单位样本读取失败：${error.message}`, 'error');
    const notice = $('#schema-notice');
    if (notice) notice.textContent = '请刷新页面、检查 Pages 资源，或改为手动导入 CSV/TXT。';
  }
}

$('#file-input').addEventListener('change', async (event) => {
  const input = event.currentTarget;
  const files = [...event.target.files];
  if (!files.length) return;
  updateDropZoneFileCount(files);
  try {
    const loaded = await withLoading(readSelectedDataFiles(files), `读取 ${files.length} 个文件…`);
    await bindRawDataHash(loaded.hashText);
    state.durabilityReports = loaded.durabilityReports;
    state.currentManifest = loaded.manifest;
    state.inputEntries = loaded.entries;
    const workbookEntries = loaded.entries.filter((entry) => entry.workbookEvidence);
    state.workbookEvidence = workbookEntries.length === 1 ? workbookEntries[0].workbookEvidence : null;
    state.batchDeclarationInput = null;
    state.batchValidation = null;
    state.batchSummaries = [];
    state.inputSummary = loaded.inputSummary;
    state.incrementalDiff = diffManifests(readBatchManifest(window.localStorage), state.currentManifest);
    state.stackSelectionOverrides = {};
    state.rows = loaded.rows; state.fileName = loaded.entries.length === 1 ? loaded.entries[0].name : `多文件批次 · ${loaded.entries.length} 个文件`;
    if (!state.rows.length) {
      const emptyFiles = loaded.entries.filter((entry) => entry.parseHint).map((entry) => `${entry.name}（${entry.parseHint}）`).join('、') || 'none';
      const emptyMessage = emptyFiles !== 'none' ? `其中 ${emptyFiles}；` : '';
      setAnalysisStatus(`已读取 ${loaded.entries.length} 个文件，但没有可分析的时序数据；${emptyMessage}参考资料已保留，二进制文本已阻断。`, 'error');
      const blockedReasons = loaded.entries.filter((entry) => entry.status === 'blocked_binary').map((entry) => entry.binaryReason || 'unknown');
      $('#schema-notice').textContent = `参考资料 ${loaded.inputSummary.referenceOnly} 份 · 阻断二进制 ${loaded.inputSummary.blockedBinary} 份（${blockedReasons.join('、') || 'unknown'}） · 解析错误 ${loaded.inputSummary.parserErrors} 份`;
      return;
    }
    saveRecentFile(state.fileName, state.rawDataHash);
    await analyzeCurrent('导入分析');
  } catch (error) {
    setAnalysisStatus(`导入失败：${error.message}`, 'error');
    $('#schema-notice').textContent = `导入失败：${error.message}`;
  } finally {
    input.value = '';
  }
});
$('#batch-declaration-file').addEventListener('change', async (event) => {
  const input = event.currentTarget;
  const file = event.target.files[0];
  if (!file) return;
  try {
    state.batchDeclarationInput = JSON.parse(await file.text());
    await evaluateDeclaredBatch();
    $('#batch-observation-file-status').textContent = `已读取声明文件：${file.name}`;
  } catch (error) {
    state.batchDeclarationInput = {};
    state.batchValidation = { ok: false, errors: [error.message] };
    state.batchSummaries = [];
    renderBatchObservation();
    $('#batch-observation-file-status').textContent = '声明 JSON 读取失败';
  } finally {
    input.value = '';
  }
});
$('#reanalyze').addEventListener('click', () => { void analyzeCurrent('重新分析'); });
$('#profile-select').addEventListener('change', () => { applyProfile($('#profile-select').value); void analyzeCurrent('切换 profile'); });
['max-temperature', 'max-pressure', 'max-leak', 'max-voltage-std', 'max-pressure-drift'].forEach((id) => document.querySelector(`#${id}`).addEventListener('input', () => { $('#profile-select').value = CUSTOM_PROFILE_ID; applyProfile(CUSTOM_PROFILE_ID); }));
$('#load-demo').addEventListener('click', loadSampleSafely);
$('#load-legacy').addEventListener('click', loadLegacySample);
$('#profile-file').addEventListener('change', async (event) => {
  const input = event.currentTarget;
  const file = event.target.files[0];
  if (!file) return;
  try {
        const packagePayload = JSON.parse(await file.text());
        const packageResult = profilesFromPackage(packagePayload, await runtimeProfilePackageOptions(packagePayload));
    if (!packageResult.ok) throw new Error(packageResult.errors.join('；'));
    applyProfilePackage(packageResult);
  } catch (error) {
    $('#profile-import-status').textContent = `导入失败：${error.message}`;
  } finally {
    input.value = '';
  }
});
$('#parameter-file').addEventListener('change', async (event) => {
  const input = event.currentTarget;
  const file = event.target.files[0];
  if (!file) return;
  try {
    await ensureBrowserEngines({ spreadsheet: true });
    setSpreadsheetEngine(globalThis.XLSX);
    const parsed = parseParameterWorkbook(await file.arrayBuffer());
    state.parameterConfig = parsed;
    $('#parameter-import-status').textContent = parsed.ok ? `已校验：${parsed.parameterSheet} + ${parsed.targetSheet} · ${parsed.targetConditions.length} 个目标工况` : `导入失败：${parsed.errors.join('；')}`;
    if (state.rows.length) void analyzeCurrent('应用参数工况');
  } catch (error) {
    state.parameterConfig = null;
    $('#parameter-import-status').textContent = `导入失败：${error.message}`;
  } finally {
    input.value = '';
  }
});
$('#metadata-raw-ref').addEventListener('input', (event) => { event.target.dataset.generated = 'false'; });
$('#load-profile-demo').addEventListener('click', async () => {
  try {
    const response = await fetch(assetUrl('config/enterprise-profile.example.json'));
    if (!response.ok) throw new Error('示例配置读取失败');
        const packagePayload = await response.json();
        const packageResult = profilesFromPackage(packagePayload, await runtimeProfilePackageOptions(packagePayload));
    if (!packageResult.ok) throw new Error(packageResult.errors.join('；'));
    const sampleResponse = await fetch(assetUrl('sample-data/test_run_legacy_cn.csv'));
    if (!sampleResponse.ok) throw new Error('配置匹配样本读取失败');
    const sampleText = await sampleResponse.text();
    await bindRawDataHash(sampleText);
    state.rows = parseCSV(sampleText);
    state.stackSelectionOverrides = {};
    state.workbookEvidence = null;
    state.fileName = '企业配置示例 · legacy_run_cn.csv';
    applyProfilePackage(packageResult);
  } catch (error) {
    $('#profile-import-status').textContent = `导入失败：${error.message}`;
  }
});
$('#load-t02-profiles')?.addEventListener('click', async () => {
  try {
    const response = await fetch(assetUrl('config/t02-profile.example.json'));
    if (!response.ok) throw new Error('T02 profile 包读取失败');
        const packagePayload = await response.json();
        const packageResult = profilesFromPackage(packagePayload, await runtimeProfilePackageOptions(packagePayload));
    if (!packageResult.ok) throw new Error(packageResult.errors.join('；'));
    applyProfilePackage(packageResult);
    $('#profile-import-status').textContent = `${packageResult.organization} · 已载入 T02 ${packageResult.profiles.length} 个描述性 profile；未执行阈值/验收判定`;
  } catch (error) {
    $('#profile-import-status').textContent = `导入失败：${error.message}`;
  }
});
$('#save-history').addEventListener('click', () => {
  if (!state.result) return;
  const previous = state.history[0];
  const thumbnail = generateHistoryThumbnail(state.result);
  state.history = appendHistory(window.localStorage, state.result, state.fileName, undefined, state.currentManifest, thumbnail);
  writeBatchManifest(window.localStorage, state.currentManifest);
  if (previous) state.comparison = compareResults(previous, state.result, { baselineName: previous.fileName, currentName: state.fileName });
  renderHistory();
  renderComparison();
  $('#history-status').textContent = previous ? '已保存并完成上一批对比' : '已保存当前批次';
});
$('#clear-history').addEventListener('click', () => { state.history = clearHistory(window.localStorage); writeBatchManifest(window.localStorage, []); state.currentManifest = []; state.incrementalDiff = null; state.comparison = null; renderHistory(); renderComparison(); });
$('#compare-demo').addEventListener('click', async () => {
  if (!state.result) { $('#compare-status').textContent = '请先载入并分析数据'; return; }
  const button = $('#compare-demo');
  button.disabled = true;
  button.textContent = '对比中…';
  try {
    const response = await fetch(assetUrl('sample-data/test_run_baseline.csv'));
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
  if (!state.result) { $('#report-status').textContent = '请先载入并分析数据'; return; }
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
$('#copy-report').addEventListener('click', async () => {
  if (!state.result) { $('#report-status').textContent = '请先载入并分析数据'; return; }
  const text = reportMarkdown(state.result, state.fileName, { comparison: state.comparison, aiDraft: state.aiDraft });
  try { await navigator.clipboard?.writeText(text); $('#report-status').textContent = '报告已复制到剪贴板'; } catch { $('#report-status').textContent = '复制失败，请手动复制'; }
});
$('#print-report').addEventListener('click', () => {
  const preview = $('#report-preview');
  if (!preview || !state.result) { $('#report-status').textContent = '请先载入并分析数据'; return; }
  const win = window.open('', '_blank');
  if (!win) { $('#report-status').textContent = '弹窗被拦截，请允许打印窗口'; return; }
  win.document.write(`<html><head><title>报告打印</title><style>body{font-family:system-ui,sans-serif;max-width:900px;margin:0 auto;padding:24px;line-height:1.6;color:#0b1a24;white-space:pre-wrap;}</style></head><body>${escapeHtml(preview.innerText)}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
});
$('#download-report').addEventListener('click', () => { if (!state.result) { $('#report-status').textContent = '请先载入并分析数据'; return; } const blob = new Blob([reportMarkdown(state.result, state.fileName, { comparison: state.comparison, aiDraft: state.aiDraft })], { type: 'text/markdown;charset=utf-8' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${state.fileName.replace(/\.csv$/i, '')}-自动报告.md`; link.click(); URL.revokeObjectURL(link.href); });
$('#download-xlsx').addEventListener('click', async () => {
  if (!state.result) { $('#report-status').textContent = '请先载入并分析数据'; return; }
  try {
    await ensureBrowserEngines({ spreadsheet: true });
    setSpreadsheetEngine(globalThis.XLSX);
    const workbook = buildEnterpriseWorkbook(state.result, state.fileName, { parameterConfig: state.parameterConfig, manifest: state.currentManifest, incrementalDiff: state.incrementalDiff });
    const rawWorkbook = workbookArrayBuffer(workbook);
    const workbookBytes = await addNativeChartToWorkbook(rawWorkbook, state.result.dataset || {});
    const blob = new Blob([workbookBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${state.fileName.replace(/\.(csv|txt|tsv)$/i, '')}-TestLens报告.xlsx`; link.click(); URL.revokeObjectURL(link.href);
  } catch (error) {
    $('#report-status').textContent = `Excel 导出失败：${error.message}`;
  }
});
$('#download-json').addEventListener('click', () => { if (!state.result) { $('#report-status').textContent = '请先载入并分析数据'; return; } const blob = new Blob([JSON.stringify({ ...publicAnalysis(state.result), comparison: state.comparison, aiDraft: state.aiDraft }, null, 2)], { type: 'application/json;charset=utf-8' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${state.fileName.replace(/\.csv$/i, '')}-分析证据.json`; link.click(); URL.revokeObjectURL(link.href); });
$('#download-enhanced').addEventListener('click', () => { if (!state.result) { $('#report-status').textContent = '请先载入并分析数据'; return; } void exportEnhancedReport(state.result, state.fileName); });
$('#download-coverage-review')?.addEventListener('click', downloadCoverageReview);
window.addEventListener('resize', () => { if (state.result) { drawChart(state.result); drawEnterpriseChart(state.result); drawEnterprisePerformanceChart(state.result); } });

window.addEventListener('keydown', (event) => {
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  const ctrlKey = isMac ? event.metaKey : event.ctrlKey;
  if (!ctrlKey && event.key !== 'Escape') return;
  if (event.key === 'Escape') {
    const quickStart = $('#quick-start-overlay');
    const loading = $('#loading-overlay');
    if (quickStart && !quickStart.hidden) { dismissQuickStart(); event.preventDefault(); return; }
    if (loading && !loading.hidden) { hideLoading(); event.preventDefault(); return; }
    return;
  }
  if ((event.key === 'o' || event.key === 'O') && !event.shiftKey) {
    event.preventDefault();
    $('#file-input').click();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    if (state.result) void analyzeCurrent('手动重分析');
    else void loadSampleSafely();
    return;
  }
  if ((event.key === 'l' || event.key === 'L') && !event.shiftKey) {
    event.preventDefault();
    void loadSampleSafely();
    return;
  }
  if (event.key === 'z' && !event.shiftKey) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) { undoResult(); }
    return;
  }
  if (event.key === 'y' || (event.key === 'z' && event.shiftKey)) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) { redoResult(); }
    return;
  }
});

function showLoading(message = '分析中…') {
  const overlay = $('#loading-overlay');
  const msg = $('#loading-message');
  if (overlay) { overlay.hidden = false; overlay.setAttribute('aria-hidden', 'false'); }
  if (msg) msg.textContent = message;
}
function hideLoading() {
  const overlay = $('#loading-overlay');
  if (overlay) { overlay.hidden = true; overlay.setAttribute('aria-hidden', 'true'); }
}
async function withLoading(promise, message = '处理中…') {
  showLoading(message);
  try { return await promise; }
  finally { hideLoading(); }
}
function showQuickStart() {
  const overlay = $('#quick-start-overlay');
  if (overlay && !window.localStorage.getItem('h2-testlens-quick-start-dismissed')) { overlay.hidden = false; trapFocus(overlay); const first = overlay.querySelector('button'); if (first) first.focus(); }
}
function dismissQuickStart() {
  const overlay = $('#quick-start-overlay');
  if (overlay) { overlay.hidden = true; }
  try { window.localStorage.setItem('h2-testlens-quick-start-dismissed', 'true'); } catch {}
}
function setDragOverState(active) {
  const zone = $('#drop-zone');
  if (!zone) return;
  if (active) { zone.classList.add('drag-over'); zone.setAttribute('aria-dropeffect', 'copy'); }
  else { zone.classList.remove('drag-over'); zone.removeAttribute('aria-dropeffect'); }
}

const dropZone = $('#drop-zone');
if (dropZone) {
  dropZone.addEventListener('dragover', (event) => { event.preventDefault(); event.stopPropagation(); setDragOverState(true); });
  dropZone.addEventListener('dragleave', (event) => { event.preventDefault(); event.stopPropagation(); setDragOverState(false); });
  dropZone.addEventListener('drop', async (event) => {
    event.preventDefault(); event.stopPropagation(); setDragOverState(false);
    const files = [...event.dataTransfer.files];
    if (!files.length) return;
    const input = $('#file-input');
    updateDropZoneFileCount(files);
    try {
      const loaded = await withLoading(readSelectedDataFiles(files), `读取 ${files.length} 个文件…`);
      await bindRawDataHash(loaded.hashText);
      state.durabilityReports = loaded.durabilityReports;
      state.currentManifest = loaded.manifest;
      state.inputEntries = loaded.entries;
      const workbookEntries = loaded.entries.filter((entry) => entry.workbookEvidence);
      state.workbookEvidence = workbookEntries.length === 1 ? workbookEntries[0].workbookEvidence : null;
      state.batchDeclarationInput = null;
      state.batchValidation = null;
      state.batchSummaries = [];
      state.inputSummary = loaded.inputSummary;
      state.incrementalDiff = diffManifests(readBatchManifest(window.localStorage), state.currentManifest);
      state.stackSelectionOverrides = {};
      state.rows = loaded.rows;
      state.fileName = loaded.entries.length === 1 ? loaded.entries[0].name : `多文件批次 · ${loaded.entries.length} 个文件`;
      if (!state.rows.length) {
        const emptyFiles = loaded.entries.filter((entry) => entry.parseHint).map((entry) => `${entry.name}（${entry.parseHint}）`).join('、') || 'none';
        const emptyMessage = emptyFiles !== 'none' ? `其中 ${emptyFiles}；` : '';
        setAnalysisStatus(`已读取 ${loaded.entries.length} 个文件，但没有可分析的时序数据；${emptyMessage}参考资料已保留，二进制文本已阻断。`, 'error');
        const blockedReasons = loaded.entries.filter((entry) => entry.status === 'blocked_binary').map((entry) => entry.binaryReason || 'unknown');
        $('#schema-notice').textContent = `参考资料 ${loaded.inputSummary.referenceOnly} 份 · 阻断二进制 ${loaded.inputSummary.blockedBinary} 份（${blockedReasons.join('、') || 'unknown'}） · 解析错误 ${loaded.inputSummary.parserErrors} 份`;
        return;
      }
      saveRecentFile(state.fileName, state.rawDataHash);
      await analyzeCurrent('导入分析');
    } catch (error) {
      setAnalysisStatus(`导入失败：${error.message}`, 'error');
      $('#schema-notice').textContent = `导入失败：${error.message}`;
    }
  });
}

const originalAnalyzeCurrent = analyzeCurrent;
analyzeCurrent = async function(reason = '重新分析') {
  showLoading(`${reason}：准备中…`);
  try { await originalAnalyzeCurrent(reason); }
  finally { hideLoading(); }
};

$('#close-quick-start')?.addEventListener('click', dismissQuickStart);
$('#quick-start-overlay')?.addEventListener('click', (event) => { if (event.target.classList.contains('overlay-backdrop')) dismissQuickStart(); });

$('#theme-toggle')?.addEventListener('click', toggleTheme);
$('#undo-result')?.addEventListener('click', undoResult);
$('#redo-result')?.addEventListener('click', redoResult);
$('#save-history-top')?.addEventListener('click', () => {
  if (!state.result) return;
  $('#save-history').click();
});
$('#retry-analysis')?.addEventListener('click', () => { void analyzeCurrent('重试'); });
$('#recent-files-list')?.addEventListener('click', (event) => {
  const chip = event.target.closest('.recent-file-chip');
  if (!chip) return;
  const name = chip.dataset.name;
  setAnalysisStatus(`最近文件：${name}；请重新导入该文件进行分析。`, 'neutral');
});

const originalReadSelectedDataFiles = readSelectedDataFiles;
readSelectedDataFiles = async function(files) {
  try { return await originalReadSelectedDataFiles(files); }
  catch (error) {
    const hasCsv = files.some((file) => /\.(csv|txt|tsv)$/i.test(file.name));
    const baseHint = hasCsv && files.some((file) => /\.(csv|txt|tsv)$/i.test(file.name) && file.size < 200)
      ? '文件过小或为空，请确认包含表头和时序数据。'
      : '请确认文件未加密、未损坏，且格式与示例一致。';
    const missingHeaders = hasCsv ? '常见缺失表头：timestamp、current_a、avg_cell_voltage_v、power_kw、temperature_c、pressure_bar。' : '';
    const hint = missingHeaders ? `${baseHint} ${missingHeaders}` : baseHint;
    throw new Error(`${error.message}；${hint}`);
  }
};

// Keyboard shortcuts for power users.
function showKeyboardShortcuts() {
  const overlay = $('#keyboard-shortcuts-overlay');
  if (overlay) { overlay.hidden = false; trapFocus(overlay); const first = overlay.querySelector('button'); if (first) first.focus(); }
}
function dismissKeyboardShortcuts() {
  const overlay = $('#keyboard-shortcuts-overlay');
  if (overlay) overlay.hidden = true;
}
document.addEventListener('keydown', (event) => {
  const active = document.activeElement;
  const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
  const ctrl = event.ctrlKey || event.metaKey;
  if (ctrl && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    $('#file-input').click();
  } else if (ctrl && event.key.toLowerCase() === 's') {
    event.preventDefault();
    if (state.result) $('#save-history').click();
  } else if (ctrl && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (!isInput) $('#undo-result').click();
  } else if (ctrl && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    if (!isInput) $('#redo-result').click();
  } else if (ctrl && event.key === '/') {
    event.preventDefault();
    showKeyboardShortcuts();
  } else if (ctrl && event.shiftKey && event.key.toLowerCase() === 'r') {
    event.preventDefault();
    void analyzeCurrent('重分析');
  } else if (ctrl && event.shiftKey && event.key.toLowerCase() === 'l') {
    event.preventDefault();
    void loadSampleSafely();
  } else if (ctrl && event.shiftKey && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    if (state.result) $('#compare-demo').click();
  } else if (event.key === 'F2') {
    event.preventDefault();
    if (state.result) $('#save-history').click();
  } else if (ctrl && /^[1-4]$/.test(event.key)) {
    event.preventDefault();
    const targets = { '1': '#metric-grid', '2': '#trend-chart', '3': '#enterprise-panel', '4': '#issue-list' };
    const el = $(targets[event.key]);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (event.key === 'Escape') {
    dismissKeyboardShortcuts();
    dismissQuickStart();
  }
});

// Batch progress indicator.
function setBatchProgress(current, total, message) {
  const bar = $('#batch-progress-fill');
  const text = $('#batch-progress-text');
  const container = $('#batch-progress');
  if (!bar || !text) return;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  bar.style.width = `${pct}%`;
  text.textContent = `${message} ${current}/${total}`;
  if (container) {
    container.setAttribute('role', 'progressbar');
    container.setAttribute('aria-valuenow', String(pct));
    container.setAttribute('aria-valuemin', '0');
    container.setAttribute('aria-valuemax', '100');
    container.setAttribute('aria-label', message || '批量处理进度');
  }
}
function resetBatchProgress() {
  const bar = $('#batch-progress-fill');
  const text = $('#batch-progress-text');
  if (bar) bar.style.width = '0%';
  if (text) text.textContent = '';
}

// Enterprise quick-config buttons.
function applyEnterpriseConfig(vendor) {
  const profileSelect = $('#profile-select');
  if (!profileSelect) return;
  const profileMap = { qingchuan: 'qingchuan-stack', qingzhihuli: 'qingzhihuli-vehicle', hypu: 'hypu-durability' };
  const profileId = profileMap[vendor] || 'electrolyzer-demo';
  profileSelect.value = profileId;
  applyProfile(profileId);
  if (state.rows.length) void analyzeCurrent(`应用${vendor}配置`);
  else setAnalysisStatus(`已切换至 ${vendor} 配置模板，导入数据后将自动应用。`, 'neutral');
}

// Improved drag-and-drop feedback.
function updateDropZoneFileCount(files) {
  const notice = $('#schema-notice');
  if (!notice) return;
  const csvCount = files.filter((f) => /\.(csv|txt|tsv)$/i.test(f.name)).length;
  const xlsxCount = files.filter((f) => /\.(xlsx|xlsm)$/i.test(f.name)).length;
  const docxCount = files.filter((f) => /\.docx$/i.test(f.name)).length;
  const parts = [];
  if (csvCount) parts.push(`${csvCount} 个文本表格`);
  if (xlsxCount) parts.push(`${xlsxCount} 个 Excel`);
  if (docxCount) parts.push(`${docxCount} 个 DOCX`);
  notice.textContent = parts.length ? `准备导入：${parts.join('、')}` : '等待字段映射';
}

$('#close-shortcuts')?.addEventListener('click', dismissKeyboardShortcuts);
$('#keyboard-shortcuts-overlay')?.addEventListener('click', (event) => { if (event.target.classList.contains('overlay-backdrop')) { trapFocus($('#keyboard-shortcuts-overlay')); dismissKeyboardShortcuts(); } });
$('#enterprise-qingchuan')?.addEventListener('click', () => { void applyEnterpriseConfig('qingchuan'); });
$('#enterprise-qingzhihuli')?.addEventListener('click', () => { void applyEnterpriseConfig('qingzhihuli'); });
$('#enterprise-hypu')?.addEventListener('click', () => { void applyEnterpriseConfig('hypu'); });

// Batch queue management
function renderBatchQueue(entries) {
  const container = $('#batch-queue');
  if (!container) return;
  if (!entries || !entries.length) { container.hidden = true; return; }
  container.hidden = false;
  const processed = entries.filter((e) => e.status === 'processed').length;
  const failed = entries.filter((e) => e.status === 'parser_error' || e.status === 'blocked_binary').length;
  const totalSize = entries.reduce((sum, e) => sum + (e.size || 0), 0);
  const sizeLabel = totalSize >= 1024 * 1024 ? `${(totalSize / (1024 * 1024)).toFixed(1)} MB` : `${(totalSize / 1024).toFixed(1)} KB`;
  const batchActions = failed ? `<button id="retry-all-failed" aria-label="重试所有失败">重试所有失败 (${failed})</button><button id="remove-all-failed" aria-label="移除所有失败">移除所有失败</button>` : '';
  container.innerHTML = `<div class="batch-queue-header"><span class="batch-summary">${entries.length} 个文件 · ${sizeLabel} · ${processed} 已处理${failed ? ` · ${failed} 失败` : ''}</span><div class="batch-queue-actions">${batchActions}<button id="clear-completed" aria-label="清除已完成">清除已完成</button></div></div>` + entries.map((entry, index) => {
    const statusClass = entry.status === 'processed' ? 'status-done' : entry.status === 'parser_error' ? 'status-error' : entry.status === 'blocked_binary' ? 'status-error' : entry.status === 'reference_only' ? 'status-pending' : 'status-processing';
    const statusLabel = entry.status === 'processed' ? '已处理' : entry.status === 'parser_error' ? '解析失败' : entry.status === 'blocked_binary' ? '已阻断' : entry.status === 'reference_only' ? '参考资料' : '处理中';
    const size = entry.size ? `${(entry.size / 1024).toFixed(1)} KB` : '—';
    const hint = entry.parseHint ? ` · ${escapeHtml(entry.parseHint)}` : '';
    const retryHint = (entry.status === 'parser_error' || entry.status === 'blocked_binary') ? '<div class="batch-retry-hint">点击“重试”后，请在弹出的文件选择框中重新选择该文件；也可点击“移除所有失败”清空列表。</div>' : '';
    const actions = entry.status === 'parser_error' || entry.status === 'blocked_binary' ? `<button data-retry="${index}" aria-label="重试">重试</button><button data-remove="${index}" aria-label="移除">移除</button>` : (entry.status === 'pending' ? `<button data-remove="${index}" aria-label="移除">移除</button>` : '');
    return `<div class="batch-queue-item ${entry.status === 'pending' || entry.status === 'processing' ? 'processing' : ''}" data-index="${index}"><div class="file-info"><span class="file-name" title="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</span><div class="file-meta"><span>${size}</span><span class="status-chip ${statusClass}">${statusLabel}</span>${hint ? `<span class="muted">${hint}</span>` : ''}</div>${retryHint}</div><div class="batch-queue-actions">${actions}</div></div>`;
  }).join('');
}
function updateBatchQueueItem(entries, index, updates) {
  const item = document.querySelector(`.batch-queue-item[data-index="${index}"]`);
  if (!item) return;
  const entry = entries[index];
  if (!entry) return;
  Object.assign(entry, updates);
  const statusClass = entry.status === 'processed' ? 'status-done' : entry.status === 'parser_error' ? 'status-error' : entry.status === 'blocked_binary' ? 'status-error' : entry.status === 'reference_only' ? 'status-pending' : 'status-processing';
  const statusLabel = entry.status === 'processed' ? '已处理' : entry.status === 'parser_error' ? '解析失败' : entry.status === 'blocked_binary' ? '已阻断' : entry.status === 'reference_only' ? '参考资料' : '处理中';
  const chip = item.querySelector('.status-chip');
  if (chip) { chip.className = `status-chip ${statusClass}`; chip.textContent = statusLabel; }
}

// Batch queue event delegation.
$('#batch-queue')?.addEventListener('click', async (event) => {
  const retryButton = event.target.closest('button[data-retry]');
  const removeButton = event.target.closest('button[data-remove]');
  if (retryButton) {
    const index = Number(retryButton.dataset.retry);
    const entry = state.inputEntries?.[index];
    const name = entry?.name || '该文件';
    setAnalysisStatus(`请重新选择 ${name} 进行导入；失败条目已保留在列表中，移除后需手动清空。`, 'neutral');
    $('#file-input').click();
  } else if (removeButton) {
    const index = Number(removeButton.dataset.remove);
    const item = document.querySelector(`.batch-queue-item[data-index="${index}"]`);
    if (item) {
      item.remove();
      const hint = item.querySelector('.batch-retry-hint');
      if (hint) hint.remove();
    }
  }
});
$('#clear-completed')?.addEventListener('click', () => {
  const items = document.querySelectorAll('.batch-queue-item');
  items.forEach((item) => {
    const index = Number(item.dataset.index);
    const entry = state.inputEntries?.[index];
    if (entry && entry.status === 'processed') item.remove();
  });
  const remaining = document.querySelectorAll('.batch-queue-item');
  if (!remaining.length) { const container = $('#batch-queue'); if (container) container.hidden = true; }
});
$('#retry-all-failed')?.addEventListener('click', () => {
  setAnalysisStatus('请重新选择所有失败的文件进行导入；也可单独点击各条目右侧的“重试”。', 'neutral');
  $('#file-input').click();
});
$('#remove-all-failed')?.addEventListener('click', () => {
  const items = document.querySelectorAll('.batch-queue-item');
  items.forEach((item) => {
    const index = Number(item.dataset.index);
    const entry = state.inputEntries?.[index];
    if (entry && (entry.status === 'parser_error' || entry.status === 'blocked_binary')) item.remove();
  });
  const remaining = document.querySelectorAll('.batch-queue-item');
  if (!remaining.length) { const container = $('#batch-queue'); if (container) container.hidden = true; }
});

ensureExtendedMetadataFields();
renderProfileOptions();
applyProfile('electrolyzer-demo');
state.history = readHistory(window.localStorage);
renderHistory();
const savedTheme = (() => { try { return window.localStorage.getItem('h2-testlens-theme'); } catch { return null; } })();
applyTheme(savedTheme || 'dark');
state.recentFiles = getRecentFiles();
renderRecentFiles();
void loadCoverageSummary();
void ensureStandardEvidenceLedger();
void loadReleaseSummary();
showInitialLoadingState();
void loadSampleSafely();
void showQuickStart();

function initChartTooltip() {
  const canvas = $('#trend-chart');
  const tooltip = $('#chart-tooltip');
  if (!canvas || !tooltip) return;
  const showTooltip = (clientX, clientY) => {
    if (!state.result?.rows?.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const pad = { left: 36, right: 18, top: 18, bottom: 28 };
    const plotWidth = rect.width - pad.left - pad.right;
    const ratio = Math.max(0, Math.min(1, (x - pad.left) / plotWidth));
    const rows = state.result.rows.filter((row) => row.timestamp_s !== null);
    const index = Math.round(ratio * (rows.length - 1));
    const row = rows[index];
    if (!row) return;
    const temp = row.temperature_c !== null ? `${fmt(row.temperature_c, 2)} °C` : '—';
    const pressure = row.pressure_bar !== null ? `${fmt(row.pressure_bar, 2)} bar` : '—';
    const time = row.timestamp_s !== null ? `${fmt(row.timestamp_s, 1)} s` : '—';
    tooltip.innerHTML = `<div><b>${escapeHtml(time)}</b></div><div>温度：${temp}</div><div>压力：${pressure}</div>`;
    tooltip.hidden = false;
    tooltip.style.left = `${clientX + 12}px`;
    tooltip.style.top = `${clientY - 48}px`;
  };
  canvas.addEventListener('mousemove', (event) => showTooltip(event.clientX, event.clientY));
  canvas.addEventListener('mouseleave', () => { tooltip.hidden = true; });
  canvas.addEventListener('touchstart', (event) => {
    if (!state.result?.rows?.length || !event.touches.length) return;
    showTooltip(event.touches[0].clientX, event.touches[0].clientY);
  }, { passive: true });
  canvas.addEventListener('touchend', () => { tooltip.hidden = true; });
}
void initChartTooltip();
