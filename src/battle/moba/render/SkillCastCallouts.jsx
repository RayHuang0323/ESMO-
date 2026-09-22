// ============================================================================
//  battle/moba/render/SkillCastCallouts.jsx — 技能施放標籤（Battle UX hotfix）
//
//  總覽鏡頭下英雄只有約 20px，就算 VFX 放大了，玩家仍很難判斷「剛剛那是技能」。
//  施放的前 ~0.8 秒在施放者頭上顯示一個小標籤：「R · 技能名」。
//
//  ⚠ 純呈現：只讀 `frameRef.current.effects`（與 HeroVfxRuntime 同一份資料），
//    不讀 snapshot、不寫任何 store。`pointer-events: none`，不擋點擊。
//  ⚠ 每 120ms 取樣一次，id 集合沒變就不 setState（避免每幀重繪 DOM）。
//  ⚠ 同時最多 4 個標籤，R 優先（大招最值得被看見）。
// ============================================================================
import React, { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { compileHeroSkill } from "../skills/heroSkillContract.js";

const MAX_CALLOUTS = 4;
/** 標籤只在技能前段顯示（progress 0–1 對應整段呈現壽命）。 */
const SHOW_UNTIL_PROGRESS = 0.6;
const SAMPLE_MS = 120;

const nameCache = new Map();
function skillLabel(skillId, heroId) {
  if (nameCache.has(skillId)) return nameCache.get(skillId);
  const slot = skillId.slice((heroId?.length ?? 0) + 1);
  let name = null;
  try { name = compileHeroSkill(heroId, slot)?.name ?? null; } catch { name = null; }
  const label = name ? `${slot} · ${name}` : slot;
  nameCache.set(skillId, label);
  return label;
}

export default function SkillCastCallouts({ frameRef }) {
  const [items, setItems] = useState([]);
  const acc = useRef({ last: 0, key: "" });
  useFrame(() => {
    const now = performance.now();
    if (now - acc.current.last < SAMPLE_MS) return;
    acc.current.last = now;
    const list = [];
    for (const fx of frameRef?.current?.effects ?? []) {
      const heroId = fx.presentation?.heroId;
      if (!fx.skillId || !heroId || !fx.world || !(fx.progress < SHOW_UNTIL_PROGRESS)) continue;
      list.push({
        id: fx.id, skillId: fx.skillId, label: skillLabel(fx.skillId, heroId),
        ult: fx.skillId.endsWith(":R"),
        side: String(fx.sourceId ?? "")[0] === "r" ? "red" : "blue",
        x: fx.world.x, y: fx.world.y, z: fx.world.z,
      });
    }
    list.sort((a, b) => Number(b.ult) - Number(a.ult));
    const next = list.slice(0, MAX_CALLOUTS);
    const key = next.map((n) => n.id).join("|");
    if (key !== acc.current.key) { acc.current.key = key; setItems(next); }
  });
  return (
    <group name="skill-cast-callouts">
      {items.map((n) => (
        <Html key={n.id} position={[n.x, n.y + 3.4, n.z]} center zIndexRange={[5, 0]}
          style={{ pointerEvents: "none" }}>
          <span data-testid="skill-cast-callout" data-skill={n.skillId} style={{
            display: "inline-block", whiteSpace: "nowrap",
            font: `800 ${n.ult ? 11 : 10}px system-ui,sans-serif`,
            color: "#fff",
            background: n.side === "red" ? "rgba(127,29,29,.86)" : "rgba(23,52,112,.86)",
            border: `1px solid ${n.ult ? "#fbbf24" : n.side === "red" ? "#f87171" : "#60a5fa"}`,
            padding: "1px 6px", borderRadius: 999,
            boxShadow: n.ult ? "0 0 8px rgba(251,191,36,.7)" : "0 1px 3px rgba(0,0,0,.6)",
            textShadow: "0 1px 2px #000",
          }}>{n.label}</span>
        </Html>
      ))}
    </group>
  );
}
