// control.js — number, slider, math, message, scope.
const T = () => window.Tone;

export const controlNodes = [
  {
    type: 'number',
    title: 'number',
    category: 'control',
    inlets: [{ name: 'in', kind: 'control' }],
    outlets: [{ name: 'out', kind: 'control' }],
    params: [{ name: 'value', label: 'val', widget: 'number', default: 0 }],
    create(node, api) {
      return {
        receive: (i, v) => {
          if (i !== 'in') return;
          node.params.value = +v;
          api.view?.setReadout?.('value', String(+v));
          const inp = api.view?.body.querySelector('input[type=number]');
          if (inp) inp.value = +v;
          api.emit('out', +v);
        },
        setParam: (n, v) => { if (n === 'value') api.emit('out', +v); },
        dispose: () => {},
      };
    },
  },

  {
    type: 'slider',
    title: 'slider',
    category: 'control',
    resizable: true,
    inlets: [],
    outlets: [{ name: 'out', kind: 'control' }],
    // value mapped between lo..hi (like Max `scale 0 127 lo hi`)
    params: [
      { name: 'lo', label: 'lo', widget: 'number', default: 0 },
      { name: 'hi', label: 'hi', widget: 'number', default: 1000 },
    ],
    render({ node, body, view, editor }) {
      if (node.params.value == null) node.params.value = node.params.lo ?? 0;
      const row = document.createElement('div');
      row.className = 'widget';
      const slider = document.createElement('input');
      slider.type = 'range';
      const val = document.createElement('span');
      val.className = 'val';
      const sync = () => {
        slider.min = node.params.lo ?? 0;
        slider.max = node.params.hi ?? 1000;
        slider.step = ((node.params.hi - node.params.lo) || 1000) / 1000;
        slider.value = node.params.value;
        val.textContent = (+node.params.value).toFixed(2);
      };
      slider.addEventListener('input', () => {
        node.params.value = parseFloat(slider.value);
        val.textContent = (+slider.value).toFixed(2);
        editor.onParamChange(node.id, 'value', node.params.value);
      });
      view._syncSlider = sync;
      sync();
      slider.style.width = `${node.params.w || 130}px`;
      view._vizEl = slider;
      view._onResize = (w) => { slider.style.width = `${w}px`; }; // widen the track
      row.appendChild(slider); row.appendChild(val);
      body.appendChild(row);
    },
    create(node, api) {
      return {
        setParam: (n, v) => {
          if (n === 'lo' || n === 'hi') api.view?._syncSlider?.();
          if (n === 'value') api.emit('out', +v);
        },
        dispose: () => {},
      };
    },
  },

  {
    type: 'math',
    title: 'math',
    category: 'control',
    inlets: [{ name: 'a', kind: 'control' }, { name: 'b', kind: 'control' }],
    outlets: [{ name: 'out', kind: 'control' }],
    params: [
      { name: 'op', label: 'op', widget: 'select', options: ['+', '-', '*', '/'], default: '*' },
      { name: 'b', label: 'b', widget: 'number', default: 1 },
    ],
    create(node, api) {
      let a = 0;
      const calc = () => {
        const b = node.params.b ?? 0;
        const op = node.params.op || '*';
        const r = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : (b === 0 ? 0 : a / b);
        api.emit('out', r);
      };
      return {
        receive: (i, v) => {
          if (i === 'a') { a = +v; calc(); }
          else if (i === 'b') { node.params.b = +v; calc(); }
        },
        setParam: (n) => { if (n === 'op' || n === 'b') calc(); },
        dispose: () => {},
      };
    },
  },

  {
    type: 'message',
    title: 'message',
    category: 'control',
    resizable: true,
    inlets: [{ name: 'in', kind: 'control' }],
    outlets: [{ name: 'out', kind: 'control' }],
    params: [{ name: 'value', label: 'msg', widget: 'text', default: '1' }],
    render({ node, body, view, editor }) {
      const btn = document.createElement('button');
      btn.className = 'msg-btn';
      btn.textContent = node.params.value ?? '1';
      btn.style.width = `${node.params.w || 120}px`;
      btn.style.height = `${node.params.h || 30}px`;
      btn.addEventListener('mousedown', (e) => { e.stopPropagation(); editor.fireMessage(node.id); });
      view._msgBtn = btn;
      view._vizEl = btn;
      view._onResize = (w, h) => { btn.style.width = `${w}px`; btn.style.height = `${h}px`; };
      body.appendChild(btn);
    },
    create(node, api) {
      const out = () => {
        const raw = node.params.value;
        const num = parseFloat(raw);
        api.emit('out', Number.isFinite(num) && String(num) === String(raw).trim() ? num : raw);
      };
      return {
        send: out,
        receive: (i) => { if (i === 'in') out(); },
        setParam: (n, v) => { if (n === 'value' && api.view?._msgBtn) api.view._msgBtn.textContent = v; },
        dispose: () => {},
      };
    },
  },

  {
    type: 'scale',
    title: 'scale',
    category: 'control',
    inlets: [{ name: 'in', kind: 'control' }],
    outlets: [{ name: 'out', kind: 'control' }],
    // maps in[inLo..inHi] linearly to out[outLo..outHi] — like Max `scale 0 127 120. 1000.`
    params: [
      { name: 'inLo', label: 'in lo', widget: 'number', default: 0 },
      { name: 'inHi', label: 'in hi', widget: 'number', default: 127 },
      { name: 'outLo', label: 'out lo', widget: 'number', default: 0 },
      { name: 'outHi', label: 'out hi', widget: 'number', default: 1000 },
    ],
    create(node, api) {
      return {
        receive: (i, v) => {
          if (i !== 'in') return;
          const { inLo, inHi, outLo, outHi } = node.params;
          const t = (inHi - inLo) === 0 ? 0 : (+v - inLo) / (inHi - inLo);
          api.emit('out', outLo + t * (outHi - outLo));
        },
        dispose: () => {},
      };
    },
  },

  {
    type: 'xypad',
    title: 'xy pad',
    category: 'control',
    resizable: true,
    inlets: [],
    outlets: [{ name: 'x', kind: 'control' }, { name: 'y', kind: 'control' }],
    params: [], // x,y (0..127) stored in params; left outlet = X, right = Y (Max convention)
    render({ node, body, view, editor }) {
      if (node.params.x == null) node.params.x = 64;
      if (node.params.y == null) node.params.y = 64;
      const pad = document.createElement('div');
      pad.className = 'xypad';
      pad.style.width = `${node.params.w || 150}px`;
      pad.style.height = `${node.params.h || 150}px`;
      const dot = document.createElement('div');
      dot.className = 'xydot';
      pad.appendChild(dot);
      const place = () => { // map 0..127 onto the pad's CURRENT size (so it works after resize)
        dot.style.left = `${(node.params.x / 127) * pad.clientWidth}px`;
        dot.style.top = `${((127 - node.params.y) / 127) * pad.clientHeight}px`;
      };
      const setFrom = (e) => {
        const r = pad.getBoundingClientRect(); // r.width/height are the on-screen (zoomed) size
        const px = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        const py = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
        node.params.x = Math.round(px * 127);
        node.params.y = Math.round((1 - py) * 127);
        place();
        editor.onParamChange(node.id, 'x', node.params.x);
        editor.onParamChange(node.id, 'y', node.params.y);
      };
      pad.addEventListener('mousedown', (e) => {
        e.stopPropagation(); setFrom(e);
        const mv = (ev) => setFrom(ev);
        const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
      });
      view._vizEl = pad;
      view._onResize = (w, h) => { pad.style.width = `${w}px`; pad.style.height = `${h}px`; place(); };
      place();
      body.appendChild(pad);
    },
    create(node, api) {
      const emitBoth = () => { api.emit('x', node.params.x ?? 64); api.emit('y', node.params.y ?? 64); };
      return {
        setParam: (n, v) => { if (n === 'x') api.emit('x', +v); else if (n === 'y') api.emit('y', +v); },
        start: emitBoth, // push current position when audio starts so the patch sounds immediately
        dispose: () => {},
      };
    },
  },

  {
    type: 'scope',
    title: 'scope~',
    category: 'control',
    resizable: true,
    inlets: [{ name: 'in', kind: 'audio' }],
    outlets: [],
    params: [],
    render({ node, body, view }) {
      const c = document.createElement('canvas');
      c.className = 'viz';
      c.width = node.params.w || 220; c.height = node.params.h || 120;
      view._canvas = c;
      view._vizEl = c;
      view._onResize = (w, h) => { c.width = w; c.height = h; }; // draw() reads canvas dims live
      body.appendChild(c);
    },
    create(node, api) {
      const analyser = new (T().Analyser)('waveform', 1024);
      const canvas = api.view?._canvas;
      const ctx = canvas?.getContext('2d');
      const master = api.master; // when Stop mutes the master, draw flat
      let raf = null;
      const draw = () => {
        raf = requestAnimationFrame(draw);
        if (!ctx) return;
        const w = canvas.width, h = canvas.height;
        ctx.fillStyle = '#11131a'; ctx.fillRect(0, 0, w, h);
        if (master && master.gain.value < 0.001) { // stopped → flat line
          ctx.strokeStyle = '#2b2f37'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
          return;
        }
        const buf = analyser.getValue();
        ctx.strokeStyle = '#6fd08c'; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let i = 0; i < buf.length; i++) {
          const x = (i / (buf.length - 1)) * w;
          const y = (0.5 - buf[i] * 0.5) * h;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      };
      draw();
      return {
        audioIn: (i) => (i === 'in' ? analyser : null),
        dispose: () => { cancelAnimationFrame(raf); analyser.dispose(); },
      };
    },
  },
];
