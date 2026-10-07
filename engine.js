export const STALE_DAYS = 45;
const DAY_MS = 86400000;

function toUtc(date) {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function weekday(date) {
  return new Date(toUtc(date)).getUTCDay();
}

export function daysBetween(from, to) {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

export function localToday(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const intersects = (a = [], b = []) => a.some((x) => b.includes(x));

export function ruleApplies(rule, merchant, paymentId, planId, today) {
  if (!rule.payments.includes(paymentId)) return false;
  if (rule.plan && rule.plan !== planId) return false;
  if (rule.validFrom && today < rule.validFrom) return false;
  if (rule.validThrough && today > rule.validThrough) return false;
  if (rule.days && !rule.days.includes(weekday(today))) return false;
  if (merchant === null) return rule.general === true;
  if ((rule.excludeMerchants || []).includes(merchant.id)) return false;
  if (intersects(rule.excludeCats, merchant.cats)) return false;
  return (
    rule.general === true ||
    (rule.merchants || []).includes(merchant.id) ||
    intersects(rule.cats, merchant.cats || [])
  );
}

function bestRule(rules, merchant, paymentId, planId, today) {
  let best = null;
  for (const rule of rules) {
    if (!ruleApplies(rule, merchant, paymentId, planId, today)) continue;
    if (
      !best ||
      rule.rate > best.rate ||
      (rule.rate === best.rate && (rule.conditions || []).length < (best.conditions || []).length)
    ) {
      best = rule;
    }
  }
  return best;
}

function toRow(rule, planId, status, tomorrow = null) {
  return {
    rate: rule.rate,
    ruleTitle: rule.title,
    status,
    planId,
    conditions: rule.conditions || [],
    validThrough: rule.validThrough || null,
    tomorrow,
  };
}

function evaluateCombo(card, rules, merchant, paymentId, state, today) {
  if (!card.plans) {
    const rule = bestRule(rules, merchant, paymentId, null, today);
    return rule ? toRow(rule, null, 'now') : null;
  }
  let best = null;
  let bestPlan = null;
  for (const plan of card.plans) {
    const rule = bestRule(rules, merchant, paymentId, plan.id, today);
    if (rule && (!best || rule.rate > best.rate)) {
      best = rule;
      bestPlan = plan.id;
    }
  }
  if (!best) return null;
  const current = state && card.plans.some((p) => p.id === state.currentPlan) ? state.currentPlan : null;
  if (!best.plan) return toRow(best, current, 'now');
  if (!current) return toRow(best, bestPlan, 'switch');
  const now = bestRule(rules, merchant, paymentId, current, today);
  if (now && now.rate >= best.rate) return toRow(now, current, 'now');
  if (state.lastSwitchDate !== today) return toRow(best, bestPlan, 'switch');
  if (!now) return null;
  return toRow(now, current, 'now', { planId: bestPlan, rate: best.rate });
}

const STATUS_ORDER = { now: 0, switch: 1 };

export function recommend(data, { payments, merchantId, ownedCardIds, planState = {}, today }) {
  const merchant = merchantId === null ? null : data.merchants.find((m) => m.id === merchantId);
  if (merchant === undefined) return [];
  const cardName = new Map(data.cards.map((c) => [c.id, c.name]));
  const paymentOrder = new Map(data.payments.map((p, i) => [p.id, i]));
  const rows = [];
  for (const card of data.cards) {
    if (!ownedCardIds.includes(card.id)) continue;
    const rules = data.rules.filter((r) => r.card === card.id);
    const stale = daysBetween(card.lastVerified, today) > STALE_DAYS;
    for (const paymentId of payments) {
      const row = evaluateCombo(card, rules, merchant, paymentId, planState[card.id], today);
      if (row) rows.push({ cardId: card.id, paymentId, stale, ...row });
    }
  }
  return rows.sort(
    (a, b) =>
      b.rate - a.rate ||
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      a.conditions.length - b.conditions.length ||
      cardName.get(a.cardId).localeCompare(cardName.get(b.cardId), 'zh-Hant') ||
      paymentOrder.get(a.paymentId) - paymentOrder.get(b.paymentId)
  );
}

export function searchMerchants(merchants, query, limit = 20) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return merchants
    .filter((m) => [m.name, ...(m.aliases || [])].some((s) => s.toLowerCase().includes(q)))
    .slice(0, limit);
}

export function groupMerchants(merchants, categories) {
  const groups = new Map(categories.map((c) => [c.id, { id: c.id, name: c.name, merchants: [] }]));
  for (const m of merchants) {
    if (m.id.startsWith('overseas-')) continue;
    const primary = (m.cats || []).find((c) => !c.startsWith('overseas'));
    if (groups.has(primary)) groups.get(primary).merchants.push(m);
  }
  return [...groups.values()].filter((g) => g.merchants.length > 0);
}
