// probe-pianoroll.mjs — Phase 9: the pianoroll track sequencer. Verifies the demo plays (drives a
// voice via freq+trig), velocity reaches the audio (soft vs loud notes differ), a live note edit
// rebuilds playback, and there are no page errors.
import { chromium } from 'playwright';

const PORT = process.argv[2] || '8123';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log(`  [PAGEERROR] ${e.message}`); });

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.editor && window.Tone);
await page.click('#btn-audio');
await sleep(300);

const r = await page.evaluate(async () => {
  const Tone = window.Tone, ed = window.editor;
  const out = {};
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const peak = async (node, n, gap) => {
    const m = new Tone.Meter({ smoothing: 0 }); node.connect(m);
    let pk = -Infinity; for (let k = 0; k < n; k++) { await sleep(gap); const v = m.getValue(); if (v > pk) pk = v; }
    node.disconnect(m); m.dispose(); return pk;
  };

  ed.loadDemo('pianorollSilo');
  await sleep(200);
  const pr = [...ed.graph.nodes.values()].find((n) => n.type === 'pianoroll');
  const osc = [...ed.graph.nodes.values()].find((n) => n.type === 'osc');
  out.noteCount = (pr.params.notes || []).length;

  // plays the melody
  ed.engine.transportStart();
  await sleep(500);
  const dest = Tone.getDestination();
  out.playing = await peak(dest, 40, 30);
  // the osc frequency is being driven by the roll (a note is sounding)
  out.oscFreq = ed.engine.runtimes.get(osc.id).audioOut('out').frequency.value;
  ed.engine.transportStop();
  await sleep(200);

  // live edit: replace notes with two contrasting-velocity notes, confirm playback rebuilds and
  // velocity reaches the audio (loud note louder than soft note through adsr~ veldb)
  ed.graph.setParam(pr.id, 'notes', [
    { t: 0, dur: 1, pitch: 69, vel: 120 },   // loud
    { t: 2, dur: 1, pitch: 69, vel: 20 },    // soft
  ]);
  ed.graph.setParam(pr.id, 'bars', 1);
  await sleep(50);
  ed.engine.transportStart();
  // sample the first beat (loud) then ~beat 2 (soft)
  await sleep(150); const loud = await peak(dest, 8, 25);
  await sleep(650); const soft = await peak(dest, 8, 25);
  ed.engine.transportStop();
  out.loud = loud; out.soft = soft;
  return out;
});

const dB = (x) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(1) : String(x));
const checks = [
  ['demo loaded the Silo melody', r.noteCount === 16, `${r.noteCount} notes`],
  ['pianoroll plays (drives a voice)', r.playing > -45, `${dB(r.playing)} dB`],
  ['roll drives the osc frequency', r.oscFreq > 100, `${dB(r.oscFreq)} Hz`],
  ['live note edit rebuilds playback', r.loud > -45, `${dB(r.loud)} dB`],
  ['velocity reaches the audio (loud > soft)', r.loud - r.soft >= 6, `loud ${dB(r.loud)} vs soft ${dB(r.soft)}`],
  ['no page errors', errors.length === 0, `${errors.length}`],
];
let ok = true;
for (const [name, pass, detail] of checks) { console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`); if (!pass) ok = false; }
console.log(ok ? '  PIANOROLL 9.x PASS' : '  PIANOROLL 9.x FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
