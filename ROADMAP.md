# H₂ TestLens Roadmap

| Phase | Entry / exit criteria | Verification | Status | Notes |
|---|---|---|---|---|
| 0. Scope | T02 chosen; user problem and safety boundary recorded | Review `docs/REQUIREMENT_SPEC.md` | PASS | Prototype uses local APFS workspace; no external-disk access |
| 1. Design | Demo flow, surfaces, and source of truth fixed | Review `docs/IMPLEMENTATION_PLAN.md` | PASS | Analyzer is source of truth for metrics and verdict |
| 2. Build | UI, analyzer, server, sample data, field mapping table, official standards references, compliance gate, test-plan/acquisition/pre-check/environment/uncertainty/raw-reference/instrument-accuracy metadata, structured acquisition/pre-check/test-stage/test-condition/measurement-method/efficiency evidence requirements, ordered workflowSequence, independent operator qualification, measurement-field coverage, method-source locator, test-system composition, environment-condition and phase-result evidence gates, requiredPhases, raw `power_w` measurement support, power cross-check, performance metrics, configurable requiredMeasurements/acceptanceCriteria, browser SHA-256 provenance, optional enterprise uncertainty model, profile audit CLI, profiles, workflow readiness checklist, history, batch comparison, timestamp evidence, structured report drafts, guarded adapter, offline evaluation, submission brief, validated JSON package import, package-aware analyze/compare APIs, mapping-miss warning, invalid-package 422 boundary, integrity-checked zip/checksum package, large-file status, Worker analysis fallback, display sampling, all-signal descriptive statistics, multi-format multi-file browser input, reference-only/blocked-binary boundaries, shared input-safety boundary, explicit-BOM UTF-16 text compatibility, lazy browser engines, public enterprise panel parity, XLSX empty-header filtering, approval-evidence binding, standard-reference provenance binding, method-implementation evidence, full-method profile prerequisite gate, durability field/metric usage ledgers, declaration-gated batch aggregation, batch watcher CLI replay, batch observation gate, browser declared-batch panel parity, real enterprise XLSX 8/8 worksheet evidence, configurable relative-stability description mode, object traceability and manual edit-log evidence gates, durability cross-report comparability screening, reference-content cross-link evidence, source-integrity shape and drift replay, standards-profile mapping regression, field-use matrix regression, evaluation-mode gate, T02 descriptive profile package, submission evidence gate, generated full-package T02 integration report, formula provenance review gate, and pre-parser active-content blocking | `npm test` + `npm run eval:ai` + clean APFS staging `npm run build` | PARTIAL | v3.5.34 code, tests, T02 evidence, static preparation and package gates pass; clean locked-dependency staging must provide the build proof, while the original worktree remains blocked by local build/typecheck hangs. |
| 3. Review | Behavior, profiles, history persistence, JSON package import, visible mapping table, standards/compliance gate, workflow checklist, metadata form, structured acquisition/pre-check/test-system/environment/phase-result evidence, ordered per-stage workflow, operator qualification, measurement-field coverage, API脱敏/批次对比/profile package/422, mapping miss visibility, timestamp evidence, performance integration, raw-power precedence and cross-check, phase coverage, report wording, AI fallback/guard/eval, exports, legacy schema, baseline comparison, auditable stable-interval selection, large-file status, display sampling, Worker asset checks, profile dataset scope, public profile parity, static/Vinext multi-format input parity, reference-only/blocked-binary boundaries, shared batch input-safety behavior, usage-ledger evidence, durability field/metric ledger, field-use matrix evidence, approval-evidence binding, standard-reference provenance binding, method-implementation evidence, full-method profile prerequisite gate, evaluation-mode boundary, T02 profile parity, declared batch validation, batch observation, browser declared-batch panel, batch watcher CLI replay, real enterprise XLSX evidence, reference-content cross-link evidence, source-integrity shape and drift replay, standards-profile mapping regression, formula review and active-content rejection | API smoke + batch CLI replay + static Pages preparation + clean APFS staging build + public HTML smoke + package integrity | PARTIAL | v3.5.34 automated tests/API/static/package gates pass; clean staging build is the remaining machine gate, while real enterprise browser timing, Excel/WPS acceptance, human parallel validation and formal rollout remain open |
| 4. Delivery | Submission narrative, brief, readiness check, standards ledger, API smoke, integrity-checked zip/checksum package, anonymous public access, independent GitHub repository/Pages workflow, and hosted production version complete | Sites production deployment + public-page acceptance + package checksum | PARTIAL | v3.5.34 package/checksum and static preparation pass; public-page acceptance, enterprise browser/Excel/WPS acceptance, human parallel validation, approved profile/data and formal rollout remain open |

## v3.5.37 current continuation evidence

- Enterprise adapter compliance now preserves standard-reference readiness, method source, standard dates, full-method prerequisites and the same non-certification boundary already used by the generic analyzer.
- Vehicle fractional time-only rollover and cross-session pseudo-duration defects are closed; stack target points now fail closed on invalid timestamp quality, repeated current conditions use enabled target fields for disambiguation, and formal power acceptance requires an original power channel.
- Static webpage and Next/Vinext App now expose the same rendered evidence controls and an explicit non-native-app boundary; the rendered contract is regression-tested.
- Enterprise Markdown reports and the browser report preview expose standard references, method execution status and release-gate status; they do not declare standard conformity.
- Verification artifacts: v3.5.37 T02 coverage/reference/integration reports; new per-cell, excluded-interval and parameter-formula regressions; full submission gates remain required before packaging.

## 2026-08-24 current continuation evidence · field-value diagnostics

- Change: vehicle and stack adapters now preserve per-signal numeric coverage, missing/non-numeric mix, negative-value count, zero-dominance, unique-value count and semantic-review reasons; raw values are never silently filtered.
- Real T02 spot check: Qingchuan stack `38,257 × 127` produced `14` analysis-field review signals and `37,600` duplicate timestamps; vehicle sample `5,310 × 46` produced `5` review signals, including all-zero voltage/power summaries and all-negative `FC_MinCellVoltage`.
- Gate: `npm test` passed `409/409`; Node syntax checks and `git diff --check` passed. Full submission/Pages gates remain required before delivery.
- Residual: negative/zero values remain unresolved until the enterprise supplies field semantics, units, device-state definitions and invalid-code tables; the diagnostic is evidence triage, not a conformity or safety conclusion.

## 2026-08-24 current continuation evidence · time-gap-aware integration

- Surfaces: analyzer source of truth, generic phase metrics, uncertainty propagation, browser calculation-summary UI, static/Vinext parity, regression tests, GitHub Pages workflow and round log.
- Change: when `dataQualityRequirements.maxIntervalS` or `maxIntervalMultiplier` yields a gap limit, generic and phase trapezoid integration skips intervals above that limit; the skipped counts remain visible in `metrics.integrationEvidence` and the UI summary.
- Gate: `node --test tests/analyzer.test.mjs` passed 104/104; full `npm test`, `npm run check:submission`, Pages preparation, cloud TypeScript/build and public deployment remain required before the commit closes this continuation.
- Residual: profiles without an explicitly declared gap limit keep the previous descriptive integration behavior; formal enterprise acceptance still requires approved sampling rules, uncertainty budget and human review.

## 2026-08-24 current continuation evidence · session-aware generic analysis

- Change: generic quality, phase summaries, phase metrics, trapezoid integration and uncertainty propagation now respect `session_id`/`source_file` boundaries; a file reset is not treated as a negative interval or a continuous test.
- Gate: `node --test tests/analyzer.test.mjs` passed 105/105 after adding the two-file reset regression; full suite and cloud Pages gate remain required for delivery.
- Residual: enterprise adapters already preserve their own source-file/session contracts; formal cross-file aggregation still requires an enterprise batch declaration and remains descriptive_only without one.

## 2026-08-24 current continuation evidence · public T02 coverage card

- Change: static Pages and Vinext App now expose the versioned T02 file-use boundary directly in the dashboard: 198 total, 190 processed, 6 reference-only, 1 blocked binary, 1 declared no-upload, 2,262,283 processed rows/power points, and 0 formal conformity claims.
- Gate: verify the card and audit link in `src/index.html`, `app/page.tsx`, `_site/index.html`, and the current audit JSON; responsive 2-column mobile layout is tokenized in `src/styles.css`.
- Residual: counts are versioned audit evidence, not a claim that every source field enters a KPI or that the resulting profile satisfies any standard.

## 2026-08-24 current continuation evidence · session duration semantics

- Change: generic `metrics.durationS` now sums per-session timestamp spans and exposes `sessionCount/sessionDurationS`; it no longer reports only the global range when files restart their clocks.
- Gate: the two-file session regression passes with `sessionCount=2`, `durationS=2`, separate integrations, and the complete test/submission gates remain required.
- Residual: duration is observed timestamp span, not proof of uninterrupted test execution; declared batch boundaries and enterprise test records remain necessary for formal interpretation.

## 2026-08-24 current continuation evidence · standards boundary matrix

- Change: added `docs/STANDARD_BOUNDARY_MATRIX.md` and linked it from both public browser surfaces; the matrix separates product mapping from missing method, safety, laboratory, and enterprise-acceptance evidence.
- Gate: the matrix is required by `scripts/submission-check.mjs`; static/Vinext parity and the cloud Pages release gate must pass before delivery.
- Residual: the matrix improves truthful disclosure; it does not close the external evidence needed for formal conformity or certification.

## 2026-08-24 current continuation evidence · phase integration fail-closed

- Change: phase energy/volume/specific-energy outputs become null with explicit partial status when a declared gap, session boundary, interruption, non-positive interval or missing input prevents a complete phase integral.
- Gate: phase-gap regression must pass together with the full 403-test/120-check gate; UI phase status must show “缺口阻断” rather than “已计算”.
- Residual: global descriptive integrations retain bounded evidence for exploration; formal phase conclusions still require enterprise-approved data-quality and acceptance rules.

## 2026-08-24 current continuation evidence · independent phase inputs

- Change: phase energy and hydrogen-volume gates are independent; missing flow no longer invalidates a valid energy integral, while specific energy remains blocked until both are complete.
- Gate: analyzer regression passes with a two-row power-only phase and reports `energyConsumedWh` plus `partial_input` status.
- Residual: this improves metric availability but does not infer missing flow, efficiency, acceptance limits or standard compliance.

## 2026-08-24 current continuation evidence · report phase evidence

- Change: Markdown phase summaries now include integration status, skipped sampling-gap count and skipped session-boundary count.
- Gate: the phase-gap regression asserts `积分状态 partial_gap`; full test/submission/Pages gates remain required.
- Residual: report visibility is improved, but a formal method report still requires enterprise-approved evidence and sign-off.

## 2026-08-24 current continuation evidence · blocked binary boundary

- Change: verified the one T02 `blocked_binary` file is genuinely non-text/binary and kept the public page explanation fail-closed: hash retained, rows not fabricated, no test conclusion generated.
- Gate: `file`/byte inspection, current coverage audit record, browser surface parity and full submission gates pass.
- Residual: parsing requires an enterprise-supplied format/decoder; no unsafe guess or private raw-file copy is introduced.

## 2026-08-24 current continuation evidence · binary reason contract

- Change: `src/input-safety.mjs` now returns a machine-readable binary reason and T02 coverage replay records it; browser and batch-watch preserve the same reason.
- Gate: input-safety regression, real T02 coverage replay, source integrity 198/198 and full submission gates pass.
- Residual: a reason code explains why parsing stopped; it does not make the file parseable or establish enterprise format approval.

## 2026-08-24 current continuation evidence · malformed text fail-closed

- Change: decoders reject Unicode replacement characters with `decode_replacement_character` instead of passing lossy text to the CSV/TSV parser.
- Gate: malformed UTF-8 input-safety regression plus full test/submission/Pages gates must pass.
- Residual: valid enterprise encodings still require an explicit/approved decoder; this guard prevents silent corruption but does not infer encoding.

## 2026-08-24 current continuation evidence · Pages certificate status

- Change: queried GitHub Pages configuration and attempted HTTPS enforcement; GitHub returned `certificate does not exist yet`, so deployment docs now state the external certificate dependency without changing DNS or local network state.
- Gate: GitHub Actions/Pages deployment remains green and the repository/project Pages URL remains public; HTTPS enforcement is explicitly not claimed.
- Residual: certificate provisioning requires GitHub/domain external state and cannot be closed by repository code alone.

## 2026-08-24 current continuation evidence · public share metadata

- Change: public static/App surfaces now carry project description, canonical/project URL, Open Graph/Twitter metadata and an instrument-themed `og-card.svg`; the Pages preparation step copies the card to `_site`.
- Gate: static/App metadata parity test, submission gate, and Pages artifact check pass; metadata describes the prototype and its boundaries, not standard compliance.
- Residual: social crawlers and custom-domain HTTPS behavior remain external platform concerns.

## 2026-08-24 current continuation evidence · dynamic coverage summary

- Change: coverage audit writes the versioned public summary JSON; both browser surfaces read it at startup, while hard-coded markup remains only an offline fallback.
- Gate: source/public summary parity, static/App coverage card tests, submission gate and Pages artifact checks must pass.
- Residual: summary is bounded audit metadata and never exposes raw enterprise rows or turns processed counts into conformity claims.

## v3.5.34 current continuation evidence

 - Added an explicit `evaluationMode` contract: `descriptive_only`, `risk_screening`, and `acceptance`. The three T02 example profiles are dataset-scoped, unapproved, `descriptive_only`, and carry `thresholds: null`; they cannot produce threshold, acceptance, safety or release decisions.
 - In `descriptive_only`, threshold-like observations remain informational, the verdict is `DESCRIPTIVE`, decision fields are `NOT_RUN`, and the release gate stays `ANALYSIS_DRAFT`. Reports and local evidence drafts state that the result is not a conformity, certification or product-release conclusion.
 - The T02 profile package is available at `config/t02-profile.example.json` and `public/config/t02-profile.example.json`; the static and Vinext surfaces expose loading and downloading this bounded package.
 - Fresh v3.5.34 T02 evidence: 198/198 files, 190 processed, 6 reference-only, 1 blocked binary, 1 declared no-upload, 2,262,283 processed rows/power points, 198/198 usage ledgers, 7/7 reference cross-links, 21/21 keyword-complete claims, 0 duplicate processed hashes and 0 formal conformity claims; source integrity is 198/198 unchanged. The real XLSX workbook records 6,572/6,572 cached formula cells and requires human formula-review evidence for acceptance mode. The 170 vehicle files also produce 15,281 descriptive dynamic events, with 3,727 settled response-window observations, 11,554 unsettled/insufficient observations and 0 configured sampling gaps; events remain source-file/session scoped.
 - Verification gate: `npm test` 128/128, `npm run check:submission` 119/119, `npm run eval:ai` 4/4, API smoke, enterprise and T02 profile audits, T02 coverage/reference/report/integrity pass. API and batch-watcher profile routing preserve `descriptive_only`. Clean internal-APFS package smoke passes install, tests, typecheck, Vinext build, start and HTTP probe; the original worktree direct build/typecheck remains a local cloud-placeholder hang.
 - The source-data boundary remains 198 files with raw enterprise files excluded from the repository and package. Formal standards compliance, safety certification, laboratory competence, Excel/WPS acceptance and human parallel validation remain external gates.

## v3.5.34 delivery-chain continuation evidence

 - Fixed the submission archive boundary: the ZIP now contains the runnable server, lockfile, Vinext app/public/worker/build entries and deployment workflow, with required-entry checks for the same paths.
 - Added a clean extraction smoke to `npm run package:submission`: `npm ci --ignore-scripts`, `npm test`, `npm run typecheck`, `npm run build`, `npm start` and an HTTP homepage probe all run before the checksum sidecar is written.
 - Made `.openai/hosting.json` optional for package builds and removed the unnecessary `next` type import from the Vinext layout; the package no longer depends on local ignored project configuration or a missing `next` package.
 - Removed the unused npm `xlsx` direct dependency and regenerated `package-lock.json`; `npm audit --omit=dev` reports zero high/critical direct production dependency vulnerabilities. The vendored SheetJS 0.18.5 bundle remains explicitly documented as a controlled-input risk.
 - Final package smoke passed after extraction; current package checksum is intentionally kept only in the adjacent sidecar because the archive contains the completion documentation.

## v3.5.34 input-safety continuation evidence

 - The shared `src/excel-workflow.mjs` boundary now rejects parameter and time-series workbooks above 64 MiB before the vendored SheetJS parser is invoked. The limit is explicitly a resource-protection parameter, not a GB/T, ISO or enterprise acceptance limit; the real largest T02 workbook is about 2.6 MiB.
 - Browser import, T02 coverage replay and `batch-watch` all call the same workbook parser, so the guard is applied at their common source of truth. Oversized input returns a parser boundary with byte count and does not enter analysis.
 - Added regression coverage in `tests/input-safety.test.mjs` and submission checks for the source/documentation binding. Formal parser security remains open for ZIP bombs, malformed archives, formulas/macros, prototype pollution and ReDoS; the vendored bundle remains local/enterprise-input only.
 - Hardened the optional OpenAI hosting-copy plugin: a stale/cloud placeholder or clean extraction without `.openai/hosting.json` now skips the copy at bundle close instead of failing an otherwise valid Vinext build; the config remains opt-in by presence and is never packaged.

## v3.5.34 XLSX-container continuation evidence

 - Added a shared pre-SheetJS ZIP inspection for XLSX/XLSM: central-directory integrity, ZIP64 rejection, encryption rejection, supported store/deflate methods, 2048-entry cap, 256 MiB declared expansion cap and 200:1 compression-ratio cap.
 - Regression coverage now includes malformed ZIP, unsafe declared expansion and synthetic ZIP-bomb ratio cases; the existing real T02 workbook remains the compatibility gate. These controls are parser resource protection, not standard or enterprise acceptance rules.
 - Formula/macro, prototype-pollution, ReDoS and enterprise-approved isolated-parser validation remain open; no formal security certification is claimed.

## v3.5.31 historical continuation evidence

 - Implementation gate: approved profile packages now require standard-reference provenance: every reference has `id/title/uri/status`, the current `methodId` is bound to a reference, and approved profiles carry method source, scope/workflow evidence, standard status, publication date and effective date; malformed or inconsistent evidence fails package import.
 - Method boundary: `PUBLIC_SCOPE_MAPPING` remains a public-range/process mapping and does not claim complete method execution; a standard-referenced `FULL_METHOD_IMPLEMENTED` now also requires enterprise acceptance rules, instrument requirements and a valid uncertainty model, in addition to separate clause/step evidence with no open gaps.
 - Fresh T02 evidence is regenerated for v3.5.31: 198/198 files, 190 processed, 6 reference-only, 1 blocked binary, 1 declared no-upload, 2,262,283 processed rows/power points, 198/198 usage ledgers, 7/7 reference cross-links, 21/21 keyword-complete claims, 0 duplicate processed hashes and 0 formal conformity claims; source files remain outside the repository.
 - Delivery gates: `npm test` 115/115, `npm run check:submission` 107/107, AI grounding 4/4, API/profile smoke, GitHub Pages preparation, clean APFS staging Vinext build 5/5, source integrity 198/198 unchanged, and ZIP/checksum readback pass. Formal standards compliance and enterprise rollout remain open.

## v3.5.28 current continuation evidence

 - Implementation gate: the read-only source-integrity checker now validates audit root, declared record count, path uniqueness and every source file's size/SHA-256; any shape or file drift fails closed, and no raw enterprise content is parsed, copied or uploaded by this checker.
 - Fresh T02 evidence is regenerated for v3.5.28: 198/198 files, 190 processed, 6 reference-only, 1 blocked binary, 1 declared no-upload, 2,262,283 processed rows/power points, 198/198 usage ledgers, 7/7 reference-content cross-links, 21/21 keyword-complete claims, 0 duplicate processed hashes and 0 formal conformity claims. This is traceability strengthening, not standard conformity.
 - Versioned artifacts: `.research/ignite_t02_standards_20260821/t02_coverage_audit_v3.5.28.json`, `.research/ignite_t02_standards_20260821/t02_reference_audit_v3.5.28.json`, and `.research/ignite_t02_standards_20260821/t02_integration_report_v3.5.28.md`.
 - Delivery gates: `npm test` 110/110, `npm run check:submission` 101/101, AI grounding 4/4, API/profile smoke, source integrity 198/198 unchanged, static Pages preparation and ZIP/checksum readback pass. Clean APFS staging installed locked dependencies and completed Vinext 5/5 build stages; the original worktree still has local cloud placeholders.
 - Current package: `dist/h2-testlens-submission-v3.5.28.zip`; SHA-256 is kept in the adjacent sidecar so the archive does not contain a self-referential checksum. The archive includes current evidence only and excludes raw enterprise files.
 - Implementation gate: the generated T02 report now includes a field-use matrix that separates vehicle/stack fields from durability DOCX fields and reports zero unclassified or multi-role conflicts; `analysis_input`, `context_or_cross_check`, and `catalog_only` remain descriptive roles, not conformity claims.
 - Fresh versioned artifacts: `.research/ignite_t02_standards_20260821/t02_coverage_audit_v3.5.28.json`, `.research/ignite_t02_standards_20260821/t02_reference_audit_v3.5.28.json`, and `.research/ignite_t02_standards_20260821/t02_integration_report_v3.5.28.md`.
 - Current package: `dist/h2-testlens-submission-v3.5.28.zip`; SHA-256 is kept in the adjacent sidecar so the archive does not contain a self-referential checksum. The archive includes current evidence only and excludes raw enterprise files.

## v3.5.24 historical continuation evidence

- Implementation gate: `npm test` 104/104 after surfacing the real T02 eight-report durability comparability audit in the full-package Markdown report and adding the mismatch to the submission gate. The screen compares system name, stack model, step count, point count, target-power set, header set and report time relationships; it remains descriptive-only.
- Fresh T02 evidence: `198/198` files, `190 processed`, `6 reference-only`, `1 blocked binary`, `1 declared no-upload`, `2,262,283` processed rows/power points, `198/198` usage ledgers, `0` duplicate processed hashes, `0` formal conformity claims, and `21/21` complete reference keyword claims. The eight durability reports are `screened` but not comparable because the stack model differs; issue code: `DURABILITY_COMPARABILITY_STACK_MODEL_MISMATCH`.
- Versioned artifacts: `.research/ignite_t02_standards_20260821/t02_coverage_audit_v3.5.24.json`, `.research/ignite_t02_standards_20260821/t02_reference_audit_v3.5.24.json`, and `.research/ignite_t02_standards_20260821/t02_integration_report_v3.5.24.md`.

## v3.5.23 historical continuation evidence

- Implementation gate: `npm test` 103/103 after adding profile-controlled object traceability (`testRunId`, `deviceId`, `testType`, `testDate`, `cellCount`, `activeAreaCm2`, `evidenceRef`) and structured manual edit-log evidence. Approved profiles fail closed when either evidence contract is missing or malformed; public API/Markdown/Excel processing logs expose only bounded counts and status.
- The T02 coverage definition is unchanged: every source file remains classified by actual parser/usage boundary, and processed data remains descriptive evidence rather than standards conformity.
- Historical v3.5.23 package gates: `npm run check:submission` 92/92, `npm run eval:ai` 4/4, API smoke, profile audit, production build, Pages preparation and ZIP integrity/checksum readback all passed. The final package was `dist/h2-testlens-submission-v3.5.23.zip`; its exact SHA-256 was kept only in the adjacent `.sha256` sidecar to avoid self-reference.

## v3.5.22 historical continuation evidence

- Implementation gate: `npm test` 101/101 after separating raw `power_w` measurement readiness from derived current×voltage KPI evidence, tightening uncertainty propagation, adding configurable relative-stability description mode for settings-only parameter workbooks, adding explicit-BOM UTF-16 text compatibility, and generating a full-package T02 integration report from versioned audits.
- The T02 coverage definition is unchanged: every source file remains classified by actual parser/usage boundary, and processed data remains descriptive evidence rather than standards conformity.
- The existing table rows below retain the v3.5.18 phase record; this section is the current continuation override until the fresh replay and package gates close.
- Enterprise vehicle, stack and durability adapters now emit `uncertainty.metricDetails`, preserve direct-versus-derived power provenance, expose assumptions/boundaries, and block an approved profile when `uncertaintyModelRequired` lacks a valid calculated result. Missing raw-power uncertainty no longer falls back to the current×voltage chain; pooled cell-voltage standard deviation reports only its instrument-propagation component and records the Type A boundary. Markdown and Excel exports include dedicated uncertainty evidence.
- Current override evidence: `npm test` 101/101; `npm run check:submission` 92/92; `npm run eval:ai` 4/4; API smoke, profile audit, production build, Pages preparation and ZIP integrity all pass. T02 coverage is 198/198 with 190 processed and 2,262,283 rows/power points; reference audit is 7 files, 0 parser errors, 21/21 keyword-complete claims; the generated integration report contains 198 file-ledger rows. Final package: `/Users/kili/Documents/Codex/ignite-future-energy-hackathon/dist/h2-testlens-submission-v3.5.22.zip`; SHA-256 is recorded only in its adjacent `.sha256` sidecar.

## v3.5.18 historical continuation evidence

- v3.5.18 locks package 01's real XLSX evidence into the audit: 8/8 sheets parsed, 4 static matrices, 1,196 static channels, 185,089 valid points, 590 missing points, 24 factory-report checks, 27 polarization points, 1 stability point, 2 identity fields and 24 parameter-catalog rows. These are bounded traceability/descriptive outputs, not standard limits or release conclusions.

## v3.5.17 historical continuation evidence

- v3.5.17 strengthens the T02 completion proof: every processed vehicle/stack source field is required to belong to exactly one role, and the reference audit exposes keyword evidence completeness separately from implementation status. Current replay is 198/198 files, 2,262,283 processed rows/power points, field-role unclassified/conflict counts `0/0` for the 46/127/422-field unions, and reference claims `21 total / 21 keyword-complete`.

## v3.5.16 historical continuation evidence

- v3.5.16 connects the declared-batch observation source of truth to both browser surfaces. The panel validates the enterprise JSON declaration, runs actual timestamp/sampling/boundary observation against imported files, and renders only redacted `READY/NOT_READY` and descriptive-only evidence.

## v3.5.15 historical continuation evidence

- v3.5.15 keeps the v3.5.14 declaration-gated aggregation and adds canonical timestamp/strict-order checks, observed median interval vs declaration, optional enterprise tolerance, and cross-file overlap/rewind checks. Any observation failure is `NOT_READY`; summary status remains `descriptive_only` and per-file sessions are preserved.

## v3.5.14 historical continuation evidence

- v3.5.14 adds declaration-gated cross-file aggregation and a real `watch:batch --batch-declaration ... --once` CLI replay. Missing enterprise batch identity, clock, sampling, or restart-boundary evidence keeps aggregation unavailable; any declared result remains descriptive-only and preserves per-file sessions.

## v3.5.13 historical continuation evidence

- v3.5.13 moves binary text detection into `src/input-safety.mjs` and reuses it from the browser importer, T02 coverage audit and `watch:batch`; the batch manifest records `blocked_binary` and does not send the file to `analyzeRows`.

## v3.5.12 historical continuation evidence

- v3.5.12 adds the `methodImplementationEvidence` fail-closed gate. A profile may only claim `FULL_METHOD_IMPLEMENTED` when its method/source references, clause/step coverage, per-item implementation evidence, verifier/date/reference, and empty `openGaps` are all present and aligned with `methodId`/`revision`; public API and profile audit expose readiness/count summaries only.
- Direct and package-based regression coverage proves incomplete full-method declarations remain `NOT_READY`/`ANALYSIS_DRAFT`; `PUBLIC_SCOPE_MAPPING` and `ENTERPRISE_PROFILE_REQUIRED` retain the `STANDARD_EVIDENCE_PACKAGE` boundary.

## v3.5.11 historical continuation evidence

- v3.5.11 adds fail-closed approval evidence binding: an `approved` profile must carry approver, approval date/reference, matching profile revision, and revision evidence reference; missing or mismatched evidence keeps analysis `NOT_READY` and blocks a human-review package.
- Fresh T02 coverage and reference artifacts for this revision are generated by the versioned commands in `docs/ENTERPRISE_DATA_INTEGRATION.md`; the counts must be read from the new audit rather than copied from v3.5.10.

## v3.5.10 historical continuation evidence

- 修复真实 XLSX 时序读取边界：空表头不再写入 `row[""]`，不会被字段目录或使用台账误计为信号；新增回归覆盖并通过。
- 真实 T02 重放证据：`.research/ignite_t02_standards_20260821/t02_coverage_audit_v3.5.10.json` 为 `198/198` 文件、`190 processed / 6 reference_only / 1 blocked_binary / 1 declared_no_upload`、`2,262,283` 行/功率点、198/198 使用台账、正式符合性声明 `0`、重复 processed SHA-256 `0`；企业资料包 01 字段并集为 `422`，空字段名为 `0`。
- 本轮门控：`npm test` `80/80`、`npm run eval:ai` `4/4`、`npm run check:submission` `79/79`、profile audit、Pages 准备和 `git diff --check` 通过。
- `npm run build` 已在升级后的 Vinext/Cloudflare 插件链上通过五个生产构建阶段；构建耗时约 41 秒。`npx tsc --noEmit` 单独运行超过 3 分钟无输出后停止，不能把它误写成通过；生产构建成功不等于企业验收完成。
- 标准边界不变：这些证据证明资料覆盖、解析路径和 fail-closed 工程门，不证明 GB/T 45541-2025、GB/T 46104-2025、ISO 22734-1:2025 或 ISO/IEC 17025:2017 的完整符合性。

## v3.5.9 continuation evidence

- Vinext 页面与静态页面的入口合同已对齐：CSV/TXT/XLSX/DOCX 可多选导入，PDF 与需求型 DOCX 保留为 reference-only；阻断二进制文本只计入阻断状态，不再令整批导入失败。
- 浏览器按需加载 XLSX、JSZip、Mammoth，并在解析/参数导入/XLSX 导出前绑定对应引擎；公开 Vinext 页面补回企业数据适配面板、车辆/电堆专用统计和 XLSX 下载入口。
- 新增静态/Vinext 输入面测试；历史 v3.5.9 门为 `78/78` 测试、`76/76` 提交检查、AI `4/4`、API smoke、profile audit、`npx tsc --noEmit`、Node syntax、`npm run build` 和 4176 生产 HTML smoke 均通过。
- v3.5.9 真实 T02 重放：`.research/ignite_t02_standards_20260821/t02_coverage_audit_v3.5.9.json` 为 `198/198` 文件、`190 processed / 6 reference_only / 1 blocked_binary / 1 declared_no_upload`、`2,262,283` 行/功率点、重复 processed SHA-256 为 `0`；参考审计 `7` 份、解析错误 `0`。
- 当前仍不能把产品写成标准符合、认证或放行系统：企业批准 profile、完整试验执行、仪器精度/不确定度、安全验证、17025 能力证据、Excel/WPS 视觉验收与企业平行验证仍是外部门控。

## v3.5.8 continuation evidence

- 修正真实青川 127 列样例的字段语义：`阳极/阴极增湿罐水温度` 不再映射为入口露点；只有原始字段明确包含“露点”时才进入 `h2_dewpoint_c` / `air_dewpoint_c`。
- 新增 `循环水电导率（μS/cm）` 的结构化统计和来源映射；新增阳/阴极增湿罐水温、露点、流阻、冷却液温差和内阻的工程量摘要，输出到 UI、Markdown 和 Excel `工程量摘要`，没有企业限值时只作统计/核对，不自动判定。
- 回归门：`77/77` 测试通过；2026-08-22 已用真实资料重放覆盖审计，`198` 个文件在 `76.7s` 内完成，结果仍为 `190 processed / 6 reference_only / 1 blocked_binary / 1 declared_no_upload`，提交包门控随后重跑。
- 审计器同时增加每 25 个文件一次 heartbeat，并改为懒加载项目内已验证的浏览器版 Mammoth，避免 Node 版 Mammoth 顶层模块解析静默挂起；不改变 DOCX 解析或覆盖定义。
- 最终门控：`77/77` 测试、`4/4` AI grounding、`74/74` 提交检查、API smoke、profile audit 和 ZIP 完整性均通过；提交包为 `dist/h2-testlens-submission-v3.5.8.zip`，SHA-256 由同名 `.sha256` sidecar 记录。`vinext build` 仍因无输出挂起而未通过，不能把它写成构建成功。

## v3.5.2 continuation evidence

- v3.5.2 adds shared structured acquisition/pre-check/data-quality gates to enterprise adapters, canonical raw-power mapping for enterprise stack kW data, real phase-label handling, original-row continuity coverage, and declared enterprise phase metrics before release gating.

- Build/review gate: `68/68` tests, including full vehicle 46-column and stack 127-column coverage regressions, canonical kW→W power mapping, no-invented-phase and interrupted-phase coverage regressions, enterprise profile measurement/phase fail-closed regression, actual enterprise phase-metric computation, and structured enterprise acquisition/pre-check/data-quality gates.
- T02 actual parser audit: `198/198` files hashed and classified: `190 processed`, `6 reference_only`, `1 blocked_binary`, `1 declared_no_upload`. The processed count means the configured parser actually read the file and entered the corresponding adapter; it does not mean every field became a KPI or that any standard was satisfied.
- T02 batch audit: `2,262,283` processed rows; package-level aggregation covers 170 vehicle files, 12 stack files, and 8 durability DOCX files. Reference types and a descriptive cross-report durability first/last comparison are now recorded; cross-file time-series KPI merge, durability-method/cycle-equivalence validation, and enterprise acceptance parallel validation remain explicitly open. Evidence: `.research/ignite_t02_standards_20260821/t02_coverage_audit_v3.5.2.json`.
- Submission gate: `65/65` checks, AI grounding `4/4`, API smoke and profile audit passed.
- Delivery artifact: `/Users/kili/Documents/Codex/ignite-future-energy-hackathon/dist/h2-testlens-submission-v3.5.2.zip`; verify its SHA-256 only from the adjacent `.sha256` sidecar after packaging.
- External rollout remains open: approved profile, real anonymized data, enterprise acceptance rules, uncertainty budget, parallel validation, Excel/WPS acceptance, audit/sign-off system and safety evidence are still required. Keep `DEMO_ONLY`.

## v3.5.3 continuation evidence

- v3.5.3 retains the v3.5.2 evidence gates and adds source-file session boundaries to vehicle/stack time axes, prevents cross-file performance/platform/stability segment merging, and adds independently scaled vehicle left/right display signals with export/log evidence.
- Build/review gate: `70/70` tests, including dual-axis signal selection and cross-file session isolation regressions; API smoke, 65/65 submission checks, AI grounding 4/4, profile audit, static Pages preparation, Node syntax checks, and diff check pass.
- T02 audit counts remain `198/198`: `190 processed`, `6 reference_only`, `1 blocked_binary`, `1 declared_no_upload`; `2,262,283` processed rows/power points. The new session-aware logic is validated by synthetic multi-file regressions; durability-method/cycle-equivalence validation, Excel/WPS visual acceptance, and enterprise parallel validation remain open.
- v3.5.3 T02 replay artifact: `.research/ignite_t02_standards_20260821/t02_coverage_audit_v3.5.3.json` was generated from `/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手` with `198/198` files hashed and classified; duplicate processed SHA-256 count is `0`.
- v3.5.3 reference artifact: `.research/ignite_t02_standards_20260821/t02_reference_audit_v3.5.3.json` extracts and maps all seven non-time-series PDF/DOCX files (six `reference_only` plus one `declared_no_upload` brief); product background remains reference-only and no raw reference document is copied into the repository.
- Delivery artifact for this continuation: `/Users/kili/Documents/Codex/ignite-future-energy-hackathon/dist/h2-testlens-submission-v3.5.3.zip`; verify its SHA-256 only from the adjacent `.sha256` sidecar.

## v3.5.4 continuation evidence

- v3.5.4 adds the missing Qingchuan review loop: every stack platform keeps all eligible stable-interval candidates; the default remains the last eligible interval, while an engineer can choose another eligible interval in the page.
- The analyzer records `automaticSegmentId`, `requestedSegmentId`, `selectedSegmentId`, `selectionMode`, available candidates, and invalid-override fallback evidence. The same record is emitted in the public result, Markdown narrative, Excel `稳定区间` and `处理日志` sheets.
- Regression and delivery gate: `71/71` tests, `70/70` submission checks, AI grounding `4/4`, API smoke, profile audit, static Pages preparation, Node syntax checks, diff check, ZIP integrity, and checksum readback pass. Automatic selection, manual override, and invalid override fallback are covered by regression tests; the demo page passes responsive layout checks at 1440/768/375 CSS px with no horizontal overflow.
- The versioned delivery artifact for this continuation is generated only after the full gate: `/Users/kili/Documents/Codex/ignite-future-energy-hackathon/dist/h2-testlens-submission-v3.5.4.zip` with its adjacent `.sha256` sidecar.

## v3.5.5 continuation evidence

- v3.5.5 adds visible `aria-live` import/analysis status, event-loop yielding between file reads, a module Web Worker for analysis above 10,000 rows with main-thread fallback, and display-only chart sampling capped at 6,000 rows while preserving first/last points and source-session transitions.
- Unit and static gate: `72/72` tests and Node syntax checks pass; the sampler regression proves full analytical row count is retained by the source result while the display rows are bounded and session boundaries are visible.
- T02 evidence is replayed for v3.5.5 after the version bump: the expected `198` files remain `190 processed`, `6 reference_only`, `1 blocked_binary`, `1 declared_no_upload`, with `2,262,283` processed rows/power points and zero duplicate processed SHA-256 values.
- The versioned delivery artifact is generated only after the current gate: `/Users/kili/Documents/Codex/ignite-future-energy-hackathon/dist/h2-testlens-submission-v3.5.5.zip` with its adjacent `.sha256` sidecar. The archive includes `tests/analyzer.test.mjs` so post-unpack `npm test` is reproducible. Browser/Excel/WPS enterprise acceptance and formal standard compliance remain external gates.

## v3.5.6 continuation evidence

- v3.5.6 adds descriptive standard-deviation coverage for every cataloged enterprise signal, separates numeric/non-numeric/catalog-only coverage, and keeps full analytical rows separate from display-only chart sampling.
- The example PEM profile now declares `supportedDatasetTypes: ["generic"]`; enterprise stack and vehicle uploads are covered by a regression and fail closed with `BLOCKED_PROFILE_SCOPE` instead of reusing the electrolyzer profile.
- `config/enterprise-profile.example.json` and `public/config/enterprise-profile.example.json` are synchronized, and `npm run check:submission` enforces byte-level parity so the static and app deployments cannot silently load different rules.
- Current gate: `73/73` tests, `74/74` submission checks, AI grounding `4/4`, API smoke, profile audit, GitHub Pages preparation, syntax, diff, and parity checks pass. T02 evidence remains `198` files / `190 processed` / `6 reference_only` / `1 blocked_binary` / `1 declared_no_upload`, `2,262,283` rows/power points, and zero duplicate processed hashes. Formal standard compliance, Excel/WPS acceptance, and enterprise approval remain external gates.

## Current continuation evidence

- 无目标参数时，车辆按会话边界、实际电流连续性和描述性电流分箱发现 `inferred/descriptive_only` 候选运行区间；电堆按相同原则发现描述性候选电流区间。
- 正式目标路径未改变：车辆 `performancePoints`、电堆 `performancePoints` 只有在企业目标参数/目标工况有效时才生成；无目标时均保持 `0`，候选不进入符合性、极化或放行结论。
- 候选区间已进入页面、Markdown 报告、Excel `描述性候选区间` 和 `处理日志`，并保留来源会话、起止时间、持续时间、实际电流范围和分析性质。
- 当前回归门：`75/75` 测试通过；真实 T02 覆盖审计正在重放，完成后更新本段的包级候选数量和审计证据。

## v3.5.7 current delivery evidence

- 修复 GB/T 46104 流程模板重复声明“热启动结果”的配置缺陷，并新增内置 profile 阶段结果唯一性回归。
- 当前回归门：`76/76` 测试、`74/74` 提交检查、AI `4/4`、API smoke、profile audit 均通过；`vinext build` 曾无输出挂起，已停止该次构建，不能把构建视为通过。
- T02 v3.5.7 审计：198 个文件，190 processed、6 reference_only、1 blocked_binary、1 declared_no_upload；2,262,283 行/功率点；重复 processed SHA-256 为 0；7 份参考 PDF/DOCX 解析错误为 0。
- 交付包：`dist/h2-testlens-submission-v3.5.7.zip`，SHA-256 由相邻 `.sha256` sidecar 校验；标准符合性、企业批准、Excel/WPS 视觉验收和真实数据平行验证仍是外部门控。
