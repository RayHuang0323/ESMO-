// ============================================================================
//  screens/manage/ObjectivesScreen.jsx — 俱樂部目標（Retention v1．V7B）
//
//  ── 這一頁在回答一個問題：「我今天要做什麼？」──────────────────────────
//  改動前，玩家打開遊戲面對的是一堆入口，沒有一處給出**下一步**。
//  這一頁把三個時間尺度上的下一步攤開：今天／本週／本年度。
//
//  ⚠ **不做逐項紅點。** 首頁只有一個「可領取 N」的聚合徽章，本頁也只有一個
//    總計。規格明文擋掉「十幾個紅點任務」——紅點多了就不是提示，是噪音。
//  ⚠ 本頁**不算任何進度、不判任何規則**：目標、進度、可不可領全部來自
//    `profile.retentionView()`。畫面自己算一次就會與規則漂移。
//
//  手機優先：單欄、flex-wrap、minWidth:0，390px 不水平溢出。
// ============================================================================
import React, { useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { GC } from "../../ui/theme.js";

const SCOPE_META = {
  daily: { title: "今日目標", icon: "☀️", accent: "#60a5fa", note: "10–20 分鐘做得完；日子只有你自己推得動，沒有時限焦慮" },
  weekly: { title: "本週目標", icon: "📅", accent: "#a78bfa", note: "正常玩就會完成大部分——重點是輪替，不是刷場次" },
  season: { title: "賽季目標", icon: "🏆", accent: GC.gold, note: "四個目標都不需要冠軍；沒奪冠一樣有完整的賽季進度" },
};

function Bar({ percent, accent, done }) {
  return (
    <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 7 }}>
      <div style={{
        height: "100%", width: `${Math.max(2, percent)}%`, borderRadius: 99,
        background: done ? "#34d399" : accent, transition: "width .35s ease",
      }} />
    </div>
  );
}

function ObjectiveCard({ item, accent, onClaim }) {
  return (
    <div data-testid="objective-card" data-objective={item.defId} data-done={item.done ? "1" : "0"}
      style={{
        background: item.claimed ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.05)",
        border: `1px solid ${item.claimable ? "#34d39955" : "rgba(255,255,255,0.09)"}`,
        borderRadius: 12, padding: "10px 12px", marginBottom: 8, minWidth: 0,
        opacity: item.claimed ? 0.62 : 1,
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
        <span style={{ color: "#fff", fontSize: 12.5, fontWeight: 900, minWidth: 0 }}>{item.name}</span>
        {item.claimed && (
          <span style={{ fontSize: 9, fontWeight: 800, color: "#34d399", background: "rgba(52,211,153,0.14)", borderRadius: 6, padding: "2px 6px", whiteSpace: "nowrap" }}>
            已領取
          </span>
        )}
        <span style={{ marginLeft: "auto", color: item.done ? "#34d399" : "#a1a1aa", fontSize: 10.5, fontWeight: 800, fontFamily: "'Courier New',monospace", whiteSpace: "nowrap" }}>
          {item.text}
        </span>
      </div>
      <div style={{ color: "#8b8b95", fontSize: 10, marginTop: 3, minWidth: 0 }}>
        {item.desc}{item.detail ? `　·　${item.detail}` : ""}
      </div>
      <Bar percent={item.percent} accent={accent} done={item.done} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8, minWidth: 0 }}>
        <span style={{ color: GC.gold, fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" }}>
          ◆ {item.reward} 俱樂部點數
        </span>
        <button type="button"
          data-testid={`objective-claim-${item.defId}`}
          data-objective-id={item.id}
          disabled={!item.claimable}
          onClick={() => onClaim(item.id)}
          style={{
            marginLeft: "auto", borderRadius: 9, padding: "6px 14px",
            fontSize: 11, fontWeight: 900, whiteSpace: "nowrap",
            cursor: item.claimable ? "pointer" : "not-allowed",
            border: "none",
            background: item.claimable ? "linear-gradient(135deg,#34d399,#059669)" : "rgba(255,255,255,0.06)",
            color: item.claimable ? "#04180f" : "#52525b",
          }}>
          {item.claimed ? "已領取" : item.done ? "領取獎勵" : "進行中"}
        </button>
      </div>
    </div>
  );
}

export default function ObjectivesScreen({ onBack }) {
  const profile = useProfileStore();
  const [toast, setToast] = useState(null);
  //  ⚠ 唯一的資料來源。畫面不得自己抽目標或自己算進度。
  const view = profile.retentionView();

  const claim = (id) => {
    const r = useProfileStore.getState().claimRetentionObjective(id);
    setToast(r.ok ? `+${r.gained} 俱樂部點數` : (r.reason ?? "領取失敗"));
    window.setTimeout(() => setToast(null), 1800);
  };

  const tier = view.tier;

  return (
    <div data-testid="objectives-screen"
      style={{ minHeight: "100%", background: GC.bg ?? "#0a0b0f", color: "#fff", overflowX: "hidden" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "12px 12px 28px", boxSizing: "border-box" }}>

        {/* 頁首 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, minWidth: 0 }}>
          {onBack && (
            <button onClick={onBack} type="button" data-testid="objectives-back"
              style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${GC.line}`, borderRadius: 8, padding: "5px 10px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>←</button>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#fff", fontSize: 17, fontWeight: 900 }}>俱樂部目標</div>
            <div style={{ color: GC.gray, fontSize: 10 }}>今天／本週／本年度的下一步</div>
          </div>
        </div>

        {/*  俱樂部點數與聲望等級。
             ⚠ 聲望等級是**純展示**：不影響任何數值、不給戰力。
             日常目標不得產生永久戰力，那是 Retention v1 的紅線。 */}
        <div data-testid="club-points-card"
          style={{
            background: "linear-gradient(135deg,rgba(250,204,21,0.13),rgba(255,255,255,0.04))",
            border: `1px solid ${GC.gold}44`, borderRadius: 14, padding: "12px 14px", marginBottom: 14, minWidth: 0,
          }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", minWidth: 0 }}>
            <span style={{ fontSize: 19 }}>{tier.icon}</span>
            <div style={{ minWidth: 0 }}>
              <div data-testid="club-tier" style={{ color: "#fff", fontSize: 13.5, fontWeight: 900 }}>{tier.name}</div>
              <div style={{ color: "#a1a1aa", fontSize: 9.5 }}>俱樂部聲望．純榮譽展示，不影響戰力</div>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right", whiteSpace: "nowrap" }}>
              <div data-testid="club-points" style={{ color: GC.gold, fontSize: 17, fontWeight: 900, fontFamily: "'Courier New',monospace" }}>
                ◆ {tier.points}
              </div>
              <div style={{ color: "#8b8b95", fontSize: 9 }}>俱樂部點數</div>
            </div>
          </div>
          <Bar percent={tier.percent} accent={GC.gold} done={!tier.next} />
          <div style={{ color: "#8b8b95", fontSize: 9.5, marginTop: 6 }}>
            {tier.next ? `距離「${tier.next.name}」還差 ${tier.toNext} 點` : "已達最高聲望等級"}
          </div>
        </div>

        {/* 三個尺度 */}
        {view.groups.map((g) => {
          const m = SCOPE_META[g.scope];
          return (
            <section key={g.scope} data-testid={`objective-group-${g.scope}`} style={{ marginBottom: 16, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 7, minWidth: 0 }}>
                <span style={{ fontSize: 13 }}>{m.icon}</span>
                <span style={{ color: "#fff", fontSize: 13, fontWeight: 900 }}>{m.title}</span>
                <span style={{ color: "#71717a", fontSize: 9.5, fontFamily: "'Courier New',monospace", whiteSpace: "nowrap" }}>
                  {g.doneCount}/{g.items.length}
                </span>
                {g.claimable > 0 && (
                  <span style={{ fontSize: 9, fontWeight: 900, color: "#04180f", background: "#34d399", borderRadius: 6, padding: "2px 6px", whiteSpace: "nowrap" }}>
                    可領取 {g.claimable}
                  </span>
                )}
              </div>
              <div style={{ color: "#71717a", fontSize: 9.5, marginBottom: 8, minWidth: 0 }}>{m.note}</div>
              {g.items.map((item) => (
                <ObjectiveCard key={item.id} item={item} accent={m.accent} onClaim={claim} />
              ))}
            </section>
          );
        })}

        <div style={{ color: "#52525b", fontSize: 9.5, lineHeight: 1.7, marginTop: 4 }}>
          目標綁的是世界時間，不是真實時間——今天的目標只有你自己推進日曆才會換一批，
          所以離線不會失去任何進度。
        </div>

        {toast && (
          <div data-testid="objective-toast"
            style={{
              position: "fixed", left: "50%", bottom: 28, transform: "translateX(-50%)",
              background: "rgba(10,11,15,0.96)", border: `1px solid ${GC.gold}66`, borderRadius: 10,
              padding: "9px 16px", color: GC.gold, fontSize: 12, fontWeight: 900, zIndex: 60, whiteSpace: "nowrap",
            }}>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
