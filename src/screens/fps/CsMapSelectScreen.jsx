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

  return (
    <div style={{ height: "100%", overflow: "auto", background: GC.bg, fontFamily: FONT, padding: "12px 12px 30px" }}>
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${GC.line}`, borderRadius: 8, padding: "5px 10px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>←</button>
          <h2 style={{ color: "white", fontSize: 17, fontWeight: 900, margin: 0 }}>選擇地圖</h2>
        </div>
        <div style={{ color: GC.gray, fontSize: 10, marginBottom: 14 }}>對手 Compulsary 已確認出賽 · 選擇對戰地圖後部署戰術</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {CS_MAPS.map((m) => {
            const isSel = sel === m.key;
            const fit = mapFit(starters, m);
            const fitC = fit.grade === "高" ? GC.green : fit.grade === "中" ? GC.gold : fit.grade === "低" ? GC.red : GC.gray;
            return (
              <button key={m.key} onClick={() => setSel(isSel ? null : m.key)} style={{ background: isSel ? `${ACC}18` : GC.card, border: `1.5px solid ${isSel ? ACC : GC.line}`, borderRadius: 13, padding: "12px 14px", cursor: "pointer", textAlign: "left", width: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ color: "white", fontSize: 15, fontWeight: 900 }}>{m.name}</span>
                  <span style={{ background: `${ACC}22`, color: ACC, fontSize: 8, fontWeight: 700, borderRadius: 4, padding: "1px 6px" }}>{m.type}</span>
                  <span style={{ color: GC.gray, fontSize: 8 }}>難度 {m.diff}</span>
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
