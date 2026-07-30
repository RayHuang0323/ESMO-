// ============================================================================
//  battle/moba/mobaHeroSource.js — 賽前配置的「英雄從哪來」（Milestone I-close）
//
//  問題（Ray 回報／目標 5）：LineupScreen 每一列直接印出一隻英雄，沒有任何說明。
//    玩家看到的是「Kaiser → 鋼鐵衛士」，很自然會以為**選手和英雄是綁死的**，
//    但實際上這隻英雄只是席位預設值，正式出戰的英雄要到 Ban/Pick 才定案。
//
//  本檔把「這隻英雄為什麼在這裡」變成一個可解釋、可驗證的純函式。
//  五種來源都對應到**真的存在的資料**，沒有一種是猜的：
//
//    尚未選角  該席位沒有任何英雄可顯示（新秀未綁定且席位無預設）
//    已鎖定    選手檔案上的綁定英雄，且與席位預設不同 ⇒ 是有人特地指定的
//    熟練最高  這隻英雄的熟練等級（並列時比出賽場次）是全部有紀錄英雄中的最高
//    最近使用  這隻英雄出現在最後一場出賽（heroProgress.lastMatchSeq 最大值）
//    系統推薦  以上皆非 ⇒ 就是席位預設值，明說它只是預設
//
//  ⚠ 邊界：本檔只解釋**賽前參考**的英雄。真正出戰的英雄由 Ban/Pick 的
//    自動分配決定（mobaDraftAssignment）⇒ 兩者不同是正常的，UI 必須講清楚。
// ============================================================================

/** 五種來源的顯示文案（UI 直接用，不各自翻譯一次）。 */
export const HERO_SOURCES = Object.freeze({
  unpicked: { id: "unpicked", label: "尚未選角", color: "#71717a", why: "這個席位還沒有可顯示的英雄" },
  locked: { id: "locked", label: "已鎖定", color: "#f472b6", why: "選手檔案上綁定的英雄（非席位預設）" },
  mastery: { id: "mastery", label: "熟練最高", color: "#fbbf24", why: "目前熟練等級最高的英雄" },
  recent: { id: "recent", label: "最近使用", color: "#60a5fa", why: "最後一場出賽用的英雄" },
  suggested: { id: "suggested", label: "系統推薦", color: "#a78bfa", why: "席位預設英雄，尚未由玩家指定" },
});

/** 熟練排序鍵：等級優先，其次出賽場次（都相同 ⇒ 不判定為最高，避免亂給徽章）。 */
const masteryKey = (h) => [h?.level ?? 0, h?.mastery?.games ?? 0];
const gt = (a, b) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);

/**
 * 全域一次算好的比較基準（避免每一列重算一次整份 progress）。
 * @param {Object} progress heroProgressStore.progress
 * @returns {{topHeroIds:Set<string>, recentHeroIds:Set<string>, hasRecord:boolean}}
 */
export function heroSourceContext(progress = {}) {
  const entries = Object.entries(progress ?? {});
  //  只有「真的打過」的英雄才進入比較。全部 0 場時不該有人拿到「熟練最高」。
  const played = entries.filter(([, h]) => (h?.mastery?.games ?? 0) > 0);
  const topHeroIds = new Set();
  const recentHeroIds = new Set();
  if (played.length) {
    let best = null;
    for (const [, h] of played) { const k = masteryKey(h); if (!best || gt(k, best)) best = k; }
    for (const [id, h] of played) { const k = masteryKey(h); if (k[0] === best[0] && k[1] === best[1]) topHeroIds.add(id); }

    const maxSeq = played.reduce((m, [, h]) => Math.max(m, h?.lastMatchSeq ?? 0), 0);
    if (maxSeq > 0) for (const [id, h] of played) if ((h?.lastMatchSeq ?? 0) === maxSeq) recentHeroIds.add(id);
  }
  return { topHeroIds, recentHeroIds, hasRecord: played.length > 0 };
}

/**
 * 單一席位的英雄來源判定。
 *
 * @param {Object} o
 * @param {string|null} o.heroId       這一列實際顯示的英雄
 * @param {string|null} o.seatDefault  席位預設英雄（data/roster.js）
 * @param {string|null} o.playerHeroId 該席位選手檔案上的綁定英雄
 * @param {ReturnType<typeof heroSourceContext>} o.ctx
 * @returns {{id:string,label:string,color:string,why:string}}
 */
export function heroSourceFor({ heroId = null, seatDefault = null, playerHeroId = null, ctx = null } = {}) {
  if (!heroId) return HERO_SOURCES.unpicked;
  const c = ctx ?? heroSourceContext({});
  //  選手自己指定過（＝和席位預設不同）⇒ 這才是真正意義上的「綁定」。
  //  初始名單的 player.heroId 就等於席位預設，那不算指定，不能標成已鎖定。
  if (playerHeroId && playerHeroId === heroId && playerHeroId !== seatDefault) return HERO_SOURCES.locked;
  if (c.topHeroIds.has(heroId)) return HERO_SOURCES.mastery;
  if (c.recentHeroIds.has(heroId)) return HERO_SOURCES.recent;
  return HERO_SOURCES.suggested;
}
