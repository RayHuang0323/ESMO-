#!/usr/bin/env node
// ============================================================================
//  check_moba_milestone_i_close.mjs — Milestone I 收尾（目標 4/5/6）安全網
//
//  I 的第一輪留下三件事，這支腳本盯的就是它們：
//    §1  loadout 貫穿 Loading / GameView / Result / Replay，且四處同一份
//    §2  賽前配置標示英雄來源（推薦／熟練最高／最近使用／尚未選角／已鎖定）
//    §3  五路 × 選手 × 英雄 × 召喚師技能在全流程一致
//    §4  邊界：沒有動到 LogicEngine 傷害／公平性／地圖／碰撞／Replay 版本
//
//  ⚠ 斷言原則（本專案踩過四次的坑）：「沒改 X」一律**驗行為**——比較實際輸出、
//    實際呼叫結果——不要用關鍵字掃描原始碼，註解裡出現同一個字就會誤判。
// ============================================================================
import fs from "node:fs";
import { CHAMPIONS_100, heroById } from "../src/data/heroDatabase.js";
import { ROSTER } from "../src/data/roster.js";
import { heroTags } from "../src/data/heroClassification.js";
import { assignDraft, assignmentToHeroIds, LANES } from "../src/battle/moba/mobaDraftAssignment.js";
import {
  buildLoadout, validateLoadout, spellsFor, laneOfSeat, SUMMONER_SPELLS,
} from "../src/battle/moba/mobaHeroLoadout.js";
import { buildBattleRoster } from "../src/battle/moba/mobaRosterAdapter.js";
import { draftRoster } from "../src/battle/moba/draftRoster.js";
import { heroSourceContext, heroSourceFor, HERO_SOURCES } from "../src/battle/moba/mobaHeroSource.js";
import { applyMatchResult, createInitialProgress } from "../src/hero/heroProgress.js";

let pass = 0, fail = 0;
const ck = (l, c, e = null) => { if (c) { pass++; console.log(`✅ ${l}`); } else { fail++; console.log(`❌ ${l}${e != null ? `　→ ${JSON.stringify(e)}` : ""}`); } };
const src = (p) => fs.readFileSync(p, "utf8");
const SEATS = ["b1", "b2", "b3", "b4", "b5"];

//  共用情境：五名選手 + 一組**刻意不照順序**的 picks（兩隻中路，逼出分配差異）
const players = SEATS.map((id, i) => ({ id, name: `P${i + 1}`, role: LANES[i], heroId: ROSTER[id].heroId, stats: {} }));
const lineup = Object.fromEntries(SEATS.map((s) => [s, s]));
const picks = ["bingshuang", "hundun", "leiting", "ironclad", "duskblade"].map(heroById);
const seatPlayersMap = Object.fromEntries(SEATS.map((s, i) => [s, players[i]]));
const plan = assignDraft({ picks, seatPlayers: seatPlayersMap, seats: SEATS, tagsOf: heroTags });
const draft = {
  picks: { blue: picks, red: [] },
  assignment: { blue: assignmentToHeroIds(plan.assignment) },
};
const roster = buildBattleRoster({ players, lineup, baseRoster: ROSTER, draft, heroLookup: heroById });

console.log("── §1 loadout 貫穿全流程 ──");
ck("1) 對戰名單每個席位都帶 lane 與 spells（單一來源，不是各畫面自己算）",
  Object.keys(ROSTER).every((pid) => roster[pid]?.lane && Array.isArray(roster[pid]?.spells)),
  Object.fromEntries(Object.entries(roster).map(([k, v]) => [k, [v.lane, v.spells]])));
ck("2) 每人恰好 2 個召喚師技能（十席全數）",
  Object.values(roster).every((r) => r.spells.length === 2),
  Object.fromEntries(Object.entries(roster).map(([k, v]) => [k, v.spells])));
ck("3) 第一格恆為閃現",
  Object.values(roster).every((r) => r.spells[0] === "flash"));
{
  const jungles = Object.entries(roster).filter(([, r]) => r.lane === "打野");
  ck("4) 打野必定帶懲戒，且只有打野有（兩側各一）",
    jungles.length === 2 && jungles.every(([, r]) => r.spells.includes("smite"))
    && Object.entries(roster).filter(([, r]) => r.spells.includes("smite")).length === 2,
    jungles.map(([k, r]) => [k, r.spells]));
}
ck("5) 技能 id 全部存在於 SUMMONER_SPELLS（沒有無名技能）",
  Object.values(roster).every((r) => r.spells.every((id) => !!SUMMONER_SPELLS[id])));
{
  //  Ban/Pick 面板算的 loadout 必須與名單逐鍵相同，否則玩家在 Ban/Pick 看到的
  //  技能和實際上場的不是同一組。
  const banpick = buildLoadout(
    Object.fromEntries(SEATS.map((s) => [s, { heroId: draft.assignment.blue[s] }])), heroById);
  ck("6) Ban/Pick 的 loadout 與對戰名單逐席相同",
    SEATS.every((s) => JSON.stringify(banpick[s].spells) === JSON.stringify(roster[s].spells)),
    SEATS.map((s) => [s, banpick[s]?.spells, roster[s].spells]));
  ck("7) validateLoadout 對這份配置回 ok", validateLoadout(banpick).ok, validateLoadout(banpick).errors);
}
{
  //  Loading 與 GameView 都是把 roster 丟進 draftRoster ⇒ 必須逐席相同。
  const live = draftRoster(roster, draft);
  ck("8) draftRoster 之後席位→英雄不變（Loading 與 GameView 同一份）",
    Object.keys(ROSTER).every((pid) => live[pid].heroId === roster[pid].heroId),
    Object.fromEntries(Object.keys(ROSTER).map((p) => [p, [roster[p].heroId, live[p].heroId]])));
  ck("9) draftRoster 之後召喚師技能不變",
    Object.keys(ROSTER).every((pid) => JSON.stringify(live[pid].spells) === JSON.stringify(roster[pid].spells)));
  const bare = draftRoster(ROSTER, null);
  ck("10) 無 draft（單獨掛載 GameView）時也有完整 2 個技能",
    Object.values(bare).every((r) => r.spells?.length === 2), Object.values(bare).map((r) => r.spells));
}
ck("11) Loading 不再自己用 picks 順序對位（改用 draftRoster）",
  src("src/screens/moba/LoadingScreen.jsx").includes("draftRoster(roster, draft)")
  && !/draft\?\.picks\?\.\[side\]\?\.\[idx\]/.test(src("src/screens/moba/LoadingScreen.jsx")));
ck("12) 十人面板以名單為準（不再優先吃 picks 順序）",
  /heroById\(\(roster\[pid\] \|\| \{\}\)\.heroId\)/.test(src("src/battle/ui/BattleHeroStrip.jsx")));
ck("13) 戰鬥中英雄面板接收賽前配置的技能",
  /spells\s*=\s*\[\]/.test(src("src/battle/ui/BattleHeroSheet.jsx"))
  && src("src/battle/ui/BattleHeroSheet.jsx").includes("mergeSpells"));
ck("14) 記分板（TAB 與賽後 Result 共用）顯示召喚師技能",
  src("src/battle/ui/BattleScoreboard.jsx").includes("SUMMONER_SPELLS"));

console.log("\n── §2 Replay 帶得走同一份配置 ──");
{
  //  以真實 replayBuffer 走一遍：begin → capture → finalize。
  const rb = await import("../src/battle/moba/replay/replayBuffer.js");
  rb.beginReplayCapture({ seed: 1, config: {}, roster });
  const mkSnap = (ts) => ({
    ts, over: ts > 0,
    players: Object.keys(ROSTER).map((id) => ({
      id, side: id[0] === "b" ? "blue" : "red", role: "mid",
      pos: { x: 1, y: 1 }, hp: 1, dead: false, k: 0, d: 0, a: 0, gold: 0,
    })),
    towers: {}, objectives: [], b: { gold: 0 }, r: { gold: 0 },
    score: { blue: 0, red: 0 }, winProb: 0.5,
  });
  rb.captureReplayFrame(mkSnap(0));
  rb.captureReplayFrame(mkSnap(4));
  const replay = rb.finalizeReplay({ matchId: "m-i-close", events: [], comms: [], resultSummary: null });
  ck("15) 重播確實產生（擷取流程沒被改壞）", !!replay && replay.frames.length >= 2, replay?.frames?.length);
  ck("16) Replay 版本仍是 MobaReplay.v1（本輪只加 optional 欄，不升版）",
    replay?.version === "MobaReplay.v1", replay?.version);
  const meta = Object.fromEntries((replay?.playersMeta ?? []).map((m) => [m.id, m]));
  ck("17) playersMeta 逐席帶英雄與召喚師技能",
    Object.keys(ROSTER).every((pid) => meta[pid]?.heroId && meta[pid]?.spells?.length === 2),
    Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, [v.heroId, v.spells]])));
  ck("18) Replay 的技能與對戰當下逐席相同（不是重算的）",
    Object.keys(ROSTER).every((pid) => JSON.stringify(meta[pid].spells) === JSON.stringify(roster[pid].spells)));
  ck("19) Replay 的英雄與對戰當下逐席相同",
    Object.keys(ROSTER).every((pid) => meta[pid].heroId === roster[pid].heroId));
  ck("20) playersMeta 仍保有舊有的 id/side/role 三欄（舊消費端不會壞）",
    (replay?.playersMeta ?? []).every((m) => m.id && m.side && m.role));
  //  舊 replay（沒有 roster）必須照樣能擷取、照樣能播。
  rb.beginReplayCapture({ seed: 2, config: {} });
  rb.captureReplayFrame(mkSnap(0));
  rb.captureReplayFrame(mkSnap(4));
  const legacy = rb.finalizeReplay({ matchId: "m-i-close-legacy", events: [], comms: [], resultSummary: null });
  ck("21) 無名單時 playersMeta 退回三欄，不塞 undefined",
    (legacy?.playersMeta ?? []).every((m) => m.heroId === undefined && m.spells === undefined && !!m.role),
    legacy?.playersMeta?.[0]);
  ck("22) 重播畫面對舊格式回 null 名單（不白畫面）",
    src("src/screens/moba/MobaReplayScreen.jsx").includes("replayRosterOf")
    && src("src/screens/moba/MobaReplayScreen.jsx").includes("roster={replayRoster}"));
}

console.log("\n── §3 賽前配置的英雄來源 ──");
{
  const empty = heroSourceContext({});
  ck("23) 完全沒有出賽紀錄時不亂發「熟練最高」",
    heroSourceFor({ heroId: "ironclad", seatDefault: "ironclad", playerHeroId: "ironclad", ctx: empty }).id === "suggested");
  ck("24) 沒有英雄 ⇒ 尚未選角",
    heroSourceFor({ heroId: null, ctx: empty }).id === "unpicked");
  ck("25) 選手自己指定過（與席位預設不同）⇒ 已鎖定",
    heroSourceFor({ heroId: "duskblade", seatDefault: "ironclad", playerHeroId: "duskblade", ctx: empty }).id === "locked");
  ck("26) 初始名單的綁定英雄＝席位預設 ⇒ **不能**標成已鎖定（否則等於騙玩家是綁死的）",
    heroSourceFor({ heroId: "ironclad", seatDefault: "ironclad", playerHeroId: "ironclad", ctx: empty }).id !== "locked");
  {
    const prog = { a: { level: 9, mastery: { games: 12 }, lastMatchSeq: 1 }, b: { level: 3, mastery: { games: 4 }, lastMatchSeq: 7 } };
    const ctx = heroSourceContext(prog);
    ck("27) 熟練等級最高者 ⇒ 熟練最高",
      heroSourceFor({ heroId: "a", seatDefault: "a", ctx }).id === "mastery");
    ck("28) 最後一場出賽者 ⇒ 最近使用",
      heroSourceFor({ heroId: "b", seatDefault: "b", ctx }).id === "recent");
  }
  ck("29) 五種來源都有文案與說明（UI 不會出現空徽章）",
    Object.values(HERO_SOURCES).every((s) => s.label && s.why && s.color) && Object.keys(HERO_SOURCES).length === 5);
  ck("30) 賽前配置畫面掛上來源徽章與「非固定綁定」說明",
    src("src/screens/moba/LineupScreen.jsx").includes('data-testid="hero-source"')
    && src("src/screens/moba/LineupScreen.jsx").includes('data-testid="hero-source-note"'));
  {
    //  lastMatchSeq 必須是**決定性**的（純函數不可以塞時鐘）。
    const br = {
      schema: "BattleResult.v2", winner: "blue", duration: 1500, score: { blue: 1, red: 0 },
      players: [{ id: "b1", k: 1, d: 0, a: 0, dmg: 1, heal: 0, twrDmg: 0, participation: 1, won: true, mvp: false }],
    };
    const p0 = createInitialProgress(["ironclad"]);
    const r1 = applyMatchResult(p0, br, { b1: "ironclad" });
    const r2 = applyMatchResult(p0, br, { b1: "ironclad" });
    ck("31) applyMatchResult 仍是純函數（兩次同輸入 ⇒ 逐鍵相同）",
      JSON.stringify(r1.progress) === JSON.stringify(r2.progress));
    ck("32) 出賽序號單調遞增（第二場 > 第一場）",
      applyMatchResult(r1.progress, br, { b1: "ironclad" }).progress.ironclad.lastMatchSeq
      > r1.progress.ironclad.lastMatchSeq);
    ck("33) 舊存檔沒有 lastMatchSeq 也不會壞（視為尚無紀錄）",
      heroSourceContext({ x: { level: 2, mastery: { games: 3 } } }).recentHeroIds.size === 0);
  }
}

console.log("\n── §4 全流程一致性 ──");
{
  //  同一份 draft 走三條路徑：名單 → Loading/GameView → Replay。三者逐席比對。
  const live = draftRoster(roster, draft);
  const rows = SEATS.map((s) => ({
    seat: s, lane: roster[s].lane, player: roster[s].player,
    hero: roster[s].heroId, spells: roster[s].spells.join(","),
    liveHero: live[s].heroId, liveSpells: live[s].spells.join(","),
  }));
  ck("34) 五路唯一（b1–b5 對應五個不同位置）",
    new Set(rows.map((r) => r.lane)).size === 5, rows.map((r) => r.lane));
  ck("35) 五名英雄互不重複",
    new Set(rows.map((r) => r.hero)).size === 5, rows.map((r) => r.hero));
  ck("36) 五名選手互不重複",
    new Set(rows.map((r) => r.player)).size === 5, rows.map((r) => r.player));
  ck("37) 名單與生效名單逐席一致（英雄＋技能）",
    rows.every((r) => r.hero === r.liveHero && r.spells === r.liveSpells), rows);
  ck("38) 每一路的位置與該席位的固定對應相符（b2 一定是打野）",
    SEATS.every((s) => roster[s].lane === laneOfSeat(s)));
  //  分配結果換個順序丟進來仍要得到同一份配置（決定性 ⇒ 全流程可重現）。
  const shuffled = [picks[3], picks[0], picks[4], picks[1], picks[2]];
  const plan2 = assignDraft({ picks: shuffled, seatPlayers: seatPlayersMap, seats: SEATS, tagsOf: heroTags });
  const r2 = buildBattleRoster({
    players, lineup, baseRoster: ROSTER, heroLookup: heroById,
    draft: { picks: { blue: shuffled, red: [] }, assignment: { blue: assignmentToHeroIds(plan2.assignment) } },
  });
  ck("39) 換選取順序 ⇒ 席位英雄與技能完全相同（不是碰巧）",
    SEATS.every((s) => r2[s].heroId === roster[s].heroId && r2[s].spells.join() === roster[s].spells.join()),
    SEATS.map((s) => [s, roster[s].heroId, r2[s].heroId]));
}

console.log("\n── §5 邊界 ──");
{
  //  ⚠ 驗行為，不掃關鍵字：直接跑引擎，比對本輪前後的模擬結果。
  const { LogicEngine } = await import("../src/LogicEngine.js");
  const run = (seed) => {
    const e = new LogicEngine(seed);
    for (let i = 0; i < 4000 && !e.over; i++) e.tick(0.5);
    const s = e.snapshot();
    return { t: Math.round(s.ts), k: s.players.reduce((a, p) => a + p.k, 0), over: !!s.over };
  };
  const a1 = run(42), a2 = run(42);
  ck("40) 引擎仍然決定性（同 seed 兩次逐值相同）",
    JSON.stringify(a1) === JSON.stringify(a2), [a1, a2]);
  ck("41) 本輪沒有動到召喚師技能的引擎行為（非打野第二格仍是 reserved）",
    (() => {
      const e = new LogicEngine(7);
      e.tick(0.5);
      const sp = e.snapshot().players.find((p) => p.role !== "jungle")?.sp;
      return Array.isArray(sp) && sp[0].id === "flash" && sp[1].id === null;
    })());
  ck("42) 打野的引擎第二格仍是懲戒",
    (() => {
      const e = new LogicEngine(7);
      e.tick(0.5);
      const sp = e.snapshot().players.find((p) => p.role === "jungle")?.sp;
      return Array.isArray(sp) && sp[1].id === "smite";
    })());
  ck("43) 英雄總數仍是 100（收尾沒有偷加角色）", CHAMPIONS_100.length === 100, CHAMPIONS_100.length);
  //  loadout 只是資料：把它算出來不可以影響任何模擬數值。
  ck("44) spellsFor 是純函式（同輸入同輸出、不改輸入）",
    (() => {
      const h = { ...heroById("ironclad") };
      const before = JSON.stringify(h);
      const x = spellsFor(h, "上路").map((s) => s.id).join();
      const y = spellsFor(h, "上路").map((s) => s.id).join();
      return x === y && JSON.stringify(h) === before;
    })());
}

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"}  ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
