// ==========================================================
// 認証まわり(新規登録・ログイン・ログアウト)
// ==========================================================

import { supabaseClient } from "./config.js";
import { authCard, loggedInArea, messageBox, userEmailLabel } from "./elements.js";
import { showMessage } from "./utils.js";
import { switchView } from "./navigation.js";
import { loadShoppingList } from "./shopping.js";

export function renderAuthState(session) {
  if (session && session.user) {
    authCard.classList.add("hidden");
    loggedInArea.classList.remove("hidden");
    userEmailLabel.textContent = session.user.email;
    switchView("home");
    loadShoppingList();
  } else {
    authCard.classList.remove("hidden");
    loggedInArea.classList.add("hidden");
  }
}

document.getElementById("signup-btn").addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  if (!email || !password) {
    showMessage(messageBox, "メールアドレスとパスワードを入力してください", true);
    return;
  }
  const { error } = await supabaseClient.auth.signUp({ email, password });
  if (error) {
    showMessage(messageBox, "登録エラー: " + error.message, true);
  } else {
    showMessage(messageBox, "登録できました!そのままログインをお試しください。", false);
  }
});

document.getElementById("login-btn").addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  if (!email || !password) {
    showMessage(messageBox, "メールアドレスとパスワードを入力してください", true);
    return;
  }
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    showMessage(messageBox, "ログインエラー: " + error.message, true);
  } else {
    showMessage(messageBox, "", false);
    renderAuthState(data.session);
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  renderAuthState(null);
});

supabaseClient.auth.getSession().then(({ data }) => {
  renderAuthState(data.session);
});
