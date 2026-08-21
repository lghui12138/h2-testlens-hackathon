import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';
import vm from 'node:vm';
import * as SheetJS from 'xlsx';
import { analyzeRows, publicAnalysis, reportMarkdown } from '../src/analyzer.mjs';
import { parseDataWorkbook } from '../src/excel-workflow.mjs';
import { parseDurabilityDocx, setDocxEngine } from '../src/docx-workflow.mjs';
import { buildEnterpriseWorkbook, setSpreadsheetEngine, workbookArrayBuffer } from '../src/excel-workflow.mjs';
import { sendFeishuAlert } from '../src/feishu-alerts.mjs';
import { sha256Bytes } from '../src/provenance.mjs';
import { diffManifests } from '../src/incremental.mjs';
import { profilesFromPackage } from '../src/profiles.mjs';

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
  const packageResult = profilesFromPackage(JSON.parse(await readFile(profilePath, 'utf8')));
  if (!packageResult.ok) throw new Error(`profile_invalid: ${packageResult.errors.join('；')}`);
  const profile = packageResult.profiles.find((candidate) => candidate.id === profileId) || packageResult.profiles[0];
  return { ...profile.thresholds, profileId: profile.id, profileName: profile.name, profileSource: profile.source, profileOrganization: packageResult.organization, approvalStatus: profile.approvalStatus, applicationScope: profile.applicationScope, intendedUse: profile.intendedUse, methodId: profile.methodId, revision: profile.revision, standardRefs: profile.standardRefs, requiredMetadata: profile.requiredMetadata, requiredMeasurements: profile.requiredMeasurements, requiredPhases: profile.requiredPhases, supportedDatasetTypes: profile.supportedDatasetTypes, vehicleTargets: profile.vehicleTargets, vehicleCurrentToleranceA: profile.vehicleCurrentToleranceA, vehicleMinimumDurationS: profile.vehicleMinimumDurationS, durabilityRules: profile.durabilityRules, acceptanceCriteria: profile.acceptanceCriteria, uncertaintyModelRequired: profile.uncertaintyModelRequired, uncertaintyModel: profile.uncertaintyModel, testMetadata: {} };
}

async function decodeText(buffer, filePath) {
  const encoding = /\.(txt|tsv)$/i.test(filePath) ? 'gb18030' : 'utf-8';
  try { return new TextDecoder(encoding).decode(buffer); } catch { return new TextDecoder('utf-8').decode(buffer); }
}

async function parseInput(filePath, buffer) {
  const extension = extname(filePath).toLowerCase();
  if (extension === '.docx') {
    await ensureDocxEngine();
    const report = await parseDurabilityDocx(buffer);
    return { rows: report.points.map((point) => ({ ...point, source_file: basename(filePath) })), config: { durabilityReports: [report] }, inputType: 'docx' };
  }
  if (extension === '.xlsx' || extension === '.xlsm') {
    const workbook = parseDataWorkbook(buffer);
    if (!workbook.ok) throw new Error(workbook.errors.join('；'));
    return { rows: workbook.rows, config: {}, inputType: `xlsx:${workbook.sheetName}` };
  }
  const text = await decodeText(buffer, filePath);
  const { parseCSV } = await import('../src/analyzer.mjs');
  return { rows: parseCSV(text), config: {}, inputType: extension.slice(1) };
}

function safeStem(relativePath) {
  return relativePath.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-160) || 'test-run';
}

async function runOnce(options) {
  const files = await walk(options.inputDir, options.outputDir);
  const manifest = [];
  const loaded = [];
  for (const filePath of files) {
    const buffer = await readFile(filePath); const info = await stat(filePath); const parsed = await parseInput(filePath, buffer); const relativePath = relative(options.inputDir, filePath);
    manifest.push({ name: relativePath, size: info.size, rowCount: parsed.rows.length, hash: await sha256Bytes(buffer), hashType: 'binary', inputType: parsed.inputType });
    loaded.push({ filePath, relativePath, parsed });
  }
  let previous = [];
  try { previous = JSON.parse(await readFile(options.statePath, 'utf8')).files || []; } catch {}
  const diff = diffManifests(previous, manifest);
  const changedNames = new Set([...diff.added, ...diff.changed].map((entry) => entry.name));
  const reports = []; const errors = [];
  for (const item of loaded.filter((candidate) => changedNames.has(candidate.relativePath))) {
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
  await writeFile(options.statePath, `${JSON.stringify({ version: 'h2-testlens.batch-watch.v1', updatedAt: new Date().toISOString(), inputDir: options.inputDir, files: manifest, lastRun: { diff: { added: diff.added.length, changed: diff.changed.length, unchanged: diff.unchanged.length, removed: diff.removed.length }, reports, errors } }, null, 2)}\n`, 'utf8');
  return { inputDir: options.inputDir, outputDir: options.outputDir, files: manifest.length, diff: { added: diff.added.length, changed: diff.changed.length, unchanged: diff.unchanged.length, removed: diff.removed.length }, processed: reports.length, errors };
}

const args = process.argv.slice(2);
if (hasArg(args, '--help') || !argValue(args, '--dir')) {
  console.log('Usage: node scripts/batch-watch.mjs --dir INPUT_DIR [--output OUTPUT_DIR] [--profile PROFILE_JSON] [--profile-id ID] [--once] [--send-alerts]');
  process.exitCode = hasArg(args, '--help') ? 0 : 2;
} else {
  const inputDir = resolve(argValue(args, '--dir'));
  const outputDir = resolve(argValue(args, '--output', join(inputDir, '_h2-testlens-output')));
  const statePath = resolve(argValue(args, '--state', join(outputDir, '.h2-testlens-manifest.json')));
  await mkdir(outputDir, { recursive: true });
  const options = { inputDir, outputDir, statePath, profile: await loadProfile(argValue(args, '--profile'), argValue(args, '--profile-id')), sendAlerts: hasArg(args, '--send-alerts') };
  const run = async () => console.log(JSON.stringify(await runOnce(options), null, 2));
  await run();
  if (!hasArg(args, '--once')) setInterval(run, Number(argValue(args, '--interval-ms', 60000)));
}
