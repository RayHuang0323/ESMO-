-- ============================================================================
--  ESMO — Cloud Save 最小 schema（Backend B1D）
--
--  執行：Supabase 後台 SQL Editor 貼上執行，或 `supabase db push`。
--
--  ── 設計原則 ─────────────────────────────────────────────────────────────
--  ⚠ **最小**。這一輪只要「登入之後，一份 SaveBundle 存得上去、讀得回來」。
--    不做 leaderboard、不做 challenge、不做好友，那些都還沒有需求形狀。
--  ⚠ **RLS 是唯一的保護**。前端拿的是 anon key（設計上可公開），
--    資料的隔離完全靠下面的 policy —— 少一條 policy 就是全世界都讀得到。
--  ⚠ `revision` 欄位**先留著但不實作衝突合併**（B1E 才做）。
--    留它是因為之後補 `WHERE revision = ?` 的樂觀鎖不用改表結構。
-- ============================================================================

-- ── profiles：一個帳號一列 ──────────────────────────────────────────────────
--  ⚠ 刻意**不**存 email / 名字：這一輪不需要，而不需要的個資就不要收。
--    要顯示名字的話，前端從 auth session 自己讀，不必落地。
create table if not exists public.profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'ESMO 帳號。B1D 只有時間戳；不存 email/顯示名（不需要的個資不收）。';

-- ── career_saves：SaveBundle.v1 的雲端副本 ─────────────────────────────────
create table if not exists public.career_saves (
  user_id       uuid        not null references auth.users (id) on delete cascade,
  slot_id       text        not null default 'default',
  --  ⚠ 這是 **SaveBundle 的 schema 字串**（目前 'SaveBundle.v1'），
  --    不是 profile 內部的 schemaVersion。用它做未來的相容判斷。
  save_version  text        not null,
  --  ⚠ 只存 **bundle.cloud** 那一半：本機的重播證據與季賽 timeline 不上來。
  --    B1B 實測：整份本機資料約 975 KB，其中雲端該帶的只有約 20 KB。
  save_json     jsonb       not null,
  --  ⚠ B1D **不實作**衝突合併，這個欄位先留著給 B1E 做樂觀鎖用。
  revision      bigint      not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, slot_id)
);

comment on column public.career_saves.save_json is
  '只存 SaveBundle.v1 的 cloud 段。重播證據與季賽 timeline 一律留在本機。';
comment on column public.career_saves.revision is
  'B1D 只寫不判。B1E 要做樂觀鎖（WHERE revision = ?）時不必改表結構。';

create index if not exists career_saves_user_updated_idx
  on public.career_saves (user_id, updated_at desc);

-- ── updated_at 自動維護 ────────────────────────────────────────────────────
--  ⚠ 由資料庫維護，不信任 client 送來的時間：client 的時鐘可以是任何值，
--    而「哪一份比較新」之後要靠它判斷。
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists career_saves_touch_updated_at on public.career_saves;
create trigger career_saves_touch_updated_at
  before update on public.career_saves
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ── 新帳號自動建 profile ───────────────────────────────────────────────────
--  ⚠ `security definer` 是必要的：這個 trigger 跑在 auth schema 的插入之後，
--    當下還沒有 request 的 JWT，用呼叫者權限會被 RLS 擋掉。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ══════════════════════════════════════════════════════════════════════════
--  RLS —— ⚠ 這一段是唯一的保護，少一條 policy 就是資料外洩
-- ══════════════════════════════════════════════════════════════════════════
alter table public.profiles     enable row level security;
alter table public.career_saves enable row level security;

--  ⚠ 一併 FORCE：連 table owner 走一般連線時也要吃 RLS。
alter table public.profiles     force row level security;
alter table public.career_saves force row level security;

-- profiles：只碰得到自己那一列
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- career_saves：只碰得到自己的存檔
--  ⚠ 四個動作都要各自寫。只寫 select 的話，任何登入者都能改別人的存檔。
--  ⚠ `with check` 不能省：沒有它，使用者可以把 user_id 改成別人的。
drop policy if exists career_saves_select_own on public.career_saves;
create policy career_saves_select_own on public.career_saves
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists career_saves_insert_own on public.career_saves;
create policy career_saves_insert_own on public.career_saves
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists career_saves_update_own on public.career_saves;
create policy career_saves_update_own on public.career_saves
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists career_saves_delete_own on public.career_saves;
create policy career_saves_delete_own on public.career_saves
  for delete to authenticated using (auth.uid() = user_id);

--  ⚠ **沒有給 anon 任何 policy**：未登入就是一列都碰不到。
--    這正是「未登入時 Cloud Save 不能假裝成功」在資料庫這一側的落實。

-- ── 撤掉不需要的權限 ───────────────────────────────────────────────────────
--  ⚠ RLS 之外再收一層：anon 角色連 table 的 grant 都不給。
revoke all on public.profiles     from anon;
revoke all on public.career_saves from anon;
grant select, insert, update         on public.profiles     to authenticated;
grant select, insert, update, delete on public.career_saves to authenticated;

-- ══════════════════════════════════════════════════════════════════════════
--  ⚠ 這份 schema **不提供任何防作弊保證**。
--    它保證的是「只有你能讀寫你自己的存檔」，不保證「存檔內容是誠實的」——
--    數值仍然由玩家的瀏覽器算出來再送上來。
--    競技可信度要等 Server Authority，不在 B1D 的範圍。
-- ══════════════════════════════════════════════════════════════════════════
