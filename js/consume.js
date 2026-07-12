// ==========================================================
// 消費登録(バーコード・写真AI・手動検索、すべてで共用するロジック)
// ==========================================================

import { supabaseClient } from "./config.js";
import { addMessageBox, consumeMessageBox, manualConsumeMessageBox } from "./elements.js";
import { showMessage, escapeHtml } from "./utils.js";
import { syncShoppingListForItem, loadShoppingList } from "./shopping.js";
import { loadItems } from "./items.js";
import { fileToBase64, identifyProductsWithAI } from "./aiPhoto.js";

// 消費対象カードのHTMLを組み立てる(バーコード・写真AI・手動検索すべてで共用)
function renderConsumeCardsHtml(items) {
  return items.map(item => `
    <div class="review-card consume-card" data-item-id="${item.id}" data-full-quantity="${item.quantity}">
      <div class="item-name">${escapeHtml(item.name)}</div>
      <p class="review-note">現在の在庫: ${item.quantity}${escapeHtml(item.unit)}</p>
      <label>消費する数量</label>
      <div class="row2">
        <div>
          <input type="number" class="consume-quantity" min="0" step="any" inputmode="decimal" value="${item.quantity}">
        </div>
        <div style="display:flex; align-items:flex-end;">
          <button type="button" class="btn-secondary consume-all-btn" style="margin-top:12px;">すべて消費</button>
        </div>
      </div>
    </div>
  `).join("");
}

export function showConsumeReview(items, listId, sectionId) {
  const listEl = document.getElementById(listId);
  listEl.innerHTML = renderConsumeCardsHtml(items);
  if (window.lucide) lucide.createIcons();
  const sectionEl = document.getElementById(sectionId);
  sectionEl.classList.remove("hidden");
  sectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

// 「すべて消費」ボタン(イベント委譲で、後から増えるカードにも対応)
document.addEventListener("click", (e) => {
  const allBtn = e.target.closest(".consume-all-btn");
  if (!allBtn) return;
  const card = allBtn.closest(".consume-card");
  card.querySelector(".consume-quantity").value = card.dataset.fullQuantity;
});

async function confirmConsume(containerId, messageBoxEl, onDone) {
  const container = document.getElementById(containerId);
  const cards = container.querySelectorAll(".consume-card");
  if (cards.length === 0) {
    showMessage(messageBoxEl, "消費する商品がありません", true);
    return;
  }

  let count = 0;
  for (const card of cards) {
    const id = card.dataset.itemId;
    const fullQty = Number(card.dataset.fullQuantity);
    const consumeQty = Number(card.querySelector(".consume-quantity").value) || 0;
    const newQty = Math.max(0, fullQty - consumeQty);
    const { error } = await supabaseClient
      .from("items")
      .update({ quantity: newQty, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) {
      await syncShoppingListForItem(id);
      count++;
    } else {
      console.error("消費処理に失敗:", error);
    }
  }

  showMessage(messageBoxEl, count + "件消費しました", false);
  container.innerHTML = "";
  if (onDone) onDone();
}

document.getElementById("confirm-consume-btn").addEventListener("click", async () => {
  await confirmConsume("consume-review-list", consumeMessageBox, () => {
    document.getElementById("consume-review-section").classList.add("hidden");
    loadItems();
    loadShoppingList();
  });
});
document.getElementById("cancel-consume-btn").addEventListener("click", () => {
  document.getElementById("consume-review-section").classList.add("hidden");
  document.getElementById("consume-review-list").innerHTML = "";
});

// ---------- 写真AIによる消費登録 ----------

document.getElementById("consume-photo-btn").addEventListener("click", () => {
  document.getElementById("consume-photo-input").click();
});

document.getElementById("consume-photo-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  showMessage(addMessageBox, "AIが商品を判定中です。少々お待ちください...", false);

  try {
    const base64Data = await fileToBase64(file);
    const detected = await identifyProductsWithAI(base64Data, file.type);

    if (!detected || detected.length === 0) {
      showMessage(addMessageBox, "商品を判定できませんでした。「手動で消費登録」からお試しください。", true);
      return;
    }

    // 検出した商品名をもとに、実際の在庫を検索する
    const matched = [];
    const seenIds = new Set();
    for (const d of detected) {
      const cleanName = (d.name || "").trim();
      if (!cleanName) continue;
      const { data: found } = await supabaseClient
        .from("items").select("id, name, unit, quantity").ilike("name", "%" + cleanName + "%").limit(3);
      (found || []).forEach(item => {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          matched.push(item);
        }
      });
    }

    if (matched.length === 0) {
      showMessage(addMessageBox, "在庫に一致する商品が見つかりませんでした。「手動で消費登録」からお試しください。", true);
      return;
    }

    showMessage(addMessageBox, "", false);
    showConsumeReview(matched, "consume-review-list", "consume-review-section");
  } catch (err) {
    showMessage(addMessageBox, "判定エラー: " + err.message, true);
  } finally {
    e.target.value = "";
  }
});

// ---------- 手動での消費登録(検索して選ぶ) ----------

document.getElementById("consume-search").addEventListener("input", async (e) => {
  const term = e.target.value.trim();
  const resultsEl = document.getElementById("consume-search-results");
  if (!term) {
    resultsEl.innerHTML = "";
    return;
  }
  const { data, error } = await supabaseClient
    .from("items")
    .select("id, name, unit, quantity")
    .ilike("name", "%" + term + "%")
    .order("name")
    .limit(10);

  if (error || !data || data.length === 0) {
    resultsEl.innerHTML = '<div class="empty-note">見つかりませんでした</div>';
    return;
  }

  resultsEl.innerHTML = data.map(item => `
    <div class="shopping-card manual search-result-row" style="cursor:pointer;"
      data-id="${item.id}" data-name="${escapeHtml(item.name)}" data-unit="${escapeHtml(item.unit)}" data-quantity="${item.quantity}">
      <div class="shopping-info">
        <div class="shopping-name">${escapeHtml(item.name)}</div>
        <div class="shopping-meta">在庫: ${item.quantity}${escapeHtml(item.unit)}</div>
      </div>
      <i data-lucide="plus-circle"></i>
    </div>
  `).join("");
  if (window.lucide) lucide.createIcons();
});

document.getElementById("consume-search-results").addEventListener("click", (e) => {
  const row = e.target.closest(".search-result-row");
  if (!row) return;
  addItemToManualConsumeList({
    id: row.dataset.id,
    name: row.dataset.name,
    unit: row.dataset.unit,
    quantity: Number(row.dataset.quantity)
  });
});

function addItemToManualConsumeList(item) {
  const listEl = document.getElementById("manual-consume-review-list");
  if (listEl.querySelector('.consume-card[data-item-id="' + item.id + '"]')) return; // 重複追加を防ぐ
  listEl.insertAdjacentHTML("beforeend", renderConsumeCardsHtml([item]));
  if (window.lucide) lucide.createIcons();
  document.getElementById("manual-consume-review-section").classList.remove("hidden");
  document.getElementById("consume-search").value = "";
  document.getElementById("consume-search-results").innerHTML = "";
}

document.getElementById("manual-confirm-consume-btn").addEventListener("click", async () => {
  await confirmConsume("manual-consume-review-list", manualConsumeMessageBox, () => {
    document.getElementById("manual-consume-review-section").classList.add("hidden");
    loadItems();
    loadShoppingList();
  });
});
