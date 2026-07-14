// ============================================================================
//  screens/manage/RosterScreen.jsx — 選手名單（Sprint21）
//  Legacy 來源：EsportsGame.jsx RosterModule(line3373) Component 化。
//  Presentation 逐項保留：人數上限徽章（滿額轉紅）/ 五種篩選膠囊 /
//    選手列（頭像＋英雄小角標、四項聚合能力、M/F 雙戰力、狀態徽章）/
//    「還可招募 N 名」虛線提示 / 詳情 Modal（雙戰力卡＋狀態、士氣潛力合約、
//    改名、五定位適配、16 項能力分四類條圖、個性 boost↑/nerf↓ 標色）。
//  Adapter（不造假）：選手＝profileStore.players；能力/戰力/適配＝playerModel
//    純函數；英雄圖＝HeroPortrait（唯一入口）。改名 / 換定位寫回 Store。
// ============================================================================
import React, { useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import {
  STAT_DEF, STAT_CATS, MOBA_ROLES, ROSTER_CAP,
  calcPower, posFit, bestPositions, personalityById,
} from "../../data/playerModel.js";
import { calculateLevelProgress } from "../../platform/progress/playerLevel.js";
import { PlayerAvatar } from "../../ui/PlayerFace.jsx";
import { withDerivedStats } from "../../platform/talents/playerDerivedStats.js";
import { GC } from "../../ui/theme.js";
import ManageFrame from "./ManageFrame.jsx";

const FILTERS = ["全部", "主力", "預備隊", "訓練中", "閒置"];

// Legacy calcAggr：16 項壓成 4 項聚合顯示
const aggr = (p) => {
  const s = p.stats || {};
  const avg = (...keys) => Math.round(keys.reduce((a, k) => a + (s[k] || 50), 0) / keys.length);
  return { 機動: avg("apm", "reflex", "positioning"), 攻擊: avg("accuracy", "courage", "decision"), 防禦: avg("positioning", "clutch", "resilience"), 反應: avg("reflex", "focus", "mapAware") };
};
const statusOf = (p) => ((p.energy ?? 100) < 30 ? "閒置" : p.status === "主力" ? "主力" : p.status || "預備隊");
const statusColor = (st) => (st === "主力" ? GC.green : st === "閒置" ? GC.red : st === "訓練中" ? GC.gold : GC.gray);

export default function RosterScreen({ onBack, onRecruit, onPlayer }) {
  const players = useProfileStore((s) => s.players) ?? [];
  const renamePlayer = useProfileStore((s) => s.renamePlayer);
  const setPlayerRole = useProfileStore((s) => s.setPlayerRole);
  const setPlayerStatus = useProfileStore((s) => s.setPlayerStatus);
  const [filter, setFilter] = useState("全部");
  const [selId, setSelId] = useState(null);
  const [editName, setEditName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const sel = players.find((p) => p.id === selId) || null;
  const filtered = players.filter((p) => {
    const e = p.energy ?? 100;
    if (filter === "全部") return true;
    if (filter === "訓練中") return Boolean(p.training) || (e < 85 && e >= 30);
    if (filter === "閒置") return e < 30;
    return statusOf(p) === filter;
  });

  return (
    <ManageFrame
      title="選手名單" subtitle="ROSTER" onBack={onBack}
      right={<span style={{ background: players.length >= ROSTER_CAP ? "rgba(239,68,68,0.15)" : "rgba(96,165,250,0.15)", color: players.length >= ROSTER_CAP ? GC.red : GC.blue, fontSize: 11, fontWeight: 800, borderRadius: 8, padding: "4px 10px", whiteSpace: "nowrap" }}>{players.length} / {ROSTER_CAP} 人</span>}
    >
      <div style={{ display: "flex", gap: 5, marginBottom: 12, overflowX: "auto" }}>
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 99, border: "none", cursor: "pointer", background: filter === f ? GC.gold : "rgba(255,255,255,0.06)", color: filter === f ? "#0a0b0f" : GC.gray, fontSize: 11, fontWeight: 700 }}>{f}</button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {filtered.map((p) => {
          const st = statusOf(p);
          const c = statusColor(st);
          const a = aggr(withDerivedStats(p));   // S27：顯示 derived（含天賦）
          const dp = withDerivedStats(p); const mp = calcPower(dp, "moba"), fp = calcPower(dp, "fps");
          return (
            <button key={p.id} onClick={() => { setSelId(p.id); setEditName(false); }}
              style={{ display: "flex", alignItems: "center", gap: 11, background: GC.card, border: `1px solid ${p.id === selId ? GC.purp : "rgba(255,255,255,0.06)"}`, borderRadius: 13, padding: "11px 13px", cursor: "pointer", textAlign: "left", width: "100%" }}>
              <PlayerAvatar player={p} size={46} ring={c} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "white", fontSize: 13, fontWeight: 800 }}>{p.name}</span>
                  {/* S26【A】：選手等級直接讀 profileStore 持久化值（賽後升級即時反映） */}
                  <span style={{ color: GC.gold, fontSize: 9, fontWeight: 800, background: "rgba(251,191,36,0.12)", borderRadius: 5, padding: "1px 5px" }}>Lv.{p.lv ?? 1}</span>
                  <span style={{ color: GC.gray, fontSize: 9 }}>{p.role}</span>
                  {personalityById(p.personality) && <span style={{ fontSize: 10 }}>{personalityById(p.personality).emoji}</span>}
                  {String(p.id).startsWith("r") && <span style={{ color: GC.green, fontSize: 7, fontWeight: 700 }}>🆕</span>}
                </div>
                <div style={{ display: "flex", gap: 7, marginTop: 3 }}>
                  {Object.entries(a).map(([k, v]) => (
                    <span key={k} style={{ fontSize: 8 }}>
                      <span style={{ color: GC.gray }}>{k}</span>{" "}
                      <span style={{ color: v >= 80 ? GC.gold : v >= 65 ? GC.green : "#a1a1aa", fontWeight: 700 }}>{v}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginBottom: 2 }}>
                  <span style={{ color: GC.purp, fontSize: 9, fontWeight: 700 }}>M{mp}</span>
                  <span style={{ color: "#fb923c", fontSize: 9, fontWeight: 700 }}>F{fp}</span>
                </div>
                <span style={{ background: `${c}22`, color: c, fontSize: 8, fontWeight: 700, borderRadius: 5, padding: "2px 6px" }}>{st}</span>
              </div>
            </button>
          );
        })}
      </div>

      {players.length < ROSTER_CAP && (
        <div onClick={onRecruit} style={{ textAlign: "center", color: GC.gray, fontSize: 10, marginTop: 14, padding: 12, border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 12, cursor: onRecruit ? "pointer" : "default" }}>
          還可招募 {ROSTER_CAP - players.length} 名選手 · 到「球探招募」挖掘新星
        </div>
      )}

      {sel && (() => {
        const pers = personalityById(sel.personality);
        const dsel = withDerivedStats(sel); const bp = bestPositions(dsel);
        const mp = calcPower(dsel, "moba"), fp = calcPower(dsel, "fps");
        const cond = sel.condition || "正常";
        const condColor = cond === "精神飽滿" ? GC.green : cond === "正常" ? "#d4d4d8" : cond === "疲勞" ? GC.gold : GC.red;
        // S26【A】：XP 進度由持久化 xp 推導（playerLevel 唯一刻度），與 Result receipt 同源
        const lp = calculateLevelProgress(sel.xp ?? 0, 0);
        return (
          <div onClick={() => setSelId(null)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(4px)" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380, width: "100%", background: GC.card2, borderRadius: 16, padding: 18, border: `1px solid ${GC.purp}`, maxHeight: "88vh", overflowY: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <PlayerAvatar player={sel} size={60} ring={condColor} radius={14} />
                <div style={{ flex: 1 }}>
                  <div style={{ color: "white", fontSize: 17, fontWeight: 900 }}>{sel.name}</div>
                  {/* S26【C】：移除靜態英雄綁定（英雄只在 MOBA 流程顯示）；【A】改顯示持久化 XP */}
                  <div style={{ color: GC.gray, fontSize: 10 }}>{sel.role} · Lv.{lp.newLevel} · XP {lp.xpIntoLevel}/{lp.xpForNextLevel}</div>
                  <div style={{ marginTop: 3, height: 3, width: 140, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, Math.round((lp.xpIntoLevel / lp.xpForNextLevel) * 100))}%`, background: `linear-gradient(90deg,${GC.blue},${GC.blueL})` }} />
                  </div>
                  {pers && <div style={{ marginTop: 3, fontSize: 10 }}>{pers.emoji} <span style={{ color: GC.purp, fontWeight: 700 }}>{pers.zh}</span></div>}
                </div>
                <button onClick={() => setSelId(null)} style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "none", cursor: "pointer", color: "#a1a1aa", fontSize: 14 }}>✕</button>
              </div>

              {onPlayer && (
                <button onClick={() => onPlayer(sel.id)}
                  style={{ width: "100%", background: "rgba(167,139,250,0.15)", border: `1px solid ${GC.purp}44`, borderRadius: 9, padding: "8px", cursor: "pointer", color: GC.purp, fontSize: 11, fontWeight: 800, marginBottom: 12 }}>
                  📋 開啟完整選手檔案
                </button>
              )}

              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <div style={{ flex: 1, background: "rgba(167,139,250,0.12)", borderRadius: 8, padding: 7 }}>
                  <div style={{ color: GC.purp, fontSize: 8 }}>MOBA 戰力</div>
                  <div style={{ color: "white", fontSize: 15, fontWeight: 800 }}>{mp}</div>
                  <div style={{ color: GC.gray, fontSize: 7 }}>適 {bp.moba.pos.replace("MOBA", "")}</div>
                </div>
                <div style={{ flex: 1, background: "rgba(251,146,60,0.12)", borderRadius: 8, padding: 7 }}>
                  <div style={{ color: "#fb923c", fontSize: 8 }}>FPS 戰力</div>
                  <div style={{ color: "white", fontSize: 15, fontWeight: 800 }}>{fp}</div>
                  <div style={{ color: GC.gray, fontSize: 7 }}>適 {bp.fps.pos.replace("FPS", "")}</div>
                </div>
                <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 7 }}>
                  <div style={{ color: GC.gray, fontSize: 8 }}>狀態</div>
                  <div style={{ color: condColor, fontSize: 12, fontWeight: 800 }}>{cond}</div>
                  <div style={{ color: GC.gray, fontSize: 7 }}>體力 {sel.energy ?? 100}</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginBottom: 12, fontSize: 10 }}>
                <span style={{ color: GC.gray }}>士氣 <span style={{ color: (sel.morale ?? 70) >= 85 ? GC.green : (sel.morale ?? 70) >= 65 ? "#d4d4d8" : GC.red, fontWeight: 700 }}>{sel.morale ?? 70}</span></span>
                <span style={{ color: GC.gray }}>潛力 <span style={{ color: GC.gold, fontWeight: 700 }}>{sel.potential ?? 80}</span></span>
                <span style={{ color: GC.gray }}>合約 <span style={{ color: "#d4d4d8", fontWeight: 700 }}>{sel.contract ?? 365}天</span></span>
              </div>

              {/* 改名 + 角色定位 + 主力/預備隊 */}
              <div style={{ background: GC.card, borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ color: GC.gray, fontSize: 9, width: 40 }}>選手名</span>
                  {editName ? (
                    <>
                      <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} maxLength={12}
                        style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: `1px solid ${GC.purp}`, borderRadius: 6, padding: "4px 8px", color: "white", fontSize: 12, outline: "none" }} />
                      <button onClick={() => { renamePlayer(sel.id, nameInput); setEditName(false); }}
                        style={{ background: GC.green, border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: "#fff", fontSize: 10, fontWeight: 700 }}>儲存</button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, color: "white", fontSize: 12, fontWeight: 700 }}>{sel.name}</span>
                      <button onClick={() => { setNameInput(sel.name); setEditName(true); }}
                        style={{ background: "rgba(167,139,250,0.15)", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: GC.purp, fontSize: 10, fontWeight: 700 }}>✏️ 改名</button>
                    </>
                  )}
                </div>

                <div style={{ color: GC.gray, fontSize: 9, marginBottom: 5 }}>角色定位（切換看適配性）</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
                  {MOBA_ROLES.map((rl) => {
                    const fit = posFit(dsel, "MOBA" + rl);
                    const isCur = sel.role === rl;
                    return (
                      <button key={rl} onClick={() => setPlayerRole(sel.id, rl)}
                        style={{ flex: "1 1 30%", padding: "6px 4px", borderRadius: 8, border: `1px solid ${isCur ? GC.purp : "rgba(255,255,255,0.08)"}`, background: isCur ? `${GC.purp}22` : "transparent", cursor: "pointer", textAlign: "center" }}>
                        <div style={{ color: isCur ? GC.purp : "#d4d4d8", fontSize: 10, fontWeight: 700 }}>{rl}</div>
                        <div style={{ color: fit >= 75 ? GC.green : fit >= 60 ? GC.gold : GC.gray, fontSize: 8 }}>適配 {fit}</div>
                      </button>
                    );
                  })}
                </div>

                <div style={{ color: GC.gray, fontSize: 9, marginBottom: 5 }}>出賽狀態</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {["主力", "預備隊"].map((st) => {
                    const isCur = (sel.status || "預備隊") === st;
                    return (
                      <button key={st} onClick={() => setPlayerStatus(sel.id, st)}
                        style={{ flex: 1, padding: "6px 4px", borderRadius: 8, border: `1px solid ${isCur ? GC.green : "rgba(255,255,255,0.08)"}`, background: isCur ? `${GC.green}22` : "transparent", cursor: "pointer", color: isCur ? GC.green : "#d4d4d8", fontSize: 10, fontWeight: 700 }}>{st}</button>
                    );
                  })}
                </div>
              </div>

              {/* 16 項能力（四分類） */}
              {STAT_CATS.map((cat) => (
                <div key={cat} style={{ marginBottom: 7 }}>
                  <div style={{ color: GC.gray, fontSize: 9, fontWeight: 700, marginBottom: 3 }}>{cat}</div>
                  {STAT_DEF.filter((s) => s.cat === cat).map((s) => {
                    const v = dsel.stats?.[s.key] ?? 50;   // S27：derived（含天賦）
                    const b = pers?.boost?.includes(s.key);
                    const n = pers?.nerf?.includes(s.key);
                    return (
                      <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ color: b ? GC.gold : n ? GC.red : "#a1a1aa", fontSize: 9, width: 52, flexShrink: 0 }}>{s.zh}{b ? "↑" : n ? "↓" : ""}</span>
                        <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${v}%`, background: v >= 80 ? GC.gold : v >= 65 ? GC.green : "#60a5fa" }} />
                        </div>
                        <span style={{ color: "white", fontSize: 9, fontFamily: "monospace", width: 20, textAlign: "right" }}>{v}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </ManageFrame>
  );
}
