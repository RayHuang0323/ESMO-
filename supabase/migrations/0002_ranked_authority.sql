-- ============================================================================
--  ESMO — Ranked authority 持久化邊界（Online Foundation v1）
--
--  執行：Supabase 後台 SQL Editor 貼上執行，或 `supabase db push`。
--  ⚠ 本輪**只定邊界**，尚未部署、尚未有伺服器端寫入者（Edge Function）。
--  ⚠ Online Backend Foundation v1（2026-09-28）修正：search_path 釘住、server_day() grant、
--    force RLS、收回 anon 與 authenticated 的表權限後只給 select、updated_at trigger、user_id 索引。
--    仍**不在正式 DB 執行**（沒有憑證；Owner 完成 Supabase 設定前不跑）。
--    這台機器沒有憑證 ⇒ REMOTE_E2E_NOT_RUN。
--
--  ── 邊界原則 ─────────────────────────────────────────────────────────────
--  ⚠ 前端拿的是 anon key。資料保護**只靠 RLS**（與 0001 同一條原則）。
--  ⚠ 客戶端**只能讀自己的列**。本檔**沒有任何** insert / update / delete policy：
--    Ranked 戰績、評分、每日配額、出賽票券、簽章快照，全部只能由伺服器
--    （service_role，繞過 RLS）寫入。客戶端回報勝負的入口一旦存在，就一定會被偽造。
--  ⚠ 時間一律用資料庫 `now()`。伺服器日 = UTC 日期（與 `src/platform/time/serverClock.js`
--    的 `SERVER_DAY.resetUtcHour = 0` 一致）。客戶端送來的任何日期都不採用。
--  ⚠ 這些表**與生涯存檔無關**：`career_saves` 不含任何 ranked 欄位，
--    ranked 也不寫 `career_saves`（CareerTime / ServerTime 完全分離）。
-- ============================================================================

-- ── 權威時間 ───────────────────────────────────────────────────────────────
--  客戶端用它做 NTP 式同步（見 serverTimeAuthority.js）。只讀、無副作用。
create or replace function public.server_time()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select now();
$$;

--  伺服器日：UTC 日期距 epoch 的天數（與 serverDayOf() 同一個定義）。
create or replace function public.server_day()
returns integer
language sql
stable
set search_path = ''
as $$
  select ((now() at time zone 'utc')::date - date '1970-01-01')::integer;
$$;

revoke all on function public.server_time() from public;
revoke all on function public.server_day() from public;
grant execute on function public.server_time() to anon, authenticated;
grant execute on function public.server_day() to anon, authenticated;
comment on function public.server_time() is
  '權威時間來源。客戶端同步只作顯示／預判；寫入時伺服器一律用自己的 now() 重驗。';
comment on function public.server_day() is
  '伺服器日（UTC 日期距 epoch 天數）。Ranked 配額／賽季一律用它；生涯 CareerTime（meta.days）不得與它互轉。';

-- ── ranked_records：每位玩家、每個模式一列（MOBA / CS 分帳，I9）──────────────
create table if not exists public.ranked_records (
  user_id        uuid        not null references auth.users (id) on delete cascade,
  mode           text        not null check (mode in ('moba', 'cs')),
  --  CompetitiveRecord.v1 的單一模式切片（ladderRating 可為 null = 未評分）
  record_json    jsonb       not null,
  record_version text        not null default 'CompetitiveRecord.v1',
  revision       bigint      not null default 1,
  updated_at     timestamptz not null default now(),
  primary key (user_id, mode)
);

-- ── ranked_quota：Rated 配額（只由伺服器日重置，I16）───────────────────────────
create table if not exists public.ranked_quota (
  user_id     uuid     not null references auth.users (id) on delete cascade,
  mode        text     not null check (mode in ('moba', 'cs')),
  server_day  integer  not null,
  used        integer  not null default 0 check (used >= 0),
  primary key (user_id, mode, server_day)
);

-- ── ranked_tickets：伺服器簽發的出賽票券；結算以票券為冪等鍵 ───────────────────
create table if not exists public.ranked_tickets (
  ticket_id         text        primary key,
  user_id           uuid        not null references auth.users (id) on delete cascade,
  mode              text        not null check (mode in ('moba', 'cs')),
  server_day        integer     not null,
  entry_power_hash  text        not null,
  issued_at         timestamptz not null default now(),
  settled_at        timestamptz,
  outcome           text        check (outcome in ('win', 'loss', 'draw'))
);

-- ── signed_snapshots：SignedSquadSnapshot.v1（伺服器簽章後才寫入）─────────────────
create table if not exists public.signed_snapshots (
  snapshot_hash  text        primary key,
  user_id        uuid        not null references auth.users (id) on delete cascade,
  mode           text        not null check (mode in ('moba', 'cs')),
  key_id         text        not null,
  envelope_json  jsonb       not null,
  issued_at      timestamptz not null default now()
);

-- ── 索引：只讀自己的列都以 user_id 查 ──────────────────────────────────────────
create index if not exists ranked_tickets_user_id_idx   on public.ranked_tickets (user_id);
create index if not exists signed_snapshots_user_id_idx on public.signed_snapshots (user_id);

-- ── updated_at：沿用 0001 的 public.touch_updated_at()（依賴 0001 先執行）─────────────
drop trigger if exists ranked_records_touch_updated_at on public.ranked_records;
create trigger ranked_records_touch_updated_at
  before update on public.ranked_records
  for each row execute function public.touch_updated_at();

-- ── RLS：只准讀自己；沒有任何客戶端寫入 policy ───────────────────────────────
alter table public.ranked_records enable row level security;
alter table public.ranked_quota enable row level security;
alter table public.ranked_tickets enable row level security;
alter table public.signed_snapshots enable row level security;
--  force：連表擁有者也受 RLS 約束（與 0001 同一條原則）；service_role 仍會繞過 RLS，是唯一寫入者。
alter table public.ranked_records   force row level security;
alter table public.ranked_quota     force row level security;
alter table public.ranked_tickets   force row level security;
alter table public.signed_snapshots force row level security;

--  表權限：先全部收回，再只給 authenticated select（RLS 之外的第二層）。anon 什麼都不給。
revoke all on public.ranked_records   from anon, authenticated;
revoke all on public.ranked_quota     from anon, authenticated;
revoke all on public.ranked_tickets   from anon, authenticated;
revoke all on public.signed_snapshots from anon, authenticated;
grant select on public.ranked_records   to authenticated;
grant select on public.ranked_quota     to authenticated;
grant select on public.ranked_tickets   to authenticated;
grant select on public.signed_snapshots to authenticated;

drop policy if exists ranked_records_select_own on public.ranked_records;
create policy ranked_records_select_own on public.ranked_records
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists ranked_quota_select_own on public.ranked_quota;
create policy ranked_quota_select_own on public.ranked_quota
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists ranked_tickets_select_own on public.ranked_tickets;
create policy ranked_tickets_select_own on public.ranked_tickets
  for select to authenticated using (auth.uid() = user_id);

--  ⚠ 簽章快照：挑戰對手需要讀**別人**的快照，但那屬於配對／挑戰的讀取面，本輪不開放。
--    本輪只准讀自己的；跨玩家讀取留給 Online 下一階段另立 policy。
drop policy if exists signed_snapshots_select_own on public.signed_snapshots;
create policy signed_snapshots_select_own on public.signed_snapshots
  for select to authenticated using (auth.uid() = user_id);

-- ⚠ 刻意不寫：任何 insert / update / delete policy、任何開放給客戶端的寫入函式。
--   寫入者只有伺服器（service_role）。見 docs/design/Online_Foundation_v1.md §3。
