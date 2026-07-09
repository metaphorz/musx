// sampler.js — play a loaded sample chromatically (a simple varispeed sampler / romper).
// The pressed frequency becomes a playback rate relative to the sample's recorded pitch
// (`root`), so a keyboard or `chord` drives it exactly like an oscillator voice. A built-in
// attack/release gate plus looping means a held key SUSTAINS and releases cleanly; Start-Mod
// jitters the start point so stacked sampled voices blend instead of phase-cancelling.
import { soundLoaderRender, autoloadSrc } from './soundloader.js';
const T = () => window.Tone;

// Make one channel loop seamlessly. A raw sample's last value rarely matches its first, so looping
// clicks at the wrap; and looping the whole sample replays the onset ATTACK every cycle. This
// returns a shortened channel (length L-F) whose loop region begins at `Ls` (skipping the attack)
// and whose F samples at Ls equal-power crossfade the tail back into the loop start, so the loop
// end is continuous with the loop start. Pure (Float32Array in/out) so it can be unit-tested.
export function crossfadeLoopChannel(src, F, Ls = 0) {
  const L = src.length;
  Ls = Math.max(0, Math.min(Ls | 0, L - 4));
  F = Math.max(0, Math.min(F | 0, Math.floor((L - Ls) / 4)));
  const M = L - F;
  const dst = new Float32Array(M);
  for (let i = 0; i < M; i++) dst[i] = src[i];                 // pristine: attack [0,Ls) + body
  for (let i = 0; i < F; i++) {                                // seam at the loop start: tail -> loop head
    const x = (i / F) * (Math.PI / 2);
    dst[Ls + i] = src[M + i] * Math.cos(x) + src[Ls + i] * Math.sin(x); // equal-power crossfade
  }
  return dst;
}

// Build a loop-friendly ToneAudioBuffer + loop points from an incoming buffer: crossfade each
// channel's seam at a loop start `loopStartSec` in (past the attack). Returns { buf, loopStart,
// loopEnd } in seconds for the player.
function makeLoopable(toneBuf, fadeSec = 0.08, loopStartSec = 0) {
  const ab = toneBuf?.get?.() || toneBuf;                      // underlying AudioBuffer
  if (!ab || !ab.length) return { buf: toneBuf, loopStart: 0, loopEnd: 0 };
  const Ls = Math.max(0, Math.min(Math.floor(loopStartSec * ab.sampleRate), ab.length - 4));
  const F = Math.min(Math.floor(fadeSec * ab.sampleRate), Math.floor((ab.length - Ls) / 4));
  const outLen = ab.length - Math.max(F, 0);
  const nb = new AudioBuffer({ length: outLen, numberOfChannels: ab.numberOfChannels, sampleRate: ab.sampleRate });
  for (let c = 0; c < ab.numberOfChannels; c++) nb.copyToChannel(crossfadeLoopChannel(ab.getChannelData(c), F, Ls), c);
  return { buf: new (T().ToneAudioBuffer)(nb), loopStart: Ls / ab.sampleRate, loopEnd: outLen / ab.sampleRate };
}

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
      { name: 'loopstart', label: 'loop⇥', widget: 'slider', min: 0, max: 1000, step: 5, default: 100, mod: true }, // ms into the sample where the loop begins (skips the onset attack)
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
      let loop = { loopStart: 0, loopEnd: 0 };
      // crossfade the loop seam AND move the loop start past the attack (params.loopstart, ms)
      const applyBuf = (b) => {
        loop = makeLoopable(b, 0.08, (p.loopstart ?? 100) / 1000);
        player.buffer = loop.buf;
        if (loop.loopEnd > 0) { player.loopStart = loop.loopStart; player.loopEnd = loop.loopEnd; }
        hasBuf = true;
      };
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
        // begin in the loop region (past the attack); Start-Mod jitters within it to desync stacks
        const region = Math.max(0, loop.loopEnd - loop.loopStart);
        const j = Math.min((p.startmod ?? 0) / 1000, region * 0.5);
        player.start(undefined, loop.loopStart + (j > 0 ? Math.random() * j : 0));
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
          if (n === 'loopstart') {                                       // re-derive loop points from the ORIGINAL buffer
            p.loopstart = Math.max(0, +val || 0);
            if (node._audio?.buffer) applyBuf(node._audio.buffer);
            if (player.state === 'started') startVoice();
            return;
          }
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
