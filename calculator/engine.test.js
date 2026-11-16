'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, format, MESSAGES } = require('./engine.js');

const calc = (expr, opts) => evaluate(expr, opts);
const near = (actual, expected, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${actual} is not close to ${expected}`);
const throwsMsg = (expr, message, opts) =>
  assert.throws(() => calc(expr, opts), (err) => err.name === 'CalcError' && err.message === message);

test('basic arithmetic and precedence', () => {
  assert.equal(calc('1+2*3'), 7);
  assert.equal(calc('(1+2)*3'), 9);
  assert.equal(calc('10-4-3'), 3);
  assert.equal(calc('2×3÷4'), 1.5);
  assert.equal(calc('7−2'), 5);
  assert.equal(calc('0.1+0.2'), 0.3);
  assert.equal(calc(' 12 / 4 '), 3);
});

test('unary minus and powers', () => {
  assert.equal(calc('-2^2'), -4);
  assert.equal(calc('(-2)^2'), 4);
  assert.equal(calc('2^-2'), 0.25);
  assert.equal(calc('2^3^2'), 512); // right associative
  assert.equal(calc('--5'), 5);
  assert.equal(calc('3*-2'), -6);
});

test('implicit multiplication', () => {
  assert.equal(calc('2(3+4)'), 14);
  assert.equal(calc('(1+1)(2+2)'), 8);
  near(calc('2π'), 2 * Math.PI);
  assert.equal(calc('2sin(90)'), 2);
  assert.equal(calc('5-3'), 2); // still subtraction
});

test('percent, factorial, mod', () => {
  assert.equal(calc('50%'), 0.5);
  assert.equal(calc('200*15%'), 30);
  assert.equal(calc('5!'), 120);
  assert.equal(calc('0!'), 1);
  assert.equal(calc('3!+1'), 7);
  assert.equal(calc('10 mod 3'), 1);
  assert.equal(calc('-7 mod 3'), 2);
  assert.equal(calc('5.5 mod 2'), 1.5);
  near(calc('0.5!'), Math.sqrt(Math.PI) / 2, 1e-12);
  assert.equal(calc('170!') > 1e306, true);
});

test('permutations, combinations, roots', () => {
  assert.equal(calc('5 nPr 2'), 20);
  assert.equal(calc('5 nCr 2'), 10);
  assert.equal(calc('52 nCr 5'), 2598960);
  assert.equal(calc('3 root 27'), 3);
  assert.equal(calc('3 root -27'), -3);
  assert.equal(calc('(-8)^(1/3)'), -2);
  assert.equal(calc('cbrt(-27)'), -3);
  assert.equal(calc('√16'), 4);
  assert.equal(calc('√(9+16)'), 5);
  assert.equal(calc('∛(8)'), 2);
});

test('trigonometry respects angle mode', () => {
  assert.equal(calc('sin(30)'), 0.5);
  assert.equal(calc('cos(60)'), 0.5);
  assert.equal(calc('sin(90)'), 1);
  assert.equal(calc('cos(90)'), 0);
  assert.equal(calc('sin(180)'), 0);
  assert.equal(calc('tan(45)'), 1);
  assert.equal(calc('sin(-30)'), -0.5);
  assert.equal(calc('sin(390)'), 0.5);
  assert.equal(calc('sin(π)', { angle: 'rad' }), 0);
  assert.equal(calc('cos(π)', { angle: 'rad' }), -1);
  assert.equal(calc('sin(π/6)', { angle: 'rad' }), 0.5);
  assert.equal(calc('sin(100)', { angle: 'grad' }), 1);
  assert.equal(calc('cos(200)', { angle: 'grad' }), -1);
});

test('inverse trigonometry returns angles in the active unit', () => {
  assert.equal(calc('asin(0.5)'), 30);
  assert.equal(calc('acos(0)'), 90);
  assert.equal(calc('atan(1)'), 45);
  near(calc('atan(1)', { angle: 'rad' }), Math.PI / 4);
  assert.equal(calc('atan(1)', { angle: 'grad' }), 50);
  assert.equal(calc('asin(1)'), 90);
});

test('hyperbolic functions', () => {
  near(calc('sinh(1)'), Math.sinh(1));
  near(calc('cosh(1)'), Math.cosh(1));
  near(calc('tanh(0.5)'), Math.tanh(0.5));
  near(calc('asinh(2)'), Math.asinh(2));
  near(calc('acosh(2)'), Math.acosh(2));
  near(calc('atanh(0.5)'), Math.atanh(0.5));
});

test('logarithms, exponentials and constants', () => {
  assert.equal(calc('log(1000)'), 3);
  assert.equal(calc('log(1)'), 0);
  assert.equal(calc('ln(e)'), 1);
  assert.equal(calc('ln(1)'), 0);
  near(calc('exp(1)'), Math.E);
  near(calc('e^2'), Math.E ** 2);
  assert.equal(calc('10^(2)'), 100);
  near(calc('π'), Math.PI);
  near(calc('pi*2'), 2 * Math.PI);
  assert.equal(calc('abs(-4.5)'), 4.5);
  assert.equal(calc('floor(2.7)'), 2);
  assert.equal(calc('ceil(2.1)'), 3);
});

test('scientific notation input', () => {
  assert.equal(calc('1E3'), 1000);
  assert.equal(calc('2.5E-3'), 0.0025);
  assert.equal(calc('1.5E3+1'), 1501);
});

test('Ans and rand', () => {
  assert.equal(calc('Ans*2', { ans: 21 }), 42);
  assert.equal(calc('ans'), 0);
  const r = calc('rand');
  assert.ok(r >= 0 && r < 1);
});

test('auto-closes parentheses', () => {
  assert.equal(calc('(1+2'), 3);
  assert.equal(calc('sin(30'), 0.5);
  assert.equal(calc('2*(3+(4'), 14);
});

test('division by zero', () => {
  throwsMsg('1/0', MESSAGES.DIV_ZERO);
  throwsMsg('0/0', MESSAGES.DIV_ZERO);
  throwsMsg('5/(3-3)', MESSAGES.DIV_ZERO);
  throwsMsg('5 mod 0', MESSAGES.DIV_ZERO);
  throwsMsg('0^-1', MESSAGES.DIV_ZERO);
  throwsMsg('tan(90)', MESSAGES.UNDEFINED);
  throwsMsg('tan(270)', MESSAGES.UNDEFINED);
  throwsMsg('tan(π/2)', MESSAGES.UNDEFINED, { angle: 'rad' });
  throwsMsg('tan(100)', MESSAGES.UNDEFINED, { angle: 'grad' });
});

test('domain errors', () => {
  throwsMsg('√(-1)', MESSAGES.DOMAIN);
  throwsMsg('ln(0)', MESSAGES.DOMAIN);
  throwsMsg('ln(-1)', MESSAGES.DOMAIN);
  throwsMsg('log(0)', MESSAGES.DOMAIN);
  throwsMsg('asin(2)', MESSAGES.DOMAIN);
  throwsMsg('acos(-1.5)', MESSAGES.DOMAIN);
  throwsMsg('acosh(0.5)', MESSAGES.DOMAIN);
  throwsMsg('atanh(1)', MESSAGES.DOMAIN);
  throwsMsg('(-1)!', MESSAGES.DOMAIN);
  throwsMsg('(-8)^0.5', MESSAGES.DOMAIN);
  throwsMsg('2 root -4', MESSAGES.DOMAIN);
  throwsMsg('0 root 5', MESSAGES.DOMAIN);
  throwsMsg('3 nCr 5', MESSAGES.DOMAIN);
  throwsMsg('2.5 nPr 1', MESSAGES.DOMAIN);
  throwsMsg('0^0', MESSAGES.UNDEFINED);
});

test('overflow', () => {
  throwsMsg('171!', MESSAGES.OVERFLOW);
  throwsMsg('10^400', MESSAGES.OVERFLOW);
  throwsMsg('exp(1000)', MESSAGES.OVERFLOW);
  throwsMsg('1E308*10', MESSAGES.OVERFLOW);
  throwsMsg('1000 nPr 500', MESSAGES.OVERFLOW);
});

test('syntax errors', () => {
  for (const bad of ['', '   ', '5+', '*3', '2**3', '(', ')', '1)', '2+*3', '1.2.3', 'foo(2)', '3 $ 4', '()', '5 mod', 'sin()']) {
    throwsMsg(bad, MESSAGES.SYNTAX);
  }
  throwsMsg('('.repeat(20000) + '1', MESSAGES.SYNTAX);
});

test('format', () => {
  assert.equal(format(0), '0');
  assert.equal(format(-0), '0');
  assert.equal(format(3), '3');
  assert.equal(format(0.1 + 0.2), '0.3');
  assert.equal(format(1 / 3), '0.333333333333');
  assert.equal(format(-2.5), '-2.5');
  assert.equal(format(1234567890123), '1.23456789012E12');
  assert.equal(format(1e15), '1E15');
  assert.equal(format(1.5e-7), '1.5E-7');
  assert.equal(format(Math.PI), '3.14159265359');
  assert.equal(format(123456789012), '123456789012');
});

test('formatted output can be parsed back', () => {
  for (const v of [1.5e-7, 2.5e20, -4e30, 12345.678]) {
    near(calc(format(v)) / v, 1, 1e-9);
  }
});
