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

export const DEMOS = { customSynth, layeredPad, funcPlot, keyboardSynth, xySynth, bangCode };
