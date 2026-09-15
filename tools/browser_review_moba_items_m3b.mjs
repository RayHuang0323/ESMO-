#!/usr/bin/env node
// ============================================================================
//  tools/browser_review_moba_items_m3b.mjs — 裝備 Battle HUD（M3b）真實戰鬥頁量測與截圖
//
//  執行：node tools/browser/run-gate.mjs tools/browser_review_moba_items_m3b.mjs --timeout 1800000
//
//  真實戰鬥入口 ?debug=moba-runtime-battle（正式 GameView／LogicEngine／HUD），**不帶 shot=／diag=**
//  （那兩個參數會打開 WebGL 診斷與戰鬥 Debug 面板，蓋住底欄）。
//
//  OFF（不帶 itemsDev，390／1366）：snapshot.items 不存在、裝備 DOM 0、原本「裝備 · 未提供」佔位還在。
//  ON（?itemsDev=1，320／390／768／1366）：
//    · 無水平溢出、無 page exception、console error 不比 OFF 多
//    · 焦點底欄高度＝OFF；桌機席位仍 52px
//    · 常駐裝備元素不進入中央戰場矩形（十人列之間、記分板下緣～底欄上緣）
//    · 各端只看得到自己的入口（手機 chip／桌機「十人裝備」鈕）
//    · DOM 金錢／背包＝同一 ts 的 selectHudItems(snapshot)
//    · 手機：裝備 chip ≥ 44；開 sheet 後 6 格、關閉鈕、切換列都 ≥ 44
//    · 桌機：開「十人裝備」後席位仍 52px、10 列 6 格可見
//  購買通知（1366，切 4 倍速等真實購買）：只出現完成裝／鞋升級、約 2.5 秒消失、不擋點擊；
//    減少動態下出現即完整、無掃光層。
//
//  記憶體不足時可縮小範圍（這台機器實際被系統砍過兩次）：
//    ESMO_M3B_ON_WIDTHS=390,768,1366   只跑指定的 ON 寬度（OFF 390／1366 基準一律照跑）
//    ESMO_M3B_SKIP_TOAST=1             跳過購買通知段（4 倍速等真實購買，最吃記憶體）
//    ESMO_M3B_TAG=final                量測明細另存 measurements-final.txt，不覆寫前一輪
//  截圖存 review/moba-items-m3b/。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { runGate, finishGate } from "./browser/harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHOT_DIR = resolve(ROOT, process.env.ESMO_REVIEW_OUT ?? "review/moba-items-m3b");
mkdirSync(SHOT_DIR, { recursive: true });
const WAIT_TS = 90;
const ALL_ON = [[320, 720, true], [390, 844, true], [768, 1024, false], [1366, 900, false]];
const ON_WIDTHS = (process.env.ESMO_M3B_ON_WIDTHS ?? "320,390,768,1366").split(",").map(Number);
const SKIP_TOAST = process.env.ESMO_M3B_SKIP_TOAST === "1";
const TAG = process.env.ESMO_M3B_TAG ? `-${process.env.ESMO_M3B_TAG}` : "";

const report = [];
const note = (line) => { report.push(line); console.log(line); };
const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));

/** 等戰鬥推進到 WAIT_TS（讀 DOM：底欄存在＋頁面上的 store）。 */
const WAIT_BATTLE = `
  const B = location.pathname.endsWith("/") ? location.pathname.slice(0, -1) : location.pathname;
  const store = await import(B + "/src/useGameStore.js");
  for (let i = 0; i < 480; i++) {
    const snap = store.useGameStore.getState().snapshot;
    if (snap && snap.ts >= ${WAIT_TS} && document.querySelector(".observer-dock")) return JSON.stringify({ ok: true, ts: snap.ts, items: !!snap.items });
    await new Promise((r) => setTimeout(r, 250));
  }
  const s = store.useGameStore.getState().snapshot;
  return JSON.stringify({ ok: false, ts: s ? s.ts : null });
`;

const rectOf = `const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };`;

/** 版面量測（OFF／ON 共用）。 */
const LAYOUT = `
  ${rectOf}
  const B = location.pathname.endsWith("/") ? location.pathname.slice(0, -1) : location.pathname;
  const store = await import(B + "/src/useGameStore.js");
  const snap = store.useGameStore.getState().snapshot;
  const dock = rect(document.querySelector(".observer-dock"));
  const score = rect(document.querySelector(".battle-score"));
  const rails = [...document.querySelectorAll(".observer-ui .observer-teams .observer-rail")].map(rect);
  const seats = [...document.querySelectorAll(".observer-ui .observer-teams .observer-seat")].map(rect);
  const itemsDom = document.querySelectorAll("[data-items-gold],[data-seat-pips],[data-items-chip],[data-items-dock],[data-battle-purchase-toasts]").length;
  const placeholder = [...document.querySelectorAll(".observer-equipment")].some((b) => (b.innerText || "").includes("未提供"));
  const blueRail = rails[0], redRail = rails[1];
  const top = score ? score.y + score.h : 0;
  const bottom = dock ? dock.y : innerHeight;
  const central = { x: blueRail ? blueRail.x + blueRail.w : 0, y: top, w: (redRail ? redRail.x : innerWidth) - (blueRail ? blueRail.x + blueRail.w : 0), h: bottom - top };
  const persistent = [...document.querySelectorAll("[data-seat-pips],[data-items-dock],.observer-items-chip-face")].map(rect).filter((r) => r && r.w > 0);
  const hits = persistent.filter((r) => r.x < central.x + central.w && r.x + r.w > central.x && r.y < central.y + central.h && r.y + r.h > central.y);
  const touch = [...document.querySelectorAll("[data-items-chip]")].map(rect).filter((r) => r.w > 0);
  //  ⚠ 各端只能看到自己的入口：手機不得出現桌機「十人裝備」鈕，桌機不得出現手機 chip（M3b 截圖抓到過 CSS 權重蓋掉 display:none）
  const dockBtnVisible = [...document.querySelectorAll("[data-items-dock]")].some((el) => el.getBoundingClientRect().width > 0);
  const chipVisible = [...document.querySelectorAll("[data-items-chip]")].some((el) => el.getBoundingClientRect().width > 0);
  const teamToggle = rect(document.querySelector(".observer-team-toggle"));
  return JSON.stringify({
    ts: snap ? snap.ts : null, items: !!(snap && snap.items), itemsDom, placeholder,
    overflow: document.documentElement.scrollWidth > innerWidth + 1, scrollWidth: document.documentElement.scrollWidth,
    dockH: dock ? Math.round(dock.h) : null, seatH: seats.map((s) => Math.round(s.h)), railW: rails.map((r) => Math.round(r.w)),
    central: { x: Math.round(central.x), y: Math.round(central.y), w: Math.round(central.w), h: Math.round(central.h) },
    centralHits: hits.length, chip: touch.map((r) => [Math.round(r.w), Math.round(r.h)]),
    dockBtnVisible, chipVisible, teamToggleW: teamToggle && teamToggle.w > 0 ? Math.round(teamToggle.w) : null,
  });
`;

/** DOM 顯示值 ＝ 同一 ts 的 selectHudItems(snapshot)。 */
const CONSISTENCY = `
  const B = location.pathname.endsWith("/") ? location.pathname.slice(0, -1) : location.pathname;
  const store = await import(B + "/src/useGameStore.js");
  const sel = await import(B + "/src/battle/moba/items/itemsUiSelectors.js");
  for (let i = 0; i < 200; i++) {
    const root = document.querySelector(".observer-ui[data-items-ts]");
    const snap = store.useGameStore.getState().snapshot;
    if (root && snap && Number(root.dataset.itemsTs) === snap.ts) {
      const hud = sel.selectHudItems(snap);
      const bad = [];
      let checked = 0;
      for (const el of document.querySelectorAll("[data-seat][data-items-gold]")) {
        const h = hud[el.dataset.seat];
        checked++;
        if (Number(el.dataset.itemsGold) !== h.unspent) bad.push(el.dataset.seat + ":gold");
        if (el.dataset.itemsSlots !== h.slots.map((s) => s.itemId ?? "").join(",")) bad.push(el.dataset.seat + ":slots");
        const shown = (el.querySelector("[aria-label^='可用金錢']") || {}).textContent || "";
        if (shown.replace(/[^0-9]/g, "") !== String(h.unspent)) bad.push(el.dataset.seat + ":text=" + shown);
        const pips = [...el.querySelectorAll("[data-pip]")].map((p) => p.dataset.pip).join(",");
        if (pips && pips !== h.slots.map((s) => s.state).join(",")) bad.push(el.dataset.seat + ":pips");
      }
      for (const el of document.querySelectorAll("[data-items-dock],[data-items-chip]")) {
        if (el.getBoundingClientRect().width === 0) continue;
        const id = el.dataset.itemsDock || el.dataset.itemsChip;
        checked++;
        if (Number(el.dataset.itemsGold) !== hud[id].unspent) bad.push(id + ":dockGold");
        const shown = (el.querySelector("[aria-label^='可用金錢']") || {}).textContent || "";
        if (shown.replace(/[^0-9]/g, "") !== String(hud[id].unspent)) bad.push(id + ":dockText=" + shown);
      }
      return JSON.stringify({ ts: snap.ts, checked, bad });
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  return JSON.stringify({ ts: null, checked: 0, bad: ["同一 ts 對不上（200 次）"] });
`;

const SHEET = `
  ${rectOf}
  const chip = document.querySelector("[data-items-chip]");
  if (!chip) return JSON.stringify({ ok: false, why: "no chip" });
  chip.click();
  await new Promise((r) => setTimeout(r, 400));
  const sheet = document.querySelector("[data-mobile-items-sheet]");
  if (!sheet) return JSON.stringify({ ok: false, why: "no sheet" });
  const s = rect(sheet);
  const score = rect(document.querySelector(".battle-score"));
  const dock = rect(document.querySelector(".observer-dock"));
  const touch = [...sheet.querySelectorAll("[data-touch]")].map((el) => { const r = rect(el); return { l: (el.getAttribute("aria-label") || "").slice(0, 10), w: Math.round(r.w * 10) / 10, h: Math.round(r.h * 10) / 10 }; });
  const slots = [...sheet.querySelectorAll("[data-slot-state]")].map(rect).map((r) => [Math.round(r.w * 10) / 10, Math.round(r.h * 10) / 10]);
  return JSON.stringify({ ok: true, sheet: [Math.round(s.y), Math.round(s.h)], belowScore: s.y >= score.y + score.h, aboveDock: s.y + s.h <= dock.y + 1,
    small: touch.filter((t) => t.w < 44 || t.h < 44), touchCount: touch.length, slots: slots.slice(0, 6) });
`;
const CLOSE_SHEET = `const b = document.querySelector("[data-mobile-items-sheet] button[aria-label='關閉裝備']"); if (b) b.click(); await new Promise((r) => setTimeout(r, 300)); return String(!document.querySelector("[data-mobile-items-sheet]"));`;

const ITEMS_VIEW = `
  ${rectOf}
  const btn = document.querySelector("[data-items-dock]");
  if (!btn) return JSON.stringify({ ok: false });
  btn.click();
  await new Promise((r) => setTimeout(r, 400));
  const seats = [...document.querySelectorAll(".observer-teams .observer-seat")].map(rect).map((r) => Math.round(r.h));
  const rows = [...document.querySelectorAll("[data-seat-items-expanded]")];
  const slotSizes = rows.flatMap((row) => [...row.querySelectorAll("[data-slot-state]")].map(rect)).map((r) => Math.round(r.w));
  const overflowSeat = [...document.querySelectorAll(".observer-teams .observer-seat")].some((el) => el.scrollWidth > el.clientWidth + 1);
  return JSON.stringify({ ok: true, seats, rows: rows.length, slots: slotSizes.length, minSlot: Math.min(...slotSizes), overflowSeat, pressed: btn.getAttribute("aria-pressed") });
`;
const CLOSE_VIEW = `const b = document.querySelector("[data-items-dock]"); if (b && b.getAttribute("aria-pressed") === "true") b.click(); await new Promise((r) => setTimeout(r, 300)); return "closed";`;

const CLICK_SPEED = `const b = [...document.querySelectorAll("button")].find((x) => (x.innerText || "").trim() === "4×"); if (!b) return "no-4x"; b.click(); return "4x";`;

/** 等一則購買通知出現（最多 limitS 秒），回報內容與 pointer-events。 */
const waitToast = (limitS) => `
  for (let i = 0; i < ${limitS * 10}; i++) {
    const box = document.querySelector("[data-battle-purchase-toasts]");
    const toasts = box ? [...box.querySelectorAll("[data-toast]")] : [];
    if (toasts.length) {
      return JSON.stringify({ ok: true, count: toasts.length, states: toasts.map((t) => t.dataset.toast), text: toasts.map((t) => (t.innerText || "").replace(/\\s+/g, " ").slice(0, 40)),
        pointer: getComputedStyle(box).pointerEvents, opacity: toasts.map((t) => Number(getComputedStyle(t).opacity)), shine: box.querySelectorAll("[data-toast-shine]").length });
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return JSON.stringify({ ok: false });
`;
/** 目前這幾則通知多久後消失（毫秒）。 */
const TOAST_LIFETIME = `
  const box = document.querySelector("[data-battle-purchase-toasts]");
  if (!box) return JSON.stringify({ ms: 0 });
  const first = box.querySelector("[data-toast]");
  const t0 = performance.now();
  for (let i = 0; i < 80; i++) {
    if (!first.isConnected) return JSON.stringify({ ms: Math.round(performance.now() - t0) });
    await new Promise((r) => setTimeout(r, 100));
  }
  return JSON.stringify({ ms: -1 });
`;

async function shot(chrome, name) {
  const data = await chrome.send("Page.captureScreenshot", { format: "png" });
  const file = resolve(SHOT_DIR, name);
  writeFileSync(file, Buffer.from(data.data, "base64"));
  note(`   截圖 ${relative(ROOT, file).replace(/\\/g, "/")}`);
}

const result = await runGate({
  name: "裝備 Battle HUD（M3b）",
  timeoutMs: 1_700_000,
  run: async ({ chrome, url, ck, sleep }) => {
    const base = `${url}${url.includes("?") ? "&" : "?"}debug=moba-runtime-battle&mapPresentation=runtime-v2&quality=low`;
    const offBaseline = {};
    const offErrors = new Set();
    const errorsSince = (n) => chrome.consoleLines.slice(n).filter((l) => /^\[error\]/i.test(l));
    note(`範圍：ON 寬度 ${ON_WIDTHS.join("/")}；購買通知段 ${SKIP_TOAST ? "略過" : "執行"}`);

    // ── OFF ────────────────────────────────────────────────────────────────
    for (const [w, h, mobile] of [[390, 844, true], [1366, 900, false]]) {
      note(`\n════ itemsV1 OFF｜${w}px ════`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
      const c0 = chrome.consoleLines.length, p0 = chrome.pageErrors.length;
      await chrome.navigate(base);
      const wait = J(await chrome.evaluate(WAIT_BATTLE));
      ck(`OFF ${w}｜戰鬥推進到 ${WAIT_TS}s`, wait.ok, JSON.stringify(wait));
      if (!wait.ok) continue;
      await sleep(800);
      const m = J(await chrome.evaluate(LAYOUT));
      offBaseline[w] = m;
      ck(`OFF ${w}｜snapshot 沒有 items、裝備 HUD DOM = 0、原本「裝備 · 未提供」佔位還在`, m.items === false && m.itemsDom === 0 && (mobile || m.placeholder), `items=${m.items} dom=${m.itemsDom} placeholder=${m.placeholder}`);
      for (const e of errorsSince(c0)) offErrors.add(e.slice(0, 120));
      ck(`OFF ${w}｜page exception = 0`, chrome.pageErrors.length === p0, chrome.pageErrors.slice(p0).join(" | "));
      await shot(chrome, `off-${w}.png`);
    }

    // ── ON ─────────────────────────────────────────────────────────────────
    for (const [w, h, mobile] of ALL_ON.filter(([width]) => ON_WIDTHS.includes(width))) {
      note(`\n════ itemsV1 ON｜${w}px ════`);
      await chrome.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
      const c0 = chrome.consoleLines.length, p0 = chrome.pageErrors.length;
      await chrome.navigate(`${base}&itemsDev=1`);
      const wait = J(await chrome.evaluate(WAIT_BATTLE));
      ck(`ON ${w}｜戰鬥推進到 ${WAIT_TS}s 且 snapshot 有 items`, wait.ok && wait.items, JSON.stringify(wait));
      if (!wait.ok) continue;
      await sleep(800);
      const m = J(await chrome.evaluate(LAYOUT));
      note(`   底欄 ${m.dockH}px　十人列寬 ${m.railW.join("/") || "—"}　席位高 ${[...new Set(m.seatH)].join("/") || "—"}　中央戰場 ${JSON.stringify(m.central)}`);
      ck(`ON ${w}｜不水平溢出`, m.overflow === false, `${m.scrollWidth}/${w}`);
      const ref = offBaseline[w <= 700 ? 390 : 1366];
      ck(`ON ${w}｜焦點底欄沒有加高（${m.dockH}px，OFF 同類寬度 ${ref?.dockH}px）`, ref && Math.abs(m.dockH - ref.dockH) <= 1);
      if (!mobile) ck(`ON ${w}｜桌機席位仍 52px`, m.seatH.length === 10 && m.seatH.every((x) => x === 52), m.seatH.join(","));
      ck(`ON ${w}｜常駐裝備元素不進入中央戰場矩形`, m.centralHits === 0, `hits=${m.centralHits}`);
      if (mobile) ck(`ON ${w}｜手機裝備 chip 點擊區 ≥ 44px`, m.chip.length === 1 && m.chip[0][0] >= 44 && m.chip[0][1] >= 44, JSON.stringify(m.chip));
      if (mobile) {
        ck(`ON ${w}｜手機只出現名字列 chip，不出現桌機「十人裝備」鈕${w === 390 ? "；「隊伍」鈕寬度＝OFF" : ""}`,
          m.chipVisible && !m.dockBtnVisible && (w !== 390 || (ref && m.teamToggleW === ref.teamToggleW)),
          `dock=${m.dockBtnVisible} chip=${m.chipVisible} team=${m.teamToggleW}/${ref?.teamToggleW}`);
      } else {
        ck(`ON ${w}｜桌機只出現底欄「十人裝備」鈕，不出現手機 chip`, m.dockBtnVisible && !m.chipVisible, `dock=${m.dockBtnVisible} chip=${m.chipVisible}`);
      }
      const c = J(await chrome.evaluate(CONSISTENCY));
      ck(`ON ${w}｜畫面上的金錢／背包／指示＝同一 ts 的 selectHudItems（檢查 ${c.checked} 處）`, c.checked > 0 && c.bad.length === 0, c.bad.slice(0, 5).join(" "));
      await shot(chrome, `battle-hud-${w}.png`);

      if (mobile) {
        const s = J(await chrome.evaluate(SHEET));
        ck(`ON ${w}｜裝備 sheet 開啟：在記分板下、底欄上；6 格與按鈕都 ≥ 44（${s.touchCount} 個）`,
          s.ok && s.belowScore && s.aboveDock && s.small.length === 0 && s.slots.length === 6 && s.slots.every(([sw, sh]) => sw >= 44 && sh >= 44),
          JSON.stringify(s).slice(0, 300));
        await shot(chrome, `mobile-items-sheet-${w}.png`);
        const closed = String(await chrome.evaluate(CLOSE_SHEET)).replace(/"/g, "");
        ck(`ON ${w}｜關閉鈕收起 sheet`, closed === "true");
      } else {
        const v = J(await chrome.evaluate(ITEMS_VIEW));
        ck(`ON ${w}｜十人裝備視圖：10 列 × 6 格、席位仍 52px、席位內不溢出`,
          v.ok && v.rows === 10 && v.slots === 60 && v.minSlot >= 20 && v.seats.every((x) => x === 52) && !v.overflowSeat && v.pressed === "true",
          JSON.stringify(v));
        await shot(chrome, `desktop-items-view-${w}.png`);
        await chrome.evaluate(CLOSE_VIEW);
      }
      const newErrors = errorsSince(c0).map((e) => e.slice(0, 120)).filter((e) => !offErrors.has(e));
      ck(`ON ${w}｜page exception = 0、console error 不比 OFF 多`, chrome.pageErrors.length === p0 && newErrors.length === 0,
        [...chrome.pageErrors.slice(p0), ...newErrors].slice(0, 3).join(" | "));
    }

    if (SKIP_TOAST) { note("\n購買通知段：依 ESMO_M3B_SKIP_TOAST=1 略過"); return; }

    // ── 購買通知（1366、4 倍速等真實購買）─────────────────────────────────
    note("\n════ 購買通知｜1366px ════");
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    const speed = String(await chrome.evaluate(CLICK_SPEED)).replace(/"/g, "");
    note(`   倍速：${speed}`);
    const t1 = J(await chrome.evaluate(waitToast(420)));
    ck("通知｜真實對局中出現購買通知，且只有完成裝／鞋子", t1.ok && t1.states.every((s) => s === "completed" || s === "boots") && t1.count <= 2, JSON.stringify(t1));
    if (t1.ok) {
      note(`   通知內容：${t1.text.join(" ／ ")}`);
      ck("通知｜整層 pointer-events: none（不擋點擊）", t1.pointer === "none", t1.pointer);
      await sleep(500);
      await shot(chrome, "purchase-toast-1366.png");
      const life = J(await chrome.evaluate(TOAST_LIFETIME));
      ck(`通知｜約 2.5 秒後消失（剩餘壽命 ${life.ms}ms，出現後已過約 0.6 秒）`, life.ms > 1000 && life.ms < 3000, `${life.ms}`);
      await chrome.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      const gone = J(await chrome.evaluate(`for (let i = 0; i < 60; i++) { if (!document.querySelector("[data-battle-purchase-toasts]")) return JSON.stringify({ ok: true }); await new Promise((r) => setTimeout(r, 100)); } return JSON.stringify({ ok: false });`));
      const t2 = gone.ok ? J(await chrome.evaluate(waitToast(300))) : { ok: false };
      if (t2.ok) {
        ck("通知｜減少動態：一出現就完整可見、沒有掃光層", t2.opacity.every((o) => o === 1) && t2.shine === 0, JSON.stringify(t2));
      } else {
        note("   ⚠ 減少動態：等待期間沒有第二則通知（不列入判定，M3a 已在樣張頁驗證同一元件）");
      }
    }
  },
});

writeFileSync(resolve(SHOT_DIR, `measurements${TAG}.txt`), report.join("\n"), "utf8");
console.log(`\n量測明細：${relative(ROOT, resolve(SHOT_DIR, `measurements${TAG}.txt`)).replace(/\\/g, "/")}`);
finishGate(result);
