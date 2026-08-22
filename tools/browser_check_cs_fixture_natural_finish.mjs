#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_cs_fixture_natural_finish.mjs
//  正式 CS 賽程「自然完賽」驗收（**慢速／手動**，不進 default Release Gate）
//
//  執行：`node tools/browser_check_cs_fixture_natural_finish.mjs --only=bo1`
//        `node tools/browser_check_cs_fixture_natural_finish.mjs --only=bo3`
//
//  ⏱ **單次約 6–10 分鐘**：對戰是用 4 倍速**真的播完**的（BO1 實測 687 格／357s，
//     BO3 第一張 1221 格／632s），不是快轉、不是模擬。所以刻意不放進每次都跑的
//     套件——它是「動到下列東西之後手動跑一次」的工具：
//       CS Battle／Result／ActiveMatch／MatchSession／BO3／Competition fixture lifecycle
//
//  ── 它覆蓋的是一塊以前沒人看過的地方 ────────────────────────────────────
//  `browser_check_cs_completion` 只打**練習賽**；`check_cs_season_m2` 打的是
//  **fixture 但在 Node 裡**，不進瀏覽器也不跑引擎。
//  「在瀏覽器裡把一場正式賽程打完」在這支之前**沒有任何 gate 覆蓋過**。
//
//  ── 兩條流程 ────────────────────────────────────────────────────────────
//  `--only=bo1`  CS 聯賽 BO1：自然完賽 → 結算 → FixtureOutcome 寫入 → 場次收尾
//  `--only=bo3`  年度 Major BO3 第一張：自然完賽 → 結算 → **回到選圖頁且
//                series ledger 正常續接**（`BO3 1:0 第 2/3 張`）
//
//  ── 為什麼分兩段觀察 ────────────────────────────────────────────────────
//  結算**不在**對戰結束的那一刻。`EsportsFPS3D.completeOnce()` 只呼叫
//  `onComplete(matchResult)`，而 `CsMatchScreen` 把它接到 `setResult`——一個
//  React setState。真正的 `settleCsMatch` 是玩家按下「查看賽後戰報」才跑的。
//  所以「對戰能不能自然結束」與「結算那一下會不會卡」是兩個獨立階段，分開記；
//  卡住時會印出**最後一個成功階段**，而不是只丟一個逾時。
//
//  ── ⚠ 一個已知的、未解的**驗收工具層**問題 ──────────────────────────────
//  Quick Finish（debug-only 的快速完成）在本檔的驅動方式下會鎖死頁面主執行緒，
//  但既有的 `browser_check_cs_completion` 跑同一顆按鈕是 ~90ms 通過，兩邊都可
//  穩定重現。已排除：fixture 與否（練習賽也鎖）、視窗大小、探測方式
//  （純選擇器的輕探測也回不來 ⇒ 頁面是真的卡住）、賽前頁連點（每狀態只按一次
//  仍鎖）。差異點尚未找到。
//  **這不是玩家 blocker**：玩家路徑是自然完賽，本檔證實它完全正常；
//  Quick Finish 有 `devFastForward` ＋ `isDebugMode()` 雙重閘門，正式版看不到。
//  ⇒ 本檔**刻意完全不碰 Quick Finish**。
//
//  ⚠ 只讀畫面與 Store，不改任何產品碼。
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5326;
const CDP_PORT = 9356;
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? "bo1";
if (ONLY !== "bo1" && ONLY !== "bo3") {
  console.error(`未知的 --only=${ONLY}（只接受 bo1 / bo3）`);
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 每一次觀察都設短上限：主執行緒一鎖，20 秒就知道，不用等 840 秒。 */
const withDeadline = (p, ms, what) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} 逾時 ${ms}ms`)), ms)),
]);

let lastStage = "(尚未開始)";
const stage = (s) => { lastStage = s; console.log(`  ▸ 階段：${s}`); };

/** 讀一次畫面。回傳 null 代表主執行緒沒有回應。 */
async function peek(chrome, label = "peek") {
  try {
    return await withDeadline(chrome.evaluate(`return {
      battle: !!document.querySelector('[data-testid="cs-match-speed-controls"]'),
      qfPresent: !!document.querySelector('[data-testid="quick-finish-match"]'),
      frame: (document.body.innerText||"").match(/\\d+\\/\\d+ 格/)?.[0] ?? null,
      reportBtn: [...document.querySelectorAll("button")].some((n) => (n.innerText||"").includes("查看賽後戰報")),
      backBtn: [...document.querySelectorAll("button")].some((n) => (n.innerText||"").includes("返回 Dashboard")),
      onMapSelect: document.body.innerText.includes("選擇地圖"),
      banner: document.querySelector('[data-testid="cs-series-banner"]')?.innerText?.replace(/\\s+/g," ").trim() ?? null,
      head: (document.body.innerText||"").replace(/\\s+/g," ").slice(0, 70),
    };`), 20_000, label);
  } catch (e) {
    console.log(`  ⛔ 主執行緒無回應：${e.message}`);
    return null;
  }
}

/** 讀 Store 的收尾事實。回傳 null 代表主執行緒沒有回應。 */
async function readStore(chrome, fixtureId, label = "store") {
  try {
    return await withDeadline(chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const s = profile.useProfileStore.getState();
      const cs = s.competitionByMode?.cs ?? null;
      const fx = (cs?.fixtures ?? []).find((f) => f.id === ${JSON.stringify(fixtureId)}) ?? null;
      const outcomes = Object.values(cs?.outcomes ?? {});
      const mine = outcomes.filter((o) => o?.fixtureId === ${JSON.stringify(fixtureId)});
      const ses = s.matchmaking?.session ?? null;
      const av = typeof s.activeMatchView === "function" ? s.activeMatchView() : null;
      return {
        fixtureStatus: fx?.status ?? null,
        outcomeCount: mine.length,
        outcomeSource: mine[0]?.resultSource ?? null,
        outcomeScore: mine[0]?.score ? mine[0].score.a + ":" + mine[0].score.b : null,
        sessionStatus: ses?.status ?? null,
        assignment: !!s.matchmaking?.fixtureAssignment,
        activeRestoreable: !!av?.restoreable,
        activePhase: av?.phase ?? null,
        settlements: Object.keys(s.matchmaking?.settlements ?? {}).length,
        processedTx: Object.keys(s.processedMatchTransactions ?? {}).length,
        csHistory: (s.csHistory ?? []).length,
        seriesByFixture: Object.keys(s.matchmaking?.seriesByFixture ?? {}).length,
        lastSettlementError: s.matchmaking?.lastSettlementError ?? null,
      };
    `), 20_000, label);
  } catch (e) {
    console.log(`  ⛔ Store 讀不到（主執行緒無回應）：${e.message}`);
    return null;
  }
}

const clickWhere = (chrome, finder) => chrome.evaluate(`
  const b = [...document.querySelectorAll("button")].find(${finder});
  if (!b || b.disabled) return { ok: false, disabled: b?.disabled ?? null };
  b.click();
  return { ok: true, text: (b.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 50) };
`);

const FRESH = `
  ${RESOLVE_APP_MODULES}
  localStorage.removeItem("esmo.profile.v1");
  const st = () => profile.useProfileStore.getState();
  st().startNewGame("standard");
  st().autoFillLineup("cs");
  st().save();
  return true;
`;

const GOTO_CS_TAB = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 16; i++) {
    if (document.querySelector('[data-testid="competition-hub-tabs"]')) break;
    const tile = [...document.querySelectorAll("button")].find((b) => b.dataset?.testid === "home-mode-bracket");
    if (tile) { tile.click(); await wait(800); continue; }
    await wait(300);
  }
  document.querySelector('[data-testid="competition-hub-tab-cs"]')?.click();
  await wait(800);
  return { play: !!document.querySelector('[data-testid="cs-league-play"]') };
`;

/**
 * 賽前頁 → 選圖頁。
 *
 * ⚠ **每個 action 只按一次**（用 `clicked` 記住按過的 action）。無條件重按等於
 *   在同一個狀態上連點，可能簽出第二個場次；既有的 `browser_check_cs_completion`
 *   也是每個狀態只按一次。賽程場次通常是 `confirm` 一下就進選圖。
 */
async function drivePrepToMap(chrome) {
  let clicked = new Set();
  for (let i = 0; i < 45; i++) {
    const r = await chrome.evaluate(`
      const b = document.querySelector('[data-testid="prep-primary-action"]');
      return { onMap: document.body.innerText.includes("選擇地圖"),
               action: b?.dataset?.action ?? null, disabled: b?.disabled ?? true };
    `);
    if (r.onMap) { console.log(`  （賽前頁按了 ${clicked.size} 次：${[...clicked].join(" → ")}）`); return true; }
    if (r.action && !r.disabled && !clicked.has(r.action)) {
      clicked.add(r.action);
      await chrome.evaluate(`document.querySelector('[data-testid="prep-primary-action"]')?.click(); return true;`);
    }
    await sleep(1600);
  }
  return false;
}

async function driveToBattle(chrome) {
  await clickWhere(chrome, `(n) => /^(Dust II|Mirage|Inferno)/.test((n.innerText || "").trim())`);
  await sleep(900);
  await clickWhere(chrome, `(n) => (n.innerText || "").includes("確認地圖")`);
  await sleep(1600);
  await clickWhere(chrome, `(n) => {
    const t = (n.innerText || "").replace(/\\s+/g, " ").trim();
    return !t.includes("返回") && !t.includes("確認") && !t.includes("開始對戰")
      && !t.includes("技術內容") && t.length > 20;
  }`);
  await sleep(900);
  await clickWhere(chrome, `(n) => (n.innerText || "").includes("開始對戰")`);
  for (let i = 0; i < 24; i++) {
    await sleep(2500);
    const p = await peek(chrome, "wait-battle");
    if (p === null) return false;
    if (p.battle) return true;
  }
  return false;
}

async function main() {
  console.log(`══ 正式 CS 賽程自然完賽驗收（${ONLY}）· 約 6–10 分鐘 ══\n`);
  const server = await startDevServer({ port: VITE_PORT });
  const chrome = await launchChrome({ url: server.url, port: CDP_PORT, headless: true });
  const consoleStart = 0;

  try {
    //  固定視窗大小 ⇒ 版面與 3D 畫面的成本每次一樣，跨次比較才有意義
    //  （與既有的 `browser_check_cs_completion` 同一個做法）。
    await chrome.send("Emulation.setDeviceMetricsOverride", {
      width: 1366, height: 768, deviceScaleFactor: 1, mobile: false,
    });
    await chrome.navigate(server.url);
    await chrome.evaluate(FRESH);
    await chrome.reload();

    // ── 前置：走到一場正式 fixture ───────────────────────────────────────
    stage("setup：建立 CS 賽季並走到比賽日");
    const setup = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = () => profile.useProfileStore.getState();
      st().ensureCompetitionSeason("cs");
      const want = ${JSON.stringify(ONLY)};
      const myId = st().competitionByMode.cs.playerTeamId;
      let g = 0, wins = 0, target = null;
      while (g++ < 400) {
        const s = st();
        if (s.competitionByMode.cs?.final) break;
        const t = s.competitionView("cs").today;
        if (t) {
          const fmt = t.matchFormat ?? null;
          const isBo3 = fmt?.series === "bo3" || fmt?.mapsToWin === 2;
          if (want === "bo1" && !isBo3) { target = { id: t.id, fmt }; break; }
          if (want === "bo3" && isBo3) { target = { id: t.id, fmt }; break; }
          //  推進用既有 action（狀態機 scheduled → launched → completed）
          const a = s.startFixtureMatch(t.id);
          if (!a.ok) break;
          const r = st().completeFixtureMatch({ fixtureId: t.id, winner: myId,
            score: { a: t.sideA === myId ? 1 : 0, b: t.sideB === myId ? 1 : 0 }, duration: 1800, seed: 7 });
          if (!r.ok) break;
          wins++; continue;
        }
        const moved = s.advanceDay(1);
        if ((moved.daysAdvanced ?? 0) <= 0 && !st().competitionView("cs").today) break;
      }
      st().save();
      const s2 = st();
      return { target, wins, day: s2.meta?.days ?? null,
               processedTx: Object.keys(s2.processedMatchTransactions ?? {}).length,
               csHistory: (s2.csHistory ?? []).length };
    `);
    if (!setup.target) throw new Error(`找不到 ${ONLY} 賽程：${JSON.stringify(setup)}`);
    console.log(`  賽程 ${setup.target.id}　matchFormat=${JSON.stringify(setup.target.fmt)}　第 ${setup.day} 天　前置 ${setup.wins} 勝`);
    console.log(`  基線：processedTx=${setup.processedTx}　csHistory=${setup.csHistory}`);
    const fixtureId = setup.target.id;
    const baseTx = setup.processedTx;
    const baseHistory = setup.csHistory;

    await chrome.reload();
    await chrome.evaluate(GOTO_CS_TAB);
    stage("hub-play：從賽事中心按出戰");
    await chrome.evaluate(`document.querySelector('[data-testid="cs-league-play"]').click(); return true;`);
    await sleep(1800);

    stage("prep：落在既有 CS 賽前頁");
    if (!(await drivePrepToMap(chrome))) throw new Error("到不了選圖頁");
    stage("map-select：選圖頁");
    const bannerBefore = (await peek(chrome, "banner"))?.banner ?? null;
    console.log(`  series 橫幅：${bannerBefore ?? "(無 — BO1)"}`);

    if (!(await driveToBattle(chrome))) throw new Error("到不了對戰畫面");
    stage("battle：對戰畫面已就緒");

    // ── 自然播放：**不碰 Quick Finish** ─────────────────────────────────
    stage("speed-4x：設 4 倍速，開始自然播放（不按 Quick Finish）");
    await chrome.evaluate(`document.querySelector('[data-testid="match-speed-4"]')?.click(); return true;`);

    const t0 = Date.now();
    let ended = false, wedged = false, lastFrame = null;
    //  4x 約每秒 2 格；MR12 加延長可超過 1000 格 ⇒ 給 12 分鐘。
    for (let i = 0; i < 240; i++) {
      await sleep(3000);
      const p = await peek(chrome, `natural-${i}`);
      if (p === null) { wedged = true; break; }
      if (p.frame && p.frame !== lastFrame) {
        lastFrame = p.frame;
        if (i % 10 === 0) console.log(`    …播放中 ${p.frame}（${Math.round((Date.now() - t0) / 1000)}s）`);
      }
      if (p.reportBtn) { ended = true; break; }
    }
    const playMs = Date.now() - t0;

    if (wedged) {
      console.log(`\n❌ 自然播放期間主執行緒就鎖死了（${Math.round(playMs / 1000)}s，最後畫面 ${lastFrame ?? "?"}）`);
      console.log(`   最後成功階段：${lastStage}`);
      return;
    }
    if (!ended) {
      console.log(`\n❌ 自然播放 ${Math.round(playMs / 1000)}s 未結束（最後 ${lastFrame ?? "?"}），但主執行緒仍有回應`);
      console.log(`   最後成功階段：${lastStage}`);
      return;
    }
    stage(`natural-end：對戰自然結束（${Math.round(playMs / 1000)}s，最後 ${lastFrame}）`);

    const beforeSettle = await readStore(chrome, fixtureId, "before-settle");
    console.log(`  結算前 Store：${JSON.stringify(beforeSettle)}`);

    // ── 關鍵一刻：按下「查看賽後戰報」＝ settleCsMatch 真正跑的地方 ──────
    stage("click-report：按下「查看賽後戰報」（settleCsMatch 在此觸發）");
    const tSettle = Date.now();
    let settleWedged = false;
    try {
      await withDeadline(chrome.evaluate(`
        const b = [...document.querySelectorAll("button")].find((n) => (n.innerText||"").includes("查看賽後戰報"));
        if (!b) return { ok: false };
        setTimeout(() => b.click(), 0);
        return { ok: true };
      `), 20_000, "派發點擊");
    } catch (e) {
      console.log(`  ⛔ 連派發點擊都逾時：${e.message}`);
      settleWedged = true;
    }

    if (!settleWedged) {
      let settled = false;
      for (let i = 0; i < 40; i++) {
        await sleep(3000);
        const p = await peek(chrome, `settle-${i}`);
        if (p === null) { settleWedged = true; break; }
        if (p.backBtn || p.onMapSelect) { settled = true; break; }
      }
      if (settleWedged) {
        console.log(`\n❌ **結算那一下鎖死主執行緒**（${Math.round((Date.now() - tSettle) / 1000)}s 後無回應）`);
        console.log(`   最後成功階段：${lastStage}`);
        return;
      }
      if (!settled) {
        console.log(`\n⚠ 結算後 ${Math.round((Date.now() - tSettle) / 1000)}s 沒有進到結果／選圖畫面，但主執行緒仍有回應`);
      } else {
        stage(`result-screen：結算完成並換頁（${Math.round((Date.now() - tSettle) / 1000)}s）`);
      }
    } else {
      console.log(`   最後成功階段：${lastStage}`);
      return;
    }

    // ── BO3：離開戰報 ⇒ 應該回到選圖頁打第二張，且 series 不重置 ──────────
    const atReport = await peek(chrome, "at-report");
    if (atReport?.backBtn) {
      stage("leave-report：離開賽後戰報（BO3 應在此回到選圖）");
      const tBack = Date.now();
      let backWedged = false;
      try {
        await withDeadline(chrome.evaluate(`
          const b = [...document.querySelectorAll("button")].find((n) => (n.innerText||"").includes("返回 Dashboard"));
          if (!b) return { ok: false };
          setTimeout(() => b.click(), 0);
          return { ok: true };
        `), 20_000, "派發返回");
      } catch (e) { console.log(`  ⛔ 派發返回逾時：${e.message}`); backWedged = true; }
      if (!backWedged) {
        for (let i = 0; i < 20; i++) {
          await sleep(2000);
          const p = await peek(chrome, `back-${i}`);
          if (p === null) { backWedged = true; break; }
          if (p.onMapSelect) { stage(`back-to-map：回到選圖頁（${Math.round((Date.now() - tBack) / 1000)}s）`); break; }
          if (!p.backBtn) { stage(`left-report：離開戰報（${Math.round((Date.now() - tBack) / 1000)}s）`); break; }
        }
      }
      if (backWedged) {
        console.log(`\n❌ **離開賽後戰報時鎖死主執行緒**（${Math.round((Date.now() - tBack) / 1000)}s）`);
        console.log(`   最後成功階段：${lastStage}`);
        return;
      }
    }

    // ── 收尾事實 ─────────────────────────────────────────────────────────
    const after = await readStore(chrome, fixtureId, "after-settle");
    const view = await peek(chrome, "after-view");
    console.log(`\n── 收尾觀察 ──`);
    console.log(`  畫面：${view?.onMapSelect ? "選圖頁（BO3 續戰）" : view?.backBtn ? "賽後戰報" : view?.head}`);
    console.log(`  series 橫幅：${view?.banner ?? "(無)"}`);
    console.log(`  Store：${JSON.stringify(after)}`);
    console.log(`  基線比較：processedTx ${baseTx} → ${after?.processedTx}　csHistory ${baseHistory} → ${after?.csHistory}`);

    const errors = chrome.consoleLines.slice(consoleStart).filter((l) => l.startsWith("[error]"));
    console.log(`\n  console error：${errors.length ? errors.slice(0, 5).join(" | ") : "(無)"}`);
    console.log(`  page error：${chrome.pageErrors.length ? chrome.pageErrors.slice(0, 3).join(" | ") : "(無)"}`);
    console.log(`\n✅ 自然完賽全程主執行緒都有回應。最後階段：${lastStage}`);
  } catch (e) {
    console.log(`\n💥 ${e.message}`);
    console.log(`   最後成功階段：${lastStage}`);
  } finally {
    try { await chrome.close(); } catch { /* 可能已鎖死 */ }
    await server.stop();
  }
}

main();
