// ============================================================================
//  supabase/functions/ranked-authority — SKELETON（Online Foundation v2A）
//
//  ⚠ NOT DEPLOYED. 沒有 `supabase functions deploy`、沒有連任何 Supabase 專案。
//  ⚠ REMOTE_E2E_NOT_RUN：這台機器沒有憑證，下面每一條路徑都從未在真後端執行過。
//  ⚠ 本檔在 src/ 之外，Vite 不會把它打進前端 bundle。
//
//  這是 `SERVER_AUTHORITY_INTERFACE.serverOnly`（src/platform/online/matchAdjudication.js）
//  的伺服器端落點。所有路由目前回 501，只保留「伺服器會依序做什麼」的骨架，
//  讓 Backend Authority 那一輪照著填，不必重新設計。
//
//  ── 機密（只從環境變數讀；repo 裡永遠沒有值）──────────────────────────────
//    ESMO_SIGNING_KEY_JWK     Ed25519 私鑰（JWK）。只在 Edge Function 環境，絕不進前端。
//    ESMO_SIGNING_KEY_ID      對應 public.signing_keys.key_id
//    SUPABASE_SERVICE_ROLE_KEY  由 Supabase 平台注入（不是我們設定的）
//
//  ── 路由（POST，皆需使用者 JWT；subject = auth.uid()，不收客戶端送的 userId）──
//    /ticket       issueMatchTicket   OnlineMatchTicketRequest.v1 → OnlineMatchTicket.v1
//    /adjudicate   adjudicateMatch    { ticketId } → AdjudicatedMatchResult.v1
//    （signSquadSnapshot／settleRatedMatch 由上面兩條在伺服器內部呼叫，不對外開路由）
// ============================================================================

const NOT_IMPLEMENTED = {
  code: "not_implemented",
  remoteE2E: "REMOTE_E2E_NOT_RUN",
  message: "ranked-authority is a skeleton; Competitive is disabled (COMPETITIVE_ENABLED = false).",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// issueMatchTicket（待實作，依序）：
//   1. 驗 JWT → subject = auth.uid()
//   2. validateTicketRequest(body)：拒伺服器欄位（ticketId/nonce/serverDay/seed/...）與數值
//   3. 以 subject 重新權威取值 → CompetitiveEntry；powerHash／snapshotHash 必須與請求一致
//   4. 以本場名單重算天賦：validateBattleTalentBinding(binding, { roster })
//   5. server_day()（DB now()）→ 原子扣 ranked_quota（同一個 transaction）
//   6. nonce = 16 bytes crypto.getRandomValues → base64url；ticketId = "tk_" + 隨機
//   7. createUnsignedTicket → signingBytes → Ed25519 簽（ESMO_SIGNING_KEY_JWK）
//   8. insert ranked_tickets（nonce unique）→ 回票券
async function issueMatchTicket(_req: Request): Promise<Response> {
  return json(501, NOT_IMPLEMENTED);
}

// adjudicateMatch（待實作，依序）：
//   1. 驗 JWT；ticketId 必須屬於 subject、未過期、未裁決（match_adjudications 主鍵＝冪等）
//   2. 取防守方 signed_snapshots；seed 由伺服器產生（客戶端沒有入口）
//   3. createAdjudicationInputs → 用票券登記的 simulationVersion 跑引擎
//   4. createUnsignedAdjudication → 簽 → insert match_adjudications → settleRatedMatch
async function adjudicateMatch(_req: Request): Promise<Response> {
  return json(501, NOT_IMPLEMENTED);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { code: "method_not_allowed" });
  const route = new URL(req.url).pathname.split("/").pop();
  if (route === "ticket") return issueMatchTicket(req);
  if (route === "adjudicate") return adjudicateMatch(req);
  return json(404, { code: "not_found" });
});
