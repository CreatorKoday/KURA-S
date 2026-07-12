// ==========================================================
// 在庫(商品)の登録・一覧表示・数量操作
// ==========================================================

import { supabaseClient } from "./config.js";
import { itemListEl, manualAddMessageBox } from "./elements.js";
import { showMessage, escapeHtml, fillQuantitySelect } from "./utils.js";
import { syncShoppingListForItem, loadShoppingList } from "./shopping.js";
import { guessTag } from "./tags.js";
import { getItemQuantityValue, updateItemQuantityMode } from "./quantity.js";
import { currentBarcodeValue, resetCurrentBarcodeValue } from "./barcode.js";

fillQuantitySelect(document.getElementById("item-quantity"), 0, 30, 1);

// 既存の同名商品があれば数量を加算、なければ新規登録。どちらの場合もshopping_listと同期する。
export async function upsertItemByName({ name, category, unit, quantity, expiry_date, low_stock_threshold, barcode }) {
  const cleanName = (name || "").trim();
  if (!cleanName) return null;

  const { data: existingList, error: findError } = await supabaseClient
    .from("items")
    .select("id, quantity, expiry_date, low_stock_threshold")
    .eq("name", cleanName)
    .limit(1);

  if (findError) console.error("既存商品の検索に失敗:", findError);

  const existing = existingList && existingList.length > 0 ? existingList[0] : null;

  if (existing) {
    const newQuantity = Number(existing.quantity) + Number(quantity || 0);
    const updatePayload = { quantity: newQuantity, updated_at: new Date().toISOString() };
    if (!existing.expiry_date && expiry_date) updatePayload.expiry_date = expiry_date;
    if (low_stock_threshold !== undefined && low_stock_threshold !== null) {
      updatePayload.low_stock_threshold = Number(low_stock_threshold);
    }
    const { error: updateError } = await supabaseClient.from("items").update(updatePayload).eq("id", existing.id);
    if (updateError) { console.error("商品の更新に失敗:", updateError); return null; }
    await syncShoppingListForItem(existing.id);
    return existing.id;
  } else {
    const { data: inserted, error: insertError } = await supabaseClient
      .from("items")
      .insert({
        name: cleanName,
        category,
        unit,
        quantity: Number(quantity || 0),
        expiry_date: expiry_date || null,
        low_stock_threshold: Number(low_stock_threshold || 1),
        barcode: barcode || null,
        tag: guessTag(cleanName)
      })
      .select()
      .single();
    if (insertError) { console.error("商品の登録に失敗:", insertError); return null; }
    await syncShoppingListForItem(inserted.id);
    return inserted.id;
  }
}

export async function loadItems() {
  let query = supabaseClient
    .from("items")
    .select("*")
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  const catFilter = document.getElementById("filter-category").value;
  const tagFilter = document.getElementById("filter-tag").value;
  if (catFilter) query = query.eq("category", catFilter);
  if (tagFilter) query = query.eq("tag", tagFilter);

  const { data, error } = await query;

  if (error) {
    itemListEl.innerHTML = '<div class="empty-note">読み込みエラー: ' + error.message + '</div>';
    return;
  }
  renderItems(data);
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0,0,0,0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function renderItems(items) {
  if (!items || items.length === 0) {
    itemListEl.innerHTML = '<div class="empty-note">該当する商品がありません。</div>';
    return;
  }

  const groups = {};
  items.forEach(item => {
    const cat = item.category || "その他";
    const tag = item.tag || "その他";
    groups[cat] = groups[cat] || {};
    groups[cat][tag] = groups[cat][tag] || [];
    groups[cat][tag].push(item);
  });

  let html = "";
  Object.keys(groups).sort().forEach(cat => {
    html += `<h3 class="group-heading">${escapeHtml(cat)}</h3>`;
    Object.keys(groups[cat]).sort().forEach(tag => {
      html += `<h4 class="group-subheading">${escapeHtml(tag)}</h4>`;
      groups[cat][tag].forEach(item => { html += itemCardHtml(item); });
    });
  });
  itemListEl.innerHTML = html;
  if (window.lucide) lucide.createIcons();
}

function itemCardHtml(item) {
  const d = daysUntil(item.expiry_date);
  let statusClass = "";
  let expiryText = "未設定";
  if (d !== null) {
    if (d < 0) {
      statusClass = "expired";
      expiryText = "期限切れ";
    } else if (d <= 3) {
      statusClass = "soon";
      expiryText = "あと" + d + "日";
    } else {
      expiryText = "あと" + d + "日";
    }
  }
  const lowStock = Number(item.quantity) <= Number(item.low_stock_threshold);

  return `
    <div class="item-card ${statusClass}">
      <div class="item-card-header">
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-badges">
          <span class="tag">${escapeHtml(item.tag || item.category)}</span>
          ${lowStock ? '<span class="tag warning">在庫少なめ</span>' : ""}
        </div>
      </div>
      <div class="item-stats">
        <div class="stat">
          <span class="stat-label">在庫</span>
          <span class="stat-value">${item.quantity}${escapeHtml(item.unit)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">賞味期限</span>
          <span class="stat-value ${statusClass === "expired" ? "text-danger" : statusClass === "soon" ? "text-warning" : ""}">${expiryText}</span>
        </div>
        <div class="stat">
          <span class="stat-label">最低数量</span>
          <span class="stat-value">
            <input type="number" class="threshold-input" min="0" step="1" inputmode="numeric" pattern="[0-9]*"
              value="${item.low_stock_threshold}"
              onchange="updateThreshold('${item.id}', this.value)">
          </span>
        </div>
      </div>
      <div class="item-card-footer">
        <div class="qty-control">
          <button class="qty-btn" onclick="adjustQty('${item.id}', ${item.quantity}, -1)"><i data-lucide="minus"></i></button>
          <span class="qty-num">${item.quantity}</span>
          <button class="qty-btn" onclick="adjustQty('${item.id}', ${item.quantity}, 1)"><i data-lucide="plus"></i></button>
        </div>
        <button class="del-btn" onclick="deleteItem('${item.id}')"><i data-lucide="trash-2"></i> 削除</button>
      </div>
    </div>
  `;
}

document.getElementById("add-item-btn").addEventListener("click", async () => {
  const name = document.getElementById("item-name").value.trim();
  const category = document.getElementById("item-category").value;
  const unit = document.getElementById("item-unit").value.trim() || "個";
  const quantity = parseFloat(getItemQuantityValue()) || 0;
  const expiry = document.getElementById("item-expiry").value || null;

  if (!name) {
    showMessage(manualAddMessageBox, "商品名を入力してください", true);
    return;
  }

  const id = await upsertItemByName({
    name, category, unit, quantity, expiry_date: expiry,
    barcode: currentBarcodeValue
  });

  if (!id) {
    showMessage(manualAddMessageBox, "登録に失敗しました。もう一度お試しください。", true);
    return;
  }

  showMessage(manualAddMessageBox, "登録しました(同じ名前の商品があれば数量をまとめました)", false);
  document.getElementById("item-name").value = "";
  document.getElementById("item-unit").value = "個";
  document.getElementById("item-unit-suggestions").innerHTML = "";
  document.getElementById("item-quantity").value = "1";
  document.getElementById("item-quantity-numeric").value = "";
  updateItemQuantityMode();
  document.getElementById("item-expiry").value = "";
  resetCurrentBarcodeValue();
});

window.adjustQty = async function(id, currentQty, delta) {
  const newQty = Math.max(0, Number(currentQty) + delta);
  const { error } = await supabaseClient
    .from("items")
    .update({ quantity: newQty, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (!error) {
    await syncShoppingListForItem(id);
    loadItems();
  } else {
    console.error("数量の更新に失敗:", error);
  }
};

window.updateThreshold = async function(id, value) {
  const v = Math.max(0, parseFloat(value) || 0);
  const { error } = await supabaseClient
    .from("items")
    .update({ low_stock_threshold: v, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (!error) {
    await syncShoppingListForItem(id);
  } else {
    console.error("最低数量の更新に失敗:", error);
  }
};

window.deleteItem = async function(id) {
  if (!confirm("この項目を削除しますか?")) return;
  const { error } = await supabaseClient.from("items").delete().eq("id", id);
  if (!error) {
    loadItems();
    loadShoppingList();
  }
};
