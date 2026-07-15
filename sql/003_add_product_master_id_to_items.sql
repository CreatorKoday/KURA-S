-- items(在庫)から product_master(商品属性)への参照列を追加する
-- NULL許容のため、既存の在庫行への影響はない

begin;

alter table items add column product_master_id uuid references product_master(id);

commit;
