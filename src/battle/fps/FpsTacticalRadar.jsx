import React,{memo,useMemo,useState} from 'react';
import {GC} from '../../ui/theme.js';
import {useIsMobile} from '../../ui/useViewport.js';
import './fpsTacticalRadar.css';

const RadarTerrain=memo(function RadarTerrain({map}){
 const routes=useMemo(()=>map.radarPolylines||[],[map]);
 return <g aria-hidden="true">
  <rect x="1" y="1" width="98" height="98" rx="2" fill={GC.bg}/>
  {routes.map((points,i)=><polyline key={i} points={points.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={GC.gray} strokeWidth="1.4" opacity=".42"/>)}
  {(map.radarObstacles||map.walls).map((w,i)=><rect key={i} x={w.x} y={w.y} width={w.w} height={w.h} fill={w.kind==='building'?GC.gray:GC.gold} opacity=".52"/>)}
  {Object.entries(map.sites).map(([key,p])=><g key={key}>{map.plantZones?.[key]?<rect data-plant-zone={key} x={map.plantZones[key].x} y={map.plantZones[key].y} width={map.plantZones[key].w} height={map.plantZones[key].h} fill={GC.gold} fillOpacity=".15" stroke={GC.gold} strokeWidth=".5"/>:<circle cx={p.x} cy={p.y} r="6" fill={GC.gold} opacity=".15"/>}<text x={p.x} y={p.y+2} fill={GC.gold} textAnchor="middle" fontSize="6" fontWeight="900">{key.toUpperCase()}</text></g>)}
  {(map.callouts||[]).filter(c=>c.short&&(!map.layoutId?.startsWith('esmo-foundry-circuit.')||c.priority===1)).map(c=><text key={c.l} data-area-name={c.l} aria-label={c.l} x={c.x} y={c.y+(c.priority===1?11:5)} fill={GC.blueL} stroke={GC.bg} strokeWidth=".6" paintOrder="stroke" textAnchor="middle" fontSize="6.6">{c.short.slice(0,2)}<title>{c.l}</title></text>)}
 </g>;
});

// One saved frame is the sole source. This never advances a simulation, looks
// up live opponents, interpolates a second timeline, or creates a WebGL canvas.
export default function FpsTacticalRadar({frame,map,selectedId}){
 const mobile=useIsMobile(),[expanded,setExpanded]=useState(!mobile);
 const carrier=frame.players.find(p=>p.hasBomb&&!p.dead);
 const bomb=frame.planted?frame.c4pos:frame.droppedBomb?.pos||carrier?.pos;
 const activeBomb=frame.planted&&!['defused','exploded'].includes(frame.bombState);
 return <aside className="fps-tactical-radar" data-testid="cs-tactical-radar" data-layout={map.layoutId} data-frame={frame.fi} data-round={frame.rnd} style={{'--radar-bg':GC.card,'--radar-line':GC.line,'--radar-text':GC.blueL}}>
  <button type="button" className="fps-radar-toggle" aria-label={expanded?'收合戰術小地圖':'展開戰術小地圖'} aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>⌖ <span>{expanded?'小地圖 −':'小地圖 ＋'}</span></button>
  {expanded&&<div className="fps-radar-panel"><svg viewBox="0 0 100 100" role="img" aria-label="戰術小地圖：雙方十人、炸彈與A／B區" data-testid="cs-radar-svg">
   <RadarTerrain map={map}/>
   {frame.players.map((p,i)=><g key={p.id} data-player-id={p.id} data-x={p.pos.x} data-y={p.pos.y} data-side={p.side} data-dead={String(Boolean(p.dead))} opacity={p.dead ? .35 : 1}>
    <circle cx={p.pos.x} cy={p.pos.y} r={selectedId===p.id?3:2.2} fill={p.side==='ct'?GC.blueL:GC.redL} stroke={selectedId===p.id?GC.gold:GC.bg} strokeWidth=".6"/>
    {!p.dead&&<path d="M 0 -1 L 4 0 L 0 1" fill={p.side==='ct'?GC.blueL:GC.redL} transform={`translate(${p.pos.x} ${p.pos.y}) rotate(${p.va||0})`}/>}
    <title>{i+1} · {p.name} · {p.side==='ct'?'CT':'T'} · {p.dead?'已陣亡':`${p.hp} HP`}{p.hasBomb?' · 攜帶C4':''}</title>
   </g>)}
   {bomb&&<g data-testid="cs-radar-c4" data-x={bomb.x} data-y={bomb.y} data-state={frame.planted?frame.bombState:frame.droppedBomb?'dropped':'carried'} opacity={frame.planted&&!activeBomb ? .4 : 1} transform={`translate(${bomb.x} ${bomb.y})`}><rect x="-2" y="-2" width="4" height="4" fill={GC.gold} stroke={GC.bg} strokeWidth=".5"/><text y="-3" textAnchor="middle" fill={GC.gold} fontSize="4">C4</text></g>}
  </svg><div className="fps-radar-legend"><span style={{color:GC.redL}}>● T</span><span style={{color:GC.blueL}}>● CT</span><span style={{color:GC.gold}}>◆ C4</span></div></div>}
 </aside>;
}
