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
    // chord — turn one root frequency into a chord: pick a quality (major/minor/…) and how many
    // notes (just the root, a power chord, a triad, or a 7th). Feed `root` from a keyboard/note
    // freq; wire the 4 outlets to 4 voices. Fewer notes than outlets simply doubles lower tones,
    // so every connected voice always gets a sensible pitch (and "root" = plain unison root).
    type: 'chord',
    title: 'chord',
    category: 'control',
    inlets: [{ name: 'root', kind: 'control' }],
    outlets: [
      { name: '1', kind: 'control' }, { name: '2', kind: 'control' },
      { name: '3', kind: 'control' }, { name: '4', kind: 'control' },
    ],
    params: [
      { name: 'quality', label: 'quality', widget: 'select', options: ['major', 'minor', 'augmented', 'diminished', 'sus2', 'sus4'], default: 'minor' },
      { name: 'size', label: 'notes', widget: 'select', options: ['root (1)', 'power (1-5)', 'triad (1-3-5)', '7th (1-3-5-7)'], default: 'triad (1-3-5)' },
    ],
    create(node, api) {
      // semitone offsets for [root, third, fifth, seventh] of each chord quality
      const QUALITY = {
        major: [0, 4, 7, 11], minor: [0, 3, 7, 10], augmented: [0, 4, 8, 11],
        diminished: [0, 3, 6, 9], sus2: [0, 2, 7, 10], sus4: [0, 5, 7, 10],
      };
      // which of those degrees are voiced, per chord size
      const SIZE = {
        'root (1)': [0], 'power (1-5)': [0, 2], 'triad (1-3-5)': [0, 1, 2], '7th (1-3-5-7)': [0, 1, 2, 3],
      };
      const NOUT = 4;
      let root = 0;
      const emitChord = () => {
        if (!(root > 0)) return;
        const degrees = QUALITY[node.params.quality] || QUALITY.minor;
        const active = (SIZE[node.params.size] || SIZE['triad (1-3-5)']).map((i) => degrees[i]);
        for (let k = 0; k < NOUT; k++) {                       // wrap active tones across the outlets
          const semi = active[k % active.length];
          api.emit(String(k + 1), root * Math.pow(2, semi / 12));
        }
      };
      return {
        receive: (i, v) => { if (i === 'root' && Number.isFinite(+v)) { root = +v; emitChord(); } },
        setParam: (n) => { if (n === 'quality' || n === 'size') emitChord(); },
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

  {
    // breakpoint~ — draw a line-segment automation curve and play it back as a control
    // stream synced to the transport (the real-time equivalent of a CDP breakpoint file).
    // Click empty space to add a point, drag a point to move it, right-click to delete.
    // The endpoints (t=0 and t=1) stay pinned in time; only their value moves.
    type: 'breakpoint',
    title: 'breakpoint~',
    category: 'control',
    resizable: true,
    inlets: [{ name: 'trig', kind: 'control' }],
    outlets: [{ name: 'val', kind: 'control' }],
    params: [
      { name: 'dur', label: 'dur s', widget: 'number', min: 0.05, max: 60, step: 0.05, default: 2 },
      { name: 'lo', label: 'lo', widget: 'number', default: 0 },
      { name: 'hi', label: 'hi', widget: 'number', default: 1 },
      { name: 'loop', label: 'loop', widget: 'select', options: ['on', 'off'], default: 'on' },
    ],
    render({ node, body, view, editor }) {
      const p = node.params;
      if (!Array.isArray(p.points) || p.points.length < 2) p.points = [[0, 0], [0.5, 1], [1, 0]];
      const c = document.createElement('canvas');
      c.className = 'viz';
      c.width = p.w || 240; c.height = p.h || 120;
      const ctx = c.getContext('2d');
      const sortPts = () => p.points.sort((a, b) => a[0] - b[0]);
      const toPx = (pt) => [pt[0] * c.width, c.height - pt[1] * c.height];
      const draw = () => {
        if (!c.isConnected) return;            // node removed -> stop the loop
        requestAnimationFrame(draw);
        const W = c.width, H = c.height;
        ctx.fillStyle = '#11131a'; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#2b2f37'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, H - 1); ctx.lineTo(W, H - 1); ctx.moveTo(0, 1); ctx.lineTo(W, 1); ctx.stroke();
        ctx.strokeStyle = '#4ea1ff'; ctx.lineWidth = 1.5; ctx.beginPath();
        p.points.forEach((pt, i) => { const [x, y] = toPx(pt); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke();
        ctx.fillStyle = '#8ab4f8';
        p.points.forEach((pt) => { const [x, y] = toPx(pt); ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); });
        const ph = node._bpPhase;
        if (ph != null) { ctx.strokeStyle = '#e0b341'; ctx.beginPath(); ctx.moveTo(ph * W, 0); ctx.lineTo(ph * W, H); ctx.stroke(); }
      };
      requestAnimationFrame(draw);
      // pointer helpers (zoom-correct: map through the on-screen bounding rect)
      const norm = (e) => { const r = c.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height))]; };
      const hit = (e) => { const r = c.getBoundingClientRect(); const sx = r.width / c.width, sy = r.height / c.height; const mx = e.clientX - r.left, my = e.clientY - r.top; for (let i = 0; i < p.points.length; i++) { const [px, py] = toPx(p.points[i]); if (Math.abs(px * sx - mx) < 8 && Math.abs(py * sy - my) < 8) return i; } return -1; };
      c.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); const i = hit(e); if (i > 0 && i < p.points.length - 1) p.points.splice(i, 1); });
      c.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        let i = hit(e);
        if (i < 0) { const [t, v] = norm(e); const ct = Math.max(0.02, Math.min(0.98, t)); p.points.push([ct, v]); sortPts(); i = p.points.findIndex((pt) => pt[0] === ct); }
        const cur = p.points[i];
        const isEnd = (cur[0] === 0 || cur[0] === 1);
        const mv = (ev) => { const [t, v] = norm(ev); cur[1] = v; if (!isEnd) cur[0] = Math.max(0.02, Math.min(0.98, t)); sortPts(); };
        const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
        document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
      });
      view._canvas = c; view._vizEl = c;
      view._onResize = (w, h) => { c.width = w; c.height = h; };
      body.appendChild(c);
    },
    create(node, api) {
      const p = node.params;
      let phase = 0;
      const interval = 0.03;
      const interp = (t) => {
        const pts = p.points || [[0, 0], [1, 0]];
        if (t <= pts[0][0]) return pts[0][1];
        for (let i = 1; i < pts.length; i++) { if (t <= pts[i][0]) { const a = pts[i - 1], b = pts[i]; return a[1] + (t - a[0]) / ((b[0] - a[0]) || 1e-9) * (b[1] - a[1]); } }
        return pts[pts.length - 1][1];
      };
      const loop = new (T().Loop)(() => {
        const lo = +p.lo || 0, hi = (p.hi == null ? 1 : +p.hi);
        api.emit('val', lo + interp(phase) * (hi - lo));
        node._bpPhase = phase;
        phase += interval / Math.max(0.05, +p.dur || 2);
        if (phase >= 1) phase = ((p.loop || 'on') === 'on') ? phase - 1 : 1;
      }, interval);
      return {
        receive: (i) => { if (i === 'trig') phase = 0; },
        start: () => { phase = 0; loop.start(0); },
        stop: () => loop.stop(),
        dispose: () => { loop.dispose(); node._bpPhase = null; },
      };
    },
  },
];
