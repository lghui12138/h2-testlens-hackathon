import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDraft } from './src/ai-draft.mjs';
import { analyzeRows, parseCSV, publicAnalysis, reportMarkdown } from './src/analyzer.mjs';
import { compareResults } from './src/compare.mjs';
import { profilesFromPackage } from './src/profiles.mjs';

const root = fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const port = Number(process.env.PORT || 4173);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const readBody = async (req, limit = 1_500_000) => {
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
  if (!payload.profilePackage) return payload.config && typeof payload.config === 'object' ? payload.config : {};
  const imported = profilesFromPackage(payload.profilePackage);
  if (!imported.ok) { const error = new Error('profile_package_invalid'); error.status = 422; error.details = imported.errors; throw error; }
  const profile = imported.profiles.find((candidate) => candidate.id === payload.profileId) ?? imported.profiles[0];
  if (!profile) { const error = new Error('profile_not_found'); error.status = 422; throw error; }
  return { ...profile.thresholds, profileId: profile.id, profileName: profile.name, profileSource: profile.source, profileOrganization: imported.organization, approvalStatus: profile.approvalStatus, applicationScope: profile.applicationScope, intendedUse: profile.intendedUse, methodId: profile.methodId, revision: profile.revision, standardRefs: profile.standardRefs, requiredMetadata: profile.requiredMetadata, testMetadata: payload.testMetadata || {}, fieldMapping: imported.fieldMapping };
}

function writeApiError(res, error) {
  const status = error.status ?? (error.message === 'body_too_large' ? 413 : 400);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: status === 413 ? 'request_too_large' : error.message === 'profile_package_invalid' ? error.message : 'invalid_json', details: error.details }));
}

const server = createServer(async (req, res) => {
  const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (req.method === 'POST' && requestPath === '/api/analyze') {
    try {
      const payload = JSON.parse(await readBody(req));
      if (typeof payload.csv !== 'string' || !payload.csv.trim()) {
        res.writeHead(422, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'csv_required' }));
        return;
      }
      const result = analyzeRows(parseCSV(payload.csv), resolveApiConfig(payload));
      const response = publicAnalysis(result);
      if (payload.fileName) response.source = { ...response.source, fileName: String(payload.fileName) };
      if (payload.includeReport) response.reportMarkdown = reportMarkdown(result, String(payload.fileName || 'test-run.csv'));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(response));
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
      const baseline = analyzeRows(parseCSV(payload.baselineCsv), config);
      const current = analyzeRows(parseCSV(payload.currentCsv), config);
      const comparison = compareResults(baseline, current, { baselineName: payload.baselineFileName || 'baseline.csv', currentName: payload.currentFileName || 'current.csv' });
      const response = { baseline: publicAnalysis(baseline), current: publicAnalysis(current), comparison };
      if (payload.includeReport) response.reportMarkdown = reportMarkdown(current, String(payload.currentFileName || 'current.csv'), { comparison });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(response));
    } catch (error) { writeApiError(res, error); }
    return;
  }
  if (req.method === 'POST' && requestPath === '/api/ai-draft') {
    try {
      const payload = JSON.parse(await readBody(req));
      const response = await generateDraft(payload);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(response));
    } catch (error) {
      const status = error.message === 'body_too_large' ? 413 : 400;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: status === 413 ? 'request_too_large' : 'invalid_json' }));
    }
    return;
  }
  const relative = requestPath === '/' ? 'src/index.html' : requestPath.replace(/^\/+/, '');
  const filePath = normalize(join(root, relative));
  if (!filePath.startsWith(root + sep) && filePath !== root) {
    res.writeHead(403).end('Forbidden');
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
