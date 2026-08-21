# Local analysis API

The prototype binds to loopback and exposes an optional integration endpoint:

`POST /api/analyze`

Request JSON:

```json
{
  "csv": "timestamp_s,phase,...\\n0,idle,...",
  "fileName": "test-run.csv",
  "config": { "profileId": "electrolyzer-demo" },
  "includeReport": true
}
```

The response contains structured `quality`, `schema`, `metrics`, `issues`, `verdict`, and optional `reportMarkdown`. Peak temperature/pressure/leak metrics include `*AtS` timestamp arrays, and threshold issues include time references when available. Raw `rows` are deliberately removed from the API response. The endpoint is for local/approved internal integration only; it is not an authenticated public service.

If an imported enterprise field mapping does not match the uploaded headers, the analyzer may use a generic alias fallback but emits `MAPPING_OVERRIDE_MISSING` as a warning; the mismatch is never silent.

For batch comparison, use `POST /api/compare` with `baselineCsv`, `currentCsv`, optional file names/config, and `includeReport`. The response contains two public analyses plus `comparison` (verdict transition, KPI deltas, new/resolved risks) and an optional comparison-aware Markdown report; neither analysis contains raw rows.

Instead of a hand-built `config`, both endpoints accept `profilePackage` plus `profileId` using the same `h2-testlens.profile.v1` JSON package as the browser. The server validates it, selects the profile, and applies its thresholds and field mapping atomically; invalid packages return HTTP 422.

Do not retry an HTTP 422 by silently dropping the profile package: fix the package or field mapping first. The API intentionally refuses to fall back to default thresholds at this boundary.

Run the smoke check with a disposable port:

```bash
npm run smoke:api
```
