-- 「キーを忘れた場合」を、クライアントから渡された任意の文字列のメールアドレスで
-- 検索する方式(find_room_key_by_email、sql/020)から、Supabaseのマジックリンク
-- (signInWithOtp)でメールアドレスの所有権を確認した上でキーを表示する方式に変更する。
--
-- auth.email()は現在のセッションのJWTに含まれる「検証済みの」メールアドレスを返す
-- (マジックリンクのメール内のリンクを実際にクリックした場合のみ設定される)ため、
-- 以前のようにクライアントが任意の文字列を渡して他人のキーを盗み見る問題が無くなる。
-- 2026-08-02、ユーザーと相談の上この方式を採用。

begin;

drop function if exists find_room_key_by_email(text);

create function find_room_key_for_verified_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select room_key from households where email = auth.email();
$$;

revoke execute on function find_room_key_for_verified_email() from public;
grant execute on function find_room_key_for_verified_email() to authenticated;

commit;
