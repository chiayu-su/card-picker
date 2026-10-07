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

## 家人朋友名單

名單在 `data/profiles.json`，每個人一筆：

```json
{ "name": "mom", "cards": ["cube", "eva"] }
```

- `name` 只能用英文字母、數字和 `-`，同時是顯示名稱和網址代號。
- `cards` 填 `data/cards.json` 裡的卡片 id；留空陣列代表全部卡片。
- 給每個人專屬網址 `https://chiayu-su.github.io/card-picker/?p=<name>`，用這個網址加到主畫面就不用選人。
- 沒帶名字的網址第一次會跳出「你是誰？」，選一次就記住；「訪客」會比較全部卡片。

## 部署到 GitHub Pages

1. 在 GitHub 建立 repo，`git remote add origin <url>`，`git push -u origin main`。
2. repo 的 Settings → Pages → Source 選 `Deploy from a branch`，Branch 選 `main` / `/ (root)`。
3. 幾分鐘後網址會出現在同一頁；手機用 Safari 打開後「加入主畫面」。
