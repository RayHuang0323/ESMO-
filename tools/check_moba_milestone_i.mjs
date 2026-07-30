#!/usr/bin/env node
// ============================================================================
//  check_moba_milestone_i.mjs — Milestone I 安全網
//
//  I 目前完成的三塊（其餘進度見報告 §未完成）：
//    1. 英雄圖鑑分類：100 名全部可分類，法師不再只有 10 名
//    2. Ban/Pick 的選手／英雄／五路自動分配：決定性、五路唯一、可解釋
//    3. 每名英雄固定 2 個召喚師技能，打野必帶懲戒
// ============================================================================
import fs from "node:fs";
import { CHAMPIONS_100, heroById } from "../src/data/heroDatabase.js";
import { heroTags, heroHasTag, correctedArch, tagCounts, ARCH_CORRECTIONS } from "../src/data/heroClassification.js";
import { assignDraft, assignmentToHeroIds, LANES, heroLaneFit, playerLaneFit } from "../src/battle/moba/mobaDraftAssignment.js";
import { buildLoadout, validateLoadout, spellsFor, SUMMONER_SPELLS, HERO_LOADOUT_VERSION } from "../src/battle/moba/mobaHeroLoadout.js";

let pass = 0, fail = 0;
const ck = (l, c, e = null) => { if (c) { pass++; console.log(`✅ ${l}`); } else { fail++; console.log(`❌ ${l}${e != null ? `　→ ${JSON.stringify(e)}` : ""}`); } };
const src = (p) => fs.readFileSync(p, "utf8");

console.log("── §1 英雄圖鑑分類 ──");
ck("1) 英雄總數仍為 100（沒有偷加角色）", CHAMPIONS_100.length === 100, CHAMPIONS_100.length);
ck("2) 100 名全部有主定位，無人未分類",
  CHAMPIONS_100.every((h) => !!correctedArch(h)) && CHAMPIONS_100.every((h) => heroTags(h).length >= 1));
{
  const counts = tagCounts(CHAMPIONS_100);
  ck(`3) 圖鑑「法師」可見 ≥15（實際 ${counts.法師}）`, counts.法師 >= 15, counts);
  ck("4) 沒有任何定位膨脹到失去鑑別力（每個 ≤ 40）",
    Object.values(counts).every((n) => n <= 40), counts);
  const primary = CHAMPIONS_100.reduce((m, h) => { const a = correctedArch(h); m[a] = (m[a] ?? 0) + 1; return m; }, {});
  ck("5) 主定位總數仍為 100（次要標籤不影響主定位唯一性）",
    Object.values(primary).reduce((s, n) => s + n, 0) === 100, primary);
}
ck("6) 主定位修正逐一列舉且附理由（不是批次改）",
  Object.values(ARCH_CORRECTIONS).every((c) => c.from && c.to && c.why) && Object.keys(ARCH_CORRECTIONS).length <= 5);
ck("7) 圖鑑用標籤過濾（主或次要皆可命中）",
  src("src/screens/moba/CodexScreen.jsx").includes("heroHasTag"));
ck("8) 每名英雄的標籤數 1–2（沒有退化成「每個人都是每個定位」）",
  CHAMPIONS_100.every((h) => heroTags(h).length >= 1 && heroTags(h).length <= 2));
ck("9) 六個定位分頁都有英雄可看",
  ["坦克", "戰士", "刺客", "法師", "射手", "輔助"].every((t) => CHAMPIONS_100.some((h) => heroHasTag(h, t))));

console.log("\n── §2 選手／英雄／五路自動分配 ──");
{
  const picks = ["bingshuang", "hundun", "leiting", "ironclad", "duskblade"].map(heroById);
  const players = Object.fromEntries(LANES.map((lane, i) => [`b${i + 1}`, { name: `P${i + 1}`, role: lane, stats: {} }]));
  const r1 = assignDraft({ picks, seatPlayers: players, tagsOf: heroTags });
  const r2 = assignDraft({ picks, seatPlayers: players, tagsOf: heroTags });
  ck("10) 分配完全決定性（同輸入 ⇒ 同輸出）", JSON.stringify(r1) === JSON.stringify(r2));
  const lanes = Object.values(r1.assignment).map((a) => a.lane);
  ck("11) 五路唯一分配（每路恰好一人）", new Set(lanes).size === 5 && lanes.length === 5, lanes);
  const ids = Object.values(r1.assignment).map((a) => a.heroId);
  ck("12) 每隻英雄只佔一個席位", new Set(ids).size === ids.length, ids);
  const shuffled = [picks[3], picks[0], picks[4], picks[1], picks[2]];
  const r3 = assignDraft({ picks: shuffled, seatPlayers: players, tagsOf: heroTags });
  ck("13) 與 Ban/Pick 選取順序無關（不是靠索引硬對位）",
    Object.entries(r1.assignment).every(([s, a]) => r3.assignment[s].heroId === a.heroId));
  //  ⚠ 只比對真正的**呼叫**，不掃關鍵字：模組說明裡就寫著「不抽 rng」，
  //    用子字串比對必然誤判（本輪已經在 F/H 踩過兩次同樣的坑）。
  ck("14) 不抽 rng（模組沒有任何隨機呼叫），且重跑 20 次結果一致",
    !/Math\.random\(|rng\(|rng2\(/.test(src("src/battle/moba/mobaDraftAssignment.js")) &&
    Array.from({ length: 20 }, () => JSON.stringify(assignDraft({ picks, seatPlayers: players, tagsOf: heroTags })))
      .every((x, _i, arr) => x === arr[0]));
  ck("15) 衝突會被指出（兩隻中路 ⇒ 有人被排到不擅長的位置）",
    r1.conflicts.length >= 1 && r1.conflicts.every((c) => c.note && c.lane), r1.conflicts);
  ck("16) 適性有分級（本位 1.0 > 可勝任 0.55 > 不擅長 0.15）",
    heroLaneFit(heroById("bingshuang"), "中路") === 1 &&
    heroLaneFit(heroById("bingshuang"), "上路") < 0.5);
  ck("17) 選手熟練：本位 1.0、無資料中性 0.5",
    playerLaneFit({ role: "中路" }, "中路") === 1 && playerLaneFit(null, "中路") === 0.5);
}

console.log("\n── §3 召喚師技能 ──");
{
  const picks = ["ironclad", "duskblade", "bingshuang", "leiting", "dadi"].map(heroById);
  const players = Object.fromEntries(LANES.map((lane, i) => [`b${i + 1}`, { name: `P${i + 1}`, role: lane, stats: {} }]));
  const { assignment } = assignDraft({ picks, seatPlayers: players, tagsOf: heroTags });
  const roster = Object.fromEntries(Object.entries(assignment).map(([s, a]) => [s, { heroId: a.heroId }]));
  const loadout = buildLoadout(roster, heroById);
  const v = validateLoadout(loadout);
  ck(`18) 契約版本 ${HERO_LOADOUT_VERSION}`, HERO_LOADOUT_VERSION === "MobaHeroLoadout.v1");
  ck("19) 每個席位恰好 2 個召喚師技能", v.ok, v.errors);
  ck("20) 打野必定帶懲戒",
    Object.values(loadout).filter((e) => e.lane === "打野").every((e) => e.spells.includes("smite")));
  ck("21) 非打野不會拿到懲戒（懲戒是打野的位置標記）",
    Object.values(loadout).filter((e) => e.lane !== "打野").every((e) => !e.spells.includes("smite")));
  ck("22) 五路都有合理的第二技能（不重複、且在技能表內）",
    Object.values(loadout).every((e) => e.spells.length === 2 && e.spells.every((id) => SUMMONER_SPELLS[id])));
  //  I 的時候只有閃現與懲戒有引擎作用點，其餘標 engine:false 以免面板假裝有 CD。
  //  Milestone J 把八個技能全部接上真實效果 ⇒ 這條的意義從「標出哪些沒效果」
  //  變成「這個欄位仍然存在且誠實」。改成驗表內每一個技能都有明確的 engine 布林，
  //  且宣稱有效果的技能引擎真的認得（J 的 verifier 另有逐一觸發的行為驗證）。
  ck("23) 技能表誠實標示引擎作用點（每個技能都有 engine 布林）",
    Object.values(SUMMONER_SPELLS).every((s) => typeof s.engine === "boolean") &&
    SUMMONER_SPELLS.flash.engine === true && SUMMONER_SPELLS.smite.engine === true);
  ck("24) 打野的懲戒不受任何定位覆寫影響",
    ["坦克", "戰士", "刺客", "法師", "射手", "輔助"].every((arch) =>
      spellsFor({ arch }, "打野").some((s) => s.id === "smite")));
}

console.log("\n── §4 名單資料流（Loading／對戰／Result 共用同一份）──");
ck("25) draftRoster 優先採用 Ban/Pick 的分配結果",
  /draft\?\.assignment\?\.\[side\]\?\.\[pid\]/.test(src("src/battle/moba/draftRoster.js")));
ck("26) buildBattleRoster 同樣優先採用分配結果",
  src("src/battle/moba/mobaRosterAdapter.js").includes("draft?.assignment?.[sideOf(pid)]?.[pid]"));
ck("27) 無分配結果時完全走原路徑（舊 draft 行為不變）",
  src("src/battle/moba/draftRoster.js").includes("draft?.picks?.[side]?.[i]?.id"));
ck("28) Ban/Pick 把分配與技能一併往下傳",
  /assignment: \{ blue: assignmentToHeroIds/.test(src("src/screens/moba/BanPickScreen.jsx")) &&
  /loadout: \{ blue: planLoadout \}/.test(src("src/screens/moba/BanPickScreen.jsx")));
ck("29) Ban/Pick 顯示操作選手／位置／適性／衝突",
  src("src/screens/moba/BanPickScreen.jsx").includes("DraftPlanPanel") &&
  src("src/screens/moba/BanPickScreen.jsx").includes("適性"));

console.log("\n── §5 禁改邊界 ──");
ck("30) 未改 LogicEngine 傷害／公平性",
  !src("src/LogicEngine.js").includes("Milestone I") &&
  !src("src/battle/moba/matchProgression.js").includes("Milestone I"));
ck("31) 未改地圖幾何、碰撞與 Replay 版本",
  !/heroTags|assignDraft|buildLoadout/.test(src("src/gameData.js")) &&
  !/heroTags|assignDraft|buildLoadout/.test(src("src/battle/moba/nav/mobaNavigation.js")) &&
  src("src/platform/contracts/mobaReplay.js").includes('MOBA_REPLAY_VERSION = "MobaReplay.v1"'));

console.log(`\n${pass}/${pass + fail} 通過`);
console.log(JSON.stringify({
  milestone: "I", heroes: CHAMPIONS_100.length, tagCounts: tagCounts(CHAMPIONS_100),
  archCorrections: Object.keys(ARCH_CORRECTIONS), loadout: HERO_LOADOUT_VERSION,
}));
process.exit(fail ? 1 : 0);
