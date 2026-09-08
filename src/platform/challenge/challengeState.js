// ============================================================================
//  platform/challenge/challengeState.js — Challenge 的存檔切片（Slice 2）
//
//  ── 為什麼在這裡，而不是自建一套 storage ─────────────────────────────────
//  `profileStore.save()` 直接序列化整份 store state ⇒ **既有的持久化邊界**
//  就是「把一個切片放進 store」。本檔是那個切片的**純函式**部分
//  （空值 / 正規化 / reducer），與 `teamDevelopment` / `retention` /
//  `clubMastery` 同一個結構：純模組負責邏輯，Store 只做薄包裝。
//  ⇒ 不新增第二套 storage framework，也不新增第二個存檔鍵。
//
//  ── 容量：為什麼要上限 ────────────────────────────────────────────────────
//  一份快照約 1.5–2KB（五名選手 × 16 項能力 ＋ loadout）。挑戰紀錄若無上限，
//  存檔會隨遊玩時間無限成長，最後 localStorage 寫入失敗——而
//  `profileStore.save()` 的 `catch {}` 會**靜默吞掉**那個失敗，
//  玩家會在某一天發現「我的進度不見了」。
//  ⇒ 保留最近 `MAX_INSTANCES` 場，並**連帶清掉沒有人再引用的快照**。
//  ⚠ 我自己的防守快照永遠不被清（它不是歷史，是現況）。
//
//  ── 冪等 ─────────────────────────────────────────────────────────────────
//  `challengeId` 是唯一的鍵。同一個 id 再 `putInstance` 一次：
//  已結算的**原樣返回**，不覆蓋、不重跑。連點與重整都會走到這裡。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { validateSquadSnapshot } from "../contracts/squadSnapshot.js";
import { validateChallengeInstance, CHALLENGE_STATES } from "../contracts/challengeInstance.js";

export const CHALLENGE_STATE_VERSION = "ChallengeState.v1";

/** 保留幾場挑戰紀錄。⚠ 唯一的容量常數，要調只改這一處。 */
export const MAX_INSTANCES = 20;

export function emptyChallengeState() {
  return {
    schema: CHALLENGE_STATE_VERSION,
    //  我目前對外的防守快照（`SquadSnapshot.v1`）。null = 還沒發布過。
    defense: null,
    //  發布節流用（每個生涯日一份）。
    lastPublishedCareerDay: null,
    //  hash → 快照。挑戰紀錄只存 hash 引用，內容集中放這裡（一份真相）。
    snapshots: {},
    //  challengeId → ChallengeInstance.v1（含 result）。
    instances: {},
    //  最近在前。⚠ 順序另存，不靠物件鍵順序——那不是規格保證的。
    order: [],
  };
}

/**
 * 讀存檔時的正規化。**不猜、不修補**：形狀不對就丟掉那一筆。
 *
 * ⚠ 快照與挑戰都跑**完整驗證**（含雜湊重算）。壞掉的一筆不是「盡量救」，
 *   而是「不要用」——一份雜湊對不上的快照拿去重播，會產生一個
 *   看起來正常但其實錯誤的結果，那比缺一筆紀錄糟得多。
 */
export function normalizeChallengeState(saved) {
  const base = emptyChallengeState();
  if (!saved || typeof saved !== "object") return base;

  const defense = saved.defense && validateSquadSnapshot(saved.defense).ok ? saved.defense : null;

  const snapshots = {};
  for (const [hash, snap] of Object.entries(saved.snapshots ?? {})) {
    if (snap && snap.hash === hash && validateSquadSnapshot(snap).ok) snapshots[hash] = snap;
  }

  const instances = {};
  for (const [id, inst] of Object.entries(saved.instances ?? {})) {
    if (!inst || inst.challengeId !== id) continue;
    if (!validateChallengeInstance(inst).ok) continue;
    //  ⚠ 引用的兩份快照都要在，否則這一場再也重播不出來 ⇒ 不留半截紀錄。
    if (!snapshots[inst.challengerSnapshotHash] || !snapshots[inst.defenderSnapshotHash]) continue;
    instances[id] = inst;
  }

  const order = (Array.isArray(saved.order) ? saved.order : []).filter((id) => instances[id]);
  //  存檔裡有但不在 order 的（舊版或半截寫入）⇒ 補到尾端，不丟掉。
  for (const id of Object.keys(instances)) if (!order.includes(id)) order.push(id);

  const day = Number(saved.lastPublishedCareerDay);
  return {
    ...base,
    defense,
    lastPublishedCareerDay: Number.isFinite(day) ? Math.floor(day) : null,
    snapshots, instances, order,
  };
}

/** 記下一份快照（去重：同一個 hash 就是同一份內容）。 */
export function putSnapshot(state, snapshot) {
  if (!snapshot?.hash || state.snapshots[snapshot.hash]) return state;
  return { ...state, snapshots: { ...state.snapshots, [snapshot.hash]: snapshot } };
}

/** 發布／更新我的防守快照。 */
export function setDefense(state, snapshot, careerDay) {
  const withSnap = putSnapshot(state, snapshot);
  return {
    ...withSnap,
    defense: snapshot,
    lastPublishedCareerDay: Math.max(0, Math.floor(Number(careerDay) || 0)),
  };
}

/**
 * 加入一場挑戰。**冪等**：同一個 `challengeId` 已存在 ⇒ 原樣返回。
 *
 * ⚠ 這是「duplicate click 不產生第二筆」的落點。
 *   去重的鍵是 `challengeId`，**不是**輸入內容的雜湊——
 *   內容雜湊會把兩場合法的不同挑戰誤判成同一場。
 */
export function putInstance(state, instance) {
  if (!instance?.challengeId) return { state, added: false, instance: null };
  const existing = state.instances[instance.challengeId];
  if (existing) return { state, added: false, instance: existing };
  const next = {
    ...state,
    instances: { ...state.instances, [instance.challengeId]: instance },
    order: [instance.challengeId, ...state.order],
  };
  return { state: pruneChallengeState(next), added: true, instance };
}

/**
 * 寫入結果。**冪等**：已結算 ⇒ 原樣返回，不覆蓋。
 *
 * ⚠ 與 `contracts/challengeInstance.js` 的 `settleChallenge` 是**兩層**：
 *   那一支守單一物件的狀態機，這一支守存檔裡的那一筆。
 *   只有其中一層的話，重整之後拿到的是舊物件，狀態機就擋不住了。
 */
export function settleInstance(state, challengeId, result) {
  const cur = state.instances[challengeId];
  if (!cur) return { state, settled: false, alreadySettled: false, instance: null };
  if (cur.status === CHALLENGE_STATES.settled) {
    return { state, settled: false, alreadySettled: true, instance: cur };
  }
  const next = { ...cur, status: CHALLENGE_STATES.settled, result };
  return {
    state: { ...state, instances: { ...state.instances, [challengeId]: next } },
    settled: true, alreadySettled: false, instance: next,
  };
}

/**
 * 修剪：只留最近 `MAX_INSTANCES` 場，並清掉沒有人再引用的快照。
 *
 * ⚠ 我自己的防守快照**永遠保留**（它是現況，不是歷史）。
 */
export function pruneChallengeState(state) {
  const order = state.order.slice(0, MAX_INSTANCES);
  const kept = new Set(order);
  const instances = {};
  for (const id of order) if (state.instances[id]) instances[id] = state.instances[id];

  const referenced = new Set();
  if (state.defense?.hash) referenced.add(state.defense.hash);
  for (const id of kept) {
    const inst = instances[id];
    if (!inst) continue;
    referenced.add(inst.challengerSnapshotHash);
    referenced.add(inst.defenderSnapshotHash);
  }
  const snapshots = {};
  for (const [hash, snap] of Object.entries(state.snapshots)) if (referenced.has(hash)) snapshots[hash] = snap;

  return { ...state, order, instances, snapshots };
}

/** 一場挑戰所需的三樣東西。任何一樣缺了就不可重播（不半途硬跑）。 */
export function challengeBundle(state, challengeId) {
  const instance = state?.instances?.[challengeId] ?? null;
  if (!instance) return { ok: false, reason: "找不到這場挑戰", instance: null, challengerSnapshot: null, defenderSnapshot: null };
  const challengerSnapshot = state.snapshots[instance.challengerSnapshotHash] ?? null;
  const defenderSnapshot = state.snapshots[instance.defenderSnapshotHash] ?? null;
  if (!challengerSnapshot || !defenderSnapshot) {
    return { ok: false, reason: "這場挑戰引用的陣容快照已不在存檔中，無法重播", instance, challengerSnapshot, defenderSnapshot };
  }
  return { ok: true, reason: null, instance, challengerSnapshot, defenderSnapshot };
}

/** 最近的挑戰（最新在前）。 */
export const recentChallenges = (state) =>
  (state?.order ?? []).map((id) => state.instances[id]).filter(Boolean);
