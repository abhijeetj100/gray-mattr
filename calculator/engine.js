/*
 * Scientific calculator engine.
 *
 * A small recursive-descent parser that evaluates an expression string.
 * Works in the browser (window.SciCalc) and in Node (require).
 *
 * Grammar (lowest to highest precedence):
 *   expr    := term (('+' | '-') term)*
 *   term    := word (('*' | '/' | <implicit multiplication>) word)*
 *   word    := unary (('mod' | 'nPr' | 'nCr' | 'root') unary)*
 *   unary   := ('-' | '+') unary | power
 *   power   := postfix ('^' unary)?           (right associative)
 *   postfix := primary ('!' | '%')*
 *   primary := number | constant | function '(' expr ')' | '(' expr ')'
 *
 * Unclosed parentheses at the end of the input are closed automatically,
 * like on a physical calculator.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SciCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- errors

  const MSG = {
    DIV_ZERO: 'Cannot divide by zero',
    DOMAIN: 'Invalid input',
    OVERFLOW: 'Overflow',
    SYNTAX: 'Syntax error',
    UNDEFINED: 'Undefined',
  };

  class CalcError extends Error {
    constructor(message) {
      super(message);
      this.name = 'CalcError';
    }
  }

  const fail = (message) => {
    throw new CalcError(message);
  };

  // --------------------------------------------------------------- helpers

  /** Round away binary floating point noise (0.1 + 0.2 -> 0.3). */
  function clean(x) {
    if (!Number.isFinite(x) || x === 0) return x === 0 ? 0 : x;
    return Number(x.toPrecision(14));
  }

  /** Make sure a computed value is a usable number. */
  function check(x) {
    if (Number.isNaN(x)) fail(MSG.DOMAIN);
    if (!Number.isFinite(x)) fail(MSG.OVERFLOW);
    return x === 0 ? 0 : x; // normalise -0
  }

  const tiny = (x) => (Math.abs(x) < 1e-15 ? 0 : x);
  const isInt = (x) => Number.isInteger(x);

  // ----------------------------------------------------------- trigonometry

  // Angles are reduced to degrees so multiples of 90 are exact in DEG/GRAD.
  function toDegrees(x, mode) {
    return mode === 'grad' ? (x * 9) / 10 : x;
  }

  function sin(x, mode) {
    if (mode === 'rad') return tiny(Math.sin(x));
    const d = (((toDegrees(x, mode) % 360) + 360) % 360);
    if (d === 0 || d === 180) return 0;
    if (d === 90) return 1;
    if (d === 270) return -1;
    return Math.sin((d * Math.PI) / 180);
  }

  function cos(x, mode) {
    if (mode === 'rad') return tiny(Math.cos(x));
    const d = (((toDegrees(x, mode) % 360) + 360) % 360);
    if (d === 90 || d === 270) return 0;
    if (d === 0) return 1;
    if (d === 180) return -1;
    return Math.cos((d * Math.PI) / 180);
  }

  function tan(x, mode) {
    const c = cos(x, mode);
    if (Math.abs(c) < 1e-15) fail(MSG.UNDEFINED);
    return sin(x, mode) / c;
  }

  /** Convert a result in radians to the active angle unit. */
  function fromRadians(r, mode) {
    if (mode === 'deg') return (r * 180) / Math.PI;
    if (mode === 'grad') return (r * 200) / Math.PI;
    return r;
  }

  const inUnit = (x) => Math.abs(x) <= 1 + 1e-12;
  const clampUnit = (x) => Math.max(-1, Math.min(1, x));

  // ---------------------------------------------------- factorial and gamma

  const LANCZOS = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];

  function gamma(z) {
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    z -= 1;
    let a = LANCZOS[0];
    const t = z + 7.5;
    for (let i = 1; i < 9; i++) a += LANCZOS[i] / (z + i);
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * a;
  }

  function factorial(x) {
    if (x < 0) fail(MSG.DOMAIN);
    if (x > 170.6) fail(MSG.OVERFLOW);
    if (isInt(x)) {
      let r = 1;
      for (let i = 2; i <= x; i++) r *= i;
      return r;
    }
    return gamma(x + 1); // non-integers use the gamma function
  }

  function requireCounts(n, r) {
    if (!isInt(n) || !isInt(r) || n < 0 || r < 0 || r > n) fail(MSG.DOMAIN);
  }

  function permutations(n, r) {
    requireCounts(n, r);
    if (r > 170) fail(MSG.OVERFLOW);
    let result = 1;
    for (let i = 0; i < r; i++) result *= n - i;
    return result;
  }

  function combinations(n, r) {
    requireCounts(n, r);
    r = Math.min(r, n - r);
    if (r > 1100) fail(MSG.OVERFLOW);
    let result = 1;
    for (let i = 1; i <= r; i++) {
      result = (result * (n - r + i)) / i;
      if (!Number.isFinite(result)) fail(MSG.OVERFLOW);
    }
    return Math.round(result);
  }

  // ------------------------------------------------------------- arithmetic

  function divide(a, b) {
    if (b === 0) fail(MSG.DIV_ZERO);
    return a / b;
  }

  function modulo(a, b) {
    if (b === 0) fail(MSG.DIV_ZERO);
    return clean(((a % b) + b) % b); // result takes the sign of the divisor
  }

  function power(a, b) {
    if (a === 0 && b === 0) fail(MSG.UNDEFINED);
    if (a === 0 && b < 0) fail(MSG.DIV_ZERO);
    if (a < 0 && !isInt(b)) {
      // Real result only for odd roots, e.g. (-8)^(1/3).
      const inv = 1 / b;
      const odd = Math.round(inv);
      if (Math.abs(inv - odd) < 1e-9 && Math.abs(odd) % 2 === 1) {
        return -Math.pow(-a, b);
      }
      fail(MSG.DOMAIN);
    }
    return Math.pow(a, b);
  }

  /** n-th root of x. */
  function nthRoot(n, x) {
    if (n === 0) fail(MSG.DOMAIN);
    if (x < 0) {
      if (isInt(n) && Math.abs(n) % 2 === 1) return -Math.pow(-x, 1 / n);
      fail(MSG.DOMAIN);
    }
    if (x === 0 && n < 0) fail(MSG.DIV_ZERO);
    return Math.pow(x, 1 / n);
  }

  // -------------------------------------------------------------- functions

  const FUNCTIONS = {
    sin: (x, c) => sin(x, c.angle),
    cos: (x, c) => cos(x, c.angle),
    tan: (x, c) => tan(x, c.angle),
    asin: (x, c) => (inUnit(x) ? fromRadians(Math.asin(clampUnit(x)), c.angle) : fail(MSG.DOMAIN)),
    acos: (x, c) => (inUnit(x) ? fromRadians(Math.acos(clampUnit(x)), c.angle) : fail(MSG.DOMAIN)),
    atan: (x, c) => fromRadians(Math.atan(x), c.angle),
    sinh: (x) => Math.sinh(x),
    cosh: (x) => Math.cosh(x),
    tanh: (x) => Math.tanh(x),
    asinh: (x) => Math.asinh(x),
    acosh: (x) => (x >= 1 ? Math.acosh(x) : fail(MSG.DOMAIN)),
    atanh: (x) => (Math.abs(x) < 1 ? Math.atanh(x) : fail(MSG.DOMAIN)),
    log: (x) => (x > 0 ? Math.log10(x) : fail(MSG.DOMAIN)),
    ln: (x) => (x > 0 ? Math.log(x) : fail(MSG.DOMAIN)),
    exp: (x) => Math.exp(x),
    sqrt: (x) => (x >= 0 ? Math.sqrt(x) : fail(MSG.DOMAIN)),
    cbrt: (x) => Math.cbrt(x),
    abs: (x) => Math.abs(x),
    floor: (x) => Math.floor(x),
    ceil: (x) => Math.ceil(x),
    round: (x) => Math.round(x),
    fact: (x) => factorial(x),
  };

  const CONSTANTS = {
    pi: () => Math.PI,
    e: () => Math.E,
    ans: (c) => c.ans,
    rand: () => Math.random(),
  };

  // Words that act as infix operators (higher precedence than * and /).
  const WORD_OPS = {
    mod: modulo,
    npr: permutations,
    ncr: combinations,
    root: nthRoot,
  };

  // ------------------------------------------------------------------ lexer

  function tokenize(input) {
    const tokens = [];
    const s = String(input);
    let i = 0;
    while (i < s.length) {
      const ch = s[i];

      if (/\s/.test(ch)) {
        i++;
      } else if (/[0-9.]/.test(ch)) {
        const m = /^(?:\d+\.?\d*|\.\d+)(?:E[+\-−]?\d+)?/.exec(s.slice(i));
        if (!m) fail(MSG.SYNTAX);
        const text = m[0].replace('−', '-');
        i += m[0].length;
        if (s[i] === '.') fail(MSG.SYNTAX); // e.g. 1.2.3
        tokens.push({ type: 'num', value: Number(text) });
      } else if (/[a-zA-Z]/.test(ch)) {
        const m = /^[a-zA-Z]+/.exec(s.slice(i));
        const name = m[0].toLowerCase();
        i += m[0].length;
        if (name in WORD_OPS) tokens.push({ type: 'op', value: name });
        else if (name in FUNCTIONS || name in CONSTANTS) tokens.push({ type: 'id', value: name });
        else fail(MSG.SYNTAX);
      } else if (ch === 'π') {
        tokens.push({ type: 'id', value: 'pi' });
        i++;
      } else if (ch === '√') {
        tokens.push({ type: 'id', value: 'sqrt' });
        i++;
      } else if (ch === '∛') {
        tokens.push({ type: 'id', value: 'cbrt' });
        i++;
      } else if (ch === '(' || ch === ')') {
        tokens.push({ type: ch });
        i++;
      } else if ('+-−–'.includes(ch)) {
        tokens.push({ type: 'op', value: ch === '+' ? '+' : '-' });
        i++;
      } else if ('*×·'.includes(ch)) {
        tokens.push({ type: 'op', value: '*' });
        i++;
      } else if ('/÷'.includes(ch)) {
        tokens.push({ type: 'op', value: '/' });
        i++;
      } else if (ch === '^' || ch === '!' || ch === '%') {
        tokens.push({ type: 'op', value: ch });
        i++;
      } else {
        fail(MSG.SYNTAX);
      }
    }
    return tokens;
  }

  // ----------------------------------------------------------------- parser

  function evaluate(input, options) {
    const opts = options || {};
    const ctx = {
      angle: opts.angle === 'rad' || opts.angle === 'grad' ? opts.angle : 'deg',
      ans: Number.isFinite(opts.ans) ? opts.ans : 0,
    };

    const tokens = tokenize(input);
    if (tokens.length === 0) fail(MSG.SYNTAX);
    let pos = 0;

    const peek = () => tokens[pos];
    const isOp = (t, ...values) => t !== undefined && t.type === 'op' && values.includes(t.value);

    function parseExpr() {
      let v = parseTerm();
      while (isOp(peek(), '+', '-')) {
        const op = tokens[pos++].value;
        const r = parseTerm();
        v = check(op === '+' ? v + r : v - r);
      }
      return v;
    }

    function startsPrimary(t) {
      return t !== undefined && (t.type === 'num' || t.type === 'id' || t.type === '(');
    }

    function parseTerm() {
      let v = parseWord();
      for (;;) {
        const t = peek();
        if (isOp(t, '*', '/')) {
          pos++;
          const r = parseWord();
          v = check(t.value === '*' ? v * r : divide(v, r));
        } else if (startsPrimary(t)) {
          v = check(v * parseWord()); // implicit multiplication: 2π, 3(4+1)
        } else {
          return v;
        }
      }
    }

    function parseWord() {
      let v = parseUnary();
      while (isOp(peek(), 'mod', 'npr', 'ncr', 'root')) {
        const op = tokens[pos++].value;
        const r = parseUnary();
        v = check(WORD_OPS[op](v, r));
      }
      return v;
    }

    function parseUnary() {
      const t = peek();
      if (isOp(t, '-')) {
        pos++;
        return -parseUnary();
      }
      if (isOp(t, '+')) {
        pos++;
        return parseUnary();
      }
      return parsePower();
    }

    function parsePower() {
      const base = parsePostfix();
      if (isOp(peek(), '^')) {
        pos++;
        return check(power(base, parseUnary()));
      }
      return base;
    }

    function parsePostfix() {
      let v = parsePrimary();
      for (;;) {
        const t = peek();
        if (isOp(t, '!')) {
          pos++;
          v = check(factorial(v));
        } else if (isOp(t, '%')) {
          pos++;
          v = v / 100;
        } else {
          return v;
        }
      }
    }

    function closeParen() {
      const t = peek();
      if (t === undefined) return; // auto-close at end of input
      if (t.type !== ')') fail(MSG.SYNTAX);
      pos++;
    }

    function parsePrimary() {
      const t = tokens[pos];
      if (t === undefined) fail(MSG.SYNTAX);

      if (t.type === 'num') {
        pos++;
        return t.value;
      }

      if (t.type === '(') {
        pos++;
        const v = parseExpr();
        closeParen();
        return v;
      }

      if (t.type === 'id') {
        pos++;
        if (t.value in CONSTANTS) return CONSTANTS[t.value](ctx);
        let arg;
        if (peek() !== undefined && peek().type === '(') {
          pos++;
          arg = parseExpr();
          closeParen();
        } else {
          arg = parseUnary(); // allows "√9" and "sin30"
        }
        return clean(check(FUNCTIONS[t.value](arg, ctx)));
      }

      return fail(MSG.SYNTAX);
    }

    let result;
    try {
      result = parseExpr();
    } catch (err) {
      if (err instanceof RangeError) fail(MSG.SYNTAX); // absurdly deep nesting
      throw err;
    }
    if (pos < tokens.length) fail(MSG.SYNTAX); // e.g. a stray ")"
    return clean(check(result));
  }

  // ------------------------------------------------------------- formatting

  /** Format a number for display, using up to `digits` significant digits. */
  function format(value, digits) {
    const d = digits || 12;
    if (value === 0 || Object.is(value, -0)) return '0';
    const abs = Math.abs(value);
    if (abs >= 1e12 || abs < 1e-6) {
      const [mant, exp] = value.toExponential(d - 1).split('e');
      const m = mant.includes('.') ? mant.replace(/0+$/, '').replace(/\.$/, '') : mant;
      return `${m}E${Number(exp)}`;
    }
    return String(Number(value.toPrecision(d)));
  }

  return { evaluate, format, tokenize, CalcError, MESSAGES: MSG };
});
