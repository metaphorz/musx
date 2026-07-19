// midifile.js — a tiny, dependency-free Standard MIDI File (SMF) parser. Parses formats 0/1,
// merges all tracks onto one absolute timeline, applies the tempo map, and returns note events
// in SECONDS. Just enough to drive a synth voice from a .mid — note on/off, tempo, division.
//
//   parseMidi(arrayBuffer) -> {
//     durationSec,
//     notes:  [{ time, dur, midi, velocity, track, channel }]   // sorted by start time (seconds)
//     tracks: [{ index, name, noteCount, minMidi, maxMidi, channels }]  // per-track summary
//   }
// `track` on each note is the source MTrk index; the `tracks` summary (with track names read
// from FF 03 meta events) lets a caller isolate one part — e.g. drive a mono voice from just the
// melody track of a multi-track file instead of the merged top note.
//
// Only what's needed for playback is decoded: note-on (0x90) / note-off (0x80), note-on with
// velocity 0 (== note-off), and Set-Tempo meta (0xFF 0x51). Everything else is skipped cleanly.

export function parseMidi(arrayBuffer) {
  const dv = new DataView(arrayBuffer);
  let pos = 0;
  const u8 = () => dv.getUint8(pos++);
  const u16 = () => { const v = dv.getUint16(pos); pos += 2; return v; };
  const u32 = () => { const v = dv.getUint32(pos); pos += 4; return v; };
  const str4 = () => String.fromCharCode(u8(), u8(), u8(), u8());
  const vlq = () => {                       // variable-length quantity (delta times, meta lengths)
    let v = 0, b;
    do { b = u8(); v = (v << 7) | (b & 0x7f); } while (b & 0x80);
    return v;
  };

  if (str4() !== 'MThd') throw new Error('Not a MIDI file (missing MThd header)');
  u32();                                     // header length (always 6)
  u16();                                     // format (0/1/2) — we merge tracks either way
  const nTracks = u16();
  const division = u16();                    // ticks per quarter note (assume metrical, not SMPTE)
  const ticksPerQuarter = division & 0x7fff;

  // First pass per track: collect raw events with absolute TICKS; gather a global tempo map.
  const tempoMap = [{ tick: 0, usPerQuarter: 500000 }];  // default 120 BPM
  const rawNotes = [];                       // { tick, type:'on'|'off', midi, velocity, track, channel }
  const trackNames = [];                     // index -> name (from FF 03 meta)

  for (let t = 0; t < nTracks; t++) {
    if (str4() !== 'MTrk') throw new Error(`Bad track ${t} (missing MTrk)`);
    const len = u32();
    const end = pos + len;
    let tick = 0, running = 0;
    while (pos < end) {
      tick += vlq();
      let status = dv.getUint8(pos);
      if (status & 0x80) { pos++; running = status; } else { status = running; } // running status
      const hi = status & 0xf0;
      if (status === 0xff) {                 // meta event
        const type = u8();
        const mlen = vlq();
        if (type === 0x51) {                 // set tempo (3 bytes, us per quarter)
          const us = (dv.getUint8(pos) << 16) | (dv.getUint8(pos + 1) << 8) | dv.getUint8(pos + 2);
          tempoMap.push({ tick, usPerQuarter: us });
        } else if (type === 0x03) {          // track name
          let s = ''; for (let k = 0; k < mlen; k++) s += String.fromCharCode(dv.getUint8(pos + k));
          if (!trackNames[t]) trackNames[t] = s.trim();
        }
        pos += mlen;
      } else if (status === 0xf0 || status === 0xf7) { // sysex — skip
        const slen = vlq(); pos += slen;
      } else if (hi === 0x90 || hi === 0x80) {         // note on / note off
        const midi = u8(), velocity = u8();
        const channel = status & 0x0f;
        if (hi === 0x90 && velocity > 0) rawNotes.push({ tick, type: 'on', midi, velocity, track: t, channel });
        else rawNotes.push({ tick, type: 'off', midi, track: t, channel });
      } else if (hi === 0xc0 || hi === 0xd0) {         // program change / channel pressure: 1 data byte
        pos += 1;
      } else {                                          // other channel voice msgs: 2 data bytes
        pos += 2;
      }
    }
    pos = end;                               // stay aligned even if a track had trailing bytes
  }

  // Build a tick->seconds converter from the (sorted) tempo map.
  tempoMap.sort((a, b) => a.tick - b.tick);
  const tickToSec = (targetTick) => {
    let sec = 0;
    for (let i = 0; i < tempoMap.length; i++) {
      const seg = tempoMap[i];
      const next = tempoMap[i + 1];
      const segEnd = next ? Math.min(next.tick, targetTick) : targetTick;
      if (segEnd > seg.tick) sec += ((segEnd - seg.tick) / ticksPerQuarter) * (seg.usPerQuarter / 1e6);
      if (next && next.tick >= targetTick) break;
      if (!next) break;
    }
    return sec;
  };

  // Pair note-ons with their matching note-offs (per track+channel+pitch) into {time,dur,midi,…}.
  rawNotes.sort((a, b) => a.tick - b.tick || (a.type === 'off' ? -1 : 1));
  const open = new Map();                    // "track:channel:midi" -> [{ tick, velocity }]
  const notes = [];
  const keyOf = (ev) => `${ev.track}:${ev.channel}:${ev.midi}`;
  for (const ev of rawNotes) {
    const key = keyOf(ev);
    if (ev.type === 'on') {
      if (!open.has(key)) open.set(key, []);
      open.get(key).push({ tick: ev.tick, velocity: ev.velocity });
    } else {
      const stack = open.get(key);
      if (stack && stack.length) {
        const on = stack.shift();
        notes.push({ time: tickToSec(on.tick), dur: tickToSec(ev.tick) - tickToSec(on.tick),
          beat: on.tick / ticksPerQuarter, durBeats: (ev.tick - on.tick) / ticksPerQuarter, // tempo-independent (quarter notes)
          midi: ev.midi, velocity: on.velocity, track: ev.track, channel: ev.channel });
      }
    }
  }
  notes.sort((a, b) => a.time - b.time);
  const durationSec = notes.reduce((m, n) => Math.max(m, n.time + n.dur), 0);

  // Per-track summary (helps a caller isolate one part, e.g. the melody).
  const byTrack = new Map();
  for (const n of notes) {
    let s = byTrack.get(n.track);
    if (!s) { s = { index: n.track, name: trackNames[n.track] || '', noteCount: 0, minMidi: Infinity, maxMidi: -Infinity, channels: new Set() }; byTrack.set(n.track, s); }
    s.noteCount++; s.minMidi = Math.min(s.minMidi, n.midi); s.maxMidi = Math.max(s.maxMidi, n.midi); s.channels.add(n.channel);
  }
  const tracks = [...byTrack.values()].sort((a, b) => a.index - b.index);
  return { durationSec, notes, tracks };
}
