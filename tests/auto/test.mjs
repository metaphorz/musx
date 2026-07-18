// Headless smoke + audio test for WebMax.
// Visual: loads each demo and screenshots. Audio: reads the master meter (dB) after
// Start Audio + Play to confirm the patch actually produces signal (not silence).
import { chromium } from 'playwright';
import { writeFileSync, appendFileSync } from 'fs';

const PORT = process.argv[2] || '8137';
const BASE = `http://localhost:${PORT}/index.html`;
const LOG = new URL('./test.log', import.meta.url).pathname;
const SHOT = (n) => new URL(`./shot-${n}.png`, import.meta.url).pathname;

writeFileSync(LOG, `WebMax test run ${new Date().toISOString()}  base=${BASE}\n`);
const log = (m) => { console.log(m); appendFileSync(LOG, m + '\n'); };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;

const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'],
});
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on('console', (m) => log(`  [console.${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => { log(`  [PAGEERROR] ${e.message}`); failures++; });

async function loadAndPlay(key) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.editor && window.Tone);
  // build the patch
  const built = await page.evaluate((k) => window.editor.loadDemo(k), key);
  if (!built) { log(`  FAIL: loadDemo('${key}') returned false`); failures++; return; }
  const counts = await page.evaluate(() => ({
    nodes: window.editor.graph.nodes.size,
    conns: window.editor.graph.connections.size,
    views: window.editor.views.size,
    cables: document.querySelectorAll('#cables path.cable').length,
  }));
  log(`  model: ${counts.nodes} nodes, ${counts.conns} connections | DOM: ${counts.views} views, ${counts.cables} cables`);
  if (counts.views !== counts.nodes) { log('  FAIL: view count != node count'); failures++; }
  if (counts.cables !== counts.conns) { log('  FAIL: cable count != connection count'); failures++; }

  // Start Audio (user gesture via click) then Play
  await page.click('#btn-audio');
  await sleep(300);
  await page.click('#btn-play');
  // sample the master meter for ~1.2s, keep the loudest reading
  let peak = -Infinity;
  for (let i = 0; i < 12; i++) {
    await sleep(100);
    const db = await page.evaluate(() => window.editor.masterLevel());
    if (Number.isFinite(db) && db > peak) peak = db;
  }
  log(`  peak master level: ${peak.toFixed(1)} dB`);
  if (!(peak > -60)) { log('  FAIL: output is effectively silent (<= -60 dB)'); failures++; }
  else log('  PASS: audible signal detected');

  await page.screenshot({ path: SHOT(key), fullPage: false });
  log(`  screenshot -> tests/auto/shot-${key}.png`);
  await page.evaluate(() => window.editor.engine.transportStop());
}

// 1) base load + add-a-node + wire sanity
log('\n[1] base load + palette add');
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.editor);
await page.evaluate(() => {
  const g = window.editor.graph;
  g.clear();                                   // start from a clean slate (launch loads a default patch)
  const a = g.addNode('osc', 60, 60, { wave: 'sine', freq: 330 });
  const b = g.addNode('dac', 360, 60, {});
  g.addConnection({ nodeId: a.id, port: 'out' }, { nodeId: b.id, port: 'in' }, 'audio');
});
const base = await page.evaluate(() => ({ n: window.editor.graph.nodes.size, c: document.querySelectorAll('#cables path.cable').length }));
log(`  added osc->dac: ${base.n} nodes, ${base.c} cable`);
if (base.n !== 2 || base.c !== 1) { log('  FAIL: base add/connect'); failures++; } else log('  PASS: add + connect');

// 2) save/load round-trip
log('\n[2] save/load JSON round-trip');
const rt = await page.evaluate(() => {
  const json = JSON.stringify(window.editor.graph.toJSON());
  window.editor.graph.loadJSON(JSON.parse(json));
  const again = JSON.stringify(window.editor.graph.toJSON());
  return { equal: json === again, nodes: window.editor.graph.nodes.size };
});
log(`  round-trip equal=${rt.equal}, nodes=${rt.nodes}`);
if (!rt.equal) { log('  FAIL: round-trip mismatch'); failures++; } else log('  PASS: round-trip stable');

// 3) demos: visual + audio
for (const key of ['customSynth', 'layeredPad', 'funcPlot']) {
  log(`\n[3] demo: ${key}`);
  await loadAndPlay(key);
}

// 4) keyboard object: pressing a key produces sound
log('\n[4] keyboard object');
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.editor);
await page.evaluate(() => {
  const g = window.editor.graph;
  g.clear();                                   // clean slate (launch loads a default patch with its own keyboard)
  const k = g.addNode('keyboard', 40, 320, {});
  const o = g.addNode('osc', 40, 40, { wave: 'sawtooth' });
  const a = g.addNode('adsr', 300, 40, { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.3 });
  const d = g.addNode('dac', 560, 40, {});
  g.addConnection({ nodeId: k.id, port: 'freq' }, { nodeId: o.id, port: 'freq' }, 'control');
  g.addConnection({ nodeId: k.id, port: 'trig' }, { nodeId: a.id, port: 'trig' }, 'control');
  g.addConnection({ nodeId: o.id, port: 'out' }, { nodeId: a.id, port: 'in' }, 'audio');
  g.addConnection({ nodeId: a.id, port: 'out' }, { nodeId: d.id, port: 'in' }, 'audio');
  window.__kbId = k.id;
});
await page.click('#btn-audio');
await sleep(200);
const keyCount = await page.evaluate(() => document.querySelectorAll('.kbd .wkey').length + document.querySelectorAll('.kbd .bkey').length);
log(`  keyboard rendered ${keyCount} keys`);
// click a white key in the DOM and read the meter
await page.evaluate(() => window.editor.masterLevel()); // ensure meter exists
let kpeak = -Infinity;
const keys = await page.$$('.kbd .wkey');
for (let i = 0; i < 3 && i < keys.length; i++) {
  await keys[i + 2].dispatchEvent('mousedown');
  for (let s = 0; s < 4; s++) { await sleep(80); const db = await page.evaluate(() => window.editor.masterLevel()); if (db > kpeak) kpeak = db; }
}
log(`  keyboard peak level: ${kpeak.toFixed(1)} dB`);
if (!(kpeak > -60)) { log('  FAIL: keyboard produced no sound'); failures++; } else log('  PASS: keyboard plays notes');
await page.screenshot({ path: SHOT('keyboard'), fullPage: false });

// 5) Stop silences free-running drones (the "stop not working" fix)
log('\n[5] Stop silences drones');
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.editor);
await page.evaluate(() => window.editor.loadDemo('layeredPad'));
await page.click('#btn-audio');
await page.click('#btn-play');
await page.evaluate(() => window.editor.masterLevel()); // create meter
const sampleMax = async (ms) => { let m = -Infinity; for (let i = 0; i < ms / 100; i++) { await sleep(100); const v = await page.evaluate(() => window.editor.masterLevel()); if (v > m) m = v; } return m; };
const playing = await sampleMax(600);
const gainPlaying = await page.evaluate(() => window.editor.engine.master.gain.value);
await page.click('#btn-stop');
await sleep(200); // let the 0.03s ramp complete
// Definitive silence check: the master gain (which all output routes through) hits 0.
// (We don't read the meter here — Tone.Meter smoothing lags real audio and gives a
// false residual; the gain value is the ground truth for what reaches the speakers.)
const gainStopped = await page.evaluate(() => window.editor.engine.master.gain.value);
log(`  playing=${playing.toFixed(1)} dB (masterGain=${gainPlaying.toFixed(2)}) -> after Stop masterGain=${gainStopped.toFixed(4)}`);
if (!(playing > -60)) { log('  FAIL: drone not audible while playing'); failures++; }
if (!(gainStopped < 0.001)) { log('  FAIL: Stop did not zero the master output'); failures++; }
if (playing > -60 && gainStopped < 0.001) log('  PASS: Stop silences output (master gain -> 0)');

// 6) Bang + Code demo: message -> code(JS) -> osc.freq, and BANG triggers a note
log('\n[6] Bang + Code demo (bang / message / code objects)');
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.editor);
await page.evaluate(() => window.editor.loadDemo('bangCode'));
await page.click('#btn-audio');
await sleep(150);
// message -> code -> osc.freq : clicking the message button should set osc freq via code
await page.evaluate(() => window.editor.masterLevel());
const oscId = await page.evaluate(() => [...window.editor.graph.nodes.values()].find((n) => n.type === 'osc').id);
await page.click('.msg-btn'); // emits MIDI 57 -> code -> 440*2^((57-69)/12)=220Hz
await sleep(100);
const freq = await page.evaluate((id) => window.editor.engine.runtimes.get(id).audioOut('out').frequency.value, oscId);
log(`  message(57) -> code -> osc freq = ${freq.toFixed(1)} Hz (expect ~220)`);
if (Math.abs(freq - 220) > 1) { log('  FAIL: message->code->osc chain wrong'); failures++; } else log('  PASS: message->code->osc chain');
// BANG triggers the envelope -> audible note
let bpeak = -Infinity;
for (let i = 0; i < 3; i++) {
  await page.click('.bang-btn');
  for (let s = 0; s < 4; s++) { await sleep(80); const db = await page.evaluate(() => window.editor.masterLevel()); if (db > bpeak) bpeak = db; }
}
log(`  BANG note peak level: ${bpeak.toFixed(1)} dB`);
if (!(bpeak > -60)) { log('  FAIL: bang produced no sound'); failures++; } else log('  PASS: bang triggers an audible note');

await browser.close();
log(`\n==== ${failures === 0 ? 'ALL TESTS PASSED' : failures + ' FAILURE(S)'} ====`);
process.exit(failures === 0 ? 0 : 1);
