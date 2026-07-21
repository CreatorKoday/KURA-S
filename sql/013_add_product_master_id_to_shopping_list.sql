-- 標準商品名(product_master)単位の在庫少なめ自動追加を、shopping_list側で
-- 重複判定できるようにする列を追加する(item_idは商品名単位の追加/手動追加のまま残す)。

begin;

alter table shopping_list
  add column product_master_id uuid references product_master(id);

commit;
