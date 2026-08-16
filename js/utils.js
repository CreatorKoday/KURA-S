// ==========================================================
// 共通ユーティリティ(メッセージ表示・HTMLエスケープ・数量プルダウン生成)
// ==========================================================

// ホーム画面に追加したアプリ(スタンドアロン)では、CSSの100%/100dvhが実際の画面の高さより
// 低く計算されることがあり、.wrap等がその分低くなって下部に余白ができてしまう。
// window.innerHeightを都度CSS変数--app-heightへ反映し、common.cssの.wrap/html,bodyが
// これを優先して使うことで、実際の画面の高さに合わせる(2026-08-16〜)。
// あわせて、position:fixed;bottom:0要素(下部ナビ等)もwindow.innerHeight基準に配置され、
// 実機での実測(screen.height - innerHeight = 47px)の通り実際の画面より短くなることが
// あるため、その差分を--fixed-bottom-offsetへ反映し、該当要素のbottomから差し引く形で
// 画面の本当の下端に届くよう補正する(env(safe-area-inset-bottom)とは別の、iOS標準アプリ化
// 時のビューポート計算のズレへの対応)
function setupAppHeightVar() {
  const apply = () => {
    const root = document.documentElement;
    root.style.setProperty("--app-height", `${window.innerHeight}px`);
    const bottomGap = Math.max(0, window.screen.height - window.innerHeight);
    root.style.setProperty("--fixed-bottom-offset", `${bottomGap}px`);
  };
  apply();
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", apply);
  }
}
setupAppHeightVar();

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

// YYYY-MM-DD形式の日付文字列を、今年なら「m/d」、それ以外の年なら「yyyy/m/d」に整形する。
// 在庫確認画面の期限・購入日、賞味期限のお知らせ・使い切り目安の期限で共通利用する
export function formatMonthDay(dateStr) {
  const dt = new Date(dateStr + "T00:00:00");
  const monthDay = `${dt.getMonth() + 1}/${dt.getDate()}`;
  return dt.getFullYear() === new Date().getFullYear() ? monthDay : `${dt.getFullYear()}/${monthDay}`;
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
