#!/usr/bin/env node
// ============================================================================
//  Player Challenge Slice 8 — 瀏覽器 smoke（桌機 1366 ＋ 手機 390）
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_player_challenge_slice8.mjs --timeout 900000`
//
//  Node verifier 證明「來源邊界在契約層是對的」；這一支證明**玩家看得到**：
//    · 看板上有一顆「重新整理」，而且是手指按得到的大小
//    · 來源回空清單 ⇒ 畫面說「目前沒有可挑戰的對手」（不是白畫面）
//    · 來源壞掉   ⇒ 畫面說「暫時無法取得對手」＋一顆重新整理（整頁不 crash）
//    · 換回正常來源 ⇒ 候選回來
//    · 主畫面上**看不到**快照／provider 這些工程詞
//    · 390px 不橫向溢出
//
//  ⚠ 換 provider 是**在頁面裡**做的（`setOpponentProvider`），因為那正是
//    未來接真伺服器的做法。要拿到與 App 同一個模組實例，URL 必須從
//    profileStore 的 URL 推導，不可以自己猜路徑。
//
//  ⚠ 三個既有的坑，這裡都避開：
//    · 樣板字串裡**不得出現反引號**（會提早結束字串）
//    · 選擇器一律 `JSON.stringify` 注入（testid 自己含雙引號）
//    · **不用固定 sleep 等載入**（會變成「機器夠快才會綠」）⇒ 輪詢
// ============================================================================
import { RESOLVE_APP_MODULES } from "./browser/cdp.mjs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));

const seed = () => `
  ${RESOLVE_APP_MODULES}
  const store = profile.useProfileStore;
  localStorage.removeItem("esmo.profile.v1");
  localStorage.removeItem("esmo.heroProgress.v2");
  store.getState().startNewGame("elite");
  await new Promise((r) => setTimeout(r, 300));
  store.getState().save();
  return JSON.stringify({ players: store.getState().players.length });
`;

/**
 * 在頁面裡換掉對手來源。
 *
 * `mode`：
 *   "empty"   來源回空清單
 *   "throw"   來源掛掉
 *   "reset"   換回正式站預設（fixture）
 */
const swapProvider = (mode) => `
  ${RESOLVE_APP_MODULES}
  //  ⚠ 從 store 自己的 URL 推導，確保拿到 App 用的**同一個**模組實例。
  const dirUrl = new URL("./challenge/opponentDirectory.js", storeUrl).href;
  const provUrl = new URL("./challenge/opponentProvider.js", storeUrl).href;
  const dir = await import(dirUrl);
  const prov = await import(provUrl);
  const mode = ${JSON.stringify(mode)};
  if (mode === "reset") { dir.resetOpponentProvider(); }
  else {
    dir.setOpponentProvider(prov.createOpponentProvider({
      providerId: "gate-" + mode,
      source: prov.OPPONENT_SOURCE.server,
      list: () => {
        if (mode === "throw") throw new Error("gate simulated source failure");
        return [];
      },
    }));
  }
  return JSON.stringify({ ok: true, providerId: dir.activeOpponentProvider().providerId });
`;

const clickBy = (sel) => `
  const sel = ${JSON.stringify(sel)};
  const el = document.querySelector(sel);
  if (!el) return JSON.stringify({ ok: false, why: "找不到 " + sel });
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return JSON.stringify({ ok: false, why: "元素不可見" });
  el.scrollIntoView({ block: "center" });
  el.click();
  await new Promise((done) => setTimeout(done, 420));
  return JSON.stringify({ ok: true, w: Math.round(r.width), h: Math.round(r.height) });
`;

const clickByText = (text) => `
  const els = [...document.querySelectorAll('button,[role="button"],a')];
  const el = els.find((e) => (e.innerText || "").trim().includes(${JSON.stringify(text)}));
  if (!el) return JSON.stringify({ ok: false, why: "找不到含該文字的按鈕" });
  el.scrollIntoView({ block: "center" });
  el.click();
  await new Promise((done) => setTimeout(done, 450));
  return JSON.stringify({ ok: true });
`;

const readScreen = () => `
  const q = (s) => document.querySelector(s);
  const txt = (s) => (q(s)?.innerText || "").trim();
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none"; };
  const own = [...document.querySelectorAll('[data-testid^="challenge-"] button, button[data-testid^="challenge-"], [data-testid^="challenge-"] select, select[data-testid^="challenge-"]')];
  const small = own.filter(vis).filter((el) => el.getBoundingClientRect().height < 44)
    .map((el) => (el.innerText || el.tagName).trim().slice(0, 14));
  const refresh = q('[data-testid="challenge-refresh"]');
  const state = q('[data-testid="challenge-source-state"]');
  //  ⚠ 只看**玩家真的讀得到的字**：整頁 innerText，不是原始碼。
  const pageText = (document.body.innerText || "");
  const banned = ["snapshot", "Snapshot", "provider", "Provider", "fixture", "快照", "Directory"]
    .filter((w) => pageText.includes(w));
  return JSON.stringify({
    onScreen: !!q('[data-testid="challenge-tier-banner"]'),
    cardCount: document.querySelectorAll('[data-testid^="challenge-candidate-"]').length,
    countText: txt('[data-testid="challenge-board-count"]'),
    refreshVisible: vis(refresh),
    refreshH: refresh ? Math.round(refresh.getBoundingClientRect().height) : 0,
    refreshText: (refresh?.innerText || "").trim(),
    sourceStatus: state ? state.getAttribute("data-status") : null,
    sourceMessage: txt('[data-testid="challenge-source-message"]'),
    retryVisible: vis(q('[data-testid="challenge-source-retry"]')),
    banned,
    small, smallCount: small.length,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  });
`;

async function waitFor(chrome, sleep, script, done, timeoutMs) {
  const t0 = Date.now();
  let value = null;
  while (Date.now() - t0 < timeoutMs) {
    value = J(await chrome.evaluate(script()));
    if (done(value)) return { ok: true, value, ms: Date.now() - t0 };
    await sleep(600);
  }
  return { ok: false, value, ms: Date.now() - t0 };
}

const result = await runGate({
  name: "Player Challenge Slice 8（桌機 ＋ 手機）",
  run: async ({ chrome, url, ck, sleep }) => {
    for (const [L, width, height, mobile] of [["桌機 1366px", 1366, 900, false], ["手機 390px", 390, 844, true]]) {
      console.log(`\n════ ${L} ════`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      await chrome.navigate(url); await sleep(1100);
      const s = J(await chrome.evaluate(seed()));
      ck(`${L}｜precondition：乾淨存檔`, s.players > 0, `${s.players} 名選手`);
      await chrome.navigate(url); await sleep(1300);

      if (mobile) await chrome.evaluate(clickByText("更多"));
      ck(`${L}｜① 首頁點得到入口`, J(await chrome.evaluate(clickByText("玩家挑戰"))).ok);
      const ready = await waitFor(chrome, sleep, readScreen, (v) => v.onScreen && v.cardCount > 0, 20000);
      ck(`${L}｜① 進到玩家挑戰畫面且有候選`, ready.ok, `${ready.value?.cardCount} 張卡`);
      const v0 = ready.value;

      // ── ② 重新整理：看得到、按得到 ─────────────────────────────────────
      ck(`${L}｜② 看板上有「重新整理」`, v0.refreshVisible === true && v0.refreshText === "重新整理", v0.refreshText);
      ck(`${L}｜② 它是手指按得到的大小（≥44px）`, v0.refreshH >= 44, `${v0.refreshH}px`);
      ck(`${L}｜② 正常狀態下**不**多一句廢話`, v0.sourceStatus === null && v0.sourceMessage === "");
      ck(`${L}｜② 主畫面沒有工程詞`, v0.banned.length === 0, v0.banned.join(","));

      // ── ③ 來源回空清單 ⇒ empty ────────────────────────────────────────
      ck(`${L}｜③ 換成「回空清單」的來源`, J(await chrome.evaluate(swapProvider("empty"))).ok);
      await chrome.evaluate(clickBy('[data-testid="challenge-refresh"]'));
      const emptyState = await waitFor(chrome, sleep, readScreen, (v) => v.sourceStatus === "empty", 15000);
      ck(`${L}｜③ EMPTY_STATE：狀態切到 empty`, emptyState.ok, emptyState.value?.sourceStatus ?? "(無)");
      ck(`${L}｜③ 文案是「目前沒有可挑戰的對手」`,
        emptyState.value?.sourceMessage === "目前沒有可挑戰的對手", emptyState.value?.sourceMessage);
      ck(`${L}｜③ 沒有候選卡，但畫面還在（不是白畫面）`,
        emptyState.value?.cardCount === 0 && emptyState.value?.onScreen === true);
      ck(`${L}｜③ 空狀態也給得到重新整理`, emptyState.value?.retryVisible === true);
      ck(`${L}｜③ 空狀態沒有工程詞`, (emptyState.value?.banned ?? []).length === 0, (emptyState.value?.banned ?? []).join(","));

      // ── ④ 來源壞掉 ⇒ error，整頁不 crash ──────────────────────────────
      ck(`${L}｜④ 換成「會壞掉」的來源`, J(await chrome.evaluate(swapProvider("throw"))).ok);
      await chrome.evaluate(clickBy('[data-testid="challenge-source-retry"]'));
      const errState = await waitFor(chrome, sleep, readScreen, (v) => v.sourceStatus === "error", 15000);
      ck(`${L}｜④ ERROR_STATE：狀態切到 error`, errState.ok, errState.value?.sourceStatus ?? "(無)");
      ck(`${L}｜④ 文案是「暫時無法取得對手」`,
        errState.value?.sourceMessage === "暫時無法取得對手", errState.value?.sourceMessage);
      ck(`${L}｜⭐ ④ 整頁沒有 crash（挑戰畫面還在）`, errState.value?.onScreen === true);
      ck(`${L}｜④ 錯誤旁邊有重新整理`, errState.value?.retryVisible === true);
      ck(`${L}｜④ 不把技術原因寫給玩家`,
        !/Error|failed|undefined|null|gate simulated/.test(errState.value?.sourceMessage ?? ""),
        errState.value?.sourceMessage);
      ck(`${L}｜④ 錯誤狀態沒有工程詞`, (errState.value?.banned ?? []).length === 0, (errState.value?.banned ?? []).join(","));

      // ── ⑤ 換回正常來源 ⇒ 候選回來 ─────────────────────────────────────
      ck(`${L}｜⑤ 換回正式站預設來源`, J(await chrome.evaluate(swapProvider("reset"))).ok);
      await chrome.evaluate(clickBy('[data-testid="challenge-source-retry"]'));
      const back = await waitFor(chrome, sleep, readScreen, (v) => v.cardCount > 0 && v.sourceStatus === null, 15000);
      ck(`${L}｜⭐ ⑤ 候選回來了，而且狀態列自己收掉`, back.ok, `${back.value?.cardCount} 張卡`);
      ck(`${L}｜⑤ 候選數與換來源前一致`, back.value?.cardCount === v0.cardCount,
        `${back.value?.cardCount} vs ${v0.cardCount}`);

      // ── ⑥ 版面 ───────────────────────────────────────────────────────
      ck(`${L}｜⑥ 所有互動元素 ≥44px`, back.value?.smallCount === 0, (back.value?.small ?? []).join(","));
      ck(`${L}｜⑥ 不橫向溢出`, back.value?.overflow === false);
    }
  },
});

finishGate(result);
