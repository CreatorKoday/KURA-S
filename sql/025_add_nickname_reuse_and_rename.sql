-- 3つの変更を行う。
--
-- 1. get_household_member_nicknames(p_room_key): 入室前(まだhousehold_membersに
--    行が無い状態)でも、ルームキーを知っていればそのキーの部屋の既存メンバーの
--    ニックネーム一覧を見られるようにするRPC(入室画面でのニックネーム候補表示に使う)。
--    入室後はどのみち全メンバー名を見られるため(household_membersのSELECTポリシー、
--    sql/017)、入室前に名前一覧だけ見える状態が増えても実質的な情報範囲は変わらない。
--
-- 2. join_household_by_key: 入室先の部屋に、入力したニックネームと完全一致する
--    既存メンバーがいる場合、新規メンバーとして追加せず、その既存メンバーの
--    user_idを今回のセッションのものに置き換える(=同じ人としての引き継ぎ入室)。
--    一致しなければ従来通り新規追加する。
--    【注意】これは「同じニックネームを入力した人」を無条件に同一人物とみなす仕組みのため、
--    別の人が誤って/偶然同じ名前で入室すると、既存メンバーの入室情報が上書きされ、
--    元の端末は次回操作時に再入室が必要になる。この誤操作を防ぐため、
--    アプリ側(js/auth.js)は候補一覧と完全一致するニックネームで送信する前に
--    確認ダイアログを挟む。
--
-- 3. household_membersに自分の行のみ更新可能なUPDATEポリシーを追加する
--    (アカウント画面からの自分のニックネーム変更用)。

begin;

create or replace function get_household_member_nicknames(p_room_key text)
returns table(nickname text)
language sql
stable
security definer
set search_path = public
as $$
  select hm.nickname
  from household_members hm
  join households h on h.id = hm.household_id
  where h.room_key = p_room_key
  order by hm.created_at asc;
$$;

revoke execute on function get_household_member_nicknames(text) from public;
grant execute on function get_household_member_nicknames(text) to authenticated;

create or replace function join_household_by_key(p_room_key text, p_nickname text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_existing_user_id uuid;
begin
  select id into v_household_id from households where room_key = p_room_key;

  if v_household_id is null then
    raise exception 'invalid room key';
  end if;

  select user_id into v_existing_user_id
    from household_members
    where household_id = v_household_id and nickname = p_nickname
    limit 1;

  if v_existing_user_id is not null then
    update household_members
      set user_id = auth.uid()
      where household_id = v_household_id and nickname = p_nickname;
  else
    insert into household_members (household_id, user_id, nickname)
    values (v_household_id, auth.uid(), p_nickname);
  end if;
end;
$$;

create policy "members can update own nickname" on household_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (household_id = current_household_id() and user_id = auth.uid());

commit;
