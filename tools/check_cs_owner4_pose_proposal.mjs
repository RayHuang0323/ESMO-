#!/usr/bin/env node
// Unit proposal counterexamples only. No real GLB pose or visual acceptance claim.
import assert from 'node:assert/strict';
import {deriveOwner4PoseProposal as derive,owner4AimingSemantic as aim} from './lib/csOwner4PoseProposal.mjs';
let checks=0;const ck=(label,run)=>{run();checks++;console.log('PASS '+label);};
const p={id:'p',state:'HOLD',lastUtilityAtSec:20,lastUtilityType:'smoke'},event={id:'actual-type-unit',type:'utility-throw',playerId:'p',round:2,roundSec:20,utility:'smoke'};
ck('True saved upcoming throw provides draw without changing release time',()=>{const r=derive({player:{id:'p'},roundSec:19.9,frameRound:1,nextEvents:[event]});assert.equal(r.phase,'draw');assert.equal(r.heldUtility,'smoke');assert.equal(r.releaseAtRoundSec,20);});
ck('Missing future authority never fabricates a draw phase',()=>assert.equal(derive({player:{id:'p'},roundSec:19.9,frameRound:1}).active,false));
ck('Release at exact saved time removes held projectile',()=>{const r=derive({player:p,roundSec:20,frameRound:1,events:[event]});assert.equal(r.phase,'release');assert.equal(r.heldUtility,null);assert.equal(r.weight,1);});
ck('Saved lastUtility bridges a later snapshot into finite recovery',()=>{const r=derive({player:p,roundSec:20.3,frameRound:1});assert.equal(r.phase,'recover');assert(r.weight>0&&r.weight<1);});
ck('Old throw expires to firearm ownership',()=>{const r=derive({player:p,roundSec:20.56,frameRound:1});assert.equal(r.active,false);assert.equal(r.disableWeaponGrip,false);});
ck('Wrong actor event cannot animate this actor',()=>assert.equal(derive({player:{id:'other'},roundSec:20,events:[event]}).active,false));
ck('Wrong round event cannot leak across round change',()=>assert.equal(derive({player:{id:'p'},roundSec:20,frameRound:2,events:[event]}).active,false));
ck('NaN time/unknown utility/dead actor suppress pose',()=>{assert.equal(derive({player:p,roundSec:NaN}).active,false);assert.equal(derive({player:{...p,dead:true},roundSec:20}).active,false);assert.equal(derive({player:{...p,lastUtilityType:'c4'},roundSec:20}).active,false);});
ck('C4 planting uses actual ownership, state and progress, never throw',()=>{const r=derive({player:{id:'p',hasBomb:true,state:'安裝中',plantProgressSec:1.5},roundSec:30});assert.equal(r.kind,'plant');assert.equal(r.progress,.5);assert.equal(r.isThrow,false);assert.equal(r.releaseAtRoundSec,null);});
ck('Missing planting ownership/progress cannot fabricate interaction',()=>{assert.equal(derive({player:{id:'p',state:'安裝中',plantProgressSec:1},roundSec:30}).active,false);assert.equal(derive({player:{id:'p',hasBomb:true,state:'安裝中'},roundSec:30}).active,false);});
ck('Defuse pose follows actual selected defuser and actual progress',()=>{const r=derive({player:{id:'p',state:'拆彈中'},roundSec:40,defuse:{defuserId:'p',progress:1.75}});assert.equal(r.kind,'defuse');assert.equal(r.progress,.5);assert.equal(r.isThrow,false);});
ck('Cover mate cannot steal defuser pose',()=>assert.equal(derive({player:{id:'other',state:'拆彈中'},roundSec:40,defuse:{defuserId:'p',progress:1.75}}).active,false));
ck('Canonical guard/angle states are aiming semantics',()=>{for(const state of ['架槍','HOLD_ANGLE','COVER','POST_PLANT','ANCHOR'])assert.equal(aim({state}),true);assert.equal(aim({state:'ROTATE',objectiveState:'HOLD_ANGLE'}),true);assert.equal(aim({state:'BUY'}),false);});
ck('Pause/seek reconstruction is deterministic rather than replaying timers',()=>{const input={player:p,roundSec:20.3,events:[event],frameRound:1};assert.deepEqual(derive(input),derive(input));});
ck('Finite provisional additive guide values, no special clip claim',()=>{for(const t of [19.78,19.99,20,20.13,20.14,20.55]){const r=derive({player:p,roundSec:t,frameRound:1,events:[event],nextEvents:[event]});assert.equal(r.claimsAuthoredClip,false);assert.equal(r.writeDomain,false);if(r.active){assert(Number.isFinite(r.weight)&&r.weight>=0&&r.weight<=1);for(const bone of Object.values(r.provisionalBoneGuides))for(const v of Object.values(bone))assert(Number.isFinite(v)&&Math.abs(v)<=1);}}});
ck('Player/frame/event inputs are never mutated',()=>{const input={player:{...p},roundSec:20.05,frameRound:1,events:[{...event}]},before=JSON.stringify(input);derive(input);assert.equal(JSON.stringify(input),before);});
console.log(`Owner4 semantic pose PROPOSAL_ONLY: ${checks}/${checks}; NO_PRODUCT_CHANGE; NO_SIM; NO_GPU; NO_AUTHORED_THROW_CLIP_CLAIM`);
