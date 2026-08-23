import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonlLedger, validateEvidenceLedger, validateMethodSourceBinding } from '../src/standard-evidence.mjs';

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
