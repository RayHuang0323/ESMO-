import { LogicEngine as S06 } from "./src/LogicEngine.s06.js";
import { LogicEngine as S07 } from "./src/LogicEngine.js";
const norm = (s0) => { const s = JSON.parse(JSON.stringify(s0)); s.players.forEach(p=>{delete p.twrDmg;}); return JSON.stringify(s); };
let ok = true;
for (const seed of [1, 42, 777, 2024, 9999]) {
  const a = new S06(seed), b = new S07(seed); let t = 0, eq = true;
  for (t = 0.5; t <= 1800; t += 0.5) { a.tick(0.5); b.tick(0.5);
    if ((t*2)%40===0 || a.over) { if (norm(a.snapshot()) !== norm(b.snapshot())) { eq = false; break; } }
    if (a.over && b.over) break; }
  const tdSum = b.players.reduce((s,p)=>s+p.twrDmg,0);
  console.log(`seed=${seed} 等價=${eq?"✅":"❌"} 勝者一致=${a.winner===b.winner?"✅":"❌"} twrDmg總和=${Math.round(tdSum)}(>0=有記錄)`);
  if (!eq || a.winner!==b.winner) ok = false;
}
console.log(ok ? "✅ twrDmg 為純附加，Battle Balance 零改變" : "❌ 行為差異"); process.exit(ok?0:1);
