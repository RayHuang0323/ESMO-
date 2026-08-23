#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_fan_ui_f4.mjs — Fan System F4 的瀏覽器驗收
//
//  執行：`node tools/browser_check_fan_ui_f4.mjs`（加 --headed 可看畫面）
//
//  ── 這一支在守什麼 ──────────────────────────────────────────────────────
//  靜態 verifier 證明得了「原始碼長這樣」，證明不了「玩家看到的是對的」。
//  F4 最需要瀏覽器證明的是**兩種存檔狀態**：
//    · 新存檔（有 `fansAtSeasonStart`）⇒ 賽季總結顯示 起點／目前／成長
//    · 舊存檔（`null`）⇒ **只顯示總數**，不出現 +0，不 crash，**不改存檔**
//  後者無法用單元測試證明「畫面沒有偷偷回填」——要真的載入、渲染、再讀存檔。
//
//  ⚠ 全程不用正則跳脫：這條路要穿過 .mjs template literal → CDP → 瀏覽器，
//    反斜線每層被吃一次。一律 includes / split / data 屬性。
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5346;
const CDP_PORT = 9382;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 開新局，並依 mode 把賽季推到「已封存、可換季」的狀態。 */
const SEED_SEALED_SEASON = (mode, tamperSnapshot) => `
  ${RESOLVE_APP_MODULES}
  const st = () => profile.useProfileStore.getState();
  localStorage.removeItem("esmo.profile.v1");
  st().startNewGame("elite");
  st().ensureCompetitionSeason("${mode}");
  //  把整季用模擬推完（不打真的比賽——F4 驗的是呈現，不是引擎）
  for (let i = 0; i < 200; i++) {
    const v = st().competitionView("${mode}");
    if (!v.hasSeason) break;
    if (v.final) break;
    st().advanceDay();
  }
  ${tamperSnapshot}
  st().save();
  const v = st().competitionView("${mode}");
  return { hasSeason: v.hasSeason, sealed: !!v.final,
           snapshot: v.fansAtSeasonStart, fans: st().meta.fans };
`;

/** 舊存檔：把快照拿掉（模擬 F2 之前建立的賽季）。 */
const DROP_SNAPSHOT = (mode) => `
  const cur = profile.useProfileStore.getState();
  const byMode = { ...(cur.competitionByMode ?? {}) };
  if (byMode["${mode}"]) {
    const copy = { ...byMode["${mode}"] };
    delete copy.fansAtSeasonStart;
    byMode["${mode}"] = copy;
    profile.useProfileStore.setState({ competitionByMode: byMode });
  }
`;

async function readRecap(chrome) {
  return chrome.evaluate(`
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(900);
    const n = document.querySelector('[data-testid="recap-fans"]');
    const body = (document.body.innerText || "").replace(/\\s+/g, " ");
    return {
      present: !!n,
      hasBaseline: n?.dataset?.hasBaseline ?? null,
      delta: n?.dataset?.delta ?? null,
      anomaly: n?.dataset?.anomaly ?? null,
      text: (n?.innerText || "").replace(/\\s+/g, " ").trim(),
      showsPlusZero: body.includes("+0"),
      overflow: document.body.scrollWidth > window.innerWidth + 1,
    };
  `);
}

async function main() {
  console.log("══ Fan F4 UI 驗收 ══\n");
  const server = await startDevServer({ port: VITE_PORT });
  const chrome = await launchChrome({ url: server.url, port: CDP_PORT, headless: HEADLESS });

  try {
    for (const vp of [
      { w: 1280, h: 800, mobile: false, label: "Desktop 1280" },
      { w: 390, h: 844, mobile: true, label: "Mobile 390" },
    ]) {
      console.log(`\n── ${vp.label} ──`);
      await chrome.send("Emulation.setDeviceMetricsOverride", {
        width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile,
      });

      // ── HOME ────────────────────────────────────────────────────────────
      await chrome.navigate(server.url);
      await chrome.evaluate(`localStorage.removeItem("esmo.profile.v1"); return true;`);
      await chrome.navigate(server.url);
      await sleep(3000);
      const home = await chrome.evaluate(`
        const NL = String.fromCharCode(10);
        const lines = (document.body.innerText || "").split(NL).map((s) => s.trim()).filter(Boolean);
        return {
          fansNode: !!document.querySelector('[data-testid="home-fans"]'),
          fansText: (document.querySelector('[data-testid="home-fans"]')?.innerText || "").replace(/\\s+/g, " ").trim(),
          modes: document.querySelectorAll('[data-testid^="home-mode-"]').length,
          cards: document.querySelectorAll('.esmo-action-card').length,
          hasFakeAudience: lines.some((l) => l.includes("2,041")),
          overflow: document.body.scrollWidth > window.innerWidth + 1,
        };`);
      ck(`${vp.label}｜HOME 支持者顯示正常`,
        home.fansNode && home.fansText.includes("支持者"), home.fansText || "(找不到)");
      ck(`${vp.label}｜HOME 沒有假 audience（2,041 已消失）`, !home.hasFakeAudience);
      ck(`${vp.label}｜HOME 三個模式入口仍在，沒多一張 Fan card`,
        home.modes === 3 && home.cards <= 4, `${home.modes} 入口 / ${home.cards} 待辦卡`);
      ck(`${vp.label}｜HOME 無 body 橫向捲動`, !home.overflow);

      // ── SPONSOR ─────────────────────────────────────────────────────────
      const sponsor = await chrome.evaluate(`
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        for (let i = 0; i < 14; i++) {
          const hit = [...document.querySelectorAll("button")].find((b) => {
            const t = (b.innerText || "").trim();
            return t.includes("管理合作") || t.includes("尋找合作") || t === "贊助商" || t === "贊助";
          });
          if (hit) { hit.click(); await wait(900); break; }
          await wait(350);
        }
        const rows = [...document.querySelectorAll('[data-testid="sponsor-req"]')].map((n) => ({
          id: n.dataset.sponsor, fansOk: n.dataset.fansOk === "true",
          winsOk: n.dataset.winsOk === "true", blockedBy: n.dataset.blockedBy,
          text: (n.innerText || "").replace(/\\s+/g, " ").trim(),
        }));
        const body = (document.body.innerText || "").replace(/\\s+/g, " ");
        return { rows, body: body.slice(0, 200),
                 hasFakePerk: body.includes("訓練效果") || body.includes("體力恢復") || body.includes("選手士氣"),
                 hasCurrentFans: body.includes("目前粉絲"),
                 overflow: document.body.scrollWidth > window.innerWidth + 1 };`);
      ck(`${vp.label}｜SPONSOR 顯示目前粉絲與每個贊助的門檻`,
        sponsor.hasCurrentFans && sponsor.rows.length === 6, `${sponsor.rows.length} 張卡`);
      ck(`${vp.label}｜SPONSOR 看得出「差在哪」（粉絲／勝場分開）`,
        sponsor.rows.some((r) => r.text.includes("粉絲") && r.text.includes("勝場")),
        sponsor.rows[0]?.text ?? "-");
      ck(`${vp.label}｜SPONSOR 有還差多少（含千分位）`,
        sponsor.rows.some((r) => r.text.includes("還差") && r.text.includes(",")),
        sponsor.rows.find((r) => r.text.includes("還差"))?.text ?? "-");
      ck(`${vp.label}｜SPONSOR 假 perk 效果已消失`, !sponsor.hasFakePerk);
      ck(`${vp.label}｜SPONSOR 無 body 橫向捲動`, !sponsor.overflow,
        `body ${vp.w}`);

      // ── SEASON RECAP：直接掛載 RecapFans 驗兩種存檔狀態 ─────────────────
      //  ⚠ 為什麼不打完一整季：`advanceDay()` 會停在玩家自己的比賽日
      //    （`stoppedBy`），要封存就得真的把整季打完——那是先前證實過的兔子洞。
      //    這裡改用 app 自己的 React 把元件掛到獨立 root，讀真實 DOM。
      //    「渲染不得回填快照」則另外用 Store 直接驗（見下方）。
      const recap = await chrome.evaluate(`
        const B = location.pathname.endsWith("/") ? location.pathname.slice(0, -1) : location.pathname;
        //  用字串切分挖 Vite 改寫過的 import URL（不用正則，反斜線會被吃掉）
        const grab = async (modPath, marker) => {
          const url = B + modPath;
          const text = await (await fetch(url)).text();
          const hit = text.split(String.fromCharCode(34)).find((s) => s.includes(marker));
          if (!hit) throw new Error("找不到 " + marker + " 的 import");
          return new URL(hit, new URL(url, location.href)).href;
        };
        const reactUrl = await grab("/src/ui/RewardReceiptPanel.jsx", "deps/react.js");
        const domUrl = await grab("/src/main.jsx", "react-dom_client");
        const pick = (ns, k) => (typeof ns?.[k] === "function" ? ns[k]
                              : typeof ns?.default?.[k] === "function" ? ns.default[k] : null);
        const reactNs = await import(reactUrl);
        const React = typeof reactNs.createElement === "function" ? reactNs : reactNs.default;
        const createRoot = pick(await import(domUrl), "createRoot");
        const mod = await import(B + "/src/screens/manage/seasonRecap/RecapFans.jsx");

        const mount = (props) => {
          const host = document.createElement("div");
          host.style.cssText = "position:fixed;left:0;top:0;width:420px;z-index:99999;background:#0b0d12";
          document.body.appendChild(host);
          createRoot(host).render(React.createElement(mod.default, props));
          return host;
        };
        const a = mount({ fans: 143420, fansAtSeasonStart: 128000 });   // 新存檔
        const b = mount({ fans: 143420, fansAtSeasonStart: null });     // 舊存檔
        await new Promise((r) => setTimeout(r, 700));
        const read = (h) => {
          const n = h.querySelector('[data-testid="recap-fans"]');
          return { hasBaseline: n?.dataset?.hasBaseline ?? null,
                   delta: n?.dataset?.delta ?? null,
                   text: (n?.innerText || "").replace(/\\s+/g, " ").trim(),
                   width: h.getBoundingClientRect().width };
        };
        const out = { withBaseline: read(a), noBaseline: read(b),
                      overflow: document.body.scrollWidth > window.innerWidth + 1 };
        a.remove(); b.remove();
        return out;
      `);

      ck(`${vp.label}｜RECAP 新存檔顯示起點／目前／成長（+15,420）`,
        recap.withBaseline.hasBaseline === "true" &&
        recap.withBaseline.delta === "15420" &&
        recap.withBaseline.text.includes("本季成長"),
        recap.withBaseline.text.slice(0, 80));
      ck(`${vp.label}｜RECAP 舊存檔只顯示總數，**不顯示 +0**`,
        recap.noBaseline.hasBaseline === "false" &&
        !recap.noBaseline.text.includes("+0") &&
        recap.noBaseline.text.includes("143,420"),
        recap.noBaseline.text.slice(0, 80));
      ck(`${vp.label}｜RECAP 舊存檔誠實說明「下一賽季開始統計」`,
        recap.noBaseline.text.includes("下一賽季"), recap.noBaseline.text.slice(0, 60));
      ck(`${vp.label}｜RECAP 兩種狀態都不造成橫向捲動`, !recap.overflow);

      // ── 渲染 recap 不得回填快照（Store 層直接驗）────────────────────────
      await chrome.navigate(server.url);
      const noBackfill = await chrome.evaluate(`
        ${RESOLVE_APP_MODULES}
        const st = () => profile.useProfileStore.getState();
        localStorage.removeItem("esmo.profile.v1");
        st().startNewGame("elite");
        st().ensureCompetitionSeason("moba");
        //  模擬 F2 之前的舊存檔：拿掉快照
        const byMode = { ...(st().competitionByMode ?? {}) };
        const copy = { ...byMode.moba };
        delete copy.fansAtSeasonStart;
        byMode.moba = copy;
        profile.useProfileStore.setState({ competitionByMode: byMode });
        st().save();
        //  讀 view（畫面就是讀這個）很多次，看它會不會偷偷寫回去
        for (let i = 0; i < 5; i++) st().competitionView("moba");
        const saved = JSON.parse(localStorage.getItem("esmo.profile.v1") || "{}");
        return { view: st().competitionView("moba").fansAtSeasonStart ?? null,
                 live: st().competitionByMode?.moba?.fansAtSeasonStart ?? null,
                 persisted: saved.competitionByMode?.moba?.fansAtSeasonStart ?? null };`);
      ck(`${vp.label}｜舊存檔讀 view 五次後**沒有回填**快照`,
        noBackfill.view === null && noBackfill.live === null && noBackfill.persisted === null,
        `view=${String(noBackfill.view)} live=${String(noBackfill.live)} 落盤=${String(noBackfill.persisted)}`);
    }

    const errs = chrome.consoleLines.filter((l) => l.startsWith("[error]"));
    ck("console error = 0 且無未捕捉例外",
      errs.length === 0 && chrome.pageErrors.length === 0,
      [...errs.slice(0, 3), ...chrome.pageErrors.slice(0, 3)].join(" | ") || "(無)");
  } finally {
    await chrome.close();
    await server.stop();
  }

  console.log(`\n${pass}/${pass + fail} 通過`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\n\u{1F4A5} ${e.message}`); process.exit(1); });
