import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/**
 * Shared management-screen entrance motion.
 * Selectors are scoped, animations are revertable, and reduced motion keeps
 * the final state without movement.
 */
export function usePlayerUiMotion(rootRef, { mobile = false, selectedId = null, tab = "overview", mode = "MOBA" } = {}) {
  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const header = root.querySelector("[data-player-ui-header]");
    const modal = root.querySelector("[data-player-ui-modal-body]");
    const modalRoot = modal?.closest("[data-player-ui-reveal]");
    const revealNodes = Array.from(root.querySelectorAll("[data-player-ui-reveal]:not([data-player-ui-modal-body])"))
      .filter((node) => node !== modalRoot)
      .slice(0, 14);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const targets = [header, ...revealNodes, modalRoot, modal].filter(Boolean);

    gsap.set(targets, { autoAlpha: 1, y: 0, scale: 1 });
    if (reduced) return undefined;

    const timeline = gsap.timeline({ defaults: { ease: "power2.out" } });
    if (header) {
      timeline.fromTo(header, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.22, clearProps: "transform" });
    }
    if (modalRoot) {
      timeline.fromTo(modalRoot, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.16 }, header ? "-=0.08" : 0);
    }
    if (modal) {
      timeline.fromTo(
        modal,
        { autoAlpha: 0, y: mobile ? 18 : 10 },
        { autoAlpha: 1, y: 0, duration: 0.24, clearProps: "transform" },
        modalRoot ? "-=0.04" : header ? "-=0.08" : 0,
      );
    }
    if (revealNodes.length) {
      timeline.fromTo(
        revealNodes,
        { autoAlpha: 0, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.24, stagger: mobile ? 0.018 : 0.032, clearProps: "transform" },
        "-=0.08",
      );
    }
    return () => timeline.kill();
  }, { scope: rootRef, dependencies: [mobile, selectedId, tab, mode], revertOnUpdate: true });
}
