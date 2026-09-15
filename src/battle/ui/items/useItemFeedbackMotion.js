// ============================================================================
//  battle/ui/items/useItemFeedbackMotion.js — 裝備 UI 的遊戲回饋動效（Item System M3a）
//
//  只有三個「回應事件」的時刻（規格 §7），全部：
//   · 走 gsap.matchMedia 的 reduced-motion 分支（reduce ⇒ 直接最終狀態）
//   · 只動 transform／opacity，單段 ≤ 0.6s
//   · 不改 state、不擋互動
//  ⚠ 裝備 UI 內 GSAP 只能出現在本檔（check_moba_items_m3 G4）。
// ============================================================================
import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

const REDUCE = "(prefers-reduced-motion: reduce)";
const FULL = "(prefers-reduced-motion: no-preference)";

/** 購買通知：滑入；完成裝再加一道金色掃光。replayKey 改變 ⇒ 重播一次。 */
export function useToastMotion(rootRef, { completed = false, replayKey = 0 } = {}) {
  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const shine = root.querySelector("[data-toast-shine]");
    const media = gsap.matchMedia();
    media.add(REDUCE, () => {
      gsap.set(root, { autoAlpha: 1, x: 0 });
      if (shine) gsap.set(shine, { autoAlpha: 0 });
    });
    media.add(FULL, () => {
      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
      tl.fromTo(root, { autoAlpha: 0, x: -12 }, { autoAlpha: 1, x: 0, duration: 0.36 });
      if (completed && shine) {
        tl.fromTo(shine, { xPercent: -120, autoAlpha: 0.9 }, { xPercent: 280, autoAlpha: 0, duration: 0.5, ease: "power1.inOut" }, "-=0.12");
      }
      return () => tl.kill();
    });
    return () => media.revert();
  }, { scope: rootRef, dependencies: [replayKey, completed], revertOnUpdate: true });
}

/** 插槽獲得新裝：彈回＋亮一次。acquireKey 為 null ⇒ 不做（首次渲染不閃）。 */
export function useSlotAcquireMotion(slotRef, acquireKey) {
  useGSAP(() => {
    const el = slotRef.current;
    if (!el || acquireKey == null) return undefined;
    const flash = el.querySelector("[data-slot-flash]");
    const media = gsap.matchMedia();
    media.add(REDUCE, () => {
      gsap.set(el, { scale: 1 });
      if (flash) gsap.set(flash, { autoAlpha: 0 });
    });
    media.add(FULL, () => {
      const tl = gsap.timeline();
      tl.fromTo(el, { scale: 0.9 }, { scale: 1, duration: 0.32, ease: "back.out(2.2)" });
      if (flash) tl.fromTo(flash, { autoAlpha: 0.85 }, { autoAlpha: 0, duration: 0.32, ease: "power1.out" }, 0);
      return () => tl.kill();
    });
    return () => media.revert();
  }, { dependencies: [acquireKey], revertOnUpdate: true });
}

/** 戰術卡被選中：輕微回彈＋金光退去。首次渲染不播。 */
export function useCardSelectMotion(cardRef, selected) {
  const mounted = useRef(false);
  useGSAP(() => {
    const el = cardRef.current;
    if (!mounted.current) { mounted.current = true; return undefined; }
    if (!el || !selected) return undefined;
    const glow = el.querySelector("[data-card-glow]");
    const media = gsap.matchMedia();
    media.add(REDUCE, () => {
      gsap.set(el, { scale: 1 });
      if (glow) gsap.set(glow, { autoAlpha: 0 });
    });
    media.add(FULL, () => {
      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
      tl.fromTo(el, { scale: 0.98 }, { scale: 1, duration: 0.22 });
      if (glow) tl.fromTo(glow, { autoAlpha: 0.5 }, { autoAlpha: 0, duration: 0.4 }, 0);
      return () => tl.kill();
    });
    return () => media.revert();
  }, { dependencies: [selected], revertOnUpdate: true });
}
