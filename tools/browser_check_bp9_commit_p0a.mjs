#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_bp9_commit_p0a.mjs — BP-9 P0-A：真 Chrome、真比賽、真配額
//
//  執行：先 build，再
//    node tools/browser_check_bp9_commit_p0a.mjs --case=<normal|fault|limit-moba|limit-cs>
//         --checkpoint=<W1 真模擬 checkpoint> --out=<json>
//
//  打本機 vite preview 的打包結果，隔離 Chrome profile，碰不到玩家存檔。
//
//  ── 各 case 驗什麼 ────────────────────────────────────────────────
//  normal      還沒滿的存檔打真 MOBA：入帳、熟練 +10、Season +1、日誌清掉、重新整理不變
//  fault       真 MOBA 的 useBattleFeed ＋ 指定鍵寫入失敗：帳已入、熟練或 Season 待補；
//              按重試補完；中途重新整理也補完；都不重複
//  limit-moba  第 254 天真實超限（W2 重現的那一份）：熟練不再 790 → 800 → 810
//  limit-cs    第 228 天真實超限：不再「獎金入了、紀錄沒了」
//  probe       配額全滿時，同樣內容原地覆寫要成功、多一個字要失敗（日誌讓位的探測靠這個）
//  unfinishable 已入帳但算不完的日誌：橫幅與重試真的畫得出來、390 不破版、修好後自己消失
//
//  ⚠⚠ limit 兩個 case 不注入任何資料，存檔失敗是真比賽自然累積出來的。
//  ⚠⚠ fault 用頁面裡換掉 setItem 做故障注入，那是唯一能在真 hook 上打到第 ③ 步的辦法。
//  ⚠⚠ checkpoint 之前的進度是 W1 Node 真模擬，不是 UI。報告會照實標出來。
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
const CHECKPOINT = arg("checkpoint");
const OUT = arg("out");
//  --url=https://rayhuang0323.github.io/ESMO-/ 打正式站。Chrome 每次都是全新的 user-data-dir，碰不到真實玩家的存檔。
const EXTERNAL = arg("url");
if (!CASE || (!CHECKPOINT && CASE !== "probe") || (!EXTERNAL && !fs.existsSync("dist/index.html"))) { console.error("需要 --case、--checkpoint，且要先 build（或給 --url）"); process.exit(2); }
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.once("error", rej); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); }); });
const port = EXTERNAL ? null : await freePort();
const preview = EXTERNAL ? null : spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "ignore" });
const url = EXTERNAL ?? `http://127.0.0.1:${port}/ESMO-/`;
for (let i = 0; i < (EXTERNAL ? 0 : 120); i++) { try { if ((await fetch(url)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }

const J = (raw) => { const s = String(raw); for (const t of [s, s.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
const tid = (id) => "[data-testid=\"" + id + "\"]";
const report = { case: CASE, url, checkpoint: CHECKPOINT ? path.basename(CHECKPOINT) : null, nonUi: [], steps: [], findings: [] };
const save = () => { if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 1)); };

const result = await runGate({
  name: `BP-9 P0-A ${CASE}`,
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
    //  Owner（BP-9 F5）：頂到上限時要說是暫時保護、等下一版；不得叫玩家清資料、開新局或去按不存在的棄權。
    const fullText = async (label) => {
      const t = await ev("const e=document.querySelector('" + tid("save-status-notice") + "');return JSON.stringify(e?e.innerText:'');");
      report.findings.push({ kind: "full_text", label, text: t });
      ck(`${label}：提示說存檔空間已滿、存檔完好`, /存檔空間已滿/.test(t) && /存檔完好/.test(t), t);
      ck(`${label}：提示說是暫時的、下一版會恢復`, /下一版/.test(t) && /恢復/.test(t), t);
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
    //  把日曆推到下一場玩家賽程，回傳是哪個項目。
    const reachFixture = async (want = null) => {
      for (let i = 0; i < 30; i++) {
        await home(); await toHub(); await toTab("cs");
        const cs = (await has("cs-league-play")) || (await has("cs-hub-lineup-required"));
        await toTab("moba");
        const moba = await hasMobaFixture();
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
          if (!played.ok || (await notice()).on) return null;
          continue;
        }
        await home();
        const before = (await disk())?.day;
        await click("home-advance-next");
        await sleep(1300);
        if ((await disk())?.day === before) return null;
      }
      return null;
    };
    const startMobaFromHub = async (beforeFinish) => {
      await toTab("moba");
      if (!(await clickText("出賽"))) return { ok: false, why: "沒有出賽按鈕" };
      await sleep(900);
      return finishMoba(beforeFinish);
    };

    if (CASE === "probe") {
      await chrome.navigate(url); await sleep(1200);
      const r = await ev(`
        localStorage.clear();
        let chunk='x'.repeat(1<<20);let i=0;
        while(chunk.length>0){try{localStorage.setItem('fill'+i,chunk);i++;}catch(e){chunk=chunk.slice(0,chunk.length>>1);}}
        const J='esmo.commit.journal.v1';const k='fill0';const raw=localStorage.getItem(k);
        const out={};
        try{localStorage.setItem(k,raw);out.sameSize=true;}catch(e){out.sameSize=e.name;}
        try{localStorage.setItem(k,raw+'yy');out.oneMore=true;}catch(e){out.oneMore=e.name;}
        try{localStorage.setItem(J,'z');out.newKey=true;}catch(e){out.newKey=e.name;}
        out.still=localStorage.getItem(k)===raw;
        localStorage.removeItem(k);
        try{localStorage.setItem(k,raw);out.restored=true;}catch(e){out.restored=e.name;}
        let total=0;for(let n=0;n<localStorage.length;n++){const key=localStorage.key(n);total+=key.length+localStorage.getItem(key).length;}
        out.total=total;localStorage.clear();
        return JSON.stringify(out);`);
      report.findings.push({ kind: "probe", ...r });
      ck("全滿時同樣內容覆寫成功", r?.sameSize === true, JSON.stringify(r));
      ck("全滿時多兩個字元會失敗（確實是滿的）", r?.oneMore === "QuotaExceededError", JSON.stringify(r));
      ck("失敗不會動到原值", r?.still === true, JSON.stringify(r));
      ck("拿掉之後放回去成功", r?.restored === true, JSON.stringify(r));
      save();
      return;
    }

    if (CASE === "unfinishable") {
      await loadCheckpoint();
      const s0 = await step("起點");
      //  在已入帳的那一筆上放一份缺 players 的日誌。內容取自存檔裡真的賽果。
      const planted = await ev(`
        const p=JSON.parse(localStorage.getItem('esmo.profile.v1'));const txs=Object.keys(p.processedMatchTransactions||{});
        const h=JSON.parse(localStorage.getItem('esmo.season.v1')).history;const full=h[h.length-1];const r={...full};delete r.players;
        const j={schema:'MatchCommitJournal.v1',state:'prepared',mode:'moba',commitKey:'gate:unfinishable',matchId:'gate',txId:txs[txs.length-1],derived:true,practice:false,at:1,result:{...r,timeline:[]}};
        localStorage.setItem('esmo.commit.journal.v1',JSON.stringify(j));
        window.name=JSON.stringify(full.players||null);
        return JSON.stringify({tx:txs.length,hasPlayers:!!full.players});`);
      ck("前提：真的賽果有 players、帳本有資料", planted?.hasPlayers === true && planted?.tx > 0, JSON.stringify(planted));
      await home();
      const s1 = await step("開機之後");
      const body = () => ev("const e=document.querySelector('" + tid("save-status-notice") + "');return JSON.stringify(e?e.innerText:null);");
      ck("橫幅出現，類別是已入帳", s1.notice.on && s1.notice.kind === "derived", JSON.stringify(s1.notice));
      ck("橫幅文字：說的是紀錄還沒補上", /部分紀錄還沒補上/.test(s1.notice.message ?? ""), s1.notice.message);
      ck("橫幅文字：說明會擋住、不要開新局", /先停住/.test((await body()) ?? "") && /不要開新局/.test((await body()) ?? ""), await body());
      ck("有重試按鈕", s1.notice.retry === true);
      ck("資料沒動", s1.disk.funds === s0.disk.funds && s1.disk.tx === s0.disk.tx && s1.disk.heroGames === s0.disk.heroGames && s1.disk.seasonLen === s0.disk.seasonLen, JSON.stringify(s1.disk));
      await setWidth(390, 844, true);
      await sleep(800);
      const box390 = await ev("const e=document.querySelector('" + tid("save-status-notice") + "');const b=document.querySelector('" + tid("save-status-retry") + "');const r=e?e.getBoundingClientRect():null;const q=b?b.getBoundingClientRect():null;return JSON.stringify({l:r&&r.left,r:r&&r.right,bot:r&&r.bottom,h:r&&r.height,bw:q&&q.width,bh:q&&q.height,iw:innerWidth,ih:innerHeight});");
      report.findings.push({ kind: "banner_390", ...box390 });
      ck("390：橫幅在畫面內、沒有橫向溢出", (await overflow()) <= 1 && box390?.l >= 0 && box390?.r <= box390?.iw && box390?.bot <= box390?.ih, JSON.stringify(box390));
      ck("390：重試按鈕夠大", box390?.bw >= 44 && box390?.bh >= 44, JSON.stringify(box390));
      await setWidth(1366, 900, false);
      await sleep(500);
      await click("save-status-retry");
      await sleep(1500);
      const s2 = await step("按重試");
      ck("按重試：橫幅與按鈕還在、資料不動、沒有 JS 錯誤", s2.notice.on && s2.notice.retry && s2.disk.funds === s0.disk.funds && s2.disk.heroGames === s0.disk.heroGames && errors().page.length === 0, errors().page.join(" | "));
      const dayBefore = s2.disk.day;
      await click("home-advance-next");
      await sleep(1500);
      const s3 = await step("按推進");
      const said = await ev("return JSON.stringify((document.body.innerText||'').includes('紀錄還沒補完'));");
      report.findings.push({ kind: "advance_while_unfinishable", from: dayBefore, to: s3.disk.day, said });
      ck("按推進：日子不動", s3.disk.day === dayBefore, `${dayBefore}→${s3.disk.day}`);
      await home();
      const s4 = await step("重新整理");
      ck("重新整理：橫幅與重試還在", s4.notice.on && s4.notice.kind === "derived" && s4.notice.retry, JSON.stringify(s4.notice));
      //  日誌修好（這裡把 players 放回去）：開機自己補完，橫幅消失。
      await ev(`
        const j=JSON.parse(localStorage.getItem('esmo.commit.journal.v1'));j.result.players=JSON.parse(window.name);
        localStorage.setItem('esmo.commit.journal.v1',JSON.stringify(j));return JSON.stringify(true);`);
      await home();
      const s5 = await step("日誌修好後開機");
      ck("修好後開機：橫幅消失、日誌清掉", !s5.notice.on && s5.disk.journal === null, JSON.stringify({ n: s5.notice, j: s5.disk.journal }));
      ck("修好後開機：帳不動", s5.disk.funds === s0.disk.funds && s5.disk.tx === s0.disk.tx, JSON.stringify(s5.disk));
      report.errors = errors();
      save();
      return;
    }

    if (CASE === "normal") {
      await loadCheckpoint();
      const mode = await reachFixture("moba");
      ck("有 MOBA 賽程可打", mode === "moba", mode);
      const s0 = await step("打之前");
      const r = await startMobaFromHub();
      ck("真 MOBA 打到結算", r.ok, r.why);
      const s1 = await step("打完");
      ck("入帳一筆", s1.disk.tx === s0.disk.tx + 1, `${s0.disk.tx}→${s1.disk.tx}`);
      ck("熟練恰好 +10", s1.disk.heroGames === s0.disk.heroGames + 10, `${s0.disk.heroGames}→${s1.disk.heroGames}`);
      ck("Season 恰好 +1，帶穩定識別", s1.disk.seasonLen === Math.min(50, s0.disk.seasonLen + 1) && /^fx:moba:/.test(s1.disk.seasonCommit ?? ""), `${s0.disk.seasonLen}→${s1.disk.seasonLen} ${s1.disk.seasonCommit}`);
      ck("賽程已收尾、場次已結束", s1.disk.launchedMoba.length === 0 && s1.disk.sessionState === "completed", `${s1.disk.launchedMoba} ${s1.disk.sessionState}`);
      ck("日誌與警示都沒留", s1.disk.journal === null && s1.disk.alert === null && !s1.notice.on, `${s1.disk.journal}/${s1.disk.alert}`);
      ck("賽後畫面沒有未入帳的提示", (await has("reward-receipt-unsaved")) === false && (await ev("return JSON.stringify((document.body.innerText||'').includes('比賽結果沒有存起來')===false);")));
      ck("賽後畫面顯示這場的成長明細", await ev("return JSON.stringify(/Lv\\.?\\s*\\d+/.test(document.body.innerText||''));"));
      await home();
      const s2 = await step("重新整理");
      ck("重新整理之後完全相同", s2.disk.tx === s1.disk.tx && s2.disk.heroGames === s1.disk.heroGames && s2.disk.seasonLen === s1.disk.seasonLen && s2.disk.funds === s1.disk.funds, JSON.stringify(s2.disk));
      ck("沒有隔離檔、沒有歷史異常紀錄", s2.disk.corrupt.length === 0 && !s2.disk.audit, `${s2.disk.corrupt} ${s2.disk.audit}`);
    }

    if (CASE === "fault") {
      await loadCheckpoint();
      //  ── A：帳本進去、Season 寫不進去，同一個畫面按重試 ──
      let mode = await reachFixture("moba");
      ck("A 有 MOBA 賽程可打", mode === "moba", mode);
      const a0 = await step("A 打之前");
      let r = await startMobaFromHub(() => faultKeys(["esmo.season.v1"]));
      ck("A 真 MOBA 打到結算", r.ok, r.why);
      const a1 = await step("A 打完（Season 寫入失敗）");
      ck("A 帳已入", a1.disk.tx === a0.disk.tx + 1, `${a0.disk.tx}→${a1.disk.tx}`);
      ck("A 熟練 +10、Season 待補", a1.disk.heroGames === a0.disk.heroGames + 10 && a1.disk.seasonLen === a0.disk.seasonLen, `${a1.disk.heroGames} ${a1.disk.seasonLen}`);
      ck("A 日誌留著", a1.disk.journal !== null, a1.disk.journal);
      ck("A 提示玩家「部分紀錄還沒寫完」", a1.notice.on && a1.notice.kind === "derived" && a1.notice.retry, JSON.stringify(a1.notice));
      await click("save-status-retry");
      await sleep(1000);
      const a2 = await step("A 故障還在時按重試");
      ck("A 故障還在時重試：熟練不會多算", a2.disk.heroGames === a1.disk.heroGames, `${a1.disk.heroGames}→${a2.disk.heroGames}`);
      await faultOff();
      await click("save-status-retry");
      await sleep(1000);
      const a3 = await step("A 故障排除後按重試");
      ck("A 補完 Season，熟練仍只 +10", a3.disk.seasonLen === Math.min(50, a0.disk.seasonLen + 1) && a3.disk.heroGames === a0.disk.heroGames + 10, `${a3.disk.seasonLen} ${a3.disk.heroGames}`);
      ck("A 日誌與提示都清掉", a3.disk.journal === null && !a3.notice.on, `${a3.disk.journal} ${JSON.stringify(a3.notice)}`);
      //  ── B：帳本進去、熟練和 Season 都寫不進去，直接重新整理 ──
      mode = await reachFixture("moba");
      if (mode === "moba") {
        const b0 = await step("B 打之前");
        r = await startMobaFromHub(() => faultKeys(["esmo.season.v1", "esmo.heroProgress.v2"]));
        ck("B 真 MOBA 打到結算", r.ok, r.why);
        const b1 = await step("B 打完（熟練與 Season 都寫不進去）");
        report.findings.push({ kind: "B_after_commit", disk: b1.disk, notice: b1.notice });
        const counted = b1.disk.tx === b0.disk.tx + 1;
        await home();
        const b2 = await step("B 重新整理（開機恢復）");
        if (counted) {
          ck("B 帳已入：開機補完熟練與 Season，各一次", b2.disk.heroGames === b0.disk.heroGames + 10 && b2.disk.seasonLen === Math.min(50, b0.disk.seasonLen + 1), `${b2.disk.heroGames} ${b2.disk.seasonLen}`);
          ck("B 帳已入：開機後日誌與提示都清掉", b2.disk.journal === null && !b2.notice.on, `${b2.disk.journal} ${JSON.stringify(b2.notice)}`);
        } else {
          //  熟練同時寫在 profile 那次存檔裡，寫不進去時整筆還原。這也是合法結果：什麼都沒發生。
          ck("B 帳沒入：什麼都沒多", b2.disk.heroGames === b0.disk.heroGames && b2.disk.seasonLen === b0.disk.seasonLen && b2.disk.funds === b0.disk.funds, `${b2.disk.heroGames} ${b2.disk.seasonLen} ${b2.disk.funds}`);
          ck("B 帳沒入：重新整理後警示還在", b2.notice.on && b2.notice.kind === "match", JSON.stringify(b2.notice));
        }
        await home();
        const b3 = await step("B 再重新整理一次");
        ck("B 再開機一次完全相同", b3.disk.heroGames === b2.disk.heroGames && b3.disk.seasonLen === b2.disk.seasonLen && b3.disk.tx === b2.disk.tx && b3.disk.funds === b2.disk.funds);
        if (!counted) {
          //  重新整理之後還握著日誌：可以直接補送這場，不用重打。
          ck("B 重新整理後有重試可按", b3.notice.retry, JSON.stringify(b3.notice));
          await click("save-status-retry");
          await sleep(1500);
          const b4 = await step("B 重新整理後按重試");
          ck("B 用日誌補送：入帳一次、熟練 +10、Season +1", b4.disk.tx === b0.disk.tx + 1 && b4.disk.heroGames === b0.disk.heroGames + 10 && b4.disk.seasonLen === Math.min(50, b0.disk.seasonLen + 1), JSON.stringify(b4.disk));
          ck("B 用日誌補送：賽程收尾、日誌與提示清掉", b4.disk.launchedMoba.length === 0 && b4.disk.journal === null && !b4.notice.on, JSON.stringify(b4.notice));
        }
      } else {
        report.findings.push({ kind: "B_not_reached", mode });
        ck("B 有下一場 MOBA 可打", false, mode);
      }
      //  ── C：profile 就寫不進去。賽後畫面不能顯示「結算中」或別場的成長 ──
      mode = await reachFixture("moba");
      if (mode === "moba") {
        const c0 = await step("C 打之前");
        r = await startMobaFromHub(() => faultKeys(["esmo.profile.v1"]));
        ck("C 真 MOBA 打到結算", r.ok, r.why);
        const c1 = await step("C 打完（profile 寫入失敗）");
        ck("C 什麼都沒入帳", c1.disk.tx === c0.disk.tx && c1.disk.heroGames === c0.disk.heroGames && c1.disk.seasonLen === c0.disk.seasonLen && c1.disk.funds === c0.disk.funds, JSON.stringify(c1.disk));
        ck("C 提示比賽結果沒有存起來", c1.notice.on && c1.notice.kind === "match", JSON.stringify(c1.notice));
        ck("C 賽後畫面明確說沒入帳", await has("reward-receipt-unsaved"));
        await faultOff();
        await click("save-status-retry");
        await sleep(1500);
        const c2 = await step("C 故障排除後按重試");
        ck("C 重試成功：入帳一次、熟練 +10、Season +1", c2.disk.tx === c0.disk.tx + 1 && c2.disk.heroGames === c0.disk.heroGames + 10 && c2.disk.seasonLen === Math.min(50, c0.disk.seasonLen + 1), JSON.stringify(c2.disk));
        ck("C 賽程收尾、提示清掉", c2.disk.launchedMoba.length === 0 && !c2.notice.on, JSON.stringify(c2.notice));
      } else {
        report.findings.push({ kind: "C_not_reached", mode });
        ck("C 有下一場 MOBA 可打", false, mode);
      }
      //  ── D：帳本進去、Season 沒進去，不按重試直接重新整理 ──
      mode = await reachFixture("moba");
      if (mode === "moba") {
        const d0 = await step("D 打之前");
        r = await startMobaFromHub(() => faultKeys(["esmo.season.v1"]));
        ck("D 真 MOBA 打到結算", r.ok, r.why);
        const d1 = await step("D 打完（Season 寫入失敗）");
        ck("D 帳已入、Season 待補", d1.disk.tx === d0.disk.tx + 1 && d1.disk.seasonLen === d0.disk.seasonLen && d1.disk.journal !== null, JSON.stringify(d1.disk));
        await home();
        const d2 = await step("D 重新整理（開機恢復）");
        ck("D 開機補完 Season，熟練只 +10", d2.disk.seasonLen === Math.min(50, d0.disk.seasonLen + 1) && d2.disk.heroGames === d0.disk.heroGames + 10 && d2.disk.tx === d0.disk.tx + 1, JSON.stringify(d2.disk));
        ck("D 開機後日誌與提示都清掉", d2.disk.journal === null && !d2.notice.on, JSON.stringify(d2.notice));
        await home();
        const d3 = await step("D 再重新整理一次");
        ck("D 再開機一次完全相同", d3.disk.heroGames === d2.disk.heroGames && d3.disk.seasonLen === d2.disk.seasonLen && d3.disk.tx === d2.disk.tx && d3.disk.funds === d2.disk.funds);
      } else {
        report.findings.push({ kind: "D_not_reached", mode });
        ck("D 有下一場 MOBA 可打", false, mode);
      }
      ck("整段沒有 JS 錯誤", errors().page.length === 0, errors().page.join(" | "));
      report.errors = errors();
    }

    if (CASE === "limit-moba") {
      await loadCheckpoint();
      const start = await step("起點");
      let mode = null;
      for (let i = 0; i < 6 && mode !== "moba"; i++) {
        mode = await reachFixture();
        if (mode === "cs") {
          const r = await startCsFromHub();
          await step("先打掉 CS", { ok: r.ok, why: r.why ?? null });
          report.findings.push({ kind: "cs_before_moba", ok: r.ok, why: r.why, err: r.err ?? null });
          if (!r.ok) break;
          if ((await notice()).on) break;
        }
      }
      ck("真比賽走到 MOBA 賽程", mode === "moba", mode);
      if (mode === "moba") {
        const s0 = await step("MOBA 打之前");
        const r = await startMobaFromHub();
        ck("真 MOBA 打到結算", r.ok, r.why);
        const s1 = await step("第一次打完");
        report.findings.push({ kind: "first_moba", disk: s1.disk, notice: s1.notice });
        const overflowed = s1.disk.tx === s0.disk.tx;
        ck("這份存檔真的超限（W2 的情況）", overflowed, `${s0.disk.tx}→${s1.disk.tx}，總量 ${s1.disk.total}`);
        if (overflowed) {
          ck("超限：熟練沒有動（舊版 780→790）", s1.disk.heroGames === s0.disk.heroGames, `${s0.disk.heroGames}→${s1.disk.heroGames}`);
          ck("超限：Season 沒有多（舊版會多一筆矛盾賽果）", s1.disk.seasonLen === s0.disk.seasonLen, `${s0.disk.seasonLen}→${s1.disk.seasonLen}`);
          ck("超限：資金沒有動", s1.disk.funds === s0.disk.funds);
          ck("超限：畫面有提示", s1.notice.on && s1.notice.kind === "match", JSON.stringify(s1.notice));
          ck("超限：賽後畫面明確說沒入帳", await has("reward-receipt-unsaved"));
          ck("超限：沒有 JS 錯誤", errors().page.length === 0, errors().page.join(" | "));
          if (s1.notice.retry) {
            await click("save-status-retry");
            await sleep(1500);
            const s1b = await step("還是超限時按重試");
            ck("超限重試：不多算", s1b.disk.heroGames === s0.disk.heroGames && s1b.disk.tx === s0.disk.tx && s1b.disk.funds === s0.disk.funds, JSON.stringify(s1b.disk));
          }
          //  390 寬：提示要看得到、不能撐破版面。
          await setWidth(390, 844, true);
          await sleep(800);
          ck("390：提示還在、沒有橫向溢出", (await notice()).on && (await overflow()) <= 1, `${await overflow()}`);
          await setWidth(1366, 900, false);
          await sleep(500);
          await home();
          const s2 = await step("重新整理");
          ck("重新整理：提示還在（舊版消失）", s2.notice.on && s2.notice.kind === "match", JSON.stringify(s2.notice));
          await fullText("MOBA 超限");
          ck("重新整理：熟練、Season、資金、帳本都沒動", s2.disk.heroGames === s0.disk.heroGames && s2.disk.seasonLen === s0.disk.seasonLen && s2.disk.funds === s0.disk.funds && s2.disk.tx === s0.disk.tx, JSON.stringify(s2.disk));
          ck("重新整理：沒有隔離檔", s2.disk.corrupt.length === 0, s2.disk.corrupt.join(","));
          //  W2：重打一次多算一次熟練（790 → 800 → 810）。
          let cur = s2;
          for (let round = 1; round <= 2; round++) {
            await toHub(); await toTab("moba");
            const clicked = await clickText("返回比賽");
            await sleep(2500);
            ck(`重打 ${round}：有返回比賽`, clicked);
            if (!clicked) break;
            const again = await finishMoba();
            ck(`重打 ${round}：打到結算`, again.ok, again.why);
            cur = await step(`重打第 ${round} 次之後`);
            ck(`重打 ${round}：熟練不動（舊版 +10）`, cur.disk.heroGames === s0.disk.heroGames, `${s0.disk.heroGames}→${cur.disk.heroGames}`);
            ck(`重打 ${round}：Season、資金、帳本不動`, cur.disk.seasonLen === s0.disk.seasonLen && cur.disk.funds === s0.disk.funds && cur.disk.tx === s0.disk.tx, JSON.stringify(cur.disk));
            await home();
          }
          //  棄權是目前讓日曆繼續的出口。
          await toHub(); await toTab("moba");
          const clicked = await clickText("棄權");
          await sleep(800);
          const confirmed = await clickText("確定棄權");
          await sleep(1500);
          ck("棄權按得到", clicked && confirmed, `${clicked}/${confirmed}`);
          const s3 = await step("棄權之後");
          report.findings.push({ kind: "forfeit_at_limit", disk: s3.disk, notice: s3.notice, err: await text("competition-hub-error") });
          if (s3.disk.launchedMoba.length === 0) {
            ck("棄權：賽程收尾、場次一起結束", s3.disk.sessionState === "abandoned", s3.disk.sessionState);
            ck("棄權：比賽提示清掉", s3.notice.kind !== "match", JSON.stringify(s3.notice));
            ck("棄權：熟練與 Season 沒動", s3.disk.heroGames === s0.disk.heroGames && s3.disk.seasonLen === s0.disk.seasonLen);
            await home();
            const before = (await step("棄權後重新整理")).disk.day;
            await click("home-advance-next");
            await sleep(1500);
            const s4 = await step("棄權後推進日曆");
            report.findings.push({ kind: "advance_after_forfeit", from: before, to: s4.disk.day, notice: s4.notice });
            ck("棄權後：日曆可以繼續，或明確提示存不進去", s4.disk.day > before || s4.notice.on, `${before}→${s4.disk.day}`);
          } else {
            //  連棄權都存不進去：安全停止，必須提示，不得留下矛盾。
            ck("棄權存不進去：有提示、資料沒動", s3.notice.on && s3.disk.heroGames === s0.disk.heroGames && s3.disk.funds === s0.disk.funds, JSON.stringify(s3.disk));
          }
        }
      }
      report.start = start.disk;
      report.errors = errors();
    }

    if (CASE === "limit-cs") {
      await loadCheckpoint();
      await step("起點");
      let played = 0, failedAt = null;
      for (let i = 0; i < 24 && played < 8 && !failedAt; i++) {
        const mode = await reachFixture("cs");
        if (mode !== "cs") { report.findings.push({ kind: "cs_not_reached", mode }); break; }
        const s0 = await step(`CS 第 ${played + 1} 場打之前`);
        const r = await startCsFromHub();
        ck(`CS 第 ${played + 1} 場打到結算`, r.ok, `${r.why} ${r.err ?? ""}`);
        if (!r.ok) break;
        const s1 = await step(`CS 第 ${played + 1} 場打完`);
        played++;
        if (s1.disk.tx === s0.disk.tx) failedAt = { s0, s1 };
        else {
          ck(`CS 第 ${played} 場：獎金與紀錄同時存在`, s1.disk.csHistory === s0.disk.csHistory + 1 || s1.disk.csHistory === s0.disk.csHistory, `${s0.disk.csHistory}→${s1.disk.csHistory}`);
          ck(`CS 第 ${played} 場：沒有存檔提示`, !s1.notice.on, JSON.stringify(s1.notice));
        }
      }
      ck("這份存檔真的打到超限", !!failedAt, `打了 ${played} 場`);
      if (failedAt) {
        const { s0, s1 } = failedAt;
        ck("超限：沒有「獎金入了、紀錄沒了」", s1.disk.funds === s0.disk.funds && s1.disk.csHistory === s0.disk.csHistory, JSON.stringify(s1.disk));
        ck("超限：賽程維持 launched，熟練與 Season 不動", s1.disk.launchedCs.length > 0 && s1.disk.heroGames === s0.disk.heroGames && s1.disk.seasonLen === s0.disk.seasonLen, JSON.stringify(s1.disk));
        ck("超限：有提示", s1.notice.on, JSON.stringify(s1.notice));
        ck("超限：賽後畫面沒有卡在「寫入中」", (await ev("return JSON.stringify((document.body.innerText||'').includes('寫入中'));")) === false);
        ck("超限：沒有 JS 錯誤", errors().page.length === 0, errors().page.join(" | "));
        await home();
        const s2 = await step("重新整理");
        ck("重新整理：提示還在", s2.notice.on && s2.notice.kind === "match", JSON.stringify(s2.notice));
        ck("重新整理：資料沒動", s2.disk.funds === s0.disk.funds && s2.disk.tx === s0.disk.tx && s2.disk.csHistory === s0.disk.csHistory, JSON.stringify(s2.disk));
        await fullText("CS 超限");
        ck("重新整理：文字沒有叫玩家去按不存在的棄權", (await ev("const e=document.querySelector('" + tid("save-status-notice") + "');return JSON.stringify(!!e&&!e.innerText.includes('棄權'));")) === true);
        //  超限之後玩家還有什麼路：這幾筆是給 Owner 判斷的事實，只釘「不多算」，不把卡住當通過。
        await toHub();
        await toTab("cs");
        //  ⚠ 賽程已經開打，回去的按鈕是「返回進行中的對戰」，不是出戰。
        const canResume = await has("cs-league-resume");
        ck("超限：CS 有返回進行中對戰的路", canResume);
        let replay = { ok: false, why: "沒有返回按鈕" };
        if (canResume) {
          await click("cs-league-resume");
          await sleep(1500);
          const err = await text("cs-hub-error");
          replay = err ? { ok: false, why: "返回被拒", err } : await playCsMapToResult();
        }
        const s3 = await step("超限後重打 CS");
        report.findings.push({ kind: "cs_replay_at_limit", canResume, ok: replay.ok, why: replay.why ?? null, err: replay.err ?? null, disk: s3.disk, notice: s3.notice });
        ck("超限重打：資金、帳本、歷史都不多算", s3.disk.funds === s0.disk.funds && s3.disk.tx === s0.disk.tx && s3.disk.csHistory === s0.disk.csHistory, JSON.stringify(s3.disk));
        await home();
        const before = (await step("重打後重新整理")).disk.day;
        await click("home-advance-next");
        await sleep(1500);
        const s4 = await step("超限後推進日曆");
        report.findings.push({ kind: "cs_advance_at_limit", from: before, to: s4.disk.day, notice: s4.notice });
        ck("超限後推進：資料不多算", s4.disk.funds === s0.disk.funds && s4.disk.tx === s0.disk.tx, JSON.stringify(s4.disk));
      }
      report.played = played;
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
