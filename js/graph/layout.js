// layout.js — automatic layered ("Sugiyama") layout for node graphs. PURE (no DOM): given node
// sizes and directed edges it returns positions that read top->bottom — sources with no inputs on
// top, sinks (dac~) at the bottom — with rows ordered to reduce cable crossings and boxes spaced
// so they never overlap.
//
//   layeredLayout({ nodes: [{id,w,h}], edges: [{from,to}] }, opts?) -> Map<id, {x,y}>
//
// Four phases: (1) reverse back-edges to a DAG, (2) longest-path layering, (3) crossing
// minimisation with dummy nodes for edges spanning >1 layer, (4) coordinate assignment.

const DEF = { hGap: 48, vGap: 64, marginX: 40, marginY: 40, dummyW: 12, sweeps: 8 };

export function layeredLayout(graph, options = {}) {
  const o = { ...DEF, ...options };
  const ids = graph.nodes.map((n) => n.id);
  if (ids.length === 0) return new Map();
  const W = new Map(graph.nodes.map((n) => [n.id, Math.max(1, n.w || 120)]));
  const H = new Map(graph.nodes.map((n) => [n.id, Math.max(1, n.h || 60)]));
  const edges = graph.edges.filter((e) => e.from !== e.to && W.has(e.from) && W.has(e.to));

  // ---- 1) cycle removal: DFS, reverse back-edges so the graph is a DAG for layering ----
  const dag = toDAG(ids, edges);

  // ---- 2) longest-path layering: sources at layer 0, each node one below its deepest input ----
  const layer = assignLayers(ids, dag);
  const nLayers = Math.max(0, ...ids.map((id) => layer.get(id))) + 1;

  // ---- 3) build per-layer node lists with dummies for spanning edges; adjacency by layer ----
  const layers = Array.from({ length: nLayers }, () => []);
  for (const id of ids) layers[layer.get(id)].push(id);
  const down = new Map();   // key -> [keys in layer+1]
  const up = new Map();     // key -> [keys in layer-1]
  const widthOf = new Map(ids.map((id) => [id, W.get(id)]));
  const layerOf = new Map(ids.map((id) => [id, layer.get(id)]));
  const link = (a, b) => { (down.get(a) || down.set(a, []).get(a)).push(b); (up.get(b) || up.set(b, []).get(b)).push(a); };
  for (const id of ids) { down.set(id, []); up.set(id, []); }
  let dCount = 0;
  for (const e of dag) {
    const l0 = layer.get(e.from), l1 = layer.get(e.to);
    if (l1 - l0 <= 1) { link(e.from, e.to); continue; }
    let prev = e.from;                                   // chain dummies through the middle layers
    for (let l = l0 + 1; l < l1; l++) {
      const dk = `__d${dCount++}`;
      layers[l].push(dk); widthOf.set(dk, o.dummyW); layerOf.set(dk, l); down.set(dk, []); up.set(dk, []);
      link(prev, dk); prev = dk;
    }
    link(prev, e.to);
  }

  // ---- 4a) ordering: median heuristic, alternating up/down sweeps, keep the fewest crossings ----
  let best = layers.map((l) => l.slice());
  let bestC = totalCrossings(best, down);
  for (let s = 0; s < o.sweeps; s++) {
    if (s % 2 === 0) for (let l = 1; l < layers.length; l++) sortByMedian(layers[l], layers[l - 1], up);
    else for (let l = layers.length - 2; l >= 0; l--) sortByMedian(layers[l], layers[l + 1], down);
    const c = totalCrossings(layers, down);
    if (c < bestC) { bestC = c; best = layers.map((l) => l.slice()); }
  }
  const ord = best;

  // ---- 4b) coordinates. y per row (tallest real box + gap); x straightened toward neighbours ----
  const rowH = ord.map((l) => Math.max(0, ...l.map((k) => (H.get(k) || 0))));
  const yOf = new Map();
  let y = o.marginY;
  ord.forEach((l, i) => { for (const k of l) yOf.set(k, y); y += (rowH[i] || 0) + o.vGap; });

  // initial centres: pack each row left->right by width
  const cx = new Map();
  for (const l of ord) { let x = o.marginX; for (const k of l) { const w = widthOf.get(k); cx.set(k, x + w / 2); x += w + o.hGap; } }

  const half = (k) => widthOf.get(k) / 2;
  const meanNeighbour = (k, side) => {
    const ns = side.get(k) || [];
    if (!ns.length) return null;
    return ns.reduce((s, n) => s + cx.get(n), 0) / ns.length;
  };
  // Place a row so each node is as close as possible to its desired centre while keeping order and
  // a minimum gap. Isotonic regression (pool-adjacent-violators) gives the exact minimum-deviation
  // placement — stable, centred, and it cannot drift (unlike a one-sided packing pass).
  const placeRow = (row, desired) => {
    const n = row.length; if (!n) return;
    const G = new Array(n); G[0] = 0;                 // cumulative min offset so pos is nondecreasing
    for (let i = 1; i < n; i++) G[i] = G[i - 1] + half(row[i - 1]) + o.hGap + half(row[i]);
    const e = row.map((k, i) => (desired[i] ?? cx.get(k)) - G[i]);
    // PAVA: nondecreasing q minimising sum (q - e)^2
    const val = [], wt = [], len = [];
    for (let i = 0; i < n; i++) {
      let v = e[i], w = 1, L = 1;
      while (val.length && val[val.length - 1] >= v) { const pv = val.pop(), pw = wt.pop(), pl = len.pop(); v = (v * w + pv * pw) / (w + pw); w += pw; L += pl; }
      val.push(v); wt.push(w); len.push(L);
    }
    let i = 0;
    for (let b = 0; b < val.length; b++) for (let j = 0; j < len[b]; j++, i++) cx.set(row[i], val[b] + G[i]);
  };
  // alternate top-down (place by parents) and bottom-up (place by children); both converge.
  for (let s = 0; s < o.sweeps; s++) {
    const side = s % 2 === 0 ? up : down;
    const rows = s % 2 === 0 ? ord : [...ord].reverse();
    for (const row of rows) placeRow(row, row.map((k) => meanNeighbour(k, side)));
  }

  // normalise so the whole drawing starts at the margins, and emit real nodes only (left-top x/y)
  let minX = Infinity;
  for (const id of ids) minX = Math.min(minX, cx.get(id) - half(id));
  const dx = o.marginX - (Number.isFinite(minX) ? minX : 0);
  const out = new Map();
  for (const id of ids) out.set(id, { x: Math.round(cx.get(id) - W.get(id) / 2 + dx), y: Math.round(yOf.get(id)) });
  return out;
}

// DFS cycle removal: back-edges (to a node still on the stack) are reversed for layering only.
function toDAG(ids, edges) {
  const adj = new Map(ids.map((id) => [id, []]));
  for (const e of edges) adj.get(e.from).push(e.to);
  const color = new Map(ids.map((id) => [id, 0])); // 0 white, 1 gray, 2 black
  const dag = [];
  const dfs = (u) => {
    color.set(u, 1);
    for (const v of adj.get(u)) {
      if (color.get(v) === 1) dag.push({ from: v, to: u });      // back-edge -> reverse
      else { dag.push({ from: u, to: v }); if (color.get(v) === 0) dfs(v); }
    }
    color.set(u, 2);
  };
  for (const id of ids) if (color.get(id) === 0) dfs(id);
  return dag;
}

// longest-path layering over the DAG (Kahn topological order + relaxation).
function assignLayers(ids, dag) {
  const succ = new Map(ids.map((id) => [id, []]));
  const indeg = new Map(ids.map((id) => [id, 0]));
  for (const e of dag) { succ.get(e.from).push(e.to); indeg.set(e.to, indeg.get(e.to) + 1); }
  const layer = new Map(ids.map((id) => [id, 0]));
  const q = ids.filter((id) => indeg.get(id) === 0);
  const din = new Map(indeg);
  while (q.length) {
    const u = q.shift();
    for (const v of succ.get(u)) {
      if (layer.get(u) + 1 > layer.get(v)) layer.set(v, layer.get(u) + 1);
      din.set(v, din.get(v) - 1);
      if (din.get(v) === 0) q.push(v);
    }
  }
  return layer;
}

// reorder `row` by the median index of each node's neighbours in the (fixed) adjacent row.
// Nodes with no neighbours keep their relative position (classic median heuristic).
function sortByMedian(row, adjRow, side) {
  const pos = new Map(adjRow.map((k, i) => [k, i]));
  const med = new Map();
  for (const k of row) {
    const idxs = (side.get(k) || []).map((n) => pos.get(n)).filter((x) => x != null).sort((a, b) => a - b);
    med.set(k, idxs.length ? idxs[Math.floor((idxs.length - 1) / 2)] : -1);
  }
  const fixed = row.map((k, i) => [k, i]);
  fixed.sort((a, b) => {
    const ma = med.get(a[0]), mb = med.get(b[0]);
    if (ma < 0 || mb < 0) return a[1] - b[1];             // keep order for no-neighbour nodes
    return ma - mb || a[1] - b[1];
  });
  for (let i = 0; i < row.length; i++) row[i] = fixed[i][0];
}

// module scratch: key -> index in its layer, rebuilt by totalCrossings for counting.
const neighbourPos = new Map();
function reindex(layers) { neighbourPos.clear(); for (const l of layers) l.forEach((k, i) => neighbourPos.set(k, i)); }

// total edge crossings across all adjacent layer pairs (for picking the best ordering).
function totalCrossings(layers, down) {
  reindex(layers);
  let total = 0;
  for (let li = 0; li < layers.length - 1; li++) {
    const upper = layers[li];
    const pairs = [];
    upper.forEach((k, ui) => (down.get(k) || []).forEach((v) => pairs.push([ui, neighbourPos.get(v)])));
    pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++) if (pairs[i][1] > pairs[j][1]) total++;
  }
  return total;
}
