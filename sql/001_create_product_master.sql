-- 商品マスタ(商品属性)の実体テーブルを作成する
-- type(食品/日用品)は変化しにくいためenumを採用し、
-- categoryはtypeごとの固定リストをCHECK制約で強制する

begin;

create extension if not exists pgcrypto;

create type product_type as enum ('食品', '日用品');

create table product_master (
  id                         uuid primary key default gen_random_uuid(),
  canonical_name             text not null,
  canonical_normalized_name  text not null unique,
  type                       product_type not null,
  category                   text not null,
  sub_category               text,
  storage                    text,
  usage                      text,
  search_keywords            text[] not null default '{}',
  source                     text not null default 'ai',
  ai_model                   text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint category_valid check (
    (type = '食品' and category = any (array[
      '野菜','果物','肉','魚','乳製品','飲料','調味料','お菓子','パン','米','麺類',
      '冷凍食品','レトルト','缶詰','インスタント','その他'
    ]))
    or
    (type = '日用品' and category = any (array[
      '洗濯用品','掃除用品','キッチン用品','トイレ用品','お風呂用品','ティッシュ・紙製品',
      '衛生用品','スキンケア','ヘアケア','オーラルケア','ベビー用品','ペット用品',
      '消臭・芳香剤','電池・電球','その他'
    ]))
  )
);

create index idx_product_master_type_category on product_master (type, category);

commit;
