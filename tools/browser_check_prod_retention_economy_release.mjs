#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_prod_retention_economy_release.mjs
//      Retention Economy Calibration v1 的**正式站** release smoke。
//
//  執行：`node tools/browser_check_prod_retention_economy_release.mjs [--headed]`
//  或走 supervisor：
//    `node tools/browser/run-gate.mjs tools/browser_check_prod_retention_economy_release.mjs --timeout 900000`
//
//  ── 與 dev gate 的差別 ────────────────────────────────────────────────────
//  正式站是打包後的 bundle，**沒有 `/src/...` 路徑** ⇒ 不能 import 模組、
//  不能呼叫 Store action。佈置只能寫 `localStorage`，推流程只能點 UI，
//  驗證只能看 DOM 與存檔。走 Browser Harness v1 的 `externalUrl`：
//  不起本地 dev server，但保留 PASS / PRODUCT_FAIL / HARNESS_FAIL 分類與保證收尾。
//
//  ⚠ 這一支**不碰 Ray 自己的正式站存檔**——harness 每次都開全新的暫時 Chrome
//    profile，localStorage 一開始就是空的，沒有東西可以被破壞。
//
//  §D 部署新鮮度　§H 首頁與 Club Progression　§O 目標頁與校準後的門檻
//  §Q 快速練習不給點數　§C 領取／重整／餘額　§A Club Assets
//  §S 捲動與 390px　§E console
// ============================================================================
import { runGate, finishGate } from "./browser/harness.mjs";

const PROD = process.env.ESMO_PROD_URL ?? "https://rayhuang0323.github.io/ESMO-/";

const LAND_SAVE = `
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  if (localStorage.getItem("esmo.profile.v1")) return "already";
  document.querySelector('[data-testid="home-advance-day"]')?.click();
  await w(1800);
  return localStorage.getItem("esmo.profile.v1") ? "landed" : "still-empty";
`;

/**
 * 佈置：把計數器直接寫進存檔，模擬「今天打了幾場某種比賽」。
 *
 * ⚠ 正式站沒有模組可以呼叫 `recordMatchActivity`，所以只能寫計數器。
 *   key 的形狀是 `d<day>:<counter>` / `w<week>:<counter>` / `y<year>:<counter>`
 *   （見 `retentionState.js` 的 `keysFor`）——這是存檔格式，不是內部細節。
 * ⚠ 這樣寫**繞不過**校準的重點：`play` / `volume` 讀的是
 *   `match − practiceMatch`，所以「只加練習場」必須推不動任何一格。
 */
const seedCounters = (kind, n) => `
  const raw = localStorage.getItem("esmo.profile.v1");
  if (!raw) return "no-save";
  const s = JSON.parse(raw);
  const day = Math.max(1, Math.floor(Number(s.meta?.days) || 1));
  const week = Math.floor((day - 1) / 7) + 1;
  const year = Math.max(1, Math.floor(Number(s.meta?.season) || 1));
  const pre = ["d" + day, "w" + week, "y" + year];
  const c = { ...(s.retention?.counters ?? {}) };
  const bump = (name, amount) => { for (const p of pre) c[p + ":" + name] = (Number(c[p + ":" + name]) || 0) + amount; };
  for (let i = 0; i < ${n}; i++) {
    bump("match", 1);
    if (${JSON.stringify(kind)} === "practice") bump("practiceMatch", 1);
    if (${JSON.stringify(kind)} === "competitive") { bump("competitiveMatch", 1); bump("win", 1); bump("matchIncome", 300000); }
    if (${JSON.stringify(kind)} === "official") { bump("win", 1); bump("matchIncome", 500000); }
  }
  s.retention = { ...(s.retention ?? {}), counters: c };
  localStorage.setItem("esmo.profile.v1", JSON.stringify(s));
  return "seeded";
`;

const enterObjectives = `
  const find = () => document.querySelector('[data-testid="home-utility-objectives"]')
    || document.querySelector('[data-testid="home-sheet-objectives"]')
    || [...document.querySelectorAll("button")].find(b => (b.innerText || "").includes("俱樂部目標"));
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

/** 目標頁只看得到 DOM 與存檔——正式站沒有 selector 可以呼叫。 */
const READ_OBJECTIVES = `
  const cards = [...document.querySelectorAll('[data-testid="objective-card"]')].map(el => ({
    defId: el.dataset.objective,
    done: el.dataset.done === "1",
    text: (el.innerText || "").replace(/\\s+/g, " ").trim(),
  }));
  const raw = localStorage.getItem("esmo.profile.v1");
  const s = raw ? JSON.parse(raw) : null;
  const body = document.body.innerText || "";
  return JSON.stringify({
    cards,
    claimButtons: [...document.querySelectorAll('[data-testid="objective-card"] button')]
      .map(b => (b.innerText || "").trim()),
    clubPoints: s?.retention?.clubPoints ?? null,
    lifetime: s?.retention?.clubPointsLifetime ?? null,
    ownedCount: Object.keys(s?.clubAssets?.owned ?? {}).length,
    clubXp: s?.clubProgression?.xp ?? null,
    ink: body.trim().length,
    stillLoading: /載入中|Loading/i.test(body) && body.trim().length < 120,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  });
`;

const result = await runGate({
  name: "正式站 Retention Economy v1 release smoke",
  externalUrl: PROD,
  timeoutMs: 900_000,
  run: async ({ chrome, url, ck, sleep, J }) => {
    // ── §D 部署新鮮度 ────────────────────────────────────────────────────
    //  ⚠ 先確定導航完成。Chrome 啟動帶的 url 不保證已載入，太早 fetch 會
    //    「Failed to fetch」而被正確歸類成 HARNESS_FAIL（不是產品問題）。
    await chrome.navigate(url);
    await sleep(3000);
    const fresh = J(await chrome.evaluate(`
      const html = await (await fetch(location.href, { cache: "no-store" })).text();
      const m = [...html.matchAll(/src="([^"]*assets\\/index-[^"]*\\.js)"/g)].map(x => x[1]);
      if (!m.length) return JSON.stringify({ ok: false, why: "no-entry-bundle" });
      const js = await (await fetch(new URL(m[0], location.href).href, { cache: "no-store" })).text();
      return JSON.stringify({
        ok: true, bundle: m[0],
        hasFixturesObjective: js.includes("本週賽程"),
        saysPracticeExcluded: js.includes("快速練習不算"),
        stillHasTryout: js.includes("試一次陣容"),
        //  舊門檻的字面值不該再出現在型錄字串裡
        oldVolume: js.includes("本週打 5 場對戰"),
        oldStreak: js.includes("本週贏 3 場一般對戰"),
        oldRotate: js.includes("本週讓 7 名不同選手出賽"),
        oldFinance: js.includes("本年度累積 800 萬對戰收入"),
        oldCircuit: js.includes("本年度累積 100 點巡迴積分"),
        newRotate: js.includes("本週讓 6 名不同選手出賽"),
        newFinance: js.includes("本年度累積 600 萬對戰收入"),
        newCircuit: js.includes("本年度累積 60 點巡迴積分"),
        clubXpSchema: js.includes("ClubProgression.v1"),
      });
    `));
    ck("線上 bundle 抓得到", fresh.ok === true, fresh.bundle ?? fresh.why);
    ck("線上 bundle 含新的週目標「本週賽程」", fresh.hasFixturesObjective === true);
    ck("線上 bundle 含「快速練習不算」的說明", fresh.saysPracticeExcluded === true);
    ck("線上 bundle 已移除日目標「試一次陣容」", fresh.stillHasTryout === false);
    ck("線上 bundle 不再有舊門檻（5 場／3 勝／7 名／800 萬／100 點）",
      !fresh.oldVolume && !fresh.oldStreak && !fresh.oldRotate && !fresh.oldFinance && !fresh.oldCircuit,
      JSON.stringify({ v: fresh.oldVolume, s: fresh.oldStreak, r: fresh.oldRotate, f: fresh.oldFinance, c: fresh.oldCircuit }));
    ck("線上 bundle 含新門檻（6 名／600 萬／60 點）",
      fresh.newRotate && fresh.newFinance && fresh.newCircuit,
      JSON.stringify({ r: fresh.newRotate, f: fresh.newFinance, c: fresh.newCircuit }));
    ck("Club Progression v1 仍在線上（本輪沒有動它）", fresh.clubXpSchema === true);

    for (const [label, width, height, mobile] of [["桌機 1366px", 1366, 768, false], ["手機 390px", 390, 844, true]]) {
      console.log(`\n── ${label} ──`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });

      // ── §H 首頁 ──────────────────────────────────────────────────────
      await chrome.navigate(url); await sleep(2400);
      await chrome.evaluate(`localStorage.removeItem("esmo.profile.v1"); return "cleared";`);
      await chrome.navigate(url); await sleep(2400);
      const landed = String(await chrome.evaluate(LAND_SAVE)).replace(/"/g, "");
      ck(`${label}｜全新 profile 起得來且存檔落盤`, ["landed", "already"].includes(landed), landed);

      const home = J(await chrome.evaluate(`
        const pick = (id) => { const el = document.querySelector('[data-testid="' + id + '"]'); return el ? (el.innerText || "").trim() : null; };
        const body = document.body.innerText || "";
        const raw = localStorage.getItem("esmo.profile.v1");
        const s = raw ? JSON.parse(raw) : null;
        return JSON.stringify({
          crest: pick("home-crest-level"),
          clubXp: s?.clubProgression?.xp ?? null,
          clubXpSchema: s?.clubProgression?.schema ?? null,
          ink: body.trim().length,
          stillLoading: /載入中|Loading/i.test(body) && body.trim().length < 120,
          overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        });
      `));
      ck(`${label}｜首頁有渲染（無白屏／非無限載入）`,
        home.ink > 200 && home.stillLoading === false, `ink=${home.ink}`);
      ck(`${label}｜Club Progression 仍是 canonical（Lv.1 / ClubProgression.v1）`,
        home.crest === "1" && home.clubXpSchema === "ClubProgression.v1",
        `crest=${home.crest} schema=${home.clubXpSchema}`);
      ck(`${label}｜首頁沒有橫向溢出`, home.overflowX <= 1, `overflowX=${home.overflowX}`);

      // ── §O 目標頁與校準後的門檻 ──────────────────────────────────────
      const nav = String(await chrome.evaluate(enterObjectives)).replace(/"/g, "");
      ck(`${label}｜進得去俱樂部目標`, nav === "clicked", nav);
      const objs = J(await chrome.evaluate(READ_OBJECTIVES));
      ck(`${label}｜目標頁渲染出卡片`, objs.cards.length > 0, `${objs.cards.length} 張`);
      ck(`${label}｜日目標池已無「試一次陣容」`,
        !objs.cards.some((c) => c.defId === "tryout"), objs.cards.map((c) => c.defId).join(","));
      //  卡片上的文字要帶新門檻。只檢查**實際抽到**的那幾張。
      const wrongText = objs.cards.filter((c) => {
        if (c.defId === "volume") return !/3 場/.test(c.text);
        if (c.defId === "streak") return !/2 場/.test(c.text);
        if (c.defId === "rotate") return !/6 名/.test(c.text);
        if (c.defId === "fixtures") return !/2 場正式賽程/.test(c.text);
        if (c.defId === "finance") return !/600萬|600 萬/.test(c.text);
        if (c.defId === "circuit") return !/60 點/.test(c.text);
        return false;
      });
      ck(`${label}｜卡片上顯示的是校準後的門檻`, wrongText.length === 0,
        wrongText.length ? JSON.stringify(wrongText.map((c) => c.defId + ":" + c.text)) : objs.cards.map((c) => c.defId).join(","));
      ck(`${label}｜目標頁沒有橫向溢出`, objs.overflowX <= 1, `overflowX=${objs.overflowX}`);

      // ── §Q 快速練習不給點數 ──────────────────────────────────────────
      await chrome.evaluate(seedCounters("practice", 8));
      await chrome.navigate(url); await sleep(2000);
      await chrome.evaluate(enterObjectives); await sleep(800);
      const afterPractice = J(await chrome.evaluate(READ_OBJECTIVES));
      ck(`${label}｜8 場快速練習後 Club Points 仍為 0`,
        afterPractice.clubPoints === 0 && afterPractice.lifetime === 0,
        `balance=${afterPractice.clubPoints} lifetime=${afterPractice.lifetime}`);
      ck(`${label}｜8 場快速練習後沒有任何「領取獎勵」可按`,
        !afterPractice.claimButtons.some((t) => t.includes("領取獎勵")),
        JSON.stringify(afterPractice.claimButtons));
      ck(`${label}｜快速練習沒有點亮「今日出賽」`, (() => {
        const play = afterPractice.cards.find((c) => c.defId === "play");
        return !play || play.done === false;
      })());

      // ── §C 一般對戰推得動 ＋ 領取 ＋ 重整 ────────────────────────────
      await chrome.evaluate(seedCounters("competitive", 3));
      await chrome.navigate(url); await sleep(2000);
      await chrome.evaluate(enterObjectives); await sleep(900);
      const afterComp = J(await chrome.evaluate(READ_OBJECTIVES));
      ck(`${label}｜一般對戰推得動目標（出現可領取）`,
        afterComp.claimButtons.some((t) => t.includes("領取獎勵")),
        JSON.stringify(afterComp.claimButtons));

      const claimed = J(await chrome.evaluate(`
        const read = () => JSON.parse(localStorage.getItem("esmo.profile.v1")).retention;
        const before = read();
        const btn = [...document.querySelectorAll('[data-testid="objective-card"] button')]
          .find(b => (b.innerText || "").includes("領取獎勵"));
        if (!btn) return JSON.stringify({ ok: false, why: "no-button" });
        btn.click();
        await new Promise(r => setTimeout(r, 900));
        const after = read();
        return JSON.stringify({ ok: true,
          before: before.clubPoints, after: after.clubPoints,
          lifeBefore: before.clubPointsLifetime, lifeAfter: after.clubPointsLifetime });
      `));
      ck(`${label}｜按下「領取獎勵」餘額真的變多`,
        claimed.ok && claimed.after > claimed.before, JSON.stringify(claimed));
      ck(`${label}｜領取同時推進 clubPointsLifetime（不下降）`,
        claimed.ok && claimed.lifeAfter >= claimed.lifeBefore && claimed.lifeAfter >= claimed.after,
        JSON.stringify(claimed));

      await chrome.navigate(url); await sleep(2200);
      await chrome.evaluate(enterObjectives); await sleep(900);
      const reloaded = J(await chrome.evaluate(`
        const read = () => JSON.parse(localStorage.getItem("esmo.profile.v1")).retention;
        const before = read();
        const done = [...document.querySelectorAll('[data-testid="objective-card"] button')]
          .filter(b => (b.innerText || "").includes("已領取"));
        for (const b of done) { b.click(); await new Promise(r => setTimeout(r, 120)); }
        const after = read();
        return JSON.stringify({ before: before.clubPoints, after: after.clubPoints, claimedCards: done.length });
      `));
      ck(`${label}｜重整後餘額沒有回退`, reloaded.before === claimed.after,
        `${claimed.after} → ${reloaded.before}`);
      ck(`${label}｜已領取的目標按下去不會再給一次`,
        reloaded.after === reloaded.before, JSON.stringify(reloaded));

      // ── §A Club Assets 未受影響 ──────────────────────────────────────
      await chrome.navigate(url); await sleep(2200);
      const assetsNav = String(await chrome.evaluate(`
        const find = () => document.querySelector('[data-testid="home-utility-equip"]')
          || document.querySelector('[data-testid="home-sheet-equip"]');
        let b = find();
        if (!b) {
          for (const tab of ["更多", "戰隊"]) {
            const t = [...document.querySelectorAll("button")].find(x => (x.innerText || "").trim() === tab);
            if (t) { t.click(); await new Promise(r => setTimeout(r, 520)); b = find(); if (b) break; }
          }
        }
        if (!b) return "no-entry";
        b.click(); await new Promise(r => setTimeout(r, 1100));
        return "clicked";
      `)).replace(/"/g, "");
      ck(`${label}｜進得去俱樂部資產`, assetsNav === "clicked", assetsNav);
      const assets = J(await chrome.evaluate(`
        const body = document.body.innerText || "";
        const s = JSON.parse(localStorage.getItem("esmo.profile.v1"));
        return JSON.stringify({
          ink: body.trim().length,
          schema: s?.clubAssets?.schema ?? null,
          saysPrestige: body.includes("俱樂部聲望"),
          //  型錄價格本輪未動：最便宜的識別仍是 400
          hasPrice400: body.includes("400"),
        });
      `));
      ck(`${label}｜俱樂部資產頁正常渲染`, assets.ink > 200, `ink=${assets.ink}`);
      ck(`${label}｜Club Assets 切片未受影響`, assets.schema === "ClubAssets.v1", String(assets.schema));
      ck(`${label}｜資產頁仍用「俱樂部聲望」（Club Progression v1 的命名未回退）`,
        assets.saysPrestige === true);

      // ── §S 捲動 ──────────────────────────────────────────────────────
      const scrolled = J(await chrome.evaluate(`
        const de = document.documentElement;
        const before = document.scrollingElement.scrollTop;
        window.scrollTo(0, 999999);
        await new Promise(r => setTimeout(r, 400));
        const after = document.scrollingElement.scrollTop;
        const tall = de.scrollHeight > de.clientHeight + 4;
        window.scrollTo(0, 0);
        return JSON.stringify({ tall, moved: after - before, docH: de.scrollHeight, vh: de.clientHeight });
      `));
      ck(`${label}｜內容超過一頁時捲得動`, !scrolled.tall || scrolled.moved > 0,
        `moved=${scrolled.moved} tall=${scrolled.tall}`);
    }

    // ── §E console ─────────────────────────────────────────────────────
    const errs = (chrome.pageErrors ?? []).map(String);
    const consoleErrs = (chrome.consoleLines ?? [])
      .filter((l) => /error/i.test(String(l?.type ?? "")))
      .map((l) => String(l?.text ?? l));
    const noise = /favicon|net::ERR|Failed to load resource|manifest/i;
    const real = [...errs, ...consoleErrs].filter((m) => !noise.test(m));
    ck("正式站沒有來自本站程式的 console error", real.length === 0, real.slice(0, 3).join(" | ") || "clean");
  },
});

await finishGate(result);
