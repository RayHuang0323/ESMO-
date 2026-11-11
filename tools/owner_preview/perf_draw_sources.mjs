#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/perf_draw_sources.mjs — 每幀 draw call 的來源歸屬（2026-11-11；量測工具，不是 gate；不改任何程式）
//
//  做法（只能在 dev server 上跑）：從頁面已載入的資源裡找到 three 的預打包模組網址，import 同一份模組實例，
//  包住 Object3D.prototype.onBeforeRender（three 對每一個 render item 都會呼叫一次，含多材質的每個 group）。
//  每個 render item 依「最近的有名字祖先鏈＋物件型別＋幾何型別＋材質型別」歸類，取樣 N 幀求每幀平均。
//  ⚠ 自己覆寫 onBeforeRender 的物件不會被計到；總數會與 renderer.info / WebGL 計數對照，差額列在 unattributed。
//  執行：ESMO_EXTERNAL_URL=http://127.0.0.1:5621/ESMO-/ ESMO_REVIEW_OUT=<資料夾> ESMO_PERF_LABEL=... \
//        node tools/browser/run-gate.mjs tools/owner_preview/perf_draw_sources.mjs --timeout 900000 -- --headed
// ============================================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { runGate, finishGate } from "../browser/harness.mjs";
import { flowOf } from "./lib_battle_flow.mjs";

const TARGET_URL = process.env.ESMO_EXTERNAL_URL?.trim() || null;
const LABEL = process.env.ESMO_PERF_LABEL ?? "run";
const OUT = process.env.ESMO_REVIEW_OUT ?? "tmp/moba-draw-sources";
mkdirSync(OUT, { recursive: true });

const INSTALL = "const urls=performance.getEntriesByType('resource').map(r=>r.name).filter(n=>/\\/three\\.js(\\?|$)/.test(n)||/deps\\/three\\.js/.test(n));"
  + "if(!urls.length) return JSON.stringify({err:'no three module url'});"
  + "return import(urls[0]).then((T)=>{ if(window.__drawsrc) return JSON.stringify({ok:true,again:true});"
  + " const D=window.__drawsrc={on:false,frames:0,keys:{},scene:null,gl:null};"
  + " const nameChain=(o)=>{const a=[];let p=o;while(p){if(p.name) a.unshift(p.name); p=p.parent;} return a.slice(0,3).join('/')||'(unnamed)';};"
  + " T.Object3D.prototype.onBeforeRender=function(renderer,scene,camera,geometry,material,group){ D.cur=this; D.curGeo=geometry; D.curMat=material; if(!D.on) return; try{ if(scene&&scene.isScene&&scene.children.length>(D.scene?D.scene.children.length:-1)) D.scene=scene; D.gl=renderer;"
  + "  const k=nameChain(this)+' | '+this.type+(this.isInstancedMesh?'[inst '+this.count+']':'')+(this.isSkinnedMesh?'[skin]':'')+' | '+(geometry&&geometry.type)+' | '+(material&&material.type)+(material&&material.transparent?':T':'');"
  + "  const e=(D.keys[k]??={n:0,tris:0}); e.n++; const idx=geometry&&geometry.index; const cnt=group?group.count:(idx?idx.count:(geometry&&geometry.attributes.position?geometry.attributes.position.count:0)); e.tris+=cnt/3; }catch(err){ D.errs=(D.errs||0)+1; D.lastErr=String(err); } };"
  + " const origKey=T.Material.prototype.customProgramCacheKey; D.recomp={}; T.Material.prototype.customProgramCacheKey=function(){ if(D.on){ try{ const o=D.cur; const g=D.curGeo; const k=(this.name||this.type)+'#'+this.id+(this.transparent?':T':'')+(this.side===2?':DS':'')+' <- '+(o?nameChain(o)+' '+o.type+(o.isSkinnedMesh?'[skin]':'')+(o.isInstancedMesh?'[inst]':'')+(o.morphTargetInfluences?'[morph]':''):'?')+' attrs='+(g&&g.attributes?Object.keys(g.attributes).sort().join(','):'?'); D.recomp[k]=(D.recomp[k]||0)+1; }catch(e){} } return origKey.call(this); }; D.links=[]; D.t0=performance.now(); for(const C of [window.WebGL2RenderingContext,window.WebGLRenderingContext]){ if(!C) continue; const lp=C.prototype.linkProgram; C.prototype.linkProgram=function(p){ try{ const o=D.cur,m=D.curMat; D.links.push({t:Math.round(performance.now()-D.t0),obj:o?nameChain(o)+' '+o.type+(o.isSkinnedMesh?'[skin]':'')+(o.isInstancedMesh?'[inst]':''):'?',mat:m?(m.name||m.type)+(m.transparent?':T':'')+(m.map?':map':'')+(m.vertexColors?':vc':''):'?',vis:o?o.visible:null}); }catch(e){} return lp.call(this,p); }; } const tick=()=>{ if(D.on) D.frames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick);"
  + " return JSON.stringify({ok:true,url:urls[0]}); }).catch(e=>JSON.stringify({err:String(e)}));";

const result = await runGate({
  name: `MOBA draw-call sources（${LABEL}）`, timeoutMs: 850_000, externalUrl: TARGET_URL,
  async run({ chrome, url, ck, sleep }) {
    const { ev, click, toBattle } = flowOf({ chrome, url, sleep });
    await chrome.send("Emulation.setDeviceMetricsOverride", { label: "Desktop", width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    const ok = await toBattle();
    ck("進入 MOBA 戰鬥", ok);
    if (!ok) return;
    const inst = await ev(INSTALL);
    ck("three 模組已掛上計數", inst?.ok === true, JSON.stringify(inst));
    if (!inst?.ok) return;
    await click('[data-testid="match-speed-4"]');
    const samples = {};
    for (const [tag, waitMs] of [["t+10s", 10000], ["t+40s", 30000], ["t+80s", 40000]]) {
      await sleep(waitMs);
      await chrome.evaluate("const D=window.__drawsrc; D.keys={}; D.recomp={}; D.frames=0; D.on=true; return 1;");
      await sleep(3000);
      const s = await ev("const D=window.__drawsrc; D.on=false; const info=D.gl?D.gl.info:null; let objs=0,vis=0,meshes=0; if(D.scene) D.scene.traverse(o=>{objs++; if(o.isMesh||o.isLine||o.isPoints||o.isSprite){meshes++; if(o.visible) vis++;}});"
        + "return JSON.stringify({frames:D.frames,keys:D.keys,recomp:D.recomp,errs:D.errs||0,lastErr:D.lastErr||null,calls:info?info.render.calls:null,programs:info&&info.programs?info.programs.length:null,geometries:info?info.memory.geometries:null,textures:info?info.memory.textures:null,sceneObjects:objs,drawables:meshes,drawablesVisibleFlag:vis});");
      const rows = Object.entries(s.keys).map(([k, v]) => ({ key: k, perFrame: +(v.n / s.frames).toFixed(1), trisPerFrame: Math.round(v.tris / s.frames) })).sort((a, b) => b.perFrame - a.perFrame);
      const recomp = Object.entries(s.recomp ?? {}).map(([k, v]) => ({ key: k, perFrame: +(v / s.frames).toFixed(2) })).sort((a, b) => b.perFrame - a.perFrame);
      const byRoot = {};
      for (const r of rows) { const root = r.key.split(" | ")[0].split("/")[0]; byRoot[root] = +(((byRoot[root] ?? 0) + r.perFrame)).toFixed(1); }
      samples[tag] = { frames: s.frames, attributedPerFrame: +rows.reduce((a, r) => a + r.perFrame, 0).toFixed(1), programs: s.programs, geometries: s.geometries, textures: s.textures, sceneObjects: s.sceneObjects, drawables: s.drawables, programParamRecomputesPerFrame: +recomp.reduce((a, r) => a + r.perFrame, 0).toFixed(1), recomputeTop: recomp.slice(0, 60),
        byRoot: Object.fromEntries(Object.entries(byRoot).sort((a, b) => b[1] - a[1])), top: rows.slice(0, 60) };
      console.log(tag, JSON.stringify({ recompPerFrame: samples[tag].programParamRecomputesPerFrame, errs: s.errs, lastErr: s.lastErr, calls: s.calls, first: rows[0], frames: s.frames, attributed: samples[tag].attributedPerFrame, programs: s.programs, byRoot: samples[tag].byRoot }));
    }
    await sleep(Number(process.env.ESMO_LINK_WATCH_MS ?? 70000));
    samples.linksAfterBattleEntry = await ev("return JSON.stringify(window.__drawsrc.links);");
    console.log('links', JSON.stringify(samples.linksAfterBattleEntry));
    writeFileSync(`${OUT}/${LABEL}-drawsources.json`, JSON.stringify(samples, null, 1));
    ck("有歸屬資料", Object.values(samples).filter((s) => s.frames != null).every((s) => s.frames > 20 && s.attributedPerFrame > 50));
  },
});
await finishGate(result);
