#!/usr/bin/env node
// ============================================================================
//  Backend B1B — Cloud-ready Save Foundation
//
//  執行：`node tools/check_save_bundle_b1b.mjs`
//
//  ── 這一支驗的是「一起」與「換得掉」──────────────────────────────────────
//  B1A 的第一號問題不是 Supabase 選型，是**沒有任何地方能原子地存下
//  玩家的全部進度**。所以這裡逐條施壓的是：
//
//    A 舊 local save 讀得起來（兩種舊格式：profile / heroProgress / season）
//    B SaveBundle 可以 round-trip（存進去 = 拿回來）
//    C profile + heroProgress **不可能**還原成不同時點
//    D New Game 會一起 reset（三個鍵）
//    E assignTraining 不再漏存
//    F schemaVersion migration 正常
//    G Challenge core 可以還原（沒有重播證據也還原得出判定）
//    H 重播證據**不會**讓 Cloud Bundle 膨脹回 100KB 等級
//    I 存檔失敗**不會**被靜默吞掉
//    J 換一個 provider，store 與畫面不用改
//
//  ⚠ 本檔**不驗**任何伺服器、Auth、conflict resolution —— 都不存在。
//  ⚠ 大小一律**實測**，不估算。
// ============================================================================
import fs from "node:fs";

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (p) => stripComments(read(p));

let pass = 0, fail = 0;
const ck = (label, ok, note = "") => {
  if (ok) { pass++; console.log(`✅ ${label}${note ? `　${note}` : ""}`); }
  else { fail++; console.log(`❌ ${label}${note ? `　${note}` : ""}`); }
};

//  ── 可控的 localStorage（三個鍵都在這裡）───────────────────────────────────
let LS = {};
let failWrites = null;   // 設成一個鍵名 ⇒ 寫那個鍵就丟例外（模擬配額爆掉）
globalThis.localStorage = {
  getItem: (k) => (k in LS ? LS[k] : null),
  setItem: (k, v) => { if (failWrites && k === failWrites) throw new Error("QuotaExceededError"); LS[k] = String(v); },
  removeItem: (k) => { delete LS[k]; },
};

const { useProfileStore } = await import("../src/platform/profileStore.js");
const { useHeroProgressStore } = await import("../src/hero/heroProgressStore.js");
const { useSeasonStore } = await import("../src/platform/seasonStore.js");
const { ALL_HERO_IDS } = await import("../src/data/roster.js");
const {
  SAVE_BUNDLE_VERSION, buildSaveBundle, applySaveBundle, validateSaveBundle,
  cloudBundleSize, splitChallenge, joinChallenge,
  CLOUD_PROFILE_KEYS, LOCAL_PROFILE_KEYS, TRANSIENT_KEYS,
} = await import("../src/platform/persistence/saveBundle.js");
const {
  createSaveProvider, SAVE_SOURCE, SAVE_STATUS, SAVE_TEXT,
} = await import("../src/platform/persistence/saveProvider.js");
const {
  localSaveProvider, createMemorySaveProvider, readHeroProgressPayload, readSeasonPayload,
  PROFILE_KEY, HERO_PROGRESS_KEY, SEASON_KEY, HERO_PROGRESS_SCHEMA, SEASON_HISTORY_SCHEMA,
  bundleToProfileRecord,
} = await import("../src/platform/persistence/localSaveProvider.js");
const {
  saveBundleNow, loadBundleNow, applyBundle, resetAllPersistence,
  setSaveProvider, resetSaveProvider, activeSaveProvider, describeSaveProvider, saveStatusView,
} = await import("../src/platform/persistence/saveGateway.js");

/**
 * 順序無關的深層比較用序列化。
 *
 * ⚠ 為什麼需要：`joinChallenge` 用 `{ ...inst, ...evidence }` 併回去，
 *   `draftResult` 會落到物件的**最後一個鍵**，而原本它在中間。
 *   `JSON.stringify` 對鍵序敏感 ⇒ 資料一模一樣也會比出「不同」。
 *   鍵序不是契約的一部分，所以比較要先正規化。
 */
const canon = (v) => {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
};

const S = () => useProfileStore.getState();
const HP = () => useHeroProgressStore.getState();
const FRESH = Object.fromEntries(ALL_HERO_IDS.map((h) => [h, { level: 1 }]));

/** 打滿挑戰紀錄（讓 challenge 切片達到 B1A 量到的那個量級）。 */
function fillChallenges(n = 25) {
  const keys = ["drill_mirror", "drill_balanced", "drill_topheavy", "drill_veteran", "drill_rotation"];
  for (let i = 0; i < n; i++) {
    const r = S().startFixtureChallenge(keys[i % keys.length], { tacticId: "m1", heroProgress: FRESH });
    if (r.ok) S().challenge.instances[r.challengeId].result = { outcome: "defenderWin", score: { blue: 0, red: 1 } };
  }
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ① 前置：三個修正 ──");

//  E. assignTraining 不再漏存
LS = {}; S().startNewGame("elite");
const beforeTraining = JSON.parse(LS[PROFILE_KEY]);
const pid = S().players[0].id;
const trained = S().assignTraining(pid, "rest");
ck("① E. assignTraining 成功", trained === true);
const afterTraining = JSON.parse(LS[PROFILE_KEY]);
ck("⭐ ① E. ASSIGN_TRAINING_FIXED：訓練指派有落盤",
  afterTraining.players.find((p) => p.id === pid)?.training?.courseId === "rest");
ck("⭐ ① E. ASSIGN_TRAINING_FIXED：**同一次**也把 retention 落盤了",
  JSON.stringify(afterTraining.retention) !== JSON.stringify(beforeTraining.retention),
  "retention 有變化");
ck("① E. 舊寫法會漏的就是這一格（反向確認：retention 真的被寫過）",
  !!afterTraining.retention && typeof afterTraining.retention === "object");

//  F. schemaVersion / 向下相容
ck("① F. heroProgress 落盤帶版本",
  JSON.parse(LS[HERO_PROGRESS_KEY])?.schema === HERO_PROGRESS_SCHEMA,
  JSON.parse(LS[HERO_PROGRESS_KEY])?.schema);
useSeasonStore.getState().resetSeason();
ck("① F. season 落盤帶版本",
  JSON.parse(LS[SEASON_KEY])?.schema === SEASON_HISTORY_SCHEMA,
  JSON.parse(LS[SEASON_KEY])?.schema);
ck("① F. profile 仍帶 schemaVersion", Number.isFinite(JSON.parse(LS[PROFILE_KEY])?.schemaVersion));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ② A. 舊 local save 讀得起來（向下相容）──");

//  舊 heroProgress：裸物件、沒有 schema
const legacyHero = { ironclad: { xp: 990, level: 7, mastery: { games: 12, wins: 8 } } };
const readHero = readHeroProgressPayload(JSON.stringify(legacyHero));
ck("⭐ ② A. 舊 heroProgress（裸物件）認得出來",
  readHero.legacy === true && readHero.progress?.ironclad?.level === 7, `level=${readHero.progress?.ironclad?.level}`);
ck("② A. 新 heroProgress 也認得出來",
  readHeroProgressPayload(JSON.stringify({ schema: HERO_PROGRESS_SCHEMA, progress: legacyHero })).progress?.ironclad?.level === 7);
ck("② A. 鍵名沒有被換掉（換鍵＝所有玩家熟練歸零）",
  HERO_PROGRESS_KEY === "esmo.heroProgress.v2");

//  舊 season：裸陣列
const legacySeason = [{ schema: "BattleResult.v2", winner: "blue" }];
const readSeason = readSeasonPayload(JSON.stringify(legacySeason));
ck("⭐ ② A. 舊 season（裸陣列）認得出來",
  readSeason.legacy === true && readSeason.history.length === 1);
ck("② A. 新 season 也認得出來",
  readSeasonPayload(JSON.stringify({ schema: SEASON_HISTORY_SCHEMA, history: legacySeason })).history.length === 1);
ck("② A. 壞掉的 JSON ⇒ null，不丟例外",
  readSeasonPayload("{not json").history === null && readHeroProgressPayload("{not json").progress === null);
ck("② A. 沒有存過 ⇒ null（與「讀壞了」分得開）",
  readSeasonPayload(null).history === null && readHeroProgressPayload(undefined).progress === null);

//  舊 profile：整份寫回去，走既有 load() 白名單
LS = {}; S().startNewGame("elite"); fillChallenges(6); S().save();
const legacyProfileRecord = JSON.parse(LS[PROFILE_KEY]);
ck("② A. 舊 profile 磁碟格式沒有被改（仍是一份完整 profile 物件）",
  !!legacyProfileRecord.players && !!legacyProfileRecord.meta && !!legacyProfileRecord.challenge);
ck("⭐ ② A. LEGACY_SAVE_COMPATIBLE：舊格式（沒有 heroProgress 信封）也載得回來",
  (() => {
    LS[HERO_PROGRESS_KEY] = JSON.stringify(legacyHero);   // 退回舊格式
    const r = loadBundleNow();
    return r.ok && r.bundle.cloud.heroProgress?.ironclad?.level === 7;
  })());

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ③ B/C. SaveBundle round-trip 與「同一個時點」──");

LS = {}; S().startNewGame("elite");
HP().installProgress({ ...FRESH, ironclad: { xp: 500, level: 5, mastery: { games: 9, wins: 5 } } });
fillChallenges(25);
S().save();

const b = buildSaveBundle({ profile: S(), heroProgress: HP().progress, now: 12345 });
ck("③ B. 信封是 SaveBundle.v1", b.schema === SAVE_BUNDLE_VERSION);
ck("③ B. 信封通過驗證", validateSaveBundle(b).ok, JSON.stringify(validateSaveBundle(b).errors));
ck("⭐ ③ C. 生涯與熟練在**同一個**信封裡",
  !!b.cloud.profile && !!b.cloud.heroProgress && b.cloud.heroProgress.ironclad.level === 5);

const applied = applySaveBundle(b);
ck("③ B. 還原得回 profile 與 heroProgress", applied.ok && !!applied.profile && !!applied.heroProgress);
for (const k of CLOUD_PROFILE_KEYS) {
  if (k === "seasonStateV2") continue;   // 由 withIdentity 重算，逐值比在 ④ 做
}
ck("⭐ ③ B. ROUND_TRIP：A 類欄位逐值一致",
  CLOUD_PROFILE_KEYS.every((k) => JSON.stringify(applied.profile[k]) === JSON.stringify(S()[k])),
  CLOUD_PROFILE_KEYS.filter((k) => JSON.stringify(applied.profile[k]) !== JSON.stringify(S()[k])).join(",") || "全部一致");
ck("③ B. B 類欄位也還原得回來（本機那一段）",
  LOCAL_PROFILE_KEYS.every((k) => JSON.stringify(applied.profile[k]) === JSON.stringify(S()[k])));
ck("⭐ ③ B. 熟練逐值一致",
  JSON.stringify(applied.heroProgress) === JSON.stringify(HP().progress));
ck("⭐ ③ C. 推導 / runtime 欄位**沒有**溜進信封",
  TRANSIENT_KEYS.every((k) => !(k in b.cloud.profile)), TRANSIENT_KEYS.join(","));
ck("③ C. `saveState` 也沒有溜進去（它是狀態不是存檔）", !("saveState" in b.cloud.profile));
ck("③ C. 進行中的比賽不上雲，但結算帳本上雲",
  !("session" in (b.cloud.profile.matchmaking ?? {})) && "settlements" in (b.cloud.profile.matchmaking ?? {}),
  Object.keys(b.cloud.profile.matchmaking ?? {}).join(","));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ④ G/H. Challenge core / evidence 分離 ──");

const { core, evidence } = splitChallenge(S().challenge);
ck("④ G. core 有 order 與 instances", core.order.length > 0 && Object.keys(core.instances).length > 0);
ck("⭐ ④ G. core **不含**任何快照與選角結果",
  !("snapshots" in core) && Object.values(core.instances).every((i) => !("draftResult" in i)));
ck("④ G. evidence 裝著快照與選角結果",
  Object.keys(evidence.snapshots).length > 0 && Object.keys(evidence.drafts).length > 0,
  `${Object.keys(evidence.snapshots).length} 快照 / ${Object.keys(evidence.drafts).length} 選角`);
//  ⚠ 這一條是那個 bug 的守門：第一版用白名單挑 core 欄位，漏了 `issuedBy`
//    ⇒ normalizeChallengeState 把整筆場次丟掉，reload 之後挑戰紀錄變 0。
const sampleId = core.order[0];
const memInst = S().challenge.instances[sampleId];
ck("⭐ ④ G. core 保留了場次的**每一個**非證據欄位（不是白名單挑的）",
  Object.keys(memInst).filter((k) => k !== "draftResult")
    .every((k) => JSON.stringify(core.instances[sampleId][k]) === JSON.stringify(memInst[k])),
  Object.keys(memInst).filter((k) => k !== "draftResult" && JSON.stringify(core.instances[sampleId][k]) !== JSON.stringify(memInst[k])).join(",") || "全部保留");
//  ⚠ 逐欄位比，不比整串 JSON —— 鍵的順序不是契約的一部分，
//    拿 `JSON.stringify` 比整個物件會因為鍵序不同而假紅。
const rejoined = joinChallenge(core, evidence);
const CH_KEYS = ["schema", "defense", "lastPublishedCareerDay", "order", "instances", "snapshots", "pendingDraft"];
ck("⭐ ④ G. core + evidence 併回去 = 原本那份（逐值，鍵序無關）",
  CH_KEYS.every((k) => canon(rejoined[k]) === canon(S().challenge[k])),
  CH_KEYS.filter((k) => canon(rejoined[k]) !== canon(S().challenge[k])).join(",") || "全部一致");
//  沒有證據時仍要還原得出判定
const coreOnly = joinChallenge(core, null);
ck("⭐ ④ G. 只有 core（沒有重播證據）也還原得出判定欄位",
  Object.values(coreOnly.instances).every((i) => !!i.settlement && !!i.identity && !!i.defenderSnapshotHash));
ck("④ G. 只有 core 時快照是空的（誠實降級，不編造）",
  Object.keys(coreOnly.snapshots).length === 0);

// ── 實測大小 ─────────────────────────────────────────────────────────────
const fullLocal = Object.entries(LS).reduce((a, [, v]) => a + v.length, 0);
const oldProfileSize = LS[PROFILE_KEY].length;
const cloudBytes = cloudBundleSize(b);
//  ⚠ 這一輪的 `esmo.season.v1` 是**空的**（跑 50 場真對局要 1–3 分鐘，
//    不適合放進每次都要跑的 gate）。它的真實大小由
//    `tools/measure_season_size.mjs` 單獨量，2026-09-11 實測：
//      單場 BattleResult.v2 平均 17,093 B（最大 22,117 B），90% 是 timeline
//      50 場上限 ⇒ 約 854,650 B（最壞 ~1,105,850 B）
//    ⇒ 下面把「對戰歷史滿載時」的合計也印出來，避免 FULL_LOCAL_DATA_SIZE
//      被讀成「本機資料就只有這麼多」。
const SEASON_AT_CAP = 854650;   // tools/measure_season_size.mjs 實測平均值
console.log("\n   ── 實測（bytes）──");
console.log(`   OLD_PROFILE_SIZE     : ${oldProfileSize.toLocaleString()}`);
console.log(`   FULL_LOCAL_DATA_SIZE : ${fullLocal.toLocaleString()}  （本輪 season 為空）`);
console.log(`   └ 對戰歷史滿載時合計 : ${(fullLocal + SEASON_AT_CAP).toLocaleString()}  （+ season ${SEASON_AT_CAP.toLocaleString()}，見 tools/measure_season_size.mjs）`);
console.log(`   CLOUD_BUNDLE_SIZE    : ${cloudBytes.toLocaleString()}`);
console.log(`   （其中 heroProgress  : ${JSON.stringify(b.cloud.heroProgress).length.toLocaleString()}）`);
console.log(`   challenge core       : ${JSON.stringify(core).length.toLocaleString()}`);
console.log(`   challenge evidence   : ${JSON.stringify(evidence).length.toLocaleString()}`);
ck("⭐ ④ H. CLOUD_BUNDLE 沒有膨脹回 100KB 等級",
  cloudBytes < 100 * 1024, `${(cloudBytes / 1024).toFixed(1)} KB`);
ck("⭐ ④ H. 雲端信封比整份本機資料小得多",
  cloudBytes < fullLocal / 2, `${(cloudBytes / 1024).toFixed(1)} KB vs ${(fullLocal / 1024).toFixed(1)} KB`);
ck("④ H. 重播證據確實是大頭（所以拆它是對的）",
  JSON.stringify(evidence).length > JSON.stringify(core).length * 3,
  `evidence ${JSON.stringify(evidence).length} vs core ${JSON.stringify(core).length}`);
//  ⚠ 這兩條是 season 分類的守門：它比雲端信封大一個數量級，
//    哪天有人「順手」把它加進 `CLOUD_PROFILE_KEYS`，這裡會紅。
ck("⭐ ④ H. 對戰歷史（實測 854,650 B）比雲端信封大一個數量級",
  SEASON_AT_CAP > cloudBytes * 10, `${(SEASON_AT_CAP / 1024).toFixed(0)} KB vs ${(cloudBytes / 1024).toFixed(1)} KB`);
ck("④ H. 而且它沒有溜進雲端信封",
  !("history" in b.cloud.profile) && !JSON.stringify(b.cloud).includes("BattleResult.v2"));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑤ 磁碟格式沒有被重做（玩家感受不到）──");

const disk = JSON.parse(LS[PROFILE_KEY]);
const stateKeys = Object.entries(S()).filter(([, v]) => typeof v !== "function").map(([k]) => k);
const missing = stateKeys.filter((k) => !(k in disk));
ck("⭐ ⑤ 磁碟上仍是一份完整的 profile 物件（不是信封）",
  !("cloud" in disk) && !("local" in disk) && !!disk.players && !!disk.challenge);
ck("⑤ 只少了刻意排除的四個欄位",
  JSON.stringify(missing.sort()) === JSON.stringify(["competition", "competitionHistory", "opponentDirectory", "saveState"]),
  missing.join(","));
ck("⑤ 磁碟上沒有多出任何 state 沒有的欄位",
  Object.keys(disk).every((k) => stateKeys.includes(k)),
  Object.keys(disk).filter((k) => !stateKeys.includes(k)).join(",") || "無");
ck("⑤ 挑戰紀錄在磁碟上是完整的（含快照與選角）",
  Object.keys(disk.challenge.snapshots).length > 0
  && Object.values(disk.challenge.instances).some((i) => !!i.draftResult));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑥ D. New Game 一起 reset ──");

LS = {}; S().startNewGame("elite");
HP().installProgress({ ...FRESH, ironclad: { xp: 9000, level: 18, mastery: { games: 99, wins: 60 } } });
useSeasonStore.getState().recordResult({ schema: "BattleResult.v2", winner: "blue", duration: 1, score: { blue: 1, red: 0 }, players: [] });
S().save();
ck("⑥ D. 前置：熟練與對戰歷史都有東西（否則下面是空過的）",
  HP().progress.ironclad.level === 18 && useSeasonStore.getState().history.length === 1);

S().startNewGame("elite");
ck("⭐ ⑥ D. NEW_GAME_RESET_FIXED：熟練被清掉了",
  (HP().progress.ironclad?.level ?? 1) === 1, `level=${HP().progress.ironclad?.level}`);
ck("⭐ ⑥ D. NEW_GAME_RESET_FIXED：對戰歷史被清掉了",
  useSeasonStore.getState().history.length === 0, `${useSeasonStore.getState().history.length} 筆`);
ck("⑥ D. 生涯本身當然也是新的",
  S().challenge.order.length === 0 && S().meta.days === 1, `days=${S().meta.days}`);
ck("⑥ D. 三個鍵在磁碟上都是新的",
  (JSON.parse(LS[HERO_PROGRESS_KEY])?.progress?.ironclad?.level ?? 1) === 1
  && (readSeasonPayload(LS[SEASON_KEY]).history ?? []).length === 0);
//  ⚠ 反向：把協調拿掉的話上面兩條會綠嗎？用 reset() 走另一條路再驗一次。
S().startNewGame("elite");
HP().installProgress({ ...FRESH, lieyan: { xp: 400, level: 4, mastery: {} } });
S().reset();
ck("⭐ ⑥ D. `reset()` 也是三個一起清（不是只有 startNewGame 特別處理）",
  (HP().progress.lieyan?.level ?? 1) === 1 && useSeasonStore.getState().history.length === 0);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑦ I. 存檔失敗不再被靜默吞掉 ──");

LS = {}; S().startNewGame("elite");
ck("⑦ I. 正常情況是 synced", S().saveStatus().status === SAVE_STATUS.synced, S().saveStatus().status);
ck("⑦ I. synced 不對玩家說話", S().saveStatus().message === null);

failWrites = PROFILE_KEY;
const okAfterFail = S().save();
ck("⭐ ⑦ I. 寫入失敗時 `save()` 回 false（以前永遠當作成功）", okAfterFail === false);
ck("⭐ ⑦ I. 狀態轉成 error", S().saveStatus().status === SAVE_STATUS.error, S().saveStatus().status);
ck("⑦ I. 給玩家的是一句話，不是技術錯誤",
  S().saveStatus().message === SAVE_TEXT.error && !/Quota|Error|Exceeded/.test(S().saveStatus().message),
  S().saveStatus().message);
ck("⑦ I. 真正的原因留在 errorCode（診斷用）",
  S().saveStatus().errorCode === "profile_write_failed", S().saveStatus().errorCode);
ck("⑦ I. 有重試可按", S().saveStatus().canRetry === true && S().saveStatus().retryLabel === "重試");
ck("⭐ ⑦ I. 存檔失敗**不會**打斷遊戲流程（不 throw）",
  (() => { try { S().save(); S().pushInbox({ type: "test", from: "t", subject: "s" }); return true; } catch { return false; } })());
failWrites = null;
S().save();
ck("⑦ I. 修好之後回到 synced", S().saveStatus().status === SAVE_STATUS.synced);

//  熟練寫不進去也要算失敗（否則就是 B1A 風險 R1 那個「生涯新、熟練舊」）
failWrites = HERO_PROGRESS_KEY;
S().save();
ck("⭐ ⑦ I. 熟練寫不進去 ⇒ 整次存檔算失敗（不接受半套）",
  S().saveStatus().status === SAVE_STATUS.error && S().saveStatus().errorCode === "hero_write_failed",
  S().saveStatus().errorCode);
failWrites = null; S().save();

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑧ J. 換 provider：store 與畫面不用改 ──");

LS = {}; S().startNewGame("elite"); fillChallenges(3); S().save();
const beforeSwap = JSON.stringify({ order: S().challenge.order, days: S().meta.days });

const mem = createMemorySaveProvider();
const prev = setSaveProvider(mem);
ck("⑧ J. 換得掉，且回得到前一個", prev?.providerId === "local" && activeSaveProvider().providerId === "memory");
ck("⑧ J. describe() 照實說自己不持久",
  describeSaveProvider().durable === false && describeSaveProvider().remote === false,
  JSON.stringify(describeSaveProvider()));
S().save();
ck("⭐ ⑧ J. 換了 provider 之後 `save()` 照樣成功（呼叫端一行沒改）",
  S().saveStatus().status === SAVE_STATUS.synced);
const memLoaded = loadBundleNow();
ck("⑧ J. 從新 provider 載得回同一份",
  memLoaded.ok && JSON.stringify(memLoaded.bundle.cloud.profile.challenge.order) === JSON.stringify(S().challenge.order));

//  ⚠ 換 provider 之後，本機那三個鍵**不該**再被寫（證明真的換掉了）
const lsBefore = JSON.stringify(LS);
S().save();
ck("⭐ ⑧ J. 換走之後不再寫本機（證明 provider 真的是唯一出口）",
  JSON.stringify(LS) === lsBefore);

//  一個會壞掉的 provider
setSaveProvider(createSaveProvider({
  providerId: "broken", kind: SAVE_SOURCE.memory,
  load: () => { throw new Error("boom"); },
  save: () => { throw new Error("boom"); },
}));
let crashed = false;
try { S().save(); } catch { crashed = true; }
ck("⭐ ⑧ J. provider 丟例外**不會**往外炸", crashed === false);
ck("⑧ J. 而且照實記成 error", S().saveStatus().errorCode === "provider_threw", S().saveStatus().errorCode);
ck("⑧ J. 讀也不會炸", loadBundleNow().ok === false);

resetSaveProvider();
ck("⑧ J. 換得回本機", activeSaveProvider().providerId === "local");
S().save();
ck("⑧ J. 換回來之後狀態恢復 synced，資料沒掉",
  S().saveStatus().status === SAVE_STATUS.synced
  && JSON.stringify({ order: S().challenge.order, days: S().meta.days }) === beforeSwap);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑨ 邊界純度與「沒做的事」──");

for (const f of [
  "src/platform/persistence/saveBundle.js",
  "src/platform/persistence/saveProvider.js",
]) {
  const src = code(f);
  ck(`⑨ ${f.split("/").pop()} 不 import React / zustand / store`,
    !/from "react"|zustand|profileStore|heroProgressStore|seasonStore/.test(src));
  ck(`⑨ ${f.split("/").pop()} 不碰 localStorage`, !/localStorage/.test(src));
  ck(`⑨ ${f.split("/").pop()} 不擲骰、不讀時鐘`, !/Math\.random|Date\.now\(\)/.test(src));
}
for (const f of [
  "src/platform/persistence/saveBundle.js",
  "src/platform/persistence/saveProvider.js",
  "src/platform/persistence/localSaveProvider.js",
  "src/platform/persistence/saveGateway.js",
]) {
  const src = code(f);
  ck(`⑨ ${f.split("/").pop()} 沒有 Supabase / Auth / 遠端呼叫`,
    !/supabase|firebase|createClient|\bfetch\(|XMLHttpRequest|OAuth|signIn/i.test(src));
  //  ⚠ 這條是本輪最重要的一條回歸守門：新的 persistence 層不准靜默吞錯。
  ck(`⑨ ${f.split("/").pop()} 沒有空的 catch {}`, !/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(src));
}
ck("⑨ 沒有 revision / device conflict 實作（本輪明令不做）",
  !/deviceId|revision|conflict|lastWriterWins/i.test(code("src/platform/persistence/saveGateway.js")));
ck("⑨ `profileStore.save()` 的名字沒有被改掉（84 個呼叫端不動）",
  /^\s*save\(\)\s*\{/m.test(code("src/platform/profileStore.js")));
ck("⑨ profileStore 不再自己寫 localStorage 的 profile 鍵",
  !/localStorage\.setItem/.test(code("src/platform/profileStore.js")));
ck("⑨ 玩家提示不含工程詞",
  Object.values(SAVE_TEXT).every((t) => !/localStorage|quota|provider|bundle|schema/i.test(t)),
  Object.values(SAVE_TEXT).join(" / "));

console.log(`\nBackend B1B：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
console.log(`\nOLD_PROFILE_SIZE     = ${oldProfileSize}`);
console.log(`FULL_LOCAL_DATA_SIZE = ${fullLocal}（season 空）／${fullLocal + SEASON_AT_CAP}（season 滿載）`);
console.log(`CLOUD_BUNDLE_SIZE    = ${cloudBytes}`);
process.exit(fail ? 1 : 0);
