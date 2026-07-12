// ============================================================================
//  screens/fps/CsTacticScreen.jsx — CS 戰術部署（Sprint23）
//
//  Legacy 規格：EsportsGame.jsx TacticSelect({mode:"fps"})（line 7427-7484）
//    「① 團隊戰術」8 張卡（TACTICS_LIB.fps f1–f8 逐字：emoji/風險/desc/核心/detail）。
//  引擎吃法 = Legacy fpsRouter 逐字（EsportsGame.jsx:7629）：
//    確認時輸出 {id, name, type: FPS_TACTIC_TYPE[id]}，引擎在選定地圖的
//    TACTICS_DB 內挑同 type 戰術執行（引擎原生行為，非 Balance 變更）。
//  與 Legacy 的差異（誠實）：
//    · Legacy 的「② 隊員分工 / ③ 局數節奏」引擎沒有對應輸入（純展示層），
//      本 Sprint 不恢復——不做沒有去處的假部署。
//  對選手能力的提示：boost 欄位（Legacy 逐字）→ statZh 顯示。
// ============================================================================
import React, { useState } from "react";
import { CS_TEAM_TACTICS, FPS_TACTIC_TYPE, TACTIC_TYPE_ZH } from "../../battle/fps/csPrepData.js";
import { statZh } from "../../data/playerModel.js";
import { GC, FONT } from "../../ui/theme.js";

const ACC = "#fb923c";
const RISK_C = { "低": GC.green, "中": GC.gold, "高": GC.red };

export default function CsTacticScreen({ mapName, onNext, onBack }) {
  const [sel, setSel] = useState(null);
  const selT = CS_TEAM_TACTICS.find((t) => t.id === sel) || null;

  return (
    <div style={{ height: "100%", overflow: "auto", background: GC.bg, fontFamily: FONT, padding: "12px 12px 30px" }}>
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${GC.line}`, borderRadius: 8, padding: "5px 10px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>←</button>
          <h2 style={{ color: "white", fontSize: 17, fontWeight: 900, margin: 0 }}>戰術部署</h2>
          {mapName && <span style={{ marginLeft: "auto", background: `${ACC}22`, color: ACC, fontSize: 9, fontWeight: 700, borderRadius: 5, padding: "2px 8px" }}>🗺 {mapName}</span>}
        </div>
        <div style={{ color: GC.gray, fontSize: 10, marginBottom: 14 }}>配置團隊戰術，將實際影響攻防回合（引擎依戰術類型在該地圖執行對應打法）</div>

        <div style={{ color: ACC, fontSize: 12, fontWeight: 800, marginBottom: 8 }}>① 團隊戰術</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {CS_TEAM_TACTICS.map((t) => {
            const isSel = sel === t.id;
            return (
              <button key={t.id} onClick={() => setSel(isSel ? null : t.id)} style={{ background: isSel ? `${ACC}22` : GC.card, border: `1.5px solid ${isSel ? ACC : GC.line}`, borderRadius: 11, padding: "10px", cursor: "pointer", textAlign: "left" }}>
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
            <div style={{ color: ACC, fontSize: 10, fontWeight: 800, marginBottom: 3 }}>{selT.emoji} {selT.name} · 引擎執行類型「{TACTIC_TYPE_ZH[FPS_TACTIC_TYPE[selT.id]] ?? "標準"}」</div>
            <div style={{ color: GC.gray, fontSize: 9, lineHeight: 1.5 }}>{selT.detail}</div>
          </div>
        )}

        <button
          onClick={() => selT && onNext({ id: selT.id, name: selT.name, emoji: selT.emoji, risk: selT.risk, type: FPS_TACTIC_TYPE[selT.id] || "default" })}
          disabled={!selT}
          style={{ width: "100%", background: selT ? `linear-gradient(135deg,${ACC},${ACC}aa)` : "rgba(255,255,255,0.06)", border: "none", borderRadius: 14, padding: "16px", cursor: selT ? "pointer" : "not-allowed", color: selT ? "#fff" : GC.gray, fontSize: 16, fontWeight: 900 }}
        >🎯 確認戰術 · 開始對戰</button>
        <div style={{ textAlign: "center", color: GC.gray, fontSize: 9, marginTop: 8 }}>{selT ? `團隊戰術「${selT.name}」` : "未選團隊戰術"}</div>
      </div>
    </div>
  );
}
