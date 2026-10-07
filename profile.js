export const GUEST = 'guest';

export function findProfile(profiles, name) {
  if (!name) return null;
  const key = String(name).toLowerCase();
  return profiles.find((p) => p.name.toLowerCase() === key) || null;
}

function known(profiles, name) {
  if (!name) return null;
  if (String(name).toLowerCase() === GUEST) return GUEST;
  const profile = findProfile(profiles, name);
  return profile ? profile.name : null;
}

export function resolveProfile(profiles, urlName, savedName) {
  const fromUrl = known(profiles, urlName);
  if (fromUrl) return { name: fromUrl, source: 'url' };
  const saved = known(profiles, savedName);
  if (saved) return { name: saved, source: 'saved' };
  return { name: null, source: 'ask' };
}

export function ownedFor(profiles, name, cards) {
  const all = cards.map((c) => c.id);
  const profile = name === GUEST ? null : findProfile(profiles, name);
  if (!profile || profile.cards.length === 0) return all;
  return profile.cards.filter((id) => all.includes(id));
}
