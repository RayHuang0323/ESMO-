//  usage: node drive.mjs <worktree> <steps.json>
//  C1 copy of the Sprint 2A driver (port 9473, plus {save:{expr,path}}).
//  steps: {nav}|{click:testid}|{clickText:regex}|{wait:ms}|{js:body}|{dump:true}|{shot:path}|{until:expr,ms}|{vp:[w,h,mobile]}
import fs from "node:fs";
const [W, STEPS] = process.argv.slice(2);
const { launchChrome } = await import("file:///" + W + "/tools/browser/cdp.mjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const steps = JSON.parse(fs.readFileSync(STEPS, "utf8"));
const chrome = await launchChrome({ url: "about:blank", port: 9473, headless: true });
const NL = "String.fromCharCode(10)";
const dump = async (tag) => console.log(tag, await chrome.evaluate(
  "const t=document.body.innerText.split(" + NL + ").filter(Boolean).join(' | ').slice(0,1200);" +
  "const ids=[...new Set([...document.querySelectorAll('[data-testid]')].map(e=>e.dataset.testid))].slice(0,70);" +
  "const bs=[...document.querySelectorAll('button')].filter(b=>!b.disabled).map(b=>(b.innerText||'').trim().split(" + NL + ").join(' ')).filter(Boolean).slice(0,30);" +
  "return JSON.stringify({text:t,testids:ids,buttons:bs});"));
const guard = "window.confirm=()=>true; window.alert=()=>{}; return 1;";
try {
  await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const s of steps) {
    if (s.vp) { await chrome.send("Emulation.setDeviceMetricsOverride", { width: s.vp[0], height: s.vp[1], deviceScaleFactor: s.vp[2] ? 2 : 1, mobile: !!s.vp[2] }); await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: !!s.vp[2], maxTouchPoints: s.vp[2] ? 5 : 1 }); }
    if (s.nav) { await chrome.navigate(s.nav); await sleep(3500); await chrome.evaluate(guard); }
    if (s.click) console.log("click", s.click, await chrome.evaluate("const e=document.querySelector('[data-testid=\"" + s.click + "\"]'); if(!e) return 'missing'; e.click(); return 'ok';"));
    if (s.clickText) console.log("clickText", s.clickText, await chrome.evaluate("const re=new RegExp(" + JSON.stringify(s.clickText) + "); const e=[...document.querySelectorAll('button,[role=button],a')].find(b=>re.test((b.innerText||'').trim())&&!b.disabled); if(!e) return 'missing'; e.click(); return 'ok:'+(e.innerText||'').trim().slice(0,40);"));
    if (s.tap || s.tapText) {
      const sel = s.tap ? "document.querySelector('[data-testid=\"" + s.tap + "\"]')" : "[...document.querySelectorAll('button,[role=button],a')].find(b=>new RegExp(" + JSON.stringify(s.tapText) + ").test((b.innerText||'').trim())&&!b.disabled)";
      const r = JSON.parse(String(await chrome.evaluate("const e=" + sel + "; if(!e) return JSON.stringify(null); e.scrollIntoView({block:'center'}); const b=e.getBoundingClientRect(); return JSON.stringify({x:b.x+b.width/2,y:b.y+b.height/2});")).replace(/^"|"$/g, "").replace(/\\"/g, '"'));
      if (!r) console.log("tap", s.tap ?? s.tapText, "missing");
      else { for (const type of ["mousePressed", "mouseReleased"]) await chrome.send("Input.dispatchMouseEvent", { type, x: r.x, y: r.y, button: "left", clickCount: 1 }); console.log("tap", s.tap ?? s.tapText, "ok", Math.round(r.x), Math.round(r.y)); }
    }
    if (s.wait) await sleep(s.wait);
    if (s.until) { const t = Date.now(); let ok = false; while (Date.now() - t < (s.ms ?? 60000)) { if (String(await chrome.evaluate("return JSON.stringify(!!(" + s.until + "));")) === "true") { ok = true; break; } await sleep(1000); } console.log("until", s.until.slice(0, 60), ok, ((Date.now() - t) / 1000).toFixed(1) + "s"); }
    if (s.js) console.log("js", await chrome.evaluate(s.js));
    if (s.save) { const v = await chrome.evaluate(s.save.expr); fs.writeFileSync(s.save.path, typeof v === "string" ? v : JSON.stringify(v)); console.log("save", s.save.path, String(v).length); }
    if (s.dump) await dump("DUMP");
    if (s.shot) { const r = await chrome.send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(s.shot, Buffer.from(r.data, "base64")); console.log("shot", s.shot); }
  }
} finally { await chrome.close?.(); }
