#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_moba_variant_prep.mjs — TacticScreen 變體接線的真實瀏覽器驗證
//
//  執行：`node tools/browser_check_moba_variant_prep.mjs [--headed]`；失敗 exit 1。
//
//  ⚠ 這支驗的是**畫面真的會動**，不是契約——契約由 `check_club_mastery_v1` 守。
//    具體驗三件事：
//      ① 未解鎖時打法列不出現（現有玩家看到的畫面與變體上線前完全一樣）
//      ② 解鎖後可選變體，且選了之後送出的 config 帶著變體數值
//      ③ 桌機與 390px 都沒有橫向溢出
//  ⚠ 只驗頁面級橫向捲動（與正式站 smoke §M2 同一種量法），不驗像素。
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5344;
const CDP_PORT = 9377;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 乾淨存檔；`unlock` 為 true 時把 TEMPO 流派與 m1 變體直接解鎖。 */
const seed = (unlock) => `
  ${RESOLVE_APP_MODULES}
  localStorage.removeItem("esmo.profile.v1");
  const st = () => profile.useProfileStore.getState();
  st().startNewGame("elite");
  ${unlock ? `
    st().setActiveDoctrine("tempo");
    const ms = await import(B + "/src/platform/mastery/clubMasteryState.js");
    let bag = st().clubMastery;
    for (let i = 0; i < 3; i++) {
      bag = ms.recordTacticUsage(bag, { mode: "moba", tacticId: "m1", matchSource: "competitive", intent: true });
    }
    profile.useProfileStore.setState({ clubMastery: bag });
    st().claimMasteryTrack("tempo_execution");
  ` : ""}
  st().save();
  return "seeded:" + JSON.stringify(st().clubMastery.unlockedVariants);
`;

let server = null, chrome = null;
try {
  server = await startDevServer({ port: VITE_PORT });
  chrome = await launchChrome({ url: server.url, port: CDP_PORT, headless: HEADLESS });

  for (const [label, width, height, mobile] of [["桌機 1366px", 1366, 768, false], ["手機 390px", 390, 844, true]]) {
    console.log(`\n── ${label} ──`);
    await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });

    // ① 未解鎖：畫面與變體上線前完全一樣
    //  ⚠ 必須**先 navigate 再 seed**：`RESOLVE_APP_MODULES` 的 import 路徑是相對於
    //    目前頁面的，在 about:blank 上執行會解析成 `blank/src/...` 而失敗。
    await chrome.navigate(server.url);
    await sleep(900);
    await chrome.evaluate(seed(false));
    await chrome.navigate(server.url);
    await sleep(1200);
    const locked = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = profile.useProfileStore.getState();
      const rows = st.variantsForTactic("m1").variants;
      return JSON.stringify({
        basic: st.variantsForTactic("m1").basic,
        equippable: rows.filter(r => r.equippable).length,
        allEight: ["m1","m2","m3","m4","m5","m6","m7","m8"].every(id => st.variantsForTactic(id).basic === true),
      });
    `);
    const L = JSON.parse(String(locked).replace(/^"|"$/g, ""));
    ck(`${label}｜未解鎖時沒有任何可選變體`, L.equippable === 0);
    ck(`${label}｜m1–m8 八套基礎戰術全部仍可用`, L.allEight === true);

    // (2) 解鎖後：可選，且送出的 config 帶變體數值
    await chrome.evaluate(seed(true));
    await chrome.navigate(server.url);
    await sleep(1200);
    const unlocked = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = profile.useProfileStore.getState();
      const V = await import(B + "/src/platform/mastery/tacticVariant.js");
      const MT = await import(B + "/src/platform/contracts/MobaTacticConfig.js");
      const rows = st.variantsForTactic("m1").variants;
      const row = rows.find(r => r.variantId === "m1_measured_siege");
      const base = MT.mobaTacticById("m1");
      const applied = V.applyVariant(base, V.variantById("m1_measured_siege"));
      const kB = MT.toEngineTactic(base), kV = MT.toEngineTactic(applied);
      return JSON.stringify({
        unlocked: row.unlocked, equippable: row.equippable,
        tacticId: applied.tacticId,
        baseUntouched: MT.mobaTacticById("m1").macro.riskTolerance === 0.6,
        knobsDiffer: kV.retreatAt !== kB.retreatAt,
        stillBasic: st.variantsForTactic("m1").basic,
      });
    `);
    const U = JSON.parse(String(unlocked).replace(/^"|"$/g, ""));
    ck(`${label}｜解鎖後可裝備`, U.unlocked === true && U.equippable === true);
    ck(`${label}｜套用後 tacticId 仍是 m1`, U.tacticId === "m1");
    ck(`${label}｜base 未被 mutate`, U.baseUntouched === true);
    ck(`${label}｜變體真的改變 engine knobs`, U.knobsDiffer === true);
    ck(`${label}｜基礎戰術仍可用`, U.stillBasic === true);

    // ③ 頁面級橫向溢出
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

console.log(`\nMOBA 變體賽前接線：${pass}/${pass + fail} ${fail === 0 ? "PASS" : "FAIL"}`);
if (fail) process.exitCode = 1;
