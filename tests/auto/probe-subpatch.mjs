// probe-subpatch.mjs — Phase 3.1: a patcher box runs an inner graph and bridges audio +
// control across its boundary objects. Built through the real engine (no UI yet).
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

  // (A) audio subpatch: box = [ inlet~ -> filter -> outlet~ ]; osc -> box -> dac
  const audioPatch = {
    nodes: [
      { id: 'i', type: 'inlet~', x: 40, y: 40, params: {} },
      { id: 'f', type: 'filter', x: 200, y: 40, params: { type: 'lowpass', cutoff: 600, Q: 1 } },
      { id: 'o', type: 'outlet~', x: 360, y: 40, params: {} },
    ],
    connections: [
      { from: { nodeId: 'i', port: 'out' }, to: { nodeId: 'f', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'f', port: 'out' }, to: { nodeId: 'o', port: 'in' }, kind: 'audio' },
    ],
  };
  const osc = g.addNode('osc', 40, 40, { wave: 'sawtooth', freq: 220 });
  const pat = g.addNode('patcher', 320, 40, { patch: audioPatch });
  const dac = g.addNode('dac', 600, 40, {});
  g.addConnection({ nodeId: osc.id, port: 'out' }, { nodeId: pat.id, port: 'in1' }, 'audio');
  g.addConnection({ nodeId: pat.id, port: 'out1' }, { nodeId: dac.id, port: 'in' }, 'audio');
  await new Promise((r) => setTimeout(r, 300));
  const meter = new Tone.Meter({ smoothing: 0.2 }); Tone.getDestination().connect(meter);
  let peakA = -Infinity; for (let i = 0; i < 12; i++) { await new Promise((r) => setTimeout(r, 40)); const v = meter.getValue(); if (v > peakA) peakA = v; }

  // (B) control round-trip: box = [ inlet -> outlet ]; box.out1 -> external osc.freq
  const ctrlPatch = {
    nodes: [
      { id: 'ci', type: 'inlet', x: 40, y: 40, params: {} },
      { id: 'co', type: 'outlet', x: 200, y: 40, params: {} },
    ],
    connections: [{ from: { nodeId: 'ci', port: 'out' }, to: { nodeId: 'co', port: 'in' }, kind: 'control' }],
  };
  const osc2 = g.addNode('osc', 40, 300, { wave: 'sine', freq: 440 });
  const pat2 = g.addNode('patcher', 320, 300, { patch: ctrlPatch });
  g.addConnection({ nodeId: pat2.id, port: 'out1' }, { nodeId: osc2.id, port: 'freq' }, 'control');
  await new Promise((r) => setTimeout(r, 100));
  rt.get(pat2.id).receive('in1', 660);                 // push control into the box
  await new Promise((r) => setTimeout(r, 100));
  const freqB = rt.get(osc2.id).audioOut().frequency.value;

  // also expose the box's derived ports
  const { portsOf } = await import('/js/nodes/registry.js');
  const ports = portsOf(g.nodes.get(pat.id));
  return { peakA, freqB, inN: ports.inlets.length, outN: ports.outlets.length, inKind: ports.inlets[0]?.kind };
});

const checks = [
  ['audio subpatch passes signal (> -60 dB)', r.peakA > -60, r.peakA.toFixed(1) + ' dB'],
  ['box derives ports from boundary objects (1 in / 1 out, audio)', r.inN === 1 && r.outN === 1 && r.inKind === 'audio', `${r.inN} in / ${r.outN} out / ${r.inKind}`],
  ['control crosses the box (external osc freq -> 660)', Math.abs(r.freqB - 660) < 1, 'freq ' + r.freqB.toFixed(1)],
];
let ok = true;
for (const [name, pass, detail] of checks) { if (!pass) ok = false; console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}  [${detail}]`); }
console.log(ok ? '  SUBPATCH 3.1 PASS' : '  FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
