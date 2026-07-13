// Sprint23 CS Full Match Loop 驗證：repo 根目錄執行 `node tools/check_cs23.mjs`
// A) 結構檢查：流程接線 / MOBA-CS 分離。 B) 行為測試：契約轉換 + Store 回寫（真實公式）。
import fs from "fs";
const A = []; const ck = (n, c) => A.push([n, c]);

// ── A. 結構檢查 ────────────────────────────────────────────────────────────
const shell = fs.readFileSync("src/AppShell.jsx", "utf8");
ck("AppShell 六段 CS 流程(csPrep/csMap/csTactic/csLoading/cs/csResult)",
  ["csPrep", "csMap", "csTactic", "csLoading", '"cs"', "csResult"].every((s) => shell.includes(s)));
ck("AppShell 信標 S23", shell.includes("S23 SHELL"));
const dash = fs.readFileSync("src/screens/DashboardScreen.jsx", "utf8");
ck("Dashboard CS 入口 → csPrep", dash.includes('cs: "csPrep"'));

const csFiles = ["CsPrepScreen", "CsMapSelectScreen", "CsTacticScreen", "CsLoadingScreen", "CsMatchScreen", "CsResultScreen"]
  .map((f) => `src/screens/fps/${f}.jsx`);
ck("六個 CS 畫面檔存在", csFiles.every((f) => fs.existsSync(f)));
const csSrc = csFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n")
  + fs.readFileSync("src/battle/fps/fpsRoster.js", "utf8")
  + fs.readFileSync("src/battle/fps/csPrepData.js", "utf8")
  + fs.readFileSync("src/platform/contracts/CsMatchResult.js", "utf8");
const imports = csSrc.split("\n").filter((l) => /^\s*import\s/.test(l)).join("\n");
ck("CS 路徑零 heroDatabase / heroImages / HeroPortrait import（MOBA/CS 分離）",
  !/heroDatabase|heroImages|HeroPortrait/.test(imports));
ck("CS 路徑零 MOBA BattleResult / battleStore / heroProgress import",
  !/battleResult|battleStore|heroProgress|BattleEndScreen/i.test(imports));
ck("CS Result 無 QWER / 龍 / 塔 UI 字串", !/[QWER] 鍵|巴龍|小龍|防禦塔|遠古巨龍|水晶/.test(fs.readFileSync("src/screens/fps/CsResultScreen.jsx", "utf8")));
ck("CsMatchScreen 傳 tactic/tacticType 給引擎", /tactic=\{config\?\.tacticId/.test(csSrc) && /tacticType=\{config\?\.tacticType/.test(csSrc));

// ── B. 行為測試（契約 + Store 回寫，公式 = matchRecorder.updateEconomy）──
const { toCsMatchResult, validateCsMatchResult, CS_RESULT_SCHEMA } = await import("../src/platform/contracts/CsMatchResult.js");
const { updateEconomy } = await import("../src/platform/data/matchRecorder.js");
const { useProfileStore, WAN } = await import("../src/platform/profileStore.js");

// 引擎 buildMatchResult 形狀的代表性輸出（欄位對照 EsportsFPS3D.jsx:635-651；
// 引擎本體含 JSX 無法直接在 node 執行，真實 onComplete 路徑列入瀏覽器實測項）
const mkRaw = (id, win = true) => ({
  id, mode: "CS", map: "dust2", date: null,
  win, scoreT: win ? 8 : 5, scoreCT: win ? 3 : 8, tName: "德國海豹", ctName: "Compulsary",
  tactic: { ours: "A 長衝", theirs: "標準 2-1-2", ourType: "execute", theirType: "default" },
  ourPlayers: [
    { id: "t1", name: "Kratos", side: "t", role: "突破", roleKey: "entry", k: 18, d: 12, a: 4, adr: 84, hs: 8, hsPct: 44, kast: 72, mvpRounds: 2, clutches: 1, entryKills: 5, rating: 1.21 },
    { id: "t2", name: "Chad", side: "t", role: "步槍", roleKey: "rifler", k: 15, d: 10, a: 6, adr: 78, hs: 6, hsPct: 40, kast: 70, mvpRounds: 1, clutches: 0, entryKills: 2, rating: 1.1 },
    { id: "t3", name: "Pinata", side: "t", role: "狙擊", roleKey: "awp", k: 12, d: 9, a: 3, adr: 70, hs: 3, hsPct: 25, kast: 66, mvpRounds: 1, clutches: 1, entryKills: 1, rating: 1.02 },
    { id: "t4", name: "Craby", side: "t", role: "埋伏", roleKey: "lurker", k: 9, d: 11, a: 5, adr: 61, hs: 4, hsPct: 44, kast: 60, mvpRounds: 0, clutches: 0, entryKills: 0, rating: 0.9 },
    { id: "t5", name: "Lego", side: "t", role: "指揮", roleKey: "igl", k: 7, d: 10, a: 8, adr: 52, hs: 2, hsPct: 28, kast: 62, mvpRounds: 0, clutches: 0, entryKills: 0, rating: 0.84 },
  ],
  theirPlayers: [{ id: "ct1", name: "orgaNick", side: "ct", role: "指揮", roleKey: "igl", k: 10, d: 12, a: 5, adr: 60, hsPct: 30, kast: 58, mvpRounds: 0, clutches: 0, entryKills: 0, rating: 0.88 }],
  ourMvp: { name: "Kratos", role: "突破", rating: 1.21 },
  mvp: { name: "Kratos" }, topFraggers: [],
  rounds: [{ winner: "t", how: "elim" }, { winner: "ct", how: "bomb" }, { winner: "t", how: "defuse" }],
  roundCount: 11, fanGain: 0, prizeGain: 0, xpGain: 0,
});
const roster = [{ name: "Kratos", _gid: "b1" }, { name: "Chad", _gid: "b3" }, { name: "Pinata", _gid: "b4" }, { name: "Craby", _gid: "b2" }, { name: "Lego", _gid: "b5" }];
const ctx = { seed: 12345, mapKey: "dust2", mapName: "Dust II", tacticId: "f2", tacticName: "快攻rush", tacticType: "rush", roster };

const r1 = toCsMatchResult(mkRaw("cs_test_1"), ctx);
ck("契約 schema / mode", r1.schema === CS_RESULT_SCHEMA && r1.mode === "cs");
ck("契約 validate 通過", validateCsMatchResult(r1).ok);
ck("playerId 對回真實選手（name→_gid）", r1.players[0].playerId === "b1" && r1.mvp.playerId === "b1");
ck("比分 / winner / seed / map / tactic", r1.ourScore === 8 && r1.enemyScore === 3 && r1.winner === "us" && r1.seed === 12345 && r1.mapId === "dust2" && r1.tacticName === "快攻rush");
ck("引擎執行戰術保留（engineTactic）", r1.engineTactic.ours === "A 長衝" && r1.engineTactic.theirs === "標準 2-1-2");
ck("summaryEvents = 逐回合真實資料", r1.summaryEvents.length === 3 && r1.summaryEvents[0].winner === "us" && r1.summaryEvents[1].how === "bomb");
ck("duration 缺值誠實為 null（不編造）", r1.duration === null && r1.roundCount === 11);
ck("rewards 轉換當下未入帳（null）", r1.rewards.money === null && r1.recordedAt === null);

// ── Store 回寫 ──────────────────────────────────────────────────────────────
// ⚠ Sprint25 變更：CS 的發獎已從 recordCsMatch 移到「比賽完成邊界」settleCsMatch
//   （recordCsMatch 降級為只入史，否則會與 applyMatchProgress 雙倍入帳）。
//   本檔改為驅動**新入口**——但驗證的「保證」完全不變：
//   獎金/粉絲仍是 Legacy updateEconomy 公式、仍冪等、連勝仍取自 csHistory、敗場公式不變。
const { settleCsMatch } = await import("../src/platform/progress/settleCsMatch.js");
const st = () => useProfileStore.getState();
const funds0 = st().finance.funds, fans0 = st().meta.fans, inbox0 = st().inbox.length, tx0 = st().finance.transactions.length;

const rc1 = settleCsMatch(r1);
const e1 = st().csHistory[0];
const eco1 = updateEconomy({ record: { streak: 0 }, fanCount: 0, budget: 0, xp: { lv: 0, cur: 0, max: Number.MAX_SAFE_INTEGER } }, { win: true, marginF: Math.min(5 / 8, 1) });
ck("csHistory 寫入 1 筆", st().csHistory.length === 1 && st().csHistory[0].matchId === "cs_test_1");
ck("獎勵 = Legacy updateEconomy 公式（勝 margin5）", rc1.team.money === eco1.prizeGain * WAN && rc1.team.fans === eco1.fanGain);
ck("財務入帳（元）", st().finance.funds === funds0 + eco1.prizeGain * WAN);
ck("交易紀錄新增（獎金 income）", st().finance.transactions.length === tx0 + 1 && st().finance.transactions[0].cat === "prize");
ck("粉絲入帳", st().meta.fans === fans0 + eco1.fanGain);
ck("收件匣通知 +1（type=match）", st().inbox.length === inbox0 + 1 && st().inbox[0].type === "match" && st().inbox[0].unread === true);
ck("XP 不回寫 team.lv/xp（刻度不符）", st().team.lv === 93 && st().team.xp === 7.27);
// S25 新增保證：XP 改發給「選手」（csHistory.rewards.xp = 選手 XP 合計，非 Legacy 團隊 XP）
ck("S25：選手 XP 已回寫（entry.rewards.xp = receipt 選手 XP 合計 > 0）",
  e1.rewards.xp === rc1.totals.xpGained && rc1.totals.xpGained > 0 && e1.transactionId === rc1.transactionId);

const dup = settleCsMatch(r1);
ck("冪等：同 matchId 不重複入帳", st().csHistory.length === 1
  && st().finance.funds === funds0 + eco1.prizeGain * WAN
  && st().meta.fans === fans0 + eco1.fanGain
  && dup.alreadyApplied === true);

const r2 = toCsMatchResult(mkRaw("cs_test_2"), ctx);
settleCsMatch(r2);
const eco2 = updateEconomy({ record: { streak: 1 }, fanCount: 0, budget: 0, xp: { lv: 0, cur: 0, max: Number.MAX_SAFE_INTEGER } }, { win: true, marginF: Math.min(5 / 8, 1) });
ck("連勝 streak 來自 csHistory（第二勝 +25 粉絲）", st().csHistory[0].rewards.fans === eco2.fanGain && eco2.fanGain === eco1.fanGain + 25);

const r3 = toCsMatchResult(mkRaw("cs_test_3", false), ctx);
const rc3 = settleCsMatch(r3);
const eco3 = updateEconomy({ record: { streak: 0 }, fanCount: 0, budget: 0, xp: { lv: 0, cur: 0, max: Number.MAX_SAFE_INTEGER } }, { win: false, marginF: Math.min(3 / 8, 1) });
ck("敗場公式（獎金 8 萬 / 低粉絲）", rc3.team.money === eco3.prizeGain * WAN && eco3.prizeGain === 8 && rc3.team.fans === eco3.fanGain);
ck("契約拒收非 CS 結果", toCsMatchResult({ mode: "MOBA" }) === null && st().recordCsMatch({ schema: "BattleResult.v2" }) === null);

let p = 0; A.forEach(([n, c]) => { console.log((c ? "✅ " : "❌ ") + n); if (c) p++; });
console.log(p + "/" + A.length + " 通過"); process.exit(p === A.length ? 0 : 1);
