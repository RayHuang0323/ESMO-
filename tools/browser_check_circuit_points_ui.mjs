#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_circuit_points_ui.mjs — 巡迴積分**畫面**驗證（Q7a-3e）
//
//  執行：`node tools/browser_check_circuit_points_ui.mjs`（自己起 vite／Chrome）。
//  加 `--headed` 可以看著它跑。
//
//  ── 為什麼一定要畫面 gate ────────────────────────────────────────────────
//  3c／3d 之後，積分、巡迴排名、晉級名單全都算得出來、也存得下來——
//  但玩家在瀏覽器裡**一個字都看不到**。這種「資料對、畫面沒跟上」的落差
//  在同日多場已經發生過一次，Node 驗證器驗不到。
//
//  驗六件事：
//    ① legacy 存檔**完全看不到這個區塊**（沒有積分政策就不該出現）
//    ② 有巡迴賽但還沒結算 ⇒ 區塊出現、三站都標「未結算」、榜是空的
//    ③ 三站封存後 ⇒ 巡迴榜 8 隊、我的名次、各站得分、晉級名單
//    ④ `policy_required` 會**寫出原因**（不是只寫「未結算」）
//    ⑤ 換季後 `circuitHistory` 摘要看得到
//    ⑥ 手機寬度下不橫向溢出、全程無未捕捉例外
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5319;
const CDP_PORT = 9341;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };

const PRELUDE = `
  ${RESOLVE_APP_MODULES}
  const SS = await import(B + "/src/platform/competition/seasonState.js");
  const AC = await import(B + "/src/platform/competition/asiaCircuit.js");
  const CP = await import(B + "/src/platform/competition/circuitPoints.js");
  const st = () => profile.useProfileStore.getState();
`;

/** 乾淨的 legacy 賽季（沒有巡迴賽）。 */
const SETUP_LEGACY = `
  ${PRELUDE}
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  st().save();
  return { events: Object.keys(st().competition.events).length,
           policies: Object.values(st().competition.circuits).map((c) => c.pointsPolicy) };
`;

/** 加上亞洲巡迴賽，但**一場都還沒打**。 */
const SETUP_CIRCUIT = `
  ${PRELUDE}
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  const r = AC.applyAsiaCircuit(st().competition, { playerTeam: st().team, seasonSeed: st().meta.seasonSeed });
  profile.useProfileStore.setState({ competition: r.state });
  st().save();
  return { added: r.added, fixtures: st().competition.fixtures.length,
           events: Object.keys(st().competition.events).length };
`;

/** 把三站打完並封存 ⇒ 積分、巡迴榜、晉級資格全部產生。 */
const SETUP_SETTLED = `
  ${PRELUDE}
  let s = st().competition;
  //  ⚠ 不要把 circuit id 存在 window 再 reload——reload 會把 window 清空，
  //    第一版就是這樣讓 cid 變 undefined、什麼都沒封存卻繼續往下跑。
  //    改成從狀態自己認：帶積分政策的那條就是它。
  const cid = Object.values(s.circuits).find((c) => c.pointsPolicy)?.id;
  const ids = Object.entries(s.events).filter(([, e]) => e.circuitId === cid).map(([id]) => id);
  ids.forEach((eid, i) => {
    const compId = s.events[eid].rankingCompetitionId;
    for (const f of SS.fixturesOfCompetition(s, compId)) {
      const cmp = String(f.sideA).localeCompare(String(f.sideB));
      const winner = i === 0 ? (cmp < 0 ? f.sideA : f.sideB)
        : i === 1 ? (cmp > 0 ? f.sideA : f.sideB)
        : (f.round % 2 === 1 ? f.sideA : f.sideB);
      s = SS.applyLaunch(s, f.id).state;
      s = SS.applyCompleted(s, { fixtureId: f.id, winner, score: { a: 2, b: 0 }, duration: 1800, seed: 7 }).state;
    }
  });
  profile.useProfileStore.setState({ competition: s });
  st()._sealSeasonIfFinished();
  const after = st().competition;
  const table = CP.circuitStandings(after, cid);
  const me = table.rows.find((r) => r.teamId === after.playerTeamId);
  return { log: CP.pointsLogOf(after).length, rows: table.rows.length,
           myRank: me.rank, myPoints: me.points,
           quals: CP.qualificationsOf(after).length,
           top: table.rows.slice(0, 4).map((r) => r.name) };
`;

/** 把其中一站改成沒有倍率的層級 ⇒ 該站變 policy_required。 */
const SETUP_POLICY_REQUIRED = `
  ${PRELUDE}
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  const r = AC.applyAsiaCircuit(st().competition, { playerTeam: st().team, seasonSeed: st().meta.seasonSeed });
  let s = r.state;
  const cid = r.circuitId;
  const eid = Object.entries(s.events).find(([, e]) => e.circuitId === cid)[0];
  const compId = s.events[eid].rankingCompetitionId;
  for (const f of SS.fixturesOfCompetition(s, compId)) {
    s = SS.applyLaunch(s, f.id).state;
    s = SS.applyCompleted(s, { fixtureId: f.id, winner: f.sideA, score: { a: 2, b: 0 }, duration: 1800, seed: 7 }).state;
  }
  //  ⚠ 改成 3c 沒有定義倍率的層級 ⇒ 依 fail-closed 規則不得給分
  s = { ...s, events: { ...s.events, [eid]: { ...s.events[eid], tier: "exhibition" } } };
  profile.useProfileStore.setState({ competition: s });
  st()._sealSeasonIfFinished();
  const status = CP.pointsStatusOfEvent(st().competition, eid, SS.eventFinalOf);
  return { status: status.status, reason: status.reason, log: CP.pointsLogOf(st().competition).length };
`;

/** 用真實的摘要函式產生歷史（不是手寫假資料）。 */
const SETUP_HISTORY = `
  ${PRELUDE}
  const summaries = CP.summarizeAllCircuits(st().competition, SS.eventFinalOf);
  profile.useProfileStore.setState({ circuitHistory: summaries });
  st().save();
  return { n: summaries.length, season: summaries[0]?.season,
           events: summaries[0]?.events?.length, rank: summaries[0]?.playerRank };
`;

const GOTO = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const on = () => /積分榜 STANDINGS/.test(document.body.innerText);
  for (let i = 0; i < 16 && !on(); i++) {
    const tile = [...document.querySelectorAll("button")].find((b) => /🏆/.test(b.innerText) && /賽事/.test(b.innerText));
    if (tile) { tile.click(); await wait(900); continue; }
    await wait(400);
  }
  await wait(600);
  const body = document.body.innerText;
  const block = (body.split("巡迴積分 CIRCUIT POINTS")[1] ?? "").split("歷屆")[0];
  return {
    arrived: on(),
    hasPanel: body.includes("巡迴積分 CIRCUIT POINTS"),
    hasHistory: body.includes("歷屆巡迴 CIRCUIT HISTORY"),
    block,
    body,
    //  ⚠ 量寬度要量對地方。這個 app 的滾動容器是中間那一層 div，
    //    body 與 documentElement 永遠回報 390（內容被裁掉）——前兩版分別用
    //    body.scrollWidth 與「超出視窗且不在可捲動容器裡」，**兩次都是假綠**：
    //    實測塞一個 1400px 方塊進去兩者都不紅。
    //    實量出來會動的是滾動容器自己：基準 390/390，塞了之後 1426/390。
    overflow: (() => {
      const scroller = [...document.querySelectorAll("*")].find(
        (e) => e.scrollHeight > e.clientHeight + 50 && getComputedStyle(e).overflowY !== "visible");
      const el = scroller ?? document.documentElement;
      return { over: el.scrollWidth > el.clientWidth + 1, sw: el.scrollWidth, cw: el.clientWidth };
    })(),
    width: window.innerWidth,
  };
`;

console.log("══ Q7a-3e：巡迴積分畫面 ══\n");
const dev = await startDevServer({ port: VITE_PORT });
//  ⚠ Q7a-3f.2：**旗標狀態寫進網址，不吃預設值**。
//    asiaCircuit 預設已經翻成開啟（新賽季含亞洲巡迴賽三站）。本檔的情境是
//    自己組出來的，巡迴賽對它只是雜訊——不明確關掉的話，測的就不是原本那件事。
const APP = dev.url + "?asiaCircuit=0";
const chrome = await launchChrome({ url: APP, port: CDP_PORT, headless: HEADLESS });
try {
  await chrome.navigate(APP);
  await new Promise((r) => setTimeout(r, 3500));

  // ── ① legacy：整個區塊不該出現 ──────────────────────────────────────
  const leg = await chrome.evaluate(SETUP_LEGACY);
  ck("0) legacy 賽季：1 個賽事、沒有任何積分政策",
    leg.events === 1 && leg.policies.every((p) => p == null));
  await chrome.reload();
  await new Promise((r) => setTimeout(r, 3500));
  const uiLegacy = await chrome.evaluate(GOTO);
  ck("1) **legacy 完全看不到巡迴積分區塊**（畫面維持現況）",
    uiLegacy.arrived && !uiLegacy.hasPanel && !uiLegacy.hasHistory);

  // ── ② 有巡迴賽但還沒結算 ────────────────────────────────────────────
  const setup = await chrome.evaluate(SETUP_CIRCUIT);
  ck("2) 掛上亞洲巡迴賽：+84 場、4 個賽事",
    setup.added === 84 && setup.fixtures === 140 && setup.events === 4, `${setup.fixtures} 場`);
  await chrome.reload();
  await new Promise((r) => setTimeout(r, 3500));
  const uiPre = await chrome.evaluate(GOTO);
  ck("3) **區塊出現了**，而且標出巡迴賽名稱",
    uiPre.hasPanel && uiPre.block.includes("亞洲巡迴賽"), uiPre.hasPanel ? "有" : "沒有");
  ck("3b) 三站都標「未結算」、進度顯示 0/3",
    (uiPre.block.match(/未結算/g) ?? []).length === 3 && uiPre.block.includes("0/3 站結算"),
    `未結算 ×${(uiPre.block.match(/未結算/g) ?? []).length}`);
  ck("3c) **榜還沒出現時說清楚為什麼**（不是空白一片）",
    uiPre.block.includes("要等賽事封存後才會出現"));
  ck("3d) 還沒核發資格時**不得寫成已晉級**",
    !uiPre.block.includes("已取得年度總決賽資格"));

  // ── ③ 三站封存後 ────────────────────────────────────────────────────
  const settled = await chrome.evaluate(SETUP_SETTLED);
  ck("4) 資料層：24 筆積分、8 隊巡迴榜、資格已核發",
    settled.log === 24 && settled.rows === 8 && settled.quals === 1,
    `我第 ${settled.myRank} 名 / ${settled.myPoints} 分`);
  await chrome.reload();
  await new Promise((r) => setTimeout(r, 3500));
  const uiPost = await chrome.evaluate(GOTO);
  ck("5) **三站都顯示已結算**（3/3）",
    (uiPost.block.match(/已結算/g) ?? []).length >= 3 && uiPost.block.includes("3/3 站結算"));
  ck("6) **玩家名次與總分顯示正確**（與資料層逐值相同）",
    uiPost.block.includes(`${settled.myPoints} 分`) &&
    new RegExp(`(^|\\n)\\s*${settled.myRank}\\s*(\\n|$)`).test(uiPost.block),
    `第 ${settled.myRank} 名 / ${settled.myPoints} 分`);
  ck("7) **巡迴榜列出 8 隊**", (() => {
    const rows = uiPost.block.split("每一站封存後")[0];
    return settled.top.every((n) => rows.includes(n));
  })(), settled.top.join("、"));
  ck("8) **晉級名單看得到**，且前四名都在上面",
    uiPost.block.includes("年度總決賽晉級名單") &&
    settled.top.every((n) => uiPost.block.includes(n)));
  ck("9) 各站得分看得到（`+分數` 形式）",
    (uiPost.block.match(/\+\d+/g) ?? []).length >= 3,
    (uiPost.block.match(/\+\d+/g) ?? []).slice(0, 4).join(" "));
  ck("10) championship 站的倍率徽章看得到（×2）", uiPost.block.includes("×2"));

  // ── ④ 換季摘要 ──────────────────────────────────────────────────────
  const hist = await chrome.evaluate(SETUP_HISTORY);
  ck("11) 摘要產得出來（真實函式，不是假資料）",
    hist.n === 1 && hist.events === 3 && typeof hist.rank === "number", `第 ${hist.rank} 名`);
  await chrome.reload();
  await new Promise((r) => setTimeout(r, 3500));
  const uiHist = await chrome.evaluate(GOTO);
  ck("12) **歷屆巡迴看得到**，帶賽季、我的名次與各站成績",
    uiHist.hasHistory &&
    /S\d/.test(uiHist.body.split("歷屆巡迴 CIRCUIT HISTORY")[1] ?? "") &&
    (uiHist.body.split("歷屆巡迴 CIRCUIT HISTORY")[1] ?? "").includes(`我 第 ${hist.rank} 名`));

  // ── ⑤ policy_required 要寫出原因 ────────────────────────────────────
  const pr = await chrome.evaluate(SETUP_POLICY_REQUIRED);
  ck("13) 資料層：改成沒有倍率的層級 ⇒ policy_required、**沒有給分**",
    pr.status === "policy_required" && pr.log === 0, pr.reason);
  await chrome.reload();
  await new Promise((r) => setTimeout(r, 3500));
  const uiPr = await chrome.evaluate(GOTO);
  ck("14) **畫面標出「缺積分政策」**（不是含糊的「未結算」）",
    uiPr.block.includes("缺積分政策"));
  ck("15) **而且把原因寫出來**（玩家看得懂為什麼這一站沒分）",
    uiPr.block.includes("沒有對應的積分倍率"),
    (uiPr.block.match(/層級.{0,30}/) ?? [""])[0]);

  // ── ⑥ 手機寬度與例外 ────────────────────────────────────────────────
  //  ⚠ 回到「三站都結算完」那個資料量最大的狀態再量——policy_required 那個
  //    狀態榜是空的，拿它量寬度等於什麼都沒量。
  await chrome.evaluate(SETUP_CIRCUIT);
  await chrome.evaluate(SETUP_SETTLED);
  //  ⚠ 第一版寫 `chrome.setViewport?.(...)`——那個方法**根本不存在**，
  //    optional call 會靜靜跳過，於是這條在 1280px 下量出「沒有溢出」⇒ 假綠。
  await chrome.send("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  });
  await chrome.reload();
  await new Promise((r) => setTimeout(r, 3500));
  const uiNarrow = await chrome.evaluate(GOTO);
  ck("16) **手機寬度下不橫向溢出**（量滾動容器，不是 body）",
    uiNarrow.width <= 400 && uiNarrow.hasPanel && !uiNarrow.overflow.over,
    `寬 ${uiNarrow.width}px，容器 ${uiNarrow.overflow.sw}/${uiNarrow.overflow.cw}`);
  ck("17) **全程無未捕捉例外**", chrome.pageErrors.length === 0,
    chrome.pageErrors.slice(0, 3).join(" | ") || "(無)");
} finally {
  await chrome.close();
  await dev.stop();
}
console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
