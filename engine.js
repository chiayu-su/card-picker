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
