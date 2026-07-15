// ==========================================================
// 在庫(商品)の登録・一覧表示・ロット単位の数量操作
//
// items = 商品(名前・分類・単位・タグ・最低数量など)
// item_lots = 在庫ロット(数量・賞味期限・購入日)。1商品に複数持てる
// ==========================================================

import { supabaseClient } from "./config.js";
import { itemListEl, manualAddMessageBox } from "./elements.js";
import { showMessage, escapeHtml, fillQuantitySelect } from "./utils.js";
import { syncShoppingListForItem } from "./shopping.js";
import { guessTag } from "./tags.js";
import { getItemQuantityValue, updateItemQuantityMode } from "./quantity.js";
import { currentBarcodeValue, resetCurrentBarcodeValue } from "./barcode.js";
import { resolveProductMaster } from "./productMaster.js";

fillQuantitySelect(document.getElementById("item-quantity"), 0, 30, 1);

// 商品(items)を解決する。既存商品があればそのid、なければ新規作成してidを返す
async function resolveItem({ name, category, unit, barcode }) {
  const cleanName = (name || "").trim();
  if (!cleanName) return null;

  const { data: existingList, error: findError } = await supabaseClient
    .from("items")
    .select("id")
    .eq("name", cleanName)
    .limit(1);

  if (findError) { console.error("既存商品の検索に失敗:", findError); return null; }

  if (existingList && existingList.length > 0) {
    return existingList[0].id;
  }

  const productMaster = await resolveProductMaster(cleanName);
  const { data: inserted, error: insertError } = await supabaseClient
    .from("items")
    .insert({
      name: cleanName,
      category,
      unit,
      low_stock_threshold: 0,
      barcode: barcode || null,
      tag: guessTag(cleanName),
      product_master_id: productMaster ? productMaster.id : null
    })
    .select()
    .single();
  if (insertError) { console.error("商品の登録に失敗:", insertError); return null; }
  return inserted.id;
}

// 商品(itemId)に対して、同じ賞味期限(未設定同士も含む)のロットがあれば数量を加算、
// なければ新しいロットを作成する。賞味期限が異なる場合は必ず新規ロットになる。
async function resolveLot(itemId, quantity, expiryDate) {
  let findQuery = supabaseClient.from("item_lots").select("id, quantity").eq("item_id", itemId);
  findQuery = expiryDate ? findQuery.eq("expiry_date", expiryDate) : findQuery.is("expiry_date", null);
  const { data: existingList, error: findError } = await findQuery.limit(1);

  if (findError) { console.error("既存ロットの検索に失敗:", findError); return null; }

  const existing = existingList && existingList.length > 0 ? existingList[0] : null;

  if (existing) {
    const newQuantity = Number(existing.quantity) + Number(quantity || 0);
    const { error: updateError } = await supabaseClient
      .from("item_lots")
      .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (updateError) { console.error("ロットの更新に失敗:", updateError); return null; }
    return existing.id;
  } else {
    const { error: insertError } = await supabaseClient
      .from("item_lots")
      .insert({
        item_id: itemId,
        quantity: Number(quantity || 0),
        expiry_date: expiryDate || null
      });
    if (insertError) { console.error("ロットの登録に失敗:", insertError); return null; }
    return true;
  }
}

// 商品を登録する(商品の解決 + ロットの解決をまとめた、既存呼び出し元向けの入口)。
// バーコード登録・AI写真登録・手動登録のすべてがこの関数を経由する。
export async function upsertItemByName({ name, category, unit, quantity, expiry_date, barcode }) {
  const itemId = await resolveItem({ name, category, unit, barcode });
  if (!itemId) return null;

  const lotResult = await resolveLot(itemId, quantity, expiry_date);
  if (!lotResult) return null;

  await syncShoppingListForItem(itemId);
  return itemId;
}

export async function loadItems() {
  let query = supabaseClient
    .from("items")
    .select("*, item_lots(*)")
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

// 賞味期限が近い順(未設定は最後)に並べる。ロットの標準的な並び順として使う
function sortLotsByExpiry(lots) {
  return [...(lots || [])].sort((a, b) => {
    if (a.expiry_date && b.expiry_date) return a.expiry_date < b.expiry_date ? -1 : a.expiry_date > b.expiry_date ? 1 : 0;
    if (a.expiry_date && !b.expiry_date) return -1;
    if (!a.expiry_date && b.expiry_date) return 1;
    return 0;
  });
}

function earliestExpiry(item) {
  const dates = (item.item_lots || []).map(l => l.expiry_date).filter(Boolean).sort();
  return dates[0] || null;
}

function renderItems(items) {
  if (!items || items.length === 0) {
    itemListEl.innerHTML = '<div class="empty-note">該当する商品がありません。</div>';
    return;
  }

  // 商品一覧は「もっとも賞味期限が近いロット」を基準に並べる(未設定は最後)
  const sortedItems = [...items].sort((a, b) => {
    const ea = earliestExpiry(a), eb = earliestExpiry(b);
    if (ea && eb) return ea < eb ? -1 : ea > eb ? 1 : 0;
    if (ea && !eb) return -1;
    if (!ea && eb) return 1;
    return a.name.localeCompare(b.name, "ja");
  });

  const groups = {};
  sortedItems.forEach(item => {
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

function lotRowHtml(item, lot) {
  const d = daysUntil(lot.expiry_date);
  let statusClass = "";
  let expiryText = "期限未設定";
  if (d !== null) {
    if (d < 0) { statusClass = "expired"; expiryText = "期限切れ"; }
    else if (d <= 3) { statusClass = "soon"; expiryText = "あと" + d + "日"; }
    else { expiryText = "あと" + d + "日"; }
  }

  return `
    <div class="lot-row">
      <div class="lot-info">
        <span class="lot-quantity">在庫 ${lot.quantity}${escapeHtml(item.unit)}</span>
        <span class="lot-expiry ${statusClass === "expired" ? "text-danger" : statusClass === "soon" ? "text-warning" : ""}">賞味期限 ${expiryText}</span>
      </div>
      <div class="qty-control">
        <button class="qty-btn" data-action="adjust-lot-qty" data-lot-id="${lot.id}" data-item-id="${item.id}" data-current-qty="${lot.quantity}" data-delta="-1"><i data-lucide="minus"></i></button>
        <span class="qty-num">${lot.quantity}</span>
        <button class="qty-btn" data-action="adjust-lot-qty" data-lot-id="${lot.id}" data-item-id="${item.id}" data-current-qty="${lot.quantity}" data-delta="1"><i data-lucide="plus"></i></button>
      </div>
    </div>
  `;
}

function itemCardHtml(item) {
  const lots = sortLotsByExpiry(item.item_lots);
  const totalQuantity = lots.reduce((sum, l) => sum + Number(l.quantity), 0);
  const lowStock = totalQuantity <= Number(item.low_stock_threshold);

  // カード全体の期限ステータスは、もっとも緊急度が高いロットに合わせる
  let cardStatusClass = "";
  for (const lot of lots) {
    const d = daysUntil(lot.expiry_date);
    if (d !== null && d < 0) { cardStatusClass = "expired"; break; }
    if (d !== null && d <= 3) cardStatusClass = "soon";
  }

  const lotsHtml = lots.length
    ? lots.map(lot => lotRowHtml(item, lot)).join("")
    : '<div class="empty-note">在庫がありません。</div>';

  return `
    <div class="item-card ${cardStatusClass}">
      <div class="item-card-header">
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-badges">
          <span class="tag">${escapeHtml(item.tag || item.category)}</span>
          ${lowStock ? '<span class="tag warning">在庫少なめ</span>' : ""}
          <button type="button" class="detail-btn" data-action="view-product-detail"
            data-item-id="${item.id}" data-item-name="${escapeHtml(item.name)}"
            data-product-master-id="${item.product_master_id || ""}"
            data-low-stock-threshold="${item.low_stock_threshold}" aria-label="商品の詳細">
            <span class="material-symbols-rounded">info</span>
          </button>
        </div>
      </div>
      <div class="lot-list">
        ${lotsHtml}
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

  showMessage(manualAddMessageBox, "登録しました(同じ商品・同じ賞味期限があれば数量をまとめました)", false);
  document.getElementById("item-name").value = "";
  document.getElementById("item-unit").value = "個";
  document.getElementById("item-unit-suggestions").innerHTML = "";
  document.getElementById("item-quantity").value = "1";
  document.getElementById("item-quantity-numeric").value = "";
  updateItemQuantityMode();
  document.getElementById("item-expiry").value = "";
  resetCurrentBarcodeValue();
});

// ロット単位の数量増減。0以下になったロットは削除する(他のロットには影響しない)
async function adjustLotQty(lotId, itemId, currentQty, delta) {
  const newQty = Math.max(0, Number(currentQty) + delta);

  if (newQty <= 0) {
    const { error } = await supabaseClient.from("item_lots").delete().eq("id", lotId);
    if (error) { console.error("ロットの削除に失敗:", error); return; }
  } else {
    const { error } = await supabaseClient
      .from("item_lots")
      .update({ quantity: newQty, updated_at: new Date().toISOString() })
      .eq("id", lotId);
    if (error) { console.error("ロットの数量更新に失敗:", error); return; }
  }

  await syncShoppingListForItem(itemId);
  loadItems();
}

// カード内のボタンはloadItems()のたびに再生成されるため、itemListElへの委譲で拾う
itemListEl.addEventListener("click", (e) => {
  const qtyBtn = e.target.closest('[data-action="adjust-lot-qty"]');
  if (qtyBtn) {
    adjustLotQty(qtyBtn.dataset.lotId, qtyBtn.dataset.itemId, Number(qtyBtn.dataset.currentQty), Number(qtyBtn.dataset.delta));
  }
});
