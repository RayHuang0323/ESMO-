// ============================================================================
//  screens/manage/PlayerTalentScreen.jsx — 選手天賦（Sprint27 MVP）
//
//  與 Legacy TalentModule 的刻意差異（不是照搬）：Legacy 是全隊加成＋直接改
//  base stats；本畫面是**每位選手獨立**、效果走 derived 層、12 節點小樹。
//
//  架構鐵律：
//    · UI **不直接修改** player stats / talentPoints——一律走
//      profileStore.purchasePlayerTalent（唯一入口），畫面只顯示 receipt。
//    · 防誤點：點節點 → 確認區（列成本＋能力改變＋「投入後不可重置」警語）
//      → 再按「確認投入」才扣點。單次點擊不扣點。
//    · 本 Sprint 無重置系統（正式 UI 無重置鈕）。
//  響應式：無固定 380/560px、不 transform scale；節點 grid
//    minmax(min(230px,100%),1fr)（320px 單欄 → 桌機多欄），長中文自然換行，
//    確認區在選中節點下方展開（不被 footer 遮擋）。
// ============================================================================
import React, { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useProfileStore } from "../../platform/profileStore.js";
import { TALENT_CATEGORIES, talentsByCategory, talentById } from "../../platform/talents/talentDefinitions.js";
import { getPlayerTalentState } from "../../platform/contracts/playerTalentState.js";
import { getStatLayers } from "../../platform/talents/playerDerivedStats.js";
import { calculateLevelProgress } from "../../platform/progress/playerLevel.js";
import { statZh } from "../../data/playerModel.js";
import PlayerFace from "../../ui/PlayerFace.jsx";
import { GC, FONT, MONO } from "../../ui/theme.js";

/** 購買前置檢查（僅供 UI 顯示「無法購買原因」；真正的檢查在購買服務內再做一次） */
function blockReason(def, state) {
  const rank = state.ranks[def.id] ?? 0;
  if (rank >= def.maxRank) return "已達最高等級";
  for (const pre of def.prerequisites) {
    const has = state.ranks[pre.talentId] ?? 0;
    if (has < pre.minRank) return `需「${talentById(pre.talentId)?.name}」${pre.minRank} 級`;
  }
  if (state.availablePoints < def.costPerRank) return `天賦點不足（需 ${def.costPerRank}）`;
  return null;
}

export default function PlayerTalentScreen({ playerId, onBack }) {
  const players = useProfileStore((s) => s.players) ?? [];
  const purchase = useProfileStore((s) => s.purchasePlayerTalent);
  const [confirmId, setConfirmId] = useState(null);   // 防誤點：先選節點再確認
  const [lastReceipt, setLastReceipt] = useState(null);

  const p = players.find((x) => x.id === playerId) || players[0];
  if (!p) return null;
  const state = getPlayerTalentState(p);
  const layers = getStatLayers(p);
  const lp = calculateLevelProgress(p.xp ?? 0, 0);
  const confirmDef = confirmId ? talentById(confirmId) : null;
  const confirmBlock = confirmDef ? blockReason(confirmDef, state) : null;

  const doPurchase = () => {
    const receipt = purchase({ playerId: p.id, talentId: confirmId });
    setLastReceipt(receipt);
    if (receipt.success) setConfirmId(null);
  };

  return (
    <div style={{ height: "100%", overflow: "auto", background: GC.bg, fontFamily: FONT }}>
      <div style={{ width: "100%", maxWidth: 760, margin: "0 auto", padding: "12px 12px 30px", boxSizing: "border-box" }}>
        {/* 返回列 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button onClick={onBack} style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <ChevronLeft size={15} style={{ color: "#a1a1aa" }} />
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "white", fontSize: 14, fontWeight: 900 }}>選手天賦</div>
            <div style={{ color: "#3f3f46", fontSize: 9, fontWeight: 600, letterSpacing: "0.1em" }}>PLAYER TALENTS</div>
          </div>
          <div style={{ width: 32 }} />
        </div>

        {/* 選手識別 + 點數 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: GC.card, border: `1px solid ${GC.line}`, borderRadius: 12, padding: "10px 14px", marginBottom: 10 }}>
          <PlayerFace player={p} size={44} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "white", fontSize: 14, fontWeight: 900 }}>{p.name} <span style={{ color: GC.gold, fontSize: 10 }}>Lv.{lp.newLevel}</span></div>
            <div style={{ color: GC.gray, fontSize: 9.5 }}>{p.role} · XP {lp.xpIntoLevel}/{lp.xpForNextLevel}</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ background: "rgba(167,139,250,0.15)", color: GC.purp, fontSize: 11, fontWeight: 900, borderRadius: 8, padding: "5px 12px", fontFamily: MONO }}>可用 {state.availablePoints} 點</span>
            <span style={{ background: "rgba(255,255,255,0.05)", color: GC.gray, fontSize: 11, fontWeight: 800, borderRadius: 8, padding: "5px 12px", fontFamily: MONO }}>已投入 {state.spentPoints} 點</span>
          </div>
        </div>
        <div style={{ color: GC.gold, fontSize: 9.5, marginBottom: 12 }}>⚠ 天賦為永久投入，目前投入後不可重置。效果進入衍生能力（不覆寫基礎能力），MOBA 戰術適性與 CS 對戰都會讀到。</div>

        {/* 最近一次購買 receipt（UI 只顯示，不自行重算） */}
        {lastReceipt && (
          <div style={{ background: lastReceipt.success ? "rgba(52,211,153,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${lastReceipt.success ? GC.green : GC.red}44`, borderRadius: 10, padding: "8px 12px", marginBottom: 12, fontSize: 10.5 }}>
            {lastReceipt.success ? (
              <span style={{ color: GC.green }}>
                ✅ {talentById(lastReceipt.talentId)?.name} Lv.{lastReceipt.previousRank}→{lastReceipt.newRank}　−{lastReceipt.pointsSpent} 點（剩 {lastReceipt.remainingPoints}）
                {lastReceipt.statChanges.map((c) => `${statZh(c.stat)} ${c.before}→${c.after}`).join("、")}
              </span>
            ) : (
              <span style={{ color: GC.red }}>✕ 投入失敗：{lastReceipt.failureReason}</span>
            )}
          </div>
        )}

        {/* 四大分類 × 三節點 */}
        {TALENT_CATEGORIES.map((cat) => (
          <div key={cat.id} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
              <span style={{ fontSize: 14 }}>{cat.emoji}</span>
              <span style={{ color: cat.color, fontSize: 12, fontWeight: 900 }}>{cat.zh}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(230px,100%),1fr))", gap: 8 }}>
              {talentsByCategory(cat.id).map((def) => {
                const rank = state.ranks[def.id] ?? 0;
                const maxed = rank >= def.maxRank;
                const block = blockReason(def, state);
                const isSel = confirmId === def.id;
                return (
                  <div key={def.id} style={{ minWidth: 0 }}>
                    <button onClick={() => setConfirmId(isSel ? null : def.id)}
                      style={{ width: "100%", textAlign: "left", background: isSel ? GC.card2 : GC.card, border: `1px solid ${maxed ? cat.color : isSel ? "#93c5fd" : GC.line}`, borderRadius: 10, padding: "9px 11px", cursor: "pointer", minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                        <span style={{ color: "white", fontSize: 12, fontWeight: 800, minWidth: 0, overflowWrap: "break-word" }}>{def.name}</span>
                        <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: 10.5, fontWeight: 900, color: maxed ? cat.color : rank > 0 ? "#e5e7eb" : GC.gray }}>{rank}/{def.maxRank}</span>
                      </div>
                      <div style={{ color: GC.gray, fontSize: 9, lineHeight: 1.55, marginTop: 3, overflowWrap: "break-word" }}>{def.description}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5, alignItems: "center" }}>
                        {def.effects.map((e) => (
                          <span key={e.stat} style={{ fontSize: 8.5, color: cat.color, background: `${cat.color}18`, border: `1px solid ${cat.color}40`, borderRadius: 5, padding: "1px 6px" }}>{statZh(e.stat)} +{e.perRank}/級</span>
                        ))}
                        <span style={{ marginLeft: "auto", fontSize: 8.5, color: block && !maxed ? GC.red : GC.gray }}>
                          {maxed ? "✓ 滿級" : block ? block : `花費 ${def.costPerRank} 點`}
                        </span>
                      </div>
                    </button>

                    {/* 防誤點確認區（在節點正下方展開，不會被遮擋） */}
                    {isSel && !maxed && (
                      <div style={{ marginTop: 6, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(147,197,253,0.4)", borderRadius: 10, padding: "9px 11px" }}>
                        <div style={{ color: "#e5e7eb", fontSize: 10.5, fontWeight: 800, marginBottom: 4 }}>確認投入 {def.costPerRank} 點 → {def.name} Lv.{rank + 1}？</div>
                        <div style={{ color: GC.gray, fontSize: 9.5, marginBottom: 3 }}>
                          {def.effects.map((e) => {
                            const cur = layers.derived[e.stat] ?? 50;
                            return `${statZh(e.stat)} ${cur} → ${Math.min(99, cur + e.perRank)}`;
                          }).join("、")}
                        </div>
                        <div style={{ color: GC.gold, fontSize: 8.5, marginBottom: 7 }}>⚠ 目前投入後不可重置</div>
                        {block ? (
                          <div style={{ color: GC.red, fontSize: 10, fontWeight: 700 }}>{block}</div>
                        ) : (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button onClick={doPurchase} style={{ background: "linear-gradient(135deg,#7c3aed,#a78bfa)", border: "none", borderRadius: 8, padding: "7px 18px", color: "#fff", fontSize: 11, fontWeight: 900, cursor: "pointer" }}>確認投入</button>
                            <button onClick={() => setConfirmId(null)} style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${GC.line}`, borderRadius: 8, padding: "7px 14px", color: GC.gray, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>取消</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <style>{`*::-webkit-scrollbar{display:none}`}</style>
    </div>
  );
}
