#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_prod_club_progression_release.mjs
//      Club Progression v1 的**正式站** release smoke。
//
//  執行：`node tools/browser_check_prod_club_progression_release.mjs [--headed]`
//  或走 supervisor：
//    `node tools/browser/run-gate.mjs tools/browser_check_prod_club_progression_release.mjs --timeout 900000`
//
//  ── 與 dev gate 的差別 ────────────────────────────────────────────────────
//  正式站是打包後的 bundle，**沒有 `/src/...` 路徑** ⇒ 不能 import 模組、
//  不能呼叫 Store action。佈置只能寫 `localStorage`，推流程只能點 UI，
//  驗證只能看 DOM 與存檔。走 Browser Harness v1 的 `externalUrl`：
//  不起本地 dev server，但保留 PASS / PRODUCT_FAIL / HARNESS_FAIL 分類與保證收尾。
//
//  ⚠ 這支**不碰 Ray 自己的正式站存檔**——harness 每次都開全新的暫時 Chrome
//    profile，localStorage 一開始就是空的，沒有東西可以被破壞。
//
//  §D 部署新鮮度　§H 首頁 canonical progression　§Mig 舊存檔 migration
//  §M 俱樂部聲望　§A Club Assets　§I Club Identity
//  §Cp Competition Hub ＋ Opponent Inspect　§CS CS runtime 進得去
//  §S 捲動　§E console
// ============================================================================
import { runGate, finishGate } from "./browser/harness.mjs";

const PROD = process.env.ESMO_PROD_URL ?? "https://rayhuang0323.github.io/ESMO-/";

//  正式站首次載入 localStorage 是空的，先讓存檔落盤（沿用既有正式站 smoke 的作法）。
const LAND_SAVE = `
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  if (localStorage.getItem("esmo.profile.v1")) return "already";
  document.querySelector('[data-testid="home-advance-day"]')?.click();
  await w(1800);
  return localStorage.getItem("esmo.profile.v1") ? "landed" : "still-empty";
`;

/**
 * 「舊存檔」：**刻意**寫成 Club Progression 上線前的形狀——
 * 沒有 `clubProgression`、`team` 帶著假的 Lv.93 / 7.27 / #48、retention 有真的累計點數。
 * 載入時 normalize 應該保守 bootstrap（`floor(lifetime × 0.5)`）。
 */
const SEED_LEGACY = `
  const raw = localStorage.getItem("esmo.profile.v1");
  if (!raw) return "no-save";
  const s = JSON.parse(raw);
  delete s.clubProgression;
  s.team = { ...(s.team ?? {}), lv: 93, xp: 7.27, xpMax: 12.1, achievement: 48 };
  s.retention = { ...(s.retention ?? {}), clubPoints: 1200, clubPointsLifetime: 4000 };
  localStorage.setItem("esmo.profile.v1", JSON.stringify(s));
  return "legacy-save-written";
`;

//  ⚠ 正式站讀不到 selector，只能看 DOM 與落盤的存檔。
const READ_HOME = `
  const pick = (id) => {
    const el = document.querySelector('[data-testid="' + id + '"]');
    return el ? (el.innerText || "").trim() : null;
  };
  const body = document.body.innerText || "";
  const raw = localStorage.getItem("esmo.profile.v1");
  const s = raw ? JSON.parse(raw) : null;
  return JSON.stringify({
    savedXp: s?.clubProgression?.xp ?? null,
    savedSchema: s?.clubProgression?.schema ?? null,
    savedHasLevel: s?.clubProgression ? Object.prototype.hasOwnProperty.call(s.clubProgression, "level") : null,
    lifetime: s?.retention?.clubPointsLifetime ?? null,
    clubPoints: s?.retention?.clubPoints ?? null,
    legacyTeamLv: s?.team?.lv ?? null,
    crest: pick("home-crest-level"),
    levelTile: pick("home-club-level"),
    xpTile: pick("home-club-xp"),
    honorTile: pick("home-club-honor"),
    progress: pick("home-club-xp-progress"),
    hasFakeLv93: /Lv\\.?\\s*93\\b/.test(body),
    hasFake727: body.includes("7.27"),
    inkLength: body.trim().length,
    stillLoading: /載入中|Loading/i.test(body) && body.trim().length < 120,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
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
  await new Promise(r => setTimeout(r, 1100));
  return "clicked";
`;

async function realScroll(chrome, width, height, mobile, sleep) {
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
    //  ⚠ `synthesizeScrollGesture(touch)` 在 headless 會回 0px（CDP 限制，不是產品 bug）
    //    ⇒ 直接發原始 touch 事件。
    const finger = (y) => [{ x: Math.round(width / 2), y, radiusX: 8, radiusY: 8, force: 1, id: 1 }];
    const y0 = Math.round(height * 0.72);
    await chrome.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: finger(y0) });
    for (let y = y0 - 40; y >= Math.round(height * 0.32); y -= 40) {
      await chrome.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: finger(y) });
      await sleep(40);
    }
    await chrome.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  await sleep(500);
  const after = Number(await chrome.evaluate(`return String(document.scrollingElement.scrollTop);`));
  return { before, after, moved: after - before };
}

const result = await runGate({
  name: "正式站 Club Progression v1 release smoke",
  externalUrl: PROD,
  timeoutMs: 900_000,
  run: async ({ chrome, url, ck, sleep, J }) => {
    // ── §D 部署新鮮度：線上的 bundle 真的含本輪的程式 ────────────────────
    //  ⚠ 先確定真的已經在正式站上。Chrome 啟動時帶的 url 不保證導航已完成——
    //    太早 evaluate 時 location.href 還是 about:blank，下面的 fetch 會直接
    //    「Failed to fetch」，而那會被正確歸類成 HARNESS_FAIL（不是產品問題）。
    await chrome.navigate(url);
    await sleep(3000);
    const freshness = J(await chrome.evaluate(`
      const html = await (await fetch(location.href, { cache: "no-store" })).text();
      const m = [...html.matchAll(/src="([^"]*assets\\/index-[^"]*\\.js)"/g)].map(x => x[1]);
      if (!m.length) return JSON.stringify({ ok: false, why: "no-entry-bundle" });
      const js = await (await fetch(new URL(m[0], location.href).href, { cache: "no-store" })).text();
      return JSON.stringify({
        ok: true,
        bundle: m[0],
        hasSchema: js.includes("ClubProgression.v1"),
        hasClubXpTile: js.includes("CLUB XP"),
        hasReceiptClubXp: js.includes("俱樂部 XP"),
        hasLevelUpLine: js.includes("俱樂部升級"),
        hasPrestigeLabel: js.includes("俱樂部聲望"),
        //  舊的假資料字面值不該再出現在 presentation 路徑上。
        stillSaysClubLevelZh: js.includes("俱樂部等級"),
      });
    `));
    ck("線上 bundle 抓得到", freshness.ok === true, freshness.bundle ?? freshness.why);
    ck("線上 bundle 含 ClubProgression.v1 schema", freshness.hasSchema === true);
    ck("線上 bundle 含首頁 CLUB XP 欄位", freshness.hasClubXpTile === true);
    ck("線上 bundle 含賽後收據的「俱樂部 XP」與升級提示",
      freshness.hasReceiptClubXp === true && freshness.hasLevelUpLine === true,
      `xp=${freshness.hasReceiptClubXp} levelup=${freshness.hasLevelUpLine}`);
    ck("線上 bundle 含「俱樂部聲望」標籤", freshness.hasPrestigeLabel === true);
    ck("線上 bundle 不再有「俱樂部等級」字樣", freshness.stillSaysClubLevelZh === false);

    for (const [label, width, height, mobile] of [["桌機 1366px", 1366, 768, false], ["手機 390px", 390, 844, true]]) {
      console.log(`\n── ${label} ──`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });

      // ── §H 全新 profile：首頁 canonical progression ────────────────────
      await chrome.navigate(url);
      await sleep(2400);
      await chrome.evaluate(`localStorage.removeItem("esmo.profile.v1"); return "cleared";`);
      await chrome.navigate(url);
      await sleep(2400);
      const landed = String(await chrome.evaluate(LAND_SAVE)).replace(/"/g, "");
      ck(`${label}｜全新 profile 正常起得來且存檔落盤`, ["landed", "already"].includes(landed), landed);

      const fresh = J(await chrome.evaluate(READ_HOME));
      ck(`${label}｜首頁有渲染（無白屏）`, fresh.inkLength > 200, `ink=${fresh.inkLength}`);
      ck(`${label}｜不是卡在無限載入`, fresh.stillLoading === false);
      ck(`${label}｜Club Level 不再是假的 Lv.93`, fresh.hasFakeLv93 === false);
      ck(`${label}｜首頁不再出現假的 7.27萬`, fresh.hasFake727 === false);
      ck(`${label}｜隊徽角標不再是 #48`, fresh.crest !== "48", `crest=${fresh.crest}`);
      ck(`${label}｜全新 profile 顯示 Lv.1`, fresh.crest === "1", `crest=${fresh.crest}`);
      ck(`${label}｜XP bar 走 canonical progression（有級距分母）`,
        typeof fresh.progress === "string" && /\d+\s*\/\s*\d+/.test(fresh.progress),
        `progress=${JSON.stringify(fresh.progress)}`);
      ck(`${label}｜存檔寫的是 ClubProgression.v1，且 Level 不落盤`,
        fresh.savedSchema === "ClubProgression.v1" && fresh.savedHasLevel === false,
        `schema=${fresh.savedSchema} hasLevel=${fresh.savedHasLevel}`);
      if (!mobile) {
        ck(`${label}｜榮譽欄位是誠實空狀態`, /尚無|冠軍|稱號/.test(fresh.honorTile ?? ""),
          `honor=${JSON.stringify(fresh.honorTile)}`);
      }
      ck(`${label}｜首頁沒有橫向溢出`, fresh.overflowX <= 1, `overflowX=${fresh.overflowX}`);

      // ── §Mig 舊存檔 migration ─────────────────────────────────────────
      const seeded = String(await chrome.evaluate(SEED_LEGACY)).replace(/"/g, "");
      ck(`${label}｜舊形狀存檔佈置成功`, seeded === "legacy-save-written", seeded);
      await chrome.navigate(url);
      await sleep(2400);
      const mig = J(await chrome.evaluate(READ_HOME));
      ck(`${label}｜舊存檔載得起來（無白屏）`, mig.inkLength > 200 && mig.stillLoading === false, `ink=${mig.inkLength}`);
      //  ⚠ 純 reload 之後 localStorage 裡**還是舊形狀**——migration 發生在載入時的
      //    normalize，要等有東西呼叫 save() 才落盤。所以「有沒有 bootstrap」要看
      //    畫面推導出來的等級，不是看存檔。（第一版我讀錯地方，crest 明明是 7。）
      const migLevel = Number(mig.crest);
      ck(`${label}｜舊存檔 bootstrap 不歸零（畫面推導出的等級 > 1）`,
        Number.isFinite(migLevel) && migLevel > 1, `crest=${mig.crest} lifetime=${mig.lifetime}`);
      //  再往前一步：真的觸發一次落盤，確認切片寫得進去、而且保守。
      const persisted = J(await chrome.evaluate(`
        const w = (ms) => new Promise(r => setTimeout(r, ms));
        document.querySelector('[data-testid="home-advance-day"]')?.click();
        await w(2000);
        const s = JSON.parse(localStorage.getItem("esmo.profile.v1"));
        return JSON.stringify({
          xp: s?.clubProgression?.xp ?? null,
          schema: s?.clubProgression?.schema ?? null,
          migratedFromLifetime: s?.clubProgression?.migratedFromLifetime ?? null,
          lifetime: s?.retention?.clubPointsLifetime ?? null,
        });
      `));
      ck(`${label}｜落盤後 clubProgression 切片真的寫進舊存檔`,
        persisted.schema === "ClubProgression.v1" && (persisted.xp ?? 0) > 0, JSON.stringify(persisted));
      ck(`${label}｜bootstrap 保守：不超過 clubPointsLifetime`,
        (persisted.xp ?? 0) <= (persisted.lifetime ?? 0), `xp=${persisted.xp} lifetime=${persisted.lifetime}`);
      ck(`${label}｜假的 Lv.93 沒有被洗成真歷史`,
        mig.hasFakeLv93 === false && mig.crest !== "93", `crest=${mig.crest} team.lv=${mig.legacyTeamLv}`);
      ck(`${label}｜假的 #48 沒有被洗成真歷史`, mig.crest !== "48", `crest=${mig.crest}`);
      //  migration 只做一次。
      await chrome.navigate(url);
      await sleep(2200);
      const mig2 = J(await chrome.evaluate(READ_HOME));
      ck(`${label}｜migration reload 不重複（等級與落盤的 XP 都不再跳）`,
        mig2.crest === mig.crest && mig2.savedXp === persisted.xp,
        `crest ${mig.crest} → ${mig2.crest}｜xp ${persisted.xp} → ${mig2.savedXp}`);
      ck(`${label}｜Club Points 餘額／累計未受影響`,
        mig2.clubPoints === 1200 && mig2.lifetime === 4000, `points=${mig2.clubPoints} lifetime=${mig2.lifetime}`);

      // ── §S 捲動 ───────────────────────────────────────────────────────
      const scr = await realScroll(chrome, width, height, mobile, sleep);
      const tall = J(await chrome.evaluate(`
        const de = document.documentElement;
        return JSON.stringify({ tall: de.scrollHeight > de.clientHeight + 4 });
      `));
      ck(`${label}｜首頁捲得動`, !tall.tall || scr.moved > 0, `moved=${scr.moved}px tall=${tall.tall}`);

      // ── §M 俱樂部聲望 ─────────────────────────────────────────────────
      await chrome.navigate(url); await sleep(2200);
      const navM = String(await chrome.evaluate(enter("clubMastery"))).replace(/"/g, "");
      ck(`${label}｜進得去俱樂部專精`, navM === "clicked", navM);
      const mastery = J(await chrome.evaluate(`
        const pick = (id) => {
          const el = document.querySelector('[data-testid="' + id + '"]');
          return el ? (el.innerText || "").trim() : null;
        };
        const body = document.body.innerText || "";
        return JSON.stringify({
          prestigeLabel: pick("mastery-prestige-label"),
          tier: pick("mastery-club-tier"),
          saysClubLevel: body.includes("俱樂部等級"),
          ink: body.trim().length,
        });
      `));
      ck(`${label}｜專精頁顯示「俱樂部聲望」`, mastery.prestigeLabel === "俱樂部聲望",
        `label=${JSON.stringify(mastery.prestigeLabel)}`);
      ck(`${label}｜專精頁不再出現「俱樂部等級」`, mastery.saysClubLevel === false);
      ck(`${label}｜聲望階級仍在（沒被拆掉）`, Boolean(mastery.tier), `tier=${mastery.tier}`);

      // ── §A Club Assets ───────────────────────────────────────────────
      await chrome.navigate(url); await sleep(2200);
      const navA = String(await chrome.evaluate(enter("equip"))).replace(/"/g, "");
      ck(`${label}｜進得去俱樂部資產`, navA === "clicked", navA);
      const assets = J(await chrome.evaluate(`
        const body = document.body.innerText || "";
        return JSON.stringify({
          note: Boolean(document.querySelector('[data-testid="club-assets-note"]')),
          saysPrestige: body.includes("俱樂部聲望"),
          saysOldLevel: body.includes("俱樂部等級"),
          ink: body.trim().length,
        });
      `));
      ck(`${label}｜俱樂部資產頁正常渲染`, assets.ink > 200, `ink=${assets.ink}`);
      ck(`${label}｜資產頁說明句改用「聲望」`,
        assets.saysPrestige === true && assets.saysOldLevel === false,
        `prestige=${assets.saysPrestige} oldLevel=${assets.saysOldLevel}`);

      // ── §I Club Identity（沒裝備時應與上線前逐像素相同）────────────────
      await chrome.navigate(url); await sleep(2200);
      const identity = J(await chrome.evaluate(`
        const crest = document.querySelector(".esmo-hero__crest") || document.querySelector(".esmo-mobile-header__crest");
        const skin = document.querySelector('[data-testid="club-identity-skin"]')
          || document.querySelector(".esmo-mobile-header__skin");
        return JSON.stringify({
          crest: Boolean(crest),
          crestBadge: crest ? (crest.querySelector('[data-testid="home-crest-level"]')?.textContent ?? null) : null,
          skinLayer: Boolean(skin),
          aura: Boolean(document.querySelector('[data-testid="club-identity-aura"]')),
        });
      `));
      ck(`${label}｜Club Identity 圖層仍在（隊徽／皮膚／光暈）`,
        identity.crest && identity.skinLayer && identity.aura, JSON.stringify(identity));
      ck(`${label}｜隊徽角標掛的是 Club Level 而非 #48`,
        identity.crestBadge !== null && identity.crestBadge !== "48", `badge=${identity.crestBadge}`);

      // ── §Cp Competition Hub ＋ Opponent Inspect ───────────────────────
      await chrome.navigate(url); await sleep(2400);
      const compNav = String(await chrome.evaluate(`
        const b = document.querySelector('[data-testid="home-mode-bracket"]');
        if (!b) return "no-entry";
        b.click();
        await new Promise(r => setTimeout(r, 1600));
        return "clicked";
      `)).replace(/"/g, "");
      ck(`${label}｜進得去 Competition Hub`, compNav === "clicked", compNav);
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
            const lvl = card.querySelector('[data-testid="opponent-club-level"]');
            return JSON.stringify({
              ok: true,
              name: card.querySelector("h2")?.textContent ?? null,
              //  這一格現在讀的是 prestige（改名後的欄位；註解裡不能寫反引號，
              //  會提早結束外層樣板字串）。AI 俱樂部沒有聲望 ⇒ 不渲染是正確行為，
              //  渲染出來就必須是真的階級名稱、不得是假等級。
              levelText: lvl ? lvl.textContent.trim() : null,
              broken: (card.innerText || "").includes("undefined") || (card.innerText || "").includes("NaN"),
            });
          }
          await w(180);
        }
        return JSON.stringify({ ok: false, why: "card-not-open" });
      `));
      ck(`${label}｜點積分榜列開得出對手俱樂部卡`, inspect.ok === true, JSON.stringify(inspect));
      if (inspect.ok) {
        ck(`${label}｜對手卡沒有因欄位改名而壞掉（無 undefined／NaN）`, inspect.broken === false);
        ck(`${label}｜對手卡的階級欄位不是假等級`,
          inspect.levelText === null || !/^\s*(93|48)\s*$/.test(inspect.levelText),
          `levelText=${JSON.stringify(inspect.levelText)}`);
      }
      await chrome.evaluate(`document.querySelector('[data-testid="opponent-club-card-backdrop"]')?.click(); return "ok";`);

      // ── §CS 既有 CS runtime 進得去（本輪沒有動 CS，只確認沒被弄壞）──────
      await chrome.navigate(url); await sleep(2400);
      await chrome.evaluate(`const b=[...document.querySelectorAll("button")].find(x=>/CS/.test(x.innerText||"")); if(b) b.click(); return "ok";`);
      await sleep(2000);
      const csPrep = J(await chrome.evaluate(`
        return JSON.stringify({
          hasMapPicker: Boolean(document.querySelector('[data-testid="cs-practice-map-dust2"]')),
          hasPrimaryAction: Boolean(document.querySelector('[data-testid="prep-primary-action"]')),
        });
      `));
      ck(`${label}｜CS 賽前頁打得開（既有 runtime 未被本輪弄壞）`,
        csPrep.hasMapPicker && csPrep.hasPrimaryAction, JSON.stringify(csPrep));
    }

    // ── §E console：只看 page-origin 的錯誤 ─────────────────────────────
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
