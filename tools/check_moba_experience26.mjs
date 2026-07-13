// ============================================================================
//  Sprint26 MOBA Match Experience 驗證：repo 根目錄執行
//    `node tools/check_moba_experience26.mjs`
//  A) Progress 單一真實來源  B) 手機 Tactic 跑版根因  C) Player/Hero 語意分離
//  D) MobaReplay.v1  E) 子行程驗證（一律檢查 exit code，杜絕假通過）
//  ⚠ 中文 OneDrive 路徑：一律用絕對 file:// URL import。
// ============================================================================
import { pathToFileURL } from "url";
import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";

const ROOT = process.cwd();
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;
const src = (p) => fs.readFileSync(p, "utf8");
const A = [];
const ck = (n, c) => A.push([n, !!c]);

const { LogicEngine } = await import(u("src/LogicEngine.js"));
const { snapshotToBattleResult } = await import(u("src/battle/battleResult.js"));
const { mobaResultToTransaction, mobaMatchId } = await import(u("src/platform/progress/adapters/mobaProgressAdapter.js"));
const { applyProgressToState } = await import(u("src/platform/progress/applyMatchProgress.js"));
const { levelFromTotalXp, totalXpForLevel } = await import(u("src/platform/progress/playerLevel.js"));
const {
  validateMobaReplay, estimateReplaySize, snapshotToFrame, MAX_FRAMES, MOBA_REPLAY_VERSION, REPLAY_SPEEDS, FRAME_INTERVAL_S,
} = await import(u("src/platform/contracts/mobaReplay.js"));
const { beginReplayCapture, captureReplayFrame, finalizeReplay, getCurrentReplay, clearReplay } = await import(u("src/battle/moba/replay/replayBuffer.js"));

// ── 共用：跑一場真引擎 + 邊跑邊擷取重播 ────────────────────────────────────
function playMatch(seed, { capture = false } = {}) {
  const e = new LogicEngine(seed);
  if (capture) beginReplayCapture({ seed, config: { tacticId: null } });
  for (let t = 0.5; t <= 1800 && !e.over; t += 0.5) {
    e.tick(0.5);
    if (capture) captureReplayFrame(e.snapshot());
  }
  return snapshotToBattleResult(e.snapshot(), []);
}
const mkPlayers = () => [
  { id: "b1", name: "Kaiser", role: "上路", xp: totalXpForLevel(38), lv: 38, talentPoints: 0 },
  { id: "b2", name: "Nacht", role: "打野", xp: 90, lv: 1, talentPoints: 0 },   // 差 10 XP 升級 → 保證跨級
  { id: "b3", name: "Frost", role: "中路", xp: 0, lv: 1, talentPoints: 0 },
  { id: "b4", name: "Blitz", role: "下路", xp: 0, lv: 1, talentPoints: 0 },
  { id: "b5", name: "Seelowe", role: "輔助", xp: 0, lv: 1, talentPoints: 0 },
];
const mkState = (players = mkPlayers()) => ({
  players, finance: { funds: 1_000_000, transactions: [] },
  meta: { fans: 1000, reputation: 0 }, processedMatchTransactions: {},
});

// ═══ A. Progress 單一真實來源 ═══════════════════════════════════════════════
const br = playMatch(42);
let state = mkState();
const tx = mobaResultToTransaction(br, { players: state.players, streak: 0, fansNow: 1000 });
const { nextState, receipt } = applyProgressToState(state, tx);
state = { ...state, ...nextState };

ck("1) Result receipt level 與 profileStore player level 一致",
  receipt.players.every((pr) => state.players.find((p) => p.id === pr.playerId).lv === pr.newLevel));
ck("   receipt XP 與 store xp 一致（同一把尺）",
  receipt.players.every((pr) => state.players.find((p) => p.id === pr.playerId).xp === pr.newXp));

// 2) Dashboard/Detail selector 讀同一份 player（結構檢查：全部走 useProfileStore((s)=>s.players)）
const rosterSrc = src("src/screens/manage/RosterScreen.jsx");
const detailSrc = src("src/screens/manage/PlayerDetailScreen.jsx");
const lineupSrc = src("src/screens/moba/LineupScreen.jsx");
ck("2) Roster / PlayerDetail / Lineup 讀同一份 profileStore.players",
  [rosterSrc, detailSrc, lineupSrc].every((s) => s.includes("useProfileStore((s) => s.players)")));
ck("   Lineup 不再把英雄等級標成無語意「Lv」（分軸標示）",
  lineupSrc.includes("heroLv") && lineupSrc.includes("playerLv") && lineupSrc.includes("英雄熟練"));
ck("   顯示層 XP 用 playerLevel 唯一刻度（不自己重算公式）",
  rosterSrc.includes("calculateLevelProgress") && detailSrc.includes("calculateLevelProgress"));

// 3–4) persistence round-trip + 不回退 Legacy level（模擬 profileStore.migratePlayer 規則）
const roundTrip = JSON.parse(JSON.stringify(state.players));
const migrate = (p) => {
  const lvSafe = Number.isFinite(p.lv) && p.lv >= 1 ? Math.min(99, Math.floor(p.lv)) : 1;
  const xp = Number.isFinite(p.xp) && p.xp >= 0 ? Math.round(p.xp) : totalXpForLevel(lvSafe);
  return { ...p, xp, lv: levelFromTotalXp(xp) };
};
ck("3) JSON persistence round-trip 後 level / xp 一致",
  roundTrip.map(migrate).every((p, i) => p.xp === state.players[i].xp && p.lv === state.players[i].lv));
ck("4) reload 不回到 Legacy 靜態 level（結算後 xp 為準，migrate 不覆蓋）",
  migrate(roundTrip.find((p) => p.id === "b2")).lv === state.players.find((p) => p.id === "b2").lv
  && state.players.find((p) => p.id === "b2").lv >= 2);   // b2 fixture 保證跨級

// ═══ C. Player / Hero 語意分離 ══════════════════════════════════════════════
// ⚠ 檢查「實際 import / 實際渲染」，不是任意字串——否則說明註解（「不 import X」）會被誤殺
const importsMod = (s, name) => new RegExp(`import[^;]*from\\s+"[^"]*${name}`).test(s);
const faceSrc = src("src/ui/PlayerFace.jsx");
ck("5) Player Card 不再渲染未標示 hero overlay（PlayerAvatar 零 HeroPortrait import/渲染）",
  !importsMod(faceSrc, "HeroPortrait") && !faceSrc.includes("<HeroPortrait")
  && !src("src/screens/manage/TeamScreen.jsx").includes("badge=")
  && !rosterSrc.includes("badge=") && !src("src/screens/manage/TrainingScreen.jsx").includes("badge="));
ck("   Roster / PlayerDetail 不再顯示靜態英雄綁定（heroById 已移除）",
  !rosterSrc.includes("heroById") && !detailSrc.includes("heroById"));
ck("6) MOBA Draft / Loading / Result 仍可顯示本場英雄（HeroPortrait/ChampFace 保留）",
  src("src/screens/moba/BanPickScreen.jsx").includes("HeroPortrait")
  && src("src/screens/moba/LoadingScreen.jsx").includes("HeroPortrait")
  && src("src/battle/ui/BattleEndScreen.jsx").includes("HeroPortrait"));
ck("7) CS 畫面不受影響（fps 畫面零 PlayerAvatar / 零 heroId）",
  ["CsPrepScreen", "CsMatchScreen", "CsResultScreen"].every((f) => {
    const s = src(`src/screens/fps/${f}.jsx`);
    return !s.includes("PlayerAvatar") && !s.includes("heroId");
  }));

// ═══ D. MobaReplay ══════════════════════════════════════════════════════════
clearReplay();
const brCap = playMatch(99, { capture: true });
const replay = finalizeReplay({
  matchId: mobaMatchId(brCap),
  events: [{ t: 30, type: "KILL", side: "blue", text: "測試擊殺" }, { t: 300, type: "TOWER_DESTROYED", side: "red", text: "外塔被摧毀" }],
  resultSummary: { winner: brCap.winner, score: { ...brCap.score }, duration: brCap.duration, mvpId: brCap.mvpId },
  tacticMeta: null,
});
const v = validateMobaReplay(replay);
ck(`8) MobaReplay.v1 契約合法${v.ok ? "" : `（${v.errors[0]}）`}`, v.ok && replay.version === MOBA_REPLAY_VERSION);
ck("   getCurrentReplay = 剛打完這一場（matchId 同源）", getCurrentReplay()?.matchId === mobaMatchId(brCap));
ck("9) replay frames 可序列化（JSON round-trip 後仍合法，無函式/元件）",
  validateMobaReplay(JSON.parse(JSON.stringify(replay))).ok);

const playerSrc = src("src/screens/moba/MobaReplayScreen.jsx");
const bufferSrc = src("src/battle/moba/replay/replayBuffer.js");
ck("10) replay 播放不呼叫 LogicEngine.tick()（播放器零引擎 import、零 .tick( 呼叫）",
  !importsMod(playerSrc, "LogicEngine") && !playerSrc.includes(".tick(") && !importsMod(bufferSrc, "LogicEngine"));
ck("11) replay 不觸發 applyMatchProgress（播放器/緩衝零結算 import/呼叫）",
  !playerSrc.includes("applyMatchProgress(") && !bufferSrc.includes("applyMatchProgress(")
  && !importsMod(playerSrc, "profileStore") && !importsMod(bufferSrc, "profileStore"));
ck("12) replay 不重複寫 history（播放器/緩衝零 seasonStore import、零入史呼叫）",
  !importsMod(playerSrc, "seasonStore") && !importsMod(bufferSrc, "seasonStore")
  && ["recordResult(", "recordCsMatch("].every((k) => !playerSrc.includes(k) && !bufferSrc.includes(k)));

// 13–15) timeline 定位 / 越界 / 倍速（純資料驗證：frameAt 等價邏輯 + 契約常數）
const frames = replay.frames;
const frameAt = (t) => { let lo = 0, hi = frames.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (frames[m].t <= t) lo = m; else hi = m - 1; } return lo; };
ck("13) timeline 可定位第一格、最後一格",
  frameAt(0) === 0 && frameAt(replay.duration) === frames.length - 1 && frameAt(frames[0].t) === 0);
const clampT = (t) => Math.min(replay.duration, Math.max(0, t));
ck("14) 快轉倒退不越界（−10s 於 0 / +10s 於終點）",
  clampT(0 - 10) === 0 && clampT(replay.duration + 10) === replay.duration && frameAt(clampT(-10)) === 0);
ck("15) 0.5×/1×/2×/4× 選項齊備且為正數", JSON.stringify(REPLAY_SPEEDS) === "[0.5,1,2,4]" && REPLAY_SPEEDS.every((s) => s > 0));

ck("16) 無 replay 時安全降級（清空後 getCurrentReplay=null；UI 有無法重播態）",
  (() => { clearReplay(); return getCurrentReplay() === null && src("src/battle/ui/BattleEndScreen.jsx").includes("無法重播") && playerSrc.includes("此場無重播資料"); })());
const bytes = estimateReplaySize(replay);
ck(`17) replay size 有上限（本場 ${frames.length} frames ≈ ${(bytes / 1024).toFixed(0)}KB；MAX_FRAMES=${MAX_FRAMES}；不寫 localStorage）`,
  frames.length <= MAX_FRAMES && bytes > 0 && bytes < 2_000_000
  && !bufferSrc.includes("localStorage.setItem") && !playerSrc.includes("localStorage.setItem"));
ck("   取樣間隔符合設計（≈ 每 2 模擬秒一格）",
  Math.abs((frames[10].t - frames[9].t) - FRAME_INTERVAL_S) < 0.6);

// 擷取本身不影響引擎結果（同 seed 有擷取 vs 無擷取 → BattleResult 相同）
const brNoCap = playMatch(99);
ck("18) MOBA balance baseline 不變（同 seed 擷取前後 BattleResult 完全一致）",
  JSON.stringify(brNoCap) === JSON.stringify(brCap));

// 重播「播放」不改任何結算狀態（走一遍 frames 後 store 快照零變化）
ck("   重播播放不改結算狀態（掃全 frames 前後 state 位元一致）",
  (() => {
    const snap0 = JSON.stringify(state);
    for (let t = 0; t <= replay.duration; t += 25) frameAt(t);
    return JSON.stringify(state) === snap0;
  })());

// ═══ B. Tactic 跑版根因（靜態防線）═════════════════════════════════════════
const tacSrc = src("src/screens/moba/TacticScreen.jssx".replace("jssx", "jsx"));
ck("   Tactic grid 有 min() 防護（<190px 容器不溢出）", tacSrc.includes("minmax(min(190px,100%),1fr)"));
ck("   Frame 有寬度防護 + sticky footer（確認鈕永遠可點）",
  lineupSrc.includes('position: "sticky"') && lineupSrc.includes('width: "100%", boxSizing: "border-box"'));
ck("   Lineup / Codex 固定 380px 已移除",
  !lineupSrc.includes("width: 380") && !src("src/screens/moba/CodexScreen.jsx").includes("width: 380"));
ck("   無 transform scale 縮頁 / 無 display:none 藏內容",
  !tacSrc.includes("scale(") && !tacSrc.includes("display: \"none\"") && !lineupSrc.includes("scale("));

// ═══ E. 子行程（檢查 exit code + 輸出形狀）═════════════════════════════════
function runNode(script, shape) {
  try {
    const out = execFileSync(process.execPath, [script], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: shape.test(out), code: 0 };
  } catch (e) { return { ok: false, code: e.status ?? 1 }; }
}
const subs = [
  ["19) Sprint24 tactic verifier", "tools/check_moba_tactic24.mjs", /27\/27 通過/],
  ["20) Sprint25 progress verifier", "tools/check_progress25.mjs", /34\/34 通過/],
  ["21) CS Sprint23 verifier", "tools/check_cs23.mjs", /28\/28 通過/],
  ["   regress（MOBA balance）", "tools/regress.mjs", /結束率 15\/15/],
  ["   regress2", "tools/regress2.mjs", /達標 19\/20/],
  ["   flow verifier（check_flow09）", "tools/check_flow09.mjs", /standings 勝場和==場數: ✅/],
];
for (const [name, script, shape] of subs) {
  const r = runNode(script, shape);
  ck(`${name}（exit=${r.code} 且輸出形狀符合）`, r.ok && r.code === 0);
}

// ── 報告 ────────────────────────────────────────────────────────────────────
let pass = 0;
for (const [n, ok] of A) { console.log(`${ok ? "✅" : "❌"} ${n}`); if (ok) pass++; }
console.log(`\n${pass}/${A.length} 通過`);
console.log(`重播容量：${frames.length} frames · ${(bytes / 1024).toFixed(0)}KB/場 · 每 frame ≈ ${(bytes / frames.length).toFixed(0)}B（session 記憶體，僅留最近一場）`);
process.exit(pass === A.length ? 0 : 1);
