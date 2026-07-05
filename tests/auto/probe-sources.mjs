// probe-sources.mjs — Phase 2.1 check: sndfile~ plays a buffer, mic~ opens a device.
import { chromium } from 'playwright';

const PORT = process.argv[2] || '8123';
const BASE = `http://localhost:${PORT}/index.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream', // fake mic emits a tone
  ],
});
const page = await (await browser.newContext({ permissions: ['microphone'] })).newPage();
page.on('pageerror', (e) => console.log(`  [PAGEERROR] ${e.message}`));
let fails = 0;

// ---- sndfile~ : feed a synthesized buffer, play it, read the meter ----
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.editor && window.Tone);
await page.evaluate(() => {
  const g = window.editor.graph;
  const s = g.addNode('sndfile', 60, 60, {});
  const d = g.addNode('dac', 360, 60, {});
  g.addConnection({ nodeId: s.id, port: 'out' }, { nodeId: d.id, port: 'in' }, 'audio');
  window.__sndId = s.id;
});
await page.click('#btn-audio');
await sleep(300);
const sndPeak = await page.evaluate(async () => {
  const Tone = window.Tone;
  // 1s 220Hz sine buffer
  const sr = Tone.getContext().sampleRate, n = sr * 1;
  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++) arr[i] = 0.6 * Math.sin(2 * Math.PI * 220 * i / sr);
  const buf = Tone.ToneAudioBuffer.fromArray(arr);
  const rt = window.editor.engine.runtimes.get(window.__sndId);
  rt.setBuffer(buf);
  rt.play();
  window.editor.masterLevel(); // create meter
  await new Promise((r) => setTimeout(r, 300));
  let peak = -Infinity;
  for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 60)); const v = window.editor.masterLevel(); if (v > peak) peak = v; }
  return peak;
});
console.log(`  sndfile~ peak: ${Number(sndPeak).toFixed(1)} dB`);
if (Number.isFinite(sndPeak) && sndPeak > -60) console.log('  PASS: sndfile~ plays a buffer'); else { console.log('  FAIL: sndfile~ silent'); fails++; }

// ---- mic~ : fake device should open and produce signal ----
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.editor && window.Tone);
await page.evaluate(() => {
  const g = window.editor.graph;
  const m = g.addNode('mic', 60, 60, {});
  const d = g.addNode('dac', 360, 60, {});
  g.addConnection({ nodeId: m.id, port: 'out' }, { nodeId: d.id, port: 'in' }, 'audio');
});
await page.click('#btn-audio'); // engine.start() -> mic.open() (fake device)
await sleep(1500);
// The Playwright fake mic device emits SILENCE in headless, so we can't read a level;
// assert the node opened the stream instead (status readout -> 'on').
const micStatus = await page.evaluate(() => document.querySelector('.readout[data-name=status]')?.textContent);
console.log(`  mic~ status: ${micStatus}`);
if (micStatus === 'on') console.log('  PASS: mic~ opens the input stream'); else { console.log('  FAIL: mic~ did not open'); fails++; }

await browser.close();
console.log(fails === 0 ? '\n==== SOURCES OK ====' : `\n==== ${fails} FAILURE(S) ====`);
process.exit(fails === 0 ? 0 : 1);
