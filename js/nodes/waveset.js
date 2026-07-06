// waveset.js — CDP-style waveset ("wavecycle") distortion, one mode-select node.
// Audio in -> audio out, backed by the `waveset-processor` AudioWorklet. Params are
// pushed to the worklet via its message port; continuous ones (group/count/level)
// are `mod` so they get auto control inlets like every other MusX node.
//
// Modes (see waveset-processor.js): repeat · omit · reverse · average · telescope
// · reform — the CDP DISTORT family reimplemented in real time. `wet` is deliberately
// omitted: length-changing modes shift the signal in time, so a sample-aligned dry
// mix is ill-defined (CDP distort is 100% wet); use `level` for output gain and patch
// a parallel path if you want a blend.
import { makeWorkletNode } from '../audio/worklet.js';

const MODES = ['repeat', 'omit', 'reverse', 'average', 'telescope', 'reform'];
const NUMERIC = new Set(['group', 'count', 'keep', 'skip', 'level']);

export const wavesetNodes = [
  {
    type: 'wsdistort',
    title: 'wsdistort~',
    category: 'waveset',
    inlets: [{ name: 'in', kind: 'audio' }],
    outlets: [{ name: 'out', kind: 'audio' }],
    params: [
      { name: 'mode', label: 'mode', widget: 'select', options: MODES, default: 'repeat' },
      { name: 'group', label: 'group', widget: 'number', min: 1, max: 16, step: 1, default: 1, mod: true },
      { name: 'count', label: 'count', widget: 'number', min: 1, max: 8, step: 1, default: 2, mod: true },
      { name: 'keep', label: 'keep', widget: 'number', min: 0, max: 8, step: 1, default: 1 },
      { name: 'skip', label: 'skip', widget: 'number', min: 0, max: 8, step: 1, default: 1 },
      { name: 'shape', label: 'shape', widget: 'select', options: ['sine', 'square', 'tri', 'saw'], default: 'sine' },
      { name: 'level', label: 'level', widget: 'slider', min: 0, max: 1, step: 0.01, default: 1, mod: true },
    ],
    create(node) {
      const p = node.params;
      const wk = makeWorkletNode('waveset-processor');
      // seed the worklet with the current param values
      wk.node.port.postMessage({
        mode: p.mode || 'repeat',
        group: +p.group || 1,
        count: +p.count || 2,
        keep: p.keep ?? 1,
        skip: p.skip ?? 1,
        shape: p.shape || 'sine',
        level: p.level ?? 1,
      });
      return {
        audioIn: (i) => (i === 'in' ? wk.in : null),
        audioOut: () => wk.out,
        setParam: (n, v) => { // also the target of the group/count/level mod inlets
          const val = NUMERIC.has(n) ? +v : v;
          if (NUMERIC.has(n) && !Number.isFinite(val)) return;
          wk.node.port.postMessage({ [n]: val });
        },
        dispose: () => wk.dispose(),
      };
    },
  },
];
