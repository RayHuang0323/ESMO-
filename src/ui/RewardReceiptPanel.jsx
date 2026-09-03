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
import { StatGainList, LevelUpBadge } from "./GrowthUI.jsx";

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
  //  Club Progression v1：Club XP 也是 receipt 的一部分（`applyMatchProgress` 寫的），
  //  這裡**只顯示**，不重算。舊 receipt 沒有 `club` ⇒ 這一格自動不出現。
  const club = receipt.club ?? null;
  const players = receipt.players ?? [];
  const totals = receipt.totals ?? {};
  const settled = receipt.alreadyApplied;
  //  P1：全隊能力成長總點數。只是把 receipt 裡已有的差值加總，不重算成長。
  const statTotal = Math.round(
    players.reduce((s, p) => s + (Number(p.growth?.total) || 0), 0) * 10) / 10;

  return (
    <div style={box(accent)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 9, letterSpacing: "0.2em", color: GC.gray, fontWeight: 900 }}>賽後結算</span>
        <span style={{ fontSize: 8.5, fontWeight: 800, color: settled ? GC.gray : GC.green }}>
          {settled ? "✅ 本場已結算（不重複發放）" : "✅ 已入帳"}
        </span>
      </div>

      {/* 團隊獎勵 */}
      {/*  Fan System F0：移除「聲望」格。它從來沒有公式，收據裡永遠是 0 ⇒ 永遠顯示
           「聲望 —」。一個永遠不會動的欄位，比沒有這個欄位更誤導玩家。
           `reputation` 欄位本身保留在 save schema 裡（deprecated，見 TD-22）。 */}
      <div style={{ display: "grid", gridTemplateColumns: club ? "1fr 1fr 1fr" : "1fr 1fr", gap: 6, marginBottom: 8 }}>
        {[
          ["獎金", t.money > 0 ? `+$${wan(t.money)}` : "—", GC.green, null],
          ["粉絲", t.fans > 0 ? `+${t.fans}` : "—", accent, null],
          //  練習賽的 Club XP 是 0 ⇒ 顯示「—」而不是 +0，跟上面兩格一致。
          ...(club ? [["俱樂部 XP", club.xpGained > 0 ? `+${club.xpGained}` : "—", GC.purp, "receipt-club-xp"]] : []),
        ].map(([k, v, c, tid]) => (
          <div key={k} data-testid={tid ?? undefined} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "6px 4px", textAlign: "center" }}>
            <div style={{ color: GC.gray, fontSize: 8, fontWeight: 700 }}>{k}</div>
            <div style={{ color: c, fontSize: 12, fontWeight: 900, fontFamily: MONO }}>{v}</div>
          </div>
        ))}
      </div>

      {/*  俱樂部升級：只有真的跨級才出現一行，不做動畫、不占常駐空間。 */}
      {club?.leveledUp && (
        <div data-testid="receipt-club-levelup" style={{
          marginBottom: 8, padding: "5px 8px", borderRadius: 8,
          background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.35)",
          color: GC.purp, fontSize: 10, fontWeight: 900, textAlign: "center",
        }}>
          俱樂部升級 Lv.{club.levelBefore} → Lv.{club.levelAfter}
        </div>
      )}

      {/* 選手 XP / 升級 / 天賦點 */}
      {players.length > 0 ? (
        <>
          {players.map((p) => (
            <div key={p.playerId} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10.5, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", minWidth: 0 }}>
              {/* 第一列：誰、拿多少經驗、有沒有升級。手機窄寬度會自動換行，不橫向溢出。 */}
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, minWidth: 0 }}>
                <span style={{ color: "#e5e7eb", fontWeight: 700, maxWidth: 84, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                <span style={{ fontFamily: MONO, color: GC.blueL, fontWeight: 800 }}>+{p.xpGained} XP</span>
                {p.levelsGained > 0 ? (
                  <>
                    <LevelUpBadge from={p.previousLevel} to={p.newLevel} />
                    <span style={{ color: GC.purp, fontSize: 9, fontWeight: 800 }}>天賦 +{p.talentPointsGained}</span>
                  </>
                ) : (
                  <span style={{ color: GC.gray, fontSize: 9 }}>Lv.{p.newLevel}</span>
                )}
                <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.35)", fontSize: 8.5 }}>{(p.reasons ?? []).slice(0, 2).join(" · ")}</span>
              </div>
              {/* 第二列：Milestone P1 —— 本場實際的能力成長。
                  ⚠ 直接讀 receipt 的 `growth.gains`（= applyLevelGrowth 實際套用值），
                    畫面不重算；沒有成長就明說，不生成假的 +0。 */}
              <StatGainList
                gains={p.growth?.gains} compact
                emptyText={p.levelsGained > 0 ? "已達潛力上限，本次無能力成長" : null}
              />
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginTop: 6, color: GC.gray }}>
            <span>選手 XP 合計 <b style={{ color: GC.blueL, fontFamily: MONO }}>+{totals.xpGained ?? 0}</b></span>
            <span>
              升級 <b style={{ color: GC.gold }}>{totals.levelsGained ?? 0}</b>
              {" · "}天賦點 <b style={{ color: GC.purp }}>+{totals.talentPointsGained ?? 0}</b>
              {statTotal > 0 && <>{" · "}能力 <b style={{ color: GC.green }}>+{statTotal}</b></>}
            </span>
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
