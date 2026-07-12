// ==========================================================
// ホーム画面のダッシュボード化
//
// 「食材を登録」: ページ遷移・モーダルを使わず、その場で開閉するアコーディオンUI
// 「食材を消費」: 従来通りのモーダル(今回は変更しない)
//
// 【重要】このファイルは見た目・開閉状態の制御のみを行う。
// scan-btn / photo-btn / add-item-btn / consume-scan-btn / consume-photo-btn /
// goto-manual-consume-btn は、barcode.js / aiPhoto.js / items.js / consume.js /
// navigation.js に元々あるイベントリスナーがそのまま動作する
// (ここでは追加のリスナーを乗せて開閉を制御するだけ)。
// ==========================================================

function show(id) { document.getElementById(id).classList.remove("hidden"); }
function hide(id) { document.getElementById(id).classList.add("hidden"); }

// ---------- 食材を登録: アコーディオン ----------

const registerSection = document.getElementById("register-accordion-section");

document.getElementById("open-register-modal-btn").addEventListener("click", () => {
  show("register-accordion-section");
  registerSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

document.getElementById("close-register-accordion-btn").addEventListener("click", () => {
  closeRegisterAccordionSection();
});

// アコーディオンの見出し(バーコード/AI/手動)をタップした時の開閉
document.querySelectorAll(".accordion-header").forEach(header => {
  header.addEventListener("click", () => {
    const target = header.dataset.accordionTarget;
    const body = document.getElementById("accordion-body-" + target);
    const isOpen = body.classList.contains("open");

    // 常に1つだけ開く: 一旦すべて閉じる
    document.querySelectorAll(".accordion-body").forEach(b => b.classList.remove("open"));
    document.querySelectorAll(".accordion-header").forEach(h => h.classList.remove("open"));

    // すでに開いていた項目をタップした場合はそのまま閉じた状態にする(トグル)
    if (!isOpen) {
      body.classList.add("open");
      header.classList.add("open");
    }
  });
});

function closeRegisterAccordionSection() {
  hide("register-accordion-section");
  document.querySelectorAll(".accordion-body").forEach(b => b.classList.remove("open"));
  document.querySelectorAll(".accordion-header").forEach(h => h.classList.remove("open"));
}

// 登録が完了したら(手動登録フォームが成功メッセージを表示したら)アコーディオンを閉じる
const manualAddMessageEl = document.getElementById("manual-add-message");
new MutationObserver(() => {
  if (manualAddMessageEl.classList.contains("msg-ok") && manualAddMessageEl.textContent) {
    setTimeout(closeRegisterAccordionSection, 700);
  }
}).observe(manualAddMessageEl, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class"] });

// AIでの一括登録が完了(またはキャンセル)されたら、レビューが閉じられるのでアコーディオンも閉じる
const reviewSectionEl = document.getElementById("review-section");
new MutationObserver(() => {
  if (reviewSectionEl.classList.contains("hidden")) {
    closeRegisterAccordionSection();
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
