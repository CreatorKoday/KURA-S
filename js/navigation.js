// ==========================================================
// 画面切り替え(ホーム / 買い物リスト / 在庫確認)
// ==========================================================

import { loadShoppingList } from "./shopping.js";
import { loadItems } from "./items.js";

export function switchView(view) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.getElementById("view-" + view).classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.view === view);
  });
  // ホーム画面以外ではKURA:Sロゴ・ログアウト行を隠す(共通通知欄#app-noticeは他の画面でも
  // 案内メッセージを表示できるよう隠さない。空になった時の見た目はcommon.cssのcss :has()で調整)
  const appHeaderTop = document.querySelector(".app-header-top");
  if (appHeaderTop) appHeaderTop.classList.toggle("hidden", view !== "home");
  // 在庫確認画面以外へ切り替える際は、商品名検索欄の入力を毎回リセットする(賞味期限の
  // お知らせなどから特定の商品名で絞り込んだ状態のまま次回開いてしまうのを防ぐため)
  if (view !== "inventory") {
    const searchInput = document.getElementById("inventory-search");
    if (searchInput) searchInput.value = "";
  }
  if (view === "shopping") loadShoppingList();
  if (view === "inventory") loadItems();
}

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

// 「手動で登録」「手動で消費」はホーム画面内のタブに統合されたため、ここでの遷移は不要になった
