// ============================================================================
//  battle/ui/BattleFloatingText.jsx — MOBA 式浮動大字（直接讀 Timeline 事件）
//  消費 battleStore.floating 佇列：First Blood / 連殺 / ACE / Tower / Dragon /
//  Baron / Victory。每則播放固定秒數後自動回收（consumeFloating）。無假資料。
// ============================================================================

import React, { useEffect, useRef, useState } from "react";
import { useBattleStore } from "../battleStore.js";
import { useIsMobile } from "../../ui/useViewport.js";

const STYLE = {
  FIRST_BLOOD:     { color: "#f87171", size: 46, glow: "#ef4444", life: 2600, sub: "首殺" },
  MULTI_KILL:      { color: "#fbbf24", size: 42, glow: "#f59e0b", life: 2400, sub: "連殺" },
  ACE:             { color: "#a78bfa", size: 50, glow: "#7c3aed", life: 2800, sub: "團滅" },
  TOWER_DESTROYED: { color: "#93c5fd", size: 26, glow: "#3b82f6", life: 1800, sub: "推塔" },
  DRAGON_SLAIN:    { color: "#c4b5fd", size: 30, glow: "#8b5cf6", life: 2000, sub: "Dragon" },
  BARON_SLAIN:     { color: "#fcd34d", size: 34, glow: "#f59e0b", life: 2400, sub: "Baron" },
  VICTORY:         { color: "#fde047", size: 64, glow: "#facc15", life: 5000, sub: "勝利" },
};

function FloatingItem({ ev, onDone }) {
  const st = STYLE[ev.type] || STYLE.TOWER_DESTROYED;
  const [phase, setPhase] = useState("in");
  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 260);
    const t2 = setTimeout(() => setPhase("out"), st.life - 400);
    const t3 = setTimeout(() => onDone(ev.id), st.life);
    return () => [t1, t2, t3].forEach(clearTimeout);
  }, [ev.id]);

  const transform = phase === "in" ? "translateY(18px) scale(0.7)" : phase === "out" ? "translateY(-24px) scale(1.05)" : "translateY(0) scale(1)";
  const opacity = phase === "out" ? 0 : 1;
  const sideColor = ev.side === "blue" ? "#93c5fd" : ev.side === "red" ? "#fca5a5" : "#e5e7eb";

  return (
    <div style={{ transition: "all 0.4s cubic-bezier(0.2,0.9,0.3,1)", transform, opacity, textAlign: "center", marginBottom: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.3em", color: sideColor, textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>{st.sub}</div>
      <div style={{ fontSize: st.size, fontWeight: 900, color: st.color, letterSpacing: "0.02em", lineHeight: 1.05, textShadow: `0 0 20px ${st.glow}, 0 2px 6px rgba(0,0,0,0.95)`, WebkitTextStroke: "1px rgba(0,0,0,0.4)" }}>
        {ev.text}
      </div>
    </div>
  );
}

export default function BattleFloatingText() {
  const floating = useBattleStore((s) => s.floating);
  const consume = useBattleStore((s) => s.consumeFloating);
  const mobile = useIsMobile();
  // 同時最多顯示 3 則（避免洗版），其餘留在佇列排隊
  const visible = floating.slice(0, 3);

  return (
    //  Milestone H：手機把浮動大字往下移並收窄。
    //    26% + 80% 寬在 390×844 會直接壓到右上的倍率／畫質按鈕欄
    //    （SAFE_TOP=138 起算的直欄約到 y≈262 ≈ 31%）⇒ 連殺橫幅蓋住可點控制項。
    //    桌機維持原位（空間夠，不動既有版面）。
    <div style={{ position: "absolute", top: mobile ? "38%" : "26%", left: "50%", transform: "translateX(-50%)", zIndex: 11, pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", width: mobile ? "70%" : "80%" }}>
      {visible.map((ev) => (
        <FloatingItem key={ev.id} ev={ev} onDone={consume} />
      ))}
    </div>
  );
}
