// midifile.js — play a Standard MIDI File as control (freq + note on/off), with a built-in
// polyphonic VOICE ALLOCATOR. It is a note SOURCE like the keyboard, but drives several voices
// at once: `voices` output pairs `f1,t1 … fN,tN`, each carrying the exact same freq/trig contract
// a keyboard emits, so every pair is a drop-in driver for one synth voice.
//
// Playback follows the transport (Play). Each parsed note is scheduled on the Tone transport;
// at note-on it grabs a free voice (or steals the oldest), emits that voice's freq + note-on, and
// at note-off releases it. Round-robin + steal-oldest = graceful behaviour on dense files.
import { parseMidi } from '../util/midifile.js';
import { miniBtn } from './soundloader.js';

const T = () => window.Tone;
const clampVoices = (n) => Math.max(1, Math.min(16, Math.round(n ?? 8)));

export const midifileNodes = [
  {
    type: 'midifile',
    title: 'midifile',
    category: 'sequencing',
    inlets: [],
    // dynamic: one (freq, trig) control-outlet pair per voice
    ports(node) {
      const v = clampVoices(node.params.voices);
      const outlets = [];
      for (let i = 1; i <= v; i++) {
        outlets.push({ name: `f${i}`, kind: 'control' });
        outlets.push({ name: `t${i}`, kind: 'control' });
      }
      return { inlets: [], outlets };
    },
    params: [
      { name: 'filename', label: 'file', widget: 'readout', default: '(no midi)' },
      { name: 'status', label: 'state', widget: 'readout', default: 'idle' },
      { name: 'voices', label: 'voices', widget: 'number', min: 1, max: 16, step: 1, default: 8 },
      { name: 'mode', label: 'mode', widget: 'select', options: ['poly', 'mono'], default: 'poly' },
      { name: 'retrig', label: 'retrig', widget: 'select', options: ['off', 'on'], default: 'off' }, // mono: re-articulate each note (vs. legato)
      { name: 'track', label: 'track (0=all)', widget: 'number', min: 0, max: 64, step: 1, default: 0 },
      { name: 'start', label: 'skip s', widget: 'number', min: 0, max: 600, step: 0.5, default: 0 },
      { name: 'transpose', label: 'transpose', widget: 'number', min: -24, max: 24, step: 1, default: 0 },
      { name: 'loop', label: 'loop', widget: 'select', options: ['off', 'on'], default: 'off' },
    ],
    render({ node, body, view, editor }) {
      const rt = () => editor.engine.runtimes.get(node.id);
      const loadBtn = miniBtn('⇱ .mid');
      const rewindBtn = miniBtn('⟲ rewind');
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.mid,.midi,audio/midi';
      fileInput.hidden = true;
      loadBtn.addEventListener('click', () => fileInput.click());
      rewindBtn.addEventListener('click', () => rt()?._rewind?.()); // back to the top; then press Play
      fileInput.addEventListener('change', (e) => {
        const f = e.target.files[0];
        if (f) {
          const url = URL.createObjectURL(f);
          Promise.resolve(rt()?._load?.(url, f.name)).finally(() => URL.revokeObjectURL(url));
          editor.onParamChange(node.id, 'filename', f.name);
        }
        e.target.value = '';
      });
      body.append(loadBtn, rewindBtn, fileInput);
    },
    create(node, api) {
      const p = node.params;
      const Tr = () => T().getTransport();
      const freqOf = (midi) => T().Frequency(midi + (p.transpose ?? 0), 'midi').toFrequency();

      let notes = [];            // parsed [{ time, dur, midi }]
      let loaded = false;
      let wantStart = false;
      const ids = [];            // scheduled transport event ids
      let active = [];           // poly: per voice, the note token sounding (or null)
      let order = [];            // poly: per voice allocation counter (steal-oldest)
      let counter = 0;
      let held = [];             // mono: currently-held notes (legato top-note priority)
      const isMono = () => p.mode === 'mono';

      const setStatus = (s) => { p.status = s; api.view?.setReadout?.('status', s); };
      const resetVoices = () => { const v = clampVoices(p.voices); active = new Array(v).fill(null); order = new Array(v).fill(-1); counter = 0; held = []; };
      const clearSchedule = () => { const t = Tr(); for (const id of ids) t.clear(id); ids.length = 0; };
      const allNotesOff = () => {
        if (held.length) { held = []; api.emit('t1', { type: 'noteoff' }); }
        for (let i = 0; i < active.length; i++) if (active[i]) { api.emit(`t${i + 1}`, { type: 'noteoff' }); active[i] = null; }
      };

      // ---- polyphonic: round-robin voice bank, steal oldest when full ----
      const polyOn = (note) => {
        let i = active.indexOf(null);
        if (i < 0) { let old = 0; for (let k = 1; k < order.length; k++) if (order[k] < order[old]) old = k; i = old; }
        active[i] = note; order[i] = counter++;
        const f = freqOf(note.midi);
        api.emit(`f${i + 1}`, f);                      // set pitch first…
        api.emit(`t${i + 1}`, { type: 'noteon', freq: f, velocity: note.velocity }); // …then gate on
      };
      const polyOff = (note) => {
        const i = active.indexOf(note);               // only if this voice still holds THIS note
        if (i >= 0) { api.emit(`t${i + 1}`, { type: 'noteoff' }); active[i] = null; }
      };

      // ---- monophonic: one voice. Two flavours:
      //   retrig off (legato)  — gate opens on the first held note and stays open through overlaps,
      //                          pitch follows the highest held note; releases at the last note-off.
      //                          A smooth sustained line (pads).
      //   retrig on            — re-articulates on EVERY note-on with that note's velocity
      //                          (last-note priority), releasing only when all notes are off. This
      //                          matches a classic mono synth / Dobrian's per-note velocity->amp.
      const isRetrig = () => p.retrig === 'on';
      const topNote = () => held.reduce((m, n) => (m && m.midi >= n.midi ? m : n), null);
      const monoOn = (note) => {
        const wasEmpty = held.length === 0;
        held.push(note);
        if (isRetrig()) {
          const f = freqOf(note.midi);                // last-note priority: the new note leads
          api.emit('f1', f);
          api.emit('t1', { type: 'noteon', freq: f, velocity: note.velocity }); // re-articulate every note
        } else {
          const t = topNote(), f = freqOf(t.midi);
          api.emit('f1', f);                          // pitch = highest held note
          if (wasEmpty) api.emit('t1', { type: 'noteon', freq: f, velocity: t.velocity }); // gate on from silence only
        }
      };
      const monoOff = (note) => {
        const i = held.indexOf(note);
        if (i < 0) return;
        held.splice(i, 1);
        if (held.length === 0) { api.emit('t1', { type: 'noteoff' }); return; } // last note off -> release
        const next = isRetrig() ? held[held.length - 1] : topNote();            // fall back to a still-held note
        api.emit('f1', freqOf(next.midi));
      };

      const noteOn = (note) => (isMono() ? monoOn(note) : polyOn(note));
      const noteOff = (note) => (isMono() ? monoOff(note) : polyOff(note));

      const schedule = () => {
        clearSchedule(); resetVoices();
        const t = Tr();
        const loopOn = (p.loop === 'on' || p.loop === true);
        const sel = Math.round(+p.track) || 0;            // 0 = all tracks; N = isolate track N
        const play = sel > 0 ? notes.filter((n) => n.track === sel) : notes;
        const skip = Math.max(0, +p.start || 0);          // trim this many seconds off the front
        let end = 0;
        for (const note of play) {
          const on = note.time - skip, off = note.time + note.dur - skip;
          if (off <= 0) continue;                         // note finished before the skip point
          ids.push(t.schedule(() => noteOn(note), Math.max(0, on)));
          ids.push(t.schedule(() => noteOff(note), off));
          end = Math.max(end, off);
        }
        if (loopOn) { t.loop = true; t.loopStart = 0; t.loopEnd = end + 0.2; ids.push(t.schedule(() => allNotesOff(), end + 0.15)); }
        else if (t.loopEnd && Math.abs(t.loopEnd - (end + 0.2)) < 1e-6) { t.loop = false; }
        setStatus(`${play.length} notes · ${isMono() ? 'mono' : 'poly'}${sel > 0 ? ` · trk ${sel}` : ''}${loopOn ? ' · loop' : ''}`);
      };

      const load = async (url, display) => {
        setStatus('loading…');
        try {
          const res = await fetch(encodeURI(url));
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          notes = parseMidi(await res.arrayBuffer()).notes;
          loaded = true;
          if (display) { p.filename = display; api.view?.setReadout?.('filename', display); }
          setStatus(`${notes.length} notes`);
          if (wantStart) schedule();
        } catch (e) { console.error('[midifile] load failed', url, e); setStatus('load failed'); }
      };

      resetVoices();
      if (p.src) load(p.src, p.filename || p.src.split('/').pop()); // auto-load a bundled path

      return {
        _load: load,                                  // render's Load button hands us a picked file
        // rewind to the top: the transport's own stop() resets its position to 0 (unlike the
        // main Stop button, which only pauses). Silence held voices; scheduled events persist and
        // refire from the start on the next Play.
        _rewind: () => { const t = Tr(); t.stop(); allNotesOff(); resetVoices(); t.seconds = 0; setStatus(loaded ? `${notes.length} notes · rewound` : 'idle'); },
        start: () => { wantStart = true; if (loaded) schedule(); }, // engine calls on Start Audio
        stop: () => { clearSchedule(); allNotesOff(); },
        setParam: (n, v) => {
          if (n === 'voices') { p.voices = clampVoices(v); resetVoices(); if (loaded && wantStart) schedule(); }
          else if (n === 'mode') { p.mode = v; allNotesOff(); resetVoices(); if (loaded && wantStart) schedule(); }
          else if (n === 'retrig') { p.retrig = v; allNotesOff(); resetVoices(); }
          else if (n === 'track') { p.track = Math.round(+v) || 0; allNotesOff(); resetVoices(); if (loaded && wantStart) schedule(); }
          else if (n === 'start') { p.start = Math.max(0, +v || 0); allNotesOff(); resetVoices(); if (loaded && wantStart) schedule(); }
          else if (n === 'transpose') { p.transpose = Math.round(+v) || 0; }
          else if (n === 'loop') { p.loop = v; if (loaded && wantStart) schedule(); }
        },
        dispose: () => { clearSchedule(); allNotesOff(); },
      };
    },
  },
];
