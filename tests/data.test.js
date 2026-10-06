import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8'));
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const OVERSEAS = ['overseas-jp', 'overseas-kr', 'overseas-th', 'overseas-sg', 'overseas-us', 'overseas-eu', 'overseas-other', 'overseas-online'];
const PAYMENTS = ['card', 'applepay', 'linepay', 'jkopay', 'pxpay', 'taishinpay'];

const duplicates = (ids) => ids.filter((id, i) => ids.indexOf(id) !== i);
const ids = (key) => new Set(data[key].map((x) => x.id));

test('ids are unique', () => {
  for (const key of ['payments', 'merchants', 'cards']) {
    assert.deepEqual(duplicates(data[key].map((x) => x.id)), [], key);
  }
});

test('payments are the six fixed methods in order', () => {
  assert.deepEqual(data.payments.map((p) => p.id), PAYMENTS);
});

test('merchants have names and the eight overseas merchants exist', () => {
  for (const m of data.merchants) assert.ok(typeof m.name === 'string' && m.name.trim(), m.id);
  const merchantIds = ids('merchants');
  for (const id of OVERSEAS) assert.ok(merchantIds.has(id), id);
});

test('cards have valid lastVerified and unique plan ids', () => {
  for (const c of data.cards) {
    assert.match(c.lastVerified, DATE, c.id);
    if (c.plans) {
      assert.ok(c.plans.length > 0, c.id);
      assert.deepEqual(duplicates(c.plans.map((p) => p.id)), [], c.id);
    }
  }
});

test('rules reference existing ids and have valid fields', () => {
  const cards = new Map(data.cards.map((c) => [c.id, c]));
  const merchantIds = ids('merchants');
  const paymentIds = ids('payments');
  data.rules.forEach((r, i) => {
    const where = `rules[${i}] ${r.card}/${r.title}`;
    const card = cards.get(r.card);
    assert.ok(card, `${where}: unknown card`);
    assert.ok(typeof r.title === 'string' && r.title, `${where}: title`);
    assert.ok(typeof r.rate === 'number' && r.rate >= 0, `${where}: rate`);
    assert.ok(Array.isArray(r.payments) && r.payments.length > 0, `${where}: payments`);
    for (const p of r.payments) assert.ok(paymentIds.has(p), `${where}: payment ${p}`);
    if (r.plan) assert.ok(card.plans && card.plans.some((p) => p.id === r.plan), `${where}: plan ${r.plan}`);
    for (const m of [...(r.merchants || []), ...(r.excludeMerchants || [])]) assert.ok(merchantIds.has(m), `${where}: merchant ${m}`);
    for (const d of ['validFrom', 'validThrough']) if (r[d] != null) assert.match(r[d], DATE, `${where}: ${d}`);
    if (r.days) for (const d of r.days) assert.ok(Number.isInteger(d) && d >= 0 && d <= 6, `${where}: days`);
    assert.ok(r.general === true || (r.merchants || []).length > 0 || (r.cats || []).length > 0, `${where}: no merchant scope`);
  });
});

test('every rule category is used by at least one merchant', () => {
  const cats = new Set(data.merchants.flatMap((m) => m.cats || []));
  data.rules.forEach((r, i) => {
    for (const c of [...(r.cats || []), ...(r.excludeCats || [])]) assert.ok(cats.has(c), `rules[${i}] ${r.card}/${r.title}: cat ${c}`);
  });
});

import { recommend } from '../engine.js';

const TUE = '2026-10-06';
const rowsAt = (merchantId, cardId, planState = {}) =>
  recommend(data, { payments: data.payments.map((p) => p.id), merchantId, ownedCardIds: [cardId], planState, today: TUE });
const stuckOn = (cardId, plan) => ({ [cardId]: { currentPlan: plan, lastSwitchDate: TUE } });

test('CUBE base reward excludes 全聯, convenience stores, gas and insurance', () => {
  for (const m of ['pxmart', 'seven', 'familymart', 'hilife', 'cpc', 'insurance']) {
    assert.deepEqual(rowsAt(m, 'cube', stuckOn('cube', 'digital')), [], m);
  }
});

test('CUBE base reward does not apply to third-party wallets', () => {
  const rows = rowsAt('shopee', 'cube', stuckOn('cube', 'travel'));
  assert.deepEqual(rows.filter((r) => ['linepay', 'jkopay'].includes(r.paymentId)), []);
});

test('Richart base reward excludes convenience stores but not 全聯', () => {
  assert.deepEqual(rowsAt('seven', 'richart', stuckOn('richart', 'digital')), []);
  assert.ok(rowsAt('pxmart', 'richart', stuckOn('richart', 'digital')).some((r) => r.rate === 0.3));
});

test('plan rewards still apply at excluded merchant types', () => {
  assert.ok(rowsAt('seven', 'cube', stuckOn('cube', 'jingxuan')).some((r) => r.rate === 2));
  assert.ok(rowsAt('seven', 'richart', stuckOn('richart', 'daily')).some((r) => r.rate === 3.3));
});

test('eco, DAWHO and EVA keep general reward at 全聯 and convenience stores', () => {
  for (const card of ['eco', 'dawho', 'eva']) {
    for (const m of ['pxmart', 'seven']) assert.ok(rowsAt(m, card).length > 0, `${card}@${m}`);
  }
});
