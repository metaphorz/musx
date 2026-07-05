// worklet.js — registers AudioWorklet processor modules once per AudioContext and
// bridges native AudioWorkletNodes into the Tone graph so custom-DSP nodes satisfy the
// same audioIn()/audioOut() contract as every other MusX node.
//
// Why a bridge: an AudioWorkletNode is a *native* Web Audio node. Tone objects are
// wrappers. Connecting Tone->native and native->Tone in both directions is exactly what
// Tone.connect() handles, so we wrap each worklet with Tone.Gain input/output proxies.
const T = () => window.Tone;

// Processor modules to preload. Each file calls registerProcessor('<name>', ...);
// the <name> is what makeWorkletNode() references. Add new worklet DSP files here.
const MODULES = [
  'js/audio/worklets/passthrough-processor.js',
];

let _ready = null;

// Register all worklet modules on the current Tone context. Idempotent — safe to call on
// every Start Audio; the returned promise resolves once every module is compiled.
export function loadWorklets() {
  if (_ready) return _ready;
  const ctx = T().getContext();
  // addAudioWorkletModule resolves module URLs against the document base, so these are
  // plain project-relative paths (the same ones index.html is served under).
  _ready = Promise.all(MODULES.map((url) => ctx.addAudioWorkletModule(url)))
    .catch((err) => { _ready = null; throw err; }); // let a failed load be retried
  return _ready;
}

// Build a worklet node wrapped for the Tone graph. loadWorklets() MUST have resolved first.
// Returns { in, out, node }:
//   in   — Tone.Gain to connect audio INTO  (use as audioIn)
//   out  — Tone.Gain to connect audio FROM  (use as audioOut)
//   node — the raw AudioWorkletNode (use node.port for messages, node.parameters for AudioParams)
export function makeWorkletNode(name, options = {}) {
  const ctx = T().getContext();
  const node = ctx.createAudioWorkletNode(name, options);
  const input = new (T().Gain)();
  const output = new (T().Gain)();
  T().connect(input, node);
  T().connect(node, output);
  return {
    in: input,
    out: output,
    node,
    dispose() {
      try { input.dispose(); } catch (e) { /* already gone */ }
      try { output.dispose(); } catch (e) { /* already gone */ }
      try { node.disconnect(); } catch (e) { /* already gone */ }
    },
  };
}
