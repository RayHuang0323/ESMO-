#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_moba_combat_polish_r2.mjs — feature/moba-combat-polish-r2 瀏覽器驗收
//
//  執行：node tools/browser/run-gate.mjs tools/browser_check_moba_combat_polish_r2.mjs --timeout 2400000
//  （dev server；?diag=1 只開驗收讀值。evaluate 字串不可含反引號。）
//
//  桌機 1366×900 與 390×844 各一輪，全部走正式流程（首頁 → 賽前 → Ban/Pick → 載入 → Battle）：
//    P   1×／2×／4× 對戰都在跑
//    V   技能家族層實戰中畫出（≥ 1 種；Workshop 另逐一驗 sky／lightning／slam／burst）
//    SP  召喚師技能施放瞬間有特效（懲戒最穩定：每場打野一定會用）
//    ST  狀態「上身瞬間」回饋真的出現（onset）
//    D   英雄陣亡後地面沒有任何陣亡標記（場上確實有人陣亡時驗證）
//    H   野怪死亡時血條先扣到 0 再消失（drain 幀數 > 0）
//    RS  離開 → 首頁「返回進行中的比賽」→ 時間接續前進、沒有倒退
//    R   Replay：1×／2×／4× 都在前進
//    X   page error 0、console／shader error 0
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const OUT = process.env.ESMO_REVIEW_OUT ?? "tmp/moba-combat-polish-r2";
mkdirSync(OUT, { recursive: true });
const VIS = "const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}; const q=(s)=>[...document.querySelectorAll(s)].find(vis);";

const result = await runGate({
  name: "MOBA combat polish r2", timeoutMs: 2_300_000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* 下一個 */ } } return r; };
    const wait = async (expr, ms, every = 400) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(VIS + "return JSON.stringify(!!(" + expr + "));")) return true; } catch { /* 換頁中 */ } await sleep(every); } return false; };
    const click = (sel) => chrome.evaluate(VIS + "const el=q(" + JSON.stringify(sel) + "); if(el) el.click(); return JSON.stringify(!!el);");
    const clickText = (t) => chrome.evaluate(VIS + "const el=[...document.querySelectorAll('button')].filter(vis).find(b=>(b.innerText||'').trim()===" + JSON.stringify(t) + "||(b.innerText||'').includes(" + JSON.stringify(t) + ")); if(el) el.click(); return JSON.stringify(!!el);");
    const clickExact = (t) => chrome.evaluate(VIS + "const el=[...document.querySelectorAll('button')].filter(vis).find(b=>(b.innerText||'').trim()===" + JSON.stringify(t) + "); if(el) el.click(); return JSON.stringify(!!el);");
    const shot = async (name) => { const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    const diag = () => ev("const d=window.__ESMO_RUNTIME_DIAG?window.__ESMO_RUNTIME_DIAG():null; const v=window.__HERO_VFX_DIAG?window.__HERO_VFX_DIAG():null; const s=window.__HERO_STATUS_FX_DIAG?window.__HERO_STATUS_FX_DIAG():null; return JSON.stringify(d?{ts:d.ts,heroes:d.heroCount,vfx:v,status:s,drain:window.__NEUTRAL_HP_DRAIN||0,marks:(d.heroRenderDiagnostics||[]).map(h=>({v:h.deathMarkVisible,shape:h.deathMarkShape,down:h.bodyLyingDown}))}:null);");
    const clock = () => ev("const h=document.querySelector('[data-testid=\"battle-hud\"]'); const m=(h&&h.innerText||'').match(/(\\d+):(\\d\\d)/); return JSON.stringify(m?Number(m[1])*60+Number(m[2]):null);");
    const inBattle = "document.querySelector('[data-testid=\"battle-hud\"]') && document.querySelector('canvas')";

    async function toBattle() {
      await chrome.navigate(url + "?diag=1");
      await chrome.evaluate("try{localStorage.clear();sessionStorage.clear();}catch(e){} return 1;");
      await chrome.navigate(url + "?diag=1");
      if (!(await wait("q('[data-testid=\"home-mode-moba\"]')", 90000))) return false;
      await click('[data-testid="home-mode-moba"]');
      await wait("q('[data-testid=\"prep-primary-action\"]')", 60000);
      const t0 = Date.now();
      while (Date.now() - t0 < 150000) {
        const s = await ev(VIS + "if(q('[data-testid=\"hero-grid-scroll\"]')) return JSON.stringify('bp'); const b=q('[data-testid=\"matchmaking-enter-banpick\"]'); if(b&&!b.disabled){b.click();return JSON.stringify('mm');} const a=q('[data-testid=\"prep-primary-action\"]'); if(a&&a.dataset.action==='blocked'){const x=[...document.querySelectorAll('button')].filter(vis).find(n=>(n.innerText||'').includes('自動')); if(x) x.click(); return JSON.stringify('auto');} if(a&&!a.disabled){a.click(); return JSON.stringify('prep');} return JSON.stringify('wait');");
        if (s === "bp") break; await sleep(900);
      }
      const t1 = Date.now();
      while (Date.now() - t1 < 150000) {
        const done = await ev(VIS + "const c=q('[data-testid=\"confirm-draft\"]'); if(c&&!c.disabled){c.click(); return JSON.stringify(true);} const h=q('[data-testid=\"hero-choose\"]'); if(h){for(const t of ['pointerdown','mousedown','pointerup','mouseup','click']) h.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true}));} return JSON.stringify(false);");
        if (done) break; await sleep(1200);
      }
      await wait("[...document.querySelectorAll('button')].some(b=>(b.innerText||'').includes('開始載入'))", 60000);
      await clickText("開始載入");
      const t2 = Date.now();
      while (Date.now() - t2 < 150000) {
        if (await ev(VIS + "return JSON.stringify(!!(" + inBattle + "));")) return wait("window.__ESMO_RUNTIME_DIAG", 30000);
        await chrome.evaluate(VIS + "const s=[...document.querySelectorAll('button')].filter(vis).find(b=>/開始比賽|進入戰鬥|開始戰鬥/.test(b.innerText||'')); if(s&&!s.disabled) s.click(); return 1;");
        await sleep(700);
      }
      return false;
    }

    for (const vp of [
      { label: "Desktop", width: 1366, height: 900, deviceScaleFactor: 1, mobile: false },
      { label: "390", width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
    ]) {
      const L = vp.label;
      await chrome.send("Emulation.setDeviceMetricsOverride", vp);
      ck(`${L}｜P0 正式流程進入 MOBA 戰鬥（diag）`, await toBattle());
      for (const rate of [1, 2, 4]) {
        await click(`[data-testid="match-speed-${rate}"]`);
        const a = await diag(); await sleep(2500); const b = await diag();
        ck(`${L}｜P${rate} ${rate}× 對戰在跑（十名英雄、時間前進）`, a?.heroes === 10 && b?.ts > a?.ts, `${a?.ts?.toFixed?.(1)} → ${b?.ts?.toFixed?.(1)}`);
      }
      //  4× 取樣 90 秒（≈ 6 模擬分）：打野第一輪清野＝懲戒、野怪死亡、第一波交戰的狀態
      let last = null, deadSeen = 0, markSeen = 0; const shapes = new Set();
      const t0 = Date.now();
      while (Date.now() - t0 < 90000) {
        const d = await diag();
        if (d) { last = d; for (const m of d.marks ?? []) { if (m.shape) shapes.add(m.shape); if (m.v) markSeen++; if (m.down) deadSeen++; } }
        await sleep(700);
      }
      await shot(`${L}-battle-4x`);
      const fams = Object.entries(last?.vfx?.spectacle ?? {}).filter(([, n]) => n > 0).map(([k]) => k);
      ck(`${L}｜V1 技能家族層實戰中畫出（≥ 1 種）`, fams.length >= 1, JSON.stringify(last?.vfx?.spectacle));
      ck(`${L}｜SP1 懲戒施放瞬間有特效（落雷打在野怪上）`, (last?.vfx?.spells?.smite ?? 0) > 0, JSON.stringify(last?.vfx?.spells));
      const onsets = Object.keys(last?.status?.seen ?? {}).filter((k) => k.startsWith("onset:"));
      ck(`${L}｜ST1 狀態上身瞬間有回饋（onset ≥ 1 種）`, onsets.length >= 1, JSON.stringify(last?.status?.seen));
      ck(`${L}｜D1 英雄陣亡後地面沒有陣亡標記（取樣期間確實有人倒地）`, deadSeen > 0 && markSeen === 0 && shapes.size === 0, `倒地樣本 ${deadSeen}／標記可見 ${markSeen}／標記幾何 ${[...shapes].join(",") || "無"}`);
      ck(`${L}｜H1 野怪死亡時血條先扣到 0 再消失（drain 幀數 > 0）`, (last?.drain ?? 0) > 0, `drain frames ${last?.drain}`);

      //  RS：離開 → 返回進行中的比賽 → 時間接續
      const before = await clock();
      await click('[data-testid="leave-active-match"]');
      const home = await wait("q('[data-testid=\"resume-active-match\"]')", 30000);
      ck(`${L}｜RS0 離開後首頁有「返回進行中的比賽」`, home);
      if (home) {
        await sleep(1200);
        const tClick = Date.now();
        await click('[data-testid="resume-active-match"]');
        let progressSeen = false, resumedAt = null, first = null;
        while (Date.now() - tClick < 60000) {
          const s = await ev("const p=document.querySelector('[data-testid=\"resume-progress\"]'); const h=document.querySelector('[data-testid=\"battle-hud\"]'); const m=(h&&h.innerText||'').match(/(\\d+):(\\d\\d)/); return JSON.stringify({p:!!p, c:m?Number(m[1])*60+Number(m[2]):null});");
          if (s?.p) progressSeen = true;
          if (s?.c != null && !s.p) { if (first == null) first = s.c; else if (s.c > first) { resumedAt = Date.now() - tClick; break; } }
          await sleep(250);
        }
        ck(`${L}｜RS1 返回後比賽接續前進（沒有倒退、60 秒內恢復）`, resumedAt != null && first >= (before ?? 0) - 2, `離開 ${before}s → 恢復 ${first}s；${resumedAt}ms；進度提示 ${progressSeen ? "有" : "太快沒看到"}`);
      }

      //  R：快速完成 → 結果 → 重播 1×／2×／4×
      await chrome.evaluate(VIS + "window.confirm=()=>true; const el=q('[data-testid=\"quick-finish-match\"]'); setTimeout(()=>{ if(el) el.click(); },0); return JSON.stringify(!!el);");
      const res = await wait("[...document.querySelectorAll('button')].some(b=>(b.innerText||'').includes('觀看重播'))", 300000, 800);
      ck(`${L}｜R0 比賽結束 ⇒ 結果頁`, res);
      if (res) {
        await clickText("觀看重播");
        const open = await wait("document.querySelector('[aria-label=\"比賽重播\"]') && window.__ESMO_RUNTIME_DIAG", 60000);
        ck(`${L}｜R1 Replay 開啟`, open);
        if (open) {
          //  Replay 預設自動播放；時間讀「時間軸滑桿」的值（__ESMO_RUNTIME_DIAG 的 ts 不是重播時鐘）
          const rt = () => ev(VIS + "const r=q('[aria-label=\"重播時間軸\"]'); return JSON.stringify(r?Number(r.value):null);");
          const playingNow = await ev("const b=document.querySelector('[data-testid=\"replay-play-toggle\"]'); return JSON.stringify(b?(b.innerText||'').includes('⏸'):null);");
          if (playingNow === false) await click('[data-testid="replay-play-toggle"]');
          await sleep(1500);
          const gain = {};
          for (const s of [1, 2, 4]) {
            await clickExact(`${s}×`); await sleep(300);
            const a = await rt(); await sleep(2500); const b = await rt();
            gain[s] = b - a;
            ck(`${L}｜R${s + 1} Replay ${s}× 在前進`, b > a, `${a} → ${b}`);
          }
          ck(`${L}｜R8 Replay 倍率有效（4× 前進量 > 1× 前進量）`, gain[4] > gain[1], JSON.stringify(gain));
          await shot(`${L}-replay`);
        }
      }
    }
    //  G：Workshop 逐一播放四個垂直／爆發家族
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(url + "?debug=hero-skills");
    if (await wait("document.querySelector('select[aria-label=\"技能\"]')", 60000)) {
      for (const [fam, id] of [["sky", "phantom:R"], ["lightning", "leiting:Q"], ["slam", "ironclad:Q"], ["burst", "hundun:Q"]]) {
        await chrome.evaluate("const s=document.querySelector('select[aria-label=\"技能\"]'); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s," + JSON.stringify(id) + "); s.dispatchEvent(new Event('change',{bubbles:true})); return 1;");
        let got = 0;
        for (let i = 0; i < 30 && !got; i++) { await sleep(200); got = await ev("const p=window.__HERO_SKILLS_PREVIEW__; return JSON.stringify(p&&p.skillId===" + JSON.stringify(id) + "&&p.spectacle?(p.spectacle." + fam + "||0):0);"); }
        ck(`G｜${fam} 家族在技能預覽中畫出（${id}）`, got > 0, `${got}`);
        await sleep(900); await shot(`workshop-${fam}`);
      }
    } else ck("G｜技能預覽頁可開", false);

    const errs = chrome.consoleLines.filter((l) => /shader error|VALIDATE_STATUS|WebGL.*error|Uncaught|TypeError|ReferenceError/i.test(JSON.stringify(l)));
    ck("X1 page error = 0", chrome.pageErrors.length === 0, JSON.stringify(chrome.pageErrors).slice(0, 400));
    ck("X2 console／shader error = 0", errs.length === 0, JSON.stringify(errs).slice(0, 400));
  },
});
await finishGate(result);
