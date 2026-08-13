#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_q6_prod.mjs — Q6 正式站 smoke test（**完全自動化**）
//
//  與 `browser_check_q6.mjs` 的差別只有兩點：
//    ① 打的是**正式站**（build 產物）⇒ `import('/ESMO-/src/...')` 拿不到原始模組，
//       所以**全程只能走 UI 與 localStorage**。
//    ② 因為用的是**獨立 Chrome ＋ 獨立 user-data-dir**，正式站那個 origin 在這個
//       瀏覽器裡是**全新的 profile** ⇒ **完全不會碰到 Ray 的正式站存檔**。
//       （前幾輪要備份／還原他的存檔，就是因為驅動的是他的日常 Chrome。）
//
//  用法：`node tools/browser_check_q6_prod.mjs [url]`
// ============================================================================
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL_ = process.argv[2] ?? "https://rayhuang0323.github.io/ESMO-/";
const CDP_PORT = 9337;
const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { if (ok) { pass++; console.log(`✅ ${n}${d ? "　" + d : ""}`); } else { fail++; console.log(`❌ ${n}${d ? "　" + d : ""}`); } };

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
          ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && c.waiting.has(m.id)) { c.waiting.get(m.id)(m); c.waiting.delete(m.id); } };
          return c;
        }
      } catch {}
      await sleep(500);
    }
    throw new Error("CDP 連不上");
  }
  send(method, params = {}) { const id = ++this.id; return new Promise((res) => { this.waiting.set(id, res); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expr) {
    const r = await this.send("Runtime.evaluate", { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
    return r.result?.result?.value;
  }
  async goto(url) { await this.send("Page.navigate", { url }); await sleep(1500); }
}

const procs = [];
process.on("exit", () => { for (const p of procs) { try { p.kill(); } catch {} } });
let dir = null;

try {
  const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!chrome) throw new Error("找不到 Chrome");
  dir = mkdtempSync(join(tmpdir(), "esmo-q6-prod-"));
  console.log(`▶ 起獨立 Chrome（profile: ${dir}）→ ${URL_}`);
  procs.push(spawn(chrome, [
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${dir}`,
    "--headless=new", "--no-first-run", "--no-default-browser-check",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows", "--window-size=1280,900", URL_,
  ], { stdio: "ignore" }));

  const cdp = await Cdp.attach(CDP_PORT);
  await cdp.send("Runtime.enable"); await cdp.send("Page.enable");
  await cdp.goto(URL_); await sleep(8000);

  const boot = await cdp.eval(`return { title: document.title, keys: Object.keys(localStorage).length, team: (document.body.innerText.match(/德國海豹|[^\\n]*戰隊/)||[''])[0] };`);
  ck("0a) 正式站在獨立 profile 開得起來", /esmo/i.test(boot.title ?? ""), `localStorage ${boot.keys} 筆（全新 profile ⇒ 沒碰到既有存檔）`);

  //  ── 走 UI 跑完一整季（玩家場次一律棄權；前四名會是 AI）──────────────
  console.log("▶ 走 UI 跑完一整季（含季後賽）");
  await cdp.eval(`
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const B = (re) => [...document.querySelectorAll('button')].find(b => re.test(b.innerText));
    const toComp = async () => {
      for (let i=0;i<10;i++){
        if (/聯賽/.test(document.body.innerText) && /積分榜|最終名次/.test(document.body.innerText)) return true;
        const tile = [...document.querySelectorAll('button')].find(b => /🏆/.test(b.innerText) && /賽事/.test(b.innerText));
        if (tile) { tile.click(); await wait(1000); continue; }
        const back = [...document.querySelectorAll('button')].find(x => /^←$/.test(x.innerText.trim()) || x.innerText.trim()==='');
        if (back) { back.click(); await wait(800); } else await wait(400);
      }
      return false;
    };
    const home = async () => { for (let i=0;i<4;i++){ const b=[...document.querySelectorAll('button')].find(x=>/^←$/.test(x.innerText.trim())||x.innerText.trim()===''); if(!b)break; b.click(); await wait(700); if(/收件匣/.test(document.body.innerText))break; } };
    for (let i = 0; i < 400; i++) {
      await toComp();
      if (/最終名次/.test(document.body.innerText)) break;
      if (B(/^棄權$/)) { B(/^棄權$/).click(); await wait(500); B(/確定棄權/)?.click(); await wait(900); continue; }
      await home();
      B(/訓練中心/)?.click(); await wait(900);
      if (!/訓練進行中/.test(document.body.innerText)) {
        const card = [...document.querySelectorAll('button')].find(b => /體力/.test(b.innerText) && /精神飽滿|正常/.test(b.innerText));
        if (card) { card.click(); await wait(500); const c=[...document.querySelectorAll('button,div')].filter(e=>/操作強化/.test(e.innerText)&&e.innerText.length<60).pop(); if(c){c.click(); await wait(600);} }
      }
      for (let k=0;k<3;k++){ const a=B(/推進訓練日/); if(!a)break; a.click(); await wait(900); }
    }
    return 1;
  `);

  const raw = await cdp.eval(`
    const p = JSON.parse(localStorage.getItem('esmo.profile.v1') || '{}');
    const c = p.competition || {};
    const f = c.final || null;
    //  Q7a-3b：v2 之後季後賽住在 competitions 條目裡，頂層沒有鏡像。
    //  正式站是 minified bundle，沒有模組可以 import，所以這裡直接讀持久化
    //  形狀（v2 優先、v1 回退）——這是 prod 的限制，不是另開一套讀法。
    const po = (Object.values(c.competitions || {})[0]?.playoff) || c.playoff || null;
    const pf = (c.fixtures||[]).filter(x => x.stageId === po?.stage?.id);
    return {
      ui: document.body.innerText.replace(/\\n/g,'|').slice(0, 460),
      qualified: (po?.qualification?.qualified||[]).map(q => q.seed + '.' + q.name),
      playoffFixtures: pf.length,
      playoffKeys: pf.map(x => x.playoffKey).sort(),
      allPlayoffDone: pf.length===4 && pf.every(x => x.status==='completed' || x.status==='forfeited'),
      rankSource: f?.rankSource, champion: f?.championTeamId,
      top4: (f?.rows||[]).slice(0,4).map(r => r.name),
      regularRankKept: (f?.rows||[]).every(r => Number.isInteger(r.regularRank)),
      regularOrderKept: (f?.rows||[]).slice(4).every((r,i,a) => i===0 || a[i-1].regularRank < r.regularRank),
      playerRank: f?.playerRank, playerRegularRank: f?.playerRegularRank,
    };
  `);
  ck("1a) 常規賽結束後產生 Top 4 晉級", (raw.qualified||[]).length === 4, (raw.qualified||[]).join("　"));
  ck("1b) 季後賽 4 場完整產生", raw.playoffFixtures === 4 && raw.playoffKeys.join(",") === "bronze,final,sf1,sf2", raw.playoffKeys.join(","));
  ck("1c) 4 場全部收尾", raw.allPlayoffDone === true);
  ck("1d) 季後賽區塊正常顯示", /季後賽 PLAYOFFS/.test(raw.ui) && /準決賽 ①/.test(raw.ui) && /季軍戰/.test(raw.ui) && /決賽/.test(raw.ui));
  ck("1e) FinalStandings 前四由季後賽決定", raw.rankSource === "playoff", `冠軍 ${raw.top4?.[0]}`);
  ck("1f) **regularRank 仍保留**", raw.regularRankKept === true, `我方最終第 ${raw.playerRank} 名／常規賽第 ${raw.playerRegularRank} 名`);
  ck("1g) 5–8 名維持常規賽順序", raw.regularOrderKept === true);
  console.log(`   畫面：${(raw.ui||"").slice(0, 220)}`);

  //  ── Q5 換季後歷史仍保留季後賽結果 ──────────────────────────────────
  const roll = await cdp.eval(`
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const B = (re) => [...document.querySelectorAll('button')].find(b => re.test(b.innerText));
    const before = JSON.parse(localStorage.getItem('esmo.profile.v1')||'{}').competition?.final || null;
    const btn = B(/開始第 2 賽季/);
    if (btn) { btn.click(); await wait(1600); }
    const p = JSON.parse(localStorage.getItem('esmo.profile.v1')||'{}');
    const h = (p.competitionHistory||[])[0] || null;
    return { clicked: !!btn, season: p.competition?.season, histLen: (p.competitionHistory||[]).length,
      kept: JSON.stringify(h) === JSON.stringify(before),
      histRankSource: h?.rankSource, histChampion: h?.championTeamId,
      histRegularRankKept: (h?.rows||[]).every(r => Number.isInteger(r.regularRank)),
      newSeasonClean: (p.competition?.outcomes||[]).length === 0 && !p.competition?.playoff };
  `);
  ck("2a) 賽事頁按得到「開始第 2 賽季」", roll.clicked === true);
  ck("2b) 換季成功（S2）且 S1 進歷史", roll.season === 2 && roll.histLen === 1);
  ck("2c) **歷史裡的 S1 連季後賽結果一起保留**",
    roll.kept === true && roll.histRankSource === "playoff" && roll.histChampion === raw.champion);
  ck("2d) 歷史裡的 regularRank 也還在", roll.histRegularRankKept === true);
  ck("2e) 新賽季乾淨（無賽果、無季後賽）", roll.newSeasonClean === true);

  //  ── reload ────────────────────────────────────────────────────────
  await cdp.goto(URL_); await sleep(7000);
  const after = await cdp.eval(`
    const p = JSON.parse(localStorage.getItem('esmo.profile.v1')||'{}');
    return { season: p.competition?.season, histLen: (p.competitionHistory||[]).length,
      champion: (p.competitionHistory||[])[0]?.championTeamId };
  `);
  ck("3a) reload 後仍是 S2、歷史與冠軍都在",
    after.season === 2 && after.histLen === 1 && after.champion === raw.champion);
} catch (e) {
  fail++; console.log(`\n❌ 執行失敗：${e.message}`);
} finally {
  for (const p of procs) { try { p.kill(); } catch {} }
  if (dir) { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail ? 1 : 0);
