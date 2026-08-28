#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_general_match_and_objectives.mjs
//      V7A 一般對戰收口 ＋ V7B 俱樂部目標的瀏覽器驗收
//
//  執行：`node tools/browser_check_general_match_and_objectives.mjs`
//        （加 `--headed` 看畫面）
//
//  ── 這一支在守什麼 ──────────────────────────────────────────────────────
//  兩支純函式 gate（`check_general_match_v7a` / `check_retention_v7b`）驗的是
//  規則。規則對不代表玩家看得到、按得動：
//    · 一般對戰的層級名稱與今日容量**真的顯示在賽前頁**，而且會跟著結算更新
//    · 俱樂部目標**真的進得去、領得到、點數真的變多、重整之後還在**
//  這些只有在瀏覽器裡跑過才算數。
//
//  ⚠ **順序很重要**：一般對戰必須在開快速練習**之前**打完。開了練習之後
//    `practiceAssignment` 會佔住流程，`enqueueMatch` 被擋 ⇒ 結算落到「沒有場次」
//    的退路（origin=null ⇒ 來源 unknown）⇒ 容量不扣、`viaSession` 也是 false。
//    本檔第一版就是這樣紅的，記在這裡以免下次又把練習挪到前面。
//
//  §D 桌面 1280（賽前頁層級與容量）　§O 目標頁完整流程　§M 手機 390
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5372;
const CDP_PORT = 9392;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 乾淨存檔 ＋ 補滿陣容（賽前頁要陣容就緒才走得完流程）。 */
const SETUP = `
  ${RESOLVE_APP_MODULES}
  const st = () => profile.useProfileStore.getState();
  localStorage.removeItem("esmo.profile.v1");
  st().startNewGame("elite");
  st().autoFillLineup("moba");
  st().save();
  return { day: st().meta.days, players: (st().players ?? []).length, team: st().team?.name ?? null };
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
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
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
  };
`;

/** 從首頁進 MOBA 賽前頁並讀橫幅。 */
const GO_PREP = `
  const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
  const byText=(re)=>Array.from(document.querySelectorAll('button,[role="button"],a'))
    .find(el=>re.test((el.textContent||"").trim()));
  (byText(/進入賽前/) || byText(/MOBA/))?.click();
  await wait(1600);
  ${READ_BANNER}
`;

async function main() {
  const server = await startDevServer({ port: VITE_PORT });
  const chrome = await launchChrome({ url: server.url, port: CDP_PORT, headless: HEADLESS });
  try {
    // ══ §D 桌面 1280：賽前頁的層級橫幅 ═══════════════════════════════════
    console.log("\n【§D 桌面 1280×900：一般對戰的名稱與容量】");
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(server.url);
    await sleep(700);
    const setup = await chrome.evaluate(SETUP);
    ck("D0) 佈置成功：新存檔、陣容補滿", setup.players >= 5, `第 ${setup.day} 天｜${setup.players} 人｜${setup.team}`);

    await chrome.reload();
    await sleep(1500);
    const entered = await chrome.evaluate(GO_PREP);
    ck("D1) 賽前頁出現層級橫幅", entered.banner, `data-tier=${entered.tier}`);
    ck("D2) 一般對戰**有名字**（改動前整個 UI 裡沒有這個詞）",
      entered.tier === "competitive" && entered.name === "一般對戰", entered.name ?? "（無）");
    ck("D3) 說明講明「不計入正式賽季」", /不計入正式賽季/.test(entered.note ?? ""), entered.note ?? "（無）");
    ck("D4) **今日容量看得到**（不必打滿才知道有限制）",
      /0\/3/.test(entered.capacity ?? ""), entered.capacity ?? "（無）");
    ck("D5) 賽前頁不水平溢出", entered.overflow === false);

    //  ── 真的打一場一般對戰（走既有配對流程，不是第二條管線）───────────
    //  ⚠ **必須先離開賽前頁**。賽前頁的 `useMatchFlow` 有自己的輪詢與自動進場
    //    effect，會與這裡的手動輪詢搶同一條流程（實測：房間走不到 confirmed，
    //    `createMatchSession` 拿不到場次 ⇒ origin 是 null ⇒ 來源變成 unknown）。
    //    回首頁再跑，就只有這段程式在推流程。
    await chrome.navigate(server.url);
    await sleep(1600);
    const played = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = () => profile.useProfileStore.getState();
      const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
      const q = st().enqueueMatch("moba");
      let now = Date.now(), guard = 0;
      //  ⚠ 四步都要自己推：pollMatchmaking 只把票券推到 matched，**不開房間**。
      //    少了 openMatchRoom 這一步，房間永遠是 null、迴圈空轉 80 圈，
      //    最後 createMatchSession 拿不到場次 ⇒ origin 是 null ⇒ 來源變 unknown。
      //    賽前頁是靠 useMatchFlow 的 effect 補這一步的（見該檔 :91）。
      //    ⚠⚠ 這段在 JS 樣板字串裡，註解**不得**出現反引號——會提早結束字串。
      while (guard++ < 80 && st().matchmaking.room?.state !== "confirmed") {
        now += 1000;
        st().pollMatchmaking(now);
        if (st().matchmaking.ticket?.state === "matched" && !st().matchmaking.room) st().openMatchRoom(now);
        st().pollMatchRoom(now);
        if (st().matchmaking.room?.state === "ready_check" && !st().matchmaking.room.confirmations?.us) st().confirmMatchReady(now);
      }
      st().createMatchSession(now);
      st().launchMatchSession(now);
      const br = {
        schema: "BattleResult.v2", winner: "blue", duration: 1800,
        score: { blue: 20, red: 5 }, gold: { blue: 50000, red: 30000 }, towers: { blue: 9, red: 2 },
        mvpId: "b1",
        players: ["b1","b2","b3","b4","b5"].map((s,i)=>({ id:s, side:"blue", k:10-i, d:1, a:5, gold:12000, dmg:30000, rating:60, participation:0.8 })),
      };
      const tx = adapter.mobaResultToTransaction(br, {
        players: st().players ?? [], lineup: st().lineup, streak: 0,
        fansNow: st().meta?.fans ?? 0, origin: st().matchmaking.session?.origin ?? null,
      });
      const out = boundary.settleMatchThroughSession({
        mode: "moba", outcome: boundary.outcomeFromBattleResult(br, adapter.mobaMatchId(br)), transaction: tx,
      });
      await wait(300);
      const v = JSON.parse(JSON.stringify(st().retentionView()));
      return {
        queued: q.ok, queueErr: q.errors?.[0]?.message ?? null,
        //  ⚠ 每一跳都留痕跡：紅的時候要看得出是排隊、開房、簽場次還是結算掉的。
        roomState: st().matchmaking.room?.state ?? null,
        sessionState: st().matchmaking.session?.state ?? null,
        originKind: st().matchmaking.session?.origin?.kind ?? null,
        settled: out.receipt?.ok !== false, viaSession: out.viaSession,
        source: tx?.metadata?.matchSource ?? null,
        block: st().competitiveBlockView(),
        daily: v.daily.items.map((i) => i.defId + "=" + i.progress + "/" + i.target),
        claimable: v.claimable,
      };
    `);
    ck("D6) 一般對戰排得進、結算走**權威路徑**（viaSession）",
      played.queued === true && played.settled === true && played.viaSession === true,
      `來源 ${played.source}｜房間 ${played.roomState}｜場次 ${played.sessionState}`
        + `｜origin ${played.originKind}${played.queueErr ? "｜" + played.queueErr : ""}`);
    ck("D7) 打完之後今日容量從 0/3 變成 1/3",
      played.block.used === 1, `${played.block.used}/${played.block.capacity}`);

    //  ── 回賽前頁：橫幅上的容量必須跟著變（`blockSig` 訂閱的實測）────────
    await chrome.navigate(server.url);
    await sleep(1600);
    const cap2 = await chrome.evaluate(GO_PREP);
    ck("D8) 賽前頁的容量跟著結算更新成 1/3",
      /1\/3/.test(cap2.capacity ?? ""), cap2.capacity ?? "（無）");

    //  ⚠ 開一場快速練習 ⇒ 橫幅必須跟著變成「快速練習」。
    //    這一條在守 V0D 那個最危險的誤解：玩家以為在測試，其實打的是正式競技。
    const prac = await chrome.evaluate(`
      const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
      document.querySelector('[data-testid="prep-start-practice"]')?.click();
      await wait(1500);
      ${READ_BANNER}
    `);
    ck("D9) 開練習之後橫幅換成「快速練習」（層級跟著流程走）",
      prac.tier === "practice" && prac.name === "快速練習", `${prac.tier}／${prac.name}`);
    ck("D10) 練習時**不顯示競技容量**（練習不吃容量，顯示 1/3 會誤導）",
      prac.capacity === null, prac.capacity ?? "（未顯示，正確）");

    // ══ §O 俱樂部目標 ════════════════════════════════════════════════════
    console.log("\n【§O 俱樂部目標（Retention v1）】");
    await chrome.navigate(server.url);
    await sleep(1600);

    const home = await chrome.evaluate(`
      const q=(s)=>document.querySelector('[data-testid="'+s+'"]');
      return { entry: !!q("home-utility-objectives"),
               badge: q("home-utility-badge-objectives")?.textContent ?? null,
               badges: document.querySelectorAll('[data-testid^="home-utility-badge-"]').length };
    `);
    ck("O1) 首頁有「俱樂部目標」入口", home.entry);
    ck("O2) 首頁**只有一個聚合徽章**（規格擋掉十幾個紅點）",
      home.badges <= 1, `${home.badges} 個徽章｜可領 ${home.badge ?? 0}`);

    const opened = await chrome.evaluate(`
      const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
      document.querySelector('[data-testid="home-utility-objectives"]')?.click();
      await wait(1100);
      ${READ_OBJ}
    `);
    ck("O3) 進得去目標頁", opened.screen);
    ck("O4) 三個尺度都在，且日 3／週 3／季 4",
      opened.groups.length === 3 && opened.daily === 3 && opened.weekly === 3 && opened.season === 4,
      `日 ${opened.daily}／週 ${opened.weekly}／季 ${opened.season}`);
    ck("O5) 目標總數 ≤ 10（不是任務牆）", opened.daily + opened.weekly + opened.season <= 10);
    ck("O6) 俱樂部點數與聲望等級看得到", !!opened.tier && !!opened.points,
      `${opened.tier}｜${opened.points}`);
    ck("O7) 打完一場之後真的有目標可以領", opened.claimable >= 1,
      `可領 ${opened.claimable}｜${played.daily.join(" ")}`);

    //  ── 真的去做一件事：安排一堂訓練 ────────────────────────────────
    //  ⚠ 走 Store action，不點訓練頁的 UI——本輪要驗的是**目標系統接不接得到
    //    既有的寫入點**，不是重驗訓練頁（那有自己的 gate）。
    const trained = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = () => profile.useProfileStore.getState();
      const pick = (v) => v.daily.items.map((i) => i.defId + "=" + i.progress + "/" + i.target).join(" ");
      const before = pick(JSON.parse(JSON.stringify(st().retentionView())));
      const p = (st().players ?? [])[0];
      const ok = st().assignTraining(p.id, "aim");
      const after = pick(JSON.parse(JSON.stringify(st().retentionView())));
      return { ok, before, after };
    `);
    ck("O8) 安排訓練之後日目標進度真的動了（既有寫入點接上了）",
      trained.before !== trained.after, `${trained.before}　→　${trained.after}`);

    //  ── 在畫面上真的按「領取獎勵」────────────────────────────────────
    await chrome.navigate(server.url);
    await sleep(1600);
    const claimed = await chrome.evaluate(`
      const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
      const q=(s)=>document.querySelector('[data-testid="'+s+'"]');
      document.querySelector('[data-testid="home-utility-objectives"]')?.click();
      await wait(1100);
      const before = q("club-points")?.textContent?.trim() ?? null;
      const btn = Array.from(document.querySelectorAll('[data-testid^="objective-claim-"]')).find((b)=>!b.disabled);
      const label = btn?.textContent?.trim() ?? null;
      btn?.click(); await wait(900);
      return {
        before, label,
        after: q("club-points")?.textContent?.trim() ?? null,
        toast: q("objective-toast")?.textContent?.trim() ?? null,
      };
    `);
    ck("O9) 畫面上按得到「領取獎勵」", !!claimed.label, claimed.label ?? "（找不到可領的按鈕）");
    ck("O10) 領取之後俱樂部點數真的變多", claimed.before !== claimed.after,
      `${claimed.before} → ${claimed.after}`);
    ck("O11) 領取有回饋（toast 說明拿到多少）", !!claimed.toast, claimed.toast ?? "（無）");

    await chrome.reload();
    await sleep(1600);
    const persisted = await chrome.evaluate(`
      const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
      document.querySelector('[data-testid="home-utility-objectives"]')?.click();
      await wait(1100);
      ${READ_OBJ}
    `);
    ck("O12) 重整之後點數還在（領取有落盤）",
      persisted.points === claimed.after, `${persisted.points}`);
    ck("O13) 領過的那一格不會再變回可領",
      persisted.claimable < opened.claimable + 1, `可領 ${persisted.claimable}`);

    // ══ §M 手機 390（真 media query）═══════════════════════════════════
    console.log("\n【§M 手機 390×844（真 media query）】");
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await chrome.navigate(server.url);
    await sleep(1800);

    //  ⚠ 手機版**不渲染** `Utility`，所以桌面那個磚在這裡不存在。入口在底部
    //    「更多」sheet——V7B 補上的那一項。這一條就是那個缺口的迴歸測試：
    //    第一版沒補，手機玩家根本進不去目標頁。
    const mob = await chrome.evaluate(`
      const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
      const q=(s)=>document.querySelector('[data-testid="'+s+'"]');
      const desktopTile = !!q("home-utility-objectives");
      q("home-nav-more")?.click();
      await wait(800);
      const sheetEntry = !!q("home-sheet-objectives");
      q("home-sheet-objectives")?.click();
      await wait(1200);
      const base = (() => { ${READ_OBJ} })();
      return Object.assign(base, { desktopTile, sheetEntry });
    `);
    ck("M1) viewport 真的是 390", mob.innerW === 390, `${mob.innerW}px`);
    ck("M2) 手機的「更多」選單裡有俱樂部目標入口", mob.sheetEntry === true,
      mob.desktopTile ? "（桌面磚也在）" : "（桌面磚不渲染，符合手機版設計）");
    ck("M3) 手機上目標頁進得去且三組都在", mob.screen && mob.groups.length === 3,
      `日 ${mob.daily}／週 ${mob.weekly}／季 ${mob.season}`);
    ck("M4) 手機上目標頁不水平溢出", mob.overflow === false);

    await chrome.navigate(server.url);
    await sleep(1800);
    const mobBanner = await chrome.evaluate(GO_PREP);
    ck("M5) 手機上賽前頁的層級橫幅也在，且不溢出",
      mobBanner.banner === true && mobBanner.overflow === false,
      `${mobBanner.name ?? "（無）"}｜${mobBanner.capacity ?? "－"}`);

    //  ⚠ 只看**頁面來源**的未捕捉例外（`pageErrors` 由 cdp.mjs 收集）。
    const errs = (chrome.pageErrors ?? []).filter((e) => !/favicon|ResizeObserver/i.test(e));
    ck("C1) 沒有頁面來源的未捕捉錯誤", errs.length === 0, errs.slice(0, 2).join(" / ") || "無");
  } finally {
    await chrome.close?.().catch(() => {});
    await server.stop?.().catch(() => {});
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`V7A + V7B 瀏覽器驗收：${pass} / ${pass + fail} 通過`);
  if (fail) { console.log(`❌ ${fail} 項未通過`); process.exit(1); }
  console.log("✅ 全數通過");
}

main().catch((e) => { console.error(e); process.exit(1); });
