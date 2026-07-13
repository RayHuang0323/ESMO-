// ============================================================================
//  ui/RewardReceiptPanel.jsx — 賽後結算收據（Sprint25，MOBA / CS 共用）
//
//  這個元件**只顯示 receipt**，不重算任何獎勵、不寫任何 Store。
//  receipt = applyMatchProgress 實際套用後回傳的真實差額
//    ⇒ 畫面顯示值與 Store 寫入值不可能分離（這正是 Sprint25 要解的問題之一）。
//
//  「本場已結算」：receipt.alreadyApplied 為 true（重整 / 返回再進 Result / StrictMode
//  雙掛載都會走到這裡）→ 明確標示，且**不再播放成長動畫、不再發獎**。
// ============================================================================
import React from "react";
import { GC, MONO } from "./theme.js";

const wan = (n) => `${Math.round(n / 10000)}萬`;

export default function RewardReceiptPanel({ receipt, accent = GC.gold }) {
  if (!receipt) {
    return (
      <div style={box()}>
        <div style={{ color: GC.gray, fontSize: 10, textAlign: "center", padding: "8px 0" }}>結算中…</div>
      </div>
    );
  }
  if (receipt.ok === false) {
    return (
      <div style={box(GC.red)}>
        <div style={{ color: GC.red, fontSize: 10, fontWeight: 800, marginBottom: 4 }}>⚠ 結算未完成（未發獎）</div>
        {(receipt.errors ?? []).slice(0, 3).map((e, i) => (
          <div key={i} style={{ color: GC.gray, fontSize: 9 }}>· {e}</div>
        ))}
      </div>
    );
  }

  const t = receipt.team ?? {};
  const players = receipt.players ?? [];
  const totals = receipt.totals ?? {};
  const settled = receipt.alreadyApplied;

  return (
    <div style={box(accent)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 9, letterSpacing: "0.2em", color: GC.gray, fontWeight: 900 }}>賽後結算</span>
        <span style={{ fontSize: 8.5, fontWeight: 800, color: settled ? GC.gray : GC.green }}>
          {settled ? "✅ 本場已結算（不重複發放）" : "✅ 已入帳"}
        </span>
      </div>

      {/* 團隊獎勵 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
        {[
          ["獎金", t.money > 0 ? `+$${wan(t.money)}` : "—", GC.green],
          ["粉絲", t.fans > 0 ? `+${t.fans}` : "—", accent],
          ["聲望", t.reputation > 0 ? `+${t.reputation}` : "—", GC.gray],
        ].map(([k, v, c]) => (
          <div key={k} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "6px 4px", textAlign: "center" }}>
            <div style={{ color: GC.gray, fontSize: 8, fontWeight: 700 }}>{k}</div>
            <div style={{ color: c, fontSize: 12, fontWeight: 900, fontFamily: MONO }}>{v}</div>
          </div>
        ))}
      </div>

      {/* 選手 XP / 升級 / 天賦點 */}
      {players.length > 0 ? (
        <>
          {players.map((p) => (
            <div key={p.playerId} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ color: "#e5e7eb", fontWeight: 700, width: 62, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              <span style={{ fontFamily: MONO, color: GC.blueL, fontWeight: 800 }}>+{p.xpGained} XP</span>
              {p.levelsGained > 0 ? (
                <span style={{ color: GC.gold, fontSize: 9.5, fontWeight: 900 }}>
                  ⬆ Lv.{p.previousLevel}→{p.newLevel}　天賦 +{p.talentPointsGained}
                </span>
              ) : (
                <span style={{ color: GC.gray, fontSize: 9 }}>Lv.{p.newLevel}</span>
              )}
              <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.35)", fontSize: 8.5 }}>{(p.reasons ?? []).slice(0, 2).join(" · ")}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginTop: 6, color: GC.gray }}>
            <span>選手 XP 合計 <b style={{ color: GC.blueL, fontFamily: MONO }}>+{totals.xpGained ?? 0}</b></span>
            <span>升級 <b style={{ color: GC.gold }}>{totals.levelsGained ?? 0}</b> · 天賦點 <b style={{ color: GC.purp }}>+{totals.talentPointsGained ?? 0}</b></span>
          </div>
        </>
      ) : (
        <div style={{ color: GC.gray, fontSize: 9.5, textAlign: "center", padding: "6px 0" }}>
          本場無經營名單選手上場（引擎預設陣容）→ 不發選手 XP
        </div>
      )}
    </div>
  );
}

const box = (accent = GC.line) => ({
  background: "rgba(8,14,24,0.9)",
  border: `1px solid ${accent === GC.line ? GC.line : accent + "55"}`,
  borderRadius: 12,
  padding: "10px 13px",
});
