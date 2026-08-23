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

console.log("\n── 驗收標準檢查（裁決 B）──");
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

console.log("\n（保守情境刻意不設驗收門檻：40% 勝率的隊伍拿不到頂級贊助是正確的產品行為。）");
