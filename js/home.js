// ==========================================================
// ホーム画面のダッシュボード化
//
// 「食材を登録」「食材を消費」は1つのパネルにまとまっており、
// パネル上部の「登録 / 消費」ボタンで、パネルを閉じずにその場で
// モードを切り替えられる。各モードの中はさらにセグメントタブ
// (バーコード/AI/手動)で切り替える。
// パネルを開くとダッシュボードの2つのボタンは隠れ、閉じると再表示される。
//
// 【重要】このファイルは見た目・表示切り替えの制御のみを行う。
// scan-btn / photo-btn / add-item-btn / consume-scan-btn / consume-photo-btn /
// manual-confirm-consume-btn などは、barcode.js / aiPhoto.js / items.js /
// consume.js に元々あるイベントリスナーがそのまま動作する
// (ここでは追加のリスナーを乗せて表示切り替えを制御するだけ)。
// ==========================================================

function show(id) { document.getElementById(id).classList.remove("hidden"); }
function hide(id) { document.getElementById(id).classList.add("hidden"); }

const dashboardGrid = document.querySelector(".dashboard-grid");
const actionPanel = document.getElementById("action-panel-section");
const actionPanelTitle = document.getElementById("action-panel-title");

const MODE_TITLES = { register: "食材を登録", consume: "食材を消費" };
const MODE_DEFAULT_TAB = { register: "barcode", consume: "consume-barcode" };

function selectTab(target) {
  document.querySelectorAll(".segmented-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.tabTarget === target);
  });
  document.querySelectorAll(".tab-panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === "tab-panel-" + target);
  });
}

function selectMode(mode) {
  document.querySelectorAll(".mode-switch-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.modeTarget === mode);
  });
  document.querySelectorAll(".mode-panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === "mode-panel-" + mode);
  });
  actionPanelTitle.textContent = MODE_TITLES[mode];
  selectTab(MODE_DEFAULT_TAB[mode]);
}

document.querySelectorAll(".mode-switch-btn").forEach(btn => {
  btn.addEventListener("click", () => selectMode(btn.dataset.modeTarget));
});
document.querySelectorAll(".segmented-tab").forEach(tab => {
  tab.addEventListener("click", () => selectTab(tab.dataset.tabTarget));
});

// ---------- パネルの開閉 ----------

function openActionPanel(mode) {
  dashboardGrid.classList.add("hidden");
  show("action-panel-section");
  selectMode(mode);
  actionPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeActionPanel() {
  hide("action-panel-section");
  dashboardGrid.classList.remove("hidden");
  selectMode("register");
}

document.getElementById("open-register-modal-btn").addEventListener("click", () => openActionPanel("register"));
document.getElementById("open-consume-modal-btn").addEventListener("click", () => openActionPanel("consume"));
document.getElementById("close-action-panel-btn").addEventListener("click", closeActionPanel);

// ---------- 完了したら自動でパネルを閉じる ----------

function watchSuccessMessage(elId, onSuccess) {
  const el = document.getElementById(elId);
  new MutationObserver(() => {
    if (el.classList.contains("msg-ok") && el.textContent) {
      setTimeout(onSuccess, 700);
    }
  }).observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class"] });
}

// 手動登録が成功したら閉じる
watchSuccessMessage("manual-add-message", closeActionPanel);
// 手動消費が成功したら閉じる
watchSuccessMessage("manual-consume-message", closeActionPanel);
// バーコード/AI経由の消費が確定されたら閉じる
watchSuccessMessage("consume-message", closeActionPanel);

// AIでの一括登録が完了(またはキャンセル)されたら閉じる
const reviewSectionEl = document.getElementById("review-section");
new MutationObserver(() => {
  if (reviewSectionEl.classList.contains("hidden")) closeActionPanel();
}).observe(reviewSectionEl, { attributes: true, attributeFilter: ["class"] });
