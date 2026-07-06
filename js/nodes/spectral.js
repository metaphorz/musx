// spectral.js — CDP-style spectral (phase-vocoder) transforms, backed by the
// `pvoc-processor` AudioWorklet (STFT 2048 / 75% overlap). Phase 2.4a ships the three
// length-preserving, magnitude-domain ops; pitch/stretch/morph follow in 2.4b/2.4c.
// Each node is audio-in -> audio-out and just sets the worklet's `op` plus its params.
import { makeWorkletNode } from '../audio/worklet.js';

const NUMERIC = new Set(['thresh', 'amount', 'pitch', 'stretch']);

// shared runtime: create the worklet, seed it with `op` + params, route setParam to the port
function pvocCreate(op, seed) {
  return (node) => {
    const p = node.params;
    const wk = makeWorkletNode('pvoc-processor');
    wk.node.port.postMessage({ op, ...seed(p) });
    return {
      audioIn: (i) => (i === 'in' ? wk.in : null),
      audioOut: () => wk.out,
      receive: (inlet, v) => { if (inlet === 'trig') wk.node.port.postMessage({ trig: 1 }); },
      setParam: (n, v) => {
        const val = NUMERIC.has(n) ? +v : v;
        if (NUMERIC.has(n) && !Number.isFinite(val)) return;
        wk.node.port.postMessage({ [n]: val });
      },
      dispose: () => wk.dispose(),
    };
  };
}

export const spectralNodes = [
  {
    // hold the current spectral frame; `trig` re-captures, `freeze` toggles hold
    type: 'spec.freeze', title: 'spec.freeze~', category: 'spectral',
    inlets: [{ name: 'in', kind: 'audio' }, { name: 'trig', kind: 'control' }],
    outlets: [{ name: 'out', kind: 'audio' }],
    params: [
      { name: 'freeze', label: 'freeze', widget: 'select', options: ['off', 'on'], default: 'off', mod: true },
    ],
    create: pvocCreate('freeze', (p) => ({ freeze: p.freeze || 'off' })),
  },
  {
    // average magnitudes over the last N frames -> smears transients into a wash
    type: 'spec.blur', title: 'spec.blur~', category: 'spectral',
    inlets: [{ name: 'in', kind: 'audio' }],
    outlets: [{ name: 'out', kind: 'audio' }],
    params: [
      { name: 'amount', label: 'frames', widget: 'number', min: 1, max: 32, step: 1, default: 6, mod: true },
    ],
    create: pvocCreate('blur', (p) => ({ amount: p.amount ?? 6 })),
  },
  {
    // spectral gate: keep bins above (clean) or below (invert) a fraction of peak level
    type: 'spec.filter', title: 'spec.filter~', category: 'spectral',
    inlets: [{ name: 'in', kind: 'audio' }],
    outlets: [{ name: 'out', kind: 'audio' }],
    params: [
      { name: 'thresh', label: 'thresh', widget: 'slider', min: 0, max: 1, step: 0.005, default: 0.05, mod: true },
      { name: 'invert', label: 'invert', widget: 'select', options: ['off', 'on'], default: 'off' },
    ],
    create: pvocCreate('filter', (p) => ({ thresh: p.thresh ?? 0.05, invert: p.invert || 'off' })),
  },
  {
    // phase-vocoder transpose: shift pitch in semitones, duration/speed unchanged
    type: 'spec.pitch', title: 'spec.pitch~', category: 'spectral',
    inlets: [{ name: 'in', kind: 'audio' }],
    outlets: [{ name: 'out', kind: 'audio' }],
    params: [
      { name: 'pitch', label: 'semis', widget: 'number', min: -24, max: 24, step: 1, default: 7, mod: true },
    ],
    create: pvocCreate('pitch', (p) => ({ pitch: p.pitch ?? 7 })),
  },
  {
    // spectral partial-stretch: stretch the spacing of partials on the frequency axis,
    // turning harmonic sounds inharmonic/bell-like (NOT a time-stretch; time is unchanged)
    type: 'spec.stretch', title: 'spec.stretch~', category: 'spectral',
    inlets: [{ name: 'in', kind: 'audio' }],
    outlets: [{ name: 'out', kind: 'audio' }],
    params: [
      { name: 'stretch', label: 'stretch', widget: 'number', min: 0.5, max: 2, step: 0.01, default: 1.2, mod: true },
    ],
    create: pvocCreate('stretch', (p) => ({ stretch: p.stretch ?? 1.2 })),
  },
];
