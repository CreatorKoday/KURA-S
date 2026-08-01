-- items / item_lots / shopping_list / item_history を部屋(household)単位で
-- 分離する。household_idはcurrent_household_id()をデフォルト値にすることで、
-- 既存のinsert処理(js/items.js・js/shopping.js等)を変更せずに自動設定させる。
--
-- 【注意】household_idをNOT NULLにするため、この移行では既存の行を
-- 一旦すべて削除する(2026-08-01時点でテスト用データのみで引き継ぎ不要と確認済み)。
-- 本番の在庫データが入っている場合は、絶対にこのまま実行しないこと
-- (既存データを部屋に割り当てる移行処理に作り直す必要がある)。

begin;

truncate table item_history, shopping_list, item_lots, items cascade;

alter table items add column household_id uuid not null default current_household_id() references households(id) on delete cascade;
alter table item_lots add column household_id uuid not null default current_household_id() references households(id) on delete cascade;
alter table shopping_list add column household_id uuid not null default current_household_id() references households(id) on delete cascade;
alter table item_history add column household_id uuid not null default current_household_id() references households(id) on delete cascade;

alter table items enable row level security;
alter table item_lots enable row level security;
alter table shopping_list enable row level security;
alter table item_history enable row level security;

create policy "members can select own household items" on items
  for select to authenticated using (household_id = current_household_id());
create policy "members can insert own household items" on items
  for insert to authenticated with check (household_id = current_household_id());
create policy "members can update own household items" on items
  for update to authenticated using (household_id = current_household_id());
create policy "members can delete own household items" on items
  for delete to authenticated using (household_id = current_household_id());

create policy "members can select own household item_lots" on item_lots
  for select to authenticated using (household_id = current_household_id());
create policy "members can insert own household item_lots" on item_lots
  for insert to authenticated with check (household_id = current_household_id());
create policy "members can update own household item_lots" on item_lots
  for update to authenticated using (household_id = current_household_id());
create policy "members can delete own household item_lots" on item_lots
  for delete to authenticated using (household_id = current_household_id());

create policy "members can select own household shopping_list" on shopping_list
  for select to authenticated using (household_id = current_household_id());
create policy "members can insert own household shopping_list" on shopping_list
  for insert to authenticated with check (household_id = current_household_id());
create policy "members can update own household shopping_list" on shopping_list
  for update to authenticated using (household_id = current_household_id());
create policy "members can delete own household shopping_list" on shopping_list
  for delete to authenticated using (household_id = current_household_id());

create policy "members can select own household item_history" on item_history
  for select to authenticated using (household_id = current_household_id());
create policy "members can insert own household item_history" on item_history
  for insert to authenticated with check (household_id = current_household_id());
create policy "members can update own household item_history" on item_history
  for update to authenticated using (household_id = current_household_id());
create policy "members can delete own household item_history" on item_history
  for delete to authenticated using (household_id = current_household_id());

commit;
