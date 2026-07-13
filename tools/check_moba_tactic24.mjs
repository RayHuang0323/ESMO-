// Sprint24 MOBA 戰術系統驗證：repo 根目錄執行 `node tools/check_moba_tactic24.mjs`
// （任務單建議 scripts/，依本專案 tools/ 慣例放置）
// A) 契約 B) 接線（結構）C) 引擎行為（同seed異戰術/重現性/不寫死勝負）D) CS 隔離
import fs from "fs";
const A = []; const ck = (n, c) => A.push([n, c]);

const { MOBA_TACTICS, MOBA_TACTIC_VERSION, STANDARD_OPP_TACTIC, validateMobaTacticConfig, toEngineTactic, mobaTacticById } =
  await import("../src/platform/contracts/MobaTacticConfig.js");
const { LogicEngine } = await import("../src/LogicEngine.js");
const { snapshotToBattleResult } = await import("../src/battle/battleResult.js");

// ── A. 契約 ────────────────────────────────────────────────────────────────
ck("八套戰術 + 對手 standard", MOBA_TACTICS.length === 8 && STANDARD_OPP_TACTIC.tacticId === "std");
ck("tacticId 全部唯一", new Set(MOBA_TACTICS.map((t) => t.tacticId)).size === 8);
const badV = [...MOBA_TACTICS, STANDARD_OPP_TACTIC].map((t) => ({ id: t.tacticId, v: validateMobaTacticConfig(t) })).filter((x) => !x.v.ok);
ck("全部通過 MobaTacticConfig.v1 驗證" + (badV.length ? `（失敗:${badV.map((x) => x.id + ":" + x.v.errors[0]).join(";")}）` : ""), badV.length === 0);
ck("Legacy m1–m8 名稱逐字保留", ["速推流", "四一分推", "強開團", "龍堆運營", "下路強攻", "全圖游走", "前期壓制", "後期決戰"]
  .every((n, i) => MOBA_TACTICS[i].name === n && MOBA_TACTICS[i].tacticId === "m" + (i + 1)));
ck("knobs 無傷害/勝率係數（欄位白名單）", MOBA_TACTICS.every((t) => {
  const allow = ["tacticId", "joinFight", "dragonJoin", "baronJoin", "retreatAt", "laneOffset", "splitLane", "splitPush", "gankInterval", "gankWeights", "invadeChance", "invadeWithMid", "roamRate"];
  return Object.keys(toEngineTactic(t)).every((k) => allow.includes(k));
}));

// ── B. 接線（結構）────────────────────────────────────────────────────────
const tacScr = fs.readFileSync("src/screens/moba/TacticScreen.jsx", "utf8");
ck("TacticScreen 資料來源 = 契約（不再散落 component）", tacScr.includes("MOBA_TACTICS") && tacScr.includes("platform/contracts/MobaTacticConfig"));
ck("TacticScreen 無固定 560px 跑版根因", !tacScr.includes("width: 560") && !tacScr.includes("width: 200"));
const gv = fs.readFileSync("src/GameView.jsx", "utf8");
ck("GameView start({tactic}) 傳入引擎驅動層", (gv.match(/start\(\{ tactic \}\)/g) || []).length >= 2);
const uls = fs.readFileSync("src/useLocalServer.js", "utf8");
ck("useLocalServer → engine.configureMatch（含 standard 對手）", uls.includes("configureMatch") && uls.includes("STANDARD_OPP_TACTIC"));
const le = fs.readFileSync("src/LogicEngine.js", "utf8");
ck("LogicEngine 無 tactic 直接寫 winner / 無傷害係數", !/tactic\w*[^\n]*winner\s*=/.test(le) && !/tactic\w*[^\n]*(dmgAmt|power)\s*\*=/.test(le) && !le.includes("damage *="));

// ── C. 引擎行為 ────────────────────────────────────────────────────────────
function run(seed, tacticId = null, cap = 1800) {
  const e = new LogicEngine(seed);
  if (tacticId) {
    const t = mobaTacticById(tacticId);
    e.configureMatch({ blue: toEngineTactic(t), red: toEngineTactic(STANDARD_OPP_TACTIC),
      meta: { tacticId: t.tacticId, tacticName: t.name, version: MOBA_TACTIC_VERSION, opponentTacticId: "std" } });
  }
  for (let t = 0.5; t <= cap && !e.over; t += 0.5) e.tick(0.5);
  return e.snapshot();
}

// C1. 同 seed 同戰術 → 完全重現
const r1 = run(777, "m6"), r2 = run(777, "m6");
ck("同 seed 同戰術可重現（winner/時長/擊殺/執行統計逐位一致）",
  JSON.stringify([r1.winner, r1.ts, r1.bK, r1.rK, r1.tacticExec]) === JSON.stringify([r2.winner, r2.ts, r2.bK, r2.rK, r2.tacticExec]));

// C2. 無戰術 → snapshot 無戰術欄位（舊形狀不變）且與戰術場不同 rng 路徑互不污染
const r0 = run(777, null);
ck("無戰術 ⇒ snapshot 不含 tacticMeta/tacticExec（舊消費者零影響）", !("tacticMeta" in r0) && !("tacticExec" in r0));

// C3. 同 seed 同 roster 不同戰術 → 執行統計不同（至少 3 個欄位有差）
const seeds = [11, 42, 777];
let diffOK = 0;
for (const s of seeds) {
  const a = run(s, "m7").tacticExec.blue, b = run(s, "m8").tacticExec.blue;
  const diffs = Object.keys(a).filter((k) => a[k] !== b[k]);
  if (diffs.length >= 3) diffOK++;
}
ck(`同 seed 不同戰術（m7 vs m8）執行統計顯著不同（${diffOK}/${seeds.length} seeds ≥3 欄位差異）`, diffOK === seeds.length);

// C4. 戰術行為與定義吻合（觀察而非寫死）：m7 入侵型 vs m8 龜縮型、m2 分推、m4 控龍
const sum = (id, key, ss = [11, 42, 777, 1234]) => ss.reduce((t, s) => t + (run(s, id).tacticExec.blue[key] ?? 0), 0);
ck("m7 前期壓制有真實入侵行為（4 seeds 合計 invadeAttempts ≥ 2）", sum("m7", "invadeAttempts") >= 2);
ck("m8 後期決戰幾乎不入侵（4 seeds 合計 ≤ 1）", sum("m8", "invadeAttempts") <= 1);
ck("m2 四一分推有帶線行為（4 seeds 合計 splitPushActions ≥ 4）", sum("m2", "splitPushActions") >= 4);
ck("m4 龍堆運營小龍參戰 ≥ m1 速推流（4 seeds 合計）", sum("m4", "dragonContests") >= sum("m1", "dragonContests"));
ck("m6 全圖游走 Gank 次數 > m4 龍堆運營（4 seeds 合計三路 Gank）",
  sum("m6", "topGanks") + sum("m6", "midGanks") + sum("m6", "botGanks") > sum("m4", "topGanks") + sum("m4", "midGanks") + sum("m4", "botGanks"));

// C5. 戰術不保證勝負：同一戰術跨 16 seeds，兩種勝方都出現
for (const id of ["m3", "m8"]) {
  const winners = new Set();
  for (let s = 1; s <= 16; s++) winners.add(run(s * 97 + 5, id).winner);
  ck(`${id} 跨 16 seeds 勝負皆有出現（不寫死 winner）`, winners.has("blue") && winners.has("red"));
}

// C6. BattleResult 證據鏈：tacticId 原樣進 result + 執行統計掛上
const snapT = run(4242, "m5");
const res = snapshotToBattleResult(snapT, []);
ck("BattleResult.tactic 留下相同 tacticId/version", res.tactic?.tacticId === "m5" && res.tactic?.version === MOBA_TACTIC_VERSION && res.tactic?.opponentTacticId === "std");
ck("BattleResult.tacticExecution = 引擎統計（blue/red 齊備）", !!res.tacticExecution?.blue && !!res.tacticExecution?.red);
const res0 = snapshotToBattleResult(run(4242, null), []);
ck("無戰術 ⇒ BattleResult.tactic/tacticExecution = null（向下相容）", res0.tactic === null && res0.tacticExecution === null);
ck("BattleResult.v2 結構未變（schema/mode/winner/players 完整）", res.schema === "BattleResult.v2" && res.mode === "moba" && res.players.length === 10);

// ── D. CS 隔離（S23 流程不受影響）──────────────────────────────────────────
const csres = fs.readFileSync("src/platform/contracts/CsMatchResult.js", "utf8");
ck("CsMatchResult.v1 未被修改引用 MOBA 戰術", !csres.includes("MobaTactic") && !csres.includes("tacticExecution"));
const csScr = ["CsMatchScreen", "CsResultScreen", "CsTacticScreen"].map((f) => fs.readFileSync(`src/screens/fps/${f}.jsx`, "utf8")).join("");
ck("CS 畫面零 MobaTacticConfig import", !csScr.includes("MobaTacticConfig"));
const fps = fs.readFileSync("src/battle/fps/EsportsFPS3D.jsx", "utf8");
ck("FPS 引擎零 MOBA 戰術字樣", !fps.includes("MobaTactic") && !fps.includes("configureMatch"));

let p = 0; A.forEach(([n, c]) => { console.log((c ? "✅ " : "❌ ") + n); if (c) p++; });
console.log(p + "/" + A.length + " 通過"); process.exit(p === A.length ? 0 : 1);
