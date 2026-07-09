// ============================================================================
//  screens/moba/BanPickScreen.jsx — MOBA Ban/Pick（Sprint12：Legacy 完整版）
//  英雄圖片(色塊)/英雄卡/定位/難度/技能預覽/介紹，全部來自 CHAMPIONS_100。
//  ⚠ 誠實：引擎陣容由 ROSTER 固定，本畫面為賽前 Pick 儀式與英雄資訊展示；
//    Ban 選擇目前不驅動引擎（技術債），最終鎖定 ROSTER 既定英雄。
// ============================================================================
import React, { useState } from "react";
import { Frame } from "./LineupScreen.jsx";
import { CHAMPIONS_100, heroById } from "../../data/heroDatabase.js";
import { ROSTER } from "../../data/roster.js";
import { GC } from "../../ui/theme.js";

const DIFF = ["", "★", "★★", "★★★"];
const pickIds = (side) => Object.entries(ROSTER).filter(([p]) => p[0] === side).map(([, r]) => r.heroId);

export default function BanPickScreen({ onNext, onBack }) {
  const [bans, setBans] = useState([]);
  const [hover, setHover] = useState(null);
  const bluePicks = pickIds("b"), redPicks = pickIds("r");
  const locked = new Set([...bluePicks, ...redPicks, ...bans]);
  const pool = CHAMPIONS_100.filter((c) => !locked.has(c.id)).slice(0, 30);
  const detail = hover ? heroById(hover) : heroById(bluePicks[0]);

  return (
    <Frame title="BAN / PICK" sub="英雄池來自 CHAMPIONS_100" onBack={onBack} onNext={onNext} nextLabel="進入戰術 →">
      <div style={{ display: "flex", gap: 12, width: 620 }}>
        {/* 左：雙方 Pick + 英雄池 */}
        <div style={{ flex: 1 }}>
          <PickRow label="🦭 我方 Pick" ids={bluePicks} c={GC.blueL} onHover={setHover} />
          <PickRow label="🔥 對手 Pick" ids={redPicks} c={GC.redL} onHover={setHover} />
          <div style={{ fontSize: 10, color: GC.gray, margin: "8px 0 4px" }}>禁用（點選 Ban，最多 3）：{bans.map((b) => heroById(b)?.zh).join("、") || "—"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 4 }}>
            {pool.map((c) => (
              <button key={c.id} onClick={() => setBans((b) => b.includes(c.id) ? b.filter((x) => x !== c.id) : b.length < 3 ? [...b, c.id] : b)} onMouseEnter={() => setHover(c.id)}
                style={{ aspectRatio: "1", borderRadius: 6, background: c.color || "#334155", border: "1px solid rgba(255,255,255,0.15)", fontSize: 9, fontWeight: 800, color: "#0b1220", cursor: "pointer", position: "relative" }}>{c.zh.slice(0, 2)}</button>
            ))}
          </div>
        </div>
        {/* 右：英雄卡詳情（大圖/定位/難度/技能預覽/介紹）*/}
        {detail && (
          <div style={{ width: 210, background: GC.card, border: `1px solid ${detail.color || GC.blue}66`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ width: "100%", height: 70, borderRadius: 8, background: `linear-gradient(135deg,${detail.color || GC.blue},#0b1220)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 900, color: "#fff" }}>{detail.zh.slice(0, 1)}</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#fff", marginTop: 7 }}>{detail.zh}</div>
            <div style={{ fontSize: 10, color: GC.gray }}>{detail.title}</div>
            <div style={{ display: "flex", gap: 5, margin: "6px 0", flexWrap: "wrap" }}>
              <span style={{ fontSize: 9, color: GC.purp, border: `1px solid ${GC.purp}55`, borderRadius: 5, padding: "1px 6px" }}>{detail.arch}</span>
              <span style={{ fontSize: 9, color: GC.blueL, border: `1px solid ${GC.blueL}55`, borderRadius: 5, padding: "1px 6px" }}>{detail.lane}</span>
              <span style={{ fontSize: 9, color: GC.gold, border: `1px solid ${GC.gold}55`, borderRadius: 5, padding: "1px 6px" }}>難度 {DIFF[detail.diff]}</span>
            </div>
            <div style={{ fontSize: 9, letterSpacing: "0.15em", color: GC.gray, fontWeight: 900, margin: "6px 0 3px" }}>技能預覽</div>
            {[["P", detail.P], ["Q", detail.Q], ["W", detail.W], ["E", detail.E], ["R", detail.R]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 10, padding: "1px 0" }}>
                <span style={{ width: 15, height: 15, borderRadius: 4, background: k === "R" ? "rgba(250,204,21,0.25)" : "rgba(255,255,255,0.1)", color: k === "R" ? GC.gold : "#cbd5e1", fontWeight: 900, fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{k}</span>
                <span style={{ color: "#e5e7eb" }}>{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Frame>
  );
}
function PickRow({ label, ids, c, onHover }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: c, marginBottom: 3 }}>{label}</div>
      <div style={{ display: "flex", gap: 4 }}>
        {ids.map((id) => { const h = heroById(id) || {}; return (
          <div key={id} onMouseEnter={() => onHover?.(id)} title={h.title} style={{ flex: 1, background: GC.card2, border: `1px solid ${c}44`, borderRadius: 7, padding: "4px 2px", textAlign: "center", cursor: "pointer" }}>
            <div style={{ width: 24, height: 24, borderRadius: 5, background: h.color || c, margin: "0 auto 2px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: "#0b1220" }}>{(h.zh || "?").slice(0, 1)}</div>
            <div style={{ fontSize: 8, color: "#e5e7eb", whiteSpace: "nowrap", overflow: "hidden" }}>{h.zh}</div>
          </div>
        ); })}
      </div>
    </div>
  );
}
