#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_competition_hub_shell.mjs — 賽事中心殼的畫面驗證（UI-2）
//
//  執行：`node tools/browser_check_competition_hub_shell.mjs`（自己起 vite／Chrome）。
//
//  ── 為什麼要一支畫面 gate ────────────────────────────────────────────────
//  UI-2 是純接線：首頁「賽事」改開一層殼，殼底下掛的是既有的兩個畫面。
//  這種改動 Node 驗不到——分頁切得動不動、切過去有沒有真的換元件、
//  **看一眼 CS 會不會把賽季開下去**，全部只有在瀏覽器裡才是事實。
//
//  最後一項是本輪最重要的斷言。`ensureCompetitionSeason("cs")` 真的會建出
//  一整季 CS 聯賽，而 CS 的產品契約是「賽季不自動建立」。殼如果哪天不小心
//  在 CS 分頁掛載時呼叫它，玩家會在毫不知情的情況下多出一整季賽程——
//  §5 就是為了讓那件事一發生就紅。
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5321;
const CDP_PORT = 9351;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };

/** 從首頁點「賽事」磚進賽事中心。到站判斷用殼自己的標記，不靠文案。 */
const GOTO_HUB = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const on = () => !!document.querySelector('[data-testid="competition-hub-tabs"]');
  for (let i = 0; i < 14 && !on(); i++) {
    const tile = [...document.querySelectorAll("button")].find((b) => b.dataset?.testid === "home-mode-bracket");
    if (tile) { tile.click(); await wait(900); continue; }
    await wait(400);
  }
  const panel = document.querySelector('[data-testid="competition-hub-panel"]');
  return { arrived: on(), mode: panel?.dataset?.mode ?? null,
           text: document.body.innerText.replace(/\\n/g, " | ") };
`;

/** 點某一個分頁，回傳切換後的面板狀態。 */
const clickTab = (mode) => `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const tab = document.querySelector('[data-testid="competition-hub-tab-${mode}"]');
  if (!tab) return { clicked: false };
  tab.click(); await wait(900);
  const panel = document.querySelector('[data-testid="competition-hub-panel"]');
  return { clicked: true, mode: panel?.dataset?.mode ?? null,
           active: tab.dataset?.active ?? null,
           text: document.body.innerText.replace(/\\n/g, " | ") };
`;

/** CS 賽季在 Store 裡到底存不存在（唯一真相，不看畫面文案）。 */
const CS_SLICE = `
  ${RESOLVE_APP_MODULES}
  const s = profile.useProfileStore.getState();
  return {
    cs: s.competitionByMode?.cs ? "present" : "null",
    csFixtures: Object.keys(s.competitionByMode?.cs?.fixtures ?? {}).length,
    moba: s.competitionByMode?.moba ? "present" : "null",
    mobaFixtures: (s.competitionByMode?.moba?.fixtures ?? []).length,
  };
`;

async function main() {
  console.log("══ 賽事中心殼（UI-2）：畫面驗證 ══\n");
  const server = await startDevServer({ port: VITE_PORT });
  //  巡迴賽對本檔只是雜訊：要驗的是分頁與賽季建立，不是 MOBA 的賽制內容。
  const APP = server.url + "?asiaCircuit=0";
  const chrome = await launchChrome({ url: APP, port: CDP_PORT, headless: HEADLESS });
  try {
    await chrome.navigate(APP);
    await chrome.evaluate(`localStorage.clear(); return true;`);
    await chrome.reload();
    await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      profile.useProfileStore.getState().startNewGame("standard");
      profile.useProfileStore.getState().save();
      return true;
    `);
    await chrome.reload();

    // ── §1 首頁「賽事」→ Hub ──────────────────────────────────────────────
    const hub = await chrome.evaluate(GOTO_HUB);
    ck("1) 首頁「賽事」磚進得了賽事中心（分頁列存在）", hub.arrived);
    ck("1b) 兩個分頁都在", /MOBA/.test(hub.text) && /\bCS\b/.test(hub.text));

    // ── §2 預設 MOBA ─────────────────────────────────────────────────────
    ck("2) 預設停在 MOBA 分頁", hub.mode === "moba", `panel=${hub.mode}`);
    ck("2b) MOBA 分頁就是既有的聯賽畫面（積分榜在）", /積分榜 STANDINGS/.test(hub.text));

    // ── §5（先驗）CS 賽季在點進去之前不存在 ──────────────────────────────
    const before = await chrome.evaluate(CS_SLICE);
    ck("5a) 進 CS 分頁**之前**沒有 CS 賽季", before.cs === "null", `cs=${before.cs}`);

    // ── §3 切 CS ─────────────────────────────────────────────────────────
    const cs = await chrome.evaluate(clickTab("cs"));
    ck("3) 切得到 CS 分頁", cs.clicked && cs.mode === "cs", `panel=${cs.mode} active=${cs.active}`);
    ck("3b) 顯示的是既有的 CS 賽事中心（不是複製品）", /CS 賽事中心/.test(cs.text ?? ""));
    ck("3c) 沒有 CS 賽季時顯示既有的誠實空狀態",
      /還沒有 CS 賽季/.test(cs.text ?? ""));

    // ── §5 看一眼 CS 不會把賽季開下去 ────────────────────────────────────
    const after = await chrome.evaluate(CS_SLICE);
    ck("5) **查看 CS 分頁不會自動建立 CS 賽季**", after.cs === "null", `cs=${after.cs}`);
    ck("5b) 也沒有動到 MOBA 賽季",
      after.moba === before.moba && after.mobaFixtures === before.mobaFixtures,
      `moba fixtures ${before.mobaFixtures} → ${after.mobaFixtures}`);

    // ── §4 切回 MOBA ─────────────────────────────────────────────────────
    const back = await chrome.evaluate(clickTab("moba"));
    ck("4) 切得回 MOBA 分頁", back.clicked && back.mode === "moba", `panel=${back.mode}`);
    ck("4b) 切回來畫面正常（積分榜與賽季進度都在）",
      /積分榜 STANDINGS/.test(back.text ?? "") && /賽季進度/.test(back.text ?? ""));

    // ── §6 已有 CS 賽季時資料正確顯示 ────────────────────────────────────
    //  ⚠ 用**玩家會走的那一條路**建季：`ensureCompetitionSeason("cs")` 就是
    //    CS 賽前頁那顆「開啟本季 CS 聯賽」底下的同一支，不另外捏資料。
    const made = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const r = profile.useProfileStore.getState().ensureCompetitionSeason("cs");
      profile.useProfileStore.getState().save();
      const s = profile.useProfileStore.getState();
      return { ok: r.ok, created: r.created,
               rows: s.competitionView("cs")?.standings?.rows?.length ?? 0 };
    `);
    ck("6a) CS 賽季建得起來（走玩家那條路）", made.ok && made.created, `standings ${made.rows} 列`);

    await chrome.reload();
    const hub2 = await chrome.evaluate(GOTO_HUB);
    const cs2 = await chrome.evaluate(clickTab("cs"));
    ck("6) 已有 CS 賽季時，CS 分頁顯示真資料（階段條＋積分榜）",
      /CS 賽事中心/.test(cs2.text ?? "") && !/還沒有 CS 賽季/.test(cs2.text ?? ""),
      `hub2=${hub2.mode}`);
    const csRows = await chrome.evaluate(`
      const rows = document.querySelectorAll('[data-testid="cs-hub-standing-row"]').length;
      const stage = !!document.querySelector('[data-testid="cs-hub-stage"]');
      return { rows, stage };
    `);
    ck("6b) 積分榜列與階段條真的畫出來了", csRows.rows > 0 && csRows.stage,
      `${csRows.rows} 列 / stage=${csRows.stage}`);

    // ── §7 reload 之後不出錯、不污染 ─────────────────────────────────────
    const snapBefore = await chrome.evaluate(CS_SLICE);
    await chrome.reload();
    const hub3 = await chrome.evaluate(GOTO_HUB);
    const snapAfter = await chrome.evaluate(CS_SLICE);
    ck("7a) reload 後回到預設 MOBA 分頁（分頁狀態不進存檔）",
      hub3.arrived && hub3.mode === "moba", `panel=${hub3.mode}`);
    ck("7b) reload 前後 Store 逐值相同（沒有資料污染）",
      JSON.stringify(snapBefore) === JSON.stringify(snapAfter),
      `${JSON.stringify(snapAfter)}`);
    ck("7) 全程無未捕捉例外", chrome.pageErrors.length === 0,
      chrome.pageErrors.slice(0, 2).join(" | ") || "(無)");
  } finally {
    await chrome.close();
    await server.stop();
  }
  console.log(`\n${pass}/${pass + fail} 通過`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\n💥 ${e.message}`); process.exit(1); });
