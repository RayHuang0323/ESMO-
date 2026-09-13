#!/usr/bin/env node
// ============================================================================
//  CS rigged reveal 60 秒 fallback：TIMEOUT_PATH 瀏覽器實測（dev server）
//
//  執行：node tools/browser/run-gate.mjs tools/browser_check_cs_rigged_reveal_timeout.mjs --timeout 900000
//
//  用 CDP Fetch 攔住角色 GLB 請求且**永遠不放行**，模擬「rigged 資產卡死」，然後真的等過 60 秒：
//    期限前：10 名都是 loading、舊 primitive 0、rigged 0（刻意隱藏），可見性契約標為 rigged-asset-pending 不算違規
//    期限後：仍是 loading，但 primitive fallback 真的出現（10 名），不會永久 invisible
//  ⚠ 需要 dev server：讀 DEV-only 的 `__ESMO_FPS_SCENE__`／`__ESMO_FPS_VISIBILITY__`。
//  ⚠ 送進 chrome.evaluate 的字串裡不能有反引號。
// ============================================================================
import { RESOLVE_APP_MODULES } from "./browser/cdp.mjs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => { const s = String(raw).replace(/^"|"$/g, ""); try { return JSON.parse(s); } catch { return null; } };

const seed = () => `
  ${RESOLVE_APP_MODULES}
  const store = profile.useProfileStore;
  localStorage.removeItem("esmo.profile.v1");
  store.getState().startNewGame("elite");
  await new Promise((r) => setTimeout(r, 400));
  store.getState().save();
  return JSON.stringify({ players: store.getState().players.length });
`;

const waitFor = async (chrome, sleep, expr, timeoutMs, everyMs = 250) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = J(await chrome.evaluate("return JSON.stringify({ v: Boolean(" + expr + ") });"));
    if (r?.v) return true;
    await sleep(everyMs);
  }
  return false;
};
const clickText = (needle) => `
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const el = [...document.querySelectorAll("button")].filter(vis).find((n) => !n.disabled && (n.innerText || "").includes(${JSON.stringify(needle)}));
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

async function enterBattle(chrome, sleep) {
  if (!(await waitFor(chrome, sleep, `document.body.innerText.includes("CS")`, 30000))) return { ok: false, why: "首頁沒有 CS" };
  if (!J(await chrome.evaluate(clickText("CS")))?.ok) return { ok: false, why: "點不到 CS" };
  if (!(await waitFor(chrome, sleep, `document.querySelector('[data-testid="prep-primary-action"]')`, 30000))) return { ok: false, why: "沒有賽前畫面" };
  let a = J(await chrome.evaluate(prepAction()));
  if (a?.action === "blocked") {
    await chrome.evaluate(clickText("自動"));
    if (!(await waitFor(chrome, sleep, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "enqueue"`, 20000))) return { ok: false, why: "陣容補不滿" };
    a = J(await chrome.evaluate(prepAction()));
  }
  if (a?.action === "enqueue" || a?.ok) {
    await waitFor(chrome, sleep, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm" || document.querySelector('[data-map-key]')`, 60000);
    if (J(await chrome.evaluate(`return JSON.stringify({ v: document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm" });`))?.v) await chrome.evaluate(prepAction());
  }
  if (!(await waitFor(chrome, sleep, `document.querySelector('[data-map-key]')`, 60000))) return { ok: false, why: "沒有地圖選擇" };
  await chrome.evaluate(`document.querySelector('[data-map-key]')?.click(); return JSON.stringify({});`);
  await sleep(400);
  await chrome.evaluate(`const b = [...document.querySelectorAll("button")].filter((n) => !n.disabled && !n.dataset.mapKey); b.at(-1)?.click(); return JSON.stringify({});`);
  await sleep(900);
  await chrome.evaluate(`const b = [...document.querySelectorAll("button")].filter((n) => !n.disabled && (n.innerText || "").length > 20); b[0]?.click(); return JSON.stringify({});`);
  await sleep(400);
  await chrome.evaluate(`const b = [...document.querySelectorAll("button")].filter((n) => !n.disabled); b.at(-1)?.click(); return JSON.stringify({});`);
  return { ok: true };
}

const sample = () => `
  const st = window.__ESMO_FPS_SCENE__;
  if (!st || !st.players) return JSON.stringify(null);
  const ps = st.players;
  const vis = window.__ESMO_FPS_VISIBILITY__;
  const vplayers = vis && vis.players ? vis.players : [];
  return JSON.stringify({
    now: performance.now(), deadline: st.riggedRevealDeadline, players: ps.length,
    modes: ps.map((p) => (p.rigged ? p.rigged.mode : null)),
    primitiveVisible: ps.filter((p) => p.body && p.body.visible).length,
    riggedRootVisible: ps.filter((p) => p.rigged && p.rigged.root && p.rigged.root.visible).length,
    pendingReason: vplayers.filter((v) => v.visibilityReason === "rigged-asset-pending").length,
    visibilityOk: vis && vis.check ? Boolean(vis.check.ok) : null,
    aliveHidden: vis && vis.check && vis.check.aliveHidden ? vis.check.aliveHidden.length : null,
  });
`;

const result = await runGate({
  name: "CS rigged reveal 60 秒 fallback（TIMEOUT_PATH）",
  timeoutMs: 850_000,
  run: async ({ chrome, url, ck, sleep }) => {
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(url); await sleep(1600);
    const s = J(await chrome.evaluate(seed()));
    ck("precondition：乾淨存檔", s?.players > 0, `${s?.players ?? 0} 名`);
    await chrome.navigate(url); await sleep(2000);

    //  攔住角色 GLB，永遠不放行 ⇒ loadFpsCharacterAssets 一直 pending ⇒ controller 停在 "loading"。
    const stalled = [];
    chrome.on("Fetch.requestPaused", (p) => { stalled.push(p.request?.url || p.requestId); });
    await chrome.send("Fetch.enable", { patterns: [{ urlPattern: "*esmo-fps-character.glb*", requestStage: "Request" }] });

    const enter = await enterBattle(chrome, sleep);
    ck("進場流程走得通", enter.ok, enter.why ?? "");
    if (!enter.ok) return;
    const ready = await waitFor(chrome, sleep, `window.__ESMO_FPS_SCENE__ && window.__ESMO_FPS_SCENE__.mapReady && (window.__ESMO_FPS_SCENE__.players || []).length === 10 && Number.isFinite(window.__ESMO_FPS_SCENE__.riggedRevealDeadline)`, 300000, 250);
    ck("Battle 場景建好（10 名、已設定 deadline）", ready);
    if (!ready) return;
    await sleep(3000);

    const before = J(await chrome.evaluate(sample()));
    const remainingMs = Math.round(before.deadline - before.now);
    ck("precondition：角色 GLB 請求確實被攔住（模擬卡死）", stalled.length >= 1, stalled.slice(0, 1).join(" "));
    ck("期限前：10 名都停在 loading", before.modes.length === 10 && before.modes.every((m) => m === "loading"), before.modes.join(","));
    ck("期限前（NORMAL 行為）：舊 primitive 0、rigged 0 ⇒ 刻意隱藏",
      before.primitiveVisible === 0 && before.riggedRootVisible === 0, `primitive ${before.primitiveVisible}｜rigged ${before.riggedRootVisible}｜距期限 ${(remainingMs / 1000).toFixed(1)}s`);
    ck("期限前：可見性契約標為 rigged-asset-pending、不算違規",
      before.pendingReason >= 1 && before.aliveHidden === 0, `pending ${before.pendingReason}｜aliveHidden ${before.aliveHidden}｜check.ok ${before.visibilityOk}`);
    ck("deadline 大約是 map build 後 60 秒（剩餘 50–60 秒）", remainingMs > 50000 && remainingMs <= 60000, `${remainingMs}ms`);

    //  真的等過期限。
    const passed = await waitFor(chrome, sleep, `window.__ESMO_FPS_SCENE__ && performance.now() >= window.__ESMO_FPS_SCENE__.riggedRevealDeadline + 2000`, 90000, 1000);
    ck("等過 60 秒期限", passed);
    const after = J(await chrome.evaluate(sample()));
    ck("期限後：資產仍卡住（仍是 loading）", after.modes.length === 10 && after.modes.every((m) => m === "loading"), after.modes.join(","));
    ck("TIMEOUT_PATH：primitive fallback 真的出現（10 名，不會永久 invisible）", after.primitiveVisible === 10,
      `primitive ${after.primitiveVisible}｜rigged ${after.riggedRootVisible}｜過期 ${((after.now - after.deadline) / 1000).toFixed(1)}s`);
    ck("期限後：可見性不再是 pending，沒有活著卻看不見的選手", after.pendingReason === 0 && after.aliveHidden === 0,
      `pending ${after.pendingReason}｜aliveHidden ${after.aliveHidden}｜check.ok ${after.visibilityOk}`);

    try { await chrome.send("Fetch.disable", {}); } catch { /* ignore */ }
    const pageErrs = chrome.pageErrors ?? [];
    ck("無 page-origin uncaught error", pageErrs.length === 0, pageErrs.slice(0, 2).join(" ¦ ") || "clean");
  },
});

finishGate(result);
