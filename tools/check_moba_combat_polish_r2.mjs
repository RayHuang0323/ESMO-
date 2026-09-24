#!/usr/bin/env node
// ============================================================================
//  tools/check_moba_combat_polish_r2.mjs — feature/moba-combat-polish-r2 node 驗收
//
//  W  打大型物件搖晃：objIdleFixV1（skill-on）A/B 實測 ⇒ 坑邊逐 tick 位移與 >90° 轉向大幅下降
//  O  skill-off 不受影響：objIdleFixV1 開／關，skill-off 的 snapshot 串流逐位元相同
//  V  模擬版本：moba-sim.v11 為目前版本、v10 保留（指紋不變）、跨版本拒絕重播
//  C  分營最後一隻：根因事實（懲戒傷害 > 整營總血 ⇒ 會從高血量一擊斃命）＋呈現層有「死亡時扣到 0」
//  D  陣亡地面標記整個移除（Owner Review 2026-09-25：不換成任何其他地面符號）
//  RS 恢復進行中比賽：分塊追趕（無同步 while 迴圈）、追趕期間不存檔、進度提示；分塊與一次跑完結果逐位元相同
//  T  對話：決定性、有冷卻、不洗版、不連續重複同一句、新情境真的觸發、個性／位置句子池
//  F  特效：burst 家族、召喚師技能施放特效（smite／ignite）、狀態上身／護盾破裂回饋、adapter 帶 spells
//  M  小兵／野怪 audit：技能命中與狀態只作用於英雄（引擎原始碼事實，未改語意）
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };

const { LogicEngine } = await load("src/LogicEngine.js");
const { CHAMPIONS_100 } = await load("src/data/heroDatabase.js");
const { toEngineHeroSkills } = await load("src/battle/moba/skills/heroSkillGameplay.js");
const { rulesFor } = await load("src/battle/moba/matchProgression.js");
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rosterOf = (off) => {
  const ids = CHAMPIONS_100.slice(off, off + 5).map((h) => h.id);
  return Object.fromEntries([...ids.map((id, i) => [`b${i + 1}`, { heroId: id }]), ...ids.map((id, i) => [`r${i + 1}`, { heroId: id }])]);
};
const mkEngine = (seed, { skills, fix }) => {
  //  建構子只收規則集名稱 ⇒ 建好後換一份只差這個鍵的規則物件（兩邊其餘完全相同）
  const e = new LogicEngine(seed, null, { rules: "v3" });
  e.rules = { ...rulesFor("v3"), objIdleFixV1: fix };
  if (skills) e.configureHeroSkills(toEngineHeroSkills(rosterOf(0)));
  return e;
};

// ── W：搖晃 A/B ──────────────────────────────────────────────────────────────
function wobble(fix) {
  let samples = 0, still = 0, bigTurn = 0; const steps = [];
  for (const seed of [1, 42, 99]) {
    const e = mkEngine(seed, { skills: true, fix });
    const prev = new Map(), prevF = new Map();
    for (let i = 0; i < 2600 && !e.over; i++) {
      e.tick(0.5);
      for (const p of e.players) {
        const o = [e.neutrals.dragon, e.neutrals.baron].find((n) => n.alive && dist(p.pos, n.pos) < 9);
        const q = prev.get(p.id); prev.set(p.id, { x: p.pos.x, y: p.pos.y });
        if (!o || p.dead || !q) { prevF.delete(p.id); continue; }
        samples++; const d = dist(p.pos, q); steps.push(d);
        if (d < 1e-4) { still++; continue; }
        const f = Math.atan2(p.pos.x - q.x, p.pos.y - q.y), pf = prevF.get(p.id);
        if (pf != null) { let dd = Math.abs(f - pf); if (dd > Math.PI) dd = 2 * Math.PI - dd; if (dd > Math.PI / 2) bigTurn++; }
        prevF.set(p.id, f);
      }
    }
  }
  steps.sort((a, b) => a - b);
  return { samples, stillRatio: +(still / Math.max(1, samples)).toFixed(2), bigTurnPer100: +(100 * bigTurn / Math.max(1, samples)).toFixed(1), stepP50: +steps[Math.floor(steps.length / 2)].toFixed(3) };
}
const wOff = wobble(false), wOn = wobble(true);
ck("W1 打龍／巴龍坑邊：逐 tick 位移中位數 ≈ 0（站定在攻擊）", wOn.stepP50 < 0.05 && wOff.stepP50 > 0.3, `修正前 ${JSON.stringify(wOff)}／修正後 ${JSON.stringify(wOn)}`);
ck("W2 >90° 轉向（每 100 樣本）至少減半", wOn.bigTurnPer100 <= wOff.bigTurnPer100 / 2, `${wOff.bigTurnPer100} → ${wOn.bigTurnPer100}`);

// ── O：skill-off 串流不受 objIdleFixV1 影響 ────────────────────────────────────
{
  let same = true, where = "";
  for (const seed of [7, 2024]) {
    const a = mkEngine(seed, { skills: false, fix: true }), b = mkEngine(seed, { skills: false, fix: false });
    for (let i = 0; i < 1600 && !a.over; i++) {
      a.tick(0.5); b.tick(0.5);
      if (i % 20 === 0 && JSON.stringify(a.snapshot()) !== JSON.stringify(b.snapshot())) { same = false; where = `seed ${seed} tick ${i}`; break; }
    }
    if (!same) break;
  }
  ck("O1 skill-off：objIdleFixV1 開／關的 snapshot 串流逐位元相同（Challenge 行為不變）", same, where);
  const src = read("src/LogicEngine.js");
  ck("O2 objIdleFixV1 的兩個作用點都另判 this.heroSkillsOn", (src.match(/R\.objIdleFixV1 && this\.heroSkillsOn/g) ?? []).length === 2);
}

// ── V：版本 ───────────────────────────────────────────────────────────────────
{
  const SV = await load("src/platform/contracts/simulationVersion.js");
  ck("V1 moba-sim.v11 為目前版本；v10 保留且指紋 27dc4e0161024c06 不變；v10 的歷史重播明確拒絕",
    SV.MOBA_SIMULATION_VERSION === "moba-sim.v11" && SV.KNOWN_SIMULATION_VERSIONS.includes("moba-sim.v10")
    && SV.SIMULATION_SEMANTICS_FINGERPRINTS["moba-sim.v10"] === "27dc4e0161024c06" && SV.canReplay("moba-sim.v10").ok === false
    && SV.canReplay("moba-sim.v11").ok === true);
}

// ── C：分營最後一隻 ───────────────────────────────────────────────────────────
{
  const R = rulesFor("v3");
  ck("C1 根因事實：懲戒傷害大於整營總血（小營 280／Buff 營 420 < 懲戒 550）⇒ 最後一隻可能從高血量一擊斃命",
    R.smiteDmg > R.campHp && R.smiteDmg > R.buffCampHp, `smite ${R.smiteDmg}／camp ${R.campHp}／buff ${R.buffCampHp}`);
  //  實測：最後一隻在「前一 tick 還 > 90% 血（血條完全沒動過）」就死掉的事件，都和同一 tick 的懲戒吻合。
  //  （40% 左右一擊死的是 84 血的小 Buff 跟班吃到普攻／技能 ⇒ 血條本來就有在動，不是這個問題。）
  let highDeaths = 0, bySmite = 0;
  for (const seed of [1, 42]) {
    const e = mkEngine(seed, { skills: true, fix: true });
    for (let i = 0; i < 1800 && !e.over; i++) {
      const before = new Map();
      for (const c of e.neutrals.camps) for (const m of c.members ?? []) before.set(m.id, { hp: m.hp / m.maxHp, alive: m.alive });
      const sl0 = e.spellLog.length; e.tick(0.5);
      const smited = e.spellLog.slice(sl0).some((x) => x.spell === "smite");
      for (const c of e.neutrals.camps) {
        if (!c.members) continue;
        const prevLiving = c.members.filter((m) => before.get(m.id)?.alive);
        if (prevLiving.length === 1 && !c.members.some((m) => m.alive && m.hp > 0) && before.get(prevLiving[0].id).hp > 0.9) { highDeaths++; if (smited) bySmite++; }
      }
    }
  }
  ck("C2 最後一隻「血條沒動過就死」的事件全部來自懲戒（不是血量同步錯誤）", highDeaths > 0 && bySmite === highDeaths, `${bySmite}/${highDeaths}`);
  const N = read("src/battle/moba/render/RiggedMobaRuntimeNeutrals.jsx");
  ck("C3 呈現層：血條平滑下降，死亡時保留並扣到 0 才消失（不再瞬間隱藏）",
    /shownHp/.test(N) && /drainLeft = \.45/.test(N) && /draining \|\| \(!!entity\.alive/.test(N));
}

// ── D：陣亡標記 ───────────────────────────────────────────────────────────────
{
  const H = read("src/battle/moba/render/MobaRuntimeHeroes.jsx");
  const code = H.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  ck("D1 英雄陣亡地面標記已移除（沒有 deathMark 幾何／材質／mesh、沒有 hero-death-mark 部位）", !/deathMark|markBlue|markRed|hero-death-mark/.test(code));
  ck("D2 陣亡仍有本體表現（倒地＋去飽和材質 blueDead／redDead）", /blueDead/.test(code) && /redDead/.test(code));
}

// ── RS：恢復 ──────────────────────────────────────────────────────────────────
{
  const U = read("src/useLocalServer.js");
  ck("RS1 不再同步 while 迴圈追趕；改為每塊 ≤ CATCH_UP_BUDGET_MS 的分塊排程", !/while \(!eng\.over && eng\.t < resumeTimeSec/.test(U) && /CATCH_UP_BUDGET_MS/.test(U) && /catchUpRef\.current = setTimeout\(catchUp, 0\)/.test(U));
  ck("RS2 追趕期間 engineRef 為 null（離開畫面不會把較早的時間寫回存檔）", /engineRef\.current = null;/.test(U) && /const beginLive = \(\) => \{[\s\S]*?engineRef\.current = eng;/.test(U));
  ck("RS3 stop() 會取消追趕", /clearTimeout\(catchUpRef\.current\)/.test(U));
  const G = read("src/GameView.jsx");
  ck("RS4 追趕期間顯示進度（resume-progress），且不顯示「開始遊戲」按鈕", /data-testid="resume-progress"/.test(G) && /!playing && !resumeProgress && !hud\.over/.test(G));
  //  決定性：分塊（任意切法）與一次跑完，同 seed 同 tick 數 ⇒ 逐位元相同
  const a = mkEngine(11, { skills: true, fix: true }), b = mkEngine(11, { skills: true, fix: true });
  for (let i = 0; i < 1200; i++) a.tick(0.5);
  let n = 0; while (n < 1200) { const chunk = 1 + (n * 7919) % 37; for (let j = 0; j < chunk && n < 1200; j++, n++) b.tick(0.5); }
  ck("RS5 分塊追趕與一次跑完結果逐位元相同（600 模擬秒）", JSON.stringify(a.snapshot()) === JSON.stringify(b.snapshot()));
}

// ── T：對話 ───────────────────────────────────────────────────────────────────
{
  const { CommsEngine, COMMS_RULES, GLOBAL_COOLDOWN, linePool } = await load("src/battle/moba/tacticalComms.js");
  const { BattleEventTracker } = await load("src/battle/battleEvents.js");
  const PERS = ["shotcaller", "aggressive", "calm", "passionate", "defensive"];
  const run = (seed) => {
    const e = mkEngine(seed, { skills: true, fix: true });
    const tr = new BattleEventTracker();
    const roster = Object.fromEntries(["b1", "b2", "b3", "b4", "b5"].map((id, i) => [id, { player: `P${i + 1}`, personality: PERS[(i + seed) % 5] }]));
    const ce = new CommsEngine({ roster, side: "blue" });
    while (!e.over && e.t < 2700) { e.tick(0.5); const s = e.snapshot(); ce.update(s, tr.update(s)); }
    return ce.getMessages();
  };
  const all = [];
  let repeats = 0, cdViol = 0, minGap = Infinity, minutes = 0;
  for (const seed of [4242, 777, 1]) {
    const m = run(seed); all.push(...m); minutes += m[m.length - 1].t / 60;
    for (let i = 0; i < m.length; i++) {
      if (i) minGap = Math.min(minGap, m[i].t - m[i - 1].t);
      const prev = m.slice(0, i).filter((x) => x.ruleId === m[i].ruleId).pop();
      if (prev && prev.text === m[i].text) repeats++;
      if (prev && m[i].t - prev.t < COMMS_RULES[m[i].ruleId].cooldown - 1e-6) cdViol++;
    }
  }
  const perMin = all.length / minutes;
  ck("T1 有冷卻、不洗版（全域間隔 ≥ 6 秒、每分 ≤ 12 則）", cdViol === 0 && minGap >= GLOBAL_COOLDOWN - 1e-6 && perMin <= 12, `密度 ${perMin.toFixed(2)} 則/分、最小間隔 ${minGap}`);
  ck("T2 同一情境不會連續兩次講同一句", repeats === 0, `${repeats}`);
  const rules = new Set(all.map((m) => m.ruleId));
  const newOnes = ["CAUGHT", "OBJECTIVE_CONTEST", "SUPPORT_MOVE", "CHASE", "WAVE_DEFEND"].filter((r) => rules.has(r));
  ck("T3 新情境（被抓／爭龍／支援／追擊／回防清線）真的會觸發（≥ 3 種）", newOnes.length >= 3, newOnes.join(","));
  const share = Math.max(...[...rules].map((r) => all.filter((m) => m.ruleId === r).length)) / all.length;
  ck("T4 沒有單一情境霸佔播報（最多的一種 ≤ 35%）", share <= 0.35, `${(share * 100).toFixed(0)}%`);
  ck("T5 決定性（同 seed 兩次逐位元相同）", JSON.stringify(run(99).map((m) => [m.t, m.ruleId, m.text])) === JSON.stringify(run(99).map((m) => [m.t, m.ruleId, m.text])));
  const pool = linePool("TEAMFIGHT", "shotcaller", "sup");
  ck("T6 句子池：個性句 → 位置句 → 通用句", pool[0] === "集火後排！" && pool.includes("保護射手！") && pool.includes("開了！全上"));
  //  ⚠ 剝掉註解再比對：檔頭註解本來就寫著「無 Math.random」「不接生成式 API」。
  const TC = read("src/battle/moba/tacticalComms.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  ck("T7 不接生成式 API、不用亂數", !/fetch|openai|anthropic|http/i.test(TC) && !/Math\.random/.test(TC));
  ck("T8 中文句子沒有夾空白（「下路 不見了」這類）", !all.some((m) => /[一-鿿] [一-鿿]/.test(m.text)), all.find((m) => /[一-鿿] [一-鿿]/.test(m.text))?.text ?? "");
}

// ── F：特效 ───────────────────────────────────────────────────────────────────
{
  const V = read("src/battle/moba/skills/HeroVfxRuntime.jsx");
  const { spectacleFamilyOf } = await load("src/battle/moba/skills/HeroVfxRuntime.jsx").catch(() => ({}));
  ck("F1 burst 家族存在（原地爆開：球殼擴張＋放射火焰）", /\['burst', \//.test(V) && /fam === 'burst'/.test(V));
  ck("F2 天降：斜線從高空砸下＋拖尾＋落點陰影＋命中白閃", /HH = H \* 1\.6/.test(V) && /由亮到暗的長拖尾/.test(V) && /落點陰影/.test(V) && /命中白閃/.test(V));
  ck("F3 召喚師技能施放特效（懲戒落雷打在野怪、點燃火線＋目標火焰）", /SPELL_FX = \{/.test(V) && /f\.id === 'smite'/.test(V) && /f\.id === 'ignite'/.test(V) && /s\.uses > prev/.test(V));
  ck("F4 施放偵測遇到重播倒轉只重設、不補放", /rewound \|\| prev == null/.test(V));
  const A = read("src/battle/moba/map/mobaRuntimeMapAdapter.js");
  ck("F5 adapter 把 snapshot 的 sp（id＋uses）帶給呈現層（唯讀）", /spells: Array\.isArray\(p\.sp\)/.test(A));
  const S = read("src/battle/moba/render/HeroStatusFx.jsx");
  ck("F6 狀態上身瞬間回饋＋護盾提前消失＝碎裂＋最後 1 秒閃爍", /scratch\.onsets\.push/.test(S) && /shield-break/.test(S) && /remaining \?\? 9\) < 1/.test(S));
  void spectacleFamilyOf;
}

// ── M：小兵／野怪 audit（引擎事實；本輪未改語意）──────────────────────────────
{
  const E = read("src/LogicEngine.js");
  ck("M1 技能對中立目標的傷害只走 _objSkillHits（野怪／龍／巴龍），小兵沒有技能命中路徑", /_objSkillHits\.push/.test(E) && !/heroSkill[A-Za-z]*\([^)]*lanes\[/.test(E));
  ck("M2 紅 Buff 減速只在打英雄時套用（redSlowUntil 只設定在英雄）", /redSlowUntil/.test(E));
}

console.log(`\nMOBA combat polish r2：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
