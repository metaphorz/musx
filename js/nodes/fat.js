// fat.js — rich, wide synth voices (richsound). Unison stacking + cents detuning + equal-power
// stereo spread, the architecture behind big "supersaw" pad/lead textures (Hexeract-inspired).
//
//   unison~ — one oscillator MODULE that internally runs up to 8 detuned voices, each panned
//             across the stereo field and summed. One `freq` control drives all voices; the
//             per-voice cents offsets + pan positions make it fat and wide. Stack a few of these
//             (different waves/detune) for the full richsound voice.
//   pan~    — a plain equal-power stereo panner (place any mono source in the field).
// (3D binaural placement lives in spatial.js as spat~ — a positioning tool, not a fat-voice one.)
const T = () => window.Tone;

export const fatNodes = [
  {
    type: 'unison',
    title: 'unison~',
    category: 'synth',
    inlets: [],                                   // freq/detune/spread/level get control inlets via mod:true
    outlets: [{ name: 'out', kind: 'audio' }],    // stereo (Panner-spread) sum
    params: [
      { name: 'wave', label: 'wave', widget: 'select', options: ['sine', 'square', 'sawtooth', 'triangle'], default: 'sawtooth' },
      { name: 'voices', label: 'voices', widget: 'number', min: 1, max: 8, step: 1, default: 7 },
      { name: 'detune', label: 'detune¢', widget: 'slider', min: 0, max: 100, step: 1, default: 25, mod: true },
      { name: 'spread', label: 'spread', widget: 'slider', min: 0, max: 1, step: 0.01, default: 0.8, mod: true },
      { name: 'level', label: 'level', widget: 'slider', min: 0, max: 1.5, step: 0.01, default: 0.7, mod: true },
      { name: 'freq', label: 'freq', widget: 'number', min: 1, max: 20000, default: 220, note: true, mod: true },
    ],
    create(node) {
      const p = node.params;
      const sum = new (T().Gain)(1);              // stable output; voices reconnect into it on rebuild
      let voices = [];                            // [{ osc, pan, c }], c = symmetric position in [-1,1]

      // 1/sqrt(N) keeps summed loudness roughly constant as voice count changes
      const applyLevel = () => { const N = voices.length || 1; sum.gain.rampTo((p.level ?? 0.7) / Math.sqrt(N), 0.02); };

      const rebuild = () => {
        for (const v of voices) { v.osc.dispose(); v.pan.dispose(); }
        voices = [];
        const N = Math.max(1, Math.min(8, Math.round(p.voices ?? 7)));
        for (let i = 0; i < N; i++) {
          const c = N === 1 ? 0 : (i / (N - 1) - 0.5) * 2;   // -1 .. +1 across the stack
          const osc = new (T().Oscillator)({ type: p.wave || 'sawtooth', frequency: p.freq ?? 220, detune: c * (p.detune ?? 25) }).start();
          const pan = new (T().Panner)(c * (p.spread ?? 0.8));
          osc.connect(pan); pan.connect(sum);
          voices.push({ osc, pan, c });
        }
        applyLevel();
      };
      rebuild();

      return {
        audioOut: () => sum,
        setParam: (n, v) => {
          if (n === 'voices') { p.voices = Math.round(+v) || 1; rebuild(); return; }
          if (n === 'wave') { p.wave = v; for (const vc of voices) vc.osc.type = v; return; }
          v = +v; if (!Number.isFinite(v)) return;
          if (n === 'freq') { p.freq = v; for (const vc of voices) vc.osc.frequency.value = v; }
          else if (n === 'detune') { p.detune = v; for (const vc of voices) vc.osc.detune.value = vc.c * v; }
          else if (n === 'spread') { p.spread = v; for (const vc of voices) vc.pan.pan.value = vc.c * v; }
          else if (n === 'level') { p.level = v; applyLevel(); }
        },
        dispose: () => { for (const vc of voices) { vc.osc.dispose(); vc.pan.dispose(); } sum.dispose(); },
      };
    },
  },

  {
    type: 'pan',
    title: 'pan~',
    category: 'synth',
    inlets: [{ name: 'in', kind: 'audio' }],
    outlets: [{ name: 'out', kind: 'audio' }],
    params: [{ name: 'pos', label: 'pos', widget: 'slider', min: -1, max: 1, step: 0.01, default: 0, mod: true }],
    create(node) {
      const pan = new (T().Panner)(node.params.pos ?? 0);
      return {
        audioIn: (i) => (i === 'in' ? pan : null),
        audioOut: () => pan,
        setParam: (n, v) => { if (n === 'pos' && Number.isFinite(+v)) pan.pan.rampTo(Math.max(-1, Math.min(1, +v)), 0.02); },
        dispose: () => pan.dispose(),
      };
    },
  },
];
