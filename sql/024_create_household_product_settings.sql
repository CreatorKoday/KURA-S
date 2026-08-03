-- product_masterのうち、AI生成/商品識別に関係ない「アイコン」「最低数量」を
-- 部屋(household)単位に切り出す。これまではproduct_masterが部屋をまたいで
-- 共有されていたため、ある部屋でアイコン/最低数量を変更すると、同じ標準商品名を
-- 使う他の部屋にも意図せず影響していた。
--
-- 標準商品名・カテゴリー・サブカテゴリー・保管場所・用途・検索キーワードなど
-- (AIが生成する商品識別データ)は、AI呼び出し削減の効果を維持するため
-- 引き続きproduct_masterで部屋をまたいで共有する(変更なし)。これらの手動編集は
-- 別途廃止し、AIへの再生成のみで修正する方針にする(js/productDetail.js参照)。
--
-- 【注意】product_master.icon/low_stock_threshold列を削除するため、既存の値は
-- 失われる(2026-08時点でテスト用データのみと確認済み)。

begin;

create table household_product_settings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default current_household_id() references households(id) on delete cascade,
  product_master_id uuid not null references product_master(id) on delete cascade,
  icon text,
  low_stock_threshold numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (household_id, product_master_id)
);

alter table household_product_settings enable row level security;

create policy "members can select own household product settings" on household_product_settings
  for select to authenticated using (household_id = current_household_id());
create policy "members can insert own household product settings" on household_product_settings
  for insert to authenticated with check (household_id = current_household_id());
create policy "members can update own household product settings" on household_product_settings
  for update to authenticated using (household_id = current_household_id());
create policy "members can delete own household product settings" on household_product_settings
  for delete to authenticated using (household_id = current_household_id());

alter table product_master drop column icon;
alter table product_master drop column low_stock_threshold;

commit;
