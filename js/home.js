// ==========================================================
// ホーム画面のダッシュボード化
//
// 「食材を登録」: ページ遷移・モーダルを使わず、セグメントタブ(バーコード/AI/手動)
//                で切り替える、常に一定の高さに収まる落ち着いたUI
// 「食材を消費」: 従来通りのモーダル(今回は変更しない)
//
// 【重要】このファイルは見た目・表示切り替えの制御のみを行う。
// scan-btn / photo-btn / add-item-btn / consume-scan-btn / consume-photo-btn /
// goto-manual-consume-btn は、barcode.js / aiPhoto.js / items.js / consume.js /
// navigation.js に元々あるイベントリスナーがそのまま動作する
// (ここでは追加のリスナーを乗せて表示切り替えを制御するだけ)。
// ==========================================================

function show(id) { document.getElementById(id).classList.remove("hidden"); }
function hide(id) { document.getElementById(id).classList.add("hidden"); }

// ---------- 食材を登録: セグメントタブ ----------

const registerSection = document.getElementById("register-accordion-section");
const DEFAULT_TAB = "barcode";

function selectTab(target) {
  document.querySelectorAll(".segmented-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.tabTarget === target);
  });
  document.querySelectorAll(".tab-panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === "tab-panel-" + target);
  });
}

document.querySelectorAll(".segmented-tab").forEach(tab => {
  tab.addEventListener("click", () => selectTab(tab.dataset.tabTarget));
});

document.getElementById("open-register-modal-btn").addEventListener("click", () => {
  show("register-accordion-section");
  selectTab(DEFAULT_TAB);
  registerSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

document.getElementById("close-register-accordion-btn").addEventListener("click", () => {
  closeRegisterSection();
});

function closeRegisterSection() {
  hide("register-accordion-section");
  selectTab(DEFAULT_TAB);
}

// 登録が完了したら(手動登録フォームが成功メッセージを表示したら)パネルを閉じる
const manualAddMessageEl = document.getElementById("manual-add-message");
new MutationObserver(() => {
  if (manualAddMessageEl.classList.contains("msg-ok") && manualAddMessageEl.textContent) {
    setTimeout(closeRegisterSection, 700);
  }
}).observe(manualAddMessageEl, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class"] });

// AIでの一括登録が完了(またはキャンセル)されたら、レビューが閉じられるのでパネルも閉じる
const reviewSectionEl = document.getElementById("review-section");
new MutationObserver(() => {
  if (reviewSectionEl.classList.contains("hidden")) {
    closeRegisterSection();
  }
}).observe(reviewSectionEl, { attributes: true, attributeFilter: ["class"] });

// ---------- 食材を消費: モーダル(従来通り) ----------

document.getElementById("open-consume-modal-btn").addEventListener("click", () => {
  show("consume-modal-overlay");
});
document.getElementById("close-consume-modal-btn").addEventListener("click", () => {
  hide("consume-modal-overlay");
});
document.getElementById("consume-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "consume-modal-overlay") hide("consume-modal-overlay");
});
["consume-scan-btn", "consume-photo-btn", "goto-manual-consume-btn"].forEach(id => {
  document.getElementById(id).addEventListener("click", () => hide("consume-modal-overlay"));
});
