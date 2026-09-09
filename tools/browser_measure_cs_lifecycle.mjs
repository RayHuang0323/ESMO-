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
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, ...r) {
    if (String(t).includes("webgl")) P.glContexts++;
    return gc.call(this, t, ...r);
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
    glContexts: P.glContexts ?? null,
    sceneHandle: !!st,
    geometries: info ? info.memory.geometries : null,
    textures: info ? info.memory.textures : null,
    programs: info && info.programs ? info.programs.length : null,
    drawCalls: info ? info.render.calls : null,
    sceneChildren: st && st.scene ? st.scene.children.length : null,
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
      const enter = await enterBattle(chrome, sleep);
      ck(`第 ${cycle} 次進得了 CS 對戰`, enter.ok, enter.ok ? `${(enter.ms / 1000).toFixed(1)}s` : enter.why);
      if (!enter.ok) break;
      await sleep(3000);   // 讓場景穩定幾秒再量
      const inBattle = J(await chrome.evaluate(snapshot()));
      console.log(`   進場 ${(enter.ms / 1000).toFixed(1)}s ｜ ${JSON.stringify(inBattle)}`);
      rows.push({ cycle, phase: "in-battle", loadMs: enter.ms, ...inBattle });

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
    const inB = rows.filter((r) => r.phase === "in-battle");
    const lv = rows.filter((r) => r.phase === "after-leave");
    console.log("\n── 摘要 ──");
    console.log(`進場耗時 : ${inB.map((r) => (r.loadMs / 1000).toFixed(1) + "s").join(" → ")}`);
    for (const k of ["canvas", "rafLive", "listenerTotal", "glContexts", "heapMB", "geometries", "textures", "programs", "sceneChildren", "intervals"]) {
      console.log(`${k.padEnd(14)} 進場中 ${inB.map((r) => r[k]).join(" → ").padEnd(22)} 離開後 ${lv.map((r) => r[k]).join(" → ")}`);
    }
    console.log(`\n數據：review/cs-lifecycle/cs-lifecycle-metrics.json`);
  },
});

finishGate(result);
