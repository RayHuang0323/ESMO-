// ============================================================================
//  ui/useViewport.js — 視窗/裝置判斷（Sprint29B2）
//  battle UI 的手機/桌機分歧唯一來源：寬度 < MOBILE_MAX 或 觸控為主 ⇒ mobile。
//  純呈現層 hook：不碰引擎、不碰 Store、不影響模擬。
// ============================================================================
import { useEffect, useState } from "react";

export const MOBILE_MAX = 700;   // px；≤700 視為手機/窄視窗（涵蓋 320/360/390/430）

export function isMobileViewport() {
  if (typeof window === "undefined") return false;
  const w = window.innerWidth ?? 1280;
  const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  return w <= MOBILE_MAX || (coarse && w <= 900);
}

/** 響應式 mobile 判斷（resize/orientation 變更即更新）。 */
export function useIsMobile() {
  const [mobile, setMobile] = useState(() => isMobileViewport());
  useEffect(() => {
    const onR = () => setMobile(isMobileViewport());
    window.addEventListener("resize", onR);
    window.addEventListener("orientationchange", onR);
    return () => { window.removeEventListener("resize", onR); window.removeEventListener("orientationchange", onR); };
  }, []);
  return mobile;
}
