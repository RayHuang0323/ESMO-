// ============================================================================
//  screens/fps/CsMatchScreen.jsx — CS 對戰畫面（Sprint22：最小安全接線）
//
//  Presentation：EsportsFPS3D（Legacy 3D CS 引擎）原封使用（embedded），
//    不重畫 FPS UI；HUD / 記分板 / 轉播運鏡全部是引擎內建。
//  Architecture（Adapter）：
//    · 我方名單 = profileStore.players 經 fpsRoster.toFpsRoster（16 項能力
//      長鍵→引擎短鍵，含 personality / morale / condition / 體力）。
//    · 對手 = 不傳 opponent prop → 引擎內建 Compulsary（不複製第二份資料）。
//    · seed 掛載時決定一次（同 seed ⇒ 同賽果；沿 BattleConfig 預設規則）。
//  結果流（誠實邊界）：onComplete 的 MatchResult 只在本畫面顯示戰報。
//    CS 尚無 BattleResult 契約 → 不寫 seasonStore / Match History、
//    不套用 MOBA BattleResult（Sprint 23+ 再定契約）。
// ============================================================================
import React, { useMemo, useState } from "react";
import EsportsFPS3D from "../../battle/fps/EsportsFPS3D.jsx";
import { useProfileStore } from "../../platform/profileStore.js";
import { toFpsRoster, CS_MAP_KEYS } from "../../battle/fps/fpsRoster.js";
import { GC, FONT } from "../../ui/theme.js";

export default function CsMatchScreen({ onBack }) {
  const players = useProfileStore((s) => s.players) ?? [];
  const team = useProfileStore((s) => s.team);
  // seed / 地圖：掛載時決定一次（決定性重播鍵；重進本畫面 = 新的一場）
  const [seed] = useState(() => (Date.now() & 0xffff) | 1);
  const mapKey = useMemo(() => CS_MAP_KEYS[seed % CS_MAP_KEYS.length], [seed]);
  const roster = useMemo(() => toFpsRoster(players), [players]);
  const [result, setResult] = useState(null);

  return (
    <div style={{ position: "relative", height: "100%", overflow: "auto", background: "#070a10", fontFamily: FONT }}>
      {/* 頂列：返回 + 對戰卡（不遮引擎自己的比分列） */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${GC.line}`, borderRadius: 8, padding: "5px 12px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>← 離開</button>
        <span style={{ color: "#e8ebf0", fontSize: 13, fontWeight: 800 }}>{team?.name ?? "德國海豹"} <span style={{ color: "#8a8f9c", fontWeight: 600 }}>vs</span> Compulsary</span>
        <span style={{ marginLeft: "auto", color: "#8a8f9c", fontSize: 10 }}>CS 訓練賽 · 不計入賽季</span>
      </div>
      {!roster && (
        <div style={{ margin: "0 10px 8px", padding: "6px 10px", borderRadius: 8, background: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.4)", color: "#fed7aa", fontSize: 11 }}>
          名單不足 5 人，本場使用引擎內建示範陣容。
        </div>
      )}

      <EsportsFPS3D embedded roster={roster ?? undefined} mapKey={mapKey} seed={seed} teamName={team?.name} onComplete={setResult} />

      {/* 終局戰報（引擎 MatchResult 真實數據；僅展示，不入史） */}
      {result && (
        <div style={{ position: "sticky", bottom: 0, zIndex: 50, background: "rgba(7,10,16,0.96)", backdropFilter: "blur(8px)", borderTop: `1px solid ${GC.line}`, padding: "10px 14px" }}>
          <div style={{ maxWidth: 430, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: result.win ? "#34d399" : "#f87171" }}>{result.win ? "勝利" : "敗北"} {result.scoreT}:{result.scoreCT}</span>
              {result.ourMvp && <span style={{ color: "#fbbf24", fontSize: 11, fontWeight: 700 }}>隊內 MVP：{result.ourMvp.name}（Rating {result.ourMvp.rating}）</span>}
              <span style={{ marginLeft: "auto", color: "#5a606e", fontSize: 9 }}>本場為訓練賽，未寫入賽季紀錄</span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {(result.ourPlayers ?? []).map((p) => (
                <span key={p.id} style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${GC.line}`, borderRadius: 7, padding: "3px 8px", color: "#c8cdd6", fontSize: 10 }}>
                  <b style={{ color: "#fff" }}>{p.name}</b> {p.k}/{p.d}/{p.a} · {p.rating}
                </span>
              ))}
            </div>
            <button onClick={onBack} style={{ width: "100%", background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", border: "1px solid #93c5fd", borderRadius: 10, padding: "9px", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>回到 Dashboard</button>
          </div>
        </div>
      )}
    </div>
  );
}
