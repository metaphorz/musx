// expr.js — tiny safe math-expression parser/evaluator (recursive descent).
// Compiles a string like "sin(2*pi*t) + 0.3*saw(t)" into a function (scope) => Number.
// No eval/Function on user input — fully sandboxed to the whitelist below.

const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  exp: Math.exp, log: Math.log, ln: Math.log, log10: Math.log10, log2: Math.log2,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
  min: Math.min, max: Math.max, pow: Math.pow,
  mod: (a, b) => ((a % b) + b) % b,
  // handy non-sinusoidal oscillator shapes over phase 0..1
  saw: (t) => 2 * (t - Math.floor(t + 0.5)),
  square: (t) => (t - Math.floor(t) < 0.5 ? 1 : -1),
  tri: (t) => 2 * Math.abs(2 * (t - Math.floor(t + 0.5))) - 1,
  pulse: (t, w = 0.5) => (t - Math.floor(t) < w ? 1 : -1),
};

const CONSTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

function tokenize(src) {
  const tokens = [];
  const re = /\s*([A-Za-z_]\w*|\d*\.?\d+(?:[eE][+-]?\d+)?|[()+\-*/^,])/y;
  let m, last = 0;
  while ((m = re.exec(src))) {
    tokens.push(m[1]);
    last = re.lastIndex;
  }
  if (last !== src.length) {
    const bad = src.slice(last).trim();
    if (bad) throw new Error(`Unexpected "${bad}"`);
  }
  return tokens;
}

// Parse tokens -> AST. Grammar: expr -> term (('+'|'-') term)*; term -> power; etc.
function parse(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const expect = (t) => { if (next() !== t) throw new Error(`Expected "${t}"`); };

  function parseExpr() {
    let node = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      node = { op, l: node, r: parseTerm() };
    }
    return node;
  }
  function parseTerm() {
    let node = parseUnary();
    while (peek() === '*' || peek() === '/') {
      const op = next();
      node = { op, l: node, r: parseUnary() };
    }
    return node;
  }
  // Unary minus binds looser than ^ (so "-3^2" == "-(3^2)"), matching math convention.
  function parseUnary() {
    if (peek() === '-') { next(); return { op: 'neg', l: parseUnary() }; }
    if (peek() === '+') { next(); return parseUnary(); }
    return parsePower();
  }
  // Right-associative power; exponent may itself be unary ("2^-3").
  function parsePower() {
    const base = parsePrimary();
    if (peek() === '^') {
      next();
      return { op: '^', l: base, r: parseUnary() };
    }
    return base;
  }
  function parsePrimary() {
    const t = peek();
    if (t === '(') { next(); const e = parseExpr(); expect(')'); return e; }
    if (t === undefined) throw new Error('Unexpected end of expression');
    if (/^[A-Za-z_]/.test(t)) {
      next();
      if (peek() === '(') { // function call
        next();
        const args = [];
        if (peek() !== ')') {
          args.push(parseExpr());
          while (peek() === ',') { next(); args.push(parseExpr()); }
        }
        expect(')');
        if (!FUNCS[t]) throw new Error(`Unknown function "${t}"`);
        return { call: t, args };
      }
      return { name: t }; // variable or constant
    }
    if (/^[\d.]/.test(t)) { next(); return { num: parseFloat(t) }; }
    throw new Error(`Unexpected token "${t}"`);
  }

  const ast = parseExpr();
  if (i !== tokens.length) throw new Error(`Unexpected "${tokens[i]}"`);
  return ast;
}

function evalNode(node, scope) {
  if ('num' in node) return node.num;
  if ('name' in node) {
    if (node.name in scope) return scope[node.name];
    if (node.name in CONSTS) return CONSTS[node.name];
    throw new Error(`Unknown variable "${node.name}"`);
  }
  if ('call' in node) return FUNCS[node.call](...node.args.map((a) => evalNode(a, scope)));
  switch (node.op) {
    case '+': return evalNode(node.l, scope) + evalNode(node.r, scope);
    case '-': return evalNode(node.l, scope) - evalNode(node.r, scope);
    case '*': return evalNode(node.l, scope) * evalNode(node.r, scope);
    case '/': return evalNode(node.l, scope) / evalNode(node.r, scope);
    case '^': return Math.pow(evalNode(node.l, scope), evalNode(node.r, scope));
    case 'neg': return -evalNode(node.l, scope);
  }
  throw new Error('Bad node');
}

// Public API: compile(src) -> { fn(scope), error }
export function compile(src) {
  try {
    const ast = parse(tokenize(src));
    const fn = (scope) => {
      const v = evalNode(ast, scope);
      return Number.isFinite(v) ? v : 0;
    };
    return { fn, error: null };
  } catch (e) {
    return { fn: null, error: e.message };
  }
}

export const KNOWN_FUNCS = Object.keys(FUNCS);
