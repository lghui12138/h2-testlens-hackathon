import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDraft } from './src/ai-draft.mjs';
import { analyzeRows, parseCSV, publicAnalysis, reportMarkdown } from './src/analyzer.mjs';
import { compareResults } from './src/compare.mjs';
import { profilesFromPackage } from './src/profiles.mjs';
import { sendFeishuAlert } from './src/feishu-alerts.mjs';
import { annotateDeclaredBatchRows, batchAggregationMarkdown, observeDeclaredBatch, publicBatchAggregation, summarizeDeclaredBatch, validateBatchDeclaration } from './src/batch-aggregation.mjs';

const root = fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const port = Number(process.env.PORT || 4173);
let standardEvidenceRows = [];
let trustedApprovalRows = [];
try {
  const standardEvidence = JSON.parse(await readFile(join(root, 'config/standard-evidence-ledger.v1.json'), 'utf8'));
  standardEvidenceRows = Array.isArray(standardEvidence.evidenceRows) ? standardEvidence.evidenceRows : [];
} catch {}
try {
  const trustedApproval = JSON.parse(await readFile(join(root, 'config/trusted-approval-ledger.v1.json'), 'utf8'));
  trustedApprovalRows = Array.isArray(trustedApproval.approvalRows) ? trustedApproval.approvalRows : [];
} catch {}
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};
const publicRelativeRoots = ['src/', 'sample-data/', 'config/'];

// Enterprise CSV/stack samples are several MB; keep a bounded request size while
// allowing the vehicle and 127-column sample contracts through the local API.
const readBody = async (req, limit = 64_000_000) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('body_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
};

function resolveApiConfig(payload) {
  if (!payload.profilePackage) {
    const config = payload.config && typeof payload.config === 'object' ? payload.config : {};
    const requestsFormalPath = config.approvalStatus === 'approved'
      || config.evaluationMode === 'acceptance'
      || config.methodExecutionStatus === 'FULL_METHOD_IMPLEMENTED'
      || (config.methodSource && typeof config.methodSource === 'object')
      || (Array.isArray(config.standardRefs) && config.standardRefs.length > 0);
    if (requestsFormalPath) {
      const error = new Error('profile_package_required'); error.status = 422; throw error;
    }
    return config;
  }
  const imported = profilesFromPackage(payload.profilePackage, { requireEvidenceLedger: true, evidenceRows: standardEvidenceRows, requireApprovalLedger: true, approvalRows: trustedApprovalRows });
  if (!imported.ok) { const error = new Error('profile_package_invalid'); error.status = 422; error.details = imported.errors; throw error; }
  const profile = imported.profiles.find((candidate) => candidate.id === payload.profileId);
  if (!profile) { const error = new Error('profile_not_found'); error.status = 422; throw error; }
  return { ...profile.thresholds, profileId: profile.id, profileName: profile.name, profileSource: profile.source, profileOrganization: imported.organization, approvalStatus: profile.approvalStatus, approvalEvidence: profile.approvalEvidence, applicationScope: profile.applicationScope, intendedUse: profile.intendedUse, methodId: profile.methodId, revision: profile.revision, standardRefs: profile.standardRefs, standardEvidenceBinding: profile.standardEvidenceBinding || imported.standardEvidenceBinding, trustedApprovalBinding: profile.trustedApprovalBinding || imported.trustedApprovalBinding, methodSource: profile.methodSource, methodImplementationEvidence: profile.methodImplementationEvidence, methodExecutionStatus: profile.methodExecutionStatus, evaluationMode: profile.evaluationMode, status: profile.status, publicationDate: profile.publicationDate, effectiveDate: profile.effectiveDate, scopeEvidence: profile.scopeEvidence, workflowEvidence: profile.workflowEvidence, requiredMetadata: profile.requiredMetadata, traceabilityRequirements: profile.traceabilityRequirements, editLogRequirements: profile.editLogRequirements, requiredMeasurements: profile.requiredMeasurements, acquisitionRequirements: profile.acquisitionRequirements, preCheckRequirements: profile.preCheckRequirements, dataQualityRequirements: profile.dataQualityRequirements, requiredPhases: profile.requiredPhases, requiredPhaseMetrics: profile.requiredPhaseMetrics, phaseAcceptanceRules: profile.phaseAcceptanceRules, phaseAliases: profile.phaseAliases, requiredTestStages: profile.requiredTestStages, workflowSequence: profile.workflowSequence, testSystemRequirements: profile.testSystemRequirements, testConditionRequirements: profile.testConditionRequirements, environmentConditionRequirements: profile.environmentConditionRequirements, phaseResultRequirements: profile.phaseResultRequirements, measurementMethodRequirements: profile.measurementMethodRequirements, efficiencyRequirement: profile.efficiencyRequirement, scopeRules: profile.scopeRules, instrumentRequirements: profile.instrumentRequirements, reportRequirements: profile.reportRequirements, acceptanceRules: profile.acceptanceRules, supportedDatasetTypes: profile.supportedDatasetTypes, vehicleTargets: profile.vehicleTargets, vehicleCurrentToleranceA: profile.vehicleCurrentToleranceA, vehicleSignalUnits: profile.vehicleSignalUnits, vehicleUnitEvidenceRequired: profile.vehicleUnitEvidenceRequired === true, durabilityRules: profile.durabilityRules, acceptanceCriteria: profile.acceptanceCriteria, uncertaintyModelRequired: profile.uncertaintyModelRequired, uncertaintyModel: profile.uncertaintyModel, testMetadata: payload.testMetadata || {}, fieldMapping: imported.fieldMapping };
}

function writeApiError(res, error) {
  const status = error.status ?? (error.message === 'body_too_large' ? 413 : 400);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  const errorCode = status === 413 ? 'request_too_large' : ['profile_package_invalid', 'profile_package_required', 'profile_not_found'].includes(error.message) ? error.message : 'invalid_json';
  res.end(JSON.stringify({ error: errorCode, details: error.details }));
}

const server = createServer(async (req, res) => {
  let requestPath;
  try { requestPath = decodeURIComponent((req.url || '/').split('?')[0]); }
  catch {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'invalid_path_encoding' }));
    return;
  }
  if (req.method === 'POST' && requestPath === '/api/analyze') {
    try {
      const payload = JSON.parse(await readBody(req));
      if (typeof payload.csv !== 'string' || !payload.csv.trim()) {
        res.writeHead(422, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'csv_required' }));
        return;
      }
      const config = { ...resolveApiConfig(payload), sourceHash: 'SHA-256:' + createHash('sha256').update(payload.csv, 'utf8').digest('hex') };
      const result = analyzeRows(parseCSV(payload.csv), config);
      const response = publicAnalysis(result);
      if (payload.fileName) response.source = { ...response.source, fileNamePresent: true };
      if (payload.includeReport) response.reportMarkdown = reportMarkdown(response, 'uploaded-test-run.csv');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(response));
    } catch (error) { writeApiError(res, error); }
    return;
  }
  if (req.method === 'POST' && requestPath === '/api/analyze-batch') {
    try {
      const payload = JSON.parse(await readBody(req));
      if (!Array.isArray(payload.files) || !payload.files.length || payload.files.some((file) => typeof file?.name !== 'string' || typeof file?.csv !== 'string' || !file.csv.trim())) {
        res.writeHead(422, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'files_name_and_csv_required' }));
        return;
      }
      const entries = payload.files.map((file) => { const rows = parseCSV(file.csv); return { name: file.name, csv: file.csv, rows, status: 'processed', rowCount: rows.length }; });
      const validation = validateBatchDeclaration(payload.declaration, entries);
      if (!validation.ok) {
        res.writeHead(422, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'batch_declaration_invalid', details: validation.errors }));
        return;
      }
      const config = resolveApiConfig(payload);
      const groups = [];
      for (const group of validation.groups) {
        const groupEntries = group.fileOrder.map((name) => entries.find((entry) => entry.name.replaceAll('\\', '/') === name));
        const groupCsv = groupEntries.map((entry) => entry.csv).join('\n---FILE-BOUNDARY---\n');
        const groupConfig = { ...config, sourceHash: 'SHA-256:' + createHash('sha256').update(groupCsv, 'utf8').digest('hex') };
        const fileResults = groupEntries.map((entry) => ({ name: entry.name, result: analyzeRows(entry.rows, groupConfig) }));
        const datasetTypes = [...new Set(fileResults.map((item) => item.result.datasetType).filter(Boolean))];
        if (datasetTypes.length > 1) {
          res.writeHead(422, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'batch_dataset_type_mismatch', details: [`${group.id} 包含多个数据集类型：${datasetTypes.join('、')}`] }));
          return;
        }
        const observation = observeDeclaredBatch(group, fileResults);
        const combined = analyzeRows(annotateDeclaredBatchRows(group, groupEntries), groupConfig);
        const summary = summarizeDeclaredBatch(group, groupEntries, fileResults, combined, observation);
        const publicSummary = publicBatchAggregation(summary);
        const responseGroup = { batchAggregation: publicSummary, analysis: publicAnalysis(combined) };
        if (payload.includeReport) responseGroup.reportMarkdown = `${batchAggregationMarkdown(publicSummary)}\n${reportMarkdown(responseGroup.analysis, 'uploaded-batch.csv')}`;
        groups.push(responseGroup);
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ declaration: { version: payload.declaration?.version || null, status: 'validated', groupCount: groups.length }, groups }));
    } catch (error) { writeApiError(res, error); }
    return;
  }
  if (req.method === 'POST' && requestPath === '/api/compare') {
    try {
      const payload = JSON.parse(await readBody(req));
      if (typeof payload.baselineCsv !== 'string' || !payload.baselineCsv.trim() || typeof payload.currentCsv !== 'string' || !payload.currentCsv.trim()) {
        res.writeHead(422, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'baselineCsv_and_currentCsv_required' }));
        return;
      }
      const config = resolveApiConfig(payload);
      const baseline = analyzeRows(parseCSV(payload.baselineCsv), { ...config, sourceHash: 'SHA-256:' + createHash('sha256').update(payload.baselineCsv, 'utf8').digest('hex') });
      const current = analyzeRows(parseCSV(payload.currentCsv), { ...config, sourceHash: 'SHA-256:' + createHash('sha256').update(payload.currentCsv, 'utf8').digest('hex') });
      const comparison = compareResults(baseline, current, { baselineName: payload.baselineFileName || 'baseline.csv', currentName: payload.currentFileName || 'current.csv' });
      const response = { baseline: publicAnalysis(baseline), current: publicAnalysis(current), comparison };
      if (payload.includeReport) response.reportMarkdown = reportMarkdown(response.current, 'uploaded-current-test-run.csv', { comparison });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(response));
    } catch (error) { writeApiError(res, error); }
    return;
  }
  if (req.method === 'POST' && requestPath === '/api/ai-draft') {
    try {
      const payload = JSON.parse(await readBody(req, 2_000_000));
      const response = await generateDraft(payload, { serverRequest: true });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(response));
    } catch (error) {
      const status = error.message === 'body_too_large' ? 413 : 400;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: status === 413 ? 'request_too_large' : 'invalid_json' }));
    }
    return;
  }
  if (req.method === 'POST' && requestPath === '/api/feishu-alert') {
    try {
      const payload = JSON.parse(await readBody(req, 2_000_000));
      const webhookUrl = String(process.env.H2_FEISHU_WEBHOOK_URL || '').trim();
      if (!webhookUrl) {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: 'feishu_not_configured', mode: 'dry-run', sent: false }));
        return;
      }
      const input = payload.result && typeof payload.result === 'object' ? payload.result : {};
      const safeResult = {
        verdict: String(input.verdict || '未评估'),
        dataset: { points: Array.isArray(input.dataset?.points) ? input.dataset.points.slice(0, 0) : [], targetPowers: Array.isArray(input.dataset?.targetPowers) ? input.dataset.targetPowers.slice(0, 24).map(Number).filter(Number.isFinite) : [] },
        issues: Array.isArray(input.issues) ? input.issues.slice(0, 12).map((item) => ({ severity: String(item.severity || 'info'), title: String(item.title || ''), evidence: String(item.evidence || '').slice(0, 500) })) : []
      };
      const outcome = await sendFeishuAlert(safeResult, { webhookUrl, secret: process.env.H2_FEISHU_SECRET, fileName: String(payload.fileName || 'durability.docx') });
      res.writeHead(outcome.ok ? 200 : 502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: outcome.ok, mode: 'server', sent: outcome.ok, status: outcome.status, reason: outcome.reason, response: outcome.response }));
    } catch (error) {
      res.writeHead(error.message === 'body_too_large' ? 413 : 400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: error.message === 'body_too_large' ? 'request_too_large' : 'invalid_alert_request' }));
    }
    return;
  }
  const requestedRelative = requestPath.replace(/^\/+/, '');
  const relative = requestPath === '/'
    ? 'src/index.html'
    : requestedRelative === 'styles.css' || requestedRelative === 'app.mjs'
      ? `src/${requestedRelative}`
      : requestedRelative.startsWith('vendor/')
        ? `src/${requestedRelative}`
        : requestedRelative;
  const filePath = normalize(join(root, relative));
  if (!filePath.startsWith(root + sep) && filePath !== root) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (!publicRelativeRoots.some((prefix) => relative.startsWith(prefix))) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': mime[extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`H2 TestLens running at http://127.0.0.1:${port}`);
});
