import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekday, daysBetween, localToday, ruleApplies, recommend, searchMerchants } from '../engine.js';

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
const fixture = {
  payments: [{ id: 'card', name: '實體卡' }, { id: 'applepay', name: 'Apple Pay' }, { id: 'linepay', name: 'LINE Pay' }],
  merchants: [
    { id: 'pxmart', name: '全聯', aliases: ['pxmart', 'PX Mart'], cats: ['supermarket'] },
    { id: 'shopee', name: '蝦皮購物', aliases: ['蝦皮'], cats: ['ecommerce'] },
    { id: 'seven', name: '7-ELEVEN', aliases: ['711', '小七'], cats: ['convenience'] },
  ],
  cards: [
    { id: 'flat', bank: 'B', name: '甲卡', lastVerified: '2026-10-01' },
    { id: 'apay', bank: 'B', name: '乙卡', lastVerified: '2026-08-21' },
    { id: 'plan', bank: 'B', name: '丙卡', lastVerified: '2026-10-01', plans: [{ id: 'super', name: '超市' }, { id: 'online', name: '網購' }] },
  ],
  rules: [
    { card: 'flat', title: '一般', rate: 1, general: true, payments: ['card', 'applepay', 'linepay'] },
    { card: 'apay', title: '一般', rate: 0.5, general: true, payments: ['card', 'applepay'] },
    { card: 'apay', title: 'Apple Pay 加碼', rate: 3, general: true, payments: ['applepay'] },
    { card: 'plan', title: '基本', rate: 0.3, general: true, payments: ['card'] },
    { card: 'plan', plan: 'super', title: '超市方案', rate: 3, merchants: ['pxmart'], payments: ['card'] },
    { card: 'plan', plan: 'online', title: '網購方案', rate: 3, merchants: ['shopee'], payments: ['card'] },
    { card: 'plan', plan: 'online', title: '網購方案-超市', rate: 2, merchants: ['pxmart'], payments: ['card'], conditions: [{ tag: '需登錄' }] },
  ],
};
const ALL_CARDS = ['flat', 'apay', 'plan'];
const query = (extra) => ({ payments: ['card', 'applepay', 'linepay'], merchantId: 'pxmart', ownedCardIds: ALL_CARDS, planState: {}, today: TUE, ...extra });
const find = (rows, cardId, paymentId) => rows.find((r) => r.cardId === cardId && r.paymentId === paymentId);

test('only owned cards are listed', () => {
  const rows = recommend(fixture, query({ ownedCardIds: ['flat'] }));
  assert.deepEqual([...new Set(rows.map((r) => r.cardId))], ['flat']);
});

test('only selected payments are listed', () => {
  const rows = recommend(fixture, query({ payments: ['linepay'] }));
  assert.deepEqual(rows.map((r) => `${r.cardId}/${r.paymentId}`), ['flat/linepay']);
});

test('physical card and Apple Pay are separate rows with their own best rate', () => {
  const rows = recommend(fixture, query());
  assert.equal(find(rows, 'apay', 'card').rate, 0.5);
  assert.equal(find(rows, 'apay', 'applepay').rate, 3);
  assert.equal(find(rows, 'apay', 'applepay').ruleTitle, 'Apple Pay 加碼');
});

test('combos without any applicable rule are omitted', () => {
  const rows = recommend(fixture, query());
  assert.equal(find(rows, 'plan', 'linepay'), undefined);
});

test('unknown merchant id returns no rows', () => {
  assert.deepEqual(recommend(fixture, query({ merchantId: 'gone' })), []);
});

test('plan card: current plan is best -> now', () => {
  const rows = recommend(fixture, query({ planState: { plan: { currentPlan: 'super', lastSwitchDate: null } } }));
  const row = find(rows, 'plan', 'card');
  assert.equal(row.status, 'now');
  assert.equal(row.planId, 'super');
  assert.equal(row.rate, 3);
  assert.equal(row.tomorrow, null);
});

test('plan card: not switched today and another plan is better -> switch', () => {
  const rows = recommend(fixture, query({ planState: { plan: { currentPlan: 'online', lastSwitchDate: '2026-10-05' } } }));
  const row = find(rows, 'plan', 'card');
  assert.equal(row.status, 'switch');
  assert.equal(row.planId, 'super');
  assert.equal(row.rate, 3);
});

test('plan card: already switched today -> now with tomorrow hint', () => {
  const rows = recommend(fixture, query({ planState: { plan: { currentPlan: 'online', lastSwitchDate: TUE } } }));
  const row = find(rows, 'plan', 'card');
  assert.equal(row.status, 'now');
  assert.equal(row.planId, 'online');
  assert.equal(row.rate, 2);
  assert.deepEqual(row.tomorrow, { planId: 'super', rate: 3 });
});

test('plan card: switched yesterday counts as switchable today', () => {
  const rows = recommend(fixture, query({ today: '2026-10-07', planState: { plan: { currentPlan: 'online', lastSwitchDate: TUE } } }));
  assert.equal(find(rows, 'plan', 'card').status, 'switch');
});

test('plan card: no current plan -> best plan as switch', () => {
  const rows = recommend(fixture, query());
  const row = find(rows, 'plan', 'card');
  assert.equal(row.status, 'switch');
  assert.equal(row.planId, 'super');
});

test('plan card: switched today and current plan has only planless rule -> uses planless rule', () => {
  const rows = recommend(fixture, query({ merchantId: 'seven', planState: { plan: { currentPlan: 'online', lastSwitchDate: TUE } } }));
  const row = find(rows, 'plan', 'card');
  assert.equal(row.status, 'now');
  assert.equal(row.rate, 0.3);
  assert.equal(row.tomorrow, null);
});

test('plan card: switched today and current plan has no applicable rule -> omitted', () => {
  const data = { ...fixture, rules: fixture.rules.filter((r) => !(r.card === 'plan' && !r.plan)) };
  const rows = recommend(data, { ...query({ merchantId: 'shopee' }), planState: { plan: { currentPlan: 'super', lastSwitchDate: TUE } } });
  assert.equal(find(rows, 'plan', 'card'), undefined);
});

test('rows sorted by rate desc, now before switch, fewer conditions, then card name', () => {
  const data = {
    ...fixture,
    cards: [
      { id: 'x', bank: 'B', name: 'B card', lastVerified: '2026-10-01' },
      { id: 'y', bank: 'B', name: 'A card', lastVerified: '2026-10-01' },
      { id: 'z', bank: 'B', name: 'C card', lastVerified: '2026-10-01' },
      { id: 'p', bank: 'B', name: 'D card', lastVerified: '2026-10-01', plans: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] },
    ],
    rules: [
      { card: 'x', title: 't', rate: 2, general: true, payments: ['card'] },
      { card: 'y', title: 't', rate: 2, general: true, payments: ['card'] },
      { card: 'z', title: 't', rate: 2, general: true, payments: ['card'], conditions: [{ tag: '需登錄' }] },
      { card: 'p', plan: 'b', title: 't', rate: 2, general: true, payments: ['card'] },
      { card: 'x', title: 'high', rate: 5, merchants: ['seven'], payments: ['card'] },
    ],
  };
  const rows = recommend(data, { payments: ['card'], merchantId: 'pxmart', ownedCardIds: ['x', 'y', 'z', 'p'], planState: { p: { currentPlan: 'a', lastSwitchDate: null } }, today: TUE });
  assert.deepEqual(rows.map((r) => r.cardId), ['y', 'x', 'z', 'p']);
});

test('stale when lastVerified is more than 45 days ago', () => {
  const rows = recommend(fixture, query({ merchantId: null }));
  assert.equal(find(rows, 'apay', 'card').stale, true);
  assert.equal(find(rows, 'flat', 'card').stale, false);
  const onBoundary = recommend(fixture, query({ merchantId: null, today: '2026-10-05' }));
  assert.equal(find(onBoundary, 'apay', 'card').stale, false);
});

test('plan card: best rule is planless -> now without switch suggestion', () => {
  const rows = recommend(fixture, query({ merchantId: 'seven' }));
  const row = find(rows, 'plan', 'card');
  assert.equal(row.status, 'now');
  assert.equal(row.planId, null);
  assert.equal(row.rate, 0.3);
});

test('general spending (null merchant) only uses general rules', () => {
  const rows = recommend(fixture, query({ merchantId: null }));
  assert.equal(find(rows, 'plan', 'card').rate, 0.3);
  assert.equal(find(rows, 'plan', 'card').status, 'now');
});

test('row carries conditions and validThrough', () => {
  const rows = recommend(fixture, query({ planState: { plan: { currentPlan: 'online', lastSwitchDate: TUE } } }));
  const row = find(rows, 'plan', 'card');
  assert.deepEqual(row.conditions, [{ tag: '需登錄' }]);
  assert.equal(row.validThrough, null);
});

test('searchMerchants matches name and aliases case-insensitively, trims input', () => {
  assert.deepEqual(searchMerchants(fixture.merchants, '  px mart ').map((m) => m.id), ['pxmart']);
  assert.deepEqual(searchMerchants(fixture.merchants, '蝦').map((m) => m.id), ['shopee']);
  assert.deepEqual(searchMerchants(fixture.merchants, '7-eleven').map((m) => m.id), ['seven']);
  assert.deepEqual(searchMerchants(fixture.merchants, '小七').map((m) => m.id), ['seven']);
});

test('searchMerchants returns nothing for empty query and respects limit', () => {
  assert.deepEqual(searchMerchants(fixture.merchants, '   '), []);
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, name: `店${i}`, cats: [] }));
  assert.equal(searchMerchants(many, '店').length, 20);
  assert.equal(searchMerchants(many, '店', 5).length, 5);
});
