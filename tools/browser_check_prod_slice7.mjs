#!/usr/bin/env node
// ============================================================================
//  正式站 Slice 7 smoke — 挑戰生命週期與防刷
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_prod_slice7.mjs \
//          --external https://rayhuang0323.github.io/ESMO-/ --timeout 1800000`
//
//  ⚠ 正式站是打包產物，**沒有 /src/ 可 import**（本地 gate 用的
//    RESOLVE_APP_MODULES 在這裡一定失敗）。所以互動一律走真實 UI
//    （含 Slice 6 的手動 Ban/Pick），狀態一律讀原始 localStorage。
//  ⚠ 驗的是 Owner 裁示的**三個計數**：observed / formal / eligible。
//    三者任何一個併回另一個都是回歸。
// ============================================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => { const s = String(raw).replace(/^"|"$/g, ""); try { return JSON.parse(s); } catch { return null; } };
const OUT = new URL("../review/prod-slice7/", import.meta.url);

const waitFor = async (chrome, sleep, expr, timeoutMs) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = J(await chrome.evaluate(`return JSON.stringify({ v: Boolean(${expr}) });`));
    if (r?.v) return { ok: true, ms: Date.now() - t0 };
    await sleep(250);
  }
  return { ok: false, ms: Date.now() - t0 };
};

//  三個計數全部從原始存檔推導，用與產品同一套規則。
//  刻意不讀畫面文字——文字可能落後於狀態。
const counts = () => `
  const raw = localStorage.getItem("esmo.profile.v1");
  const st = raw ? JSON.parse(raw) : null;
  const cur = st?.challenge ?? null;
  const list = (cur?.order ?? []).map((id) => cur.instances[id]).filter(Boolean);
  const done = list.filter((i) => i.result);
  const byKey = {};
  for (const i of done) {
    if (i.kind === "retry") continue;
    const k = i.opponentKey; if (!k) continue;
    const row = byKey[k] || (byKey[k] = { observed: 0, formal: 0 });
    row.observed += 1;
    if (!i.settlement || i.settlement.settlementClass === "formal") row.formal += 1;
  }
  return JSON.stringify({
    total: list.length, done: done.length, byKey,
    eligible: done.filter((i) => i.settlement && i.settlement.rewardEligible === true).length,
    rows: done.map((i) => ({ kind: i.kind, cls: (i.settlement || {}).settlementClass || null,
      elig: (i.settlement || {}).rewardEligible === true, opp: i.opponentKey,
      chId: (i.identity || {}).challenger || null, dfId: (i.identity || {}).defender || null })),
    career: {
      day: st && st.meta ? st.meta.days : null,
      xp: (st?.players ?? []).reduce((a, p) => a + (p.xp || 0), 0),
      stamina: (st?.players ?? []).reduce((a, p) => a + (p.stamina || 0), 0),
    },
  });
`;

const boardState = () => `
  return JSON.stringify([...document.querySelectorAll('[data-testid^="challenge-candidate-"]')].map((n) => ({
    key: (n.getAttribute("data-testid") || "").replace("challenge-candidate-", ""),
    text: (n.innerText || "").replace(/\\s+/g, " ").slice(0, 200),
  })));
`;

const settlementChip = () => `
  const n = document.querySelector('[data-testid="challenge-settlement-class"]');
  return JSON.stringify({ cls: n ? n.getAttribute("data-class") : null,
    elig: n ? n.getAttribute("data-eligible") : null, text: n ? n.innerText : null });
`;

async function gotoBoard(chrome, sleep) {
  for (const step of [
    `document.querySelector('[data-testid="home-utility-playerChallenge"]')?.click()`,
    `document.querySelector('[data-testid="home-nav-more"]')?.click()`,
    `document.querySelector('[data-testid="home-sheet-playerChallenge"]')?.click()`,
  ]) {
    await chrome.evaluate(`${step}; return JSON.stringify({});`);
    await sleep(600);
    if ((await waitFor(chrome, sleep, `document.querySelector('[data-testid="challenge-board"]')`, 4000)).ok) return true;
  }
  return false;
}

/** 對指定對手打完一整場（含 Slice 6 的手動選角）。 */
async function playFormal(chrome, sleep, key) {
  const t0 = Date.now();
  if (!(await gotoBoard(chrome, sleep))) return { ok: false, why: "沒有進到挑戰看板" };
  const started = J(await chrome.evaluate(`
    const b = document.querySelector('[data-testid="challenge-start-${key}"]');
    if (!b || b.disabled) return JSON.stringify({ ok: false, why: b ? "按鈕被停用" : "找不到那張卡" });
    b.scrollIntoView({ block: "center" }); b.click();
    return JSON.stringify({ ok: true });
  `));
  if (!started?.ok) return { ok: false, why: started?.why ?? "點不到挑戰" };

  if ((await waitFor(chrome, sleep, `document.querySelector('[data-testid="hero-grid-scroll"]')`, 25000)).ok) {
    for (let i = 0; i < 20; i++) {
      const st = J(await chrome.evaluate(`
        const raw = localStorage.getItem("esmo.profile.v1");
        const pd = raw ? (JSON.parse(raw).challenge || {}).pendingDraft || null : null;
        if (!pd) return JSON.stringify({ done: true });
        const b = pd.actions.filter((a) => a.act === "ban").length;
        const p = pd.actions.filter((a) => a.act === "pick").length;
        return JSON.stringify({ done: b >= 3 && p >= 5 });
      `));
      if (st?.done) break;
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
    await chrome.evaluate(`
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      [...document.querySelectorAll("button")].filter(vis)
        .find((n) => !n.disabled && /確認|開始/.test(n.innerText || ""))?.click();
      return JSON.stringify({});
    `);
  }
  const w = await waitFor(chrome, sleep, `document.querySelector('[data-testid="challenge-outcome"]')`, 150000);
  await sleep(1200);
  return w.ok ? { ok: true, ms: Date.now() - t0 } : { ok: false, why: "沒有跑出結果" };
}

/** 對剛打完那一場按「再試一次」。 */
async function playRetry(chrome, sleep) {
  const hit = J(await chrome.evaluate(`
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const b = [...document.querySelectorAll("button")].filter(vis)
      .find((n) => !n.disabled && /再試一次/.test(n.innerText || ""));
    if (!b) return JSON.stringify({ ok: false });
    b.scrollIntoView({ block: "center" }); b.click();
    return JSON.stringify({ ok: true });
  `));
  if (!hit?.ok) return { ok: false, why: "找不到再試一次" };
  await sleep(2000);
  const w = await waitFor(chrome, sleep, `document.querySelector('[data-testid="challenge-outcome"]')`, 150000);
  await sleep(1200);
  return w.ok ? { ok: true } : { ok: false, why: "retry 沒有跑出結果" };
}

const result = await runGate({
  name: "正式站 Slice 7 生命週期",
  externalUrl: process.env.ESMO_PROD_URL ?? "https://rayhuang0323.github.io/ESMO-/",
  run: async ({ chrome, url, ck, sleep }) => {
    mkdirSync(OUT, { recursive: true });
    const report = { url };

    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(url); await sleep(2000);
    await chrome.evaluate(`localStorage.removeItem("esmo.profile.v1"); return JSON.stringify({});`);
    await chrome.navigate(url); await sleep(2500);

    if (!(await gotoBoard(chrome, sleep))) { ck("① 進得了挑戰看板", false); return; }
    ck("① 進得了挑戰看板", true);
    await chrome.evaluate(`document.querySelector('[data-testid="challenge-publish-btn"]')?.click(); return JSON.stringify({});`);
    await sleep(1500);
    const key = J(await chrome.evaluate(`
      const n = document.querySelector('[data-testid^="challenge-start-"]');
      return JSON.stringify({ key: (n ? n.getAttribute("data-testid") : "").replace("challenge-start-", "") });
    `))?.key;
    ck("① 取得一個候選對手", !!key, String(key));
    if (!key) return;

    const before = J(await chrome.evaluate(counts()));
    report.before = before;

    // ── 第一次 Formal ──────────────────────────────────────────────────
    const f1 = await playFormal(chrome, sleep, key);
    ck("② 第一次 Formal 打得完", f1.ok, f1.ok ? `${(f1.ms / 1000).toFixed(1)}s` : f1.why);
    if (!f1.ok) return;
    const c1 = J(await chrome.evaluate(counts()));
    report.afterFormal = c1;
    ck("⭐ FORMAL：observed 1 / formal 1 / eligible 1",
      c1?.byKey?.[key]?.observed === 1 && c1?.byKey?.[key]?.formal === 1 && c1?.eligible === 1,
      JSON.stringify({ ...(c1?.byKey?.[key] ?? {}), eligible: c1?.eligible }));
    const chip1 = J(await chrome.evaluate(settlementChip()));
    ck("② RESULT_UX：標為正式紀錄", chip1?.cls === "formal" && chip1?.elig === "1", JSON.stringify(chip1));

    // ── Retry（按鈕在剛打完的結果頁上）────────────────────────────────
    const rt = await playRetry(chrome, sleep);
    ck("③ Retry 打得完", rt.ok, rt.why ?? "");
    const c2 = J(await chrome.evaluate(counts()));
    report.afterRetry = c2;
    ck("⭐ RETRY：observed 沒有增加（仍是 1）", c2?.byKey?.[key]?.observed === 1, `observed=${c2?.byKey?.[key]?.observed}`);
    ck("⭐ RETRY：formal 沒有增加（仍是 1）", c2?.byKey?.[key]?.formal === 1, `formal=${c2?.byKey?.[key]?.formal}`);
    ck("⭐ RETRY：eligible 沒有增加（仍是 1）", c2?.eligible === 1, `eligible=${c2?.eligible}`);
    ck("③ 前置：retry 真的多打了一場（否則上面三條是空過的）",
      (c2?.done ?? 0) === (c1?.done ?? 0) + 1, `${c1?.done} → ${c2?.done}`);

    // ── 同 pairing Repeat ──────────────────────────────────────────────
    const f2 = await playFormal(chrome, sleep, key);
    ck("④ 同 pairing 再打一場打得完", f2.ok, f2.ok ? `${(f2.ms / 1000).toFixed(1)}s` : f2.why);
    const c3 = J(await chrome.evaluate(counts()));
    report.afterRepeat = c3;
    ck("⭐ REPEAT：observed **有**增加（1 → 2）",
      c3?.byKey?.[key]?.observed === 2, `observed=${c3?.byKey?.[key]?.observed}`);
    ck("⭐ REPEAT：formal **沒有**增加（仍是 1）",
      c3?.byKey?.[key]?.formal === 1, `formal=${c3?.byKey?.[key]?.formal}`);
    ck("⭐ REPEAT：eligible **沒有**增加（仍是 1）",
      c3?.eligible === 1, `eligible=${c3?.eligible}`);
    const chip2 = J(await chrome.evaluate(settlementChip()));
    ck("④ RESULT_UX：標為不計入正式紀錄", chip2?.cls === "repeat" && chip2?.elig === "0", JSON.stringify(chip2));
    ck("④ 兩場的陣容身分相同（所以才判重複）",
      (() => {
        const fs = (c3?.rows ?? []).filter((r) => r.kind !== "retry");
        return fs.length === 2 && !!fs[0].chId && fs[0].chId === fs[1].chId && fs[0].dfId === fs[1].dfId;
      })(),
      JSON.stringify((c3?.rows ?? []).filter((r) => r.kind !== "retry").map((r) => `${r.chId}::${r.dfId}`)));

    // ── reload 後不變 ──────────────────────────────────────────────────
    await chrome.navigate(url); await sleep(2800);
    const c4 = J(await chrome.evaluate(counts()));
    ck("⭐ RELOAD：三個計數完全不變",
      (c3?.done ?? 0) > 0
      && JSON.stringify(c4?.byKey) === JSON.stringify(c3?.byKey) && c4?.eligible === c3?.eligible,
      JSON.stringify({ byKey: c4?.byKey, eligible: c4?.eligible }));
    ck("⭐ RELOAD：每一場的判定逐項不變",
      (c3?.rows ?? []).length > 0 && JSON.stringify(c4?.rows) === JSON.stringify(c3?.rows));

    // ── 看板狀態 ───────────────────────────────────────────────────────
    await gotoBoard(chrome, sleep); await sleep(1000);
    const cards = J(await chrome.evaluate(boardState()));
    report.board = cards;
    const played = (cards ?? []).find((c) => c.key === key);
    ck("⑤ BOARD_STATE：打過的對手顯示已挑戰這份陣容",
      !!played && /已挑戰這份陣容/.test(played.text), played?.text?.slice(0, 90) ?? "(無)");
    ck("⑤ BOARD_STATE：沒打過的仍顯示尚未正式挑戰",
      (cards ?? []).length > 1
      && (cards ?? []).filter((c) => c.key !== key).every((c) => /尚未正式挑戰/.test(c.text)),
      (cards ?? []).map((c) => c.key).join(","));
    ck("⑤ BOARD_STATE：沒有卡片憑空顯示對手更新了陣容",
      (cards ?? []).every((c) => !/對手更新了陣容/.test(c.text)));

    // ── 生涯隔離 ───────────────────────────────────────────────────────
    ck("⭐ CAREER：生涯日期不變", c4?.career?.day === before?.career?.day,
      `${before?.career?.day} → ${c4?.career?.day}`);
    ck("⭐ CAREER：選手經驗不變", c4?.career?.xp === before?.career?.xp,
      `${before?.career?.xp} → ${c4?.career?.xp}`);
    ck("⭐ CAREER：體力不變", c4?.career?.stamina === before?.career?.stamina,
      `${before?.career?.stamina} → ${c4?.career?.stamina}`);

    // ── 手機 390：手動選角與捲動仍正常 ─────────────────────────────────
    await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await chrome.navigate(url); await sleep(2500);
    const onBoard = await gotoBoard(chrome, sleep);
    ck("⑥ MOBILE_390：進得了挑戰看板", onBoard);
    if (onBoard) {
      await chrome.evaluate(`
        [...document.querySelectorAll('[data-testid^="challenge-start-"]')].find((b) => !b.disabled)?.click();
        return JSON.stringify({});
      `);
      const draft = await waitFor(chrome, sleep, `document.querySelector('[data-testid="hero-grid-scroll"]')`, 25000);
      ck("⑥ MOBILE_390：進得了手動選角", draft.ok);
      if (draft.ok) {
        const g = J(await chrome.evaluate(`
          const el = document.querySelector('[data-testid="hero-grid-scroll"]');
          const r = el.getBoundingClientRect();
          return JSON.stringify({ client: el.clientHeight, scroll: el.scrollHeight,
            x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), before: el.scrollTop });
        `));
        const touch = (type, py) => chrome.send("Input.dispatchTouchEvent", {
          type, touchPoints: type === "touchEnd" ? [] : [{ x: g.x, y: py, radiusX: 12, radiusY: 12, force: 1 }],
        });
        await touch("touchStart", g.y); await sleep(30);
        for (let i = 1; i <= 10; i++) { await touch("touchMove", Math.round(g.y - 20 * i)); await sleep(24); }
        await sleep(60); await touch("touchEnd", Math.round(g.y - 200)); await sleep(500);
        const after = J(await chrome.evaluate(`
          const el = document.querySelector('[data-testid="hero-grid-scroll"]');
          return JSON.stringify({ after: el.scrollTop, doc: document.scrollingElement.scrollTop });
        `));
        ck("⑥ MOBILE_390：單指捲得動英雄池", g.scroll > g.client && after.after > g.before,
          `${g.scroll}/${g.client}｜${g.before} → ${after.after}`);
        ck("⑥ MOBILE_390：document 沒有跟著滑", after.doc === 0, `document ${after.doc}`);
      }
    }

    const pageErrs = chrome.pageErrors ?? [];
    ck("⑦ CONSOLE：無 page-origin uncaught error", pageErrs.length === 0,
      pageErrs.slice(0, 3).join(" ¦ ") || "clean");

    writeFileSync(new URL("prod-slice7.json", OUT), JSON.stringify(report, null, 2));
    console.log(`\n數據：review/prod-slice7/prod-slice7.json`);
  },
});

finishGate(result);
