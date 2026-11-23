// ============================================================================
//  tools/c2/c2_preview_hook.js — exists only in the 5648 C2 preview build (vite.c2-preview.config.mjs); the production build never reads it.
//  Loads the C1 measurement API unchanged (window.__esmoC1: runTool, runLive, stateLeavesAt, live, liveState, geometry) and adds the read-only
//  per-kernel geometry probe window.__esmoC2 (tools/c2/c2_geometry_digest.js). forceMatch is the C1 one (records the live match, returns it unchanged).
// ============================================================================
import { geometryDigestKernel, geometryLeavesKernel, C2_GEOMETRY_VERSION } from "./c2_geometry_digest.js";
export { forceMatch } from "../c1/c1_preview_hook.js";

if (typeof window !== "undefined") {
  window.__esmoC2 = {
    geometryVersion: C2_GEOMETRY_VERSION,
    geometryDigest(kernelId) { return geometryDigestKernel(kernelId); },
    geometryLeaves(cat, kernelId) { return geometryLeavesKernel(cat, kernelId); },
  };
}
