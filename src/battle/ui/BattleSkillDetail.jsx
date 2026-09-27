import React from 'react';
import { buildHeroSkillDetail } from '../moba/skills/heroSkillDetail.js';

export default function BattleSkillDetail({ heroId, slot, live, selectedTalentId = null, replay = false, mobile = false, onClose }) {
  const detail = buildHeroSkillDetail(heroId, slot, live, { replay, selectedTalentId });
  if (!detail) return null;
  return <aside className={`observer-skill-detail ${mobile ? 'mobile' : 'desktop'}`}
    role="dialog" aria-label={`${detail.slot} ${detail.name}技能詳情`} data-skill-detail={`${heroId}:${slot}`}>
    <header className="observer-skill-detail-head">
      <img src={detail.iconUrl} width="52" height="52" alt="" />
      <span><small>{detail.slot} · {detail.gameplayAvailable ? '主動技能' : '被動資料'}</small>
        <strong>{detail.name}</strong><em>{detail.availability}</em></span>
      <button type="button" onClick={onClose} aria-label="關閉技能詳情">✕</button>
    </header>
    <div className="observer-skill-detail-body">
      <h4>英雄設定描述</h4>
      <p>{detail.description || '尚無英雄設定說明。'}</p>
      {detail.gameplayAvailable && <p className="observer-skill-warning">設定描述可能包含尚未實作的細節；實戰效果以以下正式規則為準。</p>}
      {!detail.gameplayAvailable && <p className="observer-skill-warning">被動目前只有資料／描述與圖示，不會在本場觸發。</p>}
      {detail.gameplayAvailable && <>
        <div className="observer-skill-keyvals">
          <span>技能等級 <b>未分級</b></span><span>基礎冷卻 <b>{detail.baseCooldown} 秒</b></span>
          <span>目前狀態 <b>{detail.availability}</b></span><span>射程 <b>{detail.rule.range}</b></span>
        </div>
        <h4>實戰效果數值</h4>
        <div className="observer-skill-values">
          {detail.rows.length ? detail.rows.map((row) => <span key={row.key}><small>{row.label}</small><b>{row.value}</b></span>)
            : <span>此技能沒有額外數值欄位。</span>}
        </div>
        <h4>作用對象</h4>
        <div className="observer-skill-targets">
          {Object.entries(detail.targets).map(([target, value]) => <span key={target}>
            <b>{({ hero: '英雄', minion: '小兵', jungle: '野怪', boss: 'Boss' })[target]}</b><small>{value}</small>
          </span>)}
        </div>
        <p className="observer-skill-footnote">命中仍需符合射程、目標與時機；傷害會受本場戰力、抗性及增減益影響。</p>
        <p className="observer-skill-warning">下一級：目前沒有正式技能升級演算，因此不提供虛構的提升數值。</p>
      </>}
    </div>
  </aside>;
}
