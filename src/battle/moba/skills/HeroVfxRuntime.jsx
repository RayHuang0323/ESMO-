import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { adaptHeroAttack, adaptNamedHeroSkill, sampleSkillEvent } from './heroSkillContract.js';
import { emitChoreography } from './skillChoreography.js';
import { useReducedBattleMotion } from '../render/useReducedBattleMotion.js';
import { countMount, countUnmount, diagnosticsEnabled } from '../render/runtimeDiagnostics.js';
import { skillScreenRadius, skillSlotOf, SKILL_READABILITY } from './skillReadability.js';

// Art palette comes from heroDatabase. Post FX stays bounded in the formal
// Canvas composer; this runtime owns pooled geometry/material instances only.
const CAP = 384;
const vertexShader = `
attribute vec4 tint;
varying vec2 vUv; varying vec4 vTint; varying vec3 vNormal; varying vec3 vView;
void main() {
  vUv=uv; vTint=tint;
  vec4 p=modelViewMatrix*instanceMatrix*vec4(position,1.0);
  vView=-p.xyz;
  vNormal=normalize(normalMatrix*mat3(instanceMatrix)*normal);
  gl_Position=projectionMatrix*p;
}`;
const fragmentShader = `
uniform float mode;
varying vec2 vUv; varying vec4 vTint; varying vec3 vNormal; varying vec3 vView;
void main() {
  float a=1.0; float glow=0.0;
  if(mode<0.5) {
    vec2 p=vUv*2.0-1.0; float r=length(p); float angle=atan(p.y,p.x);
    float ring=exp(-abs(r-0.77)*65.0);
    float inner=exp(-abs(r-0.56)*100.0)*(0.35+0.65*step(0.4,sin(angle*12.0)));
    float rays=pow(max(0.0,cos(angle*6.0)),32.0)*smoothstep(0.2,0.5,r)*(1.0-smoothstep(0.5,0.9,r));
    a=clamp(ring+inner+rays*0.7,0.0,1.0); glow=ring;
  } else if(mode<1.5) {
    float rim=pow(1.0-abs(dot(normalize(vNormal),normalize(vView))),2.4);
    float bands=pow(max(0.0,cos(vUv.y*75.4)),28.0);
    float seams=pow(max(0.0,cos(vUv.x*100.53)),48.0);
    a=0.045+rim*0.7+(bands+seams)*0.12; glow=rim*0.65;
  } else if(mode>3.5) {
    vec2 p=vec2(vUv.x*2.0-1.0,vUv.y);
    float sway=sin(p.y*11.0)*0.1*p.y;
    float width=0.48*pow(max(0.0,1.0-p.y),0.7);
    float body=1.0-smoothstep(width*0.35,width,abs(p.x+sway));
    a=body*smoothstep(0.0,0.14,p.y)*(1.0-smoothstep(0.8,1.0,p.y));
    glow=body*(1.0-p.y)*0.9;
  } else if(mode<3.5) {
    // Pool 3 is used by Round 2 for direction/slab motifs. A soft center
    // ridge and feathered corners turn the shared box geometry into a readable
    // authored energy strip instead of a debug-like solid line.
    vec2 q=abs(vUv-0.5)*2.0;
    float corner=(1.0-smoothstep(0.68,1.0,q.x))*(1.0-smoothstep(0.7,1.0,q.y));
    float ridge=exp(-abs(vUv.x-0.5)*18.0)*(0.55+0.45*smoothstep(0.0,1.0,vUv.y));
    a=0.14+corner*0.42+ridge*0.44;
    glow=0.22+corner*0.28+ridge*0.5;
  } else { glow=0.12+0.25*max(0.0,dot(normalize(vNormal),normalize(vec3(0.3,0.8,0.5)))); }
  // Shared soft edge/fresnel finish: bright cores feed the existing Bloom,
  // while the feathered boundary keeps low-DPR silhouettes from reading as
  // debug slabs. It is analytic and adds no texture or per-frame allocation.
  float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x)
    * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
  float fresnel = pow(1.0 - max(0.0, dot(normalize(vNormal), normalize(vView))), 2.0);
  glow += fresnel * 0.14;
  a *= 0.72 + edge * 0.28;
  float outAlpha = a * vTint.a;
  if(outAlpha<0.008) discard;
  vec3 emission = mix(vTint.rgb, vec3(1.0), clamp(glow * 0.58, 0.0, 1.0));
  gl_FragColor=vec4(emission,outAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export default function HeroVfxRuntime({ frameRef, previewRef, quality = 'high', reducedMotion = false, diagnosticsRef }) {
  const meshes = useRef([]);
  const systemReduced = useReducedBattleMotion();
  useEffect(() => { countMount('heroVfxRuntime'); return () => countUnmount('heroVfxRuntime'); }, []);
  const scratch = useMemo(() => ({ object: new THREE.Object3D(), color: new THREE.Color(), sample: {},
    counts: [0, 0, 0, 0, 0], dropped: 0, activeFrames: 0, namedFrames: 0, namedDrawnFrames: 0,
    fusion: { core: 0, halo: 0, shield: 0, impact: 0, soft: 0 } }), []);
  useEffect(() => {
    if (!diagnosticsEnabled()) return;
    window.__HERO_VFX_DIAG = () => ({ counts: [...scratch.counts], activeFrames: scratch.activeFrames,
      namedFrames: scratch.namedFrames, namedDrawnFrames: scratch.namedDrawnFrames, dropped: scratch.dropped,
      fusion: { ...scratch.fusion } });
    return () => { delete window.__HERO_VFX_DIAG; };
  }, [scratch]);
  // Declarative R3F resources own disposal; no per-frame geometries/materials.
  const attributes = useMemo(() => [0, 1, 2, 3, 4].map(() => new Float32Array(CAP * 4)), []);
  useFrame((state) => {
    const { object, color, counts, fusion } = scratch;
    // Battle UX hotfix: named skills are authored for a close Workshop view; the formal
    // overview camera shrinks them to hairlines. Presentation-only radius/alpha boost.
    // Combat Quality v1: named skills get a screen-space radius (min px per slot,
    // capped by a screen fraction when zoomed in) instead of a flat zoom multiplier.
    let alphaGain = 1;
    counts.fill(0); scratch.dropped = 0;
    Object.keys(fusion).forEach(k => { fusion[k] = 0; });
    const low = quality === 'low';
    const cap = low ? 96 : CAP;
    const shieldCap = low ? 8 : 24; // Transparent volume overdraw has a separate budget.
    const flameCap = low ? 48 : 128;
    const reduced = reducedMotion || systemReduced;
    function emit(pool, x, y, z, sx, sy, sz, opacity, hex, rotation = 0, pitch = 0, roll = 0) {
      if (counts[pool] >= (pool === 1 ? shieldCap : pool === 4 ? flameCap : cap)) { scratch.dropped++; return; }
      const mesh = meshes.current[pool];
      if (!mesh) return;
      const i = counts[pool]++;
      object.position.set(x, y, z);
      object.rotation.set(pool === 0 ? -Math.PI / 2 : pitch, pool === 0 ? 0 : rotation, pool === 0 ? rotation : roll, 'YXZ');
      object.scale.set(Math.max(0.001, sx), Math.max(0.001, sy), Math.max(0.001, sz));
      object.updateMatrix(); mesh.setMatrixAt(i, object.matrix);
      color.set(hex);
      const a = attributes[pool];
      a[i * 4] = color.r; a[i * 4 + 1] = color.g; a[i * 4 + 2] = color.b; a[i * 4 + 3] = Math.min(1, opacity * alphaGain);
    }
    function draw(e) {
      if (e.visual?.visualRevision === 2) { emitChoreography(e, emit, { low, reduced, stats: fusion }); return; }
      const t = e.progress, r = e.radius, c = e.color;
      const o = e.origin, b = e.target;
      const alpha = Math.min(1, t * 12) * Math.min(1, (1 - t) * 5);
      const self = e.primitive === 'shield' || e.primitive === 'aura';
      const p = self ? o : b;
      if (reduced) {
        emit(0, p.x, p.y + 0.08, p.z, r * 2, r * 2, 1, 0.65, c);
        return;
      }
      if (['projectile', 'dash', 'beam'].includes(e.primitive)) {
        const travel = Math.min(1, Math.max(0, (t - 0.12) / 0.65));
        const yaw = Math.atan2(b.x - o.x, b.z - o.z);
        const n = low ? 5 : 12;
        for (let j = 0; j < n; j++) {
          const u = e.primitive === 'beam' ? (j + 0.5) / n : Math.max(0, travel - j * 0.035);
          const w = (1 - j / n) * r * 0.24;
          emit(2, o.x + (b.x - o.x) * u, o.y + 0.7 + Math.sin(u * Math.PI) * r * 0.12,
            o.z + (b.z - o.z) * u, w, w, e.primitive === 'beam' ? Math.hypot(b.x - o.x, b.z - o.z) / n : r * (j === 0 ? 0.5 : 0.16),
            alpha * (1 - j / (n + 1)), c, yaw);
        }
        emit(0, o.x, o.y + 0.05, o.z, r, r, 1, alpha * 0.6, c, -t);
        // Endpoint flourish is arrival feedback, not an asserted gameplay hit.
        if (t > 0.77) {
          const k = (t - 0.77) / 0.23;
          emit(0, b.x, b.y + 0.07, b.z, r * (0.5 + k * 2), r * (0.5 + k * 2), 1, 1 - k, c);
        }
      } else if (e.primitive === 'shield') {
        emit(1, p.x, p.y + 0.85, p.z, r, r, r, alpha, c);
        emit(0, p.x, p.y + 0.06, p.z, r * 2.3, r * 2.3, 1, alpha, c, t * 0.25);
      } else {
        const expansion = e.primitive === 'burst' ? 0.3 + t * 1.8 : 0.9 + t * 0.25;
        emit(0, p.x, p.y + 0.06, p.z, r * 2 * expansion, r * 2 * expansion, 1, alpha, c, t * 0.18);
        emit(0, p.x, p.y + 0.09, p.z, r * 1.4, r * 1.4, 1, alpha * 0.55, c, -t * 0.3);
        const n = low ? 6 : 14;
        for (let j = 0; j < n; j++) {
          const angle = j * Math.PI * 2 / n;
          const distance = r * (e.primitive === 'burst' ? t * 1.4 : 0.72);
          const height = e.primitive === 'ground' ? Math.sin(t * Math.PI) * (0.7 + (j % 3) * 0.18) : 0.18;
          emit(2, p.x + Math.cos(angle) * distance, p.y + height,
            p.z + Math.sin(angle) * distance, r * 0.08, Math.max(0.08, height), r * 0.08, alpha * 0.8, c, angle);
        }
      }
    }
    // Combat Quality v1: readable phase layers on top of the authored choreography.
    //   cast   (progress < 0.3): ground marker at the caster; R adds a gold outer ring
    //   impact (progress > 0.65): expanding burst at the target; ring count differs per slot
    //          Q 1 ring / W ring + bright core / E 2 staggered rings / R 3 rings with a gold rim
    // Presentation only: reads the same event the choreography reads, emits into pool 0.
    function layers(e, slot) {
      if (reduced) return;
      const t = e.progress, r = e.radius, o = e.origin, b = e.target ?? e.origin;
      const gold = '#fbbf24';
      if (t < 0.3) {
        const k = t / 0.3, a = (1 - k) * 0.85;
        const cr = r * (0.7 + 0.3 * k) * 2;
        emit(0, o.x, o.y + 0.05, o.z, cr, cr, 1, a, e.color, k * 0.6);
        if (slot === 'R') emit(0, o.x, o.y + 0.06, o.z, r * 2.7, r * 2.7, 1, a * 0.8, gold, -k * 0.4);
      }
      if (t > 0.65) {
        const k = (t - 0.65) / 0.35, a = 1 - k;
        const rings = slot === 'R' ? 3 : (slot === 'E' || slot === 'W') ? 2 : 1;
        const grow = slot === 'R' ? 2.2 : 1.6;
        for (let i = 0; i < rings; i++) {
          const kk = Math.max(0, k - i * 0.18);
          const rr = r * (0.5 + kk * grow) * 2;
          const tint = slot === 'R' && i === rings - 1 ? gold : e.color;
          emit(0, b.x, b.y + 0.07 + i * 0.01, b.z, rr, rr, 1, a * (1 - i * 0.2), tint, kk);
        }
        if (slot === 'W') emit(0, b.x, b.y + 0.06, b.z, r * 0.9, r * 0.9, 1, a * 0.7, '#ffffff', 0);
      }
    }
    const preview = previewRef?.current;
    if (preview) {
      for (const event of preview.events) {
        const e = sampleSkillEvent(event, preview.time, scratch.sample);
        if (e) draw(e);
      }
    } else {
      for (const fx of frameRef?.current?.effects ?? []) {
        const e = fx.skillId ? adaptNamedHeroSkill(fx, scratch.sample) : adaptHeroAttack(fx, scratch.sample);
        if (e) {
          const before = fx.skillId ? [...counts] : null;
          if (fx.skillId) {
            const slot = skillSlotOf(fx.skillId);
            e.radius = skillScreenRadius(e.radius, slot, state.camera, state.size?.height);
            alphaGain = SKILL_READABILITY.alphaGain;
            draw(e);
            layers(e, slot);
          } else draw(e);
          alphaGain = 1;
          if (fx.skillId) {
            scratch.namedFrames++;
            if (counts.some((n, i) => n > before[i])) scratch.namedDrawnFrames++;
          }
        }
      }
    }
    meshes.current.forEach((mesh, i) => {
      if (!mesh) return;
      mesh.count = counts[i]; mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.attributes.tint.needsUpdate = true;
    });
    if (counts.some(n => n > 0)) scratch.activeFrames++;
    if (diagnosticsRef) diagnosticsRef.current = { counts: [...counts], cap, shieldCap, flameCap, dropped: scratch.dropped };
  });
  return <group name="hero-vfx-v1">{[0, 1, 2, 3, 4].map(i => <instancedMesh key={i}
    ref={mesh => { meshes.current[i] = mesh; }} args={[null, null, CAP]} frustumCulled={false}>
    {i === 0 || i === 4 ? <planeGeometry args={[1, 1]}><instancedBufferAttribute attach="attributes-tint" args={[attributes[i], 4]} /></planeGeometry>
      : i === 1 ? <sphereGeometry args={[1, 20, 12]}><instancedBufferAttribute attach="attributes-tint" args={[attributes[i], 4]} /></sphereGeometry>
        : i === 3 ? <boxGeometry args={[1, 1, 1]}><instancedBufferAttribute attach="attributes-tint" args={[attributes[i], 4]} /></boxGeometry>
        : <octahedronGeometry args={[1, 0]}><instancedBufferAttribute attach="attributes-tint" args={[attributes[i], 4]} /></octahedronGeometry>}
    <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={{ mode: { value: i } }}
      transparent depthWrite={false} side={i === 4 ? THREE.DoubleSide : THREE.FrontSide} forceSinglePass />
  </instancedMesh>)}</group>;
}
