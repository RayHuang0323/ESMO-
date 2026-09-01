// ============================================================================
//  platform/mastery/clubMastery.js — Mastery Track / 資格 / 領取 / 解鎖
//                                     （ClubMasteryTrack.v1，V7-2.9 / Task 5）
//
//  ── track 條件只用既有的 canonical 計數 ───────────────────────────────────
//  `doctrineProgress` / `tacticUsage` / `tacticIntent` 都已經在
//  `clubMasteryState.js` 累積了，本檔**不新增任何事件流**，只是把它們讀成
//  「這條 track 完成了沒有」。快速練習的排除也是繼承來的——
//  `recordTacticUsage` 在來源是 practice 時直接返回，所以練習根本進不了計數，
//  這裡不需要、也不應該再判一次「什麼算練習」。
//
//  ── 為什麼門檻刻意很低 ────────────────────────────────────────────────────
//  第一版要證明的是**閉環會動**，不是耐力。門檻拉長只會讓「這套設計好不好玩」
//  這個問題更晚才被回答。數值一律 provisional，未經校準，不得標為 FINAL。
//
//  ── 三條 track 刻意問三種不同的問題 ───────────────────────────────────────
//  如果三條都是「做同一件事 N 次」，doctrine 就只是換了名字的同一個進度條。
//    · 強攻 → **深度**：能不能反覆把速攻打成它該有的樣子
//    · 控圖 → **廣度**：該流派的每一個戰術都要能執行
//    · 應變 → **穩定**：打得夠多，而且其中有一定比例是照計畫走的
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { DOCTRINE, doctrineOfTactic, isDoctrineId } from "./doctrine.js";
import { doctrineProgressOf, normalizeClubMastery } from "./clubMasteryState.js";
import { TACTIC_VARIANTS, variantById } from "./tacticVariant.js";
import { tacticsOfDoctrine } from "./doctrine.js";

export const CLUB_MASTERY_TRACK_VERSION = "ClubMasteryTrack.v1";

/**
 * 條件種類。**未知種類一律 fail closed**（見 `evaluateRequirement`）——
 * 新增一種而忘了實作，結果會是「永遠不完成」，不是「直接送」。
 */
export const REQUIREMENT_KINDS = Object.freeze({
  /** 該流派「意圖達成」的場次。 */
  DOCTRINE_INTENT: "doctrineIntent",
  /** 該流派底下**有幾個不同戰術**至少各達成過一次意圖。 */
  DOCTRINE_TACTIC_BREADTH: "doctrineTacticBreadth",
  /** 該流派的總場次與其中的意圖場次都要達標。 */
  DOCTRINE_MATCHES_AND_INTENT: "doctrineMatchesAndIntent",
});

/** 第一版三條 track。⚠ 門檻 provisional，未經校準。 */
export const MASTERY_TRACKS = Object.freeze([
  Object.freeze({
    trackId: "tempo_execution",
    doctrine: DOCTRINE.TEMPO,
    name: "速攻執行",
    desc: "把強攻系戰術打出它該有的樣子 3 次",
    requirement: Object.freeze({ kind: REQUIREMENT_KINDS.DOCTRINE_INTENT, count: 3 }),
    reward: Object.freeze({ kind: "tacticVariant", variantId: "m1_measured_siege" }),
  }),
  Object.freeze({
    trackId: "control_breadth",
    doctrine: DOCTRINE.CONTROL,
    name: "控圖全能",
    desc: "控圖系的每一個戰術都至少打出過一次它該有的樣子",
    requirement: Object.freeze({ kind: REQUIREMENT_KINDS.DOCTRINE_TACTIC_BREADTH, minTactics: 2 }),
    reward: Object.freeze({ kind: "tacticVariant", variantId: "m4_contested_stack" }),
  }),
  Object.freeze({
    trackId: "adaptive_consistency",
    doctrine: DOCTRINE.ADAPTIVE,
    name: "應變穩定度",
    desc: "應變系打滿 4 場，其中 2 場照計畫走",
    requirement: Object.freeze({ kind: REQUIREMENT_KINDS.DOCTRINE_MATCHES_AND_INTENT, matches: 4, intent: 2 }),
    reward: Object.freeze({ kind: "tacticVariant", variantId: "m8_early_footing" }),
  }),
]);

export const trackById = (id) => MASTERY_TRACKS.find((t) => t.trackId === id) ?? null;
export const tracksOfDoctrine = (doctrineId) => MASTERY_TRACKS.filter((t) => t.doctrine === doctrineId);

/**
 * 算一條條件的進度。
 * ⚠ **fail closed**：未知 kind、壞掉的參數 ⇒ `{ progress: 0, target: 1, done: false }`。
 */
export function evaluateRequirement(mastery, doctrineId, requirement) {
  const miss = { progress: 0, target: 1, done: false, unknown: true };
  if (!requirement || typeof requirement !== "object" || !isDoctrineId(doctrineId)) return miss;
  const M = normalizeClubMastery(mastery);
  const prog = doctrineProgressOf(M, doctrineId);

  switch (requirement.kind) {
    case REQUIREMENT_KINDS.DOCTRINE_INTENT: {
      const target = Math.floor(Number(requirement.count));
      if (!Number.isFinite(target) || target <= 0) return miss;
      return { progress: Math.min(prog.intent, target), target, done: prog.intent >= target, unknown: false };
    }
    case REQUIREMENT_KINDS.DOCTRINE_TACTIC_BREADTH: {
      const target = Math.floor(Number(requirement.minTactics));
      if (!Number.isFinite(target) || target <= 0) return miss;
      //  只算**屬於這條流派**的戰術 —— 用別派的戰術達成意圖不能算進來。
      const owned = tacticsOfDoctrine("moba", doctrineId);
      const hit = owned.filter((id) => (M.tacticIntent.moba[id] ?? 0) > 0).length;
      return { progress: Math.min(hit, target), target, done: hit >= target, unknown: false };
    }
    case REQUIREMENT_KINDS.DOCTRINE_MATCHES_AND_INTENT: {
      const mTarget = Math.floor(Number(requirement.matches));
      const iTarget = Math.floor(Number(requirement.intent));
      if (!Number.isFinite(mTarget) || !Number.isFinite(iTarget) || mTarget <= 0 || iTarget <= 0) return miss;
      const done = prog.matches >= mTarget && prog.intent >= iTarget;
      //  進度條顯示用兩段合計，讓玩家看得到自己卡在哪一段。
      return {
        progress: Math.min(prog.matches, mTarget) + Math.min(prog.intent, iTarget),
        target: mTarget + iTarget,
        done,
        unknown: false,
        parts: { matches: prog.matches, matchesTarget: mTarget, intent: prog.intent, intentTarget: iTarget },
      };
    }
    default:
      return miss;
  }
}

/** 這個變體解鎖了沒有。 */
export const isVariantUnlocked = (mastery, variantId) =>
  normalizeClubMastery(mastery).unlockedVariants.includes(variantId);

/**
 * 一條 track 現在能不能領。**唯一的資格判定處**，UI 不得自己拼條件。
 *
 * @returns {{ok:boolean, reason:string|null, code:string|null, track:object|null, progress:object}}
 */
export function masteryEligibilityOf(mastery, trackId) {
  const M = normalizeClubMastery(mastery);
  const track = trackById(trackId);
  const nil = { progress: { progress: 0, target: 1, done: false } };
  //  未知 track ⇒ fail closed（不是「還沒完成」，是根本不存在）
  if (!track) return { ok: false, code: "unknown_track", reason: `沒有這條 track：${trackId}`, track: null, ...nil };

  const progress = evaluateRequirement(M, track.doctrine, track.requirement);
  const base = { track, progress };

  //  獎勵必須認得 —— 未知獎勵種類一律拒絕，寧可不發也不亂發。
  if (track.reward?.kind !== "tacticVariant" || !variantById(track.reward.variantId)) {
    return { ok: false, code: "unknown_reward", reason: "這條 track 的獎勵無法解析", ...base };
  }
  if (M.claims[trackId]) {
    return { ok: false, code: "already_claimed", reason: "這條 track 已經領過了", ...base };
  }
  //  ⚠ 必須是目前的 Active Doctrine。進度本來就只在該流派為 active 時累積，
  //    領取也一併綁在同一條規則上，才不會出現「進度與領取兩套資格」。
  if (M.activeDoctrine !== track.doctrine) {
    return { ok: false, code: "not_active", reason: `要先把流派切換到「${track.doctrine}」才能領取`, ...base };
  }
  if (!progress.done) {
    return { ok: false, code: "incomplete", reason: "條件還沒完成", ...base };
  }
  if (isVariantUnlocked(M, track.reward.variantId)) {
    return { ok: false, code: "already_unlocked", reason: "這個變體已經解鎖了", ...base };
  }
  return { ok: true, code: null, reason: null, ...base };
}

/**
 * 領取一條 track 的獎勵。
 *
 * ⚠ 冪等沿用 `claimObjective` 的形狀：先看 `claims`，領過就直接拒絕且
 *   **完全不改狀態**。與那邊唯一的差別是 `claims` **不 prune**——
 *   生涯進度不會因為換日就消失。
 *
 * @returns {{ok:boolean, mastery:object, unlockedVariantId:string|null, reason:string|null}}
 */
export function claimMasteryReward(mastery, trackId) {
  const M = normalizeClubMastery(mastery);
  const elig = masteryEligibilityOf(M, trackId);
  if (!elig.ok) return { ok: false, mastery: M, unlockedVariantId: null, reason: elig.reason };

  const variantId = elig.track.reward.variantId;
  return {
    ok: true,
    reason: null,
    unlockedVariantId: variantId,
    mastery: {
      ...M,
      claims: { ...M.claims, [trackId]: true },
      unlockedVariants: [...new Set([...M.unlockedVariants, variantId])].sort(),
    },
  };
}

/**
 * 這個變體現在能不能上場。
 *
 * 兩個條件：**已解鎖** ＋ **屬於目前的 Active Doctrine**。
 * ⚠ 第二個條件就是 progression focus：擁有 ≠ 能用。切換流派不會刪除任何
 *   已解鎖的東西，只是這一刻能派上場的是另一套。
 */
export function canEquipVariant(mastery, variantId) {
  const M = normalizeClubMastery(mastery);
  const v = variantById(variantId);
  if (!v) return { ok: false, code: "unknown_variant", reason: `沒有這個變體：${variantId}` };
  if (!isVariantUnlocked(M, variantId)) return { ok: false, code: "locked", reason: "尚未解鎖" };
  if (M.activeDoctrine !== v.doctrine) {
    return { ok: false, code: "wrong_doctrine", reason: `這是「${v.doctrine}」流派的變體，目前流派不同` };
  }
  return { ok: true, code: null, reason: null };
}

/**
 * 某個基礎戰術**現在**可以用的東西。
 *
 * ⚠ `basic` 永遠是 `true`：m1–m8 不受流派、不受解鎖影響，一律可用。
 *   這是產品紅線，寫在這裡讓呼叫端不必自己記得。
 */
export function variantsAvailableForTactic(mastery, tacticId) {
  const M = normalizeClubMastery(mastery);
  const doctrine = doctrineOfTactic("moba", tacticId);
  const variants = TACTIC_VARIANTS
    .filter((v) => v.baseTacticId === tacticId)
    .map((v) => ({
      variantId: v.variantId,
      name: v.name,
      doctrine: v.doctrine,
      unlocked: isVariantUnlocked(M, v.variantId),
      equippable: canEquipVariant(M, v.variantId).ok,
    }));
  return { tacticId, doctrine, basic: true, variants };
}

/** 目前這一刻真的能派上場的全部變體。 */
export const equippableVariants = (mastery) =>
  TACTIC_VARIANTS.filter((v) => canEquipVariant(mastery, v.variantId).ok);

/** 畫面用的總覽。**推導，不落盤。** */
export function masteryViewOf(mastery) {
  const M = normalizeClubMastery(mastery);
  return {
    schema: CLUB_MASTERY_TRACK_VERSION,
    activeDoctrine: M.activeDoctrine,
    unlockedVariants: M.unlockedVariants,
    tracks: MASTERY_TRACKS.map((t) => {
      const e = masteryEligibilityOf(M, t.trackId);
      return {
        trackId: t.trackId, name: t.name, desc: t.desc, doctrine: t.doctrine,
        reward: t.reward,
        progress: e.progress.progress, target: e.progress.target, done: e.progress.done,
        claimed: Boolean(M.claims[t.trackId]),
        claimable: e.ok,
        blockedBy: e.ok ? null : e.code,
      };
    }),
  };
}
