// tools/owner_preview/preview_force_hash_v24.js — 整場狀態雜湊（FNV-1a 雙 32 位元）。Node 與瀏覽器共用同一份，用來證明預覽裡跑的是同一場（v24 Sprint 1.3）。
export function streamHashFnv(e, capSec = 3000) {
  let a = 0x811c9dc5, b = 0x01000193, ticks = 0;
  const feed = (s) => { for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x0100019d); } };
  while (!e.over && e.t < capSec) {
    e.tick(0.5); ticks++;
    let s = String(e.t);
    for (const p of e.players) s += `|${p.id},${p.pos.x},${p.pos.y},${p.hp},${p.dead ? 1 : 0},${p.state ?? ""},${p.gold ?? ""}`;
    feed(s);
  }
  feed(`END|${e.winner ?? "none"}|${e.t}`);
  return { ticks, over: !!e.over, winner: e.winner ?? null, endT: e.t, hash: (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0") };
}

//  Diagnostic: cumulative hash per field class, sampled every 10 ticks, plus the raw player state at one chosen tick. Used to locate where two runtimes first differ.
export function streamTrace(e, capSec = 3000, rawTick = -1) {
  const mk = () => ({ a: 0x811c9dc5 });
  const H = { time: mk(), pos: mk(), hp: mk(), dead: mk(), state: mk(), gold: mk() };
  const feed = (h, s) => { for (let i = 0; i < s.length; i++) h.a = Math.imul(h.a ^ s.charCodeAt(i), 0x01000193); };
  const points = []; let ticks = 0, raw = null;
  while (!e.over && e.t < capSec) {
    e.tick(0.5); ticks++;
    feed(H.time, String(e.t));
    for (const p of e.players) { feed(H.pos, `${p.pos.x},${p.pos.y};`); feed(H.hp, `${p.hp};`); feed(H.dead, p.dead ? "1" : "0"); feed(H.state, `${p.state ?? ""};`); feed(H.gold, `${p.gold ?? ""};`); }
    if (ticks === rawTick) raw = e.players.map((p) => ({ id: p.id, x: p.pos.x, y: p.pos.y, hp: p.hp, dead: !!p.dead, state: p.state ?? null, gold: p.gold ?? null }));
    if (ticks % 10 === 0) points.push([ticks, ...Object.values(H).map((h) => h.a >>> 0)]);
  }
  return { ticks, fields: Object.keys(H), points, raw };
}
