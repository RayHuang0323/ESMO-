// ============================================================================
//  screens/fps/CsMapSelectScreen.jsx — CS-C5V Map Selection / Veto
//
//  UI 只呈現／操作 MatchSession.mapSelection；不自行決定 turn、AI 或最終地圖。
//  Legacy 無 mapSelection 的舊場次仍保留原本單圖直選，確保存檔向下相容。
// ============================================================================
import React, { useMemo, useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { CS_MAPS, mapFit } from "../../battle/fps/csPrepData.js";
import { statZh } from "../../data/playerModel.js";
import { GC, FONT } from "../../ui/theme.js";

const ACC = "#fb923c";
const RISK_C = { 低: GC.green, 中: GC.gold, 高: GC.red };
const KIND_LABEL = { practice: "快速練習", matchmaking: "一般對戰地圖交集", bo1: "BO1 Map Veto", bo3: "BO3 Map Veto" };
const PHASE_LABEL = { ban: "Ban", pick: "Pick", decider: "Decider", complete: "已決定" };

function MapChip({ mapKey }) {
  const map = CS_MAPS.find((item) => item.key === mapKey);
  return <span style={{ padding: "2px 7px", borderRadius: 6, background: "rgba(255,255,255,0.06)", color: "#d1d5db", fontSize: 8.5, fontWeight: 800 }}>{map?.name ?? mapKey}</span>;
}
export default function CsMapSelectScreen({ onNext, onBack }) {
  const players = useProfileStore((s) => s.players) ?? [];
  const session = useProfileStore((s) => s.matchmaking?.session ?? null);
  const selection = session?.mapSelection ?? null;
  const series = session?.series ?? null;
  const applyVeto = useProfileStore((s) => s.applyCsMapVeto);
  const selectPracticeMap = useProfileStore((s) => s.selectCsPracticeSessionMap);
  const starters = players.filter((p) => p.status === "主力").slice(0, 5);
  const [legacySelection, setLegacySelection] = useState(null);
  const [error, setError] = useState(null);

  const playedMaps = useMemo(
    () => new Set((series?.maps ?? []).map((map) => map.mapKey).filter(Boolean)),
    [series],
  );
  const currentMapKey = series?.nextMapKey
    ?? selection?.finalMapKey
    ?? selection?.mapOrder?.[0]
    ?? legacySelection;
  const currentMap = CS_MAPS.find((map) => map.key === currentMapKey) ?? null;
  const official = selection?.kind === "bo1" || selection?.kind === "bo3";
  const pending = selection?.status === "pending";
  const playerTurn = pending && selection?.turn === "us";
  const canContinue = !!currentMap && (!selection || selection.status === "resolved");

  const actOnMap = (mapKey) => {
    setError(null);
    if (!selection) {
      if (!playedMaps.has(mapKey)) setLegacySelection((value) => (value === mapKey ? null : mapKey));
      return;
    }
    if (selection.kind === "practice") {
      const result = selectPracticeMap(mapKey);
      if (!result.ok) setError(result.errors?.[0]?.message ?? "無法選擇地圖");
      return;
    }
    if (official && playerTurn && selection.remaining?.includes(mapKey)) {
      const result = applyVeto(mapKey);
      if (!result.ok) setError(result.errors?.[0]?.message ?? "無法執行 Veto");
    }
  };

  const finish = () => {
    if (!currentMap || !canContinue) return;
    onNext({ ...currentMap, selectionId: selection?.selectionId ?? null });
  };

  return (
    <div style={{ height: "100%", overflow: "auto", background: GC.bg, fontFamily: FONT, padding: "12px 12px 30px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${GC.line}`, borderRadius: 8, padding: "5px 10px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>←</button>
          <h2 style={{ color: "white", fontSize: 17, fontWeight: 900, margin: 0 }}>{official ? "地圖 Veto" : "選擇地圖"}</h2>
          {selection && <span data-testid="cs-map-selection-kind" style={{ marginLeft: "auto", color: ACC, fontSize: 9, fontWeight: 900 }}>{KIND_LABEL[selection.kind] ?? selection.kind}</span>}
        </div>
        <div style={{ color: GC.gray, fontSize: 10, marginBottom: 12 }}>
          {selection?.kind === "matchmaking"
            ? "地圖已由雙方可接受地圖的交集中決定"
            : selection?.kind === "practice"
              ? "確認快速練習地圖後部署戰術"
              : official
                ? "雙方依序 Ban／Pick；每一步都保存於本場 MatchSession"
                : "選擇對戰地圖後部署戰術"}
        </div>

        {series && (
          <div data-testid="cs-series-banner" style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 10, background: `${ACC}14`, border: `1px solid ${ACC}44`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ color: ACC, fontSize: 11, fontWeight: 900 }}>{String(series.format).toUpperCase()}</span>
            <span style={{ color: "#fff", fontSize: 14, fontWeight: 900 }}>{series.wins.us} : {series.wins.opponent}</span>
            <span style={{ marginLeft: "auto", color: GC.gray, fontSize: 10 }}>第 {(series.maps?.length ?? 0) + 1} / {series.maxMaps} 張 · 先拿 {series.mapsToWin} 張者勝</span>
          </div>
        )}

        {selection?.kind === "matchmaking" && (
          <div data-testid="cs-matchmaking-map-intersection" style={{ marginBottom: 10, padding: 10, borderRadius: 10, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(96,165,250,0.3)" }}>
            <div style={{ color: "#bfdbfe", fontSize: 9.5, fontWeight: 900, marginBottom: 6 }}>雙方地圖池交集</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{(selection.commonPool ?? []).map((key) => <MapChip key={key} mapKey={key} />)}</div>
          </div>
        )}

        {official && (
          <div data-testid="cs-veto-progress" style={{ marginBottom: 10, padding: 10, borderRadius: 11, background: "rgba(255,255,255,0.035)", border: `1px solid ${GC.line}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 7 }}>
              {(selection.rules?.flow ?? (selection.kind === "bo3" ? ["ban", "pick", "pick", "decider"] : ["ban", "ban", "decider"])).map((phase, index) => (
                <React.Fragment key={`${phase}-${index}`}>
                  {index > 0 && <span style={{ color: "#4b5563", fontSize: 9 }}>→</span>}
                  <span style={{ color: selection.phase === phase ? ACC : "#9ca3af", fontSize: 9, fontWeight: selection.phase === phase ? 900 : 700 }}>{PHASE_LABEL[phase]}</span>
                </React.Fragment>
              ))}
            </div>
            {selection.notes?.map((note) => <div key={note} style={{ color: GC.gold, fontSize: 8.5, lineHeight: 1.5 }}>⚠ {note}</div>)}
            <div style={{ marginTop: 7, color: "#e5e7eb", fontSize: 10, fontWeight: 800 }}>
              {selection.status === "resolved"
                ? `Veto 完成 · ${selection.kind === "bo3" ? "地圖順序已鎖定" : "比賽地圖已決定"}`
                : selection.turn === "us"
                  ? `輪到我方 ${PHASE_LABEL[selection.phase]}`
                  : `對手正在 ${PHASE_LABEL[selection.phase]}…`}
            </div>
            {!!selection.log?.length && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 }}>
                {selection.log.map((entry) => (
                  <span key={`${entry.index}-${entry.mapKey}`} style={{ color: entry.phase === "ban" ? "#fca5a5" : entry.phase === "pick" ? "#86efac" : "#fde68a", fontSize: 8.5, fontWeight: 800 }}>
                    {entry.side === "us" ? "我方" : entry.side === "opponent" ? "對手" : "系統"} {PHASE_LABEL[entry.phase]} {CS_MAPS.find((map) => map.key === entry.mapKey)?.name ?? entry.mapKey}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <div role="alert" style={{ marginBottom: 9, color: "#fecaca", background: "rgba(127,29,29,0.5)", border: "1px solid rgba(248,113,113,0.4)", borderRadius: 8, padding: "7px 9px", fontSize: 9 }}>{error}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {CS_MAPS.map((map) => {
            const played = playedMaps.has(map.key);
            const banned = !!selection?.banned?.some((entry) => entry.mapKey === map.key);
            const picked = !!selection?.picks?.some((entry) => entry.mapKey === map.key);
            const available = !selection || selection.remaining?.includes(map.key);
            const selected = currentMapKey === map.key && selection?.status === "resolved";
            const legacySelected = !selection && legacySelection === map.key;
            const actionable = !played && (!selection || selection.kind === "practice" || (official && playerTurn && available));
            const fit = mapFit(starters, map);
            const fitC = fit.grade === "高" ? GC.green : fit.grade === "中" ? GC.gold : fit.grade === "低" ? GC.red : GC.gray;
            const stateLabel = played ? "已打" : banned ? "已 Ban" : picked ? "已 Pick" : selected ? "比賽地圖" : actionable && official ? `可 ${PHASE_LABEL[selection.phase]}` : "";
            return (
              <button key={map.key} data-map-key={map.key} data-veto-state={banned ? "banned" : picked ? "picked" : selected ? "selected" : available ? "available" : "locked"}
                disabled={!actionable} onClick={() => actOnMap(map.key)}
                style={{ background: selected || legacySelected ? `${ACC}18` : GC.card, border: `1.5px solid ${selected || legacySelected ? ACC : banned ? "rgba(248,113,113,0.45)" : picked ? "rgba(74,222,128,0.45)" : GC.line}`, borderRadius: 13, padding: "12px 14px", cursor: actionable ? "pointer" : "default", textAlign: "left", width: "100%", opacity: played || banned ? 0.48 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ color: "white", fontSize: 15, fontWeight: 900 }}>{map.name}</span>
                  <span style={{ background: `${ACC}22`, color: ACC, fontSize: 8, fontWeight: 700, borderRadius: 4, padding: "1px 6px" }}>{map.type}</span>
                  <span style={{ color: GC.gray, fontSize: 8 }}>難度 {map.diff}</span>
                  {stateLabel && <span style={{ marginLeft: "auto", color: banned ? "#fca5a5" : picked ? "#86efac" : selected ? ACC : GC.gray, fontSize: 10, fontWeight: 900 }}>{stateLabel}</span>}
                </div>
                <div style={{ color: "#c8cdd6", fontSize: 9, marginBottom: 6 }}>{map.style}</div>
                <div style={{ color: GC.gray, fontSize: 9, lineHeight: 1.5, marginBottom: 8 }}>{map.desc}</div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 9, color: fitC, fontWeight: 700 }}>我方適性 {fit.grade}{fit.score != null ? `（${fit.score}）` : ""}</span>
                  <span style={{ color: GC.gray, fontSize: 8 }}>吃重：{map.favors.map(statZh).join("、")}</span>
                  <span style={{ marginLeft: "auto", fontSize: 9, color: RISK_C[map.oppRisk] || GC.gray, fontWeight: 700 }}>對手風險 {map.oppRisk}</span>
                </div>
              </button>
            );
          })}
        </div>

        {selection?.kind === "bo3" && selection.status === "resolved" && (
          <div data-testid="cs-bo3-map-order" style={{ marginBottom: 12, padding: 10, borderRadius: 10, border: "1px solid rgba(52,211,153,0.28)", background: "rgba(6,78,59,0.18)" }}>
            <div style={{ color: "#a7f3d0", fontSize: 9, fontWeight: 900, marginBottom: 6 }}>BO3 地圖順序</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>{selection.mapOrder.map((key, index) => <React.Fragment key={key}><span style={{ color: GC.gray, fontSize: 8 }}>M{index + 1}</span><MapChip mapKey={key} /></React.Fragment>)}</div>
          </div>
        )}

        <button data-testid="cs-map-confirm" onClick={finish} disabled={!canContinue} style={{ width: "100%", background: canContinue ? `linear-gradient(135deg,${ACC},${ACC}aa)` : "rgba(255,255,255,0.06)", border: "none", borderRadius: 14, padding: "15px", cursor: canContinue ? "pointer" : "not-allowed", color: canContinue ? "#fff" : GC.gray, fontSize: 15, fontWeight: 900 }}>
          {canContinue ? `確認地圖「${currentMap.name}」· 部署戰術` : playerTurn ? `請選擇要 ${PHASE_LABEL[selection.phase]} 的地圖` : "等待 Veto 完成"}
        </button>
      </div>
    </div>
  );
}
