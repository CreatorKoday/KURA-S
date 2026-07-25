// ==========================================================
// 購入・消費サマリー(月間カレンダー)ページ
//
// 支出管理メニュー(js/expenseMenu.js)の「日別カレンダー」から開く。item_history
// (quantity×price)を日付ごとに集計し、その日に購入した金額・消費した金額を
// カレンダーの日付マスに表示するだけの読み取り専用ページ。日付選択用の自作カレンダー
// (js/calendar.js)とは目的(値の選択 ではなく 集計の表示)が異なるため、別モジュールとして実装している
//
// フィルターは購入履歴ページ(js/history.js)のものとは独立した専用の状態
// (appliedSummaryFilters)を持ち、購入履歴側の絞り込みはこのページの表示に影響しない
// ==========================================================

import { supabaseClient } from "./config.js";
import { escapeHtml } from "./utils.js";
import { switchView } from "./navigation.js";
import { openHistoryForDate, computeHistoryRowAmount } from "./history.js";

let summaryViewDate = new Date();

function localDateKey(dateLike) {
  const d = new Date(dateLike);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function renderSummaryCalendar(year, month, totalsByDay) {
  const grid = document.getElementById("summary-calendar-grid");
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = localDateKey(new Date());

  const dows = ["日", "月", "火", "水", "木", "金", "土"];
  let html = dows.map(d => `<div class="summary-cal-dow">${d}</div>`).join("");

  for (let i = 0; i < startWeekday; i++) html += `<div class="summary-cal-day empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const key = localDateKey(new Date(year, month, d));
    const totals = totalsByDay[key] || { purchase: 0, consumption: 0 };
    const isToday = key === todayKey;

    html += `
      <div class="summary-cal-day ${isToday ? "today" : ""}" data-date="${key}">
        <span class="summary-cal-day-num">${d}</span>
        ${totals.purchase > 0 ? `
          <span class="summary-cal-line purchase">
            <span class="material-symbols-rounded">shopping_cart</span>${Math.round(totals.purchase)}
          </span>` : ""}
        ${totals.consumption > 0 ? `
          <span class="summary-cal-line consumption">
            <span class="material-symbols-rounded">remove</span>${Math.round(totals.consumption)}
          </span>` : ""}
      </div>
    `;
  }

  grid.innerHTML = html;
}

async function loadSummaryMonth() {
  const year = summaryViewDate.getFullYear();
  const month = summaryViewDate.getMonth();
  document.getElementById("summary-cal-month-label").textContent = `${year}年${month + 1}月`;

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);

  const { data, error } = await supabaseClient
    .from("item_history")
    .select("occurred_at, event_type, quantity, price, unit, item_type, canonical_name")
    .gte("occurred_at", monthStart.toISOString())
    .lt("occurred_at", monthEnd.toISOString());

  const totalsByDay = {};
  if (!error && data) {
    // このページ専用のフィルター(購入履歴のフィルターとは独立)をサマリーに反映する
    data.filter(matchesSummaryFilters).forEach(row => {
      // 価格が無い記録(AI写真判定経由など)は金額を計算できないため集計から除く
      if (row.price === null || row.price === undefined) return;
      const key = localDateKey(row.occurred_at);
      // 定量系(g/ml等)はitem_history.priceが「100◯当たりの単価」のため、
      // js/history.jsのcomputeHistoryRowAmountで正しく換算する(数量×単価では誤る)
      const amount = computeHistoryRowAmount(row);
      if (!totalsByDay[key]) totalsByDay[key] = { purchase: 0, consumption: 0 };
      totalsByDay[key][row.event_type] = (totalsByDay[key][row.event_type] || 0) + amount;
    });
  }

  if (error) console.error("サマリーの取得に失敗:", error);
  renderSummaryCalendar(year, month, totalsByDay);
}

// 年月のプルダウン選択。消費期限入力のカレンダー(#calendar-overlay)と同じく、
// 画面の上の層に背景をぼかして表示するオーバーレイにする(サマリーは常にどこかの
// 月を表示するため「未設定にする」ボタンは無い)
const summaryYearSelect = document.getElementById("summary-cal-year-select");
const summaryMonthSelect = document.getElementById("summary-cal-month-select");
for (let m = 1; m <= 12; m++) {
  const opt = document.createElement("option");
  opt.value = m;
  opt.textContent = m + "月";
  summaryMonthSelect.appendChild(opt);
}

function closeSummaryYearMonthOverlay() {
  document.getElementById("summary-yearmonth-overlay").classList.add("hidden");
}

document.getElementById("summary-cal-month-label").addEventListener("click", () => {
  const currentYear = new Date().getFullYear();
  const viewYear = summaryViewDate.getFullYear();
  summaryYearSelect.innerHTML = "";
  for (let y = currentYear; y <= currentYear + 10; y++) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y + "年";
    if (y === viewYear) opt.selected = true;
    summaryYearSelect.appendChild(opt);
  }
  summaryMonthSelect.value = summaryViewDate.getMonth() + 1;

  document.getElementById("summary-yearmonth-overlay").classList.remove("hidden");
});

document.getElementById("summary-yearmonth-overlay").addEventListener("click", (e) => {
  if (e.target.id === "summary-yearmonth-overlay") closeSummaryYearMonthOverlay();
});
document.getElementById("summary-yearmonth-close-btn").addEventListener("click", closeSummaryYearMonthOverlay);

function applySummaryYearMonthSelection() {
  summaryViewDate = new Date(Number(summaryYearSelect.value), Number(summaryMonthSelect.value) - 1, 1);
  closeSummaryYearMonthOverlay();
  loadSummaryMonth();
}
summaryYearSelect.addEventListener("change", applySummaryYearMonthSelection);
summaryMonthSelect.addEventListener("change", applySummaryYearMonthSelection);

document.getElementById("summary-cal-prev").addEventListener("click", () => {
  summaryViewDate = new Date(summaryViewDate.getFullYear(), summaryViewDate.getMonth() - 1, 1);
  loadSummaryMonth();
});
document.getElementById("summary-cal-next").addEventListener("click", () => {
  summaryViewDate = new Date(summaryViewDate.getFullYear(), summaryViewDate.getMonth() + 1, 1);
  loadSummaryMonth();
});

// カレンダーのマスはloadSummaryMonth()のたびに再生成されるため、グリッドへの委譲で拾う
document.getElementById("summary-calendar-grid").addEventListener("click", (e) => {
  const day = e.target.closest(".summary-cal-day:not(.empty)");
  if (!day) return;
  openHistoryForDate(day.dataset.date);
});

// 支出管理メニューから呼び出す入口。js/expenseMenu.jsのEXPENSE_REPORT_DEFSがこの関数を参照する
export function openSummaryPage() {
  switchView("summary");
  summaryViewDate = new Date();
  closeSummaryYearMonthOverlay();
  loadSummaryMonth();
}
document.getElementById("summary-back-btn").addEventListener("click", () => switchView("expense-menu"));

// ---------- このページ専用の絞り込みフィルター(購入履歴の絞り込みと同じAmazon風2ペイン) ----------
// 購入履歴のappliedHistoryFiltersとは別の独立した状態を持つ(このページの表示にのみ反映する)

const summaryFilterDefs = [
  { key: "date", label: "日付", kind: "range-date" },
  { key: "type", label: "種別", kind: "checkbox" },
  { key: "canonicalName", label: "標準商品名", kind: "checkbox" },
  { key: "eventType", label: "区分", kind: "checkbox" },
  { key: "price", label: "価格", kind: "range-number" }
];

export const appliedSummaryFilters = {
  dateFrom: "", dateTo: "",
  type: new Set(), canonicalName: new Set(), eventType: new Set(),
  priceMin: "", priceMax: ""
};

let stagedSummaryFilterSets = { type: new Set(), canonicalName: new Set(), eventType: new Set() };
let stagedSummaryDateFrom = "";
let stagedSummaryDateTo = "";
let stagedSummaryPriceMin = "";
let stagedSummaryPriceMax = "";
let activeSummaryFilterKey = summaryFilterDefs[0].key;

// フィルターの選択肢(標準商品名・種別・区分の一覧)を出すための元データ。
// サマリー自体は表示中の月だけを取得するため、選択肢の列挙にはこの専用の
// 軽量な取得(canonical_name/item_type/event_typeのみ)を使う(フィルターを開くたびに取得)
let summaryFilterSourceRows = [];

async function loadSummaryFilterSourceRows() {
  const { data, error } = await supabaseClient
    .from("item_history")
    .select("canonical_name, item_type, event_type");
  if (!error && data) summaryFilterSourceRows = data;
}

function eventTypeLabel(value) {
  return value === "purchase" ? "購入" : "消費";
}

function computeSummaryTypeOptions() {
  return Array.from(new Set(summaryFilterSourceRows.map(r => r.item_type).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ja"));
}
function computeSummaryCanonicalNameOptions() {
  return Array.from(new Set(summaryFilterSourceRows.map(r => r.canonical_name).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ja"));
}
function computeSummaryEventTypeOptions() {
  return Array.from(new Set(summaryFilterSourceRows.map(r => r.event_type).filter(Boolean)));
}

function optionsForSummaryFilterKey(key) {
  if (key === "type") return computeSummaryTypeOptions();
  if (key === "canonicalName") return computeSummaryCanonicalNameOptions();
  if (key === "eventType") return computeSummaryEventTypeOptions();
  return [];
}

function saveActiveSummaryRangeInputs() {
  if (activeSummaryFilterKey === "date") {
    const fromEl = document.getElementById("summary-filter-date-from");
    const toEl = document.getElementById("summary-filter-date-to");
    if (fromEl) stagedSummaryDateFrom = fromEl.value;
    if (toEl) stagedSummaryDateTo = toEl.value;
  } else if (activeSummaryFilterKey === "price") {
    const minEl = document.getElementById("summary-filter-price-min");
    const maxEl = document.getElementById("summary-filter-price-max");
    if (minEl) stagedSummaryPriceMin = minEl.value;
    if (maxEl) stagedSummaryPriceMax = maxEl.value;
  }
}

function renderSummaryFilterTypes() {
  const el = document.getElementById("summary-filter-types");
  el.innerHTML = summaryFilterDefs.map(def => `
    <div class="filter-type-row ${def.key === activeSummaryFilterKey ? "active" : ""}" data-key="${def.key}">${def.label}</div>
  `).join("");
}

function renderSummaryFilterOptions() {
  const el = document.getElementById("summary-filter-options");
  const def = summaryFilterDefs.find(d => d.key === activeSummaryFilterKey);

  if (def.kind === "range-date") {
    el.innerHTML = `
      <div class="history-filter-range-row">
        <label>開始日</label>
        <input type="text" class="date-display" id="summary-filter-date-from" placeholder="指定なし" readonly value="${escapeHtml(stagedSummaryDateFrom)}">
      </div>
      <div class="history-filter-range-row">
        <label>終了日</label>
        <input type="text" class="date-display" id="summary-filter-date-to" placeholder="指定なし" readonly value="${escapeHtml(stagedSummaryDateTo)}">
      </div>
    `;
    return;
  }

  if (def.kind === "range-number") {
    el.innerHTML = `
      <div class="history-filter-range-row">
        <label>最小(円)</label>
        <input type="number" id="summary-filter-price-min" placeholder="指定なし" value="${escapeHtml(stagedSummaryPriceMin)}">
      </div>
      <div class="history-filter-range-row">
        <label>最大(円)</label>
        <input type="number" id="summary-filter-price-max" placeholder="指定なし" value="${escapeHtml(stagedSummaryPriceMax)}">
      </div>
    `;
    return;
  }

  const options = optionsForSummaryFilterKey(activeSummaryFilterKey);
  const set = stagedSummaryFilterSets[activeSummaryFilterKey];
  el.innerHTML = options.length
    ? options.map(value => `
        <div class="filter-option-row" data-value="${escapeHtml(value)}">
          <span class="filter-option-checkbox ${set.has(value) ? "checked" : ""}"></span>
          <span>${escapeHtml(activeSummaryFilterKey === "eventType" ? eventTypeLabel(value) : value)}</span>
        </div>
      `).join("")
    : '<div class="empty-note">選択肢がありません。</div>';
}

function renderSummaryFilterSummary() {
  const el = document.getElementById("summary-filter-summary");
  const parts = [];
  if (stagedSummaryDateFrom || stagedSummaryDateTo) parts.push(`[${stagedSummaryDateFrom || "…"}〜${stagedSummaryDateTo || "…"}]`);
  if (stagedSummaryFilterSets.type.size > 0) parts.push(`[${Array.from(stagedSummaryFilterSets.type).join("・")}]`);
  if (stagedSummaryFilterSets.canonicalName.size > 0) parts.push(`[${Array.from(stagedSummaryFilterSets.canonicalName).join("・")}]`);
  if (stagedSummaryFilterSets.eventType.size > 0) parts.push(`[${Array.from(stagedSummaryFilterSets.eventType).map(eventTypeLabel).join("・")}]`);
  if (stagedSummaryPriceMin || stagedSummaryPriceMax) parts.push(`[${stagedSummaryPriceMin || "0"}円〜${stagedSummaryPriceMax || "∞"}円]`);

  const text = parts.join(" > ");
  el.textContent = text;
  el.classList.toggle("hidden", !text);
}

function updateSummaryFilterButtonLabel() {
  const count =
    (appliedSummaryFilters.dateFrom || appliedSummaryFilters.dateTo ? 1 : 0) +
    appliedSummaryFilters.type.size +
    appliedSummaryFilters.canonicalName.size +
    appliedSummaryFilters.eventType.size +
    (appliedSummaryFilters.priceMin || appliedSummaryFilters.priceMax ? 1 : 0);

  const label = document.querySelector("#summary-filter-btn .inventory-filter-btn-label");
  label.textContent = count > 0 ? `フィルター (${count})` : "フィルター";
}

async function openSummaryFilterOverlay() {
  stagedSummaryFilterSets = {
    type: new Set(appliedSummaryFilters.type),
    canonicalName: new Set(appliedSummaryFilters.canonicalName),
    eventType: new Set(appliedSummaryFilters.eventType)
  };
  stagedSummaryDateFrom = appliedSummaryFilters.dateFrom;
  stagedSummaryDateTo = appliedSummaryFilters.dateTo;
  stagedSummaryPriceMin = appliedSummaryFilters.priceMin;
  stagedSummaryPriceMax = appliedSummaryFilters.priceMax;
  activeSummaryFilterKey = summaryFilterDefs[0].key;

  await loadSummaryFilterSourceRows();
  renderSummaryFilterTypes();
  renderSummaryFilterOptions();
  renderSummaryFilterSummary();
  document.getElementById("summary-filter-overlay").classList.remove("hidden");
}

function closeSummaryFilterOverlay() {
  document.getElementById("summary-filter-overlay").classList.add("hidden");
}

document.getElementById("summary-filter-btn").addEventListener("click", openSummaryFilterOverlay);
document.getElementById("summary-filter-close-btn").addEventListener("click", closeSummaryFilterOverlay);
document.getElementById("summary-filter-overlay").addEventListener("click", (e) => {
  if (e.target.id === "summary-filter-overlay") closeSummaryFilterOverlay();
});

document.getElementById("summary-filter-types").addEventListener("click", (e) => {
  const row = e.target.closest(".filter-type-row");
  if (!row) return;
  saveActiveSummaryRangeInputs();
  activeSummaryFilterKey = row.dataset.key;
  renderSummaryFilterTypes();
  renderSummaryFilterOptions();
});

document.getElementById("summary-filter-options").addEventListener("click", (e) => {
  const row = e.target.closest(".filter-option-row");
  if (!row) return;
  const set = stagedSummaryFilterSets[activeSummaryFilterKey];
  const value = row.dataset.value;
  if (set.has(value)) set.delete(value); else set.add(value);
  renderSummaryFilterOptions();
  renderSummaryFilterSummary();
});

document.getElementById("summary-filter-options").addEventListener("input", (e) => {
  if (!e.target.matches("#summary-filter-price-min, #summary-filter-price-max")) return;
  saveActiveSummaryRangeInputs();
  renderSummaryFilterSummary();
});
document.getElementById("summary-filter-options").addEventListener("change", (e) => {
  if (!e.target.matches("#summary-filter-date-from, #summary-filter-date-to")) return;
  saveActiveSummaryRangeInputs();
  renderSummaryFilterSummary();
});

document.getElementById("summary-filter-clear-btn").addEventListener("click", () => {
  stagedSummaryFilterSets = { type: new Set(), canonicalName: new Set(), eventType: new Set() };
  stagedSummaryDateFrom = ""; stagedSummaryDateTo = ""; stagedSummaryPriceMin = ""; stagedSummaryPriceMax = "";
  renderSummaryFilterOptions();
  renderSummaryFilterSummary();
});

document.getElementById("summary-filter-apply-btn").addEventListener("click", () => {
  saveActiveSummaryRangeInputs();
  appliedSummaryFilters.dateFrom = stagedSummaryDateFrom;
  appliedSummaryFilters.dateTo = stagedSummaryDateTo;
  appliedSummaryFilters.type = new Set(stagedSummaryFilterSets.type);
  appliedSummaryFilters.canonicalName = new Set(stagedSummaryFilterSets.canonicalName);
  appliedSummaryFilters.eventType = new Set(stagedSummaryFilterSets.eventType);
  appliedSummaryFilters.priceMin = stagedSummaryPriceMin;
  appliedSummaryFilters.priceMax = stagedSummaryPriceMax;

  updateSummaryFilterButtonLabel();
  closeSummaryFilterOverlay();
  loadSummaryMonth();
});

function matchesSummaryFilters(row) {
  const dateKey = localDateKey(row.occurred_at);
  if (appliedSummaryFilters.dateFrom && dateKey < appliedSummaryFilters.dateFrom) return false;
  if (appliedSummaryFilters.dateTo && dateKey > appliedSummaryFilters.dateTo) return false;
  if (appliedSummaryFilters.type.size > 0 && !appliedSummaryFilters.type.has(row.item_type)) return false;
  if (appliedSummaryFilters.canonicalName.size > 0 && !appliedSummaryFilters.canonicalName.has(row.canonical_name)) return false;
  if (appliedSummaryFilters.eventType.size > 0 && !appliedSummaryFilters.eventType.has(row.event_type)) return false;
  if (appliedSummaryFilters.priceMin !== "" && (row.price === null || row.price === undefined || Number(row.price) < Number(appliedSummaryFilters.priceMin))) return false;
  if (appliedSummaryFilters.priceMax !== "" && (row.price === null || row.price === undefined || Number(row.price) > Number(appliedSummaryFilters.priceMax))) return false;
  return true;
}
