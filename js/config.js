// ==========================================================
// 接続設定(Supabase / Gemini API)
// ==========================================================

export const SUPABASE_URL = "https://duzqatnbkaewgcblgvvs.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1enFhdG5ia2Fld2djYmxndnZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3OTYxNDksImV4cCI6MjA5OTM3MjE0OX0.34Wp5tGK-gvp-Qd9hWb1XX0oaE1ELorPF74oA8VYJuE";
export const GEMINI_API_KEY = "AQ.Ab8RN6IOwClGNZGx9p1pjBb5GbS7gCeiUSXFfdMX5E5f3lVhqQ";

// index.html で <script src="...supabase-js@2"></script> を先に読み込んでいるため
// window.supabase が使える状態になっている
export const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
