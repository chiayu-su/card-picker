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
