-- 商品名(ブランド名込みの表記)ごとのエイリアス
-- normalized_name をキーにした高速キャッシュとして、AI呼び出しの要否を判定するために使う

begin;

create table product_name_alias (
  id                 uuid primary key default gen_random_uuid(),
  normalized_name    text not null unique,
  raw_name           text not null,
  product_master_id  uuid not null references product_master(id) on delete cascade,
  created_at         timestamptz not null default now()
);

create index idx_product_name_alias_master on product_name_alias (product_master_id);

commit;
