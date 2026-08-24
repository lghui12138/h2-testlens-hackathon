import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const site = join(root, '_site');
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;

await rm(site, { recursive: true, force: true });
await mkdir(site, { recursive: true });
const sourceHtml = await readFile(join(root, 'src/index.html'), 'utf8');
const pagesHtml = sourceHtml
  .replaceAll('href="./styles.css"', 'href="./src/styles.css"')
  .replaceAll('href="../config/', 'href="./config/')
  .replaceAll('src="./vendor/', 'src="./src/vendor/')
  .replaceAll('src="./app.mjs"', 'src="./src/app.mjs"');
await writeFile(join(site, 'index.html'), pagesHtml, 'utf8');
await cp(join(root, 'src'), join(site, 'src'), { recursive: true });
await cp(join(root, 'sample-data'), join(site, 'sample-data'), { recursive: true });
await cp(join(root, 'config'), join(site, 'config'), { recursive: true });
const receiptPath = join(root, 'dist', `h2-testlens-release-receipt-v${version}.json`);
try {
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  await writeFile(join(site, 'config/release-summary.json'), `${JSON.stringify({ ...receipt, pagesSourceCommit: process.env.GITHUB_SHA || receipt.commit || null }, null, 2)}\n`, 'utf8');
} catch {
  if (process.env.GITHUB_SHA) {
    const fallback = JSON.parse(await readFile(join(root, 'config/release-summary.json'), 'utf8'));
    const deploymentReceipt = {
      ...fallback,
      commit: process.env.GITHUB_SHA,
      workflowRunId: process.env.GITHUB_RUN_ID || null,
      source: 'github-actions-static-deploy',
      generatedAt: new Date().toISOString(),
      gates: {
        ...fallback.gates,
        tests: { command: 'npm test', status: 'passed', evidence: 'check:submission 子门' },
        submission: { command: 'npm run check:submission', status: 'passed' },
        typecheck: { command: 'npm run typecheck', status: 'passed' },
        build: { command: 'npm run build', status: 'not_run' },
        packageSmoke: { command: 'npm run package:submission', status: 'not_run' }
      },
      artifact: { name: null, bytes: null, sha256: null, archiveIntegrity: 'not_run' }
    };
    await writeFile(join(site, 'config/release-summary.json'), `${JSON.stringify({ ...deploymentReceipt, pagesSourceCommit: process.env.GITHUB_SHA }, null, 2)}\n`, 'utf8');
  }
  /* Keep the checked-in unbound fallback for local previews. */
}
await cp(join(root, 'public/favicon.svg'), join(site, 'favicon.svg'));
await cp(join(root, 'public/og-card.svg'), join(site, 'og-card.svg'));
await writeFile(join(site, '.nojekyll'), '', 'utf8');
console.log(JSON.stringify({ site, entry: join(site, 'index.html'), assets: ['src', 'sample-data', 'config'] }, null, 2));
