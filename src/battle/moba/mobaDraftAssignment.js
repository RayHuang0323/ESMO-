// ============================================================================
//  battle/moba/mobaDraftAssignment.js — 選手／英雄／五路自動分配（Milestone I）
//
//  Ban/Pick 選完五隻英雄之後，誰去哪一路、由哪位選手操作，現在是**靠席位順序
//  硬對位**（picks[i] → b(i+1)）。選到兩隻中路英雄也照樣塞，玩家看不出衝突。
//
//  本檔用**可解釋的評分 + 窮舉最佳解**取代那個順序假設：
//    · 英雄位置適性：heroDatabase 的 lane（主）＋ heroClassification 的標籤（次）
//    · 選手位置熟練：profileStore 的 role（主）＋ 16 項能力對該位置的適配
//    · 陣容衝突：兩隻英雄搶同一路、或該路沒有任何合適人選
//  5 隻英雄 × 5 個位置只有 120 種排列 ⇒ **直接全部算過取最高分**，
//  平手時以席位順序字典序決勝 ⇒ 結果**完全決定性**，不抽 rng、不看呼叫順序。
//
//  ⚠ 邊界：本檔只決定「誰在哪一路」，不改任何戰鬥數值。
//    輸出會經 buildBattleRoster / mobaHeroProfile 進入既有管線。
// ============================================================================

/** 五個位置（順序＝席位 b1–b5／r1–r5）。 */
export const LANES = Object.freeze(["上路", "打野", "中路", "下路", "輔助"]);

/** 位置適配時參考的能力（與 mobaRosterAdapter 的 16 維同名）。 */
const LANE_STATS = Object.freeze({
  上路: ["resilience", "positioning", "courage"],
  打野: ["mapAware", "apm", "decision"],
  中路: ["reflex", "tacticalIQ", "accuracy"],
  下路: ["accuracy", "positioning", "focus"],
  輔助: ["comms", "leadership", "mapAware"],
});
const NEUTRAL_STAT = 70;

/** 英雄對某位置的適性 0–1（主位置 1.0；次要標籤可支援的相鄰位置給部分分）。 */
export function heroLaneFit(hero, lane, tags = null) {
  if (!hero) return 0;
  if (hero.lane === lane) return 1;
  const t = tags ?? [hero.arch];
  //  次要標籤能撐的位置：法師→中路、刺客→打野/中路、坦克→上路/輔助、
  //  戰士→上路/打野、射手→下路、輔助→輔助。這是定位語彙的自然對應，不是隨意表。
  const BY_TAG = {
    法師: ["中路"], 刺客: ["打野", "中路"], 坦克: ["上路", "輔助"],
    戰士: ["上路", "打野"], 射手: ["下路"], 輔助: ["輔助"],
  };
  for (const tag of t) if (BY_TAG[tag]?.includes(lane)) return 0.55;
  return 0.15;   // 不是零：真的沒人適合時仍要能排出陣容，只是分數低（會顯示衝突）
}

/** 選手對某位置的熟練 0–1（本位 1.0；其餘依該位置的關鍵能力相對中性值評分）。 */
export function playerLaneFit(player, lane) {
  if (!player) return 0.5;                       // 無選手資料 ⇒ 中性，不獎不罰
  if (player.role === lane) return 1;
  const keys = LANE_STATS[lane] ?? [];
  if (!keys.length || !player.stats) return 0.5;
  const avg = keys.reduce((s, k) => s + (Number.isFinite(player.stats[k]) ? player.stats[k] : NEUTRAL_STAT), 0) / keys.length;
  //  70 分（中性）⇒ 0.5；100 分 ⇒ 0.8；40 分 ⇒ 0.2
  return Math.max(0.1, Math.min(0.9, 0.5 + (avg - NEUTRAL_STAT) / 100));
}

/**
 * 自動分配：五隻英雄 × 五個位置 × 五名選手 → 唯一最佳解。
 *
 * @param {Object}   o
 * @param {Array}    o.picks    Ban/Pick 選到的英雄（依選取順序，長度 ≤5）
 * @param {Object}   o.seatPlayers `{ [seatId]: player|null }`（Milestone E 的先發指派）
 * @param {Array}    o.seats    席位 id 陣列（預設 b1–b5）
 * @param {Function} o.tagsOf   hero → 標籤陣列（呼叫端注入 heroTags）
 * @returns {{assignment:Object, score:number, conflicts:Array}}
 *   assignment: `{ [seatId]: { lane, hero, heroId, player, heroFit, playerFit, note } }`
 */
export function assignDraft({
  picks = [], seatPlayers = {}, seats = ["b1", "b2", "b3", "b4", "b5"], tagsOf = null,
} = {}) {
  const heroes = picks.slice(0, LANES.length);
  const tags = (h) => (typeof tagsOf === "function" ? tagsOf(h) : [h?.arch].filter(Boolean));
  //  每個「英雄 → 位置」的分數（英雄適性 0.65 權重 + 該位置選手熟練 0.35 權重）
  const cell = (heroIndex, laneIndex) => {
    const hero = heroes[heroIndex] ?? null;
    const lane = LANES[laneIndex];
    const player = seatPlayers[seats[laneIndex]] ?? null;
    const hf = heroLaneFit(hero, lane, hero ? tags(hero) : null);
    const pf = playerLaneFit(player, lane);
    return { score: hf * 0.65 + pf * 0.35, hf, pf, hero, lane, player };
  };

  //  窮舉 5! = 120 種排列取最高分；平手取字典序最小的排列 ⇒ 完全決定性。
  const idx = heroes.map((_, i) => i);
  let best = null;
  const permute = (rest, acc) => {
    if (!rest.length) {
      let total = 0;
      for (let laneIndex = 0; laneIndex < acc.length; laneIndex++) total += cell(acc[laneIndex], laneIndex).score;
      const key = acc.join(",");
      if (!best || total > best.total + 1e-9 || (Math.abs(total - best.total) <= 1e-9 && key < best.key)) {
        best = { total, key, order: [...acc] };
      }
      return;
    }
    for (let i = 0; i < rest.length; i++) {
      permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, rest[i]]);
    }
  };
  permute(idx, []);

  const assignment = {};
  const conflicts = [];
  const order = best?.order ?? idx;
  for (let laneIndex = 0; laneIndex < LANES.length; laneIndex++) {
    const seat = seats[laneIndex];
    const heroIndex = order[laneIndex];
    const c = cell(heroIndex, laneIndex);
    let note = null;
    if (!c.hero) note = "尚未選角";
    else if (c.hf < 0.5) note = `${c.hero.zh} 不擅長${c.lane}`;
    else if (c.hf < 1) note = `${c.hero.zh} 非本位（可勝任${c.lane}）`;
    if (c.hero && c.player && c.player.role && c.player.role !== c.lane) {
      note = note ? `${note}；${c.player.name} 非本位` : `${c.player.name} 非本位（${c.player.role}）`;
    }
    if (note && c.hero) conflicts.push({ seat, lane: c.lane, note });
    assignment[seat] = {
      lane: c.lane, hero: c.hero, heroId: c.hero?.id ?? null, player: c.player,
      heroFit: Math.round(c.hf * 100) / 100, playerFit: Math.round(c.pf * 100) / 100, note,
    };
  }
  return { assignment, score: Math.round((best?.total ?? 0) * 1000) / 1000, conflicts };
}

/** 分配結果 → `{ [seatId]: heroId }`（餵給 buildBattleRoster 的形狀）。 */
export const assignmentToHeroIds = (assignment = {}) =>
  Object.fromEntries(Object.entries(assignment).map(([seat, a]) => [seat, a.heroId]));
