import { readFile } from 'node:fs/promises';
import { profilesFromPackage } from '../src/profiles.mjs';

const file = process.argv[2] || 'config/enterprise-profile.example.json';
try {
  const payload = JSON.parse(await readFile(file, 'utf8'));
  const result = profilesFromPackage(payload);
  if (!result.ok) {
    console.log(JSON.stringify({ ok: false, file, errors: result.errors }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({
      ok: true,
      file,
      organization: result.organization,
      fieldMappingCount: Object.keys(result.fieldMapping).length,
      profiles: result.profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        approvalStatus: profile.approvalStatus,
        methodId: profile.methodId,
        revision: profile.revision,
        standardRefs: profile.standardRefs.map((reference) => reference.id),
        requiredMetadata: profile.requiredMetadata,
        requiredMeasurements: profile.requiredMeasurements,
        requiredPhases: profile.requiredPhases,
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
  }
} catch (error) {
  console.log(JSON.stringify({ ok: false, file, error: error.message }, null, 2));
  process.exitCode = 1;
}
