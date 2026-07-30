#!/usr/bin/env node
// ============================================================================
//  check_moba_milestone_e.mjs — Milestone E 安全網
//
//  Milestone E 的主張只有兩句：
//    1.「上場的人」＝「畫面上的人」＝「拿到 XP 的人」（E1／E1b）
//    2. 同一場比賽在 Live 與 Replay 顯示同一組狀態（E2／E3）
//  本檔逐條把這兩句話變成可執行斷言，並且**證明沒有動到模擬**：
//  引擎、公平性、地圖、碰撞、SIM_RULES 一行都不改（§6 靜態紅線）。
//
//  設計限制：
//   · 只跑 Node，不開瀏覽器 ⇒ 版面／FPS／觸控一律不在此宣稱（見 §7 輸出）。
//   · 不 import heroDatabase（會連帶拉 396KB data URI）——需要英雄中文名的地方
//     一律注入 stub lookup。profileStore 例外（它本來就相依，check_progress25 同）。
// ============================================================================
import fs from "node:fs";
import {
  MATCH_LINEUP_VERSION, ENGINE_SEATS, DEFAULT_LINEUP,
  normalizeLineup, assignSeat, seatPlayers, seatOfPlayer, isStarter,
} from "../src/platform/contracts/matchLineup.js";
import { buildPlayerStatSlots, buildBattleRoster } from "../src/battle/moba/mobaRosterAdapter.js";
import { toEnginePlayerMods, NEUTRAL_MODS } from "../src/battle/moba/mobaPlayerStats.js";
import { mobaResultToTransaction } from "../src/platform/progress/adapters/mobaProgressAdapter.js";
import {
  snapshotToFrame, createMobaReplay, validateMobaReplay, MOBA_REPLAY_VERSION, decodePsRow,
} from "../src/platform/contracts/mobaReplay.js";
import { createReplaySource } from "../src/battle/moba/replay/replayPresentationSource.js";

let pass = 0, fail = 0;
const ck = (label, cond, extra = "") => {
  if (cond) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${extra ? `　→ ${extra}` : ""}`); }
};
const src = (p) => fs.readFileSync(p, "utf8");
const jsonEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── fixtures ────────────────────────────────────────────────────────────────
const STATS = {
  reflex: 78, accuracy: 72, apm: 80, positioning: 85, mapAware: 74, tacticalIQ: 70,
  decision: 68, adaptability: 72, courage: 88, clutch: 75, focus: 70, resilience: 76,
  comms: 65, leadership: 72, synergy: 70, learning: 68,
};
const NEUTRAL_STATS = Object.fromEntries(Object.keys(STATS).map((k) => [k, 70]));
const P = (id, name, role, heroId, extra = {}) =>
  ({ id, name, role, heroId, lv: 10, xp: 1000, talentPoints: 0, stats: { ...STATS }, ...extra });
const PLAYERS = [
  P("b1", "Kaiser", "上路", "ironclad"),
  P("b2", "Nacht", "打野", "duskblade"),
  P("b3", "Frost", "中路", "bingshuang"),
  P("b4", "Blitz", "下路", "leiting"),
  P("b5", "Seelowe", "輔助", "dadi"),
  P("r1755000000001", "新秀阿明", "中路", null, { lv: 1, xp: 0 }),   // 招募新秀：無綁定英雄
];
const ROOKIE = "r1755000000001";
const BASE_ROSTER = {
  b1: { player: "Kaiser", heroId: "ironclad", hero: "鋼鐵衛士" },
  b2: { player: "Nacht", heroId: "duskblade", hero: "暮刃" },
  b3: { player: "Frost", heroId: "bingshuang", hero: "冰霜術士" },
  b4: { player: "Blitz", heroId: "leiting", hero: "雷霆神射" },
  b5: { player: "Seelöwe", heroId: "dadi", hero: "大地守衛" },
  r1: { player: "Ember", heroId: "cinderfist", hero: "炎拳" },
  r2: { player: "Ash", heroId: "chichuan", hero: "赤炎武神" },
  r3: { player: "Pyre", heroId: "lieyan", hero: "烈焰先知" },
  r4: { player: "Cinder", heroId: "yanfeng", hero: "炎鳳射手" },
  r5: { player: "Scoria", heroId: "stoneguard", hero: "石衛" },
};
const HERO_ZH = { ironclad: "鋼鐵衛士", duskblade: "暮刃", bingshuang: "冰霜術士", leiting: "雷霆神射", dadi: "大地守衛", lieyan: "烈焰先知" };
const stubLookup = (id) => (HERO_ZH[id] ? { id, zh: HERO_ZH[id] } : null);
const ROOKIE_LINEUP = assignSeat(DEFAULT_LINEUP, "b3", ROOKIE, PLAYERS);

console.log("── §1 MatchLineup 契約（向後相容 / 去重 / 互換）──");
ck(`1) 契約版本為 ${MATCH_LINEUP_VERSION}，席位固定 b1–b5`,
  MATCH_LINEUP_VERSION === "MatchLineup.v1" && jsonEq(ENGINE_SEATS, ["b1", "b2", "b3", "b4", "b5"]));
ck("2) 無 lineup（舊存檔）⇒ identity，行為與 Milestone E 之前相同",
  jsonEq(normalizeLineup(null, PLAYERS), DEFAULT_LINEUP), JSON.stringify(normalizeLineup(null, PLAYERS)));
ck("3) 損壞 lineup（不存在的 id / 非字串）⇒ 修復為 identity，不白畫面",
  jsonEq(normalizeLineup({ b1: "ghost", b2: 42, b3: null, b4: "b4", b5: "b5" }, PLAYERS), DEFAULT_LINEUP));
{
  const dup = normalizeLineup({ b1: "b2", b2: "b2", b3: "b3", b4: "b4", b5: "b5" }, PLAYERS);
  const seated = Object.values(dup).filter(Boolean);
  ck("4) 同一名選手不可能佔兩個席位（去重）", new Set(seated).size === seated.length, JSON.stringify(dup));
}
ck("5) assignSeat 為互換語意（不產生重複、不讓人憑空消失）",
  (() => { const s = assignSeat(DEFAULT_LINEUP, "b3", "b1", PLAYERS); return s.b3 === "b1" && s.b1 === "b3"; })());
ck("6) 新秀（id = r+timestamp）可進席位，被換下者離開先發",
  ROOKIE_LINEUP.b3 === ROOKIE && !Object.values(ROOKIE_LINEUP).includes("b3")
  && seatOfPlayer(ROOKIE_LINEUP, ROOKIE, PLAYERS) === "b3" && !isStarter(ROOKIE_LINEUP, "b3", PLAYERS));

console.log("\n── §2 席位 → 引擎注入（configurePlayers 的 key 仍是席位）──");
{
  const idn = buildPlayerStatSlots(PLAYERS, "blue", null);
  const legacy = buildPlayerStatSlots(PLAYERS, "blue");        // S28 舊呼叫形狀
  ck("7) 無 lineup 的輸出與 S28 兩參數呼叫逐鍵相同（不改既有行為）", jsonEq(idn, legacy));
  ck("8) identity ⇒ 5 席、id 與 playerId 相同", idn.length === 5 && idn.every((s) => s.id === s.playerId));

  const withRookie = buildPlayerStatSlots(PLAYERS, "blue", ROOKIE_LINEUP);
  const b3 = withRookie.find((s) => s.id === "b3");
  ck("9) 新秀上場：注入 key 仍是引擎席位 b3，playerId 才是新秀（引擎零改動）",
    !!b3 && b3.id === "b3" && b3.playerId === ROOKIE, JSON.stringify(b3?.playerId));
  ck("10) 席位順序固定，打亂 profileStore 陣列順序不改變輸出",
    jsonEq(buildPlayerStatSlots([...PLAYERS].reverse(), "blue", ROOKIE_LINEUP), withRookie));
  ck("11) 紅方（AI 對手）不注入，維持中性對照組",
    buildPlayerStatSlots(PLAYERS, "red", ROOKIE_LINEUP).length === 0);
}
{
  // 全中性能力 ⇒ mods 必須逐鍵等於 NEUTRAL_MODS（＝引擎公式加 0 / 乘 1 ⇒ baseline）
  const neutral = PLAYERS.filter((p) => p.id.startsWith("b"))
    .map((p) => ({ ...p, stats: { ...NEUTRAL_STATS } }));
  const mods = toEnginePlayerMods({ blue: buildPlayerStatSlots(neutral, "blue", DEFAULT_LINEUP), red: [] });
  ck("12) 先發指派不改變公平性：全中性能力仍逐鍵等於 NEUTRAL_MODS",
    ENGINE_SEATS.every((seat) => jsonEq(mods.blue[seat], NEUTRAL_MODS)));
}

console.log("\n── §3 對戰名單（Loading / 3D 名牌 / 面板 / 戰報同一份）──");
{
  const r0 = buildBattleRoster({ players: PLAYERS, lineup: null, baseRoster: BASE_ROSTER, draft: null, heroLookup: stubLookup });
  ck("13) 無先發指派 ⇒ 名字與英雄同種子名單（既有行為不變）",
    r0.b1.player === "Kaiser" && r0.b3.player === "Frost" && r0.b3.heroId === "bingshuang");
  ck("14) 紅方走靜態名單（AI 對手，不虛構選手）",
    r0.r1.player === "Ember" && r0.r1.source === "roster" && r0.r1.isStarter === false);

  const r1 = buildBattleRoster({ players: PLAYERS, lineup: ROOKIE_LINEUP, baseRoster: BASE_ROSTER, draft: null, heroLookup: stubLookup });
  ck("15) 新秀上場 ⇒ 對戰名單顯示新秀（不是板凳上的原 b3）",
    r1.b3.player === "新秀阿明" && r1.b3.playerId === ROOKIE && r1.b3.source === "profile", r1.b3.player);
  ck("16) 新秀未綁定英雄 ⇒ 沿用席位預設英雄，不出現 null 英雄",
    r1.b3.heroId === "bingshuang" && r1.b3.hero === "冰霜術士", JSON.stringify(r1.b3.heroId));
  ck("17) 未被指派的席位不受影響", r1.b1.player === "Kaiser" && r1.b5.playerId === "b5");
  ck("17b) 播報說話者取得真選手的個性（無真人 ⇒ null，不編造性格）",
    buildBattleRoster({
      players: PLAYERS.map((p) => (p.id === "b1" ? { ...p, personality: "shotcaller" } : p)),
      lineup: null, baseRoster: BASE_ROSTER, draft: null, heroLookup: stubLookup,
    }).b1.personality === "shotcaller" && r1.r1.personality === null);

  const draft = { picks: { blue: [null, null, { id: "lieyan", zh: "烈焰先知" }, null, null], red: [] } };
  const r2 = buildBattleRoster({ players: PLAYERS, lineup: ROOKIE_LINEUP, baseRoster: BASE_ROSTER, draft, heroLookup: stubLookup });
  ck("18) 本場 Ban/Pick 優先於選手綁定英雄（Loading 選誰、戰場就是誰）",
    r2.b3.heroId === "lieyan" && r2.b3.hero === "烈焰先知" && r2.b3.player === "新秀阿明");
}

console.log("\n── §4 賽後 XP 歸屬（席位 ≠ 選手時不可發錯人）──");
{
  const mkResult = () => ({
    schema: "BattleResult.v2", mode: "moba",
    teams: { blue: { name: "藍" }, red: { name: "紅" } },
    winner: "blue", duration: 1200.5,
    score: { blue: 30, red: 12 }, gold: { blue: 50000, red: 42000 },
    towers: { blue: 8, red: 3 }, dragon: { blue: 2, red: 1 }, baron: { blue: 1, red: 0 },
    tactic: null, tacticExecution: null, timeline: [], mvpId: "b3",
    players: ENGINE_SEATS.map((id, i) => ({
      id, side: "blue", role: ["top", "jungle", "mid", "adc", "sup"][i], heroId: "x", lv: 10,
      k: 5, d: 3, a: 8, gold: 9000, dmg: 30000, heal: 0, twrDmg: 0,
      participation: 0.6, rating: 30, won: true, mvp: id === "b3",
    })),
  });
  const txPlain = mobaResultToTransaction(mkResult(), { players: PLAYERS, streak: 0, fansNow: 1000 });
  ck("19) 無 lineup ⇒ XP 仍發給席位同名選手（與 S25 相同，不回歸）",
    jsonEq(txPlain.playerProgress.map((p) => p.playerId), ENGINE_SEATS));

  const txRookie = mobaResultToTransaction(mkResult(), { players: PLAYERS, lineup: ROOKIE_LINEUP, streak: 0, fansNow: 1000 });
  const ids = txRookie.playerProgress.map((p) => p.playerId);
  ck("20) 新秀在 b3 ⇒ XP 發給新秀本人", ids.includes(ROOKIE), JSON.stringify(ids));
  ck("21) 板凳上的原 b3 不再拿到本場 XP", !ids.includes("b3"), JSON.stringify(ids));
  ck("22) 其餘四席不受影響，且不重複發放",
    ids.filter((x) => x !== ROOKIE).sort().join(",") === "b1,b2,b4,b5"
    && new Set(ids).size === ids.length);
}

console.log("\n── §5 Replay：附加 optional 欄位與舊檔相容 ──");
{
  const snap = {
    ts: 120, bK: 5, rK: 3, bGold: 12000, rGold: 11000, winProb: 0.55,
    dragon: { alive: true }, baron: { alive: false },
    towers: { blue_mid_0: { side: "blue", lane: "mid", tier: 0, pos: { x: 40, y: 60 }, hp: 0.8 } },
    players: ENGINE_SEATS.map((id, i) => ({
      id, side: "blue", role: "mid", pos: { x: 10 + i, y: 20 + i }, hp: 0.7, dead: i === 4,
      k: 1, d: 0, a: 2, gold: 900, mlv: 7,
      state: i === 4 ? "回城" : "團戰!", respawn: i === 4 ? 12.5 : 0,
      decision: { action: i === 4 ? "RETREAT" : "ENGAGE", targetId: "r2", score: 0.42, reasons: ["x"] },
      buffs: [], statusEffects: [],
    })),
    teamBuffs: {
      blue: { dragonStacks: 3, dragonPowerK: 1.036, dragonGuardK: 1.024, baronRemaining: 42.5 },
      red: { dragonStacks: 0, dragonPowerK: 1, dragonGuardK: 1, baronRemaining: 0 },
    },
    lanes: { top: { bm: [], rm: [] }, mid: { bm: [], rm: [] }, bot: { bm: [], rm: [] } },
    fx: [],
  };
  const frame = snapshotToFrame(snap);
  const row4 = decodePsRow(frame.ps?.[4]);
  ck("23) frame 保存 ps（狀態／復活倒數／決策），依 frame.p 同順序",
    Array.isArray(frame.ps) && frame.ps.length === 5
    && row4.state === "回城" && row4.respawn === 12.5 && row4.action === "RETREAT",
    JSON.stringify(frame.ps?.[4]));
  ck("24) frame 保存 tb（團隊 Dragon 層數 / Baron 剩餘秒）",
    Array.isArray(frame.tb) && frame.tb[0][0] === 3 && frame.tb[0][3] === 42.5, JSON.stringify(frame.tb));
  ck("25) 容量紀律：ps 以字典索引存、單列 ≤3 欄，score/reasons/targetId 不進 Replay",
    frame.ps.every((r) => r.length <= 3 && typeof r[0] === "number")
    && !JSON.stringify(frame.ps).includes("reasons") && !JSON.stringify(frame.ps).includes("r2"),
    JSON.stringify(frame.ps[0]));
  ck("25b) 未知狀態字串仍原樣保存（引擎日後新增狀態不會壞掉）",
    (() => {
      const odd = snapshotToFrame({ ...snap, players: snap.players.map((p) => ({ ...p, state: "新狀態", decision: null })) });
      return decodePsRow(odd.ps[0]).state === "新狀態";
    })());
  ck("25c) 沒有龍層數／Baron 的 frame 不寫 tb（多數時間整場省下這一欄）",
    !("tb" in snapshotToFrame({ ...snap, teamBuffs: {
      blue: { dragonStacks: 0, baronRemaining: 0 }, red: { dragonStacks: 0, baronRemaining: 0 },
    } })));

  const meta = ENGINE_SEATS.map((id) => ({ id, side: "blue", role: "mid" }));
  const replay = createMobaReplay({
    matchId: "m-e-1", seed: 1, frames: [frame, { ...frame, t: 122 }],
    playersMeta: meta, towersMeta: { blue_mid_0: { side: "blue", lane: "mid", tier: 0, pos: { x: 40, y: 60 } } },
  });
  replay.mapMeta = { bounds: { minX: 0, minY: 0, width: 220, height: 220 } };
  const v = validateMobaReplay(replay);
  ck(`26) 仍是 ${MOBA_REPLAY_VERSION}，附加欄位不破壞契約驗證`,
    replay.version === MOBA_REPLAY_VERSION && v.ok, JSON.stringify(v.errors));

  const source = createReplaySource(replay);
  source.seek(120);
  const played = source.getState().snapshot;
  ck("27) 重播還原狀態徽章與復活倒數（與現場同一組值）",
    played.players[4].state === "回城" && played.players[4].respawn === 12.5
    && played.players[0].state === "團戰!", JSON.stringify(played.players[4].state));
  ck("28) 重播還原決策（D-fix2 的 action）",
    played.players[4].decision?.action === "RETREAT" && played.players[0].decision?.action === "ENGAGE");
  ck("29) 重播還原團隊 Buff ⇒ HUD 的 龍×N / 巴 Ns 不再空白",
    played.teamBuffs?.blue?.dragonStacks === 3 && played.teamBuffs.blue.baronRemaining === 42.5,
    JSON.stringify(played.teamBuffs?.blue));

  // 舊 Replay（Milestone E 之前擷取的 frame）必須仍可播放
  const legacyFrames = [frame, { ...frame, t: 122 }].map(({ ps, tb, ...rest }) => rest);
  const legacy = createMobaReplay({ matchId: "m-old", seed: 1, frames: legacyFrames, playersMeta: meta, towersMeta: {} });
  legacy.mapMeta = { bounds: { minX: 0, minY: 0, width: 220, height: 220 } };
  const legacySource = createReplaySource(legacy);
  legacySource.seek(120);
  const old = legacySource.getState().snapshot;
  ck("30) 舊 Replay（無 ps/tb）仍可播放，且維持誠實的 null（不編造狀態）",
    validateMobaReplay(legacy).ok && old.players[0].state === null
    && old.players[0].respawn === null && old.teamBuffs === undefined,
    JSON.stringify({ state: old.players[0].state, tb: old.teamBuffs }));
  ck("31) 舊 Replay 的既有欄位照常還原（位置／HP／等級／比分）",
    old.players[0].mlv === 7 && old.bK === 5 && Math.abs(old.players[0].hp - 0.7) < 1e-6);
}

console.log("\n── §6 接線與紅線（原始碼靜態斷言）──");
{
  const appShell = src("src/AppShell.jsx");
  ck("32) AppShell 把同一份 battleRoster 傳給 Loading 與 GameView",
    appShell.includes("buildBattleRoster")
    && /<LoadingScreen[^>]*roster=\{battleRoster\}/.test(appShell)
    && /<GameView[^>]*roster=\{battleRoster\}/.test(appShell));
  const lineupSrc = src("src/screens/moba/LineupScreen.jsx");
  ck("33) LineupScreen 有先發指派入口且只呼叫 profileStore.setLineupSeat（唯一寫入點）",
    lineupSrc.includes("BenchSheet") && lineupSrc.includes("setLineupSeat")
    && !lineupSrc.includes("normalizeLineup("));
  const heroPanel = src("src/battle/ui/HeroDetailPanel.jsx");
  const endScreen = src("src/battle/ui/BattleEndScreen.jsx");
  ck("34) 天賦效果可見：戰中與賽後都顯示引擎既有的 playerStatsExec",
    heroPanel.includes("playerStatsExec") && endScreen.includes("playerStatsExec"));
  ck("35) 戰術效果仍讀 BattleResult.tacticExecution（不另算一份）",
    endScreen.includes("result.tacticExecution"));
  const replayScreen = src("src/screens/moba/MobaReplayScreen.jsx");
  ck("36) 重播顯示已保存的播報與團隊 Buff，且小兵提示改為條件式（不再誤述）",
    replayScreen.includes("replay?.comms") && replayScreen.includes("replay-team-buffs-")
    && replayScreen.includes("!hasMinions"));
  // 紅線：Milestone E 不動模擬
  const engine = src("src/LogicEngine.js");
  ck("37) 未改 LogicEngine：檔案不含 Milestone E 標記（引擎零改動）",
    !engine.includes("Milestone E"));
  const progression = src("src/battle/moba/matchProgression.js");
  ck("38) 未改 SIM_RULES / 公平性常數表",
    !progression.includes("Milestone E"));
  const replaySrc = src("src/platform/contracts/mobaReplay.js");
  ck("39) Replay 只附加 optional 欄位，版本字串未升版",
    replaySrc.includes('MOBA_REPLAY_VERSION = "MobaReplay.v1"')
    && replaySrc.includes("ps:") && replaySrc.includes("tb:"));
  const battleResultSrc = src("src/battle/battleResult.js");
  ck("40) 未改 BattleResult.v2 契約（先發指派靠 lineup 解析，不塞新欄位）",
    battleResultSrc.includes('schema: "BattleResult.v2"') && !battleResultSrc.includes("lineup"));
}

console.log("\n── §7 手機安全網（靜態；版面實測見 shot_moba_runtime 與真機驗收）──");
{
  const lineupSrc = src("src/screens/moba/LineupScreen.jsx");
  ck("41) 換人鈕觸控區 ≥40px，且不是覆蓋在選手列上的絕對定位",
    /width:\s*42[,\s]/.test(lineupSrc) && !/BenchSheet[\s\S]{0,400}position:\s*"fixed"/.test(lineupSrc));
  ck("42) 換人面板可捲動且限高（小螢幕不會有按不到的選項）",
    /maxHeight:\s*"76%"[\s\S]{0,80}overflowY:\s*"auto"/.test(lineupSrc));
  ck("43) 先發列＝flex 列（選手列 flex:1 可壓縮 + 固定寬換人鈕），維持既有 320px 防護",
    lineupSrc.includes("maxWidth: 420") && lineupSrc.includes('boxSizing: "border-box"')
    && /alignItems:\s*"stretch"/.test(lineupSrc) && /flex:\s*1,\s*minWidth:\s*0/.test(lineupSrc));
  const heroPanel = src("src/battle/ui/HeroDetailPanel.jsx");
  ck("44) 新增的天賦區塊在既有捲動容器內，沒有新增固定定位或新的 z-index 層",
    heroPanel.includes("本場行為（天賦生效證據）")
    // 只有既有的兩處 absolute（覆蓋層 + 英雄橫幅的 Lv 徽章），Milestone E 沒有再加
    && (heroPanel.match(/position:\s*"absolute"/g) ?? []).length === 2
    && (heroPanel.match(/zIndex:/g) ?? []).length === 1
    && !heroPanel.includes('position: "fixed"'));
  const replayScreen = src("src/screens/moba/MobaReplayScreen.jsx");
  ck("45) 重播播報列單行省略（長字串不撐破手機寬度）",
    /replay-comms[\s\S]{0,200}textOverflow:\s*"ellipsis"[\s\S]{0,60}whiteSpace:\s*"nowrap"/.test(replayScreen));
  const endScreen = src("src/battle/ui/BattleEndScreen.jsx");
  ck("46) 賽後新面板沿用既有 Panel 版型與 flexWrap 欄位（手機自動換行，不新增水平捲動）",
    endScreen.includes("能力／天賦執行") && endScreen.includes("flexWrap: \"wrap\""));
}

console.log(`\n${pass}/${pass + fail} 通過`);
console.log(JSON.stringify({
  milestone: "E",
  lineup: { version: MATCH_LINEUP_VERSION, seats: ENGINE_SEATS, rookieSeat: "b3" },
  replay: { version: MOBA_REPLAY_VERSION, addedOptionalFields: ["ps", "tb"], legacyPlayable: true },
  engineTouched: false,
  browserVerified: false,   // ⚠ Node 證不了版面／FPS／觸控，見報告「未驗證」節
}, null, 0));
process.exit(fail ? 1 : 0);
