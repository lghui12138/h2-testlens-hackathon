const allowedHosts = new Set(['open.feishu.cn', 'open.larkoffice.com', 'open.larksuite.com', 'feishu.cn', 'larksuite.com']);

const base64 = (bytes) => {
  if (typeof btoa === 'function') return btoa(String.fromCharCode(...bytes));
  if (globalThis.Buffer) return globalThis.Buffer.from(bytes).toString('base64');
  throw new Error('base64_unavailable');
};

export function durabilityAlertPayload(result, fileName = 'durability.docx') {
  const dataset = result?.dataset || {};
  const issues = (result?.issues || []).filter((item) => item.severity !== 'info');
  const lines = [
    '【H₂ TestLens｜台架耐久预警】',
    `文件：${fileName}`,
    `判定：${result?.verdict || '未评估'}`,
    `功率点：${dataset.points?.length || 0} 个；目标功率：${(dataset.targetPowers || []).join('、') || '未识别'} kW`,
    ...issues.slice(0, 8).map((item, index) => `${index + 1}. ${item.title}：${item.evidence}`),
    '需按企业方法和原始报告完成工程师复核；此消息不是放行结论。'
  ];
  return { msg_type: 'text', content: { text: lines.join('\n') } };
}

async function signature(timestamp, secret) {
  if (!secret) return null;
  if (!globalThis.crypto?.subtle || typeof TextEncoder === 'undefined') throw new Error('crypto_unavailable');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}\n${secret}`));
  return base64(new Uint8Array(digest));
}

export async function sendFeishuAlert(result, options = {}) {
  const payload = durabilityAlertPayload(result, options.fileName || 'durability.docx');
  const webhookUrl = String(options.webhookUrl || '').trim();
  if (!webhookUrl) return { ok: false, mode: 'dry-run', reason: 'webhook_missing', payload };
  let parsed;
  try { parsed = new URL(webhookUrl); } catch { return { ok: false, mode: 'rejected', reason: 'webhook_invalid_url', payload }; }
  if (!allowedHosts.has(parsed.hostname)) return { ok: false, mode: 'rejected', reason: 'webhook_host_not_allowed', payload };
  const body = { ...payload };
  const timestamp = Math.floor((options.now || Date.now()) / 1000);
  if (options.secret) { body.timestamp = String(timestamp); body.sign = await signature(timestamp, String(options.secret)); }
  const fetchImpl = options.fetchImpl || fetch;
  try {
    const response = await fetchImpl(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });
    const raw = await response.text(); let responseBody = null; try { responseBody = JSON.parse(raw); } catch { responseBody = { raw }; }
    const serviceOk = responseBody?.code === 0 || responseBody?.StatusCode === 0 || responseBody?.code === undefined;
    return { ok: response.ok && serviceOk, mode: 'sent', status: response.status, response: responseBody, payload };
  } catch (error) {
    return { ok: false, mode: 'failed', reason: error.message || 'network_error', payload };
  }
}
