// Dashboard — ESMO Design System v1 first production surface.
//
// This screen is a presentation adapter only.  Navigation callbacks and
// profileStore selectors stay the same as the previous Home; no route, Store
// schema, contract, or battle logic is introduced here.
import React, { useMemo, useRef, useState } from "react";
import { useProfileStore } from "../platform/profileStore.js";
import ActiveMatchCard from "./common/ActiveMatchCard.jsx";
import { resolveSponsor } from "../platform/economy/sponsors.js";
import { GC } from "../ui/theme.js";
import { ESMO_CSS_VARS } from "../ui/designSystem.js";
import EsmoIcon from "../ui/EsmoIcon.jsx";
import { useIsHomeMobile } from "../ui/useViewport.js";
import { useDashboardMotion } from "./dashboard/useDashboardMotion.js";
import "./dashboard/dashboard.css";

const numberOf = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const money = (value) => `$${(numberOf(value) / 10000).toFixed(1)}萬`;
const signedMoney = (value) => `${numberOf(value) >= 0 ? "+" : "−"}${money(Math.abs(numberOf(value)))}`;
const compactWan = (value) => `${numberOf(value).toFixed(2).replace(/\.?(0+)$/, "")}萬`;
const formatFans = (value) => {
  const fans = numberOf(value);
  return fans >= 10000 ? `${(fans / 10000).toFixed(1).replace(/\.0$/, "")}萬` : fans.toLocaleString("zh-Hant");
};

const NAV = {
  notify: "inbox",
  finance: "finance",
  sponsor: "sponsor",
  roster: "roster",
  team: "team",
  training: "training",
  recruit: "recruit",
  cs: "csPrep",
  talent: "talentPick",
  development: "teamDevelopment",
  newgame: "newGame",
};

const MODE_CONFIG = {
  moba: { name: "MOBA", kicker: "MAIN STAGE", meta: "5v5 · 即時對戰", icon: "signal", color: GC.purp, action: "進入賽前" },
  cs: { name: "CS", kicker: "TACTICAL UNIT", meta: "訓練賽 · 戰術準備", icon: "target", color: GC.gold, action: "開始準備" },
  bracket: { name: "賽事", kicker: "SEASON CIRCUIT", meta: "賽程 · 排名 · 目標", icon: "trophy", color: GC.gold, action: "查看賽程" },
};

function IconBadge({ name, accent = GC.green, size = 17 }) {
  return (
    <span className="esmo-icon-badge" style={{ "--accent": accent }}>
      <EsmoIcon name={name} size={size} />
    </span>
  );
}

function SectionHeading({ label, title, note }) {
  return (
    <div className="esmo-section-heading">
      <div>
        <div className="esmo-section-label">{label}</div>
        <h2 className="esmo-section-heading__title">{title}</h2>
      </div>
      {note && <div className="esmo-section-heading__note">{note}</div>}
    </div>
  );
}

function TeamHero({ team, meta, unread, xpPercent, onInbox }) {
  const achievement = numberOf(team.achievement ?? meta.achievement);
  const level = numberOf(team.lv ?? meta.lv);
  const xp = numberOf(team.xp ?? meta.xp);
  const xpMax = numberOf(team.xpMax ?? meta.xpMax, 1);
  const week = numberOf(meta.week, 1);
  const days = numberOf(meta.days, 0);
  const fans = formatFans(meta.fans);

  return (
    <header className="esmo-hero" data-dashboard-reveal>
      <div className="esmo-hero__ambient" data-dashboard-ambient />
      <div className="esmo-hero__topline">
        <div className="esmo-hero__eyebrow">
          <span className="esmo-pulse" data-dashboard-pulse />
          TEAM COMMAND CENTER
        </div>
        <button className="esmo-status-action" type="button" onClick={onInbox} aria-label="開啟收件匣">
          <EsmoIcon name="inbox" size={15} />
          <span className="esmo-status-action__label">收件匣</span>
          {unread > 0 && <span className="esmo-status-action__count">{unread}</span>}
        </button>
      </div>

      <div className="esmo-hero__main">
        <div className="esmo-hero__copy">
          <div className="esmo-hero__identity">
            <div className="esmo-hero__crest" aria-label={`${team.name ?? "戰隊"} 隊徽`}>
              {team.emoji ?? "◆"}
              <span className="esmo-hero__crest-badge">{achievement}</span>
            </div>
            <div className="esmo-hero__copy">
              <div className="esmo-hero__kicker">{team.tag ?? "ESMO SQUAD"}</div>
              <h1 className="esmo-hero__title">{team.name ?? "未命名戰隊"}</h1>
              <p className="esmo-hero__subtitle">這是你的戰隊總部。掌握本週節奏，先處理最重要的決策，再把隊伍送上舞台。</p>
              <div className="esmo-hero__meta-row">
                <span className="esmo-hero__meta"><strong>第 {week} 週</strong></span>
                <span className="esmo-hero__meta"><strong>{fans}</strong> 支持者</span>
                <span className="esmo-hero__meta"><strong>{days}</strong> 天營運</span>
              </div>
            </div>
          </div>
        </div>

        <div className="esmo-hero__aside">
          <div>
            <div className="esmo-hero__funds-label">OPERATING FUNDS</div>
            <div className="esmo-hero__funds-value">{money(team.gold ?? 0)}</div>
            <div className="esmo-hero__funds-note">可用資金 · 由財務模組提供</div>
          </div>
          <div className="esmo-hero__stats">
            <div className="esmo-stat"><div className="esmo-stat__label">LEVEL</div><div className="esmo-stat__value">Lv. {level}</div></div>
            <div className="esmo-stat"><div className="esmo-stat__label">XP</div><div className="esmo-stat__value">{compactWan(xp)}</div></div>
            <div className="esmo-stat"><div className="esmo-stat__label">BADGE</div><div className="esmo-stat__value">#{achievement}</div></div>
          </div>
        </div>
      </div>

      <div className="esmo-hero__xp">
        <div className="esmo-hero__xp-topline">
          <span>TEAM GROWTH / XP</span>
          <strong>{compactWan(xp)} / {compactWan(xpMax)}</strong>
        </div>
        <div className="esmo-hero__xp-track" aria-label={`戰隊 XP ${Math.round(xpPercent)}%`}>
          <div className="esmo-hero__xp-fill" data-dashboard-progress style={{ transform: `scaleX(${Math.max(0, Math.min(1, xpPercent / 100))})` }} />
        </div>
      </div>
    </header>
  );
}

function ActiveMatchSection({ hasActiveMatch, onResumeActive }) {
  if (!hasActiveMatch) return null;
  return (
    <section className="esmo-section" data-dashboard-reveal>
      <SectionHeading label="PRIORITY ACTION" title="目前對戰" note="掌握當前比賽節奏" />
      <ActiveMatchCard compact onResume={onResumeActive} />
    </section>
  );
}

function NextActions({ actions }) {
  return (
    <section className="esmo-section" data-dashboard-reveal>
      <SectionHeading label="NEXT ACTIONS" title="接下來做什麼" note="把注意力留給真正重要的事" />
      <div className="esmo-action-grid">
        {actions.map((item, index) => (
          <button
            key={item.id}
            className="esmo-card esmo-interactive esmo-action-card"
            type="button"
            onClick={item.onClick}
            style={{ "--accent": item.accent }}
          >
            <div className="esmo-action-card__top">
              <IconBadge name={item.icon} accent={item.accent} />
              {item.badge !== undefined && <span className="esmo-action-card__badge">{item.badge}</span>}
            </div>
            <div className="esmo-action-card__title">{index === 0 ? "01 · " : ""}{item.title}</div>
            <div className="esmo-action-card__detail">{item.detail}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

function FinanceStatus({ wk, fc, finBars, onOpen }) {
  const netPositive = numberOf(wk.net) >= 0;
  const maxBar = Math.max(...finBars.map((value) => numberOf(value)), 1);
  return (
    <article className="esmo-card esmo-status-card esmo-status-card--finance" data-dashboard-reveal>
      <div className="esmo-status-card__title">
        <span><IconBadge name="chart" accent={GC.green} size={15} />本週財務</span>
        <span className="esmo-status-card__label">第 {wk.week} 週</span>
      </div>
      <div className="esmo-status-card__value">{signedMoney(wk.net)} <small>淨額</small></div>
      <div className="esmo-status-card__detail">第 {wk.dayOfWeek}/7 天 · {wk.scenarioName ?? "目前情境"}</div>
      <div className="esmo-finance-summary">
        <div className="esmo-finance-summary__item"><div className="esmo-finance-summary__label">收入</div><div className="esmo-finance-summary__value" style={{ "--tone": GC.green }}>+{money(wk.income)}</div></div>
        <div className="esmo-finance-summary__item"><div className="esmo-finance-summary__label">支出</div><div className="esmo-finance-summary__value" style={{ "--tone": GC.red }}>−{money(wk.expense)}</div></div>
        <div className="esmo-finance-summary__item"><div className="esmo-finance-summary__label">趨勢</div><div className="esmo-finance-summary__value" style={{ "--tone": netPositive ? GC.green : GC.red }}>{netPositive ? "穩定" : "留意"}</div></div>
      </div>
      <div className="esmo-mini-chart" aria-label="近九週收支節奏">
        {finBars.map((value, index) => (
          <div key={`${value}-${index}`} className="esmo-mini-chart__bar" style={{ height: `${Math.max(9, numberOf(value) / maxBar * 100)}%` }} />
        ))}
      </div>
      <div className="esmo-chart-caption"><span>近 9 週節奏</span><span>{fc.weeks?.length ?? 0} 週預測可用</span></div>
      <button className="esmo-status-card__link" type="button" onClick={onOpen}>開啟完整財務 <EsmoIcon name="chevron" size={13} /></button>
    </article>
  );
}

function ClubStatus({ profile, players, developmentPoints, wk, fc, finBars, sponsor, onFinance, onSponsor, onRoster }) {
  const weeksLeft = numberOf(profile.activeSponsor?.weeksLeft);
  const sponsorTone = sponsor ? (weeksLeft <= 2 ? GC.gold : GC.green) : GC.gray;
  return (
    <section className="esmo-section">
      <SectionHeading label="CLUB STATUS" title="戰隊狀態" note="同一份經營資料的快速讀本" />
      <div className="esmo-status-grid">
        <FinanceStatus wk={wk} fc={fc} finBars={finBars} onOpen={onFinance} />

        <article className="esmo-card esmo-status-card" data-dashboard-reveal>
          <div className="esmo-status-card__title"><span><IconBadge name="users" accent={GC.blue} size={15} />選手狀態</span><span className="esmo-status-card__label">ROSTER</span></div>
          <div className="esmo-status-card__value">{players.length} <small>名選手</small></div>
          <div className="esmo-status-card__detail">營運第 {numberOf(profile.meta?.days)} 天 · {developmentPoints > 0 ? `還有 ${developmentPoints} 點戰隊發展` : "目前沒有待分配戰隊發展"}</div>
          <button className="esmo-status-card__link" type="button" onClick={onRoster}>查看名單 <EsmoIcon name="chevron" size={13} /></button>
        </article>

        <article className="esmo-card esmo-status-card" data-dashboard-reveal>
          <div className="esmo-status-card__title"><span><IconBadge name="users" accent={sponsorTone} size={15} />贊助狀態</span><span className="esmo-status-card__label">PARTNER</span></div>
          <div className="esmo-sponsor-mark" style={{ "--sponsor-accent": sponsor?.color ?? GC.gold }}>{sponsor?.emoji ?? "—"}</div>
          <div className="esmo-sponsor-status">
            {sponsor ? <><strong>{sponsor.name}</strong><br />合約剩 {weeksLeft} 週{weeksLeft <= 2 ? " · 即將到期" : ""}</> : "目前沒有進行中的贊助合約"}
          </div>
          <button className="esmo-status-card__link" type="button" onClick={onSponsor}>{sponsor ? "管理合作" : "尋找合作"} <EsmoIcon name="chevron" size={13} /></button>
        </article>
      </div>
    </section>
  );
}

function Compete({ modes, onSelect }) {
  return (
    <section className="esmo-section" data-dashboard-reveal>
      <SectionHeading label="COMPETE" title="把隊伍送上舞台" note="三種玩法，共用同一個 ESMO 品牌" />
      <div className="esmo-mode-grid">
        {modes.map((mode) => (
          <button key={mode.id} className="esmo-card esmo-interactive esmo-mode-card" type="button" onClick={() => onSelect(mode.id)} style={{ "--mode-accent": mode.color }}>
            <div className="esmo-mode-card__top">
              <div className="esmo-mode-card__eyebrow">{mode.kicker}</div>
              <span className="esmo-mode-card__icon"><EsmoIcon name={mode.icon} size={20} /></span>
            </div>
            <div className="esmo-mode-card__title">{mode.name}</div>
            <div className="esmo-mode-card__meta">{mode.meta}</div>
            <div className="esmo-mode-card__footer">
              <span>{mode.action}</span>
              <span className="esmo-mode-card__audience"><EsmoIcon name="users" size={12} /> {mode.audience}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function Utility({ items, onSelect }) {
  return (
    <section className="esmo-section" data-dashboard-reveal>
      <SectionHeading label="UTILITY" title="管理工具" note="需要時再來，不搶主要決策的焦點" />
      <div className="esmo-utility-grid">
        {items.map((item) => (
          <button key={item.id} className="esmo-card esmo-interactive esmo-utility-card" type="button" onClick={() => onSelect(item.id)}>
            <span className="esmo-utility-card__icon"><EsmoIcon name={item.icon} size={18} /></span>
            <span className="esmo-utility-card__label">{item.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function MobileTeamHeader({ team, meta, unread, xpPercent, onInbox }) {
  const achievement = numberOf(team.achievement ?? meta.achievement);
  const level = numberOf(team.lv ?? meta.lv);
  const xp = numberOf(team.xp ?? meta.xp);
  const xpMax = numberOf(team.xpMax ?? meta.xpMax, 1);
  const week = numberOf(meta.week, 1);

  return (
    <header className="esmo-mobile-header" data-dashboard-reveal>
      <div className="esmo-mobile-header__top">
        <div className="esmo-mobile-header__identity">
          <div className="esmo-mobile-header__crest" aria-label={`${team.name ?? "ESMO Team"} crest`}>
            {team.emoji ?? "◈"}
            <span className="esmo-mobile-header__crest-badge">{achievement}</span>
          </div>
          <div className="esmo-mobile-header__copy">
            <div className="esmo-mobile-header__kicker">{team.tag ?? "ESMO SQUAD"}</div>
            <h1>{team.name ?? "ESMO TEAM"}</h1>
            <div className="esmo-mobile-header__meta">
              <span>Lv. {level}</span>
              <span>W{week}</span>
              <span>{formatFans(meta.fans)} fans</span>
            </div>
          </div>
        </div>

        <div className="esmo-mobile-header__actions">
          <div className="esmo-mobile-header__funds">
            <span>FUNDS</span>
            <strong>{money(team.gold ?? 0)}</strong>
          </div>
          <button className="esmo-mobile-header__inbox" type="button" onClick={onInbox} aria-label="開啟收件匣">
            <EsmoIcon name="inbox" size={18} />
            {unread > 0 && <span>{unread}</span>}
          </button>
        </div>
      </div>

      <div className="esmo-mobile-header__xp">
        <div className="esmo-mobile-header__xp-label">
          <span>TEAM XP</span>
          <strong>{compactWan(xp)} / {compactWan(xpMax)}</strong>
        </div>
        <div className="esmo-mobile-header__xp-track" aria-label={`Team XP ${Math.round(xpPercent)}%`}>
          <div className="esmo-mobile-header__xp-fill" data-dashboard-progress style={{ transform: `scaleX(${Math.max(0, Math.min(1, xpPercent / 100))})` }} />
        </div>
      </div>
    </header>
  );
}

function MobilePrimaryAction({ activeMatchView, onResumeActive, action }) {
  if (activeMatchView) {
    return (
      <section className="esmo-mobile-primary esmo-mobile-primary--active" data-dashboard-reveal>
        <div className="esmo-mobile-primary__eyebrow">
          <span><span className="esmo-mobile-primary__live-dot" /> LIVE DECISION</span>
          <span>RETURN TO MATCH</span>
        </div>
        <ActiveMatchCard compact onResume={onResumeActive} />
      </section>
    );
  }

  return (
    <button
      className="esmo-mobile-primary esmo-mobile-primary--next esmo-interactive"
      type="button"
      onClick={action.onClick}
      style={{ "--accent": action.accent }}
      data-dashboard-reveal
    >
      <div className="esmo-mobile-primary__top">
        <span className="esmo-mobile-primary__eyebrow">NOW / NEXT ACTION</span>
        {action.badge !== undefined && <span className="esmo-mobile-primary__badge">{action.badge}</span>}
      </div>
      <div className="esmo-mobile-primary__title-row">
        <IconBadge name={action.icon} accent={action.accent} size={19} />
        <strong>{action.title}</strong>
      </div>
      <p>{action.detail}</p>
      <span className="esmo-mobile-primary__cta">OPEN ACTION <EsmoIcon name="chevron" size={14} /></span>
    </button>
  );
}

function MobileQuickActions({ items }) {
  return (
    <section className="esmo-mobile-section" data-dashboard-reveal>
      <div className="esmo-mobile-section__heading">
        <div>
          <span className="esmo-mobile-section__label">QUICK ACTIONS</span>
          <h2>短指令</h2>
        </div>
        <span className="esmo-mobile-section__note">4 SHORTCUTS</span>
      </div>
      <div className="esmo-mobile-quick-grid">
        {items.map((item) => (
          <button
            key={item.id}
            className="esmo-mobile-quick esmo-interactive"
            type="button"
            onClick={item.onClick}
            style={{ "--accent": item.accent }}
          >
            <IconBadge name={item.icon} accent={item.accent} size={16} />
            <span className="esmo-mobile-quick__copy">
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </span>
            <EsmoIcon name="chevron" size={14} />
          </button>
        ))}
      </div>
    </section>
  );
}

function MobileClubSnapshot({ players, developmentPoints, wk, sponsor, profile, onSelect }) {
  const weeksLeft = numberOf(profile.activeSponsor?.weeksLeft);
  const rows = [
    {
      id: "finance",
      icon: "finance",
      accent: numberOf(wk.net) >= 0 ? GC.green : GC.red,
      label: "財務",
      value: signedMoney(wk.net),
      note: `W${numberOf(wk.week, 1)} net`,
    },
    {
      id: "roster",
      icon: "users",
      accent: GC.blue,
      label: "選手",
      value: `${players.length} 人`,
      note: developmentPoints > 0 ? `${developmentPoints} 點待分配` : "目前穩定",
    },
    {
      id: "sponsor",
      icon: "award",
      accent: sponsor ? (weeksLeft <= 2 ? GC.gold : GC.green) : GC.gray,
      label: "贊助",
      value: sponsor?.name ?? "無",
      note: sponsor ? `剩 ${weeksLeft} 週` : "尋找合作夥伴",
    },
  ];

  return (
    <section className="esmo-mobile-section" data-dashboard-reveal>
      <div className="esmo-mobile-section__heading">
        <div>
          <span className="esmo-mobile-section__label">CLUB SNAPSHOT</span>
          <h2>戰隊狀態</h2>
        </div>
        <span className="esmo-mobile-section__note">AT A GLANCE</span>
      </div>
      <div className="esmo-mobile-snapshot-grid">
        {rows.map((row) => (
          <button
            key={row.id}
            className="esmo-mobile-snapshot esmo-interactive"
            type="button"
            onClick={() => onSelect(row.id)}
            style={{ "--accent": row.accent }}
          >
            <span className="esmo-mobile-snapshot__icon"><EsmoIcon name={row.icon} size={16} /></span>
            <span className="esmo-mobile-snapshot__label">{row.label}</span>
            <strong>{row.value}</strong>
            <small>{row.note}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function MobileCompeteRail({ modes, onSelect }) {
  return (
    <section className="esmo-mobile-section" data-dashboard-reveal>
      <div className="esmo-mobile-section__heading">
        <div>
          <span className="esmo-mobile-section__label">COMPETE</span>
          <h2>選擇賽場</h2>
        </div>
        <span className="esmo-mobile-section__note">SWIPE →</span>
      </div>
      <div className="esmo-mobile-compete-rail" aria-label="競技模式">
        {modes.map((mode) => (
          <button
            key={mode.id}
            className="esmo-mobile-compete-card esmo-interactive"
            type="button"
            onClick={() => onSelect(mode.id)}
            style={{ "--mode-accent": mode.color }}
          >
            <div className="esmo-mobile-compete-card__top">
              <span>{mode.kicker}</span>
              <EsmoIcon name={mode.icon} size={20} />
            </div>
            <strong>{mode.name}</strong>
            <p>{mode.meta}</p>
            <span className="esmo-mobile-compete-card__cta">{mode.action} <EsmoIcon name="chevron" size={13} /></span>
          </button>
        ))}
      </div>
    </section>
  );
}

function MobileNavSheet({ type, modes, onSelect, onClose }) {
  const groups = {
    team: [
      { id: "team", label: "戰隊總覽", detail: "Team overview", icon: "award" },
      { id: "roster", label: "選手名單", detail: "Roster", icon: "users" },
      { id: "development", label: "戰隊發展", detail: "Development", icon: "award" },
      { id: "training", label: "訓練安排", detail: "Training", icon: "signal" },
      { id: "recruit", label: "招募選手", detail: "Recruit", icon: "arrowUp" },
      { id: "talent", label: "選手天賦", detail: "Talent", icon: "star" },
    ],
    compete: modes.map((mode) => ({ id: mode.id, label: mode.name, detail: mode.meta, icon: mode.icon, accent: mode.color })),
    more: [
      { id: "finance", label: "財務", detail: "Finance", icon: "finance" },
      { id: "sponsor", label: "贊助", detail: "Sponsor", icon: "users" },
      { id: "equip", label: "商店", detail: "Shop", icon: "package" },
      { id: "newgame", label: "新遊戲", detail: "New game", icon: "arrowUp" },
      { id: "dash", label: "完整儀表板", detail: "Legacy utility", icon: "chart" },
    ],
  };
  const titles = { team: "戰隊", compete: "競技", more: "更多" };
  const items = groups[type] ?? [];

  return (
    <div className="esmo-mobile-sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="esmo-mobile-sheet" role="dialog" aria-modal="true" aria-labelledby="esmo-mobile-sheet-title" onClick={(event) => event.stopPropagation()}>
        <div className="esmo-mobile-sheet__top">
          <div>
            <span className="esmo-mobile-section__label">MOBILE MENU</span>
            <h2 id="esmo-mobile-sheet-title">{titles[type]}</h2>
          </div>
          <button className="esmo-mobile-sheet__close" type="button" onClick={onClose} aria-label="關閉選單">
            <EsmoIcon name="close" size={18} />
          </button>
        </div>
        <div className="esmo-mobile-sheet__list">
          {items.map((item) => (
            <button key={item.id} className="esmo-mobile-sheet__item" type="button" onClick={() => { onSelect(item.id); onClose(); }}>
              <span className="esmo-mobile-sheet__item-icon" style={{ "--accent": item.accent ?? GC.green }}><EsmoIcon name={item.icon} size={17} /></span>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
              <EsmoIcon name="chevron" size={15} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MobileBottomNav({ sheet, onTab }) {
  const tabs = [
    { id: "home", label: "首頁", icon: "home" },
    { id: "team", label: "戰隊", icon: "users" },
    { id: "compete", label: "競技", icon: "compete" },
    { id: "messages", label: "訊息", icon: "message" },
    { id: "more", label: "更多", icon: "more" },
  ];

  return (
    <nav className="esmo-mobile-nav" data-dashboard-mobile-nav aria-label="Mobile game navigation">
      {tabs.map((tab) => {
        const active = tab.id === "home" ? !sheet : tab.id === sheet;
        return (
          <button key={tab.id} className={`esmo-mobile-nav__item${active ? " is-active" : ""}`} type="button" onClick={() => onTab(tab.id)} aria-current={active ? "page" : undefined}>
            <EsmoIcon name={tab.icon} size={19} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function MobileHome({ team, meta, finance, unread, xpPercent, activeMatchView, onResumeActive, primaryAction, quickActions, profile, players, developmentPoints, wk, sponsor, modes, onSelect }) {
  const [sheet, setSheet] = useState(null);
  const scrollRef = useRef(null);

  const onTab = (tab) => {
    if (tab === "home") {
      setSheet(null);
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (tab === "messages") {
      onSelect("notify");
      return;
    }
    setSheet((current) => current === tab ? null : tab);
  };

  return (
    <div className="esmo-mobile-home">
      <div className="esmo-mobile-home__scroll" ref={scrollRef}>
        <div className="esmo-mobile-home__brandline">
          <span><EsmoIcon name="signal" size={13} /> ESMO / COMMAND DECK</span>
          <span>WEEK {numberOf(meta.week, 1)}</span>
        </div>
        <MobileTeamHeader team={{ ...team, gold: finance.funds }} meta={meta} unread={unread} xpPercent={xpPercent} onInbox={() => onSelect("notify")} />
        <main className="esmo-mobile-home__content">
          <MobilePrimaryAction activeMatchView={activeMatchView} onResumeActive={onResumeActive} action={primaryAction} />
          <MobileQuickActions items={quickActions} />
          <MobileClubSnapshot players={players} developmentPoints={developmentPoints} wk={wk} sponsor={sponsor} profile={profile} onSelect={onSelect} />
          <MobileCompeteRail modes={modes} onSelect={onSelect} />
        </main>
      </div>

      <MobileBottomNav sheet={sheet} onTab={onTab} />
      {sheet && <MobileNavSheet type={sheet} modes={modes} onSelect={onSelect} onClose={() => setSheet(null)} />}
    </div>
  );
}

export default function DashboardScreen({ onMoba, onSeason, onNav, onResumeActive }) {
  const rootRef = useRef(null);
  const profile = useProfileStore();
  const [modal, setModal] = useState(null);
  const isHomeMobile = useIsHomeMobile();
  useDashboardMotion(rootRef, isHomeMobile);

  const team = profile.team ?? {};
  const meta = profile.meta ?? {};
  const finance = profile.finance ?? {};
  const players = profile.players ?? [];
  const inbox = profile.inbox ?? [];
  const unread = inbox.filter((message) => message.unread).length;
  const developmentPoints = Math.max(0, Number(profile.teamDevelopment?.availablePoints) || 0);
  const wk = profile.currentWeekPreview();
  const fc = profile.cashForecast();
  const sponsor = profile.activeSponsor ? resolveSponsor(profile.activeSponsor.id) : null;
  const finBars = finance.weekly9 ?? [6, 4, 5, 3, 2, 9, 5, 6, 4];
  const xp = numberOf(team.xp ?? meta.xp);
  const xpMax = Math.max(1, numberOf(team.xpMax ?? meta.xpMax, 1));
  const xpPercent = Math.max(0, Math.min(100, xp / xpMax * 100));
  const activeMatchView = typeof profile.activeMatchView === "function" ? profile.activeMatchView() : null;
  const comp = profile.competitionView();
  const bracketBadge = !comp.hasSeason ? "進入聯賽"
    : comp.today ? "🔴 今日有賽事"
    : comp.next ? `下一場 第 ${comp.nextDay} 天`
    : "本季已完賽";

  const modeItems = useMemo(() => [
    { id: "moba", ...MODE_CONFIG.moba, audience: "2,041" },
    { id: "cs", ...MODE_CONFIG.cs, audience: "訓練" },
    { id: "bracket", ...MODE_CONFIG.bracket, meta: `賽程 · ${bracketBadge}`, audience: "賽季" },
  ], [bracketBadge]);

  const utilityItems = useMemo(() => [
    { id: "team", label: "戰隊詳情", icon: "award" },
    { id: "training", label: "訓練中心", icon: "signal" },
    { id: "recruit", label: "招募", icon: "arrowUp" },
    { id: "newgame", label: "開新局", icon: "arrowUp" },
    { id: "equip", label: "商店", icon: "package" },
    { id: "dash", label: "儀表板", icon: "chart" },
    { id: "sponsor", label: "贊助商", icon: "users" },
    { id: "talent", label: "天賦", icon: "star" },
  ], []);

  const sel = (id) => {
    if (id === "moba") return onMoba();
    if (id === "bracket") return onSeason();
    if (NAV[id] && onNav) return onNav(NAV[id]);
    setModal({ type: "legacy", name: { equip: "商店", dash: "經營儀表板" }[id] || id });
  };

  const priority = fc.level !== "ok"
    ? { id: "finance", icon: "alert", accent: fc.level === "danger" ? GC.red : GC.gold, title: "處理資金提醒", detail: fc.level === "danger" ? `預測第 ${fc.bankruptWeek} 週資金見底` : "本週淨額為負，先看現金預測", badge: "!", onClick: () => sel("finance") }
    : unread > 0
      ? { id: "notify", icon: "inbox", accent: GC.blue, title: "處理收件匣", detail: `${unread} 則未讀訊息等待決定`, badge: unread, onClick: () => sel("notify") }
      : developmentPoints > 0
        ? { id: "development", icon: "award", accent: GC.green, title: "分配戰隊發展點", detail: `${developmentPoints} 點可以投入團隊成長`, badge: developmentPoints, onClick: () => sel("development") }
        : { id: "recruit", icon: "arrowUp", accent: GC.green, title: "開始招募", detail: "看看球探部帶回的下一位候選人", onClick: () => sel("recruit") };

  const candidateActions = [
    { id: "notify", icon: "inbox", accent: GC.blue, title: "收件匣", detail: unread > 0 ? `${unread} 則未讀訊息` : "目前沒有未讀訊息", badge: unread || undefined, onClick: () => sel("notify") },
    { id: "development", icon: "award", accent: GC.green, title: "戰隊發展", detail: developmentPoints > 0 ? `${developmentPoints} 點可投入團隊成長` : "查看團隊投資與成長", onClick: () => sel("development") },
    { id: "roster", icon: "users", accent: GC.blue, title: "選手狀態", detail: `${players.length} 名選手 · 名單管理`, onClick: () => sel("roster") },
    { id: "training", icon: "signal", accent: GC.green, title: "訓練中心", detail: "安排本週訓練節奏", onClick: () => sel("training") },
    { id: "recruit", icon: "arrowUp", accent: GC.green, title: "球探招募", detail: "擴充下一個可用選手", onClick: () => sel("recruit") },
  ];
  const actions = [priority, ...candidateActions.filter((item) => item.id !== priority.id)].slice(0, 4);
  const mobileQuickActions = [
    candidateActions.find((item) => item.id === "development"),
    candidateActions.find((item) => item.id === "training"),
    candidateActions.find((item) => item.id === "roster"),
    candidateActions.find((item) => item.id === "notify"),
  ].filter(Boolean);

  return (
    <div ref={rootRef} className="esmo-dashboard" style={ESMO_CSS_VARS}>
      {isHomeMobile ? (
        <MobileHome
          team={team}
          meta={meta}
          finance={finance}
          unread={unread}
          xpPercent={xpPercent}
          activeMatchView={activeMatchView}
          onResumeActive={onResumeActive}
          primaryAction={priority}
          quickActions={mobileQuickActions}
          profile={profile}
          players={players}
          developmentPoints={developmentPoints}
          wk={wk}
          sponsor={sponsor}
          modes={modeItems}
          onSelect={sel}
        />
      ) : (
      <div className="esmo-dashboard__canvas">
        <div className="esmo-dashboard__topbar" data-dashboard-reveal>
          <div className="esmo-dashboard__brand">
            <span className="esmo-dashboard__brand-mark"><EsmoIcon name="signal" size={17} strokeWidth={2.2} /></span>
            <span className="esmo-dashboard__brand-copy"><span className="esmo-dashboard__brand-name">ESMO</span><span className="esmo-dashboard__brand-caption">modern esports management</span></span>
          </div>
          <span className="esmo-dashboard__brand-caption">WEEK {numberOf(meta.week, 1)}</span>
        </div>

        <TeamHero team={{ ...team, gold: finance.funds }} meta={meta} unread={unread} xpPercent={xpPercent} onInbox={() => sel("notify")} />

        <div className="esmo-dashboard__layout">
          <main className="esmo-dashboard__main-column">
            <ActiveMatchSection hasActiveMatch={Boolean(activeMatchView)} onResumeActive={onResumeActive} />
            <NextActions actions={actions} />
            <ClubStatus profile={profile} players={players} developmentPoints={developmentPoints} wk={wk} fc={fc} finBars={finBars} onFinance={() => sel("finance")} onSponsor={() => sel("sponsor")} onRoster={() => sel("roster")} />
          </main>

          <aside className="esmo-dashboard__rail">
            <Compete modes={modeItems} onSelect={sel} />
            <Utility items={utilityItems} onSelect={sel} />
            <div className="esmo-footer-note">ESMO GLOBAL / COMMAND DECK v1</div>
          </aside>
        </div>
      </div>
      )}

      {modal && <Modal modal={modal} onClose={() => setModal(null)} />}
    </div>
  );
}

function Modal({ modal, onClose }) {
  return (
    <div className="esmo-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="esmo-modal" role="dialog" aria-modal="true" aria-labelledby="esmo-modal-title" onClick={(event) => event.stopPropagation()}>
        <h2 className="esmo-modal__title" id="esmo-modal-title">{modal.name}</h2>
        <p className="esmo-modal__body"><strong>{modal.name}</strong> 為目前尚未 Component 化的 Legacy 模組。首頁保留入口與誠實狀態，不用假資料冒充已完成的功能。</p>
        <button className="esmo-modal__close" type="button" onClick={onClose}>關閉</button>
      </div>
    </div>
  );
}
