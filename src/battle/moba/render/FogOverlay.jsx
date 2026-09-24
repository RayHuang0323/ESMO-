// ============================================================================
//  render/FogOverlay.jsx — 戰爭迷霧的地面覆蓋（feature/moba-spectacle-vision）
//
//  讀 frameRef.current.fog.sources（applyFogToFrame 每幀衍生的視野圈），在地圖上蓋一層
//  暗色：視野圈內透明、邊緣柔和過渡、圈外壓暗。一張平面＋一個 shader，uniform 每幀更新，
//  不配置任何物件。沒有 frame.fog（迷霧關閉）⇒ 不畫。純呈現。
// ============================================================================
import React, { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { simToWorld, WORLD_BOUNDS } from "../map/coordinateMapping.js";
import { LAYER_Y } from "../map/mapVisualStyle.js";
import { FOG_MAX_SOURCES } from "../presentation/fogOfWar.js";

const GROUND_Y = Number.isFinite(LAYER_Y.lane_surface) ? LAYER_Y.lane_surface : 0;

const vert = `varying vec2 vXZ; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vXZ=w.xz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const frag = `
uniform vec3 src[${FOG_MAX_SOURCES}]; uniform int count; uniform float strength; uniform vec3 tint;
varying vec2 vXZ;
void main(){
  float m = 99.0;
  for (int i = 0; i < ${FOG_MAX_SOURCES}; i++) { if (i >= count) break; vec3 s = src[i]; m = min(m, length(vXZ - s.xy) / max(s.z, 0.001)); }
  float a = strength * smoothstep(0.78, 1.0, m);
  if (a < 0.01) discard;
  gl_FragColor = vec4(tint, a);
}`;

export default function FogOverlay({ frameRef }) {
  const { mesh, uniforms } = useMemo(() => {
    const a = simToWorld({ x: WORLD_BOUNDS.minX, y: WORLD_BOUNDS.minY }), b = simToWorld({ x: WORLD_BOUNDS.maxX, y: WORLD_BOUNDS.maxY });
    const w = Math.abs(b.x - a.x) * 1.15, h = Math.abs(b.z - a.z) * 1.15;
    const uniforms = {
      src: { value: Array.from({ length: FOG_MAX_SOURCES }, () => new THREE.Vector3()) },
      count: { value: 0 }, strength: { value: 0.62 }, tint: { value: new THREE.Color("#070b14") },
    };
    const material = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, transparent: true, depthWrite: false });
    const geometry = new THREE.PlaneGeometry(w, h);
    const m = new THREE.Mesh(geometry, material);
    m.rotation.x = -Math.PI / 2;
    m.position.set((a.x + b.x) / 2, GROUND_Y + 0.35, (a.z + b.z) / 2);
    m.renderOrder = 8; m.frustumCulled = false;
    m.userData.part = "fog-overlay";
    return { mesh: m, uniforms };
  }, []);
  useEffect(() => () => { mesh.geometry.dispose(); mesh.material.dispose(); }, [mesh]);
  useFrame(() => {
    const fog = frameRef?.current?.fog;
    mesh.visible = !!fog;
    if (!fog) return;
    const n = Math.min(FOG_MAX_SOURCES, fog.sources.length);
    for (let i = 0; i < n; i++) { const s = fog.sources[i]; uniforms.src.value[i].set(s.x, s.z, s.r); }
    uniforms.count.value = n;
  });
  return <primitive object={mesh} />;
}
