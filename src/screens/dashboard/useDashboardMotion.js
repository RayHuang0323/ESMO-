import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

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
