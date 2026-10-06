import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekday, daysBetween, localToday, ruleApplies } from '../engine.js';

const pxmart = { id: 'pxmart', name: '全聯', cats: ['supermarket'] };
const seven = { id: 'seven', name: '7-ELEVEN', cats: ['convenience'] };
const jp = { id: 'overseas-jp', name: '海外・日本', cats: ['overseas', 'overseas-offline', 'overseas-jp'] };
const kr = { id: 'overseas-kr', name: '海外・韓國', cats: ['overseas', 'overseas-offline', 'overseas-kr'] };
const online = { id: 'overseas-online', name: '海外線上', cats: ['overseas'] };
const TUE = '2026-10-06';
const SAT = '2026-10-10';
const SUN = '2026-10-11';

const rule = (extra) => ({ card: 'a', title: 't', rate: 1, payments: ['card'], ...extra });

test('weekday returns 0=Sunday..6=Saturday', () => {
  assert.equal(weekday(TUE), 2);
  assert.equal(weekday(SAT), 6);
  assert.equal(weekday(SUN), 0);
});

test('daysBetween counts calendar days', () => {
  assert.equal(daysBetween('2026-08-22', '2026-10-06'), 45);
  assert.equal(daysBetween('2026-10-06', '2026-10-06'), 0);
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
});

test('localToday formats local date with zero padding', () => {
  assert.equal(localToday(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('payment must be listed', () => {
  assert.equal(ruleApplies(rule({ general: true }), pxmart, 'linepay', null, TUE), false);
  assert.equal(ruleApplies(rule({ general: true }), pxmart, 'card', null, TUE), true);
});

test('general, merchants and cats match', () => {
  assert.equal(ruleApplies(rule({ merchants: ['pxmart'] }), pxmart, 'card', null, TUE), true);
  assert.equal(ruleApplies(rule({ merchants: ['pxmart'] }), seven, 'card', null, TUE), false);
  assert.equal(ruleApplies(rule({ cats: ['supermarket'] }), pxmart, 'card', null, TUE), true);
  assert.equal(ruleApplies(rule({ cats: ['supermarket'] }), seven, 'card', null, TUE), false);
});

test('excludeMerchants and excludeCats override general and cats', () => {
  assert.equal(ruleApplies(rule({ general: true, excludeMerchants: ['seven'] }), seven, 'card', null, TUE), false);
  assert.equal(ruleApplies(rule({ cats: ['convenience'], excludeMerchants: ['seven'] }), seven, 'card', null, TUE), false);
  assert.equal(ruleApplies(rule({ general: true, excludeCats: ['overseas'] }), jp, 'card', null, TUE), false);
  assert.equal(ruleApplies(rule({ general: true, excludeCats: ['overseas'] }), pxmart, 'card', null, TUE), true);
});

test('general spending (merchant null) only matches general rules', () => {
  assert.equal(ruleApplies(rule({ general: true }), null, 'card', null, TUE), true);
  assert.equal(ruleApplies(rule({ merchants: ['pxmart'] }), null, 'card', null, TUE), false);
  assert.equal(ruleApplies(rule({ cats: ['supermarket'] }), null, 'card', null, TUE), false);
});

test('plan rules only apply under that plan; planless rules apply under any plan', () => {
  assert.equal(ruleApplies(rule({ general: true, plan: 'p1' }), pxmart, 'card', 'p1', TUE), true);
  assert.equal(ruleApplies(rule({ general: true, plan: 'p1' }), pxmart, 'card', 'p2', TUE), false);
  assert.equal(ruleApplies(rule({ general: true, plan: 'p1' }), pxmart, 'card', null, TUE), false);
  assert.equal(ruleApplies(rule({ general: true }), pxmart, 'card', 'p2', TUE), true);
});

test('validFrom and validThrough are inclusive', () => {
  const r = rule({ general: true, validFrom: '2026-10-01', validThrough: '2026-10-31' });
  assert.equal(ruleApplies(r, pxmart, 'card', null, '2026-09-30'), false);
  assert.equal(ruleApplies(r, pxmart, 'card', null, '2026-10-01'), true);
  assert.equal(ruleApplies(r, pxmart, 'card', null, '2026-10-31'), true);
  assert.equal(ruleApplies(r, pxmart, 'card', null, '2026-11-01'), false);
  assert.equal(ruleApplies(rule({ general: true, validFrom: null, validThrough: null }), pxmart, 'card', null, TUE), true);
});

test('days restricts to weekdays', () => {
  const weekend = rule({ general: true, days: [0, 6] });
  assert.equal(ruleApplies(weekend, pxmart, 'card', null, SAT), true);
  assert.equal(ruleApplies(weekend, pxmart, 'card', null, SUN), true);
  assert.equal(ruleApplies(weekend, pxmart, 'card', null, TUE), false);
});

test('overseas categories', () => {
  assert.equal(ruleApplies(rule({ cats: ['overseas'] }), jp, 'card', null, TUE), true);
  assert.equal(ruleApplies(rule({ cats: ['overseas'] }), online, 'card', null, TUE), true);
  assert.equal(ruleApplies(rule({ cats: ['overseas-offline'] }), jp, 'card', null, TUE), true);
  assert.equal(ruleApplies(rule({ cats: ['overseas-offline'] }), online, 'card', null, TUE), false);
  assert.equal(ruleApplies(rule({ cats: ['overseas-jp'] }), jp, 'card', null, TUE), true);
  assert.equal(ruleApplies(rule({ cats: ['overseas-jp'] }), kr, 'card', null, TUE), false);
  assert.equal(ruleApplies(rule({ general: true }), jp, 'card', null, TUE), true);
});
