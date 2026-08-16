// ==========================================================
// 商品マスタ 詳細/編集シート
//
// 在庫一覧の「詳細」ボタン(data-action="view-product-detail")から開く。
//
// 標準商品名・カテゴリー・サブカテゴリー・保管場所・用途・検索キーワードなど
// (AIが生成する商品識別データ)は部屋をまたいで共有されるため、手動での自由編集は
// 廃止し、AIへの再生成(regenerateProductMasterAttributes、js/productMaster.js)
// のみで修正する(誰か1人の誤字・誤った分類が他の部屋にまで影響するのを防ぐため、
// 2026-08〜)。アイコン・最低数量は household_product_settings で部屋ごとに
// 独立しているため、引き続きこのシートから直接編集できる。
//
// product_master_id が未設定の商品は「商品属性を作成」ボタンを表示し、
// resolveProductMaster(name, { forceRegenerate: true }) で新規作成する。
// ==========================================================

import { supabaseClient } from "./config.js";
import { escapeHtml, showAppNotice, formatMonthDay } from "./utils.js";
import { resolveProductMaster, regenerateProductMasterAttributes, getCategoryIcon } from "./productMaster.js";
import { loadItems, sortLotsByExpiry, formatExpiryLabel, correctLotQuantity } from "./items.js";
import { syncShoppingListForItem, syncShoppingListForMaster, loadShoppingList } from "./shopping.js";
import { isContinuousUnit } from "./quantity.js";
import { openQuantityPicker } from "./quantityPicker.js";

function show(id) {
  const el = document.getElementById(id);
  if (el.classList.contains("hidden")) el.classList.remove("hidden");
}
function hide(id) {
  const el = document.getElementById(id);
  if (!el.classList.contains("hidden")) el.classList.add("hidden");
}

// mode: "master"(標準商品名=カード単位。商品属性+最低数量) / "item"(商品名単位。購入日+削除)
//       / "fallback"(商品マスタが無い単独商品。従来通りすべてをまとめて扱う)
let currentMode = null;
let currentItem = null;    // { id, name, unit } (item/fallbackモード)
let currentMaster = null;  // product_master 行 (masterモードは常にあり、fallbackモードは未作成ならnull)
let currentMasterId = null; // masterモードで開いている product_master.id
let currentIcon = null;     // household_product_settings.icon(自分の部屋の設定。未設定ならnull)
let thresholdCtx = null;   // { table: "items"|"product_master", id, value, unit } (最低数量の保存先。master/fallbackモードのみ)

// ---------- トースト(汎用) ----------

let toastTimer = null;
function showToast(text) {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2000);
}

// ---------- 表示モード ----------

function renderView() {
  hide("product-detail-loading");
  hide("product-detail-empty");
  hide("product-detail-edit");
  show("product-detail-view");

  const icon = currentIcon || getCategoryIcon(currentMaster.type, currentMaster.category);
  document.getElementById("pd-icon").textContent = icon;
  document.getElementById("pd-icon-value").textContent = icon;
  // masterモードは特定の商品名を持たないため、商品名の見出し(修正ボタン含む)は表示せず標準商品名(下の行)だけにする
  document.getElementById("pd-item-name").textContent = currentMode === "master" ? "" : currentItem.name;
  document.getElementById("pd-item-name-row").classList.toggle("hidden", currentMode === "master");
  document.getElementById("pd-item-name-edit-form").classList.add("hidden");
  document.getElementById("pd-canonical-name").textContent = "標準商品名: " + currentMaster.canonical_name;
  document.getElementById("pd-canonical-reading").textContent = currentMaster.canonical_name_reading || "読み方未登録";
  hide("pd-canonical-reading"); // 商品を切り替えるたびに閉じた状態に戻す
  document.getElementById("pd-type").textContent = currentMaster.type;
  document.getElementById("pd-category").textContent = currentMaster.category;
  document.getElementById("pd-sub-category").textContent = currentMaster.sub_category || "未設定";
  document.getElementById("pd-storage").textContent = currentMaster.storage || "未設定";
  document.getElementById("pd-usage").textContent = currentMaster.usage || "未設定";

  const keywords = currentMaster.search_keywords || [];
  document.getElementById("pd-keywords").innerHTML = keywords.length
    ? keywords.map(k => `<span class="product-detail-keyword-chip">${escapeHtml(k)}</span>`).join("")
    : '<span class="product-detail-attr-value" style="color:var(--text-tertiary);">未設定</span>';
}

// 標準商品名をタップすると、登録済みのひらがな読みを表示/非表示する
document.getElementById("pd-canonical-name").addEventListener("click", () => {
  document.getElementById("pd-canonical-reading").classList.toggle("hidden");
});

// ---------- 編集モード(アイコンのみ。他の商品属性は手動編集を廃止し、
//            「再生成する」ボタン経由のAI再判定のみで修正する) ----------

function renderEdit() {
  hide("product-detail-view");
  show("product-detail-edit");

  document.getElementById("pd-edit-icon").value = currentIcon || getCategoryIcon(currentMaster.type, currentMaster.category);

  const msgEl = document.getElementById("product-detail-save-message");
  msgEl.textContent = "";
  msgEl.className = "";
}

document.getElementById("product-detail-edit-btn").addEventListener("click", renderEdit);
document.getElementById("product-detail-cancel-btn").addEventListener("click", renderView);

document.getElementById("product-detail-save-btn").addEventListener("click", async () => {
  if (!currentMaster) return;
  const masterId = currentMaster.id;
  const newIcon = document.getElementById("pd-edit-icon").value.trim();

  const saveBtn = document.getElementById("product-detail-save-btn");
  const msgEl = document.getElementById("product-detail-save-message");
  saveBtn.disabled = true;

  const { error } = await supabaseClient
    .from("household_product_settings")
    .upsert({ product_master_id: masterId, icon: newIcon || null }, { onConflict: "household_id,product_master_id" });

  saveBtn.disabled = false;

  if (error) {
    msgEl.textContent = "保存に失敗しました。もう一度お試しください。";
    msgEl.className = "msg-error";
    return;
  }

  // 保存待ちの間にシートが閉じられた/別の商品に切り替わっていたら、表示の更新はしない
  if (!currentMaster || currentMaster.id !== masterId) return;

  currentIcon = newIcon || null;
  renderView();
  showToast("保存しました");
});

// ---------- 商品属性の再生成(標準商品名・カテゴリーなどの唯一の修正手段) ----------

document.getElementById("product-detail-regenerate-btn").addEventListener("click", async () => {
  if (!currentMaster) return;
  const masterId = currentMaster.id;
  const regenerateBtn = document.getElementById("product-detail-regenerate-btn");
  regenerateBtn.disabled = true;

  const updated = await regenerateProductMasterAttributes(masterId, currentMaster.canonical_name);

  regenerateBtn.disabled = false;

  if (!updated) {
    showAppNotice("再生成に失敗しました");
    return;
  }

  if (currentMaster && currentMaster.id === masterId) {
    currentMaster = updated;
    renderView();
  }
  showAppNotice("商品属性を再生成しました");
  loadItems(); // 在庫一覧側の表示も最新化する
});

// ---------- セクションの表示切り替え(モードごと) ----------
// master: 標準商品名(カード)単位。商品属性+最低数量のみ(購入日・削除は商品名側のⓘに任せる)
// item: 商品名単位。購入日(在庫ロット)+削除のみ(属性・最低数量はカード側の⚙️に任せる)
// fallback: 商品マスタが無い単独商品。従来通りすべてまとめて表示する

function applySectionVisibility(mode) {
  const showThreshold = mode === "master" || mode === "fallback";
  const showLots = mode === "item" || mode === "fallback";
  const showDelete = mode === "item" || mode === "fallback";

  document.getElementById("pd-threshold-section").classList.toggle("hidden", !showThreshold);
  document.getElementById("pd-lots-section").classList.toggle("hidden", !showLots);
  document.getElementById("product-detail-delete-btn").classList.toggle("hidden", !showDelete);

  // 商品属性(表示/編集/未作成/読込中)は、いったんすべて隠してから
  // モードごとの後続処理(renderView/show("product-detail-empty")など)で必要な分だけ出し直す。
  // itemモードは商品属性を扱わないため、隠したままになる
  hide("product-detail-view");
  hide("product-detail-edit");
  hide("product-detail-empty");
  hide("product-detail-loading");

  const titleEl = document.getElementById("product-detail-title");
  titleEl.textContent = mode === "master" ? "商品属性の詳細" : mode === "item" ? "購入日・削除" : "商品の詳細";
}

// ---------- 開閉 ----------

async function openProductDetail({ mode, itemId, itemName, unit, productMasterId, lowStockThreshold, thresholdUnit }) {
  currentMode = mode;
  currentItem = (mode === "item" || mode === "fallback") ? { id: itemId, name: itemName, unit: unit || "" } : null;
  currentMaster = null;
  currentMasterId = mode === "master" ? productMasterId : null;
  currentIcon = null;
  thresholdCtx = null;

  show("product-detail-overlay");
  applySectionVisibility(mode);
  document.getElementById("product-detail-create-message").textContent = "";

  if (mode === "item") {
    await loadAndRenderLots(itemId);
    return;
  }

  if (mode === "fallback") {
    thresholdCtx = { table: "items", id: itemId, value: Number(lowStockThreshold) || 0, unit: unit || "" };
    renderThresholdDisplay();
    await loadAndRenderLots(itemId);

    if (!productMasterId) {
      show("product-detail-empty");
      return;
    }

    const [{ data: master, error }, { data: settings }] = await Promise.all([
      supabaseClient.from("product_master").select("*").eq("id", productMasterId).maybeSingle(),
      supabaseClient.from("household_product_settings").select("icon").eq("product_master_id", productMasterId).maybeSingle()
    ]);

    // 取得待ちの間に閉じられた/別の商品の詳細に切り替わっていたら、表示の更新はしない
    if (!currentItem || currentItem.id !== itemId) return;

    if (error || !master) {
      show("product-detail-empty");
      return;
    }

    currentMaster = master;
    currentIcon = settings ? settings.icon : null;
    renderView();
    return;
  }

  // mode === "master"
  const [{ data: master, error }, { data: settings }] = await Promise.all([
    supabaseClient.from("product_master").select("*").eq("id", productMasterId).maybeSingle(),
    supabaseClient.from("household_product_settings").select("icon, low_stock_threshold").eq("product_master_id", productMasterId).maybeSingle()
  ]);

  if (currentMasterId !== productMasterId) return;

  if (error || !master) {
    console.error("商品マスタの取得に失敗:", error);
    return;
  }

  currentMaster = master;
  currentIcon = settings ? settings.icon : null;
  thresholdCtx = { table: "product_master", id: master.id, value: settings ? Number(settings.low_stock_threshold) || 0 : 0, unit: thresholdUnit || "個" };
  renderThresholdDisplay();
  renderView();
}

function closeProductDetail() {
  hide("product-detail-overlay");
  currentMode = null;
  currentItem = null;
  currentMaster = null;
  currentMasterId = null;
  currentIcon = null;
  thresholdCtx = null;
}

document.getElementById("product-detail-close-btn").addEventListener("click", closeProductDetail);
document.getElementById("product-detail-overlay").addEventListener("click", (e) => {
  if (e.target.id === "product-detail-overlay") closeProductDetail();
});

// 在庫一覧の詳細/インフォメーションボタンから開く(カードは loadItems() のたびに再生成されるため委譲で拾う)
document.addEventListener("click", (e) => {
  const btn = e.target.closest('[data-action="view-product-detail"]');
  if (!btn) return;
  openProductDetail({
    mode: btn.dataset.mode,
    itemId: btn.dataset.itemId || null,
    itemName: btn.dataset.itemName || "",
    unit: btn.dataset.unit || "",
    productMasterId: btn.dataset.productMasterId || null,
    lowStockThreshold: btn.dataset.lowStockThreshold,
    thresholdUnit: btn.dataset.thresholdUnit || ""
  });
});

// ---------- 在庫ロット(購入日) ----------
// item/fallbackモードで、対象商品名(itemId)のロット一覧を購入日つきで表示する。
// 数量・賞味期限の増減は在庫確認画面から行うため、ここでは登録時の入力ミスを直すための
// 「修正」ボタン(数量・賞味期限)のみを置く(購入日そのものは修正対象にしない)

function formatPurchaseDateLabel(purchaseDate) {
  if (!purchaseDate) return "購入日不明";
  return `購入日:${formatMonthDay(purchaseDate)}`;
}

function productDetailLotRowHtml(lot, unit, itemId) {
  const { text: expiryText } = formatExpiryLabel(lot.expiry_date);
  return `
    <div class="product-detail-lot-row">
      <span class="product-detail-lot-qty">${lot.quantity}${escapeHtml(unit)}</span>
      <span class="product-detail-lot-expiry">${escapeHtml(expiryText)}</span>
      <span class="product-detail-lot-purchase">${escapeHtml(formatPurchaseDateLabel(lot.purchase_date))}</span>
      <div class="product-detail-lot-fix-group">
        <button type="button" class="product-detail-lot-fix-btn" data-action="fix-lot-qty"
          data-lot-id="${lot.id}" data-item-id="${itemId}" data-qty="${lot.quantity}"
          data-unit="${escapeHtml(unit)}" data-purchase-date="${escapeHtml(lot.purchase_date || "")}">
          <span class="material-symbols-rounded">edit</span>数量
        </button>
        <button type="button" class="product-detail-lot-fix-btn" data-action="fix-lot-expiry"
          data-lot-id="${lot.id}" data-item-id="${itemId}" data-expiry="${escapeHtml(lot.expiry_date || "")}">
          <span class="material-symbols-rounded">event</span>期限
        </button>
      </div>
    </div>
  `;
}

async function loadAndRenderLots(itemId) {
  const listEl = document.getElementById("pd-lots-list");
  const { data: lots, error } = await supabaseClient
    .from("item_lots")
    .select("id, quantity, expiry_date, purchase_date")
    .eq("item_id", itemId);

  // 取得待ちの間に閉じられた/別の商品の詳細に切り替わっていたら、表示の更新はしない
  if (!currentItem || currentItem.id !== itemId) return;

  if (error) {
    console.error("在庫ロットの取得に失敗:", error);
    listEl.innerHTML = '<div class="empty-note">読み込みに失敗しました。</div>';
    return;
  }

  const sorted = sortLotsByExpiry(lots || []);
  listEl.innerHTML = sorted.length
    ? sorted.map(lot => productDetailLotRowHtml(lot, currentItem.unit, itemId)).join("")
    : '<div class="empty-note">在庫がありません。</div>';
}

// 「修正」ボタン: 登録時の入力ミスをその場で直す(correctLotQuantity、js/items.js)。
// 新しい購入・消費履歴は作らず、購入履歴のうち一意に対応する行が見つかった場合だけ
// その数量も書き換える(見つからない場合は履歴には触れず、その旨を通知する)
document.getElementById("pd-lots-list").addEventListener("click", (e) => {
  const fixBtn = e.target.closest('[data-action="fix-lot-qty"]');
  if (!fixBtn) return;

  openQuantityPicker({
    initialValue: Number(fixBtn.dataset.qty),
    unit: fixBtn.dataset.unit,
    title: "数量を修正",
    onConfirm: async (value) => {
      const result = await correctLotQuantity(
        fixBtn.dataset.lotId,
        fixBtn.dataset.itemId,
        value,
        Number(fixBtn.dataset.qty),
        fixBtn.dataset.purchaseDate || null
      );

      if (result?.error) {
        showAppNotice("数量の修正に失敗しました");
        return;
      }
      if (result?.historyUpdated === null) return; // 値が変わっていない

      showAppNotice(
        result?.historyUpdated
          ? "数量を修正しました(購入履歴も更新しました)"
          : "数量を修正しました(購入履歴は自動更新できませんでした)"
      );
      await loadAndRenderLots(fixBtn.dataset.itemId);
    }
  });
});

// 「期限」ボタン: 賞味期限の入力ミスをその場で直す。item_historyには賞味期限を記録して
// いないため、数量の修正と違って履歴側の照合は不要で、ロットの日付を直接書き換えるだけでよい。
// 修正後の日付が同じ商品の別ロットの期限とたまたま一致しても、自動では合算しない
// (登録時のミス修正という限定用途のため、頻度の低いこのケースまでは対応しない)。
// カレンダー(js/calendar.js)は「.date-display」クラスの要素をクリックすると自動的に開く
// 仕組みのため、非表示のプロキシ入力欄(#pd-lot-expiry-edit-proxy)をクリックして呼び出す
let pendingExpiryEditLotId = null;
let pendingExpiryEditItemId = null;

document.getElementById("pd-lots-list").addEventListener("click", (e) => {
  const fixExpiryBtn = e.target.closest('[data-action="fix-lot-expiry"]');
  if (!fixExpiryBtn) return;

  pendingExpiryEditLotId = fixExpiryBtn.dataset.lotId;
  pendingExpiryEditItemId = fixExpiryBtn.dataset.itemId;
  const proxy = document.getElementById("pd-lot-expiry-edit-proxy");
  proxy.value = fixExpiryBtn.dataset.expiry || "";
  proxy.click();
});

document.getElementById("pd-lot-expiry-edit-proxy").addEventListener("change", async (e) => {
  const lotId = pendingExpiryEditLotId;
  const itemId = pendingExpiryEditItemId;
  pendingExpiryEditLotId = null;
  pendingExpiryEditItemId = null;
  if (!lotId) return;

  const { error } = await supabaseClient.from("item_lots").update({ expiry_date: e.target.value || null }).eq("id", lotId);
  if (error) {
    console.error("賞味期限の修正に失敗:", error);
    showAppNotice("賞味期限の修正に失敗しました");
    return;
  }

  showAppNotice("賞味期限を修正しました");
  await loadAndRenderLots(itemId);
  loadItems();
});

// ---------- 商品名の修正 ----------
// あくまで登録時の誤字修正を想定した簡易な機能。商品名(items.name)は新規登録のたびに
// 完全一致で既存商品を検索するキーとして使われているため、修正後は「他のメンバーが
// 修正前の名前で登録すると別商品として重複してしまう」「過去の購入・消費履歴の商品名は
// 記録時点のスナップショットのため古い名前のまま残る」といった影響がありうるが、
// 誤字修正程度の用途であれば許容する
document.getElementById("pd-item-name-edit-btn").addEventListener("click", () => {
  if (!currentItem) return;
  document.getElementById("pd-item-name-input").value = currentItem.name;
  document.getElementById("pd-item-name-row").classList.add("hidden");
  document.getElementById("pd-item-name-edit-form").classList.remove("hidden");
});

function closeItemNameEdit() {
  document.getElementById("pd-item-name-edit-form").classList.add("hidden");
  document.getElementById("pd-item-name-row").classList.remove("hidden");
}
document.getElementById("pd-item-name-cancel-btn").addEventListener("click", closeItemNameEdit);

document.getElementById("pd-item-name-save-btn").addEventListener("click", async () => {
  const newName = document.getElementById("pd-item-name-input").value.trim();
  if (!currentItem || !newName) return;

  if (newName === currentItem.name) {
    closeItemNameEdit();
    return;
  }

  const { error } = await supabaseClient.from("items").update({ name: newName }).eq("id", currentItem.id);
  if (error) {
    console.error("商品名の修正に失敗:", error);
    showAppNotice("商品名の修正に失敗しました");
    return;
  }

  currentItem.name = newName;
  document.getElementById("pd-item-name").textContent = newName;
  closeItemNameEdit();
  showAppNotice("商品名を修正しました");
  loadItems();
});

// ---------- 在庫設定(最低数量) ----------
// 在庫確認画面の数量増減([-][+]・タップでドラムロール)と同じ操作感にしている。
// 増減幅は単位が個数系か定量系(g/mlなど)かで変える(在庫の数量調整と同じ判定)。
// 保存先はthresholdCtx.tableで切り替わる(masterモード: household_product_settings /
// fallbackモード: items)

function renderThresholdDisplay() {
  document.getElementById("pd-threshold-display").innerHTML =
    `${thresholdCtx.value}<span class="qty-unit">${escapeHtml(thresholdCtx.unit)}</span>`;
}

function thresholdStep() {
  return isContinuousUnit(thresholdCtx && thresholdCtx.unit) ? 100 : 1;
}

async function persistThreshold(newValue) {
  if (!thresholdCtx) return;
  const { table, id } = thresholdCtx;
  const value = Math.max(0, Math.min(9999, Math.round(newValue) || 0));

  if (table === "items") {
    const { error } = await supabaseClient
      .from("items")
      .update({ low_stock_threshold: value, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { console.error("最低数量の更新に失敗:", error); return; }
    await syncShoppingListForItem(id);
  } else {
    const { error } = await supabaseClient
      .from("household_product_settings")
      .upsert({ product_master_id: id, low_stock_threshold: value }, { onConflict: "household_id,product_master_id" });
    if (error) { console.error("最低数量の更新に失敗:", error); return; }
    await syncShoppingListForMaster(id);
  }

  // 更新待ちの間に閉じられた/別の商品に切り替わっていたら、表示の更新はしない
  if (!thresholdCtx || thresholdCtx.table !== table || thresholdCtx.id !== id) return;
  thresholdCtx.value = value;
  renderThresholdDisplay();
  showToast("最低数量を更新しました");
}

document.getElementById("pd-threshold-minus").addEventListener("click", () => {
  if (!thresholdCtx) return;
  persistThreshold(thresholdCtx.value - thresholdStep());
});
document.getElementById("pd-threshold-plus").addEventListener("click", () => {
  if (!thresholdCtx) return;
  persistThreshold(thresholdCtx.value + thresholdStep());
});
document.getElementById("pd-threshold-display").addEventListener("click", () => {
  if (!thresholdCtx) return;
  openQuantityPicker({
    initialValue: thresholdCtx.value,
    unit: thresholdCtx.unit,
    title: "最低数量を設定",
    onConfirm: (value) => persistThreshold(value)
  });
});

// ---------- 商品の削除(在庫の全ロットも一緒に削除される。item/fallbackモードのみ) ----------

document.getElementById("product-detail-delete-btn").addEventListener("click", async () => {
  if (!currentItem || currentMode === "master") return;
  if (!confirm("この商品を削除しますか?登録されている在庫(すべてのロット)も削除されます。")) return;

  const { error } = await supabaseClient.from("items").delete().eq("id", currentItem.id);
  if (error) {
    console.error("商品の削除に失敗:", error);
    return;
  }
  closeProductDetail();
  loadItems();
  loadShoppingList();
});

// ---------- 商品属性の作成(商品マスタが未作成のfallback商品向け) ----------

async function createOrRegenerateProductMaster(itemId, itemName) {
  const createMsgEl = document.getElementById("product-detail-create-message");
  const createBtn = document.getElementById("product-detail-create-btn");
  createMsgEl.textContent = "";
  createBtn.disabled = true;
  hide("product-detail-empty");
  show("product-detail-loading");

  const resolved = await resolveProductMaster(itemName, { forceRegenerate: true });

  createBtn.disabled = false;

  // 生成待ちの間に閉じられた/別の商品の詳細に切り替わっていたら、表示の更新はしない
  // (在庫一覧側の更新(loadItems)だけは、閉じられていても反映して問題ない)
  if (!resolved) {
    if (currentItem && currentItem.id === itemId) {
      hide("product-detail-loading");
      show("product-detail-empty");
      createMsgEl.textContent = "商品属性の作成に失敗しました。もう一度お試しください。";
      createMsgEl.className = "msg-error";
    }
    return;
  }

  const { master, generatedNew } = resolved;

  const { error: updateError } = await supabaseClient
    .from("items")
    .update({ product_master_id: master.id, updated_at: new Date().toISOString() })
    .eq("id", itemId);
  if (updateError) console.error("items.product_master_id の更新に失敗:", updateError);

  if (currentItem && currentItem.id === itemId) {
    currentMaster = master;

    // 最低数量の保存先を items からこの商品マスタ(household_product_settings)へ切り替える。
    // 新規作成した商品マスタなら、それまで items 側に設定していた値をそのまま引き継ぐ
    // (既存マスタを再利用した場合は、他の商品名・他の部屋と共有中の値を上書きしないよう、
    // その部屋の既存設定をそのまま使う)
    if (thresholdCtx && thresholdCtx.table === "items") {
      if (generatedNew && thresholdCtx.value > 0) {
        await supabaseClient
          .from("household_product_settings")
          .upsert({ product_master_id: master.id, low_stock_threshold: thresholdCtx.value }, { onConflict: "household_id,product_master_id" });
      }
      const { data: settings } = await supabaseClient
        .from("household_product_settings")
        .select("icon, low_stock_threshold")
        .eq("product_master_id", master.id)
        .maybeSingle();
      currentIcon = settings ? settings.icon : null;
      thresholdCtx = { table: "product_master", id: master.id, value: settings ? Number(settings.low_stock_threshold) || 0 : 0, unit: thresholdCtx.unit };
      renderThresholdDisplay();
    }

    renderView();
  }
  showAppNotice(generatedNew ? "商品属性を生成しました" : "既存の属性を利用しました");
  loadItems(); // 在庫一覧側の表示も最新化する
}

document.getElementById("product-detail-create-btn").addEventListener("click", () => {
  if (!currentItem) return;
  createOrRegenerateProductMaster(currentItem.id, currentItem.name);
});
