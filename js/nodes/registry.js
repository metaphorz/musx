// registry.js — collects all node definitions into one map and exposes palette grouping.
import { synthNodes } from './synth.js';
import { sourceNodes } from './sources.js';
import { granularNodes } from './granular.js';
import { effectNodes } from './effects.js';
import { sequencingNodes } from './sequencing.js';
import { controlNodes } from './control.js';
import { analysisNodes } from './analysis.js';
import { codeNodes } from './code.js';

const ALL = [
  ...synthNodes,
  ...sourceNodes,
  ...granularNodes,
  ...effectNodes,
  ...sequencingNodes,
  ...controlNodes,
  ...analysisNodes,
  ...codeNodes,
];

// A param marked `mod: true` gets an auto-generated control inlet of the same name, so it
// can be driven by a cable (funcgen/slider/xypad) as well as its own widget. The engine
// routes control values arriving at such an inlet straight to the runtime's setParam().
// This keeps modulation OPTIONAL and per-node opt-in — nothing changes for params without it.
function withParamInlets(def) {
  const explicit = def.inlets || [];
  const taken = new Set(explicit.map((i) => i.name));
  const paramInlets = (def.params || [])
    .filter((p) => p.mod && !taken.has(p.name))
    .map((p) => ({ name: p.name, kind: 'control', fromParam: true }));
  return paramInlets.length ? { ...def, inlets: [...explicit, ...paramInlets] } : def;
}

export const Registry = new Map(ALL.map((d) => { const nd = withParamInlets(d); return [nd.type, nd]; }));

export function getDef(type) {
  const d = Registry.get(type);
  if (!d) throw new Error(`Unknown node type "${type}"`);
  return d;
}

// [{category, items:[{type,title}]}] for building the palette dropdown
export function paletteGroups() {
  const groups = new Map();
  for (const d of Registry.values()) {
    if (!groups.has(d.category)) groups.set(d.category, []);
    groups.get(d.category).push({ type: d.type, title: d.title });
  }
  return [...groups.entries()].map(([category, items]) => ({ category, items }));
}
