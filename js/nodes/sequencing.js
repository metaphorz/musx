// sequencing.js — transport, metro, bang, note, seq (piano-roll step sequencer).
// Timing nodes emit control messages. A "note" message is { type:'note', freq, dur, vel }.
import { midiToNote } from '../util/notes.js';
const T = () => window.Tone;

const NOTE_INTERVALS = ['1n', '2n', '4n', '8n', '8t', '16n', '16t', '32n'];
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11, 12],
  minor: [0, 2, 3, 5, 7, 8, 10, 12],
  penta: [0, 3, 5, 7, 10, 12, 15, 17],
};

export const sequencingNodes = [
  {
    type: 'transport',
    title: 'transport',
    category: 'timing',
    inlets: [{ name: 'bpm', kind: 'control' }],
    outlets: [],
    params: [{ name: 'bpm', label: 'BPM', widget: 'number', min: 20, max: 300, default: 120 }],
    create(node) {
      T().getTransport().bpm.value = node.params.bpm ?? 120;
      return {
        receive: (i, v) => { if (i === 'bpm' && +v) T().getTransport().bpm.value = +v; },
        setParam: (n, v) => { if (n === 'bpm') T().getTransport().bpm.value = +v; },
        dispose: () => {},
      };
    },
  },

  {
    type: 'bang',
    title: 'bang',
    category: 'timing',
    resizable: true,
    inlets: [{ name: 'in', kind: 'control' }],
    outlets: [{ name: 'out', kind: 'control' }],
    params: [],
    render({ node, body, view, editor }) {
      const btn = document.createElement('button');
      btn.className = 'bang-btn';
      btn.textContent = 'BANG';
      btn.style.width = `${node.params.w || 110}px`;
      btn.style.height = `${node.params.h || 44}px`;
      btn.addEventListener('mousedown', (e) => { e.stopPropagation(); editor.fireBang(view.node.id); });
      view._vizEl = btn;
      view._onResize = (w, h) => { btn.style.width = `${w}px`; btn.style.height = `${h}px`; };
      body.appendChild(btn);
    },
    create(node, api) {
      const fire = () => { api.view?.flashBang(); api.emit('out', 'bang'); };
      return {
        bang: fire,
        receive: (i) => { if (i === 'in') fire(); },
        dispose: () => {},
      };
    },
  },

  {
    type: 'note',
    title: 'note',
    category: 'timing',
    inlets: [{ name: 'trig', kind: 'control' }],
    outlets: [
      { name: 'trig', kind: 'control' }, // pass-through trigger (carries duration) -> adsr
      { name: 'freq', kind: 'control' }, // frequency in Hz -> osc.freq
    ],
    params: [
      { name: 'midi', label: 'note', widget: 'number', min: 0, max: 127, step: 1, default: 60, midinote: true },
      { name: 'dur', label: 'dur', widget: 'number', min: 0.01, max: 4, step: 0.01, default: 0.4 },
      { name: 'vel', label: 'vel', widget: 'slider', min: 0, max: 1, step: 0.01, default: 0.8 },
    ],
    create(node, api) {
      return {
        receive: (i) => {
          if (i !== 'trig') return;
          const freq = T().Frequency(node.params.midi ?? 60, 'midi').toFrequency();
          api.emit('freq', freq);
          api.emit('trig', { type: 'note', freq, dur: node.params.dur ?? 0.4, vel: node.params.vel ?? 0.8 });
        },
        dispose: () => {},
      };
    },
  },

  {
    type: 'keyboard',
    title: 'keyboard',
    category: 'timing',
    resizable: true,
    inlets: [],
    outlets: [
      { name: 'freq', kind: 'control' }, // -> osc.freq
      { name: 'trig', kind: 'control' }, // note message (freq+dur) -> adsr
    ],
    params: [
      { name: 'octaves', label: 'oct', widget: 'number', min: 1, max: 4, step: 1, default: 2 },
      { name: 'base', label: 'low C', widget: 'number', min: 12, max: 84, step: 12, default: 48 },
      { name: 'dur', label: 'dur', widget: 'number', min: 0.05, max: 4, step: 0.05, default: 0.5 },
    ],
    render({ node, body, view, editor }) {
      const WHITE = [0, 2, 4, 5, 7, 9, 11];     // semitone offsets of white keys
      const BLACK = { 0: 1, 1: 3, 3: 6, 4: 8, 5: 10 }; // black key after white index -> offset
      const kbd = document.createElement('div');
      kbd.className = 'kbd';
      let whites = [], blacks = [], octaves = 2;
      const release = (key, midi) => { if (key.classList.contains('on')) { key.classList.remove('on'); editor.fireNoteOff(node.id, midi); } };
      const mkKey = (cls, midi) => {
        const key = document.createElement('div');
        key.className = cls; key.dataset.midi = midi;
        // press-and-hold: note sustains while the key is down, releases when you let go
        key.addEventListener('mousedown', (e) => { e.stopPropagation(); key.classList.add('on'); editor.fireNoteOn(node.id, midi); });
        key.addEventListener('mouseup', () => release(key, midi));
        key.addEventListener('mouseleave', () => release(key, midi));
        kbd.appendChild(key);
        return key;
      };
      // size-aware layout: white-key width and heights derive from the node's dimensions
      const layout = (totalW, totalH) => {
        const ww = totalW / (octaves * 7);
        kbd.style.width = `${totalW}px`; kbd.style.height = `${totalH}px`;
        whites.forEach((k) => { k.el.style.width = `${ww}px`; k.el.style.height = `${totalH}px`; });
        blacks.forEach((k) => {
          k.el.style.width = `${ww * 0.62}px`; k.el.style.height = `${totalH * 0.6}px`;
          k.el.style.left = `${(k.idx + 1) * ww - ww * 0.31}px`;
        });
      };
      // (re)build the whole keyboard from the CURRENT octaves/base params. Called on first render
      // and again whenever oct/low-C change, so pressed keys always carry the right MIDI note.
      const build = () => {
        while (kbd.firstChild) kbd.removeChild(kbd.firstChild);
        whites = []; blacks = [];
        octaves = node.params.octaves ?? 2;
        const base = node.params.base ?? 48;
        for (let o = 0; o < octaves; o++) for (let w = 0; w < 7; w++) {
          const midi = base + o * 12 + WHITE[w];
          const el = mkKey('wkey', midi);
          if (WHITE[w] === 0) { // label each C with its octave (C3, C4, …)
            const lab = document.createElement('span');
            lab.className = 'klabel'; lab.textContent = midiToNote(midi);
            el.appendChild(lab);
          }
          whites.push({ el, idx: o * 7 + w });
        }
        for (let o = 0; o < octaves; o++) for (const w in BLACK) blacks.push({ el: mkKey('bkey', base + o * 12 + BLACK[w]), idx: o * 7 + Number(w) });
        layout(node.params.w || octaves * 7 * 22, node.params.h || 72);
      };
      build();
      view._vizEl = kbd;
      view._onResize = (w, h) => layout(w, h);
      view._onParamChange = (name) => { if (name === 'octaves' || name === 'base') { build(); editor._redrawCablesFor(node.id); } };
      body.appendChild(kbd);
    },
    create(node, api) {
      return {
        // fixed-length note (used by the note object / programmatic triggers / tests)
        playNote: (midi) => {
          const freq = T().Frequency(midi, 'midi').toFrequency();
          api.emit('freq', freq);
          api.emit('trig', { type: 'note', freq, dur: node.params.dur ?? 0.5 });
        },
        // gated note: on/off pair so a held key sustains until released
        noteOn: (midi) => {
          const freq = T().Frequency(midi, 'midi').toFrequency();
          api.emit('freq', freq);
          api.emit('trig', { type: 'noteon', freq });
        },
        noteOff: () => api.emit('trig', { type: 'noteoff' }),
        dispose: () => {},
      };
    },
  },

  {
    type: 'metro',
    title: 'metro',
    category: 'timing',
    inlets: [],
    outlets: [{ name: 'bang', kind: 'control' }],
    params: [{ name: 'interval', label: 'rate', widget: 'select', options: NOTE_INTERVALS, default: '8n' }],
    create(node, api) {
      const loop = new (T().Loop)(() => {
        T().getDraw().schedule(() => api.view?.flashBang(), T().now());
        api.emit('bang', 'bang');
      }, node.params.interval || '8n');
      return {
        start: () => loop.start(0),
        stop: () => loop.stop(),
        setParam: (n, v) => { if (n === 'interval') loop.interval = v; },
        dispose: () => loop.dispose(),
      };
    },
  },

  {
    type: 'seq',
    title: 'step seq',
    category: 'timing',
    resizable: true,
    inlets: [],
    outlets: [
      { name: 'trig', kind: 'control' }, // note message (freq+dur) -> adsr
      { name: 'freq', kind: 'control' }, // freq -> osc.freq
    ],
    params: [
      { name: 'steps', label: 'steps', widget: 'number', min: 4, max: 32, step: 1, default: 16 },
      { name: 'root', label: 'root', widget: 'number', min: 24, max: 96, step: 1, default: 48 },
      { name: 'scale', label: 'scale', widget: 'select', options: Object.keys(SCALES), default: 'penta' },
      { name: 'rate', label: 'rate', widget: 'select', options: NOTE_INTERVALS, default: '16n' },
      { name: 'gate', label: 'gate', widget: 'slider', min: 0.05, max: 1, step: 0.01, default: 0.5 },
    ],
    // params.notes is a flat array length=steps; each entry is a row index (0=top) or -1 (rest)
    render({ node, body, view, editor }) {
      const steps = node.params.steps ?? 16;
      const rows = 8;
      if (!Array.isArray(node.params.notes) || node.params.notes.length !== steps) {
        node.params.notes = new Array(steps).fill(-1);
      }
      const grid = document.createElement('div');
      grid.className = 'seqgrid';
      const cells = [];
      // cell size scales with the node's dimensions (resizable)
      const relayout = (w, h) => {
        const gap = 3;
        const cw = Math.max(6, (w - (steps - 1) * gap) / steps);
        const ch = Math.max(6, (h - (rows - 1) * gap) / rows);
        grid.style.gridTemplateColumns = `repeat(${steps}, ${cw}px)`;
        cells.forEach((c) => { c.style.width = `${cw}px`; c.style.height = `${ch}px`; });
      };
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < steps; c++) {
          const cell = document.createElement('div');
          cell.className = 'seqcell';
          cell.dataset.r = r; cell.dataset.c = c;
          if (node.params.notes[c] === r) cell.classList.add('on');
          cell.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            const cur = node.params.notes[c];
            const next = cur === r ? -1 : r;
            node.params.notes[c] = next;
            cells.forEach((cc) => { if (+cc.dataset.c === c) cc.classList.toggle('on', +cc.dataset.r === next); });
            editor.onParamChange(node.id, 'notes', node.params.notes.slice());
          });
          grid.appendChild(cell);
          cells.push(cell);
        }
      }
      view._seqCells = cells;
      relayout(node.params.w || steps * 19, node.params.h || rows * 23);
      view._vizEl = grid;
      view._onResize = (w, h) => relayout(w, h);
      body.appendChild(grid);
    },
    create(node, api) {
      const rows = 8;
      const idx = [...Array(node.params.steps ?? 16).keys()];
      let seq = null;
      const build = () => {
        if (seq) seq.dispose();
        seq = new (T().Sequence)((time, step) => {
          // highlight playhead
          T().getDraw().schedule(() => {
            const cells = api.view?._seqCells || [];
            cells.forEach((c) => c.classList.toggle('playhead', +c.dataset.c === step));
          }, time);
          const row = node.params.notes?.[step];
          if (row == null || row < 0) return;
          const scale = SCALES[node.params.scale] || SCALES.penta;
          const semis = scale[rows - 1 - row]; // top row = highest
          const midi = (node.params.root ?? 48) + semis;
          const freq = T().Frequency(midi, 'midi').toFrequency();
          const dur = (T().Time(node.params.rate || '16n').toSeconds()) * (node.params.gate ?? 0.5);
          api.emit('freq', freq);
          api.emit('trig', { type: 'note', freq, dur, time });
        }, idx, node.params.rate || '16n');
      };
      build();
      // `notes`, `root`, `scale`, `gate` are read live from node.params inside the
      // callback, so they need no rebuild. `rate`/`steps` change subdivision/length,
      // so rebuild the sequence (restarting if it was running).
      let running = false;
      return {
        start: () => { running = true; seq.start(0); },
        stop: () => { running = false; seq.stop(); },
        setParam: (n) => {
          if (n === 'rate' || n === 'steps') {
            const wasRunning = running;
            idx.length = 0; idx.push(...Array(node.params.steps ?? 16).keys());
            build();
            if (wasRunning) seq.start(0);
          }
        },
        dispose: () => seq && seq.dispose(),
      };
    },
  },
];
