// main.js — the editor: wires the Graph model, NodeViews, SVG cables, the audio Engine,
// and the toolbar together.
import { Graph } from './graph/Graph.js';
import { NodeView } from './graph/NodeView.js';
import { Engine } from './audio/engine.js';
import { getDef, paletteGroups } from './nodes/registry.js';
import { encapsulate, isRef, resolveRefs } from './nodes/subpatch.js';
import { saveToFile, loadFromFile } from './graph/serialize.js';
import { DEMOS } from './demos.js';

const SVGNS = 'http://www.w3.org/2000/svg';

class Editor {
  constructor() {
    this.graph = new Graph();
    this.views = new Map();        // nodeId -> NodeView
    this.cables = new Map();       // connId -> <path>
    this.selection = new Set();    // selected NodeViews (single- and multi-select)
    this.pending = null;           // in-progress connection drag
    this.spawnOffset = 0;
    this.vp = { x: 0, y: 0, z: 1 }; // canvas viewport: pan (x,y) + zoom (z)

    this.canvas = document.getElementById('canvas');
    this.nodesLayer = document.getElementById('nodes');
    this.svg = document.getElementById('cables');

    // Subpatch editing: a stack of graph "contexts". Frame 0 is the root patch (what the
    // engine runs); descending into a `patcher` pushes its inner graph. Only one graph is
    // mounted (shown/edited) at a time; the engine always stays bound to the root.
    this.ctxStack = [{ graph: this.graph, patcher: null }];
    this._buildBreadcrumb();
    this._buildRefBanner();

    // Bind the editor's graph listeners BEFORE constructing the Engine, so that on a
    // node:add the NodeView (and its canvas) is created first — the engine then builds the
    // runtime with the view present. Otherwise loading a patch while audio runs creates
    // scope/plot runtimes with no canvas (sound plays but visuals stay blank).
    this._bindGraph();
    this.engine = new Engine(this.graph, (id) => this.views.get(id));

    this._buildPalette();
    this._buildContextMenu();
    this._bindToolbar();
    this._bindGlobalKeys();
    this._bindPanZoom();
  }

  canvasRect() { return this.canvas.getBoundingClientRect(); }

  // convert a screen (client) point into world coordinates (node.x/y space),
  // accounting for the current pan and zoom. Used by node drag and add-node placement.
  screenToWorld(cx, cy) {
    const r = this.canvasRect();
    return { x: (cx - r.left - this.vp.x) / this.vp.z, y: (cy - r.top - this.vp.y) / this.vp.z };
  }

  // push the viewport onto the #nodes layer. Cables live in a screen-space SVG and use
  // getBoundingClientRect, so they auto-follow once we redraw them.
  applyViewport() {
    this.nodesLayer.style.transformOrigin = '0 0';
    this.nodesLayer.style.transform = `translate(${this.vp.x}px, ${this.vp.y}px) scale(${this.vp.z})`;
    this._redrawAllCables();
  }

  // pan (drag empty canvas / middle-mouse), zoom (wheel to cursor), fit (double-click)
  _bindPanZoom() {
    const canvas = this.canvas;
    const onEmpty = (t) => t === canvas || t === this.svg || t === this.nodesLayer;

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = this.canvasRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const nz = Math.min(2.5, Math.max(0.2, this.vp.z * factor));
      // keep the world point under the cursor fixed while zooming
      const wx = (sx - this.vp.x) / this.vp.z, wy = (sy - this.vp.y) / this.vp.z;
      this.vp.z = nz; this.vp.x = sx - wx * nz; this.vp.y = sy - wy * nz;
      this.applyViewport();
    }, { passive: false });

    canvas.addEventListener('mousedown', (e) => {
      if (e.shiftKey && e.button === 0 && onEmpty(e.target)) { this._startRubberBand(e); return; } // shift+drag = select
      if (!(onEmpty(e.target) || e.button === 1)) return; // nodes/ports handle their own drags
      if (e.button === 1) e.preventDefault();
      const sx = e.clientX, sy = e.clientY, ox = this.vp.x, oy = this.vp.y;
      canvas.classList.add('panning');
      const mv = (ev) => { this.vp.x = ox + (ev.clientX - sx); this.vp.y = oy + (ev.clientY - sy); this.applyViewport(); };
      const up = () => { canvas.classList.remove('panning'); document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });

    canvas.addEventListener('dblclick', (e) => { if (onEmpty(e.target)) this.fitView(); });
  }

  // frame all nodes within the canvas (never zooms in past 1:1). Runs after loading a patch.
  fitView() {
    const views = [...this.views.values()];
    if (!views.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const v of views) {
      const n = v.node, w = v.el.offsetWidth || 220, h = v.el.offsetHeight || 120;
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w); maxY = Math.max(maxY, n.y + h);
    }
    const r = this.canvasRect(), pad = 40;
    const z = Math.max(0.2, Math.min(1, (r.width - 2 * pad) / (maxX - minX), (r.height - 2 * pad) / (maxY - minY)));
    this.vp.z = z;
    this.vp.x = pad - minX * z;
    this.vp.y = pad - minY * z;
    this.applyViewport();
  }

  // reset pan/zoom to 1:1 at the origin
  resetView() { this.vp = { x: 0, y: 0, z: 1 }; this.applyViewport(); }

  // ---- graph model -> DOM ----
  // Handlers are kept as a set so they can be detached from one graph and attached to
  // another when descending into / out of a subpatch (see _mountGraph).
  _bindGraph() {
    this._graphHandlers = {
      'node:add': (n) => this._addView(n),
      'node:remove': (n) => { this.views.get(n.id)?.remove(); this.views.delete(n.id); },
      'node:move': (n) => { this.views.get(n.id)?.setPosition(n.x, n.y); this._redrawCablesFor(n.id); },
      'conn:add': (c) => this._drawCable(c),
      'conn:remove': (c) => { this.cables.get(c.id)?.remove(); this.cables.delete(c.id); },
      // let a node's render() react to a param edit (e.g. keyboard rebuilds its keys on oct/low-C)
      'param:change': ({ node, name, value }) => this.views.get(node.id)?._onParamChange?.(name, value),
      'graph:loaded': () => { this._redrawAllCables(); requestAnimationFrame(() => this.fitView()); },
    };
    this._attachGraph(this.graph);
  }

  _attachGraph(g) { for (const [e, fn] of Object.entries(this._graphHandlers)) g.on(e, fn); }
  _detachGraph(g) { for (const [e, fn] of Object.entries(this._graphHandlers)) g.off(e, fn); }

  // Swap which graph the view layer shows/edits. Tears down the current views/cables and
  // rebuilds them from `graph`. The engine is unaffected (it always runs the root graph).
  _mountGraph(graph) {
    this._detachGraph(this.graph);
    for (const v of this.views.values()) v.remove();
    this.views.clear();
    for (const p of this.cables.values()) p.remove();
    this.cables.clear();
    this.select(null);
    this.graph = graph;
    this._attachGraph(graph);
    for (const n of graph.nodes.values()) this._addView(n);
    this._redrawAllCables();
    requestAnimationFrame(() => this.fitView());
  }

  // ---- subpatch navigation ----
  get rootGraph() { return this.ctxStack[0].graph; }
  _activeFrame() { return this.ctxStack[this.ctxStack.length - 1]; }
  onNodeDblClick(node) { if (node.type === 'patcher') this.enterPatcher(node); }

  // Descend into a patcher. A file-referenced box (params.ref) is entered READ-ONLY: its inner
  // graph is shown for inspection but edits are neither wired back nor persisted (the source
  // file owns the definition). Use Detach to fork it into a private, editable inline copy.
  enterPatcher(node) {
    if (!node.params.patch) node.params.patch = { nodes: [], connections: [] };
    const readonly = isRef(node);
    const inner = new Graph();
    inner.loadJSON(node.params.patch);           // populate (no listeners attached yet)
    if (!readonly) {
      // mirror inner edits back into params.patch and rebuild the box's live audio
      const sync = () => this._syncSubpatch();
      for (const e of ['node:add', 'node:remove', 'node:move', 'conn:add', 'conn:remove', 'param:change']) inner.on(e, sync);
    }
    this.ctxStack.push({ graph: inner, patcher: node, readonly });
    this._mountGraph(inner);
    this._renderBreadcrumb();
    this._status(readonly
      ? `Referenced from ${node.params.ref} — read-only. Edit the source file + Reload to change all instances, or Detach to fork.`
      : `Editing subpatch: ${node.type}. Add inlet~/outlet~ objects to make ports. Breadcrumb ▸ to exit.`);
  }

  // Fork a referenced box into a private inline copy: drop params.ref (keeping the fetched patch),
  // then re-enter it as a normal editable subpatch. Audio is unchanged (same patch content).
  _detachPatcher() {
    const frame = this._activeFrame();
    const node = frame.patcher;
    if (!node || !isRef(node)) return;
    this._exitTo(this.ctxStack.length - 2);      // pop the read-only frame back to its parent
    delete node.params.ref;                      // params.patch stays as the now-private copy
    this.enterPatcher(node);                      // re-enter, now editable
    this._status('Detached — this box is a private inline copy now. Edits stay local to it.');
  }

  // Re-fetch every referenced abstraction on the ROOT graph and update all instances. Rebuilds
  // affected live runtimes and re-mounts so ports reflect the fetched definitions. Returns
  // { changed, errors }.
  async _resolveAbstractions() {
    const result = await resolveRefs(this.rootGraph);
    if (result.changed.length) {
      if (this.engine.started) for (const id of result.changed) this.engine.rebuildNode(id);
      this._mountGraph(this.graph);              // rebuild views so patcher ports re-derive
    }
    return result;
  }

  // Re-serialize the edited chain into each ancestor patcher's params.patch, then rebuild
  // the top-level ancestor patcher's runtime (debounced) so edits are heard.
  _syncSubpatch() {
    for (let i = this.ctxStack.length - 1; i >= 1; i--) {
      this.ctxStack[i].patcher.params.patch = this.ctxStack[i].graph.toJSON();
    }
    const top = this.ctxStack[1]?.patcher;
    if (top && this.engine.started) {
      clearTimeout(this._rebuildT);
      this._rebuildT = setTimeout(() => this.engine.rebuildNode(top.id), 150);
    }
  }

  _exitTo(depth) {
    if (depth < 0 || depth >= this.ctxStack.length) return;
    if (depth === this.ctxStack.length - 1) return; // already showing this level
    this._syncSubpatch();
    this.ctxStack.length = depth + 1;
    this._mountGraph(this.ctxStack[depth].graph);
    this._renderBreadcrumb();
  }

  _buildBreadcrumb() {
    const bc = document.createElement('div');
    bc.className = 'breadcrumb';
    bc.style.display = 'none';
    this.canvas.appendChild(bc);
    this._breadcrumb = bc;
  }

  _renderBreadcrumb() {
    const bc = this._breadcrumb;
    bc.innerHTML = '';
    this.ctxStack.forEach((frame, i) => {
      const seg = document.createElement('span');
      seg.className = 'bc-seg';
      seg.textContent = i === 0 ? 'root patch' : (frame.patcher.type || 'patcher');
      seg.addEventListener('click', () => this._exitTo(i));
      bc.appendChild(seg);
      if (i < this.ctxStack.length - 1) { const sep = document.createElement('span'); sep.className = 'bc-sep'; sep.textContent = '▸'; bc.appendChild(sep); }
    });
    bc.style.display = this.ctxStack.length > 1 ? 'flex' : 'none';
    this._renderRefBanner();
  }

  // read-only banner shown while inside a file-referenced patcher (with a Detach escape)
  _buildRefBanner() {
    const b = document.createElement('div');
    b.className = 'ref-banner';
    b.style.display = 'none';
    const msg = document.createElement('span'); msg.className = 'ref-msg';
    const btn = document.createElement('button'); btn.className = 'ref-detach'; btn.textContent = 'Detach to fork';
    btn.addEventListener('click', () => this._detachPatcher());
    b.appendChild(msg); b.appendChild(btn);
    this.canvas.appendChild(b);
    this._refBanner = b; this._refMsg = msg;
  }

  _renderRefBanner() {
    const frame = this._activeFrame();
    const ro = !!frame.readonly;
    this._refBanner.style.display = ro ? 'flex' : 'none';
    if (ro) this._refMsg.textContent = `Referenced from ${frame.patcher.params.ref} — read-only.`;
  }

  // guard for mutation actions while inside a read-only (referenced) subpatch
  _readonlyGuard() {
    if (this._activeFrame().readonly) {
      this._status('This subpatch is referenced (read-only). Detach to fork it, or edit the source file.');
      return true;
    }
    return false;
  }

  _addView(node) {
    const def = getDef(node.type);
    const view = new NodeView(node, def, this);
    this.views.set(node.id, view);
    this.nodesLayer.appendChild(view.el);
  }

  // ---- palette button (opens the same two-level menu as right-click) ----
  _buildPalette() {
    const btn = document.getElementById('palette-btn');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // stagger spawn positions (in world coords) so successive adds don't stack, and so
      // new nodes land inside the current view even when panned/zoomed
      const r = this.canvasRect();
      const w0 = this.screenToWorld(r.left + 60, r.top + 60);
      const x = w0.x + (this.spawnOffset % 6) * 30;
      const y = w0.y + (this.spawnOffset % 6) * 30 + Math.floor(this.spawnOffset / 6) * 20;
      this.spawnOffset++;
      const br = btn.getBoundingClientRect();
      this._openMenu(br.left, br.bottom + 4, { x, y });
    });
  }

  _openMenu(screenX, screenY, drop) {
    this._ctxDrop = drop;
    const m = this._ctxMenu;
    m.style.left = `${screenX}px`;
    m.style.top = `${screenY}px`;
    m.classList.remove('hidden');
  }

  // ---- right-click context menu (two-level: category -> objects) ----
  _buildContextMenu() {
    const menu = document.createElement('div');
    menu.className = 'ctxmenu hidden';
    for (const g of paletteGroups()) {
      const cat = document.createElement('div');
      cat.className = 'cat-item';
      const label = document.createElement('span');
      label.textContent = g.category;
      const arrow = document.createElement('span');
      arrow.className = 'arrow'; arrow.textContent = '▸';
      cat.appendChild(label); cat.appendChild(arrow);
      const sub = document.createElement('div');
      sub.className = 'submenu';
      for (const it of g.items) {
        const obj = document.createElement('div');
        obj.className = 'obj-item';
        obj.textContent = it.title;
        obj.addEventListener('click', () => {
          this._hideContextMenu();
          if (this._readonlyGuard()) return;
          this.graph.addNode(it.type, this._ctxDrop.x, this._ctxDrop.y);
        });
        sub.appendChild(obj);
      }
      cat.appendChild(sub);
      menu.appendChild(cat);
    }
    document.body.appendChild(menu);
    this._ctxMenu = menu;

    // open on right-click anywhere in the canvas; drop the new node where you clicked
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // only on empty canvas / cables, not over a node box
      if (e.target.closest && e.target.closest('.node')) return;
      this._openMenu(e.clientX, e.clientY, this.screenToWorld(e.clientX, e.clientY));
    });
    // close on any click elsewhere or Escape
    document.addEventListener('mousedown', (e) => { if (!menu.contains(e.target)) this._hideContextMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this._hideContextMenu(); });
  }

  _hideContextMenu() { this._ctxMenu?.classList.add('hidden'); }

  // ---- toolbar ----
  _bindToolbar() {
    const Tone = window.Tone;
    const btnAudio = document.getElementById('btn-audio');
    const btnPlay = document.getElementById('btn-play');
    const btnStop = document.getElementById('btn-stop');

    const applyMaster = () => {
      const v = parseFloat(document.getElementById('master').value);
      Tone.getDestination().volume.value = v <= 0.0001 ? -Infinity : Tone.gainToDb(v);
    };
    const applyBpm = () => { Tone.getTransport().bpm.value = parseFloat(document.getElementById('bpm').value) || 120; };

    btnAudio.addEventListener('click', async () => {
      await Tone.start();              // first user gesture unlocks the AudioContext
      await this.engine.start();       // async: compiles worklet DSP modules first
      applyBpm(); applyMaster();       // safe to touch the context now
      btnAudio.textContent = '♪ Audio On';
      btnAudio.classList.add('on');
      btnPlay.disabled = false; btnStop.disabled = false;
      this._status('Audio running. Add objects, wire outlets→inlets. Press Play for sequencers/LFOs.');
    });

    btnPlay.addEventListener('click', () => { this.engine.transportStart(); this._status('Transport playing.'); });
    btnStop.addEventListener('click', () => { this.engine.transportStop(); this._status('Transport stopped.'); });

    // BPM/master inputs only touch the context once audio has started (avoids the
    // "AudioContext was not allowed to start" warning before the first gesture).
    document.getElementById('bpm').addEventListener('input', () => { if (this.engine.started) applyBpm(); });
    document.getElementById('master').addEventListener('input', () => { if (this.engine.started) applyMaster(); });

    // Save/Load/Clear act on the ROOT patch; exit any open subpatch first so we never
    // serialize or wipe just the inner graph by accident.
    document.getElementById('btn-encap').addEventListener('click', () => this.encapsulateSelection());
    document.getElementById('btn-insert-abs').addEventListener('click', () => this.insertAbstraction());
    document.getElementById('btn-save-abs').addEventListener('click', () => this.saveAsAbstraction());
    document.getElementById('btn-reload').addEventListener('click', () => this.reloadAbstractions());
    document.getElementById('btn-save').addEventListener('click', () => { this._exitTo(0); saveToFile(this.graph); });
    document.getElementById('btn-load').addEventListener('click', () => document.getElementById('file-input').click());
    document.getElementById('file-input').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (f) { this._exitTo(0); await loadFromFile(this.graph, f); await this._resolveAbstractions(); this._status(`Loaded ${f.name}.`); }
      e.target.value = '';
    });
    document.getElementById('btn-clear').addEventListener('click', () => {
      if (confirm('Clear the whole patch?')) { this._exitTo(0); this.graph.clear(); }
    });

    // Demo menu: replace toolbar button with a tiny dropdown of built-in patches
    const demoBtn = document.getElementById('btn-demo');
    demoBtn.addEventListener('click', () => {
      const keys = Object.keys(DEMOS);
      const choice = prompt(`Load demo patch:\n${keys.map((k, i) => `${i + 1}. ${DEMOS[k].name}`).join('\n')}\n\nEnter number:`);
      const i = parseInt(choice, 10) - 1;
      if (i >= 0 && i < keys.length) this.loadDemo(keys[i]);
    });
  }

  _bindGlobalKeys() {
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'e' || e.key === 'E') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this.encapsulateSelection(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.selection.size) {
        if (this._readonlyGuard()) return;
        for (const v of [...this.selection]) this.graph.removeNode(v.node.id);
        this.selection.clear();
      }
    });
    // click empty canvas clears the selection — but shift+empty starts a rubber-band, so keep it
    this.canvas.addEventListener('mousedown', (e) => {
      if ((e.target === this.canvas || e.target === this.svg || e.target === this.nodesLayer) && !e.shiftKey) this.select(null);
    });
  }

  // ---- selection (a Set of views; supports single + multi-select) ----
  select(view) {                    // select ONLY this view (or clear when null)
    this.clearSelection();
    if (view) { this.selection.add(view); view.setSelected(true); }
  }
  toggleSelect(view) {              // shift-click: add/remove from the selection
    if (this.selection.has(view)) { this.selection.delete(view); view.setSelected(false); }
    else { this.selection.add(view); view.setSelected(true); }
  }
  clearSelection() {
    for (const v of this.selection) v.setSelected(false);
    this.selection.clear();
  }
  isSelected(view) { return this.selection.has(view); }

  // collapse the current selection into a single patcher (Cmd/Ctrl+E or the toolbar button)
  encapsulateSelection() {
    if (this._readonlyGuard()) return;
    if (this.selection.size < 1) { this._status('Select one or more objects first (shift-click or shift-drag), then Encapsulate.'); return; }
    const ids = [...this.selection].map((v) => v.node.id);
    this.clearSelection();
    const box = encapsulate(this.graph, ids);   // runs on the mounted graph; views repaint via events
    const bv = box && this.views.get(box.id);
    if (bv) this.select(bv);
    this._status('Encapsulated into a patcher. Double-click it to edit inside.');
  }

  // ---- file-referenced abstractions (Phase 3.4) ----
  // Insert a patcher that references a saved .json abstraction file (fetched, then shared by ref).
  async insertAbstraction() {
    this._exitTo(0);
    const ref = prompt('Abstraction file path (under the served tree):', 'patches/abstractions/');
    if (!ref || ref.trim().endsWith('/')) return;
    const r = this.canvasRect();
    const c = this.screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
    const box = this.graph.addNode('patcher', Math.round(c.x), Math.round(c.y), { ref: ref.trim() });
    const { errors } = await this._resolveAbstractions();
    if (errors.length) { this.graph.removeNode(box.id); this._status(`Insert failed — ${errors.join('; ')}`); return; }
    this._status(`Inserted abstraction ${ref.trim()}. Double-click to view (read-only); Reload to pick up edits.`);
  }

  // Download the current subpatch as a reusable abstraction .json (must be inside a patcher).
  saveAsAbstraction() {
    if (this.ctxStack.length < 2) { this._status('Enter a patcher (double-click one) first, then Save as abstraction.'); return; }
    this._syncSubpatch();
    const frame = this._activeFrame();
    const name = (prompt('Save this subpatch as abstraction file name:', 'abstraction') || '').trim();
    if (!name) return;
    saveToFile(frame.graph, `${name}.json`);
    this._status(`Downloaded ${name}.json — move it into patches/abstractions/, then use "Insert abstraction".`);
  }

  // Re-fetch every referenced abstraction and propagate edits to all instances.
  async reloadAbstractions() {
    this._exitTo(0);
    const { changed, errors } = await this._resolveAbstractions();
    this._status(errors.length
      ? `Reload: ${errors.length} error(s) — ${errors.join('; ')}`
      : `Reloaded ${changed.length} referenced abstraction(s).`);
  }

  // shift+drag on empty canvas: draw a rubber-band and add every intersecting node to the selection
  _startRubberBand(e) {
    const r = this.canvasRect();
    const x0 = e.clientX, y0 = e.clientY;
    const box = document.createElement('div');
    box.className = 'rubber';
    this.canvas.appendChild(box);
    const draw = (ev) => {
      const x = Math.min(x0, ev.clientX), y = Math.min(y0, ev.clientY);
      box.style.left = `${x - r.left}px`; box.style.top = `${y - r.top}px`;
      box.style.width = `${Math.abs(ev.clientX - x0)}px`; box.style.height = `${Math.abs(ev.clientY - y0)}px`;
    };
    const up = (ev) => {
      document.removeEventListener('mousemove', draw);
      document.removeEventListener('mouseup', up);
      box.remove();
      const rb = { left: Math.min(x0, ev.clientX), top: Math.min(y0, ev.clientY), right: Math.max(x0, ev.clientX), bottom: Math.max(y0, ev.clientY) };
      for (const v of this.views.values()) {
        const b = v.el.getBoundingClientRect();
        if (b.left < rb.right && b.right > rb.left && b.top < rb.bottom && b.bottom > rb.top) { this.selection.add(v); v.setSelected(true); }
      }
    };
    draw(e);
    document.addEventListener('mousemove', draw);
    document.addEventListener('mouseup', up);
  }

  // ---- node move ----
  onNodeMove(id, x, y) { this.graph.moveNode(id, Math.max(0, x), Math.max(0, y)); }

  // ---- param change ----
  onParamChange(id, name, value) { this.graph.setParam(id, name, value); }

  // ---- bang / message UI triggers ----
  fireBang(id) { this.engine.runtimes.get(id)?.bang?.(); }
  fireMessage(id) { this.engine.runtimes.get(id)?.send?.(); }
  fireNoteOn(id, midi) {
    this.engine.unmute(); // keyboard always sounds, even when transport is stopped
    this.engine.runtimes.get(id)?.noteOn?.(midi);
  }
  fireNoteOff(id, midi) { this.engine.runtimes.get(id)?.noteOff?.(midi); }
  fireNote(id, midi) {
    this.engine.unmute(); // keyboard always sounds, even when transport is stopped
    this.engine.runtimes.get(id)?.playNote?.(midi);
  }

  // ---- connections (drag to wire) ----
  startConnection(view, side, port, dot, e) {
    this.pending = { view, side, port };
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('class', 'temp');
    this.svg.appendChild(path);
    this._tempPath = path;
    const move = (ev) => {
      const r = this.canvasRect();
      const a = view.portCenter(side, port.name);
      const b = { x: ev.clientX - r.left, y: ev.clientY - r.top };
      path.setAttribute('d', this._bezier(a, b));
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      this._cancelPending();
    };
    this._pendingCleanup = up;
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    move(e);
  }

  completeConnection(view, side, port) {
    const p = this.pending;
    if (!p) return;
    if (this._readonlyGuard()) return this._cancelPending();
    // must connect an outlet to an inlet
    if (p.side === side) return this._cancelPending();
    if (p.port.kind !== port.kind) { this._status('Cannot connect audio to control.'); return this._cancelPending(); }
    const out = side === 'out' ? { view, port } : { view: p.view, port: p.port };
    const inn = side === 'in' ? { view, port } : { view: p.view, port: p.port };
    this.graph.addConnection(
      { nodeId: out.view.node.id, port: out.port.name },
      { nodeId: inn.view.node.id, port: inn.port.name },
      out.port.kind,
    );
    this._cancelPending();
  }

  _cancelPending() {
    this.pending = null;
    if (this._tempPath) { this._tempPath.remove(); this._tempPath = null; }
    if (this._pendingCleanup) {
      document.removeEventListener('mouseup', this._pendingCleanup);
      this._pendingCleanup = null;
    }
  }

  // ---- cable rendering ----
  _bezier(a, b) {
    const dy = Math.max(30, Math.abs(b.y - a.y) * 0.5);
    return `M ${a.x} ${a.y} C ${a.x} ${a.y + dy}, ${b.x} ${b.y - dy}, ${b.x} ${b.y}`;
  }

  _drawCable(c) {
    const fromView = this.views.get(c.from.nodeId);
    const toView = this.views.get(c.to.nodeId);
    if (!fromView || !toView) return;
    const a = fromView.portCenter('out', c.from.port);
    const b = toView.portCenter('in', c.to.port);
    if (!a || !b) return;
    let group = this.cables.get(c.id);
    if (!group) {
      group = document.createElementNS(SVGNS, 'g');
      const hit = document.createElementNS(SVGNS, 'path');   // wide, invisible, easy to click
      hit.setAttribute('class', 'hit');
      const vis = document.createElementNS(SVGNS, 'path');   // thin, visible
      vis.setAttribute('class', `cable ${c.kind}`);
      const del = (e) => { e.preventDefault(); this.graph.removeConnection(c.id); };
      hit.addEventListener('click', del);
      // hovering the hit area turns the visible cable red to signal "click to delete"
      hit.addEventListener('mouseenter', () => vis.classList.add('hot'));
      hit.addEventListener('mouseleave', () => vis.classList.remove('hot'));
      group.appendChild(hit); group.appendChild(vis);
      this.svg.appendChild(group);
      this.cables.set(c.id, group);
    }
    const d = this._bezier(a, b);
    group.children[0].setAttribute('d', d);
    group.children[1].setAttribute('d', d);
  }

  _redrawCablesFor(nodeId) {
    for (const c of this.graph.connections.values()) {
      if (c.from.nodeId === nodeId || c.to.nodeId === nodeId) this._drawCable(c);
    }
  }

  _redrawAllCables() {
    // views are created synchronously on load; redraw on next frame so layout is settled
    requestAnimationFrame(() => { for (const c of this.graph.connections.values()) this._drawCable(c); });
  }

  // load a built-in demo by key (used by the Demo button and the test harness)
  loadDemo(key) {
    if (!DEMOS[key]) return false;
    this._exitTo(0);
    this.graph.loadJSON(structuredClone(DEMOS[key].patch));
    this._status(`Loaded demo: ${DEMOS[key].name}. Click Start Audio, then Play.`);
    return true;
  }

  // peak output level in dB (tapped off the engine master). Used to verify headlessly
  // that a patch actually produces sound.
  masterLevel() { return this.engine.level(); }

  _status(msg) { document.getElementById('status-msg').textContent = msg; }
}

window.addEventListener('DOMContentLoaded', () => { window.editor = new Editor(); });
