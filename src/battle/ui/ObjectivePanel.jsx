// ============================================================================
//  battle/ui/ObjectivePanel.jsx — 大型物件面板（Objective Stakes v1，moba-sim.v16）
//
//  只讀 snapshot（現場＝引擎；Replay＝replayPresentationSource 還原，同形狀），不自己計時、不算數值：
//    · teamBuffs[side]：dragonStacks／soul／baronRemaining／minion（兵線強化）
//    · objectives：龍／巴龍存活、下次刷新秒數
//    · objectiveLog：擊殺事件（含逆轉賞金、龍魂取得）⇒ 4 遊戲秒的精簡提示
//  版面：
//    桌機 ⇒ 計分板下方置中一條（高 26px），兩隊龍層圓點＋龍魂／巴龍徽章＋中間刷新倒數
//    手機 ⇒ 同一條但縮成 22px，只留圓點、徽章與倒數；細節放 title（長按）
//  ⚠ 沒有 teamBuffs（舊 snapshot／舊 Replay）⇒ 整條不畫，不編造 0 層。
// ============================================================================
import React from "react";
import { useIsMobile } from "../../ui/useViewport.js";
import "./objectivePanel.css";

const SIDES = ["blue", "red"];
const SIDE_ZH = { blue: "藍方", red: "紅方" };

function TeamObjectives({ side, buffs, maxStacks }) {
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
          巴龍 <small>{Math.ceil(baron)}s</small>
        </b>
      )}
    </div>
  );
}

function SpawnTimer({ o, icon, label }) {
  if (!o) return null;
  const alive = !!o.alive;
  const wait = Math.max(0, Math.ceil(o.respawn ?? 0));
  return (
    <span className={`objective-spawn ${alive ? "alive" : ""}`} data-testid={`objective-spawn-${o.id}`}
      title={alive ? `${label}：已刷新，可以搶` : `${label}：${wait} 秒後刷新`}>
      <span aria-hidden="true">{icon}</span>{alive ? "可搶" : `${wait}s`}
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
  const tb = snapshot?.teamBuffs;
  if (!tb) return null;
  const maxStacks = Math.max(1, tb.maxStacks ?? 4);
  const obj = (id) => (snapshot?.objectives ?? []).find((o) => o.id === id) ?? null;
  const toast = latestToast(snapshot?.objectiveLog, snapshot?.ts ?? 0);
  return (
    <div className={`objective-panel ${mobile ? "mobile" : "desktop"}`} data-testid="objective-panel" aria-label="大型物件">
      <TeamObjectives side="blue" buffs={tb.blue} maxStacks={maxStacks} />
      <span className="objective-spawns">
        <SpawnTimer o={obj("dragon")} icon="🐉" label="巨龍" />
        <SpawnTimer o={obj("baron")} icon="👑" label="巴龍" />
      </span>
      <TeamObjectives side="red" buffs={tb.red} maxStacks={maxStacks} />
      {toast && (
        <div key={toast.key} className={`objective-toast ${toast.side}`} data-testid="objective-toast" role="status">
          {toast.text}{toast.bounty ? <em data-testid="objective-bounty">逆轉賞金 +{toast.bounty}</em> : null}
        </div>
      )}
    </div>
  );
}

export { SIDES };
