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
