// ==========================================================
// アカウント画面: 自分の部屋のルームキー確認・コピー、参加中メンバーの
// 一覧確認・削除・自分のニックネームの変更(PayPayのアカウント画面を
// 参考にしたレイアウト)。household_membersのDELETEは同じ部屋のメンバー
// なら誰でも行える(オーナー/管理者の区別は無い、sql/023参照)。自分自身の
// 行には削除ボタンを出さない(自分が抜ける場合はヘッダーの「退室」を使う)。
// 自分の行のみ✏️編集ボタンからニックネームを変更できる(sql/025でUPDATEポリシーを
// 追加済み。他のメンバーと同じ名前への変更は、入室時の同名マージとは異なり
// 意図しない乗っ取りを避けるためクライアント側でチェックし拒否する)
// ==========================================================

import { supabaseClient } from "./config.js";
import { showMessage, showAppNotice, escapeHtml } from "./utils.js";
import { userNicknameLabel } from "./elements.js";

const messageBox = document.getElementById("account-message");

let members = [];
let myUserId = null;
let editingMemberId = null;

export async function loadAccountInfo() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;
  myUserId = user.id;
  editingMemberId = null;

  const { data: household, error: householdError } = await supabaseClient
    .from("households")
    .select("room_key")
    .maybeSingle();
  if (householdError) console.error("ルームキーの取得に失敗:", householdError);
  document.getElementById("account-room-key").textContent = household ? household.room_key : "";

  const { data, error: membersError } = await supabaseClient
    .from("household_members")
    .select("id, nickname, user_id")
    .order("created_at", { ascending: true });
  if (membersError) { console.error("メンバー一覧の取得に失敗:", membersError); return; }

  members = data || [];
  renderMemberList();
}

function renderMemberList() {
  const list = document.getElementById("account-member-list");
  list.innerHTML = members.map(member => {
    const isSelf = member.user_id === myUserId;

    if (isSelf && editingMemberId === member.id) {
      return `
        <div class="account-member-row account-member-row-editing">
          <input type="text" id="account-nickname-edit-input" class="account-nickname-input" value="${escapeHtml(member.nickname)}" maxlength="20">
          <button type="button" class="account-edit-save-btn" data-id="${member.id}" aria-label="保存"><span class="material-symbols-rounded">check</span></button>
          <button type="button" class="account-edit-cancel-btn" aria-label="キャンセル"><span class="material-symbols-rounded">close</span></button>
        </div>
      `;
    }

    return `
      <div class="account-member-row">
        <span class="account-member-name">
          ${escapeHtml(member.nickname)}${isSelf ? '<span class="account-member-you">(自分)</span>' : ""}
        </span>
        ${isSelf
          ? `<button type="button" class="account-edit-btn" data-id="${member.id}" aria-label="ニックネームを変更"><span class="material-symbols-rounded">edit</span></button>`
          : `<button type="button" class="del-btn" data-id="${member.id}"><span class="material-symbols-rounded">delete</span> 削除</button>`}
      </div>
    `;
  }).join("");

  if (editingMemberId) {
    const input = document.getElementById("account-nickname-edit-input");
    if (input) { input.focus(); input.select(); }
  }
}

async function saveNickname(memberId) {
  const input = document.getElementById("account-nickname-edit-input");
  const newNickname = input.value.trim();
  if (!newNickname) {
    showMessage(messageBox, "ニックネームを入力してください", true);
    return;
  }

  // 入室時の同名マージ(join_household_by_key、sql/025)とは異なり、こちらは
  // 明示的な自分の名前変更のため、既存の他メンバーと同じ名前への変更は拒否する
  // (意図せず他人のメンバー行を乗っ取ってしまう事故を防ぐ)
  const duplicate = members.some(m => m.id !== memberId && m.nickname === newNickname);
  if (duplicate) {
    showMessage(messageBox, "その名前は既に使われています。別の名前を入力してください", true);
    return;
  }

  const { error } = await supabaseClient.from("household_members").update({ nickname: newNickname }).eq("id", memberId);
  if (error) {
    showMessage(messageBox, "変更に失敗しました", true);
    return;
  }

  showMessage(messageBox, "", false);
  editingMemberId = null;
  userNicknameLabel.textContent = newNickname;
  showAppNotice("ニックネームを変更しました");
  loadAccountInfo();
}

document.getElementById("account-key-copy-btn").addEventListener("click", async () => {
  const key = document.getElementById("account-room-key").textContent;
  try {
    await navigator.clipboard.writeText(key);
    showAppNotice("キーをコピーしました");
  } catch {
    showMessage(messageBox, "コピーできませんでした。手動で控えてください", true);
  }
});

// ルームキーの再発行: 参加中のメンバーには影響しない(household_idは変わらない)が、
// 今のキーを知っている人でも再発行後は入室できなくなる(キー漏洩時・メンバー削除後の
// 再入室防止のため)
document.getElementById("account-regenerate-key-btn").addEventListener("click", async () => {
  if (!confirm("ルームキーを再発行しますか？再発行すると、今のキーでは入室できなくなります。")) return;

  const { data: newKey, error } = await supabaseClient.rpc("regenerate_room_key");
  if (error) {
    showMessage(messageBox, "キーの再発行に失敗しました", true);
    return;
  }

  document.getElementById("account-room-key").textContent = newKey;
  showAppNotice("ルームキーを再発行しました");
});

document.getElementById("account-member-list").addEventListener("click", async (e) => {
  const delBtn = e.target.closest(".del-btn");
  if (delBtn) {
    if (!confirm("このメンバーを部屋から削除しますか？")) return;
    const { error } = await supabaseClient.from("household_members").delete().eq("id", delBtn.dataset.id);
    if (error) {
      showMessage(messageBox, "削除に失敗しました", true);
      return;
    }
    showAppNotice("メンバーを削除しました");
    loadAccountInfo();
    return;
  }

  const editBtn = e.target.closest(".account-edit-btn");
  if (editBtn) {
    editingMemberId = editBtn.dataset.id;
    renderMemberList();
    return;
  }

  const cancelBtn = e.target.closest(".account-edit-cancel-btn");
  if (cancelBtn) {
    editingMemberId = null;
    renderMemberList();
    return;
  }

  const saveBtn = e.target.closest(".account-edit-save-btn");
  if (saveBtn) saveNickname(saveBtn.dataset.id);
});
