import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

let cachedEngine = null;

/**
 * Load the checked-in browser bundle for Node-side work.
 *
 * The repository already ships this exact engine for the browser. Reusing it
 * here keeps audits, tests, and the batch watcher independent of a package
 * manager placeholder or an unavailable node_modules package entry.
 */
export async function loadXlsx() {
  if (cachedEngine) return cachedEngine;
  const source = await readFile(new URL('./vendor/xlsx.full.min.js', import.meta.url), 'utf8');
  const context = {
    ArrayBuffer,
    Buffer,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    clearTimeout,
    console,
    process: { env: process.env, version: process.version },
    setTimeout
  };
  vm.createContext(context);
  vm.runInContext(source, context, {
    filename: 'src/vendor/xlsx.full.min.js',
    timeout: 15000
  });
  if (!context.XLSX?.utils?.book_new || typeof context.XLSX.read !== 'function') {
    throw new Error('xlsx_vendor_engine_unavailable');
  }
  cachedEngine = context.XLSX;
  return cachedEngine;
}
