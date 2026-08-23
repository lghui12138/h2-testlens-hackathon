const scriptPromises = new Map();

function loadScript(path, globalName) {
  if (globalThis[globalName]) return Promise.resolve(globalThis[globalName]);
  if (typeof document === 'undefined') return Promise.reject(new Error(`${globalName}_browser_engine_unavailable`));
  if (scriptPromises.has(path)) return scriptPromises.get(path);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL(path, document.baseURI).href;
    script.async = false;
    script.onload = () => globalThis[globalName] ? resolve(globalThis[globalName]) : reject(new Error(`${globalName}_global_missing`));
    script.onerror = () => reject(new Error(`${globalName}_script_load_failed`));
    document.head.appendChild(script);
  });
  scriptPromises.set(path, promise);
  return promise;
}

export async function ensureBrowserEngines({ spreadsheet = false, docx = false } = {}) {
  if (spreadsheet && !globalThis.XLSX) await loadScript('src/vendor/xlsx.full.min.js', 'XLSX');
  if (docx) {
    if (!globalThis.JSZip) await loadScript('src/vendor/jszip.min.js', 'JSZip');
    if (!globalThis.mammoth) await loadScript('src/vendor/mammoth.browser.min.js', 'mammoth');
  }
  return { spreadsheet: globalThis.XLSX || null, docx: globalThis.mammoth || null };
}
