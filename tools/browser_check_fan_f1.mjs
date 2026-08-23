#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_fan_f1.mjs — Fan F1 的 Sponsor 資格瀏覽器驗收
//
//  執行：`node tools/browser_check_fan_f1.mjs`（加 --headed 可看畫面）
//
//  ── 這一支在守什麼 ──────────────────────────────────────────────────────
//  F1 讓粉絲**第一次真的擋住贊助**。靜態 verifier 證明得了規則只有一份，
//  證明不了「玩家在畫面上看到的鎖與解鎖是對的」。這裡驗的就是那件事：
//    · 門檻數字顯示成十萬級且有千分位（`需 150,000 粉絲` 而不是 `需 150000粉絲`）
//    · 粉絲不夠 ⇒ 真的鎖住；粉絲夠了 ⇒ 真的解鎖（同一份 `sponsorEligibility`）
//    · 桌機與手機都不跑版
//
//  ⚠ 用 Store API 改粉絲數，不是改 DOM——驗的是「資料 → 畫面」這條線。
//  ⚠ 這支不驗絕對門檻值（那是 calibration，`tools/fan_calibration.mjs` 的事），
//    只驗「跨過門檻前後畫面會變」。
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5344;
const CDP_PORT = 9376;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 開新局並把粉絲/戰績設成指定值，然後進贊助頁，回傳畫面文字。 */
const OPEN_SPONSOR = (fans, wins) => `
  ${RESOLVE_APP_MODULES}
  const st = () => profile.useProfileStore.getState();
  localStorage.removeItem("esmo.profile.v1");
  st().startNewGame("elite");
  profile.useProfileStore.setState({ meta: { ...st().meta, fans: ${fans} }, activeSponsor: null });
  st().save();
  return { fans: st().meta.fans };
`;

async function readSponsorScreen(chrome) {
  return chrome.evaluate(`
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    //  從首頁走到贊助頁：找文字含「贊助」的按鈕（桌機是摘要卡的「管理合作」/「尋找合作」）
    const NL = String.fromCharCode(10);
    let opened = false;
    for (let i = 0; i < 12; i++) {
      const btns = [...document.querySelectorAll("button")];
      const hit = btns.find((b) => {
        const t = (b.innerText || "").trim();
        return t.includes("管理合作") || t.includes("尋找合作") || t === "贊助商" || t === "贊助";
      });
      if (hit) { hit.click(); await wait(800); opened = true; break; }
      await wait(300);
    }
    const txt = (document.body.innerText || "").split(NL).map((s) => s.trim()).filter(Boolean);
    const joined = txt.join(" | ");
    return {
      opened,
      onSponsor: joined.includes("SPONSORS") || joined.includes("目前粉絲"),
      qualified: txt.filter((l) => l.includes("條件達標")).length,
      lockedLines: txt.filter((l) => l.includes("需 ") && l.includes("粉絲")),
      fansLine: txt.find((l) => l.includes("目前粉絲")) ?? null,
      overflow: document.body.scrollWidth > window.innerWidth + 1,
      scrollW: document.body.scrollWidth, innerW: window.innerWidth,
    };
  `);
}

async function main() {
  console.log("══ Fan F1 Sponsor 資格 smoke ══\n");
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

      // ── 粉絲不足：高階贊助應該被鎖住 ────────────────────────────────────
      await chrome.navigate(server.url);
      const seeded = await chrome.evaluate(OPEN_SPONSOR(128_000, 0));
      await chrome.reload();
      await sleep(2200);
      const low = await readSponsorScreen(chrome);

      ck(`${vp.label}｜贊助頁進得去`, low.opened && low.onSponsor, low.fansLine ?? "(找不到贊助頁)");
      ck(`${vp.label}｜顯示 canonical 粉絲數`,
        (low.fansLine ?? "").includes("128,000"), low.fansLine ?? "-");
      ck(`${vp.label}｜粉絲 128k 時仍有贊助被鎖住（門檻真的在擋人）`,
        low.lockedLines.length > 0, `${low.lockedLines.length} 個鎖住`);
      ck(`${vp.label}｜門檻數字有千分位（不是「需 150000粉絲」）`,
        low.lockedLines.length > 0 && low.lockedLines.every((l) => /\d{1,3},\d{3}/.test(l)),
        low.lockedLines[0] ?? "-");
      ck(`${vp.label}｜無 body 橫向捲動`, !low.overflow, `body ${low.scrollW} / 視窗 ${low.innerW}`);

      // ── 粉絲拉高：同樣的畫面應該解鎖更多 ────────────────────────────────
      await chrome.navigate(server.url);
      await chrome.evaluate(OPEN_SPONSOR(9_000_000, 0));
      await chrome.reload();
      await sleep(2200);
      const high = await readSponsorScreen(chrome);

      //  ⚠ 粉絲拉高**不會**讓贊助全部解鎖——`reqWins` 是另一道獨立閘門，F1 刻意不動。
      //    0 勝的新局即使有 900 萬粉絲，仍會被勝場數擋住。所以這裡驗的是
      //    **粉絲那一維真的翻轉了**，而不是「畫面上的鎖全消失」（那個期待是錯的）。
      const flip = await chrome.evaluate(`
        const B = location.pathname.endsWith("/") ? location.pathname.slice(0, -1) : location.pathname;
        const sp = await import(B + "/src/platform/economy/sponsors.js");
        const pm = await import(B + "/src/data/playerModel.js");
        const gated = pm.SPONSORS.filter((s) => s.reqFans > 0).sort((a, b) => a.reqFans - b.reqFans);
        const mid = gated[1];
        const before = sp.sponsorEligibility(mid, { fans: 128000, wins: 999 });
        const after  = sp.sponsorEligibility(mid, { fans: 9000000, wins: 999 });
        return { name: mid.name, reqFans: mid.reqFans,
                 beforeOk: before.ok, beforeShort: before.fansShort, afterOk: after.ok };
      `);
      ck(`${vp.label}｜跨過粉絲門檻前後，資格真的翻轉`,
        flip.beforeOk === false && flip.beforeShort > 0 && flip.afterOk === true,
        `${flip.name}（需 ${flip.reqFans.toLocaleString()}）：128k ⇒ 差 ${flip.beforeShort} 不合格；900萬 ⇒ 合格`);
      ck(`${vp.label}｜粉絲拉高後畫面讀到新值（資料→畫面這條線是通的）`,
        high.onSponsor && (high.fansLine ?? "").includes("9,000,000"),
        high.fansLine ?? "-");
      ck(`${vp.label}｜reqWins 仍是獨立閘門（0 勝時粉絲再多也不全開）`,
        high.lockedLines.length > 0,
        `900 萬粉絲 / 0 勝 ⇒ 仍有 ${high.lockedLines.length} 個被勝場擋住`);
    }

    const errs = chrome.consoleLines.filter((l) => l.startsWith("[error]"));
    ck("console error = 0 且無未捕捉例外",
      errs.length === 0 && chrome.pageErrors.length === 0,
      [...errs.slice(0, 3), ...chrome.pageErrors.slice(0, 3)].join(" | ") || "(無)");
  } finally {
    await chrome.close();
    await server.stop();
  }

  console.log(`\n${pass}/${pass + fail} 通過`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\n\u{1F4A5} ${e.message}`); process.exit(1); });
