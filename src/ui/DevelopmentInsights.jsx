// ============================================================================
//  ui/DevelopmentInsights.jsx — 戰隊發展解鎖的賽前資訊面板（Expansion v1）
//
//  ── 為什麼是共用元件 ─────────────────────────────────────────────────────
//  N2/N4（戰術傾向）與 N3/N5（賽前總覽）在 MOBA 與 CS 是**同一種面板**，
//  只有資料來源與地圖維度不同。四個畫面各寫一份 = 四份會各自漂移的樣式與文案。
//
//  ── 這兩個面板的硬邊界 ───────────────────────────────────────────────────
//  · **只顯示既有計數，不產生新事實。** 戰術傾向讀的是 Club Mastery 已經在
//    累積的 `tacticUsage` / `tacticIntent`（`mastery/clubMasteryState.js`），
//    賽前總覽只是把已解鎖的資訊聚合成一頁。
//  · **不解鎖任何戰術。** 解鎖戰術變體是 Club Mastery 的責任
//    （`mastery/tacticVariant.js`）；兩個系統都能解鎖會產生第二套 authority。
//  · **不影響 Online。** 這裡沒有任何值會流進 MatchEntryRequest／MatchSquad——
//    產品原則 `CAREER_OWNS_ROSTER / ONLINE_OWNS_MATCH`，資訊解鎖是 careerOnly。
//  · 快速練習天然不進計數：`recordTacticUsage` 在 practice 時直接返回。
//
//  純呈現層：不 import zustand／localStorage，不寫任何 state 到 Store。
// ============================================================================
import React, { useState } from "react";
import { GC, FONT, MONO } from "./theme.js";

/**
 * 戰術歷史表現（N2 MOBA／N4 CS）。
 *
 * @param {object[]} rows `{ id, name, games, intent }`——已由呼叫端從既有計數組好
 * @param {string}   scopeLabel 次要說明（CS 會帶目前地圖）
 */
export function TacticInsightPanel({ rows = [], color = GC.blueL, scopeLabel = null, testId = "tactic-insight" }) {
  const [open, setOpen] = useState(false);
  const played = rows.filter((r) => r.games > 0).sort((a, b) => b.games - a.games);
  const top = played[0] ?? null;
  const rate = (r) => (r.games > 0 ? Math.round((r.intent / r.games) * 100) : 0);
  return (
    <div data-testid={testId}
      style={{ background: GC.card, border: `1px solid ${color}44`, borderRadius: 10, padding: "9px 11px", marginBottom: 10 }}>
      <div style={{ color, fontSize: 10, fontWeight: 900 }}>戰術傾向{scopeLabel ? ` · ${scopeLabel}` : ""}</div>
      {played.length === 0 ? (
        <div style={{ color: GC.gray, fontSize: 9, lineHeight: 1.5, marginTop: 3 }}>
          還沒有正式比賽紀錄。打過正式賽之後，這裡會顯示每套戰術實際打下來的表現。
        </div>
      ) : (
        <>
          <div style={{ color: GC.gray, fontSize: 9, lineHeight: 1.5, marginTop: 3 }}>
            最常用：<span style={{ color: "#e5e7eb", fontWeight: 800 }}>{top.name}</span>
            　{top.games} 場・照計畫 {rate(top)}%
          </div>
          <button type="button" data-testid={`${testId}-toggle`} onClick={() => setOpen((v) => !v)}
            style={{ background: "transparent", border: "none", color, fontSize: 9, fontWeight: 900, cursor: "pointer", padding: "5px 0 0", minHeight: 32, fontFamily: FONT }}>
            {open ? "▾ 收起全部戰術" : "▸ 全部戰術"}
          </button>
          {open && (
            <div data-testid={`${testId}-detail`} style={{ display: "grid", gap: 4, marginTop: 3 }}>
              {played.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: GC.card2, borderRadius: 7, padding: "5px 8px" }}>
                  <span style={{ color: "#e5e7eb", fontSize: 9, fontWeight: 800, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  <span style={{ color: GC.gray, fontSize: 8.5, flexShrink: 0, fontFamily: MONO }}>
                    {r.games} 場 · <span style={{ color: rate(r) >= 50 ? GC.green : GC.gold }}>{rate(r)}%</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * 賽前總覽（N3 MOBA／N5 CS）—— capstone。
 *
 * ⚠ **不引入新資料**：`rows` 全部來自已經解鎖的既有資訊，這個面板的價值
 *   就是「聚合成一頁」，本身不產生任何新事實。
 *
 * @param {object[]} rows `{ label, value, tone }`（tone: "good" | "warn" | null）
 */
export function MatchOverviewPanel({ rows = [], color = GC.gold, testId = "match-overview", note = null }) {
  const toneColor = (tone) => (tone === "good" ? GC.green : tone === "warn" ? GC.gold : "#e5e7eb");
  return (
    <div data-testid={testId}
      style={{ background: GC.card, border: `1px solid ${color}44`, borderRadius: 10, padding: "9px 11px", marginBottom: 10 }}>
      <div style={{ color, fontSize: 10, fontWeight: 900 }}>賽前總覽</div>
      {note && <div style={{ color: GC.gray, fontSize: 9, lineHeight: 1.5, marginTop: 3 }}>{note}</div>}
      <div style={{ display: "grid", gap: 4, marginTop: 7 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <span style={{ color: GC.gray, fontSize: 8.5, whiteSpace: "nowrap" }}>{r.label}</span>
            <span style={{ color: toneColor(r.tone), fontSize: 9, fontWeight: 800, textAlign: "right" }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
