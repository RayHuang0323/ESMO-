// ============================================================================
//  screens/manage/NewGameScreen.jsx — 開新局／情境選擇（Milestone N3）
//
//  N2 定義了三種財務情境與各自的起始資金，但**沒有任何入口套用它們**
//  ⇒ 實際遊戲永遠是種子的 120 萬、永遠是 standard。本畫面就是那個入口。
//
//  ⚠ 破壞性動作：開新局會清掉整份存檔。兩段式確認（選情境 → 確認卡），
//    確認卡明講會失去什麼，不用 window.confirm。
//
//  數字全部來自 economyConfig 的 SCENARIOS 與 economy/salary.js，
//  **不在畫面另算一套**（Milestone N 的紅線）。
// ============================================================================
import React, { useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { SCENARIOS } from "../../platform/economy/economyConfig.js";
import { teamWeeklySalary } from "../../platform/economy/salary.js";
import { INITIAL_PLAYERS } from "../../data/players.js";
import { GC } from "../../ui/theme.js";
import ManageFrame from "./ManageFrame.jsx";

const TONE = {
  rookie: { emoji: "🌱", color: "#34d399", tag: "困難", desc: "營收薄、容錯低。一次失誤就可能見底。" },
  standard: { emoji: "⚔️", color: "#a78bfa", tag: "標準", desc: "正常經營可維持小幅盈餘，這是基準線。" },
  elite: { emoji: "👑", color: "#fbbf24", tag: "寬裕", desc: "盈餘明顯，但薪資基數大，贊助斷掉時跌得最重。" },
};

export default function NewGameScreen({ onBack, onDone }) {
  const startNewGame = useProfileStore((s) => s.startNewGame);
  const current = useProfileStore((s) => s.economy?.scenario);
  const [picked, setPicked] = useState(null);

  //  種子名單的週薪合計——讓玩家在選之前就看得到「這批人每週要花多少」
  const salary = teamWeeklySalary(INITIAL_PLAYERS).total;

  const confirm = () => {
    if (!picked) return;
    if (startNewGame(picked)) onDone?.();
  };

  return (
    <ManageFrame title="開新局" subtitle="NEW GAME" onBack={onBack}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ color: GC.gray, fontSize: 11, lineHeight: 1.7 }}>
          選擇戰隊的財務體質。差別在<b style={{ color: "white" }}>營收規模與營運成本</b>，
          不在選手能力——薪資一律由選手能力決定，所以強隊本來就比較貴。
        </div>

        {Object.values(SCENARIOS).map((sc) => {
          const t = TONE[sc.id] ?? TONE.standard;
          const on = picked === sc.id;
          const operating = sc.operatingBase + sc.operatingPerPlayer * INITIAL_PLAYERS.length;
          const net = sc.baselineWeekly - salary - operating;
          return (
            <button key={sc.id} onClick={() => setPicked(sc.id)} style={{
              background: on ? `linear-gradient(145deg,${t.color}22,${GC.card})` : GC.card,
              border: `1px solid ${on ? t.color : GC.line}`,
              borderRadius: 14, padding: "13px 14px", cursor: "pointer", textAlign: "left",
              transition: "border-color .15s, background .15s",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 20 }}>{t.emoji}</span>
                <span style={{ color: "white", fontSize: 14, fontWeight: 800 }}>{sc.name}</span>
                <span style={{ background: `${t.color}22`, color: t.color, fontSize: 9, fontWeight: 800, borderRadius: 6, padding: "2px 7px" }}>{t.tag}</span>
                {current === sc.id && <span style={{ color: GC.gray, fontSize: 9 }}>目前情境</span>}
              </div>
              <div style={{ color: GC.gray, fontSize: 10, marginBottom: 9, lineHeight: 1.6 }}>{t.desc}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[
                  { k: "起始資金", v: `$${sc.startingFunds}萬` },
                  { k: "基礎營收", v: `$${sc.baselineWeekly}萬/週` },
                  { k: "營運成本", v: `$${operating.toFixed(1)}萬/週` },
                  { k: "起手週淨額", v: `${net >= 0 ? "+" : "−"}$${Math.abs(net).toFixed(1)}萬/週`, c: net >= 0 ? GC.green : GC.red },
                ].map((x) => (
                  <div key={x.k} style={{ background: GC.card2, borderRadius: 8, padding: "6px 8px", minWidth: 0 }}>
                    <div style={{ color: GC.gray, fontSize: 9, marginBottom: 2 }}>{x.k}</div>
                    <div style={{ color: x.c ?? "white", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>{x.v}</div>
                  </div>
                ))}
              </div>
              <div style={{ color: GC.gray, fontSize: 9, marginTop: 7 }}>
                起手週淨額已扣掉種子五人週薪 ${salary}萬，尚未計入贊助與賽事獎金
              </div>
            </button>
          );
        })}

        {picked && (
          <div style={{ background: GC.card, border: `1px solid ${GC.red}66`, borderRadius: 14, padding: "13px 14px" }}>
            <div style={{ color: GC.red, fontSize: 12, fontWeight: 800, marginBottom: 6 }}>⚠ 開新局會清除目前存檔</div>
            <div style={{ color: GC.gray, fontSize: 10, lineHeight: 1.8, marginBottom: 11 }}>
              以下資料會全部重來：選手狀態與天賦、資金與交易帳本、贊助合約、
              賽績紀錄、週結算帳本、收件匣。此動作無法復原。
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setPicked(null)} style={{
                flex: 1, background: GC.card2, border: `1px solid ${GC.line}`, borderRadius: 10,
                padding: "11px", cursor: "pointer", color: "white", fontSize: 12, fontWeight: 700,
              }}>取消</button>
              <button onClick={confirm} style={{
                flex: 2, background: `linear-gradient(135deg,${GC.red},#b91c1c)`, border: "none", borderRadius: 10,
                padding: "11px", cursor: "pointer", color: "white", fontSize: 12, fontWeight: 800,
              }}>確認以「{SCENARIOS[picked].name}」開新局</button>
            </div>
          </div>
        )}
      </div>
    </ManageFrame>
  );
}
