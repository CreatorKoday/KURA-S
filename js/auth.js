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
import { showMessage } from "./utils.js";
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

// メール内のマジックリンクを開いて戻ってきた(=メールアドレスの所有権を確認できた)場合、
// クエリパラメータ(auth_intent)に応じて「部屋の新規作成」か「キーを忘れた場合」の
// どちらかを行う。結果表示後は、この端末を通常の(まだどの部屋にも参加していない)
// 入室待ち状態に戻すため、匿名サインインし直す
async function handleVerifiedEmailReturn() {
  const intent = new URLSearchParams(location.search).get("auth_intent");
  history.replaceState(null, "", location.pathname);

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
});

document.getElementById("join-room-btn").addEventListener("click", async () => {
  const roomKey = document.getElementById("join-room-key").value.trim();
  const nickname = document.getElementById("join-nickname").value.trim();
  if (!roomKey || !nickname) {
    showMessage(messageBox, "ルームキーとニックネームを入力してください", true);
    return;
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

// 「退室」: この端末のセッションを破棄する。再度この部屋を使うにはルームキーの再入力が必要
document.getElementById("logout-btn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  location.reload();
});
