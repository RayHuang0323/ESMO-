#!/usr/bin/env node
// ============================================================================
//  Player Challenge Slice 2 — 瀏覽器 smoke（桌機 1366 ＋ 手機 390）
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_player_challenge_slice2.mjs --timeout 900000`
//
//  ── 這支要證明什麼 ───────────────────────────────────────────────────────
//  Node verifier 已經證明**契約與資料**是對的（`check_player_challenge_slice2.mjs`）。
//  這一支要證明**玩家真的按得到**：入口在、按鈕會動、模擬真的跑、
//  結果看得到、**重整之後那一場還在**。
//
//  ⚠ 全程走**真實 UI 點擊**，不繞路：入口要從首頁點得到，
//    否則「功能做完了但玩家找不到」會被驗成綠的——V7B 踩過那個坑。
//  ⚠ 只有「發布防守陣容」那一步允許用 store（下拉選單的 change 事件
//    在 CDP 裡不穩），其餘一律點擊。
// ============================================================================
import { RESOLVE_APP_MODULES } from "./browser/cdp.mjs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));

/** 乾淨存檔。⚠ 不預先建立任何挑戰資料——流程要從零走完。 */
const seed = () => `
  ${RESOLVE_APP_MODULES}
  const store = profile.useProfileStore;
  localStorage.removeItem("esmo.profile.v1");
  store.getState().startNewGame("elite");
  await new Promise((r) => setTimeout(r, 300));
  store.getState().save();
  return JSON.stringify({ players: store.getState().players.length, day: store.getState().meta.days });
`;

/** 生涯狀態指紋（不含 challenge —— 那一格本來就該變）。 */
const CAREER_FP = `
  const s = profile.useProfileStore.getState();
  const fp = JSON.stringify({
    players: s.players, meta: s.meta, lineup: s.lineup, team: s.team,
    competition: s.competition, retention: s.retention, clubMastery: s.clubMastery,
    processedMatchTransactions: s.processedMatchTransactions,
  });
`;

/**
 * 點一個看得見的元素（用 testid），回報有沒有點到。
 *
 * ⚠ 選擇器一律走 `JSON.stringify` 注入，**不要**直接插進引號裡：
 *   `[data-testid="x"]` 自己就含雙引號，插進 `"…${sel}…"` 會把字串提早結束，
 *   錯誤訊息是 `SyntaxError: Unexpected identifier` ——看起來完全不像選擇器問題。
 */
const clickBy = (sel) => `
  const sel = ${JSON.stringify(sel)};
  const el = document.querySelector(sel);
  if (!el) return JSON.stringify({ ok: false, why: "找不到 " + sel });
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return JSON.stringify({ ok: false, why: "元素不可見" });
  el.click();
  await new Promise((done) => setTimeout(done, 420));
  return JSON.stringify({ ok: true, w: Math.round(r.width), h: Math.round(r.height) });
`;

/** 用文字找按鈕（首頁入口沒有 testid）。 */
const clickByText = (text) => `
  const els = [...document.querySelectorAll('button,[role="button"],a')];
  const el = els.find((e) => (e.innerText || "").trim().includes(${JSON.stringify(text)}));
  if (!el) return JSON.stringify({ ok: false, why: "找不到含「${text}」的按鈕" });
  const r = el.getBoundingClientRect();
  el.click();
  await new Promise((done) => setTimeout(done, 450));
  return JSON.stringify({ ok: true, w: Math.round(r.width), h: Math.round(r.height) });
`;

const readScreen = () => `
  const q = (s) => document.querySelector(s);
  const txt = (s) => (q(s)?.innerText || "").trim();
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none"; };
  //  ⚠ 觸控尺寸只算**本頁自己的**控制項。ManageFrame 的返回鈕是共用外框
  //    （既有 40x40），不在本輪 scope —— 量出來只當觀察值回報，
  //    不列入 pass/fail，才不會把別人的既有問題當成本輪的回歸。
  //  ⚠ 本字串是樣板字串：註解裡**不得出現反引號**，會提早結束字串（既有教訓）。
  const own = [...document.querySelectorAll('[data-testid^="challenge-"] button, [data-testid^="challenge-"] select, button[data-testid^="challenge-"], select[data-testid^="challenge-"]')];
  const small = own.filter(vis).filter((el) => {
    const r = el.getBoundingClientRect(); return r.height < 44;
  }).map((el) => (el.innerText || el.tagName).trim().slice(0, 14));
  const frameSmall = [...document.querySelectorAll("button,select")].filter(vis).filter((el) => {
    const r = el.getBoundingClientRect(); return r.height < 44;
  }).length;
  return JSON.stringify({
    onScreen: !!q('[data-testid="challenge-tier-banner"]'),
    tierName: txt('[data-testid="challenge-tier-name"]'),
    careerSafe: txt('[data-testid="challenge-career-safe"]'),
    hasDefense: !!q('[data-testid="challenge-defense-card"]'),
    publishedAt: txt('[data-testid="challenge-defense-published-at"]'),
    lineup: txt('[data-testid="challenge-defense-lineup"]'),
    tactic: txt('[data-testid="challenge-defense-tactic"]'),
    disclaimer: txt('[data-testid="challenge-fixture-disclaimer"]'),
    authority: txt('[data-testid="challenge-authority-note"]'),
    outcome: txt('[data-testid="challenge-outcome"]'),
    score: txt('[data-testid="challenge-score"]'),
    verifyText: txt('[data-testid="challenge-verify-result"]'),
    historyCount: document.querySelectorAll('[data-testid^="challenge-history-chal:"]').length,
    throttleNote: txt('[data-testid="challenge-throttle-note"]'),
    small, smallCount: small.length, frameSmall,
    running: !!q('[data-testid="challenge-running"]'),
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  });
`;

/**
 * 輪詢直到條件成立。
 *
 * ⚠ 為什麼不用固定 sleep：模擬是同步的、佔住主執行緒好幾秒，
 *   而瀏覽器又比 Node 慢。固定 sleep 只會變成「機器夠快才會綠」的測試——
 *   慢的時候紅，而紅的原因看起來像功能壞了。
 */
async function waitFor(chrome, sleep, script, done, timeoutMs) {
  const t0 = Date.now();
  let value = null;
  while (Date.now() - t0 < timeoutMs) {
    value = J(await chrome.evaluate(script()));
    if (done(value)) return { ok: true, value, ms: Date.now() - t0 };
    await sleep(1000);
  }
  return { ok: false, value, ms: Date.now() - t0 };
}

const result = await runGate({
  name: "Player Challenge Slice 2（桌機 ＋ 手機）",
  run: async ({ chrome, url, ck, sleep }) => {
    for (const [label, width, height, mobile] of [["桌機 1366px", 1366, 900, false], ["手機 390px", 390, 844, true]]) {
      console.log(`\n════ ${label} ════`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      await chrome.navigate(url); await sleep(1100);

      const s = J(await chrome.evaluate(seed()));
      ck(`${label}｜precondition：乾淨存檔已建立`, s.players > 0, `${s.players} 名選手 / 第 ${s.day} 天`);
      await chrome.navigate(url); await sleep(1300);

      //  ── ① 玩家真的點得到入口 ──────────────────────────────────────────
      if (mobile) {
        const more = J(await chrome.evaluate(clickByText("更多")));
        ck(`${label}｜① 手機底部「更多」點得到`, more.ok, more.why ?? "");
      }
      const entry = J(await chrome.evaluate(clickByText("玩家挑戰")));
      ck(`${label}｜① 首頁點得到「玩家挑戰」入口`, entry.ok, entry.why ?? `${entry.w}×${entry.h}`);

      let v = J(await chrome.evaluate(readScreen()));
      ck(`${label}｜① 進到玩家挑戰畫面`, v.onScreen === true);
      ck(`${label}｜① 層級名稱正確`, v.tierName === "玩家挑戰", v.tierName);

      //  ── ② 誠實標示 ────────────────────────────────────────────────────
      for (const t of ["不增加生涯成長", "不消耗選手體力", "不推進生涯日期", "不影響正式賽季", "沒有排位分數"]) {
        ck(`${label}｜② 畫面上看得到「${t}」`, v.careerSafe.includes(t));
      }
      ck(`${label}｜② 明說對手不是其他玩家`, /不是其他玩家的戰隊/.test(v.disclaimer));
      ck(`${label}｜② 明說對手不會即時反應（不假裝真人在線）`, /不會即時反應/.test(v.disclaimer));
      ck(`${label}｜② 明說目前沒有防作弊機制`, /還沒有防作弊機制/.test(v.authority));

      //  ── ③ 發布防守陣容 ────────────────────────────────────────────────
      const pub = J(await chrome.evaluate(clickBy('[data-testid="challenge-publish-btn"]')));
      ck(`${label}｜③ 發布按鈕點得到`, pub.ok, pub.why ?? `${pub.w}×${pub.h}`);
      v = J(await chrome.evaluate(readScreen()));
      ck(`${label}｜③ 出現防守陣容卡`, v.hasDefense === true);
      ck(`${label}｜③ 顯示發布時間`, /發布於/.test(v.publishedAt), v.publishedAt.slice(0, 40));
      ck(`${label}｜③ 顯示 lineup 摘要（五個席位）`,
        ["b1", "b2", "b3", "b4", "b5"].every((s2) => v.lineup.includes(s2)));
      ck(`${label}｜③ 顯示熟練等級`, /熟練 Lv\./.test(v.lineup));
      ck(`${label}｜③ 顯示戰術摘要`, /預存戰術/.test(v.tactic), v.tactic.slice(0, 30));
      ck(`${label}｜③ 節流提示出現（同一生涯日不得再發）`, /已經更新過/.test(v.throttleNote));

      //  ── ④ 發起挑戰並跑真的模擬 ────────────────────────────────────────
      const fpBefore = J(await chrome.evaluate(`${RESOLVE_APP_MODULES}${CAREER_FP} return JSON.stringify({ fp });`)).fp;

      const start = J(await chrome.evaluate(clickBy('[data-testid="challenge-start-drill_balanced"]')));
      ck(`${label}｜④ 發起挑戰按鈕點得到`, start.ok, start.why ?? "");
      //  ⚠ 模擬是**同步**的、會佔住主執行緒好幾秒，而且瀏覽器比 Node 慢。
      //    固定 sleep 會讓這條變成「機器夠快才會綠」的測試 ⇒ 輪詢到出現結果為止。
      const waited = await waitFor(chrome, sleep, readScreen, (x) => !!x.outcome, 90000);
      ck(`${label}｜④ 模擬在時限內完成`, waited.ok, `${(waited.ms / 1000).toFixed(1)}s`);
      v = waited.value;
      ck(`${label}｜④ 出現挑戰結果`, /挑戰成功|挑戰失敗|未分勝負/.test(v.outcome), v.outcome);
      ck(`${label}｜④ 結果有比分與時長`, /擊殺 \d+ : \d+/.test(v.score), v.score);

      //  ── ⑤ 重播驗證 ────────────────────────────────────────────────────
      const ver = J(await chrome.evaluate(clickBy('[data-testid="challenge-verify-btn"]')));
      ck(`${label}｜⑤ 重播驗證按鈕點得到`, ver.ok, ver.why ?? "");
      const vw = await waitFor(chrome, sleep, readScreen, (x) => !!x.verifyText, 90000);
      v = vw.value;
      ck(`${label}｜⑤ 重播結果與當初一致`, /完全一致/.test(v.verifyText), v.verifyText || "(逾時)");

      //  ── ⑥ 生涯零變動 ──────────────────────────────────────────────────
      const fpAfter = J(await chrome.evaluate(`${RESOLVE_APP_MODULES}${CAREER_FP} return JSON.stringify({ fp });`)).fp;
      ck(`${label}｜⑥ 跑完一整場之後生涯狀態逐值一致`, fpAfter === fpBefore);

      //  ── ⑦ reload 之後那一場還在 ───────────────────────────────────────
      await chrome.navigate(url); await sleep(1300);
      if (mobile) await chrome.evaluate(clickByText("更多"));
      await chrome.evaluate(clickByText("玩家挑戰"));
      await sleep(500);
      v = J(await chrome.evaluate(readScreen()));
      ck(`${label}｜⑦ reload 後防守陣容還在`, v.hasDefense === true);
      ck(`${label}｜⑦ reload 後挑戰紀錄還在`, v.historyCount >= 1, `${v.historyCount} 筆`);
      const open = J(await chrome.evaluate(`
        const el = document.querySelector('[data-testid^="challenge-history-chal:"]');
        if (!el) return JSON.stringify({ ok: false, why: "沒有紀錄可點" });
        el.click(); await new Promise((done) => setTimeout(done, 450));
        return JSON.stringify({ ok: true });
      `));
      ck(`${label}｜⑦ reload 後點得開那一場`, open.ok, open.why ?? "");
      v = J(await chrome.evaluate(readScreen()));
      ck(`${label}｜⑦ reload 後看得到同一場的結果`, /挑戰成功|挑戰失敗|未分勝負/.test(v.outcome), v.outcome);

      //  ── ⑧ 版面 ────────────────────────────────────────────────────────
      ck(`${label}｜⑧ 不造成水平溢出`, v.overflow === false);
      if (mobile) {
        ck(`${label}｜⑧ 本頁自己的互動元素都 ≥44px`, v.smallCount === 0, v.small.join(",") || "clean");
        //  觀察值：整頁（含 ManageFrame 既有的 40×40 返回鈕）。不列 pass/fail。
        console.log(`   ⓘ 整頁 <44px 的控制項：${v.frameSmall} 個（含共用外框的返回鈕，不在本輪 scope）`);
      }

      const errs = (chrome.consoleLines ?? []).filter((l) => /^\[error\]/i.test(l));
      const pageErrs = chrome.pageErrors ?? [];
      ck(`${label}｜⑧ console / page 錯誤 = 0`, errs.length === 0 && pageErrs.length === 0,
        [...errs, ...pageErrs].slice(0, 3).join(" ¦ ") || "clean");
    }
  },
});

finishGate(result);
