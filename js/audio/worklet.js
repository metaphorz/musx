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
  'js/audio/worklets/waveset-processor.js',
  'js/audio/worklets/pvoc-processor.js',
];

let _ready = null;

// Register all worklet modules on the current Tone context. Idempotent — safe to call on
// every Start Audio; the returned promise resolves once every module is compiled.
export function loadWorklets() {
  if (_ready) return _ready;
  const ctx = T().getContext();
  // NOTE: we go straight to the NATIVE AudioWorklet.addModule, NOT Tone's
  // ctx.addAudioWorkletModule(). Tone v15 caches a single `_workletPromise` and returns
  // it for every call, so only the FIRST module URL ever loads — a second worklet is
  // silently dropped. The native addModule loads each module into the shared worklet
  // global scope independently. URLs resolve against the document base (project-relative).
  const aw = ctx.rawContext.audioWorklet;
  _ready = Promise.all(MODULES.map((url) => aw.addModule(url)))
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
