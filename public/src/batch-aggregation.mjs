export const BATCH_DECLARATION_VERSION = 'h2-testlens.batch-declaration.v1';

const text = (value) => String(value ?? '').trim();

function normalizeName(value) {
  const name = text(value).replaceAll('\\', '/');
  if (!name || name.startsWith('/') || /^[A-Za-z]:\//.test(name)) return null;
  const parts = name.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return null;
  return parts.join('/');
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function unique(values) {
  return [...new Set(values)];
}

function sameMembers(left, right) {
  return left.length === right.length && unique(left).length === unique(right).length && left.every((item) => right.includes(item));
}

function entryMap(entries = []) {
  return new Map(entries.map((entry) => {
    const name = normalizeName(typeof entry === 'string' ? entry : entry?.name);
    return [name, typeof entry === 'string' ? { name, status: 'processed' } : { ...entry, name }];
  }).filter(([name]) => name));
}

/**
 * Validate an enterprise-owned declaration before any rows are grouped.
 * A declaration is descriptive evidence; it does not approve a profile or a standard limit.
 */
export function validateBatchDeclaration(input, availableEntries = []) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['批次声明必须是 JSON 对象'], groups: [] };
  if (input.version !== BATCH_DECLARATION_VERSION) errors.push(`version 必须为 ${BATCH_DECLARATION_VERSION}`);
  if (!Array.isArray(input.groups) || !input.groups.length) errors.push('groups 必须是非空数组');
  const available = entryMap(availableEntries);
  const claimed = new Map();
  const groups = [];

  for (const [groupIndex, raw] of (Array.isArray(input.groups) ? input.groups : []).entries()) {
    const prefix = `groups[${groupIndex}]`;
    const id = text(raw?.id);
    const testRunId = text(raw?.testRunId);
    const sessionGroup = text(raw?.sessionGroup);
    if (!id) errors.push(`${prefix}.id 缺失`);
    if (!testRunId) errors.push(`${prefix}.testRunId 缺失`);
    if (!sessionGroup) errors.push(`${prefix}.sessionGroup 缺失`);
    if (groups.some((group) => group.id === id && id)) errors.push(`${prefix}.id 重复：${id}`);

    const rawFiles = Array.isArray(raw?.files) ? raw.files : [];
    const files = rawFiles.map(normalizeName);
    if (rawFiles.length < 2) errors.push(`${prefix}.files 至少列出 2 个文件`);
    if (files.some((file) => !file)) errors.push(`${prefix}.files 含绝对路径、空路径或 .. 路径`);
    if (unique(files.filter(Boolean)).length !== files.filter(Boolean).length) errors.push(`${prefix}.files 不得重复`);

    const fileOrder = (Array.isArray(raw?.fileOrder) ? raw.fileOrder : rawFiles).map(normalizeName);
    if (!sameMembers(files.filter(Boolean), fileOrder.filter(Boolean))) errors.push(`${prefix}.fileOrder 必须与 files 完全一致`);
    for (const name of files.filter(Boolean)) {
      if (claimed.has(name)) errors.push(`文件 ${name} 被多个批次声明：${claimed.get(name)}、${id || prefix}`);
      claimed.set(name, id || prefix);
      const entry = available.get(name);
      if (available.size && !entry) errors.push(`${prefix} 引用了未导入文件：${name}`);
      if (entry && entry.status !== 'processed') errors.push(`${prefix} 文件未进入分析器：${name}（${entry.status}）`);
    }

    const clockReference = text(raw?.clockReference);
    if (!clockReference) errors.push(`${prefix}.clockReference 缺失`);
    const samplingFrequencyHz = positiveNumber(raw?.samplingFrequencyHz);
    const samplingIntervalS = positiveNumber(raw?.samplingIntervalS);
    if (samplingFrequencyHz === null && samplingIntervalS === null) errors.push(`${prefix} 必须声明 samplingFrequencyHz 或 samplingIntervalS`);
    const samplingTolerancePct = raw?.samplingTolerancePct === undefined || raw?.samplingTolerancePct === null
      ? null
      : nonNegativeNumber(raw.samplingTolerancePct);
    if (raw?.samplingTolerancePct !== undefined && raw?.samplingTolerancePct !== null && samplingTolerancePct === null) {
      errors.push(`${prefix}.samplingTolerancePct 必须是大于等于 0 的数值`);
    }
    const restartBoundaries = Array.isArray(raw?.restartBoundaries) ? raw.restartBoundaries.map(normalizeName) : null;
    if (!restartBoundaries) errors.push(`${prefix}.restartBoundaries 必须是数组`);
    else {
      for (const name of restartBoundaries) if (!name || !files.includes(name)) errors.push(`${prefix}.restartBoundaries 含不在 files 中的文件`);
      if (restartBoundaries.includes(fileOrder[0])) errors.push(`${prefix}.restartBoundaries 不应把首文件标为重启边界`);
    }

    if (!id || !testRunId || !sessionGroup || files.some((file) => !file)) continue;
    groups.push({
      id,
      testRunId,
      sessionGroup,
      files,
      fileOrder,
      clockReference,
      samplingFrequencyHz,
      samplingIntervalS,
      samplingTolerancePct,
      restartBoundaries: restartBoundaries || [],
      boundaryPolicy: text(raw?.boundaryPolicy) || 'per_file_session',
      approvalStatus: text(raw?.approvalStatus) || 'declared',
      evidenceRefs: Array.isArray(raw?.evidenceRefs) ? raw.evidenceRefs.map(text).filter(Boolean) : [],
      approvedBy: text(raw?.approvedBy) || null,
      approvedAt: text(raw?.approvedAt) || null
    });
  }
  return { ok: errors.length === 0, errors, groups: errors.length ? [] : groups };
}

const median = (values) => {
  const sorted = values.filter((value) => Number.isFinite(value)).slice().sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function declaredIntervalS(group) {
  if (group.samplingIntervalS !== null && group.samplingIntervalS !== undefined) return group.samplingIntervalS;
  return group.samplingFrequencyHz ? 1 / group.samplingFrequencyHz : null;
}

function fileObservation(name, result) {
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const timestamps = rows.map((row) => row?.timestamp_s);
  const validTimestamps = timestamps.filter((value) => Number.isFinite(value));
  const intervals = timestamps.slice(1).map((timestamp, index) => {
    const previous = timestamps[index];
    return Number.isFinite(previous) && Number.isFinite(timestamp) ? timestamp - previous : null;
  }).filter((delta) => delta !== null);
  const positiveIntervals = intervals.filter((delta) => delta > 0);
  const duplicateTimestampCount = validTimestamps.length - new Set(validTimestamps).size;
  const nonMonotonicCount = intervals.filter((delta) => delta < 0).length;
  const nonPositiveIntervalCount = intervals.filter((delta) => delta <= 0).length;
  const quality = result?.quality || {};
  const invalidTimestampCount = timestamps.length - validTimestamps.length;
  const medianIntervalS = quality.medianIntervalS ?? median(positiveIntervals);
  const firstTimestamp = validTimestamps[0] ?? null;
  const lastTimestamp = validTimestamps.at(-1) ?? null;
  const strictIncreasing = invalidTimestampCount === 0
    && (quality.duplicateTimestampCount ?? duplicateTimestampCount) === 0
    && (quality.nonMonotonicCount ?? nonMonotonicCount) === 0
    && (quality.nonPositiveIntervalCount ?? nonPositiveIntervalCount) === 0;
  return {
    name,
    rowCount: rows.length,
    timestampCount: validTimestamps.length,
    invalidTimestampCount,
    firstTimestamp,
    lastTimestamp,
    strictIncreasing,
    duplicateTimestampCount: quality.duplicateTimestampCount ?? duplicateTimestampCount,
    nonMonotonicCount: quality.nonMonotonicCount ?? nonMonotonicCount,
    nonPositiveIntervalCount: quality.nonPositiveIntervalCount ?? nonPositiveIntervalCount,
    observedIntervalCount: quality.observedIntervalCount ?? positiveIntervals.length,
    medianIntervalS,
    effectiveSamplingFrequencyHz: quality.effectiveSamplingFrequencyHz ?? (medianIntervalS ? 1 / medianIntervalS : null),
    status: invalidTimestampCount || !strictIncreasing ? 'not_ready' : validTimestamps.length >= 2 ? 'ready' : 'not_evaluable'
  };
}

/**
 * Compare the declared batch envelope with canonical timestamps produced from each file.
 * This is an evidence/readiness check only: it does not apply a standard limit or join sessions.
 */
export function observeDeclaredBatch(group, fileResults = []) {
  const files = group.fileOrder.map((name) => {
    const item = fileResults.find((candidate) => candidate.name === name);
    return fileObservation(name, item?.result);
  });
  const declaredInterval = declaredIntervalS(group);
  const observedMedianIntervalS = median(files.map((file) => file.medianIntervalS));
  const samplingDeviationPct = declaredInterval !== null && observedMedianIntervalS !== null
    ? ((observedMedianIntervalS - declaredInterval) / declaredInterval) * 100
    : null;
  const samplingTolerancePct = group.samplingTolerancePct;
  let samplingStatus = 'not_evaluable';
  if (samplingDeviationPct !== null) {
    if (samplingTolerancePct === null || samplingTolerancePct === undefined) samplingStatus = Math.abs(samplingDeviationPct) <= 1e-9 ? 'observed_only' : 'tolerance_not_declared';
    else samplingStatus = Math.abs(samplingDeviationPct) <= samplingTolerancePct ? 'within_tolerance' : 'outside_tolerance';
  }

  const crossFile = [];
  const issues = [];
  for (const [index, current] of files.entries()) {
    if (index === 0) continue;
    const previous = files[index - 1];
    const deltaS = previous.lastTimestamp !== null && current.firstTimestamp !== null
      ? current.firstTimestamp - previous.lastTimestamp
      : null;
    const relation = deltaS === null ? 'not_evaluable' : deltaS > 0 ? 'forward' : deltaS === 0 ? 'overlap' : 'rewind';
    const restartBoundaryDeclared = group.restartBoundaries.includes(current.name);
    const boundaryReady = relation === 'forward' || (relation !== 'not_evaluable' && restartBoundaryDeclared);
    crossFile.push({ from: previous.name, to: current.name, deltaS, relation, restartBoundaryDeclared, status: boundaryReady ? 'declared_or_forward' : 'not_ready' });
    if (!boundaryReady) {
      issues.push({
        code: relation === 'not_evaluable' ? 'BATCH_CROSS_FILE_TIME_MISSING' : 'BATCH_CROSS_FILE_BOUNDARY_MISSING',
        fileIndex: index,
        evidence: relation === 'not_evaluable' ? `文件 ${index + 1} 与前一文件缺少可比较的首尾时间` : `文件 ${index + 1} 与前一文件${relation === 'rewind' ? '时间倒退' : '时间重叠'}（Δt=${deltaS} s），未声明 restart boundary`
      });
    }
  }
  for (const [fileIndex, file] of files.entries()) {
    if (file.status === 'not_evaluable') issues.push({ code: 'BATCH_TIMESTAMP_NOT_EVALUABLE', fileIndex, evidence: `文件 ${fileIndex + 1} 没有至少两个有效时间戳` });
    else if (file.status === 'not_ready') issues.push({ code: 'BATCH_FILE_TIME_SEQUENCE_INVALID', fileIndex, evidence: `文件 ${fileIndex + 1} 时间戳无效或不是严格递增序列` });
  }
  if (samplingStatus === 'outside_tolerance') issues.push({ code: 'BATCH_SAMPLING_OUTSIDE_TOLERANCE', evidence: `实际中位采样间隔 ${observedMedianIntervalS} s 与声明 ${declaredInterval} s 的偏差 ${samplingDeviationPct.toFixed(3)}% 超过企业声明容差 ${samplingTolerancePct}%` });
  if (samplingStatus === 'tolerance_not_declared') issues.push({ code: 'BATCH_SAMPLING_TOLERANCE_MISSING', evidence: `实际中位采样间隔 ${observedMedianIntervalS} s 与声明 ${declaredInterval} s 的偏差为 ${samplingDeviationPct.toFixed(3)}%，未提供企业采样容差` });

  return {
    status: issues.length ? 'not_ready' : 'ready',
    sampling: {
      declaredFrequencyHz: group.samplingFrequencyHz,
      declaredIntervalS: declaredInterval,
      observedMedianIntervalS,
      observedEffectiveSamplingFrequencyHz: observedMedianIntervalS ? 1 / observedMedianIntervalS : null,
      deviationPct: samplingDeviationPct,
      tolerancePct: samplingTolerancePct,
      status: samplingStatus
    },
    files,
    crossFile,
    issueCodes: unique(issues.map((issue) => issue.code)),
    issues
  };
}

export function annotateDeclaredBatchRows(group, entries = []) {
  const byName = entryMap(entries);
  const rows = [];
  for (const [fileIndex, name] of group.fileOrder.entries()) {
    const entry = byName.get(name);
    for (const [sourceRowIndex, row] of (entry?.rows || []).entries()) {
      rows.push({
        ...row,
        source_file: name,
        source_row_index: sourceRowIndex,
        session_id: `file:${name}`,
        batch_group_id: group.id,
        test_run_id: group.testRunId,
        session_group: group.sessionGroup,
        batch_file_index: fileIndex,
        batch_file_count: group.fileOrder.length,
        batch_boundary_before: fileIndex > 0 && sourceRowIndex === 0
      });
    }
  }
  return rows;
}

function numericMetrics(result) {
  return Object.fromEntries(Object.entries(result?.metrics || {}).filter(([, value]) => Number.isFinite(value)).slice(0, 24));
}

function issueCounts(results) {
  const counts = {};
  for (const result of results) for (const issue of result?.issues || []) counts[issue.code] = (counts[issue.code] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function fileSummary(entry, result) {
  return {
    name: entry.name,
    hash: entry.hash || entry.contentHash || null,
    rowCount: entry.rowCount ?? entry.rows?.length ?? result?.quality?.rowCount ?? 0,
    firstTimestamp: entry.firstTimestamp ?? null,
    lastTimestamp: entry.lastTimestamp ?? null,
    datasetType: result?.datasetType || null,
    verdict: result?.verdict || null,
    issueCodes: unique((result?.issues || []).map((item) => item.code)).slice(0, 24),
    metrics: numericMetrics(result)
  };
}

/**
 * Build a bounded, local batch evidence object. Rows are deliberately excluded.
 */
export function summarizeDeclaredBatch(group, entries = [], fileResults = [], combinedResult = null, observation = null) {
  const resultByName = new Map(fileResults.map((item) => [item.name, item.result]));
  const files = group.fileOrder.map((name) => fileSummary(entries.find((entry) => entry.name === name) || { name }, resultByName.get(name)));
  const verdictCounts = {};
  for (const item of files) if (item.verdict) verdictCounts[item.verdict] = (verdictCounts[item.verdict] || 0) + 1;
  return {
    status: 'descriptive_only',
    mergeMode: 'declared_grouped_sessions',
    declarationVersion: BATCH_DECLARATION_VERSION,
    groupId: group.id,
    testRunId: group.testRunId,
    sessionGroup: group.sessionGroup,
    fileCount: files.length,
    rowCount: files.reduce((sum, item) => sum + item.rowCount, 0),
    fileOrder: group.fileOrder,
    clockReference: group.clockReference,
    sampling: { frequencyHz: group.samplingFrequencyHz, intervalS: group.samplingIntervalS, tolerancePct: group.samplingTolerancePct },
    restartBoundaries: group.restartBoundaries,
    boundaryPolicy: group.boundaryPolicy,
    approvalStatus: group.approvalStatus,
    approvedBy: group.approvedBy,
    approvedAt: group.approvedAt,
    evidenceRefs: group.evidenceRefs,
    datasetTypes: unique(files.map((item) => item.datasetType).filter(Boolean)),
    verdictCounts,
    issueCounts: issueCounts(fileResults.map((item) => item.result)),
    combined: combinedResult ? {
      datasetType: combinedResult.datasetType || null,
      verdict: combinedResult.verdict || null,
      rowCount: combinedResult.quality?.rowCount ?? combinedResult.metrics?.sampleCount ?? 0,
      sessionCount: combinedResult.dataset?.sessionCount ?? combinedResult.quality?.sessionCount ?? files.length,
      sessionBoundaryCount: combinedResult.dataset?.sessionBoundaryCount ?? combinedResult.quality?.sessionBoundaryCount ?? Math.max(0, files.length - 1),
      metrics: numericMetrics(combinedResult)
    } : null,
    observation: observation || observeDeclaredBatch(group, fileResults),
    files,
    boundary: '只在企业声明的 testRunId/sessionGroup 内做描述性汇总；每个文件仍是独立 session，不把尾首记录、重启、时钟或采样间隔拼成连续时序，不产生标准符合性、认证或放行结论。'
  };
}

export function publicBatchAggregation(summary) {
  if (!summary || typeof summary !== 'object') return summary;
  const safeFile = (item = {}) => {
    const { name, hash, ...safe } = item;
    return { ...safe, fileNamePresent: Boolean(name), hashPresent: Boolean(hash) };
  };
  const { groupId, testRunId, sessionGroup, clockReference, approvedBy, approvedAt, evidenceRefs, fileOrder, restartBoundaries, observation, ...safeSummary } = summary;
  const safeObservation = observation && typeof observation === 'object' ? {
    ...observation,
    files: Array.isArray(observation.files) ? observation.files.map(({ name, ...item }) => ({ ...item, fileNamePresent: Boolean(name) })) : [],
    crossFile: Array.isArray(observation.crossFile) ? observation.crossFile.map(({ from, to, ...item }) => ({ ...item, fromFilePresent: Boolean(from), toFilePresent: Boolean(to) })) : [],
    issues: Array.isArray(observation.issues) ? observation.issues.map(({ evidence: _evidence, ...item }) => item) : []
  } : null;
  return {
    ...safeSummary,
    groupIdPresent: Boolean(groupId),
    testRunIdPresent: Boolean(testRunId),
    sessionGroupPresent: Boolean(sessionGroup),
    clockReferencePresent: Boolean(clockReference),
    approvedByPresent: Boolean(approvedBy),
    approvedAtPresent: Boolean(approvedAt),
    evidenceRefCount: Array.isArray(evidenceRefs) ? evidenceRefs.length : 0,
    fileOrder: Array.isArray(fileOrder) ? fileOrder.map(() => '[redacted]') : [],
    restartBoundaries: Array.isArray(restartBoundaries) ? restartBoundaries.map(() => '[redacted]') : [],
    files: Array.isArray(summary.files) ? summary.files.map(safeFile) : [],
    observation: safeObservation
  };
}

export function batchAggregationMarkdown(summary) {
  if (!summary || typeof summary !== 'object') return '';
  const safe = (value) => String(value ?? '—').replace(/[|\r\n]/g, ' ');
  const files = (summary.files || []).map((item, index) => `| ${index + 1} | ${safe(item.name)} | ${safe(item.rowCount)} | ${safe(item.firstTimestamp)} | ${safe(item.lastTimestamp)} | ${safe(item.verdict)} |`).join('\n') || '| — | — | — | — | — | — |';
  const observation = summary.observation || {};
  const sampling = observation.sampling || {};
  const observationIssues = (observation.issues || []).map((item) => `${safe(item.code)}：${safe(item.evidence)}`).join('；') || '无';
  const deviation = sampling.deviationPct === null || sampling.deviationPct === undefined ? '未计算' : `${safe(Number(sampling.deviationPct).toFixed(3))}%`;
  return `\n## 显式批次汇总（描述性，不是标准判定）\n\n- 汇总状态：**${safe(summary.status)}** · 模式：${safe(summary.mergeMode)}\n- 观测门控：**${safe(observation.status || 'not_evaluable')}** · 采样核对：${safe(sampling.status || 'not_evaluable')}\n- testRunId：${safe(summary.testRunId)} · sessionGroup：${safe(summary.sessionGroup)}\n- 文件数：${safe(summary.fileCount)} · 行/功率点合计：${safe(summary.rowCount)}\n- 时钟引用：${safe(summary.clockReference)} · 采样声明：${summary.sampling?.frequencyHz ? `${safe(summary.sampling.frequencyHz)} Hz` : `${safe(summary.sampling?.intervalS)} s/点`} · 企业容差：${summary.sampling?.tolerancePct === null || summary.sampling?.tolerancePct === undefined ? '未提供' : `${safe(summary.sampling.tolerancePct)}%`}\n- 实际中位采样间隔：${safe(sampling.observedMedianIntervalS)} s · 偏差：${deviation}\n- 重启边界：${(summary.restartBoundaries || []).map(safe).join('、') || '未声明'}\n- 观测问题：${observationIssues}\n- 边界：${safe(summary.boundary)}\n\n| 顺序 | 文件 | 记录数 | 首时间 | 末时间 | 文件判定 |\n|---:|---|---:|---|---|---|\n${files}\n`;
}
