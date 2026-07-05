// passthrough-processor.js — identity worklet.
// Copies input to output unchanged. Its only job is to prove the worklet<->Tone bridge
// (osc~ -> worklet -> dac~ must sound exactly like osc~ -> dac~). Real DSP worklets
// (waveset, pvoc) follow this same skeleton.
class PassthroughProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    for (let ch = 0; ch < output.length; ch++) {
      const inCh = input[ch];
      if (inCh) output[ch].set(inCh); // no input connected -> leave the silent buffer
    }
    return true; // stay alive even when no input is connected yet
  }
}
registerProcessor('passthrough-processor', PassthroughProcessor);
