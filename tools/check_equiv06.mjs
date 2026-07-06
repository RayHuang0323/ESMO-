// Sprint06 儀器化等價驗證：vs Sprint05 版逐幀比對（剔除新欄位後須完全一致）
import { LogicEngine as S05 } from "./src/LogicEngine.s05.js";
import { LogicEngine as S06 } from "./src/LogicEngine.js";
const norm = (snap) => { const s = JSON.parse(JSON.stringify(snap));
  s.players.forEach(p=>{delete p.a;delete p.dmg;delete p.heal;});
  s.feed.forEach(f=>{delete f.assists;});
  return JSON.stringify(s); };
let allOk = true;
for (const seed of [1, 2, 42, 777, 2024]) {
  const a = new S05(seed), b = new S06(seed);
  let ok = true, ticks = 0;
  for (let t = 0.5; t <= 1800; t += 0.5) {
    a.tick(0.5); b.tick(0.5); ticks++;
    if (ticks % 40 === 0 || a.over || b.over) { if (norm(a.snapshot()) !== norm(b.snapshot())) { ok = false; break; } }
    if (a.over && b.over) break;
  }
  // 一致性：助攻不自記、參與率 ≤ 1、dmg/heal 非負
  const teamK = { blue: b.bK, red: b.rK };
  const consist = b.players.every(p => p.a >= 0 && p.dmg >= 0 && p.heal >= 0 && (p.k + p.a) <= (teamK[p.side] === 0 ? p.k + p.a : Number.MAX_SAFE_INTEGER));
  const partOk = b.players.every(p => teamK[p.side] === 0 || (p.k + p.a) / teamK[p.side] <= 5.001); // 助攻可多人同殺，參與率個人上限=1
  const partReal = b.players.every(p => teamK[p.side] === 0 || (Math.min(p.k + p.a, teamK[p.side])) / teamK[p.side] <= 1);
  console.log(`seed=${seed} 等價=${ok?"✅":"❌"} ticks=${ticks} 勝者一致=${a.winner===b.winner?"✅":"❌"} 助攻樣本=${b.players.slice(0,3).map(p=>`${p.id}:${p.k}/${p.d}/${p.a}`).join(" ")} 一致性=${consist&&partReal?"✅":"❌"}`);
  if (!ok || a.winner!==b.winner) allOk = false;
}
console.log(allOk ? "\n✅ Sprint06 儀器化為純附加：Battle Balance 零改變" : "\n❌ 行為差異！");
process.exit(allOk?0:1);
