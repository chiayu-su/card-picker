# Card Picker 設計文件

日期：2026-10-06

## 目標

給自己與家人朋友用的手機網頁：先勾選店家接受的付款方式，再選店家（或「一般消費」），從**自己持有的卡**中列出回饋率最高的「卡 × 付款方式」組合；方案卡（如 CUBE、台新）會考慮目前方案與今天是否已切換。

### 成功標準

- 手機開網頁 → 勾付款方式 → 點店家，3 步內看到排序結果。
- 只推薦自己勾選持有的卡。
- 方案卡能區分「現在可用 / 切換後可用 / 明天才能切」。
- 資料單一來源（`data/cards.json`），由維護者透過 git 更新；`node --test` 能抓出資料引用錯誤。

### 不做（v1）

- 回饋上限計算（`cap` 欄位保留但不計算）
- 當月已刷金額追蹤
- 定位偵測店家
- 行動支付本身回饋（街口幣、全點等）與信用卡回饋疊加
- 實體卡與 Apple Pay 分開計算（合併為 `card`）
- 多人共用後端；各使用者狀態只存在自己瀏覽器

## 架構

純靜態網頁，不使用框架、不需 build，部署於 GitHub Pages。

```
card-picker/
  index.html
  style.css
  app.js            UI：渲染、事件、localStorage 讀寫
  engine.js         純函式推薦引擎（ES module，瀏覽器與 Node 共用）
  storage.js        localStorage 包裝（try/catch，失敗時退回記憶體）
  data/cards.json   唯一資料來源
  tests/engine.test.js
  tests/data.test.js
```

- `app.js` 啟動時 `fetch('data/cards.json')`，載入失敗顯示錯誤訊息。
- 本機開發：`python3 -m http.server`。
- 測試：`node --test`，無任何 npm 依賴。

## 資料格式（`data/cards.json`）

```json
{
  "updated": "2026-10-06",
  "payments": [
    { "id": "card",    "name": "信用卡/Apple Pay" },
    { "id": "linepay", "name": "LINE Pay" },
    { "id": "jkopay",  "name": "街口" },
    { "id": "pxpay",   "name": "全支付" }
  ],
  "merchants": [
    { "id": "pxmart", "name": "全聯", "aliases": ["全聯", "pxmart"], "cats": ["supermarket"] }
  ],
  "cards": [
    {
      "id": "cube", "bank": "國泰世華", "name": "CUBE 卡",
      "officialUrl": "https://...", "lastVerified": "2026-10-01",
      "plans": [ { "id": "jingxuan", "name": "集精選" }, { "id": "wanle", "name": "玩數位" } ],
      "switchPerDay": 1
    }
  ],
  "rules": [
    { "card": "cube", "title": "基本回饋", "rate": 0.3, "general": true, "payments": ["card"] },
    {
      "card": "cube", "plan": "jingxuan", "title": "集精選", "rate": 2.0,
      "merchants": ["pxmart"], "cats": [], "excludeMerchants": [],
      "payments": ["card", "pxpay"],
      "conditions": [ { "tag": "需登錄", "text": "每月需登錄" } ],
      "cap": null, "validFrom": null, "validThrough": "2026-12-31"
    }
  ]
}
```

### 欄位定義

| 物件 | 欄位 | 必填 | 說明 |
|---|---|---|---|
| payment | `id`, `name` | ✓ | 付款方式 |
| merchant | `id`, `name` | ✓ | 店家 |
| merchant | `aliases` | | 搜尋用別名，比對時轉小寫 |
| merchant | `cats` | | 類別 id 陣列 |
| card | `id`, `bank`, `name`, `lastVerified` | ✓ | `lastVerified` 為 `YYYY-MM-DD` |
| card | `officialUrl` | | 官網連結 |
| card | `plans` | | 有此欄位即為方案卡 |
| card | `switchPerDay` | 方案卡必填 | 每天可切換次數，依銀行官網填；v1 只記錄最後切換日期，大於等於 1 一律視為每天 1 次 |
| rule | `card`, `title`, `rate`, `payments` | ✓ | `rate` 為百分比數字；`payments` 不得為空，無預設值 |
| rule | `plan` | | 有則僅在該方案啟用時適用；無則任何方案都適用 |
| rule | `general` | | `true` 表示任何店家（含「一般消費」）都適用 |
| rule | `merchants`, `cats` | | 指定店家 / 類別 |
| rule | `excludeMerchants` | | 排除店家（對 `general` 與 `cats` 也生效） |
| rule | `conditions` | | `[{tag, text}]`，僅顯示，不參與計算 |
| rule | `cap` | | 保留，v1 不計算 |
| rule | `validFrom`, `validThrough` | | `YYYY-MM-DD` 或 `null`，含首尾日 |

規則需至少有 `general: true`、非空 `merchants` 或非空 `cats` 其中之一。

## 推薦引擎（`engine.js`）

```js
recommend(data, { payments, merchantId, ownedCardIds, planState, today })
// merchantId === null 代表「一般消費」
// planState: { [cardId]: { currentPlan, lastSwitchDate } }
// today: 'YYYY-MM-DD'
```

### 規則適用判定 `ruleApplies(rule, merchant, paymentId, planId, today)`

全部成立才適用：

1. `rule.payments` 包含 `paymentId`
2. `rule.plan` 不存在，或等於 `planId`
3. 日期：`validFrom ≤ today ≤ validThrough`（`null` 視為無限）
4. 店家：
   - 「一般消費」：僅 `general: true`
   - 指定店家：`merchant.id` 不在 `excludeMerchants`，且（`general` 或 `merchants` 含該店 或 `cats` 與店家 `cats` 有交集）

### 每個「卡 × 付款方式」組合

- **非方案卡**：取適用規則中最高 `rate`；無適用規則則不列出。
- **方案卡**：
  - `canSwitchToday` = `lastSwitchDate !== today`（未設定 `currentPlan` 時視為可切）
  - `now` = 用 `currentPlan` 計算的最佳結果
  - `best` = 所有方案中最佳結果
  - 若 `best.rate > now.rate`：
    - `canSwitchToday` → 狀態 `switch`，主結果為 `best`，標示「切到 X」
    - 否則 → 狀態 `now`，主結果為 `now`，附註 `tomorrow`：「明天切到 X 可得 Y%」
  - 否則狀態 `now`
  - 未設定 `currentPlan`：所有方案視為 `switch`（提示先設定目前方案）

### 排序

依主結果 `rate` 由高到低；同分時 `now` 優先於 `switch`，再依 `conditions` 數量少者優先，再依卡名。`tomorrow` 附註不影響排序。

### 回傳

```js
[{ cardId, paymentId, rate, ruleTitle, status: 'now'|'switch',
   planId, conditions, validThrough, stale, tomorrow: { planId, rate } | null }]
```

`stale` = `today - card.lastVerified > 45 天`。

## 介面（`app.js`）

1. **步驟 1：付款方式** — 多選 + 「全選」，預設全選；每次開啟重置為全選。
2. **步驟 2：店家** — 搜尋框（比對 `name` 與 `aliases`，子字串、不分大小寫）+ 店家按鈕，第一顆固定為「一般消費」。
3. **結果** — 點店家即時渲染；每列顯示：名次、卡名 × 付款方式、回饋率、規則名、條件標籤、到期日、⚠ 資料可能過期、方案狀態；`switch` 列附「我切了」按鈕（將 `currentPlan` 設為建議方案、`lastSwitchDate` 設為今天，重新渲染）。
4. **我的卡** — 勾選持有卡片；方案卡另有「目前方案」下拉與「今天已切過」勾選框。改下拉時自動勾選今天已切過（可手動取消）。

### localStorage（key：`card-picker:v1`）

```json
{ "owned": ["cube"], "planState": { "cube": { "currentPlan": "jingxuan", "lastSwitchDate": "2026-10-06" } } }
```

`today` 以使用者裝置本地時區的日期計算。

## 錯誤處理

| 情境 | 行為 |
|---|---|
| `cards.json` 載入或解析失敗 | 顯示錯誤訊息，不渲染查詢區 |
| 未勾任何持有卡 | 結果區提示前往「我的卡」 |
| 未勾任何付款方式 | 提示至少勾一種 |
| 搜尋無結果 | 提示改選「一般消費」 |
| 無任何適用組合 | 顯示「沒有適用的卡」 |
| localStorage 不可用 | 退回記憶體，功能正常但不保存 |
| localStorage 內含已不存在的卡或方案 | 讀取時略過 |

## 測試

`tests/engine.test.js`（使用小型 fixture，不依賴真實資料）：

- 付款方式不符 → 不適用
- `general` / `merchants` / `cats` 命中；`excludeMerchants` 排除
- 「一般消費」只套 `general`
- `validFrom` / `validThrough` 邊界（含首尾日）
- 只列出持有的卡
- 方案卡：目前方案最佳 → `now`；未切且他方案較佳 → `switch`；已切且他方案較佳 → `now` + `tomorrow`；跨日後 `lastSwitchDate` 為昨天 → 可切；未設定目前方案
- 排序與同分規則
- `stale` 判定（45 天邊界）

`tests/data.test.js`（驗證真實 `data/cards.json`）：

- 所有 id 唯一；規則引用的 `card`、`plan`、`merchants`、`excludeMerchants`、`payments` 都存在
- 日期格式正確；`rate` 為非負數字；`payments` 非空
- 方案卡有 `switchPerDay`；每條規則至少有一種店家適用方式

## 初始資料

放 2–3 張範例卡（含 1 張方案卡），`title` 標示「範例」，數字非真實，由維護者替換為官網查證後的資料。
