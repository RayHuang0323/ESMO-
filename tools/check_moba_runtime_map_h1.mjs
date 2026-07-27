// ============================================================================
//  tools/check_moba_runtime_map_h1.mjs — Runtime Map 接線驗證（Milestone H.1）
//
//  驗的是「正式戰鬥資料 → Runtime Adapter → Renderer」這條線有沒有接對，
//  不是地圖美術。跑法：node tools/check_moba_runtime_map_h1.mjs
//
//  ⚠ 本檔**真的跑一場** LogicEngine（tick 到中盤與終盤各取一次 snapshot），
//    不是拿手寫的假資料 ⇒ snapshot 形狀一改，這裡會馬上紅。
// ============================================================================
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LogicEngine } from "../src/LogicEngine.js";
import {
  adaptRuntimeMapFrame, adaptHeroes, adaptStructures, adaptObjectives,
} from "../src/battle/moba/map/mobaRuntimeMapAdapter.js";
import { COORDINATE_CONTRACT, inBoundsSim, simToWorld } from "../src/battle/moba/map/coordinateMapping.js";
import { MAP_PRESENTATION_IDS, MAP_PRESENTATION } from "../src/battle/moba/mobaMapPresentation.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8");
//  只看**程式碼**：把註解剝掉。否則檔頭裡寫「本檔不 import LogicEngine」這種說明
//  也會被自己的檢查判成違規（實測踩過一次）。
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log(`❌ ${msg}`); } };

// ── 準備：真的跑一場 ────────────────────────────────────────────────────────
const eng = new LogicEngine(7);
const frames = [];
for (let i = 0; i < 2400; i++) {
  eng.tick(0.25);
  if (i === 200 || i === 900 || i === 2399) frames.push(eng.snapshot());
}
const mid = frames[1], late = frames[frames.length - 1];

// ① Runtime Adapter 吃得下正式 snapshot
{
  const f = adaptRuntimeMapFrame(mid, {});
  ok(f && Array.isArray(f.heroes) && Array.isArray(f.structures) && Array.isArray(f.objectives),
    "① Runtime Adapter 應能接收正式 snapshot 並輸出 heroes/structures/objectives");
  ok(f.warnings.length === 0, `① Adapter 不應對正式 snapshot 產生警告（實得：${f.warnings.join("；")}）`);
}

// ② 10 名英雄都有有效座標；③ 全部 finite；④ 藍紅各 5；⑤ id 不重複
for (const [label, snap] of [["中盤", mid], ["終盤", late]]) {
  const heroes = adaptHeroes(snap, {});
  ok(heroes.length === 10, `② ${label} 應有 10 名英雄（實得 ${heroes.length}）`);
  const badPos = heroes.filter((h) => !inBoundsSim(h.position));
  ok(badPos.length === 0, `② ${label} 英雄座標應全部落在地圖內（越界 ${badPos.length}）`);
  const badNum = heroes.filter((h) =>
    !Number.isFinite(h.world.x) || !Number.isFinite(h.world.y) || !Number.isFinite(h.world.z)
    || !Number.isFinite(h.hpRatio) || !Number.isFinite(h.level));
  ok(badNum.length === 0, `③ ${label} 英雄的世界座標與數值欄位應全為 finite（異常 ${badNum.length}）`);
  const blue = heroes.filter((h) => h.team === "blue").length;
  const red = heroes.filter((h) => h.team === "red").length;
  ok(blue === 5 && red === 5, `④ ${label} 應藍 5 紅 5（實得 藍 ${blue} 紅 ${red}）`);
  ok(new Set(heroes.map((h) => h.id)).size === heroes.length, `⑤ ${label} 英雄 id 不得重複`);
  ok(heroes.every((h) => typeof h.displayName === "string" && h.displayName.length > 0),
    `⑤ ${label} 每名英雄都應有可顯示的名稱`);
  ok(heroes.every((h) => typeof h.alive === "boolean"), `⑤ ${label} 每名英雄都應有 alive 狀態`);
}

// ⑥ Tower 不重複生成；⑦ Base 不重複生成
{
  const st = adaptStructures(late);
  const ids = st.map((s) => s.id);
  ok(new Set(ids).size === ids.length, "⑥ 結構 id 不得重複");
  const towers = st.filter((s) => s.type === "tower");
  ok(towers.length === 18, `⑥ 防禦塔應為 18 座（實得 ${towers.length}）`);
  const nexus = st.filter((s) => s.type === "nexus");
  ok(nexus.length === 2, `⑦ 主堡應為 2 座（實得 ${nexus.length}）`);
  ok(nexus.filter((n) => n.team === "blue").length === 1
    && nexus.filter((n) => n.team === "red").length === 1, "⑦ 藍紅各一座主堡");
  ok(st.every((s) => Number.isFinite(s.world.x) && Number.isFinite(s.world.z)),
    "⑥ 所有結構的世界座標都應為 finite");
  //  ⚠ 這條是「不得由 Debug 地圖再生一套塔」的直接把關：Runtime 地圖必須關掉自己的塔。
  const runtimeMap = read("src/battle/moba/map/MobaRuntimeMap.jsx");
  ok(/towers:\s*false/.test(runtimeMap),
    "⑥ MobaRuntimeMap 必須以 towers:false 掛載 MobaMapBlockout（否則會出現兩套塔）");
}

// 大型目標
{
  const objs = adaptObjectives(late);
  ok(objs.length > 0, "野區 / 大型目標應有資料");
  ok(objs.every((o) => Number.isFinite(o.world.x) && Number.isFinite(o.world.z)),
    "野區 / 大型目標座標應為 finite");
  for (const key of ["dragon", "baron"]) {
    ok(objs.some((o) => o.type === key), `應包含 ${key}`);
  }
  //  補位的座標必須誠實標記，不得假裝是 snapshot 給的
  ok(objs.every((o) => typeof o.fallbackPosition === "boolean"),
    "每個目標都要標明位置是否為 presentation fallback");
}

// ⑧ 新舊 presentation 共用同一 snapshot 來源
{
  const gv = read("src/GameView.jsx");
  ok(/MobaRuntimeView3D/.test(gv) && /MobaView3D/.test(gv),
    "⑧ GameView 應同時掛得起 legacy 與 runtime-v2");
  ok(/isRuntimeV2\(mapMode\)/.test(gv), "⑧ GameView 應依 presentation mode 切換畫面");
  const rt = code("src/battle/moba/render/MobaRuntimeView3D.jsx");
  ok(/useGameStore/.test(rt), "⑧ runtime-v2 必須讀 useGameStore（與 legacy 同一份 snapshot）");
  ok(!/useLocalServer|new LogicEngine/.test(rt), "⑧ runtime-v2 不得自己驅動第二個引擎");
}

// ⑨ Renderer 不得 import LogicEngine 並自行執行
{
  for (const p of [
    "src/battle/moba/render/MobaRuntimeView3D.jsx",
    "src/battle/moba/render/MobaRuntimeHeroes.jsx",
    "src/battle/moba/render/MobaRuntimeStructures.jsx",
    "src/battle/moba/map/MobaRuntimeMap.jsx",
    "src/battle/moba/map/mobaRuntimeMapAdapter.js",
  ]) {
    const src = code(p);
    ok(!/from\s+["'][^"']*LogicEngine/.test(src), `⑨ ${p} 不得 import LogicEngine`);
    ok(!/\.tick\s*\(/.test(src), `⑨ ${p} 不得呼叫 tick()`);
  }
}

// ⑩ Replay 可使用同一 Adapter（形狀相容）
{
  //  replay 存的是 snapshot frame；用 adapter 直接吃它應該完全一樣
  const replayLike = JSON.parse(JSON.stringify(mid));
  const a = adaptRuntimeMapFrame(mid, {});
  const b = adaptRuntimeMapFrame(replayLike, {});
  ok(a.heroes.length === b.heroes.length && a.structures.length === b.structures.length,
    "⑩ 同一份 snapshot 走 JSON 往返後，Adapter 輸出件數應相同（Replay 相容）");
  ok(JSON.stringify(a.heroes.map((h) => [h.id, h.world.x, h.world.z]))
    === JSON.stringify(b.heroes.map((h) => [h.id, h.world.x, h.world.z])),
    "⑩ Replay 走同一個 Adapter 應得到相同座標");
  ok(!/LogicEngine/.test(code("src/battle/moba/replay/replayPresentationSource.js")),
    "⑩ Replay 來源仍不得 import LogicEngine");
}

// ⑪ Debug UI 未進入正式 Runtime
{
  const banned = [
    ["MobaMapPreview", "Debug 預覽頁"],
    ["WalkableOverlay", "可走性疊層"],
    ["PassabilityOverlay", "可走性測試線"],
    ["BaseMirrorOverlay", "基地鏡射檢查"],
    ["buildPassability", "可走性計算"],
    ["buildBaseSymmetryReport", "鏡射報告"],
  ];
  for (const p of [
    "src/battle/moba/render/MobaRuntimeView3D.jsx",
    "src/battle/moba/map/MobaRuntimeMap.jsx",
  ]) {
    const src = code(p);
    for (const [needle, label] of banned) {
      ok(!new RegExp(`\\b${needle}\\b`).test(src),
        `⑪ ${p} 不得引入 ${label}（${needle}）`);
    }
  }
  const runtimeMap = read("src/battle/moba/map/MobaRuntimeMap.jsx");
  ok(/labels:\s*false/.test(runtimeMap) && /coords:\s*false/.test(runtimeMap),
    "⑪ 正式 Runtime 不得顯示座標標記與標籤");
}

// ⑫ Feature flag 可切換回 legacy
{
  ok(MAP_PRESENTATION_IDS.includes(MAP_PRESENTATION.LEGACY)
    && MAP_PRESENTATION_IDS.includes(MAP_PRESENTATION.RUNTIME_V2),
    "⑫ 呈現模式應有 legacy 與 runtime-v2 兩種");
  const mp = read("src/battle/moba/mobaMapPresentation.js");
  ok(/VITE_MOBA_RUNTIME_MAP_V2/.test(mp), "⑫ 應支援 VITE_MOBA_RUNTIME_MAP_V2 建置旗標");
  ok(/return envFlag\(\) \?\? MAP_PRESENTATION\.LEGACY/.test(mp),
    "⑫ 沒有任何設定時必須預設 legacy（行為不變）");
  const gv = read("src/GameView.jsx");
  ok(/pickMapMode/.test(gv), "⑫ 畫面上要有切回舊版的入口");
}

// 座標契約：Runtime 與 Debug 用同一套
{
  ok(COORDINATE_CONTRACT.worldScale === 1.7, "座標契約：WORLD_SCALE 應為 1.7");
  ok(COORDINATE_CONTRACT.source === "src/gameData.js", "座標契約：唯一真相來源應是 gameData");
  const w = simToWorld({ x: 110, y: 110 });
  ok(Math.abs(w.x) < 1e-9 && Math.abs(w.z) < 1e-9, "座標契約：地圖中心應映射到世界原點");
  //  Debug 地圖與 Runtime 都必須從契約檔取用換算
  for (const p of ["src/battle/moba/map/MobaMapBlockout.jsx", "src/battle/moba/render/MobaRuntimeView3D.jsx"]) {
    ok(/coordinateMapping\.js/.test(read(p)), `座標契約：${p} 應透過 coordinateMapping 取得換算`);
  }
}

console.log(`\nH.1 Runtime Map 接線檢查：${pass} 通過、${fail} 失敗`);
process.exit(fail === 0 ? 0 : 1);
