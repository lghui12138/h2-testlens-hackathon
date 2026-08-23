import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const runCommand = promisify(execFile);
const repoRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

test('batch-watch CLI replays a declared batch and preserves descriptive-only boundaries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'h2-testlens-batch-cli-'));
  const inputDir = join(root, 'input');
  const outputDir = join(root, 'output');
  const statePath = join(root, 'state.json');
  const declarationPath = join(root, 'batch-declaration.json');
  try {
    await mkdir(inputDir, { recursive: true });
    const csv = await readFile(join(repoRoot, 'sample-data/test_run_001.csv'), 'utf8');
    await writeFile(join(inputDir, 'part-001.csv'), csv, 'utf8');
    await writeFile(join(inputDir, 'part-002.csv'), csv, 'utf8');
    await writeFile(declarationPath, `${JSON.stringify({
      version: 'h2-testlens.batch-declaration.v1',
      groups: [{
        id: 'run-001',
        testRunId: 'TR-001',
        sessionGroup: 'SG-001',
        files: ['part-001.csv', 'part-002.csv'],
        fileOrder: ['part-001.csv', 'part-002.csv'],
        clockReference: 'DAQ-01',
        samplingIntervalS: 5,
        restartBoundaries: ['part-002.csv']
      }]
    }, null, 2)}\n`, 'utf8');

    const { stdout } = await runCommand(process.execPath, [
      'scripts/batch-watch.mjs',
      '--dir', inputDir,
      '--output', outputDir,
      '--state', statePath,
      '--batch-declaration', declarationPath,
      '--profile', join(repoRoot, 'config/t02-profile.example.json'),
      '--profile-id', 't02-vehicle-descriptive',
      '--once'
    ], { cwd: repoRoot, maxBuffer: 8 * 1024 * 1024 });
    const result = JSON.parse(stdout);
    assert.equal(result.batchDeclaration.status, 'validated');
    assert.equal(result.batchReports.length, 1);
    assert.equal(result.batchReports[0].status, 'processed');
    assert.equal(result.batchReports[0].observationStatus, 'ready');
    assert.deepEqual(result.batchReports[0].observationIssueCodes, []);
    assert.equal(result.batchReports[0].fileCount, 2);
    assert.match(result.batchReports[0].boundary, /描述性汇总/);

    const state = JSON.parse(await readFile(statePath, 'utf8'));
    assert.equal(state.lastRun.batchReports.length, 1);
    assert.equal(state.lastRun.batchReports[0].testRunId, 'TR-001');
    const batchReport = JSON.parse(await readFile(join(outputDir, 'batch-run-001.batch.analysis.json'), 'utf8'));
    assert.equal(batchReport.batchAggregation.status, 'descriptive_only');
    assert.equal(batchReport.batchAggregation.combined.sessionCount, 2);
    assert.equal(batchReport.batchAggregation.observation.status, 'ready');
    assert.equal(batchReport.batchAggregation.observation.sampling.observedMedianIntervalS, 5);
    assert.equal(batchReport.analysis.rows, undefined);
    assert.equal(batchReport.analysis.config.evaluationMode, 'descriptive_only');
    assert.equal(batchReport.analysis.verdict, 'DESCRIPTIVE');
    assert.equal(batchReport.analysis.evaluation.decisionStatus, 'NOT_RUN');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
