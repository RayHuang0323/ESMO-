// ============================================================================
//  screens/moba/LoadingScreen.jsx — Legacy 進場儀式感恢復（Sprint18【C】）
//  Presentation：Legacy MatchmakingModule 風格（隊徽 64px 漸層 / 金色 VS 24px /
//    紫漸層主題）擴展為賽後 draft 陣容展示：雙方 5v5 英雄卡（選手名 + 英雄名 +
//    定位色）+ 中央 VS + Loading Bar + 進場文案。
//  資料來源（不造假）：draft.picks（BanPick 實際結果，經 AppShell 傳遞）優先；
//    未經 BanPick（直接測試進入）則回退 ROSTER 預設英雄。
//  Adapter：TEAMS/ROSTER（data/roster.js）+ heroDatabase（唯一英雄資料）。
// ============================================================================
import React, { useEffect, useState } from "react";
import { TEAMS, ROSTER } from "../../data/roster.js";
import { heroById } from "../../data/heroDatabase.js";

const ARCH_COLOR = { 坦克: "#60a5fa", 戰士: "#f97316", 刺客: "#ef4444", 法師: "#a855f7", 射手: "#22c55e", 輔助: "#14b8a6" };
const TIPS = ["提示：控制型英雄可反制高機動陣容", "提示：真傷是對付肉盾的最佳解", "提示：射手需要發育時間，前期注意保護", "提示：觀察對手動向，掌握開團時機"];

function HeroCard({ hero, player, side }) {
  const h = hero || {};
  let hh = 0; for (let i = 0; i < (h.id || "?").length; i++) hh = (hh * 31 + (h.id || "?").charCodeAt(i)) & 0xffffff;
  const hue = hh % 360;
  return (
    <div style={{ display: "flex", flexDirection: side === "blue" ? "row" : "row-reverse", alignItems: "center", gap: 8, marginBottom: 7 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, border: `2px solid ${ARCH_COLOR[h.arch] || "#334155"}`, background: `linear-gradient(135deg, hsl(${hue},45%,32%), #0a0a10)`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "rgba(255,255,255,0.9)", fontSize: 15 }}>{(h.zh || "?").slice(0, 1)}</div>
      <div style={{ minWidth: 0, textAlign: side === "blue" ? "left" : "right" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#e5e7eb", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{player}</div>
        <div style={{ fontSize: 10, color: ARCH_COLOR[h.arch] || "#71717a" }}>{h.zh || "—"} · {h.arch || "—"}</div>
      </div>
    </div>
  );
}

export default function LoadingScreen({ draft, tactic = null, onDone }) {
  const [pct, setPct] = useState(0);
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  useEffect(() => {
    const iv = setInterval(() => setPct((p) => { if (p >= 100) { clearInterval(iv); setTimeout(onDone, 400); return 100; } return p + 3; }), 50);
    return () => clearInterval(iv);
  }, []);

  // 陣容：draft.picks（實際 BanPick 結果）優先；否則 ROSTER 預設英雄
  const lanes = (side) => Object.entries(ROSTER).filter(([p]) => p[0] === side[0]);
  const heroFor = (side, idx, rosterHeroId) => {
    const pk = draft?.picks?.[side]?.[idx];
    return pk || heroById(rosterHeroId) || null;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0a0b0f", padding: "24px 20px", fontFamily: "system-ui" }}>
      {/* 頂部隊徽 + VS（Legacy Matchmaking 版式）*/}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ width: 64, height: 64, margin: "0 auto 8px", borderRadius: 16, background: "linear-gradient(135deg,#3b82f6,#1e40af)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, border: "2px solid #60a5fa" }}>{TEAMS.blue.emoji}</div>
          <div style={{ color: "white", fontSize: 13, fontWeight: 800 }}>{TEAMS.blue.name}</div>
        </div>
        <div style={{ textAlign: "center", padding: "0 12px" }}>
          <div style={{ color: "#fbbf24", fontSize: 24, fontWeight: 900 }}>VS</div>
          <div style={{ color: "#71717a", fontSize: 9, fontWeight: 700, marginTop: 4 }}>排位賽</div>
        </div>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ width: 64, height: 64, margin: "0 auto 8px", borderRadius: 16, background: "linear-gradient(135deg,#ef4444,#7f1d1d)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, border: "2px solid #f87171" }}>{TEAMS.red.emoji}</div>
          <div style={{ color: "white", fontSize: 13, fontWeight: 800 }}>{TEAMS.red.name}</div>
        </div>
      </div>

      {/* 5v5 英雄卡（draft 結果）*/}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flex: 1 }}>
        {["blue", "red"].map((side) => (
          <div key={side} style={{ flex: 1, minWidth: 0 }}>
            {lanes(side).map(([pid, r], idx) => (
              <HeroCard key={pid} hero={heroFor(side, idx, r.heroId)} player={r.player} side={side} />
            ))}
          </div>
        ))}
      </div>

      {/* Sprint19【D】本場戰術（TacticScreen 選擇 → 展示；不影響引擎數值）*/}
      {tactic && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,rgba(124,58,237,0.18),rgba(167,139,250,0.08))", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 12, padding: "7px 16px" }}>
            <span style={{ fontSize: 16 }}>{tactic.emoji}</span>
            <div>
              <div style={{ fontSize: 8, color: "#52525b", letterSpacing: "0.12em" }}>本場戰術 · TACTIC</div>
              <div style={{ fontSize: 12.5, fontWeight: 900, color: "#c4b5fd" }}>{tactic.name}<span style={{ color: "#71717a", fontWeight: 600, fontSize: 10 }}> · {tactic.desc}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Loading Bar + 進場文案（Legacy 紫漸層主題）*/}
      <div style={{ marginTop: 16 }}>
        <div style={{ height: 8, borderRadius: 99, background: "rgba(255,255,255,0.07)", overflow: "hidden", marginBottom: 8 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#a78bfa,#7c3aed)", borderRadius: 99, transition: "width .1s linear" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#71717a", fontSize: 10 }}>{tip}</span>
          <span style={{ color: "#a78bfa", fontSize: 11, fontWeight: 800 }}>{pct < 100 ? `載入中 ${pct}%` : "進入對戰！"}</span>
        </div>
      </div>
    </div>
  );
}
