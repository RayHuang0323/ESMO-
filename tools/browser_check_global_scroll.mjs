#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_global_scroll.mjs — 全域 Scroll Contract 驗證
//
//  執行：`node tools/browser_check_global_scroll.mjs [--headed]`；失敗 exit 1。
//
//  ── 這支在守什麼 ────────────────────────────────────────────────────────
//  `AppShell` 的**單一容器**曾經是 `height: min(88vh,760px)` ＋ `overflow:hidden`，
//  所有畫面都裝在裡面 ⇒ 內容一超過就被裁掉、滾輪也捲不動。那不是某幾頁的
//  bug，是全域契約，所以驗證也是全域的：
//
//    · 一般管理／生涯頁：文件必須**真的捲到最底**
//    · 對戰／載入／過場：維持鎖住 viewport（那是刻意的）
//    · 手機底部導覽不得蓋住最後一行內容
//
//  ── 兩個量測上的坑（都踩過，寫下來免得再踩）──────────────────────────────
//  ① 「能捲」不能用 `scrollHeight > clientHeight` 判定——那在 `overflow:hidden`
//     之下也成立，正是舊行為會漏掉的地方。判準是**捲完之後真的到底**。
//  ② 入口的 id **不等於** screen id（`development` → `teamDevelopment`），而且
//     桌機與手機的入口清單**不一樣**（桌機 utility 磚沒有名單／發展／財務）。
//     所以不猜 selector：直接從 DOM 列出這台裝置真實存在的入口，只測到得了的；
//     另外用一條 coverage 斷言確保沒有畫面在**兩種裝置上都**沒有入口。
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5356;
const CDP_PORT = 9395;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 要覆蓋的管理／生涯畫面。左邊是**入口 id**（utilityItems / groups 的 `id`）。 */
const TARGETS = Object.freeze([
  ["clubMastery", "俱樂部專精"],
  ["development", "戰隊發展"],
  ["training", "訓練中心"],
  ["roster", "選手名單"],
  ["objectives", "俱樂部目標"],
  ["finance", "財務"],
  ["team", "戰隊總覽"],
  ["recruit", "招募選手"],
]);

/** 列出**這台裝置**首頁真的到得了的入口，以及各自要怎麼點。 */
const ENUMERATE_ENTRIES = `
  const found = {};
  const scan = (via) => {
    for (const el of document.querySelectorAll('[data-testid^="home-utility-"],[data-testid^="home-sheet-"]')) {
      const t = el.dataset.testid;
      const id = t.replace(/^home-(utility|sheet)-/, "");
      if (!found[id]) found[id] = { testid: t, via };
    }
  };
  scan(null);
  //  手機的入口散在底部分頁的 sheet 裡；逐一打開再掃一次。
  for (const tab of ["home-nav-team", "home-nav-more"]) {
    const t = document.querySelector('[data-testid="' + tab + '"]');
    if (!t) continue;
    t.click();
    await new Promise(r => setTimeout(r, 480));
    scan(tab);
  }
  return JSON.stringify(found);
`;

/** 依枚舉結果導覽到某一頁。 */
const gotoEntry = (entry) => `
  const byTestId = (t) => document.querySelector('[data-testid="' + t + '"]');
  ${entry.via ? `
  const tab = byTestId(${JSON.stringify(entry.via)});
  if (tab) { tab.click(); await new Promise(r => setTimeout(r, 480)); }
  ` : ""}
  const btn = byTestId(${JSON.stringify(entry.testid)});
  if (!btn) return "no-entry";
  btn.click();
  await new Promise(r => setTimeout(r, 900));
  return "clicked";
`;

/** 量：文件是否真的捲得動、能不能捲到底。 */
const MEASURE = `
  const de = document.documentElement;
  const before = window.scrollY;
  window.scrollTo(0, 999999);
  await new Promise(r => setTimeout(r, 280));
  const after = window.scrollY;
  const reachedBottom = Math.abs((window.scrollY + de.clientHeight) - de.scrollHeight) <= 3;
  const shell = document.querySelector("#root > div");
  const cs = shell ? getComputedStyle(shell) : null;
  window.scrollTo(0, 0);
  return JSON.stringify({
    docScrollH: de.scrollHeight, viewport: de.clientHeight,
    tall: de.scrollHeight > de.clientHeight + 4,
    moved: after > before,
    reachedBottom,
    shellOverflowY: cs ? cs.overflowY : null,
    shellLocked: shell ? shell.dataset.viewportLocked : null,
  });
`;

/**
 * 底部導覽有沒有蓋住最後一行**內容**。
 *
 * ⚠ 只量 leaf content：沒有子元素、且真的有文字或是圖像的節點。
 *   取「所有元素中 bottom 最大者」會量到滿高的 wrapper——它永遠貼著 viewport
 *   底部，於是永遠報遮擋。那是假紅，不是遮擋。
 */
const NAV_OVERLAP = `
  const nav = document.querySelector('[data-dashboard-mobile-nav]');
  if (!nav) return JSON.stringify({ skip: true });
  window.scrollTo(0, 999999);
  await new Promise(r => setTimeout(r, 280));
  const navTop = nav.getBoundingClientRect().top;
  let worst = null;
  for (const el of document.body.querySelectorAll("*")) {
    if (nav.contains(el) || el === nav) continue;
    if (el.children.length > 0) continue;                     // 只看 leaf
    const tag = el.tagName;
    const hasInk = (el.textContent || "").trim().length > 0 || tag === "IMG" || tag === "SVG" || tag === "CANVAS";
    if (!hasInk) continue;
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" || cs.position === "absolute") continue;
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 4 || r.width < 4) continue;
    if (r.bottom <= 0 || r.top >= window.innerHeight) continue; // 不在畫面內的不算
    if (!worst || r.bottom > worst.bottom) {
      worst = { bottom: r.bottom, tag, text: (el.textContent || "").trim().slice(0, 24) };
    }
  }
  window.scrollTo(0, 0);
  return JSON.stringify({
    skip: false, navTop,
    lastBottom: worst ? worst.bottom : 0,
    lastText: worst ? worst.text : "(none)",
    clear: !worst || worst.bottom <= navTop + 1,
  });
`;

const reachableAll = new Set();
let server = null, chrome = null;
try {
  server = await startDevServer({ port: VITE_PORT });
  chrome = await launchChrome({ url: server.url, port: CDP_PORT, headless: HEADLESS });

  for (const [label, width, height, mobile] of [["桌機 1366px", 1366, 768, false], ["手機 390px", 390, 844, true]]) {
    console.log(`\n══ ${label} ══`);
    await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    await chrome.navigate(server.url);
    await sleep(900);
    await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      localStorage.removeItem("esmo.profile.v1");
      profile.useProfileStore.getState().startNewGame("elite");
      profile.useProfileStore.getState().save();
      return "seeded";
    `);
    await chrome.navigate(server.url);
    await sleep(1300);

    //  ① Shell 契約
    const home = JSON.parse(String(await chrome.evaluate(MEASURE)).replace(/^"|"$/g, ""));
    ck(`${label}｜首頁不是被鎖住的 viewport`, home.shellLocked === "0", `locked=${home.shellLocked}`);
    ck(`${label}｜首頁容器 overflow 不是 hidden`, home.shellOverflowY !== "hidden", String(home.shellOverflowY));

    //  ①-b 底部導覽遮擋（只有手機有導覽）
    if (mobile) {
      const N = JSON.parse(String(await chrome.evaluate(NAV_OVERLAP)).replace(/^"|"$/g, ""));
      ck(`${label}｜底部導覽不遮住最後內容`, N.skip || N.clear === true,
        N.skip ? "此頁無底部導覽" : `navTop=${Math.round(N.navTop)} lastBottom=${Math.round(N.lastBottom)} 「${N.lastText}」`);
    }

    //  ② 枚舉這台裝置真的到得了的入口
    await chrome.navigate(server.url);
    await sleep(1200);
    const entries = JSON.parse(String(await chrome.evaluate(ENUMERATE_ENTRIES)).replace(/^"|"$/g, ""));
    const reachable = TARGETS.filter(([id]) => entries[id]);
    for (const [id] of reachable) reachableAll.add(id);
    console.log(`   （本裝置可達 ${reachable.length}/${TARGETS.length}：${reachable.map(([, zh]) => zh).join("、")}）`);

    //  ③ 逐頁量捲動
    for (const [id, zh] of reachable) {
      await chrome.navigate(server.url);
      await sleep(1100);
      const nav = await chrome.evaluate(gotoEntry(entries[id]));
      if (String(nav).includes("no-entry")) { ck(`${label}｜${zh}：導覽可用`, false, "no-entry"); continue; }
      const m = JSON.parse(String(await chrome.evaluate(MEASURE)).replace(/^"|"$/g, ""));
      ck(`${label}｜${zh} 容器未鎖 viewport`, m.shellLocked === "0", `locked=${m.shellLocked}`);
      if (m.tall) {
        ck(`${label}｜${zh} 捲得動`, m.moved === true, `docH=${m.docScrollH} vh=${m.viewport}`);
        ck(`${label}｜${zh} 可捲到最底`, m.reachedBottom === true, `docH=${m.docScrollH}`);
      } else {
        ck(`${label}｜${zh} 內容未超過一個 viewport`, true, `docH=${m.docScrollH} vh=${m.viewport}`);
      }
    }

    //  ④ 契約標記存在
    const contract = JSON.parse(String(await chrome.evaluate(`
      const shell = document.querySelector("#root > div");
      return JSON.stringify({ hasFlag: shell ? shell.dataset.viewportLocked !== undefined : false });
    `)).replace(/^"|"$/g, ""));
    ck(`${label}｜容器帶 viewport-locked 契約標記`, contract.hasFlag === true);
  }

  //  ⑤ 覆蓋率：不得有畫面在**兩種裝置上都**沒有入口。
  //  ⚠ 這條才是「真的漏接線」的守門員——單一裝置缺入口是設計差異，
  //    兩種裝置都缺就是那個功能沒有人到得了。
  const unreachable = TARGETS.filter(([id]) => !reachableAll.has(id));
  ck("覆蓋率：每個管理畫面至少有一條正式導覽可達",
    unreachable.length === 0, unreachable.map(([, zh]) => zh).join("、") || "全部可達");
} catch (e) {
  ck("harness", false, String(e?.message ?? e));
} finally {
  try { await chrome?.close?.(); } catch { /* ignore */ }
  try { await server?.close?.(); } catch { /* ignore */ }
}

console.log(`\n全域捲動契約：${pass}/${pass + fail} ${fail === 0 ? "PASS" : "FAIL"}`);
if (fail) process.exitCode = 1;
