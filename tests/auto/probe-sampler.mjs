// probe-sampler.mjs — Phase 5: sampler~ plays a loaded sample chromatically (varispeed).
// Verifies pitch tracks freq (spectral centroid ~doubles at 2x rate), a held note sustains
// past the sample length (looping), release fades, and both sampler demos sound.
import { chromium } from 'playwright';

const PORT = process.argv[2] || '8123';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log(`  [PAGEERROR] ${e.message}`); });

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.editor && window.Tone);
await page.click('#btn-audio');
await sleep(400);

const r = await page.evaluate(async () => {
  const Tone = window.Tone, ed = window.editor;
  const out = {};
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  const sm = ed.graph.addNode('sampler', 60, 60, { src: 'sounds/vocal/voice-ah.wav', filename: 'voice-ah.wav', root: 48 });
  // wait for the bundled buffer to decode
  for (let k = 0; k < 40 && !sm._audio?.buffer; k++) await sleep(50);
  out.bufferLoaded = !!sm._audio?.buffer;
  const rt = ed.engine.runtimes.get(sm.id);
  const node = rt.audioOut();
  const rootFreq = Tone.Frequency(48, 'midi').toFrequency();

  const peakOver = async (ms) => {
    const m = new Tone.Meter({ smoothing: 0 }); node.connect(m);
    let pk = -Infinity; for (let k = 0; k < Math.ceil(ms / 40); k++) { await sleep(40); const v = m.getValue(); if (v > pk) pk = v; }
    node.disconnect(m); m.dispose(); return pk;
  };
  const centroid = async (ms) => {                        // amplitude-weighted mean frequency (Hz)
    const an = new Tone.Analyser('fft', 2048); node.connect(an);
    const sr = Tone.getContext().sampleRate, N = 2048;
    let acc = 0, cnt = 0;
    for (let k = 0; k < Math.ceil(ms / 40); k++) {
      await sleep(40);
      const vals = an.getValue(); let num = 0, den = 0;
      for (let b = 0; b < N; b++) { const mag = Math.pow(10, vals[b] / 20); const f = b * (sr / 2) / N; num += f * mag; den += mag; }
      if (den > 0) { acc += num / den; cnt++; }
    }
    node.disconnect(an); an.dispose(); return cnt ? acc / cnt : 0;
  };

  // rate 1x (play at native pitch): hold, confirm it plays and still sounds past the sample length
  rt.receive('freq', rootFreq);
  rt.receive('trig', { type: 'noteon' });
  out.playEarly = await peakOver(500);
  out.centroid1 = await centroid(500);
  out.playLate = await peakOver(500);                    // ~2.6s sample; still audible => looping
  rt.receive('trig', { type: 'noteoff' });
  await sleep(1100);                                     // release ~0.6s + margin
  out.released = await peakOver(200);

  // rate 2x (up an octave): centroid should rise well above the 1x centroid
  rt.receive('freq', rootFreq * 2);
  rt.receive('trig', { type: 'noteon' });
  await sleep(120);
  out.centroid2 = await centroid(500);
  rt.receive('trig', { type: 'noteoff' });
  await sleep(200);

  // demos: both should sound on a held key
  const meterPeak = async (ms) => {
    const m = new Tone.Meter({ smoothing: 0.1 }); Tone.getDestination().connect(m);
    let pk = -Infinity; for (let k = 0; k < Math.ceil(ms / 40); k++) { await sleep(40); const v = m.getValue(); if (v > pk) pk = v; }
    m.dispose(); return pk;
  };
  const playDemo = async (key) => {
    ed.loadDemo(key);
    const nodes = () => [...ed.graph.nodes.values()];
    for (let k = 0; k < 40 && !nodes().some((n) => n.type === 'sampler' && n._audio?.buffer); k++) await sleep(50);
    const kb = nodes().find((n) => n.type === 'keyboard');
    ed.fireNoteOn(kb.id, 48);
    const pk = await meterPeak(900);
    ed.fireNoteOff(kb.id, 48); await sleep(200);
    return pk;
  };
  out.samplerPlayPeak = await playDemo('samplerPlay');
  out.sampledChordPeak = await playDemo('sampledChord');
  return out;
});

const n = (x) => (typeof x === 'number' ? x.toFixed(1) : String(x));
const checks = [
  ['bundled sample decodes', r.bufferLoaded === true, `${r.bufferLoaded}`],
  ['note-on plays audio', r.playEarly > -60, `${n(r.playEarly)} dB`],
  ['held note sustains past the sample length (looping)', r.playLate > -60, `${n(r.playLate)} dB`],
  ['release fades the note', r.released < r.playEarly - 15, `${n(r.playEarly)} -> ${n(r.released)} dB`],
  ['pitch tracks freq: 2x rate raises the spectral centroid (>= 1.25x)', r.centroid2 >= r.centroid1 * 1.25, `${Math.round(r.centroid1)}Hz -> ${Math.round(r.centroid2)}Hz`],
  ['Sampler (playable) demo sounds', r.samplerPlayPeak > -60, `${n(r.samplerPlayPeak)} dB`],
  ['Sampled Chord demo sounds', r.sampledChordPeak > -60, `${n(r.sampledChordPeak)} dB`],
  ['no page errors', errors.length === 0, `${errors.length} errors`],
];

let ok = true;
for (const [name, pass, detail] of checks) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!pass) ok = false;
}
console.log(ok ? '  SAMPLER 5 PASS' : '  SAMPLER 5 FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
