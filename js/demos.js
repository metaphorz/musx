// demos.js — built-in patches. Two of these recreate the cycling74.com "Sound without
// limits" examples (patch 1 + patch 3). Max's MC (multichannel) objects are emulated
// with stacks of detuned oscillators, since this tool is single-channel.

// Custom Synth — emulates patch 1 ("a custom synthesizer with as many oscillators and
// effects as you wish": mc.saw~/mc.rect~ -> mc.lores~/mc.reson~ -> distortion -> multi-delay).
const customSynth = {
  name: 'Custom Synth (patch 1)',
  patch: {
    version: 1,
    nodes: [
      { id: 'n1', type: 'seq', x: 296, y: 40, params: { steps: 16, root: 45, scale: 'penta', rate: '16n', gate: 0.6,
        notes: [0, -1, 3, -1, 2, 5, -1, 1, 4, -1, 2, -1, 6, 3, -1, 0] } },
      { id: 'n2', type: 'osc', x: 40, y: 493, params: { wave: 'sawtooth', freq: 110 } },
      { id: 'n3', type: 'osc', x: 376, y: 493, params: { wave: 'square', freq: 110 } },
      { id: 'n4', type: 'adsr', x: 423, y: 662, params: { attack: 0.01, decay: 0.18, sustain: 0.35, release: 0.25 } },
      { id: 'n5', type: 'slider', x: 668, y: 40, params: { lo: 200, hi: 4500, value: 1600 } },
      { id: 'n6', type: 'filter', x: 442, y: 928, params: { type: 'lowpass', cutoff: 1600, Q: 7 } },
      { id: 'n7', type: 'dist', x: 464, y: 1130, params: { amount: 0.3, wet: 0.8 } },
      { id: 'n8', type: 'delay', x: 464, y: 1283, params: { time: 0.19, feedback: 0.34, wet: 0.3 } },
      { id: 'n9', type: 'dac', x: 412, y: 1469, params: {} },
      { id: 'n10', type: 'scope', x: 580, y: 1469, params: {} },
    ],
    connections: [
      { from: { nodeId: 'n1', port: 'freq' }, to: { nodeId: 'n2', port: 'freq' }, kind: 'control' },
      { from: { nodeId: 'n1', port: 'freq' }, to: { nodeId: 'n3', port: 'freq' }, kind: 'control' },
      { from: { nodeId: 'n1', port: 'trig' }, to: { nodeId: 'n4', port: 'trig' }, kind: 'control' },
      { from: { nodeId: 'n2', port: 'out' }, to: { nodeId: 'n4', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'n3', port: 'out' }, to: { nodeId: 'n4', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'n4', port: 'out' }, to: { nodeId: 'n6', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'n5', port: 'out' }, to: { nodeId: 'n6', port: 'cutoff' }, kind: 'control' },
      { from: { nodeId: 'n6', port: 'out' }, to: { nodeId: 'n7', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'n7', port: 'out' }, to: { nodeId: 'n8', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'n8', port: 'out' }, to: { nodeId: 'n9', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'n8', port: 'out' }, to: { nodeId: 'n10', port: 'in' }, kind: 'audio' },
    ],
  },
};

// Layered Pad — emulates patch 3 ("build up more layered sounds using MC objects":
// sig~ 440 -> mc.dup~ 50 -> mc.rand~ -> mc.cycle~ @chans 50 -> mc.stereo~). Here: a stack
// of detuned sine oscillators -> mixer -> filter (swept by an LFO) -> reverb.
const layeredPad = {
  name: 'Layered Pad (patch 3)',
  patch: {
    version: 1,
    nodes: [
      { id: 'o1', type: 'osc', x: 40, y: 40, params: { wave: 'sine', freq: 110 } },
      { id: 'o2', type: 'osc', x: 376, y: 40, params: { wave: 'sawtooth', freq: 118.4 } },
      { id: 'o3', type: 'osc', x: 712, y: 40, params: { wave: 'square', freq: 220 } },
      { id: 'o4', type: 'osc', x: 1048, y: 40, params: { wave: 'square', freq: 220.7 } },
      { id: 'o5', type: 'osc', x: 1384, y: 40, params: { wave: 'sawtooth', freq: 338 } },
      { id: 'o6', type: 'osc', x: 1720, y: 40, params: { wave: 'square', freq: 329.2 } },
      { id: 'mix', type: 'gain', x: 1044, y: 278, params: { level: 0.6 } },
      { id: 'lfo', type: 'funcgen', x: 2056, y: 40, params: { expr: '450+1100*(0.5+0.5*sin(2*pi*t))', freq: 110, cycle: 8 } },
      { id: 'flt', type: 'filter', x: 1111, y: 405, params: { type: 'lowpass', cutoff: 900, Q: 2 } },
      { id: 'rev', type: 'reverb', x: 1133, y: 607, params: { decay: 4.5, wet: 0.34 } },
      { id: 'out', type: 'dac', x: 1081, y: 800, params: {} },
      { id: 'sc', type: 'scope', x: 1249, y: 800, params: {} },
    ],
    connections: [
      ...['o1', 'o2', 'o3', 'o4', 'o5', 'o6'].map((o) => ({ from: { nodeId: o, port: 'out' }, to: { nodeId: 'mix', port: 'in' }, kind: 'audio' })),
      { from: { nodeId: 'mix', port: 'out' }, to: { nodeId: 'flt', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'lfo', port: 'val' }, to: { nodeId: 'flt', port: 'cutoff' }, kind: 'control' },
      { from: { nodeId: 'flt', port: 'out' }, to: { nodeId: 'rev', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'rev', port: 'out' }, to: { nodeId: 'out', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'rev', port: 'out' }, to: { nodeId: 'sc', port: 'in' }, kind: 'audio' },
    ],
  },
};

// Function generator -> plot showcase (algebraically specified function).
const funcPlot = {
  name: 'FuncGen → Plot + Sound',
  patch: {
    version: 1,
    nodes: [
      { id: 'f1', type: 'funcgen', x: 163, y: 40, params: { expr: 'sin(2*pi*t) + 0.3*sin(6*pi*t)', freq: 180, cycle: 3 } },
      { id: 'p1', type: 'plot', x: 40, y: 278, params: {} },
      { id: 'g1', type: 'gain', x: 330, y: 278, params: { level: 0.5 } },
      { id: 'd1', type: 'dac', x: 278, y: 507, params: {} },
      { id: 's1', type: 'scope', x: 446, y: 507, params: {} },
    ],
    connections: [
      { from: { nodeId: 'f1', port: 'val' }, to: { nodeId: 'p1', port: 'in' }, kind: 'control' },
      { from: { nodeId: 'f1', port: 'sig' }, to: { nodeId: 'g1', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'g1', port: 'out' }, to: { nodeId: 'd1', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'g1', port: 'out' }, to: { nodeId: 's1', port: 'in' }, kind: 'audio' },
    ],
  },
};

// Keyboard Synth — minimal playable synth: keyboard -> osc + adsr -> filter -> dac.
const keyboardSynth = {
  name: 'Keyboard Synth (playable)',
  patch: {
    version: 1,
    nodes: [
      { id: 'kb', type: 'keyboard', x: 119, y: 40, params: { octaves: 2, base: 48, dur: 0.6 } },
      { id: 'os', type: 'osc', x: 40, y: 318, params: { wave: 'sawtooth', freq: 220 } },
      { id: 'ad', type: 'adsr', x: 192, y: 487, params: { attack: 0.01, decay: 0.15, sustain: 0.5, release: 0.4 } },
      { id: 'fl', type: 'filter', x: 139, y: 753, params: { type: 'lowpass', cutoff: 1800, Q: 3 } },
      { id: 'dc', type: 'dac', x: 109, y: 955, params: {} },
      { id: 'sc', type: 'scope', x: 277, y: 955, params: {} },
    ],
    connections: [
      { from: { nodeId: 'kb', port: 'freq' }, to: { nodeId: 'os', port: 'freq' }, kind: 'control' },
      { from: { nodeId: 'kb', port: 'trig' }, to: { nodeId: 'ad', port: 'trig' }, kind: 'control' },
      { from: { nodeId: 'os', port: 'out' }, to: { nodeId: 'ad', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'ad', port: 'out' }, to: { nodeId: 'fl', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'fl', port: 'out' }, to: { nodeId: 'dc', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'fl', port: 'out' }, to: { nodeId: 'sc', port: 'in' }, kind: 'audio' },
    ],
  },
};

// XY Synth — faithful recreation of the original patch-1 source: an XY pad whose X/Y go
// through `scale 0 127 120. 1000.` -> tri~ and `scale 0 127 120. 5000.` -> lores~ -> dac~.
const xySynth = {
  name: 'XY Synth (patch 1 source)',
  patch: {
    version: 1,
    nodes: [
      { id: 'xy', type: 'xypad', x: 231, y: 40, params: { x: 64, y: 80 } },
      { id: 'sx', type: 'scale', x: 40, y: 297, params: { inLo: 0, inHi: 127, outLo: 120, outHi: 1000 } },
      { id: 'sy', type: 'scale', x: 340, y: 297, params: { inLo: 0, inHi: 127, outLo: 120, outHi: 5000 } },
      { id: 'tr', type: 'osc', x: 73, y: 530, params: { wave: 'triangle', freq: 220 } },
      { id: 'lo', type: 'filter', x: 172, y: 699, params: { type: 'lowpass', cutoff: 200, Q: 6 } },
      { id: 'dc', type: 'dac', x: 142, y: 901, params: {} },
      { id: 'sc', type: 'scope', x: 310, y: 901, params: {} },
    ],
    connections: [
      { from: { nodeId: 'xy', port: 'x' }, to: { nodeId: 'sx', port: 'in' }, kind: 'control' },
      { from: { nodeId: 'xy', port: 'y' }, to: { nodeId: 'sy', port: 'in' }, kind: 'control' },
      { from: { nodeId: 'sx', port: 'out' }, to: { nodeId: 'tr', port: 'freq' }, kind: 'control' },
      { from: { nodeId: 'sy', port: 'out' }, to: { nodeId: 'lo', port: 'cutoff' }, kind: 'control' },
      { from: { nodeId: 'tr', port: 'out' }, to: { nodeId: 'lo', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'lo', port: 'out' }, to: { nodeId: 'dc', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'lo', port: 'out' }, to: { nodeId: 'sc', port: 'in' }, kind: 'audio' },
    ],
  },
};

// Bang + Code — exercises the bang, message, and code objects. A `message` sends a MIDI
// note number into a `code` object that converts it to Hz (a * -> frequency), feeding the
// oscillator; the `bang` button manually triggers the ADSR. Click message to set pitch,
// then click BANG to play the note.
const bangCode = {
  name: 'Bang + Code',
  patch: {
    version: 1,
    nodes: [
      { id: 'msg', type: 'message', x: 74, y: 40, params: { value: '57' } },
      { id: 'cd', type: 'code', x: 54, y: 229, params: { lang: 'js', code: 'return 440 * Math.pow(2, (a - 69) / 12);' } },
      { id: 'bng', type: 'bang', x: 326, y: 40 },
      { id: 'os', type: 'osc', x: 40, y: 480, params: { wave: 'sawtooth', freq: 220 } },
      { id: 'ad', type: 'adsr', x: 192, y: 649, params: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.5 } },
      { id: 'fl', type: 'filter', x: 139, y: 915, params: { type: 'lowpass', cutoff: 1600, Q: 2 } },
      { id: 'dc', type: 'dac', x: 109, y: 1117, params: {} },
      { id: 'sc', type: 'scope', x: 277, y: 1117, params: {} },
    ],
    connections: [
      { from: { nodeId: 'msg', port: 'out' }, to: { nodeId: 'cd', port: 'a' }, kind: 'control' },
      { from: { nodeId: 'cd', port: 'out' }, to: { nodeId: 'os', port: 'freq' }, kind: 'control' },
      { from: { nodeId: 'bng', port: 'out' }, to: { nodeId: 'ad', port: 'trig' }, kind: 'control' },
      { from: { nodeId: 'os', port: 'out' }, to: { nodeId: 'ad', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'ad', port: 'out' }, to: { nodeId: 'fl', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'fl', port: 'out' }, to: { nodeId: 'dc', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'fl', port: 'out' }, to: { nodeId: 'sc', port: 'in' }, kind: 'audio' },
    ],
  },
};

// Richsound Voice — the fat, wide "supersaw" pad architecture (Hexeract-inspired): three
// `unison~` modules (each up to 8 detuned, stereo-spread oscillators) summed -> filter -> ADSR.
// Packaged as a `patcher` (the same graph shipped as patches/abstractions/richsound-voice.json),
// so a single keyboard note fans out to ~18 detuned voices spread across the stereo field.
const richsoundVoicePatch = {
  version: 1,
  nodes: [
    { id: 'freq', type: 'inlet', x: 40, y: 40, params: {} },
    { id: 'trig', type: 'inlet', x: 620, y: 40, params: {} },
    { id: 'o1', type: 'unison', x: 40, y: 150, params: { wave: 'sawtooth', voices: 7, detune: 22, spread: 0.85, level: 0.6, freq: 220 } },
    { id: 'o2', type: 'unison', x: 250, y: 150, params: { wave: 'sawtooth', voices: 6, detune: 40, spread: 0.6, level: 0.5, freq: 220 } },
    { id: 'o3', type: 'unison', x: 460, y: 150, params: { wave: 'triangle', voices: 5, detune: 12, spread: 0.35, level: 0.45, freq: 220 } },
    { id: 'mix', type: 'gain', x: 250, y: 320, params: { level: 0.8 } },
    { id: 'flt', type: 'filter', x: 250, y: 430, params: { type: 'lowpass', cutoff: 2600, Q: 0.7 } },
    { id: 'env', type: 'adsr', x: 250, y: 540, params: { attack: 0.4, decay: 0.6, sustain: 0.7, release: 1.4 } },
    { id: 'out', type: 'outlet~', x: 250, y: 660, params: {} },
  ],
  connections: [
    { from: { nodeId: 'freq', port: 'out' }, to: { nodeId: 'o1', port: 'freq' }, kind: 'control' },
    { from: { nodeId: 'freq', port: 'out' }, to: { nodeId: 'o2', port: 'freq' }, kind: 'control' },
    { from: { nodeId: 'freq', port: 'out' }, to: { nodeId: 'o3', port: 'freq' }, kind: 'control' },
    { from: { nodeId: 'o1', port: 'out' }, to: { nodeId: 'mix', port: 'in' }, kind: 'audio' },
    { from: { nodeId: 'o2', port: 'out' }, to: { nodeId: 'mix', port: 'in' }, kind: 'audio' },
    { from: { nodeId: 'o3', port: 'out' }, to: { nodeId: 'mix', port: 'in' }, kind: 'audio' },
    { from: { nodeId: 'mix', port: 'out' }, to: { nodeId: 'flt', port: 'in' }, kind: 'audio' },
    { from: { nodeId: 'flt', port: 'out' }, to: { nodeId: 'env', port: 'in' }, kind: 'audio' },
    { from: { nodeId: 'trig', port: 'out' }, to: { nodeId: 'env', port: 'trig' }, kind: 'control' },
    { from: { nodeId: 'env', port: 'out' }, to: { nodeId: 'out', port: 'in' }, kind: 'audio' },
  ],
};
// clone the richsound voice (so each instance is independent) and tune its 3 unison~ modules
// to a given base frequency in Hz
const voiceAt = (hz) => { const pt = structuredClone(richsoundVoicePatch); for (const n of pt.nodes) if (n.type === 'unison') n.params.freq = hz; return pt; };

// Richsound Chord — three richsound voices gated by ONE keyboard so a held key sustains a big,
// wide chord. A `chord` node turns the pressed pitch into the chord tones (default: minor triad);
// its 3 outlets set each voice's frequency, while the one keyboard `trig` gates all three
// envelopes — hold = chord sustains, release = fades. Change the chord node's quality (major/
// minor/aug/dim/sus) and notes (root / power / triad / 7th) live; "root" makes it a fat unison.
const richsound = {
  name: 'Richsound Chord (hold a key to sustain)',
  patch: {
    version: 1,
    nodes: [
      { id: 'kb', type: 'keyboard', x: 104, y: 40, params: { octaves: 2, base: 48, dur: 1 } },
      { id: 'ch', type: 'chord', x: 107, y: 318, params: { quality: 'minor', size: 'triad (1-3-5)' } },
      { id: 'v1', type: 'patcher', x: 40, y: 489,  params: { patch: voiceAt(130.81) } },
      { id: 'v2', type: 'patcher', x: 208, y: 489, params: { patch: voiceAt(155.56) } },
      { id: 'v3', type: 'patcher', x: 376, y: 489, params: { patch: voiceAt(196.00) } },
      { id: 'dc', type: 'dac', x: 208, y: 596, params: {} },
    ],
    connections: [
      { from: { nodeId: 'kb', port: 'freq' }, to: { nodeId: 'ch', port: 'root' }, kind: 'control' },
      { from: { nodeId: 'ch', port: '1' }, to: { nodeId: 'v1', port: 'in1' }, kind: 'control' },
      { from: { nodeId: 'ch', port: '2' }, to: { nodeId: 'v2', port: 'in1' }, kind: 'control' },
      { from: { nodeId: 'ch', port: '3' }, to: { nodeId: 'v3', port: 'in1' }, kind: 'control' },
      { from: { nodeId: 'kb', port: 'trig' }, to: { nodeId: 'v1', port: 'in2' }, kind: 'control' },
      { from: { nodeId: 'kb', port: 'trig' }, to: { nodeId: 'v2', port: 'in2' }, kind: 'control' },
      { from: { nodeId: 'kb', port: 'trig' }, to: { nodeId: 'v3', port: 'in2' }, kind: 'control' },
      { from: { nodeId: 'v1', port: 'out1' }, to: { nodeId: 'dc', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'v2', port: 'out1' }, to: { nodeId: 'dc', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'v3', port: 'out1' }, to: { nodeId: 'dc', port: 'in' }, kind: 'audio' },
    ],
  },
};

// Sampler (playable) — the sampled counterpart of a synth voice: the keyboard plays a loaded
// sample chromatically (varispeed), holding a key to sustain. The sample is the bundled "ah"
// vowel, recorded near C3, so its `root` is MIDI 48.
const samplerPlay = {
  name: 'Sampler (playable)',
  patch: {
    version: 1,
    nodes: [
      { id: 'kb', type: 'keyboard', x: 40, y: 40, params: { octaves: 2, base: 48, dur: 1 } },
      { id: 'sm', type: 'sampler', x: 81, y: 318, params: { src: 'sounds/vocal/voice-ah.wav', filename: 'voice-ah.wav', root: 48, attack: 0.05, release: 0.7, level: 0.9 } },
      { id: 'dc', type: 'dac', x: 144, y: 677, params: {} },
    ],
    connections: [
      { from: { nodeId: 'kb', port: 'freq' }, to: { nodeId: 'sm', port: 'freq' }, kind: 'control' },
      { from: { nodeId: 'kb', port: 'trig' }, to: { nodeId: 'sm', port: 'trig' }, kind: 'control' },
      { from: { nodeId: 'sm', port: 'out' }, to: { nodeId: 'dc', port: 'in' }, kind: 'audio' },
    ],
  },
};

// Sampled Chord — the same keyboard + chord rig as Richsound Chord, but the three voices are
// `sampler~` playing the "ah" vowel instead of unison oscillators: a held key sustains a
// choir-like sampled chord. Start-Mod (30 ms) keeps the three identical samples from
// phase-cancelling. The ONLY difference from Richsound Chord is the voice type.
const sampledChord = {
  name: 'Sampled Chord (choir)',
  patch: {
    version: 1,
    nodes: [
      { id: 'kb', type: 'keyboard', x: 295, y: 40, params: { octaves: 2, base: 48, dur: 1 } },
      { id: 'ch', type: 'chord', x: 274, y: 318, params: { quality: 'minor', size: 'triad (1-3-5)' } },
      { id: 's1', type: 'sampler', x: 40, y: 489,  params: { src: 'sounds/vocal/voice-ah.wav', filename: 'voice-ah.wav', root: 48, attack: 0.3, release: 1.4, startmod: 30, level: 0.7 } },
      { id: 's2', type: 'sampler', x: 335, y: 489, params: { src: 'sounds/vocal/voice-ah.wav', filename: 'voice-ah.wav', root: 48, attack: 0.3, release: 1.4, startmod: 30, level: 0.7 } },
      { id: 's3', type: 'sampler', x: 630, y: 489, params: { src: 'sounds/vocal/voice-ah.wav', filename: 'voice-ah.wav', root: 48, attack: 0.3, release: 1.4, startmod: 30, level: 0.7 } },
      { id: 'dc', type: 'dac', x: 399, y: 848, params: {} },
    ],
    connections: [
      { from: { nodeId: 'kb', port: 'freq' }, to: { nodeId: 'ch', port: 'root' }, kind: 'control' },
      { from: { nodeId: 'ch', port: '1' }, to: { nodeId: 's1', port: 'freq' }, kind: 'control' },
      { from: { nodeId: 'ch', port: '2' }, to: { nodeId: 's2', port: 'freq' }, kind: 'control' },
      { from: { nodeId: 'ch', port: '3' }, to: { nodeId: 's3', port: 'freq' }, kind: 'control' },
      { from: { nodeId: 'kb', port: 'trig' }, to: { nodeId: 's1', port: 'trig' }, kind: 'control' },
      { from: { nodeId: 'kb', port: 'trig' }, to: { nodeId: 's2', port: 'trig' }, kind: 'control' },
      { from: { nodeId: 'kb', port: 'trig' }, to: { nodeId: 's3', port: 'trig' }, kind: 'control' },
      { from: { nodeId: 's1', port: 'out' }, to: { nodeId: 'dc', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 's2', port: 'out' }, to: { nodeId: 'dc', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 's3', port: 'out' }, to: { nodeId: 'dc', port: 'in' }, kind: 'audio' },
    ],
  },
};

// 3D Orbit — a spatialization demo. A bright sawtooth drone runs through spat~ (HRTF), and
// two funcgen LFOs circle it around the listener: x = 8*sin, z = -8*cos (a horizontal orbit).
// Sawtooth's high harmonics give the head-shadow (ILD) cues HRTF needs, so on headphones the
// tone clearly travels left -> front -> right -> back. Start Audio and it moves on its own.
const spatialOrbit = {
  name: '3D Orbit (spatial)',
  patch: {
    version: 1,
    nodes: [
      { id: 'src', type: 'osc', x: 40, y: 40, params: { wave: 'sawtooth', freq: 180 } },
      { id: 'lvl', type: 'gain', x: 260, y: 278, params: { level: 0.5 } },
      { id: 'fx', type: 'funcgen', x: 376, y: 40, params: { expr: '8*sin(2*pi*t)', freq: 180, cycle: 6 } },
      { id: 'fz', type: 'funcgen', x: 712, y: 40, params: { expr: '-8*cos(2*pi*t)', freq: 180, cycle: 6 } },
      { id: 'sp', type: 'spat', x: 398, y: 405, params: { x: 0, y: 0, z: -8 } },
      { id: 'dc', type: 'dac', x: 460, y: 584, params: {} },
    ],
    connections: [
      { from: { nodeId: 'src', port: 'out' }, to: { nodeId: 'lvl', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'lvl', port: 'out' }, to: { nodeId: 'sp', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'fx', port: 'val' }, to: { nodeId: 'sp', port: 'x' }, kind: 'control' },
      { from: { nodeId: 'fz', port: 'val' }, to: { nodeId: 'sp', port: 'z' }, kind: 'control' },
      { from: { nodeId: 'sp', port: 'out' }, to: { nodeId: 'dc', port: 'in' }, kind: 'audio' },
    ],
  },
};

// Cathedral Pad — the full "fat & massive" recipe as one wired PLAYABLE patch. Press a key and
// the pad sustains for as long as you hold it (adsr~ sustain = 1.0), releasing into a long tail.
// The keyboard feeds a chord (power 1-5) that pitches the two detuned unison~ voices to the
// played root + fifth, while a math (x0.5) node drives a sine one octave below for sub weight —
// so the lowest key (A2) reproduces the original 110 + 165 + 55 Hz stack exactly. A lowpass tames
// the buzz, light dist~ adds harmonic body, and an adsr~ gates the whole thing. The reverb is a
// proper SEND: the dry sound goes to dac, while a parallel branch is high-passed (cut lows so the
// tail stays clean), fed to a long reverb~ with pre-delay (keeps the attack clear), then
// low-passed to roll off the ultra-highs.
const cathedralPad = {
  name: 'Cathedral Pad (hold a key to sustain)',
  patch: {
    version: 1,
    nodes: [
      { id: 'kb', type: 'keyboard', x: 590, y: 40, params: { octaves: 2, base: 45, dur: 1 } },                                                     // base A2 = 110 Hz
      { id: 'ch', type: 'chord', x: 247, y: 318, params: { quality: 'major', size: 'power (1-5)' } },                                               // root + fifth
      { id: 'm', type: 'math', x: 730, y: 318, params: { op: '*', b: 0.5 } },                                                                       // sub = root octave down
      { id: 'u1', type: 'unison', x: 40, y: 489, params: { wave: 'sawtooth', voices: 7, detune: 22, spread: 0.9, level: 0.55, freq: 110 } },         // root
      { id: 'u2', type: 'unison', x: 376, y: 489, params: { wave: 'sawtooth', voices: 7, detune: 22, spread: 0.9, level: 0.45, freq: 164.81 } },     // fifth
      { id: 'sub', type: 'osc', x: 712, y: 489, params: { wave: 'sine', freq: 55 } },                                                                // sub octave
      { id: 'mix', type: 'gain', x: 482, y: 769, params: { level: 0.4 } },
      { id: 'lp', type: 'filter', x: 460, y: 896, params: { type: 'lowpass', cutoff: 2200, Q: 0.7 } },
      { id: 'sat', type: 'dist', x: 492, y: 1098, params: { amount: 0.15, wet: 0.5 } },                                                              // gentle saturation
      { id: 'env', type: 'adsr', x: 612, y: 1251, params: { attack: 0.15, decay: 0.2, sustain: 1.0, release: 2.0 } },                                 // gate: hold = sustain
      { id: 'hp', type: 'filter', x: 460, y: 1517, params: { type: 'highpass', cutoff: 450, Q: 0.7 } },                                              // EQ the reverb send: cut lows
      { id: 'rev', type: 'reverb', x: 482, y: 1719, params: { decay: 5, predelay: 25, wet: 1 } },                                                   // long, pre-delayed cathedral
      { id: 'rlp', type: 'filter', x: 460, y: 1912, params: { type: 'lowpass', cutoff: 6500, Q: 0.7 } },                                            // roll off ultra-highs
      { id: 'dc', type: 'dac', x: 643, y: 2114, params: {} },
    ],
    connections: [
      // keyboard -> pitch: chord voices the root + fifth; math drops a sine an octave below
      { from: { nodeId: 'kb', port: 'freq' }, to: { nodeId: 'ch', port: 'root' }, kind: 'control' },
      { from: { nodeId: 'ch', port: '1' }, to: { nodeId: 'u1', port: 'freq' }, kind: 'control' },
      { from: { nodeId: 'ch', port: '2' }, to: { nodeId: 'u2', port: 'freq' }, kind: 'control' },
      { from: { nodeId: 'kb', port: 'freq' }, to: { nodeId: 'm', port: 'a' }, kind: 'control' },
      { from: { nodeId: 'm', port: 'out' }, to: { nodeId: 'sub', port: 'freq' }, kind: 'control' },
      // audio core -> gate
      { from: { nodeId: 'u1', port: 'out' }, to: { nodeId: 'mix', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'u2', port: 'out' }, to: { nodeId: 'mix', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'sub', port: 'out' }, to: { nodeId: 'mix', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'mix', port: 'out' }, to: { nodeId: 'lp', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'lp', port: 'out' }, to: { nodeId: 'sat', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'sat', port: 'out' }, to: { nodeId: 'env', port: 'in' }, kind: 'audio' },
      // keyboard gates the envelope: hold = sustain, release = fade into the tail
      { from: { nodeId: 'kb', port: 'trig' }, to: { nodeId: 'env', port: 'trig' }, kind: 'control' },
      { from: { nodeId: 'env', port: 'out' }, to: { nodeId: 'dc', port: 'in' }, kind: 'audio' },    // dry
      { from: { nodeId: 'env', port: 'out' }, to: { nodeId: 'hp', port: 'in' }, kind: 'audio' },    // reverb send
      { from: { nodeId: 'hp', port: 'out' }, to: { nodeId: 'rev', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'rev', port: 'out' }, to: { nodeId: 'rlp', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'rlp', port: 'out' }, to: { nodeId: 'dc', port: 'in' }, kind: 'audio' },    // wet return
    ],
  },
};

// One polyphonic Cathedral VOICE, as a patcher abstraction: inlets freq + trig, outlet~ out.
// Unlike the mono pad it plays ONE note (no added fifth — the MIDI supplies the harmony), but
// keeps the fat character: detuned unison~ saw + a sine an octave below (math x0.5) + gentle
// dist~ + an adsr~ with sustain = 1 so a held note sustains. The shared cathedral reverb lives
// OUTSIDE the voice (in the demo), so eight of these sum into one reverb rather than eight.
const cathedralVoicePatch = {
  version: 1,
  nodes: [
    { id: 'freq', type: 'inlet', x: 40, y: 40, params: {} },
    { id: 'trig', type: 'inlet', x: 560, y: 40, params: {} },
    { id: 'u1', type: 'unison', x: 40, y: 160, params: { wave: 'sawtooth', voices: 5, detune: 18, spread: 0.8, level: 0.5, freq: 220 } },
    { id: 'm', type: 'math', x: 260, y: 160, params: { op: '*', b: 0.5 } },
    { id: 'sub', type: 'osc', x: 260, y: 300, params: { wave: 'sine', freq: 110 } },
    { id: 'mix', type: 'gain', x: 120, y: 320, params: { level: 0.45 } },
    { id: 'lp', type: 'filter', x: 120, y: 440, params: { type: 'lowpass', cutoff: 2200, Q: 0.7 } },
    { id: 'sat', type: 'dist', x: 120, y: 560, params: { amount: 0.12, wet: 0.5 } },
    { id: 'env', type: 'adsr', x: 300, y: 560, params: { attack: 0.3, decay: 0.2, sustain: 1.0, release: 1.5 } },
    { id: 'out', type: 'outlet~', x: 300, y: 680, params: {} },
  ],
  connections: [
    { from: { nodeId: 'freq', port: 'out' }, to: { nodeId: 'u1', port: 'freq' }, kind: 'control' },
    { from: { nodeId: 'freq', port: 'out' }, to: { nodeId: 'm', port: 'a' }, kind: 'control' },
    { from: { nodeId: 'm', port: 'out' }, to: { nodeId: 'sub', port: 'freq' }, kind: 'control' },
    { from: { nodeId: 'u1', port: 'out' }, to: { nodeId: 'mix', port: 'in' }, kind: 'audio' },
    { from: { nodeId: 'sub', port: 'out' }, to: { nodeId: 'mix', port: 'in' }, kind: 'audio' },
    { from: { nodeId: 'mix', port: 'out' }, to: { nodeId: 'lp', port: 'in' }, kind: 'audio' },
    { from: { nodeId: 'lp', port: 'out' }, to: { nodeId: 'sat', port: 'in' }, kind: 'audio' },
    { from: { nodeId: 'sat', port: 'out' }, to: { nodeId: 'env', port: 'in' }, kind: 'audio' },
    { from: { nodeId: 'trig', port: 'out' }, to: { nodeId: 'env', port: 'trig' }, kind: 'control' },
    { from: { nodeId: 'env', port: 'out' }, to: { nodeId: 'out', port: 'in' }, kind: 'audio' },
  ],
};

// Cathedral (MIDI, polyphonic) — plays a real .mid through a bank of Cathedral voices. The
// `midifile` node's voice allocator hands each incoming note to a free voice (f_i/t_i), so the
// file sounds as actual chords; all voices sum into one shared, long, pre-delayed reverb send.
const cathedralMidi = (() => {
  const N = 8;
  const VPOS = [[40, 475], [208, 475], [376, 475], [544, 475], [712, 475], [880, 475], [1048, 475], [1216, 475]]; // baked (auto-arranged) voice positions
  const nodes = [
    { id: 'mf', type: 'midifile', x: 605, y: 40, params: { src: 'midi/Silo Theme.mid', filename: 'Silo Theme.mid', voices: N, transpose: 0, loop: 'off' } },
    { id: 'bus', type: 'gain', x: 566, y: 582, params: { level: 0.35 } },
    { id: 'hp', type: 'filter', x: 445, y: 709, params: { type: 'highpass', cutoff: 450, Q: 0.7 } },
    { id: 'rev', type: 'reverb', x: 467, y: 911, params: { decay: 5, predelay: 25, wet: 1 } },
    { id: 'rlp', type: 'filter', x: 445, y: 1104, params: { type: 'lowpass', cutoff: 6500, Q: 0.7 } },
    { id: 'dc', type: 'dac', x: 628, y: 1306, params: {} },
  ];
  const connections = [
    { from: { nodeId: 'bus', port: 'out' }, to: { nodeId: 'dc', port: 'in' }, kind: 'audio' },   // dry
    { from: { nodeId: 'bus', port: 'out' }, to: { nodeId: 'hp', port: 'in' }, kind: 'audio' },    // reverb send
    { from: { nodeId: 'hp', port: 'out' }, to: { nodeId: 'rev', port: 'in' }, kind: 'audio' },
    { from: { nodeId: 'rev', port: 'out' }, to: { nodeId: 'rlp', port: 'in' }, kind: 'audio' },
    { from: { nodeId: 'rlp', port: 'out' }, to: { nodeId: 'dc', port: 'in' }, kind: 'audio' },
  ];
  for (let i = 1; i <= N; i++) {
    const vid = `v${i}`;
    nodes.push({ id: vid, type: 'patcher', x: VPOS[i - 1][0], y: VPOS[i - 1][1], params: { patch: structuredClone(cathedralVoicePatch) } });
    connections.push({ from: { nodeId: 'mf', port: `f${i}` }, to: { nodeId: vid, port: 'in1' }, kind: 'control' });
    connections.push({ from: { nodeId: 'mf', port: `t${i}` }, to: { nodeId: vid, port: 'in2' }, kind: 'control' });
    connections.push({ from: { nodeId: vid, port: 'out1' }, to: { nodeId: 'bus', port: 'in' }, kind: 'audio' });
  }
  return {
    name: 'Cathedral (MIDI, polyphonic)',
    patch: {
      version: 1,
      credits: {
        text: 'A transcription of "Silo" composed by Atli Örvarsson',
        url: 'https://www.sohncompositions.com/store/free/theme-from-silo',
      },
      nodes, connections,
    },
  };
})();

// Cathedral (MIDI, monophonic) — the SAME mono Cathedral Pad chain as the keyboard version
// (chord root+fifth, sub octave, adsr sustain=1), driven by `midifile` in mono/legato mode. To
// actually play the TUNE (not the merged top note of a 37-track orchestral mockup), the node
// isolates the violin melody (track 10) and skips the 42 s ambient intro, so the theme sounds
// right away as one continuous, evolving line.
const cathedralMidiMono = {
  name: 'Cathedral (MIDI melody, monophonic)',
  patch: {
    version: 1,
    credits: {
      text: 'A transcription of "Silo" composed by Atli Örvarsson',
      url: 'https://www.sohncompositions.com/store/free/theme-from-silo',
    },
    nodes: [
      { id: 'mf', type: 'midifile', x: 671, y: 40, params: { src: 'midi/Silo Theme.mid', filename: 'Silo Theme.mid', voices: 1, mode: 'mono', track: 10, start: 42, transpose: 0, loop: 'off' } },
      { id: 'ch', type: 'chord', x: 247, y: 475, params: { quality: 'major', size: 'power (1-5)' } },
      { id: 'm', type: 'math', x: 730, y: 475, params: { op: '*', b: 0.5 } },
      { id: 'u1', type: 'unison', x: 40, y: 646, params: { wave: 'sawtooth', voices: 7, detune: 22, spread: 0.9, level: 0.55, freq: 110 } },
      { id: 'u2', type: 'unison', x: 376, y: 646, params: { wave: 'sawtooth', voices: 7, detune: 22, spread: 0.9, level: 0.45, freq: 164.81 } },
      { id: 'sub', type: 'osc', x: 712, y: 646, params: { wave: 'sine', freq: 55 } },
      { id: 'mix', type: 'gain', x: 482, y: 926, params: { level: 0.4 } },
      { id: 'lp', type: 'filter', x: 460, y: 1053, params: { type: 'lowpass', cutoff: 2200, Q: 0.7 } },
      { id: 'sat', type: 'dist', x: 492, y: 1255, params: { amount: 0.15, wet: 0.5 } },
      { id: 'env', type: 'adsr', x: 612, y: 1408, params: { attack: 0.3, decay: 0.2, sustain: 1.0, release: 1.8 } },
      { id: 'hp', type: 'filter', x: 460, y: 1674, params: { type: 'highpass', cutoff: 450, Q: 0.7 } },
      { id: 'rev', type: 'reverb', x: 482, y: 1876, params: { decay: 5, predelay: 25, wet: 1 } },
      { id: 'rlp', type: 'filter', x: 460, y: 2069, params: { type: 'lowpass', cutoff: 6500, Q: 0.7 } },
      { id: 'dc', type: 'dac', x: 643, y: 2271, params: {} },
    ],
    connections: [
      { from: { nodeId: 'mf', port: 'f1' }, to: { nodeId: 'ch', port: 'root' }, kind: 'control' },
      { from: { nodeId: 'ch', port: '1' }, to: { nodeId: 'u1', port: 'freq' }, kind: 'control' },
      { from: { nodeId: 'ch', port: '2' }, to: { nodeId: 'u2', port: 'freq' }, kind: 'control' },
      { from: { nodeId: 'mf', port: 'f1' }, to: { nodeId: 'm', port: 'a' }, kind: 'control' },
      { from: { nodeId: 'm', port: 'out' }, to: { nodeId: 'sub', port: 'freq' }, kind: 'control' },
      { from: { nodeId: 'u1', port: 'out' }, to: { nodeId: 'mix', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'u2', port: 'out' }, to: { nodeId: 'mix', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'sub', port: 'out' }, to: { nodeId: 'mix', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'mix', port: 'out' }, to: { nodeId: 'lp', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'lp', port: 'out' }, to: { nodeId: 'sat', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'sat', port: 'out' }, to: { nodeId: 'env', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'mf', port: 't1' }, to: { nodeId: 'env', port: 'trig' }, kind: 'control' },
      { from: { nodeId: 'env', port: 'out' }, to: { nodeId: 'dc', port: 'in' }, kind: 'audio' },   // dry
      { from: { nodeId: 'env', port: 'out' }, to: { nodeId: 'hp', port: 'in' }, kind: 'audio' },    // reverb send
      { from: { nodeId: 'hp', port: 'out' }, to: { nodeId: 'rev', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'rev', port: 'out' }, to: { nodeId: 'rlp', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'rlp', port: 'out' }, to: { nodeId: 'dc', port: 'in' }, kind: 'audio' },    // wet return
    ],
  },
};

// Piano Roll (Silo melody) — the pianoroll track sequencer illustrated with the first 8-bar phrase
// of the Silo violin melody (decoded from midi/Silo Theme.mid, track 10, exact timing + velocities
// preserved). It drives a sawtooth voice whose adsr~ has vel->amp on (veldb -20), so the melody's
// dynamics come through. Edit the notes right on the roll; drag its corner to enlarge it.
// The Cathedral Pad voice as a self-contained abstraction: inlets freq + trig, outlet~ out.
// Same recipe as the Cathedral Pad demo (chord root+fifth, sub octave via math x0.5, fat unison
// saws, gentle saturation, adsr with sustain=1, and a long pre-delayed reverb mixed with the dry
// signal) — packaged so a note source can drive one clean box.
const cathedralPadPatch = {
  version: 1,
  nodes: [
    { id: 'freq', type: 'inlet', x: 40, y: 40, params: {} },
    { id: 'trig', type: 'inlet', x: 620, y: 40, params: {} },
    { id: 'ch', type: 'chord', x: 40, y: 170, params: { quality: 'major', size: 'power (1-5)' } },
    { id: 'm', type: 'math', x: 300, y: 170, params: { op: '*', b: 0.5 } },
    { id: 'u1', type: 'unison', x: 40, y: 300, params: { wave: 'sawtooth', voices: 7, detune: 22, spread: 0.9, level: 0.55, freq: 110 } },
    { id: 'u2', type: 'unison', x: 260, y: 300, params: { wave: 'sawtooth', voices: 7, detune: 22, spread: 0.9, level: 0.45, freq: 164.81 } },
    { id: 'sub', type: 'osc', x: 480, y: 300, params: { wave: 'sine', freq: 55 } },
    { id: 'mix', type: 'gain', x: 200, y: 500, params: { level: 0.4 } },
    { id: 'lp', type: 'filter', x: 200, y: 640, params: { type: 'lowpass', cutoff: 2200, Q: 0.7 } },
    { id: 'sat', type: 'dist', x: 200, y: 790, params: { amount: 0.15, wet: 0.5 } },
    { id: 'env', type: 'adsr', x: 420, y: 790, params: { attack: 0.15, decay: 0.2, sustain: 1.0, release: 2.0 } },
    { id: 'hp', type: 'filter', x: 480, y: 980, params: { type: 'highpass', cutoff: 450, Q: 0.7 } },
    { id: 'rev', type: 'reverb', x: 480, y: 1130, params: { decay: 5, predelay: 25, wet: 1 } },
    { id: 'rlp', type: 'filter', x: 480, y: 1310, params: { type: 'lowpass', cutoff: 6500, Q: 0.7 } },
    { id: 'out', type: 'outlet~', x: 300, y: 1500, params: {} },
  ],
  connections: [
    { from: { nodeId: 'freq', port: 'out' }, to: { nodeId: 'ch', port: 'root' }, kind: 'control' },
    { from: { nodeId: 'ch', port: '1' }, to: { nodeId: 'u1', port: 'freq' }, kind: 'control' },
    { from: { nodeId: 'ch', port: '2' }, to: { nodeId: 'u2', port: 'freq' }, kind: 'control' },
    { from: { nodeId: 'freq', port: 'out' }, to: { nodeId: 'm', port: 'a' }, kind: 'control' },
    { from: { nodeId: 'm', port: 'out' }, to: { nodeId: 'sub', port: 'freq' }, kind: 'control' },
    { from: { nodeId: 'u1', port: 'out' }, to: { nodeId: 'mix', port: 'in' }, kind: 'audio' },
    { from: { nodeId: 'u2', port: 'out' }, to: { nodeId: 'mix', port: 'in' }, kind: 'audio' },
    { from: { nodeId: 'sub', port: 'out' }, to: { nodeId: 'mix', port: 'in' }, kind: 'audio' },
    { from: { nodeId: 'mix', port: 'out' }, to: { nodeId: 'lp', port: 'in' }, kind: 'audio' },
    { from: { nodeId: 'lp', port: 'out' }, to: { nodeId: 'sat', port: 'in' }, kind: 'audio' },
    { from: { nodeId: 'sat', port: 'out' }, to: { nodeId: 'env', port: 'in' }, kind: 'audio' },
    { from: { nodeId: 'trig', port: 'out' }, to: { nodeId: 'env', port: 'trig' }, kind: 'control' },
    { from: { nodeId: 'env', port: 'out' }, to: { nodeId: 'out', port: 'in' }, kind: 'audio' },   // dry
    { from: { nodeId: 'env', port: 'out' }, to: { nodeId: 'hp', port: 'in' }, kind: 'audio' },    // reverb send
    { from: { nodeId: 'hp', port: 'out' }, to: { nodeId: 'rev', port: 'in' }, kind: 'audio' },
    { from: { nodeId: 'rev', port: 'out' }, to: { nodeId: 'rlp', port: 'in' }, kind: 'audio' },
    { from: { nodeId: 'rlp', port: 'out' }, to: { nodeId: 'out', port: 'in' }, kind: 'audio' },   // wet return
  ],
};

// Piano Roll (Silo melody) — the Silo violin phrase (transposed down an octave so it sits low)
// drawn on the pianoroll, driving the Cathedral Pad voice packaged as a subpatch for clarity.
const pianorollSilo = {
  name: 'Piano Roll (Silo melody)',
  patch: {
    version: 1,
    credits: {
      text: 'Melody from "Silo" composed by Atli Örvarsson',
      url: 'https://www.sohncompositions.com/store/free/theme-from-silo',
    },
    nodes: [
      { id: 'pr', type: 'pianoroll', x: 40, y: 40, params: { w: 560, h: 260, bars: 8, snap: '1/16', lowPitch: 48, octaves: 2, vel: 100, loop: 'on', notes: [
        { t: 0, dur: 1.996, pitch: 62, vel: 46 },
        { t: 1.523, dur: 2.335, pitch: 66, vel: 62 },
        { t: 3.869, dur: 1.765, pitch: 66, vel: 58 },
        { t: 4.581, dur: 3.1, pitch: 67, vel: 6 },
        { t: 7.806, dur: 2.198, pitch: 62, vel: 70 },
        { t: 9.76, dur: 1.923, pitch: 66, vel: 103 },
        { t: 11.754, dur: 1.227, pitch: 69, vel: 63 },
        { t: 12.623, dur: 2.962, pitch: 67, vel: 3 },
        { t: 16, dur: 1.996, pitch: 62, vel: 46 },
        { t: 17.523, dur: 2.258, pitch: 66, vel: 62 },
        { t: 19.869, dur: 1.765, pitch: 66, vel: 58 },
        { t: 20.581, dur: 3.1, pitch: 67, vel: 6 },
        { t: 23.806, dur: 2.198, pitch: 67, vel: 70 },
        { t: 25.76, dur: 1.852, pitch: 63, vel: 103 },
        { t: 27.754, dur: 1.227, pitch: 67, vel: 63 },
        { t: 28.623, dur: 3.377, pitch: 66, vel: 3 },
      ] } },
      { id: 'voice', type: 'patcher', x: 271, y: 604, params: { patch: structuredClone(cathedralPadPatch) } },
      { id: 'dc', type: 'dac', x: 271, y: 711, params: {} },
    ],
    connections: [
      { from: { nodeId: 'pr', port: 'freq' }, to: { nodeId: 'voice', port: 'in1' }, kind: 'control' },
      { from: { nodeId: 'pr', port: 'trig' }, to: { nodeId: 'voice', port: 'in2' }, kind: 'control' },
      { from: { nodeId: 'voice', port: 'out1' }, to: { nodeId: 'dc', port: 'in' }, kind: 'audio' },
    ],
  },
};

export const DEMOS = { customSynth, layeredPad, funcPlot, keyboardSynth, xySynth, bangCode, richsound, samplerPlay, sampledChord, spatialOrbit, cathedralPad, cathedralMidi, cathedralMidiMono, pianorollSilo };
