// ==========================================================
// 共通ユーティリティ(メッセージ表示・HTMLエスケープ・数量プルダウン生成)
// ==========================================================

export function showMessage(el, text, isError) {
  el.textContent = text;
  el.className = isError ? "msg-error" : "msg-ok";
}

// 画面上部に浮かぶiPhone通知風のバナー。登録・消費・買い物リスト追加などの
// 完了メッセージ(緑色だったもの)はここに集約して表示する。position:fixedで
// .wrapの外側に置いているため、商品登録オーバーレイなど他のシートより常に手前に表示され、
// 表示後は自動的にスライドアウトして消える
let appNoticeTimer = null;
export function showAppNotice(text) {
  const el = document.getElementById("app-notice");
  if (!el) return;
  clearTimeout(appNoticeTimer);
  if (!text) {
    el.classList.remove("show");
    return;
  }
  el.querySelector(".app-notice-text").textContent = text;
  // 連続で呼ばれた場合(表示中に次の通知が来た場合)も、一度クラスを外してから
  // 付け直すことで毎回スライドインのアニメーションが再生されるようにする
  el.classList.remove("show");
  void el.offsetWidth; // reflow
  el.classList.add("show");
  appNoticeTimer = setTimeout(() => el.classList.remove("show"), 4000);
}

// upsertItemByName()/resolveItem() が返す productMasterStatus から、
// 登録完了メッセージに添える前置き文を作る(該当なしの場合は空文字)
export function productMasterStatusPrefix(status) {
  if (status === "generated") return "AIが生成。";
  if (status === "reused") return "既存属性を利用。";
  return "";
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

// item_lots(quantity)を埋め込んだ商品行から、消費フロー等で使う集計済み数量(quantity)を持つ配列を作る
export function withTotalQuantity(rows) {
  return (rows || []).map(item => ({
    ...item,
    quantity: (item.item_lots || []).reduce((sum, l) => sum + Number(l.quantity), 0)
  }));
}

// Geminiのレスポンスがレート制限(429/RESOURCE_EXHAUSTED)によるエラーかどうかを判定する
export function isGeminiRateLimitError(data) {
  return !!(data && data.error && (data.error.code === 429 || data.error.status === "RESOURCE_EXHAUSTED"));
}

// Gemini呼び出しがレート制限で失敗した場合、1分待って1回だけ自動的に再試行する
// (RPM上限は1分単位の枠のため、数秒程度の短い待機では同じ枠内に留まり再度失敗しやすい)。
// レート制限以外のエラーは再試行せずそのまま投げる。fnは「1回分の呼び出し」を行う関数で、
// レート制限時は Error に isGeminiRateLimit = true を付けて投げる約束にしている
export async function withGeminiRetry(fn, onWaiting) {
  try {
    return await fn();
  } catch (e) {
    if (!e.isGeminiRateLimit) throw e;
    if (onWaiting) onWaiting();
    await new Promise(resolve => setTimeout(resolve, 60000));
    try {
      return await fn();
    } catch (e2) {
      if (e2.isGeminiRateLimit) throw new Error("AIが混み合っているため、再試行にも失敗しました。しばらくしてからお試しください");
      throw e2;
    }
  }
}
