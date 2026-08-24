import { readFileSync, readdirSync } from 'node:fs';
import { parseCSV } from '../src/analyzer.mjs';
import { analyzeEnterpriseRows } from '../src/enterprise-adapters.mjs';
import { DEVICE_PROFILES } from '../src/profiles.mjs';

const t02Root = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';

const realFiles = {
  qingchuan: `${t02Root}/企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv`,
  qingzhihuli212: `${t02Root}/企业资料包02_氢质氢离/02_整车数据处理/212/${readdirSync(`${t02Root}/企业资料包02_氢质氢离/02_整车数据处理/212`)[0]}`,
};

for (const profile of DEVICE_PROFILES.filter((p) => p.fieldMapping && p.id !== 'electrolyzer-demo' && p.id !== 'fuel-cell-demo')) {
  console.log(`\n=== ${profile.id} ===`);
  const mappingKeys = Object.keys(profile.fieldMapping).filter((k) => profile.fieldMapping[k]);
  console.log('Profile mapping keys:', mappingKeys.join(', '));
  
  let file;
  if (profile.id === 'qingchuan-stack') file = realFiles.qingchuan;
  else if (profile.id === 'qingzhihuli-vehicle') file = realFiles.qingzhihuli212;
  else if (profile.id === 'hypu-durability') {
    console.log('Skipping hypu-durability (docx-based, need different parser)');
    continue;
  }
  
  if (!file) continue;
  
  const text = readFileSync(file, 'utf8');
  const rows = parseCSV(text);
  console.log('File:', file.split('/').pop(), 'Rows:', rows.length, 'Headers:', Object.keys(rows[0]).length);
  
  const result = analyzeEnterpriseRows(rows, profile);
  if (!result) {
    console.log('  No result from adapter');
    continue;
  }
  
  console.log('  Dataset type:', result.datasetType);
  console.log('  Verdict:', result.verdict);
  console.log('  Missing headers:', result.quality.missingHeaders?.join(', ') || 'none');
  console.log('  Issues count:', result.issues.length);
  const criticals = result.issues.filter((i) => i.severity === 'critical');
  console.log('  Critical issues:', criticals.map((i) => i.code).join(', ') || 'none');
  const warns = result.issues.filter((i) => i.severity === 'warn');
  console.log('  Warnings:', warns.map((i) => i.code).join(', ') || 'none');
}
