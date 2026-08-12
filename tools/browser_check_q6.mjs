#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_q6.mjs — Q6 瀏覽器實測（**完全自動化**）
//
//  ── 為什麼自己寫一支 ──────────────────────────────────────────────────────
//  之前每一輪的瀏覽器驗收都是驅動 Ray 的日常 Chrome：要備份他的存檔、
//  要請他把分頁點到前景（背景分頁被節流時，跑一整季要三十分鐘）。
//  這一支改成：**自己開一個獨立的 Chrome**（獨立 user-data-dir、獨立 port、
//  獨立 profile），用 CDP 驅動，並關掉背景節流 ⇒ 不碰日常瀏覽器、不需要人。
//
//  依賴：只有 Node 內建（`fetch` + `WebSocket`，Node 22+）與系統上的 Chrome。
//  **沒有裝 puppeteer／playwright**——不為了一支驗證腳本增加相依。
//
//  執行：`node tools/browser_check_q6.mjs`（會自己起 vite、自己開 Chrome、自己收）。
// ============================================================================
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const VITE_PORT = 5311;
const CDP_PORT = 9333;
const BASE = `http://localhost:${VITE_PORT}/ESMO-/`;

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

// ── CDP：最小驅動（只用到 Runtime.evaluate 與 Page.navigate）──────────────
class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiting = new Map(); }
  static async attach(port) {
    for (let i = 0; i < 60; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
        if (page) {
          const ws = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
          const c = new Cdp(ws);
          ws.onmessage = (ev) => {
            const m = JSON.parse(ev.data);
            if (m.id && c.waiting.has(m.id)) { c.waiting.get(m.id)(m); c.waiting.delete(m.id); }
          };
          return c;
        }
      } catch { /* Chrome 還沒起來 */ }
      await sleep(500);
    }
    throw new Error("CDP 連不上");
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res) => { this.waiting.set(id, res); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expr) {
    const r = await this.send("Runtime.evaluate", {
      expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true,
    });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
    return r.result?.result?.value;
  }
  async goto(url) { await this.send("Page.navigate", { url }); await sleep(1200); }
}

const procs = [];
const cleanup = () => { for (const p of procs) { try { p.kill(); } catch {} } };
process.on("exit", cleanup);

let userDataDir = null;
try {
  // ── ① 起獨立 vite ────────────────────────────────────────────────────
  console.log(`\n▶ 起 vite（port ${VITE_PORT}）`);
  procs.push(spawn("npx", ["vite", "--port", String(VITE_PORT), "--strictPort"], { shell: true, stdio: "ignore" }));
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(500); }

  // ── ② 起獨立 Chrome（獨立 profile、關掉背景節流）─────────────────────
  const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!chrome) throw new Error(`找不到 Chrome：${CHROME_CANDIDATES.join(" / ")}`);
  userDataDir = mkdtempSync(join(tmpdir(), "esmo-q6-chrome-"));
  console.log(`▶ 起獨立 Chrome（profile: ${userDataDir}）`);
  procs.push(spawn(chrome, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    "--headless=new", "--no-first-run", "--no-default-browser-check",
    //  ⚠ 這三個是重點：沒有它們，背景視窗的計時器會被節流到 1/秒，
    //    跑一整季要等三十分鐘（前幾輪就是這樣才需要人工把分頁點到前景）。
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--window-size=1280,900", BASE,
  ], { stdio: "ignore" }));

  const cdp = await Cdp.attach(CDP_PORT);
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.goto(BASE);
  await sleep(6000);

  // ── ③ 拿到 store（dev server 供應原始模組 ⇒ 同一個單例）────────────
  await cdp.eval(`const m = await import('/ESMO-/src/platform/profileStore.js'); window.__S = m.useProfileStore; return 1;`);
  const boot = await cdp.eval(`const s = __S.getState(); return { team: s.team?.name, keys: Object.keys(localStorage).length };`);
  ck("0a) 獨立 Chrome ＋ 獨立 profile 起得來", !!boot?.team, `${boot.team}／localStorage ${boot.keys} 筆`);

  // ── ④ 跑一整季（全自動，不需要人）────────────────────────────────
  console.log("\n▶ 跑一整季（含季後賽）");
  await cdp.eval(`
    const st = () => __S.getState();
    st().ensureCompetitionSeason();
    const myId = st().competition.playerTeamId;
    //  玩家場次一律「打贏」——要讓玩家進季後賽才驗得到玩家自己打季後賽
    for (let i = 0; i < 400; i++) {
      const v = st().competitionView();
      if (v.final) break;
      const fx = v.today;
      if (fx) {
        st().startFixtureMatch(fx.id, Date.now());
        const a = fx.sideA === myId;
        st().completeFixtureMatch({ fixtureId: fx.id, winner: myId,
          score: a ? { a: 24, b: 17 } : { a: 17, b: 24 }, duration: 1832,
          seed: st().matchmaking.session?.seed ?? 4242 });
        continue;
      }
      const before = st().meta.days;
      st().advanceDay(7);
      if (st().meta.days === before) break;
    }
    return 1;
  `);

  const r = await cdp.eval(`
    const st = () => __S.getState();
    const v = st().competitionView();
    const c = st().competition;
    return {
      sealed: !!v.final, season: v.season,
      playoffExists: !!v.playoff, playoffDone: v.playoff?.done,
      bracket: (v.playoff?.bracket ?? []).map(m => [m.key, m.nameA, m.nameB, m.winnerName]),
      qualified: (v.playoff?.qualified ?? []).map(q => q.seed + '.' + q.name),
      champion: v.final?.championTeamId, rankSource: v.final?.rankSource,
      playerRank: v.final?.playerRank, playerRegularRank: v.final?.playerRegularRank,
      top4: (v.final?.rows ?? []).slice(0,4).map(x => x.name),
      regularKept: (v.final?.rows ?? []).every(x => Number.isInteger(x.regularRank)),
      regularFixtures: c.fixtures.filter(f => f.stageId === c.stage.id).length,
      playoffFixtures: c.fixtures.filter(f => f.stageId === c.playoff?.stage?.id).length,
      awardRank: v.award?.rank, awardAmount: v.award?.amount,
    };
  `);
  ck("1a) 賽季走完並封存", r.sealed === true, `我方最終第 ${r.playerRank} 名／常規賽第 ${r.playerRegularRank} 名`);
  ck("1b) 季後賽被排出來且已結束", r.playoffExists && r.playoffDone === true);
  ck("1c) 常規賽 56 場、季後賽 4 場", r.regularFixtures === 56 && r.playoffFixtures === 4,
    `${r.regularFixtures} / ${r.playoffFixtures}`);
  ck("1d) 晉級名單是常規賽前四", (r.qualified ?? []).length === 4, (r.qualified ?? []).join("　"));
  ck("1e) 四場對戰都有勝方", (r.bracket ?? []).length === 4 && r.bracket.every((m) => !!m[3]));
  ck("1f) 最終名次來源標記為季後賽", r.rankSource === "playoff");
  ck("1g) 每一列都留著常規賽名次", r.regularKept === true);
  ck("1h) 名次獎金依最終名次發", r.awardRank === r.playerRank, `第 ${r.awardRank} 名 $${r.awardAmount}萬`);
  console.log(`   對戰表：${r.bracket.map((m) => `${m[0]} ${m[1]} vs ${m[2]} → ${m[3]}`).join("；")}`);

  // ── ⑤ 畫面真的看得到 ────────────────────────────────────────────────
  //  ⚠ 導航要**確認到站**再讀：第一版只是「點一下、等 1.5 秒、讀畫面」，
  //    結果讀到的是主畫面（點沒點到分不出來）。改成重試到畫面出現「聯賽」為止。
  const ui = await cdp.eval(`
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const onCompetition = () => /聯賽/.test(document.body.innerText) && /積分榜|最終名次/.test(document.body.innerText);
    for (let i = 0; i < 12 && !onCompetition(); i++) {
      const tile = [...document.querySelectorAll('button')].find(b => /🏆/.test(b.innerText) && /賽事/.test(b.innerText));
      if (tile) { tile.click(); await wait(1200); continue; }
      const back = [...document.querySelectorAll('button')].find(x => /^←$/.test(x.innerText.trim()) || x.innerText.trim() === '');
      if (back) { back.click(); await wait(900); }
      else await wait(500);
    }
    return document.body.innerText.replace(/\\n/g,'|').slice(0, 520);
  `);
  ck("2a) 賽事頁看得到季後賽區塊", /季後賽 PLAYOFFS/.test(ui));
  ck("2b) 看得到四場對戰（含季軍戰與決賽）", /準決賽 ①/.test(ui) && /季軍戰/.test(ui) && /決賽/.test(ui));
  ck("2c) 看得到最終名次與冠軍", /最終名次 FINAL STANDINGS/.test(ui) && /🏆 冠軍/.test(ui));
  ck("2d) 同時看得到常規賽名次（不是只留一個數字）", /常規賽名次/.test(ui));
  console.log(`   畫面：${ui.slice(0, 200)}`);

  // ── ⑥ Q5 換季仍然正常 ───────────────────────────────────────────────
  const roll = await cdp.eval(`
    const st = () => __S.getState();
    const before = JSON.stringify(st().competitionView().final);
    const B = (re) => [...document.querySelectorAll('button')].find(b => re.test(b.innerText));
    const btn = B(/開始第 2 賽季/);
    if (btn) { btn.click(); await new Promise(r=>setTimeout(r,1500)); }
    const v = st().competitionView();
    return { clicked: !!btn, season: v.season, histLen: v.history.length,
      s1Kept: JSON.stringify(v.history[0]) === before, newPlayoff: !!v.playoff,
      outcomes: (st().competition.outcomes ?? []).length };
  `);
  ck("3a) 賽事頁按得到「開始第 2 賽季」", roll.clicked === true);
  ck("3b) 換季成功且 S1 進歷史", roll.season === 2 && roll.histLen === 1);
  ck("3c) **S1 的最終名次（含季後賽結果）逐字保留**", roll.s1Kept === true);
  ck("3d) 新賽季沒有季後賽、賽果歸零", roll.newPlayoff === false && roll.outcomes === 0);

  // ── ⑦ reload 後不變 ─────────────────────────────────────────────────
  await cdp.goto(BASE);
  await sleep(6000);
  const after = await cdp.eval(`
    const m = await import('/ESMO-/src/platform/profileStore.js');
    const v = m.useProfileStore.getState().competitionView();
    return { season: v.season, histLen: v.history.length, champion: v.history[0]?.championTeamId,
      rankSource: v.history[0]?.rankSource };
  `);
  ck("4a) reload 後仍是 S2", after.season === 2);
  ck("4b) reload 後歷史仍在、冠軍與名次來源都留著",
    after.histLen === 1 && after.champion === r.champion && after.rankSource === "playoff");

  const errs = await cdp.eval(`return (window.__errors ?? []).length;`);
  ck("4c) 無 JS 例外", (errs ?? 0) === 0);
} catch (e) {
  fail++;
  console.log(`\n❌ 執行失敗：${e.message}`);
} finally {
  cleanup();
  if (userDataDir) { try { rmSync(userDataDir, { recursive: true, force: true }); } catch {} }
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail ? 1 : 0);
