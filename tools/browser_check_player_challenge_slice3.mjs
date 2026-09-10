#!/usr/bin/env node
// ============================================================================
//  Player Challenge Slice 3 — 瀏覽器 smoke（桌機 1366 ＋ 手機 390）
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_player_challenge_slice3.mjs --timeout 900000`
//
//  Node verifier 證明資料與契約對；這一支證明**玩家真的看得懂、按得到**：
//  看板列得出候選、卡片讀得到對手特徵、詳情展得開、挑戰跑得完、
//  賽後看得到「宣告 vs 實際」、再試一次會標示不計入紀錄、重整後還在。
//
//  ⚠ 兩個既有的坑，這裡都避開：
//    · 樣板字串裡**不得出現反引號**（會提早結束字串）
//    · 選擇器一律 `JSON.stringify` 注入（testid 自己含雙引號）
//    · **不用固定 sleep 等模擬**（會變成「機器夠快才會綠」）⇒ 輪詢
//
//  ── 2026-09-10 維護：補上 Slice 6 的手動選角這一段 ────────────────────────
//  這支從 `c99bfed` 之後就沒動過，而選角路由是 `980917f`（Slice 6）才進來的。
//  「發起挑戰」現在會**先把玩家帶到 Ban/Pick 頁**，所以原本「按下去就等結果」
//  的寫法永遠等不到 `challenge-outcome` ⇒ ⑤ 之後 12 條全部串著紅（73/97）。
//  ⚠ 修法只有一種是誠實的：**把選角那一段走完**。
//    刻意**沒有**放寬 90 秒的等待上限——它不是紅在慢，是紅在流程少一段。
//    ⑤⑥⑦⑧⑨ 的 Battle / Result / Replay / reload 斷言**一條都沒有刪**。
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
  return JSON.stringify({ players: store.getState().players.length, day: store.getState().meta.days });
`;

const CAREER_FP = `
  const s = profile.useProfileStore.getState();
  const fp = JSON.stringify({
    players: s.players, meta: s.meta, lineup: s.lineup, team: s.team,
    competition: s.competition, retention: s.retention, clubMastery: s.clubMastery,
    processedMatchTransactions: s.processedMatchTransactions,
  });
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
  el.click();
  await new Promise((done) => setTimeout(done, 450));
  return JSON.stringify({ ok: true });
`;

const readScreen = () => `
  const q = (s) => document.querySelector(s);
  const txt = (s) => (q(s)?.innerText || "").trim();
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none"; };
  //  ⚠ 只算本頁自己的控制項；共用外框（ManageFrame）的返回鈕是既有內容。
  const own = [...document.querySelectorAll('[data-testid^="challenge-"] button, [data-testid^="challenge-"] select, button[data-testid^="challenge-"], select[data-testid^="challenge-"]')];
  const small = own.filter(vis).filter((el) => el.getBoundingClientRect().height < 44)
    .map((el) => (el.innerText || el.tagName).trim().slice(0, 14));
  const cards = [...document.querySelectorAll('[data-testid^="challenge-candidate-"]')].map((el) => ({
    key: el.getAttribute("data-testid").replace("challenge-candidate-", ""),
    slot: el.getAttribute("data-slot"),
    text: (el.innerText || "").trim(),
  }));
  return JSON.stringify({
    onScreen: !!q('[data-testid="challenge-tier-banner"]'),
    tierName: txt('[data-testid="challenge-tier-name"]'),
    careerSafe: txt('[data-testid="challenge-career-safe"]'),
    boardCount: txt('[data-testid="challenge-board-count"]'),
    cards,
    coldStart: txt('[data-testid="challenge-coldstart-note"]'),
    disclaimer: txt('[data-testid="challenge-fixture-disclaimer"]'),
    authority: txt('[data-testid="challenge-authority-note"]'),
    entryNote: txt('[data-testid="challenge-entry-note"]'),
    detailOpen: !!q('[data-testid^="challenge-detail-body-"]'),
    detailText: txt('[data-testid^="challenge-detail-body-"]'),
    outcome: txt('[data-testid="challenge-outcome"]'),
    score: txt('[data-testid="challenge-score"]'),
    evidenceMine: txt('[data-testid="challenge-evidence-mine"]'),
    evidenceOpp: txt('[data-testid="challenge-evidence-opponent"]'),
    retryTag: txt('[data-testid="challenge-result-retry"]'),
    verifyText: txt('[data-testid="challenge-verify-result"]'),
    historyCount: document.querySelectorAll('[data-testid^="challenge-history-chal:"]').length,
    hasDefense: !!q('[data-testid="challenge-defense-card"]'),
    small, smallCount: small.length,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  });
`;

/**
 * 走完 Slice 6 的手動 Ban/Pick（3 ban + 5 pick），然後按確認。
 *
 * ⚠ 進度**從存檔讀**（`challenge.pendingDraft`），不數畫面上的格子：
 *   畫面可能還沒重繪，數錯就會少點一手然後卡在選角頁。
 * ⚠ 只點**視窗內看得到**的那一張；看不到就把英雄池往下捲——
 *   直接 click 一個在容器外的節點，在手機寬度下會點不到。
 */
async function completeManualDraft(chrome, sleep) {
  const seen = await waitFor(chrome, sleep,
    () => `return JSON.stringify({ v: !!document.querySelector('[data-testid="hero-grid-scroll"]') });`,
    (x) => x.v, 25000);
  //  ⚠ 沒有選角頁**不算失敗**：沒有 onDraft 的嵌入用法仍然是直接開打，
  //    那條路徑也還合法（見 PlayerChallengeScreen 的 `challenge`）。
  if (!seen.ok) return { ok: true, skipped: true };

  for (let i = 0; i < 20; i++) {
    const st = J(await chrome.evaluate(`
      const raw = localStorage.getItem("esmo.profile.v1");
      const pd = raw ? (JSON.parse(raw).challenge || {}).pendingDraft || null : null;
      if (!pd) return JSON.stringify({ done: true });
      const b = pd.actions.filter((a) => a.act === "ban").length;
      const p = pd.actions.filter((a) => a.act === "pick").length;
      return JSON.stringify({ done: b >= 3 && p >= 5, b, p });
    `));
    if (st.done) break;
    await chrome.evaluate(`
      const el = document.querySelector('[data-testid="hero-grid-scroll"]');
      if (!el) return JSON.stringify({});
      const r = el.getBoundingClientRect();
      const b = [...el.querySelectorAll('[data-testid="hero-choose"]')].find((n) => {
        const q = n.getBoundingClientRect();
        return q.top >= r.top && q.bottom <= r.bottom && q.top >= 0 && q.bottom <= innerHeight;
      });
      if (!b) { el.scrollTop += 160; return JSON.stringify({}); }
      b.click(); return JSON.stringify({});
    `);
    await sleep(420);
  }
  const final = J(await chrome.evaluate(`
    const raw = localStorage.getItem("esmo.profile.v1");
    const pd = raw ? (JSON.parse(raw).challenge || {}).pendingDraft || null : null;
    if (!pd) return JSON.stringify({ b: 3, p: 5 });
    return JSON.stringify({
      b: pd.actions.filter((a) => a.act === "ban").length,
      p: pd.actions.filter((a) => a.act === "pick").length,
    });
  `));
  await chrome.evaluate(`
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    [...document.querySelectorAll("button")].filter(vis)
      .find((n) => !n.disabled && /確認|開始/.test(n.innerText || ""))?.click();
    return JSON.stringify({});
  `);
  await sleep(600);
  return { ok: final.b >= 3 && final.p >= 5, skipped: false, bans: final.b, picks: final.p };
}

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
  name: "Player Challenge Slice 3（桌機 ＋ 手機）",
  run: async ({ chrome, url, ck, sleep }) => {
    for (const [labelText, width, height, mobile] of [["桌機 1366px", 1366, 900, false], ["手機 390px", 390, 844, true]]) {
      console.log(`\n════ ${labelText} ════`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      await chrome.navigate(url); await sleep(1100);
      const s = J(await chrome.evaluate(seed()));
      ck(`${labelText}｜precondition：乾淨存檔`, s.players > 0, `${s.players} 名選手`);
      await chrome.navigate(url); await sleep(1300);

      if (mobile) await chrome.evaluate(clickByText("更多"));
      const entry = J(await chrome.evaluate(clickByText("玩家挑戰")));
      ck(`${labelText}｜① 首頁點得到入口`, entry.ok, entry.why ?? "");

      let v = J(await chrome.evaluate(readScreen()));
      ck(`${labelText}｜① 進到玩家挑戰畫面`, v.onScreen === true);
      ck(`${labelText}｜① 標示為玩家挑戰`, v.tierName === "玩家挑戰", v.tierName);

      // ── ② 看板 ───────────────────────────────────────────────────────
      ck(`${labelText}｜② 看板列出 4～5 個候選`, v.cards.length >= 4 && v.cards.length <= 5, `${v.cards.length} 個`);
      ck(`${labelText}｜② 候選數有顯示`, /\d+ 個候選/.test(v.boardCount), v.boardCount);
      ck(`${labelText}｜② 每張卡都有候選位標籤`, v.cards.every((c) => !!c.slot), v.cards.map((c) => `${c.key}:${c.slot}`).join(" "));
      ck(`${labelText}｜② 至少有一個「可以先試手」`, v.cards.some((c) => c.slot === "warmup"));
      ck(`${labelText}｜② 冷啟說明有出現`, /還沒有挑戰紀錄/.test(v.coldStart), v.coldStart.slice(0, 30));
      ck(`${labelText}｜② 卡片顯示熟練與新鮮度`,
        v.cards.every((c) => /英雄熟練 平均 Lv\./.test(c.text) && /(今天發布|天前發布)/.test(c.text)));
      //  ⚠ 冷啟時**不再**每張卡都寫「你還沒有挑戰過這支隊伍」（五張卡同一句），
      //    改由看板頂端說一次。有紀錄之後那一行才會回到卡片上。
      ck(`${labelText}｜② 冷啟時看板說明分類會隨戰績變準`,
        /還沒有挑戰紀錄/.test(v.coldStart), v.coldStart.slice(0, 30));
      ck(`${labelText}｜② 冷啟時卡片不重複同一句紀錄`,
        v.cards.every((c) => !/還沒有挑戰過這支隊伍/.test(c.text)));
      //  ⚠ 誠實：不得出現強弱宣告
      ck(`${labelText}｜② 卡片不出現戰力／勝率宣告`,
        v.cards.every((c) => !/戰力|勝率|評分|星等/.test(c.text)));

      // ── ③ 誠實標示：第一層摘要 ＋ 點得開的完整說明 ───────────────────
      //  ⚠ 這一節以前驗的是「五句完整聲明常駐在畫面上」。UI Clarity Pass v1
      //    把完整原因收進「挑戰規則」，第一層只留短標示。
      //    ⇒ 檢定力**不下降**：兩層各驗一次，缺任何一邊都紅。
      for (const t of ["0 生涯成長", "不耗體力", "不推進日期", "不影響正式賽季", "無排位"]) {
        ck(`${labelText}｜③ 第一層標示「${t}」`, v.careerSafe.includes(t), v.careerSafe.replace(/\n/g, " "));
      }
      //  點開規則面板，逐條確認完整說明真的取得得到。
      const rules = J(await chrome.evaluate(`
        const el = document.querySelector('[data-testid="challenge-rules"]');
        if (!el) return JSON.stringify({ ok: false, why: "沒有規則入口" });
        el.scrollIntoView({ block: "center" }); el.click();
        await new Promise((d) => setTimeout(d, 450));
        const s = document.querySelector('.esmo-pop, .esmo-sheet');
        return JSON.stringify({ ok: !!s, text: s ? (s.innerText || '') : '' });
      `));
      ck(`${labelText}｜③ 規則說明打得開`, rules.ok, rules.why ?? "");
      ck(`${labelText}｜③ 說明裡有：不給生涯成長的原因`, /選手不會得到經驗/.test(rules.text));
      ck(`${labelText}｜③ 說明裡有：不耗體力`, /不會消耗體力/.test(rules.text));
      ck(`${labelText}｜③ 說明裡有：不推進日期`, /日期不會前進/.test(rules.text));
      ck(`${labelText}｜③ 說明裡有：不影響正式賽季`, /正式賽季的戰績與名次也不會變動/.test(rules.text));
      ck(`${labelText}｜③ 明說對手不是其他玩家`, /不是其他玩家的戰隊/.test(rules.text));
      ck(`${labelText}｜③ 明說對手不會即時反應`, /不會即時反應/.test(rules.text));
      ck(`${labelText}｜③ 明說沒有防作弊機制`, /還沒有防作弊機制/.test(rules.text));
      ck(`${labelText}｜③ 明說紀錄只是本存檔（非全服）`, /不是全服資料/.test(rules.text));
      await chrome.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise((d) => setTimeout(d, 300)); return JSON.stringify({});`);
      ck(`${labelText}｜③ 說明出賽用的是目前的隊伍`, /目前.*先發|凍結/.test(v.entryNote), v.entryNote.slice(0, 40));

      // ── ④ 對手詳情可展開（手機的第二層）─────────────────────────────
      const warm = v.cards.find((c) => c.slot === "warmup") ?? v.cards[0];
      const det = J(await chrome.evaluate(clickBy(`[data-testid="challenge-detail-${warm.key}"]`)));
      ck(`${labelText}｜④ 詳情按鈕點得開`, det.ok, det.why ?? `${det.w}x${det.h}`);
      v = J(await chrome.evaluate(readScreen()));
      ck(`${labelText}｜④ 詳情有流派與取捨`, /強攻|控圖|應變/.test(v.detailText), v.detailText.slice(0, 26));
      ck(`${labelText}｜④ 詳情有預存戰術與弱點`, /預存戰術/.test(v.detailText) && /弱點/.test(v.detailText));
      ck(`${labelText}｜④ 詳情有五名先發`, ["b1", "b2", "b3", "b4", "b5"].every((x) => v.detailText.includes(x)));

      // ── ⑤ 發起挑戰 ───────────────────────────────────────────────────
      const fpBefore = J(await chrome.evaluate(`${RESOLVE_APP_MODULES}${CAREER_FP} return JSON.stringify({ fp });`)).fp;
      const start = J(await chrome.evaluate(clickBy(`[data-testid="challenge-start-${warm.key}"]`)));
      ck(`${labelText}｜⑤ 發起挑戰點得到`, start.ok, start.why ?? "");
      //  ── Slice 6 起：「發起挑戰」會先進 Ban/Pick 頁，選完才開打 ──────────
      const drafted = await completeManualDraft(chrome, sleep);
      ck(`${labelText}｜⑤ 手動選角走得完（3 ban + 5 pick）`, drafted.ok,
        drafted.skipped ? "（沒有選角頁，走直接開打路徑）" : `${drafted.bans} ban / ${drafted.picks} pick`);
      const waited = await waitFor(chrome, sleep, readScreen, (x) => !!x.outcome, 90000);
      ck(`${labelText}｜⑤ 模擬在時限內完成`, waited.ok, `${(waited.ms / 1000).toFixed(1)}s`);
      v = waited.value;
      ck(`${labelText}｜⑤ 出現結果`, /挑戰成功|挑戰失敗|未分勝負/.test(v.outcome), v.outcome);
      ck(`${labelText}｜⑤ 有比分與時長`, /擊殺 \d+ : \d+/.test(v.score), v.score);

      // ── ⑥ 賽後：宣告 vs 實際 ─────────────────────────────────────────
      ck(`${labelText}｜⑥ 有我方「宣告 vs 實際」對照`, /目標 \d+/.test(v.evidenceMine), v.evidenceMine.slice(0, 40).replace(/\n/g, " "));
      ck(`${labelText}｜⑥ 有對手「宣告 vs 實際」對照`, /目標 \d+/.test(v.evidenceOpp));
      ck(`${labelText}｜⑥ 對照表說明資料來源`, /引擎的實際計數/.test(v.evidenceMine));

      // ── ⑦ 再試一次 ───────────────────────────────────────────────────
      const rt = J(await chrome.evaluate(clickBy('[data-testid="challenge-retry-btn"]')));
      ck(`${labelText}｜⑦ 再試一次點得到`, rt.ok, rt.why ?? "");
      const rw = await waitFor(chrome, sleep, readScreen, (x) => !!x.retryTag, 90000);
      ck(`${labelText}｜⑦ 標示為「再試一次・不計入紀錄」`, /不計入紀錄/.test(rw.value.retryTag), rw.value.retryTag);

      // ── ⑧ 重播驗證 ＋ 生涯零變動 ─────────────────────────────────────
      await chrome.evaluate(clickBy('[data-testid="challenge-verify-btn"]'));
      const vw = await waitFor(chrome, sleep, readScreen, (x) => !!x.verifyText, 90000);
      ck(`${labelText}｜⑧ 重播與當初一致`, /完全一致/.test(vw.value.verifyText), vw.value.verifyText || "(逾時)");
      const fpAfter = J(await chrome.evaluate(`${RESOLVE_APP_MODULES}${CAREER_FP} return JSON.stringify({ fp });`)).fp;
      ck(`${labelText}｜⑧ 生涯狀態逐值一致`, fpAfter === fpBefore);

      // ── ⑨ reload 後仍在 ──────────────────────────────────────────────
      await chrome.navigate(url); await sleep(1300);
      if (mobile) await chrome.evaluate(clickByText("更多"));
      await chrome.evaluate(clickByText("玩家挑戰"));
      await sleep(600);
      v = J(await chrome.evaluate(readScreen()));
      ck(`${labelText}｜⑨ reload 後挑戰紀錄還在`, v.historyCount >= 2, `${v.historyCount} 筆`);
      ck(`${labelText}｜⑨ reload 後看板仍列得出候選`, v.cards.length >= 4);
      ck(`${labelText}｜⑨ 打過之後不再顯示冷啟說明或已有紀錄`,
        v.cards.some((c) => /你挑戰過/.test(c.text)), v.cards.map((c) => c.slot).join(","));

      // ── ⑩ 版面 ───────────────────────────────────────────────────────
      ck(`${labelText}｜⑩ 不造成水平溢出`, v.overflow === false);
      if (mobile) ck(`${labelText}｜⑩ 本頁互動元素都 ≥44px`, v.smallCount === 0, v.small.join(",") || "clean");
      const errs = (chrome.consoleLines ?? []).filter((l) => /^\[error\]/i.test(l));
      ck(`${labelText}｜⑩ console / page 錯誤 = 0`,
        errs.length === 0 && (chrome.pageErrors ?? []).length === 0,
        [...errs, ...(chrome.pageErrors ?? [])].slice(0, 3).join(" ¦ ") || "clean");
    }
  },
});

finishGate(result);
