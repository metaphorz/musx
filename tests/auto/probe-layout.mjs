// probe-layout.mjs — Phase 8: auto-layout. Verifies (1) every built-in demo loads overlap-free
// with its baked coordinates (no runtime arrange), and (2) the Arrange button/algorithm removes
// overlaps from a deliberately messy patch. No page errors.
import { chromium } from 'playwright';

const PORT = process.argv[2] || '8123';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log(`  [PAGEERROR] ${e.message}`); });

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.editor && window.Tone);

const overlapCount = () => page.evaluate(() => {
  const boxes = [...document.querySelectorAll('.node')].map((el) => el.getBoundingClientRect());
  let n = 0;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], c = boxes[j];
    const ox = Math.max(0, Math.min(a.right, c.right) - Math.max(a.left, c.left));
    const oy = Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top));
    if (ox > 6 && oy > 6) n++;
  }
  return n;
});

const keys = await page.evaluate(async () => Object.keys((await import('./js/demos.js')).DEMOS));
let bakedBad = 0;
for (const k of keys) {
  await page.evaluate((kk) => window.editor.loadDemo(kk), k);   // baked coords, no arrange
  await sleep(140);
  const ov = await overlapCount();
  if (ov) { bakedBad++; console.log(`  overlap in ${k}: ${ov}`); }
}

// scramble a demo into an overlapping pile, then Arrange -> overlaps gone
await page.evaluate(() => {
  window.editor.loadDemo('cathedralPad');
  for (const n of window.editor.graph.nodes.values()) window.editor.graph.moveNode(n.id, 60, 60); // pile them up
});
await sleep(150);
const messy = await overlapCount();
await page.evaluate(() => window.editor.autoArrange());
await sleep(300);
const arranged = await overlapCount();

const checks = [
  ['all baked demos load overlap-free', bakedBad === 0, `${keys.length - bakedBad}/${keys.length} clean`],
  ['piling nodes creates overlaps', messy > 0, `${messy} overlaps`],
  ['Arrange removes them', arranged === 0, `${messy} -> ${arranged}`],
  ['no page errors', errors.length === 0, `${errors.length}`],
];
let ok = true;
for (const [name, pass, detail] of checks) { console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`); if (!pass) ok = false; }
console.log(ok ? '  LAYOUT 8.x PASS' : '  LAYOUT 8.x FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
