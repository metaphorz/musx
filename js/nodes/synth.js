// synth.js — core sound-making nodes: osc, adsr, gain, dac.
// Runtime contract (returned by create):
//   audioIn(inlet)  -> Tone node/param to connect INTO (or null)
//   audioOut(outlet)-> Tone node to connect FROM (or null)
//   receive(inlet, value) -> a control message arrived
//   setParam(name, value) -> a widget changed
//   start()/stop()  -> optional lifecycle
//   dispose()       -> tear down
const T = () => window.Tone;

export const synthNodes = [
  {
    type: 'osc',
    title: 'osc~',
    category: 'synth',
    inlets: [
      { name: 'fm', kind: 'audio' }, // audio-rate frequency modulation (additive into freq Signal)
    ],
    outlets: [{ name: 'out', kind: 'audio' }],
    params: [
      { name: 'wave', label: 'wave', widget: 'select', options: ['sine', 'square', 'sawtooth', 'triangle'], default: 'sine' },
      { name: 'freq', label: 'freq', widget: 'number', min: 1, max: 20000, default: 220, note: true, mod: true },
    ],
    create(node) {
      const osc = new (T().Oscillator)({ type: node.params.wave || 'sine', frequency: node.params.freq ?? 220 }).start();
      return {
        audioOut: () => osc,
        audioIn: (inlet) => (inlet === 'fm' ? osc.frequency : null),
        setParam: (n, v) => { // also the target of the `freq` mod inlet (control cables -> setParam)
          if (n === 'wave') osc.type = v;
          if (n === 'freq' && Number.isFinite(+v)) osc.frequency.value = +v;
        },
        dispose: () => osc.dispose(),
      };
    },
  },

  {
    type: 'adsr',
    title: 'adsr~',
    category: 'synth',
    inlets: [
      { name: 'in', kind: 'audio' },
      { name: 'trig', kind: 'control' }, // bang or note message triggers the envelope
    ],
    outlets: [{ name: 'out', kind: 'audio' }],
    params: [
      { name: 'attack', label: 'A', widget: 'number', min: 0, max: 5, step: 0.001, default: 0.01, mod: true },
      { name: 'decay', label: 'D', widget: 'number', min: 0, max: 5, step: 0.001, default: 0.2, mod: true },
      { name: 'sustain', label: 'S', widget: 'number', min: 0, max: 1, step: 0.01, default: 0.5, mod: true },
      { name: 'release', label: 'R', widget: 'number', min: 0, max: 10, step: 0.001, default: 0.4, mod: true },
    ],
    create(node) {
      const p = node.params;
      const env = new (T().AmplitudeEnvelope)({
        attack: p.attack ?? 0.01, decay: p.decay ?? 0.2, sustain: p.sustain ?? 0.5, release: p.release ?? 0.4,
      });
      return {
        audioIn: (i) => (i === 'in' ? env : null),
        audioOut: () => env,
        receive: (i, v) => {
          if (i !== 'trig') return;
          const time = (v && typeof v === 'object' && v.time) ? v.time : undefined;
          // gated notes (e.g. holding a keyboard key): note-on opens and SUSTAINS the envelope
          // until note-off releases it — the sound continues for as long as the key is held.
          if (v && v.type === 'noteon') { env.triggerAttack(time); return; }
          if (v && v.type === 'noteoff') { env.triggerRelease(time); return; }
          const dur = (v && typeof v === 'object' && v.dur) ? v.dur : (p.decay + p.release + 0.1);
          env.triggerAttackRelease(dur, time); // time keeps sequencer triggers sample-accurate
        },
        // clamp so out-of-range typed values can't throw (Tone requires sustain in [0,1])
        setParam: (n, v) => {
          v = +v; if (!Number.isFinite(v)) return;
          if (n === 'sustain') env.sustain = Math.min(1, Math.max(0, v));
          else if (n === 'attack' || n === 'decay' || n === 'release') env[n] = Math.max(0, v);
        },
        dispose: () => env.dispose(),
      };
    },
  },

  {
    type: 'gain',
    title: 'gain~',
    category: 'synth',
    inlets: [{ name: 'in', kind: 'audio' }],
    outlets: [{ name: 'out', kind: 'audio' }],
    params: [{ name: 'level', label: 'level', widget: 'slider', min: 0, max: 1.5, step: 0.01, default: 0.7, mod: true }],
    create(node) {
      const g = new (T().Gain)(node.params.level ?? 0.7);
      return {
        audioIn: (i) => (i === 'in' ? g : null),
        audioOut: () => g,
        setParam: (n, v) => { if (n === 'level' && Number.isFinite(+v)) g.gain.rampTo(+v, 0.02); }, // also the `level` mod inlet
        dispose: () => g.dispose(),
      };
    },
  },

  {
    type: 'dac',
    title: 'dac~',
    category: 'synth',
    inlets: [{ name: 'in', kind: 'audio' }],
    outlets: [],
    params: [],
    create(node, api) {
      const g = new (T().Gain)(1);
      g.connect(api?.master || T().getDestination()); // route via engine master so Stop silences
      return {
        audioIn: (i) => (i === 'in' ? g : null),
        audioOut: () => null,
        dispose: () => g.dispose(),
      };
    },
  },
];
