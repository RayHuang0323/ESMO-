#!/usr/bin/env node
// ============================================================================
//  tools/browser_review_moba_items_m3_closure.mjs — MOBA Item System M3 Closure：一場完整流程的資料一致性
//
//  執行：node tools/browser/run-gate.mjs tools/browser_review_moba_items_m3_closure.mjs --timeout 1200000
//
//  同一場比賽（DEV ?itemsDev=1，1366×900，不切倍速）：
//    Tactic 選「前期壓制」→ Loading（本場已鎖定）→ Battle（AI 買裝；頁面逐 tick 記錄背包／金錢／購買事件）
//    → Battle HUD（十人裝備點＝同一 ts 的 selectHudItems）→ Hero Item Detail（金錢／6 格／策略＝同一 ts 的 view-model）
//    → 快速完成 → Result（勝負／時長＝Replay resultSummary；記錄 Result 是否帶裝備）→ Replay
//  一致性：
//    buildStrategy：本場設定＝引擎 snapshot＝HUD 詳情策略名＝Replay itemMeta＝Replay 策略籤
//    gold：詳情可用金＝snapshot；每筆購買的 unspentAfter：Replay＝live 記錄
//    inventory：Replay fold(t)＝每個 live 記錄的背包
//    purchase events：Replay 事件逐欄＝live 記錄（seq 從 baseline 到終局 lastSeq 無缺漏）
//    final build：終局 snapshot 背包＝HUD selector＝Replay fold(duration)＝Replay 畫面 6 格
//    console：page exception 0、console error 0
//  ⚠ chrome.evaluate 的字串裡不能有反引號；回傳一律包成物件。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { runGate, finishGate } from "./browser/harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHOT_DIR = resolve(ROOT, process.env.ESMO_REVIEW_OUT ?? "review/moba-items-m3-closure");
mkdirSync(SHOT_DIR, { recursive: true });
const MID_TS = Number(process.env.ESMO_CLOSURE_MID_TS ?? 300);
const FOCUS = process.env.ESMO_CLOSURE_SEAT ?? "b4";
const TARGET_URL = process.env.ESMO_EXTERNAL_URL?.trim() || null;
const BLUE = ["b1", "b2", "b3", "b4", "b5"], RED = ["r1", "r2", "r3", "r4", "r5"];

const report = [];
const note = (line) => { report.push(line); console.log(line); };
const J = (raw) => { try { return JSON.parse(String(raw).replace(/^"|"$/g, "")); } catch { return null; } };

const BASE = `const B = location.pathname.endsWith("/") ? location.pathname.slice(0, -1) : location.pathname; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));`;
const MODS = `
  ${BASE}
  const gs = await import(B + "/src/useGameStore.js");
  const ps = await import(B + "/src/platform/profileStore.js");
  const vm = await import(B + "/src/battle/moba/items/itemsViewModel.js");
  const sel = await import(B + "/src/battle/moba/items/itemsUiSelectors.js");
  const rb = await import(B + "/src/battle/moba/replay/replayBuffer.js");
  const rp = await import(B + "/src/battle/moba/items/itemReplay.js");
  const contract = await import(B + "/src/platform/contracts/mobaReplay.js");
  const inv = (snap) => JSON.stringify(Object.fromEntries(Object.entries(snap.items.players).map((e) => [e[0], e[1].inventory])));
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
const IN_BATTLE = `document.querySelector('[data-testid="battle-hud"]') && document.querySelector("canvas")`;

async function realClick(chrome, sel) {
  const p = J(await chrome.evaluate(`const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && !n.disabled; }); if (!el) return JSON.stringify(null); const r = el.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });`));
  if (!p) return null;
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    await chrome.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", clickCount: 1 });
  }
  return p;
}

async function homeToTactic(chrome, sleep, ck) {
  ck("流程｜首頁有 MOBA 入口", await waitFor(chrome, sleep, `document.querySelector('[data-testid="home-mode-moba"]')`, 90000));
  await chrome.evaluate(clickSel(`[data-testid="home-mode-moba"]`));
  ck("流程｜進入賽前頁", await waitFor(chrome, sleep, `document.querySelector('[data-testid="prep-primary-action"]')`, 60000));
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
  const inBanPick = await waitFor(chrome, sleep, `document.querySelector('[data-testid="hero-grid-scroll"]')`, 90000);
  ck("流程｜進入 Ban/Pick", inBanPick);
  if (!inBanPick) return false;
  let picks = 0;
  const pickDeadline = Date.now() + 300000;
  while (Date.now() < pickDeadline) {
    if (J(await chrome.evaluate(`const b = document.querySelector('[data-testid="confirm-draft"]'); return JSON.stringify({ v: !!b && !b.disabled });`))?.v) break;
    if (await realClick(chrome, `[data-testid="hero-choose"]`)) picks += 1;
    await sleep(1200);
  }
  const canConfirm = J(await chrome.evaluate(`const b = document.querySelector('[data-testid="confirm-draft"]'); return JSON.stringify({ v: !!b && !b.disabled });`))?.v;
  ck("流程｜選角完成", !!canConfirm, `hero clicks ${picks}`);
  if (!canConfirm) return false;
  await chrome.evaluate(clickSel(`[data-testid="confirm-draft"]`));
  const atTactic = await waitFor(chrome, sleep, AT_TACTIC, 60000);
  ck("流程｜進入戰術頁", atTactic);
  return atTactic;
}

/** 頁面內每 30ms 記錄：背包（依 ts）、各席位可用金（依 ts）、購買事件（依 seq，全欄位）。 */
const RECORDER = `
  ${MODS}
  window.__closure = window.__closure || { inv: {}, gold: {}, events: {}, lastSeq: -1 };
  if (!window.__closureTimer) {
    window.__closureTimer = setInterval(() => {
      const s = gs.useGameStore.getState().snapshot;
      if (!s || !s.items) return;
      const k = String(s.ts);
      if (!(k in window.__closure.inv)) {
        window.__closure.inv[k] = inv(s);
        window.__closure.gold[k] = JSON.stringify(Object.fromEntries(Object.entries(s.items.players).map((e) => [e[0], e[1].gold.unspent])));
      }
      for (const e of s.items.purchases) window.__closure.events[String(e.seq)] = [e.seq, e.t, e.playerId, e.action, e.itemId, e.cost, e.unspentAfter].join("|");
      window.__closure.lastSeq = s.items.lastSeq;
    }, 30);
  }
  return JSON.stringify({ ok: true });
`;

const WAIT_TS = (ts, limitS) => `
  ${MODS}
  for (let i = 0; i < ${limitS * 4}; i++) {
    const s = gs.useGameStore.getState().snapshot;
    if (s && s.ts >= ${ts}) return JSON.stringify({ ok: true, ts: s.ts, items: !!s.items });
    await sleep(250);
  }
  return JSON.stringify({ ok: false });
`;

/** Battle HUD：十人裝備點（data-seat-pips）＝同一 ts 的 selectHudItems。ts 在讀 DOM 前後不變才採用。 */
const HUD_CHECK = `
  ${MODS}
  for (let attempt = 0; attempt < 40; attempt++) {
    const before = gs.useGameStore.getState().snapshot;
    await sleep(60);
    const pips = Object.fromEntries([...document.querySelectorAll("[data-seat] [data-seat-pips]")].map((el) => [el.closest("[data-seat]").dataset.seat, el.dataset.seatPips]));
    const after = gs.useGameStore.getState().snapshot;
    if (!before || before !== after) continue;
    const hud = sel.selectHudItems(after);
    const bad = Object.keys(hud).filter((seat) => pips[seat] !== undefined && pips[seat] !== hud[seat].slots.map((x) => x.itemId ?? "").join(","));
    const invBad = Object.keys(hud).filter((seat) => JSON.stringify(hud[seat].slots.map((x) => x.itemId)) !== JSON.stringify(after.items.players[seat].inventory));
    return JSON.stringify({ ok: true, ts: after.ts, seatsShown: Object.keys(pips).length, bad, invBad, itemsOn: !!document.querySelector(".items-on") });
  }
  return JSON.stringify({ ok: false, why: "snapshot kept changing" });
`;

/** Hero Item Detail（桌機：十人列 → 頭像 →「裝備」分頁）：金錢／6 格／策略名＝同一 ts 的 view-model。 */
const DETAIL_CHECK = (seat) => `
  ${MODS}
  const q = (s) => document.querySelector(s);
  const seatBtn = q('.observer-teams [data-seat="${seat}"]');
  if (!seatBtn) return JSON.stringify({ ok: false, why: "no rail seat" });
  seatBtn.click(); await sleep(350);
  const identity = q(".observer-identity"); if (identity) identity.click(); await sleep(450);
  const tab = q('[data-hero-sheet-tab="items"]');
  if (!tab) return JSON.stringify({ ok: false, why: "no items tab" });
  tab.click(); await sleep(450);
  for (let i = 0; i < 400; i++) {
    const d = q('[data-hero-item-detail="embedded"]');
    const snap = gs.useGameStore.getState().snapshot;
    if (d && snap && Number(d.dataset.itemsTs) === snap.ts) {
      const view = vm.selectPlayerItemsView(snap, d.dataset.playerId);
      const goldText = (d.querySelector("[aria-label^='可用金錢']") || {}).textContent || "";
      const slotLabels = [...d.querySelectorAll('[role="list"] button[aria-label]')].slice(0, 6).map((b) => b.getAttribute("aria-label"));
      const text = d.innerText || "";
      return JSON.stringify({ ok: true, ts: snap.ts, seat: d.dataset.playerId,
        goldShown: Number(goldText.replace(/[^0-9]/g, "")), goldView: view.gold.unspent, goldSnap: snap.items.players[d.dataset.playerId].gold.unspent,
        slotsOk: JSON.stringify(slotLabels) === JSON.stringify(view.slots.map((s) => s.itemId ? s.name : "空格")),
        slotsView: view.slots.map((s) => s.itemId ?? "").join(","), invSnap: snap.items.players[d.dataset.playerId].inventory.map((x) => x ?? "").join(","),
        strategyText: text.includes(view.strategyLabel + "策略"), strategy: view.strategy });
    }
    await sleep(5);
  }
  return JSON.stringify({ ok: false, why: "ts never matched" });
`;
const CLOSE_SHEET = `const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); for (let i = 0; i < 3; i++) { const c = document.querySelector("[data-hero-sheet] button[aria-label='關閉']"); if (!c) break; c.click(); await sleep(250); } return JSON.stringify({ ok: true });`;

const FINAL_RECORD = `
  ${MODS}
  const s = gs.useGameStore.getState().snapshot;
  const bs = await import(B + "/src/battle/battleStore.js");
  const result = bs.useBattleStore.getState().result;
  window.__closureFinal = s && s.items ? {
    ts: s.ts, over: s.over, lastSeq: s.items.lastSeq, inv: inv(s),
    hudInv: JSON.stringify(Object.fromEntries(Object.entries(sel.selectHudItems(s)).map((e) => [e[0], e[1].slots.map((x) => x.itemId)]))),
    gold: Object.fromEntries(Object.entries(s.items.players).map((e) => [e[0], e[1].gold])),
    strategies: Object.fromEntries(Object.entries(s.items.players).map((e) => [e[0], e[1].strategy])),
    result: result ? { winner: result.winner, duration: result.duration, score: result.score, keys: Object.keys(result), playerKeys: result.players && result.players[0] ? Object.keys(result.players[0]) : [] } : null,
  } : null;
  const f = window.__closureFinal;
  return JSON.stringify(f ? { ts: f.ts, over: f.over, lastSeq: f.lastSeq, result: f.result, recordedTicks: Object.keys(window.__closure.inv).length, recordedEvents: Object.keys(window.__closure.events).length } : null);
`;

const REPLAY_CONSISTENCY = `
  ${MODS}
  const replay = rb.getCurrentReplay();
  const v = contract.validateMobaReplay(replay);
  const items = rp.decodeItemsReplay(replay);
  const live = window.__closure, fin = window.__closureFinal;
  if (!items || !fin) return JSON.stringify({ ok: false, why: "no items replay or final record", valid: v.ok });
  //  purchase events：Replay 事件逐欄＝live 記錄；seq 從 baseline 之後到終局 lastSeq 無缺漏
  const replayRows = items.events.map((e) => [e.seq, e.t, e.playerId, e.action, e.itemId, e.cost, e.unspentAfter].join("|"));
  const bySeq = new Map(replayRows.map((r) => [r.split("|")[0], r]));
  let eventCompared = 0; const eventBad = [];
  for (const [k, row] of Object.entries(live.events)) {
    if (Number(k) <= items.baseline.seq) continue;
    if (!bySeq.has(k)) continue;
    eventCompared++;
    if (bySeq.get(k) !== row) eventBad.push(row + " vs " + bySeq.get(k));
  }
  const expectedCount = fin.lastSeq - items.baseline.seq;
  const seqs = items.events.map((e) => e.seq);
  const contiguous = seqs.every((sq, i) => sq === items.baseline.seq + 1 + i);
  //  inventory：fold(t)＝每個 live 記錄的背包
  let invCompared = 0; const invBad = [];
  for (const [k, row] of Object.entries(live.inv)) {
    const t = Number(k);
    if (t < items.baseline.t) continue;
    invCompared++;
    if (JSON.stringify(rp.foldPurchasesAt(items, t)) !== row) invBad.push(k);
  }
  //  final build：終局 snapshot＝HUD selector＝fold(duration)
  const foldFinal = JSON.stringify(rp.foldPurchasesAt(items, replay.duration));
  //  gold：各席位最後一筆購買的 unspentAfter（Replay）＝ live 記錄的同一筆
  const lastBuyGold = {};
  for (const e of items.events) lastBuyGold[e.playerId] = e.unspentAfter;
  const strategies = items.strategyByPlayer;
  return JSON.stringify({
    ok: true, valid: v.ok, errors: v.errors, start: replay.frames[0].t, duration: replay.duration, baseline: items.baseline.seq, gaps: items.gaps,
    events: items.events.length, expectedCount, contiguous, eventCompared, eventBad: eventBad.slice(0, 3), eventBadCount: eventBad.length,
    invCompared, invBadCount: invBad.length, invBad: invBad.slice(0, 5),
    finalSnapEqualsFold: foldFinal === fin.inv, finalHudEqualsSnap: fin.hudInv === fin.inv,
    strategies, strategiesMatch: JSON.stringify(strategies) === JSON.stringify(fin.strategies),
    summary: replay.resultSummary, result: fin.result, lastBuyGold,
    rejected: rp.foldPurchasesDetailed(items, Infinity).rejected,
  });
`;

/** Replay 畫面：策略籤、選英雄後跳到最後一筆關鍵購買 ⇒ 6 格＝fold；終局時間 6 格＝終局 snapshot。 */
const REPLAY_UI = (seat) => `
  ${MODS}
  const q = (s) => document.querySelector(s);
  const replay = rb.getCurrentReplay();
  const items = rp.decodeItemsReplay(replay);
  const playBtn = q('[data-testid="replay-play-toggle"]');
  if (playBtn && (playBtn.innerText || "").includes("暫停")) { playBtn.click(); await sleep(400); }
  if (!q("[data-replay-item-panel]")) { const tg = q('[data-testid="replay-items-toggle"]'); if (tg) tg.click(); await sleep(400); }
  const seatBtn = q('[data-replay-item-seat="${seat}"]');
  if (!seatBtn) return JSON.stringify({ ok: false, why: "no seat" });
  if (seatBtn.getAttribute("aria-pressed") !== "true") { seatBtn.click(); await sleep(400); }
  const chips = [...document.querySelectorAll("[data-replay-seek-purchase]")];
  const slots = () => (q("[data-replay-slots]") || { dataset: {} }).dataset.replaySlots;
  let chip = null;
  if (chips.length) {
    const last = chips[chips.length - 1]; last.click(); await sleep(400);
    const t = Number(last.dataset.t);
    chip = { t, slots: slots(), expect: rp.foldPurchasesAt(items, t)["${seat}"].map((x) => x ?? "").join(",") };
  }
  const endBtn = [...document.querySelectorAll("button")].find((b) => (b.innerText || "").includes("+10s"));
  const slider = q('input[aria-label="重播時間軸"]');
  for (let i = 0; i < 400 && Number(slider.value) < replay.duration; i++) { endBtn.click(); await sleep(15); }
  await sleep(400);
  const fin = window.__closureFinal;
  const endSlots = slots();
  const finSeat = JSON.parse(fin.inv)["${seat}"].map((x) => x ?? "").join(",");
  const strat = q("[data-replay-strategy]");
  return JSON.stringify({ ok: true, chip, endT: Number(slider.value), endSlots, finSeat, endOk: endSlots === finSeat,
    strategy: strat ? { blue: strat.dataset.blue, red: strat.dataset.red } : null,
    stage: (q("[data-replay-stage]") || { dataset: {} }).dataset.replayStage || null });
`;

async function shot(chrome, name) {
  const data = await chrome.send("Page.captureScreenshot", { format: "png" });
  const file = resolve(SHOT_DIR, name);
  writeFileSync(file, Buffer.from(data.data, "base64"));
  note(`   截圖 ${relative(ROOT, file).replace(/\\/g, "/")}`);
}

const result = await runGate({
  name: "MOBA Item System M3 Closure｜一場完整流程資料一致性",
  timeoutMs: 1_150_000,
  externalUrl: TARGET_URL,
  run: async ({ chrome, url, ck, sleep }) => {
    const onUrl = TARGET_URL ?? `${url}${url.includes("?") ? "&" : "?"}itemsDev=1`;
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    const c0 = chrome.consoleLines.length, p0 = chrome.pageErrors.length;
    await chrome.navigate(onUrl); await sleep(2500);
    await chrome.evaluate(`localStorage.removeItem("esmo.profile.v1"); return JSON.stringify({});`);
    await chrome.navigate(onUrl); await sleep(3000);

    // ── Tactic ─────────────────────────────────────────────────────────────
    note("\n════ Tactic → Loading ════");
    if (!(await homeToTactic(chrome, sleep, ck))) return;
    await chrome.evaluate(clickSel(`[data-build-strategy-prep] [data-strategy="early"]`));
    const saved = await waitFor(chrome, sleep, `document.querySelector('[data-build-strategy-prep] [data-strategy="early"][aria-checked="true"]')`, 10000, 200);
    ck("Tactic｜選「前期壓制」並存進本場設定", saved);
    await shot(chrome, "closure-tactic-1366.png");
    await chrome.evaluate(clickText("開始載入"));

    // ── Loading ────────────────────────────────────────────────────────────
    const locked = J(await chrome.evaluate(`for (let i = 0; i < 600; i++) { const el = document.querySelector("[data-strategy-locked]"); if (el) return JSON.stringify({ id: el.dataset.strategyLocked, text: el.innerText }); if (document.querySelector('[data-testid="battle-hud"]')) return JSON.stringify({ id: null, battle: true }); await new Promise((r) => setTimeout(r, 50)); } return JSON.stringify({ id: null });`));
    ck("Loading｜本場出裝策略已鎖定為 early", locked?.id === "early" && /本場已鎖定/.test(locked.text ?? ""), JSON.stringify(locked));

    // ── Battle ─────────────────────────────────────────────────────────────
    note("\n════ Battle（AI 買裝，不切倍速）════");
    ck("Battle｜戰場掛上", await waitFor(chrome, sleep, IN_BATTLE, 240000, 300));
    await chrome.evaluate(RECORDER);
    const start = J(await chrome.evaluate(`${MODS} const s = gs.useGameStore.getState().snapshot; const v = ps.useProfileStore.getState().activeMatchView(); return JSON.stringify({ ts: s ? s.ts : null, strategies: s && s.items ? Object.fromEntries(Object.entries(s.items.players).map((e) => [e[0], e[1].strategy])) : null, saved: v && v.config ? v.config.buildStrategy : null });`));
    ck("Battle｜本場設定 buildStrategy＝early；引擎我方五人 early、紅方五人 standard",
      start?.saved === "early" && BLUE.every((id) => start.strategies?.[id] === "early") && RED.every((id) => start.strategies?.[id] === "standard"), JSON.stringify(start));
    const mid = J(await chrome.evaluate(WAIT_TS(MID_TS, 420)));
    ck(`Battle｜推進到 ${MID_TS}s（AI 已買裝）`, mid?.ok && mid.items, JSON.stringify(mid));
    if (!mid?.ok) return;

    // ── Battle HUD ─────────────────────────────────────────────────────────
    const hud = J(await chrome.evaluate(HUD_CHECK));
    note(`   HUD：ts ${hud?.ts}　顯示 ${hud?.seatsShown} 席裝備點`);
    ck("Battle HUD｜十人裝備點＝同一 ts 的 selectHudItems，selector 6 格＝snapshot 背包",
      hud?.ok && hud.itemsOn && hud.seatsShown === 10 && hud.bad.length === 0 && hud.invBad.length === 0, JSON.stringify(hud));
    await shot(chrome, "closure-hud-1366.png");

    // ── Hero Item Detail ───────────────────────────────────────────────────
    const detail = J(await chrome.evaluate(DETAIL_CHECK(FOCUS)));
    note(`   英雄詳情：${detail?.seat} ts ${detail?.ts}　金錢 ${detail?.goldShown}　6 格 ${detail?.slotsView}`);
    ck(`Hero Item Detail｜${FOCUS} 可用金＝view-model＝snapshot、6 格＝snapshot 背包、策略名「前期壓制策略」（同一 ts）`,
      detail?.ok && detail.goldShown === detail.goldView && detail.goldView === detail.goldSnap && detail.slotsOk
      && detail.slotsView === detail.invSnap && detail.strategyText && detail.strategy === "early", JSON.stringify(detail));
    await shot(chrome, "closure-detail-1366.png");
    await chrome.evaluate(CLOSE_SHEET);

    // ── 快速完成 → Result ─────────────────────────────────────────────────
    note("\n════ 快速完成 → Result ════");
    await chrome.evaluate(`window.confirm = () => true; return JSON.stringify({});`);
    ck("Result｜快速完成", J(await chrome.evaluate(clickSel(`[data-testid="quick-finish-match"]`)))?.ok);
    const ended = await waitFor(chrome, sleep, `[...document.querySelectorAll("button")].some((b) => (b.innerText || "").includes("觀看重播"))`, 300000, 500);
    ck("Result｜比賽結束、Result 畫面有「觀看重播」", ended);
    if (!ended) return;
    await sleep(900);
    const fin = J(await chrome.evaluate(FINAL_RECORD));
    note(`   終局 ts ${fin?.ts}　lastSeq ${fin?.lastSeq}　live 記錄 ${fin?.recordedTicks} tick／${fin?.recordedEvents} 筆事件`);
    note(`   BattleResult 欄位：${fin?.result?.keys?.join(",")}　players[0] 欄位：${fin?.result?.playerKeys?.join(",")}`);
    ck("Result｜終局 snapshot over、BattleResult 已產生", fin?.over && !!fin.result, JSON.stringify(fin?.result));
    await shot(chrome, "closure-result-1366.png");

    // ── Replay ─────────────────────────────────────────────────────────────
    note("\n════ Replay ════");
    await chrome.evaluate(clickText("觀看重播"));
    const opened = await waitFor(chrome, sleep, `document.querySelector('[aria-label="比賽重播"] input[aria-label="重播時間軸"]') && (document.querySelector("[data-replay-presentation] canvas") || document.querySelector('[data-replay-stage="2d"] svg'))`, 150000, 300);
    ck("Replay｜開啟", opened);
    if (!opened) return;
    await sleep(1500);
    const r = J(await chrome.evaluate(REPLAY_CONSISTENCY));
    note(`   Replay：起點 ${r?.start}　長度 ${r?.duration}　baseline seq ${r?.baseline}　事件 ${r?.events}（應 ${r?.expectedCount}）　gaps ${r?.gaps}`);
    note(`   事件逐欄比對 ${r?.eventCompared} 筆、不同 ${r?.eventBadCount}；背包比對 ${r?.invCompared} tick、不同 ${r?.invBadCount}`);
    ck("Replay｜契約合法、事件數＝終局 lastSeq − baseline、seq 連續無缺漏、沒有被拒絕的購買",
      r?.ok && r.valid && r.events === r.expectedCount && r.contiguous && r.gaps === 0 && r.rejected === 0, JSON.stringify(r));
    ck("purchase events｜Replay 事件逐欄（seq／t／席位／動作／物品／花費／購買後可用金）＝戰鬥中 live 記錄",
      r?.ok && r.eventCompared >= 20 && r.eventBadCount === 0, JSON.stringify({ compared: r?.eventCompared, bad: r?.eventBad }));
    ck("inventory｜Replay fold(t)＝戰鬥中每個 live 記錄的背包",
      r?.ok && r.invCompared >= 100 && r.invBadCount === 0, JSON.stringify({ compared: r?.invCompared, bad: r?.invBad }));
    ck("final build｜終局 snapshot 背包＝HUD selector＝Replay fold(duration)", r?.ok && r.finalSnapEqualsFold && r.finalHudEqualsSnap);
    ck("buildStrategy｜Replay itemMeta 策略＝終局引擎策略（我方 early、紅方 standard）",
      r?.ok && r.strategiesMatch && BLUE.every((id) => r.strategies[id] === "early") && RED.every((id) => r.strategies[id] === "standard"), JSON.stringify(r?.strategies));
    ck("Result × Replay｜勝方、時長、比分＝BattleResult",
      r?.ok && r.summary && r.result && r.summary.winner === r.result.winner && r.summary.duration === r.result.duration
      && JSON.stringify(r.summary.score) === JSON.stringify(r.result.score), JSON.stringify({ summary: r?.summary, result: r?.result }));
    const ui = J(await chrome.evaluate(REPLAY_UI(FOCUS)));
    note(`   Replay 畫面：模式 ${ui?.stage}　跳到 ${ui?.chip?.t}s 6 格 ${ui?.chip?.slots}　終局 ${ui?.endT}s 6 格 ${ui?.endSlots}`);
    ck(`Replay 畫面｜策略籤我方 early／紅方 standard；${FOCUS} 跳到最後一筆關鍵購買 6 格＝fold；拉到終局 6 格＝終局 snapshot`,
      ui?.ok && ui.strategy?.blue === "early" && ui.strategy?.red === "standard" && (!ui.chip || ui.chip.slots === ui.chip.expect) && ui.endOk, JSON.stringify(ui));
    await shot(chrome, "closure-replay-1366.png");

    const consoleErrors = chrome.consoleLines.slice(c0).filter((l) => /^\[error\]/i.test(l));
    ck(`console｜page exception 0、console error 0（${consoleErrors.length} 則）`, chrome.pageErrors.length === p0 && consoleErrors.length === 0,
      [...chrome.pageErrors.slice(p0), ...consoleErrors].slice(0, 3).join(" | "));
  },
});

writeFileSync(resolve(SHOT_DIR, "measurements.txt"), report.join("\n"), "utf8");
console.log(`\n量測明細：${relative(ROOT, resolve(SHOT_DIR, "measurements.txt")).replace(/\\/g, "/")}`);
finishGate(result);
