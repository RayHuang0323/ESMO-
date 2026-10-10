// ============================================================================
//  battle/moba/debug/engineStreamHash.js — 引擎逐 tick 串流雜湊（唯一實作）
//
//  【誰在用】
//   · tools/lib/matchGolden.mjs 轉出這裡的函式 ⇒ v20 golden（tools/fixtures/match_golden_v20.json）的
//     streamHash 就是這一份算的；Phase 3a 各 parity gate 也用它。
//   · src/useLocalServer.js 只在 `?shot=` 時以動態 import 載入（不進正式站主 bundle），
//     讓 browser parity gate 能在瀏覽器與 Node 用同一個函式、在同一個 tick 比對。
//
//  ⚠ 這裡的取樣內容與雜湊就是 golden 的定義：改任何一個字 ⇒ 39 個 golden 案全部對不上
//    （tools/check_match_assembler_3a.mjs 會紅）。要換演算法請另開新函式，不要改這幾支。
//
//  純函式：不 import 任何東西、不碰 DOM／時鐘／亂數；只讀引擎的公開狀態，不改模擬。
// ============================================================================

/** 給 build 產物掃描用的識別字串（check_live_setup_3a §S：主 bundle 不得含它）。 */
export const ENGINE_STREAM_HASH_VERSION = "EngineStreamHash.v1";

export const fnv = (s, h = 0x811c9dc5) => {
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
};

/** Stream-hash sample: positions (mm), hp, kills, deaths of every player. */
const sampleOf = (engine) => JSON.stringify(
  engine.players.map((p) => [Math.round(p.pos.x * 1000), Math.round(p.pos.y * 1000), Math.round(p.hp), p.k, p.d]),
);

/** Incremental stream hasher: call `sample(engine)` once per tick, hashes every `every`-th tick. */
export function createStreamHasher(every = 20) {
  let h = 0x811c9dc5, n = 0;
  return {
    sample(engine) { n++; if (n % every === 0) h = fnv(sampleOf(engine), h); },
    get ticks() { return n; },
    get hex() { return h.toString(16); },
  };
}

/**
 * Attach a stream hasher to ONE engine instance (wraps that instance's own `tick`).
 * Returns the hasher; read `.hex` after the run. Does not touch the prototype.
 */
export function engineStreamHash(engine, everyTicks = 20) {
  const hasher = createStreamHasher(everyTicks);
  const orig = engine.tick.bind(engine);
  engine.tick = (...args) => { const r = orig(...args); hasher.sample(engine); return r; };
  return hasher;
}

/** 當下狀態的雜湊（＝ every=1 的 hasher 取樣一次）：同一個 tick 的兩顆引擎可直接比。 */
export function engineStateHash(engine) {
  const now = createStreamHasher(1);
  now.sample(engine);
  return now.hex;
}
