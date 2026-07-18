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
      { id: 'n1', type: 'seq', x: 20, y: 210, params: { steps: 16, root: 45, scale: 'penta', rate: '16n', gate: 0.6,
        notes: [0, -1, 3, -1, 2, 5, -1, 1, 4, -1, 2, -1, 6, 3, -1, 0] } },
      { id: 'n2', type: 'osc', x: 300, y: 20, params: { wave: 'sawtooth', freq: 110 } },
      { id: 'n3', type: 'osc', x: 300, y: 150, params: { wave: 'square', freq: 110 } },
      { id: 'n4', type: 'adsr', x: 510, y: 70, params: { attack: 0.01, decay: 0.18, sustain: 0.35, release: 0.25 } },
      { id: 'n5', type: 'slider', x: 470, y: 290, params: { lo: 200, hi: 4500, value: 1600 } },
      { id: 'n6', type: 'filter', x: 700, y: 70, params: { type: 'lowpass', cutoff: 1600, Q: 7 } },
      { id: 'n7', type: 'dist', x: 890, y: 70, params: { amount: 0.3, wet: 0.8 } },
      { id: 'n8', type: 'delay', x: 890, y: 250, params: { time: 0.19, feedback: 0.34, wet: 0.3 } },
      { id: 'n9', type: 'dac', x: 1090, y: 250, params: {} },
      { id: 'n10', type: 'scope', x: 700, y: 300, params: {} },
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
      { id: 'o1', type: 'osc', x: 30, y: 20, params: { wave: 'sine', freq: 110 } },
      { id: 'o2', type: 'osc', x: 30, y: 150, params: { wave: 'sawtooth', freq: 118.4 } },
      { id: 'o3', type: 'osc', x: 30, y: 280, params: { wave: 'square', freq: 220 } },
      { id: 'o4', type: 'osc', x: 250, y: 20, params: { wave: 'square', freq: 220.7 } },
      { id: 'o5', type: 'osc', x: 250, y: 150, params: { wave: 'sawtooth', freq: 338 } },
      { id: 'o6', type: 'osc', x: 250, y: 280, params: { wave: 'square', freq: 329.2 } },
      { id: 'mix', type: 'gain', x: 480, y: 150, params: { level: 0.6 } },
      { id: 'lfo', type: 'funcgen', x: 460, y: 330, params: { expr: '450+1100*(0.5+0.5*sin(2*pi*t))', freq: 110, cycle: 8 } },
      { id: 'flt', type: 'filter', x: 700, y: 150, params: { type: 'lowpass', cutoff: 900, Q: 2 } },
      { id: 'rev', type: 'reverb', x: 900, y: 150, params: { decay: 4.5, wet: 0.34 } },
      { id: 'out', type: 'dac', x: 760, y: 360, params: {} },
      { id: 'sc', type: 'scope', x: 60, y: 440, params: {} },
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
      { id: 'f1', type: 'funcgen', x: 60, y: 80, params: { expr: 'sin(2*pi*t) + 0.3*sin(6*pi*t)', freq: 180, cycle: 3 } },
      { id: 'p1', type: 'plot', x: 360, y: 60, params: {} },
      { id: 'g1', type: 'gain', x: 360, y: 260, params: { level: 0.5 } },
      { id: 'd1', type: 'dac', x: 600, y: 260, params: {} },
      { id: 's1', type: 'scope', x: 600, y: 60, params: {} },
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
      { id: 'kb', type: 'keyboard', x: 40, y: 330, params: { octaves: 2, base: 48, dur: 0.6 } },
      { id: 'os', type: 'osc', x: 60, y: 40, params: { wave: 'sawtooth', freq: 220 } },
      { id: 'ad', type: 'adsr', x: 320, y: 40, params: { attack: 0.01, decay: 0.15, sustain: 0.5, release: 0.4 } },
      { id: 'fl', type: 'filter', x: 560, y: 40, params: { type: 'lowpass', cutoff: 1800, Q: 3 } },
      { id: 'dc', type: 'dac', x: 800, y: 40, params: {} },
      { id: 'sc', type: 'scope', x: 560, y: 300, params: {} },
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
      { id: 'xy', type: 'xypad', x: 60, y: 20, params: { x: 64, y: 80 } },
      { id: 'sx', type: 'scale', x: 60, y: 270, params: { inLo: 0, inHi: 127, outLo: 120, outHi: 1000 } },
      { id: 'sy', type: 'scale', x: 330, y: 270, params: { inLo: 0, inHi: 127, outLo: 120, outHi: 5000 } },
      { id: 'tr', type: 'osc', x: 60, y: 410, params: { wave: 'triangle', freq: 220 } },
      { id: 'lo', type: 'filter', x: 60, y: 540, params: { type: 'lowpass', cutoff: 200, Q: 6 } },
      { id: 'dc', type: 'dac', x: 360, y: 540, params: {} },
      { id: 'sc', type: 'scope', x: 330, y: 410, params: {} },
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
      { id: 'msg', type: 'message', x: 40, y: 30, params: { value: '57' } },
      { id: 'cd', type: 'code', x: 40, y: 200, params: { lang: 'js', code: 'return 440 * Math.pow(2, (a - 69) / 12);' } },
      { id: 'bng', type: 'bang', x: 360, y: 380 },
      { id: 'os', type: 'osc', x: 360, y: 40, params: { wave: 'sawtooth', freq: 220 } },
      { id: 'ad', type: 'adsr', x: 360, y: 200, params: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.5 } },
      { id: 'fl', type: 'filter', x: 600, y: 120, params: { type: 'lowpass', cutoff: 1600, Q: 2 } },
      { id: 'dc', type: 'dac', x: 820, y: 120, params: {} },
      { id: 'sc', type: 'scope', x: 600, y: 320, params: {} },
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
      { id: 'kb', type: 'keyboard', x: 40, y: 440, params: { octaves: 2, base: 48, dur: 1 } },
      { id: 'ch', type: 'chord', x: 380, y: 440, params: { quality: 'minor', size: 'triad (1-3-5)' } },
      { id: 'v1', type: 'patcher', x: 700, y: 40,  params: { patch: voiceAt(130.81) } },
      { id: 'v2', type: 'patcher', x: 700, y: 230, params: { patch: voiceAt(155.56) } },
      { id: 'v3', type: 'patcher', x: 700, y: 420, params: { patch: voiceAt(196.00) } },
      { id: 'dc', type: 'dac', x: 1040, y: 230, params: {} },
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
      { id: 'kb', type: 'keyboard', x: 40, y: 300, params: { octaves: 2, base: 48, dur: 1 } },
      { id: 'sm', type: 'sampler', x: 380, y: 60, params: { src: 'sounds/vocal/voice-ah.wav', filename: 'voice-ah.wav', root: 48, attack: 0.05, release: 0.7, level: 0.9 } },
      { id: 'dc', type: 'dac', x: 740, y: 60, params: {} },
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
      { id: 'kb', type: 'keyboard', x: 40, y: 440, params: { octaves: 2, base: 48, dur: 1 } },
      { id: 'ch', type: 'chord', x: 380, y: 440, params: { quality: 'minor', size: 'triad (1-3-5)' } },
      { id: 's1', type: 'sampler', x: 700, y: 40,  params: { src: 'sounds/vocal/voice-ah.wav', filename: 'voice-ah.wav', root: 48, attack: 0.3, release: 1.4, startmod: 30, level: 0.7 } },
      { id: 's2', type: 'sampler', x: 700, y: 220, params: { src: 'sounds/vocal/voice-ah.wav', filename: 'voice-ah.wav', root: 48, attack: 0.3, release: 1.4, startmod: 30, level: 0.7 } },
      { id: 's3', type: 'sampler', x: 700, y: 400, params: { src: 'sounds/vocal/voice-ah.wav', filename: 'voice-ah.wav', root: 48, attack: 0.3, release: 1.4, startmod: 30, level: 0.7 } },
      { id: 'dc', type: 'dac', x: 1040, y: 220, params: {} },
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
      { id: 'src', type: 'osc', x: 60, y: 80, params: { wave: 'sawtooth', freq: 180 } },
      { id: 'lvl', type: 'gain', x: 300, y: 80, params: { level: 0.5 } },
      { id: 'fx', type: 'funcgen', x: 60, y: 260, params: { expr: '8*sin(2*pi*t)', freq: 180, cycle: 6 } },
      { id: 'fz', type: 'funcgen', x: 300, y: 260, params: { expr: '-8*cos(2*pi*t)', freq: 180, cycle: 6 } },
      { id: 'sp', type: 'spat', x: 560, y: 120, params: { x: 0, y: 0, z: -8 } },
      { id: 'dc', type: 'dac', x: 820, y: 120, params: {} },
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
      { id: 'kb', type: 'keyboard', x: 40, y: 560, params: { octaves: 2, base: 45, dur: 1 } },                                                     // base A2 = 110 Hz
      { id: 'ch', type: 'chord', x: 360, y: 560, params: { quality: 'major', size: 'power (1-5)' } },                                               // root + fifth
      { id: 'm', type: 'math', x: 360, y: 430, params: { op: '*', b: 0.5 } },                                                                       // sub = root octave down
      { id: 'u1', type: 'unison', x: 40, y: 40, params: { wave: 'sawtooth', voices: 7, detune: 22, spread: 0.9, level: 0.55, freq: 110 } },         // root
      { id: 'u2', type: 'unison', x: 40, y: 200, params: { wave: 'sawtooth', voices: 7, detune: 22, spread: 0.9, level: 0.45, freq: 164.81 } },     // fifth
      { id: 'sub', type: 'osc', x: 40, y: 360, params: { wave: 'sine', freq: 55 } },                                                                // sub octave
      { id: 'mix', type: 'gain', x: 300, y: 180, params: { level: 0.4 } },
      { id: 'lp', type: 'filter', x: 480, y: 180, params: { type: 'lowpass', cutoff: 2200, Q: 0.7 } },
      { id: 'sat', type: 'dist', x: 660, y: 180, params: { amount: 0.15, wet: 0.5 } },                                                              // gentle saturation
      { id: 'env', type: 'adsr', x: 660, y: 40, params: { attack: 0.15, decay: 0.2, sustain: 1.0, release: 2.0 } },                                 // gate: hold = sustain
      { id: 'hp', type: 'filter', x: 860, y: 360, params: { type: 'highpass', cutoff: 450, Q: 0.7 } },                                              // EQ the reverb send: cut lows
      { id: 'rev', type: 'reverb', x: 1040, y: 360, params: { decay: 5, predelay: 25, wet: 1 } },                                                   // long, pre-delayed cathedral
      { id: 'rlp', type: 'filter', x: 1220, y: 360, params: { type: 'lowpass', cutoff: 6500, Q: 0.7 } },                                            // roll off ultra-highs
      { id: 'dc', type: 'dac', x: 1040, y: 160, params: {} },
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
  const nodes = [
    { id: 'mf', type: 'midifile', x: 40, y: 300, params: { src: 'midi/Silo Theme.mid', filename: 'Silo Theme.mid', voices: N, transpose: 0, loop: 'off' } },
    { id: 'bus', type: 'gain', x: 900, y: 320, params: { level: 0.35 } },
    { id: 'hp', type: 'filter', x: 900, y: 470, params: { type: 'highpass', cutoff: 450, Q: 0.7 } },
    { id: 'rev', type: 'reverb', x: 1080, y: 470, params: { decay: 5, predelay: 25, wet: 1 } },
    { id: 'rlp', type: 'filter', x: 1260, y: 470, params: { type: 'lowpass', cutoff: 6500, Q: 0.7 } },
    { id: 'dc', type: 'dac', x: 1080, y: 300, params: {} },
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
    nodes.push({ id: vid, type: 'patcher', x: 340, y: (i - 1) * 92 + 20, params: { patch: structuredClone(cathedralVoicePatch) } });
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
      { id: 'mf', type: 'midifile', x: 40, y: 480, params: { src: 'midi/Silo Theme.mid', filename: 'Silo Theme.mid', voices: 1, mode: 'mono', track: 10, start: 42, transpose: 0, loop: 'off' } },
      { id: 'ch', type: 'chord', x: 340, y: 520, params: { quality: 'major', size: 'power (1-5)' } },
      { id: 'm', type: 'math', x: 340, y: 400, params: { op: '*', b: 0.5 } },
      { id: 'u1', type: 'unison', x: 40, y: 40, params: { wave: 'sawtooth', voices: 7, detune: 22, spread: 0.9, level: 0.55, freq: 110 } },
      { id: 'u2', type: 'unison', x: 40, y: 200, params: { wave: 'sawtooth', voices: 7, detune: 22, spread: 0.9, level: 0.45, freq: 164.81 } },
      { id: 'sub', type: 'osc', x: 40, y: 360, params: { wave: 'sine', freq: 55 } },
      { id: 'mix', type: 'gain', x: 300, y: 180, params: { level: 0.4 } },
      { id: 'lp', type: 'filter', x: 480, y: 180, params: { type: 'lowpass', cutoff: 2200, Q: 0.7 } },
      { id: 'sat', type: 'dist', x: 660, y: 180, params: { amount: 0.15, wet: 0.5 } },
      { id: 'env', type: 'adsr', x: 660, y: 40, params: { attack: 0.3, decay: 0.2, sustain: 1.0, release: 1.8 } },
      { id: 'hp', type: 'filter', x: 860, y: 360, params: { type: 'highpass', cutoff: 450, Q: 0.7 } },
      { id: 'rev', type: 'reverb', x: 1040, y: 360, params: { decay: 5, predelay: 25, wet: 1 } },
      { id: 'rlp', type: 'filter', x: 1220, y: 360, params: { type: 'lowpass', cutoff: 6500, Q: 0.7 } },
      { id: 'dc', type: 'dac', x: 1040, y: 160, params: {} },
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

// UCI Arts — Mono MIDI Synth — a replica of Christopher Dobrian's Max Cookbook patch "Very
// Simple Monophonic MIDI Synthesizer". Architecture maps 1:1: midifile in MONO mode == Max's
// `poly 1 1` (mono, note-stealing, legato); freq drives a sawtooth `osc~` (== mtof -> saw); the
// note-on velocity scales the amplitude via `adsr~` with vel->amp ON (Dobrian's 1..127 -> -60..0
// dB -> dbtoa curve). A fast attack + short release with sustain 1 stands in for his line~ ramp.
// Driven here by the Silo melody (track 10) so the velocity dynamics are audible; swap the
// midifile for a `keyboard` to play it live.
const uciMonoSynth = {
  name: 'UCI Arts — Mono MIDI Synth',
  patch: {
    version: 1,
    credits: {
      text: '“Very Simple Monophonic MIDI Synthesizer” — © 2017 Christopher Dobrian (UCI Arts, Max Cookbook)',
      url: 'https://music.arts.uci.edu/dobrian/maxcookbook/very-simple-monophonic-midi-synthesizer',
    },
    nodes: [
      { id: 'mf', type: 'midifile', x: 60, y: 200, params: { src: 'midi/Silo Theme.mid', filename: 'Silo Theme.mid', voices: 1, mode: 'mono', retrig: 'on', track: 10, start: 42, transpose: 0, loop: 'off' } },
      { id: 'osc', type: 'osc', x: 440, y: 80, params: { wave: 'sawtooth', freq: 220 } },
      { id: 'env', type: 'adsr', x: 640, y: 80, params: { attack: 0.005, decay: 0, sustain: 1.0, release: 0.03, veldb: -20 } },
      { id: 'amp', type: 'gain', x: 840, y: 80, params: { level: 1.2 } },
      { id: 'dc', type: 'dac', x: 1040, y: 80, params: {} },
    ],
    connections: [
      { from: { nodeId: 'mf', port: 'f1' }, to: { nodeId: 'osc', port: 'freq' }, kind: 'control' }, // mtof
      { from: { nodeId: 'mf', port: 't1' }, to: { nodeId: 'env', port: 'trig' }, kind: 'control' }, // note on/off + velocity
      { from: { nodeId: 'osc', port: 'out' }, to: { nodeId: 'env', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'env', port: 'out' }, to: { nodeId: 'amp', port: 'in' }, kind: 'audio' },
      { from: { nodeId: 'amp', port: 'out' }, to: { nodeId: 'dc', port: 'in' }, kind: 'audio' },
    ],
  },
};

export const DEMOS = { customSynth, layeredPad, funcPlot, keyboardSynth, xySynth, bangCode, richsound, samplerPlay, sampledChord, spatialOrbit, cathedralPad, cathedralMidi, cathedralMidiMono, uciMonoSynth };
