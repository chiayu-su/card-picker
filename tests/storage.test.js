import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, LEGACY_KEY, emptyState, emptyPerson, createStore, sanitize,
  getPerson, withPerson, selectProfile, withOwned, withPlan, withSwitchedToday,
} from '../storage.js';

const data = {
  cards: [
    { id: 'flat', name: '甲卡' },
    { id: 'plan', name: '丙卡', plans: [{ id: 'super' }, { id: 'online' }] },
  ],
};
const NAMES = ['hannah', 'Mom', 'guest'];

function memoryBackend(entries = {}) {
  const map = new Map(Object.entries(entries));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), map };
}

test('createStore reads empty state when nothing saved', () => {
  assert.deepEqual(createStore(memoryBackend()).read(), emptyState());
});

test('createStore round-trips through backend', () => {
  const backend = memoryBackend();
  const state = { profile: 'hannah', people: { hannah: { owned: null, planState: {} } } };
  createStore(backend).write(state);
  assert.deepEqual(JSON.parse(backend.map.get(STORAGE_KEY)), state);
  assert.deepEqual(createStore(backend).read(), state);
});

test('createStore exposes v1 data as legacy when no v2 data exists', () => {
  const v1 = { owned: ['flat'], planState: { plan: { currentPlan: 'super', lastSwitchDate: null } } };
  const backend = memoryBackend({ [LEGACY_KEY]: JSON.stringify(v1) });
  assert.deepEqual(createStore(backend).read(), { ...emptyState(), legacy: v1 });
});

test('createStore ignores v1 data once v2 data exists', () => {
  const backend = memoryBackend({
    [STORAGE_KEY]: JSON.stringify({ profile: 'Mom', people: {} }),
    [LEGACY_KEY]: JSON.stringify({ owned: ['flat'], planState: {} }),
  });
  assert.deepEqual(createStore(backend).read(), { profile: 'Mom', people: {} });
});

test('createStore tolerates corrupted JSON', () => {
  assert.deepEqual(createStore(memoryBackend({ [STORAGE_KEY]: '{not json' })).read(), emptyState());
  assert.deepEqual(createStore(memoryBackend({ [LEGACY_KEY]: '{not json' })).read(), emptyState());
});

test('createStore falls back to memory when backend throws or is null', () => {
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const state = { profile: 'hannah', people: {} };
  for (const backend of [throwing, null]) {
    const store = createStore(backend);
    assert.deepEqual(store.read(), emptyState());
    store.write(state);
    assert.deepEqual(store.read(), state);
  }
});

test('sanitize keeps known profile and people, drops unknown ones', () => {
  const dirty = {
    profile: 'stranger',
    people: {
      hannah: {
        owned: ['flat', 'gone', 42],
        planState: {
          plan: { currentPlan: 'removed', lastSwitchDate: '2026-10-06' },
          flat: { currentPlan: 'x', lastSwitchDate: null },
        },
      },
      stranger: { owned: null, planState: {} },
      Mom: { owned: 'flat', planState: 3 },
    },
  };
  assert.deepEqual(sanitize(dirty, data, NAMES), {
    profile: null,
    people: {
      hannah: { owned: ['flat'], planState: { plan: { currentPlan: null, lastSwitchDate: '2026-10-06' } } },
      Mom: emptyPerson(),
    },
  });
  assert.equal(sanitize({ profile: 'guest', people: {} }, data, NAMES).profile, 'guest');
});

test('sanitize keeps a cleaned legacy block', () => {
  const state = { ...emptyState(), legacy: { owned: ['flat'], planState: { plan: { currentPlan: 'super', lastSwitchDate: null } } } };
  assert.deepEqual(sanitize(state, data, NAMES).legacy, { owned: ['flat'], planState: { plan: { currentPlan: 'super', lastSwitchDate: null } } });
});

test('sanitize accepts garbage input', () => {
  for (const junk of [null, 'x', 1, [], { profile: 3, people: [] }]) {
    assert.deepEqual(sanitize(junk, data, NAMES), emptyState());
  }
});

test('getPerson returns an empty person when missing', () => {
  assert.deepEqual(getPerson(emptyState(), 'hannah'), emptyPerson());
});

test('selectProfile sets the profile and moves legacy plan state to a new person', () => {
  const legacy = { owned: ['flat'], planState: { plan: { currentPlan: 'super', lastSwitchDate: '2026-10-06' } } };
  const s = selectProfile({ ...emptyState(), legacy }, 'hannah');
  assert.equal(s.profile, 'hannah');
  assert.equal(s.legacy, undefined);
  assert.deepEqual(s.people.hannah, { owned: null, planState: legacy.planState });
});

test('selectProfile does not overwrite an existing person with legacy data', () => {
  const person = { owned: null, planState: { plan: { currentPlan: 'online', lastSwitchDate: null } } };
  const s = selectProfile({ profile: null, people: { hannah: person }, legacy: { owned: [], planState: {} } }, 'hannah');
  assert.deepEqual(s.people.hannah, person);
  assert.equal(s.legacy, undefined);
});

test('withPerson replaces one person only', () => {
  const s = withPerson({ profile: 'hannah', people: { Mom: emptyPerson() } }, 'hannah', { owned: ['flat'], planState: {} });
  assert.deepEqual(s.people, { Mom: emptyPerson(), hannah: { owned: ['flat'], planState: {} } });
});

test('withOwned starts from the base list when there is no override', () => {
  const p = withOwned(emptyPerson(), 'flat', false, ['flat', 'plan']);
  assert.deepEqual(p.owned, ['plan']);
  assert.deepEqual(withOwned(p, 'flat', true, ['flat', 'plan']).owned, ['plan', 'flat']);
  assert.deepEqual(withOwned(withOwned(p, 'plan', true, []), 'plan', true, []).owned, ['plan']);
});

test('withPlan records switch date only when switched today', () => {
  const p1 = withPlan(emptyPerson(), 'plan', 'super', true, '2026-10-06');
  assert.deepEqual(p1.planState.plan, { currentPlan: 'super', lastSwitchDate: '2026-10-06' });
  const p2 = withPlan(p1, 'plan', 'online', false, '2026-10-07');
  assert.deepEqual(p2.planState.plan, { currentPlan: 'online', lastSwitchDate: '2026-10-06' });
});

test('withSwitchedToday sets or clears the switch date', () => {
  const p1 = withPlan(emptyPerson(), 'plan', 'super', false, '2026-10-06');
  assert.equal(withSwitchedToday(p1, 'plan', true, '2026-10-06').planState.plan.lastSwitchDate, '2026-10-06');
  assert.equal(withSwitchedToday(p1, 'plan', false, '2026-10-06').planState.plan.lastSwitchDate, null);
  assert.equal(withSwitchedToday(p1, 'plan', true, '2026-10-06').planState.plan.currentPlan, 'super');
});

test('state helpers do not mutate input', () => {
  const s = emptyState();
  const p = emptyPerson();
  selectProfile(s, 'hannah');
  withPerson(s, 'hannah', p);
  withOwned(p, 'flat', true, []);
  withPlan(p, 'plan', 'super', true, '2026-10-06');
  assert.deepEqual(s, emptyState());
  assert.deepEqual(p, emptyPerson());
});
