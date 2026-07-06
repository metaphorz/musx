// probe-envelope.mjs — Phase 2.5a: envfollow~ -> envimpose~ VCA pairing.
// Build osc(src) -> envfollow~ -> env -> envimpose~(on a steady pad) -> dac, through the
// real engine. The pad's level must TRACK the follower: loud source opens the VCA, silent
// source closes it. Tests the node defs (create/audioIn/audioOut), not just Tone.
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
  const src = g.addNode('osc', 40, 40, { type: 'sine', freq: 110 });
  const pad = g.addNode('osc', 40, 240, { type: 'sawtooth', freq: 440 });
  const ef = g.addNode('envfollow', 320, 40, { response: 0.05, gain: 2 });
  const ei = g.addNode('envimpose', 600, 140, { depth: 2 });
  const dac = g.addNode('dac', 860, 140, {});
  g.addConnection({ nodeId: src.id, port: 'out' }, { nodeId: ef.id, port: 'in' }, 'audio');
  g.addConnection({ nodeId: pad.id, port: 'out' }, { nodeId: ei.id, port: 'in' }, 'audio');
  g.addConnection({ nodeId: ef.id, port: 'env' }, { nodeId: ei.id, port: 'env' }, 'audio');
  g.addConnection({ nodeId: ei.id, port: 'out' }, { nodeId: dac.id, port: 'in' }, 'audio');
  const meter = new Tone.Meter({ smoothing: 0.1 });
  Tone.getDestination().connect(meter);
  const peak = async () => { let p = -Infinity; for (let i = 0; i < 10; i++) { await new Promise((r) => setTimeout(r, 50)); const v = meter.getValue(); if (v > p) p = v; } return p; };
  await new Promise((r) => setTimeout(r, 400));
  const open = await peak();                 // source loud -> VCA open
  rt.get(ef.id).setParam('gain', 0);         // silence the follower's input -> env -> 0
  await new Promise((r) => setTimeout(r, 300));
  const closed = await peak();               // VCA should close
  return { open, closed };
});

const checks = [
  ['carrier audible when source loud (> -40 dB)', r.open > -40, r.open.toFixed(1) + ' dB'],
  ['envelope closes the VCA (open - closed > 15 dB)', (r.open - r.closed) > 15, `open ${r.open.toFixed(1)} / closed ${r.closed.toFixed(1)}`],
];
let ok = true;
for (const [name, pass, detail] of checks) { if (!pass) ok = false; console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}  [${detail}]`); }
console.log(ok ? '  ENVELOPE PAIR PASS' : '  FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
