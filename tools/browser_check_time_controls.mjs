#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_time_controls.mjs — Season vNext V3：快轉入口瀏覽器驗收
//
//  執行：`node tools/browser_check_time_controls.mjs`（加 `--headed` 看畫面）
//
//  ── 這一支在守什麼 ──────────────────────────────────────────────────────
//  `check_time_block_v3` 驗的是**規則**（規劃器、容量、結算冪等）。
//  規則對不代表玩家按得到——V3 的三顆按鈕、停下原因、窄螢幕排版都只有
//  真的在瀏覽器裡跑起來才算數。Roadmap 早就把這一支列為 V3 的收尾條件。
//
//  ── 為什麼要有 390px 這一段 ─────────────────────────────────────────────
//  世界時間卡在桌面寬度只有 237px，三顆按鈕會換行。窄螢幕下 `.esmo-status-grid`
//  會換成單欄（`@media (max-width: 520px)`），卡片變寬、按鈕重新排列
//  ⇒ 這是**真的會壞、而且只在窄螢幕壞**的地方，必須用 device metrics override
//  觸發真正的 media query，不能只把視窗拉窄。
//
//  ⚠ 不驗像素、不驗文案措辭；驗的是「按得到、走得動、擋得住、不溢出」。
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5347;
const CDP_PORT = 9371;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 乾淨存檔，沒有賽季（先驗「沒有賽程」那一組行為）。 */
const FRESH = `
  ${RESOLVE_APP_MODULES}
  localStorage.removeItem("esmo.profile.v1");
  const st = () => profile.useProfileStore.getState();
  st().startNewGame("elite");
  st().save();
  return { day: st().meta.days, hasSeason: !!st().competitionByMode?.moba?.schema };
`;

/**
 * 讀世界時間卡的狀態。**只讀 DOM**——驗的是玩家看得到什麼。
 * ⚠ 定義成函式再共用，不要用字串拼接去改寫 `return`——那會拼出語法錯誤的程式碼。
 */
const READ_CARD = `
  const readCard = () => {
    const card = document.querySelector('[data-testid="home-world-time"]');
    const q = (s) => document.querySelector('[data-testid="' + s + '"]');
    if (!card) return { found: false };
    const cr = card.getBoundingClientRect();
    const acts = card.querySelector('.esmo-worldtime-actions');
    const btns = acts ? [...acts.querySelectorAll('button')].map((b) => {
      const r = b.getBoundingClientRect();
      return { t: b.textContent.trim(), x: Math.round(r.x), y: Math.round(r.y),
               w: Math.round(r.width), right: Math.round(r.right), visible: r.width > 0 && r.height > 0 };
    }) : [];
    return {
      found: true,
      text: card.textContent,
      nextStop: q('home-next-stop')?.textContent ?? null,
      hasDay: !!q('home-advance-day'), hasDays: !!q('home-advance-days'), hasNext: !!q('home-advance-next'),
      cardWidth: Math.round(cr.width),
      btns,
      overflowsCard: btns.some((b) => b.right > Math.round(cr.right) + 1),
      bodyOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      innerW: window.innerWidth,
    };
  };
`;

const CARD = `${READ_CARD} return readCard();`;

/** 點一顆按鈕並等 React 重繪。 */
const click = (id) => `
  ${READ_CARD}
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const el = document.querySelector('[data-testid="${id}"]');
  if (!el) return { clicked: false };
  el.click();
  await wait(500);
  return { clicked: true, ...readCard() };
`;

const dayOf = (text) => {
  const m = /CLOCK(\d+)\s*天/.exec((text ?? "").replace(/\s/g, "").replace("天", " 天"));
  return m ? Number(m[1]) : null;
};

async function main() {
  const server = await startDevServer({ port: VITE_PORT });
  const chrome = await launchChrome({ url: server.url, port: CDP_PORT, headless: HEADLESS });
  try {
    // ══════════════════════════════════════════════════════════════════════
    console.log("\n【§D 桌面 1280×900】");
    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    //  ⚠ 先 navigate 再 evaluate：剛啟動時 target 可能還停在 about:blank，
    //    那時 `RESOLVE_APP_MODULES` 會把 base 算成 "blank/…" 而解不到模組。
    await chrome.navigate(server.url);
    await sleep(600);
    await chrome.evaluate(FRESH);
    await chrome.reload();
    await sleep(1500);

    const d0 = await chrome.evaluate(CARD);
    ck("D1) 首頁看得到世界時間卡", d0.found);
    ck("D2) 三顆快轉按鈕都在", d0.hasDay && d0.hasDays && d0.hasNext,
      d0.btns.map((b) => b.t).join(" / "));
    ck("D3) 三顆按鈕都真的可見（有寬高）", d0.btns.length === 3 && d0.btns.every((b) => b.visible));
    ck("D4) 按鈕不溢出卡片", !d0.overflowsCard, `卡片寬 ${d0.cardWidth}`);
    ck("D5) 沒有賽程時，下一站是生涯年度邊界", /生涯年度/.test(d0.nextStop ?? ""), d0.nextStop);

    const base = dayOf(d0.text);
    const a1 = await chrome.evaluate(click("home-advance-day"));
    ck("D6) 推進 1 天 ⇒ 世界時間 +1，且顯示已推進", dayOf(a1.text) === base + 1 && /已推進 1 天/.test(a1.text),
      `第 ${base} → ${dayOf(a1.text)} 天`);

    const a7 = await chrome.evaluate(click("home-advance-days"));
    ck("D7) 推進 7 天 ⇒ 世界時間 +7", dayOf(a7.text) === base + 8,
      `第 ${dayOf(a1.text)} → ${dayOf(a7.text)} 天`);

    const an = await chrome.evaluate(click("home-advance-next"));
    ck("D8) 前往下一站 ⇒ 真的走得動，且不超過快轉上限 28 天",
      dayOf(an.text) > dayOf(a7.text) && dayOf(an.text) - dayOf(a7.text) <= 28,
      `第 ${dayOf(a7.text)} → ${dayOf(an.text)} 天（推 ${dayOf(an.text) - dayOf(a7.text)} 天）`);

    // ══════════════════════════════════════════════════════════════════════
    console.log("\n【§M 手機 390×844（真 media query）】");
    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await chrome.reload();
    await sleep(1500);

    const m0 = await chrome.evaluate(`
      ${READ_CARD}
      const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
      document.querySelector('[data-testid="home-world-time"]')?.scrollIntoView({block:'center'});
      await wait(500);
      return readCard();
    `);
    ck("M1) 390px 下 viewport 真的是 390（device metrics 生效）", m0.innerW === 390, `innerW ${m0.innerW}`);
    ck("M2) 390px 下卡片仍在，三顆按鈕都在", m0.found && m0.hasDay && m0.hasDays && m0.hasNext);
    ck("M3) 三顆按鈕都可見（沒有被擠成 0 寬）", m0.btns.length === 3 && m0.btns.every((b) => b.visible),
      m0.btns.map((b) => `${b.t}:${b.w}px`).join(" "));
    ck("M4) **按鈕不溢出卡片**（窄螢幕最會壞的地方）", !m0.overflowsCard,
      `卡片寬 ${m0.cardWidth}，最右按鈕 ${Math.max(...m0.btns.map((b) => b.right))}`);
    ck("M5) **頁面沒有橫向捲動**", !m0.bodyOverflow);

    const m1 = await chrome.evaluate(click("home-advance-day"));
    ck("M6) 390px 下按鈕真的按得動", m1.clicked && dayOf(m1.text) === dayOf(m0.text) + 1,
      `第 ${dayOf(m0.text)} → ${dayOf(m1.text)} 天`);

    // ══════════════════════════════════════════════════════════════════════
    console.log("\n【§F 有正式賽程時必須停住】");
    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    //  建立賽季，然後把世界時間推到玩家自己的下一場比賽日
    const setup = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = () => profile.useProfileStore.getState();
      st().ensureCompetitionSeason("moba");
      st().save();
      const fx = st().worldTimeView().nextFixtureDay;
      //  一路快轉到比賽日（走正式入口，不作弊寫時鐘）
      let guard = 0;
      while (st().worldTimeView().day < fx && guard++ < 60) {
        const r = st().advanceToNextStop();
        if (!r.ok || r.daysAdvanced === 0) break;
      }
      return { fixtureDay: fx, nowDay: st().worldTimeView().day, guard };
    `);
    await chrome.reload();
    await sleep(1400);

    ck("F1) 快轉停在**玩家自己的比賽日**，一天都沒有多走",
      setup.nowDay === setup.fixtureDay,
      `賽程日 ${setup.fixtureDay}｜停在 ${setup.nowDay}`);

    const f0 = await chrome.evaluate(CARD);
    ck("F2) **站在比賽日上時，下一站說的是「今天」**（不得顯示成遙遠的年度邊界）",
      /今天/.test(f0.nextStop ?? "") && !/生涯年度/.test(f0.nextStop ?? ""),
      f0.nextStop);

    const fDay = dayOf(f0.text);
    const t1 = await chrome.evaluate(click("home-advance-day"));
    ck("F3) 比賽日按「推進 1 天」⇒ 不動，並顯示原因",
      dayOf(t1.text) === fDay && /請先出賽或棄權/.test(t1.text),
      `仍在第 ${dayOf(t1.text)} 天`);

    const t7 = await chrome.evaluate(click("home-advance-days"));
    ck("F4) 比賽日按「推進 7 天」⇒ 不動，並顯示原因",
      dayOf(t7.text) === fDay && /請先出賽或棄權/.test(t7.text));

    const tn = await chrome.evaluate(click("home-advance-next"));
    ck("F5) 比賽日按「前往下一站」⇒ 不動，並顯示原因",
      dayOf(tn.text) === fDay && /請先出賽或棄權/.test(tn.text));

    const after = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const s = profile.useProfileStore.getState();
      const st = s.competitionByMode?.moba;
      const played = (st?.fixtures ?? []).filter((f) => f.status !== "scheduled").length;
      const forfeited = (st?.fixtures ?? []).filter((f) => f.status === "forfeited").length;
      return { day: s.meta.days, played, forfeited, total: (st?.fixtures ?? []).length };
    `);
    ck("F6) **沒有任何一場被自動棄權**（快轉不得替玩家做決定）",
      after.forfeited === 0, `棄權 ${after.forfeited}／共 ${after.total} 場`);

    ck("F7) 全程無未捕捉例外", chrome.pageErrors.length === 0,
      chrome.pageErrors.slice(0, 2).join(" | ") || "(無)");
  } finally {
    await chrome.close();
    await server.stop();
  }
  console.log(`\n${fail === 0 ? "✅" : "❌"} browser_check_time_controls：${pass}/${pass + fail} 通過`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\n💥 ${e.message}`); process.exit(1); });
