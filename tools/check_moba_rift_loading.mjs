#!/usr/bin/env node
// ============================================================================
//  tools/check_moba_rift_loading.mjs — MOBA Rift Loading（deterministic ＋ source contract）
//
//    node tools/check_moba_rift_loading.mjs          決策／記帳／原始碼契約
//    node tools/check_moba_rift_loading.mjs --dist   另外檢查 npm run build 的產物
//
//  · 直接 import 純決策 `riftMapGate.js`，用固定時鐘重現 progress-aware 閘門：
//    持續有進度不 fallback、連續 10 秒無進度 stall、滿 60 秒 hard timeout、錯誤立即 fallback、
//    就緒立即揭露。不等真實時間、不開瀏覽器（瀏覽器實測見 browser_check_moba_rift_loading.mjs）。
//  · 原始碼契約：下載起點是 Ban/Pick（不在首頁）、Loading／Resume／Replay 會等、MobaMapBlockout 仍是
//    fallback、不再用 ?rev= 查詢字串、mapMode 只在診斷模式暴露。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RIFT_STALL_TIMEOUT_MS, RIFT_HARD_TIMEOUT_MS, RIFT_GLB_BYTES, LOADING_BAR_WAIT_CAP, RIFT_MAP_MODES,
  decideRiftMap, nextRiftGateDeadline, riftLoadProgress, loadingBarCap,
  beginMapFrameTally, noteMapFrame, mapFrameTally,
} from "../src/battle/moba/map/riftMapGate.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const code = (p) => read(p).split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
const WITH_DIST = process.argv.includes("--dist");

const results = [];
const ck = (name, pass, detail = "") => results.push({ name, pass: !!pass, detail });
const same = (a, b) => a.mode === b.mode && a.reason === b.reason;
const LOADING = { mode: "loading", reason: null };
const RIFT = { mode: "rift", reason: null };
const STALL = { mode: "blockout", reason: "stall" };
const TIMEOUT = { mode: "blockout", reason: "timeout" };
const ERROR = { mode: "blockout", reason: "error" };
const GS = 30_000;   // 閘門開始（Loading／Resume／Replay 入口）

// ── 1. 常數與正常路徑 ────────────────────────────────────────────────────────
{
  ck("常數：STALL_TIMEOUT 10000ms、HARD_TIMEOUT 60000ms", RIFT_STALL_TIMEOUT_MS === 10_000 && RIFT_HARD_TIMEOUT_MS === 60_000,
    `${RIFT_STALL_TIMEOUT_MS}/${RIFT_HARD_TIMEOUT_MS}`);
  const steps = [
    decideRiftMap({ status: "loading", now: 5_000, gateStartAt: null, lastProgressAt: null }),
    decideRiftMap({ status: "loading", now: 3_600_000, gateStartAt: null, lastProgressAt: 1 }),
    decideRiftMap({ status: "ready", now: GS, gateStartAt: GS }),
    decideRiftMap({ status: "ready", now: GS + 1, gateStartAt: null }),
  ];
  ck("NORMAL：尚未開始計時（Ban/Pick 背景下載）永遠不 fallback；就緒立即 Rift",
    same(steps[0], LOADING) && same(steps[1], LOADING) && same(steps[2], RIFT) && same(steps[3], RIFT));
}

// ── 2. SLOW_PROGRESS：持續有進度就繼續等 ────────────────────────────────────
{
  const at = (t, lastProgress) => decideRiftMap({ status: "loading", now: GS + t, gateStartAt: GS, lastProgressAt: GS + lastProgress });
  const cases = [at(20_001, 19_500), at(30_000, 29_000), at(45_000, 44_900), at(59_999, 59_000)];
  ck("SLOW_PROGRESS：超過舊的 20 秒、30 秒、45 秒、59.999 秒，只要 10 秒內有進度就維持 loading",
    cases.every((d) => same(d, LOADING)), cases.map((d) => d.mode).join(","));
  ck("SLOW_PROGRESS：下載 30 秒後就緒 ⇒ 立即 Rift（不等任何期限）",
    same(decideRiftMap({ status: "ready", now: GS + 30_000, gateStartAt: GS, lastProgressAt: GS + 29_900 }), RIFT));
}

// ── 3. STALL：連續 10 秒沒有有效進度 ─────────────────────────────────────────
{
  const midway = (t) => decideRiftMap({ status: "loading", now: GS + t, gateStartAt: GS, lastProgressAt: GS + 5_000 });
  ck("STALL：最後進度後 9.999 秒仍 loading、剛好 10 秒即 blockout／stall",
    same(midway(14_999), LOADING) && same(midway(15_000), STALL));
  const none = (t) => decideRiftMap({ status: "loading", now: GS + t, gateStartAt: GS, lastProgressAt: null });
  ck("STALL：入口後完全沒有進度（例如卡在首位元組）⇒ 閘門開始後 10 秒 stall", same(none(9_999), LOADING) && same(none(10_000), STALL));
  const early = (t) => decideRiftMap({ status: "loading", now: GS + t, gateStartAt: GS, lastProgressAt: GS - 25_000 });
  ck("STALL：Ban/Pick 期間的舊進度不會讓入口一開始就判 stall（以閘門開始為基準）", same(early(9_999), LOADING) && same(early(10_000), STALL));
  ck("STALL：遠早於 60 秒 hard cap 就 fallback", same(midway(15_000), STALL) && 15_000 < RIFT_HARD_TIMEOUT_MS);
}

// ── 4. HARD_TIMEOUT：60 秒絕對上限 ──────────────────────────────────────────
{
  const crawl = (t) => decideRiftMap({ status: "loading", now: GS + t, gateStartAt: GS, lastProgressAt: GS + t - 100 });
  ck("HARD_TIMEOUT：100ms 前仍有微量進度，59.999 秒 loading、滿 60 秒 blockout／timeout",
    same(crawl(59_999), LOADING) && same(crawl(60_000), TIMEOUT) && same(crawl(600_000), TIMEOUT));
  ck("HARD_TIMEOUT：同時滿足 stall 與 hard 時回報 timeout",
    same(decideRiftMap({ status: "loading", now: GS + 60_000, gateStartAt: GS, lastProgressAt: GS + 45_000 }), TIMEOUT));
}

// ── 5. 鎖定、失敗、就緒優先 ──────────────────────────────────────────────────
{
  const fresh = { status: "loading", now: GS + 20_000, gateStartAt: GS, lastProgressAt: GS + 19_999 };
  ck("LATCH：已判 stall／timeout 後，即使又出現新進度也維持 blockout（不退回空白）",
    same(decideRiftMap({ ...fresh, latchedReason: "stall" }), STALL) && same(decideRiftMap({ ...fresh, latchedReason: "timeout" }), TIMEOUT));
  ck("LATCH：鎖定後下載完成 ⇒ 就緒優先換回 Rift", same(decideRiftMap({ ...fresh, status: "ready", latchedReason: "stall" }), RIFT));
  ck("FAILURE：載入錯誤立即 blockout／error（不論閘門、進度或鎖定）",
    [null, GS].every((g) => same(decideRiftMap({ status: "failed", now: GS + 1, gateStartAt: g, lastProgressAt: GS + 1 }), ERROR))
    && same(decideRiftMap({ status: "failed", now: GS + 1, gateStartAt: GS, latchedReason: "stall" }), ERROR));
}

// ── 6. 排程期限、決定性、防呆 ────────────────────────────────────────────────
{
  ck("排程：下一個期限 = min(hard, max(閘門開始, 最後進度) + stall)",
    nextRiftGateDeadline({ gateStartAt: GS, lastProgressAt: null }) === GS + 10_000
    && nextRiftGateDeadline({ gateStartAt: GS, lastProgressAt: GS + 30_000 }) === GS + 40_000
    && nextRiftGateDeadline({ gateStartAt: GS, lastProgressAt: GS + 55_000 }) === GS + 60_000
    && nextRiftGateDeadline({ gateStartAt: GS, lastProgressAt: GS - 9_000 }) === GS + 10_000
    && nextRiftGateDeadline({ gateStartAt: null, lastProgressAt: 5 }) === null);
  let seed = 20260914;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const statuses = ["idle", "loading", "ready", "failed"];
  const latches = [null, null, null, "stall", "timeout"];
  const cases = Array.from({ length: 2000 }, () => ({
    status: statuses[Math.floor(rnd() * 4)],
    now: Math.floor(rnd() * 120_000),
    gateStartAt: rnd() < 0.2 ? null : Math.floor(rnd() * 60_000),
    lastProgressAt: rnd() < 0.3 ? null : Math.floor(rnd() * 120_000),
    latchedReason: latches[Math.floor(rnd() * latches.length)],
  }));
  const run = () => cases.map((c) => { const d = decideRiftMap(c); return `${d.mode}:${d.reason}`; }).join("|");
  const first = run();
  const refStable = cases.every((c) => decideRiftMap(c) === decideRiftMap({ ...c }));
  //  單調性：沒有鎖定時，只要 now 仍在 hard 之前且 10 秒內有進度，就不可能是 blockout。
  const noFalseFallback = cases.every((c) => {
    if (c.status !== "loading" || c.gateStartAt === null || c.latchedReason) return true;
    const base = c.lastProgressAt === null ? c.gateStartAt : Math.max(c.gateStartAt, c.lastProgressAt);
    const shouldWait = c.now < c.gateStartAt + 60_000 && c.now < base + 10_000;
    return !shouldWait || decideRiftMap(c).mode === "loading";
  });
  ck("決定性：同一組 2000 筆輸入跑兩次結果逐字相同，且回傳固定實例", first === run() && refStable);
  ck("決定性：2000 筆中，有進度且未滿 60 秒的情況 0 筆被判 fallback", noFalseFallback);
  const odd = [
    decideRiftMap({ status: "loading", now: NaN, gateStartAt: 10 }),
    decideRiftMap({ status: "loading", now: 99_999, gateStartAt: undefined }),
    decideRiftMap({ status: "idle", now: 99, gateStartAt: null }),
    decideRiftMap(),
  ];
  ck("防呆：時鐘或閘門無效時不會誤判 fallback（維持 loading）", odd.every((d) => same(d, LOADING)));
  ck("mapMode 值域固定為 loading | rift | blockout",
    JSON.stringify(RIFT_MAP_MODES) === JSON.stringify(["loading", "rift", "blockout"]));
}

// ── 7. Loading 進度條：閘門沒開不會走到 100 ───────────────────────────────────
{
  const caps = [0, 0.3, 0.99, 1, 5].map((p) => loadingBarCap(LOADING, p));
  ck("進度條：等待中上限 ≤ 95（到 100 才會進對戰）", caps.every((c) => c >= 10 && c <= LOADING_BAR_WAIT_CAP), caps.join(","));
  ck("進度條：Rift 就緒或 blockout 時可到 100",
    [RIFT, STALL, TIMEOUT, ERROR].every((d) => loadingBarCap(d, 0) === 100));
  ck("進度：gzip 解壓後位元組超過分母時，未就緒最多 0.99；就緒為 1",
    riftLoadProgress(RIFT_GLB_BYTES * 3, "loading") === 0.99 && riftLoadProgress(0, "ready") === 1
    && riftLoadProgress(Number.NaN, "loading") === 0);
}

// ── 8. 逐幀記帳：畫了什麼就記什麼 ────────────────────────────────────────────
{
  beginMapFrameTally(100);
  for (let i = 0; i < 5; i++) noteMapFrame("rift", null, 101 + i);
  const normal = mapFrameTally();
  beginMapFrameTally(200);
  noteMapFrame("loading", null, 201); noteMapFrame("blockout", "stall", 202);
  noteMapFrame("blockout", "stall", 203); noteMapFrame("rift", null, 204); noteMapFrame("bogus", null, 205);
  const stalled = mapFrameTally();
  ck("記帳：正常路徑第一幀 rift、blockout 0 幀、無切換",
    normal.firstFrameMode === "rift" && normal.frames.blockout === 0 && normal.frames.rift === 5
    && normal.switches.length === 0 && normal.mapMode === "rift");
  const ownerA = {}, ownerB = {};
  beginMapFrameTally(300, ownerA);
  noteMapFrame("blockout", "error", 301, ownerB); noteMapFrame("rift", null, 302, ownerA); noteMapFrame("blockout", "error", 303, ownerB);
  const owned = mapFrameTally();
  ck("記帳：只計最後掛上的地圖（Replay 底下仍在畫的戰場 canvas 不混入）",
    owned.firstFrameMode === "rift" && owned.frames.rift === 1 && owned.frames.blockout === 0, JSON.stringify(owned.frames));
  ck("記帳：stall 路徑記下 loading→blockout→rift 切換與原因，未知模式不計",
    stalled.firstFrameMode === "loading" && stalled.frames.blockout === 2 && stalled.frames.rift === 1
    && stalled.switches.map((s) => s.to).join(">") === "blockout>rift"
    && stalled.switches[0].reason === "stall" && stalled.mapMode === "rift"
    && Object.values(stalled.frames).reduce((a, b) => a + b, 0) === 4,
    JSON.stringify(stalled.switches));
}

// ── 9. 資產：走 Vite pipeline，不再有 ?rev= 與重複的 public 副本 ──────────────
{
  const glb = "src/assets/moba/rift-v1/esmo-rift.glb";
  const size = exists(glb) ? fs.statSync(path.join(ROOT, glb)).size : -1;
  const manifest = JSON.parse(read("public/assets/moba/rift-v1/manifest.json"));
  ck("資產：GLB 位於 src/assets（內容雜湊檔名），大小與 RIFT_GLB_BYTES／manifest 一致",
    size === RIFT_GLB_BYTES && manifest.glbBytes === RIFT_GLB_BYTES, `size=${size}`);
  ck("資產：public/ 不再保留 13 MB GLB 與小地圖底圖副本（避免 dist 重複兩份）",
    !exists("public/assets/moba/rift-v1/esmo-rift.glb") && !exists("public/assets/moba/rift-v1/rift-albedo.png")
    && exists("src/assets/moba/rift-v1/rift-albedo.png"));
  const riftAsset = read("src/battle/moba/map/riftAsset.js");
  ck("資產：Rift 以 ?url import 取得網址", /from "\.\.\/\.\.\/\.\.\/assets\/moba\/rift-v1\/esmo-rift\.glb\?url"/.test(riftAsset));
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.(jsx?|mjs)$/.test(e.name) && /rift-v1\/[^"'`]*\?rev=|rev=330-corridor/.test(read(rel))) offenders.push(rel);
    }
  };
  walk("src");
  ck("快取：src 內 Rift 資產不再使用 ?rev= 查詢字串", offenders.length === 0, offenders.join(", "));
  ck("快取：小地圖底圖同樣改走 asset import", /import riftAlbedoUrl from "\.\/assets\/moba\/rift-v1\/rift-albedo\.png"/.test(read("src/GameView.jsx"))
    && /terrainImage\.src = riftAlbedoUrl;/.test(read("src/GameView.jsx")));
}

// ── 10. 流程契約：Ban/Pick 起跑、入口等待、blockout 仍是 fallback ─────────────
{
  const app = code("src/AppShell.jsx");
  ck("流程：AppShell 在 banpick 開始下載（重試失敗、清閘門），tactic 補觸發",
    /if \(screen === "banpick"\) \{\s*resetRiftGate\(\);\s*preloadRiftAsset\(\{ source: "banpick", retryFailed: true \}\);/.test(app)
    && /else if \(screen === "tactic"\) \{\s*preloadRiftAsset\(\{ source: "tactic" \}\);/.test(app));
  const users = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.(jsx?|mjs)$/.test(e.name) && /preloadRiftAsset\(/.test(code(rel))) users.push(rel);
    }
  };
  walk("src");
  ck("流程：只有 Ban/Pick／Tactic（AppShell）、Loading、Replay 入口、戰場地圖會觸發下載（首頁不會）",
    users.sort().join(",") === [
      "src/AppShell.jsx", "src/battle/moba/map/EsmoRiftEnvironment.jsx",
      "src/battle/moba/map/riftAsset.js", "src/screens/moba/LoadingScreen.jsx",
      "src/screens/moba/RiftEntryGate.jsx",
    ].sort().join(","), users.join(", "));
  ck("Resume：恢復進行中的戰鬥時 Rift 未就緒 ⇒ 先走既有 LoadingScreen",
    /else if \(phase === "battle"\) setScreen\(getRiftAssetSnapshot\(\)\.status === "ready" \? "battle" : "loading"\);/.test(app));
  const gate = code("src/screens/moba/RiftEntryGate.jsx");
  ck("入口閘門：沿用 riftAsset（重試失敗、重新開始閘門），入口自己啟動後才依決策揭露",
    /preloadRiftAsset\(\{ source, retryFailed: true \}\)/.test(gate) && /armRiftGate\(\{ force: true, by: source \}\)/.test(gate)
    && /const open = !enabled \|\| rift\.status === "ready" \|\| \(armed && rift\.decision\.mode !== "loading"\);/.test(gate)
    && !/new GLTFLoader|useGLTF|setTimeout/.test(gate));
  const replayScreen = code("src/screens/moba/MobaReplayScreen.jsx");
  ck("Replay：Rift 未就緒時戰場不掛載、顯示載入畫面、時間軸不走",
    /const riftGate = useRiftEntryGate\("replay", \{ enabled: use3D && runtimeMap \}\);/.test(replayScreen)
    && /if \(!playing \|\| !mapReady\) return;/.test(replayScreen)
    && /\(mapReady\s*\?\s*<MobaRuntimeView3D[^>]*\/>\s*:\s*<RiftEntryLoading rift=\{riftGate\.rift\} \/>\)/.test(replayScreen));
  const loading = code("src/screens/moba/LoadingScreen.jsx");
  ck("流程：Loading 進場重試失敗並重新開始閘門，進度條受 loadingBarCap 管制",
    /preloadRiftAsset\(\{ source: "loading", retryFailed: true \}\)/.test(loading)
    && /armRiftGate\(\{ force: true, by: "loading" \}\)/.test(loading)
    && /capRef\.current = loadingBarCap\(rift\.decision, rift\.progress\)/.test(loading)
    && /Math\.min\(capRef\.current, p \+ 3\)/.test(loading));
  const asset = code("src/battle/moba/map/riftAsset.js");
  ck("Progress-aware：只有位元組真的增加才更新最後進度；stall／timeout 判定後鎖住；仍只有一套狀態",
    /if \(loaded > state\.loadedBytes\) \{ state\.lastProgressAt = now\(\); state\.loadedBytes = loaded; \}/.test(asset)
    && /if \(decision\.mode === "blockout" && decision\.reason !== "error" && state\.latchedReason === null\)/.test(asset)
    && /decideRiftMap\(\{\s*status: state\.status, now: now\(\),\s*gateStartAt: state\.gateStartAt, lastProgressAt: state\.lastProgressAt, latchedReason: state\.latchedReason,\s*\}\)/.test(asset)
    && !/RIFT_GATE_TIMEOUT_MS|deadlineAt/.test(asset));
  const env = code("src/battle/moba/map/EsmoRiftEnvironment.jsx");
  const map = code("src/battle/moba/map/MobaRuntimeMap.jsx");
  ck("fallback：MobaMapBlockout 仍由 MobaRuntimeMap 傳入，失敗／stall／逾時與 render 例外都會畫它",
    /fallback=\{\s*<MobaMapBlockout/.test(map)
    && /if \(decision\.mode === 'blockout'\) \{\s*return <>\{fallback\}/.test(env)
    && /class AssetBoundary/.test(env) && /this\.state\.failed \? this\.props\.fallback/.test(env));
  ck("fallback：戰場不再用 Suspense／useGLTF 在掛載後才下載", !/Suspense|useGLTF/.test(env));
}

// ── 11. 診斷：mapMode 只在 ?diag=1 暴露 ───────────────────────────────────────
{
  const riftAsset = code("src/battle/moba/map/riftAsset.js");
  const env = code("src/battle/moba/map/EsmoRiftEnvironment.jsx");
  const diag = code("src/battle/moba/render/runtimeDiagnostics.js");
  ck("診斷：__ESMO_RIFT_DIAG 只在 diagnosticsEnabled() 時掛上",
    /if \(diagInstalled \|\| typeof window === "undefined" \|\| !diagnosticsEnabled\(\)\) return;/.test(riftAsset)
    && (riftAsset.match(/window\.__ESMO_RIFT_DIAG\s*=/g) ?? []).length === 1);
  ck("診斷：逐幀記帳探針只在診斷模式掛載", /const probe = useMemo\(\(\) => diagnosticsEnabled\(\), \[\]\)/.test(env)
    && (env.match(/<MapFrameProbe/g) ?? []).length === (env.match(/probe && <MapFrameProbe|probe \? <MapFrameProbe/g) ?? []).length);
  ck("診斷：__ESMO_RUNTIME_DIAG 回報 mapMode／mapFallbackReason／mapFrames",
    /mapMode: map\.mapMode/.test(diag) && /mapFallbackReason: map\.mapFallbackReason/.test(diag) && /mapFrames: map\.frames/.test(diag));
}

// ── 12. build 產物 ───────────────────────────────────────────────────────────
if (WITH_DIST) {
  const dir = path.join(ROOT, "dist/assets");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const glb = files.filter((f) => /^esmo-rift-[\w-]+\.glb$/.test(f));
  const png = files.filter((f) => /^rift-albedo-[\w-]+\.png$/.test(f));
  const glbSize = glb[0] ? fs.statSync(path.join(dir, glb[0])).size : -1;
  ck("dist：GLB 以內容雜湊檔名輸出一份，大小正確", glb.length === 1 && glbSize === RIFT_GLB_BYTES, glb.join(","));
  ck("dist：小地圖底圖以雜湊檔名輸出一份", png.length === 1, png.join(","));
  ck("dist：舊路徑副本不存在", !fs.existsSync(path.join(ROOT, "dist/assets/moba/rift-v1/esmo-rift.glb"))
    && !fs.existsSync(path.join(ROOT, "dist/assets/moba/rift-v1/rift-albedo.png")));
  const js = files.filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
  ck("dist：bundle 不含 rev=330-corridor，且引用雜湊檔名", !/rev=330-corridor/.test(js) && glb[0] && js.includes(glb[0]) && png[0] && js.includes(png[0]));
}

for (const r of results) console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
const passed = results.filter((r) => r.pass).length;
const ok = passed === results.length;
console.log(`\nMOBA Rift Loading: ${passed}/${results.length} ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
