import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { readFpsRigTestAssets } from './lib/fpsRigTestAssets.mjs';
import { createFpsPovShotClock, cloneFpsPovWeaponVariant, createMajorFpsPovWeapon } from '../src/battle/fps/presentation/fpsPovWeapon.js';
const assets = await readFpsRigTestAssets(); let passed = 0, failed = 0;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
function check(name, fn) { try { fn(); passed++; console.log(`PASS ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.stack || e.message}`); } }
function fixture(fn) { const f = assets.make(); try { fn(f); } finally { f.dispose(); } }
const snapshot = source => { const rows = []; source.traverse(o => rows.push([o.uuid, o.position.toArray(), o.quaternion.toArray(), o.scale.toArray(), o.visible, o.geometry?.uuid, o.material?.uuid])); return JSON.stringify(rows); };
const sim = {}, event = { eventId: 'real-1', shotAtMs: 1050 }, defaults = { sim, seekNonce: 0, round: 1, frameIndex: 10, actorId: 'ct1', active: true, playing: true, dt: .05 };
function shotClock() { const c = createFpsPovShotClock(); c.update(defaults); return c; }
try {
  for (const [family, length] of Object.entries({ pistol: .43, smg: .61, rifle: .84, sniper: 1.04, shotgun: .83 })) {
    check(`${family} 真模型與素材共用、來源不變`, () => fixture(f => {
      const source = f.c.c2c.weaponGroups[family], before = snapshot(source), variant = cloneFpsPovWeaponVariant(source, family);
      assert.ok(variant && variant.meshes > 0 && variant.meshes + 5 <= 12);
      const originals = new Map(); source.traverse(o => { if (o.isMesh) originals.set(o.name, o); });
      variant.group.traverse(o => { if (!o.isMesh) return; const original = originals.get(o.name); assert.equal(o.geometry, original.geometry); assert.equal(o.material, original.material); assert.equal(o.castShadow, false); });
      assert.equal(snapshot(source), before); assert.notEqual(variant.group, source);
    }));
    check(`${family} 真 grip 與 muzzle 座標、尺寸及 forward`, () => fixture(f => {
      const v = cloneFpsPovWeaponVariant(f.c.c2c.weaponGroups[family], family);
      const grip = v.group.getObjectByName(`ESMO_${family}_GripSocket`), muzzle = v.muzzle;
      const p = grip.position.clone().applyMatrix4(v.group.matrix), m = muzzle.position.clone().applyMatrix4(v.group.matrix);
      near(p.distanceTo(new THREE.Vector3(.22, -.30, -.67)), 0); near(p.z - m.z, length);
      const direction = new THREE.Vector3(1, 0, 0).transformDirection(v.group.matrix); near(direction.z, -1);
    }));
  }
  check('五族 geometry 形狀不是同一模型縮放', () => fixture(f => {
    const shapes = Object.values(f.c.c2c.weaponGroups).map(g => { const n = []; g.traverse(o => { if (o.isMesh) n.push([o.name, o.geometry.attributes.position.count, o.geometry.index?.count]); }); return JSON.stringify(n); });
    assert.equal(new Set(shapes).size, 5);
  }));
  check('缺真 socket 誠實不建立替代武器', () => { assert.equal(cloneFpsPovWeaponVariant(new THREE.Group(), 'rifle'), null); assert.equal(cloneFpsPovWeaponVariant(new THREE.Group(), 'unknown'), null); });
  check('首次進入現有射擊幀不補歷史', () => { const c = createFpsPovShotClock(), r = c.update({ ...defaults, event }); assert.equal(r.fireCount, 0); assert.equal(r.recoil, 0); assert.equal(r.activeShot, false); });
  check('真新event只觸發一次並保留shotAtMs', () => { const c = shotClock(), a = c.update({ ...defaults, event }); assert.equal(a.fireCount, 1); assert.equal(a.lastAuthoritativeFire.shotAtMs, 1050); assert.equal(a.recoil, 1); const b = c.update({ ...defaults, event }); assert.equal(b.fireCount, 1); near(b.age, .05); });
  check('暫停凍結clock、flash及recoil，resume才衰退', () => { const c = shotClock(), a = c.update({ ...defaults, event }); for (let i = 0; i < 20; i++) assert.deepEqual(c.update({ ...defaults, event, playing: false }), a); const b = c.update({ ...defaults, event }); near(b.age, .05); assert.ok(b.recoil < 1); });
  check('暫停看到新event不派送，resume不補歷史', () => { const c = shotClock(); c.update({ ...defaults, event, playing: false }); assert.equal(c.update({ ...defaults, event }).fireCount, 0); });
  check('seek／倒帶／換人／回合／sim切換清除舊kick', () => {
    for (const change of [{ seekNonce: 1 }, { frameIndex: 9 }, { actorId: 't1' }, { round: 2 }, { sim: {} }]) { const c = shotClock(); c.update({ ...defaults, event }); const r = c.update({ ...defaults, event: { ...event, eventId: 'new' }, ...change }); assert.equal(r.recoil, 0); assert.equal(r.activeShot, false); assert.equal(r.fireCount, 1); }
  });
  check('離開POV／死亡清flash、重新進入不補現有幀', () => { const c = shotClock(); c.update({ ...defaults, event }); assert.equal(c.update({ ...defaults, event, active: false }).activeShot, false); assert.equal(c.update({ ...defaults, event }).recoil, 0); });
  check('落後實際shot超過flash壽命不重放完整kick', () => { const c = shotClock(), r = c.update({ ...defaults, event, eventAgeSec: .3 }); assert.equal(r.recoil, 0); assert.equal(r.activeShot, false); assert.equal(r.fireCount, 1); });
  check('高倍dt、非有限dt有界，不改權威事件', () => { const c = shotClock(), before = JSON.stringify(event); c.update({ ...defaults, event }); const a = c.update({ ...defaults, dt: 99, event }); near(a.age, .25); const b = c.update({ ...defaults, dt: NaN, event }); near(b.age, .25); assert.equal(JSON.stringify(event), before); });
  check('產品五族切換flash貼真muzzle，不新增light／texture', () => fixture(f => {
    const camera = new THREE.PerspectiveCamera(), pov = createMajorFpsPovWeapon(camera), live = { sim, seekNonce: 0, fIdx: 10, playing: true, speed: 1 };
    try { for (const family of ['pistol', 'smg', 'rifle', 'sniper', 'shotgun']) {
      pov.update({ frame: { rnd: 1, ts: 1, muzzles: [] }, chase: { ...f.player, alive: true }, weaponGroups: f.c.c2c.weaponGroups, pov: true, live, family, dt: .05 });
      assert.equal(pov.diagnostics.family, family); assert.equal(pov.diagnostics.visible, true); assert.ok(pov.diagnostics.weaponParts + pov.diagnostics.ownedParts <= 12); assert.ok(pov.diagnostics.muzzleLocal[2] < -.67);
      camera.traverse(o => { assert.ok(!o.isLight); if (o.isMesh) assert.ok(!o.material.map); });
    }} finally { pov.dispose(); }
  }));
  check('原生幀內shotAtMs尚未到不提前顯示fire', () => fixture(f => {
    const pov = createMajorFpsPovWeapon(new THREE.PerspectiveCamera()), live = { sim, seekNonce: 0, fIdx: 10, playing: true, speed: 1 }, chase = { ...f.player, alive: true, rigged: f.c };
    try { pov.update({ frame: { rnd: 1, ts: 1, muzzles: [] }, chase, weaponGroups: f.c.c2c.weaponGroups, pov: true, live, family: 'rifle', dt: .05 });
      const frame = { rnd: 1, ts: 1, muzzles: [{ ...event, attackerId: 'ct1', shotAtMs: 1150 }] };
      pov.update({ frame, chase, weaponGroups: f.c.c2c.weaponGroups, pov: true, live, family: 'rifle', dt: .05, frameAgeSec: .1 }); assert.equal(pov.fireCount, 0);
      pov.update({ frame, chase, weaponGroups: f.c.c2c.weaponGroups, pov: true, live, family: 'rifle', dt: .05, frameAgeSec: .15 }); assert.equal(pov.fireCount, 1); assert.equal(pov.flash.visible, true);
    } finally { pov.dispose(); }
  }));
  check('POV dispose只釋放私有資源，不釋放人物共享資產', () => fixture(f => {
    const camera = new THREE.PerspectiveCamera(), pov = createMajorFpsPovWeapon(camera); let sharedDisposals = 0, ownDisposals = 0;
    const geometries = new Set(), materials = new Set();
    f.c.c2c.weaponGroups.rifle.traverse(o => { if (o.isMesh) { geometries.add(o.geometry); materials.add(o.material); } });
    for (const resource of [...geometries, ...materials]) resource.addEventListener('dispose', () => sharedDisposals++);
    pov.group.traverse(o => { if (o.isMesh) { o.geometry.addEventListener('dispose', () => ownDisposals++); o.material.addEventListener('dispose', () => ownDisposals++); } });
    pov.update({ frame: { rnd: 1, ts: 0, muzzles: [] }, chase: { ...f.player, alive: true }, weaponGroups: f.c.c2c.weaponGroups, pov: true, live: { sim, fIdx: 0, seekNonce: 0, playing: false }, family: 'rifle', dt: .05 });
    pov.dispose(); const n = ownDisposals; pov.dispose(); assert.equal(sharedDisposals, 0); assert.ok(n > 0); assert.equal(ownDisposals, n); assert.equal(camera.children.length, 0);
  }));
  check('major採新模型／私有清理，legacy保留原12部分與牆鐘', () => {
    const s = fs.readFileSync(new URL('../src/battle/fps/EsportsFPS3D.jsx', import.meta.url), 'utf8');
    assert.match(s, /sceneVersion==="legacy"\?createFpsPovWeapon\(camera\):createMajorFpsPovWeapon\(camera\)/); assert.match(s, /if\(st\?\.povWeapon\?\.major\)st\.povWeapon\.dispose\(\)/); assert.ok(s.includes('weapon.fireAt=st.time')); assert.ok(s.includes('weaponParts:12'));
    assert.ok(s.includes('st.players.find(player=>player.id===ch.id)')); assert.ok(s.includes('weaponGroups:actor?.rigged?.c2c?.weaponGroups'));
    assert.ok(s.includes('if(sceneVersion!=="legacy")scene.add(camera)'));
  });
  check('真GLB原磁碟資料不變', () => assert.ok(assets.unchanged()));
} finally { assets.dispose(); }
console.log(`CS Major POV Weapon B5: ${passed}/${passed + failed} PASS`); if (failed) process.exitCode = 1;
