// ==========================================================
// ホーム画面のダッシュボード化
// 「食材を登録」「食材を消費」の2カードから、各モーダル(下から出るシート)を開閉する。
//
// 【重要】このファイルは見た目・画面遷移の制御のみを行う。
// scan-btn / photo-btn / goto-manual-add-btn / consume-scan-btn /
// consume-photo-btn / goto-manual-consume-btn は、
// barcode.js / aiPhoto.js / consume.js / navigation.js に元々ある
// イベントリスナーがそのまま動作する(ここでは追加のリスナーを乗せるだけ)。
// ==========================================================

function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
}
function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}

document.getElementById("open-register-modal-btn").addEventListener("click", () => {
  openModal("register-modal-overlay");
});
document.getElementById("open-consume-modal-btn").addEventListener("click", () => {
  openModal("consume-modal-overlay");
});

document.getElementById("close-register-modal-btn").addEventListener("click", () => {
  closeModal("register-modal-overlay");
});
document.getElementById("close-consume-modal-btn").addEventListener("click", () => {
  closeModal("consume-modal-overlay");
});

// 背景(オーバーレイ部分)をタップしても閉じる
document.getElementById("register-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "register-modal-overlay") closeModal("register-modal-overlay");
});
document.getElementById("consume-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "consume-modal-overlay") closeModal("consume-modal-overlay");
});

// 各選択肢をタップしたら、既存の処理(バーコード起動・AI判定・手動ページ遷移)は
// そのまま動かしつつ、モーダルだけ自動で閉じる
["scan-btn", "photo-btn", "goto-manual-add-btn"].forEach(id => {
  document.getElementById(id).addEventListener("click", () => closeModal("register-modal-overlay"));
});
["consume-scan-btn", "consume-photo-btn", "goto-manual-consume-btn"].forEach(id => {
  document.getElementById(id).addEventListener("click", () => closeModal("consume-modal-overlay"));
});
