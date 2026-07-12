// ============================================================================
//  CsMatchResult.js — CS 專屬結果契約（Sprint23）
//
//  身分：CS/FPS 的「唯一結果格式」。與 MOBA 的 BattleResult.v2 平行、互不相通：
//    · CS 沒有 Hero / QWER / Dragon / Baron / Tower → 本契約沒有這些欄位。
//    · 不寫 seasonStore（那是 MOBA BattleResult 的入史口）；CS 訓練賽
//      入史口 = profileStore.recordCsMatch → profileStore.csHistory。
//
//  資料來源（全部真實，不編造）：
//    · raw = EsportsFPS3D buildMatchResult 的 MatchResult（引擎唯一輸出，
//      見 EsportsFPS3D.jsx:635-651）。
//    · ctx = 賽前流程選擇（seed / map / tactic）+ fpsRoster Adapter 名單
//      （用 name→_gid 對回 profileStore.players 的真實 playerId）。
//    · 引擎沒有的欄位（duration 時間長度）→ null，UI 顯示待接，不偽造。
//    · rewards 由 profileStore.recordCsMatch 以 matchRecorder.updateEconomy
//      （Legacy 逐字公式）入帳時填入；轉換當下為 null。
// ============================================================================

export const CS_RESULT_SCHEMA = "CsMatchResult.v1";

/** 引擎回傳的我方/對手選手 → 契約選手列（欄位皆引擎真實統計） */
function toContractPlayer(p, nameToId) {
  return {
    playerId: nameToId[p.name] ?? null,   // null = 引擎內建示範陣容（非真實選手）
    playerName: p.name,
    role: p.role,                          // 中文定位（引擎 ROLE_ZH：指揮/狙擊/步槍/突破/輔助/埋伏）
    roleKey: p.roleKey ?? null,            // 引擎定位鍵（igl/awp/rifler/entry/support/lurker）
    kills: p.k, deaths: p.d, assists: p.a,
    rating: p.rating,
    adr: p.adr ?? null,                    // 平均每回合傷害（引擎有 → 直接用；契約的 damage 欄位）
    hsPct: p.hsPct ?? null,
    kast: p.kast ?? null,
    clutches: p.clutches ?? 0,
    entryKills: p.entryKills ?? 0,
    mvpRounds: p.mvpRounds ?? 0,
  };
}

/**
 * 引擎 MatchResult → CsMatchResult.v1。
 * @param {Object} raw  EsportsFPS3D onComplete 的 MatchResult（mode:"CS"）
 * @param {Object} ctx  { seed, mapKey, mapName, tacticId, tacticName, tacticType, roster }
 *                      roster = toFpsRoster 輸出（含 _gid 真實選手 id），可為 null
 */
export function toCsMatchResult(raw, ctx = {}) {
  if (!raw || raw.mode !== "CS") return null;
  const nameToId = {};
  (ctx.roster ?? []).forEach((r) => { if (r && r.name) nameToId[r.name] = r._gid ?? null; });
  const ours = (raw.ourPlayers ?? []).map((p) => toContractPlayer(p, nameToId));
  const opps = (raw.theirPlayers ?? []).map((p) => toContractPlayer(p, {}));
  const mvpRaw = raw.ourMvp ?? null;
  return {
    schema: CS_RESULT_SCHEMA,
    mode: "cs",
    matchId: raw.id,
    seed: ctx.seed ?? null,
    mapId: raw.map ?? ctx.mapKey ?? null,
    mapName: ctx.mapName ?? raw.map ?? null,
    // 賽前部署（Legacy TACTICS_LIB.fps 的團隊戰術）與引擎實際執行的地圖戰術分開記錄
    tacticId: ctx.tacticId ?? null,
    tacticName: ctx.tacticName ?? null,
    tacticType: ctx.tacticType ?? null,
    engineTactic: raw.tactic ?? null,     // {ours,theirs,ourType,theirType}（引擎地圖戰術名）
    winner: raw.win ? "us" : "enemy",
    ourScore: raw.scoreT ?? 0,
    enemyScore: raw.scoreCT ?? 0,
    duration: null,                        // 引擎未提供時間長度 → 待接，不編造
    roundCount: raw.roundCount ?? (raw.rounds?.length ?? null),
    teamName: raw.tName ?? null,
    oppName: raw.ctName ?? null,
    players: ours,
    opponents: opps,
    mvp: mvpRaw ? { playerId: nameToId[mvpRaw.name] ?? null, playerName: mvpRaw.name, role: mvpRaw.role, rating: mvpRaw.rating } : null,
    // 逐回合摘要（引擎 roundHist 真實資料：勝方 + 結束方式 elim/bomb/defuse/time）
    summaryEvents: (raw.rounds ?? []).map((r, i) => ({ round: i + 1, winner: r.winner === "t" ? "us" : "enemy", how: r.how ?? null })),
    rewards: { money: null, fans: null, xp: null }, // 由 recordCsMatch（Legacy 公式）入帳時填入
    recordedAt: null,                      // 由 recordCsMatch 蓋章（= 已寫入 csHistory）
  };
}

/** 驗證是否足以入史。 */
export function validateCsMatchResult(r) {
  const errors = [];
  if (!r || typeof r !== "object") return { ok: false, errors: ["result 不是物件"] };
  if (r.schema !== CS_RESULT_SCHEMA) errors.push(`schema 不是 ${CS_RESULT_SCHEMA}`);
  if (r.mode !== "cs") errors.push("mode 必須為 cs");
  if (!r.matchId) errors.push("缺 matchId");
  if (!r.mapId) errors.push("缺 mapId");
  if (!Number.isFinite(r.ourScore) || !Number.isFinite(r.enemyScore)) errors.push("比分必須為數字");
  if (r.winner !== "us" && r.winner !== "enemy") errors.push("winner 必須為 us/enemy");
  if (!Array.isArray(r.players) || r.players.length === 0) errors.push("players 為空");
  return { ok: errors.length === 0, errors };
}
