-- 「部屋(household)」機能の土台となるテーブルと補助関数を作成する。
-- メール/パスワード認証を廃止し、匿名認証(Supabaseの匿名サインイン)+
-- ルームキーでの入室に置き換えるための最初のステップ。
--
-- households:       部屋そのもの(部屋名・ルームキー)
-- household_members: 部屋に参加しているユーザー(匿名認証のuser_id)とニックネーム
--                     (1ユーザーにつき1部屋のみ。user_idにunique制約を付ける)
--
-- 部屋の作成・キーでの入室は、このファイルで作るRPC関数
-- (create_household / join_household_by_key)経由でのみ行う。
-- households/household_membersへの直接のinsert/update/deleteは許可しない
-- (RLSでSELECTのみ許可し、他の操作のポリシーを作らないことで拒否する)

begin;

create table households (
  id uuid primary key default gen_random_uuid(),
  room_name text not null,
  room_key text not null unique,
  created_at timestamptz not null default now()
);

create table household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  nickname text not null,
  created_at timestamptz not null default now()
);

alter table households enable row level security;
alter table household_members enable row level security;

-- ログイン中のユーザーが属する部屋のidを返す。household_members側のRLSポリシーが
-- この関数を参照するため、関数自体はSECURITY DEFINERにしてRLSを回避して検索する
-- (でなければ「ポリシーを評価するためにポリシーが必要」という循環になってしまう)
create or replace function current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from household_members where user_id = auth.uid() limit 1;
$$;

-- ログイン中のユーザーのニックネームを返す(item_historyのactor_nickname列の
-- デフォルト値として使う。current_household_id()と同じ理由でSECURITY DEFINER)
create or replace function current_nickname()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nickname from household_members where user_id = auth.uid() limit 1;
$$;

create policy "members can read own household" on households
  for select to authenticated using (id = current_household_id());

create policy "members can read own household members" on household_members
  for select to authenticated using (household_id = current_household_id());

-- 部屋の作成: ランダムなルームキーを発行し、households・household_membersへ
-- あわせて登録する(SECURITY DEFINERでRLSを回避して書き込む唯一の経路)
create or replace function create_household(p_room_name text, p_nickname text)
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

  insert into households (room_name, room_key)
  values (p_room_name, v_room_key)
  returning id into v_household_id;

  insert into household_members (household_id, user_id, nickname)
  values (v_household_id, auth.uid(), p_nickname);

  return query select v_household_id, v_room_key;
end;
$$;

-- キーでの入室: room_keyが一致する部屋にhousehold_membersの行を追加する
create or replace function join_household_by_key(p_room_key text, p_nickname text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  select id into v_household_id from households where room_key = p_room_key;

  if v_household_id is null then
    raise exception 'invalid room key';
  end if;

  insert into household_members (household_id, user_id, nickname)
  values (v_household_id, auth.uid(), p_nickname);
end;
$$;

revoke execute on function create_household(text, text) from public;
grant execute on function create_household(text, text) to authenticated;

revoke execute on function join_household_by_key(text, text) from public;
grant execute on function join_household_by_key(text, text) to authenticated;

commit;
