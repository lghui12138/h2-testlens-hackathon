import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { compareSourceToAudit, fingerprintFile } from '../scripts/t02-source-integrity.mjs';

test('T02 source integrity accepts an unchanged tree and detects drift without parsing content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'h2-testlens-source-integrity-'));
  try {
    await mkdir(join(root, 'package'), { recursive: true });
    await writeFile(join(root, 'package', 'run.csv'), 'timestamp_s,current_a\n0,1\n', 'utf8');
    await writeFile(join(root, 'note.pdf'), Buffer.from([0x25, 0x50, 0x44, 0x46]));
    const csv = await fingerprintFile(join(root, 'package', 'run.csv'));
    const pdf = await fingerprintFile(join(root, 'note.pdf'));
    const audit = { auditVersion: 'test', records: [
      { path: 'package/run.csv', bytes: csv.bytes, sha256: csv.sha256 },
      { path: 'note.pdf', bytes: pdf.bytes, sha256: pdf.sha256 }
    ] };
    const clean = await compareSourceToAudit({ sourceRoot: root, audit });
    assert.equal(clean.drift, false);
    assert.equal(clean.unchanged, 2);
    await writeFile(join(root, 'package', 'run.csv'), 'timestamp_s,current_a\n0,2\n', 'utf8');
    await writeFile(join(root, 'new.txt'), 'new', 'utf8');
    const drift = await compareSourceToAudit({ sourceRoot: root, audit });
    assert.equal(drift.drift, true);
    assert.deepEqual(drift.added, ['new.txt']);
    assert.deepEqual(drift.missing, []);
    assert.deepEqual(drift.changed.map((item) => item.path), ['package/run.csv']);
    await rm(join(root, 'note.pdf'));
    const missing = await compareSourceToAudit({ sourceRoot: root, audit });
    assert.equal(missing.drift, true);
    assert.deepEqual(missing.missing, ['note.pdf']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('T02 source integrity rejects an audit with a wrong root, count, or duplicate path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'h2-testlens-source-integrity-shape-'));
  try {
    await writeFile(join(root, 'run.csv'), 'timestamp_s,current_a\n0,1\n', 'utf8');
    const fingerprint = await fingerprintFile(join(root, 'run.csv'));
    const audit = {
      auditVersion: 'test',
      root: join(root, 'wrong-root'),
      totalFiles: 2,
      records: [
        { path: 'run.csv', bytes: fingerprint.bytes, sha256: fingerprint.sha256 },
        { path: 'run.csv', bytes: fingerprint.bytes, sha256: fingerprint.sha256 }
      ]
    };
    const result = await compareSourceToAudit({ sourceRoot: root, audit });
    assert.equal(result.auditValid, false);
    assert.equal(result.drift, true);
    assert.deepEqual(result.duplicateAuditPaths, ['run.csv']);
    assert.equal(result.auditIssues.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('T02 source integrity accepts a redacted public audit root while validating file fingerprints', async () => {
  const root = await mkdtemp(join(tmpdir(), 'h2-testlens-source-integrity-redacted-'));
  try {
    await writeFile(join(root, 'run.csv'), 'timestamp_s,current_a\n0,1\n', 'utf8');
    const fingerprint = await fingerprintFile(join(root, 'run.csv'));
    const audit = { auditVersion: 'test', root: 'T02_SOURCE_ROOT', sourceRootLabel: 'T02_SOURCE_ROOT', pathDisclosure: 'redacted', totalFiles: 1, records: [{ path: 'run.csv', bytes: fingerprint.bytes, sha256: fingerprint.sha256 }] };
    const result = await compareSourceToAudit({ sourceRoot: root, audit });
    assert.equal(result.auditValid, true);
    assert.equal(result.drift, false);
    assert.equal(result.auditRootLabel, 'T02_SOURCE_ROOT');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
