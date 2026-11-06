#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_bp9_slim_p0b.mjs — BP-9 P0-B：真 Chrome 的存檔整理與恢復
//
//  執行：先 build，再
//    node tools/browser_check_bp9_slim_p0b.mjs --case=<slim-cs|slim-300> --checkpoint=<W1 checkpoint> --out=<json>
//
//  ── 各 case 驗什麼（Owner 2026-11-06 必要驗收）─────────────────────────
//  slim-cs   第 228 天：真 CS 自然打到超限 → 畫面入口整理（取消一次、下載備份、勾選、開始）
//            → 冷啟動驗證 → 「返回進行中的對戰」**真的打到結算**且只入帳一次（Owner 條件 3）
//            → MOBA 與 CS 賽程照常完成 → 常駐入口匯出 → 改過的備份被拒 → 還原整理前的備份，逐位元相同
//  slim-300  W1 第 300 天：Chrome 裝不下原樣，只縮最舊 Season timeline 到剛好放得下（報告照實寫）
//            → 真比賽打到超限 → 整理 → 卡住的那場重打只入帳一次 → MOBA 與 CS 賽程照常完成
//
//  ⚠⚠ 超限都是真比賽自然累積出來的，不注入。checkpoint 之前的進度是 W1 Node 真模擬，報告會標出來。
//  ⚠⚠ 共用的導航函式與 browser_check_bp9_commit_p0a 相同（逐字複製），兩支要一起維護。
//  chrome.evaluate 字串裡不能有反引號。導航用 testid 或從程式碼讀到的字串。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { runGate, finishGate, killProcessTree } from "./browser/harness.mjs";
import { clickFpsDNative } from "./browser/fpsReplayUiProbe.mjs";

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const CASE = arg("case");
const CHECKPOINT = arg("checkpoint");
const OUT = arg("out");
//  --url=https://rayhuang0323.github.io/ESMO-/ 打正式站。Chrome 每次都是全新的 user-data-dir，碰不到真實玩家的存檔。
const EXTERNAL = arg("url");
const DIAG_NO_MOBA_ROLL = process.argv.includes("--diag-no-moba-roll");
if (!CASE || !CHECKPOINT || (!EXTERNAL && !fs.existsSync("dist/index.html"))) { console.error("需要 --case、--checkpoint，且要先 build（或給 --url）"); process.exit(2); }
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.once("error", rej); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); }); });
const port = EXTERNAL ? null : await freePort();
const preview = EXTERNAL ? null : spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "ignore" });
const url = EXTERNAL ?? `http://127.0.0.1:${port}/ESMO-/`;
for (let i = 0; i < (EXTERNAL ? 0 : 120); i++) { try { if ((await fetch(url)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }

const J = (raw) => { const s = String(raw); for (const t of [s, s.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
const tid = (id) => "[data-testid=\"" + id + "\"]";
//  ⚠ Review m4：診斷旗標的結果要看得出來不是正式 gate（報告欄位＋結果名稱都標出來）。
const report = { case: CASE, url, checkpoint: CHECKPOINT ? path.basename(CHECKPOINT) : null, diagNoMobaRoll: DIAG_NO_MOBA_ROLL, nonUi: [], steps: [], findings: [] };
const save = () => { if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 1)); };

const result = await runGate({
  name: `BP-9 P0-B ${CASE}${DIAG_NO_MOBA_ROLL ? "（DIAG-ONLY：--diag-no-moba-roll，不算 gate）" : ""}`,
  externalUrl: url,
  timeoutMs: 3300000,
  async run({ chrome, ck, sleep }) {
    const ev = async (body) => J(await chrome.evaluate(body));
    const has = (id) => ev("return JSON.stringify(!!document.querySelector('" + tid(id) + "'));");
    const waitFor = async (expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev("return JSON.stringify(!!(" + expr + "));")) return true; await sleep(800); } return false; };
    const waitId = (id, ms = 30000) => waitFor("document.querySelector('" + tid(id) + "')", ms);
    const click = (id) => ev("const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};const el=[...document.querySelectorAll('" + tid(id) + "')].find(vis);if(el)el.click();return JSON.stringify(!!el);");
    const clickText = (s) => ev("const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};const el=[...document.querySelectorAll('button')].filter(vis).find((b)=>(b.innerText||'').includes(" + JSON.stringify(s) + "));if(el)el.click();return JSON.stringify(!!el);");
    const text = (id) => ev("const e=document.querySelector('" + tid(id) + "');return JSON.stringify(e?e.innerText.replace(/\\s+/g,' ').slice(0,300):null);");
    chrome.on("Page.javascriptDialogOpening", () => { chrome.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {}); });

    const disk = () => ev(`
      const r=localStorage.getItem('esmo.profile.v1');let total=0;for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);total+=k.length+localStorage.getItem(k).length;}
      const p=r?JSON.parse(r):{};const me=p.team&&p.team.id;
      const launched=(m)=>{const s=p.competitionByMode&&p.competitionByMode[m];return s&&s.fixtures?s.fixtures.filter((f)=>(f.sideA===me||f.sideB===me)&&f.status==='launched').map((f)=>f.id):[];};
      const hp=JSON.parse(localStorage.getItem('esmo.heroProgress.v2')||'{}').progress||{};let heroGames=0;for(const k of Object.keys(hp))heroGames+=(hp[k]&&hp[k].mastery&&hp[k].mastery.games)||0;
      const sh=JSON.parse(localStorage.getItem('esmo.season.v1')||'{}');const hist=sh.history||[];
      const j=localStorage.getItem('esmo.commit.journal.v1');const a=localStorage.getItem('esmo.commit.alert.v1');
      return JSON.stringify({total,day:p.meta&&p.meta.days,funds:p.finance&&p.finance.funds,tx:Object.keys(p.processedMatchTransactions||{}).length,csHistory:(p.csHistory||[]).length,heroGames,seasonLen:hist.length,seasonCommit:hist.slice(-1).map((x)=>x.commitKey||null)[0]||null,launchedMoba:launched('moba'),launchedCs:launched('cs'),sessionState:p.matchmaking&&p.matchmaking.session&&p.matchmaking.session.state,journal:j?JSON.parse(j).state:null,alert:a?JSON.parse(a).kind:null,alertSession:(sessionStorage.getItem('esmo.commit.alert.v1')?JSON.parse(sessionStorage.getItem('esmo.commit.alert.v1')).kind:null),audit:localStorage.getItem('esmo.commit.audit.v1'),corrupt:Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).filter((k)=>k.endsWith('.corrupt'))});`);
    const notice = async () => ({ on: await has("save-status-notice"), message: await text("save-status-message"), retry: await has("save-status-retry"), kind: await ev("const e=document.querySelector('" + tid("save-status-notice") + "');return JSON.stringify(e?e.dataset.alertKind||null:null);") });
    const step = async (name, extra = {}) => { const row = { name, disk: await disk(), notice: await notice(), ...extra }; report.steps.push(row); save(); console.log(`STEP ${name} 第 ${row.disk?.day} 天 tx ${row.disk?.tx} 資金 ${row.disk?.funds} 熟練 ${row.disk?.heroGames} Season ${row.disk?.seasonLen} CS ${row.disk?.csHistory} 總量 ${row.disk?.total} 日誌 ${row.disk?.journal}${row.notice.on ? " ⚠ " + row.notice.message : ""}`); return row; };
    const errors = () => ({ page: chrome.pageErrors.slice(0, 6).map((l) => String(l).slice(0, 240)), console: chrome.consoleLines.filter((l) => l.startsWith("[error]")).slice(0, 10).map((l) => l.slice(0, 240)) });
    const setWidth = async (w, h, mob) => { await chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mob ? 2 : 1, mobile: mob }); await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: mob, maxTouchPoints: mob ? 5 : 1 }); };
    //  Owner（BP-9 F5）：頂到上限時要說是暫時保護；P0-B 起指向「整理存檔」；不得叫玩家清資料、開新局或去按不存在的棄權。
    const fullText = async (label) => {
      const t = await ev("const e=document.querySelector('" + tid("save-status-notice") + "');return JSON.stringify(e?e.innerText:'');");
      report.findings.push({ kind: "full_text", label, text: t });
      ck(`${label}：提示說存檔空間已滿、存檔完好`, /存檔空間已滿/.test(t) && /存檔完好/.test(t), t);
      //  BP-9 P0-B：恢復的方法從「等下一版」改成遊戲內的「整理存檔」（先備份）。還沒整理的存檔一定要指向它。
      ck(`${label}：提示說是暫時的、整理存檔就能恢復`, /整理存檔/.test(t) && /恢復/.test(t) && /備份/.test(t), t);
      ck(`${label}：提示不叫玩家清資料或開新局`, !/請(先)?清除|請開新局|重新開局吧/.test(t) && /不要清除/.test(t), t);
    };
    const overflow = () => ev("return JSON.stringify(Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth);");
    const home = async () => { await chrome.navigate(url); await waitId("home-mode-moba", 120000); await sleep(1000); };
    const loadCheckpoint = async () => {
      const c = JSON.parse(fs.readFileSync(CHECKPOINT, "utf8"));
      report.nonUi.push({ file: path.basename(CHECKPOINT), day: c.day, why: "前面的進度是 W1 Node 真模擬，不是 UI。之後每一場都是真 UI" });
      await chrome.navigate(url); await sleep(1200);
      const r = await ev("localStorage.clear();sessionStorage.clear();const d=JSON.parse(" + JSON.stringify(JSON.stringify(c.storage)) + ");const out={ok:true,failed:null};for(const k of Object.keys(d)){try{localStorage.setItem(k,d[k]);}catch(e){out.ok=false;out.failed=k+':'+e.name;break;}}return JSON.stringify(out);");
      if (!r?.ok) throw new Error(`checkpoint 灌不進去：${r?.failed}`);
      await home();
      return c;
    };
    const toHub = async () => { await click("home-mode-bracket"); await waitId("competition-hub-tabs", 30000); await sleep(700); };
    const toTab = async (mode) => { await click(`competition-hub-tab-${mode}`); await sleep(900); };
    //  頁面裡的故障注入。重新載入就消失，跟真的重新整理一樣。
    const faultKeys = (keys) => ev("const K=" + JSON.stringify(keys) + ";if(!window.__origSet)window.__origSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===localStorage&&K.includes(k)){throw new DOMException('injected','QuotaExceededError');}return window.__origSet.call(this,k,v);};return JSON.stringify(true);");
    const faultOff = () => ev("if(window.__origSet)Storage.prototype.setItem=window.__origSet;return JSON.stringify(true);");

    const prepLoop = async (until) => {
      const pressed = new Set();
      for (let i = 0; i < 90; i++) {
        if (await has(until)) return [...pressed];
        if (await ev("const b=document.querySelector('" + tid("matchmaking-enter-banpick") + "');return JSON.stringify(!!b&&!b.disabled);")) { await click("matchmaking-enter-banpick"); await sleep(800); continue; }
        const a = await ev("const b=document.querySelector('" + tid("prep-primary-action") + "');return JSON.stringify({a:b?b.dataset.action:null,d:b?b.disabled:true});");
        if (a?.a === "blocked") { await clickText("自動填入"); await sleep(700); continue; }
        if (a?.a && !a.d && !pressed.has(a.a)) { pressed.add(a.a); await click("prep-primary-action"); }
        await sleep(1000);
      }
      return [...pressed];
    };
    const ended = "[...document.querySelectorAll('button')].some((b)=>/觀看重播|無法重播/.test(b.innerText||''))||[...document.querySelectorAll('span')].some((s)=>/無法重播/.test(s.innerText||''))";
    //  從目前畫面把這場 MOBA 打到結算。beforeFinish 在按快速完成之前執行（用來裝故障）。
    const finishMoba = async (beforeFinish) => {
      const onTactic = () => ev("return JSON.stringify([...document.querySelectorAll('button')].some((b)=>(b.innerText||'').includes('開始載入')));");
      if (!(await onTactic())) await prepLoop("hero-grid-scroll");
      if (await onTactic()) {
        await clickText("開始載入");
      } else {
        if (!(await waitId("hero-grid-scroll", 90000))) return { ok: false, why: "沒有進 Ban/Pick" };
        for (let i = 0; i < 80; i++) { if (await ev("const b=document.querySelector('" + tid("confirm-draft") + "');return JSON.stringify(!!b&&!b.disabled);")) break; await click("hero-choose"); await sleep(900); }
        await click("confirm-draft");
        if (!(await waitFor("[...document.querySelectorAll('button')].some((b)=>(b.innerText||'').includes('開始載入'))", 60000))) return { ok: false, why: "沒有進戰術頁" };
        await clickText("開始載入");
      }
      if (!(await waitId("battle-hud", 300000))) return { ok: false, why: "沒有進對戰" };
      await sleep(2500);
      await ev("window.confirm=()=>true;return JSON.stringify(1);");
      if (beforeFinish) await beforeFinish();
      await click("quick-finish-match");
      if (!(await waitFor(ended, 360000))) return { ok: false, why: "沒有到結算" };
      await sleep(2500);
      return { ok: true };
    };
    const hasMobaFixture = () => ev("return JSON.stringify([...document.querySelectorAll('" + tid("competition-hub-panel") + " button')].some((b)=>(b.innerText||'').includes('出賽')));");
    const playCsMapToResult = async () => {
      await prepLoop("cs-map-confirm");
      if (!(await waitId("cs-map-confirm", 90000))) return { ok: false, why: "沒有進選圖" };
      for (let i = 0; i < 14; i++) {
        if (await ev("const b=document.querySelector('" + tid("cs-map-confirm") + "');return JSON.stringify(!!b&&!b.disabled);")) break;
        await ev("const b=[...document.querySelectorAll('button')].find((x)=>!x.disabled&&/^(Dust II|Mirage|Inferno)/.test((x.innerText||'').trim())); if(b) b.click(); return JSON.stringify(!!b);");
        await sleep(1100);
      }
      await clickFpsDNative({ chrome, sleep, selector: tid("cs-map-confirm") });
      if (!(await waitId("cs-tactic-confirm", 30000))) return { ok: false, why: "沒有進戰術" };
      await clickFpsDNative({ chrome, sleep, selector: tid("cs-tactic-confirm") });
      if (!(await waitFor("document.querySelector('canvas')&&document.querySelector('[data-testid=\"cs-playback-controls\"] input[type=\"range\"]')", 300000))) return { ok: false, why: "沒有進對戰" };
      await sleep(1500);
      await clickFpsDNative({ chrome, sleep, selector: tid("quick-finish-match") });
      if (!(await waitFor("[...document.querySelectorAll('button')].some((b)=>b.textContent.includes('查看賽後戰報'))", 90000))) return { ok: false, why: "沒有到終局" };
      await clickText("查看賽後戰報");
      await waitFor("[...document.querySelectorAll('button')].some((b)=>b.textContent.trim().startsWith('返回'))", 30000);
      await sleep(2000);
      return { ok: true };
    };
    const startCsFromHub = async () => {
      await toTab("cs");
      //  TD-BP9-23：BO3／BO5 打完一張圖之後，系列賽還在進行，賽事中心只有「返回進行中的對戰」。
      //  玩家會按它打下一張圖；舊 gate 只認 cs-league-play，日曆就停在比賽日。
      if (await has("cs-league-resume")) {
        await click("cs-league-resume"); await sleep(1500);
        const rerr = await text("cs-hub-error");
        if (rerr) return { ok: false, why: "返回被拒", err: rerr };
        report.findings.push({ kind: "cs_series_resume", disk: await disk() });
        return playCsResumed();
      }
      if (await has("cs-hub-lineup-required")) {
        await click("cs-hub-open-prep");
        await waitId("prep-primary-action");
        await clickText("自動填入");
        await sleep(700);
        await click("cs-prep-return-hub");
        await sleep(900);
      }
      if (!(await has("cs-league-play"))) return { ok: false, why: "沒有 CS 出戰按鈕", err: await text("cs-hub-error") };
      await click("cs-league-play");
      await sleep(900);
      const err = await text("cs-hub-error");
      if (err) return { ok: false, why: "出戰被拒", err };
      return playCsMapToResult();
    };
    //  TD-BP9-23：日曆停住時，把當天的賽程與畫面上能做的事都記下來。
    const visibleButtons = () => ev("const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};return JSON.stringify([...document.querySelectorAll('button,[role=button],a[data-testid]')].filter(vis).map((b)=>({t:(b.innerText||'').replace(/\\s+/g,' ').trim().slice(0,40),id:b.dataset.testid||null,dis:!!b.disabled})).slice(0,80));");
    const fixtureState = () => ev(`
      const p=JSON.parse(localStorage.getItem('esmo.profile.v1')||'{}');const me=p.team&&p.team.id;const out={day:p.meta&&p.meta.days,me,offSeason:!!(p.meta&&p.meta.offSeason&&p.meta.offSeason.open),session:p.matchmaking&&p.matchmaking.session?{state:p.matchmaking.session.state,mode:p.matchmaking.session.mode,fixtureId:p.matchmaking.session.fixtureId||null}:null,modes:{}};
      for(const m of ['moba','cs']){const s=p.competitionByMode&&p.competitionByMode[m];if(!s){out.modes[m]=null;continue;}
        const mine=(s.fixtures||[]).filter((f)=>f.sideA===me||f.sideB===me);
        const pick=(f)=>{const o={};for(const k of ['id','status','day','round','stage','phase','week','matchFormat','winner','sideA','sideB'])if(f[k]!==undefined)o[k]=f[k];return o;};
        out.modes[m]={schema:s.schema||null,phase:s.phase||s.stage||null,seasonIndex:s.seasonIndex??s.season??null,startDay:s.startDay??null,keys:Object.keys(s).slice(0,30),mineOpen:mine.filter((f)=>f.status!=='done'&&f.status!=='settled').slice(0,8).map(pick),mineLast:mine.slice(-3).map(pick),mineCount:mine.length};}
      return JSON.stringify(out);`);
    const diagnoseStuck = async () => {
      const d = { state: await fixtureState(), errors: errors() };
      await home();
      d.home = { worldTime: await text("home-world-time"), nextStop: await text("home-next-stop"), buttons: await visibleButtons() };
      await toHub();
      d.hub = {};
      for (const m of ["moba", "cs"]) {
        await toTab(m);
        d.hub[m] = { panel: await text("competition-hub-panel"), error: await text("competition-hub-error"), csError: await text("cs-hub-error"), buttons: await visibleButtons(),
          csPlay: await has("cs-league-play"), csLineupRequired: await has("cs-hub-lineup-required"), mobaPlay: await hasMobaFixture() };
      }
      return d;
    };
    //  把日曆推到下一場玩家賽程，回傳是哪個項目。
    const reachFixture = async (want = null) => {
      for (let i = 0; i < 30; i++) {
        await home(); await toHub(); await toTab("cs");
        const cs = (await has("cs-league-play")) || (await has("cs-hub-lineup-required")) || (await has("cs-league-resume"));
        await toTab("moba");
        let moba = await hasMobaFixture();
        //  TD-BP9-23：MOBA 賽季結束後停在賽季回顧，要按「開始下一賽季」才會排新賽程（玩家的操作，不是自動）。
        //  --diag-no-moba-roll：只用來重現 TD-BP9-23 的舊路徑（不按開始下一賽季，走到第 313 天的 CS BO3），結果不算 gate。
        if (!moba && !DIAG_NO_MOBA_ROLL && (await has("recap-next-season-cta"))) {
          await click("recap-next-season-cta"); await sleep(1800);
          const s = await step("MOBA 開始下一賽季");
          report.findings.push({ kind: "moba_next_season", day: s.disk.day, notice: s.notice });
          ck(`MOBA 開始下一賽季、沒有存檔提示（第 ${s.disk.day} 天）`, !s.notice.on, JSON.stringify(s.notice));
          await home(); await toHub(); await toTab("moba");
          moba = await hasMobaFixture();
        }
        if (want === "moba" && moba) return "moba";
        if (want === "cs" && cs) return "cs";
        if (!want && (moba || cs)) return cs ? "cs" : "moba";
        //  不是想要的項目：棄權讓日曆往下走。
        if (moba && want === "cs") { await clickText("棄權"); await sleep(700); await clickText("確定棄權"); await sleep(1200); continue; }
        //  CS 分頁沒有棄權（BP-2 這輪不動），擋在前面的 CS 就真的打掉。
        if (cs && want === "moba") {
          await toTab("cs");
          const played = await startCsFromHub();
          report.findings.push({ kind: "cs_on_the_way", ok: played.ok, why: played.why ?? null, err: played.err ?? null, disk: await disk() });
          console.log(`路上先打掉一場 CS：${played.ok ? "完成" : played.why}`);
          if (!played.ok || (await notice()).on) { console.log(`找賽程中止：路上的 CS ${played.ok ? "打完但有提示" : played.why}`); return null; }
          continue;
        }
        await home();
        const before = (await disk())?.day;
        await click("home-advance-next");
        await sleep(1300);
        //  休賽期：與 W1 真模擬相同，續約到期合約後完成休賽期（browser_check_offseason 的同一組 testid）。
        if ((await disk())?.day === before && (await has("home-offseason-enter"))) {
          await click("home-offseason-enter");
          await waitId("offseason-screen", 20000);
          for (let k = 0; k < 8; k++) { if (!(await ev("const b=document.querySelector('[data-testid^=\"offseason-renew-\"]');if(b)b.click();return JSON.stringify(!!b);"))) break; await sleep(700); }
          await click("offseason-complete-btn"); await sleep(1500);
          const after = await step("休賽期完成");
          report.findings.push({ kind: "offseason_done", day: after.disk.day, notice: after.notice });
          ck(`休賽期完成、沒有存檔提示（第 ${after.disk.day} 天）`, !after.notice.on, JSON.stringify(after.notice));
          continue;
        }
        if ((await disk())?.day === before) {
          console.log(`找賽程中止：推進日曆沒有前進（第 ${before} 天）${(await notice()).on ? "，有提示 " + (await notice()).message : ""}`);
          //  TD-BP9-23 診斷（Owner 2026-11-07）：停住當天的賽程狀態、模式、畫面上能按的東西。只記錄，不改判定。
          const diag = await diagnoseStuck();
          report.findings.push({ kind: "advance_stuck", day: before, hub: await text("competition-hub-error"), diag });
          save();
          console.log(`DIAG ${JSON.stringify(diag).slice(0, 3000)}`);
          return null;
        }
      }
      return null;
    };
    const startMobaFromHub = async (beforeFinish) => {
      await toTab("moba");
      if (!(await clickText("出賽"))) return { ok: false, why: "沒有出賽按鈕" };
      await sleep(900);
      return finishMoba(beforeFinish);
    };


    // ══════════════════════════════════════════════════════════════════════
    //  BP-9 P0-B
    // ══════════════════════════════════════════════════════════════════════
    const QUOTA = 5242880;
    const DL = path.resolve(arg("downloads") ?? path.join(OUT ? path.dirname(OUT) : ".", `downloads-${CASE}-${Date.now()}`));
    fs.mkdirSync(DL, { recursive: true });
    const fnvNode = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16) + ":" + s.length; };
    const allowDownloads = async () => {
      try { await chrome.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL }); }
      catch { await chrome.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: DL }).catch(() => {}); }
    };
    const newestDownload = async (since) => {
      for (let i = 0; i < 60; i++) {
        const f = fs.readdirSync(DL).filter((n) => n.endsWith(".json")).map((n) => ({ n, t: fs.statSync(path.join(DL, n)).mtimeMs })).filter((x) => x.t >= since).sort((a, b) => b.t - a.t)[0];
        if (f) return path.join(DL, f.n);
        await sleep(500);
      }
      return null;
    };
    const rawFp = (key) => ev("const r=localStorage.getItem(" + JSON.stringify(key) + ")||'';let h=0x811c9dc5;for(let i=0;i<r.length;i++){h^=r.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return JSON.stringify(h.toString(16)+':'+r.length);");
    const shape = () => ev("const p=JSON.parse(localStorage.getItem('esmo.profile.v1')||'{}');const sh=JSON.parse(localStorage.getItem('esmo.season.v1')||'{}').history||[];const tx=p.processedMatchTransactions||{};const keys=Object.keys(tx);const last=keys.length?tx[keys[keys.length-1]]:null;return JSON.stringify({tx:keys,st:Object.keys((p.matchmaking||{}).settlements||{}),slim:(p.meta||{}).saveSlim||null,csArchived:(p.csHistory||[]).filter((e)=>e.archived==='summary').length,csHeadFull:(p.csHistory||[]).slice(0,5).every((e)=>e.archived!=='summary'),seasonTl:sh.filter((r)=>(r.timeline||[]).length>0).length,lastMoney:last&&last.team?last.team.money:null,lastKey:keys[keys.length-1]||null});");
    const visibleDialog = () => ev("const e=document.querySelector('" + tid("save-slim-dialog") + "');return JSON.stringify(!!e&&e.getBoundingClientRect().height>0);");
    const disabled = (id) => ev("const b=document.querySelector('" + tid(id) + "');return JSON.stringify(!b||b.disabled);");
    const gotoCloud = async () => {
      for (const id of ["home-utility-cloudSave", "home-nav-more", "home-sheet-cloudSave"]) {
        await click(id); await sleep(700);
        if (await has("save-backup-card")) return true;
      }
      return false;
    };
    const setFile = async (file) => {
      const { root } = await chrome.send("DOM.getDocument", { depth: -1 });
      const { nodeId } = await chrome.send("DOM.querySelector", { nodeId: root.nodeId, selector: tid("save-restore-file") });
      if (!nodeId) return false;
      await chrome.send("DOM.setFileInputFiles", { nodeId, files: [file] });
      return true;
    };

    /** 從畫面上的入口走完整理：取消一次、下載備份、勾選、開始、等冷啟動。 */
    const slimViaUi = async (label) => {
      const before = await step(`${label}：整理前`);
      const shapeBefore = await shape();
      const fpBefore = await rawFp("esmo.profile.v1");
      const heroBefore = await rawFp("esmo.heroProgress.v2");
      let opened = await click("save-slim-open");
      if (!opened) { await gotoCloud(); opened = await click("save-slim-open-cloud"); }
      ck(`${label}：畫面上有「整理存檔」入口`, opened);
      if (!opened) return null;
      ck(`${label}：對話框打開`, await waitId("save-slim-dialog", 10000));
      ck(`${label}：備份前「開始整理」不能按`, await disabled("save-slim-start"));
      await click("save-slim-cancel"); await sleep(700);
      ck(`${label}：稍後再說：存檔逐位元不變、對話框關閉`, (await rawFp("esmo.profile.v1")) === fpBefore && !(await has("save-slim-dialog")));
      if (!(await click("save-slim-open"))) { await gotoCloud(); await click("save-slim-open-cloud"); }
      await waitId("save-slim-dialog", 10000);
      await allowDownloads();
      const t0 = Date.now() - 2000;
      await click("save-slim-download");
      ck(`${label}：畫面說備份已下載`, await waitId("save-slim-backup-ok", 30000), await text("save-slim-backup-failed"));
      const file = await newestDownload(t0);
      ck(`${label}：備份檔真的存在`, !!file, DL);
      if (file) {
        const b = JSON.parse(fs.readFileSync(file, "utf8"));
        ck(`${label}：備份裡的 profile 等於磁碟上那份（逐位元）`, b.format === "ESMO-SaveBackup" && fnvNode(b.keys["esmo.profile.v1"]) === fpBefore, `${fnvNode(b.keys["esmo.profile.v1"] ?? "")} vs ${fpBefore}`);
        ck(`${label}：備份含熟練與 Season`, typeof b.keys["esmo.heroProgress.v2"] === "string" && typeof b.keys["esmo.season.v1"] === "string");
      }
      ck(`${label}：沒勾選前「開始整理」仍不能按`, await disabled("save-slim-start"));
      ck(`${label}：下載備份本身沒有改存檔`, (await rawFp("esmo.profile.v1")) === fpBefore);
      await click("save-slim-confirm"); await sleep(400);
      ck(`${label}：勾選後可以開始`, !(await disabled("save-slim-start")));
      await setWidth(390, 844, true); await sleep(700);
      ck(`${label}：390 對話框看得到、沒有橫向溢出`, (await visibleDialog()) && (await overflow()) <= 1, `${await overflow()}`);
      await setWidth(1366, 900, false); await sleep(500);
      await click("save-slim-start");
      await sleep(4000);
      ck(`${label}：自動重新載入回到首頁`, await waitId("home-mode-moba", 120000));
      await sleep(2000);
      const after = await step(`${label}：整理後（冷啟動）`);
      const s = await shape();
      report.slim = [...(report.slim ?? []), { label, before: before.disk.total, after: after.disk.total, file }];
      ck(`${label}：冷啟動驗證完成`, s.slim?.verified === true && s.slim?.mode === "migrated" && !s.slim?.failed, JSON.stringify(s.slim));
      ck(`${label}：畫面顯示整理完成`, (await ev("const e=document.querySelector('" + tid("save-slim-result") + "');return JSON.stringify(e?e.dataset.status:null);")) === "ok");
      ck(`${label}：帳本鍵與結算鍵逐一相同`, JSON.stringify(s.tx) === JSON.stringify(shapeBefore.tx) && JSON.stringify(s.st) === JSON.stringify(shapeBefore.st), `${shapeBefore.tx.length}→${s.tx.length}`);
      ck(`${label}：資金、天數、Season 筆數、CS 筆數不變`, after.disk.funds === before.disk.funds && after.disk.day === before.disk.day && after.disk.seasonLen === before.disk.seasonLen && after.disk.csHistory === before.disk.csHistory, JSON.stringify([before.disk, after.disk]));
      ck(`${label}：熟練逐位元不變`, (await rawFp("esmo.heroProgress.v2")) === heroBefore);
      ck(`${label}：總量至少減半`, after.disk.total < before.disk.total * 0.5, `${before.disk.total}→${after.disk.total}`);
      ck(`${label}：CS 最近 5 場完整、其餘摘要；Season 只留 10 場 timeline`, s.csHeadFull && s.csArchived === Math.max(0, after.disk.csHistory - 5) && s.seasonTl === Math.min(10, after.disk.seasonLen), JSON.stringify({ a: s.csArchived, tl: s.seasonTl }));
      const msg = (await notice()).message ?? "";
      ck(`${label}：提示不再說存檔已滿`, !/存檔空間已滿/.test(msg), msg);
      ck(`${label}：沒有 JS 錯誤`, errors().page.length === 0, errors().page.join(" | "));
      return { before, after, file };
    };

    /** 打到第一次存不進去為止（不注入任何東西）。回傳出事那一場的前後。 */
    const playUntilLimit = async (prefer) => {
      let failedAt = null, played = 0;
      for (let i = 0; i < 30 && !failedAt && played < 12; i++) {
        const mode = await reachFixture(prefer);
        if (!mode) { report.findings.push({ kind: "fixture_not_reached", prefer }); break; }
        const s0 = await step(`${mode} 第 ${played + 1} 場打之前`);
        const r = mode === "cs" ? await startCsFromHub() : await startMobaFromHub();
        ck(`${mode} 第 ${played + 1} 場打到結算`, r.ok, `${r.why} ${r.err ?? ""}`);
        if (!r.ok) break;
        played++;
        const s1 = await step(`${mode} 第 ${played} 場打完`);
        if (s1.disk.tx === s0.disk.tx) failedAt = { mode, s0, s1 };
      }
      return { failedAt, played };
    };

    /**
     * 「返回進行中的對戰」會依場次停在哪個階段回去（AppShell.resumeActiveMatch）：選圖、戰術、載入或對戰本身。
     * ⚠ P0-A 的 gate 只等選圖，而超限那場是打完才存不進去、停在對戰階段，所以當時一直「沒有進選圖」。
     */
    const playCsResumed = async () => {
      const where = () => ev("return JSON.stringify(document.querySelector('" + tid("cs-map-confirm") + "')?'map':document.querySelector('" + tid("cs-tactic-confirm") + "')?'tactic':(document.querySelector('canvas')&&document.querySelector('[data-testid=\"cs-playback-controls\"] input[type=\"range\"]'))?'battle':null);");
      let w = null;
      for (let i = 0; i < 300 && !w; i++) { w = await where(); if (!w) await sleep(1000); }
      report.findings.push({ kind: "cs_resume_lands_on", where: w });
      console.log(`CS 返回後落在：${w}`);
      if (!w) return { ok: false, why: "返回後沒有進到選圖、戰術或對戰" };
      if (w === "map") return playCsMapToResult();
      if (w === "tactic") {
        await clickFpsDNative({ chrome, sleep, selector: tid("cs-tactic-confirm") });
        if (!(await waitFor("document.querySelector('canvas')&&document.querySelector('[data-testid=\"cs-playback-controls\"] input[type=\"range\"]')", 300000))) return { ok: false, why: "沒有進對戰" };
      }
      await sleep(1500);
      await clickFpsDNative({ chrome, sleep, selector: tid("quick-finish-match") });
      if (!(await waitFor("[...document.querySelectorAll('button')].some((b)=>b.textContent.includes('查看賽後戰報'))", 90000))) return { ok: false, why: "沒有到終局" };
      await clickText("查看賽後戰報");
      await waitFor("[...document.querySelectorAll('button')].some((b)=>b.textContent.trim().startsWith('返回'))", 30000);
      await sleep(2000);
      return { ok: true };
    };

    /** 整理之後把卡住的那場打完：只入帳一次。 */
    const replayStuck = async (label, mode, s0) => {
      await home(); await toHub(); await toTab(mode);
      let replay;
      if (mode === "cs") {
        const canResume = await has("cs-league-resume");
        ck(`${label}：CS 有「返回進行中的對戰」`, canResume);
        if (!canResume) return null;
        await click("cs-league-resume"); await sleep(1500);
        const err = await text("cs-hub-error");
        replay = err ? { ok: false, why: "返回被拒", err } : await playCsResumed();
      } else {
        const clicked = await clickText("返回比賽");
        await sleep(2500);
        ck(`${label}：MOBA 有返回比賽`, clicked);
        if (!clicked) return null;
        replay = await finishMoba();
      }
      //  ⚠ Owner 條件 3：沒有真的打到結算就是 FAIL，不是「未驗證」。
      ck(`${label}：返回對戰真的打到結算`, replay.ok, `${replay.why ?? ""} ${replay.err ?? ""}`);
      const s3 = await step(`${label}：重打結算後`);
      const sh = await shape();
      ck(`${label}：帳本只多 1 筆`, s3.disk.tx === s0.disk.tx + 1, `${s0.disk.tx}→${s3.disk.tx}`);
      ck(`${label}：資金只增加這一場的獎金一次`, s3.disk.funds - s0.disk.funds === sh.lastMoney, `${s0.disk.funds}→${s3.disk.funds}（收據 ${sh.lastMoney}）`);
      if (mode === "cs") ck(`${label}：CS 紀錄多 1 場`, s3.disk.csHistory === Math.min(30, s0.disk.csHistory + 1), `${s0.disk.csHistory}→${s3.disk.csHistory}`);
      else {
        ck(`${label}：熟練只多一場（+10）`, s3.disk.heroGames === s0.disk.heroGames + 10, `${s0.disk.heroGames}→${s3.disk.heroGames}`);
        ck(`${label}：Season 多一筆、帶這場的識別`, s3.disk.seasonCommit && s3.disk.seasonCommit !== s0.disk.seasonCommit, `${s0.disk.seasonCommit}→${s3.disk.seasonCommit}`);
      }
      ck(`${label}：賽程不再停在進行中`, (mode === "cs" ? s3.disk.launchedCs : s3.disk.launchedMoba).length === 0, JSON.stringify(s3.disk));
      ck(`${label}：沒有比賽提示`, s3.notice.kind !== "match", JSON.stringify(s3.notice));
      ck(`${label}：日誌清掉`, s3.disk.journal === null);
      await home();
      const s4 = await step(`${label}：重新整理`);
      ck(`${label}：重新整理後不多算`, s4.disk.tx === s3.disk.tx && s4.disk.funds === s3.disk.funds && s4.disk.heroGames === s3.disk.heroGames && s4.disk.csHistory === s3.disk.csHistory);
      await toHub(); await toTab(mode);
      ck(`${label}：不能再返回同一場`, mode === "cs" ? !(await has("cs-league-resume")) : !(await clickText("返回比賽")));
      return s3;
    };

    /** 整理後繼續正常打：MOBA 與 CS 各至少一場賽程打到結算。 */
    const playOnAfterSlim = async (label, need = ["moba", "cs"]) => {
      const done = new Set();
      for (let i = 0; i < 8 && done.size < need.length; i++) {
        const want = need.find((m) => !done.has(m));
        const seen = report.findings.length;
        const mode = await reachFixture(want);
        //  找 MOBA 的路上先打掉的 CS 賽程（startCsFromHub 打到結算）也是正常完成的賽程。
        for (const fnd of report.findings.slice(seen)) if (fnd.kind === "cs_on_the_way" && fnd.ok && !fnd.disk?.alert) { done.add("cs"); ck(`${label}：路上的 CS 賽程打到結算、沒有提示（第 ${fnd.disk.day} 天，帳本 ${fnd.disk.tx}）`, true); }
        if (!mode) break;
        const s0 = await step(`${label}：${mode} 打之前`);
        const r = mode === "cs" ? await startCsFromHub() : await startMobaFromHub();
        const s1 = await step(`${label}：${mode} 打完`);
        ck(`${label}：${mode} 賽程打到結算`, r.ok, `${r.why ?? ""} ${r.err ?? ""}`);
        ck(`${label}：${mode} 入帳一次、沒有存檔提示`, s1.disk.tx === s0.disk.tx + 1 && !s1.notice.on, JSON.stringify([s0.disk.tx, s1.disk.tx, s1.notice]));
        if (r.ok) done.add(mode);
      }
      ck(`${label}：MOBA 與 CS 都正常完成賽程`, need.every((m) => done.has(m)), [...done].join(","));
    };

    if (CASE === "slim-cs") {
      await loadCheckpoint();
      await step("起點");
      const { failedAt, played } = await playUntilLimit("cs");
      ck("真 CS 打到超限（不注入）", !!failedAt && failedAt.mode === "cs", `打了 ${played} 場`);
      if (failedAt) {
        await home();
        await fullText("CS 超限（整理前）");
        const slim = await slimViaUi("CS 超限");
        if (slim) {
          await replayStuck("整理後 CS 返回對戰", "cs", failedAt.s0);
          await playOnAfterSlim("整理後繼續");
          //  ── 還原：拿整理前下載的備份還原，逐位元等於備份，之後可以再整理一次 ──
          await home();
          ck("雲端存檔頁有存檔備份卡", await gotoCloud());
          await allowDownloads();
          const t1 = Date.now() - 2000;
          await click("save-export");
          ck("常駐入口：匯出存檔", await waitId("save-export-ok", 30000));
          const exported = await newestDownload(t1);
          ck("常駐入口：匯出的檔案存在且等於磁碟上那份", !!exported && fnvNode(JSON.parse(fs.readFileSync(exported, "utf8")).keys["esmo.profile.v1"]) === (await rawFp("esmo.profile.v1")));
          //  改過的備份要被拒
          const bad = JSON.parse(fs.readFileSync(slim.file, "utf8"));
          bad.keys["esmo.profile.v1"] = bad.keys["esmo.profile.v1"].replace(/"funds":\d+/, "\"funds\":999999999");
          const badFile = path.join(DL, "tampered.json"); fs.writeFileSync(badFile, JSON.stringify(bad));
          const fpNow = await rawFp("esmo.profile.v1");
          await setFile(badFile);
          ck("改過的備份被拒", await waitId("save-restore-invalid", 15000), await text("save-restore-invalid"));
          ck("被拒時存檔不變", (await rawFp("esmo.profile.v1")) === fpNow);
          await setFile(slim.file);
          ck("整理前的備份可以選", await waitId("save-restore-ready", 15000));
          ck("沒勾選不能還原", await disabled("save-restore-apply"));
          await click("save-restore-agree"); await sleep(300);
          await click("save-restore-apply");
          await sleep(4000);
          ck("還原後回到首頁", await waitId("home-mode-moba", 120000));
          await sleep(1500);
          const b = JSON.parse(fs.readFileSync(slim.file, "utf8"));
          const same = await ev("const K=" + JSON.stringify(Object.keys(b.keys)) + ";const out={};for(const k of K){const r=localStorage.getItem(k)||'';let h=0x811c9dc5;for(let i=0;i<r.length;i++){h^=r.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}out[k]=h.toString(16)+':'+r.length;}return JSON.stringify(out);");
          const want = Object.fromEntries(Object.entries(b.keys).map(([k, v]) => [k, fnvNode(v)]));
          //  ⚠ 警示與審查紀錄在開機時會依目前狀態重新推導（P0-A 設計），只比存檔本體。
          const core = ["esmo.profile.v1", "esmo.heroProgress.v2", "esmo.season.v1"];
          ck("還原：存檔本體逐位元等於整理前的備份", core.every((k) => same[k] === want[k]), JSON.stringify(core.map((k) => [same[k], want[k]])));
          const r1 = await step("還原後");
          ck("還原後：又可以整理（有入口）", (await has("save-slim-open")) || (await has("save-slim-suggest")), JSON.stringify(r1.notice));
        }
      }
      report.errors = errors();
    }

    if (CASE === "slim-300") {
      //  W1 第 300 天的 Node 存檔是 5,272,004 字元，比 Chrome 上限 5,242,880 還大，原樣灌不進 Chrome。
      //  只縮最舊 Season 紀錄的 timeline（衍生資料、不影響生涯數值），縮到剛好放得下、再一場就會超限。
      const c = JSON.parse(fs.readFileSync(CHECKPOINT, "utf8"));
      const total = () => Object.entries(c.storage).reduce((n, [k, v]) => n + k.length + v.length, 0);
      const target = QUOTA - 2500;
      const env = JSON.parse(c.storage["esmo.season.v1"]);
      let trimmed = 0, entries = 0;
      for (const r of env.history) {
        if (total() <= target) break;
        const tl = r.timeline ?? [];
        while (tl.length && (Object.entries(c.storage).reduce((n, [k, v]) => n + k.length + v.length, 0) > target)) {
          tl.pop(); trimmed++;
          c.storage["esmo.season.v1"] = JSON.stringify(env);
        }
        entries++;
      }
      report.nonUi.push({ file: path.basename(CHECKPOINT), day: c.day, why: "W1 Node 真模擬第 300 天；Chrome 裝不下原樣", adjusted: `最舊 ${entries} 筆 Season 紀錄的 timeline 共拿掉 ${trimmed} 個事件，總量 ${total()}（上限 ${QUOTA}）` });
      await chrome.navigate(url); await sleep(1200);
      const r = await ev("localStorage.clear();sessionStorage.clear();const d=JSON.parse(" + JSON.stringify(JSON.stringify(c.storage)) + ");const out={ok:true,failed:null};for(const k of Object.keys(d)){try{localStorage.setItem(k,d[k]);}catch(e){out.ok=false;out.failed=k+':'+e.name;break;}}return JSON.stringify(out);");
      ck("第 300 天存檔灌進 Chrome", r?.ok, r?.failed);
      await home();
      await step("起點（第 300 天）");
      const { failedAt, played } = await playUntilLimit(null);
      ck("第 300 天真比賽打到超限（不注入）", !!failedAt, `打了 ${played} 場`);
      if (failedAt) {
        report.limitMode = failedAt.mode;
        await home();
        await fullText(`第 300 天 ${failedAt.mode} 超限（整理前）`);
        const slim = await slimViaUi("第 300 天超限");
        if (slim) {
          await replayStuck(`第 300 天整理後 ${failedAt.mode} 重打`, failedAt.mode, failedAt.s0);
          await playOnAfterSlim("第 300 天整理後繼續");
        }
      }
      report.errors = errors();
    }

    save();
  },
});
if (preview) killProcessTree?.(preview.pid);
try { preview?.kill(); } catch { /* best effort */ }
save();
await finishGate(result);
process.exit(0);
