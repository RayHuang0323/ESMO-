// ============================================================================
//  screens/manage/TeamDevelopmentScreen.jsx — 戰隊發展 v1
//
//  這裡是俱樂部層的投資入口；節點只改經營效率或解鎖準備資訊，
//  不直接修改選手能力，也不把玩家重新導回個人天賦樹。
// ============================================================================
import React, { useMemo, useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import {
  TEAM_DEVELOPMENT_CATEGORIES,
  teamDevelopmentNodeById,
  teamDevelopmentNodesByCategory,
  sanitizeTeamDevelopment,
} from "../../platform/development/teamDevelopment.js";
import { GC, FONT, MONO } from "../../ui/theme.js";
import ManageFrame from "./ManageFrame.jsx";

const STATUS = {
  locked: { label: "未解鎖", color: GC.gray },
  available: { label: "可升級", color: GC.blueL },
  active: { label: "已解鎖", color: GC.green },
  maxed: { label: "滿級", color: GC.gold },
};

const categoryOf = (id) => TEAM_DEVELOPMENT_CATEGORIES.find((cat) => cat.id === id);
const colorOf = (cat) => GC[cat?.colorKey] ?? GC.gray;

function nodeStatus(state, node) {
  const rank = state.ranks[node.id] ?? 0;
  if (rank >= node.maxRank) return "maxed";
  if (node.prerequisites.some((pre) => (state.ranks[pre.nodeId] ?? 0) < pre.minRank)) return "locked";
  return state.availablePoints >= node.costPerRank ? "available" : "locked";
}

function primaryDirection(state) {
  const entries = Object.entries(state.ranks);
  if (!entries.length) return "尚未選定";
  const top = entries.reduce((best, [id, rank]) => {
    const node = teamDevelopmentNodeById(id);
    if (!node) return best;
    return !best || rank > best.rank ? { category: node.category, rank } : best;
  }, null);
  return categoryOf(top.category)?.zh ?? "尚未選定";
}

export default function TeamDevelopmentScreen({ onBack }) {
  const rawState = useProfileStore((s) => s.teamDevelopment);
  const purchase = useProfileStore((s) => s.purchaseTeamDevelopment);
  const state = useMemo(() => sanitizeTeamDevelopment(rawState), [rawState]);
  const [tab, setTab] = useState("general");
  const [confirmId, setConfirmId] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const cat = categoryOf(tab);
  const nodes = teamDevelopmentNodesByCategory(tab);
  const confirmNode = confirmId ? teamDevelopmentNodeById(confirmId) : null;

  const confirmPurchase = () => {
    if (!confirmNode) return;
    const result = purchase(confirmNode.id);
    setReceipt(result);
    if (result.success) setConfirmId(null);
  };

  return (
    <ManageFrame title="戰隊發展" subtitle="TEAM DEVELOPMENT" onBack={onBack}
      right={<span style={{ background: `${GC.gold}18`, color: GC.gold, fontSize: 11, fontWeight: 900, borderRadius: 8, padding: "4px 10px", whiteSpace: "nowrap" }}>{state.availablePoints} 發展點</span>}>
      <div style={{ background: `linear-gradient(135deg,${GC.card2},rgba(59,130,246,0.12))`, border: `1px solid ${GC.blueL}33`, borderRadius: 14, padding: "13px 14px", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: GC.blueL, fontSize: 10, fontWeight: 900, letterSpacing: "0.14em" }}>俱樂部長期方向</div>
            <div style={{ color: "white", fontSize: 19, fontWeight: 950, marginTop: 2 }}>{primaryDirection(state)}</div>
            <div style={{ color: GC.gray, fontSize: 9.5, lineHeight: 1.6, marginTop: 4 }}>戰隊發展只處理效率、備戰資訊與資源支援；選手能力提升仍交給訓練。</div>
          </div>
          <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
            <div><div style={{ color: GC.gray, fontSize: 8 }}>可用發展點</div><div style={{ color: GC.gold, fontSize: 17, fontWeight: 900, fontFamily: MONO }}>{state.availablePoints}</div></div>
            <div><div style={{ color: GC.gray, fontSize: 8 }}>已投入點數</div><div style={{ color: GC.green, fontSize: 17, fontWeight: 900, fontFamily: MONO }}>{state.spentPoints}</div></div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 3, marginBottom: 10 }}>
        {TEAM_DEVELOPMENT_CATEGORIES.map((item) => {
          const active = tab === item.id;
          const c = colorOf(item);
          return <button key={item.id} data-testid={`development-tab-${item.id}`} onClick={() => { setTab(item.id); setConfirmId(null); }}
            style={{ flex: "1 0 78px", border: `1px solid ${active ? c : GC.line}`, borderRadius: 9, padding: "8px 8px", background: active ? `${c}1c` : GC.card, color: active ? c : GC.gray, cursor: "pointer", fontSize: 11, fontWeight: 900 }}>
            {item.emoji} {item.zh}
          </button>;
        })}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
        <div style={{ color: colorOf(cat), fontSize: 12, fontWeight: 900 }}>{cat.emoji} {cat.zh}</div>
        <div style={{ color: GC.gray, fontSize: 9 }}>{cat.description}</div>
      </div>

      {receipt && (
        <div style={{ background: receipt.success ? `${GC.green}12` : `${GC.red}12`, border: `1px solid ${(receipt.success ? GC.green : GC.red)}44`, borderRadius: 9, padding: "8px 10px", color: receipt.success ? GC.green : GC.red, fontSize: 10, fontWeight: 800, marginBottom: 8 }}>
          {receipt.success ? `✓ 已解鎖「${teamDevelopmentNodeById(receipt.nodeId)?.name ?? "發展節點"}」` : `⚠ ${receipt.failureReason}`}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(260px,100%),1fr))", gap: 8 }}>
        {nodes.map((node) => {
          const c = colorOf(cat);
          const rank = state.ranks[node.id] ?? 0;
          const status = STATUS[nodeStatus(state, node)];
          const selected = confirmId === node.id;
          return (
            <div key={node.id} data-testid={`development-node-${node.id}`} style={{ background: selected ? GC.card2 : GC.card, border: `1px solid ${selected ? c : status.color + "55"}`, borderRadius: 11, padding: "10px 11px", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "white", fontSize: 12, fontWeight: 900, overflowWrap: "break-word" }}>{node.name}</div>
                  <div style={{ color: GC.gray, fontSize: 9.5, lineHeight: 1.55, marginTop: 4 }}>{node.description}</div>
                </div>
                <span style={{ color: status.color, border: `1px solid ${status.color}55`, borderRadius: 5, padding: "2px 5px", fontSize: 8, fontWeight: 900, flexShrink: 0 }}>{status.label}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 9 }}>
                <span style={{ color: GC.gray, fontSize: 9, fontFamily: MONO }}>Lv.{rank}/{node.maxRank} · {node.costPerRank} 點</span>
                {status.label === "可升級" && <button onClick={() => setConfirmId(selected ? null : node.id)} style={{ background: `${c}1c`, border: `1px solid ${c}66`, borderRadius: 7, color: c, padding: "5px 9px", fontSize: 9, fontWeight: 900, cursor: "pointer" }}>查看升級</button>}
              </div>
              {node.prerequisites.length > 0 && <div style={{ color: status.label === "未解鎖" ? GC.gray : c, fontSize: 8.5, marginTop: 5 }}>前置：{node.prerequisites.map((pre) => teamDevelopmentNodeById(pre.nodeId)?.name).join("、")}</div>}
              {selected && status.label === "可升級" && (
                <div style={{ marginTop: 8, borderTop: `1px solid ${c}33`, paddingTop: 8 }}>
                  <div style={{ color: "#e5e7eb", fontSize: 10, fontWeight: 800, marginBottom: 6 }}>確認投入 {node.costPerRank} 發展點？</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={confirmPurchase} style={{ background: c, border: "none", borderRadius: 7, color: "#0a0b0f", padding: "6px 11px", fontSize: 9, fontWeight: 900, cursor: "pointer" }}>確認解鎖</button>
                    <button onClick={() => setConfirmId(null)} style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${GC.line}`, borderRadius: 7, color: GC.gray, padding: "6px 11px", fontSize: 9, fontWeight: 800, cursor: "pointer" }}>取消</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ color: GC.gray, fontSize: 8.5, lineHeight: 1.55, marginTop: 11 }}>發展點與個人天賦點分開計算；重複按下升級只會由同一個 reducer 判定一次，不會重複扣點。</div>
      <style>{`*::-webkit-scrollbar{display:none}`}</style>
    </ManageFrame>
  );
}
