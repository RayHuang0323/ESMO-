// ============================================================================
//  battle/moba/replay/replayPresentationSource.js — Replay → 呈現資料源（Sprint29B6）
//
//  身分：**唯讀 presentation adapter**。把 `MobaReplay.v1` 的 frame 換算成
//    `MobaView3D` 認得的 `{ prev, snapshot, subTRef }`，讓**重播與現場對戰共用
//    同一套 3D 戰場**（29B6 前重播只有一張自己的 SVG 小地圖，跟現場是兩套東西）。
//
//  ⚠ 鐵律（與 MobaReplayScreen 同）：
//    · 不 import LogicEngine、不 tick ⇒ **不是重新模擬**，只是把存好的 frame 攤開。
//    · 不 import 也不寫任何 Store（useGameStore / battleStore / profileStore）
//      ⇒ 重播**不可能**觸發終局結算、再次發獎、再次入史。
//    · 介面只暴露 `getState()`（MobaView3D 只呼叫這個）與 `seek()`；沒有 setState。
//
//  ── 為什麼是 prev / snapshot / subT ──────────────────────────────────────
//  現場的 MobaView3D 畫的是 `lerp(prev → snapshot, ease(subT))`。把 replay 的
//  「時間 t 落在 frame a、b 之間、插值係數 f」直接對應成 prev=a、snapshot=b、subT=f，
//  重播就會走**與現場逐行相同**的插值、受擊閃光、死亡淡出程式碼路徑
//  ⇒ 兩邊的視覺必然一致（29B6 D 項的 objective 死亡同步同時涵蓋重播）。
//
//  ── 誠實的資料缺口（不用假資料填補）────────────────────────────────────
//    · **小兵**：`MobaReplay.v1` 的 frame 不含小兵（每幀 96 隻會讓容量翻倍）
//      ⇒ 重播不畫小兵。這是擷取層的限制，不在畫面上編造。
//    · `state`（撤退/回城/團戰徽章）、`respawn` 秒數、`contested`、fx / feed /
//      recallEvents 同樣未擷取 ⇒ 一律給 null / 空陣列，讓 view 顯示「無」而不是猜。
//    · 舊 replay（無 `mapMeta` / 無 `objectivesMeta`）由呼叫端判斷是否可用 3D，
//      不可用時退回 2D SVG（見 `canUse3DPresentation`）。
// ============================================================================
import { WORLD_BOUNDS, PITS } from "../../../gameData.js";

const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

const EMPTY_LANES = Object.freeze({
  top: { bm: [], rm: [] }, mid: { bm: [], rm: [] }, bot: { bm: [], rm: [] },
});

/**
 * 這份 replay 能不能用 3D 戰場重播？
 *  條件：帶 `mapMeta.bounds` 且**與目前世界尺度一致**。
 *  舊 replay 是 100×100 座標，而 3D 場景是由目前的 `gameData`（220×220）建的
 *  ⇒ 硬畫會把所有東西擺錯位置。這種情況退回 2D SVG（它有 legacyBounds 相容）
 *  ⇒ **不白畫面、也不顯示錯誤的地圖**。
 */
export function canUse3DPresentation(replay) {
  const b = replay?.mapMeta?.bounds;
  if (!b || !replay?.frames?.length) return false;
  return b.width === WORLD_BOUNDS.width && b.height === WORLD_BOUNDS.height
    && b.minX === WORLD_BOUNDS.minX && b.minY === WORLD_BOUNDS.minY;
}

/** 目前時間 t → 前後 frame + 插值係數（frames.t 遞增；二分搜尋）。 */
export function frameAt(frames, t) {
  if (!frames.length) return { a: null, b: null, f: 0 };
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (frames[mid].t <= t) lo = mid; else hi = mid - 1; }
  const a = frames[lo], b = frames[Math.min(lo + 1, frames.length - 1)];
  const f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
  return { a, b, f };
}

export function createReplaySource(replay) {
  const frames = replay?.frames ?? [];
  const playersMeta = replay?.playersMeta ?? [];
  const towersMeta = replay?.towersMeta ?? {};
  const objectivesMeta = replay?.objectivesMeta ?? [];
  const subTRef = { current: 0 };

  // 舊 replay 沒有 objectivesMeta ⇒ 由 frame.dr / frame.br 合成最小的龍/巴龍條目
  //   （沿用目前 gameData 的坑位座標；此路徑只在 canUse3DPresentation 為 true，
  //     也就是世界尺度相符時才會被用到）。營地無來源 ⇒ 不編造。
  const fallbackObjMeta = objectivesMeta.length ? null : [
    { id: "dragon", type: "dragon", side: null, presentationKey: "dragon", pos: { ...PITS.dragon } },
    { id: "baron", type: "baron", side: null, presentationKey: "baron", pos: { ...PITS.baron } },
  ];
  const objMeta = objectivesMeta.length ? objectivesMeta : fallbackObjMeta;

  /** frame → 引擎 snapshot 形狀（只填真的有擷取到的欄位；其餘 null / 空）。 */
  const toSnapshot = (f) => {
    if (!f) return null;
    const obOf = (i, id) => {
      if (Array.isArray(f.ob)) return clamp01(f.ob[i]);          // S29B2+：hp 值（0=死）
      if (id === "dragon") return f.dr === 1 ? 1 : 0;            // 舊 replay：只有存活位元
      if (id === "baron") return f.br === 1 ? 1 : 0;
      return 0;
    };
    const objectives = (objMeta ?? []).map((om, i) => {
      const hp = obOf(i, om.id);
      return {
        id: om.id, type: om.type, side: om.side ?? null,
        presentationKey: om.presentationKey ?? om.id, pos: { ...om.pos },
        alive: hp > 0, hp, maxHp: 1,
        respawn: null,            // 未擷取：不猜倒數秒數
        killerTeam: null, participants: [],
      };
    });
    const byId = (id) => objectives.find((o) => o.id === id);
    const legacyMirror = (id, bit) => {
      const o = byId(id);
      const alive = o ? o.alive : bit === 1;
      return { alive, hp: o ? o.hp * 100 : (alive ? 100 : 0), respawn: 0, contested: false };
    };
    return {
      ts: f.t ?? 0,
      players: playersMeta.map((pm, i) => {
        const row = f.p?.[i];
        return {
          id: pm.id, side: pm.side, role: pm.role,
          pos: { x: row?.[0] ?? 0, y: row?.[1] ?? 0 },
          hp: clamp01(row?.[2] ?? 0),
          dead: row?.[3] === 1,
          k: row?.[4] ?? 0, d: row?.[5] ?? 0, a: row?.[6] ?? 0,
          gold: row?.[7] ?? 0, lv: row?.[8] ?? 1,
          respawn: null,          // 未擷取：view 顯示「陣亡」而不是假的 0s 倒數
          state: null,            // 未擷取：不顯示撤退/回城/團戰徽章
          sp: null,
        };
      }),
      towers: Object.fromEntries(Object.entries(towersMeta).map(([id, tw]) => [id, {
        side: tw.side, lane: tw.lane, tier: tw.tier ?? 0,
        pos: { ...tw.pos }, hp: clamp01(f.tw?.[id] ?? 0),
      }])),
      lanes: EMPTY_LANES,         // 未擷取小兵（見檔頭「誠實的資料缺口」）
      dragon: legacyMirror("dragon", f.dr),
      baron: legacyMirror("baron", f.br),
      objectives,
      feed: [], fx: [], recallEvents: [],
      bK: f.s?.[0] ?? 0, rK: f.s?.[1] ?? 0,
      bGold: f.g?.[0] ?? 0, rGold: f.g?.[1] ?? 0,
      winProb: Number.isFinite(f.wp) ? f.wp : 0.5,
      over: false, winner: null,
    };
  };

  const first = toSnapshot(frames[0]);
  let state = { prev: first, snapshot: first, subTRef };

  return {
    /** MobaView3D / BattleCameraController 唯一會呼叫的介面（**只讀**）。 */
    getState: () => state,
    /** 播放器把時間軸推到 t：換算前後 frame 與插值係數（不模擬、不寫 Store）。 */
    seek(t) {
      const { a, b, f } = frameAt(frames, t);
      if (!a) return;
      state = { prev: toSnapshot(a), snapshot: toSnapshot(b) ?? toSnapshot(a), subTRef };
      subTRef.current = f;
    },
    hasFrames: frames.length > 0,
  };
}
