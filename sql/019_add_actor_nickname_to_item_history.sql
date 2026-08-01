-- 購入・消費履歴(item_history)に「誰が操作したか」のニックネームを記録する列を
-- 追加する。current_nickname()をデフォルト値にすることで、既存の記録処理
-- (js/items.jsのlogItemHistory)を変更せずに自動設定させる。他のスナップショット列
-- (item_name・canonical_name等)と同じく、記録時点のニックネームをそのまま保存する
-- (後でニックネームを変更しても過去の履歴の表示は変わらない)。
--
-- 画面(購入・消費履歴ページ)への表示は今回のスコープに含めない(2026-08-01時点、
-- まずはデータの記録のみ行う方針)。

begin;

alter table item_history add column actor_nickname text default current_nickname();

commit;
