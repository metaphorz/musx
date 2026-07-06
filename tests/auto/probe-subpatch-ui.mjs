// probe-subpatch-ui.mjs — Phase 3.2: enter/edit/exit a subpatch through the editor, and
// confirm the box gains ports from the boundary objects and passes audio after editing.
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
  // create an empty patcher at the root
  const pat = ed.graph.addNode('patcher', 300, 120, {});
  // descend into it (as a double-click would)
  ed.enterPatcher(pat);
  out.enteredDepth = ed.ctxStack.length;                 // expect 2
  out.breadcrumbShown = getComputedStyle(ed._breadcrumb).display !== 'none';
  out.breadcrumbSegs = ed._breadcrumb.querySelectorAll('.bc-seg').length; // expect 2
  // build the guts: inlet~ -> gain -> outlet~
  const i = ed.graph.addNode('inlet~', 40, 40, {});
  const gN = ed.graph.addNode('gain', 200, 40, { level: 0.8 });
  const o = ed.graph.addNode('outlet~', 360, 40, {});
  ed.graph.addConnection({ nodeId: i.id, port: 'out' }, { nodeId: gN.id, port: 'in' }, 'audio');
  ed.graph.addConnection({ nodeId: gN.id, port: 'out' }, { nodeId: o.id, port: 'in' }, 'audio');
  // climb back out to the root
  ed._exitTo(0);
  out.exitedDepth = ed.ctxStack.length;                  // expect 1
  // the patcher box view should now show 1 inlet + 1 outlet
  const patView = ed.views.get(pat.id);
  out.inPorts = patView.el.querySelectorAll('.ports.in .port').length;
  out.outPorts = patView.el.querySelectorAll('.ports.out .port').length;
  await new Promise((r) => setTimeout(r, 300));           // let the debounced rebuild fire

  // wire osc -> patcher.in1 -> dac at the root and measure
  const osc = ed.graph.addNode('osc', 40, 120, { wave: 'sawtooth', freq: 220 });
  const dac = ed.graph.addNode('dac', 560, 120, {});
  ed.graph.addConnection({ nodeId: osc.id, port: 'out' }, { nodeId: pat.id, port: 'in1' }, 'audio');
  ed.graph.addConnection({ nodeId: pat.id, port: 'out1' }, { nodeId: dac.id, port: 'in' }, 'audio');
  await new Promise((r) => setTimeout(r, 300));
  const meter = new Tone.Meter({ smoothing: 0.2 }); Tone.getDestination().connect(meter);
  let peak = -Infinity; for (let k = 0; k < 12; k++) { await new Promise((r) => setTimeout(r, 40)); const v = meter.getValue(); if (v > peak) peak = v; }
  out.peak = peak;
  return out;
});

const checks = [
  ['enter descends (stack depth 2, breadcrumb shown, 2 segs)', r.enteredDepth === 2 && r.breadcrumbShown && r.breadcrumbSegs === 2, `depth ${r.enteredDepth}, segs ${r.breadcrumbSegs}`],
  ['exit returns to root (stack depth 1)', r.exitedDepth === 1, `depth ${r.exitedDepth}`],
  ['box gained ports from boundary objects (1 in / 1 out)', r.inPorts === 1 && r.outPorts === 1, `${r.inPorts} in / ${r.outPorts} out`],
  ['audio flows through the built subpatch (> -60 dB)', r.peak > -60, r.peak.toFixed(1) + ' dB'],
  ['no page errors', errors.length === 0, `${errors.length} errors`],
];
let ok = true;
for (const [name, pass, detail] of checks) { if (!pass) ok = false; console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}  [${detail}]`); }
console.log(ok ? '  SUBPATCH UI 3.2 PASS' : '  FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
