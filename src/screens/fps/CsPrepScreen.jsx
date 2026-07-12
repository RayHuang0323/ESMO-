// ============================================================================
//  screens/fps/CsPrepScreen.jsx — CS 賽前準備（Sprint23）
//
//  Legacy 規格：EsportsGame.jsx MatchPrep({mode:"fps"})（line 7026-）：
//    🎯 標頭「CS 賽前準備 / 攻防戰術模擬」、出戰/歷史分頁、
//    主力 5 人卡（頭像+狀態邊框、個性 emoji、定位、適配、狀態、CS 戰力）、
//    隊伍戰力（先發平均）、主力不足警示、「🔍 配對對手 · 開始比賽」大鈕。
//  與 Legacy 的差異（誠實）：
//    · 「📅 賽程」分頁需要 AI_TEAMS 對手聯賽領域（主幹尚無）→ 本 Sprint 不做。
//    · 歷史分頁改讀 profileStore.csHistory（CsMatchResult.v1 真實紀錄）。
//  Architecture：資料全部來自 profileStore.players + playerModel（無第二套資料）。
//  CS 定位顯示走 fpsRoster 的 MOBA2FPS 對照（MOBA/CS 分離，無 Hero 資訊）。
// ============================================================================
import React, { useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { calcPower, bestPositions, personalityById } from "../../data/playerModel.js";
import { MOBA2FPS, FPS_ROLE_ZH } from "../../battle/fps/fpsRoster.js";
import PlayerFace from "../../ui/PlayerFace.jsx";
import { GC, FONT } from "../../ui/theme.js";

const ACC = "#fb923c"; // Legacy CS 主色
const COND_C = { "精神飽滿": GC.green, "正常": "#d4d4d8", "疲勞": GC.gold, "低潮": GC.red };

export default function CsPrepScreen({ onNext, onBack }) {
  const players = useProfileStore((s) => s.players) ?? [];
  const csHistory = useProfileStore((s) => s.csHistory) ?? [];
  const [tab, setTab] = useState("prep");
  const starters = players.filter((p) => p.status === "主力").slice(0, 5);
  const myPow = starters.length ? Math.round(starters.reduce((t, p) => t + calcPower(p, "fps"), 0) / starters.length) : 0;

  return (
    <div style={{ height: "100%", overflow: "auto", background: GC.bg, fontFamily: FONT, padding: "12px 12px 30px" }}>
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        {/* 標頭（Legacy MatchPrep fps） */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${GC.line}`, borderRadius: 8, padding: "5px 10px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>←</button>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${ACC}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, border: `1px solid ${ACC}` }}>🎯</div>
          <div>
            <div style={{ color: "white", fontSize: 18, fontWeight: 900 }}>CS 賽前準備</div>
            <div style={{ color: GC.gray, fontSize: 10 }}>攻防戰術模擬 · 訓練賽</div>
          </div>
        </div>

        {/* 分頁（Legacy：出戰/賽程/歷史；賽程需 AI_TEAMS 領域，未恢復） */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[{ k: "prep", l: "⚙️ 出戰" }, { k: "history", l: "📜 歷史" }].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)} style={{ flex: 1, padding: "8px", borderRadius: 9, border: "none", cursor: "pointer", background: tab === t.k ? ACC : GC.card, color: tab === t.k ? "#fff" : GC.gray, fontSize: 11, fontWeight: 700 }}>{t.l}</button>
          ))}
        </div>

        {tab === "prep" && (
          <div>
            <div style={{ background: GC.card, borderRadius: 14, padding: "14px", marginBottom: 12, border: `1px solid ${GC.line}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ color: GC.gray, fontSize: 11, fontWeight: 700 }}>出戰陣容（主力 5 人）</span>
                <span style={{ color: ACC, fontSize: 13, fontWeight: 900 }}>隊伍戰力 {myPow}</span>
              </div>
              <div style={{ color: GC.gray, fontSize: 8, marginBottom: 10 }}>數字為該選手 CS 戰力 · 定位由路線對應（無英雄、無技能）</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {starters.map((p) => {
                  const pow = calcPower(p, "fps");
                  const fit = bestPositions(p).fps;
                  const cond = p.condition || "正常";
                  const cc = COND_C[cond] || "#d4d4d8";
                  const pers = personalityById(p.personality);
                  const fpsRole = FPS_ROLE_ZH[MOBA2FPS[p.role]] || "步槍手";
                  return (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, background: GC.card2, border: `1px solid ${GC.line}`, borderRadius: 11, padding: "9px 11px" }}>
                      <div style={{ width: 38, height: 38, borderRadius: "50%", overflow: "hidden", border: `2px solid ${cc}`, flexShrink: 0 }}><PlayerFace player={p} size={34} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ color: "white", fontSize: 12, fontWeight: 700 }}>{p.name}</span>
                          {pers && <span style={{ fontSize: 9 }}>{pers.emoji}</span>}
                        </div>
                        <div style={{ display: "flex", gap: 5, marginTop: 2 }}>
                          <span style={{ background: `${ACC}22`, color: ACC, fontSize: 8, fontWeight: 700, borderRadius: 4, padding: "1px 5px" }}>{fpsRole}</span>
                          <span style={{ color: GC.gray, fontSize: 8 }}>適配 {fit.fit}</span>
                          <span style={{ color: cc, fontSize: 8 }}>{cond}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ color: ACC, fontSize: 17, fontWeight: 900 }}>{pow}</div>
                        <div style={{ color: GC.gray, fontSize: 7 }}>戰力</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {starters.length < 5 && <div style={{ color: GC.red, fontSize: 9, marginTop: 8, textAlign: "center" }}>主力不足 5 人，到選手名單設定主力</div>}
            </div>

            <button onClick={onNext} disabled={starters.length < 5} style={{ width: "100%", background: starters.length >= 5 ? `linear-gradient(135deg,${ACC},${ACC}aa)` : "rgba(255,255,255,0.06)", border: "none", borderRadius: 14, padding: "16px", cursor: starters.length >= 5 ? "pointer" : "not-allowed", color: starters.length >= 5 ? "#fff" : GC.gray, fontSize: 16, fontWeight: 900 }}>🔍 配對對手 · 開始比賽</button>
            <div style={{ textAlign: "center", color: GC.gray, fontSize: 9, marginTop: 8 }}>配對後將選擇地圖、部署戰術，接著開始攻防</div>
          </div>
        )}

        {tab === "history" && (
          <div>
            {csHistory.length === 0 ? (
              <div style={{ textAlign: "center", color: GC.gray, fontSize: 12, padding: "40px 0" }}>尚無 CS 對戰紀錄<br /><span style={{ fontSize: 10 }}>完成比賽後會顯示在這裡</span></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {csHistory.map((h) => {
                  const win = h.winner === "us";
                  return (
                    <div key={h.matchId} style={{ display: "flex", alignItems: "center", gap: 10, background: GC.card, borderRadius: 11, padding: "11px 13px", borderLeft: `3px solid ${win ? GC.green : GC.red}` }}>
                      <span style={{ color: win ? GC.green : GC.red, fontSize: 14, fontWeight: 900 }}>{win ? "勝" : "負"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: "white", fontSize: 12, fontWeight: 700 }}>{h.mapName ?? h.mapId} <span style={{ color: GC.gray, fontWeight: 600, fontFamily: "monospace" }}>{h.ourScore}:{h.enemyScore}</span></div>
                        <div style={{ color: GC.gray, fontSize: 8 }}>{h.tacticName ?? "—"}{h.mvp ? ` · MVP ${h.mvp.playerName}` : ""}</div>
                      </div>
                      <span style={{ color: GC.gold, fontSize: 10 }}>+${Math.round((h.rewards?.money ?? 0) / 10000)}萬</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
