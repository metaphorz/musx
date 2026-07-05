// Graph.js — the patch data model. Pure data + change events. Knows nothing about audio.

let _id = 0;
const uid = (p) => `${p}${++_id}`;

export class Graph {
  constructor() {
    this.nodes = new Map();        // id -> { id, type, x, y, params }
    this.connections = new Map();  // id -> { id, from:{nodeId,port}, to:{nodeId,port}, kind }
    this._listeners = {};
  }

  // --- tiny event emitter ---
  on(evt, fn) { (this._listeners[evt] ||= []).push(fn); return this; }
  emit(evt, payload) { (this._listeners[evt] || []).forEach((fn) => fn(payload)); }

  // --- nodes ---
  addNode(type, x, y, params = {}, id = null) {
    const node = { id: id || uid('n'), type, x, y, params: { ...params } };
    this.nodes.set(node.id, node);
    this.emit('node:add', node);
    return node;
  }

  removeNode(id) {
    // remove attached connections first
    for (const c of [...this.connections.values()]) {
      if (c.from.nodeId === id || c.to.nodeId === id) this.removeConnection(c.id);
    }
    const node = this.nodes.get(id);
    if (node) { this.nodes.delete(id); this.emit('node:remove', node); }
  }

  moveNode(id, x, y) {
    const node = this.nodes.get(id);
    if (!node) return;
    node.x = x; node.y = y;
    this.emit('node:move', node);
  }

  setParam(id, name, value) {
    const node = this.nodes.get(id);
    if (!node) return;
    node.params[name] = value;
    this.emit('param:change', { node, name, value });
  }

  // --- connections ---
  // from/to are { nodeId, port }. kind is 'audio' | 'control'.
  addConnection(from, to, kind) {
    // no duplicates, no self-loops on same port
    for (const c of this.connections.values()) {
      if (c.from.nodeId === from.nodeId && c.from.port === from.port &&
          c.to.nodeId === to.nodeId && c.to.port === to.port) return null;
    }
    const conn = { id: uid('c'), from, to, kind };
    this.connections.set(conn.id, conn);
    this.emit('conn:add', conn);
    return conn;
  }

  removeConnection(id) {
    const conn = this.connections.get(id);
    if (conn) { this.connections.delete(id); this.emit('conn:remove', conn); }
  }

  clear() {
    for (const id of [...this.connections.keys()]) this.removeConnection(id);
    for (const id of [...this.nodes.keys()]) this.removeNode(id);
  }

  // --- serialization ---
  toJSON() {
    return {
      version: 1,
      nodes: [...this.nodes.values()].map((n) => ({
        id: n.id, type: n.type, x: n.x, y: n.y, params: n.params,
      })),
      connections: [...this.connections.values()].map((c) => ({
        from: c.from, to: c.to, kind: c.kind,
      })),
    };
  }

  loadJSON(data) {
    this.clear();
    let max = 0;
    for (const n of data.nodes || []) {
      this.addNode(n.type, n.x, n.y, n.params || {}, n.id);
      const num = parseInt(String(n.id).replace(/\D/g, ''), 10);
      if (num > max) max = num;
    }
    _id = Math.max(_id, max); // keep new ids unique
    for (const c of data.connections || []) {
      this.addConnection(c.from, c.to, c.kind);
    }
    this.emit('graph:loaded', this);
  }
}
