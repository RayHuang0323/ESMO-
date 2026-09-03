#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_club_mastery_ui.mjs — 俱樂部專精頁的真實瀏覽器驗證
//
//  執行：`node tools/browser_check_club_mastery_ui.mjs [--headed]`
//  或走 supervisor（硬總時限，見 Browser Harness v1）：
//    `node tools/browser/run-gate.mjs tools/browser_check_club_mastery_ui.mjs --timeout 300000`
//
//  ⚠ 驗的是**玩家真的操作得到**，不是契約——契約由 `check_club_mastery_v1` 守。
//    重點：入口在桌機與手機都存在（V7B 與 V7-2.5 各漏過一次相反方向）、
//    畫面數字與 domain 一致、領取真的會解鎖、reload 後還在、390 不溢出。
//
//  ── Browser Harness v1 migration（2026-09-04）────────────────────────────
//  這支就是 2026-09-03 那次「印出 68/68 PASS 後卡在收尾近一小時」的當事 gate。
//  原本的 `finally { server?.close?.(); }` 對不存在的方法做 optional call，
//  靜默 no-op ⇒ dev server 從未被真的關掉；Chrome 那一半卡在 `cdp.mjs` 的
//  `spawnSync("taskkill", ...)`——沒有 timeout 參數，一旦 taskkill 本身卡住，
//  會鎖死整個 Node 事件迴圈，連 `setTimeout` 都不會再觸發。
//  改用 `runGate()`：dev server 有真的會被呼叫到的 `.stop()`；Chrome 收尾
//  改成非同步、有時限的 `killProcessTree`，不再用會鎖死事件迴圈的
//  `spawnSync`。若這支本身仍然卡住，走 `run-gate.mjs` supervisor 執行才有
//  硬保證（見該檔案的說明）。
// ============================================================================
import { RESOLVE_APP_MODULES } from "./browser/cdp.mjs";
import { runGate, finishGate } from "./browser/harness.mjs";

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

const result = await runGate({
  name: "俱樂部專精 UI",
  run: async ({ chrome, url, ck, sleep }) => {
    for (const [label, width, height, mobile] of [["桌機 1366px", 1366, 768, false], ["手機 390px", 390, 844, true]]) {
      console.log(`\n── ${label} ──`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });

      await chrome.navigate(url);
      await sleep(900);
      await chrome.evaluate(seed(true));
      await chrome.navigate(url);
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
      await chrome.navigate(url);
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

      //  ────────────────────────────────────────────────────────────────────
      //  ⑧ Visual V2：**真的用滑鼠走一次**，不再只驅動 store。
      //
      //  ①–⑦ 驗的是規則，改版不會動到它們；但 V2 把「切換流派」從三選一的按鈕
      //  改成 hero ＋ 沉睡卡，把「領取」改成新的按鈕樣式——那些控制項如果接錯，
      //  上面全綠也看不出來。所以這一段重新種一份存檔，全部走 DOM。
      //  ────────────────────────────────────────────────────────────────────
      await chrome.navigate(url);
      await sleep(900);
      await chrome.evaluate(seed(true));
      await chrome.navigate(url);
      await sleep(1400);

      const entered = await chrome.evaluate(`
        const find = () => document.querySelector('[data-testid="home-utility-clubMastery"]')
          || document.querySelector('[data-testid="home-sheet-clubMastery"]');
        let b = find();
        if (!b) {
          const more = [...document.querySelectorAll("button")].find(x => (x.innerText || "").trim() === "更多");
          if (more) { more.click(); await new Promise(r => setTimeout(r, 520)); b = find(); }
        }
        if (!b) return "no-entry";
        b.click();
        await new Promise(r => setTimeout(r, 900));
        const root = document.querySelector('[data-testid="club-mastery-screen"]');
        return root ? "doctrine=" + root.dataset.doctrine : "not-open";
      `);
      ck(`${label}｜點得進俱樂部專精頁，且 hero 標著現行流派`,
        String(entered).includes("doctrine=tempo"), String(entered).replace(/"/g, ""));

      //  hero 就是現行流派本身；沉睡的兩條是按鈕。
      const shape = await chrome.evaluate(`
        const q = (t) => document.querySelector('[data-testid="' + t + '"]');
        const hero = q("doctrine-tempo"), ctl = q("doctrine-control"), adp = q("doctrine-adaptive");
        const track = q("mastery-track-tempo_execution");
        const claim = q("mastery-claim-tempo_execution");
        return JSON.stringify({
          heroActive: hero ? hero.dataset.active : null,
          dormantAreButtons: Boolean(ctl && adp && ctl.tagName === "BUTTON" && adp.tagName === "BUTTON"),
          dormantInactive: Boolean(ctl && adp && ctl.dataset.active === "0" && adp.dataset.active === "0"),
          trackClaimable: track ? track.dataset.claimable : null,
          claimEnabled: Boolean(claim && !claim.disabled),
          variantLocked: (() => { const v = q("mastery-variant-m1_measured_siege"); return v ? v.dataset.unlocked : "absent"; })(),
        });
      `);
      const V = JSON.parse(String(shape).replace(/^"|"$/g, ""));
      ck(`${label}｜現行流派是 hero（data-active=1）`, V.heroActive === "1", String(V.heroActive));
      ck(`${label}｜另外兩條流派是可點的沉睡卡`, V.dormantAreButtons && V.dormantInactive);
      ck(`${label}｜達成的專精在畫面上標成可領取`, V.trackClaimable === "1");
      ck(`${label}｜領取按鈕可按`, V.claimEnabled === true);
      ck(`${label}｜領取前變體顯示未解鎖`, V.variantLocked === "0", String(V.variantLocked));

      //  真的按下「領取獎勵」——這是 V2 之後唯一的領取入口。
      const uiClaim = await chrome.evaluate(`
        ${RESOLVE_APP_MODULES}
        const q = (t) => document.querySelector('[data-testid="' + t + '"]');
        q("mastery-claim-tempo_execution").click();
        await new Promise(r => setTimeout(r, 700));
        const st = profile.useProfileStore.getState();
        const v = q("mastery-variant-m1_measured_siege");
        return JSON.stringify({
          stored: st.clubMastery.unlockedVariants.includes("m1_measured_siege"),
          domUnlocked: v ? v.dataset.unlocked : "absent",
          domEquippable: v ? v.dataset.equippable : "absent",
          trackClaimed: (q("mastery-track-tempo_execution") || {}).dataset?.claimed ?? null,
        });
      `);
      const U = JSON.parse(String(uiClaim).replace(/^"|"$/g, ""));
      ck(`${label}｜按下領取後 store 真的解鎖`, U.stored === true);
      ck(`${label}｜按下領取後畫面同步顯示已解鎖`, U.domUnlocked === "1", String(U.domUnlocked));
      ck(`${label}｜按下領取後畫面顯示賽前可選`, U.domEquippable === "1", String(U.domEquippable));
      ck(`${label}｜領取後該條標記為已領取`, U.trackClaimed === "1", String(U.trackClaimed));

      //  點沉睡卡換派：整頁 accent 與 hero 都要跟著換。
      const uiSwitch = await chrome.evaluate(`
        ${RESOLVE_APP_MODULES}
        document.querySelector('[data-testid="doctrine-control"]').click();
        await new Promise(r => setTimeout(r, 800));
        const root = document.querySelector('[data-testid="club-mastery-screen"]');
        const tempo = document.querySelector('[data-testid="doctrine-tempo"]');
        const st = profile.useProfileStore.getState();
        return JSON.stringify({
          rootDoctrine: root ? root.dataset.doctrine : null,
          storeDoctrine: st.clubMastery.activeDoctrine,
          accent: root ? getComputedStyle(root).getPropertyValue("--doctrine-accent").trim() : null,
          tempoNowDormant: tempo ? tempo.dataset.active : null,
          stillOwned: st.clubMastery.unlockedVariants.includes("m1_measured_siege"),
        });
      `);
      const W = JSON.parse(String(uiSwitch).replace(/^"|"$/g, ""));
      ck(`${label}｜點沉睡卡真的換到控圖`, W.rootDoctrine === "control" && W.storeDoctrine === "control",
        `root=${W.rootDoctrine} store=${W.storeDoctrine}`);
      ck(`${label}｜換派後整頁 accent 跟著換`, W.accent === "#38bdf8", String(W.accent));
      ck(`${label}｜換派後強攻降為沉睡卡`, W.tempoNowDormant === "0", String(W.tempoNowDormant));
      ck(`${label}｜換派不會沒收已解鎖的變體`, W.stillOwned === true);

      //  ⑨ 減少動態：**必要條件**，不是加分項。
      await chrome.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
      });
      await sleep(400);
      const rm = await chrome.evaluate(`
        const dot = document.querySelector(".cm__hero-dot");
        const hero = document.querySelector(".cm__hero");
        if (!dot || !hero) return JSON.stringify({ found: false });
        const d = getComputedStyle(dot), h = getComputedStyle(hero);
        return JSON.stringify({
          found: true,
          dotAnim: d.animationName,
          heroOpacity: Number(h.opacity),
          heroTransform: h.transform,
        });
      `);
      const RM = JSON.parse(String(rm).replace(/^"|"$/g, ""));
      ck(`${label}｜reduced-motion 下 pulse 停止`, RM.found && RM.dotAnim === "none", String(RM.dotAnim));
      ck(`${label}｜reduced-motion 下內容仍是完成狀態（不透明、無位移）`,
        RM.found && RM.heroOpacity === 1 && (RM.heroTransform === "none" || RM.heroTransform === "matrix(1, 0, 0, 1, 0, 0)"),
        `opacity=${RM.heroOpacity} transform=${RM.heroTransform}`);
      await chrome.send("Emulation.setEmulatedMedia", { features: [] });

      //  ⑩ 捲動契約（P0 的延續）：這頁比 viewport 長時必須捲得到底。
      const scroll = await chrome.evaluate(`
        const de = document.documentElement;
        window.scrollTo(0, 999999);
        await new Promise(r => setTimeout(r, 300));
        const reached = Math.abs((window.scrollY + de.clientHeight) - de.scrollHeight) <= 3;
        const tall = de.scrollHeight > de.clientHeight + 4;
        window.scrollTo(0, 0);
        return JSON.stringify({ tall, reached, docH: de.scrollHeight, vh: de.clientHeight });
      `);
      const SC = JSON.parse(String(scroll).replace(/^"|"$/g, ""));
      ck(`${label}｜內容超過一頁時捲得到最底`, !SC.tall || SC.reached === true, `docH=${SC.docH} vh=${SC.vh}`);
    }
  },
});

await finishGate(result);
