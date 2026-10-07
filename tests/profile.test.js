import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUEST, findProfile, resolveProfile, ownedFor } from '../profile.js';

const profiles = [
  { name: 'hannah', cards: ['cube', 'eva'] },
  { name: 'Mom', cards: ['cube', 'gone'] },
  { name: 'dad', cards: [] },
];
const cards = [{ id: 'cube' }, { id: 'eva' }, { id: 'eco' }];

test('findProfile matches name case-insensitively', () => {
  assert.equal(findProfile(profiles, 'mom').name, 'Mom');
  assert.equal(findProfile(profiles, 'HANNAH').name, 'hannah');
  assert.equal(findProfile(profiles, 'nobody'), null);
  assert.equal(findProfile(profiles, null), null);
});

test('resolveProfile prefers the URL name over the saved one', () => {
  assert.deepEqual(resolveProfile(profiles, 'MOM', 'hannah'), { name: 'Mom', source: 'url' });
});

test('resolveProfile accepts guest from the URL', () => {
  assert.deepEqual(resolveProfile(profiles, 'Guest', 'hannah'), { name: GUEST, source: 'url' });
});

test('resolveProfile falls back to the saved name when the URL name is unknown or missing', () => {
  assert.deepEqual(resolveProfile(profiles, 'nobody', 'hannah'), { name: 'hannah', source: 'saved' });
  assert.deepEqual(resolveProfile(profiles, null, GUEST), { name: GUEST, source: 'saved' });
});

test('resolveProfile asks when nothing usable is known', () => {
  assert.deepEqual(resolveProfile(profiles, null, null), { name: null, source: 'ask' });
  assert.deepEqual(resolveProfile(profiles, '', 'removed'), { name: null, source: 'ask' });
});

test('ownedFor returns every card for guest, unknown or empty profiles', () => {
  assert.deepEqual(ownedFor(profiles, GUEST, cards), ['cube', 'eva', 'eco']);
  assert.deepEqual(ownedFor(profiles, null, cards), ['cube', 'eva', 'eco']);
  assert.deepEqual(ownedFor(profiles, 'dad', cards), ['cube', 'eva', 'eco']);
});

test('ownedFor returns the profile cards that still exist', () => {
  assert.deepEqual(ownedFor(profiles, 'hannah', cards), ['cube', 'eva']);
  assert.deepEqual(ownedFor(profiles, 'Mom', cards), ['cube']);
});
