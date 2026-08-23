# Test Plan

## Automated

Run `npm test` and `npm run typecheck`.

The suite includes `tests/standards-profile.test.mjs`, which keeps the built-in GB/T 46104 public-content mapping and the GB/T 45541 non-conformity boundary aligned with the documented official-source evidence. This regression checks mapping completeness; it does not replace review of the standards text or enterprise-approved profiles.

- CSV parsing and sample row count;
- pressure and leak threshold detection;
- configurable threshold behavior;
- report content and recommendation presence.
- missing schema fails closed;
- empty numeric values are not treated as zero;
- AI fallback and remote adapter receive structured evidence without raw rows.
- Chinese/alias headers map to canonical fields and common units convert to SI/report units.
- baseline comparison identifies verdict transition, KPI deltas, and new/resolved risk codes.
- device profile thresholds change analysis and profile provenance appears in reports; manual edits switch to custom session mode.
- local history stores summaries without `rows`, supports previous-batch comparison, persists after refresh, and can be cleared.
- remote AI rejects conflicting verdict/empty evidence and falls back to local draft with a reason.
- `npm run eval:ai` reports 4/4 grounding fixtures passed.
- `npm run check:submission` reports all required files, tests, AI evaluation, and T02 brief checks passed.
- `npm run typecheck` completes with the locked dependencies; this is a source/build consistency gate, not evidence of standards compliance.
- API `profilePackage` and `batch-watch --profile` routing preserve T02 `descriptive_only`; results remain `DESCRIPTIVE` with threshold/acceptance status `NOT_RUN`.
- Load the example enterprise JSON package; verify organization, imported profile, and `字段映射 8/8` appear without console errors.
- For a profile with `acquisitionRequirements` and `preCheckRequirements`, submit structured acquisition/pre-check JSON; verify missing channel/unit, synchronization, failed status, and missing evidence references enter `NOT_READY` and the workflow list.
- For a profile with `requiredTestStages`, `testConditionRequirements`, `measurementMethodRequirements`, and `efficiencyRequirement`, submit empty structured records; verify stage/condition/method/efficiency issues enter `NOT_READY` and no efficiency is inferred from energy/flow.
- Submit an enterprise-cited efficiency result with `valuePct`, `formulaRef`, and `sourceRef`; verify the efficiency gate is ready while the result remains explicitly profile/evidence sourced.
- For a method profile with `testSystemRequirements`, `environmentConditionRequirements`, and `phaseResultRequirements`, omit each structured record in turn; verify `TEST_SYSTEM_EVIDENCE_MISSING`, `ENVIRONMENT_CONDITION_EVIDENCE_MISSING`, and `PHASE_RESULT_EVIDENCE_MISSING` keep the result at `NOT_READY`.
- Omit `operatorQualification` while keeping `operator` present; verify the report gate lists only the independent qualification field as missing.
- For a profile with `workflowSequence`, mark one required `testStages` item incomplete; verify only that sequence step is `needs_input` while another completed stage remains `ready`.
- For a method requirement with `measurementFields`, omit one declared channel from `record.fields`; verify `measurementMethods.missingFields` names the exact method/field pair.
- Public API contract: with a profile package and structured metadata, verify `compliance.workflowSequence` is present while operator/measurement evidence values are reduced to presence/count summaries.
- Approved profile contract: omit or mismatch `approvalEvidence` and verify the package rejects with HTTP 422 or analysis remains `NOT_READY`; provide all five bound fields and verify public config/compliance expose status and presence only, never approver or approval reference values.
- Object traceability/edit-log contract: declare `traceabilityRequirements` and `editLogRequirements`, first omit `testRunId/deviceId/testType/testDate/cellCount/activeAreaCm2/evidenceRef` and `editLog`, then provide valid structured evidence; verify approved analysis moves from `NOT_READY` evidence gates to ready sub-gates, while public API/Markdown/Excel contain counts/status only and never operator identity or old/new value summaries.
- Full-method contract: declare `FULL_METHOD_IMPLEMENTED` without `methodImplementationEvidence`, with a method/revision mismatch, a partial coverage item, a non-empty `openGaps`, missing enterprise acceptance rules/instrument requirements, or missing/invalid uncertainty model; verify package validation rejects the profile or direct analysis remains `NOT_READY` with the explicit method/profile evidence blocker and never emits `HUMAN_REVIEW_PACKAGE`. Provide complete evidence and verify the gate can proceed.
- Expand “查看字段映射证据”; verify canonical fields, raw headers, and conversion labels are visible with zero warnings for the matched example package.
- Generate the report draft, download Markdown and JSON, and verify the downloaded artifacts contain the structured-evidence draft and rule analysis.
- `npm run package:submission` runs readiness before packaging and produces a non-empty zip containing the runnable app and submission docs.
- `npm run smoke:api` confirms `/api/analyze` and `/api/compare` return structured results/reports without raw `rows`.
- Multi-file vehicle regression keeps source sessions separate, returns two target-current segments rather than one cross-file segment, and preserves left/right signal selection in the Markdown report.
- Multi-file stack regression keeps repeated current platforms and stable intervals inside their source sessions; the T02 audit confirms the 190 processed files have no duplicate processed SHA-256.
- Batch declaration regression verifies canonical per-file timestamp presence and strict monotonicity, actual median sampling interval vs declaration, `samplingTolerancePct` exceedance, and overlap/rewind handling through `restartBoundaries`; API output must redact names, identifiers, hashes, and issue evidence.
- Browser declared-batch regression: static and Vinext pages expose the same declaration JSON input, status panel and example asset; after importing multiple files, the panel must show only redacted group/file observation status, actual median interval, deviation and issue codes while retaining `descriptive_only`.
- Browser large-file regression: the display sampler bounds trend-chart rows, keeps first/last rows and source-session transitions, and the worker asset is present in the static site package. Worker failure must fall back to the same analyzer on the main thread without changing KPI/verdict output.
- T02 coverage completeness regression: every processed vehicle/stack source field must belong to exactly one usage role; the audit must expose zero unclassified and zero multi-role-conflict fields, while reference audit claims must expose incomplete keyword evidence separately from implementation status.
- T02 field-use report regression: the generated integration report must list vehicle/stack fields separately from durability DOCX fields, show `analysis_input`, `context_or_cross_check`, `catalog_only`, unclassified and conflict counts, and must not imply that every source field becomes a KPI.

## Manual browser acceptance

- Load `http://127.0.0.1:4173` and verify demo data appears without console errors.
- Import a CSV with the documented columns and verify file name and row count update.
- Change a threshold and click “应用阈值并重新分析”; verdict and issue list must update.
- Download both Markdown and JSON; verify files are non-empty.
- Click “生成报告初稿”; verify the structured-evidence draft appears and the verdict is unchanged.
- Click “中文/单位样本”; verify `字段映射 8/8` and the unit-conversion indicator appear.
- Click “载入演示基线并对比”; verify `PASS → FAIL`, KPI deltas, and new risks appear.
- Switch to the fuel-cell profile; verify thresholds and AI/report profile provenance change, then edit one value and verify `custom` mode.
- Save two samples; verify the second save compares with the previous summary and `2 条摘要` remains after refresh.
- Resize to mobile width; verify the report and controls remain usable.
- For the v3.5.3 vehicle panel, select different left/right signals and verify independent labels/scales; import two files and verify the chart visibly breaks at the session boundary. This real-browser/Excel/WPS acceptance remains pending until the enterprise target environment is available.
- For the v3.5.4 stack panel, verify that every eligible stable interval is listed, the default is the last eligible interval, and selecting another option records manual selection in the result/report/Excel processing log. Automated regression coverage passes; real large-stack browser and Excel/WPS acceptance remains pending until the enterprise target environment is available.
- For the declared-batch panel, import two or more CSV files, upload a matching enterprise declaration JSON, and verify the status, sampling summary, per-file timestamp state and boundary issue codes appear without raw identifiers. Real browser click/fixture upload remains pending because the Ki Mac private-LAN path timed out in this run.
