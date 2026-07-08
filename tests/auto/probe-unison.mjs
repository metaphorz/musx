// probe-unison.mjs — Phase 4: rich/fat synth voices. Verifies unison~ (detuned voices spread
// across the stereo field), pan~ (equal-power placement), sndfile~ Start-Mod param, and the
// self-contained "richsound" demo (keyboard -> 3x unison~ patcher -> dac) makes audible output.
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

  // peak of the SIDE signal (L - R): ~silent for a mono/centered source, loud for a wide one
  const sidePeak = async (node) => {
    const split = new Tone.Split(2), side = new Tone.Gain(), negR = new Tone.Gain(-1), m = new Tone.Meter({ smoothing: 0 });
    node.connect(split); split.connect(side, 0, 0); split.connect(negR, 1, 0); negR.connect(side); side.connect(m);
    let pk = -Infinity; for (let k = 0; k < 15; k++) { await sleep(30); const v = m.getValue(); if (v > pk) pk = v; }
    node.disconnect(split); split.dispose(); side.dispose(); negR.dispose(); m.dispose();
    return pk;
  };
  // per-channel peaks (left, right)
  const lrPeak = async (node) => {
    const split = new Tone.Split(2), mL = new Tone.Meter({ smoothing: 0 }), mR = new Tone.Meter({ smoothing: 0 });
    node.connect(split); split.connect(mL, 0, 0); split.connect(mR, 1, 0);
    let l = -Infinity, rr = -Infinity; for (let k = 0; k < 15; k++) { await sleep(30); const a = mL.getValue(), b = mR.getValue(); if (a > l) l = a; if (b > rr) rr = b; }
    node.disconnect(split); split.dispose(); mL.dispose(); mR.dispose();
    return { l, r: rr };
  };
  const monoPeak = async (node) => {
    const m = new Tone.Meter({ smoothing: 0 }); node.connect(m);
    let pk = -Infinity; for (let k = 0; k < 12; k++) { await sleep(30); const v = m.getValue(); if (v > pk) pk = v; }
    node.disconnect(m); m.dispose(); return pk;
  };

  // --- unison~: 7 voices, wide spread -> real stereo width; collapse spread -> narrows ---------
  const uni = ed.graph.addNode('unison', 60, 60, { wave: 'sawtooth', voices: 7, detune: 30, spread: 1, level: 0.7, freq: 220 });
  await sleep(150);
  const uniOut = ed.engine.runtimes.get(uni.id).audioOut();
  out.wideSide = await sidePeak(uniOut);
  out.audioPresent = await monoPeak(uniOut);
  ed.graph.setParam(uni.id, 'spread', 0);          // collapse to center
  await sleep(120);
  out.narrowSide = await sidePeak(uniOut);
  ed.graph.setParam(uni.id, 'voices', 1);          // live voice-count change (rebuild)
  await sleep(150);
  out.audioAfterVoiceChange = await monoPeak(ed.engine.runtimes.get(uni.id).audioOut());

  // --- pan~: hard-left then hard-right -------------------------------------------------------
  const osc = ed.graph.addNode('osc', 60, 300, { wave: 'sine', freq: 220 });
  const pan = ed.graph.addNode('pan', 260, 300, { pos: -1 });
  ed.graph.addConnection({ nodeId: osc.id, port: 'out' }, { nodeId: pan.id, port: 'in' }, 'audio');
  await sleep(150);
  const panOut = ed.engine.runtimes.get(pan.id).audioOut();
  out.left = await lrPeak(panOut);
  ed.graph.setParam(pan.id, 'pos', 1);
  await sleep(150);
  out.right = await lrPeak(panOut);

  // --- sndfile~ Start-Mod param is present (control inlet auto-added via mod:true) ------------
  const sf = ed.graph.addNode('sndfile', 460, 300, {});
  await sleep(60);
  out.startmodInlet = !!ed.views.get(sf.id).el.querySelector('.ports.in .port[data-port="startmod"]');

  // --- richsound demo: load, play a note, confirm audible output at the destination ----------
  ed.loadDemo('richsound');
  await sleep(300);
  const kb = [...ed.graph.nodes.values()].find((n) => n.type === 'keyboard');
  const dest = Tone.getDestination(); const dm = new Tone.Meter({ smoothing: 0.1 }); dest.connect(dm);
  ed.fireNote(kb.id, 45);                            // low A -> fat pad
  let demoPk = -Infinity; for (let k = 0; k < 30; k++) { await sleep(40); const v = dm.getValue(); if (v > demoPk) demoPk = v; }
  dm.dispose();
  out.demoPeak = demoPk;

  return out;
});

const num = (x) => (typeof x === 'number' ? x.toFixed(1) : String(x));
const checks = [
  ['unison~ produces audio', r.audioPresent > -55, `${num(r.audioPresent)} dB`],
  ['unison~ spread=1 is genuinely wide (side signal present)', r.wideSide > -55, `side ${num(r.wideSide)} dB`],
  ['unison~ spread=0 collapses the width (>=12 dB narrower)', r.wideSide - r.narrowSide >= 12, `wide ${num(r.wideSide)} -> narrow ${num(r.narrowSide)} dB`],
  ['unison~ voices change (7->1) keeps audio flowing', r.audioAfterVoiceChange > -55, `${num(r.audioAfterVoiceChange)} dB`],
  ['pan~ pos=-1 favors LEFT', r.left.l - r.left.r >= 12, `L ${num(r.left.l)} / R ${num(r.left.r)}`],
  ['pan~ pos=+1 favors RIGHT', r.right.r - r.right.l >= 12, `L ${num(r.right.l)} / R ${num(r.right.r)}`],
  ['sndfile~ has a Start-Mod control inlet', r.startmodInlet === true, `${r.startmodInlet}`],
  ['richsound demo plays an audible fat note', r.demoPeak > -55, `${num(r.demoPeak)} dB`],
  ['no page errors', errors.length === 0, `${errors.length} errors`],
];

let ok = true;
for (const [name, pass, detail] of checks) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!pass) ok = false;
}
console.log(ok ? '  UNISON 4.x PASS' : '  UNISON 4.x FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
