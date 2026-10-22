// ============================================================================
//  battle/moba/liveMatchSetup.js — Live 對戰的 MatchSetup builder（Phase 3a Task 4）
//
//  【是什麼】把 `useLocalServer.start(opts)` 的輸入（GameView 的 opts＋store 快照）轉成一份
//  MatchSetup.v1，之後交給唯一的組裝器 `assembleMatch`。v20 hook 在 start() 裡自己推導的東西
//  （疲勞 loadout、出裝正規化、紅方戰術、各層開關）全部集中在這裡，**純函式**：
//   · 不讀 store／window／location／時鐘／亂數（hook 讀好快照再傳進來；時鐘 fallback seed 留在 hook）。
//   · 同樣的輸入 ⇒ 同樣的 setup ⇒ 同樣的 setup 雜湊（瀏覽器與 Node 相同，browser parity gate 驗）。
//
//  【與 v20 useLocalServer.start（c4b72a5 :147-295）的逐條對應】
//   · loadout   ＝ applyFatigueToLoadout(heroProgress.loadout, players, lineup)        （:153-156）
//   · seed      ＝ normalizeLiveSeed(原始值, seedSource)：session ⇒ `(seed >>> 0) | 1`；local ⇒ `(seed & 0xffff) | 1`
//                  hook 只決定來源並交原始值（session seed 或 Date.now()）；本檔不碰時鐘             （:165-166）
//   · 玩家素質  ＝ buildPlayerStatSlots(players, "blue", lineup)；紅方 []               （:204-206）
//   · roster    ＝ opts.roster 每列只留 { heroId, spells }（v20 adapter 全以 heroId 為準；
//                  列上的 player／hero 中文名／lane 是呈現欄位）                           （:215-263）
//   · 天賦選擇  ＝ 只在 battleTalents 層開時帶；非法 id／別隻英雄的天賦 ⇒ null（＝交給 AI，
//                  v20 的 selectBattleTalents 對查不到的 id 正是這樣處理）                  （:174-176）
//   · 出裝策略  ＝ 只在 items 層開且有 roster 時 normalizeBuildStrategy(opts.buildStrategy)
//                  ⇒ 沒選／非法值 ⇒ "standard"（Live 照舊套標準出裝）                       （:290-291）
//   · 紅方戰術  ＝ 對手 AI 隊伍的 style → mobaTacticForTeamStyle；查不到 ⇒ STANDARD_OPP_TACTIC （:271-272）
//                  兩方都以 legacy 輸入交給組裝器（同一份 MobaTacticConfig 物件）。
//   · layout    ＝ opts.objectiveLayout（恢復進行中的場次）或 null（由 setup 依 seed 推導）（:170）
//
//  【規則集壽命】`resolveLiveRuleset` 在開局時解析一次（hook 把結果寫進 activeMatch.config.ruleset）；
//   恢復時沿用落盤值、不重讀旗標；舊存檔沒有 ⇒ 依目前旗標（＝v20 每次開局讀旗標）。
//   DEV 網址開關（?heroSkillsDev=1／?itemsDev=1）只在 allowTool（hook 傳 import.meta.env.DEV）時生效，
//   而且只在它真的打開了旗標沒開的層時才改用 kind:"tool" 規則集——正式規則集永遠只由旗標決定。
// ============================================================================
import { createMatchSetup } from "../../platform/contracts/matchSetup.js";
import { resolveRulesetForMode, rulesetById, tacticalDirectorModeOf } from "../../platform/contracts/matchRuleset.js";
import { registryRow, rowAvailableUnder } from "../../platform/tactics/capabilityRegistry.js";
import { createTacticPlan } from "../../platform/tactics/tacticPlan.js";
import { leavesOf, nestedOf } from "../../platform/tactics/tacticChoiceMapping.js";
import { bindTacticPlanToCurrentVersions } from "./tactics/tacticResolver.js";
import { OBJECTIVE_LAYOUTS } from "../../platform/contracts/objectiveLayout.js";
import { STANDARD_OPP_TACTIC, mobaTacticForTeamStyle } from "../../platform/contracts/MobaTacticConfig.js";
import { applyFatigueToLoadout, buildPlayerStatSlots } from "./mobaRosterAdapter.js";
import { normalizeBuildStrategy } from "./items/buildStrategyPrep.js";
import { battleTalentOptions } from "./talents/heroBattleTalents.js";

/**
 * 本場用不到的戰術選擇（Phase 3a-C，Owner 2026-10-22）：計畫裡需要某個規則集層（Registry requires，例如每時期型需要 Director core.v1）
 * 但**這一場**的規則集沒有 ⇒ 只從這一場的 binding 拿掉（重新綁定），玩家存在戰術書裡的計畫不動。
 * 擋住兩條旁路：DEV 網址開關改用 balanceTool.v20（static）、恢復進行中場次時旗標已關（沿用落盤 binding）。
 * 沒有要拿掉的 ⇒ 原樣回傳同一個物件（既有輸入逐位元不變）。拿掉後重新建立失敗 ⇒ 原樣回傳（交給組裝器照實拒絕）。
 * @returns {{ binding: object, dropped: Array<{dimension:string, choice:string}> }}
 */
export function bindingForRuleset(binding, ruleset) {
  const mode = tacticalDirectorModeOf(ruleset);
  let leaves;
  try { leaves = leavesOf(binding?.plan?.choices ?? {}); } catch { return { binding, dropped: [] }; }
  const dropped = leaves.filter(([dim]) => { const row = registryRow(dim); return row !== null && !rowAvailableUnder(row, mode); }).map(([dimension, choice]) => ({ dimension, choice: String(choice) }));
  if (!dropped.length) return { binding, dropped: [] };
  const kept = leaves.filter(([dim]) => !dropped.some((d) => d.dimension === dim));
  const created = createTacticPlan({ templateId: binding.plan.templateId, overlayIds: binding.plan.overlayIds ?? [], choices: nestedOf(kept) });
  const rebound = created.ok ? bindTacticPlanToCurrentVersions(created.plan) : null;
  return rebound ? { binding: rebound, dropped } : { binding, dropped: [] };
}

/** Live 一律用生涯規則集（opts.mode 是遊戲模式 "moba"，不是規則集模式；Challenge 不經過 Live hook）。 */
export const LIVE_RULESET_MODE = "career";
const SEATS = Object.freeze(["b1", "b2", "b3", "b4", "b5", "r1", "r2", "r3", "r4", "r5"]);
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * 轉成 setup 接受的純資料：丟掉值為 undefined／函式的物件欄位（與 JSON 落盤相同的語意，
 * v20 adapter 讀「缺欄位」與「undefined」結果相同）。NaN 等非法值保留 ⇒ 交給 createMatchSetup 拒絕。
 */
function toPlainData(v) {
  if (Array.isArray(v)) return v.map(toPlainData);
  if (isPlainObject(v)) {
    const out = {};
    for (const k of Object.keys(v)) if (v[k] !== undefined && typeof v[k] !== "function") out[k] = toPlainData(v[k]);
    return out;
  }
  return v;
}

/**
 * 引擎 seed 正規化（v20 useLocalServer:165-166 的兩個分支，逐字相同）。
 *  · session：權威 seed `(raw >>> 0) | 1`——同一個 session seed 永遠映射到同一個引擎 seed（引擎要求奇數）。
 *  · local  ：沒有 session 時 hook 交來的時鐘值，取低 16 位 `(raw & 0xffff) | 1`。
 * 純函式：時鐘只在 hook 讀，這裡只做算術。
 */
export function normalizeLiveSeed(rawSeed, seedSource) {
  return seedSource === "session" ? ((rawSeed >>> 0) | 1) : ((rawSeed & 0xffff) | 1);
}

/** 本場進行中的設定（activeMatch.config）；只認同一個 sessionId。純讀取，不改傳入物件。 */
export function persistedLiveConfigOf(session, sessionId) {
  if (!sessionId || !isPlainObject(session) || session.sessionId !== sessionId) return null;
  const config = session.activeMatch?.config;
  return isPlainObject(config) ? config : null;
}

/** 落盤的 ruleset 能不能沿用：必須是已登錄規則集的合法（旗標關閉）版本——以 createMatchSetup 的鎖定規則判定。 */
function usablePersistedRuleset(persisted, allowTool) {
  if (!isPlainObject(persisted) || !rulesetById(persisted.rulesetId)) return false;
  if (persisted.kind !== "production" && !(allowTool && persisted.kind === "tool")) return false;
  return createMatchSetup({ ruleset: persisted, seed: 1, meta: { seedSource: "local" } }).ok;
}

/** DEV 專用：在 tool 規則集上重現「旗標 OR 網址開關」（字串層依 Live：藍方素質、AI 隊伍戰術）。 */
function liveDevToolRuleset(flags, dev) {
  const tool = rulesetById("balanceTool.v20");
  const on = (f) => flags?.[f] === true;
  const skills = on("heroSkillsV1") || dev.heroSkills === true;
  return {
    ...tool,
    layers: { ...tool.layers, heroSkills: skills, heroPassives: skills, heroPowerCurve: skills,
      battleTalents: skills && on("heroBattleTalentsV1"), items: on("itemsV1") || dev.items === true,
      playerStatSides: "blue", redTactic: "styleTemplate" },
    releaseRequirements: [],
  };
}

/**
 * 決定這一場的規則集。
 * @param {object}  a
 * @param {object}  a.flags      FEATURE_FLAGS（hook 傳入；本函式不 import featureFlags）
 * @param {object}  [a.persisted] activeMatch.config.ruleset（恢復時）
 * @param {object}  [a.dev]       { heroSkills, items }：DEV 網址開關（正式 build 由 hook 傳 null）
 * @param {boolean} [a.allowTool] 只有 import.meta.env.DEV 為 true
 * @returns {{ ruleset: object, source: "persisted"|"flags"|"dev" }}
 */
export function resolveLiveRuleset({ flags, persisted = null, dev = null, allowTool = false } = {}) {
  if (persisted !== null && usablePersistedRuleset(persisted, allowTool)) return { ruleset: persisted, source: "persisted" };
  const base = resolveRulesetForMode({ mode: LIVE_RULESET_MODE, flags });
  if (allowTool && dev && ((dev.heroSkills === true && !base.layers.heroSkills) || (dev.items === true && !base.layers.items)))
    return { ruleset: liveDevToolRuleset(flags, dev), source: "dev" };
  return { ruleset: base, source: "flags" };
}

/** 天賦選擇正規化：只留席位鍵；不是該席位英雄的天賦 ⇒ null（交給 AI）。全空 ⇒ null。 */
function normalizeTalentSelections(selections, roster) {
  if (!isPlainObject(selections) || !roster) return null;
  const out = {};
  for (const seat of SEATS) {
    if (!(seat in selections)) continue;
    const id = selections[seat];
    const options = battleTalentOptions(roster[seat]?.heroId);
    out[seat] = typeof id === "string" && options.some((o) => o.id === id) ? id : null;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * @param {object} a
 * @param {object} a.opts          useLocalServer.start 的 opts（GameView 傳入）
 * @param {object} a.profile       { players, lineup }：profileStore 快照
 * @param {object} a.heroProgress  { loadout }：heroProgressStore.getLoadout() 的輸出
 * @param {object} [a.ruleset]     resolveLiveRuleset 的結果（開局解析一次／恢復沿用）；未給 ⇒ 依 flags 解析
 * @param {object} [a.flags]       未給 ruleset 時用
 * @param {object} [a.opponentTeam] aiTeamById(opts.opponentId) 的結果（只讀 style）
 * @param {number} a.seed          **原始** seed：session ⇒ MatchSession 的權威 seed；local ⇒ hook 讀到的時鐘值。
 *                                 正規化（奇數化）在這裡做，見 normalizeLiveSeed；setup.seed 才是引擎 seed。
 * @param {"session"|"local"} a.seedSource
 * @returns {{ ok: boolean, setup: object|null, errors: object[], buildStrategy: string|null, notes: string[] }}
 */
export function buildLiveMatchSetup({ opts = {}, profile = {}, heroProgress = {}, ruleset = null, flags = null, opponentTeam = null, seed: rawSeed, seedSource } = {}) {
  const seed = normalizeLiveSeed(rawSeed, seedSource);
  const rs = ruleset ?? resolveLiveRuleset({ flags }).ruleset;
  const L = rs.layers ?? {};
  const isTool = rs.kind === "tool";
  const notes = [];
  const players = profile.players ?? [];
  const lineup = profile.lineup ?? null;

  const roster = opts.roster
    ? Object.fromEntries(Object.entries(opts.roster).map(([seat, row]) => [seat, {
      heroId: row?.heroId, ...(Array.isArray(row?.spells) ? { spells: [...row.spells] } : {}),
    }]))
    : null;
  const talentSelections = L.battleTalents === true && roster ? normalizeTalentSelections(opts.talentSelections, roster) : null;
  const buildStrategy = L.items === true && roster ? normalizeBuildStrategy(opts.buildStrategy) : null;
  const redTactic = opponentTeam ? mobaTacticForTeamStyle(opponentTeam.style) : STANDARD_OPP_TACTIC;
  const explicitLayout = OBJECTIVE_LAYOUTS.includes(opts.objectiveLayout) ? opts.objectiveLayout : null;
  //  本場規則集用不到的戰術選擇只從本場拿掉（見 bindingForRuleset）；記在 notes，存檔的戰術書不動。
  const blueBinding = opts.tacticPlanBinding ? bindingForRuleset(toPlainData(opts.tacticPlanBinding), rs) : null;
  if (blueBinding?.dropped.length) notes.push(`tactic.blue: dropped ${blueBinding.dropped.map((d) => `${d.dimension}=${d.choice}`).join(", ")} (needs a ruleset layer this match does not have; saved plan unchanged)`);

  const input = {
    ruleset: rs,
    seed,
    objectiveLayout: explicitLayout,
    loadout: toPlainData(applyFatigueToLoadout(heroProgress.loadout ?? null, players, lineup)),
    playerSlots: toPlainData({ blue: buildPlayerStatSlots(players, "blue", lineup), red: [] }),
    roster,
    talentSelections,
    tactic: {
      //  Phase 3a T12：戰術書的 binding 優先；沒有 binding 才走 v1 戰術物件（舊進行中場次的恢復路徑，結果＝v20）。
      //  binding 不合法 ⇒ 組裝器照實拒絕，不退回 legacy 戰術偷偷開打。
      blue: blueBinding ? { kind: "binding", binding: blueBinding.binding }
        : opts.tactic?.tacticId ? { kind: "legacy", config: toPlainData(opts.tactic) } : null,
      red: { kind: "legacy", config: toPlainData(redTactic) },
    },
    ...(isTool
      ? (buildStrategy ? { tool: { itemsStrategies: { blue: buildStrategy, red: "standard" } } } : {})
      : { buildStrategy }),
    meta: { sessionId: opts.sessionId ?? null, mode: opts.mode ?? null, opponentId: opts.opponentId ?? null, seedSource },
  };
  let r = createMatchSetup(input);
  //  沒有 session seed 的「恢復」：v20 會拿一個新的時鐘 seed，本來就不是同一場；存檔的 layout 若與新 seed
  //  推導不符 ⇒ 依新 seed 推導（記在 notes），不讓開局失敗。session seed 時同樣的衝突代表存檔被改過 ⇒ 照實拒絕。
  if (!r.ok && seedSource === "local" && explicitLayout !== null && r.errors.some((e) => e.code === "objective_layout_conflict")) {
    notes.push(`objectiveLayout ${explicitLayout} dropped: it disagrees with the local fallback seed ${seed}`);
    r = createMatchSetup({ ...input, objectiveLayout: null });
  }
  return { ok: r.ok, setup: r.setup, errors: r.errors, buildStrategy, notes };
}
