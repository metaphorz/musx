// probe-spat.mjs — Phase 6: 3D spatialization. Verifies spat~ (Tone.Panner3D / HRTF):
// audio flows through, x=-10 favors LEFT, x=+10 favors RIGHT, and the x/y/z params get
// control inlets (mod:true) so an xy pad / funcgen can drive position.
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

  const lrPeak = async (node) => {
    const split = new Tone.Split(2), mL = new Tone.Meter({ smoothing: 0 }), mR = new Tone.Meter({ smoothing: 0 });
    node.connect(split); split.connect(mL, 0, 0); split.connect(mR, 1, 0);
    let l = -Infinity, rr = -Infinity; for (let k = 0; k < 15; k++) { await sleep(30); const a = mL.getValue(), b = mR.getValue(); if (a > l) l = a; if (b > rr) rr = b; }
    node.disconnect(split); split.dispose(); mL.dispose(); mR.dispose();
    return { l, r: rr };
  };
  const monoPeak = async (node) => {
    const m = new Tone.Meter({ smoothing: 0 }); node.connect(m);
    let pk = -Infinity; for (let k = 0; k < 12; k++) { await sleep(30); const v = m.getValue(); if (v > pk) pk = v; }
    node.disconnect(m); m.dispose(); return pk;
  };

  // High-frequency tone: HRTF localizes low tones by TIMING (ITD), so interaural LEVEL
  // difference only shows at high freqs where the head casts an acoustic shadow.
  const osc = ed.graph.addNode('osc', 60, 60, { wave: 'sine', freq: 4000 });
  const spat = ed.graph.addNode('spat', 260, 60, { x: -10, y: 0, z: -1 });
  ed.graph.addConnection({ nodeId: osc.id, port: 'out' }, { nodeId: spat.id, port: 'in' }, 'audio');
  await sleep(200);

  const spatOut = ed.engine.runtimes.get(spat.id).audioOut();
  out.audioPresent = await monoPeak(spatOut);
  out.left = await lrPeak(spatOut);          // x = -10 -> should favor LEFT
  ed.graph.setParam(spat.id, 'x', 10);       // live move to hard right
  await sleep(200);
  out.right = await lrPeak(spatOut);

  // x/y/z control inlets present (auto-added via mod:true)
  const el = ed.views.get(spat.id).el;
  out.xyzInlets = ['x', 'y', 'z'].every((n) => !!el.querySelector(`.ports.in .port[data-port="${n}"]`));

  return out;
});

const num = (x) => (typeof x === 'number' ? x.toFixed(1) : String(x));
const checks = [
  ['spat~ produces audio', r.audioPresent > -55, `${num(r.audioPresent)} dB`],
  ['spat~ x=-10 favors LEFT', r.left.l - r.left.r >= 5, `L ${num(r.left.l)} / R ${num(r.left.r)}`],
  ['spat~ x=+10 favors RIGHT', r.right.r - r.right.l >= 5, `L ${num(r.right.l)} / R ${num(r.right.r)}`],
  ['spat~ has x/y/z control inlets', r.xyzInlets === true, `${r.xyzInlets}`],
  ['no page errors', errors.length === 0, `${errors.length} errors`],
];

let ok = true;
for (const [name, pass, detail] of checks) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!pass) ok = false;
}
console.log(ok ? '  SPAT 6.x PASS' : '  SPAT 6.x FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
