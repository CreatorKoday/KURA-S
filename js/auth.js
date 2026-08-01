// ==========================================================
// 部屋(household)の作成・キーでの入室・退室。
//
// ログインにメール/パスワードは使わず、Supabaseの匿名サインインを裏側で使う。
// 認証画面は既定で「キーで入室」(ルームキー+ニックネーム)を表示し、
// 新規作成は「新規作成はこちら」から別画面(メールアドレス+ニックネーム→確認コード入力)
// で行う。誤ったメールアドレスで部屋が作られてしまうのを防ぐため、確認コードの検証に
// 成功するまでは部屋(households/household_members)を一切作らない
// (signInWithOtpでコードを送るだけの段階では何も作成されず、verifyOtpでの検証成功後に
// 初めてcreate_householdを呼ぶ)。
// 部屋作成時のメールアドレスは、入室画面の「キーを忘れた場合」でもルームキーを
// 確認するために使う(こちらはSupabaseのマジックリンクで所有権を確認する)。
// メール確認(送信コードの検証・マジックリンクのクリック)が成功すると、その場のセッションが
// 匿名から実メールアドレスの認証済みセッションに置き換わるため、確認後は毎回
// 再度匿名サインインし直して通常の入室待ち状態に戻す。
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
  document.getElementById("auth-create-code-form").classList.add("hidden");
  document.getElementById("auth-forgot-key-form").classList.add("hidden");
  document.getElementById("auth-forgot-key-sent").classList.add("hidden");
  document.getElementById("auth-forgot-key-reveal").classList.add("hidden");
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
  document.getElementById("auth-create-code-form").classList.add("hidden");
  document.getElementById("auth-join-form").classList.add("hidden");
  document.getElementById("auth-forgot-key-form").classList.add("hidden");
  document.getElementById("auth-forgot-key-sent").classList.add("hidden");
  document.getElementById("auth-forgot-key-reveal").classList.add("hidden");
  document.getElementById("auth-key-reveal").classList.add("hidden");
}

// メール内のマジックリンクを開いて戻ってきた(=メールアドレスの所有権を確認できた)場合、
// そのメールアドレスに紐づくルームキーを検索して表示する。表示後は、この端末を
// 通常の(まだどの部屋にも参加していない)入室待ち状態に戻すため、匿名サインインし直す
async function handleVerifiedEmailReturn() {
  const { data: roomKey, error } = await supabaseClient.rpc("find_room_key_for_verified_email");

  await supabaseClient.auth.signOut();
  await supabaseClient.auth.signInAnonymously();

  showEntryForm();

  if (error || !roomKey) {
    showMessage(messageBox, "登録されているキーが見つかりませんでした", true);
    return;
  }

  document.getElementById("auth-join-form").classList.add("hidden");
  document.getElementById("auth-forgot-key-text").textContent = roomKey;
  document.getElementById("auth-forgot-key-reveal").classList.remove("hidden");
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

// 「新規作成はこちら」: 入室画面から部屋作成画面(①メール入力)に切り替える
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

document.getElementById("auth-create-code-cancel-btn").addEventListener("click", () => {
  showMessage(messageBox, "", false);
  document.getElementById("auth-create-code-form").classList.add("hidden");
  document.getElementById("auth-join-form").classList.remove("hidden");
});

// 部屋作成①: メールアドレスに確認コードを送る(この時点では部屋はまだ作らない)
document.getElementById("create-send-code-btn").addEventListener("click", async () => {
  const email = document.getElementById("create-email").value.trim();
  const nickname = document.getElementById("create-nickname").value.trim();
  if (!email || !nickname) {
    showMessage(messageBox, "メールアドレスとニックネームを入力してください", true);
    return;
  }

  const { error } = await supabaseClient.auth.signInWithOtp({ email });
  if (error) {
    showMessage(messageBox, "確認コードの送信に失敗しました: " + error.message, true);
    return;
  }

  showMessage(messageBox, "", false);
  document.getElementById("auth-create-form").classList.add("hidden");
  document.getElementById("create-code").value = "";
  document.getElementById("auth-create-code-form").classList.remove("hidden");
});

// 部屋作成②: 確認コードを検証し、成功した場合だけcreate_householdで部屋を作る
document.getElementById("create-verify-code-btn").addEventListener("click", async () => {
  const email = document.getElementById("create-email").value.trim();
  const nickname = document.getElementById("create-nickname").value.trim();
  const code = document.getElementById("create-code").value.trim();
  if (!code) {
    showMessage(messageBox, "確認コードを入力してください", true);
    return;
  }

  const { error: verifyError } = await supabaseClient.auth.verifyOtp({ email, token: code, type: "email" });
  if (verifyError) {
    showMessage(messageBox, "確認コードが正しくないか、有効期限が切れています", true);
    return;
  }

  // 確認済みの実メールアドレスセッションから、他の入室経路と同じ匿名セッションに戻してから部屋を作る
  await supabaseClient.auth.signOut();
  await supabaseClient.auth.signInAnonymously();

  const { data, error } = await supabaseClient
    .rpc("create_household", { p_email: email, p_nickname: nickname })
    .single();
  if (error) {
    const duplicateEmail = error.message.includes("duplicate") || error.message.includes("unique");
    showMessage(messageBox, duplicateEmail
      ? "このメールアドレスはすでに部屋の作成に使われています"
      : "部屋の作成に失敗しました: " + error.message, true);
    return;
  }

  showMessage(messageBox, "", false);
  document.getElementById("auth-create-code-form").classList.add("hidden");
  document.getElementById("auth-key-text").textContent = data.room_key;
  document.getElementById("auth-key-reveal").classList.remove("hidden");
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

document.getElementById("auth-key-continue-btn").addEventListener("click", async () => {
  renderAuthState(await fetchCurrentMembership());
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

document.getElementById("auth-forgot-key-sent-back-btn").addEventListener("click", () => {
  showMessage(messageBox, "", false);
  document.getElementById("auth-forgot-key-sent").classList.add("hidden");
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
    options: { emailRedirectTo: window.location.origin }
  });
  if (error) {
    showMessage(messageBox, "確認メールの送信に失敗しました: " + error.message, true);
    return;
  }

  showMessage(messageBox, "", false);
  document.getElementById("auth-forgot-key-form").classList.add("hidden");
  document.getElementById("auth-forgot-key-sent").classList.remove("hidden");
});

document.getElementById("auth-forgot-key-copy-btn").addEventListener("click", async () => {
  const key = document.getElementById("auth-forgot-key-text").textContent;
  try {
    await navigator.clipboard.writeText(key);
    showMessage(messageBox, "キーをコピーしました", false);
  } catch {
    showMessage(messageBox, "コピーできませんでした。手動で控えてください", true);
  }
});

document.getElementById("auth-forgot-key-back-btn").addEventListener("click", () => {
  const key = document.getElementById("auth-forgot-key-text").textContent;
  document.getElementById("auth-forgot-key-reveal").classList.add("hidden");
  document.getElementById("join-room-key").value = key;
  document.getElementById("auth-join-form").classList.remove("hidden");
});

// 「退室」: この端末のセッションを破棄する。再度この部屋を使うにはルームキーの再入力が必要
document.getElementById("logout-btn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  location.reload();
});
