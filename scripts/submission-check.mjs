import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseJsonlLedger, validateEvidenceLedger, validateProfileEvidenceBindings } from '../src/standard-evidence.mjs';

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
  'docs/STANDARD_BOUNDARY_MATRIX.md',
  'docs/COMPLETION_REPORT.md',
  'docs/CHANGE_MANIFEST.yaml',
  'docs/DEPLOYMENT.md',
  'docs/ENTERPRISE_READINESS.md',
  'docs/STANDARD_WORKFLOW.md',
  'docs/ENTERPRISE_DATA_INTEGRATION.md',
  'docs/SECURITY_BOUNDARIES.md',
  'docs/T02_REQUIREMENTS_MATRIX.md',
  'src/index.html',
  'src/analyzer.mjs',
  'src/structured-evidence.mjs',
  'src/standard-evidence.mjs',
  'src/enterprise-adapters.mjs',
  'src/excel-workflow.mjs',
  'src/docx-workflow.mjs',
  'src/feishu-alerts.mjs',
  'src/xlsx-charts.mjs',
  'src/incremental.mjs',
  'src/vendor/xlsx.full.min.js',
  'src/xlsx-node-loader.mjs',
  'src/vendor/xlsx.LICENSE.txt',
  'src/vendor/mammoth.browser.min.js',
  'src/vendor/mammoth.LICENSE.txt',
  'src/vendor/jszip.min.js',
  'src/vendor/jszip.LICENSE.txt',
  'src/ai-draft.mjs',
  'src/compare.mjs',
  'src/history.mjs',
  'src/profiles.mjs',
  'src/provenance.mjs',
  'src/display-sampling.mjs',
  'src/analysis-worker.mjs',
  'src/browser-engines.mjs',
  'src/input-safety.mjs',
  'src/batch-aggregation.mjs',
  'src/t02-report.mjs',
  'scripts/t02-source-integrity.mjs',
  'tests/input-surface.test.mjs',
  'tests/input-safety.test.mjs',
  'tests/batch-aggregation.test.mjs',
  'tests/evaluation-mode.test.mjs',
  'tests/t02-audit.test.mjs',
  'tests/t02-source-integrity.test.mjs',
  'scripts/ai-eval.mjs',
  'scripts/submission-check.mjs',
  'scripts/package-submission.mjs',
  'scripts/api-smoke.mjs',
  'scripts/prepare-github-pages.mjs',
  'scripts/profile-audit.mjs',
  'scripts/batch-watch.mjs',
  'scripts/t02-coverage-audit.mjs',
  'scripts/t02-reference-audit.mjs',
  'scripts/t02-report.mjs',
  '.github/workflows/deploy-pages.yml',
  'config/enterprise-profile.example.json',
  'config/t02-profile.example.json',
  'config/batch-declaration.example.json',
  'public/config/enterprise-profile.example.json',
  'public/config/t02-profile.example.json',
  'public/config/batch-declaration.example.json',
  'config/enterprise-parameter-template.xlsx',
  'public/og-card.svg',
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
const readme = await readFile(join(root, 'README.md'), 'utf8');
const manifest = await readFile(join(root, 'docs/CHANGE_MANIFEST.yaml'), 'utf8');
const brief = await readFile(join(root, 'docs/SUBMISSION_BRIEF.md'), 'utf8');
const submissionPackage = await readFile(join(root, 'docs/SUBMISSION_PACKAGE.md'), 'utf8');
const coverageAudit = await readFile(join(root, 'scripts/t02-coverage-audit.mjs'), 'utf8');
const referenceAudit = await readFile(join(root, 'scripts/t02-reference-audit.mjs'), 'utf8');
const t02ReportSource = await readFile(join(root, 'src/t02-report.mjs'), 'utf8');
const enterpriseConfig = await readFile(join(root, 'config/enterprise-profile.example.json'), 'utf8');
const publicEnterpriseConfig = await readFile(join(root, 'public/config/enterprise-profile.example.json'), 'utf8');
const t02ProfileConfig = await readFile(join(root, 'config/t02-profile.example.json'), 'utf8');
const publicT02ProfileConfig = await readFile(join(root, 'public/config/t02-profile.example.json'), 'utf8');
const batchDeclaration = await readFile(join(root, 'config/batch-declaration.example.json'), 'utf8');
const publicBatchDeclaration = await readFile(join(root, 'public/config/batch-declaration.example.json'), 'utf8');
const completionReport = await readFile(join(root, 'docs/COMPLETION_REPORT.md'), 'utf8');
const roadmap = await readFile(join(root, 'ROADMAP.md'), 'utf8');
const apiDoc = await readFile(join(root, 'docs/API.md'), 'utf8');
const enterpriseDataIntegration = await readFile(join(root, 'docs/ENTERPRISE_DATA_INTEGRATION.md'), 'utf8');
const requirementsMatrix = await readFile(join(root, 'docs/T02_REQUIREMENTS_MATRIX.md'), 'utf8');
const sourceIntegrity = await readFile(join(root, 'scripts/t02-source-integrity.mjs'), 'utf8');
const excelWorkflow = await readFile(join(root, 'src/excel-workflow.mjs'), 'utf8');
const securityBoundaries = await readFile(join(root, 'docs/SECURITY_BOUNDARIES.md'), 'utf8');
const viteConfig = await readFile(join(root, 'vite.config.ts'), 'utf8');
const profileSource = await readFile(join(root, 'src/profiles.mjs'), 'utf8');
const sourcesLedgerParsed = parseJsonlLedger(await readFile(join(root, '.research/ignite_t02_standards_20260821/sources.jsonl'), 'utf8'), 'sources');
const evidenceLedgerParsed = parseJsonlLedger(await readFile(join(root, '.research/ignite_t02_standards_20260821/evidence.jsonl'), 'utf8'), 'evidence');
const claimsLedgerParsed = parseJsonlLedger(await readFile(join(root, '.research/ignite_t02_standards_20260821/claims.jsonl'), 'utf8'), 'claims');
const evidenceLedger = validateEvidenceLedger({ sources: sourcesLedgerParsed.rows, evidence: evidenceLedgerParsed.rows, claims: claimsLedgerParsed.rows });
const enterpriseProfile = JSON.parse(enterpriseConfig);
const profileEvidenceBindings = validateProfileEvidenceBindings(enterpriseProfile, evidenceLedgerParsed.rows, { requireEvidenceIds: true });
const t02ProfileSourceHasExplicitMode = (text) => {
  try {
    const payload = JSON.parse(text);
    return payload.profiles?.length === 3 && payload.profiles.every((profile) => profile.evaluationMode === 'descriptive_only');
  } catch { return false; }
};
checks.push({ id: 'config:public-profile-parity', pass: enterpriseConfig === publicEnterpriseConfig });
checks.push({ id: 'config:t02-profile-parity', pass: t02ProfileConfig === publicT02ProfileConfig });
const t02ProfilePayload = JSON.parse(t02ProfileConfig);
checks.push({ id: 'profile:t02-descriptive-package', pass: t02ProfilePayload.profiles?.length === 3 && t02ProfilePayload.profiles.every((profile) => profile.evaluationMode === 'descriptive_only' && profile.thresholds === null && profile.supportedDatasetTypes?.length === 1) });
checks.push({ id: 'config:public-batch-declaration-parity', pass: batchDeclaration === publicBatchDeclaration });
const coverageEvidencePath = join(root, '.research/ignite_t02_standards_20260821', `t02_coverage_audit_v${packageJson.version}.json`);
const referenceEvidencePath = join(root, '.research/ignite_t02_standards_20260821', `t02_reference_audit_v${packageJson.version}.json`);
const integrationReportPath = join(root, '.research/ignite_t02_standards_20260821', `t02_integration_report_v${packageJson.version}.md`);
checks.push({ id: 'track:T02', pass: brief.includes('T02') && manifest.includes('T02') });
checks.push({ id: 'checksum:no-embedded-self-reference', pass: !/verified SHA-256:\s*`[a-f0-9]{64}`/i.test(submissionPackage) });
checks.push({ id: 't02:actual-parser-audit', pass: coverageAudit.includes('auditVersion: packageVersion') && coverageAudit.includes('batchAggregation') && coverageAudit.includes('crossReportDurabilitySummary') && coverageAudit.includes('referenceSummary') && coverageAudit.includes('analyzeEnterpriseRows') && coverageAudit.includes('parseDataWorkbook') && coverageAudit.includes('parseDurabilityDocx') });
checks.push({ id: 't02:usage-ledger-source', pass: coverageAudit.includes('const usageLedger') && coverageAudit.includes('recordsWithUsageLedger') && coverageAudit.includes('formalConformityClaim') && coverageAudit.includes('fieldUsageByRole') && coverageAudit.includes('referenceAudit') });
checks.push({ id: 't02:coverage-default-artifact', pass: coverageAudit.includes('t02_coverage_audit_v${packageVersion}.json') && coverageAudit.includes('await mkdir(dirname(outputPath)') });
const batchAggregationSource = await readFile(join(root, 'src/batch-aggregation.mjs'), 'utf8');
const batchWatchSource = await readFile(join(root, 'scripts/batch-watch.mjs'), 'utf8');
const serverSource = await readFile(join(root, 'server.mjs'), 'utf8');
checks.push({ id: 'batch:declaration-gate', pass: batchAggregationSource.includes('h2-testlens.batch-declaration.v1') && batchAggregationSource.includes('restartBoundaries') && batchAggregationSource.includes('descriptive_only') && batchWatchSource.includes('--batch-declaration') && serverSource.includes('/api/analyze-batch') });
checks.push({ id: 'batch:observation-gate', pass: batchAggregationSource.includes('observeDeclaredBatch') && batchAggregationSource.includes('samplingTolerancePct') && batchAggregationSource.includes('BATCH_FILE_TIME_SEQUENCE_INVALID') && batchAggregationSource.includes('BATCH_CROSS_FILE_BOUNDARY_MISSING') && batchWatchSource.includes('observationStatus') && serverSource.includes('observeDeclaredBatch') });
checks.push({ id: 'evaluation-mode:routing', pass: serverSource.includes('evaluationMode: profile.evaluationMode') && batchWatchSource.includes('evaluationMode: profile.evaluationMode') && t02ProfileSourceHasExplicitMode(t02ProfileConfig) });
checks.push({ id: 't02:reference-audit-versioned', pass: referenceAudit.includes('auditVersion: packageVersion') && referenceAudit.includes('claimsFor') && referenceAudit.includes('pdftotext') && referenceAudit.includes('pandoc') });
checks.push({ id: 't02:reference-default-artifact', pass: referenceAudit.includes('t02_reference_audit_v${packageVersion}.json') && referenceAudit.includes('await mkdir(dirname(outputPath)') });
checks.push({ id: 't02:integration-report', pass: t02ReportSource.includes('全文件使用台账') && t02ReportSource.includes('blocked_binary') && t02ReportSource.includes('formalConformityClaim') && packageJson.scripts?.['t02:report'] === 'node scripts/t02-report.mjs' });
checks.push({ id: 'current-version:documentation', pass: readme.includes(`当前交付版本：**v${packageJson.version}**`) && readme.includes(`t02_coverage_audit_v${packageJson.version}.json`) && readme.includes(`t02_reference_audit_v${packageJson.version}.json`) && readme.includes(`t02_integration_report_v${packageJson.version}.md`) && completionReport.includes(`Current revision: **v${packageJson.version}**`) && roadmap.includes(`## v${packageJson.version} current continuation evidence`) && enterpriseDataIntegration.includes(`v${packageJson.version} 实际重放结果`) && requirementsMatrix.includes(`当前 v${packageJson.version} 机器证据`) && submissionPackage.includes(`h2-testlens-submission-v${packageJson.version}.zip`) && apiDoc.includes('evaluationMode') && manifest.includes(`h2-testlens-v${packageJson.version.replaceAll('.', '-')}`) });
checks.push({ id: 't02:source-integrity-contract', pass: packageJson.scripts?.['t02:integrity'] === 'node scripts/t02-source-integrity.mjs' && sourceIntegrity.includes('compareSourceToAudit') && sourceIntegrity.includes('sha256') && sourceIntegrity.includes('drift') });
checks.push({ id: 'profile:standard-reference-provenance', pass: profileSource.includes('standardReferenceReadiness') && profileSource.includes('effectiveDate_before_publicationDate') && enterpriseConfig.includes('methodSource') && enterpriseConfig.includes('publicationDate') && enterpriseConfig.includes('effectiveDate') });
checks.push({ id: 't02:evidence-ledger-closure', pass: sourcesLedgerParsed.errors.length === 0 && evidenceLedgerParsed.errors.length === 0 && claimsLedgerParsed.errors.length === 0 && evidenceLedger.ready });
checks.push({ id: 'profile:method-source-evidence-binding', pass: profileEvidenceBindings.ready });
checks.push({ id: 'security:workbook-size-boundary', pass: excelWorkflow.includes('MAX_WORKBOOK_BYTES') && excelWorkflow.includes('workbookInputSafety') && excelWorkflow.includes('超过 ${MAX_WORKBOOK_BYTES / 1024 / 1024} MiB') && securityBoundaries.includes('64 MiB 压缩输入') && securityBoundaries.includes('不是 GB/T、ISO 或企业验收限值') });
checks.push({ id: 'security:workbook-zip-preflight', pass: excelWorkflow.includes('MAX_WORKBOOK_UNCOMPRESSED_BYTES') && excelWorkflow.includes('MAX_WORKBOOK_ZIP_ENTRIES') && excelWorkflow.includes('MAX_WORKBOOK_COMPRESSION_RATIO') && excelWorkflow.includes('ZIP64') && excelWorkflow.includes('中央目录') && securityBoundaries.includes('256 MiB 声明展开大小') && securityBoundaries.includes('2048 个 ZIP 条目') && securityBoundaries.includes('200:1 压缩比') });
checks.push({ id: 'build:optional-hosting-config', pass: viteConfig.includes('optionalSitesPlugin') && viteConfig.includes('existsSync(hostingConfigPath)') && viteConfig.includes('hasHostingConfig ? [optionalSitesPlugin()]') });
try {
  const coverageEvidence = JSON.parse(await readFile(coverageEvidencePath, 'utf8'));
  checks.push({ id: 't02:coverage-evidence', pass: coverageEvidence.auditVersion === packageJson.version && coverageEvidence.totalFiles === 198 && coverageEvidence.counts?.processed === 190 && coverageEvidence.counts?.reference_only === 6 && coverageEvidence.counts?.blocked_binary === 1 && coverageEvidence.counts?.declared_no_upload === 1 && coverageEvidence.duplicateProcessedHashes?.length === 0 });
  checks.push({ id: 't02:usage-ledger-evidence', pass: coverageEvidence.utilization?.ledgerVersion === '1' && coverageEvidence.utilization?.totalRecords === coverageEvidence.totalFiles && coverageEvidence.utilization?.recordsWithUsageLedger === coverageEvidence.totalFiles && coverageEvidence.utilization?.formalConformityClaims === 0 && coverageEvidence.utilization?.processedRowsEnteredAdapters === 2262283 && coverageEvidence.records?.every((record) => record.usageLedger?.disposition && record.usageLedger.formalConformityClaim === false) });
  const durabilitySummary = coverageEvidence.batchAggregation?.['企业资料包02_氢质氢离']?.businessAggregation?.durability?.crossReportDescriptiveSummary;
  const comparabilityAudit = durabilitySummary?.comparabilityAudit;
  checks.push({ id: 't02:durability-comparability-evidence', pass: durabilitySummary?.reportCount === 8 && comparabilityAudit?.auditStatus === 'screened' && comparabilityAudit?.comparable === false && comparabilityAudit.issueCodes?.includes('DURABILITY_COMPARABILITY_STACK_MODEL_MISMATCH') && coverageEvidence.batchAggregation?.['企业资料包02_氢质氢离']?.closure?.crossReportDurabilityComparabilityAudit === true });
  const referenceBoundaryRecords = coverageEvidence.records?.filter((record) => ['reference_only', 'declared_no_upload'].includes(record.status)) || [];
  checks.push({ id: 't02:reference-ledger-evidence', pass: referenceBoundaryRecords.length === 7 && referenceBoundaryRecords.every((record) => record.usageLedger?.referenceAudit?.required === true && record.usageLedger.referenceAudit.joinKey === record.path && record.usageLedger.referenceAudit.expectedStatus === 'extracted_reference') });
} catch (error) { checks.push({ id: 't02:coverage-evidence', pass: false, detail: error.message }); }
try {
  const referenceEvidence = JSON.parse(await readFile(referenceEvidencePath, 'utf8'));
  checks.push({ id: 't02:reference-evidence', pass: referenceEvidence.auditVersion === packageJson.version && referenceEvidence.totalReferenceFiles === 7 && referenceEvidence.parserErrors === 0 });
  const sourceEvidence = referenceEvidence.sourceEvidenceSummary;
  checks.push({ id: 't02:reference-source-evidence-ledger', pass: Boolean(sourceEvidence) && Number.isInteger(sourceEvidence.claimsTotal) && Number.isInteger(sourceEvidence.completeClaims) && Number.isInteger(sourceEvidence.incompleteClaims) && sourceEvidence.claimsTotal === sourceEvidence.completeClaims + sourceEvidence.incompleteClaims && Array.isArray(sourceEvidence.incompleteSourceEvidence) && sourceEvidence.incompleteSourceEvidence.length === sourceEvidence.incompleteClaims });
} catch (error) { checks.push({ id: 't02:reference-evidence', pass: false, detail: error.message }); }
try {
  const integrationReport = await readFile(integrationReportPath, 'utf8');
  checks.push({ id: 't02:integration-report-evidence', pass: (integrationReport.match(/^\| \d+ \| /gm) || []).length === 198 && integrationReport.includes('不证明 GB/T 45541-2025') && integrationReport.includes('blocked_binary') && integrationReport.includes('耐久跨报告可比性筛查') && integrationReport.includes('DURABILITY_COMPARABILITY_STACK_MODEL_MISMATCH') && integrationReport.includes('参考内容审计交叉链接：7/7') });
} catch (error) { checks.push({ id: 't02:integration-report-evidence', pass: false, detail: error.message }); }
checks.push({ id: 'script:test', pass: packageJson.scripts?.test === 'node --test' });
checks.push({ id: 'script:typecheck', pass: packageJson.scripts?.typecheck === 'tsc --noEmit --pretty false' });
checks.push({ id: 'script:ai-eval', pass: packageJson.scripts?.['eval:ai'] === 'node scripts/ai-eval.mjs' });
checks.push({ id: 'script:submission-check', pass: packageJson.scripts?.['check:submission'] === 'node scripts/submission-check.mjs' });
checks.push({ id: 'script:package-submission', pass: packageJson.scripts?.['package:submission'] === 'node scripts/package-submission.mjs' });
checks.push({ id: 'script:smoke-api', pass: packageJson.scripts?.['smoke:api'] === 'node scripts/api-smoke.mjs' });
checks.push({ id: 'script:t02-coverage', pass: packageJson.scripts?.['t02:coverage'] === 'node scripts/t02-coverage-audit.mjs' });
checks.push({ id: 'script:t02-reference', pass: packageJson.scripts?.['t02:reference'] === 'node scripts/t02-reference-audit.mjs' });
checks.push({ id: 'script:t02-report', pass: packageJson.scripts?.['t02:report'] === 'node scripts/t02-report.mjs' });

for (const [id, command, args] of [
  ['tests', 'npm', ['test']],
  ['ai-grounding', 'npm', ['run', 'eval:ai']],
  ['api-smoke', 'npm', ['run', 'smoke:api']],
  ['profile-audit', 'npm', ['run', 'profile:audit', '--', 'config/enterprise-profile.example.json']],
  ['profile-audit-t02', 'npm', ['run', 'profile:audit', '--', 'config/t02-profile.example.json']]
]) {
  try { await exec(command, args, { cwd: root, maxBuffer: 2_000_000 }); checks.push({ id, pass: true }); }
  catch (error) { checks.push({ id, pass: false, detail: error.stdout?.slice(-1000) ?? error.message }); }
}

const passed = checks.filter((check) => check.pass).length;
const report = { suite: 'h2-testlens-submission-readiness.v1', version: packageJson.version, checks: checks.length, passed, failed: checks.length - passed, results: checks };
console.log(JSON.stringify(report, null, 2));
if (report.failed) process.exitCode = 1;
