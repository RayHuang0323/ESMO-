// ============================================================================
//  EsportsFPS3D.jsx — 3D CS 對戰引擎（自 EsportsGame.jsx 原封抽離，Phase 4）
//  ⚠ 引擎主體 = 原內聯 __FPS3D_MODULE，逐位元組未改；IIFE 保留（改動最小化）。
//  介面不變：props in（見 BattleConfig / toEngineProps）→ onComplete(result) out。
// ============================================================================
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as THREE from "three";

// EsportsFPS3D 已內聯於本檔（見下方 __FPS3D_MODULE），以符合單一檔案 artifact 限制
/* ═══════════════════════════════════════════════════════════════
   EsportsFPS3D（3D CS 對戰引擎）— 內聯模組，封裝於 IIFE 以隔離作用域
   （避免與主遊戲的 PERSONALITY / MAPS / C 等同名衝突），只對外暴露
   EsportsFPS3D 元件與 buildMatchResult。
   ═══════════════════════════════════════════════════════════════ */
const __FPS3D_MODULE = (function(){

/* ═══════════════════════════════════════════════════════════════════════
   CS 戰術轉播 · 3D WebGL 引擎版
   ──────────────────────────────────────────────────────────────────────
   • 同一套模擬引擎（simulateFps）產出逐格資料：選手座標 / 視角 / 血量 /
     擊殺 / 彈道 / 煙霧 / 燃燒彈 / 投擲物 / C4 / 比分 — 全部與畫面對接。
   • 渲染層改用 Three.js：打光 + 陰影的立體建築、低面數 3D 選手（依視角
     轉向）、發光曳光彈、體積煙、火焰、會自動追焦的運鏡相機。
   • 可直接替換既有遊戲的 FpsModule 渲染層（資料結構完全相同）。
   ═══════════════════════════════════════════════════════════════════════ */

// ─── 數學/工具 ───────────────────────────────────────────────────────────
const lerp=(a,b,t)=>a+(b-a)*t;
const vl=(a,b,t)=>({x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ease=t=>t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
const mkRng=s=>{let x=s|0;return()=>{x=(x*1664525+1013904223)&0xffffffff;return(x>>>0)/0xffffffff;};};
const fmtT=s=>`${Math.floor(s/60).toString().padStart(2,"0")}:${(Math.floor(Math.max(0,s))%60).toString().padStart(2,"0")}`;
// 角度插值（取最短路徑，輸入/輸出皆為度）
function lerpAngle(a,b,t){let d=((b-a)%360+540)%360-180;return a+d*t;}
// 穩定雜湊（用於平滑的待機微動，避免亂數造成瞬移）
const hsh=s=>{s=String(s);let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0);};
// 2D 線段是否被矩形阻擋（給相機遮擋判斷用；世界座標）
function segHitsRect(ax,az,bx,bz,r){
  const steps=14;for(let i=1;i<steps;i++){const t=i/steps,x=ax+(bx-ax)*t,z=az+(bz-az)*t;
    if(x>=r.x0&&x<=r.x1&&z>=r.z0&&z<=r.z1)return true;}return false;
}
// ─── 程序生成對戰音效（Web Audio；首次點擊喇叭時建立）─────────────────────
function makeAudio(){
  const AC=typeof window!=="undefined"&&(window.AudioContext||window.webkitAudioContext);if(!AC)return null;
  const ctx=new AC();const master=ctx.createGain();master.gain.value=0.5;master.connect(ctx.destination);
  const nb=ctx.createBuffer(1,Math.floor(ctx.sampleRate*0.5),ctx.sampleRate);
  const nd=nb.getChannelData(0);for(let i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;
  const now=()=>ctx.currentTime;
  function noise(dur,freq,q,gain,type){const s=ctx.createBufferSource();s.buffer=nb;const f=ctx.createBiquadFilter();f.type=type||"lowpass";f.frequency.value=freq;f.Q.value=q||1;const g=ctx.createGain();const t=now();g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(0.0008,t+dur);s.connect(f);f.connect(g);g.connect(master);s.start(t);s.stop(t+dur);}
  function tone(freq,dur,gain,type,slideTo){const o=ctx.createOscillator();const g=ctx.createGain();o.type=type||"square";const t=now();o.frequency.setValueAtTime(freq,t);if(slideTo)o.frequency.exponentialRampToValueAtTime(slideTo,t+dur);g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(0.0006,t+dur);o.connect(g);g.connect(master);o.start(t);o.stop(t+dur);}
  let lastShot=0;
  // 依槍種的單發音色（更接近 CS：銳利 transient + 槍身 body + 低頻衝擊）
  function shot(cls){const t=now();if(t-lastShot<0.012)return;lastShot=t;
    if(cls==="狙擊"){noise(0.06,1600,0.6,0.55,"highpass");noise(0.22,560,0.9,0.5,"lowpass");tone(110,0.24,0.34,"sawtooth",42);noise(0.34,300,0.5,0.16,"lowpass");return;}
    if(cls==="衝鋒"){noise(0.022,3000,0.5,0.3,"highpass");noise(0.03,640,1.1,0.18,"bandpass");tone(250,0.026,0.15,"square",150);return;}
    if(cls==="手槍"){noise(0.05,1500,0.6,0.4,"highpass");noise(0.06,520,1.1,0.3,"bandpass");tone(165,0.06,0.24,"square",84);return;}
    // 步槍（AK/M4）：深沉而扎實
    noise(0.034,1750,0.7,0.44,"highpass");noise(0.05,360,1.3,0.36,"bandpass");tone(135,0.055,0.28,"square",74);noise(0.016,5000,0.5,0.16,"highpass");
  }
  return{
    ctx,resume(){if(ctx.state!=="running")ctx.resume();},setVol(v){master.gain.value=v;},
    shot,shoot(sniper){shot(sniper?"狙擊":"步槍");},
    // 連續開火：依槍種噴出一串槍聲，火拼時聽起來是連續的
    burst(cls,kill){let n=cls==="狙擊"?1:cls==="手槍"?(kill?1:2):cls==="衝鋒"?(kill?3:7):(kill?2:5);const gap=cls==="衝鋒"?60:cls==="手槍"?155:92;for(let i=0;i<n;i++){if(i===0)shot(cls);else setTimeout(()=>shot(cls),i*gap+(Math.random()*10-5));}},
    kill(hs){noise(0.12,hs?3600:1400,1,0.24);if(hs)tone(950,0.08,0.12,"square",320);},
    impact(){noise(0.035,3400,0.8,0.2,"highpass");tone(2600,0.045,0.07,"square",2000);}, // 子彈命中金屬脆響
    plant(){for(let i=0;i<3;i++)setTimeout(()=>tone(1500,0.06,0.2,"square"),i*85);},
    beep(fast){tone(fast?2100:1500,0.07,0.2,"square");},
    boom(){noise(0.75,220,0.6,0.7,"lowpass");tone(58,0.7,0.4,"sawtooth",28);},
    defuse(){tone(680,0.5,0.16,"sine",1300);},
    // 回合開始倒數：3 短嗶 + 開打高音（仿 CS freeze→live）
    countdown(){[0,1,2].forEach(i=>setTimeout(()=>tone(740,0.09,0.16,"square"),i*450));setTimeout(()=>{tone(1180,0.16,0.18,"square");},1350);},
    roundStart(){tone(523,0.12,0.15,"sine");setTimeout(()=>tone(784,0.18,0.15,"sine"),120);},
    win(t){const f=t?[392,523,659]:[659,523,392];f.forEach((x,i)=>setTimeout(()=>tone(x,0.16,0.15,"sine"),i*130));},
  };
}

// ─── 碰撞 / 視線（半徑感知滑動 + 穿透回推，杜絕穿牆）─────────────────────
const PLAYER_R=1.35; // 選手碰撞半徑（地圖單位）
const inWall=(p,walls)=>{for(const w of walls){if(p.x>=w.x-1&&p.x<=w.x+w.w+1&&p.y>=w.y-1&&p.y<=w.y+w.h+1)return w;}return null;};
function blocked(p,walls,R){for(const w of walls){if(p.x>w.x-R&&p.x<w.x+w.w+R&&p.y>w.y-R&&p.y<w.y+w.h+R)return true;}return false;}
// 穿透回推：把點推出所有重疊牆體（取最小穿透軸）
function collideResolve(p,walls,R){
  for(let it=0;it<4;it++){let hit=false;
    for(const w of walls){const minX=w.x-R,maxX=w.x+w.w+R,minY=w.y-R,maxY=w.y+w.h+R;
      if(p.x>minX&&p.x<maxX&&p.y>minY&&p.y<maxY){const dl=p.x-minX,dr=maxX-p.x,dt=p.y-minY,db=maxY-p.y;const m=Math.min(dl,dr,dt,db);
        if(m===dl)p.x=minX;else if(m===dr)p.x=maxX;else if(m===dt)p.y=minY;else p.y=maxY;hit=true;}}
    if(!hit)break;}
  p.x=clamp(p.x,1.5,98.5);p.y=clamp(p.y,1.5,98.5);return p;
}
// 逐軸滑動：撞牆時沿牆面滑行（而非穿入或卡死）
function slideMove(from,des,walls,R){
  let x=from.x,y=from.y;
  if(!blocked({x:des.x,y},walls,R))x=des.x;
  if(!blocked({x,y:des.y},walls,R))y=des.y;
  if(x===from.x&&y===from.y){if(!blocked({x:des.x,y:from.y},walls,R))x=des.x;else if(!blocked({x:from.x,y:des.y},walls,R))y=des.y;}
  return collideResolve({x,y},walls,R);
}
// 子步進移動：把一次大位移拆成 ≤1.2 單位的小步，避免高速穿牆
function safeMove(from,des,walls,R){
  const d=dist(from,des);const n=Math.max(1,Math.ceil(d/1.2));let cur={x:from.x,y:from.y};
  for(let i=1;i<=n;i++){const t=i/n;cur=slideMove(cur,{x:lerp(from.x,des.x,t),y:lerp(from.y,des.y,t)},walls,R);}
  return cur;
}
// 把點推到最近的可走位置（供節點/出生點落在牆內時校正）
function snapOut(pt,walls,R){const p={x:pt.x,y:pt.y};if(!blocked(p,walls,R))return p;
  for(let r=1;r<=20;r++){for(let a=0;a<16;a++){const ang=a*Math.PI/8;const c={x:pt.x+Math.cos(ang)*r,y:pt.y+Math.sin(ang)*r};if(!blocked(c,walls,R)&&c.x>2&&c.x<98&&c.y>2&&c.y<98)return c;}}
  return collideResolve(p,walls,R);
}
function lineBlocked(a,b,walls){
  const steps=Math.ceil(dist(a,b)/0.7);
  for(let i=1;i<steps;i++){const t=i/steps;const p={x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)};for(const w of walls){if(w.deco)continue;if(p.x>=w.x&&p.x<=w.x+w.w&&p.y>=w.y&&p.y<=w.y+w.h)return true;}}
  return false;
}
// 沿 a→方向(dir) 到第一道牆的距離（地圖單位）；找不到回傳 max
function rayWallDist(ax,ay,dx,dy,walls,max){
  const n=Math.ceil(max/0.7);for(let i=1;i<=n;i++){const t=(i/n)*max;const x=ax+dx*t,y=ay+dy*t;for(const w of walls){if(w.deco)continue;if(x>=w.x&&x<=w.x+w.w&&y>=w.y&&y<=w.y+w.h)return t;}}
  return max;
}
function segPtDist(ax,ay,bx,by,px,py){const dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy;if(l2<1e-6)return Math.hypot(px-ax,py-ay);let t=((px-ax)*dx+(py-ay)*dy)/l2;t=Math.max(0,Math.min(1,t));return Math.hypot(px-(ax+dx*t),py-(ay+dy*t));}
// 煙霧阻斷視線：對槍連線若穿過煙團則無法交火
const SMOKE_R=6;
function smokeBlocks(a,b,smokes){if(!smokes||!smokes.length)return false;for(const s of smokes){if((s.tl??1)<=0)continue;if(segPtDist(a.x,a.y,b.x,b.y,s.pos.x,s.pos.y)<SMOKE_R)return true;}return false;}

// ─── 地圖資料（walls = 碰撞 + 3D 建築）───────────────────────────────────
const MAPS={
  dust2:{name:"Dust II",floor:"#2a2218",accent:"#caa46a",accent2:"#9c7d4a",
    walls:[
      {x:74,y:5,w:12,h:7,hgt:8,win:1},{x:90,y:9,w:8,h:17,hgt:9,win:1},{x:72,y:23,w:9,h:9,hgt:7,roof:"pitch"},{x:60,y:8,w:9,h:9,hgt:7,win:1},
      {x:68,y:36,w:10,h:13,hgt:8,win:1},{x:86,y:38,w:9,h:15,hgt:7,win:1},
      {x:46,y:30,w:9,h:13,hgt:8,win:1},{x:30,y:38,w:9,h:12,hgt:7,roof:"pitch"},{x:54,y:54,w:9,h:12,hgt:7,win:1},
      {x:3,y:48,w:10,h:15,hgt:8,win:1},{x:24,y:60,w:8,h:12,hgt:7},{x:5,y:74,w:12,h:11,hgt:6,roof:"pitch"},{x:28,y:78,w:9,h:9,hgt:7,win:1},{x:30,y:44,w:7,h:9,hgt:6},
      {x:42,y:84,w:13,h:9,hgt:7,win:1},{x:14,y:90,w:9,h:8,hgt:6},
      {x:88,y:62,w:8,h:12,hgt:7,win:1},{x:2,y:30,w:8,h:12,hgt:7},{x:44,y:70,w:8,h:8,hgt:6},{x:76,y:70,w:8,h:9,hgt:6,roof:"pitch"},
      {x:2,y:2,w:14,h:14,hgt:8,win:1},{x:34,y:6,w:13,h:11,hgt:8,win:1},{x:20,y:20,w:11,h:13,hgt:7,roof:"pitch"},{x:56,y:84,w:12,h:8,hgt:7,win:1},
      {x:2,y:88,w:10,h:8,hgt:6},{x:90,y:78,w:8,h:14,hgt:7,win:1},{x:58,y:20,w:9,h:9,hgt:7},
    ],
    crates:[{x:84,y:20},{x:88,y:16},{x:50,y:48},{x:16,y:60},{x:20,y:62},{x:66,y:64},{x:80,y:14},{x:86,y:24},{x:18,y:54},{x:62,y:66},{x:46,y:64},{x:70,y:34}],
    props:[{t:"barrel",x:46,y:50},{t:"barrel",x:82,y:36},{t:"barrel",x:18,y:58},{t:"sandbag",x:60,y:45,a:0},{t:"sandbag",x:72,y:30,a:1},{t:"crate",x:82,y:46},{t:"crate",x:34,y:46},{t:"car",x:88,y:24,a:0.4},{t:"sandbag",x:84,y:24,a:0},{t:"barrel",x:14,y:56},{t:"crate",x:60,y:62},{t:"sandbag",x:48,y:50,a:1},{t:"barrel",x:68,y:62},{t:"plat",x:94,y:30}],
    doors:[{x:50,y:50,w:5,h:2,dir:"h",label:"中門"},{x:26,y:54,w:2,h:5,dir:"v",label:"B 門"},{x:66,y:60,w:5,h:2,dir:"h",label:"長道門"}],
    sites:{a:{x:84,y:17},b:{x:16,y:58}},spawns:{ct:{x:80,y:56},t:{x:28,y:92}},
    nodes:{tSpawn:{x:28,y:92},longEntry:{x:46,y:82},long:{x:66,y:68},longCorner:{x:82,y:44},aRamp:{x:84,y:33},aSite:{x:84,y:17},pit:{x:94,y:30},shortA:{x:68,y:32},catwalk:{x:60,y:42},mid:{x:42,y:64},midDoors:{x:50,y:50},xbox:{x:42,y:48},lower:{x:22,y:82},bTunnel:{x:14,y:66},bDoors:{x:26,y:54},bSite:{x:16,y:58},ctSpawn:{x:80,y:58},ctMid:{x:66,y:56}},
    callouts:[{x:28,y:96,l:"T 出生"},{x:80,y:62,l:"CT 出生"},{x:88,y:13,l:"A 點"},{x:14,y:52,l:"B 點"},{x:64,y:72,l:"長道"},{x:42,y:70,l:"中路"},{x:14,y:72,l:"隧道"},{x:94,y:36,l:"坑"},{x:60,y:38,l:"貓道"},{x:50,y:46,l:"中門"},{x:84,y:29,l:"A 坡"},{x:26,y:50,l:"B 門"}]},
  mirage:{name:"Mirage",floor:"#2d2414",accent:"#c8a05a",accent2:"#9a7a40",
    walls:[
      {x:60,y:8,w:16,h:11,hgt:9,win:1},{x:80,y:12,w:10,h:12,hgt:8,win:1},{x:54,y:22,w:8,h:14,hgt:7,roof:"pitch"},
      {x:40,y:30,w:9,h:10,hgt:6,win:1},{x:46,y:46,w:10,h:8,hgt:5},{x:30,y:42,w:8,h:12,hgt:6,roof:"pitch"},
      {x:8,y:58,w:12,h:11,hgt:7,win:1},{x:24,y:64,w:9,h:9,hgt:6},{x:10,y:78,w:13,h:8,hgt:6,roof:"pitch"},
      {x:64,y:42,w:10,h:10,hgt:6,win:1},{x:78,y:50,w:8,h:12,hgt:7,win:1},
      {x:6,y:14,w:12,h:10,hgt:7,win:1},{x:88,y:30,w:8,h:16,hgt:8,win:1},{x:84,y:64,w:10,h:14,hgt:7,win:1},{x:40,y:78,w:12,h:9,hgt:7,win:1},{x:66,y:24,w:8,h:9,hgt:7,roof:"pitch"},{x:18,y:30,w:8,h:10,hgt:6},
      {x:2,y:2,w:14,h:9,hgt:8,win:1},{x:24,y:6,w:14,h:10,hgt:8,roof:"pitch"},{x:2,y:42,w:8,h:12,hgt:7},{x:60,y:62,w:12,h:10,hgt:7,win:1},{x:88,y:84,w:10,h:8,hgt:6},{x:34,y:64,w:8,h:8,hgt:6},
    ],
    crates:[{x:82,y:18},{x:86,y:22},{x:16,y:60},{x:20,y:62},{x:46,y:50},{x:60,y:34},{x:78,y:16},{x:14,y:80},{x:18,y:84},{x:50,y:66},{x:62,y:48},{x:42,y:34}],
    props:[{t:"barrel",x:44,y:52},{t:"barrel",x:78,y:46},{t:"sandbag",x:58,y:48,a:0},{t:"crate",x:50,y:68},{t:"crate",x:26,y:60},{t:"barrel",x:14,y:62},{t:"sandbag",x:80,y:18,a:1},{t:"crate",x:84,y:20},{t:"barrel",x:48,y:54},{t:"sandbag",x:16,y:80,a:0},{t:"crate",x:56,y:50},{t:"plat",x:82,y:16},{t:"barrel",x:24,y:70}],
    doors:[{x:46,y:46,w:5,h:2,dir:"h",label:"中路"},{x:24,y:64,w:2,h:5,dir:"v",label:"連接"},{x:60,y:34,w:5,h:2,dir:"h",label:"坡道"}],
    sites:{a:{x:82,y:16},b:{x:16,y:82}},spawns:{ct:{x:72,y:52},t:{x:32,y:90}},
    nodes:{tSpawn:{x:32,y:90},palace:{x:50,y:70},ramp:{x:62,y:46},topMid:{x:54,y:34},aRamp:{x:72,y:24},aSite:{x:82,y:16},mid:{x:44,y:56},window:{x:58,y:50},apps:{x:24,y:72},connector:{x:20,y:64},bSite:{x:16,y:82},ctSpawn:{x:72,y:52}},
    callouts:[{x:32,y:94,l:"T 出生"},{x:72,y:58,l:"CT"},{x:84,y:12,l:"A 點"},{x:12,y:86,l:"B 點"},{x:50,y:74,l:"跳台"},{x:44,y:60,l:"中路"},{x:24,y:76,l:"公寓"},{x:62,y:42,l:"坡道"},{x:58,y:46,l:"窗口"}]},
  inferno:{name:"Inferno",floor:"#2d1d12",accent:"#c08a52",accent2:"#94663c",
    walls:[
      {x:34,y:2,w:30,h:8,hgt:9,win:1,roof:"pitch"},
      {x:18,y:12,w:12,h:34,hgt:8,win:1},
      {x:60,y:8,w:10,h:11,hgt:8,win:1},
      {x:46,y:30,w:10,h:14,hgt:7,win:1},
      {x:60,y:46,w:6,h:12,hgt:7,win:1},
      {x:34,y:48,w:8,h:12,hgt:7,roof:"pitch"},
      {x:82,y:24,w:12,h:12,hgt:9,win:1},{x:94,y:36,w:6,h:38,hgt:8,win:1},
      {x:70,y:40,w:12,h:1.8,hgt:8,win:1},{x:70,y:41.8,w:1.8,h:8.2,hgt:8,win:1},{x:80.2,y:41.8,w:1.8,h:8.2,hgt:8,win:1},{x:70,y:48.2,w:3,h:1.8,hgt:8},{x:79,y:48.2,w:3,h:1.8,hgt:8},
      {x:78,y:70,w:10,h:8,hgt:7,win:1},
      {x:2,y:56,w:10,h:10,hgt:7},{x:2,y:72,w:12,h:16,hgt:7,win:1},
      {x:28,y:74,w:10,h:8,hgt:7,roof:"pitch"},
      {x:44,y:74,w:8,h:8,hgt:7,win:1},{x:56,y:72,w:10,h:8,hgt:7,win:1},{x:62,y:84,w:12,h:8,hgt:6},{x:40,y:82,w:8,h:6,hgt:6},
      {x:2,y:14,w:10,h:18,hgt:7,win:1},{x:70,y:2,w:14,h:9,hgt:8,win:1,roof:"pitch"},{x:30,y:12,w:6,h:9,hgt:6},
      {x:84,y:80,w:10,h:10,hgt:7,win:1},{x:78,y:22,w:6,h:6,hgt:6},{x:2,y:34,w:8,h:16,hgt:7,win:1},{x:14,y:88,w:14,h:8,hgt:6},
    ],
    crates:[{x:34,y:28},{x:38,y:30},{x:42,y:29},{x:72,y:61},{x:76,y:60},{x:46,y:24},{x:54,y:24},{x:62,y:58},{x:82,y:64},{x:86,y:66},{x:30,y:80}],
    props:[{t:"car",x:44,y:38,a:0.3},{t:"car",x:74,y:76,a:0},{t:"barrel",x:46,y:41},{t:"barrel",x:40,y:50},{t:"sandbag",x:50,y:46,a:0},{t:"sandbag",x:26,y:54,a:1},{t:"plat",x:90,y:68},{t:"barrel",x:78,y:58},{t:"crate",x:54,y:46},{t:"sandbag",x:38,y:44,a:0},{t:"barrel",x:70,y:60},{t:"sandbag",x:66,y:47,a:1},{t:"barrel",x:50,y:24},{t:"barrel",x:24,y:53},{t:"plat",x:74,y:64},{t:"barrel",x:90,y:71},{t:"crate",x:60,y:74}],
    doors:[{x:38,y:42,w:5,h:2,dir:"h",label:"香蕉"},{x:68,y:46,w:2,h:5,dir:"v",label:"拱門"},{x:50,y:62,w:5,h:2,dir:"h",label:"中路"}],
    sites:{a:{x:74,y:64},b:{x:50,y:20}},spawns:{ct:{x:90,y:42},t:{x:10,y:70}},
    nodes:{tSpawn:{x:10,y:70},tRamp:{x:26,y:56},banana:{x:38,y:42},car:{x:44,y:34},bSite:{x:50,y:20},bTop:{x:66,y:23},apps:{x:22,y:82},boiler:{x:50,y:70},mid:{x:50,y:62},sewer:{x:38,y:64},secondMid:{x:58,y:53},aConn:{x:70,y:58},aRamp:{x:78,y:54},aSite:{x:74,y:64},arch:{x:68,y:46},library:{x:74,y:53},libIn:{x:76,y:45},pit:{x:90,y:66},ctSpawn:{x:90,y:42}},
    callouts:[
      {x:50,y:4,l:"花園"},{x:60,y:6,l:"教堂/工地"},{x:44,y:8,l:"棺材"},{x:24,y:18,l:"柱子"},{x:50,y:17,l:"B 點·噴泉"},
      {x:40,y:30,l:"箱區"},{x:64,y:15,l:"台下"},{x:66,y:23,l:"連接"},{x:78,y:28,l:"警家水井"},{x:72,y:31,l:"雙架位"},
      {x:86,y:31,l:"警家走廊"},{x:80,y:38,l:"警家暗道"},{x:91,y:44,l:"警家出生點"},{x:76,y:44,l:"書房"},{x:68,y:47,l:"連接拱門"},
      {x:44,y:38,l:"車位/木桶"},{x:34,y:44,l:"香蕉道"},{x:50,y:47,l:"沙袋"},{x:40,y:53,l:"凹槽"},{x:66,y:52,l:"A 連接"},
      {x:80,y:60,l:"摩托車位"},{x:84,y:74,l:"墓地"},{x:62,y:57,l:"死點"},{x:73,y:60,l:"中箱/爆頭位"},{x:74,y:67,l:"A 點·下包位"},
      {x:88,y:70,l:"陽台"},{x:91,y:66,l:"大坑"},{x:91,y:74,l:"小坑"},{x:14,y:53,l:"台上/狙位"},{x:26,y:54,l:"匪斜坡"},
      {x:44,y:57,l:"長椅"},{x:38,y:62,l:"下水道"},{x:50,y:61,l:"中路"},{x:58,y:59,l:"中遠"},{x:10,y:73,l:"匪家出生點"},
      {x:28,y:69,l:"廚房"},{x:7,y:83,l:"匪二樓"},{x:32,y:80,l:"側道"},{x:7,y:77,l:"收音機"},{x:48,y:72,l:"鍋爐房"},
      {x:61,y:74,l:"VIP/馬棚"},{x:68,y:66,l:"A 小道"},{x:68,y:87,l:"A二樓/走廊"},{x:44,y:82,l:"自門房間"},{x:50,y:90,l:"後巷"}]},
};
// 選手 16 項素質（與 MOBA 共用的同一套；分四類）— 直接沿用遊戲的素質欄位
const STAT_GROUPS=[
  ["操作",[["rxn","反應速度"],["acc","精準度"],["apm","操作速度"],["pos","走位"]]],
  ["戰術",[["vis","視野意識"],["tac","戰術理解"],["dec","決策力"],["adp","應變力"]]],
  ["心理",[["cou","勇氣"],["str","抗壓"],["foc","專注力"],["res","韌性"]]],
  ["團隊",[["com","溝通"],["led","領導力"],["coo","配合度"],["lrn","學習力"]]],
];
const STAT_KEYS=STAT_GROUPS.flatMap(g=>g[1]);
// ── 個性系統（短鍵版，對應遊戲 EsportsGame 的 PERSONALITY；boost/nerf 用 3D 短鍵）──
// 個性會在對戰中影響：素質的有效值（boost +6 / nerf −4）、進攻性 aggr、以及殘局心態。
const PERSONALITY={
  aggressive:{zh:"進攻型",boost:["cou","rxn"],nerf:["dec","foc"],aggro:0.10},   // 敢衝，決策/專注略降
  defensive: {zh:"防守型",boost:["pos","foc"],nerf:["cou","apm"],aggro:-0.10},  // 穩守，侵略性低
  calm:      {zh:"冷靜型",boost:["str","dec"],nerf:["cou","apm"],aggro:-0.05},  // 殘局穩、節奏慢
  passionate:{zh:"熱血型",boost:["cou","led"],nerf:["foc","coo"],aggro:0.08},   // 帶動氣氛、情緒大
  genius:    {zh:"天才型",boost:["rxn","lrn"],nerf:["coo","res"],aggro:0.04},   // 天賦高、不合群
  grinder:   {zh:"苦練型",boost:["acc","foc"],nerf:["adp","lrn"],aggro:0.0},    // 勤奮可靠、靈活差
  shotcaller:{zh:"指揮型",boost:["com","led"],nerf:["acc","apm"],aggro:0.0},    // 戰術腦、個人操作普
  lonewolf:  {zh:"孤狼型",boost:["apm","rxn"],nerf:["com","coo"],aggro:0.06},   // 個人強、團隊配合差
  steady:    {zh:"穩健型",boost:["res","pos"],nerf:["cou","rxn"],aggro:-0.06},  // 不犯錯、少高光
  creative:  {zh:"創意型",boost:["adp","lrn"],nerf:["foc","res"],aggro:0.03},   // 出其不意、不穩定
};
const PERS_BOOST=6,PERS_NERF=4;
// 套用個性到單一素質值（對戰時的有效值）
function persStat(p,key){let v=(p.stats&&p.stats[key])||50;const pr=p.personality&&PERSONALITY[p.personality];if(pr){if(pr.boost.includes(key))v+=PERS_BOOST;if(pr.nerf.includes(key))v-=PERS_NERF;}return clamp(v,1,99);}
// 士氣 / 狀態 對發揮的整體倍率（對應遊戲 MORALE_EFFECT / CONDITION_EFFECT）
const moraleMul=m=>m==null?1:(m>=85?1.06:m>=65?1.0:m>=45?0.93:0.83);
const condMul=c=>({"精神飽滿":1.05,"正常":1.0,"疲勞":0.92,"低潮":0.82}[c]||1);
const formMul=p=>moraleMul(p.morale)*condMul(p.condition);
// 戰隊（主隊 = 你的名單）：FPS 職業由 MOBA 定位/戰力對應；fps=FPS戰力, moba=MOBA戰力, sta=體力
const ROSTER=[
  // 我方戰隊（T 德國海豹）— 取自你的選手名單
  {id:"t1",name:"Kratos",side:"t",role:"entry",fpsRole:"突破手",moba:85,fps:86,sta:85,personality:"aggressive",stats:{rxn:78,acc:72,apm:80,pos:85,vis:74,tac:70,dec:68,adp:72,cou:88,str:75,foc:70,res:76,com:65,led:72,coo:70,lrn:68}},
  {id:"t2",name:"Chad",side:"t",role:"rifler",fpsRole:"步槍手",moba:91,fps:92,sta:86,personality:"genius",stats:{rxn:84,acc:88,apm:87,pos:85,vis:80,tac:82,dec:80,adp:82,cou:84,str:86,foc:85,res:84,com:78,led:80,coo:82,lrn:80}},
  {id:"t3",name:"Pinata",side:"t",role:"awp",fpsRole:"狙擊手",moba:81,fps:82,sta:82,personality:"calm",stats:{rxn:82,acc:86,apm:78,pos:80,vis:82,tac:78,dec:78,adp:80,cou:74,str:84,foc:88,res:82,com:74,led:72,coo:80,lrn:76}},
  {id:"t4",name:"Craby",side:"t",role:"lurker",fpsRole:"游走手",moba:79,fps:80,sta:82,personality:"lonewolf",stats:{rxn:79,acc:78,apm:84,pos:86,vis:84,tac:80,dec:78,adp:83,cou:80,str:78,foc:82,res:80,com:76,led:74,coo:78,lrn:80}},
  {id:"t5",name:"Lego",side:"t",role:"igl",fpsRole:"指揮",moba:83,fps:82,sta:80,personality:"shotcaller",stats:{rxn:74,acc:73,apm:72,pos:76,vis:86,tac:88,dec:85,adp:84,cou:78,str:85,foc:83,res:86,com:90,led:92,coo:88,lrn:82}},
  // 對手戰隊（CT Compulsary）
  {id:"ct1",name:"orgaNick",side:"ct",role:"igl",fpsRole:"指揮",moba:84,fps:83,sta:82,personality:"shotcaller",stats:{rxn:76,acc:73,apm:76,pos:79,vis:88,tac:90,dec:86,adp:84,cou:76,str:86,foc:82,res:84,com:88,led:90,coo:86,lrn:80}},
  {id:"ct2",name:"Oniheavy",side:"ct",role:"awp",fpsRole:"狙擊手",moba:84,fps:85,sta:80,personality:"grinder",stats:{rxn:83,acc:84,apm:78,pos:81,vis:84,tac:80,dec:80,adp:82,cou:76,str:84,foc:88,res:82,com:74,led:76,coo:80,lrn:78}},
  {id:"ct3",name:"purPeEsw",side:"ct",role:"rifler",fpsRole:"步槍手",moba:85,fps:85,sta:85,personality:"steady",stats:{rxn:84,acc:85,apm:85,pos:82,vis:80,tac:80,dec:79,adp:81,cou:82,str:82,foc:83,res:82,com:78,led:78,coo:82,lrn:80}},
  {id:"ct4",name:"b3autiFul",side:"ct",role:"entry",fpsRole:"突破手",moba:83,fps:84,sta:90,personality:"aggressive",stats:{rxn:87,acc:82,apm:83,pos:86,vis:82,tac:78,dec:76,adp:80,cou:90,str:80,foc:78,res:80,com:76,led:74,coo:80,lrn:78}},
  {id:"ct5",name:"GolDenous",side:"ct",role:"support",fpsRole:"輔助",moba:82,fps:82,sta:83,personality:"calm",stats:{rxn:78,acc:77,apm:79,pos:80,vis:86,tac:84,dec:82,adp:82,cou:78,str:84,foc:82,res:82,com:90,led:84,coo:90,lrn:80}},
];
// 渲染層使用的「當前名單」：嵌入主遊戲時由元件設為即時名單（自訂對手 / 成長後素質）。
// 僅影響 3D 模型的 id/side/名牌建立；逐格座標與狀態仍由模擬產生的 frame.players 驅動。
let ACTIVE_ROSTER=ROSTER;
const ovr=p=>p.fps||Math.round(((p.stats?(p.stats.acc+p.stats.rxn+p.stats.apm+p.stats.pos)/4:80)));
// 各 FPS 定位的 5 項關鍵素質（取自 esmo 遊戲的 POSITION_PROFILE，權重 5→1）
const POS_PROFILE={
  rifler:["acc","rxn","pos","foc","str"],   // 步槍手
  entry:["cou","rxn","apm","acc","str"],    // 突破手
  awp:["acc","foc","pos","str","rxn"],      // 狙擊手
  igl:["led","com","dec","tac","adp"],      // 指揮
  support:["coo","tac","com","pos","vis"],  // 道具手/輔助
  lurker:["vis","dec","pos","adp","str"],   // 自由人/游走
};
// FPS 全域素質權重（取自遊戲 FPS_WEIGHTS）
const FPS_W={acc:1.4,rxn:1.3,str:1.3,pos:1.2,cou:1.1,vis:1.1,apm:1.0,tac:1.0,foc:1.0,dec:0.9,com:0.9,adp:0.8,res:0.8,coo:0.8,led:0.7,lrn:0.5};
const _mechKeys=["acc","rxn","apm","pos","foc","str"],_mechW=_mechKeys.reduce((a,k)=>a+FPS_W[k],0);
function posSkill(p){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(s[k]||50)*(5-i));return t/15;} // 與遊戲 posFit 一致
// 對槍實力：機械對槍核心（FPS 權重）+ 武器契合 + 角色定位契合（5 項關鍵素質）+ 情境（呼應 fpsRoles 戰術）
function combatSkill(p,opts){const s=p.stats;if(!s)return 80;const cls=GUNS[p.gun]?.cls;
  const S=k=>persStat(p,k); // 個性調整後的有效素質
  let mech=0;_mechKeys.forEach(k=>mech+=S(k)*FPS_W[k]);mech/=_mechW;
  const wpn=cls==="狙擊"?(S("acc")*0.45+S("foc")*0.3+S("pos")*0.25):cls==="手槍"?(S("acc")*0.55+S("rxn")*0.45):(S("acc")*0.42+S("apm")*0.3+S("rxn")*0.28);
  const role=posSkill(p); // 定位契合（用該位置關鍵素質）
  let v=mech*0.5+wpn*0.28+role*0.14+S("vis")*0.04+S("dec")*0.04;
  if(opts){
    if(opts.holding)v+=S("pos")*0.05+S("foc")*0.05;            // 狙擊手/防守：主動架點
    if(opts.entry)v+=S("cou")*0.06+S("rxn")*0.02;              // 突破手：首發突進
    if(opts.lastAlive)v+=(S("str")-76)*0.22+(S("res")-76)*0.12; // 殘局（clutch=抗壓 + 韌性）
    if(opts.lurk)v+=(S("vis")-76)*0.05+(S("pos")-76)*0.04;     // 自由人：埋伏陰人
    if(opts.lowHP)v-=(100-S("str"))*0.05;
  }
  return v*formMul(p); // 士氣 / 體能狀態 影響整體發揮
}
// 進攻性（0–1）：勇氣為主＋抗壓/操作速度/走位＋FPS 職業。低 → 較龜縮、開火保守、殘血易撤退
const ROLE_AGGR={entry:0.14,rifler:0.05,igl:0,support:-0.03,awp:-0.05,lurker:-0.07};
// 各地圖 T 方結構平衡微調（校正回合勝率趨近 50%）
const MAP_EDGE={dust2:-0.42,mirage:0.08,inferno:0.057};
function aggr(p){const s=p.stats;if(!s)return 0.6;const base=(persStat(p,"cou")*0.5+persStat(p,"str")*0.22+persStat(p,"apm")*0.16+persStat(p,"pos")*0.12)/100;const pr=p.personality&&PERSONALITY[p.personality];return clamp(base+(ROLE_AGGR[p.role]||0)+(pr?pr.aggro:0),0.2,1.15);}
// ── 戰術剋制關係（剪刀石頭布 + 站點對位）──────────────────────────────
// 回傳「對 T 方有利」的對槍機率偏移（+ 利攻方 / − 利守方）。一回合內固定。
// 類型剋制：T(rush/execute/default) × CT(default/stack/aggro)
const TAC_MATRIX={
  rush:    {default:0.00, stack:-0.03, aggro:+0.04},  // 快攻碾壓前壓、但撞上堆點吃虧
  execute: {default:+0.01, stack:+0.03, aggro:-0.03}, // 道具執行破堆點、但被前壓抓節奏
  default: {default:0.00, stack:-0.01, aggro:+0.03},  // 中路控制懲罰過度前壓
};
function tacticEdge(tT,tCT){
  let e=0;
  const tType=tT.type||"default",cType=tCT.type||"default";
  e+=(TAC_MATRIX[tType]&&TAC_MATRIX[tType][cType])||0;
  // 站點對位：CT 是否守在 T 進攻的點
  if(tT.site&&tCT.site&&tT.site!=="mid"){
    if(tCT.site===tT.site) e-=0.05;                          // CT 正面堆在 T 要打的點 → 守方優勢
    else if(cType==="stack") e+=0.06;                        // CT 堆錯點、T 打空點 → 攻方巨大優勢
    else if(tCT.site!=="mid") e+=0.02;                       // CT 預設守錯邊 → 攻方小優勢
  }
  return clamp(e,-0.10,0.10);
}
const GUNS={
  ak:{name:"AK-47",dmg:36,hs:0.45,cls:"步槍",rof:9},m4:{name:"M4A1-S",dmg:33,hs:0.4,cls:"步槍",rof:10},m4a4:{name:"M4A4",dmg:33,hs:0.4,cls:"步槍",rof:11},
  galil:{name:"Galil",dmg:30,hs:0.38,cls:"步槍",rof:10},famas:{name:"FAMAS",dmg:30,hs:0.36,cls:"步槍",rof:11},aug:{name:"AUG",dmg:35,hs:0.42,cls:"步槍",rof:10},sg:{name:"SG 553",dmg:39,hs:0.44,cls:"步槍",rof:9},
  awp:{name:"AWP",dmg:115,hs:0.3,cls:"狙擊",rof:1},scout:{name:"SSG 08",dmg:88,hs:0.35,cls:"狙擊",rof:2},
  mp9:{name:"MP9",dmg:26,hs:0.3,cls:"衝鋒",rof:14},mac10:{name:"MAC-10",dmg:29,hs:0.28,cls:"衝鋒",rof:15},ump:{name:"UMP-45",dmg:35,hs:0.32,cls:"衝鋒",rof:12},p90:{name:"P90",dmg:26,hs:0.26,cls:"衝鋒",rof:16},
  deagle:{name:"Deagle",dmg:53,hs:0.5,cls:"手槍",rof:4},glock:{name:"Glock",dmg:28,hs:0.3,cls:"手槍",rof:8},usp:{name:"USP-S",dmg:35,hs:0.35,cls:"手槍",rof:7},p250:{name:"P250",dmg:38,hs:0.4,cls:"手槍",rof:8},tec9:{name:"Tec-9",dmg:33,hs:0.38,cls:"手槍",rof:11},
};
const ROLE_GUNS={awp:["awp","scout"],igl:["ak","m4","famas"],entry:["ak","galil","m4a4"],rifler:["ak","m4","aug","sg"],support:["ak","m4","ump"],lurker:["ak","m4","p90"]};
const ECO_GUNS=["glock","usp","p250","tec9","deagle","mp9","mac10"];
// 武器價格與擊殺獎勵（仿 CS 經濟）
const COST={ak:2700,m4:2900,m4a4:3100,galil:1800,famas:2050,aug:3300,sg:3000,awp:4750,scout:1700,mp9:1250,mac10:1050,ump:1200,p90:2350,deagle:700,glock:0,usp:0,p250:300,tec9:500};
const killReward=gun=>{const g=GUNS[gun];if(!g)return 300;if(gun==="awp")return 100;if(g.cls==="衝鋒")return 600;return 300;};
const ROLE_ZH={igl:"指揮",awp:"狙擊",rifler:"步槍",entry:"突破",support:"輔助",lurker:"埋伏"};
const STATE_ZH={BUY:"購買",ROTATE:"轉移",EXECUTE:"執行",HOLD:"駐守",架槍:"架槍",RETAKE:"回防",ANCHOR:"鎮守",ENGAGE:"交火",安裝中:"安裝中"};
const stZh=s=>STATE_ZH[s]||s;
const buyZh=b=>({pistol:"手槍局",eco:"省槍",force:"強起",full:"全買"}[b]||"—");

const TACTICS_DB={
  dust2:{
    t:[
      {id:"t_long",name:"A 長衝",type:"execute",site:"a",desc:"長道架槍快攻 A",routes:{entry:["tSpawn","longEntry","long","longCorner","aRamp","aSite"],awp:["tSpawn","longEntry","long","longCorner"],rifler:["tSpawn","longEntry","long","aRamp","aSite"],support:["tSpawn","longEntry","catwalk","shortA","aSite"],lurker:["tSpawn","mid","midDoors","catwalk"]},smokes:["aSite","longCorner"],mollys:["pit"]},
      {id:"t_bsplit",name:"B 隧道執行",type:"execute",site:"b",desc:"隧道煙包夾 B",routes:{entry:["tSpawn","lower","bTunnel","bSite"],awp:["tSpawn","mid","midDoors"],rifler:["tSpawn","lower","bTunnel","bDoors","bSite"],support:["tSpawn","lower","bTunnel","bSite"],lurker:["tSpawn","mid","xbox"]},smokes:["bSite","bTunnel"],mollys:["bSite"]},
      {id:"t_midctrl",name:"中路控制",type:"default",site:"mid",desc:"先拿中路再轉點",routes:{entry:["tSpawn","mid","midDoors","catwalk"],awp:["tSpawn","mid","midDoors"],rifler:["tSpawn","mid","xbox"],support:["tSpawn","mid","catwalk","shortA"],lurker:["tSpawn","lower","bTunnel"]},smokes:["mid","catwalk"],mollys:[]},
      {id:"t_rush",name:"全員 B 衝",type:"rush",site:"b",desc:"無煙快速壓制",routes:{entry:["tSpawn","lower","bTunnel","bSite"],awp:["tSpawn","lower","bTunnel"],rifler:["tSpawn","lower","bTunnel","bDoors","bSite"],support:["tSpawn","lower","bTunnel","bSite"],lurker:["tSpawn","lower","bDoors","bSite"]},smokes:[],mollys:[]},
    ],
    ct:[
      {id:"c_std",name:"標準 2-1-2",type:"default",site:"a",desc:"雙線防守留中路",routes:{igl:["ctSpawn","ctMid","catwalk"],awp:["ctSpawn","ctMid","mid"],rifler:["ctSpawn","aRamp","aSite"],entry:["ctSpawn","ctMid","bDoors"],support:["ctSpawn","bDoors","bSite"]},smokes:[]},
      {id:"c_astack",name:"A 點堆人",type:"stack",site:"a",desc:"預判 A 集火",routes:{igl:["ctSpawn","aSite"],awp:["ctSpawn","aRamp"],rifler:["ctSpawn","aSite","pit"],entry:["ctSpawn","aSite"],support:["ctSpawn","catwalk"]},smokes:[]},
      {id:"c_bstack",name:"B 點堆人",type:"stack",site:"b",desc:"預判 B 集火",routes:{igl:["ctSpawn","bSite"],awp:["ctSpawn","mid"],rifler:["ctSpawn","bSite"],entry:["ctSpawn","bTunnel","bSite"],support:["ctSpawn","bSite"]},smokes:[]},
      {id:"c_aggro",name:"中路前壓",type:"aggro",site:"mid",desc:"搶中路資訊",routes:{igl:["ctSpawn","mid"],awp:["ctSpawn","mid","midDoors"],rifler:["ctSpawn","catwalk"],entry:["ctSpawn","aSite"],support:["ctSpawn","bSite"]},smokes:[]},
    ],
  },
  mirage:{
    t:[
      {id:"t_apalace",name:"A 跳台執行",type:"execute",site:"a",desc:"跳台坡道夾擊",routes:{entry:["tSpawn","palace","aSite"],awp:["tSpawn","ramp"],rifler:["tSpawn","ramp","aSite"],support:["tSpawn","palace","aSite"],lurker:["tSpawn","mid","topMid"]},smokes:["aSite","window"],mollys:[]},
      {id:"t_bapps",name:"B 公寓快攻",type:"execute",site:"b",desc:"公寓煙快下 B",routes:{entry:["tSpawn","apps","bSite"],awp:["tSpawn","mid"],rifler:["tSpawn","apps","bSite"],support:["tSpawn","apps","bSite"],lurker:["tSpawn","mid","connector"]},smokes:["bSite","apps"],mollys:["bSite"]},
      {id:"t_midsplit",name:"中路分推 A",type:"execute",site:"a",desc:"中門坡道分推",routes:{entry:["tSpawn","mid","topMid","aSite"],awp:["tSpawn","mid","window"],rifler:["tSpawn","ramp","aSite"],support:["tSpawn","mid"],lurker:["tSpawn","palace"]},smokes:["window","aSite"],mollys:[]},
    ],
    ct:[
      {id:"c_std",name:"標準防守",type:"default",site:"a",desc:"中路架槍雙線",routes:{igl:["ctSpawn","aSite"],awp:["ctSpawn","window","mid"],rifler:["ctSpawn","aSite","ramp"],entry:["ctSpawn","connector","bSite"],support:["ctSpawn","apps","bSite"]},smokes:[]},
      {id:"c_window",name:"窗口控制",type:"aggro",site:"mid",desc:"窗口中路壓制",routes:{igl:["ctSpawn","window"],awp:["ctSpawn","window","mid"],rifler:["ctSpawn","mid","topMid"],entry:["ctSpawn","aSite"],support:["ctSpawn","bSite"]},smokes:[]},
      {id:"c_bstack",name:"B 公寓堆人",type:"stack",site:"b",desc:"公寓口封鎖",routes:{igl:["ctSpawn","bSite"],awp:["ctSpawn","mid"],rifler:["ctSpawn","apps"],entry:["ctSpawn","connector","bSite"],support:["ctSpawn","bSite"]},smokes:[]},
    ],
  },
  inferno:{
    t:[
      {id:"t_banana",name:"香蕉道強攻",type:"execute",site:"b",desc:"火力封香蕉拿 B",routes:{entry:["tSpawn","tRamp","banana","car","bSite"],awp:["tSpawn","tRamp","banana"],rifler:["tSpawn","tRamp","banana","car","bSite"],support:["tSpawn","apps","boiler","mid"],lurker:["tSpawn","mid","sewer"]},smokes:["bSite","banana"],mollys:["banana"]},
      {id:"t_aexec",name:"A 連接執行",type:"execute",site:"a",desc:"中路連接夾擊 A",routes:{entry:["tSpawn","tRamp","mid","secondMid","aConn","aSite"],awp:["tSpawn","tRamp","mid","secondMid"],rifler:["tSpawn","apps","boiler","mid","aConn","aSite"],support:["tSpawn","apps","boiler","mid","aConn","aSite"],lurker:["tSpawn","tRamp","banana"]},smokes:["aSite","arch"],mollys:["pit"]},
      {id:"t_midctrl",name:"中路控制",type:"default",site:"a",desc:"先拿中路再轉點",routes:{entry:["tSpawn","tRamp","mid","secondMid","aConn","aSite"],awp:["tSpawn","tRamp","mid"],rifler:["tSpawn","tRamp","banana","car"],support:["tSpawn","apps","boiler","mid"],lurker:["tSpawn","mid","sewer"]},smokes:["mid","aConn"],mollys:[]},
    ],
    ct:[
      {id:"c_std",name:"標準防守",type:"default",site:"a",desc:"A 留守 B 鏈接",routes:{igl:["ctSpawn","arch","aConn"],awp:["ctSpawn","library","libIn"],rifler:["ctSpawn","aRamp","aSite"],entry:["ctSpawn","arch","secondMid","mid"],support:["ctSpawn","bTop","bSite"]},smokes:[]},
      {id:"c_astack",name:"A 點堆人",type:"stack",site:"a",desc:"預判 A 集火",routes:{igl:["ctSpawn","aSite","pit"],awp:["ctSpawn","library","aSite"],rifler:["ctSpawn","aRamp","aSite"],entry:["ctSpawn","arch","aConn"],support:["ctSpawn","arch","aConn","mid"]},smokes:[]},
      {id:"c_btop",name:"B 頂前壓",type:"aggro",site:"b",desc:"頂部封鎖 B",routes:{igl:["ctSpawn","arch","aConn"],awp:["ctSpawn","aRamp","aSite"],rifler:["ctSpawn","bTop","bSite"],entry:["ctSpawn","arch","secondMid","mid"],support:["ctSpawn","bTop","bSite"]},smokes:[]},
    ],
  },
};
const TAC_TYPE={execute:{label:"執行",color:"#ef4444"},default:{label:"標準",color:"#5b7fb0"},stack:{label:"堆人",color:"#fbbf24"},aggro:{label:"前壓",color:"#f59e0b"},retake:{label:"回防",color:"#a78bfa"},rush:{label:"強攻",color:"#ec4899"}};

// ─── 模擬引擎（資料/策略核心；已修正曳光彈生命週期）─────────────────────
function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){
  const RS=roster||ROSTER; // 可注入即時名單（含訓練/成長後素質、自訂對手）
  const map=MAPS[mapKey];const rand=mkRng(seed);
  // 碰撞用牆面：建築（含可進入的室內）。地圖小型散件（木箱/油桶/沙包）為低矮裝飾、不阻擋走位，
  // 大型可阻擋設施（車輛）才納入碰撞，避免破壞既有路線平衡。
  const walls=[...map.walls];
  (map.props||[]).forEach(pr=>{if(pr.t==="car")walls.push({x:pr.x-2.0,y:pr.y-1.25,w:4.0,h:2.5,hgt:2,deco:true});});
  // 把節點與出生點校正到可走區域（避免路線指向牆內導致卡牆）
  const N={};for(const k in map.nodes)N[k]=snapOut(map.nodes[k],walls,PLAYER_R);
  const SPAWN={ct:snapOut(map.spawns.ct,walls,PLAYER_R),t:snapOut(map.spawns.t,walls,PLAYER_R)};
  const callouts=map.callouts||[];
  const nearCO=pos=>{let best=null,bd=1e9;for(const c of callouts){const d=Math.hypot(c.x-pos.x,c.y-pos.y);if(d<bd){bd=d;best=c;}}return best?best.l:(pos.x<35?"左路":pos.x>65?"右路":"中路");};
  const frames=[],highlights=[],roundHist=[];
  const ROUNDS=13;let ctScore=0,tScore=0,fi=0;
  // 持續性經濟：金錢、存活保留的槍/甲、連敗計數
  const econ={};RS.forEach(c=>econ[c.id]={money:800,gun:null,armor:false,helmet:false});
  // 跨回合累計的每位選手數據（給賽後 MatchResult / 成長機制 / 數據面板使用）
  const agg={};RS.forEach(c=>agg[c.id]={id:c.id,name:c.name,side:c.side,role:c.fpsRole||c.role,roleKey:c.role,personality:c.personality,k:0,d:0,a:0,dmg:0,hs:0,entry:0,clutch:0,kastR:0,mvpR:0});
  let tLoss=0,ctLoss=0;
  for(let rnd=0;rnd<ROUNDS&&Math.max(ctScore,tScore)<8;rnd++){
    const tac={t:tacticT,ct:tacticCT};const target=tacticT.site;
    const tacEdge=tacticEdge(tacticT,tacticCT); // 戰術剋制（攻守站點 + 類型剪刀石頭布），本回合固定
    // ── 賽前經濟決策（全買 / 強起 / 省錢 / 手槍局）──
    const teamAvg=side=>RS.filter(c=>c.side===side).reduce((s,c)=>s+econ[c.id].money,0)/5;
    const decideBuy=(side,my,en)=>{if(rnd===0)return"pistol";const m=teamAvg(side),behind=en-my;if(m>=4200)return"full";if(m<2200)return"eco";if(behind>=2&&m>=2700)return"force";if(m>=3700)return"full";return"eco";};
    const buyT=decideBuy("t",tScore,ctScore),buyCT=decideBuy("ct",ctScore,tScore);
    const ecoT=buyT==="eco"||buyT==="pistol",ecoCT=buyCT==="eco"||buyCT==="pistol";
    const ARMOR=1000,NADE={flash:200,smoke:300,he:300,molly:400},sidePistol=s=>s==="t"?"glock":"usp";
    let planted=false,c4t=null,c4pos=null,smokes=[],tracers=[],muzzles=[];
    let mollys=[],throwables=[],droppedGuns=[],droppedBomb=null;
    let roundEnd=null,firstKill=false,openKill=null,roundKills={},roundDmg={},roundDeaths={},roundAst={},doorStates={};
    let contactCalled=false,defuseCalled=false,defuseProg=0;
    map.doors.forEach((d,i)=>doorStates[i]=false);
    const ps=RS.map(c=>{
      const e=econ[c.id];const buy=c.side==="t"?buyT:buyCT;const tactic=tac[c.side];const sp=sidePistol(c.side);
      let gun=e.gun,armor=e.armor,helmet=e.helmet,money=e.money,nades=[];
      if(buy==="pistol"){
        gun=sp;
        if(money>=ARMOR){armor=true;helmet=true;money-=ARMOR;}
        if((c.role==="awp"||c.role==="entry")&&money>=700){gun="deagle";money-=700;}
        else if(money>=300&&rand()<0.5){gun="p250";money-=300;}
        if(money>=NADE.flash&&rand()<0.6){nades.push("flash");money-=NADE.flash;}
        if(money>=NADE.smoke&&rand()<0.45){nades.push("smoke");money-=NADE.smoke;}
      }else if(buy==="eco"){
        if(!gun)gun=sp;
        if(!armor&&money>=ARMOR&&rand()<0.25){armor=true;helmet=true;money-=ARMOR;}
        if(gun===sp&&money>=300&&rand()<0.35){gun="p250";money-=300;}
      }else{ // full / force：負擔得起就買最好的，否則退階
        const legal=(ROLE_GUNS[c.role]||["ak"]).filter(g=>c.side==="t"?g!=="m4"&&g!=="m4a4":g!=="ak");
        let bought=null;
        for(const g of legal){const cost=COST[g]??2700;if(money>=cost){bought=g;money-=cost;break;}}
        if(!bought)for(const g of (c.side==="t"?["galil","mp9","tec9"]:["famas","mp9","p250"])){if(money>=(COST[g]||0)){bought=g;money-=COST[g]||0;break;}}
        if(bought)gun=bought;else if(!gun)gun=sp;
        if(!armor&&money>=ARMOR){armor=true;helmet=true;money-=ARMOR;}
        for(const n of ["flash","smoke","he","molly"]){if(money>=NADE[n]&&rand()<0.7){nades.push(n);money-=NADE[n];}}
      }
      e.money=money;
      // 路線指派：戰術未定義該角色時，退回相近角色路線（避免指揮/輔助等留在出生點不參戰）
      const RKF={igl:"rifler",support:"rifler",lurker:"rifler",awp:"rifler",rifler:"entry",entry:"rifler"};
      const tr=tactic.routes||{};
      const routeKeys=tr[c.role]||tr[RKF[c.role]]||tr.rifler||tr.entry||Object.values(tr)[0]||["tSpawn"];
      const route=routeKeys.map(nk=>N[nk]).filter(Boolean);
      const hasBomb=c.side==="t"&&c.role==="entry";
      return{...c,pos:{...SPAWN[c.side==="ct"?"ct":"t"]},prevPos:{...SPAWN[c.side==="ct"?"ct":"t"]},
        hp:100,armor,helmet,money,gun,k:0,d:0,a:0,hsCount:0,dmgDealt:0,dead:false,state:"BUY",va:c.side==="ct"?225:45,flash:0,
        route,routeIdx:0,routeT:0,hasBomb,reassigned:false,picking:0,shooting:0,nades,pistol:sp,buyType:buy};
    });
    for(let sec=0;sec<115;sec+=2){
      const events=[],casts=[],comms=[],buyP=sec<12;const prog=buyP?0:clamp((sec-12)/90,0,1);
      const aliveT=ps.filter(p=>p.side==="t"&&!p.dead),aliveCT=ps.filter(p=>p.side==="ct"&&!p.dead);
      if(sec===12){
        const tIgl=ps.find(p=>p.side==="t"&&p.role==="igl")||aliveT[0];
        const cIgl=ps.find(p=>p.side==="ct"&&p.role==="igl")||aliveCT[0];
        if(tIgl)comms.push({side:"t",name:tIgl.name,text:tacticT.site==="a"?"預設打 A，控好中路跟我節奏":"下 B！香蕉壓上，記得丟煙"});
        if(cIgl)comms.push({side:"ct",name:cIgl.name,text:tacticCT.site==="a"?"A 雙人守，注意中路 timing":"B 留一個，其餘抓資訊"});
      }
      // 先老化上一 tick 的槍火，讓本 tick 新生的曳光彈/槍口閃光能存入快照
      tracers=tracers.map(t=>({...t,tl:t.tl-1})).filter(t=>t.tl>0);
      muzzles=muzzles.map(m=>({...m,tl:m.tl-1})).filter(m=>m.tl>0);
      ps.forEach(p=>{
        p.flash=Math.max(0,p.flash-1);p.shooting=Math.max(0,p.shooting-1);p.prevPos={...p.pos};p.picking=Math.max(0,p.picking-1);
        if(p.dead)return;
        if(buyP){const sp=SPAWN[p.side==="ct"?"ct":"t"];const h=hsh(p.id);
          if(!p._off)p._off={x:((h%5)-2)*1.7,y:(((h>>4)%5)-2)*1.7};
          p.pos=collideResolve({x:sp.x+p._off.x+Math.sin(sec*0.55+h*0.11)*0.6,y:sp.y+p._off.y+Math.cos(sec*0.5+h*0.13)*0.6},walls,PLAYER_R);p.state="BUY";return;}
        // 龜縮/撤退：素質保守（進攻性低）且殘血者，遇敵會後撤而非硬拚
        {const en=ps.filter(e=>!e.dead&&e.side!==p.side);
         const near=en.length?en.reduce((a,b)=>dist(b.pos,p.pos)<dist(a.pos,p.pos)?b:a):null;
         const mates=(p.side==="t"?aliveT:aliveCT).length;
         if(near&&!buyP&&dist(near.pos,p.pos)<32&&p.hp<48&&aggr(p)<0.82&&mates>1){
           const dx=p.pos.x-near.pos.x,dy=p.pos.y-near.pos.y,L=Math.hypot(dx,dy)||1;
           p.pos=safeMove(p.pos,{x:p.pos.x+dx/L*3.2,y:p.pos.y+dy/L*3.2},walls,PLAYER_R);
           p.va=Math.atan2(near.pos.y-p.pos.y,near.pos.x-p.pos.x)*180/Math.PI;p.state="撤退";return;
         }}
        if(p.routeIdx<p.route.length-1){
          const wp=p.route[p.routeIdx],tgt=p.route[p.routeIdx+1];
          const segLen=Math.max(2,dist(wp,tgt));
          const spd=4.8+(p.sta?(p.sta-82)*0.025:0); // 依比例尺校正的跑動速度（約 4.4–5.2 單位/tick ≈ 真實體感）
          p.routeT+=spd/segLen;
          if(p.routeT>=1){p.routeT=0;p.routeIdx++;}
          const wp2=p.route[p.routeIdx],tgt2=p.route[Math.min(p.routeIdx+1,p.route.length-1)];
          const aim=vl(wp2,tgt2,p.routeT);
          let des=vl(p.pos,aim,0.85);
          const stp=dist(des,p.pos),maxStep=spd*1.3;if(stp>maxStep)des=vl(p.pos,des,maxStep/stp);
          const moved=safeMove(p.pos,des,walls,PLAYER_R);
          if(dist(moved,p.pos)<0.35){p.routeT=Math.min(1,p.routeT+(dist(p.pos,tgt2)<7?0.2:0.1));p._stuckN=(p._stuckN||0)+1;if(p._stuckN>2&&p.routeIdx<p.route.length-1){p.routeIdx++;p.routeT=0;p._stuckN=0;}}else p._stuckN=0; // 卡住時推進/跳下個航點，避免被設施擋死
          p.pos=moved;
          const dx=tgt2.x-p.pos.x,dy=tgt2.y-p.pos.y;if(Math.hypot(dx,dy)>0.5)p.va=Math.atan2(dy,dx)*180/Math.PI;
          p.state=p.routeIdx<p.route.length-2?"ROTATE":"EXECUTE";
        }else{
          // 路線走完仍無接觸：T 方推進至炸彈點/包點匯入戰鬥（避免狙擊/指揮在後方空轉整局）
          const threatNear=ps.find(e=>!e.dead&&e.side!==p.side&&dist(e.pos,p.pos)<40);
          if(p.side==="t"&&!threatNear&&prog>0.4&&!p._pushed){
            const goal=(planted&&c4pos)?c4pos:N[target==="a"?"aSite":"bSite"];
            if(goal&&dist(p.pos,goal)>10){p._pushed=true;const via=N[target==="a"?"aConn":"car"];p.route=via&&dist(p.pos,via)>8&&!planted?[{...p.pos},via,goal]:[{...p.pos},goal];p.routeIdx=0;p.routeT=0;p.state="EXECUTE";}
          }
          p.state=planted?(p.side==="ct"?"RETAKE":"ANCHOR"):"HOLD";
          if(!p._hold)p._hold={x:p.pos.x,y:p.pos.y};
          const threat=threatNear;
          if(threat){const dx=threat.pos.x-p.pos.x,dy=threat.pos.y-p.pos.y;p.va=Math.atan2(dy,dx)*180/Math.PI;p.state="架槍";}
          else if(rand()<0.25){p.va+=(rand()-0.5)*30;}
          const h=hsh(p.id);const hx=p._hold.x+Math.sin(sec*0.5+h*0.1)*1.1,hy=p._hold.y+Math.cos(sec*0.45+h*0.17)*1.1;
          let hp2=vl(p.pos,{x:hx,y:hy},0.3);const hst=dist(hp2,p.pos);if(hst>2.0)hp2=vl(p.pos,hp2,2.0/hst);
          p.pos=collideResolve(hp2,walls,PLAYER_R); // 平滑且受限的待機微動
        }
        map.doors.forEach((d,i)=>{if(!doorStates[i]&&dist(p.pos,{x:d.x,y:d.y})<6){doorStates[i]=true;events.push({type:"door",idx:i,label:d.label});}});
        if(p.picking<=0&&["glock","usp"].includes(p.gun)){const near=droppedGuns.find(g=>dist(g.pos,p.pos)<5);if(near){p.gun=near.gun;p.picking=20;droppedGuns=droppedGuns.filter(g=>g.id!==near.id);casts.push(`🔫 ${p.name} 撿起 ${GUNS[near.gun].name}`);}}
        if(droppedBomb&&p.side==="t"&&dist(droppedBomb.pos,p.pos)<5){p.hasBomb=true;droppedBomb=null;casts.push(`💣 ${p.name} 撿起炸彈，繼續執行`);}
        if(p.state==="EXECUTE"&&p.nades?.length>0&&rand()<0.06){
          const nt=p.nades[0];p.nades=p.nades.slice(1);
          const enemy=ps.find(e=>!e.dead&&e.side!==p.side&&dist(e.pos,p.pos)<30);
          const land=enemy?{x:lerp(p.pos.x,enemy.pos.x,0.85),y:lerp(p.pos.y,enemy.pos.y,0.85)}:{x:clamp(p.pos.x+(rand()-0.5)*14,5,95),y:clamp(p.pos.y+(rand()-0.5)*14,5,95)};
          throwables.push({id:`nd${fi}${p.id}`,type:nt,side:p.side,from:{...p.pos},to:land,t:0,flying:true,detonate:false});
          if(nt==="flash"&&enemy)enemy.flash=Math.max(enemy.flash,4);
          if(nt==="flash")casts.push(`⚡ ${p.name} 丟出閃光彈`);else if(nt==="he")casts.push(`💥 ${p.name} 高爆彈攻擊`);
        }
      });
      if(sec===18)(tacticT.smokes||[]).forEach(sk=>{const n=N[sk];if(n)smokes.push({id:`s${rnd}${sk}`,pos:{...n},tl:18,age:0});});
      if(sec===24)(tacticT.mollys||[]).forEach(mk=>{const n=N[mk];if(n)mollys.push({id:`m${rnd}${mk}`,pos:{...n},tl:8});});
      if(prog>0.15&&aliveT.length&&aliveCT.length){
        let pairs=[];aliveT.forEach(tp=>aliveCT.forEach(cp=>{const d=dist(tp.pos,cp.pos);if(d<55&&!lineBlocked(tp.pos,cp.pos,walls)&&!smokeBlocks(tp.pos,cp.pos,smokes))pairs.push([tp,cp,d]);}));
        // 排序用「有效距離」：狙擊架點專長遠距 → 加權使其搶得到交火名額（避免狙擊整局零參與）
        const effD=pr=>pr[2]*((GUNS[pr[0].gun]?.cls==="狙擊"||GUNS[pr[1].gun]?.cls==="狙擊")?0.45:1);
        pairs.sort((a,b)=>effD(a)-effD(b));
        // 狙擊 pair 優先且不佔一般交火名額 → 確保狙擊架點先手能開火（避免狙擊整局零參與）
        const isSniperPair=pr=>GUNS[pr[0].gun]?.cls==="狙擊"||GUNS[pr[1].gun]?.cls==="狙擊";
        const ordered=[...pairs].sort((a,b)=>{const sa=isSniperPair(a),sb=isSniperPair(b);if(sa!==sb)return sa?-1:1;return effD(a)-effD(b);});
        const usedT=new Set(),usedCT=new Set();
        const maxEngage=Math.min(pairs.length,Math.max(2,Math.ceil((aliveT.length+aliveCT.length)/3)));
        let done=0;
        for(const[tp,cp,d] of ordered){
          const sniperInvolved=isSniperPair([tp,cp]);
          if(!sniperInvolved&&done>=maxEngage)break;
          if(tp.dead||cp.dead||usedT.has(tp.id)||usedCT.has(cp.id))continue;
          let fireChance=d<15?0.85:d<30?0.55:(sniperInvolved?0.55:0.3);
          fireChance*=(0.55+0.5*Math.max(aggr(tp),aggr(cp))); // 進攻性影響交火意願（雙方都龜縮→少對槍）
          if(rand()>=fireChance)continue;
          usedT.add(tp.id);usedCT.add(cp.id);if(!sniperInvolved)done++; // 狙擊不計入一般名額
          if(!contactCalled){contactCalled=true;const spotter=cp;comms.push({side:spotter.side,name:spotter.name,text:`${nearCO(tp.pos)} 有人，${aliveT.length} 個！`});}
          // 對槍勝負由雙方 16 項素質 + 武器 + 情境決定（非隨機）
          const tHold=(tp.state==="架槍"||tp.state==="HOLD"),cHold=(cp.state==="架槍"||cp.state==="HOLD");
          const tSk=combatSkill(tp,{holding:tHold,entry:tp.role==="entry"&&!tHold,lurk:tp.role==="lurker"&&tHold,lastAlive:aliveT.length===1,lowHP:tp.hp<40});
          const cSk=combatSkill(cp,{holding:cHold,entry:cp.role==="entry"&&!cHold,lurk:cp.role==="lurker"&&cHold,lastAlive:aliveCT.length===1,lowHP:cp.hp<40});
          const ecoEdge=(ecoCT&&!ecoT)?0.16:(ecoT&&!ecoCT)?-0.16:0;
          const flashPen=(tp.flash>0?-0.12:0)+(cp.flash>0?0.12:0);
          const Pt=clamp(0.5+(tSk-cSk)*0.013+(MAP_EDGE[mapKey]??0.02)+ecoEdge+flashPen+tacEdge,0.07,0.93); // 結構平衡 + 戰術剋制
          const tw=rand()<Pt;const at=tw?tp:cp,df=tw?cp:tp;
          const g=GUNS[at.gun];const isHS=rand()<g.hs*(0.72+0.55*((at.stats?.acc||80)/100));let dmg=(g.dmg+Math.floor(rand()*40))*(isHS?2:1);
          if(df.armor&&!isHS)dmg*=0.72; // 護甲減傷（非爆頭）
          dmg=Math.round(dmg);
          if(!df._hitters)df._hitters=[];if(!df._hitters.includes(at.id))df._hitters.push(at.id);
          df.hp-=dmg;at.dmgDealt=(at.dmgDealt||0)+dmg;roundDmg[at.id]=(roundDmg[at.id]||0)+dmg;at.flash=3;df.flash=3;at.state="ENGAGE";df.state="ENGAGE";at.shooting=df.hp<=0?1:2;
          tracers.push({id:`tr${fi}${sec}${at.id}`,from:{...at.pos},to:{x:df.pos.x,y:df.pos.y},tl:2,color:at.side==="ct"?"#7dd3fc":"#fdba74",hit:true,sniper:g.cls==="狙擊"});
          muzzles.push({id:`mz${fi}${at.id}`,pos:{...at.pos},side:at.side,tl:2,big:g.cls==="狙擊",cls:g.cls,kill:df.hp<=0});
          if(df.hp<=0){df.dead=true;df.hp=0;at.k++;df.d++;if(isHS)at.hsCount++;at.money+=killReward(at.gun);roundKills[at.id]=(roundKills[at.id]||0)+1;roundDeaths[df.id]=1;
            (df._hitters||[]).forEach(id=>{if(id!==at.id){const ap=ps.find(x=>x.id===id);if(ap){ap.a++;roundAst[id]=(roundAst[id]||0)+1;}}}); // 助攻
            if(!["glock","usp"].includes(df.gun))droppedGuns.push({id:`dg${fi}${df.id}`,gun:df.gun,pos:{...df.pos}});
            if(df.hasBomb&&!planted){df.hasBomb=false;droppedBomb={pos:{...df.pos}};casts.push(`💣 炸彈掉落！`);}
            const isFirst=!firstKill;firstKill=true;if(isFirst)openKill={id:at.id,side:at.side};
            events.push({type:"kill",killerId:at.id,killer:at.name,killerSide:at.side,victim:df.name,gun:at.gun,hs:isHS,pos:{...df.pos},firstKill:isFirst});
            const rk=roundKills[at.id];
            if(rk>=2){const ml={2:"雙殺",3:"三殺",4:"四殺",5:"團滅"};events.push({type:"multikill",player:at.name,side:at.side,count:rk,label:ml[Math.min(rk,5)]});highlights.push({fi,label:`${at.name} ${ml[Math.min(rk,5)]}`});}
            if(isHS)casts.push(`💀 ${at.name} 爆頭擊殺 ${df.name}！`);else if(isFirst)casts.push(`🔫 ${at.name} 取得首殺，拿下開局優勢`);else if(d<12)casts.push(`${at.name} 近距離擊殺 ${df.name}`);else if(g.cls==="狙擊")casts.push(`🎯 ${at.name} 一槍狙掉 ${df.name}`);else if(rand()<0.4)casts.push(`${at.name} 擊殺 ${df.name}`);
            if(rand()<0.4)comms.push({side:at.side,name:at.name,text:rk>=2?"清掉了，跟上！":isHS?"爆頭收掉":`收一個，剩 ${df.side==="t"?aliveT.length-1:aliveCT.length-1} 個`});
            const sameTeam=ps.filter(x=>x.side===df.side&&!x.dead&&!x.reassigned);
            if(sameTeam.length&&rand()<0.6){const taker=sameTeam[0];taker.reassigned=true;const goal=df.side==="t"?N[target==="a"?"aSite":"bSite"]:df.pos;if(goal){taker.route=[taker.pos,goal];taker.routeIdx=0;taker.routeT=0;casts.push(`🔄 ${taker.name} 接管 ${df.name} 的位置`);}}
          }else if(df.hp<35&&rand()<0.25){comms.push({side:df.side,name:df.name,text:"我殘血，先撤一下"});}
        }
      }
      if(!planted&&prog>0.4){
        const sitePos=N[target==="a"?"aSite":"bSite"];const carrier=ps.find(p=>p.side==="t"&&!p.dead&&p.hasBomb);
        if(carrier){
          const endsNear=carrier.route.length&&dist(carrier.route[carrier.route.length-1],sitePos)<10;
          if(!endsNear&&dist(carrier.pos,sitePos)>8){const ap=N[target==="a"?"aConn":"car"];carrier.route=ap?[carrier.pos,ap,sitePos]:[carrier.pos,sitePos];carrier.routeIdx=0;carrier.routeT=0;}
          if(dist(carrier.pos,sitePos)<9){const ctNear=aliveCT.filter(cp=>dist(cp.pos,sitePos)<13&&!lineBlocked(carrier.pos,cp.pos,walls)).length;const canPlant=(ctNear===0&&rand()<0.55)||(ctNear<=1&&aliveT.length>aliveCT.length&&rand()<0.18);if(canPlant){planted=true;c4pos={...sitePos};c4t=20;carrier.hasBomb=false;carrier.state="安裝中";carrier.money+=300;casts.push(`💣 ${carrier.name} 安裝炸彈！`);highlights.push({fi,label:`R${rnd+1} 炸彈安裝`});
            comms.push({side:"t",name:carrier.name,text:`包下了，${target==="a"?"A":"B"} 點，全員交叉！`});const cov=aliveT.find(x=>x.id!==carrier.id);if(cov)comms.push({side:"t",name:cov.name,text:"收到，我架槍"});
            const cd=aliveCT[0];if(cd)comms.push({side:"ct",name:cd.name,text:`${target==="a"?"A":"B"} 響了，全員回防拆彈！`});
            // 炸彈安裝後：所有存活警察立刻往包點移動（回防 / 拆彈）
            const appr=target==="a"?N.aConn:N.bTop;
            aliveCT.forEach(cp=>{cp.reassigned=false;cp.route=appr&&dist(cp.pos,appr)>6?[{...cp.pos},appr,{...c4pos}]:[{...cp.pos},{...c4pos}];cp.routeIdx=0;cp.routeT=0;cp.state="RETAKE";});}}
        }
      }
      smokes=smokes.map(s=>({...s,tl:s.tl-1,age:(s.age||0)+1})).filter(s=>s.tl>0);
      mollys=mollys.map(m=>({...m,tl:m.tl-1})).filter(m=>m.tl>0);
      throwables=throwables.map(tw=>{if(tw.flying){tw.t+=0.25;if(tw.t>=1){tw.flying=false;tw.detonate=true;tw.boom=3;
        if(tw.type==="flash"){ps.forEach(pl=>{if(pl.dead)return;const d=dist(pl.pos,tw.to);if(d<24&&!lineBlocked(pl.pos,tw.to,walls)){const enemy=pl.side!==tw.side;pl.flash=Math.max(pl.flash,enemy?(d<12?6:4):(d<8?3:0));}});}
      }}else if(tw.detonate){tw.boom--;}return tw;}).filter(tw=>tw.flying||tw.boom>0);
      if(planted&&c4t!==null){c4t--;
        // 警察必須真的抵達包點且無匪徒壓制，才會累積拆彈進度（受專注力/決策影響）
        const defuser=aliveCT.find(cp=>dist(cp.pos,c4pos)<6);
        const contested=defuser&&aliveT.some(tp=>dist(tp.pos,c4pos)<9&&!lineBlocked(tp.pos,defuser.pos,walls));
        if(defuser&&!contested){defuser.state="拆彈中";defuser.va=Math.atan2(c4pos.y-defuser.pos.y,c4pos.x-defuser.pos.x)*180/Math.PI;
          defuseProg+=defuser.stats?(0.45+defuser.stats.foc/250+defuser.stats.dec/300):0.7;
          if(!defuseCalled){defuseCalled=true;comms.push({side:"ct",name:defuser.name,text:"我拆，掩護我！"});}}
        if(defuseProg>=3.5)roundEnd={winner:"ct",how:"defuse"};
        else if(c4t<=0)roundEnd={winner:"t",how:"bomb"};
      }
      if(!roundEnd){
        if(aliveT.length===0&&!planted)roundEnd={winner:"ct",how:"elim"};
        else if(aliveCT.length===0)roundEnd={winner:"t",how:planted?"bomb":"elim"};
        else if(sec>=114)roundEnd={winner:planted?"t":"ct",how:planted?"bomb":"time"};
      }
      frames.push({fi,ts:rnd*120+sec,rnd,roundSec:sec,target,planted,buyP,c4t:c4t!==null?Math.ceil(c4t):null,c4pos:c4pos?{...c4pos}:null,
        players:ps.map(p=>({...p,pos:{...p.pos},prevPos:{...p.prevPos}})),
        smokes:smokes.map(s=>({...s})),mollys:mollys.map(m=>({...m})),tracers:tracers.map(t=>({...t})),muzzles:muzzles.map(m=>({...m})),
        throwables:throwables.map(tw=>({...tw,from:{...tw.from},to:{...tw.to}})),droppedGuns:droppedGuns.map(g=>({...g})),droppedBomb:droppedBomb?{...droppedBomb}:null,doorStates:{...doorStates},
        events,casts,comms,ctScore,tScore,roundHist:[...roundHist],ecoT,ecoCT});
      fi++;if(roundEnd)break;
    }
    if(!roundEnd)roundEnd={winner:"ct",how:"time"};
    if(roundEnd.winner==="ct")ctScore++;else tScore++;
    const _rnds=rnd+1;
    const _rs=ps.map(p=>({name:p.name,side:p.side,role:p.fpsRole||p.role,k:roundKills[p.id]||0,d:roundDeaths[p.id]||0,a:roundAst[p.id]||0,dmg:Math.round(roundDmg[p.id]||0),adr:Math.round((p.dmgDealt||0)/_rnds),tk:p.k,td:p.d,ta:p.a})).sort((a,b)=>(b.k*100+b.dmg)-(a.k*100+a.dmg));
    roundHist.push({winner:roundEnd.winner,how:roundEnd.how,mvp:_rs[0]&&(_rs[0].k>0||_rs[0].dmg>0)?_rs[0]:null,top:_rs.slice(0,4),tS:tScore,cS:ctScore});
    // ── 跨回合累計每位選手數據 ──
    {
      const wn=roundEnd.winner;
      const mvpName=_rs[0]&&(_rs[0].k>0||_rs[0].dmg>0)?_rs[0].name:null;
      const winSurv=ps.filter(x=>x.side===wn&&!x.dead);           // 勝方殘存者
      const clutchId=(winSurv.length===1&&(roundKills[winSurv[0].id]||0)>=1)?winSurv[0].id:null; // 1打多殘局
      if(openKill)agg[openKill.id].entry++;                        // 開局擊殺
      RS.forEach(c=>{const p=ps.find(x=>x.id===c.id);const A=agg[c.id];
        A.k+=roundKills[c.id]||0;A.d+=roundDeaths[c.id]||0;A.a+=roundAst[c.id]||0;
        A.dmg+=Math.round(roundDmg[c.id]||0);A.hs+=p?(p.hsCount||0):0;
        // KAST：本回合有 擊殺/助攻/存活 之一即算
        if((roundKills[c.id]||0)>0||(roundAst[c.id]||0)>0||!roundDeaths[c.id])A.kastR++;
        if(c.id===clutchId)A.clutch++;
        if(c.name===mvpName)A.mvpR++;
      });
    }
    // ── 回合經濟結算（勝負獎金、連敗補助、種包補助、存活保留武器）──
    const winner=roundEnd.winner;
    if(winner==="t"){tLoss=0;ctLoss=Math.min(ctLoss+1,5);}else{ctLoss=0;tLoss=Math.min(tLoss+1,5);}
    const LB=[1400,1900,2400,2900,3400];
    RS.forEach(c=>{const e=econ[c.id];const p=ps.find(x=>x.id===c.id);
      e.money=p?p.money:e.money;                       // 帶入本回合剩餘（含擊殺獎勵）
      const won=c.side===winner;
      e.money+= won?3250:(LB[Math.min((c.side==="t"?tLoss:ctLoss),5)-1]||1400);
      if(c.side==="t"&&planted&&!won)e.money+=800;      // 種包補助
      e.money=clamp(Math.round(e.money),0,16000);
      if(p&&!p.dead){e.gun=p.gun;e.armor=p.armor;e.helmet=p.helmet;} // 存活保留
      else{e.gun=null;e.armor=false;e.helmet=false;}
    });
  }
  // ── 賽後每位選手綜合數據 ──
  const _R=Math.max(1,ctScore+tScore);
  const players=RS.map(c=>{const A=agg[c.id];
    const kpr=A.k/_R,dpr=A.d/_R,apr=A.a/_R,adr=A.dmg/_R,kast=A.kastR/_R*100;
    const rating=Math.max(0,+(0.4+0.7*kpr+0.2*apr+0.0045*adr+0.003*kast-0.55*dpr).toFixed(3));
    return{id:A.id,name:A.name,side:A.side,role:A.role,roleKey:A.roleKey,personality:A.personality,
      k:A.k,d:A.d,a:A.a,adr:Math.round(adr),hs:A.hs,hsPct:A.k?Math.round(A.hs/A.k*100):0,
      kast:Math.round(kast),mvpRounds:A.mvpR,clutches:A.clutch,entryKills:A.entry,utilDmg:0,rating};
  });
  const mvp=[...players].sort((a,b)=>b.rating-a.rating||b.k-a.k)[0]||null;
  return{frames,highlights,roundHist,ctScore,tScore,mapKey,players,mvp,rounds:_R};
}

// ── 組裝賽後結果（給主遊戲的 recordMatch / 賽後成長 / 數據面板）──────────
// T = 我方（德國海豹）視角。fanGain/prizeGain/xpGain 由主遊戲填入。
function buildMatchResult(sim,opts={}){
  const{tacticT,tacticCT,tName="德國海豹",ctName="Compulsary",date=null}=opts;
  const win=sim.tScore>sim.ctScore;
  const ourPlayers=sim.players.filter(p=>p.side==="t");
  const theirPlayers=sim.players.filter(p=>p.side==="ct");
  const ourMvp=[...ourPlayers].sort((a,b)=>b.rating-a.rating||b.k-a.k)[0]||null;
  const topFraggers=[...sim.players].sort((a,b)=>b.k-a.k).slice(0,3);
  return{
    id:"cs_"+Date.now()+"_"+Math.floor(Math.random()*1e4),mode:"CS",map:sim.mapKey,date,
    win,scoreT:sim.tScore,scoreCT:sim.ctScore,tName,ctName,
    tactic:{ours:tacticT?.name||null,theirs:tacticCT?.name||null,ourType:tacticT?.type||null,theirType:tacticCT?.type||null},
    players:sim.players,ourPlayers,theirPlayers,
    mvp:sim.mvp,ourMvp,topFraggers,
    rounds:sim.roundHist,roundCount:sim.rounds,
    fanGain:0,prizeGain:0,xpGain:0,
  };
}

// ─── 色彩 ────────────────────────────────────────────────────────────────
const C={bg:"#070a10",panel:"#0d1119",panel2:"#141a26",ct:"#38bdf8",ctL:"#a7e0ff",ctD:"#0b2942",t:"#fb923c",tL:"#fed7aa",tD:"#3a2410",gold:"#fbbf24",green:"#34d399",red:"#f87171",gray:"#8a8f9c",gray2:"#5a606e",line:"rgba(255,255,255,0.08)"};
let T_NAME="德國海豹",CT_NAME="Compulsary"; // 嵌入時可由元件依 props 覆寫
const sideColor=s=>s==="ct"?C.ct:C.t;

// ─── Canvas 紋理產生器（一次性建立，供 Three 使用）───────────────────────
function makeFloorTexture(map){
  const S=1024,cv=document.createElement("canvas");cv.width=cv.height=S;const x=cv.getContext("2d");
  x.fillStyle=map.floor;x.fillRect(0,0,S,S);
  // 砂地噪點
  const img=x.getImageData(0,0,S,S),d=img.data;
  for(let i=0;i<d.length;i+=4){const n=(Math.random()-0.5)*22;d[i]=clamp(d[i]+n,0,255);d[i+1]=clamp(d[i+1]+n,0,255);d[i+2]=clamp(d[i+2]+n*0.8,0,255);}
  x.putImageData(img,0,0);
  // 細格線
  x.strokeStyle="rgba(255,255,255,0.035)";x.lineWidth=1;
  for(let i=0;i<=S;i+=S/20){x.beginPath();x.moveTo(i,0);x.lineTo(i,S);x.moveTo(0,i);x.lineTo(S,i);x.stroke();}
  // 邊緣暗角
  const g=x.createRadialGradient(S/2,S/2,S*0.32,S/2,S/2,S*0.72);g.addColorStop(0,"rgba(0,0,0,0)");g.addColorStop(1,"rgba(0,0,0,0.55)");
  x.fillStyle=g;x.fillRect(0,0,S,S);
  const tex=new THREE.CanvasTexture(cv);tex.encoding=THREE.sRGBEncoding;tex.anisotropy=4;return tex;
}
function makeRadialSprite(stops,size=128){
  const cv=document.createElement("canvas");cv.width=cv.height=size;const x=cv.getContext("2d");
  const g=x.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);stops.forEach(([o,c])=>g.addColorStop(o,c));
  x.fillStyle=g;x.fillRect(0,0,size,size);
  const tex=new THREE.CanvasTexture(cv);return tex;
}
function makeStarSprite(size=128){
  const cv=document.createElement("canvas");cv.width=cv.height=size;const x=cv.getContext("2d");const c=size/2;
  const g=x.createRadialGradient(c,c,0,c,c,c);g.addColorStop(0,"rgba(255,255,255,1)");g.addColorStop(0.25,"rgba(255,244,200,0.95)");g.addColorStop(0.55,"rgba(251,191,36,0.5)");g.addColorStop(1,"rgba(251,146,60,0)");
  x.fillStyle=g;x.fillRect(0,0,size,size);
  x.strokeStyle="rgba(255,250,220,0.9)";x.lineWidth=size*0.035;x.lineCap="round";
  for(let i=0;i<4;i++){const a=i*Math.PI/2;x.beginPath();x.moveTo(c,c);x.lineTo(c+Math.cos(a)*c*0.92,c+Math.sin(a)*c*0.92);x.stroke();}
  const tex=new THREE.CanvasTexture(cv);return tex;
}
function makeLabelSprite(text,color="rgba(235,235,225,0.85)",font=44,bg=null){
  const pad=14,f=`700 ${font}px system-ui,-apple-system,sans-serif`;
  const m=document.createElement("canvas").getContext("2d");m.font=f;const w=Math.ceil(m.measureText(text).width)+pad*2,h=font+pad*1.4;
  const cv=document.createElement("canvas");cv.width=w;cv.height=h;const x=cv.getContext("2d");
  if(bg){x.fillStyle=bg;const r=10;x.beginPath();x.moveTo(r,0);x.arcTo(w,0,w,h,r);x.arcTo(w,h,0,h,r);x.arcTo(0,h,0,0,r);x.arcTo(0,0,w,0,r);x.fill();}
  x.font=f;x.textBaseline="middle";x.textAlign="center";
  x.shadowColor="rgba(0,0,0,0.9)";x.shadowBlur=6;x.fillStyle=color;x.fillText(text,w/2,h/2);
  const tex=new THREE.CanvasTexture(cv);tex.encoding=THREE.sRGBEncoding;return{tex,w,h};
}
function makeBigLetter(letter,color){
  const S=256,cv=document.createElement("canvas");cv.width=cv.height=S;const x=cv.getContext("2d");
  x.font=`900 200px system-ui`;x.textAlign="center";x.textBaseline="middle";
  x.fillStyle=color;x.fillText(letter,S/2,S/2+8);
  const tex=new THREE.CanvasTexture(cv);tex.encoding=THREE.sRGBEncoding;return tex;
}

/* ═══════════════════════════════════════════════════════════════════════
   FpsScene3D — Three.js 渲染層
   ═══════════════════════════════════════════════════════════════════════ */
function FpsScene3D({mapKey,liveRef,onSelectPlayer,onRecenterRef}){
  const mountRef=useRef(null);
  const stateRef=useRef(null); // 保存 three 物件，跨 effect 共用

  // 世界座標轉換：地圖 (x,y)∈[0,100] → 世界 (x-50, z=y-50)，高度 z*H
  const HSCALE=0.92;
  const W=useMemo(()=>({
    vx:x=>x-50, vz:y=>y-50, vy:z=>z*HSCALE,
  }),[]);

  // ── 初始化 renderer / scene / camera（只做一次）──
  useEffect(()=>{
    const mount=mountRef.current;if(!mount)return;
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"high-performance"});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    renderer.outputEncoding=THREE.sRGBEncoding;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.08;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x05070c,1);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display="block";renderer.domElement.style.width="100%";renderer.domElement.style.height="100%";renderer.domElement.style.cursor="grab";

    const scene=new THREE.Scene();
    scene.fog=new THREE.Fog(0x070b12,150,360);

    const camera=new THREE.PerspectiveCamera(42,1,0.1,600);
    // 球座標運鏡（phi 自天頂、theta 方位）
    const cam={theta:-Math.PI*0.62,phi:Math.PI*0.30,radius:88,tgt:new THREE.Vector3(0,3,0),
               dTheta:-Math.PI*0.62,dPhi:Math.PI*0.30,dRadius:88,dTgt:new THREE.Vector3(0,3,0),autoFollow:true};

    // ── 光照 ──
    scene.add(new THREE.AmbientLight(0x4a5878,0.55));
    const hemi=new THREE.HemisphereLight(0x9fb4d8,0x2a2418,0.7);scene.add(hemi);
    const sun=new THREE.DirectionalLight(0xfff0d0,1.55);
    sun.position.set(46,80,30);sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048);
    const sc=sun.shadow.camera;sc.left=-70;sc.right=70;sc.top=70;sc.bottom=-70;sc.near=10;sc.far=220;sun.shadow.bias=-0.0004;sun.shadow.normalBias=0.5;
    scene.add(sun);
    const rim=new THREE.DirectionalLight(0x4060a0,0.4);rim.position.set(-40,30,-50);scene.add(rim);

    // ── 共用幾何/紋理 ──
    const tex={
      flash:makeStarSprite(),
      smoke:makeRadialSprite([[0,"rgba(225,228,235,0.9)"],[0.45,"rgba(200,205,214,0.55)"],[1,"rgba(180,186,196,0)"]]),
      fire:makeRadialSprite([[0,"rgba(255,246,180,0.95)"],[0.35,"rgba(255,150,40,0.8)"],[0.7,"rgba(220,60,20,0.35)"],[1,"rgba(120,20,0,0)"]]),
      glow:makeRadialSprite([[0,"rgba(255,255,255,0.9)"],[1,"rgba(255,255,255,0)"]]),
    };
    const sphereGeo=new THREE.SphereGeometry(1,16,12);
    const beamGeo=new THREE.BoxGeometry(1,1,1); // 沿 +X 的單位盒，縮放為光束

    // 群組
    const worldGroup=new THREE.Group();scene.add(worldGroup);   // 靜態：地板/建築/箱/招牌
    const routeGroup=new THREE.Group();scene.add(routeGroup);   // 路線疊加
    const playerGroup=new THREE.Group();scene.add(playerGroup); // 10 名選手
    const fxGroup=new THREE.Group();scene.add(fxGroup);         // 槍火/煙/火/投擲/炸彈

    stateRef.current={renderer,scene,camera,cam,sun,tex,sphereGeo,beamGeo,worldGroup,routeGroup,playerGroup,fxGroup,
      players:[],pools:{},raycastTargets:[],running:true,lastT:0,time:0,disposables:[]};

    // ── 互動：拖曳旋轉 / 滾輪縮放 / 觸控 ──
    const el=renderer.domElement;let drag=null,pinch=null;
    const panBy=(dx,dy,s,th,tx,tz)=>{const sinT=Math.sin(th),cosT=Math.cos(th),rx=cosT,rz=-sinT,fx=-sinT,fz=-cosT;cam.dTgt.x=clamp(tx-dx*s*rx-dy*s*fx,-74,74);cam.dTgt.z=clamp(tz-dx*s*rz-dy*s*fz,-74,74);};
    const onDown=e=>{const p=e.touches?e.touches[0]:e;const wantPan=(!e.touches)&&(e.button===2||e.shiftKey);
      const chasing=!!(stateRef.current._chase&&stateRef.current._chase.alive);
      if(!chasing){cam.autoFollow=false;cam.overview=false;}
      drag=wantPan?{pan:true,x:p.clientX,y:p.clientY,tx:cam.dTgt.x,tz:cam.dTgt.z,th:cam.dTheta,r:cam.dRadius}:{pan:false,x:p.clientX,y:p.clientY,th:cam.dTheta,ph:cam.dPhi,chasing,cy:cam.chaseYaw||0,cp:cam.chasePitch||0};
      el.style.cursor=wantPan?"move":"grabbing";};
    const onMove=e=>{if(!drag)return;const p=e.touches?e.touches[0]:e;
      if(drag.pan)panBy(p.clientX-drag.x,p.clientY-drag.y,drag.r*0.0018,drag.th,drag.tx,drag.tz);
      else if(drag.chasing){cam.chaseYaw=drag.cy-(p.clientX-drag.x)*0.006;cam.chasePitch=clamp(drag.cp-(p.clientY-drag.y)*0.005,-0.55,0.78);} // 追焦時：單指環繞選手
      else{cam.dTheta=drag.th-(p.clientX-drag.x)*0.0055;cam.dPhi=clamp(drag.ph-(p.clientY-drag.y)*0.0055,0.1,1.5);}};
    const onUp=()=>{drag=null;pinch=null;el.style.cursor="grab";};
    const onWheel=e=>{e.preventDefault();cam.autoFollow=false;cam.dRadius=clamp(cam.dRadius*(e.deltaY>0?1.1:0.9),18,200);};
    const onTouchStart=e=>{cam.autoFollow=false;if(e.touches.length===2){drag=null;const[a,b]=e.touches;pinch={d:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),r:cam.dRadius,cx:(a.clientX+b.clientX)/2,cy:(a.clientY+b.clientY)/2,tx:cam.dTgt.x,tz:cam.dTgt.z,th:cam.dTheta};}else onDown(e);};
    const onTouchMove=e=>{e.preventDefault();
      if(e.touches.length===2&&pinch){const[a,b]=e.touches;const d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);cam.dRadius=clamp(pinch.r*pinch.d/Math.max(1,d),18,200);
        const cx=(a.clientX+b.clientX)/2,cy=(a.clientY+b.clientY)/2;panBy(cx-pinch.cx,cy-pinch.cy,cam.dRadius*0.0018,pinch.th,pinch.tx,pinch.tz);}
      else onMove(e);};
    el.addEventListener("contextmenu",e=>e.preventDefault());
    // 點擊選取選手
    const ray=new THREE.Raycaster();const ndc=new THREE.Vector2();let downPt=null;
    const onClickDown=e=>{const p=e.touches?e.touches[0]:e;downPt={x:p.clientX,y:p.clientY};};
    const onClickUp=e=>{
      if(!downPt)return;const p=e.changedTouches?e.changedTouches[0]:e;
      if(Math.hypot(p.clientX-downPt.x,p.clientY-downPt.y)>6){downPt=null;return;}
      const r=el.getBoundingClientRect();ndc.x=((p.clientX-r.left)/r.width)*2-1;ndc.y=-((p.clientY-r.top)/r.height)*2+1;
      ray.setFromCamera(ndc,camera);
      const hits=ray.intersectObjects(stateRef.current.raycastTargets,true);
      if(hits.length){let o=hits[0].object;while(o&&!o.userData.pid)o=o.parent;if(o&&o.userData.pid){onSelectPlayer&&onSelectPlayer(o.userData.pid);}}
      else onSelectPlayer&&onSelectPlayer(null);
      downPt=null;
    };
    el.addEventListener("mousedown",e=>{onDown(e);onClickDown(e);});
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",e=>{onUp();onClickUp(e);});
    el.addEventListener("wheel",onWheel,{passive:false});
    el.addEventListener("touchstart",e=>{onTouchStart(e);onClickDown(e);},{passive:false});
    el.addEventListener("touchmove",onTouchMove,{passive:false});
    el.addEventListener("touchend",e=>{onUp();onClickUp(e);});

    if(onRecenterRef)onRecenterRef.current=()=>{cam.autoFollow=true;cam.overview=true;cam._ovBase=null;cam.chaseYaw=0;cam.chasePitch=0;};

    // ── 尺寸自適應 ──
    const resize=()=>{const w=mount.clientWidth||1,h=mount.clientHeight||1;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};
    resize();const ro=new ResizeObserver(resize);ro.observe(mount);

    // ── 主迴圈：播放時鐘 + 插值 + 渲染 ──
    const animate=t=>{
      const st=stateRef.current;if(!st||!st.running)return;
      st.raf=requestAnimationFrame(animate);
      const dt=st.lastT?Math.min(0.05,(t-st.lastT)/1000):0;st.lastT=t;st.time+=dt;
      const live=liveRef.current;if(!live||!live.sim){renderer.render(scene,camera);return;}
      // 播放時鐘（在渲染迴圈推進，避免每幀觸發 React 重繪）
      const sim=live.sim,total=sim.frames.length;
      if(live.seekNonce!==st.seekNonce){st.seekNonce=live.seekNonce;st.subT=0;}
      if(st.subT==null)st.subT=0;
      if(live.playing){st.subT+=dt*live.speed*0.5;while(st.subT>=1){st.subT-=1;live.advance&&live.advance();}}
      const fIdx=Math.min(live.fIdx,total-1);
      const frame=sim.frames[fIdx];const nf=sim.frames[Math.min(fIdx+1,total-1)];
      const sub=live.playing?clamp(st.subT,0,1):0;
      if(frame)updateDynamic(st,frame,nf,sub,live,W);
      updateCamera(st,frame,sub,dt,W);
      renderer.render(scene,camera);
    };
    st_start();
    function st_start(){const st=stateRef.current;st.running=true;st.raf=requestAnimationFrame(animate);}

    return()=>{
      const st=stateRef.current;if(st)st.running=false;
      cancelAnimationFrame(st?.raf);
      ro.disconnect();
      window.removeEventListener("mousemove",onMove);
      try{mount.removeChild(renderer.domElement);}catch(e){}
      renderer.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // ── 依地圖重建靜態世界 + 重置選手/特效池 ──
  useEffect(()=>{
    const st=stateRef.current;if(!st)return;
    const {scene,worldGroup,playerGroup,fxGroup,routeGroup,tex,sphereGeo}=st;
    const map=MAPS[mapKey];
    st.wallRects=map.walls.filter(w=>(w.hgt||7)>=5).map(w=>({x0:W.vx(w.x),z0:W.vz(w.y),x1:W.vx(w.x+w.w),z1:W.vz(w.y+w.h)}));
    st.mapWalls=map.walls;

    // 清空既有（保留共用紋理/幾何，其餘釋放）
    const SHARED=new Set([sphereGeo,st.beamGeo,tex.flash,tex.smoke,tex.fire,tex.glow]);
    const disp=o=>{
      if(o.geometry&&!SHARED.has(o.geometry))o.geometry.dispose?.();
      const mm=Array.isArray(o.material)?o.material:(o.material?[o.material]:[]);
      mm.forEach(m=>{if(!m)return;if(m.map&&!SHARED.has(m.map))m.map.dispose?.();m.dispose?.();});
    };
    const clear=g=>{for(let i=g.children.length-1;i>=0;i--){const c=g.children[i];c.traverse(disp);g.remove(c);}};
    clear(worldGroup);clear(playerGroup);clear(fxGroup);clear(routeGroup);
    st.raycastTargets=[];

    // 地板
    if(st.floorTex)st.floorTex.dispose?.();
    st.floorTex=makeFloorTexture(map);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.MeshStandardMaterial({map:st.floorTex,roughness:0.97,metalness:0.0}));
    floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;floor.position.y=0;worldGroup.add(floor);
    // 地板外框光帶
    const ring=new THREE.Mesh(new THREE.RingGeometry(70,72,64),new THREE.MeshBasicMaterial({color:0x1b2740,side:THREE.DoubleSide,transparent:true,opacity:0.5}));
    ring.rotation.x=-Math.PI/2;ring.position.y=0.02;worldGroup.add(ring);

    // 立面貼圖（程序產生窗戶/門，依面尺寸快取）
    const ptIn=(x,y)=>map.walls.some(o=>x>o.x&&x<o.x+o.w&&y>o.y&&y<o.y+o.h);
    const facadeCache={};
    const getFacade=(cols,rows,door,variant)=>{
      const key=cols+"_"+rows+"_"+door+"_"+variant;if(facadeCache[key])return facadeCache[key];
      const cw=80,ch=88,W2=cols*cw,H2=rows*ch+ch,cv=document.createElement("canvas");cv.width=W2;cv.height=H2;const x=cv.getContext("2d");
      const base=variant===0?"#b8945c":variant===1?"#a9854c":"#c3a065";x.fillStyle=base;x.fillRect(0,0,W2,H2);
      x.fillStyle="rgba(0,0,0,0.05)";for(let yy=0;yy<H2;yy+=22)x.fillRect(0,yy,W2,2);
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const wx=c*cw+cw*0.24,wy=r*ch+ch*0.2,ww=cw*0.52,wh=ch*0.54;
        x.fillStyle="#5a4322";x.fillRect(wx-5,wy-5,ww+10,wh+10);
        const lit=((r*7+c*3+variant*5)%5===0);x.fillStyle=lit?"#ffd382":"#28323e";x.fillRect(wx,wy,ww,wh);
        x.strokeStyle="#37290f";x.lineWidth=3;x.beginPath();x.moveTo(wx+ww/2,wy);x.lineTo(wx+ww/2,wy+wh);x.moveTo(wx,wy+wh/2);x.lineTo(wx+ww,wy+wh/2);x.stroke();
        if(lit){x.fillStyle="rgba(255,214,130,0.22)";x.fillRect(wx-3,wy-3,ww+6,wh+6);}}
      const by=rows*ch;x.fillStyle="rgba(0,0,0,0.14)";x.fillRect(0,by,W2,3);
      if(door){const dw=cw*0.66,dh=ch*0.84,dx=W2/2-dw/2,dy=by+ch-dh;x.fillStyle="#48341a";x.fillRect(dx-6,dy-6,dw+12,dh+8);x.fillStyle="#231a0c";x.fillRect(dx,dy,dw,dh);x.fillStyle="#160f07";x.fillRect(dx+5,dy+5,dw-10,dh-5);x.fillStyle="#c9a24a";x.fillRect(dx+dw*0.7,dy+dh*0.5,5,8);}
      const tex=new THREE.CanvasTexture(cv);tex.encoding=THREE.sRGBEncoding;tex.anisotropy=4;facadeCache[key]=tex;return tex;
    };
    // 建築（盒體 + 立面 + 屋頂/女兒牆 + 邊緣）
    const baseCol=new THREE.Color(map.accent);
    const roofCol=new THREE.Color(map.accent).offsetHSL(0,0.06,-0.2);
    st.fadeWalls=[];
    map.walls.forEach((w,i)=>{
      const h=W.vy(w.hgt);const cx=W.vx(w.x+w.w/2),cz=W.vz(w.y+w.h/2);
      const col=baseCol.clone().offsetHSL(0,0,(i%5-2)*0.016);
      const geo=new THREE.BoxGeometry(w.w,h,w.h);
      const mat=new THREE.MeshStandardMaterial({color:col,roughness:0.93,metalness:0.02,flatShading:true});
      const mesh=new THREE.Mesh(geo,mat);mesh.position.set(cx,h/2,cz);mesh.castShadow=true;mesh.receiveShadow=true;worldGroup.add(mesh);
      const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geo),new THREE.LineBasicMaterial({color:0x0a0d14,transparent:true,opacity:0.5}));
      edges.position.copy(mesh.position);worldGroup.add(edges);
      const wMats=[{m:mat,base:1},{m:edges.material,base:0.5}];
      if(w.win){
        const faces=[{cxw:w.x+w.w/2,cyw:w.y,nx:0,nz:-1,len:w.w,rot:Math.PI},{cxw:w.x+w.w/2,cyw:w.y+w.h,nx:0,nz:1,len:w.w,rot:0},{cxw:w.x,cyw:w.y+w.h/2,nx:-1,nz:0,len:w.h,rot:-Math.PI/2},{cxw:w.x+w.w,cyw:w.y+w.h/2,nx:1,nz:0,len:w.h,rot:Math.PI/2}];
        let doorPlaced=false;
        faces.forEach(f=>{if(f.len<5)return;if(ptIn(f.cxw+f.nx*0.8,f.cyw+f.nz*0.8))return;
          const cols=clamp(Math.round(f.len/4),1,5),rows=clamp(Math.round(w.hgt/3),1,3);
          const wantDoor=!doorPlaced&&f.len>=6;if(wantDoor)doorPlaced=true;
          const tex=getFacade(cols,rows,wantDoor?1:0,i%3);
          const fmat=new THREE.MeshStandardMaterial({map:tex,roughness:0.9,metalness:0.0,side:THREE.DoubleSide});
          const plane=new THREE.Mesh(new THREE.PlaneGeometry(f.len*0.98,h*0.99),fmat);
          plane.position.set(W.vx(f.cxw)+f.nx*0.07,h/2,W.vz(f.cyw)+f.nz*0.07);plane.rotation.y=f.rot;worldGroup.add(plane);wMats.push({m:fmat,base:1});});
      }
      if(w.roof==="pitch"){
        const peak=Math.min(w.w,w.h)*0.45;const rm=new THREE.MeshStandardMaterial({color:roofCol,roughness:0.82,flatShading:true});
        const roof=new THREE.Mesh(new THREE.ConeGeometry(0.5,1,4),rm);roof.scale.set(w.w*1.32,peak,w.h*1.32);roof.rotation.y=Math.PI/4;roof.position.set(cx,h+peak/2,cz);roof.castShadow=true;worldGroup.add(roof);wMats.push({m:rm,base:1});
      }else{
        const topMat=new THREE.MeshStandardMaterial({color:col.clone().offsetHSL(0,0,-0.05),roughness:0.92});
        const top=new THREE.Mesh(new THREE.PlaneGeometry(w.w*0.9,w.h*0.9),topMat);
        top.rotation.x=-Math.PI/2;top.position.set(cx,h+0.05,cz);worldGroup.add(top);wMats.push({m:topMat,base:1});
        const ph=0.55,pm=new THREE.MeshStandardMaterial({color:col.clone().offsetHSL(0,0,0.05),roughness:0.9,flatShading:true});
        [[w.w,0.5,0,w.h/2-0.25],[w.w,0.5,0,-(w.h/2-0.25)],[0.5,w.h,w.w/2-0.25,0],[0.5,w.h,-(w.w/2-0.25),0]].forEach(([pw,pd,ox,oz])=>{const b=new THREE.Mesh(new THREE.BoxGeometry(pw,ph,pd),pm);b.position.set(cx+ox,h+ph/2,cz+oz);b.castShadow=true;worldGroup.add(b);});wMats.push({m:pm,base:1});
      }
      st.fadeWalls.push({rect:{x0:W.vx(w.x),z0:W.vz(w.y),x1:W.vx(w.x+w.w),z1:W.vz(w.y+w.h)},mats:wMats,cur:1});
    });
    // 道具：木箱 / 油桶 / 沙包 / 車 / 平台
    const addCrate=(X,Z)=>{const s=2.7,h=W.vy(1.5);const m=new THREE.Mesh(new THREE.BoxGeometry(s,h,s),new THREE.MeshStandardMaterial({color:0x6b4f2c,roughness:0.95,flatShading:true}));m.position.set(X,h/2,Z);m.castShadow=true;m.receiveShadow=true;worldGroup.add(m);const e=new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry),new THREE.LineBasicMaterial({color:0x2a1d0e,transparent:true,opacity:0.6}));e.position.copy(m.position);worldGroup.add(e);};
    (map.crates||[]).forEach(c=>addCrate(W.vx(c.x),W.vz(c.y)));
    (map.props||[]).forEach(p=>{const X=W.vx(p.x),Z=W.vz(p.y);
      if(p.t==="barrel"){const m=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.1,2.6,12),new THREE.MeshStandardMaterial({color:0x7a3b2a,roughness:0.7,metalness:0.25,flatShading:true}));m.position.set(X,1.3,Z);m.castShadow=true;worldGroup.add(m);const r=new THREE.Mesh(new THREE.TorusGeometry(1.13,0.09,6,12),new THREE.MeshStandardMaterial({color:0x33170f}));r.rotation.x=Math.PI/2;r.position.set(X,1.7,Z);worldGroup.add(r);}
      else if(p.t==="sandbag"){const a=p.a||0;const m=new THREE.Mesh(new THREE.BoxGeometry(3.4,1.3,1.7),new THREE.MeshStandardMaterial({color:0x6f6444,roughness:1,flatShading:true}));m.position.set(X,0.65,Z);m.rotation.y=a;m.castShadow=true;worldGroup.add(m);const m2=new THREE.Mesh(new THREE.BoxGeometry(3.0,1.2,1.5),new THREE.MeshStandardMaterial({color:0x7c704e,roughness:1,flatShading:true}));m2.position.set(X,1.75,Z);m2.rotation.y=a+0.25;m2.castShadow=true;worldGroup.add(m2);}
      else if(p.t==="car"){const a=p.a||0;const body=new THREE.Mesh(new THREE.BoxGeometry(6,1.7,2.9),new THREE.MeshStandardMaterial({color:0x365a4a,roughness:0.45,metalness:0.35,flatShading:true}));body.position.set(X,1.05,Z);body.rotation.y=a;body.castShadow=true;worldGroup.add(body);const cab=new THREE.Mesh(new THREE.BoxGeometry(3,1.3,2.5),new THREE.MeshStandardMaterial({color:0x294a3c,roughness:0.4,metalness:0.3,flatShading:true}));cab.position.set(X,2.4,Z);cab.rotation.y=a;cab.castShadow=true;worldGroup.add(cab);const e=new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry),new THREE.LineBasicMaterial({color:0x14241c}));e.position.copy(body.position);e.rotation.copy(body.rotation);worldGroup.add(e);}
      else if(p.t==="plat"){const m=new THREE.Mesh(new THREE.BoxGeometry(7,1.3,7),new THREE.MeshStandardMaterial({color:baseCol.clone().offsetHSL(0,0,-0.07),roughness:0.9,flatShading:true}));m.position.set(X,0.65,Z);m.castShadow=true;m.receiveShadow=true;worldGroup.add(m);const e=new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry),new THREE.LineBasicMaterial({color:0x0a0d14,transparent:true,opacity:0.5}));e.position.copy(m.position);worldGroup.add(e);}
      else addCrate(X,Z);
    });
    // 炸彈點 A/B 標記（地面紅環 + 大字）
    ["a","b"].forEach(k=>{const s=map.sites[k];if(!s)return;
      const zone=new THREE.Mesh(new THREE.RingGeometry(5.2,7.2,40),new THREE.MeshBasicMaterial({color:0xef4444,transparent:true,opacity:0.32,side:THREE.DoubleSide}));
      zone.rotation.x=-Math.PI/2;zone.position.set(W.vx(s.x),0.05,W.vz(s.y));worldGroup.add(zone);
      const fill=new THREE.Mesh(new THREE.CircleGeometry(5.2,40),new THREE.MeshBasicMaterial({color:0xef4444,transparent:true,opacity:0.08,side:THREE.DoubleSide}));
      fill.rotation.x=-Math.PI/2;fill.position.set(W.vx(s.x),0.04,W.vz(s.y));worldGroup.add(fill);
      const letTex=makeBigLetter(k.toUpperCase(),"rgba(248,113,113,0.55)");letTex.__keep=false;
      const let3=new THREE.Mesh(new THREE.PlaneGeometry(6,6),new THREE.MeshBasicMaterial({map:letTex,transparent:true}));
      let3.rotation.x=-Math.PI/2;let3.position.set(W.vx(s.x),0.06,W.vz(s.y));worldGroup.add(let3);
    });
    // 地名（平貼地面，可由 HUD 開關）
    st.calloutSprites=[];
    (map.callouts||[]).forEach(c=>{
      const {tex:lt,w,h}=makeLabelSprite(c.l,"rgba(220,224,214,0.6)",36);
      const m=new THREE.Mesh(new THREE.PlaneGeometry(w/14,h/14),new THREE.MeshBasicMaterial({map:lt,transparent:true,depthWrite:false}));
      m.rotation.x=-Math.PI/2;m.position.set(W.vx(c.x),0.07,W.vz(c.y));worldGroup.add(m);st.calloutSprites.push(m);
    });

    // ── 選手（10 名，固定池）──
    st.players=ACTIVE_ROSTER.map(p=>{
      const col=new THREE.Color(p.side==="ct"?0x39a9e6:0xf08a3c);
      const g=new THREE.Group();g.userData.pid=p.id;g.userData.side=p.side;
      // 地面光環
      const ringMat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.85,side:THREE.DoubleSide});ringMat.__keep=true;
      const ring=new THREE.Mesh(new THREE.RingGeometry(0.62,0.92,28),ringMat);ring.rotation.x=-Math.PI/2;ring.position.y=0.05;g.add(ring);
      const discMat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.18,side:THREE.DoubleSide});discMat.__keep=true;
      const disc=new THREE.Mesh(new THREE.CircleGeometry(0.62,24),discMat);disc.rotation.x=-Math.PI/2;disc.position.y=0.045;g.add(disc);
      // 身體（會依視角轉向的子群；+X 為瞄準方向）
      const body=new THREE.Group();
      const torsoMat=new THREE.MeshStandardMaterial({color:col,roughness:0.55,metalness:0.1,emissive:col,emissiveIntensity:0.18});torsoMat.__keep=true;
      const torso=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.4,1.0,14),torsoMat);torso.position.y=0.62;torso.castShadow=true;body.add(torso);
      const headMat=new THREE.MeshStandardMaterial({color:0xd8b48a,roughness:0.7});headMat.__keep=true;
      const head=new THREE.Mesh(new THREE.SphereGeometry(0.26,16,12),headMat);head.position.y=1.26;head.castShadow=true;body.add(head);
      const helmMat=new THREE.MeshStandardMaterial({color:col.clone().offsetHSL(0,0,-0.12),roughness:0.5,metalness:0.2});helmMat.__keep=true;
      const helm=new THREE.Mesh(new THREE.SphereGeometry(0.29,14,10,0,Math.PI*2,0,Math.PI*0.55),helmMat);helm.position.y=1.32;body.add(helm);
      // 手臂（袖子同隊色）+ 手（膚色），擺出持槍前伸姿態
      const limb=(p0,p1,r,m)=>{const a=new THREE.Vector3(p0[0],p0[1],p0[2]),b=new THREE.Vector3(p1[0],p1[1],p1[2]),d=new THREE.Vector3().subVectors(b,a),len=Math.max(0.01,d.length());const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,8),m);mesh.position.copy(a).add(b).multiplyScalar(0.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize());mesh.castShadow=true;return mesh;};
      const sleeveMat=new THREE.MeshStandardMaterial({color:col.clone().offsetHSL(0,0,-0.05),roughness:0.6,metalness:0.08});sleeveMat.__keep=true;
      const handMat=new THREE.MeshStandardMaterial({color:0xcaa078,roughness:0.7});handMat.__keep=true;
      body.add(limb([0.04,1.0,-0.16],[0.46,0.86,0.02],0.075,sleeveMat)); // 右臂（扳機手）
      body.add(limb([0.04,1.0,0.16],[0.82,0.92,0.05],0.075,sleeveMat));  // 左臂（前護木）
      const hR=new THREE.Mesh(new THREE.SphereGeometry(0.09,8,6),handMat);hR.position.set(0.48,0.86,0.02);body.add(hR);
      const hL=new THREE.Mesh(new THREE.SphereGeometry(0.09,8,6),handMat);hL.position.set(0.84,0.92,0.05);body.add(hL);
      // 步槍（前方持握，多部件）
      const gun=new THREE.Group();
      const metalMat=new THREE.MeshStandardMaterial({color:0x23262e,roughness:0.45,metalness:0.55});metalMat.__keep=true;
      const polyMat=new THREE.MeshStandardMaterial({color:0x15171c,roughness:0.7,metalness:0.2});polyMat.__keep=true;
      const recv=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.13,0.13),metalMat);recv.position.set(0.6,0.92,0.04);gun.add(recv);
      const barrel=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.06,0.06),metalMat);barrel.position.set(1.02,0.93,0.04);gun.add(barrel);
      const guard=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.1,0.1),polyMat);guard.position.set(0.8,0.89,0.04);gun.add(guard);
      const stock=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.13,0.1),polyMat);stock.position.set(0.3,0.9,0.04);gun.add(stock);
      const mag=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.3,0.12),polyMat);mag.position.set(0.56,0.74,0.04);mag.rotation.z=0.18;gun.add(mag);
      const sight=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.09,0.05),metalMat);sight.position.set(0.62,1.0,0.04);gun.add(sight);
      body.add(gun);
      // 架槍視線（沿瞄準方向的細光線，顯示選手正在架住的角度）
      const aimMat=new THREE.MeshBasicMaterial({color:p.side==="ct"?0x7dd3fc:0xfdba74,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});aimMat.__keep=true;
      const aimLine=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.02,9,6),aimMat);aimLine.rotation.z=Math.PI/2;aimLine.position.set(1.1+4.5,0.95,0.04);body.add(aimLine);
      g.add(body);
      // 選中柱
      const beamMat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.0,blending:THREE.AdditiveBlending,depthWrite:false});beamMat.__keep=true;
      const selBeam=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.14,7,8),beamMat);selBeam.position.y=3.5;g.add(selBeam);
      // 血條（實體 3D 長條，billboard 面向相機，量條會明顯縮短）
      const hpBg=new THREE.Mesh(new THREE.BoxGeometry(1.42,0.24,0.09),new THREE.MeshBasicMaterial({color:0x080b12,depthTest:false}));
      const hpFill=new THREE.Mesh(new THREE.BoxGeometry(1.3,0.16,0.12),new THREE.MeshBasicMaterial({color:0x34d399,depthTest:false}));
      hpBg.renderOrder=10;hpFill.renderOrder=11;hpFill.position.z=0.03;
      const hpGroup=new THREE.Group();hpGroup.add(hpBg);hpGroup.add(hpFill);hpGroup.position.y=2.02;g.add(hpGroup);
      // 名牌（billboard，靜態紋理）
      const {tex:nt,w:nw,h:nh}=makeLabelSprite(p.name,p.side==="ct"?"rgba(190,228,255,0.95)":"rgba(255,214,170,0.95)",34,"rgba(8,11,18,0.6)");
      const nameSpr=new THREE.Sprite(new THREE.SpriteMaterial({map:nt,transparent:true,depthTest:false}));
      nameSpr.scale.set(nw/30,nh/30,1);nameSpr.position.y=2.5;nameSpr.userData.base={x:nw/30,y:nh/30};g.add(nameSpr);
      // 死亡地面標記（隊色 X，方便縱觀戰場）
      const deadMat=new THREE.MeshBasicMaterial({color:p.side==="ct"?0x2f6f96:0x9c5a2a,transparent:true,opacity:0.0,side:THREE.DoubleSide,depthWrite:false});deadMat.__keep=true;
      const dead=new THREE.Group();
      [-1,1].forEach(s=>{const bar=new THREE.Mesh(new THREE.PlaneGeometry(1.7,0.26),deadMat);bar.rotation.x=-Math.PI/2;bar.rotation.z=s*Math.PI/4;dead.add(bar);});
      dead.position.y=0.06;g.add(dead);

      playerGroup.add(g);
      g.traverse(o=>{o.frustumCulled=false;if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(mm=>{mm.fog=false;});}}); // 選手不受霧/視錐裁切影響，避免拉遠/縮放/邊緣時消失
      return {id:p.id,side:p.side,role:p.role,col,g,body,torso,torsoMat,head,gun,ring,ringMat,disc,selBeam,beamMat,hpGroup,hpFill,nameSpr,dead,deadMat,aimLine,aimMat};
    });
    st.raycastTargets=st.players.map(p=>p.g);

    // ── 特效池 ──
    const mkPool=(n,make)=>{const arr=[];for(let i=0;i<n;i++){const o=make();o.visible=false;fxGroup.add(o);arr.push(o);}return arr;};
    st.pools={
      tracer:mkPool(80,()=>new THREE.Mesh(st.beamGeo,new THREE.MeshBasicMaterial({color:0xfde047,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}))),
      muzzle:mkPool(16,()=>new THREE.Sprite(new THREE.SpriteMaterial({map:tex.flash,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}))),
      smoke:mkPool(7*6,()=>new THREE.Mesh(sphereGeo,new THREE.MeshStandardMaterial({color:0xd5d8df,transparent:true,opacity:0,roughness:1,metalness:0,depthWrite:false}))),
      fire:mkPool(8*7,()=>new THREE.Sprite(new THREE.SpriteMaterial({map:tex.fire,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}))),
      nade:mkPool(28,()=>new THREE.Mesh(sphereGeo,new THREE.MeshStandardMaterial({color:0x2a2e36,roughness:0.6,emissive:0x000000}))),
      boom:mkPool(8,()=>new THREE.Sprite(new THREE.SpriteMaterial({map:tex.glow,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}))),
      drop:mkPool(12,()=>new THREE.Mesh(new THREE.BoxGeometry(0.7,0.16,0.16),new THREE.MeshStandardMaterial({color:0xc9a24a,emissive:0x3a2c10,emissiveIntensity:0.6,roughness:0.5}))),
      spark:mkPool(24,()=>new THREE.Sprite(new THREE.SpriteMaterial({map:tex.glow,color:0xfff1c0,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}))),
    };
    // 槍口閃光點光（共用，循環）
    st.flashLights=[0,1,2].map(()=>{const l=new THREE.PointLight(0xffe6a0,0,14,2);l.visible=false;scene.add(l);return l;});
    st.flashIdx=0;
    // 炸彈信標
    const bombMat=new THREE.MeshStandardMaterial({color:0xef4444,emissive:0xef4444,emissiveIntensity:1.2,roughness:0.4});bombMat.__keep=true;
    const bomb=new THREE.Mesh(new THREE.BoxGeometry(0.7,0.7,0.7),bombMat);
    const bombRingMat=new THREE.MeshBasicMaterial({color:0xef4444,transparent:true,opacity:0.6,side:THREE.DoubleSide});bombRingMat.__keep=true;
    const bombRing=new THREE.Mesh(new THREE.RingGeometry(0.9,1.15,28),bombRingMat);bombRing.rotation.x=-Math.PI/2;bombRing.position.y=0.06;
    const bombGrp=new THREE.Group();bomb.position.y=0.4;bombGrp.add(bomb);bombGrp.add(bombRing);bombGrp.visible=false;fxGroup.add(bombGrp);
    const bombLight=new THREE.PointLight(0xff3030,0,18,2);bombGrp.add(bombLight);
    st.bomb={grp:bombGrp,mat:bombMat,ring:bombRing,ringMat:bombRingMat,light:bombLight,box:bomb};

    st.mapReady=true;st.seekNonce=-1;st.subT=0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[mapKey]);

  return <div ref={mountRef} style={{position:"absolute",inset:0,touchAction:"none"}}/>;
}

// ── 每幀更新：選手 + 特效（插值）──
const _q=new THREE.Quaternion(),_vA=new THREE.Vector3(),_vB=new THREE.Vector3(),_dir=new THREE.Vector3(),_xAxis=new THREE.Vector3(1,0,0);
function updateDynamic(st,frame,nf,sub,live,W){
  const time=st.time;const showLabels=live.showLabels!==false;
  // 地名顯隱
  if(st.calloutSprites)st.calloutSprites.forEach(s=>{s.visible=showLabels;});

  // 選手
  const fmap={};frame.players.forEach(p=>fmap[p.id]=p);
  const nmap={};(nf?nf.players:[]).forEach(p=>nmap[p.id]=p);
  st.players.forEach(P=>{
    const p=fmap[P.id];if(!p){P.g.visible=false;return;}
    P.g.visible=true;
    const np=nmap[P.id];const sameRound=nf&&frame&&nf.rnd===frame.rnd;
    let x=p.pos.x,y=p.pos.y,va=p.va;
    if(np&&sameRound&&!p.dead&&!np.dead){x=lerp(p.pos.x,np.pos.x,sub);y=lerp(p.pos.y,np.pos.y,sub);va=lerpAngle(p.va,np.va,sub);}
    P.g.position.set(W.vx(x),0,W.vz(y));
    const sel=live.selected===P.id;
    if(p.dead){
      P.body.visible=false;P.hpGroup.visible=false;P.nameSpr.visible=false;P.selBeam.visible=false;
      P.deadMat.opacity=0.8;P.ringMat.opacity=0.0;P.disc.visible=false;
      P.dead.scale.setScalar(clamp(st.cam.radius/55,0.85,2.0)); // 死亡地面 X，遠看清楚
    }else{
      P.body.visible=true;P.disc.visible=true;P.deadMat.opacity=0;
      // 轉向（+X 對齊視角方向）
      P.body.rotation.y=-va*Math.PI/180;
      // 移動/掃視微動（呼吸感）
      const moving=p.state==="ROTATE"||p.state==="EXECUTE";
      const bob=Math.sin(time*(moving?9:3)+P.id.charCodeAt(2))*0.025*(moving?1.4:0.6);
      // 架槍：靜止持槍狀態下身體微蹲、視線光束顯現（看得出在架住角度）
      const aiming=p.state==="架槍"||p.state==="ENGAGE"||(!moving&&p.state==="HOLD");
      P.body.position.y=bob-(aiming?0.12:0);
      if(P.aimMat){const fire=p.shooting>0;P.aimMat.opacity=aiming?(fire?0.85:0.34+0.12*Math.sin(time*6+P.id.charCodeAt(2))):0;P.aimLine.visible=aiming;}
      // 血量 → 環/身體色 + 血條
      const hpR=clamp(p.hp/100,0,1);
      P.ringMat.opacity=sel?1:0.8;
      P.hpGroup.visible=true;P.nameSpr.visible=showLabels;
      P.hpGroup.quaternion.copy(st.camera.quaternion); // billboard 面向相機
      const dCam=st.camera.position.distanceTo(P.g.position); // 依與相機距離維持固定螢幕大小
      // 受擊掉血：偵測血量下降 → 白條閃 + 身體泛紅 + 血條彈一下
      if(P._prevHp==null)P._prevHp=p.hp;
      if(p.hp<P._prevHp-0.5)P._dmg=1;P._prevHp=p.hp;
      const dmg=P._dmg||0;
      P.hpGroup.scale.setScalar(clamp(dCam/26,1.0,4.2)*(1+0.4*dmg)); // 近看也夠大、遠看放大
      if(P.nameSpr.userData.base){const ns=clamp(dCam/46,0.5,3.2),b=P.nameSpr.userData.base;P.nameSpr.scale.set(b.x*ns,b.y*ns,1);} // 名牌不再近看爆大
      P.hpFill.scale.x=Math.max(0.02,hpR);P.hpFill.position.x=-(1.3*(1-hpR))/2;
      P.hpFill.material.color.setHex(dmg>0.12?0xffffff:(hpR>0.5?0x34d399:hpR>0.25?0xfbbf24:0xf87171));
      if(!P._emBase&&P.torsoMat.emissive)P._emBase=P.torsoMat.emissive.clone();
      if(P.torsoMat.emissive){if(dmg>0.12){P.torsoMat.emissive.setRGB(0.95*dmg,0.04,0.04);P.torsoMat.emissiveIntensity=0.95;}
        else{P._emBase&&P.torsoMat.emissive.copy(P._emBase);P.torsoMat.emissiveIntensity=p.shooting>0?0.6:0.18;}}
      P._dmg=Math.max(0,dmg-0.06);
      // 持包/接管 環脈動
      if(p.hasBomb){P.ringMat.color.setHex(0xfbbf24);P.ringMat.opacity=0.6+0.4*Math.abs(Math.sin(time*5));}
      else P.ringMat.color.copy(P.col);
      // 選中：放大環 + 光柱
      P.selBeam.visible=sel;P.beamMat.opacity=sel?(0.25+0.15*Math.sin(time*4)):0;
      P.ring.scale.setScalar(sel?1.35:1);
    }
  });

  // 特效池工具
  const usePool=(arr)=>{let i=0;return{next:()=>arr[i++],done:()=>{for(;i<arr.length;i++)arr[i].visible=false;}};};

  // 曳光彈：快速竄出的子彈光條（自槍口高速射出並衝出畫面）+ 彈著火花
  {const it=usePool(st.pools.tracer);const sp=usePool(st.pools.spark);
   (frame.tracers||[]).forEach(tr=>{const m=it.next();if(!m)return;
     _vA.set(W.vx(tr.from.x),0.95,W.vz(tr.from.y));_vB.set(W.vx(tr.to.x),0.95,W.vz(tr.to.y));
     const len=_vA.distanceTo(_vB);if(len<0.1){m.visible=false;return;}
     _dir.copy(_vB).sub(_vA).normalize();_q.setFromUnitVectors(_xAxis,_dir);
     const mdx=tr.to.x-tr.from.x,mdy=tr.to.y-tr.from.y,mlen=Math.hypot(mdx,mdy)||1; // 地圖座標與世界 X/Z 為 1:1
     const cap=Math.min(mlen*2.4,95);
     const pathLen=st.mapWalls?Math.min(rayWallDist(tr.from.x,tr.from.y,mdx/mlen,mdy/mlen,st.mapWalls,cap),cap):cap; // 子彈到牆面即止，不穿建築
     const hash=((parseInt((tr.id||"0").replace(/\D/g,"").slice(-5)||"1",10))%101)/101;
     const streak=Math.min(pathLen*0.42,15);                   // 光條長度（細而快的單一彈道）
     const s=((time*3.4+hash)%1)*(pathLen+streak);             // 沿路徑高速前進（更快）
     const head=clamp(s,0,pathLen),tail=clamp(s-streak,0,pathLen),segLen=head-tail;
     if(segLen<1.2){m.visible=false;return;}
     m.position.copy(_dir).multiplyScalar((head+tail)/2).add(_vA);m.quaternion.copy(_q);
     const th=tr.hit?0.12:0.08;m.scale.set(segLen,th,th);
     m.material.color.set(tr.color);m.material.opacity=tr.hit?1.0:0.82;m.visible=true;
     if(tr.hit){const k=sp.next();if(k){k.position.set(W.vx(tr.to.x),1.0,W.vz(tr.to.y));const pf=0.5+0.5*Math.sin(time*38+hash*9);k.scale.setScalar(1.1+0.8*pf);k.material.opacity=0.5+0.45*pf;k.visible=true;}}
   });it.done();sp.done();}

  // 槍口閃光（sprite + 循環點光）
  {const it=usePool(st.pools.muzzle);let lit=0;
   (frame.muzzles||[]).forEach(mz=>{const s=it.next();if(!s)return;
     s.position.set(W.vx(mz.pos.x),0.95,W.vz(mz.pos.y));
     const sc=(mz.big?1.7:1.0)*(0.8+0.5*Math.random());s.scale.set(sc,sc,1);
     s.material.opacity=0.9*(0.6+0.4*Math.random());s.material.color.setHex(mz.side==="ct"?0xbfe6ff:0xffd9a0);s.visible=true;
     if(lit<st.flashLights.length){const L=st.flashLights[lit++];L.position.set(W.vx(mz.pos.x),1.2,W.vz(mz.pos.y));L.intensity=3.5*(0.7+0.5*Math.random());L.visible=true;}
   });it.done();
   for(let k=lit;k<st.flashLights.length;k++)st.flashLights[k].visible=false;}

  // 煙霧（多球體積）
  {const arr=st.pools.smoke;let i=0;const per=6;
   (frame.smokes||[]).forEach(s=>{
     const grow=clamp((s.age||0)/4,0,1);const fade=clamp(s.tl/6,0,1);const R=4.6*grow+1.2;
     const cx=W.vx(s.pos.x),cz=W.vz(s.pos.y);const seed=parseInt((s.id||"0").replace(/\D/g,"").slice(-4)||"7",10)||7;
     for(let j=0;j<per;j++){const m=arr[i++];if(!m)break;
       const a=seed*0.7+j*1.7;const rr=R*(0.5+0.5*((j%3)/2));
       m.position.set(cx+Math.cos(a)*rr*0.9,1.3+Math.sin(a*1.3)*0.8+ (j%2)*0.7+time*0.0,cz+Math.sin(a)*rr*0.9);
       const sc=R*(0.9+0.3*Math.sin(a*2+time));m.scale.setScalar(sc);
       m.material.opacity=0.5*fade;m.visible=true;
     }
   });for(;i<arr.length;i++)arr[i].visible=false;}

  // 燃燒彈（火焰群）
  {const arr=st.pools.fire;let i=0;const per=7;
   (frame.mollys||[]).forEach(m0=>{const cx=W.vx(m0.pos.x),cz=W.vz(m0.pos.y);const fade=clamp(m0.tl/8,0,1);
     for(let j=0;j<per;j++){const s=arr[i++];if(!s)break;
       const a=j*0.9+time*2;const rr=1.6*(j%3)/2+0.3;
       s.position.set(cx+Math.cos(a)*rr,0.5+Math.abs(Math.sin(time*6+j))*1.1,cz+Math.sin(a)*rr);
       const sc=1.1+0.6*Math.abs(Math.sin(time*8+j*1.3));s.scale.set(sc,sc*1.4,1);
       s.material.opacity=(0.55+0.35*Math.random())*fade;s.visible=true;
     }
   });for(;i<arr.length;i++)arr[i].visible=false;}

  // 投擲物（拋物飛行 + 旋轉 + 拖尾 + 落地爆閃）
  {const it=usePool(st.pools.nade);const bt=usePool(st.pools.boom);
   const nthrow={};(nf?.throwables||[]).forEach(t=>{nthrow[t.id]=t;});
   const nadeCol=ty=>ty==="flash"?0xdfe6ff:ty==="he"?0x3b4250:ty==="molly"?0x6a3318:0x9aa0a8;
   const arcOf=(tw,t)=>{const x=lerp(tw.from.x,tw.to.x,t),y=lerp(tw.from.y,tw.to.y,t),h=0.8+Math.sin(clamp(t,0,1)*Math.PI)*10;return[W.vx(x),h,W.vz(y)];};
   (frame.throwables||[]).forEach(tw=>{
     if(tw.flying){
       const ntw=nthrow[tw.id];
       let t=ntw&&ntw.flying?lerp(tw.t,ntw.t,sub):lerp(tw.t,Math.min(1,tw.t+0.25),sub);t=clamp(t,0,1);
       const col=nadeCol(tw.type);
       // 拖尾（沿軌跡的殘影，營造丟擲速度感）
       for(let k=1;k<=3;k++){const tt=Math.max(0,t-k*0.06);const m=it.next();if(!m)break;const p=arcOf(tw,tt);m.position.set(p[0],p[1],p[2]);m.scale.setScalar(0.34*(1-k*0.22));m.material.color.setHex(col);m.material.emissive&&m.material.emissive.setHex(tw.type==="flash"?0x222633:0x000000);m.visible=true;}
       // 彈體本身（旋轉）
       const m=it.next();if(m){const p=arcOf(tw,t);m.position.set(p[0],p[1],p[2]);m.scale.setScalar(0.42);m.rotation.set(time*9,time*7,time*5);m.material.color.setHex(col);m.visible=true;}
     }else{const b=bt.next();if(b){const col=tw.type==="flash"?0xffffff:tw.type==="he"?0xfb923c:tw.type==="molly"?0xff5a18:0xd5d5d5;
       b.position.set(W.vx(tw.to.x),1.0,W.vz(tw.to.y));const sc=(tw.type==="flash"?5:3.4)*(1+(3-(tw.boom||0))*0.25);b.scale.setScalar(sc);b.material.color.setHex(col);b.material.opacity=0.85*clamp((tw.boom||0)/3,0,1);b.visible=true;}}
   });it.done();bt.done();}

  // 掉落武器
  {const it=usePool(st.pools.drop);
   (frame.droppedGuns||[]).forEach(g=>{const m=it.next();if(!m)return;m.position.set(W.vx(g.pos.x),0.25+Math.sin(time*3)*0.05,W.vz(g.pos.y));m.rotation.y=time*0.8;m.visible=true;});it.done();}

  // 炸彈信標
  if(st.bomb){const B=st.bomb;
    if(frame.planted&&frame.c4pos){B.grp.visible=true;B.grp.position.set(W.vx(frame.c4pos.x),0,W.vz(frame.c4pos.y));
      const blink=0.5+0.5*Math.abs(Math.sin(time*(frame.c4t&&frame.c4t<5?12:5)));
      B.mat.emissiveIntensity=0.6+blink*1.4;B.ring.scale.setScalar(1+blink*0.5);B.ringMat.opacity=0.7*(1-blink*0.5);B.light.intensity=blink*4;
    }else if(frame.droppedBomb){B.grp.visible=true;B.grp.position.set(W.vx(frame.droppedBomb.pos.x),0,W.vz(frame.droppedBomb.pos.y));
      B.mat.emissiveIntensity=0.5+0.4*Math.abs(Math.sin(time*4));B.ring.scale.setScalar(1);B.ringMat.opacity=0.3;B.light.intensity=1.2;
    }else B.grp.visible=false;
  }

  // 追焦資料：擷取被選中選手的內插位置與視角 + 最近敵人（供戰鬥感 chase 相機）
  const selId=live.selected;
  if(selId){const a=frame.players.find(p=>p.id===selId);const b=nf?.players.find(p=>p.id===selId);
    if(a){const px=b?lerp(a.pos.x,b.pos.x,sub):a.pos.x,py=b?lerp(a.pos.y,b.pos.y,sub):a.pos.y;
      let ne=null,nd=1e9;for(const e of frame.players){if(e.dead||e.side===a.side)continue;const d=Math.hypot(e.pos.x-px,e.pos.y-py);if(d<nd){nd=d;ne=e;}}
      st._chase={x:px,y:py,va:a.va,alive:!a.dead,side:a.side,state:a.state,shooting:a.shooting>0,enemy:ne&&nd<55?{x:ne.pos.x,y:ne.pos.y,d:nd}:null};}else st._chase=null;}
  else st._chase=null;

  // 路線疊加（顯示全部路線 或 僅高亮選中選手）
  const rg=st.routeGroup;
  const needRoutes=live.showRoutes||!!selId;
  while(rg.children.length){const c=rg.children.pop();c.geometry?.dispose?.();c.material?.dispose?.();}
  if(needRoutes){
    frame.players.forEach(p=>{if(p.dead)return;const isSel=p.id===selId;if(!live.showRoutes&&!isSel)return;
      const pts=(p.route||[]).slice(p.routeIdx);
      const v=[new THREE.Vector3(W.vx(p.pos.x),0.18,W.vz(p.pos.y))];pts.slice(1).forEach(q=>v.push(new THREE.Vector3(W.vx(q.x),0.18,W.vz(q.y))));
      if(v.length>=2){const base=p.side==="ct"?0x38bdf8:0xfb923c;
        const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(v),new THREE.LineBasicMaterial({color:isSel?0xfde047:base,transparent:true,opacity:isSel?0.95:0.3}));rg.add(line);
        if(isSel){v.forEach((pt,idx)=>{const last=idx===v.length-1;const dot=new THREE.Mesh(new THREE.SphereGeometry(last?0.75:0.42,10,8),new THREE.MeshBasicMaterial({color:last?0xfca5a5:0xfde047,transparent:true,opacity:0.92}));dot.position.set(pt.x,0.32,pt.z);rg.add(dot);});}}
    });
  }
}

// ── 相機更新：選中→過肩追焦；否則自動導播（取激戰/對槍最佳角度，並閃避建物遮擋）──
function camBlocked(rects,tgt,radius,phi,theta){
  const sx=radius*Math.sin(phi)*Math.sin(theta)+tgt.x;
  const sz=radius*Math.sin(phi)*Math.cos(theta)+tgt.z;
  for(const r of rects){if(segHitsRect(sx,sz,tgt.x,tgt.z,r))return true;}return false;
}
function updateCamera(st,frame,sub,dt,W){
  const cam=st.cam;const ch=st._chase;const rects=st.wallRects||[];
  const chasing=ch&&ch.alive;
  // 取消選取（按 ✕ 或點空白）時，凍結在目前的對戰視角，不跳回大視角
  if(st._wasChasing&&!chasing&&!cam.overview){cam.autoFollow=false;cam.dTheta=cam.theta;cam.dPhi=cam.phi;cam.dRadius=cam.radius;cam.dTgt.copy(cam.tgt);}
  if(!st._wasChasing&&chasing){cam.chaseYaw=0;cam.chasePitch=0;} // 新選取 → 回到過肩預設
  st._wasChasing=chasing;
  if(chasing){
    // 戰鬥中朝最近敵人方向，否則朝選手面向；目標前移看向下槍線（看得更遠）；可單指環繞
    const faceDeg=ch.enemy?Math.atan2(ch.enemy.y-ch.y,ch.enemy.x-ch.x)*180/Math.PI:ch.va;
    const va=faceDeg*Math.PI/180;
    cam.dTheta=Math.atan2(-Math.cos(va),-Math.sin(va))+(cam.chaseYaw||0);
    const close=ch.enemy&&ch.enemy.d<24;
    cam.dPhi=clamp((close?1.0:0.92)+(cam.chasePitch||0),0.2,1.45);
    cam.dRadius=close?22:27;            // 比過去更遠
    const fwd=close?7:11;               // 目標前移到選手前方
    cam.dTgt.set(W.vx(ch.x+Math.cos(va)*fwd),3.0,W.vz(ch.y+Math.sin(va)*fwd));
  }else if(cam.autoFollow&&frame){
    const alive=frame.players.filter(p=>!p.dead);
    if(cam.overview&&alive.length){
      // 全景追蹤：以存活質心為中心框住全部選手，鏡頭緩和擺動換角度（穩定不晃）
      const cx=alive.reduce((s,p)=>s+p.pos.x,0)/alive.length,cy=alive.reduce((s,p)=>s+p.pos.y,0)/alive.length;
      const wcx=W.vx(cx),wcz=W.vz(cy);
      let maxd=0;for(const p of alive)maxd=Math.max(maxd,Math.hypot(W.vx(p.pos.x)-wcx,W.vz(p.pos.y)-wcz));
      cam.dTgt.set(wcx,3,wcz);
      cam.dRadius=lerp(cam.dRadius,clamp(maxd*1.5+36,60,120),0.03); // 半徑框住全部角色（平滑）
      cam.dPhi=lerp(cam.dPhi,1.16,0.03);
      if(cam._ovBase==null)cam._ovBase=cam.dTheta;
      cam.dTheta=cam._ovBase+Math.sin((st.time||0)*0.06)*0.5; // 緩和左右換角度，不追單一對槍避免晃動
    }else{
    // 1) 找最近的「對槍中」敵對雙人 → 以側面角度入鏡
    let duel=null,bd=1e9;
    for(const a of alive){if(a.state!=="ENGAGE"&&a.state!=="架槍")continue;
      for(const b of alive){if(b.side===a.side)continue;const d=dist(a.pos,b.pos);if(d<bd){bd=d;duel=[a,b];}}}
    if(duel&&bd<46){
      const ax=W.vx(duel[0].pos.x),az=W.vz(duel[0].pos.y),bx=W.vx(duel[1].pos.x),bz=W.vz(duel[1].pos.y);
      const mx=(ax+bx)/2,mz=(az+bz)/2;const ang=Math.atan2(bz-az,bx-ax);
      cam.dTheta=ang+Math.PI/2;                       // 垂直對槍連線，雙方同時入鏡
      cam.dPhi=0.92; cam.dRadius=lerp(cam.dRadius,clamp(bd*1.5+18,34,58),0.06);
      cam.dTgt.set(mx,3,mz);
    }else{
      // 2) 團戰熱點 → 否則炸彈點 → 否則存活質心（全景）
      let hot=null,best=0;
      for(const a of alive){const near=alive.filter(b=>dist(a.pos,b.pos)<16);const en=near.filter(b=>b.side!==a.side);if(near.length>=3&&en.length>=1){const sc=near.length*10+en.length*5;if(sc>best){best=sc;const cx=near.reduce((s,p)=>s+p.pos.x,0)/near.length,cy=near.reduce((s,p)=>s+p.pos.y,0)/near.length;hot={x:cx,y:cy};}}}
      if(!hot&&frame.planted&&frame.c4pos)hot=frame.c4pos;
      if(!hot&&alive.length){const cx=alive.reduce((s,p)=>s+p.pos.x,0)/alive.length,cy=alive.reduce((s,p)=>s+p.pos.y,0)/alive.length;hot={x:cx,y:cy};}
      if(hot){cam.dTgt.set(W.vx(hot.x),3,W.vz(hot.y));cam.dRadius=lerp(cam.dRadius,best>0?60:80,0.04);cam.dPhi=lerp(cam.dPhi,best>0?1.0:1.18,0.04);}
    }
    }
  }
  // 3) 遮擋處理：完全交給建物半透明（fadeOccluders），不再旋轉鏡頭閃避（會在密集建築區來回擺動造成晃動）
  // 平滑插值
  const k=1-Math.pow(0.0015,dt);
  cam.theta=lerpAngle(cam.theta*180/Math.PI,cam.dTheta*180/Math.PI,k)*Math.PI/180;
  cam.phi=lerp(cam.phi,cam.dPhi,k);
  cam.radius=lerp(cam.radius,cam.dRadius,k);
  cam.tgt.lerp(cam.dTgt,k);
  _vA.setFromSphericalCoords(cam.radius,cam.phi,cam.theta).add(cam.tgt);
  st.camera.position.copy(_vA);
  st.camera.lookAt(cam.tgt);
  if(chasing&&ch.shooting){const sh=0.14;st.camera.position.x+=(Math.random()-0.5)*sh;st.camera.position.y+=(Math.random()-0.5)*sh;st.camera.position.z+=(Math.random()-0.5)*sh;} // 開火後座抖動
  fadeOccluders(st,frame,W);
}
// 建物擋住視線時自動半透明，方便縱觀對戰全局
function fadeOccluders(st,frame,W){
  if(!st.fadeWalls||!st.fadeWalls.length||!frame)return;
  const cam=st.camera.position,tgt=st.cam.tgt;const ch=st._chase;const chasing=ch&&ch.alive;
  const foci=[[tgt.x,tgt.z]];
  if(chasing){foci.push([W.vx(ch.x),W.vz(ch.y)]);
    const dx=tgt.x-cam.x,dz=tgt.z-cam.z,l=Math.hypot(dx,dz)||1;foci.push([tgt.x+dx/l*24,tgt.z+dz/l*24]);} // 前方下槍線焦點
  const alive=frame.players.filter(p=>!p.dead);
  for(const p of alive){const wx=W.vx(p.pos.x),wz=W.vz(p.pos.y);foci.push([wx,wz]);} // 任何擋住選手的建物都淡出，避免人物消失只剩血條
  const margin=chasing?5:0;
  for(const fw of st.fadeWalls){
    const r=fw.rect;let occ=false;
    // 相機緊貼或位於建物範圍內 → 直接淡出（進屋/貼牆時不擋畫面）
    if(cam.x>r.x0-margin&&cam.x<r.x1+margin&&cam.z>r.z0-margin&&cam.z<r.z1+margin)occ=true;
    if(!occ)for(const f of foci){if(segHitsRect(cam.x,cam.z,f[0],f[1],r)){occ=true;break;}}
    const target=occ?0.14:1.0;
    fw.cur+=(target-fw.cur)*0.18;
    const fade=fw.cur,tr=fade<0.985;
    for(const mm of fw.mats){mm.m.opacity=mm.base*fade;mm.m.transparent=tr||mm.base<1;mm.m.depthWrite=!tr;}
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   HUD 子元件
   ═══════════════════════════════════════════════════════════════════════ */
function ScoreBar({frame,sim,fIdx}){
  const tScore=frame.tScore+(frame.roundHist.filter(r=>r.winner==="t").length>frame.tScore?0:0); // 顯示當前已贏局數
  const ct=frame.ctScore,t=frame.tScore;
  const timer=frame.buyP?"購買":(frame.planted?`💣 ${(frame.c4t??0)*2}s`:fmtT(115-frame.roundSec));
  const pip=(r,i)=>(<div key={i} style={{width:9,height:11,borderRadius:2,background:r?(r.winner==="ct"?"rgba(56,189,248,0.7)":"rgba(251,146,60,0.7)"):"rgba(255,255,255,0.07)",border:`0.5px solid ${r?(r.winner==="ct"?C.ct:C.t):"transparent"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:6}}>{r?(r.how==="bomb"?"💣":r.how==="defuse"?"✂":r.how==="time"?"⏱":""):""}</div>);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <div style={{flex:1,display:"flex",alignItems:"center",gap:7,justifyContent:"flex-end"}}>
          <span style={{color:C.tL,fontSize:13,fontWeight:800,letterSpacing:"0.02em"}}>{T_NAME}</span>
          <div style={{width:22,height:22,borderRadius:6,background:`${C.t}22`,border:`1px solid ${C.t}66`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>🐺</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,background:"rgba(0,0,0,0.4)",borderRadius:9,padding:"3px 10px"}}>
          <span style={{color:C.t,fontSize:20,fontWeight:900,minWidth:18,textAlign:"center"}}>{t}</span>
          <div style={{textAlign:"center",minWidth:46}}>
            <div style={{color:frame.planted?C.gold:"#e6e9ef",fontSize:12,fontWeight:800,fontVariantNumeric:"tabular-nums"}}>{timer}</div>
            <div style={{color:C.gray2,fontSize:7,fontWeight:700,letterSpacing:"0.1em"}}>R{frame.rnd+1}</div>
          </div>
          <span style={{color:C.ct,fontSize:20,fontWeight:900,minWidth:18,textAlign:"center"}}>{ct}</span>
        </div>
        <div style={{flex:1,display:"flex",alignItems:"center",gap:7}}>
          <div style={{width:22,height:22,borderRadius:6,background:`${C.ct}22`,border:`1px solid ${C.ct}66`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>🛡️</div>
          <span style={{color:C.ctL,fontSize:13,fontWeight:800,letterSpacing:"0.02em"}}>{CT_NAME}</span>
        </div>
      </div>
      <div style={{display:"flex",gap:2,justifyContent:"center"}}>{Array.from({length:15}).map((_,i)=>pip(frame.roundHist[i],i))}</div>
    </div>
  );
}

function PlayerRow({p,selected,onClick}){
  const col=sideColor(p.side);const hp=clamp(p.hp,0,100);
  const g=GUNS[p.gun]||{name:p.gun,cls:""};
  const gunIcon=g.cls==="狙擊"?"🎯":g.cls==="衝鋒"?"🧨":g.cls==="手槍"?"🔫":"🔫";
  const nf=p.nades||[];const flashN=nf.filter(n=>n==="flash").length;
  const eq=[];
  if(p.armor)eq.push(p.helmet?"🦺⛑":"🦺");
  if(flashN)eq.push("⚡"+(flashN>1?flashN:""));
  if(nf.includes("he"))eq.push("💥");
  if(nf.includes("smoke"))eq.push("🌫");
  if(nf.includes("molly"))eq.push("🔥");
  if(p.side==="ct"&&p.armor)eq.push("🔧");
  return(
    <button onClick={()=>onClick(p.id)} style={{display:"flex",alignItems:"center",gap:6,width:"100%",textAlign:"left",
      background:selected?`${col}1f`:"rgba(255,255,255,0.025)",border:`1px solid ${selected?col+"99":"transparent"}`,borderRadius:8,padding:"5px 7px",cursor:"pointer",opacity:p.dead?0.45:1,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:col}}/>
      <div style={{width:18,height:18,borderRadius:5,background:`${col}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,flexShrink:0}}>{p.dead?"💀":ROLE_ZH[p.role]?.[0]||"●"}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <span style={{color:"#e8ebf0",fontSize:10,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}{p.hasBomb?" 💣":""}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4,marginTop:1,whiteSpace:"nowrap",overflow:"hidden"}}>
          <span style={{color:p.dead?C.gray2:"#aeb4be",fontSize:8,fontWeight:700}}>{gunIcon}{g.name}</span>
          <span style={{fontSize:8,opacity:p.dead?0.4:0.95,letterSpacing:"-0.5px"}}>{eq.join("")}</span>
          <span style={{color:C.green,fontSize:7.5,fontWeight:700,marginLeft:"auto"}}>${p.money}</span>
        </div>
        <div style={{height:3,background:"rgba(255,255,255,0.1)",borderRadius:9,marginTop:2,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${hp}%`,background:hp>50?C.green:hp>25?C.gold:C.red,transition:"width 0.2s"}}/>
        </div>
      </div>
      <div style={{textAlign:"right",flexShrink:0,minWidth:46}}>
        <div style={{color:"#e8ebf0",fontSize:10,fontWeight:800,fontVariantNumeric:"tabular-nums"}}>{p.k}<span style={{color:C.gray2}}>/</span>{p.d}<span style={{color:C.gray2}}>/</span><span style={{color:C.gold}}>{p.a||0}</span></div>
        <div style={{color:C.gray2,fontSize:6.5,fontWeight:700,letterSpacing:"0.08em"}}>K / D / A</div>
      </div>
    </button>
  );
}

function RoundOverlay({result,frame,onClose}){
  const winSide=result.winner;
  return(
    <div style={{position:"absolute",inset:0,zIndex:60,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(4,6,12,0.55)",backdropFilter:"blur(3px)",animation:"fadeIn 0.25s"}} onClick={onClose}>
      <div style={{background:"rgba(13,17,25,0.96)",border:`1px solid ${winSide==="ct"?C.ct:C.t}66`,borderRadius:14,padding:"16px 20px",minWidth:260,boxShadow:"0 20px 60px rgba(0,0,0,0.6)"}}>
        <div style={{textAlign:"center",marginBottom:10}}>
          <div style={{color:winSide==="ct"?C.ctL:C.tL,fontSize:22,fontWeight:900,letterSpacing:"0.05em"}}>{winSide==="ct"?CT_NAME:T_NAME} 拿下回合</div>
          <div style={{color:C.gray,fontSize:10,marginTop:2}}>{result.how==="bomb"?"💣 炸彈引爆":result.how==="defuse"?"✂️ 成功拆彈":result.how==="elim"?"☠️ 全員淘汰":"⏱️ 時間結束"} · R{frame.rnd+1}</div>
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"center",alignItems:"center"}}>
          <span style={{color:C.t,fontSize:30,fontWeight:900}}>{frame.tScore}</span>
          <span style={{color:C.gray2,fontSize:14}}>:</span>
          <span style={{color:C.ct,fontSize:30,fontWeight:900}}>{frame.ctScore}</span>
        </div>
        {result.mvp&&(
          <div style={{marginTop:10,paddingTop:9,borderTop:"1px solid rgba(255,255,255,0.08)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:8}}>
              <span style={{fontSize:12}}>⭐</span>
              <span style={{color:C.gold,fontSize:11,fontWeight:900}}>本回合 MVP</span>
              <span style={{color:result.mvp.side==="ct"?C.ctL:C.tL,fontSize:13,fontWeight:800}}>{result.mvp.name}</span>
              <span style={{color:C.gray2,fontSize:9}}>{result.mvp.role}</span>
              <span style={{color:C.gray,fontSize:10}}>{result.mvp.k}/{result.mvp.d}/{result.mvp.a} · {result.mvp.dmg} 傷</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,fontSize:8,color:C.gray2,fontWeight:700,padding:"0 2px 3px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
              <span style={{width:14}}>#</span><span style={{flex:1}}>選手</span>
              <span style={{width:46,textAlign:"center"}}>K/D/A</span><span style={{width:40,textAlign:"right"}}>本局傷</span><span style={{width:38,textAlign:"right"}}>ADR</span>
            </div>
            <div style={{display:"flex",flexDirection:"column"}}>
              {result.top.map((s,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:10,padding:"3px 2px",borderBottom:i<result.top.length-1?"1px solid rgba(255,255,255,0.04)":"none"}}>
                  <span style={{color:i===0?C.gold:C.gray2,width:14,fontWeight:800}}>{i+1}</span>
                  <span style={{flex:1,display:"flex",alignItems:"baseline",gap:4,minWidth:0}}>
                    <span style={{color:s.side==="ct"?C.ctL:C.tL,fontWeight:800,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.name}</span>
                    <span style={{color:C.gray2,fontSize:7.5}}>{s.role}</span>
                  </span>
                  <span style={{width:46,textAlign:"center",color:"#e8ebf0",fontWeight:800,fontVariantNumeric:"tabular-nums"}}>{s.k}/{s.d}/<span style={{color:C.gold}}>{s.a}</span></span>
                  <span style={{width:40,textAlign:"right",color:"#cbd5e1",fontWeight:700}}>{s.dmg}</span>
                  <span style={{width:38,textAlign:"right",color:C.gray}}>{s.adr}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   主元件
   ═══════════════════════════════════════════════════════════════════════ */
function EsportsFPS3D({
  roster:rosterProp,          // 我方 5 名（3D 形狀，side:"t"）
  opponent:oppProp,           // 對手 5 名（3D 形狀，side:"ct"）
  tactic:tacticProp,          // 我方 T 戰術（id 字串或物件）
  tacticType:tacticTypeProp,  // 我方 T 戰術類型（execute/rush/default）；id 對不到時用此挑選
  ctTactic:ctTacticProp,      // 對手 CT 戰術 id（可選；未給則 AI 預設）
  mapKey:mapKeyProp,          // 指定地圖
  seed:seedProp,              // 指定亂數種子
  teamName:teamNameProp,      // 我方隊名
  oppName:oppNameProp,        // 對手隊名
  onComplete,                 // (matchResult)=>void：播放結束時觸發一次
  embedded=false,             // 嵌入主遊戲：隱藏內建選圖/選戰術面板
}={}){
  // 名稱覆寫（嵌入時）
  if(teamNameProp)T_NAME=teamNameProp; if(oppNameProp)CT_NAME=oppNameProp;
  const [mapKey,setMapKey]=useState(mapKeyProp||"inferno");
  useEffect(()=>{if(mapKeyProp&&mapKeyProp!==mapKey)setMapKey(mapKeyProp);},[mapKeyProp]);
  const lib=useMemo(()=>TACTICS_DB[mapKey],[mapKey]);
  // 即時名單：有傳入我方+對手則合併，否則用內建 ROSTER；同步設為渲染用 ACTIVE_ROSTER
  const effectiveRoster=useMemo(()=>{
    const bt=ROSTER.filter(p=>p.side==="t"),bc=ROSTER.filter(p=>p.side==="ct");
    const tSide=(rosterProp&&rosterProp.length)?rosterProp.map(p=>({...p,side:"t"})):bt;
    const ctSide=(oppProp&&oppProp.length)?oppProp.map(p=>({...p,side:"ct"})):bc;
    const rs=[...tSide,...ctSide];
    ACTIVE_ROSTER=rs;return rs;
  },[rosterProp,oppProp]);
  // 解析我方戰術索引（id 字串 / 物件 / 數字）
  const resolveTIdx=()=>{
    if(tacticProp!=null){const id=typeof tacticProp==="object"?tacticProp.id:tacticProp;const i=lib.t.findIndex(t=>t.id===id||t.name===id);if(i>=0)return i;if(typeof tacticProp==="number")return tacticProp;}
    if(tacticTypeProp){const i=lib.t.findIndex(t=>t.type===tacticTypeProp);if(i>=0)return i;}
    return 0;
  };
  const [tIdx,setTIdx]=useState(resolveTIdx());
  useEffect(()=>{setTIdx(resolveTIdx());},[tacticProp,tacticTypeProp,mapKey]);
  // CT 戰術：有指定用指定；否則 AI 依我方站點挑一個合理防守（堆同點），增添對抗性
  const aiCtIdx=useMemo(()=>{
    if(ctTacticProp!=null){const i=lib.ct.findIndex(t=>t.id===ctTacticProp||t.name===ctTacticProp);if(i>=0)return i;}
    const tSite=lib.t[Math.min(tIdx,lib.t.length-1)]?.site;
    // 50% 機率守對點（堆/標準），否則隨機 — 避免 AI 過強破壞平衡
    const rng=mkRng((seedProp||42)+7);
    if(tSite&&tSite!=="mid"&&rng()<0.5){const i=lib.ct.findIndex(t=>t.site===tSite);if(i>=0)return i;}
    return Math.floor(rng()*lib.ct.length);
  },[ctTacticProp,tIdx,mapKey,seedProp]);
  const [ctIdx,setCtIdx]=useState(aiCtIdx);
  useEffect(()=>{if(embedded)setCtIdx(aiCtIdx);},[aiCtIdx,embedded]);
  const [seed,setSeed]=useState(seedProp||42);
  useEffect(()=>{if(seedProp!=null&&seedProp!==seed)setSeed(seedProp);},[seedProp]);
  const tacticT=lib.t[Math.min(tIdx,lib.t.length-1)],tacticCT=lib.ct[Math.min(ctIdx,lib.ct.length-1)];
  const sim=useMemo(()=>simulateFps(mapKey,tacticT,tacticCT,seed,effectiveRoster),[mapKey,tIdx,ctIdx,seed,effectiveRoster]);
  // 賽後結果（給主遊戲）；播放到最後一格時透過 onComplete 回傳一次
  const matchResult=useMemo(()=>buildMatchResult(sim,{tacticT,tacticCT,tName:T_NAME,ctName:CT_NAME}),[sim]);
  const completedRef=useRef(null);
  useEffect(()=>{completedRef.current=null;},[matchResult]); // 換場後重置觸發旗標

  const [fIdx,setFIdx]=useState(0);
  const [playing,setPlaying]=useState(true);
  const [speed,setSpeed]=useState(1);
  const [selected,setSelected]=useState(null);
  const [showLabels,setShowLabels]=useState(true);
  const [showRoutes,setShowRoutes]=useState(false);
  const [showSetup,setShowSetup]=useState(false);
  const [feed,setFeed]=useState([]);
  const [casts,setCasts]=useState([]);
  const [comms,setComms]=useState([]);
  const [soundOn,setSoundOn]=useState(false);
  const [showStats,setShowStats]=useState(false);
  const audioRef=useRef(null);
  const [multiKill,setMultiKill]=useState(null);
  const [roundOverlay,setRoundOverlay]=useState(null);
  const fidc=useRef(0);
  const seekNonce=useRef(0);
  const recenter=useRef(null);

  const total=sim.frames.length;
  const frame=sim.frames[Math.min(fIdx,total-1)];
  const prevRndRef=useRef(0);
  const prevPlantedRef=useRef(false);
  const prevBuyRef=useRef(false);

  // liveRef：傳給 3D 場景的即時資料（避免每幀 React 重繪）
  const liveRef=useRef({});
  liveRef.current={sim,fIdx,playing,speed,selected,showLabels,showRoutes,seekNonce:seekNonce.current,
    advance:()=>setFIdx(fi=>{if(fi>=total-1){setPlaying(false);return fi;}return fi+1;})};

  // 切換比賽/地圖 → 重置
  useEffect(()=>{setFIdx(0);setSelected(null);setFeed([]);setCasts([]);setComms([]);setMultiKill(null);setRoundOverlay(null);prevRndRef.current=0;prevPlantedRef.current=false;seekNonce.current++;setPlaying(true);},[sim]);

  // 依 fIdx 觸發擊殺播報 / 多殺 / 回合結算
  useEffect(()=>{
    if(!frame)return;
    frame.events?.forEach(ev=>{
      if(ev.type==="kill"){const id=++fidc.current;setFeed(f=>[...f.slice(-4),{id,...ev}]);setTimeout(()=>setFeed(f=>f.filter(x=>x.id!==id)),3600);}
      if(ev.type==="multikill"){const mid=++fidc.current;setMultiKill({...ev,id:mid});setTimeout(()=>setMultiKill(m=>m&&m.id===mid?null:m),2200);}
    });
    frame.casts?.forEach(c=>{const id=++fidc.current;setCasts(cs=>[...cs.slice(-3),{id,text:c}]);setTimeout(()=>setCasts(cs=>cs.filter(x=>x.id!==id)),3600);});
    frame.comms?.forEach(c=>{const id=++fidc.current;setComms(cs=>[...cs.slice(-4),{id,...c}]);setTimeout(()=>setComms(cs=>cs.filter(x=>x.id!==id)),4200);});
    // ── 音效 ──
    const A=audioRef.current;
    if(soundOn&&A){
      let shots=0;(frame.muzzles||[]).forEach(mz=>{if(shots<5){const i=shots++;if(i===0)A.burst(mz.cls,mz.kill);else setTimeout(()=>A.burst(mz.cls,mz.kill),i*45);setTimeout(()=>A.impact(),150+i*45);}});
      frame.events?.forEach(ev=>{if(ev.type==="kill")A.kill(ev.hs);});
      if(frame.planted&&!prevPlantedRef.current)A.plant();
      else if(frame.planted&&frame.c4t!=null)A.beep(frame.c4t<=3);
      if(frame.buyP&&!prevBuyRef.current)A.countdown(); // 每局開始倒數聲（仿 CS freeze→live）
    }
    prevPlantedRef.current=frame.planted;prevBuyRef.current=frame.buyP;
    // 回合切換 → 顯示結算（用 roundHist 增量判定）
    if(frame.rnd>prevRndRef.current){const res=frame.roundHist[frame.rnd-1];if(res){setRoundOverlay({...res,atRnd:frame.rnd});setTimeout(()=>setRoundOverlay(o=>o&&o.atRnd===frame.rnd?null:o),2200);if(soundOn&&A){if(res.how==="bomb")A.boom();else if(res.how==="defuse")A.defuse();}}prevRndRef.current=frame.rnd;}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[fIdx]);

  const seek=useCallback(v=>{setFIdx(clamp(v,0,total-1));seekNonce.current++;},[total]);
  const selP=selected?frame?.players.find(p=>p.id===selected):null;
  const matchOver=Math.max(sim.ctScore,sim.tScore)>=8&&fIdx>=total-1;
  // 播放結束 → 回傳賽後結果給主遊戲（每場僅一次）
  useEffect(()=>{
    if(matchOver&&onComplete&&completedRef.current!==matchResult.id){
      completedRef.current=matchResult.id;onComplete(matchResult);
    }
  },[matchOver,onComplete,matchResult]);

  if(!frame)return null;
  const tType=TAC_TYPE[tacticT.type]||TAC_TYPE.default,cType=TAC_TYPE[tacticCT.type]||TAC_TYPE.default;

  return(
    <div style={{minHeight:"100vh",background:`radial-gradient(120% 80% at 50% 0%, #0c1018 0%, ${C.bg} 60%)`,fontFamily:"system-ui,-apple-system,sans-serif",color:"#e8ebf0",padding:"10px 10px 18px",userSelect:"none"}}>
      <div style={{maxWidth:430,margin:"0 auto"}}>

        {/* 頂部比分列 */}
        <div style={{position:"sticky",top:0,zIndex:40,background:"rgba(7,10,16,0.92)",backdropFilter:"blur(10px)",borderRadius:12,border:`1px solid ${C.line}`,padding:"8px 10px",marginBottom:8}}>
          <ScoreBar frame={frame} sim={sim} fIdx={fIdx}/>
        </div>

        {/* 3D 戰術畫面 */}
        <div style={{position:"relative",width:"100%",paddingBottom:"118%",borderRadius:14,overflow:"hidden",border:`1px solid ${C.line}`,boxShadow:"0 10px 50px rgba(0,0,0,0.7)",background:"#05070c"}}>
          <FpsScene3D mapKey={mapKey} liveRef={liveRef} onSelectPlayer={setSelected} onRecenterRef={recenter}/>

          {/* LIVE */}
          <div style={{position:"absolute",top:9,left:"50%",transform:"translateX(-50%)",zIndex:20,display:"flex",alignItems:"center",gap:4,pointerEvents:"none"}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:C.red,animation:"pls 1.1s infinite"}}/>
            <span style={{color:C.red,fontSize:9,fontWeight:900,letterSpacing:"0.12em",textShadow:"0 1px 3px black"}}>直播中</span>
          </div>

          {/* 地圖名 + 戰術籤 */}
          <div style={{position:"absolute",top:8,left:8,zIndex:20,pointerEvents:"none"}}>
            <div style={{color:"rgba(255,255,255,0.55)",fontSize:9,fontWeight:800,letterSpacing:"0.08em",textShadow:"0 1px 2px black"}}>{MAPS[mapKey].name.toUpperCase()}</div>
          </div>

          {/* 擊殺列 */}
          <div style={{position:"absolute",top:24,right:8,zIndex:20,display:"flex",flexDirection:"column",gap:3,alignItems:"flex-end",pointerEvents:"none"}}>
            {feed.map(e=>(
              <div key={e.id} style={{display:"flex",alignItems:"center",gap:5,background:e.hs?"rgba(40,30,0,0.88)":"rgba(0,0,0,0.82)",border:`1px solid ${e.hs?C.gold:sideColor(e.killerSide)}77`,borderRadius:6,padding:"3px 8px",animation:"slideL 0.25s",fontSize:9}}>
                <span style={{color:e.killerSide==="ct"?C.ctL:C.tL,fontWeight:800}}>{e.killer}</span>
                {e.firstKill&&<span style={{color:C.gold,fontSize:7,fontWeight:900,border:`1px solid ${C.gold}`,borderRadius:3,padding:"0 2px"}}>FK</span>}
                <span style={{color:e.hs?C.gold:"#aeb4be",fontSize:10}}>{GUNS[e.gun]?.cls==="狙擊"?"🎯":GUNS[e.gun]?.cls==="衝鋒"?"🧨":"🔫"}</span>
                {e.hs&&<span title="爆頭" style={{fontSize:11,filter:"drop-shadow(0 0 3px #fbbf24)"}}>🗡️</span>}
                <span style={{color:e.killerSide==="ct"?C.tL:C.ctL,fontWeight:600,opacity:0.85}}>{e.victim}</span>
              </div>
            ))}
          </div>

          {/* 多殺橫幅 */}
          {multiKill&&(
            <div style={{position:"absolute",top:"34%",left:"50%",transform:"translateX(-50%)",zIndex:30,textAlign:"center",pointerEvents:"none",animation:"pop 0.4s"}}>
              <div style={{color:multiKill.count>=4?C.gold:"#f59e0b",fontSize:multiKill.count>=4?26:20,fontWeight:900,textShadow:`0 0 18px ${multiKill.count>=4?C.gold:"#f59e0b"},0 2px 5px black`,letterSpacing:"0.05em"}}>{multiKill.label}{multiKill.count>=5?"！":""}</div>
              <div style={{color:sideColor(multiKill.side)==="ct"?C.ctL:C.tL,fontSize:11,fontWeight:700,marginTop:2,textShadow:"0 2px 4px black"}}>{multiKill.player}</div>
            </div>
          )}

          {/* 隊伍無線電（同隊溝通，配合實際戰況） */}
          {comms.length>0&&(
            <div style={{position:"absolute",left:8,top:"36%",zIndex:21,display:"flex",flexDirection:"column",gap:3,pointerEvents:"none",maxWidth:"60%"}}>
              {comms.map(c=>{const col=sideColor(c.side);return(
                <div key={c.id} style={{display:"flex",alignItems:"center",gap:5,background:"rgba(6,9,15,0.82)",borderLeft:`3px solid ${col}`,borderRadius:"0 6px 6px 0",padding:"2px 7px",fontSize:9,animation:"slideR 0.3s",alignSelf:"flex-start"}}>
                  <span style={{fontSize:8,opacity:0.8}}>📻</span>
                  <span style={{color:c.side==="ct"?C.ctL:C.tL,fontWeight:800,whiteSpace:"nowrap"}}>{c.name}</span>
                  <span style={{color:"rgba(255,255,255,0.9)"}}>{c.text}</span>
                </div>);})}
            </div>
          )}

          {/* 主播台 */}
          {!selP&&(
            <div style={{position:"absolute",bottom:8,left:8,zIndex:20,display:"flex",flexDirection:"column",gap:3,pointerEvents:"none",maxWidth:"66%"}}>
              {casts.map(c=>(<div key={c.id} style={{background:"rgba(0,0,0,0.78)",borderLeft:`2px solid ${C.gold}`,borderRadius:"0 6px 6px 0",padding:"3px 8px",fontSize:9,color:"rgba(255,255,255,0.9)",animation:"slideR 0.3s",alignSelf:"flex-start"}}>{c.text}</div>))}
            </div>
          )}

          {/* 音效開關（畫面內小按鈕） */}
          <button onClick={()=>{if(!audioRef.current)audioRef.current=makeAudio();if(audioRef.current){audioRef.current.resume();if(!soundOn)audioRef.current.roundStart();}setSoundOn(s=>!s);}} title={soundOn?"音效開":"音效關"} style={{position:"absolute",top:8,right:8,zIndex:25,width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",background:soundOn?"rgba(56,189,248,0.22)":"rgba(13,17,25,0.85)",border:`1px solid ${soundOn?C.ct+"88":C.line}`,borderRadius:"50%",cursor:"pointer",fontSize:15,backdropFilter:"blur(6px)"}}>{soundOn?"🔊":"🔇"}</button>

          {/* 重新置中 */}
          <button onClick={()=>{setSelected(null);recenter.current&&recenter.current();}} style={{position:"absolute",bottom:8,right:8,zIndex:25,display:"flex",alignItems:"center",gap:4,background:"rgba(13,17,25,0.85)",border:`1px solid ${C.line}`,borderRadius:20,padding:"6px 12px",cursor:"pointer",color:"#cfd4dc",fontSize:10,fontWeight:700,backdropFilter:"blur(6px)"}}>
            <span style={{fontSize:11}}>◎</span> 重新置中
          </button>

          {/* 選手詳情（精簡卡片，不擋畫面） */}
          {selP&&(
            <div style={{position:"absolute",bottom:8,left:8,width:"min(94%,290px)",zIndex:30,background:"rgba(8,11,18,0.82)",border:`1px solid ${sideColor(selP.side)}77`,borderRadius:10,padding:"7px 9px",animation:"slideU 0.25s",backdropFilter:"blur(8px)"}}>
              <div style={{display:"flex",alignItems:"center",gap:7}}>
                <div style={{width:24,height:24,borderRadius:7,background:`${sideColor(selP.side)}2a`,border:`1px solid ${sideColor(selP.side)}66`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0}}>{selP.dead?"💀":"🎯"}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:"#fff",fontSize:11,fontWeight:800,display:"flex",alignItems:"center",gap:5}}>{selP.name}{selP.hasBomb?" 💣":""}{selP.stats&&<span style={{background:`linear-gradient(135deg,${C.gold},#d97706)`,color:"#1a1205",fontSize:8,fontWeight:900,borderRadius:4,padding:"0px 4px"}}>OVR {ovr(selP)}</span>}</div>
                  <div style={{color:C.gray2,fontSize:8,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{selP.fpsRole||ROLE_ZH[selP.role]||selP.role} · {selP.dead?"陣亡":stZh(selP.state)} · {GUNS[selP.gun]?.name}{!selP.dead&&" · 🎥"}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                  <span style={{fontSize:9.5,fontWeight:800,color:"#e8ebf0",fontVariantNumeric:"tabular-nums"}}>{selP.k}<span style={{color:C.gray2}}>/</span>{selP.d}<span style={{color:C.gray2}}>/</span><span style={{color:C.gold}}>{selP.a||0}</span></span>
                  <span style={{fontSize:9,fontWeight:800,color:selP.hp>50?C.green:selP.hp>25?C.gold:C.red}}>{selP.dead?0:selP.hp}❤</span>
                  <span style={{fontSize:8.5,fontWeight:700,color:C.green}}>${selP.money}</span>
                  {selP.stats&&<button onClick={e=>{e.stopPropagation();setShowStats(s=>!s);}} style={{background:"rgba(255,255,255,0.08)",border:"none",borderRadius:5,padding:"1px 5px",cursor:"pointer",color:"#cfd4dc",fontSize:8,fontWeight:700}}>素質{showStats?"▴":"▾"}</button>}
                  <button onClick={e=>{e.stopPropagation();setSelected(null);}} style={{width:18,height:18,borderRadius:"50%",background:"rgba(255,255,255,0.08)",border:"none",cursor:"pointer",color:"#a1a1aa",fontSize:10,flexShrink:0}}>✕</button>
                </div>
              </div>
              {selP.stats&&showStats&&(
                <div style={{marginTop:6,display:"flex",flexDirection:"column",gap:3}}>
                  {STAT_GROUPS.map(([gname,keys])=>(
                    <div key={gname} style={{display:"flex",alignItems:"center",gap:4}}>
                      <div style={{width:24,color:C.gold,fontSize:7,fontWeight:800,flexShrink:0}}>{gname}</div>
                      <div style={{flex:1,display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:3}}>
                        {keys.map(([k,zh])=>{const v=selP.stats[k];const col=v>=85?"#34d399":v>=78?"#a3e635":v>=72?"#fbbf24":"#f87171";return(
                          <div key={k} style={{background:"rgba(255,255,255,0.04)",borderRadius:4,padding:"2px 4px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <span style={{color:C.gray2,fontSize:6.5,whiteSpace:"nowrap"}}>{zh}</span><span style={{color:col,fontSize:8.5,fontWeight:900,marginLeft:2}}>{v}</span>
                          </div>);})}
                      </div>
                    </div>
                  ))}
                  <div style={{color:C.gray2,fontSize:7,marginTop:1}}>FPS戰力 <b style={{color:"#e8ebf0"}}>{selP.fps}</b> · MOBA {selP.moba} · 體力 {selP.sta} · {selP.fpsRole}</div>
                </div>
              )}
            </div>
          )}

          {/* 賽末 */}
          {matchOver&&(
            <div style={{position:"absolute",inset:0,zIndex:55,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(4,6,12,0.7)",backdropFilter:"blur(4px)"}}>
              <div style={{textAlign:"center"}}>
                <div style={{color:sim.ctScore>sim.tScore?C.ctL:C.tL,fontSize:14,fontWeight:700,letterSpacing:"0.1em"}}>勝者</div>
                <div style={{color:"#fff",fontSize:26,fontWeight:900,margin:"4px 0"}}>{sim.ctScore>sim.tScore?CT_NAME:T_NAME}</div>
                <div style={{color:C.gray,fontSize:16,fontWeight:800}}><span style={{color:C.t}}>{sim.tScore}</span> : <span style={{color:C.ct}}>{sim.ctScore}</span></div>
                <button onClick={()=>{seek(0);setPlaying(true);}} style={{marginTop:12,background:`linear-gradient(135deg,${C.ct},#2563eb)`,border:"none",borderRadius:9,padding:"8px 20px",cursor:"pointer",color:"#fff",fontSize:12,fontWeight:800}}>↺ 重播</button>
              </div>
            </div>
          )}

          {roundOverlay&&!matchOver&&<RoundOverlay result={roundOverlay} frame={frame} onClose={()=>setRoundOverlay(null)}/>}
        </div>

        {/* 播放控制 */}
        <div style={{display:"flex",alignItems:"center",gap:5,marginTop:8,background:C.panel,borderRadius:11,border:`1px solid ${C.line}`,padding:"8px 9px"}}>
          {(()=>{const tb={width:28,height:30,borderRadius:7,background:"rgba(255,255,255,0.06)",border:"none",cursor:"pointer",color:"#cfd4dc",fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0};
            const prevRound=()=>{const t=sim.frames.findIndex(f=>f.rnd===Math.max(0,frame.rnd-1));seek(t<0?0:t);};
            const nextRound=()=>{const t=sim.frames.findIndex(f=>f.rnd===frame.rnd+1);seek(t<0?total-1:t);};
            return(<>
              <button onClick={prevRound} title="上一局" style={tb}>⏮</button>
              <button onClick={()=>seek(fIdx-5)} title="倒退10秒" style={tb}>⏪</button>
              <button onClick={()=>{if(matchOver)seek(0);setPlaying(p=>!p);}} style={{width:36,height:36,borderRadius:"50%",background:`linear-gradient(135deg,${C.ct},#2563eb)`,border:"none",cursor:"pointer",color:"#fff",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 3px 12px ${C.ct}55`}}>{playing?"❚❚":"▶"}</button>
              <button onClick={()=>seek(fIdx+5)} title="快進10秒" style={tb}>⏩</button>
              <button onClick={nextRound} title="下一局" style={tb}>⏭</button>
            </>);})()}
          <div style={{flex:1,minWidth:0}}>
            <input type="range" min={0} max={total-1} value={fIdx} onChange={e=>seek(+e.target.value)} style={{width:"100%",accentColor:C.ct,height:4}}/>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:1}}>
              <span style={{color:C.gray2,fontSize:8}}>回合 {frame.rnd+1}</span>
              <span style={{color:C.gray2,fontSize:8}}>{fIdx+1}/{total} 格</span>
            </div>
          </div>
          <div style={{display:"flex",gap:2,background:"rgba(255,255,255,0.05)",borderRadius:7,padding:2}}>
            {[1,2,4].map(s=>(<button key={s} onClick={()=>setSpeed(s)} style={{padding:"4px 6px",borderRadius:5,border:"none",cursor:"pointer",background:speed===s?C.ct:"transparent",color:speed===s?"#06121f":C.gray,fontSize:9,fontWeight:800}}>{s}×</button>))}
          </div>
        </div>

        {/* 工具列（賽前戰術已設定；地名常駐顯示；地圖隨機進入） */}
        <div style={{display:"flex",gap:6,marginTop:7}}>
          <button onClick={()=>setShowRoutes(r=>!r)} style={toolBtn(showRoutes)}>🧭 路線</button>
          <div style={{flex:1,display:"flex",alignItems:"center",gap:6,padding:"0 4px",color:C.gray2,fontSize:8.5}}>
            <span style={{color:C.t,fontWeight:800}}>{lib.t[tIdx]?.name}</span><span style={{opacity:0.5}}>vs</span><span style={{color:C.ct,fontWeight:800}}>{lib.ct[ctIdx]?.name}</span><span style={{opacity:0.55}}>· 賽前戰術</span>
          </div>
        </div>

        {/* 雙隊名單 */}
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <div style={{flex:1,background:C.panel,borderRadius:11,border:`1px solid ${C.t}22`,padding:"8px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,padding:"0 2px"}}>
              <span style={{color:C.tL,fontSize:9,fontWeight:800}}>🟠 {T_NAME}</span>
              <span style={{color:C.green,fontSize:8,fontWeight:700}}>💰 ${frame.players.filter(p=>p.side==="t").reduce((s,p)=>s+(p.money||0),0)} · {buyZh(frame.players.find(p=>p.side==="t")?.buyType)}</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {frame.players.filter(p=>p.side==="t").map(p=><PlayerRow key={p.id} p={p} selected={selected===p.id} onClick={setSelected}/>)}
            </div>
          </div>
          <div style={{flex:1,background:C.panel,borderRadius:11,border:`1px solid ${C.ct}22`,padding:"8px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,padding:"0 2px"}}>
              <span style={{color:C.ctL,fontSize:9,fontWeight:800}}>🔵 {CT_NAME}</span>
              <span style={{color:C.green,fontSize:8,fontWeight:700}}>💰 ${frame.players.filter(p=>p.side==="ct").reduce((s,p)=>s+(p.money||0),0)} · {buyZh(frame.players.find(p=>p.side==="ct")?.buyType)}</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {frame.players.filter(p=>p.side==="ct").map(p=><PlayerRow key={p.id} p={p} selected={selected===p.id} onClick={setSelected}/>)}
            </div>
          </div>
        </div>

        <div style={{textAlign:"center",color:C.gray2,fontSize:8,marginTop:10,lineHeight:1.5}}>
          拖曳旋轉 · 右鍵/Shift 或雙指拖移平移 · 滾輪/雙指縮放 · 點選手聚焦 · ⊕ 鈕回到自動導播<br/>
          Three.js WebGL 即時渲染 · 同一模擬引擎驅動畫面與數據
        </div>
      </div>

      <style>{`
        @keyframes pls{0%,100%{opacity:1}50%{opacity:0.25}}
        @keyframes slideL{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:translateX(0)}}
        @keyframes slideR{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
        @keyframes slideU{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pop{0%{opacity:0;transform:translateX(-50%) scale(0.6)}60%{transform:translateX(-50%) scale(1.08)}100%{opacity:1;transform:translateX(-50%) scale(1)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        *{box-sizing:border-box}
        input[type=range]{-webkit-appearance:none;appearance:none;background:rgba(255,255,255,0.12);border-radius:9px;outline:none}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;background:${C.ct};cursor:pointer;box-shadow:0 0 8px ${C.ct}}
        input[type=range]::-moz-range-thumb{width:13px;height:13px;border:none;border-radius:50%;background:${C.ct};cursor:pointer}
        button{font-family:inherit}
      `}</style>
    </div>
  );
}

function toolBtn(active){
  return {flex:1,padding:"7px 4px",borderRadius:8,border:`1px solid ${active?C.ct+"66":"transparent"}`,cursor:"pointer",background:active?`${C.ct}1c`:"rgba(255,255,255,0.04)",color:active?C.ctL:C.gray,fontSize:9.5,fontWeight:700};
}

return { EsportsFPS3D, buildMatchResult };
})();
const EsportsFPS3D = __FPS3D_MODULE.EsportsFPS3D;
const buildMatchResult = __FPS3D_MODULE.buildMatchResult;

export { EsportsFPS3D, buildMatchResult };
export default EsportsFPS3D;
