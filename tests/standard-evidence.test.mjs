import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseJsonlLedger, validateEvidenceLedger, validateMethodSourceBinding, validateStandardReferenceBinding } from '../src/standard-evidence.mjs';
import { canonicalApprovalPayload, validateTrustedApprovalBinding } from '../src/approval-ledger.mjs';

test('standards evidence ledger closes source, evidence, and claim references', () => {
  const sources = parseJsonlLedger('{"source_id":"std-1"}\n', 'sources');
  const evidence = parseJsonlLedger('{"evidence_id":"ev-1","source_id":"std-1","evidence_type":"official","locator":"scope","supports":["clm-1"]}\n', 'evidence');
  const claims = parseJsonlLedger('{"claim_id":"clm-1","evidence_ids":["ev-1"]}\n', 'claims');
  const result = validateEvidenceLedger({ sources: sources.rows, evidence: evidence.rows, claims: claims.rows });
  assert.equal(result.ready, true);
  assert.deepEqual(result.errors, []);
});

test('method source binding requires exact evidence ledger provenance', () => {
  const rows = [{ evidence_id: 'ev-1', source_id: 'std-1', evidence_type: 'official', locator: 'scope' }];
  const ready = validateMethodSourceBinding({ sourceId: 'std-1', locator: 'scope', evidenceType: 'official', evidenceIds: ['ev-1'] }, rows);
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.matchedEvidenceIds, ['ev-1']);
  const blocked = validateMethodSourceBinding({ sourceId: 'std-1', locator: 'wrong', evidenceType: 'official', evidenceIds: ['ev-1'] }, rows);
  assert.equal(blocked.ready, false);
  assert.ok(blocked.missing.includes('methodSource.locator/evidenceType.evidenceLedger'));
});

test('method source binding rejects cross-source evidence ids', () => {
  const rows = [
    { evidence_id: 'ev-1', source_id: 'std-1', evidence_type: 'official', locator: 'scope' },
    { evidence_id: 'ev-2', source_id: 'std-2', evidence_type: 'official', locator: 'scope' }
  ];
  const result = validateMethodSourceBinding({ sourceId: 'std-1', locator: 'scope', evidenceType: 'official', evidenceIds: ['ev-2'] }, rows);
  assert.equal(result.ready, false);
  assert.ok(result.malformed.some((item) => item.includes('sourceMismatch')));
});

test('each declared standard reference requires its own ledger source and evidence ids', () => {
  const rows = [
    { evidence_id: 'ev-std-1', source_id: 'std-1', standard_id: 'STD-1', evidence_type: 'official', locator: 'scope' },
    { evidence_id: 'ev-std-2', source_id: 'std-2', standard_id: 'STD-2', evidence_type: 'official', locator: 'status' }
  ];
  const ready = validateStandardReferenceBinding({ id: 'STD-1', evidenceSourceId: 'std-1', evidenceIds: ['ev-std-1'] }, 0, rows);
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.matchedEvidenceIds, ['ev-std-1']);
  const blocked = validateStandardReferenceBinding({ id: 'STD-1', evidenceSourceId: 'std-1', evidenceIds: ['ev-std-2'] }, 0, rows);
  assert.equal(blocked.ready, false);
  assert.ok(blocked.malformed.some((item) => item.includes('sourceMismatch')));
  const missing = validateStandardReferenceBinding({ id: 'STD-1' }, 0, rows);
  assert.equal(missing.ready, false);
  assert.ok(missing.missing.includes('standardRefs[0].evidenceSourceId'));
  assert.ok(missing.missing.includes('standardRefs[0].evidenceIds'));
  const wrongStandard = validateStandardReferenceBinding({ id: 'STD-1', evidenceSourceId: 'std-2', evidenceIds: ['ev-std-2'] }, 0, rows);
  assert.equal(wrongStandard.ready, false);
  assert.ok(wrongStandard.malformed.some((item) => item.includes('standardMismatch')));
});

test('approved profiles fail closed without a trusted approval ledger while unapproved profiles remain usable', () => {
  const blocked = validateTrustedApprovalBinding({ profiles: [{ id: 'p-1', approvalStatus: 'approved', revision: 'r1', methodId: 'M1' }] }, []);
  assert.equal(blocked.ready, false);
  assert.ok(blocked.checks[0].missing.includes('trustedApprovalLedger.approvalRows'));
  const unapproved = validateTrustedApprovalBinding({ profiles: [{ id: 'p-2', approvalStatus: 'example_unapproved' }] }, []);
  assert.equal(unapproved.ready, true);
});

test('approval package canonicalization binds self-declared approval fields but ignores runtime binding output', () => {
  const base = { schemaVersion: 'h2-testlens.profile.v1', profiles: [{ id: 'p-1', approvalStatus: 'approved', approvalEvidence: { approverId: 'self', approvalDate: '2026-08-24', approvalRef: 'REF-1', profileRevision: 'r1', profileRevisionRef: 'REV-1' }, revision: 'r1', thresholds: { maxTemperatureC: 80 } }] };
  const changed = structuredClone(base);
  changed.profiles[0].approvalEvidence = { approverId: 'different' };
  assert.notEqual(canonicalApprovalPayload(base), canonicalApprovalPayload(changed));
  changed.profiles[0].approvalEvidence = base.profiles[0].approvalEvidence;
  changed.profiles[0].trustedApprovalBinding = { ready: true, approvalId: 'runtime-only' };
  assert.equal(canonicalApprovalPayload(base), canonicalApprovalPayload(changed));
  changed.profiles[0].approvalStatus = 'pending';
  assert.notEqual(canonicalApprovalPayload(base), canonicalApprovalPayload(changed));
  changed.profiles[0].approvalStatus = base.profiles[0].approvalStatus;
  changed.profiles[0].thresholds.maxTemperatureC = 81;
  assert.notEqual(canonicalApprovalPayload(base), canonicalApprovalPayload(changed));
});

test('research evidence graph reconciles every runtime standard_id', async () => {
  const runtime = JSON.parse(await readFile(new URL('../config/standard-evidence-ledger.v1.json', import.meta.url), 'utf8'));
  const research = parseJsonlLedger(await readFile(new URL('../.research/ignite_t02_standards_20260821/evidence.jsonl', import.meta.url), 'utf8'), 'evidence');
  const byId = new Map(research.rows.map((row) => [row.evidence_id, row]));
  const missing = (runtime.evidenceRows || []).filter((row) => row.standard_id && byId.get(row.evidence_id)?.standard_id !== row.standard_id).map((row) => row.evidence_id);
  assert.deepEqual(missing, []);
});

test('trusted approval ledger accepts the exact package hash and blocks a mismatch', () => {
  const payload = { profiles: [{ id: 'approved-pkg', approvalStatus: 'approved', revision: 'r1', methodId: 'M1' }] };
  const packageHash = 'a'.repeat(64);
  const row = { profileId: 'approved-pkg', revision: 'r1', methodId: 'M1', status: 'approved', approvalId: 'APR-1', packageSha256: packageHash, validUntil: '2026-12-31', revoked: false };
  const accepted = validateTrustedApprovalBinding(payload, [row], { now: '2026-08-24', packageHashes: { 'approved-pkg': packageHash } });
  assert.equal(accepted.ready, true);
  const rejected = validateTrustedApprovalBinding(payload, [row], { now: '2026-08-24', packageHashes: { 'approved-pkg': 'b'.repeat(64) } });
  assert.equal(rejected.ready, false);
  assert.ok(rejected.checks[0].malformed.includes('trustedApprovalLedger.packageHashMismatch'));
});
