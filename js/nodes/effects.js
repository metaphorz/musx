// effects.js — filter, delay, reverb, distortion. Each is audio-in -> audio-out.
const T = () => window.Tone;

export const effectNodes = [
  {
    type: 'filter',
    title: 'filter~',
    category: 'effects',
    inlets: [{ name: 'in', kind: 'audio' }],
    outlets: [{ name: 'out', kind: 'audio' }],
    params: [
      { name: 'type', label: 'type', widget: 'select', options: ['lowpass', 'highpass', 'bandpass', 'notch'], default: 'lowpass' },
      { name: 'cutoff', label: 'cutoff', widget: 'number', min: 20, max: 20000, default: 1200, note: true, mod: true },
      { name: 'Q', label: 'Q', widget: 'number', min: 0, max: 30, step: 0.1, default: 1, mod: true },
    ],
    create(node) {
      const p = node.params;
      const f = new (T().Filter)({ type: p.type || 'lowpass', frequency: p.cutoff ?? 1200, Q: p.Q ?? 1 });
      return {
        audioIn: (i) => (i === 'in' ? f : null),
        audioOut: () => f,
        setParam: (n, v) => { // also the target of the cutoff/Q mod inlets
          if (n === 'type') f.type = v;
          else if (n === 'cutoff' && Number.isFinite(+v)) f.frequency.rampTo(+v, 0.02);
          else if (n === 'Q' && Number.isFinite(+v)) f.Q.value = +v;
        },
        dispose: () => f.dispose(),
      };
    },
  },

  {
    type: 'delay',
    title: 'delay~',
    category: 'effects',
    inlets: [{ name: 'in', kind: 'audio' }],
    outlets: [{ name: 'out', kind: 'audio' }],
    params: [
      { name: 'time', label: 'time', widget: 'number', min: 0, max: 2, step: 0.001, default: 0.25, mod: true },
      { name: 'feedback', label: 'fbk', widget: 'slider', min: 0, max: 0.95, step: 0.01, default: 0.35, mod: true },
      { name: 'wet', label: 'wet', widget: 'slider', min: 0, max: 1, step: 0.01, default: 0.35, mod: true },
    ],
    create(node) {
      const p = node.params;
      const d = new (T().FeedbackDelay)({ delayTime: p.time ?? 0.25, feedback: p.feedback ?? 0.35, wet: p.wet ?? 0.35 });
      return {
        audioIn: (i) => (i === 'in' ? d : null),
        audioOut: () => d,
        setParam: (n, v) => {
          if (n === 'time') d.delayTime.rampTo(+v, 0.05);
          else if (n === 'feedback') d.feedback.rampTo(+v, 0.05);
          else if (n === 'wet') d.wet.rampTo(+v, 0.05);
        },
        dispose: () => d.dispose(),
      };
    },
  },

  {
    type: 'reverb',
    title: 'reverb~',
    category: 'effects',
    inlets: [{ name: 'in', kind: 'audio' }],
    outlets: [{ name: 'out', kind: 'audio' }],
    params: [
      { name: 'decay', label: 'decay', widget: 'number', min: 0.1, max: 15, step: 0.1, default: 2.5 }, // not mod: regenerates the impulse response
      { name: 'wet', label: 'wet', widget: 'slider', min: 0, max: 1, step: 0.01, default: 0.4, mod: true },
    ],
    create(node) {
      const p = node.params;
      const r = new (T().Reverb)({ decay: p.decay ?? 2.5, wet: p.wet ?? 0.4 });
      return {
        audioIn: (i) => (i === 'in' ? r : null),
        audioOut: () => r,
        setParam: (n, v) => {
          if (n === 'decay') r.decay = Math.max(0.01, +v || 0.01); // Tone requires decay > 0
          else if (n === 'wet') r.wet.rampTo(+v, 0.05);
        },
        dispose: () => r.dispose(),
      };
    },
  },

  {
    type: 'dist',
    title: 'dist~',
    category: 'effects',
    inlets: [{ name: 'in', kind: 'audio' }],
    outlets: [{ name: 'out', kind: 'audio' }],
    params: [
      { name: 'amount', label: 'amt', widget: 'slider', min: 0, max: 1, step: 0.01, default: 0.4, mod: true },
      { name: 'wet', label: 'wet', widget: 'slider', min: 0, max: 1, step: 0.01, default: 1, mod: true },
    ],
    create(node) {
      const p = node.params;
      const d = new (T().Distortion)({ distortion: p.amount ?? 0.4, wet: p.wet ?? 1 });
      return {
        audioIn: (i) => (i === 'in' ? d : null),
        audioOut: () => d,
        setParam: (n, v) => {
          if (n === 'amount') d.distortion = +v;
          else if (n === 'wet') d.wet.rampTo(+v, 0.05);
        },
        dispose: () => d.dispose(),
      };
    },
  },
];
