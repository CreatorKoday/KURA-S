// ==========================================================
// 買い物リストまわり
// ==========================================================

import { supabaseClient } from "./config.js";
import { shoppingListEl, shoppingMessageBox } from "./elements.js";
import { showMessage, escapeHtml, fillQuantitySelect } from "./utils.js";

fillQuantitySelect(document.getElementById("shopping-quantity"), 1, 30, 1);

// 在庫ロットの合計数量としきい値を見て、買い物リストへの追加/削除を自動で行う
export async function syncShoppingListForItem(itemId) {
  const { data: item, error: itemError } = await supabaseClient
    .from("items")
    .select("id, name, low_stock_threshold")
    .eq("id", itemId)
    .single();
  if (itemError || !item) {
    console.error("商品情報の取得に失敗(買い物リスト同期):", itemError);
    return;
  }

  const { data: lots, error: lotsError } = await supabaseClient
    .from("item_lots")
    .select("quantity")
    .eq("item_id", itemId);
  if (lotsError) {
    console.error("在庫ロットの取得に失敗(買い物リスト同期):", lotsError);
    return;
  }
  const totalQuantity = (lots || []).reduce((sum, l) => sum + Number(l.quantity), 0);

  const { data: existingList, error: findError } = await supabaseClient
    .from("shopping_list")
    .select("id")
    .eq("item_id", itemId)
    .eq("is_purchased", false)
    .limit(1);

  if (findError) {
    console.error("買い物リストの検索に失敗:", findError);
    return;
  }
  const existing = existingList && existingList.length > 0 ? existingList[0] : null;

  const isLow = totalQuantity <= Number(item.low_stock_threshold);

  if (isLow && !existing) {
    const { error: insertError } = await supabaseClient.from("shopping_list").insert({
      item_id: item.id,
      name: item.name,
      quantity_needed: 1
    });
    if (insertError) console.error("買い物リストへの追加に失敗:", insertError);
  } else if (!isLow && existing) {
    const { error: deleteError } = await supabaseClient.from("shopping_list").delete().eq("id", existing.id);
    if (deleteError) console.error("買い物リストからの削除に失敗:", deleteError);
  }
}

export async function loadShoppingList() {
  const { data, error } = await supabaseClient
    .from("shopping_list")
    .select("*")
    .eq("is_purchased", false)
    .order("created_at", { ascending: true });

  if (error) {
    shoppingListEl.innerHTML = '<div class="empty-note">読み込みエラー: ' + error.message + '</div>';
    return;
  }
  renderShoppingList(data);
}

function renderShoppingList(rows) {
  if (!rows || rows.length === 0) {
    shoppingListEl.innerHTML = '<div class="empty-note">買い物リストは空です。在庫が少なくなると自動で追加されます。</div>';
    return;
  }

  shoppingListEl.innerHTML = rows.map(row => `
    <div class="shopping-card ${row.item_id ? "" : "manual"}">
      <button class="check-btn" data-action="mark-purchased" data-id="${row.id}" data-item-id="${row.item_id || ""}" data-quantity="${row.quantity_needed}"><i data-lucide="check"></i></button>
      <div class="shopping-info">
        <div class="shopping-name">${escapeHtml(row.name)}</div>
        <div class="shopping-meta">数量 ${row.quantity_needed} ・ ${row.item_id ? "在庫連動" : "自由入力"}</div>
      </div>
      <button class="del-btn" data-action="remove-shopping-item" data-id="${row.id}"><i data-lucide="x"></i></button>
    </div>
  `).join("");

  if (window.lucide) lucide.createIcons();
}

document.getElementById("add-shopping-btn").addEventListener("click", async () => {
  const name = document.getElementById("shopping-name").value.trim();
  const quantity = parseFloat(document.getElementById("shopping-quantity").value) || 1;

  if (!name) {
    showMessage(shoppingMessageBox, "商品名を入力してください", true);
    return;
  }

  const { error } = await supabaseClient.from("shopping_list").insert({
    name, quantity_needed: quantity, item_id: null
  });

  if (error) {
    showMessage(shoppingMessageBox, "追加エラー: " + error.message, true);
    return;
  }

  showMessage(shoppingMessageBox, "追加しました", false);
  document.getElementById("shopping-name").value = "";
  document.getElementById("shopping-quantity").value = "1";
  loadShoppingList();
});

async function markPurchased(shoppingId, itemId, quantityNeeded) {
  const { error } = await supabaseClient.from("shopping_list").delete().eq("id", shoppingId);
  if (error) {
    console.error("買い物リストの更新に失敗:", error);
    return;
  }

  if (itemId) {
    // 購入分は賞味期限未設定の新しいロットとして追加する
    const { error: insertError } = await supabaseClient
      .from("item_lots")
      .insert({ item_id: itemId, quantity: Number(quantityNeeded), expiry_date: null });
    if (insertError) {
      console.error("在庫ロットの追加に失敗:", insertError);
    } else {
      await syncShoppingListForItem(itemId);
    }
  }

  loadShoppingList();
}

async function removeShoppingItem(id) {
  if (!confirm("このリストの項目を削除しますか?")) return;
  const { error } = await supabaseClient.from("shopping_list").delete().eq("id", id);
  if (!error) loadShoppingList();
}

// カード内のボタンはloadShoppingList()のたびに再生成されるため、shoppingListElへの委譲で拾う
shoppingListEl.addEventListener("click", (e) => {
  const purchaseBtn = e.target.closest('[data-action="mark-purchased"]');
  if (purchaseBtn) {
    markPurchased(purchaseBtn.dataset.id, purchaseBtn.dataset.itemId || null, Number(purchaseBtn.dataset.quantity));
    return;
  }
  const removeBtn = e.target.closest('[data-action="remove-shopping-item"]');
  if (removeBtn) removeShoppingItem(removeBtn.dataset.id);
});
