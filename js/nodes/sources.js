// sources.js — sound INPUT nodes: a soundfile player and live microphone input.
// CDP transforms existing recordings (musique concrète); MusX otherwise only synthesizes,
// so these are the front end for the whole CDP-style effect chain.
//
// The decoded audio for sndfile~ lives on node._audio (a ToneAudioBuffer) — deliberately
// NOT in node.params, so it is never serialized. Saved patches keep only params.filename
// and the user re-selects the file on load (per project decision).
import { soundLoaderRender, autoloadSrc, miniBtn } from './soundloader.js';
const T = () => window.Tone;

export const sourceNodes = [
  {
    type: 'sndfile',
    title: 'sndfile~',
    category: 'source',
    inlets: [{ name: 'trig', kind: 'control' }], // bang restarts playback from the top
    outlets: [{ name: 'out', kind: 'audio' }],
    params: [
      // filename is stored in params (so it persists) but has no generic widget — the
      // render() UI shows it. loop/rate are normal widgets. rate is `mod` so a cable can
      // modulate varispeed live (auto control inlet) — e.g. a funcgen LFO for tape wobble.
      { name: 'loop', label: 'loop', widget: 'select', options: ['off', 'on'], default: 'off' },
      { name: 'rate', label: 'rate', widget: 'slider', min: 0.25, max: 4, step: 0.01, default: 1, mod: true },
      // Start-Mod: on each (re)start, jump in by a random [0, startmod) ms. Stacking several
      // sndfile~ voices of the same file with startmod>0 stops them phase-cancelling into a
      // hollow/metallic tone — they blend into a lush chorused ensemble (Hexeract "Start Mod").
      { name: 'startmod', label: 'start∿', widget: 'slider', min: 0, max: 200, step: 1, default: 0, mod: true },
    ],
    // shared file-picker / bundled-sound / drag-and-drop UI
    render: soundLoaderRender,
    create(node) {
      const player = new (T().Player)({
        loop: node.params.loop === 'on',
        playbackRate: node.params.rate ?? 1,
        autostart: false,
      });
      const out = new (T().Gain)();
      player.connect(out);
      let hasBuf = false;
      const applyBuf = (toneBuf) => { player.buffer = toneBuf; hasBuf = true; };
      if (node._audio?.buffer) applyBuf(node._audio.buffer); // buffer loaded before audio start

      const restart = () => {
        if (!hasBuf) return;
        try { player.stop(); } catch (e) {}
        const jitter = (node.params.startmod ?? 0) / 1000;             // ms -> s
        const offset = jitter > 0 ? Math.random() * jitter : 0;        // random start-time per trigger
        player.start(undefined, offset);
      };

      // auto-load a bundled sound referenced by the patch (params.src, e.g. "sounds/bell.wav")
      autoloadSrc(node, (buf) => { applyBuf(buf); if (player.loop) player.start(); });

      return {
        audioOut: () => out,
        audioIn: () => null,
        receive: (inlet, v) => { if (inlet === 'trig') restart(); },
        setParam: (n, v) => { // also the target of the `rate` mod inlet
          if (n === 'rate' && Number.isFinite(+v)) player.playbackRate = Math.max(0.01, +v);
          else if (n === 'loop') player.loop = (v === 'on');
          else if (n === 'startmod' && Number.isFinite(+v)) node.params.startmod = Math.max(0, +v);
        },
        // swap the buffer live: if it's playing (or set to loop), restart so the NEW file
        // is heard immediately instead of only after the next manual start
        setBuffer: (toneBuf) => { applyBuf(toneBuf); if (player.loop || player.state === 'started') restart(); },
        play: () => restart(),
        stopPlay: () => { try { player.stop(); } catch (e) {} },
        start: () => { if (hasBuf && player.loop) player.start(); }, // auto-run loops on Start Audio
        stop: () => { try { player.stop(); } catch (e) {} },
        dispose: () => { try { player.stop(); } catch (e) {} player.dispose(); out.dispose(); },
      };
    },
  },

  {
    type: 'mic',
    title: 'mic~',
    category: 'source',
    inlets: [],
    outlets: [{ name: 'out', kind: 'audio' }],
    params: [
      { name: 'gain', label: 'gain', widget: 'slider', min: 0, max: 8, step: 0.01, default: 2 }, // makeup for quiet mics
      { name: 'status', label: 'mic', widget: 'readout', default: 'off' },
      { name: 'level', label: 'in', widget: 'readout', default: '—' }, // live input level (dB)
    ],
    render({ node, body, editor }) {
      const btn = miniBtn('◉ open mic');
      btn.addEventListener('click', () => editor.engine.runtimes.get(node.id)?.openMic?.());
      body.appendChild(btn);
    },
    create(node, api) {
      const out = new (T().Gain)(node.params.gain ?? 1);
      const mic = new (T().UserMedia)();
      const meter = new (T().Meter)({ smoothing: 0.7 });
      let timer = null;
      const setStatus = (s) => api?.view?.setReadout?.('status', s);
      const open = async () => {
        try {
          await mic.open();
          mic.connect(out);
          out.connect(meter); // tap the post-gain signal so the readout shows real input
          setStatus('on');
          if (!timer) timer = setInterval(() => {
            const db = meter.getValue();
            api?.view?.setReadout?.('level', Number.isFinite(db) && db > -100 ? `${db.toFixed(0)} dB` : '—');
          }, 150);
        } catch (e) {
          setStatus('denied');
          console.warn('[mic] getUserMedia failed', e);
        }
      };
      return {
        audioOut: () => out,
        audioIn: () => null,
        setParam: (n, v) => { if (n === 'gain' && Number.isFinite(+v)) out.gain.rampTo(+v, 0.02); },
        openMic: () => open(),
        start: () => open(), // request the mic when audio starts
        dispose: () => { if (timer) clearInterval(timer); try { mic.close(); } catch (e) {} mic.dispose(); meter.dispose(); out.dispose(); },
      };
    },
  },
];
