#!/usr/bin/env node
// ============================================================================
//  tools/browser_review_moba_items_m3c.mjs — 英雄裝備詳情（M3c）真實戰鬥頁量測與截圖
//
//  執行：node tools/browser/run-gate.mjs tools/browser_review_moba_items_m3c.mjs --timeout 1800000
//
//  真實戰鬥入口 ?debug=moba-runtime-battle（不帶 shot=／diag=，否則診斷面板會蓋住畫面）。
//  OFF（390／1366，戰鬥 90s）：點底欄頭像開英雄面板 ⇒ 沒有「裝備」分頁、沒有裝備 DOM、原本技能說明原文還在。
//  ON（?itemsDev=1，**同一場戰鬥**）：切 4 倍速推進到有人完成 T3 ⇒ 挑完成裝最多的英雄，
//    依序 resize 1366 → 768 → 390 → 320（useIsMobile 監聽 resize），每個寬度：
//    · 桌機：十人列點該英雄 → 底欄頭像開面板 → 「裝備」分頁；手機：裝備 chip → 切換到該英雄 → 「完整出裝詳情」
//    · 金錢／6 格／下一件／還差多少／教練分析＝同一 ts 的 selector
//    · 三層（出裝路徑／屬性與特效／戰術分析）逐一打開、一次只有一層；屬性、特效、合成樹、出裝路徑＝selector
//    · 不水平溢出（整頁與面板內）、手機可點元素 ≥ 44、console error 不比 OFF 多
//    · 截圖
//  記憶體不足時：ESMO_M3C_WIDTHS=1366,390 只跑指定寬度；ESMO_M3C_TAG=final 量測明細另存。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { runGate, finishGate } from "./browser/harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHOT_DIR = resolve(ROOT, process.env.ESMO_REVIEW_OUT ?? "review/moba-items-m3c");
mkdirSync(SHOT_DIR, { recursive: true });
const WIDTHS = [[1366, 900, false], [768, 1024, false], [390, 844, true], [320, 720, true]]
  .filter(([w]) => (process.env.ESMO_M3C_WIDTHS ?? "1366,768,390,320").split(",").map(Number).includes(w));
const TAG = process.env.ESMO_M3C_TAG ? `-${process.env.ESMO_M3C_TAG}` : "";

const report = [];
const note = (line) => { report.push(line); console.log(line); };
const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));
const MODS = `
  const B = location.pathname.endsWith("/") ? location.pathname.slice(0, -1) : location.pathname;
  const store = await import(B + "/src/useGameStore.js");
  const vm = await import(B + "/src/battle/moba/items/itemsViewModel.js");
  const sel = await import(B + "/src/battle/moba/items/itemsUiSelectors.js");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
`;

const waitTs = (ts, limitS) => `
  ${MODS}
  for (let i = 0; i < ${limitS * 4}; i++) {
    const snap = store.useGameStore.getState().snapshot;
    if (snap && snap.ts >= ${ts} && document.querySelector(".observer-dock")) return JSON.stringify({ ok: true, ts: snap.ts, items: !!snap.items });
    await sleep(250);
  }
  return JSON.stringify({ ok: false });
`;

const CLICK_SPEED = `const b = [...document.querySelectorAll("button")].find((x) => (x.innerText || "").trim() === "4×"); if (b) b.click(); return b ? "4x" : "no-4x";`;

/** 等到有人完成 T3，回傳完成裝最多、且活著的席位。 */
const WAIT_COMPLETED = `
  ${MODS}
  for (let i = 0; i < 2400; i++) {
    const snap = store.useGameStore.getState().snapshot;
    const hud = snap && sel.selectHudItems(snap);
    if (hud) {
      const alive = new Set((snap.players || []).filter((p) => !p.dead).map((p) => p.id));
      const best = Object.entries(hud).filter(([id]) => alive.has(id)).sort((a, b) => b[1].completedCount - a[1].completedCount || a[0].localeCompare(b[0]))[0];
      if (best && best[1].completedCount >= 1) return JSON.stringify({ ok: true, seat: best[0], completed: best[1].completedCount, ts: snap.ts });
    }
    await sleep(250);
  }
  return JSON.stringify({ ok: false });
`;

const CLOSE_ALL = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 3; i++) {
    const close = document.querySelector("[data-hero-sheet] button[aria-label='關閉']") || document.querySelector("[data-mobile-items-sheet] button[aria-label='關閉裝備']");
    if (!close) break;
    close.click(); await sleep(250);
  }
  return "closed";
`;

/** 開啟指定席位的英雄面板裝備分頁（桌機：十人列→頭像→分頁；手機：chip→切換→完整出裝詳情）。 */
const openDetail = (seat, mobile) => `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (s) => document.querySelector(s);
  if (${mobile}) {
    q("[data-items-chip]")?.click(); await sleep(350);
    const pickBtn = q('[data-pick-seat="${seat}"]');
    if (pickBtn) { pickBtn.click(); await sleep(350); }
    const open = q('[data-open-hero-detail="${seat}"]');
    if (!open) return JSON.stringify({ ok: false, why: "no open-detail for ${seat}" });
    open.click(); await sleep(500);
  } else {
    const seatBtn = q('.observer-teams [data-seat="${seat}"]');
    if (!seatBtn) return JSON.stringify({ ok: false, why: "no rail seat" });
    seatBtn.click(); await sleep(300);
    q(".observer-identity")?.click(); await sleep(400);
    const tab = q('[data-hero-sheet-tab="items"]');
    if (!tab) return JSON.stringify({ ok: false, why: "no items tab" });
    tab.click(); await sleep(400);
  }
  const d = q('[data-hero-item-detail="embedded"]');
  return JSON.stringify({ ok: !!d, seat: d ? d.dataset.playerId : null, tabSelected: q('[data-hero-sheet-tab="items"]')?.getAttribute("aria-selected") });
`;

/** 第一層＋版面量測與 selector 比對（同一 ts）。 */
const MEASURE = (mobile) => `
  ${MODS}
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  for (let i = 0; i < 300; i++) {
    const d = document.querySelector('[data-hero-item-detail="embedded"]');
    const snap = store.useGameStore.getState().snapshot;
    if (!d) return JSON.stringify({ ok: false, why: "no detail" });
    if (snap && Number(d.dataset.itemsTs) === snap.ts) {
      const seat = d.dataset.playerId;
      const view = vm.selectPlayerItemsView(snap, seat);
      const hud = sel.selectHudItems(snap)[seat];
      const analysis = sel.coachAnalysis(view, hud);
      const bad = [];
      const goldText = (d.querySelector("[aria-label^='可用金錢']") || {}).textContent || "";
      if (goldText.replace(/[^0-9]/g, "") !== String(view.gold.unspent)) bad.push("gold=" + goldText);
      const slotLabels = [...d.querySelectorAll('[role="list"] button[aria-label]')].slice(0, 6).map((b) => b.getAttribute("aria-label"));
      const expectSlots = view.slots.map((s) => s.itemId ? s.name : "空格");
      if (JSON.stringify(slotLabels) !== JSON.stringify(expectSlots)) bad.push("slots=" + slotLabels.join("|"));
      const nextName = d.querySelector("[data-next-item-name]");
      if ((nextName ? nextName.dataset.nextItemName : null) !== (view.nextItem ? view.nextItem.itemId : null)) bad.push("next");
      const shortEl = d.querySelector("[data-next-shortfall]");
      if (view.nextItem && Number(shortEl ? shortEl.dataset.nextShortfall : -1) !== (view.nextItem.affordable ? 0 : hud.nextShortfall)) bad.push("shortfall=" + (shortEl && shortEl.dataset.nextShortfall));
      const coach = [...d.querySelectorAll("[data-coach-row]")].map((li) => li.dataset.coachText);
      if (JSON.stringify(coach) !== JSON.stringify(analysis.slice(0, 2).map((r) => r.text))) bad.push("coach=" + coach.join("|"));
      const sheet = document.querySelector("[data-hero-sheet]");
      const touch = [...sheet.querySelectorAll("[data-touch]")].filter((el) => el.getBoundingClientRect().width > 0).map((el) => { const r = rect(el); return { l: (el.getAttribute("aria-label") || el.innerText || "").trim().slice(0, 10), w: Math.round(r.w * 10) / 10, h: Math.round(r.h * 10) / 10 }; });
      const sr = rect(sheet);
      return JSON.stringify({
        ok: true, ts: snap.ts, seat, bad, coachRows: coach, analysisTotal: analysis.length,
        gold: view.gold.unspent, next: view.nextItem ? view.nextItem.name : null, shortfall: hud.nextShortfall,
        overflow: document.documentElement.scrollWidth > innerWidth + 1, sheetOverflow: sheet.scrollWidth > sheet.clientWidth + 1,
        sheet: [Math.round(sr.x), Math.round(sr.y), Math.round(sr.w), Math.round(sr.h)], vw: innerWidth, vh: innerHeight,
        small: ${mobile} ? touch.filter((t) => t.w < 44 || t.h < 44) : [], touchCount: touch.length,
        tabs: [...sheet.querySelectorAll("[data-hero-sheet-tab]")].map((b) => Math.round(b.getBoundingClientRect().height)),
      });
    }
    await sleep(5);
  }
  return JSON.stringify({ ok: false, why: "ts never matched" });
`;

/** 打開某一層並比對內容。 */
const LAYER = (id) => `
  ${MODS}
  const d = document.querySelector('[data-hero-item-detail="embedded"]');
  const tab = d && d.querySelector('[data-detail-layer-tab="${id}"]');
  if (!tab) return JSON.stringify({ ok: false, why: "no tab" });
  if (tab.getAttribute("aria-selected") !== "true") { tab.click(); await sleep(350); }
  for (let i = 0; i < 300; i++) {
    const snap = store.useGameStore.getState().snapshot;
    const dd = document.querySelector('[data-hero-item-detail="embedded"]');
    if (snap && Number(dd.dataset.itemsTs) === snap.ts) {
      const seat = dd.dataset.playerId;
      const view = vm.selectPlayerItemsView(snap, seat);
      const hud = sel.selectHudItems(snap)[seat];
      const bad = [];
      const open = [...dd.querySelectorAll("[data-detail-layer]")].map((el) => el.dataset.detailLayer);
      if (JSON.stringify(open) !== JSON.stringify(["${id}"])) bad.push("layers=" + open.join(","));
      if ("${id}" === "path") {
        const path = [...dd.querySelectorAll('[data-detail-layer="path"] ol[aria-label="出裝路徑"] > li')].length;
        if (path !== view.buildPath.length) bad.push("path=" + path + "/" + view.buildPath.length);
        const root = dd.querySelector("[data-recipe-root]");
        if ((root ? root.dataset.recipeRoot : null) !== (view.nextItem ? view.nextItem.itemId : null)) bad.push("recipeRoot");
        const flat = (n) => [n.itemId + ":" + (n.owned ? 1 : 0), ...(n.components || []).flatMap(flat)];
        const nodes = [...dd.querySelectorAll("[data-recipe-node]")].map((el) => el.dataset.recipeNode + ":" + el.dataset.owned);
        if (view.nextItem && JSON.stringify(nodes) !== JSON.stringify(flat(view.nextItem.recipe))) bad.push("recipe=" + nodes.join(","));
      }
      if ("${id}" === "stats") {
        const shown = Object.fromEntries([...dd.querySelectorAll("[data-stat-key]")].map((el) => [el.dataset.statKey, el.dataset.statShown]));
        const PCT = new Set(["attackSpeed", "critChance", "armorPenPct", "magicPenPct", "lifesteal", "omnivamp", "moveSpeed", "healShieldPower"]);
        const KEYS = ["hp", "ad", "ap", "armor", "mr", "attackSpeed", "critChance", "armorPenFlat", "armorPenPct", "magicPenFlat", "magicPenPct", "lifesteal", "omnivamp", "abilityHaste", "moveSpeed", "healShieldPower"];
        const expect = Object.fromEntries(KEYS.filter((k) => Number(view.stats[k]) > 0).map((k) => [k, PCT.has(k) ? Math.round(view.stats[k] * 100) + "%" : String(view.stats[k])]));
        if (JSON.stringify(shown) !== JSON.stringify(expect)) bad.push("stats=" + JSON.stringify(shown));
        const fx = sel.selectActiveEffects(view);
        const types = [...dd.querySelectorAll("[data-effect-type]")].map((el) => el.dataset.effectType);
        const kinds = [...dd.querySelectorAll("[data-status-kind]")].map((el) => el.dataset.statusKind);
        if (JSON.stringify(types) !== JSON.stringify(fx.effects.map((e) => e.type))) bad.push("effects=" + types.join(","));
        if (JSON.stringify(kinds) !== JSON.stringify(fx.status.map((s) => s.kind))) bad.push("status=" + kinds.join(","));
      }
      if ("${id}" === "analysis") {
        const rows = [...dd.querySelectorAll('[data-detail-layer="analysis"] [data-coach-row]')].map((li) => li.dataset.coachText);
        const expect = sel.coachAnalysis(view, hud).map((r) => r.text);
        if (JSON.stringify(rows) !== JSON.stringify(expect)) bad.push("analysis=" + rows.join("|"));
      }
      const sheet = document.querySelector("[data-hero-sheet]");
      return JSON.stringify({ ok: true, bad, overflow: document.documentElement.scrollWidth > innerWidth + 1, sheetOverflow: sheet.scrollWidth > sheet.clientWidth + 1 });
    }
    await sleep(5);
  }
  return JSON.stringify({ ok: false, why: "ts never matched" });
`;

async function shot(chrome, name, full = false) {
  let params = { format: "png" };
  if (full) {
    //  面板內容可捲動：把面板捲到頂後截視窗即可（全螢幕 sheet 本身就是視窗大小）
    params = { format: "png" };
  }
  const data = await chrome.send("Page.captureScreenshot", params);
  const file = resolve(SHOT_DIR, name);
  writeFileSync(file, Buffer.from(data.data, "base64"));
  note(`   截圖 ${relative(ROOT, file).replace(/\\/g, "/")}`);
}
const scrollSheetTo = (sel) => `const s = document.querySelector("[data-hero-sheet] > div:last-child"); const t = document.querySelector('${sel}'); if (s && t) { s.scrollTop = Math.max(0, t.offsetTop - 60); } await new Promise((r) => setTimeout(r, 250)); return "ok";`;

const result = await runGate({
  name: "英雄裝備詳情（M3c）",
  timeoutMs: 1_700_000,
  run: async ({ chrome, url, ck, sleep }) => {
    const base = `${url}${url.includes("?") ? "&" : "?"}debug=moba-runtime-battle&mapPresentation=runtime-v2&quality=low`;
    const offErrors = new Set();
    const errorsSince = (n) => chrome.consoleLines.slice(n).filter((l) => /^\[error\]/i.test(l));

    // ── OFF ────────────────────────────────────────────────────────────────
    for (const [w, h, mobile] of [[390, 844, true], [1366, 900, false]]) {
      note(`\n════ itemsV1 OFF｜${w}px ════`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
      const c0 = chrome.consoleLines.length, p0 = chrome.pageErrors.length;
      await chrome.navigate(base);
      const wt = J(await chrome.evaluate(waitTs(90, 150)));
      ck(`OFF ${w}｜戰鬥推進到 90s`, wt.ok && wt.items === false, JSON.stringify(wt));
      if (!wt.ok) continue;
      const r = J(await chrome.evaluate(`
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        document.querySelector(".observer-identity")?.click(); await sleep(500);
        const sheet = document.querySelector("[data-hero-sheet]");
        return JSON.stringify({ sheet: !!sheet, tabs: document.querySelectorAll("[data-hero-sheet-tab]").length,
          detail: document.querySelectorAll("[data-hero-item-detail]").length,
          original: !!sheet && (sheet.innerText || "").includes("本場尚未提供個別技能冷卻、裝備與魔力資訊"),
          width: sheet ? Math.round(sheet.getBoundingClientRect().width) : 0 });`));
      ck(`OFF ${w}｜英雄面板照舊：沒有「裝備」分頁、沒有裝備詳情、原本說明原文還在`, r.sheet && r.tabs === 0 && r.detail === 0 && r.original, JSON.stringify(r));
      if (!mobile) ck(`OFF ${w}｜桌機面板寬度仍 340px`, r.width === 340, `${r.width}`);
      await shot(chrome, `off-hero-sheet-${w}.png`);
      for (const e of errorsSince(c0)) offErrors.add(e.slice(0, 120));
      ck(`OFF ${w}｜page exception = 0`, chrome.pageErrors.length === p0, chrome.pageErrors.slice(p0).join(" | "));
    }

    // ── ON：同一場戰鬥 ─────────────────────────────────────────────────────
    note("\n════ itemsV1 ON｜推進到有人完成裝 ════");
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    const c0 = chrome.consoleLines.length, p0 = chrome.pageErrors.length;
    await chrome.navigate(`${base}&itemsDev=1`);
    const wt = J(await chrome.evaluate(waitTs(60, 150)));
    ck("ON｜戰鬥開始且 snapshot 有 items", wt.ok && wt.items, JSON.stringify(wt));
    if (!wt.ok) return;
    note(`   倍速：${String(await chrome.evaluate(CLICK_SPEED)).replace(/"/g, "")}`);
    const target = J(await chrome.evaluate(WAIT_COMPLETED));
    ck("ON｜真實對局中有人完成 T3", target.ok, JSON.stringify(target));
    if (!target.ok) return;
    note(`   目標英雄 ${target.seat}（完成裝 ${target.completed} 件，ts ${target.ts}）`);
    //  降回 1 倍速，避免量測中狀態變化太快
    await chrome.evaluate(`const b = [...document.querySelectorAll("button")].find((x) => (x.innerText || "").trim() === "1×"); if (b) b.click(); return "1x";`);

    for (const [w, h, mobile] of WIDTHS) {
      note(`\n════ itemsV1 ON｜${w}px ════`);
      await chrome.evaluate(CLOSE_ALL);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
      await sleep(900);
      const o = J(await chrome.evaluate(openDetail(target.seat, mobile)));
      ck(`ON ${w}｜${mobile ? "裝備 sheet →「完整出裝詳情」" : "十人列 → 頭像 →「裝備」分頁"}開到 ${target.seat} 的裝備詳情`, o.ok && o.seat === target.seat && o.tabSelected === "true", JSON.stringify(o));
      if (!o.ok) continue;
      const m = J(await chrome.evaluate(MEASURE(mobile)));
      note(`   金錢 ${m.gold}　下一件 ${m.next}　還差 ${m.shortfall}　教練重點：${(m.coachRows || []).join("／")}`);
      ck(`ON ${w}｜金錢／6 格／下一件／還差多少／教練重點＝同一 ts 的 selector`, m.ok && m.bad.length === 0, (m.bad || [m.why]).join(" "));
      ck(`ON ${w}｜不水平溢出（整頁與面板內）`, m.ok && !m.overflow && !m.sheetOverflow, `page=${m.overflow} sheet=${m.sheetOverflow}`);
      if (mobile) {
        ck(`ON ${w}｜全螢幕 sheet（${m.sheet?.join("×")}）、可點元素都 ≥ 44（${m.touchCount} 個）`,
          m.sheet && m.sheet[2] === w && m.small.length === 0, m.small.map((t) => `${t.l}(${t.w}×${t.h})`).join(" "));
      } else {
        ck(`ON ${w}｜桌機面板 380px、分頁鈕 44px`, m.sheet && m.sheet[2] === 380 && m.tabs.every((x) => x >= 44), JSON.stringify({ sheet: m.sheet, tabs: m.tabs }));
      }
      await shot(chrome, `hero-detail-${w}.png`);
      for (const id of ["path", "stats", "analysis"]) {
        const l = J(await chrome.evaluate(LAYER(id)));
        ck(`ON ${w}｜第二層「${{ path: "出裝路徑", stats: "屬性與特效", analysis: "戰術分析" }[id]}」：只開這一層、內容＝selector、不溢出`,
          l.ok && l.bad.length === 0 && !l.overflow && !l.sheetOverflow, (l.bad || [l.why]).join(" "));
        if (w === 390 || w === 1366 || (w === 320 && id === "stats")) {
          await chrome.evaluate(scrollSheetTo(`[data-detail-layer="${id}"]`));
          await shot(chrome, `hero-detail-${id}-${w}.png`);
        }
      }
      const newErrors = errorsSince(c0).map((e) => e.slice(0, 120)).filter((e) => !offErrors.has(e));
      ck(`ON ${w}｜page exception = 0、console error 不比 OFF 多`, chrome.pageErrors.length === p0 && newErrors.length === 0,
        [...chrome.pageErrors.slice(p0), ...newErrors].slice(0, 3).join(" | "));
    }
  },
});

writeFileSync(resolve(SHOT_DIR, `measurements${TAG}.txt`), report.join("\n"), "utf8");
console.log(`\n量測明細：${relative(ROOT, resolve(SHOT_DIR, `measurements${TAG}.txt`)).replace(/\\/g, "/")}`);
finishGate(result);
