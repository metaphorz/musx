// probe-midifile-mono.mjs — Phase 7: the monophonic Cathedral (MIDI) demo. Verifies the
// `midifile` node's mono/legato mode drives a single sustained line: the file loads in mono,
// playback is audible and CONTINUOUS through the dense section (legato — the gate does not keep
// slamming shut between overlapping notes), and stop silences it. No page errors.
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

  ed.loadDemo('cathedralMidiMono');
  const mf = [...ed.graph.nodes.values()].find((n) => n.type === 'midifile');
  for (let k = 0; k < 40 && !/notes/.test(mf.params.status || ''); k++) await sleep(50);
  out.status = mf.params.status;                       // should say "… · mono · trk 10"
  out.voices = mf.params.voices;
  out.track = mf.params.track;

  // melody track isolated + intro skipped -> plays the theme from the TOP (no 42 s wait)
  ed.engine.transportStart();
  const dest = Tone.getDestination();
  const m = new Tone.Meter({ smoothing: 0 }); dest.connect(m);
  await sleep(400);                                    // attack
  let below = 0, samples = 0, pk = -Infinity;
  for (let k = 0; k < 120; k++) {                      // ~4.8 s of playback
    await sleep(40);
    const v = m.getValue();
    if (Number.isFinite(v)) { samples++; if (v > pk) pk = v; if (v < -55) below++; }
  }
  m.disconnect(); m.dispose();
  out.peak = pk;
  out.silentFraction = samples ? below / samples : 1;  // legato => rarely silent

  ed.engine.transportStop();
  await sleep(300);
  const ms = new Tone.Meter({ smoothing: 0 }); dest.connect(ms);
  let stopPk = -Infinity; for (let k = 0; k < 6; k++) { await sleep(30); const v = ms.getValue(); if (v > stopPk) stopPk = v; }
  ms.disconnect(); ms.dispose();
  out.afterStop = stopPk;
  return out;
});

const dB = (x) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(1) : String(x));
const checks = [
  ['loaded MONO + melody track 10 isolated', /mono/.test(r.status || '') && /trk 10/.test(r.status || ''), `status="${r.status}"`],
  ['plays the theme from the top (intro skipped)', r.peak > -45, `${dB(r.peak)} dB`],
  ['playback is CONTINUOUS (legato, rarely silent)', r.silentFraction < 0.30, `${(r.silentFraction * 100).toFixed(0)}% silent`],
  ['transport stop silences output', r.afterStop < -55, `${dB(r.afterStop)} dB`],
  ['no page errors', errors.length === 0, `${errors.length} errors`],
];

let ok = true;
for (const [name, pass, detail] of checks) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!pass) ok = false;
}
console.log(ok ? '  MIDIFILE-MONO 7.x PASS' : '  MIDIFILE-MONO 7.x FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
