#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { buildT02IntegrationReport } from '../src/t02-report.mjs';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const packageVersion = JSON.parse(await readFile(`${repoRoot}/package.json`, 'utf8')).version;
const evidenceRoot = `${repoRoot}/.research/ignite_t02_standards_20260821`;
const coveragePath = resolve(process.argv[2] || `${evidenceRoot}/t02_coverage_audit_v${packageVersion}.json`);
const referencePath = resolve(process.argv[3] || `${evidenceRoot}/t02_reference_audit_v${packageVersion}.json`);
const outputPath = resolve(process.argv[4] || `${evidenceRoot}/t02_integration_report_v${packageVersion}.md`);
const coverage = JSON.parse(await readFile(coveragePath, 'utf8'));
const reference = JSON.parse(await readFile(referencePath, 'utf8'));
const report = buildT02IntegrationReport({
  coverage,
  reference,
  coveragePath: relative(repoRoot, coveragePath) || coveragePath,
  referencePath: relative(repoRoot, referencePath) || referencePath
});
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, report, 'utf8');
console.log(JSON.stringify({ outputPath, auditVersion: coverage.auditVersion, totalFiles: coverage.totalFiles, processedRowsEnteredAdapters: coverage.utilization?.processedRowsEnteredAdapters }, null, 2));
