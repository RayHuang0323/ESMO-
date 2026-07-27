// ============================================================================
//  debug/MobaMapBlockout/MobaMapPreview.jsx — MOBA 地圖預覽（Milestone F → G.7）
//
//  進入：?debug=moba-map-blockout（正式流程不受影響，見 main.jsx）。
//  掛載 <MobaMapBlockout>（純渲染，不含模擬）；提供相機、圖層切換、
//  【G.7 新增】可走性圖層（路線中心線 / 最窄通道 / 阻擋區 / 英雄碰撞圓 /
//  功能牆鏈編號 / 營地入口）、即時效能 HUD（gl.info）、桌面/手機/手機低階 preset。
//  所有畫面文字繁體中文。
// ============================================================================
import React, { useRef, useState, useEffect, useMemo } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import MobaMapBlockout from "../../battle/moba/map/MobaMapBlockout.jsx";
import { worldX, worldZ, WORLD_SCALE, toWorld } from "../../battle/moba/map/coordinateMapping.js";
import { buildMobaLayout } from "../../battle/moba/map/mobaMapLayout.js";
import { buildTerrainShapes } from "../../battle/moba/map/mapTerrainShapes.js";
import { buildPassability, HERO_RADIUS } from "../../battle/moba/map/mapPassability.js";
import {
  buildBaseSymmetryReport, buildBaseHierarchyReport, buildBaseExitReport, EXIT_MIN_WIDTH,
  buildBaseBlueprintReport,
} from "../../battle/moba/map/mapBaseSymmetry.js";
import { MIRROR_LANE } from "../../battle/moba/map/mapTowerLayoutStyle.js";

const BTN = { font: "12px ui-monospace,monospace", color: "#e7edf5", cursor: "pointer",
  background: "#1a2430", border: "1px solid #2a3542", borderRadius: 6, padding: "4px 9px" };

const CAM = {
  full: { pos: [0, 430, 118], tgt: [0, 0, 0] },
  blue: { pos: [worldX(22) - 90, 240, worldZ(202) + 96], tgt: [0, 0, 0] },
  red: { pos: [worldX(198) + 90, 240, worldZ(18) - 96], tgt: [0, 0, 0] },
};
const MODE = {
  clean: { landmark: false, labels: false, coords: false },
  debug: { landmark: true, labels: true, coords: true },
};

// ════════════════════════════════════════════════════════════════════════════
//  G.15-fix4：固定視角截圖模式（?debug=moba-map-blockout&shot=<id>）
//
//  給 tools/shot_moba_map.mjs（headless Chrome + CDP）用。URL 決定相機與圖層，
//  畫面上不出現任何 HUD / debug 線 / 標籤；連續算圖穩定後才把
//  window.__MAP_SHOT_READY 設成該 shot id，截圖工具看到它才按快門。
//  ⇒ 每一張圖的相機位置 / 高度 / 俯角 / FOV 都由程式算出，逐張可重現。
//
//  三個出口近照的相機是**以該出口自己的方位**放的（門外 GATE_CAM.dist、
//  高 GATE_CAM.height、看向門心）⇒ 三張圖等於把三個出口各自轉到同一朝向後拍，
//  牆體輪廓若有差異，直接疊圖就看得出來。
// ════════════════════════════════════════════════════════════════════════════
export const SHOT_ID = typeof window !== "undefined"
  ? new URLSearchParams(window.location.search).get("shot") : null;

const GATE_CAM = { dist: 27, height: 15, look: 5.0, fov: 42 };  // 模擬單位
const TOPDOWN_CAM = { height: 100, fov: 42 };
const LOW_CAM = { dist: 56, height: 18, look: 7.0, fov: 44 };   // 低角度：沿扇形中軸看進去

//  各聚焦模式的圖層（一律關 HUD / 可走性線 / 標籤 / debug 疊層，見 ShotCamera 上方註解）
const OFF = { lane: false, jungle: false, towers: false, pits: false, bush: false,
  monsters: false, decor: false, walls: false, base: false, baseFocus: null };
const SHOT_LAYERS = {
  //  基地結構：地表 + 牆體 + 塔（判斷「道路→入口→牆→塔」關係用）
  base: { ...OFF, lane: true, towers: true, walls: true, base: true, baseFocus: "struct" },
  //  只看道路出口：地表 + 道路 + 坡道，牆與塔關掉 ⇒ 三個開口的方向與寬度直接比
  exits: { ...OFF, lane: true, base: true, baseFocus: "exit" },
  //  只看牆體：牆 + 基地地表，塔與道路關掉 ⇒ 塔間牆體的長度與節奏直接比
  walls: { ...OFF, walls: true, base: true, baseFocus: "wall" },
  //  只看高地塔：塔 + 基地地表，牆關掉 ⇒ 三座塔與出口中心的相對位置直接比
  towers: { ...OFF, lane: true, towers: true, base: true, baseFocus: "exit" },
  overlay: { ...OFF, towers: true, walls: true, base: true, baseFocus: "bp_overlay" },
  full: { lane: true, jungle: true, towers: true, pits: true, bush: true,
    monsters: true, decor: true, walls: true, base: true, baseFocus: null },
};

/** shot id → { layers, camera(T) }。camera 回傳 { pos, tgt, up?, fov }（世界座標）。 */
function shotSpec(id, T) {
  const node = (side, kind, lane) => T.baseBlueprint[side]
    .find((i) => i.kind === kind && (lane ? i.lane === lane : true));
  const m = /^(blue|red)_(top|mid|bot)$/.exec(id ?? "");
  if (m) {
    const g = node(m[1], "gate", m[2]);
    const ux = Math.cos(g.rot), uy = Math.sin(g.rot);
    const cx = g.x + ux * GATE_CAM.dist, cy = g.y + uy * GATE_CAM.dist;
    return {
      layers: SHOT_LAYERS.base,
      pos: [worldX(cx), GATE_CAM.height * WORLD_SCALE, worldZ(cy)],
      tgt: [worldX(g.x), GATE_CAM.look * WORLD_SCALE, worldZ(g.y)],
      fov: GATE_CAM.fov,
    };
  }
  //  俯視系列：<side>_topdown / <side>_exits / <side>_walls / <side>_towers / overlay
  //  ⇒ 五張共用完全相同的相機（正俯視、上方向 = 該方的出口扇形中軸），
  //    差別只有圖層 ⇒ 可以直接疊圖比對。
  const td = /^(blue|red)_(topdown|exits|walls|towers)$/.exec(id ?? "");
  if (td || id === "overlay") {
    const side = td ? td[1] : "blue";
    const kind = td ? td[2] : "overlay";
    const C = node(side, "apron_center");
    const layers = kind === "topdown" ? SHOT_LAYERS.base : SHOT_LAYERS[kind];
    return {
      layers,
      pos: [worldX(C.x), TOPDOWN_CAM.height * WORLD_SCALE, worldZ(C.y)],
      tgt: [worldX(C.x), 0, worldZ(C.y)],
      up: [Math.cos(C.rot), 0, Math.sin(C.rot)],
      fov: TOPDOWN_CAM.fov,
    };
  }
  //  低角度：站在出口扇形中軸的外側、貼近地面看進基地 ⇒ 牆高、門樓、塔的層次
  const lw = /^(blue|red)_low$/.exec(id ?? "");
  if (lw) {
    const C = node(lw[1], "apron_center");
    const cx2 = C.x + Math.cos(C.rot) * LOW_CAM.dist, cy2 = C.y + Math.sin(C.rot) * LOW_CAM.dist;
    return {
      layers: SHOT_LAYERS.base,
      pos: [worldX(cx2), LOW_CAM.height * WORLD_SCALE, worldZ(cy2)],
      tgt: [worldX(C.x), LOW_CAM.look * WORLD_SCALE, worldZ(C.y)],
      fov: LOW_CAM.fov,
    };
  }
  return { layers: SHOT_LAYERS.full, pos: [0, 430, 118], tgt: [0, 0, 0], fov: 48 };
}

/** 固定相機 + 就緒旗標（截圖模式專用；不掛 OrbitControls）。 */
function ShotCamera({ spec, id }) {
  const { camera, invalidate } = useThree();
  const n = useRef(0);
  useFrame(() => {
    camera.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
    camera.up.set(...(spec.up ?? [0, 1, 0]));
    camera.fov = spec.fov; camera.near = 1; camera.far = 4000;
    camera.lookAt(spec.tgt[0], spec.tgt[1], spec.tgt[2]);
    camera.updateProjectionMatrix();
    n.current += 1;
    if (n.current === 40) window.__MAP_SHOT_READY = id;
  });
  return null;
}
// 效能 preset（桌面 / 手機 / 手機低階）：控制 dpr、LOD ring、塔陰影、裝飾岩。
const PRESET = {
  desktop: { label: "桌面", dpr: [1, 2], ring: "desktop", shadow: true, decor: true },
  mobile: { label: "手機", dpr: [1, 1.5], ring: "mobile", shadow: false, decor: true },
  low: { label: "手機低階", dpr: [1, 1], ring: "mobile-low", shadow: false, decor: false },
};

// 圓環（世界 XZ 平面）折線點；r 為模擬單位。
function ring(cx, cy, r, y, n = 28) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([worldX(cx) + Math.cos(a) * r * WORLD_SCALE, y, worldZ(cy) + Math.sin(a) * r * WORLD_SCALE]);
  }
  return out;
}

/** 可走性圖層：路線中心線 / 最窄通道環 / 阻擋區 / 英雄碰撞圓 / 牆鏈編號 / 營地入口。 */
/**
 * G.12「可走區域」實體疊層：把 passability 距離場中「英雄站得下（clearance ≥ 半徑 2.4）」
 * 的格子鋪成一層半透明綠地毯。⇒ 一眼看出**真正可走的區域**（綠）vs blocking 岩壁（非綠），
 * 不必只看測試路線。純 debug 疊層。
 */
function WalkableOverlay({ field }) {
  const ref = useRef();
  const cells = useMemo(() => {
    const F = field, out = [], step = 2.4;
    for (let x = F.B.minX + 1; x <= F.B.maxX; x += step)
      for (let y = F.B.minY + 1; y <= F.B.maxY; y += step) {
        const ix = F.gx(x), iy = F.gy(y);
        if (ix < 0 || iy < 0 || ix >= F.nx || iy >= F.ny) continue;
        if (F.dist[F.idx(ix, iy)] * F.cellToSim >= HERO_RADIUS) out.push([x, y]);
      }
    return out;
  }, [field]);
  const geo = useMemo(() => { const g = new THREE.CircleGeometry(1, 6); g.rotateX(-Math.PI / 2); return g; }, []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x3ad17a, transparent: true, opacity: 0.16, depthWrite: false }), []);
  useEffect(() => {
    const m = ref.current; if (!m) return;
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1.6, 1, 1.6), p = new THREE.Vector3();
    cells.forEach(([x, y], i) => { p.set(worldX(x), 2, worldZ(y)); mtx.compose(p, q, s); m.setMatrixAt(i, mtx); });
    m.count = cells.length; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
  }, [cells]);
  return <instancedMesh ref={ref} args={[geo, mat, Math.max(cells.length, 1)]} frustumCulled={false} />;
}

function PassabilityOverlay({ L, T, PASS, opts }) {
  const B = PASS.field.B, cs = PASS.field.cellToSim;
  const cell2world = ([ix, iy], y = 3) => [worldX(B.minX + ix * cs), y, worldZ(B.minY + iy * cs)];
  // 功能牆鏈編號來源：gameData 8 鏈（代表點取 lane 外）＋ 路線結構 ＋ 營地 ＋ 兩坑
  const chains = useMemo(() => {
    const arr = [];
    T.jungleStructures.forEach((s) => arr.push({ x: s.x, y: s.y, tag: "路" }));
    T.camps.forEach((c) => arr.push({ x: c.x, y: c.y, tag: "營" }));
    arr.push({ x: L.pits.dragon.x, y: L.pits.dragon.y, tag: "坑" });
    arr.push({ x: L.pits.baron.x, y: L.pits.baron.y, tag: "坑" });
    return arr;
  }, [L, T]);
  const entrances = useMemo(() => T.entrances.filter((e) => e.kind === "jungle" || e.kind === "pit" || e.kind === "base"), [T]);

  return (
    <group>
      {/* 路線中心線（綠＝達規格、紅＝未達） */}
      {opts.lines && PASS.routes.map((r) => (
        r.path ? (
          <Line key={r.id} points={r.path.filter((_, i) => i % 3 === 0).map((c) => cell2world(c, 3))}
            color={r.meetsSpec ? "#5fd08a" : "#e8664e"} lineWidth={1.5} transparent opacity={0.75} />
        ) : null
      ))}
      {/* 最窄通道：在 pinch 畫「淨寬」環 */}
      {opts.pinch && PASS.routes.map((r) => (
        r.pinch ? (
          <Line key={"p" + r.id} points={ring(r.pinch.x, r.pinch.y, r.narrowest / 2, 3.5)}
            color={r.meetsSpec ? "#8fd0ff" : "#ffb14e"} lineWidth={2} />
        ) : null
      ))}
      {/* 英雄碰撞圓（半徑 1.2）：畫在每條路線最窄處，直觀比對「英雄過不過得去」 */}
      {opts.hero && PASS.routes.map((r) => (
        r.pinch ? (
          <Line key={"h" + r.id} points={ring(r.pinch.x, r.pinch.y, HERO_RADIUS, 3.8)} color="#ffe08a" lineWidth={1.5} />
        ) : null
      ))}
      {/* 阻擋區：未達規格路線的阻擋牆位置 */}
      {opts.block && PASS.routes.filter((r) => !r.meetsSpec).flatMap((r) =>
        r.blockingChains.map((b, i) => (
          <mesh key={r.id + "b" + i} position={toWorld(b.x, b.y, 5)}>
            <boxGeometry args={[3, 10, 3]} />
            <meshBasicMaterial color="#ff3b3b" transparent opacity={0.5} />
          </mesh>
        ))
      )}
      {/* 營地 / 坑口入口標記 */}
      {opts.ents && entrances.map((e, i) => (
        <Line key={"e" + i} points={ring(e.x, e.y, 1.4, 4.2)} color="#c7f39a" lineWidth={2} />
      ))}
      {/* 功能牆鏈編號 */}
      {opts.nums && chains.map((c, i) => (
        <Html key={"n" + i} position={toWorld(c.x, c.y, 6)} center distanceFactor={260}
          style={{ font: "700 11px ui-monospace,monospace", color: "#ffd86b", textShadow: "0 1px 3px #000", pointerEvents: "none" }}>
          {c.tag}{i + 1}
        </Html>
      ))}
    </group>
  );
}

/**
 * G.14「基地鏡射檢查」疊層。
 *
 * 做法是把**紅方的結構整個轉 180° 疊到藍方身上**：
 *   青線 = 藍方本尊（高地平台 / 內庭 / 主堡台 / 三條出口通道）
 *   洋紅虛線 = 紅方同一組結構的鏡射
 * 兩者完全重合 ⇒ 兩邊基地一模一樣；只要有一條分岔，肉眼立刻看得到差在哪。
 * 另外標出四類節點（主堡 / 泉水 / 門牙塔 / 高地塔）與三路出口的最窄處。
 */
function BaseMirrorOverlay({ L, T, exits }) {
  const cx = T.meta.bounds.centerX, cy = T.meta.bounds.centerY;
  const mir = (p) => ({ x: 2 * cx - p.x, y: 2 * cy - p.y });
  const line = (poly, y) => [...poly, poly[0]].map((p) => [worldX(p.x), y, worldZ(p.y)]);
  const B = T.meta.bases;
  // 紅方 exitCorridors 在鏡射時 top↔bot 反轉 ⇒ 藍[i] 配 紅[2−i]
  const pairs = useMemo(() => {
    const out = [];
    for (const key of ["apronPoly", "courtPoly", "keepPoly", "highlandPoly"]) {
      out.push({ blue: B.blue[key], red: B.red[key].map(mir) });
    }
    for (let i = 0; i < 3; i++) {
      out.push({ blue: B.blue.exitCorridors[i].poly, red: B.red.exitCorridors[2 - i].poly.map(mir) });
      out.push({ blue: B.blue.ramps[i].poly, red: B.red.ramps[2 - i].poly.map(mir) });
    }
    return out;
  }, [T]);

  //  G.14-fix：blueprint 點對照。藍方點 = blueprint 本尊；紅方點 = 紅方物件轉 180°。
  //  兩者重合 ⇒ 紅方確實是藍方 blueprint 長出來的；不重合就在畫面上標出誤差。
  const bp = useMemo(() => {
    const blue = [
      { id: "主堡", p: L.bases.blue, r: 4 },
      { id: "泉水", p: L.fountains.blue, r: 3 },
      ...T.nexusTurrets.filter((t) => t.side === "blue").map((t) => ({ id: `門牙${t.id.slice(-1)}`, p: t, r: 2.4 })),
      ...T.towers.filter((t) => t.side === "blue" && t.kind === "highground")
        .map((t) => ({ id: `高地${t.lane}`, p: t, r: 3.2 })),
      ...T.meta.bases.blue.gates.map((g, i) => ({ id: `出口${g.lane}`, p: g, r: 2.6 })),
    ];
    const redRaw = [
      { id: "主堡", p: L.bases.red },
      { id: "泉水", p: L.fountains.red },
      ...T.nexusTurrets.filter((t) => t.side === "red").map((t) => ({ id: `門牙${t.id.slice(-1)}`, p: t })),
      ...T.towers.filter((t) => t.side === "red" && t.kind === "highground")
        .map((t) => ({ id: `高地${MIRROR_LANE[t.lane]}`, p: t })),
      ...T.meta.bases.red.gates.map((g) => ({ id: `出口${MIRROR_LANE[g.lane]}`, p: g })),
    ];
    const pairs = blue.map((b) => {
      const r = redRaw.find((x) => x.id === b.id);
      const m = r ? mir(r.p) : null;
      return { ...b, mirrored: m, err: m ? Math.hypot(m.x - b.p.x, m.y - b.p.y) : Infinity };
    });
    return pairs;
  }, [L, T]);

  return (
    <group>
      {pairs.map((pr, i) => (
        <group key={"pp" + i}>
          <Line points={line(pr.blue, 9)} color="#37e0ff" lineWidth={1.6} transparent opacity={0.9} />
          <Line points={line(pr.red, 9.6)} color="#ff5ad6" lineWidth={1.6} dashed dashSize={3} gapSize={3} transparent opacity={0.9} />
        </group>
      ))}
      {bp.map((n) => (
        <Line key={"bpb" + n.id} points={ring(n.p.x, n.p.y, n.r, 11)} color="#37e0ff" lineWidth={2.4} />
      ))}
      {bp.filter((n) => n.mirrored).map((n) => (
        <Line key={"bpr" + n.id} points={ring(n.mirrored.x, n.mirrored.y, n.r * 1.25, 11.4)}
          color={n.err > 0.05 ? "#ff3b3b" : "#ff5ad6"} lineWidth={n.err > 0.05 ? 3 : 2} />
      ))}
      {/* 重合不了的 blueprint 點：畫面上直接標出誤差 */}
      {bp.filter((n) => n.err > 0.05).map((n) => (
        <Html key={"bpe" + n.id} position={toWorld(n.p.x, n.p.y, 18)} center distanceFactor={280}
          style={{ font: "700 12px ui-monospace,monospace", color: "#ff8a8a", background: "rgba(20,6,6,.85)",
            border: "1px solid #7a2a2a", borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap", pointerEvents: "none" }}>
          {n.id} 差 {n.err.toFixed(2)}
        </Html>
      ))}
      {/* 三路出口最窄處：綠＝達標、紅＝不足 */}
      {exits.map((e) => (
        <Line key={"ex" + e.id} points={ring(e.pinch.x, e.pinch.y, e.minClear, 12)}
          color={e.ok ? "#5fd08a" : "#e8664e"} lineWidth={2} />
      ))}
      {exits.map((e) => (
        <Html key={"exl" + e.id} position={toWorld(e.pinch.x, e.pinch.y, 14)} center distanceFactor={300}
          style={{ font: "700 11px ui-monospace,monospace", color: e.ok ? "#a9f0c6" : "#ffb0a0", textShadow: "0 1px 3px #000", pointerEvents: "none" }}>
          {e.width}
        </Html>
      ))}
    </group>
  );
}

/** 即時效能 HUD：每 ~0.5s 取 gl.info（draw calls / triangles / geometries / textures / programs）+ FPS。 */
function PerfSampler({ onSample }) {
  const { gl } = useThree();
  const last = useRef(performance.now()), frames = useRef(0), acc = useRef(0);
  useFrame(() => {
    frames.current++;
    const now = performance.now(); acc.current += now - last.current; last.current = now;
    if (acc.current >= 500) {
      const info = gl.info;
      onSample({
        fps: frames.current / (acc.current / 1000),
        frameMs: acc.current / frames.current,
        calls: info.render.calls, tris: info.render.triangles,
        geometries: info.memory.geometries, textures: info.memory.textures,
        programs: info.programs ? info.programs.length : 0,
      });
      frames.current = 0; acc.current = 0;
    }
  });
  return null;
}

export default function MobaMapPreview() {
  const controls = useRef(null);
  const L = useMemo(() => buildMobaLayout(), []);
  const T = useMemo(() => buildTerrainShapes(L), [L]);
  const PASS = useMemo(() => buildPassability(L, T), [L, T]);

  //  G.15-fix4：?shot=<id> 時，圖層與相機都由 URL 決定（固定視角截圖）
  const SHOT = useMemo(() => (SHOT_ID ? shotSpec(SHOT_ID, T) : null), [T]);
  const [show, setShow] = useState({
    lane: true, jungle: true, towers: true, pits: true, decor: true,
    bush: true, monsters: true, walls: true, base: true, baseFocus: null, ...MODE.clean,
    ...(SHOT ? SHOT.layers : {}),
  });
  const [mode, setMode] = useState("clean");
  const [camId, setCamId] = useState("full");
  const [presetId, setPresetId] = useState("desktop");
  const [passOn, setPassOn] = useState(false);
  const [passOpts, setPassOpts] = useState({ area: true, lines: true, pinch: true, hero: true, block: true, ents: true, nums: false });
  const [perf, setPerf] = useState(null);
  const [symOn, setSymOn] = useState(false);   // G.14：基地鏡射檢查疊層
  const preset = PRESET[presetId];

  // G.14：與 tools/check_moba_map.mjs 用同一份判準（mapBaseSymmetry.js），
  //  避免「驗證器綠、畫面歪」。三份報告：鏡射差異 / 主堡區層級 / 三路出口淨寬。
  const SYM = useMemo(() => buildBaseSymmetryReport(L, T), [L, T]);
  //  G.15：base blueprint 逐件對照（與 tools/check_moba_map.mjs 用同一份判準）
  const BPR = useMemo(() => buildBaseBlueprintReport(T), [T]);
  const HIER = useMemo(() => buildBaseHierarchyReport(L, T), [L, T]);
  const EXIT = useMemo(() => buildBaseExitReport(L, T, PASS.field), [L, T, PASS]);
  //  G.14-fix：blueprint 點對照（與畫面疊層用同一組點），供 HUD 列出數字。
  const BP = useMemo(() => {
    const m = (p) => ({ x: 220 - p.x, y: 220 - p.y });
    const e = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const rows = [
      { id: "主堡", err: e(L.bases.blue, m(L.bases.red)) },
      { id: "泉水", err: e(L.fountains.blue, m(L.fountains.red)) },
    ];
    T.nexusTurrets.filter((t) => t.side === "blue").forEach((t) => {
      const r = T.nexusTurrets.find((x) => x.side === "red" && x.id.slice(-1) === t.id.slice(-1));
      rows.push({ id: `門牙塔${t.id.slice(-1)}`, err: e(t, m(r)) });
    });
    T.towers.filter((t) => t.side === "blue" && t.kind === "highground").forEach((t) => {
      const r = T.towers.find((x) => x.side === "red" && x.kind === "highground" && x.lane === MIRROR_LANE[t.lane]);
      rows.push({ id: `高地塔 ${t.lane}`, err: e(t, m(r)) });
    });
    T.meta.bases.blue.gates.forEach((g, i) => {
      const r = T.meta.bases.red.gates.find((x) => x.lane === MIRROR_LANE[g.lane]);
      rows.push({ id: `出口 ${g.lane}`, err: e(g, m(r)) });
    });
    return { rows, max: Math.max(...rows.map((r) => r.err)) };
  }, [L, T]);

  const toggle = (k) => setShow((s) => ({ ...s, [k]: !s[k] }));
  const applyMode = (id) => { setMode(id); setShow((s) => ({ ...s, ...MODE[id] })); };
  const togglePass = (k) => setPassOpts((o) => ({ ...o, [k]: !o[k] }));

  // G.8/G.9「只看…」聚焦模式：一鍵隔離單一內容層，方便逐項目視。
  const [focus, setFocus] = useState(null);
  const A = { lane: false, jungle: false, towers: false, pits: false, bush: false, monsters: false, decor: false, walls: false, base: false, baseFocus: null };
  const FOCUS = {
    all: { label: "全部", show: { lane: true, jungle: true, towers: true, pits: true, bush: true, monsters: true, decor: true, walls: true, base: true, baseFocus: null }, pass: false },
    monsters: { label: "只看野怪", show: { ...A, pits: true, monsters: true }, pass: false },
    routes: { label: "只看可走路線", show: { ...A, lane: true, jungle: true, walls: true }, pass: true, opts: { area: true, lines: true, pinch: false, hero: false, block: true, ents: true, nums: false } },
    walls: { label: "只看牆體", show: { ...A, jungle: true, pits: true, walls: true }, pass: false },
    bush: { label: "只看草叢", show: { ...A, bush: true }, pass: false },
    towers: { label: "只看塔", show: { ...A, towers: true }, pass: false },
    base: { label: "只看基地", show: { ...A, base: true }, pass: false },
    terrain: { label: "只看地表", show: { ...A, lane: true, jungle: true, base: true }, pass: false },
    collision: { label: "只看碰撞/最窄", show: { ...A, lane: true, jungle: true, walls: true }, pass: true, opts: { area: true, lines: false, pinch: true, hero: true, block: true, ents: false, nums: false } },
    //  G.14：基地 + 城牆 + 塔一起看，疊上鏡射比對線；其它內容關掉才看得清楚。
    mirror: { label: "基地鏡射檢查", show: { ...A, base: true, walls: true, towers: true }, pass: false, sym: true },
    //  G.14-fix：四個基地聚焦模式。baseFocus 會把裝飾件（路斑 / 地表斑 / 岩影）
    //  一併關掉，畫面上只剩「結構件」，不會再被裝飾件干擾目視判斷。
    basestruct: { label: "只看基地結構", show: { ...A, base: true, walls: true, towers: true, baseFocus: "struct" }, pass: false, sym: true },
    basewall: { label: "只看基地牆體", show: { ...A, base: true, walls: true, baseFocus: "wall" }, pass: false, sym: true },
    basetower: { label: "只看基地塔", show: { ...A, base: true, towers: true, baseFocus: "tower" }, pass: false, sym: true },
    baseexit: { label: "只看基地出口", show: { ...A, base: true, towers: true, baseFocus: "exit" }, pass: false, sym: true },
    //  G.15 blueprint 檢視：只看藍方 blueprint / 只看紅方鏡射結果 / 兩者 overlay。
    //  overlay 會把紅方繞地圖中心轉 180° 疊回藍方身上（染成洋紅）⇒ 不重合的地方
    //  在畫面上就是一層洋紅殘影，不必看數字也知道差在哪。
    bpblue: { label: "只看藍方 blueprint", show: { ...A, base: true, walls: true, towers: true, baseFocus: "bp_blue" }, pass: false, sym: false },
    bpred: { label: "只看紅方鏡射", show: { ...A, base: true, walls: true, towers: true, baseFocus: "bp_red" }, pass: false, sym: false },
    bpoverlay: { label: "藍紅 overlay", show: { ...A, base: true, walls: true, towers: true, baseFocus: "bp_overlay" }, pass: false, sym: false, bp: true },
  };
  const applyFocus = (id) => {
    setFocus(id);
    setShow((s) => ({ ...s, ...FOCUS[id].show }));
    setPassOn(FOCUS[id].pass);
    setSymOn(!!FOCUS[id].sym);
    if (FOCUS[id].opts) setPassOpts((o) => ({ ...o, ...FOCUS[id].opts }));
    //  G.15：進 blueprint 檢視時自動切到藍方視角（overlay 是疊在藍方基地上的）
    if (String(FOCUS[id].show.baseFocus ?? "").startsWith("bp_")) applyCam("blue");
  };

  const applyCam = (id) => {
    setCamId(id);
    const c = controls.current; if (!c) return;
    const { pos, tgt } = CAM[id];
    c.object.position.set(pos[0], pos[1], pos[2]);
    c.object.near = 1; c.object.far = 4000; c.object.updateProjectionMatrix();
    c.target.set(tgt[0], tgt[1], tgt[2]); c.update();
  };
  useEffect(() => {
    if (SHOT) return undefined;                       // 截圖模式的相機由 ShotCamera 固定
    const id = setTimeout(() => applyCam("full"), 60);
    return () => clearTimeout(id);
  }, [SHOT]);

  const CamBtn = ({ id, label }) => (
    <button style={{ ...BTN, outline: camId === id ? "2px solid #33c0d9" : "none" }} onClick={() => applyCam(id)}>{label}</button>
  );
  const LayerBtn = ({ k, label }) => (
    <button style={{ ...BTN, outline: show[k] ? "2px solid #f29e38" : "none" }} onClick={() => toggle(k)}>{label}</button>
  );
  const ModeBtn = ({ id, label }) => (
    <button style={{ ...BTN, outline: mode === id ? "2px solid #7ee081" : "none" }} onClick={() => applyMode(id)}>{label}</button>
  );
  const PresetBtn = ({ id }) => (
    <button style={{ ...BTN, outline: presetId === id ? "2px solid #b98cff" : "none" }} onClick={() => setPresetId(id)}>{PRESET[id].label}</button>
  );
  const PassBtn = ({ k, label }) => (
    <button style={{ ...BTN, outline: passOpts[k] ? "2px solid #5fd08a" : "none" }} onClick={() => togglePass(k)}>{label}</button>
  );
  const FocusBtn = ({ id }) => (
    <button style={{ ...BTN, outline: focus === id ? "2px solid #33c0d9" : "none" }} onClick={() => applyFocus(id)}>{FOCUS[id].label}</button>
  );

  // 可走性統計
  const passStat = useMemo(() => {
    const bad = PASS.routes.filter((r) => !r.meetsSpec);
    const narrowest = Math.min(...PASS.routes.map((r) => r.narrowest));
    return { total: PASS.routes.length, bad: bad.length, narrowest };
  }, [PASS]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0b0f14" }}>
      <Canvas key={presetId} dpr={preset.dpr} gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 430, 118], fov: 48, near: 1, far: 4000 }}
        onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.1; }}>
        <color attach="background" args={[0x0e141c]} />
        <hemisphereLight args={[0xb6cbe2, 0x33391f, 0.85]} />
        <ambientLight intensity={0.22} color={0xfff1dd} />
        <directionalLight position={[-180, 330, 220]} intensity={2.3} color={0xfff0cc} />
        <directionalLight position={[210, 180, -160]} intensity={0.55} color={0x9fc4e8} />
        <MobaMapBlockout show={show} ring={preset.ring} castTowerShadow={preset.shadow} />
        {passOn && passOpts.area && <WalkableOverlay field={PASS.field} />}
        {passOn && !SHOT && <PassabilityOverlay L={L} T={T} PASS={PASS} opts={passOpts} />}
        {symOn && !SHOT && <BaseMirrorOverlay L={L} T={T} exits={EXIT.exits} />}
        <PerfSampler onSample={setPerf} />
        {SHOT
          ? <ShotCamera spec={SHOT} id={SHOT_ID} />
          : <OrbitControls ref={controls} makeDefault maxPolarAngle={Math.PI * 0.49} />}
      </Canvas>

      {SHOT ? null : <>
      {/* 效能 HUD（右上） */}
      <div style={{ position: "fixed", right: 8, top: 8, zIndex: 60, minWidth: 210,
        font: "12px ui-monospace,monospace", color: "#e7edf5", lineHeight: 1.55,
        background: "rgba(10,14,20,.86)", border: "1px solid #2a3542", borderRadius: 8, padding: "8px 10px" }}>
        <div style={{ fontWeight: 700, marginBottom: 3 }}>效能統計（{preset.label}）</div>
        {perf ? (
          <>
            <div>FPS：<b style={{ color: perf.fps >= 55 ? "#7ee081" : perf.fps >= 30 ? "#ffd86b" : "#ff6b6b" }}>{perf.fps.toFixed(0)}</b>　幀時間 {perf.frameMs.toFixed(1)}ms</div>
            <div>Draw calls：<b style={{ color: perf.calls <= 120 ? "#7ee081" : "#ffd86b" }}>{perf.calls}</b>　三角面 {(perf.tris / 1000).toFixed(1)}k</div>
            <div>Geometry：{perf.geometries}　Texture：{perf.textures}</div>
            <div>Program(材質)：<b style={{ color: perf.programs <= 20 ? "#7ee081" : "#ffd86b" }}>{perf.programs}</b></div>
          </>
        ) : <div>取樣中…</div>}
        <div style={{ marginTop: 5, paddingTop: 5, borderTop: "1px solid #2a3542" }}>
          可走性：{passStat.bad === 0
            ? <b style={{ color: "#7ee081" }}>{passStat.total} 條全達標</b>
            : <b style={{ color: "#ff6b6b" }}>{passStat.bad}/{passStat.total} 未達標</b>}
          <div>最窄淨寬 {passStat.narrowest.toFixed(2)}（英雄直徑 2.4）</div>
        </div>
      </div>

      {/* G.14 基地鏡射檢查結果（右側，效能 HUD 下方） */}
      {symOn && (
        <div style={{ position: "fixed", right: 8, top: 152, zIndex: 60, width: 306, maxHeight: "62vh", overflowY: "auto",
          font: "11px ui-monospace,monospace", color: "#e7edf5", lineHeight: 1.55,
          background: "rgba(10,14,20,.9)", border: "1px solid #2a3542", borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            基地鏡射檢查　{SYM.ok
              ? <span style={{ color: "#7ee081" }}>✅ 藍紅完全對稱</span>
              : <span style={{ color: "#ff6b6b" }}>❌ 有不對稱項</span>}
          </div>
          <div style={{ color: "#9fb3c8", marginBottom: 4 }}>
            <span style={{ color: "#37e0ff" }}>■ 青實線</span>＝藍方結構｜
            <span style={{ color: "#ff5ad6" }}>■ 洋紅虛線</span>＝紅方結構轉 180° 疊上來（重合＝對稱）
            <div>青圓＝藍方 blueprint 點｜洋紅圓＝紅方點轉 180°；超過 0.05 會轉紅並在畫面上標出誤差</div>
            <div>畫面逐像素比對請跑：node tools/preview_base_symmetry.mjs</div>
          </div>
          {SYM.checks.map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
              <span style={{ color: c.ok ? "#a9f0c6" : "#ff9b8a" }}>{c.ok ? "✅" : "❌"} {c.label}</span>
              <span style={{ color: "#9fb3c8", whiteSpace: "nowrap" }}>{Number.isFinite(c.err) ? c.err : "—"}</span>
            </div>
          ))}
          <div style={{ marginTop: 6, paddingTop: 5, borderTop: "1px solid #2a3542", fontWeight: 700 }}>
            blueprint 點對照（紅方轉 180° 後與藍方的距離）
          </div>
          {BP.rows.map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
              <span style={{ color: r.err <= 0.05 ? "#a9f0c6" : "#ff9b8a" }}>{r.err <= 0.05 ? "✅" : "❌"} {r.id}</span>
              <span style={{ color: "#9fb3c8" }}>{r.err.toFixed(3)}</span>
            </div>
          ))}
          <div style={{ marginTop: 6, paddingTop: 5, borderTop: "1px solid #2a3542", fontWeight: 700 }}>
            主堡區層級（距主堡，兩方相同）
          </div>
          {HIER.sides.blue.rows.map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
              <span>{r.label}</span>
              <span style={{ color: "#9fb3c8", whiteSpace: "nowrap" }}>{r.value.toFixed(1)}　{r.note}</span>
            </div>
          ))}
          {HIER.sides.blue.checks.filter((c) => !c.ok).map((c) => (
            <div key={c.id} style={{ color: "#ff9b8a" }}>❌ {c.label}</div>
          ))}
          <div style={{ marginTop: 6, paddingTop: 5, borderTop: "1px solid #2a3542", fontWeight: 700 }}>
            三路出口實測可走淨寬（下限 {EXIT_MIN_WIDTH}）
          </div>
          {EXIT.exits.map((e) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
              <span style={{ color: e.ok ? "#a9f0c6" : "#ff9b8a" }}>{e.ok ? "✅" : "❌"} {e.id}</span>
              <span style={{ color: "#9fb3c8" }}>淨寬 {e.width}</span>
            </div>
          ))}
          <div style={{ marginTop: 3, color: "#9fb3c8" }}>
            ※ 沿「主堡→城門→高地塔」中心線實測，非繞路連通性。英雄直徑 4.8。
          </div>
        </div>
      )}

      {/* G.15 base blueprint 檢視結果（右側） */}
      {String(show.baseFocus ?? "").startsWith("bp_") && (
        <div style={{ position: "fixed", right: 8, top: 152, zIndex: 60, width: 320, maxHeight: "70vh", overflowY: "auto",
          font: "11px ui-monospace,monospace", color: "#e7edf5", lineHeight: 1.55,
          background: "rgba(10,14,20,.9)", border: "1px solid #2a3542", borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            base blueprint（G.15）　{BPR.ok
              ? <span style={{ color: "#7ee081" }}>✅ 紅方 100% 由藍方鏡射</span>
              : <span style={{ color: "#ff6b6b" }}>❌ 有不符項</span>}
          </div>
          <div style={{ color: "#9fb3c8", marginBottom: 5 }}>
            藍紅各 {BPR.count} 件結構件，每件都有 stable id。
            {show.baseFocus === "bp_overlay" && (
              <div><span style={{ color: "#ff6ad0" }}>■ 洋紅</span>＝紅方繞地圖中心轉 180° 疊上來；
                完全被藍方蓋住＝兩邊一模一樣，看得到洋紅殘影＝該處不對稱。</div>
            )}
            {show.baseFocus === "bp_blue" && <div>目前只畫藍方 blueprint 本尊。</div>}
            {show.baseFocus === "bp_red" && <div>目前只畫紅方（＝藍方 blueprint 的鏡射輸出）。</div>}
          </div>
          {BPR.rows.map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
              <span style={{ color: r.ok ? "#a9f0c6" : "#ff9b8a" }}>{r.ok ? "✅" : "❌"} {r.label}</span>
              <span style={{ color: "#9fb3c8", whiteSpace: "nowrap" }}>{r.detail}</span>
            </div>
          ))}
          <div style={{ marginTop: 6, paddingTop: 5, borderTop: "1px solid #2a3542", fontWeight: 700 }}>
            出口可走淨寬（沿出口通道中心線實測，下限 {EXIT_MIN_WIDTH}）
          </div>
          {EXIT.exits.map((e) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
              <span>{e.side} {e.lane}</span>
              <span style={{ color: e.ok ? "#7ee081" : "#ff6b6b" }}>{e.width}</span>
            </div>
          ))}
          <div style={{ marginTop: 3, color: "#9fb3c8" }}>
            ※ G.15-fix4：三個城門是**等角**配置（模組首尾相接），門的方位與「主堡→高地塔」
            直線有數度差，通道走「主堡 → 內庭轉折點 → 城門 → 高地塔」的折線，淨寬沿這條折線量。
            基地的每一段牆都出自同一份出口模組：沒有後翼牆、沒有另一圈三路共用的內牆。
          </div>
        </div>
      )}

      {/* 可走性圖例（左上）：說明綠地毯 vs 測試路線 vs 純視覺，避免誤讀 */}
      {passOn && (
        <div style={{ position: "fixed", left: 8, top: 8, zIndex: 60, maxWidth: 300,
          font: "11px ui-monospace,monospace", color: "#e7edf5", lineHeight: 1.6,
          background: "rgba(10,14,20,.88)", border: "1px solid #2a3542", borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontWeight: 700, marginBottom: 3 }}>可走性圖例</div>
          <div><span style={{ color: "#3ad17a" }}>■ 綠地毯</span>＝英雄實際可走區域（碰撞半徑 2.4）</div>
          <div><span style={{ color: "#5fd08a" }}>— 綠線</span>＝verifier <b>測試路線</b>（找得到 path 的證明線，<b>非</b>正式英雄移動軌跡）</div>
          <div><span style={{ color: "#8fd0ff" }}>○ 藍環</span>＝該路線最窄處淨寬｜<span style={{ color: "#ffe08a" }}>○ 黃環</span>＝英雄碰撞圓</div>
          <div>深色岩壁＝blocking（擋路）｜草叢/樹/裝飾石＝<b>純視覺</b>，不參與碰撞</div>
          <div style={{ marginTop: 3, color: "#9fb3c8" }}>※ 綠地毯以外＝走不過去；關掉圖層時看綠地毯的連續性即可判斷野區好不好穿梭。</div>
        </div>
      )}

      {/* 控制面板（左下） */}
      <div style={{ position: "fixed", left: 8, bottom: 8, zIndex: 60, display: "flex", flexWrap: "wrap",
        gap: 6, alignItems: "center", maxWidth: "96vw",
        font: "12px ui-monospace,monospace", color: "#e7edf5",
        background: "rgba(10,14,20,.82)", border: "1px solid #2a3542", borderRadius: 8, padding: "6px 8px" }}>
        <span style={{ fontWeight: 700 }}>MOBA 地圖原型（G.15 Base Blueprint Reset）</span>
        <span>｜模式</span>
        <ModeBtn id="clean" label="純地圖" /><ModeBtn id="debug" label="Debug 標記" />
        <span style={{ width: "100%" }} />
        <span>｜只看</span>
        <FocusBtn id="all" /><FocusBtn id="routes" /><FocusBtn id="walls" /><FocusBtn id="bush" />
        <FocusBtn id="monsters" /><FocusBtn id="towers" /><FocusBtn id="base" /><FocusBtn id="terrain" /><FocusBtn id="collision" />
        <FocusBtn id="mirror" />
        <span style={{ width: "100%" }} />
        <span>｜基地</span>
        <FocusBtn id="basestruct" /><FocusBtn id="basewall" /><FocusBtn id="basetower" /><FocusBtn id="baseexit" />
        <span style={{ width: "100%" }} />
        <span>｜blueprint</span>
        <FocusBtn id="bpblue" /><FocusBtn id="bpred" /><FocusBtn id="bpoverlay" />
        <span>｜Preset</span>
        <PresetBtn id="desktop" /><PresetBtn id="mobile" /><PresetBtn id="low" />
        <span>｜視角</span>
        <CamBtn id="full" label="完整" /><CamBtn id="blue" label="藍方" /><CamBtn id="red" label="紅方" />
        <span>｜圖層</span>
        <LayerBtn k="lane" label="三路" /><LayerBtn k="jungle" label="野區" />
        <LayerBtn k="towers" label="塔" /><LayerBtn k="pits" label="龍/巴龍" />
        <LayerBtn k="bush" label="草叢" /><LayerBtn k="monsters" label="野怪" />
        <LayerBtn k="labels" label="標籤" /><LayerBtn k="decor" label="裝飾岩" />
        <LayerBtn k="coords" label="座標" />
        <span style={{ width: "100%" }} />
        <button style={{ ...BTN, outline: passOn ? "2px solid #5fd08a" : "none", fontWeight: 700 }}
          onClick={() => setPassOn((v) => !v)}>可走性圖層 {passOn ? "開" : "關"}</button>
        <button style={{ ...BTN, outline: symOn ? "2px solid #ff5ad6" : "none", fontWeight: 700 }}
          onClick={() => setSymOn((v) => !v)}>基地鏡射檢查 {symOn ? "開" : "關"}</button>
        {passOn && <>
          <PassBtn k="area" label="可走區域(綠)" />
          <PassBtn k="lines" label="測試路線" />
          <PassBtn k="pinch" label="最窄通道" />
          <PassBtn k="hero" label="英雄碰撞圓" />
          <PassBtn k="block" label="阻擋區" />
          <PassBtn k="ents" label="營地入口" />
          <PassBtn k="nums" label="牆鏈編號" />
        </>}
      </div>
      </>}
    </div>
  );
}
