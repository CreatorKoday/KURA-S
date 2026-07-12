// ==========================================================
// 単位に応じて「数量」をプルダウン⇔テンキー入力に切り替える
// ==========================================================

export const CONTINUOUS_UNITS = ["g", "ml", "kg", "l", "L"];

export function isContinuousUnit(unit) {
  return CONTINUOUS_UNITS.includes((unit || "").trim());
}

// ホーム画面(手動登録ページ)の数量欄の切り替え
export function updateItemQuantityMode() {
  const unit = document.getElementById("item-unit").value;
  const selectEl = document.getElementById("item-quantity");
  const numEl = document.getElementById("item-quantity-numeric");
  if (isContinuousUnit(unit)) {
    selectEl.classList.add("hidden");
    numEl.classList.remove("hidden");
    if (!numEl.value) numEl.value = numEl.value || "";
  } else {
    selectEl.classList.remove("hidden");
    numEl.classList.add("hidden");
  }
}
export function getItemQuantityValue() {
  const selectEl = document.getElementById("item-quantity");
  const numEl = document.getElementById("item-quantity-numeric");
  return numEl.classList.contains("hidden") ? selectEl.value : numEl.value;
}
document.getElementById("item-unit").addEventListener("input", updateItemQuantityMode);
updateItemQuantityMode();

// レビューカード(写真AI判定)側の数量欄の切り替え
export function setupReviewQuantityToggle(card) {
  const unitInput = card.querySelector(".review-unit");
  const selectEl = card.querySelector(".review-quantity");
  const numEl = card.querySelector(".review-quantity-numeric");
  function refresh() {
    if (isContinuousUnit(unitInput.value)) {
      selectEl.classList.add("hidden");
      numEl.classList.remove("hidden");
    } else {
      selectEl.classList.remove("hidden");
      numEl.classList.add("hidden");
    }
  }
  unitInput.addEventListener("input", refresh);
  refresh();
}
export function getReviewQuantityValue(card) {
  const selectEl = card.querySelector(".review-quantity");
  const numEl = card.querySelector(".review-quantity-numeric");
  return numEl.classList.contains("hidden") ? selectEl.value : numEl.value;
}
