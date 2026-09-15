#!/usr/bin/env node
// ============================================================================
//  tools/browser_review_moba_items_m3d.mjs — 出裝策略（M3d）真實流程量測與截圖
//
//  執行：node tools/browser/run-gate.mjs tools/browser_review_moba_items_m3d.mjs --timeout 2400000
//
//  走玩家真的會走的路（DEV 伺服器）：首頁 → MOBA 賽前 → Ban/Pick（真的點英雄）→ 戰術頁。
//  OFF（不帶 ?itemsDev=1）：戰術頁沒有出裝策略區；本場設定沒有 buildStrategy。停在戰術頁（場次保留）。
//  ON（?itemsDev=1，重新整理 →「返回進行中的比賽」接回同一場的戰術頁）：
//    · 1366／768／390／320：五張卡（名稱、白話說明、四項傾向、三件核心＝selectStrategyPrepView）、
//      桌機一排五張／手機橫向滑動、不水平溢出、可點元素 ≥ 44、沒有 select；預設預覽＝差異最多的英雄
//    · 390：五種策略逐一點選 ⇒ 只有那張 selected、本場設定 buildStrategy＝那一種；切換預覽英雄 ⇒ 預覽跟著換
//    · 重新整理 → 接回戰術頁 ⇒ 仍是所選；返回 Ban/Pick 再進戰術頁 ⇒ 仍是所選
//    · 開始載入 ⇒ 載入頁顯示「本場已鎖定」；戰鬥中我方五人＝所選、紅方＝標準、英雄面板策略名一致、
//      預覽核心＝引擎開局計畫
//    · 戰鬥中重新整理 → 恢復 ⇒ 策略不變、恢復前後同一筆購買紀錄逐欄相同（同 seed＋同策略 deterministic）
//    · console error 不比 OFF 多
//  ⚠ chrome.evaluate 的字串裡不能有反引號；回傳一律包成物件（J() 會剝掉最外層引號，純字串會解析失敗）。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runGate, finishGate } from "./browser/harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHOT_DIR = resolve(ROOT, process.env.ESMO_REVIEW_OUT ?? "review/moba-items-m3d");
mkdirSync(SHOT_DIR, { recursive: true });
const TAG = process.env.ESMO_M3D_TAG ? `-${process.env.ESMO_M3D_TAG}` : "";
const { BUILD_STRATEGY_META } = await import(pathToFileURL(resolve(ROOT, "src/battle/moba/items/itemsUiSelectors.js")).href);
const STRATEGIES = Object.keys(BUILD_STRATEGY_META);
//  最後選「前期壓制」：它在第一次回城（約 3 分鐘）就讓我方買的東西與「標準」不同
//  （後期成型要到約 12 分鐘才分歧）⇒ 戰鬥中重新整理若把策略弄丟，300 秒的購買紀錄就對不上。
const FINAL = process.env.ESMO_M3D_FINAL ?? "early";
const FINAL_LABEL = BUILD_STRATEGY_META[FINAL].label;
const WIDTHS = [[1366, 900, false], [768, 1024, false], [390, 844, true], [320, 720, true]];
const REFRESH_AT_TS = Number(process.env.ESMO_M3D_REFRESH_TS ?? 300);

const report = [];
const note = (line) => { report.push(line); console.log(line); };
const J = (raw) => { try { return JSON.parse(String(raw).replace(/^"|"$/g, "")); } catch { return null; } };

const MODS = `
  const B = location.pathname.endsWith("/") ? location.pathname.slice(0, -1) : location.pathname;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ps = await import(B + "/src/platform/profileStore.js");
  const savedStrategy = () => { const v = ps.useProfileStore.getState().activeMatchView(); return v && v.config ? (v.config.buildStrategy ?? null) : null; };
`;
//  預期值：照 AppShell 的組裝（buildBattleRoster × draftRoster）重建本場名單，再呼叫同一支 selector
const EXPECT = `
  const adapter = await import(B + "/src/battle/moba/mobaRosterAdapter.js");
  const dr = await import(B + "/src/battle/moba/draftRoster.js");
  const rosterMod = await import(B + "/src/data/roster.js");
  const heroes = await import(B + "/src/data/heroDatabase.js");
  const prep = await import(B + "/src/battle/moba/items/buildStrategyPrep.js");
  const meta = (await import(B + "/src/battle/moba/items/itemsUiSelectors.js")).BUILD_STRATEGY_META;
  const liveRoster = () => {
    const st = ps.useProfileStore.getState();
    const view = st.activeMatchView();
    const draft = view && view.config ? (view.config.draft ?? null) : null;
    const battleRoster = adapter.buildBattleRoster({ players: st.players, lineup: st.lineup, baseRoster: rosterMod.ROSTER, draft, heroLookup: heroes.heroById });
    return dr.draftRoster(battleRoster, draft);
  };
`;

const clickSel = (sel) => `const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(vis); if (!el || el.disabled) return JSON.stringify({ ok: false }); el.scrollIntoView({ block: "center" }); el.click(); return JSON.stringify({ ok: true });`;
const clickText = (needle) => `const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; const el = [...document.querySelectorAll("button")].filter(vis).find((n) => !n.disabled && (n.innerText || "").includes(${JSON.stringify(needle)})); if (!el) return JSON.stringify({ ok: false }); el.scrollIntoView({ block: "center" }); el.click(); return JSON.stringify({ ok: true });`;
const waitFor = async (chrome, sleep, expr, timeoutMs, everyMs = 300) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = J(await chrome.evaluate(`return JSON.stringify({ v: Boolean(${expr}) });`));
    if (r?.v) return true;
    await sleep(everyMs);
  }
  return false;
};
const AT_TACTIC = `[...document.querySelectorAll("button")].some((b) => (b.innerText || "").includes("開始載入"))`;

async function realClick(chrome, sel) {
  const p = J(await chrome.evaluate(`const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && !n.disabled; }); if (!el) return JSON.stringify(null); const r = el.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });`));
  if (!p) return null;
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    await chrome.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", clickCount: 1 });
  }
  return p;
}

/** Ban/Pick：一直點可選的英雄直到可以確認，再確認進戰術頁。 */
async function draftToTactic(chrome, sleep, ck, label) {
  const inBanPick = await waitFor(chrome, sleep, `document.querySelector('[data-testid="hero-grid-scroll"]')`, 90000);
  ck(`${label}｜進入 Ban/Pick`, inBanPick);
  if (!inBanPick) return false;
  let picks = 0;
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    if (J(await chrome.evaluate(`const b = document.querySelector('[data-testid="confirm-draft"]'); return JSON.stringify({ v: !!b && !b.disabled });`))?.v) break;
    if (await realClick(chrome, `[data-testid="hero-choose"]`)) picks += 1;
    await sleep(1200);
  }
  const canConfirm = J(await chrome.evaluate(`const b = document.querySelector('[data-testid="confirm-draft"]'); return JSON.stringify({ v: !!b && !b.disabled });`))?.v;
  ck(`${label}｜選角完成`, !!canConfirm, `hero clicks ${picks}`);
  if (!canConfirm) return false;
  await chrome.evaluate(clickSel(`[data-testid="confirm-draft"]`));
  const atTactic = await waitFor(chrome, sleep, AT_TACTIC, 60000);
  ck(`${label}｜進入戰術頁`, atTactic);
  return atTactic;
}

/** 首頁 → MOBA 賽前 → Ban/Pick → 戰術頁（新場次）。 */
async function homeToTactic(chrome, sleep, ck) {
  ck("首頁有 MOBA 入口", await waitFor(chrome, sleep, `document.querySelector('[data-testid="home-mode-moba"]')`, 90000));
  await chrome.evaluate(clickSel(`[data-testid="home-mode-moba"]`));
  ck("進入賽前頁", await waitFor(chrome, sleep, `document.querySelector('[data-testid="prep-primary-action"]')`, 60000));
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (J(await chrome.evaluate(`return JSON.stringify({ v: !!document.querySelector('[data-testid="hero-grid-scroll"]') });`))?.v) break;
    if (J(await chrome.evaluate(`const b = document.querySelector('[data-testid="matchmaking-enter-banpick"]'); return JSON.stringify({ v: !!b && !b.disabled });`))?.v) {
      await chrome.evaluate(clickSel(`[data-testid="matchmaking-enter-banpick"]`)); await sleep(1000); continue;
    }
    const a = J(await chrome.evaluate(`const el = document.querySelector('[data-testid="prep-primary-action"]'); return JSON.stringify({ action: el ? el.dataset.action : null, disabled: !!(el && el.disabled) });`));
    if (a?.action === "blocked") { await chrome.evaluate(clickText("自動")); await sleep(800); continue; }
    if (a?.action && !a.disabled) { await chrome.evaluate(clickSel(`[data-testid="prep-primary-action"]`)); await sleep(900); continue; }
    await sleep(600);
  }
  return draftToTactic(chrome, sleep, ck, "新場次");
}

/** 重新整理後：首頁「返回進行中的比賽」。 */
async function resumeFromHome(chrome, sleep) {
  const card = await waitFor(chrome, sleep, `document.querySelector('[data-testid="resume-active-match"]')`, 90000);
  if (!card) return false;
  await chrome.evaluate(clickSel(`[data-testid="resume-active-match"]`));
  return true;
}

const MEASURE_TACTIC = `
  ${MODS}${EXPECT}
  const sec = document.querySelector("[data-build-strategy-prep]");
  if (!sec) return JSON.stringify({ ok: false, why: "no section" });
  sec.scrollIntoView({ block: "start" }); await sleep(400);
  const rect = (el) => el.getBoundingClientRect();
  const cards = [...sec.querySelectorAll("[data-strategy]")];
  const layoutEl = sec.querySelector("[data-strategy-layout]");
  const focusEl = sec.querySelector('[data-focus-seat][aria-checked="true"]');
  const focus = focusEl ? focusEl.dataset.focusSeat : null;
  const roster = liveRoster();
  const view = prep.selectStrategyPrepView({ roster, heroLookup: heroes.heroById, focusSeat: focus });
  const bad = [];
  for (const c of cards) {
    const id = c.dataset.strategy;
    const m = meta[id];
    const text = c.innerText || "";
    if (!text.includes(m.label)) bad.push(id + ":label");
    if (!text.includes(m.pitch)) bad.push(id + ":pitch");
    const traits = [...c.querySelectorAll("[data-trait]")].map((t) => t.dataset.trait + t.dataset.traitValue).join(",");
    const expTraits = [["前期", m.traits.early], ["後期", m.traits.late], ["保命", m.traits.survive], ["反制", m.traits.counter]].map((x) => x[0] + x[1]).join(",");
    if (traits !== expTraits) bad.push(id + ":traits=" + traits);
    const core = [...c.querySelectorAll("[data-preview-item]")].map((x) => x.dataset.previewItem);
    if (core.length !== 3 || core.join(",") !== view.previews[id].core.join(",") || c.dataset.previewCore !== core.join(",")) bad.push(id + ":core=" + core.join(","));
    if (!["selected", "idle"].includes(c.dataset.strategyState)) bad.push(id + ":state=" + c.dataset.strategyState);
  }
  const touch = [...sec.querySelectorAll("[data-touch]")].filter((el) => rect(el).width > 0)
    .map((el) => ({ l: el.dataset.strategy || el.dataset.focusSeat || "", w: Math.round(rect(el).width), h: Math.round(rect(el).height) }));
  const scroller = sec.querySelector('[data-strategy-layout="swipe"]');
  const dflt = prep.selectStrategyPrepView({ roster, heroLookup: heroes.heroById });
  return JSON.stringify({
    ok: true, count: cards.length, order: cards.map((c) => c.dataset.strategy), layout: layoutEl ? layoutEl.dataset.strategyLayout : null,
    tops: cards.map((c) => Math.round(rect(c).top)), widths: cards.map((c) => Math.round(rect(c).width)), bad, focus, arch: view.previews.standard.arch,
    spread: view.spread, defaultFocus: dflt.focusSeat,
    checked: cards.filter((c) => c.getAttribute("aria-checked") === "true").map((c) => c.dataset.strategy),
    selects: sec.querySelectorAll("select").length, radiogroups: sec.querySelectorAll('[role="radiogroup"]').length,
    overflow: document.documentElement.scrollWidth > innerWidth + 1, secOverflow: sec.scrollWidth > sec.clientWidth + 1,
    swipe: scroller ? { sw: scroller.scrollWidth, cw: scroller.clientWidth } : null,
    small: touch.filter((t) => t.w < 44 || t.h < 44), touchCount: touch.length, saved: savedStrategy(),
  });
`;

const SELECT = (id) => `
  ${MODS}
  const card = document.querySelector('[data-build-strategy-prep] [data-strategy="${id}"]');
  if (!card) return JSON.stringify({ ok: false, why: "no card" });
  card.scrollIntoView({ block: "nearest", inline: "start" }); await sleep(500);
  card.click();
  for (let i = 0; i < 60; i++) {
    const checked = [...document.querySelectorAll('[data-build-strategy-prep] [data-strategy][aria-checked="true"]')].map((c) => c.dataset.strategy);
    if (savedStrategy() === "${id}" && checked.length === 1 && checked[0] === "${id}") {
      const scroller = card.closest("[data-strategy-layout]");
      const sr = card.getBoundingClientRect(), cr = scroller.getBoundingClientRect();
      const dots = document.querySelector("[data-strategy-dots]");
      return JSON.stringify({ ok: true, saved: savedStrategy(), checked, state: card.dataset.strategyState,
        badge: (card.innerText || "").includes("已選擇"), visible: sr.left >= cr.left - 2 && sr.right <= cr.right + 2,
        dots: dots ? dots.dataset.strategyDots : null });
    }
    await sleep(50);
  }
  return JSON.stringify({ ok: false, saved: savedStrategy() });
`;

const FOCUS = (seat) => `
  ${MODS}${EXPECT}
  const btn = document.querySelector('[data-build-strategy-prep] [data-focus-seat="${seat}"]');
  if (!btn) return JSON.stringify({ ok: false, why: "no seat button" });
  btn.click(); await sleep(450);
  const roster = liveRoster();
  const view = prep.selectStrategyPrepView({ roster, heroLookup: heroes.heroById, focusSeat: "${seat}" });
  const bad = [];
  for (const c of document.querySelectorAll("[data-build-strategy-prep] [data-strategy]")) {
    if (c.dataset.previewCore !== view.previews[c.dataset.strategy].core.join(",")) bad.push(c.dataset.strategy + "=" + c.dataset.previewCore);
  }
  const strats = ${JSON.stringify(STRATEGIES)};
  const dflt = prep.selectStrategyPrepView({ roster, heroLookup: heroes.heroById });
  const spreads = Object.fromEntries(dflt.seats.map((s) => [s.seat, new Set(strats.map((k) => prep.selectStrategyPrepView({ roster, heroLookup: heroes.heroById, focusSeat: s.seat }).previews[k].core.join(","))).size]));
  const label = document.querySelector("[data-build-strategy-prep]").innerText || "";
  return JSON.stringify({ ok: btn.getAttribute("aria-checked") === "true", bad, arch: view.previews.standard.arch, distinct: view.spread,
    defaultFocus: dflt.focusSeat, spreads, headerHasArch: label.includes("（" + view.previews.standard.arch + "）") });
`;

const SCROLL_PREP = `const s = document.querySelector("[data-build-strategy-prep]"); if (s) s.scrollIntoView({ block: "start" }); await new Promise((r) => setTimeout(r, 400)); return JSON.stringify({ ok: !!s });`;

/** 在同一輪輪詢裡抓到載入頁的鎖定標籤（載入頁可能只停留一兩秒）；先進戰場就回 battle。 */
const WAIT_LOCKED = (limitMs) => `
  for (let i = 0; i < ${Math.round(limitMs / 50)}; i++) {
    const el = document.querySelector("[data-strategy-locked]");
    if (el) return JSON.stringify({ id: el.dataset.strategyLocked, text: el.innerText, battle: false });
    if (document.querySelector('[data-testid="battle-hud"]')) return JSON.stringify({ id: null, text: null, battle: true });
    await new Promise((r) => setTimeout(r, 50));
  }
  return JSON.stringify({ id: null, text: null, battle: false });
`;

const BATTLE = (expected) => `
  ${MODS}${EXPECT}
  const gs = await import(B + "/src/useGameStore.js");
  const vm = await import(B + "/src/battle/moba/items/itemsViewModel.js");
  const cat = await import(B + "/src/battle/moba/items/itemCatalog.js");
  for (let i = 0; i < 2400; i++) {
    const snap = gs.useGameStore.getState().snapshot;
    if (snap && snap.items && document.querySelector('[data-testid="battle-hud"]')) {
      const players = snap.items.players;
      const strat = Object.fromEntries(Object.keys(players).sort().map((id) => [id, players[id].strategy]));
      const blue = ["b1", "b2", "b3", "b4", "b5"];
      const labels = blue.map((id) => vm.selectPlayerItemsView(snap, id).strategyLabel);
      const t3 = (ids) => ids.filter((id) => cat.getItem(id).tier === "T3").slice(0, 3).join(",");
      const roster = liveRoster();
      const planBad = [];
      const plans = {};
      for (const seat of blue) {
        const v = prep.selectStrategyPrepView({ roster, heroLookup: heroes.heroById, focusSeat: seat });
        const actual = t3(players[seat].plan ? players[seat].plan.buildPath : []);
        plans[seat] = actual;
        if (v.previews["${expected}"].core.join(",") !== actual) planBad.push(seat + ":" + v.previews["${expected}"].core.join(",") + " vs " + actual);
        const s = v.seats.find((x) => x.seat === seat);
        if (!s || s.arch !== players[seat].arch || s.seatRole !== players[seat].seatRole) planBad.push(seat + ":arch/role");
      }
      const view = ps.useProfileStore.getState().activeMatchView();
      return JSON.stringify({ ok: true, ts: snap.ts, strat, labels, expectLabel: meta["${expected}"].label, planBad, plans, saved: savedStrategy(), phase: view ? view.phase : null });
    }
    await sleep(100);
  }
  return JSON.stringify({ ok: false });
`;

const WAIT_TS = (ts, limitS) => `
  ${MODS}
  const gs = await import(B + "/src/useGameStore.js");
  for (let i = 0; i < ${limitS * 4}; i++) {
    const snap = gs.useGameStore.getState().snapshot;
    if (snap && snap.ts >= ${ts}) {
      const players = snap.items ? snap.items.players : {};
      return JSON.stringify({ ok: true, ts: snap.ts, strat: Object.fromEntries(Object.keys(players).sort().map((id) => [id, players[id].strategy])),
        purchases: (snap.items ? snap.items.purchases : []).map((e) => [e.seq, e.t, e.playerId, e.action, e.itemId, e.cost, e.unspentAfter].join("|")) });
    }
    await sleep(250);
  }
  return JSON.stringify({ ok: false });
`;

const CLICK_RATE = (label) => `const b = [...document.querySelectorAll("button")].find((x) => (x.innerText || "").trim() === "${label}"); if (b) b.click(); return JSON.stringify({ ok: !!b });`;

async function shot(chrome, name) {
  const data = await chrome.send("Page.captureScreenshot", { format: "png" });
  const file = resolve(SHOT_DIR, name);
  writeFileSync(file, Buffer.from(data.data, "base64"));
  note(`   截圖 ${relative(ROOT, file).replace(/\\/g, "/")}`);
}
const viewport = (chrome, w, h, mobile) => chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });

const result = await runGate({
  name: "出裝策略（M3d）真實流程",
  timeoutMs: 2_300_000,
  run: async ({ chrome, url, ck, sleep }) => {
    const offUrl = url;
    const onUrl = `${url}${url.includes("?") ? "&" : "?"}itemsDev=1`;
    const offErrors = new Set();
    const errorsSince = (n) => chrome.consoleLines.slice(n).filter((l) => /^\[error\]/i.test(l));

    // ── OFF：新場次走到戰術頁 ─────────────────────────────────────────────────
    note("\n════ itemsV1 OFF｜首頁 → 賽前 → Ban/Pick → 戰術頁 ════");
    await viewport(chrome, 1366, 900, false);
    const c0 = chrome.consoleLines.length, p0 = chrome.pageErrors.length;
    await chrome.navigate(offUrl); await sleep(2500);
    await chrome.evaluate(`localStorage.removeItem("esmo.profile.v1"); return JSON.stringify({});`);
    await chrome.navigate(offUrl); await sleep(3000);
    if (!(await homeToTactic(chrome, sleep, ck))) return;
    for (const [w, h, mobile] of [[1366, 900, false], [390, 844, true]]) {
      await viewport(chrome, w, h, mobile); await sleep(800);
      const r = J(await chrome.evaluate(`${MODS} window.scrollTo(0, document.body.scrollHeight); document.querySelectorAll("*").forEach((el) => { if (el.scrollHeight > el.clientHeight + 40 && getComputedStyle(el).overflowY === "auto") el.scrollTop = el.scrollHeight; }); await sleep(300);
        const v = ps.useProfileStore.getState().activeMatchView();
        return JSON.stringify({ prep: document.querySelectorAll("[data-build-strategy-prep]").length, cards: document.querySelectorAll("[data-strategy]").length,
          phase: v ? v.phase : null, hasKey: !!(v && v.config && "buildStrategy" in v.config), overflow: document.documentElement.scrollWidth > innerWidth + 1 });`));
      ck(`OFF ${w}｜戰術頁沒有出裝策略區、本場設定沒有 buildStrategy`, r && r.prep === 0 && r.cards === 0 && r.phase === "tactic" && !r.hasKey, JSON.stringify(r));
      await shot(chrome, `off-tactic-${w}.png`);
    }
    for (const e of errorsSince(c0)) offErrors.add(e.slice(0, 120));
    ck("OFF｜page exception = 0", chrome.pageErrors.length === p0, chrome.pageErrors.slice(p0).join(" | "));

    // ── ON：重新整理（帶 itemsDev）→ 接回同一場的戰術頁 ─────────────────────────
    note("\n════ itemsV1 ON｜接回同一場的戰術頁 ════");
    const e0 = chrome.consoleLines.length, q0 = chrome.pageErrors.length;
    await viewport(chrome, 1366, 900, false);
    await chrome.navigate(onUrl); await sleep(3000);
    ck("ON｜首頁「返回進行中的比賽」", await resumeFromHome(chrome, sleep));
    ck("ON｜接回戰術頁", await waitFor(chrome, sleep, AT_TACTIC, 60000));
    ck("ON｜出裝策略區出現", await waitFor(chrome, sleep, `document.querySelector("[data-build-strategy-prep]")`, 20000));

    for (const [w, h, mobile] of WIDTHS) {
      note(`\n════ itemsV1 ON｜戰術頁 ${w}px ════`);
      await viewport(chrome, w, h, mobile); await sleep(900);
      const m = J(await chrome.evaluate(MEASURE_TACTIC));
      if (!m?.ok) { ck(`ON ${w}｜量測`, false, JSON.stringify(m)); continue; }
      note(`   版面 ${m.layout}　卡寬 ${m.widths.join("/")}　預覽 ${m.focus}（${m.arch}，核心預覽 ${m.spread} 種）　已選 ${m.checked.join(",")}　本場設定 ${m.saved}`);
      ck(`ON ${w}｜五張卡依序（標準／前期壓制／後期成型／反制優先／保命優先），名稱、白話說明、四項傾向、三件核心＝selector`,
        m.count === 5 && m.order.join() === STRATEGIES.join() && m.bad.length === 0, m.bad.join(" "));
      ck(`ON ${w}｜沒有 select／dropdown，單選群組`, m.selects === 0 && m.radiogroups >= 2, JSON.stringify({ selects: m.selects, groups: m.radiogroups }));
      ck(`ON ${w}｜沒選時預設「標準」；預設預覽英雄＝selector 挑的差異最多的一位（${m.defaultFocus}）`, m.checked.join() === "standard" && m.focus === m.defaultFocus, JSON.stringify({ checked: m.checked, focus: m.focus, defaultFocus: m.defaultFocus }));
      const oneRow = new Set(m.tops).size === 1;
      if (mobile) {
        ck(`ON ${w}｜手機橫向滑動（同一列、捲動區比可視寬）＋可點元素 ≥ 44（${m.touchCount} 個）`,
          m.layout === "swipe" && oneRow && m.swipe && m.swipe.sw > m.swipe.cw && m.small.length === 0, JSON.stringify({ layout: m.layout, tops: m.tops, swipe: m.swipe, small: m.small }));
      } else {
        ck(`ON ${w}｜桌機一排五張（同一列、每張 ≥ 120px）`, m.layout === "row" && oneRow && m.widths.every((x) => x >= 120), JSON.stringify({ tops: m.tops, widths: m.widths }));
      }
      ck(`ON ${w}｜不水平溢出（整頁與出裝策略區）`, !m.overflow && !m.secOverflow, `page=${m.overflow} section=${m.secOverflow}`);
      await chrome.evaluate(SCROLL_PREP);
      await shot(chrome, `tactic-${w}.png`);
    }

    // ── 390：五種策略逐一存入本場設定 ──────────────────────────────────────────
    note("\n════ ON 390｜五種策略逐一點選 ════");
    await viewport(chrome, 390, 844, true); await sleep(900);
    for (const id of [...STRATEGIES.slice(1), "standard", FINAL]) {
      const s = J(await chrome.evaluate(SELECT(id)));
      note(`   點 ${id} ⇒ 本場設定 ${s?.saved}　已選 ${s?.checked?.join(",")}　位置點 ${s?.dots}`);
      ck(`ON 390｜點「${id}」⇒ 只有這張 selected（含「已選擇」文字、滑到畫面內）、本場設定 buildStrategy＝${id}`,
        s?.ok && s.state === "selected" && s.badge && s.visible, JSON.stringify(s));
    }
    const f1 = J(await chrome.evaluate(FOCUS("b1")));
    ck("ON 390｜切換預覽英雄（b1）⇒ 五張卡的核心預覽跟著換、仍＝selector、說明文字換成該英雄定位", f1?.ok && f1.bad.length === 0 && f1.headerHasArch, JSON.stringify(f1));
    const best = f1?.defaultFocus ?? "b4";
    const maxSpread = f1?.spreads ? Math.max(...Object.values(f1.spreads)) : 0;
    const fd = J(await chrome.evaluate(FOCUS(best)));
    note(`   五人核心預覽差異 ${JSON.stringify(f1?.spreads)}　預設預覽 ${best}（${fd?.arch}）`);
    ck(`ON 390｜預設預覽英雄（${best}）＝五人中核心預覽差異最多（${fd?.distinct} 種）`,
      fd?.ok && fd.bad.length === 0 && fd.distinct === maxSpread && (maxSpread >= 2 || Object.values(f1.spreads).every((n) => n === 1)), JSON.stringify({ fd, spreads: f1?.spreads }));
    await chrome.evaluate(SCROLL_PREP);
    await shot(chrome, `tactic-selected-${FINAL}-390.png`);

    // ── 重新整理：接回戰術頁仍是所選 ──────────────────────────────────────────
    note("\n════ ON 390｜戰術頁重新整理 ════");
    await chrome.navigate(onUrl); await sleep(3000);
    ck("重新整理｜首頁「返回進行中的比賽」", await resumeFromHome(chrome, sleep));
    ck("重新整理｜接回戰術頁", await waitFor(chrome, sleep, `document.querySelector("[data-build-strategy-prep]")`, 60000));
    const afterReload = J(await chrome.evaluate(MEASURE_TACTIC));
    const vis = J(await chrome.evaluate(`const c = document.querySelector('[data-build-strategy-prep] [data-strategy="${FINAL}"]'); const s = c && c.closest("[data-strategy-layout]"); if (!c) return JSON.stringify({ visible: false }); const a = c.getBoundingClientRect(), b = s.getBoundingClientRect(); return JSON.stringify({ visible: a.left >= b.left - 2 && a.right <= b.right + 2 });`));
    ck(`重新整理｜仍是「${FINAL_LABEL}」（卡片 selected、本場設定不變、已選的卡自動滑進畫面）`,
      afterReload?.ok && afterReload.checked.join() === FINAL && afterReload.saved === FINAL && vis?.visible, JSON.stringify({ checked: afterReload?.checked, saved: afterReload?.saved, vis }));
    await chrome.evaluate(SCROLL_PREP);
    await shot(chrome, `tactic-restored-390.png`);

    // ── 返回 Ban/Pick 再進戰術頁 ──────────────────────────────────────────────
    note("\n════ ON｜戰術頁 → 返回 Ban/Pick → 再進戰術頁 ════");
    await viewport(chrome, 1366, 900, false); await sleep(900);
    await chrome.evaluate(clickText("← 返回"));
    if (await draftToTactic(chrome, sleep, ck, "返回 Ban/Pick")) {
      await waitFor(chrome, sleep, `document.querySelector("[data-build-strategy-prep]")`, 20000);
      const back = J(await chrome.evaluate(MEASURE_TACTIC));
      ck(`返回 Ban/Pick 再進戰術頁｜仍是「${FINAL_LABEL}」`, back?.ok && back.checked.join() === FINAL && back.saved === FINAL, JSON.stringify({ checked: back?.checked, saved: back?.saved }));
    }
    const tacticPreview = J(await chrome.evaluate(`const c = document.querySelector('[data-build-strategy-prep] [data-strategy="${FINAL}"]'); const f = document.querySelector('[data-build-strategy-prep] [data-focus-seat][aria-checked="true"]'); return JSON.stringify({ core: c ? c.dataset.previewCore : null, focus: f ? f.dataset.focusSeat : null });`));

    // ── 開始載入 → 載入頁鎖定 → 戰鬥 ─────────────────────────────────────────
    note("\n════ ON 390｜開始載入 → 載入頁 → 戰鬥 ════");
    await viewport(chrome, 390, 844, true); await sleep(900);
    await chrome.evaluate(clickText("開始載入"));
    const locked = J(await chrome.evaluate(WAIT_LOCKED(30000)));
    if (locked?.id) await shot(chrome, `loading-locked-390.png`);
    note(`   載入頁：${JSON.stringify(locked)}`);
    ck(`載入頁｜顯示「${FINAL_LABEL}」本場已鎖定`, locked?.id === FINAL && (locked.text ?? "").includes(FINAL_LABEL) && (locked.text ?? "").includes("本場已鎖定"), JSON.stringify(locked));
    const inBattle = await waitFor(chrome, sleep, `document.querySelector('[data-testid="battle-hud"]') && document.querySelector("canvas")`, 240000, 300);
    ck("戰場掛上", inBattle);
    if (!inBattle) return;
    const b1 = J(await chrome.evaluate(BATTLE(FINAL)));
    note(`   ts ${b1?.ts}　策略 ${JSON.stringify(b1?.strat)}　面板策略名 ${b1?.labels?.join(",")}　開局核心 ${JSON.stringify(b1?.plans)}`);
    const blueOk = b1?.ok && ["b1", "b2", "b3", "b4", "b5"].every((id) => b1.strat[id] === FINAL);
    const redOk = b1?.ok && ["r1", "r2", "r3", "r4", "r5"].every((id) => b1.strat[id] === "standard");
    ck(`戰鬥｜我方五人 AI 出裝策略＝${FINAL}、紅方＝standard；本場設定仍是 ${FINAL}（phase battle）`, blueOk && redOk && b1.saved === FINAL && b1.phase === "battle", JSON.stringify(b1));
    ck(`戰鬥｜英雄面板的策略名稱＝卡片名稱（${FINAL_LABEL}）`, b1?.ok && b1.labels.every((l) => l === b1.expectLabel), JSON.stringify(b1?.labels));
    ck(`戰鬥｜我方五席開局計畫的前三件核心＝戰術頁預覽（開局 ts ${b1?.ts}）`, b1?.ok && b1.planBad.length === 0 && b1.ts <= 30, (b1?.planBad ?? []).join(" "));
    const actualFocus = b1?.plans?.[tacticPreview?.focus] ?? null;
    ck(`戰鬥｜戰術頁最後看到的「${FINAL_LABEL}」卡片預覽（${tacticPreview?.focus}）＝該英雄實際開局計畫`, !!tacticPreview?.core && tacticPreview.core === actualFocus, `${tacticPreview?.core} vs ${actualFocus}`);

    //  手機英雄面板：策略名稱
    await chrome.evaluate(`const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); document.querySelector("[data-items-chip]")?.click(); await sleep(400);
      document.querySelector('[data-pick-seat="b4"]')?.click(); await sleep(400); document.querySelector('[data-open-hero-detail="b4"]')?.click(); await sleep(700); return JSON.stringify({});`);
    const chip = J(await chrome.evaluate(`const d = document.querySelector('[data-hero-item-detail="embedded"]'); return JSON.stringify({ text: d ? d.innerText.slice(0, 200) : null });`));
    ck(`戰鬥｜手機英雄裝備詳情顯示「${FINAL_LABEL}策略」`, (chip?.text ?? "").includes(`${FINAL_LABEL}策略`), String(chip?.text).slice(0, 80));
    await shot(chrome, `battle-hero-strategy-390.png`);
    await chrome.evaluate(`const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); for (let i = 0; i < 3; i++) { const c = document.querySelector("[data-hero-sheet] button[aria-label='關閉']") || document.querySelector("[data-mobile-items-sheet] button[aria-label='關閉裝備']"); if (!c) break; c.click(); await sleep(250); } return JSON.stringify({});`);

    // ── 戰鬥中重新整理：策略不變、購買紀錄逐筆相同 ────────────────────────────
    note(`\n════ ON｜戰鬥推進到 ${REFRESH_AT_TS}s → 重新整理 → 恢復 ════`);
    await chrome.evaluate(CLICK_RATE("4×"));
    const before = J(await chrome.evaluate(WAIT_TS(REFRESH_AT_TS, 400)));
    ck(`戰鬥｜推進到 ${REFRESH_AT_TS}s`, before?.ok, JSON.stringify(before?.ts));
    if (!before?.ok) return;
    await chrome.evaluate(CLICK_RATE("1×"));
    await sleep(1500);
    await chrome.navigate(onUrl); await sleep(3000);
    ck("戰鬥中重新整理｜首頁「返回進行中的比賽」", await resumeFromHome(chrome, sleep));
    const relock = J(await chrome.evaluate(WAIT_LOCKED(60000)));
    if (relock?.id) await shot(chrome, `loading-locked-resume-390.png`);
    note(`   恢復時：${JSON.stringify(relock)}`);
    ck("戰鬥中重新整理｜恢復路徑上策略仍鎖定（經過載入頁時顯示所選）或直接回到戰場", relock && (relock.id === FINAL || relock.battle), JSON.stringify(relock));
    ck("戰鬥中重新整理｜戰場掛上", await waitFor(chrome, sleep, `document.querySelector('[data-testid="battle-hud"]') && document.querySelector("canvas")`, 240000, 300));
    const after = J(await chrome.evaluate(WAIT_TS(before.ts + 10, 400)));
    const beforeMap = new Map(before.purchases.map((row) => [row.split("|")[0], row]));
    const common = after?.ok ? after.purchases.filter((row) => beforeMap.has(row.split("|")[0])) : [];
    const mismatch = common.filter((row) => beforeMap.get(row.split("|")[0]) !== row);
    note(`   恢復前 ts ${before.ts}（${before.purchases.length} 筆）　恢復後 ts ${after?.ts}（${after?.purchases?.length} 筆）　共同 ${common.length} 筆、不同 ${mismatch.length} 筆`);
    ck("戰鬥中重新整理｜恢復後我方仍＝所選、紅方＝standard", after?.ok && ["b1", "b2", "b3", "b4", "b5"].every((id) => after.strat[id] === FINAL) && ["r1", "r2", "r3", "r4", "r5"].every((id) => after.strat[id] === "standard"), JSON.stringify(after?.strat));
    ck("戰鬥中重新整理｜同 seed＋同策略：恢復前後同一筆購買紀錄逐欄相同（≥ 10 筆重疊）", after?.ok && common.length >= 10 && mismatch.length === 0, mismatch.slice(0, 3).join(" ／ "));

    const newErrors = errorsSince(e0).map((e) => e.slice(0, 120)).filter((e) => !offErrors.has(e));
    ck("ON｜page exception = 0、console error 不比 OFF 多", chrome.pageErrors.length === q0 && newErrors.length === 0, [...chrome.pageErrors.slice(q0), ...newErrors].slice(0, 3).join(" | "));
  },
});

writeFileSync(resolve(SHOT_DIR, `measurements${TAG}.txt`), report.join("\n"), "utf8");
console.log(`\n量測明細：${relative(ROOT, resolve(SHOT_DIR, `measurements${TAG}.txt`)).replace(/\\/g, "/")}`);
finishGate(result);
