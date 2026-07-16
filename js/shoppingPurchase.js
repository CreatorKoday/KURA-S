// ==========================================================
// 買い物リストの「購入済み」→在庫登録シート
//
// 「購入済み」ボタン(data-action="mark-purchased")を独自に監視し、
// 商品名から既存の items を確認する。
// ・既存商品がある場合: 数量・賞味期限だけを入力し、既存の items.id に
//   resolveLot()(items.js と共通)でロットを追加/加算する。
// ・既存商品がない場合: 手動登録と同じ入力項目を表示し、upsertItemByName()
//   (手動登録・バーコード登録・AI写真登録と共通)で新規登録する。
// 登録が完了したら、買い物リストの行を削除する(現行の「購入済み」と同じ後処理)。
// ==========================================================

import { supabaseClient } from "./config.js";
import { showMessage, buildQuantityOptionsHtml } from "./utils.js";
import { isContinuousUnit, setupReviewQuantityToggle, getReviewQuantityValue } from "./quantity.js";
import { applyUnitSuggestions } from "./units.js";
import { upsertItemByName, resolveLot, loadItems } from "./items.js";
import { syncShoppingListForItem, loadShoppingList } from "./shopping.js";

function show(id) {
  const el = document.getElementById(id);
  if (el.classList.contains("hidden")) el.classList.remove("hidden");
}
function hide(id) {
  const el = document.getElementById(id);
  if (!el.classList.contains("hidden")) el.classList.add("hidden");
}

const newSection = document.getElementById("shopping-purchase-new");
setupReviewQuantityToggle(newSection);

const newNameInput = document.getElementById("shopping-purchase-new-name");
const newUnitInput = document.getElementById("shopping-purchase-new-unit");
const newUnitSuggestBox = document.getElementById("shopping-purchase-new-unit-suggestions");

// 商品名から単位を自動提案する(手動登録と同じ仕組みを再利用)
function refreshNewUnitSuggestions() {
  applyUnitSuggestions({ nameInput: newNameInput, unitInput: newUnitInput, suggestBox: newUnitSuggestBox });
}
newNameInput.addEventListener("input", refreshNewUnitSuggestions);
newNameInput.addEventListener("blur", refreshNewUnitSuggestions);

let currentShoppingId = null;
let currentKnownItem = null; // { id, name, unit }(既存商品の場合のみ)

function closeSheet() {
  hide("shopping-purchase-overlay");
  currentShoppingId = null;
  currentKnownItem = null;
}

document.getElementById("shopping-purchase-close-btn").addEventListener("click", closeSheet);
document.getElementById("shopping-purchase-overlay").addEventListener("click", (e) => {
  if (e.target.id === "shopping-purchase-overlay") closeSheet();
});

async function openShoppingPurchase({ shoppingId, itemId, name, quantityNeeded }) {
  currentShoppingId = shoppingId;
  currentKnownItem = null;

  show("shopping-purchase-overlay");
  hide("shopping-purchase-known");
  hide("shopping-purchase-new");
  document.getElementById("shopping-purchase-known-message").textContent = "";
  document.getElementById("shopping-purchase-new-message").textContent = "";

  // 在庫連動(item_id あり)ならそのまま、自由入力なら商品名で既存商品を検索する
  let item = null;
  if (itemId) {
    const { data } = await supabaseClient.from("items").select("id, name, unit").eq("id", itemId).maybeSingle();
    item = data || null;
  } else {
    const { data } = await supabaseClient.from("items").select("id, name, unit").eq("name", name).limit(1);
    item = data && data.length > 0 ? data[0] : null;
  }

  // 検索している間にシートが閉じられていたら何もしない
  if (currentShoppingId !== shoppingId) return;

  if (item) {
    currentKnownItem = item;
    show("shopping-purchase-known");
    document.getElementById("shopping-purchase-known-name").textContent =
      `「${item.name}」を購入済みにしました。数量と期限を入力してください。`;

    const isContinuous = isContinuousUnit(item.unit);
    const qtySelect = document.getElementById("shopping-purchase-known-quantity");
    const qtyNumeric = document.getElementById("shopping-purchase-known-quantity-numeric");
    qtySelect.innerHTML = buildQuantityOptionsHtml(quantityNeeded || 1);
    qtySelect.classList.toggle("hidden", isContinuous);
    qtyNumeric.value = quantityNeeded || "";
    qtyNumeric.classList.toggle("hidden", !isContinuous);
    document.getElementById("shopping-purchase-known-expiry").value = "";
  } else {
    show("shopping-purchase-new");
    newNameInput.value = name || "";
    document.getElementById("shopping-purchase-new-category").value = "食材";
    newUnitInput.value = "個";
    newUnitSuggestBox.innerHTML = "";
    refreshNewUnitSuggestions(); // 商品名から単位候補を自動提案する(手動登録と同じ挙動)
    document.getElementById("shopping-purchase-new-quantity").innerHTML = buildQuantityOptionsHtml(quantityNeeded || 1);
    document.getElementById("shopping-purchase-new-quantity-numeric").value = quantityNeeded || "";
    document.getElementById("shopping-purchase-new-expiry").value = "";
  }
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest('[data-action="mark-purchased"]');
  if (!btn) return;
  openShoppingPurchase({
    shoppingId: btn.dataset.id,
    itemId: btn.dataset.itemId || null,
    name: btn.dataset.name,
    quantityNeeded: Number(btn.dataset.quantity) || 1
  });
});

// 買い物リストの行を削除し、一覧を更新する(現行の「購入済み」と同じ後処理)
async function finishPurchase(shoppingId) {
  const { error } = await supabaseClient.from("shopping_list").delete().eq("id", shoppingId);
  if (error) console.error("買い物リストの更新に失敗:", error);
  closeSheet();
  loadShoppingList();
  loadItems();
}

document.getElementById("shopping-purchase-known-submit-btn").addEventListener("click", async () => {
  if (!currentKnownItem) return;
  const shoppingId = currentShoppingId;
  const itemId = currentKnownItem.id;
  const quantity = parseFloat(getReviewQuantityValue(document.getElementById("shopping-purchase-known"))) || 0;
  const expiry = document.getElementById("shopping-purchase-known-expiry").value || null;
  const msgEl = document.getElementById("shopping-purchase-known-message");

  if (quantity <= 0) {
    showMessage(msgEl, "数量を入力してください", true);
    return;
  }

  const btn = document.getElementById("shopping-purchase-known-submit-btn");
  btn.disabled = true;
  const lotResult = await resolveLot(itemId, quantity, expiry);
  btn.disabled = false;

  if (!lotResult) {
    showMessage(msgEl, "登録に失敗しました。もう一度お試しください。", true);
    return;
  }

  await syncShoppingListForItem(itemId);
  await finishPurchase(shoppingId);
});

document.getElementById("shopping-purchase-new-submit-btn").addEventListener("click", async () => {
  const shoppingId = currentShoppingId;
  const name = document.getElementById("shopping-purchase-new-name").value.trim();
  const category = document.getElementById("shopping-purchase-new-category").value;
  const unit = document.getElementById("shopping-purchase-new-unit").value.trim() || "個";
  const quantity = parseFloat(getReviewQuantityValue(newSection)) || 0;
  const expiry = document.getElementById("shopping-purchase-new-expiry").value || null;
  const msgEl = document.getElementById("shopping-purchase-new-message");

  if (!name) {
    showMessage(msgEl, "商品名を入力してください", true);
    return;
  }

  const btn = document.getElementById("shopping-purchase-new-submit-btn");
  btn.disabled = true;
  const id = await upsertItemByName({ name, category, unit, quantity, expiry_date: expiry });
  btn.disabled = false;

  if (!id) {
    showMessage(msgEl, "登録に失敗しました。もう一度お試しください。", true);
    return;
  }

  await finishPurchase(shoppingId);
});
