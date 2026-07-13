// ============================================================================
//  screens/moba/TacticScreen.jsx — MOBA 戰術（Sprint12 建 → Sprint24 全面升級）
//
//  Sprint24 三件事：
//  1. 跑版根因修復：舊版內容根節點是固定 width:560 的 flex 列＋固定 200px 詳解欄
//     → 360px 手機直接溢出、1920 桌機永遠窄條。改為 width:100% + maxWidth +
//     grid auto-fill（手機單欄 / 平板 2-3 欄 / 桌機多欄），詳解全寬自然換行，
//     無固定高度、無水平捲軸。
//  2. 資料來源改為正式契約 platform/contracts/MobaTacticConfig.js（MOBA_TACTICS，
//     Legacy m1–m8 名稱與文案逐字保留）——資料不再散落本 component。
//  3. 適性 = 真實資料：tactic.fit（角色×能力鍵）對 profileStore.players 的 16 項
//     能力取平均（無硬編碼百分比）；引擎效果 = describeEngineEffects（由 knobs
//     與中性值比較自動生成，與引擎實際吃到的參數同源，不會漂移）。
//
//  戰術自 Sprint24 起「真的」進引擎：onNext(cur) → AppShell → GameView →
//  useLocalServer.start({tactic}) → engine.configureMatch。
// ============================================================================
import React, { useMemo, useState } from "react";
import { Frame } from "./LineupScreen.jsx";
import { MOBA_TACTICS, toEngineTactic, STANDARD_OPP_TACTIC } from "../../platform/contracts/MobaTacticConfig.js";
import { useProfileStore } from "../../platform/profileStore.js";
import { statZh } from "../../data/playerModel.js";
import { GC } from "../../ui/theme.js";

const riskC = (r) => (r === "高" ? GC.red : r === "中" ? GC.gold : GC.green);

/** 適性：fit.roles 的主力選手在 fit.stats 上的平均（profileStore 真實 16 項能力） */
function fitScore(t, players) {
  const pool = players.filter((p) => t.fit.roles.includes(p.role));
  const vals = [];
  for (const p of pool) for (const k of t.fit.stats) { const v = p?.stats?.[k]; if (v != null) vals.push(v); }
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}
const fitGrade = (s) => (s == null ? { g: "—", c: GC.gray } : s >= 80 ? { g: "高", c: GC.green } : s >= 70 ? { g: "中", c: GC.gold } : { g: "低", c: GC.red });

/** 引擎效果摘要：knobs 與中性（對手 standard）比較，自動生成（與引擎輸入同源） */
function engineEffects(t) {
  const k = toEngineTactic(t), n = toEngineTactic(STANDARD_OPP_TACTIC);
  const out = [];
  const d = (a, b) => a - b;
  if (Math.abs(d(k.joinFight, n.joinFight)) >= 0.03) out.push(`團戰參與 ${k.joinFight > n.joinFight ? "↑" : "↓"}`);
  if (Math.abs(d(k.dragonJoin, n.dragonJoin)) >= 0.04) out.push(`小龍集結 ${k.dragonJoin > n.dragonJoin ? "↑" : "↓"}`);
  if (Math.abs(d(k.baronJoin, n.baronJoin)) >= 0.04) out.push(`巴龍集結 ${k.baronJoin > n.baronJoin ? "↑" : "↓"}`);
  if (Math.abs(d(k.retreatAt, n.retreatAt)) >= 0.02) out.push(k.retreatAt < n.retreatAt ? "撤退更晚（高風險）" : "撤退更早（保守）");
  const off = Object.entries(k.laneOffset).filter(([, v]) => Math.abs(v) >= 0.03);
  if (off.length) out.push(`推線深度 ${off.map(([l, v]) => `${{ top: "上", mid: "中", bot: "下" }[l]}${v > 0 ? "↑" : "↓"}`).join("")}`);
  if (k.splitLane) out.push(`${{ top: "上路", mid: "中路", bot: "下路" }[k.splitLane]}帶線分推（${Math.round(k.splitPush * 100)}%）`);
  if (k.gankInterval < n.gankInterval) out.push("Gank 節奏加快"); else if (k.gankInterval > n.gankInterval) out.push("Gank 節奏放慢");
  const gw = Object.entries(k.gankWeights).filter(([, v]) => v > 1.2);
  if (gw.length) out.push(`Gank 偏重${gw.map(([l]) => ({ top: "上", mid: "中", bot: "下" }[l])).join("/")}路`);
  if (k.invadeChance >= 0.3) out.push(`開局入侵（${Math.round(k.invadeChance * 100)}%${k.invadeWithMid ? "，中路跟進" : ""}）`);
  if (k.roamRate >= 0.45) out.push("輔助頻繁遊走");
  return out;
}

export default function TacticScreen({ onNext, onBack }) {
  const [sel, setSel] = useState("m1");
  const allPlayers = useProfileStore((s) => s.players) ?? [];
  const starters = useMemo(() => allPlayers.filter((p) => p.status === "主力"), [allPlayers]);
  const cur = MOBA_TACTICS.find((t) => t.tacticId === sel);
  const curFit = fitScore(cur, starters);
  const curFG = fitGrade(curFit);
  const effects = engineEffects(cur);

  return (
    <Frame title="戰術" sub="TEAM STRATEGY · 8 套戰術 · 實際影響對戰" onBack={onBack} onNext={() => onNext && onNext(cur)} nextLabel="開始載入 →">
      <div style={{ width: "100%", maxWidth: 940, padding: "0 14px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        {/* 戰術卡：auto-fill 響應式（手機 1 欄 / 平板 2-3 欄 / 桌機 4 欄），高度隨內容 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 8 }}>
          {MOBA_TACTICS.map((t) => {
            const isSel = sel === t.tacticId;
            const fg = fitGrade(fitScore(t, starters));
            return (
              <button key={t.tacticId} onClick={() => setSel(t.tacticId)} style={{ textAlign: "left", minWidth: 0, background: isSel ? GC.card2 : GC.card, border: `1px solid ${isSel ? GC.blueL : GC.line}`, borderRadius: 10, padding: "9px 11px", color: "#fff", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 900, minWidth: 0 }}>{t.emoji} {t.name}</span>
                  <span style={{ flexShrink: 0, fontSize: 8.5, fontWeight: 800, color: riskC(t.risk), border: `1px solid ${riskC(t.risk)}55`, borderRadius: 4, padding: "0 4px" }}>{t.risk}風險</span>
                </div>
                <div style={{ fontSize: 9.5, color: GC.gray, marginTop: 3, lineHeight: 1.5 }}>{t.desc}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
                  <span style={{ fontSize: 8.5, color: GC.purp }}>核心 {t.focus}</span>
                  <span style={{ marginLeft: "auto", fontSize: 8.5, fontWeight: 800, color: fg.c }}>適性 {fg.g}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* 詳解：全寬、自然換行、無固定高度 */}
        <div style={{ background: GC.card, border: `1px solid ${GC.blueL}44`, borderRadius: 12, padding: "12px 16px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 24 }}>{cur.emoji}</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: GC.blueL }}>{cur.name}</span>
            <span style={{ fontSize: 9, color: GC.purp, border: `1px solid ${GC.purp}55`, borderRadius: 5, padding: "1px 6px" }}>{cur.archetype}</span>
            <span style={{ fontSize: 9, color: riskC(cur.risk), border: `1px solid ${riskC(cur.risk)}55`, borderRadius: 5, padding: "1px 6px" }}>{cur.risk}風險</span>
            <span style={{ fontSize: 9, fontWeight: 800, color: curFG.c, border: `1px solid ${curFG.c}55`, borderRadius: 5, padding: "1px 6px" }}>我隊適性 {curFG.g}{curFit != null ? `（${curFit}）` : ""}</span>
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", lineHeight: 1.7, marginTop: 8, overflowWrap: "break-word" }}>
            <span style={{ color: GC.green, fontWeight: 800 }}>優勢：</span>{cur.detail}
          </div>
          {cur.cons && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.7, marginTop: 4, overflowWrap: "break-word" }}>
              <span style={{ color: GC.red, fontWeight: 800 }}>缺點：</span>{cur.cons}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 10 }}>
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <div style={{ fontSize: 9, letterSpacing: "0.15em", color: GC.gray, fontWeight: 900, marginBottom: 4 }}>引擎效果（行為權重，非加傷）</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {effects.map((e, i) => (
                  <span key={i} style={{ fontSize: 9.5, color: "#c4b5fd", background: "rgba(124,58,237,0.14)", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 6, padding: "2px 8px" }}>{e}</span>
                ))}
              </div>
            </div>
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <div style={{ fontSize: 9, letterSpacing: "0.15em", color: GC.gray, fontWeight: 900, marginBottom: 4 }}>適性依據（{cur.fit.roles.join("、") || "—"} 的真實能力）</div>
              <div style={{ fontSize: 9.5, color: GC.gray, lineHeight: 1.6, overflowWrap: "break-word" }}>
                {cur.fit.stats.map(statZh).join("、") || "—"}
                <span style={{ color: "#5a606e" }}>　·　適性僅供建議，不直接決定勝負</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}
