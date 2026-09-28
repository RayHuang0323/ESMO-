#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_moba_mobile_hud.mjs — MOBA Mobile & Presentation Polish（瀏覽器）
//
//  執行：node tools/browser_check_moba_mobile_hud.mjs
//  走 ?debug=moba-runtime-battle（正式 GameView／引擎／HUD，跳過賽前流程），本地 dev server。
//    L  320／360／390／430：5v5 戰況列 10 格、在記分板下方、不壓控制鈕、無橫向溢出、小地圖 92px
//    T  390 真觸控（CDP Input.dispatchTouchEvent）：
//         滑過小地圖 ⇒ 鏡頭不動；長按 ⇒ 鏡頭不動；點一下 ⇒ 鏡頭移到點擊處
//    H  點戰況列頭像 ⇒ 跟隨該英雄、底欄換成那位英雄；點中央 ⇒ 手機記分板 10 列，可關閉
//    D  桌機 1366：沒有戰況列、十人側欄還在、小地圖 180px、滑鼠拖曳小地圖仍會移動鏡頭
//    E  page error 0
//  ⚠ 鏡頭狀態用 dev server 的同一個模組讀（import('/src/battle/cameraStore.js')），只讀不寫
//    （唯一的寫入是測試前把鏡頭切到 free，避免自動導播自己移動而假綠／假紅）。
//  ⚠ chrome.evaluate 的字串裡不能有反引號。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const OUT = process.env.ESMO_REVIEW_OUT ?? "review/moba-mobile-hud/gate";
mkdirSync(OUT, { recursive: true });
const WIDTHS = [[320, 640], [360, 740], [390, 844], [430, 932]];

const result = await runGate({
  name: "MOBA 手機 HUD／小地圖觸控",
  timeoutMs: 1200000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
    const shot = async (name) => { const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    const HIDE = "const up=(el)=>{let n=el,i=0;while(n&&i<8){const p=getComputedStyle(n).position;if((p==='absolute'||p==='fixed')&&n!==document.body)return n;n=n.parentElement;i++;}const t=el.closest('table');return t?t.parentElement:null;};"
      + "[...document.querySelectorAll('strong')].filter(s=>(s.textContent||'').startsWith('Android WebGL')).forEach(s=>{const b=up(s);if(b)b.style.display='none';});"
      + "[...document.querySelectorAll('th')].filter(t=>(t.textContent||'')==='避碰修正').forEach(t=>{const b=up(t);if(b)b.style.display='none';});return JSON.stringify(1);";
    const mobile = async (w, h) => {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    };
    //  dev server 有 base path（/ESMO-/）⇒ 模組網址要帶上它，才會拿到 App 用的同一個 store 實例。
    const CAM_URL = new URL("src/battle/cameraStore.js", url.endsWith("/") ? url : url + "/").pathname;
    const cam = () => ev("return import('" + CAM_URL + "').then(m=>{const s=m.useCameraStore.getState();return JSON.stringify({x:s.pan.x,y:s.pan.y,mode:s.mode,hero:s.heroId});});");
    const toFree = () => ev("return import('" + CAM_URL + "').then(m=>{const s=m.useCameraStore.getState();s.userPanTo(s.pan.x,s.pan.y);return JSON.stringify(1);});");
    const rect = (sel) => ev("const el=document.querySelector(" + JSON.stringify(sel) + "); if(!el) return JSON.stringify(null); const r=el.getBoundingClientRect(); return JSON.stringify({l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height});");
    const touch = async (type, x, y) => chrome.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });

    await mobile(390, 844);
    await chrome.navigate(`${url}?debug=moba-runtime-battle&shot=hud&waitTs=180&quality=low`);
    let ready = false;
    for (let i = 0; i < 300 && !ready; i++) { await sleep(1500); ready = String(await chrome.evaluate("return JSON.stringify(window.__BATTLE_SHOT_READY || null);")).includes("hud"); }
    ck("戰鬥開始並推進到 ts ≥ 180", ready);
    if (!ready) return;

    // ── L 版面 ──────────────────────────────────────────────────────────
    for (const [w, h] of WIDTHS) {
      await mobile(w, h); await sleep(900); await chrome.evaluate(HIDE);
      const L = await ev("const q=(s)=>document.querySelector(s); const R=(e)=>e?e.getBoundingClientRect():null;"
        + "const strip=R(q('[data-testid=\"mobile-team-strip\"]')), hud=R(q('[data-testid=\"battle-hud\"]')), mmEl=q('[data-testid=\"battle-minimap\"]'), mm=R(mmEl), leave=R(q('[data-testid=\"leave-active-match\"]')), dock=R(q('[data-testid=\"observer-dock\"]'));"
        + "const cells=[...document.querySelectorAll('[data-testid=\"team-strip-hero\"]')].map(b=>b.getBoundingClientRect());"
        + "const tl=[...document.querySelectorAll('div')].find(d=>(d.innerText||'').startsWith('戰報'));"
        + "return JSON.stringify({strip:strip&&{t:strip.top,b:strip.bottom,l:strip.left,r:strip.right}, hudB:hud&&hud.bottom, leaveT:leave&&leave.top, cells:cells.length, minCell:Math.min(...cells.map(c=>c.width)), cellsIn:cells.every(c=>c.left>=0&&c.right<=innerWidth), mm:mm&&{w:mmEl.clientWidth,outer:mm.width,t:mm.top,b:mm.bottom,l:mm.left}, dockT:dock&&dock.top, over:document.documentElement.scrollWidth-innerWidth, gold:q('[data-testid=\"team-strip-gold-diff\"]')?.dataset.goldDiff, obj:q('[data-testid=\"team-strip-objectives\"]')?.dataset.towers});");
      ck(`L1[${w}] 5v5 戰況列 10 格、全在畫面內`, L?.strip && L.cells === 10 && L.cellsIn, JSON.stringify({ cells: L?.cells, minCell: L?.minCell }));
      ck(`L2[${w}] 戰況列在記分板下方、不壓「暫停並離開」`, L?.strip && L.strip.t >= L.hudB - 0.5 && L.strip.b <= L.leaveT + 0.5, `hud ${L?.hudB} strip ${L?.strip?.t}–${L?.strip?.b} leave ${L?.leaveT}`);
      ck(`L3[${w}] 頭像寬 ≥ 18px（辨識下限）`, L?.minCell >= 18, String(L?.minCell));
      ck(`L4[${w}] 經濟差與拆塔數有值（讀快照）`, L?.gold !== undefined && L.gold !== "" && /^\d+:\d+$/.test(L?.obj ?? ""), `${L?.gold} ${L?.obj}`);
      ck(`L5[${w}] 小地圖內容 92px（含邊框 96，原 110）、在底欄上方`, L?.mm && Math.abs(L.mm.w - 92) < 1.5 && L.mm.b <= L.dockT + 0.5, JSON.stringify(L?.mm) + ` dock ${L?.dockT}`);
      ck(`L6[${w}] 無橫向溢出`, L?.over <= 0, String(L?.over));
      await shot(`m${w}`);
    }

    // ── T 小地圖真觸控（390）──────────────────────────────────────────────
    await mobile(390, 844); await sleep(800); await chrome.evaluate(HIDE);
    await toFree(); await sleep(300);
    const mm = await rect('[data-testid="battle-minimap"]');
    const c0 = await cam();
    ck("T0 鏡頭已切到 free（自動導播不會自己移動）", c0?.mode === "free", JSON.stringify(c0));
    //  滑過：從小地圖左上滑到右下（位移 > SLOP）
    await touch("touchStart", mm.l + 12, mm.t + 12);
    for (let i = 1; i <= 6; i++) { await touch("touchMove", mm.l + 12 + i * 10, mm.t + 12 + i * 10); await sleep(16); }
    await touch("touchEnd"); await sleep(400);
    const c1 = await cam();
    ck("T1 手指滑過小地圖 ⇒ 鏡頭不動", c1 && Math.abs(c1.x - c0.x) < 0.01 && Math.abs(c1.y - c0.y) < 0.01, `${JSON.stringify(c0)} → ${JSON.stringify(c1)}`);
    //  從戰場拖進小地圖再放開（常見誤觸：起手不在小地圖上）
    await touch("touchStart", mm.l - 60, mm.t - 60);
    for (let i = 1; i <= 6; i++) { await touch("touchMove", mm.l - 60 + i * 14, mm.t - 60 + i * 14); await sleep(16); }
    await touch("touchEnd"); await sleep(400);
    const c1b = await cam(); await toFree();
    const dx = Math.hypot(c1b.x - c1.x, c1b.y - c1.y);
    //  起手在戰場 ⇒ 是 3D 拖曳平移（既有行為），不能被小地圖接手變成「跳到小地圖座標」
    const target = { x: (mm.l + 30 + 14 * 0), y: 0 };
    void target;
    ck("T2 從戰場拖進小地圖 ⇒ 仍是一般拖曳平移，不會跳到小地圖座標", dx < 40, `平移 ${dx.toFixed(2)}`);
    const c2 = await cam();
    //  長按：按住 700ms 不動
    await touch("touchStart", mm.l + mm.w * 0.8, mm.t + mm.h * 0.2); await sleep(700); await touch("touchEnd"); await sleep(400);
    const c3 = await cam();
    ck("T3 長按小地圖 ⇒ 鏡頭不動", c3 && Math.abs(c3.x - c2.x) < 0.01 && Math.abs(c3.y - c2.y) < 0.01, `${JSON.stringify(c2)} → ${JSON.stringify(c3)}`);
    //  點一下：右上角（紅方基地方向）
    await touch("touchStart", mm.l + mm.w * 0.8, mm.t + mm.h * 0.2); await sleep(90); await touch("touchEnd"); await sleep(500);
    const c4 = await cam();
    ck("T4 點一下小地圖 ⇒ 鏡頭移到點擊處（右上＝x 變大、y 變小）", c4 && c4.x > c3.x + 5 && c4.y < c3.y - 5 && c4.mode === "free", `${JSON.stringify(c3)} → ${JSON.stringify(c4)}`);
    await shot("t-minimap-tap");

    // ── H 戰況列互動 ──────────────────────────────────────────────────────
    const seat = await ev("const b=[...document.querySelectorAll('[data-testid=\"team-strip-hero\"]')].find(x=>x.dataset.seat==='r3'); if(!b) return JSON.stringify(null); const r=b.getBoundingClientRect(); return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});");
    if (seat) { await touch("touchStart", seat.x, seat.y); await sleep(60); await touch("touchEnd"); await sleep(700); }
    const h1 = await cam();
    const pressed = await ev("return JSON.stringify(document.querySelector('[data-testid=\"team-strip-hero\"][data-seat=\"r3\"]')?.getAttribute('aria-pressed'));");
    ck("H1 點戰況列頭像 ⇒ 跟隨該英雄（camera heroId＝r3、頭像標為選取）", h1?.hero === "r3" && pressed === "true", `${JSON.stringify(h1)} pressed=${pressed}`);
    const center = await rect('[data-testid="team-strip-center"]');
    await touch("touchStart", center.l + center.w / 2, center.t + center.h / 2); await sleep(60); await touch("touchEnd"); await sleep(700);
    const board = await ev("const rows=[...document.querySelectorAll('[data-testid=\"mobile-board-row\"]')]; const b=document.querySelector('[data-testid=\"mobile-scoreboard\"]')?.getBoundingClientRect(); return JSON.stringify({rows:rows.length, kda:rows.every(r=>/\\d+\\/\\d+\\/\\d+/.test(r.innerText||'')), inView:b?b.left>=0&&b.right<=innerWidth:false});");
    ck("H2 點中央 ⇒ 手機記分板 10 列（含 K/D/A），不溢出", board?.rows === 10 && board.kda && board.inView, JSON.stringify(board));
    await shot("h-board");
    await chrome.evaluate("document.querySelector('[data-testid=\"mobile-board-close\"]')?.click(); return JSON.stringify(1);"); await sleep(400);
    ck("H3 記分板可關閉", !(await rect('[data-testid="mobile-scoreboard"]')));

    // ── D 桌機 ──────────────────────────────────────────────────────────
    await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(1000); await chrome.evaluate(HIDE);
    const D = await ev("return JSON.stringify({strip:!!document.querySelector('[data-testid=\"mobile-team-strip\"]'), rails:document.querySelectorAll('[data-testid=\"observer-hero\"]').length, mm:document.querySelector('[data-testid=\"battle-minimap\"]')?.clientWidth});");
    ck("D1 桌機沒有 5v5 戰況列、十人側欄仍在", D && !D.strip && D.rails === 10, JSON.stringify(D));
    ck("D2 桌機小地圖維持 180px", D && Math.abs(D.mm - 180) < 1.5, String(D?.mm));
    await toFree(); await sleep(200);
    const dm = await rect('[data-testid="battle-minimap"]');
    const d0 = await cam();
    const mouse = (type, x, y, buttons) => chrome.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons, clickCount: 1 });
    await mouse("mouseMoved", dm.l + 20, dm.t + dm.h - 20, 0);
    await mouse("mousePressed", dm.l + 20, dm.t + dm.h - 20, 1);
    const d1 = await cam();
    for (let i = 1; i <= 5; i++) { await mouse("mouseMoved", dm.l + 20 + i * 25, dm.t + dm.h - 20 - i * 25, 1); await sleep(20); }
    await mouse("mouseReleased", dm.l + 145, dm.t + dm.h - 145, 0); await sleep(300);
    const d2 = await cam();
    ck("D3 桌機滑鼠：按下即移動、拖曳連續移動（既有行為不變）",
      d1 && d2 && Math.hypot(d1.x - d0.x, d1.y - d0.y) > 5 && d2.x > d1.x + 5 && d2.y < d1.y - 5, `${JSON.stringify(d0)} → ${JSON.stringify(d1)} → ${JSON.stringify(d2)}`);
    await shot("desktop1366");

    const errs = chrome.pageErrors ?? [];
    ck("E1 page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
  },
});
finishGate(result);
