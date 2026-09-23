// ============================================================================
//  battle/moba/render/SkillCastCallouts.jsx — 技能施放標籤（Battle UX hotfix）
//
//  總覽鏡頭下英雄只有約 20px，就算 VFX 放大了，玩家仍很難判斷「剛剛那是技能」。
//  施放的前 ~0.8 秒在施放者頭上顯示一個小標籤：「R · 技能名」。
//
//  ── Battle Condition UX 調整 ────────────────────────────────────────────────
//  文字再縮一級（R 10px／其餘 9px，原本 11／10），並依欄位給不同的入場動畫：
//    Q 斜切進場・W 柔和脈動・E 側移・R 重擊落下＋金色光暈
//  ⚠ 文字是 VFX 的**輔助**：動畫一律 ≤ 0.42 秒、只做位移／縮放／透明度，
//    不加背景放大或長時間停留 ⇒ 不會蓋過技能特效本身。
//  ⚠ 2×／4× 時技能事件更密集 ⇒ 同時最多 3 個標籤（原本 4），R 優先。
//
//  ⚠ 純呈現：只讀 `frameRef.current.effects`（與 HeroVfxRuntime 同一份資料），
//    不讀 snapshot、不寫任何 store。`pointer-events: none`，不擋點擊。
//  ⚠ 每 120ms 取樣一次，id 集合沒變就不 setState（避免每幀重繪 DOM）。
// ============================================================================
import React, { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { compileHeroSkill } from "../skills/heroSkillContract.js";

const MAX_CALLOUTS = 3;
/** 標籤只在技能前段顯示（progress 0–1 對應整段呈現壽命）。 */
const SHOW_UNTIL_PROGRESS = 0.6;
const SAMPLE_MS = 120;

/**
 * 可重用的文字動畫：四個欄位各一種語彙，全部 ≤ 0.42s。
 * keyframes 只注入一次（同一個 <style> 給所有標籤共用）。
 */
const CALLOUT_CSS = `
@keyframes esmo-callout-q { from { opacity: 0; transform: translate(-6px, 4px) scale(.82); }
  60% { opacity: 1; transform: translate(0,0) scale(1.04); } to { opacity: 1; transform: none; } }
@keyframes esmo-callout-w { from { opacity: 0; transform: scale(.9); }
  55% { opacity: 1; transform: scale(1.06); } to { opacity: .96; transform: scale(1); } }
@keyframes esmo-callout-e { from { opacity: 0; transform: translateX(10px); }
  65% { opacity: 1; transform: translateX(-2px); } to { opacity: 1; transform: none; } }
@keyframes esmo-callout-r { from { opacity: 0; transform: translateY(-9px) scale(1.25); }
  45% { opacity: 1; transform: translateY(1px) scale(.97); }
  70% { transform: translateY(0) scale(1.03); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  [data-testid="skill-cast-callout"] { animation: none !important; }
}
`;
const ANIM = { Q: "esmo-callout-q .30s ease-out", W: "esmo-callout-w .34s ease-out",
  E: "esmo-callout-e .28s ease-out", R: "esmo-callout-r .42s cubic-bezier(.2,.9,.25,1)" };

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

const slotOf = (skillId) => {
  const s = String(skillId ?? "").slice(-1);
  return "QWER".includes(s) ? s : "Q";
};

/** keyframes 只注入一次（掛在 document.head，不是每個標籤一份）。 */
function useCalloutStyles() {
  useEffect(() => {
    if (typeof document === "undefined" || document.getElementById("esmo-skill-callout-css")) return undefined;
    const el = document.createElement("style");
    el.id = "esmo-skill-callout-css";
    el.textContent = CALLOUT_CSS;
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, []);
}

export default function SkillCastCallouts({ frameRef }) {
  const [items, setItems] = useState([]);
  const acc = useRef({ last: 0, key: "" });
  useCalloutStyles();
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
        slot: slotOf(fx.skillId),
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
          <span data-testid="skill-cast-callout" data-skill={n.skillId} data-slot={n.slot} style={{
            display: "inline-block", whiteSpace: "nowrap",
            font: `800 ${n.ult ? 10 : 9}px system-ui,sans-serif`,
            letterSpacing: n.ult ? ".02em" : 0,
            color: "#fff",
            background: n.side === "red" ? "rgba(127,29,29,.82)" : "rgba(23,52,112,.82)",
            border: `1px solid ${n.ult ? "#fbbf24" : n.side === "red" ? "#f87171" : "#60a5fa"}`,
            padding: n.ult ? "1px 6px" : "0 5px", borderRadius: 999,
            boxShadow: n.ult ? "0 0 7px rgba(251,191,36,.66)" : "0 1px 3px rgba(0,0,0,.6)",
            textShadow: "0 1px 2px #000",
            animation: ANIM[n.slot] ?? ANIM.Q,
          }}>{n.label}</span>
        </Html>
      ))}
    </group>
  );
}
