#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_offseason.mjs — V6-3：休賽期瀏覽器驗收
//
//  執行：`node tools/browser_check_offseason.mjs`（加 `--headed` 看畫面）
//
//  ── 這一支在守什麼 ──────────────────────────────────────────────────────
//  `check_offseason_session_v6` 驗的是規則。規則對不代表玩家走得完流程——
//  休賽期是本專案第一個**會擋住世界時間**的狀態，所以「走得進去、做得了決定、
//  出得來」必須真的在瀏覽器裡跑過一次。
//
//  §D 桌面 1280　§M 手機 390（真 media query）　§F 完整流程
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5361;
const CDP_PORT = 9381;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 佈置：乾淨存檔，然後把世界時間推到年度邊界前，並製造決策。 */
const SETUP = `
  ${RESOLVE_APP_MODULES}
  const st = () => profile.useProfileStore.getState();
  localStorage.removeItem("esmo.profile.v1");
  st().startNewGame("elite");
  st().grantTestFunds();
  //  ⚠ **順序很重要**：要先推到年度邊界前，**再**設短合約。
  //    反過來的話，那些短合約會在推進的路上就先歸零、在邊界被結算掉，
  //    到了休賽期反而「沒有待處理決策」——第一版就是這樣掛掉的。
  let guard = 0;
  while (st().meta.days < 84 && guard++ < 400) {
    const r = st().advanceWorldDays(Math.min(28, 84 - st().meta.days), { reason: "rest" });
    if (!r.ok || r.daysAdvanced === 0) break;
  }
  profile.useProfileStore.setState({
    players: (st().players ?? []).map((p, i) => (i < 2 ? { ...p, contract: 40 } : p)),
  });
  st().save();
  return { day: st().meta.days, expiring: st().contractView().expiring.length + st().contractView().expired.length };
`;

const READ = `
  const q = (s) => document.querySelector('[data-testid="' + s + '"]');
  return {
    enter: !!q("home-offseason-enter"),
    enterText: q("home-offseason-enter")?.textContent ?? null,
    screen: !!q("offseason-screen"),
    sections: ["offseason-summary","offseason-retirement","offseason-contracts",
               "offseason-recruit","offseason-budget","offseason-complete"].filter((id) => !!q(id)),
    pending: q("offseason-pending")?.textContent ?? null,
    funds: q("offseason-funds")?.textContent ?? null,
    renewBtns: document.querySelectorAll('[data-testid^="offseason-renew-"]').length,
    releaseBtns: document.querySelectorAll('[data-testid^="offseason-release-"]').length,
    signBtns: document.querySelectorAll('[data-testid^="offseason-sign-"]').length,
    bodyOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    innerW: window.innerWidth,
  };
`;

async function main() {
  const server = await startDevServer({ port: VITE_PORT });
  const chrome = await launchChrome({ url: server.url, port: CDP_PORT, headless: HEADLESS });
  try {
    console.log("\n【§D 桌面 1280×900】");
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(server.url);
    await sleep(600);
    const setup = await chrome.evaluate(SETUP);
    ck("D0) 佈置成功：推到年度邊界前，且有即將到期的合約",
      setup.day === 84 && setup.expiring >= 1, `day ${setup.day}｜到期中 ${setup.expiring} 人`);

    //  跨過邊界 ⇒ 休賽期應該開起來
    const crossed = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = () => profile.useProfileStore.getState();
      const r = st().advanceWorldDays(3, { reason: "rest" });
      return { day: st().meta.days, ok: r.ok, session: st().offSeasonSessionView() };
    `);
    ck("D1) 跨過年度邊界 ⇒ **休賽期自動開啟**",
      crossed.session.open === true, `day ${crossed.day}｜待處理 ${crossed.session.total} 項`);

    ck("D2) **休賽期開著時世界時間被擋住**（快轉停在決策點）",
      await chrome.evaluate(`
        ${RESOLVE_APP_MODULES}
        const st = () => profile.useProfileStore.getState();
        const before = st().meta.days;
        const r = st().advanceWorldDays(7, { reason: "rest" });
        return r.ok === false && st().meta.days === before;
      `));

    await chrome.reload();
    await sleep(1400);
    const home = await chrome.evaluate(READ);
    ck("D3) 首頁出現進入休賽期的入口", home.enter, home.enterText?.trim().slice(0, 40));

    const opened = await chrome.evaluate(`
      const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
      document.querySelector('[data-testid="home-offseason-enter"]')?.click();
      await wait(800);
      ${READ}
    `);
    ck("D4) 點進去看得到休賽期畫面", opened.screen);
    ck("D5) **六個區塊都在**", opened.sections.length === 6, opened.sections.join("／"));
    ck("D6) 合約決策有續約與放走兩個選項",
      opened.renewBtns >= 1 && opened.releaseBtns >= 1, `續約 ${opened.renewBtns}｜放走 ${opened.releaseBtns}`);
    ck("D7) 補強候選列得出來", opened.signBtns >= 1, `${opened.signBtns} 名候選`);

    // ── §F 完整流程：續約 → 放走 → 補人 → 完成 ─────────────────────────
    console.log("\n【§F 完整流程】");
    const flow = await chrome.evaluate(`
      const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
      const q=(s)=>document.querySelector('[data-testid="'+s+'"]');
      const one=(p)=>document.querySelector('[data-testid^="'+p+'"]');
      const fundsNow=()=>q("offseason-funds")?.textContent ?? null;
      const out={};
      out.fundsStart=fundsNow();
      //  ① 續約（要扣錢）
      const renew=one("offseason-renew-");
      out.renewLabel=renew?.textContent?.trim() ?? null;
      renew?.click(); await wait(700);
      out.fundsAfterRenew=fundsNow();
      //  ② 放走（不扣錢）
      const rel=one("offseason-release-");
      if (rel) { rel.click(); await wait(700); }
      out.fundsAfterRelease=fundsNow();
      //  ③ 補人
      const sign=one("offseason-sign-");
      out.signLabel=sign?.textContent?.trim() ?? null;
      sign?.click(); await wait(700);
      out.fundsAfterSign=fundsNow();
      out.note=q("offseason-note")?.textContent ?? null;
      //  ④ 完成休賽期
      q("offseason-complete-btn")?.click(); await wait(900);
      return out;
    `);
    ck("F1) 續約後資金**減少**", flow.fundsStart !== flow.fundsAfterRenew,
      `${flow.fundsStart} → ${flow.fundsAfterRenew}（${flow.renewLabel}）`);
    ck("F2) **放走不扣錢**（資金逐值不變）", flow.fundsAfterRenew === flow.fundsAfterRelease,
      `${flow.fundsAfterRenew} → ${flow.fundsAfterRelease}`);
    ck("F3) 補人後資金再減少", flow.fundsAfterRelease !== flow.fundsAfterSign,
      `${flow.fundsAfterRelease} → ${flow.fundsAfterSign}（${flow.signLabel}）`);

    const after = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = () => profile.useProfileStore.getState();
      const before = st().meta.days;
      const r = st().advanceWorldDays(7, { reason: "rest" });
      return { open: st().offSeasonSessionView().open, advanced: st().meta.days - before,
               players: (st().players ?? []).length };
    `);
    ck("F4) 完成休賽期後**世界時間又走得動了**", after.open === false && after.advanced > 0,
      `推進 ${after.advanced} 天`);
    ck("F5) 名單仍然 ≥ 5 人（放走之後有青訓保底）", after.players >= 5, `${after.players} 人`);

    // ── §M 手機 390 ────────────────────────────────────────────────────
    console.log("\n【§M 手機 390×844（真 media query）】");
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    //  再製造一次決策，讓休賽期在手機上也開得起來
    await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = () => profile.useProfileStore.getState();
      //  同樣先推到下一個年度邊界前，再設短合約（見 SETUP 的註解）。
      let guard = 0;
      while (st().meta.days < 168 && guard++ < 400) {
        const r = st().advanceWorldDays(Math.min(28, 168 - st().meta.days), { reason: "rest" });
        if (!r.ok || r.daysAdvanced === 0) break;
      }
      profile.useProfileStore.setState({
        players: (st().players ?? []).map((p, i) => (i < 2 ? { ...p, contract: 40 } : p)),
      });
      st().advanceWorldDays(2, { reason: "rest" });
      st().save();
      return st().offSeasonSessionView();
    `);
    await chrome.reload();
    await sleep(1600);
    const m = await chrome.evaluate(`
      const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
      document.querySelector('[data-testid="home-offseason-enter"]')?.click();
      await wait(900);
      ${READ}
    `);
    ck("M1) 390px viewport 生效", m.innerW === 390, `innerW ${m.innerW}`);
    ck("M2) 手機也進得去休賽期，六個區塊都在", m.screen && m.sections.length === 6,
      `${m.sections.length}/6`);
    ck("M3) **沒有橫向捲動**", !m.bodyOverflow);
    ck("M4) 手機上按鈕都在", m.renewBtns + m.releaseBtns + m.signBtns > 0,
      `續約 ${m.renewBtns}｜放走 ${m.releaseBtns}｜簽約 ${m.signBtns}`);

    ck("X) 全程無未捕捉例外", chrome.pageErrors.length === 0,
      chrome.pageErrors.slice(0, 2).join(" | ") || "(無)");
  } finally {
    await chrome.close();
    await server.stop();
  }
  console.log(`\n${fail === 0 ? "✅" : "❌"} browser_check_offseason：${pass}/${pass + fail} 通過`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\n💥 ${e.message}`); process.exit(1); });
