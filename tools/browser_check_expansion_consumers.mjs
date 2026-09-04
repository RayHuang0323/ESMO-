#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_expansion_consumers.mjs — N2/N3/N4/N5 消費端驗證
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_expansion_consumers.mjs --timeout 900000`
//
//  ── 為什麼不是走完整賽事流程 ─────────────────────────────────────────────
//  這四個面板掛在 `TacticScreen` / `BanPickScreen` / `CsTacticScreen`，
//  而那三個畫面只有在**配對 → 房間 → 場次**全部成立之後才到得了
//  （`startPracticeMatch` 只做到房間，session 要靠 `useMatchFlow` 輪詢）。
//  Owner 明文：不要求跑完整場，也**不得為了測試在產品裡加捷徑**。
//
//  ⇒ 本 gate 用 `tools/browser/mountConsumer.jsx` 把**真正的元件**掛到游離容器，
//    搭配**真正的 profileStore**。元件、Store、解鎖判定全部是產品那一份，
//    只有「怎麼到達這個畫面」被繞過。掛載器住在 `tools/`，產品沒有任何地方
//    import 它 ⇒ 不進 production bundle。
//
//  ── 每個節點驗四件事 ─────────────────────────────────────────────────────
//  ① 解鎖前看不到　② 購買後出現　③ reload 後仍在　④ 版面與錯誤
// ============================================================================
import { RESOLVE_APP_MODULES } from "./browser/cdp.mjs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));

/** 四個節點：旗標 / 面板 testid / 元件路徑 / props / 前置鏈（含自己）。 */
const CONSUMERS = [
  {
    id: "N2", node: "moba_tactical_prep", flag: "mobaTacticInsight", panel: "moba-tactic-insight",
    path: "/src/screens/moba/TacticScreen.jsx", key: "tactic",
    props: `{ onNext: () => {}, onBack: () => {} }`,
    chain: ["moba_hero_lab", "moba_draft_intel", "moba_tactical_prep"],
  },
  {
    id: "N3", node: "moba_match_analysis", flag: "mobaMatchOverview", panel: "moba-match-overview",
    path: "/src/screens/moba/BanPickScreen.jsx", key: "banpick",
    props: `{ onNext: () => {}, onBack: () => {}, onCodex: () => {} }`,
    chain: ["moba_hero_lab", "moba_draft_intel", "moba_opponent_research", "moba_tactical_prep", "moba_match_analysis"],
  },
  {
    id: "N4", node: "cs_tactical_prep", flag: "csTacticInsight", panel: "cs-tactic-insight",
    path: "/src/screens/fps/CsTacticScreen.jsx", key: "csTactic",
    props: `{ mapName: "Dust II", onNext: () => {}, onBack: () => {} }`,
    chain: ["cs_map_lab", "cs_team_drill", "cs_tactical_prep"],
  },
  {
    id: "N5", node: "cs_match_intel", flag: "csMatchOverview", panel: "cs-match-overview",
    path: "/src/screens/fps/CsTacticScreen.jsx", key: "csTactic",
    props: `{ mapName: "Dust II", onNext: () => {}, onBack: () => {} }`,
    chain: ["cs_map_lab", "cs_team_drill", "cs_demo_analysis", "cs_tactical_prep", "cs_match_intel"],
  },
];

/** 乾淨存檔 ＋ 指定的已投入節點（用 sanitize，不繞過任何規則）。 */
const seed = (ranks, points) => `
  ${RESOLVE_APP_MODULES}
  const store = profile.useProfileStore;
  const { sanitizeTeamDevelopment } = await import(B + "/src/platform/development/teamDevelopment.js");
  localStorage.removeItem("esmo.profile.v1");
  store.getState().startNewGame("elite");
  await new Promise((r) => setTimeout(r, 300));
  store.setState({ teamDevelopment: sanitizeTeamDevelopment({
    availablePoints: ${points},
    ranks: ${JSON.stringify(ranks)},
    grants: { seed: 1, legacy: 30 },
  }) });
  store.getState().save();
  const u = store.getState().clubCapabilities().total.unlocks;
  return JSON.stringify({ unlocks: Object.keys(u), points: store.getState().teamDevelopment.availablePoints });
`;

/** 掛載真元件，回報面板在不在＋版面數據。 */
const mountAndRead = (key, path, props, panel) => `
  ${RESOLVE_APP_MODULES}
  const mounter = await import(B + "/tools/browser/mountConsumer.jsx");
  const mod = await import(B + "${path}");
  const host = mounter.mountScreen("${key}", mod.default, ${props});
  await new Promise((r) => setTimeout(r, 520));
  const panel = host.querySelector('[data-testid="${panel}"]');
  const vis = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const measure = (root) => [...root.querySelectorAll("button")].filter(vis).map((el) => {
    const r = el.getBoundingClientRect();
    return { label: (el.innerText || "").trim().slice(0, 12), w: Math.round(r.width), h: Math.round(r.height) };
  });
  //  ⚠ 本 Sprint 的責任範圍是**這個面板自己的互動**。整個畫面的按鈕
  //    （例如 BanPick 的上百個英雄格）是既有內容，不在本輪 scope——
  //    量出來只做觀察值回報，不列入 pass/fail，避免把別人的既有問題
  //    當成本輪的回歸，也避免假裝沒看到。
  const panelTargets = panel ? measure(panel) : [];
  const targets = measure(host);
  const out = {
    present: panel !== null,
    visible: vis(panel),
    text: panel ? (panel.innerText || "").trim().slice(0, 120) : null,
    hostWidth: Math.round(host.getBoundingClientRect().width),
    innerWidth: window.innerWidth,
    overflow: host.scrollWidth > window.innerWidth + 1,
    panelSmall: panelTargets.filter((t) => t.h < 44 || t.w < 44).length,
    panelTargetCount: panelTargets.length,
    screenSmall: targets.filter((t) => t.h < 44 || t.w < 44).length,
    screenTargetCount: targets.length,
  };
  mounter.unmountScreen("${key}");
  return JSON.stringify(out);
`;

const result = await runGate({
  name: "Expansion consumers（N2/N3/N4/N5）",
  run: async ({ chrome, url, ck, sleep }) => {
    for (const [label, width, height, mobile] of [["桌機 1366px", 1366, 900, false], ["手機 390px", 390, 844, true]]) {
      console.log(`\n════ ${label} ════`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });

      for (const c of CONSUMERS) {
        console.log(`\n── ${c.id} ${c.node} → ${c.panel} ──`);

        // ── ① 解鎖前：面板不得出現 ────────────────────────────────────────
        await chrome.navigate(url); await sleep(900);
        //  ⚠ 給足點數但**一個節點都沒投入**——「有錢」不會解鎖任何東西，
        //    所以這仍然是合法的「解鎖前」狀態，而且下一步才買得起整條前置鏈。
        const beforeSeed = J(await chrome.evaluate(seed({}, 10)));
        ck(`${label}/${c.id}｜precondition：解鎖前旗標不存在`,
          !beforeSeed.unlocks.includes(c.flag), beforeSeed.unlocks.join(",") || "無旗標");
        const before = J(await chrome.evaluate(mountAndRead(c.key, c.path, c.props, c.panel)));
        ck(`${label}/${c.id}｜解鎖前玩家看不到這個能力`,
          before.present === false, before.text ? "面板不該存在" : "clean");

        // ── ② 走真實購買流程解鎖 ─────────────────────────────────────────
        const buy = J(await chrome.evaluate(`
          ${RESOLVE_APP_MODULES}
          const store = profile.useProfileStore;
          const receipts = [];
          for (const id of ${JSON.stringify(c.chain)}) {
            receipts.push(store.getState().purchaseTeamDevelopment(id));
          }
          const u = store.getState().clubCapabilities().total.unlocks;
          return JSON.stringify({
            allOk: receipts.every((r) => r.success),
            reasons: receipts.filter((r) => !r.success).map((r) => r.failureReason),
            spent: store.getState().teamDevelopment.spentPoints,
            has: Boolean(u["${c.flag}"]),
          });
        `));
        ck(`${label}/${c.id}｜走真實購買流程解鎖前置鏈`, buy.allOk === true, buy.reasons.join(" | "));
        ck(`${label}/${c.id}｜購買後旗標成立`, buy.has === true);
        ck(`${label}/${c.id}｜購買確實扣了點數`, buy.spent === c.chain.length, `spent=${buy.spent}/${c.chain.length}`);

        const after = J(await chrome.evaluate(mountAndRead(c.key, c.path, c.props, c.panel)));
        ck(`${label}/${c.id}｜購買後面板出現且可見`, after.present === true && after.visible === true);
        ck(`${label}/${c.id}｜面板有實際內容`,
          typeof after.text === "string" && after.text.length > 10, JSON.stringify((after.text ?? "").slice(0, 46)));
        ck(`${label}/${c.id}｜面板不造成水平溢出`, after.overflow === false, `${after.hostWidth}/${after.innerWidth}`);
        if (mobile) {
          ck(`${label}/${c.id}｜面板自己的互動都可觸控（≥44px）`,
            after.panelSmall === 0, `${after.panelSmall} 個過小 / 面板共 ${after.panelTargetCount}`);
          //  觀察值：整個畫面的既有按鈕。不列入 pass/fail（見 mountAndRead 內註解）。
          console.log(`   ⓘ ${c.id} 整個畫面 <44px 的按鈕：${after.screenSmall} / ${after.screenTargetCount}（既有內容，不在本輪 scope）`);
        }

        // ── ③ reload 後仍然成立 ──────────────────────────────────────────
        await chrome.navigate(url); await sleep(1500);
        const reloaded = J(await chrome.evaluate(`
          ${RESOLVE_APP_MODULES}
          const u = profile.useProfileStore.getState().clubCapabilities().total.unlocks;
          return JSON.stringify({ has: Boolean(u["${c.flag}"]), spent: profile.useProfileStore.getState().teamDevelopment.spentPoints });
        `));
        ck(`${label}/${c.id}｜reload 後旗標仍在`, reloaded.has === true);
        ck(`${label}/${c.id}｜reload 後已投入點數不變`, reloaded.spent === c.chain.length, `${reloaded.spent}`);
        const afterReload = J(await chrome.evaluate(mountAndRead(c.key, c.path, c.props, c.panel)));
        ck(`${label}/${c.id}｜reload 後面板仍然出現`, afterReload.present === true && afterReload.visible === true);
      }

      // ── ④ 錯誤 ─────────────────────────────────────────────────────────
      const errs = (chrome.consoleLines ?? []).filter((l) => /^\[error\]/i.test(l));
      const pageErrs = chrome.pageErrors ?? [];
      ck(`${label}｜console / page 錯誤 = 0`, errs.length === 0 && pageErrs.length === 0,
        [...errs, ...pageErrs].slice(0, 3).join(" ¦ ") || "clean");
    }
  },
});

finishGate(result);
