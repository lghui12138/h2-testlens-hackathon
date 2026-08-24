# Local analysis API

The prototype binds to loopback and exposes an optional integration endpoint:

`POST /api/analyze`

Request JSON:

```json
{
  "csv": "timestamp_s,phase,...\\n0,idle,...",
  "fileName": "test-run.csv",
  "config": { "profileId": "electrolyzer-demo", "evaluationMode": "risk_screening" },
  "includeReport": true
}
```

## POST /api/ai-draft

The browser may submit the redacted evidence bundle used for local drafting. The server ignores client-supplied endpoint, model, and API-key fields. Remote drafting is attempted only when server environment variables provide H2_AI_ENDPOINT, H2_AI_API_KEY and an allowlisted hostname in H2_AI_ALLOWED_HOSTS; the endpoint must use HTTPS. Upstream requests abort after 15 seconds and response bytes are capped at 1 MiB before JSON parsing. Any missing or invalid configuration, timeout, oversize response, network error, or grounding failure returns the local evidence draft with a machine-readable fallbackReason. This route is local/approved-internal integration only and is not an authenticated public AI proxy.

## metricTrace contract

Public analyze, batch, compare, JSON, Markdown, XLSX and AI evidence surfaces may include metricTrace with schemaVersion h2-testlens.metric-trace.v1. Each entry carries canonical sourceFields, an opaque metric evidenceId, sourceHash/status, evidenceClass, a derivation label, and file-token/row-range locators. Raw rows, file names and raw values are excluded. A missing or malformed source hash is reported as unbound; metricTrace is a reproducibility aid and never proves standard conformity, laboratory competence or enterprise release approval.

When an imported profile declares standard references and a method source, the API and browser profile-import paths require the compact repository-backed standard-evidence-ledger.v1 artifact; a missing or mismatched evidence ID/source/locator binding fails profile import instead of silently becoming a standard-ready profile.

The response contains structured `quality`, `schema`, `metrics`, `compliance`, `workflow`, `issues`, `verdict`, and optional `reportMarkdown`. `evaluationMode` is explicit in the analyzed configuration: `descriptive_only` is descriptive statistics/evidence only, `risk_screening` is configurable engineering screening, and `acceptance` is reserved for an enterprise-approved profile with its own evidence contract. In `descriptive_only`, the response uses `verdict: "DESCRIPTIVE"`, `evaluation.decisionStatus: "NOT_RUN"`, `evaluation.thresholdEvaluation: "NOT_RUN"`, and a non-ready `releaseGate` with `ANALYSIS_DRAFT`; observations must not be read as threshold, safety, conformity or release decisions. Enterprise vehicle and stack adapters add a bounded `dataset` summary without raw rows. Parameter workbooks are intentionally a browser-side import/export workflow; the API does not accept XLSX bytes. Peak temperature/pressure/leak metrics include `*AtS` timestamp arrays; performance metrics include `hydrogenVolumeNl`, `energyConsumedWh`, `specificEnergyKWhPerNm3`, and `minimumHydrogenPurityPct`. When a profile declares phases, `phaseCoverage` reports aliases/counts/durations and `phaseMetrics.phases` reports per-phase trapezoid-integrated `durationS`, `energyConsumedWh`, `hydrogenVolumeNl`, `specificEnergyKWhPerNm3`, `powerRangeW`, and ramp rates; `compliance.missingPhaseMetrics` remains fail-closed. `requiredPhaseMetrics` and `phaseAcceptanceRules` are profile-controlled and do not invent standard limits. Canonical mappings also support gas temperature/pressure, ambient temperature/humidity/pressure, and raw `power_w`; common conversions include `m³/h→SLPM`, `kPa/MPa/Pa→bar`, `bar/MPa/Pa→kPa`, `kW→W`, and `°F→°C`. When present, raw `power_w` is preferred for energy/KPI integration and `metrics.powerCrossCheck` reports a bounded comparison with voltage×current; no consistency limit is invented. If a stack has no raw power column, the adapter may expose explicitly labeled derived current×voltage KPI evidence, but a profile `requiredMeasurements: ['power_w']` still fails closed and `schema.mapping.power_w` remains missing. Profile `requiredMeasurements` can fail closed when a required measurement is absent, and `acquisitionRequirements` / `preCheckRequirements` can additionally require structured `testMetadata.acquisitionRecord` and `testMetadata.preCheckItems` evidence. Profiles may also declare `requiredTestStages`, `testConditionRequirements`, `measurementMethodRequirements`, and `efficiencyRequirement`; these require structured `testStages`, `testConditions`, `measurementMethodRecords`, and an `efficiencyRecord` or mapped measured `efficiency_pct`. Efficiency is never inferred from energy/flow: it must carry an enterprise formula reference and, for an approved result record, a result evidence reference. The acquisition record carries only enterprise-supplied evidence such as sampling frequency, synchronization reference, channel id/unit and evidence reference; the analyzer does not infer a sampling-rate limit or safety result. The public response exposes readiness summaries and counts, not the submitted record values. Threshold/acceptance issues include time references when available. Raw `rows`, metadata values, durability report bodies, and parameter workbook contents are deliberately removed or summarized in public API responses; metadata presence flags remain. The local API accepts request bodies up to 64 MB; larger TXT files should use browser-local analysis. The endpoint is for local/approved internal integration only; it is not an authenticated public service.

## `POST /api/analyze-batch`

按企业声明的 `testRunId/sessionGroup` 汇总多个 CSV。此入口只接受 CSV 文本；XLSX/DOCX/TXT 应先由本地 watcher 或浏览器适配器解析。请求必须同时提供批次声明和文件内容：

```json
{
  "declaration": {
    "version": "h2-testlens.batch-declaration.v1",
    "groups": [{
      "id": "TR-2026-001-session-01",
      "testRunId": "TR-2026-001",
      "sessionGroup": "SG-01",
      "files": ["part-001.csv", "part-002.csv"],
      "fileOrder": ["part-001.csv", "part-002.csv"],
      "clockReference": "DAQ-CLOCK-01",
      "samplingIntervalS": 5,
      "samplingTolerancePct": 5,
      "restartBoundaries": ["part-002.csv"]
    }]
  },
  "files": [{"name": "part-001.csv", "csv": "timestamp_s,..."}, {"name": "part-002.csv", "csv": "timestamp_s,..."}],
  "includeReport": true
}
```

声明缺少文件、时钟、采样或重启边界字段时返回 HTTP 422。通过声明结构校验后，系统还会用每个文件进入分析器后的规范化时间戳做批次观测核对：单文件必须有至少两个有效且严格递增的时间戳；跨文件时间重叠/倒退必须对应 `restartBoundaries`；声明采样间隔会与实际中位间隔比较。`samplingTolerancePct` 是可选的企业提供容差，示例中的 5% 只是配置示例，不是 GB/T/ISO 限值；未提供容差时只报告观测差异，非零差异会进入 `NOT_READY`，系统不猜默认容差。

每个文件仍保留独立 `session_id`，不会自动把文件尾首记录拼成连续试验；返回的 `batchAggregation.status` 固定为 `descriptive_only`，另以 `batchAggregation.observation.status` 返回 `ready` 或 `not_ready`。观测对象包含每文件的时间戳数量、首末时间、严格递增状态、实际中位采样间隔，以及跨文件关系和有限的 `issueCodes`；它仍不产生标准符合性、认证或放行结论。公开响应只保留文件名/哈希存在性和证据计数，不返回原始行、声明敏感值或问题证据原文。CLI watcher 可使用同一 JSON：`node scripts/batch-watch.mjs --dir INPUT_DIR --batch-declaration config/batch-declaration.example.json --once`。

## `POST /api/feishu-alert`

This endpoint is available only on an approved local/internal server. It reads `H2_FEISHU_WEBHOOK_URL` and optional `H2_FEISHU_SECRET` from the server environment; the browser never supplies or stores the server secret. The request contains only `verdict`, target-power summary and bounded issue evidence. If the environment variable is absent, the endpoint returns `503 feishu_not_configured` and does not send anything. Configure the enterprise V2 bot webhook only after its Feishu group, keyword/IP/signature policies and recipients have been approved.

If an imported enterprise field mapping does not match the uploaded headers, the analyzer may use a generic alias fallback but emits `MAPPING_OVERRIDE_MISSING` as a warning; the mismatch is never silent.

For batch comparison, use `POST /api/compare` with `baselineCsv`, `currentCsv`, optional file names/config, and `includeReport`. The response contains two public analyses plus `comparison` (verdict transition, KPI deltas, new/resolved risks) and an optional comparison-aware Markdown report; neither analysis contains raw rows.

For a durability batch, the public `dataset.crossReportSummary` is a descriptive-only summary when at least two reports are supplied. It contains `status: "descriptive_only"`, `reportCount`, `orderingBasis`, `completeStartTimeEvidence`, `resultCounts`, and `byTargetPower`. Each `byTargetPower` item contains the report count and first/last derived values for average cell voltage and deviation, their descriptive deltas, and the maximum observed average deviation. The internal per-report `series` is removed from the public response, as are report bodies and metadata values. This summary does not validate durability methods, cycle equivalence, statistical significance, enterprise acceptance limits, or any GB/T/ISO conformity conclusion.

Instead of a hand-built `config`, both endpoints accept `profilePackage` plus `profileId` using the same `h2-testlens.profile.v1` JSON package as the browser. The server validates it, selects the profile, and applies its thresholds, scope, `evaluationMode`, instrument/report requirements, acceptance rules, workflow sequence, approval evidence, method implementation evidence, and field mapping atomically; the batch watcher preserves the same `evaluationMode` when it loads a profile from disk. An `approved` profile must bind `approverId`, `approvalDate`, `approvalRef`, a matching `profileRevision`, and `profileRevisionRef`. A profile declaring `FULL_METHOD_IMPLEMENTED` with standard references must additionally provide `methodImplementationEvidence` with method/source references, non-partial coverage items, verifier/date/reference, and `openGaps: []`, plus enterprise acceptance rules, instrument requirements, `uncertaintyModelRequired: true`, and a valid uncertainty model; invalid packages return HTTP 422.

Profiles may additionally declare `methodSource`, `workflowSequence`, `testSystemRequirements`, `environmentConditionRequirements`, `phaseResultRequirements`, and per-method `measurementFields`. These require structured `testMetadata.testStages`, `testMetadata.testSystemEvidence`, `testMetadata.environmentConditions`, `testMetadata.measurementMethodRecords`, and `testMetadata.phaseResults` records when configured. Each `workflowSequence` test-stage step is checked by its own stage id; an aggregate stage pass cannot mask a missing or incomplete stage. Report profiles can require separate `operator` and `operatorQualification` fields. `traceabilityRequirements` can require `testMetadata.traceability` fields `testRunId`, `deviceId`, `testType`, `testDate`, `cellCount`, `activeAreaCm2` and `evidenceRef`; `editLogRequirements` can require `testMetadata.editLog` entries with field, old/new value summaries, operator, timestamp, reason and evidence reference. For approved profiles, missing or malformed declared traceability/edit-log evidence keeps the analysis `NOT_READY`. Phase-result records reference computed generic phase KPIs; they do not supply or infer standard durations, ramp rates, precision, efficiency equations, or acceptance limits. Public API responses expose only status/count evidence summaries and method-source locator metadata, not submitted evidence values; method implementation, traceability and edit-log evidence are also reduced to readiness, counts and missing-item summaries.

The release repository also keeps a standards evidence ledger under `.research/ignite_t02_standards_20260821/`. Its `sources.jsonl`, `evidence.jsonl`, and `claims.jsonl` files are checked as a closed reference graph. Runtime profile import requires each declared `methodSource` to include `evidenceIds` that resolve to ledger rows with the same `sourceId`, `locator`, and `evidenceType`; it also requires every declared `standardRefs[]` item to carry its own `evidenceSourceId/evidenceIds` binding to the corresponding ledger source. This proves repository traceability of the cited public reference, not the full standard text or enterprise approval.

Do not retry an HTTP 422 by silently dropping the profile package: fix the package or field mapping first. The API intentionally refuses to fall back to default thresholds at this boundary. Public analysis responses expose approval evidence status/presence only; they do not expose approver, work-order, or revision-reference values.

For durability batches, `dataset.crossReportSummary.comparabilityAudit` is an additional descriptive screen. It reports only `auditStatus`, `comparable`, check statuses/counts, complete end-time evidence, gap/overlap counts and bounded issue codes such as `DURABILITY_COMPARABILITY_STACK_MODEL_MISMATCH`; it does not expose report metadata values and does not prove method or cycle equivalence, statistical validity, enterprise acceptance or any GB/T/ISO conformity.

Run the smoke check with a disposable port:

```bash
npm run smoke:api
```
