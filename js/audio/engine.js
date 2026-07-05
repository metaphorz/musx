// engine.js — builds the live Tone.js graph from the patch model and keeps it in sync.
// Audio cables are wired as real Tone connections. Control cables are delivered
// dynamically: when a runtime emits, we look up the current control connections and
// call receive() on each target. This means editing cables while running just works.
import { getDef } from '../nodes/registry.js';
import { loadWorklets } from './worklet.js';

export class Engine {
  constructor(graph, getView) {
    this.graph = graph;
    this.getView = getView;       // (nodeId) -> NodeView (for canvases, readouts, flashes)
    this.runtimes = new Map();    // nodeId -> runtime
    this.started = false;
    this._depth = 0;              // guard against control-cable feedback loops
    this.master = null;           // master Gain all dac nodes route through (for Stop)
    this._meter = null;

    graph.on('node:add', (n) => {
      if (!this.started) return;
      this.addNode(n);
      this.runtimes.get(n.id)?.start?.(); // schedule loops (they follow the transport)
    });
    graph.on('node:remove', (n) => { if (this.started) this.removeNode(n.id); });
    graph.on('conn:add', (c) => { if (this.started) this.connect(c); });
    graph.on('conn:remove', (c) => { if (this.started) this.disconnect(c); });
    graph.on('param:change', ({ node, name, value }) => {
      if (this.started) this.runtimes.get(node.id)?.setParam?.(name, value);
    });
  }

  // deliver a control value from (nodeId, outlet) to every connected control inlet
  _emit(nodeId, outlet, value) {
    if (this._depth > 64) return; // runaway feedback safety
    this._depth++;
    try {
      for (const c of this.graph.connections.values()) {
        if (c.kind === 'control' && c.from.nodeId === nodeId && c.from.port === outlet) {
          const rt = this.runtimes.get(c.to.nodeId);
          if (!rt) continue;
          // an auto-generated param inlet drives setParam; a real event inlet drives receive
          const toNode = this.graph.nodes.get(c.to.nodeId);
          const inlet = toNode && getDef(toNode.type).inlets.find((i) => i.name === c.to.port);
          if (inlet?.fromParam) {
            rt.setParam?.(c.to.port, value);
            this.getView(c.to.nodeId)?.setWidgetValue?.(c.to.port, value); // reflect on the widget (not persisted)
          } else {
            rt.receive?.(c.to.port, value);
          }
        }
      }
    } finally { this._depth--; }
  }

  addNode(node) {
    if (this.runtimes.has(node.id)) return;
    const def = getDef(node.type);
    const api = {
      view: this.getView(node.id),
      emit: (outlet, value) => this._emit(node.id, outlet, value),
      master: this.master, // dac routes here so Stop can silence everything
    };
    this.runtimes.set(node.id, def.create(node, api));
  }

  removeNode(id) {
    const rt = this.runtimes.get(id);
    if (rt) { rt.stop?.(); rt.dispose?.(); this.runtimes.delete(id); }
  }

  connect(c) {
    if (c.kind !== 'audio') return; // control is delivered dynamically in _emit
    const src = this.runtimes.get(c.from.nodeId)?.audioOut?.(c.from.port);
    const dst = this.runtimes.get(c.to.nodeId)?.audioIn?.(c.to.port);
    if (src && dst) src.connect(dst);
  }

  disconnect(c) {
    if (c.kind !== 'audio') return;
    const src = this.runtimes.get(c.from.nodeId)?.audioOut?.(c.from.port);
    const dst = this.runtimes.get(c.to.nodeId)?.audioIn?.(c.to.port);
    try { if (src && dst) src.disconnect(dst); } catch (e) { /* already gone */ }
  }

  // first build, after the AudioContext is unlocked. Builds & wires the graph but does
  // NOT start loops — those are transport-driven and begin on Play. Async because custom
  // DSP nodes need their worklet modules compiled before create() can instantiate them.
  async start() {
    if (this.started) return;
    await loadWorklets(); // register worklet processors before any node.create()
    this.started = true;
    this.master = new window.Tone.Gain(1);
    this.master.connect(window.Tone.getDestination());
    for (const node of this.graph.nodes.values()) this.addNode(node);
    for (const c of this.graph.connections.values()) this.connect(c);
    // Start loops/sequences ONCE; they're synced to the (stopped) transport and won't
    // fire until Play. Letting the transport drive them — rather than stop/start-ing the
    // sequences on every toggle — avoids corrupting Tone.Sequence scheduling.
    for (const rt of this.runtimes.values()) rt.start?.();
  }

  // Play/Stop just run the transport and ramp the master gain (linear so it can climb
  // back from 0; exponential ramps can't). Sequences follow the transport automatically.
  transportStart() {
    this.master?.gain.linearRampTo(1, 0.02);
    window.Tone.getTransport().start();
  }
  transportStop() {
    window.Tone.getTransport().pause();
    this.master?.gain.linearRampTo(0, 0.02);
  }

  unmute() { this.master?.gain.linearRampTo(1, 0.02); }

  // peak output level in dB, tapped off the master via a lazily-created meter.
  level() {
    if (!this.master) return -Infinity;
    if (!this._meter) { this._meter = new window.Tone.Meter({ smoothing: 0.2 }); this.master.connect(this._meter); }
    return this._meter.getValue();
  }
}
