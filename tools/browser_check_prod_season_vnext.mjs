#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_prod_season_vnext.mjs — Season vNext 正式站 smoke
//
//  執行：`node tools/browser_check_prod_season_vnext.mjs`（加 `--headed` 看畫面）
//
//  ⚠ **正式站只能走 UI ＋ localStorage**（TD-31）。
//    `RESOLVE_APP_MODULES` 匯入 `/src/...`，那只在 dev server 存在；
//    正式站是打包後的 bundle，沒有那些路徑 ⇒ 這支一律用 data-testid 點擊，
//    不讀 Store、不呼叫 action。
//  ⚠ 這也是刻意的：正式站要驗的是「玩家真的按得到」，不是「函式回傳正確」。
// ============================================================================
import { launchChrome } from "./browser/cdp.mjs";

const PROD = process.env.ESMO_PROD_URL ?? "https://rayhuang0323.github.io/ESMO-/";
const CDP_PORT = 9391;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CLICK = (id, wait = 900) => `
  const w=(ms)=>new Promise(r=>setTimeout(r,ms));
  const el=document.querySelector('[data-testid="${id}"]');
  if(!el) return {clicked:false};
  el.click(); await w(${wait});
  return {clicked:true};
`;
const SEE = `
  const q=(s)=>document.querySelector('[data-testid="'+s+'"]');
  const txt=(s)=>q(s)?.textContent?.trim() ?? null;
  return {
    url: location.hash || location.pathname,
    white: document.body.innerText.trim().length < 40,
    worldTime: txt("home-world-time"),
    offseasonLine: txt("home-offseason"),
    offseasonEnter: txt("home-offseason-enter"),
    intent: txt("home-retirement-intent"),
    nextStop: txt("home-next-stop"),
    modes: [...document.querySelectorAll('[data-testid^="home-mode-"]')].map(b=>b.dataset.testid),
    offScreen: !!q("offseason-screen"),
    offSections: ["offseason-summary","offseason-retirement","offseason-contracts",
                  "offseason-recruit","offseason-budget","offseason-complete"].filter(id=>!!q(id)),
    innerW: window.innerWidth,
    bodyOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
`;

async function main() {
  console.log(`══ Season vNext 正式站 smoke ══\n${PROD}\n`);
  const chrome = await launchChrome({ url: PROD, port: CDP_PORT, headless: HEADLESS });
  try {
    await sleep(2500);

    console.log("【§H 首頁 / 桌面 1280】");
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    //  乾淨存檔：只用 localStorage（正式站允許的唯一佈置手段）
    await chrome.evaluate(`localStorage.removeItem("esmo.profile.v1"); return 1;`);
    await chrome.navigate(PROD);
    await sleep(2600);
    let s = await chrome.evaluate(SEE);
    ck("H1) 首頁載入，**無白屏**", !s.white);
    ck("H2) 世界時間卡在", !!s.worldTime, s.worldTime?.replace(/\s+/g, " ").slice(0, 46));
    ck("H3) 三個玩法入口都在（MOBA / CS / 賽事）", s.modes.length === 3, s.modes.join("／"));
    ck("H4) 下一站顯示得出來", !!s.nextStop, s.nextStop);

    console.log("\n【§T 世界時間】");
    const d0 = (s.worldTime ?? "").match(/(\d+)\s*天/)?.[1];
    await chrome.evaluate(CLICK("home-advance-day"));
    let s1 = await chrome.evaluate(SEE);
    const d1 = (s1.worldTime ?? "").match(/(\d+)\s*天/)?.[1];
    ck("T1) 推進 1 天", Number(d1) === Number(d0) + 1, `第 ${d0} → ${d1} 天`);

    await chrome.evaluate(CLICK("home-advance-days"));
    let s2 = await chrome.evaluate(SEE);
    const d2 = (s2.worldTime ?? "").match(/(\d+)\s*天/)?.[1];
    ck("T2) 推進 7 天", Number(d2) === Number(d1) + 7, `第 ${d1} → ${d2} 天`);

    await chrome.evaluate(CLICK("home-advance-next", 1400));
    let s3 = await chrome.evaluate(SEE);
    const d3 = (s3.worldTime ?? "").match(/(\d+)\s*天/)?.[1];
    ck("T3) 前往下一站", Number(d3) > Number(d2) && Number(d3) - Number(d2) <= 28,
      `第 ${d2} → ${d3} 天（推 ${Number(d3) - Number(d2)} 天）`);

    console.log("\n【§Y 跨年度 → 休賽期】");
    //  ⚠ **順序**：先用「推進 7 天」爬到年度邊界前，**再**把合約改短，最後才跨年。
    //    反過來（先改短）那些合約會在路上就到期、在邊界被結算掉，休賽期反而沒東西
    //    可決策。`browser_check_offseason` 第一版就是栽在這個順序上。
    //  ⚠ 而且**正式站首次載入時 localStorage 是全空的**——存檔要推進過天數才寫得出來，
    //    所以「一開場就 patch 合約」是 no-op。必須推到這裡才 patch。
    let guard = 0, cur = Number(d3), seen = null;
    while (cur < 78 && guard++ < 12) {
      await chrome.evaluate(CLICK("home-advance-days", 1000));
      seen = await chrome.evaluate(SEE);
      const n = Number((seen.worldTime ?? "").match(/(\d+)\s*天/)?.[1]);
      if (!Number.isFinite(n) || n === cur) break;
      cur = n;
    }
    const seeded = await chrome.evaluate(`
      const raw = localStorage.getItem("esmo.profile.v1");
      if (!raw) return { ok:false, patched:0, day:null };
      const save = JSON.parse(raw);
      let n = 0;
      (save.players ?? []).forEach((p, i) => { if (i < 2) { p.contract = 40; n++; } });
      //  一併補資金。續約報價是市場價值的一半（~$79萬），開局 $35萬**買不起**，
      //  按鈕會是 disabled——那是正確行為，不是缺陷，但這樣就驗不到花錢那條路。
      //  dev gate 用 grantTestFunds()；正式站碰不到 Store，只能從存檔補。
      //  ⚠ finance.funds 的單位是**元**，不是萬（OffSeasonScreen.jsx:118
      //    的 afford 判定是 cost * 10000 <= funds）。補 5000 只有 $0.5萬。
      save.finance = { ...(save.finance ?? {}), funds: 100000000 };
      localStorage.setItem("esmo.profile.v1", JSON.stringify(save));
      return { ok:true, patched:n, day: save?.meta?.days ?? null, funds: save.finance.funds };
    `);
    ck("Y0) 佈置成功：邊界前改短 2 份合約並補足資金（正式站只能靠 localStorage）",
      seeded.ok && seeded.patched === 2 && seeded.funds === 100000000,
      `day ${seeded.day}｜改短 ${seeded.patched} 份｜資金 $${Math.round(seeded.funds / 10000)}萬`);
    await chrome.navigate(PROD);
    await sleep(2600);

    guard = 0;
    while (cur < 90 && guard++ < 12) {
      await chrome.evaluate(CLICK("home-advance-next", 1500));
      seen = await chrome.evaluate(SEE);
      const n = Number((seen.worldTime ?? "").match(/(\d+)\s*天/)?.[1]);
      if (!Number.isFinite(n)) break;
      //  休賽期一開就會擋住世界時間 ⇒ 天數不動是**預期**，不是卡住。
      if (seen.offseasonEnter || seen.offScreen) { cur = n; break; }
      if (n === cur) break;
      cur = n;
    }
    ck("Y1) 推得過生涯年度邊界（第 84 天）", cur > 84, `目前第 ${cur} 天`);
    ck("Y2) **年度封存**顯示得出來", !!seen?.offseasonLine, seen?.offseasonLine?.replace(/\s+/g, " "));

    const hasOff = !!seen?.offseasonEnter;
    //  ⚠ 「沒有決策就不開」是**設計行為**，不是失敗。所以這一條驗的是
    //    「開或不開都符合當下狀態」，不是「一定要開」。
    ck("Y3) 休賽期的開／不開與當下決策狀態一致",
      hasOff || !seen?.offScreen,
      hasOff ? seen.offseasonEnter.replace(/\s+/g, " ") : "（本次跨年無待處理決策 ⇒ 不開畫面，符合設計）");

    if (hasOff) {
      console.log("\n【§O 休賽期流程】");
      await chrome.evaluate(CLICK("home-offseason-enter", 1400));
      const o = await chrome.evaluate(SEE);
      ck("O1) 進得去休賽期畫面", o.offScreen);
      ck("O2) 六個區塊都在", o.offSections.length === 6, o.offSections.length + "/6");
      const acted = await chrome.evaluate(`
        const w=(ms)=>new Promise(r=>setTimeout(r,ms));
        const one=(p)=>document.querySelector('[data-testid^="'+p+'"]');
        const q=(s)=>document.querySelector('[data-testid="'+s+'"]');
        const f0=q("offseason-funds")?.textContent ?? null;
        const renew=one("offseason-renew-");
        //  ⚠ 記下 disabled：買不起時按鈕本來就該是 disabled，那是**正確行為**。
        //    紅的時候要分得出「壞了」還是「錢不夠」，否則會誤判成產品缺陷。
        const renewOff=!!renew?.disabled;
        if(renew && !renew.disabled){renew.click(); await w(800);}
        const f1=q("offseason-funds")?.textContent ?? null;
        const sign=one("offseason-sign-");
        const signOff=!!sign?.disabled;
        if(sign && !sign.disabled){sign.click(); await w(800);}
        const f2=q("offseason-funds")?.textContent ?? null;
        q("offseason-complete-btn")?.click(); await w(1200);
        return {f0,f1,f2, hadRenew:!!renew, hadSign:!!sign, renewOff, signOff,
                back: !!document.querySelector('[data-testid="home-world-time"]')};
      `);
      ck("O3) 續約／補強按得動且預算會變",
        acted.hadRenew && acted.hadSign && (acted.f0 !== acted.f2 || acted.f0 !== acted.f1),
        `${acted.f0} → ${acted.f1} → ${acted.f2}`
          + (acted.renewOff || acted.signOff
            ? `｜⚠ disabled：續約 ${acted.renewOff}／補強 ${acted.signOff}（資金不足時這是正確行為）` : ""));
      ck("O4) 完成休賽期回得到首頁", acted.back);

      const afterOff = await chrome.evaluate(`
        const w=(ms)=>new Promise(r=>setTimeout(r,ms));
        const before=document.querySelector('[data-testid="home-world-time"]')?.textContent ?? "";
        document.querySelector('[data-testid="home-advance-days"]')?.click(); await w(900);
        const after=document.querySelector('[data-testid="home-world-time"]')?.textContent ?? "";
        return {before, after};
      `);
      const b = Number(afterOff.before.match(/(\d+)\s*天/)?.[1]);
      const a = Number(afterOff.after.match(/(\d+)\s*天/)?.[1]);
      ck("O5) 完成後世界時間又走得動", a > b, `第 ${b} → ${a} 天`);
    } else {
      console.log("\n【§O 休賽期流程】（本次跨年沒有待處理決策 ⇒ 依設計不開畫面）");
      ck("O1) 沒有決策時**不多卡一道空殼畫面**", !seen?.offScreen);
    }

    console.log("\n【§P 選手 / 生涯階段 / 市場價值】");
    await chrome.navigate(PROD);
    await sleep(2400);
    const player = await chrome.evaluate(`
      const w=(ms)=>new Promise(r=>setTimeout(r,ms));
      const q=(s)=>document.querySelector('[data-testid="'+s+'"]');
      const byText=(re)=>[...document.querySelectorAll("button")].find(b=>re.test(b.textContent||""));
      const out={};
      //  首頁 →「查看名單」→ 點一名選手 →「開啟完整選手檔案」→ 生涯分頁
      //  ⚠ 只有「查看名單」與「開啟完整選手檔案」沒有 data-testid，只能比文字（TD-38）；
      //    其餘一律走 testid。第一版整條鏈都比文字，所以一斷就三條全紅、還看不出斷在哪。
      //    所以這裡**每一跳都留下痕跡**，紅的時候才知道是哪一跳掉的。
      byText(/查看名單/)?.click(); await w(1600);
      out.roster = !!document.querySelector('[data-testid^="roster-player-"]');
      out.badge = document.querySelector('[data-testid="roster-career-badge"]')?.textContent?.trim() ?? null;
      document.querySelector('[data-testid^="roster-player-"]')?.click(); await w(1200);
      out.opened = !!byText(/開啟完整選手檔案/);
      byText(/開啟完整選手檔案/)?.click(); await w(1800);
      out.tabs = !!q("player-profile-tabs");
      q("player-profile-tab-career")?.click(); await w(1000);
      out.panel = !!q("player-lifecycle-panel");
      out.stage = q("player-career-stage")?.textContent?.trim() ?? null;
      out.market = q("player-market-value")?.textContent?.trim() ?? null;
      out.white = document.body.innerText.trim().length < 40;
      return out;
    `);
    const where = !player.roster ? "沒進到名單頁"
      : !player.opened ? "名單頁在，但找不到「開啟完整選手檔案」"
      : !player.tabs ? "沒進到選手詳情"
      : !player.panel ? "詳情在，但生涯分頁沒開" : "";
    ck("P1) 選手生涯分頁到得了", player.panel, where);
    ck("P2) **生涯階段**有真實值（不是「未啟用」）",
      !!player.stage && player.stage !== "未啟用", player.stage);
    ck("P3) **市場價值**顯示得出來", !!player.market && /萬/.test(player.market), player.market);
    ck("P4) 無白屏", !player.white);
    //  名單頁自己就掛著生涯階段徽章——順手驗一下，這條不依賴上面那串導航。
    ck("P5) 名單頁的**生涯階段徽章**也有值", !!player.badge, player.badge);

    console.log("\n【§N 既有玩法入口】");
    //  ⚠ 每一個入口都**重新載入首頁再進去**。用 `history.back()` 回首頁在 SPA 上
    //    不保證回到可點的狀態，第一版就是這樣量到 undefined 的。
    const nav = {};
    for (const [key, id] of [["moba", "home-mode-moba"], ["cs", "home-mode-cs"], ["bracket", "home-mode-bracket"]]) {
      await chrome.navigate(PROD);
      await sleep(2400);
      nav[key] = await chrome.evaluate(`
        const w=(ms)=>new Promise(r=>setTimeout(r,ms));
        const b=document.querySelector('[data-testid="${id}"]');
        if(!b) return null;
        b.click(); await w(2600);
        return { white: document.body.innerText.trim().length < 40,
                 len: document.body.innerText.trim().length };
      `);
    }
    ck("N1) MOBA 入口進得去且無白屏", !!nav.moba && !nav.moba.white, `內容 ${nav.moba?.len} 字`);
    ck("N2) CS 入口進得去且無白屏", !!nav.cs && !nav.cs.white, `內容 ${nav.cs?.len} 字`);
    ck("N3) Competition Hub（賽事）進得去且無白屏", !!nav.bracket && !nav.bracket.white, `內容 ${nav.bracket?.len} 字`);

    console.log("\n【§M 手機 390px】");
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await chrome.navigate(PROD);
    await sleep(2600);
    const m = await chrome.evaluate(SEE);
    ck("M1) 390px viewport 生效", m.innerW === 390, `innerW ${m.innerW}`);
    ck("M2) 手機首頁無白屏", !m.white);
    ck("M3) 手機也看得到世界時間卡", !!m.worldTime, m.worldTime?.replace(/\s+/g, " ").slice(0, 40));
    ck("M4) **無橫向捲動**", !m.bodyOverflow);
    const mNav = await chrome.evaluate(`
      const w=(ms)=>new Promise(r=>setTimeout(r,ms));
      const ids=["home-nav-team","home-nav-compete","home-nav-more","home-nav-home"];
      let bad=0;
      for(const id of ids){ const b=document.querySelector('[data-testid="'+id+'"]');
        if(!b){bad++;continue;} b.click(); await w(700);
        if(document.body.innerText.trim().length < 40) bad++; }
      return {bad, ids: ids.length};
    `);
    ck("M5) 手機底部導覽四個分頁都不白屏", mNav.bad === 0, `${mNav.ids - mNav.bad}/${mNav.ids} OK`);

    console.log("\n【§C Console】");
    //  ⚠ 只算 page-origin 的未捕捉例外；第三方／擴充功能雜訊不列入。
    const errs = chrome.pageErrors.filter((e) => !/extension|chrome-extension/i.test(String(e)));
    ck("C1) **無 page-origin uncaught error**", errs.length === 0,
      errs.slice(0, 3).join(" | ") || "(無)");
  } finally {
    await chrome.close();
  }
  console.log(`\n${fail === 0 ? "✅" : "❌"} 正式站 smoke：${pass}/${pass + fail} 通過`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\n💥 ${e.message}`); process.exit(1); });
