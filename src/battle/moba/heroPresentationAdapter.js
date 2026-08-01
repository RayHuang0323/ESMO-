// ============================================================================
//  battle/moba/heroPresentationAdapter.js — Hero Combat Presentation Adapter
//                                            （Milestone L）
//
//  把「引擎說發生了什麼」翻譯成「畫面上該播哪個演出模板」。純 JS：
//  不 import React / three / zustand，Node verifier 可以直接跑。
//
//  ── 這支做什麼、不做什麼 ─────────────────────────────────────────────────
//   做：解析 caster → heroId、決定演出模板（八選一）、附上主題色與強調程度，
//       回傳**新物件**。
//   不做：不決定傷害、不決定命中、不改事件順序、不改 timestamp、
//        不寫回原始 event、不碰 Replay 原始資料。
//   ⇒ 即時 Battle / Timeline / Replay / HUD callout 全部吃同一份輸出。
//
//  ── ⚠ 引擎沒有 Q/W/E/R（Milestone L Audit 實測）──────────────────────────
//    引擎 fx 的 `ability` 只有 `{role}:basic` / `{role}:power` / `tower:basic` /
//    `neutral:*` / `boss:*` / `buff:*` / null 這幾種。所以本檔的映射只有兩條規則：
//        basic  → 該英雄的 basicAttack 演出
//        power  → 該英雄的 signatureSlot 演出
//    輸出一律標上 `basis`（推導依據）與 `isActualSkillCast: false`，
//    UI 因此**不可能**寫出「他放了 Q」這種引擎沒說過的話。
//    這個誠實邊界由 tools/check_hero_presentation_l.mjs §4 把關。
// ============================================================================
import {
  getHeroCombatPresentation, getHeroSkillPresentation, getHeroPresentationTheme,
  ARCHETYPE_LABEL, PRESENTATION_ARCHETYPES,
} from "../../data/heroCombatPresentation.js";
//  Milestone M1：近戰／遠程與站位線位一併帶進呈現描述。
//  **只補欄位**，不改 Milestone L 的演出分類（archetype / label / basis 一字未動）。
import { getHeroCombatArchetype } from "../../data/heroCombatArchetypes.js";

export const PRESENTATION_ADAPTER_VERSION = "heroPresentation.adapter.v1";

/** 非英雄來源（塔／中立／首領／buff）也要有穩定演出，畫面不會空白。 */
export const NON_HERO_PRESENTATION = Object.freeze({
  tower: Object.freeze({ archetype: "projectile", effect: "arcane", label: "塔攻擊" }),
  neutral: Object.freeze({ archetype: "line", effect: "earth", label: "野怪" }),
  boss: Object.freeze({ archetype: "ultimate", effect: "arcane", label: "首領" }),
  buff: Object.freeze({ archetype: "shield", effect: "holy", label: "增益" }),
});

/**
 * roster[playerId] → heroId。
 *
 * ⚠ roster 在這個專案裡**有三種形狀**，三種都要吃：
 *   1. `{ hero: { id } }`  —— buildBattleRoster 的完整 entry
 *   2. `{ heroId }`        —— 精簡 entry
 *   3. **英雄物件本身**（`{ id, zh, arch, ... }`）—— `useGameStore.roster`
 *      是 Hero Mapping 的 `{ playerId: championObject }`（見 useGameStore.js:20）
 *
 * 第 3 種是實測踩到的：`?debug=moba-runtime-battle` 沒有 roster prop ⇒
 * 退回 store 的 roster ⇒ 整場對戰一個 callout 都出不來。
 * 既有的 `mobaRuntimeMapAdapter` 本來就吃三種（`?.hero?.id ?? ?.heroId ?? ?.id`），
 * 這裡對齊它，避免兩處對同一份 roster 有兩套解讀。
 */
export function resolveHeroId(sourceId, roster) {
  if (!sourceId || !roster) return null;
  const e = roster[sourceId];
  if (!e || typeof e !== "object") return null;
  const id = e.hero?.id ?? e.heroId ?? e.id ?? null;
  return typeof id === "string" && id ? id : null;
}

/** `ability` 字串 → { group, variant }。`null` / 壞字串一律回穩定預設。 */
export function parseAbility(ability) {
  if (typeof ability !== "string" || !ability) return { group: null, variant: "basic" };
  const i = ability.indexOf(":");
  if (i < 0) return { group: ability, variant: "basic" };
  return { group: ability.slice(0, i), variant: ability.slice(i + 1) || "basic" };
}

const NON_HERO_GROUPS = new Set(["tower", "neutral", "boss", "buff"]);

/**
 * 把一筆引擎 fx 事件翻譯成演出描述。**不修改輸入**。
 *
 * @returns 凍結的 presentation 描述：
 *   { heroId, source, archetype, effect, emphasis, label, basis,
 *     isActualSkillCast, isUltimate, theme, cameraEmphasis, performanceTier, slot }
 */
export function describeFxPresentation(fx, roster = null) {
  const { group, variant } = parseAbility(fx?.ability);
  const isUlt = fx?.type === "ult";

  //  非英雄來源：塔／野怪／首領／buff。不查 roster，也不假裝有英雄。
  if (group && NON_HERO_GROUPS.has(group)) {
    const nh = NON_HERO_PRESENTATION[group];
    return Object.freeze({
      heroId: null, source: `engine:${group}`,
      archetype: group === "boss" ? "ultimate" : nh.archetype,
      effect: nh.effect, emphasis: group === "boss" ? "ultimate" : "normal",
      combatClass: null,
      label: nh.label, basis: `engine:${group}:${variant}`,
      isActualSkillCast: false, isUltimate: group === "boss",
      theme: null, cameraEmphasis: "none", performanceTier: "light", slot: null,
    });
  }

  const heroId = resolveHeroId(fx?.sourceId, roster);
  const p = getHeroCombatPresentation(heroId);
  const power = variant === "power" || isUlt;
  //  ⚠ 只有兩條映射規則，因為引擎只給得出這兩種資訊。
  const slot = power ? p.signatureSlot : null;
  const spec = power ? getHeroSkillPresentation(heroId, p.signatureSlot) : p.basicAttack;
  const archetype = spec.archetype;
  return Object.freeze({
    heroId: heroId ?? null,
    source: p.source,                       // authored | fallback
    //  L Hotfix 1 §4：職業決定 shape language（形狀／速度／節奏），不只顏色。
    combatClass: heroId ? p.combatClass : null,
    //  M1：近戰／遠程與站位線位（供 UI 標示；**不影響演出分類的選擇**）
    attackType: heroId ? getHeroCombatArchetype(heroId).attackType : null,
    positionRole: heroId ? getHeroCombatArchetype(heroId).formationLine : null,
    archetype,
    effect: spec.effect,
    emphasis: power ? (spec.emphasis ?? "signature") : "normal",
    label: ARCHETYPE_LABEL[archetype] ?? ARCHETYPE_LABEL.line,
    //  basis 說清楚這個演出是從哪個引擎欄位推出來的 ⇒ 不可能被誤讀成真實施放
    basis: power ? "engine:power" : "engine:basic",
    isActualSkillCast: false,
    isUltimate: power && (spec.emphasis === "ultimate" || archetype === "ultimate"),
    theme: heroId ? getHeroPresentationTheme(heroId) : null,
    cameraEmphasis: power ? p.cameraEmphasis : "none",
    performanceTier: p.performanceTier,
    slot,
  });
}

/**
 * 產生**新的** presentation event。原始 event 一個欄位都不動。
 * timestamp（at / ts）與身分（id / sourceId / targetId）原封保留。
 */
export function toPresentationEvent(fx, roster = null) {
  if (!fx || typeof fx !== "object") return null;
  return Object.freeze({
    ...fx,
    presentation: describeFxPresentation(fx, roster),
  });
}

/** 批次版本：順序不變、長度不變、逐筆都是新物件。 */
export function toPresentationEvents(list, roster = null) {
  if (!Array.isArray(list)) return [];
  return list.map((fx) => toPresentationEvent(fx, roster));
}

//  ── Timeline / HUD callout 用 ─────────────────────────────────────────────
//  Timeline 事件（battleEvents.js）與 fx 是兩條不同的流：fx 是特效，
//  Timeline 是「擊殺／拆塔／大龍」這種戰報。兩邊共用同一份英雄主題與文案來源。

/** Timeline 事件裡「主角是誰」——不同事件型別的主角欄位不一樣。 */
export function timelineActorId(ev) {
  if (!ev || typeof ev !== "object") return null;
  const d = ev.data ?? null;
  return d?.killer ?? d?.playerId ?? d?.receiver ?? null;
}

/** 哪些 Timeline 事件值得掛英雄頭像與主題色。 */
const PORTRAIT_TYPES = new Set(["KILL", "FIRST_BLOOD", "MULTI_KILL", "SPELL_USED"]);
/** 哪些 Timeline 事件要有「大場面」標記。 */
const HIGHLIGHT_TYPES = new Set(["MULTI_KILL", "ACE", "BARON_SLAIN", "DRAGON_SLAIN", "VICTORY"]);

/**
 * Timeline 事件 → 呈現描述（頭像、主題色、是否高亮）。**不修改輸入事件**。
 * 找不到英雄 ⇒ heroId null、theme null，由 UI 顯示 fallback，不留空白。
 */
export function describeTimelinePresentation(ev, roster = null) {
  const actorId = timelineActorId(ev);
  const heroId = resolveHeroId(actorId, roster);
  const p = heroId ? getHeroCombatPresentation(heroId) : null;
  return Object.freeze({
    actorId: actorId ?? null,
    heroId: heroId ?? null,
    source: p?.source ?? "none",
    theme: heroId ? getHeroPresentationTheme(heroId) : null,
    showPortrait: PORTRAIT_TYPES.has(ev?.type) && !!heroId,
    isHighlight: HIGHLIGHT_TYPES.has(ev?.type),
    //  大招標記：Timeline 沒有「英雄放大招」這種引擎事件（引擎不模擬技能），
    //  所以這裡只標「大場面」，並且在 UI 明說它是團隊級事件，不是某人的 R。
    highlightKind: HIGHLIGHT_TYPES.has(ev?.type) ? (ev?.type ?? null) : null,
  });
}

//  ── L Hotfix 1 §2：callout 降低干擾 ───────────────────────────────────────
//  原本桌機 3／手機 2、只要 signature 以上就跳，實際看起來還是太吵：
//  一場團戰同一隻英雄會連續洗版。三道閘門：
//    1. 普攻（emphasis normal/passive）**永遠不跳**
//    2. 只有「看得出戰術意義」的演出分類才跳（見 CALLOUT_ARCHETYPES）
//    3. 同一隻英雄的同一種演出，冷卻窗內只留最新一筆
/** 同時活著的 callout 上限。桌機 2、手機 1。 */
export const CALLOUT_LIMIT = Object.freeze({ desktop: 2, mobile: 1 });
/** 值得打斷觀眾注意力的演出分類。普通彈道／貫穿（＝多半是普攻）不在內。 */
export const CALLOUT_ARCHETYPES = Object.freeze(["control", "shield", "heal", "area", "ultimate", "dash"]);
/** 同英雄同分類的去重窗（模擬秒）。規格要求 3～5 秒，取中間值。 */
export const CALLOUT_DEDUPE_SEC = 4;

/**
 * 從 presentation event 流挑出「值得跳 callout」的幾筆。
 * 決定性：同樣輸入永遠同樣輸出（只依 at / id 排序，不用亂數、不看牆鐘）。
 */
export function pickCallouts(events, { mobile = false, limit = null, dedupeSec = CALLOUT_DEDUPE_SEC } = {}) {
  const cap = limit ?? (mobile ? CALLOUT_LIMIT.mobile : CALLOUT_LIMIT.desktop);
  const worthy = (Array.isArray(events) ? events : []).filter((e) => {
    const p = e?.presentation;
    if (!p?.heroId) return false;
    //  ① 普攻不跳：basic 推導出來的演出一律 emphasis normal
    if (p.emphasis !== "signature" && p.emphasis !== "ultimate" && !p.isUltimate) return false;
    //  ② 只留看得出戰術意義的分類
    return CALLOUT_ARCHETYPES.includes(p.archetype);
  });
  //  新的排前面（同時間比 id，確保決定性）
  worthy.sort((a, b) => (b.at ?? 0) - (a.at ?? 0) || String(b.id).localeCompare(String(a.id)));
  //  ③ 同英雄同分類去重：窗內只留最新的那一筆
  const kept = [];
  const lastAt = new Map();
  for (const e of worthy) {
    const key = `${e.presentation.heroId}:${e.presentation.archetype}`;
    const prev = lastAt.get(key);
    if (prev != null && Math.abs(prev - (e.at ?? 0)) < dedupeSec) continue;
    lastAt.set(key, e.at ?? 0);
    kept.push(e);
    if (kept.length >= cap) break;
  }
  return kept;
}

/** renderer 只認得這八個字；給 verifier 與 gallery 用的白名單再輸出一次。 */
export const SUPPORTED_TEMPLATES = PRESENTATION_ARCHETYPES;
