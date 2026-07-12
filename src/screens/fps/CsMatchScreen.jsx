// ============================================================================
//  screens/fps/CsMatchScreen.jsx — CS 對戰畫面（Sprint22 建 → Sprint23 接完整流程）
//
//  Presentation：EsportsFPS3D（Legacy 3D CS 引擎）原封使用（embedded），
//    不重畫 FPS UI；HUD / 記分板 / 擊殺列 / 無線電 / 轉播運鏡全部是引擎內建。
//  Sprint23 接線（只加 props，引擎零修改）：
//    · config = 賽前流程輸出 {mapKey,mapName,tacticId,tacticName,tacticType,seed}
//      → 引擎 tactic/tacticType props（Legacy fpsRouter 同款吃法，EsportsGame.jsx:7629）。
//    · 戰術顯示於 Match Header（Sprint23 D 節要求）。
//    · 終局：引擎 onComplete 的 MatchResult → toCsMatchResult（CS 專屬契約，
//      非 MOBA BattleResult）→ onFinish 交給 AppShell 導向 CsResultScreen 入史。
//  相容：無 config（不經賽前流程）時退回 Sprint22 行為（seed 掛載隨機、地圖自選），
//    此時結果仍走契約與入史（訓練賽）。
// ============================================================================
import React, { useMemo, useState } from "react";
import EsportsFPS3D from "../../battle/fps/EsportsFPS3D.jsx";
import { useProfileStore } from "../../platform/profileStore.js";
import { toFpsRoster, CS_MAP_KEYS } from "../../battle/fps/fpsRoster.js";
import { csMapByKey } from "../../battle/fps/csPrepData.js";
import { toCsMatchResult } from "../../platform/contracts/CsMatchResult.js";
import { GC, FONT } from "../../ui/theme.js";

export default function CsMatchScreen({ config, onFinish, onBack }) {
  const players = useProfileStore((s) => s.players) ?? [];
  const team = useProfileStore((s) => s.team);
  // seed / 地圖：賽前流程有給就用（決定性重播鍵）；否則沿 Sprint22 掛載時決定一次
  const [seed] = useState(() => config?.seed ?? ((Date.now() & 0xffff) | 1));
  const mapKey = config?.mapKey ?? CS_MAP_KEYS[seed % CS_MAP_KEYS.length];
  const mapName = config?.mapName ?? csMapByKey(mapKey)?.name ?? mapKey;
  const roster = useMemo(() => toFpsRoster(players), [players]);
  const [result, setResult] = useState(null); // 引擎原生 MatchResult

  const csResult = useMemo(() => (result ? toCsMatchResult(result, {
    seed, mapKey, mapName,
    tacticId: config?.tacticId ?? null, tacticName: config?.tacticName ?? null, tacticType: config?.tacticType ?? null,
    roster,
  }) : null), [result, seed, mapKey, mapName, config, roster]);

  return (
    <div style={{ position: "relative", height: "100%", overflow: "auto", background: "#070a10", fontFamily: FONT }}>
      {/* Match Header：返回 + 對戰卡 + 地圖/戰術（不遮引擎自己的比分列） */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", flexWrap: "wrap" }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${GC.line}`, borderRadius: 8, padding: "5px 12px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>← 離開</button>
        <span style={{ color: "#e8ebf0", fontSize: 13, fontWeight: 800 }}>{team?.name ?? "德國海豹"} <span style={{ color: "#8a8f9c", fontWeight: 600 }}>vs</span> Compulsary</span>
        <span style={{ background: "rgba(251,146,60,0.14)", border: "1px solid rgba(251,146,60,0.4)", color: "#fdba74", fontSize: 9, fontWeight: 700, borderRadius: 5, padding: "1px 7px" }}>🗺 {mapName}</span>
        {config?.tacticName && <span style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${GC.line}`, color: "#c8cdd6", fontSize: 9, fontWeight: 700, borderRadius: 5, padding: "1px 7px" }}>戰術「{config.tacticName}」</span>}
        <span style={{ marginLeft: "auto", color: "#8a8f9c", fontSize: 10 }}>CS 訓練賽</span>
      </div>
      {!roster && (
        <div style={{ margin: "0 10px 8px", padding: "6px 10px", borderRadius: 8, background: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.4)", color: "#fed7aa", fontSize: 11 }}>
          名單不足 5 人，本場使用引擎內建示範陣容。
        </div>
      )}

      <EsportsFPS3D embedded roster={roster ?? undefined} mapKey={mapKey} seed={seed} tactic={config?.tacticId ?? undefined} tacticType={config?.tacticType ?? undefined} teamName={team?.name} onComplete={setResult} />

      {/* 終局：引擎真實 MatchResult → CS 契約 → 賽後戰報（入史在 CsResultScreen） */}
      {csResult && (
        <div style={{ position: "sticky", bottom: 0, zIndex: 50, background: "rgba(7,10,16,0.96)", backdropFilter: "blur(8px)", borderTop: `1px solid ${GC.line}`, padding: "10px 14px" }}>
          <div style={{ maxWidth: 430, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: csResult.winner === "us" ? "#34d399" : "#f87171" }}>{csResult.winner === "us" ? "勝利" : "敗北"} {csResult.ourScore}:{csResult.enemyScore}</span>
              {csResult.mvp && <span style={{ color: "#fbbf24", fontSize: 11, fontWeight: 700 }}>隊內 MVP：{csResult.mvp.playerName}（Rating {csResult.mvp.rating}）</span>}
              <span style={{ marginLeft: "auto", color: "#5a606e", fontSize: 9 }}>{mapName}{config?.tacticName ? ` · ${config.tacticName}` : ""}</span>
            </div>
            {onFinish ? (
              <button onClick={() => onFinish(csResult)} style={{ width: "100%", background: "linear-gradient(135deg,#fb923c,#f97316)", border: "1px solid #fdba74", borderRadius: 10, padding: "9px", color: "#1a1205", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>📊 查看賽後戰報 · 領取獎勵</button>
            ) : (
              <button onClick={onBack} style={{ width: "100%", background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", border: "1px solid #93c5fd", borderRadius: 10, padding: "9px", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>回到 Dashboard</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
