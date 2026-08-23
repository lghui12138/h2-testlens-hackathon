const DEFAULT_DISPLAY_LIMIT = 6000;

function addIndex(indexes, index, length) {
  if (index >= 0 && index < length) indexes.add(index);
}

/**
 * Keep the analytical result at full resolution while bounding the rows used
 * by the browser canvas. Session boundaries are retained so a multi-file
 * chart cannot visually join two source files after downsampling.
 */
export function sampleRowsForDisplay(rows = [], limit = DEFAULT_DISPLAY_LIMIT) {
  if (!Array.isArray(rows) || rows.length <= limit || limit < 3) {
    return { rows: Array.isArray(rows) ? rows : [], sampled: false, originalRowCount: Array.isArray(rows) ? rows.length : 0 };
  }

  const stride = Math.max(1, Math.ceil(rows.length / limit));
  const indexes = new Set([0, rows.length - 1]);
  for (let index = 0; index < rows.length; index += stride) addIndex(indexes, index, rows.length);
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index]?.session_id !== rows[index - 1]?.session_id) {
      addIndex(indexes, index - 1, rows.length);
      addIndex(indexes, index, rows.length);
    }
  }
  const selected = [...indexes].sort((a, b) => a - b).map((index) => rows[index]);
  return { rows: selected, sampled: true, originalRowCount: rows.length };
}

export const displayRowLimit = DEFAULT_DISPLAY_LIMIT;
