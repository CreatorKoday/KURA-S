// ==========================================================
// ホーム画面: 「商品を登録」「商品を消費」の各アコーディオン内で、
// バーコード/AI/手動の3ボタンを、選んだ内容にその場で差し替える。
//
// ・バーコード: 3ボタンの位置にスキャナー(カメラ)をその場で表示し、自動起動する。
// ・AI: ボタンやウィンドウを表示せず、直接カメラ/写真選択を起動する。
//   判定結果(review-section)が出たら3ボタンをその場で隠して差し替える。
// ・手動: 3ボタンの位置に手動フォーム/検索欄をその場で表示する。
//
// 【重要】このファイルは見た目・表示切り替えの制御のみを行う。
// photo-btn / add-item-btn / consume-photo-btn / manual-confirm-consume-btn などは、
// aiPhoto.js / items.js / consume.js に元々あるイベントリスナーがそのまま動作する
// (ここでは追加のリスナーを乗せて表示切り替えを制御するだけ)。
// バーコードの開始/停止だけは対応するボタンが存在しないため、
// barcode.js の startScanner/stopScanner を直接呼び出す。
// ==========================================================

import { startScanner, stopScanner } from "./barcode.js";

// classList.add/remove は対象のトークンがすでにあっても常に属性を書き換えるため、
// 何もしなくてよい場合はそもそも呼ばないようにする
// (呼ぶと MutationObserver が不要に発火し、他の表示切り替えを巻き戻してしまうため)
function show(id) {
  const el = document.getElementById(id);
  if (el.classList.contains("hidden")) el.classList.remove("hidden");
}
function hide(id) {
  const el = document.getElementById(id);
  if (!el.classList.contains("hidden")) el.classList.add("hidden");
}

// ---------- 商品を登録 ----------

function hideRegisterExtras() {
  document.getElementById("tab-panel-barcode").classList.remove("active");
  document.getElementById("tab-panel-manual").classList.remove("active");
  hide("review-section");
}

function openRegisterBarcode() {
  hide("register-sub-grid");
  hideRegisterExtras();
  document.getElementById("tab-panel-barcode").classList.add("active");
  startScanner("register");
}

function closeRegisterBarcode() {
  if (!document.getElementById("scanner-wrap").classList.contains("hidden")) {
    stopScanner();
  }
  document.getElementById("tab-panel-barcode").classList.remove("active");
  show("register-sub-grid");
}

function openRegisterAi() {
  document.getElementById("photo-btn").click();
}

function openRegisterManual() {
  hide("register-sub-grid");
  hideRegisterExtras();
  document.getElementById("tab-panel-manual").classList.add("active");
}

function closeRegisterManual() {
  document.getElementById("tab-panel-manual").classList.remove("active");
  show("register-sub-grid");
}

// ---------- 商品を消費 ----------

function hideConsumeExtras() {
  document.getElementById("tab-panel-consume-barcode").classList.remove("active");
  document.getElementById("tab-panel-consume-manual").classList.remove("active");
  hide("consume-review-section");
}

function openConsumeBarcode() {
  hide("consume-sub-grid");
  hideConsumeExtras();
  document.getElementById("tab-panel-consume-barcode").classList.add("active");
  startScanner("consume");
}

function closeConsumeBarcode() {
  if (!document.getElementById("consume-scanner-wrap").classList.contains("hidden")) {
    stopScanner();
  }
  document.getElementById("tab-panel-consume-barcode").classList.remove("active");
  show("consume-sub-grid");
}

function openConsumeAi() {
  document.getElementById("consume-photo-btn").click();
}

function openConsumeManual() {
  hide("consume-sub-grid");
  hideConsumeExtras();
  document.getElementById("tab-panel-consume-manual").classList.add("active");
}

function closeConsumeManual() {
  document.getElementById("tab-panel-consume-manual").classList.remove("active");
  show("consume-sub-grid");
}

document.querySelectorAll(".action-menu-card").forEach(card => {
  card.addEventListener("click", () => {
    const target = card.dataset.target;
    if (target === "barcode") openRegisterBarcode();
    else if (target === "ai") openRegisterAi();
    else if (target === "manual") openRegisterManual();
    else if (target === "consume-barcode") openConsumeBarcode();
    else if (target === "consume-ai") openConsumeAi();
    else if (target === "consume-manual") openConsumeManual();
  });
});

document.getElementById("close-barcode-btn").addEventListener("click", closeRegisterBarcode);
document.getElementById("close-manual-btn").addEventListener("click", closeRegisterManual);
document.getElementById("close-consume-barcode-btn").addEventListener("click", closeConsumeBarcode);
document.getElementById("close-consume-manual-btn").addEventListener("click", closeConsumeManual);

// ---------- 完了したら自動で3ボタン表示に戻す ----------

function watchSuccessMessage(elId, onSuccess) {
  const el = document.getElementById(elId);
  new MutationObserver(() => {
    if (el.classList.contains("msg-ok") && el.textContent) {
      setTimeout(onSuccess, 700);
    }
  }).observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class"] });
}

watchSuccessMessage("manual-add-message", closeRegisterManual);     // 手動登録の成功
watchSuccessMessage("manual-consume-message", closeConsumeManual);  // 手動削除の成功

// AIでの判定結果(review-section)の表示/非表示に合わせて、登録の3ボタンを差し替える
const reviewSectionEl = document.getElementById("review-section");
new MutationObserver(() => {
  if (reviewSectionEl.classList.contains("hidden")) {
    show("register-sub-grid");
  } else {
    hide("register-sub-grid");
    document.getElementById("tab-panel-barcode").classList.remove("active");
    document.getElementById("tab-panel-manual").classList.remove("active");
  }
}).observe(reviewSectionEl, { attributes: true, attributeFilter: ["class"] });

// バーコード/AIどちらの消費結果(consume-review-section)でも、消費の3ボタンを差し替える
const consumeReviewSectionEl = document.getElementById("consume-review-section");
new MutationObserver(() => {
  if (consumeReviewSectionEl.classList.contains("hidden")) {
    show("consume-sub-grid");
  } else {
    hide("consume-sub-grid");
    document.getElementById("tab-panel-consume-barcode").classList.remove("active");
    document.getElementById("tab-panel-consume-manual").classList.remove("active");
  }
}).observe(consumeReviewSectionEl, { attributes: true, attributeFilter: ["class"] });

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
