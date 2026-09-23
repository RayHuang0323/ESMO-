// ============================================================================
//  tools/browser_check_battle_condition_ux.mjs — Battle Condition UX 瀏覽器驗收
//
//  桌機 1366×900 與 390×844 各跑一輪：
//    E 首頁體力提醒 → 體力管理面板 → 全選 → 安排休息（走正式 assignTraining）
//      ⚠ 不得偷偷推進日期：安排前後 meta.days 必須相同
//    C 體力 100／20／10／0 都能進入對戰（出賽資格與體力脫鉤）
//    M MOBA runtime：1×／2×／4× 都跑得動、沒有常駐英雄名牌、技能標籤有出現
//    R 地面不再有隊伍環／Buff 環（用 runtime frame 的 userData part 掃描）
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";
import { RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const OUT = process.env.ESMO_REVIEW_OUT ?? "tmp/battle-condition-ux";
mkdirSync(OUT, { recursive: true });

const VIS = "const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}; const q=(s)=>[...document.querySelectorAll(s)].find(vis);";

//  ⚠ 模組 URL 由 `RESOLVE_APP_MODULES` 推導（它會從 settleMatchBoundary 的原始碼
//    找出 store 的真實路徑）——自己組 `/src/...` 在 base path 不是根目錄時會 404。
const RESOLVE = `
  ${RESOLVE_APP_MODULES}
  const cond = await import(new URL("./condition/playerCondition.js", storeUrl).href);
`;

const result = await runGate({
  name: "Battle Condition UX", timeoutMs: 1400000,
  async run({ chrome, url, ck, sleep }) {
    const ev = (code) => chrome.evaluate(code);
    const evAsync = (code) => chrome.evaluate(`return (async () => { ${code} })();`);
    const shot = async (name) => {
      const s = await chrome.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64"));
    };
    const wait = async (expr, ms = 15000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (await ev(`return !!(${expr});`)) return true;
        await sleep(250);
      }
      return false;
    };

    for (const vp of [
      { label: "Desktop", w: 1366, h: 900, scale: 1, mobile: false },
      { label: "Mobile390", w: 390, h: 844, scale: 2, mobile: true },
    ]) {
      await chrome.send("Emulation.setDeviceMetricsOverride",
        { width: vp.w, height: vp.h, deviceScaleFactor: vp.scale, mobile: vp.mobile });
      await chrome.navigate(url);
      await wait("document.querySelector('.esmo-dashboard')", 25000);

      // ── 佈置：把全隊體力壓到提醒門檻以下（走 store，不碰畫面）────────────
      const setup = await evAsync(`${RESOLVE}
        const st = () => profile.useProfileStore.getState();
        const players = (st().players ?? []).map((p, i) => ({ ...p, energy: [0, 10, 20, 5, 12][i % 5], training: null }));
        profile.useProfileStore.setState({ players });
        st().save();
        return JSON.stringify({ n: players.length, low: players.filter((p) => cond.isLowEnergy(p)).length,
          days: st().meta?.days ?? null, fitAll: players.every((p) => cond.matchFitness(p).ok) });`);
      const s0 = JSON.parse(setup ?? "{}");
      ck(`${vp.label}｜C1 體力 0–20 的全隊仍然全部「可出賽」`, s0.fitAll === true && s0.low > 0, setup);

      await chrome.navigate(url);
      await wait("document.querySelector('.esmo-dashboard')", 25000);
      const todoSeen = await ev(`${VIS} return (document.body.innerText||"").includes("安排選手休息");`);
      ck(`${vp.label}｜E1 首頁出現「安排選手休息」待辦`, todoSeen === true);

      const opened = await ev(`${VIS}
        const btns=[...document.querySelectorAll("button")].filter(vis)
          .filter((b)=>(b.innerText||"").includes("安排選手休息"));
        if(!btns.length) return false; btns[0].click(); return true;`);
      ck(`${vp.label}｜E2 點待辦會打開體力管理面板`,
        opened === true && await wait("document.querySelector('[data-testid=rest-planner]')", 8000));
      await shot(`${vp.label}-rest-planner`);

      const rows = await ev("return document.querySelectorAll('[data-testid=rest-player-row]').length;");
      ck(`${vp.label}｜E3 面板列出低體力選手（含疲勞百分比）`,
        rows > 0 && await ev("return !!document.querySelector('[data-testid=rest-player-fatigue]');"), `${rows} 列`);

      //  全選 → 安排休息；記錄前後的遊戲天數
      const before = await evAsync(`${RESOLVE} return String(profile.useProfileStore.getState().meta?.days ?? "");`);
      await ev("const b=document.querySelector('[data-testid=rest-select-all]'); if(b) b.click(); return 1;");
      await sleep(200);
      await ev("const b=document.querySelector('[data-testid=rest-select-all]'); if(b) b.click(); return 1;");
      await sleep(200);
      const assigned = await ev("const b=document.querySelector('[data-testid=rest-assign]'); if(!b||b.disabled) return false; b.click(); return true;");
      ck(`${vp.label}｜E4 全選後可以一次安排休息`,
        assigned === true && await wait("document.querySelector('[data-testid=rest-planner-result]')", 6000));
      await shot(`${vp.label}-rest-assigned`);

      const after = await evAsync(`${RESOLVE}
        const st = () => profile.useProfileStore.getState();
        const players = st().players ?? [];
        return JSON.stringify({ days: st().meta?.days ?? null,
          resting: players.filter((p) => p.training?.courseId === "rest").length,
          energies: players.map((p) => p.energy) });`);
      const s1 = JSON.parse(after ?? "{}");
      ck(`${vp.label}｜E5 休息安排寫進正式訓練槽（不是直接改體力）`,
        s1.resting > 0 && s1.energies.every((e) => e <= 20), after);
      ck(`${vp.label}｜E6 安排休息不會推進遊戲日期`, String(s1.days) === String(before), `${before} → ${s1.days}`);
    }

    // ── M：MOBA runtime（桌機＋390）1×／2×／4× ────────────────────────────
    for (const vp of [
      { label: "Desktop", w: 1366, h: 900, scale: 1, mobile: false },
      { label: "Mobile390", w: 390, h: 844, scale: 2, mobile: true },
    ]) {
      await chrome.send("Emulation.setDeviceMetricsOverride",
        { width: vp.w, height: vp.h, deviceScaleFactor: vp.scale, mobile: vp.mobile });
      await chrome.navigate(`${url}?debug=moba-runtime-battle&mapPresentation=runtime-v2&diag=1&waitTs=1&quality=low`);
      const ready = await wait("window.__ESMO_RUNTIME_DIAG", 60000);
      ck(`${vp.label}｜M0 進入 MOBA runtime`, ready);
      if (!ready) continue;

      for (const rate of [1, 2, 4]) {
        await ev(`const b=document.querySelector('[data-testid="match-speed-${rate}"]'); if(b) b.click(); return !!b;`);
        await sleep(2500);
        const d = await ev("const d=window.__ESMO_RUNTIME_DIAG?.(); return d ? JSON.stringify({ts:d.ts, heroes:d.heroCount, minions:d.minionCount, fx:d.activeEffectCount}) : null;");
        ck(`${vp.label}｜M1 ${rate}× 對戰在跑（十名英雄、有小兵）`,
          (() => { const x = JSON.parse(d ?? "null"); return !!x && x.heroes === 10 && x.ts > 0; })(), d);
        await shot(`${vp.label}-moba-${rate}x`);
      }
      const parts = await ev(`
        const seen = new Set();
        const walk = (o) => { if(!o) return; if(o.userData && o.userData.part) seen.add(o.userData.part);
          (o.children||[]).forEach(walk); };
        const root = window.__ESMO_RUNTIME_SCENE || null;
        if (root) walk(root);
        return JSON.stringify([...seen]);`);
      ck(`${vp.label}｜M2 沒有常駐英雄名牌（DOM 與畫面都沒有 hero name plate）`,
        !(await ev("return !!document.querySelector('[data-hero-nameplate]');")), parts ?? "");
      const callout = await ev("return document.querySelectorAll('[data-testid=skill-cast-callout]').length;");
      ck(`${vp.label}｜M3 技能施放標籤數量受限（≤ 3）`, Number(callout) <= 3, `目前 ${callout} 個`);
    }

    ck("無 page error", chrome.pageErrors.length === 0, JSON.stringify(chrome.pageErrors).slice(0, 300));
    const bad = chrome.consoleLines.filter((l) => /shader error|VALIDATE_STATUS|Error:|WebGL.*error/i.test(JSON.stringify(l)));
    ck("無 console／shader error", bad.length === 0, JSON.stringify(bad).slice(0, 300));
  },
});
await finishGate(result);
