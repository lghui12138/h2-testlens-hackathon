import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { analyzeRows, publicAnalysis, reportMarkdown } from '../src/analyzer.mjs';
import { parseDataWorkbook } from '../src/excel-workflow.mjs';
import { parseDurabilityDocx, setDocxEngine } from '../src/docx-workflow.mjs';
import { buildEnterpriseWorkbook, setSpreadsheetEngine, workbookArrayBuffer } from '../src/excel-workflow.mjs';
import { sendFeishuAlert } from '../src/feishu-alerts.mjs';
import { sha256Bytes } from '../src/provenance.mjs';
import { diffManifests } from '../src/incremental.mjs';
import { profilesFromPackage } from '../src/profiles.mjs';
import { decodeTextBuffer } from '../src/input-safety.mjs';
import { annotateDeclaredBatchRows, batchAggregationMarkdown, observeDeclaredBatch, summarizeDeclaredBatch, validateBatchDeclaration } from '../src/batch-aggregation.mjs';
import { loadXlsx } from '../src/xlsx-node-loader.mjs';

const SheetJS = await loadXlsx();
setSpreadsheetEngine(SheetJS);
let docxReady = false;
const repoRoot = resolve(new URL('..', import.meta.url).pathname);

async function ensureDocxEngine() {
  if (docxReady) return;
  vm.runInThisContext(await readFile(join(repoRoot, 'src/vendor/mammoth.browser.min.js'), 'utf8'));
  setDocxEngine(globalThis.mammoth);
  docxReady = true;
}

const allowedExtensions = new Set(['.csv', '.txt', '.tsv', '.xlsx', '.xlsm', '.docx']);
const argValue = (args, name, fallback = null) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] || fallback : fallback; };
const hasArg = (args, name) => args.includes(name);

async function walk(dir, outputDir, files = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { if (resolve(path) !== resolve(outputDir)) await walk(path, outputDir, files); continue; }
    if (allowedExtensions.has(extname(entry.name).toLowerCase())) files.push(path);
  }
  return files.sort();
}

async function loadProfile(profilePath, profileId) {
  if (!profilePath) return {};
  const ledger = JSON.parse(await readFile(join(repoRoot, 'config/standard-evidence-ledger.v1.json'), 'utf8'));
  const trustedApprovalLedger = JSON.parse(await readFile(join(repoRoot, 'config/trusted-approval-ledger.v1.json'), 'utf8'));

  const packageResult = profilesFromPackage(JSON.parse(await readFile(profilePath, 'utf8')), { requireEvidenceLedger: true, evidenceRows: ledger.evidenceRows || [], requireApprovalLedger: true, approvalRows: trustedApprovalLedger.approvalRows || [] });
  if (!packageResult.ok) throw new Error(`profile_invalid: ${packageResult.errors.join('；')}`);
  const profile = packageResult.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) throw new Error(`profile_not_found: ${profileId}`);
  return { ...profile.thresholds, profileId: profile.id, profileName: profile.name, profileSource: profile.source, profileOrganization: packageResult.organization, approvalStatus: profile.approvalStatus, approvalEvidence: profile.approvalEvidence, applicationScope: profile.applicationScope, intendedUse: profile.intendedUse, methodId: profile.methodId, revision: profile.revision, standardRefs: profile.standardRefs, standardEvidenceBinding: profile.standardEvidenceBinding || packageResult.standardEvidenceBinding, methodSource: profile.methodSource, methodImplementationEvidence: profile.methodImplementationEvidence, methodExecutionStatus: profile.methodExecutionStatus, evaluationMode: profile.evaluationMode, status: profile.status, publicationDate: profile.publicationDate, effectiveDate: profile.effectiveDate, scopeEvidence: profile.scopeEvidence, workflowEvidence: profile.workflowEvidence, requiredMetadata: profile.requiredMetadata, requiredMeasurements: profile.requiredMeasurements, dataQualityRequirements: profile.dataQualityRequirements, requiredPhases: profile.requiredPhases, requiredPhaseMetrics: profile.requiredPhaseMetrics, phaseAcceptanceRules: profile.phaseAcceptanceRules, phaseAliases: profile.phaseAliases, requiredTestStages: profile.requiredTestStages, workflowSequence: profile.workflowSequence, testSystemRequirements: profile.testSystemRequirements, testConditionRequirements: profile.testConditionRequirements, environmentConditionRequirements: profile.environmentConditionRequirements, phaseResultRequirements: profile.phaseResultRequirements, measurementMethodRequirements: profile.measurementMethodRequirements, efficiencyRequirement: profile.efficiencyRequirement, scopeRules: profile.scopeRules, instrumentRequirements: profile.instrumentRequirements, reportRequirements: profile.reportRequirements, acceptanceRules: profile.acceptanceRules, supportedDatasetTypes: profile.supportedDatasetTypes, vehicleTargets: profile.vehicleTargets, vehicleSignalUnits: profile.vehicleSignalUnits, vehicleUnitEvidenceRequired: profile.vehicleUnitEvidenceRequired === true, durabilityRules: profile.durabilityRules, acceptanceCriteria: profile.acceptanceCriteria, uncertaintyModelRequired: profile.uncertaintyModelRequired, uncertaintyModel: profile.uncertaintyModel, testMetadata: {} };
}

async function parseInput(filePath, buffer) {
  const extension = extname(filePath).toLowerCase();
  if (extension === '.docx') {
    await ensureDocxEngine();
    const report = await parseDurabilityDocx(buffer);
    return { rows: report.points.map((point) => ({ ...point, source_file: basename(filePath) })), config: { durabilityReports: [report] }, inputType: 'docx', status: 'processed' };
  }
  if (extension === '.xlsx' || extension === '.xlsm') {
    const workbook = parseDataWorkbook(buffer);
    if (!workbook.ok) throw new Error(workbook.errors.join('；'));
    return { rows: workbook.rows, config: { workbookEvidence: workbook.workbookEvidence || null }, inputType: `xlsx:${workbook.sheetName}`, status: 'processed' };
  }
  const encoding = /\.(txt|tsv)$/i.test(filePath) ? 'gb18030' : 'utf-8';
  const decoded = decodeTextBuffer(buffer, encoding);
  if (decoded.binary) return { rows: [], config: {}, inputType: `${extension.slice(1)}:blocked_binary`, status: 'blocked_binary', binaryReason: decoded.binaryReason || 'unknown', error: `文本入口检测到二进制内容（${decoded.binaryReason || 'unknown'}），未进入解析器` };
  const text = decoded.text;
  const { parseCSV } = await import('../src/analyzer.mjs');
  return { rows: parseCSV(text), config: {}, inputType: extension.slice(1), status: 'processed' };
}

function safeStem(relativePath) {
  return relativePath.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-160) || 'test-run';
}

async function runOnce(options) {
  const files = await walk(options.inputDir, options.outputDir);
  const manifest = [];
  const loaded = [];
  for (const filePath of files) {
    const buffer = await readFile(filePath); const info = await stat(filePath); const relativePath = relative(options.inputDir, filePath);
    let parsed;
    try {
      parsed = await parseInput(filePath, buffer);
    } catch (error) {
      parsed = { rows: [], config: {}, inputType: `${extname(filePath).slice(1)}:parser_error`, status: 'parser_error', error: error.message };
    }
    manifest.push({ name: relativePath, size: info.size, rowCount: parsed.rows.length, firstTimestamp: parsed.rows[0]?.Timestamp || parsed.rows[0]?.timestamp_s || parsed.rows[0]?.['测试时间'] || parsed.rows[0]?.['时间'] || null, lastTimestamp: parsed.rows.at(-1)?.Timestamp || parsed.rows.at(-1)?.timestamp_s || parsed.rows.at(-1)?.['测试时间'] || parsed.rows.at(-1)?.['时间'] || null, hash: await sha256Bytes(buffer), hashType: 'binary', inputType: parsed.inputType, status: parsed.status, error: parsed.error || null });
    loaded.push({ filePath, relativePath, parsed });
  }
  let previous = [];
  try { previous = JSON.parse(await readFile(options.statePath, 'utf8')).files || []; } catch {}
  const diff = diffManifests(previous, manifest);
  const changedNames = new Set([...diff.added, ...diff.changed].map((entry) => entry.name));
  const reports = []; const errors = []; const batchReports = []; const batchErrors = [];
  for (const item of loaded.filter((candidate) => changedNames.has(candidate.relativePath))) {
    if (item.parsed.status !== 'processed') {
      const boundary = { file: item.relativePath, status: item.parsed.status, error: item.parsed.error || '未进入分析器' };
      reports.push(boundary);
      if (item.parsed.status === 'parser_error') errors.push(boundary);
      continue;
    }
    try {
      const result = analyzeRows(item.parsed.rows, { ...options.profile, ...item.parsed.config });
      const stem = safeStem(item.relativePath);
      await writeFile(join(options.outputDir, `${stem}.analysis.json`), `${JSON.stringify(publicAnalysis(result), null, 2)}\n`, 'utf8');
      await writeFile(join(options.outputDir, `${stem}.report.md`), reportMarkdown(result, item.relativePath), 'utf8');
      const workbook = buildEnterpriseWorkbook(result, item.relativePath, { parameterConfig: item.parsed.config.parameterConfig, manifest: [manifest.find((entry) => entry.name === item.relativePath)], incrementalDiff: diff });
      await writeFile(join(options.outputDir, `${stem}.report.xlsx`), Buffer.from(workbookArrayBuffer(workbook)));
      let alert = null;
      if (options.sendAlerts && result.datasetType === 'durability' && result.issues.some((issue) => issue.severity !== 'info')) alert = await sendFeishuAlert(result, { webhookUrl: process.env.H2_FEISHU_WEBHOOK_URL, secret: process.env.H2_FEISHU_SECRET, fileName: item.relativePath });
      reports.push({ file: item.relativePath, datasetType: result.datasetType, verdict: result.verdict, alerts: alert ? { ok: alert.ok, mode: alert.mode, reason: alert.reason } : null });
    } catch (error) { errors.push({ file: item.relativePath, error: error.message }); }
  }
  let batchDeclaration = { status: 'not_provided', path: null, groups: 0, errors: [] };
  if (options.batchDeclarationPath) {
    batchDeclaration = { status: 'invalid', path: options.batchDeclarationPath, groups: 0, errors: [] };
    try {
      const declaration = JSON.parse(await readFile(options.batchDeclarationPath, 'utf8'));
      const validation = validateBatchDeclaration(declaration, manifest);
      batchDeclaration.groups = validation.groups.length;
      batchDeclaration.errors = validation.errors;
      batchDeclaration.status = validation.ok ? 'validated' : 'invalid';
      if (!validation.ok) batchErrors.push(...validation.errors.map((error) => ({ status: 'batch_declaration_invalid', error })));
      for (const group of validation.groups) {
        const groupEntries = group.fileOrder.map((name) => manifest.find((entry) => entry.name === name)).filter(Boolean);
        const groupLoaded = group.fileOrder.map((name) => loaded.find((item) => item.relativePath === name)).filter(Boolean);
        if (groupLoaded.length !== group.fileOrder.length) {
          batchErrors.push({ groupId: group.id, status: 'batch_files_missing', error: '声明文件未全部载入' });
          continue;
        }
        const fileResults = groupLoaded.map((item) => ({ name: item.relativePath, result: analyzeRows(item.parsed.rows, { ...options.profile, ...item.parsed.config }) }));
        const datasetTypes = [...new Set(fileResults.map((item) => item.result.datasetType).filter(Boolean))];
        if (datasetTypes.length > 1) {
          batchErrors.push({ groupId: group.id, status: 'batch_dataset_type_mismatch', error: `同一声明组包含多个数据集类型：${datasetTypes.join('、')}` });
          continue;
        }
        const observation = observeDeclaredBatch(group, fileResults);
        const combinedRows = annotateDeclaredBatchRows(group, groupLoaded.map((item) => ({ name: item.relativePath, rows: item.parsed.rows })));
        const combinedResult = analyzeRows(combinedRows, { ...options.profile, ...groupLoaded[0].parsed.config });
        const summary = summarizeDeclaredBatch(group, groupEntries, fileResults, combinedResult, observation);
        const stem = safeStem(`batch-${group.id}`);
        await writeFile(join(options.outputDir, `${stem}.batch.analysis.json`), `${JSON.stringify({ batchAggregation: summary, analysis: publicAnalysis(combinedResult) }, null, 2)}\n`, 'utf8');
        await writeFile(join(options.outputDir, `${stem}.batch.report.md`), `${batchAggregationMarkdown(summary)}\n${reportMarkdown(combinedResult, `batch-${group.id}`, { batchAggregation: summary })}`, 'utf8');
        const workbook = buildEnterpriseWorkbook(combinedResult, `batch-${group.id}`, { manifest: groupEntries, incrementalDiff: diff });
        await writeFile(join(options.outputDir, `${stem}.batch.report.xlsx`), Buffer.from(workbookArrayBuffer(workbook)));
        batchReports.push({ groupId: group.id, testRunId: group.testRunId, sessionGroup: group.sessionGroup, status: observation.status === 'ready' ? 'processed' : 'not_ready', observationStatus: observation.status, observationIssueCodes: observation.issueCodes, fileCount: summary.fileCount, rowCount: summary.rowCount, datasetType: combinedResult.datasetType, verdict: combinedResult.verdict, boundary: summary.boundary });
      }
    } catch (error) {
      batchDeclaration.errors = [error.message];
      batchErrors.push({ status: 'batch_declaration_parser_error', error: error.message });
    }
  }
  await writeFile(options.statePath, `${JSON.stringify({ version: 'h2-testlens.batch-watch.v1', updatedAt: new Date().toISOString(), inputDir: options.inputDir, files: manifest, batchDeclaration, lastRun: { diff: { added: diff.added.length, changed: diff.changed.length, unchanged: diff.unchanged.length, removed: diff.removed.length }, reports, batchReports, errors, batchErrors } }, null, 2)}\n`, 'utf8');
  return {
    inputDir: options.inputDir,
    outputDir: options.outputDir,
    files: manifest.length,
    diff: { added: diff.added.length, changed: diff.changed.length, unchanged: diff.unchanged.length, removed: diff.removed.length },
    processed: reports.filter((report) => report.datasetType).length,
    blocked: reports.filter((report) => report.status === 'blocked_binary').length,
    parserErrors: reports.filter((report) => report.status === 'parser_error').length,
    errors,
    batchDeclaration,
    batchReports,
    batchErrors
  };
}

export { decodeTextBuffer, parseInput, runOnce };

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (hasArg(args, '--help') || !argValue(args, '--dir')) {
    console.log('Usage: node scripts/batch-watch.mjs --dir INPUT_DIR [--output OUTPUT_DIR] [--state STATE_JSON] [--profile PROFILE_JSON] [--profile-id ID] [--batch-declaration DECLARATION_JSON] [--once] [--send-alerts]');
    process.exitCode = hasArg(args, '--help') ? 0 : 2;
  } else {
  const inputDir = resolve(argValue(args, '--dir'));
  const outputDir = resolve(argValue(args, '--output', join(inputDir, '_h2-testlens-output')));
  const statePath = resolve(argValue(args, '--state', join(outputDir, '.h2-testlens-manifest.json')));
  await mkdir(outputDir, { recursive: true });
  const batchDeclarationPath = argValue(args, '--batch-declaration');
  const options = { inputDir, outputDir, statePath, batchDeclarationPath: batchDeclarationPath ? resolve(batchDeclarationPath) : null, profile: await loadProfile(argValue(args, '--profile'), argValue(args, '--profile-id')), sendAlerts: hasArg(args, '--send-alerts') };
  const run = async () => console.log(JSON.stringify(await runOnce(options), null, 2));
    await run();
    if (!hasArg(args, '--once')) setInterval(run, Number(argValue(args, '--interval-ms', 60000)));
  }
}
