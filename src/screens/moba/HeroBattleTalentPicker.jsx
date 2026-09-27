import React from 'react';
import { heroById } from '../../data/heroDatabase.js';
import { battleTalentOptions, selectBattleTalents } from '../../battle/moba/talents/heroBattleTalents.js';
import { GC } from '../../ui/theme.js';

/** Match-local hero Battle talents. Never writes player development talent points. */
export default function HeroBattleTalentPicker({ roster, selected = {}, onChange }) {
  const rows = Object.entries(roster ?? {}).filter(([seat, row]) => seat[0] === 'b' && battleTalentOptions(row.heroId).length);
  if (!rows.length) return null;
  const recommendations = selectBattleTalents(roster, selected).players;
  return <details data-battle-talent-picker style={{ background: GC.card, border: `1px solid ${GC.line}`, borderRadius: 12, padding: '10px 12px' }}>
    <summary style={{ cursor: 'pointer', color: GC.gold, fontSize: 14, fontWeight: 900, minHeight: 44, display: 'flex', alignItems: 'center' }}>
      英雄戰鬥天賦 · {rows.length} 位可選 <small style={{ color: GC.gray, marginLeft: 8, fontWeight: 400 }}>未調整時由 AI 依陣容選擇</small>
    </summary>
    <p style={{ color: GC.gray, fontSize: 11, margin: '3px 0 10px' }}>這是本場英雄的戰鬥效果，與選手成長天賦、訓練點數分開。</p>
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map(([seat, row]) => {
        const hero = heroById(row.heroId);
        const current = recommendations[seat]?.id;
        return <div key={seat} data-talent-seat={seat} style={{ background: GC.card2, border: `1px solid ${GC.line}`, borderRadius: 9, padding: 8 }}>
          <strong style={{ display: 'block', fontSize: 12, marginBottom: 7 }}>{hero?.zh ?? row.heroId} · {seat.toUpperCase()}</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(190px,100%),1fr))', gap: 6 }}>
            {battleTalentOptions(row.heroId).map((talent) => <button key={talent.id} type="button"
              data-talent-id={talent.id} aria-pressed={current === talent.id}
              onClick={() => onChange?.({ ...selected, [seat]: talent.id })}
              style={{ minHeight: 52, textAlign: 'left', padding: '7px 9px', borderRadius: 8,
                background: current === talent.id ? 'rgba(251,191,36,.13)' : GC.card,
                color: '#fff', border: `1px solid ${current === talent.id ? GC.gold : GC.line}`, cursor: 'pointer' }}>
              <b style={{ display: 'block', fontSize: 12, color: current === talent.id ? GC.gold : '#f3f4f6' }}>{talent.name}</b>
              <small style={{ display: 'block', color: GC.gray, lineHeight: 1.4 }}>{talent.description}</small>
            </button>)}
          </div>
        </div>;
      })}
    </div>
  </details>;
}
