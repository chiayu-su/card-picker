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
