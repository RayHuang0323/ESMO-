import React, { useEffect, useState } from 'react';
import { useGameStore } from '../../useGameStore.js';
import { useCameraStore } from '../cameraStore.js';
import { useBattleStore } from '../battleStore.js';
import { heroById } from '../../data/heroDatabase.js';
import HeroPortrait from '../../ui/HeroPortrait.jsx';
import { GC } from '../../ui/theme.js';
import { useIsMobile } from '../../ui/useViewport.js';
import { SUMMONER_SPELLS } from '../moba/mobaHeroLoadout.js';
import BattleHeroSheet from './BattleHeroSheet.jsx';
//  Item System M3b：裝備 HUD。只讀 selector（selectHudItems），元件都在 ./items/。
import { selectHudItems } from '../moba/items/itemsUiSelectors.js';
import { GoldChip } from './items/GoldChip.jsx';
import { SeatItemPips, SeatItemsExpanded } from './items/SeatItemsCompact.jsx';
import { MobileItemsSheet } from './items/MobileItemsSheet.jsx';
import { BattlePurchaseToasts } from './items/BattlePurchaseToasts.jsx';
import { ItemInfoCard } from './items/HeroItemDetail.jsx';
import { selectPlayerItemsView } from '../moba/items/itemsViewModel.js';
import { ITEM_TOAST_MOBILE_BOTTOM } from './battleLayout.js';
import './battleObserver.css';

// Only presentation tokens; all battle values remain owned by snapshot / saved replay.
export const observerTokens = { '--battle-bg': GC.bg, '--battle-card': GC.card,
  '--battle-line': GC.line, '--battle-gold': GC.gold, '--battle-blue': GC.blueL,
  '--battle-red': GC.redL, '--battle-green': GC.green, '--battle-muted': GC.gray };
const pct = v => Math.round(Math.max(0, Math.min(1, v ?? 0)) * 100);
const gold = v => Number.isFinite(v) ? `$${(v / 10000).toFixed(1)}萬` : '—';

//  Battle UX hotfix：手機「點 Gold 看出裝」的一次性提示。只是每位觀看者自己的便利狀態，
//  讀寫失敗（無痕、被封鎖）一律當成「沒看過」，不影響任何戰鬥資料。
const ITEMS_HINT_KEY = 'esmo.ui.itemsChipHintSeen.v1';
const readHintSeen = () => { try { return window.localStorage.getItem(ITEMS_HINT_KEY) === '1'; } catch { return false; } };
const writeHintSeen = () => { try { window.localStorage.setItem(ITEMS_HINT_KEY, '1'); } catch { /* 便利狀態，寫不進去就下次再提示 */ } };

export function ObserverPanel({ snapshot, roster = {}, replay = false, events = [] }) {
  const mobile = useIsMobile();
  const focusId = useCameraStore(s => s.heroId);
  const [selected, setSelected] = useState(null);
  const [teamOpen, setTeamOpen] = useState(false);
  const [detail, setDetail] = useState(false);
  const [skill, setSkill] = useState(null);
  //  M3b：桌機十人列「裝備視圖」與手機裝備 sheet（純呈現狀態）
  const [itemsView, setItemsView] = useState(false);
  const [itemsSheet, setItemsSheet] = useState(false);
  //  Battle UX hotfix：桌面十人列 hover 的裝備資訊卡、手機裝備入口的一次性提示
  const [hoverItem, setHoverItem] = useState(null);
  const [chipHint, setChipHint] = useState(() => !readHintSeen());
  useEffect(() => {
    if (!chipHint) return undefined;
    const t = setTimeout(() => { setChipHint(false); writeHintSeen(); }, 8000);
    return () => clearTimeout(t);
  }, [chipHint]);
  const players = snapshot?.players ?? [];
  //  M3b：只有「現場對戰、且本場有裝備系統」才讀。重播或 itemsV1 OFF ⇒ null ⇒
  //  下面所有裝備 JSX 都不渲染，既有 HUD（含「裝備 · 未提供」佔位）逐字維持原樣。
  const hudItems = replay ? null : selectHudItems(snapshot);
  const p = players.find(x => x.id === (selected ?? focusId)) ?? players[0];
  if (!p) return null;
  const r = roster?.[p.id] ?? {};
  const hero = heroById(r.heroId) ?? {};
  const mine = hudItems?.[p.id] ?? null;
  const showItemsView = !!hudItems && itemsView && !mobile;
  const itemsPlayerView = itemsSheet && mine ? selectPlayerItemsView(snapshot, p.id) : null;
  const onRailHover = (itemId, rect) => setHoverItem(itemId && rect ? { itemId, x: rect.right + 8, y: rect.top } : null);
  const toggleItemsSheet = () => { setItemsSheet(v => !v); if (chipHint) { setChipHint(false); writeHintSeen(); } };
  const pick = id => { setSelected(id); setSkill(null); setTeamOpen(false); useCameraStore.getState().focusHero(id); };
  const portrait = (x, size) => <HeroPortrait heroId={roster?.[x.id]?.heroId} size={size} radius={3}
    alt={roster?.[x.id]?.hero ?? x.id} fallback={<span className="observer-fallback">{roster?.[x.id]?.hero?.slice(0, 1) ?? x.id}</span>} />;
  const rail = side => <div className={`observer-rail ${side}`} aria-label={side === 'blue' ? '藍方英雄' : '紅方英雄'}>
    {players.filter(x => x.side === side).map(x => {
      const hi = hudItems?.[x.id] ?? null;
      const name = roster?.[x.id]?.player ?? x.id;
      return <button key={x.id} data-seat={x.id} data-testid="observer-hero"
        data-items-gold={hi ? hi.unspent : undefined} data-items-slots={hi ? hi.slots.map(s => s.itemId ?? '').join(',') : undefined}
        className={`observer-seat ${x.dead ? 'dead' : ''}`} aria-pressed={p.id === x.id} onClick={() => pick(x.id)}>
        <span className="observer-avatar">{portrait(x, mobile ? 28 : 38)}<b>{x.dead ? Number.isFinite(x.respawn) ? `${Math.ceil(x.respawn)}s` : '陣亡' : x.mlv ?? '—'}</b></span>
        {!hi ? <span className="observer-seat-info"><strong>{name}</strong>
          <span className="observer-hp"><i style={{ width: `${x.dead ? 0 : pct(x.hp)}%` }} /></span>
          <span>{x.k ?? '—'} / {x.d ?? '—'} / {x.a ?? '—'} <em>{x.dead ? '陣亡' : x.state}</em></span>
          {!!x.buffs?.length && <span className="observer-buffs">{x.buffs.map(b => <em key={b.id}>{({red:'紅',blue:'藍',dragon:'龍',baron:'巴龍'})[b.id] ?? '增益'}{b.id === 'dragon' ? `×${b.stacks}` : `${Math.ceil(b.remaining ?? 0)}s`}</em>)}</span>}
        </span>
        : showItemsView ? <span className="observer-seat-info items-view">
          <span className="observer-seat-head"><strong>{name}</strong><GoldChip amount={hi.unspent} size="xs" /></span>
          <SeatItemsExpanded hud={hi} onHover={onRailHover} />
        </span>
        : <span className="observer-seat-info">
          <span className="observer-seat-head"><strong>{name}</strong><SeatItemPips hud={hi} /></span>
          <span className="observer-hp"><i style={{ width: `${x.dead ? 0 : pct(x.hp)}%` }} /></span>
          <span className="observer-seat-line"><span>{x.k ?? '—'} / {x.d ?? '—'} / {x.a ?? '—'}</span><em>{x.dead ? '陣亡' : x.state}</em><GoldChip amount={hi.unspent} size="xs" /></span>
          {!!x.buffs?.length && <span className="observer-buffs">{x.buffs.map(b => <em key={b.id}>{({red:'紅',blue:'藍',dragon:'龍',baron:'巴龍'})[b.id] ?? '增益'}{b.id === 'dragon' ? `×${b.stacks}` : `${Math.ceil(b.remaining ?? 0)}s`}</em>)}</span>}
        </span>}
      </button>;
    })}
  </div>;
  const rootClass = `observer-ui ${mobile ? 'mobile' : 'desktop'} ${replay ? 'replay' : ''} ${teamOpen || detail || (itemsSheet && mine) ? 'sheet-open' : ''} ${hudItems ? 'items-on' : ''} ${showItemsView ? 'items-view' : ''}`;
  return <div className={rootClass} style={observerTokens} data-items-ts={hudItems ? snapshot.ts : undefined}>
    {(!mobile || teamOpen) && <div className={teamOpen ? 'observer-team-sheet' : 'observer-teams'}>
      {teamOpen && <><header><strong>雙方隊伍</strong><button onClick={() => setTeamOpen(false)}>關閉 ✕</button></header><p>{hudItems ? '選擇英雄以跟隨視角。本場尚未提供魔力資訊。' : '選擇英雄以跟隨視角。本場尚未提供裝備與魔力資訊。'}</p></>}
      {rail('blue')}{rail('red')}
    </div>}
    <section className="observer-dock" aria-label="觀戰英雄" data-testid="observer-dock">
      <button className="observer-identity" onClick={() => setDetail(v => !v)} aria-label="查看英雄戰鬥資訊">
        <span className="observer-avatar">{portrait(p, mobile ? 40 : 60)}<b>{p.mlv ?? '—'}</b></span>
        <span><small>觀戰英雄</small><strong>{hero.zh ?? r.hero ?? p.id}</strong><small>{r.player ?? p.id}</small></span>
      </button>
      <div className="observer-vitals">
        <div className="observer-mobile-name"><strong>{hero.zh ?? r.hero ?? p.id}</strong><span>{r.player ?? p.id} · Lv.{p.mlv ?? '—'}</span>
          {mine && <button className="observer-items-chip" data-touch data-items-chip={p.id} data-items-gold={mine.unspent}
            onClick={toggleItemsSheet} aria-expanded={itemsSheet} aria-label={`${hero.zh ?? p.id}的裝備與金錢：點開看目前出裝`}>
            <span className="observer-items-chip-face"><span className="observer-items-chip-label" aria-hidden="true">🛒 裝備</span><SeatItemPips hud={mine} /><GoldChip amount={mine.unspent} size="xs" /><span className="observer-items-chip-caret" aria-hidden="true">›</span></span>
            {chipHint && mobile && !replay && <span className="observer-items-chip-hint" data-testid="items-chip-hint" role="note">點這裡看目前出裝</span>}
          </button>}
        </div>
        <div className="observer-health"><i style={{ width: `${p.dead ? 0 : pct(p.hp)}%` }} /><b>{p.dead ? Number.isFinite(p.respawn) ? `陣亡 · ${Math.ceil(p.respawn)}秒復活` : '陣亡 · 未保存復活時間' : `生命 ${pct(p.hp)}%`}</b></div>
        <div className="observer-xp" title={Number.isFinite(p.mxp) ? `經驗 ${p.mxp} / ${p.mxpNext || '滿等'}` : '此段未保存經驗'}><i style={{ width: `${Number.isFinite(p.mxp) ? p.mxpNext > 0 ? pct(p.mxp / p.mxpNext) : 100 : 0}%` }} /></div>
        <div className="observer-stats"><span>{p.k ?? '—'} / {p.d ?? '—'} / {p.a ?? '—'}</span><span>{hudItems ? `總收入 ${gold(p.gold)}` : gold(p.gold)}</span><span>{p.rc > 0 ? `回城 ${Math.ceil(p.rc)}s` : p.state}</span></div>
      </div>
      <div className="observer-abilities" aria-label="英雄技能說明">
        {['P', 'Q', 'W', 'E', 'R'].map((key, i) => <button key={key} className={`observer-ability ability-${i}`} aria-pressed={skill === key}
          onClick={() => setSkill(skill === key ? null : key)} aria-label={`${key} ${hero[key] ?? '尚無技能資料'}${p.heroSkills?.[key] ? p.heroSkills[key].ready ? ' 可用' : ` ${Math.ceil(p.heroSkills[key].cd)}秒冷卻` : ''}`}>
          <span className="observer-sigil">{['◈', '╱', '◇', '⌁', '✧'][i]}</span><b>{key}</b><small>{p.heroSkills?.[key] ? p.heroSkills[key].ready ? '可用' : `${Math.ceil(p.heroSkills[key].cd)}s` : '說明'}</small>
        </button>)}
      </div>
      <div className="observer-spells" aria-label="召喚師技能冷卻">
        {[0, 1].map(i => { const s = p.sp?.[i]; const meta = SUMMONER_SPELLS[s?.id ?? (replay ? r.spells?.[i] : null)];
          return <button key={i} className={`observer-spell ${s?.ready ? 'ready' : ''}`} onClick={() => setSkill(`spell${i}`)}
            aria-label={`${meta?.zh ?? (replay ? '技能' : '未配置')} ${s?.ready ? '可用' : s?.id ? `${Math.ceil(s.cd)}秒` : replay ? '冷卻未保存' : ''}`}>
            <span>{meta?.icon ?? '—'}</span><b>{s?.id ? s.ready ? '可用' : `${Math.ceil(s.cd)}s` : replay ? '未保存' : '—'}</b>
          </button>; })}
      </div>
      {mine
        ? <button className="observer-equipment items" data-items-dock={p.id} data-items-gold={mine.unspent}
            onClick={toggleItemsSheet} aria-expanded={itemsSheet} aria-label={`${hero.zh ?? p.id}的裝備：看目前出裝、下一件與金錢`}>
            <SeatItemPips hud={mine} /><GoldChip amount={mine.unspent} size="xs" /><small>{itemsSheet ? '收起裝備' : '裝備詳情 ›'}</small>
          </button>
        : <button className="observer-equipment" onClick={() => setSkill(skill === 'items' ? null : 'items')}><span>◇ ◇ ◇</span><small>裝備 · 未提供</small></button>}
      <button className="observer-team-toggle" onClick={() => setTeamOpen(v => !v)} aria-expanded={teamOpen}>隊伍</button>
      {skill && <div className="observer-tooltip" role="status"><button onClick={() => setSkill(null)} aria-label="關閉技能說明">✕</button>
        {skill === 'items' ? '本場尚未提供裝備與魔力資訊。' : skill.startsWith('spell')
          ? (() => { const i = Number(skill.slice(-1)); const s = p.sp?.[i]; const m = SUMMONER_SPELLS[s?.id ?? (replay ? r.spells?.[i] : null)]; return replay && !s ? `${m?.zh ?? '技能'} · 此份重播未保存冷卻資訊。` : m ? `${m.zh} · ${m.desc ?? ''}` : '此席位未配置技能。'; })()
          : `${skill} · ${hero[skill] ?? '尚無技能說明'}。${p.heroSkills?.[skill] ? p.heroSkills[skill].ready ? '技能可用。' : `冷卻剩餘 ${Math.ceil(p.heroSkills[skill].cd)} 秒。` : '個別英雄技能冷卻尚未提供。'}`}
      </div>}
    </section>
    {itemsSheet && mine && <MobileItemsSheet hud={hudItems} focusId={p.id} roster={roster}
      onPick={pick} onClose={() => setItemsSheet(false)} bottom={mobile ? ITEM_TOAST_MOBILE_BOTTOM : 150}
      layout={mobile ? 'mobile' : 'desktop'}
      nextItem={itemsPlayerView?.nextItem ?? null} buildComplete={!!itemsPlayerView?.buildComplete}
      teamView={mobile ? null : itemsView} onToggleTeamView={mobile ? null : () => setItemsView(v => !v)}
      onOpenDetail={() => { setItemsSheet(false); setSkill(null); setDetail('items'); }} />}
    {!mobile && showItemsView && hoverItem && <div className="observer-item-tip" data-testid="item-hover-card"
      style={{ left: hoverItem.x, top: hoverItem.y }}><ItemInfoCard itemId={hoverItem.itemId} compact /></div>}
    {hudItems && <BattlePurchaseToasts snapshot={snapshot} roster={roster} />}
    <div className="observer-killfeed" aria-live="polite">{events.filter(e => ['KILL','FIRST_BLOOD','MULTI_KILL','ACE'].includes(e.type) && snapshot.ts - e.t < 12).slice(-3).map(e => <div key={e.id} className={`observer-kill ${e.side}`}>
      {e.data?.killer && <HeroPortrait heroId={roster?.[e.data.killer]?.heroId} size={28} radius={2} alt="" />}
      <span>{e.type === 'FIRST_BLOOD' ? '首殺' : e.type === 'ACE' ? '團滅' : e.type === 'MULTI_KILL' ? '連殺' : '擊殺'}<strong>{roster?.[e.data?.killer]?.player ?? e.text}</strong></span>
      {e.data?.victim && <HeroPortrait heroId={roster?.[e.data.victim]?.heroId} size={28} radius={2} alt={roster?.[e.data.victim]?.player ?? e.data.victim} />}
    </div>)}</div>
    {detail && !replay && <BattleHeroSheet key={`${p.id}-${detail === 'items' ? 'items' : 'battle'}`} heroId={r.heroId} heroName={hero.zh ?? r.hero} playerName={r.player}
      playerId={p.id} side={p.side} spells={r.spells} lane={r.lane} onClose={() => setDetail(false)}
      initialTab={detail === 'items' && hudItems ? 'items' : 'battle'} />}
    {detail && replay && <div className="observer-replay-detail"><button onClick={() => setDetail(false)}>關閉 ✕</button>
      <strong>{hero.zh ?? r.hero} · 重播紀錄</strong><p>生命 {pct(p.hp)}% · 等級 {p.mlv ?? '—'}</p><p>{p.state ?? '本段未保存狀態'}</p>
    </div>}
  </div>;
}

export default function BattleObserverHUD(props) {
  const snapshot = useGameStore(s => s.snapshot);
  const events = useBattleStore(s => s.events);
  return <ObserverPanel {...props} snapshot={snapshot} events={events} />;
}
