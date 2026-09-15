#!/usr/bin/env node
// ============================================================================
//  tools/browser_review_moba_items_m3e.mjs — 裝備重播（M3e）真實流程量測與截圖
//
//  分兩段跑（各自 < 10 分鐘）：
//    ESMO_M3E_PHASE=off node tools/browser/run-gate.mjs tools/browser_review_moba_items_m3e.mjs --timeout 900000
//    ESMO_M3E_PHASE=on  node tools/browser/run-gate.mjs tools/browser_review_moba_items_m3e.mjs --timeout 1200000
//
//  OFF（不帶 ?itemsDev=1）：真實流程打一場 → 快速完成 → 觀看重播。舊格式（沒有 itemMeta／purchases）
//    ⇒ 契約合法、沒有購買軌／裝備鈕／面板／策略籤、照常播放、不報錯；console error 存檔當基準。
//  ON（?itemsDev=1）：戰術頁選「前期壓制」→ 戰鬥 4 倍速，頁面每 30ms 記錄 live snapshot 的 10 人背包 →
//    戰鬥中重新整理 →「返回進行中的比賽」→ 再記錄 → 快速完成 → 觀看重播：
//    · 資料：契約合法、baseline＝第一格 frame、seq 無跳號、我方 early／紅方 standard、
//      foldPurchasesAt(T)＝每個記錄到的 live 背包、終局＝最後 snapshot、JSON 來回後標記與 fold 相同
//    · 1366／768／390／320：暫停 1.2 秒 t 與 6 格都不變；購買籤往後／往前跳 ⇒ 6 格＝fold；
//      點購買軌 ⇒ 跳到標記時間；繼續播放 t 前進；T3 標記 > 升級鞋 > 組件；策略籤；不溢出；手機可點元素 ≥ 44
//    · 關閉重播再打開：同一份資料、跳到同一筆購買的 6 格相同
//    · console error 不比 OFF 多
//  ⚠ chrome.evaluate 的字串裡不能有反引號；回傳一律包成物件。
// ============================================================================
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { runGate, finishGate } from "./browser/harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHOT_DIR = resolve(ROOT, process.env.ESMO_REVIEW_OUT ?? "review/moba-items-m3e");
mkdirSync(SHOT_DIR, { recursive: true });
const PHASE = process.env.ESMO_M3E_PHASE ?? "on";
const RESUME_AT = Number(process.env.ESMO_M3E_RESUME_TS ?? 150);
const AFTER_RESUME = Number(process.env.ESMO_M3E_AFTER_RESUME_S ?? 90);
const FOCUS_SEAT = process.env.ESMO_M3E_SEAT ?? "b4";
const WIDTHS = [[1366, 900, false], [768, 1024, false], [390, 844, true], [320, 720, true]];
const OFF_CONSOLE = resolve(SHOT_DIR, "off-console.json");

const report = [];
const note = (line) => { report.push(line); console.log(line); };
const J = (raw) => { try { return JSON.parse(String(raw).replace(/^"|"$/g, "")); } catch { return null; } };

const BASE = `const B = location.pathname.endsWith("/") ? location.pathname.slice(0, -1) : location.pathname; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));`;
const MODS = `
  ${BASE}
  const rb = await import(B + "/src/battle/moba/replay/replayBuffer.js");
  const rp = await import(B + "/src/battle/moba/items/itemReplay.js");
  const contract = await import(B + "/src/platform/contracts/mobaReplay.js");
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

async function mouseClick(chrome, x, y) {
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    await chrome.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  }
}
async function realClick(chrome, sel) {
  const p = J(await chrome.evaluate(`const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && !n.disabled; }); if (!el) return JSON.stringify(null); const r = el.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });`));
  if (!p) return null;
  await mouseClick(chrome, p.x, p.y);
  return p;
}

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

async function homeToTactic(chrome, sleep, ck, label) {
  ck(`${label}｜首頁有 MOBA 入口`, await waitFor(chrome, sleep, `document.querySelector('[data-testid="home-mode-moba"]')`, 90000));
  await chrome.evaluate(clickSel(`[data-testid="home-mode-moba"]`));
  ck(`${label}｜進入賽前頁`, await waitFor(chrome, sleep, `document.querySelector('[data-testid="prep-primary-action"]')`, 60000));
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
  return draftToTactic(chrome, sleep, ck, label);
}

async function resumeFromHome(chrome, sleep) {
  const card = await waitFor(chrome, sleep, `document.querySelector('[data-testid="resume-active-match"]')`, 90000);
  if (!card) return false;
  await chrome.evaluate(clickSel(`[data-testid="resume-active-match"]`));
  return true;
}

const WAIT_TS = (ts, limitS) => `
  ${BASE}
  const gs = await import(B + "/src/useGameStore.js");
  for (let i = 0; i < ${limitS * 4}; i++) {
    const s = gs.useGameStore.getState().snapshot;
    if (s && s.ts >= ${ts}) return JSON.stringify({ ok: true, ts: s.ts, items: !!s.items });
    await sleep(250);
  }
  return JSON.stringify({ ok: false });
`;
const CLICK_RATE = (label) => `const b = [...document.querySelectorAll("button")].find((x) => (x.innerText || "").trim() === "${label}"); if (b) b.click(); return JSON.stringify({ ok: !!b });`;

/** 等本場設定（activeMatch.simulation.timeSec）存到至少 min 秒（useLocalServer 每 1.4 秒存一次）。 */
const SAVED_TIME = (min, limitS) => `
  ${BASE}
  const ps = await import(B + "/src/platform/profileStore.js");
  const read = () => { const v = ps.useProfileStore.getState().activeMatchView(); return v && v.simulation ? Number(v.simulation.timeSec) || 0 : 0; };
  for (let i = 0; i < ${limitS * 4}; i++) {
    if (read() >= ${min}) return JSON.stringify({ ok: true, timeSec: read() });
    await sleep(250);
  }
  const st = ps.useProfileStore.getState();
  const mm = st.matchmaking || {};
  const ses = mm.session || null;
  const gs = await import(B + "/src/useGameStore.js");
  const snap = gs.useGameStore.getState().snapshot;
  const am = ses && ses.activeMatch ? ses.activeMatch : null;
  return JSON.stringify({ ok: false, timeSec: read(), diag: { launchSessionId: mm.launch ? mm.launch.sessionId : null, launchMode: mm.launch ? mm.launch.mode : null, sessionId: ses ? ses.sessionId : null, sessionMode: ses ? ses.mode : null, state: ses ? ses.state : null, schema: ses ? ses.schema : null, active: am ? { status: am.status, phase: am.phase, schema: am.schema, simulation: am.simulation ? { status: am.simulation.status, timeSec: am.simulation.timeSec, hasSnapshot: !!am.simulation.snapshot, updatedAt: am.simulation.updatedAt } : null } : null, liveTs: snap ? snap.ts : null, view: !!st.activeMatchView() } });
`;

/** 在頁面裡每 30ms 記錄一次 live snapshot 的 10 人背包（以 ts 為 key；重新整理後重裝）。 */
const RECORDER = `
  ${BASE}
  const gs = await import(B + "/src/useGameStore.js");
  window.__m3eLive = window.__m3eLive || {};
  if (!window.__m3eTimer) {
    window.__m3eTimer = setInterval(() => {
      const s = gs.useGameStore.getState().snapshot;
      if (s && s.items && !(String(s.ts) in window.__m3eLive)) {
        window.__m3eLive[String(s.ts)] = JSON.stringify(Object.fromEntries(Object.entries(s.items.players).map((e) => [e[0], e[1].inventory])));
      }
    }, 30);
  }
  return JSON.stringify({ ok: true });
`;
const RECORD_FINAL = `
  ${BASE}
  const gs = await import(B + "/src/useGameStore.js");
  const s = gs.useGameStore.getState().snapshot;
  window.__m3eFinal = s && s.items ? JSON.stringify(Object.fromEntries(Object.entries(s.items.players).map((e) => [e[0], e[1].inventory]))) : null;
  return JSON.stringify({ over: !!(s && s.over), ts: s ? s.ts : null, recorded: Object.keys(window.__m3eLive || {}).length });
`;

async function quickFinishAndOpenReplay(chrome, sleep, ck, label, beforeOpen = null) {
  await chrome.evaluate(`window.confirm = () => true; return JSON.stringify({});`);
  const clicked = J(await chrome.evaluate(clickSel(`[data-testid="quick-finish-match"]`)));
  ck(`${label}｜快速完成`, clicked?.ok, JSON.stringify(clicked));
  const ended = await waitFor(chrome, sleep, `[...document.querySelectorAll("button")].some((b) => (b.innerText || "").includes("觀看重播"))`, 300000, 500);
  ck(`${label}｜比賽結束、出現「觀看重播」`, ended);
  if (!ended) return false;
  await sleep(800);
  if (beforeOpen) await beforeOpen();
  return openReplay(chrome, sleep, ck, label);
}
async function openReplay(chrome, sleep, ck, label) {
  await chrome.evaluate(clickText("觀看重播"));
  const opened = await waitFor(chrome, sleep, `document.querySelector('[aria-label="比賽重播"] input[aria-label="重播時間軸"]') && (document.querySelector("[data-replay-presentation] canvas") || document.querySelector('[data-replay-stage="2d"] svg'))`, 150000, 300);
  let diag = "";
  if (!opened) {
    //  打不開時留下證據：對話框有沒有出現、呈現模式、是否卡在 Rift 載入、頁面錯誤、console error、截圖
    const d = J(await chrome.evaluate(`
      const dlg = document.querySelector('[aria-label="比賽重播"]');
      const pres = document.querySelector("[data-replay-presentation]");
      const rift = typeof window.__ESMO_RIFT_DIAG === "function" ? window.__ESMO_RIFT_DIAG() : null;
      return JSON.stringify({
        dialog: !!dlg, text: dlg ? (dlg.innerText || "").slice(0, 300) : (document.body.innerText || "").slice(0, 300),
        presentation: pres ? pres.dataset.replayPresentation : null, canvas: document.querySelectorAll("canvas").length,
        riftLoading: !!document.querySelector('[data-testid="rift-entry-loading"]'),
        rift: rift ? { status: rift.status, mode: rift.decision ? rift.decision.mode : null, reason: rift.decision ? rift.decision.reason : null } : null,
        slider: !!document.querySelector('input[aria-label="重播時間軸"]'),
      });`));
    diag = JSON.stringify({ ...d, pageErrors: chrome.pageErrors.slice(-3), console: chrome.consoleLines.filter((l) => /^\[error\]/i.test(l)).slice(-5).map((l) => l.slice(0, 300)) });
    note(`   重播打不開的現場：${diag}`);
    try { await shot(chrome, `debug-replay-open-${label.replace(/[^\w]+/g, "_")}.png`); } catch { /* ignore */ }
  }
  ck(`${label}｜重播開啟（戰場掛上：3D canvas，或地圖資料不相容時的 2D 俯視圖）`, opened, diag);
  if (opened) {
    await sleep(1500);
    const mode = J(await chrome.evaluate('const st = document.querySelector("[data-replay-stage]"); return JSON.stringify({ stage: st ? st.dataset.replayStage : null });'));
    note("   重播戰場模式：" + (mode ? mode.stage : null));
  }
  return opened;
}
const SLIDER_T = `const s = document.querySelector('input[aria-label="重播時間軸"]'); return JSON.stringify({ t: s ? Number(s.value) : null });`;

async function shot(chrome, name) {
  const data = await chrome.send("Page.captureScreenshot", { format: "png" });
  const file = resolve(SHOT_DIR, name);
  writeFileSync(file, Buffer.from(data.data, "base64"));
  note(`   截圖 ${relative(ROOT, file).replace(/\\/g, "/")}`);
}
const viewport = (chrome, w, h, mobile) => chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });

const REPLAY_DATA = `
  ${MODS}
  const replay = rb.getCurrentReplay();
  const v = contract.validateMobaReplay(replay);
  const items = rp.decodeItemsReplay(replay);
  const live = window.__m3eLive || {};
  let checked = 0; const bad = [];
  for (const [k, inv] of Object.entries(live)) {
    const ts = Number(k);
    if (!items || ts < items.baseline.t) continue;
    checked++;
    if (JSON.stringify(rp.foldPurchasesAt(items, ts)) !== inv) bad.push(k);
  }
  const final = window.__m3eFinal || null;
  const again = items ? rp.decodeItemsReplay(JSON.parse(JSON.stringify(replay))) : null;
  return JSON.stringify({
    valid: v.ok, errors: v.errors, version: replay && replay.itemMeta ? replay.itemMeta.version : null,
    start: replay ? replay.frames[0].t : null, duration: replay ? replay.duration : null,
    baseline: items ? { t: items.baseline.t, seq: items.baseline.seq } : null, gaps: replay && replay.itemMeta ? replay.itemMeta.gaps : null,
    purchases: replay && replay.purchases ? replay.purchases.length : 0, strategies: replay && replay.itemMeta ? replay.itemMeta.strategyByPlayer : null,
    liveTotal: Object.keys(live).length, checked, badCount: bad.length, bad: bad.slice(0, 5),
    finalOk: !!items && final !== null && JSON.stringify(rp.foldPurchasesAt(items, replay.duration)) === final,
    roundTrip: !!items && JSON.stringify(rp.selectReplayPurchaseMarkers(items)) === JSON.stringify(rp.selectReplayPurchaseMarkers(again))
      && JSON.stringify(rp.foldPurchasesAt(items, replay.duration)) === JSON.stringify(rp.foldPurchasesAt(again, replay.duration)),
    rejected: items ? rp.foldPurchasesDetailed(items, Infinity).rejected : null,
    markers: items ? rp.selectReplayPurchaseMarkers(items).length : 0,
  });
`;

/** 某寬度的互動量測（暫停 → 選英雄 → 暫停穩定 → 往後／往前跳 → 回傳購買軌點擊座標）。 */
const UI = (mobile, seat) => `
  ${MODS}
  const q = (s) => document.querySelector(s);
  const qa = (s) => [...document.querySelectorAll(s)];
  const tNow = () => Number(q('input[aria-label="重播時間軸"]').value);
  const replay = rb.getCurrentReplay();
  const items = rp.decodeItemsReplay(replay);
  const playBtn = q('[data-testid="replay-play-toggle"]');
  if ((playBtn.innerText || "").includes("暫停")) { playBtn.click(); await sleep(450); }
  const collapsedBefore = !q("[data-replay-item-panel]");
  if (collapsedBefore) { q('[data-testid="replay-items-toggle"]').click(); await sleep(450); }
  const seatBtn = q('[data-replay-item-seat="${seat}"]');
  if (!seatBtn) return JSON.stringify({ ok: false, why: "no seat button" });
  if (seatBtn.getAttribute("aria-pressed") !== "true") { seatBtn.click(); await sleep(450); }
  const slotsNow = () => { const el = q("[data-replay-slots]"); return el ? el.dataset.replaySlots : null; };
  const expectSlots = (t) => rp.foldPurchasesAt(items, t)["${seat}"].map((x) => x ?? "").join(",");
  const panelT = () => Number(q("[data-replay-item-panel]").dataset.replayItemsT);

  const p1 = { t: tNow(), pt: panelT(), slots: slotsNow() };
  await sleep(1200);
  const p2 = { t: tNow(), pt: panelT(), slots: slotsNow() };
  //  滑桿 step=0.5 會把顯示值四捨五入；面板時間（data-replay-items-t）才是還原裝備用的實際播放時間
  const pauseOk = p1.t === p2.t && p1.pt === p2.pt && p1.slots === p2.slots && p2.slots === expectSlots(p2.pt) && Math.abs(p2.pt - p2.t) <= 0.25;

  const chips = qa("[data-replay-seek-purchase]");
  const markersOf = rp.selectReplayPurchaseMarkers(items, { seat: "${seat}" });
  let fwd = null, back = null;
  if (chips.length) {
    const last = chips[chips.length - 1];
    last.scrollIntoView({ inline: "nearest", block: "nearest" }); last.click(); await sleep(400);
    const lm = markersOf.find((m) => String(m.seq) === last.dataset.replaySeekPurchase);
    fwd = { t: tNow(), expectT: Number(last.dataset.t), ok: tNow() === Number(last.dataset.t) && slotsNow() === expectSlots(tNow()) && !!lm && slotsNow().split(",").includes(lm.itemId), item: lm ? lm.itemId : null };
    const first = chips[0];
    first.scrollIntoView({ inline: "nearest", block: "nearest" }); first.click(); await sleep(400);
    back = { t: tNow(), expectT: Number(first.dataset.t), ok: tNow() === Number(first.dataset.t) && slotsNow() === expectSlots(tNow()) && tNow() <= fwd.t, laterItemGone: !!lm && lm.t > tNow() ? !slotsNow().split(",").includes(lm.itemId) || rp.foldPurchasesAt(items, tNow())["${seat}"].includes(lm.itemId) : true };
  }
  const trackEl = q("[data-replay-item-track]");
  const tr = trackEl.getBoundingClientRect();
  const markerEls = qa("[data-replay-item-track] [data-purchase-marker]");
  const candidate = markerEls.filter((m) => m.dataset.kind === "major").map((m) => ({ m, t: Number(m.dataset.t) })).filter((x) => Math.abs(x.t - tNow()) > 20).pop();
  const mr = candidate ? candidate.m.getBoundingClientRect() : null;
  const sizeOf = (k) => { const el = markerEls.find((m) => m.dataset.kind === k); if (!el) return null; return Math.round(el.getBoundingClientRect().width * 10) / 10; };
  const panel = q("[data-replay-item-panel]");
  const dialog = q('[aria-label="比賽重播"]');
  const touch = [...panel.querySelectorAll("[data-touch]")].filter((el) => el.getBoundingClientRect().width > 0)
    .map((el) => ({ l: el.dataset.replayItemSeat || el.dataset.replaySeekPurchase || "", w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }));
  const toggle = q('[data-testid="replay-items-toggle"]').getBoundingClientRect();
  const battleEl = q("[data-replay-stage]");
  const battleH = battleEl ? Math.round(battleEl.getBoundingClientRect().height) : 0;
  const tickerRows = document.querySelectorAll('[data-testid="replay-event-text"], [data-testid="replay-comms"]').length;
  const strat = q("[data-replay-strategy]");
  return JSON.stringify({
    ok: true, collapsedBefore, pauseOk, p1, p2, fwd, back, chipCount: chips.length,
    tap: mr ? { x: Math.round(mr.left + mr.width / 2), y: Math.round(tr.top + tr.height / 2), t: candidate.t } : null,
    trackH: Math.round(tr.height), markerCount: Number(trackEl.dataset.markerCount),
    expectedMarkers: rp.selectReplayPurchaseMarkers(items, { seat: "${seat}", from: replay.frames[0].t }).length,
    sizes: { major: sizeOf("major"), boots: sizeOf("boots"), component: sizeOf("component") },
    strategy: strat ? { blue: strat.dataset.blue, red: strat.dataset.red, text: strat.innerText } : null,
    overflow: document.documentElement.scrollWidth > innerWidth + 1 || dialog.scrollWidth > dialog.clientWidth + 1, panelOverflow: panel.scrollWidth > panel.clientWidth + 1,
    small: ${mobile} ? touch.filter((x) => x.w < 44 || x.h < 44) : [], touchCount: touch.length, toggleH: Math.round(toggle.height), battleH, tickerRows,
  });
`;
const AFTER_TAP = (seat) => `
  ${MODS}
  const items = rp.decodeItemsReplay(rb.getCurrentReplay());
  const t = Number(document.querySelector('input[aria-label="重播時間軸"]').value);
  const el = document.querySelector("[data-replay-slots]");
  return JSON.stringify({ t, isMarker: rp.selectReplayPurchaseMarkers(items, { seat: "${seat}" }).some((m) => m.t === t),
    slotsOk: !!el && el.dataset.replaySlots === rp.foldPurchasesAt(items, t)["${seat}"].map((x) => x ?? "").join(",") });
`;
const RESUME_CHECK = (seat) => `
  ${MODS}
  const q = (s) => document.querySelector(s);
  const items = rp.decodeItemsReplay(rb.getCurrentReplay());
  const tNow = () => Number(q('input[aria-label="重播時間軸"]').value);
  const before = tNow();
  q('[data-testid="replay-play-toggle"]').click();
  await sleep(1300);
  const during = tNow();
  q('[data-testid="replay-play-toggle"]').click();
  await sleep(450);
  const t = tNow();
  const el = q("[data-replay-slots]");
  return JSON.stringify({ before, during, t, advanced: during > before,
    slotsOk: !!el && el.dataset.replaySlots === rp.foldPurchasesAt(items, Number(q("[data-replay-item-panel]").dataset.replayItemsT))["${seat}"].map((x) => x ?? "").join(","),
    panelT: Number(q("[data-replay-item-panel]").dataset.replayItemsT) });
`;

const result = await runGate({
  name: `裝備重播（M3e）真實流程｜${PHASE}`,
  timeoutMs: PHASE === "off" ? 850_000 : 1_150_000,
  run: async ({ chrome, url, ck, sleep }) => {
    const errorsSince = (n) => chrome.consoleLines.slice(n).filter((l) => /^\[error\]/i.test(l)).map((e) => e.slice(0, 120));

    if (PHASE === "off") {
      note("\n════ itemsV1 OFF｜打一場 → 快速完成 → 觀看重播（舊格式） ════");
      await viewport(chrome, 1366, 900, false);
      const c0 = chrome.consoleLines.length, p0 = chrome.pageErrors.length;
      await chrome.navigate(url); await sleep(2500);
      await chrome.evaluate(`localStorage.removeItem("esmo.profile.v1"); return JSON.stringify({});`);
      await chrome.navigate(url); await sleep(3000);
      if (!(await homeToTactic(chrome, sleep, ck, "OFF"))) return;
      await chrome.evaluate(clickText("開始載入"));
      ck("OFF｜戰場掛上", await waitFor(chrome, sleep, IN_BATTLE, 240000, 300));
      J(await chrome.evaluate(WAIT_TS(20, 120)));
      if (!(await quickFinishAndOpenReplay(chrome, sleep, ck, "OFF"))) return;
      const r = J(await chrome.evaluate(`${MODS} const replay = rb.getCurrentReplay(); const v = contract.validateMobaReplay(replay);
        return JSON.stringify({ ok: !!replay, valid: v.ok, errors: v.errors, hasMeta: replay ? "itemMeta" in replay : null, hasPurchases: replay ? "purchases" in replay : null,
          decode: rp.decodeItemsReplay(replay), track: document.querySelectorAll("[data-replay-item-track]").length, toggle: document.querySelectorAll('[data-testid="replay-items-toggle"]').length,
          panel: document.querySelectorAll("[data-replay-item-panel]").length, strategy: document.querySelectorAll("[data-replay-strategy]").length });`));
      note(`   ${JSON.stringify(r)}`);
      ck("OFF｜舊格式 Replay：沒有 itemMeta／purchases、MobaReplay.v1 契約合法、decode 為 null", r?.ok && r.valid && r.hasMeta === false && r.hasPurchases === false && r.decode === null, JSON.stringify(r));
      ck("OFF｜播放畫面沒有購買軌、裝備鈕、裝備面板、策略籤", r && r.track === 0 && r.toggle === 0 && r.panel === 0 && r.strategy === 0, JSON.stringify(r));
      const t1 = J(await chrome.evaluate(SLIDER_T))?.t;
      await sleep(1600);
      const t2 = J(await chrome.evaluate(SLIDER_T))?.t;
      ck(`OFF｜照常播放（時間 ${t1} → ${t2}）`, Number.isFinite(t1) && t2 > t1);
      for (const [w, h, mobile] of [[1366, 900, false], [390, 844, true]]) {
        await viewport(chrome, w, h, mobile); await sleep(900);
        const o = J(await chrome.evaluate(`const d = document.querySelector('[aria-label="比賽重播"]'); return JSON.stringify({ overflow: document.documentElement.scrollWidth > innerWidth + 1 || (d && d.scrollWidth > d.clientWidth + 1), track: document.querySelectorAll("[data-replay-item-track]").length });`));
        ck(`OFF ${w}｜不水平溢出、仍沒有購買軌`, o && !o.overflow && o.track === 0, JSON.stringify(o));
        await shot(chrome, `off-replay-${w}.png`);
      }
      const errs = errorsSince(c0);
      writeFileSync(OFF_CONSOLE, JSON.stringify(errs, null, 2), "utf8");
      note(`   OFF console error ${errs.length} 則（存為 ON 的比較基準）`);
      ck("OFF｜page exception = 0", chrome.pageErrors.length === p0, chrome.pageErrors.slice(p0).join(" | "));
      return;
    }

    // ── ON ────────────────────────────────────────────────────────────────────
    const offErrors = new Set(existsSync(OFF_CONSOLE) ? JSON.parse(readFileSync(OFF_CONSOLE, "utf8")) : []);
    const onUrl = `${url}${url.includes("?") ? "&" : "?"}itemsDev=1`;
    note("\n════ itemsV1 ON｜前期壓制 → 戰鬥記錄 → 戰鬥中重新整理 → 快速完成 ════");
    await viewport(chrome, 1366, 900, false);
    const c0 = chrome.consoleLines.length, p0 = chrome.pageErrors.length;
    await chrome.navigate(onUrl); await sleep(2500);
    await chrome.evaluate(`localStorage.removeItem("esmo.profile.v1"); return JSON.stringify({});`);
    await chrome.navigate(onUrl); await sleep(3000);
    if (!(await homeToTactic(chrome, sleep, ck, "ON"))) return;
    await chrome.evaluate(clickSel(`[data-build-strategy-prep] [data-strategy="early"]`));
    ck("ON｜戰術頁選「前期壓制」並存進本場設定", await waitFor(chrome, sleep, `document.querySelector('[data-build-strategy-prep] [data-strategy="early"][aria-checked="true"]')`, 10000, 200));
    await chrome.evaluate(clickText("開始載入"));
    ck("ON｜戰場掛上", await waitFor(chrome, sleep, IN_BATTLE, 240000, 300));
    //  ⚠ 重新整理之前不切倍速：既有 useLocalServer.setRate 重建的計時器沒有呼叫 persistActiveSnapshot（Sprint 29A 起），
    //    切過倍速就不再存進度，重新整理後恢復會回到很早的時間。M3e 範圍外，列入風險；這裡用預設 2× 打到恢復點。
    await chrome.evaluate(RECORDER);
    const pre = J(await chrome.evaluate(WAIT_TS(RESUME_AT, 300)));
    ck(`ON｜戰鬥推進到 ${RESUME_AT}s（snapshot 有 items）`, pre?.ok && pre.items, JSON.stringify(pre));
    if (!pre?.ok) return;
    //  重新整理前先確認本場設定真的存到接近目前的模擬時間；沒存到就重新整理，恢復會從頭開始（第二輪實測恢復在 3.5s）
    const saved = J(await chrome.evaluate(SAVED_TIME(RESUME_AT - 5, 20)));
    note(`   重新整理前已存模擬時間 ${saved?.timeSec}`);
    ck(`ON｜重新整理前本場設定已存到 ≥ ${RESUME_AT - 5}s`, saved?.ok, JSON.stringify(saved));
    if (!saved?.ok) return;

    await chrome.navigate(onUrl); await sleep(3000);
    ck("ON｜戰鬥中重新整理 →「返回進行中的比賽」", await resumeFromHome(chrome, sleep));
    ck("ON｜恢復後戰場掛上", await waitFor(chrome, sleep, IN_BATTLE, 240000, 300));
    await chrome.evaluate(RECORDER);
    const resumed = J(await chrome.evaluate(WAIT_TS(0, 30)));
    note(`   恢復時 ts ${resumed?.ts}`);
    ck(`ON｜恢復接回重新整理前的時間（${resumed?.ts}s ≥ ${RESUME_AT - 5}s）`, (resumed?.ts ?? 0) >= RESUME_AT - 5, JSON.stringify(resumed));
    await chrome.evaluate(CLICK_RATE("4×"));
    const post = J(await chrome.evaluate(WAIT_TS((resumed?.ts ?? RESUME_AT) + AFTER_RESUME, 300)));
    ck(`ON｜恢復後再推進 ${AFTER_RESUME}s`, post?.ok, JSON.stringify(post));
    await chrome.evaluate(CLICK_RATE("1×"));
    if (!(await quickFinishAndOpenReplay(chrome, sleep, ck, "ON", async () => {
      const fin = J(await chrome.evaluate(RECORD_FINAL));
      note(`   終局 ts ${fin?.ts}（over ${fin?.over}）　live 記錄 ${fin?.recorded} 個 tick`);
    }))) return;

    const d = J(await chrome.evaluate(REPLAY_DATA));
    note(`   Replay：起點 ${d?.start}　長度 ${d?.duration}　baseline ${JSON.stringify(d?.baseline)}　purchases ${d?.purchases}　標記 ${d?.markers}　gaps ${d?.gaps}`);
    note(`   fold 對照 live：${d?.checked}／${d?.liveTotal} 個 tick，不同 ${d?.badCount}`);
    ck("ON｜Replay 契約合法、itemMeta 版本、baseline＝第一格 frame（恢復起點）、seq 無跳號、沒有被拒絕的購買",
      d?.valid && d.version === "moba-items.replay.v1" && d.baseline?.t === d.start && d.start >= RESUME_AT - 5 && d.gaps === 0 && d.rejected === 0 && d.purchases > 0, JSON.stringify(d));
    ck("ON｜本場策略：我方五人 early、紅方五人 standard（保存的引擎原值）",
      d?.strategies?.join() === "early,early,early,early,early,standard,standard,standard,standard,standard", JSON.stringify(d?.strategies));
    ck(`ON｜fold at T＝live snapshot inventory（${d?.checked} 個 tick 全部相同）、終局 fold＝最後 snapshot`,
      d?.checked >= 100 && d.badCount === 0 && d.finalOk, JSON.stringify({ checked: d?.checked, bad: d?.bad, finalOk: d?.finalOk }));
    ck("ON｜purchase timeline deterministic：JSON 來回後標記與 fold 逐位元相同", d?.roundTrip);

    let firstChip = null;
    for (const [w, h, mobile] of WIDTHS) {
      note(`\n════ ON 重播｜${w}px ════`);
      await viewport(chrome, w, h, mobile); await sleep(1000);
      if (w === 390) await shot(chrome, `replay-collapsed-390.png`);
      const u = J(await chrome.evaluate(UI(mobile, FOCUS_SEAT)));
      if (!u?.ok) { ck(`ON ${w}｜量測`, false, JSON.stringify(u)); continue; }
      note(`   暫停 t ${u.p2.t}　6 格 ${u.p2.slots}　購買籤 ${u.chipCount}　標記 ${u.markerCount}（應 ${u.expectedMarkers}）　尺寸 ${JSON.stringify(u.sizes)}　軌高 ${u.trackH}　戰場高 ${u.battleH}　事件列 ${u.tickerRows}`);
      if (mobile) ck(`ON ${w}｜手機裝備面板預設收合（戰場優先）`, u.collapsedBefore === (w === 390), JSON.stringify({ collapsedBefore: u.collapsedBefore }));
      ck(`ON ${w}｜暫停 1.2 秒：時間、面板時間、6 格都不變，且 6 格＝foldPurchasesAt(t)`, u.pauseOk, JSON.stringify({ p1: u.p1, p2: u.p2 }));
      ck(`ON ${w}｜購買籤往後跳（${u.fwd?.item}）⇒ 時間＝購買時間、6 格＝fold 且含該件；往前跳 ⇒ 6 格＝fold`,
        u.fwd?.ok && u.back?.ok && u.back.laterItemGone, JSON.stringify({ fwd: u.fwd, back: u.back }));
      ck(`ON ${w}｜購買軌：選中英雄的標記數＝selector；T3 標記 > 升級鞋 > 組件`,
        u.markerCount === u.expectedMarkers && u.sizes.major > (u.sizes.boots ?? 0) && (u.sizes.boots ?? u.sizes.major) > (u.sizes.component ?? 0), JSON.stringify({ markers: u.markerCount, expected: u.expectedMarkers, sizes: u.sizes }));
      ck(`ON ${w}｜策略籤：我方出裝 前期壓制、紅方出裝 標準`,
        u.strategy?.blue === "early" && u.strategy.red === "standard" && /前期壓制/.test(u.strategy.text) && /標準/.test(u.strategy.text), JSON.stringify(u.strategy));
      ck(`ON ${w}｜不水平溢出（整頁、重播視窗、裝備面板）`, !u.overflow && !u.panelOverflow, JSON.stringify({ overflow: u.overflow, panel: u.panelOverflow }));
      if (mobile) ck(`ON ${w}｜手機：購買軌高 ${u.trackH}、裝備鈕高 ${u.toggleH}、面板 ${u.touchCount} 個可點元素都 ≥ 44`, u.trackH >= 44 && u.toggleH >= 44 && u.small.length === 0, JSON.stringify(u.small));
      if (mobile) ck(`ON ${w}｜手機開著裝備面板：戰場仍保留 ${u.battleH}px（≥ 120），事件列暫時收起`, u.battleH >= 120 && u.tickerRows === 0, JSON.stringify({ battleH: u.battleH, tickerRows: u.tickerRows }));
      if (u.tap) {
        await mouseClick(chrome, u.tap.x, u.tap.y);
        await sleep(450);
        const a = J(await chrome.evaluate(AFTER_TAP(FOCUS_SEAT)));
        ck(`ON ${w}｜點購買軌 ⇒ 跳到標記時間（${a?.t}）且 6 格＝fold`, a?.isMarker && a.slotsOk, JSON.stringify({ tap: u.tap, after: a }));
      }
      const rs = J(await chrome.evaluate(RESUME_CHECK(FOCUS_SEAT)));
      ck(`ON ${w}｜繼續播放時間前進（${rs?.before} → ${rs?.during}），再暫停後 6 格＝fold`, rs?.advanced && rs.slotsOk && Math.abs(rs.panelT - rs.t) <= 0.25, JSON.stringify(rs));
      firstChip ??= J(await chrome.evaluate(`const c = document.querySelector("[data-replay-seek-purchase]"); const s = document.querySelector("[data-replay-slots]"); if (c) c.click(); await new Promise((r) => setTimeout(r, 400)); return JSON.stringify({ seq: c ? c.dataset.replaySeekPurchase : null, t: Number(document.querySelector('input[aria-label="重播時間軸"]').value), slots: document.querySelector("[data-replay-slots]") ? document.querySelector("[data-replay-slots]").dataset.replaySlots : null });`));
      await shot(chrome, `replay-${w}.png`);
    }

    note("\n════ ON｜關閉重播 → 再打開 ════");
    await chrome.evaluate(clickText("關閉重播"));
    await sleep(800);
    if (await openReplay(chrome, sleep, ck, "ON 再打開")) {
      const re = J(await chrome.evaluate(`${MODS}
        const q = (s) => document.querySelector(s);
        const playBtn = q('[data-testid="replay-play-toggle"]');
        if ((playBtn.innerText || "").includes("暫停")) { playBtn.click(); await sleep(400); }
        if (!q("[data-replay-item-panel]")) { q('[data-testid="replay-items-toggle"]').click(); await sleep(400); }
        const seatBtn = q('[data-replay-item-seat="${FOCUS_SEAT}"]');
        if (seatBtn && seatBtn.getAttribute("aria-pressed") !== "true") { seatBtn.click(); await sleep(400); }
        const chip = q('[data-replay-seek-purchase="${firstChip?.seq ?? ""}"]');
        if (chip) { chip.click(); await sleep(400); }
        const items = rp.decodeItemsReplay(rb.getCurrentReplay());
        return JSON.stringify({ chip: !!chip, t: Number(q('input[aria-label="重播時間軸"]').value), slots: q("[data-replay-slots]") ? q("[data-replay-slots]").dataset.replaySlots : null, markers: rp.selectReplayPurchaseMarkers(items).length });`));
      ck("ON｜關閉再打開重播：同一筆購買籤 ⇒ 同一時間、同一組 6 格", re?.chip && re.t === firstChip?.t && re.slots === firstChip?.slots && re.markers === d?.markers, JSON.stringify({ first: firstChip, reopen: re }));
      await shot(chrome, `replay-reopen-390.png`);
    }

    const newErrors = errorsSince(c0).filter((e) => !offErrors.has(e));
    ck(`ON｜page exception = 0、console error 不比 OFF 多（OFF 基準 ${offErrors.size} 則${existsSync(OFF_CONSOLE) ? "" : "，⚠ 找不到 OFF 基準"}）`,
      chrome.pageErrors.length === p0 && newErrors.length === 0 && existsSync(OFF_CONSOLE), [...chrome.pageErrors.slice(p0), ...newErrors].slice(0, 3).join(" | "));
  },
});

writeFileSync(resolve(SHOT_DIR, `measurements-${PHASE}.txt`), report.join("\n"), "utf8");
console.log(`\n量測明細：${relative(ROOT, resolve(SHOT_DIR, `measurements-${PHASE}.txt`)).replace(/\\/g, "/")}`);
finishGate(result);
