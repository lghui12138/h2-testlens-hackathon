import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const renderedVinextMarkup = (source) => {
  const withoutImports = source.split('\n').filter((line) => !line.startsWith('import ') && !line.startsWith('"use client"')).join('\n');
  const end = withoutImports.indexOf('\nexport default function Home');
  const script = `${withoutImports.slice(0, end)}\n__rendered = DISPLAY_HTML_WITH_STANDARD_BOUNDARY_LINK;`;
  const context = {};
  vm.createContext(context);
  new vm.Script(script).runInContext(context);
  return context.__rendered;
};

test('static and Vinext pages expose the same multi-format T02 input contract', async () => {
  const [staticPage, vinextPage, app, styles, publicApp] = await Promise.all([
    read('src/index.html'),
    read('app/page.tsx'),
    read('src/app.mjs'),
    read('src/styles.css'),
    read('public/src/app.mjs')
  ]);
  const server = await read('server.mjs');
  const [releaseSource, releasePublic] = await Promise.all([read('config/release-summary.json'), read('public/config/release-summary.json')]);
  const [ledgerSource, ledgerPublic] = await Promise.all([read('config/standard-evidence-ledger.v1.json'), read('public/config/standard-evidence-ledger.v1.json')]);
  assert.deepEqual(JSON.parse(releasePublic), JSON.parse(releaseSource));
  assert.deepEqual(JSON.parse(ledgerPublic), JSON.parse(ledgerSource));
  for (const page of [staticPage, vinextPage]) {
    assert.match(page, /multiple/);
    assert.match(page, /\.csv/);
    assert.match(page, /\.txt/);
    assert.match(page, /\.xlsx/);
    assert.match(page, /\.docx/);
    assert.match(page, /\.pdf/);
    assert.match(page, /batch-declaration-file/);
    assert.match(page, /batch-observation-status/);
    assert.match(page, /descriptive_only/);
    for (const id of ['parameter-file', 'metadata-traceability', 'metadata-edit-log', 'metadata-formula-review', 'metadata-test-system', 'metadata-phase-results']) assert.match(page, new RegExp(id));
    assert.match(page, /coverage-blocked/);
    assert.match(page, /coverage-unuploaded/);
    assert.match(page, /trend-chart-summary/);
    assert.match(page, /enterprise-performance-chart-summary/);
    assert.match(page, /metric-trace-details/);
    assert.match(page, /metric-trace/);
    assert.match(page, /result-announcement/);
  }
  assert.match(app, /ensureBrowserEngines/);
  assert.match(app, /setSpreadsheetEngine/);
  assert.match(app, /setDocxEngine/);
  assert.match(app, /reference_only/);
  assert.match(app, /blocked_binary/);
  assert.match(app, /validateBatchDeclaration/);
  assert.match(app, /observeDeclaredBatch/);
  assert.match(app, /publicBatchAggregation/);
  assert.match(app, /escapeHtml\(profile\.name\)/);
  assert.match(app, /loadReleaseSummary/);
  assert.match(app, /updateAccessibleSummaries/);
  assert.match(app, /enterprise-performance-chart-summary/);
  assert.match(app, /ensureStandardEvidenceLedger/);
  assert.match(app, /renderMetricTrace/);
  assert.match(styles, /.mobile-nav a { min-height: 44px/);
  assert.equal(publicApp, app);
  assert.match(server, /invalid_path_encoding/);
  assert.match(server, /publicRelativeRoots/);
  assert.match(app, /loadReleaseSummary/);
  assert.match(server, /invalid_path_encoding/);
  assert.match(server, /publicRelativeRoots/);
  assert.match(app, /BATCH_DATASET_TYPE_MISMATCH/);
  assert.match(app, /SHA-256:\$\{contentHash\}/);
  assert.doesNotMatch(app, /hashText: entries\.map\(\(\{ name, text, contentHash \}\)/);
});

test('static batch declaration example is available to both local browser surfaces', async () => {
  const [source, publicCopy] = await Promise.all([
    read('config/batch-declaration.example.json'),
    read('public/config/batch-declaration.example.json')
  ]);
  assert.deepEqual(JSON.parse(publicCopy), JSON.parse(source));
});

test('T02 coverage summary is parity-checked for static page runtime loading', async () => {
  const [source, publicCopy] = await Promise.all([
    read('config/t02-coverage-summary.json'),
    read('public/config/t02-coverage-summary.json')
  ]);
  assert.deepEqual(JSON.parse(publicCopy), JSON.parse(source));
  const summary = JSON.parse(source);
  assert.equal(summary.schemaVersion, 'h2-testlens.t02-coverage-summary.v1');
  assert.equal(summary.auditVersion, '3.5.37');
  assert.equal(summary.totalFiles, 198);
  assert.equal(summary.counts.processed, 190);
});

test('Vinext rendered markup keeps the full enterprise evidence and standards contract', async () => {
  const rendered = renderedVinextMarkup(await read('app/page.tsx'));
  for (const id of ['parameter-file', 'metadata-acquisition-record', 'metadata-precheck-items', 'metadata-test-stages', 'metadata-test-system', 'metadata-test-conditions', 'metadata-environment-conditions', 'metadata-measurement-methods', 'metadata-efficiency-record', 'metadata-phase-results', 'metadata-traceability', 'metadata-edit-log', 'metadata-formula-review', 'batch-declaration-file']) assert.match(rendered, new RegExp(id));
  assert.match(rendered, /PEM 性能流程映射/);
  assert.match(rendered, /未执行安全验证/);
  assert.match(rendered, /非原生 iOS\/Android 客户端/);
});

test('T02 coverage card is visible on both public browser surfaces', async () => {
  const [staticPage, appSource] = await Promise.all([read('src/index.html'), read('app/page.tsx')]);
  const rendered = renderedVinextMarkup(appSource);
  for (const page of [staticPage, rendered]) {
    assert.match(page, /T02 资料接入范围/);
    for (const id of ['coverage-audit-version', 'coverage-total-files', 'coverage-processed', 'coverage-reference', 'coverage-blocked', 'coverage-unuploaded', 'coverage-meter-fill', 'coverage-note']) assert.match(page, new RegExp(id));
    assert.match(page, /190/);
    assert.match(page, /2,262,283/);
    assert.match(page, /正式符合性声明：0/);
    assert.match(page, /阻断二进制/);
    assert.match(page, /声明未上传/);
    assert.match(page, /标准实施边界矩阵/);
  }
});

test('Next metadata and initialization failure state remain aligned with the static public entry', async () => {
  const [layout, page, staticPage] = await Promise.all([read('app/layout.tsx'), read('app/page.tsx'), read('src/index.html')]);
  assert.match(layout, /metadataBase/);
  assert.match(layout, /alternates: \{ canonical/);
  assert.match(layout, /openGraph: \{ type: "website", url:/);
  assert.match(page, /href="#workflow">流程/);
  assert.match(page, /status\.setAttribute\("data-tone", "error"\)/);
  assert.match(staticPage, /href="#workflow">流程/);
  assert.match(staticPage, /release-summary/);
  assert.match(page, /release-summary/);
});

test('public static page exposes share metadata and the Pages build copies its preview card', async () => {
  const [source, prepared, prepareScript] = await Promise.all([read('src/index.html'), read('_site/index.html').catch(() => ''), read('scripts/prepare-github-pages.mjs')]);
  assert.match(source, /property="og:image"/);
  assert.match(source, /og-card\.svg/);
  assert.match(source, /raw\.githubusercontent\.com\/lghui12138\/h2-testlens-hackathon/);
  assert.match(source, /twitter:card|name="twitter:card"/);
  if (prepared) {
    assert.match(prepared, /og-card\.svg/);
  }
  assert.match(prepareScript, /github-actions-static-deploy/);
  assert.match(prepareScript, /packageSmoke: \{ command: 'npm run package:submission', status: 'not_run' \}/);
});

test('Vinext App public runtime exposes the browser engines and analysis worker used by app/page.tsx', async () => {
  const required = [
    'public/src/app.mjs',
    'public/src/analysis-worker.mjs',
    'public/src/analyzer.mjs',
    'public/src/enterprise-adapters.mjs',
    'public/src/metric-trace.mjs',
    'public/src/profiles.mjs',
    'public/src/standard-evidence.mjs',
    'public/src/browser-engines.mjs',
    'public/src/vendor/xlsx.full.min.js',
    'public/src/vendor/jszip.min.js',
    'public/src/vendor/mammoth.browser.min.js'
  ];
  for (const path of required) assert.ok(await read(path), `${path} must be publicly served for the App runtime`);
  const page = await read('app/page.tsx');
  assert.match(page, /src\/vendor\/xlsx\.full\.min\.js/);
  assert.match(page, /src\/vendor\/jszip\.min\.js/);
  assert.match(page, /src\/vendor\/mammoth\.browser\.min\.js/);
});
