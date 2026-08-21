export const DEVICE_PROFILES = Object.freeze([
  {
    id: 'electrolyzer-demo',
    name: '电解槽 · 演示模板',
    source: '演示模板（非企业标准）',
    description: '用于演示电解槽测试日志的阈值组合，正式使用前必须替换。',
    approvalStatus: 'example_unapproved',
    applicationScope: '水电解制氢设备演示数据',
    intendedUse: '仅用于演示分析链路，不作安全或性能符合性判定',
    methodId: 'demo-rule-set',
    revision: 'demo-v1',
    standardRefs: [],
    requiredMetadata: ['testPurpose', 'testPlanRef', 'acquisitionPlan', 'preCheckRecord', 'instrumentIds', 'calibrationRefs', 'environment', 'operator', 'formulaRefs', 'uncertaintyPolicy', 'rawDataRef', 'signoff'],
    requiredMeasurements: [],
    requiredPhases: [],
    acceptanceCriteria: {},
    thresholds: { maxTemperatureC: 80, maxPressureBar: 30, maxLeakPpm: 10, maxVoltageStdV: 0.12, maxPressureDriftBarPerMin: 1.2 }
  },
  {
    id: 'fuel-cell-demo',
    name: '燃料电池 · 演示模板',
    source: '演示模板（非企业标准）',
    description: '用于演示燃料电池测试日志的另一套阈值组合，正式使用前必须替换。',
    approvalStatus: 'example_unapproved',
    applicationScope: '固定式燃料电池演示数据',
    intendedUse: '仅用于演示分析链路，不作安全或性能符合性判定',
    methodId: 'demo-rule-set',
    revision: 'demo-v1',
    standardRefs: [],
    requiredMetadata: ['testPurpose', 'testPlanRef', 'acquisitionPlan', 'preCheckRecord', 'instrumentIds', 'calibrationRefs', 'environment', 'operator', 'formulaRefs', 'uncertaintyPolicy', 'rawDataRef', 'signoff'],
    requiredMeasurements: [],
    requiredPhases: [],
    acceptanceCriteria: {},
    thresholds: { maxTemperatureC: 70, maxPressureBar: 25, maxLeakPpm: 5, maxVoltageStdV: 0.08, maxPressureDriftBarPerMin: 0.8 }
  }
]);

export const CUSTOM_PROFILE_ID = 'custom';

const THRESHOLD_FIELDS = ['maxTemperatureC', 'maxPressureBar', 'maxLeakPpm', 'maxVoltageStdV', 'maxPressureDriftBarPerMin'];
const FIELD_MAPPING_FIELDS = ['timestamp_s', 'phase', 'current_a', 'voltage_v', 'temperature_c', 'pressure_bar', 'flow_slpm', 'leak_ppm'];
const PROFILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/;
const APPROVAL_STATUSES = ['approved', 'pending', 'example_unapproved'];
const metadataFields = ['testPurpose', 'testPlanRef', 'acquisitionPlan', 'preCheckRecord', 'instrumentIds', 'calibrationRefs', 'environment', 'operator', 'formulaRefs', 'uncertaintyPolicy', 'rawDataRef', 'signoff'];
const measurementFields = ['flow_slpm', 'hydrogen_purity_pct', 'energy_derived'];

export function validateProfilePackage(payload) {
  const errors = [];
  if (!payload || payload.schemaVersion !== 'h2-testlens.profile.v1') errors.push('schemaVersion 必须为 h2-testlens.profile.v1');
  if (!Array.isArray(payload?.profiles) || !payload.profiles.length) errors.push('profiles 必须是非空数组');
  if (payload?.organization !== undefined && (typeof payload.organization !== 'string' || !payload.organization.trim() || payload.organization.length > 120)) errors.push('organization 必须是 1-120 字符字符串');
  const ids = new Set();
  for (const profile of payload?.profiles ?? []) {
    if (!profile.id || !profile.name) errors.push('每个 profile 必须包含 id 和 name');
    else if (!PROFILE_ID_PATTERN.test(profile.id)) errors.push(`profile id 非法：${profile.id}`);
    if (ids.has(profile.id)) errors.push(`profile id 重复：${profile.id}`);
    ids.add(profile.id);
    if (profile.approvalStatus !== undefined && !APPROVAL_STATUSES.includes(profile.approvalStatus)) errors.push(`${profile.id || '未知'} approvalStatus 非法`);
    for (const field of ['applicationScope', 'intendedUse', 'methodId', 'revision']) if (profile[field] !== undefined && (typeof profile[field] !== 'string' || !profile[field].trim() || profile[field].length > 240)) errors.push(`${profile.id || '未知'} ${field} 必须是 1-240 字符字符串`);
    if (profile.standardRefs !== undefined && !Array.isArray(profile.standardRefs)) errors.push(`${profile.id || '未知'} standardRefs 必须是数组`);
    for (const reference of profile.standardRefs ?? []) if (!reference.id || !reference.title || !reference.uri) errors.push(`${profile.id || '未知'} standardRefs 每项需有 id/title/uri`);
    if (profile.requiredMetadata !== undefined && (!Array.isArray(profile.requiredMetadata) || profile.requiredMetadata.some((field) => !metadataFields.includes(field)))) errors.push(`${profile.id || '未知'} requiredMetadata 含未知字段`);
    if (profile.requiredMeasurements !== undefined && (!Array.isArray(profile.requiredMeasurements) || profile.requiredMeasurements.some((field) => !measurementFields.includes(field)))) errors.push(`${profile.id || '未知'} requiredMeasurements 含未知字段`);
    if (profile.requiredPhases !== undefined && (!Array.isArray(profile.requiredPhases) || profile.requiredPhases.some((phase) => typeof phase !== 'string' || !phase.trim() || phase.length > 80))) errors.push(`${profile.id || '未知'} requiredPhases 必须是非空字符串数组`);
    if (profile.acceptanceCriteria !== undefined && (typeof profile.acceptanceCriteria !== 'object' || Array.isArray(profile.acceptanceCriteria))) errors.push(`${profile.id || '未知'} acceptanceCriteria 必须是对象`);
    for (const field of ['minHydrogenPurityPct', 'maxSpecificEnergyKWhPerNm3']) if (profile.acceptanceCriteria?.[field] !== undefined && (!Number.isFinite(Number(profile.acceptanceCriteria[field])) || Number(profile.acceptanceCriteria[field]) <= 0)) errors.push(`${profile.id || '未知'} acceptanceCriteria.${field} 必须为正数`);
    for (const field of THRESHOLD_FIELDS) {
      const value = Number(profile.thresholds?.[field]);
      if (!Number.isFinite(value)) errors.push(`${profile.id || '未知'} 缺少数值阈值 ${field}`);
      else if (['maxVoltageStdV', 'maxPressureDriftBarPerMin'].includes(field) ? value < 0 : value <= 0) errors.push(`${profile.id || '未知'} 阈值必须为非负/正数：${field}`);
    }
  }
  if (payload?.fieldMapping !== undefined && (typeof payload.fieldMapping !== 'object' || Array.isArray(payload.fieldMapping))) errors.push('fieldMapping 必须是对象');
  for (const [field, source] of Object.entries(payload?.fieldMapping ?? {})) {
    if (!FIELD_MAPPING_FIELDS.includes(field)) errors.push(`fieldMapping 含未知字段：${field}`);
    if (typeof source !== 'string' || !source.trim() || source.length > 160) errors.push(`fieldMapping.${field} 必须是 1-160 字符字符串`);
  }
  return { ok: errors.length === 0, errors };
}

export function profilesFromPackage(payload) {
  const validation = validateProfilePackage(payload);
  if (!validation.ok) return validation;
  return {
    ok: true,
    errors: [],
    organization: payload.organization || '未命名企业配置',
    profiles: payload.profiles.map((profile) => ({
      ...profile,
      approvalStatus: profile.approvalStatus || 'pending',
      applicationScope: profile.applicationScope || '未指定应用范围',
      intendedUse: profile.intendedUse || '未指定用途',
      methodId: profile.methodId || '未指定测试方法',
      revision: profile.revision || '未指定版本',
      standardRefs: profile.standardRefs || [],
      requiredMetadata: profile.requiredMetadata || metadataFields,
      requiredMeasurements: profile.requiredMeasurements || [],
      requiredPhases: profile.requiredPhases || [],
      acceptanceCriteria: profile.acceptanceCriteria || {},
      source: profile.source || `${payload.organization || '企业'} 当前会话配置`,
      description: profile.description || '由当前会话导入的配置，正式使用前需确认审批状态。',
      thresholds: Object.fromEntries(THRESHOLD_FIELDS.map((field) => [field, Number(profile.thresholds[field])]))
    })),
    fieldMapping: payload.fieldMapping || {}
  };
}

export function getProfile(profileId, profiles = DEVICE_PROFILES) {
  return profiles.find((profile) => profile.id === profileId) ?? profiles[0] ?? DEVICE_PROFILES[0];
}
