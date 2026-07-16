// ============================================================================
//  Sprint29B3 驗證：repo 根目錄執行 `node tools/check_moba_controls29b3.mjs`
//  範圍 = 測試用比賽控制 / 手機隊伍面板 / 相機模式 / 地圖可讀性 / 回城視覺
//  ⚠ 中文 OneDrive 路徑：一律絕對 file:// URL。子行程一律驗 exit code＋輸出形狀。
//  ⚠ 巢狀策略：29B2 / 29B1 以 SKIP_NESTED=1 跑引擎層；runtime29 完整跑一次
//    （其內含 S23–S28 + regress + regress2 + build）⇒ 全部現役 verifier 恰好各跑一次。
//  ⚠ 跳過巢狀（開發迭代用）：SKIP_NESTED=1 node tools/check_moba_controls29b3.mjs
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
const { SIM_RULES } = await import(u("src/battle/moba/matchProgression.js"));
const { FOUNTAIN, PITS, CAMPS, dist } = await import(u("src/gameData.js"));
const { useCameraStore, CAMERA_MODES, HERO_FOCUS_MS } = await import(u("src/battle/cameraStore.js"));
const { beginReplayCapture, captureReplayFrame, finalizeReplay, clearReplay } = await import(u("src/battle/moba/replay/replayBuffer.js"));
const { validateMobaReplay } = await import(u("src/platform/contracts/mobaReplay.js"));
const { snapshotToBattleResult } = await import(u("src/battle/battleResult.js"));
const { mobaResultToTransaction } = await import(u("src/platform/progress/adapters/mobaProgressAdapter.js"));

const DT = 0.5, CAP = 2700;
const V3 = SIM_RULES.v3;
const GV = src("src/GameView.jsx");
const ULS = code(src("src/useLocalServer.js"));
const DM = code(src("src/ui/debugMode.js"));

// ── 1) Debug complete match 只在測試模式顯示 ─────────────────────────────────
ck("1) Debug complete match 只在測試模式顯示（按鈕由 isDebugMode() 閘門；正式版無「結束」按鈕；gate = DEV / ?debug=1 / localStorage）",
  /isDebugMode\(\)\s*&&/.test(GV) && /快速完成比賽/.test(GV) &&
  !/⏹ 結束/.test(GV) &&
  /import\.meta\.env\?\.DEV/.test(DM) && /debug/.test(DM) && /esmo_debug/.test(DM));

// ── 2) complete match 會進入 Result（同引擎推進到終局 ⇒ 結果與自然跑完相同）──
{
  // fastForward 的本質：同一顆引擎、固定 dt、分塊 tick、途中呼叫 snapshot()。
  // 證明「途中 snapshot() 與分塊」不改變模擬：chunked vs plain 逐位元同結果。
  const fp = (e) => JSON.stringify([e.t, e.bK, e.rK, e.winner, e.players.map((p) => [p.k, p.d, Math.round(p.pos.x * 1e6)])]);
  const plain = new LogicEngine(4242);
  for (let t = DT; t <= CAP && !plain.over; t += DT) plain.tick(DT);
  const chunked = new LogicEngine(4242);
  outer: while (!chunked.over) {
    for (let i = 0; i < 40 && !chunked.over; i++) {
      chunked.tick(DT);
      if (i % 4 === 3) chunked.snapshot();
      if (chunked.t > CAP) break outer;
    }
    chunked.snapshot();
  }
  const endSnap = chunked.snapshot();
  const result = snapshotToBattleResult(endSnap, []);
  ck(`2) complete match 會進入 Result（分塊+途中 snapshot 與自然跑完逐位元同結果：${fp(plain) === fp(chunked)}；終局可建 BattleResult：winner=${result.winner}）`,
    fp(plain) === fp(chunked) && plain.over && chunked.over && result.schema === "BattleResult.v2" &&
    /fastForward/.test(ULS) && /eng\.tick\(DT_SIM\)/.test(ULS) &&
    !/new LogicEngine[\s\S]{0,400}fastForward|fastForward[\s\S]{0,600}new LogicEngine/.test(ULS));   // 不 new 引擎 ⇒ 不像重新開始

  // ── 3) 不重複發獎（transactionId 決定性 + 冪等由 applyMatchProgress 保證）──
  const tx1 = mobaResultToTransaction(result, { players: [], streak: 0, fansNow: 0 });
  const tx2 = mobaResultToTransaction(result, { players: [], streak: 0, fansNow: 0 });
  ck("3) complete match 不重複發獎（同一 Result ⇒ 同一 transactionId ⇒ applyMatchProgress 冪等擋重複；終局幀只觸發一次結算（snap.over && !bs.result））",
    (tx1 === null && tx2 === null) || (tx1?.transactionId && tx1.transactionId === tx2?.transactionId));
  const UBF = code(src("src/battle/useBattleFeed.js"));
  ck("   終局結算單一入口仍在（useBattleFeed：snap.over && !bs.result）", /snap\.over && !bs\.result/.test(UBF));

  // ── 4) 不破壞 Replay（fastForward 取樣節奏 = 每 2 模擬秒 push ⇒ 覆蓋全場）──
  clearReplay();
  beginReplayCapture({ seed: 777, config: {} });
  const e4 = new LogicEngine(777);
  let sincePush = 0;
  while (!e4.over && e4.t <= CAP) {
    for (let i = 0; i < 40 && !e4.over; i++) {
      e4.tick(DT); sincePush += DT;
      if (sincePush >= 2 && !e4.over) { captureReplayFrame(e4.snapshot()); sincePush = 0; }
    }
    captureReplayFrame(e4.snapshot());
  }
  const rep = finalizeReplay({ matchId: "m-29b3-ff", events: [], resultSummary: null });
  const v = validateMobaReplay(rep);
  const coverage = rep.frames[rep.frames.length - 1].t / e4.t;
  const maxGap = rep.frames.reduce((m, f, i) => (i ? Math.max(m, f.t - rep.frames[i - 1].t) : 0), 0);
  ck(`4) complete match 不破壞 Replay（validate ${v.ok ? "ok" : v.errors[0]}；${rep.frames.length} frames 覆蓋 ${(coverage * 100).toFixed(0)}% 全場、最大取樣間隔 ${maxGap.toFixed(1)}s ≤ 20.5）`,
    v.ok && coverage > 0.99 && maxGap <= 20.5);
  clearReplay();
}

// ── 5–7) 手機面板 / Hero detail ──────────────────────────────────────────────
const HS = code(src("src/battle/ui/BattleHeroStrip.jsx"));
ck("5) 手機完整 5v5 面板預設不常駐（預設收合成焦點對位列；useState(() => !isMobileViewport())）",
  /useState\(\(\) => !isMobileViewport\(\)\)/.test(HS) && /laneRow\(focusIdx\)/.test(HS));
ck("6) 面板可展開/收合＋CS 式手勢（上滑展開/下滑收合、觸控閾值、背幕點擊收合、拖曳杆觸控區）",
  /onTouchStart/.test(HS) && /onTouchMove/.test(HS) && /dy < -24/.test(HS) && /dy > 24/.test(HS) &&
  /setExpand\(false\)/.test(HS) && /touchAction/.test(HS));
{
  const HD = src("src/battle/ui/HeroDetailPanel.jsx");
  const headerIdx = HD.indexOf("✕");
  const scrollIdx = HD.indexOf('overflowY: "auto"');
  ck("7) Hero detail 關閉鈕固定頂部仍存在（✕ 在可捲動內容之前；手機全螢幕 sheet）",
    headerIdx > 0 && scrollIdx > headerIdx);
}

// ── 8–11) 相機模式 ──────────────────────────────────────────────────────────
ck(`8) camera mode 集合 = director/free/heroFocus/objectiveFocus（現值 ${CAMERA_MODES.join("/")}）`,
  JSON.stringify([...CAMERA_MODES].sort()) === JSON.stringify(["director", "free", "heroFocus", "objectiveFocus"]) &&
  useCameraStore.getState().mode === "director");   // 預設導播 ON
{
  const V3D = code(src("src/MobaView3D.jsx"));
  const BCC = code(src("src/battle/ui/BattleCameraController.jsx"));
  useCameraStore.getState().focusHero("b3");
  const s1 = useCameraStore.getState();
  ck(`9) 點英雄可進 heroFocus（store：focusHero("b3") ⇒ mode=${s1.mode}, heroId=${s1.heroId}, 聚焦 ${HERO_FOCUS_MS}ms ∈ [3000,5000]；view：raycast 命中 ⇒ focusHero）`,
    s1.mode === "heroFocus" && s1.heroId === "b3" && HERO_FOCUS_MS >= 3000 && HERO_FOCUS_MS <= 5000 &&
    /intersectObjects/.test(V3D) && /focusHero\(hit\.object\.userData\.heroId\)/.test(V3D));
  useCameraStore.getState().setMode("free");
  const s2 = useCameraStore.getState();
  ck(`10) 點空白或拖曳退出導播（store：setMode("free") ⇒ mode=${s2.mode}；view：拖曳>8px 與點空白都 setMode("free")、雙擊 backToDirector、free 時控制器不介入）`,
    s2.mode === "free" &&
    /Math\.hypot\(e\.clientX - downPt\.x/.test(V3D) && /camStore\(\)\.setMode\("free"\)/.test(V3D) &&
    /backToDirector/.test(V3D) &&
    /if \(cam\.mode === "free"\) return/.test(BCC));
  useCameraStore.getState().backToDirector();
  // 11) 相機模式不改模擬：cameraStore/控制器不 import 引擎；模擬中翻轉模式 ⇒ 結果逐位元相同
  const CS2 = code(src("src/battle/cameraStore.js"));
  const fp2 = (e) => JSON.stringify([e.t, e.bK, e.rK, e.winner]);
  const eA = new LogicEngine(88);
  for (let t = DT; t <= 1200; t += DT) eA.tick(DT);
  const eB = new LogicEngine(88);
  const modes = ["director", "free", "heroFocus", "objectiveFocus"];
  let mi = 0;
  for (let t = DT; t <= 1200; t += DT) { eB.tick(DT); if (Math.floor(t) !== Math.floor(t - DT)) useCameraStore.getState().setMode(modes[mi++ % 4]); }
  useCameraStore.getState().backToDirector();
  ck("11) 不同 camera mode 不改 simulation result（store/控制器零引擎 import；模擬中每秒翻轉模式 ⇒ 結果逐位元相同）",
    !/LogicEngine|useGameStore\.setState|pushFrame/.test(CS2) &&
    !/LogicEngine/.test(code(src("src/battle/ui/BattleCameraController.jsx"))) &&
    fp2(eA) === fp2(eB));
}

// ── 12–14) 地圖可讀性 / 塔光效 ───────────────────────────────────────────────
{
  const V3D = src("src/MobaView3D.jsx");
  ck("12) Dragon/Baron/fountain/camps 有可辨識 presentation（billboard 標籤：魔龍/凱撒/泉水/野怪/BUFF；地面文字：DRAGON/BARON；泉水平台+十字；基地方界）",
    /mkTag\("魔龍"/.test(V3D) && /mkTag\("凱撒"/.test(V3D) && /mkTag\("泉水"/.test(V3D) &&
    /"野怪"/.test(V3D) && /"BUFF"/.test(V3D) &&
    /魔龍 DRAGON/.test(V3D) && /凱撒 BARON/.test(V3D) &&
    /FOUNTAIN\.blue/.test(V3D) && /strokeRect/.test(V3D));
  ck("13) 中央黃框/粉紅框不再是唯一語意（每個色塊標記都伴隨文字標籤：pit 環+「魔龍/凱撒」、camp 菱形+「野怪/BUFF」）",
    /label\(PITS\.dragon/.test(V3D) && /label\(PITS\.baron/.test(V3D) &&
    /label\(c\.x, c\.y \+ 3\.1/.test(V3D));
  const cV3D = code(V3D);
  // S29B4：常態 idle emissive 再降（0.75/0.55 → idleEmiss 0.14/0.06）——斷言隨之更新
  //   （值改小＝常態光更低，仍「常態 < 受擊/摧毀」，本檢查語意不變、非弱化）。
  ck("14) 塔常態光效低於受擊/摧毀（常態 idleEmiss 主堡0.14/塔0.06 + 受擊峰值 +1.6；摧毀爆點 viewFx；bloomIntensity 依畫質分級 0.7/0.9/1.05）",
    /o\.idleEmiss \+ \(o\.flashT \/ 0\.25\) \* 1\.6/.test(cV3D) && /IDLE_EMISS = isNexus \? 0\.14 : 0\.06/.test(cV3D) &&
    /spawnViewFx\(o\.grp\.position\.x/.test(cV3D) &&
    /Q\.bloomIntensity/.test(cV3D) &&
    (await import(u("src/battle/quality.js"))).QUALITY_PRESETS.low.bloomIntensity < 1);
}

// ── 15) 回城 / 泉水回血：可序列化狀態與事件（引擎微場景 + 全場觀測）───────────
{
  // 微場景 A：低血、安全、離泉水遠 ⇒ 原地引導 → 傳送回泉水
  //  ⚠ 選點 {40,62}：離兩側塔均 >塔射程（{50,50} 會被紅方中路塔反擊 ⇒ 回城被真實中斷
  //    ——那是機制正確運作，不是本測試要驗的路徑）
  const SPOT = { x: 40, y: 62 };
  const e = new LogicEngine(1, null, { rules: "v3" });
  const p = e.players.find((x) => x.id === "b1");
  for (const q of e.players) if (q.side === "red") q.pos = { ...FOUNTAIN.red };
  p.pos = { ...SPOT }; p.hp = p.maxHp * 0.10;
  e.tick(DT); e.tick(DT);
  const chanPos = { x: p.pos.x, y: p.pos.y };
  const channeling = p.recallT > 0 && p.state === "回城中";
  for (let i = 0; i < 16 && p.recallT > 0; i++) e.tick(DT);
  const teleported = dist(p.pos, FOUNTAIN.blue) < 2;
  const stood = dist(chanPos, SPOT) < 6;   // 引導期間幾乎不動（容許引導前 1-2 tick 位移）
  const phases = new Set(e.recallLog.map((r) => r.phase));
  // 微場景 B：引導中敵人接近 ⇒ 中斷
  const e2 = new LogicEngine(1, null, { rules: "v3" });
  const p2 = e2.players.find((x) => x.id === "b1");
  const r2 = e2.players.find((x) => x.id === "r1");
  for (const q of e2.players) if (q.side === "red") q.pos = { ...FOUNTAIN.red };
  p2.pos = { ...SPOT }; p2.hp = p2.maxHp * 0.10;
  e2.tick(DT); e2.tick(DT);
  r2.pos = { x: SPOT.x + 5, y: SPOT.y };   // 敵人壓進 recallSafeDist
  e2.tick(DT);
  const cancelled = e2.recallLog.some((r) => r.phase === "cancel") && p2.recallT === 0;
  // 序列化 + snapshot 欄位
  const snap = e.snapshot();
  let ser = true; try { JSON.stringify(snap.recallEvents); JSON.stringify(e.recallLog); } catch { ser = false; }
  ck(`15) 回城/泉水回血可序列化且真實（引導=${channeling} 原地=${stood} 傳送=${teleported}；受擊接近 ⇒ 中斷=${cancelled}；phases=${[...phases].join(",")}；snapshot.recallEvents + players[].rc 序列化 ok）`,
    channeling && stood && teleported && cancelled && ser &&
    phases.has("start") && phases.has("done") &&
    Number.isFinite(snap.players[0].rc));
  // 全場觀測：回城真的在發生（非只有微場景）
  const e3 = new LogicEngine(42);
  for (let t = DT; t <= CAP && !e3.over; t += DT) e3.tick(DT);
  const done = e3.recallLog.filter((r) => r.phase === "done").length;
  ck(`   全場觀測：seed 42 完成回城 ${done} 次（需 ≥5）；視覺（aura/badge/傳送閃光）接 state 與 recallEvents`,
    done >= 5 && /回城中/.test(src("src/MobaView3D.jsx")) && /seenRecalls/.test(src("src/MobaView3D.jsx")));
}

// ── 16) Minimap 與主場景座標一致 ─────────────────────────────────────────────
{
  const GVs = code(src("src/GameView.jsx"));
  const e = new LogicEngine(1, null, { rules: "v3" });
  const posMatch = e.neutrals.camps.every((c) => {
    const def = CAMPS.find((d) => d.id === c.id);
    return def && c.pos.x === def.x && c.pos.y === def.y;
  });
  ck("16) Minimap 與主場景座標一致（雙方都讀 gameData 常數：FOUNTAIN/PITS/CAMPS/snap.objectives；引擎目標座標 == gameData）",
    /FOUNTAIN\.blue/.test(GVs) && /PITS\.dragon/.test(GVs) && /snap\.objectives/.test(GVs) && posMatch);
}

// ── 17–24) 巢狀 verifier / build ─────────────────────────────────────────────
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
  console.log("⚠ SKIP_NESTED=1：跳過 17–24 巢狀驗證（開發迭代模式，不可作為完成依據）");
} else {
  const p2v = runNode("tools/check_moba_presentation29b2.mjs", /12\/12 通過/, { SKIP_NESTED: "1" });
  ck(`17) 29B2 presentation verifier 引擎層通過（exit=${p2v.code}）`, p2v.ok && p2v.code === 0);
  if (!(p2v.ok && p2v.code === 0)) for (const l of p2v.out.split("\n")) if (l.startsWith("❌")) console.log("  [29B2] " + l);
  const p1v = runNode("tools/check_moba_pacing29b1.mjs", /2[45]\/2[45] 通過/, { SKIP_NESTED: "1" });
  ck(`18) 29B1 pacing verifier 引擎層通過（exit=${p1v.code}；回城 channel 未破壞節奏）`, p1v.ok && p1v.code === 0);
  if (!(p1v.ok && p1v.code === 0)) for (const l of p1v.out.split("\n")) if (l.startsWith("❌")) console.log("  [29B1] " + l);
  const rt = runNode("tools/check_moba_runtime29.mjs", /44\/44 通過/);
  ck(`19) 29A runtime verifier 44/44（exit=${rt.code}）`, rt.ok && rt.code === 0);
  if (!(rt.ok && rt.code === 0)) for (const l of rt.out.split("\n")) if (l.startsWith("❌")) console.log("  [runtime29] " + l);
  ck("20) S23–S28 現役 verifier 通過（runtime29 巢狀）",
    /✅ 30\) Sprint28 verifier 29\/29/.test(rt.out) && /✅ 31\)/.test(rt.out) && /✅ 32\)/.test(rt.out) &&
    /✅ 33\)/.test(rt.out) && /✅ 34\)/.test(rt.out) && /✅ 35\) Sprint23 verifier 28\/28/.test(rt.out));
  ck("21) regress / regress2 通過（runtime29 巢狀）",
    /✅ 36\) regress（結束率 15\/15）/.test(rt.out) && /✅ 37\) regress2（節奏門檻全綠）/.test(rt.out));
  ck("22) npm run build 通過（runtime29 巢狀）", /✅ 38\) npm run build 通過/.test(rt.out));
  for (const [name, script] of [["23) flow09 verifier", "tools/check_flow09.mjs"], ["24) dash10 verifier", "tools/check_dash10.mjs"]]) {
    const r = runNode(script, /✅/, {}, 600000);
    ck(`${name}（exit=${r.code}、無 ❌）`, r.ok && r.code === 0 && !r.out.includes("❌"));
  }
}

// ── 報告 ────────────────────────────────────────────────────────────────────
let pass = 0;
for (const [n, ok] of A) { console.log(`${ok ? "✅" : "❌"} ${n}`); if (ok) pass++; }
console.log(`\n${pass}/${A.length} 通過`);
console.log(`⚠ 未實測（無瀏覽器/真機）：FPS、觸控手勢（上滑/下滑/點英雄/雙擊）、
  手機 320/360/390/430 視覺、地圖可讀性體感、回城/泉水特效外觀、
  Debug 快速完成比賽的實際 UI 流程 —— 需 Ray 依人工驗收清單實測`);
process.exit(pass === A.length ? 0 : 1);
