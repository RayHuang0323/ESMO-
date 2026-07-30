#!/usr/bin/env node
// ============================================================================
//  tools/shot_milestone_e.mjs — Milestone E 的**正式流程**驗收截圖
//
//  與 tools/shot_moba_runtime.mjs 的差別：那支用 `?debug=moba-runtime-battle`
//  直接開局（跳過賽前流程），本支**走完整正式流程**：
//    Dashboard → Lineup（🔁 換入新秀）→ Matchmaking → Ban/Pick → Tactic
//    → Loading → GameView → Result → Replay
//  因為 Milestone E 的主張正是「同一個人要在四個畫面同時出現」，
//  只有走完整流程才證明得了。
//
//  前置步驟也是真的走 UI：Dashboard →「➕ 招募」→ 選一名新秀 → 簽約，
//  因為預設存檔只有五名種子選手，沒有板凳就無從驗證換人。
//  （第一版曾改用 localStorage 種資料，但 profileStore 只在動作時才寫入 ⇒
//    首次載入時 localStorage 是空的，種不進去；改走真實招募反而更短也更真。）
//
//  用法：
//    node tools/shot_milestone_e.mjs
//    node tools/shot_milestone_e.mjs --out review/moba-runtime/milestone-e/evidence
//    node tools/shot_milestone_e.mjs --url http://localhost:4176/ESMO-
// ============================================================================
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const OUT_DIR = resolve(ROOT, arg("--out", "review/moba-runtime/milestone-e/evidence"));
const PROFILE_KEY = "esmo.profile.v1";
let ROOKIE_NAME = "";        // 由真實招募流程決定（簽下誰就是誰）

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const DESK = { w: 1600, h: 1000 };
const MOB = { w: 390, h: 844 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { redirect: "manual" }); if (r.status < 500) return true; }
    catch { /* not up yet */ }
    await sleep(500);
  }
  return false;
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && c.pending.has(m.id)) {
        const { res, rej } = c.pending.get(m.id); c.pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      }
    };
    return c;
  }
  //  ⚠ 一定要有 timeout（沿用 shot_moba_runtime 的教訓：連線斷掉時
  //  沒有 timeout 的 Promise 永遠不會 settle，Node 會靜默結束）。
  send(method, params = {}, timeoutMs = 30000) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rej(new Error(`CDP ${method} 逾時 ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        res: (v) => { clearTimeout(timer); res(v); },
        rej: (e) => { clearTimeout(timer); rej(e); },
      });
      try { this.ws.send(JSON.stringify({ id, method, params })); }
      catch (e) { clearTimeout(timer); this.pending.delete(id); rej(e); }
    });
  }
  close() { this.ws.close(); }
}

const evaluate = async (cdp, expr) => {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text ?? "evaluate failed");
  return r.result?.value;
};
const text = (cdp) => evaluate(cdp, "document.body.innerText || ''");
const clickByText = (cdp, needle) => evaluate(cdp, `(() => {
  const needle = ${JSON.stringify(needle)};
  const hits = [...document.querySelectorAll("button,[role=button],div,span,a")]
    .filter((el) => (el.textContent || "").includes(needle) && el.offsetParent !== null);
  if (!hits.length) return false;
  const el = hits.find((a) => !hits.some((b) => b !== a && a.contains(b))) ?? hits[hits.length - 1];
  el.click();
  return true;
})()`);
const clickLabel = (cdp, label) => evaluate(cdp, `(() => {
  const el = document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)});
  if (!el) return false; el.click(); return true;
})()`);
/**
 * 依「整個節點的文字」精準點擊（給 Dashboard 磚塊這種短標籤用）。
 * ⚠ 用 clickByText("招募") 會點到收件匣通知裡的「…可前往招募查看」那段文字
 *   ——它是最內層的相符節點，但完全沒有 onClick ⇒ 靜默失敗。
 */
const clickExact = (cdp, re) => evaluate(cdp, `(() => {
  const re = new RegExp(${JSON.stringify(re)});
  const hits = [...document.querySelectorAll("button,[role=button],div,a")]
    .filter((el) => el.offsetParent !== null && re.test((el.textContent || "").trim()));
  if (!hits.length) return false;
  const el = hits.find((a) => !hits.some((b) => b !== a && a.contains(b))) ?? hits[0];
  el.click();
  return true;
})()`);

/** 等 body 文字出現某字串（回傳是否等到）。 */
async function waitText(cdp, needle, seconds = 30) {
  for (let i = 0; i < seconds * 2; i++) {
    const t = await text(cdp).catch(() => "");
    if (t.includes(needle)) return true;
    await sleep(500);
  }
  return false;
}

/**
 * 反覆點某個控制項，直到畫面出現預期文字。
 * ⚠ 固定 sleep 會在機器忙的時候翻船：MatchmakingScreen 的按鈕要 1.4 秒後才 enabled，
 *   點在 disabled 狀態上是靜默無效的（手機那輪就是這樣整條流程斷掉）。
 */
async function clickUntil(cdp, needle, expect, seconds = 25) {
  for (let i = 0; i < seconds; i++) {
    if ((await text(cdp).catch(() => "")).includes(expect)) return true;
    await clickByText(cdp, needle);
    await sleep(1000);
  }
  return (await text(cdp).catch(() => "")).includes(expect);
}

const results = { steps: [], assertions: [], shots: [] };
let failed = 0;
const ck = (label, cond, extra = null) => {
  results.assertions.push({ label, ok: !!cond, extra });
  if (cond) console.log(`  ✅ ${label}`);
  else { failed++; console.log(`  ❌ ${label}${extra ? `　→ ${JSON.stringify(extra)}` : ""}`); }
  return !!cond;
};

// ── 啟動 preview + Chrome ───────────────────────────────────────────────────
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error("找不到 Chrome / Edge。"); process.exit(2); }

let server = null;
let baseUrl = arg("--url", "");
if (!baseUrl) {
  baseUrl = "http://localhost:4176";
  server = spawn(process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "preview", "--", "--port", "4176", "--strictPort"],
    { cwd: ROOT, stdio: "ignore", shell: process.platform === "win32" });
}
if (!await waitForServer(baseUrl)) {
  console.error(`伺服器沒起來：${baseUrl}（先 npm run build）`); server?.kill(); process.exit(3);
}

const profileDir = resolve(ROOT, "node_modules/.cache", `esmo-e-${process.pid}`);
const port = 9800 + (process.pid % 150);
const browser = spawn(chrome, [
  `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions",
  "--hide-scrollbars", "--force-device-scale-factor=1",
  `--window-size=${DESK.w},${DESK.h}`, "--window-position=0,0",
  "about:blank",
], { stdio: "ignore" });

let wsUrl = null;
for (let i = 0; i < 80 && !wsUrl; i++) {
  await sleep(250);
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; }
  catch { /* not up yet */ }
}
if (!wsUrl) { console.error("Chrome CDP 沒開起來。"); browser.kill(); server?.kill(); process.exit(4); }

mkdirSync(OUT_DIR, { recursive: true });
const root = await CDP.connect(wsUrl);
const { targetId } = await root.send("Target.createTarget", { url: "about:blank" });
const tab = await CDP.connect(`ws://127.0.0.1:${port}/devtools/page/${targetId}`);
await tab.send("Page.enable");
await tab.send("Runtime.enable");

/**
 * 截圖。
 * ⚠ `Page.captureScreenshot` 預設走 surface：視窗被其它視窗蓋住或失焦時會**整個掛住**
 *   （本機實測連續兩次 60s 逾時把整個流程打斷）。先 bringToFront，逾時再退回
 *   `fromSurface:false`（純 renderer 合成；WebGL 內容可能較暗，但總比沒有證據好）。
 *   單張失敗不讓整個驗收流程中止 —— 前面的斷言結果比某一張圖更重要。
 */
async function shot(name) {
  try { await tab.send("Page.bringToFront", {}, 10000); } catch { /* 非致命 */ }
  for (const params of [{ format: "png" }, { format: "png", fromSurface: false }]) {
    try {
      const { data } = await tab.send("Page.captureScreenshot", params, 45000);
      writeFileSync(resolve(OUT_DIR, name), Buffer.from(data, "base64"));
      results.shots.push(name);
      console.log(`  📸 ${name}${params.fromSurface === false ? "（fromSurface=false 退路）" : ""}`);
      return true;
    } catch (e) { results.shotErrors = [...(results.shotErrors ?? []), `${name}: ${e.message}`]; }
  }
  console.log(`  ⚠ ${name} 截圖失敗（流程繼續）`);
  return false;
}
async function viewport({ w, h }) {
  await tab.send("Emulation.setDeviceMetricsOverride",
    { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
}

/** 走真實招募流程簽下一名新秀，回傳他的名字（失敗回 null）。 */
async function recruitRookie() {
  await tab.send("Page.navigate", { url: `${baseUrl}/?debug=1` });
  await sleep(3000);
  if (!await clickExact(tab, "^➕?\\s*招募$")) { results.recruitDebug = (await text(tab)).slice(0, 400); return null; }
  await sleep(1800);
  if (!(await text(tab)).includes("潛力")) { results.recruitDebug = (await text(tab)).slice(0, 400); return null; }
  //  選第一位**簽得起**的新秀（卡片上有「$N萬」；預算不足的會顯示紅字）
  const picked = await evaluate(tab, `(() => {
    const cards = [...document.querySelectorAll("button")]
      .filter((b) => /\\$\\d+萬/.test(b.textContent || "") && b.offsetParent !== null);
    if (!cards.length) return null;
    cards[0].click();
    return (cards[0].textContent || "").slice(0, 40);
  })()`);
  if (!picked) { results.recruitDebug = (await text(tab)).slice(0, 400); return null; }
  await sleep(1400);
  const signed = await clickExact(tab, "^簽約$");
  if (!signed) results.recruitDebug = (await text(tab)).slice(0, 600);
  await sleep(1800);
  //  以 profileStore 的持久化結果確認到底簽下誰（避免用畫面文字猜名字）
  const rookie = await evaluate(tab, `(() => {
    const raw = localStorage.getItem(${JSON.stringify(PROFILE_KEY)});
    if (!raw) return null;
    const p = JSON.parse(raw);
    const r = (p.players ?? []).find((x) => typeof x.id === "string" && x.id.startsWith("r"));
    return r ? { id: r.id, name: r.name, role: r.role, heroId: r.heroId ?? null } : null;
  })()`);
  return signed ? rookie : null;
}

/** 完整正式流程。assignRookie=false 時假設先發指派已持久化。 */
async function runFormalFlow({ tag, size, assignRookie, withReplay }) {
  console.log(`\n── ${tag}（${size.w}×${size.h}）──`);
  await viewport(size);
  await tab.send("Page.navigate", { url: `${baseUrl}/?debug=1` });
  await sleep(2500);
  ck(`${tag}：進入 Dashboard`, await waitText(tab, "MOBA", 20));

  // Dashboard → Lineup
  ck(`${tag}：進入賽前配置（Lineup）`, await clickUntil(tab, "MOBA", "先發五人", 20));

  if (assignRookie) {
    const before = await text(tab);
    ck(`${tag}：換人前 MID 顯示種子選手 Frost`, before.includes("Frost"), { hasRookie: before.includes(ROOKIE_NAME) });
    await shot(`01-${tag}-lineup-before.png`);
    ck(`${tag}：點開 MID 換人面板`, await clickLabel(tab, "更換 MID 先發"));
    await sleep(800);
    ck(`${tag}：換人面板列出板凳新秀`, (await text(tab)).includes(ROOKIE_NAME));
    await shot(`02-${tag}-bench-sheet.png`);
    await clickByText(tab, ROOKIE_NAME);
    await sleep(900);
  }
  const lineupText = await text(tab);
  ck(`${tag}：Lineup 的 MID 已換成新秀`, lineupText.includes(ROOKIE_NAME), { frostStillStarter: lineupText.includes("Frost") });
  if (assignRookie) await shot(`03-${tag}-lineup-after.png`);

  // Lineup → Matchmaking → BanPick
  await clickUntil(tab, "確認陣容", "進入 Ban/Pick", 20);
  ck(`${tag}：進入 Ban/Pick`, await clickUntil(tab, "進入 Ban/Pick", "選角動態", 25));

  // Ban/Pick：輪到我方時點選擇器裡的第一個英雄，直到選角完成
  let picks = 0;
  for (let i = 0; i < 60; i++) {
    const done = (await text(tab)).includes("選角完成");
    if (done) break;
    const clicked = await evaluate(tab, `(() => {
      const grid = [...document.querySelectorAll("div")].find((d) =>
        (d.style.gridTemplateColumns || "").includes("repeat(5") && d.offsetParent !== null);
      if (!grid || !grid.children.length) return false;
      const btns = grid.children[0].querySelectorAll("button");
      if (btns.length < 2) return false;
      btns[1].click();          // [0] 是 ⓘ 詳情，[1] 才是選這隻
      return true;
    })()`);
    if (clicked) picks++;
    await sleep(700);
  }
  ck(`${tag}：Ban/Pick 完成（我方實際點選 ${picks} 次）`, await waitText(tab, "選角完成", 25), { picks });

  // Tactic → Loading → GameView
  ck(`${tag}：進入戰術`, await waitText(tab, "TEAM STRATEGY", 25));
  ck(`${tag}：進入 Loading（顯示上場選手）`, await clickUntil(tab, "開始載入", "VS", 20));
  const loadingText = await text(tab);
  ck(`${tag}：Loading 顯示的是新秀，不是靜態名單`, loadingText.includes(ROOKIE_NAME), { frost: loadingText.includes("Frost") });
  await shot(`04-${tag}-loading.png`);

  // GameView
  let ready = false;
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    ready = await evaluate(tab, "!!document.querySelector('canvas')").catch(() => false);
    if (ready) break;
  }
  ck(`${tag}：正式 GameView 掛載（canvas 出現）`, ready);
  //  ⚠ 開局 5 秒時十個人都還擠在泉水裡，截圖對「3D 名牌看不看得懂」毫無幫助。
  //    等到英雄真的走到線上（比賽鐘 ≳ 2 分）再拍，人眼才驗得到名牌與血條。
  await sleep(30000);
  results[`${tag}ClockAtShot`] = await evaluate(tab, `(() => {
    const m = (document.body.innerText || "").match(/(\\d+):(\\d\\d)/);
    return m ? m[0] : null;
  })()`).catch(() => null);
  const gvText = await text(tab);
  ck(`${tag}：GameView 為正式主幹（掛載信標）`, gvText.includes("ESMO 主幹"));
  ck(`${tag}：GameView 沒有 debug 地圖 UI`,
    !["可走性", "鏡射檢查", "座標標記"].some((k) => gvText.includes(k)));
  // 展開隊伍面板 → 應看到新秀
  //  ⚠ 收合文案桌機是「▴ 展開」、手機是「▴ 上滑展開」⇒ 只認 ▴，別寫死整串。
  //    手機預設收合且只顯示焦點對位列，不展開就看不到中路那一列。
  if (gvText.includes("▴")) { await clickByText(tab, "隊伍面板"); await sleep(1000); }
  const panelText = await text(tab);
  ck(`${tag}：隊伍面板顯示新秀`, panelText.includes(ROOKIE_NAME));
  //  __ESMO_RUNTIME_DIAG 只在 ?diag=1 時掛載；正式流程沒有它是預期的
  //  ⇒ 記錄成資訊欄位，不當成斷言失敗（不為了湊綠燈而在正式流程強塞 diag 旗標）。
  results[`${tag}RuntimeDiag`] = await evaluate(tab, `(() => {
    const d = window.__ESMO_RUNTIME_DIAG ? window.__ESMO_RUNTIME_DIAG() : null;
    return d ? { heroCount: d.heroCount, blue: d.blueHeroCount, red: d.redHeroCount } : "diag-probe-not-installed(?diag=1 才有)";
  })()`).catch(() => null);
  //  ⚠ 3D 名牌是 WebGL CanvasTexture（D-fix3 改的），讀不到 DOM 文字也沒有診斷欄位
  //    ⇒ 名牌上的字只能由截圖人眼確認；這裡不假裝自動驗過。
  await shot(`05-${tag}-gameview.png`);

  // 天賦可見性：點隊伍面板裡的新秀 → HeroDetailPanel
  await clickByText(tab, ROOKIE_NAME);
  await sleep(1200);
  const heroPanel = await text(tab);
  const talentVisible = heroPanel.includes("本場行為（天賦生效證據）");
  ck(`${tag}：戰中可看到天賦生效證據`, talentVisible);
  if (talentVisible) await shot(`06-${tag}-talent-in-battle.png`);
  await clickByText(tab, "✕");
  await sleep(600);

  // ⏩ 快速完成 → Result
  ck(`${tag}：測試模式有快速完成`, (await text(tab)).includes("快速完成"));
  await clickByText(tab, "快速完成");
  let atResult = false;
  for (let i = 0; i < 480; i++) {                 // 最多 4 分鐘（含終局結算與動畫）
    const t = await text(tab).catch(() => "");
    if (t.includes("觀看重播") || t.includes("無法重播")) { atResult = true; break; }
    await sleep(500);
  }
  ck(`${tag}：進入賽後結果`, atResult);
  await sleep(2500);
  const resultText = await text(tab);
  ck(`${tag}：賽後結果顯示新秀`, resultText.includes(ROOKIE_NAME));
  ck(`${tag}：賽後可見「能力／天賦執行」`, resultText.includes("能力／天賦執行"));
  ck(`${tag}：賽後可見「戰術執行」`, resultText.includes("戰術執行"));
  await shot(`07-${tag}-result.png`);

  if (withReplay) {
    ck(`${tag}：可觀看重播`, resultText.includes("觀看重播"));
    await clickByText(tab, "觀看重播");
    await sleep(3500);
    const rep = await evaluate(tab, `(() => {
      const t = document.body.innerText || "";
      return {
        isReplay: t.includes("REPLAY"),
        comms: document.querySelectorAll("[data-testid=replay-comms]").length,
        teamBuffs: document.querySelectorAll("[data-testid^=replay-team-buffs-]").length,
        hasDragonBadge: /龍×\\d/.test(t),
        hasBaronBadge: /巴 \\d+s/.test(t),
        minionNote: t.includes("未擷取小兵"),
        presentation: document.querySelector("[data-replay-presentation]")?.getAttribute("data-replay-presentation") ?? null,
      };
    })()`);
    ck(`${tag}：重播顯示本場播報（replay.comms，非重新生成）`, rep.comms > 0, rep);
    ck(`${tag}：重播不再誤述「未擷取小兵」`, rep.minionNote === false, rep);
    results.replay = rep;
    //  Dragon 150 秒才首次出生 ⇒ 時間軸必須真的拉到中後段才驗得到團隊 Buff。
    //  用畫面上的 range 控制項（React 受控元件 ⇒ 走 native setter + input 事件）。
    const seeked = await evaluate(tab, `(() => {
      const r = document.querySelector("input[type=range]");
      if (!r) return null;
      const target = Math.round(Number(r.max) * 0.72);
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(r, String(target));
      r.dispatchEvent(new Event("input", { bubbles: true }));
      r.dispatchEvent(new Event("change", { bubbles: true }));
      return { max: Number(r.max), target };
    })()`);
    await sleep(2500);
    const rep2 = await evaluate(tab, `(() => {
      const t = document.body.innerText || "";
      return {
        buffEls: document.querySelectorAll("[data-testid^=replay-team-buffs-]").length,
        dragonText: /龍×\\d/.test(t), baronText: /巴 \\d+s/.test(t),
        deadBadge: t.includes("陣亡"),
      };
    })()`);
    ck(`${tag}：時間軸可拉到中後段`, !!seeked, seeked);
    ck(`${tag}：重播顯示團隊目標增益（龍×N／巴 Ns）`, rep2.buffEls > 0, rep2);
    results.replayLater = { ...rep2, seeked };
    //  ⚠ 誠實記錄：正式 Replay 的戰場呈現預設仍走 loadMapPresentation()（legacy），
    //    而正式 GameView 自 H.1 起固定 runtime-v2 ⇒ 兩者不是同一套戰場。
    //    這是 Milestone E 之前就存在的設定，不在本階段修改，只如實記錄。
    results.replayPresentationDefault = rep.presentation;
    await shot(`08-${tag}-replay.png`);
  }
}

try {
  await viewport(DESK);
  const rookie = await recruitRookie();
  ROOKIE_NAME = rookie?.name ?? "";
  ck(`前置：走真實招募流程簽下新秀 ${ROOKIE_NAME || "(失敗)"}`, !!rookie?.name, rookie);
  if (!rookie?.name) throw new Error("招募失敗，後續換人驗收無從進行");
  ck("新秀未綁定英雄（之後應沿用席位預設英雄）", rookie.heroId === null, rookie);
  const skipDesktop = process.argv.includes("--skip-desktop");
  if (!skipDesktop) await runFormalFlow({ tag: "desktop", size: DESK, assignRookie: true, withReplay: true });
  //  先發指派已持久化 ⇒ 手機那輪不必再換一次人，直接驗「換過的人有沒有跟著上場」
  await runFormalFlow({ tag: "mobile390", size: MOB, assignRookie: skipDesktop, withReplay: false });
} catch (e) {
  failed++;
  console.error(`\n❌ 流程中斷：${e.message}`);
  results.error = String(e.message);
}

writeFileSync(resolve(OUT_DIR, "shot_stats.json"), JSON.stringify({
  milestone: "E",
  capturedAt: new Date().toISOString(),
  entry: "正式流程（Dashboard → Lineup → Matchmaking → Ban/Pick → Tactic → Loading → GameView → Result → Replay）",
  precondition: `localStorage 種入一名板凳新秀（${ROOKIE_NAME}），其餘皆為真實點擊`,
  viewports: { desktop: DESK, mobile: MOB },
  ...results,
  failed,
}, null, 2));

console.log(`\n${results.assertions.filter((a) => a.ok).length}/${results.assertions.length} 斷言通過；截圖 ${results.shots.length} 張 → ${OUT_DIR}`);
tab.close(); root.close();
browser.kill();
server?.kill();
try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* ignore */ }
process.exit(failed ? 1 : 0);
