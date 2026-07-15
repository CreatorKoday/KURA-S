-- product_master / product_name_alias のRLSを有効化し、
-- ログイン済みユーザー(authenticated)による閲覧・新規作成を許可する

begin;

alter table product_master enable row level security;
alter table product_name_alias enable row level security;

create policy "authenticated can read product_master" on product_master
  for select to authenticated using (true);
create policy "authenticated can insert product_master" on product_master
  for insert to authenticated with check (true);

create policy "authenticated can read product_name_alias" on product_name_alias
  for select to authenticated using (true);
create policy "authenticated can insert product_name_alias" on product_name_alias
  for insert to authenticated with check (true);

commit;
