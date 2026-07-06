// subpatch.js — patch-as-a-box (inline subpatches / abstractions).
//
// A `patcher` node holds an inner graph in `params.patch = { nodes, connections }`. Special
// boundary objects placed inside define the box's ports:
//   inlet~ / inlet   -> one INPUT port on the box (audio / control), ordered left-to-right
//   outlet~ / outlet -> one OUTPUT port on the box (audio / control)
// The box's ports are therefore DYNAMIC (derived from its contents) — see `patcher.ports`.
//
// Engine model (nested runtime): the top-level engine treats a patcher like any other node.
// Its create() builds runtimes for the inner nodes, wires the inner audio cables, runs an
// inner control bus, and bridges signals across the boundary: an external audio cable into
// box inlet i connects to the inner inlet~'s Gain; control into the box is pushed onto the
// inner bus; inner control reaching an `outlet` is re-emitted out of the box. Nesting works
// because inner patchers are just more nodes built the same way (recursion).
import { getDef, portsOf } from './registry.js';
const T = () => window.Tone;

const IN_TYPES = new Set(['inlet', 'inlet~']);
const OUT_TYPES = new Set(['outlet', 'outlet~']);

// boundary objects of a kind, ordered left-to-right (then top-to-bottom) so port order is stable
function boundary(patch, types) {
  return (patch?.nodes || []).filter((n) => types.has(n.type)).slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
}

// the box's port list, derived from the boundary objects inside (name inN/outN, audio/control)
function patcherPorts(node) {
  const patch = node.params?.patch || { nodes: [], connections: [] };
  const inlets = boundary(patch, IN_TYPES).map((n, i) => ({ name: `in${i + 1}`, kind: n.type === 'inlet~' ? 'audio' : 'control', _bid: n.id }));
  const outlets = boundary(patch, OUT_TYPES).map((n, i) => ({ name: `out${i + 1}`, kind: n.type === 'outlet~' ? 'audio' : 'control', _bid: n.id }));
  return { inlets, outlets };
}

// a pass-through Gain runtime used for both audio boundary objects (inlet~ / outlet~):
// the same Gain is exposed as this object's in and out, so external + inner cables meet on it
function passGain() { const g = new (T().Gain)(); return { audioIn: () => g, audioOut: () => g, dispose: () => g.dispose() }; }

export const subpatchNodes = [
  { type: 'inlet~', title: 'inlet~', category: 'patch', inlets: [], outlets: [{ name: 'out', kind: 'audio' }], params: [], create: passGain },
  { type: 'outlet~', title: 'outlet~', category: 'patch', inlets: [{ name: 'in', kind: 'audio' }], outlets: [], params: [], create: passGain },
  { type: 'inlet', title: 'inlet', category: 'patch', inlets: [], outlets: [{ name: 'out', kind: 'control' }], params: [], create: () => ({}) },
  { type: 'outlet', title: 'outlet', category: 'patch', inlets: [{ name: 'in', kind: 'control' }], outlets: [], params: [], create: () => ({}) },
  {
    type: 'patcher',
    title: 'patcher',
    category: 'patch',
    inlets: [], outlets: [],          // defaults for an empty box; real ports come from ports()
    ports: (node) => patcherPorts(node),
    params: [],                        // params.patch holds the inner graph (serialized wholesale)
    create(node, api) {
      const patch = node.params.patch || (node.params.patch = { nodes: [], connections: [] });
      const nodesById = new Map(patch.nodes.map((n) => [n.id, n]));
      const rts = new Map();
      const { inlets, outlets } = patcherPorts(node);
      const outByBid = new Map(outlets.map((p) => [p._bid, p]));

      // inner control bus: route a control value from an inner outlet to inner targets, and
      // re-emit out of the box when it reaches an `outlet` boundary object.
      const innerEmit = (fromId, outlet, value) => {
        for (const c of patch.connections) {
          if (c.kind !== 'control' || c.from.nodeId !== fromId || c.from.port !== outlet) continue;
          const toNode = nodesById.get(c.to.nodeId); if (!toNode) continue;
          if (toNode.type === 'outlet') { const p = outByBid.get(toNode.id); if (p) api.emit(p.name, value); continue; }
          const rt = rts.get(c.to.nodeId); if (!rt) continue;
          const inlet = portsOf(toNode).inlets.find((i) => i.name === c.to.port);
          if (inlet?.fromParam) rt.setParam?.(c.to.port, value); else rt.receive?.(c.to.port, value);
        }
      };

      // build inner runtimes (boundary control objects get an empty runtime; that's fine)
      for (const inner of patch.nodes) {
        const def = getDef(inner.type);
        const innerApi = { view: null, emit: (o, v) => innerEmit(inner.id, o, v), master: api.master };
        rts.set(inner.id, def.create(inner, innerApi));
      }
      // wire inner audio cables
      for (const c of patch.connections) {
        if (c.kind !== 'audio') continue;
        const src = rts.get(c.from.nodeId)?.audioOut?.(c.from.port);
        const dst = rts.get(c.to.nodeId)?.audioIn?.(c.to.port);
        if (src && dst) src.connect(dst);
      }

      return {
        audioIn: (port) => { const p = inlets.find((x) => x.name === port); return p ? rts.get(p._bid)?.audioOut?.('out') : null; },
        audioOut: (port) => { const p = outlets.find((x) => x.name === port); return p ? rts.get(p._bid)?.audioIn?.('in') : null; },
        receive: (port, v) => { const p = inlets.find((x) => x.name === port); if (p) innerEmit(p._bid, 'out', v); },
        start: () => { for (const rt of rts.values()) rt.start?.(); },
        stop: () => { for (const rt of rts.values()) rt.stop?.(); },
        dispose: () => { for (const rt of rts.values()) { rt.stop?.(); rt.dispose?.(); } },
      };
    },
  },
];
