const text = (value) => typeof value === 'string' && value.trim().length > 0;

export function parseJsonlLedger(content, label = 'ledger') {
  const rows = [];
  const errors = [];
  String(content ?? '').split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    try {
      const value = JSON.parse(line);
      if (!value || typeof value !== 'object' || Array.isArray(value)) errors.push(`${label}:${index + 1}: object_required`);
      else rows.push({ ...value, __line: index + 1 });
    } catch (error) {
      errors.push(`${label}:${index + 1}: ${error.message}`);
    }
  });
  return { rows, errors };
}

export function validateEvidenceLedger({ sources = [], evidence = [], claims = [] } = {}) {
  const errors = [];
  const sourceIds = new Set();
  const evidenceIds = new Set();
  const claimIds = new Set();
  for (const [index, row] of sources.entries()) {
    const label = `sources[${index}]`;
    if (!text(row?.source_id)) errors.push(`${label}.source_id_missing`);
    else if (sourceIds.has(row.source_id)) errors.push(`${label}.source_id_duplicate:${row.source_id}`);
    else sourceIds.add(row.source_id);
  }
  const evidenceById = new Map();
  for (const [index, row] of evidence.entries()) {
    const label = `evidence[${index}]`;
    if (!text(row?.evidence_id)) errors.push(`${label}.evidence_id_missing`);
    else if (evidenceIds.has(row.evidence_id)) errors.push(`${label}.evidence_id_duplicate:${row.evidence_id}`);
    else {
      evidenceIds.add(row.evidence_id);
      evidenceById.set(row.evidence_id, row);
    }
    if (!text(row?.source_id)) errors.push(`${label}.source_id_missing`);
    else if (sourceIds.size && !sourceIds.has(row.source_id)) errors.push(`${label}.source_id_unknown:${row.source_id}`);
    if (!text(row?.evidence_type)) errors.push(`${label}.evidence_type_missing`);
    if (!text(row?.locator)) errors.push(`${label}.locator_missing`);
  }
  for (const [index, row] of claims.entries()) {
    const label = `claims[${index}]`;
    if (!text(row?.claim_id)) errors.push(`${label}.claim_id_missing`);
    else if (claimIds.has(row.claim_id)) errors.push(`${label}.claim_id_duplicate:${row.claim_id}`);
    else claimIds.add(row.claim_id);
    const refs = Array.isArray(row?.evidence_ids) ? row.evidence_ids.filter(text) : [];
    if (!refs.length) errors.push(`${label}.evidence_ids_missing`);
    for (const evidenceId of refs) {
      const item = evidenceById.get(evidenceId);
      if (!item) errors.push(`${label}.evidence_id_unknown:${evidenceId}`);
      else if (Array.isArray(item.supports) && !item.supports.includes(row.claim_id)) errors.push(`${label}.evidence_supports_missing:${evidenceId}`);
    }
  }
  return { ready: errors.length === 0, status: errors.length ? 'invalid' : 'ready', sourceCount: sources.length, evidenceCount: evidence.length, claimCount: claims.length, errors, evidenceById, evidenceIds: [...evidenceIds], sourceIds: [...sourceIds], claimIds: [...claimIds] };
}

export function validateMethodSourceBinding(methodSource, evidenceRows = [], { requireEvidenceIds = true } = {}) {
  const source = methodSource && typeof methodSource === 'object' && !Array.isArray(methodSource) ? methodSource : null;
  if (!source) return { ready: false, status: 'missing', missing: ['methodSource'], malformed: [], matchedEvidenceIds: [], evidenceSourceId: null, evidence: 'methodSource 缺失' };
  const missing = [];
  const malformed = [];
  for (const field of ['sourceId', 'locator', 'evidenceType']) if (!text(source[field])) missing.push(`methodSource.${field}`);
  const evidenceIds = Array.isArray(source.evidenceIds) ? source.evidenceIds.filter(text) : [];
  if (requireEvidenceIds && !evidenceIds.length) missing.push('methodSource.evidenceIds');
  if (source.evidenceIds !== undefined && !Array.isArray(source.evidenceIds)) malformed.push('methodSource.evidenceIds');
  if (new Set(evidenceIds).size !== evidenceIds.length) malformed.push('methodSource.evidenceIds_duplicate');
  const candidates = evidenceRows.filter((row) => row?.source_id === source.sourceId);
  if (!candidates.length && text(source.sourceId)) missing.push('methodSource.sourceId.evidenceLedger');
  const selected = evidenceIds.length ? candidates.filter((row) => evidenceIds.includes(row.evidence_id)) : candidates;
  for (const evidenceId of evidenceIds) {
    const row = evidenceRows.find((item) => item?.evidence_id === evidenceId);
    if (!row) missing.push(`methodSource.evidenceIds.unknown:${evidenceId}`);
    else if (row.source_id !== source.sourceId) malformed.push(`methodSource.evidenceIds.sourceMismatch:${evidenceId}`);
  }
  const matched = selected.filter((row) => row.locator === source.locator && row.evidence_type === source.evidenceType);
  if (!matched.length && candidates.length) missing.push('methodSource.locator/evidenceType.evidenceLedger');
  const status = malformed.length ? 'malformed' : missing.length ? 'missing' : 'ready';
  return { ready: status === 'ready', status, missing: [...new Set(missing)], malformed: [...new Set(malformed)], matchedEvidenceIds: matched.map((row) => row.evidence_id), evidenceSourceId: source.sourceId || null, evidence: status === 'ready' ? `methodSource 已绑定 evidence ledger：${matched.map((row) => row.evidence_id).join('、')}` : `methodSource 证据引用${status === 'malformed' ? '格式非法' : '缺失'}：${[...new Set([...malformed, ...missing])].join('、')}` };
}

export function validateStandardReferenceBinding(reference, index, evidenceRows = [], { requireEvidenceIds = true } = {}) {
  const label = `standardRefs[${index}]`;
  const ref = reference && typeof reference === 'object' && !Array.isArray(reference) ? reference : null;
  if (!ref) return { ready: false, status: 'malformed', missing: [], malformed: [label], matchedEvidenceIds: [], evidenceSourceId: null, evidence: `${label} 必须是对象` };
  const missing = [];
  const malformed = [];
  const evidenceSourceId = text(ref.evidenceSourceId) ? ref.evidenceSourceId.trim() : '';
  const evidenceIds = Array.isArray(ref.evidenceIds) ? ref.evidenceIds.filter(text) : [];
  if (requireEvidenceIds && !evidenceSourceId) missing.push(`${label}.evidenceSourceId`);
  if (requireEvidenceIds && !evidenceIds.length) missing.push(`${label}.evidenceIds`);
  if (ref.evidenceIds !== undefined && !Array.isArray(ref.evidenceIds)) malformed.push(`${label}.evidenceIds`);
  if (new Set(evidenceIds).size !== evidenceIds.length) malformed.push(`${label}.evidenceIds_duplicate`);
  const candidates = evidenceRows.filter((row) => row?.source_id === evidenceSourceId);
  if (requireEvidenceIds && evidenceSourceId && !candidates.length) missing.push(`${label}.evidenceSourceId.evidenceLedger`);
  const matched = [];
  for (const evidenceId of evidenceIds) {
    const row = evidenceRows.find((item) => item?.evidence_id === evidenceId);
    if (!row) missing.push(`${label}.evidenceIds.unknown:${evidenceId}`);
    else if (evidenceSourceId && row.source_id !== evidenceSourceId) malformed.push(`${label}.evidenceIds.sourceMismatch:${evidenceId}`);
    else matched.push(row);
  }
  const status = malformed.length ? 'malformed' : missing.length ? 'missing' : 'ready';
  return {
    ready: status === 'ready',
    status,
    missing: [...new Set(missing)],
    malformed: [...new Set(malformed)],
    matchedEvidenceIds: matched.map((row) => row.evidence_id),
    evidenceSourceId: evidenceSourceId || null,
    evidence: status === 'ready'
      ? `${label} 已绑定标准证据 ledger：${matched.map((row) => row.evidence_id).join('、')}`
      : `${label} 标准证据引用${status === 'malformed' ? '格式非法' : '缺失'}：${[...new Set([...malformed, ...missing])].join('、')}`
  };
}

export function validateProfileEvidenceBindings(payload, evidenceRows = [], options = {}) {
  const profiles = Array.isArray(payload?.profiles) ? payload.profiles : [];
  const checks = profiles.map((profile) => {
    const binding = profile?.methodSource
      ? validateMethodSourceBinding(profile.methodSource, evidenceRows, options)
      : { ready: true, status: 'not_configured', missing: [], malformed: [], matchedEvidenceIds: [], evidenceSourceId: null, evidence: 'profile 未声明 methodSource' };
    const standardReferences = Array.isArray(profile?.standardRefs)
      ? profile.standardRefs.map((reference, index) => validateStandardReferenceBinding(reference, index, evidenceRows, options))
      : [];
    return { profileId: profile?.id || null, methodId: profile?.methodId || null, binding, standardReferences };
  });
  return { ready: checks.every((check) => check.binding.ready && check.standardReferences.every((binding) => binding.ready)), checks };
}
