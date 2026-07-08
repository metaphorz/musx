# Project Plan: WebMax — A Browser-Based Max/MSP-Style Node Patcher

## Goal
Build a simpler but comprehensive Max/MSP-style visual programming environment in
plain JS/HTML/CSS. Users drag "objects" (nodes) onto a canvas, wire them together
into a flow graph, and run patches that generate and shape sound/music — including
ADSR envelopes, oscillators, filters, effects, sequencing, and control math.

## Confirmed Decisions (from scoping Q&A)
- **Audio engine:** Tone.js (synths, ADSR, filters, effects, transport/BPM out of the box).
- **Graph UI:** Custom vanilla JS + SVG (draggable node boxes, SVG bezier cables). No framework.
- **Node set (v1):** All four categories — Core synth + ADSR, Filters & effects,
  Sequencing & timing, Control & math.
- **Persistence:** Save/load patches to a JSON file (download/upload) + node palette menu.

## Core Concepts / Architecture
Two layers kept deliberately separate (this is the key simplicity principle):

1. **Graph layer (UI + data model)** — pure JS/SVG. Knows about nodes, ports, and
   connections. Has no idea what audio is. Stores a serializable patch model:
   `{ nodes: [...], connections: [...] }`.
2. **Audio/engine layer** — each node type registers a definition that says:
   - its title, inlets (inputs), outlets (outputs), and parameters (UI widgets),
   - a `create()` that builds its Tone.js object(s),
   - how an outlet connects to another node's inlet (audio signal vs. control message).

A small **NodeRegistry** maps a node `type` string → definition. Adding a new object
later = adding one registry entry. No changes to the graph engine.

Two kinds of wires (mirrors Max's signal vs. message distinction):
- **Audio cables** (Tone signal flow, e.g. Osc → Filter → Output) — drawn thick.
- **Control/message cables** (a slider sets a frequency, a sequencer fires a note) — drawn thin.

## Proposed File Structure
```
node/
├── index.html              # Canvas, toolbar, palette, transport controls
├── css/
│   └── style.css           # Dark Max-like styling, node boxes, cables
├── js/
│   ├── main.js             # Boot: wire up UI, audio context start button
│   ├── graph/
│   │   ├── Graph.js        # Patch model: add/remove nodes & connections
│   │   ├── NodeView.js     # Draggable box rendering + inlet/outlet ports
│   │   ├── Cable.js        # SVG bezier cable + drag-to-connect logic
│   │   └── serialize.js    # Patch <-> JSON (save/load)
│   ├── audio/
│   │   └── engine.js       # Builds/rebuilds Tone.js graph from patch model
│   └── nodes/
│       ├── registry.js     # NodeRegistry (type -> definition)
│       ├── synth.js        # Oscillator, ADSR, Gain, Output
│       ├── effects.js      # Filter, Delay, Reverb, Distortion
│       ├── sequencing.js   # Sequencer, Transport/BPM, Metro, Bang, Note
│       ├── control.js      # Number, Slider, Math (+/*), Message, Scope
│       └── analysis.js     # Plot (XY grapher), FuncGen (algebraic expr~)
│   └── util/
│       └── expr.js         # Tiny safe math-expression parser/evaluator (shunting-yard)
├── lib/
│   └── tone.min.js         # Tone.js (vendored locally, no CDN dependency)
└── tests/
    └── auto/               # Playwright smoke tests + logs
```

## v1 Node Catalog
**Core synth + ADSR**
- `osc` — Oscillator: waveform (sine/square/saw/triangle), frequency. Audio out.
- `adsr` — ADSR envelope: attack/decay/sustain/release; triggered by a bang/note;
  outputs an amplitude envelope that modulates a Gain.
- `gain` — Amplitude / VCA: audio in, level param, audio out.
- `dac` — Audio Output (speakers). Must add to hear anything.

**Filters & effects**
- `filter` — Biquad: type (lowpass/highpass/bandpass), cutoff, Q.
- `delay` — Feedback delay: time, feedback, wet.
- `reverb` — Reverb: decay, wet.
- `dist` — Distortion: amount, wet.

**Sequencing & timing**
- `transport` — Global tempo/BPM, start/stop (maps to Tone.Transport).
- `metro` — Metronome: emits a bang every N beats while transport runs.
- `seq` — Step sequencer: editable grid of notes/steps; emits notes on each step.
- `bang` — Manual trigger button (fires a "bang" message).
- `note` — Note message: pitch + velocity, feeds a synth/ADSR.

**Control & math**
- `number` — Number box (display + drag/type to set a value).
- `slider` — Slider widget (min/max → value).
- `math` — Arithmetic: operation (+, −, ×, ÷) with two inlets.
- `message` — Static message/value emitter.
- `scope` — Visualizer: oscilloscope/level meter from an audio signal.

**Analysis & Visualization**
- `plot` — Plotter/graph: draws an XY graph on a canvas. Plots either a stream of
  incoming control values against time (rolling buffer) or a fixed array/function
  sampled across a range. Auto-scaling axes, grid, and adjustable window length.
  This is the data-graphing counterpart to `scope` (which is a raw oscilloscope).
- `funcgen` — Function Generator (algebraically specified, like Max `expr~`):
  a text field where you type a math expression in terms of `t` (time/phase) and
  optional inlet variables (`x`, `y`). The expression is parsed and evaluated to
  produce values. Two modes:
    - *Audio mode*: the expression defines one cycle of a waveform over phase
      `t ∈ [0, 1)`; it is sampled into a Tone wavetable and played at a set frequency.
    - *Control mode*: the expression is sampled over time/the input range and emitted
      as a control stream (ideal to feed straight into `plot`).
  Supported: `+ - * / ^`, parentheses, constants `pi`/`e`, and functions
  `sin cos tan asin acos atan exp log ln sqrt abs floor ceil round min max sign mod`.

## UI / Interaction Design
- **Toolbar (top):** Add-node palette (dropdown or click categories), Save, Load,
  Start Audio (required first-gesture to unlock the browser AudioContext), Play/Stop
  transport, master volume.
- **Canvas (center):** Pan/scroll; node boxes are draggable; ports are small circles
  (inlets on top, outlets on bottom — Max convention). Drag from an outlet to an inlet
  to create a cable; click a cable to delete; Delete key removes selected node.
- **Node box:** Title bar + inline param widgets (knobs as number boxes/sliders/selects).
- **Styling:** Dark theme, monospace labels, rounded boxes — Max-ish but clean.

## How "running" works
- The patch model is the source of truth. When you press **Start Audio**, `engine.js`
  walks the model, calls each node's `create()`, then connects Tone objects per the
  audio cables and registers control-cable handlers (e.g., slider → `osc.frequency`).
- Editing while running: changing a param updates the live Tone object immediately;
  adding/removing cables rebuilds the affected connections.

## Implementation Todo List
- [ ] **1. Scaffold** — `index.html`, `style.css`, vendor `tone.min.js`, `main.js`
      boot with a working "Start Audio" button (unlock AudioContext).
- [ ] **2. Graph data model** — `Graph.js`: add/remove/move nodes, add/remove
      connections, emit change events. Pure data, no audio.
- [ ] **3. Node rendering** — `NodeView.js`: draggable boxes with inlet/outlet ports
      and a title bar. Selection + delete.
- [ ] **4. Cables** — `Cable.js`: SVG bezier wires, drag-to-connect from outlet→inlet,
      click-to-delete, distinguish audio vs. control cables visually.
- [ ] **5. Node registry + Core synth nodes** — `registry.js`, `synth.js`
      (osc, adsr, gain, dac). First milestone: **wire Osc→Gain→Dac and hear a tone.**
- [ ] **6. Audio engine** — `engine.js`: build Tone graph from model, connect audio
      cables, bind control cables to params; live updates.
- [ ] **7. Control & math nodes** — `control.js` (number, slider, math, message, scope).
      Milestone: **slider controls oscillator frequency live.**
- [ ] **8. ADSR wiring** — bang/note triggers ADSR → modulates Gain.
      Milestone: **press bang → hear an enveloped note.**
- [ ] **9. Filters & effects** — `effects.js` (filter, delay, reverb, dist).
- [ ] **10. Sequencing & timing** — `sequencing.js` (transport, metro, seq, bang, note).
      Milestone: **a step sequencer plays a short melody through a synth + ADSR.**
- [ ] **11. Analysis & visualization** — `util/expr.js` (safe expression evaluator),
      then `analysis.js` (`plot` grapher + `funcgen` algebraic generator).
      Milestone: **type `sin(2*pi*t)` into funcgen and see/hear it via plot + osc.**
- [ ] **12. Save/Load** — `serialize.js`: patch → JSON download, JSON → patch upload,
      faithful round-trip restore of nodes, positions, params, and cables.
- [ ] **13. Demo patches + polish** — ship built-in demos, tidy styling, shortcuts.
      Replicating the two patches from cycling74.com/products/max "Sound without limits":
        - *Demo A — "single oscillator and a filter"* (Max: `tri~` → `lores~ 200. 0.8`,
          sliders via `scale 0 127 120. 1000`/`...5000`): in WebMax = slider→osc(tri).freq,
          slider→filter(lowpass).cutoff, osc → filter → dac.
        - *Demo B — "something a little more wild" (FM)* (Max: `simpleFM~`, `phasor~`,
          `*~`, `atan~`, `slide~`): in WebMax = modulator osc → gain (mod depth) →
          carrier osc FM inlet → distortion(atan-like) → dac.
      NOTE: This requires audio-rate FM — the oscillator needs an **audio inlet `fm`**
      patched into its Tone frequency Signal (additive). Designed into synth.js.
- [ ] **14. Testing** — Playwright smoke tests in `tests/auto/` (load page, start audio,
      add nodes, connect, save/load round-trip), with logs written to `tests/auto/`.

## Simplicity / Constraint Notes
- One node type = one registry entry; the graph engine never special-cases a node.
- No build step, no bundler — plain ES modules served from the folder.
- Tone.js vendored locally in `lib/` (no CDN/network dependency at runtime).
- No fallbacks/simplifications without checking with you first (per your guidelines).

## Open Questions (non-blocking — sensible defaults assumed unless you say otherwise)
1. **Run target:** Just open `index.html` directly, or include a tiny local static
   server script (`start`/`stop`)? ES modules sometimes need `http://` rather than
   `file://`. *Default: I'll add a minimal `start` script that serves the folder.*
2. **Tone.js version:** I'll vendor the current stable Tone.js v15. OK?
3. **Polyphony:** v1 synth voices are monophonic per synth node (simpler). Polyphonic
   synth node can come later. OK?

## Review

**Status: built, tested, all green.** A working Max/MSP-style node patcher in plain
JS/HTML/CSS on Tone.js. No build step; served as ES modules over a tiny static server.

### What was built
- **Graph engine** (`graph/Graph.js`) — serializable model of nodes + connections with
  a tiny event emitter; pure data, no audio.
- **UI** (`graph/NodeView.js`, cable logic in `main.js`) — draggable node boxes, inlet
  (top) / outlet (bottom) ports, drag-to-wire SVG bezier cables, click-cable-to-delete,
  selection + Delete key. Audio cables drawn thick/orange, control cables thin/green.
- **Audio engine** (`audio/engine.js`) — builds the live Tone graph from the model and
  stays in sync incrementally; audio cables are real Tone connections, control cables are
  delivered dynamically on emit (with a feedback-loop depth guard).
- **18 node types** across 5 categories:
  - synth: `osc~` (with audio-rate `fm` inlet), `adsr~`, `gain~`, `dac~`
  - effects: `filter~`, `delay~`, `reverb~`, `dist~`
  - timing: `transport`, `metro`, `bang`, `note`, `step seq` (8-row piano roll)
  - control: `number`, `slider` (lo/hi mapped), `math`, `message`, `scope~`
  - analysis: `plot` (rolling XY grapher), `funcgen` (algebraic expr~, audible wavetable
    + control stream) backed by a sandboxed expression parser (`util/expr.js`)
- **Save/Load** (`graph/serialize.js`) — patch ⇄ JSON file (download/upload), verified
  byte-stable round-trip.
- **Three built-in demos** (`demos.js`): the two cycling74 "Sound without limits" patches
  recreated — *Custom Synth* (patch 1) and *Layered Pad* (patch 3, MC emulated with
  detuned oscillators) — plus a *FuncGen→Plot* showcase.

### Testing (`tests/auto/test.mjs`, headless Chromium via Playwright)
- model/DOM parity (views == nodes, cables == connections) ✓
- save/load JSON round-trip byte-stable ✓
- **audio verified programmatically**: a `Tone.Meter` taps the master and the test reads
  live dB after Start Audio + Play — proving real signal, not just rendering:
  Custom Synth −7.6 dB, Layered Pad −17.9 dB, FuncGen −14.2 dB (all ≫ −60 dB silence) ✓
- screenshots saved to `tests/auto/shot-*.png` for visual confirmation.

### Notes / deviations
- MC (multichannel) objects from the Max patches are emulated with oscillator stacks
  (single-channel tool); noted in `demos.js` and the load message.
- Control messages flow only while audio is running (the engine is the control bus); a
  pre-audio control layer was deliberately skipped for v1 simplicity.
- One non-fatal Tone "accurate timing" warning remains on the funcgen control loop
  (generic control path doesn't thread scheduling time); sequencer triggers DO thread time.

### How to run
1. `./start` (serves on an open port, prints the URL; `./stop` to stop).
2. Open the printed `http://localhost:<port>` in a browser.
3. Click **Start Audio**, then **Demo** to load a patch (or build your own from **Add node**),
   then **Play** for sequencers/LFOs. **Save**/**Load** for patch files.
4. Re-run tests: `node tests/auto/test.mjs <port>`.

---

# Phase 2 Plan: CDP / SoundThread-style Transformations (Real-Time)

## Goal
Extend MusX with the *sound-transformation* character of **CDP** (the engine behind
**SoundThread**) — blur, freeze, morph, granular, waveset distortion, envelope
impose, etc. — but reimplemented as **real-time Web Audio nodes**, not by shelling
out to CDP's offline command-line binaries. We keep the existing declarative node
contract; every new transform is one registry entry like `filter~` already is.

## Key framing (why this is a reimplementation, not a port)
- **CDP is offline/file-based**: read WAV → run process → write WAV → chain files.
  **SoundThread** is a Godot GUI that orchestrates those binaries.
- **You prefer real-time.** So we port the *ideas* of CDP processes into live
  Web Audio nodes that stream through the same Tone graph MusX already runs.
- **Consequence 1 — a sound source is needed.** CDP transforms *existing recordings*
  (musique concrète); MusX today only synthesizes. So we add source nodes first.
- **Consequence 2 — spectral is the one hard engine.** The browser `AnalyserNode`
  only *reads* the FFT; it can't resynthesize. Real blur/morph/freeze needs a custom
  **phase-vocoder AudioWorklet** (STFT → manipulate bins → inverse STFT / overlap-add).

## Confirmed decisions (from scoping Q&A)
- **Spectral engine:** build a real real-time **phase-vocoder AudioWorklet** (authentic).
- **Sound input:** add **file loader + live mic** source nodes.
- **First families (all four):** Granular/brassage · Waveset distortion · Spectral (PVOC)
  · Extend/modify/envel.

## What Tone gives us for free (reduces effort)
- `Tone.GrainPlayer` → granular cloud, time-stretch, and pitch-shift **on a loaded
  buffer** (grainSize / overlap / playbackRate / detune). Covers most of the granular family.
- `Tone.UserMedia` → live microphone input node.
- `Tone.Player` → soundfile playback (loop, rate, start/end).
- Existing control cables + `funcgen`/`plot` already emulate CDP's **breakpoint-file
  automation**; we add one `breakpoint~` node (draw-and-play a curve) to complete it.

## New engine/infra (the only shared plumbing)
1. **Worklet loader + Tone bridge** — `js/audio/worklet.js`
   - Register worklet modules **once** at Start Audio via
     `Tone.getContext().addAudioWorkletModule(url, name)`.
   - `makeWorkletNode(name, opts)` returns `{ in, out, node }` where `in`/`out` are
     `Tone.Gain` proxies wrapping the native `AudioWorkletNode`, so spectral nodes
     satisfy `audioIn()`/`audioOut()` and interoperate with Tone objects cleanly.
2. **`engine.start()` becomes async** — `await` worklet-module registration before
   building runtimes; `main.js` awaits the Start-Audio handler. (Only change to
   existing code; non-spectral nodes are unaffected.)
3. **Phase-vocoder worklet** — `js/audio/worklets/pvoc-processor.js`
   - Windowed STFT (2048 / 75% overlap), overlap-add resynthesis, per-frame phase
     accumulation. One worklet, selectable `op` (blur/freeze/stretch/pitch/filter),
     plus a 2-input variant for `morph`. ~46 ms latency (acceptable).
4. **Waveset worklet** — `js/audio/worklets/waveset-processor.js`
   - Zero-crossing segmentation, then CDP-style waveset ops (repeat/omit/reverse/
     average/harmonic/telescope) buffer-by-buffer.

## New node catalog (each = one registry entry)
**Sources** (`js/nodes/sources.js`, category `source`)
- `sndfile~` — load/drag a WAV → AudioBuffer; play/loop, varispeed rate, start/end.
- `mic~` — live input via `Tone.UserMedia`.

**Granular / brassage** (`js/nodes/granular.js`) — buffer-fed via `Tone.GrainPlayer`
- `grain~` — granular cloud: size, density/overlap, position, spray, pitch spread.
- `tstretch~` — time-stretch independent of pitch (rate vs. grain scan).
- `pshift~` — pitch-shift independent of time (detune).

**Waveset distortion** (`js/nodes/waveset.js`) — `waveset-processor` worklet
- `wsdistort~` — mode select: multiply/repeat · omit · reverse · average ·
  harmonic · telescope · reform (CDP `distort` family, the signature CDP crunch).

**Spectral / PVOC** (`js/nodes/spectral.js`) — `pvoc-processor` worklet
- `spec.freeze~` — hold/freeze the current spectral frame.
- `spec.blur~` — average bins over time (blur amount = window).
- `spec.pitch~` — phase-vocoder transpose (pitch independent of time).
- `spec.stretch~` — spectral / time stretch.
- `spec.filter~` — spectral gate / clean / hilite (bin threshold or mask).
- `spec.morph~` — interpolate magnitudes+phases between **two** audio inputs.

**Extend / modify / envel** (`js/nodes/transform.js`)
- `iterate~` — grab a segment and repeat it with decay + pitch step.
- `scramble~` — reorder buffer segments (shuffle / drunk).
- `envfollow~` — envelope follower → **control** outlet (a breakpoint-like stream).
- `envimpose~` — impose an incoming envelope onto audio (pairs with `envfollow~` for
  cross-envelope / envelope replacement).
- `breakpoint~` — draw a line-segment automation curve, play it back synced to transport
  (real-time equivalent of CDP breakpoint files).

## Implementation todo list (phased, each phase independently runnable)
- [x] **2.0 Infra** — `worklet.js` bridge + async `engine.start()` (+ `main.js` await).
      Milestone: pass-through worklet wired osc→worklet→meter passes audio (−2.7 dB). ✓
      Verified by `tests/auto/probe-worklet.mjs`; existing suite still all-green.
- [x] **2.1 Sources** — `sndfile~` (drag-drop WAV, loop, rate, ▶/■, `trig` inlet) and
      `mic~` (Tone.UserMedia, open-mic button, status readout). Decoded audio kept on
      `node._audio` (not serialized); only `params.filename` persists. ✓
      Verified: sndfile~ plays a buffer (−7.0 dB), mic~ opens the stream. Selenium
      `tests/auto/ui_test.py` + Playwright `probe-sources.mjs`; figure `source-nodes.png`.
      NOTE: UI testing + doc figures now use **Selenium** (per project decision).
      SOUNDS + PATCHES: `sndfile~` can auto-load a bundled sound via `params.src` (and a
      dropdown of them). `sounds/` holds 6 generated source sounds (`sounds/make_sounds.py`:
      bell, voice-ah, pluck, noise-sweep, glass-hits, drone). Three example threads in
      `patches/` — `cdp-concrete-resonator` (resonant bandpass bank, auto-loads drone.wav),
      `cdp-dub-smear` (swept-filter feedback-delay dub, auto-loads bell.wav), `cdp-mic-resonator`
      (live-mic comb resonator + XY control). Verified by `tests/auto/verify_patches.py`.
- [x] **2.2 Granular** — `grain~`, `tstretch~`, `pshift~` on `Tone.GrainPlayer` (one shared
      runtime; category `granular`). GrainPlayer decouples time (`playbackRate`) from pitch
      (`detune`). Each owns a buffer via the shared loader (`js/nodes/soundloader.js`, extracted
      from sndfile~). Verified by `tests/auto/granular_test.py` (all three granulate a buffer).
      DESIGN NOTE: granular nodes are buffer sources (GrainPlayer can't granulate a live stream),
      so they load a file rather than reading a separate sndfile~'s output.
      GROUPING: `sounds/` reorganized into `tonal/ vocal/ texture/`; the sndfile~/grain~ dropdown
      builds `<optgroup>`s from the sub-dir names. `patches/` grouped into `cdp/ granular/ live/`.
      Demo: `patches/granular/granular-cloud.json`.
      MIC: `mic~` now shows a live input-level (dB) readout (`Tone.Meter`) to diagnose input;
      added `patches/live/mic-monitor.json` (mic→gain→dac+scope) for isolating mic problems.
- [x] **2.3 Waveset** — `waveset-processor` worklet + `wsdistort~` (one mode-select node).
      Six CDP DISTORT modes: repeat · omit · reverse · average · telescope · reform.
      Milestone met: crunch verified on live `osc~` (all 6 modes audible,
      `probe-waveset.mjs`) AND on `sndfile~` (demo `patches/cdp/waveset-crunch.json`,
      -5.8 dB through the chain). See "Phase 2.3 Review" below.
- [x] **2.4 Spectral** — `pvoc-processor` worklet + the six `spec.*~` nodes. DONE.
      - [x] **2.4a** engine + `spec.freeze~`/`spec.blur~`/`spec.filter~`. Milestone met:
            `thru` reconstructs at unity (RMS ratio 1.01, no combing); freeze sustains
            after input stops (-5.7 dB); blur/filter audible. Demo `spectral-blur.json`
            (-7.3 dB). See "Phase 2.4a Review" below.
      - [x] **2.4b** `spec.pitch~` (transpose) + `spec.stretch~`. NOTE: real-time TIME-stretch
            of a live stream is impossible (locked I/O clock) and granular `tstretch~` already
            covers it, so — with sign-off — `spec.stretch~` is a SPECTRAL partial-stretch
            (frequency-axis, inharmonic/bell), which IS length-preserving + real-time.
            Both reconstruct at identity (pitch=0 → 0.97, stretch=1 → 0.83). Demo
            `spectral-stretch.json` (-14 dB). Shared `pvAnalyze`/`pvSynthesize` helpers.
      - [x] **2.4c** `spec.morph~` — 2-input worklet (`pvoc-morph-processor`, added to the
            same pvoc file so it shares the FFT). `makeWorkletNode` generalized to return
            `ins[]` for multi-input worklets. Interpolates two inputs' magnitude+frequency
            spectra by `morph` (0=a, 1=b). morph=0 reconstructs A (0.97), morph=1 → B (0.82).
            Demo `spectral-morph.json` (two sndfile~ + slider, -13.8 dB).
- [x] **2.5 Extend/modify/envel** — `iterate~`, `scramble~`, `envfollow~`,
      `envimpose~`, `breakpoint~`. DONE.
      - [x] **2.5a** `envfollow~` (Tone.Follower -> `env` audio + `val` control) +
            `envimpose~` (VCA: multiply carrier by env). Milestone met: drum-loop envelope
            opens a pad's VCA (probe: open -0.3 dB, closes 20 dB when source silenced).
            Demo `patches/cdp/env-impose.json` (-13.5 dB). `verify_patches.py` now takes an
            optional patch-substring arg to check one patch in isolation.
      - [x] **2.5b** `breakpoint~` — editable line-segment automation curve (click add, drag
            move, right-click delete; pinned endpoints) played back synced to transport as a
            `val` control stream (lo..hi over `dur`, loop/one-shot, `trig` restart). Points
            persist in params. Probe: drives an osc freq sweep 200->776. Demo
            `patches/cdp/breakpoint-sweep.json` (curve -> filter cutoff, -4.8 dB).
      - [x] **2.5c** `iterate~` (ring-record; on `trig` snapshot last `seg` and replay
            `count`× with `decay` gain + `pitch` semitone step — a triggered stutter/echo,
            outputs only the burst) + `scramble~` (chop into `seg` segments, replay in
            shuffle/drunk order; rate-locked, no drift). Shared `glitch-processor.js` worklet.
            Probe: iterate silent before trig / audible after; scramble audible once buffered.
            Demo `patches/cdp/glitch-shuffle.json` (metro→iterate + scramble, -16.1 dB).
- [ ] **2.6 Palette + Save/Load + demos + tests** — register new categories in the
      palette; extend `serialize.js`; add a CDP-style demo patch
      (`sndfile~ → grain~ → spec.blur~ → dac~`); Playwright smoke + meter-verified tests.

## Canvas UX (added during Phase 2 — needed once patches got large)
- **Pan/zoom/fit** on the `#nodes` layer (`main.js`: `vp`, `screenToWorld`, `applyViewport`,
  `fitView`, `_bindPanZoom`). Wheel = zoom-to-cursor (0.2–2.5×); drag empty canvas / middle
  mouse = pan; double-click empty = fit; **loading a patch auto-fits it fully on canvas**.
  Node drag + add-node placement convert through world coords; xy-pad & resize-grip made
  zoom-correct. Verified by `tests/auto/panzoom_test.py`.

## Live parameter modulation (added during Phase 2)
- Any param can be marked `mod: true` -> the registry auto-generates a same-named control
  inlet, and the engine routes control arriving there to `setParam` (and reflects the value
  on the widget without persisting it). Everything is live/real-time.
- Applied to: `osc.freq`; `adsr.A/D/S/R`; `gain.level`; `filter.cutoff/Q`; `delay.time/feedback/wet`;
  `reverb.wet` (NOT decay — regenerates the impulse response); `dist.amount/wet`;
  `sndfile.rate`; granular `grain/overlap/rate/pitch`. The old hand-wired inlets on
  osc/gain/filter were folded into this mechanism (same inlet names -> patches unaffected).
- `sndfile~` swaps its buffer live (restarts playback so a newly chosen file is heard at once).
- Verified by `tests/auto/mod_test.py` + widget-reflects-modulation check.

## Docs
- `docs/manual.tex` updated: CDP/SoundThread intro + bibliography, pan/zoom section, source
  and granular objects, modulatable-parameters section, grouped sounds/patches, testing.
  Figures regenerated (Selenium `docs/make_figures.py`), PDF rebuilt.

## Open questions (non-blocking; sensible defaults assumed)
1. **Audio-asset persistence in saved patches.** JSON can't cleanly hold a WAV.
   *Default:* store the filename + settings; on Load, prompt to re-select the file.
   (Optional: base64-embed only short clips.) OK, or do you want embedding?
2. **Spectral latency vs. quality.** *Default:* 2048/75% overlap (~46 ms). Fine for
   design work; say if you want a lower-latency mode.
3. **Multichannel.** CDP does 8/16-ch arrays; MusX is mono/stereo. *Default:* stay
   stereo — out of scope for Phase 2.

## Phase 2.3 Detailed Plan — Waveset Distortion (proposed; awaiting sign-off)

**What a waveset is:** the signal between alternate zero-crossings (one upward
zero-crossing to the next upward zero-crossing). We segment the live stream on
positive-going zero-crossings; each segment is one pseudo-wavecycle. A `group`
param lets ops act on N consecutive wavesets at once (CDP `cyclecnt`).

**Files (2 new + 3 edits):**
- `js/audio/worklets/waveset-processor.js` — the DSP worklet (new).
- `js/nodes/waveset.js` — the `wsdistort~` registry entry (new).
- `js/audio/worklet.js` — add the worklet to `MODULES` (1 line).
- `js/nodes/registry.js` — import + spread `wavesetNodes` (2 lines).
- `js/main.js` palette already builds from categories, so category `waveset`
  appears automatically — no palette edit needed.

**One node, mode-select** (mirrors `filter~`'s style — mode + a few params):
`wsdistort~` : `in` (audio) → `out` (audio), params:
- `mode` select: repeat · omit · reverse · average · telescope · reform
- `group`  (1–16, mod)  — wavesets per operation (CDP cyclecnt)
- `count`  (1–8,  mod)  — repeats, used by *repeat*
- `keep`/`skip` (0–8)   — omit pattern (keep K, drop S), used by *omit*
- `shape`  select (sine/square/tri/saw) — substitute wave, used by *reform*
- `wet`    (0–1, mod)   — dry/wet (CDP is 100% wet; wet knob aids A/B)

**The six modes:**
- `repeat`   — emit each waveset(group) `count`× → time-extend, sub-octave buzz.
- `omit`     — keep `keep`, drop `skip` wavesets → thinning / rhythmic gating.
- `reverse`  — reverse each waveset(group) in place → same length, roughens.
- `average`  — replace each waveset by the mean shape of the last `group`
               wavesets (resampled to current length) → smears timbre/pitch.
- `telescope`— merge `group` wavesets into one (resample to avg length) →
               time-contract, pitch-up.
- `reform`   — replace each waveset with `shape`, scaled to its length + peak →
               keeps rhythm/contour, swaps timbre.

**Length-change handling (repeat/omit/telescope):** an internal output FIFO
drained 128 samples/quantum; completed transformed wavesets are pushed in. FIFO
is **capped (~1 s)**; on overflow we drop oldest, on underflow we output zeros.
This bounds latency — the one real-time concession vs. offline CDP; I'll note it
in-code and in the manual rather than pretend it's exact.

**Per-channel:** each channel keeps independent waveset state (CDP is per-channel).

**Testing:** `tests/auto/waveset_test.py` (Selenium) — osc~→wsdistort~→meter,
assert audible output (> −60 dB) for each mode; Playwright `probe-waveset.mjs`
for a headless dB check; figure `waveset-node.png`. Demo patch
`patches/cdp/waveset-crunch.json` (sndfile~ → wsdistort~ → dac~).

## Phase 2.3 Review (built, tested, all green)
**What shipped**
- `js/audio/worklets/waveset-processor.js` — waveset segmenter (alternate zero-crossings,
  per-channel state) + six ops, with a capped output FIFO for the length-changing modes.
- `js/nodes/waveset.js` — `wsdistort~` (category `waveset`), params: mode, group(mod),
  count(mod), keep, skip, shape, level(mod). Params pushed to the worklet via its port.
- Wiring: worklet added to `MODULES`; `wavesetNodes` registered. Palette auto-shows the
  new `waveset` category (no palette edit needed).
- Demo `patches/cdp/waveset-crunch.json` (sndfile~→wsdistort~→dac~ +scope).

**Deviation from the proposed plan (flagged, not silent):** dropped the `wet` param.
A sample-aligned dry/wet is ill-defined for repeat/omit/telescope (they time-shift the
signal). CDP distort is 100% wet; added an honest `level` output-gain param instead.

**Real-time concession (documented, per no-fake-fallbacks rule):** repeat/omit/telescope
change sample count, so output streams through a per-channel FIFO capped at ~1 s
(drop-oldest on overflow). This bounds latency vs. offline CDP; noted in-code.

**IMPORTANT infra bug fixed (affects all future worklets, incl. 2.4 pvoc):** Tone v15's
`ctx.addAudioWorkletModule(url)` caches a single `_workletPromise` and returns it for every
call — so only the FIRST worklet module ever loads; a second is silently dropped (resolves
without fetching). Worked in 2.0 with one module; adding waveset exposed it. Fix in
`worklet.js`: call the NATIVE `ctx.rawContext.audioWorklet.addModule(url)` per module.
The pvoc worklet in 2.4 depends on this fix.

**Tests (all pass):** `probe-waveset.mjs` (6/6 modes audible, live osc~); end-to-end node
through the engine incl. live mode-change via port message; `verify_patches.py` extended
with the waveset demo (-5.8 dB); `probe-worklet.mjs` passthrough regression (-2.7 dB);
main suite `test.mjs`; `mod_test.py`. Figure `outputs/waveset-node.png`.

## Phase 2.4 Detailed Plan — Spectral / Phase Vocoder (proposed; awaiting sign-off)

**The hard part:** the browser gives us `AnalyserNode` (FFT read-only) but no spectral
*resynthesis*. So we build a real phase-vocoder AudioWorklet: sliding STFT → modify
magnitude/phase per bin → inverse STFT → overlap-add. AudioWorklets load as classic
scripts and can't `import`, so a compact radix-2 FFT is **embedded** in the worklet file.

**Engine parameters:** FFT 2048, hop 512 (75% overlap), Hann window (analysis +
synthesis), so latency ~46 ms. Per-channel state (mirrors waveset). Input ring buffer
feeds hop-aligned frames; output overlap-add ring buffer drained 128 samples/quantum.

**Files:**
- `js/audio/worklets/pvoc-processor.js` — 1-input phase vocoder, `op` select
  (freeze/blur/filter/pitch/stretch). Embedded FFT + STFT/OLA core (new).
- `js/audio/worklets/pvoc-morph-processor.js` — 2-input variant: two STFTs, interpolate
  magnitudes/phases, one ISTFT (new). Kept separate because it needs numberOfInputs:2.
- `js/nodes/spectral.js` — the six `spec.*~` registry entries, category `spectral` (new).
- `js/audio/worklet.js` — add both modules to `MODULES`; add a 2-input helper
  `makeWorkletNode(name,{numberOfInputs:2})` wiring two input Gains to node inputs 0/1.
- `js/nodes/registry.js` — import + spread `spectralNodes` (2 lines).

**The six nodes (each = one registry entry, all audio-in → audio-out):**
- `spec.freeze~` — hold current frame's magnitudes; keep advancing each bin's phase by its
  analysed frequency so the freeze sustains smoothly (not a static buzz). `freeze` toggle
  (mod) + `trig` to re-capture. Length-preserving.
- `spec.blur~` — average magnitudes over the last N frames (`amount` = window, mod);
  smears transients into a wash. Length-preserving.
- `spec.filter~` — spectral gate: zero bins below (clean/denoise) or keep only bins above
  (hilite) a magnitude `thresh` (mod); `mode` select. Length-preserving.
- `spec.pitch~` — transpose by shifting the magnitude spectrum by `semitones` (mod) with
  phase-advance rescaling; time unchanged. (Phase/formant work — harder.)
- `spec.stretch~` — spectral/time stretch by `factor` (mod): output hop ≠ input hop, so it
  streams through the bounded output FIFO (same real-time drift concession as waveset).
- `spec.morph~` — two audio inlets `a`/`b`; interpolate magnitudes (and phases) by `morph`
  0..1 (mod) → crossfade timbres. (2-input worklet.)

**Proposed sequencing (de-risk the FFT core before piling on ops):**
- *2.4a* — PVOC engine + `spec.freeze~`, `spec.blur~`, `spec.filter~` (length-preserving,
  magnitude-domain — the robust subset that validates STFT/OLA end-to-end).
- *2.4b* — `spec.pitch~`, `spec.stretch~` (phase manipulation / length change).
- *2.4c* — `spec.morph~` (2-input worklet) + demo patch + docs.

**Testing (per sub-step):** `probe-pvoc.mjs` — osc~→spec.*~→meter, assert audible AND
(critical for a phase vocoder) that a *pass-through* op reconstructs the input faithfully
(OLA gain ≈ unity, no combing). Then per-op behavioural checks (freeze sustains after
input stops; blur reduces frame-to-frame magnitude variance). Selenium figure +
`verify_patches.py` demo (`sndfile~ → spec.blur~ → dac~`) at the end.

## Phase 2.4a Review (built, tested, all green)
**What shipped**
- `js/audio/worklets/pvoc-processor.js` — real phase vocoder: embedded radix-2 FFT,
  sliding STFT 2048/512 Hann (Bernsee rover-FIFO + output-accumulator framing),
  overlap-add resynthesis. Ops: thru/freeze/blur/filter. Per-channel state.
- `js/nodes/spectral.js` — `spec.freeze~` (hold + trig re-capture), `spec.blur~`
  (magnitude averaging over N frames), `spec.filter~` (spectral gate, invertible).
  Category `spectral`; amount/thresh/freeze are mod inlets.
- Wiring: pvoc added to `MODULES` (works thanks to the 2.3 native-addModule fix);
  `spectralNodes` registered. Demo `patches/cdp/spectral-blur.json`.

**Key correctness note (the classic PVOC trap):** first pass was silent — the
Bernsee normalization constant assumes an *unscaled* inverse FFT, but our embedded
inverse divides by N, so output was ~N× too quiet. Fixed by computing the COLA
normalization from the window itself: `norm = HOP / Σwindow²`. `thru` now
reconstructs the input at unity (RMS ratio 1.01) with no combing — proving the
STFT/OLA core is correct before layering ops.

**Tests:** `probe-pvoc.mjs` (unity reconstruction; freeze sustains after input stop;
blur/filter audible); end-to-end `spec.blur~` through the engine incl. live param +
serialize round-trip of the dotted type; `verify_patches.py` +spectral-blur (-7.3 dB);
waveset + passthrough probe regressions; main `test.mjs`. Figure `outputs/spectral-nodes.png`.

## Phase 2.5 Detailed Plan — Extend / Modify / Envelope (proposed; awaiting sign-off)

Five nodes of three different kinds. Proposed sequencing does the cohesive, lower-risk
groups first:

**2.5a — envelope pair (mostly Tone, little custom DSP; category `envelope`):**
- `envfollow~` — audio in; tracks the amplitude envelope via `Tone.Follower`. Outlets:
  `env` (AUDIO-rate envelope signal, for imposition) + `val` (CONTROL stream, polled via a
  `Tone.Loop`, for plotting / param modulation). Params: response (smoothing), gain.
  Keeping `env` audio-rate means the envelope pairing works continuously, not only on Play.
- `envimpose~` — audio `in` + `env` (audio) → audio out; a VCA that multiplies the carrier
  by the incoming envelope (`Tone.Gain` with `env` driving `gain`). Param: depth, makeup.
  DESIGN Q (below): plain VCA vs. full envelope *replacement* (flatten the carrier's own
  envelope first, then apply the new one — needs an AGC/divide, approximate in real time).
  Milestone: `envfollow~` of a drum loop → `envimpose~` onto a pad.

**2.5b — `breakpoint~` (UI + control emission; no worklet; category `control`):**
- A small canvas: click to add line-segment breakpoints (time, value), drag to move,
  right-click to delete. On transport it sweeps `dur` seconds and emits the interpolated
  value on a `val` control outlet (real-time equivalent of a CDP breakpoint file). Renders
  like `plot` but editable and *outputs*. Loop/one-shot toggle; lo/hi value range.

**2.5c — glitch pair (custom worklets; category `extend`):**
- `iterate~` — continuously ring-records the input; on `trig`, snapshots the last `seg`
  and replays it `count` times with per-iteration gain `decay` and `pitch` step (CDP
  iterate/stutter). Finite burst, streamed out — no unbounded growth.
- `scramble~` — chops the input into `seg`-length segments, buffers a few, and replays them
  in shuffled or drunk order (`mode`). Uses a bounded segment FIFO (drift concession, like
  waveset). CDP scramble/shuffle.

**Testing:** focused probe per node (meter/│value checks); one demo patch per group; extend
`verify_patches.py`. (Per the standing note, broad regression only when shared infra changes.)

## Phase 3 Plan — Subpatches (patch-as-a-box / abstractions) (proposed; awaiting sign-off)

**Goal:** let a user encapsulate a group of objects into a single `patcher` box that has its
own inlets/outlets; double-click to edit the inside; reuse it like a function/subroutine.

**Boundary objects (define the box's ports):**
- `inlet~` (audio) / `inlet` (control) — each one inside a patcher adds an INPUT port on the
  box, in top-to-bottom / left-to-right order. Its outlet feeds the inner graph.
- `outlet~` (audio) / `outlet` (control) — each adds an OUTPUT port on the box; the inner
  graph feeds its inlet. Port order follows the boundary objects' positions.

**The `patcher` box:** a node whose `params.patch = { nodes, connections }` holds the inner
graph. Its inlets/outlets are derived from the boundary objects inside. Params serialize
wholesale, so a subpatch round-trips with the parent patch automatically (self-contained).

**Engine approach — FLATTEN at build (recommended):** a subpatch is sugar over a flat graph.
Before `engine.start()` builds runtimes, recursively expand every `patcher`: inline its inner
nodes with id-prefixing, and splice out the boundary objects by rewiring (a cable into box
inlet *i* connects straight to whatever the inner `inlet~` *i* fed; likewise outlets). The
existing flat engine then runs unchanged; nesting recurses. Editing the inside rebuilds.
(Alternative — nested child-engines per box — is more encapsulated but much more plumbing;
flattening reuses everything we have.)

**Editing model — navigate-in (recommended):** double-click a `patcher` to descend into its
inner graph (the canvas swaps context); a breadcrumb / "▲ up" returns. The editor keeps a
stack of graph contexts. Arbitrary nesting falls out naturally.

**Two ways to make one (v1 = the first; second is a fast follow):**
1. Add an empty `patcher`, enter it, drop `inlet~`/`outlet~` objects + build the guts.
2. "Encapsulate selection": select nodes → collapse into a `patcher`, auto-creating boundary
   objects for every cable that crossed the selection boundary. (Higher-value, more complex.)

**Abstractions (later):** a `patcher` could instead REFERENCE a saved `.json` patch file, so
one definition instances many places and edits propagate. v1 stays inline/self-contained.

**Scope risks:** touches the graph model (nesting), the engine, the UI (canvas context stack
+ breadcrumb), and serialize. Built in steps:
- [x] **3.1** boundary objects (`inlet~`/`inlet`/`outlet~`/`outlet`) + `patcher` node with a
      NESTED-runtime `create()` (builds the inner graph, wires inner audio, runs an inner
      control bus, bridges audio+control across the box). Ports are dynamic via a new
      `def.ports(node)` hook (`portsOf()` in registry; NodeView + `engine._emit` use it).
      NOTE: chose nested runtime over flatten — keeps the top engine's incremental model
      untouched (a patcher is just one node). Headless `probe-subpatch.mjs`: audio subpatch
      passes signal (-7.6 dB), ports derived from contents, control crosses the box
      (osc->660). Main suite regression green (shared-infra touch). Not yet user-visible.
- [x] **3.2** enter/exit UI: double-click a `patcher` to descend into its inner graph.
      The editor mounts different graphs via a context stack (`ctxStack`), detaching/attaching
      its view handlers (`Graph.off` added); a breadcrumb ("root patch ▸ patcher") navigates
      out. Inner edits mirror into `params.patch` up the chain and debounce-rebuild the
      top-ancestor patcher's runtime (`engine.rebuildNode`), so the box updates live. The box
      re-derives its ports on exit (full re-mount). Save/Load/Demo/Clear exit to root first.
      `probe-subpatch-ui.mjs`: enter/exit depth, breadcrumb, box gains 1-in/1-out from
      boundary objects, audio flows through the built subpatch (-10.5 dB), no page errors.
      Main-suite regression green.
- [x] **3.3** encapsulate-selection (collapse selected nodes into a patcher). Multi-select
      (shift-click toggle + shift-drag rubber-band, selection is now a `Set` of views); a pure
      `encapsulate(graph, ids)` in `subpatch.js` classifies cables as internal/crossing-in/
      crossing-out, moves selected nodes + internal cables into a new `patcher.params.patch`,
      auto-creates one `inlet~/inlet` per distinct external source and one `outlet~/outlet` per
      distinct internal source, rewires the outer cables to the box's derived ports, then deletes
      the originals. Port naming shares one source of truth (`patchPorts(patch)`, refactored out
      of `patcherPorts`). Trigger: `Cmd/Ctrl+E` + an "Encapsulate" toolbar button; the new box is
      auto-selected. `probe-encapsulate.mjs` (13 checks): middle-node case → box gets 1 in/1 out,
      cables rewired, inner `inlet~+filter+outlet~` wired through, audio flows (-7.3 dB); two-node
      case → internal cable preserved, 0 ports, root left with only the box. Main suite + 3.1/3.2
      probes regression green.
- [x] **3.4** file-referenced abstractions — a `patcher` REFERENCES a served `.json` patch
      file (`params.ref`) instead of embedding its guts inline, so one definition instances many
      places and edits propagate on reload. Served-path + `fetch` resolution; entering a referenced
      box is READ-ONLY with a Detach-to-fork escape. `resolveRefs()` fills `params.patch` from the
      file (recursive, error-collecting), after which all 3.1–3.3 machinery runs unchanged. New
      toolbar: Insert abstraction / Save as abstraction / Reload abstractions. `probe-abstraction.mjs`
      (9 checks) green; main suite + 3.1/3.2/3.3 probes green.

### Phase 3.4 detailed plan (done)
**Goal:** turn the inline-only `patcher` into an *abstraction* that can point at a shared `.json`
file under the served tree. N boxes with the same `ref` share one definition; editing the file on
disk + "Reload abstractions" re-fetches and propagates to every instance. Nothing else about the
existing subpatch machinery (3.1 nested runtime, 3.2 enter/exit, 3.3 encapsulate) changes — a
resolved reference just fills `params.patch` and the box behaves exactly like an inline one.

**Why served-path + fetch (not localStorage):** truest to "file-referenced"; the definition is a
real, portable `.json` the user can version/share. MusX already requires `http://` (ES modules),
so `fetch('patches/abstractions/foo.json')` works. Browser can't WRITE files, so "save an
abstraction" downloads a `.json` the user drops into `patches/abstractions/`.

- [x] **A. Resolver (pure) — `subpatch.js`**
  - `params.ref` (optional string): a path relative to the served root, e.g.
    `patches/abstractions/reverb.json`. When present, it is the source of truth; `params.patch`
    is a fetched CACHE.
  - Export `async resolveRefs(graph, fetchImpl = fetch)`: recursively walk every `patcher` node
    (including patchers nested inside a resolved `params.patch`); for each with a `ref`, fetch the
    JSON and set `params.patch`. Returns the list of top-level patcher ids that changed (so the
    caller can rebuild their runtimes). On a 404 / parse error: leave any existing cache in place
    and collect the error into a returned `errors[]` (surfaced as a status line — not swallowed).
  - Add a tiny `isRef(node)` helper. Ports still derive from `params.patch` via the existing
    `patchPorts`, so ports light up the moment a ref resolves — no new port code.

- [x] **B. Resolve at the right moments — `main.js`**
  - After `loadFromFile` and `loadDemo`, and once at app init: `await resolveRefs(rootGraph)`,
    then `graph:loaded`-style refresh (re-emit so views/ports redraw). If audio is running,
    `engine.rebuildNode(id)` for each changed patcher.
  - New toolbar button **"Reload abstractions"** (`index.html`): re-run `resolveRefs` on the root
    graph, rebuild affected runtimes, re-mount to refresh ports, status the count (+ any errors).
    This is the propagation path: edit the file, click Reload, every instance updates.

- [x] **C. Serialize — `serialize.js` (verify only)**
  - `params` already round-trips wholesale, so `ref` persists for free. Keep the cached
    `params.patch` in the saved file (portable/opens even if the ref is briefly missing); on load,
    `resolveRefs` re-fetches to get the latest (propagation). No serialize code change expected —
    confirm with the probe.

- [x] **D. Read-only entry + Detach — `main.js`, `index.html`, `css/style.css`**
  - `enterPatcher`: if `isRef(node)`, push the frame with `readonly: true`, mount the fetched inner
    graph, and DON'T attach the edit→`_syncSubpatch` listeners (nothing writes back). Show a banner:
    "Referenced from `{ref}` — read-only. [Detach to fork]".
  - Guard the few mutation entry points against `this._activeFrame().readonly` (palette add-node,
    Delete key, encapsulate, cable drag-connect) → no-op + hint. One flag, a handful of guards.
  - **Detach** button: delete `params.ref`, keep `params.patch` as the now-private inline copy,
    rebuild the box, and re-enter as a normal editable subpatch. Forks this one instance only.

- [x] **E. Create-an-abstraction UI — `main.js`, `index.html`**
  - **"Save as abstraction"** (enabled only while inside a subpatch frame): download the current
    inner graph as `{name}.json`; status hint to drop it in `patches/abstractions/`.
  - **"Insert abstraction…"**: prompt for a path (default `patches/abstractions/`), `fetch` it, and
    `addNode('patcher', …, { ref, patch })` at canvas center. Reuses the resolver for the fetch.

- [x] **F. Test — `tests/auto/probe-abstraction.mjs`**
  - Fixture `patches/abstractions/gain-half.json`: `inlet~ -> gain(0.5) -> outlet~`.
  - Insert a referenced `patcher` (ref = that file); assert: 1 in / 1 out ports derived, audio
    flows (> -60 dB). Add a SECOND box with the same ref; assert both resolve from one file.
  - Propagation: overwrite the fixture in-page (stub fetch) to `gain(0.9)`, click Reload, assert
    the runtime rebuilt. Read-only: entering the box sets a readonly frame + shows the banner;
    a guarded add-node is a no-op. Detach: `ref` gone, `patch` retained, box now editable.
  - Run main suite + 3.1/3.2/3.3 probes (shared-infra touch).
  - Restore the fixture after the run.

### Phase 3.3 detailed plan (done)
**Goal:** select a group of existing objects and collapse them into one `patcher` box, auto-
creating boundary objects (`inlet~`/`inlet`/`outlet~`/`outlet`) for every cable that crossed the
selection boundary, and rewiring those cables to the box's new ports. The inverse of 3.2's
"build a box from scratch."

There is no multi-selection today (`Editor.selected` is one view), so 3.3 = **multi-select** +
**the encapsulate transform** + **a trigger**. Kept minimal per the simplicity mandate.

- [x] **A. Multi-select (UI)** — `main.js`, `NodeView.js`, `css/style.css`
  - Replace the single `this.selected` with a selection `Set` of views; keep `select(view)` as
    "select only this" and add `toggleSelect`/`clearSelection`. Delete key removes ALL selected.
  - Shift-click a node toggles its membership (plain click = select-only, unchanged).
  - Shift+drag on empty canvas draws a rubber-band rectangle; on mouseup, select every node box
    it intersects. (Plain empty-canvas drag still pans — no conflict.) One small SVG/div rect.
- [x] **B. Encapsulate transform (pure graph logic)** — `subpatch.js`
  - Export `encapsulate(graph, ids)`. Steps: classify each connection as internal (both ends in
    the set), crossing-IN (outside→inside), crossing-OUT (inside→outside), or external (ignored).
  - Build the inner `patch = { nodes, connections }`: copy selected nodes (id/type/x/y/params)
    and all internal connections verbatim.
  - Group crossing-IN by distinct external source endpoint `(nodeId,port)` → one `inlet~`/`inlet`
    boundary each (kind follows the source port); group crossing-OUT by distinct internal source
    endpoint → one `outlet~`/`outlet` boundary each. Assign boundary x-positions in group order so
    port order is deterministic.
  - Add inner cables: inlet→inner targets, inner source→outlet. Place a new `patcher` in `graph`
    at the selection centroid; rewire outer cables to `patcher.inN`/`patcher.outN`. Remove the
    selected nodes (their crossing/internal cables drop automatically via `removeNode`).
  - Export a `patchPorts(patch)` helper from `subpatch.js` (refactor the existing `patcherPorts`
    to call it) so the transform names ports from the SAME source of truth as the box.
  - Returns the new patcher node.
- [x] **C. Trigger (UI)** — `main.js`, `index.html`
  - `Cmd/Ctrl+E` encapsulates the current selection (≥1 node); also an "Encapsulate" toolbar
    button for discoverability. After collapsing, select the new box and status-hint "double-click
    to edit inside." No-op with a hint if nothing is selected.
- [x] **D. Test** — `tests/auto/probe-encapsulate.mjs`
  - Root: `osc → lowpass → dac`; select `lowpass`; encapsulate. Assert: box has 1 in / 1 out,
    `osc→patcher.in1` and `patcher.out1→dac` exist, `lowpass` gone from root, inner patch holds
    `inlet~ + lowpass + outlet~` wired through, audio flows (> -60 dB). Second case: two connected
    nodes selected → internal cable preserved inside, only crossings become ports. No page errors.
  - Run main suite (`test.mjs`) — shared-infra touch (selection model) warrants full regression.

## Phase 4 Plan — Fat/rich synth voices (richsound: Hexeract-inspired unison) (DONE)

**Goal:** let MusX make the thick, wide "supersaw" pad/lead textures Hexeract is known for.
Per the manual, the fatness comes from a specific architecture, not just three oscillators:
**unison voice stacking + detuning**, **stereo spreading**, and (for sampled sources) a
**Start-Mod** random start offset to beat phase-cancellation.

### New nodes vs. subpatching — recommendation (answering "subpatching or not?")
**Build the core as ONE new node (`unison~`), NOT hand-built from primitives.** Reasons:
- Hexeract's own architecture is a *single oscillator module that has unison built in*, and you
  stack three of them. `unison~` = exactly one such module. That maps 1:1 to MusX's convention
  (one registry entry encapsulates a small Tone subgraph — like `grain`, `reverb`, etc.).
  (Product-name note: we call our fat-voice abstraction/demo **`richsound`**, not "hexeract";
  Hexeract is only cited as the inspiration for the technique.)
- Hand-building 8 detuned, panned voices as a subpatch is tedious and MusX has **no `pan~` and no
  detune-math primitives** yet, and no way to parameterize "N voices" in a patch. A node does the
  N-voice fan-out in code, cleanly and live-adjustable.
- Subpatching still plays a complementary role at the TOP level: the full "3-module richsound voice"
  (keyboard → 3× `unison~` → mix → filter → adsr → dac) is shipped as a **reusable abstraction**
  `patches/abstractions/richsound-voice.json` (showcasing Phase 3.4) plus a built-in demo.

Audio path stays stereo end-to-end (dac/gain are `Tone.Gain`, which pass stereo through), so a
`unison~` whose voices are `Tone.Panner`-spread yields a genuinely wide signal into filter→dac.

### Steps
- [x] **4.1 `unison~` — the core supersaw/unison oscillator module.** One registry entry
      (new `js/nodes/fat.js`). Internally: build `voices` (1–8) `Tone.Oscillator`s of `wave`, each
      with a symmetric `detune` offset in **cents** (musical, freq-independent; center voice = 0),
      each into its own `Tone.Panner` symmetrically spread across `-spread..+spread`, summed into
      one output `Tone.Gain` scaled by `1/sqrt(voices)` (headroom). Ports: control inlet `freq`
      (Hz, note-driven — sets every voice's base frequency, offsets preserved) + audio outlet `out`.
      Params: `wave` (select), `voices` (1–8), `detune` (cents, 0–100), `spread` (0–1), `level`.
      `voices` change rebuilds the internal voice array live. Detune/spread/level/freq update live.
      NOTE: keep the freq→per-voice-frequency mapping in the node (base Hz + cents offset via each
      osc's `detune`), so one `freq` control fans out to all voices — no external math needed.
      Probe `probe-unison.mjs`: single `freq` in → audio present AND stereo width (L channel ≠ R
      channel, i.e. spread actually pans); `voices=1,spread=0` collapses toward mono; changing
      `voices` live keeps audio flowing; no page errors.
- [x] **4.2 `pan~` — equal-power stereo panner** (`Tone.Panner`). Audio `in`→`out`, `pos` param
      (−1..1, `mod` so a cable/LFO can sweep it). Small, generally useful, and lets users place
      any mono source (or build/tweak spreads) in the stereo field. Folded into `fat.js`.
      Probe: hard-left `pos` → left channel ≫ right; center → balanced.
- [x] **4.3 Start-Mod for sampled sources** — add a `startmod` param (0–200 ms) to `sndfile~`:
      on each `trig`/restart, offset playback start by a random `[0, startmod)` so stacked sample
      voices blend instead of phase-cancelling (`player.start(time, randomOffset)`). Purely additive
      to the existing node; default 0 = current behavior. Probe: with `startmod>0`, two triggers
      start from different offsets (observable via differing early output), audio still plays.
- [x] **4.4 richsound-voice abstraction + demo.** Ship `patches/abstractions/richsound-voice.json`
      (`inlet` freq + `inlet` trig → 3× `unison~` at different wave/detune/spread → summing `gain`
      → `filter` → `adsr` → `outlet~`) and a built-in `DEMOS` entry ("richsound") wiring `keyboard` → that voice →
      `dac`. Verifies the new nodes end-to-end AND the 3.4 abstraction path. Probe or fold into
      `probe-unison.mjs`: load the demo, play a note, assert audible wide output.
- [x] **4.5 Regression** — main suite + Phase 3 probes green (new nodes are additive, but 4.3 edits
      shared `sndfile~`, so run `probe-sources.mjs` too).
- [x] **4.6 Hold-to-sustain + chord demo** (follow-up request). ADSR now honors gated notes:
      a `noteon` control message opens+sustains the envelope, `noteoff` releases it — so a held
      keyboard key sustains until released (keyboard emits `noteon`/`noteoff` on mouse down/up;
      `note`/`seq`/programmatic `playNote` keep the old fixed-duration `triggerAttackRelease`).
      The "richsound" demo is now **Richsound Chord**: one keyboard gates three richsound voices,
      the pressed freq feeds voice 1 (root) and two `code` nodes multiply it up a minor third and a
      fifth for voices 2/3 → a wide, transposable, sustaining minor triad. Verified: main suite green
      (keyboard/adsr regression), chord sustains past any fixed duration (-7 dB held) and fades on
      release (-31 dB), probe-unison green.
- [x] **4.7 Keyboard oct/low-C live-rebuild fix** (bug). `def.render` only ran once at NodeView
      construction, so editing the keyboard's `oct`/`low C` never rebuilt the keys — pressed keys
      kept their old MIDI notes and the pitch didn't change. Added a general `param:change → view.
      _onParamChange(name,value)` hook in the editor's graph handlers (mirrors the existing
      `_onResize`); the keyboard's render now wraps key-building in a `build()` that re-reads
      octaves/base and re-runs on those changes (then redraws its cables). Verified headlessly:
      `base` 48→60 moves the first key's note; `octaves` 2→3 grows keys 24→36. Full regression green.

### Open choices to confirm before coding
1. **Detune unit:** cents (musical, recommended) vs. the manual's literal ±Hz. I plan cents.
2. **Scope now:** do 4.1+4.2+4.4 first (the synth fatness — the video's main sound), and treat
   4.3 sample Start-Mod as a fast-follow? Or all four together.

## Longer-term (noted, not this phase): SoundThread node gap analysis
SoundThread exposes 100+ CDP time- and frequency-domain processes. After 2.3,
produce a gap table: SoundThread/CDP process → already in MusX? → real-time
feasible? → proposed MusX node. Drives which of 2.4/2.5 (and beyond) to build.

## Simplicity / constraint notes (unchanged principles)
- One transform = one registry entry; the graph engine still never special-cases a node.
- No build step, no bundler; worklets are plain ES-module `.js` files served from `lib/`/`js`.
- Lean on Tone's built-ins (`GrainPlayer`, `UserMedia`, `Player`) before writing DSP.
- Custom DSP only where Web Audio can't do it (phase vocoder, waveset) — no fallbacks/
  simplifications slipped in without checking with you first.
