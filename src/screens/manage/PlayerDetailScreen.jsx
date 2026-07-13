// ============================================================================
//  screens/manage/PlayerDetailScreen.jsx — 選手詳細檔案（Sprint21）
//  Legacy 來源：EsportsGame.jsx PlayerDetailModule(line2966) Component 化。
//  Presentation 逐項保留：AvatarRing（環形進度 1.4s 動畫＋光暈）＋ Lv 徽章 ＋
//    在線綠點 / 名字列（Courier）/ 標籤膠囊列 / 個性・士氣・狀態三欄（分隔線）/
//    能力面板（能力↔潛力下拉、定位鈕、雙欄 StatRow 條狀動畫、>=74 綠色高亮）/
//    底部進度區（百分比徽章＋五星＋漸層進度條＋本賽季最高）。
//  Adapter（不造假）：
//    · 選手＝profileStore.players；能力/戰力/適配＝playerModel 純函數
//    · 環形進度＝MOBA 綜合戰力；星等＝潛力分級（recruitPool.TIERS 同一套門檻）
//  誠實差異（Legacy 為 demo 假資料，資料層無此欄位）：
//    · 國旗/性別/ID #4621 → 改顯示隊伍徽記 + 真實選手 id
//    · Legacy 每項能力各有一個「潛力值」→ 主幹模型只有單一潛力天花板，
//      故「潛力」模式顯示各項的成長上限（同一天花板）與成長空間，不編造逐項潛力。
// ============================================================================
import React, { useEffect, useState } from "react";
import { ChevronDown, Target, Smile, Battery, Star, Zap } from "lucide-react";
import { useProfileStore } from "../../platform/profileStore.js";
import { STAT_DEF, calcPower, bestPositions, personalityById } from "../../data/playerModel.js";
import { TIERS } from "../../data/recruitPool.js";
import { calculateLevelProgress } from "../../platform/progress/playerLevel.js";
import ManageFrame from "./ManageFrame.jsx";

const HIGH = 74;
const card = (extra = {}) => ({
  borderRadius: 18, border: "1px solid rgba(255,255,255,0.07)",
  background: "linear-gradient(148deg,#1e1b26 0%,#161319 100%)",
  boxShadow: "0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
  ...extra,
});

function AvatarRing({ size = 96, stroke = 4, pct = 78, ringColor = "#a78bfa", children }) {
  const [animated, setAnimated] = useState(0);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - animated / 100);
  useEffect(() => { const t = setTimeout(() => setAnimated(pct), 400); return () => clearTimeout(t); }, [pct]);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ringColor} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(.4,0,.2,1)", filter: `drop-shadow(0 0 6px ${ringColor}80)` }} />
      </svg>
      <div style={{ position: "absolute", inset: stroke + 3, borderRadius: "50%", overflow: "hidden" }}>{children}</div>
    </div>
  );
}

function StatRow({ label, value, isHigh, isEven }) {
  const [barW, setBarW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setBarW(value), 500); return () => clearTimeout(t); }, [value]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: isEven ? "rgba(255,255,255,0.025)" : "transparent", borderRadius: 8 }}>
      <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: "#71717a", letterSpacing: "0.01em" }}>{label}</span>
      <div style={{ width: 48, height: 3, borderRadius: 99, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 99, width: `${barW}%`, background: isHigh ? "linear-gradient(90deg,#34d399,#6ee7b7)" : "linear-gradient(90deg,#52525b,#71717a)", transition: "width 1s cubic-bezier(.4,0,.2,1)" }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 800, color: isHigh ? "#34d399" : "#a1a1aa", minWidth: 26, textAlign: "right", textShadow: isHigh ? "0 0 8px rgba(52,211,153,0.5)" : "none" }}>{value}</span>
    </div>
  );
}

function ProgressBarFull({ value }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(value), 600); return () => clearTimeout(t); }, [value]);
  return (
    <div style={{ height: 6, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${w}%`, borderRadius: 99, background: "linear-gradient(90deg,#7c3aed,#a78bfa,#c4b5fd)", boxShadow: "0 0 10px rgba(167,139,250,0.4)", transition: "width 1.3s cubic-bezier(.4,0,.2,1)" }} />
    </div>
  );
}

export default function PlayerDetailScreen({ playerId, onBack }) {
  const players = useProfileStore((s) => s.players) ?? [];
  const team = useProfileStore((s) => s.team);
  const [mode, setMode] = useState("ability");     // "ability" | "potential"
  const [dropOpen, setDropOpen] = useState(false);

  const p = players.find((x) => x.id === playerId) || players[0];
  if (!p) return <ManageFrame title="選手檔案" subtitle="PLAYER PROFILE" onBack={onBack}><div style={{ color: "#71717a", fontSize: 12, textAlign: "center", padding: 40 }}>名單中沒有選手</div></ManageFrame>;

  const pers = personalityById(p.personality);
  const bp = bestPositions(p);
  const pow = calcPower(p, "moba");
  const potential = p.potential ?? 80;
  // S26【A】：XP / 等級一律由持久化 xp 推導（與 Result receipt 同一把尺）
  const lp = calculateLevelProgress(p.xp ?? 0, 0);
  const morale = p.morale ?? 70;
  const energy = p.energy ?? 100;
  const tier = TIERS.find((t) => potential >= t.min) ?? TIERS[TIERS.length - 1];
  const stars = Math.max(1, Math.min(5, Math.round(potential / 20)));

  // 能力模式＝目前值；潛力模式＝成長上限（單一天花板，見檔頭誠實差異）
  const data = STAT_DEF.map((s) => ({
    label: s.zh,
    value: mode === "ability" ? Math.round(p.stats?.[s.key] ?? 50) : potential,
  }));
  const left = data.filter((_, i) => i % 2 === 0);
  const right = data.filter((_, i) => i % 2 === 1);

  // 底部進度：目前平均能力 / 潛力天花板
  const avg = Math.round(STAT_DEF.reduce((a, s) => a + (p.stats?.[s.key] ?? 50), 0) / STAT_DEF.length);
  const growthPct = Math.min(100, Math.round((avg / potential) * 100));
  const initials = p.name.slice(0, 2).toUpperCase();
  const moraleColor = morale >= 85 ? "#34d399" : morale >= 65 ? "#fbbf24" : "#f87171";
  const energyColor = energy >= 70 ? "#34d399" : energy >= 40 ? "#fbbf24" : "#f87171";

  const TAGS = [
    { label: p.role, color: "#60a5fa", bg: "rgba(96,165,250,0.15)", border: "rgba(96,165,250,0.3)" },
    { label: `適 ${bp.moba.pos.replace("MOBA", "")}`, color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.28)" },
    { label: p.status || "預備隊", color: "#34d399", bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.28)" },
  ];

  return (
    <ManageFrame title="選手檔案" subtitle="PLAYER PROFILE" onBack={onBack}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* SECTION 1：識別 */}
        <div style={card({ padding: "16px 14px 14px" })}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ position: "relative" }}>
              <AvatarRing size={96} stroke={4} pct={pow} ringColor="#a78bfa">
                <div style={{ width: "100%", height: "100%", background: "linear-gradient(145deg,#4c1d95,#1e1b4b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, color: "white", fontFamily: "'Courier New',monospace", letterSpacing: "-0.03em" }}>{initials}</div>
              </AvatarRing>
              <div style={{ position: "absolute", bottom: -4, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", borderRadius: 99, padding: "2px 9px", fontSize: 9, fontWeight: 900, color: "white", border: "2px solid #121113", whiteSpace: "nowrap", letterSpacing: "0.04em", boxShadow: "0 3px 10px rgba(124,58,237,0.5)" }}>Lv. {lp.newLevel}</div>
              <div style={{ position: "absolute", top: 4, right: 2, width: 12, height: 12, borderRadius: "50%", background: energyColor, border: "2.5px solid #121113", boxShadow: `0 0 6px ${energyColor}` }} />
            </div>

            <div style={{ textAlign: "center", marginTop: 6 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 18 }}>{team.emoji}</span>
                <span style={{ color: "white", fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em", fontFamily: "'Courier New',monospace" }}>{p.name}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span style={{ color: "#71717a", fontSize: 11, fontWeight: 600 }}>{p.age ?? "--"} 歲</span>
                <div style={{ width: 3, height: 3, borderRadius: "50%", background: "#3f3f46" }} />
                {/* S26【C】：移除靜態英雄綁定；【A】改顯示持久化 XP（與 Result receipt 同源） */}
                <span style={{ color: "#71717a", fontSize: 11, fontWeight: 600 }}>XP {lp.xpIntoLevel}/{lp.xpForNextLevel}</span>
                <div style={{ width: 3, height: 3, borderRadius: "50%", background: "#3f3f46" }} />
                <span style={{ color: "#a78bfa", fontSize: 11, fontWeight: 600 }}>ID {p.id}</span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
              {TAGS.map((t, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 700, color: t.color, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 99, padding: "3px 10px", letterSpacing: "0.04em" }}>{t.label}</span>
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "14px 0" }} />

          {/* 個性 / 士氣 / 狀態 */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "#3f3f46", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>個性</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 9.5, fontWeight: 600, color: "#c4b5fd", background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 6, padding: "2px 6px", width: "fit-content" }}>{pers ? `${pers.emoji} ${pers.zh}` : "—"}</span>
                <span style={{ fontSize: 9.5, fontWeight: 600, color: "#71717a", padding: "2px 0" }}>{pers?.desc ?? ""}</span>
              </div>
            </div>

            <div style={{ width: 1, background: "rgba(255,255,255,0.06)", alignSelf: "stretch" }} />

            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <div style={{ color: "#3f3f46", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>士氣</div>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: `${moraleColor}1a`, border: `1px solid ${moraleColor}33`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Smile size={20} style={{ color: moraleColor }} />
              </div>
              <span style={{ color: moraleColor, fontSize: 13, fontWeight: 900 }}>{morale}%</span>
            </div>

            <div style={{ width: 1, background: "rgba(255,255,255,0.06)", alignSelf: "stretch" }} />

            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <div style={{ color: "#3f3f46", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>狀態</div>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: `${energyColor}1a`, border: `1px solid ${energyColor}33`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Battery size={20} style={{ color: energyColor }} />
              </div>
              <span style={{ color: energyColor, fontSize: 13, fontWeight: 900 }}>{energy}%</span>
            </div>
          </div>
        </div>

        {/* SECTION 2：能力面板 */}
        <div style={card({ padding: "14px 13px 13px" })}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ position: "relative" }}>
              <button onClick={() => setDropOpen((o) => !o)}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "6px 11px", cursor: "pointer", color: "white", fontSize: 12, fontWeight: 800 }}>
                {mode === "ability" ? "能力" : "潛力"}
                <ChevronDown size={12} style={{ color: "#71717a", transform: dropOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
              </button>
              {dropOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 10, background: "#1e1b26", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", minWidth: 100 }}>
                  {["ability", "potential"].map((m) => (
                    <button key={m} onClick={() => { setMode(m); setDropOpen(false); }}
                      style={{ display: "block", width: "100%", padding: "9px 14px", border: "none", cursor: "pointer", textAlign: "left", fontSize: 12, fontWeight: 700, background: mode === m ? "rgba(167,139,250,0.15)" : "transparent", color: mode === m ? "#c4b5fd" : "#a1a1aa", borderLeft: mode === m ? "2px solid #a78bfa" : "2px solid transparent" }}>
                      {m === "ability" ? "能力" : "潛力"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 10, padding: "6px 12px" }}>
              <Target size={11} style={{ color: "#60a5fa" }} />
              <span style={{ color: "#60a5fa", fontSize: 11, fontWeight: 800 }}>{p.role}</span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 8px", marginBottom: 12 }}>
            {[left, right].map((col, ci) => (
              <div key={ci} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ color: "#3f3f46", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", paddingLeft: 10, marginBottom: 3 }}>{ci === 0 ? "屬性" : "數值"}</div>
                {col.map((row, i) => (
                  <StatRow key={row.label} label={row.label} value={row.value} isHigh={row.value >= HIGH} isEven={i % 2 === 0} />
                ))}
              </div>
            ))}
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginBottom: 12 }} />

          {/* 底部：成長進度 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.22)", borderRadius: 8, padding: "3px 8px", display: "flex", alignItems: "baseline", gap: 2 }}>
                <span style={{ color: "#34d399", fontSize: 14, fontWeight: 900, lineHeight: 1 }}>{growthPct}</span>
                <span style={{ color: "#34d399", fontSize: 9, fontWeight: 700 }}>%</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 3, flex: 1 }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} size={11} style={{ color: s <= stars ? "#fbbf24" : "#27272a", fill: s <= stars ? "#fbbf24" : "none" }} />
                ))}
                <span style={{ color: tier.color, fontSize: 10, fontWeight: 700, marginLeft: 2 }}>{tier.grade}</span>
              </div>
              <span style={{ color: "#52525b", fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>成長</span>
            </div>

            <ProgressBarFull value={growthPct} />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Zap size={10} style={{ color: "#a78bfa" }} />
                <span style={{ color: "#71717a", fontSize: 9 }}>目前平均 {avg} / 潛力 {potential}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: "#52525b", fontSize: 9 }}>成長空間</span>
                <span style={{ color: "#a1a1aa", fontSize: 9, fontWeight: 700 }}>{Math.max(0, potential - avg)} 點</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ManageFrame>
  );
}
