import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRows, parseCSV, reportMarkdown } from '../src/analyzer.mjs';
import { DEVICE_PROFILES, profilesFromPackage } from '../src/profiles.mjs';

test('T02 descriptive profiles are dataset-scoped and do not require thresholds', () => {
  const profiles = DEVICE_PROFILES.filter((profile) => profile.id.startsWith('t02-'));
  assert.equal(profiles.length, 3);
  assert.deepEqual(profiles.map((profile) => profile.supportedDatasetTypes[0]).sort(), ['durability', 'stack', 'vehicle']);
  assert.ok(profiles.every((profile) => profile.evaluationMode === 'descriptive_only'));
  assert.ok(profiles.every((profile) => profile.thresholds === null));

  const imported = profilesFromPackage({
    schemaVersion: 'h2-testlens.profile.v1',
    profiles: profiles.map((profile) => ({ ...profile }))
  });
  assert.equal(imported.ok, true, imported.errors?.join('；'));
  assert.ok(imported.profiles.every((profile) => profile.thresholds === null));
  assert.equal(imported.profiles.find((profile) => profile.id === 't02-vehicle-descriptive').vehicleUnitEvidenceRequired, true);
});

test('T02 vehicle profile blocks unitless cell-voltage KPI instead of guessing V or mV', () => {
  const rows = parseCSV([
    'Timestamp,FC_MainSts,FC_CurrOut,FC_VoltOut,FC_NetPwrOut,FC_MinCellVoltage,FC_MinVoltageChannel,FC_AvgCellVoltage,FC_AvgCellDev,FC_VARVoltage,FC_VehicleIsolationR,FC_RunTime_Hours',
    '0,4,10,320,3.2,700,3,740,8,12,500,1',
    '1,4,10,320,3.2,701,3,741,8,12,500,1'
  ].join('\n'));
  const result = analyzeRows(rows, { evaluationMode: 'descriptive_only', profileId: 't02-vehicle-descriptive', vehicleUnitEvidenceRequired: true });
  assert.equal(result.metrics.steadyVoltageMeanV, null);
  assert.ok(result.issues.some((issue) => issue.code === 'VEHICLE_UNIT_UNRESOLVED'));
  assert.equal(result.dataset.unitDiagnostics.required, true);
});

test('standard workflow templates remain risk-screening profiles', () => {
  const standardTemplates = DEVICE_PROFILES.filter((profile) => profile.id.startsWith('electrolyzer-'));
  assert.ok(standardTemplates.length >= 2);
  assert.ok(standardTemplates.every((profile) => profile.evaluationMode === 'risk_screening'));
  assert.ok(standardTemplates.every((profile) => profile.thresholds && typeof profile.thresholds === 'object'));
});

test('descriptive_only converts threshold outcomes into observations and blocks release', () => {
  const rows = parseCSV([
    'timestamp_s,phase,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm',
    '0,steady,10,20,90,35,1,20',
    '1,steady,10,20,90,35,1,20'
  ].join('\n'));
  const result = analyzeRows(rows, {
    evaluationMode: 'descriptive_only',
    profileId: 't02-generic-descriptive',
    profileName: 'T02 描述性测试',
    profileSource: 'T02 示例 profile',
    thresholds: { maxTemperatureC: 80, maxPressureBar: 30, maxLeakPpm: 10, maxVoltageStdV: 0.12, maxPressureDriftBarPerMin: 1.2 }
  });

  assert.equal(result.verdict, 'DESCRIPTIVE');
  assert.equal(result.evaluation.decisionStatus, 'NOT_RUN');
  assert.equal(result.evaluation.thresholdEvaluation, 'NOT_RUN');
  assert.equal(result.releaseGate.ready, false);
  assert.deepEqual(result.releaseGate.blockedReasons, ['descriptive_only']);
  const temperatureObservation = result.issues.find((issue) => issue.code === 'TEMP_HIGH');
  assert.equal(temperatureObservation.severity, 'info');
  assert.match(temperatureObservation.title, /描述性观察/);
  const markdown = reportMarkdown(result, 'descriptive.csv');
  assert.match(markdown, /descriptive_only/);
  assert.match(markdown, /未执行温度、压力、泄漏、稳定性或企业验收阈值判定/);
  assert.doesNotMatch(markdown, /## 当前判定阈值/);
});

test('descriptive_only rejects embedded acceptance criteria', () => {
  const result = profilesFromPackage({
    schemaVersion: 'h2-testlens.profile.v1',
    profiles: [{
      id: 'bad-descriptive-profile',
      name: '非法描述 profile',
      evaluationMode: 'descriptive_only',
      thresholds: null,
      acceptanceCriteria: { minHydrogenPurityPct: 99 }
    }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('descriptive_only')));
});
