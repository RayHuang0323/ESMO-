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

export default function DashboardScreen({ onMoba, onSeason, onNav, onResumeActive }) {
  const rootRef = useRef(null);
  const profile = useProfileStore();
  const [modal, setModal] = useState(null);
  useDashboardMotion(rootRef);

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

  return (
    <div ref={rootRef} className="esmo-dashboard" style={ESMO_CSS_VARS}>
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
