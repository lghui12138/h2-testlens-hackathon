# AI grounding evaluation

Run:

```bash
npm run eval:ai
```

The offline suite uses the same analyzed hydrogen test evidence as the demo and four deterministic model-response fixtures:

1. grounded response with the correct `FAIL` verdict and a pressure anchor;
2. conflicting `PASS` response;
3. correct verdict but no numeric/issue evidence anchor;
4. oversized response.

Only case 1 may reach `remote-llm`. The other cases must return `local-evidence` with a machine-readable `fallbackReason`. This is an adapter safety evaluation, not a claim that a real enterprise model has been scientifically validated. A real gateway evaluation still needs the organizer's approved data and model endpoint.
