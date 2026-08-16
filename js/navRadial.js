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

// #nav-radial-btn/#nav-radial-expandは.nav-bar(position:relative)の子要素とし、
// position:absolute; bottom:100%でナビバーの上端を基準に配置する(navRadial.css)。
// 以前はposition:fixedのままJavaScriptでナビバーの実際の位置に追従させていたが、
// position:fixed自体がiOSのホーム画面追加アプリで実際の画面の高さより短く解釈される
// ことがあり、追従計算をしてもズレの影響を受けてしまっていたため、位置計算が一切不要な
// この方式に変更した(2026-08-16〜)

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
