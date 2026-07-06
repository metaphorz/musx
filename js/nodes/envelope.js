// envelope.js — CDP-style envelope extraction and imposition.
//   envfollow~ : tracks the amplitude envelope of its audio input and exposes it both as an
//                AUDIO-rate signal (`env`, for imposition) and a CONTROL stream (`val`, for
//                plotting / parameter modulation).
//   envimpose~ : a VCA — multiplies a carrier by an incoming envelope signal. Pair
//                envfollow~(drums) -> envimpose~(pad) to make the pad pulse with the drums.
// Both stay in the audio domain so the pairing works continuously, not only during Play.
const T = () => window.Tone;

export const envelopeNodes = [
  {
    type: 'envfollow',
    title: 'envfollow~',
    category: 'envelope',
    inlets: [{ name: 'in', kind: 'audio' }],
    outlets: [
      { name: 'env', kind: 'audio' },   // smoothed envelope as an audio-rate signal
      { name: 'val', kind: 'control' },  // same envelope sampled as a 0..1 control stream
    ],
    params: [
      { name: 'response', label: 'resp', widget: 'slider', min: 0.005, max: 0.5, step: 0.005, default: 0.05, mod: true },
      { name: 'gain', label: 'gain', widget: 'number', min: 0, max: 8, step: 0.1, default: 1, mod: true },
    ],
    create(node, api) {
      const p = node.params;
      const inG = new (T().Gain)(p.gain ?? 1);
      const foll = new (T().Follower)({ smoothing: p.response ?? 0.05 });
      inG.connect(foll);
      const meter = new (T().Meter)({ normalRange: true, smoothing: 0.8 });
      inG.connect(meter);
      // control-rate sampler for the `val` outlet (runs while the transport runs)
      const loop = new (T().Loop)(() => api.emit('val', meter.getValue()), 0.03);
      return {
        audioIn: (i) => (i === 'in' ? inG : null),
        audioOut: (o) => (o === 'env' ? foll : null),
        setParam: (n, v) => {
          if (n === 'response' && Number.isFinite(+v)) foll.smoothing = Math.max(0.005, +v);
          else if (n === 'gain' && Number.isFinite(+v)) inG.gain.rampTo(+v, 0.02);
        },
        start: () => loop.start(0),
        stop: () => loop.stop(),
        dispose: () => { loop.dispose(); foll.dispose(); meter.dispose(); inG.dispose(); },
      };
    },
  },
  {
    type: 'envimpose',
    title: 'envimpose~',
    category: 'envelope',
    inlets: [{ name: 'in', kind: 'audio' }, { name: 'env', kind: 'audio' }],
    outlets: [{ name: 'out', kind: 'audio' }],
    params: [
      { name: 'depth', label: 'depth', widget: 'slider', min: 0, max: 4, step: 0.01, default: 2, mod: true },
    ],
    create(node) {
      const p = node.params;
      const vca = new (T().Gain)(0);           // carrier gain, driven entirely by the envelope
      const envScale = new (T().Gain)(p.depth ?? 2);
      envScale.connect(vca.gain);              // env signal -> VCA gain (additive onto 0)
      return {
        audioIn: (i) => (i === 'in' ? vca : (i === 'env' ? envScale : null)),
        audioOut: () => vca,
        setParam: (n, v) => { if (n === 'depth' && Number.isFinite(+v)) envScale.gain.rampTo(+v, 0.02); },
        dispose: () => { envScale.dispose(); vca.dispose(); },
      };
    },
  },
];
