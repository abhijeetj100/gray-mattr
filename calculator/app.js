(function () {
  'use strict';

  const { evaluate, format, CalcError } = window.SciCalc;
  const $ = (selector) => document.querySelector(selector);

  const exprEl = $('#expr');
  const resultEl = $('#result');
  const angleBtn = $('#angle');
  const historyEl = $('#history');
  const historyList = $('#history-list');
  const toastEl = $('#toast');

  const STORAGE_KEY = 'sciCalc:v1';
  const ANGLES = ['deg', 'rad', 'grad'];
  const MAX_HISTORY = 50;

  // --------------------------------------------------------------- state

  const state = {
    angle: 'deg',
    second: false,
    hyp: false,
    memory: 0,
    hasMemory: false,
    ans: 0,
    history: [],
    theme: window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
    justEvaluated: false, // the display currently shows a finished result
  };

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (ANGLES.includes(saved.angle)) state.angle = saved.angle;
      if (Array.isArray(saved.history)) state.history = saved.history.slice(0, MAX_HISTORY);
      if (saved.theme === 'light' || saved.theme === 'dark') state.theme = saved.theme;
      if (Number.isFinite(saved.memory)) {
        state.memory = saved.memory;
        state.hasMemory = true;
      }
      if (Number.isFinite(saved.ans)) state.ans = saved.ans;
    } catch (_) { /* storage unavailable or corrupt: start fresh */ }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        angle: state.angle,
        history: state.history,
        theme: state.theme,
        memory: state.hasMemory ? state.memory : null,
        ans: state.ans,
      }));
    } catch (_) { /* ignore */ }
  }

  // ---------------------------------------------------------- key layout

  /** A key that inserts `ins` into the expression. `kind: 'op'` continues from the last answer. */
  const key = (label, ins, kind, alt, cls) => ({ label, ins, kind: kind || 'val', alt, cls: cls || 'fn' });
  const alt = (label, ins, kind) => ({ label, ins, kind: kind || 'val' });

  const SCI_KEYS = [
    { action: 'second', label: '2nd', cls: 'fn toggle' },
    { action: 'hyp', label: 'hyp', cls: 'fn toggle' },
    { trig: 'sin' }, { trig: 'cos' }, { trig: 'tan' },

    key('x²', '^2', 'op', alt('√x', '√(')),
    key('x³', '^3', 'op', alt('∛x', '∛(')),
    key('xʸ', '^', 'op', alt('ʸ√x', ' root ', 'op')),
    key('log', 'log(', 'val', alt('10ˣ', '10^(')),
    key('ln', 'ln(', 'val', alt('eˣ', 'e^(')),

    key('1/x', '^(−1)', 'op', alt('|x|', 'abs(')),
    key('n!', '!', 'op', alt('nCr', ' nCr ', 'op')),
    key('mod', ' mod ', 'op', alt('nPr', ' nPr ', 'op')),
    key('EXP', 'E', 'exp', alt('rand', 'rand')),
    key('%', '%', 'op'),

    key('π', 'π'),
    key('e', 'e'),
    key('Ans', 'Ans'),
    key('⌊x⌋', 'floor(', 'val', alt('⌈x⌉', 'ceil(')),
    key('(−)', '−'),
  ];

  const PAD_KEYS = [
    { action: 'clear', label: 'AC', cls: 'clear' },
    { action: 'back', label: '⌫', cls: 'fn', aria: 'Backspace' },
    key('(', '(', 'val'), key(')', ')', 'val'),
    ...['7', '8', '9'].map((d) => key(d, d, 'val', null, 'num')), key('÷', '÷', 'op', null, 'op'),
    ...['4', '5', '6'].map((d) => key(d, d, 'val', null, 'num')), key('×', '×', 'op', null, 'op'),
    ...['1', '2', '3'].map((d) => key(d, d, 'val', null, 'num')), key('−', '−', 'op', null, 'op'),
    key('0', '0', 'val', null, 'num'), key('.', '.', 'val', null, 'num'),
    { action: 'equals', label: '=', cls: 'eq' },
    key('+', '+', 'op', null, 'op'),
  ];

  /** Resolve what a key currently does given the 2nd / hyp toggles. */
  function resolve(def) {
    if (def.trig) {
      const name = (state.second ? 'a' : '') + def.trig + (state.hyp ? 'h' : '');
      return {
        label: def.trig + (state.hyp ? 'h' : '') + (state.second ? '⁻¹' : ''),
        ins: name + '(',
        kind: 'val',
        usedModifier: state.second || state.hyp,
      };
    }
    if (state.second && def.alt) return { ...def.alt, usedModifier: true };
    return def;
  }

  const buttons = []; // [{ el, def }]

  function renderKeys(container, defs) {
    for (const def of defs) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'key ' + (def.cls || 'fn');
      if (def.trig) el.className = 'key fn';
      if (def.aria) el.setAttribute('aria-label', def.aria);
      if (def.action === 'second' || def.action === 'hyp') el.setAttribute('aria-pressed', 'false');
      el.dataset.index = String(buttons.length);
      buttons.push({ el, def });
      container.appendChild(el);
    }
  }

  function refreshLabels() {
    for (const { el, def } of buttons) {
      if (def.action) {
        el.textContent = def.label;
        continue;
      }
      el.textContent = resolve(def).label;
    }
    for (const { el, def } of buttons) {
      if (def.action === 'second') el.setAttribute('aria-pressed', String(state.second));
      if (def.action === 'hyp') el.setAttribute('aria-pressed', String(state.hyp));
    }
    $('#ind-2nd').hidden = !state.second;
    $('#ind-hyp').hidden = !state.hyp;
    $('#ind-mem').hidden = !state.hasMemory;
    angleBtn.textContent = state.angle.toUpperCase();
  }

  // --------------------------------------------------------------- display

  function setResult(text, mode) {
    resultEl.textContent = text;
    resultEl.className = 'result' + (mode ? ' ' + mode : '');
  }

  function showError(err) {
    const message = err instanceof CalcError ? err.message : 'Error';
    setResult(message, 'error');
    // restart the shake animation
    void resultEl.offsetWidth;
    resultEl.classList.add('shake');
    state.justEvaluated = false;
  }

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => toastEl.classList.remove('show'), 1400);
  }

  /** Live preview of the result while typing. */
  function updatePreview() {
    const text = exprEl.value.trim();
    if (!text) return setResult('0');
    try {
      const out = format(evaluate(text, { angle: state.angle, ans: state.ans }));
      // Avoid echoing back exactly what was typed (e.g. a bare number).
      setResult(out === text ? '' : out);
    } catch (_) {
      setResult(''); // incomplete or invalid while typing; errors show on "="
    }
  }

  // ------------------------------------------------------------- editing

  /** Called before new input; continues from Ans or starts fresh after "=". */
  function beginInput(kind) {
    if (!state.justEvaluated) return;
    state.justEvaluated = false;
    exprEl.value = kind === 'op' ? answerText() : '';
  }

  /** The last answer written out as a number, so the expression shows the exact value being used. */
  function answerText() {
    const text = format(state.ans, 15).replace('-', '−');
    return state.ans < 0 ? `(${text})` : text;
  }

  function insert(text) {
    const start = exprEl.selectionStart ?? exprEl.value.length;
    const end = exprEl.selectionEnd ?? exprEl.value.length;
    exprEl.setRangeText(text, start, end, 'end');
    exprEl.focus({ preventScroll: true });
    updatePreview();
  }

  function insertExp() {
    const before = exprEl.value.slice(0, exprEl.selectionStart ?? exprEl.value.length);
    insert(/[0-9.]$/.test(before) ? 'E' : '1E');
  }

  function backspace() {
    state.justEvaluated = false;
    const start = exprEl.selectionStart;
    const end = exprEl.selectionEnd;
    if (start === end && start > 0) {
      exprEl.setRangeText('', start - 1, end, 'end');
    } else if (start !== end) {
      exprEl.setRangeText('', start, end, 'end');
    }
    exprEl.focus({ preventScroll: true });
    updatePreview();
  }

  function clearAll() {
    exprEl.value = '';
    state.justEvaluated = false;
    setResult('0');
    exprEl.focus({ preventScroll: true });
  }

  function calculate() {
    const text = exprEl.value.trim();
    if (!text) return;
    try {
      const value = evaluate(text, { angle: state.angle, ans: state.ans });
      const out = format(value);
      state.ans = value;
      state.history.unshift({ expr: text, result: out, value });
      state.history.length = Math.min(state.history.length, MAX_HISTORY);
      setResult(out, 'final');
      resultEl.dataset.value = out;
      state.justEvaluated = true;
      renderHistory();
      save();
    } catch (err) {
      showError(err);
    }
  }

  /** Value of the current expression, or the last answer when nothing is typed. */
  function currentValue() {
    const text = exprEl.value.trim();
    if (!text || state.justEvaluated) return state.ans;
    try {
      return evaluate(text, { angle: state.angle, ans: state.ans });
    } catch (err) {
      showError(err);
      return null;
    }
  }

  // --------------------------------------------------------------- memory

  function memory(action) {
    if (action === 'mc') {
      state.memory = 0;
      state.hasMemory = false;
    } else if (action === 'mr') {
      if (!state.hasMemory) return toast('Memory is empty');
      beginInput('val');
      insert(format(state.memory, 14));
      return;
    } else {
      const value = currentValue();
      if (value === null) return;
      if (action === 'ms') state.memory = value;
      else if (action === 'm+') state.memory += value;
      else if (action === 'm-') state.memory -= value;
      state.hasMemory = true;
      toast(`Memory: ${format(state.memory)}`);
    }
    refreshLabels();
    save();
  }

  // -------------------------------------------------------------- history

  function renderHistory() {
    historyList.textContent = '';
    if (state.history.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No calculations yet';
      historyList.appendChild(li);
      return;
    }
    state.history.forEach((item, index) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.index = String(index);
      const expr = document.createElement('span');
      expr.className = 'h-expr';
      expr.textContent = item.expr + ' =';
      const res = document.createElement('span');
      res.className = 'h-result';
      res.textContent = item.result;
      btn.append(expr, res);
      li.appendChild(btn);
      historyList.appendChild(li);
    });
  }

  function setHistoryOpen(open) {
    historyEl.hidden = !open;
    $('#history-toggle').setAttribute('aria-expanded', String(open));
  }

  // -------------------------------------------------------------- events

  function onKey(def) {
    if (def.action) {
      switch (def.action) {
        case 'second': state.second = !state.second; break;
        case 'hyp': state.hyp = !state.hyp; break;
        case 'clear': clearAll(); break;
        case 'back': backspace(); break;
        case 'equals': calculate(); break;
      }
      refreshLabels();
      return;
    }

    const active = resolve(def);
    beginInput(active.kind === 'op' ? 'op' : 'val');
    if (active.kind === 'exp') insertExp();
    else insert(active.ins);

    if (active.usedModifier) {
      state.second = false;
      state.hyp = false;
      refreshLabels();
    }
  }

  renderKeys($('#sci'), SCI_KEYS);
  renderKeys($('#pad'), PAD_KEYS);

  // Keep focus (and the caret) in the input when pressing keys with the mouse.
  document.querySelector('.calc').addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) e.preventDefault();
  });

  document.querySelector('.keys').addEventListener('click', (e) => {
    const btn = e.target.closest('button.key');
    if (btn) onKey(buttons[Number(btn.dataset.index)].def);
  });

  document.querySelector('.memory').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mem]');
    if (btn) memory(btn.dataset.mem);
  });

  angleBtn.addEventListener('click', () => {
    state.angle = ANGLES[(ANGLES.indexOf(state.angle) + 1) % ANGLES.length];
    refreshLabels();
    if (!state.justEvaluated) updatePreview();
    save();
  });

  exprEl.addEventListener('input', () => {
    state.justEvaluated = false;
    updatePreview();
  });

  exprEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      calculate();
    } else if (e.key === 'Escape') {
      clearAll();
    } else if (state.justEvaluated && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Typing after "=": operators continue from the answer, anything else starts fresh.
      beginInput('+-*/^×÷−%!'.includes(e.key) ? 'op' : 'val');
    }
  });

  resultEl.addEventListener('click', async () => {
    if (!resultEl.classList.contains('final')) return;
    try {
      await navigator.clipboard.writeText(resultEl.dataset.value);
      toast('Copied to clipboard');
    } catch (_) {
      toast('Could not copy');
    }
  });

  $('#history-toggle').addEventListener('click', () => setHistoryOpen(historyEl.hidden));
  $('#history-close').addEventListener('click', () => setHistoryOpen(false));
  $('#history-clear').addEventListener('click', () => {
    state.history = [];
    renderHistory();
    save();
  });

  historyList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-index]');
    if (!btn) return;
    const item = state.history[Number(btn.dataset.index)];
    exprEl.value = item.expr;
    state.justEvaluated = false;
    updatePreview();
    setHistoryOpen(false);
    exprEl.focus({ preventScroll: true });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !historyEl.hidden) setHistoryOpen(false);
  });

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
    document.querySelector('meta[name="theme-color"]').content = state.theme === 'dark' ? '#14122b' : '#eef0ff';
  }

  $('#theme-toggle').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    save();
  });

  // ---------------------------------------------------------------- init

  load();
  applyTheme();
  refreshLabels();
  renderHistory();
  exprEl.focus({ preventScroll: true });
})();
