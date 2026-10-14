import React from "react";
import { GC } from "../../ui/theme.js";

// Outside the canvas: every label is a saved event or current objective value.
export default function FpsSavedFrameHud({ frame, view, casts, revision, replayMode, playing, matchOver }) {
  const carrier = frame.players.find(player => !player.dead && player.hasBomb);
  const state = frame.bombState;
  const status = state === "defused" ? "炸彈已拆除" : state === "exploded" ? "炸彈已爆炸" : frame.planted ? (frame.defuse?.defuserId ? "拆除中" : "炸彈已安放") : frame.droppedBomb ? "炸彈掉落，可拾取" : carrier ? `由 ${carrier.name} 攜帶` : "炸彈未交付";
  return (
    <div className="fps-major-saved-hud" data-testid="cs-c5c-presentation-hud" data-c5c-presentation-revision={revision}>
      <div className="fps-major-objective-row">
        <span data-testid="cs-playback-status" style={{ color: replayMode ? GC.gold : playing && !matchOver ? GC.green : GC.gray }}>{replayMode ? "保存重播" : matchOver ? "比賽結束" : playing ? "播放中" : "已暫停"}</span>
        <span data-testid="cs-c5c-bomb-status" data-cs-bomb-state={frame.planted ? state : frame.droppedBomb ? "dropped" : carrier ? "carried" : "unassigned"} style={{ color: frame.planted ? GC.gold : GC.gray }}>C4 · {status}{frame.planted && state === "planted" && Number.isFinite(frame.bombTimeRemainingSec) ? ` · ${Math.ceil(frame.bombTimeRemainingSec)} 秒` : ""}</span>
      </div>
      {(view?.banner || view?.multiKill) && <div data-testid="cs-c5c-presentation-banner" className="fps-major-moment" style={{ color: GC.gold }}>{view.banner?.title || view.multiKill?.label} <span style={{ color: GC.gray }}>{view.banner?.detail || view.multiKill?.player}</span></div>}
      <div data-testid="cs-c5c-kill-feed" className="fps-major-feed">{(view?.feed || []).map(entry => <div key={entry.id} className="fps-major-feed-entry"><b title={entry.killer} style={{ color: GC.blueL }}>{entry.killer}</b><span>→</span><b title={entry.victim}>{entry.victim}</b><span>{entry.weaponLabel}{entry.hs ? " · 爆頭" : ""}</span></div>)}</div>
      {!!casts.length && <div className="fps-major-casts" aria-label="即時轉播">{casts.map(cast => <div key={cast.id}>{cast.text}</div>)}</div>}
    </div>
  );
}
