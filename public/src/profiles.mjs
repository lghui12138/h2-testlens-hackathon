import { validateProfileEvidenceBindings } from './standard-evidence.mjs';
import { validateTrustedApprovalBinding } from './approval-ledger.mjs';

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
    methodSource: null,
    requiredMetadata: ['testPurpose', 'testPlanRef', 'acquisitionPlan', 'preCheckRecord', 'instrumentIds', 'instrumentAccuracy', 'calibrationRefs', 'environment', 'operator', 'operatorQualification', 'formulaRefs', 'uncertaintyPolicy', 'rawDataRef', 'signoff'],
    requiredMeasurements: [],
    acquisitionRequirements: null,
    preCheckRequirements: [],
    requiredPhases: [],
    requiredPhaseMetrics: {},
    phaseAcceptanceRules: [],
    phaseAliases: {},
    requiredTestStages: [],
    workflowSequence: [],
    testSystemRequirements: [],
    testConditionRequirements: null,
    environmentConditionRequirements: null,
    phaseResultRequirements: [],
    measurementMethodRequirements: [],
    dynamicPowerAnalysis: { enabled: false },
    efficiencyRequirement: null,
    scopeRules: null,
    instrumentRequirements: [],
    reportRequirements: [],
    acceptanceRules: [],
    acceptanceCriteria: {},
    evaluationMode: 'risk_screening',
    supportedDatasetTypes: ['generic'],
    uncertaintyModelRequired: false,
    uncertaintyModel: null,
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
    methodSource: null,
    requiredMetadata: ['testPurpose', 'testPlanRef', 'acquisitionPlan', 'preCheckRecord', 'instrumentIds', 'instrumentAccuracy', 'calibrationRefs', 'environment', 'operator', 'operatorQualification', 'formulaRefs', 'uncertaintyPolicy', 'rawDataRef', 'signoff'],
    requiredMeasurements: [],
    acquisitionRequirements: null,
    preCheckRequirements: [],
    requiredPhases: [],
    requiredPhaseMetrics: {},
    phaseAcceptanceRules: [],
    phaseAliases: {},
    requiredTestStages: [],
    workflowSequence: [],
    testSystemRequirements: [],
    testConditionRequirements: null,
    environmentConditionRequirements: null,
    phaseResultRequirements: [],
    measurementMethodRequirements: [],
    dynamicPowerAnalysis: { enabled: false },
    efficiencyRequirement: null,
    scopeRules: null,
    instrumentRequirements: [],
    reportRequirements: [],
    acceptanceRules: [],
    acceptanceCriteria: {},
    evaluationMode: 'risk_screening',
    supportedDatasetTypes: ['generic'],
    uncertaintyModelRequired: false,
    uncertaintyModel: null,
    thresholds: { maxTemperatureC: 70, maxPressureBar: 25, maxLeakPpm: 5, maxVoltageStdV: 0.08, maxPressureDriftBarPerMin: 0.8 }
  },
  {
    id: 'electrolyzer-power-fluctuation-demo',
    name: '电解水制氢系统 · 功率波动流程模板',
    source: '官方公开技术内容映射（非企业审批）',
    description: '将 GB/T 46104-2025 公开技术内容映射为测试流程覆盖清单；不含企业限值，不作符合性判定。',
    approvalStatus: 'example_unapproved',
    applicationScope: '碱性或 PEM 电解水制氢系统功率波动适应性评价与测试',
    intendedUse: '演示测试计划、数据采集、试验前检查、仪器证据、工况覆盖和报告字段门控',
    methodId: 'GB/T 46104-2025',
    revision: '2025',
    standardRefs: [
      { id: 'GB/T 46104-2025', title: '电解水制氢系统功率波动适应性测试方法', uri: 'https://std.samr.gov.cn/gb/search/gbDetailed?id=3DBA213287120D16E06397BE0A0A8119', status: 'current', evidenceSourceId: 'gbt_46104_2025', evidenceIds: ['ev_gbt46104_report'] },
      { id: 'GB/T 29729-2022', title: '氢系统安全的基本要求', uri: 'https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=CD2CACD6BCF1403D48EF0508798A01A9', status: 'current', evidenceSourceId: 'gbt_29729_2022', evidenceIds: ['ev_gbt29729_current'] },
      { id: 'ISO 22734-1:2025', title: 'Hydrogen generators using water electrolysis — Part 1: Safety', uri: 'https://www.iso.org/standard/82766.html?browse=ics', status: 'published', evidenceSourceId: 'iso_22734_1_2025', evidenceIds: ['ev_iso22734_1_scope'] }
    ],
    methodExecutionStatus: 'ENTERPRISE_PROFILE_REQUIRED',
    status: 'current',
    publicationDate: '2025-08-29',
    effectiveDate: '2025-12-01',
    scopeEvidence: '官方国家标准项目页面公开范围与主要技术内容；不是标准全文。',
    workflowEvidence: '公开项目技术内容列出测试计划、采集计划、前检查、仪器/测量、冷/热启动、稳态、动态、停机和报告字段。',
    methodSource: { sourceId: 'gbt_46104_scope_project', locator: '范围和主要技术内容', evidenceType: 'official_project_scope', evidenceIds: ['ev_gbt46104_scope'] },
    requiredMetadata: ['testPurpose', 'testPlanRef', 'acquisitionPlan', 'preCheckRecord', 'instrumentIds', 'instrumentAccuracy', 'calibrationRefs', 'environment', 'operator', 'operatorQualification', 'formulaRefs', 'uncertaintyPolicy', 'rawDataRef', 'signoff'],
    requiredMeasurements: [
      'flow_slpm',
      'hydrogen_purity_pct',
      'gas_temperature_c',
      'gas_pressure_bar',
      'ambient_temperature_c',
      'ambient_humidity_pct',
      'ambient_pressure_kpa',
      'power_w'
    ],
    dynamicPowerAnalysis: {
      enabled: true,
      commandField: 'power_setpoint_w',
      actualField: 'power_w',
      unit: 'W',
      minimumStep: 10,
      responseBandPct: 5,
      minimumResponseBand: 1,
      settleWindowS: 5,
      maxGapS: 5
    },
    acquisitionRequirements: {
      requireSamplingFrequency: true,
      requireSynchronization: true,
      requireEvidenceRef: true,
      requiredChannels: [
        { field: 'timestamp_s', unit: 's' },
        { field: 'current_a', unit: 'A' },
        { field: 'voltage_v', unit: 'V' },
        { field: 'power_w', unit: 'W' },
        { field: 'flow_slpm', unit: 'SLPM' },
        { field: 'hydrogen_purity_pct', unit: '%' },
        { field: 'gas_temperature_c', unit: '°C' },
        { field: 'gas_pressure_bar', unit: 'bar' },
        { field: 'ambient_temperature_c', unit: '°C' },
        { field: 'ambient_humidity_pct', unit: '%' },
        { field: 'ambient_pressure_kpa', unit: 'kPa' }
      ]
    },
    preCheckRequirements: [
      { id: 'device_identity', label: '设备身份与额定范围', required: true },
      { id: 'test_bench', label: '测试台与气液路状态', required: true },
      { id: 'instruments', label: '仪器与采集系统状态', required: true },
      { id: 'safety', label: '安全联锁与报警状态', required: true }
    ],
    requiredPhases: ['cold_start', 'hot_start', 'steady', 'dynamic', 'shutdown'],
    requiredPhaseMetrics: {
      cold_start: ['durationS', 'energyConsumedWh'],
      hot_start: ['durationS', 'energyConsumedWh'],
      steady: ['hydrogenVolumeNl', 'energyConsumedWh', 'specificEnergyKWhPerNm3'],
      dynamic: ['powerRangeW', 'maxRampUpWPerS', 'maxRampDownWPerS'],
      shutdown: ['durationS', 'energyConsumedWh']
    },
    phaseAcceptanceRules: [],
    phaseAliases: {
      cold_start: ['cold_start', 'cold-start', 'cold start', '冷启动', '冷态启动'],
      hot_start: ['hot_start', 'hot-start', 'hot start', '热启动', '热态启动'],
      steady: ['steady', 'stabilized', 'stable', '稳态', '稳定', '恒定'],
      dynamic: ['dynamic', 'ramp', '变功率', '动态', '升载', '降载'],
      shutdown: ['shutdown', 'stop', '停机', '关机']
    },
    requiredTestStages: [
      { id: 'test_plan', label: '测试计划与工况序列', required: true },
      { id: 'data_acquisition', label: '数据采集计划', required: true },
      { id: 'pre_check', label: '试验前检查', required: true },
      { id: 'test_execution', label: '测试执行与工况覆盖', required: true },
      { id: 'test_report', label: '测试报告与结论', required: true }
    ],
    workflowSequence: [
      { id: 'test_system', label: '测试系统组成', gate: 'testSystem' },
      { id: 'test_conditions', label: '测试条件与环境', gate: 'testConditions' },
      { id: 'test_plan', label: '试验计划与工况序列', gate: 'testStages' },
      { id: 'data_acquisition', label: '数据采集计划', gate: 'acquisition' },
      { id: 'pre_check', label: '试验前检查', gate: 'preCheck' },
      { id: 'measurement_methods', label: '测量仪器与测量方法', gate: 'measurementMethods' },
      { id: 'cold_start', label: '冷启动试验', gate: 'phaseResults', phase: 'cold_start' },
      { id: 'hot_start', label: '热启动试验', gate: 'phaseResults', phase: 'hot_start' },
      { id: 'steady', label: '典型工况稳态性能试验', gate: 'phaseResults', phase: 'steady' },
      { id: 'dynamic', label: '变功率动态性能试验', gate: 'phaseResults', phase: 'dynamic' },
      { id: 'shutdown', label: '停机试验', gate: 'phaseResults', phase: 'shutdown' },
      { id: 'test_report', label: '试验报告与结论', gate: 'report' }
    ],
    testSystemRequirements: [
      { id: 'power_supply', label: '整流电源/功率输入系统', required: true },
      { id: 'electrolyzer', label: '电解槽', required: true },
      { id: 'gas_liquid_separation', label: '气液分离系统', required: true },
      { id: 'purification', label: '气体纯化系统（如适用）', required: false },
      { id: 'circulation', label: '循环系统', required: true },
      { id: 'thermal_management', label: '热管理系统', required: true },
      { id: 'control_system', label: '控制系统', required: true }
    ],
    testConditionRequirements: {
      requireEvidenceRef: true,
      fields: [
        { id: 'testSite', label: '测试场所', valueType: 'text' },
        { id: 'systemConfigurationRef', label: '系统组成/配置确认', valueType: 'reference' },
        { id: 'abnormalDispositionRef', label: '测试中止或异常处置引用', valueType: 'reference' }
      ]
    },
    environmentConditionRequirements: {
      requireEvidenceRef: true,
      fields: [
        { id: 'ambientTemperatureC', label: '环境温度', valueType: 'number' },
        { id: 'ambientHumidityPct', label: '环境湿度', valueType: 'number' },
        { id: 'ambientPressureKpa', label: '环境气压', valueType: 'number' }
      ]
    },
    measurementMethodRequirements: [
      { id: 'electrical_input', label: '电输入测量方法', measurementFields: ['current_a', 'voltage_v', 'power_w'], required: true },
      { id: 'gas_output', label: '气体输出测量方法', measurementFields: ['flow_slpm', 'hydrogen_purity_pct', 'gas_temperature_c', 'gas_pressure_bar'], required: true },
      { id: 'environment', label: '环境条件测量方法', measurementFields: ['ambient_temperature_c', 'ambient_humidity_pct', 'ambient_pressure_kpa'], required: true },
      { id: 'high_frequency_acquisition', label: '高频采集方法', measurementFields: ['timestamp_s', 'current_a', 'voltage_v', 'power_w'], required: true }
    ],
    efficiencyRequirement: {
      required: true,
      metric: 'efficiency_pct',
      outputUnit: '%',
      formulaRefRequired: true,
      dataSource: 'measured_or_approved_formula_record'
    },
    phaseResultRequirements: [
      { phase: 'cold_start', label: '冷启动结果', resultFields: ['durationS', 'energyConsumedWh'], evidenceRefRequired: true },
      { phase: 'hot_start', label: '热启动结果', resultFields: ['durationS', 'energyConsumedWh'], evidenceRefRequired: true },
      { phase: 'steady', label: '稳态结果', resultFields: ['hydrogenVolumeNl', 'energyConsumedWh', 'specificEnergyKWhPerNm3'], evidenceRefRequired: true },
      { phase: 'dynamic', label: '变功率动态结果', resultFields: ['powerRangeW', 'maxRampUpWPerS', 'maxRampDownWPerS'], evidenceRefRequired: true },
      { phase: 'shutdown', label: '停机结果', resultFields: ['durationS', 'energyConsumedWh'], evidenceRefRequired: true }
    ],
    scopeRules: { requiresDeviceFamily: true },
    instrumentRequirements: ['electrical_input', 'high_frequency_acquisition', 'gas_output', 'environment'],
    reportRequirements: ['testPurpose', 'instrumentIds', 'operator', 'operatorQualification', 'formulaRefs', 'charts', 'conclusion'],
    acceptanceRules: [],
    acceptanceCriteria: {},
    evaluationMode: 'risk_screening',
    supportedDatasetTypes: ['generic'],
    uncertaintyModelRequired: false,
    uncertaintyModel: null,
    thresholds: { maxTemperatureC: 80, maxPressureBar: 30, maxLeakPpm: 10, maxVoltageStdV: 0.12, maxPressureDriftBarPerMin: 1.2 },
    standardClauseRefs: {
      'GB/T 46104-2025': ['测试计划', '数据采集计划', '试验前检查', '冷启动', '热启动', '稳态', '变功率动态', '停机', '测试报告'],
      'GB/T 29729-2022': ['氢系统安全基本要求'],
      'ISO 22734-1:2025': ['安全要求']
    }
  },
  {
    id: 'electrolyzer-pem-performance-demo',
    name: 'PEM 电解槽 · GB/T 45541-2025 性能测试模板',
    source: '官方公开解读映射（非企业审批）',
    description: '将 GB/T 45541-2025 公开解读中的基本检查、基础测试、性能测试和测试报告四段流程映射为证据清单；不含标准全文限值。',
    approvalStatus: 'example_unapproved',
    applicationScope: 'PEM 电解槽性能测试；公开范围外设备需参照适用方法',
    intendedUse: '演示 PEM 性能测试流程证据和报告字段门控，不作符合性判定',
    methodId: 'GB/T 45541-2025',
    revision: '2025',
    standardRefs: [
      { id: 'GB/T 45541-2025', title: 'PEM电解槽性能测试方法', uri: 'https://std.samr.gov.cn/gb/search/gbDetailed?id=31DA5F377BB68F08E06397BE0A0A4CFB', status: 'current', evidenceSourceId: 'gbt_45541_2025', evidenceIds: ['ev_gbt45541_test_method'] },
      { id: 'GB/T 29729-2022', title: '氢系统安全的基本要求', uri: 'https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=CD2CACD6BCF1403D48EF0508798A01A9', status: 'current', evidenceSourceId: 'gbt_29729_2022', evidenceIds: ['ev_gbt29729_current'] },
      { id: 'ISO 22734-1:2025', title: 'Hydrogen generators using water electrolysis — Part 1: Safety', uri: 'https://www.iso.org/standard/82766.html?browse=ics', status: 'published', evidenceSourceId: 'iso_22734_1_2025', evidenceIds: ['ev_iso22734_1_scope'] }
    ],
    methodExecutionStatus: 'ENTERPRISE_PROFILE_REQUIRED',
    status: 'current',
    publicationDate: '2025-03-28',
    effectiveDate: '2025-07-01',
    scopeEvidence: '官方标准页面与官方解读公开适用范围；具体标准条文、仪器精度和验收计算仍需企业批准资料。',
    workflowEvidence: '官方解读公开描述基本检查、基础测试、性能测试和测试报告四类流程。',
    methodSource: { sourceId: 'gbt_45541_interpretation_2025', locator: '课程简介', evidenceType: 'official_interpretation_paraphrase', evidenceIds: ['ev_gbt45541_interpretation'] },
    requiredMetadata: ['testPurpose', 'testPlanRef', 'acquisitionPlan', 'preCheckRecord', 'instrumentIds', 'instrumentAccuracy', 'calibrationRefs', 'environment', 'operator', 'operatorQualification', 'formulaRefs', 'uncertaintyPolicy', 'rawDataRef', 'signoff'],
    requiredMeasurements: ['flow_slpm', 'hydrogen_purity_pct'],
    acquisitionRequirements: { requireSamplingFrequency: true, requireSynchronization: true, requireEvidenceRef: true, requiredChannels: [
      { field: 'timestamp_s', unit: 's' }, { field: 'current_a', unit: 'A' }, { field: 'voltage_v', unit: 'V' }, { field: 'flow_slpm', unit: 'SLPM' }, { field: 'hydrogen_purity_pct', unit: '%' }
    ] },
    preCheckRequirements: [
      { id: 'device_identity', label: '设备身份与额定范围', required: true },
      { id: 'instruments', label: '仪器与采集系统状态', required: true },
      { id: 'safety', label: '安全前置条件与报警状态', required: true }
    ],
    requiredPhases: [],
    requiredPhaseMetrics: {},
    phaseAcceptanceRules: [],
    phaseAliases: {},
    requiredTestStages: [
      { id: 'basic_check', label: '基本检查', required: true },
      { id: 'basic_test', label: '基础测试', required: true },
      { id: 'performance_test', label: '性能测试', required: true },
      { id: 'test_report', label: '测试报告', required: true }
    ],
    workflowSequence: [
      { id: 'basic_check', label: '基本检查', gate: 'testStages' },
      { id: 'basic_test', label: '基础测试', gate: 'testStages' },
      { id: 'performance_test', label: '性能测试', gate: 'testStages' },
      { id: 'test_report', label: '测试报告与结论', gate: 'report' }
    ],
    testSystemRequirements: [
      { id: 'pem_electrolyzer', label: 'PEM 电解槽及配套测试系统', required: true },
      { id: 'measurement_system', label: '电输入、产氢量和纯度测量系统', required: true }
    ],
    testConditionRequirements: { requireEvidenceRef: true, fields: [
      { id: 'testSite', label: '测试场所', valueType: 'text' },
      { id: 'systemConfigurationRef', label: '系统组成/配置确认', valueType: 'reference' },
      { id: 'abnormalDispositionRef', label: '异常/应急处置引用', valueType: 'reference' }
    ] },
    environmentConditionRequirements: { requireEvidenceRef: true, fields: [
      { id: 'ambientTemperatureC', label: '环境温度', valueType: 'number' },
      { id: 'ambientHumidityPct', label: '环境湿度', valueType: 'number' },
      { id: 'ambientPressureKpa', label: '环境气压', valueType: 'number' }
    ] },
    measurementMethodRequirements: [
      { id: 'electrical_input', label: '电输入测量方法', required: true },
      { id: 'gas_output', label: '气体输出测量方法', required: true },
      { id: 'environment', label: '环境条件测量方法', required: true }
    ],
    efficiencyRequirement: null,
    phaseResultRequirements: [],
    scopeRules: { requiresDeviceFamily: true, requiresRatedHydrogenPressureMpa: true, maxRatedHydrogenPressureMpa: 10, requiresRatedHydrogenProductionM3h: true, minRatedHydrogenProductionM3h: 1, maxRatedHydrogenProductionM3h: 500, outOfScopeDisposition: 'REFER_TO_STANDARD' },
    instrumentRequirements: ['electrical_input', 'gas_output', 'environment'],
    reportRequirements: ['testPurpose', 'instrumentIds', 'operator', 'operatorQualification', 'formulaRefs', 'charts', 'conclusion'],
    acceptanceRules: [],
    acceptanceCriteria: {},
    evaluationMode: 'risk_screening',
    supportedDatasetTypes: ['generic'],
    uncertaintyModelRequired: false,
    uncertaintyModel: null,
    thresholds: { maxTemperatureC: 80, maxPressureBar: 30, maxLeakPpm: 10, maxVoltageStdV: 0.12, maxPressureDriftBarPerMin: 1.2 },
    standardClauseRefs: {
      'GB/T 45541-2025': ['基本检查', '基础测试', '性能测试', '测试报告'],
      'GB/T 29729-2022': ['氢系统安全基本要求'],
      'ISO 22734-1:2025': ['安全要求']
    }
  },
  {
    id: 't02-vehicle-descriptive',
    name: 'T02 车辆运行数据 · 描述性 profile',
    source: 'T02 企业资料字段审计（未审批）',
    description: '用于 T02 车辆燃电运行信号、绝缘窗口和趋势的描述性统计；不执行企业目标符合性、报警阈值或放行判定。',
    approvalStatus: 'example_unapproved',
    applicationScope: 'T02 vehicle 运行数据',
    intendedUse: '字段覆盖、时间轴、趋势和绝缘窗口描述；需企业批准 profile 才能进入规则筛查或正式结论',
    methodId: 'T02-vehicle-descriptive',
    revision: '2026-08',
    methodExecutionStatus: 'ENTERPRISE_PROFILE_REQUIRED',
    evaluationMode: 'descriptive_only',
    supportedDatasetTypes: ['vehicle'],
    standardRefs: [],
    requiredMetadata: [],
    acceptanceRules: [],
    acceptanceCriteria: {},
    vehicleTrendXAxis: 'runtime_h',
    vehicleTrendModel: 'linear',
    vehicleCurrentToleranceA: 5,
    vehicleMinimumDurationS: 180,
    vehicleUnitEvidenceRequired: true,
    thresholds: null
  },
  {
    id: 't02-stack-descriptive',
    name: 'T02 电堆时序数据 · 描述性 profile',
    source: 'T02 企业资料字段审计（未审批）',
    description: '用于 T02 电堆时序、单片通道、时间轴和候选稳定区间的描述性统计；不执行目标工况符合性或正式极化性能判定。',
    approvalStatus: 'example_unapproved',
    applicationScope: 'T02 stack 电堆时序数据',
    intendedUse: '字段覆盖、单位、采样时间质量、单片一致性和候选区间描述；需企业批准参数工作簿才可进入目标工况路径',
    methodId: 'T02-stack-descriptive',
    revision: '2026-08',
    methodExecutionStatus: 'ENTERPRISE_PROFILE_REQUIRED',
    evaluationMode: 'descriptive_only',
    supportedDatasetTypes: ['stack'],
    standardRefs: [],
    requiredMetadata: [],
    acceptanceRules: [],
    acceptanceCriteria: {},
    thresholds: null
  },
  {
    id: 't02-durability-descriptive',
    name: 'T02 台架耐久数据 · 描述性 profile',
    source: 'T02 企业资料字段审计（未审批）',
    description: '用于 T02 耐久功率点、原始报告结果和跨报告可比性筛查；不执行企业预警阈值或放行判定。',
    approvalStatus: 'example_unapproved',
    applicationScope: 'T02 durability 台架耐久数据',
    intendedUse: '功率点统计、原始结果保留和跨报告元数据可比性描述；需企业批准规则和方法版本才可进入风险筛查',
    methodId: 'T02-durability-descriptive',
    revision: '2026-08',
    methodExecutionStatus: 'ENTERPRISE_PROFILE_REQUIRED',
    evaluationMode: 'descriptive_only',
    supportedDatasetTypes: ['durability'],
    standardRefs: [],
    requiredMetadata: [],
    acceptanceRules: [],
    acceptanceCriteria: {},
    durabilityRules: {},
    thresholds: null
  },
  {
    id: 'qingchuan-stack',
    name: '青川科技 · 电堆时序测试 profile',
    source: 'T02 企业资料字段审计（未审批）',
    description: '针对青川科技 127 列电堆时序 CSV 的字段映射与描述性统计；基于真实数据集 38,257 行回归验证。不执行企业目标工况符合性或正式放行判定。',
    approvalStatus: 'example_unapproved',
    applicationScope: '青川科技燃料电池电堆稳态/动态时序测试数据',
    intendedUse: '电流平台识别、单片电压统计、温度/压力趋势、候选稳定区间描述；需企业批准参数工作簿才可进入目标工况路径',
    methodId: 'QINGCHUAN-stack-rule-set',
    revision: '2026-08',
    methodExecutionStatus: 'ENTERPRISE_PROFILE_REQUIRED',
    evaluationMode: 'descriptive_only',
    supportedDatasetTypes: ['stack'],
    standardRefs: [
      { id: 'GB/T 45541-2025', title: 'PEM电解槽性能测试方法', uri: 'https://std.samr.gov.cn/gb/search/gbDetailed?id=31DA5F377BB68F08E06397BE0A0A4CFB', status: 'current', evidenceSourceId: 'gbt_45541_2025', evidenceIds: ['ev_gbt45541_test_method'] },
      { id: 'ISO/IEC 17025:2017', title: 'Testing and calibration laboratories', uri: 'https://www.iso.org/standard/66912.html', status: 'published', evidenceSourceId: 'iso_17025_2017', evidenceIds: ['ev_iso17025_scope'] }
    ],
    methodSource: { sourceId: 'qingchuan_field_mapper_2026', locator: 'T02 企业资料字段审计', evidenceType: 'enterprise_field_mapping', evidenceIds: ['ev_qingchuan_field_mapping'] },
    requiredMetadata: ['testPurpose', 'testPlanRef', 'acquisitionPlan', 'preCheckRecord', 'instrumentIds', 'instrumentAccuracy', 'calibrationRefs', 'environment', 'operator', 'operatorQualification', 'formulaRefs', 'uncertaintyPolicy', 'rawDataRef', 'signoff'],
    traceabilityRequirements: {
      required: true,
      requireEvidenceRef: true,
      fields: [
        { id: 'testRunId', label: '测试运行编号', valueType: 'reference' },
        { id: 'deviceId', label: '设备编号', valueType: 'reference' },
        { id: 'testType', label: '测试类型', valueType: 'text' },
        { id: 'testDate', label: '测试日期', valueType: 'date' },
        { id: 'cellCount', label: '片数', valueType: 'number' }
      ]
    },
    requiredMeasurements: ['current_a', 'voltage_v', 'temperature_c', 'pressure_bar', 'flow_slpm'],
    acquisitionRequirements: {
      requireSamplingFrequency: true,
      requireSynchronization: true,
      requireEvidenceRef: true,
      requiredChannels: [
        { field: 'timestamp_s', unit: 's' },
        { field: 'current_a', unit: 'A' },
        { field: 'voltage_v', unit: 'V' },
        { field: 'temperature_c', unit: '°C' },
        { field: 'pressure_bar', unit: 'kPa' },
        { field: 'flow_slpm', unit: 'SLPM' }
      ]
    },
    preCheckRequirements: [
      { id: 'device_identity', label: '设备身份与电堆编号', required: true },
      { id: 'test_bench', label: '测试台与气液路状态', required: true },
      { id: 'instruments', label: '仪器与采集系统状态', required: true },
      { id: 'safety', label: '安全联锁与报警状态', required: true }
    ],
    requiredPhases: ['steady', 'dynamic'],
    requiredPhaseMetrics: {
      steady: ['durationS', 'avgCellVoltageV', 'voltageVariance'],
      dynamic: ['durationS', 'currentRangeA']
    },
    acceptanceRules: [],
    acceptanceCriteria: {},
    scopeRules: {
      maxCellCount: 40,
      maxTemperatureC: 85,
      maxPressureBar: 50,
      description: '青川科技电堆时序测试覆盖；具体限值以企业批准资料为准。'
    },
    thresholds: { maxTemperatureC: 85, maxPressureBar: 50, maxLeakPpm: 10, maxVoltageStdV: 0.12, maxPressureDriftBarPerMin: 1.2 },
    fieldMapping: {
      timestamp_s: '测试时间',
      current_a: '实际电流（A）',
      voltage_v: '实际电压（V）',
      temperature_c: '阳极入堆温度（℃）',
      pressure_bar: '阳极入堆压力（kPa）',
      flow_slpm: '阳极流量（SLPM）',
      leak_ppm: '柜内氢气浓度（ppm）',
      power_kw: '功率（kW)',
      cell_count: '片数',
      avg_cell_voltage_v: '平均电压（V）',
      min_cell_voltage_v: '最小电压（V）',
      max_cell_voltage_v: '最大电压（V）',
      current_density_mAcm2: '电流密度（mA/cm2）',
      h2_dewpoint_c: '氢气入口露点温度（℃）',
      air_dewpoint_c: '空气入口露点温度（℃）',
      coolant_dt: '循环水进出口温差（℃）',
      h2_stoich: '氢气计量比',
      air_stoich: '空气计量比',
      internal_resistance: '内阻（mΩ）',
      anode_out_temp_c: '阳极出堆温度（℃）',
      cathode_in_temp_c: '阴极入堆温度（℃）',
      cathode_out_temp_c: '阴极出堆温度（℃）',
      coolant_in_temp_c: '循环水入堆温度（℃）',
      coolant_out_temp_c: '循环水出堆温度（℃）',
      anode_out_pressure_kpa: '阳极出堆压力（kPa）',
      cathode_in_pressure_kpa: '阴极入堆压力（kPa）',
      cathode_out_pressure_kpa: '阴极出堆压力（kPa）',
      coolant_in_pressure_kpa: '循环水入堆压力（kPa）',
      coolant_out_pressure_kpa: '循环水出堆压力（kPa）',
      h2_humidifier_water_temp_c: '阳极增湿罐水温度（℃）',
      air_humidifier_water_temp_c: '阴极增湿罐水温度（℃）',
      coolant_flow_lpm: '循环水流量（L/min）',
      coolant_conductivity_us_cm: '循环水电导率（μS/cm）',
    },
    dataQualityRequirements: {
      maxIntervalS: 1
    },
    standardClauseRefs: {
      'GB/T 45541-2025': ['基本检查', '基础测试', '性能测试', '测试报告'],
      'ISO/IEC 17025:2017': ['实验室能力要求', '公正性', '保密性']
    }
  },
  {
    id: 'qingzhihuli-vehicle',
    name: '氢质氢离 · 车辆运行数据 profile',
    source: 'T02 企业资料字段审计（未审批）',
    description: '针对氢质氢离 FC_* 车辆运行信号的字段映射与描述性统计；基于真实数据集 212 车 20,294 行、345 车 12,945 行回归验证。不执行企业目标工况符合性或正式放行判定。',
    approvalStatus: 'example_unapproved',
    applicationScope: '氢质氢离燃料电池车辆运行信号与绝缘时序测试数据',
    intendedUse: 'FC_* 字段映射、绝缘阻值趋势、电流平台识别、候选稳定区间描述；需企业批准参数工作簿才可进入目标工况路径',
    methodId: 'QINGZHIHULI-vehicle-rule-set',
    revision: '2026-08',
    methodExecutionStatus: 'ENTERPRISE_PROFILE_REQUIRED',
    evaluationMode: 'descriptive_only',
    supportedDatasetTypes: ['vehicle'],
    standardRefs: [
      { id: 'GB/T 46104-2025', title: '电解水制氢系统功率波动适应性测试方法', uri: 'https://std.samr.gov.cn/gb/search/gbDetailed?id=3DBA213287120D16E06397BE0A0A8119', status: 'current', evidenceSourceId: 'gbt_46104_2025', evidenceIds: ['ev_gbt46104_report'] },
      { id: 'GB/T 29729-2022', title: '氢系统安全的基本要求', uri: 'https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=CD2CACD6BCF1403D48EF0508798A01A9', status: 'current', evidenceSourceId: 'gbt_29729_2022', evidenceIds: ['ev_gbt29729_current'] }
    ],
    methodSource: { sourceId: 'qingzhihuli_field_mapper_2026', locator: 'T02 企业资料字段审计', evidenceType: 'enterprise_field_mapping', evidenceIds: ['ev_qingzhihuli_field_mapping'] },
    requiredMetadata: ['testPurpose', 'testPlanRef', 'acquisitionPlan', 'preCheckRecord', 'instrumentIds', 'instrumentAccuracy', 'calibrationRefs', 'environment', 'operator', 'operatorQualification', 'formulaRefs', 'uncertaintyPolicy', 'rawDataRef', 'signoff'],
    traceabilityRequirements: {
      required: true,
      requireEvidenceRef: true,
      fields: [
        { id: 'testRunId', label: '测试运行编号', valueType: 'reference' },
        { id: 'vehicleId', label: '车辆编号', valueType: 'reference' },
        { id: 'testType', label: '测试类型', valueType: 'text' },
        { id: 'testDate', label: '测试日期', valueType: 'date' }
      ]
    },
    requiredMeasurements: ['current_a', 'voltage_v', 'net_power_kw'],
    acquisitionRequirements: {
      requireSamplingFrequency: true,
      requireSynchronization: true,
      requireEvidenceRef: true,
      requiredChannels: [
        { field: 'timestamp_s', unit: 's' },
        { field: 'current_a', unit: 'A' },
        { field: 'voltage_v', unit: 'V' },
        { field: 'net_power_kw', unit: 'kW' }
      ]
    },
    preCheckRequirements: [
      { id: 'vehicle_identity', label: '车辆身份与燃料电池系统编号', required: true },
      { id: 'test_bench', label: '测试台与气液路状态', required: true },
      { id: 'instruments', label: '仪器与采集系统状态', required: true },
      { id: 'safety', label: '安全联锁与报警状态', required: true }
    ],
    requiredPhases: ['steady', 'dynamic'],
    requiredPhaseMetrics: {
      steady: ['durationS', 'avgCellVoltageV'],
      dynamic: ['durationS', 'currentRangeA']
    },
    acceptanceRules: [],
    acceptanceCriteria: {},
    scopeRules: {
      vehicleTypes: ['FCV', 'FCEV'],
      maxTemperatureC: 85,
      maxPressureBar: 50,
      description: '氢质氢离车辆运行数据覆盖；具体限值以企业批准资料为准。'
    },
    thresholds: { maxTemperatureC: 85, maxPressureBar: 50, maxLeakPpm: 10, maxVoltageStdV: 0.12, maxPressureDriftBarPerMin: 1.2 },
    fieldMapping: {
      timestamp_s: 'Timestamp',
      current_a: 'FC_CurrOut',
      voltage_v: 'FC_VoltOut',
      net_power_kw: 'FC_NetPwrOut',
      main_status: 'FC_MainSts',
      min_cell_voltage_v: 'FC_MinCellVoltage',
      min_cell_channel: 'FC_MinVoltageChannel',
      avg_cell_voltage_v: 'FC_AvgCellVoltage',
      avg_cell_dev_mv: 'FC_AvgCellDev',
      cell_voltage_variance: 'FC_VARVoltage',
      isolation_kohm: 'FC_VehicleIsolationR',
      runtime_h: 'FC_RunTime_Hours'
    },
    vehicleSignalUnits: {
      min_cell_voltage_v: { sourceUnit: 'V' },
      avg_cell_voltage_v: { sourceUnit: 'V' },
      cell_voltage_variance: { sourceUnit: 'V²' }
    },
    dataQualityRequirements: {
      maxIntervalMultiplier: 5
    }
  },
  {
    id: 'hypu-durability',
    name: '氢璞创能 · 耐久测试数据 profile',
    source: 'T02 企业资料字段审计（未审批）',
    description: '针对氢璞创能耐久报告（XLSX/DOCX）的字段映射与描述性统计；基于出厂检测报告解析与功率点分析。不执行企业预警阈值或放行判定。',
    approvalStatus: 'example_unapproved',
    applicationScope: '氢璞创能燃料电池耐久台架测试与出厂检测数据',
    intendedUse: '耐久功率点统计、电芯电压趋势、跨报告可比性描述、预警检测；需企业批准规则和方法版本才可进入风险筛查',
    methodId: 'HYPU-durability-rule-set',
    revision: '2026-08',
    methodExecutionStatus: 'ENTERPRISE_PROFILE_REQUIRED',
    evaluationMode: 'descriptive_only',
    supportedDatasetTypes: ['durability'],
    standardRefs: [
      { id: 'GB/T 46104-2025', title: '电解水制氢系统功率波动适应性测试方法', uri: 'https://std.samr.gov.cn/gb/search/gbDetailed?id=3DBA213287120D16E06397BE0A0A8119', status: 'current', evidenceSourceId: 'gbt_46104_2025', evidenceIds: ['ev_gbt46104_report'] }
    ],
    methodSource: { sourceId: 'hypu_field_mapper_2026', locator: 'T02 企业资料字段审计', evidenceType: 'enterprise_field_mapping', evidenceIds: ['ev_hypu_field_mapping'] },
    requiredMetadata: ['testPurpose', 'testPlanRef', 'acquisitionPlan', 'preCheckRecord', 'instrumentIds', 'instrumentAccuracy', 'calibrationRefs', 'environment', 'operator', 'operatorQualification', 'formulaRefs', 'uncertaintyPolicy', 'rawDataRef', 'signoff'],
    traceabilityRequirements: {
      required: true,
      requireEvidenceRef: true,
      fields: [
        { id: 'testRunId', label: '测试运行编号', valueType: 'reference' },
        { id: 'deviceId', label: '设备编号', valueType: 'reference' },
        { id: 'testType', label: '测试类型', valueType: 'text' },
        { id: 'testDate', label: '测试日期', valueType: 'date' }
      ]
    },
    requiredMeasurements: ['current_a', 'voltage_v'],
    acquisitionRequirements: {
      requireSamplingFrequency: true,
      requireSynchronization: true,
      requireEvidenceRef: true,
      requiredChannels: [
        { field: 'timestamp_s', unit: 's' },
        { field: 'current_a', unit: 'A' },
        { field: 'voltage_v', unit: 'V' }
      ]
    },
    preCheckRequirements: [
      { id: 'device_identity', label: '设备身份与出厂编号', required: true },
      { id: 'test_bench', label: '测试台状态', required: true },
      { id: 'instruments', label: '仪器与采集系统状态', required: true },
      { id: 'safety', label: '安全联锁与报警状态', required: true }
    ],
    requiredPhases: ['steady'],
    requiredPhaseMetrics: {
      steady: ['durationS', 'peakPowerW', 'minimumPowerW']
    },
    acceptanceRules: [],
    acceptanceCriteria: {},
    durabilityRules: {
      enableVoltageMonitoring: true,
      enablePowerTracking: true,
      warningThresholdPct: 10
    },
    thresholds: { maxTemperatureC: 85, maxPressureBar: 50, maxLeakPpm: 10, maxVoltageStdV: 0.12, maxPressureDriftBarPerMin: 1.2 },
    fieldMapping: {
      timestamp_s: '时间',
      current_a: '电堆电流',
      voltage_v: '电堆电压'
    },
    dataQualityRequirements: {
      maxIntervalS: 5
    }
  }
]);

export const CUSTOM_PROFILE_ID = 'custom';

const THRESHOLD_FIELDS = ['maxTemperatureC', 'maxPressureBar', 'maxLeakPpm', 'maxVoltageStdV', 'maxPressureDriftBarPerMin'];
const FIELD_MAPPING_FIELDS = ['timestamp_s', 'phase', 'current_a', 'voltage_v', 'power_w', 'power_setpoint_w', 'temperature_c', 'pressure_bar', 'flow_slpm', 'leak_ppm', 'hydrogen_purity_pct', 'gas_temperature_c', 'gas_pressure_bar', 'ambient_temperature_c', 'ambient_humidity_pct', 'ambient_pressure_kpa', 'efficiency_pct', 'net_power_kw'];
const PROFILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/;
const APPROVAL_STATUSES = ['approved', 'pending', 'example_unapproved'];
const APPROVAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const METHOD_EXECUTION_STATUSES = ['PUBLIC_SCOPE_MAPPING', 'ENTERPRISE_PROFILE_REQUIRED', 'FULL_METHOD_IMPLEMENTED'];
export const EVALUATION_MODES = Object.freeze(['descriptive_only', 'risk_screening', 'acceptance']);
const METHOD_EVIDENCE_SCHEMA_VERSION = 'h2-testlens.method-evidence.v1';
const METHOD_COVERAGE_STATUSES = ['implemented', 'not_applicable', 'partial', 'planned'];
const STANDARD_STATUSES = ['current', 'published', 'withdrawn', 'draft', 'unknown'];
const CANONICAL_STANDARD_URIS = Object.freeze({
  'GB/T 45541-2025': 'https://std.samr.gov.cn/gb/search/gbDetailed?id=31DA5F377BB68F08E06397BE0A0A4CFB',
  'GB/T 46104-2025': 'https://std.samr.gov.cn/gb/search/gbDetailed?id=3DBA213287120D16E06397BE0A0A8119',
  'GB/T 27748.2-2022': 'https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=2D7DA5B2D9F4D55AB5E627A41BCDFA2D',
  'ISO 22734-1:2025': 'https://www.iso.org/standard/82766.html?browse=ics',
  'ISO/IEC 17025:2017': 'https://www.iso.org/standard/66912.html',
  'ISO/IEC 42001:2023': 'https://www.iso.org/standard/81230.html',
  'ISO/IEC 23894:2023': 'https://www.iso.org/standard/77304.html'
});
const metadataFields = ['testPurpose', 'testPlanRef', 'acquisitionPlan', 'preCheckRecord', 'instrumentIds', 'instrumentAccuracy', 'calibrationRefs', 'environment', 'operator', 'operatorQualification', 'formulaRefs', 'uncertaintyPolicy', 'rawDataRef', 'signoff'];
const traceabilityFields = ['testRunId', 'deviceId', 'testType', 'testDate', 'cellCount', 'activeAreaCm2', 'evidenceRef'];
const traceabilityValueTypes = ['text', 'number', 'date', 'reference'];
const editLogFields = ['field', 'oldValueSummary', 'newValueSummary', 'operator', 'timestamp', 'reason', 'evidenceRef'];
const measurementFields = ['flow_slpm', 'hydrogen_purity_pct', 'power_w', 'power_setpoint_w', 'energy_derived', 'gas_temperature_c', 'gas_pressure_bar', 'ambient_temperature_c', 'ambient_humidity_pct', 'ambient_pressure_kpa', 'efficiency_pct', 'net_power_kw'];
const acquisitionChannelFields = ['timestamp_s', 'phase', 'current_a', 'voltage_v', 'temperature_c', 'pressure_bar', ...measurementFields.filter((field) => field !== 'energy_derived')];
const phaseMetricFields = ['durationS', 'energyConsumedWh', 'hydrogenVolumeNl', 'specificEnergyKWhPerNm3', 'powerRangeW', 'maxRampUpWPerS', 'maxRampDownWPerS', 'peakPowerW', 'minimumPowerW', 'maximumPowerW', 'validDataCoveragePct'];
const conditionValueTypes = ['text', 'number', 'reference'];
const uncertaintyFields = [
  'current_a', 'voltage_v', 'power_w', 'temperature_c', 'pressure_bar', 'flow_slpm', 'leak_ppm', 'hydrogen_purity_pct',
  'stack_current_a', 'net_power_kw', 'average_cell_voltage_mv', 'average_deviation_mv', 'voltage_variance',
  'avg_cell_voltage_v', 'avg_cell_dev_mv', 'cell_voltage_variance', 'cell_voltage_v', 'isolation_kohm'
];
const datasetTypes = ['vehicle', 'stack', 'durability', 'generic'];
const acceptanceMetrics = ['peakTemperatureC', 'peakPressureBar', 'peakLeakPpm', 'steadyVoltageStdV', 'pressureDriftBarPerMin', 'minimumHydrogenPurityPct', 'specificEnergyKWhPerNm3', 'efficiency_pct'];
const acceptanceOperators = ['<=', '>=', '<', '>', '=='];

const validIsoDate = (value) => {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export function standardReferenceReadiness(profile = {}) {
  const references = Array.isArray(profile.standardRefs) ? profile.standardRefs : [];
  if (!references.length) return {
    required: false,
    ready: true,
    status: 'not_configured',
    missing: [],
    malformed: [],
    duplicateIds: [],
    evidence: 'profile 未声明标准引用'
  };

  const missing = [];
  const malformed = [];
  const duplicateIds = [];
  const ids = new Set();
  for (const [index, reference] of references.entries()) {
    const label = `standardRefs[${index}]`;
    if (!reference || typeof reference !== 'object' || Array.isArray(reference)) {
      malformed.push(label);
      continue;
    }
    for (const field of ['id', 'title', 'uri', 'status']) if (!String(reference[field] || '').trim()) missing.push(`${label}.${field}`);
    const id = String(reference.id || '').trim();
    if (id && ids.has(id)) duplicateIds.push(id);
    if (id) ids.add(id);
    if (reference.status !== undefined && !STANDARD_STATUSES.includes(String(reference.status).trim())) malformed.push(`${label}.status`);
    const uri = String(reference.uri || '').trim();
    try {
      const parsedUri = new URL(uri);
      if (parsedUri.protocol !== 'https:') malformed.push(`${label}.uri_https_required`);
    } catch {
      malformed.push(`${label}.uri_invalid`);
    }
    const canonicalUri = CANONICAL_STANDARD_URIS[id];
    if (canonicalUri && uri !== canonicalUri) malformed.push(`${label}.uri_not_canonical_for_${id}`);
  }

  if (profile.approvalStatus === 'approved') {
    const methodId = String(profile.methodId || '').trim();
    const revision = String(profile.revision || '').trim();
    if (!methodId) missing.push('methodId');
    if (!revision) missing.push('revision');
    if (methodId && !references.some((reference) => String(reference?.id || '').trim() === methodId)) missing.push('methodId.standardRefs');
    if (!['current', 'published', 'draft', 'unknown', 'withdrawn'].includes(String(profile.status || '').trim())) missing.push('status');
  }
  if (references.length) {
    const source = profile.methodSource;
    if (!source || typeof source !== 'object' || Array.isArray(source)) missing.push('methodSource');
    else for (const field of ['sourceId', 'locator', 'evidenceType']) if (!String(source[field] || '').trim()) missing.push(`methodSource.${field}`);
    for (const field of ['scopeEvidence', 'workflowEvidence']) if (!String(profile[field] || '').trim()) missing.push(field);
    for (const field of ['publicationDate', 'effectiveDate']) {
      if (!validIsoDate(profile[field])) missing.push(field);
    }
    const publicationDate = String(profile.publicationDate || '').trim();
    const effectiveDate = String(profile.effectiveDate || '').trim();
    if (validIsoDate(publicationDate) && validIsoDate(effectiveDate) && effectiveDate < publicationDate) malformed.push('effectiveDate_before_publicationDate');
  }

  const status = malformed.length || duplicateIds.length ? 'malformed' : missing.length ? 'missing' : 'ready';
  return {
    required: true,
    ready: status === 'ready',
    status,
    missing: [...new Set(missing)],
    malformed: [...new Set(malformed)],
    duplicateIds: [...new Set(duplicateIds)],
    evidence: status === 'ready'
      ? `${references.length} 个标准引用均有 id/title/uri/status；approved profile 的方法、范围、日期和 methodId 绑定完整`
      : status === 'malformed'
        ? `标准引用格式或重复 id 非法：${[...new Set([...malformed, ...duplicateIds])].join('、')}`
        : `标准引用证据缺失：${[...new Set(missing)].join('、')}`
  };
}

function approvalEvidenceShape(evidence, revision) {
  const record = evidence && typeof evidence === 'object' && !Array.isArray(evidence) ? evidence : null;
  const fields = {
    approverId: typeof record?.approverId === 'string' && record.approverId.trim().length > 0,
    approvalDate: typeof record?.approvalDate === 'string' && validIsoDate(record.approvalDate),
    approvalRef: typeof record?.approvalRef === 'string' && record.approvalRef.trim().length > 0,
    profileRevision: typeof record?.profileRevision === 'string' && record.profileRevision.trim().length > 0,
    profileRevisionRef: typeof record?.profileRevisionRef === 'string' && record.profileRevisionRef.trim().length > 0
  };
  const missing = Object.entries(fields).filter(([, present]) => !present).map(([field]) => field);
  const malformed = [];
  if (record && record.approverId !== undefined && (typeof record.approverId !== 'string' || record.approverId.length > 160)) malformed.push('approverId');
  if (record && record.approvalDate !== undefined && (typeof record.approvalDate !== 'string' || !validIsoDate(record.approvalDate))) malformed.push('approvalDate');
  if (record && record.approvalRef !== undefined && (typeof record.approvalRef !== 'string' || record.approvalRef.length > 240)) malformed.push('approvalRef');
  if (record && record.profileRevision !== undefined && (typeof record.profileRevision !== 'string' || record.profileRevision.length > 120)) malformed.push('profileRevision');
  if (record && record.profileRevisionRef !== undefined && (typeof record.profileRevisionRef !== 'string' || record.profileRevisionRef.length > 240)) malformed.push('profileRevisionRef');
  const revisionMismatch = fields.profileRevision && String(record.profileRevision).trim() !== String(revision || '').trim();
  return { record, fields, missing, malformed: [...new Set(malformed)], revisionMismatch };
}

export function approvalEvidenceReadiness(evidence, revision, approvalStatus = null) {
  const required = approvalStatus === 'approved';
  if (!required) return {
    required: false,
    ready: true,
    status: 'not_required',
    missing: [],
    malformed: [],
    revisionMismatch: false,
    approverPresent: false,
    approvalDatePresent: false,
    approvalRefPresent: false,
    profileRevisionPresent: false,
    profileRevisionRefPresent: false,
    evidence: '当前 profile 未标记为 approved；不进入正式审批路径'
  };
  const shape = approvalEvidenceShape(evidence, revision);
  const status = !shape.record ? 'missing' : shape.malformed.length ? 'malformed' : shape.missing.length ? 'missing' : shape.revisionMismatch ? 'revision_mismatch' : 'ready';
  const missing = shape.missing.length ? shape.missing : shape.revisionMismatch ? ['profileRevision'] : [];
  return {
    required: true,
    ready: status === 'ready',
    status,
    missing,
    malformed: shape.malformed,
    revisionMismatch: shape.revisionMismatch,
    approverPresent: shape.fields.approverId,
    approvalDatePresent: shape.fields.approvalDate,
    approvalRefPresent: shape.fields.approvalRef,
    profileRevisionPresent: shape.fields.profileRevision,
    profileRevisionRefPresent: shape.fields.profileRevisionRef,
    evidence: status === 'ready'
      ? '审批人、审批日期、批准依据、当前 profile 修订号和修订证据引用均已存在'
      : status === 'revision_mismatch'
        ? '审批证据中的 profile 修订号与当前 profile revision 不一致'
        : status === 'malformed'
          ? `审批证据字段格式非法：${shape.malformed.join('、')}`
          : `approved profile 缺少审批证据：${missing.join('、')}`
  };
}

function methodEvidenceRecord(evidence) {
  return evidence && typeof evidence === 'object' && !Array.isArray(evidence) ? evidence : null;
}

function methodEvidenceText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function methodEvidenceDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

export function methodImplementationEvidenceReadiness(implementationEvidence, methodId, revision, methodExecutionStatus = null) {
  const required = methodExecutionStatus === 'FULL_METHOD_IMPLEMENTED';
  const notRequired = {
    required: false,
    ready: true,
    status: 'not_required',
    missing: [],
    malformed: [],
    incompleteItems: [],
    openGaps: [],
    methodMismatch: false,
    sourceRefCount: 0,
    coverageItemCount: 0,
    verifierPresent: false,
    verifiedAtPresent: false,
    verificationRefPresent: false,
    evidence: '当前方法状态不是 FULL_METHOD_IMPLEMENTED；不启用完整方法执行声明。'
  };
  if (!required) return notRequired;

  const record = methodEvidenceRecord(implementationEvidence);
  if (!record) return {
    ...notRequired,
    required: true,
    ready: false,
    status: 'missing',
    missing: ['methodImplementationEvidence'],
    evidence: 'FULL_METHOD_IMPLEMENTED 必须提供结构化方法实施证据。'
  };

  const missing = [];
  const malformed = [];
  const methodMismatch = [];
  if (record.schemaVersion !== METHOD_EVIDENCE_SCHEMA_VERSION) missing.push('schemaVersion');
  if (!methodEvidenceText(record.methodId)) missing.push('methodId');
  else if (String(record.methodId).trim() !== String(methodId || '').trim()) methodMismatch.push('methodId');
  if (!methodEvidenceText(record.methodRevision)) missing.push('methodRevision');
  else if (String(record.methodRevision).trim() !== String(revision || '').trim()) methodMismatch.push('revision');

  const sourceRefs = Array.isArray(record.sourceRefs) ? record.sourceRefs : null;
  if (!sourceRefs) missing.push('sourceRefs');
  else if (!sourceRefs.length) missing.push('sourceRefs');
  else sourceRefs.forEach((source, index) => {
    if (!source || typeof source !== 'object' || Array.isArray(source) || !methodEvidenceText(source.sourceId) || !methodEvidenceText(source.locator) || !methodEvidenceText(source.evidenceType)) malformed.push(`sourceRefs[${index}]`);
  });

  const coverageItems = Array.isArray(record.coverageItems) ? record.coverageItems : null;
  if (!coverageItems) missing.push('coverageItems');
  else if (!coverageItems.length) missing.push('coverageItems');
  const coverageIds = new Set();
  const incompleteItems = [];
  for (const [index, item] of (coverageItems || []).entries()) {
    const label = `coverageItems[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      malformed.push(label);
      continue;
    }
    if (!methodEvidenceText(item.id) || !methodEvidenceText(item.clauseRef) || !methodEvidenceText(item.title)) malformed.push(label);
    if (coverageIds.has(item.id)) malformed.push(`${label}.id_duplicate`);
    coverageIds.add(item.id);
    if (!METHOD_COVERAGE_STATUSES.includes(item.status)) malformed.push(`${label}.status`);
    const evidenceRefs = Array.isArray(item.evidenceRefs) ? item.evidenceRefs.filter(methodEvidenceText) : [];
    if (item.status === 'implemented' && !evidenceRefs.length) incompleteItems.push(`${item.id || label}:evidenceRefs`);
    if (item.status === 'not_applicable' && (!evidenceRefs.length || !methodEvidenceText(item.rationale))) incompleteItems.push(`${item.id || label}:not_applicable_basis`);
    if (item.status === 'partial' || item.status === 'planned') incompleteItems.push(`${item.id || label}:${item.status}`);
  }

  const verification = record.verification && typeof record.verification === 'object' && !Array.isArray(record.verification) ? record.verification : null;
  if (!verification) {
    missing.push('verification');
  } else {
    if (!methodEvidenceText(verification.verifierId)) missing.push('verification.verifierId');
    if (!methodEvidenceDate(verification.verifiedAt)) malformed.push('verification.verifiedAt');
    if (!methodEvidenceText(verification.verificationRef)) missing.push('verification.verificationRef');
  }
  const openGaps = Array.isArray(record.openGaps) ? record.openGaps : null;
  if (!openGaps) missing.push('openGaps');
  const status = missing.length
    ? 'missing'
    : malformed.length
      ? 'malformed'
      : methodMismatch.length
        ? 'method_mismatch'
        : incompleteItems.length
          ? 'coverage_incomplete'
          : openGaps.length
            ? 'open_gaps'
            : 'ready';
  const evidence = status === 'ready'
    ? `${coverageItems.length} 项方法覆盖均有实施证据；验证人、验证日期和验证引用齐全；未关闭缺口为 0`
    : status === 'method_mismatch'
      ? `方法实施证据与当前 profile 不一致：${methodMismatch.join('、')}`
      : status === 'coverage_incomplete'
        ? `方法覆盖项未完成：${incompleteItems.join('、')}`
        : status === 'open_gaps'
          ? `仍有 ${openGaps.length} 项未关闭方法缺口`
          : status === 'malformed'
            ? `方法实施证据格式非法：${malformed.join('、')}`
            : `方法实施证据缺失：${missing.join('、')}`;
  return {
    required: true,
    ready: status === 'ready',
    status,
    missing,
    malformed,
    incompleteItems,
    openGaps: openGaps || [],
    methodMismatch: methodMismatch.length > 0,
    sourceRefCount: sourceRefs?.length || 0,
    coverageItemCount: coverageItems?.length || 0,
    verifierPresent: Boolean(verification?.verifierId),
    verifiedAtPresent: Boolean(verification?.verifiedAt),
    verificationRefPresent: Boolean(verification?.verificationRef),
    evidence
  };
}

export function fullMethodProfileReadiness(profile = {}) {
  const required = profile.methodExecutionStatus === 'FULL_METHOD_IMPLEMENTED' && Array.isArray(profile.standardRefs) && profile.standardRefs.length > 0;
  if (!required) return {
    required: false,
    ready: true,
    status: 'not_required',
    missing: [],
    malformed: [],
    evidence: '当前 profile 未同时声明标准引用和 FULL_METHOD_IMPLEMENTED。'
  };

  const missing = [];
  const malformed = [];
  const hasAcceptanceRules = (Array.isArray(profile.acceptanceRules) && profile.acceptanceRules.length > 0)
    || (Array.isArray(profile.phaseAcceptanceRules) && profile.phaseAcceptanceRules.length > 0)
    || (profile.acceptanceCriteria && typeof profile.acceptanceCriteria === 'object' && !Array.isArray(profile.acceptanceCriteria) && Object.keys(profile.acceptanceCriteria).length > 0);
  if (!hasAcceptanceRules) missing.push('acceptanceRules');
  if (!Array.isArray(profile.instrumentRequirements) || !profile.instrumentRequirements.length) missing.push('instrumentRequirements');
  if (profile.uncertaintyModelRequired !== true) missing.push('uncertaintyModelRequired=true');

  const model = profile.uncertaintyModel;
  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    missing.push('uncertaintyModel');
  } else {
    if (model.method !== 'first_order_rss') malformed.push('uncertaintyModel.method');
    if (!Number.isFinite(Number(model.coverageFactor)) || Number(model.coverageFactor) <= 0) malformed.push('uncertaintyModel.coverageFactor');
    const standardUncertainty = model.standardUncertainty;
    if (!standardUncertainty || typeof standardUncertainty !== 'object' || Array.isArray(standardUncertainty) || !Object.keys(standardUncertainty).length) {
      missing.push('uncertaintyModel.standardUncertainty');
    } else if (!Object.entries(standardUncertainty).some(([, value]) => Number.isFinite(Number(value)) && Number(value) > 0)) {
      malformed.push('uncertaintyModel.standardUncertainty');
    }
  }

  const status = malformed.length ? 'malformed' : missing.length ? 'missing' : 'ready';
  return {
    required: true,
    ready: status === 'ready',
    status,
    missing: [...new Set(missing)],
    malformed: [...new Set(malformed)],
    evidence: status === 'ready'
      ? '标准引用 profile 的完整方法声明已绑定验收规则、仪器类别和企业不确定度模型。'
      : status === 'malformed'
        ? `完整方法 profile 前置证据格式非法：${[...new Set(malformed)].join('、')}`
        : `完整方法 profile 前置证据缺失：${[...new Set(missing)].join('、')}`
  };
}

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
    const evaluationMode = profile.evaluationMode || 'risk_screening';
    if (!EVALUATION_MODES.includes(evaluationMode)) errors.push(`${profile.id || '未知'} evaluationMode 非法`);
    if (profile.approvalEvidence !== undefined && (typeof profile.approvalEvidence !== 'object' || Array.isArray(profile.approvalEvidence))) errors.push(`${profile.id || '未知'} approvalEvidence 必须是对象`);
    if (profile.approvalStatus === 'approved') {
      const approval = approvalEvidenceReadiness(profile.approvalEvidence, profile.revision, profile.approvalStatus);
      if (!approval.ready) errors.push(`${profile.id || '未知'} approvalEvidence 不完整：${approval.evidence}`);
    }
    for (const field of ['applicationScope', 'intendedUse', 'methodId', 'revision']) if (profile[field] !== undefined && (typeof profile[field] !== 'string' || !profile[field].trim() || profile[field].length > 240)) errors.push(`${profile.id || '未知'} ${field} 必须是 1-240 字符字符串`);
    if (profile.standardRefs !== undefined && !Array.isArray(profile.standardRefs)) errors.push(`${profile.id || '未知'} standardRefs 必须是数组`);
    const standardEvidence = standardReferenceReadiness(profile);
    if (!standardEvidence.ready) errors.push(`${profile.id || '未知'} standardReferenceEvidence 不完整：${standardEvidence.evidence}`);
    if (profile.methodSource !== undefined && profile.methodSource !== null && (typeof profile.methodSource !== 'object' || Array.isArray(profile.methodSource) || !String(profile.methodSource.sourceId || '').trim() || !String(profile.methodSource.locator || '').trim() || !String(profile.methodSource.evidenceType || '').trim())) errors.push(`${profile.id || '未知'} methodSource 必须包含 sourceId/locator/evidenceType`);
    if (profile.methodExecutionStatus !== undefined && !METHOD_EXECUTION_STATUSES.includes(profile.methodExecutionStatus)) errors.push(`${profile.id || '未知'} methodExecutionStatus 非法`);
    if (profile.methodImplementationEvidence !== undefined && (typeof profile.methodImplementationEvidence !== 'object' || Array.isArray(profile.methodImplementationEvidence))) errors.push(`${profile.id || '未知'} methodImplementationEvidence 必须是对象`);
    if (profile.methodExecutionStatus === 'FULL_METHOD_IMPLEMENTED') {
      const methodEvidence = methodImplementationEvidenceReadiness(profile.methodImplementationEvidence, profile.methodId, profile.revision, profile.methodExecutionStatus);
      if (!methodEvidence.ready) errors.push(`${profile.id || '未知'} methodImplementationEvidence 不完整：${methodEvidence.evidence}`);
      const fullMethodProfile = fullMethodProfileReadiness(profile);
      if (!fullMethodProfile.ready) errors.push(`${profile.id || '未知'} fullMethodProfileEvidence 不完整：${fullMethodProfile.evidence}`);
    }
    if (profile.status !== undefined && !STANDARD_STATUSES.includes(profile.status)) errors.push(`${profile.id || '未知'} status 非法`);
    for (const field of ['publicationDate', 'effectiveDate']) if (profile[field] !== undefined && (typeof profile[field] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(profile[field]))) errors.push(`${profile.id || '未知'} ${field} 必须为 YYYY-MM-DD`);
    for (const field of ['scopeEvidence', 'workflowEvidence']) if (profile[field] !== undefined && (typeof profile[field] !== 'string' || !profile[field].trim() || profile[field].length > 500)) errors.push(`${profile.id || '未知'} ${field} 必须是 1-500 字符字符串`);
    if (profile.dataQualityRequirements !== undefined && (typeof profile.dataQualityRequirements !== 'object' || Array.isArray(profile.dataQualityRequirements))) errors.push(`${profile.id || '未知'} dataQualityRequirements 必须是对象`);
    if (profile.dynamicPowerAnalysis !== undefined && (typeof profile.dynamicPowerAnalysis !== 'object' || Array.isArray(profile.dynamicPowerAnalysis))) errors.push(`${profile.id || '未知'} dynamicPowerAnalysis 必须是对象`);
    for (const field of ['enabled'] .filter((field) => profile.dynamicPowerAnalysis?.[field] !== undefined)) if (typeof profile.dynamicPowerAnalysis[field] !== 'boolean') errors.push(`${profile.id || '未知'} dynamicPowerAnalysis.${field} 必须是布尔值`);
    for (const field of ['commandField', 'actualField', 'actualPowerField', 'unit', 'powerUnit'] .filter((field) => profile.dynamicPowerAnalysis?.[field] !== undefined)) if (typeof profile.dynamicPowerAnalysis[field] !== 'string' || !profile.dynamicPowerAnalysis[field].trim()) errors.push(`${profile.id || '未知'} dynamicPowerAnalysis.${field} 必须是非空字符串`);
    for (const field of ['minimumStep', 'responseBandPct', 'minimumResponseBand', 'settleWindowS', 'maxGapS'] .filter((field) => profile.dynamicPowerAnalysis?.[field] !== undefined)) if (!Number.isFinite(Number(profile.dynamicPowerAnalysis[field])) || Number(profile.dynamicPowerAnalysis[field]) < 0) errors.push(`${profile.id || '未知'} dynamicPowerAnalysis.${field} 必须是非负数`);
    for (const field of ['requireMonotonicTimestamps', 'requireUniqueTimestamps', 'requirePositiveIntervals', 'requirePlannedSamplingFrequency', 'requireSamplingRateMatch', 'requireContiguousPhaseRows']
      .filter((field) => profile.dataQualityRequirements?.[field] !== undefined)) if (typeof profile.dataQualityRequirements[field] !== 'boolean') errors.push(`${profile.id || '未知'} dataQualityRequirements.${field} 必须是布尔值`);
    for (const field of ['maxIntervalS', 'maxIntervalMultiplier', 'samplingRateTolerancePct', 'minPhaseCoveragePct']
      .filter((field) => profile.dataQualityRequirements?.[field] !== undefined)) if (!Number.isFinite(Number(profile.dataQualityRequirements[field])) || Number(profile.dataQualityRequirements[field]) <= 0) errors.push(`${profile.id || '未知'} dataQualityRequirements.${field} 必须为正数`);
    if (profile.requiredMetadata !== undefined && (!Array.isArray(profile.requiredMetadata) || profile.requiredMetadata.some((field) => !metadataFields.includes(field)))) errors.push(`${profile.id || '未知'} requiredMetadata 含未知字段`);
    if (profile.traceabilityRequirements !== undefined && profile.traceabilityRequirements !== null) {
      const requirements = profile.traceabilityRequirements;
      if (typeof requirements !== 'object' || Array.isArray(requirements)) errors.push(`${profile.id || '未知'} traceabilityRequirements 必须是对象或 null`);
      else {
        for (const field of ['required', 'requireEvidenceRef']) if (requirements[field] !== undefined && typeof requirements[field] !== 'boolean') errors.push(`${profile.id || '未知'} traceabilityRequirements.${field} 必须是布尔值`);
        if (requirements.fields !== undefined && !Array.isArray(requirements.fields)) errors.push(`${profile.id || '未知'} traceabilityRequirements.fields 必须是数组`);
        const traceabilityIds = new Set();
        for (const field of requirements.fields ?? []) {
          if (!field || typeof field !== 'object' || Array.isArray(field) || !traceabilityFields.includes(field.id) || !String(field.label || '').trim() || !traceabilityValueTypes.includes(field.valueType || 'text')) errors.push(`${profile.id || '未知'} traceabilityRequirements.fields 每项需有合法 id/label/valueType`);
          const id = String(field?.id || '').trim();
          if (id && traceabilityIds.has(id)) errors.push(`${profile.id || '未知'} traceabilityRequirements.fields id 重复：${id}`);
          if (id) traceabilityIds.add(id);
        }
      }
    }
    if (profile.editLogRequirements !== undefined && profile.editLogRequirements !== null) {
      const requirements = profile.editLogRequirements;
      if (typeof requirements !== 'object' || Array.isArray(requirements)) errors.push(`${profile.id || '未知'} editLogRequirements 必须是对象或 null`);
      else {
        for (const field of ['required', 'requireEvidenceRef']) if (requirements[field] !== undefined && typeof requirements[field] !== 'boolean') errors.push(`${profile.id || '未知'} editLogRequirements.${field} 必须是布尔值`);
        if (requirements.minEntries !== undefined && (!Number.isInteger(Number(requirements.minEntries)) || Number(requirements.minEntries) < 0)) errors.push(`${profile.id || '未知'} editLogRequirements.minEntries 必须是非负整数`);
        if (requirements.entryFields !== undefined && (!Array.isArray(requirements.entryFields) || requirements.entryFields.some((field) => !editLogFields.includes(field)))) errors.push(`${profile.id || '未知'} editLogRequirements.entryFields 含未知字段`);
      }
    }
    if (profile.requiredMeasurements !== undefined && (!Array.isArray(profile.requiredMeasurements) || profile.requiredMeasurements.some((field) => !measurementFields.includes(field)))) errors.push(`${profile.id || '未知'} requiredMeasurements 含未知字段`);
    if (profile.acquisitionRequirements !== undefined && profile.acquisitionRequirements !== null) {
      const requirements = profile.acquisitionRequirements;
      if (typeof requirements !== 'object' || Array.isArray(requirements)) errors.push(`${profile.id || '未知'} acquisitionRequirements 必须是对象或 null`);
      else {
        for (const field of ['requireSamplingFrequency', 'requireSynchronization', 'requireEvidenceRef']) if (requirements[field] !== undefined && typeof requirements[field] !== 'boolean') errors.push(`${profile.id || '未知'} acquisitionRequirements.${field} 必须是布尔值`);
        if (requirements.requiredChannels !== undefined && !Array.isArray(requirements.requiredChannels)) errors.push(`${profile.id || '未知'} acquisitionRequirements.requiredChannels 必须是数组`);
        for (const channel of requirements.requiredChannels ?? []) {
          const field = typeof channel === 'string' ? channel : channel?.field;
          if (!acquisitionChannelFields.includes(field)) errors.push(`${profile.id || '未知'} acquisitionRequirements.requiredChannels 含未知字段：${field || '未指定'}`);
          if (typeof channel === 'object' && channel !== null && channel.unit !== undefined && (typeof channel.unit !== 'string' || !channel.unit.trim() || channel.unit.length > 32)) errors.push(`${profile.id || '未知'} acquisitionRequirements.requiredChannels.unit 非法`);
        }
      }
    }
    if (profile.preCheckRequirements !== undefined) {
      if (!Array.isArray(profile.preCheckRequirements)) errors.push(`${profile.id || '未知'} preCheckRequirements 必须是数组`);
      const preCheckIds = new Set();
      for (const item of profile.preCheckRequirements ?? []) {
        if (!item || typeof item !== 'object' || Array.isArray(item) || !String(item.id || '').trim() || !String(item.label || '').trim()) errors.push(`${profile.id || '未知'} preCheckRequirements 每项需有 id/label`);
        const id = String(item?.id || '').trim();
        if (id && preCheckIds.has(id)) errors.push(`${profile.id || '未知'} preCheckRequirements id 重复：${id}`);
        if (id) preCheckIds.add(id);
        if (item?.required !== undefined && typeof item.required !== 'boolean') errors.push(`${profile.id || '未知'} preCheckRequirements.required 必须是布尔值`);
      }
    }
    if (profile.requiredPhases !== undefined && (!Array.isArray(profile.requiredPhases) || profile.requiredPhases.some((phase) => typeof phase !== 'string' || !phase.trim() || phase.length > 80))) errors.push(`${profile.id || '未知'} requiredPhases 必须是非空字符串数组`);
    if (profile.requiredPhaseMetrics !== undefined && (typeof profile.requiredPhaseMetrics !== 'object' || Array.isArray(profile.requiredPhaseMetrics))) errors.push(`${profile.id || '未知'} requiredPhaseMetrics 必须是对象`);
    for (const [phase, metrics] of Object.entries(profile.requiredPhaseMetrics ?? {})) if (!Array.isArray(metrics) || metrics.some((metric) => !phaseMetricFields.includes(metric))) errors.push(`${profile.id || '未知'} requiredPhaseMetrics.${phase} 含未知指标`);
    if (profile.phaseAcceptanceRules !== undefined && !Array.isArray(profile.phaseAcceptanceRules)) errors.push(`${profile.id || '未知'} phaseAcceptanceRules 必须是数组`);
    for (const rule of profile.phaseAcceptanceRules ?? []) if (!String(rule.phase || '').trim() || !phaseMetricFields.includes(rule.metric) || !acceptanceOperators.includes(rule.operator) || !Number.isFinite(Number(rule.value)) || !String(rule.sourceRef || '').trim()) errors.push(`${profile.id || '未知'} phaseAcceptanceRules 每项需有合法 phase/metric/operator/value/sourceRef`);
    if (profile.phaseAliases !== undefined && (typeof profile.phaseAliases !== 'object' || Array.isArray(profile.phaseAliases))) errors.push(`${profile.id || '未知'} phaseAliases 必须是对象`);
    for (const [phase, aliases] of Object.entries(profile.phaseAliases ?? {})) if (!Array.isArray(aliases) || aliases.some((alias) => typeof alias !== 'string' || !alias.trim())) errors.push(`${profile.id || '未知'} phaseAliases.${phase} 必须是非空字符串数组`);
    if (profile.requiredTestStages !== undefined && !Array.isArray(profile.requiredTestStages)) errors.push(`${profile.id || '未知'} requiredTestStages 必须是数组`);
    const stageIds = new Set();
    for (const stage of profile.requiredTestStages ?? []) {
      if (!stage || typeof stage !== 'object' || Array.isArray(stage) || !String(stage.id || '').trim() || !String(stage.label || '').trim()) errors.push(`${profile.id || '未知'} requiredTestStages 每项需有 id/label`);
      const id = String(stage?.id || '').trim();
      if (id && stageIds.has(id)) errors.push(`${profile.id || '未知'} requiredTestStages id 重复：${id}`);
      if (id) stageIds.add(id);
      if (stage?.required !== undefined && typeof stage.required !== 'boolean') errors.push(`${profile.id || '未知'} requiredTestStages.required 必须是布尔值`);
    }
    if (profile.workflowSequence !== undefined && !Array.isArray(profile.workflowSequence)) errors.push(`${profile.id || '未知'} workflowSequence 必须是数组`);
    const workflowIds = new Set();
    for (const step of profile.workflowSequence ?? []) {
      if (!step || typeof step !== 'object' || Array.isArray(step) || !String(step.id || '').trim() || !String(step.label || '').trim() || !String(step.gate || '').trim()) errors.push(`${profile.id || '未知'} workflowSequence 每项需有 id/label/gate`);
      const id = String(step?.id || '').trim();
      if (id && workflowIds.has(id)) errors.push(`${profile.id || '未知'} workflowSequence id 重复：${id}`);
      if (id) workflowIds.add(id);
    }
    for (const key of ['testSystemRequirements', 'phaseResultRequirements']) {
      if (profile[key] !== undefined && !Array.isArray(profile[key])) errors.push(`${profile.id || '未知'} ${key} 必须是数组`);
    }
    const systemIds = new Set();
    for (const item of profile.testSystemRequirements ?? []) {
      if (!item || typeof item !== 'object' || Array.isArray(item) || !String(item.id || '').trim() || !String(item.label || '').trim()) errors.push(`${profile.id || '未知'} testSystemRequirements 每项需有 id/label`);
      const id = String(item?.id || '').trim();
      if (id && systemIds.has(id)) errors.push(`${profile.id || '未知'} testSystemRequirements id 重复：${id}`);
      if (id) systemIds.add(id);
      if (item?.required !== undefined && typeof item.required !== 'boolean') errors.push(`${profile.id || '未知'} testSystemRequirements.required 必须是布尔值`);
    }
    const resultIds = new Set();
    for (const item of profile.phaseResultRequirements ?? []) {
      if (!item || typeof item !== 'object' || Array.isArray(item) || !String(item.phase || item.id || '').trim() || !String(item.label || '').trim() || !Array.isArray(item.resultFields)) errors.push(`${profile.id || '未知'} phaseResultRequirements 每项需有 phase/label/resultFields`);
      const id = String(item?.phase || item?.id || '').trim();
      if (id && resultIds.has(id)) errors.push(`${profile.id || '未知'} phaseResultRequirements phase 重复：${id}`);
      if (id) resultIds.add(id);
      if (item?.resultFields?.some((metric) => !phaseMetricFields.includes(metric))) errors.push(`${profile.id || '未知'} phaseResultRequirements.resultFields 含未知指标`);
      if (item?.evidenceRefRequired !== undefined && typeof item.evidenceRefRequired !== 'boolean') errors.push(`${profile.id || '未知'} phaseResultRequirements.evidenceRefRequired 必须是布尔值`);
      if (item?.required !== undefined && typeof item.required !== 'boolean') errors.push(`${profile.id || '未知'} phaseResultRequirements.required 必须是布尔值`);
    }
    if (profile.testConditionRequirements !== undefined && profile.testConditionRequirements !== null) {
      const requirements = profile.testConditionRequirements;
      if (typeof requirements !== 'object' || Array.isArray(requirements)) errors.push(`${profile.id || '未知'} testConditionRequirements 必须是对象或 null`);
      else {
        if (requirements.requireEvidenceRef !== undefined && typeof requirements.requireEvidenceRef !== 'boolean') errors.push(`${profile.id || '未知'} testConditionRequirements.requireEvidenceRef 必须是布尔值`);
        if (requirements.fields !== undefined && !Array.isArray(requirements.fields)) errors.push(`${profile.id || '未知'} testConditionRequirements.fields 必须是数组`);
        const conditionIds = new Set();
        for (const field of requirements.fields ?? []) {
          if (!field || typeof field !== 'object' || Array.isArray(field) || !String(field.id || '').trim() || !String(field.label || '').trim() || !conditionValueTypes.includes(field.valueType || 'text')) errors.push(`${profile.id || '未知'} testConditionRequirements.fields 每项需有合法 id/label/valueType`);
          const id = String(field?.id || '').trim();
          if (id && conditionIds.has(id)) errors.push(`${profile.id || '未知'} testConditionRequirements.fields id 重复：${id}`);
          if (id) conditionIds.add(id);
          if (field?.required !== undefined && typeof field.required !== 'boolean') errors.push(`${profile.id || '未知'} testConditionRequirements.fields.required 必须是布尔值`);
        }
      }
    }
    if (profile.environmentConditionRequirements !== undefined && profile.environmentConditionRequirements !== null) {
      const requirements = profile.environmentConditionRequirements;
      if (typeof requirements !== 'object' || Array.isArray(requirements)) errors.push(`${profile.id || '未知'} environmentConditionRequirements 必须是对象或 null`);
      else {
        if (requirements.requireEvidenceRef !== undefined && typeof requirements.requireEvidenceRef !== 'boolean') errors.push(`${profile.id || '未知'} environmentConditionRequirements.requireEvidenceRef 必须是布尔值`);
        if (requirements.fields !== undefined && !Array.isArray(requirements.fields)) errors.push(`${profile.id || '未知'} environmentConditionRequirements.fields 必须是数组`);
        const environmentIds = new Set();
        for (const field of requirements.fields ?? []) {
          if (!field || typeof field !== 'object' || Array.isArray(field) || !String(field.id || '').trim() || !String(field.label || '').trim() || !conditionValueTypes.includes(field.valueType || 'text')) errors.push(`${profile.id || '未知'} environmentConditionRequirements.fields 每项需有合法 id/label/valueType`);
          const id = String(field?.id || '').trim();
          if (id && environmentIds.has(id)) errors.push(`${profile.id || '未知'} environmentConditionRequirements.fields id 重复：${id}`);
          if (id) environmentIds.add(id);
          if (field?.required !== undefined && typeof field.required !== 'boolean') errors.push(`${profile.id || '未知'} environmentConditionRequirements.fields.required 必须是布尔值`);
        }
      }
    }
    if (profile.measurementMethodRequirements !== undefined && (!Array.isArray(profile.measurementMethodRequirements) || profile.measurementMethodRequirements.some((item) => !item || typeof item !== 'object' || Array.isArray(item) || !String(item.id || '').trim() || !String(item.label || '').trim()))) errors.push(`${profile.id || '未知'} measurementMethodRequirements 每项需有 id/label`);
    const methodIds = new Set();
    for (const method of profile.measurementMethodRequirements ?? []) {
      const id = String(method?.id || '').trim();
      if (id && methodIds.has(id)) errors.push(`${profile.id || '未知'} measurementMethodRequirements id 重复：${id}`);
      if (id) methodIds.add(id);
      if (method?.required !== undefined && typeof method.required !== 'boolean') errors.push(`${profile.id || '未知'} measurementMethodRequirements.required 必须是布尔值`);
      if (method?.measurementFields !== undefined && (!Array.isArray(method.measurementFields) || method.measurementFields.some((field) => !acquisitionChannelFields.includes(field)))) errors.push(`${profile.id || '未知'} measurementMethodRequirements.measurementFields 含未知字段`);
    }
    if (profile.efficiencyRequirement !== undefined && profile.efficiencyRequirement !== null) {
      const requirement = profile.efficiencyRequirement;
      if (typeof requirement !== 'object' || Array.isArray(requirement)) errors.push(`${profile.id || '未知'} efficiencyRequirement 必须是对象或 null`);
      else {
        if (requirement.required !== undefined && typeof requirement.required !== 'boolean') errors.push(`${profile.id || '未知'} efficiencyRequirement.required 必须是布尔值`);
        if (requirement.metric !== undefined && requirement.metric !== 'efficiency_pct') errors.push(`${profile.id || '未知'} efficiencyRequirement.metric 必须为 efficiency_pct`);
        if (requirement.outputUnit !== undefined && (typeof requirement.outputUnit !== 'string' || !requirement.outputUnit.trim())) errors.push(`${profile.id || '未知'} efficiencyRequirement.outputUnit 非法`);
        if (requirement.formulaRefRequired !== undefined && typeof requirement.formulaRefRequired !== 'boolean') errors.push(`${profile.id || '未知'} efficiencyRequirement.formulaRefRequired 必须是布尔值`);
        if (requirement.dataSource !== undefined && !['measured', 'measured_or_approved_formula_record'].includes(requirement.dataSource)) errors.push(`${profile.id || '未知'} efficiencyRequirement.dataSource 非法`);
      }
    }
    if (profile.scopeRules !== undefined && profile.scopeRules !== null && (typeof profile.scopeRules !== 'object' || Array.isArray(profile.scopeRules))) errors.push(`${profile.id || '未知'} scopeRules 必须是对象或 null`);
    if (profile.instrumentRequirements !== undefined && (!Array.isArray(profile.instrumentRequirements) || profile.instrumentRequirements.some((item) => typeof item !== 'string' || !item.trim()))) errors.push(`${profile.id || '未知'} instrumentRequirements 必须是非空字符串数组`);
    if (profile.reportRequirements !== undefined && (!Array.isArray(profile.reportRequirements) || profile.reportRequirements.some((item) => typeof item !== 'string' || !item.trim()))) errors.push(`${profile.id || '未知'} reportRequirements 必须是非空字符串数组`);
    if (profile.acceptanceRules !== undefined && !Array.isArray(profile.acceptanceRules)) errors.push(`${profile.id || '未知'} acceptanceRules 必须是数组`);
    for (const rule of profile.acceptanceRules ?? []) {
      if (!acceptanceMetrics.includes(rule.metric) || !acceptanceOperators.includes(rule.operator) || !Number.isFinite(Number(rule.value)) || !String(rule.sourceRef || '').trim()) errors.push(`${profile.id || '未知'} acceptanceRules 每项需有合法 metric/operator/value/sourceRef`);
    }
    if (profile.supportedDatasetTypes !== undefined && (!Array.isArray(profile.supportedDatasetTypes) || !profile.supportedDatasetTypes.length || profile.supportedDatasetTypes.some((type) => !datasetTypes.includes(type)))) errors.push(`${profile.id || '未知'} supportedDatasetTypes 含未知或空数据集类型`);
    if (profile.vehicleTargets !== undefined && (!Array.isArray(profile.vehicleTargets) || !profile.vehicleTargets.length || profile.vehicleTargets.some((value) => !Number.isFinite(Number(value)) || Number(value) <= 0))) errors.push(`${profile.id || '未知'} vehicleTargets 必须是正数数组`);
    if (profile.vehicleSignalUnits !== undefined) {
      if (!profile.vehicleSignalUnits || typeof profile.vehicleSignalUnits !== 'object' || Array.isArray(profile.vehicleSignalUnits)) errors.push(`${profile.id || '未知'} vehicleSignalUnits 必须是对象`);
      else for (const [field, unitSpec] of Object.entries(profile.vehicleSignalUnits)) {
        if (!['min_cell_voltage_v', 'avg_cell_voltage_v', 'cell_voltage_variance'].includes(field)) errors.push(`${profile.id || '未知'} vehicleSignalUnits 含未知字段：${field}`);
        const sourceUnit = typeof unitSpec === 'string' ? unitSpec : unitSpec?.sourceUnit;
        const allowedSourceUnits = field === 'cell_voltage_variance' ? ['V²', 'mV²', 'V2', 'mV2', 'V^2', 'mV^2'] : ['V', 'mV'];
        if (!allowedSourceUnits.includes(sourceUnit)) errors.push(`${profile.id || '未知'} vehicleSignalUnits.${field}.sourceUnit 必须为 ${field === 'cell_voltage_variance' ? 'V² 或 mV²' : 'V 或 mV'}`);
      }
    }
    if (profile.vehicleUnitEvidenceRequired !== undefined && typeof profile.vehicleUnitEvidenceRequired !== 'boolean') errors.push(`${profile.id || '未知'} vehicleUnitEvidenceRequired 必须是布尔值`);
    for (const field of ['vehicleCurrentToleranceA', 'vehicleMinimumDurationS']) if (profile[field] !== undefined && (!Number.isFinite(Number(profile[field])) || Number(profile[field]) <= 0)) errors.push(`${profile.id || '未知'} ${field} 必须为正数`);
    if (profile.vehicleTrendXAxis !== undefined && !['runtime_h', 'timestamp'].includes(profile.vehicleTrendXAxis)) errors.push(`${profile.id || '未知'} vehicleTrendXAxis 必须为 runtime_h 或 timestamp`);
    if (profile.vehicleTrendModel !== undefined && !['linear', 'quadratic'].includes(profile.vehicleTrendModel)) errors.push(`${profile.id || '未知'} vehicleTrendModel 必须为 linear 或 quadratic`);
    if (profile.durabilityRules !== undefined && (typeof profile.durabilityRules !== 'object' || Array.isArray(profile.durabilityRules))) errors.push(`${profile.id || '未知'} durabilityRules 必须是对象`);
    for (const field of ['maxDeviationMv', 'minAverageCellVoltageMv']) if (profile.durabilityRules?.[field] !== undefined && (!Number.isFinite(Number(profile.durabilityRules[field])) || Number(profile.durabilityRules[field]) <= 0)) errors.push(`${profile.id || '未知'} durabilityRules.${field} 必须为正数`);
    if (profile.uncertaintyModelRequired !== undefined && typeof profile.uncertaintyModelRequired !== 'boolean') errors.push(`${profile.id || '未知'} uncertaintyModelRequired 必须是布尔值`);
    if (profile.uncertaintyModel !== undefined && profile.uncertaintyModel !== null) {
      if (typeof profile.uncertaintyModel !== 'object' || Array.isArray(profile.uncertaintyModel)) errors.push(`${profile.id || '未知'} uncertaintyModel 必须是对象或 null`);
      else {
        if (profile.uncertaintyModel.method !== 'first_order_rss') errors.push(`${profile.id || '未知'} uncertaintyModel.method 必须为 first_order_rss`);
        if (!Number.isFinite(Number(profile.uncertaintyModel.coverageFactor)) || Number(profile.uncertaintyModel.coverageFactor) <= 0) errors.push(`${profile.id || '未知'} uncertaintyModel.coverageFactor 必须为正数`);
        for (const [field, value] of Object.entries(profile.uncertaintyModel.standardUncertainty ?? {})) if (!uncertaintyFields.includes(field) || !Number.isFinite(Number(value)) || Number(value) < 0) errors.push(`${profile.id || '未知'} uncertaintyModel.standardUncertainty.${field} 非法`);
      }
    }
    if (profile.acceptanceCriteria !== undefined && (typeof profile.acceptanceCriteria !== 'object' || Array.isArray(profile.acceptanceCriteria))) errors.push(`${profile.id || '未知'} acceptanceCriteria 必须是对象`);
    for (const field of ['minHydrogenPurityPct', 'maxSpecificEnergyKWhPerNm3']) if (profile.acceptanceCriteria?.[field] !== undefined && (!Number.isFinite(Number(profile.acceptanceCriteria[field])) || Number(profile.acceptanceCriteria[field]) <= 0)) errors.push(`${profile.id || '未知'} acceptanceCriteria.${field} 必须为正数`);
    if (profile.stoichConfig !== undefined && (typeof profile.stoichConfig !== 'object' || Array.isArray(profile.stoichConfig))) errors.push(`${profile.id || '未知'} stoichConfig 必须是对象`);
    for (const field of ['cellCount', 'faradayConstantCPerMol', 'standardMolarVolumeLPerMol', 'oxygenVolumeFraction']) if (profile.stoichConfig?.[field] !== undefined && (!Number.isFinite(Number(profile.stoichConfig[field])) || Number(profile.stoichConfig[field]) <= 0)) errors.push(`${profile.id || '未知'} stoichConfig.${field} 必须为正数`);
    const thresholdsConfigured = profile.thresholds !== undefined && profile.thresholds !== null;
    if (!thresholdsConfigured && evaluationMode !== 'descriptive_only') errors.push(`${profile.id || '未知'} 非描述性 profile 必须提供 thresholds`);
    if (thresholdsConfigured && (typeof profile.thresholds !== 'object' || Array.isArray(profile.thresholds))) errors.push(`${profile.id || '未知'} thresholds 必须是对象或 null`);
    if (thresholdsConfigured && typeof profile.thresholds === 'object' && !Array.isArray(profile.thresholds)) for (const field of THRESHOLD_FIELDS) {
      const value = Number(profile.thresholds?.[field]);
      if (!Number.isFinite(value)) errors.push(`${profile.id || '未知'} 缺少数值阈值 ${field}`);
      else if (['maxVoltageStdV', 'maxPressureDriftBarPerMin'].includes(field) ? value < 0 : value <= 0) errors.push(`${profile.id || '未知'} 阈值必须为非负/正数：${field}`);
    }
    if (evaluationMode === 'descriptive_only' && (profile.acceptanceRules?.length || Object.keys(profile.acceptanceCriteria || {}).length)) errors.push(`${profile.id || '未知'} descriptive_only 不得携带 acceptanceRules/acceptanceCriteria`);
  }
  if (payload?.fieldMapping !== undefined && (typeof payload.fieldMapping !== 'object' || Array.isArray(payload.fieldMapping))) errors.push('fieldMapping 必须是对象');
  for (const [field, source] of Object.entries(payload?.fieldMapping ?? {})) {
    if (!FIELD_MAPPING_FIELDS.includes(field)) errors.push(`fieldMapping 含未知字段：${field}`);
    if (typeof source !== 'string' || !source.trim() || source.length > 160) errors.push(`fieldMapping.${field} 必须是 1-160 字符字符串`);
  }
  return { ok: errors.length === 0, errors };
}

export function profilesFromPackage(payload, options = {}) {
  const validation = validateProfilePackage(payload);
  if (!validation.ok) return validation;
  const evidenceRows = Array.isArray(options.evidenceRows) ? options.evidenceRows : [];
  const requiresLedger = options.requireEvidenceLedger === true && (payload.profiles || []).some((profile) => Array.isArray(profile?.standardRefs) && profile.standardRefs.length && profile.methodSource);
  const standardEvidenceBinding = requiresLedger
    ? evidenceRows.length ? validateProfileEvidenceBindings(payload, evidenceRows, { requireEvidenceIds: true }) : { ready: false, checks: [], error: 'standardEvidenceLedger 缺失' }
    : { ready: true, checks: [], status: 'not_configured' };
  if (requiresLedger && !standardEvidenceBinding.ready) {
    const bindingErrors = standardEvidenceBinding.checks?.flatMap((check) => [
      ...(check.binding?.missing || []), ...(check.binding?.malformed || []),
      ...(check.standardReferences || []).flatMap((binding) => [...(binding.missing || []), ...(binding.malformed || [])])
    ]) || [];
    return { ok: false, errors: ['运行时标准 evidence ledger 绑定失败：' + (standardEvidenceBinding.error || bindingErrors.join('、') || '未知错误')], standardEvidenceBinding };
  }
  const requiresApprovalLedger = options.requireApprovalLedger === true && (payload.profiles || []).some((profile) => profile?.approvalStatus === 'approved');
  const trustedApprovalBinding = requiresApprovalLedger
    ? validateTrustedApprovalBinding(payload, options.approvalRows || [], { now: options.now, packageHashes: options.packageHashes })
    : { ready: true, status: 'not_configured', checks: [], source: 'trusted-approval-ledger' };
  if (requiresApprovalLedger && !trustedApprovalBinding.ready) {
    const errors = trustedApprovalBinding.checks.flatMap((check) => [...(check.missing || []), ...(check.malformed || [])]);
    return { ok: false, errors: ['可信审批 ledger 绑定失败：' + (errors.join('、') || '未知错误')], standardEvidenceBinding, trustedApprovalBinding };
  }
  return {
    ok: true,
    errors: [],
    organization: payload.organization || '未命名企业配置',
    standardEvidenceBinding,
    trustedApprovalBinding,
    profiles: payload.profiles.map((profile) => ({
      ...profile,
      approvalStatus: profile.approvalStatus || 'pending',
      approvalEvidence: profile.approvalEvidence || null,
      applicationScope: profile.applicationScope || '未指定应用范围',
      intendedUse: profile.intendedUse || '未指定用途',
      methodId: profile.methodId || '未指定测试方法',
      revision: profile.revision || '未指定版本',
      standardRefs: profile.standardRefs || [],
      methodSource: profile.methodSource || null,
      standardReferenceEvidence: standardReferenceReadiness(profile),
      standardEvidenceBinding,
      trustedApprovalBinding,
      profilePackageValidated: true,
      methodImplementationEvidence: profile.methodImplementationEvidence || null,
      methodExecutionStatus: profile.methodExecutionStatus || (profile.standardRefs?.length ? 'ENTERPRISE_PROFILE_REQUIRED' : null),
      evaluationMode: profile.evaluationMode || 'risk_screening',
      status: profile.status || null,
      publicationDate: profile.publicationDate || null,
      effectiveDate: profile.effectiveDate || null,
      scopeEvidence: profile.scopeEvidence || null,
      workflowEvidence: profile.workflowEvidence || null,
      requiredMetadata: profile.requiredMetadata || metadataFields,
      traceabilityRequirements: profile.traceabilityRequirements || null,
      editLogRequirements: profile.editLogRequirements || null,
      requiredMeasurements: profile.requiredMeasurements || [],
      acquisitionRequirements: profile.acquisitionRequirements || null,
      preCheckRequirements: profile.preCheckRequirements || [],
      dataQualityRequirements: profile.dataQualityRequirements || null,
      requiredPhases: profile.requiredPhases || [],
      requiredPhaseMetrics: profile.requiredPhaseMetrics || {},
      phaseAcceptanceRules: profile.phaseAcceptanceRules || [],
      phaseAliases: profile.phaseAliases || {},
      requiredTestStages: profile.requiredTestStages || [],
      workflowSequence: profile.workflowSequence || [],
      testSystemRequirements: profile.testSystemRequirements || [],
      testConditionRequirements: profile.testConditionRequirements || null,
      environmentConditionRequirements: profile.environmentConditionRequirements || null,
      phaseResultRequirements: profile.phaseResultRequirements || [],
      measurementMethodRequirements: profile.measurementMethodRequirements || [],
      dynamicPowerAnalysis: profile.dynamicPowerAnalysis || { enabled: false },
      efficiencyRequirement: profile.efficiencyRequirement || null,
      scopeRules: profile.scopeRules || null,
      instrumentRequirements: profile.instrumentRequirements || [],
      reportRequirements: profile.reportRequirements || [],
      acceptanceRules: profile.acceptanceRules || [],
      supportedDatasetTypes: profile.supportedDatasetTypes || [],
      vehicleTargets: profile.vehicleTargets || [],
      vehicleCurrentToleranceA: profile.vehicleCurrentToleranceA || null,
      vehicleMinimumDurationS: profile.vehicleMinimumDurationS || null,
      vehicleDynamicAnalysis: profile.vehicleDynamicAnalysis || null,
      vehicleSignalUnits: profile.vehicleSignalUnits || {},
      vehicleUnitEvidenceRequired: profile.vehicleUnitEvidenceRequired === true,
      vehicleTrendXAxis: profile.vehicleTrendXAxis || 'runtime_h',
      vehicleTrendModel: profile.vehicleTrendModel || 'linear',
      durabilityRules: profile.durabilityRules || {},
      acceptanceCriteria: profile.acceptanceCriteria || {},
      stoichConfig: profile.stoichConfig || null,
      uncertaintyModelRequired: profile.uncertaintyModelRequired || false,
      uncertaintyModel: profile.uncertaintyModel || null,
      source: profile.source || `${payload.organization || '企业'} 当前会话配置`,
      description: profile.description || '由当前会话导入的配置，正式使用前需确认审批状态。',
      thresholds: profile.thresholds === null || profile.thresholds === undefined
        ? null
        : Object.fromEntries(THRESHOLD_FIELDS.map((field) => [field, Number(profile.thresholds[field])]))
    })),
    fieldMapping: payload.fieldMapping || {}
  };
}

export function getProfile(profileId, profiles = DEVICE_PROFILES) {
  return profiles.find((profile) => profile.id === profileId) ?? null;
}
