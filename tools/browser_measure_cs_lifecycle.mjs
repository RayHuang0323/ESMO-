#!/usr/bin/env node
// ============================================================================
//  CS 進場／離開／返回的資源量測（Bug A 的證據蒐集，**不修任何東西**）
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_measure_cs_lifecycle.mjs --timeout 1800000`
//
//  ⚠ 這支是**量測工具**，不是驗收 gate。它只回答一個問題：
//    「進出同一場 CS 三次，資源有沒有持續累積？」先有數字才談原因。
//
//  ⚠ 進場序列沿用既有的 `browser_check_cs_c3_environment_slice.mjs`——
//    那支已經知道怎麼走完配對流程。不自己重猜一套（第一版就是猜錯，
//    卡在「陣容尚未完成」空跑了 7 分鐘）。
//
//  ⚠ instrumentation 用 `Page.addScriptToEvaluateOnNewDocument` 在頁面腳本
//    **之前**注入，才攔得到 App 自己掛的 RAF 與 listener。產品原始碼不動。
// ============================================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { RESOLVE_APP_MODULES } from "./browser/cdp.mjs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => { const s = String(raw).replace(/^"|"$/g, ""); try { return JSON.parse(s); } catch { return null; } };
const OUT = new URL("../review/cs-lifecycle/", import.meta.url);

const PROBE = `
(() => {
  if (window.__ESMO_PROBE__) return;
  const P = { rafLive: 0, listeners: new Map(), intervals: 0, glContexts: 0 };
  window.__ESMO_PROBE__ = P;
  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  const live = new Set();
  window.requestAnimationFrame = (cb) => {
    const id = raf((t) => { live.delete(id); P.rafLive = live.size; cb(t); });
    live.add(id); P.rafLive = live.size; return id;
  };
  window.cancelAnimationFrame = (id) => { live.delete(id); P.rafLive = live.size; return caf(id); };
  for (const target of [window, document]) {
    const add = target.addEventListener.bind(target);
    const rm = target.removeEventListener.bind(target);
    const pre = target === window ? "window:" : "document:";
    target.addEventListener = function (type, fn, opt) {
      P.listeners.set(pre + type, (P.listeners.get(pre + type) || 0) + 1);
      return add(type, fn, opt);
    };
    target.removeEventListener = function (type, fn, opt) {
      P.listeners.set(pre + type, Math.max(0, (P.listeners.get(pre + type) || 0) - 1));
      return rm(type, fn, opt);
    };
  }
  const si = window.setInterval.bind(window), ci = window.clearInterval.bind(window);
  const ints = new Set();
  window.setInterval = (...a) => { const id = si(...a); ints.add(id); P.intervals = ints.size; return id; };
  window.clearInterval = (id) => { ints.delete(id); P.intervals = ints.size; return ci(id); };
  //  ⚠ 取得次數 vs 存活數是兩件事：每次掛載都會建新的 renderer ⇒ 取得次數
  //    本來就會 +1。會不會耗盡 context（約 16 個上限）取決於**舊的有沒有被放掉**，
  //    所以要記住每個 context 並用 isContextLost() 判斷還活著幾個。
  P.ctxRefs = [];
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, ...r) {
    const ctx = gc.call(this, t, ...r);
    if (String(t).includes("webgl") && ctx) { P.glContexts++; P.ctxRefs.push(ctx); }
    return ctx;
  };
})();
`;

/** 讀一次現況。⚠ renderer.info 從 `__ESMO_FPS_SCENE__` 拿，拿不到就誠實回 null。 */
const snapshot = () => `
  const P = window.__ESMO_PROBE__ || {};
  const listeners = {};
  let listenerTotal = 0;
  if (P.listeners) for (const [k, v] of P.listeners) if (v > 0) { listeners[k] = v; listenerTotal += v; }
  const st = window.__ESMO_FPS_SCENE__;
  const info = st && st.renderer && st.renderer.info ? st.renderer.info : null;
  return JSON.stringify({
    heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    canvas: document.querySelectorAll("canvas").length,
    rafLive: P.rafLive ?? null,
    listenerTotal, listeners,
    intervals: P.intervals ?? null,
    glAcquired: P.glContexts ?? null,
    //  ⭐ 真正該看的：還活著的 WebGL context 有幾個。
    glAlive: (P.ctxRefs ?? []).filter((c) => { try { return !c.isContextLost(); } catch { return false; } }).length,
    sceneHandle: !!st,
    geometries: info ? info.memory.geometries : null,
    textures: info ? info.memory.textures : null,
    programs: info && info.programs ? info.programs.length : null,
    drawCalls: info ? info.render.calls : null,
    sceneChildren: st && st.scene ? st.scene.children.length : null,
    //  ⚠ 清掉全域 handle 之後就讀不到 renderer.info 了（那正是修復本身）。
    //    改讀卸載當下留下的數字快照——只有數字，不持有任何物件。
    lastTeardown: window.__ESMO_FPS_TEARDOWN__ ?? null,
  });
`;

const seed = () => `
  ${RESOLVE_APP_MODULES}
  const store = profile.useProfileStore;
  localStorage.removeItem("esmo.profile.v1");
  store.getState().startNewGame("elite");
  await new Promise((r) => setTimeout(r, 400));
  store.getState().save();
  return JSON.stringify({ players: store.getState().players.length });
`;

const waitFor = async (chrome, sleep, expr, timeoutMs, label) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = J(await chrome.evaluate(`return JSON.stringify({ v: Boolean(${expr}) });`));
    if (r?.v) return { ok: true, ms: Date.now() - t0 };
    await sleep(300);
  }
  return { ok: false, ms: Date.now() - t0, label };
};

const clickText = (needle) => `
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const el = [...document.querySelectorAll("button")].filter(vis)
    .find((n) => !n.disabled && (n.innerText || "").includes(${JSON.stringify(needle)}));
  if (!el) return JSON.stringify({ ok: false });
  el.click();
  return JSON.stringify({ ok: true });
`;

const prepAction = () => `
  const b = document.querySelector('[data-testid="prep-primary-action"]');
  if (!b) return JSON.stringify({ ok: false, action: null });
  const action = b.dataset.action || null;
  if (b.disabled) return JSON.stringify({ ok: false, action });
  b.click();
  return JSON.stringify({ ok: true, action });
`;

/**
 * 讀 MatchSession／比賽狀態。⚠ cleanup 不可以把比賽重開成新的一場。
 *
 * ⚠ 要走 `activeMatchView()`（`resumeActiveMatch` 用的就是它），
 *   不是存檔裡的原始欄位——後者讀出來全是 null，看起來像「沒有比賽」，
 *   實際上只是我讀錯地方。
 */
const matchState = () => `
  ${RESOLVE_APP_MODULES}
  const v = profile.useProfileStore.getState().activeMatchView?.() ?? null;
  const live = window.__ESMO_FPS_SCENE__?.liveRef?.current ?? null;
  return JSON.stringify({
    hasView: !!v,
    restoreable: v?.restoreable ?? null,
    mode: v?.mode ?? null,
    phase: v?.phase ?? null,
    sessionId: v?.sessionId ?? v?.matchId ?? null,
    seed: v?.config?.csConfig?.seed ?? v?.seed ?? null,
    mapKey: v?.config?.csConfig?.mapKey ?? null,
    round: live?.round ?? live?.sim?.round ?? null,
    score: live ? [live.sim?.scoreT ?? null, live.sim?.scoreCT ?? null] : null,
    roster: live?.sim?.players?.length ?? live?.players?.length ?? null,
  });
`;

/** 返回同一場（resume），不是重走配對。 */
async function resumeBattle(chrome, sleep) {
  const t0 = Date.now();
  const r = J(await chrome.evaluate(`
    const el = document.querySelector('[data-testid="resume-active-match"]');
    if (!el) return JSON.stringify({ ok: false, why: "首頁沒有『返回對戰』入口" });
    el.scrollIntoView({ block: 'center' }); el.click();
    await new Promise((d) => setTimeout(d, 1200));
    return JSON.stringify({ ok: true });
  `));
  if (!r?.ok) return { ok: false, ms: Date.now() - t0, why: r?.why };
  const w = await waitFor(chrome, sleep,
    `document.querySelector('[data-testid="cs-match-speed-controls"]') && document.querySelector("canvas")`, 180000);
  return w.ok ? { ok: true, ms: Date.now() - t0 } : { ok: false, ms: Date.now() - t0, why: "resume 後沒回到戰鬥畫面" };
}

/** 走完整條 CS 進場流程；回傳到達戰鬥畫面的耗時。 */
async function enterBattle(chrome, sleep) {
  const t0 = Date.now();
  const fail = (why) => ({ ok: false, ms: Date.now() - t0, why });

  if (!(await waitFor(chrome, sleep, `document.body.innerText.includes("CS")`, 30000)).ok) return fail("首頁沒有 CS");
  if (!J(await chrome.evaluate(clickText("CS")))?.ok) return fail("點不到 CS");
  if (!(await waitFor(chrome, sleep, `document.querySelector('[data-testid="prep-primary-action"]')`, 30000)).ok) return fail("沒有賽前畫面");

  let a = J(await chrome.evaluate(prepAction()));
  if (a?.action === "blocked") {
    //  陣容沒排滿 ⇒ 用畫面上的自動填補鍵（既有 gate 的做法）。
    await chrome.evaluate(clickText("自動"));
    if (!(await waitFor(chrome, sleep,
      `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "enqueue"`, 20000)).ok) {
      return fail("陣容補不滿");
    }
    a = J(await chrome.evaluate(prepAction()));
  }
  if (a?.action === "enqueue" || a?.ok) {
    await waitFor(chrome, sleep,
      `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm" || document.querySelector('[data-map-key]')`, 60000);
    if (J(await chrome.evaluate(`return JSON.stringify({ v: document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm" });`))?.v) {
      await chrome.evaluate(prepAction());
    }
  }

  if (!(await waitFor(chrome, sleep, `document.querySelector('[data-map-key]')`, 60000)).ok) return fail("沒有地圖選擇");
  await chrome.evaluate(`document.querySelector('[data-map-key]')?.click(); return JSON.stringify({});`);
  await sleep(400);
  await chrome.evaluate(`
    const b = [...document.querySelectorAll("button")].filter((n) => !n.disabled && !n.dataset.mapKey);
    b.at(-1)?.click(); return JSON.stringify({});
  `);
  await sleep(900);
  //  戰術：挑一個字比較長的（那是戰術卡，不是導覽鍵）
  await chrome.evaluate(`
    const b = [...document.querySelectorAll("button")].filter((n) => !n.disabled && (n.innerText || "").length > 20);
    b[0]?.click(); return JSON.stringify({});
  `);
  await sleep(400);
  await chrome.evaluate(`
    const b = [...document.querySelectorAll("button")].filter((n) => !n.disabled);
    b.at(-1)?.click(); return JSON.stringify({});
  `);

  const w = await waitFor(chrome, sleep,
    `document.querySelector('[data-testid="cs-match-speed-controls"]') && document.querySelector("canvas")`, 180000);
  return w.ok ? { ok: true, ms: Date.now() - t0 } : fail("沒有進到戰鬥畫面");
}

const result = await runGate({
  name: "CS 進出資源量測",
  run: async ({ chrome, url, ck, sleep }) => {
    mkdirSync(OUT, { recursive: true });
    await chrome.send("Page.addScriptToEvaluateOnNewDocument", { source: PROBE });
    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });

    await chrome.navigate(url); await sleep(1600);
    const s = J(await chrome.evaluate(seed()));
    ck("precondition：乾淨存檔", s?.players > 0, `${s?.players ?? 0} 名`);
    await chrome.navigate(url); await sleep(2000);

    const rows = [{ cycle: 0, phase: "baseline", ...J(await chrome.evaluate(snapshot())) }];
    console.log(`\n基準（首頁）: ${JSON.stringify(rows[0])}`);

    for (let cycle = 1; cycle <= 3; cycle++) {
      console.log(`\n════ 第 ${cycle} 次 ════`);
      //  ⚠ 第 1 輪走完整進場，第 2/3 輪走 **resume 同一場** —— 這才是
      //    「離開後返回該場」。重走配對會開一場新的，量到的就不是同一件事。
      const enter = cycle === 1 ? await enterBattle(chrome, sleep) : await resumeBattle(chrome, sleep);
      ck(`第 ${cycle} 次${cycle === 1 ? "進得了 CS 對戰" : "返回同一場"}`,
        enter.ok, enter.ok ? `${(enter.ms / 1000).toFixed(1)}s` : enter.why);
      if (!enter.ok) break;
      await sleep(3000);   // 讓場景穩定幾秒再量
      const inBattle = J(await chrome.evaluate(snapshot()));
      const ms = J(await chrome.evaluate(matchState()));
      console.log(`   進場 ${(enter.ms / 1000).toFixed(1)}s ｜ ${JSON.stringify(inBattle)}`);
      console.log(`   比賽狀態 ｜ ${JSON.stringify(ms)}`);
      rows.push({ cycle, phase: "in-battle", loadMs: enter.ms, ...inBattle, match: ms });

      //  ── 離開 ──────────────────────────────────────────────────────────
      await chrome.evaluate(`
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const el = [...document.querySelectorAll("button")].filter(vis)
          .find((n) => /返回|離開|首頁/.test(n.innerText || "") || n.getAttribute("aria-label") === "返回");
        if (el) el.click();
        return JSON.stringify({ found: !!el });
      `);
      await sleep(2500);
      const afterLeave = J(await chrome.evaluate(snapshot()));
      console.log(`   離開後 ｜ ${JSON.stringify(afterLeave)}`);
      rows.push({ cycle, phase: "after-leave", ...afterLeave });
    }

    writeFileSync(new URL("cs-lifecycle-metrics.json", OUT), JSON.stringify(rows, null, 2));

    // ══ regression 判準 ══════════════════════════════════════════════════
    //  ⚠ 這一段是 gate，上面是量測。判準全部是「不累積 / 回 baseline」，
    //    不是「等於某個數字」——寫死數字會讓任何合理的資產增加都假紅。
    const base = rows.find((r) => r.phase === "baseline");
    const battles = rows.filter((r) => r.phase === "in-battle");
    const leaves = rows.filter((r) => r.phase === "after-leave");
    const mono = (xs) => xs.length >= 3 && xs.every((v, i) => i === 0 || v > xs[i - 1]);

    ck("三輪都進得去", battles.length === 3, `${battles.length} 輪`);

    //  ① 全域場景參照：離場後不得還指著舊場景（這是主要的洩漏）
    ck("① 離場後 __ESMO_FPS_SCENE__ 不留舊場景",
      leaves.every((r) => r.sceneHandle === false),
      leaves.map((r) => r.sceneHandle).join(" → "));

    //  ② 監聽回 baseline（先前 window.mouseup 會留下來）
    ck("② 離場後 window 監聽回到 baseline",
      leaves.every((r) => r.listenerTotal <= base.listenerTotal),
      `baseline ${base.listenerTotal}｜${leaves.map((r) => r.listenerTotal).join(" → ")}`);
    ck("② 離場後沒有殘留 mouseup",
      leaves.every((r) => !Object.keys(r.listeners ?? {}).some((k) => k.endsWith(":mouseup"))),
      leaves.map((r) => Object.keys(r.listeners ?? {}).join(",")).join(" ｜ "));

    //  ③ canvas 不累積
    ck("③ 離場後 canvas 不殘留", leaves.every((r) => r.canvas === 0),
      leaves.map((r) => r.canvas).join(" → "));

    //  ④ WebGL context：看**存活數**不是取得次數。取得次數本來就會逐輪 +1。
    ck("④ 對戰中存活的 WebGL context 維持 1 個",
      battles.every((r) => r.glAlive === 1), battles.map((r) => r.glAlive).join(" → "));
    ck("④ 離場後存活的 WebGL context 歸零（不會耗盡上限）",
      leaves.every((r) => r.glAlive === 0), leaves.map((r) => r.glAlive).join(" → "));

    //  ⑤ RAF：runtime 自己的迴圈要收掉（回到 baseline）
    ck("⑤ 離場後 RAF 回到 baseline",
      leaves.every((r) => r.rafLive <= base.rafLive),
      `baseline ${base.rafLive}｜${leaves.map((r) => r.rafLive).join(" → ")}`);

    //  ⑥ 卸載當下的資源快照不得單調累積
    const tear = battles.map((r) => r.lastTeardown).filter(Boolean);
    ck("⑥ 卸載後 geometries 不單調累積", !mono(tear.map((t) => t.geometries)),
      tear.map((t) => t.geometries).join(" → ") || "(無快照)");
    ck("⑥ 卸載後 textures 不單調累積", !mono(tear.map((t) => t.textures)),
      tear.map((t) => t.textures).join(" → ") || "(無快照)");
    ck("⑥ 卸載後場景已清空", tear.every((t) => t.sceneChildren === 0),
      tear.map((t) => t.sceneChildren).join(" → ") || "(無快照)");

    //  ⑦ 三輪不得越來越慢（第 2/3 輪是 resume，本來就該比首次快）
    const load = battles.map((r) => r.loadMs);
    ck("⑦ 返回不比首次進場慢", load.length === 3 && load[1] <= load[0] * 1.15 && load[2] <= load[0] * 1.15,
      load.map((m) => (m / 1000).toFixed(1) + "s").join(" → "));

    //  ⑧ MatchSession：leave → resume 不可以變成新的一場
    //  ⚠ 只驗「有資料」是不夠的，要驗**同一場**：session id／seed／地圖／人數一致。
    const ms = battles.map((r) => r.match).filter(Boolean);
    ck("⑧ 三輪都讀得到進行中的比賽", ms.length === 3 && ms.every((m) => m.hasView && m.restoreable),
      ms.map((m) => m.phase).join(" → "));
    for (const key of ["sessionId", "seed", "mapKey", "roster"]) {
      ck(`⑧ leave → resume 之後 ${key} 不變`,
        ms.length === 3 && ms.every((m) => String(m[key]) === String(ms[0][key])),
        ms.map((m) => m[key]).join(" → "));
    }

    const pageErrs = chrome.pageErrors ?? [];
    ck("⑨ 無 page-origin uncaught error", pageErrs.length === 0,
      pageErrs.slice(0, 2).join(" ¦ ") || "clean");
    const inB = rows.filter((r) => r.phase === "in-battle");
    const lv = rows.filter((r) => r.phase === "after-leave");
    console.log("\n── 摘要 ──");
    console.log(`進場耗時 : ${inB.map((r) => (r.loadMs / 1000).toFixed(1) + "s").join(" → ")}`);
    for (const k of ["canvas", "rafLive", "listenerTotal", "glAcquired", "glAlive", "heapMB", "geometries", "textures", "programs", "sceneChildren", "intervals"]) {
      console.log(`${k.padEnd(14)} 進場中 ${inB.map((r) => r[k]).join(" → ").padEnd(22)} 離開後 ${lv.map((r) => r[k]).join(" → ")}`);
    }
    console.log(`\n數據：review/cs-lifecycle/cs-lifecycle-metrics.json`);
  },
});

finishGate(result);
