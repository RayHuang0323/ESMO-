import React from "react";

// ============================================================================
//  battle/ui/ObjectiveIcons.jsx — 巨龍／巴龍的 HUD 圖示（ESMO 自繪 SVG，不使用任何官方圖示）
//
//  取代原本的 emoji（🐉 在 Windows 會畫成一條長蛇、👑 是皇冠，兩者都看不出是「大型野怪」）。
//  小尺寸（12–16px）要靠**輪廓**就能分辨，不只靠顏色：
//    巨龍 ⇒ 側面龍頭：後掠的雙角＋張開的長吻＋身後一片帶指骨的蝠翼（三角形輪廓、朝右）
//    巴龍 ⇒ 正面虛空巨獸：兩支向外上捲的大角＋寬甲殼頭＋三隻眼＋鋸齒巨口＋下方觸手（對稱、方寬輪廓）
//  主色走 currentColor（由呼叫端決定；HUD 預設 巨龍紫／巴龍金），眼睛與口腔另有固定對比色。
//  純呈現元件：不讀 store、不影響模擬。
// ============================================================================

export function DragonIcon({ size = 14, title = "巨龍", className, style }) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={title}
      data-objective-icon="dragon" focusable="false">
      <title>{title}</title>
      {/* 身後的蝠翼（指骨＋翼膜鋸齒） */}
      <path d="M9.5 14.2 L2.2 5.4 L3.6 10.4 L0.8 11.6 L3.9 13.6 L1.9 16.4 L5.6 16.1 L5.4 18.6 L9.4 16.2 Z"
        fill="currentColor" opacity="0.55" />
      {/* 後掠雙角 */}
      <path d="M8.6 9.2 L3.6 3.0 L10.7 7.5 Z" fill="currentColor" />
      <path d="M11.2 8.0 L9.8 1.9 L13.4 7.5 Z" fill="currentColor" />
      {/* 龍頭：上顎長吻、張口缺口、下顎、頸部 */}
      <path d="M7.0 10.0 C8.8 7.6 12.6 7.0 15.8 8.4 L21.8 9.7 L20.9 11.5 L16.6 11.8 L20.3 13.3 L19.1 14.9 L14.1 13.9
        C12.6 16.2 9.6 17.2 7.4 15.7 C5.9 14.2 5.9 11.6 7.0 10.0 Z" fill="currentColor" />
      {/* 鼻孔與眼（固定亮色，深底也看得到） */}
      <circle cx="12.6" cy="10.1" r="1.05" fill="#fff7d6" />
      <circle cx="19.6" cy="10.2" r="0.45" fill="#1b1028" />
    </svg>
  );
}

export function BaronIcon({ size = 14, title = "巴龍", className, style }) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={title}
      data-objective-icon="baron" focusable="false">
      <title>{title}</title>
      {/* 下方觸手 */}
      <path d="M7.2 16.6 C6.0 19.2 4.4 20.9 2.6 22.0 C5.4 22.2 7.7 20.6 9.0 18.2 Z" fill="currentColor" opacity="0.6" />
      <path d="M16.8 16.6 C18.0 19.2 19.6 20.9 21.4 22.0 C18.6 22.2 16.3 20.6 15.0 18.2 Z" fill="currentColor" opacity="0.6" />
      <path d="M11.0 18.6 C10.8 20.4 11.2 22.0 12.0 23.2 C12.8 22.0 13.2 20.4 13.0 18.6 Z" fill="currentColor" opacity="0.6" />
      {/* 兩支向外上捲的大角 */}
      <path d="M6.4 8.8 C3.0 7.2 2.2 3.6 3.8 1.2 C4.3 4.4 6.4 6.0 8.8 6.8 Z" fill="currentColor" />
      <path d="M17.6 8.8 C21.0 7.2 21.8 3.6 20.2 1.2 C19.7 4.4 17.6 6.0 15.2 6.8 Z" fill="currentColor" />
      {/* 寬甲殼頭 */}
      <path d="M4.6 10.4 C4.8 6.9 8.3 5.4 12.0 5.4 C15.7 5.4 19.2 6.9 19.4 10.4 L19.9 13.8 C18.4 17.4 15.3 19.0 12.0 19.0
        C8.7 19.0 5.6 17.4 4.1 13.8 Z" fill="currentColor" />
      {/* 三隻虛空眼 */}
      <ellipse cx="12" cy="9.9" rx="1.35" ry="1.7" fill="#e9d5ff" />
      <circle cx="8.6" cy="11.0" r="0.95" fill="#e9d5ff" />
      <circle cx="15.4" cy="11.0" r="0.95" fill="#e9d5ff" />
      {/* 鋸齒巨口 */}
      <path d="M7.6 13.6 L16.4 13.6 L15.3 16.7 L13.7 15.2 L12.0 17.3 L10.3 15.2 L8.7 16.7 Z" fill="#1a0b2e" />
    </svg>
  );
}
