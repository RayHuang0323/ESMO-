#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_td44_practice_exit.mjs
//      TD-44 的瀏覽器實測：打完快速練習之後，賽前頁要回得到一般對戰
//
//  執行：`node tools/browser_check_td44_practice_exit.mjs`（加 `--headed` 看畫面）
//
//  ── 為什麼一定要瀏覽器 ──────────────────────────────────────────────────
//  `check_td44_practice_exit` 驗的是純函式與 Store 的判定。TD-44 壞掉的地方
//  卻是**畫面上的推導鏈**：`matchPracticeContext()` → `matchTierOf()` → 橫幅
//  → 容量顯示 → 兩顆按鈕。這條鏈只有真的把畫面渲染出來才算數，
//  而且它**MOBA 與 CS 共用同一個 `MatchPrepFrame`**——兩邊都要驗。
//
//  ⚠ 這一支不打完整場比賽（Ban/Pick 一個一個點要 1–2 分鐘 × 兩個模式）。
//    重現 TD-44 需要的只是「走到 `session=completed/practice`」，
//    所以流程用 Store action 推到那個狀態，**驗的部分全部讀畫面**。
//    真的打完整場的版本在正式站 smoke（`browser_check_prod_v7_release`）。
//
//  每個模式驗一條完整路徑：
//    一般對戰頁 → 快速練習 → 完成 → 回賽前頁 → 名稱回來 → 容量回來
//    → 仍能再開練習 → reload → 推 1 天 → 仍正常
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5374;
const CDP_PORT = 9396;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const READ_PREP = `
  const q = (s) => document.querySelector('[data-testid="' + s + '"]');
  const b = q("prep-tier-banner");
  const a = q("prep-primary-action");
  return {
    banner: !!b,
    tier: b?.getAttribute("data-tier") ?? null,
    name: q("prep-tier-name")?.textContent?.trim() ?? null,
    capacity: q("prep-tier-capacity")?.textContent?.trim() ?? null,
    practiceBtn: !!q("prep-start-practice"),
    actionKey: a?.dataset.action ?? null,
    actionLabel: a?.textContent?.trim().replace(/\\s+/g, " ").slice(0, 22) ?? null,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
`;

/** 乾淨存檔 ＋ 補滿該模式的陣容。 */
const setupFor = (mode) => `
  ${RESOLVE_APP_MODULES}
  localStorage.removeItem("esmo.profile.v1");
  S().startNewGame("elite");
  S().autoFillLineup("${mode}");
  S().save();
  return { players: (S().players ?? []).length, day: S().meta.days };
`;

/** 從首頁進該模式的賽前頁並讀畫面。 */
const goPrep = (mode) => `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('[data-testid="home-mode-${mode}"]')?.click();
  await wait(2000);
  ${READ_PREP}
`;

/**
 *  把一場快速練習推到 `session=completed`——**不打畫面上的比賽**。
 *  ⚠ 全部走既有 action／既有結算邊界，不另造第二條管線。
 */
const playPracticeToCompleted = (mode) => `
  ${RESOLVE_APP_MODULES}
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const started = S().startPracticeMatch("${mode}");
  if (!started.ok) return { ok: false, where: "startPracticeMatch", reason: started.reason ?? null };

  let now = Date.now(), guard = 0;
  while (guard++ < 60 && S().matchmaking.room?.state !== "confirmed") {
    now += 1000;
    S().pollMatchRoom(now);
    if (S().matchmaking.room?.state === "ready_check" && !S().matchmaking.room.confirmations?.us) S().confirmMatchReady(now);
  }
  const made = S().createMatchSession(now);
  if (!made.ok) return { ok: false, where: "createMatchSession", reason: made.errors?.[0]?.message ?? null };
  S().launchMatchSession(now);

  //  結算走**唯一邊界**（與正式流程同一條路），場次因此進入 completed。
  //  ⚠⚠ 本段在樣板字串裡，註解**不得**出現反引號——會提早結束字串。
  //  ⚠ transaction 不能給 null——邊界會直接以 no_transaction 退回，場次
  //    永遠停在 launched（本檔第一版就是這樣，A3 假紅）。
  //    交易一律由**該模式自己的 adapter** 產生，不自己捏；練習來源的歸零
  //    也就自然沿用既有規則，本檔不繞過任何東西。
  const B2 = location.pathname.endsWith("/") ? location.pathname.slice(0, -1) : location.pathname;
  const origin = S().matchmaking.session?.origin ?? null;
  let tx = null, outcome = null;
  if ("${mode}" === "moba") {
    const br = {
      schema: "BattleResult.v2", winner: "blue", duration: 1500,
      score: { blue: 12, red: 9 }, gold: { blue: 40000, red: 36000 }, towers: { blue: 6, red: 4 },
      mvpId: "b1",
      players: ["b1","b2","b3","b4","b5"].map((s, i) => ({
        id: s, side: "blue", k: 8 - i, d: 2, a: 4, gold: 10000, dmg: 25000, rating: 55, participation: 0.7,
      })),
    };
    tx = adapter.mobaResultToTransaction(br, {
      players: S().players ?? [], lineup: S().lineup, streak: 0,
      fansNow: S().meta?.fans ?? 0, origin,
    });
    outcome = boundary.outcomeFromBattleResult(br, "td44-practice-moba");
  } else {
    const csAd = await import(B2 + "/src/platform/progress/adapters/csProgressAdapter.js");
    const cr = {
      schema: "CsMatchResult.v1", matchId: "td44-practice-cs",
      winner: "us", ourScore: 13, enemyScore: 9, players: [],
    };
    tx = csAd.csResultToTransaction(cr, {
      players: S().players ?? [], streak: 0, fansNow: S().meta?.fans ?? 0, origin,
    });
    outcome = boundary.outcomeFromCsResult(cr);
  }
  if (!tx) return { ok: false, where: "buildTransaction", reason: "adapter 回傳 null" };
  const out = boundary.settleMatchThroughSession({ mode: "${mode}", outcome, transaction: tx });
  await wait(300);
  S().save();
  return {
    ok: true,
    sessionState: S().matchmaking.session?.state ?? null,
    sessionOrigin: S().matchmaking.session?.origin?.kind ?? null,
    roomState: S().matchmaking.room?.state ?? null,
    ctx: JSON.parse(JSON.stringify(S().matchPracticeContext())),
    settled: out?.receipt?.ok !== false,
  };
`;

async function runMode(chrome, server, mode, label) {
  console.log(`\n【§${label} ${mode.toUpperCase()}】`);
  await chrome.navigate(server.url);
  await sleep(800);
  const setup = await chrome.evaluate(setupFor(mode));
  ck(`${label}0) 佈置成功：新存檔、${mode.toUpperCase()} 陣容補滿`, setup.players >= 5,
    `第 ${setup.day} 天｜${setup.players} 人`);

  await chrome.reload();
  await sleep(1600);
  const before = await chrome.evaluate(goPrep(mode));
  ck(`${label}1) 練習前：賽前頁是**一般對戰**且看得到今日容量`,
    before.tier === "competitive" && before.name === "一般對戰" && /0\/3/.test(before.capacity ?? ""),
    `${before.name}｜${before.capacity}`);
  ck(`${label}2) 練習前：「快速練習」按鈕在`, before.practiceBtn === true);

  //  ── 打一場快速練習並完成 ────────────────────────────────────────────
  const played = await chrome.evaluate(playPracticeToCompleted(mode));
  ck(`${label}3) 快速練習跑到 **completed**`,
    played.ok === true && played.sessionState === "completed" && played.sessionOrigin === "practice",
    played.ok ? `session ${played.sessionState}/${played.sessionOrigin}｜room ${played.roomState}`
      : `⚠ 卡在 ${played.where}：${played.reason}`);
  //  這一格就是 TD-44 的核心：來源仍是練習（結算要用），但流程已經不在練習中。
  ck(`${label}4) inPractice 仍 true（結算端要用）、activePractice 已 false`,
    played.ctx?.inPractice === true && played.ctx?.activePractice === false,
    `inPractice=${played.ctx?.inPractice} activePractice=${played.ctx?.activePractice}`);

  //  ── 回賽前頁：TD-44 修好之後應該回得到一般對戰 ───────────────────────
  await chrome.navigate(server.url);
  await sleep(1600);
  const after = await chrome.evaluate(goPrep(mode));
  ck(`${label}5) 回賽前頁：**一般對戰的名稱回來了**（TD-44 的症狀）`,
    after.tier === "competitive" && after.name === "一般對戰",
    `${after.tier}／${after.name}`);
  ck(`${label}6) 回賽前頁：**今日 N/3 容量重新看得見**`,
    /\d\/3/.test(after.capacity ?? ""), after.capacity ?? "（無）");
  //  練習不吃容量 ⇒ 打完一場練習之後仍然是 0/3。
  ck(`${label}7) 練習沒有吃掉競技容量（仍是 0/3）`,
    /0\/3/.test(after.capacity ?? ""), after.capacity ?? "（無）");
  ck(`${label}8) 主按鈕回到一般對戰（不再是「重新開始快速練習」）`,
    after.actionKey !== "repractice", `${after.actionKey}／${after.actionLabel}`);
  ck(`${label}9) **仍能再次開始快速練習**（次要按鈕回來了）`, after.practiceBtn === true);
  ck(`${label}10) 賽前頁不水平溢出`, after.overflow === false);

  //  ── reload ────────────────────────────────────────────────────────
  await chrome.reload();
  await sleep(1800);
  const reloaded = await chrome.evaluate(goPrep(mode));
  ck(`${label}11) reload 之後仍是一般對戰且容量看得見`,
    reloaded.tier === "competitive" && reloaded.name === "一般對戰" && /\d\/3/.test(reloaded.capacity ?? ""),
    `${reloaded.name}｜${reloaded.capacity}`);
  ck(`${label}12) reload 之後「快速練習」按鈕還在`, reloaded.practiceBtn === true);

  //  ── 推 1 天 ───────────────────────────────────────────────────────
  await chrome.navigate(server.url);
  await sleep(1600);
  //  ⚠ 不要把 `goPrep` 疊進另一段也宣告 `wait` 的程式碼——兩個 `const wait`
  //    會讓整段變成 SyntaxError（本檔第一版就是這樣掛掉的）。分兩次送。
  await chrome.evaluate(`document.querySelector('[data-testid="home-advance-day"]')?.click(); return 1;`);
  await sleep(1600);
  const advanced = await chrome.evaluate(goPrep(mode));
  ck(`${label}13) 推 1 天之後仍是一般對戰且容量看得見`,
    advanced.tier === "competitive" && advanced.name === "一般對戰" && /\d\/3/.test(advanced.capacity ?? ""),
    `${advanced.name}｜${advanced.capacity}`);

  //  ── 再開一場練習：層級要跟著回到 practice（不能修過頭）────────────────
  const again = await chrome.evaluate(`
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector('[data-testid="prep-start-practice"]')?.click();
    await wait(1600);
    ${READ_PREP}
  `);
  ck(`${label}14) 再開一場練習 ⇒ 層級**確實回到 practice**（沒有修過頭）`,
    again.tier === "practice" && again.name === "快速練習", `${again.tier}／${again.name}`);
  ck(`${label}15) 練習進行中**不顯示**競技容量`, again.capacity === null,
    again.capacity ?? "（未顯示，正確）");
}

async function main() {
  const server = await startDevServer({ port: VITE_PORT });
  const chrome = await launchChrome({ url: server.url, port: CDP_PORT, headless: HEADLESS });
  try {
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await runMode(chrome, server, "moba", "A");
    await runMode(chrome, server, "cs", "B");

    console.log("\n【§C Console】");
    const errs = (chrome.pageErrors ?? []).filter((e) => !/favicon|ResizeObserver/i.test(String(e)));
    ck("C1) 沒有頁面來源的未捕捉錯誤", errs.length === 0, errs.slice(0, 2).join(" / ") || "無");
  } finally {
    await chrome.close?.().catch(() => {});
    await server.stop?.().catch(() => {});
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`TD-44 瀏覽器實測（MOBA ＋ CS）：${pass} / ${pass + fail} 通過`);
  if (fail) { console.log(`❌ ${fail} 項未通過`); process.exit(1); }
  console.log("✅ 全數通過");
}

main().catch((e) => { console.error(e); process.exit(1); });
