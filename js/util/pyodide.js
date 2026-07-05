// pyodide.js — lazily load Pyodide (a WASM Python runtime) from the CDN on first use.
// Cached so all Python code objects share one interpreter. Only fetched when a Python
// code object actually runs; JS code objects never trigger this.
const PYODIDE_VERSION = 'v0.26.4';
const CDN = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

let _promise = null;

export function getPyodide(onStatus) {
  if (_promise) return _promise;
  _promise = (async () => {
    onStatus?.('loading python…');
    if (!window.loadPyodide) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = `${CDN}pyodide.js`;
        s.onload = resolve;
        s.onerror = () => reject(new Error('failed to load pyodide'));
        document.head.appendChild(s);
      });
    }
    const py = await window.loadPyodide({ indexURL: CDN });
    onStatus?.('python ready');
    return py;
  })();
  return _promise;
}
