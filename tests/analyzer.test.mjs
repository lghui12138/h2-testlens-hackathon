import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzeRows, parseCSV, publicAnalysis, reportMarkdown } from '../src/analyzer.mjs';
import { generateDraft, validateRemoteDraft } from '../src/ai-draft.mjs';
import { compareResults } from '../src/compare.mjs';
import { getProfile, profilesFromPackage } from '../src/profiles.mjs';
import { appendHistory, clearHistory, readHistory } from '../src/history.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const csv = await readFile(join(here, '../sample-data/test_run_001.csv'), 'utf8');
const baselineCsv = await readFile(join(here, '../sample-data/test_run_baseline.csv'), 'utf8');

test('parses the demo CSV into records', () => {
  const rows = parseCSV(csv);
  assert.equal(rows.length, 25);
  assert.equal(rows[0].phase, 'idle');
  assert.equal(rows.at(-1).timestamp_s, '120');
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

test('AI draft defaults to local evidence mode and does not include raw rows', async () => {
  const result = analyzeRows(parseCSV(csv));
  const draft = await generateDraft(result, { endpoint: '' });
  assert.equal(draft.mode, 'local-evidence');
  assert.match(draft.draft, /证据约束模式/);
  assert.equal('rows' in draft.evidence, false);
});

test('remote AI adapter receives structured evidence only', async () => {
  const result = analyzeRows(parseCSV(csv));
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
  assert.equal('rows' in JSON.parse(request.messages[1].content), false);
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

test('maps Chinese headers and converts common engineering units', () => {
  const legacyRows = parseCSV([
    '时间(ms),工况,电流(mA),电压(mV),温度(°C),压力(kPa),流量,泄漏(ppb)',
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

test('phase is optional and uses an explicit fallback window', () => {
  const rows = parseCSV([
    'timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,1,1.8,30,10,3,1',
    '1,1,1.8,31,10,3,1'
  ].join('\n'));
  const result = analyzeRows(rows);
  assert.deepEqual(result.schema.missingHeaders, []);
  assert.deepEqual(result.schema.missingOptionalHeaders, ['phase']);
  assert.match(result.metrics.steadyWindow, /活动窗口/);
  assert.ok(result.issues.some((item) => item.code === 'PHASE_OPTIONAL'));
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
  const saved = appendHistory(storage, result, 'current.csv', '2026-08-21T00:00:00.000Z');
  assert.equal(saved.length, 1);
  assert.equal('rows' in saved[0], false);
  assert.equal(readHistory(storage)[0].fileName, 'current.csv');
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
  const mismatchedInput = parseCSV([
    '时间(ms),工况,电流(mA),电压(mV),温度(°C),压力(kPa),流量,泄漏(ppb)',
    '0,稳态,1000,1800,30,100,3,1000',
    '1000,稳态,1000,1800,31,100,3,1000'
  ].join('\n'));
  const mismatched = analyzeRows(mismatchedInput, { fieldMapping: { pressure_bar: '企业压力专用列' } });
  assert.ok(mismatched.schema.mappingWarnings.some((warning) => warning.includes('pressure_bar')));
  assert.ok(mismatched.issues.some((item) => item.code === 'MAPPING_OVERRIDE_MISSING'));
});

test('public analysis removes raw rows before integration responses', () => {
  const result = analyzeRows(parseCSV(csv));
  const safe = publicAnalysis(result);
  assert.equal('rows' in safe, false);
  assert.equal(safe.verdict, 'FAIL');
  assert.equal(safe.metrics.sampleCount, 25);
});

test('standards gate distinguishes demo, incomplete, and human-review-ready profiles', () => {
  const base = {
    profileId: 'approved-example',
    profileName: 'Approved example',
    profileSource: 'enterprise method register',
    approvalStatus: 'approved',
    standardRefs: [{ id: 'GB/T 45541-2025', title: 'PEM', uri: 'https://std.samr.gov.cn/example' }],
    methodId: 'GB/T 45541-2025',
    revision: '2025',
    applicationScope: 'PEM electrolyzer performance test',
    requiredMetadata: ['testPurpose', 'instrumentIds', 'calibrationRefs', 'operator', 'formulaRefs', 'signoff']
  };
  const incomplete = analyzeRows(parseCSV(csv), base);
  assert.equal(incomplete.compliance.status, 'NOT_READY');
  const ready = analyzeRows(parseCSV(csv), { ...base, testMetadata: { testPurpose: 'performance', instrumentIds: 'I-1', calibrationRefs: 'C-1', operator: 'operator/qualification', formulaRefs: 'method equation v1', signoff: 'reviewer/2026-08-21' } });
  assert.equal(ready.compliance.status, 'READY_FOR_HUMAN_REVIEW');
  assert.equal(ready.compliance.missingMetadata.length, 0);
});
