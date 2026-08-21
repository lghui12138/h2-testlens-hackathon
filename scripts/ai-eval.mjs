import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzeRows, parseCSV } from '../src/analyzer.mjs';
import { generateDraft } from '../src/ai-draft.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const csv = await readFile(join(here, '../sample-data/test_run_001.csv'), 'utf8');
const evidence = analyzeRows(parseCSV(csv));

const cases = [
  { id: 'grounded_ok', expectedMode: 'remote-llm', response: '## 结论\n当前判定 FAIL。峰值压力 31.2 bar，建议复核调压回路。' },
  { id: 'verdict_conflict', expectedMode: 'local-evidence', expectedReason: 'grounding_verdict_conflict', response: '## 结论\n当前判定 PASS。峰值压力 31.2 bar。' },
  { id: 'anchor_missing', expectedMode: 'local-evidence', expectedReason: 'grounding_anchor_missing', response: '## 结论\n当前判定 FAIL。请继续观察设备状态。' },
  { id: 'too_long', expectedMode: 'local-evidence', expectedReason: 'grounding_too_long', response: `当前判定 FAIL。峰值压力 31.2 bar。${'x'.repeat(12001)}` }
];

const results = [];
for (const fixture of cases) {
  const actual = await generateDraft(evidence, {
    endpoint: 'http://offline-eval.invalid/v1/chat/completions',
    model: 'fixture-model',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: fixture.response } }] }) })
  });
  const pass = actual.mode === fixture.expectedMode && (!fixture.expectedReason || actual.fallbackReason === fixture.expectedReason);
  results.push({ id: fixture.id, expectedMode: fixture.expectedMode, actualMode: actual.mode, fallbackReason: actual.fallbackReason ?? null, pass });
}

const passed = results.filter((result) => result.pass).length;
console.log(JSON.stringify({ suite: 'h2-testlens-ai-grounding.v1', cases: results.length, passed, failed: results.length - passed, results }, null, 2));
if (passed !== results.length) process.exitCode = 1;
