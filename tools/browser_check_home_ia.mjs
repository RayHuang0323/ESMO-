#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_home_ia.mjs — 首頁資訊架構去重驗收
//
//  執行：`node tools/browser_check_home_ia.mjs`
//
//  ── 這一支在守什麼 ──────────────────────────────────────────────────────
//  首頁的四個區塊各有一個責任：
//    接下來做什麼 = 現在要處理什麼      戰隊狀態 = 目前狀況摘要
//    管理工具     = 需要時才進的功能    MOBA/CS/賽事 = 核心玩法入口
//  責任重疊的症狀是**同一個目的地出現在兩個以上同級入口**——那正是這裡數的東西。
//
//  ⚠ 不驗像素、不驗文案細節；驗的是「同一件事出現幾次」與「沒事時會不會硬塞」。
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5331;
const CDP_PORT = 9363;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 乾淨存檔，且**沒有任何待辦**（用來驗「沒事時不硬塞」）。 */
const FRESH_CALM = `
  ${RESOLVE_APP_MODULES}
  localStorage.removeItem("esmo.profile.v1");
  const st = () => profile.useProfileStore.getState();
  st().startNewGame("elite");
  //  清掉未讀、清掉發展點、把所有選手弄成健康 ⇒ 前三個待辦訊號不成立。
  //  ⚠ 第四個是資金。開局的預測常常是 warn（週淨額為負，
  //    那是正確的產品行為），而 warn 看的是**淨額**不是總資金，所以光撥款沒用。
  //    這裡用玩家真的會做的兩件事把它翻正：簽一份贊助（增加收入）＋ 撥款。
  //    翻不正也沒關係——底下的判斷會據實回報，不會假裝成功。
  st().grantTestFunds();
  st().signSponsor("rookie_grant", { fans: 999999, wins: 999 });
  profile.useProfileStore.setState({
    inbox: (st().inbox ?? []).map((m) => ({ ...m, unread: false })),
    teamDevelopment: { ...(st().teamDevelopment ?? {}), availablePoints: 0 },
    //  ⚠ 清空名單：薪資是週支出的主要來源，沒有選手才有機會讓淨額轉正，
    //    也順便讓「選手問題」訊號為 false ⇒ 四個訊號一起歸零。
    //    這是**測試佈置**，不是產品狀態；底下驗完空狀態就會把選手加回來。
    players: [],
  });
  st().save();
  const s = st();
  return { unread: (s.inbox ?? []).filter((m) => m.unread).length,
           points: s.teamDevelopment?.availablePoints ?? 0,
           forecast: s.cashForecast()?.level ?? null };
`;

/**
 * 製造一個「選手體力過低」的情境。
 * ⚠ 上面的佈置把名單清空了（為了讓週淨額轉正），所以這裡是**放一名選手回去**，
 *   不是去 map 一個空陣列。體力過低與否仍由既有的 `isExhausted` 判定。
 * ⚠ 舊版這裡放的是「傷停選手」。**選手隨機受傷／傷停已被產品取消** ⇒ 首頁的選手
 *   待辦只剩體力訊號。這名選手刻意仍帶著舊存檔的 `injuryDays`，用來反向確認
 *   它既不再產生待辦、也不會讓畫面出現傷停字樣。
 */
const MAKE_EXHAUSTED = `
  ${RESOLVE_APP_MODULES}
  const cond = await import(B + "/src/platform/condition/playerCondition.js");
  const st = () => profile.useProfileStore.getState();
  const players = [{ id: "t-tired", name: "測試選手", role: "top", lv: 1, xp: 0,
                     energy: cond.CONDITION.unfitBelow - 1, injuryDays: 3, injured: true }];
  profile.useProfileStore.setState({ players });
  st().save();
  return { exhausted: players.filter((p) => cond.isExhausted(p)).length };
`;

/** 數同一個目的地在首頁出現幾次（用按鈕文字近似，因為入口本來就是按鈕）。 */
const COUNT_ENTRIES = `
  const texts = [...document.querySelectorAll("button")]
    .map((n) => (n.innerText || "").replace(/\\s+/g, " ").trim())
    .filter(Boolean);
  const count = (re) => texts.filter((t) => re.test(t)).length;
  return {
    talent: count(/天賦/),
    //  桌機的贊助摘要卡按鈕寫「管理合作」／「尋找合作」，不含「贊助」二字，
    //  所以只比對「贊助」會數成 0——那是量錯，不是入口不見了。
    sponsor: count(/贊助|管理合作|尋找合作/),
    dashboardTool: count(/儀表板/),
    shop: count(/商店/),
    rosterish: count(/選手狀態|選手名單/),
    training: count(/訓練/),
    recruit: count(/招募/),
    all: texts.length,
  };
`;

async function main() {
  console.log("══ 首頁資訊架構去重驗收 ══\n");
  const server = await startDevServer({ port: VITE_PORT });
  const chrome = await launchChrome({ url: server.url, port: CDP_PORT, headless: HEADLESS });

  try {
    for (const vp of [
      { w: 1280, h: 800, mobile: false, label: "Desktop 1280" },
      { w: 390, h: 844, mobile: true, label: "Mobile 390" },
    ]) {
      console.log(`\n── ${vp.label} ──`);
      await chrome.send("Emulation.setDeviceMetricsOverride", {
        width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile,
      });
      await chrome.navigate(server.url);
      const calm = await chrome.evaluate(FRESH_CALM);
      await chrome.reload();
      await sleep(1500);

      //  ⚠ 這是**測試佈置**的結果，不是產品行為 ⇒ 只回報，不當紅燈。
      //    湊不出零待辦時，底下會改驗「有待辦就不該顯示空狀態」，一樣有鑑別力。
      const calmReached = calm.unread === 0 && calm.points === 0 && calm.forecast === "ok";
      console.log(`   （佈置：unread=${calm.unread} points=${calm.points} forecast=${calm.forecast}`
        + ` ⇒ ${calmReached ? "湊出零待辦" : "仍有資金待辦"}）`);

      //  手機的管理入口在 sheet 裡，要打開才數得到
      if (vp.mobile) {
        await chrome.evaluate(`
          const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
          document.querySelector('[data-testid="home-nav-team"]')?.click(); await wait(700);
          return true;`);
      }
      const teamEntries = await chrome.evaluate(COUNT_ENTRIES);
      if (vp.mobile) {
        await chrome.evaluate(`
          const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
          document.querySelector('[data-testid="home-nav-more"]')?.click(); await wait(700);
          return true;`);
      }
      const moreEntries = await chrome.evaluate(COUNT_ENTRIES);
      const seen = {
        talent: Math.max(teamEntries.talent, moreEntries.talent),
        sponsor: Math.max(teamEntries.sponsor, moreEntries.sponsor),
        dashboardTool: Math.max(teamEntries.dashboardTool, moreEntries.dashboardTool),
        shop: Math.max(teamEntries.shop, moreEntries.shop),
        rosterish: Math.max(teamEntries.rosterish, moreEntries.rosterish),
      };

      ck(`${vp.label}｜首頁不再有「天賦」入口`, seen.talent === 0, `找到 ${seen.talent} 個`);
      ck(`${vp.label}｜「儀表板」假入口已移除`, seen.dashboardTool === 0, `找到 ${seen.dashboardTool} 個`);
      ck(`${vp.label}｜贊助入口只剩摘要那一個`, seen.sponsor <= 1, `找到 ${seen.sponsor} 個`);
      ck(`${vp.label}｜「選手」入口不再同時出現在待辦與摘要`, seen.rosterish <= 1, `找到 ${seen.rosterish} 個`);
      ck(`${vp.label}｜商店佔位入口保留`, seen.shop >= 1, `找到 ${seen.shop} 個`);

      //  沒事時：誠實的空狀態，而不是硬塞捷徑
      if (vp.mobile) {
        await chrome.evaluate(`document.querySelector('[data-testid="home-nav-home"]')?.click(); return true;`);
        await sleep(600);
      }
      //  ⚠ 真正的不變式是「卡片數 === 成立的訊號數」——那才是「不再硬塞捷徑」。
      //    能不能湊出「零待辦」受情境經濟影響，不該當成主要判準。
      const parity = await chrome.evaluate(`
        ${RESOLVE_APP_MODULES}
        const cond = await import(B + "/src/platform/condition/playerCondition.js");
        const s = profile.useProfileStore.getState();
        const players = s.players ?? [];
        const signals =
          (s.cashForecast()?.level !== "ok" ? 1 : 0) +
          ((s.inbox ?? []).filter((m) => m.unread).length > 0 ? 1 : 0) +
          ((s.teamDevelopment?.availablePoints ?? 0) > 0 ? 1 : 0) +
          (players.some((p) => cond.isExhausted(p)) ? 1 : 0);
        const cards = document.querySelectorAll('.esmo-action-card, .esmo-mobile-quick').length
          + (document.querySelector('.esmo-mobile-primary--next') ? 1 : 0);
        const emptyCard = !!document.querySelector('[data-testid="home-actions-empty"]');
        return { signals, cards, emptyCard,
                 text: (document.body.innerText||"").includes("目前沒有急需處理的事項") };
      `);
      ck(`${vp.label}｜待辦卡片數 === 成立的訊號數（沒有填充物）`,
        parity.cards === parity.signals,
        `訊號 ${parity.signals} / 卡片 ${parity.cards}`);
      if (calmReached) {
        ck(`${vp.label}｜沒有待辦時顯示誠實空狀態`, parity.emptyCard && parity.text);
      } else {
        ck(`${vp.label}｜有待辦時不顯示空狀態`, !parity.emptyCard,
          `訊號 ${parity.signals} 個`);
      }

      //  有事時：待辦要浮上來
      await chrome.evaluate(MAKE_EXHAUSTED);
      await chrome.reload();
      await sleep(1500);
      const tired = await chrome.evaluate(`return {
        empty: !!document.querySelector('[data-testid="home-actions-empty"]'),
        text: (document.body.innerText||"").replace(/\\s+/g," "),
      };`);
      ck(`${vp.label}｜選手體力過低時，待辦浮上來（空狀態消失）`,
        !tired.empty && /選手體力過低/.test(tired.text),
        tired.text.slice(0, 90));
      ck(`${vp.label}｜舊存檔的傷停資料不會讓首頁出現傷停字樣`,
        !/傷停|受傷|療傷/.test(tired.text),
        (tired.text.match(/傷停|受傷|療傷/g) ?? []).join("") || "(乾淨)");

      const overflow = await chrome.evaluate(`return document.body.scrollWidth > window.innerWidth + 1;`);
      ck(`${vp.label}｜無 body 橫向捲動`, !overflow);
    }

    //  手機底部的「競技」不再開一個與 rail 相同的 sheet
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await chrome.reload();
    await sleep(1200);
    const compete = await chrome.evaluate(`
      const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
      document.querySelector('[data-testid="home-nav-compete"]')?.click();
      await wait(900);
      return { sheet: !!document.querySelector('[data-dashboard-mobile-sheet]'),
               rail: !!document.querySelector('[data-testid="home-compete-rail"]'),
               modes: document.querySelectorAll('[data-testid^="home-mode-"]').length };`);
    ck("Mobile｜底部「競技」不再開重複的 sheet", !compete.sheet);
    ck("Mobile｜競技 rail 仍在，三個模式入口都在", compete.rail && compete.modes === 3, `${compete.modes} 個模式`);

    ck("全程無未捕捉例外", chrome.pageErrors.length === 0,
      chrome.pageErrors.slice(0, 2).join(" | ") || "(無)");
  } finally {
    await chrome.close();
    await server.stop();
  }
  console.log(`\n${pass}/${pass + fail} 通過`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\n💥 ${e.message}`); process.exit(1); });
