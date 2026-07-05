// granular.js — CDP-style granular family, built on Tone.GrainPlayer.
// GrainPlayer granulates a *buffer* (not a live stream), decoupling time from pitch:
//   playbackRate = how fast it scans the buffer (time-stretch, pitch unchanged)
//   detune       = pitch shift (time unchanged)
// So all three nodes share one engine; they differ only in which controls they expose.
// Like sndfile~, each owns a buffer via the shared loader (file / bundled dropdown / drag).
import { soundLoaderRender, autoloadSrc } from './soundloader.js';
const T = () => window.Tone;

// one runtime for the whole family; unused params simply stay at their defaults
function grainCreate(node) {
  const p = node.params;
  const gp = new (T().GrainPlayer)({
    loop: true, // granular clouds run continuously
    grainSize: p.grain ?? 0.12,
    overlap: p.overlap ?? 0.1,
    playbackRate: p.rate ?? 1,
    detune: (p.pitch ?? 0) * 100, // semitones -> cents
    reverse: p.reverse === 'on',
  });
  const out = new (T().Gain)();
  gp.connect(out);
  let hasBuf = false;
  const applyBuf = (b) => { gp.buffer = b; hasBuf = true; };
  if (node._audio?.buffer) applyBuf(node._audio.buffer);

  const restart = () => { if (!hasBuf) return; try { gp.stop(); } catch (e) {} try { gp.start(); } catch (e) {} };
  autoloadSrc(node, (b) => { applyBuf(b); restart(); });

  return {
    audioOut: () => out,
    audioIn: () => null,
    receive: (inlet, v) => { if (inlet === 'trig') restart(); }, // grain/overlap/rate/pitch arrive via setParam (mod inlets)
    setParam: (n, v) => {
      const f = +v;
      if (n === 'grain' && Number.isFinite(f)) gp.grainSize = Math.max(0.01, f);
      else if (n === 'overlap' && Number.isFinite(f)) gp.overlap = Math.max(0, f);
      else if (n === 'rate' && Number.isFinite(f)) gp.playbackRate = Math.max(0.01, f);
      else if (n === 'pitch' && Number.isFinite(f)) gp.detune = f * 100;
      else if (n === 'reverse') gp.reverse = (v === 'on');
    },
    setBuffer: (b) => { applyBuf(b); restart(); },
    play: () => restart(),
    stopPlay: () => { try { gp.stop(); } catch (e) {} },
    start: () => restart(), // begin the cloud when audio starts (no-op until a buffer arrives)
    stop: () => { try { gp.stop(); } catch (e) {} },
    dispose: () => { try { gp.stop(); } catch (e) {} gp.dispose(); out.dispose(); },
  };
}

// continuous params are `mod` -> each gets an auto control inlet for live modulation
const GRAIN = { name: 'grain', label: 'grain', widget: 'number', min: 0.01, max: 0.5, step: 0.005, default: 0.12, mod: true };
const OVERLAP = { name: 'overlap', label: 'ovlap', widget: 'number', min: 0, max: 0.5, step: 0.005, default: 0.1, mod: true };
const RATE = (def) => ({ name: 'rate', label: 'time', widget: 'slider', min: 0.1, max: 2, step: 0.01, default: def, mod: true });
const PITCH = { name: 'pitch', label: 'pitch', widget: 'number', min: -24, max: 24, step: 1, default: 0, mod: true };
const REVERSE = { name: 'reverse', label: 'rev', widget: 'select', options: ['off', 'on'], default: 'off' };
const IO = { inlets: [{ name: 'trig', kind: 'control' }], outlets: [{ name: 'out', kind: 'audio' }] };

export const granularNodes = [
  {
    // full granular cloud: all controls
    type: 'grain', title: 'grain~', category: 'granular', ...IO,
    params: [GRAIN, OVERLAP, RATE(1), PITCH, REVERSE],
    render: soundLoaderRender, create: grainCreate,
  },
  {
    // time-stretch: change duration/speed, keep pitch (rate + grain)
    type: 'tstretch', title: 'tstretch~', category: 'granular', ...IO,
    params: [RATE(0.5), GRAIN, OVERLAP],
    render: soundLoaderRender, create: grainCreate,
  },
  {
    // pitch-shift: change pitch, keep duration/speed (pitch + grain)
    type: 'pshift', title: 'pshift~', category: 'granular', ...IO,
    params: [PITCH, GRAIN, OVERLAP],
    render: soundLoaderRender, create: grainCreate,
  },
];
