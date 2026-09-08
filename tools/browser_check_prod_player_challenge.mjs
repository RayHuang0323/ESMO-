#!/usr/bin/env node
// ============================================================================
//  Player Challenge Slice 1–3 — **正式站** production smoke（桌機 ＋ 手機 390）
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_prod_player_challenge.mjs --timeout 900000`
//
//  ⚠ 正式站是打包後的 bundle，**沒有 `/src/...`** ⇒ 只能點 UI 與讀 localStorage
//    （TD-31 的教訓）。所有斷言都必須是玩家看得到的東西。
//  ⚠ 生涯隔離的比對讀的是 `esmo.profile.v1` 的**實際內容**，
//    而且**先驗證前提成立**（存檔真的存在、真的有選手）才比對——
//    憑 localStorage 推定會產生假綠（既有教訓）。
//  ⚠ 不用固定 sleep 等模擬（會變成「機器夠快才會綠」）⇒ 輪詢。
// ============================================================================
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));
const PROD = "https://rayhuang0323.github.io/ESMO-/";

const clickByText = (text) => `
  const els = [...document.querySelectorAll('button,[role="button"],a')];
  const el = els.find((e) => (e.innerText || "").trim().includes(${JSON.stringify(text)}));
  if (!el) return JSON.stringify({ ok: false, why: "找不到含該文字的按鈕" });
  el.scrollIntoView({ block: "center" });
  el.click();
  await new Promise((done) => setTimeout(done, 500));
  return JSON.stringify({ ok: true });
`;

const clickBy = (sel) => `
  const sel = ${JSON.stringify(sel)};
  const el = document.querySelector(sel);
  if (!el) return JSON.stringify({ ok: false, why: "找不到 " + sel });
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return JSON.stringify({ ok: false, why: "元素不可見" });
  el.scrollIntoView({ block: "center" });
  el.click();
  await new Promise((done) => setTimeout(done, 450));
  return JSON.stringify({ ok: true, w: Math.round(r.width), h: Math.round(r.height) });
`;

/** 生涯指紋：直接讀存檔內容。⚠ 不含 `challenge` 切片（那一格本來就該變）。 */
const CAREER = `
  const raw = localStorage.getItem("esmo.profile.v1");
  if (!raw) return JSON.stringify({ ok: false, why: "存檔還不存在" });
  const s = JSON.parse(raw);
  return JSON.stringify({
    ok: true,
    players: Array.isArray(s.players) ? s.players.length : 0,
    fp: JSON.stringify({
      players: s.players, meta: s.meta, lineup: s.lineup, team: s.team,
      competition: s.competition, competitionHistory: s.competitionHistory,
      retention: s.retention, clubMastery: s.clubMastery,
      processedMatchTransactions: s.processedMatchTransactions, honors: s.honors,
    }),
    funds: s.meta?.funds ?? null, fans: s.meta?.fans ?? null, days: s.meta?.days ?? null,
    xpSum: (s.players ?? []).reduce((a, p) => a + (Number(p.xp) || 0), 0),
    energySum: (s.players ?? []).reduce((a, p) => a + (Number(p.energy) || 0), 0),
    block: JSON.stringify(s.meta?.competitiveBlock ?? null),
  });
`;

const readScreen = () => `
  const q = (s) => document.querySelector(s);
  const txt = (s) => (q(s)?.innerText || "").trim();
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none"; };
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
    cards,
    hasDefense: !!q('[data-testid="challenge-defense-card"]'),
    detailText: txt('[data-testid^="challenge-detail-body-"]'),
    outcome: txt('[data-testid="challenge-outcome"]'),
    score: txt('[data-testid="challenge-score"]'),
    evidenceMine: txt('[data-testid="challenge-evidence-mine"]'),
    verifyText: txt('[data-testid="challenge-verify-result"]'),
    historyCount: document.querySelectorAll('[data-testid^="challenge-history-chal:"]').length,
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
    await sleep(1000);
  }
  return { ok: false, value, ms: Date.now() - t0 };
}

const result = await runGate({
  name: "正式站 Player Challenge（桌機 ＋ 手機）",
  externalUrl: PROD,
  run: async ({ chrome, url, ck, sleep }) => {
    for (const [L, width, height, mobile] of [["桌機 1366px", 1366, 900, false], ["手機 390px", 390, 844, true]]) {
      console.log(`\n════ ${L} ════`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });

      //  乾淨起點：清存檔再重載（正式站沒有存檔時會自建預設局）。
      await chrome.navigate(url); await sleep(2200);
      await chrome.evaluate(`localStorage.clear(); return "1";`);
      await chrome.navigate(url); await sleep(2800);

      // ── ① 入口 ───────────────────────────────────────────────────────
      if (mobile) await chrome.evaluate(clickByText("更多"));
      const entry = J(await chrome.evaluate(clickByText("玩家挑戰")));
      ck(`${L}｜① 首頁點得到「玩家挑戰」`, entry.ok, entry.why ?? "");
      let v = J(await chrome.evaluate(readScreen()));
      ck(`${L}｜① 進到玩家挑戰畫面`, v.onScreen === true);
      ck(`${L}｜① 標示為玩家挑戰`, v.tierName === "玩家挑戰", v.tierName);
      for (const t of ["不增加生涯成長", "不消耗選手體力", "不推進生涯日期", "不影響正式賽季", "沒有排位分數"]) {
        ck(`${L}｜① 看得到「${t}」`, v.careerSafe.includes(t));
      }

      // ── ② 發布防守陣容 ───────────────────────────────────────────────
      const pub = J(await chrome.evaluate(clickBy('[data-testid="challenge-publish-btn"]')));
      ck(`${L}｜② 發布按鈕點得到`, pub.ok, pub.why ?? "");
      v = J(await chrome.evaluate(readScreen()));
      ck(`${L}｜② 出現防守陣容卡`, v.hasDefense === true);

      //  ⚠ **先驗證前提成立**再談生涯隔離：存檔真的寫出來、真的有選手。
      const before = J(await chrome.evaluate(CAREER));
      ck(`${L}｜② precondition：正式站存檔已寫出且有選手`, before.ok === true && before.players > 0,
        before.ok ? `${before.players} 名選手 / 第 ${before.days} 天` : before.why);

      // ── ③ Challenge Board ────────────────────────────────────────────
      ck(`${L}｜③ 看板列出 5 個候選`, v.cards.length === 5, `${v.cards.length} 個`);
      ck(`${L}｜③ 每張卡都有候選位`, v.cards.every((c) => !!c.slot), v.cards.map((c) => `${c.key}:${c.slot}`).join(" "));
      ck(`${L}｜③ 至少一個「可以先試手」`, v.cards.some((c) => c.slot === "warmup"));
      ck(`${L}｜③ 卡片有熟練與新鮮度`,
        v.cards.every((c) => /英雄熟練 平均 Lv\./.test(c.text) && /(今天發布|天前發布)/.test(c.text)));
      ck(`${L}｜③ 卡片有你的挑戰紀錄`, v.cards.every((c) => /還沒有挑戰過這支隊伍|你挑戰過/.test(c.text)));
      ck(`${L}｜③ 卡片不出現戰力／勝率宣告`, v.cards.every((c) => !/戰力|勝率|評分|星等/.test(c.text)));

      const warm = v.cards.find((c) => c.slot === "warmup") ?? v.cards[0];
      const det = J(await chrome.evaluate(clickBy(`[data-testid="challenge-detail-${warm.key}"]`)));
      ck(`${L}｜③ 對手詳情展得開`, det.ok, det.why ?? "");
      v = J(await chrome.evaluate(readScreen()));
      ck(`${L}｜③ 詳情有流派與取捨`, /強攻|控圖|應變/.test(v.detailText));
      ck(`${L}｜③ 詳情有預存戰術與弱點`, /預存戰術/.test(v.detailText) && /弱點/.test(v.detailText));
      ck(`${L}｜③ 詳情有五名先發`, ["b1", "b2", "b3", "b4", "b5"].every((x) => v.detailText.includes(x)));

      // ── ④ 發起挑戰 → 真的跑完 ───────────────────────────────────────
      const start = J(await chrome.evaluate(clickBy(`[data-testid="challenge-start-${warm.key}"]`)));
      ck(`${L}｜④ 發起挑戰點得到`, start.ok, start.why ?? "");
      const w = await waitFor(chrome, sleep, readScreen, (x) => !!x.outcome, 120000);
      ck(`${L}｜④ 真 MOBA 模擬在時限內完成`, w.ok, `${(w.ms / 1000).toFixed(1)}s`);
      v = w.value;
      ck(`${L}｜④ 結果立即顯示`, /挑戰成功|挑戰失敗|未分勝負/.test(v.outcome), v.outcome);
      ck(`${L}｜④ 有比分與時長`, /擊殺 \d+ : \d+/.test(v.score), v.score);
      ck(`${L}｜④ 有「宣告 vs 實際」對照`, /目標 \d+/.test(v.evidenceMine));

      // ── ⑤ 重播驗證 ───────────────────────────────────────────────────
      await chrome.evaluate(clickBy('[data-testid="challenge-verify-btn"]'));
      const vw = await waitFor(chrome, sleep, readScreen, (x) => !!x.verifyText, 120000);
      ck(`${L}｜⑤ 重播與當初一致`, /完全一致/.test(vw.value.verifyText), vw.value.verifyText || "(逾時)");

      // ── ⑥ 生涯隔離（正式站實測）─────────────────────────────────────
      const after = J(await chrome.evaluate(CAREER));
      ck(`${L}｜⑥ 生涯狀態逐值一致`, after.ok && after.fp === before.fp);
      ck(`${L}｜⑥ 0 Career growth（選手 XP 不變）`, after.xpSum === before.xpSum, `${before.xpSum} → ${after.xpSum}`);
      ck(`${L}｜⑥ 0 stamina（體力總和不變）`, after.energySum === before.energySum, `${before.energySum} → ${after.energySum}`);
      ck(`${L}｜⑥ 0 money / fans`, after.funds === before.funds && after.fans === before.fans,
        `$${before.funds}/${before.fans} → $${after.funds}/${after.fans}`);
      ck(`${L}｜⑥ 0 world-time（生涯日不變）`, after.days === before.days, `第 ${before.days} 天`);
      ck(`${L}｜⑥ 0 formal standings（賽季帳本不變）`, after.fp.includes('"competition"') === before.fp.includes('"competition"'));
      ck(`${L}｜⑥ 不吃每日競技容量`, after.block === before.block, `${before.block} → ${after.block}`);
      //  ⚠ LadderRating 在產品裡根本不存在 ⇒ 斷言「存檔裡沒有這個欄位」。
      const ladder = J(await chrome.evaluate(`
        const raw = localStorage.getItem("esmo.profile.v1") || "";
        return JSON.stringify({ has: /ladderRating|ladder_rating|mmr/i.test(raw) });
      `));
      ck(`${L}｜⑥ 0 LadderRating（存檔裡沒有任何 ladder/mmr 欄位）`, ladder.has === false);

      // ── ⑦ reload 後紀錄仍在 ─────────────────────────────────────────
      await chrome.navigate(url); await sleep(2600);
      if (mobile) await chrome.evaluate(clickByText("更多"));
      await chrome.evaluate(clickByText("玩家挑戰"));
      await sleep(700);
      v = J(await chrome.evaluate(readScreen()));
      ck(`${L}｜⑦ reload 後挑戰紀錄仍在`, v.historyCount >= 1, `${v.historyCount} 筆`);
      ck(`${L}｜⑦ reload 後防守陣容仍在`, v.hasDefense === true);
      const open = J(await chrome.evaluate(`
        const el = document.querySelector('[data-testid^="challenge-history-chal:"]');
        if (!el) return JSON.stringify({ ok: false, why: "沒有紀錄可點" });
        el.scrollIntoView({ block: "center" }); el.click();
        await new Promise((d) => setTimeout(d, 500));
        return JSON.stringify({ ok: true });
      `));
      ck(`${L}｜⑦ reload 後點得開那一場`, open.ok, open.why ?? "");
      v = J(await chrome.evaluate(readScreen()));
      ck(`${L}｜⑦ reload 後看得到同一場結果`, /挑戰成功|挑戰失敗|未分勝負/.test(v.outcome), v.outcome);

      // ── ⑧ 版面 ───────────────────────────────────────────────────────
      ck(`${L}｜⑧ 不造成水平溢出`, v.overflow === false);
      if (mobile) ck(`${L}｜⑧ 本頁互動元素都 ≥44px`, v.smallCount === 0, v.small.join(",") || "clean");

      // ── ⑨ CS 入口未被破壞（只確認入口，不重跑 Codex 全套）───────────
      await chrome.navigate(url); await sleep(2600);
      const cs = J(await chrome.evaluate(clickByText("CS")));
      ck(`${L}｜⑨ 首頁 CS 入口點得到`, cs.ok, cs.why ?? "");
      await sleep(1200);
      const csScreen = J(await chrome.evaluate(`
        const t = (document.body.innerText || "").trim();
        return JSON.stringify({ len: t.length, sample: t.replace(/\\s+/g, " ").slice(0, 90) });
      `));
      ck(`${L}｜⑨ CS 畫面開得起來`, csScreen.len > 40, csScreen.sample);
      await chrome.navigate(url); await sleep(2400);
      const backMoba = J(await chrome.evaluate(clickByText("MOBA")));
      ck(`${L}｜⑨ 回首頁後 MOBA 入口仍可用`, backMoba.ok, backMoba.why ?? "");

      // ── ⑩ console 錯誤 ──────────────────────────────────────────────
      const errs = (chrome.consoleLines ?? []).filter((l) => /^\[error\]/i.test(l));
      const pageErrs = chrome.pageErrors ?? [];
      ck(`${L}｜⑩ 無 page-origin uncaught error`, pageErrs.length === 0,
        pageErrs.slice(0, 2).join(" ¦ ") || "clean");
      if (errs.length) console.log(`   ⓘ console [error] ${errs.length} 筆：${errs.slice(0, 2).join(" ¦ ")}`);
    }
  },
});

finishGate(result);
