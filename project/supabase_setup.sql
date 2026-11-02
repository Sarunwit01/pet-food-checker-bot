-- รันใน Supabase > SQL Editor
create table if not exists public.learned_foods (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);
-- ใช้ service_role key ฝั่งเซิร์ฟเวอร์เท่านั้น: เปิด RLS เพื่อปิดการเข้าถึงจาก anon key
alter table public.learned_foods enable row level security;
