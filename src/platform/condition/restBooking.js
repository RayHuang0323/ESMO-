// ============================================================================
//  platform/condition/restBooking.js — 選手「能不能安排休息」的唯一判讀
//
//  為什麼需要：`player.training` 只要不是 null 就代表**身上有一門課在跑**
//  （可能是休息、也可能是 3 天的操作訓練）。舊的體力管理面板把它一律寫成「已安排」
//  並整列鎖死；而訓練本身會扣體力 ⇒ 低體力的人常常正好在上課 ⇒ 面板整片不能勾。
//  首頁提醒又把這些人也算進去 ⇒ 「提醒一直在，點進去什麼都不能做」。
//
//  這裡只**讀** `player.training`，把它分成三種狀態給畫面用：
//    free      沒有課 ⇒ 可以 `assignTraining(id, "rest")`
//    rest      已安排休息（推進日期後生效）
//    training  訓練中：課名（剩 N 天）
//  ⚠ 不寫任何狀態、不建第二套休息邏輯：安排一律走 profileStore 的 `assignTraining`，
//    取消／改排一律走訓練中心既有的 `cancelTraining`。不能 double-book 的規則也在那裡。
// ============================================================================
import { courseById } from "../../data/playerModel.js";

/**
 * @param {object} player
 * @returns {{kind:"free"|"rest"|"training", courseId:string|null, courseName:string|null,
 *            daysLeft:number|null, label:string}}
 */
export function restBookingOf(player) {
  const t = player?.training;
  if (!t) return { kind: "free", courseId: null, courseName: null, daysLeft: null, label: "可安排休息" };
  const daysLeft = Number.isFinite(Number(t.daysLeft)) ? Number(t.daysLeft) : null;
  const tail = daysLeft != null ? `（剩 ${daysLeft} 天）` : "";
  if (t.courseId === "rest") {
    return { kind: "rest", courseId: "rest", courseName: courseById("rest")?.name ?? "休息", daysLeft, label: `已安排休息${tail}` };
  }
  const courseName = courseById(t.courseId)?.name ?? "訓練";
  return { kind: "training", courseId: t.courseId ?? null, courseName, daysLeft, label: `訓練中：${courseName}${tail}` };
}

export const canBookRest = (player) => restBookingOf(player).kind === "free";
