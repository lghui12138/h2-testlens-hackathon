import { analyzeRows } from './analyzer.mjs';
import { sampleRowsForDisplay } from './display-sampling.mjs';

function postStage(id, stage, rowCount) {
  self.postMessage({ id, type: 'stage', stage, rowCount });
}

self.addEventListener('message', (event) => {
  const { id, rows, config } = event.data || {};
  try {
    const inputRows = Array.isArray(rows) ? rows : [];
    postStage(id, 'analyze', inputRows.length);
    const result = analyzeRows(inputRows, config || {});
    const display = sampleRowsForDisplay(result.rows);
    result.rows = display.rows;
    result.source = {
      ...result.source,
      analysisEngine: 'worker',
      analyzedRowCount: display.originalRowCount,
      displayRowCount: display.rows.length,
      chartSampling: display.sampled
    };
    self.postMessage({ id, type: 'result', result });
  } catch (error) {
    self.postMessage({ id, type: 'error', error: { message: error?.message || String(error), stack: error?.stack || '' } });
  }
});
