// probe-uci-synth.mjs — Phase 7: the "UCI Arts — Mono MIDI Synth" demo, a replica of Dobrian's
// Very Simple Monophonic MIDI Synthesizer. Verifies: it loads & plays the melody (mono sawtooth),
// the adsr~ velocity->amp mapping actually makes amplitude track note-on velocity, and the credit
// names Dobrian/2017 with the UCI link. Also directly checks the velToAmp dB curve via adsr.
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
  const peak = async (node, n, gap) => {
    const m = new Tone.Meter({ smoothing: 0 }); node.connect(m);
    let pk = -Infinity; for (let k = 0; k < n; k++) { await sleep(gap); const v = m.getValue(); if (v > pk) pk = v; }
    node.disconnect(m); m.dispose(); return pk;
  };

  ed.loadDemo('uciMonoSynth');
  out.creditsText = document.getElementById('patch-credits-text')?.textContent || '';
  out.creditsLink = document.getElementById('patch-credits-link')?.getAttribute('href') || '';

  const mf = [...ed.graph.nodes.values()].find((n) => n.type === 'midifile');
  const osc = [...ed.graph.nodes.values()].find((n) => n.type === 'osc');
  const env = [...ed.graph.nodes.values()].find((n) => n.type === 'adsr');
  for (let k = 0; k < 40 && !/notes/.test(mf.params.status || ''); k++) await sleep(50);
  out.oscWave = osc.params.wave;
  out.veldb = env.params.veldb;

  // it plays the melody (mono sawtooth). Track-10 velocities span 3..114, so peak over a few
  // seconds to catch the strong notes (soft grace notes are near-silent by Dobrian's dB curve).
  ed.engine.transportStart();
  await sleep(400);
  const dest = Tone.getDestination();
  out.playing = await peak(dest, 90, 40);              // ~3.6 s window
  ed.engine.transportStop();
  await sleep(200);

  // Directly exercise the velocity->amplitude mapping on the adsr~ voice: a hard note-on should
  // be clearly louder than a soft one (Dobrian's dbtoa curve). Tap the env output.
  const envRt = ed.engine.runtimes.get(env.id);
  const envOut = envRt.audioOut();
  ed.graph.setParam(osc.id, 'freq', 220);
  await sleep(20);
  envRt.receive('trig', { type: 'noteon', freq: 220, velocity: 127 }); // full velocity
  const loud = await peak(envOut, 10, 25);
  envRt.receive('trig', { type: 'noteoff' });
  await sleep(120);
  envRt.receive('trig', { type: 'noteon', freq: 220, velocity: 30 });  // soft
  const soft = await peak(envOut, 10, 25);
  envRt.receive('trig', { type: 'noteoff' });
  out.loud = loud; out.soft = soft; out.velSpread = loud - soft;
  return out;
});

const dB = (x) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(1) : String(x));
const checks = [
  ['sawtooth oscillator (mtof -> saw)', r.oscWave === 'sawtooth', `${r.oscWave}`],
  ['adsr~ velocity->amp is ON (veldb < 0)', r.veldb < 0, `veldb=${r.veldb}`],
  ['plays the melody', r.playing > -45, `${dB(r.playing)} dB`],
  ['velocity MODULATES amplitude (loud >> soft)', r.velSpread >= 8, `v127 ${dB(r.loud)} vs v30 ${dB(r.soft)} dB (Δ${dB(r.velSpread)})`],
  ['credit names Dobrian / 2017', /Dobrian/.test(r.creditsText) && /2017/.test(r.creditsText), `"${r.creditsText}"`],
  ['credit links to UCI cookbook', /music\.arts\.uci\.edu/.test(r.creditsLink), `${r.creditsLink}`],
  ['no page errors', errors.length === 0, `${errors.length} errors`],
];

let ok = true;
for (const [name, pass, detail] of checks) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!pass) ok = false;
}
console.log(ok ? '  UCI-SYNTH 7.x PASS' : '  UCI-SYNTH 7.x FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
