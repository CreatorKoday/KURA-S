// ==========================================================
// 部屋(household)の作成・キーでの入室・退室。
//
// ログインにメール/パスワードは使わず、Supabaseの匿名サインインを裏側で使う。
// 認証画面は既定で「キーで入室」(ルームキー+ニックネーム)を表示し、
// 新規作成は「新規作成はこちら」から別画面(メールアドレスのみ)で行う。
//
// 部屋の新規作成・「キーを忘れた場合」は、どちらもSupabaseのマジックリンクで
// メールアドレスの所有権を確認する方式に統一している(確認コードのメール本文表示は
// 2026-06-03以降Supabase無料プランのデフォルトメール機能ではテンプレート編集が
// できず表示できないため、テンプレート編集不要のマジックリンク方式にした)。
// メール内のリンクを開くとセッションが匿名から実メールアドレスの認証済み
// セッションに置き換わるため、`init()`がこれを検知して`handleVerifiedEmailReturn()`を呼び、
// クエリパラメータ`auth_intent`で「新規作成」か「キーを忘れた場合」かを判別した上で
// 該当するRPCを呼び、結果のルームキーだけを共通の`#auth-key-reveal`画面に表示する
// (この時点ではまだhousehold_membersへの登録は行わない。部屋の作成者も他の
// メンバーと同じ`join_household_by_key`経由で実際に入室する)。
// キー表示後は`signOut`→`signInAnonymously`で通常の入室待ち状態に戻す。
// household_id(部屋の分離)・actor_nickname(誰が操作したか)は
// DB側の関数(current_household_id/current_nickname、sql/017参照)が
// insert時に自動設定するため、アプリ側では意識する必要がない。
// ==========================================================

import { supabaseClient } from "./config.js";
import { authCard, loggedInArea, messageBox, userNicknameLabel } from "./elements.js";
import { showMessage, showAppNotice, escapeHtml } from "./utils.js";
import { switchView } from "./navigation.js";
import { loadShoppingList } from "./shopping.js";

function showEntryForm() {
  authCard.classList.remove("hidden");
  loggedInArea.classList.add("hidden");
  document.getElementById("auth-join-form").classList.remove("hidden");
  document.getElementById("auth-create-form").classList.add("hidden");
  document.getElementById("auth-forgot-key-form").classList.add("hidden");
  document.getElementById("auth-mail-sent").classList.add("hidden");
  document.getElementById("auth-key-reveal").classList.add("hidden");
  existingNicknames = [];
  renderNicknameSuggestions();
}

function showLoggedIn(member) {
  authCard.classList.add("hidden");
  loggedInArea.classList.remove("hidden");
  userNicknameLabel.textContent = member.nickname;
  switchView("home");
  loadShoppingList();
}

export function renderAuthState(member) {
  if (member) showLoggedIn(member);
  else showEntryForm();
}

// 今のセッションが既にどこかの部屋に参加済みか確認する(参加済みならそのニックネームを返す)
async function fetchCurrentMembership() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabaseClient
    .from("household_members")
    .select("nickname, household_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) { console.error("参加状況の確認に失敗:", error); return null; }
  return data;
}

// 匿名サインインに失敗した場合(Supabase側で「Anonymous Sign-ins」が無効になっている等)、
// 部屋の作成/入室フォームを操作できてしまうと、ユーザーが紐付かないまま
// household_membersへのinsertが失敗し分かりにくいエラーになる。フォーム自体を隠して防ぐ
function showBlockedState() {
  document.getElementById("auth-create-form").classList.add("hidden");
  document.getElementById("auth-join-form").classList.add("hidden");
  document.getElementById("auth-forgot-key-form").classList.add("hidden");
  document.getElementById("auth-mail-sent").classList.add("hidden");
  document.getElementById("auth-key-reveal").classList.add("hidden");
}

// キーだけを表示する共通画面(部屋の新規作成・キーを忘れた場合のどちらでも使う)。
// コピーボタン(別アプリ/別タブに貼り付ける用)と「そのまま入室に進む」
// (同じ画面のまま入室フォームにキーを自動入力する用)の両方を用意する
function showKeyReveal(title, note, roomKey) {
  document.getElementById("auth-key-reveal-title").textContent = title;
  document.getElementById("auth-key-reveal-note").textContent = note;
  document.getElementById("auth-key-text").textContent = roomKey;
  document.getElementById("auth-join-form").classList.add("hidden");
  document.getElementById("auth-key-reveal").classList.remove("hidden");
}

// アカウント画面からの「メールアドレスを変更する」で戻ってきた場合の処理。
// 対象の部屋を特定するルームキーは、マジックリンクのURL自体(クエリパラメータ)から
// 受け取る。ホーム画面に追加してアプリ化(PWA)している場合、メール内のリンクは
// アプリ内ではなくSafari側で開かれ、SafariとPWAはlocalStorageを共有しないため、
// localStorage経由だと更新処理そのものが失敗してしまう(URLのクエリパラメータは
// リンクとしてそのままSafari側にも渡るため確実に読める)。
// マジックリンク確認直後のセッションは、元々部屋に入室していた匿名セッションとは
// 別物(auth.uid()が変わる)になるため、更新後は「同じブラウザでリンクを開いた
// 場合に限り」js/account.jsが送信前にlocalStorageへ保存しておいた元の匿名セッションへの
// 復元を試みる(あくまでおまけの利便性向上で、復元できなくても更新自体は既に成功している。
// PWA利用時など復元できない場合、そもそも触っていないPWA側のセッションはそのまま
// 入室状態を保っているため実害はない)
async function handleEmailChangeReturn(roomKey) {
  const pendingSessionRaw = localStorage.getItem("kurasEmailChangeSession");
  localStorage.removeItem("kurasEmailChangeSession");

  let errorMessage = null;
  if (!roomKey) {
    errorMessage = "変更手続きの情報が見つかりませんでした。もう一度お試しください";
  } else {
    const { error } = await supabaseClient.rpc("update_household_email", { p_room_key: roomKey });
    if (error) {
      const duplicateEmail = error.message.includes("duplicate") || error.message.includes("unique");
      errorMessage = duplicateEmail ? "このメールアドレスは既に他の部屋で使われています" : "メールアドレスの変更に失敗しました";
    }
  }

  if (pendingSessionRaw) {
    try {
      const pendingSession = JSON.parse(pendingSessionRaw);
      const { error: restoreError } = await supabaseClient.auth.setSession(pendingSession);
      if (!restoreError) {
        renderAuthState(await fetchCurrentMembership());
        switchView("account");
        if (errorMessage) showMessage(document.getElementById("account-message"), errorMessage, true);
        else showAppNotice("メールアドレスを変更しました");
        return;
      }
    } catch {
      // JSON解析失敗等はフォールバック(下の通常の入室待ち状態への復帰)へ進む
    }
  }

  // このブラウザでは元のセッションへ復元できない(別ブラウザ・PWAのSafari起動等)場合、
  // この画面(Safari等)だけを改めてルームキー入力が必要な通常の入室待ち状態に戻す。
  // ホーム画面に追加したアプリ側のセッションはこの処理では一切触れていないため、
  // 更新が成功していればそちらは変わらず入室状態のまま使い続けられる
  await supabaseClient.auth.signOut();
  await supabaseClient.auth.signInAnonymously();
  showEntryForm();
  showMessage(
    messageBox,
    errorMessage || "メールアドレスを変更しました。ホーム画面に追加したアプリ側はそのまま入室した状態です",
    !!errorMessage
  );
}

// メール内のマジックリンクを開いて戻ってきた(=メールアドレスの所有権を確認できた)場合、
// クエリパラメータ(auth_intent)に応じて「部屋の新規作成」か「キーを忘れた場合」の
// どちらかを行う。結果表示後は、この端末を通常の(まだどの部屋にも参加していない)
// 入室待ち状態に戻すため、匿名サインインし直す
async function handleVerifiedEmailReturn() {
  const params = new URLSearchParams(location.search);
  const intent = params.get("auth_intent");
  const roomKeyParam = params.get("room_key");
  history.replaceState(null, "", location.pathname);

  if (intent === "change_email") {
    await handleEmailChangeReturn(roomKeyParam);
    return;
  }

  let roomKey = null;
  let errorMessage = null;

  if (intent === "create") {
    const { data, error } = await supabaseClient.rpc("create_household_pending").single();
    if (error) {
      const duplicateEmail = error.message.includes("duplicate") || error.message.includes("unique");
      errorMessage = duplicateEmail ? "このメールアドレスはすでに部屋の作成に使われています" : "部屋の作成に失敗しました: " + error.message;
    } else {
      roomKey = data.room_key;
    }
  } else {
    const { data, error } = await supabaseClient.rpc("find_room_key_for_verified_email");
    if (error || !data) errorMessage = "登録されているキーが見つかりませんでした";
    else roomKey = data;
  }

  await supabaseClient.auth.signOut();
  await supabaseClient.auth.signInAnonymously();

  showEntryForm();

  if (errorMessage) {
    showMessage(messageBox, errorMessage, true);
    return;
  }

  showKeyReveal(
    intent === "create" ? "部屋を作成しました" : "キーが見つかりました",
    "このキーを家族・知り合いに共有してください。キーを紛失すると入室し直せなくなるため、必ず控えておいてください。",
    roomKey
  );
}

async function init() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  // マジックリンクのクリックで戻ってきた場合、セッションは匿名ではなく
  // 実際のメールアドレスを持つ認証済みセッションに置き換わっている
  if (session && session.user && !session.user.is_anonymous) {
    await handleVerifiedEmailReturn();
    return;
  }

  if (!session) {
    const { error } = await supabaseClient.auth.signInAnonymously();
    if (error) {
      showMessage(messageBox, "接続エラー: " + error.message + "(Supabase側で匿名サインインが有効か確認してください)", true);
      showBlockedState();
      return;
    }
  }
  renderAuthState(await fetchCurrentMembership());
}
init();

// 「新規作成はこちら」: 入室画面から部屋作成画面に切り替える
document.getElementById("auth-goto-create-btn").addEventListener("click", () => {
  showMessage(messageBox, "", false);
  document.getElementById("auth-join-form").classList.add("hidden");
  document.getElementById("auth-create-form").classList.remove("hidden");
});

document.getElementById("auth-create-cancel-btn").addEventListener("click", () => {
  showMessage(messageBox, "", false);
  document.getElementById("auth-create-form").classList.add("hidden");
  document.getElementById("auth-join-form").classList.remove("hidden");
});

// 部屋の新規作成: メールアドレスにマジックリンクを送る(この時点では部屋はまだ作らない)
document.getElementById("create-send-link-btn").addEventListener("click", async () => {
  const email = document.getElementById("create-email").value.trim();
  if (!email) {
    showMessage(messageBox, "メールアドレスを入力してください", true);
    return;
  }

  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + "?auth_intent=create" }
  });
  if (error) {
    showMessage(messageBox, "確認メールの送信に失敗しました: " + error.message, true);
    return;
  }

  showMessage(messageBox, "", false);
  document.getElementById("auth-create-form").classList.add("hidden");
  document.getElementById("auth-mail-sent").classList.remove("hidden");
});

document.getElementById("auth-mail-sent-back-btn").addEventListener("click", () => {
  showMessage(messageBox, "", false);
  document.getElementById("auth-mail-sent").classList.add("hidden");
  document.getElementById("auth-join-form").classList.remove("hidden");
});

document.getElementById("auth-key-copy-btn").addEventListener("click", async () => {
  const key = document.getElementById("auth-key-text").textContent;
  try {
    await navigator.clipboard.writeText(key);
    showMessage(messageBox, "キーをコピーしました", false);
  } catch {
    showMessage(messageBox, "コピーできませんでした。手動で控えてください", true);
  }
});

// 「そのまま入室に進む」: キー表示画面から、ルームキー欄に自動入力した入室フォームに進む
document.getElementById("auth-key-continue-btn").addEventListener("click", () => {
  const key = document.getElementById("auth-key-text").textContent;
  document.getElementById("auth-key-reveal").classList.add("hidden");
  document.getElementById("join-room-key").value = key;
  document.getElementById("auth-join-form").classList.remove("hidden");
  fetchExistingNicknames(); // .valueの直接代入はinputイベントを発火しないため、ここで明示的に取得する
});

// ---------- ニックネーム候補(そのルームキーに既に入室しているメンバー) ----------
// ルームキーを入力すると、そのキーの部屋に既に入室しているメンバーのニックネームを
// 候補として表示する。タップして選ぶと「同じユーザーとして入室」できることを
// わかりやすくする(join_household_by_key側で、完全一致するニックネームは新規メンバー
// を追加せず既存メンバーの入室を引き継ぐ仕様になっているため、sql/025参照)。
// 誤って他人と同じ名前で入室してしまう事故を防ぐため、候補と完全一致する名前での
// 送信時は確認ダイアログを挟む

let existingNicknames = [];
let nicknameFetchTimer = null;
let nicknameSuggestionsHideTimer = null;

async function fetchExistingNicknames() {
  const roomKey = document.getElementById("join-room-key").value.trim();
  if (!roomKey) {
    existingNicknames = [];
    renderNicknameSuggestions();
    return;
  }
  const { data, error } = await supabaseClient.rpc("get_household_member_nicknames", { p_room_key: roomKey });
  existingNicknames = error ? [] : (data || []).map(row => row.nickname);
  renderNicknameSuggestions();
}

function renderNicknameSuggestions() {
  const listEl = document.getElementById("join-nickname-suggestions");
  const nicknameInput = document.getElementById("join-nickname");
  const shouldShow = document.activeElement === nicknameInput && existingNicknames.length > 0;

  if (!shouldShow) {
    listEl.classList.add("hidden");
    listEl.innerHTML = "";
    return;
  }

  listEl.innerHTML = `
    <div class="nickname-suggestion-header">入室中のユーザー</div>
    ${existingNicknames.map(name => `
      <div class="nickname-suggestion-row" data-nickname="${escapeHtml(name)}">
        <span class="nickname-suggestion-name">${escapeHtml(name)}</span>
        <span class="nickname-suggestion-hint">タップして同じユーザーとして入室</span>
      </div>
    `).join("")}
  `;
  listEl.classList.remove("hidden");
}

document.getElementById("join-room-key").addEventListener("input", () => {
  clearTimeout(nicknameFetchTimer);
  nicknameFetchTimer = setTimeout(fetchExistingNicknames, 350);
});
document.getElementById("join-room-key").addEventListener("blur", () => {
  clearTimeout(nicknameFetchTimer);
  fetchExistingNicknames();
});

document.getElementById("join-nickname").addEventListener("focus", renderNicknameSuggestions);

// mousedownの時点で候補選択を処理する(blurより先に発火させるため。blur後だと
// 候補欄が非表示になった後になり、クリックしたつもりの要素が既に消えてしまう)
document.getElementById("join-nickname").addEventListener("blur", () => {
  nicknameSuggestionsHideTimer = setTimeout(() => {
    document.getElementById("join-nickname-suggestions").classList.add("hidden");
  }, 150);
});

document.getElementById("join-nickname-suggestions").addEventListener("mousedown", (e) => {
  const row = e.target.closest(".nickname-suggestion-row");
  if (!row) return;
  clearTimeout(nicknameSuggestionsHideTimer);
  document.getElementById("join-nickname").value = row.dataset.nickname;
  document.getElementById("join-nickname-suggestions").classList.add("hidden");
});

document.getElementById("join-room-btn").addEventListener("click", async () => {
  const roomKey = document.getElementById("join-room-key").value.trim();
  const nickname = document.getElementById("join-nickname").value.trim();
  if (!roomKey || !nickname) {
    showMessage(messageBox, "ルームキーとニックネームを入力してください", true);
    return;
  }

  if (existingNicknames.includes(nickname)) {
    const confirmed = confirm(
      `「${nickname}」はこの部屋に既に入室しているユーザーです。同じユーザーとして入室しますか？\n` +
      `(別の端末でこのニックネームを使っていた場合、そちらでの入室情報は上書きされます)`
    );
    if (!confirmed) return;
  }

  const { error } = await supabaseClient.rpc("join_household_by_key", { p_room_key: roomKey, p_nickname: nickname });
  if (error) {
    showMessage(messageBox, "入室に失敗しました。キーが正しいか確認してください", true);
    return;
  }

  renderAuthState(await fetchCurrentMembership());
});

// 「キーを忘れた場合」: メールアドレスを入力すると、そのメールアドレス宛に
// Supabaseのマジックリンクを送る(所有権確認のため。キーの即時表示はしない)
document.getElementById("auth-forgot-key-btn").addEventListener("click", () => {
  showMessage(messageBox, "", false);
  document.getElementById("auth-join-form").classList.add("hidden");
  document.getElementById("auth-forgot-key-form").classList.remove("hidden");
});

document.getElementById("auth-forgot-key-cancel-btn").addEventListener("click", () => {
  showMessage(messageBox, "", false);
  document.getElementById("auth-forgot-key-form").classList.add("hidden");
  document.getElementById("auth-join-form").classList.remove("hidden");
});

document.getElementById("forgot-key-submit-btn").addEventListener("click", async () => {
  const email = document.getElementById("forgot-key-email").value.trim();
  if (!email) {
    showMessage(messageBox, "メールアドレスを入力してください", true);
    return;
  }

  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + "?auth_intent=forgot_key" }
  });
  if (error) {
    showMessage(messageBox, "確認メールの送信に失敗しました: " + error.message, true);
    return;
  }

  showMessage(messageBox, "", false);
  document.getElementById("auth-forgot-key-form").classList.add("hidden");
  document.getElementById("auth-mail-sent").classList.remove("hidden");
});

// 「退室」: household_membersの自分の行を削除してから、この端末のセッションを破棄する。
// 再度この部屋を使うにはルームキーの再入力が必要(household_membersを削除しないと
// 「参加中メンバー」に残り続けてしまうため、実際にメンバーから抜ける処理にしている。
// item_history.actor_nicknameは記録時点のニックネームをコピーした単なるテキスト列で
// household_membersを参照していないため、退室しても過去の履歴表示には影響しない)
document.getElementById("logout-btn").addEventListener("click", async () => {
  if (!confirm("この部屋から退室しますか？再度参加するにはルームキーの入力が必要です。")) return;

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (user) {
    await supabaseClient.from("household_members").delete().eq("user_id", user.id);
  }
  await supabaseClient.auth.signOut();
  location.reload();
});
