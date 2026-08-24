const asText = (value, fallback = '—') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const cell = (value) => asText(value).replaceAll('|', '\\|').replaceAll('\n', ' ');

const count = (value) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US') : '—';

const boolLabel = (value) => value === true ? '是' : value === false ? '否' : '—';

const roleCounts = (fieldUsage = {}) => Object.entries(fieldUsage.roleCounts || {})
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([role, value]) => `${role}=${count(value)}`)
  .join('；') || '—';

const fieldRoleSummary = (fieldUsage = null) => {
  if (!fieldUsage?.sourceFieldCount) return '未进入适配器';
  const counts = fieldUsage.roleCounts || {};
  return [
    `analysis_input=${count(counts.analysis_input ?? 0)}`,
    `context_or_cross_check=${count(counts.context_or_cross_check ?? 0)}`,
    `catalog_only=${count(counts.catalog_only ?? 0)}`,
    `未分类=${count(fieldUsage.unclassifiedSourceFieldCount ?? 0)}`,
    `冲突=${count(fieldUsage.overlappingSourceFieldCount ?? 0)}`
  ].join('；');
};

const statusLabel = (status) => ({
  processed: 'processed · 已进入适配器',
  reference_only: 'reference_only · 仅参考',
  blocked_binary: 'blocked_binary · 二进制阻断',
  declared_no_upload: 'declared_no_upload · 明确未上传',
  parser_error: 'parser_error · 解析异常'
}[status] || asText(status));

const dispositionLabel = (disposition) => ({
  processed_and_aggregated: '已处理并汇总',
  reference_boundary_only: '参考边界',
  blocked_binary_boundary: '二进制阻断边界',
  declared_no_upload_boundary: '未上传边界'
}[disposition] || asText(disposition));

const packageBusinessSummary = (summary = {}) => {
  const items = [];
  if (summary.vehicle) {
    const dynamic = summary.vehicle.dynamicAnalysis;
    const dynamicText = dynamic ? `、${count(dynamic.eventCount)} 个动态设定变化事件（完成保持 ${count(dynamic.settledEventCount)}）` : '';
    items.push(`车辆 ${count(summary.vehicle.fileCount)} 文件、${count(summary.vehicle.rowCount)} 行、${count(summary.vehicle.performancePointCount)} 个正式性能点、${count(summary.vehicle.descriptiveCandidateCount)} 个描述性候选区间${dynamicText}`);
  }
  if (summary.stack) {
    items.push(`电堆 ${count(summary.stack.fileCount)} 文件、${count(summary.stack.rowCount)} 行、${count(summary.stack.signalCount)} 列信号、${count(summary.stack.cellChannelCount)} 个单片通道、${count(summary.stack.performancePointCount)} 个正式稳定点、${count(summary.stack.descriptiveCandidateCount)} 个描述性候选区间`);
  }
  if (summary.durability) {
    items.push(`耐久 ${count(summary.durability.fileCount)} 文件、${count(summary.durability.pointCount)} 个功率点、目标功率 ${summary.durability.targetPowersKw?.map((value) => `${value} kW`).join('、') || '—'}`);
  }
  return items.join('；') || '无结构化业务汇总';
};

const workbookEvidenceRows = (summary) => {
  if (!summary) return '| — | — | — | — | — | — | — |';
  return [
    `| 工作表 | ${count(summary.sheetCount)} | ${count(summary.parsedSheetCount)} | ${count(summary.staticMatrixCount)} | ${count(summary.staticMatrixValidPointCount)} | ${count(summary.staticMatrixMissingPointCount)} | ${count(summary.reportPerformanceCheckCount)} |`,
    `| 静态矩阵通道 | ${count(summary.staticMatrixCellCount)} | — | — | — | — | — |`,
    `| 极化/稳定点 | ${count(summary.reportPolarizationPointCount)} / ${count(summary.reportStabilityPointCount)} | — | — | — | — | — |`,
    `| 身份/参数目录 | ${count(summary.deviceIdentityFieldCount)} / ${count(summary.parameterCatalogRowCount)} | — | — | — | — | — |`
  ].join('\n');
};

const referenceClaimRows = (records = []) => records.flatMap((record) => (record.claims || []).map((claim) => `| ${cell(record.path)} | ${cell(claim.id)} | ${cell(claim.status)} | ${boolLabel(claim.sourceEvidenceComplete)} | ${cell(claim.boundary)} |`));

const durabilityComparabilityRows = (packages) => packages.flatMap(([name, summary]) => {
  const audit = summary.businessAggregation?.durability?.crossReportDescriptiveSummary?.comparabilityAudit;
  if (!audit) return [];
  return (audit.checks || []).map((check) => `| ${cell(name)} | ${cell(check.id)} | ${cell(check.status)} | ${count(check.reportCount)} | ${count(check.missingCount)} | ${count(check.distinctCount)} |`);
});

const durabilityComparabilitySummaryRows = (packages) => packages.flatMap(([name, summary]) => {
  const audit = summary.businessAggregation?.durability?.crossReportDescriptiveSummary?.comparabilityAudit;
  if (!audit) return [];
  return [`| ${cell(name)} | ${cell(audit.auditStatus)} | ${boolLabel(audit.comparable)} | ${boolLabel(audit.completeEndTimeEvidence)} | ${count(audit.gapCount)} | ${count(audit.overlapCount)} | ${cell(audit.issueCodes?.join('、') || '无')} |`];
});

const fieldUsageRows = (packages) => packages.flatMap(([name, summary]) => {
  const rows = [];
  const append = (dataset, fieldUsage) => {
    if (!fieldUsage?.sourceFieldCount) return;
    rows.push(`| ${cell(name)} | ${cell(dataset)} | ${count(fieldUsage.sourceFieldCount)} | ${count(fieldUsage.roleCounts?.analysis_input ?? 0)} | ${count(fieldUsage.roleCounts?.context_or_cross_check ?? 0)} | ${count(fieldUsage.roleCounts?.catalog_only ?? 0)} | ${count(fieldUsage.unclassifiedSourceFieldCount ?? 0)} | ${count(fieldUsage.overlappingSourceFieldCount ?? 0)} |`);
  };
  append(summary.businessAggregation?.vehicle ? 'vehicle' : summary.businessAggregation?.stack ? 'stack' : 'package fields', summary.fieldUsage);
  append('durability', summary.durabilityFieldUsage);
  return rows;
});

const dynamicEventRows = (packages) => packages.flatMap(([name, summary]) => {
  const dynamic = summary.businessAggregation?.vehicle?.dynamicAnalysis;
  if (!dynamic) return [];
  return [`| ${cell(name)} | ${count(dynamic.fileCount)} | ${count(dynamic.calculatedFileCount)} | ${count(dynamic.eventCount)} | ${count(dynamic.settledEventCount)} | ${count(dynamic.unsettledEventCount)} | ${count(dynamic.dataGapCount)} | ${count(dynamic.maximumIntervalS)} |`];
});

const fieldValueDiagnosticRows = (packages) => packages.flatMap(([name, summary]) => {
  const diagnostics = summary.fieldValueDiagnostics;
  if (!diagnostics?.filesWithDiagnostics) return [];
  return [`| ${cell(name)} | ${count(diagnostics.fileCount)} | ${count(diagnostics.reviewSignalFileCount)} | ${count(diagnostics.reviewSignalOccurrenceCount)} | ${count(diagnostics.negativeSignalFileCount)} | ${count(diagnostics.zeroDominantSignalFileCount)} | ${count(diagnostics.constantSignalFileCount)} | ${count(diagnostics.parseIssueSignalFileCount)} |`];
});

const evidenceDepthRows = (packages) => packages.flatMap(([name, summary]) => {
  const counts = summary.evidenceDepthCounts || {};
  if (!Object.keys(counts).length) return [];
  return [`| ${cell(name)} | ${count(counts.formal_kpi)} | ${count(counts.descriptive_interval)} | ${count(counts.dynamic_event_only)} | ${count(counts.generic_metrics_only)} | ${count(counts.reference_boundary)} |`];
});

export function buildT02IntegrationReport({ coverage, reference, coveragePath = 't02_coverage_audit.json', referencePath = 't02_reference_audit.json' }) {
  if (!coverage || !reference) throw new Error('T02 coverage and reference audits are required');
  if (coverage.auditVersion !== reference.auditVersion) throw new Error(`audit version mismatch: ${coverage.auditVersion} vs ${reference.auditVersion}`);
  const version = coverage.auditVersion;
  const records = Array.isArray(coverage.records) ? coverage.records : [];
  const packages = Object.entries(coverage.batchAggregation || {}).sort(([a], [b]) => a.localeCompare(b, 'zh-Hans-CN'));
  const referenceRecords = Array.isArray(reference.records) ? reference.records : [];
  const referenceByPath = new Map(referenceRecords.map((record) => [record.path, record]));
  const package01Workbook = coverage.batchAggregation?.['企业资料包01_氢璞创能']?.workbookEvidence || null;
  const referenceBoundaryRecords = records.filter((record) => ['reference_only', 'declared_no_upload'].includes(record.status));
  const linkedReferenceCount = referenceBoundaryRecords.filter((record) => referenceByPath.has(record.path)).length;
  const processed = coverage.records?.filter((record) => record.status === 'processed') || [];
  const blocked = coverage.records?.filter((record) => record.status !== 'processed') || [];
  const roleCompleteness = packages.map(([name, summary]) => `${name}: 未分类 ${count(summary.fieldUsage?.unclassifiedSourceFieldCount)}，多角色冲突 ${count(summary.fieldUsage?.overlappingSourceFieldCount)}`).join('；');
  const packageRows = packages.map(([name, summary]) => `| ${cell(name)} | ${count(summary.processedFileCount)} | ${count(summary.processedRowCount)} | ${cell(summary.datasetTypes?.join('、'))} | ${cell(roleCounts(summary.fieldUsage))} | ${cell(packageBusinessSummary(summary.businessAggregation))} | ${boolLabel(summary.closure?.crossFileTimeSeriesKpiMerge)} |`).join('\n');
  const durabilityComparabilitySummary = durabilityComparabilitySummaryRows(packages).join('\n') || '| — | — | — | — | — | — | — |';
  const durabilityComparabilityChecks = durabilityComparabilityRows(packages).join('\n') || '| — | — | — | — | — | — |';
  const fieldUsage = fieldUsageRows(packages).join('\n') || '| — | — | — | — | — | — | — | — |';
  const dynamicEvents = dynamicEventRows(packages).join('\n') || '| — | — | — | — | — | — | — | — |';
  const fieldValueDiagnostics = fieldValueDiagnosticRows(packages).join('\n') || '| — | — | — | — | — | — | — | — |';
  const evidenceDepth = evidenceDepthRows(packages).join('\n') || '| — | — | — | — | — | — |';
  const fileRows = records.map((record, index) => {
    const referenceRecord = referenceByPath.get(record.path);
    const referenceAuditStatus = referenceRecord ? `${referenceRecord.status} · ${referenceRecord.parser}` : record.usageLedger?.referenceAudit?.required ? '未关联' : '不适用';
    const referenceClaimCount = referenceRecord ? referenceRecord.claims?.length : null;
    return `| ${index + 1} | ${cell(record.package)} | ${cell(record.path)} | ${cell(record.sha256)} | ${cell(statusLabel(record.status))} | ${cell(record.parser)} | ${count(record.rowCount)} | ${cell(record.usageLedger?.evidenceDepth)} | ${cell(dispositionLabel(record.usageLedger?.disposition))} | ${cell(fieldRoleSummary(record.usageLedger?.fieldUsage))} | ${boolLabel(record.usageLedger?.parserExecuted)} | ${count(record.usageLedger?.rowsEnteredAdapter)} | ${cell(referenceAuditStatus)} | ${count(referenceClaimCount)} | ${boolLabel(record.usageLedger?.formalConformityClaim)} |`;
  }).join('\n');
  const blockedRows = blocked.map((record) => `| ${cell(record.path)} | ${cell(statusLabel(record.status))} | ${cell(record.parser)} | ${cell(record.usageLedger?.boundary || record.note)} |`).join('\n') || '| — | — | — | — |';
  const claims = referenceClaimRows(referenceRecords).join('\n') || '| — | — | — | — | — |';
  const lines = [
    '# T02 设备测试数据分析与自动报告助手 · 全资料包自动接入报告',
    '',
    `- 证据版本：${version}`,
    `- 覆盖审计：\`${coveragePath}\``,
    `- 参考审计：\`${referencePath}\``,
    '- 原始企业文件：未复制进仓库；本报告只使用哈希、解析统计、字段角色、指标名称和边界证据。',
    '',
    '## 结论',
    '',
    `本报告逐项列出 ${count(coverage.totalFiles)} 个源文件的实际状态和使用台账。${count(coverage.counts?.processed)} 个文件进入配置的解析器/适配器，${count(coverage.counts?.reference_only)} 个文件只作为需求或参考边界，${count(coverage.counts?.blocked_binary)} 个文件因二进制内容被阻断，${count(coverage.counts?.declared_no_upload)} 个文件只记录企业明确的未上传声明。`,
    '',
    `- 已进入适配器的行/功率点：${count(coverage.utilization?.processedRowsEnteredAdapters)}`,
    `- 使用台账完整性：${count(coverage.utilization?.recordsWithUsageLedger)}/${count(coverage.utilization?.totalRecords)}`,
    `- 重复 processed SHA-256：${count(coverage.duplicateProcessedHashes?.length)}`,
    `- 正式符合性声明：${count(coverage.utilization?.formalConformityClaims)}`,
    `- 参考文件解析错误：${count(reference.parserErrors)}`,
    `- 参考声明关键词证据：${count(reference.sourceEvidenceSummary?.completeClaims)}/${count(reference.sourceEvidenceSummary?.claimsTotal)} 完整（机器抽取证据，不等于标准全文复核）`,
    `- 参考内容审计交叉链接：${count(linkedReferenceCount)}/${count(referenceBoundaryRecords.length)}；独立参考审计文件：${count(reference.totalReferenceFiles)}`,
    '',
    '## 包级结构化汇总',
    '',
    '| 资料包 | processed 文件 | 行/功率点 | 数据类型 | 字段使用角色 | 业务汇总 | 跨文件连续 KPI 合并 |',
    '|---|---:|---:|---|---|---|---|',
    packageRows || '| — | — | — | — | — | — | — |',
    '',
    `字段角色完整性：${roleCompleteness || '—'}。字段角色只说明“进入核心分析、交叉核对或目录/描述性统计”的层级，不把目录字段升级为标准结论。`,
    '',
    '## 字段用途明细（不是每个字段都进入 KPI）',
    '',
    '下表把车辆/电堆适配字段与耐久 DOCX 字段分开列出。`analysis_input` 进入结构化指标或阶段处理；`context_or_cross_check` 用于设定值/反馈/元数据核对；`catalog_only` 保留字段目录和描述性统计。未分类或多角色冲突必须为 0；这张表不产生标准符合性结论。',
    '',
    '| 资料包 | 字段域 | 字段总数 | analysis_input | context_or_cross_check | catalog_only | 未分类 | 多角色冲突 |',
    '|---|---|---:|---:|---:|---:|---:|---:|',
    fieldUsage,
    '',
    '## 全包字段值分布诊断（复核提示，不是标准判定）',
    '',
    '该汇总来自所有进入车辆/电堆适配器的真实时序文件。负值、零值集中、常量值和非数值混合只提示需要确认字段语义、设备状态和企业无效码；系统不自动删除原始值，也不把提示写成合格/不合格。',
    '',
    '| 资料包 | 有诊断文件 | 有待复核文件 | 待复核字段出现次数 | 含负值文件 | 零值集中文件 | 常量字段文件 | 解析混合文件 |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    fieldValueDiagnostics,
    '',
    `全包汇总：${count(coverage.fieldValueDiagnostics?.reviewSignalFileCount)} 个文件出现字段值复核提示，${count(coverage.fieldValueDiagnostics?.reviewSignalOccurrenceCount)} 次字段级提示；${cell(coverage.fieldValueDiagnostics?.boundary || '不替代企业字段语义、无效码表、单位、校准或标准验收限值。')}`,
    '',
    '## 证据深度分层',
    '',
    '`formal_kpi` 表示形成了正式性能点（仍受 profile/标准证据门控）；`descriptive_interval` 表示只形成描述性候选区间或耐久功率点；`dynamic_event_only` 表示只形成动态设定变化事件；`generic_metrics_only` 表示进入适配器并有通用统计，但没有上述业务证据；`reference_boundary` 表示未进入原始时序适配器。',
    '',
    '| 资料包 | formal_kpi | descriptive_interval | dynamic_event_only | generic_metrics_only | reference_boundary |',
    '|---|---:|---:|---:|---:|---:|',
    evidenceDepth,
    '',
    `全包分层：${Object.entries(coverage.utilization?.evidenceDepthCounts || {}).map(([key, value]) => `${key}=${count(value)}`).join('；') || '—'}。`,
    '',
    '## 动态设定变化事件（描述性）',
    '',
    '车辆 profile 已绑定设定值→实测值响应分析；表内为各源文件分别统计后的汇总，不跨文件拼接，不含标准限值，也不生成动态性能合格结论。',
    '',
    '| 资料包 | 文件数 | 已计算文件 | 事件数 | 完成保持窗口 | 未稳定/数据不足 | 采样缺口 | 最大观测间隔（s） |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    dynamicEvents,
    '',
    '## 耐久跨报告可比性筛查（描述性）',
    '',
    '该筛查只比较报告元数据、功率点集合、表头集合和报告时间关系；它不是耐久方法等效、统计显著性或企业验收判定。',
    `机器筛查边界：${cell(packages.find(([, summary]) => summary.businessAggregation?.durability?.crossReportDescriptiveSummary?.comparabilityAudit)?.[1]?.businessAggregation?.durability?.crossReportDescriptiveSummary?.comparabilityAudit?.boundary || '仅作跨报告元数据、功率集合和时间关系筛查；不证明耐久方法、循环等效性、统计显著性或企业验收限值。')}`,
    '',
    '| 资料包 | 审计状态 | 元数据/功率集合可比 | 结束时间证据完整 | 间隔数 | 重叠数 | 问题代码 |',
    '|---|---|---|---|---:|---:|---|',
    durabilityComparabilitySummary,
    '',
    '| 资料包 | 检查项 | 状态 | 报告数 | 缺失数 | 不同值数 |',
    '|---|---|---|---:|---:|---:|',
    durabilityComparabilityChecks,
    '',
    '### 包 01 工作簿证据',
    '',
    '| 证据项 | 数量 | 已解析 | 静态矩阵 | 有效点 | 缺失点 | 检测项目 |',
    '|---|---:|---:|---:|---:|---:|---:|',
    workbookEvidenceRows(coverage.batchAggregation?.['企业资料包01_氢璞创能']?.workbookEvidence),
    package01Workbook ? `公式审计：${count(package01Workbook.formulaCellCount)} 个公式单元格；缓存值 ${count(package01Workbook.cachedFormulaCellCount)} 个；未缓存 ${count(package01Workbook.uncachedFormulaCellCount)} 个；状态 ${cell(package01Workbook.formulaReviewStatus)}；宏 ${boolLabel(package01Workbook.macroPresent)}；外部链接 ${boolLabel(package01Workbook.externalLinksPresent)}。SheetJS 不执行或重算公式，正式验收前必须绑定企业公式复核证据。` : '公式审计：未发现可解析工作簿。',
    '',
    '## 全文件使用台账',
    '',
    '| # | 资料包 | 文件 | 源 SHA-256 | 状态 | 原始数据解析器 | 行/功率点 | 证据深度 | 用途层级 | 字段使用角色（计数） | 执行原始解析器 | 进入适配器 | 参考内容审计 | 参考声明数 | 正式符合性声明 |',
    '|---:|---|---|---|---|---|---:|---|---|---|---|---:|---|---:|---|',
    fileRows || '| — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |',
    '',
    '## 未进入时序适配器的文件',
    '',
    '| 文件 | 状态 | 解析器 | 边界 |',
    '|---|---|---|---|',
    blockedRows,
    '',
    '## 参考资料映射台账',
    '',
    '| 来源文件 | 声明 | 状态 | 关键词证据完整 | 边界 |',
    '|---|---|---|---|---|',
    claims,
    '',
    '## 标准与企业应用边界',
    '',
    '- 本报告证明资料被盘点、分类、解析或明确阻断；不证明 GB/T 45541-2025、GB/T 46104-2025、ISO 22734-1:2025 或 ISO/IEC 17025:2017 的完整符合。',
    '- 缺少企业批准 profile、方法实施证据、仪器精度/校准、不确定度预算、验收限值、批次声明和人工平行验证时，结果只能作为 `ANALYSIS_DRAFT` 或描述性工程证据。',
    '- 参考资料、二进制阻断文件和未上传声明不被伪装为测试数据；跨文件时序也不会自动拼接。',
    '',
    '## 可复核入口',
    '',
    `- processed 文件数：${count(processed.length)}；非 processed 边界文件数：${count(blocked.length)}。`,
    `- 本报告由 ` + '`npm run t02:report`' + ` 生成；重新运行覆盖/参考审计后应重新生成同版本报告。`,
    ''
  ];
  return `${lines.join('\n')}\n`;
}
