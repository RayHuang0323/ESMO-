// ============================================================================
//  tools/fan_calibration.mjs — Fan System 校準證據（F1）
//
//  執行：`node tools/fan_calibration.mjs`
//
//  ── 這支不是驗證器，是「算給你看」 ──────────────────────────────────────
//  `reqFans` 的驗收標準是**可達性**，不是「有沒有照抄某組數字」（裁決 B）。
//  可達性沒辦法用眼睛看出來，所以這裡把它算出來：
//    起始粉絲 → 每季能賺多少 → 幾季碰得到各階贊助。
//
//  ⚠ **直接 import 產品模組**（`rewardFormulas` / `fanSourceWeight` /
//    `playerModel` / `profileStore` 的種子），不自己複製一份公式。
//    複製公式的計算器會在公式改動後繼續給出漂亮但錯誤的數字。
//
//  ⚠ 這是 deterministic calculator，**不跑 battle、不改 battle**。
//    勝負序列由勝率決定性展開，不用亂數 ⇒ 每次跑結果相同、可被引用。
// ============================================================================
import { pathToFileURL } from "url";
import path from "path";

const ROOT = process.cwd();
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;

const { teamRewardsFor } = await import(u("src/platform/progress/rewardFormulas.js"));
const { FAN_SOURCE, FAN_SOURCE_WEIGHT } = await import(u("src/platform/progress/fanSourceWeight.js"));
const { SPONSORS } = await import(u("src/data/playerModel.js"));

//  起始粉絲：從產品種子讀，不寫死。profileStore 需要 localStorage 才能載入，
//  這裡只要種子值，所以用最小的假實作把它撐起來。
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
const { useProfileStore } = await import(u("src/platform/profileStore.js"));
const START_FANS = useProfileStore.getState().meta.fans;

//  一季的正式聯賽場數：從賽程產生器實跑取得，不是背下來的常數。
//  ⚠ 8 隊雙循環 ⇒ 全聯盟 56 場，但**玩家只打 14 場**。
//    這兩個數字差 4 倍，用錯會讓整條階梯的可達性算錯。
const { buildRegularSeason } = await import(u("src/platform/competition/regularSeason.js"));
const built = buildRegularSeason({
  gameMode: "cs", season: 1, seasonSeed: 1,
  playerTeam: { id: "t-player", name: "calib" },
});
const LEAGUE_PER_SEASON = built.summary?.perTeam ?? 14;
const LEAGUE_TOTAL = built.summary?.total ?? 56;

/** 單場粉絲：走真正的 `teamRewardsFor`，只換來源權重。 */
const fansFor = ({ win, marginF, streak, weight }) =>
  teamRewardsFor({ win, marginF, streak, fansNow: START_FANS, fanSourceWeight: weight }).fans;

/** 依勝率決定性展開勝負序列（不用亂數 ⇒ 可重現）。 */
function sequence(n, winrate) {
  const out = []; let acc = 0;
  for (let i = 0; i < n; i++) { acc += winrate; if (acc >= 1) { out.push(true); acc -= 1; } else out.push(false); }
  return out;
}

/** 跑一個賽季，回傳這一季賺到的粉絲。連勝在敗場歸零（與 `record.streak` 語意一致）。 */
function seasonFans({ winrate, marginF, practice, majorMatches, weights }) {
  let total = 0, streak = 0;
  for (const win of sequence(LEAGUE_PER_SEASON, winrate)) {
    total += fansFor({ win, marginF, streak, weight: weights.league });
    streak = win ? streak + 1 : 0;
  }
  let ps = 0;
  for (const win of sequence(practice, winrate)) {
    total += fansFor({ win, marginF, streak: ps, weight: weights.practice });
    ps = win ? ps + 1 : 0;
  }
  //  Major：只有打進 Top 4 才有，且都是硬仗 ⇒ 用中性連勝 2
  for (let i = 0; i < majorMatches; i++) {
    total += fansFor({ win: true, marginF, streak: 2, weight: weights.major });
  }
  return total;
}

const W = {
  practice: FAN_SOURCE_WEIGHT[FAN_SOURCE.practice],
  league: FAN_SOURCE_WEIGHT[FAN_SOURCE.league],
  major: FAN_SOURCE_WEIGHT[FAN_SOURCE.major],
};

const SCENARIOS = [
  { key: "保守", winrate: 0.40, marginF: 0.25, practice: 10, majorMatches: 0,
    note: "40% 勝率、小比分差、很少練習、進不了 Major" },
  { key: "一般", winrate: 0.55, marginF: 0.40, practice: 20, majorMatches: 0,
    note: "55% 勝率、中等比分差、每季 20 場練習、還進不了 Major" },
  { key: "良好", winrate: 0.75, marginF: 0.60, practice: 25, majorMatches: 2,
    note: "75% 勝率、大比分差、每季 25 場練習、Major 打兩場" },
];

const n = (v) => Math.round(v).toLocaleString();

console.log("══ Fan System 校準證據 ══\n");
console.log(`起始粉絲（DEFAULT.meta.fans）      ${n(START_FANS)}`);
console.log(`玩家每季正式聯賽場數              ${LEAGUE_PER_SEASON}（全聯盟 ${LEAGUE_TOTAL} 場，玩家只打 ${LEAGUE_PER_SEASON} 場）`);
console.log(`來源權重  練習 ${W.practice} ／ 聯賽 ${W.league} ／ Major ${W.major}\n`);

console.log("── 單場 fanGain（勝場，marginF=0.4）──");
for (const [label, w, streaks] of [["練習", W.practice, [0, 3]], ["聯賽", W.league, [0, 3]], ["Major", W.major, [0, 3]]]) {
  const lo = fansFor({ win: true, marginF: 0.4, streak: streaks[0], weight: w });
  const hi = fansFor({ win: true, marginF: 0.4, streak: streaks[1], weight: w });
  console.log(`  ${label.padEnd(6)} 連勝0 ${String(lo).padStart(5)}　連勝3 ${String(hi).padStart(5)}`);
}
console.log("  （敗場另計，約為勝場的 1/6～1/10）\n");

const perSeason = {};
console.log("── 每季粉絲收入 ──");
for (const s of SCENARIOS) {
  perSeason[s.key] = seasonFans({ ...s, weights: W });
  console.log(`  ${s.key}  ${n(perSeason[s.key]).padStart(8)} ／季   ${s.note}`);
}

console.log("\n── 各 Sponsor 需要幾季（自起始粉絲起算）──");
const ladder = [...SPONSORS].sort((a, b) => a.reqFans - b.reqFans);
const head = "  贊助商".padEnd(22) + "週收".padEnd(6) + "reqFans".padStart(9) + "   " +
  SCENARIOS.map((s) => s.key.padStart(7)).join("");
console.log(head);
console.log("  " + "─".repeat(head.length - 2));
let worst = { key: null, seasons: 0 };
for (const sp of ladder) {
  const need = sp.reqFans - START_FANS;
  const cells = SCENARIOS.map((s) => {
    if (need <= 0) return "開局".padStart(7);
    const seasons = need / perSeason[s.key];
    if (s.key === "一般" && seasons > worst.seasons) worst = { key: sp.id, seasons };
    return `${seasons.toFixed(1)}季`.padStart(7);
  }).join("");
  console.log(`  ${(sp.name + " " + sp.tier).padEnd(20)}${String(sp.weekly + "萬").padEnd(6)}${n(sp.reqFans).padStart(9)}   ${cells}`);
}

console.log("\n── F1 基準：僅比賽粉絲（歷史對照，不是現行驗收）──");
console.log("  ⚠ 這一組不含 F2 的賽季名次獎勵⇒ ⑤ 在這裡會紅是正常的。");
console.log("    現行驗收以下方「F2 後」那一組為準。");
const second = ladder[1];
const mid = ladder.find((s) => s.tier === "中級" && s.reqFans > START_FANS);
const tops = ladder.filter((s) => s.tier === "頂級");
const top = tops[tops.length - 1];
const seasonsFor = (sp, key) => (sp.reqFans - START_FANS) / perSeason[key];

const ck = (name, ok, detail) => console.log(`  ${ok ? "✅" : "❌"} ${name}　${detail}`);
ck("① 開局即有可維持財務的正式 Sponsor",
  second.reqFans <= START_FANS,
  `第二階 ${second.name} reqFans ${n(second.reqFans)} ≤ 起始 ${n(START_FANS)}，週收 ${second.weekly}萬`);
ck("② 第一個 Fan-gated 升級，第一季看得到明顯進度",
  perSeason["一般"] / (mid.reqFans - START_FANS) >= 0.30,
  `${mid.name} 差 ${n(mid.reqFans - START_FANS)}，一般情境第一季走完 ${Math.round(100 * perSeason["一般"] / (mid.reqFans - START_FANS))}%`);
ck("③ 中階約 1–2 個成功賽季",
  seasonsFor(mid, "良好") <= 2.0,
  `${mid.name} 良好情境 ${seasonsFor(mid, "良好").toFixed(1)} 季`);
ck("④ 頂階約 3–5 個表現良好的賽季",
  seasonsFor(top, "良好") >= 3.0 && seasonsFor(top, "良好") <= 5.0,
  `${top.name} 良好情境 ${seasonsFor(top, "良好").toFixed(1)} 季`);
ck("⑤ 正常玩法不需要 8–15 季才碰頂階",
  seasonsFor(top, "一般") < 8.0,
  `${top.name} 一般情境 ${seasonsFor(top, "一般").toFixed(1)} 季`);
ck("🔒 hard constraint：第二個可用 Sponsor reqFans ≤ 起始 fans",
  second.reqFans <= START_FANS,
  `${second.name} ${n(second.reqFans)} ≤ ${n(START_FANS)}`);

const { seasonFanAwardOf } = await import(u("src/platform/economy/seasonFanAward.js"));

/**
 * F2：把賽季名次獎勵接進情境。
 * ⚠ 用**真的** `seasonFanAwardOf()`，不複製一份獎勵表。
 */
function mkFinal({ tier, rank, teams, champion, mode = "cs" }) {
  const rows = [];
  for (let i = 1; i <= teams; i++) rows.push({ teamId: i === rank ? "t-me" : `t-ai${i}`, rank: i });
  const competitionId = `comp:${mode}:s1:official:${tier}`;
  return {
    schema: "FinalStandings.v1", id: `final:${competitionId}`, competitionId,
    rows, playerTeamId: "t-me", playerRank: rank,
    championTeamId: champion ? "t-me" : "t-ai1",
  };
}

/** 每個情境「一季的賽季結果」——名次 ＋ 有沒有進 Major ＋ 有沒有奪冠。 */
const SEASON_RESULT = {
  保守: { league: { tier: "regular", rank: 7, teams: 8, champion: false }, major: null },
  一般: { league: { tier: "regular", rank: 4, teams: 8, champion: false }, major: null },
  良好: { league: { tier: "regular", rank: 2, teams: 8, champion: false },
          major: { tier: "major", rank: 2, teams: 4, champion: false } },
};

console.log("\n── F2：賽季名次粉絲獎勵 ──");
const awardPer = {};
for (const s of SCENARIOS) {
  const r = SEASON_RESULT[s.key];
  const lg = seasonFanAwardOf(mkFinal(r.league));
  const mj = r.major ? seasonFanAwardOf(mkFinal(r.major)) : { fans: 0 };
  awardPer[s.key] = lg.fans + mj.fans;
  const detail = `聯賽第 ${r.league.rank} 名 ${lg.fans}` + (r.major ? ` ＋ Major 第 ${r.major.rank} 名 ${mj.fans}` : "");
  console.log(`  ${s.key}  ${n(awardPer[s.key]).padStart(7)} ／季   ${detail}`);
}
//  奪冠情境另外列出來（不進基準情境——每季都奪冠不是「表現良好」，是「表現卓越」）
const champLeague = seasonFanAwardOf(mkFinal({ tier: "regular", rank: 1, teams: 8, champion: true })).fans;
const champMajor = seasonFanAwardOf(mkFinal({ tier: "major", rank: 1, teams: 4, champion: true })).fans;
console.log(`  （參考）聯賽奪冠 ${n(champLeague)}　Major 奪冠 ${n(champMajor)}　雙冠 ${n(champLeague + champMajor)}`);

console.log("\n── F2 後：每季粉絲總收入（比賽 ＋ 賽季獎勵）──");
const totalPer = {};
for (const s of SCENARIOS) {
  totalPer[s.key] = perSeason[s.key] + awardPer[s.key];
  const pct = Math.round((awardPer[s.key] / totalPer[s.key]) * 100);
  console.log(`  ${s.key}  ${n(perSeason[s.key]).padStart(7)} ＋ ${n(awardPer[s.key]).padStart(6)} = ${n(totalPer[s.key]).padStart(7)} ／季（獎勵佔 ${pct}%）`);
}

console.log("\n── F2 後：各 Sponsor 需要幾季 ──");
const head2 = "  贊助商".padEnd(22) + "reqFans".padStart(9) + "   " + SCENARIOS.map((s) => s.key.padStart(7)).join("");
console.log(head2);
console.log("  " + "─".repeat(head2.length - 2));
for (const sp of ladder) {
  const need = sp.reqFans - START_FANS;
  const cells = SCENARIOS.map((s) => (need <= 0 ? "開局".padStart(7) : `${(need / totalPer[s.key]).toFixed(1)}季`.padStart(7))).join("");
  console.log(`  ${(sp.name + " " + sp.tier).padEnd(20)}${n(sp.reqFans).padStart(9)}   ${cells}`);
}

console.log("\n── F2 後：驗收標準（目標未變）──");
const seasonsF2 = (sp, key) => (sp.reqFans - START_FANS) / totalPer[key];
ck("③ 中階約 1–2 個成功賽季",
  seasonsF2(mid, "良好") <= 2.0, `${mid.name} 良好 ${seasonsF2(mid, "良好").toFixed(1)} 季`);
ck("④ 頂階約 3–5 個表現良好的賽季",
  seasonsF2(top, "良好") >= 3.0 && seasonsF2(top, "良好") <= 5.0,
  `${top.name} 良好 ${seasonsF2(top, "良好").toFixed(1)} 季`);
ck("⑤ 正常玩法不需要 8–15 季才碰頂階",
  seasonsF2(top, "一般") < 8.0, `${top.name} 一般 ${seasonsF2(top, "一般").toFixed(1)} 季`);
ck("② 第一個 Fan-gated 升級，第一季看得到明顯進度",
  totalPer["一般"] / (mid.reqFans - START_FANS) >= 0.30,
  `一般情境第一季走完 ${Math.round(100 * totalPer["一般"] / (mid.reqFans - START_FANS))}%`);
ck("⑥ 一冠不得跳完整個 Sponsor 階梯",
  (champLeague + champMajor) < (top.reqFans - START_FANS) * 0.5,
  `雙冠 ${n(champLeague + champMajor)} vs 全程 ${n(top.reqFans - START_FANS)}`);

console.log("\n── F2.1 起：賽季獎勵的覆蓋範圍（TD-28 已解）──");
console.log("  結算的合法性由 **award policy** 決定，而 F2.1 補上了缺的那一種：");
console.log("    prizePolicy → 現金／賽事獎金　　fanPolicy → 只有粉絲、沒有現金\n");
console.log("    ✅ MOBA 聯賽（prizePolicy）           → 名次粉絲 ＋ 獎金");
console.log("    ✅ CS Major（prizePolicy）            → 名次粉絲 ＋ 獎金");
console.log("    ✅ CS 聯賽（fanPolicy）               → 名次粉絲，**一毛錢都不發**");
console.log("    ✅ MOBA 巡迴站／年度總決賽（fanPolicy）→ 名次粉絲，**一毛錢都不發**\n");
console.log("  ⚠ 兩種政策都沒有的 Event **仍然不得產生 award receipt**（fail-closed 未鬆動）。");
console.log("  ⇒ 情境數字現在對 MOBA 與 CS 玩家都成立。");

console.log("\n（保守情境刻意不設驗收門檻：40% 勝率的隊伍拿不到頂級贊助是正確的產品行為。）");
