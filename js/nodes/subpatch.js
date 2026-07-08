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

// a patch's port list, derived from its boundary objects (name inN/outN, audio/control).
// The single source of truth for port naming/order — used by the box AND by encapsulate().
export function patchPorts(patch) {
  patch = patch || { nodes: [], connections: [] };
  const inlets = boundary(patch, IN_TYPES).map((n, i) => ({ name: `in${i + 1}`, kind: n.type === 'inlet~' ? 'audio' : 'control', _bid: n.id }));
  const outlets = boundary(patch, OUT_TYPES).map((n, i) => ({ name: `out${i + 1}`, kind: n.type === 'outlet~' ? 'audio' : 'control', _bid: n.id }));
  return { inlets, outlets };
}
function patcherPorts(node) { return patchPorts(node.params?.patch); }

// ---- file-referenced abstractions (Phase 3.4) ----
// A patcher may carry `params.ref` = a path to a `.json` patch under the served tree
// (e.g. 'patches/abstractions/reverb.json'). When set, that file is the source of truth and
// `params.patch` is just a fetched cache. Many boxes with the same ref share one definition;
// editing the file + re-resolving propagates to every instance.
export function isRef(node) {
  return node?.type === 'patcher' && typeof node.params?.ref === 'string' && node.params.ref.length > 0;
}

// Resolve one patcher: if it references a file, fetch it into params.patch; then recurse into
// its (possibly just-fetched) inner patch so nested references resolve too. Returns true if this
// patcher OR any descendant fetched fresh content — i.e. its runtime needs a rebuild.
async function resolveOne(node, fetchImpl, errors) {
  let changed = false;
  if (isRef(node)) {
    try {
      const res = await fetchImpl(node.params.ref);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      node.params.patch = await res.json();
      changed = true;
    } catch (e) { errors.push(`${node.params.ref}: ${e.message}`); }   // keep any cached patch
  }
  for (const inner of node.params?.patch?.nodes || []) {
    if (inner.type === 'patcher' && await resolveOne(inner, fetchImpl, errors)) changed = true;
  }
  return changed;
}

// Fetch every referenced patcher's definition into its params.patch. `container` is a Graph
// (nodes is a Map) or a plain patch ({ nodes: [] }). Returns { changed: [ids], errors: [strings] };
// `changed` holds the top-level patcher ids whose runtimes should be rebuilt.
export async function resolveRefs(container, fetchImpl = fetch) {
  const errors = [];
  const changed = [];
  const nodes = container?.nodes instanceof Map ? [...container.nodes.values()] : (container?.nodes || []);
  for (const node of nodes) {
    if (node.type !== 'patcher') continue;
    if (await resolveOne(node, fetchImpl, errors)) changed.push(node.id);
  }
  return { changed, errors };
}

// Encapsulate a set of nodes in `graph` into one new `patcher`. Cables crossing the selection
// boundary become boundary objects + box ports; internal cables move inside intact. Returns the
// new patcher node (already added to `graph`). Pure graph ops — the editor's node:add/remove and
// conn:* handlers repaint the canvas for free.
export function encapsulate(graph, ids) {
  const sel = new Set(ids);
  const nodes = [...sel].map((id) => graph.nodes.get(id)).filter(Boolean);
  if (nodes.length === 0) return null;

  // classify every connection relative to the selection
  const conns = [...graph.connections.values()];
  const internal = conns.filter((c) => sel.has(c.from.nodeId) && sel.has(c.to.nodeId));
  const crossIn = conns.filter((c) => !sel.has(c.from.nodeId) && sel.has(c.to.nodeId));
  const crossOut = conns.filter((c) => sel.has(c.from.nodeId) && !sel.has(c.to.nodeId));

  // inner patch: selected nodes + internal cables, copied verbatim (ids stay unique inside)
  const innerNodes = nodes.map((n) => ({ id: n.id, type: n.type, x: n.x, y: n.y, params: structuredClone(n.params) }));
  const innerConns = internal.map((c) => ({ from: { ...c.from }, to: { ...c.to }, kind: c.kind }));

  const minX = Math.min(...nodes.map((n) => n.x)), minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x)), maxY = Math.max(...nodes.map((n) => n.y));

  // crossing-IN grouped by distinct external source endpoint -> one inlet each
  // crossing-OUT grouped by distinct internal source endpoint -> one outlet each
  const group = (list) => {
    const m = new Map();
    for (const c of list) {
      const key = `${c.from.nodeId}|${c.from.port}`;
      const g = m.get(key) || { from: c.from, kind: c.kind, targets: [] };
      g.targets.push(c.to);
      m.set(key, g);
    }
    return [...m.values()];
  };
  const inList = group(crossIn), outList = group(crossOut);

  // boundary objects inside the patch, laid out left-to-right so port order is deterministic
  inList.forEach((g, i) => {
    g._bid = `enc_in${i + 1}`;
    innerNodes.push({ id: g._bid, type: g.kind === 'audio' ? 'inlet~' : 'inlet', x: minX + i * 140, y: minY - 90, params: {} });
    for (const t of g.targets) innerConns.push({ from: { nodeId: g._bid, port: 'out' }, to: { ...t }, kind: g.kind });
  });
  outList.forEach((g, j) => {
    g._bid = `enc_out${j + 1}`;
    innerNodes.push({ id: g._bid, type: g.kind === 'audio' ? 'outlet~' : 'outlet', x: minX + j * 140, y: maxY + 130, params: {} });
    innerConns.push({ from: { ...g.from }, to: { nodeId: g._bid, port: 'in' }, kind: g.kind });
  });

  const patch = { nodes: innerNodes, connections: innerConns };
  const { inlets, outlets } = patchPorts(patch);
  const nameByBid = new Map([...inlets, ...outlets].map((p) => [p._bid, p.name]));

  // place the box at the selection centroid and rewire the outer cables to its derived ports
  const box = graph.addNode('patcher', Math.round((minX + maxX) / 2), Math.round((minY + maxY) / 2), { patch });
  for (const g of inList) graph.addConnection({ ...g.from }, { nodeId: box.id, port: nameByBid.get(g._bid) }, g.kind);
  for (const g of outList) for (const t of g.targets) graph.addConnection({ nodeId: box.id, port: nameByBid.get(g._bid) }, { ...t }, g.kind);

  // remove the originals (drops their internal + crossing cables automatically)
  for (const n of nodes) graph.removeNode(n.id);
  return box;
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
