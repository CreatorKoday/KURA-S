// ==========================================================
// 単位に応じて「数量」をプルダウン⇔テンキー入力に切り替える
// ==========================================================

export const CONTINUOUS_UNITS = ["g", "ml", "kg", "l", "L"];

export function isContinuousUnit(unit) {
  return CONTINUOUS_UNITS.includes((unit || "").trim());
}

// 標準商品名(カード)単位で最低数量を判定するための合算値。
// 個数系(個・パックなど)と定量系(g/ml/kg/L)が混在する場合、定量系の平均値を
// 個数系の数量に掛けて定量換算してから合算する(例: 200g,400g,2パック → 平均300g×2パック=600g、合計1200g)。
// 定量系の商品が1つも無い場合は換算せずそのまま合算する
export function computeCombinedStockQuantity(entries) {
  const continuous = entries.filter(e => isContinuousUnit(e.unit));
  const counted = entries.filter(e => !isContinuousUnit(e.unit));
  const continuousTotal = continuous.reduce((sum, e) => sum + Number(e.quantity), 0);

  if (continuous.length === 0) {
    return counted.reduce((sum, e) => sum + Number(e.quantity), 0);
  }

  const average = continuousTotal / continuous.length;
  const countedConverted = counted.reduce((sum, e) => sum + Number(e.quantity) * average, 0);
  return continuousTotal + countedConverted;
}

// 最低数量の表示(単位・増減幅)に使う代表単位。定量系の商品があればその単位を優先する
export function representativeUnitForEntries(entries) {
  const continuousEntry = entries.find(e => isContinuousUnit(e.unit));
  if (continuousEntry) return continuousEntry.unit;
  return entries.length > 0 ? entries[0].unit : "個";
}

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
