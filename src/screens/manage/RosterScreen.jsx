// ============================================================================
//  screens/manage/RosterScreen.jsx — 選手名單（Sprint21）
//  Legacy 來源：EsportsGame.jsx RosterModule(line3373) Component 化。
//  Presentation 逐項保留：人數上限徽章（滿額轉紅）/ 五種篩選膠囊 /
//    選手列（頭像＋英雄小角標、四項聚合能力、M/F 雙戰力、狀態徽章）/
//    「還可招募 N 名」虛線提示 / 詳情 Modal（雙戰力卡＋狀態、士氣潛力合約、
//    改名、五定位適配、16 項能力分四類條圖、個性 boost↑/nerf↓ 標色）。
//  Adapter（不造假）：選手＝profileStore.players；能力/戰力/適配＝playerModel
//    純函數；英雄圖＝HeroPortrait（唯一入口）。改名 / 換定位寫回 Store。
// ============================================================================
import React, { useMemo, useRef, useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { teamDevelopmentEffects } from "../../platform/development/teamDevelopment.js";
import {
  STAT_DEF, MOBA_ROLES, ROSTER_CAP,
  calcPower, posFit, bestPositions, personalityById, CS_ROLE_BY_MOBA_ROLE, csSuitabilityOf,
} from "../../data/playerModel.js";
import { calculateLevelProgress } from "../../platform/progress/playerLevel.js";
import { latestGrowth, growthLogOf } from "../../platform/progress/growthLog.js";
import { LatestGrowthHint, GrowthEntryRow } from "../../ui/GrowthUI.jsx";
import { PlayerAvatar } from "../../ui/PlayerFace.jsx";
import { withDerivedStats } from "../../platform/talents/playerDerivedStats.js";
import { ROSTER_TIERS, tierOf } from "../../platform/contracts/matchSquad.js";
import { conditionSummary } from "../../platform/condition/playerCondition.js";
import { totalXpForLevel, xpRequiredForLevel } from "../../platform/progress/playerLevel.js";
import { careerStageOf } from "../../ui/playerProfileFoundation.js";
import { ESMO_CSS_VARS } from "../../ui/designSystem.js";
import { useIsMobile } from "../../ui/useViewport.js";
import { GamePageHeader, PlayerListRow, ProgressBar, StatTile, StatusBadge } from "../../ui/PlayerUi.jsx";
import "../../ui/playerUi.css";
import { GC } from "../../ui/theme.js";
import ManageFrame from "./ManageFrame.jsx";
import { usePlayerUiMotion } from "./usePlayerUiMotion.js";

const FILTERS = ["全部", "主力", "預備隊", "訓練中", "閒置"];
const GAME_FILTERS = ["全部", "MOBA", "CS"];

const CS_ROLE_LABELS = Object.freeze({
  entry: "突破手",
  rifler: "步槍手",
  awp: "狙擊手",
  lurker: "游走手",
  igl: "指揮",
});

// 卡片只取 3～4 個能代表該 role 的既有能力；完整 16 項留在詳情檢視。
const CS_REP_KEYS = Object.freeze({
  entry: ["reflex", "apm", "courage", "accuracy"],
  rifler: ["accuracy", "reflex", "positioning", "focus"],
  awp: ["accuracy", "focus", "positioning", "clutch"],
  lurker: ["decision", "positioning", "clutch", "adaptability"],
  igl: ["decision", "tacticalIQ", "comms", "leadership"],
});

const MOBA_REP_KEYS = Object.freeze(["reflex", "positioning", "decision", "synergy"]);

const csRoleOf = (p) => CS_ROLE_BY_MOBA_ROLE[p?.role] || "rifler";

function CsStatChips({ player, role }) {
  const keys = CS_REP_KEYS[role] || CS_REP_KEYS.rifler;
  return (
    <div style={{ display: "flex", gap: 7, marginTop: 5, flexWrap: "wrap", minWidth: 0 }}>
      {keys.map((key) => {
        const def = STAT_DEF.find((s) => s.key === key);
        const value = Math.round(player.stats?.[key] ?? 50);
        return (
          <span key={key} style={{ fontSize: 8 }}>
            <span style={{ color: "#a1a1aa" }}>{def?.zh || key}</span>{" "}
            <span style={{ color: value >= 80 ? GC.gold : value >= 65 ? GC.green : "#a1a1aa", fontWeight: 800 }}>{value}</span>
          </span>
        );
      })}
    </div>
  );
}

function MobaStatChips({ player }) {
  return (
    <div style={{ display: "flex", gap: 7, marginTop: 5, flexWrap: "wrap", minWidth: 0 }}>
      {MOBA_REP_KEYS.map((key) => {
        const def = STAT_DEF.find((s) => s.key === key);
        const value = Math.round(player.stats?.[key] ?? 50);
        return (
          <span key={key} style={{ fontSize: 8 }}>
            <span style={{ color: "#a1a1aa" }}>{def?.zh || key}</span>{" "}
            <span style={{ color: value >= 80 ? GC.gold : value >= 65 ? GC.green : "#a1a1aa", fontWeight: 800 }}>{value}</span>
          </span>
        );
      })}
    </div>
  );
}

function CsIdentity({ player, positions }) {
  const role = csRoleOf(player);
  const suitability = csSuitabilityOf(positions)
    .filter((item) => item.label !== CS_ROLE_LABELS[role])
    .slice(0, 3);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        <span style={{ color: GC.gray, fontSize: 8.5 }}>主要定位</span>
        <span style={{ color: "#fb923c", fontSize: 11, fontWeight: 800 }}>{CS_ROLE_LABELS[role]}</span>
        <span title="角色代表選手擅長的打法，不限制隊伍組成。" aria-label="角色代表選手擅長的打法，不限制隊伍組成。" style={{ color: GC.gray, fontSize: 10, cursor: "help" }}>ⓘ</span>
      </div>
      {suitability.length > 0 && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ color: GC.gray, fontSize: 8.5 }}>其他適配</span>
        {suitability.map((item) => (
          <span key={item.pos} style={{ color: GC.gray, fontSize: 8, background: "rgba(255,255,255,0.05)", borderRadius: 5, padding: "2px 5px" }}>
            {item.label} {item.fit}
          </span>
        ))}
      </div>}
    </div>
  );
}

function csHighlights(player) {
  const rows = STAT_DEF.map((def) => ({ def, value: Math.round(player.stats?.[def.key] ?? 50) }))
    .sort((a, b) => b.value - a.value);
  return { strengths: rows.slice(0, 2), weaknesses: rows.slice(-2).reverse() };
}

// Legacy calcAggr：16 項壓成 4 項聚合顯示
const aggr = (p) => {
  const s = p.stats || {};
  const avg = (...keys) => Math.round(keys.reduce((a, k) => a + (s[k] || 50), 0) / keys.length);
  return { 機動: avg("apm", "reflex", "positioning"), 攻擊: avg("accuracy", "courage", "decision"), 防禦: avg("positioning", "clutch", "resilience"), 反應: avg("reflex", "focus", "mapAware") };
};
//  O2：等級進度（用既有的 playerLevel 公式，不另算一套刻度）
const levelProgressOf = (p) => {
  const lv = Math.max(1, Number(p?.lv) || 1);
  const xp = Math.max(0, Number(p?.xp) || 0);
  const base = totalXpForLevel(lv);
  const need = xpRequiredForLevel(lv + 1);
  const into = Math.max(0, xp - base);
  return { into: Math.round(into), need: Math.round(need), pct: need > 0 ? Math.min(100, Math.round((into / need) * 100)) : 0 };
};
const statusOf = (p) => ((p.energy ?? 100) < 30 ? "閒置" : p.status === "主力" ? "主力" : p.status || "預備隊");
const statusColor = (st) => (st === "主力" ? GC.green : st === "閒置" ? GC.red : st === "訓練中" ? GC.gold : GC.gray);
const statusToneOf = (st) => (st === "主力" ? "positive" : st === "閒置" ? "danger" : st === "訓練中" ? "warning" : "neutral");

/**
 * @param {"roster"|"talent"} [purpose] 集中驗收修正（項目五）：
 *   "talent" ⇒ 本頁是**天賦入口的中介頁**——標題改為「選擇要培養的選手」，
 *   每張卡多一顆「查看天賦」，點下去直達該選手的天賦樹（PlayerTalentScreen）。
 *   ⚠ 只改標題與卡片動作，**沒有第二套天賦系統、沒有第二套選手資料**。
 */
export default function RosterScreen({ onBack, onRecruit, onPlayer, purpose = "roster" }) {
  const talentMode = purpose === "talent";
  const players = useProfileStore((s) => s.players) ?? [];
  const development = useProfileStore((s) => s.teamDevelopment);
  const developmentEffects = teamDevelopmentEffects(development);
  const renamePlayer = useProfileStore((s) => s.renamePlayer);
  const setPlayerRole = useProfileStore((s) => s.setPlayerRole);
  const setPlayerStatus = useProfileStore((s) => s.setPlayerStatus);
  const setRosterTier = useProfileStore((s) => s.setRosterTier);
  const [filter, setFilter] = useState("全部");
  const [gameFilter, setGameFilter] = useState("全部");
  const [selId, setSelId] = useState(null);
  const [detailMode, setDetailMode] = useState("MOBA");
  const [editName, setEditName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const rootRef = useRef(null);
  const isMobile = useIsMobile();
  usePlayerUiMotion(rootRef, { mobile: isMobile, selectedId: selId, mode: detailMode });

  const sel = players.find((p) => p.id === selId) || null;
  const filtered = players.filter((p) => {
    const e = p.energy ?? 100;
    if (filter === "全部") return true;
    if (filter === "訓練中") return Boolean(p.training) || (e < 85 && e >= 30);
    if (filter === "閒置") return e < 30;
    return statusOf(p) === filter;
  });
  const isCsView = gameFilter === "CS";
  const contractSummary = useMemo(() => {
    const days = players.map((player) => Number(player.contract ?? 365)).filter(Number.isFinite);
    return {
      expiring: days.filter((value) => value <= 30).length,
      soonest: days.length ? Math.min(...days) : null,
    };
  }, [players]);

  return (
    <ManageFrame
      title={talentMode ? "選擇要培養的選手" : "選手名單"}
      subtitle={talentMode ? "TALENT · 選擇選手後進入天賦樹" : "ROSTER"} onBack={onBack}
      right={talentMode
        ? <span style={{ background: "rgba(167,139,250,0.15)", color: GC.purp, fontSize: 11, fontWeight: 800, borderRadius: 8, padding: "4px 10px", whiteSpace: "nowrap" }}>可用天賦點 {players.reduce((t, p) => t + (Number(p.talentPoints) || 0), 0)}</span>
        : <span style={{ background: players.length >= ROSTER_CAP ? "rgba(239,68,68,0.15)" : "rgba(96,165,250,0.15)", color: players.length >= ROSTER_CAP ? GC.red : GC.blue, fontSize: 11, fontWeight: 800, borderRadius: 8, padding: "4px 10px", whiteSpace: "nowrap" }}>{players.length} / {ROSTER_CAP} 人</span>}
    >
      <div
        ref={rootRef}
        data-roster-screen
        data-mode={isCsView ? "CS" : "MOBA"}
        className="player-ui-screen player-ui-roster"
        style={{ ...ESMO_CSS_VARS, "--player-accent": isCsView ? GC.gold : GC.purp }}
      >
      <GamePageHeader
        eyebrow={talentMode ? "TALENT / PLAYER PICK" : "ROSTER / TEAM SIGNAL"}
        title={talentMode ? "選擇要培養的選手" : "選手名單"}
        detail={`${players.length} / ${ROSTER_CAP} 人 · ${filtered.length} 人符合目前篩選`}
        icon="users"
        actions={<StatusBadge label={isCsView ? "CS VIEW" : "MOBA VIEW"} tone={isCsView ? "tactical" : "info"} icon="compete" />}
      />
      <div data-roster-filters className="player-ui-roster__filters">
        <div className="player-ui-filter-group">
          <span className="player-ui-filter-group__label">遊戲</span>
          <div data-testid="roster-game-filter" className="player-ui-filter-track">
            {GAME_FILTERS.map((f) => (
              <button key={f} data-testid={`roster-game-${f}`} className="player-ui-filter-button" aria-pressed={gameFilter === f} onClick={() => setGameFilter(f)}>{f}</button>
            ))}
          </div>
        </div>
        <div className="player-ui-filter-group">
          <span className="player-ui-filter-group__label">狀態</span>
          <div data-testid="roster-status-filter" className="player-ui-filter-track">
            {FILTERS.map((f) => (
              <button key={f} className="player-ui-filter-button" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="player-ui-profile-summary-grid player-ui-roster-summary-strip" data-player-ui-reveal>
        <StatTile label="目前顯示" value={filtered.length} detail={`共 ${players.length} 名選手`} tone="info" />
        <StatTile label="合約提醒" value={contractSummary.expiring} detail={contractSummary.soonest == null ? "尚無到期資料" : `最近 ${contractSummary.soonest} 天`} tone={contractSummary.expiring > 0 ? "warning" : "positive"} />
      </div>

      {developmentEffects.unlocks.contractSummary && (
        <section data-testid="contract-summary" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 7, background: GC.card, border: "1px solid " + GC.purp + "55", borderRadius: 11, padding: "9px 11px", marginBottom: 10 }}>
          <div>
            <div style={{ color: GC.purp, fontSize: 9, fontWeight: 900 }}>合約摘要</div>
            <div style={{ color: GC.gray, fontSize: 8, marginTop: 3 }}>快速掌握名單的續約準備</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#fff", fontSize: 13, fontWeight: 900 }}>{contractSummary.expiring} 人</div>
            <div style={{ color: GC.gray, fontSize: 8 }}>30 天內到期</div>
          </div>
          <div style={{ gridColumn: "1 / -1", color: GC.gray, fontSize: 8.5 }}>
            最早到期：<span style={{ color: "#fff", fontWeight: 800 }}>{contractSummary.soonest == null ? "尚無資料" : contractSummary.soonest + " 天"}</span>
          </div>
        </section>
      )}

      <div className="player-ui-roster__list">
        {filtered.map((p) => {
          const st = statusOf(p);
          const c = statusColor(st);
          const dp = withDerivedStats(p);
          const a = aggr(dp);   // S27：顯示 derived（含天賦）
          //  Milestone O2：狀態摘要（唯讀，由 condition 層產生，畫面不自己算）
          const cond = conditionSummary(p);
          const lvProg = levelProgressOf(p);
          const mp = calcPower(dp, "moba"), fp = calcPower(dp, "fps");
          const csRole = csRoleOf(p);
          const career = careerStageOf(p);
          return (
            <PlayerListRow key={p.id} data-testid={`roster-player-${p.id}`} data-roster-card selected={p.id === selId} onClick={() => { if (talentMode) { onPlayer?.(p.id); return; } setDetailMode(isCsView ? "CS" : "MOBA"); setSelId(p.id); setEditName(false); }}
              >
              <div data-roster-card-avatar className="player-ui-list-row__avatar"><PlayerAvatar player={p} size={46} ring={c} /></div>
              <div data-roster-card-summary className="player-ui-list-row__body">
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ color: "white", fontSize: 13, fontWeight: 800 }}>{p.name}</span>
                  {/* S26【A】：選手等級直接讀 profileStore 持久化值（賽後升級即時反映） */}
                  <span style={{ color: GC.gold, fontSize: 9, fontWeight: 800, background: "rgba(251,191,36,0.12)", borderRadius: 5, padding: "1px 5px" }}>Lv.{p.lv ?? 1}</span>
                  {isCsView ? <span style={{ color: "#fb923c", fontSize: 9, fontWeight: 700 }}>{CS_ROLE_LABELS[csRole]}</span> : <span style={{ color: GC.gray, fontSize: 9 }}>{p.role}</span>}
                  {personalityById(p.personality) && <span style={{ fontSize: 10 }}>{personalityById(p.personality).emoji}</span>}
                  {career.available && <span data-testid="roster-career-badge" style={{ color: GC.blueL, background: "rgba(96,165,250,0.12)", borderRadius: 5, padding: "1px 5px", fontSize: 8, fontWeight: 800 }}>{career.label}</span>}
                  {String(p.id).startsWith("r") && <span style={{ color: GC.green, fontSize: 7, fontWeight: 700 }}>🆕</span>}
                  {/* O2：可否出賽——顏色配文字，不只靠顏色 */}
                  <span style={{
                    marginLeft: "auto", fontSize: 8, fontWeight: 800, borderRadius: 5, padding: "1px 5px",
                    background: cond.canPlay ? "rgba(52,211,153,0.14)" : "rgba(248,113,113,0.14)",
                    color: cond.canPlay ? GC.green : GC.red,
                  }}>
                    {cond.injured ? `傷停 ${cond.injuryDays}天` : cond.canPlay ? "可出賽" : "不可出賽"}
                  </span>
                </div>
                {/* O2：經驗進度 ＋ 體力（疲勞）兩條細軸 */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <span style={{ color: GC.gray, fontSize: 7.5, width: 20 }}>EXP</span>
                  <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${lvProg.pct}%`, background: GC.gold }} />
                  </div>
                  <span style={{ color: GC.gray, fontSize: 7.5, width: 20 }}>體力</span>
                  <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${cond.energy}%`, background: cond.energy >= 70 ? GC.green : cond.energy >= 40 ? GC.gold : GC.red }} />
                  </div>
                  <span style={{ color: GC.gray, fontSize: 7.5 }}>{cond.energy}</span>
                </div>
                <div style={{ display: "flex", gap: 7, marginTop: 3, flexWrap: "wrap", minWidth: 0 }}>
                  {isCsView ? (
                    <>
                      <CsStatChips player={dp} role={csRole} />
                    </>
                  ) : (
                    <>
                    {Object.entries(a).map(([k, v]) => (
                      <span key={k} style={{ fontSize: 8 }}>
                        <span style={{ color: GC.gray }}>{k}</span>{" "}
                        <span style={{ color: v >= 80 ? GC.gold : v >= 65 ? GC.green : "#a1a1aa", fontWeight: 700 }}>{v}</span>
                      </span>
                    ))}
                    </>
                  )}
                  {/* Milestone P1：最近一次成長提示（讀成長帳簿，畫面不重算） */}
                  <span style={{ marginLeft: "auto", minWidth: 0, overflow: "hidden" }}>
                    <LatestGrowthHint entry={latestGrowth(p)} />
                  </span>
                </div>
              </div>
              <div data-roster-card-meta className="player-ui-list-row__trailing">
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginBottom: 2 }}>
                  <span style={{ color: isCsView ? "#fb923c" : GC.purp, fontSize: 9, fontWeight: 700 }}>戰力 {isCsView ? fp : mp}</span>
                </div>
                <div style={{ color: GC.gold, fontSize: 8, fontWeight: 700, marginBottom: 2 }}>潛力 {p.potential ?? 80}</div>
                {talentMode ? (
                  <span data-testid="talent-open" style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(167,139,250,0.16)", border: `1px solid ${GC.purp}66`, color: "#ddd6fe", fontSize: 9, fontWeight: 800, borderRadius: 6, padding: "3px 7px", whiteSpace: "nowrap" }}>
                    🌿 查看天賦{Number(p.talentPoints) > 0 ? ` · ${p.talentPoints}點` : ""}
                  </span>
                ) : (
                  <span style={{ background: `${c}22`, color: c, fontSize: 8, fontWeight: 700, borderRadius: 5, padding: "2px 6px" }}>{st}</span>
                )}
              </div>
            </PlayerListRow>
          );
        })}
      </div>

      {!talentMode && players.length < ROSTER_CAP && (
        <div className="player-ui-empty-action" role={onRecruit ? "button" : undefined} tabIndex={onRecruit ? 0 : undefined} onClick={onRecruit} style={{ textAlign: "center", color: GC.gray, fontSize: 10, marginTop: 14, padding: 12, border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 12, cursor: onRecruit ? "pointer" : "default" }}>
          還可招募 {ROSTER_CAP - players.length} 名選手 · 到「球探招募」挖掘新星
        </div>
      )}

      {sel && (() => {
        const pers = personalityById(sel.personality);
        const dsel = withDerivedStats(sel); const bp = bestPositions(dsel);
        const mp = calcPower(dsel, "moba"), fp = calcPower(dsel, "fps");
        const csRole = csRoleOf(sel);
        const highlights = csHighlights(dsel);
        const cond = sel.condition || "正常";
        const condColor = cond === "精神飽滿" ? GC.green : cond === "正常" ? "#d4d4d8" : cond === "疲勞" ? GC.gold : GC.red;
        // S26【A】：XP 進度由持久化 xp 推導（playerLevel 唯一刻度），與 Result receipt 同源
        const lp = calculateLevelProgress(sel.xp ?? 0, 0);
        return (
          <div data-roster-modal data-player-ui-reveal className="player-ui-roster__modal" onClick={() => setSelId(null)}>
            <div data-roster-modal-body data-player-ui-modal-body className="player-ui-roster__modal-body" onClick={(e) => e.stopPropagation()}>
              <div className="player-ui-modal-header">
                <PlayerAvatar player={sel} size={60} ring={condColor} radius={14} />
                <div className="player-ui-modal-header__identity">
                  <div className="player-ui-modal-header__name">{sel.name}</div>
                  {/* S26【C】：移除靜態英雄綁定（英雄只在 MOBA 流程顯示）；【A】改顯示持久化 XP */}
                  <div className="player-ui-modal-header__detail">{detailMode === "CS" ? CS_ROLE_LABELS[csRole] : sel.role} · Lv.{lp.newLevel} · XP {lp.xpIntoLevel}/{lp.xpForNextLevel}</div>
                  <ProgressBar label="EXP" value={lp.xpForNextLevel > 0 ? (lp.xpIntoLevel / lp.xpForNextLevel) * 100 : 0} detail={`${lp.xpIntoLevel}/${lp.xpForNextLevel}`} accent={GC.gold} compact />
                  {pers && <div style={{ marginTop: 3, fontSize: 10 }}>{pers.emoji} <span style={{ color: GC.purp, fontWeight: 700 }}>{pers.zh}</span></div>}
                </div>
                <button type="button" aria-label="關閉選手摘要" className="player-ui-close-button" onClick={() => setSelId(null)}>✕</button>
              </div>

              {onPlayer && (
                <button onClick={() => onPlayer(sel.id)}
                  type="button" className="player-ui-primary-action">
                  📋 開啟完整選手檔案
                </button>
              )}

              <div data-testid="roster-detail-game-mode" className="player-ui-mode-switch" style={{ marginBottom: 12 }}>
                {["MOBA", "CS"].map((view) => (
                  <button key={view} type="button" aria-pressed={detailMode === view} onClick={() => setDetailMode(view)}>{view}</button>
                ))}
              </div>

              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <div style={{ flex: 1, background: detailMode === "MOBA" ? "rgba(167,139,250,0.18)" : "rgba(167,139,250,0.12)", borderRadius: 8, padding: 7 }}>
                  <div style={{ color: GC.purp, fontSize: 8 }}>MOBA 戰力</div>
                  <div style={{ color: "white", fontSize: 15, fontWeight: 800 }}>{mp}</div>
                  <div style={{ color: GC.gray, fontSize: 7 }}>{detailMode === "MOBA" ? `適 ${bp.moba.pos.replace("MOBA", "")}` : "切換至 MOBA 查看適配"}</div>
                </div>
                <div style={{ flex: 1, background: detailMode === "CS" ? "rgba(251,146,60,0.2)" : "rgba(251,146,60,0.12)", borderRadius: 8, padding: 7 }}>
                  <div style={{ color: "#fb923c", fontSize: 8 }}>CS 戰力</div>
                  <div style={{ color: "white", fontSize: 15, fontWeight: 800 }}>{fp}</div>
                  <div style={{ color: GC.gray, fontSize: 7 }}>{detailMode === "CS" ? `角色 ${CS_ROLE_LABELS[csRole]}` : `適 ${bp.fps.pos.replace("FPS", "")}`}</div>
                </div>
                <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 7 }}>
                  <div style={{ color: GC.gray, fontSize: 8 }}>狀態</div>
                  <div style={{ color: condColor, fontSize: 12, fontWeight: 800 }}>{cond}</div>
                  <div style={{ color: GC.gray, fontSize: 7 }}>體力 {sel.energy ?? 100}</div>
                </div>
              </div>

              {detailMode === "MOBA" ? (
                <div data-testid="roster-moba-summary" style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 10, padding: "9px 10px", marginBottom: 12 }}>
                  <div style={{ color: GC.gray, fontSize: 8.5 }}>代表能力</div>
                  <MobaStatChips player={dsel} />
                </div>
              ) : (
                <div data-testid="roster-cs-detail" style={{ background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.22)", borderRadius: 10, padding: "9px 10px", marginBottom: 12 }}>
                  <CsIdentity player={sel} positions={bp} />
                  <div style={{ color: GC.gray, fontSize: 8.5, marginTop: 5 }}>代表能力</div>
                  <CsStatChips player={dsel} role={csRole} />
                </div>
              )}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12, fontSize: 9 }}>
                <span style={{ color: GC.gray }}>強項 <b style={{ color: GC.green }}>{highlights.strengths.map((x) => `${x.def.zh} ${x.value}`).join("／")}</b></span>
                <span style={{ color: GC.gray }}>弱項 <b style={{ color: GC.gold }}>{highlights.weaknesses.map((x) => `${x.def.zh} ${x.value}`).join("／")}</b></span>
              </div>

              <div style={{ display: "flex", gap: 10, marginBottom: 12, fontSize: 10 }}>
                <span style={{ color: GC.gray }}>士氣 <span style={{ color: (sel.morale ?? 70) >= 85 ? GC.green : (sel.morale ?? 70) >= 65 ? "#d4d4d8" : GC.red, fontWeight: 700 }}>{sel.morale ?? 70}</span></span>
                <span style={{ color: GC.gray }}>潛力 <span style={{ color: GC.gold, fontWeight: 700 }}>{sel.potential ?? 80}</span></span>
                <span style={{ color: GC.gray }}>合約 <span style={{ color: "#d4d4d8", fontWeight: 700 }}>{sel.contract ?? 365}天</span></span>
              </div>

              {/* 改名 + 角色定位 + 主力/預備隊 */}
              <div style={{ background: GC.card, borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ color: GC.gray, fontSize: 9, width: 40 }}>選手名</span>
                  {editName ? (
                    <>
                      <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} maxLength={12}
                        style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: `1px solid ${GC.purp}`, borderRadius: 6, padding: "4px 8px", color: "white", fontSize: 12, outline: "none" }} />
                      <button onClick={() => { renamePlayer(sel.id, nameInput); setEditName(false); }}
                        style={{ background: GC.green, border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: "#fff", fontSize: 10, fontWeight: 700 }}>儲存</button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, color: "white", fontSize: 12, fontWeight: 700 }}>{sel.name}</span>
                      <button onClick={() => { setNameInput(sel.name); setEditName(true); }}
                        style={{ background: "rgba(167,139,250,0.15)", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: GC.purp, fontSize: 10, fontWeight: 700 }}>✏️ 改名</button>
                    </>
                  )}
                </div>

                {detailMode === "MOBA" && <>
                  <div style={{ color: GC.gray, fontSize: 9, marginBottom: 5 }}>角色定位（切換看適配性）</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
                    {MOBA_ROLES.map((rl) => {
                      const fit = posFit(dsel, "MOBA" + rl);
                      const isCur = sel.role === rl;
                      return (
                        <button key={rl} onClick={() => setPlayerRole(sel.id, rl)}
                          style={{ flex: "1 1 30%", padding: "6px 4px", borderRadius: 8, border: `1px solid ${isCur ? GC.purp : "rgba(255,255,255,0.08)"}`, background: isCur ? `${GC.purp}22` : "transparent", cursor: "pointer", textAlign: "center" }}>
                          <div style={{ color: isCur ? GC.purp : "#d4d4d8", fontSize: 10, fontWeight: 700 }}>{rl}</div>
                          <div style={{ color: fit >= 75 ? GC.green : fit >= 60 ? GC.gold : GC.gray, fontSize: 8 }}>適配 {fit}</div>
                        </button>
                      );
                    })}
                  </div>
                </>}

                {/* Milestone O2：出賽狀態（等級進度／體力／連續出賽／傷停／可否出賽） */}
                {(() => {
                  const cond = conditionSummary(sel);
                  const lp = levelProgressOf(sel);
                  return (
                    <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "9px 10px", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7, flexWrap: "wrap" }}>
                        <span style={{ color: "white", fontSize: 11.5, fontWeight: 800 }}>出賽狀態</span>
                        <span style={{
                          fontSize: 9, fontWeight: 800, borderRadius: 5, padding: "1px 6px",
                          background: cond.canPlay ? "rgba(52,211,153,0.14)" : "rgba(248,113,113,0.14)",
                          color: cond.canPlay ? GC.green : GC.red,
                        }}>{cond.canPlay ? "可出賽" : "不可出賽"}</span>
                        <span style={{ color: GC.gray, fontSize: 9 }}>{cond.condition}</span>
                      </div>
                      {!cond.canPlay && cond.reason && (
                        <div style={{ color: GC.red, fontSize: 9.5, marginBottom: 7 }}>⚠ {cond.reason}</div>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                        {[
                          { k: "等級", v: `Lv.${sel.lv ?? 1}`, sub: `${lp.into} / ${lp.need} EXP`, pct: lp.pct, c: GC.gold },
                          { k: "體力", v: `${cond.energy}`, sub: cond.condition, pct: cond.energy, c: cond.energy >= 70 ? GC.green : cond.energy >= 40 ? GC.gold : GC.red },
                        ].map((x) => (
                          <div key={x.k} style={{ background: GC.card2, borderRadius: 8, padding: "6px 8px", minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                              <span style={{ color: GC.gray, fontSize: 8.5 }}>{x.k}</span>
                              <span style={{ color: x.c, fontSize: 12, fontWeight: 800 }}>{x.v}</span>
                            </div>
                            <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden", margin: "4px 0 3px" }}>
                              <div style={{ height: "100%", width: `${x.pct}%`, background: x.c }} />
                            </div>
                            <div style={{ color: GC.gray, fontSize: 7.5 }}>{x.sub}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 10, marginTop: 7, flexWrap: "wrap" }}>
                        <span style={{ color: GC.gray, fontSize: 9 }}>連續出賽 <b style={{ color: cond.matchStreak >= 3 ? GC.gold : "white" }}>{cond.matchStreak}</b> 場</span>
                        <span style={{ color: GC.gray, fontSize: 9 }}>傷停 <b style={{ color: cond.injured ? GC.red : "white" }}>{cond.injuryDays}</b> 天</span>
                        <span style={{ color: GC.gray, fontSize: 9 }}>近期出賽 <b style={{ color: "white" }}>{cond.recentMatches}</b> 場</span>
                      </div>
                      <div style={{ color: GC.gray, fontSize: 8, marginTop: 6, lineHeight: 1.6 }}>
                        連續出賽會加重體力消耗與受傷風險；安排休息或訓練日可恢復。
                      </div>

                      {/* Milestone P1：最近三筆成長（完整 10+ 筆在選手詳情頁） */}
                      {(() => {
                        const glog = growthLogOf(sel).slice(0, 3);
                        return (
                          <div style={{ marginTop: 9, borderTop: `1px solid ${GC.line}`, paddingTop: 7 }}>
                            <div style={{ color: "white", fontSize: 10.5, fontWeight: 800, marginBottom: 2 }}>近期成長</div>
                            {glog.length === 0 ? (
                              <div style={{ color: GC.gray, fontSize: 9 }}>尚無成長紀錄 · 出賽或完成訓練後會記錄在這裡</div>
                            ) : glog.map((e, i) => (
                              <GrowthEntryRow key={e.id} entry={e} last={i === glog.length - 1} />
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}

                {/* Milestone O1：名單分層（一隊／替補／未登錄）。
                    未登錄不可出賽——設為未登錄時，若他正坐在席位上會一併被移除，
                    避免「不能上場卻還在陣容裡」的矛盾狀態。 */}
                <div style={{ color: GC.gray, fontSize: 9, marginBottom: 5 }}>名單分層</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {Object.values(ROSTER_TIERS).map((t) => {
                    const isCur = tierOf(sel) === t.id;
                    const c = t.id === "active" ? GC.green : t.id === "bench" ? GC.blue : GC.gray;
                    return (
                      <button key={t.id} onClick={() => setRosterTier(sel.id, t.id)}
                        style={{ flex: 1, padding: "7px 4px", borderRadius: 8, border: `1px solid ${isCur ? c : "rgba(255,255,255,0.08)"}`, background: isCur ? `${c}22` : "transparent", cursor: "pointer", color: isCur ? c : "#d4d4d8", fontSize: 10, fontWeight: 700 }}>
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ color: GC.gray, fontSize: 8.5, marginTop: 5, lineHeight: 1.6 }}>
                  一隊與替補都可被指派到出賽席位；未登錄不可出賽。
                </div>
              </div>

            </div>
          </div>
        );
      })()}
      <style>{`@media(max-width:400px){[data-roster-screen] [data-roster-card]{align-items:flex-start;flex-wrap:wrap;gap:8px;padding:10px!important}[data-roster-screen] [data-roster-card-summary]{flex:1 1 calc(100% - 64px)}[data-roster-screen] [data-roster-card-meta]{width:100%;display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;text-align:left!important;padding-top:7px;border-top:1px solid rgba(255,255,255,.06)}[data-roster-screen] [data-roster-card-meta]>div:first-child{text-align:left!important}[data-roster-screen] [data-roster-card-meta]>span{justify-self:start}[data-roster-modal]{align-items:flex-start;padding:10px}[data-roster-modal-body]{max-height:calc(100vh - 20px);padding:14px!important}}@media(prefers-reduced-motion:reduce){[data-roster-screen] *{scroll-behavior:auto!important;transition:none!important}}`}</style>
      </div>
    </ManageFrame>
  );
}
