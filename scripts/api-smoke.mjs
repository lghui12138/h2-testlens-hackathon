import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const allocatePort = async () => {
  if (process.env.H2_SMOKE_PORT) return String(process.env.H2_SMOKE_PORT);
  const probe = createTcpServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const port = String(probe.address().port);
  await new Promise((resolve) => probe.close(resolve));
  return port;
};
const port = await allocatePort();
const child = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, PORT: port, H2_FEISHU_WEBHOOK_URL: '', H2_FEISHU_SECRET: '' }, stdio: ['ignore', 'ignore', 'pipe'] });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let childError = '';
child.stderr.on('data', (chunk) => { childError += chunk.toString(); });
try {
  let response;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { response = await fetch(`http://127.0.0.1:${port}/`); if (response.ok) break; } catch {}
    await wait(50);
  }
  if (!response?.ok) throw new Error(`server_not_ready${childError ? `: ${childError.trim()}` : ''}`);
  const csv = await readFile(join(root, 'sample-data/test_run_001.csv'), 'utf8');
  const analyzeResponse = await fetch(`http://127.0.0.1:${port}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv, fileName: 'smoke.csv', includeReport: true, config: { testMetadata: { operator: 'secret-operator', rawDataRef: '/private/raw.csv' } } }) });
  if (!analyzeResponse.ok) throw new Error(`api status ${analyzeResponse.status}`);
  const result = await analyzeResponse.json();
  if (result.rows !== undefined || result.source?.fileName !== undefined || result.source?.fileNamePresent !== true) throw new Error('raw rows or file name leaked from public API');
  if (result.verdict !== 'FAIL' || !result.reportMarkdown?.includes('自动判定')) throw new Error('unexpected analysis response');
  if (result.config?.testMetadata?.operator !== true || JSON.stringify(result).includes('secret-operator') || result.reportMarkdown.includes('secret-operator')) throw new Error('sensitive metadata leaked from public API');
  const batchDeclaration = { version: 'h2-testlens.batch-declaration.v1', groups: [{ id: 'TR-SMOKE-G1', testRunId: 'TR-SMOKE', sessionGroup: 'SG-SMOKE', files: ['part-001.csv', 'part-002.csv'], fileOrder: ['part-001.csv', 'part-002.csv'], clockReference: 'DAQ-SMOKE', samplingIntervalS: 5, restartBoundaries: ['part-002.csv'] }] };
  const batchResponse = await fetch(`http://127.0.0.1:${port}/api/analyze-batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ declaration: batchDeclaration, files: [{ name: 'part-001.csv', csv }, { name: 'part-002.csv', csv }], includeReport: true }) });
  if (!batchResponse.ok) throw new Error(`batch api status ${batchResponse.status}`);
  const batch = await batchResponse.json();
  if (batch.declaration?.status !== 'validated' || batch.groups?.length !== 1 || batch.groups[0].batchAggregation?.status !== 'descriptive_only' || batch.groups[0].batchAggregation?.observation?.status !== 'ready' || batch.groups[0].batchAggregation?.observation?.sampling?.observedMedianIntervalS !== 5 || batch.groups[0].batchAggregation?.observation?.files?.[0]?.name !== undefined || batch.groups[0].batchAggregation?.testRunId !== undefined || !batch.groups[0].reportMarkdown?.includes('显式批次汇总')) throw new Error('unexpected batch analysis response');
  const invalidBatchResponse = await fetch(`http://127.0.0.1:${port}/api/analyze-batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ declaration: { version: 'h2-testlens.batch-declaration.v1', groups: [] }, files: [{ name: 'part-001.csv', csv }, { name: 'part-002.csv', csv }] }) });
  if (invalidBatchResponse.status !== 422) throw new Error(`invalid batch declaration was not rejected: ${invalidBatchResponse.status}`);
  const baselineCsv = await readFile(join(root, 'sample-data/test_run_baseline.csv'), 'utf8');
  const compareResponse = await fetch(`http://127.0.0.1:${port}/api/compare`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baselineCsv, currentCsv: csv, baselineFileName: 'baseline.csv', currentFileName: 'current.csv', includeReport: true }) });
  if (!compareResponse.ok) throw new Error(`compare api status ${compareResponse.status}`);
  const comparison = await compareResponse.json();
  if (comparison.baseline.rows !== undefined || comparison.current.rows !== undefined || comparison.comparison.verdictTransition !== '通过（PASS） → 未通过（FAIL）' || !comparison.reportMarkdown?.includes('批次对比')) throw new Error('unexpected comparison response');
  const profilePackage = JSON.parse(await readFile(join(root, 'config/enterprise-profile.example.json'), 'utf8'));
  const legacyCsv = await readFile(join(root, 'sample-data/test_run_legacy_cn.csv'), 'utf8');
  const profileResponse = await fetch(`http://127.0.0.1:${port}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: legacyCsv, profilePackage, profileId: 'enterprise-electrolyzer-example', testMetadata: { acquisitionRecord: { evidenceRef: 'ACQ-SECRET' }, preCheckItems: [{ id: 'device_identity', status: 'pass', evidenceRef: 'PC-SECRET' }] } }) });
  if (!profileResponse.ok) throw new Error(`profile api status ${profileResponse.status}`);
  const profileResult = await profileResponse.json();
  if (profileResult.rows !== undefined || profileResult.config?.profileName !== '企业电解槽 · 示例配置' || profileResult.schema?.mapping?.pressure_bar !== '压力(kPa)' || profileResult.compliance?.status !== 'DEMO_ONLY' || profileResult.compliance?.requiredMeasurements?.includes('hydrogen_purity_pct') !== true || !Array.isArray(profileResult.compliance?.requiredPhases) || profileResult.compliance?.acquisitionRequirements?.requireSamplingFrequency !== true || profileResult.compliance?.preCheckRequirements?.length !== 4 || profileResult.compliance?.requiredTestStages?.length !== 4 || profileResult.compliance?.workflowSequence?.map((step) => step.id).join('>') !== 'basic_check>basic_test>performance_test>test_report' || profileResult.compliance?.measurementMethodRequirements?.length !== 4 || profileResult.compliance?.efficiencyRequirement?.metric !== 'efficiency_pct' || profileResult.compliance?.report?.missing?.includes('operatorQualification') !== true || profileResult.compliance?.acquisition?.status !== 'missing' || profileResult.compliance?.preCheck?.status !== 'missing' || profileResult.compliance?.testStages?.status !== 'missing' || profileResult.compliance?.testConditions?.status !== 'missing' || profileResult.compliance?.measurementMethods?.status !== 'missing' || profileResult.compliance?.efficiency?.status !== 'missing' || profileResult.config?.testMetadata?.acquisitionRecord !== true || profileResult.config?.testMetadata?.preCheckItems !== true || JSON.stringify(profileResult).includes('ACQ-SECRET') || JSON.stringify(profileResult).includes('PC-SECRET') || profileResult.compliance?.acceptanceCriteria === undefined || profileResult.config?.uncertaintyModelRequired !== false || profileResult.config?.uncertaintyModel !== null) throw new Error('profile package was not applied by API');
  const t02ProfilePackage = JSON.parse(await readFile(join(root, 'config/t02-profile.example.json'), 'utf8'));
  const t02ProfileResponse = await fetch(`http://127.0.0.1:${port}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: legacyCsv, profilePackage: t02ProfilePackage, profileId: 't02-vehicle-descriptive' }) });
  if (!t02ProfileResponse.ok) throw new Error(`T02 descriptive profile api status ${t02ProfileResponse.status}`);
  const t02ProfileResult = await t02ProfileResponse.json();
  if (t02ProfileResult.config?.evaluationMode !== 'descriptive_only' || t02ProfileResult.verdict !== 'DESCRIPTIVE' || t02ProfileResult.evaluation?.decisionStatus !== 'NOT_RUN' || t02ProfileResult.evaluation?.thresholdEvaluation !== 'NOT_RUN') throw new Error('T02 descriptive evaluation mode was not preserved by API profile routing');
  const invalidProfileResponse = await fetch(`http://127.0.0.1:${port}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: legacyCsv, profilePackage: { schemaVersion: 'wrong', profiles: [] } }) });
  if (invalidProfileResponse.status !== 422) throw new Error(`invalid profile package was not rejected: ${invalidProfileResponse.status}`);
  const invalidProfile = await invalidProfileResponse.json();
  if (invalidProfile.error !== 'profile_package_invalid' || !Array.isArray(invalidProfile.details)) throw new Error('invalid profile error details missing');
  const alertResponse = await fetch(`http://127.0.0.1:${port}/api/feishu-alert`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: 'smoke.docx', result: { verdict: 'FAIL', dataset: { targetPowers: [195], points: [] }, issues: [{ severity: 'critical', title: 'smoke', evidence: 'bounded evidence' }] } }) });
  if (alertResponse.status !== 503) throw new Error(`unconfigured Feishu channel should be 503: ${alertResponse.status}`);
  const alertResult = await alertResponse.json();
  if (alertResult.error !== 'feishu_not_configured' || alertResult.sent !== false) throw new Error('Feishu dry-run boundary missing');
  console.log(JSON.stringify({ analyze: { verdict: result.verdict, rowsReturned: result.rows !== undefined, report: 'present' }, batch: { status: batch.groups[0].batchAggregation.status, rowsReturned: batch.groups[0].analysis.rows !== undefined, report: 'present', invalidStatus: invalidBatchResponse.status }, compare: { transition: comparison.comparison.verdictTransition, rowsReturned: comparison.current.rows !== undefined, report: 'present' }, profilePackage: { profileName: profileResult.config.profileName, mapping: profileResult.schema.mapping.pressure_bar, rowsReturned: profileResult.rows !== undefined }, invalidProfile: { status: invalidProfileResponse.status, error: invalidProfile.error } }, null, 2));
} finally {
  child.kill();
}
