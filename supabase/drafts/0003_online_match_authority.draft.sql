-- ============================================================================
--  ESMO — Online match authority（Online Foundation v2A）　⚠ DRAFT — 不是 migration
--
--  ⚠ 這個檔**刻意不放在 supabase/migrations/**：`supabase db push` 不會讀到它。
--    Owner 完成 docs/handoff/SUPABASE_SETUP_OWNER.md、且 Backend Authority 那一輪
--    實作 Edge Function 之後，才會改名搬進 migrations/（屆時再審一次）。
--  ⚠ 沒有在任何資料庫執行過（沒有憑證）⇒ REMOTE_E2E_NOT_RUN。只驗形狀。
--  ⚠ 依賴 0001（touch_updated_at）與 0002（ranked_tickets 等）。
--
--  ── 邊界原則（與 0002 相同，一條都不放寬）─────────────────────────────────────
--  · 客戶端（anon／authenticated）**只能讀自己的列**；本檔沒有任何 insert/update/delete policy。
--  · 寫入者只有 Edge Function（service_role，繞過 RLS）。
--  · 時間一律用資料庫 now()；伺服器日一律 public.server_day()。
--  · 簽章私鑰**不在資料庫**：只在 Edge Function 的環境變數（ESMO_SIGNING_KEY_JWK）。
--    資料庫只存**公鑰**（signing_keys），客戶端用它驗章。
--  · 本檔所有表與 career_saves 無關（CareerTime／ServerTime 分離）。
-- ============================================================================

-- ── signing_keys：伺服器簽章公鑰（客戶端驗章用；可輪替）─────────────────────────
create table if not exists public.signing_keys (
  key_id          text        primary key,
  alg             text        not null check (alg = 'Ed25519'),
  public_jwk_x    text        not null,
  purpose         text        not null check (purpose in ('snapshot', 'ticket', 'result')),
  active_from     timestamptz not null default now(),
  retired_at      timestamptz
);

-- ── ranked_tickets：v2A 欄位（OnlineMatchTicket.v1）────────────────────────────
alter table public.ranked_tickets add column if not exists nonce              text;
alter table public.ranked_tickets add column if not exists expires_at         timestamptz;
alter table public.ranked_tickets add column if not exists simulation_version text;
alter table public.ranked_tickets add column if not exists snapshot_hash      text;
--  本場戰鬥天賦（BattleTalentBinding.v1 全文＋雜湊）——伺服器裁決時用的就是這一份。
alter table public.ranked_tickets add column if not exists battle_talents_json jsonb;
alter table public.ranked_tickets add column if not exists battle_talents_hash text;
alter table public.ranked_tickets add column if not exists key_id             text references public.signing_keys (key_id);
alter table public.ranked_tickets add column if not exists ticket_envelope_json jsonb;
--  nonce 防重放的**權威**：資料庫唯一性（客戶端的 seenNonces 只是提早發現）。
create unique index if not exists ranked_tickets_nonce_uidx on public.ranked_tickets (nonce);

-- ── match_adjudications：AdjudicatedMatchResult.v1（ticket_id 即冪等鍵）─────────────
create table if not exists public.match_adjudications (
  ticket_id             text        primary key references public.ranked_tickets (ticket_id) on delete cascade,
  user_id               uuid        not null references auth.users (id) on delete cascade,
  mode                  text        not null check (mode in ('moba')),
  simulation_version    text        not null,
  inputs_hash           text        not null,
  battle_talents_hash   text        not null,
  --  seed 由伺服器產生、只存伺服器端；客戶端從頭到尾沒有提供 seed 的入口。
  seed                  bigint      not null,
  winner                text        not null check (winner in ('attacker', 'defender', 'draw')),
  result_envelope_json  jsonb       not null,
  key_id                text        not null references public.signing_keys (key_id),
  adjudicated_at        timestamptz not null default now()
);
create index if not exists match_adjudications_user_id_idx on public.match_adjudications (user_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.signing_keys        enable row level security;
alter table public.match_adjudications enable row level security;
alter table public.signing_keys        force row level security;
alter table public.match_adjudications force row level security;

revoke all on public.signing_keys        from anon, authenticated;
revoke all on public.match_adjudications from anon, authenticated;
--  公鑰本來就是公開的：登入者可讀（驗章需要）。私鑰不在這裡。
grant select on public.signing_keys        to authenticated;
grant select on public.match_adjudications to authenticated;

drop policy if exists signing_keys_select_all on public.signing_keys;
create policy signing_keys_select_all on public.signing_keys
  for select to authenticated using (true);

drop policy if exists match_adjudications_select_own on public.match_adjudications;
create policy match_adjudications_select_own on public.match_adjudications
  for select to authenticated using (auth.uid() = user_id);

-- ⚠ 刻意不寫：任何 insert / update / delete policy、任何開放給客戶端的寫入函式。
--   票券、裁決、結算的寫入者只有 Edge Function（service_role）。
