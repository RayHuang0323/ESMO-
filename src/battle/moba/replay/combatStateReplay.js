// ============================================================================
//  battle/moba/replay/combatStateReplay.js — CombatState.v1 的 Replay 擷取／編碼／還原
//
//  為什麼不存在 frame 裡：frame 每 2.5 模擬秒一格，1 秒的暈眩可能整個落在兩格之間。
//  持續狀態是「區間」：引擎（LogicEngine._combatStateStep）給每筆狀態精確的
//  startedAt／until，結束時再給 endedAt＋reason 與遞增 seq。這裡每個 snapshot 都收
//  （和 itemReplay 的購買紀錄同一模式），終局編成一張緊湊區間表，播放時依時間 t 反查。
//  ⇒ Replay 顯示的狀態就是現場那一份，不重跑引擎、不猜。
//
//  replay.combatStates（optional additive；MobaReplay.v1 不升版）：
//    { version: "CombatStateReplay.v1", kinds: [kind…], skills: [skillId…],
//      rows: [[kind, target, source, skill, startedAt, until, endedAt, reason, value, activeFrom, shape], …] }
//    target／source：playersMeta 索引（-1＝無）；skill：skills 索引（-1＝無）
//    endedAt：-1＝終局時仍在進行（以 until 為準）；reason：REASONS 索引（-1＝未結束）
//    value：數值（護盾量、減傷比…；null＝無）；activeFrom：領域開始生效時刻（null＝同 startedAt）
//    第 12 欄（optional）：value 關鍵影格 [[t, value]…]——護盾吸收傷害會逐步變小，只在數值改變時記一格
//    第 13 欄（optional）：until 關鍵影格 [[t, until]…]——狀態被刷新／延長時記一格（剩餘秒數才對得上現場）
//    （關鍵影格解析度＝擷取頻率：現場每 tick、快速完成每 2 tick；開始與最終結束時刻由引擎給，永遠精確）
//  sides（optional，v16 起）：每列一個字元 b／r／-（隊伍）。團隊物件狀態與領域的顏色靠它；舊 Replay 沒有 ⇒ 不分隊。
//
//  replay.objectiveEvents（optional，v16 起）：大型物件擊殺事件 [[seq, t, key(0 龍/1 巴龍), side(0 藍/1 紅), bounty, stacks, soul(0/1)]…]
//    shape：領域形狀 [cx,cy,r]（圓）或 [ax,ay,bx,by,w]（牆／線）；null＝非領域
// ============================================================================
import { COMBAT_STATE_REPLAY_VERSION, CS_REASONS } from "../../../platform/contracts/mobaReplay.js";

export { COMBAT_STATE_REPLAY_VERSION, CS_REASONS };

/** 擷取狀態（每場一份）。 */
export function createCombatStateCapture() {
  return { rows: new Map(), maxSeq: 0 };
}

/** 每個 snapshot 呼叫：收進行中（更新 until／value）與新的結束紀錄（依 seq）。 */
export function ingestCombatStates(capture, cs) {
  if (!capture || !cs) return;
  for (const r of cs.active ?? []) {
    const prev = capture.rows.get(r.id);
    if (prev && prev.endedAt !== undefined) continue;
    const vk = prev?.vk ?? [];
    if (Number.isFinite(r.value) && (!vk.length || vk[vk.length - 1][1] !== r2(r.value))) vk.push([r2(cs.t ?? r.startedAt), r2(r.value)]);
    const uk = prev?.uk ?? [];
    if (!uk.length || uk[uk.length - 1][1] !== r2(r.until)) uk.push([r2(uk.length ? (cs.t ?? r.startedAt) : r.startedAt), r2(r.until)]);
    capture.rows.set(r.id, { ...(prev ?? {}), ...r, vk, uk });
  }
  for (const r of cs.ended ?? []) {
    if (!Number.isInteger(r.seq) || r.seq <= capture.maxSeq) continue;
    capture.maxSeq = Math.max(capture.maxSeq, r.seq);
    capture.rows.set(r.id, { ...(capture.rows.get(r.id) ?? {}), ...r });
  }
}

const r2 = (v) => Math.round(v * 100) / 100;

/** 終局：編碼成 replay.combatStates（沒有任何狀態 ⇒ null，呼叫端不加欄位）。 */
export function encodeCombatStatesReplay(capture, playerIds = []) {
  if (!capture || !capture.rows.size) return null;
  const kinds = [], skills = [];
  const idx = (list, v) => { if (v === null || v === undefined) return -1; let i = list.indexOf(v); if (i < 0) { list.push(v); i = list.length - 1; } return i; };
  const seat = (id) => (id ? playerIds.indexOf(id) : -1);
  const rows = [...capture.rows.values()]
    .sort((a, b) => a.startedAt - b.startedAt || String(a.id).localeCompare(String(b.id)))
    .map((r) => {
      const shape = r.shape?.c ? [r.shape.c[0], r.shape.c[1], r.shape.r]
        : r.shape?.a ? [r.shape.a[0], r.shape.a[1], r.shape.b[0], r.shape.b[1], r.shape.w] : null;
      return [idx(kinds, r.kind), seat(r.targetId), seat(r.sourceId), idx(skills, r.skillId),
        r2(r.startedAt), r2(r.until), r.endedAt !== undefined ? r2(r.endedAt) : -1,
        r.reason ? CS_REASONS.indexOf(r.reason) : -1,
        Number.isFinite(r.value) ? r2(r.value) : null,
        Number.isFinite(r.activeFrom) ? r2(r.activeFrom) : null, shape,
        ...(r.uk && r.uk.length > 1 ? [r.vk && r.vk.length > 1 ? r.vk : null, r.uk] : r.vk && r.vk.length > 1 ? [r.vk] : [])];
    });
  const sides = [...capture.rows.values()]
    .sort((a, b) => a.startedAt - b.startedAt || String(a.id).localeCompare(String(b.id)))
    .map((r) => (r.side === "blue" ? "b" : r.side === "red" ? "r" : "-")).join("");
  return { version: COMBAT_STATE_REPLAY_VERSION, kinds, skills, rows, ...(/[br]/.test(sides) ? { sides } : {}) };
}

/**
 * 播放端：建立依時間查詢的索引。`at(t)` 回傳
 *   { byPlayer: [[{ id, remaining, sourceId?, skillId?, amount? }…] × players], active: [CombatState 列] }
 * 形狀與現場 snapshot.players[].statusEffects／snapshot.combatStates.active 相同 ⇒ UI／VFX 不分現場或重播。
 */
export function createCombatStateIndex(cs, playerIds = []) {
  if (!cs || !Array.isArray(cs.rows)) return null;
  const sideOf = (i) => (cs.sides?.[i] === "b" ? "blue" : cs.sides?.[i] === "r" ? "red" : null);
  const rows = cs.rows.map((r, i) => ({ side: sideOf(i),
    kind: cs.kinds[r[0]], target: r[1], source: r[2], skillId: r[3] >= 0 ? cs.skills[r[3]] : null,
    startedAt: r[4], until: r[5], end: r[6] >= 0 ? Math.min(r[6], r[5]) : r[5],
    reason: r[7] >= 0 ? CS_REASONS[r[7]] : null, value: r[8], activeFrom: r[9], shape: r[10], vk: r[11] ?? null, uk: r[12] ?? null,
  }));
  const shapeOf = (s) => (!s ? null : s.length === 3 ? { c: [s[0], s[1]], r: s[2] } : { a: [s[0], s[1]], b: [s[2], s[3]], w: s[4] });
  return {
    rowCount: rows.length,
    at(t) {
      const byPlayer = playerIds.map(() => []);
      const active = [];
      for (const r of rows) {
        if (r.startedAt > t + 1e-6) break;             // rows 依 startedAt 排序
        if (!(t < r.end - 1e-6)) continue;
        let until = r.uk ? r.uk[0][1] : r.until;
        if (r.uk) for (const [kt, ku] of r.uk) { if (kt <= t + 1e-6) until = ku; else break; }
        const remaining = Math.round((until - t) * 10) / 10;
        let value = r.vk ? r.vk[0][1] : r.value;
        if (r.vk) for (const [kt, kv] of r.vk) { if (kt <= t + 1e-6) value = kv; else break; }
        const targetId = r.target >= 0 ? playerIds[r.target] : null;
        const sourceId = r.source >= 0 ? playerIds[r.source] : null;
        active.push({ kind: r.kind, targetId, sourceId, skillId: r.skillId, side: r.side, startedAt: r.startedAt, until,
          remaining, ...(value !== null ? { value } : {}), ...(r.activeFrom !== null ? { activeFrom: r.activeFrom } : {}),
          ...(r.shape ? { shape: shapeOf(r.shape) } : {}) });
        if (r.target >= 0) {
          byPlayer[r.target].push({ id: r.kind, remaining, ...(sourceId ? { sourceId } : {}),
            ...(r.skillId ? { skillId: r.skillId } : {}), ...(r.kind === "shield" && value !== null ? { amount: value } : {}) });
        }
      }
      return { byPlayer, active };
    },
  };
}

// ── 大型物件事件（v16）──────────────────────────────────────────────────────
/** 每個 snapshot 呼叫：依 seq 收 snapshot.objectiveLog（引擎只保留最近幾筆）。 */
export function ingestObjectiveEvents(capture, log) {
  if (!capture || !Array.isArray(log)) return;
  capture.objective ??= new Map();
  for (const e of log) if (Number.isInteger(e?.seq) && !capture.objective.has(e.seq)) capture.objective.set(e.seq, e);
}

/** 終局：編碼成 replay.objectiveEvents（沒有事件 ⇒ null）。 */
export function encodeObjectiveEvents(capture) {
  const list = [...(capture?.objective?.values() ?? [])].sort((a, b) => a.seq - b.seq);
  if (!list.length) return null;
  return list.map((e) => [e.seq, Math.round(e.t * 100) / 100, e.key === "baron" ? 1 : 0, e.side === "red" ? 1 : 0,
    Math.round(e.bounty ?? 0), e.dragonStacks ?? 0, e.soul ? 1 : 0]);
}

/** 播放端：時間 t 之前（含）的最近 10 筆事件，形狀與現場 snapshot.objectiveLog 相同。 */
export function objectiveLogAt(events, t) {
  if (!Array.isArray(events)) return null;
  const out = [];
  for (const row of events) {
    if (row[1] > t + 1e-6) break;
    out.push({ seq: row[0], t: row[1], key: row[2] === 1 ? "baron" : "dragon", side: row[3] === 1 ? "red" : "blue",
      bounty: row[4], dragonStacks: row[5], soul: row[6] === 1 });
  }
  return out.slice(-10);
}

/**
 * 播放端：由團隊 CombatState（team-dragon／team-soul／team-baron）還原 teamBuffs 的物件欄位。
 * 沒有團隊狀態（舊 Replay）⇒ 回 null，呼叫端保留 frame.tb 的舊值。
 */
export function teamBuffsFromCombatStates(active, t, base = {}, hasTeamStates = false) {
  const team = (active ?? []).filter((r) => String(r.kind).startsWith("team-") && r.side);
  //  hasTeamStates：這場 Replay 有團隊狀態紀錄 ⇒ 此刻沒有任何狀態在作用也要回傳（＝0 層），
  //  不能回 null 讓呼叫端退回 2.5 秒一格、可能是「下一格」的 tb（seek 到拿龍前一刻會提早顯示龍層）。
  if (!hasTeamStates && !team.length && !(active ?? []).length) return null;
  const out = {};
  for (const side of ["blue", "red"]) {
    const dragon = team.find((r) => r.kind === "team-dragon" && r.side === side);
    const soul = team.find((r) => r.kind === "team-soul" && r.side === side);
    const baron = team.find((r) => r.kind === "team-baron" && r.side === side);
    const b = base?.[side] ?? {};
    out[side] = { ...b,
      dragonStacks: dragon ? Math.round(dragon.value ?? 0) : 0,
      baronRemaining: baron ? Math.max(0, Math.round((baron.until - t) * 10) / 10) : 0,
      soul: !!soul,
      ...(baron ? { baronDuration: Math.round((baron.until - baron.startedAt) * 10) / 10 } : {}),
    };
  }
  return out;
}
