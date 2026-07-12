// ============================================================================
//  ui/PlayerFace.jsx — 選手頭像（Sprint21）
//  來源：Legacy EsportsGame.jsx PlayerFace(line87) 逐字。
//  性質：程序化 SVG（依名字 hash 決定膚色/髮色/底色）。Legacy 本來就沒有選手照片，
//    所以這是正式版型而不是 fallback——不造假、不破圖。
//  英雄小角標走 ui/HeroPortrait.jsx（英雄圖唯一入口，缺圖自動 fallback）。
// ============================================================================
import React from "react";
import HeroPortrait from "./HeroPortrait.jsx";

export default function PlayerFace({ player, size = 40 }) {
  const name = player?.name || "?";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffff;
  const HUE = h % 360;
  const skin = ["#fcd9b8", "#f0c8a0", "#e0b088", "#d49968", "#c88850"][(h >> 3) % 5];
  const hair = ["#2a2a35", "#4a3520", "#6b4423", "#1a1a22", "#8a6a45", "#3a2a4a"][(h >> 6) % 6];
  const bg1 = `hsl(${HUE},45%,32%)`, bg2 = `hsl(${HUE},50%,18%)`;
  const initial = name[0].toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", position: "relative", background: `linear-gradient(145deg,${bg1},${bg2})`, flexShrink: 0 }}>
      <svg viewBox="0 0 40 40" style={{ width: "100%", height: "100%" }}>
        <ellipse cx="20" cy="40" rx="15" ry="12" fill={`hsl(${HUE},35%,40%)`} />
        <rect x="16" y="24" width="8" height="8" fill={skin} />
        <ellipse cx="20" cy="19" rx="9" ry="10" fill={skin} />
        <path d="M11,17 Q11,7 20,7 Q29,7 29,17 Q29,12 20,11 Q11,12 11,17Z" fill={hair} />
        <path d="M11,17 Q10,13 12,10 L13,16Z" fill={hair} />
        <path d="M29,17 Q30,13 28,10 L27,16Z" fill={hair} />
        <circle cx="16.5" cy="19" r="1.1" fill="#222" />
        <circle cx="23.5" cy="19" r="1.1" fill="#222" />
        <path d="M17,23 Q20,25 23,23" stroke="#a05a4a" strokeWidth="0.8" fill="none" />
      </svg>
      <div style={{ position: "absolute", bottom: 0, right: 0, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: `${size * 0.22}px`, fontWeight: 900, padding: "0 2px", borderRadius: "4px 0 0 0" }}>{initial}</div>
    </div>
  );
}

/**
 * 選手頭像 + 英雄小角標（Legacy Roster / Team / Training 三處共用的組合版型）。
 * player.heroId 為 null（新秀尚未綁定英雄）→ 只顯示選手頭像，不亂塞英雄。
 */
export function PlayerAvatar({ player, size = 46, badge = 18, ring = "transparent", radius = "50%" }) {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, border: `2px solid ${ring}`, position: "relative", flexShrink: 0, boxSizing: "border-box" }}>
      <div style={{ width: "100%", height: "100%", borderRadius: radius, overflow: "hidden" }}>
        <PlayerFace player={player} size={size - 4} />
      </div>
      {player?.heroId && (
        <div style={{ position: "absolute", bottom: -3, right: -3, borderRadius: "50%", border: "1.5px solid #0a0b0f", overflow: "hidden", lineHeight: 0 }}>
          <HeroPortrait
            heroId={player.heroId}
            size={badge}
            fallback={<div style={{ width: badge, height: badge, borderRadius: "50%", background: "#1a1d26" }} />}
          />
        </div>
      )}
    </div>
  );
}
