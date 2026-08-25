#!/usr/bin/env node
// ============================================================================
//  tools/check_growth_ui_p1.mjs — Milestone P1：選手成長可視化
//
//  執行：repo 根目錄 `node tools/check_growth_ui_p1.mjs`；**失敗時 exit 1**。
//
//  ── P1 要證明什麼 ─────────────────────────────────────────────────────────
//  P0／P0-2／P0-3 讓「練了會變強」成立，P1 要讓玩家**看得見**，而且看見的
//  必須**就是實際發生的事**——不是重算一次、不是照課程定義猜的。
//
//  §1 成長帳簿的純邏輯（去重、上限、不得產生假成長、成長前→後可還原）
//  §2 比賽結算：一次結算一筆；重送同一 receipt 不重複加入
//  §3 訓練結算：訓練一次只加一次；日誌值＝實際套用值（不是課程定義）
//  §3v1.1 Training v1.1：推進日、1/2/3 日課程、取消、多人、成長修正因子
//  §4 邊界情況：無升級但有成長／有升級但能力已達上限
//  §5 持久化：重整（存檔往返）後紀錄仍在
//  §6 UI 未定義識別字掃描（build 抓不到的白畫面 bug）
//  §7 UI 未重算：畫面層不得出現任何成長公式
//  §8 P0 系列演算未被修改（原始碼指紋）
// ============================================================================
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";

const traverse = _traverse.default ?? _traverse;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(resolve(ROOT, p), "utf8");

// 讓本 verifier 能測到既有 profileStore 的實際 save/load 邊界；不是第二套
// persistence，也不改產品 runtime。每次 verifier process 都使用全新的記憶體儲存。
const verifyStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => verifyStorage.has(key) ? verifyStorage.get(key) : null,
  setItem: (key, value) => verifyStorage.set(key, String(value)),
  removeItem: (key) => verifyStorage.delete(key),
};

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

const G = await import("../src/platform/progress/growthLog.js");
const { applyProgressToState } = await import("../src/platform/progress/applyMatchProgress.js");
const { useProfileStore } = await import("../src/platform/profileStore.js");
const { TRAINING_COURSES, courseById, calculateCourse } = await import("../src/data/playerModel.js");
const { createMatchProgressTransaction } = await import("../src/platform/contracts/matchProgressTransaction.js");

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §1 成長帳簿：純邏輯 ══");
{
  const e1 = G.makeGrowthEntry({
    id: "x1", source: "training", courseId: "mental", label: "心理訓練",
    gains: { focus: 1.2, clutch: 0.8 }, statsAfter: { focus: 71.2, clutch: 60.8 },
  });
  ck("§1a 建立紀錄：只留有變動的項目", e1 && Object.keys(e1.gains).length === 2, JSON.stringify(e1.gains));
  ck("§1b 差值總和正確", e1.total === 2, `total=${e1.total}`);

  const ba = G.beforeAfter(e1, "focus");
  ck("§1c 成長前 → 成長後可精確還原", ba.from === 70 && ba.to === 71.2 && ba.gain === 1.2,
    `${ba.from} → ${ba.to} (+${ba.gain})`);

  //  ⚠ 這條是「不得產生假的能力成長」的核心
  const fake = G.makeGrowthEntry({ id: "x2", source: "training", gains: { focus: 0, apm: -3, x: "abc" } });
  ck("§1d 0／負值／非數字一律不算成長",
    Object.keys(fake.gains).length === 0 && fake.total === 0, JSON.stringify(fake.gains));
  ck("§1e 完全沒有變化的紀錄不會被加入", G.appendGrowth([], fake).length === 0);

  //  去重（重送同一筆）
  let log = G.appendGrowth([], e1);
  log = G.appendGrowth(log, e1);
  log = G.appendGrowth(log, { ...e1, gains: { focus: 99 }, total: 99 });   // 同 id、不同內容
  ck("§1f 同一個 id 不重複加入，也不覆寫既有內容",
    log.length === 1 && log[0].total === 2, `len=${log.length} total=${log[0].total}`);

  //  上限
  let cap = [];
  for (let i = 0; i < 30; i++) {
    cap = G.appendGrowth(cap, G.makeGrowthEntry({ id: `c${i}`, source: "match", xpGained: 10 }));
  }
  ck(`§1g 上限 ${G.GROWTH_LOG_CAP} 筆（任務單要求 ≥10）`,
    cap.length === G.GROWTH_LOG_CAP && G.GROWTH_LOG_CAP >= 10, `len=${cap.length}`);
  ck("§1h 最新的在最前面", cap[0].id === "c29" && cap[cap.length - 1].id === `c${30 - G.GROWTH_LOG_CAP}`,
    `${cap[0].id} … ${cap[cap.length - 1].id}`);

  //  沒有釘住成長後值的舊紀錄 ⇒ 不編造前後值
  const legacy = { id: "old", gains: { focus: 1 }, after: {} };
  ck("§1i 舊紀錄缺成長後值 ⇒ 回 null（不編造前後值）", G.beforeAfter(legacy, "focus") === null);

  //  ⚠ 帳簿不得存能力現值／XP 總量／等級絕對值（那些是帳戶，不是帳簿）
  const keys = Object.keys(e1);
  ck("§1j 帳簿不存能力現值／XP 總量（不是第二套選手資料）",
    !keys.includes("stats") && !keys.includes("xp") && !keys.includes("totalXp"), keys.join(","));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §2 比賽結算：一場一筆、重送不重複 ══");
{
  const base = useProfileStore.getState();
  const state = {
    players: JSON.parse(JSON.stringify(base.players)),
    finance: { ...base.finance }, meta: { ...base.meta },
    processedMatchTransactions: {}, economy: base.economy,
  };
  const pid = state.players[0].id;
  //  ⚠ 用**官方工廠**建交易單，不自己拼形狀——契約欄位齊全由工廠保證，
  //  這樣驗證的就是真實流程，而不是一個湊出來的假物件。
  //  給足夠 XP 保證升級（升級才會觸發 P0 的能力成長）。
  const mkTx = (matchId, mode = "moba") => createMatchProgressTransaction({
    matchId, mode,
    sourceResultVersion: mode === "cs" ? "CsMatchResult.v1" : "BattleResult.v2",
    recordedAt: 1754352000000,
    teamRewards: { money: 0, fans: 0, reputation: 0 },
    playerProgress: state.players.map((p) => ({ playerId: p.id, xpGained: 3000, reasons: ["出賽"] })),
    metadata: { winner: "us" },
  });
  const tx = mkTx("m-p1-001");
  const r1 = applyProgressToState(state, tx);
  ck("§2a 結算成功", r1.receipt?.ok === true && r1.receipt.applied === true);

  const after1 = r1.nextState.players.find((p) => p.id === pid);
  const log1 = G.growthLogOf(after1);
  ck("§2b 每位出賽選手各產生 1 筆成長紀錄", log1.length === 1, `len=${log1.length}`);

  const pr = r1.receipt.players.find((p) => p.playerId === pid);
  ck("§2c 紀錄的經驗＝receipt 的經驗（同源，不重算）",
    log1[0].xpGained === pr.xpGained, `log=${log1[0].xpGained} receipt=${pr.xpGained}`);
  ck("§2d 紀錄的等級變化＝receipt 的等級變化",
    log1[0].levelBefore === pr.previousLevel && log1[0].levelAfter === pr.newLevel,
    `Lv.${log1[0].levelBefore}→${log1[0].levelAfter}`);
  ck("§2e 紀錄的能力差值＝receipt 的 growth.gains（逐鍵相同）",
    JSON.stringify(log1[0].gains) === JSON.stringify(G.cleanGains(pr.growth.gains)),
    JSON.stringify(log1[0].gains));

  //  成長前 → 成長後 必須對得上實際寫入 store 的能力值
  const someKey = Object.keys(log1[0].gains)[0];
  if (someKey) {
    const ba = G.beforeAfter(log1[0], someKey);
    ck("§2f 「成長後」值＝實際寫入選手的能力值",
      Math.abs(ba.to - Number(after1.stats[someKey])) < 0.05,
      `紀錄 ${ba.to} / store ${after1.stats[someKey]}`);
  } else {
    ck("§2f 「成長後」值＝實際寫入選手的能力值", false, "本次無能力成長，無法驗證");
  }

  //  ── 重送同一筆 ──────────────────────────────────────────────────────────
  const r2 = applyProgressToState(r1.nextState, tx);
  ck("§2g 重送同一 transaction ⇒ alreadyApplied", r2.receipt?.alreadyApplied === true);
  const after2 = (r2.nextState ?? r1.nextState).players.find((p) => p.id === pid);
  ck("§2h 重送不會重複加入成長紀錄", G.growthLogOf(after2).length === 1,
    `len=${G.growthLogOf(after2).length}`);
  ck("§2i 重送不會重複增加能力",
    JSON.stringify(after2.stats) === JSON.stringify(after1.stats));

  //  ── 第二場：紀錄累積 ────────────────────────────────────────────────────
  const tx2 = mkTx("m-p1-002");
  const r3 = applyProgressToState(r1.nextState, tx2);
  const after3 = r3.nextState.players.find((p) => p.id === pid);
  ck("§2j 第二場正確累積為 2 筆", G.growthLogOf(after3).length === 2);
  ck("§2k 最新的一筆在最前面", G.growthLogOf(after3)[0].id === `${tx2.transactionId}:${pid}`,
    G.growthLogOf(after3)[0].id);
  ck("§2l 紀錄含來源／週次／模式（任務單要求的欄位）",
    G.growthLogOf(after3)[0].source === "match" &&
    G.growthLogOf(after3)[0].mode === "moba" &&
    Number.isFinite(G.growthLogOf(after3)[0].week));

  //  ── CS 對等 ─────────────────────────────────────────────────────────────
  const txCs = mkTx("m-p1-cs", "cs");
  const rCs = applyProgressToState(state, txCs);
  const csLog = G.growthLogOf(rCs.nextState.players.find((p) => p.id === pid));
  ck("§2m CS 與 MOBA 產生**同樣形狀**的紀錄（顯示規格才可能一致）",
    csLog.length === 1 && csLog[0].mode === "cs" &&
    JSON.stringify(Object.keys(csLog[0]).sort()) === JSON.stringify(Object.keys(log1[0]).sort()));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §3 訓練結算：一次訓練只加一次 ══");
{
  const st = useProfileStore.getState();
  st.reset?.();
  const p0 = useProfileStore.getState().players[0];
  const course = courseById("mental");           // 心理訓練：clutch / focus，2 天
  const before = { ...p0.stats };

  ck("§3a 指派訓練成功", useProfileStore.getState().assignTraining(p0.id, course.id) === true);

  //  課程需要 c.hours 天才完成 ⇒ 中途推進不得產生任何成長紀錄
  useProfileStore.getState().advanceDay(1);
  const mid = useProfileStore.getState().players.find((p) => p.id === p0.id);
  ck("§3b 訓練未完成時不產生成長紀錄", G.growthLogOf(mid).length === 0, `剩 ${mid.training?.daysLeft} 天`);

  const res = useProfileStore.getState().advanceDay(1);
  const done = useProfileStore.getState().players.find((p) => p.id === p0.id);
  const tlog = G.growthLogOf(done);
  ck("§3c 訓練完成 ⇒ 產生 1 筆成長紀錄", tlog.length === 1, `len=${tlog.length}`);
  ck("§3d advanceDay 回傳本次完成的訓練（訓練頁據此顯示真實值）",
    Array.isArray(res.trained) && res.trained.length === 1, `trained=${res.trained?.length}`);
  ck("§3e 訓練紀錄來源標記正確", tlog[0].source === "training" && tlog[0].courseId === "mental");
  ck("§3f 訓練不發經驗（經驗只來自出賽）", tlog[0].xpGained === 0 && tlog[0].levelsGained === 0);

  //  ⚠ 核心：紀錄的差值必須＝**實際寫入**的能力差，而不是課程定義的 gain
  let matches = true, detail = [];
  for (const k of Object.keys(tlog[0].gains)) {
    const actual = Math.round((Number(done.stats[k]) - Number(before[k])) * 10) / 10;
    detail.push(`${k}: 紀錄 +${tlog[0].gains[k]} / 實際 +${actual}`);
    if (Math.abs(actual - tlog[0].gains[k]) > 0.05) matches = false;
  }
  ck("§3g 紀錄差值＝實際寫入選手的能力差（不是課程定義值）", matches, detail.join("　"));
  ck("§3h 訓練提升的正是課程指定的能力項目",
    Object.keys(tlog[0].gains).every((k) => course.stats.includes(k)),
    `課程 ${course.stats.join("/")} → 實得 ${Object.keys(tlog[0].gains).join("/")}`);

  //  ── 再推進若干天：不得因重整或重複操作再次增加 ──────────────────────
  const statsAfterTrain = { ...done.stats };
  for (let i = 0; i < 5; i++) useProfileStore.getState().advanceDay(1);
  const later = useProfileStore.getState().players.find((p) => p.id === p0.id);
  ck("§3i 之後繼續推進天數不會再加成長紀錄", G.growthLogOf(later).length === 1);
  ck("§3j 之後繼續推進天數不會再加能力",
    JSON.stringify(later.stats) === JSON.stringify(statsAfterTrain));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §3v1.1 訓練推進與成長修正因子 ══");
{
  const st = useProfileStore.getState();
  st.reset?.();
  const players = useProfileStore.getState().players;
  const one = players[0];
  const two = players[1];
  const three = players[2];
  const cancel = players[3];
  const oneCourse = courseById("vod");       // 1 天
  const twoCourse = courseById("mental");    // 2 天
  const threeCourse = courseById("mechanics"); // 3 天
  const energyBefore = Object.fromEntries(players.map((p) => [p.id, p.energy]));

  ck("§3v1.1a 1／2／3 日課程指派成功",
    useProfileStore.getState().assignTraining(one.id, oneCourse.id) &&
    useProfileStore.getState().assignTraining(two.id, twoCourse.id) &&
    useProfileStore.getState().assignTraining(three.id, threeCourse.id),
    `${oneCourse.hours}/${twoCourse.hours}/${threeCourse.hours} 天`);
  const assigned = useProfileStore.getState().players;
  ck("§3v1.1b 初始剩餘天數正確",
    assigned.find((p) => p.id === one.id)?.training?.daysLeft === 1 &&
    assigned.find((p) => p.id === two.id)?.training?.daysLeft === 2 &&
    assigned.find((p) => p.id === three.id)?.training?.daysLeft === 3);

  const cancelStats = { ...cancel.stats };
  ck("§3v1.1c 取消課程清除訓練且不改能力",
    useProfileStore.getState().assignTraining(cancel.id, "aim") === true &&
    (useProfileStore.getState().cancelTraining(cancel.id),
      useProfileStore.getState().players.find((p) => p.id === cancel.id)?.training === null &&
      JSON.stringify(useProfileStore.getState().players.find((p) => p.id === cancel.id)?.stats) === JSON.stringify(cancelStats)));

  useProfileStore.getState().advanceDay(1);
  const day1 = useProfileStore.getState().players;
  ck("§3v1.1d 第一天：1 日完成、2／3 日各前進一天",
    day1.find((p) => p.id === one.id)?.training === null &&
    day1.find((p) => p.id === two.id)?.training?.daysLeft === 1 &&
    day1.find((p) => p.id === three.id)?.training?.daysLeft === 2);
  const oneDone = day1.find((p) => p.id === one.id);
  ck("§3v1.1e 1 日課程只扣一次體力並有實際成長紀錄",
    oneDone.energy === energyBefore[one.id] - oneCourse.energyCost &&
    G.growthLogOf(oneDone).length === 1 && G.growthLogOf(oneDone)[0].total > 0);

  useProfileStore.getState().advanceDay(1);
  const day2 = useProfileStore.getState().players;
  ck("§3v1.1f 第二天：2 日完成、3 日剩一天",
    day2.find((p) => p.id === two.id)?.training === null &&
    day2.find((p) => p.id === three.id)?.training?.daysLeft === 1);
  useProfileStore.getState().advanceDay(1);
  const day3 = useProfileStore.getState().players;
  ck("§3v1.1g 第三天：3 日課程完成且各自只寫一筆",
    day3.find((p) => p.id === three.id)?.training === null &&
    G.growthLogOf(day3.find((p) => p.id === two.id)).length === 1 &&
    G.growthLogOf(day3.find((p) => p.id === three.id)).length === 1);

  const base = {
    ...one,
    potential: 95,
    energy: 100,
    stats: { ...one.stats, mapAware: 50, adaptability: 50, learning: 70 },
  };
  const course = courseById("vod");
  const young = calculateCourse({ ...base, age: 20 }, course.id);
  const mature = calculateCourse({ ...base, age: 28 }, course.id);
  const old = calculateCourse({ ...base, age: 40 }, course.id);
  const highLearning = calculateCourse({ ...base, stats: { ...base.stats, learning: 95 } }, course.id);
  const lowLearning = calculateCourse({ ...base, stats: { ...base.stats, learning: 45 } }, course.id);
  const fit = calculateCourse({ ...base, energy: 100 }, course.id);
  const tired = calculateCourse({ ...base, energy: 20 }, course.id);
  const lowPotential = calculateCourse({
    ...base, potential: 65, stats: { ...base.stats, mapAware: 60, adaptability: 60 },
  }, course.id);
  const gain = (r) => r.totalGain;
  ck("§3v1.1h 年齡曲線平滑且方向正確", gain(young) > gain(mature) && gain(mature) > gain(old), `${gain(young)}>${gain(mature)}>${gain(old)}`);
  ck("§3v1.1i learning 溫和影響成長", gain(highLearning) > gain(lowLearning) && gain(highLearning) / Math.max(0.1, gain(lowLearning)) < 1.5,
    `${gain(highLearning)} vs ${gain(lowLearning)}`);
  ck("§3v1.1j condition／stamina 會影響效率但不歸零", gain(fit) > gain(tired) && gain(tired) > 0,
    `${gain(fit)} vs ${gain(tired)}`);
  ck("§3v1.1k 潛力空間會減速且不超過 potential",
    gain(lowPotential) <= gain(mature) &&
    Object.values(lowPotential.statChanges).every((c) => c.after <= 65),
    `lowPotential=${gain(lowPotential)}`);

  // The UI calls the public alias rather than the lower-level multi-day helper.
  // Keep this path explicit so a reducer regression cannot hide behind a passing
  // direct advanceDay() test.
  st.reset();
  const aliasPlayer = structuredClone(useProfileStore.getState().players[0]);
  const aliasCourse = courseById("mental");
  const aliasBefore = {
    focus: aliasPlayer.stats.focus,
    energy: aliasPlayer.energy,
  };
  useProfileStore.getState().assignTraining(aliasPlayer.id, aliasCourse.id);
  const aliasAssigned = useProfileStore.getState().players.find((p) => p.id === aliasPlayer.id);
  ck("§3v1.1l: advanceTrainingDay reproducer starts at 2 days", aliasAssigned.training?.daysLeft === 2);
  useProfileStore.getState().advanceTrainingDay();
  const aliasMid = useProfileStore.getState().players.find((p) => p.id === aliasPlayer.id);
  ck("§3v1.1m: advanceTrainingDay reduces 2 days to 1", aliasMid.training?.daysLeft === 1);
  useProfileStore.getState().advanceTrainingDay();
  const aliasDone = useProfileStore.getState().players.find((p) => p.id === aliasPlayer.id);
  ck("§3v1.1n: advanceTrainingDay completes the course", aliasDone.training == null);
  ck("§3v1.1o: alias path applies a real stat gain", aliasDone.stats.focus > aliasBefore.focus);
  ck("§3v1.1p: alias path charges the course cost once", aliasDone.energy === aliasBefore.energy - aliasCourse.energyCost);
  ck("§3v1.1q: alias path writes one completion log", aliasDone.growthLog?.filter((entry) => entry.source === "training").length === 1);
  const reloadedModule = await import(`../src/platform/profileStore.js?training-reload=${Date.now()}`);
  const reloadedAlias = reloadedModule.useProfileStore.getState().players.find((p) => p.id === aliasPlayer.id);
  ck("§3v1.1r: localStorage reload preserves completed training state",
    reloadedAlias?.training == null &&
    reloadedAlias?.stats.focus === aliasDone.stats.focus &&
    reloadedAlias?.growthLog.length === aliasDone.growthLog.length);
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §4 邊界：無升級有成長／有升級但能力已達上限 ══");
{
  //  (a) 有經驗但沒升級 ⇒ 仍要記錄（玩家該看到「這場有拿經驗但能力沒漲」）
  const e = G.makeGrowthEntry({ id: "n1", source: "match", xpGained: 40, levelBefore: 3, levelAfter: 3 });
  ck("§4a 有經驗、無升級、無能力成長 ⇒ 仍記錄（不靜靜藏起來）",
    G.appendGrowth([], e).length === 1 && e.total === 0);
  ck("§4b 該情況的摘要文字誠實", G.growthText(e) === "累積經驗中", G.growthText(e));

  //  (b) 有升級但能力已達潛力上限 ⇒ 不得顯示虛假增加
  const capped = G.makeGrowthEntry({
    id: "n2", source: "match", xpGained: 900, levelBefore: 4, levelAfter: 5,
    gains: {},                                   // applyLevelGrowth 在滿值時就是回空的
  });
  ck("§4c 有升級但能力已達上限 ⇒ gains 為空、total 為 0（無虛假增加）",
    Object.keys(capped.gains).length === 0 && capped.total === 0);
  ck("§4d 該情況明說「已達潛力上限」而不是留白",
    G.growthText(capped) === "已達潛力上限，本次無能力成長", G.growthText(capped));

  //  用真實成長公式再驗一次：潛力已滿的選手升級 ⇒ 真的拿不到成長
  const { applyLevelGrowth } = await import("../src/platform/progress/levelGrowth.js");
  const maxed = { role: "中路", potential: 80, stats: Object.fromEntries(
    ["reflex", "accuracy", "apm", "positioning", "mapAware", "tacticalIQ", "decision",
      "adaptability", "courage", "clutch", "focus", "resilience", "comms", "leadership",
      "synergy", "learning"].map((k) => [k, 80])) };
  const gr = applyLevelGrowth(maxed, 3);
  ck("§4e 實測：能力已到潛力上限的選手升 3 級 ⇒ 真的零成長",
    Object.keys(gr.gains).length === 0 && gr.total === 0, `total=${gr.total}`);

  //  (c) 無升級但有能力成長（訓練就是這種）⇒ 必須顯示
  const trainOnly = G.makeGrowthEntry({
    id: "n3", source: "training", xpGained: 0, levelBefore: 2, levelAfter: 2,
    gains: { focus: 1.1 }, statsAfter: { focus: 66.1 },
  });
  ck("§4f 無升級但有能力成長 ⇒ 正確記錄並可顯示前後值",
    G.appendGrowth([], trainOnly).length === 1 &&
    G.beforeAfter(trainOnly, "focus").from === 65, JSON.stringify(G.beforeAfter(trainOnly, "focus")));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §5 持久化：重整後紀錄仍在 ══");
{
  const snap = JSON.parse(JSON.stringify(useProfileStore.getState().players));
  const withLog = snap.find((p) => G.growthLogOf(p).length > 0);
  ck("§5a 成長紀錄存在選手物件上（隨既有存檔一起持久化）", !!withLog,
    withLog ? `${withLog.name} ${G.growthLogOf(withLog).length} 筆` : "找不到有紀錄的選手");

  //  存檔往返（JSON round-trip ＝ localStorage 的實際行為）
  const roundTrip = JSON.parse(JSON.stringify(withLog));
  ck("§5b JSON 往返後紀錄完整保留",
    JSON.stringify(G.growthLogOf(roundTrip)) === JSON.stringify(G.growthLogOf(withLog)));

  //  壞掉的持久層不得炸掉畫面
  const src = read("src/platform/profileStore.js");
  ck("§5c 載入時會清洗成長紀錄（不信任持久層）",
    /growthLog\s*=\s*\(Array\.isArray\(p\.growthLog\)/.test(src));
  ck("§5d 清洗會過濾掉形狀錯誤的紀錄",
    /GROWTH_SOURCES\.includes\(e\.source\)/.test(src) && /slice\(0,\s*GROWTH_LOG_CAP\)/.test(src));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §6 UI 未定義識別字掃描（build 抓不到的白畫面 bug）══");
//  ⚠ 為什麼需要這一段：`npm run build` 只做打包，**不做作用域分析**。
//    O 系列時 RecruitScreen 留了一個已刪除變數的參照，build 全綠，
//    一點進選手詳情就整頁白掉。這段用 babel 做真正的作用域檢查。
{
  const FILES = [
    "src/ui/GrowthUI.jsx",
    "src/ui/RewardReceiptPanel.jsx",
    "src/screens/manage/TrainingScreen.jsx",
    "src/screens/manage/PlayerDetailScreen.jsx",
    "src/screens/manage/RosterScreen.jsx",
    "src/screens/fps/CsResultScreen.jsx",
    "src/battle/ui/BattleEndScreen.jsx",
  ];
  const GLOBALS = new Set([
    "React", "window", "document", "console", "Math", "JSON", "Object", "Array", "Number",
    "String", "Boolean", "Date", "Map", "Set", "Promise", "parseInt", "parseFloat",
    "isNaN", "isFinite", "setTimeout", "clearTimeout", "setInterval", "clearInterval",
    "requestAnimationFrame", "cancelAnimationFrame", "localStorage", "navigator",
    "Error", "TypeError", "RangeError", "Symbol", "BigInt", "Intl", "performance",
    "structuredClone", "queueMicrotask", "globalThis", "undefined", "NaN", "Infinity",
    "fetch", "URL", "Blob", "FileReader", "Image", "CustomEvent", "Event", "AbortController",
    "WebSocket", "TextEncoder", "TextDecoder", "crypto", "process",
  ]);
  let bad = [];
  for (const f of FILES) {
    const ast = parse(read(f), {
      sourceType: "module",
      plugins: ["jsx", "classProperties", "optionalChaining", "nullishCoalescingOperator"],
    });
    traverse(ast, {
      ReferencedIdentifier(path) {
        const n = path.node.name;
        if (GLOBALS.has(n)) return;
        if (path.scope.hasBinding(n, true)) return;
        bad.push(`${f}:${path.node.loc?.start.line} → ${n}`);
      },
    });
  }
  ck("§6a 本輪改動的畫面全部沒有未定義識別字", bad.length === 0,
    bad.length ? bad.slice(0, 6).join("　") : `掃描 ${FILES.length} 個檔`);
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §7 UI 不重算：畫面層沒有成長公式 ══");
{
  const uiFiles = ["src/ui/GrowthUI.jsx", "src/ui/RewardReceiptPanel.jsx",
    "src/screens/manage/TrainingScreen.jsx", "src/screens/manage/PlayerDetailScreen.jsx",
    "src/screens/manage/RosterScreen.jsx"];
  //  ⚠ 用 AST 檢查真正的 import 與識別字，**不做字串比對**——
  //    註解裡寫「= applyLevelGrowth 實際套用值」是在說明資料來源，不是在重算。
  //    第一版用 src.includes() 就是這樣誤判的。
  const FORMULA = new Set(["applyLevelGrowth", "applyCourse", "LEVEL_GROWTH",
    "pointsPerLevel", "roomFull", "perStatCap"]);
  const formulaHits = [];
  for (const f of uiFiles) {
    const ast = parse(read(f), { sourceType: "module", plugins: ["jsx"] });
    traverse(ast, {
      ImportDeclaration(path) {
        for (const sp of path.node.specifiers) {
          if (FORMULA.has(sp.imported?.name ?? sp.local?.name)) {
            formulaHits.push(`${f} import ${sp.local.name}`);
          }
        }
      },
      Identifier(path) {
        //  只看真正的程式碼識別字（註解不是 AST 節點，天然被排除）
        if (FORMULA.has(path.node.name) && !path.isImportSpecifier()) {
          formulaHits.push(`${f}:${path.node.loc?.start.line} ${path.node.name}`);
        }
      },
    });
  }
  ck("§7a 畫面層不 import 也不複製任何成長公式", formulaHits.length === 0, formulaHits.join("　"));

  //  訓練頁不得再從課程定義推斷「提升了哪幾項」
  const tsrc = read("src/screens/manage/TrainingScreen.jsx");
  //  ⚠ 2026-08-27（V1）：後半段從 `res?.trained` 放寬成「有讀到 `.trained`」。
  //    V1 把推進改走具名入口 `advanceWorldDays`，回傳形狀變成
  //    `{ ok, daysAdvanced, receipts }` ⇒ 訓練頁讀的是 `res.receipts?.trained`。
  //    **讀的仍是同一份真實結算差值**，本條要守的意圖沒有變。
  //    這是刻意的期望變更；前半段「不得用課程定義猜」逐字未動。
  ck("§7b 訓練頁不再用課程定義猜提升項目（改讀實際結算結果）",
    !/c\.stats\.map\(statZh\)\.join\("、"\)/.test(tsrc) && /\.trained\b/.test(tsrc));

  //  結算面板必須讀 receipt 的 growth，而不是自己算
  const rsrc = read("src/ui/RewardReceiptPanel.jsx");
  ck("§7c 結算面板直接讀 receipt 的 growth.gains", /p\.growth\?\.gains/.test(rsrc));

  //  MOBA / CS 共用同一個結算面板 ⇒ 顯示規格必然一致
  ck("§7d MOBA 與 CS 使用同一個結算面板元件",
    read("src/battle/ui/BattleEndScreen.jsx").includes("RewardReceiptPanel") &&
    read("src/screens/fps/CsResultScreen.jsx").includes("RewardReceiptPanel"));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §8 P0 系列演算未被本輪改動 ══");
{
  const lg = read("src/platform/progress/levelGrowth.js");
  ck("§8a levelGrowth 的費率沒被動過",
    /pointsPerLevel:\s*3\.0/.test(lg) && /roomFull:\s*25/.test(lg) &&
    /perStatCap:\s*1\.5/.test(lg) && /hardCap:\s*99/.test(lg));

  const mps = read("src/battle/moba/mobaPlayerStats.js");
  ck("§8b P0-2 的經驗速率限幅沒被動過", /xpRateScale:\s*\[0\.94,\s*1\.06\]/.test(mps));
  ck("§8c P0-3 的五個品質係數限幅沒被動過",
    /lastHitLoss:\s*\{\s*dir:\s*"penalty",\s*hi:\s*0\.10\s*\}/.test(mps) &&
    /attackWaste:\s*\{\s*dir:\s*"penalty",\s*hi:\s*0\.08\s*\}/.test(mps) &&
    /castMiss:\s*\{\s*dir:\s*"penalty",\s*hi:\s*0\.10\s*\}/.test(mps) &&
    /focusRate:\s*\{\s*dir:\s*"bonus",\s*hi:\s*0\.35\s*\}/.test(mps) &&
    /retreatLate:\s*\{\s*dir:\s*"penalty",\s*hi:\s*0\.06\s*\}/.test(mps));

  const eng = read("src/LogicEngine.js");
  ck("§8d S28 傷害式紅線仍然成立",
    /const dmgAmt = p\.power \* dt \* R\.dmgK/.test(eng));

  //  Training v1.1 calculator 是唯一成長規則來源；不得回到舊版固定下限公式。
  const pm = read("src/data/playerModel.js");
  const tc = read("src/data/trainingCalculator.js");
  ck("§8e Training v1.1 calculator 與 applyCourse 同源",
    /calculateTrainingResult/.test(pm) &&
    /ageEfficiency|learningEfficiency|conditionEfficiency/.test(tc) &&
    /potentialSpace/.test(tc) &&
    !/Math\.max\(0\.5, c\.gain \* \(room \/ 40\)\)/.test(pm));

  //  成長帳簿本身不得含任何成長公式
  const glog = read("src/platform/progress/growthLog.js");
  ck("§8f 成長帳簿沒有任何成長公式（只記錄，不計算）",
    !/potential|roomFull|pointsPerLevel|\* *0\.5|\/ *40/.test(glog));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §9 窄螢幕：靜態防溢出檢查 ══");
//  ⚠ **誠實揭露：這一段不是真的排版測試。**
//  真正證明「320 / 360 / 390 / 430px 不水平溢出」需要瀏覽器的排版引擎，
//  本專案沒有。這裡只能檢查那些**必然造成溢出**的寫法有沒有被引入，
//  以及可換行／可收縮的結構有沒有就位。實機仍須人工在窄螢幕確認。
{
  const files = ["src/ui/GrowthUI.jsx", "src/ui/RewardReceiptPanel.jsx",
    "src/screens/manage/RosterScreen.jsx", "src/screens/manage/PlayerDetailScreen.jsx",
    "src/screens/manage/TrainingScreen.jsx"];

  //  (a) 不得寫死大於最窄螢幕的固定寬度
  const wide = [];
  for (const f of files) {
    for (const m of read(f).matchAll(/(?:width|minWidth):\s*(\d{3,})\b/g)) {
      if (Number(m[1]) >= 320) wide.push(`${f} → ${m[1]}px`);
    }
  }
  ck("§9a 沒有 ≥320px 的寫死寬度（會直接撐破最窄螢幕）", wide.length === 0, wide.join("　"));

  //  (b) 會變長的橫列必須可換行、可收縮
  const g = read("src/ui/GrowthUI.jsx");
  ck("§9b 能力增幅清單可換行（flexWrap）", /flexWrap:\s*"wrap"/.test(g));
  ck("§9c 成長紀錄列可收縮（minWidth: 0）", (g.match(/minWidth:\s*0/g) ?? []).length >= 3,
    `${(g.match(/minWidth:\s*0/g) ?? []).length} 處`);
  ck("§9d 膠囊不被文字撐破（nowrap 膠囊 ＋ 可換行外層）",
    /whiteSpace:\s*"nowrap"/.test(g) && /flexWrap:\s*"wrap"/.test(g));
  ck("§9e 長文字有省略處理", /textOverflow:\s*"ellipsis"/.test(g) && /overflow:\s*"hidden"/.test(g));

  //  (c) 結算面板：原本是單列 flex，加了成長之後窄螢幕會擠爆 ⇒ 必須改成可換行
  const r = read("src/ui/RewardReceiptPanel.jsx");
  ck("§9f 結算面板的選手列可換行", /flexWrap:\s*"wrap"/.test(r));
  ck("§9g 結算面板的選手名有寬度上限與省略號",
    /maxWidth:\s*\d+/.test(r) && /textOverflow:\s*"ellipsis"/.test(r));

  //  (d) 名單卡新增的成長提示不得撐破卡片
  const ro = read("src/screens/manage/RosterScreen.jsx");
  ck("§9h 名單卡的成長提示列可換行且可收縮",
    /LatestGrowthHint/.test(ro) && /flexWrap:\s*"wrap", minWidth:\s*0/.test(ro));
}

console.log(`\n${fail === 0 ? "🟢" : "🔴"} P1 成長可視化：${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
