// spatial.js — 3D sound placement (spatialization), distinct from the fat/wide voice
// techniques in fat.js. These objects don't change a sound's timbre; they position it in
// space around the listener.
//
//   spat~ — 3D binaural placement (Web Audio HRTF via Tone.Panner3D). The single listener
//           sits at the origin facing -Z, so x=left(-)/right(+), y=down(-)/up(+),
//           z=front(-)/back(+). Heard as true 3D over headphones. Each x/y/z is mod:true,
//           so an xy pad / funcgen can move the source around the field in real time.
//
// A future ambi~ (Ambisonics: a rotatable soundfield for VR/head-tracking) would live here.
const T = () => window.Tone;

export const spatialNodes = [
  {
    type: 'spat',
    title: 'spat~',
    category: 'spatial',
    inlets: [{ name: 'in', kind: 'audio' }],
    outlets: [{ name: 'out', kind: 'audio' }],
    params: [
      { name: 'x', label: 'x', widget: 'slider', min: -10, max: 10, step: 0.1, default: 0, mod: true },
      { name: 'y', label: 'y', widget: 'slider', min: -10, max: 10, step: 0.1, default: 0, mod: true },
      { name: 'z', label: 'z', widget: 'slider', min: -10, max: 10, step: 0.1, default: -1, mod: true },
    ],
    create(node) {
      const p = node.params;
      const spat = new (T().Panner3D)({
        panningModel: 'HRTF',
        positionX: p.x ?? 0, positionY: p.y ?? 0, positionZ: p.z ?? -1,
      });
      return {
        audioIn: (i) => (i === 'in' ? spat : null),
        audioOut: () => spat,
        setParam: (n, v) => {
          v = +v; if (!Number.isFinite(v)) return;
          v = Math.max(-10, Math.min(10, v));
          if (n === 'x') spat.positionX.rampTo(v, 0.02);
          else if (n === 'y') spat.positionY.rampTo(v, 0.02);
          else if (n === 'z') spat.positionZ.rampTo(v, 0.02);
        },
        dispose: () => spat.dispose(),
      };
    },
  },
];
