import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { readFpsRigTestAssets } from './lib/fpsRigTestAssets.mjs';
import { getFpsWeaponPoseMask, getFpsMaskedPoseClip } from '../src/battle/fps/presentation/fpsWeaponPoseLayers.js';

const assets = await readFpsRigTestAssets();
let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.log(`FAIL ${name}: ${error.stack || error.message}`); }
}
function fixture(options, fn) {
  const f = assets.make(options);
  try { fn(f); } finally { f.dispose(); }
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
const moving = f => ({ ...f.player, state: 'ROTATE', pos: { x: 19, y: 23 } });
const clip = name => assets.clips.find(c => c.name === name);
const snapshot = () => JSON.stringify(assets.clips.map(c => [c.name, c.duration, c.tracks.map(t => [t.name, Array.from(t.times), Array.from(t.values)])]));
const originalClips = snapshot();

try {
  check('真 GLB spine 子樹完整包含 53 根上半身骨', () => fixture({}, f => {
    const mask = getFpsWeaponPoseMask(f.c.model);
    assert.equal(mask.upperBones.size, 53);
    for (const name of ['spine_01', 'spine_03', 'hand_r', 'hand_l', 'Head']) assert.ok(mask.upperBones.has(name));
    for (const name of ['root', 'pelvis', 'thigh_r', 'foot_l']) assert.ok(!mask.upperBones.has(name));
  }));
  for (const name of ['Idle_Loop', 'Walk_Loop', 'Sprint_Loop', 'Jog_Fwd_Loop', 'Pistol_Shoot']) check(`${name} 上下層 tracks 互斥且聯集完整`, () => fixture({}, f => {
    const source = clip(name), mask = getFpsWeaponPoseMask(f.c.model);
    const upper = getFpsMaskedPoseClip(source, mask, true), lower = getFpsMaskedPoseClip(source, mask, false);
    const top = new Set(upper.tracks);
    assert.ok(lower.tracks.every(t => !top.has(t)));
    assert.equal(upper.tracks.length + lower.tracks.length, source.tracks.length);
    assert.ok([...upper.tracks, ...lower.tracks].every(t => source.tracks.includes(t)));
    assert.equal(upper.duration, source.duration); assert.equal(lower.duration, source.duration);
  }));
  check('跨角色 masked clip 共用，但 action／mixer 不共用', () => fixture({}, f => fixture({}, g => {
    f.update(); g.update();
    assert.equal(f.c.poseLayers.upperAction.getClip(), g.c.poseLayers.upperAction.getClip());
    assert.notEqual(f.c.poseLayers.upperAction, g.c.poseLayers.upperAction);
    assert.notEqual(f.c.mixer, g.c.mixer);
    const time = g.c.poseLayers.upperAction.time;
    f.update(); assert.equal(g.c.poseLayers.upperAction.time, time);
  })));
  check('移動保留 Sprint 下半身，ready 上半身不擺槍', () => fixture({}, f => {
    f.update({ player: moving(f), previousPlayer: f.player });
    assert.equal(f.c.poseLayers.lowerName, 'Sprint_Loop');
    assert.equal(f.c.poseLayers.upperName, 'Pistol_Idle_Loop');
    assert.ok(f.c.poseLayers.upperAction.getClip().tracks.every(t => f.c.poseLayers.mask.upperBones.has(THREE.PropertyBinding.parseTrackName(t.name).nodeName)));
  }));
  check('HOLD 與 ENGAGE 使用真 aim clip', () => fixture({}, f => {
    for (const state of ['HOLD', 'ENGAGE']) {
      f.update({ player: { ...f.player, state } });
      assert.equal(f.c.poseLayers.upperName, 'Pistol_Aim_Neutral');
    }
  }));
  for (const gun of ['usp', 'mp9', 'm4', 'awp', 'nova']) check(`${gun} 跑射腿部相位不重置且真手骨槍口有效`, () => fixture({ gun }, f => fixture({ gun }, reference => {
    const p = moving(f), r = moving(reference);
    for (let i = 0; i < 5; i++) {
      f.update({ player: p, previousPlayer: f.player, frameIndex: 10 });
      reference.update({ player: r, previousPlayer: reference.player, frameIndex: 10 });
    }
    const before = f.c.poseLayers.lowerAction.time;
    f.update({ player: { ...p, shooting: 1 }, previousPlayer: f.player, frameIndex: 11 });
    reference.update({ player: r, previousPlayer: reference.player, frameIndex: 11 });
    assert.equal(f.c.poseLayers.lowerName, 'Sprint_Loop');
    assert.equal(f.c.poseLayers.upperName, 'Pistol_Shoot');
    near(f.c.poseLayers.lowerAction.time, before + .05);
    for (const bone of ['pelvis', 'thigh_r', 'calf_l', 'foot_r']) {
      const actual = f.c.model.getObjectByName(bone), expected = reference.c.model.getObjectByName(bone);
      assert.ok(actual && expected, bone);
      assert.ok(actual.quaternion.angleTo(expected.quaternion) < 1e-5, bone);
      near(actual.position.distanceTo(expected.position), 0);
    }
    const origin = f.c.getMuzzleWorldPosition(new THREE.Vector3());
    const direction = f.c.getMuzzleWorldDirection(new THREE.Vector3());
    assert.ok(origin && direction && origin.toArray().every(Number.isFinite)); near(direction.length(), 1);
    assert.ok(direction.x > .75);
  })));
  check('同一真射擊 edge 不重啟；下一 edge 可重啟', () => fixture({}, f => {
    const p = moving(f), shot = { ...p, shooting: 1 };
    f.update({ player: shot, previousPlayer: p, frameIndex: 11 });
    const action = f.c.poseLayers.upperAction;
    f.update({ player: shot, previousPlayer: p, frameIndex: 11 }); near(action.time, .1);
    f.update({ player: p, previousPlayer: shot, frameIndex: 12 });
    f.update({ player: shot, previousPlayer: p, frameIndex: 13 }); near(action.time, .05);
  }));
  check('射擊結束返回持槍而非放下武器', () => fixture({}, f => {
    const p = moving(f);
    f.update({ player: { ...p, shooting: 1 }, previousPlayer: f.player, frameIndex: 11 });
    for (let i = 0; i < 8; i++) f.update({ player: p, previousPlayer: f.player, frameIndex: 12 });
    assert.equal(f.c.poseLayers.upperName, 'Pistol_Idle_Loop'); assert.equal(f.c.poseLayers.lowerName, 'Sprint_Loop');
  }));
  check('暫停同時凍結兩層、淡出與 timer', () => fixture({}, f => {
    const p = moving(f);
    f.update({ player: p, previousPlayer: f.player });
    f.update({ player: { ...p, shooting: 1 }, previousPlayer: p, frameIndex: 11 });
    const before = JSON.stringify(f.c.poseLayers.diagnostics()), time = f.c.mixer.time, timer = f.c.fireTimer;
    for (let i = 0; i < 10; i++) f.update({ player: { ...p, shooting: 1 }, previousPlayer: p, frameIndex: 11, playbackActive: false });
    assert.equal(JSON.stringify(f.c.poseLayers.diagnostics()), before); assert.equal(f.c.mixer.time, time); assert.equal(f.c.fireTimer, timer);
  }));
  check('暫停 seek 立即顯示 aim，而非 bind pose 或零權重淡入', () => fixture({}, f => {
    f.update({ player: moving(f), previousPlayer: f.player });
    f.update({ player: f.player, previousPlayer: f.player, frameIndex: 50, seekNonce: 1, playbackActive: false });
    assert.equal(f.c.poseLayers.upperName, 'Pistol_Aim_Neutral');
    assert.equal(f.c.poseLayers.upperAction.getEffectiveWeight(), 1); assert.equal(f.c.poseLayers.lowerAction.getEffectiveWeight(), 1);
    near(f.c.poseLayers.upperAction.time, 0);
  }));
  check('受擊使用原全身 Hit_Chest，結束後才恢復雙層', () => fixture({}, f => {
    f.update(); const hurt = { ...f.player, hp: 60 };
    f.update({ player: hurt, previousPlayer: f.player, frameIndex: 11 });
    assert.equal(f.c.poseLayers.active, false); assert.equal(f.c.currentAction, 'Hit_Chest');
    for (let i = 0; i < 12; i++) f.update({ player: hurt, previousPlayer: hurt, frameIndex: 12 });
    assert.equal(f.c.poseLayers.active, true); assert.equal(f.c.poseLayers.upperName, 'Pistol_Aim_Neutral');
  }));
  check('死亡停止雙層、保留原 Death01 及地形接地', () => fixture({ floor: 2.4 }, f => {
    f.update(); const dead = { ...f.player, hp: 0, dead: true, state: 'DEAD' };
    f.update({ player: dead, previousPlayer: f.player, frameIndex: 11 });
    for (let i = 0; i < 40; i++) f.update({ player: dead, previousPlayer: dead, frameIndex: 12 });
    assert.equal(f.c.poseLayers.active, false); assert.equal(f.c.currentAction, 'Death01'); near(f.c.deathGroundContactY, 2.4);
    assert.ok(f.c.actions.get('Death01').getClip().tracks.some(t => t.name === 'pelvis.position'));
  }));
  check('回合重置清除兩層及動作 latch，復活可重新持槍', () => fixture({}, f => {
    f.update(); f.c.resetForRound(2);
    assert.equal(f.c.poseLayers.active, false); assert.equal(f.c.poseLayers.lowerAction, null); assert.equal(f.c.poseLayers.upperAction, null);
    f.update({ frameRound: 2 }); assert.equal(f.c.poseLayers.active, true);
  }));
  check('淡出 action 有界且 dispose 全部停止', () => fixture({}, f => {
    for (let i = 0; i < 120; i++) {
      const p = i % 2 ? moving(f) : f.player;
      f.update({ player: { ...p, shooting: i % 3 === 0 ? 1 : 0 }, previousPlayer: p, frameIndex: 10 + i });
      assert.ok(f.c.poseLayers.diagnostics().retiringActions <= 4);
    }
    f.c.dispose(); assert.equal(f.c.poseLayers.active, false); assert.equal(f.c.mixer._nActiveActions, 0);
  }));
  check('legacy 不建立雙層，保留原全身 Sprint／Pistol_Shoot', () => fixture({ optimized: false }, f => {
    const p = moving(f); f.update({ player: p, previousPlayer: f.player }); assert.equal(f.c.currentAction, 'Sprint_Loop');
    f.update({ player: { ...p, shooting: 1 }, previousPlayer: p, frameIndex: 11 });
    assert.equal(f.c.currentAction, 'Pistol_Shoot'); assert.equal(f.c.poseLayers, null);
  }));
  check('不新增 Mesh／材質／geometry／燈光或改權威 frame', () => fixture({}, f => {
    const resources = () => { const list = []; f.c.root.traverse(o => { if (o.isMesh) list.push([o.uuid, o.geometry.uuid, Array.isArray(o.material) ? o.material.map(m => m.uuid) : o.material.uuid]); if (o.isLight) list.push(o.uuid); }); return JSON.stringify(list); };
    const before = resources(), frame = JSON.stringify(f.player); f.update(); f.update({ player: moving(f), previousPlayer: f.player });
    assert.equal(resources(), before); assert.equal(JSON.stringify(f.player), frame);
  }));
  check('共用 clip cache 僅用 major；不新增蹲下／換彈假事件', () => {
    const renderer = fs.readFileSync(new URL('../src/battle/fps/presentation/FpsCharacterRenderer.js', import.meta.url), 'utf8');
    assert.match(renderer, /clipMap\(animationLibrary, optimized\)/);
    assert.match(renderer, /if \(optimized && !controller\.poseLayers\)/);
    // B7 now has authoritative handling fields. Preserve the original
    // no-fake-events guarantee with actual legacy/missing-authority fixtures.
    fixture({}, f => {
      const p={...f.player,stance:'crouched',reloading:true,reloadStartedAtMs:0,reloadEndsAtMs:3000};
      f.update({player:p,roundTimeMs:1500});
      assert.ok(!f.c.poseLayers.lowerName.startsWith('Crouch'));
      assert.notEqual(f.c.poseLayers.upperName,'Pistol_Reload');
    });
    fixture({optimized:false}, f => {
      f.update({player:{...f.player,weaponHandlingVersion:1,stance:'crouched',reloading:true,reloadStartedAtMs:0,reloadEndsAtMs:3000},roundTimeMs:1500});
      assert.ok(!f.c.poseLayers?.active);
      assert.notEqual(f.c.currentAction,'Pistol_Reload');
      assert.ok(!f.c.currentAction.startsWith('Crouch'));
    });
  });
  check('來源 GLB bytes 及共享 tracks 完全不變', () => { assert.ok(assets.unchanged()); assert.equal(snapshot(), originalClips); });
} finally { assets.dispose(); }
console.log(`CS Major Weapon Pose Layers B4: ${passed}/${passed + failed} PASS`);
if (failed) process.exitCode = 1;
