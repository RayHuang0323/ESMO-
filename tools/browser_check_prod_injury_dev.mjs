#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_prod_injury_dev.mjs — 正式站 smoke（Injury Removal ＋ DEV 工具）
//
//  用法：`node tools/browser_check_prod_injury_dev.mjs [url]`
//        預設 https://rayhuang0323.github.io/ESMO-/
//
//  ── 與本機 gate 的差別 ────────────────────────────────────────────────────
//  打的是 **build 產物**，`import('/ESMO-/src/...')` 拿不到原始模組
//  ⇒ **全程只能走 UI 與 localStorage**，不能 import Store。
//  用**獨立 Chrome ＋ 獨立 user-data-dir** ⇒ 正式站那個 origin 在這個瀏覽器裡
//  是全新 profile，**完全不會碰到 Ray 的正式站存檔**。
//
//  ── 兩個 phase ────────────────────────────────────────────────────────────
//  Phase 1  正式／預設造訪（沒有任何參數）⇒ 驗 injury 已消失、DEV 工具看不到
//  Phase 2  `?debug=1` ⇒ 驗 DEV 工具可用（推進 1／3 天、恢復至可出賽）
//
//  ⚠ 門檻不寫死：`CONDITION.unfitBelow` 由**本機同一個 commit** 的原始碼讀出來
//    再注入頁面判斷。部署的就是這份程式碼，所以這樣既不寫死也不作弊。
// ============================================================================
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { launchChrome } from "./browser/cdp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROD = (process.argv[2] ?? "https://rayhuang0323.github.io/ESMO-/").replace(/\/?$/, "/");
const CDP_PORT = 9396;
const HEADLESS = !process.argv.includes("--headed");
const KEY = "esmo.profile.v1";

const cond = await import(pathToFileURL(resolve(ROOT, "src/platform/condition/playerCondition.js")).href);
const UNFIT_BELOW = cond.CONDITION.unfitBelow;      // authoritative，不是寫死的字面量

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const note = (t) => console.log(`   · ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INJURY_WORDING = /傷停|療傷|傷病|受傷|還需\s*\d+\s*天/;
const PANEL = '[data-testid="dev-quick-recovery"]';

async function waitFor(chrome, expr, timeoutMs = 20_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { if (await chrome.evaluate(`return Boolean(${expr});`)) return true; } catch {}
    await sleep(300);
  }
  return false;
}
//  首頁磚是 GSAP reveal（進場前 visibility:hidden ⇒ innerText 為空），
//  用文字找按鈕必須等它**可見**，不能只等它存在。
const clickText = async (chrome, needle, timeoutMs = 15_000) => {
  const until = Date.now() + timeoutMs;
  const expr = `const b = [...document.querySelectorAll("button")].find((x) => (x.innerText||"").includes(${JSON.stringify(needle)}));`
    + `if (!b) return false; b.click(); return true;`;
  while (Date.now() < until) {
    try { if (await chrome.evaluate(expr)) return true; } catch {}
    await sleep(300);
  }
  return false;
};
const clickTestId = (chrome, id) =>
  chrome.evaluate(`const b = document.querySelector('[data-testid="${id}"]'); b?.click(); return Boolean(b);`);
const bodyText = (chrome) => chrome.evaluate(`return (document.body.innerText || "").replace(/\\s+/g, " ");`);
const overflowed = (chrome) => chrome.evaluate(`return document.body.scrollWidth > window.innerWidth + 1;`);
const readSave = (chrome) => chrome.evaluate(`
  try { const raw = localStorage.getItem(${JSON.stringify(KEY)}); return raw ? JSON.parse(raw) : null; }
  catch { return null; }`);

async function goto(chrome, url) { await chrome.navigate(url); await sleep(1800); }

/** 走到訓練中心（桌機是「訓練中心」磚；手機在「戰隊」sheet 裡）。 */
async function openTraining(chrome, url, mobile) {
  await goto(chrome, url);
  if (mobile) {
    await chrome.evaluate(`document.querySelector('[data-testid="home-nav-team"]')?.click(); return true;`);
    await waitFor(chrome, `document.querySelector('[data-testid="home-sheet-training"]')`, 10_000);
    await clickTestId(chrome, "home-sheet-training");
  } else {
    //  ⚠ 不能用「訓練」當關鍵字：首頁 CS 模式磚寫的是「CS 訓練賽」，會先被點到。
    await clickText(chrome, "訓練中心");
  }
  return waitFor(chrome, `(document.body.innerText||"").includes("推進訓練日")`, 20_000);
}

/** 把舊存檔情境寫進 localStorage（正式站唯一能塞資料的方式）。 */
const seedRoster = (chrome, mutate) => chrome.evaluate(`
  const raw = localStorage.getItem(${JSON.stringify(KEY)});
  if (!raw) return { ok: false, reason: "沒有存檔可改" };
  const s = JSON.parse(raw);
  s.players = (s.players ?? []).map(${mutate});
  localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify(s));
  return { ok: true, count: s.players.length, first: s.players[0] };`);

const OLD_SAVE = `(p, i) => {
  if (i === 0) return { ...p, name: "Kaiser", age: 27, energy: 66, condition: "正常",
                        injuryDays: 6, injured: true, injuryUntil: 999, injuryRisk: 0.4,
                        rosterTier: "active", status: "主力", training: null };
  if (i === 1) return { ...p, name: "Tired", energy: 5, condition: "低潮",
                        rosterTier: "active", status: "主力", training: null };
  return { ...p, energy: 90, condition: "精神飽滿", rosterTier: "active", status: "主力", training: null };
}`;
const FLATTEN = `(p) => ({ ...p, energy: 0, condition: "低潮", training: null, rosterTier: "active", status: "主力" })`;

let chrome = null;
try {
  chrome = await launchChrome({ url: PROD, port: CDP_PORT, headless: HEADLESS });

  // ── 佈置：先讓正式站產生一份存檔（用 ?debug=1 的 DEV 推進鈕觸發 save）──────
  console.log("\n══ 佈置 ══");
  await goto(chrome, `${PROD}?debug=1`);
  const trainingForSeed = await openTraining(chrome, `${PROD}?debug=1`, false);
  if (trainingForSeed) { await clickTestId(chrome, "dev-advance-1"); await sleep(1200); }
  let save = await readSave(chrome);
  ck("S1) 正式站可產生存檔（後續情境才塞得進去）", save !== null && Array.isArray(save.players),
    save ? `${save.players?.length} 名選手，第 ${save.meta?.days} 天` : "(無存檔)");
  if (!save) throw new Error("正式站沒有產生存檔，後續情境無法佈置");

  const seeded = await seedRoster(chrome, OLD_SAVE);
  ck("S2) 舊存檔情境寫入（Kaiser age 27／體力 66／injuryDays 6；另一人體力 5）",
    seeded.ok === true && Number(seeded.first?.injuryDays) === 6,
    JSON.stringify({ age: seeded.first?.age, energy: seeded.first?.energy, injuryDays: seeded.first?.injuryDays }));

  // ══ Phase 1：正式／預設造訪（沒有任何參數）════════════════════════════════
  console.log("\n══ Phase 1：正式／預設造訪（無參數，DEV 應完全隱形）══");

  //  ⚠ 先記錄一個**既有行為**（不是本輪造成，與 devFastForward 共用）：
  //    `isDebugMode()` 是在**元件 render 時**才被呼叫的，而首頁沒有任何元件會叫它
  //    ⇒ 只是打開 `?debug=0` 的首頁，`esmo_debug` 旗標**不會**被清掉。
  //    要清掉得走到會呼叫它的畫面（訓練中心／戰鬥／財務…）。這是 debugMode.js
  //    的既有瑕疵，本輪只記錄、不順手改（改它會動到既有的驗收流程）。
  await goto(chrome, `${PROD}?debug=0`);
  const afterDebugZeroOnHome = await chrome.evaluate(`return localStorage.getItem("esmo_debug");`);
  note(`既有行為記錄：首頁 ?debug=0 之後 esmo_debug = ${JSON.stringify(afterDebugZeroOnHome)}`
    + "（首頁不呼叫 isDebugMode ⇒ 清除不會發生；與 devFastForward 同一條規則）");

  //  真正的「正式／預設造訪」＝ 從來沒開過 debug 的瀏覽器。直接把旗標拿掉來模擬。
  await chrome.evaluate(`localStorage.removeItem("esmo_debug"); return true;`);
  await goto(chrome, PROD);
  const dbgCleared = await chrome.evaluate(`return localStorage.getItem("esmo_debug");`);
  ck("P1-0) 已還原成「從未開過 debug」的瀏覽器（接下來才是真正的預設造訪）",
    dbgCleared === null, String(dbgCleared));

  for (const vp of [
    { label: "Desktop 1366", w: 1366, h: 900, mobile: false },
    { label: "Mobile 390", w: 390, h: 844, mobile: true },
  ]) {
    console.log(`\n── ${vp.label} ───────────────────────────────`);
    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile });

    // HOME
    await goto(chrome, PROD);
    const home = await bodyText(chrome);
    ck(`${vp.label}｜HOME 無傷停 UI`,
      !INJURY_WORDING.test(home), (home.match(INJURY_WORDING) ?? []).join("") || "(乾淨)");
    ck(`${vp.label}｜HOME 無橫向捲動`, !(await overflowed(chrome)));

    // ROSTER
    if (vp.mobile) {
      await chrome.evaluate(`document.querySelector('[data-testid="home-nav-team"]')?.click(); return true;`);
      await sleep(900);
    }
    const rosterOpen = await clickText(chrome, "選手")
      && await waitFor(chrome, `document.querySelector('[data-testid^="roster-player-"]')`);
    ck(`${vp.label}｜ROSTER 可開啟`, rosterOpen);
    if (rosterOpen) {
      await waitFor(chrome, `[...document.querySelectorAll('[data-testid^="roster-player-"]')]
        .some((r) => (r.innerText || "").trim().length > 0)`, 12_000);
      const rows = await chrome.evaluate(`
        return [...document.querySelectorAll('[data-testid^="roster-player-"]')]
          .map((r) => (r.innerText || "").replace(/\\s+/g, " "));`);
      const kaiser = rows.find((t) => t.includes("Kaiser")) ?? "";
      ck(`${vp.label}｜ROSTER：舊 injury player 可出賽`,
        kaiser.includes("可出賽") && !INJURY_WORDING.test(kaiser), kaiser.slice(0, 80) || `共 ${rows.length} 列`);
      ck(`${vp.label}｜ROSTER：低體力 player 仍不可出賽`,
        rows.some((t) => t.includes("不可出賽")),
        `${rows.filter((t) => t.includes("不可出賽")).length} 人`);
      ck(`${vp.label}｜ROSTER 無傷停字樣`, !INJURY_WORDING.test(rows.join(" ")));
      ck(`${vp.label}｜ROSTER 無橫向捲動`, !(await overflowed(chrome)));

      // PROFILE
      await chrome.evaluate(`
        const rows = [...document.querySelectorAll('[data-testid^="roster-player-"]')];
        const k = rows.find((r) => (r.innerText||"").includes("Kaiser")) ?? rows[0];
        k?.click(); return Boolean(k);`);
      await sleep(700);
      await clickText(chrome, "開啟完整選手檔案");
      const profileOpen = await waitFor(chrome, `document.querySelectorAll('[data-testid^="player-profile-tab-"]').length === 4`);
      ck(`${vp.label}｜PROFILE 可開啟`, profileOpen);
      if (profileOpen) {
        const status = await chrome.evaluate(`return (document.querySelector('[data-testid="player-status-panel"]')?.innerText||"").replace(/\\s+/g," ");`);
        let all = await bodyText(chrome);
        if (!/27\s*歲/.test(all)) {
          await chrome.evaluate(`document.querySelector('[data-testid="player-profile-tab-career"]')?.click(); return true;`);
          await sleep(800);
          all = await bodyText(chrome);
        }
        ck(`${vp.label}｜PROFILE：年齡正常（27 歲）`, /27\s*歲/.test(all),
          (all.match(/\d+\s*歲/g) ?? []).join(",") || "(找不到)");
        ck(`${vp.label}｜PROFILE：condition 正常（可出賽 ＋ 體力 66）`,
          status.includes("可出賽") && /66/.test(status) && !INJURY_WORDING.test(status), status.slice(0, 80));
        ck(`${vp.label}｜PROFILE 無傷停字樣`, !INJURY_WORDING.test(all));
      }
    }

    // TRAINING（正式模式：DEV 面板必須不存在）
    const trainingOpen = await openTraining(chrome, PROD, vp.mobile);
    ck(`${vp.label}｜TRAINING 可開啟`, trainingOpen);
    if (trainingOpen) {
      const panelThere = await chrome.evaluate(`return Boolean(document.querySelector('${PANEL}'));`);
      ck(`${vp.label}｜**DEV Quick Recovery 預設正式頁面不可見**`, panelThere === false);
      const t = await bodyText(chrome);
      ck(`${vp.label}｜TRAINING 無 DEV 字樣、無傷停字樣`,
        !/DEV 快速恢復|僅測試模式|全隊恢復至可出賽/.test(t) && !INJURY_WORDING.test(t),
        (t.match(/DEV 快速恢復|僅測試模式|全隊恢復至可出賽/g) ?? []).join(",") || "(乾淨)");
      //  Training v1.1：選到人之後課程格與預估成長要在
      await chrome.evaluate(`
        const btns = [...document.querySelectorAll("button")].filter((b) => /精神飽滿|正常|疲勞|低潮/.test(b.innerText || ""));
        btns[0]?.click(); return Boolean(btns[0]);`);
      const courses = await waitFor(chrome, `(document.body.innerText||"").includes("選擇課程指派")`, 10_000);
      ck(`${vp.label}｜TRAINING v1.1 正常（課程格 ＋ 預估成長）`,
        courses && await chrome.evaluate(`return (document.body.innerText||"").includes("預估成長");`));
      ck(`${vp.label}｜TRAINING 無橫向捲動`, !(await overflowed(chrome)));
    }

    // MATCH PREP
    await goto(chrome, PROD);
    await chrome.evaluate(`document.querySelector('[data-testid="home-mode-moba"]')?.click(); return true;`);
    const prepOpen = await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')`, 40_000);
    ck(`${vp.label}｜MATCH PREP 可開啟`, prepOpen);
    if (prepOpen) {
      const prep = await chrome.evaluate(`
        const seats = [...document.querySelectorAll('[data-testid="squad-seat"]')];
        return { seats: seats.length,
                 seated: seats.filter((s) => s.dataset.seated === "true" || (s.innerText||"").trim().length > 2).length,
                 all: (document.body.innerText||"").replace(/\\s+/g," ") };`);
      ck(`${vp.label}｜MATCH PREP：injury 不再擋出賽`,
        !INJURY_WORDING.test(prep.all), (prep.all.match(INJURY_WORDING) ?? []).join("") || "(乾淨)");
      ck(`${vp.label}｜MATCH PREP：陣容有被填上`, prep.seats > 0 && prep.seated > 0,
        JSON.stringify({ seats: prep.seats, seated: prep.seated }));
      ck(`${vp.label}｜MATCH PREP 無橫向捲動`, !(await overflowed(chrome)));
    }
  }

  // ══ Phase 2：?debug=1（DEV 工具可用）═════════════════════════════════════
  console.log("\n══ Phase 2：?debug=1（DEV 工具應可用）══");
  await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  const trainingDbg = await openTraining(chrome, `${PROD}?debug=1`, false);
  ck("P2-1) `?debug=1` 下訓練中心可開啟", trainingDbg);
  ck("P2-2) **`?debug=1` 下 DEV 工具可用**（已知並接受的開發期行為）",
    await chrome.evaluate(`return Boolean(document.querySelector('${PANEL}'));`));

  const d0 = (await readSave(chrome))?.meta?.days;
  await clickTestId(chrome, "dev-advance-1");
  await sleep(1600);
  const d1 = (await readSave(chrome))?.meta?.days;
  ck("P2-3) 推進 1 天正常", Number(d1) === Number(d0) + 1, `第 ${d0} → ${d1} 天`);

  await clickTestId(chrome, "dev-advance-3");
  await sleep(2200);
  const d3 = (await readSave(chrome))?.meta?.days;
  ck("P2-4) 推進 3 天正常", Number(d3) === Number(d1) + 3, `第 ${d1} → ${d3} 天`);

  //  全隊體力歸零 ⇒ 按「全隊恢復至可出賽」⇒ 每個人都要 >= authoritative 門檻
  await seedRoster(chrome, FLATTEN);
  const reopened = await openTraining(chrome, `${PROD}?debug=1`, false);
  ck("P2-5) 佈置：全隊體力歸零後重開訓練中心", reopened);
  const beforeE = ((await readSave(chrome))?.players ?? []).map((p) => Number(p.energy) || 0);
  await clickTestId(chrome, "dev-recover-all");
  await sleep(1600);
  const afterSave = await readSave(chrome);
  const afterE = (afterSave?.players ?? []).map((p) => Number(p.energy) || 0);
  ck(`P2-6) 恢復至可出賽：全員 >= authoritative 門檻（${UNFIT_BELOW}）`,
    afterE.length > 0 && afterE.every((e) => e >= UNFIT_BELOW),
    `${beforeE.join(",")} → ${afterE.join(",")}`);
  ck("P2-7) 不是一鍵滿血（剛好跨過門檻，仍在既有恢復步長之內）",
    afterE.every((e) => e < UNFIT_BELOW + cond.CONDITION.restPerDay * 2),
    `門檻 ${UNFIT_BELOW}／步長 ${cond.CONDITION.restPerDay}`);
  ck("P2-8) `?debug=1` 下無橫向捲動", !(await overflowed(chrome)));

  // ── console ──────────────────────────────────────────────────────────────
  const errs = chrome.consoleLines.filter((l) => l.startsWith("[error]"));
  ck("console：page error = 0、page-origin uncaught error = 0",
    errs.length === 0 && chrome.pageErrors.length === 0,
    [...errs.slice(0, 3), ...chrome.pageErrors.slice(0, 3)].join(" | ") || "(無)");
  note("本次使用獨立 Chrome profile，未碰到任何既有的正式站存檔。");
} catch (error) {
  ck("gate 可執行", false, String(error?.stack ?? error).slice(0, 500));
} finally {
  try { await chrome?.close(); } catch {}
}

console.log(`\n${fail === 0 ? "✅" : "❌"} browser_check_prod_injury_dev：${pass}/${pass + fail} 通過　（${PROD}）`);
process.exit(fail === 0 ? 0 : 1);
