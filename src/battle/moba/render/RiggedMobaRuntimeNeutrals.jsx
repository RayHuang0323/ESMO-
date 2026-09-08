// Original Blender assets. This adapter never runs combat or writes game state.
import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { buildMobaLayout } from '../map/mobaMapLayout.js';
import { buildCampPlan } from '../map/mapCampLayout.js';
import { buildMonsters } from '../map/mapMonsterShapes.js';
import { LAYER_Y } from '../map/mapVisualStyle.js';
import { NEUTRAL_ASSETS, sampleNeutralAnimation } from './neutralAnimationPolicy.js';
import LegacyNeutrals from './MobaRuntimeNeutrals.jsx';

const GROUND_Y = LAYER_Y.jungle_ground ?? LAYER_Y.lane_surface ?? 0;
const URL_BASE = `${import.meta.env.BASE_URL}assets/moba/neutrals-v1/`;
const urls = Object.values(NEUTRAL_ASSETS).map(a => `${URL_BASE}${a.file}.glb?rev=rig-v3`);
const archetypes = Object.keys(NEUTRAL_ASSETS);

class AssetBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('ESMO neutral asset loading failed', error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function RiggedMobaRuntimeNeutrals(props) {
  return <AssetBoundary fallback={<LegacyNeutrals {...props} />}>
    <Suspense fallback={<LegacyNeutrals {...props} />}><LoadedNeutrals {...props} /></Suspense>
  </AssetBoundary>;
}

function LoadedNeutrals({ objectives = [], frameRef }) {
  const gltfs = useGLTF(urls);
  const assets = useMemo(() => {
    const layout = buildMobaLayout();
    return new Map(buildMonsters(layout, buildCampPlan(layout))
      .filter(m => !m.isPresentation && NEUTRAL_ASSETS[m.archetype])
      .map(m => [m.id.replace(/^mon_/, ''), m]));
  }, []);
  const shadow = useMemo(() => {
    const data = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const r = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
      data[(y * 64 + x) * 4 + 3] = Math.round(Math.max(0, 1 - r) ** 1.4 * 130);
    }
    const texture = new THREE.DataTexture(data, 64, 64); texture.needsUpdate = true;
    return texture;
  }, []);
  useEffect(() => () => shadow.dispose(), [shadow]);
  return <group name="moba-runtime-neutrals-rigged">
    {objectives.map(objective => {
      const asset = assets.get(objective.id);
      if (!asset) return null;
      const gltf = gltfs[archetypes.indexOf(asset.archetype)];
      return <NeutralGroup key={objective.id} objective={objective} asset={asset}
        frameRef={frameRef} gltf={gltf} shadow={shadow} />;
    })}
  </group>;
}

function NeutralGroup({ objective, asset, frameRef, gltf, shadow }) {
  const label = useRef();
  const boss = objective.type === 'dragon' || objective.type === 'baron';
  // Only snapshot members become combat views. No decorative camps acquire HP or AI.
  const entities = boss ? [null] : objective.members ?? [];
  useFrame(() => {
    const live = frameRef?.current?.objectives?.find(o => o.id === objective.id) ?? objective;
    if (!label.current) return;
    const respawning = !live.alive && live.respawnIn > 0;
    const buff = live.type === 'buff' && live.alive;
    label.current.style.display = respawning || buff ? 'inline-block' : 'none';
    label.current.textContent = respawning
      ? `${live.respawnState === 'unspawned' ? '首次刷新' : '重生'} ${Math.ceil(live.respawnIn)}s`
      : asset.label;
  });
  return <group userData={{ objectiveId: objective.id, part: boss ? 'dynamic-boss' : 'dynamic-neutral' }}>
    {entities.map((member, index) => <NeutralCreature key={member?.id ?? objective.id}
      objective={objective} memberId={member?.id ?? null} index={index}
      asset={asset} gltf={gltf} frameRef={frameRef} shadow={shadow} />)}
    <Html center position={[objective.world.x, GROUND_Y + (boss ? 3 : asset.top + 5), objective.world.z]}
      style={{ pointerEvents: 'none' }}>
      <span ref={label} style={{ display: 'none', whiteSpace: 'nowrap', color: '#e5e7eb',
        background: 'rgba(5,9,15,.78)', borderRadius: 4, padding: '2px 4px', font: '700 8px system-ui' }} />
    </Html>
  </group>;
}

function NeutralCreature({ objective, memberId, index, asset, gltf, frameRef, shadow }) {
  const root = useRef(), visual = useRef(), hp = useRef(), hpRoot = useRef();
  const previous = useRef(null);
  const boss = objective.type === 'dragon' || objective.type === 'baron';
  const model = useMemo(() => {
    const scene = clone(gltf.scene);
    scene.updateMatrixWorld(true);
    scene.traverse(o => {
      if (o.isMesh) {
        o.castShadow = boss; o.receiveShadow = true;
        // Conservative pose envelope: cull off-screen camps without clipping limbs in Attack/Death.
        if (o.isSkinnedMesh) { o.computeBoundingSphere(); o.boundingSphere.radius *= 2; }
        o.frustumCulled = true;
      }
    });
    const mixer = new THREE.AnimationMixer(scene);
    const actions = new Map(gltf.animations.map(clip => {
      const action = mixer.clipAction(clip); action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true; action.play(); action.setEffectiveWeight(0);
      return [clip.name, action];
    }));
    return { scene, mixer, actions };
  }, [gltf, boss]);
  useEffect(() => () => {
    model.mixer.stopAllAction(); model.mixer.uncacheRoot(model.scene);
    model.scene.traverse(o => { if (o.isSkinnedMesh) o.skeleton.dispose(); });
    // Geometry, textures and materials belong to the shared useGLTF cache.
  }, [model]);
  // Retain the existing individual silhouette budget, including smaller Buff whelps.
  const member = asset.members[index];
  const top = Math.max(2.6, ...(member?.parts ?? []).map(p => p.z + (p.h ?? 0))) * (asset.sizeK ?? 1);
  const scale = top / NEUTRAL_ASSETS[asset.archetype].height;
  const barWidth = boss ? 16 : index === 0 ? 6.5 : 4;
  useFrame(() => {
    const frame = frameRef?.current;
    const live = frame?.objectives?.find(o => o.id === objective.id) ?? objective;
    const entity = memberId ? live.members?.find(m => m.id === memberId) : live;
    if (!entity || !root.current) { if (root.current) root.current.visible = false; return; }
    const ts = frame?.ts ?? 0, p = entity.world ?? live.world, prev = previous.current;
    const dt = prev ? ts - prev.ts : 0;
    const dx = prev ? p.x - prev.x : 0, dz = prev ? p.z - prev.z : 0;
    const moving = dt > 0 && dt < 2 && Math.hypot(dx, dz) > .01;
    const pose = sampleNeutralAnimation(entity, ts, moving);
    root.current.visible = pose.visible;
    root.current.position.set(p.x, GROUND_Y, p.z);
    if (moving) visual.current.rotation.y = Math.atan2(dx, dz);
    const target = frame?.heroes?.find(h => h.id === entity.targetId);
    if (target?.world && entity.alive) visual.current.rotation.y = Math.atan2(target.world.x - p.x, target.world.z - p.z);
    previous.current = { ts, x: p.x, z: p.z };
    hpRoot.current.visible = !!entity.alive;
    const ratio = Math.max(0, Math.min(1, entity.hpRatio ?? 0));
    hp.current.scale.x = barWidth * ratio;
    hp.current.position.x = -barWidth * (1 - ratio) / 2;
    if (!pose.visible) return;
    const hitWeight = pose.hit === null ? 0 : .38 * Math.sin(Math.PI * pose.hit / (10 / 24));
    for (const [name, action] of model.actions) {
      const active = name === pose.clip, hit = name === 'Hit' && hitWeight > 0;
      action.enabled = active || hit;
      action.setEffectiveWeight(active ? 1 - hitWeight : hit ? hitWeight : 0);
      if (active || hit) action.time = active ? pose.time : pose.hit;
    }
    model.mixer.update(0);
  });
  return <group ref={root} visible={false} userData={{ objectiveId: objective.id, memberId, part: 'dynamic-neutral-member' }}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .1, 0]} scale={[top * 1.3, top * 1.1, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={shadow} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
    <group ref={visual} scale={scale}><primitive object={model.scene} dispose={null} /></group>
    <group ref={hpRoot} position={[0, top + 1.5, 0]} rotation={[-.66, 0, 0]}>
      <mesh scale={[barWidth + .3, .7, 1]} renderOrder={58}>
        <planeGeometry /><meshBasicMaterial color="#05080c" depthTest={false} />
      </mesh>
      <mesh ref={hp} scale={[barWidth, .4, 1]} position={[0, 0, .02]} renderOrder={59}>
        <planeGeometry /><meshBasicMaterial color="#55e078" depthTest={false} />
      </mesh>
    </group>
  </group>;
}
