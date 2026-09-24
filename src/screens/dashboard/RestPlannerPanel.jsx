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
//
//  ── hotfix/cs-loading-rest-ux ──────────────────────────────────────────────
//  舊版把 `!!player.training` 一律顯示成「已安排」並鎖死整列。但 `training` 代表
//  **任何**進行中的課程——訓練會扣體力，所以低體力的人常常正好在上課 ⇒ 整片不能勾。
//  現在每一列都講清楚是哪一種（`restBookingOf`）：
//    可安排 ⇒ 可以勾；已安排休息／訓練中：課名 ⇒ 不能重複安排（store 本來就會拒絕），
//    但給「調整」⇒ 訓練中心（那裡有既有的取消課程）。全選只選「可安排」的人。
// ============================================================================
import React, { useMemo, useState } from "react";
import { GC } from "../../ui/theme.js";
import { conditionSummary, CONDITION } from "../../platform/condition/playerCondition.js";
import { restBookingOf } from "../../platform/condition/restBooking.js";

const rowStyle = (checked, booked) => ({
  display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px 10px", padding: "8px 10px",
  borderRadius: 10, cursor: booked ? "default" : "pointer",
  background: checked ? "rgba(96,165,250,.14)" : "rgba(255,255,255,.03)",
  border: `1px solid ${checked ? "rgba(96,165,250,.55)" : "rgba(255,255,255,.08)"}`,
});
const KIND_COLOR = { rest: GC.green, training: GC.purp ?? "#a78bfa" };

export default function RestPlannerPanel({ players = [], onAssignRest, onClose, onOpenTraining = null }) {
  const candidates = useMemo(
    () => players.map((p) => ({ player: p, summary: conditionSummary(p), booking: restBookingOf(p) })),
    [players],
  );
  const selectable = candidates.filter((c) => c.booking.kind === "free");
  const [selected, setSelected] = useState(() => new Set(selectable.map((c) => c.player.id)));
  const [result, setResult] = useState(null);

  //  只算「現在仍可安排」的勾選（安排完之後那些人就變成已安排休息了）
  const live = new Set([...selected].filter((id) => selectable.some((c) => c.player.id === id)));
  const allSelected = selectable.length > 0 && selectable.every((c) => live.has(c.player.id));
  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(() => (allSelected ? new Set() : new Set(selectable.map((c) => c.player.id))));

  const assign = () => {
    let ok = 0, skipped = 0;
    for (const id of live) {
      if (onAssignRest?.(id)) ok += 1; else skipped += 1;
    }
    setResult({ ok, skipped });
    setSelected(new Set());
  };

  const restCount = candidates.filter((c) => c.booking.kind === "rest").length;
  const trainingCount = candidates.filter((c) => c.booking.kind === "training").length;

  return (
    <div className="esmo-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="esmo-modal" role="dialog" aria-modal="true" aria-labelledby="esmo-rest-title"
        data-testid="rest-planner" onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: 480, width: "92vw" }}>
        <h2 className="esmo-modal__title" id="esmo-rest-title">體力管理</h2>
        <p className="esmo-modal__body" style={{ marginBottom: 8 }}>
          體力低於 {CONDITION.lowEnergyBelow} 的選手仍然可以出賽，但本場能力會下降。
          勾選要安排「休息調整」的人（1 天、免費），推進日期後生效。
        </p>

        {candidates.length === 0 ? (
          <p className="esmo-modal__body" data-testid="rest-planner-empty">目前沒有需要休息的選手。</p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <button type="button" data-testid="rest-select-all" onClick={toggleAll}
                disabled={selectable.length === 0}
                style={{
                  padding: "4px 10px", borderRadius: 999, cursor: selectable.length ? "pointer" : "default",
                  background: "transparent", color: selectable.length ? GC.blue : GC.gray,
                  border: `1px solid ${selectable.length ? GC.blue : GC.gray}66`, fontSize: 12,
                }}>
                {allSelected ? "取消全選" : `全選可安排（${selectable.length} 人）`}
              </button>
              <span data-testid="rest-planner-summary" style={{ color: GC.gray, fontSize: 11 }}>
                可安排 {selectable.length}・已安排休息 {restCount}・訓練中 {trainingCount}
              </span>
            </div>
            {selectable.length === 0 && (
              <p className="esmo-modal__body" data-testid="rest-planner-all-booked" style={{ fontSize: 12, marginBottom: 8 }}>
                這些選手都已經有安排：休息會在推進日期後生效；想讓訓練中的人改休息，請到訓練中心調整。
              </p>
            )}
            <div style={{ display: "grid", gap: 6, maxHeight: "46vh", overflowY: "auto" }}>
              {candidates.map(({ player, summary, booking }) => {
                const booked = booking.kind !== "free";
                const checked = !booked && live.has(player.id);
                return (
                  <label key={player.id} data-testid="rest-player-row" data-player={player.id} data-booking={booking.kind}
                    style={rowStyle(checked, booked)}>
                    <input type="checkbox" checked={checked} disabled={booked}
                      aria-label={booked ? `${player.name}：${booking.label}` : `安排 ${player.name} 休息`}
                      onChange={() => toggle(player.id)} data-testid="rest-player-check" />
                    <span style={{ flex: 1, minWidth: 64, fontWeight: 700 }}>{player.name}</span>
                    <span style={{ color: GC.gray, fontSize: 12 }}>{player.role ?? ""}</span>
                    <span style={{ color: summary.energy < 20 ? GC.red : GC.gold, fontSize: 12, fontWeight: 800 }}>
                      體力 {summary.energy}
                    </span>
                    <span style={{ color: GC.gray, fontSize: 11 }} data-testid="rest-player-fatigue">
                      能力 {summary.fatiguePercent}%
                    </span>
                    {booked && (
                      <span style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", paddingLeft: 24 }}>
                        <span data-testid="rest-player-status" data-kind={booking.kind}
                          style={{ color: KIND_COLOR[booking.kind], fontSize: 11, fontWeight: 700 }}>
                          {booking.label}
                        </span>
                        {onOpenTraining && (
                          <button type="button" data-testid="rest-player-adjust"
                            onClick={(event) => { event.preventDefault(); onOpenTraining(); }}
                            style={{
                              padding: "2px 8px", borderRadius: 999, fontSize: 11, cursor: "pointer",
                              background: "transparent", color: GC.blue, border: `1px solid ${GC.blue}66`,
                            }}>
                            調整
                          </button>
                        )}
                      </span>
                    )}
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
          <button type="button" data-testid="rest-assign" onClick={assign} disabled={live.size === 0}
            style={{
              padding: "8px 14px", borderRadius: 10, fontWeight: 800, cursor: live.size ? "pointer" : "default",
              background: live.size ? GC.green : "rgba(255,255,255,.08)",
              color: live.size ? "#04140a" : GC.gray, border: "none",
            }}>
            安排休息（{live.size}）
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
