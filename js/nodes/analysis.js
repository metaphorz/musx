// analysis.js — visualization & function generation.
//   plot    : XY grapher of an incoming control-value stream (rolling buffer, autoscale)
//   funcgen : function generator with an algebraically-specified function (like Max expr~)
//             - 'sig' outlet: one cycle of the expression over phase t in [0,1) becomes a
//               periodic wavetable, played as an audible oscillator (freq-controllable)
//             - 'val' outlet: the expression sampled over time, emitted as a control stream
import { compile } from '../util/expr.js';
const T = () => window.Tone;

// Build a Web Audio PeriodicWave from f(t), t in [0,1). Spectral magnitude is exact;
// any phase-sign convention difference is inaudible.
function buildWave(rawCtx, fn, harmonics = 64, N = 2048) {
  const y = new Float32Array(N);
  for (let n = 0; n < N; n++) y[n] = fn({ t: n / N, x: n / N });
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let k = 1; k <= harmonics; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const ang = (2 * Math.PI * k * n) / N;
      re += y[n] * Math.cos(ang);
      im += y[n] * Math.sin(ang);
    }
    real[k] = (2 * re) / N;
    imag[k] = (2 * im) / N;
  }
  return rawCtx.createPeriodicWave(real, imag, { disableNormalization: false });
}

export const analysisNodes = [
  {
    type: 'plot',
    title: 'plot',
    category: 'analysis',
    resizable: true,
    inlets: [{ name: 'in', kind: 'control' }],
    outlets: [],
    params: [],
    render({ node, body, view }) {
      const c = document.createElement('canvas');
      c.className = 'viz';
      c.width = node.params.w || 220; c.height = node.params.h || 120;
      view._canvas = c;
      view._vizEl = c;
      view._onResize = (w, h) => { c.width = w; c.height = h; };
      body.appendChild(c);
    },
    create(node, api) {
      const canvas = api.view?._canvas;
      const ctx = canvas?.getContext('2d');
      const master = api.master; // when Stop mutes the master, draw flat
      let buf = []; // rolling history; length follows the (resizable) canvas width
      let raf = null;
      const draw = () => {
        raf = requestAnimationFrame(draw);
        if (!ctx) return;
        const W = canvas.width, H = canvas.height;
        if (master && master.gain.value < 0.001) { // stopped → flat baseline
          ctx.fillStyle = '#11131a'; ctx.fillRect(0, 0, W, H);
          ctx.strokeStyle = '#2b2f37'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
          return;
        }
        while (buf.length < W) buf.unshift(0);   // grow on resize
        if (buf.length > W) buf = buf.slice(buf.length - W);
        let lo = Math.min(...buf), hi = Math.max(...buf);
        if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
        const norm = (v) => H - ((v - lo) / (hi - lo)) * (H - 8) - 4;
        ctx.fillStyle = '#11131a'; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#2b2f37'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, norm(0)); ctx.lineTo(W, norm(0)); ctx.stroke();
        ctx.strokeStyle = '#4ea1ff'; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let x = 0; x < W; x++) (x ? ctx.lineTo(x, norm(buf[x])) : ctx.moveTo(x, norm(buf[x])));
        ctx.stroke();
        ctx.fillStyle = '#9aa1ad'; ctx.font = '10px monospace';
        ctx.fillText((buf[buf.length - 1] ?? 0).toFixed(3), 4, 12);
      };
      draw();
      return {
        receive: (i, v) => { if (i === 'in' && Number.isFinite(+v)) { buf.push(+v); if (buf.length > canvas.width) buf.shift(); } },
        dispose: () => cancelAnimationFrame(raf),
      };
    },
  },

  {
    type: 'funcgen',
    title: 'funcgen',
    category: 'analysis',
    inlets: [{ name: 'freq', kind: 'control' }],
    outlets: [
      { name: 'sig', kind: 'audio' },   // wavetable oscillator (audible)
      { name: 'val', kind: 'control' }, // sampled-over-time control stream (feed a plot)
    ],
    params: [
      { name: 'expr', label: 'f(t)=', widget: 'text', default: 'sin(2*pi*t)' },
      { name: 'freq', label: 'freq', widget: 'number', min: 1, max: 8000, default: 220, note: true },
      { name: 'cycle', label: 'cycle s', widget: 'number', min: 0.05, max: 20, step: 0.05, default: 2 },
      { name: 'err', label: 'parse', widget: 'readout', default: 'ok' },
    ],
    create(node, api) {
      const rawCtx = T().getContext().rawContext;
      const out = new (T().Gain)(0.6);

      let compiled = compile(node.params.expr || 'sin(2*pi*t)');
      api.view?.setReadout?.('err', compiled.error || 'ok');

      // audible wavetable oscillator
      const osc = rawCtx.createOscillator();
      osc.frequency.value = node.params.freq ?? 220;
      const applyWave = () => {
        if (!compiled.fn) return;
        try { osc.setPeriodicWave(buildWave(rawCtx, compiled.fn)); } catch (e) { /* keep last wave */ }
      };
      applyWave();
      osc.start();
      T().connect(osc, out); // native osc -> Tone.Gain so it joins the patch graph

      // control-rate sampler: sweep phase t in [0,1) over `cycle` seconds, emit f(t)
      let phase = 0;
      const dt = 1 / 60;
      const loop = new (T().Loop)(() => {
        if (!compiled.fn) return;
        phase = (phase + dt / (node.params.cycle || 2)) % 1;
        api.emit('val', compiled.fn({ t: phase, x: phase }));
      }, dt);

      const recompile = () => {
        compiled = compile(node.params.expr || 'sin(2*pi*t)');
        api.view?.setReadout?.('err', compiled.error || 'ok');
        applyWave();
      };

      return {
        audioOut: (o) => (o === 'sig' ? out : null),
        audioIn: () => null,
        receive: (i, v) => { if (i === 'freq' && +v) osc.frequency.value = +v; },
        setParam: (n, v) => {
          if (n === 'expr') recompile();
          else if (n === 'freq') osc.frequency.value = +v;
        },
        start: () => loop.start(0),
        stop: () => loop.stop(),
        dispose: () => { try { osc.stop(); } catch (e) {} osc.disconnect(); loop.dispose(); out.dispose(); },
      };
    },
  },
];
