// probe-cathedral.mjs — Phase 6: reverb~ pre-delay param + the "Cathedral Pad" demo.
// Verifies: (1) reverb~ exposes a `predelay` control and it maps to Tone's preDelay (seconds),
// (2) the demo loads, wires up, and produces audible output, (3) killing the dry+reverb input
// leaves a decaying reverb TAIL (proves the long reverb send is live), (4) no page errors.
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
  const peak = async (node, n = 12, gap = 30) => {
    const m = new Tone.Meter({ smoothing: 0 }); node.connect(m);
    let pk = -Infinity; for (let k = 0; k < n; k++) { await sleep(gap); const v = m.getValue(); if (v > pk) pk = v; }
    node.disconnect(m); m.dispose(); return pk;
  };

  // --- standalone reverb~: predelay control present and mapped to Tone preDelay (seconds) ----
  const rv = ed.graph.addNode('reverb', 40, 40, { decay: 4, predelay: 25, wet: 1 });
  await sleep(250);                                    // reverb generates its IR async
  const rvRt = ed.engine.runtimes.get(rv.id);
  out.predelayInlet = false; // predelay regenerates the IR, so it's intentionally NOT a mod inlet
  out.predelayInitial = rvRt.audioOut().preDelay;      // should be ~0.025 s
  ed.graph.setParam(rv.id, 'predelay', 40);
  await sleep(200);
  out.predelayAfterSet = rvRt.audioOut().preDelay;     // should be ~0.040 s
  ed.graph.removeNode(rv.id);

  // --- Cathedral Pad demo: keyboard-gated. Silent at rest, sustains while HELD, tail on release
  ed.loadDemo('cathedralPad');
  await sleep(600);                                    // let the reverb IR build
  const dest = Tone.getDestination();
  const kb = [...ed.graph.nodes.values()].find((n) => n.type === 'keyboard');

  out.restPeak = await peak(dest, 8, 30);              // no key pressed -> should be silent

  ed.fireNoteOn(kb.id, 45);                            // press & HOLD A2 (110 Hz)
  await sleep(700);                                    // past the 0.15 s attack
  out.heldEarly = await peak(dest, 10, 40);
  await sleep(1500);                                   // keep holding ~1.5 s more
  out.heldLate = await peak(dest, 10, 40);             // sustain=1 -> should stay up while held

  // pitch check: chord root drives u1 to the played note (~110 Hz)
  const u1 = [...ed.graph.nodes.values()].find((n) => n.type === 'unison');
  out.u1freq = ed.graph.nodes.get(u1.id).params.freq;

  ed.fireNoteOff(kb.id, 45);                           // release -> fade into the reverb tail
  await sleep(200);
  const tailEarly = await peak(dest, 6, 30);
  await sleep(4500);                                   // release 2 s + reverb 5 s -> well down
  const tailLate = await peak(dest, 6, 30);
  out.tailEarly = tailEarly; out.tailLate = tailLate;
  return out;
});

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(3) : String(x));
const dB = (x) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(1) : String(x));
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const checks = [
  ['reverb~ predelay=25ms maps to ~0.025 s', near(r.predelayInitial, 0.025, 0.004), `${num(r.predelayInitial)} s`],
  ['reverb~ predelay is live-settable (40ms -> ~0.040 s)', near(r.predelayAfterSet, 0.040, 0.004), `${num(r.predelayAfterSet)} s`],
  ['Cathedral Pad silent until a key is pressed', r.restPeak < -55, `${dB(r.restPeak)} dB`],
  ['held key is audible', r.heldEarly > -45, `${dB(r.heldEarly)} dB`],
  ['sound SUSTAINS while key is held (stays up)', r.heldLate > -45, `${dB(r.heldLate)} dB`],
  ['played A2 pitches the root voice to ~110 Hz', near(r.u1freq, 110, 3), `${dB(r.u1freq)} Hz`],
  ['reverb TAIL rings after release', r.tailEarly > -55, `${dB(r.tailEarly)} dB`],
  ['reverb TAIL then decays (>=15 dB down)', r.tailEarly - r.tailLate >= 15, `${dB(r.tailEarly)} -> ${dB(r.tailLate)} dB`],
  ['no page errors', errors.length === 0, `${errors.length} errors`],
];

let ok = true;
for (const [name, pass, detail] of checks) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!pass) ok = false;
}
console.log(ok ? '  CATHEDRAL 6.x PASS' : '  CATHEDRAL 6.x FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
