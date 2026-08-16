// ============================================================================
//  screens/manage/PlayerTalentScreen.jsx — 選手個人天賦（相容檢視）
//
//  R59 起，個人天賦是選手的被動特質，不再是玩家反覆投入 +1/+2 能力的
//  技能樹。既有 players[].talents / talentPoints 不刪除、不重算，舊投入仍
//  由 playerDerivedStats 保持原有效果；新的長期投資請進「戰隊發展」。
// ============================================================================
import React from "react";
import { ChevronLeft } from "lucide-react";
import { useProfileStore } from "../../platform/profileStore.js";
import { getPlayerTalentState } from "../../platform/contracts/playerTalentState.js";
import { getStatLayers } from "../../platform/talents/playerDerivedStats.js";
import { talentById } from "../../platform/talents/talentDefinitions.js";
import { calculateLevelProgress } from "../../platform/progress/playerLevel.js";
import { personalityById, statZh } from "../../data/playerModel.js";
import PlayerFace from "../../ui/PlayerFace.jsx";
import { GC, FONT, MONO } from "../../ui/theme.js";

export default function PlayerTalentScreen({ playerId, onBack }) {
  const players = useProfileStore((s) => s.players) ?? [];
  const p = players.find((x) => x.id === playerId) || players[0];
  if (!p) return null;

  const state = getPlayerTalentState(p);
  const layers = getStatLayers(p);
  const lp = calculateLevelProgress(p.xp ?? 0, 0);
  const personality = personalityById(p.personality);
  const legacyEntries = Object.entries(state.ranks)
    .map(([id, rank]) => ({ def: talentById(id), rank }))
    .filter((x) => x.def);
  const passiveTraits = Array.isArray(p.traits) && p.traits.length > 0
    ? p.traits
    : personality ? [personality.zh] : [];

  return (
    <div data-testid="player-talent-screen" style={{ height: "100%", overflow: "auto", background: GC.bg, fontFamily: FONT }}>
      <div style={{ width: "100%", maxWidth: 760, margin: "0 auto", padding: "12px 12px 30px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button onClick={onBack} aria-label="返回" style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ChevronLeft size={15} style={{ color: "#a1a1aa" }} />
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "white", fontSize: 14, fontWeight: 900 }}>選手個人天賦</div>
            <div style={{ color: "#3f3f46", fontSize: 9, fontWeight: 600, letterSpacing: "0.1em" }}>PLAYER TRAITS</div>
          </div>
          <div style={{ width: 32 }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: GC.card, border: `1px solid ${GC.line}`, borderRadius: 12, padding: "10px 14px", marginBottom: 10 }}>
          <PlayerFace player={p} size={44} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "white", fontSize: 14, fontWeight: 900 }}>{p.name} <span style={{ color: GC.gold, fontSize: 10 }}>Lv.{lp.newLevel}</span></div>
            <div style={{ color: GC.gray, fontSize: 9.5 }}>{p.role} · XP {lp.xpIntoLevel}/{lp.xpForNextLevel}</div>
          </div>
          <div style={{ marginLeft: "auto", color: GC.gray, fontSize: 9.5, lineHeight: 1.5, textAlign: "right" }}>
            個人能力提升<br /><span style={{ color: GC.green, fontWeight: 800 }}>請到訓練中心安排</span>
          </div>
        </div>

        <div style={{ background: "rgba(52,211,153,0.08)", border: `1px solid ${GC.green}44`, borderRadius: 11, padding: "10px 12px", marginBottom: 10 }}>
          <div style={{ color: GC.green, fontSize: 11, fontWeight: 900, marginBottom: 3 }}>這名選手的先天特色</div>
          <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 10, lineHeight: 1.65 }}>
            個人天賦是被動特質，描述選手擅長的風格；它不再是一棵需要反覆投入點數的能力樹。
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {passiveTraits.length ? passiveTraits.map((trait) => (
              <span key={trait} style={{ color: GC.green, background: `${GC.green}18`, border: `1px solid ${GC.green}44`, borderRadius: 7, padding: "3px 8px", fontSize: 9, fontWeight: 800 }}>{personality?.emoji ?? "✦"} {trait}</span>
            )) : <span style={{ color: GC.gray, fontSize: 9 }}>目前沒有額外標記的個人特質</span>}
          </div>
          {personality?.desc && <div style={{ color: GC.gray, fontSize: 9, marginTop: 7 }}>{personality.desc}</div>}
        </div>

        <div style={{ background: GC.card, border: `1px solid ${GC.line}`, borderRadius: 11, padding: "11px 12px", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", marginBottom: 6 }}>
            <div style={{ color: "white", fontSize: 11, fontWeight: 900 }}>既有個人天賦資料</div>
            <div style={{ color: GC.gray, fontSize: 9, fontFamily: MONO }}>保留 {state.availablePoints} 點 · 已投入 {state.spentPoints} 點</div>
          </div>
          <div style={{ color: GC.gray, fontSize: 9.5, lineHeight: 1.6, marginBottom: 8 }}>
            舊存檔的投入與點數仍保留，避免重整後能力改變；本頁不再提供新的能力加點。
          </div>
          {legacyEntries.length === 0 ? (
            <div style={{ color: GC.gray, fontSize: 9.5, padding: "8px 0" }}>尚無舊版個人天賦投入。</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(220px,100%),1fr))", gap: 6 }}>
              {legacyEntries.map(({ def, rank }) => (
                <div key={def.id} style={{ background: "rgba(167,139,250,0.08)", border: `1px solid ${GC.purp}33`, borderRadius: 8, padding: "7px 9px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                    <span style={{ color: "#ddd6fe", fontSize: 10, fontWeight: 800 }}>{def.name}</span>
                    <span style={{ color: GC.purp, fontSize: 9, fontFamily: MONO }}>Lv.{rank}</span>
                  </div>
                  <div style={{ color: GC.gray, fontSize: 8.5, marginTop: 3 }}>{def.effects.map((e) => `${statZh(e.stat)} +${e.perRank}/級`).join("、")}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: GC.card, border: `1px solid ${GC.line}`, borderRadius: 11, padding: "11px 12px" }}>
          <div style={{ color: "white", fontSize: 11, fontWeight: 900, marginBottom: 7 }}>目前衍生能力摘要</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(140px,100%),1fr))", gap: 5 }}>
            {Object.entries(layers.talentBonus).map(([key, bonus]) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: 6, color: GC.gray, fontSize: 9 }}>
                <span>{statZh(key)}</span><span style={{ color: GC.green, fontFamily: MONO }}>+{bonus}</span>
              </div>
            ))}
          </div>
          {Object.keys(layers.talentBonus).length === 0 && <div style={{ color: GC.gray, fontSize: 9.5 }}>目前沒有舊版天賦衍生加成。</div>}
        </div>
      </div>
      <style>{`*::-webkit-scrollbar{display:none}`}</style>
    </div>
  );
}
