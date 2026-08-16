// ==========================================================
// ホーム画面: 挨拶・日付の表示、賞味期限のお知らせを行う。
//
// 「商品を登録」「商品を消費」(AI/手動)は、ナビバー中央の円形メニュー
// (js/navRadial.js)に移設済み。
// ==========================================================

import { supabaseClient } from "./config.js";
import { escapeHtml } from "./utils.js";
import { switchView } from "./navigation.js";
import { closeRegisterOverlay, focusInventoryOnItemName } from "./items.js";
import { ANNIVERSARIES } from "./anniversaries.js";
import { isContinuousUnit } from "./quantity.js";

// ---------- 完了したら自動でオーバーレイを閉じる ----------

function watchSuccessMessage(elId, onSuccess) {
  const el = document.getElementById(elId);
  new MutationObserver(() => {
    if (el.classList.contains("msg-ok") && el.textContent) {
      setTimeout(onSuccess, 700);
    }
  }).observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class"] });
}

watchSuccessMessage("manual-add-message", closeRegisterOverlay); // 手動登録の成功

// 賞味期限のお知らせ・使い切り目安はページを開いた時点のロット一覧を集計するだけで
// 自動更新されないため、登録(AI・手動)・消費が完了するたびに再集計する
// (loadExpiryNoticesはこのファイルの下の方で定義しているが、function宣言は巻き上げられるため問題ない)
watchSuccessMessage("manual-add-message", loadExpiryNotices);
watchSuccessMessage("add-message", loadExpiryNotices);
watchSuccessMessage("consume-message", loadExpiryNotices);

// ---------- 挨拶・日付の表示 ----------

function timeBasedGreeting() {
  const hour = new Date().getHours();
  return hour < 5 ? "こんばんは" : hour < 11 ? "おはようございます" : hour < 18 ? "こんにちは" : "こんばんは";
}

function formattedTodayDate() {
  const now = new Date();
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][now.getDay()];
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日(${weekday})`;
}

function renderHomeGreeting() {
  document.getElementById("home-greeting").textContent = timeBasedGreeting();
  document.getElementById("home-date").textContent = formattedTodayDate();
}
renderHomeGreeting();

// ---------- 「今日は何の日」との交互表示 ----------
//
// 挨拶(#home-greeting)を「時間帯の挨拶」⇔「今日は何の日？」の問いかけに、
// 日付(#home-date)を「日付」⇔その日の記念日名(js/anniversaries.jsの静的データ、
// Wikipedia「日本の記念日一覧」由来)に、約10秒ごとに同時に切り替えて表示する
// (Yahoo Kids「今日は何の日」のような詳細な説明文までは持たないデータのため、
// 記念日名そのものを「詳細」として表示する)。該当日のデータが無ければ何もしない
function startAnniversaryToggle() {
  const now = new Date();
  const names = ANNIVERSARIES[`${now.getMonth() + 1}-${now.getDate()}`];
  if (!names || names.length === 0) return;

  const greetingEl = document.getElementById("home-greeting");
  const dateEl = document.getElementById("home-date");
  let showingAnniversary = false;

  setInterval(() => {
    showingAnniversary = !showingAnniversary;
    greetingEl.textContent = showingAnniversary ? "今日は何の日？" : timeBasedGreeting();
    dateEl.textContent = showingAnniversary ? names.join("・") : formattedTodayDate();
    greetingEl.classList.remove("home-greeting-fade");
    dateEl.classList.remove("home-greeting-fade");
    void greetingEl.offsetWidth;
    greetingEl.classList.add("home-greeting-fade");
    dateEl.classList.add("home-greeting-fade");
  }, 10000);
}
startAnniversaryToggle();

// ---------- 賞味期限のお知らせ ----------
//
// 期限切れ・3日前・1週間以内・1ヶ月以内をロット単位で集計する。4つは横並びのタブで、
// タップすると共通のパネルにその内容(商品名・期限・数量の一覧)を開く
// (同じタブをもう一度押すと閉じる。一度に開けるのは1つだけ)。
// 「1週間以内」「1ヶ月以内」は、登録(購入)時点ですでにその期間を切っていたロットは対象外にする
// (最初から賞味期限が短い商品として買った物は、今さら「お知らせ」する意味が薄いため)。
// 「3日前」だけは、直前に迫った期限を確実に知らせるという性質上、この対象外ルールを適用せず、
// 購入日にかかわらず常に表示する。期限切れ・3日前・1週間以内・1ヶ月以内は互いに重複しない
// (1つのロットはいずれか1つにのみ入る)

function daysBetween(fromDateStr, toDateStr) {
  const from = new Date(fromDateStr + "T00:00:00");
  const to = new Date(toDateStr + "T00:00:00");
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatNoticeExpiry(expiryDate) {
  const d = new Date(expiryDate + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// タブ切替のたびに再取得せず使い回せるよう、直近の集計結果をキーごとに保持しておく
const expiryNoticeData = { expired: [], days3: [], week: [], month: [] };
let activeExpiryNoticeKey = null;

// ---------- 使い切り目安 ----------
//
// めんつゆのような減りにくい商品は、賞味期限が近づいてようやく「まだこんなに残っていた」と
// 気づきがちなため、登録(購入)時点の賞味期限が長い商品(定量系90日以上/個数系180日以上)を
// 対象に、経過日数から見て理想的にはあと何%残っているべきかを表示する(実際の消費量とは
// 比較しない、あくまで時間ベースの目安)。賞味期限切れのロットは「期限切れ」タブと役割が
// 重複するため対象外。並び順は目安%が低い(=最も消費が遅れていそうな)順
const PACE_NOTICE_THRESHOLD_DAYS = { continuous: 90, count: 180 };
let paceNoticeData = [];
let paceNoticePanelOpen = false;

function computePaceNotice(lot) {
  if (!lot.expiry_date || !lot.purchase_date || !lot.items) return null;

  const shelfLifeAtPurchase = daysBetween(lot.purchase_date, lot.expiry_date);
  const daysLeft = daysBetween(localDateKey(new Date()), lot.expiry_date);
  if (daysLeft < 0) return null;

  const threshold = isContinuousUnit(lot.items.unit) ? PACE_NOTICE_THRESHOLD_DAYS.continuous : PACE_NOTICE_THRESHOLD_DAYS.count;
  if (shelfLifeAtPurchase < threshold) return null;

  const idealRemainingPct = Math.max(0, Math.min(100, Math.round((daysLeft / shelfLifeAtPurchase) * 100)));
  return { lot, idealRemainingPct };
}

function renderPaceNoticePanel() {
  const panel = document.getElementById("pace-notice-panel");

  panel.innerHTML = paceNoticeData.length === 0
    ? '<div class="expiry-notice-empty">該当する商品はありません</div>'
    : paceNoticeData.map(({ lot, idealRemainingPct }) => {
        const pctClass = idealRemainingPct < 30 ? "low" : idealRemainingPct < 60 ? "mid" : "";
        return `
          <div class="expiry-notice-item" data-item-name="${escapeHtml(lot.items.name)}">
            <span class="expiry-notice-item-name">${escapeHtml(lot.items.name)}</span>
            <span class="expiry-notice-item-expiry">${escapeHtml(formatNoticeExpiry(lot.expiry_date))}</span>
            <span class="expiry-notice-item-qty">${lot.quantity}${escapeHtml(lot.items.unit)}</span>
            <span class="pace-notice-item-pct ${pctClass}">目安${idealRemainingPct}%</span>
          </div>
        `;
      }).join("");
}

function renderExpiryNoticePanel(key) {
  const panel = document.getElementById("expiry-notice-panel");
  const lots = expiryNoticeData[key];

  panel.innerHTML = lots.length === 0
    ? '<div class="expiry-notice-empty">該当する商品はありません</div>'
    : lots.map(lot => `
        <div class="expiry-notice-item" data-item-name="${escapeHtml(lot.items.name)}">
          <span class="expiry-notice-item-name">${escapeHtml(lot.items.name)}</span>
          <span class="expiry-notice-item-expiry">${escapeHtml(formatNoticeExpiry(lot.expiry_date))}</span>
          <span class="expiry-notice-item-qty">${lot.quantity}${escapeHtml(lot.items.unit)}</span>
        </div>
      `).join("");
}

async function loadExpiryNotices() {
  const { data, error } = await supabaseClient
    .from("item_lots")
    .select("id, quantity, expiry_date, purchase_date, items(name, unit)");

  if (error || !data) return;

  const todayKey = localDateKey(new Date());
  const expired = [];
  const days3 = [];
  const week = [];
  const month = [];

  data.forEach(lot => {
    if (!lot.expiry_date || !lot.items) return;

    const daysLeft = daysBetween(todayKey, lot.expiry_date);
    if (daysLeft < 0) { expired.push(lot); return; }

    if (daysLeft <= 3) { days3.push(lot); return; }

    // 登録(購入)時点での賞味期限の長さ。これが短い商品(例: 元々1週間しか無い商品)は
    // 該当の期間に入っても「お知らせ」の対象にしない(「3日前」には適用しない、上のreturnで既に確定済み)
    const shelfLifeAtPurchase = lot.purchase_date ? daysBetween(lot.purchase_date, lot.expiry_date) : null;

    if (daysLeft <= 7) {
      if (shelfLifeAtPurchase === null || shelfLifeAtPurchase > 7) week.push(lot);
    } else if (daysLeft <= 30) {
      if (shelfLifeAtPurchase === null || shelfLifeAtPurchase > 30) month.push(lot);
    }
  });

  // 各グループの中では期限が近い順に並べる
  const byExpiry = (a, b) => (a.expiry_date < b.expiry_date ? -1 : a.expiry_date > b.expiry_date ? 1 : 0);
  [expired, days3, week, month].forEach(group => group.sort(byExpiry));

  expiryNoticeData.expired = expired;
  expiryNoticeData.days3 = days3;
  expiryNoticeData.week = week;
  expiryNoticeData.month = month;

  // 使い切り目安も同じ取得結果から集計する(追加の問い合わせはしない)
  paceNoticeData = data
    .map(computePaceNotice)
    .filter(Boolean)
    .sort((a, b) => a.idealRemainingPct - b.idealRemainingPct);
  document.getElementById("pace-notice-count").textContent = paceNoticeData.length;
  if (paceNoticePanelOpen) renderPaceNoticePanel();

  document.getElementById("expiry-notice-count-expired").textContent = expired.length;
  document.getElementById("expiry-notice-count-days3").textContent = days3.length;
  document.getElementById("expiry-notice-count-week").textContent = week.length;
  document.getElementById("expiry-notice-count-month").textContent = month.length;

  // 開いているタブがあれば中身も最新の内容に更新する
  if (activeExpiryNoticeKey) renderExpiryNoticePanel(activeExpiryNoticeKey);
}
loadExpiryNotices();

// タブをタップすると、対応する内容を共通パネルに開く(同じタブの再タップで閉じる)
document.querySelectorAll(".expiry-notice-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    const key = tab.dataset.key;
    const panel = document.getElementById("expiry-notice-panel");

    if (activeExpiryNoticeKey === key) {
      activeExpiryNoticeKey = null;
      panel.classList.add("hidden");
      document.querySelectorAll(".expiry-notice-tab").forEach(t => t.classList.remove("active"));
      return;
    }

    activeExpiryNoticeKey = key;
    document.querySelectorAll(".expiry-notice-tab").forEach(t => t.classList.toggle("active", t === tab));
    renderExpiryNoticePanel(key);
    panel.classList.remove("hidden");
  });
});

// パネル内の商品をタップすると、在庫確認画面でその商品名だけに絞り込んで表示する
document.getElementById("expiry-notice-panel").addEventListener("click", (e) => {
  const row = e.target.closest(".expiry-notice-item");
  if (!row) return;
  switchView("inventory");
  focusInventoryOnItemName(row.dataset.itemName);
});

// 使い切り目安の見出しをタップすると開閉する(③の各タブと同じトグル動作)
document.getElementById("pace-notice-tab").addEventListener("click", (e) => {
  const tab = e.currentTarget;
  const panel = document.getElementById("pace-notice-panel");

  paceNoticePanelOpen = !paceNoticePanelOpen;
  tab.classList.toggle("active", paceNoticePanelOpen);
  panel.classList.toggle("hidden", !paceNoticePanelOpen);
  if (paceNoticePanelOpen) renderPaceNoticePanel();
});

document.getElementById("pace-notice-panel").addEventListener("click", (e) => {
  const row = e.target.closest(".expiry-notice-item");
  if (!row) return;
  switchView("inventory");
  focusInventoryOnItemName(row.dataset.itemName);
});
