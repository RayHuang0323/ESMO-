// ============================================================================
//  battle/ui/BattleEndScreen.jsx — 終局畫面 v2（Sprint07【G】【H】）
//  Victory/Defeat Banner 掃光動畫、MVP 動畫卡、六榜（擊殺/傷害/治療/參團/推塔/金）、
//  金錢差曲線圖 + 推塔進度圖（battleStore.series 真快照取樣）、龍巴龍統計、
//  Timeline 摘要、onContinue 進 Result。全部真資料推導。
//  Sprint20【C/D/E】：
//    · 唯一結算來源仍是 battleStore.result（BattleResult v2）——本檔不重新統計、
//      無 genMatch / 無假 KDA / 無假 MVP / 無假經濟（主幹從無此類假資料）。
//    · 英雄身分改讀 BattleResult.players[].heroId（= Ban/Pick 實際選角），
//      名稱與圖片由 heroDatabase 推導 → Draft / Loading / Battle / Result 一致。
//    · BattleResult 缺的欄位（mana / CS / 裝備）維持不顯示，不造假。
// ============================================================================

import React, { useEffect, useState } from "react";
import { useBattleStore } from "../battleStore.js";
import { fmtT, ROLE_NAME } from "../../gameData.js";
import BattleScoreboard from "./BattleScoreboard.jsx";
import HeroDetailPanel from "./HeroDetailPanel.jsx";
import { useHeroProgressStore } from "../../hero/heroProgressStore.js";
import { heroById } from "../../data/heroDatabase.js";
import HeroPortrait from "../../ui/HeroPortrait.jsx";
import { GC } from "../../ui/theme.js";

const KEYFRAMES = `
@keyframes esmoEndPop { 0%{transform:scale(0.55);opacity:0} 60%{transform:scale(1.1)} 100%{transform:scale(1);opacity:1} }
@keyframes esmoEndRise { 0%{transform:translateY(28px);opacity:0} 100%{transform:translateY(0);opacity:1} }
@keyframes esmoGlow { 0%,100%{text-shadow:0 0 26px currentColor} 50%{text-shadow:0 0 64px currentColor} }
@keyframes esmoSweep { 0%{transform:translateX(-130%) skewX(-18deg)} 100%{transform:translateX(430%) skewX(-18deg)} }
@keyframes esmoMvpIn { 0%{transform:rotateY(70deg);opacity:0} 100%{transform:rotateY(0);opacity:1} }`;

const ICON = { FIRST_BLOOD: "🩸", KILL: "⚔️", MULTI_KILL: "🔥", ACE: "💥", TOWER_DESTROYED: "🗼", DRAGON_SLAIN: "🐉", BARON_SLAIN: "👑", VICTORY: "🏆" };
const sideC = (s) => (s === "blue" ? GC.blueL : GC.redL);
const MONO = "ui-monospace,Menlo,monospace";

// ── 金錢差曲線（SVG，series 真資料）─────────────────────────────────────────
function GoldGraph({ series }) {
  if (series.length < 2) return null;
  const W = 216, H = 64, PAD = 3;
  const diffs = series.map((p) => p.bGold - p.rGold);
  const maxAbs = Math.max(1000, ...diffs.map(Math.abs));
  const X = (i) => PAD + (i / (series.length - 1)) * (W - PAD * 2);
  const Y = (d) => H / 2 - (d / maxAbs) * (H / 2 - PAD);
  const path = diffs.map((d, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(d).toFixed(1)}`).join(" ");
  const areaB = `M${X(0)},${H / 2} ` + diffs.map((d, i) => `L${X(i).toFixed(1)},${Y(Math.max(0, d)).toFixed(1)}`).join(" ") + ` L${X(diffs.length - 1)},${H / 2} Z`;
  const areaR = `M${X(0)},${H / 2} ` + diffs.map((d, i) => `L${X(i).toFixed(1)},${Y(Math.min(0, d)).toFixed(1)}`).join(" ") + ` L${X(diffs.length - 1)},${H / 2} Z`;
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <path d={areaB} fill="rgba(96,165,250,0.22)" /><path d={areaR} fill="rgba(248,113,113,0.22)" />
      <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3" />
      <path d={path} fill="none" stroke="#fde047" strokeWidth="1.6" />
    </svg>
  );
}
// ── 推塔進度圖（階梯線，series 真資料）──────────────────────────────────────
function TowerGraph({ series }) {
  if (series.length < 2) return null;
  const W = 216, H = 52, PAD = 3, MAXT = 9;
  const X = (i) => PAD + (i / (series.length - 1)) * (W - PAD * 2);
  const Y = (n) => H - PAD - (n / MAXT) * (H - PAD * 2);
  const step = (key) => series.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p[key]).toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <path d={step("bTw")} fill="none" stroke="#60a5fa" strokeWidth="1.8" />
      <path d={step("rTw")} fill="none" stroke="#f87171" strokeWidth="1.8" />
    </svg>
  );
}

// Sprint09：只讀 BattleResult.players 既有欄位（挑最大值屬呈現排序，非重新統計）
function bestStats(players) {
  const top = (fn, label, icon, fmt) => {
    const p = [...players].sort((a, b) => fn(b) - fn(a))[0];
    return { icon, label, id: p.id, side: p.side, val: fmt(fn(p)) };
  };
  const k = (v) => Math.round(v), kk = (v) => (v / 1000).toFixed(1) + "k";
  return [
    top((p) => p.k, "最多擊殺", "⚔️", k),
    top((p) => p.dmg, "最高傷害", "💥", kk),
    top((p) => p.heal, "最高治療", "💚", kk),
    top((p) => p.participation, "最高參團", "🤝", (v) => Math.round(v * 100) + "%"),
    top((p) => p.twrDmg, "最佳推塔", "🗼", kk),
    top((p) => p.gold, "最富有", "💰", kk),
  ];
}

export default function BattleEndScreen({ roster = null, homeSide = "blue", onContinue = null, blueName = "德國海豹", redName = "赤焰軍團" }) {
  const result = useBattleStore((s) => s.result);        // Sprint09：唯一結算來源
  const series = useBattleStore((s) => s.series);         // 快照取樣曲線（衍生呈現資料）
  const [phase, setPhase] = useState(0);
  const [heroPage, setHeroPage] = useState(null);   // {heroId,heroName,playerName,side}
  const lastDetail = useHeroProgressStore((s) => s.lastDetail);
  const progress = useHeroProgressStore((s) => s.progress);
  useEffect(() => { const t = setTimeout(() => setPhase(1), 900); return () => clearTimeout(t); }, []);

  if (!result) return null;                               // 終局 result 由 useBattleFeed 先行寫入
  const win = result.winner;
  const mvp = result.players.find((p) => p.mvp) ?? null;
  const homeWin = win === homeSide;
  const title = homeWin ? "VICTORY" : "DEFEAT";
  const titleColor = homeWin ? "#fde047" : "#94a3b8";
  const mvpName = mvp ? (roster?.[mvp.id]?.player ?? mvp.id.toUpperCase()) : "—";
  // Sprint20【D/E】英雄身分只讀 BattleResult.players[].heroId（Ban/Pick 實際選角，
  //   由 useBattleFeed 寫入），名稱/圖片再由 heroDatabase 推導 → 與 Loading / Battle 一致。
  const mvpHeroId = mvp?.heroId ?? roster?.[mvp?.id]?.heroId ?? null;
  const mvpHeroName = heroById(mvpHeroId)?.zh ?? roster?.[mvp?.id]?.hero ?? (mvp ? ROLE_NAME[mvp.role] : "—");
  const highlights = result.timeline.filter((e) => ["FIRST_BLOOD", "ACE", "BARON_SLAIN", "MULTI_KILL", "VICTORY"].includes(e.type)).slice(-6);
  const stats = bestStats(result.players);
  const Panel = ({ title: tt, children, w }) => (
    <div style={{ background: "rgba(8,14,24,0.9)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "9px 12px", width: w }}>
      <div style={{ fontSize: 9.5, letterSpacing: "0.2em", color: "rgba(255,255,255,0.5)", fontWeight: 900, marginBottom: 5 }}>{tt}</div>
      {children}
    </div>
  );

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 14, display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 11, background: "rgba(4,8,16,0.8)", backdropFilter: "blur(5px)", overflow: "auto", padding: 14, fontFamily: "system-ui,sans-serif" }}>
      <style>{KEYFRAMES}</style>

      {/* Victory/Defeat Banner + 掃光 */}
      <div style={{ animation: "esmoEndPop 0.7s cubic-bezier(0.2,0.9,0.3,1.2) both", textAlign: "center", position: "relative", overflow: "hidden", padding: "4px 34px" }}>
        <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: "0.14em", color: titleColor, animation: "esmoGlow 2.2s infinite" }}>{title}</div>
        <div style={{ position: "absolute", top: 0, left: 0, width: "30%", height: "100%", background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)", animation: "esmoSweep 1.6s 0.4s ease both" }} />
        <div style={{ fontSize: 13.5, fontWeight: 800, color: sideC(win), marginTop: 1, fontFamily: MONO }}>
          {result.teams[win].name} 獲勝 · {fmtT(result.duration)} · {result.score.blue}:{result.score.red} · 🐉{result.dragon[win]} 👑{result.baron[win]}
        </div>
      </div>

      {phase >= 1 && (
        <div style={{ display: "flex", gap: 11, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "center", animation: "esmoEndRise 0.5s ease both" }}>
          {/* 左欄：MVP + 六榜 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 9, width: 226 }}>
            {mvp && (
              <div style={{ background: "linear-gradient(160deg,rgba(250,204,21,0.18),rgba(8,14,24,0.92))", border: "1px solid rgba(250,204,21,0.55)", borderRadius: 12, padding: "11px 14px", textAlign: "center", animation: "esmoMvpIn 0.6s 0.2s ease both", transformOrigin: "left" }}>
                <div style={{ fontSize: 10, letterSpacing: "0.3em", color: "#fde047", fontWeight: 900 }}>★ MVP</div>
                {/* Sprint20：MVP 英雄圖（Legacy HERO_IMG，經 heroDatabase）；缺圖 → 不顯示圖，版面不破 */}
                <div style={{ display: "flex", justifyContent: "center", margin: "6px 0 4px" }}>
                  <HeroPortrait heroId={mvpHeroId} size={52} radius={12} border="2px solid rgba(250,204,21,0.7)" alt={mvpHeroName} fallback={null} />
                </div>
                <div style={{ fontSize: 19, fontWeight: 900, color: sideC(mvp.side), marginTop: 2 }}>{mvpName}</div>
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)" }}>{mvpHeroName}</div>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 900, color: "#fff", marginTop: 3 }}>{mvp.k}/{mvp.d}/{mvp.a}</div>
                <div style={{ fontSize: 10, color: "#fde047", marginTop: 2, fontFamily: MONO }}>RTG {mvp.rating.toFixed(0)} · {(mvp.dmg / 1000).toFixed(1)}k DMG</div>
              </div>
            )}
            <Panel title="最佳數據">
              {stats.map((s2, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0" }}>
                  <span style={{ color: "rgba(255,255,255,0.7)" }}>{s2.icon} {s2.label}</span>
                  <span style={{ fontFamily: MONO, fontWeight: 800, color: sideC(s2.side) }}>{roster?.[s2.id]?.player ?? s2.id.toUpperCase()} {s2.val}</span>
                </div>
              ))}
            </Panel>
          </div>

          {/* 中欄：完整記分板 */}
          <BattleScoreboard roster={roster} blueName={blueName} redName={redName} />

          {/* 成長欄：本場 EXP / 升級 / 能力提升 / Mastery（Sprint08【F】）*/}
          {lastDetail && (
            <div style={{ display: "flex", flexDirection: "column", gap: 9, width: 250 }}>
              <Panel title="英雄成長（點擊看 Hero Page）">
                {lastDetail.filter((d) => d.playerId.startsWith(homeSide === "blue" ? "b" : "r")).map((d) => {
                  const r = roster?.[d.playerId];
                  const h = progress[d.heroId];
                  const up = d.levelsGained > 0;
                  const dTough = (d.attrsAfter.toughMult / d.attrsBefore.toughMult - 1) * 100;
                  const dPower = (d.attrsAfter.powerMult / d.attrsBefore.powerMult - 1) * 100;
                  return (
                    <div key={d.playerId} onClick={() => setHeroPage({ heroId: d.heroId, heroName: heroById(d.heroId)?.zh ?? r?.hero ?? d.heroId, playerName: r?.player ?? d.playerId.toUpperCase(), side: homeSide })}
                      style={{ cursor: "pointer", pointerEvents: "auto", padding: "4px 6px", borderRadius: 7, marginBottom: 2, background: up ? "rgba(250,204,21,0.1)" : "rgba(255,255,255,0.03)", border: up ? "1px solid rgba(250,204,21,0.35)" : "1px solid transparent" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5, gap: 6 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, fontWeight: 800, color: "#e5e7eb" }}>
                          {/* Sprint20：成長欄英雄圖（heroId 來自 BattleResult → Ban/Pick 選角）*/}
                          <HeroPortrait heroId={d.heroId} size={22} radius={5} border="1px solid rgba(255,255,255,0.15)" alt="" fallback={null} />
                          {heroById(d.heroId)?.zh ?? r?.hero ?? d.heroId} <span style={{ color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>{r?.player}</span>
                        </span>
                        <span style={{ fontFamily: "ui-monospace,monospace", color: "#fde047", fontWeight: 900, flexShrink: 0 }}>+{d.xpGain} XP</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 1 }}>
                        <span style={{ color: up ? "#fde047" : "rgba(255,255,255,0.4)", fontWeight: 800 }}>
                          {up ? `⬆ Lv${d.levelBefore}→${d.levelAfter}` : `Lv${d.levelAfter}`}
                          {up && <span style={{ color: "#86efac" }}> 生存+{dTough.toFixed(1)}% 輸出+{dPower.toFixed(1)}%</span>}
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.45)", fontFamily: "ui-monospace,monospace" }}>{h ? `${h.mastery.wins}勝/${h.mastery.games}場` : ""}</span>
                      </div>
                    </div>
                  );
                })}
              </Panel>
            </div>
          )}

          {/* 右欄：金錢圖 / 推塔圖 / 戰報摘要 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 9, width: 240 }}>
            <Panel title="金錢差走勢（🔵領先在上）"><GoldGraph series={series} /></Panel>
            <Panel title="推塔進度"><TowerGraph series={series} /></Panel>
            <Panel title="戰報摘要">
              {highlights.map((ev) => (
                <div key={ev.id} style={{ display: "flex", gap: 5, fontSize: 10.5, lineHeight: 1.45 }}>
                  <span>{ICON[ev.type] || "•"}</span>
                  <span style={{ color: "rgba(255,255,255,0.4)", fontFamily: MONO }}>{fmtT(ev.t)}</span>
                  <span style={{ color: sideC(ev.side) }}>{ev.text}</span>
                </div>
              ))}
            </Panel>
          </div>
        </div>
      )}

      {heroPage && <HeroDetailPanel {...heroPage} onClose={() => setHeroPage(null)} />}

      {phase >= 1 && onContinue && (
        <button onClick={onContinue} style={{ animation: "esmoEndRise 0.5s 0.15s ease both", background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", border: "1px solid #93c5fd", borderRadius: 10, padding: "10px 30px", color: "#fff", fontWeight: 900, fontSize: 14, cursor: "pointer" }}>
          查看賽後結算 →
        </button>
      )}
    </div>
  );
}
