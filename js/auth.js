// ==========================================================
// 部屋(household)の作成・キーでの入室・退室。
//
// ログインにメール/パスワードは使わず、Supabaseの匿名サインインを裏側で使う。
// 「部屋を作る」(メールアドレス+ニックネーム)/「キーで入室」(ルームキー+ニックネーム)
// を選ぶだけで利用を開始でき、同じルームキーで入った人同士が同じ在庫を共有する。
// 部屋作成時のメールアドレスは、入室画面の「キーを忘れた場合」でルームキーを
// 確認するためだけに使う。所有権の確認にはSupabaseのマジックリンク(signInWithOtp)を使い、
// 実際にそのメールのリンクを開いた場合だけキーを画面表示する(なりすまし防止)。
// リンクを開くとその場のセッションが匿名から実メールアドレスの認証済みセッションに
// 置き換わるため、キー表示後は再度匿名サインインし直して通常の入室待ち状態に戻す。
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
  document.getElementById("auth-create-form").classList.remove("hidden");
  document.getElementById("auth-join-form").classList.add("hidden");
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
  document.querySelector(".auth-mode-tabs").classList.add("hidden");
  document.getElementById("auth-create-form").classList.add("hidden");
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
  document.querySelectorAll(".auth-mode-tab").forEach(t => t.classList.toggle("active", t.dataset.mode === "join"));
  document.getElementById("auth-create-form").classList.add("hidden");
  document.getElementById("auth-join-form").classList.remove("hidden");

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

// 「部屋を作る」/「キーで入室」のタブ切り替え
document.querySelectorAll(".auth-mode-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-mode-tab").forEach(t => t.classList.toggle("active", t === tab));
    document.getElementById("auth-create-form").classList.toggle("hidden", tab.dataset.mode !== "create");
    document.getElementById("auth-join-form").classList.toggle("hidden", tab.dataset.mode !== "join");
    document.getElementById("auth-forgot-key-form").classList.add("hidden");
    document.getElementById("auth-forgot-key-sent").classList.add("hidden");
    document.getElementById("auth-forgot-key-reveal").classList.add("hidden");
  });
});

document.getElementById("create-room-btn").addEventListener("click", async () => {
  const email = document.getElementById("create-email").value.trim();
  const nickname = document.getElementById("create-nickname").value.trim();
  if (!email || !nickname) {
    showMessage(messageBox, "メールアドレスとニックネームを入力してください", true);
    return;
  }

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
  document.getElementById("auth-create-form").classList.add("hidden");
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
