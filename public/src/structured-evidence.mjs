const PASS_STATUSES = new Set(['pass', 'passed', 'complete', 'completed', 'ok', '通过', '完成']);

const hasText = (value) => String(value ?? '').trim().length > 0;
const finiteNumber = (value) => value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value));

function evidenceRecordReadiness(config = {}, requirementKey, recordKey, label) {
  const requirements = Array.isArray(config[requirementKey]) ? config[requirementKey].filter((item) => item && item.required !== false) : [];
  if (!requirements.length) return { required: false, ready: true, status: 'not_configured', missing: [], failed: [], missingEvidence: [], malformed: 0, requiredItems: [], observedItemCount: 0, evidence: `profile 未声明结构化${label}要求` };
  const records = config.testMetadata?.[recordKey];
  if (!Array.isArray(records)) return { required: true, ready: false, status: 'missing', missing: requirements.map((item) => item.id), failed: [], missingEvidence: [], malformed: 0, requiredItems: requirements, observedItemCount: 0, evidence: `缺少结构化 ${recordKey}；自由文本不能替代${label}证据` };
  const missing = [];
  const failed = [];
  const missingEvidence = [];
  for (const requirement of requirements) {
    const record = records.find((item) => item && String(item.id || '').trim() === requirement.id);
    if (!record) { missing.push(requirement.id); continue; }
    if (!PASS_STATUSES.has(String(record.status || '').trim().toLowerCase())) failed.push(`${requirement.id}:${String(record.status || '未填写')}`);
    if (!hasText(record.evidenceRef)) missingEvidence.push(requirement.id);
  }
  const malformed = records.filter((item) => !item || typeof item !== 'object' || Array.isArray(item) || !hasText(item.id) || !hasText(item.status)).length;
  const status = malformed ? 'malformed' : missing.length || failed.length || missingEvidence.length ? 'missing' : 'ready';
  return {
    required: true,
    ready: status === 'ready',
    status,
    missing,
    failed,
    missingEvidence,
    malformed,
    requiredItems: requirements,
    observedItemCount: records.length,
    evidence: status === 'ready' ? `${requirements.length} 项${label}均为通过状态且有证据引用` : malformed ? `${malformed} 条${label}记录缺少 id/status` : `${label}证据缺失：${[...missing, ...failed, ...missingEvidence].join('、')}`
  };
}

export function acquisitionReadiness(config = {}) {
  const requirements = config.acquisitionRequirements && typeof config.acquisitionRequirements === 'object' && !Array.isArray(config.acquisitionRequirements)
    ? config.acquisitionRequirements
    : null;
  const requiredChannels = Array.isArray(requirements?.requiredChannels) ? requirements.requiredChannels : [];
  const required = Boolean(requirements && (requirements.requireSamplingFrequency || requirements.requireSynchronization || requirements.requireEvidenceRef || requiredChannels.length));
  if (!required) return { ready: true, required: false, status: 'not_configured', missing: [], unitMismatches: [], malformed: 0, requiredChannels: [], observedChannelCount: 0, evidence: 'profile 未声明结构化数据采集证据要求' };
  const record = config.testMetadata?.acquisitionRecord;
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { ready: false, required: true, status: 'missing', missing: ['acquisitionRecord'], unitMismatches: [], malformed: 0, requiredChannels, observedChannelCount: 0, evidence: '缺少结构化 acquisitionRecord；自由文本采集计划不能替代采样、同步和通道证据' };
  const missing = [];
  const unitMismatches = [];
  if (requirements.requireSamplingFrequency && (!Number.isFinite(Number(record.samplingFrequencyHz)) || Number(record.samplingFrequencyHz) <= 0)) missing.push('samplingFrequencyHz');
  if (requirements.requireSynchronization) {
    const synchronization = record.synchronization;
    if (!synchronization || typeof synchronization !== 'object' || Array.isArray(synchronization)) missing.push('synchronization.status', 'synchronization.clockReference');
    else {
      if (!hasText(synchronization.status)) missing.push('synchronization.status');
      if (!hasText(synchronization.clockReference)) missing.push('synchronization.clockReference');
    }
  }
  if (requirements.requireEvidenceRef && !hasText(record.evidenceRef)) missing.push('evidenceRef');
  const channels = Array.isArray(record.channels) ? record.channels : [];
  const malformed = channels.filter((channel) => !channel || typeof channel !== 'object' || Array.isArray(channel) || !hasText(channel.field) || !hasText(channel.channelId) || !hasText(channel.unit)).length;
  for (const requirement of requiredChannels) {
    const field = typeof requirement === 'string' ? requirement : requirement?.field;
    const expectedUnit = typeof requirement === 'object' ? String(requirement.unit || '').trim() : '';
    const channel = channels.find((candidate) => candidate && String(candidate.field || '').trim() === field);
    if (!channel) missing.push(`channel:${field}`);
    else if (expectedUnit && String(channel.unit || '').trim() !== expectedUnit) unitMismatches.push(`${field}:${String(channel.unit || '未提供')}≠${expectedUnit}`);
  }
  const status = malformed ? 'malformed' : missing.length || unitMismatches.length ? 'missing' : 'ready';
  const evidence = status === 'ready'
    ? `采样频率、同步时钟和 ${channels.length} 个通道均有结构化证据`
    : malformed
      ? `${malformed} 条采集通道记录缺少 field/channelId/unit`
      : `采集证据缺失：${[...missing, ...unitMismatches].join('、')}`;
  return { ready: status === 'ready', required: true, status, missing, unitMismatches, malformed, requiredChannels, observedChannelCount: channels.length, evidence };
}

export function preCheckReadiness(config = {}) {
  const requirements = Array.isArray(config.preCheckRequirements) ? config.preCheckRequirements.filter((item) => item && item.required !== false) : [];
  if (!requirements.length) return { ready: true, required: false, status: 'not_configured', missing: [], failed: [], missingEvidence: [], malformed: 0, requiredItems: [], observedItemCount: 0, evidence: 'profile 未声明结构化试验前检查项目' };
  const items = config.testMetadata?.preCheckItems;
  if (!Array.isArray(items)) return { ready: false, required: true, status: 'missing', missing: requirements.map((item) => item.id), failed: [], missingEvidence: [], malformed: 0, requiredItems: requirements, observedItemCount: 0, evidence: '缺少结构化 preCheckItems；自由文本前检查记录不能替代逐项状态和证据引用' };
  const missing = [];
  const failed = [];
  const missingEvidence = [];
  const passStatuses = new Set(['pass', 'passed', 'ok', '通过', '合格']);
  for (const requirement of requirements) {
    const item = items.find((candidate) => candidate && String(candidate.id || '').trim() === requirement.id);
    if (!item) { missing.push(requirement.id); continue; }
    if (!passStatuses.has(String(item.status || '').trim().toLowerCase())) failed.push(`${requirement.id}:${String(item.status || '未填写')}`);
    if (!hasText(item.evidenceRef)) missingEvidence.push(requirement.id);
  }
  const malformed = items.filter((item) => !item || typeof item !== 'object' || Array.isArray(item) || !hasText(item.id) || !hasText(item.status)).length;
  const status = malformed ? 'malformed' : missing.length || failed.length || missingEvidence.length ? 'missing' : 'ready';
  const evidence = status === 'ready'
    ? `${requirements.length} 项试验前检查均为通过状态且有证据引用`
    : malformed
      ? `${malformed} 条前检查记录缺少 id/status`
      : `前检查证据缺失：${[...missing, ...failed, ...missingEvidence].join('、')}`;
  return { ready: status === 'ready', required: true, status, missing, failed, missingEvidence, malformed, requiredItems: requirements, observedItemCount: items.length, evidence };
}

export function dataQualityReadiness(config = {}, quality = {}, phaseCoverage = { required: [] }) {
  const requirements = config.dataQualityRequirements && typeof config.dataQualityRequirements === 'object' && !Array.isArray(config.dataQualityRequirements)
    ? config.dataQualityRequirements
    : {};
  const configured = Object.keys(requirements).length > 0;
  const missing = [];
  const failed = [];
  if (requirements.requireMonotonicTimestamps && quality.nonMonotonicCount > 0) failed.push(`nonMonotonicCount=${quality.nonMonotonicCount}`);
  if (requirements.requireUniqueTimestamps && quality.duplicateTimestampCount > 0) failed.push(`duplicateTimestampCount=${quality.duplicateTimestampCount}`);
  if (requirements.requirePositiveIntervals && quality.nonPositiveIntervalCount > 0) failed.push(`nonPositiveIntervalCount=${quality.nonPositiveIntervalCount}`);
  if (quality.samplingGapCount !== null && quality.samplingGapCount > 0) failed.push(`samplingGapCount=${quality.samplingGapCount}`);
  if (requirements.requirePlannedSamplingFrequency && quality.plannedSamplingFrequencyHz === null) missing.push('plannedSamplingFrequencyHz');
  const tolerancePct = Number(requirements.samplingRateTolerancePct);
  if (requirements.requireSamplingRateMatch) {
    if (quality.plannedIntervalS === null) missing.push('plannedSamplingFrequencyHz');
    else if (quality.samplingIntervalDeviationPct === null) missing.push('observedSamplingInterval');
    else if (Number.isFinite(tolerancePct) && Math.abs(quality.samplingIntervalDeviationPct) > tolerancePct) failed.push(`samplingIntervalDeviationPct=${quality.samplingIntervalDeviationPct.toFixed(3)}`);
  }
  const minCoveragePct = Number(requirements.minPhaseCoveragePct);
  const phaseCoverageFailures = Number.isFinite(minCoveragePct)
    ? phaseCoverage.required.filter((phase) => phase.count > 0 && (phase.validDataCoveragePct === null || phase.validDataCoveragePct < minCoveragePct)).map((phase) => `${phase.id}.validDataCoveragePct=${phase.validDataCoveragePct ?? '—'}`)
    : [];
  if (phaseCoverageFailures.length) failed.push(...phaseCoverageFailures);
  if (requirements.requireContiguousPhaseRows) {
    const interrupted = phaseCoverage.required.filter((phase) => phase.interruptedSegmentCount > 0).map((phase) => `${phase.id}.interruptedSegmentCount=${phase.interruptedSegmentCount}`);
    if (interrupted.length) failed.push(...interrupted);
  }
  const status = missing.length ? 'missing' : failed.length ? 'failed' : configured ? 'ready' : 'not_configured';
  const evidence = status === 'ready'
    ? `时间轴 ${quality.observedIntervalCount ?? 0} 个正间隔；中位采样间隔 ${quality.medianIntervalS ?? '—'} s；阶段覆盖规则已核对`
    : status === 'not_configured'
      ? 'profile 未声明额外数据质量门控；系统仍保留观测指标供工程复核'
      : `数据质量门控未通过：${[...missing, ...failed].join('、')}`;
  return { required: configured, status, ready: status === 'ready' || status === 'not_configured', missing, failed, requirements, evidence };
}

export function testSystemReadiness(config = {}) {
  return evidenceRecordReadiness(config, 'testSystemRequirements', 'testSystemEvidence', '测试系统组成');
}

export function testStageReadiness(config = {}) {
  const requirements = Array.isArray(config.requiredTestStages) ? config.requiredTestStages.filter((item) => item && item.required !== false) : [];
  if (!requirements.length) return { required: false, ready: true, status: 'not_configured', missing: [], failed: [], missingEvidence: [], malformed: 0, requiredStages: [], observedStageCount: 0, evidence: 'profile 未声明结构化测试阶段证据要求' };
  const records = config.testMetadata?.testStages;
  if (!Array.isArray(records)) return { required: true, ready: false, status: 'missing', missing: requirements.map((item) => item.id), failed: [], missingEvidence: [], malformed: 0, requiredStages: requirements, observedStageCount: 0, evidence: '缺少结构化 testStages；自由文本测试计划不能替代阶段状态和证据引用' };
  const missing = [];
  const failed = [];
  const missingEvidence = [];
  for (const requirement of requirements) {
    const record = records.find((item) => item && String(item.id || '').trim() === requirement.id);
    if (!record) { missing.push(requirement.id); continue; }
    if (!PASS_STATUSES.has(String(record.status || '').trim().toLowerCase())) failed.push(`${requirement.id}:${String(record.status || '未填写')}`);
    if (!hasText(record.evidenceRef)) missingEvidence.push(requirement.id);
  }
  const malformed = records.filter((item) => !item || typeof item !== 'object' || Array.isArray(item) || !hasText(item.id) || !hasText(item.status)).length;
  const status = malformed ? 'malformed' : missing.length || failed.length || missingEvidence.length ? 'missing' : 'ready';
  return {
    required: true,
    ready: status === 'ready',
    status,
    missing,
    failed,
    missingEvidence,
    malformed,
    requiredStages: requirements,
    observedStageCount: records.length,
    evidence: status === 'ready' ? `${requirements.length} 个测试阶段均为完成状态且有证据引用` : malformed ? `${malformed} 条测试阶段记录缺少 id/status` : `测试阶段证据缺失：${[...missing, ...failed, ...missingEvidence].join('、')}`
  };
}

export function testStageReadinessForId(config = {}, stageId) {
  const id = String(stageId || '').trim();
  const aggregate = testStageReadiness(config);
  if (!id || !aggregate.required) return aggregate;
  const requirement = aggregate.requiredStages.find((item) => String(item.id || '').trim() === id);
  if (!requirement) return { ...aggregate, ready: false, status: 'missing', missing: [id], evidence: `profile 未声明测试阶段：${id}` };
  const records = config.testMetadata?.testStages;
  if (!Array.isArray(records)) return { ...aggregate, ready: false, status: 'missing', missing: [id], failed: [], missingEvidence: [], evidence: `缺少结构化测试阶段：${id}` };
  const record = records.find((item) => item && String(item.id || '').trim() === id);
  if (!record) return { ...aggregate, ready: false, status: 'missing', missing: [id], failed: [], missingEvidence: [], evidence: `测试阶段证据缺失：${id}` };
  if (typeof record !== 'object' || Array.isArray(record) || !hasText(record.id) || !hasText(record.status)) return { ...aggregate, ready: false, status: 'malformed', missing: [], failed: [], missingEvidence: [], malformed: 1, evidence: `测试阶段记录格式非法：${id}` };
  const failed = PASS_STATUSES.has(String(record.status).trim().toLowerCase()) ? [] : [`${id}:${String(record.status)}`];
  const missingEvidence = hasText(record.evidenceRef) ? [] : [id];
  const ready = failed.length === 0 && missingEvidence.length === 0;
  return { ...aggregate, ready, status: ready ? 'ready' : 'missing', missing: [], failed, missingEvidence, malformed: 0, evidence: ready ? `${id} 阶段已完成且有证据引用` : `测试阶段证据缺失：${[...failed, ...missingEvidence].join('、')}` };
}

export function testConditionReadiness(config = {}) {
  const requirement = config.testConditionRequirements && typeof config.testConditionRequirements === 'object' && !Array.isArray(config.testConditionRequirements)
    ? config.testConditionRequirements
    : null;
  const fields = Array.isArray(requirement?.fields) ? requirement.fields.filter((item) => item && item.required !== false) : [];
  const required = Boolean(requirement && (fields.length || requirement.requireEvidenceRef));
  if (!required) return { required: false, ready: true, status: 'not_configured', missing: [], malformed: 0, requiredFields: [], observedFieldCount: 0, evidence: 'profile 未声明结构化测试条件证据要求' };
  const record = config.testMetadata?.testConditions;
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { required: true, ready: false, status: 'missing', missing: fields.map((item) => item.id), malformed: 0, requiredFields: fields, observedFieldCount: 0, evidence: '缺少结构化 testConditions；自由文本环境字段不能替代测试条件证据' };
  const missing = [];
  for (const field of fields) {
    const value = record[field.id];
    const valid = field.valueType === 'number' ? finiteNumber(value) : hasText(value);
    if (!valid) missing.push(field.id);
  }
  if (requirement.requireEvidenceRef && !hasText(record.evidenceRef)) missing.push('evidenceRef');
  const malformedFields = fields.filter((field) => {
    const value = record[field.id];
    return value !== undefined && value !== null && typeof value === 'object';
  }).map((field) => field.id);
  const malformedEvidence = requirement.requireEvidenceRef && record.evidenceRef !== undefined && record.evidenceRef !== null && typeof record.evidenceRef === 'object' ? ['evidenceRef'] : [];
  const malformed = [...malformedFields, ...malformedEvidence];
  const status = malformed.length ? 'malformed' : missing.length ? 'missing' : 'ready';
  return { required: true, ready: status === 'ready', status, missing, malformed: malformed.length, malformedFields: malformed, requiredFields: fields, observedFieldCount: Object.keys(record).length, evidence: status === 'ready' ? `${fields.length} 项测试条件和证据引用已记录` : status === 'malformed' ? `测试条件记录格式非法：${malformed.join('、')}` : `测试条件证据缺失：${missing.join('、')}` };
}

export function environmentConditionReadiness(config = {}) {
  const requirement = config.environmentConditionRequirements && typeof config.environmentConditionRequirements === 'object' && !Array.isArray(config.environmentConditionRequirements)
    ? config.environmentConditionRequirements
    : null;
  const fields = Array.isArray(requirement?.fields) ? requirement.fields.filter((item) => item && item.required !== false) : [];
  const required = Boolean(requirement && (fields.length || requirement.requireEvidenceRef));
  if (!required) return { required: false, ready: true, status: 'not_configured', missing: [], malformed: 0, requiredFields: [], observedFieldCount: 0, evidence: 'profile 未声明结构化环境条件证据要求' };
  const record = config.testMetadata?.environmentConditions || config.testMetadata?.testConditions;
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { required: true, ready: false, status: 'missing', missing: fields.map((item) => item.id), malformed: 0, requiredFields: fields, observedFieldCount: 0, evidence: '缺少结构化 environmentConditions；自由文本环境字段不能替代环境条件证据' };
  const missing = [];
  const malformedFields = [];
  for (const field of fields) {
    const value = record[field.id];
    const valid = field.valueType === 'number' ? finiteNumber(value) : hasText(value);
    if (!valid) missing.push(field.id);
    if (value !== undefined && value !== null && typeof value === 'object') malformedFields.push(field.id);
  }
  if (requirement.requireEvidenceRef && !hasText(record.evidenceRef)) missing.push('evidenceRef');
  const malformedEvidence = requirement.requireEvidenceRef && record.evidenceRef !== undefined && record.evidenceRef !== null && typeof record.evidenceRef === 'object' ? ['evidenceRef'] : [];
  const malformed = [...malformedFields, ...malformedEvidence];
  const status = malformed.length ? 'malformed' : missing.length ? 'missing' : 'ready';
  return { required: true, ready: status === 'ready', status, missing, malformed: malformed.length, malformedFields: malformed, requiredFields: fields, observedFieldCount: Object.keys(record).length, evidence: status === 'ready' ? `${fields.length} 项环境条件和证据引用已记录` : status === 'malformed' ? `环境条件记录格式非法：${malformed.join('、')}` : `环境条件证据缺失：${missing.join('、')}` };
}

export function measurementMethodReadiness(config = {}) {
  const requirements = Array.isArray(config.measurementMethodRequirements) ? config.measurementMethodRequirements.filter((item) => item && item.required !== false) : [];
  if (!requirements.length) return { required: false, ready: true, status: 'not_configured', missing: [], malformed: 0, requiredMethods: [], observedMethodCount: 0, evidence: 'profile 未声明结构化测量方法记录要求' };
  const records = config.testMetadata?.measurementMethodRecords;
  if (!Array.isArray(records)) return { required: true, ready: false, status: 'missing', missing: requirements.map((item) => item.id), malformed: 0, requiredMethods: requirements, observedMethodCount: 0, evidence: '缺少结构化 measurementMethodRecords；仪器类别不能替代测量方法和证据引用' };
  const missing = [];
  const missingFields = [];
  for (const requirement of requirements) {
    const record = records.find((item) => item && String(item.id || '').trim() === requirement.id);
    if (!record) { missing.push(requirement.id); continue; }
    if (!hasText(record.methodRef)) missing.push(`${requirement.id}.methodRef`);
    if (!hasText(record.evidenceRef)) missing.push(`${requirement.id}.evidenceRef`);
    const requiredFields = Array.isArray(requirement.measurementFields) ? requirement.measurementFields : [];
    if (requiredFields.length) {
      const observedFields = Array.isArray(record.fields) ? record.fields.map((field) => String(field || '').trim()) : [];
      for (const field of requiredFields) if (!observedFields.includes(field)) missingFields.push(`${requirement.id}.${field}`);
    }
  }
  const malformed = records.filter((item) => !item || typeof item !== 'object' || Array.isArray(item) || !hasText(item.id)).length;
  const status = malformed ? 'malformed' : missing.length || missingFields.length ? 'missing' : 'ready';
  return { required: true, ready: status === 'ready', status, missing, missingFields, malformed, requiredMethods: requirements, observedMethodCount: records.length, evidence: status === 'ready' ? `${requirements.length} 类测量方法均有方法引用、证据和测量字段覆盖` : malformed ? `${malformed} 条测量方法记录缺少 id` : `测量方法证据缺失：${[...missing, ...missingFields].join('、')}` };
}

export function efficiencyReadiness(config = {}, rows = [], schema = {}) {
  const requirement = config.efficiencyRequirement && typeof config.efficiencyRequirement === 'object' && !Array.isArray(config.efficiencyRequirement)
    ? config.efficiencyRequirement
    : null;
  if (!requirement || requirement.required === false) return { required: false, ready: true, status: 'not_configured', missing: [], source: null, valuePct: null, formulaRef: null, evidence: 'profile 未要求结构化效率结果' };
  const record = config.testMetadata?.efficiencyRecord;
  const mapped = Boolean(schema.mapping?.efficiency_pct);
  const measuredValues = mapped ? rows.map((row) => row.efficiency_pct).filter((value) => Number.isFinite(value)) : [];
  const measured = measuredValues.length >= 2 ? measuredValues.reduce((sum, value) => sum + value, 0) / measuredValues.length : null;
  const recordValue = record?.valuePct;
  const hasRecordValue = finiteNumber(recordValue);
  const numericRecordValue = hasRecordValue ? Number(recordValue) : null;
  const formulaRef = String(record?.formulaRef || config.testMetadata?.formulaRefs || '').trim();
  const sourceRef = String(record?.sourceRef || '').trim();
  const formulaMissing = requirement.formulaRefRequired !== false && !formulaRef;
  const sourceMissing = requirement.dataSource === 'measured_or_approved_formula_record' && measured === null && !sourceRef;
  if (measured !== null && !formulaMissing) return { required: true, ready: true, status: 'ready', missing: [], source: 'measured_data', valuePct: measured, formulaRef, evidence: `${measuredValues.length} 条效率测量记录已汇总；公式引用：${formulaRef}` };
  if (hasRecordValue && !formulaMissing && sourceRef) return { required: true, ready: true, status: 'ready', missing: [], source: 'approved_formula_record', valuePct: numericRecordValue, formulaRef, sourceRef, evidence: `采用企业提供的效率结果记录；公式引用：${formulaRef}；结果引用：${sourceRef}` };
  const missing = [];
  if (measured === null && !hasRecordValue) missing.push('efficiency_pct 或 efficiencyRecord.valuePct');
  if (formulaMissing) missing.push('efficiencyRecord.formulaRef 或 formulaRefs');
  if (sourceMissing) missing.push('efficiencyRecord.sourceRef');
  return { required: true, ready: false, status: 'missing', missing, source: null, valuePct: null, formulaRef: formulaRef || null, evidence: `效率结果未就绪：${missing.join('、')}；系统不会猜测效率公式` };
}

export function phaseResultReadiness(config = {}, phaseMetrics = { phases: {} }) {
  const requirements = Array.isArray(config.phaseResultRequirements) ? config.phaseResultRequirements.filter((item) => item && item.required !== false) : [];
  if (!requirements.length) return { required: false, ready: true, status: 'not_configured', missing: [], failed: [], missingEvidence: [], missingResultFields: [], malformed: 0, requiredResults: [], observedResultCount: 0, evidence: 'profile 未声明结构化阶段结果证据要求' };
  const records = config.testMetadata?.phaseResults;
  if (!Array.isArray(records)) return { required: true, ready: false, status: 'missing', missing: requirements.map((item) => item.phase), failed: [], missingEvidence: [], missingResultFields: [], malformed: 0, requiredResults: requirements, observedResultCount: 0, evidence: '缺少结构化 phaseResults；原始数据 KPI 不能替代方法结果证据引用' };
  const missing = [];
  const failed = [];
  const missingEvidence = [];
  const missingResultFields = [];
  for (const requirement of requirements) {
    const phaseId = String(requirement.phase || requirement.id || '').trim();
    const record = records.find((item) => item && String(item.phase || item.id || '').trim() === phaseId);
    if (!record) { missing.push(phaseId); continue; }
    if (!PASS_STATUSES.has(String(record.status || '').trim().toLowerCase())) failed.push(`${phaseId}:${String(record.status || '未填写')}`);
    if (requirement.evidenceRefRequired !== false && !hasText(record.evidenceRef)) missingEvidence.push(phaseId);
    if (requirement.resultRefRequired === true && !hasText(record.resultRef)) missingResultFields.push(`${phaseId}.resultRef`);
    const phase = phaseMetrics?.phases?.[phaseId] || {};
    for (const field of requirement.resultFields || []) if (!Number.isFinite(Number(phase[field]))) missingResultFields.push(`${phaseId}.${field}`);
  }
  const malformed = records.filter((item) => !item || typeof item !== 'object' || Array.isArray(item) || !hasText(item.phase || item.id) || !hasText(item.status)).length;
  const status = malformed ? 'malformed' : missing.length || failed.length || missingEvidence.length || missingResultFields.length ? 'missing' : 'ready';
  return {
    required: true,
    ready: status === 'ready',
    status,
    missing,
    failed,
    missingEvidence,
    missingResultFields,
    malformed,
    requiredResults: requirements,
    observedResultCount: records.length,
    evidence: status === 'ready' ? `${requirements.length} 个方法阶段结果均已计算并有证据引用` : malformed ? `${malformed} 条阶段结果记录缺少 phase/status` : `阶段结果证据缺失：${[...missing, ...failed, ...missingEvidence, ...missingResultFields].join('、')}`
  };
}
