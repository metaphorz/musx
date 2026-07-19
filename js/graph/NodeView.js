// NodeView.js — renders one node box: titlebar, ports (inlets top / outlets bottom),
// and parameter widgets. Reports drags/clicks back to the editor via callbacks.
import { hzToNote, midiToNote } from '../util/notes.js';

export class NodeView {
  constructor(node, def, editor) {
    this.node = node;
    this.def = def;
    this.editor = editor;
    this.el = document.createElement('div');
    this.el.className = 'node';
    this.el.dataset.id = node.id;
    this.inPorts = [];
    this.outPorts = [];
    this._build();
    this.setPosition(node.x, node.y);
  }

  _build() {
    const { def, node } = this;

    // title bar (drag handle). The name shows params.name if set, else the object type; it can be
    // renamed inline by double-clicking it (handy for `patcher` boxes -> "cathedral voice" etc.).
    const title = document.createElement('div');
    title.className = 'titlebar';
    const nameEl = document.createElement('span');
    nameEl.className = 'nodename';
    nameEl.textContent = node.params.name || def.title;
    const catEl = document.createElement('span');
    catEl.className = 'cat';
    catEl.textContent = def.category;
    title.append(nameEl, catEl);
    this.el.appendChild(title);
    this._dragHandle(title);
    this._enableRename(nameEl, def);

    // ports may be dynamic (a patcher derives them from its contents)
    const ports = def.ports ? def.ports(node) : { inlets: def.inlets, outlets: def.outlets };

    // inlet ports (top)
    this.el.appendChild(this._ports('in', ports.inlets));

    // body with widgets
    const body = document.createElement('div');
    body.className = 'body';
    this.body = body;
    this.el.appendChild(body);
    this._buildWidgets(body);
    if (def.render) def.render({ node, body, view: this, editor: this.editor });

    // outlet ports (bottom)
    this.el.appendChild(this._ports('out', ports.outlets));

    // resize grip for visual objects (xy pad, scope, plot, keyboard)
    if (def.resizable) this._addResizeGrip();

    // double-click descends into a subpatch (patcher); other nodes ignore it
    this.el.addEventListener('dblclick', (e) => { e.stopPropagation(); this.editor.onNodeDblClick?.(this.node); });
  }

  // Inline-rename the object: double-click the name to edit it, Enter/blur to commit, Escape to
  // cancel. An empty name (or the default type) clears the custom name. Stops propagation so it
  // never triggers the box's own double-click (which enters a patcher) or global key shortcuts.
  _enableRename(nameEl, def) {
    nameEl.addEventListener('mousedown', (e) => { if (nameEl.isContentEditable) e.stopPropagation(); });
    nameEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      nameEl.contentEditable = 'true'; nameEl.spellcheck = false; nameEl.focus();
      const r = document.createRange(); r.selectNodeContents(nameEl);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      const finish = (commit) => {
        nameEl.removeEventListener('blur', onBlur);
        nameEl.contentEditable = 'false';
        if (commit) {
          const txt = nameEl.textContent.trim();
          const val = (txt && txt !== def.title) ? txt : ''; // blank/default -> no custom name
          this.editor.onParamChange(this.node.id, 'name', val);
          nameEl.textContent = val || def.title;
        } else nameEl.textContent = this.node.params.name || def.title;
      };
      const onBlur = () => finish(true);
      nameEl.addEventListener('blur', onBlur);
      nameEl.addEventListener('keydown', (ke) => {
        ke.stopPropagation();                             // don't trigger delete/encapsulate etc.
        if (ke.key === 'Enter') { ke.preventDefault(); nameEl.blur(); }
        else if (ke.key === 'Escape') { ke.preventDefault(); finish(false); }
      });
    });
  }

  // Drag the corner grip to resize the node's visual element. Each resizable node sets
  // this._vizEl (the element to measure) and this._onResize(w,h) (how to apply the size).
  _addResizeGrip() {
    const grip = document.createElement('div');
    grip.className = 'resize-grip';
    this.el.appendChild(grip);
    grip.addEventListener('mousedown', (e) => {
      e.stopPropagation(); e.preventDefault();
      const el = this._vizEl; if (!el) return;
      const sw = el.clientWidth, sh = el.clientHeight, sx = e.clientX, sy = e.clientY;
      const z = this.editor.vp?.z || 1; // screen delta -> layout size scales by 1/zoom
      const mv = (ev) => {
        const w = Math.max(70, sw + (ev.clientX - sx) / z);
        const h = Math.max(50, sh + (ev.clientY - sy) / z);
        this._onResize?.(w, h);
        this.editor.onParamChange(this.node.id, 'w', w); // persist size in the patch
        this.editor.onParamChange(this.node.id, 'h', h);
        this.editor._redrawCablesFor(this.node.id);      // ports moved
      };
      const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });
  }

  _ports(side, list) {
    const row = document.createElement('div');
    row.className = `ports ${side}`;
    (list || []).forEach((p, idx) => {
      const dot = document.createElement('div');
      dot.className = `port ${p.kind}`;
      dot.dataset.port = p.name;
      dot.dataset.side = side;
      dot.dataset.index = idx;
      dot.innerHTML = `<span class="tip">${p.name}${p.kind === 'audio' ? ' ~' : ''}</span>`;
      dot.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.editor.startConnection(this, side, p, dot, e);
      });
      dot.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        this.editor.completeConnection(this, side, p, dot);
      });
      row.appendChild(dot);
      (side === 'in' ? this.inPorts : this.outPorts).push({ spec: p, dot });
    });
    return row;
  }

  _buildWidgets(body) {
    (this.def.params || []).forEach((spec) => {
      const value = this.node.params[spec.name] ?? spec.default;
      const row = document.createElement('div');
      row.className = 'widget';
      const set = (v) => this.editor.onParamChange(this.node.id, spec.name, v);

      if (spec.widget === 'select') {
        row.innerHTML = `<label>${spec.label || spec.name}</label>`;
        const sel = document.createElement('select');
        spec.options.forEach((o) => {
          const opt = document.createElement('option');
          opt.value = o; opt.textContent = o;
          if (o === value) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener('change', () => set(sel.value));
        row.appendChild(sel);
      } else if (spec.widget === 'number') {
        row.innerHTML = `<label>${spec.label || spec.name}</label>`;
        const inp = document.createElement('input');
        inp.type = 'number';
        if (spec.min != null) inp.min = spec.min;
        if (spec.max != null) inp.max = spec.max;
        inp.step = spec.step ?? 'any';
        inp.value = value;
        // optional note-name readout for frequency / MIDI fields (blank when not a note)
        let noteLbl = null;
        if (spec.note || spec.midinote) {
          noteLbl = document.createElement('span');
          noteLbl.className = 'notelbl';
          const upd = () => { noteLbl.textContent = spec.midinote ? midiToNote(parseFloat(inp.value)) : hzToNote(parseFloat(inp.value)); };
          inp.addEventListener('input', upd);
          upd();
        }
        inp.addEventListener('input', () => set(parseFloat(inp.value)));
        row.appendChild(inp);
        if (noteLbl) row.appendChild(noteLbl);
        (this._widgets ||= {})[spec.name] = { type: 'number', input: inp, note: noteLbl, spec };
      } else if (spec.widget === 'slider') {
        row.innerHTML = `<label>${spec.label || spec.name}</label>`;
        const inp = document.createElement('input');
        inp.type = 'range';
        inp.min = spec.min ?? 0; inp.max = spec.max ?? 1; inp.step = spec.step ?? 0.01;
        inp.value = value;
        const val = document.createElement('span');
        val.className = 'val'; val.textContent = (+value).toFixed(2);
        inp.addEventListener('input', () => { val.textContent = (+inp.value).toFixed(2); set(parseFloat(inp.value)); });
        row.appendChild(inp); row.appendChild(val);
        (this._widgets ||= {})[spec.name] = { type: 'slider', input: inp, val, spec };
      } else if (spec.widget === 'text') {
        row.style.flexDirection = 'column';
        row.style.alignItems = 'stretch';
        row.innerHTML = `<label>${spec.label || spec.name}</label>`;
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = value;
        inp.spellcheck = false;
        inp.addEventListener('change', () => set(inp.value));
        inp.addEventListener('keydown', (e) => e.stopPropagation()); // allow typing Delete etc.
        this._textInputs = (this._textInputs || {});
        this._textInputs[spec.name] = inp;
        row.appendChild(inp);
      } else if (spec.widget === 'readout') {
        const lab = document.createElement('label');
        lab.textContent = spec.label || spec.name;
        const out = document.createElement('span');
        out.className = 'val readout';
        out.dataset.name = spec.name;
        out.textContent = value ?? '—'; // textContent: never inject loaded-patch values as HTML
        row.appendChild(lab); row.appendChild(out);
      }
      body.appendChild(row);
    });
  }

  // update a readout widget (used by runtimes to show live values)
  setReadout(name, text) {
    const el = this.body.querySelector(`.readout[data-name="${name}"]`);
    if (el) el.textContent = text;
  }

  // reflect a live (modulated) value on a number/slider widget WITHOUT persisting it —
  // the widget shows the incoming modulation but the saved param keeps the user's set value.
  setWidgetValue(name, value) {
    const w = this._widgets?.[name];
    const num = +value;
    if (!w || !Number.isFinite(num)) return;
    w.input.value = num;
    if (w.val) w.val.textContent = num.toFixed(2);
    if (w.note) w.note.textContent = w.spec.midinote ? midiToNote(num) : hzToNote(num);
  }

  // flash a bang button briefly
  flashBang() {
    const b = this.el.querySelector('.bang-btn');
    if (!b) return;
    b.classList.add('flash');
    setTimeout(() => b.classList.remove('flash'), 90);
  }

  _dragHandle(handle) {
    let start = null, dragging = false;
    const down = (e) => {
      if (e.shiftKey) { this.editor.toggleSelect(this); return; }   // shift-click toggles membership, no drag
      dragging = true;
      if (!this.editor.isSelected(this)) this.editor.select(this);  // keep an existing multi-selection when dragging a member
      // work in world coords so dragging tracks the cursor 1:1 at any pan/zoom
      const w = this.editor.screenToWorld(e.clientX, e.clientY);
      start = { wx: w.x, wy: w.y, nx: this.node.x, ny: this.node.y };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
      e.preventDefault();
    };
    const move = (e) => {
      if (!dragging) return;
      const w = this.editor.screenToWorld(e.clientX, e.clientY);
      this.editor.onNodeMove(this.node.id, start.nx + (w.x - start.wx), start.ny + (w.y - start.wy));
    };
    const up = () => {
      dragging = false;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    handle.addEventListener('mousedown', down);
  }

  setPosition(x, y) {
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }

  setSelected(on) { this.el.classList.toggle('selected', on); }

  // center of a port in canvas coordinates
  portCenter(side, name) {
    const list = side === 'in' ? this.inPorts : this.outPorts;
    const p = list.find((q) => q.spec.name === name);
    if (!p) return null;
    const pr = p.dot.getBoundingClientRect();
    const cr = this.editor.canvasRect();
    return { x: pr.left + pr.width / 2 - cr.left, y: pr.top + pr.height / 2 - cr.top };
  }

  remove() { this.el.remove(); }
}
