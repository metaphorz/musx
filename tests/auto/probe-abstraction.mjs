// probe-abstraction.mjs — Phase 3.4: file-referenced abstractions. A `patcher` with a
// `params.ref` fetches its guts from a served .json file; many boxes share one definition;
// editing the file + Reload propagates; entering a referenced box is read-only; Detach forks it.
import { chromium } from 'playwright';

const PORT = process.argv[2] || '8123';
const REF = 'patches/abstractions/gain-half.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log(`  [PAGEERROR] ${e.message}`); });

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.editor && window.Tone);
await page.click('#btn-audio');
await sleep(400);

const r = await page.evaluate(async (REF) => {
  const Tone = window.Tone, ed = window.editor;
  const out = {};
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  // --- build osc -> [referenced patcher] -> dac -------------------------------------------
  const osc = ed.graph.addNode('osc', 60, 60, { wave: 'sawtooth', freq: 220 });
  const dac = ed.graph.addNode('dac', 520, 60, {});
  const box = ed.graph.addNode('patcher', 290, 60, { ref: REF });   // references the .json file
  const { changed, errors } = await ed._resolveAbstractions();       // fetch + fill params.patch
  out.resolvedChanged = changed.length;                              // expect 1 (the box)
  out.resolveErrors = errors.length;                                 // expect 0

  // ports derived from the fetched patch's boundary objects (inlet~ + outlet~)
  const bv = ed.views.get(box.id);
  out.inPorts = bv.el.querySelectorAll('.ports.in .port').length;    // expect 1
  out.outPorts = bv.el.querySelectorAll('.ports.out .port').length;  // expect 1
  out.innerLevel = box.params.patch.nodes.find((n) => n.type === 'gain')?.params.level; // 0.5

  // wire through the box and confirm audio flows
  ed.graph.addConnection({ nodeId: osc.id, port: 'out' }, { nodeId: box.id, port: 'in1' }, 'audio');
  ed.graph.addConnection({ nodeId: box.id, port: 'out1' }, { nodeId: dac.id, port: 'in' }, 'audio');
  await sleep(300);
  const meter = new Tone.Meter({ smoothing: 0.2 }); Tone.getDestination().connect(meter);
  let peak = -Infinity; for (let k = 0; k < 12; k++) { await sleep(40); const v = meter.getValue(); if (v > peak) peak = v; }
  out.level = peak;

  // --- second instance shares the same file ----------------------------------------------
  const box2 = ed.graph.addNode('patcher', 290, 260, { ref: REF });
  await ed._resolveAbstractions();
  out.box2HasPatch = !!(box2.params.patch && box2.params.patch.nodes.length);
  out.sharedRef = box.params.ref === box2.params.ref;

  // --- propagation: edit the source (stub fetch to a louder gain) + Reload ----------------
  const realFetch = window.fetch;
  window.fetch = async () => ({ ok: true, json: async () => ({
    version: 1,
    nodes: [
      { id: 'in1', type: 'inlet~', x: 60, y: 40, params: {} },
      { id: 'g', type: 'gain', x: 60, y: 160, params: { level: 0.9 } },
      { id: 'out1', type: 'outlet~', x: 60, y: 280, params: {} },
    ],
    connections: [
      { from: { nodeId: 'in1', port: 'out' }, to: { nodeId: 'g', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'g', port: 'out' }, to: { nodeId: 'out1', port: 'in' }, kind: 'audio' },
    ],
  }) });
  await ed.reloadAbstractions();
  window.fetch = realFetch;
  const boxNow = ed.rootGraph.nodes.get(box.id);
  out.propagatedLevel = boxNow.params.patch.nodes.find((n) => n.type === 'gain')?.params.level; // 0.9

  // --- read-only entry --------------------------------------------------------------------
  ed.enterPatcher(boxNow);
  out.readonlyFrame = !!ed._activeFrame().readonly;                  // expect true
  out.bannerShown = getComputedStyle(ed._refBanner).display !== 'none';
  out.guardBlocks = ed._readonlyGuard();                            // expect true

  // --- detach forks to a private, editable inline copy ------------------------------------
  ed._detachPatcher();
  out.refDropped = boxNow.params.ref === undefined;                 // ref gone
  out.patchKept = !!(boxNow.params.patch && boxNow.params.patch.nodes.length); // patch retained
  out.editableNow = ed._activeFrame().readonly === false;           // re-entered editable
  ed._exitTo(0);

  return out;
}, REF);

const checks = [
  ['reference resolved (1 box fetched, 0 errors)', r.resolvedChanged === 1 && r.resolveErrors === 0, `${r.resolvedChanged}/${r.resolveErrors}`],
  ['box derived 1 inlet + 1 outlet from the fetched patch', r.inPorts === 1 && r.outPorts === 1, `${r.inPorts} in / ${r.outPorts} out`],
  ['fetched inner gain level = 0.5', r.innerLevel === 0.5, `${r.innerLevel}`],
  ['audio flows through the referenced box (> -60 dB)', r.level > -60, `${r.level?.toFixed?.(1)} dB`],
  ['second instance resolves from the same file', r.box2HasPatch && r.sharedRef, `patch=${r.box2HasPatch} shared=${r.sharedRef}`],
  ['edit + Reload propagates (gain 0.5 -> 0.9)', r.propagatedLevel === 0.9, `${r.propagatedLevel}`],
  ['entering a referenced box is read-only (frame + banner + guard)', r.readonlyFrame && r.bannerShown && r.guardBlocks === true, `ro=${r.readonlyFrame} banner=${r.bannerShown} guard=${r.guardBlocks}`],
  ['Detach forks: ref dropped, patch kept, now editable', r.refDropped && r.patchKept && r.editableNow, `ref=${r.refDropped} patch=${r.patchKept} edit=${r.editableNow}`],
  ['no page errors', errors.length === 0, `${errors.length} errors`],
];

let ok = true;
for (const [name, pass, detail] of checks) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!pass) ok = false;
}
console.log(ok ? '  ABSTRACTION 3.4 PASS' : '  ABSTRACTION 3.4 FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
