-- ルームキーの再発行機能。キーが漏洩した場合や、退室させたメンバーが
-- 古いキーを覚えたまま再入室してしまうのを防ぐため、アカウント画面から
-- いつでも新しいランダムなキーに更新できるようにする。
-- 既存のhousehold_members(参加中メンバー)には影響しない(household_idは
-- 変わらないため、キーを知らない人だけが以後入室できなくなる)。

begin;

create or replace function regenerate_room_key()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_new_key text;
begin
  v_household_id := current_household_id();
  if v_household_id is null then
    raise exception 'not a member of any household';
  end if;

  v_new_key := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));

  update households set room_key = v_new_key where id = v_household_id;

  return v_new_key;
end;
$$;

revoke execute on function regenerate_room_key() from public;
grant execute on function regenerate_room_key() to authenticated;

commit;
