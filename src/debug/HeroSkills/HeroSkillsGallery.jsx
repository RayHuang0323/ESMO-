import React, { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { heroById } from '../../data/heroDatabase.js';
import { goldenSkills, createSkillPreviewEvent } from '../../battle/moba/skills/heroSkillContract.js';
import HeroVfxRuntime from '../../battle/moba/skills/HeroVfxRuntime.jsx';
import Round1Vfx from './Round1Vfx.jsx';
import { sampleWorkshopPose, visualPhase } from '../../battle/moba/skills/skillChoreography.js';
import { useReducedBattleMotion } from '../../battle/moba/render/useReducedBattleMotion.js';
import HeroSkillEffects from '../../battle/moba/presentation/HeroSkillEffects.jsx';
import { describeFxPresentation } from '../../battle/moba/heroPresentationAdapter.js';
import { useIsMobile } from '../../ui/useViewport.js';
import { GC, FONT, btn } from '../../ui/theme.js';

function WorkshopActor({ element, color }) {
  return <>
    <mesh position={[0, 0.76, 0]}><boxGeometry args={[0.42, 0.66, 0.28]} /><meshStandardMaterial color={color} metalness={element === 'steel' ? 0.8 : 0.25} roughness={0.4} /></mesh>
    <mesh position={[0, 1.25, 0]}><octahedronGeometry args={[0.23, 0]} /><meshStandardMaterial color={color} /></mesh>
    {[-1, 1].map(s => <group key={s}>
      <mesh position={[s * 0.14, 0.26, 0]}><boxGeometry args={[0.16, 0.48, 0.18]} /><meshStandardMaterial color={GC.gray} /></mesh>
      <mesh position={[s * 0.37, element === 'magma' ? 0.7 : 0.96, 0.1]} rotation={[0, 0, s * -0.2]}>
        {element === 'ice' || element === 'lightning' ? <octahedronGeometry args={[0.22, 0]} /> : <boxGeometry args={[element === 'stone' ? 0.4 : 0.3, 0.32, 0.32]} />}
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={element === 'magma' || element === 'solar' ? 0.4 : 0.08} />
      </mesh>
    </group>)}
    {element === 'steel' && <mesh position={[0.48, 0.85, 0.26]}><boxGeometry args={[0.48, 0.85, 0.13]} /><meshStandardMaterial color={GC.blueL} metalness={0.8} roughness={0.25} /></mesh>}
    {element === 'solar' && <mesh position={[-0.5, 0.8, 0.2]} rotation={[0.4, 0, -0.25]}><boxGeometry args={[0.07, 1.35, 0.15]} /><meshStandardMaterial color={GC.gold} emissive={GC.gold} emissiveIntensity={0.3} /></mesh>}
  </>;
}

function Stage({ skill, playing, restart, quality, reduced, legacy, round1, overlap, timeRef, diagnosticsRef, scrubRef }) {
  const previewRef = useRef({ time: 0, events: [] });
  const legacyRef = useRef({ effects: [] });
  const generation = useRef(-1);
  const actor = useRef();
  const systemReduced = useReducedBattleMotion();
  const reduce = reduced || systemReduced;
  const pose = useMemo(() => ({}), []);
  const events = useMemo(() => Array.from({ length: overlap ? 40 : 1 }, (_, i) => {
    const z = overlap ? ((i % 5) - 2) * 0.55 : 0;
    return createSkillPreviewEvent(skill, { id: `preview-${i}`, at: 0,
      origin: { x: -3, y: 0, z }, target: { x: 3, y: 0, z } });
  }), [skill, overlap]);
  const poseEvent = useMemo(() => ({ ...events[0], progress: 0 }), [events]);
  const old = useMemo(() => ({ id: 'legacy-preview', type: 'ult', ability: 'mid:power',
    sourceId: 'b1', targetId: 'r1', world: { x: -3, y: 0, z: 0 }, targetWorld: { x: 3, y: 0, z: 0 },
    presentation: describeFxPresentation({ type: 'ult', ability: 'mid:power', sourceId: 'b1' }, { b1: { heroId: skill.heroId } }) }), [skill]);
  useFrame((state, dt) => {
    if (generation.current !== restart) { timeRef.current = 0; generation.current = restart; }
    if (playing) timeRef.current = (timeRef.current + Math.min(dt, 0.1)) % (skill.presentation.duration + 0.5);
    previewRef.current.time = timeRef.current; previewRef.current.events = events;
    const t = timeRef.current / skill.presentation.duration;
    poseEvent.progress = t;
    sampleWorkshopPose(poseEvent, reduce || legacy || round1, pose);
    if (actor.current) {
      actor.current.position.set(pose.x, pose.y, pose.z);
      actor.current.rotation.set(pose.lean, Math.PI / 2, 0, 'YXZ');
      actor.current.scale.set(1 / Math.sqrt(pose.squash), pose.squash, 1 / Math.sqrt(pose.squash));
    }
    if (scrubRef.current) scrubRef.current.value = timeRef.current;
    old.progress = t; old.lifeRatio = Math.max(0, 1 - t);
    old.phase = t < 0.24 ? 'cast' : t < 0.72 ? 'travel' : 'impact';
    old.phaseProgress = t < 0.24 ? t / 0.24 : t < 0.72 ? (t - 0.24) / 0.48 : (t - 0.72) / 0.28;
    legacyRef.current.effects = t < 1 ? [old] : [];
    // Debug-only readback, no write to Battle/Store/Replay.
    window.__HERO_SKILLS_PREVIEW__ = { skillId: skill.id, time: timeRef.current, playing, legacy, round1,
      visualRevision: round1 ? 1 : 2, phase: t < 1 ? visualPhase(poseEvent) : 'idle', pose: { ...pose },
      ...diagnosticsRef.current, calls: state.gl.info.render.calls, triangles: state.gl.info.render.triangles,
      geometries: state.gl.info.memory.geometries, textures: state.gl.info.memory.textures };
  }, -1);
  return <>
    <color attach="background" args={[GC.bg]} />
    <ambientLight intensity={0.8} /><directionalLight position={[3, 8, 5]} intensity={2} />
    <gridHelper args={[24, 24, GC.gray, GC.card2]} position={[0, -0.03, 0]} />
    <group ref={actor} position={[-3, 0, 0]}><WorkshopActor element={skill.presentation.element} color={skill.presentation.accent} /></group>
    <group position={[3, 0, 0]}>
      <mesh position={[0, 0.7, 0]}><boxGeometry args={[0.5, 1.15, 0.35]} /><meshStandardMaterial color={GC.gray} /></mesh>
      <mesh position={[0, 0.9, 0]}><boxGeometry args={[1.1, 0.16, 0.2]} /><meshStandardMaterial color={GC.gray} /></mesh>
    </group>
    {legacy ? <HeroSkillEffects frameRef={legacyRef} quality={quality} />
      : round1 ? <Round1Vfx previewRef={previewRef} quality={quality} reducedMotion={reduce} diagnosticsRef={diagnosticsRef} />
        : <HeroVfxRuntime previewRef={previewRef} quality={quality} reducedMotion={reduce} diagnosticsRef={diagnosticsRef} />}
  </>;
}

export default function HeroSkillsGallery() {
  const skills = useMemo(goldenSkills, []);
  const [id, setId] = useState(skills[0].id);
  const [playing, setPlaying] = useState(true);
  const [restart, setRestart] = useState(0);
  const [quality, setQuality] = useState('high');
  const [reduced, setReduced] = useState(false);
  const [legacy, setLegacy] = useState(false);
  const [round1, setRound1] = useState(false);
  const [overlap, setOverlap] = useState(false);
  const timeRef = useRef(0), diagnosticsRef = useRef(null);
  const scrubRef = useRef();
  const mobile = useIsMobile();
  const skill = skills.find(s => s.id === id);
  const hero = heroById(skill.heroId);
  const reset = () => { timeRef.current = 0; setRestart(n => n + 1); };
  const button = { ...btn(false), padding: '10px 14px', minHeight: 44 };
  return <main style={{ background: GC.bg, color: '#eee', minHeight: '100vh', fontFamily: FONT, padding: mobile ? 12 : 24, boxSizing: 'border-box' }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
      <div><small style={{ color: GC.gold }}>ESMO · 英雄技能工坊</small><h1 style={{ fontSize: mobile ? 22 : 30, margin: '8px 0' }}>讓每個技能有自己的輪廓</h1></div>
      <a href={import.meta.env.BASE_URL} style={{ color: GC.blueL, flexShrink: 0 }}>離開</a>
    </header>
    <p style={{ color: GC.gray }}>{new Set(skills.map(s => s.heroId)).size} 位英雄・{skills.length} 種演出。此處為視覺預覽，不會造成傷害或改變正式戰鬥。</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
      <select aria-label="技能" value={id} style={{ ...button, background: GC.card, maxWidth: '100%' }} onChange={e => { setId(e.target.value); reset(); }}>
        {skills.map(s => <option key={s.id} value={s.id}>{heroById(s.heroId).zh} · {s.slot} {s.name}</option>)}
      </select>
      <button style={button} onClick={() => setPlaying(p => !p)}>{playing ? '暫停' : '播放'}</button>
      <button style={button} onClick={reset}>重播</button>
      <button style={button} onClick={() => { setRound1(v => !v); setLegacy(false); }}>{round1 ? '查看第二輪' : '比較第一輪'}</button>
      <button style={button} onClick={() => { setLegacy(v => !v); setRound1(false); }}>{legacy ? '查看新效果' : '比較舊效果'}</button>
    </div>
    <section style={{ border: `1px solid ${GC.line}`, borderRadius: 16, overflow: 'hidden', background: GC.card }}>
      <div style={{ padding: 14 }}><strong style={{ color: skill.presentation.accent }}>{hero.zh} · {skill.slot} {skill.name}</strong>
        <span style={{ marginLeft: 12, color: legacy || round1 ? GC.gold : GC.green }}>{legacy ? '舊版定位演出（非同一技能）' : round1 ? '第一輪 · 原始模板' : '第二輪 · 元素與動作'}</span></div>
      <div style={{ height: mobile ? 340 : 490 }}>
        <Canvas camera={{ position: [8, 9, 12], fov: mobile ? 48 : 38 }} onCreated={({ camera }) => camera.lookAt(0, 1, 0)} dpr={quality === 'low' ? 1 : [1, 1.5]}>
          <Stage {...{ skill, playing, restart, quality, reduced, legacy, round1, overlap, timeRef, diagnosticsRef, scrubRef }} />
        </Canvas>
      </div>
    </section>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, padding: '16px 0', alignItems: 'center' }}>
      <label><input type="checkbox" checked={reduced} onChange={e => { setReduced(e.target.checked); setLegacy(false); setRound1(false); }} />減少動態</label>
      <label><input type="checkbox" checked={overlap} onChange={e => setOverlap(e.target.checked)} />多重演出測試</label>
      <label>畫質 <select aria-label="畫質" value={quality} onChange={e => setQuality(e.target.value)}><option value="high">標準</option><option value="low">省電</option></select></label>
      <label>逐格查看 <input ref={scrubRef} aria-label="時間" type="range" min="0" max={skill.presentation.duration} step="0.01" defaultValue="0"
        onChange={e => { setPlaying(false); timeRef.current = Number(e.target.value); }} /></label>
    </div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{[['前搖', 0.12], ['主爆發', 0.5], ['餘波', 0.78]].map(([label, progress]) =>
      <button key={label} style={button} onClick={() => { setPlaying(false); timeRef.current = progress * skill.presentation.duration; }}>{label}</button>)}</div>
    <p style={{ color: GC.gray, fontSize: 13 }}>角色為測試標記。正式技能邏輯尚未啟用；舊效果只供此頁比較，不作正式戰鬥 fallback。</p>
  </main>;
}
