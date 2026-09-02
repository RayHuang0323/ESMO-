#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_prod_meta_release.mjs
//      Meta Progression v1 + Club Assets v1 的**正式站** smoke
//
//  執行：`node tools/browser_check_prod_meta_release.mjs [--headed]`
//
//  ── 與 dev gate 的差別 ──────────────────────────────────────────────────
//  正式站是打包後的 bundle，**沒有 `/src/...` 路徑** ⇒ 不能用
//  `RESOLVE_APP_MODULES` 呼叫 Store action。所以這一支：
//    · 佈置只能寫 `localStorage`（TD-31：`?debug=0` 在首頁無效）
//    · 推流程只能點 UI
//    · 驗證只能看 DOM 與存檔
//  代價是能驗的深度比 dev gate 淺；換到的是「玩家真的按得到」。
//
//  ⚠ 這支不改任何 production 行為，只讀與點。
//
//  §H 首頁與捲動　§M 俱樂部專精　§A 俱樂部資產　§P 賽前變體
//  §C 既有玩法入口（Competition / CS）　§R 手機 390　§E console
// ============================================================================
import { launchChrome } from "./browser/cdp.mjs";

const PROD = process.env.ESMO_PROD_URL ?? "https://rayhuang0323.github.io/ESMO-/";
const CDP_PORT = 9427;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));

/**
 * 佈置存檔：正式站唯一的佈置窗口。
 * 直接改 `localStorage` 的 retention 給點數，並把 tempo 的專精條件做到可領。
 * ⚠ 不能呼叫 domain 函式（bundle 沒有匯出），所以計數器欄位用與
 *   `recordTacticUsage` 相同的形狀直接寫入；寫錯的話 §M 會紅，不會靜默通過。
 */
//  ⚠ 正式站首次載入時 `localStorage` 是**空的**——存檔要等玩家做了一件會落盤的事
//    才會出現。既有正式站 smoke 的做法是點首頁的「推進一天」，這裡沿用。
//    （我第一版直接讀存檔、讀不到就 `no-save` 放棄，於是後面整串連鎖失敗。）
const LAND_SAVE = `
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  if (localStorage.getItem("esmo.profile.v1")) return "already";
  document.querySelector('[data-testid="home-advance-day"]')?.click();
  await w(1800);
  return localStorage.getItem("esmo.profile.v1") ? "landed" : "still-empty";
`;

const SEED = `
  const raw = localStorage.getItem("esmo.profile.v1");
  if (!raw) return "no-save";
  const s = JSON.parse(raw);
  s.retention = { ...(s.retention ?? {}), clubPoints: 3000, clubPointsLifetime: 3000 };
  s.clubMastery = {
    schema: "ClubMastery.v1",
    activeDoctrine: "tempo",
    tacticUsage: { moba: { m1: 3 }, cs: {} },
    tacticIntent: { moba: { m1: 3 }, cs: {} },
    doctrineProgress: { tempo: { matches: 3, intent: 3 }, control: { matches: 0, intent: 0 }, adaptive: { matches: 0, intent: 0 } },
    claims: {},
    unlockedVariants: [],
  };
  s.clubAssets = { schema: "ClubAssets.v1", owned: {}, headCoachId: null, lastCoachChangeWeek: null };
  localStorage.setItem("esmo.profile.v1", JSON.stringify(s));
  return "seeded";
`;

const SAVE = `
  const raw = localStorage.getItem("esmo.profile.v1");
  if (!raw) return JSON.stringify({ exists: false });
  const s = JSON.parse(raw);
  return JSON.stringify({
    exists: true,
    clubPoints: s.retention?.clubPoints ?? null,
    lifetime: s.retention?.clubPointsLifetime ?? null,
    owned: Object.keys(s.clubAssets?.owned ?? {}),
    headCoach: s.clubAssets?.headCoachId ?? null,
    lastChangeWeek: s.clubAssets?.lastCoachChangeWeek ?? null,
    unlocked: s.clubMastery?.unlockedVariants ?? [],
    activeDoctrine: s.clubMastery?.activeDoctrine ?? null,
    days: s.meta?.days ?? null,
  });
`;

/** 走首頁進某個 utility 入口（桌機常駐磚；手機在底部「更多」sheet 裡）。 */
const enter = (id) => `
  const find = () => document.querySelector('[data-testid="home-utility-${id}"]')
    || document.querySelector('[data-testid="home-sheet-${id}"]');
  let b = find();
  if (!b) {
    for (const tab of ["更多", "戰隊"]) {
      const t = [...document.querySelectorAll("button")].find(x => (x.innerText || "").trim() === tab);
      if (t) { t.click(); await new Promise(r => setTimeout(r, 520)); b = find(); if (b) break; }
    }
  }
  if (!b) return "no-entry";
  b.click();
  await new Promise(r => setTimeout(r, 1000));
  return "clicked";
`;

const HEALTH = `
  const de = document.documentElement;
  const body = document.body;
  const text = (body.innerText || "").trim();
  return JSON.stringify({
    overflowX: de.scrollWidth - de.clientWidth,
    inkLength: text.length,
    stillLoading: /載入中|Loading/i.test(text) && text.length < 120,
    docH: de.scrollHeight, vh: de.clientHeight,
  });
`;

let chrome = null;
try {
  chrome = await launchChrome({ url: PROD, port: CDP_PORT, headless: HEADLESS });

  for (const [label, width, height, mobile] of [["桌機 1366px", 1366, 768, false], ["手機 390px", 390, 844, true]]) {
    console.log(`\n══ ${label} ══`);
    await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    await chrome.navigate(PROD);
    await sleep(2600);

    //  ── §H 首頁 ─────────────────────────────────────────────────────────
    const home = J(await chrome.evaluate(HEALTH));
    ck(`${label}｜首頁有內容（非白屏）`, home.inkLength > 200, `文字 ${home.inkLength} 字`);
    ck(`${label}｜首頁沒有卡在載入中`, home.stillLoading === false);
    ck(`${label}｜首頁無橫向溢出`, home.overflowX <= 1, `overflow=${home.overflowX}`);

    //  佈置存檔：先讓存檔落盤，再改它。
    const landed = await chrome.evaluate(LAND_SAVE);
    ck(`${label}｜存檔落盤`, /landed|already/.test(String(landed)), String(landed).replace(/"/g, ""));
    const seeded = await chrome.evaluate(SEED);
    ck(`${label}｜可佈置測試存檔`, String(seeded).includes("seeded"), String(seeded).replace(/"/g, ""));
    await chrome.navigate(PROD);
    await sleep(2400);

    //  ── §S 全域捲動 ─────────────────────────────────────────────────────
    await chrome.evaluate(enter("recruit"));
    const scroll = J(await chrome.evaluate(`
      const de = document.documentElement;
      window.scrollTo(0, 999999);
      await new Promise(r => setTimeout(r, 400));
      const reached = Math.abs((window.scrollY + de.clientHeight) - de.scrollHeight) <= 3;
      const tall = de.scrollHeight > de.clientHeight + 4;
      window.scrollTo(0, 0);
      return JSON.stringify({ tall, reached, docH: de.scrollHeight, overflowX: de.scrollWidth - de.clientWidth });
    `));
    ck(`${label}｜長頁面捲得到最底（全域捲動契約）`, !scroll.tall || scroll.reached === true, `docH=${scroll.docH}`);
    ck(`${label}｜長頁面無橫向溢出`, scroll.overflowX <= 1, `overflow=${scroll.overflowX}`);

    //  ── §M 俱樂部專精 ───────────────────────────────────────────────────
    await chrome.navigate(PROD); await sleep(2200);
    const mNav = await chrome.evaluate(enter("clubMastery"));
    ck(`${label}｜找得到俱樂部專精入口`, String(mNav).includes("clicked"), String(mNav).replace(/"/g, ""));
    const mView = J(await chrome.evaluate(`
      const root = document.querySelector('[data-testid="club-mastery-screen"]');
      if (!root) return JSON.stringify({ open: false });
      const q = (t) => document.querySelector('[data-testid="' + t + '"]');
      const claim = q("mastery-claim-tempo_execution");
      return JSON.stringify({
        open: true,
        doctrine: root.dataset.doctrine,
        heroActive: (q("doctrine-tempo") || {}).dataset?.active ?? null,
        dormantOk: Boolean(q("doctrine-control") && q("doctrine-adaptive")),
        claimEnabled: Boolean(claim && !claim.disabled),
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      });
    `));
    ck(`${label}｜俱樂部專精頁打得開`, mView.open === true);
    ck(`${label}｜現行流派為強攻且是 hero`, mView.doctrine === "tempo" && mView.heroActive === "1");
    ck(`${label}｜另兩條流派可見`, mView.dormantOk === true);
    ck(`${label}｜達成條件後「領取」可按`, mView.claimEnabled === true);
    ck(`${label}｜專精頁無橫向溢出`, mView.overflowX <= 1, `overflow=${mView.overflowX}`);

    //  Mastery claim（真的按）
    await chrome.evaluate(`document.querySelector('[data-testid="mastery-claim-tempo_execution"]').click(); await new Promise(r => setTimeout(r, 900)); return "ok";`);
    const afterClaim = J(await chrome.evaluate(SAVE));
    ck(`${label}｜領取後變體進入存檔`, afterClaim.unlocked.includes("m1_measured_siege"), afterClaim.unlocked.join(",") || "(空)");

    //  Doctrine 切換（真的按沉睡卡）
    await chrome.evaluate(`document.querySelector('[data-testid="doctrine-control"]').click(); await new Promise(r => setTimeout(r, 900)); return "ok";`);
    const afterSwitch = J(await chrome.evaluate(`
      const root = document.querySelector('[data-testid="club-mastery-screen"]');
      return JSON.stringify({ doctrine: root ? root.dataset.doctrine : null, accent: root ? getComputedStyle(root).getPropertyValue("--doctrine-accent").trim() : null });
    `));
    ck(`${label}｜切換流派生效（強攻→控圖）`, afterSwitch.doctrine === "control", String(afterSwitch.doctrine));
    ck(`${label}｜切換後整頁換色`, afterSwitch.accent === "#38bdf8", String(afterSwitch.accent));
    const savedSwitch = J(await chrome.evaluate(SAVE));
    ck(`${label}｜切換流派不沒收已解鎖變體`, savedSwitch.unlocked.includes("m1_measured_siege"));
    //  切回強攻，讓後面的賽前變體驗得到
    await chrome.evaluate(`
      const t = document.querySelector('[data-testid="doctrine-tempo"]');
      if (t && t.tagName === "BUTTON") { t.click(); await new Promise(r => setTimeout(r, 900)); }
      return "ok";
    `);

    //  ── §A 俱樂部資產 ───────────────────────────────────────────────────
    await chrome.navigate(PROD); await sleep(2200);
    const aNav = await chrome.evaluate(enter("equip"));
    ck(`${label}｜找得到俱樂部資產入口`, String(aNav).includes("clicked"), String(aNav).replace(/"/g, ""));
    const before = J(await chrome.evaluate(SAVE));
    const aView = J(await chrome.evaluate(`
      const root = document.querySelector('[data-testid="club-assets-screen"]');
      if (!root) return JSON.stringify({ open: false });
      const q = (t) => document.querySelector('[data-testid="' + t + '"]');
      const buy = q("asset-buy-coach_conditioning");
      return JSON.stringify({
        open: true, head: root.dataset.headCoach,
        balance: (q("club-assets-balance") || {}).innerText ?? null,
        buyEnabled: Boolean(buy && !buy.disabled),
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      });
    `));
    ck(`${label}｜俱樂部資產頁打得開`, aView.open === true);
    ck(`${label}｜一開始沒有總教練`, aView.head === "none", String(aView.head));
    ck(`${label}｜餘額顯示 3000`, String(aView.balance).includes("3000"), String(aView.balance));
    ck(`${label}｜「聘用」可按`, aView.buyEnabled === true);
    ck(`${label}｜資產頁無橫向溢出`, aView.overflowX <= 1, `overflow=${aView.overflowX}`);

    //  Club Points purchase（真的按）
    await chrome.evaluate(`document.querySelector('[data-testid="asset-buy-coach_conditioning"]').click(); await new Promise(r => setTimeout(r, 1100)); return "ok";`);
    const after = J(await chrome.evaluate(SAVE));
    ck(`${label}｜購買扣掉 700 可用點數`, after.clubPoints === before.clubPoints - 700, `${before.clubPoints} → ${after.clubPoints}`);
    ck(`${label}｜clubPointsLifetime 逐值不變`, after.lifetime === before.lifetime, `${before.lifetime} → ${after.lifetime}`);
    ck(`${label}｜教練進入收藏`, after.owned.includes("coach_conditioning"), after.owned.join(",") || "(空)");
    ck(`${label}｜空槽自動免費上任`, after.headCoach === "coach_conditioning", String(after.headCoach));
    ck(`${label}｜首次上任不消耗當週換人資格`, after.lastChangeWeek === null, String(after.lastChangeWeek));

    //  reload 後仍擁有仍上任
    await chrome.navigate(PROD); await sleep(2200);
    const reloaded = J(await chrome.evaluate(SAVE));
    ck(`${label}｜reload 後仍擁有教練`, reloaded.owned.includes("coach_conditioning"));
    ck(`${label}｜reload 後仍是總教練`, reloaded.headCoach === "coach_conditioning");

    //  Training / Recovery 基本確認：capability 有沒有在畫面上真的呈現
    await chrome.evaluate(enter("equip"));
    const capShown = J(await chrome.evaluate(`
      const hero = document.querySelector('[data-testid="head-coach-hero"]');
      return JSON.stringify({ text: hero ? (hero.innerText || "").replace(/\\s+/g, " ").slice(0, 120) : null });
    `));
    ck(`${label}｜總教練 hero 顯示其 capability`,
      Boolean(capShown.text && capShown.text.includes("訓練排程") && capShown.text.includes("體力恢復")),
      String(capShown.text));

    //  ── §P 賽前變體（Match Prep）──────────────────────────────────────────
    await chrome.navigate(PROD); await sleep(2200);
    const prep = await chrome.evaluate(`
      const moba = [...document.querySelectorAll("button")].find(b => /MOBA/.test(b.innerText || ""));
      if (!moba) return "no-moba";
      moba.click();
      await new Promise(r => setTimeout(r, 1600));
      return document.body.innerText.slice(0, 60);
    `);
    ck(`${label}｜MOBA 賽前入口可進入`, !String(prep).includes("no-moba"), String(prep).replace(/"/g, "").slice(0, 40));

    //  ── §C 既有玩法入口仍在（CS / 賽事）────────────────────────────────
    await chrome.navigate(PROD); await sleep(2200);
    const modes = J(await chrome.evaluate(`
      const t = document.body.innerText;
      return JSON.stringify({ cs: /CS/.test(t), bracket: /賽事|賽程/.test(t), moba: /MOBA/.test(t) });
    `));
    ck(`${label}｜MOBA / CS / 賽事三個入口都在`, modes.cs && modes.bracket && modes.moba,
      `cs=${modes.cs} bracket=${modes.bracket} moba=${modes.moba}`);
  }

  //  ── §E console：只看 page-origin 的錯誤 ───────────────────────────────
  const errs = (chrome.pageErrors ?? []).map(String);
  const consoleErrs = (chrome.consoleLines ?? [])
    .filter((l) => /error/i.test(String(l?.type ?? "")))
    .map((l) => String(l?.text ?? l));
  //  第三方／載入雜訊不算：只在意來自本站程式的例外。
  const noise = /favicon|net::ERR|Failed to load resource|manifest/i;
  const real = [...errs, ...consoleErrs].filter((m) => !noise.test(m));
  ck("正式站沒有來自本站程式的 console error", real.length === 0, real.slice(0, 3).join(" | ") || "clean");
} catch (e) {
  ck("harness", false, String(e?.message ?? e));
} finally {
  try { await chrome?.close?.(); } catch { /* 收尾失敗不影響判定 */ }
}

console.log(`\n正式站 Meta release smoke：${pass}/${pass + fail} ${fail === 0 ? "PASS" : "FAIL"}`);
if (fail) process.exitCode = 1;
