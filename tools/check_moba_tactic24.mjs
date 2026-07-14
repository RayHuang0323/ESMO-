// Sprint24 MOBA 戰術系統驗證：repo 根目錄執行 `node tools/check_moba_tactic24.mjs`
// （任務單建議 scripts/，依本專案 tools/ 慣例放置）
// A) 契約 B) 接線（結構）C) 引擎行為（同seed異戰術/重現性/不寫死勝負）D) CS 隔離
import fs from "fs";
const A = []; const ck = (n, c) => A.push([n, c]);

const { MOBA_TACTICS, MOBA_TACTIC_VERSION, STANDARD_OPP_TACTIC, validateMobaTacticConfig, toEngineTactic, mobaTacticById } =
  await import("../src/platform/contracts/MobaTacticConfig.js");
const { LogicEngine } = await import("../src/LogicEngine.js");
const { snapshotToBattleResult } = await import("../src/battle/battleResult.js");
const { PITS, dist } = await import("../src/gameData.js");   // S29：C4b 目標投入度觀測

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
// S29：加 memo（同 (seed,tactic,cap) 完全決定性 ⇒ 重跑無意義）。C4 的統計量從 4 seeds
//   提高到 40 seeds，若不快取，本檔被 5 支後續 verifier 巢狀當子行程呼叫會成倍變慢。
// 同時就地觀測 objRate（見 C4b）：每 tick 掃一次雙坑，成本可忽略，但省下整整一輪重跑。
const simCache = new Map();
function sim(seed, tacticId = null, cap = 1800) {
  const key = `${seed}|${tacticId}|${cap}`;
  if (simCache.has(key)) return simCache.get(key);
  const e = new LogicEngine(seed);
  if (tacticId) {
    const t = mobaTacticById(tacticId);
    e.configureMatch({ blue: toEngineTactic(t), red: toEngineTactic(STANDARD_OPP_TACTIC),
      meta: { tacticId: t.tacticId, tacticName: t.name, version: MOBA_TACTIC_VERSION, opponentTacticId: "std" } });
  }
  // objRate 分子/分母：坑存活期間，坑 9 單位內「己方存活英雄」的人數累計 / 坑存活 tick 數
  let objPT = 0, objTicks = 0;
  for (let t = 0.5; t <= cap && !e.over; t += 0.5) {
    e.tick(0.5);
    for (const [k, pit] of [["dragon", PITS.dragon], ["baron", PITS.baron]]) {
      if (!e[k].alive) continue;
      objTicks++;
      objPT += e.players.filter((p) => p.side === "blue" && !p.dead && dist(p.pos, pit) < 9).length;
    }
  }
  const v = { snap: e.snapshot(), objRate: objTicks ? objPT / objTicks : 0 };
  simCache.set(key, v);
  return v;
}
const run = (seed, tacticId = null, cap = 1800) => sim(seed, tacticId, cap).snap;

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

// C4a. 「該行為有沒有被觸發」的煙霧測試（存在性判準，非跨戰術比較 ⇒ 少量 seed 即可）
const sum = (id, key, ss = [11, 42, 777, 1234]) => ss.reduce((t, s) => t + (run(s, id).tacticExec.blue[key] ?? 0), 0);
ck("m7 前期壓制有真實入侵行為（4 seeds 合計 invadeAttempts ≥ 2）", sum("m7", "invadeAttempts") >= 2);
ck("m8 後期決戰幾乎不入侵（4 seeds 合計 ≤ 1）", sum("m8", "invadeAttempts") <= 1);
ck("m2 四一分推有帶線行為（4 seeds 合計 splitPushActions ≥ 4）", sum("m2", "splitPushActions") >= 4);

// ── C4b. 目標導向戰術（m4 龍堆運營）── S29 重導 ────────────────────────────────
//  ⚠ 已刪除的舊斷言：sum("m4","dragonContests") >= sum("m1","dragonContests")（4 seeds）
//    刪除理由（非「因為它擋住了 S29 改動」，而是它本來就量不到東西）：
//      dragonContests 一場只在「該側首次有人靠近該條龍」時 +1，而打野/輔助**無條件**
//      前往團戰熱點（LogicEngine：role==="jungle"||role==="sup" 直接 join）⇒ 幾乎每條龍
//      雙方都被計為有爭奪 ⇒ 指標飽和、與 dragonJoin knob 幾乎無關。
//      40 seeds 實測：m1 4.95±1.53 vs m4 5.08±1.29（Cohen d = 0.09）＝ 零鑑別力；
//      baronContests 甚至反向（m1 2.90 > m4 2.70）。4 seeds 能過純屬運氣（22 vs 23 就翻）。
//
//  改用未飽和指標 objRate ＝「坑存活期間，坑 9 單位內己方存活英雄的**平均人數**」。
//    它直接對應 dragonJoin/baronJoin 的機制（決定非打野/輔助的 3 人願不願意去坑），
//    不會因為「有一個人到過場」就封頂。
//  40 seeds 實測基準：m1 0.435±0.104、m4 0.548±0.163（+26%、Cohen d = 0.83，大效果量）。
//    門檻取 ×1.10（≈ 觀測效果量的 4 成）：對雜訊留 2.6× 餘裕，也不是照著 1.26 去設。
const OBS_SEEDS = [11, 42, 777, 1234, 1, 2, 3, 7, 99, 123, 2024, 5555, 314, 271, 1618, 8080, 4242, 88, 256, 1000,
  13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];   // 40 seeds
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const objOf = (id, ss = OBS_SEEDS) => ss.map((s) => sim(s, id).objRate);

const o1 = objOf("m1"), o4 = objOf("m4");
const [Mo1, Mo4] = [mean(o1), mean(o4)];
const beat = OBS_SEEDS.filter((_, i) => o4[i] > o1[i]).length;
ck(`m4 目標投入度 > m1（${OBS_SEEDS.length} seeds 平均 objRate ${Mo4.toFixed(3)} vs ${Mo1.toFixed(3)} = ×${(Mo4 / Mo1).toFixed(2)}；門檻 ×1.10）`,
  Mo4 >= Mo1 * 1.10);
ck(`m4 目標投入度逐 seed 勝出 ≥ 60%（${beat}/${OBS_SEEDS.length}，容忍單場波動）`,
  beat >= OBS_SEEDS.length * 0.6);

// C4c. knob → 行為的單調性：不靠單一配對，改用**全部 8 套戰術**一起檢定 Spearman 等級相關。
//   objJoin =(dragonJoin+baronJoin)/2 應與 objRate 正相關。16 seeds（次要檢定；主判準是上面 40 seeds）。
const rankOf = (arr) => {
  const s = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(arr.length);
  for (let i = 0; i < s.length;) {
    let j = i; while (j + 1 < s.length && s[j + 1][0] === s[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[s[k][1]] = avg;
    i = j + 1;
  }
  return r;
};
const RANK_SEEDS = OBS_SEEDS.slice(0, 16);
const ids8 = MOBA_TACTICS.map((t) => t.tacticId);
const knobV = ids8.map((id) => { const k = toEngineTactic(mobaTacticById(id)); return (k.dragonJoin + k.baronJoin) / 2; });
const behV = ids8.map((id) => mean(objOf(id, RANK_SEEDS)));
const rk = rankOf(knobV), rb = rankOf(behV), n8 = ids8.length;
const d2 = rk.reduce((s, v, i) => s + (v - rb[i]) ** 2, 0);
const rho = 1 - (6 * d2) / (n8 * (n8 * n8 - 1));
ck(`objJoin knob → objRate 行為單調（8 套戰術 Spearman ρ=${rho.toFixed(2)}；門檻 ≥ 0.40）`, rho >= 0.40);

// C4d. Gank 節奏：m6 全圖游走（gankInterval 32）> m4 龍堆運營（58）——機制上必然。
//   S29：4 seeds 合計 → 40 seeds 平均 + 容忍區（實測 ×1.35，門檻 ×1.15）。
const gankOf = (id) => mean(OBS_SEEDS.map((s) => {
  const x = run(s, id).tacticExec.blue; return x.topGanks + x.midGanks + x.botGanks;
}));
const g6 = gankOf("m6"), g4 = gankOf("m4");
ck(`m6 全圖游走 Gank 次數 > m4 龍堆運營（${OBS_SEEDS.length} seeds 平均 ${g6.toFixed(1)} vs ${g4.toFixed(1)} = ×${(g6 / g4).toFixed(2)}；門檻 ×1.15）`,
  g6 >= g4 * 1.15);

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
