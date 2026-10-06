import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, emptyState, createStore, sanitize, withOwned, withPlan, withSwitchedToday } from '../storage.js';

const data = {
  cards: [
    { id: 'flat', name: '甲卡' },
    { id: 'plan', name: '丙卡', plans: [{ id: 'super' }, { id: 'online' }] },
  ],
};

function memoryBackend(initial) {
  const map = new Map(initial === undefined ? [] : [[STORAGE_KEY, initial]]);
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), map };
}

test('createStore reads empty state when nothing saved', () => {
  assert.deepEqual(createStore(memoryBackend()).read(), emptyState());
});

test('createStore round-trips through backend', () => {
  const backend = memoryBackend();
  const state = { owned: ['flat'], planState: {} };
  createStore(backend).write(state);
  assert.deepEqual(JSON.parse(backend.map.get(STORAGE_KEY)), state);
  assert.deepEqual(createStore(backend).read(), state);
});

test('createStore tolerates corrupted JSON', () => {
  assert.deepEqual(createStore(memoryBackend('{not json')).read(), emptyState());
});

test('createStore falls back to memory when backend throws or is null', () => {
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  for (const backend of [throwing, null]) {
    const store = createStore(backend);
    assert.deepEqual(store.read(), emptyState());
    store.write({ owned: ['flat'], planState: {} });
    assert.deepEqual(store.read(), { owned: ['flat'], planState: {} });
  }
});

test('sanitize drops unknown cards, non-plan planState and invalid plans', () => {
  const dirty = {
    owned: ['flat', 'gone', 42],
    planState: {
      plan: { currentPlan: 'removed', lastSwitchDate: '2026-10-06' },
      flat: { currentPlan: 'x', lastSwitchDate: null },
      gone: { currentPlan: 'super', lastSwitchDate: null },
    },
  };
  assert.deepEqual(sanitize(dirty, data), {
    owned: ['flat'],
    planState: { plan: { currentPlan: null, lastSwitchDate: '2026-10-06' } },
  });
});

test('sanitize accepts garbage input', () => {
  for (const junk of [null, 'x', 1, [], { owned: 'flat', planState: 3 }]) {
    assert.deepEqual(sanitize(junk, data), emptyState());
  }
});

test('withOwned adds and removes without duplicates', () => {
  let s = withOwned(emptyState(), 'flat', true);
  s = withOwned(s, 'flat', true);
  assert.deepEqual(s.owned, ['flat']);
  assert.deepEqual(withOwned(s, 'flat', false).owned, []);
});

test('withPlan records switch date only when switched today', () => {
  const s1 = withPlan(emptyState(), 'plan', 'super', true, '2026-10-06');
  assert.deepEqual(s1.planState.plan, { currentPlan: 'super', lastSwitchDate: '2026-10-06' });
  const s2 = withPlan(s1, 'plan', 'online', false, '2026-10-07');
  assert.deepEqual(s2.planState.plan, { currentPlan: 'online', lastSwitchDate: '2026-10-06' });
});

test('withSwitchedToday sets or clears the switch date', () => {
  const s1 = withPlan(emptyState(), 'plan', 'super', false, '2026-10-06');
  assert.equal(withSwitchedToday(s1, 'plan', true, '2026-10-06').planState.plan.lastSwitchDate, '2026-10-06');
  assert.equal(withSwitchedToday(s1, 'plan', false, '2026-10-06').planState.plan.lastSwitchDate, null);
  assert.equal(withSwitchedToday(s1, 'plan', true, '2026-10-06').planState.plan.currentPlan, 'super');
});

test('state helpers do not mutate input', () => {
  const s = emptyState();
  withOwned(s, 'flat', true);
  withPlan(s, 'plan', 'super', true, '2026-10-06');
  assert.deepEqual(s, emptyState());
});
