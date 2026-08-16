// ==========================================================
// ナビバー中央の円形メニュー(登録・消費)
//
// PayPayの「支払う」ボタンのように、ナビバー中央からはみ出す小さいアイコンボタン
// (#nav-radial-btn)は常時表示され続け、タップするたびに半円メニュー(#nav-radial-expand)を
// 開閉するトグルとして働く。半円メニューは開いている間、中身を差し替えながら2段階で選択させる:
//   choose … 左半分=登録・右半分=消費
//   method … 選んだ側の色に変わり、左半分=AI・右半分=手動に差し替わる
// method状態でAI/手動を選ぶと、ホーム画面に以前あったAI/手動ボタンと同じ処理を呼び出し、
// 半円メニューは閉じる。アイコンボタンの再タップ、または円の外側のタップでも、
// どの段階からでも同様に閉じる
// ==========================================================

import { openRegisterManualOverlay } from "./items.js";
import { openConsumeSearchOverlay } from "./consume.js";

const btn = document.getElementById("nav-radial-btn");
const expandEl = document.getElementById("nav-radial-expand");
const content = document.getElementById("nav-radial-content");
const backdrop = document.getElementById("nav-radial-backdrop");
const navBarEl = document.querySelector(".nav-bar");

// #nav-radial-btn/#nav-radial-expandはposition:fixedのまま(ナビバーの上に浮かせる必要が
// あるため)だが、.nav-bar自体はもうposition:fixedではなく#app-shell内の通常のレイアウトで
// 画面下部に配置される(index.html/common.cssのコメント参照)。そのため、この2つの位置は
// .nav-barの実際の表示位置(getBoundingClientRect())を基準に、都度インラインスタイルで
// 揃える(2026-08-16〜)。bottomではなくtopを使うのは、iOSのホーム画面追加アプリでは
// position:fixed要素のbottomがwindow.innerHeightを基準に解釈される(実際の画面の高さより
// 短くなる)ことがあり、bottom基準の計算だとこの2つも同じズレの影響を受けてナビバーより
// 浮いて見えてしまうため。topは常にビューポートの本当の上端からの距離を表すため、この
// ズレの影響を受けない
export function alignNavRadial() {
  if (!navBarEl) return;
  const navBarTop = navBarEl.getBoundingClientRect().top;
  const btnHeight = btn.getBoundingClientRect().height || 62;
  const expandHeight = expandEl.getBoundingClientRect().height || 110;
  btn.style.bottom = "auto";
  btn.style.top = `${navBarTop - 12 - btnHeight}px`;
  expandEl.style.bottom = "auto";
  expandEl.style.top = `${navBarTop - expandHeight}px`;
}
alignNavRadial();
window.addEventListener("resize", alignNavRadial);
window.addEventListener("orientationchange", alignNavRadial);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", alignNavRadial);
}

let open = false;
let state = "choose"; // "choose" | "method"(openがtrueの間のみ意味を持つ)
let chosenAction = null; // "register" | "consume"(method状態でのみ意味を持つ)

function openRegisterAi() {
  document.getElementById("photo-btn").click();
}
function openConsumeAi() {
  document.getElementById("consume-photo-btn").click();
}

function renderChoose() {
  content.innerHTML = `
    <button type="button" class="nav-radial-half nav-radial-left" data-choice="register">
      <span class="material-symbols-rounded">add_circle</span>
      <span class="nav-radial-half-label">登録</span>
    </button>
    <button type="button" class="nav-radial-half nav-radial-right" data-choice="consume">
      <span class="material-symbols-rounded">remove_circle</span>
      <span class="nav-radial-half-label">消費</span>
    </button>
  `;
}

function renderMethod() {
  content.innerHTML = `
    <button type="button" class="nav-radial-half nav-radial-left" data-choice="ai">
      <span class="material-symbols-rounded">photo_camera</span>
      <span class="nav-radial-half-label">AI</span>
    </button>
    <button type="button" class="nav-radial-half nav-radial-right" data-choice="manual">
      <span class="material-symbols-rounded">edit</span>
      <span class="nav-radial-half-label">手動</span>
    </button>
  `;
}

function render() {
  content.classList.remove("category-register", "category-consume");
  if (state === "method") {
    content.classList.add(chosenAction === "register" ? "category-register" : "category-consume");
    renderMethod();
  } else {
    renderChoose();
  }
}

function expand() {
  open = true;
  state = "choose";
  chosenAction = null;
  render();
  expandEl.classList.remove("hidden");
  backdrop.classList.remove("hidden");
}

function collapse() {
  open = false;
  expandEl.classList.add("hidden");
  backdrop.classList.add("hidden");
}

// アイコンボタンは常時表示され続けるトグル: 開いていなければ開き、開いていれば閉じる
btn.addEventListener("click", () => {
  if (open) collapse(); else expand();
});

content.addEventListener("click", (e) => {
  const el = e.target.closest("[data-choice]");
  if (!el) return;
  const choice = el.dataset.choice;

  if (state === "choose") {
    chosenAction = choice; // "register" または "consume"
    state = "method";
    render();
    return;
  }

  if (state === "method") {
    if (chosenAction === "register") {
      if (choice === "ai") openRegisterAi(); else openRegisterManualOverlay();
    } else {
      if (choice === "ai") openConsumeAi(); else openConsumeSearchOverlay();
    }
    collapse();
  }
});

backdrop.addEventListener("click", collapse);
