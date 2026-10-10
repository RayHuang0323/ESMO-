#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_live_assembly_parity_3a.mjs — Phase 3a Task 4：Live 組裝的瀏覽器對等
//
//  執行：node tools/browser/run-gate.mjs tools/browser_check_live_assembly_parity_3a.mjs --timeout 1900000
//        （本地 dev server；一次只跑這一支）
//
//  走 ?debug=moba-runtime-battle&shot=…&waitTs=120（正式 GameView → useLocalServer.start → 唯一組裝器），
//  桌機 1366 與手機 390 各一場：
//   P0 seed 固定：開局前把 Date.now 凍結在固定值（hook 的本機 fallback seed＝(Date.now() & 0xffff) | 1），
//      setup 出現後立刻解凍 ⇒ 頁面 setup 的 seed／seedSource 等於預期。
//   P1 頁面 setup 雜湊（__ESMO_MATCH_SETUP_HASH）＝ Node 對頁面 setup 重算的雜湊
//   P2 Node 以頁面交出的同一份 builder 輸入（__ESMO_LIVE_SETUP_INPUTS）呼叫 buildLiveMatchSetup ⇒ 同一個雜湊
//      （瀏覽器與 Node 的 builder 逐位元相同）
//   P3 Node 以共用 deps 組裝同一份 setup、tick 到頁面取樣的同一個 tick 數 ⇒ 逐 tick 串流雜湊（golden 的
//      createStreamHasher，每 20 tick 取樣）與當下狀態雜湊都相同；depsFingerprint 相同
//   P3e 正常路徑不顯示「這場比賽無法開始」（battle-assembly-error；fix round 1）
//   N  沒有 ?shot= 的正式路徑：比賽照常開始、沒有錯誤畫面、四個對等鉤子都不存在、串流雜湊模組沒有被載入
//   E  page error 0、console error 0
//  ⚠ 只讀 ?shot= 才存在的驗收鉤子；不 tick、不改模擬狀態。chrome.evaluate 字串裡不能有反引號。
// ============================================================================
import { runGate, finishGate } from "./browser/harness.mjs";
import { buildLiveMatchSetup } from "../src/battle/moba/liveMatchSetup.js";
import { assembleMatch } from "../src/battle/moba/matchAssembler.js";
import { sharedMatchAssemblerDeps } from "../src/battle/moba/matchAssemblerDeps.js";
import { createMatchSetup, matchSetupHash } from "../src/platform/contracts/matchSetup.js";
import { engineStreamHash, createStreamHasher } from "./lib/matchGolden.mjs";

const FIXED_NOW = 1757000004242;                      // 凍結的 Date.now（只在開局前）
const EXPECTED_SEED = (FIXED_NOW & 0xffff) | 1;
const FREEZE = "(function(){var real=Date.now.bind(Date);window.__ESMO_FREEZE_NOW=true;"
  + "Date.now=function(){return window.__ESMO_FREEZE_NOW?" + FIXED_NOW + ":real();};})();";

/** Node 端：同一份 setup 組裝並 tick 到同一個 tick 數。 */
function nodeReplay(setup, ticks) {
  const asm = assembleMatch(setup, sharedMatchAssemblerDeps());
  if (!asm.ok) return { error: asm.errors.map((e) => `${e.code}@${e.field}`).join(",") };
  const stream = engineStreamHash(asm.engine, 20);
  for (let i = 0; i < ticks; i++) asm.engine.tick(0.5);
  const now = createStreamHasher(1); now.sample(asm.engine);
  return { ticks: stream.ticks, t: asm.engine.t, streamHash: stream.hex, stateHash: now.hex, depsFingerprint: asm.applied.depsFingerprint };
}
/** 頁面 setup（JSON）→ createMatchSetup 的輸入（拿掉推導欄位）。 */
const setupInputOf = (s) => { const { schema: _s, effectiveLayers: _e, rulesetId: _r, ...rest } = s; return rest; };

const result = await runGate({
  name: "Live Assembly Parity 3a",
  timeoutMs: 1800000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
    await chrome.send("Page.addScriptToEvaluateOnNewDocument", { source: FREEZE });
    const clickText = (t) => ev("const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()===" + JSON.stringify(t) + "); if(!b) return JSON.stringify(false); b.click(); return JSON.stringify(true);");
    const hashes = {};
    const noAssemblyError = async () => (await ev("return JSON.stringify(document.querySelector('[data-testid=\"battle-assembly-error\"]') === null);")) === true;

    async function runViewport(tag, setupViewport) {
      await setupViewport();
      await chrome.navigate(`${url}?debug=moba-runtime-battle&shot=parity${tag}&waitTs=120&quality=low`);
      let have = false;
      for (let i = 0; i < 120 && !have; i++) { await sleep(500); have = !!(await ev("return JSON.stringify(typeof window.__ESMO_MATCH_SETUP_HASH === 'string');")); }
      await ev("window.__ESMO_FREEZE_NOW=false; return JSON.stringify(1);");
      ck(`${tag} P0a 對等鉤子存在（?shot= 才掛）`, have);
      if (!have) return;
      const dynLoaded = await ev("return JSON.stringify(performance.getEntriesByType('resource').map(function(e){return e.name;}).filter(function(n){return /engineStreamHash/.test(n);}).length);");
      ck(`${tag} P0c ?shot=：串流雜湊模組是另外載入的資源（N3 的正對照）`, dynLoaded >= 1, `entries=${dynLoaded}`);
      const page = await ev("return JSON.stringify({ hash: window.__ESMO_MATCH_SETUP_HASH, setup: window.__ESMO_MATCH_SETUP, inputs: window.__ESMO_LIVE_SETUP_INPUTS, probe: typeof window.__ESMO_ENGINE_STREAM_HASH === 'function' });");
      ck(`${tag} P0b seed 固定：頁面 setup.seed＝(凍結的 Date.now & 0xffff) | 1、seedSource＝local`, page?.setup?.seed === EXPECTED_SEED && page?.setup?.meta?.seedSource === "local",
        `seed=${page?.setup?.seed} expected=${EXPECTED_SEED} source=${page?.setup?.meta?.seedSource}`);
      hashes[tag] = page?.hash;
      const recomputed = page?.setup ? matchSetupHash(page.setup) : null;
      const recreated = page?.setup ? createMatchSetup(setupInputOf(page.setup)) : { ok: false };
      ck(`${tag} P1 頁面 setup 雜湊＝Node 重算（直接雜湊＋createMatchSetup 重建皆同）`, !!page?.hash && recomputed === page.hash && recreated.ok && matchSetupHash(recreated.setup) === page.hash,
        `page=${page?.hash} node=${recomputed} rebuilt=${recreated.ok ? matchSetupHash(recreated.setup) : "ERR"}`);
      const nodeBuilt = page?.inputs ? buildLiveMatchSetup(page.inputs) : { ok: false, errors: [] };
      ck(`${tag} P2 同一份 builder 輸入在 Node 建出同一個 setup 雜湊`, nodeBuilt.ok && matchSetupHash(nodeBuilt.setup) === page.hash,
        nodeBuilt.ok ? `node=${matchSetupHash(nodeBuilt.setup)}` : (nodeBuilt.errors ?? []).map((e) => e.code).join(","));
      //  4× 加速（只改 tick 的真實間隔，dt 不變）後等到 waitTs
      for (let i = 0; i < 20; i++) { if (await clickText("4×")) break; await sleep(500); }
      let ready = false;
      for (let i = 0; i < 400 && !ready; i++) { await sleep(1000); ready = String(await chrome.evaluate("return JSON.stringify(window.__BATTLE_SHOT_READY || null);")).includes(`parity${tag}`); }
      ck(`${tag} P3a 戰鬥推進到 waitTs=120`, ready);
      ck(`${tag} P3e 正常路徑：畫面沒有「這場比賽無法開始」（battle-assembly-error 不存在）`, await noAssemblyError());
      if (!ready) return;
      //  同一個同步 evaluate 內讀 tick 數與雜湊 ⇒ 不會被中途的 tick 拆開
      const live = await ev("return JSON.stringify(window.__ESMO_ENGINE_STREAM_HASH());");
      const node = nodeReplay(page.setup, live?.ticks ?? 0);
      console.log(`   ${tag} 取樣：page ${JSON.stringify(live)}`);
      console.log(`   ${tag} 取樣：node ${JSON.stringify(node)}`);
      ck(`${tag} P3b 取樣點在 120 s 之後、且 tick 數＝t/0.5`, (live?.t ?? 0) >= 120 && live?.ticks === Math.round(live.t / 0.5), `t=${live?.t} ticks=${live?.ticks}`);
      ck(`${tag} P3c Node 組同一份 setup、tick 到同一個 tick 數 ⇒ 逐 tick 串流雜湊＋狀態雜湊＋t 相同`,
        !node.error && node.ticks === live.ticks && node.t === live.t && node.streamHash === live.streamHash && node.stateHash === live.stateHash, node.error ?? "");
      ck(`${tag} P3d depsFingerprint 相同（頁面與 Node 用同一份共用 deps）`, !!live?.depsFingerprint && node.depsFingerprint === live.depsFingerprint, `${live?.depsFingerprint} vs ${node.depsFingerprint}`);
    }

    const desktop = async () => {
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await chrome.send("Emulation.clearDeviceMetricsOverride", {});
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    };
    const mobile = async () => {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    };
    await runViewport("desktop", desktop);
    await runViewport("m390", mobile);

    //  N：沒有 ?shot= 的正式路徑（同步開局，不載入串流雜湊模組）——比賽照常開始、沒有錯誤畫面、四個對等鉤子一個都不存在
    await desktop();
    await chrome.navigate(`${url}?debug=moba-runtime-battle&quality=low`);
    let started = false;
    for (let i = 0; i < 120 && !started; i++) { await sleep(500); started = (await ev("return JSON.stringify(document.querySelector('[data-testid=\"leave-active-match\"]') !== null);")) === true; }
    await ev("window.__ESMO_FREEZE_NOW=false; return JSON.stringify(1);");
    ck("N1 沒有 ?shot=：比賽照常開始（leave-active-match 出現）、沒有 battle-assembly-error", started && await noAssemblyError());
    const leaked = await ev("return JSON.stringify(['__ESMO_MATCH_SETUP_HASH','__ESMO_MATCH_SETUP','__ESMO_LIVE_SETUP_INPUTS','__ESMO_ENGINE_STREAM_HASH'].filter(function(k){return typeof window[k] !== 'undefined';}));");
    ck("N2 沒有 ?shot=：四個對等鉤子都不存在", Array.isArray(leaked) && leaked.length === 0, JSON.stringify(leaked));
    const loaded = await ev("return JSON.stringify(performance.getEntriesByType('resource').map(function(e){return e.name;}).filter(function(n){return /engineStreamHash/.test(n);}));");
    ck("N3 沒有 ?shot=：頁面沒有載入串流雜湊模組（engineStreamHash）", Array.isArray(loaded) && loaded.length === 0, JSON.stringify(loaded));
    console.log(`   桌機與 390 的 setup 雜湊：${hashes.desktop} / ${hashes.m390}（${hashes.desktop === hashes.m390 ? "相同" : "不同（各自的店內狀態不同時屬正常；對等以各自頁面為準）"}）`);

    const errs = chrome.pageErrors ?? [];
    const consoleErrs = (chrome.consoleLines ?? []).filter((l) => l.startsWith("[error]"));
    ck("E1 page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
    ck("E2 console error 0", consoleErrs.length === 0, consoleErrs.slice(0, 3).join(" ¦ "));
  },
});
finishGate(result);
