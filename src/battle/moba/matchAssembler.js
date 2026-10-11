// ============================================================================
//  battle/moba/matchAssembler.js — 唯一的對戰組裝器（Phase 3a Task 3）
//
//  【是什麼】`assembleMatch(setup, deps)` 把一份 MatchSetup.v1 變成「已配置好、尚未 tick」的
//  LogicEngine。Live、Challenge、平衡工具、未來的伺服器全部走這一支——組裝順序與短路條件
//  只有這裡一份。tick 迴圈（dt、時間上限）不在這裡，由呼叫端決定。
//
//  【決定性的兩個來源】
//   ① 呼叫「順序」：由 ruleset.layers.assemblyOrder 決定（見 matchRuleset.js 的 ASSEMBLY_ORDERS）。
//   ② 呼叫「與否」：完全照 setup.effectiveLayers（matchSetup 推導並納入雜湊），組裝器**不自行推論**；
//      只保留 v20 的「adapter 回 null ⇒ 不呼叫」短路（逐條附 v20 原始碼行號）。
//   v20 對照（tools/fixtures/match_golden_v20.json 的 `calls` 逐筆比對，tools/check_match_assembler_3a.mjs）：
//     live          src/useLocalServer.js start()        :165-295
//     runner        tools/balance/moba_items_balance_runner.mjs configure() :116-158
//     challengeV20  src/platform/challenge/challengeRunner.js runChallenge() :136-189
//
//  【setup 欄位語意（組裝器的讀法）】
//   · seed / loadout：原樣進建構子（loadout 是**最終值**——疲勞等推導由 builder 先算好）。
//   · playerSlots.{blue,red}：引擎席位 slot `{ id: "b1".."r5", playerId, stats }`
//     （Live＝buildPlayerStatSlots 的輸出；Challenge＝快照攤平）。直接交給 toEnginePlayerMods。
//   · roster：`{ seat: { heroId, spells? } }`；英雄物件在這裡用 deps.heroLookup 補上
//     （與 v20 Live／Challenge 的 `{ ...row, hero }` 相同；runner 原本沒有 hero 欄位，
//      但所有 adapter 都以 heroId 為準，結果相同——golden 逐筆驗證）。
//   · tactic：legacy ⇒ 該份 MobaTacticConfig；std ⇒ STANDARD_OPP_TACTIC；
//     binding ⇒ deps.engineAdapters.resolveTactic 解析成 MobaTacticConfig（Task 9；resolver 拒絕 ⇒ tactic_binding_rejected），之後同一對投影。
//
//  【production / tool 的差異（只有這三處，都是 v20 runner 的既有行為）】
//   · tool.ruleOverrides：建構後立刻覆寫這一個實例的 rules（runner:119）。
//   · configureArchetypes / configureMatch 的 `meta`：tool ⇒ null（runner:140,144）；
//     production ⇒ 版本與戰術證據欄位（useLocalServer:244-246,276）。
//   · 裝備：production ⇒ matchItemsConfig（我方 buildStrategy、對手固定 standard）；
//     tool ⇒ toEngineItems＋每側策略，之後套 incomeK（runner:146-156）。
//
//  【語彙驗證】未知的 buildStrategy／天賦 id **拒絕**（不默默正規化——正規化是 Task 4 Live builder 的事）。
//
//  【不可變】setup 是深度凍結的；交給 adapter 的每一份資料都先複製（structuredClone），
//   組裝器永不寫 setup。
//
//  【只做編排（Phase 3a T6 fix）】本檔不 import 任何 adapter 模組：引擎類別、英雄側 adapter（deps.heroAdapters）與引擎側 adapter
//   （deps.engineAdapters：PlayerMods／HeroMods／Passives／PowerCurve／Spells／matchItemsConfig／toEngineItems／Tactic／Identity／
//   STANDARD_OPP_TACTIC／MOBA_TACTIC_VERSION／resolveTactic）全部經 deps，預設接線只在 matchAssemblerDepsCore.js 一處。
//   理由：平衡工具 ESMO_BALANCE_ROOT 做跨版本 A/B，必須量到「同一棵樹」，不能引擎與一半 adapter 來自 M、另一半來自 runner 所在的樹。
//   tool 規則集容忍舊樹引擎缺 configureObjectiveLayout／HeroPassives／HeroPowerCurve（略過，同 v20 runner 的 typeof 護欄）；production 不容忍。
//
//  【import 邊界】本檔**不得**（直接或間接）import `data/heroDatabase.js`（~396KB data URI）。
//   需要英雄表的三個 adapter 模組（heroSkillGameplay / heroBattleTalents / heroCombatArchetypes）
//   都靜態 import heroDatabase ⇒ 由呼叫端經 `deps.heroAdapters` 注入；LogicEngine 也由 deps 注入
//   （平衡工具可從另一棵原始碼樹載入引擎）。check_match_assembler_3a A1 會走訪 import 圖。
//
//  純函式（除了建立與配置引擎實例）：不碰 React / zustand / localStorage / 時鐘 / 亂數。
// ============================================================================
import { BUILD_STRATEGIES } from "./items/buildPolicy.js";
import { MATCH_SETUP_VERSION, fnv1a64Hex } from "../../platform/contracts/matchSetup.js";
import { ASSEMBLY_ORDERS } from "../../platform/contracts/matchRuleset.js";
import { stableStringify } from "../../platform/contracts/squadSnapshot.js";

export const MATCH_ASSEMBLER_VERSION = "MatchAssembler.v1";

/**
 * deps 的身分描述（Phase 3a T4）→ `applied.depsFingerprint`。
 *  · 共用 builder（battle/moba/matchAssemblerDeps.js）產出的 deps 帶凍結的 `manifest`
 *    （引擎標記＋各 adapter 模組的契約常數，覆寫則標 override）⇒ 直接採用。
 *  · 手拼的 deps（沒有 manifest）仍給指紋，但標成 unmanaged ⇒ 與共用 deps 必不相同。
 *  只描述、不判定：要不要接受某份 deps 由呼叫端與 gate（check_live_setup_3a §S）決定。
 */
export function describeAssemblerDeps(deps) {
  const m = deps?.manifest;
  if (isPlainObject(m) && m.schema === "MatchAssemblerDeps.v1") return m;
  const H = deps?.heroAdapters ?? {};
  return {
    schema: "unmanaged",
    engine: typeof deps?.LogicEngine === "function" ? (deps.LogicEngine.name || "anonymous") : null,
    heroLookup: typeof deps?.heroLookup === "function" ? (deps.heroLookup.name || "anonymous") : null,
    adapters: Object.keys(H).sort().map((k) => (typeof H[k] === "function" ? `${k}:${H[k].name || "anonymous"}` : `${k}=${String(H[k])}`)),
    engineAdapters: Object.keys(deps?.engineAdapters ?? {}).sort().map((k) => { const f = deps.engineAdapters[k]; return typeof f === "function" ? `${k}:${f.name || "anonymous"}` : `${k}=${typeof f}`; }),
  };
}
export const depsFingerprintOf = (deps) => fnv1a64Hex(stableStringify(describeAssemblerDeps(deps)));

/** 每種順序依序執行的步驟。challengeV20 沒有的步驟（layout／skills／items）在驗證階段就被拒絕。 */
export const ASSEMBLY_STEPS = Object.freeze({
  live: Object.freeze(["layout", "players", "heroes", "skills", "archetypes", "spells", "match", "items"]),
  challengeV20: Object.freeze(["players", "match", "heroes", "archetypes", "spells"]),
});

/**
 * 舊樹的引擎可能沒有的方法——**逐字對應 v20 平衡工具 runner 的 typeof 護欄**（configure() 內只有這三個有護欄；
 * 其餘 configure* 缺席時 v20 會丟 TypeError）。新增項目前先確認 v20 runner 真的有對應護欄。
 */
export const TOOL_TOLERATED_ENGINE_METHODS = Object.freeze(["configureObjectiveLayout", "configureHeroPassives", "configureHeroPowerCurve"]);

const SIDES = Object.freeze(["blue", "red"]);
//  正規席位順序。setup 雜湊對鍵排序（stableStringify），所以交給 adapter 的 roster／天賦選擇
//  一律依這個順序重建 ⇒ 「同雜湊 ⇒ 同模擬」由構造保證，不依賴呼叫端的插入順序。
export const CANONICAL_SEATS = Object.freeze(["b1", "b2", "b3", "b4", "b5", "r1", "r2", "r3", "r4", "r5"]);
/** 依 CANONICAL_SEATS 排列一個以席位為鍵的物件（缺席位略過；未知鍵由驗證階段拒絕）。 */
const bySeat = (obj) => Object.fromEntries(CANONICAL_SEATS.filter((seat) => seat in obj).map((seat) => [seat, obj[seat]]));
const SEAT_RX = Object.freeze({ blue: /^b[1-5]$/, red: /^r[1-5]$/ });
const sideOfSeat = (seat) => (String(seat)[0] === "r" ? "red" : "blue");
const clone = (v) => (v === null || v === undefined ? v : structuredClone(v));
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * @param {object} setup  MatchSetup.v1（createMatchSetup 的輸出）
 * @param {object} deps   { LogicEngine, heroLookup, engineAdapters: { toEnginePlayerMods, toEngineHeroMods, toEngineHeroPassives,
 *                          toEngineHeroPowerCurve, toEngineSpells, matchItemsConfig, toEngineItems, toEngineTactic, toEngineTacticIdentity,
 *                          STANDARD_OPP_TACTIC, MOBA_TACTIC_VERSION }, heroAdapters: { toEngineHeroSkills, selectBattleTalents,
 *                          battleTalentOptions, toEngineArchetypes, COMBAT_ARCHETYPE_CONTRACT_VERSION } }
 * @returns {{ ok: boolean, engine: object|null,
 *             applied: { objectiveLayout, talentSelection, buildStrategy, tacticMeta, replayConfig, configured: string[],
 *                        depsFingerprint: string }|null,
 *             errors: Array<{ code, field, message }> }}
 */
export function assembleMatch(setup, deps = {}) {
  const errors = [];
  const err = (code, field, message) => errors.push({ code, field, message });
  const fail = () => ({ ok: false, engine: null, applied: null, errors });

  if (!isPlainObject(setup) || setup.schema !== MATCH_SETUP_VERSION || !isPlainObject(setup.ruleset) || !isPlainObject(setup.effectiveLayers)) {
    err("setup_invalid", "$", `assembleMatch needs a ${MATCH_SETUP_VERSION} (createMatchSetup output)`);
    return fail();
  }
  const { ruleset, effectiveLayers: E } = setup;
  const L = ruleset.layers ?? {};
  //  戰術輸入先安全地讀一份副本（手拼的 setup 可能帶已撤銷的 Proxy、丟例外的 getter）：讀不出來 ⇒ 錯誤結果，不是例外。
  //  之後整個組裝器只看這份副本（tacticIn），不再碰 setup.tactic。
  const tacticIn = { blue: null, red: null }, tacticUnreadable = { blue: false, red: false };
  for (const side of ["blue", "red"]) {
    try { const t = setup.tactic?.[side]; tacticIn[side] = t === undefined || t === null ? null : structuredClone(t); }
    catch (e) { tacticUnreadable[side] = true; err("tactic_unreadable", `tactic.${side}`, `the tactic input could not be read safely (${String(e?.message ?? e).slice(0, 80)})`); }
  }
  const isTool = ruleset.kind === "tool";
  const order = L.assemblyOrder;
  const tool = isTool ? (setup.tool ?? {}) : null;
  const { LogicEngine, heroLookup } = deps ?? {};
  const H = deps?.heroAdapters ?? {};
  const A = deps?.engineAdapters ?? {};
  const hasRoster = setup.roster !== null && setup.roster !== undefined;

  // ── 驗證（全部在建構引擎之前；有任何錯誤就不建引擎、零 configure 呼叫）──────────
  if (!ASSEMBLY_ORDERS.includes(order)) err("assembly_order_unknown", "ruleset.layers.assemblyOrder", `unknown assembly order "${order}" (known: ${ASSEMBLY_ORDERS.join("|")})`);
  if (order === "challengeV20") {
    const unsupported = [E.layoutConfigured && "layout", E.heroSkills && "heroSkills", E.heroPassives && "heroPassives",
      E.heroPowerCurve && "heroPowerCurve", E.battleTalents && "battleTalents", E.items && "items"].filter(Boolean);
    if (unsupported.length) err("assembly_order_layer_unsupported", "ruleset.layers.assemblyOrder",
      `the challengeV20 order (v20 challengeRunner) has no ${unsupported.join("/")} step`);
  }
  if ((E.heroPassives || E.heroPowerCurve) && !E.heroSkills)
    err("layer_combination_unsupported", "effectiveLayers", "hero passives / power curve are only applied on top of hero skills (v20: useLocalServer:224-228)");

  const need = (ok, field, why) => { if (!ok) err("deps_missing", field, `${field} is required (${why})`); };
  need(typeof LogicEngine === "function", "deps.LogicEngine", "engine class");
  if (hasRoster) need(typeof heroLookup === "function", "deps.heroLookup", "roster present");
  if (E.heroSkills) need(typeof H.toEngineHeroSkills === "function", "deps.heroAdapters.toEngineHeroSkills", "heroSkills layer");
  if (E.battleTalents || setup.talentSelections) {
    need(typeof H.selectBattleTalents === "function", "deps.heroAdapters.selectBattleTalents", "battleTalents layer");
    need(typeof H.battleTalentOptions === "function", "deps.heroAdapters.battleTalentOptions", "talent vocabulary");
  }
  //  引擎側 adapter（Phase 3a T6 fix）：組裝器自己不 import 任何 adapter 模組——ESMO_BALANCE_ROOT 的跨版本 A/B
  //  必須量到「同一棵樹」，所以引擎類別與每一個被呼叫的 adapter 都來自 deps（預設值只在 matchAssemblerDepsCore.js 接一次）。
  const needFn = (name, why) => need(typeof A[name] === "function", `deps.engineAdapters.${name}`, why);
  if (E.players.blue || E.players.red) needFn("toEnginePlayerMods", "player stat layer");
  if (E.heroMods) needFn("toEngineHeroMods", "hero mods layer");
  if (E.heroPassives) needFn("toEngineHeroPassives", "hero passives layer");
  if (E.heroPowerCurve) needFn("toEngineHeroPowerCurve", "hero power curve layer");
  if (E.spells) needFn("toEngineSpells", "spells layer");
  if (E.match) {
    needFn("toEngineTactic", "match layer");
    needFn("resolveTactic", "tactic resolver (legacy／std／binding)");
    if (L.tacticIdentity) needFn("toEngineTacticIdentity", "tacticIdentity layer");
    if (!isTool) need(typeof A.MOBA_TACTIC_VERSION === "string", "deps.engineAdapters.MOBA_TACTIC_VERSION", "tactic meta");
    for (const side of SIDES) if (tacticIn[side]?.kind === "std")
      need(isPlainObject(A.STANDARD_OPP_TACTIC), "deps.engineAdapters.STANDARD_OPP_TACTIC", "std tactic");
  }
  if (E.items) needFn(isTool ? "toEngineItems" : "matchItemsConfig", "items layer");
  if (E.archetypes) {
    need(typeof H.toEngineArchetypes === "function", "deps.heroAdapters.toEngineArchetypes", "archetypes layer");
    if (!isTool) need(typeof H.COMBAT_ARCHETYPE_CONTRACT_VERSION === "string", "deps.heroAdapters.COMBAT_ARCHETYPE_CONTRACT_VERSION", "archetype meta");
  }

  for (const [field, obj] of [["roster", setup.roster], ["talentSelections", setup.talentSelections]]) {
    for (const seat of Object.keys(obj ?? {})) if (!CANONICAL_SEATS.includes(seat))
      err("seat_unknown", `${field}.${seat}`, `unknown seat id "${seat}" (seats are ${CANONICAL_SEATS.join(",")})`);
  }
  if (hasRoster && typeof heroLookup === "function") {
    for (const [seat, row] of Object.entries(bySeat(setup.roster))) if (!heroLookup(row.heroId)) err("hero_unknown", `roster.${seat}.heroId`, `heroLookup has no hero "${row.heroId}"`);
  }

  for (const side of SIDES) {
    (setup.playerSlots?.[side] ?? []).forEach((slot, i) => {
      if (!isPlainObject(slot) || !SEAT_RX[side].test(slot.id) || !isPlainObject(slot.stats))
        err("player_slot_invalid", `playerSlots.${side}[${i}]`, `a player slot is an engine seat slot { id: ${side === "blue" ? "b1-b5" : "r1-r5"}, playerId, stats }`);
    });
  }

  //  戰術輸入（legacy／std／binding 三種）一律經 deps.engineAdapters.resolveTactic（Phase 3a T9 fix 1：規格 §7「兩個投影收進 Resolver」）。
  //  組裝器沒有自己的投影：resolver 收到整份 engineAdapters，用裡面的 toEngineTactic／toEngineTacticIdentity／STANDARD_OPP_TACTIC
  //  （ESMO_BALANCE_ROOT 的跨版本 A/B 因此量到被量測那棵樹的投影）。tacticIdentity 層關閉 ⇒ opts.identity=false（v20 不呼叫它）。
  //  resolver 拒絕（版本不符、被竄改、design 選擇、未知覆蓋層……）或輸入讀不出來（Proxy、丟例外的 getter、循環）＝開局前的錯誤結果，
  //  形狀與其他 setup 錯誤相同：binding ⇒ tactic_binding_rejected；其他種類 ⇒ tactic_rejected；讀不出來 ⇒ tactic_unreadable。
  const resolved = { blue: null, red: null };
  //  每個戰術 adapter 只在「真的用到」時才必要（上面的 need 已逐項回報 deps_missing，這裡不會默默略過）：
  //  resolveTactic／toEngineTactic 在有 match 層時必要；toEngineTacticIdentity 只在 tacticIdentity 層開啟時必要（舊樹的 tool 規則集可以沒有）；
  //  STANDARD_OPP_TACTIC 只在有一方是 std 時必要（兩方都是 legacy／binding 的輸入與 v20 一樣不需要它）。
  const tacticDepsOk = typeof A.resolveTactic === "function" && typeof A.toEngineTactic === "function"
    && (!L.tacticIdentity || typeof A.toEngineTacticIdentity === "function")
    && SIDES.every((side) => tacticIn[side]?.kind !== "std" || isPlainObject(A.STANDARD_OPP_TACTIC));
  if (E.match && !tacticIn.blue && !tacticUnreadable.blue) err("tactic_blue_missing", "tactic.blue", "the match layer is in effect but the setup carries no blue tactic");
  if (E.match && tacticDepsOk) {
    for (const side of SIDES) {
      const t = tacticIn[side];
      if (!t || tacticUnreadable[side]) continue;
      let r;
      try { r = A.resolveTactic(t, A, { identity: !!L.tacticIdentity }); }
      catch (e) { err("tactic_unreadable", `tactic.${side}`, `the ${t?.kind ?? "?"} tactic could not be resolved safely (${String(e?.message ?? e).slice(0, 80)})`); continue; }
      if (!r?.ok) {
        const list = Array.isArray(r?.errors) && r.errors.length ? r.errors : [{ code: "unknown", field: "", message: "resolver rejected the tactic" }];
        for (const e of list) {
          const sub = String(e.field ?? "").replace(/^(binding|config)\.?/, "");
          err(t.kind === "binding" ? "tactic_binding_rejected" : "tactic_rejected", sub ? `tactic.${side}.${sub}` : `tactic.${side}`, `[${e.code}] ${e.message}`);
        }
      } else if (!isPlainObject(r.config) || !isPlainObject(r.knobs) || (L.tacticIdentity && !isPlainObject(r.identity))) {
        //  注入的 resolver 說 ok 卻沒給齊 config／knobs（／identity）：開局前就拒絕，不讓 match() 在 8 次 configure 之後才丟 TypeError。
        err("tactic_rejected", `tactic.${side}`, `[resolver_bad_shape] the injected resolveTactic returned ok without ${!isPlainObject(r.config) ? "config" : !isPlainObject(r.knobs) ? "knobs" : "identity"}`);
      } else resolved[side] = r;
    }
  }
  if (E.match && !tacticIn.red && !tacticUnreadable.red) err("tactic_red_missing", "tactic.red", "a match with a blue tactic needs an explicit red tactic (use { kind: \"std\" } for the neutral default)");

  if (setup.buildStrategy !== null && setup.buildStrategy !== undefined) {
    if (isTool) err("build_strategy_in_tool", "buildStrategy", "tool rulesets choose items through tool.itemsStrategies");
    else if (!BUILD_STRATEGIES.includes(setup.buildStrategy))
      err("build_strategy_unknown", "buildStrategy", `unknown build strategy "${setup.buildStrategy}" (known: ${BUILD_STRATEGIES.join("|")}); normalize in the builder, not here`);
  }
  if (isTool && tool.itemsStrategies) {
    for (const side of SIDES) if (!BUILD_STRATEGIES.includes(tool.itemsStrategies[side]))
      err("build_strategy_unknown", `tool.itemsStrategies.${side}`, `unknown build strategy "${tool.itemsStrategies[side]}" (known: ${BUILD_STRATEGIES.join("|")})`);
  }
  if (isTool && tool.incomeK !== null && tool.incomeK !== undefined && !E.items)
    err("income_k_without_items", "tool.incomeK", "incomeK scales the items economy; the items layer is not in effect");

  if (setup.talentSelections) {
    if (!hasRoster) err("talent_without_roster", "talentSelections", "talent selections need a roster (talents belong to the seat's hero)");
    else if (typeof H.battleTalentOptions === "function") {
      for (const [seat, id] of Object.entries(bySeat(setup.talentSelections))) {
        if (id === null) continue; // null = let the AI choose for this seat
        const heroId = setup.roster[seat]?.heroId ?? null;
        const options = heroId ? H.battleTalentOptions(heroId) : [];
        if (!options.some((o) => o.id === id)) err("talent_unknown", `talentSelections.${seat}`, `"${id}" is not a battle talent of ${heroId ?? "this seat"}`);
      }
    }
  }
  if (errors.length) return fail();

  // ── 組裝 ────────────────────────────────────────────────────────────────
  //  建構子：useLocalServer:167 `new LogicEngine(seed, loadout)`；challengeRunner:137 同；runner:118 無 loadout（＝null）。
  const engine = new LogicEngine(setup.seed, clone(setup.loadout ?? null));
  if (isTool && tool.ruleOverrides) engine.rules = { ...engine.rules, ...clone(tool.ruleOverrides) }; // runner:119
  const configured = [];
  //  只有 tool 規則集、且只有 TOOL_TOLERATED_ENGINE_METHODS 這三個方法容忍引擎缺席（略過、不記入 configured）；
  //  其餘方法（以及 production 的任何方法）缺席仍是錯誤（照原樣丟 TypeError）——不可默默量一個半套的引擎。
  const call = (method, arg) => {
    if (isTool && TOOL_TOLERATED_ENGINE_METHODS.includes(method) && typeof engine[method] !== "function") return;
    engine[method](arg); configured.push(method);
  };

  //  英雄物件由 deps.heroLookup 補上（useLocalServer 的 opts.roster、challengeRunner:173-174 的 withHero）。
  //  ⚠ 依 CANONICAL_SEATS 重建（不是 setup 的插入順序）：每個 adapter 都以這份物件的走訪順序產出設定。
  const roster = hasRoster ? Object.fromEntries(Object.entries(bySeat(setup.roster)).map(([seat, row]) => [seat, {
    heroId: row.heroId, ...(Array.isArray(row.spells) ? { spells: [...row.spells] } : {}), hero: heroLookup(row.heroId),
  }])) : null;

  //  天賦選擇：useLocalServer:174-176（空集合 ⇒ null）；runner:130 不帶玩家選擇（setup.talentSelections 為 null）。
  let talentSelection = null, talentRaw = null;
  if (E.battleTalents) {
    const selected = H.selectBattleTalents(roster, setup.talentSelections ? clone(bySeat(setup.talentSelections)) : undefined);
    talentRaw = selected ?? null;
    talentSelection = selected && Object.keys(selected.players).length ? selected : null;
  }

  const blueCfg = resolved.blue?.config ?? null;
  let tacticMeta = null, itemsApplied = false;

  const STEPS = {
    //  useLocalServer:170-171；runner:122-125。challengeV20 從不呼叫（引擎保留預設 STANDARD）。
    layout() { if (E.layoutConfigured) call("configureObjectiveLayout", setup.objectiveLayout); },
    //  useLocalServer:204-207（紅方 []）；challengeRunner:139-142（雙方）。mods 為 null ⇒ 不呼叫。
    players() {
      if (!E.players.blue && !E.players.red) return;
      const mods = A.toEnginePlayerMods({ blue: clone(setup.playerSlots.blue), red: clone(setup.playerSlots.red) });
      if (mods) call("configurePlayers", mods);
    },
    //  useLocalServer:215-216；challengeRunner:177-178；runner:126-127。全中性 ⇒ null ⇒ 不呼叫。
    heroes() {
      if (!E.heroMods) return;
      const mods = A.toEngineHeroMods(roster, heroLookup);
      if (mods) call("configureHeroes", mods);
    },
    //  useLocalServer:220-229；runner:129-137。passives / curve 只疊在 skills 之上。
    skills() {
      if (!E.heroSkills) return;
      //  production（Live）：空選擇 ⇒ null（useLocalServer:176）。tool：v20 runner 把 selectBattleTalents 的結果原樣交出
      //  （空 players 時技能設定會多一個 `talents: {}`）⇒ 不收斂成 null。
      const skills = H.toEngineHeroSkills(roster, isTool ? talentRaw : talentSelection);
      if (skills) call("configureHeroSkills", skills);
      const passives = skills && E.heroPassives ? A.toEngineHeroPassives(roster) : null;
      if (passives) call("configureHeroPassives", passives);
      const curves = skills && E.heroPowerCurve ? A.toEngineHeroPowerCurve(roster) : null;
      if (curves) call("configureHeroPowerCurve", curves);
    },
    //  useLocalServer:237-247；challengeRunner:180-186；runner:138-140（meta: null）。
    //  ⚠ runner:138-141 對 archetypes／spells 無條件呼叫；這裡的「adapter 回空／null ⇒ 不呼叫」與之等價：
    //    roster 存在時 setup 契約要求 10 席位齊全 ⇒ toEngineArchetypes 必非空、每席 spells 由 builder 給齊
    //    ⇒ 兩者必呼叫（golden 18 個 runner 案逐筆證實）。空 roster 的 runner 路徑本來就會在 configureSpells(null) 拋錯。
    archetypes() {
      if (!E.archetypes) return;
      const archMods = H.toEngineArchetypes(roster);
      if (!archMods || !Object.keys(archMods).length) return;
      const blue = {}, red = {};
      for (const [pid, mod] of Object.entries(archMods)) (sideOfSeat(pid) === "red" ? red : blue)[pid] = mod;
      call("configureArchetypes", { blue, red,
        meta: isTool ? null : { version: H.COMBAT_ARCHETYPE_CONTRACT_VERSION, seats: Object.keys(archMods).length } });
    },
    //  useLocalServer:262-263；challengeRunner:188-189（spells 由 builder 依英雄推導後放進 roster）；runner:141。
    spells() {
      if (!E.spells) return;
      const mods = A.toEngineSpells(roster);
      if (mods) call("configureSpells", mods);
    },
    //  useLocalServer:270-280；challengeRunner:144-163；runner:143-144（std 對 std、meta: null）。
    match() {
      if (!E.match) return;
      const redCfg = resolved.red.config;
      tacticMeta = isTool ? null
        : { tacticId: blueCfg.tacticId, tacticName: blueCfg.name, version: A.MOBA_TACTIC_VERSION, opponentTacticId: redCfg.tacticId };
      call("configureMatch", {
        //  旋鈕由 resolver 投影好（凍結的結果）；交給引擎的是副本，引擎想改也不會碰到 resolver 的輸出。
        blue: clone(resolved.blue.knobs),
        red: clone(resolved.red.knobs),
        //  tacticIdentity 是規則集層（整份 ruleset 已進 setup 雜湊），不依賴 setup 資料 ⇒ 不需要也不放進 effectiveLayers。
        identity: L.tacticIdentity ? { blue: clone(resolved.blue.identity), red: clone(resolved.red.identity) } : null,
        meta: tacticMeta,
      });
    },
    //  production：useLocalServer:290-295（matchItemsConfig）；tool：runner:146-156（每側策略＋incomeK）。
    items() {
      if (!E.items) return;
      const cfg = isTool
        ? A.toEngineItems({ roster, heroLookup, defaultStrategy: "standard",
          strategies: Object.fromEntries(Object.keys(roster).map((pid) => [pid, tool.itemsStrategies[sideOfSeat(pid)]])) })
        : A.matchItemsConfig({ roster, heroLookup, buildStrategy: setup.buildStrategy });
      if (!cfg) return;
      call("configureItems", cfg);
      itemsApplied = true;
      if (isTool && tool.incomeK !== null && tool.incomeK !== undefined && tool.incomeK !== 1) engine.items.incomeK = tool.incomeK;
    },
  };
  for (const step of ASSEMBLY_STEPS[order]) STEPS[step]();

  return {
    ok: true, engine, errors: [],
    applied: {
      objectiveLayout: setup.objectiveLayout,
      talentSelection,
      buildStrategy: itemsApplied ? (isTool ? { ...tool.itemsStrategies } : setup.buildStrategy) : null,
      tacticMeta,
      //  與 useLocalServer:188-191 beginReplayCapture 的 `config` 相同形狀。
      replayConfig: {
        ...(blueCfg?.tacticId ? { tacticId: blueCfg.tacticId, tacticName: blueCfg.name ?? null } : {}),
        ...(talentSelection ? { battleTalentIds: Object.fromEntries(Object.entries(talentSelection.players).map(([seat, row]) => [seat, row.id])) } : {}),
      },
      configured,
      //  T4：這一場是用哪一份 deps 組的（見 describeAssemblerDeps）。不進 setup 雜湊——deps 不是輸入資料。
      depsFingerprint: depsFingerprintOf(deps),
    },
  };
}
