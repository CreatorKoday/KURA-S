// ==========================================================
// ホーム画面: 挨拶・日付の表示のみを行う。
//
// 「商品を登録」「商品を消費」(AI/手動)は、ナビバー中央の円形メニュー
// (js/navRadial.js)に移設済み。
// ==========================================================

import { closeRegisterOverlay } from "./items.js";

// ---------- 完了したら自動でオーバーレイを閉じる ----------

function watchSuccessMessage(elId, onSuccess) {
  const el = document.getElementById(elId);
  new MutationObserver(() => {
    if (el.classList.contains("msg-ok") && el.textContent) {
      setTimeout(onSuccess, 700);
    }
  }).observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class"] });
}

watchSuccessMessage("manual-add-message", closeRegisterOverlay); // 手動登録の成功

// ---------- 挨拶・日付の表示 ----------

function renderHomeGreeting() {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 5 ? "こんばんは" : hour < 11 ? "おはようございます" : hour < 18 ? "こんにちは" : "こんばんは";
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][now.getDay()];
  document.getElementById("home-greeting").textContent = greeting;
  document.getElementById("home-date").textContent =
    `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日(${weekday})`;
}
renderHomeGreeting();
