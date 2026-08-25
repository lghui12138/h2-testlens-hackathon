import { createServer as createTcpServer } from 'node:net';
import { mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const exec = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
await exec('npm', ['run', 'check:submission'], { cwd: root, maxBuffer: 50_000_000 });
const dist = join(root, 'dist');
await mkdir(dist, { recursive: true });
const packageManifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const version = String(packageManifest.version || '0.0.0').replace(/[^0-9A-Za-z._-]/g, '-');
const archive = join(dist, `h2-testlens-submission-v${version}.zip`);
const researchRoot = '.research/ignite_t02_standards_20260821';
const archiveEntries = [
  'README.md',
  'ROADMAP.md',
  'package.json',
  'package-lock.json',
  'server.mjs',
  'app',
  'public',
  'src',
  'scripts',
  'tests',
  'docs',
  'sample-data',
  'config',
  'worker',
  'vite.config.ts',
  'tsconfig.json',
  '.github',
  `${researchRoot}/sources.jsonl`,
  `${researchRoot}/evidence.jsonl`,
  `${researchRoot}/claims.jsonl`,
  `${researchRoot}/research_report_20260821_ignite_t02_standards.md`,
  `${researchRoot}/t02_coverage_audit_v${version}.json`,
  `${researchRoot}/t02_reference_audit_v${version}.json`,
  `${researchRoot}/t02_integration_report_v${version}.md`
];
try { await unlink(archive); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await exec('zip', ['-qr', archive, ...archiveEntries], { cwd: root, maxBuffer: 50_000_000 });
await exec('unzip', ['-t', archive], { cwd: root, maxBuffer: 50_000_000 });
const listing = (await exec('unzip', ['-l', archive], { cwd: root, maxBuffer: 50_000_000 })).stdout;
const requiredEntries = ['README.md', 'ROADMAP.md', 'package.json', 'package-lock.json', 'server.mjs', 'app/page.tsx', 'public/config/t02-profile.example.json', 'worker/index.ts', 'vite.config.ts', 'tsconfig.json', '.github/workflows/deploy-pages.yml', 'docs/SUBMISSION_BRIEF.md', 'docs/STANDARDS_ALIGNMENT.md', 'docs/T02_REQUIREMENTS_MATRIX.md', 'docs/API.md', 'docs/SECURITY_BOUNDARIES.md', 'docs/AI_EVAL.md', 'config/standard-evidence-ledger.v1.json', 'public/config/standard-evidence-ledger.v1.json', 'config/enterprise-profile.example.json', 'config/t02-profile.example.json', 'config/batch-declaration.example.json', 'src/analyzer.mjs', 'src/dynamic-events.mjs', 'src/structured-evidence.mjs', 'src/profiles.mjs', 'src/metric-trace.mjs', 'src/provenance.mjs', 'src/display-sampling.mjs', 'src/analysis-worker.mjs', 'src/browser-engines.mjs', 'src/input-safety.mjs', 'src/batch-aggregation.mjs', 'src/t02-report.mjs', 'scripts/ai-eval.mjs', 'scripts/api-smoke.mjs', 'scripts/profile-audit.mjs', 'scripts/t02-coverage-audit.mjs', 'scripts/t02-reference-audit.mjs', 'scripts/t02-report.mjs', 'scripts/batch-watch.mjs', 'tests/analyzer.test.mjs', 'tests/input-surface.test.mjs', 'tests/input-safety.test.mjs', 'tests/batch-aggregation.test.mjs', 'tests/batch-watch-cli.test.mjs', 'tests/evaluation-mode.test.mjs', 'tests/t02-audit.test.mjs', '.research/ignite_t02_standards_20260821/claims.jsonl', `.research/ignite_t02_standards_20260821/t02_coverage_audit_v${version}.json`, `.research/ignite_t02_standards_20260821/t02_reference_audit_v${version}.json`, `.research/ignite_t02_standards_20260821/t02_integration_report_v${version}.md`];
requiredEntries.push(`${researchRoot}/sources.jsonl`, `${researchRoot}/claims.jsonl`, 'src/standard-evidence.mjs', 'src/approval-ledger.mjs', 'config/trusted-approval-ledger.v1.json', 'public/config/trusted-approval-ledger.v1.json');
requiredEntries.push(`${researchRoot}/evidence.jsonl`, `${researchRoot}/research_report_20260821_ignite_t02_standards.md`);
requiredEntries.splice(17, 0, 'src/xlsx-node-loader.mjs');
const missingEntries = requiredEntries.filter((entry) => !listing.includes(entry));
if (missingEntries.length) throw new Error(`submission archive missing: ${missingEntries.join(', ')}`);

const getFreePort = async () => {
  const probe = createTcpServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve, reject) => {
    probe.close((error) => error ? reject(error) : resolve());
  });
  return port;
};

const runPackageSmoke = async () => {
  const staging = await mkdtemp(join(tmpdir(), 'h2-testlens-submission-'));
  let child;
  try {
    await exec('unzip', ['-q', archive, '-d', staging], { cwd: root, maxBuffer: 50_000_000 });
    await exec('npm', ['ci', '--ignore-scripts'], { cwd: staging, maxBuffer: 50_000_000 });
    await exec('npm', ['test'], { cwd: staging, maxBuffer: 50_000_000 });
    await exec('npm', ['run', 'typecheck'], { cwd: staging, maxBuffer: 50_000_000 });
    await exec('npm', ['run', 'build'], { cwd: staging, maxBuffer: 50_000_000 });
    const port = await getFreePort();
    child = spawn(process.execPath, ['server.mjs'], {
      cwd: staging,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const startup = new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error(`package server startup timeout: ${output.slice(-1000)}`)), 15_000);
      const onData = (chunk) => {
        output += chunk.toString();
        if (output.includes(`H2 TestLens running at http://127.0.0.1:${port}`)) {
          clearTimeout(timer);
          resolve();
        }
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', (chunk) => { output += chunk.toString(); });
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code, signal) => {
        if (code !== null || signal) {
          clearTimeout(timer);
          reject(new Error(`package server exited before smoke: code=${code} signal=${signal} output=${output.slice(-1000)}`));
        }
      });
    });
    await startup;
    const response = await fetch(`http://127.0.0.1:${port}/`);
    const html = await response.text();
    if (!response.ok || !html.includes('H2 TestLens')) throw new Error(`package server HTTP smoke failed: ${response.status}`);
    return { install: 'passed', tests: 'passed', typecheck: 'passed', build: 'passed', start: 'passed', http: 'passed' };
  } finally {
    if (child && !child.killed) child.kill('SIGTERM');
    await rm(staging, { recursive: true, force: true });
  }
};

const packageSmoke = await runPackageSmoke();
const archiveStat = await stat(archive);
const checksum = (await exec('shasum', ['-a', '256', archive], { cwd: root })).stdout.trim();
await writeFile(`${archive}.sha256`, `${checksum}\n`, 'utf8');
const receiptPath = join(dist, `h2-testlens-release-receipt-v${version}.json`);
const baseReceipt = JSON.parse(await readFile(join(root, 'config/release-summary.json'), 'utf8'));
const releaseReceipt = { ...baseReceipt, version, commit: process.env.GITHUB_SHA || null, workflowRunId: process.env.GITHUB_RUN_ID || null, source: process.env.GITHUB_SHA ? 'github-actions' : 'local-package', generatedAt: new Date().toISOString(), gates: Object.fromEntries(Object.entries(baseReceipt.gates).map(([key, gate]) => [key, { ...gate, status: 'passed' }])), artifact: { name: archive.split('/').at(-1), bytes: archiveStat.size, sha256: checksum.split(' ')[0], archiveIntegrity: 'passed' } };
await writeFile(receiptPath, `${JSON.stringify(releaseReceipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ archive, checksumFile: `${archive}.sha256`, receiptFile: receiptPath, sha256: checksum.split(' ')[0], bytes: archiveStat.size, archiveIntegrity: 'passed', requiredEntries: requiredEntries.length, packageSmoke, readiness: 'passed-before-packaging' }, null, 2));
