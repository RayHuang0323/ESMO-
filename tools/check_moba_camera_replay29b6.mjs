// ============================================================================
//  tools/check_moba_camera_replay29b6.mjs — Sprint 29B6 驗證
//    A) Camera / Touch：pan / pinch zoom / 單一控制來源 / WORLD_BOUNDS clamp
//    C) Real Battle Replay：重播用 battle presentation，不重新模擬、不重複發獎
//    D) Objective death / fade：死亡事件與視覺同步、可由 frame 推導
//    E) Battle feed safe area：戰報不覆蓋 score header、320–430 不溢出
//    + 29B5 / 29B4 / 29B3 / 29B2 / 29B1 / runtime29(S23–S28+regress+build) 巢狀
//
//  用法：
//    node tools/check_moba_camera_replay29b6.mjs           完整（含巢狀，約 20–25 分）
//    SKIP_NESTED=1 node tools/check_moba_camera_replay29b6.mjs   只跑本 Sprint 開發層
//
//  ⚠ **記憶體需求（實測，2026-07-16 / S29B6）**：完整模式最深處是
//    29b6 → runtime29 → stats28 → vite → esbuild —— 同時約 5 個 Node heap
//    ＋ esbuild 的 Go runtime（需 ~1GB）。本機 13.84GB 但僅 ~1.7–2.1GB 可用時，
//    `npm run build` 會以 **exit 134（SIGABRT/OOM）** 掛掉，連帶 stats28 exit=1，
//    看起來像回歸，其實不是（同一支 stats28 單跑 29/29 exit 0、runtime29 單跑 44/44 exit 0）。
//    ⇒ **記憶體吃緊時分兩段跑，覆蓋的檢查完全相同**：
//         SKIP_NESTED=1 node tools/check_moba_camera_replay29b6.mjs   （16/16）
//         node tools/check_moba_runtime29.mjs                          （44/44）
//    這個限制不是 29B6 引入的：check_moba_worldscale29b5 也是同樣的巢狀深度。
//
//  ⚠ Node 證不了的事（一律誠實標記，見檔尾）：觸控手勢、FPS、重播視覺、safe area。
// ============================================================================
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { pathToFileURL } from "url";

const ROOT = process.cwd();
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
/** 剝註解後再比對 ⇒ 斷言看的是**真的執行的程式碼**，不是註解裡的字。 */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const A = [];
const ck = (name, condition) => A.push([name, !!condition]);

const { LogicEngine } = await import(u("src/LogicEngine.js"));
const { WORLD_BOUNDS, PITS } = await import(u("src/gameData.js"));
const { useCameraStore, CAMERA_MODES, ZOOM_MIN, ZOOM_MAX, clampPan, clampZoom } =
  await import(u("src/battle/cameraStore.js"));
const { beginReplayCapture, captureReplayFrame, finalizeReplay, clearReplay } =
  await import(u("src/battle/moba/replay/replayBuffer.js"));
const { createReplaySource, canUse3DPresentation } =
  await import(u("src/battle/moba/replay/replayPresentationSource.js"));
const LAYOUT = await import(u("src/battle/ui/battleLayout.js"));

const V3D = code(src("src/MobaView3D.jsx"));
const BCC = code(src("src/battle/ui/BattleCameraController.jsx"));
const CS = code(src("src/battle/cameraStore.js"));
const GV = code(src("src/GameView.jsx"));
const RS = code(src("src/screens/moba/MobaReplayScreen.jsx"));
const RPS = code(src("src/battle/moba/replay/replayPresentationSource.js"));
const TL = code(src("src/battle/ui/BattleTimeline.jsx"));
const HUD = code(src("src/battle/ui/BattleHUD.jsx"));
const DT = 0.5;

// ═══ A) Camera / Touch ══════════════════════════════════════════════════════

ck(`1) camera mode 有 director / free / heroFocus / objectiveFocus（現值 ${CAMERA_MODES.join("/")}，預設 ${useCameraStore.getState().mode}）`,
  JSON.stringify([...CAMERA_MODES].sort()) === JSON.stringify(["director", "free", "heroFocus", "objectiveFocus"]) &&
  useCameraStore.getState().mode === "director");

{
  // pan/zoom 狀態存在於 cameraStore，且**只有** BattleCameraController 套用到相機。
  //   單一控制來源的反證：drei OrbitControls 已移除（它會同時持有 pan/zoom/rotate）。
  const st = useCameraStore.getState();
  const hasState = st.pan && Number.isFinite(st.pan.x) && Number.isFinite(st.pan.y) && Number.isFinite(st.zoom);
  const noOrbit = !/OrbitControls/.test(V3D) && !/OrbitControls/.test(BCC);
  const noRig = !/function CameraRig/.test(V3D);
  const onlyControllerApplies = /camera\.position\.set/.test(BCC) && !/camera\.position\.set/.test(V3D) &&
    !/camera\.zoom =/.test(V3D);
  ck("2) pan / zoom state 存在且由單一 camera store 管理（cameraStore 持有 pan/zoom；OrbitControls 與 CameraRig 已移除；只有 BattleCameraController 寫相機）",
    hasState && noOrbit && noRig && onlyControllerApplies);
}

{
  // 手動 pan ⇒ free：store 層行為 + view 層拖曳確實呼叫 userPanTo
  useCameraStore.getState().backToDirector();
  const before = useCameraStore.getState().mode;
  useCameraStore.getState().userPanTo(WORLD_BOUNDS.centerX + 10, WORLD_BOUNDS.centerY + 10);
  const afterPan = useCameraStore.getState().mode;
  useCameraStore.getState().backToDirector();
  useCameraStore.getState().userZoomTo(5);
  const afterZoom = useCameraStore.getState().mode;
  const viewDrag = /moved > 8\) panToAnchor/.test(V3D) && /st\.userPanTo\(/.test(V3D);
  const viewPinch = /userZoomTo\(clamp\(pinchZoom \* \(d \/ pinchDist\)/.test(V3D);
  // A-10：地圖操作不得退化成「瀏覽器頁面捲動」。戰場只有 min(82vh,720px) 高、外層可捲，
  //   所以 touch 要 touchAction:none、wheel 要 passive:false + preventDefault
  //   （舊版是 OrbitControls 代為處理，移除它之後必須自己顧）。
  const noPageScroll = /el\.style\.touchAction = "none"/.test(V3D) &&
    /addEventListener\("wheel", onWheel, \{ passive: false \}\)/.test(V3D) &&
    /const onWheel = \(e\) => \{\s*e\.preventDefault\(\);/.test(V3D);
  ck(`3) manual pan / zoom 會進入 free mode（director→userPanTo ⇒ ${afterPan}；director→userZoomTo ⇒ ${afterZoom}；view：拖曳>8px 走 userPanTo、雙指走 userZoomTo；touchAction:none + wheel passive:false+preventDefault ⇒ 不靠頁面捲動）`,
    before === "director" && afterPan === "free" && afterZoom === "free" && viewDrag && viewPinch && noPageScroll);
  useCameraStore.getState().backToDirector();
}

{
  // clamp 必須用 WORLD_BOUNDS（而不是散落的 100/50 魔術數字）
  const farOut = clampPan(WORLD_BOUNDS.maxX + 5000, WORLD_BOUNDS.minY - 5000);
  const farNeg = clampPan(-1e9, 1e9);
  const inside = clampPan(WORLD_BOUNDS.centerX, WORLD_BOUNDS.centerY);
  const zHi = clampZoom(1e9), zLo = clampZoom(-1e9);
  useCameraStore.getState().userPanTo(1e9, -1e9);
  const st = useCameraStore.getState();
  const storeClamped = st.pan.x === WORLD_BOUNDS.maxX && st.pan.y === WORLD_BOUNDS.minY;
  useCameraStore.getState().backToDirector();
  ck(`4) camera clamp 使用 WORLD_BOUNDS（clampPan(+∞,−∞)=(${farOut.x},${farOut.y})；(−∞,+∞)=(${farNeg.x},${farNeg.y})；zoom∈[${zLo},${zHi}]；store 實際 pan 也被夾住 ⇒ 不會滑出地圖黑區）`,
    /WORLD_BOUNDS/.test(CS) &&
    farOut.x === WORLD_BOUNDS.maxX && farOut.y === WORLD_BOUNDS.minY &&
    farNeg.x === WORLD_BOUNDS.minX && farNeg.y === WORLD_BOUNDS.maxY &&
    inside.x === WORLD_BOUNDS.centerX && inside.y === WORLD_BOUNDS.centerY &&
    zHi === ZOOM_MAX && zLo === ZOOM_MIN && storeClamped);
}

{
  // 相機操作不改模擬：零引擎 import + 實跑「每秒 pan/zoom/翻模式」對照逐位元相同
  const fp = (e) => JSON.stringify([e.t, e.bK, e.rK, e.winner, e.bGold, e.rGold]);
  const eA = new LogicEngine(606);
  for (let t = DT; t <= 1500; t += DT) eA.tick(DT);
  const eB = new LogicEngine(606);
  const modes = ["director", "free", "heroFocus", "objectiveFocus"];
  let i = 0;
  for (let t = DT; t <= 1500; t += DT) {
    eB.tick(DT);
    if (Math.floor(t) !== Math.floor(t - DT)) {
      const c = useCameraStore.getState();
      c.setMode(modes[i % 4]);
      c.userPanTo(WORLD_BOUNDS.minX + (i * 7) % WORLD_BOUNDS.width, WORLD_BOUNDS.minY + (i * 13) % WORLD_BOUNDS.height);
      c.userZoomTo(2 + (i % 7));
      i++;
    }
  }
  useCameraStore.getState().backToDirector();
  const noEngine = !/LogicEngine|useGameStore\.setState|pushFrame|\.tick\(/.test(CS) && !/LogicEngine/.test(BCC);
  ck(`5) camera 操作不改 simulation result（cameraStore/控制器零引擎寫入；模擬中每秒 pan+zoom+翻模式 ${i} 次 ⇒ 結果逐位元相同）`,
    noEngine && fp(eA) === fp(eB));
}

{
  // 點英雄仍進 heroFocus（store 行為 + view 的 raycast 命中路徑）
  useCameraStore.getState().focusHero("b3");
  const s = useCameraStore.getState();
  useCameraStore.getState().backToDirector();
  ck(`6) hero click 仍進 heroFocus（focusHero("b3") ⇒ mode=${s.mode} heroId=${s.heroId}；view：raycast 命中英雄 ⇒ focusHero；tap 判定 ≤8px）`,
    s.mode === "heroFocus" && s.heroId === "b3" &&
    /intersectObjects/.test(V3D) && /focusHero\(hit\.object\.userData\.heroId\)/.test(V3D) &&
    /wasTap = downPt && moved <= 8/.test(V3D) &&
    /backToDirector/.test(V3D) && /dblclick/.test(V3D));
}

// ═══ C) Real Battle Replay ══════════════════════════════════════════════════

clearReplay();
const engR = new LogicEngine(29601, null, { rules: "v3" });
beginReplayCapture({ seed: 29601, config: { sprint: "29B6" } });
for (let i = 0; i < 6; i++) { captureReplayFrame(engR.snapshot()); for (let k = 0; k < 4; k++) engR.tick(DT); }
captureReplayFrame(engR.snapshot());
const replay = finalizeReplay({ matchId: "camrep29b6", events: [{ t: 1, type: "KILL", side: "blue", text: "測試事件" }] });

{
  const usesView3D = /import MobaView3D from/.test(RS) && /<MobaView3D/.test(RS);
  const usesSource = /createReplaySource\(replay\)/.test(RS) && /source=\{source\}/.test(RS);
  // 小地圖 SVG 只能是輔助 inset，不能是唯一的重播畫面
  const svgIsInset = /inset\b/.test(RS) && /ReplayMap2D/.test(RS);
  // MobaView3D 必須真的可注入 source（否則「共用」只是名義上的）
  const injectable = /source = null/.test(V3D) && /const src = source \?\? useGameStore/.test(V3D) &&
    /src\.getState\(\)/.test(V3D) && !/useGameStore\.getState\(\)/.test(V3D);
  ck("7) replay screen 使用 battle presentation（同一個 MobaView3D + 唯讀 source），而非只有 minimap SVG（SVG 降為 inset）",
    usesView3D && usesSource && svgIsInset && injectable);
}

{
  // 不重新模擬：播放器 / adapter 零引擎 import、零 tick、零 Store 寫入
  const noEngine = !/import[^;]*LogicEngine/.test(RS) && !/\.tick\(/.test(RS) && !/new CommsEngine/.test(RS) &&
    !/import[^;]*LogicEngine/.test(RPS) && !/\.tick\(/.test(RPS);
  const noStore = !/profileStore|seasonStore|battleStore|useBattleFeed/.test(RPS) &&
    !/useGameStore/.test(RPS) && !/useBattleFeed/.test(RS);
  // adapter 只暴露讀取面
  const readOnly = /getState: \(\) => state/.test(RPS) && !/setState/.test(RPS);
  ck("8) replay frame 不重新模擬（ReplayScreen / presentationSource 零 LogicEngine import、零 .tick(、零 Store 寫入；adapter 只有 getState/seek）",
    noEngine && noStore && readOnly);
}

{
  // 不重複發獎：播放路徑碰不到結算/入史
  const noReward = ["applyMatchProgress(", "recordResult(", "recordCsMatch(", "profileStore", "seasonStore"]
    .every((k) => !RS.includes(k) && !RPS.includes(k));
  ck("9) replay 不重複發獎（播放器/adapter 零 applyMatchProgress / recordResult / recordCsMatch / profileStore / seasonStore）",
    noReward);
}

{
  // mapMeta fallback：新 replay 走 3D；無 mapMeta / 尺度不符的舊 replay ⇒ 2D SVG，不白畫面
  const newOk = canUse3DPresentation(replay);
  const legacy = { ...replay, mapMeta: undefined };
  const mismatched = { ...replay, mapMeta: { bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 } } };
  const emptyFrames = { ...replay, frames: [] };
  ck(`10) replay 有 mapMeta fallback（新 replay 3D=${newOk}；無 mapMeta=${canUse3DPresentation(legacy)}；100×100 舊尺度=${canUse3DPresentation(mismatched)}；空 frames=${canUse3DPresentation(emptyFrames)} ⇒ 退 2D SVG，legacyBounds 仍在）`,
    newOk === true && canUse3DPresentation(legacy) === false &&
    canUse3DPresentation(mismatched) === false && canUse3DPresentation(emptyFrames) === false &&
    /legacyBounds/.test(RS) && /舊格式重播/.test(src("src/screens/moba/MobaReplayScreen.jsx")));
}

{
  // replay 顯示 objective states：adapter 合成的 snapshot 必須帶 objectives（含 hp/alive/pos）
  const s = createReplaySource(replay);
  s.seek(0);
  const snap = s.getState().snapshot;
  const objs = snap.objectives ?? [];
  const hasDragon = objs.some((o) => o.id === "dragon") && objs.some((o) => o.id === "baron");
  const hasCamps = objs.some((o) => o.type === "camp" || o.type === "buff");
  const shaped = objs.every((o) => o.pos && Number.isFinite(o.pos.x) && Number.isFinite(o.hp) && typeof o.alive === "boolean");
  const towers = Object.values(snap.towers ?? {});
  const towersOk = towers.length > 0 && towers.every((t) => t.pos && Number.isFinite(t.hp) && t.side);
  const playersOk = (snap.players ?? []).length === 10 && snap.players.every((p) => p.pos && Number.isFinite(p.hp));
  ck(`11) replay 顯示 objective states（adapter snapshot：objectives ${objs.length} 筆含 dragon/baron/camps、hp/alive/pos 齊全；塔 ${towers.length} 座；英雄 ${(snap.players ?? []).length} 位；事件 ${replay.events.length} 筆）`,
    hasDragon && hasCamps && shaped && towersOk && playersOk && replay.events.length > 0);
}

// ═══ D) Objective death / fade sync ═════════════════════════════════════════

{
  // 引擎層：hp 歸零的**同一 tick** 就 alive=false 且 snapshot.hp=0（無延遲）
  const life = new LogicEngine(29602, null, { rules: "v3" });
  const { SIM_RULES } = await import(u("src/battle/moba/matchProgression.js"));
  while (life.t < SIM_RULES.v3.dragonSpawn) life.tick(DT);
  life.neutrals.dragon.hp = 1;
  const jg = life.players.find((p) => p.side === "blue" && p.role === "jungle");
  jg.pos = { ...PITS.dragon }; jg.sp.d.readyAt = life.t;
  life._updateNeutralsV3(life.players.filter((p) => !p.dead), DT);
  const snapAfter = life.snapshot();
  const dObj = (snapAfter.objectives ?? []).find((o) => o.id === "dragon");
  const sameTick = life.neutrals.dragon.alive === false && life.neutrals.dragon.hp <= 0 &&
    dObj && dObj.alive === false && dObj.hp === 0 && snapAfter.dragon.alive === false && snapAfter.dragon.hp === 0;
  const respawnShown = dObj.respawn > 0;   // 死亡即帶 respawn 倒數（absent 狀態可辨）
  ck(`12) objective death event 與 alive=false / hp=0 對齊（引擎同一 tick：alive=${dObj?.alive} hp=${dObj?.hp} respawn=${dObj?.respawn}s；legacy mirror 同步）`,
    sameTick && respawnShown);
}

{
  // 呈現層：死亡/淡出可由 frame 推導 —— 目標 hp 與英雄走**同一條 prev→snapshot 插值**，
  //   next 死亡時撐到 a=1 才轉死 ⇒ 血條歸零與模型死亡同幀；fade 有明確常數且 ∈[0.8,1.5]。
  const { OBJ_FADE_S } = await import(u("src/MobaView3D.jsx")).catch(() => ({ OBJ_FADE_S: null }));
  const fadeConst = /OBJ_FADE_S = 1\.1/.test(V3D);
  const fadeInRange = /export const OBJ_FADE_S/.test(V3D) && fadeConst;
  const interpolated = /prev\.objectives/.test(V3D) && /lerp\(pv\.hp, nx\.hp, a\)/.test(V3D) &&
    /lerp\(pv\.hp, 0, a\)/.test(V3D);
  const holdToTickEnd = /const alive = nAlive \|\| \(pAlive && a < 1\)/.test(V3D);
  const usesFade = /o\.deathT = OBJ_FADE_S/.test(V3D) && /st\.dieK/.test(V3D);
  const noHpBarWhenDead = /o\.hpGrp\.visible = st\.alive && !!objMap\[k\]/.test(V3D) &&
    /co\.hpGrp\.visible = false/.test(V3D);
  const absent = /updAbsent/.test(V3D) && /ring\.visible = !alive && !dying/.test(V3D);
  // 舊的「追值」寫法必須真的消失（它是 29B6 查出的殘留血條成因）
  const noChase = !/lerp\(o\.shownHp \?\? hpNow, hpNow, Math\.min\(1, dt \* 6\)\)/.test(V3D);
  ck(`13) objective death fade 狀態可由 frame 推導（hp/alive 走 prev→snapshot 插值、死亡撐到 a=1；fade 常數 OBJ_FADE_S=1.1s ∈[0.8,1.5]；死後不顯示 HP bar；absent 環；追值殘留已移除）`,
    fadeInRange && interpolated && holdToTickEnd && usesFade && noHpBarWhenDead && absent && noChase);
}

{
  // replay 與 live 一致：adapter 的 ob → alive/hp 與 live 同語意（0 ⇒ 死亡），
  //   且死亡/fade 由**同一段 MobaView3D 程式碼**處理（沒有第二套目標渲染）。
  const s = createReplaySource(replay);
  const withOb = replay.frames.some((f) => Array.isArray(f.ob));
  s.seek(replay.frames[0].t);
  const snap0 = s.getState().snapshot;
  const consistent = (snap0.objectives ?? []).every((o) => (o.hp > 0) === o.alive);
  // 造一顆「打完」的 frame：ob 全 0 ⇒ adapter 必須回報 alive=false / hp=0
  const dead = createReplaySource({
    ...replay,
    frames: [{ ...replay.frames[0], ob: (replay.frames[0].ob ?? []).map(() => 0), dr: 0, br: 0 }],
  });
  dead.seek(0);
  const dSnap = dead.getState().snapshot;
  const allDead = (dSnap.objectives ?? []).every((o) => o.alive === false && o.hp === 0) &&
    dSnap.dragon.alive === false && dSnap.baron.alive === false;
  const singleRenderPath = (V3D.match(/const updNeutral = /g) ?? []).length === 1;
  ck(`14) Replay 與 live 的 objective 死亡顯示一致（frame.ob 帶 hp=${withOb}；ob>0⇔alive 一致=${consistent}；ob 全 0 ⇒ 全部 alive=false/hp=0=${allDead}；死亡/fade 只有一套 updNeutral 實作）`,
    withOb && consistent && allDead && singleRenderPath);
}

// ═══ E) Battle feed safe area ═══════════════════════════════════════════════

{
  // 戰報 / 控制鈕的頂部必須在 score header 底緣之下（結構上不可能再蓋到藍紅條）
  const orderOk = LAYOUT.SAFE_TOP >= LAYOUT.HUD_TOP + LAYOUT.HUD_H;
  const feedUsesSafeTop = /top: SAFE_TOP/.test(TL) && !/top: 96/.test(TL);
  const ctlUsesSafeTop = /top: SAFE_TOP/.test(GV) && !/top: 92/.test(GV) && !/top: isMobile \? 128 : 92/.test(GV);
  const hudUsesConst = /top: HUD_TOP/.test(HUD) && /maxHeight: HUD_H/.test(HUD);
  // 戰報預設單行 toast（手機）＋ 完整戰報靠 drawer 展開
  const toastDefault = /useState\(\(\) => isMobile\)/.test(TL) && /fold && latest/.test(TL);
  // 戰報不吃地圖手勢（根層 pointer-events: none，只有可點的標題列 auto）
  const feedNotBlocking = /pointerEvents: "none"/.test(TL) && /pointerEvents: "auto"/.test(TL);
  ck(`15) Battle feed mobile safe area 不覆蓋 score header（SAFE_TOP=${LAYOUT.SAFE_TOP} ≥ HUD_TOP+HUD_H=${LAYOUT.HUD_TOP + LAYOUT.HUD_H}；戰報與控制鈕都用 SAFE_TOP，舊的 top:96 / top:92 已移除；手機預設單行 toast + drawer 展開；戰報 root pointer-events:none）`,
    orderOk && feedUsesSafeTop && ctlUsesSafeTop && hudUsesConst && toastDefault && feedNotBlocking);
}

{
  // 320 / 360 / 390 / 430：戰報 + 右上控制鈕欄不得水平溢出，且兩者不重疊
  // 戰報左緣 FEED_LEFT、寬度 min(FEED_MAX_W, 62vw, 100% − FEED_LEFT − RESERVE)
  //   ⇒ 右緣必須 ≤ 視寬 − RESERVE（右上控制鈕欄的保留區），否則兩者會疊在一起。
  const widths = [320, 360, 390, 430];
  const feedRight = (w) => LAYOUT.FEED_LEFT +
    Math.min(LAYOUT.FEED_MAX_W, w * 0.62, w - LAYOUT.FEED_LEFT - LAYOUT.FEED_RIGHT_RESERVE);
  const noOverflow = widths.every((w) => feedRight(w) <= w);
  const noCollide = widths.every((w) => feedRight(w) <= w - LAYOUT.FEED_RIGHT_RESERVE);
  // 版面沒有寫死的超寬元素（HUD / 面板一律 min(96%, PANEL_MAX_W)）
  const responsiveW = /width: `min\(96%, \$\{PANEL_MAX_W\}px\)`/.test(HUD) &&
    /maxWidth: `calc\(100% - \$\{FEED_LEFT \+ FEED_RIGHT_RESERVE\}px\)`/.test(TL);
  const noFixedWide = !/width: (5[0-9][0-9]|[6-9][0-9][0-9])px/.test(TL) && !/width: (5[0-9][0-9]|[6-9][0-9][0-9])px/.test(HUD);
  ck(`16) 320 / 360 / 390 / 430 layout 無硬性超寬元素（戰報右緣 ${widths.map((w) => `${w}:${Math.round(feedRight(w))}`).join(" ")}；皆 ≤ 視寬且不撞右上控制鈕欄；HUD/戰報用 min()/calc() 響應式）`,
    noOverflow && noCollide && responsiveW && noFixedWide);
}

// ═══ 巢狀：既有防線 ═════════════════════════════════════════════════════════

function runNode(script, shape, env = {}, timeout = 2400000) {
  try {
    const out = execFileSync(process.execPath, [path.join(ROOT, script)], {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout, env: { ...process.env, ...env },
    });
    return { ok: shape.test(out), code: 0, out };
  } catch (e) {
    return { ok: false, code: e.status ?? -1, out: String(e.stdout ?? "") + String(e.stderr ?? "") };
  }
}

if (process.env.SKIP_NESTED === "1") {
  console.log("⚠ SKIP_NESTED=1：跳過 17–23 巢狀驗證（僅供開發迭代）");
} else {
  for (const [name, script, shape] of [
    ["17) 29B5 worldscale verifier", "tools/check_moba_worldscale29b5.mjs", /20\/20 通過/],
    ["18) 29B4 recovery verifier", "tools/check_moba_recovery29b4.mjs", /21\/21 通過/],
    ["19) 29B3 controls verifier", "tools/check_moba_controls29b3.mjs", /18\/18 通過/],
    ["20) 29B2 presentation verifier", "tools/check_moba_presentation29b2.mjs", /12\/12 通過/],
    ["21) 29B1 pacing verifier", "tools/check_moba_pacing29b1.mjs", /25\/25 通過/],
  ]) {
    const r = runNode(script, shape, { SKIP_NESTED: "1" });
    ck(`${name}（exit=${r.code}，輸出形狀符合）`, r.code === 0 && r.ok);
    if (!(r.code === 0 && r.ok)) console.log(r.out);
  }
  // runtime29 已巢狀包含 S23–S28 + regress + regress2 + build ⇒ 跑它 = 跑完全部防線
  const runtime = runNode("tools/check_moba_runtime29.mjs", /44\/44 通過/);
  const runtimeShape = /Sprint28 verifier 29\/29/.test(runtime.out) && /Sprint23 verifier 28\/28/.test(runtime.out) &&
    /regress/.test(runtime.out) && /regress2/.test(runtime.out) && /npm run build/.test(runtime.out);
  ck(`22) runtime29 44/44 + S23–S28 + regress / regress2 / build（exit=${runtime.code}，含必要輸出形狀）`,
    runtime.code === 0 && runtime.ok && runtimeShape);
  if (!(runtime.code === 0 && runtime.ok && runtimeShape)) console.log(runtime.out);

  const build = (() => {
    try {
      const out = execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"],
        { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 600000 });
      return { ok: /built in/.test(out), code: 0 };
    } catch (e) { return { ok: false, code: e.status ?? -1 }; }
  })();
  ck(`23) npm run build（exit=${build.code}，輸出含 "built in"）`, build.code === 0 && build.ok);
}

// ═══ 結果 ═══════════════════════════════════════════════════════════════════
console.log("\n── Sprint 29B6：MOBA Camera Control / Real Replay / Battle UI ──");
for (const [name, ok] of A) console.log(`${ok ? "✅" : "❌"} ${name}`);
const passed = A.filter(([, ok]) => ok).length;
console.log(`\n${passed}/${A.length} 通過`);
console.log(`⚠ 未實測（本環境無瀏覽器/真機，Node 無法證明）：
  · 觸控手勢未真機驗收（單指 pan / 雙指 pinch zoom / tap 英雄 / 雙擊回導播）
  · FPS 未量測（移除 OrbitControls、新增 absent 環與手勢層後的實機幀率）
  · replay 視覺未人工驗收（3D 重播外觀、inset 小地圖、舊格式 fallback 畫面）
  · safe area 未真機確認（320/360/390/430 的戰報/控制鈕實際位置與瀏海/圓角）
  —— 需 Ray 依 29B6 人工驗收清單實測`);
process.exit(passed === A.length ? 0 : 1);
