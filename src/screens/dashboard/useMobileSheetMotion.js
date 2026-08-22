import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/**
 * Short, shell-scoped sheet motion. The close callback is context-safe so a
 * route change or unmount cannot leave a tween trying to update stale UI.
 */
export function useMobileSheetMotion(rootRef, onClose) {
  const { contextSafe } = useGSAP(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const panel = root.querySelector(".esmo-mobile-sheet");
    const items = root.querySelectorAll(".esmo-mobile-sheet__item");
    const media = gsap.matchMedia();

    media.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(root, { autoAlpha: 1 });
      gsap.set(panel, { autoAlpha: 1, y: 0, scale: 1 });
      gsap.set(items, { autoAlpha: 1, y: 0 });
    });

    media.add("(prefers-reduced-motion: no-preference)", () => {
      const intro = gsap.timeline({ defaults: { ease: "power2.out" } });
      intro
        .fromTo(root, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.16 })
        .fromTo(panel, { autoAlpha: 0, y: 18, scale: 0.985 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.24 }, "<")
        .fromTo(items, { autoAlpha: 0, y: 5 }, { autoAlpha: 1, y: 0, duration: 0.18, stagger: 0.025 }, "-=0.08");

      return () => intro.kill();
    });

    return () => media.revert();
  }, { scope: rootRef });

  return contextSafe(() => {
    const root = rootRef.current;
    const panel = root?.querySelector(".esmo-mobile-sheet");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!root || !panel || reduceMotion) {
      onClose();
      return;
    }

    gsap.timeline({
      defaults: { ease: "power1.in" },
      onComplete: onClose,
    })
      .to(panel, { autoAlpha: 0, y: 12, scale: 0.99, duration: 0.16 })
      .to(root, { autoAlpha: 0, duration: 0.12 }, "<");
  });
}
