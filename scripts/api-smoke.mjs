import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = '4174';
const child = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, PORT: port }, stdio: ['ignore', 'ignore', 'pipe'] });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  let response;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try { response = await fetch(`http://127.0.0.1:${port}/`); if (response.ok) break; } catch {}
    await wait(50);
  }
  const csv = await readFile(join(root, 'sample-data/test_run_001.csv'), 'utf8');
  const analyzeResponse = await fetch(`http://127.0.0.1:${port}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv, fileName: 'smoke.csv', includeReport: true }) });
  if (!analyzeResponse.ok) throw new Error(`api status ${analyzeResponse.status}`);
  const result = await analyzeResponse.json();
  if (result.rows !== undefined) throw new Error('raw rows leaked from public API');
  if (result.verdict !== 'FAIL' || !result.reportMarkdown?.includes('自动判定')) throw new Error('unexpected analysis response');
  const baselineCsv = await readFile(join(root, 'sample-data/test_run_baseline.csv'), 'utf8');
  const compareResponse = await fetch(`http://127.0.0.1:${port}/api/compare`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baselineCsv, currentCsv: csv, baselineFileName: 'baseline.csv', currentFileName: 'current.csv', includeReport: true }) });
  if (!compareResponse.ok) throw new Error(`compare api status ${compareResponse.status}`);
  const comparison = await compareResponse.json();
  if (comparison.baseline.rows !== undefined || comparison.current.rows !== undefined || comparison.comparison.verdictTransition !== '通过（PASS） → 未通过（FAIL）' || !comparison.reportMarkdown?.includes('批次对比')) throw new Error('unexpected comparison response');
  const profilePackage = JSON.parse(await readFile(join(root, 'config/enterprise-profile.example.json'), 'utf8'));
  const legacyCsv = await readFile(join(root, 'sample-data/test_run_legacy_cn.csv'), 'utf8');
  const profileResponse = await fetch(`http://127.0.0.1:${port}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: legacyCsv, profilePackage, profileId: 'enterprise-electrolyzer-example' }) });
  if (!profileResponse.ok) throw new Error(`profile api status ${profileResponse.status}`);
  const profileResult = await profileResponse.json();
  if (profileResult.rows !== undefined || profileResult.config?.profileName !== '企业电解槽 · 示例配置' || profileResult.schema?.mapping?.pressure_bar !== '压力(kPa)' || profileResult.compliance?.status !== 'DEMO_ONLY' || profileResult.compliance?.requiredMeasurements?.includes('hydrogen_purity_pct') !== true || !Array.isArray(profileResult.compliance?.requiredPhases) || profileResult.compliance?.acceptanceCriteria === undefined) throw new Error('profile package was not applied by API');
  const invalidProfileResponse = await fetch(`http://127.0.0.1:${port}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: legacyCsv, profilePackage: { schemaVersion: 'wrong', profiles: [] } }) });
  if (invalidProfileResponse.status !== 422) throw new Error(`invalid profile package was not rejected: ${invalidProfileResponse.status}`);
  const invalidProfile = await invalidProfileResponse.json();
  if (invalidProfile.error !== 'profile_package_invalid' || !Array.isArray(invalidProfile.details)) throw new Error('invalid profile error details missing');
  console.log(JSON.stringify({ analyze: { verdict: result.verdict, rowsReturned: result.rows !== undefined, report: 'present' }, compare: { transition: comparison.comparison.verdictTransition, rowsReturned: comparison.current.rows !== undefined, report: 'present' }, profilePackage: { profileName: profileResult.config.profileName, mapping: profileResult.schema.mapping.pressure_bar, rowsReturned: profileResult.rows !== undefined }, invalidProfile: { status: invalidProfileResponse.status, error: invalidProfile.error } }, null, 2));
} finally {
  child.kill();
}
