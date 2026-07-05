// ============================================================================
//  analytics.js — Platform Data Layer 衍生查詢（純函式 selectors，不 import React）
//
//  全部從「正式 state」（record / matchHistory / heroStats / roster）導出，
//  絕不生成假資料。供 Dashboard / Codex / 未來 League·Management Sprint 直接取用。
// ============================================================================

// ── Dashboard Data ──
/**
 * 儀表板一次取得：近十場 / 勝率 / 連勝 / 連敗 / 平均勝率 / 英雄使用率 / 玩家成長。
 * @param {Object} game { record, matchHistory, heroStats, roster }
 */
export function getDashboardData(game) {
  const record = game.record || { wins: 0, losses: 0, streak: 0 };
  const history = Array.isArray(game.matchHistory) ? game.matchHistory : [];
  const heroStats = game.heroStats || {};
  const roster = Array.isArray(game.roster) ? game.roster : [];

  const last10 = history.slice(0, 10).map((h) => ({ win: !!h.win, mode: h.mode, scoreT: h.scoreT, scoreCT: h.scoreCT }));
  const total = record.wins + record.losses;
  const winRate = total > 0 ? Math.round((record.wins / total) * 100) : 0;

  // 近十場即時連勝/連敗（從最近一場往回數同結果）
  let winStreak = 0, loseStreak = 0;
  for (const m of last10) { if (m.win) { if (loseStreak) break; winStreak++; } else break; }
  for (const m of last10) { if (!m.win) { if (winStreak) break; loseStreak++; } else break; }

  const last10WinRate = last10.length ? Math.round((last10.filter((m) => m.win).length / last10.length) * 100) : 0;

  // 英雄使用率（依 pickCount 佔總 pick 比例）
  const totalPicks = Object.values(heroStats).reduce((s, h) => s + (h.pickCount || h.games || 0), 0);
  const heroUsage = Object.entries(heroStats)
    .map(([id, h]) => ({ heroId: id, games: h.games || 0, pickRate: totalPicks ? Math.round(((h.pickCount || h.games || 0) / totalPicks) * 100) : 0, winRate: h.games ? Math.round((h.wins / h.games) * 100) : 0 }))
    .sort((a, b) => b.games - a.games);

  // 玩家成長（有 career 者回生涯摘要）
  const playerGrowth = roster.map((p) => ({
    name: p.name,
    morale: p.morale ?? null, energy: p.energy ?? null,
    career: p.career || null,
    lastMatchMoba: p.lastMatchMoba || null,
  }));

  return { last10, winRate, streak: record.streak || 0, winStreak, loseStreak, avgWinRate: winRate, last10WinRate, heroUsage, playerGrowth };
}

// ── Hero Analytics（Priority B）──
/**
 * 每個「有出戰紀錄」的英雄：Pick Rate / Win Rate / Favorite Player / Last Used。
 * favoritePlayer 由 roster 各選手 career.heroCounts 導出（誰最常用此英雄）。
 */
export function getHeroAnalytics(heroStats, roster) {
  const stats = heroStats || {};
  const totalPicks = Object.values(stats).reduce((s, h) => s + (h.pickCount || h.games || 0), 0);
  const rosterArr = Array.isArray(roster) ? roster : [];

  return Object.entries(stats).map(([heroId, h]) => {
    let favoritePlayer = null, maxN = 0;
    for (const p of rosterArr) {
      const n = (p.career && p.career.heroCounts && p.career.heroCounts[heroId]) || 0;
      if (n > maxN) { maxN = n; favoritePlayer = p.name; }
    }
    return {
      heroId,
      pickRate: totalPicks ? Math.round(((h.pickCount || h.games || 0) / totalPicks) * 100) : 0,
      winRate: h.games ? Math.round((h.wins / h.games) * 100) : 0,
      games: h.games || 0,
      masteryLevel: h.masteryLevel || 0,
      favoritePlayer,
      lastUsed: h.lastPlayed || null,
    };
  }).sort((a, b) => b.games - a.games);
}

// ── Match Analytics Data（Priority B）──
/**
 * 由單場 BattleResult 建立正式分析資料格式（部分欄位目前為空，格式先立起來，
 * 待 Battle 層補逐英雄/時間軸數據後自動充實，結構不需再改）。
 */
export function getMatchAnalytics(result) {
  const r = result || {};
  const isCS = r.mode === "CS" && Array.isArray(r.players);
  return {
    matchSummary: {
      mode: r.mode || null, win: !!r.win,
      scoreT: r.scoreT ?? null, scoreCT: r.scoreCT ?? null,
      durationSec: r.durationSec ?? null,
      tName: r.tName ?? r.teamName ?? null, ctName: r.ctName ?? r.oppName ?? null,
      mapKey: r.mapKey ?? null, seed: r.seed ?? null,
    },
    teamStats: {
      our: { kills: r.scoreT ?? null, players: isCS ? r.ourPlayers || [] : [], lineup: r.lineup || [] },
      opp: { kills: r.scoreCT ?? null, players: isCS ? r.theirPlayers || [] : [] },
    },
    heroStats: Array.isArray(r.lineup) ? r.lineup.map((s) => ({ heroId: s.heroId, playerName: s.playerName, role: s.role, kills: null, deaths: null, assists: null, damage: null })) : [],
    economyStats: { fanGain: r.fanGain ?? null, prizeGain: r.prizeGain ?? null, xpGain: r.xpGain ?? null },
    timeline: [], // 預留：待引擎輸出事件序列（擊殺/推塔/團戰）
  };
}
