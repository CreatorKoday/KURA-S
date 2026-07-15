-- 商品マスタ 詳細/編集シートでの保存(UPDATE)ができるよう、
-- 004で不足していたUPDATEポリシーを追加する

begin;

create policy "authenticated can update product_master" on product_master
  for update to authenticated using (true) with check (true);

create policy "authenticated can update product_name_alias" on product_name_alias
  for update to authenticated using (true) with check (true);

commit;
