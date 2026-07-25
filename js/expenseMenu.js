// ==========================================================
// 支出管理メニュー
//
// ホーム画面の「支出管理」カードから開く、集計表の入口一覧ページ。表示するのは
// EXPENSE_REPORT_DEFS配列に定義したボタンのみで、今後表の種類を増やす場合は
// この配列に{key, label, desc, icon, onOpen}を1つ足すだけでよい構造にしている
// (onOpenには、その集計表を開く処理を持つモジュールがexportする関数を渡す)
// ==========================================================

import { switchView } from "./navigation.js";
import { openSummaryPage } from "./summary.js";
import { openBalanceSheetPage } from "./balanceSheet.js";

const EXPENSE_REPORT_DEFS = [
  { key: "calendar", label: "日別カレンダー", desc: "購入・消費", icon: "calendar_month", onOpen: openSummaryPage },
  { key: "balanceSheet", label: "月間集計B/S", desc: "貸借対照表", icon: "balance", onOpen: openBalanceSheetPage }
];

function renderExpenseMenu() {
  const container = document.getElementById("expense-menu-list");
  container.innerHTML = EXPENSE_REPORT_DEFS.map(def => `
    <button type="button" class="insight-card" data-key="${def.key}">
      <span class="insight-icon"><span class="material-symbols-rounded">${def.icon}</span></span>
      <span class="insight-title">${def.label}</span>
      <span class="insight-desc">${def.desc}</span>
    </button>
  `).join("");
}

document.getElementById("expense-menu-list").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-key]");
  if (!btn) return;
  const def = EXPENSE_REPORT_DEFS.find(d => d.key === btn.dataset.key);
  if (def) def.onOpen();
});

document.getElementById("expense-menu-open-btn").addEventListener("click", () => {
  renderExpenseMenu();
  switchView("expense-menu");
});
document.getElementById("expense-menu-back-btn").addEventListener("click", () => switchView("home"));
