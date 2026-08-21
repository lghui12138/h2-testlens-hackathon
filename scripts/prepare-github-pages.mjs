import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const site = join(root, '_site');

await rm(site, { recursive: true, force: true });
await mkdir(site, { recursive: true });
await cp(join(root, 'src/index.html'), join(site, 'index.html'));
await cp(join(root, 'src'), join(site, 'src'), { recursive: true });
await cp(join(root, 'sample-data'), join(site, 'sample-data'), { recursive: true });
await cp(join(root, 'config'), join(site, 'config'), { recursive: true });
await cp(join(root, 'public/favicon.svg'), join(site, 'favicon.svg'));
await writeFile(join(site, '.nojekyll'), '', 'utf8');
console.log(JSON.stringify({ site, entry: join(site, 'index.html'), assets: ['src', 'sample-data', 'config'] }, null, 2));
