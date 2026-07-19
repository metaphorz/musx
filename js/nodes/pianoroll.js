// pianoroll.js — a piano-roll track sequencer: draw notes on a time x pitch grid and play them
// back in sync with the transport, driving one voice via `freq` + `trig` (exactly like `step seq`
// / `keyboard`). Monophonic per track — use several rolls for chords/parts.
//
// Inspired by XPianoRoll (X. Roemer, MIT) — a piano-roll MIDI editor for Max/MSP — but this node
// bundles the editor AND playback (a `Tone.Part` loops the pattern).
//
// Editing (on the resizable canvas): click-drag empty space to draw a note (drag sets length),
// drag a note body to move it, drag its right edge to resize, Shift+drag a note vertically to set
// velocity, right-click a note to delete. Notes: { t, dur (beats), pitch (MIDI), vel (1..127) }.
const T = () => window.Tone;

const SNAP = { '1/4': 1, '1/8': 0.5, '1/16': 0.25, '1/8T': 1 / 3, '1/16T': 1 / 6 };
const isBlack = (p) => [1, 3, 6, 8, 10].includes(((p % 12) + 12) % 12);
const noteName = (p) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][((p % 12) + 12) % 12] + (Math.floor(p / 12) - 1);

export const pianorollNodes = [
  {
    type: 'pianoroll',
    title: 'pianoroll',
    category: 'timing',
    resizable: true,
    inlets: [],
    outlets: [
      { name: 'trig', kind: 'control' }, // note message {type:'note', freq, dur, velocity} -> adsr
      { name: 'freq', kind: 'control' }, // freq -> osc.freq
    ],
    params: [
      { name: 'bars', label: 'bars', widget: 'number', min: 1, max: 8, step: 1, default: 2 },
      { name: 'snap', label: 'snap', widget: 'select', options: Object.keys(SNAP), default: '1/16' },
      { name: 'lowPitch', label: 'low', widget: 'number', min: 12, max: 96, step: 1, default: 48 },
      { name: 'octaves', label: 'octaves', widget: 'number', min: 1, max: 5, step: 1, default: 2 },
      { name: 'vel', label: 'vel', widget: 'slider', min: 1, max: 127, step: 1, default: 100 },
      { name: 'loop', label: 'loop', widget: 'select', options: ['on', 'off'], default: 'on' },
    ],
    // params.notes: [{ t, dur, pitch, vel }]
    render({ node, body, view, editor }) {
      const p = node.params;
      if (!Array.isArray(p.notes)) p.notes = [];
      const c = document.createElement('canvas');
      c.className = 'viz';
      c.width = p.w || 420; c.height = p.h || 200;
      const ctx = c.getContext('2d');

      const totalBeats = () => (p.bars ?? 2) * 4;
      const rows = () => (p.octaves ?? 2) * 12;
      const laneH = () => c.height / rows();
      const beatToX = (b) => (b / totalBeats()) * c.width;
      const xToBeat = (x) => (x / c.width) * totalBeats();
      const pitchTop = (pitch) => c.height - (pitch - (p.lowPitch ?? 48) + 1) * laneH();
      const yToPitch = (y) => (p.lowPitch ?? 48) + Math.floor((c.height - y) / laneH());
      const snapSize = () => SNAP[p.snap] || 0.25;
      const snapB = (b) => Math.max(0, Math.round(b / snapSize()) * snapSize());

      const draw = () => {
        if (!c.isConnected) return;
        requestAnimationFrame(draw);
        const W = c.width, H = c.height, lo = p.lowPitch ?? 48, nr = rows(), lh = laneH();
        ctx.fillStyle = '#11131a'; ctx.fillRect(0, 0, W, H);
        // pitch lanes (shade black-key rows; label each C)
        for (let i = 0; i < nr; i++) {
          const pitch = lo + i, y = H - (i + 1) * lh;
          if (isBlack(pitch)) { ctx.fillStyle = '#171a22'; ctx.fillRect(0, y, W, lh); }
          if (pitch % 12 === 0) { ctx.strokeStyle = '#2b2f37'; ctx.beginPath(); ctx.moveTo(0, y + lh); ctx.lineTo(W, y + lh); ctx.stroke();
            ctx.fillStyle = '#555b66'; ctx.font = '9px sans-serif'; ctx.fillText(noteName(pitch), 2, y + lh - 2); }
        }
        // beat / bar / snap grid lines
        const tb = totalBeats(), ss = snapSize();
        for (let b = 0; b <= tb + 1e-9; b += ss) { const x = beatToX(b); const bar = Math.abs(b % 4) < 1e-9;
          ctx.strokeStyle = bar ? '#3a3f4a' : (Math.abs(b % 1) < 1e-9 ? '#262a33' : '#1b1e26');
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        // notes
        for (const n of p.notes) {
          const x = beatToX(n.t), w = Math.max(2, beatToX(n.dur) - 0), y = pitchTop(n.pitch);
          const a = 0.35 + 0.65 * ((n.vel ?? 100) / 127);
          ctx.fillStyle = `rgba(78,161,255,${a.toFixed(3)})`;
          ctx.strokeStyle = '#bcd6ff';
          ctx.beginPath(); ctx.rect(x + 0.5, y + 1, w - 1, lh - 2); ctx.fill(); ctx.stroke();
        }
        // playhead when the transport is running
        const tr = T().getTransport();
        if (tr.state === 'started') {
          const bpm = tr.bpm.value, posBeats = tr.seconds * bpm / 60, ph = (posBeats % tb) / tb;
          ctx.strokeStyle = '#e0b341'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ph * W, 0); ctx.lineTo(ph * W, H); ctx.stroke(); ctx.lineWidth = 1;
        }
      };
      requestAnimationFrame(draw);

      const evXY = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height)]; };
      const noteAt = (mx, my) => {
        for (let i = p.notes.length - 1; i >= 0; i--) { const n = p.notes[i]; const x0 = beatToX(n.t), x1 = beatToX(n.t + n.dur), yt = pitchTop(n.pitch);
          if (mx >= x0 && mx <= x1 && my >= yt && my <= yt + laneH()) return i; }
        return -1;
      };
      const commit = () => editor.onParamChange(node.id, 'notes', p.notes);

      c.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); const [mx, my] = evXY(e); const i = noteAt(mx, my); if (i >= 0) { p.notes.splice(i, 1); commit(); } });
      c.addEventListener('mousedown', (e) => {
        e.stopPropagation(); if (e.button !== 0) return;
        const [mx, my] = evXY(e);
        let i = noteAt(mx, my), mode;
        if (i < 0) { // create a note, then drag its right edge to set length
          const n = { t: snapB(xToBeat(mx)), pitch: yToPitch(my), dur: snapSize(), vel: p.vel ?? 100 };
          p.notes.push(n); i = p.notes.length - 1; mode = 'resize';
        } else {
          const n = p.notes[i], x1 = beatToX(n.t + n.dur);
          mode = e.shiftKey ? 'vel' : (mx > x1 - 7 ? 'resize' : 'move');
        }
        const n = p.notes[i];
        const start = { mx, my, t: n.t, dur: n.dur, pitch: n.pitch, vel: n.vel ?? 100 };
        const mv = (ev) => {
          const [x, y] = evXY(ev);
          if (mode === 'move') { n.t = snapB(start.t + xToBeat(x - start.mx)); n.pitch = start.pitch + (yToPitch(y) - yToPitch(start.my)); }
          else if (mode === 'resize') { n.dur = Math.max(snapSize(), snapB(xToBeat(x) - n.t)); }
          else { n.vel = Math.max(1, Math.min(127, Math.round(start.vel - (y - start.my)))); } // Shift+drag: up = louder
        };
        const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); commit(); };
        document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
      });

      view._canvas = c; view._vizEl = c;
      view._onResize = (w, h) => { c.width = w; c.height = h; };
      body.appendChild(c);
    },
    create(node, api) {
      let part = null;
      const build = () => {
        if (part) { part.stop(); part.dispose(); }
        const notes = node.params.notes || [];
        const evs = notes.map((n) => ({ time: `${Math.floor(n.t / 4)}:${Math.floor(n.t % 4)}:${(n.t % 1) * 4}`, n }));
        part = new (T().Part)((time, ev) => {
          const bpm = T().getTransport().bpm.value;
          const durSec = ev.n.dur * 60 / bpm;
          const freq = T().Frequency(ev.n.pitch, 'midi').toFrequency();
          api.emit('freq', freq);
          api.emit('trig', { type: 'note', freq, dur: durSec, time, velocity: ev.n.vel ?? 100 });
        }, evs);
        part.loop = (node.params.loop ?? 'on') !== 'off';
        part.loopStart = 0;
        part.loopEnd = `${node.params.bars ?? 2}m`;
      };
      build();
      let running = false;
      return {
        start: () => { running = true; part.start(0); },
        stop: () => { running = false; part.stop(); },
        // rebuild when the notes or timing change (positions are read live from node.params)
        setParam: (n) => {
          if (['notes', 'bars', 'loop'].includes(n)) { const was = running; build(); if (was) part.start(0); }
        },
        dispose: () => { if (part) { part.stop(); part.dispose(); } },
      };
    },
  },
];
