-- 在庫ロット(商品ごとに賞味期限違いの在庫を分けて管理する)を新設する。
-- items.quantity / items.expiry_date は段階的移行の第1段階として、
-- まだ削除せずそのまま残す(移行データのコピー元・当面の参考値として温存)。
--
-- item_lots は items と同じ信頼境界(現状RLSなしで運用)に合わせ、
-- 今回はRLSを設定しない。将来 items 側にRLSを追加する際に合わせて検討する。

begin;

create table item_lots (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references items(id) on delete cascade,
  quantity       numeric not null default 0,
  expiry_date    date,
  purchase_date  date not null default current_date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_item_lots_item_id on item_lots (item_id);
create index idx_item_lots_expiry on item_lots (item_id, expiry_date);
create index idx_item_lots_purchase on item_lots (item_id, purchase_date);

-- 既存の items データを、1商品につき1ロットとして移行する(数量0の商品は対象外)
insert into item_lots (item_id, quantity, expiry_date, purchase_date)
select id, quantity, expiry_date, current_date
from items
where quantity is not null and quantity > 0;

commit;
