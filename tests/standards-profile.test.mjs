import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_PROFILES } from '../src/profiles.mjs';

const profileByMethod = (methodId) => DEVICE_PROFILES.find((profile) => profile.methodId === methodId);

test('GB/T 46104 profile covers every publicly declared measurement family and test phase', () => {
  const profile = profileByMethod('GB/T 46104-2025');
  assert.ok(profile, 'built-in GB/T 46104 profile is present');
  assert.equal(profile.methodExecutionStatus, 'PUBLIC_SCOPE_MAPPING');

  const channelFields = new Set((profile.acquisitionRequirements?.requiredChannels || []).map((channel) => channel.field));
  assert.deepEqual([...channelFields].sort(), [
    'ambient_humidity_pct',
    'ambient_pressure_kpa',
    'ambient_temperature_c',
    'current_a',
    'flow_slpm',
    'gas_pressure_bar',
    'gas_temperature_c',
    'hydrogen_purity_pct',
    'power_w',
    'timestamp_s',
    'voltage_v'
  ]);

  assert.deepEqual([...profile.requiredPhases].sort(), ['cold_start', 'dynamic', 'hot_start', 'shutdown', 'steady']);
  assert.deepEqual(profile.requiredPhaseMetrics.dynamic, ['powerRangeW', 'maxRampUpWPerS', 'maxRampDownWPerS']);
  assert.deepEqual(profile.requiredPhaseMetrics.steady, ['hydrogenVolumeNl', 'energyConsumedWh', 'specificEnergyKWhPerNm3']);
  assert.ok(profile.efficiencyRequirement?.required);

  const requiredSystems = new Set((profile.testSystemRequirements || []).filter((item) => item.required !== false).map((item) => item.id));
  assert.deepEqual([...requiredSystems].sort(), [
    'circulation',
    'control_system',
    'electrolyzer',
    'gas_liquid_separation',
    'power_supply',
    'thermal_management'
  ]);
});

test('GB/T 45541 profile remains a public-scope mapping and does not invent acceptance limits', () => {
  const profile = profileByMethod('GB/T 45541-2025');
  assert.ok(profile, 'built-in GB/T 45541 profile is present');
  assert.equal(profile.methodExecutionStatus, 'PUBLIC_SCOPE_MAPPING');
  assert.equal(profile.acceptanceRules.length, 0);
  assert.deepEqual(profile.acceptanceCriteria, {});
  assert.equal(profile.scopeRules.maxRatedHydrogenPressureMpa, 10);
  assert.equal(profile.scopeRules.minRatedHydrogenProductionM3h, 1);
  assert.equal(profile.scopeRules.maxRatedHydrogenProductionM3h, 500);
});

test('standard-referenced built-in profiles keep an explicit non-certification execution boundary', () => {
  for (const profile of DEVICE_PROFILES.filter((item) => item.standardRefs?.length)) {
    assert.ok(['PUBLIC_SCOPE_MAPPING', 'ENTERPRISE_PROFILE_REQUIRED', 'FULL_METHOD_IMPLEMENTED'].includes(profile.methodExecutionStatus), `${profile.id} execution status`);
    assert.notEqual(profile.approvalStatus, 'approved', `${profile.id} must not ship as an approved enterprise profile`);
    assert.ok(profile.standardRefs.every((reference) => reference.uri && reference.status), `${profile.id} references need URI and status`);
  }
});
