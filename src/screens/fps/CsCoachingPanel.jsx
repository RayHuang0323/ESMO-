import React,{useMemo} from 'react';
import {buildCsCoachingAdvice} from '../../battle/fps/csCoachingAdvice.js';
import {statZh} from '../../data/playerModel.js';
import './csCoaching.css';
export default function CsCoachingPanel({result,history,players,onTrainingRequest,trainingBlockedReason}){
 const advice=useMemo(()=>buildCsCoachingAdvice({result,history,players}),[result,history,players]);
 return <section className="cs-coaching" data-testid="cs-coaching-panel">
  <div className="cs-coaching-heading"><div><small>從覆盤到下一場</small><h2>下一個培養重點</h2></div><span>由實際戰報觀察</span></div>
  {!advice.cards.length&&<p className="cs-coaching-empty" data-testid="cs-coaching-insufficient">{advice.reason}<br/>可先累積同地圖、同角色的正式戰績，再回來覆核。</p>}
  <div className="cs-coaching-cards">{advice.cards.map(card=><article className="cs-coaching-card" key={card.playerId} data-player-id={card.playerId} data-course-id={card.course.id}>
   <div className="cs-coaching-person"><strong>{card.playerName}</strong><span>{card.alreadyTraining?'訓練中':card.capped?'已達潛力空間':'建議先覆核'}</span></div>
   <h3>{card.title}</h3><p>{card.observation}</p>
   <div className="cs-coaching-course"><span aria-hidden="true">{card.course.emoji}</span><strong>{card.course.name}</strong></div>
   <div className="cs-coaching-gains" data-testid="cs-coaching-gains">{Object.entries(card.preview.statChanges||{}).map(([key,change])=><span key={key}>{statZh(key)} <b>{change.before.toFixed(1)} → {change.after.toFixed(1)}</b></span>)}{card.course.id==='rest'&&<span>體力 <b>{card.preview.energyBefore} → {card.preview.energyAfter}</b></span>}</div>
   <p className="cs-coaching-cost">體力 {card.preview.energyBefore} → {card.preview.energyAfter} · 課程費用 $0.0萬</p>
   <details><summary>查看證據與預估依據</summary><p>{card.caveat}</p><p>僅使用相同地圖版本、相同角色的近 {card.samples.length} 場資料。對手與武器條件可能不同，不推論訓練必定提高勝率。</p><p>課程基礎 {card.course.hours} 天；實際排程在訓練中心確認。推進日曆仍有俱樂部日常開支。</p><p>{(card.preview.reasons||[]).join('／')}。選手目前狀態改變時，預估也會更新。</p><ul>{card.samples.map((sample,i)=><li key={sample.matchId}>樣本 {i+1}：{sample.hits}/{sample.shots} 發命中，首殺 {sample.openingKills}／首死 {sample.openingDeaths}</li>)}</ul></details>
   {trainingBlockedReason&&<p>{trainingBlockedReason}</p>}
   <button data-testid="cs-coaching-go-training" disabled={!onTrainingRequest||card.capped||Boolean(trainingBlockedReason)} onClick={()=>onTrainingRequest?.({playerId:card.playerId,courseId:card.course.id,matchId:card.matchId})}>{card.capped?'目前無可提升空間':card.alreadyTraining?'查看訓練進度':'前往訓練'}</button>
  </article>)}</div>
  <p className="cs-coaching-footnote">此處只提供建議與預估；是否安排課程由你決定，能力只會透過既有訓練流程成長。</p>
 </section>;
}
