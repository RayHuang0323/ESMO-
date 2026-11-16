import React from 'react';
import {calculateCourse,courseById,statZh} from '../../data/playerModel.js';
import {beforeAfter} from '../../platform/progress/growthLog.js';
import {GC,FONT,MONO} from '../../ui/theme.js';
import './csTrainingReview.css';
export default function CsTrainingReview({player,courseId,onConfirm,blockedReason}){
 const course=courseById(courseId);
 if(!player||!course)return <p data-testid="cs-training-review">找不到這項訓練建議，請重新選擇選手與課程。</p>;
 const preview=calculateCourse(player,course.id),entry=(player.growthLog||[]).find(e=>e.source==='training'&&e.courseId===course.id);
 const unavailable=Boolean(blockedReason)||Boolean(player.training)||course.id!=='rest'&&(player.energy??100)<course.energyCost;
 return <section className="cs-training-review" data-testid="cs-training-review" data-player-id={player.id} data-course-id={course.id} style={{'--coach-text':GC.blueL,'--coach-muted':GC.gray,'--coach-line':GC.line,'--coach-card':GC.card,'--coach-accent':GC.gold,'--coach-gain':GC.green,'--coach-bg':GC.bg,fontFamily:FONT,'--coach-mono':MONO}}>
  <small>來自賽後覆盤的培養建議</small><h2>{player.name} · {course.name}</h2>
  <p>請確認課程與預估。只有按下確認才會安排訓練。</p>
  <div className="cs-training-review-gains">{Object.entries(preview.statChanges||{}).map(([key,change])=><span key={key}>{statZh(key)} <b>{change.before.toFixed(1)} → {change.after.toFixed(1)}</b></span>)}</div>
  <p data-testid="cs-training-review-energy">體力 {preview.energyBefore} → {preview.energyAfter} · 課程費用 $0.0萬</p>
  {blockedReason&&<p>{blockedReason}</p>}
  {player.training?<p data-testid="cs-training-active">訓練中：{courseById(player.training.courseId)?.name} · 剩 {player.training.daysLeft}/{player.training.totalDays} 天</p>:<><button data-testid="cs-training-confirm" disabled={unavailable||course.id!=='rest'&&preview.totalGain<=0} onClick={onConfirm}>{entry?'再次安排':'確認安排'}「{course.name}」</button>{entry&&<p>最近一次課程已完成，可先到下一場檢查表現，再決定是否繼續訓練。</p>}</>}
  <p>推進訓練日後才會完成；實際成長受年齡、潛力、學習力及體力影響。</p>
  {entry&&<details open data-testid="cs-training-saved-growth"><summary>最近一次「{course.name}」完成紀錄 · 第 {entry.day} 天</summary><div className="cs-training-review-gains">{Object.keys(entry.gains||{}).map(key=>{const values=beforeAfter(entry,key);return <span key={key}>{statZh(key)} <b>{values?`${values.from.toFixed(1)} → ${values.to.toFixed(1)}`:`+${entry.gains[key]}`}</b></span>;})}</div><p>來自已儲存的訓練成長紀錄；不以目前能力回推過去。</p></details>}
 </section>;
}
