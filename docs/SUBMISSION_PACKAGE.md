# Submission package

Run:

```bash
npm run package:submission
```

The command first runs `npm run check:submission`, which recursively runs the unit tests and offline AI grounding suite. Only after those checks pass does it create:

`dist/h2-testlens-submission-v3.5.37.zip`

The verified SHA-256 is recorded in the adjacent `dist/h2-testlens-submission-v3.5.37.zip.sha256` sidecar. It is intentionally not repeated here because this document is itself included in the archive and would make an embedded checksum self-referential.

The archive contains the runnable app, source, tests, sample data, configuration-package example, AI evaluation, submission brief, the current `sources.jsonl`/`evidence.jsonl`/`claims.jsonl` reference graph, and current-version completion evidence. It intentionally excludes local browser history, downloaded reports, raw enterprise files, and historical audit snapshots; only the current T02 evidence and integration report are packaged.

The packaging command also writes a matching `.sha256` file beside the archive for handoff verification.

After unpacking:

```bash
npm ci --ignore-scripts
npm test
npm run typecheck
npm run build
npm run eval:ai
npm start
```

`npm run package:submission` performs the same checks in a temporary clean directory before writing the checksum. The archive contains no raw T02 enterprise files and no local `.openai/hosting.json`; a package build skips that optional hosting-copy plugin while retaining the normal Vinext/Cloudflare build path.
