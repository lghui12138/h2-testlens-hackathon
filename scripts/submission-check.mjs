import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const exec = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const requiredFiles = [
  'README.md',
  'docs/SUBMISSION_BRIEF.md',
  'docs/SUBMISSION_PACKAGE.md',
  'docs/AI_EVAL.md',
  'docs/AI_INTEGRATION.md',
  'docs/API.md',
  'docs/STANDARDS_ALIGNMENT.md',
  'docs/COMPLETION_REPORT.md',
  'docs/CHANGE_MANIFEST.yaml',
  'docs/DEPLOYMENT.md',
  'docs/ENTERPRISE_READINESS.md',
  'src/index.html',
  'src/analyzer.mjs',
  'src/ai-draft.mjs',
  'src/compare.mjs',
  'src/history.mjs',
  'src/profiles.mjs',
  'src/provenance.mjs',
  'scripts/ai-eval.mjs',
  'scripts/submission-check.mjs',
  'scripts/package-submission.mjs',
  'scripts/api-smoke.mjs',
  'scripts/prepare-github-pages.mjs',
  'scripts/profile-audit.mjs',
  '.github/workflows/deploy-pages.yml',
  'config/enterprise-profile.example.json',
  '.research/ignite_t02_standards_20260821/sources.jsonl',
  '.research/ignite_t02_standards_20260821/evidence.jsonl',
  '.research/ignite_t02_standards_20260821/claims.jsonl',
  '.research/ignite_t02_standards_20260821/research_report_20260821_ignite_t02_standards.md',
  'sample-data/test_run_001.csv',
  'sample-data/test_run_baseline.csv',
  'sample-data/test_run_legacy_cn.csv'
];

const checks = [];
for (const relativePath of requiredFiles) {
  try { await access(join(root, relativePath), constants.R_OK); checks.push({ id: `file:${relativePath}`, pass: true }); }
  catch { checks.push({ id: `file:${relativePath}`, pass: false }); }
}

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const manifest = await readFile(join(root, 'docs/CHANGE_MANIFEST.yaml'), 'utf8');
const brief = await readFile(join(root, 'docs/SUBMISSION_BRIEF.md'), 'utf8');
checks.push({ id: 'track:T02', pass: brief.includes('T02') && manifest.includes('T02') });
checks.push({ id: 'script:test', pass: packageJson.scripts?.test === 'node --test' });
checks.push({ id: 'script:ai-eval', pass: packageJson.scripts?.['eval:ai'] === 'node scripts/ai-eval.mjs' });
checks.push({ id: 'script:submission-check', pass: packageJson.scripts?.['check:submission'] === 'node scripts/submission-check.mjs' });
checks.push({ id: 'script:package-submission', pass: packageJson.scripts?.['package:submission'] === 'node scripts/package-submission.mjs' });
checks.push({ id: 'script:smoke-api', pass: packageJson.scripts?.['smoke:api'] === 'node scripts/api-smoke.mjs' });

for (const [id, command, args] of [
  ['tests', 'npm', ['test']],
  ['ai-grounding', 'npm', ['run', 'eval:ai']],
  ['api-smoke', 'npm', ['run', 'smoke:api']],
  ['profile-audit', 'npm', ['run', 'profile:audit', '--', 'config/enterprise-profile.example.json']]
]) {
  try { await exec(command, args, { cwd: root, maxBuffer: 2_000_000 }); checks.push({ id, pass: true }); }
  catch (error) { checks.push({ id, pass: false, detail: error.stdout?.slice(-1000) ?? error.message }); }
}

const passed = checks.filter((check) => check.pass).length;
const report = { suite: 'h2-testlens-submission-readiness.v1', version: packageJson.version, checks: checks.length, passed, failed: checks.length - passed, results: checks };
console.log(JSON.stringify(report, null, 2));
if (report.failed) process.exitCode = 1;
