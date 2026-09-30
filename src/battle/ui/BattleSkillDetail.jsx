import React from 'react';
import { buildHeroSkillDetail, PASSIVE_STATUS } from '../moba/skills/heroSkillDetail.js';

//  Mobile UI P1：閱讀層次改成「現在能不能用 → 實戰數值 → 下一級 → 作用對象 → 英雄設定描述」。
//  設定描述是散文、可能含未實作細節，收進可展開區塊，不再排在正式數值前面。
//  被動 P 沒有進正式對戰：頂部直接講清楚「未實裝／本場不生效」，只展示設定描述。
export default function BattleSkillDetail({ heroId, slot, live, selectedTalentId = null, replay = false, mobile = false, style, onClose }) {
  const detail = buildHeroSkillDetail(heroId, slot, live, { replay, selectedTalentId });
  if (!detail) return null;
  const passive = detail.slot === 'P';
  const tone = passive ? (detail.passiveLive ? 'ready' : 'passive') : !detail.gameplayAvailable ? 'unavailable' : detail.ready === true ? 'ready' : detail.ready === false ? 'cooldown' : 'unknown';
  const kind = passive ? (detail.passiveLive ? PASSIVE_STATUS.liveKind : detail.passiveInfo ? PASSIVE_STATUS.infoKind : PASSIVE_STATUS.kind) : detail.gameplayAvailable ? '主動技能' : '主動技能 · 無正式規則';
  return <aside className={`observer-skill-detail ${mobile ? 'mobile' : 'desktop'}`} style={style}
    role="dialog" aria-label={`${detail.slot} ${detail.name}技能詳情`} data-skill-detail={`${heroId}:${slot}`}
    data-skill-gameplay={detail.gameplayAvailable ? 'live' : 'not-implemented'}>
    <header className="observer-skill-detail-head">
      <img src={detail.iconUrl} width={mobile ? 44 : 52} height={mobile ? 44 : 52} alt="" />
      <span><small>{detail.slot} · {kind}</small>
        <strong>{detail.name}</strong>
        <em className={`observer-skill-status ${tone}`} data-testid="skill-detail-status">{detail.availability}</em></span>
      <button type="button" onClick={onClose} aria-label="關閉技能詳情">✕</button>
    </header>
    <div className="observer-skill-detail-body">
      {passive && detail.passiveLive && <>
        <p className="observer-skill-footnote" data-testid="passive-live">此被動已接入正式對戰（Hero Passive Runtime v2）：觸發與效果來自引擎同一份狀態，護盾／減傷／加速／減速／控制會出現在英雄狀態列，重播保存同一組值。</p>
        {detail.passiveNote && <p className="observer-skill-footnote" data-testid="passive-note">實作說明：{detail.passiveNote}</p>}
        <h4>英雄設定描述</h4>
        <p>{detail.description || '尚無英雄設定說明。'}</p>
      </>}
      {passive && !detail.passiveLive && detail.passiveInfo && <>
        <p className="observer-skill-footnote" data-testid="passive-info">資訊類被動：{detail.passiveNote ?? '只提供資訊，不影響戰鬥'}。對戰模擬沒有「視野資訊」這一層，所以它不改變戰鬥結果。</p>
        <h4>英雄設定描述</h4>
        <p>{detail.description || '尚無英雄設定說明。'}</p>
      </>}
      {passive && !detail.passiveLive && !detail.passiveInfo && <>
        <p className="observer-skill-warning" data-testid="passive-not-live">此被動本場沒有生效（規則未開啟，或此段沒有被動即時狀態），不影響戰鬥結果。下面只是英雄設定描述。</p>
        <h4>英雄設定描述（未生效）</h4>
        <p>{detail.description || '尚無英雄設定說明。'}</p>
      </>}
      {!passive && !detail.gameplayAvailable && <p className="observer-skill-warning">此技能沒有正式對戰規則，本場不會施放。</p>}
      {detail.gameplayAvailable && <>
        <div className="observer-skill-keyvals">
          <span>技能等級 <b>{detail.level.supported ? `Lv${detail.level.current}/${detail.level.cap}` : '未保存'}</b></span><span>當前冷卻 <b>{detail.baseCooldown} 秒</b></span>
          <span>目前狀態 <b>{detail.availability}</b></span><span>射程 <b>{detail.rule.range}</b></span>
        </div>
        <p className="observer-skill-footnote">英雄設定描述（最下方）可能含未實作細節；實戰效果以以下正式規則為準。</p>
        <h4>實戰效果數值</h4>
        <div className="observer-skill-values">
          {detail.rows.length ? detail.rows.map((row) => <span key={row.key}><small>{row.label}</small><b>{row.value}</b></span>)
            : <span>此技能沒有額外數值欄位。</span>}
        </div>
        {detail.level.supported ? detail.level.next
          ? <section className="observer-skill-next" data-skill-next-level={detail.level.next}>
              <h4>下一級 Lv{detail.level.next} · 本場英雄 Lv{detail.level.nextAt} 解鎖</h4>
              <div className="observer-skill-values">{detail.nextLevel?.map((change) =>
                <span key={change.field}><small>{change.label}</small><b>{change.fromText} → {change.toText}</b></span>)}</div>
            </section>
          : <p className="observer-skill-warning">此技能已達滿級。</p>
          : <p className="observer-skill-warning">這段資料未保存正式技能等級；不推測下一級數值。</p>}
        <h4>作用對象</h4>
        <div className="observer-skill-targets">
          {Object.entries(detail.targets).map(([target, value]) => <span key={target}>
            <b>{({ hero: '英雄', minion: '小兵', jungle: '野怪', boss: 'Boss' })[target]}</b><small>{value}</small>
          </span>)}
        </div>
        <p className="observer-skill-footnote">命中仍需符合射程、目標與時機；傷害會受本場戰力、抗性及增減益影響。</p>
        <details className="observer-skill-lore">
          <summary>英雄設定描述</summary>
          <p>{detail.description || '尚無英雄設定說明。'}</p>
        </details>
      </>}
    </div>
  </aside>;
}
