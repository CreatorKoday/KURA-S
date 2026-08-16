// ==========================================================
// エントリーポイント
// 各機能モジュールを読み込むことで、それぞれの中にある
// イベントリスナー登録などの初期化処理が実行される
// ==========================================================

import "./config.js";
import "./elements.js";
import "./utils.js";

import "./quantity.js";
import "./quantityPicker.js";
import "./units.js";

import "./shopping.js";
import "./items.js";
import "./productDetail.js";
import "./shoppingPurchase.js";

import "./aiPhoto.js";
import "./consume.js";

import "./navigation.js";
import "./auth.js";
import "./account.js";
import "./home.js";
import "./navRadial.js";
import "./history.js";
import "./summary.js";
import "./balanceSheet.js";
import "./expenseMenu.js";

import "./calendar.js";

// 静的に配置されているアイコン(ナビ・ボタンなど)を初期化する
if (window.lucide) lucide.createIcons();

// ▼▼▼ 一時的な診断表示(下部ナビの余白の原因調査用。原因特定後に削除する) ▼▼▼
(function debugSafeArea() {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:rgba(0,0,0,0.85);color:#0f0;font-size:11px;font-family:monospace;padding:6px;white-space:pre-wrap;pointer-events:none;";
  document.body.appendChild(el);

  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;bottom:0;left:0;width:1px;padding-bottom:env(safe-area-inset-bottom);visibility:hidden;";
  document.body.appendChild(probe);

  // スクリーンショットは常に画面の物理的な全体を写すため、position:fixed;bottom:0(加工なし)の
  // 位置を赤い線で可視化し、画面の本当の下端とのズレをスクリーンショット上で直接測れるようにする
  const marker = document.createElement("div");
  marker.style.cssText = "position:fixed;bottom:0;left:0;right:0;height:6px;background:red;z-index:99998;pointer-events:none;";
  document.body.appendChild(marker);

  function update() {
    const navBar = document.querySelector(".nav-bar");
    const rect = navBar ? navBar.getBoundingClientRect() : null;
    const lines = [
      `innerHeight: ${window.innerHeight}`,
      `outerHeight: ${window.outerHeight}`,
      `screen.height: ${screen.height}`,
      `devicePixelRatio: ${window.devicePixelRatio}`,
      `standalone(matchMedia): ${window.matchMedia("(display-mode: standalone)").matches}`,
      `navigator.standalone: ${window.navigator.standalone}`,
      `safe-area-inset-bottom(probe): ${getComputedStyle(probe).paddingBottom}`,
      `nav-bar rect.top/bottom: ${rect ? rect.top.toFixed(1) : "N/A"} / ${rect ? rect.bottom.toFixed(1) : "N/A"}`,
      `gap = innerHeight - navBar.bottom: ${rect ? (window.innerHeight - rect.bottom).toFixed(1) : "N/A"}`,
    ];
    el.textContent = lines.join("\n");
  }
  update();
  window.addEventListener("resize", update);
  setTimeout(update, 500);
  setTimeout(update, 1500);
})();
// ▲▲▲ 一時的な診断表示ここまで ▲▲▲
