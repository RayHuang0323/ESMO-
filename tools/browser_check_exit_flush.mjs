#!/usr/bin/env node
// ============================================================================
//  Backend B1C — 離開頁面的保底存檔（真瀏覽器）
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_exit_flush.mjs --timeout 900000`
//
//  ── 為什麼需要這一支 ─────────────────────────────────────────────────────
//  `check_save_hardening_b1c` 用的是**假的 window**：它證明了狀態機對，
//  但證明不了「真的瀏覽器發出 `visibilitychange` / `pagehide` 時我們有掛上去」。
//  那正是這個功能唯一會失效的地方——監聽沒掛上、掛在錯的物件、被 StrictMode
//  掛成兩份。所以這一支在真的 Chrome 裡用 CDP 觸發真的事件。
//
//  ⚠ `visibilityState` 是唯讀的，所以用 `Emulation.setPageScaleFactor` 那類
//    API 是騙不到它的。這裡用 **CDP 的 `Page.setWebLifecycleState`**
//    （真的把分頁切成 hidden／frozen），拿不到的話退回
//    `Object.defineProperty` 覆寫 + `dispatchEvent` —— 兩條路都會誠實標示走了哪一條。
// ============================================================================
import { RESOLVE_APP_MODULES } from "./browser/cdp.mjs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => { const s = String(raw).replace(/^"|"$/g, ""); try { return JSON.parse(s); } catch { return null; } };

const seed = () => `
  ${RESOLVE_APP_MODULES}
  const store = profile.useProfileStore;
  localStorage.removeItem("esmo.profile.v1");
  localStorage.removeItem("esmo.heroProgress.v2");
  localStorage.removeItem("esmo.season.v1");
  store.getState().startNewGame("elite");
  await new Promise((r) => setTimeout(r, 300));
  store.getState().save();
  return JSON.stringify({ players: store.getState().players.length });
`;

/** 讓 store 變 dirty **但不存檔**（模擬「動作漏了 save()」那一類情況）。 */
const makeDirty = () => `
  ${RESOLVE_APP_MODULES}
  const st = profile.useProfileStore.getState();
  const id = st.players[0].id;
  //  ⚠ 用不存檔的內部改法製造未存變更；正常動作都會自己存，測不出保底網。
  st._patchPlayerNoSave(id, (p) => ({ ...p, name: "保底存檔測試" }));
  const disk = JSON.parse(localStorage.getItem("esmo.profile.v1"));
  return JSON.stringify({
    dirty: profile.isProfileDirty(),
    inMemory: profile.useProfileStore.getState().players[0].name,
    onDisk: disk.players.find((p) => p.id === id).name,
  });
`;

const diskName = () => `
  ${RESOLVE_APP_MODULES}
  const id = profile.useProfileStore.getState().players[0].id;
  const disk = JSON.parse(localStorage.getItem("esmo.profile.v1"));
  return JSON.stringify({
    onDisk: disk.players.find((p) => p.id === id).name,
    dirty: profile.isProfileDirty(),
    bytes: localStorage.getItem("esmo.profile.v1").length,
  });
`;

const result = await runGate({
  name: "B1C 離開頁面的保底存檔（真瀏覽器）",
  run: async ({ chrome, url, ck, sleep }) => {
    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(url); await sleep(1200);
    const s = J(await chrome.evaluate(seed()));
    ck("① precondition：乾淨存檔", s.players > 0, `${s.players} 名選手`);
    await chrome.navigate(url); await sleep(1600);

    // ── ② 製造未存變更 ──────────────────────────────────────────────────
    const dirty = J(await chrome.evaluate(makeDirty()));
    ck("② 製造出未存變更（記憶體與磁碟不一致）",
      dirty.dirty === true && dirty.inMemory === "保底存檔測試" && dirty.onDisk !== "保底存檔測試",
      `記憶體=${dirty.inMemory} / 磁碟=${dirty.onDisk}`);

    // ── ③ visibilitychange → hidden ────────────────────────────────────
    //  ⚠ 先試真的 lifecycle API；不支援才退回覆寫 + dispatch。
    let how = "webLifecycleState";
    try {
      await chrome.send("Page.setWebLifecycleState", { state: "hidden" });
    } catch {
      how = "defineProperty+dispatch";
      await chrome.evaluate(`
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        window.dispatchEvent(new Event("visibilitychange"));
        document.dispatchEvent(new Event("visibilitychange"));
        return JSON.stringify({});
      `);
    }
    await sleep(900);
    let after = J(await chrome.evaluate(diskName()));
    ck(`⭐ ③ VISIBILITY_FLUSH：切到背景之後，未存變更真的落盤了（${how}）`,
      after.onDisk === "保底存檔測試", `磁碟=${after.onDisk}`);
    ck("③ 落盤之後不再是 dirty", after.dirty === false);

    // ── ④ 乾淨時不得重寫（存檔風暴）──────────────────────────────────────
    const bytesBefore = after.bytes;
    const beforeMark = J(await chrome.evaluate(`
      return JSON.stringify({ raw: localStorage.getItem("esmo.profile.v1") });
    `)).raw;
    for (let i = 0; i < 5; i++) {
      try { await chrome.send("Page.setWebLifecycleState", { state: "active" }); } catch { /* 退回路徑沒有這一步 */ }
      try { await chrome.send("Page.setWebLifecycleState", { state: "hidden" }); } catch {
        await chrome.evaluate(`window.dispatchEvent(new Event("visibilitychange")); return JSON.stringify({});`);
      }
      await sleep(200);
    }
    const afterStorm = J(await chrome.evaluate(`
      return JSON.stringify({ raw: localStorage.getItem("esmo.profile.v1") });
    `)).raw;
    ck("⭐ ④ DIRTY_SAVE_CONTROL：乾淨時連切 5 次背景也**一個 byte 都沒重寫**",
      afterStorm === beforeMark, `${bytesBefore} B，內容未變`);

    // ── ⑤ pagehide ─────────────────────────────────────────────────────
    try { await chrome.send("Page.setWebLifecycleState", { state: "active" }); } catch { /* ignore */ }
    await sleep(300);
    const dirty2 = J(await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = profile.useProfileStore.getState();
      st._patchPlayerNoSave(st.players[1].id, (p) => ({ ...p, name: "pagehide 測試" }));
      return JSON.stringify({ dirty: profile.isProfileDirty() });
    `));
    ck("⑤ 再製造一次未存變更", dirty2.dirty === true);
    await chrome.evaluate(`window.dispatchEvent(new Event("pagehide")); return JSON.stringify({});`);
    await sleep(800);
    const afterHide = J(await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const id = profile.useProfileStore.getState().players[1].id;
      const disk = JSON.parse(localStorage.getItem("esmo.profile.v1"));
      return JSON.stringify({ onDisk: disk.players.find((p) => p.id === id).name, dirty: profile.isProfileDirty() });
    `));
    ck("⭐ ⑤ PAGEHIDE_FLUSH：pagehide 也會把未存變更落盤",
      afterHide.onDisk === "pagehide 測試", `磁碟=${afterHide.onDisk}`);
    ck("⑤ 落盤之後不再是 dirty", afterHide.dirty === false);

    // ── ⑥ 監聽只掛一份（StrictMode 不得疊出兩份）────────────────────────
    const flushStats = J(await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const exitUrl = new URL("./persistence/exitFlush.js", storeUrl).href;
      const ex = await import(exitUrl);
      const h = ex.exitFlushHandle();
      return JSON.stringify({ installed: !!h && h.stats.installed, fired: h ? h.stats.fired : -1, saved: h ? h.stats.saved : -1, skipped: h ? h.stats.skipped : -1, errors: h ? h.stats.errors : -1 });
    `));
    ck("⭐ ⑥ 保底 flush 真的裝上去了（不是只在測試裡）",
      flushStats.installed === true, JSON.stringify(flushStats));
    ck("⑥ 有跳過的次數（證明 dirty 控制真的在運作）",
      flushStats.skipped > 0, `skipped=${flushStats.skipped} / saved=${flushStats.saved}`);
    ck("⑥ flush 過程沒有丟過例外", flushStats.errors === 0, `errors=${flushStats.errors}`);

    // ── ⑦ console ───────────────────────────────────────────────────────
    const errs = (chrome.pageErrors ?? []);
    ck("⑦ 無 page-origin uncaught error", errs.length === 0, errs.slice(0, 3).join(" ¦ ") || "clean");
  },
});

finishGate(result);
