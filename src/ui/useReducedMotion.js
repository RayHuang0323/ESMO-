// ============================================================================
//  ui/useReducedMotion.js — reduced-motion 的唯一判斷出口（Item System M3a 建立）
//
//  `docs/design/ESMO_UIUX設計原則.md` §12：第一個做動態效果的 Sprint 建立本檔，
//  之後所有動效統一走它，不要各自 inline 判斷。
//  ⚠ GSAP 動效另外用 `gsap.matchMedia()` 分支（同一個 media query 字串），
//    本檔給「非 GSAP」的呈現決策用（例如直接不渲染掃光層）。
// ============================================================================
import { useEffect, useState } from "react";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** 同步判斷（SSR／Node／不支援 matchMedia ⇒ false）。 */
export function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

/** React hook：系統設定改變時即時更新。 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}
