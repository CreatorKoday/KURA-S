-- 部屋の新規作成を、確認コード(verifyOtp)方式からマジックリンク方式に変更する。
-- 理由: Supabaseは2026-06-03以降、無料プランのデフォルトメール機能では
-- Authメールテンプレートのカスタマイズができなくなり(独自SMTP設定時を除く)、
-- 確認コード(トークン文字列)をメール本文に表示すること自体が困難になったため。
-- マジックリンクはテンプレート未編集でも標準で機能する(ボタン/リンクは
-- {{ .ConfirmationURL }} でありテンプレート編集不要のため)。
--
-- create_household(text, text)は「部屋作成の申請と同時にメンバー登録も行う」
-- 設計だったが、マジックリンク方式では「メールのリンクを開く」時点ではまだ
-- ニックネームが決まっていない(ニックネームは入室ステップで入力する)ため、
-- 「部屋(households)の作成だけを行い、メンバー登録はしない」
-- create_household_pending()に置き換える。実際の入室(household_membersへの登録)は
-- 他の入室経路と同じjoin_household_by_keyを使う(部屋の作成者も他のメンバーと
-- 同じ経路で入室するため、特別扱いが無くなりシンプルになる)。

begin;

drop function if exists create_household(text, text);

-- 部屋の作成のみ行う(auth.email()=マジックリンクで検証済みのメールアドレスを使う。
-- household_membersへの登録は行わない)
create or replace function create_household_pending()
returns table(household_id uuid, room_key text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_room_key text;
  v_email text;
begin
  v_email := auth.email();
  if v_email is null then
    raise exception 'email not verified';
  end if;

  v_room_key := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));

  insert into households (email, room_key)
  values (v_email, v_room_key)
  returning id into v_household_id;

  return query select v_household_id, v_room_key;
end;
$$;

revoke execute on function create_household_pending() from public;
grant execute on function create_household_pending() to authenticated;

commit;
