// ============================================================================
//  battle/moba/replay/replayBuffer.js — 重播擷取緩衝（Sprint26）
//
//  性質：純 JS 模組（非 React、非 zustand Store、不寫 localStorage）。
//    只保存「當前 session 的最近一場」MOBA 重播——localStorage 容量不適合
//    完整 frames（估算見 mobaReplay.js 檔頭），刻意不持久化，文件已標明。
//
//  生命週期：
//    begin()    ← useLocalServer.start（拿得到 seed / tactic 的唯一位置）
//    capture()  ← useBattleFeed 每幀（內部依 FRAME_INTERVAL_S 取樣；未 begin 則 no-op）
//    finalize() ← useBattleFeed 終局（events = battleStore.log、matchId 與結算同源）
//
//  保證：本模組**只讀** snapshot，不呼叫 LogicEngine、不碰任何 Store
//    → 擷取與重播都不可能觸發發獎 / 入史 / 統計。
// ============================================================================
import {
  createMobaReplay, snapshotToFrame, FRAME_INTERVAL_S, MAX_FRAMES,
} from "../../../platform/contracts/mobaReplay.js";

let cap = null;        // 進行中的擷取 { seed, config, startedAt, frames, playersMeta, towersMeta, lastT, truncated }
let current = null;    // 最近一場完成的 MobaReplay.v1（session 記憶體，最多 1 場）

/** 開始擷取新一場（覆蓋上一場的進行中擷取；已完成的 current 保留到下一次 finalize）。 */
export function beginReplayCapture({ seed = null, config = {} } = {}) {
  cap = { seed, config, startedAt: Date.now(), frames: [], playersMeta: [], towersMeta: {}, lastT: -Infinity, truncated: false };
}

/** 每幀呼叫：依間隔取樣；終局幀一定收。未 begin / 已達上限 → no-op。 */
export function captureReplayFrame(snap) {
  if (!cap || !snap) return;
  if (cap.truncated) return;
  const due = snap.ts - cap.lastT >= FRAME_INTERVAL_S || snap.over;
  if (!due || snap.ts === cap.lastT) return;
  if (cap.frames.length >= MAX_FRAMES) { cap.truncated = true; return; }
  if (cap.frames.length === 0) {
    cap.playersMeta = snap.players.map((p) => ({ id: p.id, side: p.side, role: p.role }));
    cap.towersMeta = Object.fromEntries(Object.entries(snap.towers).map(([id, t]) => [id, { side: t.side, lane: t.lane, pos: { x: t.pos.x, y: t.pos.y } }]));
  }
  cap.frames.push(snapshotToFrame(snap));
  cap.lastT = snap.ts;
}

/** 終局：組裝正式 MobaReplay.v1 並成為「當前可重播的一場」。回傳 replay 或 null。 */
export function finalizeReplay({ matchId, events = [], comms = [], resultSummary = null, tacticMeta = null }) {
  if (!cap || cap.frames.length === 0 || !matchId) { cap = null; return null; }
  const replay = createMobaReplay({
    matchId,
    seed: cap.seed,
    config: {
      ...cap.config,
      ...(tacticMeta ? { tacticId: tacticMeta.tacticId ?? null, tacticName: tacticMeta.tacticName ?? null, opponentTacticId: tacticMeta.opponentTacticId ?? null } : {}),
    },
    startedAt: cap.startedAt,
    finishedAt: Date.now(),
    frames: cap.frames,
    events: events.map((e) => ({ t: e.t, type: e.type, side: e.side ?? null, text: e.text ?? "" })),
    playersMeta: cap.playersMeta,
    towersMeta: cap.towersMeta,
    resultSummary,
    truncated: cap.truncated,
  });
  // S29：播報＝**本場實際產生的原始訊息**，原封存入 Replay。
  //   Replay 播放時只讀這份，**不重新生成對話**（S29 §八紅線）。
  replay.comms = comms.map((c) => ({
    id: c.id, t: c.t, ruleId: c.ruleId, side: c.side,
    speakerId: c.speakerId, speaker: c.speaker, text: c.text, evidence: c.evidence ?? null,
  }));
  current = replay;   // 只留最近一場（session 記憶體上限）
  cap = null;
  return replay;
}

/** Result 畫面查詢：最近一場重播（無 → null，呼叫端顯示「無法重播」，不白畫面）。 */
export function getCurrentReplay() { return current; }

export function clearReplay() { current = null; cap = null; }
