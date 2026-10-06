# Card Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手機網頁：勾選付款方式 → 選店家（或一般消費／海外）→ 從自己持有的卡中列出回饋最高的「卡 × 付款方式」，並考慮方案卡（CUBE、Richart）的目前方案與今天是否已切換。

**Architecture:** 純靜態網頁，無框架、無 build。`engine.js`（純函式推薦引擎）與 `storage.js`（localStorage 包裝與狀態轉換純函式）為 ES module，瀏覽器與 Node 測試共用；`app.js` 只負責 DOM。資料唯一來源 `data/cards.json`，由一次性 bootstrap 腳本從調查得到的原始店家清單產生，之後手動維護。

**Tech Stack:** HTML / CSS / vanilla JS（ES modules）、Node 內建 `node:test` + `node:assert/strict`（無 npm 依賴）、GitHub Pages。

**Spec:** `docs/superpowers/specs/2026-10-06-card-picker-design.md`

## Global Constraints

- 無任何 npm 依賴；`package.json` 僅含 `"type": "module"` 與 test script。
- 測試指令：`node --test tests/`。Node 16 的總計以「檔案」為單位（3 個檔案），要看個別測試數用 `node tests/<file>.test.js`；下文的「N tests」指個別測試數。必須在 Node 16.20 可跑（不可使用 `Array.prototype.toSorted`、`structuredClone`、`Object.groupBy` 等 Node 17+ API）。
- 日期一律為 `YYYY-MM-DD` 字串；`today` 以使用者裝置本地時區計算；星期 `0`=週日…`6`=週六。
- localStorage key：`card-picker:v1`；值為 `{ "owned": string[], "planState": { [cardId]: { "currentPlan": string|null, "lastSwitchDate": string|null } } }`。
- `stale` = `today - card.lastVerified > 45` 天。
- 付款方式固定 6 種，順序：`card`（實體卡）、`applepay`（Apple Pay）、`linepay`（LINE Pay）、`jkopay`（街口）、`pxpay`（全支付）、`taishinpay`（台新Pay）。
- 8 個海外店家 id：`overseas-jp`、`overseas-kr`、`overseas-th`、`overseas-sg`、`overseas-us`、`overseas-eu`、`overseas-other`、`overseas-online`。
- 等級鎖定：CUBE Level 2、Richart Level 2、DAWHO「大大」。
- 介面文字一律繁體中文。
- 改動不加解釋性註解（使用者偏好）。

## Review Focus

1. localStorage 內容損毀（非 JSON、舊格式、卡片已從資料移除）→ 頁面照常運作，以空狀態或過濾後狀態啟動。→ Task 3 `sanitize` / `createStore` 測試。
2. 搜尋輸入含前後空白、大小寫混用、空字串 → 空字串不列結果；其餘不分大小寫比對名稱與別名。→ Task 2 `searchMerchants` 測試。
3. 方案卡今天已切過、但目前方案對該店家沒有任何適用規則（例如切在玩數位卻在全聯）→ 該組合不列出，而不是當機或顯示 0%。→ Task 2 測試。
4. 選定的店家 id 在資料中不存在（資料更新後舊選擇）→ 回傳空結果。→ Task 2 測試。
5. 頁面開著跨過午夜 → 每次渲染重新計算 `today`，「今天已切過」自動失效。→ Task 2「跨日」測試覆蓋引擎；Task 5 `today()` 每次渲染呼叫並列入手動驗證清單。

---

## File Structure

```
card-picker/
  package.json                       Task 1  {"type":"module"} + test script
  engine.js                          Task 1–2 日期工具、ruleApplies、recommend、searchMerchants
  storage.js                         Task 3  createStore、browserBackend、sanitize、withOwned、withPlan、withSwitchedToday
  research/merchants-raw-2026-10-06.json   已存在：調查彙整的原始店家清單（324 筆）
  scripts/bootstrap-data.mjs         Task 4  一次性產生 data/cards.json
  data/cards.json                    Task 4  產生後手動維護
  index.html  style.css  app.js      Task 5  介面
  README.md                          Task 5  使用、維護、部署說明
  tests/engine.test.js               Task 1–2
  tests/storage.test.js              Task 3
  tests/data.test.js                 Task 4
```

---

### Task 1: 專案骨架、日期工具與 `ruleApplies`

**Files:**
- Create: `package.json`
- Create: `engine.js`
- Test: `tests/engine.test.js`

**Interfaces:**
- Consumes: 無
- Produces（`engine.js` 具名匯出）:
  - `STALE_DAYS: number`（= 45）
  - `weekday(date: string): number` — 0–6
  - `daysBetween(from: string, to: string): number` — `to - from` 天數
  - `localToday(now?: Date): string` — 本地時區 `YYYY-MM-DD`
  - `ruleApplies(rule, merchant | null, paymentId: string, planId: string | null, today: string): boolean`

- [ ] **Step 1: 建立 `package.json`**

```json
{
  "name": "card-picker",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 2: 寫失敗測試 `tests/engine.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekday, daysBetween, localToday, ruleApplies } from '../engine.js';

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
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `node --test tests/`
Expected: FAIL，錯誤訊息含 `Cannot find module` 或 `engine.js`。

- [ ] **Step 4: 實作 `engine.js`**

```js
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
```

- [ ] **Step 5: 跑測試確認通過**

Run: `node --test tests/`
Expected: 全部 PASS（11 tests）。

- [ ] **Step 6: Commit**

```bash
git add package.json engine.js tests/engine.test.js
git commit -m "feat: add rule matching engine with date helpers"
```

---

### Task 2: `recommend`（組合、方案卡、排序、stale）與 `searchMerchants`

**Files:**
- Modify: `engine.js`（在檔尾新增）
- Test: `tests/engine.test.js`（在檔尾新增）

**Interfaces:**
- Consumes: Task 1 的 `ruleApplies`、`daysBetween`、`STALE_DAYS`
- Produces（`engine.js` 具名匯出）:
  - `recommend(data, { payments: string[], merchantId: string | null, ownedCardIds: string[], planState?: object, today: string }): Row[]`
  - `Row = { cardId, paymentId, rate: number, ruleTitle: string, status: 'now' | 'switch', planId: string | null, conditions: {tag, text?}[], validThrough: string | null, stale: boolean, tomorrow: { planId: string, rate: number } | null }`
  - `searchMerchants(merchants, query: string, limit?: number = 20): merchant[]`

- [ ] **Step 1: 在 `tests/engine.test.js` 檔尾新增失敗測試**

先把檔案第 3 行 import 改為：

```js
import { weekday, daysBetween, localToday, ruleApplies, recommend, searchMerchants } from '../engine.js';
```

再於檔尾新增：

```js
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
```

說明「排序」測試的預期 `['y', 'x', 'z', 'p']`：四者皆 2%；`p` 目前方案 `a` 沒有規則、方案 `b` 有 2% 且今天可切 → `switch`，排最後；`z` 有 1 個條件，排在無條件的 `x`、`y` 之後；`x`（B card）與 `y`（A card）依卡名排序。卡名刻意用 ASCII，避免 `zh-Hant` 筆畫排序與直覺不同。

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test tests/`
Expected: FAIL，訊息含 `recommend is not a function` 或 `does not provide an export named 'recommend'`。

- [ ] **Step 3: 在 `engine.js` 檔尾實作**

```js
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
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test tests/`
Expected: 全部 PASS（Task 1 的 11 個 + 本 Task 19 個 = 30 tests）。

- [ ] **Step 5: Commit**

```bash
git add engine.js tests/engine.test.js
git commit -m "feat: add recommendation engine with plan switching and merchant search"
```

---

### Task 3: `storage.js`（localStorage 包裝與狀態轉換）

**Files:**
- Create: `storage.js`
- Test: `tests/storage.test.js`

**Interfaces:**
- Consumes: 無
- Produces（`storage.js` 具名匯出）:
  - `STORAGE_KEY: string`（= `'card-picker:v1'`）
  - `emptyState(): State` — `{ owned: [], planState: {} }`
  - `browserBackend(): Storage | null` — 取得 `globalThis.localStorage`，存取丟例外時回 `null`
  - `createStore(backend: { getItem, setItem } | null): { read(): State, write(state: State): void }` — 失敗時退回記憶體
  - `sanitize(state: unknown, data): State` — 移除不存在的卡、非方案卡的 planState、無效方案
  - `withOwned(state, cardId, owned: boolean): State`
  - `withPlan(state, cardId, planId: string | null, switchedToday: boolean, today: string): State`
  - `withSwitchedToday(state, cardId, switched: boolean, today: string): State`

- [ ] **Step 1: 寫失敗測試 `tests/storage.test.js`**

```js
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
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test tests/`
Expected: FAIL，`tests/storage.test.js` 找不到 `../storage.js`。

- [ ] **Step 3: 實作 `storage.js`**

```js
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
```

`createStore.read` 在 JSON 損毀時回傳的是上一次的記憶體值（初始為空狀態）；形狀是否正確交給呼叫端的 `sanitize` 處理。

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test tests/`
Expected: 全部 PASS（30 + 10 = 40 tests）。

- [ ] **Step 5: Commit**

```bash
git add storage.js tests/storage.test.js
git commit -m "feat: add localStorage store with sanitizing and plan state helpers"
```

---

### Task 4: 資料檢查與初始資料 `data/cards.json`

**Files:**
- Test: `tests/data.test.js`
- Create: `scripts/bootstrap-data.mjs`
- Create（由腳本產生）: `data/cards.json`
- 已存在（只讀）: `research/merchants-raw-2026-10-06.json` — 陣列 `{ id, name, aliases, cats, sources }`，`sources` 如 `"cube:玩數位"`、`"richart:Pay著刷"`

**Interfaces:**
- Consumes: `engine.js` 的 `recommend`（只在 Step 6 冒煙檢查使用）
- Produces: `data/cards.json`，符合 spec「資料格式」；Task 5 以 `fetch('data/cards.json')` 讀取

- [ ] **Step 1: 寫資料檢查測試 `tests/data.test.js`**

```js
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
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test tests/`
Expected: FAIL，`ENOENT ... data/cards.json`。

- [ ] **Step 3: 寫 `scripts/bootstrap-data.mjs`**

```js
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const RAW = new URL('../research/merchants-raw-2026-10-06.json', import.meta.url);
const OUT = new URL('../data/cards.json', import.meta.url);
const VERIFIED = '2026-10-06';

if (existsSync(OUT) && !process.argv.includes('--force')) {
  console.error('data/cards.json already exists; pass --force to overwrite manual edits');
  process.exit(1);
}

const DROP_IDS = new Set([
  'overseas', 'holiday_all', 'easycard_autoload',
  'quanpay', 'taishin_pay', 'taishin_pay_plus', 'linepay', 'allpay_plus', 'wowprime_pay',
]);
const DROP_SOURCES = new Set(['richart:Chill刷', 'cube:慶生月', 'cube:童樂匯']);
const OVERSEAS_REGION = {
  tokyo_disney: 'jp', usj: 'jp', suica: 'jp', lawson_jp: 'jp', biccamera: 'jp',
  gs25_kr: 'kr', wowpass: 'kr', grab: null,
};
const POPULAR = ['pxmart', 'seven', 'familymart', 'hilife', 'cpc', 'shopee', 'momo', 'ubereats', 'foodpanda', 'mcdonalds', 'uber'];

const raw = JSON.parse(readFileSync(RAW, 'utf8'));
const merchants = [];
const bySource = new Map();

for (const m of raw) {
  if (DROP_IDS.has(m.id)) continue;
  const sources = m.sources.flatMap((s) => s.split('/')).filter((s) => !DROP_SOURCES.has(s));
  if (sources.length === 0) continue;
  let cats = m.cats.filter((c) => c !== 'overseas');
  if (m.id in OVERSEAS_REGION) {
    const region = OVERSEAS_REGION[m.id];
    cats = [...cats, 'overseas', 'overseas-offline', ...(region ? [`overseas-${region}`] : [])];
  }
  const merchant = { id: m.id, name: (m.name || m.id).trim(), aliases: m.aliases || [], cats };
  if (POPULAR.includes(m.id)) merchant.popular = true;
  merchants.push(merchant);
  for (const s of sources) {
    if (!bySource.has(s)) bySource.set(s, []);
    bySource.get(s).push(m.id);
  }
}

const REGIONS = [['jp', '日本', ['japan']], ['kr', '韓國', ['korea']], ['th', '泰國', ['thailand']], ['sg', '新加坡', ['singapore']], ['us', '美國', ['usa']], ['eu', '歐洲', ['europe']]];
const fixed = [
  ...REGIONS.map(([code, name, aliases]) => ({
    id: `overseas-${code}`, name: `海外・${name}`, aliases: [name, ...aliases], cats: ['overseas', 'overseas-offline', `overseas-${code}`],
  })),
  { id: 'overseas-other', name: '海外・其他國家', aliases: ['海外', '國外'], cats: ['overseas', 'overseas-offline'] },
  { id: 'overseas-online', name: '海外線上', aliases: ['海外網購', '國外網站'], cats: ['overseas'] },
  { id: 'dining-other', name: '餐廳（其他）', aliases: ['餐廳', '吃飯', '外食'], cats: ['dining'] },
  { id: 'tesla', name: 'Tesla', aliases: ['特斯拉'], cats: ['ev'] },
  { id: 'gogoro', name: 'Gogoro 電池資費', aliases: ['gogoro'], cats: ['ev'] },
];
for (const f of fixed) {
  if (merchants.some((m) => m.id === f.id)) throw new Error(`fixed merchant id clash: ${f.id}`);
}
merchants.unshift(...fixed);

for (const id of POPULAR) {
  if (!merchants.some((m) => m.id === id)) throw new Error(`popular merchant missing: ${id}`);
}

function from(tag) {
  const list = bySource.get(tag);
  if (!list || list.length === 0) throw new Error(`no merchants for ${tag}`);
  return list;
}

const CARD = ['card', 'applepay'];
const TAISHIN_CARD = ['card', 'applepay', 'taishinpay'];
const ALL_BUT_TAISHIN = ['card', 'applepay', 'linepay', 'jkopay', 'pxpay'];
const ALL = [...ALL_BUT_TAISHIN, 'taishinpay'];
const TBD = { tag: '待確認', text: '調查時未能對照官網確認，查證後移除此標籤' };
const CUBE_END = '2026-12-31';
const RICHART = { validFrom: '2026-07-01', validThrough: '2027-03-31' };

const cards = [
  {
    id: 'cube', bank: '國泰世華', name: 'CUBE 卡', lastVerified: VERIFIED,
    officialUrl: 'https://www.cathay-cube.com.tw/cathaybk/personal/product/credit-card/cards/cube',
    note: '以 Level 2（設定自動扣繳）計算',
    plans: [
      { id: 'digital', name: '玩數位' }, { id: 'shopping', name: '樂饗購' }, { id: 'travel', name: '趣旅行' },
      { id: 'jingxuan', name: '集精選' }, { id: 'fpg', name: '台塑家' }, { id: 'pxpay', name: '全支付' },
    ],
  },
  {
    id: 'richart', bank: '台新', name: 'Richart 卡', lastVerified: VERIFIED,
    officialUrl: 'https://richart.tw/TSDIB_RichartWeb/card/credit-card',
    note: '以 Level 2（設定台新帳戶自動扣繳）計算',
    plans: [
      { id: 'daily', name: '天天刷' }, { id: 'bigspend', name: '大筆刷' }, { id: 'dining', name: '好饗刷' },
      { id: 'digital', name: '數趣刷' }, { id: 'travel', name: '玩旅刷' }, { id: 'pay', name: 'Pay著刷' },
      { id: 'holiday', name: '假日刷' },
    ],
  },
  {
    id: 'dawho', bank: '永豐', name: 'DAWHO 現金回饋卡', lastVerified: VERIFIED,
    officialUrl: 'https://bank.sinopac.com/sinopacBT/personal/credit-card/introduction/bankcard/DAWHO.html',
    note: '以「大大」等級計算',
  },
  {
    id: 'eva', bank: '國泰世華', name: '長榮航空聯名卡', lastVerified: VERIFIED,
    officialUrl: 'https://www.cathay-cube.com.tw/cathaybk/personal/product/credit-card/cards/eva',
    note: '哩程以國內 2%、國外 3% 估值',
  },
  { id: 'jiho', bank: '聯邦', name: '吉鶴卡', lastVerified: VERIFIED, note: '官網未能抓取，規則來自二手整理' },
  {
    id: 'eco', bank: '星展', name: 'eco 永續卡', lastVerified: VERIFIED,
    officialUrl: 'https://www.dbs.com.tw/personal-zh/cards/dbs_eco/index.html',
  },
];

const rules = [
  { card: 'cube', title: '基本回饋', rate: 0.3, general: true, payments: CARD },
  { card: 'cube', title: '基本回饋（行動支付）', rate: 0.3, general: true, payments: ['linepay', 'jkopay', 'pxpay'], conditions: [TBD] },
  { card: 'cube', plan: 'digital', title: '玩數位', rate: 3, merchants: from('cube:玩數位'), payments: CARD, validThrough: CUBE_END },
  { card: 'cube', plan: 'shopping', title: '樂饗購', rate: 3, merchants: from('cube:樂饗購'), payments: CARD, validThrough: CUBE_END },
  {
    card: 'cube', plan: 'shopping', title: '樂饗購・週四外食', rate: 8, cats: ['dining'], days: [4], payments: CARD, validThrough: CUBE_END,
    conditions: [{ tag: '滿額', text: '週四外食滿 NT$2,000' }, { tag: '需登錄' }, TBD],
  },
  { card: 'cube', plan: 'travel', title: '趣旅行', rate: 3, merchants: from('cube:趣旅行'), payments: CARD, validThrough: CUBE_END },
  { card: 'cube', plan: 'travel', title: '趣旅行・海外實體', rate: 3, cats: ['overseas-offline'], payments: CARD, validThrough: CUBE_END },
  { card: 'cube', plan: 'jingxuan', title: '集精選', rate: 2, merchants: from('cube:集精選'), payments: CARD, validThrough: CUBE_END },
  { card: 'cube', plan: 'fpg', title: '台塑家', rate: 2, merchants: from('cube:台塑家'), payments: CARD, validThrough: CUBE_END },
  { card: 'cube', plan: 'pxpay', title: '全支付', rate: 2, general: true, payments: ['pxpay'], validFrom: '2026-06-01', validThrough: CUBE_END, conditions: [TBD] },

  { card: 'richart', title: '基本回饋', rate: 0.3, general: true, payments: ALL },
  { card: 'richart', title: '保費', rate: 1.3, merchants: ['insurance'], payments: ['card'], ...RICHART },
  { card: 'richart', plan: 'daily', title: '天天刷', rate: 3.3, merchants: from('richart:天天刷'), payments: TAISHIN_CARD, ...RICHART },
  { card: 'richart', plan: 'bigspend', title: '大筆刷', rate: 3.3, merchants: from('richart:大筆刷'), payments: TAISHIN_CARD, ...RICHART },
  { card: 'richart', plan: 'dining', title: '好饗刷', rate: 3.3, merchants: from('richart:好饗刷'), cats: ['dining'], payments: TAISHIN_CARD, ...RICHART },
  { card: 'richart', plan: 'digital', title: '數趣刷', rate: 3.3, merchants: from('richart:數趣刷'), payments: TAISHIN_CARD, ...RICHART },
  { card: 'richart', plan: 'travel', title: '玩旅刷', rate: 3.3, merchants: from('richart:玩旅刷'), payments: TAISHIN_CARD, ...RICHART },
  { card: 'richart', plan: 'travel', title: '玩旅刷・海外', rate: 3.3, cats: ['overseas'], payments: TAISHIN_CARD, ...RICHART, conditions: [TBD] },
  { card: 'richart', plan: 'pay', title: 'Pay著刷・台新Pay', rate: 3.8, merchants: from('richart:Pay著刷'), payments: ['taishinpay'], ...RICHART },
  { card: 'richart', plan: 'pay', title: 'Pay著刷・LINE Pay', rate: 2.3, merchants: from('richart:Pay著刷'), payments: ['linepay'], ...RICHART },
  {
    card: 'richart', plan: 'holiday', title: '假日刷', rate: 2, general: true, days: [0, 6],
    excludeMerchants: ['seven', 'familymart', 'hilife'], excludeCats: ['overseas'],
    payments: ['card', 'applepay', 'linepay', 'taishinpay'], ...RICHART,
    conditions: [{ tag: '排除', text: '排除四大超商與繳稅' }, { tag: '國定假日', text: '國定假日也適用，本工具只判斷週末' }],
  },

  { card: 'dawho', title: '國內一般消費', rate: 1, general: true, excludeCats: ['overseas'], payments: ALL_BUT_TAISHIN, validThrough: '2026-12-31', conditions: [{ tag: '分期不回饋' }] },
  { card: 'dawho', title: '國外消費', rate: 2, cats: ['overseas'], payments: ALL_BUT_TAISHIN, validThrough: '2026-12-31', conditions: [{ tag: '分期不回饋' }] },

  { card: 'eva', title: '國內一般消費（哩程估值）', rate: 2, general: true, excludeCats: ['overseas'], payments: CARD },
  { card: 'eva', title: '國外消費（哩程估值）', rate: 3, cats: ['overseas'], payments: CARD },

  { card: 'jiho', title: '日本實體消費', rate: 2.5, cats: ['overseas-jp'], payments: CARD, conditions: [TBD] },
  { card: 'jiho', title: '日本 Apple Pay（QUICPay）', rate: 4, cats: ['overseas-jp'], payments: ['applepay'], conditions: [{ tag: '上限', text: '加碼每月上限約 NT$1,000' }, TBD] },

  { card: 'eco', title: '一般消費', rate: 1, general: true, payments: ['card', 'applepay', 'jkopay'] },
  {
    card: 'eco', title: '指定國家海外實體', rate: 5,
    cats: ['overseas-jp', 'overseas-kr', 'overseas-th', 'overseas-sg', 'overseas-us', 'overseas-eu'],
    payments: CARD, validFrom: '2026-01-01', validThrough: '2026-12-31',
    conditions: [{ tag: '上限', text: '加碼每期上限 600 點' }],
  },
  {
    card: 'eco', title: 'eco 指定商家', rate: 10, merchants: ['tesla', 'gogoro'], payments: CARD,
    validFrom: '2026-01-01', validThrough: '2026-12-31', conditions: [{ tag: '上限', text: '加碼每期上限 500 點' }],
  },
];

const payments = [
  { id: 'card', name: '實體卡' }, { id: 'applepay', name: 'Apple Pay' }, { id: 'linepay', name: 'LINE Pay' },
  { id: 'jkopay', name: '街口' }, { id: 'pxpay', name: '全支付' }, { id: 'taishinpay', name: '台新Pay' },
];

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(OUT, JSON.stringify({ updated: VERIFIED, payments, merchants, cards, rules }, null, 2) + '\n');
console.log(`wrote ${merchants.length} merchants, ${cards.length} cards, ${rules.length} rules`);
```

卡片的 `note` 欄位是 spec 未列出的選填顯示欄位（spec「等級以外的條件寫在卡片說明」），Task 5 會在「我的卡」顯示；資料檢查不檢查它。

- [ ] **Step 4: 執行腳本產生資料**

Run: `node scripts/bootstrap-data.mjs`
Expected: 印出 `wrote 225 merchants, 6 cards, 30 rules`。若丟出 `no merchants for <tag>` 或 `popular merchant missing`，代表原始清單與腳本假設不符：檢查 `research/merchants-raw-2026-10-06.json` 中實際的 `sources` 字串或 id 後修正腳本常數，不要修改原始清單。

- [ ] **Step 5: 跑測試確認通過**

Run: `node --test tests/`
Expected: 全部 PASS（40 + 6 = 46 tests）。若 `every rule category is used by at least one merchant` 失敗，代表原始清單沒有該類別（例如 `dining`）的店家：確認 `dining-other` 有被加入；其他類別缺漏時回報，不要刪規則。

- [ ] **Step 6: 冒煙檢查真實資料的推薦結果**

Run:

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { recommend } from './engine.js';
const data = JSON.parse(readFileSync('data/cards.json', 'utf8'));
const all = data.cards.map(c => c.id);
const pay = data.payments.map(p => p.id);
for (const [m, today] of [['pxmart','2026-10-06'], ['overseas-jp','2026-10-06'], [null,'2026-10-10']]) {
  const rows = recommend(data, { payments: pay, merchantId: m, ownedCardIds: all, planState: {}, today });
  console.log(m, rows.slice(0, 4).map(r => r.cardId + '/' + r.paymentId + ' ' + r.rate + '% ' + r.status + ' ' + (r.planId || '')).join(' | '));
}"
```

Expected（計畫撰寫時以同一份腳本試跑的結果）：

```
pxmart eva/card 2% now  | eva/applepay 2% now  | cube/card 2% switch jingxuan | cube/applepay 2% switch jingxuan
overseas-jp eco/card 5% now  | eco/applepay 5% now  | jiho/applepay 4% now  | richart/card 3.3% switch travel
null eva/card 2% now  | eva/applepay 2% now  | cube/pxpay 2% switch pxpay | richart/card 2% switch holiday
```

把輸出貼進 commit 前的回報。數字明顯不合理（例如全聯出現 10%）時停下來回報，不要自行改費率。

- [ ] **Step 7: Commit**

```bash
git add tests/data.test.js scripts/bootstrap-data.mjs data/cards.json
git commit -m "feat: add initial card data for six cards and data validation tests"
```

---

### Task 5: 介面（`index.html`、`style.css`、`app.js`）與 README

**Files:**
- Create: `index.html`
- Create: `style.css`
- Create: `app.js`
- Create: `README.md`

**Interfaces:**
- Consumes: `engine.js` 的 `recommend`、`searchMerchants`、`localToday`；`storage.js` 的 `createStore`、`browserBackend`、`sanitize`、`withOwned`、`withPlan`、`withSwitchedToday`；`data/cards.json`
- Produces: 可部署的靜態網站

- [ ] **Step 1: 建立 `index.html`**

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0f766e">
  <title>刷哪張</title>
  <link rel="stylesheet" href="style.css">
  <script type="module" src="app.js"></script>
</head>
<body>
  <header class="top">
    <h1>刷哪張</h1>
    <button id="open-cards" type="button">我的卡</button>
  </header>
  <main>
    <p id="load-error" class="error" hidden></p>
    <section id="step-payments" class="panel">
      <h2>1. 這家店收哪些付款方式？</h2>
      <label class="chip all"><input type="checkbox" id="pay-all" checked> 全選</label>
      <div id="payments" class="chips"></div>
    </section>
    <section id="step-merchant" class="panel">
      <h2>2. 在哪裡消費？</h2>
      <input id="search" type="search" placeholder="搜尋店家，例如 全聯、蝦皮" autocomplete="off">
      <div id="search-results" class="chips"></div>
      <div id="quick" class="chips"></div>
      <div id="overseas-picker" class="chips" hidden></div>
    </section>
    <section id="results" class="panel">
      <h2 id="results-title">結果</h2>
      <div id="result-list"></div>
    </section>
  </main>
  <dialog id="cards-dialog">
    <form method="dialog">
      <h2>我的卡</h2>
      <div id="card-settings"></div>
      <button type="submit" class="primary">完成</button>
    </form>
  </dialog>
</body>
</html>
```

- [ ] **Step 2: 建立 `style.css`**

```css
:root {
  --bg: #f6f7f9;
  --panel: #ffffff;
  --text: #1f2937;
  --muted: #6b7280;
  --line: #e5e7eb;
  --accent: #0f766e;
  --accent-soft: #ccfbf1;
  --warn: #b45309;
  --warn-soft: #fef3c7;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111827;
    --panel: #1f2937;
    --text: #f3f4f6;
    --muted: #9ca3af;
    --line: #374151;
    --accent: #2dd4bf;
    --accent-soft: #134e4a;
    --warn: #fbbf24;
    --warn-soft: #451a03;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 16px/1.5 -apple-system, BlinkMacSystemFont, "PingFang TC", "Noto Sans TC", sans-serif;
}
.top {
  position: sticky; top: 0; z-index: 1;
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; background: var(--panel); border-bottom: 1px solid var(--line);
}
.top h1 { margin: 0; font-size: 20px; }
main { max-width: 640px; margin: 0 auto; padding: 12px 16px 48px; }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 12px 16px; margin-bottom: 12px; }
.panel h2 { margin: 0 0 8px; font-size: 16px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
.chip, button {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 40px; padding: 6px 12px;
  border: 1px solid var(--line); border-radius: 999px;
  background: var(--panel); color: var(--text); font: inherit; cursor: pointer;
}
.chip input { margin: 0; }
.chip.all { margin-bottom: 4px; }
button.selected, .chip:has(input:checked) { background: var(--accent-soft); border-color: var(--accent); }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
input[type="search"] {
  width: 100%; min-height: 44px; padding: 8px 12px;
  border: 1px solid var(--line); border-radius: 10px; background: var(--bg); color: var(--text); font: inherit;
}
.hint { color: var(--muted); margin: 8px 0; }
.error { background: var(--warn-soft); color: var(--warn); padding: 12px 16px; border-radius: 12px; }
.rows { list-style: none; margin: 0; padding: 0; }
.row { padding: 12px 0; border-top: 1px solid var(--line); }
.row:first-child { border-top: 0; }
.row-head { display: flex; justify-content: space-between; gap: 12px; font-weight: 600; }
.rate { color: var(--accent); font-size: 20px; white-space: nowrap; }
.row-sub, .tomorrow { color: var(--muted); font-size: 14px; margin-top: 2px; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.tag { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: var(--bg); border: 1px solid var(--line); }
.tag.warn { background: var(--warn-soft); color: var(--warn); border-color: transparent; }
.switch { display: flex; align-items: center; gap: 8px; margin-top: 6px; color: var(--accent); font-size: 14px; }
.switch button { min-height: 32px; padding: 2px 10px; font-size: 14px; }
dialog { width: min(560px, calc(100vw - 32px)); border: 1px solid var(--line); border-radius: 12px; background: var(--panel); color: var(--text); padding: 16px; }
dialog::backdrop { background: rgb(0 0 0 / 40%); }
.card-setting { padding: 10px 0; border-top: 1px solid var(--line); }
.card-setting:first-child { border-top: 0; }
.card-setting .note { color: var(--muted); font-size: 13px; margin: 2px 0 0 26px; }
.plan-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 8px 0 0 26px; }
.plan-controls select { min-height: 36px; font: inherit; background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: 8px; }
```

- [ ] **Step 3: 建立 `app.js`**

```js
import { recommend, searchMerchants, localToday } from './engine.js';
import { createStore, browserBackend, sanitize, withOwned, withPlan, withSwitchedToday } from './storage.js';

const $ = (selector) => document.querySelector(selector);
const store = createStore(browserBackend());

let data = null;
let state = { owned: [], planState: {} };
let selectedPayments = [];
let selectedMerchant;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'checked' || key === 'selected' || key === 'hidden') node[key] = Boolean(value);
    else if (value != null && value !== false) node.setAttribute(key, value);
  }
  node.append(...children.flat().filter((c) => c != null && c !== false));
  return node;
}

const today = () => localToday();
const byId = (list, id) => list.find((x) => x.id === id);
const planName = (card, planId) => (byId(card.plans || [], planId) || {}).name || planId;

function save(next) {
  state = sanitize(next, data);
  store.write(state);
  renderCardSettings();
  renderResults();
}

function renderPayments() {
  const box = $('#payments');
  box.replaceChildren(
    ...data.payments.map((p) =>
      el('label', { class: 'chip' },
        el('input', {
          type: 'checkbox',
          checked: selectedPayments.includes(p.id),
          onchange: (e) => {
            selectedPayments = e.target.checked
              ? data.payments.map((x) => x.id).filter((id) => id === p.id || selectedPayments.includes(id))
              : selectedPayments.filter((id) => id !== p.id);
            $('#pay-all').checked = selectedPayments.length === data.payments.length;
            renderResults();
          },
        }),
        p.name)
    )
  );
  $('#pay-all').checked = selectedPayments.length === data.payments.length;
}

function merchantButton(m) {
  return el('button', {
    type: 'button',
    class: selectedMerchant === m.id ? 'selected' : '',
    onclick: () => pickMerchant(m.id),
  }, m.name);
}

function renderQuick() {
  const overseasOpen = !$('#overseas-picker').hidden;
  const isOverseas = typeof selectedMerchant === 'string' && selectedMerchant.startsWith('overseas-');
  $('#quick').replaceChildren(
    el('button', { type: 'button', class: selectedMerchant === null ? 'selected' : '', onclick: () => pickMerchant(null) }, '一般消費'),
    el('button', {
      type: 'button',
      class: isOverseas || overseasOpen ? 'selected' : '',
      onclick: () => {
        $('#overseas-picker').hidden = !$('#overseas-picker').hidden;
        renderQuick();
      },
    }, '海外消費 ▾'),
    ...data.merchants.filter((m) => m.popular).map(merchantButton)
  );
  $('#overseas-picker').replaceChildren(...data.merchants.filter((m) => m.id.startsWith('overseas-')).map(merchantButton));
}

function renderSearch() {
  const q = $('#search').value;
  const box = $('#search-results');
  if (!q.trim()) {
    box.replaceChildren();
    return;
  }
  const found = searchMerchants(data.merchants, q);
  box.replaceChildren(
    ...(found.length
      ? found.map(merchantButton)
      : [el('p', { class: 'hint' }, '找不到這家店，試試「一般消費」')])
  );
}

function pickMerchant(id) {
  selectedMerchant = id;
  renderQuick();
  renderSearch();
  renderResults();
  $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function hint(text, ...extra) {
  return el('p', { class: 'hint' }, text, ...extra);
}

function renderRow(row, index, now) {
  const card = byId(data.cards, row.cardId);
  const payment = byId(data.payments, row.paymentId);
  const tags = [
    ...row.conditions.map((c) => el('span', { class: 'tag', title: c.text || '' }, `🏷 ${c.tag}`)),
    row.validThrough ? el('span', { class: 'tag' }, `到期 ${row.validThrough}`) : null,
    row.stale ? el('span', { class: 'tag warn' }, '⚠ 資料可能過期') : null,
  ];
  return el('li', { class: 'row' },
    el('div', { class: 'row-head' },
      el('span', {}, `${index === 0 ? '🥇' : `${index + 1}.`} ${card.name} × ${payment.name}`),
      el('span', { class: 'rate' }, `${row.rate}%`)),
    el('div', { class: 'row-sub' }, row.ruleTitle, row.planId && row.status === 'now' ? `（${planName(card, row.planId)}）` : ''),
    row.status === 'switch'
      ? el('div', { class: 'switch' },
          `🔄 切到「${planName(card, row.planId)}」`,
          el('button', { type: 'button', onclick: () => save(withPlan(state, card.id, row.planId, true, now)) }, '我切了'))
      : null,
    row.tomorrow ? el('div', { class: 'tomorrow' }, `⏳ 明天切到「${planName(card, row.tomorrow.planId)}」可得 ${row.tomorrow.rate}%`) : null,
    el('div', { class: 'tags' }, tags)
  );
}

function renderResults() {
  const list = $('#result-list');
  const title = $('#results-title');
  const merchant = typeof selectedMerchant === 'string' ? byId(data.merchants, selectedMerchant) : null;
  title.textContent = selectedMerchant === undefined ? '結果' : `結果：${selectedMerchant === null ? '一般消費' : (merchant || {}).name || ''}`;
  if (state.owned.length === 0) {
    list.replaceChildren(hint('還沒選你有哪些卡。', el('button', { type: 'button', onclick: openCards }, '設定我的卡')));
    return;
  }
  if (selectedPayments.length === 0) {
    list.replaceChildren(hint('請至少勾選一種付款方式。'));
    return;
  }
  if (selectedMerchant === undefined) {
    list.replaceChildren(hint('選一家店或「一般消費」看結果。'));
    return;
  }
  const now = today();
  const rows = recommend(data, {
    payments: selectedPayments,
    merchantId: selectedMerchant,
    ownedCardIds: state.owned,
    planState: state.planState,
    today: now,
  });
  list.replaceChildren(
    rows.length ? el('ol', { class: 'rows' }, rows.map((row, i) => renderRow(row, i, now))) : hint('沒有適用的卡。')
  );
}

function renderCardSettings() {
  const now = today();
  $('#card-settings').replaceChildren(
    ...data.cards.map((card) => {
      const owned = state.owned.includes(card.id);
      const ps = state.planState[card.id] || { currentPlan: null, lastSwitchDate: null };
      return el('div', { class: 'card-setting' },
        el('label', {},
          el('input', { type: 'checkbox', checked: owned, onchange: (e) => save(withOwned(state, card.id, e.target.checked)) }),
          ` ${card.bank} ${card.name}`),
        card.note ? el('p', { class: 'note' }, card.note) : null,
        owned && card.plans
          ? el('div', { class: 'plan-controls' },
              el('label', {}, '目前方案 ',
                el('select', {
                  onchange: (e) => {
                    const planId = e.target.value || null;
                    save(withPlan(state, card.id, planId, planId !== null, now));
                  },
                },
                el('option', { value: '', selected: !ps.currentPlan }, '（未設定）'),
                card.plans.map((p) => el('option', { value: p.id, selected: ps.currentPlan === p.id }, p.name)))),
              el('label', {},
                el('input', {
                  type: 'checkbox',
                  checked: ps.lastSwitchDate === now,
                  onchange: (e) => save(withSwitchedToday(state, card.id, e.target.checked, now)),
                }),
                ' 今天已切過'))
          : null
      );
    })
  );
}

function openCards() {
  renderCardSettings();
  $('#cards-dialog').showModal();
}

function showError(message) {
  $('#load-error').textContent = message;
  $('#load-error').hidden = false;
  for (const id of ['#step-payments', '#step-merchant', '#results']) $(id).hidden = true;
  $('#open-cards').disabled = true;
}

async function start() {
  try {
    const res = await fetch('data/cards.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    showError(`卡片資料載入失敗（${err.message}），請重新整理頁面。`);
    return;
  }
  state = sanitize(store.read(), data);
  selectedPayments = data.payments.map((p) => p.id);
  $('#pay-all').addEventListener('change', (e) => {
    selectedPayments = e.target.checked ? data.payments.map((p) => p.id) : [];
    renderPayments();
    renderResults();
  });
  $('#search').addEventListener('input', renderSearch);
  $('#open-cards').addEventListener('click', openCards);
  $('#cards-dialog').addEventListener('close', renderResults);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      renderCardSettings();
      renderResults();
    }
  });
  renderPayments();
  renderQuick();
  renderResults();
}

start();
```

- [ ] **Step 4: 建立 `README.md`**

````markdown
# 刷哪張

勾選店家收的付款方式 → 選店家 → 從自己持有的卡裡列出回饋最高的「卡 × 付款方式」。方案卡（CUBE、Richart）會考慮目前方案與今天是否已切換。

## 本機執行

```bash
python3 -m http.server 8000
```

打開 http://localhost:8000 。直接開 `index.html` 檔案不行，瀏覽器會擋 `fetch`。

## 測試

```bash
node --test tests/
```

## 更新卡片資料

所有資料都在 `data/cards.json`，欄位定義見 `docs/superpowers/specs/2026-10-06-card-picker-design.md`。

1. 對照銀行官網修改規則，回饋率填「基本 + 加碼」的總和。
2. 查證過的卡片更新 `lastVerified`；超過 45 天沒更新的卡會在結果上標「⚠ 資料可能過期」。
3. 確認過的規則移除 `待確認` 標籤。
4. 跑 `node --test tests/`，通過後 commit、push。

`scripts/bootstrap-data.mjs` 只用來產生第一版資料，之後不要再執行（會覆蓋手動修改）。

## 部署到 GitHub Pages

1. 在 GitHub 建立 repo，`git remote add origin <url>`，`git push -u origin main`。
2. repo 的 Settings → Pages → Source 選 `Deploy from a branch`，Branch 選 `main` / `/ (root)`。
3. 幾分鐘後網址會出現在同一頁；手機用 Safari 打開後「加入主畫面」。
````

- [ ] **Step 5: 語法與測試檢查**

Run: `node --check app.js && node --check engine.js && node --check storage.js && node --test tests/`
Expected: 無語法錯誤；46 tests 全部 PASS。

- [ ] **Step 6: 啟動本機伺服器並確認檔案可取得**

Run（背景執行）: `python3 -m http.server 8000`
再 Run: `curl -s -o /dev/null -w "%{http_code} " http://localhost:8000/ http://localhost:8000/app.js http://localhost:8000/data/cards.json`
Expected: `200 200 200`

- [ ] **Step 7: 瀏覽器手動驗證（手機寬度 375px）**

用瀏覽器開 http://localhost:8000 （開發者工具切到手機尺寸），逐項確認並記錄結果：

1. 首次開啟：結果區顯示「還沒選你有哪些卡」與「設定我的卡」按鈕。
2. 「我的卡」勾 CUBE 與 DAWHO；CUBE 出現「目前方案」下拉與「今天已切過」；DAWHO 沒有。
3. CUBE 目前方案選「玩數位」→「今天已切過」自動勾選。關閉對話框。
4. 點「全聯」：CUBE 列顯示「明天切到「集精選」可得 2%」（因今天已切過），DAWHO 1% 也在列表。
5. 回「我的卡」取消「今天已切過」→ 結果中 CUBE 變成「🔄 切到「集精選」」並有「我切了」按鈕；按下後變為一般列（集精選），且「我的卡」中目前方案變為集精選、今天已切過被勾選。
6. 付款方式只勾「LINE Pay」→ 結果只剩 LINE Pay 列；全部取消 → 顯示「請至少勾選一種付款方式」；按「全選」→ 恢復。
7. 搜尋框輸入「  PX  」或「蝦皮」→ 出現對應店家按鈕；輸入「zzz」→ 顯示「找不到這家店，試試「一般消費」」。
8. 「海外消費 ▾」展開 8 個海外選項；點「海外・日本」→ 有結果，標題為「結果：海外・日本」。
9. 重新整理頁面 → 持有卡與方案狀態保留；付款方式重置為全選。
10. 開發者工具 Application → Local Storage 把 `card-picker:v1` 改成 `{bad` 後重新整理 → 頁面正常，持有卡為空。
11. 把 `data/cards.json` 暫時改名後重新整理 → 顯示「卡片資料載入失敗」錯誤；改回原名。
12. 切換系統深色模式 → 文字與背景對比正常、無水平捲動。
13. 「今天已切過」跨日：在 Console 執行 `localStorage.setItem('card-picker:v1', JSON.stringify({owned:['cube'],planState:{cube:{currentPlan:'digital',lastSwitchDate:'2000-01-01'}}}))` 後重新整理，點全聯 → CUBE 顯示「🔄 切到」（昨天以前切的不算今天）。

任何一項不符就修正後重跑本步驟。結束後停止 http.server。

- [ ] **Step 8: Commit**

```bash
git add index.html style.css app.js README.md
git commit -m "feat: add mobile web UI and README"
```
