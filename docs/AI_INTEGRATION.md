# Evidence-grounded AI integration

## Default behavior

No environment variable is required. Clicking “生成证据约束草稿” calls the local `/api/ai-draft` route, which produces a deterministic Chinese Markdown draft from the analyzer evidence. The browser sends the evidence bundle, including optional baseline comparison, not `rows`.

## Optional OpenAI-compatible gateway

Set these variables before starting the server:

```bash
H2_AI_ENDPOINT=http://your-approved-gateway/v1/chat/completions \
H2_AI_MODEL=your-approved-model \
H2_AI_API_KEY='provided-at-runtime' \
npm start
```

`H2_AI_API_KEY` is read only by `server.mjs`; it is never placed in browser JavaScript. The adapter uses a low temperature and a system instruction that forbids inventing facts, changing the verdict, or treating demo thresholds as enterprise safety standards.

Remote output is fail-closed before it reaches the UI: the adapter rejects empty/oversized drafts, missing current verdict, contradictory current verdict, or drafts with no numeric/issue evidence anchor. Any rejection returns the local evidence draft and a machine-readable `fallbackReason`.

Run `npm run eval:ai` for the offline grounding suite; see [`AI_EVAL.md`](AI_EVAL.md) for the fixtures and limits.

## Required evaluation before real submission

- Confirm the gateway is approved for the enterprise test data classification.
- Compare local and remote drafts against the same evidence bundle.
- Add a judgeable rubric: factual grounding, action usefulness, uncertainty disclosure, and latency.
- Keep the local fallback available for offline judging and failure recovery.
- Include the grounding guard in acceptance tests; a fluent but contradictory model response is a failed response, not a successful demo.
