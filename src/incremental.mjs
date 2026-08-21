export const MANIFEST_STORAGE_KEY = 'h2-testlens.batch-manifest.v1';

export function manifestFromEntries(entries = []) {
  return entries.map((entry) => ({
    name: String(entry.name || 'unknown'),
    size: Number.isFinite(Number(entry.size)) ? Number(entry.size) : null,
    rowCount: Array.isArray(entry.rows) ? entry.rows.length : 0,
    firstTimestamp: entry.rows?.[0]?.Timestamp || entry.rows?.[0]?.timestamp_s || entry.rows?.[0]?.['测试时间'] || entry.rows?.[0]?.['时间'] || null,
    lastTimestamp: entry.rows?.at(-1)?.Timestamp || entry.rows?.at(-1)?.timestamp_s || entry.rows?.at(-1)?.['测试时间'] || entry.rows?.at(-1)?.['时间'] || null,
    sheetName: entry.sheetName || null,
    hash: entry.contentHash || null,
    hashType: entry.hashType || null
  }));
}

export function diffManifests(previous = [], current = []) {
  const before = new Map(previous.map((entry) => [entry.name, entry]));
  const after = new Map(current.map((entry) => [entry.name, entry]));
  const added = []; const changed = []; const unchanged = []; const removed = [];
  for (const [name, entry] of after) {
    const old = before.get(name);
    if (!old) added.push(entry);
    else if (old.hash && entry.hash && old.hash === entry.hash && old.size === entry.size) unchanged.push(entry);
    else if (old.rowCount === entry.rowCount && old.size === entry.size && old.firstTimestamp === entry.firstTimestamp && old.lastTimestamp === entry.lastTimestamp) unchanged.push(entry);
    else changed.push(entry);
  }
  for (const [name, entry] of before) if (!after.has(name)) removed.push(entry);
  return { added, changed, unchanged, removed, total: current.length };
}

export function readBatchManifest(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(MANIFEST_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function writeBatchManifest(storage, manifest) {
  storage?.setItem(MANIFEST_STORAGE_KEY, JSON.stringify(manifest || []));
  return manifest || [];
}
