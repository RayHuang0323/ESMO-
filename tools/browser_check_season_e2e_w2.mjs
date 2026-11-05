#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_season_e2e_w2.mjs — Season End-to-End Audit v1 W2：瀏覽器關鍵節點
//
//  執行：先 build，再
//    node tools/browser_check_season_e2e_w2.mjs --case=<season-end|quota|offseason|bo3|continuous>
//         --w1=<W1 標準開局資料夾> --elite=<W1 強隊開局資料夾> [--state=<自備 checkpoint>] --out=<json>
//
//  打本機 vite preview 的打包結果，隔離 Chrome profile，碰不到玩家存檔。
//
//  ⚠⚠ **非 UI 區段一律寫進報告**：W1 checkpoint 是 Node 真模擬打出來的，讀進來之前的一切都**不是** UI 操作。
//     讀進來之後的每一場比賽都走真 UI、真引擎，只用快速完成加速，賽果不是腳本寫的。
//  ⚠⚠ **quota 不注入任何資料**：沒有假鍵、沒有改 setItem。存檔失敗必須是真比賽自然累積出來的。
//
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
const W1 = arg("w1"), ELITE = arg("elite");
const OUT = arg("out");
const MAX_QUOTA_FIXTURES = Number(arg("max-fixtures") ?? 40);
if (!CASE || !fs.existsSync("dist/index.html")) { console.error("需要 --case，且要先 build"); process.exit(2); }
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.once("error", rej); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); }); });
const port = await freePort();
const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "ignore" });
const url = `http://127.0.0.1:${port}/ESMO-/`;
for (let i = 0; i < 120; i++) { try { if ((await fetch(url)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }

const J = (raw) => { const s = String(raw); for (const t of [s, s.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
const tid = (id) => "[data-testid=\"" + id + "\"]";
const report = { case: CASE, url, nonUi: [], steps: [], findings: [] };
const save = () => { if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 1)); };

const result = await runGate({
  name: `Season E2E W2 ${CASE}`,
  externalUrl: url,
  timeoutMs: 3300000,
  async run({ chrome, ck, sleep }) {
    const ev = async (body) => J(await chrome.evaluate(body));
    const has = (id) => ev("return JSON.stringify(!!document.querySelector('" + tid(id) + "'));");
    const waitFor = async (expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev("return JSON.stringify(Boolean(" + expr + "));")) return true; await sleep(350); } return false; };
    const waitId = (id, ms = 30000) => waitFor("document.querySelector('" + tid(id) + "')", ms);
    const click = (id) => ev("const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};const el=[...document.querySelectorAll('" + tid(id) + "')].find(vis);if(el)el.click();return JSON.stringify(!!el);");
    const clickText = (s) => ev("const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};const el=[...document.querySelectorAll('button')].filter(vis).find((b)=>(b.innerText||'').includes(" + JSON.stringify(s) + "));if(el)el.click();return JSON.stringify(!!el);");
    const text = (id) => ev("const e=document.querySelector('" + tid(id) + "');return JSON.stringify(e?e.innerText.replace(/\\s+/g,' ').slice(0,300):null);");
    const bodyHas = (re) => ev("const t=document.body.innerText||'';const m=t.match(new RegExp(" + JSON.stringify(re) + ",'g'));return JSON.stringify(m?[...new Set(m)].slice(0,10):[]);");
    const overflow = () => ev("return JSON.stringify(Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth);");
    chrome.on("Page.javascriptDialogOpening", (p) => { chrome.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {}); });

    const disk = () => ev(`
      const r=localStorage.getItem('esmo.profile.v1');const sizes={};let total=0;for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);const v=localStorage.getItem(k);sizes[k]=v.length;total+=k.length+v.length;}
      if(!r)return JSON.stringify({sizes,total});const p=JSON.parse(r);const me=p.team&&p.team.id;
      const sn=(m)=>{const s=p.competitionByMode&&p.competitionByMode[m];if(!s||!s.schema)return null;const mine=(s.fixtures||[]).filter((f)=>f.sideA===me||f.sideB===me);const open=(s.fixtures||[]).filter((f)=>!['completed','forfeited'].includes(f.status));const o=Array.isArray(s.outcomes)?s.outcomes:Object.values(s.outcomes||{});return {season:s.season,final:!!s.final,total:(s.fixtures||[]).length,open:open.length,mineOpen:mine.filter((f)=>!['completed','forfeited'].includes(f.status)).length,launched:mine.filter((f)=>f.status==='launched').map((f)=>f.id),outcomes:o.length};};
      let seasonHist=null;try{const h=JSON.parse(localStorage.getItem('esmo.season.v1')||'null');seasonHist=(h&&(h.history||(h.state&&h.state.history))||[]).length;}catch(e){seasonHist='parse_failed';}
      let heroSig=null,heroGames=null,heroXp=null;try{const hp=localStorage.getItem('esmo.heroProgress.v2');heroSig=hp?hp.length:null;if(hp){const o=JSON.parse(hp).progress||{};heroGames=0;heroXp=0;for(const k of Object.keys(o)){heroGames+=(o[k]&&o[k].mastery&&o[k].mastery.games)||0;heroXp+=(o[k]&&o[k].xp)||0;}}}catch(e){}
      let seasonSig=[];try{const h2=JSON.parse(localStorage.getItem('esmo.season.v1')||'null');const l=(h2&&h2.history)||[];seasonSig=l.slice(-6).map((x)=>[x.winner,x.duration,x.score&&x.score.blue,x.score&&x.score.red].join('/'));}catch(e){}
      return JSON.stringify({sizes,total,day:p.meta&&p.meta.days,funds:p.finance&&p.finance.funds,fans:p.meta&&p.meta.fans,tx:Object.keys(p.processedMatchTransactions||{}).length,csHistory:(p.csHistory||[]).length,awards:Object.keys(p.processedCompetitionAwards||{}).length,settlements:Object.keys((p.matchmaking&&p.matchmaking.settlements)||{}).length,moba:sn('moba'),cs:sn('cs'),seasonHist,heroSig,heroGames,heroXp,seasonSig,offSeasonOpen:!!(p.meta&&p.meta.offSeason&&p.meta.offSeason.session&&p.meta.offSeason.session.open),players:(p.players||[]).length,histMoba:((p.competitionHistoryByMode&&p.competitionHistoryByMode.moba)||p.competitionHistory||[]).length,histCs:((p.competitionHistoryByMode&&p.competitionHistoryByMode.cs)||[]).length,corrupt:Object.keys(sizes).filter((k)=>k.endsWith('.corrupt'))});`);
    const notice = async () => ({ on: await has("save-status-notice"), message: await text("save-status-message"), retry: await has("save-status-retry") });
    const step = async (name, extra = {}) => { const row = { name, disk: await disk(), notice: await notice(), ...extra }; report.steps.push(row); save(); console.log(`STEP ${name} 第 ${row.disk?.day} 天 tx ${row.disk?.tx} 資金 ${row.disk?.funds} 總量 ${row.disk?.total}${row.notice.on ? " ⚠ 存檔失敗提示：" + row.notice.message : ""}`); return row; };
    const errors = () => ({ page: chrome.pageErrors.slice(0, 6).map((l) => String(l).slice(0, 240)), console: chrome.consoleLines.filter((l) => l.startsWith("[error]")).slice(0, 10).map((l) => l.slice(0, 240)) });

    const setWidth = async (w, h, mob) => { await chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mob ? 2 : 1, mobile: mob }); await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: mob, maxTouchPoints: mob ? 5 : 1 }); };
    const home = async () => { await chrome.navigate(url); await waitId("home-mode-moba", 120000); await sleep(1000); };
    const loadCheckpoint = async (file, why) => {
      const c = JSON.parse(fs.readFileSync(file, "utf8"));
      report.nonUi.push({ file: path.basename(file), day: c.day, why });
      console.log(`非 UI：讀入 ${path.basename(file)}（第 ${c.day} 天）— ${why}`);
      await chrome.navigate(url); await sleep(1200);
      const r = await ev("localStorage.clear();const d=JSON.parse(" + JSON.stringify(JSON.stringify(c.storage)) + ");const out={ok:true,failed:null};for(const k of Object.keys(d)){try{localStorage.setItem(k,d[k]);}catch(e){out.ok=false;out.failed=k+':'+e.name;break;}}return JSON.stringify(out);");
      if (!r?.ok) throw new Error(`checkpoint 灌不進去：${r?.failed}`);
      await home();
      return c;
    };
    const toHub = async () => { await click("home-mode-bracket"); await waitId("competition-hub-tabs", 30000); await sleep(700); };
    const toTab = async (mode) => { await click(`competition-hub-tab-${mode}`); await sleep(900); };
    const today = (d, mode) => (d?.[mode]?.mineOpen > 0);

    // ── 真 UI 打一場 ──────────────────────────────────────────────────────
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
    /** 從賽事中心打今天那一場 MOBA。回傳 { ok, why } */
    const playMobaFromHub = async () => {
      await toTab("moba");
      const started = await clickText("出賽");
      if (!started) return { ok: false, why: "沒有出賽按鈕", panel: await bodyHas("今天[^\\n]*|第 \\d+ 天[^\\n]*") };
      await sleep(900);
      const herr = await bodyHas("[^\\n]*(無法|不能|請先)[^\\n]*");
      await prepLoop("hero-grid-scroll");
      if (!(await waitId("hero-grid-scroll", 90000))) return { ok: false, why: "沒有進 Ban/Pick", herr };
      for (let i = 0; i < 80; i++) {
        if (await ev("const b=document.querySelector('" + tid("confirm-draft") + "');return JSON.stringify(!!b&&!b.disabled);")) break;
        await click("hero-choose");
        await sleep(900);
      }
      await click("confirm-draft");
      if (!(await waitFor("[...document.querySelectorAll('button')].some((b)=>(b.innerText||'').includes('開始載入'))", 60000))) return { ok: false, why: "沒有進戰術頁" };
      await clickText("開始載入");
      if (!(await waitId("battle-hud", 300000))) return { ok: false, why: "沒有進對戰" };
      await sleep(2500);
      await ev("window.confirm=()=>true;return JSON.stringify(1);");
      await click("quick-finish-match");
      if (!(await waitFor("[...document.querySelectorAll('button')].some((b)=>/觀看重播|無法重播/.test(b.innerText||''))||[...document.querySelectorAll('span')].some((s)=>/無法重播/.test(s.innerText||''))", 360000))) return { ok: false, why: "沒有到結算" };
      await sleep(2500);
      return { ok: true, resultSave: await bodyHas("[^\\n]*(存檔|進度沒有|沒有保存)[^\\n]*") };
    };
    /** 目前在賽前或選圖之前，打一張 CS 到結算頁。 */
    const playCsMapToResult = async ({ reloadMidBattle = false } = {}) => {
      await prepLoop("cs-map-confirm");
      if (!(await waitId("cs-map-confirm", 90000))) return { ok: false, why: "沒有進選圖" };
      const banner = await text("cs-series-banner");
      for (let i = 0; i < 14; i++) {
        if (await ev("const b=document.querySelector('" + tid("cs-map-confirm") + "');return JSON.stringify(!!b&&!b.disabled);")) break;
        await ev("const b=[...document.querySelectorAll('button')].find((x)=>!x.disabled&&/^(Dust II|Mirage|Inferno)/.test((x.innerText||'').trim())); if(b) b.click(); return JSON.stringify(!!b);");
        await sleep(1100);
      }
      await clickFpsDNative({ chrome, sleep, selector: tid("cs-map-confirm") });
      if (!(await waitId("cs-tactic-confirm", 30000))) return { ok: false, why: "沒有進戰術" };
      await clickFpsDNative({ chrome, sleep, selector: tid("cs-tactic-confirm") });
      const battleExpr = "document.querySelector('canvas')&&document.querySelector('[data-testid=\"cs-playback-controls\"] input[type=\"range\"]')";
      if (!(await waitFor(battleExpr, 300000))) return { ok: false, why: "沒有進對戰", banner };
      await sleep(1500);
      if (reloadMidBattle) {
        await step("比賽中重新整理之前");
        await home();
        await step("比賽中重新整理之後");
        await toHub(); await toTab("cs");
        const resume = await has("cs-league-resume");
        report.findings.push({ kind: "mid_battle_reload", resumeButton: resume });
        if (!resume) return { ok: false, why: "重新整理後沒有返回比賽的按鈕", banner };
        await click("cs-league-resume");
        if (!(await waitFor(battleExpr, 300000))) return { ok: false, why: "返回比賽後沒有回到對戰", banner };
        await sleep(1500);
      }
      await clickFpsDNative({ chrome, sleep, selector: tid("quick-finish-match") });
      if (!(await waitFor("[...document.querySelectorAll('button')].some((b)=>b.textContent.includes('查看賽後戰報'))", 90000))) return { ok: false, why: "沒有到終局", banner };
      await clickText("查看賽後戰報");
      await waitFor("[...document.querySelectorAll('button')].some((b)=>b.textContent.trim().startsWith('返回'))", 30000);
      await sleep(2000);
      return { ok: true, banner };
    };
    const playCsFromHub = async () => {
      await toTab("cs");
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
    /** 把今天的賽程打完；回傳打了哪些。沒有賽程就往下一站。 */
    const playOneFixtureOrAdvance = async () => {
      await home();
      await toHub();
      await toTab("cs");
      if ((await has("cs-league-play")) || (await has("cs-hub-lineup-required"))) return { mode: "cs", ...(await playCsFromHub()) };
      await toTab("moba");
      if (await ev("return JSON.stringify([...document.querySelectorAll('" + tid("competition-hub-panel") + " button')].some((b)=>(b.innerText||'').includes('出賽')));")) return { mode: "moba", ...(await playMobaFromHub()) };
      await home();
      const before = (await disk())?.day;
      await click("home-advance-next");
      await sleep(1200);
      return { mode: null, advanced: true, from: before, to: (await disk())?.day };
    };

    await setWidth(1366, 900, false);

    // ═══ 1 賽季封存與快轉（BP-4／BP-8）══════════════════════════════════
    if (CASE === "season-end") {
      const state = arg("state");
      for (const [label, w, h, mob, how] of [["1366 前往下一站", 1366, 900, false, "next"], ["1366 逐日", 1366, 900, false, "day"], ["390 前往下一站", 390, 844, true, "next"]]) {
        await setWidth(w, h, mob);
        await loadCheckpoint(state, "玩家第 84 天打完最後一場常規賽。前面都是 W1 Node 真模擬，不是 UI");
        const start = await step(`${label} 起點`, { nextStop: await text("home-next-stop") });
        report.findings.push({ kind: "start", label, moba: start.disk.moba, cs: start.disk.cs });
        for (let i = 0; i < 40; i++) {
          const d = await disk();
          if (d.moba?.final && d.cs?.final) break;
          await home();
          const b = d.day;
          await click(how === "next" ? "home-advance-next" : "home-advance-day");
          await sleep(1300);
          const a = await disk();
          if (how === "next" || a.moba?.final !== d.moba?.final || a.cs?.final !== d.cs?.final) await step(`${label} ${b}→${a.day}`, { nextStop: await text("home-next-stop"), overflow: await overflow() });
          if (a.day === b) { const m = await bodyHas("[^\\n]*(比賽|棄權|休賽期)[^\\n]*"); report.findings.push({ kind: "blocked", label, day: b, text: m }); if (how === "day") { await toHub(); await playMobaFromHub(); } break; }
        }
        const sealed = await step(`${label} 兩邊都封存`, { nextStop: await text("home-next-stop") });
        report.findings.push({ kind: "sealed", label, day: sealed.disk.day, funds: sealed.disk.funds, startFunds: start.disk.funds, final: { moba: sealed.disk.moba?.final, cs: sealed.disk.cs?.final } });
        //  BP-4：封存之後首頁到底有沒有提示
        await home();
        const homeWords = await bodyHas("[^\\n]*(賽季|換季|新賽季|開始第|下一季|封存)[^\\n]*");
        const primary = await text("home-next-stop");
        const worldCard = await text("home-world-time");
        await toHub();
        await toTab("moba");
        const mobaRoll = await bodyHas("開始第 \\d+ 賽季[^\\n]*");
        await toTab("cs");
        const csEntry = await has("cs-hub-recap-btn");
        const lastInbox = await ev("const p=JSON.parse(localStorage.getItem('esmo.profile.v1'));return JSON.stringify((p.inbox||[]).slice(0,8).map((m)=>m.subject));");
        report.findings.push({ kind: "bp4_after_seal", label, homeWords, primary, worldCard, mobaRollButton: mobaRoll, csRecapButton: csEntry, inboxLatest: lastInbox });
        //  封存後沒有換季，繼續按前往下一站
        await home();
        for (let i = 0; i < 3 && how === "next"; i++) {
          const b = (await disk()).day;
          await click("home-advance-next");
          await sleep(1300);
          await step(`${label} 沒換季繼續快轉 ${b}→${(await disk()).day}`, { nextStop: await text("home-next-stop") });
        }
        save();
      }
      report.errors = errors();
      ck("賽季封存與快轉量完", true);
    }

    // ═══ 2 真賽程打到存檔超限（BP-9）═══════════════════════════════════
    if (CASE === "quota") {
      await loadCheckpoint(path.join(W1, "checkpoints", arg("start") ?? "024-every10-f110.json"), "第 254 天。前面 110 個賽程是 W1 Node 真模擬，不是 UI。之後每一場都是真 UI");
      const quota = 5241699;
      let last = await step("起點");
      let played = 0, fail = null;
      const blocks = [];
      for (let i = 0; i < MAX_QUOTA_FIXTURES * 2 && played < MAX_QUOTA_FIXTURES; i++) {
        const before = await disk();
        const r = await playOneFixtureOrAdvance();
        const n = await notice();
        const after = await disk();
        if (r.advanced) { if (r.from === r.to) { blocks.push({ day: r.from, text: await bodyHas("[^\\n]*(比賽|休賽期|棄權)[^\\n]*") }); report.findings.push({ kind: "advance_blocked", day: r.from, text: blocks.at(-1).text }); break; } console.log(`快轉 ${r.from}→${r.to}`); if (n.on) { fail = { at: "advance", before, after, notice: n }; break; } continue; }
        played++;
        const moved = after.tx === before.tx + 1;
        await step(`第 ${played} 場 ${r.mode}`, { ok: r.ok, why: r.why ?? null, err: r.err ?? null, moved, room: quota - after.total });
        if (!r.ok) { report.findings.push({ kind: "fixture_failed", mode: r.mode, why: r.why, err: r.err ?? null, disk: after, notice: n }); }
        if (n.on || !moved || !r.ok) { fail = { at: `第 ${played} 場 ${r.mode}`, mode: r.mode, before, after, notice: n, r }; break; }
        last = after;
      }
      report.played = played;
      if (!fail) { report.findings.push({ kind: "no_overflow_reached", played, total: last.total }); }
      else {
        report.failure = fail;
        console.log("⚠ 存檔失敗重現：", JSON.stringify(fail.notice));
        const q = report.q = {};
        q.errorsAtFailure = errors();
        //  重試：玩家按得到的那顆
        q.retryAvailable = await has("save-status-retry");
        if (q.retryAvailable) { await click("save-status-retry"); await sleep(1500); q.afterRetry = { notice: await notice(), disk: await disk() }; }
        q.screenWhenFailed = await bodyHas("[^\\n]*(存檔|保存|進度)[^\\n]*");
        //  還能繼續玩嗎：回首頁是重新整理，這裡先用畫面內推進測
        //  重新整理：磁碟上剩什麼
        await home();
        q.afterReload = await disk();
        q.noticeAfterReload = await notice();
        q.corrupt = q.afterReload.corrupt;
        //  與失敗前比，三把鍵各自有沒有動（只有部分寫入就是不一致的來源）
        q.partialWrite = { profileChanged: fail.before.sizes["esmo.profile.v1"] !== q.afterReload.sizes["esmo.profile.v1"], seasonChanged: fail.before.seasonHist !== q.afterReload.seasonHist || fail.before.sizes["esmo.season.v1"] !== q.afterReload.sizes["esmo.season.v1"], heroChanged: fail.before.heroSig !== q.afterReload.heroSig, txBefore: fail.before.tx, txAfter: q.afterReload.tx, fundsBefore: fail.before.funds, fundsAfter: q.afterReload.funds };
        await step("重新整理之後");
        //  同一場再打一次：會不會重複入帳？存檔還是存不進去？
        const again = await playOneFixtureOrAdvance();
        q.replay = { mode: again.mode, ok: again.ok, why: again.why ?? null, err: again.err ?? null, advanced: !!again.advanced, notice: await notice(), disk: await disk() };
        await step("重新整理後再打一次", { mode: again.mode, ok: again.ok });
        await home();
        q.afterSecondReload = await disk();
        //  一般對戰路徑會清 settlements：玩家有沒有自救的路
        report.errors = errors();
      }
      save();
      ck("超限量測跑完", true);
    }

    // ═══ 2b 超限之後：玩家實際能走的三條路（只在隔離 profile）══════════
    if (CASE === "quota-recover") {
      const scenario = arg("scenario");
      report.scenario = scenario;
      await loadCheckpoint(path.join(W1, "checkpoints", arg("start") ?? "024-every10-f110.json"), "第 254 天。前面是 W1 Node 真模擬，不是 UI。之後全部真 UI，不注入資料");
      const start = await step("起點");
      await click("home-advance-next");
      await sleep(1300);
      const r0 = await playOneFixtureOrAdvance();
      const failed = await step("第一次打完", { mode: r0.mode, ok: r0.ok ?? null });
      if (scenario === "stay") {
        //  失敗當下不重新整理，看玩家繼續玩的時候畫面與磁碟差多少。
        report.findings.push({ kind: "stay_at_result", notice: await notice(), buttons: await ev("return JSON.stringify([...document.querySelectorAll('button')].map((b)=>(b.innerText||'').replace(/\\s+/g,' ').slice(0,24)).filter(Boolean).slice(0,10));") });
        const backed = (await clickText("返回首頁")) || (await clickText("回到首頁")) || (await clickText("返回"));
        await sleep(2000);
        report.findings.push({ kind: "stay_back", backed, home: await has("home-mode-moba"), world: await text("home-world-time"), notice: await notice() });
        for (let i = 0; i < 3 && (await has("home-advance-next")); i++) {
          const before = await disk();
          const uiBefore = await text("home-world-time");
          await click("home-advance-next");
          await sleep(1500);
          report.findings.push({ kind: "stay_advance", i, uiBefore, uiAfter: await text("home-world-time"), diskDayBefore: before.day, diskDayAfter: (await disk()).day, notice: await notice() });
        }
        await step("繼續玩之後（沒有重新整理）");
        await home();
        await step("最後重新整理");
        report.findings.push({ kind: "stay_after_reload", world: await text("home-world-time"), notice: await notice() });
        report.errors = errors();
        save();
        ck("失敗當下繼續玩量完", true);
        return;
      }
      await home();
      const reloaded = await step("重新整理之後");
      report.base = { start: start.disk, failed: failed.disk, reloaded: reloaded.disk, noticeFailed: failed.notice, noticeReload: reloaded.notice, firstMode: r0.mode };
      await toHub(); await toTab("moba");
      report.base.buttons = await ev("return JSON.stringify([...document.querySelectorAll('" + tid("competition-hub-panel") + " button')].map((b)=>(b.innerText||'').replace(/\\s+/g,' ').slice(0,20)).filter((x)=>/返回|出賽|棄權/.test(x)));");
      report.base.overflow = await overflow();
      const screenNow = async () => ({ tier: await text("prep-tier-name"), action: await ev("const b=document.querySelector('" + tid("prep-primary-action") + "');return JSON.stringify(b?b.dataset.action:null);"), draft: await has("hero-grid-scroll"), battle: await has("battle-hud"), head: await ev("return JSON.stringify((document.body.innerText||'').replace(/\\s+/g,' ').slice(0,140));") });
      const finishFromHere = async () => {
        const onTactic = () => ev("return JSON.stringify([...document.querySelectorAll('button')].some((b)=>(b.innerText||'').includes('開始載入')));");
        if (!(await onTactic())) await prepLoop("hero-grid-scroll");
        if (await onTactic()) {
          await clickText("開始載入");
        } else if (await has("hero-grid-scroll")) {
          for (let i = 0; i < 80; i++) { if (await ev("const b=document.querySelector('" + tid("confirm-draft") + "');return JSON.stringify(!!b&&!b.disabled);")) break; await click("hero-choose"); await sleep(900); }
          await click("confirm-draft");
          await waitFor("[...document.querySelectorAll('button')].some((b)=>(b.innerText||'').includes('開始載入'))", 60000);
          await clickText("開始載入");
        }
        if (!(await waitId("battle-hud", 300000))) return false;
        await sleep(2500);
        await ev("window.confirm=()=>true;return JSON.stringify(1);");
        await click("quick-finish-match");
        const ended = await waitFor("[...document.querySelectorAll('button')].some((b)=>/觀看重播|無法重播/.test(b.innerText||''))||[...document.querySelectorAll('span')].some((s)=>/無法重播/.test(s.innerText||''))", 360000);
        await sleep(2500);
        return ended;
      };
      if (scenario === "resume") {
        for (let i = 1; i <= 2; i++) {
          await home(); await toHub(); await toTab("moba");
          const clicked = await clickText("返回比賽");
          await sleep(2500);
          report.findings.push({ kind: "resume_landed", round: i, clicked, screen: await screenNow() });
          if (!clicked) break;
          const ended = await finishFromHere();
          await step(`第 ${i} 次返回比賽打完`, { ended });
          await home();
          await step(`第 ${i} 次之後重新整理`);
        }
      }
      if (scenario === "forfeit") {
        const clicked = await clickText("棄權");
        await sleep(800);
        const confirmed = await clickText("確定棄權");
        await sleep(1500);
        report.findings.push({ kind: "forfeit_click", clicked, confirmed, err: await bodyHas("[^\\n]*無法棄權[^\\n]*") });
        await step("棄權之後");
        await home();
        const d = await step("棄權後重新整理");
        const b = d.disk.day;
        await click("home-advance-next");
        await sleep(1300);
        await step("棄權後推進", { from: b });
        const r = await playOneFixtureOrAdvance();
        await step("棄權後下一步", { mode: r.mode, ok: r.ok ?? null, why: r.why ?? null, advanced: !!r.advanced });
        if (r.advanced) { const r2 = await playOneFixtureOrAdvance(); await step("棄權後下一場", { mode: r2.mode, ok: r2.ok ?? null, why: r2.why ?? null }); }
        await home();
        await step("棄權後最後重新整理");
      }
      if (scenario === "general") {
        await home();
        await click("home-mode-moba");
        await sleep(900);
        await prepLoop("hero-grid-scroll");
        const reached = await has("hero-grid-scroll");
        report.findings.push({ kind: "general_reach_draft", reached, screen: await bodyHas("[^\\n]*(進行中|無法|返回)[^\\n]*") });
        await step("一般對戰賽前");
        if (reached) {
          for (let i = 0; i < 80; i++) { if (await ev("const b=document.querySelector('" + tid("confirm-draft") + "');return JSON.stringify(!!b&&!b.disabled);")) break; await click("hero-choose"); await sleep(900); }
          await click("confirm-draft");
          await waitFor("[...document.querySelectorAll('button')].some((b)=>(b.innerText||'').includes('開始載入'))", 60000);
          await clickText("開始載入");
          if (await waitId("battle-hud", 300000)) {
            await sleep(2500);
            await ev("window.confirm=()=>true;return JSON.stringify(1);");
            await click("quick-finish-match");
            await waitFor("[...document.querySelectorAll('button')].some((b)=>/觀看重播|無法重播/.test(b.innerText||''))||[...document.querySelectorAll('span')].some((s)=>/無法重播/.test(s.innerText||''))", 360000);
            await sleep(2500);
          }
          await step("一般對戰打完");
          await home();
          await step("一般對戰後重新整理");
        }
      }
      report.errors = errors();
      save();
      ck("恢復路徑量完", true);
    }

    // ═══ 3 第 253 天休賽期真 UI ═══════════════════════════════════════
    if (CASE === "offseason") {
      for (const [label, w, h, mob, action] of [["1366 全部續約", 1366, 900, false, "renew"], ["390 續約＋放走", 390, 844, true, "mixed"]]) {
        await setWidth(w, h, mob);
        await loadCheckpoint(path.join(W1, "checkpoints", arg("start") ?? "022-offseason-open-d253.json"), "第 253 天休賽期剛開啟。前面都是 W1 Node 真模擬，不是 UI");
        const s0 = await step(`${label} 起點`);
        const enter = await has("home-offseason-enter");
        report.findings.push({ kind: "home_entry", label, enter, card: await text("home-offseason"), overflow: await overflow() });
        const b = s0.disk.day;
        await click("home-advance-next");
        await sleep(1200);
        report.findings.push({ kind: "blocked_before_complete", label, dayBefore: b, dayAfter: (await disk()).day, note: await bodyHas("[^\\n]*休賽期[^\\n]*") });
        await click("home-offseason-enter");
        const onScreen = await waitId("offseason-screen", 20000);
        report.findings.push({ kind: "screen", label, onScreen, pending: await text("offseason-pending"), funds: await text("offseason-funds"), overflow: await overflow() });
        const renewIds = await ev("return JSON.stringify([...document.querySelectorAll('[data-testid^=\"offseason-renew-\"]')].map((b)=>b.dataset.testid.replace('offseason-renew-','')));");
        report.findings.push({ kind: "expiring", label, renewIds });
        const rows = [];
        for (let i = 0; i < (renewIds ?? []).length; i++) {
          const id = renewIds[i];
          const act = action === "mixed" && i === 0 ? "release" : "renew";
          const f0 = (await disk()).funds, p0 = (await disk()).players;
          await click(`offseason-${act}-${id}`);
          await sleep(1000);
          const d = await disk();
          rows.push({ id, act, fundsDelta: d.funds - f0, players: `${p0}→${d.players}`, note: await text("offseason-note") });
        }
        report.findings.push({ kind: "decisions", label, rows, pendingAfter: await text("offseason-pending") });
        await step(`${label} 決策後`);
        await click("offseason-complete-btn");
        await sleep(1300);
        await step(`${label} 完成`);
        await home();
        const afterReload = await step(`${label} 重新整理後`);
        report.findings.push({ kind: "after", label, offSeasonOpen: afterReload.disk.offSeasonOpen, stillEntry: await has("home-offseason-enter") });
        const d0 = (await disk()).day;
        await click("home-advance-next");
        await sleep(1300);
        const d1 = (await disk()).day;
        report.findings.push({ kind: "world_moves_again", label, from: d0, to: d1 });
        //  真打下一場：名單動過之後還出得了賽
        const r = await playOneFixtureOrAdvance();
        await step(`${label} 休賽期後下一步`, { mode: r.mode, ok: r.ok ?? null, why: r.why ?? null, err: r.err ?? null, advanced: !!r.advanced });
        if (r.advanced) { const r2 = await playOneFixtureOrAdvance(); await step(`${label} 休賽期後第一場`, { mode: r2.mode, ok: r2.ok ?? null, why: r2.why ?? null, err: r2.err ?? null }); }
        save();
      }
      report.errors = errors();
      ck("休賽期量完", true);
    }

    // ═══ 4 CS Major BO3，含中途重新整理 ═══════════════════════════════
    if (CASE === "bo3") {
      await loadCheckpoint(path.join(ELITE, "checkpoints", arg("start") ?? "008-every10-f50.json"), "強隊開局第 86 天 Major 開打前。前面 50 個賽程是 W1 Node 真模擬，不是 UI");
      const s0 = await step("起點");
      await toHub(); await toTab("cs");
      report.findings.push({ kind: "major_entry", play: await has("cs-league-play"), today: await text("cs-league-today"), major: await text("cs-hub-my-major") });
      await click("cs-league-play");
      await sleep(1200);
      const startErr = await text("cs-hub-error");
      if (startErr) { report.findings.push({ kind: "start_error", startErr }); }
      const fixture = ((await disk()).cs?.launched ?? [])[0] ?? null;
      report.fixture = fixture;
      const maps = [];
      for (let m = 0; m < 4; m++) {
        const d0 = await disk();
        //  第 1 張比賽中重新整理；第 2 張之前（選圖頁）重新整理
        if (m === 1) { await step("第 2 張開打前重新整理之前"); await home(); await step("第 2 張開打前重新整理之後"); await toHub(); await toTab("cs"); const res = await has("cs-league-resume"); report.findings.push({ kind: "between_maps_reload", resumeButton: res }); if (res) { await click("cs-league-resume"); await sleep(1500); } }
        const r = await playCsMapToResult({ reloadMidBattle: m === 0 });
        const d1 = await disk();
        maps.push({ map: m + 1, ok: r.ok, why: r.why ?? null, banner: r.banner ?? null, txDelta: d1.tx - d0.tx, csHistoryDelta: d1.csHistory - d0.csHistory, fundsDelta: d1.funds - d0.funds });
        await step(`第 ${m + 1} 張結算`, { ok: r.ok, why: r.why ?? null, banner: r.banner ?? null });
        if (!r.ok) { report.findings.push({ kind: "map_failed", map: m + 1, why: r.why }); break; }
        //  真的按「返回」：BO3 沒打完要接下一張
        await clickText("返回");
        await sleep(1800);
        const series = await text("cs-series-banner");
        const mapScreen = (await has("cs-map-confirm")) || (await has("cs-tactic-confirm"));
        const fx = await ev("const p=JSON.parse(localStorage.getItem('esmo.profile.v1'));const s=p.competitionByMode.cs;const f=(s.fixtures||[]).find((x)=>x.id===" + JSON.stringify(fixture) + ");const o=(Array.isArray(s.outcomes)?s.outcomes:Object.values(s.outcomes||{})).filter((x)=>x.fixtureId===" + JSON.stringify(fixture) + ");return JSON.stringify({status:f&&f.status,outcomes:o.length,score:o[0]&&o[0].score,source:o[0]&&o[0].resultSource});");
        report.findings.push({ kind: "after_map", map: m + 1, series, mapScreen, fixture: fx });
        if (fx?.status === "completed") break;
      }
      report.maps = maps;
      const end = await step("系列賽結束");
      await home();
      const reloaded = await step("系列賽結束後重新整理");
      report.findings.push({ kind: "series_totals", maps: maps.length, tx: `${s0.disk.tx}→${reloaded.disk.tx}`, csHistory: `${s0.disk.csHistory}→${reloaded.disk.csHistory}`, sameAfterReload: end.disk.tx === reloaded.disk.tx && end.disk.funds === reloaded.disk.funds });
      report.errors = errors();
      save();
      ck("BO3 量完", true);
    }

    // ═══ 5 賽程、換季、存檔恢復的連續流程 ═════════════════════════════
    if (CASE === "continuous") {
      await loadCheckpoint(path.join(ELITE, "checkpoints", arg("start") ?? "009-final-cs-s1.json"), "強隊開局第 88 天，CS S1 剛封存。前面都是 W1 Node 真模擬，不是 UI。之後全部真 UI");
      let s = await step("起點");
      //  CS 換季：賽事中心 → Recap → 開始下一季
      await toHub(); await toTab("cs");
      const recap = await has("cs-hub-recap-btn");
      report.findings.push({ kind: "cs_recap_entry", recap });
      if (recap) {
        await click("cs-hub-recap-btn");
        await sleep(1200);
        const hasRoll = await has("cs-recap-roll");
        report.findings.push({ kind: "cs_roll_button", hasRoll, overflow: await overflow() });
        if (hasRoll) { await click("cs-recap-roll"); await sleep(1400); }
      }
      s = await step("CS 換季後");
      report.findings.push({ kind: "cs_rolled", season: s.disk.cs?.season, histCs: s.disk.histCs });
      await home();
      s = await step("CS 換季後重新整理");
      //  把 MOBA S1 打完（真 UI），封存，換季
      const games = [];
      for (let i = 0; i < 25; i++) {
        const d = await disk();
        if (d.moba?.final) break;
        const r = await playOneFixtureOrAdvance();
        const after = await disk();
        games.push({ mode: r.mode, ok: r.ok ?? null, why: r.why ?? null, day: after.day, txDelta: after.tx - d.tx, advanced: !!r.advanced });
        await step(`S1 尾段 ${r.mode ?? "推進"}`, { ok: r.ok ?? null, why: r.why ?? null });
        if (r.ok === false) { report.findings.push({ kind: "fixture_failed", ...r }); break; }
        if (r.advanced && r.from === r.to) { report.findings.push({ kind: "advance_blocked", day: r.from }); break; }
      }
      report.games = games;
      await home(); await toHub(); await toTab("moba");
      const rollText = await bodyHas("開始第 \\d+ 賽季");
      report.findings.push({ kind: "moba_roll_button", rollText });
      if (rollText?.length) { await clickText("開始第"); await sleep(1500); }
      s = await step("MOBA 換季後");
      await home();
      s = await step("MOBA 換季後重新整理");
      report.findings.push({ kind: "moba_rolled", season: s.disk.moba?.season, histMoba: s.disk.histMoba });
      //  第二季各打一場（CS 已經換季、MOBA 剛換季）
      let gotM = false, gotC = false;
      for (let i = 0; i < 14 && !(gotM && gotC); i++) {
        const d = await disk();
        const r = await playOneFixtureOrAdvance();
        const a = await disk();
        await step(`S2 ${r.mode ?? "推進"}`, { ok: r.ok ?? null, why: r.why ?? null, txDelta: a.tx - d.tx });
        if (r.mode === "moba" && r.ok) gotM = true;
        if (r.mode === "cs" && r.ok) gotC = true;
        if (r.ok === false) { report.findings.push({ kind: "fixture_failed", ...r }); break; }
        if (r.advanced && r.from === r.to) { report.findings.push({ kind: "advance_blocked", day: r.from }); break; }
      }
      await home();
      s = await step("結尾重新整理");
      report.findings.push({ kind: "s2_played", moba: gotM, cs: gotC });
      report.errors = errors();
      save();
      ck("連續流程量完", true);
    }
  },
});
killProcessTree?.(preview.pid);
try { preview.kill(); } catch { /* best effort */ }
save();
await finishGate(result);
process.exit(0);
