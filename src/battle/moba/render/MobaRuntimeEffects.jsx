// ============================================================================
//  MobaRuntimeEffects.jsx — Milestone B-fix 戰鬥可讀性 renderer
//
//  只讀 adapter.effects；live / Replay 共用同一份事件與衍生呈現。
//  所有 geometry / material / instance pool 固定建立，不在 useFrame 配置資源。
// ============================================================================
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WORLD_SCALE } from "../map/coordinateMapping.js";
import { LAYER_Y } from "../map/mapVisualStyle.js";
import { countMount, countUnmount } from "./runtimeDiagnostics.js";

const S = WORLD_SCALE;
const LINE_CAP = 64;
const BURST_CAP = 72;
const PROJECTILE_CAP = 96;
const CORE_CAP = 72;
const TOWER_SHELL_CAP = 32;
const CLASS_PROJECTILE_CAP = 32;
const SLASH_CAP = 72;
const LOCK_CAP = 48;
const GROUND_Y = Number.isFinite(LAYER_Y.lane_surface) ? LAYER_Y.lane_surface : 0;
const CLASS_FX_COLOR = Object.freeze({
  tank: 0xffb347,
  fighter: 0xff5f52,
  assassin: 0xd778ff,
  mage: 0x45ddff,
  marksman: 0xffdf55,
  support: 0x69ffd0,
});
const TOWER_FX_COLOR = Object.freeze({
  blue: 0x35cfff,
  red: 0xff6647,
});

export default function MobaRuntimeEffects({ frameRef }) {
  const refs = useRef({});
  const geo = useMemo(() => ({
    line: new THREE.CylinderGeometry(1, 1, 1, 8, 1, true),
    ring: new THREE.RingGeometry(0.8, 1, 28),
    orb: new THREE.OctahedronGeometry(1, 1),
    // D-fix3 visual closeout：additive 光球在遠景／Bloom 下只剩沒有方向的白點。
    // 低面數長菱形提供「正在從 A 飛向 B」的實心輪廓，所有 tower/hero travel 共用。
    projectile: new THREE.OctahedronGeometry(1, 0),
    core: new THREE.IcosahedronGeometry(1, 0),
    // 塔彈使用有底、有彈頭方向的獨立炮彈輪廓，不再和英雄法球共用黑色小點。
    towerShell: new THREE.CylinderGeometry(0.52, 0.82, 2, 10, 1, false),
    slash: new THREE.TorusGeometry(1, 0.16, 4, 18, Math.PI * 1.32),
    lock: new THREE.RingGeometry(0.62, 1, 4),
  }), []);
  const readable = {
    color: 0xffffff, vertexColors: true, transparent: true, depthTest: false,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  };
  const mats = useMemo(() => ({
    line: new THREE.MeshBasicMaterial({ ...readable, opacity: 0.9 }),
    ring: new THREE.MeshBasicMaterial({
      // D-fix3：地環只是低對比的短暫提示，核心資訊由實心 cast/travel/impact 呈現。
      ...readable, opacity: 0.14, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
    }),
    orb: new THREE.MeshBasicMaterial({ ...readable, opacity: 1 }),
    projectile: new THREE.MeshBasicMaterial({
      color: 0xffffff, vertexColors: true, transparent: true, opacity: 1,
      depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }),
    // 核心固定白熱色，不乘 instanceColor；避免正式 WebGL 下低亮度 instance tint 變黑點。
    core: new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.88,
      depthTest: false, depthWrite: false, blending: THREE.NormalBlending, toneMapped: false,
    }),
    towerBlue: new THREE.MeshBasicMaterial({
      color: TOWER_FX_COLOR.blue, transparent: true, opacity: 1,
      depthTest: false, depthWrite: false, blending: THREE.NormalBlending, toneMapped: false,
    }),
    towerRed: new THREE.MeshBasicMaterial({
      color: TOWER_FX_COLOR.red, transparent: true, opacity: 1,
      depthTest: false, depthWrite: false, blending: THREE.NormalBlending, toneMapped: false,
    }),
    classTank: new THREE.MeshBasicMaterial({
      color: CLASS_FX_COLOR.tank, transparent: true, opacity: 1,
      depthTest: false, depthWrite: false, blending: THREE.NormalBlending, toneMapped: false,
    }),
    classFighter: new THREE.MeshBasicMaterial({
      color: CLASS_FX_COLOR.fighter, transparent: true, opacity: 1,
      depthTest: false, depthWrite: false, blending: THREE.NormalBlending, toneMapped: false,
    }),
    classAssassin: new THREE.MeshBasicMaterial({
      color: CLASS_FX_COLOR.assassin, transparent: true, opacity: 1,
      depthTest: false, depthWrite: false, blending: THREE.NormalBlending, toneMapped: false,
    }),
    classMage: new THREE.MeshBasicMaterial({
      color: CLASS_FX_COLOR.mage, transparent: true, opacity: 1,
      depthTest: false, depthWrite: false, blending: THREE.NormalBlending, toneMapped: false,
    }),
    classMarksman: new THREE.MeshBasicMaterial({
      color: CLASS_FX_COLOR.marksman, transparent: true, opacity: 1,
      depthTest: false, depthWrite: false, blending: THREE.NormalBlending, toneMapped: false,
    }),
    classSupport: new THREE.MeshBasicMaterial({
      color: CLASS_FX_COLOR.support, transparent: true, opacity: 1,
      depthTest: false, depthWrite: false, blending: THREE.NormalBlending, toneMapped: false,
    }),
    slash: new THREE.MeshBasicMaterial({ ...readable, opacity: 0.96, side: THREE.DoubleSide }),
    lock: new THREE.MeshBasicMaterial({
      ...readable, opacity: 0.22, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
    }),
  // `readable` 是建立期常數；material 只建立一次。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);
  const q = useMemo(() => ({
    matrix: new THREE.Matrix4(),
    pos: new THREE.Vector3(),
    scale: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    dir: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    flat: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
    lockQuat: new THREE.Quaternion(),
    slashQuat: new THREE.Quaternion(),
    euler: new THREE.Euler(),
    color: new THREE.Color(),
    coreColor: new THREE.Color(0xffffff),
    white: new THREE.Color(0xffffff),
  }), []);

  useLayoutEffect(() => {
    countMount("effects");
    return () => {
      countUnmount("effects");
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [geo, mats]);

  useFrame(({ camera, clock }) => {
    const frame = frameRef?.current ?? {};
    const effects = frame.effects ?? [];
    // 單體追蹤：事件保存 sourceId / targetId，render frame 每幀解析目前座標。
    // 彈體因此會跟著移動中的英雄／小兵／野怪個體，而不是飛向發射瞬間的舊位置。
    const currentWorld = new Map();
    for (const item of [
      ...(frame.heroes ?? []), ...(frame.minions ?? []), ...(frame.structures ?? []),
    ]) {
      if (item?.id && item.world) currentWorld.set(String(item.id), item.world);
    }
    for (const objective of frame.objectives ?? []) {
      if (objective?.id && objective.world) currentWorld.set(String(objective.id), objective.world);
      for (const member of objective?.members ?? []) {
        if (member?.id && member.world) currentWorld.set(String(member.id), member.world);
      }
    }
    const lineMesh = refs.current.line;
    const ringMesh = refs.current.ring;
    const orbMesh = refs.current.orb;
    const projectileMesh = refs.current.projectile;
    const coreMesh = refs.current.core;
    const towerBlueMesh = refs.current.towerBlue;
    const towerRedMesh = refs.current.towerRed;
    const classMeshes = {
      tank: refs.current.classTank,
      fighter: refs.current.classFighter,
      assassin: refs.current.classAssassin,
      mage: refs.current.classMage,
      marksman: refs.current.classMarksman,
      support: refs.current.classSupport,
    };
    const slashMesh = refs.current.slash;
    const lockMesh = refs.current.lock;
    if (!lineMesh || !ringMesh || !orbMesh || !projectileMesh || !coreMesh
      || !towerBlueMesh || !towerRedMesh || Object.values(classMeshes).some((mesh) => !mesh)
      || !slashMesh || !lockMesh) return;
    let lines = 0, rings = 0, orbs = 0, projectiles = 0, cores = 0;
    let towerBlue = 0, towerRed = 0, slashes = 0, locks = 0;
    const classCounts = {
      tank: 0, fighter: 0, assassin: 0, mage: 0, marksman: 0, support: 0,
    };
    const {
      matrix, pos, scale, quat, dir, up, flat, lockQuat, slashQuat, euler,
      color, coreColor, white,
    } = q;
    const elapsed = clock.getElapsedTime();

    const addRing = (world, radius, tint, y = GROUND_Y + 0.15) => {
      if (rings >= BURST_CAP) return;
      pos.set(world.x, y, world.z);
      scale.set(radius, radius, 1);
      matrix.compose(pos, flat, scale);
      ringMesh.setMatrixAt(rings, matrix);
      ringMesh.setColorAt(rings, tint);
      rings++;
    };
    const addOrb = (world, radius, tint, y = GROUND_Y + 1.45 * S, stretch = 1) => {
      if (orbs >= BURST_CAP) return;
      pos.set(world.x, y, world.z);
      quat.identity();
      scale.set(radius, radius * stretch, radius);
      matrix.compose(pos, quat, scale);
      orbMesh.setMatrixAt(orbs, matrix);
      orbMesh.setColorAt(orbs, tint);
      orbs++;
    };
    const addProjectile = (
      world,
      toward,
      width,
      length,
      tint,
      y = GROUND_Y + 1.55 * S,
    ) => {
      if (projectiles >= PROJECTILE_CAP) return;
      dir.set(toward.x - world.x, (toward.y ?? y) - y, toward.z - world.z);
      if (dir.lengthSq() <= 0.0001) dir.set(0, 0, 1);
      dir.normalize();
      quat.setFromUnitVectors(up, dir);
      pos.set(world.x, y, world.z);
      scale.set(width, length, width);
      matrix.compose(pos, quat, scale);
      projectileMesh.setMatrixAt(projectiles, matrix);
      projectileMesh.setColorAt(projectiles, tint);
      projectiles++;
    };
    const addCore = (world, radius, tint, y = GROUND_Y + 1.45 * S, stretch = 1) => {
      if (cores >= CORE_CAP) return;
      pos.set(world.x, y, world.z);
      quat.identity();
      // 白熱核心只佔彩色外殼約一半，避免遠景變成遮蔽模型的大白塊。
      const compact = radius * 0.56;
      scale.set(compact, compact * stretch, compact);
      matrix.compose(pos, quat, scale);
      coreMesh.setMatrixAt(cores, matrix);
      cores++;
    };
    const addTowerShell = (
      world,
      toward,
      width,
      length,
      team,
      y = GROUND_Y + 1.55 * S,
    ) => {
      const mesh = team === "red" ? towerRedMesh : towerBlueMesh;
      const count = team === "red" ? towerRed : towerBlue;
      if (count >= TOWER_SHELL_CAP) return;
      dir.set(toward.x - world.x, (toward.y ?? y) - y, toward.z - world.z);
      if (dir.lengthSq() <= 0.0001) dir.set(0, 0, 1);
      dir.normalize();
      quat.setFromUnitVectors(up, dir);
      pos.set(world.x, y, world.z);
      scale.set(width, length, width);
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(count, matrix);
      if (team === "red") towerRed++;
      else towerBlue++;
    };
    const addClassProjectile = (
      world,
      toward,
      width,
      length,
      cls,
      y = GROUND_Y + 1.55 * S,
    ) => {
      const mesh = classMeshes[cls];
      const count = classCounts[cls] ?? CLASS_PROJECTILE_CAP;
      if (!mesh || count >= CLASS_PROJECTILE_CAP) return;
      dir.set(toward.x - world.x, (toward.y ?? y) - y, toward.z - world.z);
      if (dir.lengthSq() <= 0.0001) dir.set(0, 0, 1);
      dir.normalize();
      quat.setFromUnitVectors(up, dir);
      pos.set(world.x, y, world.z);
      scale.set(width, length, width);
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(count, matrix);
      classCounts[cls] = count + 1;
    };
    const addSlash = (world, radius, tint, rotation = 0) => {
      if (slashes >= SLASH_CAP) return;
      pos.set(world.x, GROUND_Y + 1.35 * S, world.z);
      slashQuat.copy(camera.quaternion);
      euler.set(0, 0, rotation);
      quat.setFromEuler(euler);
      slashQuat.multiply(quat);
      scale.setScalar(radius);
      matrix.compose(pos, slashQuat, scale);
      slashMesh.setMatrixAt(slashes, matrix);
      slashMesh.setColorAt(slashes, tint);
      slashes++;
    };
    const addLock = (world, radius, tint, spin = 0) => {
      if (locks >= LOCK_CAP) return;
      pos.set(world.x, GROUND_Y + 0.18, world.z);
      euler.set(-Math.PI / 2, 0, spin);
      lockQuat.setFromEuler(euler);
      scale.set(radius, radius, 1);
      matrix.compose(pos, lockQuat, scale);
      lockMesh.setMatrixAt(locks, matrix);
      lockMesh.setColorAt(locks, tint);
      locks++;
    };
    const addLine = (a, b, width, tint, y = GROUND_Y + 1.25 * S) => {
      if (lines >= LINE_CAP) return;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len <= 0.01) return;
      dir.set(b.x - a.x, 0, b.z - a.z).normalize();
      quat.setFromUnitVectors(up, dir);
      pos.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
      scale.set(width, len, width);
      matrix.compose(pos, quat, scale);
      lineMesh.setMatrixAt(lines, matrix);
      lineMesh.setColorAt(lines, tint);
      lines++;
    };

    // D-fix2 root cause：
    // 長生命期讓一個團戰同時保留很多事件，而每個事件會吃 2–4 個 instance。
    // 舊碼按最舊→最新填固定 pool，容量滿時最新的塔彈／技能 travel 反而被丟掉。
    // 排序只改繪製優先級，不改事件、傷害或 Replay：塔 > 技能 > 普攻，
    // travel > impact > cast，同級先畫較新的事件。
    const phaseRank = { travel: 3, impact: 2, cast: 1 };
    const drawPriority = (fx) => {
      const fxStyle = fx.style ?? fx.skillVisual?.style ?? "bolt";
      const tower = fxStyle === "tower" ? 100 : 0;
      const skill = fx.feedback === "skill" || fx.variant === "power" || fx.type === "ult"
        ? 40 : 0;
      return tower + skill + (phaseRank[fx.phase] ?? 0) * 5 - (fx.progress ?? 0);
    };
    const orderedEffects = effects.slice().sort((a, b) => drawPriority(b) - drawPriority(a));

    for (const fx of orderedEffects) {
      const life = Math.max(0.02, fx.lifeRatio ?? 0);
      const phase = fx.phase ?? (life > 0.72 ? "cast" : (life > 0.22 ? "travel" : "impact"));
      const phaseProgress = Math.max(0, Math.min(1, fx.phaseProgress ?? 0));
      const origin = currentWorld.get(String(fx.sourceId ?? "")) ?? fx.world;
      const trackedTarget = currentWorld.get(String(fx.targetId ?? ""));
      const impact = trackedTarget ?? fx.targetWorld ?? fx.world;
      const hasTarget = !!(trackedTarget || fx.targetWorld);
      const style = fx.style ?? fx.skillVisual?.style ?? "bolt";
      const isTower = style === "tower";
      const isMinion = style === "minionBolt" || style === "minionSlash";
      const isSkill = fx.feedback === "skill" || fx.variant === "power" || fx.type === "ult";
      const combatClass = fx.combatClass ?? null;
      const towerTeam = String(fx.sourceId ?? "").startsWith("red_") ? "red" : "blue";
      // 技能用職業色建立穩定語彙；普攻仍保留隊色／英雄資產色。塔固定使用高亮隊色，
      // 避免深色 accent 經正式色彩空間轉換後只剩黑點。
      const paletteColor = isTower
        ? TOWER_FX_COLOR[towerTeam]
        : (isSkill && CLASS_FX_COLOR[combatClass]
          ? CLASS_FX_COLOR[combatClass]
          : (fx.color ?? 0xffffff));
      color.setHex(paletteColor);
      coreColor.copy(color).lerp(white, 0.78);
      const visualWidth = (fx.width ?? 1) * (isSkill ? 1.5 : 1.08);

      // cast：清楚前搖。技能雙圈、近戰弧、塔鎖定菱形各自有不同語彙。
      if (phase === "cast") {
        if (isTower && hasTarget) {
          // 塔攻擊不是範圍技：塔冠先亮、目標腳下只有小型鎖定菱形，不畫音波地環。
          addCore(origin, (0.62 + phaseProgress * 0.24) * S, coreColor,
            GROUND_Y + 4.7 * S, 1.28);
          addOrb(origin, (0.78 + phaseProgress * 0.2) * S, color,
            GROUND_Y + 4.7 * S, 1.25);
          addLock(impact, (0.42 + phaseProgress * 0.06) * S, color, elapsed * 2.6);
        } else {
          const spread = (0.72 + phaseProgress * (isSkill ? 0.88 : 0.46)) * S * visualWidth;
          addRing(origin, spread, color);
          if (["twinSlash", "fist", "dash", "minionSlash", "monsterClaw"].includes(style)) {
            addSlash(origin, (0.8 + phaseProgress * 0.5) * S * visualWidth, color, -0.65);
            if (combatClass === "assassin" || (combatClass === "fighter" && isSkill)) {
              addSlash(origin, (0.62 + phaseProgress * 0.42) * S * visualWidth, color, 0.72);
            }
          } else {
            addOrb(origin, (isSkill ? 0.82 : 0.48) * S * visualWidth, color,
              GROUND_Y + (isSkill ? 2.2 : 1.55) * S);
            addCore(origin, (isSkill ? 0.48 : 0.3) * S * visualWidth, coreColor,
              GROUND_Y + (isSkill ? 2.2 : 1.55) * S, isSkill ? 1.35 : 1);
          }
          if (combatClass === "mage" && isSkill) {
            // 法師：高位主法球 + 兩顆繞行星屑，青藍色、圓潤且有垂直層次。
            addOrb(origin, 1.25 * S * visualWidth, color, GROUND_Y + 2.9 * S, 1.3);
            const orbit = (0.7 + phaseProgress * 0.25) * S * visualWidth;
            addOrb({
              x: origin.x + Math.cos(elapsed * 7) * orbit,
              z: origin.z + Math.sin(elapsed * 7) * orbit,
            }, 0.28 * S * visualWidth, coreColor, GROUND_Y + 2.35 * S);
            addOrb({
              x: origin.x - Math.cos(elapsed * 7) * orbit,
              z: origin.z - Math.sin(elapsed * 7) * orbit,
            }, 0.28 * S * visualWidth, coreColor, GROUND_Y + 2.35 * S);
          } else if (combatClass === "support" && isSkill) {
            // 輔助：薄荷綠旋轉符文 + 左右翼光，和法師單一大法球分開。
            addLock(origin, (0.56 + phaseProgress * 0.18) * S * visualWidth,
              color, -elapsed * 2.2);
            addOrb({ x: origin.x - 0.58 * S, z: origin.z },
              0.32 * S * visualWidth, coreColor, GROUND_Y + 2.15 * S, 1.45);
            addOrb({ x: origin.x + 0.58 * S, z: origin.z },
              0.32 * S * visualWidth, coreColor, GROUND_Y + 2.15 * S, 1.45);
          } else if (combatClass === "tank" && isSkill) {
            // 坦克：低位金色方盾／蓄力核心，重量感集中在地面。
            addLock(origin, 0.68 * S * visualWidth, color, Math.PI / 4);
            addCore(origin, 0.7 * S * visualWidth, white, GROUND_Y + 0.78 * S, 0.7);
          } else if (combatClass === "fighter" && isSkill) {
            addSlash(origin, 1.18 * S * visualWidth, color, -0.82);
            addSlash(origin, 0.9 * S * visualWidth, coreColor, 0.58);
          } else if (combatClass === "assassin" && isSkill) {
            addSlash(origin, 1.04 * S * visualWidth, color, -1.12);
            addSlash(origin, 1.04 * S * visualWidth, coreColor, 1.12);
          } else if (combatClass === "marksman" && hasTarget) {
            // 射手：細長瞄準線，不使用法師圓形蓄力語彙。
            addLine(origin, impact, (isSkill ? 0.14 : 0.09) * S * visualWidth,
              color, GROUND_Y + 1.5 * S);
          }
        }
      }

      // travel：每種角色不再共用同一條線。
      if (phase === "travel" && hasTarget) {
        const ax = origin.x, az = origin.z;
        const bx = impact.x, bz = impact.z;
        const moving = {
          x: ax + (bx - ax) * phaseProgress,
          z: az + (bz - az) * phaseProgress,
        };
        if (isTower) {
          // MOBA 塔彈：從高塔冠飛向目標，保留明確飛行時間；不畫全長光束或震波。
          const projectileY = GROUND_Y + (1.35 + (1 - phaseProgress) * 3.2
            + Math.sin(Math.PI * phaseProgress) * 0.75) * S;
          // 雙層彈體：隊色外殼 + 白色實心核心。單層 additive 在遠景會融進路面／Bloom，
          // 這層核心讓「單顆正在飛的東西」保持 6–10px 輪廓。
          addTowerShell(moving, impact, 0.72 * S * visualWidth, 1.72 * S * visualWidth,
            towerTeam, projectileY);
          // 外層 additive 曳光 + 白熱核心，炮彈本體由固定隊色 material 保證不會變黑。
          addProjectile(moving, impact, 0.86 * S * visualWidth, 1.92 * S * visualWidth,
            color, projectileY);
          addProjectile(moving, impact, 0.25 * S * visualWidth, 1.42 * S * visualWidth,
            coreColor, projectileY + 0.03 * S);
          addCore(moving, 0.4 * S * visualWidth, white, projectileY, 1.3);
          addOrb(moving, 1.02 * S * visualWidth, color, projectileY, 1.48);
          const tailP = Math.max(0, phaseProgress - 0.08);
          addOrb({
            x: ax + (bx - ax) * tailP,
            z: az + (bz - az) * tailP,
          }, 0.3 * S * visualWidth, color, projectileY + 0.08 * S, 1.35);
          // 短尾跡只黏著單顆彈體，不再讓目標腳下的舊白色鎖定圈主導畫面。
          const tail = {
            x: ax + (bx - ax) * Math.max(0, phaseProgress - 0.14),
            z: az + (bz - az) * Math.max(0, phaseProgress - 0.14),
          };
          addLine(tail, moving, 0.34 * S * visualWidth, color, projectileY);
        } else if (isSkill && combatClass === "mage") {
          // 法師：大法球 + 白熱核心 + 雙衛星，青藍圓形輪廓。
          const trailP = Math.max(0, phaseProgress - 0.18);
          const trail = { x: ax + (bx - ax) * trailP, z: az + (bz - az) * trailP };
          const wing = 0.58 * S * visualWidth;
          const len = Math.max(0.001, Math.hypot(bx - ax, bz - az));
          const px = -(bz - az) / len * wing, pz = (bx - ax) / len * wing;
          addLine(trail, moving, 0.34 * S * visualWidth, color, GROUND_Y + 1.75 * S);
          addClassProjectile(moving, impact, 0.7 * S * visualWidth,
            1.28 * S * visualWidth, combatClass, GROUND_Y + 1.85 * S);
          addCore(moving, 0.52 * S * visualWidth, white, GROUND_Y + 1.85 * S, 1.2);
          addOrb(moving, 1.2 * S * visualWidth, color, GROUND_Y + 1.85 * S, 1.2);
          addOrb({ x: moving.x + px, z: moving.z + pz },
            0.34 * S * visualWidth, coreColor, GROUND_Y + 1.85 * S);
          addOrb({ x: moving.x - px, z: moving.z - pz },
            0.34 * S * visualWidth, coreColor, GROUND_Y + 1.85 * S);
        } else if (isSkill && combatClass === "marksman") {
          // 射手：金色高速長梭 + 從槍口延伸的細直曳光。
          addLine(origin, moving, 0.15 * S * visualWidth, color, GROUND_Y + 1.55 * S);
          addClassProjectile(moving, impact, 0.38 * S * visualWidth,
            2.2 * S * visualWidth, combatClass, GROUND_Y + 1.58 * S);
          addProjectile(moving, impact, 0.14 * S * visualWidth,
            1.82 * S * visualWidth, coreColor, GROUND_Y + 1.6 * S);
          addCore(moving, 0.24 * S * visualWidth, white, GROUND_Y + 1.58 * S, 1.65);
        } else if (isSkill && combatClass === "support") {
          // 輔助：薄荷綠中核 + 雙翼光點 + 小型旋轉符文。
          const len = Math.max(0.001, Math.hypot(bx - ax, bz - az));
          const wing = 0.62 * S * visualWidth;
          const px = -(bz - az) / len * wing, pz = (bx - ax) / len * wing;
          const trailP = Math.max(0, phaseProgress - 0.15);
          const trail = { x: ax + (bx - ax) * trailP, z: az + (bz - az) * trailP };
          addLine(trail, moving, 0.25 * S * visualWidth, color, GROUND_Y + 1.65 * S);
          addClassProjectile(moving, impact, 0.52 * S * visualWidth,
            1.12 * S * visualWidth, combatClass, GROUND_Y + 1.68 * S);
          addCore(moving, 0.36 * S * visualWidth, white, GROUND_Y + 1.68 * S, 1.2);
          addOrb({ x: moving.x + px, z: moving.z + pz },
            0.38 * S * visualWidth, coreColor, GROUND_Y + 1.68 * S, 1.5);
          addOrb({ x: moving.x - px, z: moving.z - pz },
            0.38 * S * visualWidth, coreColor, GROUND_Y + 1.68 * S, 1.5);
          addLock(moving, 0.4 * S * visualWidth, color, -elapsed * 4);
        } else if (isSkill && combatClass === "assassin") {
          // 刺客：紫色雙刃交叉位移，沒有圓形大法球。
          const trailP = Math.max(0, phaseProgress - 0.2);
          const trail = { x: ax + (bx - ax) * trailP, z: az + (bz - az) * trailP };
          addLine(trail, moving, 0.21 * S * visualWidth, color, GROUND_Y + 1.4 * S);
          addClassProjectile(moving, impact, 0.4 * S * visualWidth,
            1.35 * S * visualWidth, combatClass, GROUND_Y + 1.4 * S);
          addCore(moving, 0.42 * S * visualWidth, white, GROUND_Y + 1.4 * S, 1.2);
          addSlash(moving, 1.12 * S * visualWidth, color, -1.05 + phaseProgress * 1.7);
          addSlash(moving, 0.92 * S * visualWidth, coreColor, 1.05 - phaseProgress * 1.7);
        } else if (isSkill && combatClass === "fighter") {
          // 戰士：紅橙重斬與寬短衝擊軌跡。
          addLine(origin, moving, 0.28 * S * visualWidth, color, GROUND_Y + 1.25 * S);
          addClassProjectile(moving, impact, 0.58 * S * visualWidth,
            0.92 * S * visualWidth, combatClass, GROUND_Y + 1.36 * S);
          addCore(moving, 0.56 * S * visualWidth, white, GROUND_Y + 1.38 * S, 1.15);
          addSlash(moving, 1.28 * S * visualWidth, color, -0.88 + phaseProgress * 1.35);
          addSlash(moving, 0.9 * S * visualWidth, coreColor, 0.74 - phaseProgress);
        } else if (isSkill && combatClass === "tank") {
          // 坦克：金色低位盾核、方形符文與貼地震波。
          addClassProjectile(moving, impact, 0.78 * S * visualWidth,
            0.72 * S * visualWidth, combatClass, GROUND_Y + 0.72 * S);
          addCore(moving, 0.78 * S * visualWidth, white, GROUND_Y + 0.72 * S, 0.68);
          addLock(moving, 0.7 * S * visualWidth, color, Math.PI / 4 + elapsed * 1.5);
          addRing(moving, (0.75 + phaseProgress * 0.36) * S * visualWidth, color);
          addLine(origin, moving, 0.24 * S * visualWidth, color, GROUND_Y + 0.42 * S);
        } else if (["twinSlash", "fist", "dash", "minionSlash", "monsterClaw"].includes(style)) {
          addCore(moving, (isMinion ? 0.32 : 0.5) * S * visualWidth, coreColor,
            GROUND_Y + 1.35 * S, 1.25);
          addSlash(moving, (isMinion ? 0.62 : 1.15) * S * visualWidth, color, -0.9 + phaseProgress * 1.8);
          if (style === "twinSlash") addSlash(moving, 0.92 * S * visualWidth, color, 2.1 - phaseProgress * 1.4);
        } else if (style === "quake" || style === "hammer") {
          addCore(moving, 0.62 * S * visualWidth, coreColor, GROUND_Y + 0.72 * S, 0.72);
          addRing(moving, (0.72 + phaseProgress * 0.42) * S * visualWidth, color);
          addLine(origin, moving, 0.18 * S * visualWidth, color, GROUND_Y + 0.45 * S);
        } else {
          const beamK = style === "rail" ? 1.75 : 1;
          const trailP = Math.max(0, phaseProgress - (style === "rail" ? 1 : 0.16));
          const trail = { x: ax + (bx - ax) * trailP, z: az + (bz - az) * trailP };
          addLine(style === "rail" ? origin : trail, style === "rail" ? impact : moving,
            (isMinion ? 0.16 : 0.28) * S * visualWidth * beamK, color, GROUND_Y + 1.35 * S);
          addProjectile(moving, impact,
            (isMinion ? 0.26 : (style === "flameOrb" ? 0.55 : 0.42)) * S * visualWidth,
            (isMinion ? 0.72 : (style === "rail" ? 1.8 : 1.15)) * S * visualWidth,
            color, GROUND_Y + 1.55 * S);
          if (!isMinion) {
            addProjectile(moving, impact, 0.2 * S * visualWidth,
              (style === "rail" ? 1.5 : 0.86) * S * visualWidth,
              coreColor, GROUND_Y + 1.58 * S);
          }
          addCore(moving, (isMinion ? 0.18 : 0.28) * S * visualWidth, coreColor,
            GROUND_Y + 1.55 * S, style === "shard" ? 1.45 : 1);
          addOrb(moving, (isMinion ? 0.46 : (style === "flameOrb" ? 1.05 : 0.75)) * S * visualWidth,
            color, GROUND_Y + 1.55 * S, style === "shard" ? 1.8 : 1);
          if (style === "wingBolt") {
            addOrb({ x: moving.x + 0.55 * S, z: moving.z }, 0.46 * S * visualWidth, color);
          }
        }
      }

      // impact：爆點、擴散圈與受擊弧同時保留足夠螢幕面積，手機仍看得見。
      if (phase === "impact") {
        if (isTower) {
          // 小型點狀爆光 + 十字感斬弧；塔彈命中不再產生大面積同心圓。
          const strength = Math.max(0.45, 1 - phaseProgress * 0.5);
          addCore(impact, 0.78 * S * visualWidth * strength, coreColor,
            GROUND_Y + 1.3 * S, 1.22);
          addOrb(impact, 1.08 * S * visualWidth * strength, color, GROUND_Y + 1.25 * S);
          addSlash(impact, 0.72 * S * visualWidth, color, phaseProgress * 1.6);
          addSlash(impact, 0.56 * S * visualWidth, color, Math.PI / 2 + phaseProgress * 1.6);
        } else {
          const strength = Math.max(0.55, 1 - phaseProgress * 0.35);
          addCore(impact, (isSkill ? 0.92 : (isMinion ? 0.38 : 0.62))
            * S * visualWidth * strength, coreColor, GROUND_Y + 1.38 * S, isSkill ? 1.35 : 1);
          addOrb(impact, (isSkill ? 1.7 : (isMinion ? 0.7 : 1.05)) * S * visualWidth * strength,
            color, GROUND_Y + 1.35 * S);
          addRing(impact, (0.7 + phaseProgress * (isSkill ? 1.0 : 0.58)) * S * visualWidth, color);
          addSlash(impact, (isSkill ? 1.65 : 0.95) * S * visualWidth, color, phaseProgress * 1.8);
          if (isSkill || style === "siege") {
            addRing(impact, (0.5 + phaseProgress * 0.82) * S * visualWidth, color, GROUND_Y + 0.22);
          }
          if (combatClass === "mage" && isSkill) {
            addOrb(impact, 2.05 * S * visualWidth * strength, color, GROUND_Y + 2.25 * S, 1.35);
            addSlash(impact, 1.28 * S * visualWidth, coreColor, phaseProgress * 2.1);
            addSlash(impact, 0.92 * S * visualWidth, color, Math.PI / 2 - phaseProgress * 2.1);
          } else if (combatClass === "support" && isSkill) {
            addLock(impact, (0.68 + phaseProgress * 0.3) * S * visualWidth,
              color, elapsed * 2.4);
            addOrb({ x: impact.x - 0.62 * S, z: impact.z },
              0.44 * S * visualWidth, coreColor, GROUND_Y + 1.68 * S, 1.55);
            addOrb({ x: impact.x + 0.62 * S, z: impact.z },
              0.44 * S * visualWidth, coreColor, GROUND_Y + 1.68 * S, 1.55);
          } else if (combatClass === "tank" && isSkill) {
            addLock(impact, 0.92 * S * visualWidth, color, Math.PI / 4);
            addRing(impact, (1.0 + phaseProgress * 0.52) * S * visualWidth, color);
            addCore(impact, 1.02 * S * visualWidth * strength,
              white, GROUND_Y + 0.68 * S, 0.62);
          } else if (combatClass === "fighter") {
            addSlash(impact, (1.15 + (isSkill ? 0.8 : 0.25)) * S * visualWidth,
              color, -phaseProgress * 2.1);
            if (isSkill) {
              addSlash(impact, 1.35 * S * visualWidth, coreColor,
                Math.PI / 2 + phaseProgress * 1.6);
            }
          } else if (combatClass === "assassin" && isSkill) {
            addSlash(impact, 1.58 * S * visualWidth, color, -1.08 + phaseProgress);
            addSlash(impact, 1.58 * S * visualWidth, coreColor, 1.08 - phaseProgress);
          } else if (combatClass === "marksman") {
            addOrb(impact, 0.88 * S * visualWidth, color, GROUND_Y + 1.45 * S, 2.1);
            addCore(impact, 0.5 * S * visualWidth, white, GROUND_Y + 1.45 * S, 1.65);
          }
        }
      }
    }

    const update = (mesh, count) => {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    update(lineMesh, lines);
    update(ringMesh, rings);
    update(orbMesh, orbs);
    update(projectileMesh, projectiles);
    update(coreMesh, cores);
    update(towerBlueMesh, towerBlue);
    update(towerRedMesh, towerRed);
    for (const cls of Object.keys(classMeshes)) update(classMeshes[cls], classCounts[cls]);
    update(slashMesh, slashes);
    update(lockMesh, locks);
  });

  const pool = (key, geometry, material, cap, order) => (
    <instancedMesh key={key} ref={(node) => { refs.current[key] = node; }}
      name={`moba-combat-${key}`} args={[geometry, material, cap]}
      frustumCulled={false} renderOrder={order} />
  );
  return (
    <group name="moba-runtime-effects">
      {pool("line", geo.line, mats.line, LINE_CAP, 40)}
      {pool("ring", geo.ring, mats.ring, BURST_CAP, 39)}
      {pool("orb", geo.orb, mats.orb, BURST_CAP, 52)}
      {pool("projectile", geo.projectile, mats.projectile, PROJECTILE_CAP, 62)}
      {pool("core", geo.core, mats.core, CORE_CAP, 63)}
      {pool("towerBlue", geo.towerShell, mats.towerBlue, TOWER_SHELL_CAP, 64)}
      {pool("towerRed", geo.towerShell, mats.towerRed, TOWER_SHELL_CAP, 64)}
      {pool("classTank", geo.projectile, mats.classTank, CLASS_PROJECTILE_CAP, 63)}
      {pool("classFighter", geo.projectile, mats.classFighter, CLASS_PROJECTILE_CAP, 63)}
      {pool("classAssassin", geo.projectile, mats.classAssassin, CLASS_PROJECTILE_CAP, 63)}
      {pool("classMage", geo.projectile, mats.classMage, CLASS_PROJECTILE_CAP, 63)}
      {pool("classMarksman", geo.projectile, mats.classMarksman, CLASS_PROJECTILE_CAP, 63)}
      {pool("classSupport", geo.projectile, mats.classSupport, CLASS_PROJECTILE_CAP, 63)}
      {pool("slash", geo.slash, mats.slash, SLASH_CAP, 53)}
      {pool("lock", geo.lock, mats.lock, LOCK_CAP, 51)}
    </group>
  );
}
