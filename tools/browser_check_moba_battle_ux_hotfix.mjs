#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_moba_battle_ux_hotfix.mjs — MOBA Battle UX hotfix 煙霧測試
//
//  執行：node tools/browser/run-gate.mjs tools/browser_check_moba_battle_ux_hotfix.mjs --timeout 1500000
//  正式站：ESMO_EXTERNAL_URL=https://rayhuang0323.github.io/ESMO-/ node tools/browser/run-gate.mjs …（同一支）
//    ⚠ 瀏覽器端完全不 import /src/（打包後沒有那些路徑，TD-31）；N 段在 Node 端 import，驗的是本機原始碼。
//
//  全部走**正式流程**（首頁 → 賽前 → Ban/Pick → 戰術 → 載入 → 戰鬥），不走 debug harness：
//    N  純函式：技能呈現下限、鏡頭放大倍率、裝備資訊卡 selector（Node 端直接 import）
//    V  桌面 ?diag=1：具名技能真的施放、VFX 真的畫到、施放標籤出現在 DOM
//    D  桌面 1366×900：底欄「裝備詳情」→ 共用裝備面板（名稱／屬性／下一件／金錢）→ 完整詳情；
//       十人列 hover 裝備 ⇒ 資訊卡；暫停並離開 → 返回比賽；快速完成 → 結果 → 重播
//    M  手機 390×844：裝備入口有「🛒 裝備」字樣與一次性提示、觸控區 ≥ 44、面板與資訊卡、
//       完整詳情 → **點左上英雄頭像不會退出戰鬥**（真的 CDP 點擊＋elementFromPoint）、
//       隊伍面板可開、無橫向 overflow
//    E  page error 0、console／shader error 0
//  ⚠ chrome.evaluate 的字串裡不能有反引號。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";
import { adaptEffects, SKILL_MIN_VISUAL_LIFE } from "../src/battle/moba/map/mobaRuntimeMapAdapter.js";
import { skillScreenRadius, SKILL_READABILITY } from "../src/battle/moba/skills/skillReadability.js";
import { itemInfo } from "../src/battle/moba/itemInfo.js";

const TARGET_URL = process.env.ESMO_EXTERNAL_URL?.trim() || null;
const OUT = process.env.ESMO_REVIEW_OUT ?? (TARGET_URL ? "tmp/battle-ux-hotfix-prod" : "tmp/battle-ux-hotfix");
mkdirSync(OUT, { recursive: true });

const VIS = "const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}; const q=(s)=>[...document.querySelectorAll(s)].find(vis);";

const result = await runGate({ name: TARGET_URL ? "MOBA Battle UX hotfix（正式站）" : "MOBA Battle UX hotfix", timeoutMs: 1400000,
  externalUrl: TARGET_URL,
  async run({ chrome, url, ck, sleep }) {
    // ── N 純函式 ───────────────────────────────────────────────────────────
    const skillFx = { id: "fx1", skillId: "ravager:Q", ability: "hero:Q", at: 10, life: 0.4, pos: { x: 50, y: 50 }, target: { x: 55, y: 50 } };
    const atOld = adaptEffects({ ts: 10.9, fx: [skillFx] }, 10.9).length;
    const atEnd = adaptEffects({ ts: 10 + SKILL_MIN_VISUAL_LIFE + 0.01, fx: [skillFx] }, 10 + SKILL_MIN_VISUAL_LIFE + 0.01).length;
    ck("N1 具名技能的呈現至少 1.4 遊戲秒（原 life 0.4 ⇒ 0.9 秒時仍在畫）", SKILL_MIN_VISUAL_LIFE === 1.4 && atOld === 1 && atEnd === 0, `0.9s:${atOld} 1.41s:${atEnd}`);
    const plain = adaptEffects({ ts: 10.9, fx: [{ ...skillFx, skillId: undefined, ability: "attack" }] }, 10.9).length;
    ck("N2 一般攻擊特效時長不變（只放寬具名技能）", plain === 0);
    ck("N3 下限 ≤ 引擎技能保留窗 4.2 秒", SKILL_MIN_VISUAL_LIFE <= 4.2);
    //  Combat Quality v1 起：可讀性改用**螢幕空間**尺寸（最小像素／畫面比例上限），
    //  不再是「依 zoom 等比例放大」。總覽鏡頭仍要放大、拉近不縮小、透視不調整。
    const ortho = (zoom) => ({ isOrthographicCamera: true, zoom, top: 40, bottom: -40 });
    const rQ = skillScreenRadius(1.2, "Q", ortho(3.4), 746);
    const rNear = skillScreenRadius(1.2, "Q", ortho(12), 746);
    ck("N4 總覽鏡頭放大到最小像素、拉近不縮小、透視不調整",
      rQ >= SKILL_READABILITY.minRadiusPx.Q * (80 / 3.4 / 746) - 1e-9
      && rQ <= 746 * SKILL_READABILITY.maxScreenFrac * (80 / 3.4 / 746) + 1e-9
      && rNear >= 1.2
      && skillScreenRadius(1.2, "R", { isPerspectiveCamera: true, zoom: 1 }, 746) === 1.2,
      `總覽 Q ${rQ.toFixed(2)}／拉近 ${rNear.toFixed(2)}`);
    const dawn = itemInfo("t3_dawnbow");
    ck("N5 裝備資訊卡 selector：名稱／階級／價格／非 0 屬性", dawn?.name === "破曉長弓" && dawn.tier === "T3" && dawn.price === 3100
      && dawn.stats.some(([k]) => k === "ad") && itemInfo("nope") === null);

    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* 下一個候選 */ } } return r.replace(/^"|"$/g, ""); };
    const wait = async (expr, ms, every = 400) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(VIS + "return JSON.stringify(!!(" + expr + "));")) return true; await sleep(every); } return false; };
    const click = (sel) => chrome.evaluate(VIS + "const el=q(" + JSON.stringify(sel) + "); if(el) el.click(); return JSON.stringify(!!el);");
    const clickText = (t) => chrome.evaluate(VIS + "const el=[...document.querySelectorAll('button')].filter(vis).find(b=>(b.innerText||'').includes(" + JSON.stringify(t) + ")); if(el) el.click(); return JSON.stringify(!!el);");
    const realClickAt = async (x, y) => { for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await chrome.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 }); };
    const rectOf = async (sel) => ev(VIS + "const el=q(" + JSON.stringify(sel) + "); if(!el) return JSON.stringify(null); const r=el.getBoundingClientRect(); return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height});");
    const shot = async (name) => { const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    const inBattle = "document.querySelector('[data-testid=\"battle-hud\"]') && document.querySelector('canvas')";

    async function toBattle(query, label) {
      await chrome.navigate(url + query);
      ck(`${label}｜首頁有 MOBA 入口`, await wait("q('[data-testid=\"home-mode-moba\"]')", 90000));
      const resume = await ev(VIS + "return JSON.stringify(!!q('[data-testid=\"resume-active-match\"]'));");
      if (resume) { await click('[data-testid="resume-active-match"]'); return wait(inBattle, 90000); }
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
        if (await ev(VIS + "return JSON.stringify(!!(" + inBattle + "));")) return true;
        await chrome.evaluate(VIS + "const s=[...document.querySelectorAll('button')].filter(vis).find(b=>/開始比賽|進入戰鬥|開始戰鬥/.test(b.innerText||'')); if(s&&!s.disabled) s.click(); return 1;");
        await sleep(700);
      }
      return false;
    }
    const resetSave = () => chrome.evaluate("try{localStorage.clear();sessionStorage.clear();}catch(e){} return 1;");

    // ── V 桌面 diag：技能真的施放、真的畫到、標籤出現 ────────────────────────
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(url); await resetSave();
    ck("V0 正式流程進入戰鬥（diag）", await toBattle("?diag=1", "V"));
    await chrome.evaluate(VIS + "const b=q('[data-testid=\"match-speed-4\"]'); if(b) b.click(); return 1;");
    let v = null, calloutSeen = 0;
    for (let i = 0; i < 120; i++) {
      v = await ev("const d=window.__HERO_VFX_DIAG?window.__HERO_VFX_DIAG():null; return JSON.stringify({d, c:document.querySelectorAll('[data-testid=skill-cast-callout]').length});");
      calloutSeen = Math.max(calloutSeen, v?.c ?? 0);
      if (v?.d?.namedDrawnFrames > 30 && calloutSeen > 0) break;
      await sleep(500);
    }
    ck("V1 具名技能真的施放並被 VFX 畫出（namedDrawnFrames = namedFrames > 0）",
      v?.d?.namedFrames > 0 && v.d.namedDrawnFrames === v.d.namedFrames, JSON.stringify(v?.d));
    ck("V2 施放標籤（「Q · 技能名」）出現在戰場上", calloutSeen > 0, `max ${calloutSeen}`);
    const lbl = await ev("const e=document.querySelector('[data-testid=skill-cast-callout]'); return JSON.stringify(e?e.textContent:null);");
    await shot("desktop-skill-callout");
    ck("V3 標籤文字是「欄位 · 中文技能名」", lbl === null || /^[QWER] · \S/.test(lbl), String(lbl));

    // ── D 桌面 HUD（不開 diag）──────────────────────────────────────────────
    await chrome.navigate(url); await resetSave();
    ck("D0 正式流程進入戰鬥（桌面）", await toBattle("", "D"));
    ck("D1 桌面十人列正常", await wait("document.querySelectorAll('[data-testid=\"observer-hero\"]').length === 10", 20000));
    await sleep(3000);   // 讓出生購買完成（起始裝）
    ck("D2 底欄裝備鈕寫明「裝備詳情」", await wait("(q('[data-items-dock]')||{}).innerText && q('[data-items-dock]').innerText.includes('裝備詳情')", 10000));
    await click("[data-items-dock]");
    ck("D3 點裝備鈕 ⇒ 桌面裝備面板（共用 MobileItemsSheet，desktop 版型）",
      await wait("q('[data-items-sheet-layout=\"desktop\"]')", 8000));
    const pickedDesk = await ev(VIS + "const b=[...document.querySelectorAll('[data-items-sheet-layout=\"desktop\"] [role=list] button')].find(x=>!/空格/.test(x.getAttribute('aria-label')||'')); if(b) b.click(); return JSON.stringify(b?b.getAttribute('aria-label'):null);");
    ck("D4 點已購裝備 ⇒ 看得到名稱與資訊卡", !!pickedDesk && await wait("q('[data-items-sheet-layout=\"desktop\"] [data-item-info]')", 5000), String(pickedDesk));
    ck("D5 資訊卡有屬性或特效摘要", await wait("q('[data-items-sheet-layout=\"desktop\"] [data-item-stat], [data-items-sheet-layout=\"desktop\"] [data-item-effect]')", 3000));
    ck("D6 面板有下一件與金錢", await wait("q('[data-items-sheet-layout=\"desktop\"] [data-next-item]') || [...document.querySelectorAll('[data-items-sheet-layout=\"desktop\"] *')].some(n=>/下一件|還差|合成|六件出裝已完成/.test(n.textContent||''))", 3000)
      && await wait("q('[data-items-sheet-layout=\"desktop\"] [aria-label^=\"可用金錢\"]')", 2000));
    await shot("desktop-items-panel");
    await click("[data-toggle-team-items]");
    ck("D7 面板內可切換十人裝備列", await wait("q('[data-seat-items-expanded]')", 5000));
    const slot = await rectOf("[data-seat-items-expanded] [data-item-slot]");
    if (slot) await chrome.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: slot.x, y: slot.y });
    ck("D8 hover 十人列裝備 ⇒ 資訊卡（名稱＋屬性）", !!slot && await wait("q('[data-testid=\"item-hover-card\"] [data-item-info]')", 4000));
    await shot("desktop-hover-card");
    await chrome.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
    await clickText("完整出裝詳情");
    ck("D9 完整出裝詳情 ⇒ 英雄面板裝備分頁", await wait("q('[data-hero-item-detail=\"embedded\"]')", 6000));
    await ev(VIS + "const x=q('[data-hero-sheet] button[aria-label=\"關閉\"]'); if(x) x.click(); return JSON.stringify(1);");
    ck("D10 關閉面板後仍在戰鬥", await wait(inBattle, 3000));
    // 暫停 → 繼續
    await click('[data-testid="leave-active-match"]');
    ck("D11 暫停並離開 ⇒ 首頁出現「返回進行中的比賽」", await wait("q('[data-testid=\"resume-active-match\"]')", 20000));
    await click('[data-testid="resume-active-match"]');
    ck("D12 返回比賽 ⇒ 回到戰鬥", await wait(inBattle, 60000));
    // 快速完成 → 結果 → 重播
    ck("D13 快速完成按鈕存在", await wait("q('[data-testid=\"quick-finish-match\"]')", 10000));
    //  ⚠ 快速完成會先跳 window.confirm（原生對話框會卡住 CDP evaluate），而且接著在主執行緒同步
    //    跑完整場模擬 ⇒ 先把 confirm 換成直接同意，點擊丟到 setTimeout，evaluate 立刻返回。
    await chrome.evaluate(VIS + "window.confirm=()=>true; const el=q('[data-testid=\"quick-finish-match\"]'); setTimeout(()=>{ if(el) el.click(); },0); return JSON.stringify(!!el);");
    ck("D14 比賽結束 ⇒ 結果頁出現「觀看重播」", await wait("[...document.querySelectorAll('button')].some(b=>(b.innerText||'').includes('觀看重播'))", 300000, 800));
    await shot("desktop-result");
    await clickText("觀看重播");
    ck("D15 重播可開（時間軸＋畫面）", await wait("document.querySelector('[aria-label=\"比賽重播\"] input[aria-label=\"重播時間軸\"]')", 60000));
    const deskErrors = { page: [...chrome.pageErrors], console: chrome.consoleLines.filter((l) => /shader error|VALIDATE_STATUS|WebGL.*error|Uncaught|TypeError|ReferenceError/i.test(JSON.stringify(l))) };

    // ── MV 手機 390×844 diag：技能在手機上一樣真的畫到、標籤出現 ─────────────
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await chrome.navigate(url); await resetSave();
    ck("MV0 正式流程進入戰鬥（390px diag）", await toBattle("?diag=1", "MV"));
    await chrome.evaluate(VIS + "const b=q('[data-testid=\"match-speed-4\"]'); if(b) b.click(); return 1;");
    let mv = null, mvCallout = 0;
    for (let i = 0; i < 120; i++) {
      mv = await ev("const d=window.__HERO_VFX_DIAG?window.__HERO_VFX_DIAG():null; return JSON.stringify({d, c:document.querySelectorAll('[data-testid=skill-cast-callout]').length});");
      mvCallout = Math.max(mvCallout, mv?.c ?? 0);
      if (mv?.d?.namedDrawnFrames > 30 && mvCallout > 0) break;
      await sleep(500);
    }
    ck("MV1 手機：具名技能被 VFX 畫出", mv?.d?.namedFrames > 0 && mv.d.namedDrawnFrames === mv.d.namedFrames, JSON.stringify(mv?.d));
    ck("MV2 手機：施放標籤出現", mvCallout > 0, `max ${mvCallout}`);
    await shot("mobile-skill-callout");

    // ── M 手機 390×844 ────────────────────────────────────────────────────
    await chrome.navigate(url); await resetSave();
    ck("M0 正式流程進入戰鬥（390px）", await toBattle("", "M"));
    await sleep(2500);
    ck("M1 裝備入口寫明「🛒 裝備」", await wait("(q('[data-items-chip]')||{}).innerText && q('[data-items-chip]').innerText.includes('裝備')", 10000));
    ck("M2 第一次進入有輕量提示「點這裡看目前出裝」", await wait("q('[data-testid=\"items-chip-hint\"]')", 5000));
    const chip = await rectOf("[data-items-chip]");
    const face = await rectOf("[data-items-chip] .observer-items-chip-face");
    ck("M3 觸控區 ≥ 44px，外觀是有邊框的膠囊（高 ≥ 16px）", chip?.h >= 44 && face?.h >= 16, JSON.stringify({ chip, face }));
    const overlap = await ev("const f=document.querySelector('[data-items-chip] .observer-items-chip-face'); if(!f) return JSON.stringify(null); const a=f.getBoundingClientRect(); const hits=[...document.querySelectorAll('.observer-ability, .observer-spell, .observer-team-toggle')].filter(b=>{const r=b.getBoundingClientRect(); return r.width>0 && a.left<r.right && a.right>r.left && a.top<r.bottom && a.bottom>r.top;}).map(b=>b.className); return JSON.stringify(hits);");
    ck("M3b 裝備膠囊不壓到技能／召喚師技能／隊伍鈕", Array.isArray(overlap) && overlap.length === 0, JSON.stringify(overlap));
    const dockGap = await ev("const d=document.querySelector('[data-testid=\"observer-dock\"]'); const t=document.querySelector('[data-testid=\"director-toggle\"]'); if(!d||!t) return JSON.stringify(null); return JSON.stringify(d.getBoundingClientRect().top - t.getBoundingClientRect().bottom);");
    ck("M3c 底欄變高後不碰到上方「自動導播」鈕（間距 ≥ 2px）", typeof dockGap === "number" && dockGap >= 2, String(dockGap));
    await shot("mobile-chip-hint");
    const noOverflow = () => ev("return JSON.stringify(document.documentElement.scrollWidth <= window.innerWidth + 1);");
    ck("M4 戰鬥畫面無橫向 overflow", await noOverflow());
    await realClickAt(face.x, face.y);
    ck("M5 點 Gold／裝備入口 ⇒ 裝備面板", await wait("q('[data-items-sheet-layout=\"mobile\"]')", 6000));
    ck("M6 點過之後提示消失且不再出現", await wait("!q('[data-testid=\"items-chip-hint\"]')", 3000)
      && await ev("return JSON.stringify(localStorage.getItem('esmo.ui.itemsChipHintSeen.v1')==='1');"));
    const pickedMob = await ev(VIS + "const b=[...document.querySelectorAll('[data-items-sheet-layout=\"mobile\"] [role=list] button')].find(x=>!/空格/.test(x.getAttribute('aria-label')||'')); if(b) b.click(); return JSON.stringify(b?b.getAttribute('aria-label'):null);");
    ck("M7 點裝備 ⇒ 名稱＋資訊卡", !!pickedMob && await wait("q('[data-items-sheet-layout=\"mobile\"] [data-item-info]')", 4000), String(pickedMob));
    ck("M8 面板無橫向 overflow", await noOverflow());
    await shot("mobile-items-sheet");
    await clickText("完整出裝詳情");
    ck("M9 完整出裝詳情 ⇒ 英雄面板裝備分頁", await wait("q('[data-hero-item-detail=\"embedded\"]')", 6000));
    // ── 頭像不得穿透到「暫停並離開」──
    //  ⚠ cfa755b 實測重現：頭像（y 106–150）上緣與「暫停並離開」（y 76–112）重疊，而且面板繼承
    //    pointer-events:none ⇒ 點 (38,109) 的 elementFromPoint 是那顆按鈕，點下去直接回首頁。
    //    所以同時驗頭像中心與上緣兩個點。
    const avatar = await ev(VIS + "const sec=q('[data-hero-item-detail=\"embedded\"]'); const img=sec&&[...sec.querySelectorAll('img, [role=img], span, div')].find(n=>{const r=n.getBoundingClientRect(); return r.width>=36&&r.width<=52&&Math.abs(r.width-r.height)<3;}); if(!img) return JSON.stringify(null); const r=img.getBoundingClientRect(); return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2,top:r.top});");
    const leave = await rectOf('[data-testid="leave-active-match"]');
    const probe = (x, y) => ev("const el=document.elementFromPoint(" + x + "," + y + "); return JSON.stringify({inSheet:!!(el&&el.closest('[data-hero-sheet]')), leave:!!(el&&el.closest('[data-testid=\"leave-active-match\"]'))});");
    const hit = avatar ? await probe(avatar.x, avatar.y) : null;
    const hitTop = avatar ? await probe(avatar.x, avatar.top + 3) : null;
    ck("M10 英雄頭像（中心＋上緣）的點擊落在面板內，不是下層的「暫停並離開」",
      !!hit?.inSheet && !hit.leave && !!hitTop?.inSheet && !hitTop.leave, JSON.stringify({ avatar, leave, hit, hitTop }));
    if (avatar) { await realClickAt(avatar.x, avatar.top + 3); await sleep(600); await realClickAt(avatar.x, avatar.y); }
    await sleep(1500);
    ck("M11 點頭像後仍在戰鬥、面板仍開著（沒有退回首頁）",
      await ev(VIS + "return JSON.stringify(!!(" + inBattle + ") && !!q('[data-hero-sheet]') && !q('[data-testid=\"resume-active-match\"]'));"));
    await shot("mobile-avatar-tap");
    if (leave) { await realClickAt(leave.x, leave.y); await sleep(1500); }
    ck("M12 面板開著時，點「暫停並離開」的位置也不會退出戰鬥", await ev(VIS + "return JSON.stringify(!!(" + inBattle + ") && !q('[data-testid=\"resume-active-match\"]'));"));
    await ev(VIS + "const x=q('[data-hero-sheet] button[aria-label=\"關閉\"]'); if(x) x.click(); return JSON.stringify(1);");
    //  2× / 4× 畫面不壞、Gold 會隨時間更新
    const goldOf = () => ev("const c=document.querySelector('[data-items-chip]'); return JSON.stringify(c?Number(c.dataset.itemsGold):null);");
    const g0 = await goldOf();
    for (const r of [2, 4]) {
      await click('[data-testid="match-speed-' + r + '"]');
      await sleep(4000);
      ck(`M16 ${r}× 播放：仍在戰鬥、底欄與裝備入口可見、無橫向 overflow`,
        await ev(VIS + "return JSON.stringify(!!(" + inBattle + ") && !!q('[data-testid=\"observer-dock\"]') && !!q('[data-items-chip]') && document.documentElement.scrollWidth <= window.innerWidth + 1);"));
      await shot(`mobile-speed-${r}x`);
    }
    let g1 = g0;
    for (let i = 0; i < 30 && g1 === g0; i++) { await sleep(1000); g1 = await goldOf(); }
    ck("M17 Gold 即時更新（數字會隨比賽變動）", Number.isFinite(g0) && Number.isFinite(g1) && g1 !== g0, `${g0} → ${g1}`);
    await click(".observer-team-toggle");
    ck("M13 隊伍面板可開（十名選手）", await wait("q('.observer-team-sheet') && document.querySelectorAll('.observer-team-sheet [data-testid=\"observer-hero\"]').length === 10", 5000));
    ck("M14 隊伍面板無橫向 overflow", await noOverflow());
    await shot("mobile-team-sheet");
    await clickText("關閉 ✕");
    ck("M15 關閉隊伍面板後仍在戰鬥", await wait(inBattle, 3000));

    // ── E 錯誤 ────────────────────────────────────────────────────────────
    const errs = chrome.consoleLines.filter((l) => /shader error|VALIDATE_STATUS|WebGL.*error|Uncaught|TypeError|ReferenceError/i.test(JSON.stringify(l)));
    ck("E1 page error = 0（桌面＋手機）", chrome.pageErrors.length === 0 && deskErrors.page.length === 0, JSON.stringify(chrome.pageErrors).slice(0, 400));
    ck("E2 console／shader error = 0", errs.length === 0, JSON.stringify(errs).slice(0, 400));
  } });
await finishGate(result);
