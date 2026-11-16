import assert from 'node:assert/strict';
import {consumeFpsWeaponShot, fpsWeaponReadyAtMs} from '../src/battle/fps/fpsWeaponHandling.js';

const actor = {gun:'ak',ammo:12,reserveAmmo:30,dead:false,_objectiveLocked:true};
assert.equal(fpsWeaponReadyAtMs(actor,1000),Infinity);
const before=JSON.stringify(actor);
assert.equal(consumeFpsWeaponShot(actor,1000).fired,false,'objective-locked actor must not consume a shot');
assert.equal(JSON.stringify(actor),before,'pure helper must preserve input');
assert.equal(consumeFpsWeaponShot({...actor,_objectiveLocked:false},1000).fired,true);
assert.equal(consumeFpsWeaponShot({...actor,dead:true},1000).fired,false);
console.log('CS professional weapon authority: 4/4 PASS');
