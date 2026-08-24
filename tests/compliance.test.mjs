import test from 'node:test';
import assert from 'node:assert/strict';
import { compliance } from '../src/enterprise-adapters.mjs';

test('compliance returns DEMO_ONLY with specific boundary for unapproved profiles without standardRefs', () => {
  const result = compliance({
    approvalStatus: 'example_unapproved',
    methodExecutionStatus: 'ENTERPRISE_PROFILE_REQUIRED',
    standardRefs: [],
    requiredMetadata: [],
    acceptanceRules: [],
    acceptanceCriteria: {},
    testMetadata: {}
  }, 'demo', {}, { rowCount: 0, completenessPct: 0, usable: false }, [], {});
  assert.equal(result.status, 'DEMO_ONLY');
  assert.ok(result.boundary.includes('审批状态为 example_unapproved'));
  assert.ok(result.boundary.includes('方法执行状态：ENTERPRISE_PROFILE_REQUIRED'));
  assert.ok(result.auditTrail);
  assert.equal(result.auditTrail.approvalStatus, 'example_unapproved');
  assert.equal(result.auditTrail.methodExecutionStatus, 'ENTERPRISE_PROFILE_REQUIRED');
  assert.equal(result.auditTrail.formalBlockers, true);
});

test('compliance returns specific boundary with blocker count for approved profiles with missing evidence', () => {
  const result = compliance({
    approvalStatus: 'approved',
    methodExecutionStatus: 'FULL_METHOD_IMPLEMENTED',
    standardRefs: [{ id: 'GB/T 46104-2025', title: 'test', uri: 'https://example.com', status: 'current' }],
    methodId: 'GB/T 46104-2025',
    revision: '2025',
    methodImplementationEvidence: { ready: false, evidence: 'missing' },
    fullMethodProfile: { ready: false, evidence: 'missing' },
    requiredMetadata: ['testPurpose'],
    testMetadata: { testPurpose: '' },
    acceptanceRules: [],
    acceptanceCriteria: {},
    requiredMeasurements: ['current_a'],
    requiredPhases: ['steady'],
    dataQualityRequirements: {}
  }, 'stack', {}, { rowCount: 10, completenessPct: 100, usable: true }, [{ current_a: 10 }], { mapping: { current_a: 'current_a' } });
  assert.equal(result.status, 'NOT_READY');
  assert.ok(result.boundary.includes('approved profile'));
  assert.ok(result.boundary.includes('项标准化资料未完成'));
  assert.ok(result.auditTrail);
  assert.equal(result.auditTrail.formalBlockers, true);
  assert.ok(result.auditTrail.blockerCount > 0);
});

test('compliance includes detailed evidence trail in auditTrail', () => {
  const result = compliance({
    approvalStatus: 'approved',
    methodExecutionStatus: 'ENTERPRISE_PROFILE_REQUIRED',
    standardRefs: [],
    requiredMetadata: ['operator'],
    testMetadata: { operator: 'engineer-1' },
    acceptanceRules: [],
    acceptanceCriteria: {},
    requiredMeasurements: [],
    requiredPhases: [],
    dataQualityRequirements: {}
  }, 'generic', {}, { rowCount: 5, completenessPct: 100, usable: true }, [], {});
  assert.ok(result.auditTrail);
  assert.ok(typeof result.auditTrail.evaluatedAt === 'string');
  assert.ok(typeof result.auditTrail.evidenceReadyCount === 'number');
  assert.ok(typeof result.auditTrail.evidenceTotalCount === 'number');
  assert.ok(result.auditTrail.missingSummary.length <= 12);
});

test('compliance history tracks snapshots with approval and method status', () => {
  const result = compliance({
    approvalStatus: 'example_unapproved',
    methodExecutionStatus: 'ENTERPRISE_PROFILE_REQUIRED',
    standardRefs: [],
    requiredMetadata: [],
    acceptanceRules: [],
    acceptanceCriteria: {},
    testMetadata: {}
  }, 'vehicle', {}, { rowCount: 0, completenessPct: 0, usable: false }, [], {});
  assert.ok(result.auditTrail);
  assert.equal(result.auditTrail.approvalStatus, 'example_unapproved');
  assert.equal(result.auditTrail.methodExecutionStatus, 'ENTERPRISE_PROFILE_REQUIRED');
  assert.ok(result.auditTrail.datasetLabel === 'vehicle');
});

test('compliance boundary is specific for example_unapproved profiles', () => {
  const result = compliance({
    approvalStatus: 'example_unapproved',
    methodExecutionStatus: 'ENTERPRISE_PROFILE_REQUIRED',
    standardRefs: [],
    requiredMetadata: [],
    acceptanceRules: [],
    acceptanceCriteria: {},
    testMetadata: {}
  }, 'demo', {}, { rowCount: 0, completenessPct: 0, usable: false }, [], {});
  assert.ok(result.boundary.includes('企业未审批演示 profile'));
  assert.ok(result.boundary.includes('不构成标准符合性判定或放行依据'));
  assert.ok(result.boundary.includes('不得用于标准符合性声明'));
});

test('compliance auditTrail includes detailed evidence and method metadata', () => {
  const result = compliance({
    approvalStatus: 'example_unapproved',
    methodExecutionStatus: 'ENTERPRISE_PROFILE_REQUIRED',
    methodId: 'GB/T 46104-2025',
    revision: '2025',
    standardRefs: [{ id: 'GB/T 46104-2025', title: 'test', uri: 'https://example.com', status: 'current' }],
    requiredMetadata: [],
    acceptanceRules: [],
    acceptanceCriteria: {},
    testMetadata: {}
  }, 'stack', {}, { rowCount: 10, completenessPct: 100, usable: true }, [], {});
  assert.ok(result.auditTrail);
  assert.equal(result.auditTrail.methodId, 'GB/T 46104-2025');
  assert.equal(result.auditTrail.revision, '2025');
  assert.equal(result.auditTrail.standardRefsCount, 1);
  assert.equal(result.auditTrail.datasetRowCount, 10);
  assert.ok(Array.isArray(result.auditTrail.evidenceDetails));
  assert.ok(result.auditTrail.evidenceDetails.length >= 20);
  assert.ok(result.auditTrail.evidenceDetails.some((item) => item.id === 'methodImplementation'));
  assert.ok(result.auditTrail.evidenceDetails.every((item) => 'ready' in item && 'evidence' in item && 'label' in item));
});

test('compliance history snapshot captures enriched fields for UI rendering', () => {
  const result = compliance({
    approvalStatus: 'example_unapproved',
    methodExecutionStatus: 'ENTERPRISE_PROFILE_REQUIRED',
    methodId: 'GB/T 46104-2025',
    revision: '2025',
    standardRefs: [{ id: 'GB/T 46104-2025', title: 'test', uri: 'https://example.com', status: 'current' }],
    requiredMetadata: [],
    acceptanceRules: [],
    acceptanceCriteria: {},
    testMetadata: {}
  }, 'stack', {}, { rowCount: 10, completenessPct: 100, usable: true }, [], {});
  const snapshot = { ...result.auditTrail, savedAt: new Date().toISOString() };
  assert.ok(snapshot.methodId === 'GB/T 46104-2025');
  assert.ok(snapshot.revision === '2025');
  assert.ok(snapshot.standardRefsCount === 1);
  assert.ok(snapshot.datasetRowCount === 10);
  assert.ok(snapshot.evaluationMode === null);
});
