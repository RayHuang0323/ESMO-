#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_ui35_cs_lifecycle.mjs — UI-3.5 驗收
//
//  執行：`node tools/browser_check_ui35_cs_lifecycle.mjs`（自己起 vite／Chrome）。
//
//  ── 這一支在問什麼 ──────────────────────────────────────────────────────
//  UI-3 把「開季／出戰」搬到賽事中心。搬的是**入口**，CS 賽季的生命週期
//  （BO3 續戰、ActiveMatch 恢復、封存後的成績單）走的都是沒被改動的既有程式碼。
//  但那三條的**新起點**是賽事中心，而 UI-3 的 gate 只驗到「出戰簽得出指派單」
//  就停了——賽季根本沒打完。這一支把那三條各走一遍。
//
//  ⚠ 三條都從**賽事中心**進場，不從 CS 賽前頁。這正是要驗的差異。
//
//  §1 BO3 續戰    Hub 出戰 Major BO3 → 打完第一張 → 回到選圖 → series 沒被重置
//  §2 恢復對戰    Hub 出戰 → 進 battle → 重整（等同離開）→ 回得去，且沒有第二個場次
//  §3 封存 → 成績單  跑完整季 → Hub 的 CS 分頁 → 成績單 → Major 對戰表／BO3 比分／換季 CTA
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5323;
const CDP_PORT = 9353;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (chrome, expr, timeoutMs, what) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await chrome.evaluate(`return Boolean(${expr});`)) return true; } catch { /* keep waiting */ }
    await sleep(250);
  }
  throw new Error(`${what} timeout`);
};

/** 乾淨存檔 ＋ 排好 CS 陣容。三節之間共用。 */
const FRESH = `
  ${RESOLVE_APP_MODULES}
  localStorage.removeItem("esmo.profile.v1");
  const st = () => profile.useProfileStore.getState();
  st().startNewGame("standard");
  st().autoFillLineup("cs");
  st().save();
  return { team: st().team?.name ?? null };
`;

/** 從首頁走到賽事中心的 CS 分頁。 */
const GOTO_CS_TAB = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 16; i++) {
    if (document.querySelector('[data-testid="competition-hub-tabs"]')) break;
    const tile = [...document.querySelectorAll("button")].find((b) => b.dataset?.testid === "home-mode-bracket");
    if (tile) { tile.click(); await wait(800); continue; }
    await wait(300);
  }
  const tab = document.querySelector('[data-testid="competition-hub-tab-cs"]');
  if (tab) { tab.click(); await wait(800); }
  const panel = document.querySelector('[data-testid="competition-hub-panel"]');
  return { mode: panel?.dataset?.mode ?? null,
           today: document.querySelector('[data-testid="cs-hub-today"]')?.dataset?.state ?? null };
`;

/** 賽前頁的主按鈕會走 confirm → waiting → 自動進選圖，按到離開賽前頁為止。 */
async function drivePrepToMapSelect(chrome, label) {
  await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')`, 45_000, `${label} CS prep`);
  for (let i = 0; i < 10; i++) {
    if (await chrome.evaluate(`return document.body.innerText.includes("選擇地圖");`)) break;
    await chrome.evaluate(`
      const b = document.querySelector('[data-testid="prep-primary-action"]');
      if (b && !b.disabled) b.click();
      return true;
    `);
    await sleep(1600);
  }
  await waitFor(chrome, `document.body.innerText.includes("選擇地圖")`, 60_000, `${label} map select`);
}

/** 讀選圖頁的 BO3 橫幅（畫面的事實，不是我自己算的）。 */
const readSeriesBanner = (chrome) => chrome.evaluate(`
  const el = document.querySelector('[data-testid="cs-series-banner"]');
  if (!el) return null;
  const t = (el.innerText || "").replace(/\\s+/g, " ").trim();
  const score = t.match(/(\\d+)\\s*:\\s*(\\d+)/);
  const nth = t.match(/第\\s*(\\d+)\\s*\\/\\s*(\\d+)\\s*張/);
  return { text: t, us: score ? +score[1] : null, opp: score ? +score[2] : null,
           map: nth ? +nth[1] : null, maxMaps: nth ? +nth[2] : null };
`);

/**
 * 選圖 → 戰術 → 進 battle。
 *
 * ⚠ 刻意用「單純的同步 evaluate ＋ 外部 sleep 輪詢」，不用把 predicate 內嵌進
 *   頁面的那種 helper。內嵌版本在這條路徑上會讓一次 `Runtime.evaluate` 掛住到
 *   CDP 逾時（實測 14 分鐘）；逐步探針證實同樣的動作用這個寫法每步都是 1–7ms。
 */
const clickWhere = (chrome, finder) => chrome.evaluate(`
  const b = [...document.querySelectorAll("button")].find(${finder});
  if (!b || b.disabled) return { ok: false, disabled: b?.disabled ?? null };
  b.click();
  return { ok: true, text: (b.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 60) };
`);

async function driveToBattle(chrome, label) {
  const pickMap = await clickWhere(chrome,
    `(n) => /^(Dust II|Mirage|Inferno)/.test((n.innerText || "").trim())`);
  if (!pickMap.ok) throw new Error(`${label} 選不到地圖: ${JSON.stringify(pickMap)}`);
  await sleep(900);

  const confirmMap = await clickWhere(chrome, `(n) => (n.innerText || "").includes("確認地圖")`);
  if (!confirmMap.ok) throw new Error(`${label} 確認不了地圖: ${JSON.stringify(confirmMap)}`);
  await sleep(1600);

  const onTactic = await chrome.evaluate(`return document.body.innerText.includes("戰術部署");`);
  if (!onTactic) throw new Error(`${label} 沒有到戰術頁`);

  const pickTactic = await clickWhere(chrome, `(n) => {
    const t = (n.innerText || "").replace(/\\s+/g, " ").trim();
    return !t.includes("返回") && !t.includes("確認") && !t.includes("開始對戰")
      && !t.includes("技術內容") && t.length > 20;
  }`);
  if (!pickTactic.ok) throw new Error(`${label} 選不到戰術: ${JSON.stringify(pickTactic)}`);
  await sleep(900);

  const start = await clickWhere(chrome, `(n) => (n.innerText || "").includes("開始對戰")`);
  if (!start.ok) throw new Error(`${label} 開不了對戰: ${JSON.stringify(start)}`);

  for (let i = 0; i < 24; i++) {
    await sleep(2500);
    const s = await chrome.evaluate(`return !!document.querySelector('[data-testid="cs-match-speed-controls"]');`);
    if (s) return;
  }
  throw new Error(`${label} 等不到對戰畫面`);
}

/** Quick Finish 把這一張地圖推到終局（沿用 cs_completion 走的同一組按鈕）。 */
async function finishMap(chrome, label) {
  await chrome.evaluate(`document.querySelector('[data-testid="quick-finish-match"]')?.click(); return true;`);
  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    const s = await chrome.evaluate(`return {
      seek: !!document.querySelector('[data-testid="cs-quick-finish-terminal-seek"]'),
      done: [...document.querySelectorAll("button")].some((n) =>
        (n.innerText||"").includes("查看賽後戰報") || (n.innerText||"").includes("返回 Dashboard")),
    };`);
    if (s.done) return;
    if (s.seek) {
      await chrome.evaluate(`document.querySelector('[data-testid="cs-quick-finish-terminal-seek"]')?.click(); return true;`);
    }
  }
  throw new Error(`${label} 等不到賽後結算`);
}


/** 讓一個可能卡住主執行緒的動作有上限，而不是拖垮整支 gate。 */
const withDeadline = (p, ms, what) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} 超過 ${ms}ms`)), ms)),
]);

/** 建 CS 賽季並推進到玩家的第一場聯賽賽程（BO1，最快到得了的正式賽程）。 */
const TO_FIRST_LEAGUE_FIXTURE = `
  ${RESOLVE_APP_MODULES}
  const st = () => profile.useProfileStore.getState();
  st().ensureCompetitionSeason("cs");
  let guard = 0;
  while (!st().competitionView("cs").today && guard++ < 120) st().advanceDay(1);
  st().save();
  const v = st().competitionView("cs");
  return { day: st().meta?.days ?? null, today: v.today?.id ?? null };
`;

async function main() {
  console.log("══ UI-3.5：賽事中心成為入口之後，CS Season lifecycle 驗收 ══\n");
  const server = await startDevServer({ port: VITE_PORT });
  const APP = server.url;
  const chrome = await launchChrome({ url: APP, port: CDP_PORT, headless: HEADLESS });

  //  ⚠ 順序刻意是 §2 → §3 → §1。§1 的最後一步（Quick Finish 完成地圖）**會鎖死
  //    頁面主執行緒**（實測 ≥14 分鐘）；主執行緒一鎖，同一個 Chrome 裡後面所有
  //    檢查都跑不了。把它放最後，前兩節才拿得到結果。
  try {
    // ════════════════════════════════════════════════════════════════════
    //  §2 ActiveMatch 恢復
    // ════════════════════════════════════════════════════════════════════
    console.log("── §2 ActiveMatch 恢復（從賽事中心出戰後離開）──");
    await chrome.navigate(APP);
    await chrome.evaluate(FRESH);
    await chrome.reload();
    const fx2 = await chrome.evaluate(TO_FIRST_LEAGUE_FIXTURE);
    ck("2a) 前置：有一場今日聯賽賽程", !!fx2.today, `第 ${fx2.day} 天`);

    await chrome.reload();
    const tab2 = await chrome.evaluate(GOTO_CS_TAB);
    ck("2b) 賽事中心 CS 分頁給出今日出戰 CTA",
      tab2.mode === "cs" && tab2.today === "today", `state=${tab2.today}`);

    const play2 = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      document.querySelector('[data-testid="cs-league-play"]').click();
      await wait(1800);
      const s = profile.useProfileStore.getState();
      return { fixtureId: s.matchmaking?.fixtureAssignment?.origin?.fixtureId ?? null,
               onPrep: !!document.querySelector('[data-testid="prep-primary-action"]') };
    `);
    ck("2c) 出戰落在既有 CS 賽前頁", play2.onPrep, `fixture=${play2.fixtureId}`);

    await drivePrepToMapSelect(chrome, "§2");
    await driveToBattle(chrome, "§2");
    const inBattle = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const s = profile.useProfileStore.getState();
      const v = s.activeMatchView?.() ?? null;
      return { onBattle: !!document.querySelector('[data-testid="cs-match-speed-controls"]'),
               phase: v?.phase ?? null, sessionId: s.matchmaking?.session?.sessionId ?? null,
               fixtureId: s.matchmaking?.fixtureAssignment?.origin?.fixtureId ?? null };
    `);
    ck("2d) 已進到對戰畫面", inBattle.onBattle, `phase=${inBattle.phase}`);

    //  重整＝玩家關掉分頁再回來。存檔是唯一留下來的東西。
    await chrome.reload();
    await sleep(1500);
    const afterReload = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const s = profile.useProfileStore.getState();
      const v = s.activeMatchView?.() ?? null;
      return { sessionId: s.matchmaking?.session?.sessionId ?? null,
               fixtureId: s.matchmaking?.fixtureAssignment?.origin?.fixtureId ?? null,
               restoreable: !!v?.restoreable, mode: v?.mode ?? null, phase: v?.phase ?? null };
    `);
    ck("2e) 重整後場次與賽程都還在（同一個 session／fixture）",
      afterReload.sessionId === inBattle.sessionId && afterReload.fixtureId === inBattle.fixtureId,
      `session ${afterReload.sessionId === inBattle.sessionId ? "同一個" : "換了"}`);
    ck("2f) ActiveMatch 標記為可恢復", afterReload.restoreable,
      `mode=${afterReload.mode} phase=${afterReload.phase}`);

    const tab2b = await chrome.evaluate(GOTO_CS_TAB);
    const resumeUi = await chrome.evaluate(`return {
      resume: !!document.querySelector('[data-testid="cs-league-resume"]'),
      play: !!document.querySelector('[data-testid="cs-league-play"]'),
      state: document.querySelector('[data-testid="cs-hub-today"]')?.dataset?.state ?? null };`);
    ck("2g) 賽事中心改給「返回進行中的對戰」，不再給第二顆出戰",
      resumeUi.resume && !resumeUi.play && resumeUi.state === "live",
      `state=${resumeUi.state} tab=${tab2b.mode}`);

    const resumed = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      document.querySelector('[data-testid="cs-league-resume"]').click();
      await wait(2500);
      const s = profile.useProfileStore.getState();
      const cs = s.competitionByMode?.cs ?? null;
      const launched = (cs?.fixtures ?? []).filter((f) => f.status === "launched").length;
      return { sessionId: s.matchmaking?.session?.sessionId ?? null,
               fixtureId: s.matchmaking?.fixtureAssignment?.origin?.fixtureId ?? null,
               launchedFixtures: launched,
               err: document.querySelector('[data-testid="cs-hub-error"]')?.innerText ?? null,
               head: document.body.innerText.replace(/\\n/g, " | ").slice(0, 90) };
    `);
    ck("2) **恢復得回同一場**（session 與 fixture 都沒換）",
      resumed.sessionId === inBattle.sessionId && resumed.fixtureId === inBattle.fixtureId,
      resumed.err ? "畫面錯誤：" + resumed.err : resumed.head);
    ck("2h) 沒有建立第二個 fixture（launched 狀態只有一場）",
      resumed.launchedFixtures === 1, `${resumed.launchedFixtures} 場 launched`);

    // ════════════════════════════════════════════════════════════════════
    //  §3 封存 → 成績單
    // ════════════════════════════════════════════════════════════════════
    console.log("\n── §3 賽季封存後從賽事中心進成績單 ──");
    await chrome.navigate(APP);
    await chrome.evaluate(FRESH);
    await chrome.reload();
    const sealed = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = () => profile.useProfileStore.getState();
      st().ensureCompetitionSeason("cs");
      //  與既有 lifecycle 驗證器同一手法：玩家場次一律棄權，推到封存。
      let guard = 0;
      while (guard++ < 500) {
        if (st().competitionByMode.cs?.final) break;
        const v = st().competitionView("cs");
        if (v.today) { st().forfeitFixture(v.today.id); continue; }
        const moved = st().advanceDay(1);
        if ((moved.daysAdvanced ?? 0) <= 0 && !st().competitionView("cs").today) break;
      }
      st().save();
      return { final: st().competitionByMode.cs?.final?.schema ?? null,
               phase: st().competitionView("cs").csStage?.phase ?? null };
    `);
    ck("3a) 前置：CS 賽季走得到封存", sealed.final === "SeasonSeal.v1",
      `${sealed.final} · phase=${sealed.phase}`);

    await chrome.reload();
    const tab3 = await chrome.evaluate(GOTO_CS_TAB);
    const entry3 = await chrome.evaluate(`return {
      btn: !!document.querySelector('[data-testid="cs-hub-recap-btn"]'),
      today: !!document.querySelector('[data-testid="cs-hub-today"]'),
      major: !!document.querySelector('[data-testid="cs-hub-my-major"]') };`);
    ck("3b) 封存後 CS 分頁有成績單入口，且不再顯示今日賽程區塊",
      entry3.btn && !entry3.today, `tab=${tab3.mode} major=${entry3.major}`);

    const errsBefore = chrome.pageErrors.length;
    const recap = await chrome.evaluate(`
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      document.querySelector('[data-testid="cs-hub-recap-btn"]').click();
      await wait(1800);
      const t = document.body.innerText;
      //  ⚠ 讀真正的標記，不要猜文案。對戰表每一列的地圖數是各自獨立的元素，
      //    用「N : M」這種同一行的正則會誤判（第一版就這樣紅過）；
      //    換季 CTA 的實際文字是「開始 CS 第 N 賽季」，不是「下一賽季」。
      //  每一列帶著 data-score="a:b" 與 data-done ⇒ 讀標記，不讀排版後的文字。
      const ties = [...document.querySelectorAll('[data-testid="cs-recap-tie"]')]
        .filter((n) => n.dataset.exists === "true" && n.dataset.done === "true")
        .map((n) => n.dataset.score || "");
      return { text: t.replace(/\\n/g, " | ").slice(0, 200),
               bracket: !!document.querySelector('[data-testid="cs-recap-bracket"]'),
               major: !!document.querySelector('[data-testid="cs-recap-major"]'),
               seriesTag: document.querySelector('[data-testid="cs-recap-series-tag"]')?.innerText?.trim() ?? null,
               ties, tieCount: ties.length,
               //  canRoll 不成立時這一頁改顯示原因，兩者都是合法結果 ⇒ 分開回報。
               rollBtn: document.querySelector('[data-testid="cs-recap-roll"]')?.innerText?.replace(/\\s+/g, " ").trim() ?? null,
               rollSection: !!document.querySelector('[data-testid="cs-recap-next-season"]'),
               rollText: document.querySelector('[data-testid="cs-recap-next-season"]')?.innerText?.replace(/\\s+/g, " ").trim() ?? null };
    `);
    ck("3) 成績單打得開，Major 對戰表在", recap.bracket && recap.major,
      `${recap.seriesTag ?? ""}｜${recap.text}`);
    //  BO3：完賽的每一場，勝方一定拿滿 2 張，總地圖數落在 2–3 張之間。
    const bo3Ok = recap.tieCount > 0 && recap.ties.every((v) => {
      const m = /^(\d+):(\d+)$/.exec(v);
      if (!m) return false;
      const a = +m[1], b = +m[2];
      return Math.max(a, b) === 2 && a + b >= 2 && a + b <= 3;
    });
    ck("3c) 完賽的每一場都有 BO3 地圖比分（勝方 2 張、總數 2–3 張）",
      bo3Ok, `${recap.tieCount} 場：${recap.ties.join(" / ")}`);
    ck("3d) 換季區塊在，且給得出 CTA 或說得出不能換的原因",
      recap.rollSection && (!!recap.rollBtn || !!recap.rollText),
      recap.rollBtn ? `CTA：${recap.rollBtn}` : `顯示：${recap.rollText}`);
    ck("3e) 進成績單沒有新的未捕捉例外（不再有 undefined identifier）",
      chrome.pageErrors.length === errsBefore,
      chrome.pageErrors.slice(errsBefore).slice(0, 2).join(" | ") || "(無)");

    const back = await chrome.evaluate(`
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const b = [...document.querySelectorAll("button")].find((n) => /^←/.test((n.innerText||"").trim()));
      if (b) { b.click(); await wait(1400); }
      return { tabs: !!document.querySelector('[data-testid="competition-hub-tabs"]'),
               mode: document.querySelector('[data-testid="competition-hub-panel"]')?.dataset?.mode ?? null };`);
    ck("3f) 成績單返回回到賽事中心（沒有孤兒 route）", back.tabs, `panel=${back.mode}`);

    // ════════════════════════════════════════════════════════════════════
    //  §1 BO3 續戰　⚠ 放最後：最後一步會鎖死頁面主執行緒
    // ════════════════════════════════════════════════════════════════════
    console.log("\n── §1 BO3 續戰（從賽事中心出戰 Major）──");
    await chrome.navigate(APP);
    await chrome.evaluate(FRESH);
    await chrome.reload();
    const toMajor = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = () => profile.useProfileStore.getState();
      st().ensureCompetitionSeason("cs");
      const myId = st().competitionByMode.cs.playerTeamId;
      let guard = 0, wins = 0, errs = [], major = null;
      while (guard++ < 400) {
        const s = st();
        if (s.competitionByMode.cs?.final) break;
        const t = s.competitionView("cs").today;
        if (t) {
          const fmt = t.matchFormat ?? null;
          if (fmt?.series === "bo3" || fmt?.mapsToWin === 2) { major = { id: t.id, fmt }; break; }
          //  ⚠ 狀態機是 scheduled → launched → completed，不能跳。
          const a = s.startFixtureMatch(t.id);
          if (!a.ok) { errs.push("start"); break; }
          const r = st().completeFixtureMatch({ fixtureId: t.id, winner: myId,
            score: { a: t.sideA === myId ? 1 : 0, b: t.sideB === myId ? 1 : 0 }, duration: 1800, seed: 7 });
          if (!r.ok) { errs.push(r.errors?.[0]?.code ?? "?"); break; }
          wins++; continue;
        }
        const moved = s.advanceDay(1);
        if ((moved.daysAdvanced ?? 0) <= 0 && !st().competitionView("cs").today) break;
      }
      st().save();
      return { major, wins, errs: errs.slice(0, 3), day: st().meta?.days ?? null,
               phase: st().competitionView("cs").csStage?.phase ?? null };
    `);
    ck("1a) 前置：玩家打進年度 Major，今天就是 BO3 賽程", !!toMajor.major,
      `${toMajor.wins} 勝 · 第 ${toMajor.day} 天 · phase=${toMajor.phase}`);

    await chrome.reload();
    const tab1 = await chrome.evaluate(GOTO_CS_TAB);
    ck("1b) 賽事中心給出今日 BO3 的出戰 CTA",
      tab1.mode === "cs" && tab1.today === "today", `state=${tab1.today}`);

    const started = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      document.querySelector('[data-testid="cs-league-play"]').click();
      await wait(1800);
      const s = profile.useProfileStore.getState();
      return { assigned: !!s.matchmaking?.fixtureAssignment, room: !!s.matchmaking?.room,
               fixtureId: s.matchmaking?.fixtureAssignment?.origin?.fixtureId ?? null,
               onPrep: !!document.querySelector('[data-testid="prep-primary-action"]') };
    `);
    ck("1c) 出戰簽出指派單與房間，落在既有 CS 賽前頁",
      started.assigned && started.room && started.onPrep, `fixture=${started.fixtureId}`);

    await drivePrepToMapSelect(chrome, "§1");
    const banner1 = await readSeriesBanner(chrome);
    ck("1d) 選圖頁認得這是 BO3，從 0:0 第 1/3 張開始",
      banner1 && banner1.us === 0 && banner1.opp === 0 && banner1.map === 1 && banner1.maxMaps === 3,
      banner1?.text ?? "(沒有 series 橫幅)");

    const ses1 = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const ses = profile.useProfileStore.getState().matchmaking?.session ?? null;
      return ses?.series ? { format: ses.series.format, mapsToWin: ses.series.mapsToWin } : null;
    `);
    ck("1e) series 掛在 MatchSession 上（BO3 / 先拿 2 張）", ses1?.mapsToWin === 2, JSON.stringify(ses1));

    await driveToBattle(chrome, "§1");
    ck("1f) 第一張地圖進得了對戰畫面", true);

    //  ⚠ 已知會卡：Quick Finish 在**正式 fixture 的 BO3** 上會鎖死頁面主執行緒
    //    （practice 賽同一顆按鈕 88ms）。給上限，不讓它拖垮整支。
    let completed = false, blockedReason = "";
    try {
      await withDeadline(finishMap(chrome, "§1"), 150_000, "Quick Finish 完成第一張地圖");
      completed = true;
    } catch (e) { blockedReason = e.message; }
    ck("1) 打完第一張地圖後回到選圖流程、series 未重置", completed,
      completed ? "" : `BLOCKED：${blockedReason}`);

    if (completed) {
      const banner2 = await readSeriesBanner(chrome);
      ck("1g) series ledger 沒被重置（1 張已打完、進入第 2/3 張）",
        banner2 && (banner2.us + banner2.opp) === 1 && banner2.map === 2, banner2?.text ?? "-");
    }
  } finally {
    try { await chrome.close(); } catch { /* 主執行緒可能已鎖死 */ }
    await server.stop();
  }
  console.log(`\n${pass}/${pass + fail} 通過`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\n💥 ${e.message}`); process.exit(1); });
