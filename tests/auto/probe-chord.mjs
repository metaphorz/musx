// probe-chord.mjs — Phase 4.8: the `chord` node turns one root frequency into chord tones
// (quality + size), and the updated Richsound Chord demo plays/sustains through it.
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

  // chord -> 4 osc; read each osc's frequency to see the chord tones the node emits
  const ch = ed.graph.addNode('chord', 60, 60, { quality: 'minor', size: 'triad (1-3-5)' });
  const oscs = [1, 2, 3, 4].map((k) => ed.graph.addNode('osc', 300, k * 80, { freq: 0 }));
  oscs.forEach((o, i) => ed.graph.addConnection({ nodeId: ch.id, port: String(i + 1) }, { nodeId: o.id, port: 'freq' }, 'control'));
  await sleep(80);
  const chRt = ed.engine.runtimes.get(ch.id);
  const freqs = () => oscs.map((o) => Math.round(ed.engine.runtimes.get(o.id).audioOut().frequency.value * 10) / 10);

  chRt.receive('root', 220);                       // A3
  out.minorTriad = freqs();                        // [220, 261.6, 329.6, 220(wrap)]
  ed.graph.setParam(ch.id, 'size', 'root (1)');
  out.rootOnly = freqs();                          // [220, 220, 220, 220]
  ed.graph.setParam(ch.id, 'size', 'power (1-5)');
  out.power = freqs();                             // [220, 329.6, 220, 329.6]
  ed.graph.setParam(ch.id, 'size', 'triad (1-3-5)');
  ed.graph.setParam(ch.id, 'quality', 'major');
  out.majorTriad = freqs();                        // [220, 277.2, 329.6, 220]

  // updated demo still plays + sustains through the chord node
  ed.loadDemo('richsound');
  await sleep(300);
  const nodes = [...ed.graph.nodes.values()];
  out.hasChordNode = nodes.some((n) => n.type === 'chord');
  const kb = nodes.find((n) => n.type === 'keyboard');
  const m = new Tone.Meter({ smoothing: 0.1 }); Tone.getDestination().connect(m);
  const peak = async (ms) => { let pk = -Infinity; for (let k = 0; k < Math.ceil(ms / 40); k++) { await sleep(40); const v = m.getValue(); if (v > pk) pk = v; } return pk; };
  ed.fireNoteOn(kb.id, 48);
  out.held = await peak(1200);
  ed.fireNoteOff(kb.id, 48);
  await sleep(2000);
  out.released = await peak(300);
  m.dispose();
  return out;
});

const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
const arrNear = (arr, exp) => arr.length === exp.length && arr.every((v, i) => near(v, exp[i]));
const checks = [
  ['minor triad from root 220 = [220, 261.6, 329.6, 220]', arrNear(r.minorTriad, [220, 261.6, 329.6, 220]), JSON.stringify(r.minorTriad)],
  ['size "root" doubles the root on all voices', arrNear(r.rootOnly, [220, 220, 220, 220]), JSON.stringify(r.rootOnly)],
  ['power chord = root + fifth (wrapped)', arrNear(r.power, [220, 329.6, 220, 329.6]), JSON.stringify(r.power)],
  ['major triad third rises to 277.2', arrNear(r.majorTriad, [220, 277.2, 329.6, 220]), JSON.stringify(r.majorTriad)],
  ['demo uses the chord node', r.hasChordNode === true, `${r.hasChordNode}`],
  ['demo chord sustains while held', r.held > -55, `${r.held?.toFixed?.(1)} dB`],
  ['demo chord fades on release', r.released < r.held - 15, `held ${r.held?.toFixed?.(1)} -> ${r.released?.toFixed?.(1)} dB`],
  ['no page errors', errors.length === 0, `${errors.length} errors`],
];

let ok = true;
for (const [name, pass, detail] of checks) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!pass) ok = false;
}
console.log(ok ? '  CHORD 4.8 PASS' : '  CHORD 4.8 FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
