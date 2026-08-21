export const HISTORY_STORAGE_KEY = 'h2-testlens.history.v1';
export const HISTORY_LIMIT = 12;

export function toHistoryRecord(result, fileName, savedAt = new Date().toISOString()) {
  return {
    id: `${savedAt}:${fileName}:${result.metrics.sampleCount}`,
    fileName,
    savedAt,
    verdict: result.verdict,
    metrics: result.metrics,
    quality: result.quality,
    schema: result.schema,
    config: result.config,
    issues: result.issues,
    source: result.source
  };
}

export function readHistory(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(HISTORY_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.slice(0, HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

export function appendHistory(storage, result, fileName, savedAt) {
  const current = toHistoryRecord(result, fileName, savedAt);
  const existing = readHistory(storage).filter((item) => item.id !== current.id);
  const next = [current, ...existing].slice(0, HISTORY_LIMIT);
  storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearHistory(storage) {
  storage.removeItem(HISTORY_STORAGE_KEY);
  return [];
}
