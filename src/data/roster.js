// ============================================================================
//  data/roster.js — 隊伍名單與英雄指派（Sprint09：heroId 對接 CHAMPIONS_100）
//  MOBA 資料模型：Player（選手）→ 操作 Hero（英雄）。
//  heroId 必須存在於 data/heroDatabase.js（唯一英雄資料庫）；依 lane 指派。
// ============================================================================
import { heroById } from "./heroDatabase.js";

export const TEAMS = {
  blue: { name: "德國海豹", emoji: "🦭" },
  red:  { name: "赤焰軍團", emoji: "🔥" },
};

//                 選手           heroId（CHAMPIONS_100）   lane
export const ROSTER = {
  b1: { player: "Kaiser",  heroId: "ironclad"   }, // 坦克/上路 鋼鐵衛士
  b2: { player: "Nacht",   heroId: "duskblade"  }, // 刺客/打野 暮刃
  b3: { player: "Frost",   heroId: "bingshuang" }, // 法師/中路 冰霜術士
  b4: { player: "Blitz",   heroId: "leiting"    }, // 射手/下路 雷霆神射
  b5: { player: "Seelöwe", heroId: "dadi"       }, // 坦克/輔助 大地守衛
  r1: { player: "Ember",   heroId: "cinderfist" }, // 戰士/上路 炎拳
  r2: { player: "Ash",     heroId: "chichuan"   }, // 戰士/打野 赤炎武神
  r3: { player: "Pyre",    heroId: "lieyan"     }, // 法師/中路 烈焰先知
  r4: { player: "Cinder",  heroId: "yanfeng"    }, // 射手/下路 炎鳳射手
  r5: { player: "Scoria",  heroId: "stoneguard" }, // 坦克/輔助 石衛
};
// hero 中文名由資料庫推導（單一來源，不重複儲存）
for (const r of Object.values(ROSTER)) r.hero = heroById(r.heroId)?.zh ?? r.heroId;

export const HERO_ASSIGN = Object.fromEntries(Object.entries(ROSTER).map(([pid, r]) => [pid, r.heroId]));
export const ALL_HERO_IDS = [...new Set(Object.values(HERO_ASSIGN))];
