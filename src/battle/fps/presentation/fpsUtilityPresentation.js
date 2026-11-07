import { createHeVfx } from "./fpsHeVfx.js";
import * as THREE from "three";
import { createOriginalUtilityModelFactory } from "./fpsUtilityModels.js";
import { fpsSmokeRadius, fpsSmokeAtSubframe } from '../fpsSmokeGeometry.js';
import {getSmokeField} from '../fpsSmokeDomain.js';
import {smokeFlightPoint} from '../fpsSmokeProjectile.js';
import {createSmokeSurface,createSmokeDepthMask} from './fpsSmokeSurface.js';

const SMOKE_LIFETIME_UNITS = 18;
const SMOKE_GROW_UNITS = 0.45;
const SMOKE_DISSIPATE_UNITS = 6;
const SMOKE_CLOUDS_PER_EVENT = 8;
const MAX_SMOKE_EVENTS = 4;
// Ten players can each carry one smoke. Dense blockers must cover every live
// authoritative cloud; decorative wisps keep their existing four-event cap.
const MAX_SMOKE_CORES = 10;
const MAX_THROWABLE_EVENTS = 12;
const MAX_HE_BURSTS = 4;
const MAX_FLASH_BURSTS = 8;
const MAX_MOLLY_EVENTS = 4;

// C5B is presentation-only.  The frame owns throw timing, landing, detonation,
// smoke LOS and flash gameplay; this module only presents those facts.
export const C5B_UTILITY_FX_CONTRACT = Object.freeze({
  version: "C5B.2",
  owner: "fpsUtilityPresentation",
  authority: "frame.throwables/frame.smokes/frame.mollys/frame.players",
  trajectory: "authoritative from/to/t/flightDurationSec/arcHeightUnits",
  smokeStages: ["grow", "hold", "dissipate"],
  smokeLifetimeUnits: SMOKE_LIFETIME_UNITS,
  smokeCloudsPerEvent: SMOKE_CLOUDS_PER_EVENT,
  caps: Object.freeze({
    smokeEvents: MAX_SMOKE_EVENTS,
    smokeCores: MAX_SMOKE_CORES,
    throwableEvents: MAX_THROWABLE_EVENTS,
    heBursts: MAX_HE_BURSTS,
    flashBursts: MAX_FLASH_BURSTS,
    mollyEvents: MAX_MOLLY_EVENTS,
  }),
  reducedMotion: "prefers-reduced-motion reduces pulses/debris, retains physical smoke/fire",
  cleanup: "idempotent dispose on map rebuild and unmount",
  postprocessing: "none",
});

const UTILITY_COLORS = Object.freeze({
  smoke: 0x9fa8ad,
  smokeDeep: 0x606a71,
  he: 0xf0a35b,
  heDust: 0x9f7755,
  flash: 0xf4f5e8,
  molly: 0xf06a35,
  mollyCore: 0xffd36a,
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hash(value) {
  let result = 2166136261;
  const text = String(value ?? "");
  for (let index = 0; index < text.length; index += 1) {
    result ^= text.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function finitePoint(point) {
  return point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));
}

function createPool(group, count, create) {
  const pool = [];
  for (let index = 0; index < count; index += 1) {
    const item = create(index);
    item.visible = false;
    item.frustumCulled = false;
    group.add(item);
    pool.push(item);
  }
  return pool;
}

function hidePool(pool) {
  for (let index = 0; index < pool.length; index += 1) pool[index].visible = false;
}

function sprite(group, map, color) {
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map,
    color,
    transparent: true,
    opacity: 0,
    depthTest: true,
    depthWrite: false,
    fog: true,
  }));
}

function mesh(group, geometry, color, options = {}) {
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthTest: options.depthTest ?? true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: options.blending ?? THREE.NormalBlending,
  }));
}

function setWorldPosition(object, W, x, y, z) {
  object.position.set(W.vx(x), y, W.vz(z));
}

function smokeStage(smoke) {
  const age = Math.max(0, Number(smoke?.age) || 0);
  const remaining = Math.max(0, Number(smoke?.tl) || 0);
  if (age < (smoke?.model==='continuous.v2'?1.5:SMOKE_GROW_UNITS)) return "grow";
  if (remaining > SMOKE_DISSIPATE_UNITS) return "hold";
  return "dissipate";
}

function smokeStrength(smoke) {
  const age = Math.max(0, Number(smoke?.age) || 0);
  const remaining = Math.max(0, Number(smoke?.tl) || 0);
  const grow = clamp(age / SMOKE_GROW_UNITS, 0, 1);
  const fade = clamp(remaining / SMOKE_DISSIPATE_UNITS, 0, 1);
  return { grow, fade, strength: Math.min(grow, fade) };
}

function trajectoryPoint(throwable, t, W, out) {
  const saved=smokeFlightPoint(throwable,t);if(saved){out.set(W.vx(saved[0]),saved[1],W.vz(saved[2]));return out;}
  const from = throwable.from;
  const to = throwable.to;
  const progress = clamp(t, 0, 1);
  const arc = Number(throwable.arcHeightUnits) || 4.5;
  const x = lerp(from.x, to.x, progress);
  const z = lerp(from.y, to.y, progress);
  out.set(W.vx(x), 0.72 + Math.sin(progress * Math.PI) * arc, W.vz(z));
  return out;
}

function typeColor(type) {
  if (type === "flash") return UTILITY_COLORS.flash;
  if (type === "he") return 0x39434a;
  if (type === "molly") return 0x66341f;
  return UTILITY_COLORS.smoke;
}

function setRing(ring, W, x, z, scale, opacity, color) {
  setWorldPosition(ring, W, x, 0.08, z);
  ring.rotation.x = -Math.PI / 2;
  ring.scale.setScalar(scale);
  ring.material.color.setHex(color);
  ring.material.opacity = opacity;
  ring.visible = false; // Owner: no ground utility circles; the physical FX carries the state.
}

function makeSmokeClouds(group, textures) {
  return createPool(group, MAX_SMOKE_EVENTS * SMOKE_CLOUDS_PER_EVENT, () => sprite(group, textures.smoke, UTILITY_COLORS.smoke));
}

function smokeDensityTexture(){
  const size=64,data=new Uint8Array(size*size*4);
  const random=(x,y)=>{const v=Math.sin((x%32)*127.1+(y%32)*311.7)*43758.5453;return v-Math.floor(v);};
  const noise=(x,y)=>{const ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy,u=tx*tx*(3-2*tx),v=ty*ty*(3-2*ty);return lerp(lerp(random(ix,iy),random(ix+1,iy),u),lerp(random(ix,iy+1),random(ix+1,iy+1),u),v);};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const cloud=noise(x/16,y/16)*.6+noise(x/8,y/8)*.25+noise(x/4,y/4)*.15;
    const v=Math.round(140+cloud*115),i=(y*size+x)*4;
    data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearFilter;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3,2);texture.needsUpdate=true;return texture;
}

// One shared bounded cloud mesh, with the same triangle budget as the old
// smooth sphere. Keep the eye-height R6 belt intact; sculpt only the caps
// inward so the physical shooting envelope is never made transparent.
function smokeVolumeGeometry(){
  const geometry=new THREE.SphereGeometry(1,24,12),p=geometry.attributes.position,colors=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),noise=.5+.5*Math.sin(x*11+y*7+z*13)*Math.cos(x*6-y*13+z*9),cap=clamp((Math.abs(y)-.25)/.75,0,1),shape=1-cap*(.06+.16*noise);
    p.setXYZ(i,x*shape,y*(1-cap*.12*noise),z*shape);
    const density=.62+.38*noise;colors.set([density,density,density],i*3);
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}

/**
 * Bounded utility presentation for the formal Battle runtime.
 * No gameplay state, camera state, RAF, shader or post-processing is owned here.
 */
export function createUtilityPresentation({ group, textures, sphereGeometry, sampleGroundHeight=()=>0, major=true }) {
  const reducedMotion = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  const geometries = {
    smokeCore: smokeVolumeGeometry(),
    marker: new THREE.RingGeometry(0.9, 1.08, 28),
    blastRing: new THREE.RingGeometry(0.42, 0.62, 20),
    debris: new THREE.BoxGeometry(0.18, 0.12, 0.42),
  };
  const utilityModels = createOriginalUtilityModelFactory();
  const densityTexture=smokeDensityTexture();
  const throwableModels = [];
  const pools = {
    // The old alpha billboards are edge wisps. An opaque bounded world volume
    // owns the same R6 active envelope as simulation, including the last tick.
    smokeCore: createPool(group,MAX_SMOKE_CORES,()=>{const m=new THREE.Mesh(geometries.smokeCore,new THREE.MeshBasicMaterial({color:0x929b9f,map:densityTexture,vertexColors:true,depthTest:true,depthWrite:true,side:THREE.FrontSide,fog:true}));m.name='fps-smoke-core';m.renderOrder=12;return m;}),
    smokeCloud: makeSmokeClouds(group, textures),
    smokeMarker: createPool(group, MAX_SMOKE_EVENTS, () => mesh(group, geometries.marker, UTILITY_COLORS.smoke, { depthTest: true })),
    throwableTrail: createPool(group, MAX_THROWABLE_EVENTS * 3, () => new THREE.Mesh(sphereGeometry, new THREE.MeshBasicMaterial({ color: UTILITY_COLORS.smokeDeep, transparent: true, opacity: 0, depthTest: true, depthWrite: false }))),
    throwable: createPool(group, MAX_THROWABLE_EVENTS, index => {const instance=utilityModels.createInstance();throwableModels.push(instance);instance.group.name='fps-utility-body-'+index;return instance.group;}),
    flashBurst: createPool(group, MAX_FLASH_BURSTS * 2, () => sprite(group, textures.flash, UTILITY_COLORS.flash)),
    flashHalo: createPool(group, MAX_FLASH_BURSTS, () => sprite(group, textures.glow, UTILITY_COLORS.flash)),
    mollyFire: createPool(group, MAX_MOLLY_EVENTS * 8, () => sprite(group, textures.fire, UTILITY_COLORS.molly)),
    mollyMarker: createPool(group, MAX_MOLLY_EVENTS, () => mesh(group, geometries.marker, UTILITY_COLORS.molly, { blending: THREE.AdditiveBlending })),
  };
  const heVfx = createHeVfx({group,smokeTexture:textures.smoke,reducedMotion});
  const legacyCoreMaterials=pools.smokeCore.map(m=>m.material),surfaces=new Map(),depthMasks=new Map();
  const surfaceFor=(field,W)=>{
    const key=field.world.space+':'+field.origin.x+':'+field.origin.y+':'+field.baseHeight;
    let item=surfaces.get(key);if(item){surfaces.delete(key);surfaces.set(key,item);return item;}
    const material=legacyCoreMaterials[0].clone();
    material.stencilWrite=true;material.stencilRef=1;material.stencilFunc=THREE.AlwaysStencilFunc;material.stencilWriteMask=1;material.stencilZPass=THREE.ReplaceStencilOp;
    item={...createSmokeSurface(field,W,material),material};surfaces.set(key,item);
    while(surfaces.size>16){const key=surfaces.keys().next().value,old=surfaces.get(key);old.dispose();old.material.dispose();surfaces.delete(key);}return item;
  };
  const point = new THREE.Vector3();
  const previousPoint = new THREE.Vector3();
  const evidence = {
    frameIndex: null,
    activeSmoke: 0,
    smokeStages: { grow: 0, hold: 0, dissipate: 0 },
    activeThrowables: 0,
    trajectorySamples: 0,
    heBursts: 0,
    flashBursts: 0,
    flashRecoverySamples: 0,
    mollyZones: 0,
    visibleMarkers: 0,
    reducedMotion,
    smokeOcclusion: "depth-tested-alpha-volume",
    authority: C5B_UTILITY_FX_CONTRACT.authority,
    poolCaps: C5B_UTILITY_FX_CONTRACT.caps,
  };
  let disposed = false;

  const update = ({ frame, nextFrame, time, W, frameIndex, sub = 0 }) => {
    if (disposed) return evidence;
    Object.values(pools).forEach(hidePool);
    evidence.frameIndex = frameIndex;
    evidence.utilityModels = utilityModels.diagnostics();
    evidence.activeSmoke = 0;
    evidence.activeSmokeCores = 0;
    evidence.smokeCoreOverflow = 0;
    evidence.smokeStages = { grow: 0, hold: 0, dissipate: 0 };
    evidence.activeThrowables = 0;
    evidence.trajectorySamples = 0;
    evidence.heVfx = heVfx.update({frame,nextFrame,sub,W,sampleGroundHeight});
    evidence.heBursts = evidence.heVfx.active;
    evidence.flashBursts = 0;
    evidence.flashRecoverySamples = 0;
    evidence.mollyZones = 0;
    evidence.visibleMarkers = 0;
    evidence.domainCells=0;evidence.domainTriangles=0;evidence.domainBuildMs=0;
    for(const mask of depthMasks.values())mask.mesh.visible=false;

    const sameRound = nextFrame && nextFrame.rnd === frame?.rnd;
    const mix = sameRound ? clamp(sub, 0, 1) : 0;
    const nextThrowables = new Map((sameRound ? nextFrame.throwables || [] : []).map((item) => [item.id, item]));
    const nextSmokes = new Map((sameRound ? nextFrame.smokes || [] : []).map((item) => [item.id, item]));
    const smokeClouds = pools.smokeCloud;
    let smokeCloudIndex = 0;
    let smokeMarkerIndex = 0;
    if(major)for(const savedSmoke of frame?.smokes||[]){
      const smoke=fpsSmokeAtSubframe(savedSmoke,nextSmokes.get(savedSmoke.id),sub);
      if(!(smoke.tl>0)||!finitePoint(smoke.pos))continue;
      const core=pools.smokeCore[evidence.activeSmokeCores];
      if(!core){evidence.smokeCoreOverflow++;continue;}
      const radius=fpsSmokeRadius(smoke);
      const field=getSmokeField(smoke);
      if(field){
        const surface=surfaceFor(field,W);core.geometry=surface.geometry;core.material=surface.material;core.position.set(0,0,0);core.scale.setScalar(1);
        evidence.domainTriangles+=surface.update(radius);evidence.domainCells+=field.cellCount;evidence.domainBuildMs+=field.buildMs;
        let mask=depthMasks.get(field.world.space);if(!mask){mask=createSmokeDepthMask(field.world,W);depthMasks.set(field.world.space,mask);group.add(mask.mesh);}mask.mesh.visible=radius>0;
      }else{
        core.geometry=geometries.smokeCore;core.material=legacyCoreMaterials[evidence.activeSmokeCores];
        core.position.set(W.vx(smoke.pos.x),sampleGroundHeight(W.vx(smoke.pos.x),W.vz(smoke.pos.y))+(smoke.model==='continuous.v2'?Math.min(1.56,.2+radius*.23):1.56),W.vz(smoke.pos.y));
        core.scale.set(radius,Math.min(3.3,.55+radius*.46),radius);
      }
      core.visible=radius>0;
      core.userData.smokeId=smoke.id;core.userData.authoritativeRadius=radius;
      evidence.activeSmokeCores++;
    }
    (frame?.smokes || []).slice(0, MAX_SMOKE_EVENTS).forEach((savedSmoke) => {
      const next = nextSmokes.get(savedSmoke.id);
      const smoke = savedSmoke.model==='continuous.v2'?fpsSmokeAtSubframe(savedSmoke,next,sub):{ ...savedSmoke,
        age: lerp(Number(savedSmoke.age) || 0, Number(next?.age ?? savedSmoke.age) || 0, mix),
        tl: lerp(Number(savedSmoke.tl) || 0, Number(next?.tl ?? (sameRound ? 0 : savedSmoke.tl)) || 0, mix) };
      if (!finitePoint(smoke.pos)) return;
      const stage = smokeStage(smoke);
      const { grow, fade, strength } = smokeStrength(smoke.model==='continuous.v2'?{...smoke,age:smoke.age*.3}:smoke);
      evidence.activeSmoke += 1;
      evidence.smokeStages[stage] += 1;
      const radius = Number.isFinite(smoke.radius)?fpsSmokeRadius(smoke):1.25 + 4.35 * grow;
      const field=getSmokeField(smoke);
      const cx = Number(smoke.pos.x);
      const cz = Number(smoke.pos.y);
      const seed = hash(smoke.id || `${cx}:${cz}`);
      const marker = pools.smokeMarker[smokeMarkerIndex++];
      if (marker) {
        setRing(marker, W, cx, cz, radius * (0.82 + 0.08 * fade), 0.34 * fade, UTILITY_COLORS.smoke);
        // Ground circles removed; no marker count increment.
      }
      for (let cloud = 0; cloud < SMOKE_CLOUDS_PER_EVENT; cloud += 1) {
        const item = smokeClouds[smokeCloudIndex++];
        if (!item) break;
        const angle = ((seed % 360) * Math.PI) / 180 + cloud * 0.79;
        const level = cloud % 4;
        const radial = radius * (0.18 + ((cloud * 37 + seed) % 67) / 100);
        const x = cx + Math.cos(angle) * radial;
        const z = cz + Math.sin(angle) * radial;
        const continuous=smoke.model==='continuous.v2';
        const emergence=continuous?Math.max(0,Math.min(1,(smoke.age-cloud*.06)/.7)):1;
        const y = continuous?.25+level*.65*grow:0.72 + level * (0.73 + 0.16 * grow);
        const scale = radius * (continuous?.42+.12*emergence:0.82 + ((cloud * 13 + seed) % 21) / 100);
        setWorldPosition(item, W, x, field?field.baseHeight+y:y, z);
        item.material.stencilWrite=Boolean(field);item.material.stencilRef=1;item.material.stencilFunc=THREE.EqualStencilFunc;item.material.stencilFuncMask=1;item.material.stencilWriteMask=0;item.renderOrder=field?13:0;
        item.scale.set(scale, scale * (1.02 + level * 0.08), 1);
        item.material.color.setHex(level % 3 === 0 ? UTILITY_COLORS.smokeDeep : UTILITY_COLORS.smoke);
        item.material.opacity = (continuous?.3*emergence:0.52 + (level === 1 ? 0.20 : 0.10)) * strength;
        item.visible = item.material.opacity > 0.005;
      }
    });

    const trail = pools.throwableTrail;
    let trailIndex = 0;
    let throwableIndex = 0;
    (frame?.throwables || []).slice(0, MAX_THROWABLE_EVENTS).forEach((throwable) => {
      if (!finitePoint(throwable.from) || !finitePoint(throwable.to)) return;
      evidence.activeThrowables += 1;
      const next = nextThrowables.get(throwable.id);
      const body = pools.throwable[throwableIndex++];
      const colour = typeColor(throwable.type);
      if (throwable.flying) {
        evidence.trajectorySamples += 1;
        const nextT = next?.flying ? Number(next.t) : Math.min(1, Number(throwable.t) + 0.5 / Math.max(0.1, Number(throwable.flightDurationSec) || 1.6));
        const t = clamp(lerp(Number(throwable.t) || 0, nextT, mix), 0, 1);
        trajectoryPoint(throwable, t, W, point);
        if (body) {
          body.position.copy(point);
          throwableModels[throwableIndex-1].setType(throwable.type);
          body.scale.setScalar(1); // Original, metre-scale grenade/bottle geometry.
          body.rotation.set(t * Math.PI * 6, t * Math.PI * 8, t * Math.PI * 4);
          body.visible = true;
        }
        for (let segment = 1; segment <= 3; segment += 1) {
          const tail = trail[trailIndex++];
          if (!tail) break;
          trajectoryPoint(throwable, Math.max(0, t - segment * 0.055), W, previousPoint);
          tail.position.copy(previousPoint);
          tail.scale.setScalar((0.28 - segment * 0.045) * (throwable.type === "flash" ? 1.08 : 1));
          tail.material.color.setHex(colour);
          tail.material.opacity = 0.42 - segment * 0.08;
          tail.visible = false; // No giant spherical projectile trail.
        }
        return;
      }

      const boom = clamp(lerp(Number(throwable.boom) || 0, Number(next?.boom ?? (sameRound ? 0 : throwable.boom)) || 0, mix) / 3, 0, 1);
      if(body&&finitePoint(throwable.to))setWorldPosition(body,W,throwable.to.x,throwable.flight?.landing?.[1]??.8,throwable.to.y);
      const visualSec=(frame.roundSec||0)+(sameRound?mix*Math.max(0,nextFrame.roundSec-frame.roundSec):0);
      const flashAge=Number.isFinite(throwable.detonatedAtRoundSec)?visualSec-throwable.detonatedAtRoundSec:Infinity;
      const flashWorldStrength=major?clamp(1-flashAge/.12,0,1):boom;
      if (throwable.type === "flash" && boom > 0 && flashWorldStrength>0 && evidence.flashBursts < MAX_FLASH_BURSTS) {
        const burstIndex = evidence.flashBursts;
        const phase = major?1-flashWorldStrength:1-boom;
        const burst = pools.flashBurst[burstIndex * 2];
        const core = pools.flashBurst[burstIndex * 2 + 1];
        if (burst) {
          setWorldPosition(burst, W, throwable.to.x, sampleGroundHeight(W.vx(throwable.to.x),W.vz(throwable.to.y))+1.2, throwable.to.y);
          const scale = major?.7+phase*.25:1.4+phase*7.2;
          burst.scale.set(scale, scale, 1);
          burst.material.opacity = 0.82 * flashWorldStrength;
          burst.visible = true;
        }
        if (core) {
          setWorldPosition(core, W, throwable.to.x, sampleGroundHeight(W.vx(throwable.to.x),W.vz(throwable.to.y))+1.15, throwable.to.y);
          core.scale.setScalar(major?.4+phase*.15:.8+phase*3.5);
          core.material.color.setHex(0xffffff);
          core.material.opacity = 0.68 * flashWorldStrength;
          core.visible = true;
        }
        evidence.flashBursts += 1;
        // Ground circles removed; no marker count increment.
      }
    });

    let flashHaloIndex = 0;
    (frame?.players || []).forEach((player) => {
      if (!finitePoint(player.pos)) return;
      const flashStrength = clamp(player.blindSec != null ? Number(player.blindSec) / 12 : (Number(player.flash) || 0) / 6, 0, 1);
      if (flashStrength <= 0 || flashHaloIndex >= MAX_FLASH_BURSTS) return;
      const halo = pools.flashHalo[flashHaloIndex++];
      setWorldPosition(halo, W, player.pos.x, 1.38, player.pos.y);
      halo.scale.setScalar(1.0 + flashStrength * 3.2);
      halo.material.opacity = 0.13 + flashStrength * 0.42;
      halo.material.color.setHex(UTILITY_COLORS.flash);
      halo.visible = !major;
      evidence.flashRecoverySamples += 1;
    });

    let mollyMarkerIndex = 0;
    let mollyFireIndex = 0;
    (frame?.mollys || []).slice(0, MAX_MOLLY_EVENTS).forEach((molly) => {
      if (!finitePoint(molly.pos)) return;
      const fade = clamp((Number(molly.tl) || 0) / 8, 0, 1);
      const marker = pools.mollyMarker[mollyMarkerIndex++];
      if (marker) {
        setRing(marker, W, molly.pos.x, molly.pos.y, 1.6, 0.42 * fade, UTILITY_COLORS.molly);
        // Ground circles removed; no marker count increment.
      }
      evidence.mollyZones += 1;
      for (let flame = 0; flame < 8; flame += 1) {
        const item = pools.mollyFire[mollyFireIndex++];
        if (!item) break;
        const seed = hash(`${molly.id}:${flame}`);
        const angle = (seed % 360) * Math.PI / 180 + time * 0.5;
        const radius = 0.28 + (seed % 11) / 8;
        setWorldPosition(item, W, molly.pos.x + Math.cos(angle) * radius, 0.42 + (flame % 3) * 0.35, molly.pos.y + Math.sin(angle) * radius);
        const scale = 0.7 + ((seed % 7) / 14);
        item.scale.set(scale, scale * 1.35, 1);
        item.material.color.setHex(flame % 2 ? UTILITY_COLORS.molly : UTILITY_COLORS.mollyCore);
        item.material.opacity = (0.34 + (flame % 3) * 0.07) * fade;
        item.visible = item.material.opacity > 0.004;
      }
    });

    return evidence;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    Object.values(pools).forEach((pool) => pool.forEach((item) => {
      item.parent?.remove(item);
      if(!pools.smokeCore.includes(item))item.material?.dispose?.();
    }));
    heVfx.dispose();
    utilityModels.dispose();
    for(const item of surfaces.values()){item.dispose();item.material.dispose();}surfaces.clear();
    for(const mask of depthMasks.values())mask.dispose();depthMasks.clear();
    legacyCoreMaterials.forEach(m=>m.dispose());
    densityTexture.dispose();
    Object.values(geometries).forEach((geometry) => geometry.dispose?.());
  };

  return {
    update,
    dispose,
    diagnostics: () => ({ ...evidence, smokeStages: { ...evidence.smokeStages }, poolCaps: { ...evidence.poolCaps } }),
    contract: C5B_UTILITY_FX_CONTRACT,
    reducedMotion,
  };
}
