const text = (value) => typeof value === 'string' && value.trim().length > 0;

const validIsoDate = (value) => {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [year, month, day] = raw.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export function validateTrustedApprovalBinding(payload, approvalRows = [], { now = new Date().toISOString().slice(0, 10), packageHashes = {} } = {}) {
  const profiles = Array.isArray(payload?.profiles) ? payload.profiles : [];
  const checks = profiles.map((profile) => {
    if (profile?.approvalStatus !== 'approved') return { profileId: profile?.id || null, ready: true, status: 'not_required', missing: [], malformed: [], approvalId: null, evidence: 'profile 未标记 approved，不进入可信审批 ledger 路径' };
    const missing = [];
    const malformed = [];
    const profileId = String(profile?.id || '').trim();
    const revision = String(profile?.revision || '').trim();
    const methodId = String(profile?.methodId || '').trim();
    if (!Array.isArray(approvalRows) || !approvalRows.length) missing.push('trustedApprovalLedger.approvalRows');
    const candidates = (approvalRows || []).filter((row) => row?.profileId === profileId && row?.revision === revision && row?.methodId === methodId);
    const row = candidates.length === 1 ? candidates[0] : null;
    if (candidates.length > 1) malformed.push('trustedApprovalLedger.duplicate_match');
    if (!row) missing.push('trustedApprovalLedger.match');
    else {
      if (row.status !== 'approved') malformed.push('trustedApprovalLedger.status');
      if (!text(row.approvalId)) missing.push('trustedApprovalLedger.approvalId');
      if (!text(row.packageSha256) || !/^[a-f0-9]{64}$/i.test(row.packageSha256)) malformed.push('trustedApprovalLedger.packageSha256');
      const packageHash = packageHashes?.[profileId];
      if (!/^[a-f0-9]{64}$/i.test(packageHash || '')) missing.push('trustedApprovalLedger.packageHashNotProvided');
      else if (row.packageSha256.toLowerCase() !== packageHash.toLowerCase()) malformed.push('trustedApprovalLedger.packageHashMismatch');
      if (!validIsoDate(row.validUntil)) malformed.push('trustedApprovalLedger.validUntil');
      else if (row.validUntil < now) malformed.push('trustedApprovalLedger.expired');
      if (row.revoked === true) malformed.push('trustedApprovalLedger.revoked');
    }
    const status = malformed.length ? 'malformed' : missing.length ? 'missing' : 'ready';
    return { profileId, ready: status === 'ready', status, missing: [...new Set(missing)], malformed: [...new Set(malformed)], approvalId: row?.approvalId || null, evidence: status === 'ready' ? `已绑定 trusted approval ledger：${row.approvalId}` : `可信审批绑定${status === 'malformed' ? '格式非法' : '缺失'}：${[...new Set([...malformed, ...missing])].join('、')}` };
  });
  return { ready: checks.every((check) => check.ready), status: checks.some((check) => check.status === 'malformed') ? 'malformed' : checks.some((check) => check.status === 'missing') ? 'missing' : 'ready', checks, source: 'trusted-approval-ledger' };
}
