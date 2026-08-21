# Submission package

Run:

```bash
npm run package:submission
```

The command first runs `npm run check:submission`, which recursively runs the unit tests and offline AI grounding suite. Only after those checks pass does it create:

`dist/h2-testlens-submission-v2.4.0.zip`

The archive contains the runnable app, source, sample data, configuration-package example, AI evaluation, submission brief, and completion evidence. It intentionally excludes local browser history and downloaded reports.

The packaging command also writes a matching `.sha256` file beside the archive for handoff verification.

After unpacking:

```bash
npm test
npm run eval:ai
npm start
```
