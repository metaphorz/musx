// glitch.js — CDP "extend" family: iterate~ (triggered stutter/echo) and scramble~
// (segment reorder), backed by the glitch-processor worklets. Category `extend`.
import { makeWorkletNode } from '../audio/worklet.js';

const INUM = new Set(['seg', 'count', 'decay', 'pitch']);

export const glitchNodes = [
  {
    type: 'iterate',
    title: 'iterate~',
    category: 'extend',
    inlets: [{ name: 'in', kind: 'audio' }, { name: 'trig', kind: 'control' }],
    outlets: [{ name: 'out', kind: 'audio' }],
    params: [
      { name: 'seg', label: 'seg ms', widget: 'number', min: 5, max: 1000, step: 1, default: 180 },
      { name: 'count', label: 'count', widget: 'number', min: 1, max: 16, step: 1, default: 6, mod: true },
      { name: 'decay', label: 'decay', widget: 'slider', min: 0, max: 1, step: 0.01, default: 0.75, mod: true },
      { name: 'pitch', label: 'pitch', widget: 'number', min: -12, max: 12, step: 1, default: 0, mod: true },
    ],
    create(node) {
      const p = node.params;
      const wk = makeWorkletNode('iterate-processor');
      wk.node.port.postMessage({ seg: p.seg ?? 180, count: p.count ?? 6, decay: p.decay ?? 0.75, pitch: p.pitch ?? 0 });
      return {
        audioIn: (i) => (i === 'in' ? wk.in : null),
        audioOut: () => wk.out,
        receive: (inlet) => { if (inlet === 'trig') wk.node.port.postMessage({ trig: 1 }); },
        setParam: (n, v) => { const val = INUM.has(n) ? +v : v; if (INUM.has(n) && !Number.isFinite(val)) return; wk.node.port.postMessage({ [n]: val }); },
        dispose: () => wk.dispose(),
      };
    },
  },
  {
    type: 'scramble',
    title: 'scramble~',
    category: 'extend',
    inlets: [{ name: 'in', kind: 'audio' }],
    outlets: [{ name: 'out', kind: 'audio' }],
    params: [
      { name: 'seg', label: 'seg ms', widget: 'number', min: 20, max: 1000, step: 1, default: 120 },
      { name: 'mode', label: 'mode', widget: 'select', options: ['shuffle', 'drunk'], default: 'shuffle' },
    ],
    create(node) {
      const p = node.params;
      const wk = makeWorkletNode('scramble-processor');
      wk.node.port.postMessage({ seg: p.seg ?? 120, mode: p.mode || 'shuffle' });
      return {
        audioIn: (i) => (i === 'in' ? wk.in : null),
        audioOut: () => wk.out,
        setParam: (n, v) => { if (n === 'seg') { if (Number.isFinite(+v)) wk.node.port.postMessage({ seg: +v }); } else if (n === 'mode') wk.node.port.postMessage({ mode: v }); },
        dispose: () => wk.dispose(),
      };
    },
  },
];
