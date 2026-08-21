const SYSTEM_PROMPT = `你是氢能设备测试工程师的报告助手。只允许使用用户提供的 evidence JSON，不得补造设备型号、单位、原因、阈值或实验结论。必须保留 verdict 原值；如果证据不足，明确写“证据不足，需人工复核”。输出中文 Markdown，结构为：结论、关键证据、优先动作、数据边界。不要把演示阈值写成企业安全标准，不要替代工程师签核。`;
const MAX_DRAFT_LENGTH = 12000;

const statusTokens = {
  PASS: ['PASS', '通过'],
  WARN: ['WARN', '需复核'],
  FAIL: ['FAIL', '未通过']
};

export function evidenceBundle(result, comparison = null) {
  if (result?.evidenceVersion) return comparison ? { ...result, comparison } : result;
  return {
    evidenceVersion: 'h2-testlens.v1',
    verdict: result.verdict,
    generatedAt: result.generatedAt,
    narrative: result.narrative,
    source: result.source,
    quality: result.quality,
    schema: result.schema,
    metrics: result.metrics,
    phases: result.phases,
    issues: result.issues,
    workflow: result.workflow,
    thresholds: result.config,
    compliance: result.compliance,
    comparison
  };
}

export function localEvidenceDraft(result) {
  const evidence = evidenceBundle(result);
  const status = evidence.verdict === 'PASS' ? '通过' : evidence.verdict === 'WARN' ? '需复核' : '未通过';
  const priority = evidence.issues.filter((item) => item.severity === 'critical' || item.severity === 'warn');
  const mappingNote = evidence.schema ? `${evidence.schema.mappedCount}/${evidence.schema.fieldCount} 个字段已映射；${Object.values(evidence.schema.conversions).filter((item) => item.mode !== 'identity').length} 项单位换算` : '字段映射信息不可用';
  return [
    '# AI 报告草稿（证据约束模式）',
    '',
    `## 结论`,
    `当前自动判定：**${status}（${evidence.verdict}）**。${evidence.narrative || '证据不足，需人工复核。'}`,
    '',
    '## 关键证据',
    `- 数据质量：${evidence.quality.completenessPct.toFixed(1)}% 完整，${evidence.quality.rowCount} 条记录。`,
    `- 输入适配：${mappingNote}。`,
    `- 判定模板：${evidence.thresholds.profileName || '未指定'}（${evidence.thresholds.profileSource || '当前分析配置'}）。`,
    `- 标准门控：${evidence.compliance?.status || '未评估'}；方法 ${evidence.compliance?.methodId || '未指定'} ${evidence.compliance?.revision || ''}；缺失元数据 ${evidence.compliance?.missingMetadata?.join('、') || '无'}。`,
    `- 测试流程：${evidence.workflow?.status || '未评估'}；下一步 ${evidence.workflow?.nextAction || '需人工确认'}。`,
    ...(evidence.comparison ? [`- 批次变化：${evidence.comparison.verdictTransition}；${evidence.comparison.summary}`] : []),
    `- 稳态窗口：${evidence.metrics.steadyWindow}，${evidence.metrics.steadySampleCount} 条记录；稳态电压标准差 ${evidence.metrics.steadyVoltageStdV?.toFixed(3) ?? '—'} V。`,
    `- 峰值指标：温度 ${evidence.metrics.peakTemperatureC?.toFixed(1) ?? '—'} °C（t=${evidence.metrics.peakTemperatureAtS?.join('、') || '—'} s），压力 ${evidence.metrics.peakPressureBar?.toFixed(1) ?? '—'} bar（t=${evidence.metrics.peakPressureAtS?.join('、') || '—'} s），泄漏监测 ${evidence.metrics.peakLeakPpm?.toFixed(1) ?? '—'} ppm（t=${evidence.metrics.peakLeakAtS?.join('、') || '—'} s）。`,
    '',
    '## 优先动作',
    ...(priority.length ? priority.map((item, index) => `${index + 1}. **${item.title}**：${item.evidence}；${item.recommendation}`) : ['1. 未发现当前规则下的高优先级异常，进入人工签核。']),
    '',
    '## 数据边界',
    '- 本草稿只引用结构化分析证据；它不是安全认证，也不替代工程师签核。',
    `- 当前阈值为可配置演示阈值：温度 ≤ ${evidence.thresholds.maxTemperatureC} °C、压力 ≤ ${evidence.thresholds.maxPressureBar} bar、泄漏监测 ≤ ${evidence.thresholds.maxLeakPpm} ppm。`,
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
