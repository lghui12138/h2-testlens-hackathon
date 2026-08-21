# Test Plan

## Automated

Run `npm test`.

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
- Load the example enterprise JSON package; verify organization, imported profile, and `字段映射 8/8` appear without console errors.
- Expand “查看字段映射证据”; verify canonical fields, raw headers, and conversion labels are visible with zero warnings for the matched example package.
- Generate the report draft, download Markdown and JSON, and verify the downloaded artifacts contain the structured-evidence draft and rule analysis.
- `npm run package:submission` runs readiness before packaging and produces a non-empty zip containing the runnable app and submission docs.
- `npm run smoke:api` confirms `/api/analyze` and `/api/compare` return structured results/reports without raw `rows`.

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
