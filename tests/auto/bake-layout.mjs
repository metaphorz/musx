// _bake.mjs — one-time: auto-arrange every built-in demo and write the resulting node positions
// back into js/demos.js so the shipped demos are tidy (no runtime auto-arrange needed).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const PORT = process.argv[2] || '8123';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.editor && window.Tone);

const keys = await page.evaluate(async () => Object.keys((await import('./js/demos.js')).DEMOS));
const positions = {};
for (const k of keys) {
  await page.evaluate((kk) => window.editor.loadDemo(kk), k);
  await sleep(150);
  await page.evaluate(() => window.editor.autoArrange());
  await sleep(250);
  positions[k] = await page.evaluate(() =>
    Object.fromEntries([...window.editor.graph.nodes.values()].map((n) => [n.id, { x: n.x, y: n.y }])));
}
await browser.close();

// ---- rewrite js/demos.js ----
const FILE = new URL('../../js/demos.js', import.meta.url).pathname;
let src = readFileSync(FILE, 'utf8');

// top-level const regions, so a node id is replaced only within its own demo
const marks = [...src.matchAll(/^const (\w+) = /gm)].map((m) => ({ name: m[1], i: m.index }));
marks.push({ name: '__end', i: src.length });
const regionOf = (name) => {
  const idx = marks.findIndex((m) => m.name === name);
  return [marks[idx].i, marks[idx + 1].i];
};

const setXY = (region, id, x, y) => {
  const re = new RegExp(`(id:\\s*'${id}'\\s*,\\s*type:\\s*'[^']*'\\s*,\\s*)x:\\s*-?[\\d.]+\\s*,\\s*y:\\s*-?[\\d.]+`);
  return region.replace(re, `$1x: ${x}, y: ${y}`);
};

let changed = 0;
for (const key of keys) {
  const pos = positions[key];
  if (key === 'cathedralMidi') continue; // handled specially below
  const [a, b] = regionOf(key);
  let region = src.slice(a, b);
  for (const [id, p] of Object.entries(pos)) region = setXY(region, id, p.x, p.y);
  src = src.slice(0, a) + region + src.slice(b);
  changed++;
}

// cathedralMidi: bake the 6 literal nodes + a VPOS table for the generated v1..v8
{
  const pos = positions.cathedralMidi;
  const [a, b] = regionOf('cathedralMidi');
  let region = src.slice(a, b);
  for (const id of ['mf', 'bus', 'hp', 'rev', 'rlp', 'dc']) region = setXY(region, id, pos[id].x, pos[id].y);
  const vpos = Array.from({ length: 8 }, (_, i) => `[${pos['v' + (i + 1)].x}, ${pos['v' + (i + 1)].y}]`).join(', ');
  if (/const VPOS = /.test(region)) {                     // already baked once -> replace the table (idempotent)
    region = region.replace(/const VPOS = \[[^\]]*\];[^\n]*/, `const VPOS = [${vpos}]; // baked (auto-arranged) voice positions`);
  } else {
    region = region.replace(/const N = 8;/, `const N = 8;\n  const VPOS = [${vpos}]; // baked (auto-arranged) voice positions`);
    region = region.replace(/x: 340, y: \(i - 1\) \* 92 \+ 20/, 'x: VPOS[i - 1][0], y: VPOS[i - 1][1]');
  }
  src = src.slice(0, a) + region + src.slice(b);
  changed++;
}

writeFileSync(FILE, src);
console.log(`baked positions into ${changed} demos`);
