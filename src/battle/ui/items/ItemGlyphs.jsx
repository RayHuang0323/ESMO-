// ============================================================================
//  battle/ui/items/ItemGlyphs.jsx — 裝備圖紋、策略徽章與小圖示（Item System M3a，D3）
//
//  全部是 24×24 viewBox 的向量圖，顏色一律 currentColor（外層決定），沒有美術資源依賴。
//  圖紋語彙 = itemsUiSelectors.GLYPH_KEYS：T3 依流派 A–H、鞋、起始裝、組件依主屬性。
//  之後有美術圖示時，只替換本檔的 GLYPHS 表，元件介面不變。
// ============================================================================
import React, { useId } from "react";
import { GOLD, GOLD_DARK, GOLD_LIGHT } from "./itemsTheme.js";

const P = (d, fill = false) => ({ t: "p", d, fill });
const C = (cx, cy, r, fill = false) => ({ t: "c", cx, cy, r, fill });
const E = (cx, cy, rx, ry) => ({ t: "e", cx, cy, rx, ry });

const GLYPHS = {
  //  A 暴擊／射手：準星
  "family:A": [C(12, 12, 6.2), P("M12 2.5v4.2M12 17.3v4.2M2.5 12h4.2M17.3 12h4.2"), C(12, 12, 1.7, true)],
  //  B 攻速／On-hit：閃電
  "family:B": [P("M13.2 2.5 5.5 13.2h5.6l-1.3 8.3 8.7-11.2h-5.7l.4-7.8z", true)],
  //  C 刺客／穿透：匕首
  "family:C": [P("M4 20 14.5 9.5"), P("M14.5 9.5 20 4l-1 5.3-4.5.2z", true), P("M7.2 12.8l4 4")],
  //  D 戰士：戰斧
  "family:D": [P("M6 21 15.5 5.5"), P("M12.8 4.3c3.6-1.6 7.4.4 8 4.6-3.4.9-6.3-.3-8-2.2z", true)],
  //  E 法術爆發：星爆
  "family:E": [P("M12 2.5l2.4 6.3 6.6.5-5.1 4.2 1.7 6.5L12 16.4 6.4 20l1.7-6.5L3 9.3l6.6-.5z", true)],
  //  F 法術續戰：弦月
  "family:F": [P("M19.5 14.6A8 8 0 1 1 9.4 4.5a6.4 6.4 0 0 0 10.1 10.1z", true)],
  //  G 坦克：盾
  "family:G": [P("M12 2.8 19.5 6v5.3c0 4.9-3.1 8.4-7.5 9.9-4.4-1.5-7.5-5-7.5-9.9V6z", true)],
  //  H 輔助：光環守護者
  "family:H": [E(12, 4.8, 5.5, 1.9), P("M7.5 21v-5.2a4.5 4.5 0 0 1 9 0V21"), C(12, 10.2, 2.4, true)],
  boots: [P("M7.5 3h5v8.5l6.5 3V19H5v-3.8l2.5-3.4z", true)],
  starter: [P("M12 21v-9"), P("M12 12c0-4.4 3-7.5 7.5-7.5 0 4.4-3 7.5-7.5 7.5z", true), P("M12 14.5c0-3.3-2.6-5.5-6.5-5.5 0 3.3 2.6 5.5 6.5 5.5z", true)],
  "stat:ad": [P("M14.5 3H21v6.5L10.5 20 4 13.5z"), P("M6.5 17.5 3 21")],
  "stat:ap": [C(12, 12, 7), C(12, 12, 2.8, true)],
  "stat:attackSpeed": [P("M4.5 6l6 6-6 6M12 6l6 6-6 6")],
  "stat:critChance": [C(12, 12, 6.5), C(12, 12, 1.8, true), P("M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3")],
  "stat:armor": [P("M4.5 6 12 3l7.5 3v5.5c0 4.5-3.2 7.8-7.5 9.5-4.3-1.7-7.5-5-7.5-9.5z"), P("M12 3v18")],
  "stat:mr": [P("M6 4h12l-1.2 16L12 17l-4.8 3z")],
  "stat:hp": [P("M12 20.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7.9a4.2 4.2 0 0 1 7.5 2.6c0 5.6-7.5 10-7.5 10z", true)],
  "stat:abilityHaste": [P("M7 3h10M7 21h10M8 3c0 5.5 8 5.8 8 9s-8 3.5-8 9M16 3c0 5.5-8 5.8-8 9s8 3.5 8 9")],
  "stat:lifesteal": [P("M12 3c3.2 4.8 6 8 6 11.8a6 6 0 0 1-12 0C6 11 8.8 7.8 12 3z", true)],
  "stat:healShieldPower": [P("M10 3.5h4v6.5h6.5v4H14v6.5h-4V14H3.5v-4H10z", true)],
  "stat:regenPctPerSec": [P("M5 19c0-8.5 6-14 15-14 0 9-5.5 14.5-14 14.5"), P("M5 19l8-8")],
  "stat:moveSpeed": [P("M3 16.5c6.5 0 10.5-3 13.5-9.5M3 11.5c5 0 8-2 10-6M3 20.5h15")],
};

const EMBLEMS = {
  standard: [P("M12 2.5 20.5 12 12 21.5 3.5 12z"), P("M12 7v10M7.5 12h9")],
  early: [P("M12 3 20 13h-5v8H9v-8H4z", true)],
  scaling: [P("M4 20.5h16"), P("M6 16.5l6-5 6 5"), P("M6 11l6-5 6 5")],
  counter: [P("M5 5l14 14M19 5 5 19"), P("M4 9V4h5M20 9V4h-5")],
  survival: [P("M12 2.8 19.5 6v5.3c0 4.9-3.1 8.4-7.5 9.9-4.4-1.5-7.5-5-7.5-9.9V6z"), P("M12 15.8s-3.6-2.1-3.6-4.8a2 2 0 0 1 3.6-1.2 2 2 0 0 1 3.6 1.2c0 2.7-3.6 4.8-3.6 4.8z", true)],
};

const UI = {
  headset: [P("M4 14v-2a8 8 0 0 1 16 0v2"), P("M4 14h3v6H5a1 1 0 0 1-1-1z", true), P("M20 14h-3v6h2a1 1 0 0 0 1-1z", true), P("M17 20.5c0 .8-1.6 1.3-4 1.3")],
  check: [P("M5 12.5l4.5 4.5L19 7.5")],
  chevron: [P("M6 9l6 6 6-6")],
  lock: [P("M6 11h12v9H6z"), P("M8.5 11V8a3.5 3.5 0 0 1 7 0v3")],
};

function Shapes({ shapes }) {
  return shapes.map((s, i) => {
    if (s.t === "c") return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill ? "currentColor" : "none"} />;
    if (s.t === "e") return <ellipse key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill="none" />;
    return <path key={i} d={s.d} fill={s.fill ? "currentColor" : "none"} />;
  });
}

function Svg({ size, strokeWidth = 1.9, style, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ display: "block", flexShrink: 0, ...style }}>
      {children}
    </svg>
  );
}

/** 裝備圖紋（glyph 來自 itemVisual）。size 可以是數字或百分比字串。 */
export function ItemIcon({ glyph, size = 16, style }) {
  return <Svg size={size} style={style}><Shapes shapes={GLYPHS[glyph] ?? GLYPHS["stat:ad"]} /></Svg>;
}

/** 出裝策略徽章。 */
export function StrategyEmblem({ id, size = 22 }) {
  return <Svg size={size} strokeWidth={2}><Shapes shapes={EMBLEMS[id] ?? EMBLEMS.standard} /></Svg>;
}

export const HeadsetIcon = ({ size = 18 }) => <Svg size={size}><Shapes shapes={UI.headset} /></Svg>;
export const CheckIcon = ({ size = 12 }) => <Svg size={size} strokeWidth={3}><Shapes shapes={UI.check} /></Svg>;
export const LockIcon = ({ size = 12 }) => <Svg size={size} strokeWidth={2.4}><Shapes shapes={UI.lock} /></Svg>;
export const ChevronIcon = ({ size = 16, up = false }) => (
  <Svg size={size} strokeWidth={2.4} style={{ transform: up ? "rotate(180deg)" : "none" }}><Shapes shapes={UI.chevron} /></Svg>
);

/** 金幣（唯一有固定配色的圖示）。 */
export function CoinIcon({ size = 14 }) {
  const gid = `coin${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ display: "block", flexShrink: 0 }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={GOLD_LIGHT} />
          <stop offset="0.55" stopColor={GOLD} />
          <stop offset="1" stopColor={GOLD_DARK} />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill={`url(#${gid})`} />
      <circle cx="12" cy="12" r="6.6" fill="none" stroke={GOLD_DARK} strokeWidth="1.6" opacity="0.7" />
      <path d="M12 8.2v7.6M9.4 12h5.2" stroke={GOLD_DARK} strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
