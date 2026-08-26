// Dashboard — ESMO Design System v1 first production surface.
//
// This screen is a presentation adapter only.  Navigation callbacks and
// profileStore selectors stay the same as the previous Home; no route, Store
// schema, contract, or battle logic is introduced here.
import { formatFans, seasonFanGrowth } from "../platform/fans/fanPresentation.js";
import React, { useMemo, useRef, useState } from "react";
import { useProfileStore } from "../platform/profileStore.js";
import ActiveMatchCard from "./common/ActiveMatchCard.jsx";
import { resolveSponsor } from "../platform/economy/sponsors.js";
import { GC } from "../ui/theme.js";
import { ESMO_CSS_VARS } from "../ui/designSystem.js";
import EsmoIcon from "../ui/EsmoIcon.jsx";
import { useIsHomeMobile } from "../ui/useViewport.js";
import { useDashboardMotion } from "./dashboard/useDashboardMotion.js";
import { useMobileSheetMotion } from "./dashboard/useMobileSheetMotion.js";
//  「有選手需要處理嗎」用既有的判定，不在首頁另訂體力門檻。
import { isExhausted } from "../platform/condition/playerCondition.js";
//  V1：推進世界時間一律走具名入口＋白名單理由（見 platform/time/worldClock.js）。
import { ADVANCE_REASONS } from "../platform/time/worldClock.js";
//  V3：快轉級距讀自契約，畫面不自己寫死天數。
import { FAST_FORWARD_STEPS } from "../platform/time/fastForward.js";
import "./dashboard/dashboard.css";

const numberOf = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const money = (value) => `$${(numberOf(value) / 10000).toFixed(1)}萬`;
const signedMoney = (value) => `${numberOf(value) >= 0 ? "+" : "−"}${money(Math.abs(numberOf(value)))}`;
const compactWan = (value) => `${numberOf(value).toFixed(2).replace(/\.?(0+)$/, "")}萬`;
//  ⚠ 粉絲格式化改用**全站共用**的那一支（`platform/fans/fanPresentation.js`），
//    避免 Home / 戰隊詳情 / 賽季總結各寫一種寫法。

//  ⚠ `talent`（舊版個人天賦）刻意**不在首頁的導覽表裡**。
//    長期投資的動線是「戰隊發展」；個人天賦樹仍然存在，入口在選手詳情頁
//    （PlayerDetail → 天賦），路由 `talentPick` / `playerTalent` 也都保留給
//    舊存檔與該流程使用。這裡移除的是**首頁的重複入口**，不是功能。
const NAV = {
  notify: "inbox",
  finance: "finance",
  sponsor: "sponsor",
  roster: "roster",
  team: "team",
  training: "training",
  recruit: "recruit",
  cs: "csPrep",
  development: "teamDevelopment",
  newgame: "newGame",
  //  V6-3：休賽期。只有真的有年度決策時，首頁才會出現這個入口。
  offSeason: "offSeason",
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

function TeamHero({ team, meta, unread, xpPercent, onInbox, fansAtSeasonStart }) {
  const achievement = numberOf(team.achievement ?? meta.achievement);
  const level = numberOf(team.lv ?? meta.lv);
  const xp = numberOf(team.xp ?? meta.xp);
  const xpMax = numberOf(team.xpMax ?? meta.xpMax, 1);
  const week = numberOf(meta.week, 1);
  const days = numberOf(meta.days, 0);
  const fans = formatFans(meta.fans);
  //  F4：本季粉絲成長。舊存檔沒有基準 ⇒ `hasBaseline: false` ⇒ 只顯示總數。
  const fanGrowth = seasonFanGrowth({ fans: meta.fans, fansAtSeasonStart });

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
                <span className="esmo-hero__meta" data-testid="home-fans">
                  <strong>{fans}</strong> 支持者
                  {/*  F4：本季成長只在**拿得到基準**時顯示。舊存檔沒有 snapshot
                       ⇒ 只顯示總數，不顯示 +0／—／未知（見 seasonFanGrowth）。 */}
                  {fanGrowth.hasBaseline && (
                    <span className="esmo-hero__meta-delta" data-testid="home-fans-delta">
                      本季 +{fanGrowth.delta.toLocaleString("zh-Hant")}
                    </span>
                  )}
                </span>
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
  //  沒事就說沒事。硬塞功能捷徑會讓這一區失去「有事才看這裡」的意義。
  if (!actions.length) {
    return (
      <section className="esmo-section" data-dashboard-reveal>
        <SectionHeading label="NEXT ACTIONS" title="接下來做什麼" note="把注意力留給真正重要的事" />
        <div className="esmo-card esmo-action-empty" data-testid="home-actions-empty">
          目前沒有急需處理的事項。
        </div>
      </section>
    );
  }
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

/**
 * 世界時間卡（Season vNext V1）。
 *
 * ── 為什麼首頁要有這張卡 ──────────────────────────────────────────────────
 * V1 之前，正式 UI **唯一**推得動 `meta.days` 的地方是訓練中心那顆按鈕，
 * 而那顆按鈕還要求「真的有人在訓練」⇒ 玩家不指派訓練，世界就完全停住。
 * 時間是**俱樂部層級**的東西，不是訓練功能的副作用，所以入口在首頁。
 *
 * ⚠ **這不是第二個時鐘**：它呼叫 `advanceWorldDays`（→ `advanceDay`），
 *   與訓練中心同一條路、同一套週結算與賽季日曆。
 * ⚠ 顯示的時間一律來自 `worldTimeView()`，**不自己從 `meta.days` 算週次或年度**。
 * ⚠ 這個入口**不依賴任何前置條件**——那正是它存在的理由。
 *   唯一擋得住它的是既有的 D15 規則（比賽日沒收尾就走不出去），
 *   那時會照實顯示原因，而不是靜靜地什麼都不做。
 */
function WorldTimeStatus({ onOffSeason }) {
  const advanceWorldDays = useProfileStore((s) => s.advanceWorldDays);
  const advanceToNextStop = useProfileStore((s) => s.advanceToNextStop);
  const nextStopView = useProfileStore((s) => s.nextStopView);
  const offSeasonView = useProfileStore((s) => s.offSeasonView);
  const retirementView = useProfileStore((s) => s.retirementView);
  const offSeasonSessionView = useProfileStore((s) => s.offSeasonSessionView);
  const days = useProfileStore((s) => s.meta?.days);
  const worldTimeView = useProfileStore((s) => s.worldTimeView);
  const [note, setNote] = React.useState(null);
  const t = worldTimeView();
  const stop = nextStopView();
  const offSeason = offSeasonView();
  const retirement = retirementView();
  const session = offSeasonSessionView();

  //  ⚠ 推進結果一律照實顯示。「推不動」與「推了一半停下」是兩件不同的事，
  //    合併成「什麼都沒發生」正是 V1 檔頭說要避免的靜默失敗。
  const report = (res, wanted) => {
    if (!res.ok) { setNote(res.reason ?? "今天推不動"); return; }
    setNote(res.daysAdvanced < wanted
      ? `推進 ${res.daysAdvanced} 天後停下：${res.reason ?? "有比賽尚未收尾"}`
      : `已推進 ${res.daysAdvanced} 天`);
  };

  const advance = (n) => report(advanceWorldDays(n, { reason: ADVANCE_REASONS.rest }), n);
  //  ⚠ 走 Store 的 `advanceToNextStop`——規劃與推進都不在畫面裡。
  const advanceNext = () => { const r = advanceToNextStop(); report(r, r.plannedDays ?? 0); };

  return (
    <article className="esmo-card esmo-status-card" data-dashboard-reveal data-testid="home-world-time">
      <div className="esmo-status-card__title">
        <span><IconBadge name="chevron" accent={GC.purp} size={15} />世界時間</span>
        <span className="esmo-status-card__label">CLOCK</span>
      </div>
      <div className="esmo-status-card__value">{numberOf(days)} <small>天</small></div>
      <div className="esmo-status-card__detail">
        第 {t.careerYear} 生涯年度 · 第 {t.dayOfYear}/{t.daysPerYear} 天 · 第 {t.week} 週
        {t.nextFixtureDay ? ` · 下一場賽程在第 ${t.nextFixtureDay} 天` : " · 目前沒有排定的賽程"}
      </div>
      {stop && (
        //  ⚠ `daysAway === 0` 要說「就是今天」，不能顯示「還有 0 天」——
        //    那一格正是玩家**走不動**的時候，訊息必須讓他知道要先處理今天的事。
        <div className="esmo-status-card__detail" data-testid="home-next-stop">
          下一站：{stop.label}{stop.daysAway > 0 ? `（還有 ${stop.daysAway} 天）` : "（就是今天）"}
        </div>
      )}
      {/*  V5-1：年度封存只是**狀態顯示**，不是決策點——所以它不擋快轉，也沒有專屬頁。
          等 V5-3 有了「離隊意向 vs 找接班人」的決策，這裡才會變成真的停下來的地方。 */}
      {offSeason.latest && (
        <div className="esmo-status-card__detail" data-testid="home-offseason">
          第 {offSeason.latest.careerYear} 生涯年度已封存
          （當時 {offSeason.latest.rosterCount} 人{offSeason.latest.averageAge != null ? `．平均 ${offSeason.latest.averageAge} 歲` : ""}）
        </div>
      )}
      {/*  V6-3：休賽期開著時，這是**唯一**能往前走的路——世界時間被擋住了，
          出口是休賽期畫面上的「完成休賽期」（永遠成功、永遠免費）。 */}
      {session.open && (
        <button className="esmo-status-card__link" type="button" style={{ color: GC.gold, fontWeight: 900 }}
          data-testid="home-offseason-enter" onClick={onOffSeason}>
          休賽期尚未結束：{session.total} 項決策待處理 <EsmoIcon name="chevron" size={13} />
        </button>
      )}
      {/*  V5-3：這是 Off-season 目前唯一、也是真正的決策提示——
          有人宣布退役意向，玩家有一整個生涯年度可以決定要不要現在就簽接班人。 */}
      {retirement.pendingCount > 0 && (
        <div className="esmo-status-card__detail" data-testid="home-retirement-intent" style={{ color: GC.gold }}>
          {retirement.pendingCount} 名選手宣布這可能是最後一年
          （{retirement.pending.map((p) => `${p.name}．${p.age} 歲`).join("、")}）— 你有一年可以找接班人
        </div>
      )}
      {note && <div className="esmo-status-card__detail" style={{ color: GC.gold }}>{note}</div>}
      <div className="esmo-worldtime-actions">
        {/*  ⚠ 級距讀自 `FAST_FORWARD_STEPS`（契約），畫面不自己寫死天數。 */}
        {FAST_FORWARD_STEPS.map((n) => (
          <button key={n} className="esmo-status-card__link" type="button"
            data-testid={n === 1 ? "home-advance-day" : "home-advance-days"}
            onClick={() => advance(n)}>
            推進 {n} 天 <EsmoIcon name="chevron" size={13} />
          </button>
        ))}
        <button className="esmo-status-card__link" type="button" data-testid="home-advance-next"
          onClick={advanceNext}>前往下一站 <EsmoIcon name="chevron" size={13} /></button>
      </div>
    </article>
  );
}

function ClubStatus({ profile, players, developmentPoints, wk, fc, finBars, sponsor, onFinance, onSponsor, onRoster, onOffSeason }) {
  const weeksLeft = numberOf(profile.activeSponsor?.weeksLeft);
  const sponsorTone = sponsor ? (weeksLeft <= 2 ? GC.gold : GC.green) : GC.gray;
  return (
    <section className="esmo-section">
      <SectionHeading label="CLUB STATUS" title="戰隊狀態" note="同一份經營資料的快速讀本" />
      <div className="esmo-status-grid">
        <WorldTimeStatus onOffSeason={onOffSeason} />
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
          //  ⚠ `data-testid` 是**穩定的入口識別**，不是樣式。browser gate 以前靠
          //    「innerText 含 🏆」找這張磚，Home v2 改用 icon 元件之後那個判斷
          //    必然失效。標記綁 `mode.id`，之後改文案、換圖示都不會再弄壞驗證。
          <button key={mode.id} data-testid={`home-mode-${mode.id}`} className="esmo-card esmo-interactive esmo-mode-card" type="button" onClick={() => onSelect(mode.id)} style={{ "--mode-accent": mode.color }}>
            <div className="esmo-mode-card__top">
              <div className="esmo-mode-card__eyebrow">{mode.kicker}</div>
              <span className="esmo-mode-card__icon"><EsmoIcon name={mode.icon} size={20} /></span>
            </div>
            <div className="esmo-mode-card__title">{mode.name}</div>
            <div className="esmo-mode-card__meta">{mode.meta}</div>
            {/*  F4：`audience` 已移除（假資料）。footer 只留真正的行動標籤。 */}
            <div className="esmo-mode-card__footer">
              <span>{mode.action}</span>
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
              {/*  F4：手機頁首刻意**只顯示總數**（不加本季成長）——這一列是三欄的
                   緊湊資訊列，塞第四個數字會擠壞。成長在桌機 hero 與賽季總結看得到。 */}
              <span data-testid="home-fans">{formatFans(meta.fans)} 支持者</span>
            </div>
          </div>
        </div>

        <div className="esmo-mobile-header__actions">
          <div className="esmo-mobile-header__funds">
            <span>資金</span>
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
          <span>XP</span>
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
          <span><span className="esmo-mobile-primary__live-dot" /> LIVE</span>
        </div>
        <ActiveMatchCard compact onResume={onResumeActive} />
      </section>
    );
  }

  //  沒有待辦時不要硬擠一張卡出來——手機的第一屏更禁不起假的「主要行動」。
  if (!action) {
    return (
      <section className="esmo-mobile-primary esmo-mobile-primary--calm" data-dashboard-reveal data-testid="home-actions-empty">
        <div className="esmo-mobile-primary__eyebrow">目前狀況</div>
        <p>目前沒有急需處理的事項。</p>
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
        <span className="esmo-mobile-primary__eyebrow">下一個行動</span>
        {action.badge !== undefined && <span className="esmo-mobile-primary__badge">{action.badge}</span>}
      </div>
      <div className="esmo-mobile-primary__title-row">
        <IconBadge name={action.icon} accent={action.accent} size={19} />
        <strong>{action.title}</strong>
      </div>
      <p>{action.detail}</p>
      <span className="esmo-mobile-primary__cta">開啟行動 <EsmoIcon name="chevron" size={14} /></span>
    </button>
  );
}

function MobileQuickActions({ items }) {
  //  只有在「主要行動之外還有別的待辦」時才出現。沒有就整段不渲染，
  //  不要留一個空標題佔著第一屏。
  if (!items.length) return null;
  return (
    <section className="esmo-mobile-section" data-dashboard-reveal>
      <div className="esmo-mobile-section__heading">
        <div>
          <span className="esmo-mobile-section__label">其他待辦</span>
          <h2>還需要處理</h2>
        </div>
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
      note: `W${numberOf(wk.week, 1)} 淨額`,
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
          <span className="esmo-mobile-section__label">戰隊快照</span>
          <h2>戰隊狀態</h2>
        </div>
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

function MobileCompeteRail({ modes, onSelect, sectionRef = null }) {
  return (
    <section ref={sectionRef} className="esmo-mobile-section" data-testid="home-compete-rail" data-dashboard-reveal>
      <div className="esmo-mobile-section__heading">
        <div>
          <span className="esmo-mobile-section__label">競技</span>
          <h2>選擇模式</h2>
        </div>
        <span className="esmo-mobile-section__note">左右滑動</span>
      </div>
      <div className="esmo-mobile-compete-rail" aria-label="競技模式">
        {modes.map((mode) => (
          <button
            key={mode.id}
            data-testid={`home-mode-${mode.id}`}
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

function MobileNavSheet({ type, onSelect, onClose }) {
  const sheetRef = useRef(null);
  const closeStartedRef = useRef(false);
  const animateClose = useMobileSheetMotion(sheetRef, onClose);
  const closeSheet = () => {
    if (closeStartedRef.current) return;
    closeStartedRef.current = true;
    animateClose();
  };
  //  ⚠ 這裡與桌機的管理工具是同一份責任，所以移除的入口要一致：
  //      選手天賦     → 個人天賦樹的入口在選手詳情頁
  //      贊助         → 戰隊快照的贊助列本來就能直接進贊助頁
  //      完整儀表板   → 指向未接線的舊版畫面
  //  「競技」不再有 sheet：它的內容與競技 rail 一字不差（見 `onTab`）。
  const groups = {
    team: [
      { id: "team", label: "戰隊總覽", icon: "award" },
      { id: "roster", label: "選手名單", icon: "users" },
      { id: "development", label: "戰隊發展", icon: "award" },
      { id: "training", label: "訓練安排", icon: "signal" },
      { id: "recruit", label: "招募選手", icon: "arrowUp" },
    ],
    more: [
      { id: "finance", label: "財務", detail: "收支與預測", icon: "finance" },
      { id: "equip", label: "商店", detail: "物品與升級", icon: "package" },
      { id: "newgame", label: "新遊戲", detail: "重新開始", icon: "arrowUp" },
    ],
  };
  const titles = { team: "戰隊", more: "更多" };
  const items = groups[type] ?? [];

  return (
    <div ref={sheetRef} className={`esmo-mobile-sheet-backdrop esmo-mobile-sheet-backdrop--${type}`} data-dashboard-mobile-sheet role="presentation" onClick={closeSheet}>
      <div className={`esmo-mobile-sheet esmo-mobile-sheet--${type}`} role="dialog" aria-modal="true" aria-labelledby="esmo-mobile-sheet-title" onClick={(event) => event.stopPropagation()}>
        <div className="esmo-mobile-sheet__top">
          <div>
            <span className="esmo-mobile-section__label">遊戲選單</span>
            <h2 id="esmo-mobile-sheet-title">{titles[type]}</h2>
          </div>
          <button className="esmo-mobile-sheet__close" type="button" onClick={closeSheet} aria-label="關閉選單">
            <EsmoIcon name="close" size={18} />
          </button>
        </div>
        <div className="esmo-mobile-sheet__list">
          {items.map((item) => (
            //  ⚠ 與模式磚同一個理由：手機版的入口住在 sheet 裡、標籤也與桌面不同
            //    （桌面「戰隊詳情」、手機「戰隊總覽」）。給穩定標記，驗證才不必
            //    同時記住兩套文案。
            <button key={item.id} data-testid={`home-sheet-${item.id}`} className="esmo-mobile-sheet__item" type="button" onClick={() => { onSelect(item.id); closeSheet(); }} style={{ "--accent": item.accent ?? GC.green }}>
              <span className="esmo-mobile-sheet__item-icon" style={{ "--accent": item.accent ?? GC.green }}><EsmoIcon name={item.icon} size={17} /></span>
              <span><strong>{item.label}</strong>{item.detail && <small>{item.detail}</small>}</span>
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
    <nav className="esmo-mobile-nav" data-dashboard-mobile-nav aria-label="行動導覽">
      {tabs.map((tab) => {
        const active = tab.id === "home" ? !sheet : tab.id === sheet;
        return (
          <button key={tab.id} data-testid={`home-nav-${tab.id}`} className={`esmo-mobile-nav__item${active ? " is-active" : ""}`} type="button" onClick={() => onTab(tab.id)} aria-current={active ? "page" : undefined}>
            <EsmoIcon name={tab.icon} size={19} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function MobileHome({ team, meta, finance, unread, xpPercent, activeMatchView, onResumeActive, primaryAction, quickActions, profile, players, developmentPoints, wk, sponsor, modes, onSelect, onOffSeason }) {
  const [sheet, setSheet] = useState(null);
  const scrollRef = useRef(null);
  //  底部 nav 的「競技」要捲到這一段，所以需要它的位置。
  const competeRef = useRef(null);

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
    //  「競技」以前會開一個 sheet，內容與底下的競技 rail 一字不差——同一份東西
    //  在同一個畫面列兩次。現在改成捲到 rail：入口只有一個，路由完全沒動。
    if (tab === "compete") {
      setSheet(null);
      competeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSheet((current) => current === tab ? null : tab);
  };

  return (
    <div className="esmo-mobile-home">
      <div className="esmo-mobile-home__scroll" ref={scrollRef}>
        <div className="esmo-mobile-home__brandline">
          <span><EsmoIcon name="signal" size={13} /> ESMO / COMMAND DECK</span>
          <span>W{numberOf(meta.week, 1)}</span>
        </div>
        <MobileTeamHeader team={{ ...team, gold: finance.funds }} meta={meta} unread={unread} xpPercent={xpPercent} onInbox={() => onSelect("notify")} />
        <main className="esmo-mobile-home__content">
          <MobilePrimaryAction activeMatchView={activeMatchView} onResumeActive={onResumeActive} action={primaryAction} />
          {/*  ── V3：手機也必須推得動世界時間 ──────────────────────────────
              手機版不渲染 `ClubStatus`，所以在 V3 之前，**整個手機介面沒有任何
              推進世界時間的入口**——玩家只剩訓練中心那顆按鈕，而那顆按鈕要求
              「真的有人在訓練」。也就是說 V1 修掉的 TD-34（不指派訓練，世界完全
              停住）在手機上一直還活著，瀏覽器實測才抓到。
              ⚠ 放在主要動作之後、快捷動作之前：時間是每天都要按的東西，
                不是「需要時才進的功能」，不能收進分頁 sheet 裡。
              ⚠ 與桌面共用**同一個** `WorldTimeStatus` 元件 ⇒ 不會有兩套時間 UI。 */}
          <WorldTimeStatus onOffSeason={onOffSeason} />
          <MobileQuickActions items={quickActions} />
          <MobileClubSnapshot players={players} developmentPoints={developmentPoints} wk={wk} sponsor={sponsor} profile={profile} onSelect={onSelect} />
          <MobileCompeteRail modes={modes} onSelect={onSelect} sectionRef={competeRef} />
        </main>
      </div>

      <MobileBottomNav sheet={sheet} onTab={onTab} />
      {sheet && <MobileNavSheet type={sheet} onSelect={onSelect} onClose={() => setSheet(null)} />}
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
    //  F4：移除假的 `audience`。那是寫死的數字，不是任何真實資料。
    //  ⚠ **刻意不改接 `meta.fans`**：Fans（戰隊支持者）≠ Audience（單場觀眾），
    //    目前沒有 attendance system，拿粉絲冒充觀眾比留白更糟。
    { id: "moba", ...MODE_CONFIG.moba },
    { id: "cs", ...MODE_CONFIG.cs },
    { id: "bracket", ...MODE_CONFIG.bracket, meta: `賽程 · ${bracketBadge}` },
  ], [bracketBadge]);

  //  管理工具＝不需要天天看、但需要時要進得去的功能。
  //  ⚠ 移掉的三個都是**重複或已無產品責任**的入口，功能本體與路由都還在：
  //      贊助商 → 戰隊狀態的「贊助狀態」摘要卡本來就能直接進贊助頁
  //      天賦   → 已由「戰隊發展」取代；個人天賦樹入口在選手詳情
  //      儀表板 → 指向未接線的舊版密集儀表板，而首頁本身就是儀表板
  const utilityItems = useMemo(() => [
    { id: "team", label: "戰隊詳情", icon: "award" },
    { id: "training", label: "訓練中心", icon: "signal" },
    { id: "recruit", label: "招募", icon: "arrowUp" },
    { id: "newgame", label: "開新局", icon: "arrowUp" },
    { id: "equip", label: "商店", icon: "package" },
  ], []);

  const sel = (id) => {
    if (id === "moba") return onMoba();
    if (id === "bracket") return onSeason();
    if (NAV[id] && onNav) return onNav(NAV[id]);
    setModal({ type: "legacy", name: { equip: "商店" }[id] || id });
  };

  //  ── 接下來做什麼＝真正需要處理的事 ──────────────────────────────────────
  //  這一區以前是「固定五張常用捷徑取四張」，所以永遠都是滿的——不管有沒有事。
  //  結果是它與「戰隊狀態」講同一件事（選手／財務／贊助），而「現在要處理什麼」
  //  這個責任反而沒有人扛。
  //
  //  現在只放**有訊號才成立**的待辦，沒事就誠實顯示沒事。
  //  ⚠ 每一條的訊號都來自既有資料，這裡不新增任何規則：
  //      資金警告   `cashForecast().level`
  //      未讀訊息   `inbox[].unread`
  //      發展點     `teamDevelopment.availablePoints`
  //      選手問題   `isExhausted`（`platform/condition` 的既有判定）
  //                 ⚠ 選手傷病已被產品取消 ⇒ 這裡只剩體力訊號，不得再加回傷停條件。
  //  訓練中心／球探招募／選手名單**不再固定塞進來**——它們是「需要時才去」的
  //  管理功能，入口在管理工具與戰隊分頁。
  const needsAttention = players.filter((p) => isExhausted(p));

  const todos = [];
  if (fc.level !== "ok") {
    todos.push({
      id: "finance", icon: "alert", accent: fc.level === "danger" ? GC.red : GC.gold,
      title: "處理資金提醒",
      detail: fc.level === "danger" ? `預測第 ${fc.bankruptWeek} 週資金見底` : "本週淨額為負，先看現金預測",
      badge: "!", onClick: () => sel("finance"),
    });
  }
  if (unread > 0) {
    todos.push({
      id: "notify", icon: "inbox", accent: GC.blue,
      title: "處理收件匣", detail: `${unread} 則未讀訊息等待決定`,
      badge: unread, onClick: () => sel("notify"),
    });
  }
  if (developmentPoints > 0) {
    //  ⚠ `title: "戰隊發展"` 是首頁主要投資動線的契約字面（check_home_team_contract）。
    todos.push({
      id: "development", icon: "award", accent: GC.green,
      title: "戰隊發展", detail: `${developmentPoints} 點可以投入團隊成長`,
      badge: developmentPoints, onClick: () => sel("development"),
    });
  }
  if (needsAttention.length > 0) {
    todos.push({
      id: "condition", icon: "alert", accent: GC.gold,
      title: "選手體力過低",
      detail: `${needsAttention.length} 人體力低到不能出賽`,
      badge: needsAttention.length, onClick: () => sel("roster"),
    });
  }

  //  手機：第一張放最重要的那件事，其餘進快捷清單。兩邊吃**同一份 `todos`**，
  //  所以 Desktop 與 Mobile 不會再各自長出一套「該顯示什麼」的規則。
  const priority = todos[0] ?? null;
  const actions = todos.slice(0, 4);
  const mobileQuickActions = todos.slice(1, 4);

  return (
    <div ref={rootRef} className="esmo-dashboard" style={ESMO_CSS_VARS}>
      {isHomeMobile ? (
        <MobileHome
          onOffSeason={() => sel("offSeason")}
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

        <TeamHero team={{ ...team, gold: finance.funds }} meta={meta} unread={unread} xpPercent={xpPercent} fansAtSeasonStart={comp.fansAtSeasonStart ?? null} onInbox={() => sel("notify")} />

        <div className="esmo-dashboard__layout">
          <main className="esmo-dashboard__main-column">
            <ActiveMatchSection hasActiveMatch={Boolean(activeMatchView)} onResumeActive={onResumeActive} />
            <NextActions actions={actions} />
            <ClubStatus profile={profile} players={players} developmentPoints={developmentPoints} wk={wk} fc={fc} finBars={finBars} onFinance={() => sel("finance")} onSponsor={() => sel("sponsor")} onRoster={() => sel("roster")} onOffSeason={() => sel("offSeason")} />
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
