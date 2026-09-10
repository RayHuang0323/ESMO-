#!/usr/bin/env node
// ============================================================================
//  Backend B1C — Save Hardening
//
//  執行：`node tools/check_save_hardening_b1c.mjs`
//
//  ── 這一支驗的是「存得到、存不到會說、讀不懂不會毀」──────────────────────
//  B1B 建立了邊界；B1C 要讓那個邊界**可信**。所以這裡逐條施壓的是：
//
//    ① SAVE_COVERAGE      改了 A 類資料的動作，**做完就在磁碟上**
//    ② EXIT_SAFETY        visibilitychange(hidden) / pagehide 會保底 flush
//    ③ DIRTY_CONTROL      沒有未存變更就**一個 byte 都不寫**（不製造存檔風暴）
//    ④ WRITE_FAILURE      寫不進去 ⇒ error、不謊報 synced、不清空玩家資料
//    ⑤ RECOVERY           下一次成功 ⇒ 回到 synced
//    ⑥ CORRUPT_SAFETY     讀不懂的存檔**先隔離**，不准被靜默覆寫
//    ⑦ LEGACY             舊格式照樣讀得起來
//    ⑧ CLOUD_BOUNDARY     季賽 timeline 與重播證據仍然不進雲端信封
//
//  ⚠ 寫入失敗一律用**可控的假 provider / 假 localStorage** 製造，
//    絕不真的去塞爆瀏覽器配額。
//  ⚠ 本檔**不驗**任何伺服器、Auth、conflict —— 都不存在。
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

//  ── 可控的 localStorage ───────────────────────────────────────────────────
let LS = {};
let failWrites = null;          // 鍵名 ⇒ 寫那個鍵就丟例外
globalThis.localStorage = {
  getItem: (k) => (k in LS ? LS[k] : null),
  setItem: (k, v) => { if (failWrites && k === failWrites) throw new Error("QuotaExceededError"); LS[k] = String(v); },
  removeItem: (k) => { delete LS[k]; },
};

const {
  useProfileStore, isProfileDirty, profileWriteCounters,
} = await import("../src/platform/profileStore.js");
const { useHeroProgressStore } = await import("../src/hero/heroProgressStore.js");
const { useSeasonStore } = await import("../src/platform/seasonStore.js");
const { ALL_HERO_IDS } = await import("../src/data/roster.js");
const {
  PROFILE_KEY, HERO_PROGRESS_KEY, SEASON_KEY, QUARANTINE_SUFFIX,
  readProfileRecord, quarantine, peekLoadIssues, takeLoadIssues,
  createMemorySaveProvider,
} = await import("../src/platform/persistence/localSaveProvider.js");
const { setSaveProvider, resetSaveProvider } = await import("../src/platform/persistence/saveGateway.js");
const { SAVE_STATUS } = await import("../src/platform/persistence/saveProvider.js");
const { installExitFlush, EXIT_FLUSH_EVENTS } = await import("../src/platform/persistence/exitFlush.js");
const { buildSaveBundle, cloudBundleSize } = await import("../src/platform/persistence/saveBundle.js");

const S = () => useProfileStore.getState();
const HP = () => useHeroProgressStore.getState();
const FRESH = Object.fromEntries(ALL_HERO_IDS.map((h) => [h, { level: 1 }]));
const disk = () => { try { return JSON.parse(LS[PROFILE_KEY]); } catch { return null; } };

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ① SAVE_COVERAGE：改了資料 ⇒ 磁碟上就有 ──");

//  ⚠ 這一組是**行為驗證**，不是掃原始碼。掃 `save()` 只看得到「有沒有那一行」，
//    看不到 B1A 風險 R2 那種「寫在 save() **之後**」的順序錯誤。
//    做法統一：跑動作 → 直接讀磁碟 → 斷言那個改動在磁碟上。
LS = {}; S().startNewGame("elite");

const cases = [
  {
    name: "assignTraining（B1A R2 的那一格）",
    run: () => S().assignTraining(S().players[0].id, "vod"),
    check: (d) => d.players.some((p) => p.training?.courseId === "vod"),
    also: { name: "同一次也把日目標落盤", check: (d, before) => JSON.stringify(d.retention) !== JSON.stringify(before.retention) },
  },
  {
    name: "cancelTraining",
    run: () => S().cancelTraining(S().players[0].id),
    check: (d) => d.players.every((p) => !p.training),
  },
  {
    name: "renamePlayer",
    run: () => S().renamePlayer(S().players[1].id, "改名測試"),
    check: (d) => d.players.some((p) => p.name === "改名測試"),
  },
  {
    name: "setPlayerRole",
    run: () => S().setPlayerRole(S().players[1].id, "jungle"),
    check: (d) => d.players.some((p) => p.id === S().players[1].id && p.role === "jungle"),
  },
  {
    name: "pushInbox",
    run: () => S().pushInbox({ type: "test", from: "驗證", subject: "落盤測試" }),
    check: (d) => d.inbox.some((m) => m.subject === "落盤測試"),
  },
  {
    name: "markRead",
    run: () => S().markRead(S().inbox[0].id),
    check: (d) => d.inbox[0].unread === false,
  },
  {
    name: "publishDefenseSnapshot",
    run: () => S().publishDefenseSnapshot("m1", { heroProgress: FRESH }),
    check: (d) => !!d.challenge?.defense?.hash,
  },
  {
    name: "startFixtureChallenge",
    run: () => S().startFixtureChallenge("drill_mirror", { tacticId: "m1", heroProgress: FRESH }),
    check: (d) => (d.challenge?.order ?? []).length > 0,
  },
  {
    name: "⭐ signSponsor（B1C：以前靠 pushInbox 順便存）",
    run: () => {
      //  ⚠ 直接用夠高的資格值呼叫；資格判定在 store 裡，畫面只是不讓玩家點。
      const r = S().signSponsor("local", { fans: 999999, wins: 999 });
      return r || S().signSponsor("regional", { fans: 999999, wins: 999 })
        || S().signSponsor("national", { fans: 999999, wins: 999 });
    },
    check: (d) => !!d.activeSponsor?.id,
  },
  {
    name: "endSponsor",
    run: () => S().endSponsor(),
    check: (d) => d.activeSponsor === null,
  },
];

for (const c of cases) {
  const before = disk();
  const ran = c.run();
  const after = disk();
  ck(`① ${c.name}`, !!after && c.check(after, before),
    ran === false ? "（動作回 false，可能是前置不成立）" : "");
  if (c.also && after && before) ck(`①   ↳ ${c.also.name}`, c.also.check(after, before));
}

//  ⚠ requeueMatch 的失敗路徑：以前那次「清乾淨」只活在記憶體裡。
LS = {}; S().startNewGame("elite");
const rqBefore = disk();
const rq = S().requeueMatch("moba");
const rqAfter = disk();
ck("⭐ ① REQUEUE_MATCH：無論成功或失敗，記憶體與磁碟一致",
  JSON.stringify(rqAfter.matchmaking?.attempt ?? null) === JSON.stringify(S().matchmaking?.attempt ?? null),
  `ok=${rq.ok} attempt 磁碟=${rqAfter.matchmaking?.attempt} 記憶體=${S().matchmaking?.attempt}`);
ck("① REQUEUE_MATCH：票券狀態也一致",
  JSON.stringify(rqAfter.matchmaking?.ticket ?? null) === JSON.stringify(S().matchmaking?.ticket ?? null));

//  ⚠ 原始碼層的補充守門：私有 helper 可以不自己存，但**公開動作不行**。
const storeSrc = code("src/platform/profileStore.js");
const publicNoSave = (() => {
  const blocks = storeSrc.split(/\n  (?=[a-zA-Z_][A-Za-z0-9_]*\()/);
  const out = [];
  for (const b of blocks) {
    const m = /^([a-zA-Z_][A-Za-z0-9_]*)\(/.exec(b);
    if (!m) continue;
    const n = m[1];
    if (n.startsWith("_")) continue;                       // 私有 helper，由公開動作包起來
    //  ⚠ 各自有明確理由的例外：
    //    `reset` 走 `resetAllPersistence()`（清掉，不是存）
    //    `flushIfDirty` / `save` 本身就是存檔入口
    //    `refreshOpponents` 只寫 `opponentDirectory` —— 那是 Slice 8 的**快取**，
    //      刻意不落盤（`buildSaveBundle` 的白名單也沒有它）
    if (["reset", "flushIfDirty", "save", "refreshOpponents"].includes(n)) continue;
    if (b.includes("set({") && !b.includes("save()")) out.push(n);
  }
  return out;
})();
ck("⭐ ① 沒有任何**公開**動作寫了 state 卻不存檔",
  publicNoSave.length === 0, publicNoSave.join(",") || "clean");

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ② EXIT_SAFETY：離開頁面的保底 flush ──");

const listeners = {};
const fakeWin = {
  addEventListener: (k, fn) => { (listeners[k] ??= []).push(fn); },
  removeEventListener: (k, fn) => { listeners[k] = (listeners[k] ?? []).filter((f) => f !== fn); },
};
const fakeDoc = { visibilityState: "visible" };
let flushCalls = 0;
let flushResult = { saved: true, ok: true, reason: "dirty" };
const handle = installExitFlush({ flush: () => { flushCalls += 1; return flushResult; }, target: fakeWin, doc: fakeDoc });

ck("② 掛了 visibilitychange 與 pagehide 兩個",
  EXIT_FLUSH_EVENTS.every((e) => (listeners[e] ?? []).length === 1), Object.keys(listeners).join(","));
ck("⭐ ② 不依賴 beforeunload（行動裝置上經常不觸發）",
  !("beforeunload" in listeners) && !/beforeunload/.test(code("src/platform/persistence/exitFlush.js")));

fakeDoc.visibilityState = "visible";
listeners.visibilitychange[0]();
ck("⭐ ② VISIBILITY_FLUSH：變成**可見**時不存（切回來不該白寫一次）", flushCalls === 0, `flush ${flushCalls} 次`);

fakeDoc.visibilityState = "hidden";
listeners.visibilitychange[0]();
ck("⭐ ② VISIBILITY_FLUSH：變成**隱藏**時會存", flushCalls === 1, `flush ${flushCalls} 次`);

listeners.pagehide[0]();
ck("⭐ ② PAGEHIDE_FLUSH：pagehide 也會存", flushCalls === 2, `flush ${flushCalls} 次`);
//  ⚠ `fired` 只算**真的跑過 flush** 的次數：變成可見的那一次直接 return，
//    連計數都不會加（那才是「不白寫」的意思）。
ck("② 統計有記下來（可診斷）", handle.stats.fired === 2 && handle.stats.saved === 2, JSON.stringify(handle.stats));

flushResult = { saved: false, ok: null, reason: "clean" };
listeners.pagehide[0]();
ck("② 乾淨時 flush 回報 skipped", handle.stats.skipped === 1, JSON.stringify(handle.stats));

//  flush 丟例外不得中斷卸載
const boom = installExitFlush({ flush: () => { throw new Error("boom"); }, target: fakeWin, doc: fakeDoc });
let threw = false;
try { listeners.pagehide[listeners.pagehide.length - 1](); } catch { threw = true; }
ck("⭐ ② flush 丟例外**不會**往外炸（卸載流程不得被中斷）", threw === false && boom.stats.errors === 1);
boom.dispose(); handle.dispose();
ck("② dispose 之後事件拆乾淨",
  EXIT_FLUSH_EVENTS.every((e) => (listeners[e] ?? []).length === 0));
ck("② 沒有 window 時回一個不做事的 handle，不丟例外",
  installExitFlush({ flush: () => ({}), target: null, doc: null }).stats.installed === false);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ③ DIRTY_SAVE_CONTROL：沒有未存變更就不寫 ──");

LS = {}; S().startNewGame("elite");
ck("③ 剛存完是乾淨的", isProfileDirty() === false, JSON.stringify(profileWriteCounters()));
const bytesBefore = LS[PROFILE_KEY].length;
const marker = LS[PROFILE_KEY];
const r1 = S().flushIfDirty();
ck("⭐ ③ DIRTY_SAVE_CONTROL：乾淨時**一個 byte 都不寫**",
  r1.saved === false && r1.reason === "clean" && LS[PROFILE_KEY] === marker);
for (let i = 0; i < 20; i++) S().flushIfDirty();
ck("⭐ ③ 連續 20 次 flush 也不會重寫（不製造存檔風暴）",
  LS[PROFILE_KEY] === marker && LS[PROFILE_KEY].length === bytesBefore);

//  失敗之後必須仍然 dirty，否則保底 flush 就補救不了
failWrites = PROFILE_KEY;
S().pushInbox({ type: "t", from: "a", subject: "髒" });
ck("⭐ ③ 存檔失敗之後仍然是 dirty（保底 flush 才補得回來）",
  isProfileDirty() === true, JSON.stringify(profileWriteCounters()));
failWrites = null;
const r2 = S().flushIfDirty();
ck("⭐ ③ flush 真的補救了", r2.saved === true && r2.ok === true);
ck("③ 補救之後回到乾淨", isProfileDirty() === false);
ck("③ 而且那筆變更真的在磁碟上", disk().inbox.some((m) => m.subject === "髒"));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ④⑤ WRITE_FAILURE 與恢復 ──");

LS = {}; S().startNewGame("elite");
S().pushInbox({ type: "t", from: "a", subject: "失敗前就存在的資料" });
const goodProfile = LS[PROFILE_KEY];
const goodHero = LS[HERO_PROGRESS_KEY];

failWrites = PROFILE_KEY;
const okFail = S().save();
ck("⭐ ④ WRITE_FAILURE：`save()` 回 false", okFail === false);
ck("⭐ ④ WRITE_FAILURE：狀態是 error，**不得**謊報 synced",
  S().saveStatus().status === SAVE_STATUS.error, S().saveStatus().status);
ck("④ 真正的原因留在 errorCode", S().saveStatus().errorCode === "profile_write_failed");
ck("⭐ ④ WRITE_FAILURE：**玩家資料沒有被清空**（磁碟仍是失敗前那一份）",
  LS[PROFILE_KEY] === goodProfile && JSON.parse(LS[PROFILE_KEY]).inbox.some((m) => m.subject === "失敗前就存在的資料"));
ck("④ 給玩家的是一句話，不是技術錯誤",
  S().saveStatus().message === "進度沒有存起來");

failWrites = null;
const okAgain = S().save();
ck("⭐ ⑤ ERROR_TO_SYNCED_RECOVERY：下一次成功就回到 synced",
  okAgain === true && S().saveStatus().status === SAVE_STATUS.synced, S().saveStatus().status);
ck("⑤ 恢復之後資料是完整的", disk().inbox.some((m) => m.subject === "失敗前就存在的資料"));

//  ⚠ 半套寫入：profile 成功但熟練失敗 ⇒ 必須回滾，不得留下「新生涯＋舊熟練」
LS = {}; S().startNewGame("elite");
HP().installProgress({ ...FRESH, ironclad: { xp: 500, level: 5, mastery: {} } });
S().save();
S().pushInbox({ type: "t", from: "a", subject: "半套寫入測試" });
//  ⚠ 基準必須抓在**那一次失敗的存檔之前**，而且中間**不能再有成功的存檔**。
//    我前兩版都在這裡假紅：先是抓在 `pushInbox` 之前（它自己就存了一次），
//    再來是用 `renamePlayer` 製造差異（它也自己存了一次）⇒ 磁碟早就往前走，
//    比對的基準根本不是「失敗前那一份」。
const beforeHalf = { profile: LS[PROFILE_KEY], hero: LS[HERO_PROGRESS_KEY] };
//  ⇒ 用**不存檔**的變更製造差異，回滾才有檢定力。
S()._patchPlayerNoSave(S().players[0].id, (p) => ({ ...p, name: "回滾測試" }));
failWrites = HERO_PROGRESS_KEY;
const halfOk = S().save();
ck("⭐ ④ 半套寫入：熟練寫不進去 ⇒ 整次算失敗", halfOk === false && S().saveStatus().errorCode === "hero_write_failed");
ck("⭐ ④ 半套寫入：profile **被回滾**（磁碟上不會留下新生涯＋舊熟練）",
  LS[PROFILE_KEY] === beforeHalf.profile && LS[HERO_PROGRESS_KEY] === beforeHalf.hero,
  LS[PROFILE_KEY] === beforeHalf.profile ? "已回滾" : "沒回滾");
ck("④ 回滾之後磁碟上是**失敗前**那一份（沒有半套的新資料）",
  !disk().players.some((p) => p.name === "回滾測試"));
failWrites = null;
S().save();
ck("④ 半套失敗後再存一次就完整了",
  disk().inbox.some((m) => m.subject === "半套寫入測試")
  && disk().players.some((p) => p.name === "回滾測試")
  && JSON.parse(LS[HERO_PROGRESS_KEY]).progress.ironclad.level === 5);

//  provider 丟例外
const broken = createMemorySaveProvider();
broken.save = () => { throw new Error("boom"); };
setSaveProvider(broken);
let crashed = false;
try { S().save(); } catch { crashed = true; }
ck("④ provider 丟例外不會往外炸，且記成 error",
  crashed === false && S().saveStatus().errorCode === "provider_threw");
resetSaveProvider();
S().save();
ck("⑤ 換回本機後恢復 synced", S().saveStatus().status === SAVE_STATUS.synced);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑥ CORRUPT_SAVE_SAFETY：讀不懂的存檔不准被靜默覆寫 ──");

takeLoadIssues();
ck("⑥ 沒有存檔 ⇒ empty（第一次玩，不是錯誤）",
  (() => { LS = {}; return readProfileRecord().state === "empty"; })());
ck("⑥ 壞掉的 JSON ⇒ corrupt（與 empty 分得開）",
  (() => { LS = { [PROFILE_KEY]: "{ not json" }; const r = readProfileRecord(); return r.state === "corrupt" && r.reason === "parse_failed"; })());
ck("⑥ JSON 合法但不是物件（例如陣列）也算 corrupt",
  (() => { LS = { [PROFILE_KEY]: "[1,2,3]" }; return readProfileRecord().state === "corrupt"; })());

//  ⭐ 核心：損壞 → 隔離 → 新存檔覆蓋，但**原始 bytes 還在**
LS = { [PROFILE_KEY]: '{ THIS IS A BROKEN SAVE' };
const original = LS[PROFILE_KEY];
takeLoadIssues();
quarantine(PROFILE_KEY, original, "parse_failed");
LS[PROFILE_KEY] = '{"schemaVersion":11}';       // 模擬「下一次存檔覆蓋掉」
ck("⭐ ⑥ CORRUPT_SAVE_SAFETY：原始 bytes 被搬進隔離區，沒有消失",
  LS[`${PROFILE_KEY}${QUARANTINE_SUFFIX}`] === original,
  LS[`${PROFILE_KEY}${QUARANTINE_SUFFIX}`]);
ck("⑥ 隔離事件有被記下來（可診斷）",
  peekLoadIssues().some((i) => i.key === PROFILE_KEY && i.reason === "parse_failed"));
//  第二次不得覆蓋第一次救下來的東西
quarantine(PROFILE_KEY, '{"schemaVersion":11}', "parse_failed");
ck("⭐ ⑥ 第二次隔離**不覆蓋**第一次救下來的原始資料",
  LS[`${PROFILE_KEY}${QUARANTINE_SUFFIX}`] === original);
takeLoadIssues();
ck("⑥ 隔離失敗（配額滿）也會被記下來，不靜默",
  (() => {
    failWrites = `${SEASON_KEY}${QUARANTINE_SUFFIX}`;
    const r = quarantine(SEASON_KEY, "raw", "parse_failed");
    failWrites = null;
    return r.ok === false && peekLoadIssues().some((i) => i.reason === "quarantine_failed");
  })());

ck("⑥ 沒有東西可隔離時不會亂寫（raw 為空）",
  quarantine(PROFILE_KEY, "", "parse_failed").skipped === true);

//  原始碼守門：`load()` 不得再走「讀不懂就靜默 DEFAULT」那條路
ck("⭐ ⑥ `load()` 在讀不懂時會呼叫隔離",
  /readProfileRecord\(\)/.test(storeSrc) && /quarantine\(LS_PROFILE_KEY/.test(storeSrc));
ck("⑥ heroProgress / season 讀不懂時也會隔離",
  /quarantine\(KEY, raw/.test(code("src/hero/heroProgressStore.js"))
  && /quarantine\(KEY, raw/.test(code("src/platform/seasonStore.js")));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑦ LEGACY_COMPATIBILITY ──");

LS = {};
S().startNewGame("elite");
S().startFixtureChallenge("drill_mirror", { tacticId: "m1", heroProgress: FRESH });
const legacyProfile = LS[PROFILE_KEY];
//  舊格式：裸物件 / 裸陣列
LS[HERO_PROGRESS_KEY] = JSON.stringify({ ironclad: { xp: 990, level: 7, mastery: { games: 12 } } });
LS[SEASON_KEY] = JSON.stringify([{ schema: "BattleResult.v2", winner: "blue" }]);
takeLoadIssues();
const { readHeroProgressPayload, readSeasonPayload } = await import("../src/platform/persistence/localSaveProvider.js");
ck("⑦ 舊 heroProgress（裸物件）讀得起來",
  readHeroProgressPayload(LS[HERO_PROGRESS_KEY]).progress?.ironclad?.level === 7);
ck("⑦ 舊 season（裸陣列）讀得起來", readSeasonPayload(LS[SEASON_KEY]).history.length === 1);
ck("⭐ ⑦ 舊格式**不會**被誤判成損壞（不該進隔離區）",
  peekLoadIssues().length === 0 && !(`${HERO_PROGRESS_KEY}${QUARANTINE_SUFFIX}` in LS),
  JSON.stringify(peekLoadIssues()));
ck("⑦ 舊 profile 仍是一份完整 profile 物件（磁碟格式沒被 migrate）",
  readProfileRecord.call(null) && JSON.parse(legacyProfile).players.length === 5);
ck("⑦ 鍵名一個都沒換",
  PROFILE_KEY === "esmo.profile.v1" && HERO_PROGRESS_KEY === "esmo.heroProgress.v2" && SEASON_KEY === "esmo.season.v1");

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑧ CLOUD_BUNDLE_BOUNDARY（延用既有量測，不自動 prune）──");

LS = {}; S().startNewGame("elite");
const keys = ["drill_mirror", "drill_balanced", "drill_topheavy", "drill_veteran", "drill_rotation"];
for (let i = 0; i < 25; i++) {
  const r = S().startFixtureChallenge(keys[i % 5], { tacticId: "m1", heroProgress: FRESH });
  if (r.ok) S().challenge.instances[r.challengeId].result = { outcome: "defenderWin" };
}
useSeasonStore.getState().recordResult({
  schema: "BattleResult.v2", mode: "moba", winner: "blue", duration: 1200,
  score: { blue: 9, red: 4 }, players: [],
  timeline: Array.from({ length: 90 }, (_, i) => ({ t: i, type: "KILL", side: "blue", text: "測試事件文字".repeat(6), data: null })),
});
S().save();

const bundle = buildSaveBundle({ profile: S(), heroProgress: HP().progress, now: 1 });
const cloudBytes = cloudBundleSize(bundle);
const cloudStr = JSON.stringify(bundle.cloud);
console.log(`\n   雲端信封 ${cloudBytes.toLocaleString()} B ｜ profile 磁碟 ${LS[PROFILE_KEY].length.toLocaleString()} B ｜ season 磁碟 ${LS[SEASON_KEY].length.toLocaleString()} B`);
ck("⭐ ⑧ season timeline **沒有**進雲端信封",
  !cloudStr.includes("BattleResult.v2") && !cloudStr.includes("測試事件文字"));
ck("⭐ ⑧ 重播證據（快照 / 選角）**沒有**進雲端信封",
  !("snapshots" in (bundle.cloud.profile.challenge ?? {}))
  && Object.values(bundle.cloud.profile.challenge?.instances ?? {}).every((i) => !("draftResult" in i)));
ck("⑧ 但重播證據**仍在本機磁碟上**（沒有被丟掉）",
  Object.keys(disk().challenge.snapshots).length > 0);
ck("⑧ 雲端信封維持合理大小（< 100KB）", cloudBytes < 100 * 1024, `${(cloudBytes / 1024).toFixed(1)} KB`);
ck("⑧ 本輪**沒有**自動修剪 season / replay（Owner 明令不做）",
  !/prune|trim|compact/i.test(code("src/platform/persistence/saveGateway.js"))
  && !/prune|trim|compact/i.test(code("src/platform/persistence/localSaveProvider.js")));

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── ⑨ 沒做的事 ──");
for (const f of [
  "src/platform/persistence/saveBundle.js",
  "src/platform/persistence/saveProvider.js",
  "src/platform/persistence/localSaveProvider.js",
  "src/platform/persistence/saveGateway.js",
  "src/platform/persistence/exitFlush.js",
]) {
  const src = code(f);
  ck(`⑨ ${f.split("/").pop()} 沒有 Supabase / Auth / 遠端呼叫`,
    !/supabase|firebase|createClient|\bfetch\(|XMLHttpRequest|OAuth|signIn/i.test(src));
  ck(`⑨ ${f.split("/").pop()} 沒有空的 catch {}`, !/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(src));
}
ck("⑨ 沒有 revision / deviceId conflict",
  !/deviceId|revision|conflictResolution|lastWriterWins/i.test(code("src/platform/persistence/saveGateway.js")));
ck("⑨ `save()` 仍然是無條件執行（84 個呼叫端的語意沒被改成 dirty 判斷）",
  !/save\(\)\s*\{\s*if\s*\(!isProfileDirty/.test(storeSrc));

console.log(`\nBackend B1C：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
