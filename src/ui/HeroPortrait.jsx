// ============================================================================
//  ui/HeroPortrait.jsx — 英雄圖片共用元件（Sprint20 B）
//  Presentation：Legacy HERO_IMG 真實英雄圖，Codex / HeroDetail / BanPick /
//    Loading / BattleHeroStrip 共用同一個接圖點，不各自重畫版面。
//  資料：圖片只從 heroDatabase.heroImage(id) 取得（唯一 Hero 資料入口）。
//  Fallback 契約（不得破圖）：
//    · heroImage(id) 回 null（缺圖）→ 直接渲染呼叫端傳入的 fallback（程序化色塊）。
//    · 圖片載入失敗（onError）→ 切回同一個 fallback。
//  版型：呼叫端用 size / radius / border / style 保留各自既有樣式，本元件不改版面。
// ============================================================================
import React, { useState } from "react";
import { heroImage } from "../data/heroDatabase.js";

export default function HeroPortrait({
  heroId,
  size = 44,
  radius = "50%",
  border = "none",
  style = {},
  imgStyle = {},
  fallback = null,
  alt = "",
}) {
  const [broken, setBroken] = useState(false);
  const src = heroId ? heroImage(heroId) : null;

  if (!src || broken) return fallback;

  return (
    <div style={{ width: size, height: size, borderRadius: radius, border, overflow: "hidden", flexShrink: 0, background: "#0a0a10", ...style }}>
      <img
        src={src}
        alt={alt}
        onError={() => setBroken(true)}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", ...imgStyle }}
      />
    </div>
  );
}
