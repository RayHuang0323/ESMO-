#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_prod_v7_release.mjs
//      V7A 一般對戰 ＋ V7B Retention v1 的**正式站** smoke
//
//  執行：`node tools/browser_check_prod_v7_release.mjs`（加 `--headed` 看畫面）
//
//  ── 與 dev gate 的差別（為什麼要另外寫一支）─────────────────────────────
//  `browser_check_general_match_and_objectives.mjs` 跑的是 dev server，靠
//  `RESOLVE_APP_MODULES` 直接匯入 `/src/...` 呼叫 Store action 推流程。
//  **正式站沒有那些路徑**（打包後的 bundle），所以這一支：
//    · 佈置只能用 localStorage（TD-31）
//    · 推流程只能點 UI——包含 Ban/Pick 一個一個選英雄、按「快速完成」
//  代價是慢（一場約 1–2 分鐘），但驗的是「玩家真的按得到」。
//
//  ⚠ 順序與 dev gate 一致：**一般對戰必須在快速練習之前打完**。
//    開了練習之後 `practiceAssignment` 會佔住流程，一般對戰排不進去。
//
//  §H 首頁　§D 一般對戰（名稱／容量／收益）　§P 快速練習（零永久影響）
//  §O 俱樂部目標　§N 既有玩法入口　§M 手機 390　§C console
//
//  ── TD-44（2026-08-28 由本檔第一次跑抓到，已修）──────────────────────────
//  症狀：打完一場快速練習之後，MOBA 與 CS 的賽前頁都永久停在 practice 層級，
//  主按鈕只剩「重新開始快速練習」，一般對戰的名稱與今日容量再也看不到。
//  根因：`matchPracticeContext().inPractice` 只看 origin 種類，沒有像
//  `canStartPracticeFrom` 那樣把**終局場次**視為閒置。
//  修法：終局判定抽到 `contracts/matchFlowIdle.js` 兩邊共用，並把
//  `inPractice`（來源，結算端用）與 `activePractice`（現在，賽前頁用）拆開。
//  ⇒ **P7–P10 就是它的迴歸測試**；紅了就是 TD-44 復發。
//  gate：`check_td44_practice_exit` ＋ `browser_check_td44_practice_exit`。
// ============================================================================
import { launchChrome } from "./browser/cdp.mjs";

const PROD = process.env.ESMO_PROD_URL ?? "https://rayhuang0323.github.io/ESMO-/";
const CDP_PORT = 9393;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 讀存檔：正式站唯一看得到「永久影響」的窗口 ──────────────────────────
//  ⚠ 這裡刻意把**所有**永久面都抓進來（錢／粉絲／聲望／formLog／贊助／
//    選手數值／戰績）。快速練習那一條要證明的是「全部沒動」，少抓一個
//    就等於少守一個面。
const SAVE_SNAP = `
  const raw = localStorage.getItem("esmo.profile.v1");
  if (!raw) return { exists: false };
  const s = JSON.parse(raw);
  return {
    exists: true,
    day: s.meta?.days ?? null,
    funds: s.finance?.funds ?? null,
    finance: JSON.stringify(s.finance ?? null),
    fans: s.meta?.fans ?? null,
    reputation: s.meta?.reputation ?? null,
    formLog: JSON.stringify(s.formLog ?? null),
    economy: JSON.stringify(s.economy ?? null),
    sponsor: JSON.stringify(s.activeSponsor ?? null),
    players: JSON.stringify((s.players ?? []).map((p) => ({
      id: p.id, lv: p.lv, xp: p.xp, stats: p.stats,
      streak: p.matchStreak, growth: (p.growthLog ?? []).length,
    }))),
    history: JSON.stringify(s.competitionHistoryByMode ?? null),
    //  ⚠ 這欄不保證是陣列（舊存檔是物件 map）。第一版寫死 .length ⇒ 兩邊都
    //    undefined，比較永遠不成立，紅得沒有意義。
    txCount: (() => {
      const t = s.processedMatchTransactions;
      if (Array.isArray(t)) return t.length;
      if (t && typeof t === "object") return Object.keys(t).length;
      return 0;
    })(),
    //  ⚠ 今日競技容量的**真值**在存檔裡。橫幅在練習模式下依規格不顯示容量，
    //    所以「練習不吃容量」只能靠這個欄位驗，不能靠讀畫面（見 P6）。
    block: JSON.stringify(s.meta?.competitiveBlock ?? null),
    blockUsed: s.meta?.competitiveBlock?.used ?? null,
    clubPoints: s.retention?.clubPoints ?? null,
    counters: JSON.stringify(s.retention?.counters ?? null),
  };
`;

const READ_BANNER = `
  const q = (s) => document.querySelector('[data-testid="' + s + '"]');
  const b = q("prep-tier-banner");
  return {
    banner: !!b,
    tier: b?.getAttribute("data-tier") ?? null,
    name: q("prep-tier-name")?.textContent?.trim() ?? null,
    capacity: q("prep-tier-capacity")?.textContent?.trim() ?? null,
    note: q("prep-tier-note")?.textContent?.trim() ?? null,
    practiceBtn: !!q("prep-start-practice"),
    actionKey: q("prep-primary-action")?.dataset.action ?? null,
    actionLabel: q("prep-primary-action")?.textContent?.trim().replace(/\\s+/g, " ").slice(0, 22) ?? null,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    innerW: window.innerWidth,
  };
`;

const READ_OBJ = `
  const q = (s) => document.querySelector('[data-testid="' + s + '"]');
  const all = (s) => Array.from(document.querySelectorAll(s));
  return {
    screen: !!q("objectives-screen"),
    points: q("club-points")?.textContent?.trim() ?? null,
    tier: q("club-tier")?.textContent?.trim() ?? null,
    groups: ["objective-group-daily","objective-group-weekly","objective-group-season"].filter((id) => !!q(id)),
    daily: all('[data-testid="objective-group-daily"] [data-testid="objective-card"]').length,
    weekly: all('[data-testid="objective-group-weekly"] [data-testid="objective-card"]').length,
    season: all('[data-testid="objective-group-season"] [data-testid="objective-card"]').length,
    claimable: all('[data-testid^="objective-claim-"]').filter((b) => !b.disabled).length,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    innerW: window.innerWidth,
    white: document.body.innerText.trim().length < 40,
  };
`;

//  ⚠ 進場前有**兩關沒有 data-testid**，只能比文字（TD-38 那一類）：
//    ① 房間確認頁的「進入 Ban/Pick →」　② 戰術頁的「開始載入 →」
//    漏掉任何一個，整支就會停在那一頁空轉到 STUCK——第一版漏了「開始載入」，
//    卡在戰術頁 90 秒然後把 D6 判紅。分路確認頁有 `confirm-draft`，走 testid。
const GATE_RE = String.raw`/Ban\/Pick|開始載入|開始比賽|開始對戰|進入對戰|開打|確認出戰/`;

/** 目前停在哪一個畫面——驅動迴圈就靠這個決定下一步。 */
const WHERE = `
  const q = (s) => document.querySelector('[data-testid="' + s + '"]');
  const act = q("prep-primary-action");
  const byText = (re) => Array.from(document.querySelectorAll("button"))
    .filter((b) => !b.disabled).find((b) => re.test((b.textContent || "").trim()));
  return {
    result: !!q("battle-result-continue"),
    speed: !!q("quick-finish-match"),
    heroChoose: document.querySelectorAll('[data-testid="hero-choose"]').length,
    //  選角完成之後畫面換成分路確認頁，英雄格全部消失，只剩這一顆。
    confirmDraft: !!q("confirm-draft") && !q("confirm-draft").disabled,
    prepAction: act ? { key: act.dataset.action, disabled: act.disabled } : null,
    gateBtn: byText(${GATE_RE})
      ? byText(${GATE_RE}).textContent.trim().replace(/\\s+/g, " ").slice(0, 20)
      : null,
    home: !!q("home-world-time"),
    len: document.body.innerText.trim().length,
  };
`;

/**
 *  把一場比賽從賽前頁一路推到結算完成——全部只用 UI。
 *  回傳每一步走過的畫面，紅的時候看得出卡在哪一段。
 */
async function playMatch(chrome, { practice = false, budget = 320 } = {}) {
  const trail = [];
  if (practice) {
    await chrome.evaluate(`document.querySelector('[data-testid="prep-start-practice"]')?.click(); return 1;`);
    await sleep(1500);
  }
  //  ⚠ Ban/Pick 是輪流的：**我方**點完之後畫面會有一段沒有可點的英雄（AI 在動）。
  //    第一版把 idle 等待設 1.8 秒、budget 只有 90，結果 90 步全花在等 AI，
  //    英雄池只從 100 掉到 88 就用完額度 ⇒ D6 假紅。節奏要跟著 AI 的回合走。
  let idle = 0;
  for (let i = 0; i < budget; i++) {
    const w = await chrome.evaluate(WHERE);
    if (w.result) { trail.push("result"); break; }

    if (w.speed) {
      trail.push("battle→quickFinish");
      //  ⚠ 「快速完成」用 window.confirm。CDP 下的 modal 會把後續指令全部卡死，
      //    所以按之前先把它換成永遠 true。這只影響 gate 自己的分頁。
      await chrome.evaluate(`
        window.confirm = () => true;
        document.querySelector('[data-testid="quick-finish-match"]')?.click();
        return 1;
      `);
      await sleep(3000);
      idle = 0;
      continue;
    }
    if (w.confirmDraft) {
      //  ⚠ 這一步不是選配。選角走完之後是**分路確認頁**（`confirm-draft`），
      //    英雄格全部消失。第一版沒認這一顆，於是 5/5 選滿之後整支卡在這裡
      //    130 圈然後 STUCK ⇒ D6 假紅。
      trail.push("confirmDraft");
      await chrome.evaluate(`document.querySelector('[data-testid="confirm-draft"]')?.click(); return 1;`);
      await sleep(2500);
      idle = 0;
      continue;
    }
    if (w.heroChoose > 0) {
      //  Ban/Pick：禁用與選用共用同一顆 hero-choose，照順序點第一個能點的就好。
      //  這裡不挑英雄——本輪驗的是流程走得完，不是選角策略。
      trail.push("draft:" + w.heroChoose);
      await chrome.evaluate(`
        const b = Array.from(document.querySelectorAll('[data-testid="hero-choose"]')).find((x) => !x.disabled);
        b?.click(); return 1;
      `);
      await sleep(650);
      idle = 0;
      continue;
    }
    if (w.gateBtn) {
      trail.push("btn:" + w.gateBtn);
      idle = 0;
      await chrome.evaluate(`
        const re = ${GATE_RE};
        const b = Array.from(document.querySelectorAll("button")).filter((x) => !x.disabled)
          .find((x) => re.test((x.textContent || "").trim()));
        b?.click(); return 1;
      `);
      await sleep(2200);
      continue;
    }
    if (w.prepAction) {
      trail.push("prep:" + w.prepAction.key);
      if (!w.prepAction.disabled) {
        await chrome.evaluate(`document.querySelector('[data-testid="prep-primary-action"]')?.click(); return 1;`);
        idle = 0;
      } else { idle++; }
      await sleep(1200);
      continue;
    }
    //  沒有任何可推的東西：AI 的回合、載入、或比賽正在跑。等短一點，
    //  但連續空轉太久就停手——那代表真的卡住了，不該把額度燒完才回報。
    trail.push("wait(" + w.len + ")");
    if (++idle > 130) { trail.push("STUCK"); break; }
    await sleep(700);
  }
  //  結算頁 →「繼續」→ 回首頁（存檔在這裡落盤）
  const done = await chrome.evaluate(`
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    const q = (s) => document.querySelector('[data-testid="' + s + '"]');
    const had = !!q("battle-result-continue");
    q("battle-result-continue")?.click(); await w(3000);
    return { had, home: !!q("home-world-time"), len: document.body.innerText.trim().length };
  `);
  //  ⚠ 只留骨架：連點 12 次英雄的 trail 印出來沒有資訊量，紅的時候要看的是
  //    「有沒有走到 battle / result」。
  const skel = trail.filter((t, i) => i === 0 || t !== trail[i - 1]).join(" → ");
  return { ...done, trail: skel, steps: trail.length };
}

async function goPrep(chrome) {
  await chrome.navigate(PROD);
  await sleep(2600);
  return chrome.evaluate(`
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector('[data-testid="home-mode-moba"]')?.click();
    await w(2400);
    ${READ_BANNER}
  `);
}

async function main() {
  console.log(`══ V7A + V7B 正式站 smoke ══\n${PROD}\n`);
  const chrome = await launchChrome({ url: PROD, port: CDP_PORT, headless: HEADLESS });
  try {
    await sleep(2500);
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(PROD);
    await sleep(3000);

    // ══ §H 首頁 ═══════════════════════════════════════════════════════════
    console.log("【§H 首頁 / 桌面 1280×900】");
    await chrome.evaluate(`try { localStorage.removeItem("esmo.profile.v1"); } catch (e) {} return 1;`);
    await chrome.navigate(PROD);
    await sleep(3000);

    const home = await chrome.evaluate(`
      const q = (s) => document.querySelector('[data-testid="' + s + '"]');
      return {
        white: document.body.innerText.trim().length < 40,
        worldTime: q("home-world-time")?.textContent?.trim().replace(/\\s+/g, " ") ?? null,
        modes: Array.from(document.querySelectorAll('[data-testid^="home-mode-"]')).map((b) => b.dataset.testid),
        objectivesEntry: !!q("home-utility-objectives"),
        badge: q("home-utility-badge-objectives")?.textContent ?? null,
        badges: document.querySelectorAll('[data-testid^="home-utility-badge-"]').length,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    `);
    ck("H1) 首頁載入且**無白屏**", !home.white);
    ck("H2) 世界時間卡在", !!home.worldTime, home.worldTime?.slice(0, 44));
    ck("H3) 三個玩法入口都在（MOBA／CS／賽事）", home.modes.length === 3, home.modes.join("／"));
    ck("H4) 首頁有「俱樂部目標」入口", home.objectivesEntry);
    ck("H5) 首頁**只有一個聚合徽章**（規格擋掉十幾個紅點）", home.badges <= 1,
      `${home.badges} 個徽章｜可領 ${home.badge ?? 0}`);

    //  推一天讓存檔真的落盤——正式站首次載入 localStorage 是空的，
    //  沒有存檔就沒有「前」的快照，收益與零收益兩條都驗不了。
    await chrome.evaluate(`
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      document.querySelector('[data-testid="home-advance-day"]')?.click(); await w(1600);
      return 1;
    `);
    const S0 = await chrome.evaluate(SAVE_SNAP);
    ck("H6) 存檔落盤（後面的收益比對才有基準）", S0.exists === true,
      `第 ${S0.day} 天｜資金 $${Math.round((S0.funds ?? 0) / 10000)}萬｜粉絲 ${S0.fans}`);

    // ══ §D 一般對戰 ═══════════════════════════════════════════════════════
    console.log("\n【§D 一般對戰（V7A）】");
    const prep = await goPrep(chrome);
    ck("D1) 賽前頁出現層級橫幅", prep.banner, `data-tier=${prep.tier}`);
    ck("D2) 一般對戰**有名字**", prep.tier === "competitive" && prep.name === "一般對戰", prep.name ?? "（無）");
    ck("D3) 說明講明「不計入正式賽季」", /不計入正式賽季/.test(prep.note ?? ""), prep.note ?? "（無）");
    ck("D4) **今日容量看得到**且是 0/3", /0\/3/.test(prep.capacity ?? ""), prep.capacity ?? "（無）");
    ck("D5) 賽前頁不水平溢出", prep.overflow === false);

    const m1 = await playMatch(chrome, { practice: false });
    ck("D6) 一般對戰**打得完**（配對→選角→比賽→結算，全走 UI）",
      m1.had === true && m1.home === true, `${m1.trail}｜${m1.steps} 步`);

    const S1 = await chrome.evaluate(SAVE_SNAP);
    const earned = S1.funds !== S0.funds || S1.fans !== S0.fans || S1.players !== S0.players;
    ck("D7) 一般對戰**有收益／成長**（它不是練習）", earned,
      `資金 $${Math.round((S0.funds ?? 0) / 10000)}萬 → $${Math.round((S1.funds ?? 0) / 10000)}萬`
        + `｜粉絲 ${S0.fans} → ${S1.fans}｜選手數值${S1.players !== S0.players ? "有變" : "沒變"}`);
    ck("D8) 結算真的落了一筆交易（走權威路徑）", S1.txCount > S0.txCount,
      `processedMatchTransactions ${S0.txCount} → ${S1.txCount}`);

    const prep2 = await goPrep(chrome);
    ck("D9) 今日容量跟著結算變成 1/3", /1\/3/.test(prep2.capacity ?? ""), prep2.capacity ?? "（無）");

    // ══ §P 快速練習 ═══════════════════════════════════════════════════════
    console.log("\n【§P 快速練習（V0D／V7A）】");
    ck("P1) 賽前頁有「快速練習」入口", prep2.practiceBtn === true);

    const pracBanner = await chrome.evaluate(`
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      document.querySelector('[data-testid="prep-start-practice"]')?.click(); await w(1800);
      ${READ_BANNER}
    `);
    ck("P2) 開練習之後橫幅換成「快速練習」", pracBanner.tier === "practice" && pracBanner.name === "快速練習",
      `${pracBanner.tier}／${pracBanner.name}`);
    ck("P3) 練習時**不顯示競技容量**（顯示 1/3 會誤導）", pracBanner.capacity === null,
      pracBanner.capacity ?? "（未顯示，正確）");

    const m2 = await playMatch(chrome, { practice: false });
    ck("P4) 快速練習**打得完**", m2.had === true && m2.home === true, `${m2.trail}｜${m2.steps} 步`);

    const S2 = await chrome.evaluate(SAVE_SNAP);
    const zero = {
      資金: S2.funds === S1.funds,
      財務明細: S2.finance === S1.finance,
      粉絲: S2.fans === S1.fans,
      聲望: S2.reputation === S1.reputation,
      formLog: S2.formLog === S1.formLog,
      贊助側: S2.economy === S1.economy && S2.sponsor === S1.sponsor,
      選手數值: S2.players === S1.players,
      戰績: S2.history === S1.history,
      競技容量: S2.block === S1.block,
    };
    const broke = Object.entries(zero).filter(([, ok]) => !ok).map(([k]) => k);
    ck("P5) 快速練習**零永久收益**（含 formLog／贊助側）", broke.length === 0,
      broke.length ? `⚠ 被動到：${broke.join("、")}` : "資金／財務／粉絲／聲望／formLog／贊助／選手數值／戰績／競技容量 全部未變");

    //  ⚠ 這裡**不能讀橫幅**。打完練習之後流程仍停在 practice 層級（見下方 W1），
    //    而練習層級依規格不顯示容量 ⇒ 讀畫面永遠是 null，驗不到東西。
    //    容量的真值在存檔的 `meta.competitiveBlock`，用它。
    ck("P6) 練習**不吃競技容量**（打完一般對戰＋一場練習，仍只用掉 1 格）",
      S2.blockUsed === 1 && S2.block === S1.block, `competitiveBlock ${S1.block} → ${S2.block}`);

    const prep3 = await goPrep(chrome);
    //  ── TD-44：打完練習之後必須回得到一般對戰 ───────────────────────────
    //  ⚠ 這三條在 2026-08-28 的第一次正式站 smoke 是**紅的**（當時以 W1 印出、
    //    不計分），根因是 `matchPracticeContext().inPractice` 沒有把終局場次
    //    視為閒置。修正之後升級成正式檢查——它們紅了就是 TD-44 復發。
    ck("P7) TD-44：回賽前頁**回得到一般對戰**（層級與名稱都回來）",
      prep3.tier === "competitive" && prep3.name === "一般對戰", `${prep3.tier}／${prep3.name}`);
    ck("P8) TD-44：**今日容量重新看得見**（練習後仍是 1/3）",
      /1\/3/.test(prep3.capacity ?? ""), prep3.capacity ?? "（無）");
    ck("P9) TD-44：主按鈕回到一般對戰（不再卡在「重新開始快速練習」）",
      prep3.actionKey !== "repractice", `${prep3.actionKey}／${prep3.actionLabel}`);
    //  ⚠ 重複進入現在走**次要按鈕**：流程已閒置 ⇒ `canStartPracticeFrom` 讓
    //    `prep-start-practice` 回來；主按鈕則回到一般對戰的「重新配對」。
    ck("P10) 快速練習**可以重複進入**（次要按鈕回來了）", prep3.practiceBtn === true);

    // ══ §O 俱樂部目標 ═════════════════════════════════════════════════════
    console.log("\n【§O 俱樂部目標（V7B Retention v1）】");
    await chrome.navigate(PROD);
    await sleep(2600);
    const obj = await chrome.evaluate(`
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      document.querySelector('[data-testid="home-utility-objectives"]')?.click(); await w(1600);
      ${READ_OBJ}
    `);
    ck("O1) 進得去目標頁且無白屏", obj.screen && !obj.white);
    ck("O2) 三個尺度都在，且日 3／週 3／季 4",
      obj.groups.length === 3 && obj.daily === 3 && obj.weekly === 3 && obj.season === 4,
      `日 ${obj.daily}／週 ${obj.weekly}／季 ${obj.season}`);
    ck("O3) 目標總數 ≤ 10（不是任務牆）", obj.daily + obj.weekly + obj.season <= 10);
    ck("O4) Club Points 與 Reputation（聲望等級）看得到", !!obj.points && !!obj.tier,
      `${obj.tier}｜${obj.points}`);
    ck("O5) 打完比賽之後真的有目標可以領", obj.claimable >= 1, `可領 ${obj.claimable}`);

    const claimed = await chrome.evaluate(`
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      const q = (s) => document.querySelector('[data-testid="' + s + '"]');
      const before = q("club-points")?.textContent?.trim() ?? null;
      const btn = Array.from(document.querySelectorAll('[data-testid^="objective-claim-"]')).find((b) => !b.disabled);
      const label = btn?.textContent?.trim() ?? null;
      btn?.click(); await w(1200);
      return { before, label, after: q("club-points")?.textContent?.trim() ?? null,
               toast: q("objective-toast")?.textContent?.trim() ?? null };
    `);
    ck("O6) 畫面上**手動領取**得到", !!claimed.label, claimed.label ?? "（找不到可領的按鈕）");
    ck("O7) 領取之後 Club Points 真的變多", claimed.before !== claimed.after,
      `${claimed.before} → ${claimed.after}`);
    ck("O8) 領取有回饋（toast 說明拿到多少）", !!claimed.toast, claimed.toast ?? "（無）");

    await chrome.navigate(PROD);
    await sleep(2600);
    const persisted = await chrome.evaluate(`
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      document.querySelector('[data-testid="home-utility-objectives"]')?.click(); await w(1600);
      ${READ_OBJ}
    `);
    ck("O9) 重整之後點數還在（領取有落盤）", persisted.points === claimed.after, `${persisted.points}`);
    ck("O10) 領過的那一格不會再變回可領", persisted.claimable < obj.claimable, `可領 ${persisted.claimable}`);

    // ══ §N 既有玩法入口 ═══════════════════════════════════════════════════
    console.log("\n【§N 既有玩法（MOBA／CS／賽事）】");
    const nav = {};
    for (const [key, id] of [["moba", "home-mode-moba"], ["cs", "home-mode-cs"], ["bracket", "home-mode-bracket"]]) {
      await chrome.navigate(PROD);
      await sleep(2600);
      nav[key] = await chrome.evaluate(`
        const w = (ms) => new Promise((r) => setTimeout(r, ms));
        const b = document.querySelector('[data-testid="${id}"]');
        if (!b) return null;
        b.click(); await w(2800);
        return { white: document.body.innerText.trim().length < 40, len: document.body.innerText.trim().length };
      `);
    }
    ck("N1) MOBA 入口進得去且無白屏", !!nav.moba && !nav.moba.white, `內容 ${nav.moba?.len} 字`);
    ck("N2) CS 入口進得去且無白屏", !!nav.cs && !nav.cs.white, `內容 ${nav.cs?.len} 字`);
    ck("N3) 賽事（Competition Hub）進得去且無白屏", !!nav.bracket && !nav.bracket.white, `內容 ${nav.bracket?.len} 字`);

    // ══ §M 手機 390 ═══════════════════════════════════════════════════════
    console.log("\n【§M 手機 390×844（真 media query）】");
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await chrome.navigate(PROD);
    await sleep(3000);
    const mob = await chrome.evaluate(`
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      const q = (s) => document.querySelector('[data-testid="' + s + '"]');
      const white = document.body.innerText.trim().length < 40;
      const homeOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;
      q("home-nav-more")?.click(); await w(1000);
      const sheetEntry = !!q("home-sheet-objectives");
      q("home-sheet-objectives")?.click(); await w(1600);
      const base = (() => { ${READ_OBJ} })();
      return Object.assign(base, { white, homeOverflow, sheetEntry });
    `);
    ck("M1) viewport 真的是 390", mob.innerW === 390, `${mob.innerW}px`);
    ck("M2) 手機首頁無白屏、無橫向捲動", mob.white === false && mob.homeOverflow === false);
    ck("M3) 手機的「更多」選單裡有俱樂部目標入口", mob.sheetEntry === true);
    ck("M4) 手機上目標頁進得去、三組都在、不溢出",
      mob.screen && mob.groups.length === 3 && mob.overflow === false,
      `日 ${mob.daily}／週 ${mob.weekly}／季 ${mob.season}`);

    await chrome.navigate(PROD);
    await sleep(3000);
    const mobPrep = await chrome.evaluate(`
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      document.querySelector('[data-testid="home-mode-moba"]')?.click(); await w(2600);
      ${READ_BANNER}
    `);
    ck("M5) 手機上賽前頁的層級橫幅也在，且不溢出",
      mobPrep.banner === true && mobPrep.overflow === false,
      `${mobPrep.name ?? "（無）"}｜${mobPrep.capacity ?? "－"}`);

    // ══ §C console ════════════════════════════════════════════════════════
    console.log("\n【§C Console】");
    const errs = (chrome.pageErrors ?? [])
      .filter((e) => !/favicon|ResizeObserver|extension|chrome-extension/i.test(String(e)));
    ck("C1) **無 page-origin uncaught error**", errs.length === 0, errs.slice(0, 3).join(" | ") || "（無）");
  } finally {
    await chrome.close?.().catch(() => {});
  }

  console.log(`\n${"═".repeat(60)}`);
    console.log(`V7 正式站 smoke：${pass} / ${pass + fail} 通過`);
  if (fail) { console.log(`❌ ${fail} 項未通過`); process.exit(1); }
  console.log("✅ 全數通過");
}

main().catch((e) => { console.error(`\n💥 ${e.message}`); process.exit(1); });
