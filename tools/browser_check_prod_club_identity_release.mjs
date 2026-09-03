#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_prod_club_identity_release.mjs
//      Club Identity v2 + Social Identity v1 + Dashboard Scroll P0 的
//      **正式站** release smoke。
//
//  執行：`node tools/browser_check_prod_club_identity_release.mjs [--headed]`
//
//  ── 與 dev gate 的差別（同 browser_check_prod_meta_release.mjs）────────────
//  正式站是打包後的 bundle，沒有 `/src/...` 路徑 ⇒ 不能呼叫 Store action。
//  佈置只能寫 `localStorage`，推流程只能點 UI，驗證只能看 DOM 與存檔。
//
//  §H 首頁與捲動　§V Club Identity 視覺　§Co 教練　§M 俱樂部專精
//  §Cp Competition Hub + Opponent Inspect　§CS CS Battle 掛載　§E console
// ============================================================================
import { launchChrome } from "./browser/cdp.mjs";

const PROD = process.env.ESMO_PROD_URL ?? "https://rayhuang0323.github.io/ESMO-/";
const CDP_PORT = 9471;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));

//  ⚠ 正式站首次載入 localStorage 是空的，要先讓存檔落盤（沿用既有正式站 smoke 的作法）。
const LAND_SAVE = `
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  if (localStorage.getItem("esmo.profile.v1")) return "already";
  document.querySelector('[data-testid="home-advance-day"]')?.click();
  await w(1800);
  return localStorage.getItem("esmo.profile.v1") ? "landed" : "still-empty";
`;

/**
 * 佈置測試存檔：點數灌滿、外觀收藏歸零、**種一筆年度冠軍榮耀**。
 * ⚠ 榮耀走 `competition/honors.js` 的真實形狀（`honorFromEvent` 的回傳值），
 *   不是隨便塞一個物件——這是 earned title（`title_champion`）唯一認可的來源，
 *   佈置錯形狀的話 §V 的 earned 檢查會紅，不會靜默通過。
 */
const SEED = `
  const raw = localStorage.getItem("esmo.profile.v1");
  if (!raw) return "no-save";
  const s = JSON.parse(raw);
  s.retention = { ...(s.retention ?? {}), clubPoints: 99999, clubPointsLifetime: 99999 };
  s.clubAssets = { schema: "ClubAssets.v1", owned: {}, headCoachId: null, lastCoachChangeWeek: null,
    equippedIdentity: { themeId: null, titleId: null, crestFrameId: null, bannerId: null } };
  s.honors = [{
    schema: "Honor.v1",
    id: "honor:asia_annual_champion:moba:s1",
    honorType: "asia_annual_champion",
    label: "亞洲年度冠軍",
    season: 1, gameMode: "moba",
    eventId: "smoke-final", eventName: "Smoke Final",
    championTeamId: s.team?.id ?? null,
    championTeamName: s.team?.name ?? null,
    finalRank: 1,
    earnedAtDay: s.meta?.days ?? 1,
    sourceFinalId: "smoke-final",
  }];
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
    owned: Object.keys(s.clubAssets?.owned ?? {}),
    equipped: s.clubAssets?.equippedIdentity ?? null,
    headCoach: s.clubAssets?.headCoachId ?? null,
  });
`;

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
  const text = (document.body.innerText || "").trim();
  return JSON.stringify({
    overflowX: de.scrollWidth - de.clientWidth,
    inkLength: text.length,
    stillLoading: /載入中|Loading/i.test(text) && text.length < 120,
  });
`;

const HOME_LOOK = `
  const root = document.querySelector(".esmo-dashboard");
  const crest = document.querySelector(".esmo-hero__crest") || document.querySelector(".esmo-mobile-header__crest");
  const title = document.querySelector('[data-testid="club-identity-title"]');
  const bannerEl = document.querySelector('[data-testid="club-identity-banner"]');
  const skinEl = document.querySelector(".esmo-hero__skin") || document.querySelector(".esmo-mobile-header__skin");
  const cs = root ? getComputedStyle(root) : null;
  const skinBg = skinEl ? getComputedStyle(skinEl).backgroundImage : "";
  const bannerBg = bannerEl ? getComputedStyle(bannerEl).backgroundImage : "";
  return JSON.stringify({
    skinAttr: root ? (root.dataset.clubSkin ?? null) : null,
    accent: cs ? cs.getPropertyValue("--club-accent").trim() : null,
    crestPattern: crest ? (crest.dataset.crest ?? null) : null,
    bannerMotif: bannerEl ? (bannerEl.dataset.motif ?? null) : null,
    titleText: title ? title.textContent.trim() : null,
    titleEarned: title ? (title.dataset.earned ?? null) : null,
    skinBgLen: (skinBg && skinBg !== "none") ? skinBg.length : 0,
    bannerBgLen: (bannerBg && bannerBg !== "none") ? bannerBg.length : 0,
  });
`;

async function realScroll(chrome, width, height, mobile) {
  const before = Number(await chrome.evaluate(`return String(document.scrollingElement.scrollTop);`));
  if (!mobile) {
    for (let i = 0; i < 8; i++) {
      await chrome.send("Input.dispatchMouseEvent", {
        type: "mouseWheel", x: Math.round(width / 2), y: Math.round(height / 2),
        deltaX: 0, deltaY: 140, pointerType: "mouse",
      });
      await sleep(90);
    }
  } else {
    const finger = (y) => [{ x: Math.round(width / 2), y, radiusX: 8, radiusY: 8, force: 1, id: 1 }];
    const y0 = Math.round(height * 0.72);
    await chrome.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: finger(y0) });
    for (let y = y0 - 40; y >= Math.round(height * 0.32); y -= 40) {
      await chrome.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: finger(y) });
      await sleep(16);
    }
    await chrome.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  await sleep(500);
  const after = Number(await chrome.evaluate(`return String(document.scrollingElement.scrollTop);`));
  await chrome.evaluate(`window.scrollTo(0, 0); return "ok";`);
  return after - before;
}

let chrome = null;
try {
  chrome = await launchChrome({ url: PROD, port: CDP_PORT, headless: HEADLESS });

  for (const [label, width, height, mobile] of [["桌機 1366px", 1366, 900, false], ["手機 390px", 390, 844, true]]) {
    console.log(`\n══ ${label} ══`);
    await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    if (mobile) await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await chrome.navigate(PROD);
    await sleep(2600);

    //  ── §H 首頁 ───────────────────────────────────────────────────────
    const home = J(await chrome.evaluate(HEALTH));
    ck(`${label}｜首頁有內容（非白屏）`, home.inkLength > 200, `文字 ${home.inkLength} 字`);
    ck(`${label}｜首頁沒有卡在載入中`, home.stillLoading === false);
    ck(`${label}｜首頁無橫向溢出`, home.overflowX <= 1, `overflow=${home.overflowX}`);

    const landed = await chrome.evaluate(LAND_SAVE);
    ck(`${label}｜存檔落盤`, /landed|already/.test(String(landed)), String(landed).replace(/"/g, ""));
    const seeded = await chrome.evaluate(SEED);
    ck(`${label}｜可佈置測試存檔`, String(seeded).includes("seeded"), String(seeded).replace(/"/g, ""));
    await chrome.navigate(PROD);
    await sleep(2400);

    //  ── §S Dashboard Scroll P0 ──────────────────────────────────────────
    const delta = await realScroll(chrome, width, height, mobile);
    ck(`${label}｜${mobile ? "觸控" : "滾輪"}真的捲得動首頁`, delta > 100, `位移 ${delta}px`);

    //  ── §V Club Identity 視覺（買齊四槽＋earned 稱號自動授予）────────────
    const enterAssets = await chrome.evaluate(enter("equip"));
    ck(`${label}｜找得到俱樂部資產入口`, String(enterAssets).includes("clicked"), String(enterAssets).replace(/"/g, ""));

    //  earned 稱號：光是打開這一頁（`identityView()` 內部呼叫 `syncEarnedIdentities()`）
    //  就該自動授予——不需要任何購買動作。
    const earnedCard = J(await chrome.evaluate(`
      const q = (t) => document.querySelector('[data-testid="' + t + '"]');
      const card = q("identity-card-title_champion");
      return JSON.stringify({
        present: Boolean(card),
        owned: card ? card.dataset.owned === "1" : null,
        hasBuyButton: Boolean(q("identity-buy-title_champion")),
        hasEquipButton: Boolean(q("identity-equip-title_champion")),
      });
    `));
    ck(`${label}｜實績稱號卡片在畫面上`, earnedCard.present === true);
    ck(`${label}｜光打開頁面就自動授予（不用購買）`, earnedCard.owned === true, JSON.stringify(earnedCard));
    ck(`${label}｜實績稱號沒有購買鍵`, earnedCard.hasBuyButton === false);

    const before = J(await chrome.evaluate(SAVE));
    await chrome.evaluate(`
      const w = (ms) => new Promise(r => setTimeout(r, ms));
      const click = async (t) => { const b = document.querySelector('[data-testid="' + t + '"]'); if (b) { b.click(); await w(750); } };
      await click("identity-buy-theme_ember");
      await click("identity-buy-crest_laurel");
      await click("identity-buy-banner_halo");
      await click("identity-equip-title_champion");
      return "ok";
    `);
    const after = J(await chrome.evaluate(SAVE));
    ck(`${label}｜三件可購買外觀進收藏`,
      ["theme_ember", "crest_laurel", "banner_halo"].every((id) => after.owned.includes(id)), after.owned.join(","));
    ck(`${label}｜四個槽都裝上（含 earned 稱號）`,
      after.equipped?.themeId === "theme_ember" && after.equipped?.crestFrameId === "crest_laurel"
      && after.equipped?.bannerId === "banner_halo" && after.equipped?.titleId === "title_champion",
      JSON.stringify(after.equipped));
    ck(`${label}｜clubPoints 確實被扣`, after.clubPoints < before.clubPoints, `${before.clubPoints} → ${after.clubPoints}`);

    await chrome.navigate(PROD);
    await sleep(2400);
    const look = J(await chrome.evaluate(HOME_LOOK));
    ck(`${label}｜Club Theme 生效於首頁`, look.skinAttr === "ember" && look.accent === "#fb923c",
      `${look.skinAttr}/${look.accent}`);
    ck(`${label}｜皮膚真的畫出背景`, look.skinBgLen > 20, `len=${look.skinBgLen}`);
    ck(`${label}｜Crest Frame 生效`, look.crestPattern === "laurel", String(look.crestPattern));
    ck(`${label}｜Club Banner 生效且真的畫出大面積背景`,
      look.bannerMotif === "halo" && look.bannerBgLen > 20, `${look.bannerMotif} len=${look.bannerBgLen}`);
    ck(`${label}｜Earned 稱號顯示且標成實績（金色銘牌）`,
      look.titleText === "冠軍" && look.titleEarned === "1", `${look.titleText}/earned=${look.titleEarned}`);

    //  ── §Co 教練（既有機制，輕量重驗）───────────────────────────────────
    await chrome.evaluate(enter("equip"));
    await chrome.evaluate(`
      const b = document.querySelector('[data-testid="asset-buy-coach_conditioning"]');
      if (b && !b.disabled) b.click();
      await new Promise(r => setTimeout(r, 900));
      return "ok";
    `);
    const coachSave = J(await chrome.evaluate(SAVE));
    ck(`${label}｜教練買得到且自動上任`, coachSave.headCoach === "coach_conditioning", String(coachSave.headCoach));

    //  ── §M 俱樂部專精（輕量：打得開＋沒有橫向溢出）──────────────────────
    await chrome.navigate(PROD); await sleep(2200);
    await chrome.evaluate(enter("clubMastery"));
    const mView = J(await chrome.evaluate(`
      const root = document.querySelector('[data-testid="club-mastery-screen"]');
      return JSON.stringify({
        open: Boolean(root),
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      });
    `));
    ck(`${label}｜俱樂部專精頁打得開`, mView.open === true);
    ck(`${label}｜專精頁無橫向溢出`, mView.overflowX <= 1, `overflow=${mView.overflowX}`);

    //  ── §Cp Competition Hub + Opponent Inspect（新功能）─────────────────
    await chrome.navigate(PROD); await sleep(2200);
    const compNav = await chrome.evaluate(`
      const b = document.querySelector('[data-testid="home-mode-bracket"]');
      if (!b) return "no-entry";
      b.click();
      await new Promise(r => setTimeout(r, 1400));
      return "clicked";
    `);
    ck(`${label}｜找得到賽事（Competition Hub）入口`, compNav === "clicked", String(compNav));
    const inspect = J(await chrome.evaluate(`
      const w = (ms) => new Promise(r => setTimeout(r, ms));
      const row = [...document.querySelectorAll('[data-testid="moba-competition-standing-row"]')]
        .find(r => r.dataset.me !== "true");
      if (!row) return JSON.stringify({ ok: false, why: "no-row" });
      row.click();
      const until = Date.now() + 6000;
      while (Date.now() < until) {
        const card = document.querySelector('[data-testid="opponent-club-card"]');
        if (card) {
          const text = (card.innerText || "").toLowerCase();
          const leaks = ["doctrine","headcoach","capabilit","tactic","matchprep","lineup","scout","mastery"]
            .filter(k => text.includes(k));
          return JSON.stringify({ ok: true, name: card.querySelector("h2")?.textContent ?? null, leaks });
        }
        await w(180);
      }
      return JSON.stringify({ ok: false, why: "card-not-open" });
    `));
    ck(`${label}｜點積分榜列開得出對手俱樂部卡`, inspect.ok === true, JSON.stringify(inspect));
    if (inspect.ok) ck(`${label}｜對手卡不含戰術欄位（不是免費偵察）`, inspect.leaks.length === 0, inspect.leaks.join(","));
    //  關掉卡片，避免殘留擋住下一步。
    await chrome.evaluate(`document.querySelector('[data-testid="opponent-club-card-backdrop"]')?.click(); return "ok";`);

    //  ── §CS CS Battle 掛載（含 C5C 呈現層、tactic sync P1 修正所在的 runtime）─
    //  ⚠ 完整流程只在桌機跑（重，要跑過 Prep → 地圖選擇 → 戰術部署 → 對戰掛載）；
    //    手機只驗證能不能**進得去** Prep 頁，不整套重跑一次，維持這支是 smoke
    //    而不是又一個完整 gate。
    await chrome.navigate(PROD); await sleep(2200);
    await chrome.evaluate(`const b=[...document.querySelectorAll("button")].find(x=>/CS/.test(x.innerText||"")); if(b) b.click(); return "ok";`);
    await sleep(1800);
    const csPrepOpen = J(await chrome.evaluate(`
      return JSON.stringify({
        hasMapPicker: Boolean(document.querySelector('[data-testid="cs-practice-map-dust2"]')),
        hasPrimaryAction: Boolean(document.querySelector('[data-testid="prep-primary-action"]')),
      });
    `));
    ck(`${label}｜CS 賽前頁打得開`, csPrepOpen.hasMapPicker && csPrepOpen.hasPrimaryAction, JSON.stringify(csPrepOpen));

    if (!mobile) {
      await chrome.evaluate(`document.querySelector('[data-testid="cs-practice-map-dust2"]').click(); return "ok";`);
      await sleep(500);
      await chrome.evaluate(`const b=[...document.querySelectorAll("button")].find(x=>/自動填入/.test(x.innerText||"")); if(b) b.click(); return "ok";`);
      await sleep(900);
      await chrome.evaluate(`document.querySelector('[data-testid="prep-start-practice"]').click(); return "ok";`);
      await sleep(1200);
      await chrome.evaluate(`document.querySelector('[data-testid="prep-primary-action"]').click(); return "ok";`);
      await sleep(8000);
      const mapConfirmClicked = await chrome.evaluate(`
        const b = document.querySelector('[data-testid="cs-map-confirm"]');
        if (!b) return "no-map-confirm";
        b.click(); return "clicked";
      `);
      ck(`${label}｜通過確認倒數進到地圖選擇`, mapConfirmClicked === "clicked", mapConfirmClicked);
      await sleep(2000);
      const tacticConfirmClicked = await chrome.evaluate(`
        const b = document.querySelector('[data-testid="cs-tactic-confirm"]');
        if (!b) return "no-tactic-confirm";
        b.click(); return "clicked";
      `);
      ck(`${label}｜地圖確認後進到戰術部署`, tacticConfirmClicked === "clicked", tacticConfirmClicked);

      let mounted = false;
      for (let i = 0; i < 15 && !mounted; i++) {
        await sleep(2000);
        const c = String(await chrome.evaluate(`return String(document.querySelectorAll("canvas").length);`));
        if (c !== "0") mounted = true;
      }
      ck(`${label}｜CS 對戰真的掛載出 canvas`, mounted);
      const hud = J(await chrome.evaluate(`
        return JSON.stringify({
          hud: Boolean(document.querySelector('[data-testid="cs-c5c-presentation-hud"]')),
          speedControls: Boolean(document.querySelector('[data-testid="cs-match-speed-controls"]')),
        });
      `));
      ck(`${label}｜C5C 呈現層 HUD 與速度控制都在（tactic sync P1 所在的同一 runtime）`,
        hud.hud && hud.speedControls, JSON.stringify(hud));
    }
  }

  //  ── §E console：只看 page-origin 的錯誤 ─────────────────────────────
  const errs = (chrome.pageErrors ?? []).map(String);
  const consoleErrs = (chrome.consoleLines ?? [])
    .filter((l) => /error/i.test(String(l?.type ?? "")))
    .map((l) => String(l?.text ?? l));
  const noise = /favicon|net::ERR|Failed to load resource|manifest/i;
  const real = [...errs, ...consoleErrs].filter((m) => !noise.test(m));
  ck("正式站沒有來自本站程式的 console error", real.length === 0, real.slice(0, 3).join(" | ") || "clean");
} catch (e) {
  ck("harness", false, String(e?.message ?? e));
} finally {
  try { await chrome?.close?.(); } catch { /* 收尾失敗不影響判定 */ }
}

console.log(`\n正式站 Club Identity v2 release smoke：${pass}/${pass + fail} ${fail === 0 ? "PASS" : "FAIL"}`);
if (fail) process.exitCode = 1;
