// ============================================================================
//  screens/dashboard/RestPlannerPanel.jsx — 首頁「體力管理」面板（Battle Condition UX）
//
//  問題：首頁早就會提醒「選手體力過低」，但點下去只是跳到名單，玩家還要自己
//  走到訓練中心、一個一個指派休息。提醒與可以做的事之間隔了三個畫面。
//
//  這個面板讓玩家在提醒原地就把休息排掉：單選／多選／全選 → 一次指派。
//
//  ⚠ 只呼叫**既有的正式動作** `assignTraining(playerId, "rest")`
//    （TRAINING_COURSES 的 `rest` 課程：1 天、0 費用、由 applyCourse 回體力）。
//    這裡**不直接改 energy**、不建立第二套恢復系統、也**不推進世界時間**——
//    休息要生效仍然得由玩家自己推進日期（提示文字寫清楚）。
//  ⚠ 體力**不再**擋出賽（見 platform/condition/playerCondition.js）：
//    這個面板是「想讓他回復」的工具，不是「不休息就不能打」的關卡。
// ============================================================================
import React, { useMemo, useState } from "react";
import { GC } from "../../ui/theme.js";
import { conditionSummary, CONDITION } from "../../platform/condition/playerCondition.js";

const rowStyle = (checked) => ({
  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
  borderRadius: 10, cursor: "pointer",
  background: checked ? "rgba(96,165,250,.14)" : "rgba(255,255,255,.03)",
  border: `1px solid ${checked ? "rgba(96,165,250,.55)" : "rgba(255,255,255,.08)"}`,
});

export default function RestPlannerPanel({ players = [], onAssignRest, onClose, onOpenTraining = null }) {
  const candidates = useMemo(
    () => players.map((p) => ({ player: p, summary: conditionSummary(p), resting: !!p.training })),
    [players],
  );
  const [selected, setSelected] = useState(() => new Set(candidates.filter((c) => !c.resting).map((c) => c.player.id)));
  const [result, setResult] = useState(null);

  const selectable = candidates.filter((c) => !c.resting);
  const allSelected = selectable.length > 0 && selectable.every((c) => selected.has(c.player.id));
  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(() => (allSelected ? new Set() : new Set(selectable.map((c) => c.player.id))));

  const assign = () => {
    const ids = [...selected];
    let ok = 0, skipped = 0;
    for (const id of ids) {
      if (onAssignRest?.(id)) ok += 1; else skipped += 1;
    }
    setResult({ ok, skipped });
    setSelected(new Set());
  };

  return (
    <div className="esmo-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="esmo-modal" role="dialog" aria-modal="true" aria-labelledby="esmo-rest-title"
        data-testid="rest-planner" onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: 460, width: "92vw" }}>
        <h2 className="esmo-modal__title" id="esmo-rest-title">體力管理</h2>
        <p className="esmo-modal__body" style={{ marginBottom: 8 }}>
          體力低於 {CONDITION.lowEnergyBelow} 的選手仍然可以出賽，但本場能力會下降。
          勾選要安排「休息調整」的人（1 天、免費），推進日期後生效。
        </p>

        {candidates.length === 0 ? (
          <p className="esmo-modal__body" data-testid="rest-planner-empty">目前沒有需要休息的選手。</p>
        ) : (
          <>
            <button type="button" data-testid="rest-select-all" onClick={toggleAll}
              disabled={selectable.length === 0}
              style={{
                marginBottom: 8, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                background: "transparent", color: GC.blue, border: `1px solid ${GC.blue}66`, fontSize: 12,
              }}>
              {allSelected ? "取消全選" : `全選（${selectable.length} 人）`}
            </button>
            <div style={{ display: "grid", gap: 6, maxHeight: "46vh", overflowY: "auto" }}>
              {candidates.map(({ player, summary, resting }) => {
                const checked = selected.has(player.id);
                return (
                  <label key={player.id} data-testid="rest-player-row" data-player={player.id}
                    style={{ ...rowStyle(checked), opacity: resting ? 0.6 : 1 }}>
                    <input type="checkbox" checked={checked} disabled={resting}
                      onChange={() => toggle(player.id)} data-testid="rest-player-check" />
                    <span style={{ flex: 1, fontWeight: 700 }}>{player.name}</span>
                    <span style={{ color: GC.gray, fontSize: 12 }}>{player.role ?? ""}</span>
                    <span style={{ color: summary.energy < 20 ? GC.red : GC.gold, fontSize: 12, fontWeight: 800 }}>
                      體力 {summary.energy}
                    </span>
                    <span style={{ color: GC.gray, fontSize: 11 }} data-testid="rest-player-fatigue">
                      能力 {summary.fatiguePercent}%
                    </span>
                    {resting && <span style={{ color: GC.green, fontSize: 11 }}>已安排</span>}
                  </label>
                );
              })}
            </div>
          </>
        )}

        {result && (
          <p className="esmo-modal__body" data-testid="rest-planner-result" style={{ color: GC.green, marginTop: 8 }}>
            已安排 {result.ok} 人休息{result.skipped > 0 ? `（${result.skipped} 人已有訓練安排，略過）` : ""}。
            推進 1 天後生效。
          </p>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button type="button" data-testid="rest-assign" onClick={assign} disabled={selected.size === 0}
            style={{
              padding: "8px 14px", borderRadius: 10, fontWeight: 800, cursor: selected.size ? "pointer" : "default",
              background: selected.size ? GC.green : "rgba(255,255,255,.08)",
              color: selected.size ? "#04140a" : GC.gray, border: "none",
            }}>
            安排休息（{selected.size}）
          </button>
          {onOpenTraining && (
            <button type="button" data-testid="rest-open-training" onClick={onOpenTraining}
              style={{
                padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontSize: 13,
                background: "transparent", color: GC.blue, border: `1px solid ${GC.blue}66`,
              }}>
              到訓練中心
            </button>
          )}
          <button className="esmo-modal__close" type="button" onClick={onClose}>關閉</button>
        </div>
      </div>
    </div>
  );
}
