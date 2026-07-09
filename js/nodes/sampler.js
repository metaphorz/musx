// sampler.js — play a loaded sample chromatically (a simple varispeed sampler / romper).
// The pressed frequency becomes a playback rate relative to the sample's recorded pitch
// (`root`), so a keyboard or `chord` drives it exactly like an oscillator voice. A built-in
// attack/release gate plus looping means a held key SUSTAINS and releases cleanly; Start-Mod
// jitters the start point so stacked sampled voices blend instead of phase-cancelling.
import { soundLoaderRender, autoloadSrc } from './soundloader.js';
const T = () => window.Tone;

export const samplerNodes = [
  {
    type: 'sampler',
    title: 'sampler~',
    category: 'source',
    inlets: [
      { name: 'freq', kind: 'control' }, // Hz -> playbackRate = freq / rootFreq
      { name: 'trig', kind: 'control' }, // note-on/off gate (held = sustain), or a fixed note
    ],
    outlets: [{ name: 'out', kind: 'audio' }],
    params: [
      { name: 'root', label: 'root', widget: 'number', min: 0, max: 127, step: 1, default: 48, midinote: true },
      { name: 'attack', label: 'A', widget: 'number', min: 0, max: 5, step: 0.001, default: 0.05, mod: true },
      { name: 'release', label: 'R', widget: 'number', min: 0, max: 10, step: 0.001, default: 0.6, mod: true },
      { name: 'startmod', label: 'start∿', widget: 'slider', min: 0, max: 200, step: 1, default: 0, mod: true },
      { name: 'level', label: 'level', widget: 'slider', min: 0, max: 1.5, step: 0.01, default: 0.9, mod: true },
    ],
    render: soundLoaderRender,
    create(node) {
      const p = node.params;
      const player = new (T().Player)({ loop: true, autostart: false });
      const env = new (T().AmplitudeEnvelope)({ attack: p.attack ?? 0.05, decay: 0, sustain: 1, release: p.release ?? 0.6 });
      const out = new (T().Gain)(p.level ?? 0.9);
      player.connect(env); env.connect(out);

      let hasBuf = false;
      const applyBuf = (b) => { player.buffer = b; hasBuf = true; };
      if (node._audio?.buffer) applyBuf(node._audio.buffer);           // buffer decoded before Start Audio
      autoloadSrc(node, (b) => applyBuf(b));                            // bundled sound referenced by params.src

      const rootFreq = () => T().Frequency(p.root ?? 48, 'midi').toFrequency();
      let lastFreq = 0;                                                // 0 => not set yet, play at native pitch
      const rateNow = () => (lastFreq > 0 ? lastFreq / rootFreq() : 1);
      let stopT = null;
      const clearStop = () => { if (stopT) { clearTimeout(stopT); stopT = null; } };
      const scheduleStop = (after) => { clearStop(); stopT = setTimeout(() => { try { player.stop(); } catch (e) {} stopT = null; }, after * 1000); };

      const startVoice = () => {
        if (!hasBuf) return;
        clearStop();
        player.playbackRate = rateNow();
        try { player.stop(); } catch (e) {}
        const j = (p.startmod ?? 0) / 1000;                            // Start-Mod: random start offset (s)
        player.start(undefined, j > 0 ? Math.random() * j : 0);
      };

      return {
        audioOut: () => out,
        audioIn: () => null,
        receive: (i, v) => {
          if (i === 'freq') {
            if (Number.isFinite(+v) && +v > 0) { lastFreq = +v; if (player.state === 'started') player.playbackRate = rateNow(); }
            return;
          }
          if (i !== 'trig') return;
          if (v && v.type === 'noteon') { startVoice(); env.triggerAttack(); return; }
          if (v && v.type === 'noteoff') { env.triggerRelease(); scheduleStop((p.release ?? 0.6) + 0.05); return; }
          // fixed note (note object / sequencer) or a bare bang -> play once for its duration
          const dur = (v && typeof v === 'object' && v.dur) ? v.dur : 0.5;
          startVoice(); env.triggerAttackRelease(dur); scheduleStop(dur + (p.release ?? 0.6) + 0.05);
        },
        setParam: (n, val) => {
          if (n === 'root') { p.root = Math.round(+val) || 0; if (player.state === 'started') player.playbackRate = rateNow(); return; }
          val = +val; if (!Number.isFinite(val)) return;
          if (n === 'attack') env.attack = Math.max(0, val);
          else if (n === 'release') env.release = Math.max(0, val);
          else if (n === 'startmod') p.startmod = Math.max(0, val);
          else if (n === 'level') out.gain.rampTo(val, 0.02);
        },
        setBuffer: (b) => applyBuf(b),                                 // loader UI hands over a new buffer live
        play: () => { startVoice(); env.triggerAttack(); },            // ▶ preview button
        stopPlay: () => { env.triggerRelease(); scheduleStop((p.release ?? 0.6) + 0.05); },
        stop: () => { clearStop(); try { player.stop(); } catch (e) {} },
        dispose: () => { clearStop(); try { player.stop(); } catch (e) {} player.dispose(); env.dispose(); out.dispose(); },
      };
    },
  },
];
