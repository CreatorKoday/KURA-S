-- アカウント画面から、部屋に参加中のメンバーを削除できるようにする。
-- household_membersは元々SELECTのみ許可していたが(sql/017)、メンバー管理(削除)の
-- ためDELETEポリシーを追加する。オーナー/管理者の区別は無いため、同じ部屋の
-- メンバーなら誰でも他のメンバーを削除できる(既存のSELECTポリシーと同じ考え方)。

begin;

create policy "members can delete own household members" on household_members
  for delete to authenticated using (household_id = current_household_id());

commit;
