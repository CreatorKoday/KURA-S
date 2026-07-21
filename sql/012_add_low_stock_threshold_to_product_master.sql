-- 最低数量(在庫設定)を「標準商品名(product_master)」単位に変更するための列を追加する。
-- 同じ標準商品名を共有する複数の商品名(items)の在庫合計を、この値と比較して
-- 買い物リストへの自動追加/削除を判定する(商品マスタが無い商品は、従来どおり
-- items.low_stock_threshold のまま個別に判定する)。

begin;

alter table product_master
  add column low_stock_threshold numeric not null default 0;

commit;
