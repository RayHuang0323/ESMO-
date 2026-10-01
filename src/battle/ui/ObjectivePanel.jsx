// ============================================================================
//  battle/ui/ObjectivePanel.jsx — 大型物件資訊列（Objective Stakes v1，moba-sim.v16；v17 Mobile Objective HUD polish）
//
//  只讀 snapshot（現場＝引擎；Replay＝replayPresentationSource 還原，同形狀），不自己計時、不算數值：
//    · teamBuffs[side]：dragonStacks／soul／baronRemaining／minion（兵線強化）
//    · objectives：龍／巴龍存活、血量、下次刷新秒數、是否刷新過
//    · objectiveLog：擊殺事件（含逆轉賞金、龍魂取得）⇒ 4 遊戲秒的精簡提示
//  版面（位置唯一來源：hudStore.objectiveBarTop／battleLayout.OBJECTIVE_BAR_*）：
//    桌機 ⇒ 記分板正下方置中一條（22px）；提示出現在列下方
//    手機 ⇒ 記分板正下方一條薄列（18px），5v5 戰況列接在它下面；提示**暫時取代兩側龍層**（倒數永遠保留），不再浮出一層
//  每個物件四種狀態（data-state）：pre＝尚未首次刷新、alive＝可搶、fight＝交戰中（血量 < 100%）、respawn＝重生倒數。
//  圖示是 ESMO 自繪 SVG（ObjectiveIcons.jsx），輪廓本身可辨識，不只靠顏色。
//  ⚠ 沒有 teamBuffs（舊 snapshot／舊 Replay）⇒ 整條不畫，不編造 0 層。
// ============================================================================
import React from "react";
import { useIsMobile } from "../../ui/useViewport.js";
import { useHudMode, objectiveBarTop } from "./hudStore.js";
import { OBJECTIVE_BAR_H } from "./battleLayout.js";
import { DragonIcon, BaronIcon } from "./ObjectiveIcons.jsx";
import "./objectivePanel.css";

const SIDES = ["blue", "red"];
const SIDE_ZH = { blue: "藍方", red: "紅方" };

function TeamObjectives({ side, buffs, maxStacks, mobile }) {
  const stacks = Math.max(0, Math.round(buffs?.dragonStacks ?? 0));
  const baron = Math.max(0, buffs?.baronRemaining ?? 0);
  const soul = !!buffs?.soul;
  const baronTotal = Math.max(1, buffs?.baronDuration ?? 70);
  const title = `${SIDE_ZH[side]}：龍層 ${stacks}/${maxStacks}${soul ? "（龍魂：戰力提升、兵線永久強化）" : ""}`
    + `${baron > 0 ? `；巴龍增益剩 ${Math.ceil(baron)} 秒（英雄戰力、兵線攻城強化）` : ""}`;
  return (
    <div className={`objective-team ${side}`} data-testid={`objective-team-${side}`} title={title}
      data-dragon-stacks={stacks} data-soul={soul ? 1 : 0} data-baron-remaining={Math.ceil(baron)}>
      <span className="objective-pips" aria-label={`龍層 ${stacks}/${maxStacks}`}>
        {Array.from({ length: maxStacks }, (_, i) => <i key={i} className={i < stacks ? "on" : ""} />)}
      </span>
      {soul && <b className="objective-badge soul" data-testid={`objective-soul-${side}`}>龍魂</b>}
      {baron > 0 && (
        <b className="objective-badge baron" data-testid={`objective-baron-${side}`}
          style={{ "--left": `${Math.min(1, baron / baronTotal) * 360}deg` }}>
          <BaronIcon size={mobile ? 10 : 12} title="巴龍增益" /><small>{Math.ceil(baron)}s</small>
        </b>
      )}
    </div>
  );
}

/** 物件狀態：pre（尚未首次刷新）／alive（可搶）／fight（交戰中）／respawn（重生倒數）。 */
export function objectiveStateOf(o) {
  if (!o) return null;
  if (o.alive) return (o.hp ?? 1) < 0.999 ? "fight" : "alive";
  return o.spawnedOnce ? "respawn" : "pre";
}

function SpawnTimer({ o, Icon, label, mobile }) {
  if (!o) return null;
  const state = objectiveStateOf(o);
  const wait = Math.max(0, Math.ceil(o.respawn ?? 0));
  const text = state === "fight" ? "交戰" : state === "alive" ? "可搶" : `${wait}s`;
  const title = state === "fight" ? `${label}：交戰中（${Math.round((o.hp ?? 0) * 100)}%）`
    : state === "alive" ? `${label}：已刷新，可以搶`
      : state === "pre" ? `${label}：${wait} 秒後首次出現` : `${label}：${wait} 秒後重生`;
  return (
    <span className={`objective-spawn ${o.id} ${state}`} data-testid={`objective-spawn-${o.id}`} data-state={state} title={title}>
      <Icon size={mobile ? 13 : 15} title={label} /><span className="objective-spawn-text">{text}</span>
    </span>
  );
}

/** 最近 4 遊戲秒內的大型物件擊殺事件 → 一行提示（逆轉賞金／龍魂優先說明）。 */
function latestToast(log = [], ts = 0) {
  const e = [...log].reverse().find((x) => ts - x.t >= 0 && ts - x.t < 4);
  if (!e) return null;
  const who = SIDE_ZH[e.side] ?? "";
  const what = e.key === "baron" ? "擊殺巴龍" : e.soul ? "取得龍魂" : `擊殺巨龍（${e.dragonStacks} 層）`;
  return { key: `${e.seq}`, side: e.side, text: `${who}${what}`, bounty: e.bounty > 0 ? e.bounty : 0 };
}

export default function ObjectivePanel({ snapshot }) {
  const mobile = useIsMobile();
  const mode = useHudMode();
  const tb = snapshot?.teamBuffs;
  if (!tb) return null;
  const maxStacks = Math.max(1, tb.maxStacks ?? 4);
  const obj = (id) => (snapshot?.objectives ?? []).find((o) => o.id === id) ?? null;
  const toast = latestToast(snapshot?.objectiveLog, snapshot?.ts ?? 0);
  const toastEl = toast && (
    <div key={toast.key} className={`objective-toast ${toast.side}`} data-testid="objective-toast" role="status">
      {toast.text}{toast.bounty ? <em data-testid="objective-bounty">逆轉賞金 +{toast.bounty}</em> : null}
    </div>
  );
  return (
    <div className={`objective-panel ${mobile ? "mobile" : "desktop"}`} data-testid="objective-panel" aria-label="大型物件"
      style={{ top: objectiveBarTop(mode, mobile), height: OBJECTIVE_BAR_H[mobile ? "mobile" : "desktop"] }}>
      {/* 手機：提示出現的 4 秒內暫時取代兩側龍層（提示本身就說明哪一隊、第幾層），
          中間的巨龍／巴龍狀態與重生倒數**永遠保留**（剛被擊殺的那一刻正是倒數開始）。 */}
      {mobile && toastEl ? toastEl : <TeamObjectives side="blue" buffs={tb.blue} maxStacks={maxStacks} mobile={mobile} />}
      <span className="objective-spawns">
        <SpawnTimer o={obj("dragon")} Icon={DragonIcon} label="巨龍" mobile={mobile} />
        <SpawnTimer o={obj("baron")} Icon={BaronIcon} label="巴龍" mobile={mobile} />
      </span>
      {!(mobile && toastEl) && <TeamObjectives side="red" buffs={tb.red} maxStacks={maxStacks} mobile={mobile} />}
      {!mobile && toastEl}
    </div>
  );
}

export { SIDES };
