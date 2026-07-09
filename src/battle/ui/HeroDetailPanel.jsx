// ============================================================================
//  battle/ui/HeroDetailPanel.jsx — Hero Page（Sprint08【E】）
//  單一英雄完整檔案：等級/XP 進度、四屬性成長、Mastery（場次/勝率/MVP/總傷/總治/推塔）。
//  資料：useHeroProgressStore（唯一模型）+ heroProgress 公式。不碰 Router：以覆蓋面板呈現。
// ============================================================================
import React from "react";
import { useHeroProgressStore } from "../../hero/heroProgressStore.js";
import { attrs, xpNeed, LEVEL_CAP } from "../../hero/heroProgress.js";
import { heroById } from "../../data/heroDatabase.js";
import { GC } from "../../ui/theme.js";

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
  const sideC = side === "blue" ? GC.blueL : GC.redL;
  const db = heroById(heroId) || {};
  const DIFF = ["", "★", "★★", "★★★"];
  // 推薦玩法：衍生自既有 arch/lane 欄位（非造假新資料）
  const PLAYSTYLE = { 坦克: "站前排開團、吸收傷害並保護後排輸出", 戰士: "前期壓制換血，中期帶節奏參團", 刺客: "抓落單、繞後切後排，滾雪球擴大優勢", 法師: "控線消耗，團戰交關鍵技能與範圍傷害", 射手: "跟隨隊伍站位輸出，後期為主要 Carry", 輔助: "做視野、保護 Carry 並尋找開團時機" };
  const RowS = ({ l, v, c = "#e5e7eb" }) => (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, padding: "2.5px 0" }}>
      <span style={{ color: "rgba(255,255,255,0.6)" }}>{l}</span><span style={{ fontFamily: MONO, fontWeight: 800, color: c }}>{v}</span>
    </div>
  );

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 16, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(4,8,16,0.7)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 320, background: "rgba(10,16,28,0.97)", border: `1px solid ${sideC}55`, borderRadius: 14, padding: "16px 18px", fontFamily: "system-ui,sans-serif" }}>
        {/* 英雄大圖橫幅（Sprint12：Legacy Hero Detail 感）*/}
        <div style={{ position: "relative", height: 78, borderRadius: 10, background: `linear-gradient(135deg,${db.color || sideC},#0b1220)`, display: "flex", alignItems: "center", padding: "0 14px", marginBottom: 9, overflow: "hidden" }}>
          <div style={{ fontSize: 48, fontWeight: 900, color: "rgba(255,255,255,0.9)" }}>{(db.zh || heroName || "?").slice(0, 1)}</div>
          <div style={{ marginLeft: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>{db.zh || heroName}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.8)" }}>{db.title || ""}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>{playerName}</div>
          </div>
          <div style={{ position: "absolute", top: 8, right: 12, fontSize: 20, fontWeight: 900, color: "#fde047", fontFamily: MONO }}>Lv {hero.level}</div>
        </div>
        {/* 定位 / 難度徽章 */}
        {db.arch && (
          <div style={{ display: "flex", gap: 5, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 9, color: "#c4b5fd", border: "1px solid #a78bfa55", borderRadius: 5, padding: "1px 6px" }}>{db.arch}</span>
            <span style={{ fontSize: 9, color: sideC, border: `1px solid ${sideC}55`, borderRadius: 5, padding: "1px 6px" }}>{db.lane}</span>
            <span style={{ fontSize: 9, color: GC.gold, border: "1px solid #fbbf2455", borderRadius: 5, padding: "1px 6px" }}>難度 {DIFF[db.diff] || "—"}</span>
          </div>
        )}
        {/* XP 進度 */}
        <div style={{ margin: "9px 0 3px", height: 7, borderRadius: 99, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
          <div style={{ width: need ? `${Math.min(100, (hero.xp / need) * 100)}%` : "100%", height: "100%", background: "linear-gradient(90deg,#fbbf24,#fde047)" }} />
        </div>
        <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)", fontFamily: MONO, textAlign: "right" }}>{need ? `${hero.xp} / ${need} XP` : "MAX LEVEL"}</div>

        <div style={{ fontSize: 9.5, letterSpacing: "0.2em", color: "rgba(255,255,255,0.5)", fontWeight: 900, margin: "10px 0 3px" }}>屬性成長（vs Lv1）</div>
        <RowS l="❤️ HP" v={"+" + pct(a.hp)} c="#86efac" />
        <RowS l="⚔️ ATK" v={"+" + pct(a.atk)} c="#fda4af" />
        <RowS l="🛡️ Armor" v={"+" + pct(a.armor)} c={GC.blueL} />
        <RowS l="⚡ AttackSpeed" v={"+" + pct(a.atkSpd)} c="#fde68a" />
        <RowS l="→ 引擎 tough / power" v={`×${a.toughMult.toFixed(3)} / ×${a.powerMult.toFixed(3)}`} c="#c4b5fd" />

        {(() => { const h = heroById(heroId); return h ? (
          <>
            <div style={{ fontSize: 9.5, letterSpacing: "0.2em", color: "rgba(255,255,255,0.5)", fontWeight: 900, margin: "10px 0 3px" }}>技能（SKILL · CHAMPIONS_100）</div>
            {[["P", h.P], ["Q", h.Q], ["W", h.W], ["E", h.E], ["R", h.R]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 11, padding: "1.5px 0" }}>
                <span style={{ width: 16, height: 16, borderRadius: 4, background: k === "R" ? "rgba(250,204,21,0.25)" : "rgba(255,255,255,0.1)", color: k === "R" ? "#fde047" : "#cbd5e1", fontWeight: 900, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{k}</span>
                <span style={{ color: "#e5e7eb" }}>{v}</span>
              </div>
            ))}
            <div style={{ fontSize: 8.5, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{h.title} · {h.arch} · {h.lane}</div>
            <div style={{ fontSize: 9.5, letterSpacing: "0.2em", color: "rgba(255,255,255,0.5)", fontWeight: 900, margin: "10px 0 3px" }}>推薦玩法</div>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>{PLAYSTYLE[h.arch] || "依定位靈活應對戰局。"}</div>
            <div style={{ fontSize: 9.5, letterSpacing: "0.2em", color: "rgba(255,255,255,0.5)", fontWeight: 900, margin: "10px 0 3px" }}>推薦 BUILD</div>
            <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.4)" }}>裝備系統尚未整合，保留位置（不造假）</div>
          </>
        ) : null; })()}

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
