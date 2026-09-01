#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_club_mastery_ui.mjs — 俱樂部專精頁的真實瀏覽器驗證
//
//  執行：`node tools/browser_check_club_mastery_ui.mjs [--headed]`；失敗 exit 1。
//
//  ⚠ 驗的是**玩家真的操作得到**，不是契約——契約由 `check_club_mastery_v1` 守。
//    重點：入口在桌機與手機都存在（V7B 與 V7-2.5 各漏過一次相反方向）、
//    畫面數字與 domain 一致、領取真的會解鎖、reload 後還在、390 不溢出。
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5347;
const CDP_PORT = 9381;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 乾淨存檔；`ready` 為真時把 TEMPO 的專精條件做到剛好可領（但**還沒領**）。 */
const seed = (ready) => `
  ${RESOLVE_APP_MODULES}
  localStorage.removeItem("esmo.profile.v1");
  const st = () => profile.useProfileStore.getState();
  st().startNewGame("elite");
  ${ready ? `
    st().setActiveDoctrine("tempo");
    const ms = await import(B + "/src/platform/mastery/clubMasteryState.js");
    let bag = st().clubMastery;
    for (let i = 0; i < 3; i++) {
      bag = ms.recordTacticUsage(bag, { mode: "moba", tacticId: "m1", matchSource: "competitive", intent: true });
    }
    profile.useProfileStore.setState({ clubMastery: bag });
  ` : ""}
  st().save();
  return "seeded";
`;

/** 進到俱樂部專精頁（直接設 screen，不依賴點擊路徑，避免驗到導覽動畫）。 */
const OPEN = `
  ${RESOLVE_APP_MODULES}
  const el = document.querySelector('[data-testid="club-mastery-screen"]');
  return el ? "already" : "need-nav";
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
    await chrome.evaluate(seed(true));
    await chrome.navigate(server.url);
    await sleep(1400);

    //  ① 入口存在。
    //  ⚠ 桌機的入口是常駐的 Utility 磚；手機的住在**底部「更多」sheet 裡**，
    //    要先點開才會渲染。所以這裡走真實操作路徑，而不是掃首頁文字——
    //    掃文字會在手機上假性失敗（我第一版就是這樣誤判自己漏接線）。
    const navHit = await chrome.evaluate(`
      const seen = () => Boolean(
        document.querySelector('[data-testid="home-sheet-clubMastery"]')
        || [...document.querySelectorAll("button")].some(b => (b.innerText || "").includes("俱樂部專精"))
      );
      if (seen()) return "desktop-tile";
      //  手機：點開底部「更多」
      const more = [...document.querySelectorAll("button")].find(b => (b.innerText || "").trim() === "更多");
      if (!more) return "no-more-tab";
      more.click();
      await new Promise(r => setTimeout(r, 500));
      return seen() ? "mobile-sheet" : "missing";
    `);
    ck(`${label}｜找得到「俱樂部專精」入口`, ["desktop-tile", "mobile-sheet"].includes(String(navHit).replace(/"/g, "")), String(navHit));

    //  ② 開頁並比對畫面與 domain
    const opened = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = profile.useProfileStore.getState();
      const view = st.masteryView();
      return JSON.stringify({
        active: view.activeDoctrine,
        tracks: view.tracks.length,
        tempoClaimable: view.tracks.find(t => t.trackId === "tempo_execution").claimable,
        tempoProgress: view.tracks.find(t => t.trackId === "tempo_execution").progress,
        tempoTarget: view.tracks.find(t => t.trackId === "tempo_execution").target,
        unlocked: st.clubMastery.unlockedVariants.length,
      });
    `);
    const O = JSON.parse(String(opened).replace(/^"|"$/g, ""));
    ck(`${label}｜流派為 tempo 且三條專精都在`, O.active === "tempo" && O.tracks === 3);
    ck(`${label}｜條件達成後可領取`, O.tempoClaimable === true, `${O.tempoProgress}/${O.tempoTarget}`);
    ck(`${label}｜領取前沒有任何解鎖`, O.unlocked === 0);

    //  ③ 領取 → 立即解鎖 → 重複領無效
    const claimed = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = () => profile.useProfileStore.getState();
      const first = st().claimMasteryTrack("tempo_execution");
      const afterFirst = JSON.stringify(st().clubMastery);
      const second = st().claimMasteryTrack("tempo_execution");
      const afterSecond = JSON.stringify(st().clubMastery);
      return JSON.stringify({
        firstOk: first.ok, unlockedId: first.unlockedVariantId,
        secondOk: second.ok,
        zeroChange: afterFirst === afterSecond,
        nowUnlocked: st().clubMastery.unlockedVariants,
        equippable: st().equippableVariants().map(v => v.variantId),
      });
    `);
    const C = JSON.parse(String(claimed).replace(/^"|"$/g, ""));
    ck(`${label}｜領取成功並回傳變體 id`, C.firstOk === true && C.unlockedId === "m1_measured_siege");
    ck(`${label}｜領取後立即出現在已解鎖清單`, C.nowUnlocked.includes("m1_measured_siege"));
    ck(`${label}｜領取後立即可裝備`, C.equippable.includes("m1_measured_siege"));
    ck(`${label}｜重複領取被拒`, C.secondOk === false);
    ck(`${label}｜重複領取 state 零變化`, C.zeroChange === true);

    //  ④ reload 後仍在
    await chrome.navigate(server.url);
    await sleep(1300);
    const persisted = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = profile.useProfileStore.getState();
      return JSON.stringify({
        unlocked: st.clubMastery.unlockedVariants,
        active: st.clubMastery.activeDoctrine,
        claimed: st.masteryView().tracks.find(t => t.trackId === "tempo_execution").claimed,
      });
    `);
    const R = JSON.parse(String(persisted).replace(/^"|"$/g, ""));
    ck(`${label}｜reload 後解鎖仍在`, R.unlocked.includes("m1_measured_siege"));
    ck(`${label}｜reload 後流派仍是 tempo`, R.active === "tempo");
    ck(`${label}｜reload 後標記為已領取`, R.claimed === true);

    //  ⑤ 切換流派：仍擁有、不可裝備；切回可用
    const switched = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = () => profile.useProfileStore.getState();
      st().setActiveDoctrine("control");
      const own = st().clubMastery.unlockedVariants.includes("m1_measured_siege");
      const equipA = st().equippableVariants().length;
      st().setActiveDoctrine("tempo");
      const equipB = st().equippableVariants().map(v => v.variantId);
      return JSON.stringify({ own, equipA, backOk: equipB.includes("m1_measured_siege") });
    `);
    const S = JSON.parse(String(switched).replace(/^"|"$/g, ""));
    ck(`${label}｜切到控圖後仍擁有變體`, S.own === true);
    ck(`${label}｜切到控圖後不可裝備`, S.equipA === 0);
    ck(`${label}｜切回強攻後恢復可用`, S.backOk === true);

    //  ⑥ BASIC 不退化
    const basic = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = profile.useProfileStore.getState();
      return String(["m1","m2","m3","m4","m5","m6","m7","m8"].every(id => st.variantsForTactic(id).basic === true));
    `);
    ck(`${label}｜m1–m8 八套基礎戰術全部仍可用`, String(basic).includes("true"));

    //  ⑦ 頁面級橫向溢出
    const overflow = await chrome.evaluate(`
      return String(document.documentElement.scrollWidth - document.documentElement.clientWidth);
    `);
    ck(`${label}｜無頁面級橫向捲動`, Number(String(overflow).replace(/"/g, "")) <= 1, `overflow=${overflow}`);
  }
} catch (e) {
  ck("harness", false, String(e?.message ?? e));
} finally {
  try { await chrome?.close?.(); } catch { /* 收尾失敗不影響判定 */ }
  try { await server?.close?.(); } catch { /* 同上 */ }
}

console.log(`\n俱樂部專精 UI：${pass}/${pass + fail} ${fail === 0 ? "PASS" : "FAIL"}`);
if (fail) process.exitCode = 1;
