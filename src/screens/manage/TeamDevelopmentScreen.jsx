// ============================================================================
// 戰隊發展 v1.5：俱樂部長期路線視圖
// ============================================================================
import React, { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useProfileStore } from "../../platform/profileStore.js";
import { useSeasonStore } from "../../platform/seasonStore.js";
import { analytics as mobaAnalytics } from "../../platform/seasonData.js";
import { growthLogOf } from "../../platform/progress/growthLog.js";
import {
  TEAM_DEVELOPMENT_CATEGORIES,
  teamDevelopmentLevelEffect,
  teamDevelopmentNodeById,
  teamDevelopmentNodesByCategory,
  sanitizeTeamDevelopment,
  teamDevelopmentEffects,
  teamDevelopmentEligibility,
} from "../../platform/development/teamDevelopment.js";
import {
  developmentPointsViewOf, CLUB_LEVEL_MILESTONES, POINTS_PER_CAREER_SEASON,
} from "../../platform/development/developmentPoints.js";
import { clubLevelOf } from "../../platform/progression/clubProgression.js";
import { GC, FONT, MONO } from "../../ui/theme.js";
import ManageFrame from "./ManageFrame.jsx";

gsap.registerPlugin(useGSAP);

//  ⚠ `locked` 與 `needsPoints` 是**兩件不同的事**，不可再合併成一個「待解鎖」：
//    前者是「還不能買」（前置沒完成），後者是「買得起就能買，只是錢不夠」。
//    TD-56 Owner Review 抓到合併後的畫面會同時說「待解鎖」與「可生效」。
const STATUS = {
  locked: { label: "待解鎖", color: GC.gray },
  needsPoints: { label: "點數不足", color: GC.gold },
  available: { label: "可投入", color: GC.blueL },
  upgrade: { label: "可升級", color: GC.blueL },
  active: { label: "已生效", color: GC.green },
  activeFuture: { label: "已生效・後續規劃", color: GC.green },
  maxed: { label: "已完成", color: GC.gold },
  future: { label: "規劃中", color: GC.gray },
};

const TIER_LABEL = { base: "基礎", advanced: "進階", specialty: "專精" };
const categoryOf = (id) => TEAM_DEVELOPMENT_CATEGORIES.find((cat) => cat.id === id);
const colorOf = (cat) => GC[cat?.colorKey] ?? GC.gray;
const clamp01 = gsap.utils.clamp(0, 1);

/**
 * 節點的顯示狀態 ＋ 給玩家看的原因。
 *
 * ⚠ **判定完全來自 domain 的 `teamDevelopmentEligibility()`**，這裡只負責把
 *   `kind` 對應到徽章。TD-56 之前這支自己重推了一遍條件，才會把
 *   「前置未完成」與「點數不足」壓成同一個 `locked`。不要再加平行判定。
 */
function nodeStatus(state, node) {
  const rank = state.ranks[node.id] ?? 0;
  const eligibility = teamDevelopmentEligibility(state, node.id);
  if (eligibility.ok) return { key: rank > 0 ? "upgrade" : "available", reason: null };
  switch (eligibility.kind) {
    case "maxed": return { key: "maxed", reason: null };
    //  已經投入過、但下一階段還沒開放 ⇒ 它是「已生效」，不是「鎖住」。
    case "nextPlanned": return { key: "activeFuture", reason: null };
    case "planned": return { key: "future", reason: null };
    case "prerequisite": return { key: "locked", reason: eligibility.reason };
    //  點數不足：投入過的仍然是「已生效」，只是這次升不了；沒投入過才是「點數不足」。
    case "points": return rank > 0
      ? { key: "active", reason: eligibility.reason }
      : { key: "needsPoints", reason: eligibility.reason };
    default: return { key: "locked", reason: eligibility.reason };
  }
}

function categoryProgress(state, categoryId) {
  const nodes = teamDevelopmentNodesByCategory(categoryId);
  const invested = nodes.reduce((sum, node) => sum + (state.ranks[node.id] ?? 0), 0);
  const spendable = nodes.reduce((sum, node) => sum + node.activeLevelCap, 0);
  return { invested, percent: spendable ? clamp01(invested / spendable) : 0 };
}

function primaryDirection(state) {
  const top = TEAM_DEVELOPMENT_CATEGORIES
    .map((cat, index) => ({ cat, index, ...categoryProgress(state, cat.id) }))
    .sort((a, b) => b.invested - a.invested || a.index - b.index)[0];
  return top?.invested ? top.cat.zh : "尚未選定";
}

function routeNodeState(state, node) {
  const rank = state.ranks[node.id] ?? 0;
  const { key: status } = nodeStatus(state, node);
  const info = STATUS[status];
  return { rank, status, color: status === "future" ? GC.gray : info.color, info };
}

const currentEffectOf = (node, rank) => rank > 0 ? teamDevelopmentLevelEffect(node, rank - 1) : null;

/**
 * TD-56：「下一個發展點從哪來」。
 *
 * ⚠ 這一條是**第二層**資訊（見 `docs/design/ESMO_UIUX設計原則.md`）：
 *   一行說明 ＋ 一條進度條，完整規則收在下面的可展開區塊裡。
 * ⚠ 用玩家語言：講「俱樂部等級」與「賽季」，不講 milestone / grant / ledger。
 */
function NextPointHint({ points, clubLevel }) {
  const level = points.next.clubLevel;
  const season = points.next.careerSeason;
  const done = points.lifetimeGranted >= points.treeTotal;
  if (done) {
    return (
      <div style={{ marginTop: 11, background: `${GC.gold}12`, border: `1px solid ${GC.gold}33`, borderRadius: 10, padding: "8px 10px" }}>
        <span style={{ color: GC.gold, fontSize: 10, fontWeight: 900 }}>目前所有發展路線都已開放投入</span>
        <span style={{ color: GC.gray, fontSize: 9, marginLeft: 6 }}>新路線開放時會再發點數</span>
      </div>
    );
  }
  const items = [];
  if (level) {
    items.push({
      key: "level",
      icon: "▲",
      color: GC.blueL,
      title: `俱樂部升到 Lv.${level.level}`,
      sub: `還差 ${level.levelsToGo} 級 · 打正式賽最快`,
      reward: "+1 點",
    });
  }
  items.push({
    key: "season",
    icon: "◷",
    color: GC.purp,
    title: `打完第 ${season.season - 1} 賽季`,
    sub: `還有 ${season.daysToGo} 天`,
    reward: `+${season.points} 點`,
  });
  return (
    <div style={{ marginTop: 11 }}>
      <div style={{ color: GC.gray, fontSize: 8, fontWeight: 900, letterSpacing: "0.16em", marginBottom: 5 }}>下一個發展點</div>
      <div style={{ display: "grid", gap: 6 }}>
        {items.map((item) => (
          <div key={item.key} data-testid={`development-next-${item.key}`}
            style={{ display: "flex", alignItems: "center", gap: 9, background: GC.card2, border: `1px solid ${item.color}2e`, borderRadius: 10, padding: "7px 10px" }}>
            <span style={{ color: item.color, fontSize: 13, fontWeight: 900, lineHeight: 1 }}>{item.icon}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: "#e5e7eb", fontSize: 10.5, fontWeight: 900 }}>{item.title}</div>
              <div style={{ color: GC.gray, fontSize: 8.5, marginTop: 1 }}>{item.sub}</div>
            </div>
            <span style={{ color: item.color, fontSize: 10, fontWeight: 900, fontFamily: MONO, whiteSpace: "nowrap" }}>{item.reward}</span>
          </div>
        ))}
      </div>
      <div style={{ color: GC.gray, fontSize: 8, marginTop: 5 }}>俱樂部等級 Lv.{clubLevel} · 快速練習不會給發展點</div>
    </div>
  );
}

/**
 * 第三層：完整規則。**預設收合**——主畫面不該被一段規則說明佔掉。
 */
function PointSourceDetail({ points }) {
  const [open, setOpen] = useState(false);
  const rows = [
    ["生涯起始", `${points.bySource.seed} 點`],
    ["俱樂部等級里程碑", `${points.bySource.clubLevel} / ${CLUB_LEVEL_MILESTONES.length} 點`],
    ["賽季完成獎勵", `${points.bySource.careerSeason} 點（每季 ${POINTS_PER_CAREER_SEASON} 點）`],
  ];
  if (points.bySource.legacy > 0) rows.push(["既有存檔保留", `${points.bySource.legacy} 點`]);
  return (
    <div style={{ marginTop: 9 }}>
      <button type="button" onClick={() => setOpen((v) => !v)} data-testid="development-point-detail-toggle"
        style={{ background: "transparent", border: "none", color: GC.blueL, fontSize: 9.5, fontWeight: 900, cursor: "pointer", padding: "3px 0", minHeight: 32 }}>
        {open ? "▾" : "▸"} 發展點怎麼拿到的？
      </button>
      {open && (
        <div data-testid="development-point-detail" style={{ background: GC.card2, borderRadius: 10, padding: "9px 11px", marginTop: 3 }}>
          <div style={{ color: GC.gray, fontSize: 9, lineHeight: 1.6 }}>
            發展點來自經營生涯本身：打正式比賽推高俱樂部等級，以及打完整個賽季。
            一般對戰也算俱樂部經驗，但等級里程碑只有 {CLUB_LEVEL_MILESTONES.length} 個
            —— 想更快拿滿整棵樹，還是得把賽季打完。
          </div>
          <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
            {rows.map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ color: GC.gray, fontSize: 9 }}>{label}</span>
                <span style={{ color: "#e5e7eb", fontSize: 9, fontWeight: 900, fontFamily: MONO }}>{value}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, borderTop: `1px solid ${GC.line}`, paddingTop: 4, marginTop: 2 }}>
              <span style={{ color: GC.gray, fontSize: 9 }}>累計獲得</span>
              <span style={{ color: GC.gold, fontSize: 9, fontWeight: 900, fontFamily: MONO }}>{points.lifetimeGranted} / {points.treeTotal} 點</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function nextRouteNode(state, nodes) {
  const keyOf = (node) => nodeStatus(state, node).key;
  const actionable = nodes.find((node) => ["available", "upgrade"].includes(keyOf(node)));
  if (actionable) return { node: actionable, status: "actionable" };
  //  ⚠ 「點數不足」也是下一個該看的節點——它只差點數，比前置沒完成的更接近。
  const needsPoints = nodes.find((node) => keyOf(node) === "needsPoints");
  if (needsPoints) return { node: needsPoints, status: "needsPoints" };
  const locked = nodes.find((node) => keyOf(node) === "locked");
  if (locked) return { node: locked, status: "locked" };
  const planned = nodes.find((node) => keyOf(node) === "future");
  return planned ? { node: planned, status: "future" } : { node: null, status: "complete" };
}

function ProgressCells({ rank, color }) {
  return (
    <div aria-label={`目前等級 ${rank} / 3`} style={{ display: "flex", gap: 4, flex: 1 }}>
      {[0, 1, 2].map((level) => (
        <span key={level} style={{ height: 5, borderRadius: 99, flex: 1, background: level < rank ? color : "rgba(255,255,255,0.08)", transition: "background 180ms ease" }} />
      ))}
    </div>
  );
}

function CategoryMeter({ state, category }) {
  const color = colorOf(category);
  const progress = categoryProgress(state, category.id);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "74px minmax(0,1fr) 30px", alignItems: "center", gap: 7, minWidth: 0 }}>
      <span style={{ color: color, fontSize: 9.5, fontWeight: 900 }}>{category.zh}</span>
      <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
        <div style={{ width: `${progress.percent * 100}%`, height: "100%", borderRadius: 99, background: color, transformOrigin: "left center" }} />
      </div>
      <span style={{ color: GC.gray, fontSize: 9, fontFamily: MONO, textAlign: "right" }}>{progress.invested}</span>
    </div>
  );
}

function DevelopmentRoute({ state, nodes, color }) {
  return (
    <div style={{ display: "flex", gap: 0, overflowX: "auto", padding: "6px 1px 2px" }}>
      {nodes.map((node, index) => {
        const route = routeNodeState(state, node);
        const isDone = route.rank > 0;
        return (
          <React.Fragment key={node.id}>
            <div data-development-route-node={node.id} style={{ width: 74, minWidth: 74, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, textAlign: "center" }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", display: "grid", placeItems: "center", color: isDone ? "#0a0b0f" : route.color, background: isDone ? route.color : "transparent", border: `1px solid ${route.color}88`, fontSize: 8, fontWeight: 950 }}>{isDone ? "✓" : index + 1}</div>
              <div style={{ color: isDone ? "#e5e7eb" : GC.gray, fontSize: 8.5, lineHeight: 1.25, maxWidth: 70, overflowWrap: "anywhere" }}>{node.name}</div>
              <div style={{ color: route.color, fontSize: 7.5, fontWeight: 800 }}>{route.rank > 0 ? `Lv.${route.rank}` : route.status === "future" ? "規劃中" : "未開始"}</div>
            </div>
            {index < nodes.length - 1 && <div aria-hidden="true" style={{ height: 1, flex: "1 0 12px", marginTop: 9, background: route.rank > 0 ? `${color}99` : GC.line }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function RouteSummary({ state, nodes, color }) {
  const unlocked = nodes
    .map((node) => ({ node, rank: state.ranks[node.id] ?? 0, effect: currentEffectOf(node, state.ranks[node.id] ?? 0) }))
    .filter((item) => item.rank > 0 && item.effect?.status === "live");
  const next = nextRouteNode(state, nodes);
  const nextRank = next.node ? state.ranks[next.node.id] ?? 0 : 0;
  const nextEffect = next.node ? teamDevelopmentLevelEffect(next.node, nextRank) : null;
  const nextLabel = next.status === "actionable" ? "下一個可發展"
    : next.status === "needsPoints" ? "下一個節點（發展點不足）"
    : next.status === "locked" ? "下一個節點（先完成前置）"
    : next.status === "future" ? "下一個節點（規劃中）" : "目前路線已完成可用階段";
  return (
    <div data-testid="development-route-summary" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(190px,100%),1fr))", gap: 7, marginTop: 10 }}>
      <div style={{ background: GC.card, border: `1px solid ${color}33`, borderRadius: 9, padding: "8px 9px", minWidth: 0 }}>
        <div style={{ color, fontSize: 8.5, fontWeight: 900 }}>已解鎖效果</div>
        {unlocked.length ? unlocked.slice(0, 3).map(({ node, rank, effect }) => (
          <div key={node.id} data-development-current-effect={node.id} style={{ marginTop: 5, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, minWidth: 0 }}>
              <span style={{ color: "#e5e7eb", fontSize: 8.5, overflowWrap: "anywhere" }}>{node.name}</span>
              <span style={{ color: GC.green, fontSize: 8, fontFamily: MONO, whiteSpace: "nowrap" }}>Lv.{rank}</span>
            </div>
            <div style={{ color: GC.green, fontSize: 8, lineHeight: 1.4, marginTop: 2 }}>{effect.text}</div>
          </div>
        )) : <div style={{ color: GC.gray, fontSize: 8.5, lineHeight: 1.45, marginTop: 5 }}>完成節點後，這裡會列出目前已啟用的支援。</div>}
      </div>
      <div data-development-next-node style={{ background: GC.card, border: `1px solid ${color}33`, borderRadius: 9, padding: "8px 9px", minWidth: 0 }}>
        <div style={{ color, fontSize: 8.5, fontWeight: 900 }}>{nextLabel}</div>
        {next.node ? <>
          <div style={{ color: "#e5e7eb", fontSize: 10, fontWeight: 900, marginTop: 5, overflowWrap: "anywhere" }}>{next.node.name}</div>
          <div style={{ color: nextEffect?.status === "live" ? GC.green : GC.gray, fontSize: 8.5, lineHeight: 1.45, marginTop: 2 }}>{nextEffect?.text ?? "完成前置條件後查看下一級效果"}</div>
          <div style={{ color: GC.gray, fontSize: 8, marginTop: 3 }}>影響：{next.node.scope}</div>
        </> : <div style={{ color: GC.gray, fontSize: 8.5, marginTop: 5 }}>目前沒有下一個可投入節點。</div>}
      </div>
    </div>
  );
}

export default function TeamDevelopmentScreen({ onBack }) {
  const rawState = useProfileStore((s) => s.teamDevelopment);
  const players = useProfileStore((s) => s.players) ?? [];
  const csHistory = useProfileStore((s) => s.csHistory) ?? [];
  const mobaHistory = useSeasonStore((s) => s.history) ?? [];
  const purchase = useProfileStore((s) => s.purchaseTeamDevelopment);
  //  TD-56：供給只由這兩個既有的單調權威決定。
  //  ⚠ 刻意訂閱**純量**再自己 useMemo——直接 `s.developmentPointsView()` 會
  //    每次 render 回一個新物件，zustand 的 getSnapshot 會判定為變更
  //    （同 TeamScreen 對 `clubProgressionView()` 的處置）。
  const clubXp = useProfileStore((s) => s.clubProgression?.xp ?? 0);
  const careerDays = useProfileStore((s) => s.meta?.days ?? 1);
  const syncPoints = useProfileStore((s) => s.syncDevelopmentPoints);
  const state = useMemo(() => sanitizeTeamDevelopment(rawState), [rawState]);
  const points = useMemo(
    () => developmentPointsViewOf(state, { clubXp, days: careerDays }),
    [state, clubXp, careerDays],
  );
  //  安全網：載入／推進日／賽後結算都會對帳，這裡只處理「萬一漏了一個寫入點」。
  //  冪等 ⇒ 正常情況下這一次呼叫什麼都不會做。
  useEffect(() => { if (typeof syncPoints === "function") syncPoints(); }, [syncPoints]);
  const effects = useMemo(() => teamDevelopmentEffects(state), [state]);
  const dataAnalysis = useMemo(() => {
    const moba = mobaAnalytics(mobaHistory);
    const growthEntries = players.reduce((sum, player) => sum + growthLogOf(player).length, 0);
    const csWins = csHistory.filter((match) => match?.winner === "us").length;
    return { moba, growthEntries, csGames: csHistory.length, csWins };
  }, [csHistory, mobaHistory, players]);
  const [tab, setTab] = useState("general");
  const [confirmId, setConfirmId] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const rootRef = useRef(null);
  const tabContentRef = useRef(null);
  const pointsRef = useRef(null);
  const cat = categoryOf(tab);
  const nodes = teamDevelopmentNodesByCategory(tab);
  const confirmNode = confirmId ? teamDevelopmentNodeById(confirmId) : null;
  const currentColor = colorOf(cat);

  useGSAP(() => {
    const content = tabContentRef.current;
    if (!content) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const cards = gsap.utils.toArray("[data-development-card]", content);
    // Revertable GSAP contexts can be interrupted while React replaces the
    // cards. Establish a visible baseline before the next transition so a
    // cancelled entrance never leaves the active category transparent.
    gsap.set([content, ...cards], { autoAlpha: 1, y: 0 });
    if (reduced) {
      return;
    }
    const timeline = gsap.timeline({ defaults: { ease: "power2.out" } });
    timeline.fromTo(content, { y: 8 }, { y: 0, duration: 0.22, clearProps: "transform" })
      .fromTo(cards, { y: 10 }, { y: 0, duration: 0.26, stagger: 0.035, clearProps: "transform" }, "-=0.1");
    return () => timeline.kill();
  }, { scope: rootRef, dependencies: [tab], revertOnUpdate: true });

  useGSAP(() => {
    if (!pointsRef.current) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    gsap.fromTo(pointsRef.current, { scale: 1.16, color: GC.gold }, { scale: 1, color: GC.gold, duration: 0.3, ease: "back.out(2)", clearProps: "transform" });
  }, { scope: rootRef, dependencies: [state.availablePoints], revertOnUpdate: true });

  useGSAP(() => {
    if (!receipt?.success) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const node = rootRef.current?.querySelector(`[data-development-node-id="${receipt.nodeId}"]`);
    const fill = node?.querySelector("[data-development-progress-fill]");
    if (!node) return;
    const timeline = gsap.timeline({ defaults: { ease: "power2.out" } });
    timeline.to(node, { boxShadow: `0 0 0 3px ${currentColor}33`, duration: 0.16 })
      .to(node, { boxShadow: "0 0 0 0 transparent", duration: 0.3 });
    if (fill) timeline.fromTo(fill, { scaleX: 0.68 }, { scaleX: 1, duration: 0.34 }, "<");
    return () => timeline.kill();
  }, { scope: rootRef, dependencies: [state.spentPoints, receipt?.nodeId], revertOnUpdate: true });

  const confirmPurchase = () => {
    if (!confirmNode || typeof purchase !== "function") return;
    const result = purchase(confirmNode.id);
    setReceipt(result);
    if (result.success) setConfirmId(null);
  };

  return (
    <ManageFrame title="戰隊發展" subtitle="CLUB DEVELOPMENT" onBack={onBack}
      right={<span ref={pointsRef} style={{ background: `${GC.gold}18`, color: GC.gold, fontSize: 11, fontWeight: 900, borderRadius: 8, padding: "4px 10px", whiteSpace: "nowrap" }}>{state.availablePoints} 發展點</span>}>
      <div ref={rootRef} style={{ fontFamily: FONT }}>
        <section style={{ background: `linear-gradient(135deg,${GC.card2},rgba(59,130,246,0.1))`, border: `1px solid ${GC.blueL}33`, borderRadius: 14, padding: "14px", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0, flex: "1 1 190px" }}>
              <div style={{ color: GC.blueL, fontSize: 9, fontWeight: 900, letterSpacing: "0.16em" }}>俱樂部長期方向</div>
              <div style={{ color: "white", fontSize: 20, fontWeight: 950, marginTop: 3 }}>{primaryDirection(state)}</div>
              <div style={{ color: GC.gray, fontSize: 9.5, lineHeight: 1.55, marginTop: 5 }}>把發展點投入路線，逐步解鎖訓練、賽前準備、球探與經營支援。</div>
            </div>
            <div style={{ display: "flex", gap: 14, flexShrink: 0 }}>
              <div><div style={{ color: GC.gray, fontSize: 8 }}>可用發展點</div><div style={{ color: GC.gold, fontSize: 18, fontWeight: 900, fontFamily: MONO }}>{state.availablePoints}</div></div>
              <div><div style={{ color: GC.gray, fontSize: 8 }}>已投入點數</div><div style={{ color: GC.green, fontSize: 18, fontWeight: 900, fontFamily: MONO }}>{state.spentPoints}</div></div>
            </div>
          </div>
          <NextPointHint points={points} clubLevel={clubLevelOf(clubXp)} />
          <PointSourceDetail points={points} />
          <div style={{ display: "grid", gap: 7, marginTop: 13 }}>
            {TEAM_DEVELOPMENT_CATEGORIES.map((category) => <CategoryMeter key={category.id} state={state} category={category} />)}
          </div>
          <div style={{ borderTop: `1px solid ${GC.line}`, marginTop: 13, paddingTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ color: "#e5e7eb", fontSize: 10, fontWeight: 900 }}>發展路線・{cat.zh}</span>
              <span style={{ color: GC.gray, fontSize: 8.5 }}>由基礎走向專精</span>
            </div>
            <DevelopmentRoute state={state} nodes={nodes} color={currentColor} />
            <RouteSummary state={state} nodes={nodes} color={currentColor} />
          </div>
        </section>

        {effects.unlocks.dataAnalysis && (
          <section data-testid="team-development-data-analysis" style={{ background: GC.card, border: `1px solid ${GC.green}44`, borderRadius: 12, padding: "11px 12px", marginBottom: 10 }}>
            <div style={{ color: GC.green, fontSize: 10, fontWeight: 900, letterSpacing: "0.12em" }}>數據分析摘要</div>
            <div style={{ color: GC.gray, fontSize: 9, lineHeight: 1.5, marginTop: 3 }}>資料直接來自既有戰績與成長紀錄，協助安排下一步培養。</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 7, marginTop: 9 }}>
              <div style={{ background: GC.card2, borderRadius: 8, padding: "7px 8px" }}><div style={{ color: GC.gray, fontSize: 8 }}>MOBA 已記錄場次</div><div style={{ color: "white", fontSize: 15, fontWeight: 900, fontFamily: MONO }}>{dataAnalysis.moba.games}</div><div style={{ color: GC.gray, fontSize: 8 }}>場均擊殺 {dataAnalysis.moba.avgKills.toFixed(1)}</div></div>
              <div style={{ background: GC.card2, borderRadius: 8, padding: "7px 8px" }}><div style={{ color: GC.gray, fontSize: 8 }}>CS 訓練賽</div><div style={{ color: "white", fontSize: 15, fontWeight: 900, fontFamily: MONO }}>{dataAnalysis.csGames}</div><div style={{ color: GC.gray, fontSize: 8 }}>勝場 {dataAnalysis.csWins}</div></div>
              <div style={{ background: GC.card2, borderRadius: 8, padding: "7px 8px", gridColumn: "1 / -1" }}><div style={{ color: GC.gray, fontSize: 8 }}>選手成長紀錄</div><div style={{ color: "white", fontSize: 15, fontWeight: 900, fontFamily: MONO }}>{dataAnalysis.growthEntries}</div><div style={{ color: GC.gray, fontSize: 8 }}>所有選手成長帳簿合計</div></div>
            </div>
          </section>
        )}

        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 3, marginBottom: 10 }}>
          {TEAM_DEVELOPMENT_CATEGORIES.map((item) => {
            const active = tab === item.id;
            const color = colorOf(item);
            return <button key={item.id} data-testid={`development-tab-${item.id}`} onClick={() => { setTab(item.id); setConfirmId(null); setReceipt(null); }}
              style={{ flex: "1 0 78px", border: `1px solid ${active ? color : GC.line}`, borderRadius: 9, padding: "8px", background: active ? `${color}1c` : GC.card, color: active ? color : GC.gray, cursor: "pointer", fontSize: 11, fontWeight: 900, fontFamily: FONT }}>
              {item.emoji} {item.zh}
            </button>;
          })}
        </div>

        <div ref={tabContentRef}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
            <div style={{ color: currentColor, fontSize: 12, fontWeight: 900 }}>{cat.emoji} {cat.zh}</div>
            <div style={{ color: GC.gray, fontSize: 9, textAlign: "right" }}>{cat.description}</div>
          </div>

          {receipt && (
            <div style={{ background: receipt.success ? `${GC.green}12` : `${GC.red}12`, border: `1px solid ${(receipt.success ? GC.green : GC.red)}44`, borderRadius: 9, padding: "8px 10px", color: receipt.success ? GC.green : GC.red, fontSize: 10, fontWeight: 800, marginBottom: 8 }}>
              {receipt.success ? `已完成「${teamDevelopmentNodeById(receipt.nodeId)?.name ?? "發展節點"}」Lv.${receipt.newRank}` : receipt.failureReason}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(260px,100%),1fr))", gap: 9 }}>
            {nodes.map((node) => {
              const rank = state.ranks[node.id] ?? 0;
              const { key: statusKey, reason: blockedWhy } = nodeStatus(state, node);
              const status = STATUS[statusKey];
              const selected = confirmId === node.id;
              const currentEffect = currentEffectOf(node, rank);
              const nextEffect = teamDevelopmentLevelEffect(node, rank);
              const c = currentColor;
              const canPurchase = typeof purchase === "function" && (statusKey === "available" || statusKey === "upgrade");
              return (
                <article key={node.id} data-development-card data-development-node-id={node.id} style={{ background: selected ? GC.card2 : GC.card, border: `1px solid ${selected ? c : status.color + "55"}`, borderRadius: 12, padding: "11px 12px", minWidth: 0, boxShadow: "0 0 0 0 transparent" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <div style={{ color: "white", fontSize: 12, fontWeight: 900, overflowWrap: "break-word" }}>{node.name}</div>
                        <span style={{ color: c, fontSize: 7.5, fontWeight: 900, border: `1px solid ${c}55`, borderRadius: 4, padding: "2px 5px" }}>{TIER_LABEL[node.tier]}</span>
                      </div>
                      <div style={{ color: GC.gray, fontSize: 9.5, lineHeight: 1.55, marginTop: 4 }}>{node.description}</div>
                    </div>
                    <span style={{ color: status.color, border: `1px solid ${status.color}55`, borderRadius: 5, padding: "2px 5px", fontSize: 8, fontWeight: 900, flexShrink: 0, whiteSpace: "nowrap" }}>{status.label}</span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 10 }}>
                    <span style={{ color: "#e5e7eb", fontSize: 10, fontFamily: MONO, whiteSpace: "nowrap" }}>Lv.{rank} / 3</span>
                    <div data-development-progress-fill style={{ flex: 1, transformOrigin: "left center" }}><ProgressCells rank={rank} color={c} /></div>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginTop: 9 }}>
                    <div style={{ minWidth: 0 }}>
                      {currentEffect?.status === "live" && <div data-development-current-effect={node.id} style={{ marginBottom: 5 }}>
                        <div style={{ color: GC.gray, fontSize: 8 }}>已解鎖效果</div>
                        <div style={{ color: GC.green, fontSize: 9.5, lineHeight: 1.45, marginTop: 2 }}>{currentEffect.text}</div>
                      </div>}
                      <div style={{ color: GC.gray, fontSize: 8 }}>下一級效果</div>
                      <div data-development-next-effect={node.id} style={{ color: nextEffect?.status === "live" ? "#e5e7eb" : GC.gray, fontSize: 9.5, lineHeight: 1.45, marginTop: 2 }}>{nextEffect ? nextEffect.text : "已完成全部階段"}</div>
                      {/*  ⚠ 這個旗標講的是「這一級的效果**已經做出來了**」，不是「你現在買得起」。
                          原本寫「目前可生效」，在一張同時標示「待解鎖」的卡片上會直接打架
                          （TD-56 Owner Review 發現 ②）。改成描述投入之後會發生什麼。 */}
                      {nextEffect && <span style={{ color: nextEffect.status === "live" ? GC.green : GC.gray, fontSize: 7.5, fontWeight: 800 }}>{nextEffect.status === "live" ? "投入後生效" : "尚未開放"}</span>}
                    </div>
                    <span style={{ color: c, fontSize: 8.5, fontWeight: 900, whiteSpace: "nowrap" }}>影響：{node.scope}</span>
                  </div>

                  {/*  為什麼不能投入。⚠ 這句話直接來自 domain 的資格判定，畫面不自己組——
                       「需先完成「訓練流程優化」」與「需要 1 點發展點」是兩件事，
                       合成一個「待解鎖」正是 Owner Review 發現 ② 的問題。 */}
                  {blockedWhy && <div data-development-blocked-reason={node.id}
                    style={{ color: statusKey === "needsPoints" ? GC.gold : GC.gray, fontSize: 8.5, lineHeight: 1.4, marginTop: 7 }}>{blockedWhy}</div>}
                  {!blockedWhy && node.prerequisites.length > 0 && <div style={{ color: c, fontSize: 8.5, lineHeight: 1.4, marginTop: 7 }}>前置：{node.prerequisites.map((pre) => teamDevelopmentNodeById(pre.nodeId)?.name).join("、")}</div>}
                  <div data-development-cta-row style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 9 }}>
                    <span style={{ color: GC.gray, fontSize: 8.5 }}>每級 {node.costPerRank} 點</span>
                    {/*  ⚠ 手機的觸控高度由下面的 <style> 補到 44px（`data-development-cta`），
                         不在這裡寫死尺寸——桌機用滑鼠，不需要把按鈕做大。 */}
                    {canPurchase && <button data-development-cta data-testid={`development-cta-${node.id}`}
                      onClick={() => setConfirmId(selected ? null : node.id)}
                      style={{ background: `${c}1c`, border: `1px solid ${c}66`, borderRadius: 7, color: c, padding: "5px 9px", fontSize: 9, fontWeight: 900, cursor: "pointer", fontFamily: FONT }}>{selected ? "收起" : "投入發展點"}</button>}
                  </div>
                  {selected && canPurchase && (
                    <div style={{ marginTop: 8, borderTop: `1px solid ${c}33`, paddingTop: 8 }}>
                      <div style={{ color: "#e5e7eb", fontSize: 10, fontWeight: 800, marginBottom: 6 }}>確認投入 {node.costPerRank} 點，解鎖下一級效果？</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={confirmPurchase} style={{ background: c, border: "none", borderRadius: 7, color: "#0a0b0f", padding: "6px 11px", fontSize: 9, fontWeight: 900, cursor: "pointer", fontFamily: FONT }}>確認升級</button>
                        <button onClick={() => setConfirmId(null)} style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${GC.line}`, borderRadius: 7, color: GC.gray, padding: "6px 11px", fontSize: 9, fontWeight: 800, cursor: "pointer", fontFamily: FONT }}>取消</button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
        <div style={{ color: GC.gray, fontSize: 8.5, lineHeight: 1.55, marginTop: 11 }}>發展點只投入俱樂部路線，與選手訓練及個人特質分開計算；重複點擊不會再次扣點。</div>
        {/*  ⚠ 手機 CTA 觸控目標（Owner Review 發現 ⑤）：實測原本只有 61×23px。
             這裡只長**觸控高度**（min-height + 垂直 padding 歸零），視覺上仍是同一顆按鈕；
             多出來的高度用同一段規則把該列的 margin-top 收回去 ⇒ 卡片不會明顯變高，
             文字也不重排。桌機用滑鼠，不套這條。 */}
        <style>{`[data-development-card]{will-change:transform,opacity}[data-development-progress-fill]{will-change:transform}@media(max-width:430px){[data-development-card]{padding:10px!important}[data-development-card] button{padding-left:7px!important;padding-right:7px!important}[data-development-cta]{min-height:44px!important;min-width:44px!important;padding-top:0!important;padding-bottom:0!important}[data-development-cta-row]{margin-top:1px!important;margin-bottom:-6px!important}}@media(prefers-reduced-motion:reduce){[data-development-card],[data-development-progress-fill]{transition:none!important;animation:none!important}}`}</style>
      </div>
    </ManageFrame>
  );
}
