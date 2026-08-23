#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname, extname, relative, resolve } from 'node:path';

const exec = promisify(execFile);
const defaultRoot = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手';
const inputRoot = resolve(process.argv[2] || defaultRoot);
const packageVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const outputPath = resolve(process.argv[3] || `${resolve(new URL('..', import.meta.url).pathname)}/.research/ignite_t02_standards_20260821/t02_reference_audit_v${packageVersion}.json`);

const fileEntries = async (directory) => {
  const entries = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) entries.push(...await fileEntries(path));
    else if (entry.isFile()) entries.push(path);
  }
  return entries.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
};

const sha256 = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');

const categoryFor = (path) => {
  const name = path.split('/').at(-1) || '';
  if (name === '数据统计功能实现需求-20260807.docx') return 'vehicle_requirements';
  if (name.includes('燃料电池电堆时序测试数据处理任务说明书')) return 'stack_requirements';
  if (name.includes('宽温域PEM制氢与氢燃料电池电堆技术开发与应用')) return 'product_technical_reference';
  if (name === '00_企业资料说明.pdf') return 'enterprise_brief';
  return 'reference_document';
};

const claimsFor = (category, sourcePath = '') => {
  const common = [
    {
      id: 'scope_and_boundary',
      sourceRequirement: '资料包用于 T02 命题；需求/参考材料不等于标准全文或企业放行规则。',
      keywords: ['支持命题', '资料不足时的补充规则'],
      implementationEvidence: ['docs/T02_REQUIREMENTS_MATRIX.md', 'docs/ENTERPRISE_READINESS.md'],
      status: 'used_as_boundary',
      boundary: '只用于产品范围和证据边界，不生成标准限值。'
    }
  ];
  if (category === 'enterprise_brief') {
    const noUploadBrief = sourcePath.includes('企业资料包04_');
    return [
      ...common,
      {
        id: 'source_inventory',
        sourceRequirement: '企业说明中的资料清单和原始数据类型必须进入覆盖盘点。',
        keywords: ['资料清单'],
        implementationEvidence: ['scripts/t02-coverage-audit.mjs', 'docs/ENTERPRISE_DATA_INTEGRATION.md'],
        status: 'implemented',
        boundary: '记录文件、哈希、解析器和状态；不把说明文件当作时序 KPI。'
      },
      noUploadBrief ? {
        id: 'no_upload_boundary',
        sourceRequirement: '企业说明未提供原始资料时，只能按说明记录未上传状态，不能用虚构资料补齐企业功能。',
        keywords: ['企业未上传', '资料到位前'],
        implementationEvidence: ['scripts/t02-coverage-audit.mjs', 'docs/ENTERPRISE_DATA_INTEGRATION.md'],
        status: 'implemented',
        boundary: '记录 declared_no_upload；不把命题描述或虚构样例当作企业测试数据。'
      } : {
        id: 'data_use_boundary',
        sourceRequirement: '资料仅限赛事用途，原始文件不应随产品公开传播。',
        keywords: ['敏感性', '赛事'],
        implementationEvidence: ['docs/ENTERPRISE_DATA_INTEGRATION.md', 'scripts/package-submission.mjs'],
        status: 'implemented',
        boundary: '仓库只保存脱敏样例和派生审计，不复制原始企业资料。'
      }
    ];
  }
  if (category === 'vehicle_requirements') return [
    {
      id: 'vehicle_signal_dashboard',
      sourceRequirement: '车辆关键信号按时间展示，并支持选择信号和双纵轴。',
      keywords: ['FC_CurrOut', '双纵轴', '时间范围'],
      implementationEvidence: ['src/enterprise-adapters.mjs', 'src/app.mjs', 'src/analyzer.mjs'],
      status: 'implemented',
      boundary: '双轴是展示/核对能力，不把不同量纲混入 KPI。'
    },
    {
      id: 'vehicle_target_segments',
      sourceRequirement: '目标电流±波动范围、连续超过 180 s 后形成一个统计段。',
      keywords: ['180s', 'FC_CurrOut', '平均值'],
      implementationEvidence: ['src/enterprise-adapters.mjs', 'tests/analyzer.test.mjs'],
      status: 'implemented',
      boundary: '目标、容差和最短持续时间由配置传入；不足时不形成正式性能点。'
    },
    {
      id: 'vehicle_insulation_forecast',
      sourceRequirement: '状态 4/8 分组、无效码过滤、10 分钟最小值和 350/250 kΩ 趋势。',
      keywords: ['65535', '350/250', '每10min'],
      implementationEvidence: ['src/enterprise-adapters.mjs', 'src/app.mjs', 'src/excel-workflow.mjs'],
      status: 'implemented',
      boundary: '350/250 kΩ 来自企业功能需求，不是 ISO/GB 安全认证限值。'
    },
    {
      id: 'durability_alert_and_increment',
      sourceRequirement: '耐久目标功率、异常预警、飞书通知和每日新增检测。',
      keywords: ['33/58.5/117/156/175.5/195', '飞书', '每日会新增'],
      implementationEvidence: ['src/docx-workflow.mjs', 'src/feishu-alerts.mjs', 'scripts/batch-watch.mjs'],
      status: 'partial',
      boundary: '功率点、dry-run/确认发送和受控 once/interval 扫描已实现；企业调度器、群策略和工单闭环未接入。'
    }
  ];
  if (category === 'stack_requirements') return [
    {
      id: 'configurable_parameters',
      sourceRequirement: '识别阈值、稳定阈值、截取规则和异常阈值必须可配置，不得固化。',
      keywords: ['可配置参数', '不得固化', '参数代码'],
      implementationEvidence: ['src/excel-workflow.mjs', 'src/profiles.mjs', 'src/enterprise-adapters.mjs'],
      status: 'implemented_with_boundary',
      boundary: '系统提供配置入口和默认模板；正式值必须来自企业批准参数表。'
    },
    {
      id: 'platform_stability_rules',
      sourceRequirement: '电流±1 A、60 s 平台/稳定判定、60–120 s 警告、≥120 s 末端截取、重复点分开。',
      keywords: ['±1 A', '60', '120', '重复电流点'],
      implementationEvidence: ['src/enterprise-adapters.mjs', 'src/excel-workflow.mjs', 'tests/analyzer.test.mjs'],
      status: 'implemented_with_boundary',
      boundary: '数值作为任务说明书默认模板并可由参数表覆盖；不能当作国家标准通用限值。'
    },
    {
      id: 'stack_metrics_and_quality',
      sourceRequirement: '电流/电压/单片一致性/内阻/工况/流阻统计和数据质量问题进入报告。',
      keywords: ['内阻', '流阻', '单片电压', '数据质量'],
      implementationEvidence: ['src/enterprise-adapters.mjs', 'src/excel-workflow.mjs', 'src/analyzer.mjs'],
      status: 'partial',
      boundary: '已有可映射字段的指标、目录和日志；未提供企业规则的扩展曲线不自动判定。'
    },
    {
      id: 'excel_and_traceability',
      sourceRequirement: '14 个工作表、图表引用、参数覆盖、排除区间和人工修改过程可追溯。',
      keywords: ['14', '工作表', '可追溯性要求', '人工修改'],
      implementationEvidence: ['src/excel-workflow.mjs', 'src/xlsx-charts.mjs', 'src/incremental.mjs', 'docs/ENTERPRISE_DATA_INTEGRATION.md'],
      status: 'partial',
      boundary: '14 表、公式、图表结构、哈希和处理日志已实现；企业对象存储、人工签改系统和 Excel/WPS 视觉验收仍待接入。'
    }
  ];
  if (category === 'product_technical_reference') return [
    {
      id: 'product_context_only',
      sourceRequirement: '产品介绍提供企业/产品背景和技术语境。',
      keywords: ['PEM', '燃料电池', '电堆'],
      implementationEvidence: ['docs/T02_REQUIREMENTS_MATRIX.md', 'docs/ENTERPRISE_READINESS.md'],
      status: 'reference_only',
      boundary: '不把宣传材料中的性能描述当作测试验收限值或标准证据。'
    }
  ];
  return common;
};

const extract = async (path) => {
  const extension = extname(path).toLowerCase();
  const command = extension === '.pdf' ? 'pdftotext' : 'pandoc';
  const args = extension === '.pdf' ? ['-layout', path, '-'] : ['-t', 'plain', path];
  try {
    const { stdout } = await exec(command, args, { maxBuffer: 20_000_000, timeout: 120_000 });
    return { parser: `${command} ${extension === '.pdf' ? 'layout text' : 'plain text'}`, text: stdout || '', error: null };
  } catch (error) {
    return { parser: command, text: '', error: error.message };
  }
};

const referencePaths = (await fileEntries(inputRoot)).filter((path) => {
  const extension = extname(path).toLowerCase();
  const relativePath = relative(inputRoot, path);
  return (extension === '.pdf' || extension === '.docx') && !relativePath.includes('01_耐久原始数据处理');
});

const records = [];
for (const path of referencePaths) {
  const category = categoryFor(path);
  const extracted = await extract(path);
  const normalizedText = extracted.text.replace(/\s+/g, ' ');
  const claims = claimsFor(category, relative(inputRoot, path)).map((claim) => {
    const sourceMatches = claim.keywords.filter((keyword) => normalizedText.includes(keyword));
    return { ...claim, sourceMatches, sourceEvidenceComplete: sourceMatches.length === claim.keywords.length };
  });
  records.push({
    path: relative(inputRoot, path),
    category,
    extension: extname(path).toLowerCase(),
    bytes: (await stat(path)).size,
    sha256: await sha256(path),
    parser: extracted.parser,
    status: extracted.error ? 'parser_error' : 'extracted_reference',
    textCharacterCount: extracted.text.length,
    sourceKeywordHits: [...new Set(claims.flatMap((claim) => claim.sourceMatches))].sort(),
    claims,
    error: extracted.error
  });
}

const claimStatusCounts = Object.fromEntries([...new Set(records.flatMap((record) => record.claims.map((claim) => claim.status)))].sort().map((status) => [status, records.flatMap((record) => record.claims).filter((claim) => claim.status === status).length]));
const allClaims = records.flatMap((record) => record.claims.map((claim) => ({ record, claim })));
const incompleteSourceEvidence = allClaims
  .filter(({ claim }) => claim.sourceEvidenceComplete !== true)
  .map(({ record, claim }) => ({
    path: record.path,
    claimId: claim.id,
    missingKeywords: claim.keywords.filter((keyword) => !claim.sourceMatches.includes(keyword)),
    matchedKeywords: claim.sourceMatches
  }));
const sourceEvidenceSummary = {
  claimsTotal: allClaims.length,
  completeClaims: allClaims.length - incompleteSourceEvidence.length,
  incompleteClaims: incompleteSourceEvidence.length,
  completenessPct: allClaims.length ? Number((((allClaims.length - incompleteSourceEvidence.length) / allClaims.length) * 100).toFixed(2)) : 0,
  incompleteSourceEvidence,
  boundary: '关键词完整性只是机器抽取证据；不完整不等于需求不存在，必须人工回看原始 PDF/DOCX 后才能宣称该映射已完整复核。'
};
const summary = {
  audit: 'T02 reference-content and implementation mapping audit',
  auditVersion: packageVersion,
  root: inputRoot,
  rawReferenceFilesCopiedIntoRepository: false,
  totalReferenceFiles: records.length,
  parserErrors: records.filter((record) => record.status === 'parser_error').length,
  claimStatusCounts,
  sourceEvidenceSummary,
  boundary: '该审计只保存文件哈希、提取统计、关键词命中和实现映射；不保存原始 PDF/DOCX 正文，也不把需求材料写成国家标准符合性结论。',
  records
};
const serialized = JSON.stringify(summary, null, 2);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${serialized}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, auditVersion: packageVersion, totalReferenceFiles: records.length, parserErrors: summary.parserErrors, completeClaims: summary.sourceEvidenceSummary.completeClaims }, null, 2));
