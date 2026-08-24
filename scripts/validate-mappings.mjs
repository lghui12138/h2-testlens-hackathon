import { readFileSync, readdirSync } from 'node:fs';
import { parseCSV } from '../src/analyzer.mjs';
import { DEVICE_PROFILES } from '../src/profiles.mjs';

const t02Root = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';

function walk(dir) {
  let results = [];
  const list = readdirSync(dir).map((name) => ({ name, path: `${dir}/${name}` }));
  for (const entry of list) {
    try {
      const stat = readFileSync(entry.path);
      if (stat && stat[0] === 0x50 && stat[1] === 0x4B) {
        // skip zip/xlsx/docx for now
        continue;
      }
    } catch {
      // ignore
    }
    try {
      const stat = readFileSync(entry.path, 'utf8');
      if (stat.includes(',') || stat.includes('\t')) {
        results.push(entry.path);
      }
    } catch {
      // ignore binary
    }
  }
  return results;
}

const files = [
  ...walk(`${t02Root}/企业资料包03_青川易创与云汉达`),
  ...walk(`${t02Root}/企业资料包02_氢质氢离/02_整车数据处理`),
  `${t02Root}/企业资料包02_氢质氢离/01_耐久原始数据处理/耐久0-5-20260605211610.docx`
];

console.log('Files found:', files.length);

for (const profile of DEVICE_PROFILES.filter((p) => p.fieldMapping)) {
  console.log(`\n=== Profile: ${profile.id} ===`);
  const mapping = profile.fieldMapping;
  const mappedHeaders = Object.values(mapping).filter(Boolean);
  console.log('Mapped headers:', mappedHeaders.length);
  
  for (const file of files) {
    try {
      const text = readFileSync(file, 'utf8');
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) continue;
      const firstLine = lines[0];
      const headers = firstLine.split(/[,，\t]/).map((h) => h.trim().replace(/^["']|["']$/g, ''));
      const missing = mappedHeaders.filter((h) => !headers.includes(h));
      if (missing.length > 0) {
        console.log(`  MISSING in ${file}: ${missing.join(', ')}`);
      } else {
        console.log(`  OK in ${file}`);
      }
    } catch (e) {
      // skip
    }
  }
}
