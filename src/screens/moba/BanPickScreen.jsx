// ============================================================================
//  screens/moba/BanPickScreen.jsx — MOBA Ban/Pick（Sprint11）
//  英雄池唯一來源：CHAMPIONS_100（heroDatabase）。
//  ⚠ 誠實聲明：引擎陣容由 ROSTER 固定，本畫面為賽前 Pick 儀式與英雄資訊展示；
//    Ban 選擇目前不驅動引擎（技術債記錄），最終鎖定 ROSTER 既定英雄。
// ============================================================================
import React, { useState } from "react";
import { Frame } from "./LineupScreen.jsx";
import { CHAMPIONS_100, heroById } from "../../data/heroDatabase.js";
import { ROSTER } from "../../data/roster.js";

const pickIds = (side) => Object.entries(ROSTER).filter(([p]) => p[0] === side).map(([, r]) => r.heroId);

export default function BanPickScreen({ onNext, onBack }) {
  const [bans, setBans] = useState([]);
  const bluePicks = pickIds("b"), redPicks = pickIds("r");
  const locked = new Set([...bluePicks, ...redPicks, ...bans]);
  const pool = CHAMPIONS_100.filter((c) => !locked.has(c.id)).slice(0, 24);

  return (
    <Frame title="BAN / PICK" sub="英雄池來自 CHAMPIONS_100" onBack={onBack} onNext={onNext} nextLabel="進入戰術 →">
      <div style={{ width: 380 }}>
        <PickRow label="🦭 我方 Pick" ids={bluePicks} c="#93c5fd" />
        <PickRow label="🔥 對手 Pick" ids={redPicks} c="#fca5a5" />
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", margin: "8px 0 4px" }}>禁用（點選 Ban，最多 3）：{bans.map((b) => heroById(b)?.zh).join("、") || "—"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 4 }}>
          {pool.map((c) => (
            <button key={c.id} onClick={() => setBans((b) => b.includes(c.id) ? b.filter((x) => x !== c.id) : b.length < 3 ? [...b, c.id] : b)}
              title={`${c.zh}｜${c.lane}｜Q:${c.Q} W:${c.W} E:${c.E} R:${c.R}`}
              style={{ aspectRatio: "1", borderRadius: 6, background: c.color || "#334155", border: "1px solid rgba(255,255,255,0.15)", fontSize: 9, fontWeight: 800, color: "#0b1220", cursor: "pointer" }}>{c.zh.slice(0, 2)}</button>
          ))}
        </div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>滑鼠停留看技能 QWER · 我方/對手 Pick 為既定先發陣容</div>
      </div>
    </Frame>
  );
}
function PickRow({ label, ids, c }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: c, marginBottom: 3 }}>{label}</div>
      <div style={{ display: "flex", gap: 4 }}>
        {ids.map((id) => { const h = heroById(id) || {}; return (
          <div key={id} title={h.title} style={{ flex: 1, background: "rgba(8,14,24,0.85)", border: `1px solid ${c}44`, borderRadius: 7, padding: "4px 2px", textAlign: "center" }}>
            <div style={{ width: 22, height: 22, borderRadius: 5, background: h.color || c, margin: "0 auto 2px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: "#0b1220" }}>{(h.zh || "?").slice(0, 1)}</div>
            <div style={{ fontSize: 8, color: "#e5e7eb", whiteSpace: "nowrap", overflow: "hidden" }}>{h.zh}</div>
          </div>
        ); })}
      </div>
    </div>
  );
}
