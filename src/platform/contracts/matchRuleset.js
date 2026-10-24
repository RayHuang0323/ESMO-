export const MATCH_RULESET_VERSION = "MatchRuleset.v1";
export const PRODUCTION_FORBIDDEN_KEYS = Object.freeze(["ruleOverrides", "incomeK", "itemsStrategies", "forcedLayout"]);
//  組裝順序（Phase 3a T3）：非布林層，由 assembleMatch 讀取。v20 有兩種實際順序（golden calls 為證）：
//   · "live"         Layout → Players → Heroes → Skills → Passives → Curve → Archetypes → Spells → Match → Items
//                    （useLocalServer.start、balance runner configure）
//   · "challengeV20" Players → Match → Heroes → Archetypes → Spells（challengeRunner.runChallenge；無 layout／技能／裝備）
//  production 規則集的非布林層被 matchSetup 鎖定 ⇒ challenge.v20 不能改走 live 順序（要統一須開 challenge.v21）。
export const ASSEMBLY_ORDERS = Object.freeze(["live", "challengeV20"]);
export const LAYER_RELEASE_FLAG = Object.freeze({
  heroSkills: "heroSkillsV1",
  heroPassives: "heroSkillsV1",
  heroPowerCurve: "heroSkillsV1",
  battleTalents: "heroBattleTalentsV1",
  items: "itemsV1"
});
//  Phase 3a-C3-1（Owner 2026-10-15 D-7）：第二個模式 "core.v1"＝依比賽時鐘挑選 Resolver 預先建好的每時期方針
//  （src/battle/moba/tactics/tacticalDirector.js）。只出現在 v21 規則集；v20 三份永不加這個鍵。
export const TACTICAL_DIRECTOR_MODES = Object.freeze(["static", "core.v1"]);
export const DEFAULT_TACTICAL_DIRECTOR_MODE = "static";
/** 讀取 ruleset 的 tacticalDirector 層；缺少 ≡ "static"。 */
export const tacticalDirectorModeOf = (r) => r?.layers?.tacticalDirector ?? DEFAULT_TACTICAL_DIRECTOR_MODE;
//  RS-1 擴充（D-15）：正式規則集的 tacticalDirector 只要不是 static，releaseRequirements 必須列對應的正式旗標。
//  與 LAYER_RELEASE_FLAG 分開放：那張表的鍵是「布林層」，既有 gate 依它列舉旗標組合（check_match_setup_3a RS-1.x、
//  check_live_setup_3a）；tacticalDirector 是字串層，混進去會讓那些組合多出一個從未發布的旗標。
export const TACTICAL_DIRECTOR_RELEASE_FLAG = Object.freeze({ "core.v1": "mobaTacticalDirectorV21" });
//  laneFrame 層（TD-3A-23；Owner 2026-10-15 D-1 = A：只在新的 v21 規則集修正，舊規則集維持原行為）：
//   · "legacyMirror"＝現狀：Director 原樣把己方視角的 knobs 交給引擎，紅方的上／下路因此對調（TD-3A-23 §1）。
//   · "teamRelative"＝修正：Director 在建立時把紅方按路分的 knobs 轉成世界路名（tacticalDirector.js 的 LANE_KEYED_KNOBS）。
//  欄位不存在 ≡ "legacyMirror"。v20 三份規則集永不加這個鍵（整份進 setup 雜湊；matchSetup 拒絕登錄值沒有的層鍵）。
//  字串層（不是布林）：正式規則集被 matchSetup 鎖在登錄值，工具規則集可覆寫成 "legacyMirror" 做對照（TD-3A-23 §3.2）。
export const LANE_FRAMES = Object.freeze(["legacyMirror", "teamRelative"]);
export const DEFAULT_LANE_FRAME = "legacyMirror";
/** 讀取 ruleset 的 laneFrame 層；缺少 ≡ "legacyMirror"。 */
export const laneFrameOf = (r) => r?.layers?.laneFrame ?? DEFAULT_LANE_FRAME;
/** 正式規則集 releaseRequirements 只能列這些正式旗標（DEV 網址開關、未登錄的名字一律拒絕）。 */
export const RELEASE_FLAGS = Object.freeze([...new Set([...Object.values(LAYER_RELEASE_FLAG), ...Object.values(TACTICAL_DIRECTOR_RELEASE_FLAG)])]);
const R = (o) => Object.freeze({ version: MATCH_RULESET_VERSION, ...o, layers: Object.freeze({ ...o.layers }), releaseRequirements: Object.freeze([...(o.releaseRequirements ?? [])]) });
export const MATCH_RULESETS = Object.freeze({
  "career.v20": R({ rulesetId: "career.v20", kind: "production", simVersion: "moba-sim.v20",
    layers: { heroSkills: true, heroPassives: true, heroPowerCurve: true, battleTalents: true, items: true, tacticIdentity: true, playerStatSides: "blue", objectiveLayout: "bySeed", redTactic: "styleTemplate", assemblyOrder: "live" },
    releaseRequirements: ["heroSkillsV1", "heroBattleTalentsV1", "itemsV1"] }),
  "challenge.v20": R({ rulesetId: "challenge.v20", kind: "production", simVersion: "moba-sim.v20",
    layers: { heroSkills: false, heroPassives: false, heroPowerCurve: false, battleTalents: false, items: false, tacticIdentity: true, playerStatSides: "both", objectiveLayout: "standard", redTactic: "snapshot", assemblyOrder: "challengeV20" },
    releaseRequirements: [] }),
  "balanceTool.v20": R({ rulesetId: "balanceTool.v20", kind: "tool", simVersion: "moba-sim.v20",
    layers: { heroSkills: true, heroPassives: true, heroPowerCurve: true, battleTalents: true, items: true, tacticIdentity: true, playerStatSides: "none", objectiveLayout: "bySeed", redTactic: "std", assemblyOrder: "live" },
    releaseRequirements: [] }),
  //  Phase 3a-C3-1（D-15）：v21 規則集＝v20 的層原樣＋tacticalDirector "core.v1"（v20 三份不動，見上）。
  //  career.v21 只在旗標 mobaTacticalDirectorV21 開啟時由 resolveRulesetForMode 解析出來（旗標預設關 ⇒ 正式站照舊 career.v20）。
  //  C3-1 laneFrame（TD-3A-23，D-1 = A）：v21 規則集另帶 laneFrame "teamRelative"（紅方按路分的 knobs 改成己方視角；
  //  career.v21／challenge.v21 是正式規則集 ⇒ 被 matchSetup 鎖在 teamRelative；balanceTool.v21 可覆寫成 legacyMirror 做負對照）。
  "career.v21": R({ rulesetId: "career.v21", kind: "production", simVersion: "moba-sim.v21",
    layers: { heroSkills: true, heroPassives: true, heroPowerCurve: true, battleTalents: true, items: true, tacticIdentity: true, playerStatSides: "blue", objectiveLayout: "bySeed", redTactic: "styleTemplate", assemblyOrder: "live", tacticalDirector: "core.v1", laneFrame: "teamRelative" },
    releaseRequirements: ["heroSkillsV1", "heroBattleTalentsV1", "itemsV1", "mobaTacticalDirectorV21"] }),
  "balanceTool.v21": R({ rulesetId: "balanceTool.v21", kind: "tool", simVersion: "moba-sim.v21",
    layers: { heroSkills: true, heroPassives: true, heroPowerCurve: true, battleTalents: true, items: true, tacticIdentity: true, playerStatSides: "none", objectiveLayout: "bySeed", redTactic: "std", assemblyOrder: "live", tacticalDirector: "core.v1", laneFrame: "teamRelative" },
    releaseRequirements: [] }),
  //  Phase 3a-B T16（正式架構 §3 補充 1 的表；Owner 2026-10-25 決策 6）：技能／被動／曲線 ON、天賦 OFF（Challenge 沒有天賦選擇資料）、
  //  裝備 OFF（featureFlags 的 Competitive／Challenge 邊界）、佈局 bySeed、組裝順序＝Live、Director core.v1、laneFrame teamRelative
  //  （順帶修掉 TD-3A-23 的殘留：Challenge 防守方紅方的路線對調）。雙方仍只用合法的靜態模板（legacy／std；不收 binding ⇒
  //  沒有自訂每時期戰術，那是 3c）。只在旗標 mobaTacticalDirectorV21（＋heroSkillsV1）開啟時由 resolveRulesetForMode 解析出來；
  //  每一場挑戰的規則集由它記下的模擬版本凍結（challengeRulesetForVersion），旗標日後改動不影響既有挑戰的重播。
  "challenge.v21": R({ rulesetId: "challenge.v21", kind: "production", simVersion: "moba-sim.v21",
    layers: { heroSkills: true, heroPassives: true, heroPowerCurve: true, battleTalents: false, items: false, tacticIdentity: true, playerStatSides: "both", objectiveLayout: "bySeed", redTactic: "snapshot", assemblyOrder: "live", tacticalDirector: "core.v1", laneFrame: "teamRelative" },
    releaseRequirements: ["heroSkillsV1", "mobaTacticalDirectorV21"] }),
});
export const rulesetById = (id) => MATCH_RULESETS[id] ?? null;
//  戰術輸入的種類（Phase 3a T9）：每個 ruleset 接受哪幾種 `setup.tactic.<side>.kind`。
//   · challenge.v20 重現歷史挑戰：只收 v20 就有的種類（legacy／std）；規格 §4.4 的「Challenge 歷史 → binding」遷移屬 challenge.v21。
//   · career.v20 多收 binding（Live 之後送 plan binding；Task 12 才接線，這裡只是讓組裝器「能」接受）。
//   · balanceTool.v20 是工具（不重現歷史），同樣接受 binding，讓戰術書選項能在 runner 上量測。
//  種類集合不在 ruleset 物件內（ruleset 整份進 setup 雜湊，加欄位會改變每一份 setup 的身分）；由 createMatchSetup 強制。
export const TACTIC_KINDS_BY_RULESET = Object.freeze({
  "career.v20": Object.freeze(["legacy", "std", "binding"]),
  "challenge.v20": Object.freeze(["legacy", "std"]),
  "balanceTool.v20": Object.freeze(["legacy", "std", "binding"]),
  "career.v21": Object.freeze(["legacy", "std", "binding"]),
  "balanceTool.v21": Object.freeze(["legacy", "std", "binding"]),
  //  T16：Challenge 雙方仍是快照裡選定的靜態模板（legacy）；不收 binding（自訂每時期戰術屬 3c）。
  "challenge.v21": Object.freeze(["legacy", "std"]),
});
//  旗標關閉 ⇒ 對應層關閉（永不強制開啟）。
//  C3-1：career 模式只有在 flags.mobaTacticalDirectorV21 === true 時改用 career.v21（其餘層的旗標處理完全相同，
//  releaseRequirements 末尾多列 mobaTacticalDirectorV21）；旗標不是 true ⇒ 與 C3-1 之前逐字相同的 career.v20 輸出。
//  T16：challenge 模式在 mobaTacticalDirectorV21 與 heroSkillsV1 都是 true 時改用 challenge.v21（整份原樣回傳：它的層是固定的，
//  沒有要被旗標關掉的布林層——技能要開就必須兩個旗標都開，否則整場回到 challenge.v20）；否則與 T16 之前相同的 challenge.v20。
export function resolveRulesetForMode({ mode, flags }) {
  const on = (f) => flags?.[f] === true;
  if (mode === "challenge") return MATCH_RULESETS[on("mobaTacticalDirectorV21") && on("heroSkillsV1") ? "challenge.v21" : "challenge.v20"];
  const director = on("mobaTacticalDirectorV21");
  const base = MATCH_RULESETS[director ? "career.v21" : "career.v20"];
  const skills = on("heroSkillsV1");
  const newLayers = { ...base.layers, heroSkills: skills, heroPassives: skills, heroPowerCurve: skills,
    battleTalents: skills && on("heroBattleTalentsV1"), items: on("itemsV1") };

  // Build releaseRequirements for the new layers
  const newReqs = [];
  if (newLayers.heroSkills) newReqs.push("heroSkillsV1");
  if (newLayers.battleTalents) newReqs.push("heroBattleTalentsV1");
  if (newLayers.items) newReqs.push("itemsV1");
  if (director) newReqs.push(TACTICAL_DIRECTOR_RELEASE_FLAG[newLayers.tacticalDirector]);

  return R({ ...base, layers: newLayers, releaseRequirements: newReqs });
}
//  T16：每一場挑戰的規則集由它**記下的模擬版本**決定（ChallengeInstance.simulationVersion；欄位與雜湊都不變）。
//  新挑戰記下的版本＝建立當下旗標解析出的規則集的 simVersion（challengeSimulationVersionFor）⇒ 第一次跑與日後重播用同一份規則集，
//  旗標日後改動不會讓既有挑戰換規則。不認得的版本 ⇒ null（runChallenge 照實拒絕）。
export const CHALLENGE_RULESET_BY_VERSION = Object.freeze({ "moba-sim.v20": "challenge.v20", "moba-sim.v21": "challenge.v21" });
export const challengeRulesetForVersion = (simVersion) => MATCH_RULESETS[CHALLENGE_RULESET_BY_VERSION[simVersion]] ?? null;
/** 這組旗標下，新的挑戰快照／挑戰要記下的模擬版本（＝challenge 模式解析出的規則集的 simVersion）。 */
export const challengeSimulationVersionFor = (flags) => resolveRulesetForMode({ mode: "challenge", flags }).simVersion;
export function validateRuleset(r) {
  const errors = [];
  if (!r || r.version !== MATCH_RULESET_VERSION) errors.push("version");
  if (!["production", "tool"].includes(r?.kind)) errors.push("kind");
  if (!["blue", "both", "none"].includes(r?.layers?.playerStatSides)) errors.push("playerStatSides");
  if (!["bySeed", "standard", "explicit"].includes(r?.layers?.objectiveLayout)) errors.push("objectiveLayout");
  if (!ASSEMBLY_ORDERS.includes(r?.layers?.assemblyOrder)) errors.push("assemblyOrder");
  //  Phase 3a-C1：可選層 tacticalDirector——欄位不存在 ≡ "static"（Director 原樣回傳設定的 knobs＝今天的行為）。
  //  C1／C2 只收 "static"；C3-1 起另收 "core.v1"（TACTICAL_DIRECTOR_MODES）；其他值一律拒絕，避免有人開啟尚未實作的行為（RS-1 精神）。
  //  v20 三份 ruleset 不加此欄位（整份進 setup 雜湊，加欄位會改變每一份 setup 的身分）。
  if (r?.layers && "tacticalDirector" in r.layers && !TACTICAL_DIRECTOR_MODES.includes(r.layers.tacticalDirector)) errors.push("tacticalDirector");
  //  C3-1 laneFrame：可選層——有這個鍵就必須是 LANE_FRAMES 之一（缺少 ≡ "legacyMirror"）。
  if (r?.layers && "laneFrame" in r.layers && !LANE_FRAMES.includes(r.layers.laneFrame)) errors.push("laneFrame");

  // RS-1: For production rulesets, every enabled layer must have its flag in releaseRequirements
  if (r?.kind === "production") {
    for (const [layer, flag] of Object.entries(LAYER_RELEASE_FLAG)) {
      if (r.layers?.[layer] === true && !r.releaseRequirements?.includes(flag)) {
        errors.push(`layer ${layer} requires ${flag}`);
      }
    }
    //  RS-1 擴充（C3-1，D-15）：非 static 的 Director 模式必須列它的正式旗標；
    //  releaseRequirements 只能是正式旗標（DEV 網址開關不得出現在正式規則集）。
    const mode = tacticalDirectorModeOf(r);
    if (mode !== DEFAULT_TACTICAL_DIRECTOR_MODE && TACTICAL_DIRECTOR_MODES.includes(mode)) {
      const flag = TACTICAL_DIRECTOR_RELEASE_FLAG[mode];
      if (!flag || !r.releaseRequirements?.includes(flag)) errors.push(`tacticalDirector ${mode} requires ${flag ?? "a release flag"}`);
    }
    for (const f of Array.isArray(r.releaseRequirements) ? r.releaseRequirements : []) {
      if (!RELEASE_FLAGS.includes(f)) errors.push(`releaseRequirements: ${String(f)} is not a release flag`);
    }
  }

  return { ok: errors.length === 0, errors };
}
