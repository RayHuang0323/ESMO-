// ============================================================================
//  screens/fps/CsTacticScreen.jsx — CS 戰術部署（Sprint23）
//
//  Legacy 規格：EsportsGame.jsx TacticSelect({mode:"fps"})（line 7427-7484）
//    「① 團隊戰術」8 張卡（TACTICS_LIB.fps f1–f8 逐字：emoji/風險/desc/核心/detail）。
//  引擎吃法 = Legacy fpsRouter 逐字（EsportsGame.jsx:7629）：
//    確認時輸出 {id, name, type: FPS_TACTIC_TYPE[id]}，引擎在選定地圖的
//    TACTICS_DB 內挑同 type 戰術執行（引擎原生行為，非 Balance 變更）。
//  C5B：賽前部署輸出四階段 tacticalLayout；每一層會進入 authoritative route planner。
//    · opening / mid-round / late-round / post-plant 都可獨立選擇。
//    · openness 只控制 deterministic weighted route variation，不使用 Math.random。
//  對選手能力的提示：boost 欄位（Legacy 逐字）→ statZh 顯示。
// ============================================================================
import React, { useMemo, useState } from "react";
import { CS_TEAM_TACTICS, CS_MAPS, csMapByKey, mapFit, FPS_TACTIC_TYPE, TACTIC_TYPE_ZH } from "../../battle/fps/csPrepData.js";
import { statZh } from "../../data/playerModel.js";
import { useProfileStore } from "../../platform/profileStore.js";
import { CS_SEATS } from "../../platform/contracts/matchSquad.js";
import { teamDevelopmentEffects } from "../../platform/development/teamDevelopment.js";
import { GC, FONT } from "../../ui/theme.js";
//  Expansion v1 N4/N5：只讀既有計數與已解鎖資訊（見 ui/DevelopmentInsights.jsx 檔頭）。
//  ⚠ 本檔屬 CS 產品線但**不是** Codex 的 CS battle runtime 禁區；
//    這裡只加賽前資訊面板，不碰 camera／POV／C4／audio／locomotion／route runtime。
import { TacticInsightPanel, MatchOverviewPanel } from "../../ui/DevelopmentInsights.jsx";

const ACC = "#fb923c";
const RISK_C = { "低": GC.green, "中": GC.gold, "高": GC.red };

export default function CsTacticScreen({ mapName, onNext, onBack }) {
  const phaseDefs = [
    { key: "opening", label: "開局", sub: "Opening" },
    { key: "mid-round", label: "中局", sub: "Mid-round" },
    { key: "late-round", label: "後段", sub: "Late-round" },
    { key: "post-plant", label: "安包後", sub: "Post-plant" },
  ];
  const [activePhase, setActivePhase] = useState("opening");
  const [selectedByPhase, setSelectedByPhase] = useState(() => Object.fromEntries(phaseDefs.map((phase) => [phase.key, "f1"])));
  const [openness, setOpenness] = useState("open");
  const [postPlantMode, setPostPlantMode] = useState("crossfire");
  const development = useProfileStore((s) => s.teamDevelopment);
  const developmentEffects = teamDevelopmentEffects(development);
  const players = useProfileStore((s) => s.players) ?? [];
  //  ── Expansion v1 N4：地圖戰術表現 ────────────────────────────────────
  //  ⚠ 讀 Club Mastery 已在累積的計數，不新增事件流、不解鎖任何戰術。
  const clubMastery = useProfileStore((s) => s.clubMastery);
  const csTacticRows = useMemo(() => CS_TEAM_TACTICS.map((t) => ({
    id: t.id,
    name: t.name,
    games: clubMastery?.tacticUsage?.cs?.[t.id] ?? 0,
    intent: clubMastery?.tacticIntent?.cs?.[t.id] ?? 0,
  })), [clubMastery]);
  const csLineup = useProfileStore((s) => s.csLineup);
  const starters = useMemo(() => {
    const byId = new Map(players.map((player) => [player.id, player]));
    return CS_SEATS.map((seat) => byId.get(csLineup?.[seat])).filter(Boolean);
  }, [csLineup, players]);
  const map = useMemo(() => CS_MAPS.find((item) => item.name === mapName) ?? csMapByKey(mapName), [mapName]);
  const mapFitResult = useMemo(() => mapFit(starters, map), [map, starters]);
  const selectedId = selectedByPhase[activePhase];
  const selT = CS_TEAM_TACTICS.find((t) => t.id === selectedId) || CS_TEAM_TACTICS[0];
  const selectTactic = (id) => setSelectedByPhase((current) => ({ ...current, [activePhase]: id }));
  const layoutSummary = phaseDefs.map((phase) => ({
    ...phase,
    tactic: CS_TEAM_TACTICS.find((t) => t.id === selectedByPhase[phase.key]) || CS_TEAM_TACTICS[0],
  }));
  const submit = () => {
    const opening = layoutSummary.find((phase) => phase.key === "opening")?.tactic || CS_TEAM_TACTICS[0];
    onNext({
      id: opening.id, name: opening.name, emoji: opening.emoji, risk: opening.risk,
      type: FPS_TACTIC_TYPE[opening.id] || "default",
      tacticalLayout: {
        version: 1,
        openness,
        postPlantMode,
        phases: Object.fromEntries(layoutSummary.map((phase) => [phase.key, {
          id: phase.tactic.id, name: phase.tactic.name, emoji: phase.tactic.emoji,
          risk: phase.tactic.risk, type: FPS_TACTIC_TYPE[phase.tactic.id] || "default",
        }])),
      },
    });
  };

  return (
    <div style={{ height: "100%", overflow: "auto", background: GC.bg, fontFamily: FONT, padding: "12px 12px 30px" }}>
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${GC.line}`, borderRadius: 8, padding: "5px 10px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>←</button>
          <h2 style={{ color: "white", fontSize: 17, fontWeight: 900, margin: 0 }}>戰術部署</h2>
          {mapName && <span style={{ marginLeft: "auto", background: `${ACC}22`, color: ACC, fontSize: 9, fontWeight: 700, borderRadius: 5, padding: "2px 8px" }}>🗺 {mapName}</span>}
        </div>
        <div style={{ color: GC.gray, fontSize: 10, marginBottom: 14 }}>四層布局都會進入比賽邏輯：路線、控圖、轉點與安包後站位；開放度只改變可追溯的加權分支。</div>

        {developmentEffects.unlocks.csTacticInsight && (
          <TacticInsightPanel rows={csTacticRows} color={ACC} testId="cs-tactic-insight"
            scopeLabel={map?.name ?? null} />
        )}

        {developmentEffects.unlocks.csMatchOverview && (
          <MatchOverviewPanel testId="cs-match-overview" color={ACC}
            note="把已解鎖的資訊整理成一頁；本身不產生新資料。"
            rows={[
              { label: "地圖", value: map ? `${map.name} · ${map.type}` : "尚未選定" },
              { label: "地圖風格", value: map?.style ?? "—" },
              { label: "先發適配", value: mapFitResult.score != null ? `${mapFitResult.score}（${mapFitResult.grade}）` : "尚未評估",
                tone: mapFitResult.score != null && mapFitResult.score >= 60 ? "good" : "warn" },
              { label: "先發人數", value: `${starters.length} / ${CS_SEATS.length}`,
                tone: starters.length === CS_SEATS.length ? "good" : "warn" },
              { label: "目前戰術", value: selT?.name ?? "—" },
            ]} />
        )}

        {developmentEffects.unlocks.csDemoAnalysis && (
          <div data-testid="cs-demo-analysis" style={{ color: "#fed7aa", background: ACC + "12", border: "1px solid " + ACC + "55", borderRadius: 9, padding: "9px 10px", fontSize: 9, lineHeight: 1.55, marginBottom: 10 }}>
            <div style={{ color: ACC, fontSize: 10, fontWeight: 900 }}>地圖與對手情報</div>
            {map ? (
              <>
                <div style={{ marginTop: 3 }}>{map.name} · {map.type} · 難度 {map.diff}</div>
                <div style={{ color: GC.gray }}>地圖風格：{map.style}</div>
                <div style={{ color: GC.gray }}>對手筆記：{map.oppNote}</div>
                <div style={{ color: GC.gray }}>地圖提示：{map.desc}</div>
                {mapFitResult.score != null && <div style={{ color: "#fff", marginTop: 3 }}>目前先發適配：{mapFitResult.score}（{mapFitResult.grade}）</div>}
              </>
            ) : (
              <div style={{ color: GC.gray, marginTop: 3 }}>選定地圖後，這裡會顯示既有地圖資料與先發適配。</div>
            )}
          </div>
        )}

        <div style={{ color: ACC, fontSize: 12, fontWeight: 800, marginBottom: 8 }}>① 選擇布局層</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 4, marginBottom: 10 }}>
          {phaseDefs.map((phase) => {
            const active = activePhase === phase.key;
            const chosen = CS_TEAM_TACTICS.find((t) => t.id === selectedByPhase[phase.key]) || CS_TEAM_TACTICS[0];
            return (
              <button key={phase.key} data-testid={`cs-tactic-phase-${phase.key}`} onClick={() => setActivePhase(phase.key)} style={{ minWidth: 0, padding: "7px 3px", borderRadius: 8, border: `1px solid ${active ? ACC : GC.line}`, background: active ? `${ACC}22` : GC.card, color: active ? "#fff" : GC.gray, cursor: "pointer" }}>
                <div style={{ fontSize: 10, fontWeight: 900 }}>{phase.label}</div>
                <div style={{ fontSize: 7, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{chosen.emoji} {chosen.name}</div>
              </button>
            );
          })}
        </div>
        <div style={{ color: GC.gray, fontSize: 9, marginBottom: 8 }}>目前配置：{phaseDefs.find((phase) => phase.key === activePhase)?.label}（{phaseDefs.find((phase) => phase.key === activePhase)?.sub}）</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {CS_TEAM_TACTICS.map((t) => {
            const isSel = selectedId === t.id;
            return (
              <button key={t.id} onClick={() => selectTactic(t.id)} style={{ background: isSel ? `${ACC}22` : GC.card, border: `1.5px solid ${isSel ? ACC : GC.line}`, borderRadius: 11, padding: "10px", cursor: "pointer", textAlign: "left" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                  <span style={{ fontSize: 15 }}>{t.emoji}</span>
                  <span style={{ color: "white", fontSize: 12, fontWeight: 800 }}>{t.name}</span>
                  <span style={{ marginLeft: "auto", background: `${RISK_C[t.risk]}22`, color: RISK_C[t.risk], fontSize: 7, fontWeight: 700, borderRadius: 4, padding: "1px 4px" }}>{t.risk}</span>
                </div>
                <div style={{ color: ACC, fontSize: 8, marginBottom: 2 }}>核心：{t.focus}</div>
                <div style={{ color: GC.gray, fontSize: 8, lineHeight: 1.4 }}>{t.desc}</div>
                <div style={{ color: "#c8cdd6", fontSize: 7, marginTop: 4 }}>能力吃重：{t.boost.map(statZh).join("、")}</div>
              </button>
            );
          })}
        </div>

        {selT && (
          <div style={{ background: GC.card, border: `1px solid ${ACC}44`, borderRadius: 11, padding: "10px 12px", marginBottom: 14 }}>
            <div style={{ color: ACC, fontSize: 10, fontWeight: 800, marginBottom: 3 }}>{selT.emoji} {selT.name} · {phaseDefs.find((phase) => phase.key === activePhase)?.label} · 引擎執行類型「{TACTIC_TYPE_ZH[FPS_TACTIC_TYPE[selT.id]] ?? "標準"}」</div>
            <div style={{ color: GC.gray, fontSize: 9, lineHeight: 1.5 }}>{selT.detail}</div>
          </div>
        )}

        <div style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${GC.line}`, borderRadius: 11, padding: "10px 12px", marginBottom: 14 }}>
          <div style={{ color: ACC, fontSize: 10, fontWeight: 800, marginBottom: 7 }}>② 開放式路線規則</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 5 }}>
            {[{ key: "structured", label: "固定", desc: "主路線優先" }, { key: "adaptive", label: "自適應", desc: "依局勢加權" }, { key: "open", label: "開放", desc: "多路線轉點" }].map((option) => (
              <button key={option.key} onClick={() => setOpenness(option.key)} style={{ minWidth: 0, padding: "7px 4px", borderRadius: 8, border: `1px solid ${openness === option.key ? ACC : GC.line}`, background: openness === option.key ? `${ACC}22` : GC.card, color: openness === option.key ? "#fff" : GC.gray, cursor: "pointer" }}>
                <div style={{ fontSize: 10, fontWeight: 900 }}>{option.label}</div><div style={{ fontSize: 7, marginTop: 2 }}>{option.desc}</div>
              </button>
            ))}
          </div>
          <div style={{ color: GC.gray, fontSize: 8, lineHeight: 1.5, marginTop: 7 }}>依比分、經濟、存活、Bomb、武器、控圖與攻守方，以 seed + hash 決定權重；同一設定可重現，並非無約束亂數。</div>
        </div>

        <div style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${GC.line}`, borderRadius: 11, padding: "10px 12px", marginBottom: 14 }}>
          <div style={{ color: ACC, fontSize: 10, fontWeight: 800, marginBottom: 7 }}>③ 安包後布局</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 5 }}>
            {[{ key: "hold-angle", label: "守角" }, { key: "crossfire", label: "交叉火力" }, { key: "deny-defuse", label: "封拆彈" }].map((option) => (
              <button key={option.key} onClick={() => setPostPlantMode(option.key)} style={{ minWidth: 0, padding: "7px 4px", borderRadius: 8, border: `1px solid ${postPlantMode === option.key ? ACC : GC.line}`, background: postPlantMode === option.key ? `${ACC}22` : GC.card, color: postPlantMode === option.key ? "#fff" : GC.gray, cursor: "pointer", fontSize: 9, fontWeight: 800 }}>{option.label}</button>
            ))}
          </div>
        </div>

        <div style={{ background: `${ACC}0d`, border: `1px solid ${ACC}33`, borderRadius: 11, padding: "9px 12px", marginBottom: 14 }}>
          <div style={{ color: ACC, fontSize: 10, fontWeight: 800, marginBottom: 5 }}>目前四層配置</div>
          <div style={{ display: "grid", gap: 3 }}>
            {layoutSummary.map((phase) => <div key={phase.key} style={{ display: "flex", gap: 6, color: GC.gray, fontSize: 8 }}><span style={{ width: 48, color: "#fff", fontWeight: 800 }}>{phase.label}</span><span>{phase.tactic.emoji} {phase.tactic.name} · {TACTIC_TYPE_ZH[FPS_TACTIC_TYPE[phase.tactic.id]] ?? "標準"}</span></div>)}
          </div>
        </div>

        <button
          data-testid="cs-tactic-confirm"
          onClick={submit}
          style={{ width: "100%", background: `linear-gradient(135deg,${ACC},${ACC}aa)`, border: "none", borderRadius: 14, padding: "16px", cursor: "pointer", color: "#fff", fontSize: 16, fontWeight: 900 }}
        >🎯 確認四層戰術 · 開始對戰</button>
        <div style={{ textAlign: "center", color: GC.gray, fontSize: 9, marginTop: 8 }}>已配置開局／中局／後段／安包後；{openness === "open" ? "開放式" : openness === "adaptive" ? "自適應" : "固定式"}路線</div>
      </div>
    </div>
  );
}
