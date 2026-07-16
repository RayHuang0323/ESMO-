// ============================================================================
//  Sprint29B4 驗證：repo 根目錄執行 `node tools/check_moba_recovery29b4.mjs`
//  範圍 = Debug 快速完成比賽 / 10 英雄一致可點 / Replay 可觀看 / 塔常駐光移除
//  ⚠ 中文 OneDrive 路徑：一律絕對 file:// URL。子行程一律驗 exit code＋輸出形狀。
//  ⚠ FPS / 手勢 / 手機視覺 → **無瀏覽器，未實測**（檔尾誠實標記，不做假驗證）。
//  ⚠ 巢狀策略：controls29b3 / presentation29b2 / pacing29b1 以 SKIP_NESTED=1 跑引擎層；
//    runtime29 完整跑一次（內含 S23–S28 + regress + regress2 + build）⇒ 各支恰好各跑一次。
//  ⚠ 跳過巢狀（開發迭代用）：SKIP_NESTED=1 node tools/check_moba_recovery29b4.mjs
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
const { parseDebug } = await import(u("src/ui/debugMode.js"));
const { beginReplayCapture, captureReplayFrame, finalizeReplay, getCurrentReplay, clearReplay } = await import(u("src/battle/moba/replay/replayBuffer.js"));
const { validateMobaReplay } = await import(u("src/platform/contracts/mobaReplay.js"));
const { snapshotToBattleResult } = await import(u("src/battle/battleResult.js"));
const { mobaMatchId, mobaResultToTransaction } = await import(u("src/platform/progress/adapters/mobaProgressAdapter.js"));
const { emptyHero, attrs } = await import(u("src/hero/heroProgress.js"));

const DT = 0.5, CAP = 2700;
const DM = code(src("src/ui/debugMode.js"));
const GV = code(src("src/GameView.jsx"));
const HS = code(src("src/battle/ui/BattleHeroStrip.jsx"));
const HD = src("src/battle/ui/HeroDetailPanel.jsx");
const V3D = code(src("src/MobaView3D.jsx"));
const RS = code(src("src/screens/moba/MobaReplayScreen.jsx"));
const RB = code(src("src/battle/moba/replay/replayBuffer.js"));

// ═══ A. 快速完成比賽鍵（debug gate）═══════════════════════════════════════════
// 1) query parser 能辨識 ?debug=1（search 情境）
ck(`1) query parser 辨識 ?debug=1（search）：parseDebug("?debug=1")=${parseDebug("?debug=1")}`,
  parseDebug("?debug=1") === "1" && parseDebug("?foo=2&debug=1") === "1");
// 2) hash route / Pages：debug 藏在 hash 裡也要辨識
ck(`2) hash route 仍辨識 debug（parseDebug("#/battle?debug=1")=${parseDebug("#/battle?debug=1")}、"#debug=1"=${parseDebug("#debug=1")}）；debug=0 可關`,
  parseDebug("#/battle?debug=1") === "1" && parseDebug("#debug=1") === "1" &&
  parseDebug("?debug=0") === "0" && parseDebug("") === null && parseDebug("#/battle") === null &&
  // 原始碼確實對 search 與 hash 兩處都解析
  /parseDebug\(window\.location\.search\)\s*\?\?\s*parseDebug\(window\.location\.hash\)/.test(DM));
// 3) localStorage.esmo_debug=1 可開，且 URL 認定後會持久化
ck("3) localStorage.esmo_debug=1 可開 debug，且 URL debug=1 會寫入 localStorage 持久化",
  /getItem\("esmo_debug"\)|getItem\(LS_KEY\)/.test(DM) && /localStorage\?\.getItem\(LS_KEY\) === "1"/.test(DM) &&
  /setItem\(LS_KEY, "1"\)/.test(DM));
// 4) 非 debug 模式不顯示 quick complete
ck("4) 非 debug 模式不顯示 quick complete（按鈕由 isDebugMode() 閘門；正式版無「結束」按鈕）",
  /playing && isDebugMode\(\) &&/.test(GV) && /快速完成比賽/.test(GV) && !/⏹ 結束/.test(GV));
// 5) debug 模式 quick complete 控制可用，且**不再藏在 ⚙ 收合面板裡**（S29B4 根因）
ck("5) quick complete 常駐可見（不再被 showCtl 收合遮住）：按鈕在 (!isMobile||showCtl) 區塊之外、呼叫 fastForward",
  /onClick=\{fastForward\}/.test(GV) &&
  // fastForward 按鈕出現在 ⚙ 收合區塊（{(!isMobile || showCtl) &&）之前
  GV.indexOf("onClick={fastForward}") < GV.indexOf("(!isMobile || showCtl)"));

// ═══ quick complete 行為（同引擎推進到終局，與自然跑完逐位元相同）═══════════════
function fp(e) { return JSON.stringify([e.t, e.bK, e.rK, e.winner, e.players.map((p) => [p.k, p.d, Math.round(p.pos.x * 1e6)])]); }
const plain = new LogicEngine(4242);
for (let t = DT; t <= CAP && !plain.over; t += DT) plain.tick(DT);
const chunked = new LogicEngine(4242);
outer: while (!chunked.over) {
  for (let i = 0; i < 40 && !chunked.over; i++) { chunked.tick(DT); if (i % 4 === 3) chunked.snapshot(); if (chunked.t > CAP) break outer; }
  chunked.snapshot();
}
const bit = fp(plain) === fp(chunked);
const endSnap = chunked.snapshot();
const result = snapshotToBattleResult(endSnap, []);
// 6) quick complete 進入 Result
ck(`6) quick complete 進入 Result（分塊+途中 snapshot 與自然跑完逐位元同結果=${bit}；可建 BattleResult winner=${result.winner}）`,
  bit && plain.over && chunked.over && result.schema === "BattleResult.v2" &&
  /fastForward/.test(code(src("src/useLocalServer.js"))) && !/fastForward[\s\S]{0,400}new LogicEngine/.test(code(src("src/useLocalServer.js"))));
// 7) quick complete 不重複發獎
const tx1 = mobaResultToTransaction(result, { players: [], streak: 0, fansNow: 0 });
const tx2 = mobaResultToTransaction(result, { players: [], streak: 0, fansNow: 0 });
ck("7) quick complete 不重複發獎（同 Result ⇒ 同 transactionId ⇒ applyMatchProgress 冪等；終局結算單一入口 snap.over && !bs.result）",
  ((tx1 === null && tx2 === null) || (tx1?.transactionId && tx1.transactionId === tx2?.transactionId)) &&
  /snap\.over && !bs\.result/.test(code(src("src/battle/useBattleFeed.js"))));

// ═══ C. Replay 可觀看（自然 / quick complete 兩種取樣都要 finalize 成功）═════════
function captureRun(seed, mode) {
  clearReplay();
  const e = new LogicEngine(seed);
  beginReplayCapture({ seed, config: {} });
  let sincePush = 0;
  for (let t = DT; t <= CAP && !e.over; t += DT) {
    e.tick(DT);
    if (mode === "natural") captureReplayFrame(e.snapshot());          // useLocalServer 正常：每 tick push
    else { sincePush += DT; if (sincePush >= 2 && !e.over) { captureReplayFrame(e.snapshot()); sincePush = 0; } }  // fastForward：每 2 模擬秒
  }
  captureReplayFrame(e.snapshot());                                     // over 幀
  const res = snapshotToBattleResult(e.snapshot(), []);
  const rep = finalizeReplay({ matchId: mobaMatchId(res), events: [], resultSummary: null });
  const cur = getCurrentReplay();
  const v = rep ? validateMobaReplay(rep) : { ok: false, errors: ["finalize null"] };
  // BattleEndScreen 的 canReplay 條件
  const canReplay = Boolean(res && rep && rep.matchId === mobaMatchId(res) && rep.frames?.length > 0);
  return { rep, cur, v, canReplay, res };
}
const nat = captureRun(4242, "natural");
const ff = captureRun(777, "fastforward");
// 9) 自然結束後 Replay 可開
ck(`9) 自然結束後 Replay 可開（frames=${nat.rep?.frames?.length}、valid=${nat.v.ok}、canReplay=${nat.canReplay}、current===rep=${nat.cur === nat.rep}）`,
  nat.v.ok && nat.canReplay && nat.cur === nat.rep && nat.rep.frames.length > 10);
// 10) quick complete 後 Replay 可開
ck(`10) quick complete 後 Replay 可開（frames=${ff.rep?.frames?.length}、valid=${ff.v.ok}、canReplay=${ff.canReplay}）`,
  ff.v.ok && ff.canReplay && ff.rep.frames.length > 10);
// 8) quick complete 完成 Replay finalize（matchId 與結算同源）
ck("8) quick complete 完成 Replay finalize（matchId === mobaMatchId(result)、frames>0、getCurrentReplay 回傳本場）",
  ff.rep.matchId === mobaMatchId(ff.res) && ff.rep.frames.length > 0 && ff.cur === ff.rep);
// 11) Replay 不重新模擬
ck("11) Replay 不重新模擬（ReplayScreen/buffer 不 import LogicEngine、不 tick、不 new CommsEngine）",
  !/import[^;]*LogicEngine/.test(RS) && !/\.tick\(/.test(RS) && !/new CommsEngine/.test(RS) &&
  !/import[^;]*LogicEngine/.test(RB) && !/\.tick\(/.test(RB));
// C-extra) 白畫面防護：ReplayScreen 對缺欄位有安全預設
ck("   白畫面防護：MobaReplayScreen 對 frame/meta 缺欄位有安全預設（towersMeta/playersMeta/s/g/tw/p 都有 fallback）",
  /towersMeta = replay\?\.towersMeta \?\? \{\}/.test(RS) && /playersMeta = replay\?\.playersMeta \?\? \[\]/.test(RS) &&
  /a\?\.s \?\? \[0, 0\]/.test(RS) && /a\?\.p\?\.\[i\]/.test(RS) && /if \(!pa\) return null/.test(RS));

// ═══ B. 10 英雄一致可點 ══════════════════════════════════════════════════════
// 12/13) HeroDetailPanel 對「無 HeroProgress 紀錄」的英雄不再回傳 null（用 emptyHero 佔位）
//   —— 這是「部分能點部分不能」的根因：舊碼 `if (!hero) return null` 讓無紀錄英雄點了沒反應。
const noNullReturn = !/if \(!hero\) return null/.test(code(HD));
const usesFallback = /emptyHero\(\)/.test(HD) && /const hero = storeHero \?\? emptyHero\(\)/.test(HD);
const eh = emptyHero();
const fallbackRenderable = eh && eh.level === 1 && eh.mastery && attrs(eh.level);   // 佔位資料可被面板用
ck("12) 藍方 5 英雄可點（HeroDetailPanel 不再對無紀錄英雄回傳 null；emptyHero 佔位可渲染）",
  noNullReturn && usesFallback && !!fallbackRenderable);
ck("13) 紅方 5 英雄可點（同一防護：對手方英雄常無 HeroProgress 紀錄，過去正是它們點不開）",
  noNullReturn && usesFallback);
// 14) 10 頭像一致資料映射：藍紅兩側都走同一 laneRow → SideCell → mk 路徑
ck("14) 10 頭像一致資料映射（藍/紅都走 laneRow→SideCell onOpen→mk；mk 以 heroId 回退解析、不因陣營分歧）",
  /onOpen=\{\(\) => setOpen\(mk\(b, "blue", i\)\)\}/.test(HS) &&
  /onOpen=\{\(\) => setOpen\(mk\(r, "red", i\)\)\}/.test(HS) &&
  /heroId: h\?\.id \?\? r\.heroId/.test(HS));
// 15) 點擊可開正確 HeroDetail：mk 產生 {heroId,heroName,playerName,side}，heroName 一定非空
ck("15) 點擊開正確 HeroDetail（mk 帶 heroId/heroName/playerName/side；heroName 以 h?.zh ?? p.id 保底非空）",
  /return \{ heroId: h\?\.id \?\? r\.heroId, heroName: h\?\.zh \?\? p\.id, playerName: r\.player \?\? p\.id\.toUpperCase\(\), side: p\.side \}/.test(HS));
// 16) HeroDetail 可正常關閉（頂部 ✕ 固定 + 背幕點擊）
ck("16) HeroDetail 可正常關閉（頂部固定 ✕ 在可捲動內容之前 + 背幕 onClick=onClose）",
  HD.indexOf("✕") > 0 && HD.indexOf("✕") < HD.indexOf('overflowY: "auto"') && /onClick=\{onClose\}/.test(HD));
// hitbox：整個 SideCell 可點（不是只有小頭像）——onClick 掛在整列 cell 的 div 上、cursor pointer
ck("   hitbox：整個 SideCell 可點（onClick 掛整列 cell div、cursor pointer），非僅小頭像",
  /function SideCell\(/.test(HS) && /onClick=\{onOpen\}[\s\S]{0,200}cursor: "pointer"/.test(HS));

// ═══ D. 塔常駐光移除 ══════════════════════════════════════════════════════════
// 17) 塔沒有常駐 idle glow；且未新增 PointLight
//   S29B5 已移除 Dragon / Baron 的 PointLight；僅保留塔/主堡的畫質 gate。
const idleLow = /IDLE_EMISS = isNexus \? 0\.14 : 0\.06/.test(V3D) && /emissiveIntensity: IDLE_EMISS/.test(V3D);
const plCount = (V3D.match(/new THREE\.PointLight/g) || []).length;
const noExtraLight = plCount <= 1 && /if \(isNexus \|\| Q\.towerLights\)/.test(V3D);
ck(`17) 塔沒有常駐 idle glow / 不新增 PointLight（crystal 常態 emissive 主堡0.14/塔0.06 低於 Bloom 門檻；PointLight 僅剩畫質 gate ${plCount} 處）`,
  idleLow && noExtraLight);
// 18) 受擊與摧毀短暫反應仍存在
ck("18) 受擊/摧毀短暫反應仍在（受擊 flashT 脈衝 +1.6 峰值；摧毀 spawnViewFx 爆點）",
  /o\.idleEmiss \+ \(o\.flashT \/ 0\.25\) \* 1\.6/.test(V3D) &&
  /o\.flashT = 0\.25/.test(V3D) && /spawnViewFx\(o\.grp\.position\.x/.test(V3D));

// ═══ 無 undefined / NaN（recovery 改動不得引入壞值）═════════════════════════════
{
  const bad = [];
  const scan = (o, p2) => {
    if (o === undefined) bad.push(p2);
    else if (typeof o === "number" && !Number.isFinite(o)) bad.push(p2 + "=" + o);
    else if (Array.isArray(o)) o.forEach((v, i) => scan(v, `${p2}[${i}]`));
    else if (o && typeof o === "object") for (const k in o) scan(o[k], `${p2}.${k}`);
  };
  scan(nat.rep.frames[Math.floor(nat.rep.frames.length / 2)], "frame");
  scan(endSnap, "snap");
  ck(`   無 undefined/NaN（replay frame + 終局 snapshot 深掃 ${bad.length} 筆）`, bad.length === 0);
}

// ═══ 19–25：巢狀 verifier / build ════════════════════════════════════════════
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
  console.log("⚠ SKIP_NESTED=1：跳過 19–25 巢狀驗證（開發迭代模式，不可作為完成依據）");
} else {
  const c3 = runNode("tools/check_moba_controls29b3.mjs", /1[0-9]\/1[0-9] 通過/, { SKIP_NESTED: "1" });
  ck(`19) controls29b3 verifier 引擎層通過（exit=${c3.code}）`, c3.ok && c3.code === 0);
  if (!(c3.ok && c3.code === 0)) for (const l of c3.out.split("\n")) if (l.startsWith("❌")) console.log("  [29b3] " + l);
  const p2 = runNode("tools/check_moba_presentation29b2.mjs", /12\/12 通過/, { SKIP_NESTED: "1" });
  ck(`20) presentation29b2 verifier 引擎層通過（exit=${p2.code}）`, p2.ok && p2.code === 0);
  if (!(p2.ok && p2.code === 0)) for (const l of p2.out.split("\n")) if (l.startsWith("❌")) console.log("  [29b2] " + l);
  const p1 = runNode("tools/check_moba_pacing29b1.mjs", /2[45]\/2[45] 通過/, { SKIP_NESTED: "1" });
  ck(`21) pacing29b1 verifier 引擎層通過（exit=${p1.code}）`, p1.ok && p1.code === 0);
  if (!(p1.ok && p1.code === 0)) for (const l of p1.out.split("\n")) if (l.startsWith("❌")) console.log("  [29b1] " + l);
  const rt = runNode("tools/check_moba_runtime29.mjs", /44\/44 通過/);
  ck(`22) runtime29 verifier 44/44（exit=${rt.code}）`, rt.ok && rt.code === 0);
  if (!(rt.ok && rt.code === 0)) for (const l of rt.out.split("\n")) if (l.startsWith("❌")) console.log("  [runtime29] " + l);
  ck("23) S23–S28 現役 verifier 通過（runtime29 巢狀）",
    /✅ 30\) Sprint28 verifier 29\/29/.test(rt.out) && /✅ 35\) Sprint23 verifier 28\/28/.test(rt.out));
  ck("24) regress / regress2 通過（runtime29 巢狀）",
    /✅ 36\) regress（結束率 15\/15）/.test(rt.out) && /✅ 37\) regress2（節奏門檻全綠）/.test(rt.out));
  ck("25) npm run build 通過（runtime29 巢狀）", /✅ 38\) npm run build 通過/.test(rt.out));
  for (const [name, script] of [["26) flow09 verifier", "tools/check_flow09.mjs"], ["27) dash10 verifier", "tools/check_dash10.mjs"]]) {
    const r = runNode(script, /✅/, {}, 600000);
    ck(`${name}（exit=${r.code}、無 ❌）`, r.ok && r.code === 0 && !r.out.includes("❌"));
  }
}

// ── 報告 ────────────────────────────────────────────────────────────────────
let pass = 0;
for (const [n, ok] of A) { console.log(`${ok ? "✅" : "❌"} ${n}`); if (ok) pass++; }
console.log(`\n${pass}/${A.length} 通過`);
console.log(`⚠ 未實測（無瀏覽器/真機）：FPS、?debug=1 的實機 UI 流程、觸控手勢、
  手機 320/360/390/430 視覺、塔光體感、Replay 播放外觀 —— 需 Ray 依人工驗收清單實測`);
process.exit(pass === A.length ? 0 : 1);
