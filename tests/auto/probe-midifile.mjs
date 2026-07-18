// probe-midifile.mjs — Phase 7: the `midifile` node + polyphonic Cathedral (MIDI) demo + the
// per-patch credits box. Verifies: the .mid loads/parses in-browser, the demo is POLYPHONIC
// (several voices sound at once), the transport gates it, the credits box shows text + link,
// and there are no page errors.
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
  const peak = async (node, n = 20, gap = 30) => {
    const m = new Tone.Meter({ smoothing: 0 }); node.connect(m);
    let pk = -Infinity; for (let k = 0; k < n; k++) { await sleep(gap); const v = m.getValue(); if (v > pk) pk = v; }
    node.disconnect(m); m.dispose(); return pk;
  };

  ed.loadDemo('cathedralMidi');

  // credits box (fed from graph.credits on load)
  const box = document.getElementById('patch-credits');
  out.creditsShown = box && !box.hidden;
  out.creditsText = document.getElementById('patch-credits-text')?.textContent || '';
  out.creditsLink = document.getElementById('patch-credits-link')?.getAttribute('href') || '';

  // midifile node exposes 8 voice-outlet pairs and loads/parses the file (status -> "N notes")
  const mf = [...ed.graph.nodes.values()].find((n) => n.type === 'midifile');
  const mfEl = ed.views.get(mf.id).el;
  out.hasVoiceOutlets = ['f1', 't1', 'f8', 't8'].every((p) => !!mfEl.querySelector(`.ports.out .port[data-port="${p}"]`));
  for (let k = 0; k < 40 && !/notes/.test(mf.params.status || ''); k++) await sleep(50); // wait for fetch+parse
  out.status = mf.params.status;

  // jump the transport near the first chord (~4.68 s) and play
  Tone.getTransport().seconds = 4.55;
  ed.engine.transportStart();
  await sleep(500);                                   // let the chord attack + voices open

  const dest = Tone.getDestination();
  out.master = await peak(dest, 16, 30);

  // polyphony: count how many voice patchers are audible at once during the chord
  const voices = [...ed.graph.nodes.values()].filter((n) => n.type === 'patcher');
  let activeVoices = 0;
  for (const v of voices) {
    const vout = ed.engine.runtimes.get(v.id)?.audioOut?.('out1');
    if (!vout) continue;
    const pk = await peak(vout, 6, 25);
    if (pk > -50) activeVoices++;
  }
  out.voiceCount = voices.length;
  out.activeVoices = activeVoices;

  // transport stop pauses playback -> master falls silent
  ed.engine.transportStop();
  await sleep(300);
  out.afterStop = await peak(dest, 6, 30);

  // rewind: resets transport position to 0 and silences voices; playback is then replayable
  ed.engine.runtimes.get(mf.id)._rewind();
  await sleep(120);
  out.rewoundSeconds = Tone.getTransport().seconds;
  Tone.getTransport().seconds = 4.55;                // jump back near the first chord and replay
  ed.engine.transportStart();
  await sleep(500);
  out.replayMaster = await peak(dest, 12, 30);
  ed.engine.transportStop();
  return out;
});

const dB = (x) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(1) : String(x));
const checks = [
  ['midifile exposes 8 voice-outlet pairs', r.hasVoiceOutlets === true, `${r.hasVoiceOutlets}`],
  ['midifile loaded & parsed the .mid', /notes/.test(r.status || ''), `status="${r.status}"`],
  ['credits box is shown', r.creditsShown === true, `${r.creditsShown}`],
  ['credits text mentions Silo', /Silo/.test(r.creditsText), `"${r.creditsText}"`],
  ['credits link points to sohncompositions', /sohncompositions\.com/.test(r.creditsLink), `${r.creditsLink}`],
  ['demo is audible during playback', r.master > -45, `${dB(r.master)} dB`],
  ['playback is POLYPHONIC (>=3 voices at once)', r.activeVoices >= 3, `${r.activeVoices}/${r.voiceCount} voices`],
  ['transport stop silences output', r.afterStop < -55, `${dB(r.afterStop)} dB`],
  ['rewind resets transport to the top', r.rewoundSeconds < 0.05, `${dB(r.rewoundSeconds)} s`],
  ['playback is replayable after rewind', r.replayMaster > -45, `${dB(r.replayMaster)} dB`],
  ['no page errors', errors.length === 0, `${errors.length} errors`],
];

let ok = true;
for (const [name, pass, detail] of checks) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!pass) ok = false;
}
console.log(ok ? '  MIDIFILE 7.x PASS' : '  MIDIFILE 7.x FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
