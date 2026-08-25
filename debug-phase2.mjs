const module = await import('./src/enterprise-adapters.mjs');
const { analyzeEnterpriseRows } = module;

const actualCurrent = '实际电流（A）';
const actualVoltage = '实际电压（V）';
const powerKw = '功率（kW）';

const rows = Array.from({ length: 100 }, (_, i) => ({
  timestamp_s: String(i * 2),
  session_id: 'a',
  phase: 'steady',
  [actualCurrent]: String(10 + (i % 50)),
  [actualVoltage]: '2',
  [powerKw]: String(20 + (i % 100))
}));

const result = analyzeEnterpriseRows(rows, {
  datasetType: 'stack',
  requiredPhases: ['steady'],
  requiredPhaseMetrics: { steady: ['maxRampUpWPerS', 'maxRampDownWPerS'] }
});

console.log('result:', result ? 'truthy' : 'falsy');
if (result) {
  console.log('compliance.phaseMetrics.phases.steady:', JSON.stringify(result.compliance?.phaseMetrics?.phases?.steady));
}
