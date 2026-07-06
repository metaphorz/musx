// probe-breakpoint.mjs — Phase 2.5b: breakpoint~ plays its drawn curve as a control stream.
// Wire breakpoint~(val) -> osc(freq) with a triangle curve over lo..hi and confirm the
// oscillator frequency actually sweeps that range while the transport runs.
import { chromium } from 'playwright';

const PORT = process.argv[2] || '8123';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext()).newPage();
page.on('pageerror', (e) => console.log(`  [PAGEERROR] ${e.message}`));

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.editor && window.Tone);
await page.click('#btn-audio');
await sleep(400);

const r = await page.evaluate(async () => {
  const Tone = window.Tone, g = window.editor.graph, rt = window.editor.engine.runtimes;
  const osc = g.addNode('osc', 40, 40, { wave: 'sine', freq: 440 });
  const bp = g.addNode('breakpoint', 320, 40, { dur: 0.5, lo: 200, hi: 800, loop: 'on' }); // default triangle points
  g.addConnection({ nodeId: bp.id, port: 'val' }, { nodeId: osc.id, port: 'freq' }, 'control');
  rt.get(bp.id).start();                 // schedule the control Loop
  Tone.getTransport().start();           // loops only tick while the transport runs
  const oscObj = rt.get(osc.id).audioOut();
  let mn = 1e9, mx = -1e9;
  for (let i = 0; i < 48; i++) { await new Promise((r) => setTimeout(r, 25)); const f = oscObj.frequency.value; if (f < mn) mn = f; if (f > mx) mx = f; }
  return { mn, mx };
});

const checks = [
  ['sweeps up toward hi (max > 700)', r.mx > 700, 'max ' + r.mx.toFixed(0)],
  ['sweeps down toward lo (min < 300)', r.mn < 300, 'min ' + r.mn.toFixed(0)],
  ['full range covered (max-min > 300)', (r.mx - r.mn) > 300, 'range ' + (r.mx - r.mn).toFixed(0)],
];
let ok = true;
for (const [name, pass, detail] of checks) { if (!pass) ok = false; console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}  [${detail}]`); }
console.log(ok ? '  BREAKPOINT PASS' : '  FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
