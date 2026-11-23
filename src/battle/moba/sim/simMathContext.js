// ============================================================================
//  battle/moba/sim/simMathContext.js — which math the MOBA simulation is using RIGHT NOW (moba-sim.v26, C2 det.v2, 2026-11-23)
//
//  The default is the NATIVE kernel: Math.hypot exactly as before ⇒ v20–v25 keep their original computation path and results.
//  A det.v2 engine runs its constructor, every configure*() call made by the assembler and every tick()/snapshot() inside
//  withSimKernel(DET_V2_SIM_KERNEL, …). JavaScript runs one simulation step at a time and the engine is synchronous, so the kernel is "dynamic
//  scope": it is in effect exactly while that engine's code runs and is always restored afterwards (try/finally), even when two engines with
//  different kernels live in the same process (balance tools, the browser preview).
//  Kernel-aware shared code (gameData dist/posOnLane/laneLength, navigation, tower placement, tactic execution, items) asks hypot() /
//  isDetSimKernel() here; caches that depend on the kernel are keyed by simKernelId().
//  Map geometry modules keep their own native Math (v18 terrain is frozen); only the paths with measured cross-engine divergence go through here.
// ============================================================================
import { detHypot } from "./detHypot.js";

export const NATIVE_SIM_KERNEL = Object.freeze({ id: "native", det: false });
export const DET_V2_SIM_KERNEL = Object.freeze({ id: "det.v2", det: true });
let current = NATIVE_SIM_KERNEL;

export const currentSimKernel = () => current;
export const simKernelId = () => current.id;
export const isDetSimKernel = () => current.det;
/** Kernel object for a ruleset mathKernel value ("det.v2" ⇒ deterministic; anything else, including "det.v1", ⇒ native here). */
export const simKernelFor = (mathKernel) => (mathKernel === "det.v2" ? DET_V2_SIM_KERNEL : NATIVE_SIM_KERNEL);

/** Run fn with `kernel` in effect; always restores the previous kernel. */
export function withSimKernel(kernel, fn) {
  const prev = current;
  current = kernel;
  try { return fn(); } finally { current = prev; }
}

/** 2-argument hypot of the kernel in effect: native ⇒ Math.hypot (unchanged), det.v2 ⇒ DetHypot.v1. */
export function hypot(x, y) {
  return current.det ? detHypot(x, y) : Math.hypot(x, y);
}
