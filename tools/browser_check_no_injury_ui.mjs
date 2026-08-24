#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_no_injury_ui.mjs — 移除選手受傷：真實瀏覽器驗收
//
//  執行：`node tools/browser_check_no_injury_ui.mjs`（加 --headed 可看畫面）。
//
//  ── 為什麼一定要在瀏覽器跑 ────────────────────────────────────────────────
//  `check_no_player_injury.mjs` 證明的是規則與原始碼；它證明不了
//  「玩家實際打開頁面時，那句『Kaiser 傷停中（還需 6 天）』真的不見了」。
//  這支 gate 用**舊存檔**（injuryDays = 6、injured = true）走完整個 App：
//  HOME → ROSTER → PLAYER PROFILE → TRAINING → MATCH PREP，
//  逐頁確認傷停字樣消失、而年齡／體力／疲勞狀態仍然正確顯示。
//
//  ⚠ 這支不驗數值公式（那是 node gate 的事），只驗**玩家看得到的東西**。
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5352;
const CDP_PORT = 9391;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 玩家看得到的傷病字樣。`還需 N 天` 是舊傷停閘門的招牌句。 */
const INJURY_WORDING = /傷停|療傷|傷病|受傷|還需\s*\d+\s*天/;

async function waitFor(chrome, expr, timeoutMs = 20_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { if (await chrome.evaluate(`return Boolean(${expr});`)) return true; } catch {}
    await sleep(250);
  }
  return false;
}
const bodyText = (chrome) => chrome.evaluate(`return (document.body.innerText || "").replace(/\\s+/g, " ");`);
const overflowed = (chrome) => chrome.evaluate(`return document.body.scrollWidth > window.innerWidth + 1;`);
//  ⚠ 首頁磚與名單卡是 GSAP reveal（進場前 `autoAlpha: 0` ⇒ `visibility: hidden`）。
//    元素已經在 DOM 裡，但 `innerText` 會回空字串 ⇒ 用文字找按鈕必須**等它可見**，
//    不能只等它存在。這是測試時序，不是產品行為。
const clickText = async (chrome, needle, timeoutMs = 12_000) => {
  const until = Date.now() + timeoutMs;
  const expr = `const b = [...document.querySelectorAll("button")].find((x) => (x.innerText||"").includes(${JSON.stringify(needle)}));`
    + `if (!b) return false; b.click(); return true;`;
  while (Date.now() < until) {
    try { if (await chrome.evaluate(expr)) return true; } catch {}
    await sleep(250);
  }
  return false;
};
const home = async (chrome, url) => { await chrome.navigate(url); await sleep(900); };

//  舊存檔佈置：第 0 人是「Kaiser」（27 歲、體力 66、injuryDays 6、injured true），
//  第 1 人是真正的 exhausted（體力 5），其餘健康。injury 欄位刻意保留 ⇒ 這正是
//  「舊存檔仍含傷停資料」的情境，本輪要求 runtime 讀得到但完全忽略。
const SEED_OLD_SAVE = `
  ${RESOLVE_APP_MODULES}
  const st = () => profile.useProfileStore.getState();
  const players = (st().players ?? []).map((p, i) => {
    if (i === 0) return { ...p, name: "Kaiser", age: 27, energy: 66, condition: "正常",
                          injuryDays: 6, injured: true, injuryUntil: 999, injuryRisk: 0.4,
                          rosterTier: "active", status: "主力" };
    if (i === 1) return { ...p, energy: 5, condition: "低潮", rosterTier: "active", status: "主力" };
    return { ...p, energy: 90, condition: "精神飽滿", rosterTier: "active", status: "主力" };
  });
  profile.useProfileStore.setState({ players });
  st().save();
  const raw = JSON.parse(localStorage.getItem("esmo.profile.v1") || "{}");
  return { count: players.length,
           persistedInjuryDays: raw.players?.[0]?.injuryDays ?? null,
           kaiser: { age: players[0].age, energy: players[0].energy },
           exhausted: players[1].energy };
`;

const VIEWPORTS = [
  { label: "Desktop 1366", w: 1366, h: 900, mobile: false },
  { label: "Mobile 390", w: 390, h: 844, mobile: true },
];

let dev = null, chrome = null;
try {
  dev = await startDevServer({ port: VITE_PORT });
  chrome = await launchChrome({ url: dev.url, port: CDP_PORT, headless: HEADLESS });
  await chrome.navigate(dev.url);
  await sleep(900);
  await chrome.evaluate(`localStorage.removeItem("esmo.profile.v1"); location.reload();`);
  await waitFor(chrome, `document.readyState === 'complete'`);
  await sleep(900);

  const seeded = await chrome.evaluate(SEED_OLD_SAVE);
  ck("佈置｜舊存檔寫入成功（injuryDays 真的落到 localStorage）",
    seeded.persistedInjuryDays === 6 && seeded.kaiser.age === 27 && seeded.kaiser.energy === 66,
    JSON.stringify(seeded));

  for (const vp of VIEWPORTS) {
    console.log(`\n── ${vp.label} ───────────────────────────────`);
    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile });
    await home(chrome, dev.url);
    await sleep(700);

    // ── HOME / TEAM ────────────────────────────────────────────────────────
    const homeText = await bodyText(chrome);
    ck(`${vp.label}｜HOME 不再出現 injury warning`,
      !INJURY_WORDING.test(homeText), (homeText.match(INJURY_WORDING) ?? []).join("") || "(乾淨)");
    ck(`${vp.label}｜HOME 仍會提示「選手體力過低」（疲勞沒有一併失效）`,
      /選手體力過低/.test(homeText), homeText.slice(0, 80));
    ck(`${vp.label}｜HOME 無 body 橫向捲動`, !(await overflowed(chrome)));

    // ── ROSTER ─────────────────────────────────────────────────────────────
    if (vp.mobile) {
      await chrome.evaluate(`document.querySelector('[data-testid="home-nav-team"]')?.click(); return true;`);
      await sleep(700);
    }
    const rosterOpen = await clickText(chrome, "選手")
      && await waitFor(chrome, `document.querySelector('[data-testid^="roster-player-"]')`);
    ck(`${vp.label}｜ROSTER 可開啟`, rosterOpen);

    if (rosterOpen) {
      const rosterText = await bodyText(chrome);
      ck(`${vp.label}｜ROSTER 不出現傷停字樣`,
        !INJURY_WORDING.test(rosterText), (rosterText.match(INJURY_WORDING) ?? []).join("") || "(乾淨)");
      //  舊傷停選手仍完整顯示且可出賽；真正 exhausted 的人仍標示不可出賽。
      //  等到卡片真的**渲染出文字**（reveal 動畫跑完）再讀，否則讀到一排空字串。
      await waitFor(chrome, `[...document.querySelectorAll('[data-testid^="roster-player-"]')]
        .some((r) => (r.innerText || "").trim().length > 0)`, 12_000);
      const badges = await chrome.evaluate(`
        const rows = [...document.querySelectorAll('[data-testid^="roster-player-"]')];
        return rows.map((r) => (r.innerText || "").replace(/\\s+/g, " ")).slice(0, 6);`);
      const kaiser = badges.find((t) => t.includes("Kaiser")) ?? "";
      ck(`${vp.label}｜ROSTER：舊傷停選手仍顯示且標為「可出賽」`,
        kaiser.includes("Kaiser") && kaiser.includes("可出賽") && !INJURY_WORDING.test(kaiser),
        kaiser.slice(0, 90) || `找不到 Kaiser；共 ${badges.length} 列：${badges.map((t) => t.slice(0, 24)).join(" / ")}`);
      ck(`${vp.label}｜ROSTER：exhausted 選手仍標為「不可出賽」`,
        badges.some((t) => t.includes("不可出賽")),
        `${badges.filter((t) => t.includes("不可出賽")).length} 人／共 ${badges.length} 列`);
      ck(`${vp.label}｜ROSTER 無 body 橫向捲動`, !(await overflowed(chrome)));

      // ── PLAYER PROFILE ──────────────────────────────────────────────────
      await chrome.evaluate(`
        const rows = [...document.querySelectorAll('[data-testid^="roster-player-"]')];
        const k = rows.find((r) => (r.innerText||"").includes("Kaiser")) ?? rows[0];
        k?.click(); return Boolean(k);`);
      await sleep(500);
      await clickText(chrome, "開啟完整選手檔案");
      const profileOpen = await waitFor(chrome, `document.querySelectorAll('[data-testid^="player-profile-tab-"]').length === 4`);
      ck(`${vp.label}｜PLAYER PROFILE 可開啟（四個分頁）`, profileOpen);

      if (profileOpen) {
        const prof = await chrome.evaluate(`
          const t = (s) => (document.querySelector(s)?.innerText || "").replace(/\\s+/g, " ");
          return { all: (document.body.innerText||"").replace(/\\s+/g," "),
                   status: t('[data-testid="player-status-panel"]'),
                   growth: Boolean(document.querySelector('[data-testid="player-recent-growth-summary"]')
                                || document.querySelector('[data-testid="player-growth-panel"]')
                                || document.querySelector('[data-testid="player-growth-empty"]')),
                   lifecycle: t('[data-testid="player-lifecycle-panel"]') || t('[data-testid="player-career-foundation"]') };`);
        ck(`${vp.label}｜PROFILE 不出現「傷停」／injury day`,
          !INJURY_WORDING.test(prof.all), (prof.all.match(INJURY_WORDING) ?? []).join("") || "(乾淨)");
        //  年齡在「生涯」分頁；桌機的總覽也會帶到，手機版要切過去才看得到。
        let ageText = prof.all;
        if (!/27\s*歲/.test(ageText)) {
          await chrome.evaluate(`document.querySelector('[data-testid="player-profile-tab-career"]')?.click(); return true;`);
          await sleep(600);
          ageText = await bodyText(chrome);
        }
        ck(`${vp.label}｜PROFILE：年齡仍正常顯示（27 歲）`,
          /27\s*歲/.test(ageText), (ageText.match(/\d+\s*歲/g) ?? []).join(",") || "(找不到年齡)");
        ck(`${vp.label}｜PROFILE：狀態面板顯示可出賽＋體力 66`,
          prof.status.includes("可出賽") && /66/.test(prof.status) && !INJURY_WORDING.test(prof.status),
          prof.status.slice(0, 90));
        ck(`${vp.label}｜PROFILE：成長區塊仍在（recent growth 正常）`, prof.growth);
        ck(`${vp.label}｜PROFILE 無 body 橫向捲動`, !(await overflowed(chrome)));
      }
    }

    // ── TRAINING ────────────────────────────────────────────────────────────
    await home(chrome, dev.url);
    //  ⚠ 不能用「訓練」當關鍵字：首頁的 CS 模式磚寫的是「CS 訓練賽」，會先被點到。
    //    桌機的入口文字是「訓練中心」；手機在「更多」sheet 裡，用 testid 直接點。
    let trainingClicked;
    if (vp.mobile) {
      //  ⚠ 訓練安排住在「戰隊」sheet，不是「更多」（更多只有財務／商店／新遊戲）。
      await chrome.evaluate(`document.querySelector('[data-testid="home-nav-team"]')?.click(); return true;`);
      await waitFor(chrome, `document.querySelector('[data-testid="home-sheet-training"]')`, 8_000);
      trainingClicked = await chrome.evaluate(
        `const b = document.querySelector('[data-testid="home-sheet-training"]'); b?.click(); return Boolean(b);`);
    } else {
      trainingClicked = await clickText(chrome, "訓練中心");
    }
    const trainingOpen = trainingClicked
      && await waitFor(chrome, `(document.body.innerText||"").includes("推進訓練日")`, 12_000);
    ck(`${vp.label}｜TRAINING 可開啟`, trainingOpen);
    if (trainingOpen) {
      //  課程格要選到人才會出現（`sel` 為空時整段不 render）⇒ 先點一位選手。
      await chrome.evaluate(`
        const btns = [...document.querySelectorAll("button")]
          .filter((b) => /精神飽滿|正常|疲勞|低潮/.test(b.innerText || ""));
        btns[0]?.click(); return Boolean(btns[0]);`);
      const coursesOpen = await waitFor(chrome, `(document.body.innerText||"").includes("選擇課程指派")`, 8_000);
      ck(`${vp.label}｜TRAINING：選到選手後課程格出現（Training v1.1 預估仍在）`,
        coursesOpen && await chrome.evaluate(`return (document.body.innerText||"").includes("預估成長");`));
      const trainText = await bodyText(chrome);
      ck(`${vp.label}｜TRAINING 不出現傷停／受傷風險字樣`,
        !INJURY_WORDING.test(trainText), (trainText.match(INJURY_WORDING) ?? []).join("") || "(乾淨)");
      ck(`${vp.label}｜TRAINING 無 body 橫向捲動`, !(await overflowed(chrome)));
    }

    // ── MATCH PREP ─────────────────────────────────────────────────────────
    await home(chrome, dev.url);
    await chrome.evaluate(`document.querySelector('[data-testid="home-mode-moba"]')?.click(); return true;`);
    const prepOpen = await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')`, 30_000);
    ck(`${vp.label}｜MATCH PREP 可開啟`, prepOpen);
    if (prepOpen) {
      const prep = await chrome.evaluate(`
        const seats = [...document.querySelectorAll('[data-testid="squad-seat"]')];
        const btn = document.querySelector('[data-testid="prep-primary-action"]');
        return { seats: seats.length,
                 seated: seats.filter((s) => s.dataset.seated === "true" || (s.innerText||"").trim().length > 2).length,
                 disabled: Boolean(btn?.disabled),
                 all: (document.body.innerText||"").replace(/\\s+/g," ") };`);
      ck(`${vp.label}｜MATCH PREP：injury 不再阻止出賽（沒有傷停阻擋訊息）`,
        !INJURY_WORDING.test(prep.all), (prep.all.match(INJURY_WORDING) ?? []).join("") || "(乾淨)");
      ck(`${vp.label}｜MATCH PREP：陣容席位有被填上（lineup 操作正常）`,
        prep.seats > 0 && prep.seated > 0, JSON.stringify({ seats: prep.seats, seated: prep.seated, disabled: prep.disabled }));
      ck(`${vp.label}｜MATCH PREP 無 body 橫向捲動`, !(await overflowed(chrome)));
    }
  }

  // ── console ──────────────────────────────────────────────────────────────
  const errs = chrome.consoleLines.filter((l) => l.startsWith("[error]"));
  ck("console：page error = 0、page-origin uncaught error = 0",
    errs.length === 0 && chrome.pageErrors.length === 0,
    [...errs.slice(0, 3), ...chrome.pageErrors.slice(0, 3)].join(" | ") || "(無)");
} catch (error) {
  ck("gate 可執行", false, String(error?.stack ?? error).slice(0, 400));
} finally {
  try { await chrome?.close(); } catch {}
  try { await dev?.stop(); } catch {}
}

console.log(`\n${fail === 0 ? "✅" : "❌"} browser_check_no_injury_ui：${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
