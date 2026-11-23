// ============================================================================
//  tools/c1/c1_state_digest.js — whole-engine state digest for the C1 cross-runtime comparison (Node and browser share this file, 2026-11-23).
//
//  Every tick, walk EVERY own enumerable field of the engine (players, towers, lanes/minions, neutrals/camps, dragon, baron, gold, items runtime,
//  tactic state, logs, rules …) depth-first in key order and feed an exact text form of each primitive into a 64-bit FNV-1a (two 32-bit lanes):
//    numbers → String(v) (round-trips every double exactly; −0 kept as "-0"), strings, booleans, null/undefined, Map/Set entries in order.
//  Nothing is rounded and no state field is skipped. Only functions (the RNG closures and helpers) cannot be read; their effect shows up in the
//  state they produce. Shared objects are visited once per tick (a second reference emits "@<n>"), so cycles terminate.
// ============================================================================
export const C1_DIGEST_VERSION = "C1StateDigest.v1";

/**
 * @param root the engine
 * @param opts.excludeTopKeys engine-level keys to leave out (default none). Only the legacy-golden check uses it, to drop the single config flag
 *        `_detMath` that C1 added to every engine (it is not simulation state; the check asserts it is false separately).
 */
export function stateDigest(root, { excludeTopKeys = null } = {}) {
  let a = 0x811c9dc5 | 0, b = 0x01000193 | 0;
  const feed = (s) => { for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x0100019d); } };
  const seen = new Map();
  const walk = (v) => {
    const t = typeof v;
    if (t === "number") { feed(Object.is(v, -0) ? "n-0;" : "n" + v + ";"); return; }
    if (t === "string") { feed("s" + v.length + ":" + v); return; }
    if (t === "boolean") { feed(v ? "T" : "F"); return; }
    if (v === null) { feed("N"); return; }
    if (t === "undefined") { feed("U"); return; }
    if (t === "function" || t === "symbol") { feed("f"); return; }
    if (t === "bigint") { feed("b" + v + ";"); return; }
    const ref = seen.get(v);
    if (ref !== undefined) { feed("@" + ref + ";"); return; }
    seen.set(v, seen.size);
    if (Array.isArray(v)) { feed("[" + v.length + ":"); for (let i = 0; i < v.length; i++) walk(v[i]); feed("]"); return; }
    if (v instanceof Map) { feed("M" + v.size + ":"); for (const [k, x] of v) { walk(k); walk(x); } feed("}"); return; }
    if (v instanceof Set) { feed("S" + v.size + ":"); for (const x of v) walk(x); feed("}"); return; }
    if (ArrayBuffer.isView(v)) { feed("V" + v.length + ":"); for (let i = 0; i < v.length; i++) walk(v[i]); feed("]"); return; }
    feed("{");
    for (const k of Object.keys(v)) { if (v === root && excludeTopKeys && excludeTopKeys.includes(k)) continue; feed(k); feed("="); walk(v[k]); }
    feed("}");
  };
  walk(root);
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

/** Tick the engine to the end (or capSec), digesting the whole state after every tick. */
export function runDigest(e, capSec = 3000, opts = {}) {
  const perTick = [stateDigest(e, opts)];
  let ticks = 0;
  while (!e.over && e.t < capSec) { e.tick(0.5); ticks++; perTick.push(stateDigest(e, opts)); }
  return { ticks, over: !!e.over, winner: e.winner ?? null, endT: e.t, kills: [e.bK, e.rK], gold: [e.bGold, e.rGold], final: perTick[perTick.length - 1], perTick };
}
