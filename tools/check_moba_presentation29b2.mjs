// ============================================================================
//  Sprint29B2 驗證：repo 根目錄執行 `node tools/check_moba_presentation29b2.mjs`
//  範圍 = Combat Visibility 資料流 / Map Scale / Mobile HUD / Replay 可視化回歸
//  ⚠ 中文 OneDrive 路徑：一律絕對 file:// URL。子行程一律驗 exit code＋輸出形狀。
//  ⚠ FPS / draw calls / 手機視覺 → **無瀏覽器，未實測**（檔尾誠實標記，不做假驗證）。
//  ⚠ 巢狀策略（避免重複跑 30 分鐘）：
//     - 29B1 pacing verifier 以 SKIP_NESTED=1 跑**引擎層 25 項**（節奏未被 29B2 改壞）
//     - 29A runtime verifier **完整跑一次**（其內含 S23–S28 + regress + regress2 + build）
//     ⇒ 全部現役 verifier 恰好各跑一次。
//  ⚠ 跳過巢狀（開發迭代用，不可作為完成依據）：SKIP_NESTED=1 node tools/check_moba_presentation29b2.mjs
// ============================================================================
import { pathToFileURL } from "url";
import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";

const ROOT = process.cwd();
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const A = [];
const ck = (n, c) => A.push([n, !!c]);

const { LogicEngine } = await import(u("src/LogicEngine.js"));
const { snapshotToFrame, validateMobaReplay } = await import(u("src/platform/contracts/mobaReplay.js"));
const { beginReplayCapture, captureReplayFrame, finalizeReplay, clearReplay } = await import(u("src/battle/moba/replay/replayBuffer.js"));
const { BattleEventTracker } = await import(u("src/battle/battleEvents.js"));

const DT = 0.5, CAP = 2700;

// ── 儀器化一場：收集 objective/camp/minion 的 hp 序列與死亡觀測 ───────────────
function runObserved(seed) {
  const e = new LogicEngine(seed, null, { rules: "v3" });
  const dragonHp = [];                      // 龍存活期間的 hp 取樣（0–1）
  const campHp = new Map();                 // campId -> hp 序列
  let minionHpSeen = 0, minionHpPartial = 0, minionDeaths = 0, minionBad = 0;
  const prevMinions = new Map();            // key -> hp（上一 tick）
  const frames = [];
  clearReplay(); beginReplayCapture({ seed, config: {} });
  const tr = new BattleEventTracker(); const log = [];
  for (let t = DT; t <= CAP && !e.over; t += DT) {
    e.tick(DT);
    const s = e.snapshot();
    log.push(...tr.update(s));
    captureReplayFrame(s);
    for (const o of s.objectives) {
      if (o.id === "dragon" && o.alive) dragonHp.push(o.hp);
      if ((o.type === "camp" || o.type === "buff") && o.alive) {
        if (!campHp.has(o.id)) campHp.set(o.id, []);
        campHp.get(o.id).push(o.hp);
      }
    }
    // 小兵：hp 欄位存在性 + 死亡（id 消失）觀測
    const cur = new Map();
    for (const ln of ["top", "mid", "bot"]) for (const k of ["bm", "rm"]) for (const m of s.lanes[ln][k]) {
      if (!Number.isFinite(m.hp) || m.hp < 0 || m.hp > 1) minionBad++;
      minionHpSeen++;
      if (m.hp < 0.999) minionHpPartial++;
      cur.set(k[0] + ln + m.id, m.hp);
    }
    for (const key of prevMinions.keys()) if (!cur.has(key)) minionDeaths++;
    prevMinions.clear(); for (const [k2, v] of cur) prevMinions.set(k2, v);
    if (frames.length < 4 && s.ts > 300 * (frames.length + 1)) frames.push(snapshotToFrame(s));
  }
  const replay = finalizeReplay({ matchId: "m-29b2-check", events: log, resultSummary: null });
  return { eng: e, dragonHp, campHp, minionHpSeen, minionHpPartial, minionDeaths, minionBad, replay, log };
}
const O = runObserved(4242);
const strictlyDropped = (arr) => { let drops = 0; for (let i = 1; i < arr.length; i++) { if (arr[i] < arr[i - 1] - 1e-9) drops++; if (arr[i] > arr[i - 1] + 1e-6 && arr[i] < 0.999) return { drops, regrow: true }; } return { drops, regrow: false }; };

// 1) 中立目標 hp 存在且會下降
{
  const d = strictlyDropped(O.dragonHp);
  ck(`1) neutral objective hp 存在且逐步下降（龍存活取樣 ${O.dragonHp.length} 筆、下降 ${d.drops} 次、存活期間無異常回血）`,
    O.dragonHp.length > 10 && d.drops >= 5 && !d.regrow);
}
// 2) camp hp 存在且會下降
{
  let ok = 0, total = 0;
  for (const [, arr] of O.campHp) { total++; if (strictlyDropped(arr).drops >= 3) ok++; }
  ck(`2) camp hp 存在且會下降（${total} 座營地、${ok} 座觀測到連續掉血）`, total === 6 && ok >= 4);
}
// 3) minion hp / death 存在
ck(`3) minion hp/death 存在（snapshot 小兵 hp 取樣 ${O.minionHpSeen} 筆全部 ∈[0,1]（異常 ${O.minionBad}）、` +
   `受損中 ${O.minionHpPartial} 筆、死亡（id 消失）${O.minionDeaths} 次）`,
  O.minionHpSeen > 1000 && O.minionBad === 0 && O.minionHpPartial > 50 && O.minionDeaths > 100);

// 4) hit / death event 可序列化
{
  let ok = true;
  try {
    JSON.stringify(O.eng.snapshot());
    JSON.stringify(O.log);
    JSON.stringify(O.replay);
  } catch { ok = false; }
  const v = validateMobaReplay(O.replay);
  ck(`4) hit/death event 可序列化（snapshot/log/replay JSON 化成功；validateMobaReplay ${v.ok ? "ok" : v.errors[0]}）`,
    ok && v.ok);
}
// 5) replay frame 包含 combat visibility 資料
{
  const withPartial = O.replay.frames.filter((f) => Array.isArray(f.ob) && f.ob.some((x) => x > 0 && x < 0.999)).length;
  const heroHpOk = O.replay.frames.every((f) => f.p.every((row) => row[2] >= 0 && row[2] <= 1));
  ck(`5) replay frame 含 combat visibility 資料（ob = 目標 hp 值：${withPartial} 個 frame 有「受損中」目標；` +
     `objectivesMeta ${O.replay.objectivesMeta.length} 筆；英雄 hp 逐 frame ∈[0,1]）`,
    withPartial >= 3 && O.replay.objectivesMeta.length === 8 && heroHpOk);
}
// 6) replay 不重新模擬
{
  const RS = code(src("src/screens/moba/MobaReplayScreen.jsx"));
  const RB = code(src("src/battle/moba/replay/replayBuffer.js"));
  ck("6) replay 不重新模擬（ReplayScreen/buffer 不 import LogicEngine、不 tick、不重新生成播報）",
    !/import[^;]*LogicEngine/.test(RS) && !/\.tick\(/.test(RS) && !/new CommsEngine/.test(RS) &&
    !/import[^;]*LogicEngine/.test(RB) && !/\.tick\(/.test(RB));
}
// 7) FX 有上限
{
  const LE = code(src("src/LogicEngine.js"));
  const V3D = code(src("src/MobaView3D.jsx"));
  const { QUALITY_PRESETS, QUALITY_IDS } = await import(u("src/battle/quality.js"));
  ck("7) FX 有容量上限（引擎 fx cap 60；view 端 fxPool=maxFx 分級 + viewFx 固定 14 格重用；useFrame 內零 new geometry/material）",
    /fx\.length > 60/.test(LE) &&
    /VIEWFX_N = 14/.test(V3D) && /spawnViewFx/.test(V3D) &&
    QUALITY_IDS.every((id) => Number.isFinite(QUALITY_PRESETS[id].maxFx)) &&
    !/useFrame\([\s\S]*?new THREE\.\w*(Geometry|Material)/.test(V3D));
}
// 8) HP bar 使用真實 hp
{
  const V3D = code(src("src/MobaView3D.jsx"));
  const RS = code(src("src/screens/moba/MobaReplayScreen.jsx"));
  ck("8) HP bar 使用真實 hp（3D：objMap←snapshot.objectives、shownHp 只向真值插值；小兵縮放吃 m.hp；Replay bar 讀 frame.ob；無假血條）",
    /objMap\[/.test(V3D) && /snapshot\.objectives/.test(V3D) &&
    /clamp\(ob\.hp/.test(V3D) && /nm\?\.hp \?\? m\.hp/.test(V3D) &&
    /a\.ob\?\.\[i\]/.test(RS));
}
// 9) mobile HUD 不渲染永久十人全表
{
  const HS = code(src("src/battle/ui/BattleHeroStrip.jsx"));
  ck("9) mobile HUD 不渲染永久十人全表（手機預設收合 ⇒ 只渲染焦點對位列；展開 = bottom sheet 可關）",
    /useState\(\(\) => !isMobileViewport\(\)\)/.test(HS) &&
    /laneRow\(focusIdx\)/.test(HS) &&
    /setExpand\(false\)/.test(HS));
}
// 10) hero detail 固定頂部 close
{
  const HD = src("src/battle/ui/HeroDetailPanel.jsx");
  const headerIdx = HD.indexOf("✕");
  const scrollIdx = HD.indexOf('overflowY: "auto"');
  ck("10) 英雄詳情關閉鈕固定頂部（✕ 在可捲動內容之前；手機全螢幕 sheet）",
    headerIdx > 0 && scrollIdx > headerIdx && /isMobile \? "100%" : 340/.test(HD));
}
// 11) Timeline 預設收合（手機）
{
  const TL = code(src("src/battle/ui/BattleTimeline.jsx"));
  ck("11) Timeline 手機預設收合（useState(() => isMobile)；收合時顯示最新一則 = toast 語意）",
    /useState\(\(\) => isMobile\)/.test(TL) && /fold && latest/.test(TL));
}
// 12) 無 undefined / NaN
{
  const bad = [];
  const scan = (o, p2) => {
    if (o === undefined) bad.push(p2);
    else if (typeof o === "number" && !Number.isFinite(o)) bad.push(p2 + "=" + o);
    else if (Array.isArray(o)) o.forEach((v, i) => scan(v, `${p2}[${i}]`));
    else if (o && typeof o === "object") for (const k in o) scan(o[k], `${p2}.${k}`);
  };
  scan(O.eng.snapshot(), "snap");
  scan(O.replay.frames[Math.floor(O.replay.frames.length / 2)], "frame");
  const e2 = new LogicEngine(88, null, { rules: "v3" });
  for (let t = DT; t <= 400; t += DT) e2.tick(DT);
  scan(e2.snapshot(), "midSnap");
  ck(`12) 無 undefined/NaN（終局/中局 snapshot + replay frame 深掃 ${bad.length} 筆異常${bad.length ? "：" + bad.slice(0, 3).join(",") : ""}）`,
    bad.length === 0);
}

// ── 13–17：巢狀 verifier / build ─────────────────────────────────────────────
function runNode(script, shape, env = {}, timeout = 2400000) {
  try {
    const out = execFileSync(process.execPath, [path.join(ROOT, script)],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout, env: { ...process.env, ...env } });
    return { ok: shape.test(out), code: 0, out };
  } catch (e) {
    return { ok: shape.test(String(e.stdout ?? "")), code: e.status ?? -1, out: String(e.stdout ?? "") };
  }
}
if (process.env.SKIP_NESTED === "1") {
  console.log("⚠ SKIP_NESTED=1：跳過 13–17 巢狀驗證（開發迭代模式，不可作為完成依據）");
} else {
  // 13) 29B1 節奏（引擎層 25 項；其巢狀部分 = runtime29，由 14) 完整跑，不重複）
  const p1 = runNode("tools/check_moba_pacing29b1.mjs", /2[45]\/2[45] 通過/, { SKIP_NESTED: "1" });
  ck(`13) 29B1 pacing verifier 引擎層通過（exit=${p1.code}；節奏未被 29B2 呈現改動影響）`, p1.ok && p1.code === 0);
  if (!(p1.ok && p1.code === 0)) for (const l of p1.out.split("\n")) if (l.startsWith("❌")) console.log("  [pacing29b1] " + l);
  // 14) 29A runtime（含 S23–S28 / regress / regress2 / build 巢狀）
  const rt = runNode("tools/check_moba_runtime29.mjs", /44\/44 通過/);
  ck(`14) 29A runtime verifier 44/44（exit=${rt.code}）`, rt.ok && rt.code === 0);
  if (!(rt.ok && rt.code === 0)) for (const l of rt.out.split("\n")) if (l.startsWith("❌")) console.log("  [runtime29] " + l);
  ck("15) S23–S28 現役 verifier 通過（runtime29 巢狀：stats28/talent27/experience26/progress25/tactic24/cs23）",
    /✅ 30\) Sprint28 verifier 29\/29/.test(rt.out) && /✅ 31\)/.test(rt.out) && /✅ 32\)/.test(rt.out) &&
    /✅ 33\)/.test(rt.out) && /✅ 34\)/.test(rt.out) && /✅ 35\) Sprint23 verifier 28\/28/.test(rt.out));
  ck("16) regress / regress2 通過（runtime29 巢狀）",
    /✅ 36\) regress（結束率 15\/15）/.test(rt.out) && /✅ 37\) regress2（節奏門檻全綠）/.test(rt.out));
  ck("17) npm run build 通過（runtime29 巢狀）", /✅ 38\) npm run build 通過/.test(rt.out));
  // flow09 / dash10（現役清單，未包含在 runtime29）
  for (const [name, script] of [["18) flow09 verifier", "tools/check_flow09.mjs"], ["19) dash10 verifier", "tools/check_dash10.mjs"]]) {
    const r = runNode(script, /✅/, {}, 600000);
    ck(`${name}（exit=${r.code}、無 ❌）`, r.ok && r.code === 0 && !r.out.includes("❌"));
  }
}

// ── 報告 ────────────────────────────────────────────────────────────────────
let pass = 0;
for (const [n, ok] of A) { console.log(`${ok ? "✅" : "❌"} ${n}`); if (ok) pass++; }
console.log(`\n${pass}/${A.length} 通過`);
console.log(`⚠ 未實測（無瀏覽器）：FPS、draw calls、triangles、heap、手機 320/360/390/430 視覺、
  地圖比例體感、HP 條/受擊/死亡動畫外觀、Timeline/bottom sheet 互動 —— 需 Ray 依人工驗收清單實測`);
process.exit(pass === A.length ? 0 : 1);
