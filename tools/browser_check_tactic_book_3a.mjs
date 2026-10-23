#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_tactic_book_3a.mjs — 戰術書畫面（Phase 3a T13，瀏覽器；桌機 1366＋手機 390）
//
//  執行：node tools/browser_check_tactic_book_3a.mjs（本地 dev server；一次只跑這一支）
//  正式 TacticScreen 動態掛載（與 App 同一份 React／store 模組），不開戰鬥。
//    O  畫面上的選項＝tacticBookView（Registry live、扣掉量測排除與複驗撤下）；design／被排除的選項不在 DOM；O2b v20 只依 v20 證據（跨版本隔離）
//    C  點選項 ⇒ 被選中；送出的 binding＝Node 以同一份選擇算出來的 binding（逐字元）
//    I  指標：輪廓六軸、五個席位、配合度負擔與 view-model 同值；互相打架的選擇 ⇒ 出現提示
//    S  存成我的戰術書 ⇒ 清單出現、磁碟上有；換模板後點它 ⇒ 模板與選擇都回來；刪除 ⇒ 消失
//    L  390 與 1366 都沒有橫向溢出；專業模式按鈕停用；經典模板保留 data-tactic-card
//    E  page error 0、console error 0
//  ⚠ 不在這裡驗「從戰術書開打的整場比賽」：binding 進組裝器＝v20 golden 由 tools/check_tactic_save_3a.mjs（Node）驗。
//  ⚠ chrome.evaluate 的字串裡不能有反引號。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";
import { tacticBookView } from "../src/screens/moba/tacticBook/tacticBookOptions.js";
import { CAPABILITY_ROWS } from "../src/platform/tactics/capabilityRegistry.js";

const OUT = process.env.ESMO_REVIEW_OUT ?? "review/tactic-book-3a/gate";
mkdirSync(OUT, { recursive: true });
const J = JSON.stringify;
const expectedIds = (view) => view.dimensions.flatMap((d) => [...(d.templateCustom ? [`tb-choice-${d.dimension}-_template`] : []), ...d.choices.map((c) => `tb-choice-${d.dimension}-${c.id}`)]).sort();

const result = await runGate({
  name: "Tactic Book 3a（戰術書畫面）",
  timeoutMs: 600000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
    const shot = async (name) => { const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    const BASE = new URL(".", url.endsWith("/") ? url : url + "/").pathname;
    const click = (sel) => ev("const el=document.querySelector('#tb-host '+" + J(sel) + "); if(!el) return JSON.stringify(false); el.click(); return JSON.stringify(true);");
    const tid = (id) => '[data-testid="' + id + '"]';
    const has = (id) => ev("return JSON.stringify(!!document.querySelector('#tb-host '+" + J(tid(id)) + "));");
    const choiceIds = () => ev("return JSON.stringify([...document.querySelectorAll('#tb-host button[data-testid^=\"tb-choice-\"]')].map(e=>e.getAttribute('data-testid')).sort());");
    const selectedIds = () => ev("return JSON.stringify([...document.querySelectorAll('#tb-host button[data-testid^=\"tb-choice-\"][data-selected=\"1\"]')].map(e=>e.getAttribute('data-testid')).sort());");
    const overflow = () => ev("const h=document.getElementById('tb-host'); return JSON.stringify(h?h.scrollWidth-h.clientWidth:null);");
    const mobile = async () => {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    };
    const desktop = async () => {
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await chrome.send("Emulation.clearDeviceMetricsOverride", {});
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    };

    await desktop();
    await chrome.navigate(url);
    await sleep(4000);
    const mount = await ev("const B=" + J(BASE) + "; return (async()=>{ const ts=await (await fetch(B+'src/screens/moba/TacticScreen.jsx')).text(); const mn=await (await fetch(B+'src/main.jsx')).text();"
      + "const ru=(ts.match(/from\\s+\"([^\"]*\\/deps\\/react\\.js[^\"]*)\"/)||[])[1]; const du=(mn.match(/from\\s+\"([^\"]*\\/deps\\/react-dom_client\\.js[^\"]*)\"/)||[])[1];"
      + "if(!ru||!du) return JSON.stringify({ok:false,ru,du}); const R=await import(ru); const D=await import(du); const T=await import(B+'src/screens/moba/TacticScreen.jsx');"
      + "const React=R.default||R; const createRoot=(D.default||D).createRoot; const host=document.createElement('div'); host.id='tb-host'; host.style.cssText='position:fixed;inset:0;z-index:2147483000;background:#0b0f14;overflow:auto';"
      + "document.body.appendChild(host); window.__TB_NEXT=null; createRoot(host).render(React.createElement(T.default,{onNext:(t,s,talents,binding)=>{window.__TB_NEXT={tacticId:t&&t.tacticId,binding:binding||null};},onBack:()=>{}})); return JSON.stringify({ok:true}); })();");
    ck("M0 正式 TacticScreen 掛載成功", mount?.ok, J(mount));
    if (!mount?.ok) return;
    await sleep(1200);
    const pick = async (templateId) => { const ok = await click(tid("tb-template-" + templateId)); await sleep(500); return ok; };
    const next = async () => { await ev("window.__TB_NEXT=null; const b=[...document.querySelectorAll('#tb-host button')].find(x=>(x.textContent||'').includes('開始載入')); if(b) b.click(); return JSON.stringify(!!b);"); await sleep(300); return ev("return JSON.stringify(window.__TB_NEXT);"); };

    // ── O 選項＝view-model ─────────────────────────────────────────────
    for (const templateId of ["classic.m1", "std", "classic.m7", "v2.jungle_invasion", "classic.m8"]) {
      const picked = await pick(templateId);
      const want = expectedIds(tacticBookView({ templateId }));
      const got = await choiceIds();
      ck(`O1 ${templateId}：畫面上的選項按鈕＝view-model（${want.length} 顆）`, picked && J(got) === J(want), `got ${got?.length} want ${want.length}`);
    }
    const designDims = CAPABILITY_ROWS.filter((r) => r.status === "design").map((r) => r.dimension);
    await pick("std");
    const domDims = await ev("return JSON.stringify([...document.querySelectorAll('#tb-host [data-testid^=\"tb-dim-\"]')].map(e=>e.getAttribute('data-testid').slice(7)));");
    const viewDims = tacticBookView({ templateId: "std" }).dimensions.map((d) => d.dimension).sort();
    //  時期姿態自 C3-2（2026-10-21）起是 live，不再列在「不得出現」；改由 O2b 釘住 v20（static）只依 v20 證據提供的選擇。
    ck("O2 std 的 DOM 維度集合恰好等於 tacticBookView 的 dimensions 集合；design 維度與只剩一個選項的維度（打野節奏、集結、巨龍／巴龍重心，以及複驗撤下後只剩一個選項的上路／下路姿態、上路資源、風險）不在 DOM", Array.isArray(domDims) && domDims.length > 0 && J([...domDims].sort()) === J(viewDims) && !domDims.some((d) => designDims.includes(d)) && !["jungle.tempo", "teamfight.grouping", "objectives.dragon", "objectives.baron", "lanes.top.stance", "lanes.bot.stance", "seats.b1.priority", "risk.tolerance"].some((d) => domDims.includes(d)), J(domDims));
    //  跨版本證據隔離（Owner 2026-10-23 第 4 點）：戰術書（Director static＝v20）的中期姿態沒有 aggressive（v20 證據沒過）與 scaling（owner_hold）；前期 aggressive 有（v20 證據通過），證明這個維度真的有畫出來。
    ck("O2b 戰術書（static／v20）：中期姿態沒有 aggressive、scaling；前期姿態有 aggressive、沒有 scaling", (await has("tb-choice-phases.early.stance-aggressive")) && !(await has("tb-choice-phases.early.stance-scaling")) && (await has("tb-choice-phases.mid.stance-defensive")) && !(await has("tb-choice-phases.mid.stance-aggressive")) && !(await has("tb-choice-phases.mid.stance-scaling")));
    ck("O3 量測排除與複驗撤下的選擇不在 DOM（中路進攻、上路防守、風險大膽；上路帶線、下路進攻、上路資源核心、風險謹慎）", !(await has("tb-choice-lanes.mid.stance-aggressive")) && !(await has("tb-choice-lanes.top.stance-defensive")) && !(await has("tb-choice-risk.tolerance-bold")) && !(await has("tb-choice-lanes.top.stance-split")) && !(await has("tb-choice-lanes.bot.stance-aggressive")) && !(await has("tb-choice-seats.b1.priority-core")) && !(await has("tb-choice-risk.tolerance-cautious")));
    const cards = await ev("return JSON.stringify([...document.querySelectorAll('#tb-host [data-tactic-card]')].map(e=>e.getAttribute('data-tactic-card')).sort());");
    ck("O4 經典八套保留 data-tactic-card（既有 gate 的選擇器）", J(cards) === J(["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"]), J(cards));
    const pro = await ev("const b=document.querySelector('#tb-host [data-testid=\"tb-pro-mode\"]'); return JSON.stringify(b?{disabled:b.disabled,text:b.textContent}:null);");
    ck("O5 專業模式按鈕顯示但停用，標「3b 開放」", pro?.disabled === true && /3b 開放/.test(pro.text ?? ""), J(pro));

    // ── C 點選 ⇒ binding ───────────────────────────────────────────────
    const plain = await next();
    const wantPlain = tacticBookView({ templateId: "std" }).binding;
    ck("C1 std、沒有調整：送出的 binding＝Node 算的（逐字元），tactic 物件的 id 是 std", plain?.tacticId === "std" && J(plain.binding) === J(wantPlain), `${plain?.binding?.planHash} vs ${wantPlain.planHash}`);
    await click(tid("tb-choice-jungle.focus-invade")); await sleep(400);
    await click(tid("tb-choice-seats.b5.mission-roam")); await sleep(400);
    const sel = await selectedIds();
    ck("C2 點「打野重心＝入侵」「輔助任務＝遊走」⇒ 兩顆都顯示被選中、原本的預設不再選中", sel?.includes("tb-choice-jungle.focus-invade") && sel.includes("tb-choice-seats.b5.mission-roam") && !sel.includes("tb-choice-jungle.focus-gank"), J(sel));
    const chosen = { jungle: { focus: "invade" }, seats: { b5: { mission: "roam" } } };
    const wantChosen = tacticBookView({ templateId: "std", choices: chosen });
    const sent = await next();
    ck("C3 送出的 binding＝Node 以同一份選擇算出來的 binding（逐字元；planHash 相同）", J(sent?.binding) === J(wantChosen.binding) && sent.binding.planHash !== wantPlain.planHash, `${sent?.binding?.planHash} vs ${wantChosen.binding.planHash}`);
    ck("C4 「還原模板」出現並顯示改了 2 項", /2/.test(String(await ev("const b=document.querySelector('#tb-host [data-testid=\"tb-reset\"]'); return JSON.stringify(b?b.textContent:null);"))));

    // ── I 指標 ─────────────────────────────────────────────────────────
    const dom = await ev("const q=(s)=>document.querySelector('#tb-host '+s); const p=[...document.querySelectorAll('#tb-host [data-testid=\"tb-profile\"] [data-axis]')].map(e=>[e.getAttribute('data-axis'),Number(e.getAttribute('data-value'))]);"
      + "const seats=[...document.querySelectorAll('#tb-host [data-testid^=\"tb-seat-\"]')].map(e=>[e.getAttribute('data-testid').slice(8),e.getAttribute('data-mission')]); const l=q('[data-testid=\"tb-load\"]');"
      + "return JSON.stringify({p,seats,load:l?Number(l.getAttribute('data-load')):null,radar:!!q('[data-testid=\"tb-profile-radar\"]')});");
    ck("I1 計畫輪廓：雷達圖存在，六軸數值＝view-model", dom?.radar && J(dom.p) === J(wantChosen.profile.map((p) => [p.axis, p.value])), J(dom?.p));
    ck("I2 五個席位的任務＝view-model（打野入侵、輔助遊走）", J(dom?.seats) === J(wantChosen.seats.map((s) => [s.seat, s.mission])) && dom.seats.some(([s, m]) => s === "b2" && m === "invade") && dom.seats.some(([s, m]) => s === "b5" && m === "roam"), J(dom?.seats));
    ck("I3 配合度負擔＝view-model 的 load（與選手無關的那一半）", dom?.load === wantChosen.load.load && dom.load > 0, `${dom?.load} vs ${wantChosen.load.load}`);
    ck("I4 目前沒有互相打架的選擇 ⇒ 沒有提示", !(await has("tb-contradictions")));
    await click(tid("tb-choice-teamfight.posture-passive")); await sleep(500);
    const warn = await ev("const e=document.querySelector('#tb-host [data-testid=\"tb-contradiction-invade_vs_passive_fights\"]'); return JSON.stringify(e?e.textContent:null);");
    ck("I5 再點「團戰姿態＝保守」（與打野入侵打架）⇒ 出現提示，文案來自規則表", typeof warn === "string" && warn.includes(tacticBookView({ templateId: "std", choices: { ...chosen, teamfight: { posture: "passive" } } }).contradictions[0].text), String(warn).slice(0, 60));
    ck("L1[d] 1366 沒有橫向溢出", (await overflow()) <= 0, String(await overflow()));
    await ev("const e=document.querySelector('#tb-host [data-testid=\"tb-choice-panel\"]'); if(e) e.scrollIntoView({block:'start'}); return JSON.stringify(1);"); await sleep(300);
    await shot("d1366_tactic_book");

    // ── S 我的戰術書 ───────────────────────────────────────────────────
    const full = { ...chosen, teamfight: { posture: "passive" } };
    const hash = tacticBookView({ templateId: "std", choices: full }).binding.planHash;
    await click(tid("tb-save")); await sleep(600);
    const afterSave = await ev("const B=" + J(BASE) + "; return import(B+'src/platform/profileStore.js').then(m=>{const st=m.useProfileStore.getState(); const note=document.querySelector('#tb-host [data-testid=\"tb-save-note\"]'); const raw=localStorage.getItem('esmo.profile.v1')||'';"
      + "return JSON.stringify({plans:(st.tacticBook&&st.tacticBook.plans||[]).map(p=>p.id),ok:note?note.getAttribute('data-ok'):null,onDisk:raw.includes(" + J(hash) + ")});});");
    ck("S1 存起來 ⇒ store 有這一份（id＝planHash）、提示成功、磁碟上也有", afterSave?.plans?.includes(hash) && afterSave.ok === "1" && afterSave.onDisk === true, J(afterSave));
    ck("S2 清單出現這一份", await has("tb-book-" + hash));
    await pick("classic.m3");
    ck("S3 換到別的模板 ⇒ 選擇清空（入侵不再被選中）", !((await selectedIds()) ?? []).includes("tb-choice-jungle.focus-invade"));
    await click(tid("tb-book-" + hash)); await sleep(600);
    const back = await selectedIds();
    const tplSel = await ev("const e=document.querySelector('#tb-host [data-testid=\"tb-template-std\"]'); return JSON.stringify(e?e.getAttribute('aria-pressed'):null);");
    ck("S4 點戰術書裡的那一份 ⇒ 模板與三個選擇都回來", tplSel === "true" && ["tb-choice-jungle.focus-invade", "tb-choice-seats.b5.mission-roam", "tb-choice-teamfight.posture-passive"].every((x) => back?.includes(x)), J(back));
    const reSent = await next();
    ck("S5 從戰術書載入後送出的 binding 的 planHash＝存的那一份", reSent?.binding?.planHash === hash, String(reSent?.binding?.planHash));

    // ── L 手機 390 ─────────────────────────────────────────────────────
    await mobile(); await sleep(1200);
    ck("L2[m] 390 沒有橫向溢出（模板列、選項、指標、戰術書）", (await overflow()) <= 0, String(await overflow()));
    const small = await ev("return JSON.stringify([...document.querySelectorAll('#tb-host button[data-testid^=\"tb-choice-\"]')].filter(e=>{const r=e.getBoundingClientRect(); return r.height<32||r.width<40;}).length);");
    ck("L3[m] 選項按鈕的觸控大小足夠（高 ≥ 32、寬 ≥ 40）", small === 0, String(small));
    await ev("const e=document.querySelector('#tb-host [data-testid=\"tb-choice-panel\"]'); if(e) e.scrollIntoView({block:'start'}); return JSON.stringify(1);"); await sleep(300);
    await shot("m390_tactic_book_choices");
    await ev("const e=document.querySelector('#tb-host [data-testid=\"tb-indicator-panel\"]'); if(e) e.scrollIntoView({block:'start'}); return JSON.stringify(1);"); await sleep(300);
    await shot("m390_tactic_book_indicators");
    await click(tid("tb-book-delete-" + hash)); await sleep(600);
    const afterDel = await ev("const B=" + J(BASE) + "; return import(B+'src/platform/profileStore.js').then(m=>JSON.stringify({n:(m.useProfileStore.getState().tacticBook.plans||[]).length,onDisk:(localStorage.getItem('esmo.profile.v1')||'').includes(" + J(hash) + ")}));");
    ck("S6 刪除 ⇒ 清單、store、磁碟都沒有了", !(await has("tb-book-" + hash)) && afterDel?.n === 0 && afterDel.onDisk === false, J(afterDel));

    // ── E 錯誤 ─────────────────────────────────────────────────────────
    const errs = chrome.pageErrors ?? [];
    const consoleErrs = (chrome.consoleLines ?? []).filter((l) => l.startsWith("[error]"));
    ck("E1 page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
    ck("E2 console error 0", consoleErrs.length === 0, consoleErrs.slice(0, 3).join(" ¦ "));
  },
});
finishGate(result);
