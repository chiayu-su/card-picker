export const STORAGE_KEY = 'card-picker:v2';
export const LEGACY_KEY = 'card-picker:v1';

export function emptyState() {
  return { profile: null, people: {} };
}

export function emptyPerson() {
  return { owned: null, planState: {} };
}

export function browserBackend() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function parse(backend, key) {
  try {
    const raw = backend && backend.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function createStore(backend) {
  let memory = emptyState();
  return {
    read() {
      const current = parse(backend, STORAGE_KEY);
      if (current !== undefined) {
        memory = current;
        return memory;
      }
      const legacy = parse(backend, LEGACY_KEY);
      if (legacy !== undefined) return { ...emptyState(), legacy };
      return memory;
    },
    write(state) {
      memory = state;
      try {
        if (backend) backend.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        return;
      }
    },
  };
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function sanitizePerson(person, cards) {
  const source = isObject(person) ? person : {};
  const owned = Array.isArray(source.owned) ? source.owned.filter((id) => cards.has(id)) : null;
  const planState = {};
  for (const [id, s] of Object.entries(isObject(source.planState) ? source.planState : {})) {
    const card = cards.get(id);
    if (!card || !card.plans || !isObject(s)) continue;
    planState[id] = {
      currentPlan: card.plans.some((p) => p.id === s.currentPlan) ? s.currentPlan : null,
      lastSwitchDate: typeof s.lastSwitchDate === 'string' ? s.lastSwitchDate : null,
    };
  }
  return { owned, planState };
}

export function sanitize(state, data, names) {
  const cards = new Map(data.cards.map((c) => [c.id, c]));
  const source = isObject(state) ? state : {};
  const people = {};
  for (const [name, person] of Object.entries(isObject(source.people) ? source.people : {})) {
    if (names.includes(name)) people[name] = sanitizePerson(person, cards);
  }
  const result = { profile: names.includes(source.profile) ? source.profile : null, people };
  if (isObject(source.legacy)) result.legacy = sanitizePerson(source.legacy, cards);
  return result;
}

export function getPerson(state, name) {
  return state.people[name] || emptyPerson();
}

export function withPerson(state, name, person) {
  return { ...state, people: { ...state.people, [name]: person } };
}

export function selectProfile(state, name) {
  const { legacy, ...rest } = state;
  const next = { ...rest, profile: name };
  if (legacy && !state.people[name]) {
    return withPerson(next, name, { owned: null, planState: legacy.planState || {} });
  }
  return next;
}

export function withOwned(person, cardId, owned, baseOwned) {
  const ids = (person.owned || baseOwned).filter((id) => id !== cardId);
  return { ...person, owned: owned ? [...ids, cardId] : ids };
}

export function withPlan(person, cardId, planId, switchedToday, today) {
  const prev = person.planState[cardId] || {};
  return {
    ...person,
    planState: {
      ...person.planState,
      [cardId]: { currentPlan: planId, lastSwitchDate: switchedToday ? today : prev.lastSwitchDate || null },
    },
  };
}

export function withSwitchedToday(person, cardId, switched, today) {
  const prev = person.planState[cardId] || { currentPlan: null };
  return {
    ...person,
    planState: { ...person.planState, [cardId]: { ...prev, lastSwitchDate: switched ? today : null } },
  };
}
