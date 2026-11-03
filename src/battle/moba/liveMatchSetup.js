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
import { resolveRulesetForMode, rulesetById, tacticalDirectorModeOf, templateBalanceOf } from "../../platform/contracts/matchRuleset.js";
import { MEASURED_EXCLUSIONS, registryRow, rowAvailableUnder } from "../../platform/tactics/capabilityRegistry.js";
import { createTacticPlan } from "../../platform/tactics/tacticPlan.js";
import { leavesOf, nestedOf } from "../../platform/tactics/tacticChoiceMapping.js";
import { bindTacticPlanToCurrentVersions } from "./tactics/tacticResolver.js";
import { OBJECTIVE_LAYOUTS } from "../../platform/contracts/objectiveLayout.js";
import { STANDARD_OPP_TACTIC, mobaTacticForTeamStyle, mobaTacticById } from "../../platform/contracts/MobaTacticConfig.js";
import { templateById, templateConfigFor, classicLegacyTemplateOf, templateCopyFor, TEMPLATE_BALANCE } from "../../platform/tactics/tacticTemplates.js";
import { applyVariant, variantById } from "../../platform/mastery/tacticVariant.js";
import { aiCoachPlan } from "../../platform/tactics/aiCoach.js";
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
  //  兩種「本場用不到」：需要本場沒有的規則集層（requires），或只在本場模式生效的量測排除（scope，跨版本證據隔離：v20 不用 v21 證據）。
  //  直接找「帶本場模式 scope」的列（不靠 measuredExclusion 回傳的第一筆：同一選擇若另有不分模式的模板列，順序不得影響結果）。
  const tpl = binding?.plan?.templateId;
  const scopedOut = (dim, choice) => MEASURED_EXCLUSIONS.some((x) => x.scope === mode && x.dimension === dim && x.choice === String(choice) && (x.template === "*" || x.template === tpl));
  const dropped = leaves.filter(([dim, choice]) => { const row = registryRow(dim); return row !== null && (!rowAvailableUnder(row, mode) || scopedOut(dim, choice)); }).map(([dimension, choice]) => ({ dimension, choice: String(choice) }));
  if (!dropped.length) return { binding, dropped: [] };
  const kept = leaves.filter(([dim]) => !dropped.some((d) => d.dimension === dim));
  const created = createTacticPlan({ templateId: binding.plan.templateId, overlayIds: binding.plan.overlayIds ?? [], choices: nestedOf(kept) });
  const rebound = created.ok ? bindTacticPlanToCurrentVersions(created.plan) : null;
  return rebound ? { binding: rebound, dropped } : { binding, dropped: [] };
}

/**
 * Phase 3a-B 第一階段（Owner 2026-10-30 第 4 點；事前登記 stage1_release_registration_3aB.json I5）：legacy 戰術（v20 戰術畫面確認的、
 * 或 AI 教練排不出計畫時的風格模板）在帶 templateBalance 的規則集下套用模板修正表——**由 id 重建**：修正後的經典模板設定，
 * 有變體就再套變體（修正在變體之前，與戰術書的「模板 → 覆蓋層 → 選擇」同一個順序）。結果只由 id 決定 ⇒ 套兩次＝套一次。
 * 沒有修正表、或這個戰術不在表裡 ⇒ 原樣回傳同一個物件。tables 可注入（gate 觀察順序用）。
 */
export function balancedLegacyTactic(config, templateBalance, tables = TEMPLATE_BALANCE) {
  if (!templateBalance || !config?.tacticId) return config;
  //  審查（實作）：只有**確實是**經典模板（＋變體）的設定才重建——出貨版的，或已經是修正後的（冪等）。帶經典 tacticId 的其他設定
  //  （例如 v2 模板的顯示物件）原樣回傳，不被換成經典。
  const templateId = classicLegacyTemplateOf(config, null, tables) ?? classicLegacyTemplateOf(config, templateBalance, tables);
  if (!templateId || !tables[templateBalance]?.[templateId]) return config;
  const base = structuredClone(templateConfigFor(templateId, templateBalance, tables));
  const variant = config.variantId ? variantById(config.variantId) : null;
  return variant ? applyVariant(base, variant) : base;
}

/**
 * 總開關（Owner 2026-10-30 第 5 點：戰術書納入總旗標管理；I5 情況 3）：本場規則集沒有 Director core.v1（career.v20）卻帶了戰術書 binding
 * （在戰術書確認後、開局前旗標被關掉）⇒ 不用 binding。經典模板 ⇒ 正式站 v20 的同一個戰術（＋計畫裡的經典變體）；
 * std 或 v2 模板（正式站 v20 沒有對應）⇒ 標準運營。計畫的每一個選擇都列為本場拿掉，並註明模板被替換，不會無聲換掉。
 * ⚠ 這取代 2026-10-25 決策 4（v20 下保留 binding 的 static 選擇）；std／v2 的預設待 Owner 確認。
 */
export function v20TacticForBinding(binding) {
  const plan = binding?.plan ?? {};
  let leaves = [];
  try { leaves = leavesOf(plan.choices ?? {}); } catch { leaves = []; }
  const dropped = leaves.map(([dimension, choice]) => ({ dimension, choice: String(choice) }));
  const tpl = templateById(plan.templateId);
  const classic = tpl?.kind === "classic" ? mobaTacticById(tpl.legacyTacticId) : null;
  if (classic) {
    const v = Array.isArray(plan.overlayIds) && plan.overlayIds.length ? variantById(plan.overlayIds[0]) : null;
    const config = v ? applyVariant(structuredClone(classic), v) : structuredClone(classic);
    return { tactic: { kind: "legacy", config }, dropped, substitution: null };
  }
  //  std 計畫本來就是標準運營 ⇒ 不是「替換」（審查：避免「標準運營改用標準運營」）；v2／未知模板才註明替換。
  const substitution = plan.templateId === "std" ? null : { fromTemplateId: plan.templateId ?? null, fromName: tpl?.name ?? null, toTacticId: STANDARD_OPP_TACTIC.tacticId, toName: STANDARD_OPP_TACTIC.name };
  return { tactic: { kind: "std" }, dropped, substitution };
}

/**
 * 畫面顯示用的戰術物件：讀取畫面與 HUD 顯示的名稱、描述＝本場規則集下實際打的那一份（Owner 2026-10-30 後續第 2 點）。規則與 buildLiveMatchSetup 的矩陣相同。
 * 旗標沒有在確認與開局之間改變時，顯示值與傳入的 tactic 相同；沒有 binding 且不在修正表的 legacy ⇒ 回傳同一個物件。只給畫面用，開局輸入仍是 tactic＋binding。
 */
export function liveTacticDisplayOf({ tactic = null, tacticPlanBinding = null, ruleset = null } = {}) {
  const templateBalance = templateBalanceOf(ruleset);
  const overCopy = (cfg, templateId) => {
    const c = templateCopyFor(templateId, templateBalance);
    return c ? { ...cfg, name: c.name, risk: c.risk, focus: c.focus, desc: c.desc, detail: c.detail, cons: c.cons } : cfg;
  };
  if (tacticPlanBinding) {
    if (tacticalDirectorModeOf(ruleset) === "core.v1") return overCopy(tactic ?? {}, tacticPlanBinding.plan?.templateId);
    const f = v20TacticForBinding(tacticPlanBinding);
    return f.tactic.kind === "legacy" ? f.tactic.config : STANDARD_OPP_TACTIC;
  }
  if (!tactic?.tacticId || !templateBalance) return tactic;
  const balanced = balancedLegacyTactic(tactic, templateBalance);
  const templateId = classicLegacyTemplateOf(balanced, templateBalance);
  return templateId ? overCopy(balanced, templateId) : balanced;
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

/** T15：AI 教練的紅方 binding；排不出來 ⇒ null（呼叫端退回風格模板）並記一筆 note。 */
function redCoachBinding(opponentTeam, ruleset, notes) {
  const r = aiCoachPlan({ team: opponentTeam, tacticalDirector: tacticalDirectorModeOf(ruleset), templateBalance: templateBalanceOf(ruleset) });
  const binding = r.ok ? bindTacticPlanToCurrentVersions(r.plan) : null;
  if (!binding) notes.push(`tactic.red: AI coach unavailable (${r.ok ? "bind failed" : r.errors.map((e) => e.code).join(",")}); style template used`);
  return binding ? toPlainData(binding) : null;
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
 * @param {object} [a.opponentTeam] aiTeamById(opts.opponentId) 的結果（風格模板只讀 style；career.v21 的 AI 教練另讀名單的素質，見 aiCoach.js）
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
  //  Phase 3a-B 第一階段：矩陣以本場規則集的**層**決定（不直接讀旗標）——binding 只在 Director core.v1 下使用；修正表只在帶 templateBalance 層時套用。
  const directorOn = tacticalDirectorModeOf(rs) === "core.v1";
  const templateBalance = templateBalanceOf(rs);
  //  紅方退回固定戰術（AI 教練排不出來或沒有教練層）：修正表下由 id 重建一次（Owner 第 4 點）；紅方每次開局／恢復都重新推導、不落盤。
  const redTactic = balancedLegacyTactic(opponentTeam ? mobaTacticForTeamStyle(opponentTeam.style) : STANDARD_OPP_TACTIC, templateBalance);
  //  T15：規則集的 redTactic 層是 aiCoachV1（career.v21）且有 AI 對手 ⇒ 紅方＝AI 教練賽前排的計畫（binding）。
  //  教練只讀對手隊伍自己的資料（風格、名單素質）與本場 Director 模式，不讀 opts／藍方任何東西。
  //  教練排不出來（例如對手沒有名單）⇒ 退回風格模板並記在 notes（不讓開局失敗；同一份輸入永遠得到同一個結果）。
  const redBinding = L.redTactic === "aiCoachV1" && opponentTeam ? redCoachBinding(opponentTeam, rs, notes) : null;
  const explicitLayout = OBJECTIVE_LAYOUTS.includes(opts.objectiveLayout) ? opts.objectiveLayout : null;
  //  本場規則集用不到的戰術選擇只從本場拿掉（見 bindingForRuleset）；記在 notes，存檔的戰術書不動。
  const blueBinding = opts.tacticPlanBinding && directorOn ? bindingForRuleset(toPlainData(opts.tacticPlanBinding), rs) : null;
  if (blueBinding?.dropped.length) notes.push(`tactic.blue: dropped ${blueBinding.dropped.map((d) => `${d.dimension}=${d.choice}`).join(", ")} (not available under this match's ruleset; saved plan unchanged)`);
  //  情況 3：v20 規則集＋binding ⇒ 不用 binding（總開關）。
  const v20Fallback = opts.tacticPlanBinding && !directorOn ? v20TacticForBinding(toPlainData(opts.tacticPlanBinding)) : null;
  if (v20Fallback) notes.push(`tactic.blue: tactic book not used under this match's ruleset (${v20Fallback.tactic.kind === "legacy" ? `classic ${v20Fallback.tactic.config.tacticId}` : v20Fallback.substitution ? `template ${v20Fallback.substitution.fromTemplateId} -> ${v20Fallback.substitution.toTacticId}` : "standard"}); saved plan unchanged`);
  const blueLegacy = opts.tactic?.tacticId ? balancedLegacyTactic(toPlainData(opts.tactic), templateBalance) : null;

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
      //  Phase 3a-B 第一階段（I5 矩陣）：① v21＋binding ⇒ binding；③ v20＋binding ⇒ 正式站 v20 的戰術；②④ 沒有 binding ⇒ legacy（v21 下修正表重建一次）。
      blue: blueBinding ? { kind: "binding", binding: blueBinding.binding }
        : v20Fallback ? v20Fallback.tactic
        : blueLegacy ? { kind: "legacy", config: blueLegacy } : null,
      red: redBinding ? { kind: "binding", binding: redBinding } : { kind: "legacy", config: toPlainData(redTactic) },
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
  //  Phase 3a-B（Owner 2026-10-25 決策 4）：本場拿掉的戰術選擇以結構化資料交給畫面（開局提示），notes 照舊。
  return { ok: r.ok, setup: r.setup, errors: r.errors, buildStrategy, notes, droppedChoices: blueBinding?.dropped ?? v20Fallback?.dropped ?? [], templateSubstitution: v20Fallback?.substitution ?? null };
}
