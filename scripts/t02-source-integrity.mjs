#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, relative, resolve } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const defaultSourceRoot = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';

export async function listSourceFiles(sourceRoot) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  await walk(resolve(sourceRoot));
  return files.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

export async function fingerprintFile(path) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { bytes, sha256: hash.digest('hex') };
}

export async function compareSourceToAudit({ sourceRoot, audit }) {
  if (!sourceRoot) throw new Error('sourceRoot is required');
  if (!audit || !Array.isArray(audit.records)) throw new Error('audit.records is required');
  const root = resolve(sourceRoot);
  const actualFiles = await listSourceFiles(root);
  const auditPaths = audit.records.map((record) => record.path);
  const duplicateAuditPaths = [...new Set(auditPaths.filter((path, index) => auditPaths.indexOf(path) !== index))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const auditRoot = audit.root ? resolve(audit.root) : null;
  const auditRootMismatch = Boolean(auditRoot && auditRoot !== root);
  const auditTotalFilesMismatch = Number.isInteger(audit.totalFiles) && audit.totalFiles !== audit.records.length;
  const auditIssues = [
    ...(auditRootMismatch ? [`audit root mismatch: ${auditRoot} != ${root}`] : []),
    ...(auditTotalFilesMismatch ? [`audit totalFiles mismatch: ${audit.totalFiles} != ${audit.records.length}`] : []),
    ...(duplicateAuditPaths.length ? [`duplicate audit paths: ${duplicateAuditPaths.join(', ')}`] : [])
  ];
  const expected = new Map(audit.records.map((record) => [record.path, { bytes: record.bytes, sha256: record.sha256 }]));
  const actual = new Map();
  for (const path of actualFiles) {
    const fingerprint = await fingerprintFile(path);
    actual.set(relative(root, path), fingerprint);
  }
  const added = [...actual.keys()].filter((path) => !expected.has(path)).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const missing = [...expected.keys()].filter((path) => !actual.has(path)).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const changed = [];
  for (const [path, expectedFingerprint] of expected) {
    const actualFingerprint = actual.get(path);
    if (actualFingerprint && (actualFingerprint.bytes !== expectedFingerprint.bytes || actualFingerprint.sha256 !== expectedFingerprint.sha256)) {
      changed.push({ path, expected: expectedFingerprint, actual: actualFingerprint });
    }
  }
  changed.sort((a, b) => a.path.localeCompare(b.path, 'zh-Hans-CN'));
  return {
    auditVersion: audit.auditVersion || null,
    sourceRoot: root,
    auditRoot,
    auditValid: auditIssues.length === 0,
    auditIssues,
    duplicateAuditPaths,
    auditFiles: expected.size,
    auditRecords: audit.records.length,
    sourceFiles: actual.size,
    unchanged: actual.size - added.length - changed.length,
    added,
    missing,
    changed,
    drift: auditIssues.length > 0 || added.length > 0 || missing.length > 0 || changed.length > 0
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const sourceRoot = resolve(process.argv[2] || defaultSourceRoot);
  const packageVersion = JSON.parse(await readFile(`${repoRoot}/package.json`, 'utf8')).version;
  const auditPath = resolve(process.argv[3] || `${repoRoot}/.research/ignite_t02_standards_20260821/t02_coverage_audit_v${packageVersion}.json`);
  const audit = JSON.parse(await readFile(auditPath, 'utf8'));
  const result = await compareSourceToAudit({ sourceRoot, audit });
  console.log(JSON.stringify({ ...result, auditPath, checkedExtensions: [...new Set(audit.records.map((record) => extname(record.path).toLowerCase()))].sort() }, null, 2));
  if (result.drift) process.exitCode = 1;
}
