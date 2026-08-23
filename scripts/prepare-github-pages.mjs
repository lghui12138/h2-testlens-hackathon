import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const site = join(root, '_site');

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
await cp(join(root, 'public/favicon.svg'), join(site, 'favicon.svg'));
await writeFile(join(site, '.nojekyll'), '', 'utf8');
console.log(JSON.stringify({ site, entry: join(site, 'index.html'), assets: ['src', 'sample-data', 'config'] }, null, 2));
