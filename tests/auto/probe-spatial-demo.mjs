// probe-spatial-demo.mjs — Phase 6: verify the "3D Orbit (spatial)" demo loads and actually
// moves: as the funcgen LFOs sweep spat~'s x/z, the left/right balance should swing over time
// (source travels around the head). Confirms wiring (funcgen val -> spat x/z) works end to end.
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
await sleep(300);

const r = await page.evaluate(async () => {
  const Tone = window.Tone, ed = window.editor;
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  ed.loadDemo('spatialOrbit');
  await sleep(300);
  ed.engine.transportStart();   // funcgen LFOs run off the transport (== the Play button)
  await sleep(200);

  const sp = [...ed.graph.nodes.values()].find((n) => n.type === 'spat');
  const node = ed.engine.runtimes.get(sp.id).audioOut();
  const split = new Tone.Split(2), mL = new Tone.Meter({ smoothing: 0 }), mR = new Tone.Meter({ smoothing: 0 });
  node.connect(split); split.connect(mL, 0, 0); split.connect(mR, 1, 0);

  // Sample the L-R balance over a full ~6 s orbit cycle; a moving source makes it swing +/-.
  let minBal = Infinity, maxBal = -Infinity, present = -Infinity;
  for (let k = 0; k < 140; k++) {
    await sleep(50);
    const l = mL.getValue(), rr = mR.getValue();
    if (Number.isFinite(l) && Number.isFinite(rr)) {
      const bal = l - rr; if (bal < minBal) minBal = bal; if (bal > maxBal) maxBal = bal;
      if (l > present) present = l;
    }
  }
  node.disconnect(split); split.dispose(); mL.dispose(); mR.dispose();
  return { present, minBal, maxBal, swing: maxBal - minBal };
});

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(1) : String(x));
const checks = [
  ['demo produces audio', r.present > -55, `${num(r.present)} dB`],
  ['source ORBITS (L-R balance swings over time)', r.swing >= 6, `swing ${num(r.swing)} dB (${num(r.minBal)}..${num(r.maxBal)})`],
  ['reaches a LEFT-favoring moment', r.maxBal >= 3, `max L-R ${num(r.maxBal)} dB`],
  ['reaches a RIGHT-favoring moment', r.minBal <= -3, `min L-R ${num(r.minBal)} dB`],
  ['no page errors', errors.length === 0, `${errors.length} errors`],
];

let ok = true;
for (const [name, pass, detail] of checks) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!pass) ok = false;
}
console.log(ok ? '  SPATIAL-DEMO 6.x PASS' : '  SPATIAL-DEMO 6.x FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
