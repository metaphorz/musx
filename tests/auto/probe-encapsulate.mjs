// probe-encapsulate.mjs — Phase 3.3: collapse a selection of objects into a `patcher`,
// auto-creating boundary objects for the cables that crossed the selection boundary, and
// confirm the box wires up (ports + outer cables) and still passes audio.
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

  // --- Case 1: middle-node encapsulation. osc -> filter -> dac; encapsulate the filter. ---
  const osc = ed.graph.addNode('osc', 60, 60, { wave: 'sawtooth', freq: 220 });
  const lp = ed.graph.addNode('filter', 260, 60, { freq: 800 });
  const dac = ed.graph.addNode('dac', 460, 60, {});
  ed.graph.addConnection({ nodeId: osc.id, port: 'out' }, { nodeId: lp.id, port: 'in' }, 'audio');
  ed.graph.addConnection({ nodeId: lp.id, port: 'out' }, { nodeId: dac.id, port: 'in' }, 'audio');
  await new Promise((r) => setTimeout(r, 200));

  // select just the filter and encapsulate (as Cmd+E / the toolbar button would)
  ed.select(ed.views.get(lp.id));
  ed.encapsulateSelection();
  const box = [...ed.graph.nodes.values()].find((n) => n.type === 'patcher');
  out.boxCreated = !!box;
  out.filterGoneFromRoot = !ed.graph.nodes.has(lp.id);

  // the box view should show 1 inlet + 1 outlet (derived from the boundary objects)
  const bv = ed.views.get(box.id);
  out.inPorts = bv.el.querySelectorAll('.ports.in .port').length;
  out.outPorts = bv.el.querySelectorAll('.ports.out .port').length;

  // outer cables rewired: osc -> box.in1 and box.out1 -> dac
  const conns = [...ed.graph.connections.values()];
  out.oscToBox = conns.some((c) => c.from.nodeId === osc.id && c.to.nodeId === box.id && c.to.port === 'in1');
  out.boxToDac = conns.some((c) => c.from.nodeId === box.id && c.from.port === 'out1' && c.to.nodeId === dac.id);

  // inner patch: inlet~ + filter + outlet~, wired through
  const patch = box.params.patch;
  out.innerTypes = patch.nodes.map((n) => n.type).sort().join(',');
  out.innerHasLowpass = patch.nodes.some((n) => n.type === 'filter');
  out.innerCableCount = patch.connections.length; // inlet~->lp, lp->outlet~ => 2

  await new Promise((r) => setTimeout(r, 350)); // let the debounced rebuild fire
  const meter = new Tone.Meter({ smoothing: 0.2 }); Tone.getDestination().connect(meter);
  let peak = -Infinity; for (let k = 0; k < 12; k++) { await new Promise((r) => setTimeout(r, 40)); const v = meter.getValue(); if (v > peak) peak = v; }
  out.peak = peak;

  // --- Case 2: two connected nodes selected -> internal cable preserved, no ports from it. ---
  ed.graph.clear();
  const a = ed.graph.addNode('osc', 60, 300, { wave: 'sine', freq: 110 });
  const b = ed.graph.addNode('gain', 260, 300, { level: 0.7 });
  ed.graph.addConnection({ nodeId: a.id, port: 'out' }, { nodeId: b.id, port: 'in' }, 'audio');
  await new Promise((r) => setTimeout(r, 100));
  ed.select(ed.views.get(a.id));
  ed.toggleSelect(ed.views.get(b.id));         // now both selected
  out.selCount = ed.selection.size;            // expect 2
  ed.encapsulateSelection();
  const box2 = [...ed.graph.nodes.values()].find((n) => n.type === 'patcher');
  const bv2 = ed.views.get(box2.id);
  out.case2InPorts = bv2.el.querySelectorAll('.ports.in .port').length;   // 0 (nothing crossed in)
  out.case2OutPorts = bv2.el.querySelectorAll('.ports.out .port').length; // 0 (nothing crossed out)
  const p2 = box2.params.patch;
  out.case2InternalCable = p2.connections.some((c) => {
    const from = p2.nodes.find((n) => n.id === c.from.nodeId), to = p2.nodes.find((n) => n.id === c.to.nodeId);
    return from && to && from.type === 'osc' && to.type === 'gain';
  });
  out.case2RootOnlyBox = ed.graph.nodes.size === 1; // only the patcher remains at root

  return out;
});

const checks = [
  ['box created from a single-node selection', r.boxCreated],
  ['original filter removed from the root graph', r.filterGoneFromRoot],
  ['box derived 1 inlet + 1 outlet from crossings', r.inPorts === 1 && r.outPorts === 1, `${r.inPorts} in / ${r.outPorts} out`],
  ['outer cable osc -> box.in1 rewired', r.oscToBox],
  ['outer cable box.out1 -> dac rewired', r.boxToDac],
  ['inner patch holds inlet~ + filter + outlet~', r.innerTypes === 'filter,inlet~,outlet~', r.innerTypes],
  ['inner cables wired through (2)', r.innerCableCount === 2, `${r.innerCableCount}`],
  ['audio still flows through the encapsulated box (> -60 dB)', r.peak > -60, r.peak.toFixed(1) + ' dB'],
  ['multi-select gathered 2 nodes', r.selCount === 2, `${r.selCount}`],
  ['internal-only selection creates 0 ports', r.case2InPorts === 0 && r.case2OutPorts === 0, `${r.case2InPorts}/${r.case2OutPorts}`],
  ['internal osc->gain cable preserved inside the box', r.case2InternalCable],
  ['root left with only the new patcher', r.case2RootOnlyBox, `${r.case2RootOnlyBox}`],
  ['no page errors', errors.length === 0, `${errors.length} errors`],
];
let ok = true;
for (const [name, pass, detail] of checks) { if (!pass) ok = false; console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`); }
console.log(ok ? '  ENCAPSULATE 3.3 PASS' : '  FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
