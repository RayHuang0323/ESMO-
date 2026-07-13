// ============================================================================
//  screens/manage/TrainingScreen.jsx — 訓練中心（Sprint21）
//  Legacy 來源：EsportsGame.jsx TrainingModule(line4334) Component 化。
//  Presentation 逐項保留：週次徽章 / 推進訓練日大鈕（有人訓練才亮紫漸層）/
//    訓練進行中列（進度條＋剩餘天數＋取消）/ 選手橫向膠囊（體力條＋狀態色）/
//    選定選手詳情（雙戰力徽章＋16 項能力雙欄）/ 課程 2×N 格（體力不足變灰）/
//    訓練日誌（最新在上，上限 12 筆）。
//  Adapter（不造假）：選手＝profileStore.players；課程＝playerModel.TRAINING_COURSES；
//    指派 / 推進 / 取消一律呼叫 Store（成長結算＝playerModel.applyCourse 純函數）。
//  ⚠ 訓練提升的是「經營端能力值」；Battle Balance / LogicEngine 不受影響。
// ============================================================================
import React, { useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import {
  STAT_DEF, TRAINING_COURSES, courseById, calcPower, bestPositions, personalityById, statZh,
} from "../../data/playerModel.js";
import { PlayerAvatar } from "../../ui/PlayerFace.jsx";
import { GC } from "../../ui/theme.js";
import ManageFrame from "./ManageFrame.jsx";

const condColorOf = (c) => (c === "精神飽滿" ? GC.green : c === "正常" ? "#d4d4d8" : c === "疲勞" ? GC.gold : GC.red);

export default function TrainingScreen({ onBack }) {
  const players = useProfileStore((s) => s.players) ?? [];
  const meta = useProfileStore((s) => s.meta);
  const assignTraining = useProfileStore((s) => s.assignTraining);
  const cancelTraining = useProfileStore((s) => s.cancelTraining);
  const advanceTrainingDay = useProfileStore((s) => s.advanceTrainingDay);
  const [selId, setSelId] = useState(null);
  const [log, setLog] = useState([]);

  const push = (t) => setLog((l) => [{ t }, ...l].slice(0, 12));
  const training = players.filter((p) => p.training);
  const idle = players.filter((p) => !p.training);
  const sel = idle.find((p) => p.id === selId) || null;

  const assign = (p, courseId) => {
    const c = courseById(courseId);
    if (!c) return;
    if (c.id !== "rest" && (p.energy ?? 100) < c.energyCost) { push(`${p.name} 體力不足(需${c.energyCost})`); return; }
    if (assignTraining(p.id, courseId)) push(`${p.name} 開始「${c.name}」，需 ${c.hours} 天`);
  };

  const advance = () => {
    if (training.length === 0) { push("無選手在訓練中"); return; }
    const finishing = training.filter((p) => p.training.daysLeft <= 1);
    advanceTrainingDay();
    finishing.forEach((p) => {
      const c = courseById(p.training.courseId);
      const sn = c.stats.map(statZh).join("、");
      push(`✓ ${p.name} 完成「${c.name}」${c.id === "rest" ? "，體力恢復" : ` → ${sn} 提升`}`);
    });
    if (finishing.length === 0) push(`訓練日推進 · ${training.length} 人訓練中`);
  };

  return (
    <ManageFrame
      title="訓練中心" subtitle="TRAINING" onBack={onBack}
      right={<span style={{ background: "rgba(167,139,250,0.15)", color: GC.purp, fontSize: 11, fontWeight: 800, borderRadius: 8, padding: "4px 10px", whiteSpace: "nowrap" }}>第 {meta.week ?? 1} 週</span>}
    >
      <div style={{ color: GC.gray, fontSize: 10, marginBottom: 12 }}>指派訓練後需推進天數才完成，訓練期間選手無法操作</div>

      <button onClick={advance}
        style={{ width: "100%", background: training.length > 0 ? `linear-gradient(135deg,${GC.purp},#7c3aed)` : GC.card, border: training.length > 0 ? "none" : "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 13, cursor: "pointer", color: training.length > 0 ? "#fff" : GC.gray, fontSize: 14, fontWeight: 800, marginBottom: 14 }}>
        ⏭️ 推進訓練日{training.length > 0 ? `（${training.length} 人訓練中）` : ""}
      </button>

      {/* 訓練進行中 */}
      {training.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: GC.gray, fontSize: 10, fontWeight: 700, marginBottom: 6 }}>訓練進行中</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {training.map((p) => {
              const c = courseById(p.training.courseId);
              const prog = (p.training.totalDays - p.training.daysLeft) / p.training.totalDays * 100;
              return (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, background: GC.card, borderRadius: 11, padding: "10px 12px", border: `1px solid ${GC.purp}44` }}>
                  <PlayerAvatar player={p} size={36} ring={GC.purp} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ color: "white", fontSize: 12, fontWeight: 700 }}>{p.name}</span>
                      <span style={{ color: GC.purp, fontSize: 9 }}>{c?.emoji}{c?.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                      <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${prog}%`, background: GC.purp }} />
                      </div>
                      <span style={{ color: GC.gray, fontSize: 8 }}>剩 {p.training.daysLeft} 天</span>
                    </div>
                  </div>
                  <button onClick={() => { cancelTraining(p.id); push(`${p.name} 取消訓練`); }}
                    style={{ background: "rgba(239,68,68,0.15)", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: GC.red, fontSize: 9, fontWeight: 700 }}>取消</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 指派訓練：選手橫向膠囊 */}
      <div style={{ color: GC.gray, fontSize: 10, fontWeight: 700, marginBottom: 6 }}>指派訓練</div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 12 }}>
        {idle.map((p) => {
          const isActive = selId === p.id;
          const cond = p.condition || "正常";
          const cc = condColorOf(cond);
          const e = p.energy ?? 100;
          return (
            <button key={p.id} onClick={() => setSelId(p.id)}
              style={{ flexShrink: 0, width: 72, background: isActive ? GC.card2 : GC.card, border: `1.5px solid ${isActive ? GC.purp : "rgba(255,255,255,0.06)"}`, borderRadius: 11, padding: "8px 4px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <PlayerAvatar player={p} size={36} ring={cc} />
              <span style={{ color: "white", fontSize: 9, fontWeight: 700 }}>{p.name}</span>
              <span style={{ color: cc, fontSize: 7.5 }}>{cond}</span>
              <div style={{ width: "100%", height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${e}%`, background: e > 60 ? GC.green : e > 30 ? GC.gold : GC.red }} />
              </div>
              <span style={{ color: GC.gray, fontSize: 7 }}>體力 {e}</span>
            </button>
          );
        })}
      </div>

      {sel && (() => {
        const pers = personalityById(sel.personality);
        const bp = bestPositions(sel);
        return (
          <div>
            <div style={{ background: GC.card, borderRadius: 12, padding: "12px 14px", marginBottom: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: "white", fontSize: 14, fontWeight: 800 }}>{sel.name}</span>
                <span style={{ color: GC.gray, fontSize: 10, marginLeft: 6 }}>{sel.role}</span>
                {pers && <span style={{ marginLeft: 6, fontSize: 10 }}>{pers.emoji}{pers.zh}</span>}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ background: "rgba(167,139,250,0.15)", color: GC.purp, fontSize: 9, fontWeight: 700, borderRadius: 6, padding: "2px 6px" }}>MOBA {calcPower(sel, "moba")} · 適{bp.moba.pos.replace("MOBA", "")}</span>
                <span style={{ background: "rgba(251,146,60,0.15)", color: "#fb923c", fontSize: 9, fontWeight: 700, borderRadius: 6, padding: "2px 6px" }}>FPS {calcPower(sel, "fps")} · 適{bp.fps.pos.replace("FPS", "")}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 12px" }}>
                {STAT_DEF.map((s) => {
                  const v = sel.stats?.[s.key] ?? 50;
                  const b = pers?.boost?.includes(s.key), n = pers?.nerf?.includes(s.key);
                  return (
                    <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ color: b ? GC.gold : n ? GC.red : "#a1a1aa", fontSize: 8, width: 42, flexShrink: 0 }}>{s.zh}{b ? "↑" : n ? "↓" : ""}</span>
                      <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${v}%`, background: v >= 80 ? GC.gold : v >= 65 ? GC.green : "#60a5fa" }} />
                      </div>
                      <span style={{ color: "white", fontSize: 8, fontFamily: "monospace", width: 18, textAlign: "right" }}>{v}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ color: GC.gray, fontSize: 10, fontWeight: 700, marginBottom: 6 }}>選擇課程指派</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              {TRAINING_COURSES.map((c) => {
                const isRest = c.id === "rest";
                const canDo = isRest || (sel.energy ?? 100) >= c.energyCost;
                const sn = c.stats.map(statZh).join("/");
                return (
                  <button key={c.id} onClick={() => { if (canDo) assign(sel, c.id); }}
                    style={{ background: canDo ? GC.card : "rgba(255,255,255,0.02)", border: `1px solid ${canDo ? (isRest ? GC.green : GC.purp) + "33" : "rgba(255,255,255,0.04)"}`, borderRadius: 10, padding: 10, cursor: canDo ? "pointer" : "not-allowed", opacity: canDo ? 1 : 0.5, textAlign: "left" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                      <span style={{ fontSize: 14 }}>{c.emoji}</span>
                      <span style={{ color: "white", fontSize: 11, fontWeight: 700 }}>{c.name}</span>
                    </div>
                    {!isRest && <div style={{ color: GC.gray, fontSize: 8, marginBottom: 2 }}>提升：{sn}</div>}
                    <div style={{ color: isRest ? GC.green : GC.gray, fontSize: 8 }}>{isRest ? `休息 ${c.hours}天 · 體力+30` : `${c.hours}天 · 耗體力 ${c.energyCost}`}</div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {!sel && training.length === 0 && <div style={{ textAlign: "center", color: GC.gray, fontSize: 12, padding: "20px 0" }}>← 選擇選手指派訓練</div>}

      {log.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ color: GC.gray, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>訓練日誌</div>
          {log.map((l, i) => (
            <div key={i} style={{ color: i === 0 ? "white" : GC.gray, fontSize: 10, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>{l.t}</div>
          ))}
        </div>
      )}
    </ManageFrame>
  );
}
