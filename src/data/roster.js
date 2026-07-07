// ============================================================================
//  data/roster.js — 隊伍名單與英雄指派（遊戲內容資料，Sprint08）
//  playerId(b1..r5) → { player, hero, heroId }；heroId 為 Hero Progress 主鍵。
//  ⚠ Sprint02 heroes.js（CHAMPIONS_100）尚未回同步；本檔為主幹目前唯一名單來源，
//    回同步後 heroId 對接該資料庫即可（結構已預留）。
// ============================================================================
export const TEAMS = {
  blue: { name: "德國海豹", emoji: "🦭" },
  red:  { name: "赤焰軍團", emoji: "🔥" },
};
export const ROSTER = {
  b1: { player: "Kaiser",  hero: "山嶽巨像", heroId: "colossus"  },
  b2: { player: "Nacht",   hero: "影襲獵手", heroId: "shadowjag" },
  b3: { player: "Frost",   hero: "霜語術師", heroId: "frostsage" },
  b4: { player: "Blitz",   hero: "疾電射手", heroId: "voltrider" },
  b5: { player: "Seelöwe", hero: "潮汐守衛", heroId: "tideward"  },
  r1: { player: "Ember",   hero: "熔核蠻王", heroId: "magmaking" },
  r2: { player: "Ash",     hero: "灰燼行者", heroId: "ashwalker" },
  r3: { player: "Pyre",    hero: "焚天法師", heroId: "pyremage"  },
  r4: { player: "Cinder",  hero: "燼羽神射", heroId: "cinderbow" },
  r5: { player: "Scoria",  hero: "岩漿聖盾", heroId: "scoriaward"},
};
export const HERO_ASSIGN = Object.fromEntries(Object.entries(ROSTER).map(([pid, r]) => [pid, r.heroId]));
export const ALL_HERO_IDS = [...new Set(Object.values(HERO_ASSIGN))];
