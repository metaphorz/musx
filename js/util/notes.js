// notes.js — frequency/MIDI <-> note-name helpers.
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Nearest note name for a frequency, but ONLY if it's within `tolCents` of an
// equal-tempered note; otherwise '' (many frequencies aren't notes — leave it blank).
export function hzToNote(hz, tolCents = 8) {
  if (!(hz > 0)) return '';
  const midi = 69 + 12 * Math.log2(hz / 440);
  const nearest = Math.round(midi);
  if (Math.abs((midi - nearest) * 100) > tolCents) return '';
  return NAMES[((nearest % 12) + 12) % 12] + (Math.floor(nearest / 12) - 1);
}

// Note name for a MIDI number (always defined, since MIDI numbers are notes).
export function midiToNote(midi) {
  const m = Math.round(midi);
  return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}
