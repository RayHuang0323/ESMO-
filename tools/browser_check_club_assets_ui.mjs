#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_club_assets_ui.mjs — 俱樂部資產頁的真實瀏覽器驗證
//
//  執行：`node tools/browser_check_club_assets_ui.mjs [--headed]`；失敗 exit 1。
//
//  ⚠ 驗的是**玩家真的操作得到、而且能力真的生效**，不是契約——
//    契約由 `check_club_assets_v1` 守。
//
//  這支最重要的一段是「capability 真的生效」：不看畫面寫了什麼，而是
//  **量推進一天之後選手體力的實際增量**，以及訓練排程的實際天數。
//  沒有這一段，整個系統就只是一個會扣點數的收藏冊。
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5371;
const CDP_PORT = 9411;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));

/** 乾淨存檔＋足夠的俱樂部點數（走 claimObjective 之外的路徑：直接設 retention）。 */
const seed = (points) => `
  ${RESOLVE_APP_MODULES}
  localStorage.removeItem("esmo.profile.v1");
  const st = () => profile.useProfileStore.getState();
  st().startNewGame("elite");
  //  ⚠ 直接設 retention 是**測試種子**，不是產品路徑；產品只會經由領取目標加點。
  //    lifetime 一起設，才驗得到「花點數不動 lifetime」。
  profile.useProfileStore.setState({
    retention: { ...st().retention, clubPoints: ${points}, clubPointsLifetime: ${points} },
  });
  st().save();
  return "seeded";
`;

/** 走真實導覽路徑進資產頁（桌機是常駐磚，手機在底部「更多」sheet 裡）。 */
const ENTER = `
  const find = () => document.querySelector('[data-testid="home-utility-equip"]')
    || document.querySelector('[data-testid="home-sheet-equip"]');
  let b = find();
  if (!b) {
    const more = [...document.querySelectorAll("button")].find(x => (x.innerText || "").trim() === "更多");
    if (more) { more.click(); await new Promise(r => setTimeout(r, 520)); b = find(); }
  }
  if (!b) return "no-entry";
  b.click();
  await new Promise(r => setTimeout(r, 900));
  const root = document.querySelector('[data-testid="club-assets-screen"]');
  return root ? "open:" + root.dataset.headCoach : "not-open";
`;

let server = null, chrome = null;
try {
  server = await startDevServer({ port: VITE_PORT });
  chrome = await launchChrome({ url: server.url, port: CDP_PORT, headless: HEADLESS });

  for (const [label, width, height, mobile] of [["桌機 1366px", 1366, 768, false], ["手機 390px", 390, 844, true]]) {
    console.log(`\n── ${label} ──`);
    await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });

    await chrome.navigate(server.url);
    await sleep(900);
    await chrome.evaluate(seed(2000));
    await chrome.navigate(server.url);
    await sleep(1400);

    //  ① 入口存在（桌機與手機各一份清單，V7B 與 V7-2.5 各漏過一次相反方向）
    const entered = await chrome.evaluate(ENTER);
    ck(`${label}｜點得進俱樂部資產頁`, String(entered).includes("open:"), String(entered).replace(/"/g, ""));
    ck(`${label}｜一開始沒有總教練`, String(entered).includes("open:none"));

    //  ② 型錄狀態：買得起兩位、第三位差 lifetime 以外的錢
    const shape = await chrome.evaluate(`
      const q = (t) => document.querySelector('[data-testid="' + t + '"]');
      const card = (id) => { const el = q("asset-card-" + id); return el ? {
        owned: el.dataset.owned, equipped: el.dataset.equipped, affordable: el.dataset.affordable,
      } : null; };
      return JSON.stringify({
        balance: (q("club-assets-balance") || {}).innerText,
        cond: card("coach_conditioning"), scout: card("coach_scouting"), tac: card("coach_tactical"),
        buyEnabled: !q("asset-buy-coach_conditioning").disabled,
        tacBuyEnabled: !q("asset-buy-coach_tactical").disabled,
        note: Boolean(q("club-assets-note")),
      });
    `);
    const S = J(shape);
    ck(`${label}｜三張教練卡都在且都未擁有`,
      S.cond?.owned === "0" && S.scout?.owned === "0" && S.tac?.owned === "0");
    ck(`${label}｜餘額顯示 2000`, String(S.balance).includes("2000"), String(S.balance));
    ck(`${label}｜買得起的可以按`, S.buyEnabled === true);
    //  2000 點 ⇒ 1700 的戰術教練也買得起，而 lifetime 2000 > 500 也滿足 prerequisite。
    ck(`${label}｜prerequisite 已滿足且買得起 ⇒ 也可按`, S.tacBuyEnabled === true);
    ck(`${label}｜畫面說明了花點數不影響累計`, S.note === true);

    //  ③ 購買：真的按按鈕。餘額扣、lifetime 不變、等級不降、自動免費上任。
    const bought = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = () => profile.useProfileStore.getState();
      const before = st().retentionView();
      const tierBefore = before.tier.id;
      document.querySelector('[data-testid="asset-buy-coach_conditioning"]').click();
      await new Promise(r => setTimeout(r, 800));
      const after = st().retentionView();
      const el = document.querySelector('[data-testid="asset-card-coach_conditioning"]');
      const root = document.querySelector('[data-testid="club-assets-screen"]');
      return JSON.stringify({
        balanceBefore: before.clubPoints, balanceAfter: after.clubPoints,
        lifetimeBefore: before.clubPointsLifetime, lifetimeAfter: after.clubPointsLifetime,
        tierBefore, tierAfter: after.tier.id,
        owned: el ? el.dataset.owned : null, equipped: el ? el.dataset.equipped : null,
        headCoach: root ? root.dataset.headCoach : null,
        lastChangeWeek: st().clubAssets.lastCoachChangeWeek,
      });
    `);
    const B = J(bought);
    ck(`${label}｜購買扣掉 700 可用點數`, B.balanceAfter === B.balanceBefore - 700, `${B.balanceBefore} → ${B.balanceAfter}`);
    ck(`${label}｜clubPointsLifetime 逐值不變`, B.lifetimeAfter === B.lifetimeBefore, `${B.lifetimeBefore} → ${B.lifetimeAfter}`);
    ck(`${label}｜俱樂部等級不下降`, B.tierAfter === B.tierBefore, `${B.tierBefore} → ${B.tierAfter}`);
    ck(`${label}｜購買後進入收藏`, B.owned === "1");
    ck(`${label}｜空槽自動免費上任`, B.equipped === "1" && B.headCoach === "coach_conditioning");
    ck(`${label}｜首次上任不消耗當週換人資格`, B.lastChangeWeek === null, String(B.lastChangeWeek));

    //  ④ 重複購買不可能發生（按鈕已換成「帶隊中」），且 store 層也擋
    const dup = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = () => profile.useProfileStore.getState();
      const before = JSON.stringify({ a: st().clubAssets, p: st().retentionView().clubPoints });
      const r = st().buyClubAsset("coach_conditioning");
      const after = JSON.stringify({ a: st().clubAssets, p: st().retentionView().clubPoints });
      const unknown = st().buyClubAsset("coach_not_real");
      return JSON.stringify({ ok: r.ok, code: r.code, zeroChange: before === after, unknownOk: unknown.ok, unknownCode: unknown.code });
    `);
    const D = J(dup);
    ck(`${label}｜重複購買被拒`, D.ok === false && D.code === "already_owned");
    ck(`${label}｜重複購買不重複扣款（state 零變化）`, D.zeroChange === true);
    ck(`${label}｜未知資產 fail closed`, D.unknownOk === false && D.unknownCode === "unknown_asset");

    //  ⑤ capability 真的生效——**量出來**，不看文案
    const effect = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = () => profile.useProfileStore.getState();
      const idleOf = () => (st().players ?? []).find(p => !p.training && (p.energy ?? 100) < 60);
      //  先把某位選手的體力壓低，才量得到恢復（滿 100 會被 clamp 掉）。
      profile.useProfileStore.setState({
        players: (st().players ?? []).map((p, i) => (i === 0 ? { ...p, energy: 40, training: null } : p)),
      });
      const id = st().players[0].id;
      const cap = st().clubCapabilities();

      //  裝備中：推一天
      const e0 = st().players.find(p => p.id === id).energy;
      st().advanceDay(1);
      const e1 = st().players.find(p => p.id === id).energy;
      const withCoach = e1 - e0;

      //  訓練天數：mechanics 課程 hours: 3
      const okAssign = st().assignTraining(id, "mechanics");
      const daysWith = st().players.find(p => p.id === id).training?.totalDays ?? null;
      st().cancelTraining(id);

      return JSON.stringify({
        capTotal: cap.total.dailyRecoveryBonus,
        capDev: cap.sources.teamDevelopment.dailyRecoveryBonus,
        capCoach: cap.sources.coach.dailyRecoveryBonus,
        trainTotal: cap.total.trainingDaysReduction,
        withCoach, daysWith, okAssign,
      });
    `);
    const E = J(effect);
    ck(`${label}｜合併能力：教練貢獻 +4 恢復`, E.capCoach === 4, `dev=${E.capDev} coach=${E.capCoach} total=${E.capTotal}`);
    //  base restPerDay 8 ＋ 教練 4 ＝ 12（發展樹開局 0 階）。
    ck(`${label}｜推進一天體力實際多回 4（8 → 12）`, E.withCoach === 12, `實際 +${E.withCoach}`);
    ck(`${label}｜合併能力：教練貢獻 −1 訓練天數`, E.trainTotal === 1, `total=${E.trainTotal}`);
    ck(`${label}｜mechanics（3 天）實際排成 2 天`, E.okAssign === true && E.daysWith === 2, `days=${E.daysWith}`);

    //  ⑥ reload 之後仍擁有、仍上任
    await chrome.navigate(server.url);
    await sleep(1300);
    const persisted = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = profile.useProfileStore.getState();
      return JSON.stringify({
        owned: Object.keys(st.clubAssets.owned),
        head: st.clubAssets.headCoachId,
        coachCap: st.clubCapabilities().sources.coach.dailyRecoveryBonus,
      });
    `);
    const P = J(persisted);
    ck(`${label}｜reload 後仍在收藏裡`, P.owned.includes("coach_conditioning"));
    ck(`${label}｜reload 後仍是總教練`, P.head === "coach_conditioning");
    ck(`${label}｜reload 後能力仍生效`, P.coachCap === 4);

    //  ⑦ 換教練週鎖（用真實 advanceDay 跨週，不改時鐘）
    const lock = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = () => profile.useProfileStore.getState();
      st().buyClubAsset("coach_scouting");
      const w0 = st().careerWeek();
      const first = st().equipHeadCoach("coach_scouting");        // 首裝之後的第一次換人
      const second = st().equipHeadCoach("coach_conditioning");   // 同一週第二次 ⇒ 應被擋
      const headAfterBlock = st().clubAssets.headCoachId;
      //  reload 繞不過
      st().save();
      const reloadBlocked = (() => {
        const raw = JSON.parse(localStorage.getItem("esmo.profile.v1"));
        return raw.clubAssets.lastCoachChangeWeek === w0;
      })();
      st().advanceDay(7);                                          // 真的跨一週
      const w1 = st().careerWeek();
      const third = st().equipHeadCoach("coach_conditioning");
      return JSON.stringify({
        w0, w1, firstOk: first.ok, secondOk: second.ok, secondCode: second.code,
        headAfterBlock, reloadBlocked, thirdOk: third.ok, headFinal: st().clubAssets.headCoachId,
      });
    `);
    const L = J(lock);
    ck(`${label}｜買第二位教練後可以換人`, L.firstOk === true);
    ck(`${label}｜同一生涯週第二次換人被拒`, L.secondOk === false && L.secondCode === "weekly_locked");
    ck(`${label}｜被拒後總教練沒有被換掉`, L.headAfterBlock === "coach_scouting");
    ck(`${label}｜週鎖寫進存檔，reload 繞不過`, L.reloadBlocked === true);
    ck(`${label}｜advanceDay(7) 真的跨週`, L.w1 === L.w0 + 1, `${L.w0} → ${L.w1}`);
    ck(`${label}｜跨週後可以再換一次`, L.thirdOk === true && L.headFinal === "coach_conditioning");

    //  ⑧ 版面與動態
    //  ⚠ 步驟 ⑥ 的 reload 把畫面帶回首頁，⑦ 之後只驅動 store ⇒ 此刻 DOM 上
    //    根本沒有資產頁。量版面之前必須**先走回去**，否則量到的是首頁
    //    （我第一版就是這樣得到 animationName === undefined 的假紅）。
    const reEntered = await chrome.evaluate(ENTER);
    ck(`${label}｜量版面前確實回到資產頁`, String(reEntered).includes("open:"), String(reEntered).replace(/"/g, ""));

    const layout = await chrome.evaluate(`
      const de = document.documentElement;
      window.scrollTo(0, 999999);
      await new Promise(r => setTimeout(r, 280));
      const reached = Math.abs((window.scrollY + de.clientHeight) - de.scrollHeight) <= 3;
      const tall = de.scrollHeight > de.clientHeight + 4;
      window.scrollTo(0, 0);
      return JSON.stringify({ overflowX: de.scrollWidth - de.clientWidth, tall, reached, docH: de.scrollHeight });
    `);
    const LY = J(layout);
    ck(`${label}｜無頁面級橫向捲動`, LY.overflowX <= 1, `overflow=${LY.overflowX}`);
    ck(`${label}｜內容超過一頁時捲得到最底`, !LY.tall || LY.reached === true, `docH=${LY.docH}`);

    await chrome.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await sleep(400);
    const rm = await chrome.evaluate(`
      const hero = document.querySelector(".ca__hero");
      const card = document.querySelector(".ca__card");
      if (!hero || !card) return JSON.stringify({ found: false });
      const h = getComputedStyle(hero), c = getComputedStyle(card);
      return JSON.stringify({ found: true, heroAnim: h.animationName, cardAnim: c.animationName, heroOpacity: Number(h.opacity) });
    `);
    const RM = J(rm);
    ck(`${label}｜reduced-motion 下動畫全停`,
      RM.found && RM.heroAnim === "none" && RM.cardAnim === "none", `${RM.heroAnim}/${RM.cardAnim}`);
    ck(`${label}｜reduced-motion 下內容仍是完成狀態`, RM.found && RM.heroOpacity === 1, `opacity=${RM.heroOpacity}`);
    await chrome.send("Emulation.setEmulatedMedia", { features: [] });
  }
} catch (e) {
  ck("harness", false, String(e?.message ?? e));
} finally {
  try { await chrome?.close?.(); } catch { /* 收尾失敗不影響判定 */ }
  try { await server?.close?.(); } catch { /* 同上 */ }
}

console.log(`\n俱樂部資產 UI：${pass}/${pass + fail} ${fail === 0 ? "PASS" : "FAIL"}`);
if (fail) process.exitCode = 1;
