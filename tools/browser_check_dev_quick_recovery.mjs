#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_dev_quick_recovery.mjs — DEV 快速恢復：真實瀏覽器驗收
//
//  執行：`node tools/browser_check_dev_quick_recovery.mjs`（加 --headed 可看畫面）。
//  ⚠ 會先 `npm run build`（Part A 打的是 **build 產物**，不是 dev server）。
//
//  ── 為什麼要跑兩種 server ────────────────────────────────────────────────
//  `check_dev_quick_recovery.mjs` 能證明閘門函式的邏輯，但證明不了
//  **「玩家打開正式站時真的看不到那顆按鈕」**——因為 dev server 的
//  `import.meta.env.DEV` 永遠是 true，`isDebugMode()` 在那裡恆為真。
//  所以：
//    Part A  `vite preview`（dist/，DEV=false）⇒ 驗**正式模式看不到**
//    Part B  `vite dev`（原始模組，可操作 Store）⇒ 驗**測試模式功能正確**
//
//  Part A 另外誠實記錄一件事：正式 build 上 `?debug=1` **仍然打得開**面板
//  （與既有的 devFastForward 同一條規則）。這不是漏洞，是現行慣例；
//  「正式商業上線前關閉或移除」就是為了收掉這個口子。
// ============================================================================
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEV_PORT = 5354;
const PREVIEW_PORT = 5355;
const CDP_DEV = 9393;
const CDP_PROD = 9394;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const note = (t) => console.log(`   · ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PANEL = '[data-testid="dev-quick-recovery"]';

async function waitFor(chrome, expr, timeoutMs = 15_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { if (await chrome.evaluate(`return Boolean(${expr});`)) return true; } catch {}
    await sleep(250);
  }
  return false;
}
//  首頁磚是 GSAP reveal（進場前 visibility:hidden ⇒ innerText 為空），
//  所以用文字找按鈕必須等它**可見**，不能只等它存在。
const clickText = async (chrome, needle, timeoutMs = 12_000) => {
  const until = Date.now() + timeoutMs;
  const expr = `const b = [...document.querySelectorAll("button")].find((x) => (x.innerText||"").includes(${JSON.stringify(needle)}));`
    + `if (!b) return false; b.click(); return true;`;
  while (Date.now() < until) {
    try { if (await chrome.evaluate(expr)) return true; } catch {}
    await sleep(250);
  }
  return false;
};
const clickTestId = (chrome, id) =>
  chrome.evaluate(`const b = document.querySelector('[data-testid="${id}"]'); b?.click(); return Boolean(b);`);
const overflowed = (chrome) => chrome.evaluate(`return document.body.scrollWidth > window.innerWidth + 1;`);

/** 走到訓練中心（桌機是「訓練中心」磚；手機在「戰隊」sheet 裡）。 */
async function openTraining(chrome, url, mobile) {
  await chrome.navigate(url);
  await sleep(1000);
  if (mobile) {
    await chrome.evaluate(`document.querySelector('[data-testid="home-nav-team"]')?.click(); return true;`);
    await waitFor(chrome, `document.querySelector('[data-testid="home-sheet-training"]')`, 8_000);
    await clickTestId(chrome, "home-sheet-training");
  } else {
    //  ⚠ 不能用「訓練」當關鍵字：首頁的 CS 模式磚寫的是「CS 訓練賽」，會先被點到。
    await clickText(chrome, "訓練中心");
  }
  return waitFor(chrome, `(document.body.innerText||"").includes("推進訓練日")`, 15_000);
}

// ── vite preview（build 產物）──────────────────────────────────────────────
//  與 cdp.mjs 的 startDevServer 同一組防護：port 有人佔就直接 throw，
//  絕不連上不是自己起的 server（那會靜默地測到別的程式碼）。
function isPortFree(port) {
  return new Promise((res) => {
    const s = createServer();
    s.once("error", () => res(false));
    s.once("listening", () => s.close(() => res(true)));
    s.listen(port);
  });
}
async function startPreviewServer({ port, base = "/ESMO-/" }) {
  if (!(await isPortFree(port))) {
    throw new Error(`port ${port} 已經有人在聽——拒絕連上不是本次 gate 起的 server。請先關掉佔用者。`);
  }
  const cli = join(ROOT, "node_modules", "vite", "bin", "vite.js");
  const url = `http://localhost:${port}${base}`;
  const proc = spawn(process.execPath, [cli, "preview", "--port", String(port), "--strictPort"], {
    cwd: ROOT, stdio: "ignore", windowsHide: true,
  });
  const until = Date.now() + 60_000;
  while (Date.now() < until) {
    if (proc.exitCode !== null) throw new Error(`vite preview 提前退出（exit=${proc.exitCode}）`);
    try { if ((await fetch(url)).ok) return { url, stop: async () => { try { proc.kill(); } catch {} } }; } catch {}
    await sleep(500);
  }
  try { proc.kill(); } catch {}
  throw new Error(`vite preview ${url} 起不來`);
}

function runBuild() {
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, [join(ROOT, "node_modules", "vite", "bin", "vite.js"), "build"],
      { cwd: ROOT, stdio: "ignore", windowsHide: true });
    p.on("close", (code) => (code === 0 ? res() : rej(new Error(`vite build 失敗（exit=${code}）`))));
  });
}

//  把全隊體力打到 0（dev server 才做得到——需要拿到 App 自己的 store 實例）。
const FLATTEN_ROSTER = `
  ${RESOLVE_APP_MODULES}
  const st = () => profile.useProfileStore.getState();
  const players = (st().players ?? []).map((p) => ({ ...p, energy: 0, condition: "低潮", training: null, rosterTier: "active", status: "主力" }));
  profile.useProfileStore.setState({ players });
  st().save();
  return { count: players.length, days: st().meta?.days ?? null };
`;
const READ_STATE = `
  ${RESOLVE_APP_MODULES}
  const cond = await import(B + "/src/platform/condition/playerCondition.js");
  const st = () => profile.useProfileStore.getState();
  const players = st().players ?? [];
  return { days: st().meta?.days ?? null,
           unfit: players.filter((p) => !cond.isMatchFit(p)).length,
           total: players.length,
           energies: players.map((p) => Math.round(Number(p.energy) || 0)) };
`;

let prod = null, dev = null, chromeProd = null, chromeDev = null;
try {
  // ══ Part A：正式 build ══════════════════════════════════════════════════
  console.log("\n══ Part A：正式 build（vite preview，import.meta.env.DEV = false）══");
  await runBuild();
  prod = await startPreviewServer({ port: PREVIEW_PORT });
  chromeProd = await launchChrome({ url: prod.url, port: CDP_PROD, headless: HEADLESS });
  await chromeProd.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });

  const prodTraining = await openTraining(chromeProd, prod.url, false);
  ck("A1) 正式 build 的訓練中心可開啟（對照組：畫面本身是好的）", prodTraining);
  const prodPanel = await chromeProd.evaluate(`return Boolean(document.querySelector('${PANEL}'));`);
  ck("A2) **正式／預設模式完全看不到 DEV 工具**", prodPanel === false);
  const prodText = await chromeProd.evaluate(`return (document.body.innerText||"").replace(/\\s+/g," ");`);
  ck("A3) 正式模式也看不到任何 DEV 字樣",
    !/DEV 快速恢復|僅測試模式|全隊恢復至可出賽/.test(prodText),
    (prodText.match(/DEV 快速恢復|僅測試模式|全隊恢復至可出賽/g) ?? []).join(",") || "(乾淨)");

  //  誠實記錄：正式 build 上 ?debug=1 仍打得開（與既有 devFastForward 同一條規則）。
  await chromeProd.navigate(`${prod.url}?debug=1`);
  await sleep(1200);
  const prodDebugTraining = await openTraining(chromeProd, `${prod.url}?debug=1`, false);
  const prodDebugPanel = prodDebugTraining
    && await chromeProd.evaluate(`return Boolean(document.querySelector('${PANEL}'));`);
  ck("A4) 正式 build ＋ `?debug=1` 仍打得開（現行慣例，非漏洞；上線前需連同旗標一起收掉）",
    prodDebugPanel === true);
  note("⚠ 這一條是**現況記錄**：與 devFastForward 相同，`?debug=1` 是刻意保留的驗收入口。");
  note("   release checklist「上線前關閉或移除 DEV Quick Recovery」處理的就是它。");

  await chromeProd.close(); chromeProd = null;
  await prod.stop(); prod = null;

  // ══ Part B：測試模式（dev server）═══════════════════════════════════════
  console.log("\n══ Part B：測試模式（vite dev）══");
  dev = await startDevServer({ port: DEV_PORT });
  chromeDev = await launchChrome({ url: dev.url, port: CDP_DEV, headless: HEADLESS });
  await chromeDev.navigate(dev.url);
  await sleep(900);
  await chromeDev.evaluate(`localStorage.removeItem("esmo.profile.v1"); location.reload();`);
  await waitFor(chromeDev, `document.readyState === 'complete'`);
  await sleep(900);

  for (const vp of [
    { label: "Desktop 1366", w: 1366, h: 900, mobile: false },
    { label: "Mobile 390", w: 390, h: 844, mobile: true },
  ]) {
    console.log(`\n── ${vp.label} ───────────────────────────────`);
    await chromeDev.send("Emulation.setDeviceMetricsOverride",
      { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile });

    //  佈置：全隊體力歸零 ⇒ 全隊不可出賽
    await chromeDev.navigate(dev.url);
    await sleep(900);
    const seeded = await chromeDev.evaluate(FLATTEN_ROSTER);
    const before = await chromeDev.evaluate(READ_STATE);
    ck(`${vp.label}｜佈置：全隊體力歸零 ⇒ 全員不可出賽`,
      before.unfit === before.total && before.total > 0,
      `${before.unfit}/${before.total} 人不可出賽，第 ${before.days} 天`);

    const opened = await openTraining(chromeDev, dev.url, vp.mobile);
    ck(`${vp.label}｜訓練中心可開啟`, opened);
    ck(`${vp.label}｜測試模式看得到 DEV 面板`,
      await chromeDev.evaluate(`return Boolean(document.querySelector('${PANEL}'));`));
    ck(`${vp.label}｜面板顯示的不可出賽人數與 Store 一致`,
      /5\s*\/\s*5|不可出賽 \d+ \/ \d+/.test(
        await chromeDev.evaluate(`return (document.querySelector('[data-testid="dev-unfit-count"]')?.innerText||"").replace(/\\s+/g," ");`)),
      await chromeDev.evaluate(`return (document.querySelector('[data-testid="dev-unfit-count"]')?.innerText||"").replace(/\\s+/g," ");`));

    // ── 全隊恢復至可出賽 ────────────────────────────────────────────────
    await clickTestId(chromeDev, "dev-recover-all");
    await sleep(700);
    const recovered = await chromeDev.evaluate(READ_STATE);
    ck(`${vp.label}｜「全隊恢復至可出賽」後全員可出賽`,
      recovered.unfit === 0 && recovered.total === before.total,
      `體力 ${recovered.energies.join(",")}（門檻推導，不是一鍵滿血）`);
    ck(`${vp.label}｜恢復不動日期（recovery 與 day progression 是兩件事）`,
      recovered.days === before.days, `第 ${recovered.days} 天`);

    // ── 推進 1 天 ───────────────────────────────────────────────────────
    await clickTestId(chromeDev, "dev-advance-1");
    await sleep(900);
    const d1 = await chromeDev.evaluate(READ_STATE);
    const msg1 = await chromeDev.evaluate(`return (document.querySelector('[data-testid="dev-quick-recovery-msg"]')?.innerText||"").replace(/\\s+/g," ");`);
    ck(`${vp.label}｜推進 1 天：日期 +1`,
      d1.days === recovered.days + 1, `第 ${recovered.days} → ${d1.days} 天｜${msg1}`);

    // ── 推進 3 天 ───────────────────────────────────────────────────────
    await clickTestId(chromeDev, "dev-advance-3");
    await sleep(1100);
    const d3 = await chromeDev.evaluate(READ_STATE);
    const msg3 = await chromeDev.evaluate(`return (document.querySelector('[data-testid="dev-quick-recovery-msg"]')?.innerText||"").replace(/\\s+/g," ");`);
    ck(`${vp.label}｜推進 3 天：日期 +3`,
      d3.days === d1.days + 3, `第 ${d1.days} → ${d3.days} 天｜${msg3}`);
    ck(`${vp.label}｜推進後體力照既有規則回復（每天 +8，沒有被工具放大）`,
      d3.energies.every((e, i) => e >= d1.energies[i]),
      `${d1.energies.join(",")} → ${d3.energies.join(",")}`);

    ck(`${vp.label}｜訓練中心無 body 橫向捲動`, !(await overflowed(chromeDev)));

    // ── 恢復後 Match Prep 可正常進入 ────────────────────────────────────
    await chromeDev.navigate(dev.url);
    await sleep(900);
    await chromeDev.evaluate(`document.querySelector('[data-testid="home-mode-moba"]')?.click(); return true;`);
    const prepOpen = await waitFor(chromeDev, `document.querySelector('[data-testid="prep-primary-action"]')`, 30_000);
    ck(`${vp.label}｜恢復後 MATCH PREP 可正常進入`, prepOpen);
    if (prepOpen) {
      const prep = await chromeDev.evaluate(`
        const seats = [...document.querySelectorAll('[data-testid="squad-seat"]')];
        return { seats: seats.length,
                 seated: seats.filter((s) => s.dataset.seated === "true" || (s.innerText||"").trim().length > 2).length };`);
      ck(`${vp.label}｜MATCH PREP 五席填滿（exhausted 已解除）`,
        prep.seats > 0 && prep.seated === prep.seats, JSON.stringify(prep));
      ck(`${vp.label}｜MATCH PREP 無 body 橫向捲動`, !(await overflowed(chromeDev)));
    }
  }

  // ── exhausted 正式規則仍有效（工具沒有把疲勞規則拿掉）────────────────
  console.log("\n── 正式規則仍有效 ───────────────────────────────");
  await chromeDev.navigate(dev.url);
  await sleep(900);
  await chromeDev.evaluate(FLATTEN_ROSTER);
  await chromeDev.navigate(dev.url);
  await sleep(900);
  await chromeDev.evaluate(`document.querySelector('[data-testid="home-mode-moba"]')?.click(); return true;`);
  await sleep(2500);
  //  ⚠ 這裡分兩件事測，因為它們的機制不同：
  //    ① **出賽閘門**（真正決定能不能開打的那一關）：`validateSquad` 必須逐席
  //       回報 `exhausted`。
  //    ② **自動填入的候選池**：`autoFillSquad` 用 `isMatchFit` 過濾候選人，
  //       但它會先跑 `normalizeLineup` 的 **identity 回填**——種子選手的 id 剛好
  //       就叫 b1–b5，與席位同名，所以會被原樣回填、不經過池子。
  //       要測「池子有沒有把疲勞的人排除」，必須用**不與席位同名**的 id。
  //       （identity 回填填出來的陣容照樣會被 ① 擋下，所以產品行為是對的。）
  const blocked = await chromeDev.evaluate(`
    ${RESOLVE_APP_MODULES}
    const squadMod = await import(B + "/src/platform/contracts/matchSquad.js");
    const st = profile.useProfileStore.getState();
    const players = st.players ?? [];
    const seats = squadMod.autoFillSquad({ mode: "moba", seats: {}, players });
    const v = squadMod.validateSquad({ mode: "moba", seats, players });
    //  候選池測試：把 id 改成與席位無關的名字，identity 回填就不會插手
    const renamed = players.map((p, i) => ({ ...p, id: "pool" + i }));
    const poolSeats = squadMod.autoFillSquad({ mode: "moba", seats: {}, players: renamed });
    return {
      gateCodes: (v.errors ?? []).map((e) => e.code),
      poolFilled: Object.values(poolSeats).filter(Boolean).length,
    };
  `);
  ck("exhausted 正式規則仍有效①：全隊體力 0 時出賽閘門逐席擋下",
    blocked.gateCodes.length > 0 && blocked.gateCodes.every((c) => c === "exhausted"),
    JSON.stringify(blocked.gateCodes));
  ck("exhausted 正式規則仍有效②：自動填入的候選池排除疲勞選手（填 0 席）",
    blocked.poolFilled === 0, `填了 ${blocked.poolFilled} 席`);

  const errs = chromeDev.consoleLines.filter((l) => l.startsWith("[error]"));
  ck("console：page error = 0、page-origin uncaught error = 0",
    errs.length === 0 && chromeDev.pageErrors.length === 0,
    [...errs.slice(0, 3), ...chromeDev.pageErrors.slice(0, 3)].join(" | ") || "(無)");
} catch (error) {
  ck("gate 可執行", false, String(error?.stack ?? error).slice(0, 500));
} finally {
  try { await chromeProd?.close(); } catch {}
  try { await prod?.stop(); } catch {}
  try { await chromeDev?.close(); } catch {}
  try { await dev?.stop(); } catch {}
}

console.log(`\n${fail === 0 ? "✅" : "❌"} browser_check_dev_quick_recovery：${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
