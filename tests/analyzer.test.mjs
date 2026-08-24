import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzeRows, parseCSV, publicAnalysis, reportMarkdown } from '../src/analyzer.mjs';
import { evidenceBundle, generateDraft, validateRemoteDraft } from '../src/ai-draft.mjs';
import { phaseResultReadiness } from '../src/structured-evidence.mjs';
import { compareResults } from '../src/compare.mjs';
import { DEVICE_PROFILES, getProfile, profilesFromPackage } from '../src/profiles.mjs';
import { appendHistory, clearHistory, readHistory } from '../src/history.mjs';
import { sha256Hex } from '../src/provenance.mjs';
import { buildEnterpriseWorkbook, parseDataWorkbook, parseParameterWorkbook, setSpreadsheetEngine, workbookArrayBuffer } from '../src/excel-workflow.mjs';
import { durabilityAlertPayload, sendFeishuAlert } from '../src/feishu-alerts.mjs';
import { addNativeChartToWorkbook, setZipEngine } from '../src/xlsx-charts.mjs';
import { diffManifests, manifestFromEntries } from '../src/incremental.mjs';
import { sampleRowsForDisplay } from '../src/display-sampling.mjs';
import vm from 'node:vm';
import { loadXlsx } from '../src/xlsx-node-loader.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SheetJS = await loadXlsx();
const csv = await readFile(join(here, '../sample-data/test_run_001.csv'), 'utf8');
const baselineCsv = await readFile(join(here, '../sample-data/test_run_baseline.csv'), 'utf8');
const enterpriseProfilePayload = JSON.parse(await readFile(join(here, '../config/enterprise-profile.example.json'), 'utf8'));
const APPROVAL_EVIDENCE = Object.freeze({ approverId: 'QA-OWNER-001', approvalDate: '2026-08-22', approvalRef: 'WO-2026-0822-001', profileRevision: '2025', profileRevisionRef: 'PROFILE-REV-2025-001' });
const FULL_METHOD_UNCERTAINTY_MODEL = Object.freeze({ method: 'first_order_rss', coverageFactor: 2, standardUncertainty: { current_a: 0.01, voltage_v: 0.01, power_w: 0.02, flow_slpm: 0.01, temperature_c: 0.1, pressure_bar: 0.01, leak_ppm: 0.1, hydrogen_purity_pct: 0.01 } });
const methodEvidenceFor = (methodId = 'GB/T 45541-2025', revision = '2025') => ({
  schemaVersion: 'h2-testlens.method-evidence.v1',
  methodId,
  methodRevision: revision,
  sourceRefs: [{ sourceId: 'METHOD-SOURCE-001', locator: 'approved-method-register:coverage-v1', evidenceType: 'approved_method_register' }],
  coverageItems: [{ id: 'scope-and-execution', clauseRef: 'method.workflow', title: '方法流程与实施步骤', status: 'implemented', evidenceRefs: ['IMPL-001'] }],
  verification: { verifierId: 'METHOD-VERIFIER-001', verifiedAt: '2026-08-22', verificationRef: 'METHOD-VERIFY-001' },
  openGaps: []
});
setSpreadsheetEngine(SheetJS);
vm.runInThisContext(await readFile(join(here, '../src/vendor/jszip.min.js'), 'utf8'));
const JSZip = globalThis.JSZip;
setZipEngine(JSZip);

test('parses the demo CSV into records', () => {
  const rows = parseCSV(csv);
  assert.equal(rows.length, 25);
  assert.equal(rows[0].phase, 'idle');
  assert.equal(rows.at(-1).timestamp_s, '120');
});

test('does not silently fall back when a profile id is unknown', () => {
  assert.equal(getProfile('profile-that-does-not-exist'), null);
});

test('bounds browser chart rows while preserving source-session boundaries', () => {
  const rows = Array.from({ length: 1000 }, (_, index) => ({ index, session_id: index < 500 ? 'file:a.csv' : 'file:b.csv' }));
  const sampled = sampleRowsForDisplay(rows, 100);
  assert.equal(sampled.sampled, true);
  assert.equal(sampled.originalRowCount, 1000);
  assert.ok(sampled.rows.length <= 105);
  assert.equal(sampled.rows[0].index, 0);
  assert.equal(sampled.rows.at(-1).index, 999);
  assert.ok(sampled.rows.some((row) => row.index === 499));
  assert.ok(sampled.rows.some((row) => row.index === 500));
});

test('computes a deterministic SHA-256 provenance hash without uploading content', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('public analysis exposes versioned metricTrace without raw rows or file names', () => {
  const result = analyzeRows(parseCSV(csv), { sourceHash: 'SHA-256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
  const safe = publicAnalysis(result);
  assert.equal(safe.metricTrace.schemaVersion, 'h2-testlens.metric-trace.v1');
  assert.equal(safe.metricTrace.sourceHash, 'SHA-256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.ok(safe.metricTrace.metrics.peakPressureBar);
  assert.equal(safe.metricTrace.metrics.peakPressureBar.sourceFields.includes('pressure_bar'), true);
  assert.equal(safe.metricTrace.metrics.peakPressureBar.sourceHashStatus, 'bound');
  assert.equal('rows' in safe, false);
  assert.equal(JSON.stringify(safe.metricTrace).includes('test_run_001.csv'), false);
  const workbook = buildEnterpriseWorkbook(result, 'trace.csv');
  assert.ok(workbook.SheetNames.includes('KPI证据定位'));
  assert.match(reportMarkdown(result, 'trace.csv'), /字段级 KPI trace/);
  const unbound = publicAnalysis(analyzeRows(parseCSV(csv), { sourceHash: 'not-a-sha256' }));
  assert.equal(unbound.metricTrace.sourceHashStatus, 'not_bound');
  assert.equal(unbound.metricTrace.sourceHash, null);
});

test('integrates hydrogen volume and electrical energy from timestamped flow data', () => {
  const result = analyzeRows(parseCSV(baselineCsv));
  assert.ok(result.metrics.hydrogenVolumeNl > 0);
  assert.ok(result.metrics.energyConsumedWh > 0);
  assert.ok(result.metrics.specificEnergyKWhPerNm3 > 0);
  assert.equal(result.metrics.minimumHydrogenPurityPct, null);
});

test('converts NL and Wh to the correct kWh/Nm3 specific energy unit', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,2,30,10,6,1',
    '60,10,2,30,10,6,1'
  ].join('\n')));
  assert.equal(result.metrics.hydrogenVolumeNl, 6);
  assert.equal(result.metrics.energyConsumedWh, 1 / 3);
  assert.ok(Math.abs(result.metrics.specificEnergyKWhPerNm3 - (1 / 18)) < 1e-9);
});

test('uses an original power channel for KPI integration and preserves voltage-current cross-check evidence', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,power_w,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,2,250,30,10,6,1',
    '60,10,2,250,30,10,6,1'
  ].join('\n')));
  assert.equal(result.metrics.powerSource, 'checked');
  assert.equal(result.metrics.energyConsumedWh, 250 / 60);
  assert.equal(result.metrics.powerCrossCheck.rawPowerCount, 2);
  assert.equal(result.metrics.powerCrossCheck.maxAbsoluteDifferenceW, 230);
  assert.match(result.metrics.powerCrossCheck.evidence, /交叉核算/);
});

test('marks partial raw-power coverage instead of presenting derived segments as fully measured', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,power_w,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,2,250,30,10,6,1',
    '60,10,2,,30,10,6,1',
    '120,10,2,250,30,10,6,1'
  ].join('\n')));
  assert.equal(result.metrics.powerSource, 'mixed');
  assert.equal(result.metrics.powerCrossCheck.rawPowerCount, 2);
  assert.equal(result.metrics.powerCrossCheck.missingPowerCount, 1);
  assert.equal(result.metrics.powerCrossCheck.derivedPowerCount, 1);
  assert.ok(result.issues.some((item) => item.code === 'POWER_SOURCE_MIXED'));
});

test('converts a kW original power channel to watts before integration', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,功率(kW),temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,2,0.25,30,10,6,1',
    '60,10,2,0.25,30,10,6,1'
  ].join('\n')));
  assert.equal(result.schema.mapping.power_w, '功率(kW)');
  assert.equal(result.schema.conversions.power_w.label, 'kW→W');
  assert.equal(result.metrics.energyConsumedWh, 250 / 60);
});

test('uses the original power uncertainty when a profile provides it', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,power_w,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,2,250,30,10,6,1',
    '60,10,2,250,30,10,6,1'
  ].join('\n')), {
    uncertaintyModelRequired: true,
    uncertaintyModel: { method: 'first_order_rss', coverageFactor: 2, standardUncertainty: { current_a: 99, voltage_v: 99, power_w: 0.5, flow_slpm: 0.05, temperature_c: 0.2, pressure_bar: 0.02, leak_ppm: 0.5, hydrogen_purity_pct: 0.01 } },
    testMetadata: { signoff: 'reviewer' }
  });
  assert.ok(Math.abs(result.uncertainty.metrics.energyConsumedWh - Math.sqrt(2) / 120) < 1e-12);
});

test('propagates trapezoid uncertainty by sample sensitivity without double-counting interior points', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,power_w,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,2,10,30,10,6,1',
    '1,10,2,10,30,10,6,1',
    '2,10,2,10,30,10,6,1'
  ].join('\n')), {
    uncertaintyModelRequired: true,
    uncertaintyModel: { method: 'first_order_rss', coverageFactor: 1, standardUncertainty: { power_w: 1, flow_slpm: 1, temperature_c: 0.2, pressure_bar: 0.02, leak_ppm: 0.5 } }
  });
  const expected = Math.sqrt(1.5) / 3600;
  assert.ok(Math.abs(result.uncertainty.metrics.energyConsumedWh - expected) < 1e-12);
});

test('detects pressure and leak risks and preserves traceable evidence', () => {
  const result = analyzeRows(parseCSV(csv));
  assert.equal(result.verdict, 'FAIL');
  assert.ok(result.metrics.peakPressureBar > 30);
  assert.ok(result.metrics.peakLeakPpm > 10);
  assert.ok(result.metrics.peakPressureAtS.includes(75));
  assert.ok(result.metrics.peakLeakAtS.includes(90));
  assert.ok(result.issues.some((item) => item.code === 'PRESSURE_HIGH'));
  assert.ok(result.issues.some((item) => item.code === 'LEAK_HIGH'));
  assert.ok(result.issues.find((item) => item.code === 'PRESSURE_HIGH').evidence.includes('t=75 s'));
  assert.ok(result.phases.some((phase) => phase.phase === 'steady'));
});

test('custom thresholds can turn the same run into a warning', () => {
  const result = analyzeRows(parseCSV(csv), { maxPressureBar: 32, maxLeakPpm: 15 });
  assert.equal(result.verdict, 'WARN');
  assert.ok(result.issues.some((item) => item.code === 'PRESSURE_DRIFT'));
});

test('report contains verdict, metrics, and recommendations', () => {
  const markdown = reportMarkdown(analyzeRows(parseCSV(csv)), 'demo.csv');
  assert.match(markdown, /自动判定/);
  assert.match(markdown, /峰值泄漏监测/);
  assert.match(markdown, /建议/);
  assert.match(reportMarkdown(analyzeRows(parseCSV(csv)), 'ai-demo.csv', { aiDraft: { mode: 'local-evidence', fallbackReason: 'no_endpoint_configured', draft: 'AI 草稿内容' } }), /AI 草稿内容/);
  assert.match(markdown, /测试流程完成度/);
  assert.match(markdown, /导入企业批准的 profile/);
  assert.match(markdown, /性能测量摘要/);
});

test('fails closed on missing schema instead of returning a false pass', () => {
  const result = analyzeRows([{ timestamp_s: '0', current_a: '1' }]);
  assert.equal(result.verdict, 'FAIL');
  assert.ok(result.issues.some((item) => item.code === 'SCHEMA_MISSING'));
  assert.ok(result.issues.some((item) => item.code === 'DATA_TOO_SHORT'));
});

test('uses valid steady rows without index-shifting around a missing voltage', () => {
  const rows = [
    { timestamp_s: '0', phase: 'steady', current_a: '5', voltage_v: '1.8', temperature_c: '30', pressure_bar: '10', flow_slpm: '3', leak_ppm: '1' },
    { timestamp_s: '1', phase: 'steady', current_a: '5', voltage_v: '', temperature_c: '30', pressure_bar: '10', flow_slpm: '3', leak_ppm: '1' },
    { timestamp_s: '2', phase: 'steady', current_a: '5', voltage_v: '1.9', temperature_c: '30', pressure_bar: '10', flow_slpm: '3', leak_ppm: '1' }
  ];
  const result = analyzeRows(rows);
  assert.equal(result.metrics.steadySampleCount, 3);
  assert.equal(result.metrics.steadyVoltageMeanV, 1.85);
});

test('approved analysis blocks a one-row explicit steady phase instead of falling back to activity', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,phase,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,ramp,10,2,30,10,3,1',
    '1,steady,10,2,30,10,3,1',
    '2,ramp,10,2,30,10,3,1'
  ].join('\n')), { approvalStatus: 'approved' });
  assert.equal(result.metrics.steadySampleCount, 0);
  assert.match(result.metrics.steadyWindow, /缺少连续窗口/);
});

test('approved steady KPI requires one continuous session and honors steady aliases', () => {
  const rows = [
    { session_id: 'a', timestamp_s: '0', phase: 'steady_state', current_a: '1', voltage_v: '2', temperature_c: '30', pressure_bar: '10', flow_slpm: '3', leak_ppm: '1' },
    { session_id: 'b', timestamp_s: '0', phase: 'steady_state', current_a: '1', voltage_v: '2', temperature_c: '30', pressure_bar: '10', flow_slpm: '3', leak_ppm: '1' }
  ];
  const result = analyzeRows(rows, { approvalStatus: 'approved', phaseAliases: { steady: ['steady_state'] } });
  assert.equal(result.metrics.steadySampleCount, 0);
  assert.match(result.metrics.steadyWindow, /连续窗口/);
  const coverage = analyzeRows(rows, { requiredPhases: ['steady'], phaseAliases: { steady: ['steady_state'] }, requiredPhaseMetrics: { steady: ['durationS'] } }).phaseCoverage.required[0];
  assert.equal(coverage.validDataCoveragePct, 0);
});

test('surfaces a warning for any missing analytical numeric cell instead of allowing a silent clear result', () => {
  const rows = parseCSV([
    'timestamp_s,current_a,voltage_v,power_w,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,2,20,,10,6,1',
    '60,10,2,20,30,10,6,1'
  ].join('\n'));
  const result = analyzeRows(rows);
  assert.ok(result.issues.some((item) => item.code === 'DATA_GAP'));
  assert.equal(result.issues.find((item) => item.code === 'DATA_GAP').severity, 'warn');
});

test('AI draft defaults to local evidence mode and does not include raw rows', async () => {
  const result = analyzeRows(parseCSV(csv));
  const draft = await generateDraft(result, { endpoint: '' });
  assert.equal(draft.mode, 'local-evidence');
  assert.match(draft.draft, /结构化证据/);
  assert.equal('rows' in draft.evidence, false);
});

test('remote AI adapter receives structured evidence only', async () => {
  const result = analyzeRows(parseCSV(csv), { requiredMetadata: ['operator'], testMetadata: { operator: 'operator-secret-name' } });
  let request;
  const draft = await generateDraft(result, {
    endpoint: 'http://model.test/v1/chat/completions',
    apiKey: 'test-key',
    model: 'test-model',
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '基于证据的草稿：当前判定 FAIL，峰值压力 31.2 bar。' } }] }) };
    }
  });
  assert.equal(draft.mode, 'remote-llm');
  assert.match(draft.draft, /当前判定 FAIL/);
  const evidence = JSON.parse(request.messages[1].content);
  assert.equal('rows' in evidence, false);
  assert.equal('testMetadata' in evidence.thresholds, false);
  assert.equal(evidence.thresholds.metadataPresent.operator, true);
  assert.equal(request.messages[1].content.includes('operator-secret-name'), false);
});

test('versioned caller-supplied evidence is rebuilt and strips raw rows and secrets before drafting', () => {
  const evidence = evidenceBundle({ evidenceVersion: 'attacker-version', verdict: 'WARN', rows: [{ secret: 'do-not-forward' }], source: { csv: 'raw,csv', content: 'private' }, quality: { rowCount: 1 }, metrics: { completenessPct: 100 }, thresholds: { profileName: 'caller-profile' } });
  assert.equal(evidence.evidenceVersion, 'h2-testlens.v1');
  assert.equal('rows' in evidence, false);
  assert.equal(JSON.stringify(evidence).includes('do-not-forward'), false);
  assert.equal(JSON.stringify(evidence).includes('raw,csv'), false);
});

test('remote AI output fails closed when it conflicts with verdict or lacks evidence anchors', async () => {
  const result = analyzeRows(parseCSV(csv));
  assert.deepEqual(validateRemoteDraft('当前判定 PASS，峰值压力 31.2 bar。', result), { ok: false, reason: 'grounding_verdict_conflict' });
  assert.deepEqual(validateRemoteDraft('一段没有判定和指标的泛泛而谈。', result), { ok: false, reason: 'grounding_verdict_missing' });
  const fallback = await generateDraft(result, {
    endpoint: 'http://model.test/v1/chat/completions',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '当前判定 PASS，峰值压力 31.2 bar。' } }] }) })
  });
  assert.equal(fallback.mode, 'local-evidence');
  assert.equal(fallback.fallbackReason, 'grounding_verdict_conflict');
});

test('remote AI response is bounded before JSON parsing completes', async () => {
  const result = analyzeRows(parseCSV(csv));
  const fallback = await generateDraft(result, {
    endpoint: 'https://model.test/v1/chat/completions',
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => 'x'.repeat(1_000_001) })
  });
  assert.equal(fallback.mode, 'local-evidence');
  assert.equal(fallback.fallbackReason, 'upstream_response_too_large');
});

test('measured-only efficiency cannot be replaced by an approved formula record', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,2,30,10,6,1',
    '60,10,2,30,10,6,1'
  ].join('\n')), {
    approvalStatus: 'approved',
    efficiencyRequirement: { required: true, formulaRefRequired: true, dataSource: 'measured' },
    testMetadata: { formulaRefs: 'EFF-001', efficiencyRecord: { valuePct: 70, formulaRef: 'EFF-001', sourceRef: 'RESULT-001' } }
  });
  assert.equal(result.compliance.efficiency.ready, false);
  assert.ok(result.compliance.efficiency.missing.some((item) => item.includes('dataSource=measured')));
});

test('phase result readiness rejects null computed KPI values', () => {
  const readiness = phaseResultReadiness({
    phaseResultRequirements: [{ phase: 'steady', resultFields: ['energyConsumedWh'] }],
    testMetadata: { phaseResults: [{ phase: 'steady', status: 'pass', evidenceRef: 'PHASE-001' }] }
  }, { phases: { steady: { energyConsumedWh: null } } });
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.missingResultFields, ['steady.energyConsumedWh']);
});

test('maps Chinese headers and converts common engineering units', () => {
  const legacyRows = parseCSV([
    '时间(ms),工况,电流(mA),电压(mV),温度(°C),压力(kPa),流量(SLPM),泄漏(ppb)',
    '0,稳态,1000,1800,30,100,3,1000',
    '1000,稳态,1000,1800,31,100,3,1000'
  ].join('\n'));
  const result = analyzeRows(legacyRows);
  assert.deepEqual(result.schema.missingHeaders, []);
  assert.equal(result.schema.mappedCount, 8);
  assert.equal(result.rows[1].timestamp_s, 1);
  assert.equal(result.rows[0].current_a, 1);
  assert.equal(result.rows[0].voltage_v, 1.8);
  assert.equal(result.rows[0].pressure_bar, 1);
  assert.equal(result.rows[0].leak_ppm, 1);
  assert.equal(result.metrics.steadyWindow, 'phase=steady');
  assert.ok(Math.abs(result.metrics.pressureDriftBarPerMin) < 20);
  assert.ok(result.issues.some((item) => item.code === 'UNIT_CONVERTED'));
});

test('blocks generic flow without an explicit standard-state unit', () => {
  const result = analyzeRows([
    { timestamp_s: 0, phase: 'steady', current_a: 100, voltage_v: 10, temperature_c: 25, pressure_bar: 1, flow: 60, leak_ppm: 0 },
    { timestamp_s: 60, phase: 'steady', current_a: 100, voltage_v: 10, temperature_c: 25, pressure_bar: 1, flow: 60, leak_ppm: 0 }
  ]);
  assert.equal(result.schema.conversions.flow_slpm.mode, 'unsupported');
  assert.equal(result.rows[0].flow_slpm, null);
  assert.equal(result.metrics.hydrogenVolumeNl, null);
  assert.ok(result.issues.some((item) => item.code === 'UNIT_UNSUPPORTED'));
});

test('enterprise stack converts explicit mA/mV/W and timestamp units before KPI calculation', () => {
  const result = analyzeRows(parseCSV([
    '时间(ms),电堆电压(mV),电堆电流(mA),电堆功率(W),平均电压(mV),CELL1,CELL2',
    '0,1800,1000,1.8,700,0.69,0.71',
    '1000,1800,1000,1.8,700,0.69,0.71'
  ].join('\n')));
  assert.equal(result.datasetType, 'stack');
  assert.equal(result.rows[1].timestamp_s, 1);
  assert.equal(result.rows[0].current_a, 1);
  assert.equal(result.rows[0].voltage_v, 1.8);
  assert.ok(Math.abs(result.rows[0].power_w - 1.8) < 1e-12);
  assert.ok(Math.abs(result.metrics.peakPowerW - 1.8) < 1e-12);
  assert.equal(result.schema.conversions.power_w.label, 'W→W');
  assert.equal(result.issues.some((item) => item.code === 'UNIT_UNSUPPORTED'), false);
  assert.ok(publicAnalysis(result).metricTrace.metrics.peakPowerKw);
});

test('phase is optional and uses an explicit fallback window', () => {
  const rows = parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,1,1.8,30,10,3,1',
    '1,1,1.8,31,10,3,1'
  ].join('\n'));
  const result = analyzeRows(rows);
  assert.deepEqual(result.schema.missingHeaders, []);
  assert.deepEqual(result.schema.missingOptionalHeaders, ['phase', 'hydrogen_purity_pct', 'gas_temperature_c', 'gas_pressure_bar', 'ambient_temperature_c', 'ambient_humidity_pct', 'ambient_pressure_kpa', 'power_w', 'power_setpoint_w']);
  assert.match(result.metrics.steadyWindow, /活动窗口/);
  assert.ok(result.issues.some((item) => item.code === 'PHASE_OPTIONAL'));
});

test('describes generic setpoint response events without inventing a limit', () => {
  const rows = parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,power_w,power_setpoint_w',
    '0,1,1.8,30,10,3,1,0,0',
    '1,1,1.8,30,10,3,1,20,100',
    '2,1,1.8,30,10,3,1,95,100',
    '3,1,1.8,30,10,3,1,100,100',
    '4,1,1.8,30,10,3,1,80,50',
    '5,1,1.8,30,10,3,1,50,50'
  ].join('\n'));
  const result = analyzeRows(rows, {
    evaluationMode: 'descriptive_only',
    dynamicPowerAnalysis: { enabled: true, minimumStep: 10, responseBandPct: 5, minimumResponseBand: 5, settleWindowS: 0, maxGapS: 2 }
  });
  assert.equal(result.dynamicPower.status, 'calculated');
  assert.equal(result.dynamicPower.eventCount, 2);
  assert.equal(result.dynamicPower.events[0].direction, 'up');
  assert.equal(result.dynamicPower.events[0].responseTimeS, 1);
  assert.equal(result.dynamicPower.events[1].direction, 'down');
  assert.match(reportMarkdown(result, 'dynamic.csv'), /动态功率事件/);
});

test('does not treat a target power setpoint as a measured power channel', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,功率设定值',
    '0,10,2,30,10,6,1,100',
    '60,10,2,30,10,6,1,200'
  ].join('\n')));
  assert.equal(result.schema.mapping.power_w, undefined);
  assert.equal(result.schema.mapping.power_setpoint_w, '功率设定值');
  assert.ok(result.schema.missingOptionalHeaders.includes('power_w'));
  assert.equal(result.metrics.powerSource, 'derived_only');
  assert.equal(result.metrics.energyConsumedWh, 1 / 3);
  assert.equal(result.metrics.powerCrossCheck.rawPowerCount, 0);
});

test('compares current batch with baseline and identifies new/resolved risks', () => {
  const baseline = analyzeRows(parseCSV(baselineCsv));
  const current = analyzeRows(parseCSV(csv));
  const comparison = compareResults(baseline, current, { baselineName: 'baseline.csv', currentName: 'current.csv' });
  assert.equal(baseline.verdict, 'PASS');
  assert.equal(current.verdict, 'FAIL');
  assert.equal(comparison.verdictTransition, '通过（PASS） → 未通过（FAIL）');
  assert.equal(comparison.riskEscalated, true);
  assert.ok(comparison.newIssues.some((item) => item.code === 'PRESSURE_HIGH'));
  assert.ok(comparison.newIssues.some((item) => item.code === 'LEAK_HIGH'));
  assert.ok(comparison.changes.find((item) => item.field === 'peakPressureBar').delta > 0);
  assert.match(reportMarkdown(current, 'current.csv', { comparison }), /批次对比/);
});

test('maps gas and environmental measurements with common engineering units', () => {
  const result = analyzeRows(parseCSV([
    '时间(s),工况,电流(A),电压(V),温度(°F),压力(kPa),流量(Nm³/h),泄漏(ppb),氢气纯度(%),出口气体温度(°F),出口压力(kPa),环境温度(°F),环境湿度(%),环境压力(bar)',
    '0,稳态,1,1.8,86,200,0.06,1000,99.9,95,250,77,50,1.01325',
    '60,稳态,1,1.8,86,200,0.06,1000,99.9,95,250,77,50,1.01325'
  ].join('\n')));
  assert.equal(result.rows[0].flow_slpm, 1);
  assert.equal(result.rows[0].gas_pressure_bar, 2.5);
  assert.equal(result.rows[0].ambient_pressure_kpa, 101.325);
  assert.ok(Math.abs(result.rows[0].gas_temperature_c - 35) < 1e-9);
  assert.ok(Math.abs(result.rows[0].ambient_temperature_c - 25) < 1e-9);
  assert.equal(result.rows[0].hydrogen_purity_pct, 99.9);
  assert.ok(result.schema.mapping.gas_temperature_c);
  assert.ok(result.schema.mapping.ambient_humidity_pct);
  assert.ok(result.schema.conversions.flow_slpm.label.includes('Nm³/h'));
});

test('blocks actual volumetric flow units instead of treating them as standard flow', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,phase,current_a,voltage_v,temperature_c,pressure_bar,流量(L/min),leak_ppm',
    '0,steady,1,1.8,25,1,60,0',
    '60,steady,1,1.8,25,1,60,0'
  ].join('\n')));
  assert.equal(result.schema.conversions.flow_slpm.mode, 'unsupported');
  assert.equal(result.rows[0].flow_slpm, null);
  assert.equal(result.metrics.hydrogenVolumeNl, null);
  assert.ok(result.issues.some((item) => item.code === 'UNIT_UNSUPPORTED'));
  assert.match(result.issues.find((item) => item.code === 'UNIT_UNSUPPORTED').evidence, /L\/min/);
});

test('profile thresholds are carried into analysis and report provenance', () => {
  const profile = getProfile('fuel-cell-demo');
  const result = analyzeRows(parseCSV(csv), { ...profile.thresholds, profileId: profile.id, profileName: profile.name, profileSource: profile.source });
  assert.equal(result.config.profileId, 'fuel-cell-demo');
  assert.equal(result.config.maxLeakPpm, 5);
  assert.equal(result.config.profileName, '燃料电池 · 演示模板');
  assert.equal(result.verdict, 'FAIL');
  assert.equal(result.compliance.status, 'DEMO_ONLY');
  assert.match(reportMarkdown(result, 'profile.csv'), /燃料电池 · 演示模板/);
});

test('local history stores summaries without raw rows and supports clearing', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
  const result = analyzeRows(parseCSV(csv));
  const saved = appendHistory(storage, result, 'current.csv', '2026-08-21T00:00:00.000Z', [{ name: 'current.csv', rowCount: 25, hash: 'abc' }]);
  assert.equal(saved.length, 1);
  assert.equal('rows' in saved[0], false);
  assert.equal(readHistory(storage)[0].fileName, 'current.csv');
  assert.equal(readHistory(storage)[0].manifest[0].hash, 'abc');
  assert.deepEqual(clearHistory(storage), []);
  assert.deepEqual(readHistory(storage), []);
});

test('enterprise profile package validates, imports thresholds, and supplies field mapping', async () => {
  const payload = JSON.parse(await readFile(join(here, '../config/enterprise-profile.example.json'), 'utf8'));
  const imported = profilesFromPackage(payload);
  assert.equal(imported.ok, true);
  assert.equal(imported.organization, '示例企业（请替换）');
  assert.equal(imported.profiles[0].thresholds.maxPressureBar, 30);
  assert.equal(imported.fieldMapping.pressure_bar, '压力(kPa)');
  assert.deepEqual(imported.profiles[0].requiredMeasurements, ['flow_slpm', 'hydrogen_purity_pct']);
  assert.deepEqual(imported.profiles[0].supportedDatasetTypes, ['generic']);
  assert.deepEqual(imported.profiles[0].requiredPhases, []);
  assert.deepEqual(imported.profiles[0].acceptanceCriteria, {});
  const legacy = analyzeRows(parseCSV([
    '时间(ms),工况,电流(mA),电压(mV),温度(°C),压力(kPa),流量,泄漏(ppb)',
    '0,稳态,1000,1800,30,100,3,1000',
    '1000,稳态,1000,1800,31,100,3,1000'
  ].join('\n')), { ...imported.profiles[0].thresholds, fieldMapping: imported.fieldMapping, profileId: imported.profiles[0].id, profileName: imported.profiles[0].name, profileSource: imported.profiles[0].source, approvalStatus: imported.profiles[0].approvalStatus, standardRefs: imported.profiles[0].standardRefs, methodId: imported.profiles[0].methodId, revision: imported.profiles[0].revision, applicationScope: imported.profiles[0].applicationScope, requiredMetadata: imported.profiles[0].requiredMetadata });
  assert.equal(legacy.rows[1].timestamp_s, 1);
  assert.equal(legacy.config.profileName, '企业电解槽 · 示例配置');
  assert.equal(legacy.compliance.status, 'DEMO_ONLY');
  assert.equal(legacy.compliance.standardRefs.length, 3);
  assert.deepEqual(profilesFromPackage({ schemaVersion: 'wrong', profiles: [] }).ok, false);
  const invalid = profilesFromPackage({ schemaVersion: 'h2-testlens.profile.v1', organization: '', fieldMapping: { unknown_field: 'x', pressure_bar: 42 }, profiles: [{ id: 'bad id', name: '坏配置', thresholds: { maxTemperatureC: -1, maxPressureBar: 0, maxLeakPpm: 1, maxVoltageStdV: -1, maxPressureDriftBarPerMin: 0 } }] });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((error) => error.includes('profile id 非法')));
  assert.ok(invalid.errors.some((error) => error.includes('fieldMapping 含未知字段')));
  const invalidDatasetType = profilesFromPackage({ schemaVersion: 'h2-testlens.profile.v1', profiles: [{ id: 'dataset-profile', name: '数据集 profile', supportedDatasetTypes: ['unknown'], thresholds: { maxTemperatureC: 80, maxPressureBar: 30, maxLeakPpm: 10, maxVoltageStdV: 0.12, maxPressureDriftBarPerMin: 1.2 } }] });
  assert.equal(invalidDatasetType.ok, false);
  assert.ok(invalidDatasetType.errors.some((error) => error.includes('supportedDatasetTypes')));
  const invalidStructuredEvidence = profilesFromPackage({ schemaVersion: 'h2-testlens.profile.v1', profiles: [{ id: 'structured-profile', name: '结构化 profile', acquisitionRequirements: { requiredChannels: [{ field: 'unknown_channel', unit: 'A' }] }, preCheckRequirements: [{ id: 'duplicate', label: '一' }, { id: 'duplicate', label: '二' }], thresholds: { maxTemperatureC: 80, maxPressureBar: 30, maxLeakPpm: 10, maxVoltageStdV: 0.12, maxPressureDriftBarPerMin: 1.2 } }] });
  assert.equal(invalidStructuredEvidence.ok, false);
  assert.ok(invalidStructuredEvidence.errors.some((error) => error.includes('acquisitionRequirements.requiredChannels')));
  assert.ok(invalidStructuredEvidence.errors.some((error) => error.includes('preCheckRequirements id 重复')));
  const mismatchedInput = parseCSV([
    '时间(ms),工况,电流(mA),电压(mV),温度(°C),压力(kPa),流量,泄漏(ppb)',
    '0,稳态,1000,1800,30,100,3,1000',
    '1000,稳态,1000,1800,31,100,3,1000'
  ].join('\n'));
  const mismatched = analyzeRows(mismatchedInput, { fieldMapping: { pressure_bar: '企业压力专用列' } });
  assert.ok(mismatched.schema.mappingWarnings.some((warning) => warning.includes('pressure_bar')));
  assert.ok(mismatched.issues.some((item) => item.code === 'MAPPING_OVERRIDE_MISSING'));
});

test('built-in profiles keep unique phase-result evidence requirements', () => {
  for (const profile of DEVICE_PROFILES) {
    const phaseIds = (profile.phaseResultRequirements || []).map((item) => item.phase || item.id);
    assert.equal(new Set(phaseIds).size, phaseIds.length, `${profile.id} contains duplicate phase-result requirements`);
  }
});

test('public analysis removes raw rows before integration responses', () => {
  const result = analyzeRows(parseCSV(csv));
  const safe = publicAnalysis(result);
  assert.equal('rows' in safe, false);
  assert.equal(safe.verdict, 'FAIL');
  assert.equal(safe.metrics.sampleCount, 25);
  const withSensitiveMetadata = publicAnalysis(analyzeRows(parseCSV(csv), { testMetadata: { operator: 'operator-secret', calibrationRefs: 'cal-secret', rawDataRef: '/private/raw.csv' } }));
  assert.equal(withSensitiveMetadata.config.testMetadata.operator, true);
  assert.equal(withSensitiveMetadata.config.testMetadata.calibrationRefs, true);
  assert.equal(JSON.stringify(withSensitiveMetadata).includes('operator-secret'), false);
  assert.equal(reportMarkdown(withSensitiveMetadata, 'public.json').includes('operator-secret'), false);
  const datasetSafe = publicAnalysis({ rows: [], config: {}, datasetType: 'durability', dataset: { reports: [{ metadata: { 当前用户: 'secret-user' }, points: [{ targetPowerKw: 195 }] }], points: [{ targetPowerKw: 195, sourceFile: 'secret-file.csv' }] }, verdict: 'WARN', issues: [{ severity: 'warn', code: 'SECRET_TEST', title: '边界', evidence: 'secret-issue-evidence', recommendation: '复核' }], quality: {}, schema: {}, metrics: {}, phases: [], workflow: {}, compliance: {}, uncertainty: {}, narrative: '', source: {} });
  assert.equal(JSON.stringify(datasetSafe).includes('secret-user'), false);
  assert.equal(JSON.stringify(datasetSafe).includes('secret-issue-evidence'), false);
  assert.equal(JSON.stringify(datasetSafe).includes('secret-file.csv'), false);
  assert.equal(datasetSafe.dataset.reports[0].metadataPresent['当前用户'], true);
  const batchQualitySafe = publicAnalysis({ ...result, quality: { sessionDurationsS: [{ sourceFile: '/private/customer/run.csv', sessionId: 'file:/private/customer/run.csv', durationS: 1 }] } });
  assert.equal(batchQualitySafe.quality.sessionDurationsS[0].durationS, 1);
  assert.equal(JSON.stringify(batchQualitySafe).includes('/private/customer/run.csv'), false);
});

test('approved profiles fail closed on missing object traceability and manual edit audit evidence', () => {
  const base = {
    profileId: 'traceability-gate',
    profileName: 'Traceability gate',
    approvalStatus: 'approved',
    approvalEvidence: APPROVAL_EVIDENCE,
    standardRefs: [{ id: 'GB/T 45541-2025', title: 'PEM', uri: 'https://std.samr.gov.cn/gb/search/gbDetailed?id=31DA5F377BB68F08E06397BE0A0A4CFB' }],
    methodId: 'GB/T 45541-2025',
    revision: '2025',
    traceabilityRequirements: {
      required: true,
      requireEvidenceRef: true,
      fields: [
        { id: 'testRunId', label: '测试运行编号', valueType: 'reference' },
        { id: 'deviceId', label: '设备编号', valueType: 'reference' },
        { id: 'testType', label: '测试类型', valueType: 'text' },
        { id: 'testDate', label: '测试日期', valueType: 'date' },
        { id: 'cellCount', label: '片数', valueType: 'number' },
        { id: 'activeAreaCm2', label: '活性面积', valueType: 'number' }
      ]
    },
    editLogRequirements: { required: true, minEntries: 1, requireEvidenceRef: true }
  };
  const blocked = analyzeRows(parseCSV(baselineCsv), base);
  assert.equal(blocked.compliance.traceability.status, 'missing');
  assert.equal(blocked.compliance.editLog.status, 'missing');
  assert.equal(blocked.compliance.status, 'NOT_READY');
  assert.ok(blocked.issues.some((item) => item.code === 'TRACEABILITY_EVIDENCE_MISSING'));
  assert.ok(blocked.issues.some((item) => item.code === 'EDIT_LOG_EVIDENCE_MISSING'));
  assert.equal(blocked.releaseGate.checks.objectTraceability, false);
  assert.equal(blocked.releaseGate.checks.editLogEvidence, false);

  const ready = analyzeRows(parseCSV(baselineCsv), {
    ...base,
    testMetadata: {
      traceability: { testRunId: 'TR-2026-001', deviceId: 'PEM-001', testType: '性能测试', testDate: '2026-08-23', cellCount: 100, activeAreaCm2: 100, evidenceRef: 'TRACE-001' },
      editLog: [{ field: 'pressure_bar', oldValueSummary: '原始列值摘要', newValueSummary: '人工修正后摘要', operator: 'OPERATOR-SECRET', timestamp: '2026-08-23T12:00:00+08:00', reason: '校正单位定义', evidenceRef: 'EDIT-001' }]
    }
  });
  assert.equal(ready.compliance.traceability.status, 'ready');
  assert.equal(ready.compliance.editLog.status, 'ready');
  assert.equal(ready.compliance.traceability.observedFieldCount, 7);
  assert.equal(ready.compliance.editLog.validRecordCount, 1);
  const safe = publicAnalysis(ready);
  assert.equal(safe.config.traceabilityEvidence.ready, true);
  assert.equal(safe.config.editLogEvidence.validRecordCount, 1);
  assert.equal(JSON.stringify(safe).includes('OPERATOR-SECRET'), false);
  assert.equal(JSON.stringify(safe).includes('原始列值摘要'), false);
  assert.match(reportMarkdown(safe, 'public-traceability.json'), /测试对象追溯/);
  assert.equal(reportMarkdown(safe, 'public-traceability.json').includes('OPERATOR-SECRET'), false);
});

test('profile packages validate traceability and edit-log contracts without accepting unknown fields', () => {
  const profile = {
    id: 'traceability-package',
    name: 'Traceability package',
    traceabilityRequirements: { fields: [{ id: 'not_a_traceability_field', label: '坏字段', valueType: 'text' }] },
    editLogRequirements: { required: true, minEntries: -1 },
    thresholds: { maxTemperatureC: 80, maxPressureBar: 30, maxLeakPpm: 10, maxVoltageStdV: 0.12, maxPressureDriftBarPerMin: 1.2 }
  };
  const invalid = profilesFromPackage({ schemaVersion: 'h2-testlens.profile.v1', profiles: [profile] });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((error) => error.includes('traceabilityRequirements.fields')));
  assert.ok(invalid.errors.some((error) => error.includes('editLogRequirements.minEntries')));
});

test('approved profiles require bound approval evidence and public surfaces expose presence only', () => {
  const base = {
    profileId: 'approval-gate',
    profileName: 'Approval gate',
    approvalStatus: 'approved',
    standardRefs: [{ id: 'GB/T 45541-2025', title: 'PEM', uri: 'https://std.samr.gov.cn/example' }],
    methodId: 'GB/T 45541-2025',
    revision: '2025'
  };
  const blocked = analyzeRows(parseCSV(baselineCsv), base);
  assert.equal(blocked.compliance.approvalEvidence.status, 'missing');
  assert.ok(blocked.compliance.missingProfileFields.includes('approvalEvidence'));
  assert.ok(blocked.issues.some((item) => item.code === 'APPROVAL_EVIDENCE_MISSING'));
  const ready = analyzeRows(parseCSV(baselineCsv), { ...base, approvalEvidence: APPROVAL_EVIDENCE });
  assert.equal(ready.compliance.approvalEvidence.status, 'ready');
  const safe = publicAnalysis(ready);
  assert.equal(safe.compliance.approvalEvidence.approverPresent, true);
  assert.equal(safe.config.approvalEvidence.status, 'ready');
  assert.equal(JSON.stringify(safe).includes('QA-OWNER-001'), false);
  assert.equal(JSON.stringify(safe).includes('WO-2026-0822-001'), false);
});

test('runtime profile import binds standard method evidence to the compact ledger when required', async () => {
  const ledger = JSON.parse(await readFile(join(here, '../config/standard-evidence-ledger.v1.json'), 'utf8'));
  const bound = profilesFromPackage(enterpriseProfilePayload, { requireEvidenceLedger: true, evidenceRows: ledger.evidenceRows });
  assert.equal(bound.ok, true);
  assert.equal(bound.standardEvidenceBinding.ready, true);
  const unbound = profilesFromPackage(enterpriseProfilePayload, { requireEvidenceLedger: true, evidenceRows: [] });
  assert.equal(unbound.ok, false);
  assert.match(unbound.errors[0], /evidence ledger/);
});

test('profile packages reject approved profiles without approval evidence', () => {
  const profile = {
    id: 'approved-package',
    name: 'Approved package',
    approvalStatus: 'approved',
    methodId: 'GB/T 45541-2025',
    revision: '2025',
    thresholds: { maxTemperatureC: 80, maxPressureBar: 30, maxLeakPpm: 10, maxVoltageStdV: 0.12, maxPressureDriftBarPerMin: 1.2 }
  };
  const invalid = profilesFromPackage({ schemaVersion: 'h2-testlens.profile.v1', profiles: [profile] });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((error) => error.includes('approvalEvidence')));
  const valid = profilesFromPackage({ schemaVersion: 'h2-testlens.profile.v1', profiles: [{ ...profile, approvalEvidence: APPROVAL_EVIDENCE }] });
  assert.equal(valid.ok, true);
});

test('approved standard profiles require traceable standard-reference provenance', () => {
  const base = {
    id: 'standard-provenance-package',
    name: 'Standard provenance package',
    approvalStatus: 'approved',
    approvalEvidence: APPROVAL_EVIDENCE,
    standardRefs: [{ id: 'GB/T 45541-2025', title: 'PEM', uri: 'https://std.samr.gov.cn/gb/search/gbDetailed?id=31DA5F377BB68F08E06397BE0A0A4CFB' }],
    methodId: 'GB/T 45541-2025',
    revision: '2025',
    thresholds: { maxTemperatureC: 80, maxPressureBar: 30, maxLeakPpm: 10, maxVoltageStdV: 0.12, maxPressureDriftBarPerMin: 1.2 }
  };
  const invalid = profilesFromPackage({ schemaVersion: 'h2-testlens.profile.v1', profiles: [base] });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((error) => error.includes('standardReferenceEvidence')));

  const valid = profilesFromPackage({ schemaVersion: 'h2-testlens.profile.v1', profiles: [{
    ...base,
    methodExecutionStatus: 'PUBLIC_SCOPE_MAPPING',
    status: 'current',
    publicationDate: '2025-03-28',
    effectiveDate: '2025-07-01',
    scopeEvidence: 'official scope locator',
    workflowEvidence: 'official workflow locator',
    methodSource: { sourceId: 'official-source', locator: 'official page', evidenceType: 'official_page' },
    standardRefs: [{ ...base.standardRefs[0], status: 'current' }]
  }] });
  assert.equal(valid.ok, true);
  assert.equal(valid.profiles[0].standardReferenceEvidence.status, 'ready');
});

test('FULL_METHOD_IMPLEMENTED fails closed without complete method implementation evidence', () => {
  const profile = {
    profileId: 'full-without-method-evidence',
    profileName: 'Full without method evidence',
    approvalStatus: 'approved',
    approvalEvidence: APPROVAL_EVIDENCE,
    standardRefs: [{ id: 'GB/T 45541-2025', title: 'PEM', uri: 'https://std.samr.gov.cn/example' }],
    methodId: 'GB/T 45541-2025',
    revision: '2025',
    methodExecutionStatus: 'FULL_METHOD_IMPLEMENTED',
    requiredMetadata: [],
    instrumentRequirements: [],
    reportRequirements: [],
    acceptanceRules: []
  };
  const result = analyzeRows(parseCSV(baselineCsv), profile);
  assert.equal(result.compliance.methodImplementationEvidence.status, 'missing');
  assert.equal(result.compliance.status, 'NOT_READY');
  assert.ok(result.compliance.missingProfileFields.includes('methodImplementationEvidence'));
  assert.ok(result.issues.some((item) => item.code === 'METHOD_IMPLEMENTATION_EVIDENCE_MISSING'));
  assert.equal(result.releaseGate.status, 'ANALYSIS_DRAFT');
  const packageResult = profilesFromPackage({ schemaVersion: 'h2-testlens.profile.v1', profiles: [{ id: 'full-package', name: 'Full package', ...profile, thresholds: { maxTemperatureC: 80, maxPressureBar: 30, maxLeakPpm: 10, maxVoltageStdV: 0.12, maxPressureDriftBarPerMin: 1.2 } }] });
  assert.equal(packageResult.ok, false);
  assert.ok(packageResult.errors.some((error) => error.includes('methodImplementationEvidence')));
});

test('standard FULL_METHOD_IMPLEMENTED cannot bypass uncertainty and instrument prerequisites', () => {
  const profile = {
    profileId: 'full-without-method-prerequisites',
    profileName: 'Full without method prerequisites',
    approvalStatus: 'approved',
    approvalEvidence: APPROVAL_EVIDENCE,
    standardRefs: [{ id: 'GB/T 45541-2025', title: 'PEM', uri: 'https://std.samr.gov.cn/example', status: 'current' }],
    methodId: 'GB/T 45541-2025',
    revision: '2025',
    methodExecutionStatus: 'FULL_METHOD_IMPLEMENTED',
    methodImplementationEvidence: methodEvidenceFor(),
    instrumentRequirements: ['electrical_input'],
    reportRequirements: ['testPurpose', 'charts', 'conclusion'],
    acceptanceRules: [{ metric: 'specificEnergyKWhPerNm3', operator: '<=', value: 1e9, sourceRef: 'approved-test-rule-1' }]
  };
  const result = analyzeRows(parseCSV(baselineCsv), profile);
  assert.equal(result.compliance.status, 'NOT_READY');
  assert.equal(result.compliance.fullMethodProfile.status, 'missing');
  assert.ok(result.compliance.missingProfileFields.includes('uncertaintyModelRequired=true'));
  assert.ok(result.releaseGate.blockedReasons.includes('fullMethodProfileEvidence'));
  assert.equal(result.releaseGate.status, 'ANALYSIS_DRAFT');
  const packageResult = profilesFromPackage({ schemaVersion: 'h2-testlens.profile.v1', profiles: [{ id: 'full-package-prerequisites', name: 'Full package prerequisites', ...profile, thresholds: { maxTemperatureC: 80, maxPressureBar: 30, maxLeakPpm: 10, maxVoltageStdV: 0.12, maxPressureDriftBarPerMin: 1.2 } }] });
  assert.equal(packageResult.ok, false);
  assert.ok(packageResult.errors.some((error) => error.includes('fullMethodProfileEvidence')));
});

test('standards gate distinguishes demo, incomplete, and human-review-ready profiles', () => {
  const base = {
    profileId: 'approved-example',
    profileName: 'Approved example',
    profileSource: 'enterprise method register',
    approvalStatus: 'approved',
    approvalEvidence: APPROVAL_EVIDENCE,
    standardRefs: [{ id: 'GB/T 45541-2025', title: 'PEM', uri: 'https://std.samr.gov.cn/example' }],
    methodId: 'GB/T 45541-2025',
    revision: '2025',
    methodExecutionStatus: 'FULL_METHOD_IMPLEMENTED',
    methodImplementationEvidence: methodEvidenceFor(),
    uncertaintyModelRequired: true,
    uncertaintyModel: FULL_METHOD_UNCERTAINTY_MODEL,
    applicationScope: 'PEM electrolyzer performance test',
    requiredMetadata: ['testPurpose', 'instrumentIds', 'calibrationRefs', 'operator', 'formulaRefs', 'signoff'],
    scopeRules: { requiresDeviceFamily: true, requiresRatedHydrogenPressureMpa: true, maxRatedHydrogenPressureMpa: 10, requiresRatedHydrogenProductionM3h: true, minRatedHydrogenProductionM3h: 1, maxRatedHydrogenProductionM3h: 500 },
    instrumentRequirements: ['electrical_input'],
    reportRequirements: ['testPurpose', 'charts', 'conclusion'],
    acceptanceRules: [{ metric: 'specificEnergyKWhPerNm3', operator: '<=', value: 1e9, sourceRef: 'approved-test-rule-1' }]
  };
  const incomplete = analyzeRows(parseCSV(csv), base);
  assert.equal(incomplete.compliance.status, 'NOT_READY');
  const ready = analyzeRows(parseCSV(csv), { ...base, testMetadata: { testPurpose: 'performance', instrumentIds: 'I-1', calibrationRefs: 'C-1', operator: 'operator/qualification', formulaRefs: 'method equation v1', signoff: 'reviewer/2026-08-21', deviceFamily: 'PEM electrolyzer', ratedHydrogenPressureMpa: 5, ratedHydrogenProductionM3h: 10, instrumentRecords: [{ id: 'I-1', category: 'electrical_input', accuracy: '0.2%FS', calibrationRef: 'C-1' }] } });
  assert.equal(ready.compliance.status, 'READY_FOR_HUMAN_REVIEW');
  assert.equal(ready.compliance.missingMetadata.length, 0);
  assert.equal(ready.workflow.status, 'REVIEW_REQUIRED');
  assert.ok(ready.workflow.steps.some((step) => step.id === 'signoff' && step.status === 'ready'));
  assert.equal(ready.releaseGate.status, 'ANALYSIS_DRAFT');
});

test('approved profile plus complete provenance can reach human review readiness on a passing run', () => {
  const profile = {
    profileId: 'approved-example',
    profileName: 'Approved example',
    profileSource: 'enterprise method register',
    approvalStatus: 'approved',
    approvalEvidence: APPROVAL_EVIDENCE,
    standardRefs: [{ id: 'GB/T 45541-2025', title: 'PEM', uri: 'https://std.samr.gov.cn/example' }],
    methodId: 'GB/T 45541-2025',
    revision: '2025',
    methodExecutionStatus: 'FULL_METHOD_IMPLEMENTED',
    methodImplementationEvidence: methodEvidenceFor(),
    uncertaintyModelRequired: true,
    uncertaintyModel: FULL_METHOD_UNCERTAINTY_MODEL,
    applicationScope: 'PEM electrolyzer performance test',
    requiredMetadata: ['testPurpose', 'testPlanRef', 'acquisitionPlan', 'preCheckRecord', 'instrumentIds', 'calibrationRefs', 'environment', 'operator', 'formulaRefs', 'uncertaintyPolicy', 'rawDataRef', 'signoff'],
    scopeRules: { requiresDeviceFamily: true, requiresRatedHydrogenPressureMpa: true, maxRatedHydrogenPressureMpa: 10, requiresRatedHydrogenProductionM3h: true, minRatedHydrogenProductionM3h: 1, maxRatedHydrogenProductionM3h: 500 },
    instrumentRequirements: ['electrical_input'],
    reportRequirements: ['testPurpose', 'charts', 'conclusion'],
    acceptanceRules: [{ metric: 'specificEnergyKWhPerNm3', operator: '<=', value: 1e9, sourceRef: 'approved-test-rule-1' }],
    testMetadata: { ...Object.fromEntries(['testPurpose', 'testPlanRef', 'acquisitionPlan', 'preCheckRecord', 'instrumentIds', 'calibrationRefs', 'environment', 'operator', 'formulaRefs', 'uncertaintyPolicy', 'rawDataRef', 'signoff'].map((field) => [field, `${field}-value`])), deviceFamily: 'PEM electrolyzer', ratedHydrogenPressureMpa: 5, ratedHydrogenProductionM3h: 10, instrumentRecords: [{ id: 'I-1', category: 'electrical_input', accuracy: '0.2%FS', calibrationRef: 'C-1' }] }
  };
  const result = analyzeRows(parseCSV(baselineCsv), profile);
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.compliance.status, 'READY_FOR_HUMAN_REVIEW');
  assert.equal(result.workflow.status, 'READY_FOR_HUMAN_REVIEW');
  assert.equal(result.workflow.steps.every((step) => step.status === 'ready'), true);
  assert.equal(result.releaseGate.status, 'HUMAN_REVIEW_PACKAGE');
  assert.equal(result.releaseGate.ready, true);
  const safe = publicAnalysis(result);
  assert.equal(safe.compliance.methodImplementationEvidence.coverageItemCount, 1);
  assert.equal(safe.compliance.methodImplementationEvidence.openGapCount, 0);
  assert.equal(JSON.stringify(safe).includes('METHOD-VERIFIER-001'), false);
});

test('required performance measurements fail closed when purity is absent', () => {
  const result = analyzeRows(parseCSV(baselineCsv), {
    profileId: 'approved-example',
    profileName: 'Approved example',
    approvalStatus: 'approved',
    standardRefs: [{ id: 'GB/T 45541-2025', title: 'PEM', uri: 'https://std.samr.gov.cn/example' }],
    methodId: 'GB/T 45541-2025',
    revision: '2025',
    requiredMeasurements: ['flow_slpm', 'hydrogen_purity_pct']
  });
  assert.equal(result.compliance.status, 'NOT_READY');
  assert.deepEqual(result.compliance.missingMeasurements, ['hydrogen_purity_pct']);
  assert.ok(result.issues.some((item) => item.code === 'PERFORMANCE_FIELD_MISSING'));
});

test('power fluctuation profile requires every publicly declared output and environment measurement', () => {
  const profile = getProfile('electrolyzer-power-fluctuation-demo');
  const rows = parseCSV([
    'timestamp_s,phase,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct',
    '0,steady,1,2,30,10,3,1,99.9',
    '1,steady,1,2,30,10,3,1,99.9'
  ].join('\n'));
  const result = analyzeRows(rows, { ...profile, profileId: profile.id });
  assert.deepEqual(result.compliance.missingMeasurements, [
    'gas_temperature_c',
    'gas_pressure_bar',
    'ambient_temperature_c',
    'ambient_humidity_pct',
    'ambient_pressure_kpa',
    'power_w'
  ]);
  assert.equal(result.compliance.status, 'DEMO_ONLY');
  assert.ok(result.issues.some((item) => item.code === 'PERFORMANCE_FIELD_MISSING'));
});

test('approved power-fluctuation profile blocks without an original power channel', () => {
  const profile = getProfile('electrolyzer-power-fluctuation-demo');
  const result = analyzeRows(parseCSV([
    'timestamp_s,phase,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct,gas_temperature_c,gas_pressure_bar,ambient_temperature_c,ambient_humidity_pct,ambient_pressure_kpa',
    '0,steady,1,2,30,10,3,1,99.9,40,10,25,50,101',
    '1,steady,1,2,30,10,3,1,99.9,40,10,25,50,101'
  ].join('\n')), { ...profile, profileId: profile.id, approvalStatus: 'approved' });
  assert.equal(result.compliance.status, 'NOT_READY');
  assert.ok(result.compliance.missingMeasurements.includes('power_w'));
  assert.ok(result.issues.some((item) => item.code === 'PERFORMANCE_FIELD_MISSING'));
});

test('required test phases fail closed when the input run does not cover them', () => {
  const result = analyzeRows(parseCSV(baselineCsv), {
    profileId: 'approved-example',
    profileName: 'Approved example',
    approvalStatus: 'approved',
    standardRefs: [{ id: 'GB/T 46104-2025', title: 'Power fluctuation', uri: 'https://std.samr.gov.cn/example' }],
    methodId: 'GB/T 46104-2025',
    revision: '2025',
    requiredPhases: ['dynamic']
  });
  assert.equal(result.compliance.status, 'NOT_READY');
  assert.deepEqual(result.compliance.missingPhases, ['dynamic']);
  assert.ok(result.issues.some((item) => item.code === 'PHASE_COVERAGE_MISSING'));
});

test('maps the official power-fluctuation workflow phase aliases and reaches a review package only with structured evidence', () => {
  const profile = getProfile('electrolyzer-power-fluctuation-demo');
  const rows = parseCSV([
    'timestamp_s,phase,current_a,voltage_v,power_w,temperature_c,pressure_bar,flow_slpm,leak_ppm,hydrogen_purity_pct,gas_temperature_c,gas_pressure_bar,ambient_temperature_c,ambient_humidity_pct,ambient_pressure_kpa',
    '0,冷启动,1,1.8,1.8,30,10,3,1,99.9,40,10,25,50,101',
    '1,冷启动,1,1.8,1.8,30,10,3,1,99.9,40,10,25,50,101',
    '2,热启动,1,1.8,1.8,30,10,3,1,99.9,40,10,25,50,101',
    '3,热启动,1,1.8,1.8,30,10,3,1,99.9,40,10,25,50,101',
    '4,稳态,1,1.8,1.8,30,10,3,1,99.9,40,10,25,50,101',
    '5,稳态,1,1.8,1.8,30,10,3,1,99.9,40,10,25,50,101',
    '6,动态,2,1.9,3.8,31,10,3.2,1,99.9,41,10.2,25,50,101',
    '7,动态,2,1.9,3.8,31,10,3.2,1,99.9,41,10.2,25,50,101',
    '8,停机,0,0,0,30,10,0,1,99.9,40,10,25,50,101',
    '9,停机,0,0,0,30,10,0,1,99.9,40,10,25,50,101'
  ].join('\n'));
  const result = analyzeRows(rows, {
    ...profile,
    profileId: profile.id,
    approvalStatus: 'approved',
    approvalEvidence: APPROVAL_EVIDENCE,
    methodExecutionStatus: 'FULL_METHOD_IMPLEMENTED',
    methodImplementationEvidence: methodEvidenceFor(profile.methodId, profile.revision),
    standardEvidenceBinding: { ready: true, status: 'ready', matchedEvidenceIds: ['ev_gbt46104_scope'] },
    uncertaintyModelRequired: true,
    uncertaintyModel: FULL_METHOD_UNCERTAINTY_MODEL,
    acceptanceRules: [{ metric: 'specificEnergyKWhPerNm3', operator: '<=', value: 1e9, sourceRef: 'enterprise-acceptance-001' }],
    testMetadata: {
      testPurpose: '功率波动适应性测试', testPlanRef: 'TP-001', acquisitionPlan: '采样计划-001', acquisitionRecord: { samplingFrequencyHz: 1, synchronization: { status: 'verified', clockReference: 'DAQ-CLK-01' }, channels: [
        { field: 'timestamp_s', channelId: 'CH-T', unit: 's' }, { field: 'current_a', channelId: 'CH-I', unit: 'A' }, { field: 'voltage_v', channelId: 'CH-U', unit: 'V' }, { field: 'power_w', channelId: 'CH-PW', unit: 'W' }, { field: 'flow_slpm', channelId: 'CH-F', unit: 'SLPM' }, { field: 'hydrogen_purity_pct', channelId: 'CH-P', unit: '%' }, { field: 'gas_temperature_c', channelId: 'CH-GT', unit: '°C' }, { field: 'gas_pressure_bar', channelId: 'CH-GP', unit: 'bar' }, { field: 'ambient_temperature_c', channelId: 'CH-AT', unit: '°C' }, { field: 'ambient_humidity_pct', channelId: 'CH-AH', unit: '%' }, { field: 'ambient_pressure_kpa', channelId: 'CH-AP', unit: 'kPa' }
      ], evidenceRef: 'ACQ-001' }, preCheckRecord: '前检查-001', preCheckItems: [
        { id: 'device_identity', status: 'pass', evidenceRef: 'PC-001' }, { id: 'test_bench', status: 'pass', evidenceRef: 'PC-002' }, { id: 'instruments', status: 'pass', evidenceRef: 'PC-003' }, { id: 'safety', status: 'pass', evidenceRef: 'PC-004' }
      ], testStages: [
        { id: 'test_plan', status: 'complete', evidenceRef: 'TP-001' },
        { id: 'data_acquisition', status: 'complete', evidenceRef: 'ACQ-001' },
        { id: 'pre_check', status: 'complete', evidenceRef: 'PC-001' },
        { id: 'test_execution', status: 'complete', evidenceRef: 'RUN-001' },
        { id: 'test_report', status: 'complete', evidenceRef: 'RPT-001' }
      ], testSystemEvidence: [
        { id: 'power_supply', status: 'pass', evidenceRef: 'SYS-PS-001' }, { id: 'electrolyzer', status: 'pass', evidenceRef: 'SYS-EL-001' }, { id: 'gas_liquid_separation', status: 'pass', evidenceRef: 'SYS-GL-001' }, { id: 'circulation', status: 'pass', evidenceRef: 'SYS-CI-001' }, { id: 'thermal_management', status: 'pass', evidenceRef: 'SYS-TM-001' }, { id: 'control_system', status: 'pass', evidenceRef: 'SYS-CT-001' }
      ], testConditions: { testSite: '台架A', systemConfigurationRef: 'CFG-001', abnormalDispositionRef: 'ABN-001', evidenceRef: 'COND-001' }, environmentConditions: { ambientTemperatureC: 25, ambientHumidityPct: 50, ambientPressureKpa: 101, evidenceRef: 'ENV-001' }, measurementMethodRecords: [
        { id: 'electrical_input', methodRef: 'METHOD-E-001', evidenceRef: 'MEAS-E-001', fields: ['current_a', 'voltage_v', 'power_w'] },
        { id: 'gas_output', methodRef: 'METHOD-G-001', evidenceRef: 'MEAS-G-001', fields: ['flow_slpm', 'hydrogen_purity_pct', 'gas_temperature_c', 'gas_pressure_bar'] },
        { id: 'environment', methodRef: 'METHOD-A-001', evidenceRef: 'MEAS-A-001', fields: ['ambient_temperature_c', 'ambient_humidity_pct', 'ambient_pressure_kpa'] },
        { id: 'high_frequency_acquisition', methodRef: 'METHOD-H-001', evidenceRef: 'MEAS-H-001', fields: ['timestamp_s', 'current_a', 'voltage_v', 'power_w'] }
      ], efficiencyRecord: { valuePct: 72, formulaRef: 'EFF-FORMULA-001', sourceRef: 'EFF-001' }, phaseResults: [
        { phase: 'cold_start', status: 'complete', evidenceRef: 'RES-CS-001' }, { phase: 'hot_start', status: 'complete', evidenceRef: 'RES-HS-001' }, { phase: 'steady', status: 'complete', evidenceRef: 'RES-ST-001' }, { phase: 'dynamic', status: 'complete', evidenceRef: 'RES-DY-001' }, { phase: 'shutdown', status: 'complete', evidenceRef: 'RES-SD-001' }
      ], instrumentIds: 'I-001', instrumentAccuracy: '精度-001', calibrationRefs: 'CAL-001', environment: '25C', operator: 'operator', operatorQualification: 'qualification-001', formulaRefs: 'method-equation-001', uncertaintyPolicy: 'policy-001', rawDataRef: 'SHA-256:abc', signoff: 'reviewer/2026-08-21', deviceFamily: 'PEM electrolyzer', instrumentRecords: [
        { id: 'E-1', category: 'electrical_input', accuracy: '0.2%FS', calibrationRef: 'CAL-E' },
        { id: 'H-1', category: 'high_frequency_acquisition', accuracy: '0.1%FS', calibrationRef: 'CAL-H' },
        { id: 'G-1', category: 'gas_output', accuracy: '0.5%FS', calibrationRef: 'CAL-G' },
        { id: 'A-1', category: 'environment', accuracy: '0.5C', calibrationRef: 'CAL-A' }
      ]
    }
  });
  assert.deepEqual(result.compliance.missingPhases, []);
  assert.deepEqual(result.phaseCoverage.missing, []);
  assert.deepEqual(result.compliance.missingPhaseMetrics, []);
  assert.equal(result.phaseMetrics.phases.dynamic.powerRangeW, 0);
  assert.equal(result.phaseMetrics.phases.steady.specificEnergyKWhPerNm3, 0.01);
  assert.equal(result.metrics.powerSource, 'checked');
  assert.equal(result.compliance.acquisition.status, 'ready');
  assert.equal(result.compliance.preCheck.status, 'ready');
  assert.ok(result.workflow.steps.some((step) => step.id === 'acquisition' && step.status === 'ready'));
  assert.ok(result.workflow.steps.some((step) => step.id === 'pre-check' && step.status === 'ready'));
  assert.equal(result.compliance.status, 'READY_FOR_HUMAN_REVIEW');
  assert.equal(result.releaseGate.status, 'HUMAN_REVIEW_PACKAGE');
  assert.equal(result.releaseGate.ready, true);
});

test('standard references with complete evidence remain a standard evidence package unless full execution is explicitly declared', () => {
  const result = analyzeRows(parseCSV(baselineCsv), {
    profileId: 'public-mapping', profileName: 'Public mapping', approvalStatus: 'approved', approvalEvidence: APPROVAL_EVIDENCE,
    standardRefs: [{ id: 'GB/T 45541-2025', title: 'PEM', uri: 'https://std.samr.gov.cn/example' }],
    methodId: 'GB/T 45541-2025', revision: '2025',
    methodExecutionStatus: 'PUBLIC_SCOPE_MAPPING',
    scopeRules: { requiresDeviceFamily: true }, instrumentRequirements: ['electrical_input'],
    reportRequirements: ['testPurpose', 'charts', 'conclusion'],
    acceptanceRules: [{ metric: 'specificEnergyKWhPerNm3', operator: '<=', value: 1e9, sourceRef: 'enterprise-rule-1' }],
    requiredMetadata: ['testPurpose', 'instrumentIds', 'operator', 'formulaRefs', 'signoff'],
    testMetadata: { testPurpose: 'mapping', instrumentIds: 'I-1', operator: 'operator', formulaRefs: 'formula-1', signoff: 'reviewer', deviceFamily: 'PEM', instrumentRecords: [{ id: 'I-1', category: 'electrical_input', accuracy: '0.2%FS', calibrationRef: 'CAL-1' }] }
  });
  assert.equal(result.compliance.methodExecutionStatus, 'PUBLIC_SCOPE_MAPPING');
  assert.equal(result.releaseGate.status, 'STANDARD_EVIDENCE_PACKAGE');
  assert.equal(result.releaseGate.ready, true);
});

test('formal standard profiles fail closed when runtime standard evidence binding is absent', () => {
  const result = analyzeRows(parseCSV(baselineCsv), {
    profileId: 'missing-runtime-ledger',
    approvalStatus: 'approved',
    approvalEvidence: APPROVAL_EVIDENCE,
    standardRefs: [{ id: 'GB/T 45541-2025', title: 'PEM', uri: 'https://std.samr.gov.cn/gb/search/gbDetailed?id=31DA5F377BB68F08E06397BE0A0A4CFB', status: 'current' }],
    methodId: 'GB/T 45541-2025',
    revision: '2025',
    methodSource: { sourceId: 'gbt_45541_2025', locator: 'standard detail page: title/status/basic information', evidenceType: 'official_registry_fact', evidenceIds: ['ev_gbt45541_test_method'] },
    thresholds: { maxTemperatureC: 80, maxPressureBar: 30, maxLeakPpm: 10, maxVoltageStdV: 0.12, maxPressureDriftBarPerMin: 1.2 }
  });
  assert.equal(result.compliance.standardEvidenceBinding.ready, false);
  assert.equal(result.compliance.status, 'NOT_READY');
});

test('profile data quality gates expose actual sampling intervals and block a configured gap', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,phase',
    '0,1,2,30,10,3,1,steady',
    '1,1,2,30,10,3,1,steady',
    '4,1,2,30,10,3,1,steady'
  ].join('\n')), {
    approvalStatus: 'approved',
    dataQualityRequirements: { requireMonotonicTimestamps: true, requireUniqueTimestamps: true, requirePositiveIntervals: true, maxIntervalS: 2 },
    testMetadata: { acquisitionRecord: { samplingFrequencyHz: 1 } }
  });
  assert.equal(result.quality.medianIntervalS, 2);
  assert.equal(result.quality.maximumIntervalS, 3);
  assert.equal(result.quality.samplingGapCount, 1);
  assert.equal(result.metrics.integrationEvidence.maxIntervalS, 2);
  assert.equal(result.metrics.integrationEvidence.hydrogenVolume.skippedGapCount, 1);
  assert.equal(result.metrics.integrationEvidence.energyConsumed.skippedGapCount, 1);
  assert.equal(result.metrics.hydrogenVolumeNl, 3 / 60);
  assert.equal(result.metrics.energyConsumedWh, 1 / 1800);
  assert.equal(publicAnalysis(result).metrics.integrationEvidence.energyConsumed.skippedGapCount, 1);
  assert.equal(result.compliance.dataQuality.status, 'failed');
  assert.ok(result.issues.some((item) => item.code === 'DATA_QUALITY_GATE'));
  assert.equal(result.workflow.status, 'NOT_READY');
});

test('phase metrics do not integrate across a configured sampling gap', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,phase',
    '0,1,2,30,10,3,1,steady',
    '1,1,2,30,10,3,1,steady',
    '4,1,2,30,10,3,1,steady'
  ].join('\n')), {
    requiredPhases: ['steady'],
    requiredPhaseMetrics: { steady: ['durationS', 'energyConsumedWh', 'hydrogenVolumeNl'] },
    dataQualityRequirements: { maxIntervalS: 2 }
  });
  const phase = result.phaseMetrics.phases.steady;
  assert.equal(phase.durationS, 1);
  assert.equal(phase.energyConsumedWh, null);
  assert.equal(phase.hydrogenVolumeNl, null);
  assert.equal(phase.integrationStatus, 'partial_gap');
  assert.equal(phase.skippedGapCount, 1);
  assert.equal(phase.interruptedSegmentCount, 1);
  assert.deepEqual(result.compliance.missingPhaseMetrics, ['steady.energyConsumedWh', 'steady.hydrogenVolumeNl']);
  assert.match(reportMarkdown(result, 'phase-gap.csv'), /积分状态 partial_gap/);
  assert.equal(result.phaseCoverage.required[0].validDataCoveragePct, 25);
});

test('phase energy remains independently calculable when flow is absent', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,leak_ppm,phase',
    '0,1,2,30,10,1,steady',
    '1,1,2,30,10,1,steady'
  ].join('\n')), {
    requiredPhases: ['steady'],
    requiredPhaseMetrics: { steady: ['energyConsumedWh'] }
  });
  const phase = result.phaseMetrics.phases.steady;
  assert.equal(phase.energyConsumedWh, 1 / 1800);
  assert.equal(phase.hydrogenVolumeNl, null);
  assert.equal(phase.integrationStatus, 'partial_input');
  assert.deepEqual(result.compliance.missingPhaseMetrics, []);
});

test('phase evidence reports interrupted segments and valid coverage without inventing a minimum', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,phase,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,steady,1,2,30,10,3,1',
    '1,other,1,2,30,10,3,1',
    '2,steady,1,2,30,10,3,1'
  ].join('\n')), { requiredPhases: ['steady'], requiredPhaseMetrics: { steady: ['durationS'] } });
  assert.equal(result.phaseCoverage.required[0].interruptedSegmentCount, 1);
  assert.equal(result.phaseCoverage.required[0].validDataCoveragePct, 0);
  assert.equal(result.phaseMetrics.phases.steady.interruptedSegmentCount, 1);
  assert.equal(result.compliance.dataQuality.status, 'not_configured');
});

test('keeps generic multi-file sessions separate for quality, phase summaries, and integration', () => {
  const result = analyzeRows([
    { session_id: 'file:a.csv', source_file: 'a.csv', timestamp_s: '0', phase: 'steady', current_a: '1', voltage_v: '2', temperature_c: '30', pressure_bar: '10', flow_slpm: '3', leak_ppm: '1' },
    { session_id: 'file:a.csv', source_file: 'a.csv', timestamp_s: '1', phase: 'steady', current_a: '1', voltage_v: '2', temperature_c: '30', pressure_bar: '11', flow_slpm: '3', leak_ppm: '1' },
    { session_id: 'file:b.csv', source_file: 'b.csv', timestamp_s: '0', phase: 'steady', current_a: '1', voltage_v: '2', temperature_c: '30', pressure_bar: '20', flow_slpm: '3', leak_ppm: '1' },
    { session_id: 'file:b.csv', source_file: 'b.csv', timestamp_s: '1', phase: 'steady', current_a: '1', voltage_v: '2', temperature_c: '30', pressure_bar: '18', flow_slpm: '3', leak_ppm: '1' }
  ]);
  assert.equal(result.quality.duplicateTimestampCount, 0);
  assert.equal(result.quality.nonMonotonicCount, 0);
  assert.equal(result.quality.observedIntervalCount, 2);
  assert.equal(result.metrics.energyConsumedWh, 1 / 900);
  assert.equal(result.metrics.hydrogenVolumeNl, 6 / 60);
  assert.equal(result.metrics.sessionCount, 2);
  assert.equal(result.metrics.durationS, 2);
  assert.equal(result.metrics.integrationEvidence.energyConsumed.skippedSessionBoundaryCount, 1);
  assert.equal(result.metrics.pressureDriftBarPerMin, -30);
  assert.equal(result.phases.length, 2);
  assert.deepEqual(result.phases.map((phase) => phase.sessionId), ['session:file:a.csv', 'session:file:b.csv']);
});

test('computes phase coverage over the sum of per-session spans', () => {
  const result = analyzeRows([
    { session_id: 'file:a.csv', timestamp_s: '0', phase: 'steady', current_a: '1', voltage_v: '2', temperature_c: '30', pressure_bar: '10', flow_slpm: '3', leak_ppm: '1' },
    { session_id: 'file:a.csv', timestamp_s: '1', phase: 'steady', current_a: '1', voltage_v: '2', temperature_c: '30', pressure_bar: '10', flow_slpm: '3', leak_ppm: '1' },
    { session_id: 'file:b.csv', timestamp_s: '0', phase: 'steady', current_a: '1', voltage_v: '2', temperature_c: '30', pressure_bar: '10', flow_slpm: '3', leak_ppm: '1' },
    { session_id: 'file:b.csv', timestamp_s: '1', phase: 'steady', current_a: '1', voltage_v: '2', temperature_c: '30', pressure_bar: '10', flow_slpm: '3', leak_ppm: '1' }
  ], { requiredPhases: ['steady'], requiredPhaseMetrics: { steady: ['durationS'] } });
  assert.equal(result.phaseCoverage.required[0].validDataCoveragePct, 100);
});

test('structured acquisition and pre-check records fail closed without inventing sampling or safety limits', () => {
  const result = analyzeRows(parseCSV(baselineCsv), {
    profileId: 'approved-structured',
    profileName: 'Approved structured',
    approvalStatus: 'approved',
    standardRefs: [{ id: 'GB/T 45541-2025', title: 'PEM', uri: 'https://std.samr.gov.cn/example' }],
    methodId: 'GB/T 45541-2025',
    revision: '2025',
    acquisitionRequirements: { requireSamplingFrequency: true, requireSynchronization: true, requireEvidenceRef: true, requiredChannels: [{ field: 'timestamp_s', unit: 's' }, { field: 'current_a', unit: 'A' }] },
    preCheckRequirements: [{ id: 'device_identity', label: '设备身份', required: true }],
    testMetadata: {
      acquisitionRecord: { samplingFrequencyHz: 1, synchronization: { status: 'verified', clockReference: 'DAQ-1' }, channels: [{ field: 'timestamp_s', channelId: 'T-1', unit: 's' }, { field: 'current_a', channelId: 'I-1', unit: 'mA' }], evidenceRef: 'ACQ-1' },
      preCheckItems: [{ id: 'device_identity', status: 'fail', evidenceRef: 'PC-1' }]
    }
  });
  assert.equal(result.compliance.acquisition.status, 'missing');
  assert.deepEqual(result.compliance.acquisition.unitMismatches, ['current_a:mA≠A']);
  assert.equal(result.compliance.preCheck.ready, false);
  assert.deepEqual(result.compliance.preCheck.failed, ['device_identity:fail']);
  assert.ok(result.issues.some((item) => item.code === 'ACQUISITION_EVIDENCE_MISSING'));
  assert.ok(result.issues.some((item) => item.code === 'PRECHECK_EVIDENCE_MISSING'));
  assert.equal(result.compliance.status, 'NOT_READY');
});

test('standard workflow evidence fails closed for missing conditions, methods, stages, and efficiency', () => {
  const profile = getProfile('electrolyzer-power-fluctuation-demo');
  const result = analyzeRows(parseCSV(baselineCsv), {
    ...profile,
    profileId: profile.id,
    approvalStatus: 'approved',
    testMetadata: { testStages: [], testConditions: {}, measurementMethodRecords: [], efficiencyRecord: {} }
  });
  assert.equal(result.compliance.testStages.status, 'missing');
  assert.equal(result.compliance.testConditions.status, 'missing');
  assert.equal(result.compliance.measurementMethods.status, 'missing');
  assert.equal(result.compliance.efficiency.status, 'missing');
  assert.equal(result.compliance.status, 'NOT_READY');
  assert.ok(result.issues.some((item) => item.code === 'TEST_STAGE_EVIDENCE_MISSING'));
  assert.ok(result.issues.some((item) => item.code === 'TEST_CONDITION_EVIDENCE_MISSING'));
  assert.ok(result.issues.some((item) => item.code === 'MEASUREMENT_METHOD_EVIDENCE_MISSING'));
  assert.ok(result.issues.some((item) => item.code === 'EFFICIENCY_EVIDENCE_MISSING'));
});

test('operator identity and qualification are independent report gates', () => {
  const base = {
    profileId: 'operator-gate',
    approvalStatus: 'approved',
    requiredMetadata: ['operator', 'operatorQualification'],
    reportRequirements: ['operator', 'operatorQualification'],
    testMetadata: { operator: 'operator-001' }
  };
  const missing = analyzeRows(parseCSV(baselineCsv), base);
  assert.deepEqual(missing.compliance.report.missing, ['operatorQualification']);
  assert.ok(missing.compliance.missingMetadata.includes('operatorQualification'));
  const complete = analyzeRows(parseCSV(baselineCsv), {
    ...base,
    testMetadata: { operator: 'operator-001', operatorQualification: 'AUTH-001' }
  });
  assert.deepEqual(complete.compliance.report.missing, []);
});

test('workflow sequence gates each declared test stage by its own id', () => {
  const result = analyzeRows(parseCSV(baselineCsv), {
    profileId: 'workflow-stage-gate',
    requiredTestStages: [
      { id: 'basic_check', label: '基本检查', required: true },
      { id: 'performance_test', label: '性能测试', required: true }
    ],
    workflowSequence: [
      { id: 'basic_check', label: '基本检查', gate: 'testStages' },
      { id: 'performance_test', label: '性能测试', gate: 'testStages' }
    ],
    testMetadata: {
      testStages: [
        { id: 'basic_check', status: 'complete', evidenceRef: 'BC-001' },
        { id: 'performance_test', status: 'pending', evidenceRef: 'PT-001' }
      ]
    }
  });
  assert.equal(result.workflow.steps.find((step) => step.id === 'method-basic_check').status, 'ready');
  assert.equal(result.workflow.steps.find((step) => step.id === 'method-performance_test').status, 'needs_input');
});

test('measurement method gate reports exact missing declared fields', () => {
  const result = analyzeRows(parseCSV(baselineCsv), {
    profileId: 'measurement-field-gate',
    measurementMethodRequirements: [
      { id: 'gas_output', label: '气体输出测量方法', required: true, measurementFields: ['flow_slpm', 'hydrogen_purity_pct'] }
    ],
    testMetadata: {
      measurementMethodRecords: [
        { id: 'gas_output', methodRef: 'METHOD-G-001', evidenceRef: 'MEAS-G-001', fields: ['flow_slpm'] }
      ]
    }
  });
  assert.deepEqual(result.compliance.measurementMethods.missingFields, ['gas_output.hydrogen_purity_pct']);
  assert.equal(result.compliance.measurementMethods.ready, false);
});

test('approved efficiency result can come from measured data or a cited enterprise record, never an inferred formula', () => {
  const base = { profileId: 'efficiency-profile', profileName: 'Efficiency profile', approvalStatus: 'approved', efficiencyRequirement: { required: true, metric: 'efficiency_pct', formulaRefRequired: true, dataSource: 'measured_or_approved_formula_record' } };
  const missing = analyzeRows(parseCSV(baselineCsv), base);
  assert.equal(missing.compliance.efficiency.status, 'missing');
  const cited = analyzeRows(parseCSV(baselineCsv), { ...base, testMetadata: { efficiencyRecord: { valuePct: 71.2, formulaRef: 'EFF-FORMULA-1', sourceRef: 'EFF-RESULT-1' } } });
  assert.equal(cited.compliance.efficiency.status, 'ready');
  assert.equal(cited.compliance.efficiency.source, 'approved_formula_record');
  assert.equal(cited.metrics.efficiency_pct, 71.2);
  assert.equal(cited.metrics.specificEnergyKWhPerNm3 > 0, true);
});

test('enterprise adapters pass measured efficiency evidence through their normalized schema', () => {
  const rows = [
    { '测试时间': '0', '实际电流（A）': '10', '实际电压（V）': '20', efficiency_pct: '70' },
    { '测试时间': '1', '实际电流（A）': '10', '实际电压（V）': '20', efficiency_pct: '72' }
  ];
  const result = analyzeRows(rows, {
    profileId: 'approved-stack',
    approvalStatus: 'approved',
    efficiencyRequirement: { required: true, metric: 'efficiency_pct', formulaRefRequired: true, dataSource: 'measured_or_approved_formula_record' },
    testMetadata: { formulaRefs: 'EFF-FORMULA-STACK' }
  });
  assert.equal(result.datasetType, 'stack');
  assert.equal(result.compliance.efficiency.status, 'ready');
  assert.equal(result.compliance.efficiency.source, 'measured_data');
  assert.equal(result.compliance.efficiency.valuePct, 71);
});

test('approved measured efficiency rejects out-of-range and partial coverage values', () => {
  const base = { profileId: 'approved-efficiency-range', approvalStatus: 'approved', efficiencyRequirement: { required: true, formulaRefRequired: true, dataSource: 'measured_or_approved_formula_record' }, testMetadata: { formulaRefs: 'EFF-001' } };
  const outOfRange = analyzeRows([
    { '测试时间': '0', '实际电流（A）': '10', '实际电压（V）': '20', efficiency_pct: '-1' },
    { '测试时间': '1', '实际电流（A）': '10', '实际电压（V）': '20', efficiency_pct: '101' }
  ], base);
  assert.equal(outOfRange.compliance.efficiency.ready, false);
  const partial = analyzeRows([
    { '测试时间': '0', '实际电流（A）': '10', '实际电压（V）': '20', efficiency_pct: '70' },
    { '测试时间': '1', '实际电流（A）': '10', '实际电压（V）': '20', efficiency_pct: '72' },
    { '测试时间': '2', '实际电流（A）': '10', '实际电压（V）': '20' }
  ], base);
  assert.equal(partial.compliance.efficiency.ready, false);
  assert.ok(partial.compliance.efficiency.missing.some((item) => item.includes('覆盖率')));
});

test('enterprise adapter reports preserve standard provenance and non-certification boundaries', () => {
  const rows = [
    { '测试时间': '0', '实际电流（A）': '10', '实际电压（V）': '20', '功率（kW）': '0.20', CELL1: '0.69', CELL2: '0.71' },
    { '测试时间': '1', '实际电流（A）': '10', '实际电压（V）': '20', '功率（kW）': '0.20', CELL1: '0.69', CELL2: '0.71' }
  ];
  const result = analyzeRows(rows, {
    profileId: 'pem-public-scope-mapping',
    approvalStatus: 'example_unapproved',
    methodId: 'GB/T 45541-2025',
    revision: '2025',
    methodExecutionStatus: 'PUBLIC_SCOPE_MAPPING',
    standardRefs: [{ id: 'GB/T 45541-2025', title: 'PEM电解槽性能测试方法', uri: 'https://std.samr.gov.cn/gb/search/gbDetailed?id=31DA5F377BB68F08E06397BE0A0A4CFB', status: 'current' }],
    methodSource: { sourceId: 'gbt_45541_interpretation_2025', locator: '课程简介', evidenceType: 'official_interpretation_paraphrase' },
    status: 'current',
    publicationDate: '2025-03-28',
    effectiveDate: '2025-07-01',
    scopeEvidence: '公开范围证据，不含标准全文。',
    workflowEvidence: '公开流程映射证据，不含完整试验执行。'
  });
  assert.equal(result.datasetType, 'stack');
  assert.equal(result.compliance.standardRefs[0].id, 'GB/T 45541-2025');
  assert.equal(result.compliance.standardReferenceEvidence.ready, true);
  assert.equal(result.compliance.methodSource.sourceId, 'gbt_45541_interpretation_2025');
  assert.equal(result.compliance.publicationDate, '2025-03-28');
  assert.equal(result.releaseGate.status, 'ANALYSIS_DRAFT');
  assert.match(reportMarkdown(result, 'standard-stack.csv'), /标准引用与实施边界/);
  assert.match(reportMarkdown(result, 'standard-stack.csv'), /GB\/T 45541-2025/);
  assert.match(reportMarkdown(result, 'standard-stack.csv'), /不证明完整标准试验/);
});

test('enterprise adapters fail closed on profile-required measurements and phases', () => {
  const rows = [
    { '测试时间': '0', '实际电流（A）': '10', '实际电压（V）': '20' },
    { '测试时间': '1', '实际电流（A）': '10', '实际电压（V）': '20' }
  ];
  const result = analyzeRows(rows, {
    profileId: 'approved-stack-gates',
    approvalStatus: 'approved',
    requiredMeasurements: ['power_w'],
    requiredPhases: ['dynamic'],
    requiredPhaseMetrics: { dynamic: ['powerRangeW'] }
  });
  assert.equal(result.datasetType, 'stack');
  assert.deepEqual(result.compliance.missingMeasurements, ['power_w']);
  assert.deepEqual(result.compliance.missingPhases, ['dynamic']);
  assert.deepEqual(result.compliance.missingPhaseMetrics, ['dynamic.powerRangeW']);
  assert.ok(result.issues.some((item) => item.code === 'PROFILE_MEASUREMENT_MISSING'));
  assert.ok(result.issues.some((item) => item.code === 'PROFILE_PHASE_MISSING'));
  assert.ok(result.issues.some((item) => item.code === 'PROFILE_PHASE_METRIC_MISSING'));
  assert.equal(result.compliance.status, 'NOT_READY');
  assert.equal(result.verdict, 'FAIL');
});

test('enterprise adapters compute declared phase metrics from normalized phase rows', () => {
  const rows = parseCSV([
    '时间,阶段,实际电流（A）,实际电压（V）,电堆功率,CELL1,CELL2',
    '0,稳态,10,20,0.20,0.69,0.71',
    '1,稳态,10,20,0.25,0.69,0.71',
    '2,稳态,10,20,0.30,0.69,0.71'
  ].join('\n'));
  const result = analyzeRows(rows, {
    profileId: 'approved-stack-phase-metrics',
    approvalStatus: 'approved',
    requiredPhases: ['稳态'],
    requiredPhaseMetrics: { 稳态: ['durationS', 'powerRangeW'] }
  });
  assert.equal(result.datasetType, 'stack');
  assert.deepEqual(result.compliance.phaseMetrics.missing, []);
  assert.equal(result.compliance.phaseMetrics.phases['稳态'].durationS, 2);
  assert.equal(result.compliance.phaseMetrics.phases['稳态'].powerRangeW, 100);
});

test('enterprise stack maps raw kW power to canonical power_w without treating voltage-current as raw power', () => {
  const rows = parseCSV([
    '时间,实际电流（A）,实际电压（V）,功率（kW）,CELL1,CELL2',
    '0,10,20,0.20,0.69,0.71',
    '1,10,20,0.25,0.69,0.71'
  ].join('\n'));
  const result = analyzeRows(rows, {
    profileId: 'approved-stack-power-canonical',
    approvalStatus: 'approved',
    requiredMeasurements: ['power_w']
  });
  assert.equal(result.schema.mapping.power_w, '功率（kW）');
  assert.equal(result.schema.conversions.power_w.label, 'kW→W');
  assert.deepEqual(result.compliance.missingMeasurements, []);
  assert.deepEqual(result.rows.map((row) => row.power_w), [200, 250]);
  assert.equal(result.metrics.powerSource, 'raw_channel');
  assert.equal(result.metrics.powerCrossCheck.rawPowerCount, 2);
});

test('enterprise stack keeps derived power available for KPI while preserving the raw-channel gate', () => {
  const rows = parseCSV([
    '时间,实际电流（A）,实际电压（V）,CELL1,CELL2',
    '0,10,20,0.69,0.71',
    '1,10,25,0.69,0.71'
  ].join('\n'));
  const result = analyzeRows(rows, { profileId: 'derived-power-descriptive' });
  assert.equal(result.metrics.powerSource, 'derived_voltage_times_current');
  assert.deepEqual(result.rows.map((row) => row.power_w), [200, 250]);
  assert.deepEqual(result.rows.map((row) => row.raw_power_w), [null, null]);
  assert.deepEqual(result.schema.mapping.power_w, null);
  assert.deepEqual(result.schema.derivedFields, ['power_w']);
  assert.ok(result.schema.missingHeaders.includes('power_w'));

  const gated = analyzeRows(rows, { profileId: 'raw-power-required', approvalStatus: 'approved', requiredMeasurements: ['power_w'] });
  assert.deepEqual(gated.compliance.missingMeasurements, ['power_w']);
  assert.match(gated.compliance.measurements.evidence, /派生电流×电压功率/);
  assert.equal(gated.compliance.status, 'NOT_READY');
});

test('approved original-power requirements reject partial raw-channel coverage', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,power_w,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,20,200,30,10,3,1',
    '1,10,20,,30,10,3,1',
    '2,10,20,200,30,10,3,1'
  ].join('\n')), { approvalStatus: 'approved', requiredMeasurements: ['power_w'] });
  assert.deepEqual(result.compliance.missingMeasurements, ['power_w']);
  assert.ok(result.issues.some((item) => item.code === 'PERFORMANCE_FIELD_MISSING'));
});

test('formal power acceptance cannot consume derived voltage-current power', () => {
  const rows = parseCSV([
    '时间,实际电流（A）,实际电压（V）,CELL1,CELL2',
    '0,10,20,0.69,0.71',
    '1,10,20,0.69,0.71'
  ].join('\n'));
  const result = analyzeRows(rows, {
    profileId: 'formal-power-rule',
    approvalStatus: 'approved',
    acceptanceRules: [{ metric: 'peakPowerW', operator: '<=', value: 300 }]
  });
  assert.equal(result.compliance.acceptance.checks[0].provenanceStatus, 'missing');
  assert.equal(result.compliance.acceptance.status, 'missing_measurement');
  assert.ok(result.issues.some((item) => item.code === 'ACCEPTANCE_PROVENANCE_MISSING'));
});

test('enterprise adapters propagate approved uncertainty models across stack, vehicle, and durability outputs', () => {
  const model = {
    method: 'first_order_rss',
    coverageFactor: 2,
    standardUncertainty: {
      current_a: 0.1,
      voltage_v: 0.2,
      power_w: 5,
      avg_cell_voltage_v: 0.001,
      average_cell_voltage_mv: 0.5,
      cell_voltage_v: 0.0005
    }
  };
  const stack = analyzeRows(parseCSV([
    '时间,实际电流（A）,实际电压（V）,功率（kW）,平均电压,CELL1,CELL2',
    '0,10,20,0.20,0.70,0.69,0.71',
    '1,10,25,0.25,0.69,0.68,0.70'
  ].join('\n')), { uncertaintyModelRequired: true, uncertaintyModel: model });
  assert.equal(stack.uncertainty.status, 'calculated');
  assert.equal(stack.uncertainty.metrics.peakPowerW, 10);
  assert.equal(stack.uncertainty.metrics.averageCurrentA, 0.2);
  assert.ok(stack.uncertainty.metrics.cellValueStdV > 0);
  assert.match(stack.uncertainty.metricDetails.find((item) => item.metric === 'cellValueStdV').source, /未包含 Type A/);
  assert.equal(stack.workflow.steps.find((step) => step.id === 'uncertainty').status, 'ready');
  assert.match(reportMarkdown(stack, 'stack.csv'), /测量不确定度传播/);
  assert.ok(buildEnterpriseWorkbook(stack, 'stack.csv').SheetNames.includes('测量不确定度'));

  const vehicle = analyzeRows(parseCSV([
    'Timestamp,FC_MainSts,FC_CurrOut,FC_VoltOut,FC_NetPwrOut,FC_MinCellVoltage,FC_MinVoltageChannel,FC_AvgCellVoltage,FC_AvgCellDev,FC_VARVoltage,FC_VehicleIsolationR,FC_RunTime_Hours',
    '2026-07-07 18:20:52,4,95,320,30,0.61,3,0.68,8,12,480,1',
    '2026-07-07 18:23:52,4,95,320,31,0.60,3,0.67,9,13,340,1'
  ].join('\n')), { uncertaintyModel: model });
  assert.equal(vehicle.uncertainty.status, 'calculated');
  assert.equal(vehicle.uncertainty.metrics.peakPowerW, 10);
  assert.equal(vehicle.uncertainty.metrics.steadyVoltageMeanV, 0.002);

  const durability = analyzeRows([
    { target_power_kw: '33', average_cell_voltage_mv: '700', average_deviation_mv: '4', voltage_variance: '2', net_power_kw: '33' },
    { target_power_kw: '58.5', average_cell_voltage_mv: '699', average_deviation_mv: '5', voltage_variance: '3', net_power_kw: '58.5' }
  ], { uncertaintyModel: model });
  assert.equal(durability.datasetType, 'durability');
  assert.equal(durability.uncertainty.status, 'calculated');
  assert.equal(durability.uncertainty.metrics.peakPowerW, 10);
  assert.equal(durability.uncertainty.metrics.steadyVoltageMeanV, 0.001);
  assert.equal(durability.metrics.steadyVoltageStdV, 0.0005);
});

test('enterprise uncertainty requirement fails closed when the model is absent', () => {
  const result = analyzeRows(parseCSV([
    '时间,实际电流（A）,实际电压（V）,功率（kW）,CELL1,CELL2',
    '0,10,20,0.20,0.69,0.71',
    '1,10,20,0.20,0.69,0.71'
  ].join('\n')), { uncertaintyModelRequired: true, approvalStatus: 'approved', standardRefs: [{ id: 'TEST-STD' }], methodId: 'TEST-METHOD', revision: '1', scopeRules: {}, instrumentRequirements: ['electrical_input'], reportRequirements: ['charts'], acceptanceRules: [{ metric: 'peakTemperatureC', operator: '<=', value: 100, sourceRef: 'TEST-RULE' }] });
  assert.equal(result.compliance.status, 'NOT_READY');
  assert.ok(result.issues.some((item) => item.code === 'UNCERTAINTY_MODEL_MISSING'));
  assert.ok(result.releaseGate.blockedReasons.includes('uncertaintyEvidence'));
});

test('required uncertainty does not substitute derived power for a missing raw power uncertainty', () => {
  const result = analyzeRows(parseCSV([
    'timestamp_s,current_a,voltage_v,power_w,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,10,20,200,30,10,6,1',
    '1,10,20,200,30,10,6,1'
  ].join('\n')), {
    uncertaintyModelRequired: true,
    uncertaintyModel: { method: 'first_order_rss', coverageFactor: 2, standardUncertainty: { current_a: 0.1, voltage_v: 0.2, flow_slpm: 0.05, temperature_c: 0.2, pressure_bar: 0.02, leak_ppm: 0.5 } },
    testMetadata: { signoff: 'reviewer' }
  });
  assert.equal(result.uncertainty.status, 'insufficient');
  assert.ok(result.uncertainty.missingFields.includes('power_w'));
  assert.ok(result.issues.some((item) => item.code === 'UNCERTAINTY_INPUT_MISSING'));
  assert.ok(result.releaseGate.blockedReasons.includes('uncertaintyInputCoverage'));
});

test('invalid generic uncertainty methods fail closed', () => {
  const result = analyzeRows(parseCSV(baselineCsv), {
    uncertaintyModelRequired: true,
    uncertaintyModel: { method: 'monte_carlo', coverageFactor: 2, standardUncertainty: {} }
  });
  assert.equal(result.uncertainty.status, 'invalid');
  assert.ok(result.issues.some((item) => item.code === 'UNCERTAINTY_MODEL_INVALID'));
  assert.ok(result.releaseGate.blockedReasons.includes('uncertaintyEvidence'));
});

test('enterprise phase coverage uses original row continuity and does not hide interrupted segments', () => {
  const rows = parseCSV([
    '时间,阶段,实际电流（A）,实际电压（V）,功率（kW）,CELL1,CELL2',
    '0,稳态,10,20,0.20,0.69,0.71',
    '1,动态,10,20,0.25,0.69,0.71',
    '2,稳态,10,20,0.30,0.69,0.71',
    '3,动态,10,20,0.35,0.69,0.71'
  ].join('\n'));
  const result = analyzeRows(rows, {
    profileId: 'approved-stack-continuity',
    approvalStatus: 'approved',
    requiredPhases: ['动态'],
    requiredPhaseMetrics: { 动态: ['durationS'] },
    dataQualityRequirements: { minPhaseCoveragePct: 100, requireContiguousPhaseRows: true }
  });
  const coverage = result.compliance.phaseMetrics.phaseCoverage.required[0];
  assert.equal(coverage.interruptedSegmentCount, 1);
  assert.equal(coverage.validDataCoveragePct, 0);
  assert.ok(result.compliance.dataQuality.failed.includes('动态.validDataCoveragePct=0'));
  assert.equal(result.compliance.status, 'NOT_READY');
});

test('enterprise stack does not invent a phase when the source has no phase column', () => {
  const rows = parseCSV([
    '时间,实际电流（A）,实际电压（V）,功率（kW）,CELL1,CELL2',
    '0,10,20,0.20,0.69,0.71',
    '1,10,20,0.25,0.69,0.71'
  ].join('\n'));
  const result = analyzeRows(rows, {
    profileId: 'approved-stack-no-phase',
    approvalStatus: 'approved',
    requiredPhases: ['稳态']
  });
  assert.deepEqual(result.compliance.missingPhases, ['稳态']);
  assert.deepEqual(result.rows.map((row) => row.phase), ['未标注', '未标注']);
});

test('enterprise adapters apply structured acquisition, pre-check, and data-quality gates', () => {
  const rows = parseCSV([
    '时间,实际电流（A）,实际电压（V）,电堆功率,CELL1,CELL2',
    '0,10,20,0.20,0.69,0.71',
    '1,10,20,0.20,0.69,0.71',
    '3,10,20,0.20,0.69,0.71'
  ].join('\n'));
  const base = {
    profileId: 'approved-stack-evidence-gates',
    approvalStatus: 'approved',
    acquisitionRequirements: {
      requireSamplingFrequency: true,
      requireSynchronization: true,
      requireEvidenceRef: true,
      requiredChannels: [{ field: 'current_a', unit: 'A' }]
    },
    preCheckRequirements: [{ id: 'interlock', required: true }],
    dataQualityRequirements: { requireMonotonicTimestamps: true, requireUniqueTimestamps: true, requirePositiveIntervals: true, maxIntervalS: 1.5 }
  };
  const blocked = analyzeRows(rows, base);
  assert.equal(blocked.compliance.acquisition.status, 'missing');
  assert.equal(blocked.compliance.preCheck.status, 'missing');
  assert.equal(blocked.compliance.dataQuality.status, 'failed');
  assert.equal(blocked.compliance.status, 'NOT_READY');
  const ready = analyzeRows(rows, {
    ...base,
    testMetadata: {
      acquisitionRecord: {
        samplingFrequencyHz: 1,
        synchronization: { status: 'locked', clockReference: 'CLK-1' },
        evidenceRef: 'ACQ-1',
        channels: [{ field: 'current_a', channelId: 'I-1', unit: 'A' }]
      },
      preCheckItems: [{ id: 'interlock', status: 'pass', evidenceRef: 'PRE-1' }]
    }
  });
  assert.equal(ready.compliance.acquisition.status, 'ready');
  assert.equal(ready.compliance.preCheck.status, 'ready');
  assert.equal(ready.compliance.dataQuality.status, 'failed');
  assert.equal(ready.compliance.status, 'NOT_READY');
});

test('malformed structured test conditions fail closed with an explicit format status', () => {
  const result = analyzeRows(parseCSV(baselineCsv), {
    profileId: 'approved-conditions',
    approvalStatus: 'approved',
    testConditionRequirements: { fields: [{ id: 'ambientTemperatureC', label: '环境温度', valueType: 'number' }] },
    testMetadata: { testConditions: { ambientTemperatureC: { value: 25 } } }
  });
  assert.equal(result.compliance.testConditions.status, 'malformed');
  assert.equal(result.compliance.testConditions.malformed, 1);
  assert.deepEqual(result.compliance.testConditions.malformedFields, ['ambientTemperatureC']);
  assert.equal(result.compliance.testConditions.ready, false);
});

test('method-specific system, environment, and phase-result evidence fail closed independently', () => {
  const result = analyzeRows(parseCSV(baselineCsv), {
    profileId: 'approved-method', approvalStatus: 'approved',
    standardRefs: [{ id: 'GB/T 46104-2025', title: 'Power fluctuation', uri: 'https://std.samr.gov.cn/example' }],
    methodId: 'GB/T 46104-2025', revision: '2025',
    testSystemRequirements: [{ id: 'power_supply', label: '电源', required: true }],
    environmentConditionRequirements: { requireEvidenceRef: true, fields: [{ id: 'ambientTemperatureC', label: '环境温度', valueType: 'number' }] },
    phaseResultRequirements: [{ phase: 'steady', label: '稳态', resultFields: ['durationS'], evidenceRefRequired: true }],
    requiredPhases: ['steady'],
    requiredPhaseMetrics: { steady: ['durationS'] }
  });
  assert.equal(result.compliance.testSystem.status, 'missing');
  assert.equal(result.compliance.environmentConditions.status, 'missing');
  assert.equal(result.compliance.phaseResults.status, 'missing');
  assert.ok(result.issues.some((item) => item.code === 'TEST_SYSTEM_EVIDENCE_MISSING'));
  assert.ok(result.issues.some((item) => item.code === 'ENVIRONMENT_CONDITION_EVIDENCE_MISSING'));
  assert.ok(result.issues.some((item) => item.code === 'PHASE_RESULT_EVIDENCE_MISSING'));
  assert.equal(result.compliance.status, 'NOT_READY');
});

test('blocks an approved PEM profile when the public scope bounds are exceeded', () => {
  const result = analyzeRows(parseCSV(baselineCsv), {
    profileId: 'approved-pem', profileName: 'Approved PEM', approvalStatus: 'approved',
    standardRefs: [{ id: 'GB/T 45541-2025', title: 'PEM', uri: 'https://std.samr.gov.cn/example' }], methodId: 'GB/T 45541-2025', revision: '2025',
    scopeRules: { requiresDeviceFamily: true, requiresRatedHydrogenPressureMpa: true, maxRatedHydrogenPressureMpa: 10 }, instrumentRequirements: ['electrical_input'], reportRequirements: ['conclusion'], acceptanceRules: [{ metric: 'specificEnergyKWhPerNm3', operator: '<=', value: 1e9, sourceRef: 'enterprise-acceptance-001' }],
    testMetadata: { deviceFamily: 'PEM', ratedHydrogenPressureMpa: 12, instrumentRecords: [{ id: 'I-1', category: 'electrical_input', accuracy: '0.2%FS', calibrationRef: 'CAL-1' }] }
  });
  assert.equal(result.compliance.scope.status, 'out_of_scope');
  assert.equal(result.compliance.status, 'NOT_READY');
  assert.ok(result.issues.some((item) => item.code === 'SCOPE_NOT_READY'));
  assert.equal(result.releaseGate.status, 'ANALYSIS_DRAFT');
});

test('uncertainty model is required only when the approved profile declares it', () => {
  const base = { profileId: 'approved-example', profileName: 'Approved example', approvalStatus: 'approved', standardRefs: [{ id: 'GB/T 45541-2025', title: 'PEM', uri: 'https://std.samr.gov.cn/example' }], methodId: 'GB/T 45541-2025', revision: '2025', uncertaintyModelRequired: true };
  const missing = analyzeRows(parseCSV(baselineCsv), base);
  assert.equal(missing.compliance.status, 'NOT_READY');
  assert.ok(missing.issues.some((item) => item.code === 'UNCERTAINTY_MODEL_MISSING'));
  const model = { method: 'first_order_rss', coverageFactor: 2, standardUncertainty: { current_a: 0.01, voltage_v: 0.005, temperature_c: 0.2, pressure_bar: 0.02, flow_slpm: 0.05, leak_ppm: 0.5, hydrogen_purity_pct: 0.01 } };
  const ready = analyzeRows(parseCSV(baselineCsv), { ...base, uncertaintyModel: model, testMetadata: { signoff: 'reviewer' } });
  assert.equal(ready.uncertainty.status, 'calculated');
  assert.ok(ready.uncertainty.metrics.energyConsumedWh > 0);
  assert.ok(ready.workflow.steps.some((step) => step.id === 'uncertainty' && step.status === 'ready'));
});

test('recognizes the enterprise vehicle contract and computes target-current and insulation summaries', () => {
  const rows = parseCSV([
    'Timestamp,FC_MainSts,FC_CurrOut,FC_VoltOut,FC_NetPwrOut,FC_MinCellVoltage,FC_MinVoltageChannel,FC_AvgCellVoltage,FC_AvgCellDev,FC_VARVoltage,FC_VehicleIsolationR,FC_RunTime_Hours',
    '2026-07-07 18:20:52,8,95,320,30,0.61,3,0.68,8,12,480,1',
    '2026-07-07 18:23:52,4,95,320,31,0.60,3,0.67,9,13,340,1',
    '2026-07-07 18:24:52,4,95,320,31,0.60,3,0.67,9,13,240,1',
    '2026-07-07 18:25:52,8,0,0,0,0,0,0,0,0,65535,1'
  ].join('\n'));
  const result = analyzeRows(rows, { vehicleTargets: [95], vehicleCurrentToleranceA: 1, vehicleMinimumDurationS: 60 });
  assert.equal(result.datasetType, 'vehicle');
  assert.equal(result.schema.mapping.isolation_kohm, 'FC_VehicleIsolationR');
  assert.equal(result.dataset.performancePoints.length, 1);
  assert.equal(result.dataset.insulation.points.length, 2);
  assert.ok(result.dataset.insulation.invalidCount >= 1);
  assert.equal('rows' in publicAnalysis(result), false);
  assert.match(reportMarkdown(result, 'vehicle.csv'), /目标电流段统计/);
});

test('uses the T02 vehicle command-current signal for optional dynamic event analysis', () => {
  const header = 'Timestamp,FC_SysFltRnk,FC_MainSts,FC_ErrorCode,FC_SysLoadCurr,FC_AirSysSts,FC_H2SysSts,FC_TMSysSts,RollingCount_0x101,FC_CurrOut,FC_VoltOut,FC_MaxCurrAllow,FC_MaxPwrAllow,FC_NetPwrOut,FC_HVLockVoltage,FC_MinCellVoltage,FC_MinVoltageChannel,FC_MaxCellVoltage,FC_MaxVoltageChannel,FC_AvgCellVoltage,FC_AvgCellDev,FC_VARVoltage,TotalVoltage,FC_PurgeTgtEIS,FC_RealEISValue,FC_PurgeTime,FC_AirPreCPOut,FC_ACPPwr,FC_AuxFANEn,FC_AuxFANRpm,FC_H2SupplyReq,FC_HSSFltRnk,FC_HSSSysSts,FC_HSSErrorCode,FC_HSSHighPreu,FC_HSSMidPre,FC_HSSH2SOC,FC_HSSTripRefuelMass,FC_VehicleSpd,FC_VehicleKM,FC_VehicleIsolationR,FC_HydCmPerHundred,FC_HydCmInstts,FC_RunTime_Hours,FC_RunTime_Min,FC_StartTimes';
  const row = (second, command, current, power) => [
    `2026-07-07 18:20:${String(second).padStart(2, '0')}`, 0, 4, 0, command, 1, 1, 1, second, current, 320, 500, 120, power, 12, 0.6, 3, 0.72, 4, 0.68, 8, 12, 320, 0, 0, 0, 10, 2, 1, 1200, 1, 0, 1, 0, 120, 110, 60, 3, 0, 0, 500, 2, 1.9, 1, second, 1
  ].join(',');
  const result = analyzeRows(parseCSV([header, row(0, 0, 0, 0), row(1, 100, 20, 6), row(2, 100, 95, 30), row(3, 50, 80, 25), row(4, 50, 50, 16)].join('\n')), {
    vehicleDynamicAnalysis: { enabled: true, minimumStep: 10, responseBandPct: 5, minimumResponseBand: 5, settleWindowS: 0, maxGapS: 2 }
  });
  assert.equal(result.dataset.dynamicAnalysis.status, 'calculated');
  assert.equal(result.dataset.dynamicAnalysis.commandField, 'command_current_a');
  assert.equal(result.dataset.dynamicAnalysis.eventCount, 2);
  assert.equal(result.dataset.dynamicAnalysis.events[0].direction, 'up');
  assert.equal(result.dataset.dynamicAnalysis.events[0].maxActualPowerRampUpPerS, 24000);
  assert.match(reportMarkdown(result, 'vehicle-dynamic.csv'), /动态负载事件/);
});

test('fits vehicle performance trends from separate target-current platforms', () => {
  const header = 'Timestamp,FC_MainSts,FC_CurrOut,FC_VoltOut,FC_NetPwrOut,FC_MinCellVoltage,FC_MinVoltageChannel,FC_AvgCellVoltage,FC_AvgCellDev,FC_VARVoltage,FC_VehicleIsolationR,FC_RunTime_Hours';
  const row = (time, current, avg, power) => `2026-07-07 18:${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')},4,${current},320,${power},0.6,1,${avg},8,10,500,1`;
  const result = analyzeRows(parseCSV([header, row(0, 95, 0.70, 30), row(180, 95, 0.70, 30), row(181, 0, 0.70, 0), row(361, 105, 0.68, 32), row(541, 105, 0.68, 32)].join('\n')), { vehicleTargets: [95, 105], vehicleCurrentToleranceA: 1, vehicleMinimumDurationS: 180 });
  assert.equal(result.dataset.performancePoints.length, 2);
  assert.equal(result.dataset.performanceTrend.averageCellVoltageV.pointCount, 2);
  assert.ok(result.dataset.performanceTrend.averageCellVoltageV.slopePerDay < 0);
  assert.match(reportMarkdown(result, 'vehicle.csv'), /性能趋势参数/);
});

test('excludes non-active vehicle states from formal target-current performance points', () => {
  const header = 'Timestamp,FC_MainSts,FC_CurrOut,FC_VoltOut,FC_NetPwrOut,FC_MinCellVoltage,FC_MinVoltageChannel,FC_AvgCellVoltage,FC_AvgCellDev,FC_VARVoltage,FC_VehicleIsolationR,FC_RunTime_Hours';
  const row = (time) => `2026-01-01 00:${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')},8,95,320,30,0.60,3,0.68,8,12,500,1`;
  const result = analyzeRows(parseCSV([header, row(0), row(180)].join('\n')), { vehicleTargets: [95], vehicleCurrentToleranceA: 1, vehicleMinimumDurationS: 180 });
  assert.equal(result.dataset.performancePoints.length, 0);
  assert.ok(result.issues.some((item) => item.code === 'VEHICLE_PERFORMANCE_STATUS_EXCLUDED'));
});

test('keeps vehicle inferred current intervals descriptive when target currents are absent', () => {
  const rows = Array.from({ length: 181 }, (_, timestamp) => ({
    Timestamp: String(timestamp), FC_MainSts: '4', FC_CurrOut: '95', FC_VoltOut: '320', FC_NetPwrOut: '30',
    FC_MinCellVoltage: '0.60', FC_MinVoltageChannel: '3', FC_AvgCellVoltage: '0.68', FC_AvgCellDev: '8',
    FC_VARVoltage: '12', FC_VehicleIsolationR: '500', FC_RunTime_Hours: '1'
  }));
  const result = analyzeRows(rows, {});
  assert.equal(result.dataset.performancePoints.length, 0);
  assert.equal(result.dataset.inferredSegments.length, 1);
  assert.equal(result.dataset.inferredSegments[0].decisionScope, 'descriptive_only');
  assert.ok(result.issues.some((item) => item.code === 'VEHICLE_TARGETS_MISSING'));
  assert.match(result.narrative, /未进行目标符合性判定/);
  assert.match(reportMarkdown(result, 'vehicle-inferred.csv'), /未进行目标符合性判定/);
});

test('retains every enterprise vehicle signal in the coverage catalog and applies a selected window', () => {
  const header = 'Timestamp,FC_SysFltRnk,FC_MainSts,FC_ErrorCode,FC_SysLoadCurr,FC_AirSysSts,FC_H2SysSts,FC_TMSysSts,RollingCount_0x101,FC_CurrOut,FC_VoltOut,FC_MaxCurrAllow,FC_MaxPwrAllow,FC_NetPwrOut,FC_HVLockVoltage,FC_MinCellVoltage,FC_MinVoltageChannel,FC_MaxCellVoltage,FC_MaxVoltageChannel,FC_AvgCellVoltage,FC_AvgCellDev,FC_VARVoltage,TotalVoltage,FC_PurgeTgtEIS,FC_RealEISValue,FC_PurgeTime,FC_AirPreCPOut,FC_ACPPwr,FC_AuxFANEn,FC_AuxFANRpm,FC_H2SupplyReq,FC_HSSFltRnk,FC_HSSSysSts,FC_HSSErrorCode,FC_HSSHighPreu,FC_HSSMidPre,FC_HSSH2SOC,FC_HSSTripRefuelMass,FC_VehicleSpd,FC_VehicleKM,FC_VehicleIsolationR,FC_HydCmPerHundred,FC_HydCmInstts,FC_RunTime_Hours,FC_RunTime_Min,FC_StartTimes';
  const row = (time, speed, isolation) => [
    `2026-07-07 18:20:${String(time).padStart(2, '0')}`, 0, 4, 0, 95, 1, 1, 1, time, 95, 320, 110, 35, 31, 12, 0.6, 3, 0.72, 4, 0.68, 8, 12, 320, 0, 0, 0, 10, 2, 1, 1200, 1, 0, 1, 0, 120, 110, 60, 3, speed, time / 10, isolation, 2, 1.9, 1, time, 1
  ].join(',');
  const result = analyzeRows(parseCSV([header, row(0, 0, 500), row(1, 20, 400), row(2, 40, 300)].join('\n')), { vehicleSignal: 'FC_VehicleSpd', vehicleStartS: 1, vehicleEndS: 2 });
  assert.equal(result.dataset.signalCatalog.length, 46);
  assert.equal(result.dataset.coverage.totalSignals, 46);
  assert.equal(result.dataset.coverage.catalogOnlySignals.length, 0);
  assert.equal(result.dataset.selectedSignal, 'FC_VehicleSpd');
  assert.equal(result.dataset.analysisWindow.rowCount, 2);
  assert.equal(result.metrics.sampleCount, 2);
  assert.equal(result.metrics.steadySampleCount, 2);
  assert.equal(result.dataset.crossChecks.length, 4);
  assert.match(reportMarkdown(result, 'vehicle-full.csv'), /字段覆盖边界/);
  const workbook = buildEnterpriseWorkbook(result, 'vehicle-full.csv');
  assert.ok(workbook.SheetNames.includes('车辆信号目录'));
  assert.ok(workbook.SheetNames.includes('车辆交叉核对'));
});

test('exposes field diagnostics while filtering nonpositive normalized cell-voltage KPIs and preserving raw values', () => {
  const header = 'Timestamp,FC_MainSts,FC_CurrOut,FC_VoltOut,FC_NetPwrOut,FC_MinCellVoltage,FC_MinVoltageChannel,FC_AvgCellVoltage,FC_AvgCellDev,FC_VARVoltage,FC_VehicleIsolationR,FC_RunTime_Hours';
  const rows = parseCSV([header,
    '0,4,10,320,3.2,-2,3,0,8,0,500,1',
    '1,4,10,320,3.2,-1,3,0,8,0,500,1'
  ].join('\n'));
  const result = analyzeRows(rows, {});
  const minCell = result.dataset.signalCatalog.find((item) => item.source === 'FC_MinCellVoltage');
  const avgCell = result.dataset.signalCatalog.find((item) => item.source === 'FC_AvgCellVoltage');
  assert.equal(minCell.negativeCount, 2);
  assert.equal(minCell.reviewable, true);
  assert.equal(avgCell.zeroCount, 2);
  assert.equal(avgCell.zeroDominant, true);
  assert.ok(result.dataset.signalDiagnostics.reviewSignalCount >= 2);
  assert.ok(result.issues.some((item) => item.code === 'SIGNAL_VALUE_SEMANTICS_REVIEW'));
  assert.equal(result.dataset.unitDiagnostics.nonPositiveCellVoltageCounts.min_cell_voltage_v, 2);
  assert.equal(result.dataset.unitDiagnostics.nonPositiveCellVoltageCounts.avg_cell_voltage_v, 2);
  assert.ok(result.issues.some((item) => item.code === 'VEHICLE_NONPOSITIVE_CELL_VOLTAGE_FILTERED'));
  assert.equal(result.rows[0].min_cell_voltage_raw, -2);
  assert.equal(result.rows[0].min_cell_voltage_v, null);
  assert.equal(result.rows[0].avg_cell_voltage_v, null);
  assert.equal(result.rows[0].avg_cell_voltage_raw, 0);
});

test('applies an explicitly declared vehicle mV unit without guessing from magnitude', () => {
  const header = 'Timestamp,FC_MainSts,FC_CurrOut,FC_VoltOut,FC_NetPwrOut,FC_MinCellVoltage,FC_MinVoltageChannel,FC_AvgCellVoltage,FC_AvgCellDev,FC_VARVoltage,FC_VehicleIsolationR,FC_RunTime_Hours';
  const rows = parseCSV([header,
    '0,4,10,320,3.2,700,3,740,8,12,500,1',
    '1,4,10,320,3.2,701,3,741,8,12,500,1'
  ].join('\n'));
  const result = analyzeRows(rows, { vehicleUnitEvidenceRequired: true, vehicleSignalUnits: { min_cell_voltage_v: { sourceUnit: 'mV' }, avg_cell_voltage_v: { sourceUnit: 'mV' }, cell_voltage_variance: { sourceUnit: 'mV²' } } });
  assert.equal(result.dataset.unitDiagnostics.unresolvedFields.length, 0);
  assert.equal(result.rows[0].avg_cell_voltage_v, 0.74);
  assert.equal(result.rows[0].cell_voltage_variance, 0.000012);
  assert.ok(Math.abs(result.metrics.steadyVoltageMeanV - 0.7405) < 1e-12);
});

test('keeps positive cell voltage in KPI while filtering nonpositive raw values', () => {
  const header = 'Timestamp,FC_MainSts,FC_CurrOut,FC_VoltOut,FC_NetPwrOut,FC_MinCellVoltage,FC_MinVoltageChannel,FC_AvgCellVoltage,FC_AvgCellDev,FC_VARVoltage,FC_VehicleIsolationR,FC_RunTime_Hours';
  const rows = parseCSV([header,
    '0,4,10,320,3.2,-1,3,0,8,1,500,1',
    '1,4,10,320,3.2,0,3,0,8,1,500,1',
    '2,4,10,320,3.2,0.70,3,0.72,8,1,500,1'
  ].join('\n'));
  const result = analyzeRows(rows, { vehicleUnitEvidenceRequired: true, vehicleSignalUnits: { min_cell_voltage_v: { sourceUnit: 'V' }, avg_cell_voltage_v: { sourceUnit: 'V' }, cell_voltage_variance: { sourceUnit: 'V²' } } });
  assert.equal(result.metrics.steadyVoltageMeanV, 0.72);
  assert.equal(result.rows[0].avg_cell_voltage_raw, 0);
  assert.equal(result.rows[0].avg_cell_voltage_v, null);
  assert.equal(result.rows[2].avg_cell_voltage_v, 0.72);
});

test('accepts explicitly declared vehicle V units when unit evidence is required', () => {
  const header = 'Timestamp,FC_MainSts,FC_CurrOut,FC_VoltOut,FC_NetPwrOut,FC_MinCellVoltage,FC_MinVoltageChannel,FC_AvgCellVoltage,FC_AvgCellDev,FC_VARVoltage,FC_VehicleIsolationR,FC_RunTime_Hours';
  const rows = parseCSV([header,
    '0,4,10,320,3.2,0.70,3,0.72,8,1,500,1',
    '1,4,10,320,3.2,0.71,3,0.73,8,1,500,1'
  ].join('\n'));
  const result = analyzeRows(rows, { vehicleUnitEvidenceRequired: true, vehicleSignalUnits: { min_cell_voltage_v: { sourceUnit: 'V' }, avg_cell_voltage_v: { sourceUnit: 'V' }, cell_voltage_variance: { sourceUnit: 'V²' } } });
  assert.deepEqual(result.dataset.unitDiagnostics.unresolvedFields, []);
  assert.equal(result.metrics.steadyVoltageMeanV, 0.725);
});

test('splits vehicle insulation exclusions by status, value type, and valid minimum input', () => {
  const header = 'Timestamp,FC_MainSts,FC_CurrOut,FC_VoltOut,FC_NetPwrOut,FC_MinCellVoltage,FC_MinVoltageChannel,FC_AvgCellVoltage,FC_AvgCellDev,FC_VARVoltage,FC_VehicleIsolationR,FC_RunTime_Hours';
  const rows = parseCSV([header,
    '0,4,10,320,3.2,0.7,3,0.74,8,12,500,1',
    '1,0,10,320,3.2,0.7,3,0.74,8,12,500,1',
    '2,4,10,320,3.2,0.7,3,0.74,8,12,10000,1',
    '3,4,10,320,3.2,0.7,3,0.74,8,12,0,1'
  ].join('\n'));
  const result = analyzeRows(rows, {});
  assert.equal(result.dataset.insulation.excludedByStatus, 1);
  assert.equal(result.dataset.insulation.censoredAboveRange, 1);
  assert.equal(result.dataset.insulation.excludedByValue, 1);
  assert.equal(result.dataset.insulation.validForMinimum, 1);
});

test('keeps vehicle sessions separate and exposes two independently scaled display signals', () => {
  const rows = [];
  const makeRow = (sessionId, sourceFile, timestamp, speed) => ({
    Timestamp: String(timestamp), FC_MainSts: '4', FC_CurrOut: '95', FC_VoltOut: '320', FC_NetPwrOut: '30',
    FC_MinCellVoltage: '0.60', FC_MinVoltageChannel: '3', FC_AvgCellVoltage: '0.68', FC_AvgCellDev: '8',
    FC_VARVoltage: '12', FC_VehicleIsolationR: '500', FC_RunTime_Hours: '1', FC_VehicleSpd: String(speed),
    session_id: sessionId, source_file: sourceFile
  });
  rows.push(makeRow('file:a.csv', 'a.csv', 0, 10), makeRow('file:a.csv', 'a.csv', 180, 20));
  rows.push(makeRow('file:b.csv', 'b.csv', 0, 30), makeRow('file:b.csv', 'b.csv', 180, 40));
  const result = analyzeRows(rows, { vehicleTargets: [95], vehicleCurrentToleranceA: 1, vehicleMinimumDurationS: 180, vehicleSignal: 'FC_VehicleSpd', vehicleSignalSecondary: 'FC_VoltOut' });
  assert.equal(result.datasetType, 'vehicle');
  assert.equal(result.dataset.selectedSignal, 'FC_VehicleSpd');
  assert.equal(result.dataset.secondarySignal, 'FC_VoltOut');
  assert.deepEqual(result.dataset.signalAxes, { left: 'FC_VehicleSpd', right: 'FC_VoltOut' });
  assert.equal(result.dataset.sessionCount, 2);
  assert.equal(result.quality.sessionBoundaryCount, 1);
  assert.equal(result.dataset.performancePoints.length, 2);
  assert.deepEqual(result.dataset.performancePoints.map((point) => point.sessionId), ['file:a.csv', 'file:b.csv']);
  assert.equal(result.metrics.durationS, null);
  assert.equal(result.dataset.insulation.forecast['350'].trend.slopePerDay, null);
  assert.ok(result.issues.some((issue) => issue.code === 'VEHICLE_SESSIONS_PRESERVED'));
  assert.equal(result.rows.find((row) => row.session_id === 'file:b.csv').session_timestamp_s, 0);
  const markdown = reportMarkdown(result, 'vehicle-sessions.csv');
  assert.match(markdown, /左轴信号：FC_VehicleSpd；右轴信号：FC_VoltOut/);
  assert.match(markdown, /来源会话/);
  assert.match(markdown, /会话明细/);
});

test('recognizes the enterprise stack contract, supports tab-delimited Chinese headers, and fails closed on timestamp resolution', () => {
  const rows = parseCSV([
    '时间\t电堆电压\t电堆电流\t电堆功率\t平均电压\tCELL1\tCELL2',
    '23:59:58\t1.40\t10\t0.014\t0.70\t0.69\t0.71',
    '23:59:59\t1.39\t10\t0.014\t0.695\t0.68\t0.71',
    '00:00:01\t1.38\t10\t0.014\t0.69\t0.67\t0.71'
  ].join('\n'));
  const result = analyzeRows(rows);
  assert.equal(result.datasetType, 'stack');
  assert.equal(result.dataset.cellChannelCount, 2);
  assert.equal(result.schema.mapping.current_a, '电堆电流');
  assert.equal(result.metrics.durationS, 3);
  assert.equal(result.quality.duplicateTimestampCount, 0);
  assert.match(result.narrative, /单片电压一致性/);
});

test('prefers actual stack voltage and uses per-row cell count for power and cell metrics', () => {
  const rows = parseCSV([
    '时间,实际电压（V）,总电压（V）,实际电流（A）,功率（kW）,片数,阳极流量（SLPM）,阴极流量（SLPM）,单片电压1（V）,单片电压2（V）,单片电压3（V）,单片电压4（V）',
    '00:00:00,2,5,10,0.02,2,1,2,0.50,0.60,0,0',
    '00:00:01,2.1,5.1,10,0.021,2,1,2,0.51,0.61,0,0'
  ].join('\n'));
  const result = analyzeRows(rows);
  assert.equal(result.schema.mapping.voltage_v, '实际电压（V）');
  assert.equal(result.metrics.powerCrossCheck.maxAbsoluteDifferenceW, 0);
  assert.equal(result.dataset.activeCellChannelCount, 2);
  assert.equal(result.dataset.cellTimeSeriesStats.find((item) => item.cellIndex === 3).count, 0);
  assert.ok(result.dataset.metrics.cellValueStdV < 0.1);
  assert.equal(result.dataset.stoich.cellCountSource, '逐行片数字段（缺失时回退 profile/导出通道数）');
});

test('converts explicit mV cell headers before stack cell statistics', () => {
  const result = analyzeRows([
    { 时间: 0, 电堆电压: 1.4, 电堆电流: 10, 电堆功率: 0.014, 平均电压: 0.7, 'CELL1(mV)': 700, 'CELL2(mV)': 710 },
    { 时间: 1, 电堆电压: 1.4, 电堆电流: 10, 电堆功率: 0.014, 平均电压: 0.7, 'CELL1(mV)': 700, 'CELL2(mV)': 710 }
  ]);
  assert.ok(Math.abs(result.rows[0].cells.cell_1_v - 0.7) < 1e-12);
  assert.ok(Math.abs(result.rows[0].cells.cell_2_v - 0.71) < 1e-12);
  assert.equal(result.quality.unitConversions.cell_1_v.factor, 0.001);
  assert.equal(result.quality.usable, true);
});

test('unwraps fractional time-only timestamps across midnight for vehicle sessions', () => {
  const header = 'Timestamp,FC_MainSts,FC_CurrOut,FC_VoltOut,FC_NetPwrOut,FC_MinCellVoltage,FC_MinVoltageChannel,FC_AvgCellVoltage,FC_AvgCellDev,FC_VARVoltage,FC_VehicleIsolationR,FC_RunTime_Hours';
  const rows = parseCSV([header,
    '23:59:59.500,4,95,320,30,0.60,3,0.68,8,12,500,1',
    '00:00:00.500,4,95,320,30,0.60,3,0.68,8,12,500,1'
  ].join('\n'));
  const result = analyzeRows(rows);
  assert.deepEqual(result.rows.map((row) => row.session_timestamp_s), [0, 1]);
  assert.equal(result.quality.nonMonotonicCount, 0);
  assert.equal(result.metrics.sampleCount, 2);
});

test('keeps stack inferred current intervals descriptive when target workbook is absent', () => {
  const rows = Array.from({ length: 61 }, (_, timestamp) => ({
    时间: String(timestamp), 电堆电压: 1.4, 电堆电流: 10, 电堆功率: 0.014, 平均电压: 0.7, CELL1: 0.69, CELL2: 0.71
  }));
  const result = analyzeRows(rows, {});
  assert.equal(result.dataset.inferredSegments.length, 1);
  assert.equal(result.dataset.platforms.length, 1);
  assert.equal(result.dataset.performancePoints.length, 0);
  assert.equal(result.dataset.stableSegments[0].parameterComplete, false);
  assert.ok(result.issues.some((item) => item.code === 'STACK_TARGET_PARAMETERS_MISSING'));
  assert.match(result.narrative, /未进行目标符合性判定/);
  const workbook = buildEnterpriseWorkbook(result, 'stack-inferred.csv');
  assert.ok(workbook.SheetNames.includes('描述性候选区间'));
});

test('keeps stack platforms and stable intervals inside their source sessions', () => {
  const rows = [
    { 时间: '00:00:00', 电堆电压: 1.4, 电堆电流: 10, 电堆功率: 0.014, 平均电压: 0.7, CELL1: 0.69, CELL2: 0.71, session_id: 'file:a.csv', source_file: 'a.csv' },
    { 时间: '00:03:00', 电堆电压: 1.4, 电堆电流: 10, 电堆功率: 0.014, 平均电压: 0.7, CELL1: 0.69, CELL2: 0.71, session_id: 'file:a.csv', source_file: 'a.csv' },
    { 时间: '00:00:00', 电堆电压: 1.4, 电堆电流: 10, 电堆功率: 0.014, 平均电压: 0.7, CELL1: 0.69, CELL2: 0.71, session_id: 'file:b.csv', source_file: 'b.csv' },
    { 时间: '00:03:00', 电堆电压: 1.4, 电堆电流: 10, 电堆功率: 0.014, 平均电压: 0.7, CELL1: 0.69, CELL2: 0.71, session_id: 'file:b.csv', source_file: 'b.csv' }
  ];
  const result = analyzeRows(rows, { parameterConfig: { ok: true, targetConditions: [{ conditionId: 'I-10', targetCurrentA: 10 }], parameterRules: [], parameters: [] } });
  assert.equal(result.datasetType, 'stack');
  assert.equal(result.dataset.sessionCount, 2);
  assert.equal(result.dataset.platforms.length, 2);
  assert.equal(result.dataset.performancePoints.length, 2);
  assert.deepEqual(result.dataset.performancePoints.map((point) => point.platformId), ['I-10-1', 'I-10-2']);
  assert.ok(result.issues.some((issue) => issue.code === 'STACK_SESSIONS_PRESERVED'));
});

test('blocks an enterprise profile when its approved dataset scope does not match the uploaded stack data', () => {
  const rows = parseCSV([
    '时间,电堆电压,电堆电流,电堆功率,平均电压,CELL1,CELL2',
    '00:00:00,1.4,10,0.014,0.7,0.69,0.71',
    '00:00:01,1.4,10,0.014,0.7,0.69,0.71'
  ].join('\n'));
  const result = analyzeRows(rows, { supportedDatasetTypes: ['vehicle'] });
  assert.equal(result.verdict, 'FAIL');
  assert.equal(result.workflow.status, 'BLOCKED_PROFILE_SCOPE');
  assert.ok(result.issues.some((item) => item.code === 'DATASET_PROFILE_MISMATCH'));
});

test('example PEM profile fails closed on enterprise stack and vehicle datasets', () => {
  const profile = profilesFromPackage(enterpriseProfilePayload).profiles[0];
  const stack = analyzeRows(parseCSV([
    '时间,电堆电压,电堆电流,电堆功率,平均电压,CELL1,CELL2',
    '00:00:00,1.4,10,0.014,0.7,0.69,0.71',
    '00:00:01,1.4,10,0.014,0.7,0.69,0.71'
  ].join('\n')), { supportedDatasetTypes: profile.supportedDatasetTypes });
  const vehicle = analyzeRows(parseCSV([
    'Timestamp,FC_MainSts,FC_CurrOut,FC_VoltOut,FC_NetPwrOut,FC_MinCellVoltage,FC_MinVoltageChannel,FC_AvgCellVoltage,FC_AvgCellDev,FC_VARVoltage,FC_VehicleIsolationR,FC_RunTime_Hours',
    '2026-07-07 18:20:52,8,95,320,30,0.61,3,0.68,8,12,480,1',
    '2026-07-07 18:23:52,4,95,320,31,0.60,3,0.67,9,13,340,1'
  ].join('\n')), { supportedDatasetTypes: profile.supportedDatasetTypes });
  for (const result of [stack, vehicle]) {
    assert.equal(result.workflow.status, 'BLOCKED_PROFILE_SCOPE');
    assert.equal(result.verdict, 'FAIL');
    assert.ok(result.issues.some((item) => item.code === 'DATASET_PROFILE_MISMATCH'));
  }
});

test('reads parameter and target-condition workbooks by header code, computes a stable interval, and writes an auditable workbook', () => {
  const inputBook = SheetJS.utils.book_new();
  SheetJS.utils.book_append_sheet(inputBook, SheetJS.utils.aoa_to_sheet([
    ['参数代码', '参数名称', '启用', '基准来源', '目标值', '下偏差', '上偏差', '单位', '连续时间/s', '必需', '标准字段'],
    ['CURRENT', '实测电流', '是', '目标工况表', '', -1, 1, 'A', 60, '是', 'current_a']
  ]), '数据处理设定参数');
  SheetJS.utils.book_append_sheet(inputBook, SheetJS.utils.aoa_to_sheet([
    ['工况编号', '目标电流', '目标电流密度'],
    ['I-10', 10, 100]
  ]), '目标工况设定');
  const parsed = parseParameterWorkbook(SheetJS.write(inputBook, { type: 'buffer', bookType: 'xlsx' }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.targetConditions[0].targetCurrentA, 10);
  assert.equal(parsed.parameterRules[0].code, 'CURRENT');
  const rows = parseCSV([
    '时间,电堆电压,电堆电流,电堆功率,平均电压,CELL1,CELL2',
    ...Array.from({ length: 61 }, (_, index) => `${index},1.4,10,0.014,0.7,0.69,0.71`)
  ].join('\n'));
  const result = analyzeRows(rows, { parameterConfig: parsed, samplePeriodS: 1, minimumPlatformS: 60, minimumStableS: 60 });
  assert.equal(result.datasetType, 'stack');
  assert.equal(result.dataset.platforms.length, 1);
  assert.equal(result.dataset.performancePoints.length, 1);
  assert.equal(result.dataset.performancePoints[0].status, 'short_stable');
  assert.equal(result.dataset.performancePoints[0].selectedDurationS, 60);
  const output = buildEnterpriseWorkbook(result, 'stack.csv', { parameterConfig: parsed });
  assert.ok(output.SheetNames.includes('目标工况对比'));
  const comparison = output.Sheets['目标工况对比'];
  assert.equal(comparison.D2.f, 'C2-B2');
  assert.ok(workbookArrayBuffer(output).byteLength > 1000);
});

test('blocks formal stack points when timestamp quality is invalid', () => {
  const parameterConfig = {
    ok: true,
    parameters: [{ code: 'MIN_CURRENT_PLATFORM_TIME', target: 1 }, { code: 'MIN_STABLE_TIME', target: 1 }, { code: 'DEFAULT_SAMPLE_TIME', target: 1 }],
    parameterRules: [{ code: 'CURRENT', enabled: true, field: 'current_a', target: null, lowerTolerance: -1, upperTolerance: 1 }],
    targetConditions: [{ conditionId: 'I-10', targetCurrentA: 10 }]
  };
  const result = analyzeRows(parseCSV([
    '时间,电堆电压,电堆电流,电堆功率,平均电压,CELL1,CELL2',
    '0,1.4,10,0.014,0.7,0.69,0.71',
    '2,1.4,10,0.014,0.7,0.69,0.71',
    '1,1.4,10,0.014,0.7,0.69,0.71'
  ].join('\n')), { parameterConfig, samplePeriodS: 1 });
  assert.equal(result.dataset.performancePoints.length, 0);
  assert.ok(result.issues.some((issue) => issue.code === 'STACK_DATA_QUALITY_BLOCKS_POINTS'));
  assert.equal(result.verdict, 'FAIL');
});

test('disambiguates repeated current conditions using enabled target fields', () => {
  const parameterConfig = {
    ok: true,
    parameters: [{ code: 'MIN_CURRENT_PLATFORM_TIME', target: 60 }, { code: 'MIN_STABLE_TIME', target: 60 }, { code: 'DEFAULT_SAMPLE_TIME', target: 60 }],
    parameterRules: [
      { code: 'CURRENT', enabled: true, field: 'current_a', target: null, lowerTolerance: -1, upperTolerance: 1 },
      { code: 'H2_FLOW', enabled: true, field: 'anode_flow_slpm', target: null, lowerTolerance: -0.1, upperTolerance: 0.1 }
    ],
    targetConditions: [{ conditionId: 'I-10-A', targetCurrentA: 10, h2Flow: 2 }, { conditionId: 'I-10-B', targetCurrentA: 10, h2Flow: 3 }]
  };
  const rows = parseCSV([
    '时间,电堆电压,电堆电流,电堆功率,平均电压,CELL1,CELL2,阳极流量（SLPM）',
    ...Array.from({ length: 61 }, (_, index) => `${index},1.4,10,0.014,0.7,0.69,0.71,3`)
  ].join('\n'));
  const result = analyzeRows(rows, { parameterConfig, samplePeriodS: 1 });
  assert.equal(result.dataset.performancePoints.length, 1);
  assert.equal(result.dataset.performancePoints[0].conditionId, 'I-10-B');
});

test('exports per-cell time-series statistics and excluded stable-interval evidence', () => {
  const parameterConfig = {
    ok: true,
    parameters: [{ code: 'MIN_CURRENT_PLATFORM_TIME', target: 1 }, { code: 'MIN_STABLE_TIME', target: 1 }, { code: 'DEFAULT_SAMPLE_TIME', target: 1 }],
    parameterRules: [
      { code: 'CURRENT', enabled: true, field: 'current_a', target: null, lowerTolerance: -1, upperTolerance: 1 },
      { code: 'H2_FLOW', enabled: true, field: 'anode_flow_slpm', target: null, lowerTolerance: -0.1, upperTolerance: 0.1 }
    ],
    targetConditions: [{ conditionId: 'I-10', targetCurrentA: 10, h2Flow: 2 }]
  };
  const result = analyzeRows(parseCSV([
    '时间,电堆电压,电堆电流,电堆功率,平均电压,CELL1,CELL2,阳极流量（SLPM）',
    '0,1.4,10,0.014,0.7,0.69,0.71,2',
    '1,1.4,10,0.014,0.7,0.69,0.71,2',
    '2,1.4,10,0.014,0.7,0.69,0.71,5',
    '3,1.4,10,0.014,0.7,0.68,0.72,2'
  ].join('\n')), { parameterConfig, samplePeriodS: 1 });
  assert.equal(result.dataset.cellTimeSeriesStats.length, 2);
  assert.equal(result.dataset.cellTimeSeriesStats[0].count, 4);
  assert.ok(result.dataset.excludedIntervals.some((item) => item.reasonCode === 'OUT_OF_TOLERANCE'));
  assert.match(reportMarkdown(result, 'stack-evidence.csv'), /原始电堆单片时序统计/);
  assert.match(reportMarkdown(result, 'stack-evidence.csv'), /稳定区间排除证据/);
  const workbook = buildEnterpriseWorkbook(result, 'stack-evidence.csv', { parameterConfig });
  assert.ok(workbook.SheetNames.includes('单片时序统计'));
  assert.ok(workbook.SheetNames.includes('排除区间'));
});

test('parameter-workbook formula audit blocks acceptance until review evidence is supplied', () => {
  const parameterConfig = {
    ok: true,
    parameterSheet: '数据处理设定参数',
    targetSheet: '目标工况设定',
    parameters: [],
    parameterRules: [],
    targetConditions: [],
    formulaAudit: { status: 'review_required', formulaCellCount: 2, cachedFormulaCellCount: 2, uncachedFormulaCellCount: 0, macroPresent: false, externalLinksPresent: false, activeContentPresent: false }
  };
  const result = analyzeRows(parseCSV([
    '时间,电堆电压,电堆电流,电堆功率,平均电压,CELL1,CELL2',
    '0,1.4,10,0.014,0.7,0.69,0.71',
    '1,1.4,10,0.014,0.7,0.69,0.71'
  ].join('\n')), { evaluationMode: 'acceptance', parameterConfig });
  assert.ok(result.issues.some((item) => item.code === 'WORKBOOK_FORMULA_REVIEW_MISSING'));
  assert.equal(result.releaseGate.workbookFormulaReview.ready, false);
  assert.ok(result.releaseGate.blockedReasons.includes('workbookFormulaReview'));
});

test('allows a settings-only workbook to run configurable relative-stability screening without target conformity', () => {
  const inputBook = SheetJS.utils.book_new();
  SheetJS.utils.book_append_sheet(inputBook, SheetJS.utils.aoa_to_sheet([
    ['参数代码', '参数名称', '启用', '基准来源', '目标值', '下偏差', '上偏差', '单位', '连续时间/s', '必需', '标准字段'],
    ['CURRENT', '实测电流', '是', '目标工况表', '', -1, 1, 'A', 60, '是', 'current_a']
  ]), '数据处理设定参数');
  const parsed = parseParameterWorkbook(SheetJS.write(inputBook, { type: 'buffer', bookType: 'xlsx' }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.analysisMode, 'relative_stability');
  assert.equal(parsed.targetConditions.length, 0);
  assert.ok(parsed.warnings.some((warning) => warning.includes('相对稳定性')));
  const rows = parseCSV([
    '时间,电堆电压,电堆电流,电堆功率,平均电压,CELL1,CELL2',
    ...Array.from({ length: 61 }, (_, index) => `${index},1.4,10,0.014,0.7,0.69,0.71`)
  ].join('\n'));
  const result = analyzeRows(rows, { parameterConfig: parsed, samplePeriodS: 1 });
  assert.equal(result.verdict, 'WARN');
  assert.equal(result.dataset.performancePoints.length, 0);
  assert.equal(result.dataset.relativeStability.center, 'mean');
  assert.equal(result.dataset.relativeStability.windowS, 60);
  assert.equal(result.dataset.inferredSegments.length, 1);
  assert.equal(result.dataset.inferredSegments[0].relativeStability.checks[0].status, 'stable');
  assert.ok(result.issues.some((issue) => issue.code === 'STACK_TARGET_PARAMETERS_MISSING'));
  assert.match(reportMarkdown(result, 'stack-relative.csv'), /相对稳定性描述筛选/);
  const workbook = buildEnterpriseWorkbook(result, 'stack-relative.csv', { parameterConfig: parsed });
  assert.ok(workbook.SheetNames.includes('相对稳定性设置'));
  assert.ok(workbook.SheetNames.includes('描述性候选区间'));
});

test('retains per-parameter target conformity evidence for the selected stable interval', () => {
  const parameterConfig = {
    ok: true,
    parameters: [
      { code: 'CURRENT', enabled: true, field: 'current_a', target: null, lowerTolerance: -1, upperTolerance: 1 },
      { code: 'COOLANT_DT', enabled: true, field: 'coolant_temperature_difference_c', target: null, lowerTolerance: -0.1, upperTolerance: 0.1 },
      { code: 'H2_FLOW', enabled: true, field: 'anode_flow_slpm', target: null, lowerTolerance: -0.1, upperTolerance: 0.1 },
      { code: 'COOLANT_DT', enabled: true, field: 'coolant_temperature_difference_c', target: null, lowerTolerance: -0.2, upperTolerance: 0.2 },
      { code: 'MIN_CURRENT_PLATFORM_TIME', target: 60 },
      { code: 'MIN_STABLE_TIME', target: 60 },
      { code: 'DEFAULT_SAMPLE_TIME', target: 120 },
      { code: 'SAMPLE_POSITION', rawValue: '稳定区间末端', target: null }
    ],
    parameterRules: [
      { code: 'CURRENT', enabled: true, field: 'current_a', target: null, lowerTolerance: -1, upperTolerance: 1 },
      { code: 'H2_FLOW', enabled: true, field: 'anode_flow_slpm', target: null, lowerTolerance: -0.1, upperTolerance: 0.1 },
      { code: 'COOLANT_DT', enabled: true, field: 'coolant_temperature_difference_c', target: null, lowerTolerance: -0.2, upperTolerance: 0.2 }
    ],
    targetConditions: [{ conditionId: 'I-10', targetCurrentA: 10, h2Flow: 2, coolantDt: 5 }]
  };
  const rows = parseCSV([
    '时间,电堆电压,电堆电流,电堆功率,平均电压,CELL1,CELL2,阳极流量（SLPM）,循环水入堆温度（℃）,循环水出堆温度（℃）',
    ...Array.from({ length: 61 }, (_, index) => `${index},1.4,10,0.014,0.7,0.69,0.71,2,60,65`)
  ].join('\n'));
  const result = analyzeRows(rows, { parameterConfig, samplePeriodS: 1, minimumPlatformS: 60, minimumStableS: 60 });
  const comparisons = result.dataset.performancePoints[0].parameterComparisons;
  assert.equal(comparisons.find((item) => item.code === 'H2_FLOW').actualMean, 2);
  assert.equal(comparisons.find((item) => item.code === 'H2_FLOW').status, 'normal');
  assert.equal(comparisons.find((item) => item.code === 'COOLANT_DT').absoluteDeviation, 0);
  const workbook = buildEnterpriseWorkbook(result, 'stack.csv', { parameterConfig });
  const comparison = workbook.Sheets['目标工况对比'];
  assert.equal(comparison['G2'].v, 'CURRENT');
  assert.match(comparison['F2'].f, /AND\(C2>=B2\+I2/);
  assert.match(reportMarkdown(result, 'stack.csv'), /目标工况对比/);
});

test('derives hydrogen and air stoichiometry with traceable physical constants when flows are present', () => {
  const result = analyzeRows(parseCSV([
    '时间,电堆电压,电堆电流,电堆功率,平均电压,CELL1,CELL2,阳极流量（SLPM）,阴极流量（SLPM）',
    '00:00:00,1.4,10,0.014,0.7,0.69,0.71,0.14,0.33',
    '00:00:01,1.4,10,0.014,0.7,0.69,0.71,0.14,0.33'
  ].join('\n')));
  assert.equal(result.dataset.stoich.status, 'calculated_or_raw');
  assert.ok(result.dataset.metrics.hydrogenStoich.mean > 1);
  assert.ok(Math.abs(result.dataset.metrics.airStoich.mean - 1) < 0.02);
  assert.match(result.dataset.sourceFieldMap.h2_stoich, /计算/);
});

test('blocks stack stoichiometry when gas flow headers declare actual L/min', () => {
  const result = analyzeRows(parseCSV([
    '时间,电堆电压,电堆电流,电堆功率,平均电压,CELL1,阳极气体流量(L/Min),阴极气体流量(L/Min)',
    '00:00:00,1.4,10,0.014,0.7,0.69,60,120',
    '00:00:01,1.4,10,0.014,0.7,0.69,60,120'
  ].join('\n')));
  assert.equal(result.quality.usable, false);
  assert.equal(result.rows[0].anode_flow_slpm, null);
  assert.equal(result.rows[0].cathode_flow_slpm, null);
  assert.equal(result.dataset.metrics.hydrogenStoich.mean, null);
  assert.equal(result.dataset.metrics.airStoich.mean, null);
  assert.ok(result.issues.some((item) => item.code === 'UNIT_UNSUPPORTED' && /anode_flow_slpm/.test(item.evidence)));
});

test('blocks stack stoichiometry when gas flow headers omit standard-state units', () => {
  const result = analyzeRows(parseCSV([
    '时间,电堆电压,电堆电流,电堆功率,平均电压,CELL1,阳极气体流量,阴极气体流量',
    '00:00:00,1.4,10,0.014,0.7,0.69,60,120',
    '00:00:01,1.4,10,0.014,0.7,0.69,60,120'
  ].join('\n')));
  assert.equal(result.quality.usable, false);
  assert.equal(result.rows[0].anode_flow_slpm, null);
  assert.equal(result.rows[0].cathode_flow_slpm, null);
  assert.equal(result.dataset.metrics.hydrogenStoich.mean, null);
  assert.ok(result.issues.some((item) => item.code === 'UNIT_UNSUPPORTED' && /单位未声明/.test(item.evidence)));
});

test('keeps repeated current platforms separate and uses the terminal 120-second window for long stable runs', () => {
  const parameterConfig = {
    ok: true,
    parameters: [
      { code: 'CURRENT', rawValue: '', target: null },
      { code: 'MIN_CURRENT_PLATFORM_TIME', rawValue: '60', target: 60 },
      { code: 'MIN_STABLE_TIME', rawValue: '60', target: 60 },
      { code: 'DEFAULT_SAMPLE_TIME', rawValue: '120', target: 120 },
      { code: 'SAMPLE_POSITION', rawValue: '稳定区间末端', target: null }
    ],
    parameterRules: [{ code: 'CURRENT', enabled: true, field: 'current_a', target: null, lowerTolerance: -1, upperTolerance: 1 }],
    targetConditions: [{ conditionId: 'I-10', targetCurrentA: 10 }]
  };
  const rows = parseCSV([
    '时间,电堆电压,电堆电流,电堆功率,平均电压,CELL1,CELL2',
    ...Array.from({ length: 121 }, (_, index) => `${index},1.4,10,${index},0.7,0.69,0.71`),
    '121,1.4,0,0,0.7,0.69,0.71',
    ...Array.from({ length: 121 }, (_, index) => `${122 + index},1.4,10,${200 + index},0.8,0.79,0.81`)
  ].join('\n'));
  const result = analyzeRows(rows, { parameterConfig, samplePeriodS: 1, minimumPlatformS: 60, minimumStableS: 60 });
  assert.equal(result.dataset.platforms.length, 2);
  assert.deepEqual(result.dataset.platforms.map((platform) => platform.platformId), ['I-10-1', 'I-10-2']);
  assert.equal(result.dataset.performancePoints.length, 2);
  assert.deepEqual(result.dataset.performancePoints.map((point) => point.selectedDurationS), [120, 120]);
  assert.deepEqual(result.dataset.performancePoints.map((point) => point.selectionPolicy), ['末端120s', '末端120s']);
});

test('allows a manual stable-interval override and preserves automatic/manual audit evidence', () => {
  const parameterConfig = {
    ok: true,
    parameters: [
      { code: 'CURRENT', enabled: true, field: 'current_a', target: null, lowerTolerance: -1, upperTolerance: 1 },
      { code: 'MIN_CURRENT_PLATFORM_TIME', target: 60 },
      { code: 'MIN_STABLE_TIME', target: 60 },
      { code: 'DEFAULT_SAMPLE_TIME', target: 60 },
      { code: 'SAMPLE_POSITION', rawValue: '稳定区间末端', target: null }
    ],
    parameterRules: [
      { code: 'CURRENT', enabled: true, field: 'current_a', target: null, lowerTolerance: -1, upperTolerance: 1 },
      { code: 'COOLANT_DT', enabled: true, field: 'coolant_temperature_difference_c', target: null, lowerTolerance: -0.1, upperTolerance: 0.1 }
    ],
    targetConditions: [{ conditionId: 'I-10', targetCurrentA: 10, coolantDt: 5 }]
  };
  const rows = parseCSV([
    '时间,电堆电压,电堆电流,电堆功率,平均电压,CELL1,CELL2,循环水入堆温度（℃）,循环水出堆温度（℃）',
    ...Array.from({ length: 61 }, (_, index) => `${index},1.4,10,0.014,0.70,0.69,0.71,60,65`),
    '61,1.4,10,0.014,0.70,0.69,0.71,60,100',
    ...Array.from({ length: 61 }, (_, index) => `${62 + index},1.4,10,0.014,0.72,0.71,0.73,60,65`)
  ].join('\n'));
  const automatic = analyzeRows(rows, { parameterConfig, samplePeriodS: 1, minimumPlatformS: 60, minimumStableS: 60 });
  assert.equal(automatic.dataset.selectionAudit[0].selectionMode, 'automatic');
  assert.equal(automatic.dataset.selectionAudit[0].automaticSegmentId, 'I-10-1:stable-2');
  assert.equal(automatic.dataset.performancePoints[0].segmentId, 'I-10-1:stable-2');
  const manual = analyzeRows(rows, { parameterConfig, samplePeriodS: 1, minimumPlatformS: 60, minimumStableS: 60, stackSelectionOverrides: { 'I-10-1': 'I-10-1:stable-1' } });
  assert.equal(manual.dataset.selectionAudit[0].selectionMode, 'manual');
  assert.equal(manual.dataset.selectionAudit[0].automaticSegmentId, 'I-10-1:stable-2');
  assert.equal(manual.dataset.selectionAudit[0].requestedSegmentId, 'I-10-1:stable-1');
  assert.equal(manual.dataset.performancePoints[0].segmentId, 'I-10-1:stable-1');
  assert.equal(manual.dataset.stableSegments.find((segment) => segment.segmentId === 'I-10-1:stable-1').selectedBy, 'manual');
  assert.match(manual.narrative, /人工改选 1 个平台/);
  const invalid = analyzeRows(rows, { parameterConfig, samplePeriodS: 1, minimumPlatformS: 60, minimumStableS: 60, stackSelectionOverrides: { 'I-10-1': 'I-10-1:stable-999' } });
  assert.equal(invalid.dataset.performancePoints[0].segmentId, 'I-10-1:stable-2');
  assert.ok(invalid.issues.some((issue) => issue.code === 'STACK_SELECTION_OVERRIDE_INVALID'));
});

test('derives fuel-cell stack flow resistance and coolant temperature difference from mapped raw channels', () => {
  const rows = parseCSV([
    '时间,电堆电压,电堆电流,电堆功率,平均电压,CELL1,CELL2,阳极入堆压力（kPa）,阳极出堆压力（kPa）,阴极入堆压力（kPa）,阴极出堆压力（kPa）,循环水入堆压力（kPa）,循环水出堆压力（kPa）,循环水入堆温度（℃）,循环水出堆温度（℃）',
    '00:00:00,1.4,10,0.014,0.7,0.69,0.71,150,140,160,150,120,110,60,65',
    '00:00:01,1.4,10,0.014,0.7,0.69,0.71,151,141,161,151,121,111,60,65'
  ].join('\n'));
  const result = analyzeRows(rows);
  assert.equal(result.datasetType, 'stack');
  assert.equal(result.dataset.metrics.anodeFlowResistanceKpa.mean, 10);
  assert.equal(result.dataset.metrics.cathodeFlowResistanceKpa.mean, 10);
  assert.equal(result.dataset.metrics.coolantFlowResistanceKpa.mean, 10);
  assert.equal(result.dataset.metrics.coolantTemperatureDifferenceC.mean, 5);
  assert.match(result.dataset.sourceFieldMap.anode_flow_resistance_kpa, /计算/);
});

test('keeps humidifier water temperatures distinct from true dewpoint fields and summarizes coolant conductivity', () => {
  const result = analyzeRows(parseCSV([
    '时间,电堆电压,电堆电流,电堆功率,平均电压,CELL1,CELL2,阳极增湿罐水温度（℃）,阴极增湿罐水温度（℃）,循环水电导率（μS/cm）',
    '00:00:00,1.4,10,0.014,0.7,0.69,0.71,51.2,43.1,0.8',
    '00:00:01,1.4,10,0.014,0.7,0.69,0.71,51.4,43.3,1.2'
  ].join('\n')));
  assert.equal(result.dataset.metrics.h2DewpointC.count, 0);
  assert.equal(result.dataset.metrics.airDewpointC.count, 0);
  assert.equal(result.dataset.metrics.h2HumidifierWaterTemperatureC.mean, 51.3);
  assert.equal(result.dataset.metrics.airHumidifierWaterTemperatureC.mean, 43.2);
  assert.equal(result.dataset.metrics.coolantConductivityUsCm.mean, 1);
  assert.equal(result.dataset.sourceFieldMap.h2_dewpoint_c, null);
  assert.match(result.dataset.sourceFieldMap.h2_humidifier_water_temp_c, /增湿罐水温度/);
  assert.match(reportMarkdown(result, 'stack-humidity.csv'), /增湿罐水温/);
  const workbook = buildEnterpriseWorkbook(result, 'stack-humidity.csv');
  assert.ok(workbook.SheetNames.includes('工程量摘要'));
  assert.equal(workbook.Sheets['工程量摘要']['A6'].v, '循环水电导率');
});

test('retains the 127-column stack contract with setpoint and feedback evidence layers', () => {
  const headers = [
    '测试时间', '阳极入堆压力设定值（kPa）', '阳极入堆压力（kPa）', '阳极出堆压力设定值（kPa）', '阳极出堆压力（kPa）',
    '阳极入堆温度设定值（℃）', '阳极入堆温度（℃）', '阳极流量设定值（SLPM）', '阳极流量（SLPM）',
    '阴极入堆压力设定值（kPa）', '阴极入堆压力（kPa）', '阴极出堆压力设定值（kPa）', '阴极出堆压力（kPa）',
    '阴极入堆温度设定值（℃）', '阴极入堆温度（℃）', '阴极流量设定值（SLPM）', '阴极流量（SLPM）',
    '循环水入堆压力（kPa）', '循环水出堆压力（kPa）', '循环水入堆温度设定值（℃）', '循环水入堆温度（℃）', '循环水出堆温度（℃）',
    '循环水流量设定值（L/min）', '循环水流量（L/min）', '电压设定值（V）', '实际电压（V）', '电流设定值（A）', '实际电流（A）',
    '电流密度设定值（mA/cm2）', '电流密度（mA/cm2）', '功率（kW)', '总电压（V）', '平均电压（V）', '最大电压（V）', '最大电压位置', '最小电压（V）', '最小电压位置', '极差（mV）', '离均差（mV）', '标准差（mV）', '片数',
    ...Array.from({ length: 40 }, (_, index) => `单片电压${index + 1}（V）`),
    '阳极总进气阀反馈', '阳极干路阀反馈', '阳极湿路阀反馈', '阳极增湿出口阀反馈', '阳极喷淋泵反馈', '阳极脉冲阀反馈', '阳极尾排排水阀反馈', '阳极增湿罐加热反馈', '阳极增湿罐上端伴热反馈', '阳极入堆伴热反馈',
    ...Array.from({ length: 36 }, (_, index) => `扩展字段${index + 1}`)
  ];
  assert.equal(headers.length, 127);
  const row = (second) => headers.map((header, index) => {
    if (index === 0) return `00:00:0${second}`;
    if (header.includes('反馈')) return second % 2 ? '1' : '0';
    if (header.includes('电流密度')) return '100';
    if (header.includes('电流')) return '10';
    if (header.includes('功率')) return '0.014';
    if (header.includes('电压')) return header.includes('设定') ? '1.4' : '0.7';
    if (header.includes('压力')) return header.includes('设定') ? '150' : '140';
    if (header.includes('流量')) return header.includes('设定') ? '2' : '2.1';
    if (header.includes('温度')) return header.includes('设定') ? '60' : '61';
    if (header.includes('片数')) return '40';
    return String(index);
  }).join(',');
  const result = analyzeRows(parseCSV([headers.join(','), row(0), row(1)].join('\n')));
  assert.equal(result.datasetType, 'stack');
  assert.equal(result.dataset.signalCatalog.length, 127);
  assert.equal(result.dataset.cellChannelCount, 40);
  assert.ok(result.dataset.coverage.analysisSignals > 40);
  assert.equal(result.dataset.coverage.totalSignals, 127);
  assert.equal(result.dataset.coverage.numericSignals + result.dataset.coverage.nonNumericSignals, 127);
  assert.ok(result.dataset.signalCatalog.every((signal) => Object.hasOwn(signal, 'std')));
  assert.equal(result.dataset.settingCrossChecks.length, 13);
  assert.equal(result.dataset.feedbackSignals.length, 10);
  assert.ok(result.dataset.settingCrossChecks.every((item) => item.deviation.count === 2));
  assert.match(reportMarkdown(result, 'stack-full.csv'), /阀\/泵反馈摘要/);
  const workbook = buildEnterpriseWorkbook(result, 'stack-full.csv');
  assert.ok(workbook.SheetNames.includes('电堆字段覆盖'));
  assert.ok(workbook.SheetNames.includes('设定实测核对'));
  assert.equal(workbook.Sheets['电堆字段覆盖']['J1'].v, '标准差');
});

test('fails closed when required parameter targets or repeated-current condition identifiers are incomplete', () => {
  const makeBook = (parameterRows, targetRows) => {
    const book = SheetJS.utils.book_new();
    SheetJS.utils.book_append_sheet(book, SheetJS.utils.aoa_to_sheet(parameterRows), '数据处理设定参数');
    SheetJS.utils.book_append_sheet(book, SheetJS.utils.aoa_to_sheet(targetRows), '目标工况设定');
    return parseParameterWorkbook(SheetJS.write(book, { type: 'buffer', bookType: 'xlsx' }));
  };
  const headers = ['参数代码', '参数名称', '启用', '基准来源', '目标值', '下偏差', '上偏差', '单位', '连续时间/s', '必需', '标准字段'];
  const fixedMissing = makeBook([headers, ['H2_IN_PRESS', '氢气入口压力', '是', '', '', -1, 1, 'kPa.g', 60, '是', 'pressure_kpa']], [['工况编号', '目标电流'], ['I-10', 10]]);
  assert.equal(fixedMissing.ok, false);
  assert.ok(fixedMissing.errors.some((error) => error.includes('没有固定目标值')));
  const targetMissing = makeBook([headers, ['H2_IN_PRESS', '氢气入口压力', '是', '目标工况表', '', -1, 1, 'kPa.g', 60, '是', 'pressure_kpa']], [['工况编号', '目标电流'], ['I-10', 10]]);
  assert.equal(targetMissing.ok, false);
  assert.ok(targetMissing.errors.some((error) => error.includes('缺少目标值')));
  const repeatedWithoutId = makeBook([headers, ['CURRENT', '实测电流', '是', '目标工况表', '', -1, 1, 'A', 60, '是', 'current_a']], [['目标电流'], [10], [10]]);
  assert.equal(repeatedWithoutId.ok, false);
  assert.ok(repeatedWithoutId.errors.some((error) => error.includes('工况编号')));
});

test('reads raw time-series XLSX workbooks by the best signal sheet and keeps stack-level-only files explicit', () => {
  const book = SheetJS.utils.book_new();
  SheetJS.utils.book_append_sheet(book, SheetJS.utils.aoa_to_sheet([
    ['备注'], ['不是时序表']
  ]), '说明');
  SheetJS.utils.book_append_sheet(book, SheetJS.utils.aoa_to_sheet([
    ['时间', '电堆电压', '电堆电流', ''],
    ['00:00:00', 1.4, 10, ''],
    ['00:00:01', 1.39, 10, '']
  ]), '稳定性');
  const parsed = parseDataWorkbook(SheetJS.write(book, { type: 'buffer', bookType: 'xlsx' }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.sheetName, '稳定性');
  assert.ok(parsed.rows.every((row) => !Object.hasOwn(row, '')));
  const result = analyzeRows(parsed.rows);
  assert.equal(result.datasetType, 'stack');
  assert.equal(result.dataset.cellChannelCount, 0);
  assert.ok(result.issues.some((item) => item.code === 'STACK_CELL_CHANNELS_MISSING'));
  const parameterBook = SheetJS.utils.book_new();
  SheetJS.utils.book_append_sheet(parameterBook, SheetJS.utils.aoa_to_sheet([['参数代码'], ['CURRENT']]), '数据处理设定参数');
  SheetJS.utils.book_append_sheet(parameterBook, SheetJS.utils.aoa_to_sheet([['工况编号', '目标电流'], ['I-10', 10]]), '目标工况设定');
  const rejected = parseDataWorkbook(SheetJS.write(parameterBook, { type: 'buffer', bookType: 'xlsx' }));
  assert.equal(rejected.ok, false);
  assert.match(rejected.errors[0], /参数工作簿/);
});

test('uses every structured sheet in an enterprise XLSX and keeps workbook evidence bounded in public output', () => {
  const book = SheetJS.utils.book_new();
  SheetJS.utils.book_append_sheet(book, SheetJS.utils.aoa_to_sheet([
    ['产品型号', 'M200-VID', '电堆编号', 'VI-D-299-001-D'],
    ['性能检测项目'],
    ['检测项目名称', '标准', '测试结果', '是否合格'],
    ['1、气密性', '≤ 1 mL/min', '0.2', '是'],
    ['图1：'],
    ['电流密度', '电堆电压', '电堆电流', '电堆功率'],
    [0.3, 245.2, 127.5, 31.3],
    ['OCV', '怠速电流', '中间点', '额定电流'],
    ['单片电压平均值(V)', 0.94, 0.82, 0.703]
  ]), '电堆出厂功能检测报告（打印）');
  SheetJS.utils.book_append_sheet(book, SheetJS.utils.aoa_to_sheet([
    ['时间', '电堆电压', '电堆电流'],
    ['00:00:00', 280.2, 3.9],
    ['00:00:01', 279.9, 4]
  ]), '稳定性');
  SheetJS.utils.book_append_sheet(book, SheetJS.utils.aoa_to_sheet([['BD测试'], ['VI-D-299-001-D']]), 'BD');
  const matrixHeaders = Array.from({ length: 10 }, (_, index) => String(index + 1));
  for (const [name, value] of [['OCV', 0.94], ['0.3电密', 0.82], ['1.7电密', 0.703], ['2.5电密', 0.638]]) {
    const first = matrixHeaders.map((_, index) => value - index * 0.001);
    const second = matrixHeaders.map((_, index) => index === 4 ? '' : value - index * 0.001);
    SheetJS.utils.book_append_sheet(book, SheetJS.utils.aoa_to_sheet([matrixHeaders, first, second]), name);
  }
  SheetJS.utils.book_append_sheet(book, SheetJS.utils.aoa_to_sheet([
    ['产品序号\n参数名称', '', ''],
    ['标称额定功率（KW）', 150, 128],
    ['平均单片电压', '≥0.65V', '≥0.645V']
  ]), '电堆参数库');
  const parsed = parseDataWorkbook(SheetJS.write(book, { type: 'buffer', bookType: 'xlsx' }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.workbookEvidenceSummary.sheetCount, 8);
  assert.equal(parsed.workbookEvidenceSummary.parsedSheetCount, 8);
  assert.equal(parsed.workbookEvidenceSummary.staticMatrixCount, 4);
  assert.equal(parsed.workbookEvidenceSummary.staticMatrixCellCount, 40);
  assert.equal(parsed.workbookEvidenceSummary.reportEvidenceSheetCount, 1);
  assert.equal(parsed.workbookEvidenceSummary.reportPerformanceCheckCount, 1);
  assert.equal(parsed.workbookEvidence.reportEvidence.performanceChecks.records[0].measuredValues.length, 1);
  assert.equal(Number(parsed.workbookEvidence.reportEvidence.performanceChecks.records[0].measuredValues[0]), 0.2);
  assert.equal(parsed.workbookEvidence.reportEvidence.performanceChecks.records[0].measured, 0.2);
  assert.equal(parsed.workbookEvidence.reportEvidence.performanceChecks.records[0].outcome, '是');
  assert.equal(parsed.workbookEvidenceSummary.deviceIdentityFieldCount, 2);
  assert.equal(parsed.workbookEvidenceSummary.parameterCatalogRowCount, 2);
  const result = analyzeRows(parsed.rows, { workbookEvidence: parsed.workbookEvidence });
  assert.equal(result.dataset.workbookEvidence.summary.staticMatrixValidPointCount, 76);
  const safe = publicAnalysis(result);
  assert.equal(JSON.stringify(safe).includes('VI-D-299-001-D'), false);
  assert.match(reportMarkdown(result, 'enterprise.xlsx'), /原始 XLSX 工作表证据摘要/);
  const reportWorkbook = buildEnterpriseWorkbook(result, 'enterprise.xlsx');
  for (const sheetName of ['工作表证据审计', '单片矩阵摘要', '单片逐片统计', '出厂报告元数据', '出厂检测项目', 'BD身份证据', '电堆参数目录']) assert.ok(reportWorkbook.SheetNames.includes(sheetName), `missing ${sheetName}`);
  assert.ok(workbookArrayBuffer(reportWorkbook).byteLength > 1000);
});

test('analyzes durability power points and preserves the original report failure plus configured warnings', () => {
  const rows = [
    { target_power_kw: '33', net_power_kw: '32.9', average_cell_voltage_mv: '813', average_deviation_mv: '6', voltage_variance: '20', temperature_c: '57.5', source_file: 'durability.docx' },
    { target_power_kw: '195', net_power_kw: '191.7', average_cell_voltage_mv: '590', average_deviation_mv: '55', voltage_variance: '46', temperature_c: '76.4', source_file: 'durability.docx' }
  ];
  const result = analyzeRows(rows, { durabilityReports: [{ metadata: { 测试方案: '耐久0-5', 测试结果: '未通过' }, points: rows }], durabilityRules: { maxDeviationMv: 50, minAverageCellVoltageMv: 600 } });
  assert.equal(result.datasetType, 'durability');
  assert.equal(result.verdict, 'FAIL');
  assert.ok(result.issues.some((item) => item.code === 'DURABILITY_REPORT_FAIL'));
  assert.ok(result.issues.some((item) => item.code === 'DURABILITY_DEVIATION_HIGH'));
  assert.ok(result.issues.some((item) => item.code === 'DURABILITY_CELL_VOLTAGE_LOW'));
  assert.match(reportMarkdown(result, 'durability.docx'), /耐久功率点统计/);
});

test('summarizes multiple durability reports descriptively without turning the delta into a conformity claim', () => {
  const point = (voltage, deviation) => ({ target_power_kw: 195, net_power_kw: 191.7, average_cell_voltage_mv: voltage, average_deviation_mv: deviation, voltage_variance: 40, temperature_c: 76 });
  const reports = [
    { metadata: { 测试方案: '耐久0-5', 开始时间: '2026-06-05 16:08:56', 测试结果: '未通过' }, points: [point(658, 13), point(660, 14)] },
    { metadata: { 测试方案: '耐久10-15', 开始时间: '2026-06-06 03:07:09', 测试结果: '通过' }, points: [point(657, 15), point(659, 16)] }
  ];
  const result = analyzeRows(reports.flatMap((report) => report.points), { durabilityReports: reports, durabilityRules: {} });
  const summary = result.dataset.crossReportSummary;
  assert.equal(summary.status, 'descriptive_only');
  assert.equal(summary.reportCount, 2);
  assert.equal(summary.orderingBasis, 'metadata.开始时间');
  assert.deepEqual(summary.resultCounts, { '未通过': 1, '通过': 1 });
  assert.equal(summary.byTargetPower[0].averageCellVoltageDeltaMv, null);
  assert.equal(summary.byTargetPower[0].averageDeviationDeltaMv, null);
  assert.equal(summary.byTargetPower[0].deltaStatus, 'suppressed_not_comparable');
  assert.match(summary.boundary, /不产生标准符合性/);
  assert.equal(summary.comparabilityAudit.auditStatus, 'not_evaluable');
  assert.ok(summary.comparabilityAudit.issueCodes.includes('DURABILITY_COMPARABILITY_SYSTEM_NAME_EVIDENCE_MISSING'));
  assert.match(reportMarkdown(result, 'durability-batch.docx'), /跨报告耐久描述性汇总/);
  assert.equal(Object.hasOwn(publicAnalysis(result).dataset.crossReportSummary.byTargetPower[0], 'series'), false);
  const workbook = buildEnterpriseWorkbook(result, 'durability-batch.docx');
  const logRows = SheetJS.utils.sheet_to_json(workbook.Sheets['处理日志'], { header: 1, raw: false });
  assert.ok(logRows.some((row) => String(row[0]).includes('耐久跨报告数')));
});

test('screens durability report comparability and flags a stack-model change without claiming equivalence', () => {
  const point = { target_power_kw: 195, net_power_kw: 191.7, average_cell_voltage_mv: 658, average_deviation_mv: 13, voltage_variance: 40 };
  const headers = ['目标功率（kW）', '平均单体电压', '离均差', '电压方差'];
  const reports = [
    { metadata: { 系统名称: 'P30_482', 电堆型号: 'H3300B', 工步数量: '251', 测试方案: '耐久0-5', 开始时间: '2026-06-05 16:08:56', 结束时间: '2026-06-05 21:16:10', 测试结果: '未通过' }, headers, points: [point] },
    { metadata: { 系统名称: 'P30_482', 电堆型号: '260519000001', 工步数量: '251', 测试方案: '耐久5-10', 开始时间: '2026-06-05 21:31:25', 结束时间: '2026-06-06 02:49:37', 测试结果: '通过' }, headers, points: [point] }
  ];
  const result = analyzeRows(reports.flatMap((report) => report.points), { durabilityReports: reports, durabilityRules: {} });
  const audit = result.dataset.crossReportSummary.comparabilityAudit;
  assert.equal(audit.auditStatus, 'screened');
  assert.equal(audit.comparable, false);
  assert.ok(audit.issueCodes.includes('DURABILITY_COMPARABILITY_STACK_MODEL_MISMATCH'));
  assert.equal(audit.overlapCount, 0);
  assert.match(audit.boundary, /不证明耐久方法/);
  assert.equal(JSON.stringify(publicAnalysis(result)).includes('H3300B'), false);
});

test('parses inline 青川-style 127-column stack sample and produces candidate platforms with descriptive boundary', () => {
  const header = '测试时间,实际电流（A）,平均电压（V）,总电压（V）,功率（kW),最大电压（V）,最小电压（V）,极差（mV）,标准差（mV）,电流密度（mA/cm2）,单片电压1（V）,单片电压2（V）,单片电压3（V）,单片电压4（V）,单片电压5（V）,单片电压6（V）,单片电压7（V）,单片电压8（V）,阳极入堆压力（kPa）,阳极出堆压力（kPa）,阴极入堆压力（kPa）,阴极出堆压力（kPa）,循环水入堆温度（℃）,循环水出堆温度（℃）,循环水流量（L/min）,循环水入堆压力（kPa）,循环水出堆压力（kPa）,柜内氢气浓度（ppm）,测试区氢气浓度（ppm）,氢气流量（SLPM）,空气流量（SLPM）,氢气入口压力（kPa）,氢气出口压力（kPa）,空气入口压力（kPa）,空气出口压力（kPa）,冷却液入口压力（kPa）,冷却液出口压力（kPa）';
  const row = (second, current, voltage, power, avgCell, cell1, cell2, cell3, cell4, h2Flow, airFlow, h2InPress, h2OutPress, airInPress, airOutPress, coolInPress, coolOutPress, h2Conc) => [
    `2026/6/23 14:${String(Math.floor(second / 60)).padStart(2, '0')}:${String(second % 60).padStart(2, '0')}`, current, voltage, power * 3.6, voltage * current, cell1, cell1, 2, 0.005, current * 4.382, cell1, cell2, cell3, cell4, cell1, cell1, cell1, cell1, h2InPress, h2OutPress, airInPress, airOutPress, 55, 65, 5.8, coolInPress, coolOutPress, h2Conc, 0, h2Flow, airFlow, h2InPress, h2OutPress, airInPress, airOutPress, coolInPress, coolOutPress
  ].join(',');
  const rows = parseCSV([header, ...Array.from({ length: 120 }, (_, i) => row(i * 2, 14.7, 0.601, 4.64, 0.601, 0.561, 0.596, 0.593, 0.601, 84.5, 187.75, 159.8, 148.5, 149.6, 113.8, 150.2, 134.6, 0.7))].join('\n'));
  const result = analyzeRows(rows, { sourceHash: 'SHA-256:inline-stack', evaluationMode: 'descriptive_only' });
  assert.equal(result.verdict, 'DESCRIPTIVE');
  assert.equal(result.datasetType, 'stack');
  assert.ok(Array.isArray(result.dataset.platforms), 'platforms should be an array');
  assert.ok(result.dataset.platforms.length > 0, 'expected candidate current platforms');
  assert.ok(result.issues.some((item) => item.code === 'STACK_TARGET_PARAMETERS_MISSING'), true);
});

test('maps inline vehicle FC_* sample to canonical fields and computes insulation summary', () => {
  const header = 'Timestamp,FC_MainSts,FC_CurrOut,FC_VoltOut,FC_NetPwrOut,FC_MinCellVoltage,FC_MinVoltageChannel,FC_AvgCellVoltage,FC_AvgCellDev,FC_VARVoltage,FC_VehicleIsolationR,FC_RunTime_Hours';
  const row = (second, status, current, power, isolation) => `2026-07-07 18:20:${String(second).padStart(2, '0')},${status},${current},320,${power},0.60,3,0.68,8,12,${isolation},1`;
  const rows = parseCSV([header, row(0, 8, 0, 0, 500), row(60, 4, 95, 30, 480), row(120, 4, 95, 31, 350), row(180, 4, 95, 31, 240), row(240, 8, 0, 0, 65535)].join('\n'));
  const result = analyzeRows(rows, { sourceHash: 'SHA-256:inline-vehicle', evaluationMode: 'descriptive_only' });
  assert.equal(result.datasetType, 'vehicle');
  assert.ok(Array.isArray(result.dataset.insulation.points), 'insulation points should be array');
  assert.ok(result.dataset.insulation.points.length >= 1, 'expected at least one insulation window');
  assert.ok(result.dataset.insulation.invalidCount >= 1, 'expected invalid insulation values to be filtered');
  assert.ok(result.issues.some((item) => item.code === 'VEHICLE_TARGETS_MISSING'), true);
});

test('Feishu durability alert stays dry-run by default and sends only an approved webhook payload', async () => {
  const result = { verdict: 'FAIL', dataset: { points: [{ targetPowerKw: 195 }], targetPowers: [195] }, issues: [{ severity: 'critical', title: '耐久异常', evidence: '离均差 55 mV' }], rows: [{ secret: 'raw-row-must-not-enter-alert' }] };
  const payload = durabilityAlertPayload(result, 'durability.docx');
  assert.equal(payload.msg_type, 'text');
  assert.match(payload.content.text, /离均差 55 mV/);
  assert.equal(payload.content.text.includes('raw-row-must-not-enter-alert'), false);
  const dryRun = await sendFeishuAlert(result, {});
  assert.equal(dryRun.mode, 'dry-run');
  let request;
  const sent = await sendFeishuAlert(result, { webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/test', fetchImpl: async (_url, options) => { request = JSON.parse(options.body); return { ok: true, status: 200, text: async () => '{"code":0}' }; } });
  assert.equal(sent.ok, true);
  assert.equal(request.msg_type, 'text');
  let signedRequest;
  const signed = await sendFeishuAlert(result, { webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/test', secret: 'secret', now: 1700000000000, fetchImpl: async (_url, options) => { signedRequest = JSON.parse(options.body); return { ok: true, status: 200, text: async () => '{"code":0}' }; } });
  assert.equal(signed.ok, true);
  assert.equal(signedRequest.timestamp, '1700000000');
  assert.equal(typeof signedRequest.sign, 'string');
  const rejected = await sendFeishuAlert(result, { webhookUrl: 'https://example.com/hook' });
  assert.equal(rejected.reason, 'webhook_host_not_allowed');
});

test('batch manifest classifies added, changed, unchanged, and removed files', () => {
  const previous = manifestFromEntries([{ name: 'a.csv', size: 10, rows: [{ Timestamp: 't0' }], contentHash: 'a' }, { name: 'b.csv', size: 10, rows: [{ Timestamp: 't0' }], contentHash: 'b' }]);
  const current = manifestFromEntries([{ name: 'a.csv', size: 11, rows: [{ Timestamp: 't0' }], contentHash: 'a2' }, { name: 'b.csv', size: 10, rows: [{ Timestamp: 't0' }], contentHash: 'b' }, { name: 'c.csv', size: 10, rows: [{ Timestamp: 't0' }], contentHash: 'c' }]);
  const diff = diffManifests(previous, current);
  assert.deepEqual(diff.added.map((entry) => entry.name), ['c.csv']);
  assert.deepEqual(diff.changed.map((entry) => entry.name), ['a.csv']);
  assert.deepEqual(diff.unchanged.map((entry) => entry.name), ['b.csv']);
  assert.deepEqual(diff.removed.map((entry) => entry.name), []);
});

test('adds a standard OOXML line chart to the generated workbook without changing the data sheet', async () => {
  const rows = [
    { target_power_kw: 33, net_power_kw: 32.9, average_cell_voltage_mv: 813, average_deviation_mv: 6, voltage_variance: 20 },
    { target_power_kw: 195, net_power_kw: 191.7, average_cell_voltage_mv: 658, average_deviation_mv: 13, voltage_variance: 46 }
  ];
  const result = analyzeRows(rows, { durabilityRules: {} });
  const workbook = buildEnterpriseWorkbook(result, 'durability.docx');
  const withChart = await addNativeChartToWorkbook(workbookArrayBuffer(workbook), result.dataset);
  const zip = await JSZip.loadAsync(withChart);
  const names = Object.keys(zip.files);
  assert.ok(names.some((name) => /^xl\/charts\/chart\d+\.xml$/.test(name)));
  assert.ok(names.some((name) => /^xl\/drawings\/drawing\d+\.xml$/.test(name)));
  const chartXml = await zip.file(names.find((name) => /^xl\/charts\/chart\d+\.xml$/.test(name))).async('string');
  assert.match(chartXml, /耐久功率点平均单体电压/);
  const sheetXml = await zip.file('xl/worksheets/sheet13.xml').async('string').catch(() => '');
  assert.ok(names.some((name) => name.includes('worksheets/_rels') && name.endsWith('.rels')));
});

test('separates durability chart data by source report instead of joining a false cross-report line', async () => {
  const rows = [
    { target_power_kw: 33, net_power_kw: 32.9, average_cell_voltage_mv: 813, average_deviation_mv: 6, voltage_variance: 20, source_file: 'report-a.docx' },
    { target_power_kw: 195, net_power_kw: 191.7, average_cell_voltage_mv: 658, average_deviation_mv: 13, voltage_variance: 46, source_file: 'report-a.docx' },
    { target_power_kw: 33, net_power_kw: 32.8, average_cell_voltage_mv: 810, average_deviation_mv: 7, voltage_variance: 21, source_file: 'report-b.docx' }
  ];
  const result = analyzeRows(rows, { durabilityRules: {} });
  const workbook = buildEnterpriseWorkbook(result, 'durability.docx');
  const chartSheet = SheetJS.utils.sheet_to_json(workbook.Sheets['图表数据'], { header: 1, raw: true });
  assert.equal(String(chartSheet[0][0]), '报告/来源');
  assert.equal(String(chartSheet[0][1]), '点序');
  assert.equal(String(chartSheet[0][2]), '目标功率(kW)');
  assert.equal(chartSheet.some((row) => row.length === 0 || row.every((value) => value === '')), true);
  const withChart = await addNativeChartToWorkbook(workbookArrayBuffer(workbook), result.dataset);
  const zip = await JSZip.loadAsync(withChart);
  const chartXml = await zip.file(Object.keys(zip.files).find((name) => /^xl\/charts\/chart\d+\.xml$/.test(name))).async('string');
  assert.match(chartXml, /report-a\.docx/);
  assert.match(chartXml, /report-b\.docx/);
});

test('acceptance mode blocks cached workbook formulas until formula review evidence is bound', () => {
  const rows = [
    { timestamp_s: 0, current_a: 1, voltage_v: 2, temperature_c: 25, pressure_bar: 1, flow_slpm: 1, leak_ppm: 0, hydrogen_purity_pct: 99 },
    { timestamp_s: 1, current_a: 1, voltage_v: 2, temperature_c: 25, pressure_bar: 1, flow_slpm: 1, leak_ppm: 0, hydrogen_purity_pct: 99 }
  ];
  const workbookEvidence = { formulaAudit: { status: 'review_required', formulaCellCount: 2, formulaSheetCount: 1, cachedFormulaCellCount: 2, uncachedFormulaCellCount: 0, externalReferenceCount: 0, externalFunctionCount: 0, volatileFormulaCount: 0, macroPresent: false, externalLinksPresent: false, activeContentPresent: false } };
  const blocked = analyzeRows(rows, { evaluationMode: 'acceptance', workbookEvidence });
  assert.equal(blocked.releaseGate.workbookFormulaReview.ready, false);
  assert.ok(blocked.releaseGate.blockedReasons.includes('workbookFormulaReview'));
  assert.ok(blocked.issues.some((item) => item.code === 'WORKBOOK_FORMULA_REVIEW_MISSING'));
  const reviewed = analyzeRows(rows, { evaluationMode: 'acceptance', workbookEvidence, testMetadata: { formulaReviewEvidence: { reviewerId: 'Q-001', reviewedAt: '2026-08-23', evidenceRef: 'FORMULA-001', sourceHash: 'SHA-256:abc', decision: 'cached_values_reviewed' } } });
  assert.equal(reviewed.releaseGate.workbookFormulaReview.ready, true);
  assert.equal(reviewed.issues.some((item) => item.code === 'WORKBOOK_FORMULA_REVIEW_MISSING'), false);
});
