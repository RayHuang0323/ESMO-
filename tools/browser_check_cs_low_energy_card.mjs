#!/usr/bin/env node
// ============================================================================
//  CS 低體力選手卡：顯示的是**真實體力**（Fatigue Audit 收尾的瀏覽器證據）
//
//  背景：`fpsRoster` 在體力 < 70 時把引擎的 `sta`／`condition` 封頂在 70
//  （避免同一份體力被扣三次），真實體力另放 `energy`；選手卡改讀
//  `selP.energy ?? selP.sta`。這支用正式流程確認畫面上看到的是真實值，而不是 70。
//
//  流程（桌機 1366×900 與 390×844 各一輪）：
//    新局 → CS 陣容 f1–f5 的體力改成 0／12／35／55／88 → 首頁 CS → Practice →
//    地圖 → 戰術 → Battle → 逐一點記分板上的 t1–t5 → 展開「素質」→ 讀選手卡的「體力」。
//  ⚠ 88 是對照組（≥70 走原路徑，`sta` 就是真實體力）；0 驗 `??` 不會把 0 當成缺值。
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_cs_low_energy_card.mjs --timeout 600000`
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const KEY = "esmo.profile.v1";
const OUT = process.env.ESMO_REVIEW_OUT ?? "tmp/cs-low-energy-card";
mkdirSync(OUT, { recursive: true });
const ENERGIES = { f1: 0, f2: 12, f3: 35, f4: 55, f5: 88 };

const waitFor = async (chrome, expression, timeoutMs, label) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await chrome.evaluate(`return Boolean(${expression});`)) return true; } catch { /* 頁面切換中，下一輪再試 */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${label} timeout`);
};
const click = async (chrome, selector, label) => {
  const ok = await chrome.evaluate(`const n = document.querySelector(${JSON.stringify(selector)}); if (!n || n.disabled) return false; n.click(); return true;`);
  if (!ok) throw new Error(`${label} not clickable`);
};

//  存檔：在 Node 裡跑真正的 profileStore 產生（同 browser_check_cs_c6c_progress 的做法）。
let savedJson = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? savedJson : null),
  setItem: (k, v) => { if (k === KEY) savedJson = String(v); },
  removeItem: (k) => { if (k === KEY) savedJson = null; },
  clear: () => { savedJson = null; },
};
const { useProfileStore } = await import("../src/platform/profileStore.js");
const st = () => useProfileStore.getState();
st().startNewGame("standard");
st().autoFillLineup("cs");
st().setCsPracticeMap("dust2");
st().setCsAcceptedMapPool(["dust2", "mirage", "inferno"]);
st().save();
const save = JSON.parse(savedJson);
const expected = {};   // t1..t5 → 真實體力（toFpsRoster 依 f1..f5 對位成 t1..t5）
Object.entries(ENERGIES).forEach(([seat, energy], i) => {
  const id = save.csLineup[seat];
  const p = save.players.find((x) => x.id === id);
  p.energy = energy;
  expected[`t${i + 1}`] = energy;
});

const enterBattle = async (chrome, url, viewport) => {
  await chrome.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1 });
  await chrome.navigate(url);
  await chrome.evaluate(`localStorage.clear(); localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify(save))}); sessionStorage.clear(); return true;`);
  await chrome.reload();
  await waitFor(chrome, `document.querySelector('[data-testid="home-mode-cs"]')`, 30_000, "dashboard");
  await click(chrome, '[data-testid="home-mode-cs"]', "CS entry");
  await waitFor(chrome, `document.querySelector('[data-testid="prep-start-practice"]')`, 30_000, "CS prep");
  await click(chrome, '[data-testid="prep-start-practice"]', "Practice start");
  await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm" || document.querySelector('[data-testid="cs-map-confirm"]')`, 30_000, "ready check");
  if (await chrome.evaluate(`return document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm";`)) {
    await click(chrome, '[data-testid="prep-primary-action"]', "ready confirm");
  }
  await waitFor(chrome, `document.querySelector('[data-testid="cs-map-confirm"]') && !document.querySelector('[data-testid="cs-map-confirm"]').disabled`, 45_000, "map");
  await click(chrome, '[data-testid="cs-map-confirm"]', "map confirm");
  await waitFor(chrome, `document.querySelector('[data-testid="cs-tactic-confirm"]')`, 30_000, "tactic");
  await click(chrome, '[data-testid="cs-tactic-confirm"]', "tactic confirm");
  await waitFor(chrome, `document.querySelector('[data-esmo-fps-player-card="t1"]')`, 120_000, "battle roster");
};

//  點一位選手 → 讀選手卡上「體力 N」的 N（卡片只在選取時出現，文字格式來自 EsportsFPS3D）。
const readCard = (chrome, id) => chrome.evaluate(`
  return (async () => {
    const btn = document.querySelector('[data-esmo-fps-player-card="${id}"]');
    if (!btn) return { ok: false, why: "no row" };
    btn.scrollIntoView({ block: "center" });
    btn.click();
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 100));
      //  體力那一行在卡片的「素質」展開區裡（預設收合）；沒展開就點一次（狀態會跨選手保留）。
      const toggle = [...document.querySelectorAll("button")].find((b) => /^素質▾$/.test((b.textContent || "").trim()));
      if (toggle) { toggle.click(); continue; }
      //  取「同時含 FPS戰力 與 體力」中文字最短的元素 ＝ 卡片那一行本身（不是外層容器）。
      const line = [...document.querySelectorAll("div")]
        .filter((d) => /FPS戰力/.test(d.textContent) && /體力\\s*-?\\d/.test(d.textContent))
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      if (line) {
        const m = /體力\\s*(-?\\d+)/.exec(line.textContent);
        return { ok: true, energy: m ? Number(m[1]) : null, text: line.textContent.replace(/\\s+/g, " ").trim() };
      }
    }
    return { ok: false, why: "card not shown" };
  })();
`);

const result = await runGate({
  name: "CS low-energy player card",
  timeoutMs: 600_000,
  run: async ({ chrome, url, ck, sleep }) => {
    for (const [label, viewport] of [
      ["desktop", { width: 1366, height: 900, mobile: false }],
      ["390", { width: 390, height: 844, mobile: true }],
    ]) {
      await enterBattle(chrome, url, viewport);
      await sleep(1500);
      const rows = {};
      for (const id of Object.keys(expected)) rows[id] = await readCard(chrome, id);
      for (const [id, want] of Object.entries(expected)) {
        const r = rows[id];
        ck(`${label} ${id} 選手卡顯示真實體力 ${want}${want < 70 ? "（引擎內部封頂 70）" : "（≥70 原路徑）"}`,
          r.ok && r.energy === want, r.ok ? r.text : r.why);
      }
      ck(`${label} 低體力選手沒有任何一位顯示成封頂值 70`,
        Object.entries(expected).filter(([, e]) => e < 70).every(([id]) => rows[id].ok && rows[id].energy !== 70));
      const overflow = await chrome.evaluate(`return document.documentElement.scrollWidth > innerWidth + 1;`);
      ck(`${label} 無水平溢出`, !overflow);
      const s = await chrome.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(`${OUT}/${label}.png`, Buffer.from(s.data, "base64"));
      const errs = (chrome.pageErrors ?? []).length;
      ck(`${label} page error 0`, errs === 0, String(errs));
    }
  },
});

await finishGate(result);
