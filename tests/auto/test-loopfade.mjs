// test-loopfade.mjs — unit test for crossfadeLoopChannel (Phase 5 seamless-loop fix).
// Pure function, no Web Audio, so it runs directly in Node.
import { crossfadeLoopChannel } from '../../js/nodes/sampler.js';

let ok = true;
const check = (name, pass, detail = '') => { console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`); if (!pass) ok = false; };

// A ramp 0..~1 loops with a big end->start jump (|last-first| ~ 1). After crossfading it must
// wrap continuously.
const L = 1000, F = 80;
const ramp = Float32Array.from({ length: L }, (_, i) => i / L);
const dst = crossfadeLoopChannel(ramp, F);
const M = dst.length;

const rawJump = Math.abs(ramp[L - 1] - ramp[0]);              // ~1.0 (glitchy)
const loopJump = Math.abs(dst[M - 1] - dst[0]);               // should be ~1 sample step
check('output length is L - F', M === L - F, `${M}`);
check('raw ramp has a large loop discontinuity', rawJump > 0.9, rawJump.toFixed(3));
check('crossfaded seam is continuous (wrap jump ~ 1 step)', loopJump < 5 / L, loopJump.toFixed(5));

let bodyPreserved = true;
for (let i = F; i < M; i++) if (dst[i] !== ramp[i]) { bodyPreserved = false; break; }
check('loop body (after the fade region) is untouched', bodyPreserved);

// No click at the seam: a click is an IMPULSE (huge curvature / second difference); a smooth slope
// is fine. Measure the worst curvature across each looped signal (wrapping at the ends) and confirm
// the crossfade cuts the raw seam's impulse by an order of magnitude.
const curvMax = (a) => { const n = a.length; const at = (i) => a[((i % n) + n) % n]; let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(at(i - 1) - 2 * at(i) + at(i + 1))); return m; };
const rawCurv = curvMax(ramp);        // raw looped ramp: seam impulse ~1.0
const dstCurv = curvMax(dst);
check('crossfade removes the seam impulse (>= 10x smoother than raw)', dstCurv < rawCurv * 0.1, `${rawCurv.toFixed(3)} -> ${dstCurv.toFixed(4)}`);

// A more audio-like case: a sine whose period doesn't divide the buffer (endpoints mismatch, but
// similar levels like real sound) should crossfade to a very smooth loop.
const S = 1000, sf = 7.3;
const sine = Float32Array.from({ length: S }, (_, i) => Math.sin(2 * Math.PI * sf * i / S));
const sdst = crossfadeLoopChannel(sine, 80);
check('sine seam mismatch is smoothed away', curvMax(sdst) < curvMax(sine) * 0.5, `${curvMax(sine).toFixed(4)} -> ${curvMax(sdst).toFixed(4)}`);

// F larger than L/4 is clamped, not crashed
const clamped = crossfadeLoopChannel(ramp, L);
check('oversized fade is clamped to L/4', clamped.length === L - Math.floor(L / 4), `${clamped.length}`);

console.log(ok ? '  LOOPFADE PASS' : '  LOOPFADE FAIL');
process.exit(ok ? 0 : 1);
