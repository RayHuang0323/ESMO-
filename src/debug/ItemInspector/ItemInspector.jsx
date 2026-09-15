// ============================================================================
//  debug/ItemInspector/ItemInspector.jsx — Item System M2 的 DEV-only 檢視器
//
//  入口：`npm run dev` 後開 `?debug=items`（main.jsx 以 import.meta.env.DEV 把關，正式 build 不存在）。
//  用途：驗證 engine.snapshot().items 與 itemsViewModel 的資料，不是正式玩家 UI（那是 M3）。
//  ⚠ 刻意不美化。只讀 view-model，不自己算金錢或出裝。
//  ⚠ 自己 new 一個 headless LogicEngine（不接 useGameStore／GameView），不影響任何正式流程。
// ============================================================================
import React, { useCallback, useRef, useState } from "react";
import { LogicEngine } from "../../LogicEngine.js";
import { CHAMPIONS_100, heroById } from "../../data/heroDatabase.js";
import { toEngineHeroMods } from "../../battle/moba/mobaHeroProfile.js";
import { toEngineArchetypes } from "../../data/heroCombatArchetypes.js";
import { buildLoadout, toEngineSpells } from "../../battle/moba/mobaHeroLoadout.js";
import { toEngineTactic, STANDARD_OPP_TACTIC } from "../../platform/contracts/MobaTacticConfig.js";
import { toEngineItems } from "../../battle/moba/items/itemsEngineAdapter.js";
import { BUILD_STRATEGIES } from "../../battle/moba/items/buildPolicy.js";
import { selectPlayerItemsView, selectPurchaseFeed, STRATEGY_LABELS } from "../../battle/moba/items/itemsViewModel.js";

const SEATS = ["b1", "b2", "b3", "b4", "b5", "r1", "r2", "r3", "r4", "r5"];
const COMP = { b: ["坦克", "刺客", "法師", "射手", "輔助"], r: ["戰士", "戰士", "法師", "射手", "坦克"] };
const DT = 0.5;

function fixedRoster() {
  const used = new Set(), roster = {};
  for (const seat of SEATS) {
    const hero = CHAMPIONS_100.find((h) => h.arch === COMP[seat[0]][Number(seat[1]) - 1] && !used.has(h.id));
    used.add(hero.id);
    roster[seat] = { heroId: hero.id };
  }
  for (const [seat, e] of Object.entries(buildLoadout(roster, heroById))) roster[seat].spells = e.spells;
  return roster;
}

function createEngine(seed, strategy) {
  const e = new LogicEngine(seed);
  const roster = fixedRoster();
  const heroMods = toEngineHeroMods(roster, heroById);
  if (heroMods) e.configureHeroes(heroMods);
  const blue = {}, red = {};
  for (const [pid, m] of Object.entries(toEngineArchetypes(roster))) (pid[0] === "r" ? red : blue)[pid] = m;
  e.configureArchetypes({ blue, red, meta: null });
  const spells = toEngineSpells(roster);
  if (spells) e.configureSpells(spells);
  e.configureMatch({ blue: toEngineTactic(STANDARD_OPP_TACTIC), red: toEngineTactic(STANDARD_OPP_TACTIC), meta: null });
  e.configureItems(toEngineItems({ roster, heroLookup: heroById, defaultStrategy: strategy }));
  return { e, roster };
}

const cell = { border: "1px solid #555", padding: "2px 6px", verticalAlign: "top", fontSize: 12 };
const mono = { fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" };

export default function ItemInspector() {
  const [seed, setSeed] = useState(7);
  const [strategy, setStrategy] = useState("standard");
  const [seat, setSeat] = useState("b4");
  const [, setVersion] = useState(0);
  const ref = useRef(null);
  if (!ref.current) ref.current = createEngine(7, "standard");

  const reset = useCallback(() => { ref.current = createEngine(seed, strategy); setVersion((v) => v + 1); }, [seed, strategy]);
  const advance = useCallback((sec) => {
    const { e } = ref.current;
    for (let i = 0; i < sec / DT && !e.over; i++) e.tick(DT);
    setVersion((v) => v + 1);
  }, []);

  const { e, roster } = ref.current;
  const snap = e.snapshot();
  const view = selectPlayerItemsView(snap, seat);
  const feed = selectPurchaseFeed(snap, { limit: 20 });

  return (
    <div style={{ background: "#111", color: "#ddd", minHeight: "100vh", padding: 12, fontFamily: "sans-serif" }}>
      <h3 style={{ margin: "0 0 8px" }}>Item Inspector（DEV only）</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <label>seed <input type="number" value={seed} onChange={(ev) => setSeed(Number(ev.target.value) || 1)} style={{ width: 70 }} /></label>
        <label>策略 <select value={strategy} onChange={(ev) => setStrategy(ev.target.value)}>
          {BUILD_STRATEGIES.map((s) => <option key={s} value={s}>{STRATEGY_LABELS[s]}</option>)}
        </select></label>
        <button onClick={reset}>重設</button>
        <button onClick={() => advance(60)}>+1 分</button>
        <button onClick={() => advance(300)}>+5 分</button>
        <button onClick={() => advance(3600)}>跑到結束</button>
        <span>t={(e.t / 60).toFixed(1)} 分 · K {e.bK}-{e.rK} · 隊伍金 {Math.round(e.bGold)}/{Math.round(e.rGold)} · {e.over ? `結束（${e.winner}）` : "進行中"}</span>
      </div>

      {!snap.items ? <p>本場沒有 snapshot.items（未啟用裝備）。</p> : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", marginBottom: 12 }}>
              <thead><tr>{["席位", "英雄", "定位/策略", "金 e/s/u", "背包", "下一件", "HP+ AD AP 甲 魔抗"].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
              <tbody>
                {SEATS.map((id) => {
                  const p = snap.items.players[id];
                  return (
                    <tr key={id} onClick={() => setSeat(id)} style={{ cursor: "pointer", background: id === seat ? "#2a2a44" : undefined }}>
                      <td style={cell}>{id}</td>
                      <td style={cell}>{heroById(roster[id].heroId)?.zh}</td>
                      <td style={cell}>{p.arch}/{p.strategy}</td>
                      <td style={cell}>{p.gold.earned}/{p.gold.spent}/{p.gold.unspent}</td>
                      <td style={cell}>{p.inventory.map((x) => x ?? "—").join(" · ")}</td>
                      <td style={cell}>{p.plan?.targetId ?? "—"}{p.plan?.targetRemainingCost != null ? `（差 ${p.plan.targetRemainingCost}）` : ""}</td>
                      <td style={cell}>{p.stats.hp} {p.stats.ad} {p.stats.ap} {p.stats.armor} {p.stats.mr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {view && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              <div style={{ minWidth: 280, flex: 1 }}>
                <h4>{seat} 決策</h4>
                <ul>{view.decision.text.map((t, i) => <li key={i}>{t}</li>)}</ul>
                <div>最近購買窗：{view.decision.lastWindow ? `${view.decision.lastWindow.label} @ ${view.decision.lastWindow.t}s` : "—"}</div>
                <h4>出裝路徑</h4>
                <ol>{view.buildPath.map((b) => <li key={b.itemId}>{b.owned ? "✔ " : ""}{b.isNext ? "▶ " : ""}{b.name}（{b.itemId}，{b.price}）</li>)}</ol>
              </div>
              <div style={{ minWidth: 280, flex: 1 }}>
                <h4>下一件合成樹</h4>
                <div style={mono}>{view.nextItem ? JSON.stringify(view.nextItem.recipe, (k, v) => (["family", "familyLabel", "tier"].includes(k) ? undefined : v), 1) : "—"}</div>
                <h4>CombatStats / 狀態</h4>
                <div style={mono}>{JSON.stringify({ stats: view.stats, status: view.status })}</div>
              </div>
              <div style={{ minWidth: 280, flex: 1 }}>
                <h4>全場購買事件（新 → 舊）</h4>
                <ul style={{ paddingLeft: 16 }}>{feed.map((ev) => <li key={ev.seq}>#{ev.seq} {ev.t}s {ev.playerId} {ev.windowLabel} {ev.actionLabel} {ev.name} −{ev.cost}{ev.consumedNames.length ? `（消耗 ${ev.consumedNames.join("、")}）` : ""}</li>)}</ul>
                <h4>counters</h4>
                <div style={mono}>{JSON.stringify(snap.items.counters, (k, v) => (typeof v === "number" ? Math.round(v) : v))}</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
