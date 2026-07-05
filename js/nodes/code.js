// code.js — a control-rate code object. Write JS or Python that reads inputs a, b and
// returns a value; it runs whenever an input arrives and emits the result.
//   JS:     a small function body, e.g.  return a * b + 1;   (a bare expression also works)
//   Python: an expression / statements ending in an expression, e.g.  a * b + 1
// Python runs via Pyodide, loaded from the CDN the first time a Python code object runs.
import { getPyodide } from '../util/pyodide.js';

export const codeNodes = [
  {
    type: 'code',
    title: 'code',
    category: 'code',
    resizable: true,
    inlets: [{ name: 'a', kind: 'control' }, { name: 'b', kind: 'control' }],
    outlets: [{ name: 'out', kind: 'control' }],
    params: [
      { name: 'lang', label: 'lang', widget: 'select', options: ['js', 'python'], default: 'js' },
      { name: 'status', label: 'status', widget: 'readout', default: 'ok' },
    ],
    render({ node, body, view, editor }) {
      if (node.params.code == null) node.params.code = 'return a * b;';
      const ta = document.createElement('textarea');
      ta.className = 'codearea';
      ta.spellcheck = false;
      ta.value = node.params.code;
      ta.style.width = `${node.params.w || 240}px`;
      ta.style.height = `${node.params.h || 90}px`;
      ta.addEventListener('input', () => editor.onParamChange(node.id, 'code', ta.value));
      ta.addEventListener('keydown', (e) => e.stopPropagation());  // don't trigger node-delete while typing
      ta.addEventListener('mousedown', (e) => e.stopPropagation()); // don't drag the node
      view._vizEl = ta;
      view._onResize = (w, h) => { ta.style.width = `${w}px`; ta.style.height = `${h}px`; };
      body.appendChild(ta);
    },
    create(node, api) {
      let a = 0, b = 0, jsFn = null, py = null;
      const status = (s) => api.view?.setReadout?.('status', s);

      // JS bodies may omit `return` for a bare expression
      const wrap = (c) => (/\breturn\b/.test(c) ? c : `return (${c});`);
      const compileJs = () => {
        try { jsFn = new Function('a', 'b', wrap(node.params.code || '')); status('ok'); }
        catch (e) { jsFn = null; status(`err: ${e.message}`); }
      };
      compileJs();

      const emit = (val) => {
        const n = +val;
        api.emit('out', Number.isFinite(n) ? n : val);
      };

      const runJs = () => {
        if (!jsFn) return;
        try { emit(jsFn(a, b)); status('ok'); }
        catch (e) { status(`err: ${e.message}`); }
      };

      const runPy = async () => {
        try {
          if (!py) { py = await getPyodide(status); }
          py.globals.set('a', a); py.globals.set('b', b);
          const r = py.runPython(node.params.code || '');
          const val = (r != null && typeof r === 'object' && r.toJs) ? r.toJs() : r;
          emit(val); status('ok');
        } catch (e) { status(`py err: ${String(e).split('\n').pop()}`); }
      };

      const run = () => { (node.params.lang === 'python' ? runPy() : runJs()); };

      return {
        receive: (i, v) => { if (i === 'a') a = +v; else if (i === 'b') b = +v; run(); },
        setParam: (n) => { if (n === 'lang' || n === 'code') compileJs(); },
        dispose: () => {},
      };
    },
  },
];
