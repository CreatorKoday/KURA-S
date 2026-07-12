// ==========================================================
// 共通ユーティリティ(メッセージ表示・HTMLエスケープ・数量プルダウン生成)
// ==========================================================

export function showMessage(el, text, isError) {
  el.textContent = text;
  el.className = isError ? "msg-error" : "msg-ok";
}

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// 数量選択用のプルダウンを組み立てる(AIが検出した数量が範囲外でもその値を含める)
export function buildQuantityOptionsHtml(selectedValue, max) {
  max = max || 30;
  const selectedNum = Number(selectedValue) || 0;
  const effectiveMax = Math.max(max, selectedNum);
  let opts = "";
  for (let i = 0; i <= effectiveMax; i++) {
    opts += `<option value="${i}" ${i === selectedNum ? "selected" : ""}>${i}</option>`;
  }
  return opts;
}

export function fillQuantitySelect(selectEl, min, max, selected) {
  selectEl.innerHTML = "";
  for (let i = min; i <= max; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = i;
    if (i === selected) opt.selected = true;
    selectEl.appendChild(opt);
  }
}
