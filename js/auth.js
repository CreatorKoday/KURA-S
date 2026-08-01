// ==========================================================
// 部屋(household)の作成・キーでの入室・退室。
//
// メール/パスワードは使わず、Supabaseの匿名サインインを裏側で使う。
// 「部屋を作る」/「キーで入室」を選んでニックネームを入力するだけで
// 利用を開始でき、同じルームキーで入った人同士が同じ在庫を共有する。
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

async function init() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    const { error } = await supabaseClient.auth.signInAnonymously();
    if (error) {
      showMessage(messageBox, "接続エラー: " + error.message, true);
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
  });
});

document.getElementById("create-room-btn").addEventListener("click", async () => {
  const roomName = document.getElementById("create-room-name").value.trim();
  const nickname = document.getElementById("create-nickname").value.trim();
  if (!roomName || !nickname) {
    showMessage(messageBox, "部屋名とニックネームを入力してください", true);
    return;
  }

  const { data, error } = await supabaseClient
    .rpc("create_household", { p_room_name: roomName, p_nickname: nickname })
    .single();
  if (error) {
    showMessage(messageBox, "部屋の作成に失敗しました: " + error.message, true);
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

// 「退室」: この端末のセッションを破棄する。再度この部屋を使うにはルームキーの再入力が必要
document.getElementById("logout-btn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  location.reload();
});
