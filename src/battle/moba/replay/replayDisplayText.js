// Display-only translation of saved text. Never changes events, frames or identity.
const OBJECTS = Object.freeze({
  camp_blue_buff: '藍 Buff', camp_red_buff: '紅 Buff',
  camp_blue_a: '藍方狼營', camp_red_a: '紅方狼營',
  camp_blue_b: '藍方石甲蟲', camp_red_b: '紅方石甲蟲',
  dragon: '巨龍', baron: '巴龍', nexus_guard: '門牙塔',
});
export function replayPlayerName(id, playersMeta = []) {
  const key = String(id ?? '').toLowerCase();
  const pm = playersMeta.find(p => String(p.id).toLowerCase() === key);
  if (pm?.playerName && pm.playerName.toLowerCase() !== key) return pm.playerName;
  const seat = /^([br])(\d+)$/.exec(key);
  return seat ? `${seat[1] === 'b' ? '藍' : '紅'}方第 ${seat[2]} 席` : '選手';
}
export function replayDisplayText(text, replay = {}) {
  if (typeof text !== 'string') return '';
  // One pass prevents replacing an ID-like substring inside a saved player name.
  return text.replace(/\b(?:camp_[a-z_]+|nexus_guard|dragon|baron|[br]\d+)\b|FIRST BLOOD!|VICTORY!|Double Kill!|Triple Kill!|Quadra Kill!|Penta Kill!/gi, token => {
    const key = token.toLowerCase();
    if (/^[br]\d+$/.test(key)) return replayPlayerName(key, replay.playersMeta);
    if (OBJECTS[key]) return OBJECTS[key];
    if (key.startsWith('camp_')) return '野怪營地';
    return ({'first blood!':'首殺！','victory!':'勝利！','double kill!':'雙殺！',
      'triple kill!':'三殺！','quadra kill!':'四殺！','penta kill!':'五殺！'})[key] ?? token;
  });
}

export function replayEventText(event, replay = {}) {
  const d = event?.data;
  if (event?.type === 'TOWER_DESTROYED' && d) {
    const side = {blue:'藍方',red:'紅方'}[d.victimSide] ?? '';
    const lane = {top:'上路',mid:'中路',bot:'下路'}[d.lane];
    const target = d.isNexus || d.lane === 'nexus' ? '主堡'
      : d.lane === 'nexus_guard' ? '門牙塔'
      : lane && Number.isFinite(d.tier) ? `${lane} ${3-d.tier} 塔` : '防禦塔';
    return `${side}${target} 被摧毀`;
  }
  return replayDisplayText(event?.text, replay);
}

// Display only: a resumed session can have no saved frames before this time.
export function replayStartTime(replay) {
  const t = replay?.frames?.[0]?.t;
  return Number.isFinite(t) ? Math.max(0, t) : 0;
}
