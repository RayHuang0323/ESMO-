// ============================================================================
//  battle/ui/HeroDetailPanel.jsx — Hero Page（Sprint08【E】）
//  單一英雄完整檔案：等級/XP 進度、四屬性成長、Mastery（場次/勝率/MVP/總傷/總治/推塔）。
//  資料：useHeroProgressStore（唯一模型）+ heroProgress 公式。不碰 Router：以覆蓋面板呈現。
// ============================================================================
import React from "react";
import { useHeroProgressStore } from "../../hero/heroProgressStore.js";
import { attrs, xpNeed, LEVEL_CAP } from "../../hero/heroProgress.js";

const MONO = "ui-monospace,Menlo,monospace";
const pct = (v) => ((v - 1) * 100).toFixed(1) + "%";

export default function HeroDetailPanel({ heroId, heroName, playerName, side = "blue", onClose }) {
  const hero = useHeroProgressStore((s) => s.progress[heroId]);
  if (!hero) return null;
  const a = attrs(hero.level);
  const need = hero.level >= LEVEL_CAP ? null : xpNeed(hero.level);
  const m = hero.mastery;
  const wr = m.games ? Math.round((m.wins / m.games) * 100) : 0;
  const kda = m.d ? ((m.k + m.a) / m.d).toFixed(2) : (m.k + m.a).toFixed(2);
  const sideC = side === "blue" ? "#93c5fd" : "#fca5a5";
  const RowS = ({ l, v, c = "#e5e7eb" }) => (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, padding: "2.5px 0" }}>
      <span style={{ color: "rgba(255,255,255,0.6)" }}>{l}</span><span style={{ fontFamily: MONO, fontWeight: 800, color: c }}>{v}</span>
    </div>
  );

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 16, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(4,8,16,0.7)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 320, background: "rgba(10,16,28,0.97)", border: `1px solid ${sideC}55`, borderRadius: 14, padding: "16px 18px", fontFamily: "system-ui,sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: sideC }}>{heroName}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{playerName}</div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#fde047", fontFamily: MONO }}>Lv {hero.level}</div>
        </div>
        {/* XP 進度 */}
        <div style={{ margin: "9px 0 3px", height: 7, borderRadius: 99, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
          <div style={{ width: need ? `${Math.min(100, (hero.xp / need) * 100)}%` : "100%", height: "100%", background: "linear-gradient(90deg,#fbbf24,#fde047)" }} />
        </div>
        <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)", fontFamily: MONO, textAlign: "right" }}>{need ? `${hero.xp} / ${need} XP` : "MAX LEVEL"}</div>

        <div style={{ fontSize: 9.5, letterSpacing: "0.2em", color: "rgba(255,255,255,0.5)", fontWeight: 900, margin: "10px 0 3px" }}>屬性成長（vs Lv1）</div>
        <RowS l="❤️ HP" v={"+" + pct(a.hp)} c="#86efac" />
        <RowS l="⚔️ ATK" v={"+" + pct(a.atk)} c="#fda4af" />
        <RowS l="🛡️ Armor" v={"+" + pct(a.armor)} c="#93c5fd" />
        <RowS l="⚡ AttackSpeed" v={"+" + pct(a.atkSpd)} c="#fde68a" />
        <RowS l="→ 引擎 tough / power" v={`×${a.toughMult.toFixed(3)} / ×${a.powerMult.toFixed(3)}`} c="#c4b5fd" />

        <div style={{ fontSize: 9.5, letterSpacing: "0.2em", color: "rgba(255,255,255,0.5)", fontWeight: 900, margin: "10px 0 3px" }}>MASTERY</div>
        <RowS l="使用場次" v={m.games} />
        <RowS l="勝率" v={`${wr}%（${m.wins}勝）`} c={wr >= 50 ? "#86efac" : "#fda4af"} />
        <RowS l="MVP" v={m.mvps} c="#fde047" />
        <RowS l="生涯 KDA" v={`${m.k}/${m.d}/${m.a}（${kda}）`} />
        <RowS l="總傷害" v={(m.dmg / 1000).toFixed(1) + "k"} c="#fda4af" />
        <RowS l="總治療" v={(m.heal / 1000).toFixed(1) + "k"} c="#86efac" />
        <RowS l="總推塔" v={(m.twrDmg / 1000).toFixed(1) + "k"} c="#a5b4fc" />

        <button onClick={onClose} style={{ marginTop: 12, width: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "7px", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>關閉</button>
      </div>
    </div>
  );
}
