// ============================================================================
//  screens/manage/TeamScreen.jsx — 戰隊詳情（Sprint21）
//  Legacy 來源：EsportsGame.jsx TeamModule(line6059) Component 化。
//  Presentation 逐項保留：戰隊識別列（隊徽/Lv/戰績/粉絲）/ MOBA・CS 分部切換 /
//    分部戰力大卡（先發 5 人平均）/ 先發陣容列（排名數字、頭像＋英雄角標、
//    個性 emoji、適配位置與適配值、右側戰力）/ 替補席膠囊。
//  Adapter（不造假）：
//    · 選手＝profileStore.players；戰力/適配＝playerModel（依分部換權重）
//    · 戰績＝seasonStore 推導（不重算）；粉絲/Lv＝profileStore
//    · CS 分部用同一批選手的 FPS 權重呈現——主幹尚無 CS 名單（Sprint22 Audit）
// ============================================================================
import React, { useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { useSeasonStore } from "../../platform/seasonStore.js";
import { standings } from "../../platform/seasonData.js";
import { calcPower, bestPositions, personalityById } from "../../data/playerModel.js";
import { PlayerAvatar } from "../../ui/PlayerFace.jsx";
import { GC } from "../../ui/theme.js";
import ManageFrame from "./ManageFrame.jsx";

const DIVS = [
  { k: "moba", l: "⚔️ MOBA 分部", c: GC.purp },
  { k: "fps",  l: "🎯 CS 分部",   c: "#fb923c" },
];

export default function TeamScreen({ onBack }) {
  const players = useProfileStore((s) => s.players) ?? [];
  const team = useProfileStore((s) => s.team);
  const meta = useProfileStore((s) => s.meta);
  const history = useSeasonStore((s) => s.history);
  const [div, setDiv] = useState("moba");

  const rec = standings(history).find((t) => t.side === "blue") || { wins: 0, losses: 0 };
  const accent = div === "moba" ? GC.purp : "#fb923c";

  // Legacy：依分部戰力排序，主力前 5 為先發
  const ranked = players.map((p) => ({ ...p, pow: calcPower(p, div) })).sort((a, b) => b.pow - a.pow);
  const starters = ranked.filter((p) => p.status === "主力").slice(0, 5);
  const subs = ranked.filter((p) => !starters.some((s) => s.id === p.id));
  const teamPow = starters.length ? Math.round(starters.reduce((s, p) => s + p.pow, 0) / starters.length) : 0;

  return (
    <ManageFrame title="戰隊詳情" subtitle="TEAM" onBack={onBack}>
      {/* 戰隊識別 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ width: 54, height: 54, borderRadius: 14, background: "linear-gradient(135deg,#3b82f6,#1e40af)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, border: "2px solid #60a5fa" }}>{team.emoji}</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: "white", fontSize: 18, fontWeight: 900 }}>{team.name}</div>
          <div style={{ color: GC.gray, fontSize: 10 }}>Lv.{team.lv} · {rec.wins}勝{rec.losses}負 · 粉絲 {(meta.fans ?? 0).toLocaleString()}</div>
        </div>
      </div>

      {/* 分部切換 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {DIVS.map((d) => (
          <button key={d.k} onClick={() => setDiv(d.k)}
            style={{ flex: 1, padding: 11, borderRadius: 12, border: `1.5px solid ${div === d.k ? d.c : "rgba(255,255,255,0.06)"}`, background: div === d.k ? `${d.c}22` : GC.card, cursor: "pointer", color: div === d.k ? d.c : GC.gray, fontSize: 13, fontWeight: 800 }}>{d.l}</button>
        ))}
      </div>

      {/* 分部戰力 */}
      <div style={{ background: `linear-gradient(135deg,${accent}22,${GC.card})`, border: `1px solid ${accent}44`, borderRadius: 14, padding: 14, marginBottom: 12, textAlign: "center" }}>
        <div style={{ color: GC.gray, fontSize: 10 }}>{div === "moba" ? "MOBA" : "CS"} 分部戰力</div>
        <div style={{ color: accent, fontSize: 32, fontWeight: 900 }}>{teamPow}</div>
        <div style={{ color: GC.gray, fontSize: 9 }}>先發 5 人平均（依 {div === "moba" ? "MOBA" : "CS"} 能力權重計算）</div>
      </div>

      {/* 先發陣容 */}
      <div style={{ color: GC.gray, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>先發陣容</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {starters.map((p, i) => {
          const bp = bestPositions(p);
          const fitPos = div === "moba" ? bp.moba : bp.fps;
          const pers = personalityById(p.personality);
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 11, background: GC.card, borderRadius: 12, padding: "10px 13px", border: `1px solid ${accent}33` }}>
              <span style={{ color: accent, fontSize: 11, fontWeight: 900, width: 16 }}>{i + 1}</span>
              <PlayerAvatar player={p} size={40} ring={accent} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ color: "white", fontSize: 13, fontWeight: 800 }}>{p.name}</span>
                  {pers && <span style={{ fontSize: 9 }}>{pers.emoji}</span>}
                </div>
                <div style={{ color: GC.gray, fontSize: 8 }}>適 {fitPos.pos.replace(/MOBA|FPS/, "")} · 適配 {fitPos.fit}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: accent, fontSize: 16, fontWeight: 900 }}>{p.pow}</div>
                <div style={{ color: GC.gray, fontSize: 7 }}>戰力</div>
              </div>
            </div>
          );
        })}
        {starters.length === 0 && <div style={{ color: GC.gray, fontSize: 10, textAlign: "center", padding: "16px 0" }}>尚無主力，到選手名單設定</div>}
      </div>

      {/* 替補席 */}
      {subs.length > 0 && (
        <>
          <div style={{ color: GC.gray, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>替補席（{subs.length}）</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {subs.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, background: GC.card, borderRadius: 10, padding: "7px 10px" }}>
                <PlayerAvatar player={p} size={26} />
                <span style={{ color: "#d4d4d8", fontSize: 10 }}>{p.name}</span>
                <span style={{ color: accent, fontSize: 10, fontWeight: 700 }}>{p.pow}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </ManageFrame>
  );
}
