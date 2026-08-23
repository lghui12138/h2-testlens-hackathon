import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRows } from '../src/analyzer.mjs';
import { annotateDeclaredBatchRows, batchAggregationMarkdown, observeDeclaredBatch, publicBatchAggregation, summarizeDeclaredBatch, validateBatchDeclaration } from '../src/batch-aggregation.mjs';

const declaration = {
  version: 'h2-testlens.batch-declaration.v1',
  groups: [{
    id: 'run-001',
    testRunId: 'TR-001',
    sessionGroup: 'SG-001',
    files: ['a.csv', 'b.csv'],
    fileOrder: ['a.csv', 'b.csv'],
    clockReference: 'DAQ-01',
    samplingFrequencyHz: 1,
    restartBoundaries: ['b.csv']
  }]
};

const rows = (offset) => [
  { timestamp_s: String(offset), phase: 'steady', current_a: '10', voltage_v: '20', temperature_c: '25', pressure_bar: '1', flow_slpm: '3', leak_ppm: '1' },
  { timestamp_s: String(offset + 1), phase: 'steady', current_a: '10', voltage_v: '20', temperature_c: '25', pressure_bar: '1', flow_slpm: '3', leak_ppm: '1' }
];

test('batch declaration validates identity, order, clock, sampling, and restart boundaries', () => {
  const result = validateBatchDeclaration(declaration, [
    { name: 'a.csv', status: 'processed' },
    { name: 'b.csv', status: 'processed' }
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.groups[0].fileOrder, ['a.csv', 'b.csv']);
  const blocked = validateBatchDeclaration({ version: declaration.version, groups: [{ ...declaration.groups[0], clockReference: '', samplingFrequencyHz: null, restartBoundaries: ['a.csv'] }] }, [{ name: 'a.csv', status: 'processed' }, { name: 'b.csv', status: 'blocked_binary' }]);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.errors.some((error) => error.includes('clockReference')));
  assert.ok(blocked.errors.some((error) => error.includes('samplingFrequencyHz')));
  assert.ok(blocked.errors.some((error) => error.includes('未进入分析器')));
  assert.ok(blocked.errors.some((error) => error.includes('首文件')));
});

test('declared batch rows preserve file sessions and an explicit boundary marker', () => {
  const group = validateBatchDeclaration(declaration, [{ name: 'a.csv', status: 'processed' }, { name: 'b.csv', status: 'processed' }]).groups[0];
  const annotated = annotateDeclaredBatchRows(group, [{ name: 'a.csv', rows: rows(0) }, { name: 'b.csv', rows: rows(0) }]);
  assert.equal(annotated.length, 4);
  assert.deepEqual(annotated.map((row) => row.session_id), ['file:a.csv', 'file:a.csv', 'file:b.csv', 'file:b.csv']);
  assert.equal(annotated[2].batch_boundary_before, true);
  assert.equal(annotated[0].batch_boundary_before, false);
  assert.equal(annotated[3].source_file, 'b.csv');
});

test('batch observation checks canonical timestamps, sampling deviation, and declared restart boundaries', () => {
  const group = validateBatchDeclaration(declaration, [{ name: 'a.csv', status: 'processed' }, { name: 'b.csv', status: 'processed' }]).groups[0];
  const entries = [{ name: 'a.csv', rows: rows(0) }, { name: 'b.csv', rows: rows(0) }];
  const fileResults = entries.map((entry) => ({ name: entry.name, result: analyzeRows(entry.rows) }));
  const observation = observeDeclaredBatch(group, fileResults);
  assert.equal(observation.status, 'ready');
  assert.equal(observation.sampling.status, 'observed_only');
  assert.equal(observation.sampling.observedMedianIntervalS, 1);
  assert.equal(observation.sampling.deviationPct, 0);
  assert.equal(observation.crossFile[0].relation, 'rewind');
  assert.equal(observation.crossFile[0].restartBoundaryDeclared, true);

  const mismatchGroup = validateBatchDeclaration({ ...declaration, groups: [{ ...declaration.groups[0], samplingFrequencyHz: 2, samplingTolerancePct: 5 }] }, [{ name: 'a.csv', status: 'processed' }, { name: 'b.csv', status: 'processed' }]).groups[0];
  const mismatch = observeDeclaredBatch(mismatchGroup, fileResults);
  assert.equal(mismatch.status, 'not_ready');
  assert.equal(mismatch.sampling.status, 'outside_tolerance');
  assert.ok(mismatch.issueCodes.includes('BATCH_SAMPLING_OUTSIDE_TOLERANCE'));

  const missingBoundaryGroup = validateBatchDeclaration({ ...declaration, groups: [{ ...declaration.groups[0], restartBoundaries: [] }] }, [{ name: 'a.csv', status: 'processed' }, { name: 'b.csv', status: 'processed' }]).groups[0];
  const missingBoundary = observeDeclaredBatch(missingBoundaryGroup, fileResults);
  assert.equal(missingBoundary.status, 'not_ready');
  assert.ok(missingBoundary.issueCodes.includes('BATCH_CROSS_FILE_BOUNDARY_MISSING'));

  const invalidSequence = observeDeclaredBatch(group, [{ name: 'a.csv', result: analyzeRows([{ ...rows(0)[0], timestamp_s: '2' }, { ...rows(0)[1], timestamp_s: '1' }]) }, fileResults[1]]);
  assert.equal(invalidSequence.status, 'not_ready');
  assert.ok(invalidSequence.issueCodes.includes('BATCH_FILE_TIME_SEQUENCE_INVALID'));
});

test('declared batch summary is descriptive and public output redacts identifiers and raw file values', () => {
  const group = validateBatchDeclaration(declaration, [{ name: 'a.csv', status: 'processed' }, { name: 'b.csv', status: 'processed' }]).groups[0];
  const entries = [{ name: 'a.csv', rows: rows(0), rowCount: 2, hash: 'hash-a' }, { name: 'b.csv', rows: rows(0), rowCount: 2, hash: 'hash-b' }];
  const fileResults = entries.map((entry) => ({ name: entry.name, result: analyzeRows(entry.rows) }));
  const combined = analyzeRows(annotateDeclaredBatchRows(group, entries));
  const summary = summarizeDeclaredBatch(group, entries, fileResults, combined);
  assert.equal(summary.status, 'descriptive_only');
  assert.equal(summary.mergeMode, 'declared_grouped_sessions');
  assert.equal(summary.fileCount, 2);
  assert.equal(summary.rowCount, 4);
  assert.equal(summary.boundary.includes('不产生标准符合性'), true);
  assert.equal(summary.combined.sessionCount, 2);
  const publicSummary = publicBatchAggregation(summary);
  assert.equal(publicSummary.testRunId, undefined);
  assert.equal(publicSummary.sessionGroup, undefined);
  assert.equal(publicSummary.files[0].name, undefined);
  assert.equal(publicSummary.files[0].hash, undefined);
  assert.equal(publicSummary.files[0].fileNamePresent, true);
  assert.equal(publicSummary.observation.files[0].name, undefined);
  assert.equal(publicSummary.observation.files[0].fileNamePresent, true);
  assert.equal(publicSummary.observation.issues[0], undefined);
  assert.match(batchAggregationMarkdown(summary), /显式批次汇总/);
  assert.match(batchAggregationMarkdown(summary), /TR-001/);
});
