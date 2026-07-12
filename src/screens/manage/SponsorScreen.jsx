// ============================================================================
//  screens/manage/SponsorScreen.jsx — 贊助商（Sprint21）
//  Legacy 來源：EsportsGame.jsx SponsorModule(line5935) Component 化。
//  Presentation 逐項保留：合作中大卡（漸層底/特殊加成條）/ 可簽約清單
//    （達標亮起、未達標降透明度）/ 詳情 Modal（簽約金・週收入・合約期・總收益・
//    特殊加成）/ 條件未達標紅字。
//  Adapter（不造假）：
//    · 贊助商目錄＝playerModel.SPONSORS（Legacy 逐字，唯一來源）
//    · 粉絲＝profileStore.meta.fans；勝場＝seasonStore 推導（不重算戰績）
//    · 簽約寫入 profileStore.activeSponsor + 入帳簽約金 + 發收件匣
// ============================================================================
import React, { useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { useSeasonStore } from "../../platform/seasonStore.js";
import { standings } from "../../platform/seasonData.js";
import { SPONSORS, sponsorById } from "../../data/playerModel.js";
import { GC } from "../../ui/theme.js";
import ManageFrame from "./ManageFrame.jsx";

export default function SponsorScreen({ onBack }) {
  const activeRef = useProfileStore((s) => s.activeSponsor);
  const meta = useProfileStore((s) => s.meta);
  const signSponsor = useProfileStore((s) => s.signSponsor);
  const history = useSeasonStore((s) => s.history);
  const [sel, setSel] = useState(null);

  // 戰績只讀 seasonStore 推導，不在經營層重算
  const blue = standings(history).find((t) => t.side === "blue") || { wins: 0 };
  const fans = meta.fans ?? 0;
  const wins = blue.wins ?? 0;

  const active = activeRef ? { ...sponsorById(activeRef.id), ...activeRef } : null;
  const qualifies = (sp) => fans >= sp.reqFans && wins >= sp.reqWins;

  return (
    <ManageFrame title="贊助商" subtitle="SPONSORS" onBack={onBack}>
      <div style={{ color: GC.gray, fontSize: 10, marginBottom: 14 }}>
        目前粉絲 {fans.toLocaleString()} · 戰績 {wins} 勝 · 條件達標才能簽約
      </div>

      {active ? (
        <div style={{ background: `linear-gradient(135deg,${active.color}22,${GC.card})`, border: `1px solid ${active.color}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 54, height: 54, borderRadius: 14, background: `radial-gradient(circle,${active.color}33,#0a0b0f)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, border: `2px solid ${active.color}` }}>{active.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "white", fontSize: 15, fontWeight: 900 }}>{active.name}</div>
              <div style={{ color: active.color, fontSize: 10, fontWeight: 700 }}>{active.tier}贊助商 · 合作中</div>
              <div style={{ color: GC.gray, fontSize: 9, marginTop: 2 }}>每週收入 +${active.weekly}萬 · 剩 {active.weeksLeft} 週</div>
            </div>
          </div>
          <div style={{ marginTop: 12, background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "7px 10px" }}>
            <div style={{ color: GC.gray, fontSize: 8 }}>特殊加成</div>
            <div style={{ color: GC.gold, fontSize: 10, fontWeight: 700 }}>{active.perk}</div>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", color: GC.gray, fontSize: 11, padding: 14, background: GC.card, borderRadius: 12, marginBottom: 16 }}>尚無贊助商，從下方選擇簽約</div>
      )}

      <div style={{ color: GC.gray, fontSize: 10, fontWeight: 700, marginBottom: 8 }}>
        {active ? "其他贊助商（合約期滿後可換約）" : "可簽約贊助商"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {SPONSORS.map((sp) => {
          const ok = qualifies(sp);
          const isActive = active?.id === sp.id;
          return (
            <button key={sp.id} onClick={() => setSel(sp)}
              style={{ display: "flex", alignItems: "center", gap: 12, background: GC.card, border: `1px solid ${isActive ? GC.green : ok ? sp.color + "44" : "rgba(255,255,255,0.06)"}`, borderRadius: 13, padding: "12px 14px", cursor: "pointer", textAlign: "left", opacity: ok || isActive ? 1 : 0.6 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `radial-gradient(circle,${sp.color}33,#0a0b0f)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0, border: `1px solid ${sp.color}66` }}>{sp.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "white", fontSize: 13, fontWeight: 800 }}>{sp.name}</span>
                  <span style={{ background: `${sp.color}22`, color: sp.color, fontSize: 8, fontWeight: 700, borderRadius: 4, padding: "1px 5px" }}>{sp.tier}</span>
                  {isActive && <span style={{ color: GC.green, fontSize: 8 }}>合作中</span>}
                </div>
                <div style={{ color: GC.gray, fontSize: 9, marginTop: 2 }}>每週 +${sp.weekly}萬 · 簽約金 ${sp.signBonus}萬 · {sp.weeks}週</div>
                <div style={{ color: ok ? GC.green : GC.red, fontSize: 8, marginTop: 2 }}>{ok ? "✓ 條件達標" : `需 ${sp.reqFans}粉絲 / ${sp.reqWins}勝`}</div>
              </div>
              <span style={{ color: GC.gold, fontSize: 11, fontWeight: 800, fontFamily: "monospace" }}>${sp.weekly}/週</span>
            </button>
          );
        })}
      </div>

      {sel && (
        <div onClick={() => setSel(null)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(4px)" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360, width: "100%", background: GC.card2, borderRadius: 16, padding: 18, border: `1px solid ${sel.color}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: `radial-gradient(circle,${sel.color}33,#0a0b0f)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, border: `2px solid ${sel.color}` }}>{sel.emoji}</div>
              <div>
                <div style={{ color: "white", fontSize: 16, fontWeight: 900 }}>{sel.name}</div>
                <div style={{ color: sel.color, fontSize: 10 }}>{sel.tier}贊助商</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {[["簽約金", `$${sel.signBonus}萬`], ["每週收入", `$${sel.weekly}萬`], ["合約期", `${sel.weeks} 週`], ["總收益", `約 $${sel.signBonus + sel.weekly * sel.weeks}萬`], ["特殊加成", sel.perk]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: GC.gray }}>{k}</span><span style={{ color: "white", fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </div>
            {active ? (
              <div style={{ textAlign: "center", color: GC.gray, fontSize: 11, padding: 8 }}>已有合作中贊助商，需等合約期滿</div>
            ) : qualifies(sel) ? (
              <button onClick={() => { signSponsor(sel.id, { fans, wins }); setSel(null); }}
                style={{ width: "100%", background: `linear-gradient(135deg,${sel.color},${sel.color}aa)`, border: "none", borderRadius: 11, padding: 12, cursor: "pointer", color: "#fff", fontSize: 14, fontWeight: 800 }}>
                簽約 · 立即獲得 ${sel.signBonus}萬
              </button>
            ) : (
              <div style={{ textAlign: "center", color: GC.red, fontSize: 11, padding: 8 }}>條件未達標（需 {sel.reqFans} 粉絲 / {sel.reqWins} 勝）</div>
            )}
          </div>
        </div>
      )}
    </ManageFrame>
  );
}
