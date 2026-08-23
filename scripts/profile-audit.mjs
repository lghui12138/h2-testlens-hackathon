import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { approvalEvidenceReadiness, methodImplementationEvidenceReadiness, profilesFromPackage } from '../src/profiles.mjs';
import { parseJsonlLedger, validateEvidenceLedger, validateProfileEvidenceBindings } from '../src/standard-evidence.mjs';

const file = process.argv[2] || 'config/enterprise-profile.example.json';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourcesFile = join(root, '.research/ignite_t02_standards_20260821/sources.jsonl');
const evidenceFile = process.argv[3] || join(root, '.research/ignite_t02_standards_20260821/evidence.jsonl');
try {
  const payload = JSON.parse(await readFile(file, 'utf8'));
  const result = profilesFromPackage(payload);
  const evidenceLedgerText = await readFile(evidenceFile, 'utf8');
  const sourcesLedgerParsed = parseJsonlLedger(await readFile(sourcesFile, 'utf8'), 'sources');
  const evidenceLedgerParsed = parseJsonlLedger(evidenceLedgerText, 'evidence');
  const evidenceLedger = validateEvidenceLedger({ sources: sourcesLedgerParsed.rows, evidence: evidenceLedgerParsed.rows });
  const standardEvidenceBindings = validateProfileEvidenceBindings(payload, evidenceLedgerParsed.rows, { requireEvidenceIds: true });
  if (!result.ok) {
    console.log(JSON.stringify({ ok: false, file, sourcesFile, evidenceFile, errors: result.errors, evidenceLedger, standardEvidenceBindings }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({
      ok: sourcesLedgerParsed.errors.length === 0 && evidenceLedgerParsed.errors.length === 0 && evidenceLedger.ready && standardEvidenceBindings.ready,
      file,
      sourcesFile,
      evidenceFile,
      evidenceLedger: { ready: sourcesLedgerParsed.errors.length === 0 && evidenceLedgerParsed.errors.length === 0 && evidenceLedger.ready, sourceCount: evidenceLedger.sourceCount, evidenceCount: evidenceLedger.evidenceCount, errors: [...sourcesLedgerParsed.errors, ...evidenceLedgerParsed.errors, ...evidenceLedger.errors] },
      standardEvidenceBindings,
      organization: result.organization,
      fieldMappingCount: Object.keys(result.fieldMapping).length,
      profiles: result.profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        approvalStatus: profile.approvalStatus,
        approvalEvidence: approvalEvidenceReadiness(profile.approvalEvidence, profile.revision, profile.approvalStatus),
        methodId: profile.methodId,
        revision: profile.revision,
        standardRefs: profile.standardRefs.map((reference) => reference.id),
        standardReferenceEvidence: profile.standardReferenceEvidence,
        methodSource: profile.methodSource,
        methodExecutionStatus: profile.methodExecutionStatus,
        methodImplementationEvidence: methodImplementationEvidenceReadiness(profile.methodImplementationEvidence, profile.methodId, profile.revision, profile.methodExecutionStatus),
        requiredMetadata: profile.requiredMetadata,
        requiredMeasurements: profile.requiredMeasurements,
        acquisitionRequirements: profile.acquisitionRequirements,
        preCheckRequirements: profile.preCheckRequirements,
        requiredPhases: profile.requiredPhases,
        requiredPhaseMetrics: profile.requiredPhaseMetrics,
        phaseAcceptanceRules: profile.phaseAcceptanceRules,
        phaseAliases: profile.phaseAliases,
        requiredTestStages: profile.requiredTestStages,
        testSystemRequirements: profile.testSystemRequirements,
        testConditionRequirements: profile.testConditionRequirements,
        environmentConditionRequirements: profile.environmentConditionRequirements,
        phaseResultRequirements: profile.phaseResultRequirements,
        measurementMethodRequirements: profile.measurementMethodRequirements,
        efficiencyRequirement: profile.efficiencyRequirement,
        scopeRules: profile.scopeRules,
        instrumentRequirements: profile.instrumentRequirements,
        reportRequirements: profile.reportRequirements,
        acceptanceRules: profile.acceptanceRules,
        supportedDatasetTypes: profile.supportedDatasetTypes,
        vehicleTargets: profile.vehicleTargets,
        vehicleCurrentToleranceA: profile.vehicleCurrentToleranceA,
        vehicleMinimumDurationS: profile.vehicleMinimumDurationS,
        durabilityRules: profile.durabilityRules,
        acceptanceCriteria: profile.acceptanceCriteria,
        uncertaintyModelRequired: profile.uncertaintyModelRequired,
        uncertaintyModelConfigured: Boolean(profile.uncertaintyModel)
      }))
    }, null, 2));
    if (sourcesLedgerParsed.errors.length || evidenceLedgerParsed.errors.length || !evidenceLedger.ready || !standardEvidenceBindings.ready) process.exitCode = 1;
  }
} catch (error) {
  console.log(JSON.stringify({ ok: false, file, sourcesFile, evidenceFile, error: error.message }, null, 2));
  process.exitCode = 1;
}
