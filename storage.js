export const STORAGE_KEY = 'card-picker:v1';

export function emptyState() {
  return { owned: [], planState: {} };
}

export function browserBackend() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function createStore(backend) {
  let memory = emptyState();
  return {
    read() {
      try {
        const raw = backend && backend.getItem(STORAGE_KEY);
        if (raw) memory = JSON.parse(raw);
      } catch {
        return memory;
      }
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

export function sanitize(state, data) {
  const cards = new Map(data.cards.map((c) => [c.id, c]));
  const source = isObject(state) ? state : {};
  const owned = Array.isArray(source.owned) ? source.owned.filter((id) => cards.has(id)) : [];
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

export function withOwned(state, cardId, owned) {
  const ids = state.owned.filter((id) => id !== cardId);
  return { ...state, owned: owned ? [...ids, cardId] : ids };
}

export function withPlan(state, cardId, planId, switchedToday, today) {
  const prev = state.planState[cardId] || {};
  return {
    ...state,
    planState: {
      ...state.planState,
      [cardId]: { currentPlan: planId, lastSwitchDate: switchedToday ? today : prev.lastSwitchDate || null },
    },
  };
}

export function withSwitchedToday(state, cardId, switched, today) {
  const prev = state.planState[cardId] || { currentPlan: null };
  return {
    ...state,
    planState: { ...state.planState, [cardId]: { ...prev, lastSwitchDate: switched ? today : null } },
  };
}
