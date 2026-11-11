// ============================================================================
//  tools/owner_preview/lib_battle_flow.mjs — 量測工具共用：走正式流程進 MOBA 對戰（2026-11-11）
//  與 perf_gl_frames_v21.mjs 的 toBattle 相同（那支保留原樣，避免改動已歸檔證據的產生方式）。
//  ⚠ chrome.evaluate 的字串裡不能有反引號。
// ============================================================================
const QUALITY = ["low", "medium", "high"].includes(process.env.ESMO_QUALITY) ? process.env.ESMO_QUALITY : "high";
export const VIS = "const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}; const q=(s)=>[...document.querySelectorAll(s)].find(vis);";

export function flowOf({ chrome, url, sleep }) {
  const ev = async (body) => { const r = String(await chrome.evaluate(body)); try { return JSON.parse(r); } catch { try { return JSON.parse(r.replace(/^"|"$/g, "")); } catch { return r; } } };
  const wait = async (expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(VIS + "return JSON.stringify(!!(" + expr + "));")) return true; } catch { /* 換頁中 */ } await sleep(400); } return false; };
  const click = (sel) => chrome.evaluate(VIS + "const el=q(" + JSON.stringify(sel) + "); if(el) el.click(); return JSON.stringify(!!el);");
  const clickText = (t) => chrome.evaluate(VIS + "const el=[...document.querySelectorAll('button')].filter(vis).find(b=>(b.innerText||'').includes(" + JSON.stringify(t) + ")); if(el) el.click(); return JSON.stringify(!!el);");
  const inBattle = "document.querySelector('[data-testid=\"battle-hud\"]') && document.querySelector('canvas')";
  async function toBattle() {
    await chrome.navigate(url);
    //  畫質固定（預設 high）：自動判斷會看視窗寬度，headed 視窗下不穩定 ⇒ A/B 一定要釘住。
    await chrome.evaluate("try{localStorage.clear();sessionStorage.clear();localStorage.setItem('esmo.quality.v1','" + QUALITY + "');}catch(e){} return 1;");
    await chrome.navigate(url);
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
      if (await ev(VIS + "return JSON.stringify(!!(" + inBattle + "));")) return true;
      await chrome.evaluate(VIS + "const s=[...document.querySelectorAll('button')].filter(vis).find(b=>/開始比賽|進入戰鬥|開始戰鬥/.test(b.innerText||'')); if(s&&!s.disabled) s.click(); return 1;");
      await sleep(700);
    }
    return false;
  }
  return { ev, wait, click, clickText, toBattle };
}
