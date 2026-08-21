# H₂ TestLens Roadmap

| Phase | Entry / exit criteria | Verification | Status | Notes |
|---|---|---|---|---|
| 0. Scope | T02 chosen; user problem and safety boundary recorded | Review `docs/REQUIREMENT_SPEC.md` | PASS | Prototype uses local APFS workspace; no external-disk access |
| 1. Design | Demo flow, surfaces, and source of truth fixed | Review `docs/IMPLEMENTATION_PLAN.md` | PASS | Analyzer is source of truth for metrics and verdict |
| 2. Build | UI, analyzer, server, sample data, field mapping table, official standards references, compliance gate, metadata form, profiles, history, batch comparison, timestamp evidence, AI-inclusive downloads, guarded AI adapter, offline evaluation, submission brief, validated JSON package import, package-aware analyze/compare APIs, mapping-miss warning, invalid-package 422 boundary, and integrity-checked submission zip/checksum present | `npm test` + `npm run eval:ai` | PASS | 17/17 tests and 4/4 AI fixtures passed |
| 3. Review | Behavior, profiles, history persistence, JSON package import, visible mapping table, standards/compliance gate, metadata form, API脱敏/批次对比/profile package/422, mapping miss visibility, timestamp evidence, AI fallback/guard/eval, AI-inclusive exports, legacy schema, and baseline comparison checked | Chrome DOM + API smoke | PASS | Full metadata still leaves unapproved profile DEMO_ONLY; official standards ledger packaged |
| 4. Delivery | Submission narrative, brief, readiness check, standards ledger, API smoke, and integrity-checked zip/checksum package complete | `npm run package:submission` | IN PROGRESS | v2.3 metadata gate form added; real enterprise gateway/data still pending |
