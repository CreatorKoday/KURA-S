-- 商品マスタ 詳細/編集シート用の列を追加する
-- icon: ユーザーが上書きしたアイコン(未設定の間はカテゴリーからUI側で自動決定)
-- edited_fields: どの項目がユーザーによって手動編集されたかを項目単位で記録する

begin;

alter table product_master add column icon text;
alter table product_master add column edited_fields text[] not null default '{}';

commit;
