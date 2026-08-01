-- 部屋の「部屋名」概念を廃止し、代わりに部屋作成時にメールアドレスを必須で登録する。
-- 入室画面の「キーを忘れた場合」から、登録したメールアドレスを入力すると
-- そのメールアドレスに紐づくルームキーをその場で画面表示できるようにするため
-- (メール送信は行わない。2026-08-01時点でこの仕様のまま進めることをユーザーに確認済み。
-- メール所有者の確認は行わないため、メールアドレスを知っている/推測できる人は
-- 誰でもそのキーを見られる点に注意)。
--
-- 【注意】households.room_nameを削除しemailをNOT NULLで追加するため、この移行では
-- households(と外部キーでcascadeするhousehold_members・items等)を一旦すべて削除する。
-- 2026-08-01時点、部屋の作成自体が失敗するバグにより実際に成立した部屋が存在しないことを
-- 確認済みのため安全(本番で実際に使われている部屋がある場合は絶対にこのまま実行しないこと)。

begin;

truncate table households cascade;

alter table households drop column room_name;
alter table households add column email text not null unique;

-- 部屋の作成: パラメータを部屋名からメールアドレスに変更。
-- PostgreSQLはCREATE OR REPLACEでの引数名の変更を許可しない
-- (42P13エラー)ため、一度DROPしてから作り直す(DROPすると付与済みの
-- 権限も失われるため、下でrevoke/grantをやり直す)
drop function if exists create_household(text, text);

create function create_household(p_email text, p_nickname text)
returns table(household_id uuid, room_key text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_room_key text;
begin
  v_room_key := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));

  insert into households (email, room_key)
  values (p_email, v_room_key)
  returning id into v_household_id;

  insert into household_members (household_id, user_id, nickname)
  values (v_household_id, auth.uid(), p_nickname);

  return query select v_household_id, v_room_key;
end;
$$;

revoke execute on function create_household(text, text) from public;
grant execute on function create_household(text, text) to authenticated;

-- 「キーを忘れた場合」: メールアドレスに紐づくルームキーを返す(所有権の確認はしない)
create or replace function find_room_key_by_email(p_email text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select room_key from households where email = p_email;
$$;

revoke execute on function find_room_key_by_email(text) from public;
grant execute on function find_room_key_by_email(text) to authenticated;

commit;
