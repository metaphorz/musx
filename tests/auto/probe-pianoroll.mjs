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

  const dest = Tone.getDestination();

  // 1) the built-in demo (roll -> cathedral subpatch -> dac) loads and plays the melody
  ed.loadDemo('pianorollSilo');
  await sleep(300);
  const prDemo = [...ed.graph.nodes.values()].find((n) => n.type === 'pianoroll');
  out.noteCount = (prDemo.params.notes || []).length;
  Tone.getTransport().stop();                    // reset position to 0 (pause would hold it)
  ed.engine.transportStart();
  await sleep(500);
  out.playing = await peak(dest, 40, 30);
  ed.engine.transportStop();
  await sleep(200);

  // 2) build a minimal test voice (roll -> osc -> adsr veldb -> dac) to check the node generically:
  //    it drives the osc frequency, a live edit rebuilds playback, and velocity reaches the audio.
  ed.graph.clear();
  const pr = ed.graph.addNode('pianoroll', 40, 40, { bars: 1, loop: 'on', notes: [
    { t: 0, dur: 1, pitch: 69, vel: 120 },   // loud
    { t: 2, dur: 1, pitch: 69, vel: 20 },    // soft (bars=1 -> wraps; sampled after)
  ] });
  const os = ed.graph.addNode('osc', 40, 300, { wave: 'sawtooth' });
  const ad = ed.graph.addNode('adsr', 40, 500, { attack: 0.01, decay: 0.1, sustain: 0.9, release: 0.1, veldb: -20 });
  const dc = ed.graph.addNode('dac', 40, 700, {});
  ed.graph.addConnection({ nodeId: pr.id, port: 'freq' }, { nodeId: os.id, port: 'freq' }, 'control');
  ed.graph.addConnection({ nodeId: pr.id, port: 'trig' }, { nodeId: ad.id, port: 'trig' }, 'control');
  ed.graph.addConnection({ nodeId: os.id, port: 'out' }, { nodeId: ad.id, port: 'in' }, 'audio');
  ed.graph.addConnection({ nodeId: ad.id, port: 'out' }, { nodeId: dc.id, port: 'in' }, 'audio');
  await sleep(100);

  ed.graph.setParam(pr.id, 'bars', 2);          // fit both notes; live rebuild
  Tone.getTransport().stop();                    // reset to 0 so the beat-0 note fires
  ed.engine.transportStart();
  await sleep(150);
  out.loud = await peak(dest, 8, 25);
  out.oscFreq = ed.engine.runtimes.get(os.id).audioOut('out').frequency.value; // roll drives osc
  await sleep(850);
  out.soft = await peak(dest, 8, 25);
  ed.engine.transportStop();
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
