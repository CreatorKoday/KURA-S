-- アカウント画面から、部屋作成時に登録したメールアドレス(households.email、
-- 「キーを忘れた場合」で使う連絡先)を変更できるようにする。
-- なりすまし防止のため、新しいメールアドレスの所有権はSupabaseのマジックリンクで
-- 確認済み(auth.email())であることを前提とする。マジックリンク確認後のセッションは
-- 元々部屋に入室していたセッションとは別物(auth.uid()が変わる)になるため、
-- current_household_id()では対象の部屋を特定できない。そこでjoin_household_by_keyと
-- 同じくルームキーを鍵にして対象の部屋を特定する(ルームキーを知っている=その部屋を
-- 操作できる、という既存の信頼モデルに合わせている)。

begin;

create or replace function update_household_email(p_room_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_household_id uuid;
begin
  v_email := auth.email();
  if v_email is null then
    raise exception 'email not verified';
  end if;

  select id into v_household_id from households where room_key = p_room_key;
  if v_household_id is null then
    raise exception 'invalid room key';
  end if;

  update households set email = v_email where id = v_household_id;
end;
$$;

revoke execute on function update_household_email(text) from public;
grant execute on function update_household_email(text) to authenticated;

commit;
