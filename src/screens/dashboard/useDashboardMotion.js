import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/**
 * Club Identity v2 — 換皮膚／換橫幅／換稱號時的一次性轉場。
 *
 * ⚠ **一次性，不是常駐動畫。** Motion Policy 的分工：常駐動態只表達狀態
 *   （隊徽光暈，而且常青綠連那個都不動），狀態**改變**的那一刻才播轉場。
 *   把轉場做成常駐迴圈，畫面就會一直在動，390px 也一直在付繪製成本。
 *
 * ⚠ 只動 `opacity` / `scale` / `x` ⇒ 純合成層，不觸發 reflow。
 *
 * 首次掛載**不播**：一進首頁就閃一下不是回饋，是雜訊。
 *
 * @param {object} rootRef      Dashboard 根節點
 * @param {string} identityKey  皮膚／橫幅／隊徽框／稱號的組合鍵，變了才播
 */
export function useIdentityTransition(rootRef, identityKey) {
  const seenRef = useRef(null);

  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const first = seenRef.current === null;
    seenRef.current = identityKey;
    if (first) return undefined;

    const skins = root.querySelectorAll(
      ".esmo-hero__skin, .esmo-hero__banner, .esmo-mobile-header__skin, .esmo-mobile-header__banner");
    const crest = root.querySelector(".esmo-hero__crest, .esmo-mobile-header__crest");
    const title = root.querySelector('[data-testid="club-identity-title"]');
    const media = gsap.matchMedia();

    //  reduced-motion：直接停在最終狀態，不做任何位移。
    media.add("(prefers-reduced-motion: reduce)", () => {
      if (skins.length) gsap.set(skins, { autoAlpha: 1, scale: 1 });
      if (crest) gsap.set(crest, { scale: 1 });
      if (title) gsap.set(title, { autoAlpha: 1, x: 0 });
    });

    media.add("(prefers-reduced-motion: no-preference)", () => {
      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
      if (skins.length) {
        tl.fromTo(skins,
          { autoAlpha: 0, scale: 1.014 },
          { autoAlpha: 1, scale: 1, duration: 0.52, clearProps: "transform" }, 0);
      }
      //  隊徽蓋章：短、帶一點過衝，像把徽章壓上去。
      if (crest) {
        tl.fromTo(crest,
          { scale: 0.93 },
          { scale: 1, duration: 0.44, ease: "back.out(2.2)", clearProps: "transform" }, 0.04);
      }
      if (title) {
        tl.fromTo(title,
          { autoAlpha: 0, x: -8 },
          { autoAlpha: 1, x: 0, duration: 0.36, clearProps: "transform" }, 0.12);
      }
      return () => tl.kill();
    });

    return () => media.revert();
  }, { scope: rootRef, dependencies: [identityKey] });
}

/**
 * Dashboard-only motion language.
 *
 * All selectors are scoped to the Dashboard root, all media-query timelines
 * are reverted by useGSAP, and reduced-motion keeps the final visual state
 * without movement.
 */
export function useDashboardMotion(rootRef, isMobile = false) {
  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const revealNodes = root.querySelectorAll("[data-dashboard-reveal]");
    const progressNodes = root.querySelectorAll("[data-dashboard-progress]");
    const pulseNodes = root.querySelectorAll("[data-dashboard-pulse]");
    const ambientNodes = root.querySelectorAll("[data-dashboard-ambient]");
    const mobileNav = root.querySelector("[data-dashboard-mobile-nav]");
    const media = gsap.matchMedia();

    media.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(revealNodes, { autoAlpha: 1, y: 0 });
      gsap.set(progressNodes, { scaleX: 1, transformOrigin: "left center" });
      if (ambientNodes.length) gsap.set(ambientNodes, { x: 0, y: 0, rotation: 0 });
      if (mobileNav) gsap.set(mobileNav, { autoAlpha: 1, y: 0 });
    });

    media.add("(prefers-reduced-motion: no-preference)", () => {
      const intro = gsap.timeline({ defaults: { ease: "power2.out" } });
      intro.fromTo(
        revealNodes,
        { autoAlpha: 0, y: 14 },
        { autoAlpha: 1, y: 0, duration: 0.48, stagger: 0.055, clearProps: "transform" },
      );
      if (mobileNav) {
        intro.fromTo(mobileNav, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.34, clearProps: "transform" }, "-=0.16");
      }

      progressNodes.forEach((node) => {
        gsap.fromTo(
          node,
          { scaleX: 0, transformOrigin: "left center" },
          { scaleX: 1, duration: 0.8, delay: 0.25, ease: "power3.out" },
        );
      });

      const pulses = [];
      pulseNodes.forEach((node) => {
        pulses.push(gsap.to(node, {
          opacity: 0.42,
          scale: 0.82,
          duration: 1.9,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        }));
      });

      const ambient = ambientNodes.length
        ? gsap.to(ambientNodes, {
          x: 8,
          y: -5,
          rotation: 1.2,
          duration: 8,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        })
        : null;

      return () => {
        intro.kill();
        pulses.forEach((tween) => tween.kill());
        ambient?.kill();
      };
    });

    return () => media.revert();
  }, { scope: rootRef, dependencies: [isMobile], revertOnUpdate: true });
}
