// ============================================================================
//  mobaReplay.js — MOBA 重播契約 v1（Sprint26）
//
//  身分：MOBA 賽後重播的唯一資料格式。**重播 = 播放已保存的 frame**，
//    不是重跑 LogicEngine（同 CS：EsportsFPS3D 也是先算完再播 frame）。
//
//  frame 只保存重播必要資料（緊湊陣列，不存 React 元件 / Three 物件 / 函式）：
//    { t,                          // 模擬秒
//      p:  [[x,y,hp,dead,k,d,a,gold,lv] ×10],  // 依 playersMeta 固定順序
//      tw: { towerId: hpRatio },   // 塔血（位置在 towersMeta，只存一次）
//      dr: 0|1, br: 0|1,           // 小龍 / 巴龍存活
//      s:  [bK, rK],               // 比分
//      g:  [bGold, rGold],         // 經濟
//      wp: winProb }               // 勝率條
//
//  容量（實測估算）：每 frame ≈ 0.8KB；2 秒取樣 × 20 分鐘 ≈ 600 frames ≈ 0.5MB。
//    localStorage（5MB，已存 profile/season/heroProgress）放不下完整 frames
//    → **只保存當前 session 的最近一場（記憶體）**，不寫 localStorage。
//    上限 MAX_FRAMES 到頂即停止擷取並標記 truncated（不無限成長）。
// ============================================================================

export const MOBA_REPLAY_VERSION = "MobaReplay.v1";

/** 取樣間隔（模擬秒）。2s + 位置線性插值 → 播放平順且容量可控。 */
export const FRAME_INTERVAL_S = 2;
/** frame 數上限（≈ 40 分鐘）。到頂停止擷取，replay.truncated = true。 */
export const MAX_FRAMES = 1200;
/** 重播播放速度選項（×）。 */
export const REPLAY_SPEEDS = [0.5, 1, 2, 4];
/** 1× 播放的「模擬秒/真實秒」——與現場對戰節奏一致（0.5 sim-s / 130ms tick）。 */
export const SIM_PER_REAL = 0.5 / 0.13;

/** 終局 snapshot → 緊湊 frame（唯一轉換點；欄位齊全、全部可序列化）。 */
export function snapshotToFrame(snap) {
  return {
    t: round2(snap.ts),
    p: snap.players.map((pl) => [
      round2(pl.pos.x), round2(pl.pos.y), round3(pl.hp), pl.dead ? 1 : 0,
      pl.k, pl.d, pl.a || 0, Math.round(pl.gold || 0), pl.lv || 1,
    ]),
    tw: Object.fromEntries(Object.entries(snap.towers).map(([id, t]) => [id, round3(t.hp)])),
    dr: snap.dragon?.alive ? 1 : 0,
    br: snap.baron?.alive ? 1 : 0,
    s: [snap.bK, snap.rK],
    g: [Math.round(snap.bGold), Math.round(snap.rGold)],
    wp: round3(snap.winProb ?? 0.5),
    // S29B1（純附加，舊 replay 沒有此欄 ⇒ 消費端須容忍 undefined）：
    //   中立目標存活位元（順序 = objectivesMeta；位置只在 meta 存一次）
    ...(snap.objectives ? { ob: snap.objectives.map((o) => (o.alive ? 1 : 0)) } : {}),
  };
}

/** 工廠：欄位齊全的 MobaReplay.v1。 */
export function createMobaReplay({
  matchId, seed = null, config = {}, startedAt = null, finishedAt = null,
  frames = [], events = [], playersMeta = [], towersMeta = {}, resultSummary = null, truncated = false,
}) {
  return {
    version: MOBA_REPLAY_VERSION,
    replayId: `rp-${matchId}`,
    matchId,
    seed,
    config,                                   // { tacticId, tacticName, opponentTacticId }（無戰術 → {}）
    startedAt, finishedAt,
    duration: frames.length ? frames[frames.length - 1].t : 0,
    frameInterval: FRAME_INTERVAL_S,
    frames,
    events,                                   // battleStore.log 摘要：{ t, type, side, text }
    playersMeta,                              // [{ id, side, role }] — frame.p 的固定順序
    towersMeta,                               // { towerId: { side, lane, pos } } — 位置只存一次
    resultSummary,                            // { winner, score:{blue,red}, duration, mvpId }
    truncated,
  };
}

/** 契約驗證：結構 / 數值有限 / t 遞增 / 上限 / 可序列化。 */
export function validateMobaReplay(r) {
  const errors = [];
  if (!r || typeof r !== "object") return { ok: false, errors: ["replay 不是物件"] };
  if (r.version !== MOBA_REPLAY_VERSION) errors.push(`version 必須為 ${MOBA_REPLAY_VERSION}`);
  if (!r.replayId) errors.push("缺 replayId");
  if (!r.matchId) errors.push("缺 matchId");
  if (!Array.isArray(r.frames) || r.frames.length === 0) errors.push("frames 為空");
  else {
    if (r.frames.length > MAX_FRAMES) errors.push(`frames 超過上限 ${MAX_FRAMES}`);
    let prev = -1;
    for (let i = 0; i < r.frames.length; i++) {
      const f = r.frames[i];
      if (!Number.isFinite(f.t) || f.t < prev) { errors.push(`frame[${i}].t 非遞增或非有限`); break; }
      prev = f.t;
      if (!Array.isArray(f.p) || f.p.some((row) => !Array.isArray(row) || row.some((v) => !Number.isFinite(v)))) {
        errors.push(`frame[${i}].p 含非有限數值`); break;
      }
    }
  }
  if (!Array.isArray(r.events)) errors.push("events 必須為陣列");
  if (!Array.isArray(r.playersMeta) || (r.frames?.length && r.playersMeta.length !== (r.frames[0].p?.length ?? 0)))
    errors.push("playersMeta 與 frame.p 長度不一致");
  if (!Number.isFinite(r.duration) || r.duration < 0) errors.push("duration 必須為非負數字");
  // 可序列化（不含函式 / 循環參照 / React・Three 物件）
  try { JSON.stringify(r); } catch { errors.push("replay 無法 JSON 序列化"); }
  return { ok: errors.length === 0, errors };
}

/** 容量估算（bytes）。 */
export function estimateReplaySize(r) {
  try { return JSON.stringify(r).length; } catch { return -1; }
}

const round2 = (v) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
const round3 = (v) => Math.round((Number.isFinite(v) ? v : 0) * 1000) / 1000;
