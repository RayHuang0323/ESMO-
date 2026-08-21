// ============================================================================
//  screens/fps/CsMapSelectScreen.jsx — CS 選圖（Sprint23）
//
//  ⚠ Legacy 沒有選圖 UI（fpsRouter 於戰術確認時隨機挑圖，EsportsGame.jsx:7629）。
//    本畫面為 Sprint23 新建：地圖鍵/名稱 = 引擎 MAPS 唯一來源，
//    卡片上的類型/風格/難度/對手風險 = csPrepData 最小 flavor（標明來源與限制），
//    我方適性 = 真實 16 項能力計算（mapFit，純展示，不進引擎）。
// ============================================================================
import React, { useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { CS_MAPS, mapFit } from "../../battle/fps/csPrepData.js";
import { statZh } from "../../data/playerModel.js";
import { GC, FONT } from "../../ui/theme.js";

const ACC = "#fb923c";
const RISK_C = { "低": GC.green, "中": GC.gold, "高": GC.red };

export default function CsMapSelectScreen({ onNext, onBack }) {
  const players = useProfileStore((s) => s.players) ?? [];
  const starters = players.filter((p) => p.status === "主力").slice(0, 5);
  const [sel, setSel] = useState(null);
  const selMap = CS_MAPS.find((m) => m.key === sel) || null;
  //  ── CS Season M4-A.1：BO3 已經打過的地圖不得再選 ──────────────────────
  //  ⚠ 資料層本來就守得住（`recordSeriesMap` 以 matchId 冪等，而且仍是 first-to-2），
  //    所以這是**呈現層**的修正：同一張圖在一個 BO3 裡打兩次不合理，
  //    而畫面先前三張全開放選。
  //  ⚠ 來源是 store 的 series 狀態，不是畫面自己記——重整之後畫面狀態就沒了。
  const series = useProfileStore((s) => s.matchmaking?.session?.series) ?? null;
  const playedMaps = React.useMemo(
    () => new Set((series?.maps ?? []).map((m) => m.mapKey).filter(Boolean)),
    [series],
  );

  return (
    <div style={{ height: "100%", overflow: "auto", background: GC.bg, fontFamily: FONT, padding: "12px 12px 30px" }}>
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${GC.line}`, borderRadius: 8, padding: "5px 10px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>←</button>
          <h2 style={{ color: "white", fontSize: 17, fontWeight: 900, margin: 0 }}>選擇地圖</h2>
        </div>
        <div style={{ color: GC.gray, fontSize: 10, marginBottom: series ? 6 : 14 }}>對手 Compulsary 已確認出賽 · 選擇對戰地圖後部署戰術</div>
        {/*  series 進行中 ⇒ 讓玩家看得到「打到幾比幾、這是第幾張」。
             ⚠ 只顯示**地圖數**，不顯示任何回合資訊（那是 Codex 的責任區）。 */}
        {series && (
          <div data-testid="cs-series-banner" style={{ marginBottom: 14, padding: "8px 12px", borderRadius: 10, background: `${ACC}14`, border: `1px solid ${ACC}44`, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: ACC, fontSize: 11, fontWeight: 900 }}>{String(series.format).toUpperCase()}</span>
            <span style={{ color: "#fff", fontSize: 14, fontWeight: 900 }}>{series.wins.us} : {series.wins.opponent}</span>
            <span style={{ marginLeft: "auto", color: GC.gray, fontSize: 10 }}>
              第 {(series.maps?.length ?? 0) + 1} / {series.maxMaps} 張 · 先拿 {series.mapsToWin} 張者勝
            </span>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {CS_MAPS.map((m) => {
            const played = playedMaps.has(m.key);
            const isSel = sel === m.key && !played;
            const fit = mapFit(starters, m);
            const fitC = fit.grade === "高" ? GC.green : fit.grade === "中" ? GC.gold : fit.grade === "低" ? GC.red : GC.gray;
            const playedResult = played
              ? (series.maps.find((x) => x.mapKey === m.key)?.winner === "us" ? "已打 · 我方勝" : "已打 · 對手勝")
              : null;
            return (
              <button key={m.key} data-map-key={m.key} data-played={played ? "1" : "0"} disabled={played}
                onClick={() => { if (!played) setSel(isSel ? null : m.key); }}
                style={{ background: isSel ? `${ACC}18` : GC.card, border: `1.5px solid ${isSel ? ACC : GC.line}`, borderRadius: 13, padding: "12px 14px", cursor: played ? "not-allowed" : "pointer", textAlign: "left", width: "100%", opacity: played ? 0.45 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ color: "white", fontSize: 15, fontWeight: 900 }}>{m.name}</span>
                  <span style={{ background: `${ACC}22`, color: ACC, fontSize: 8, fontWeight: 700, borderRadius: 4, padding: "1px 6px" }}>{m.type}</span>
                  <span style={{ color: GC.gray, fontSize: 8 }}>難度 {m.diff}</span>
                  {played && <span style={{ marginLeft: "auto", color: GC.gray, fontSize: 10, fontWeight: 800 }}>{playedResult}</span>}
                  {isSel && <span style={{ marginLeft: "auto", color: ACC, fontSize: 11, fontWeight: 900 }}>✓ 已選擇</span>}
                </div>
                <div style={{ color: "#c8cdd6", fontSize: 9, marginBottom: 6 }}>{m.style}</div>
                <div style={{ color: GC.gray, fontSize: 9, lineHeight: 1.5, marginBottom: 8 }}>{m.desc}</div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 9, color: fitC, fontWeight: 700 }}>我方適性 {fit.grade}{fit.score != null ? `（${fit.score}）` : ""}</span>
                  <span style={{ color: GC.gray, fontSize: 8 }}>吃重：{m.favors.map(statZh).join("、")}</span>
                  <span style={{ marginLeft: "auto", fontSize: 9, color: RISK_C[m.oppRisk] || GC.gray, fontWeight: 700 }}>對手風險 {m.oppRisk}</span>
                </div>
                <div style={{ color: GC.gray, fontSize: 8, marginTop: 4 }}>⚠ {m.oppNote}</div>
              </button>
            );
          })}
        </div>

        <button onClick={() => selMap && onNext(selMap)} disabled={!selMap} style={{ width: "100%", background: selMap ? `linear-gradient(135deg,${ACC},${ACC}aa)` : "rgba(255,255,255,0.06)", border: "none", borderRadius: 14, padding: "15px", cursor: selMap ? "pointer" : "not-allowed", color: selMap ? "#fff" : GC.gray, fontSize: 15, fontWeight: 900 }}>
          {selMap ? `確認地圖「${selMap.name}」· 部署戰術` : "請先選擇地圖"}
        </button>
      </div>
    </div>
  );
}
