import { publicDataset } from './analyzer.mjs';

const SYSTEM_PROMPT = `你是氢能设备测试工程师的报告助手。只允许使用用户提供的 evidence JSON，不得补造设备型号、单位、原因、阈值或实验结论。必须保留 verdict 原值；如果证据不足，明确写“证据不足，需人工复核”。输出中文 Markdown，结构为：结论、关键证据、优先动作、数据边界。不要把演示阈值写成企业安全标准，不要替代工程师签核。`;
const MAX_DRAFT_LENGTH = 12000;

const statusTokens = {
  PASS: ['PASS', '通过'],
  WARN: ['WARN', '需复核'],
  FAIL: ['FAIL', '未通过'],
  DESCRIPTIVE: ['DESCRIPTIVE', '仅描述']
};

function evidenceConfig(config = {}) {
  const metadata = config.testMetadata && typeof config.testMetadata === 'object' ? config.testMetadata : {};
  return {
    maxTemperatureC: config.maxTemperatureC,
    maxPressureBar: config.maxPressureBar,
    maxLeakPpm: config.maxLeakPpm,
    maxVoltageStdV: config.maxVoltageStdV,
    maxPressureDriftBarPerMin: config.maxPressureDriftBarPerMin,
    profileId: config.profileId || null,
    profileName: config.profileName || null,
    profileSource: config.profileSource || null,
    evaluationMode: config.evaluationMode || 'risk_screening',
    approvalStatus: config.approvalStatus || null,
    methodId: config.methodId || null,
    revision: config.revision || null,
    standardRefs: (config.standardRefs || []).map((reference) => ({ id: reference.id, title: reference.title })),
    requiredMetadata: config.requiredMetadata || [],
    requiredPhases: config.requiredPhases || [],
    requiredTestStages: config.requiredTestStages || [],
    testConditionRequirements: config.testConditionRequirements || null,
    measurementMethodRequirements: config.measurementMethodRequirements || [],
    efficiencyRequirement: config.efficiencyRequirement || null,
    metadataPresent: Object.fromEntries((config.requiredMetadata || []).map((field) => [field, Boolean(metadata[field])])),
    acceptanceCriteria: config.acceptanceCriteria || {},
    uncertaintyModelRequired: config.uncertaintyModelRequired || false
  };
}

export function evidenceBundle(result, comparison = null) {
  if (result?.evidenceVersion) return comparison ? { ...result, comparison } : result;
  return {
    evidenceVersion: 'h2-testlens.v1',
    verdict: result.verdict,
    generatedAt: result.generatedAt,
    narrative: result.narrative,
    source: result.source,
    datasetType: result.datasetType || null,
    dataset: publicDataset(result.dataset) || null,
    quality: result.quality,
    schema: result.schema,
    metrics: result.metrics,
    phases: result.phases,
    issues: result.issues,
    workflow: result.workflow,
    releaseGate: result.releaseGate || null,
    thresholds: evidenceConfig(result.config),
    compliance: result.compliance,
    comparison
  };
}

export function localEvidenceDraft(result) {
  const evidence = evidenceBundle(result);
  const status = evidence.verdict === 'PASS' ? '通过' : evidence.verdict === 'WARN' ? '需复核' : evidence.verdict === 'DESCRIPTIVE' ? '仅描述' : '未通过';
  const priority = evidence.issues.filter((item) => item.severity === 'critical' || item.severity === 'warn');
  if (result.datasetType === 'vehicle') {
    const dataset = evidence.dataset;
    return [
      '# 自动报告初稿（结构化证据）', '',
      '## 结论',
      `当前自动判定：**${status}（${evidence.verdict}）**。${evidence.narrative}`,
      '', '## 关键证据',
      `- 数据集：${dataset.label}；${evidence.quality.rowCount} 条记录，关键字段完整率 ${evidence.quality.completenessPct.toFixed(1)}%。`,
      `- 性能统计：${dataset.performancePoints.length} 个正式目标电流段；目标电流 ${dataset.targetCurrents.length ? dataset.targetCurrents.join('、') + ' A' : '未配置'}；描述性候选区间 ${dataset.inferredSegments?.length || 0} 个（未进入目标符合性判定）。`,
      `- 绝缘统计：${dataset.insulation.validCount} 条有效记录，${dataset.insulation.points.length} 个 10 分钟窗口；过滤 ${dataset.insulation.invalidCount} 条无效码。`,
      `- 数据边界：${evidence.compliance.status}；${evidence.workflow.nextAction}`,
      '', '## 优先动作',
      ...(priority.length ? priority.map((item, index) => `${index + 1}. **${item.title}**：${item.evidence}；${item.recommendation}`) : ['1. 进入企业规则确认和工程师签核。']),
      '', '## 数据边界',
      '- 本草稿只引用结构化证据，不生成未提供的故障原因、阈值或符合性结论。'
    ].join('\n');
  }
  if (result.datasetType === 'stack') {
    const dataset = evidence.dataset;
    return [
      '# 自动报告初稿（结构化证据）', '',
      '## 结论',
      `当前自动判定：**${status}（${evidence.verdict}）**。${evidence.narrative}`,
      '', '## 关键证据',
      `- 数据集：${dataset.label}；${evidence.quality.rowCount} 条记录，关键字段完整率 ${evidence.quality.completenessPct.toFixed(1)}%。`,
      `- 单片通道：导出 ${dataset.cellChannelCount} 个，片数参数最大值 ${dataset.configuredCellCount || '未提供'}。`,
      `- 一致性摘要：平均单片电压 ${dataset.metrics.averageCellVoltageV?.toFixed(3) ?? '—'} V，最大极差 ${dataset.metrics.cellSpreadMaxV?.toFixed(3) ?? '—'} V；描述性候选区间 ${dataset.inferredSegments?.length || 0} 个，未生成正式极化点。`,
      `- 数据边界：${evidence.compliance.status}；${evidence.workflow.nextAction}`,
      '', '## 优先动作',
      ...(priority.length ? priority.map((item, index) => `${index + 1}. **${item.title}**：${item.evidence}；${item.recommendation}`) : ['1. 补充目标工况设定表并进入工程师签核。']),
      '', '## 数据边界',
      '- 本草稿只引用结构化证据，不生成未提供的故障原因、阈值或符合性结论。'
    ].join('\n');
  }
  if (result.datasetType === 'durability') {
    const dataset = evidence.dataset;
    return [
      '# 自动报告初稿（结构化证据）', '',
      '## 结论',
      `当前自动判定：**${status}（${evidence.verdict}）**。${evidence.narrative}`,
      '', '## 关键证据',
      `- 数据集：${dataset.label}；${dataset.points.length} 个功率点，覆盖 ${dataset.targetPowers.join('、')} kW。`,
      `- 原始报告：${dataset.reports.length} 份；${dataset.reports.filter((report) => String(report.metadata?.测试结果 || '').includes('未通过')).length} 份标记未通过。`,
      `- 预警规则：离均差 ${dataset.rules.maxDeviationMv ?? '未配置'} mV；平均单体电压下限 ${dataset.rules.minAverageCellVoltageMv ?? '未配置'} mV。`,
      `- 数据边界：${evidence.compliance.status}；${evidence.workflow.nextAction}`,
      '', '## 优先动作',
      ...(priority.length ? priority.map((item, index) => `${index + 1}. **${item.title}**：${item.evidence}；${item.recommendation}`) : ['1. 进入企业规则确认和工程师签核。']),
      '', '## 数据边界',
      '- 本草稿只引用结构化耐久证据，不伪造飞书推送、故障原因或放行结论。'
    ].join('\n');
  }
  const mappingNote = evidence.schema ? `${evidence.schema.mappedCount}/${evidence.schema.fieldCount} 个字段已映射；${Object.values(evidence.schema.conversions).filter((item) => item.mode !== 'identity').length} 项单位换算` : '字段映射信息不可用';
  return [
    '# 自动报告初稿（结构化证据）',
    '',
    `## 结论`,
    `当前自动判定：**${status}（${evidence.verdict}）**。${evidence.narrative || '证据不足，需人工复核。'}`,
    '',
    '## 关键证据',
    `- 数据质量：${evidence.quality.completenessPct.toFixed(1)}% 完整，${evidence.quality.rowCount} 条记录。`,
    `- 输入适配：${mappingNote}。`,
    `- 分析 profile：${evidence.thresholds.profileName || '未指定'}（${evidence.thresholds.profileSource || '当前分析配置'}）· 模式 ${evidence.thresholds.evaluationMode || 'risk_screening'}。`,
    `- 标准门控：${evidence.compliance?.status || '未评估'}；方法 ${evidence.compliance?.methodId || '未指定'} ${evidence.compliance?.revision || ''}；缺失元数据 ${evidence.compliance?.missingMetadata?.join('、') || '无'}。`,
    `- 测试流程：${evidence.workflow?.status || '未评估'}；下一步 ${evidence.workflow?.nextAction || '需人工确认'}。`,
    `- 测试段覆盖：${evidence.compliance?.missingPhases?.length ? `缺少 ${evidence.compliance.missingPhases.join('、')}` : 'profile 要求的测试段均已出现'}。`,
    `- 测量不确定度：${evidence.workflow?.steps?.find((step) => step.id === 'uncertainty')?.evidence || '未评估'}。`,
    ...(evidence.comparison ? [`- 批次变化：${evidence.comparison.verdictTransition}；${evidence.comparison.summary}`] : []),
    `- 稳态窗口：${evidence.metrics.steadyWindow}，${evidence.metrics.steadySampleCount} 条记录；稳态电压标准差 ${evidence.metrics.steadyVoltageStdV?.toFixed(3) ?? '—'} V。`,
    `- 峰值指标：温度 ${evidence.metrics.peakTemperatureC?.toFixed(1) ?? '—'} °C（t=${evidence.metrics.peakTemperatureAtS?.join('、') || '—'} s），压力 ${evidence.metrics.peakPressureBar?.toFixed(1) ?? '—'} bar（t=${evidence.metrics.peakPressureAtS?.join('、') || '—'} s），泄漏监测 ${evidence.metrics.peakLeakPpm?.toFixed(1) ?? '—'} ppm（t=${evidence.metrics.peakLeakAtS?.join('、') || '—'} s）。`,
    `- 性能指标：产氢量 ${evidence.metrics.hydrogenVolumeNl?.toFixed(3) ?? '—'} NL，电能 ${evidence.metrics.energyConsumedWh?.toFixed(3) ?? '—'} Wh，单位制氢电耗 ${evidence.metrics.specificEnergyKWhPerNm3?.toFixed(3) ?? '—'} kWh/Nm³，最低纯度 ${evidence.metrics.minimumHydrogenPurityPct?.toFixed(3) ?? '—'}%。`,
    '',
    '## 优先动作',
    ...(priority.length ? priority.map((item, index) => `${index + 1}. **${item.title}**：${item.evidence}；${item.recommendation}`) : ['1. 未发现当前规则下的高优先级异常，进入人工签核。']),
    '',
    '## 数据边界',
    '- 本草稿只引用结构化分析证据；它不是安全认证，也不替代工程师签核。',
    ...(evidence.thresholds.evaluationMode === 'descriptive_only'
      ? ['- 当前为 descriptive_only：未执行温度、压力、泄漏、稳定性或验收阈值判定。']
      : [`- 当前阈值为可配置演示阈值：温度 ≤ ${evidence.thresholds.maxTemperatureC} °C、压力 ≤ ${evidence.thresholds.maxPressureBar} bar、泄漏监测 ≤ ${evidence.thresholds.maxLeakPpm} ppm。`]),
    '- 正式使用前应完成企业字段、单位和设备标准映射。'
  ].join('\n');
}

function responseFallback(result, reason) {
  return {
    mode: 'local-evidence',
    provider: 'local',
    fallbackReason: reason,
    draft: localEvidenceDraft(result),
    evidence: evidenceBundle(result)
  };
}

export function validateRemoteDraft(draft, evidence) {
  const text = String(draft ?? '').trim();
  if (!text) return { ok: false, reason: 'grounding_empty' };
  if (text.length > MAX_DRAFT_LENGTH) return { ok: false, reason: 'grounding_too_long' };
  const expectedTokens = statusTokens[evidence.verdict] ?? [evidence.verdict];
  const currentClaim = text.slice(0, 1200);
  const otherVerdicts = Object.entries(statusTokens)
    .filter(([verdict]) => verdict !== evidence.verdict)
    .flatMap(([, tokens]) => tokens);
  if (/(当前|本次|自动判定|最终判定|结论)[^\n。]{0,50}/.test(currentClaim) && otherVerdicts.some((token) => currentClaim.includes(token)) && !currentClaim.includes(expectedTokens[0])) {
    return { ok: false, reason: 'grounding_verdict_conflict' };
  }
  if (!expectedTokens.some((token) => text.includes(token))) return { ok: false, reason: 'grounding_verdict_missing' };
  const anchors = [
    evidence.metrics?.peakTemperatureC,
    evidence.metrics?.peakPressureBar,
    evidence.metrics?.peakLeakPpm,
    evidence.metrics?.pressureDriftBarPerMin,
    evidence.metrics?.completenessPct
  ].filter((value) => Number.isFinite(value)).flatMap((value) => [String(value), value.toFixed(1), value.toFixed(2)]);
  const issueAnchors = (evidence.issues ?? []).flatMap((item) => [item.title, item.evidence]);
  if (![...anchors, ...issueAnchors].some((anchor) => anchor && text.includes(anchor))) return { ok: false, reason: 'grounding_anchor_missing' };
  return { ok: true, reason: 'grounding_pass' };
}

export async function generateDraft(result, options = {}) {
  const endpoint = options.endpoint ?? process.env.H2_AI_ENDPOINT;
  const apiKey = options.apiKey ?? process.env.H2_AI_API_KEY;
  const model = options.model ?? process.env.H2_AI_MODEL ?? 'hydrogen-report-assistant';
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!endpoint) return responseFallback(result, 'no_endpoint_configured');
  const evidence = evidenceBundle(result);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(evidence) }
        ]
      })
    });
    if (!response.ok) return responseFallback(result, `upstream_http_${response.status}`);
    const payload = await response.json();
    const draft = payload?.choices?.[0]?.message?.content?.trim();
    const validation = validateRemoteDraft(draft, evidence);
    if (!validation.ok) return responseFallback(result, validation.reason);
    return { mode: 'remote-llm', provider: 'openai-compatible', model, draft, evidence };
  } catch {
    return responseFallback(result, 'upstream_unavailable');
  }
}
