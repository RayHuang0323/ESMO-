#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFpsRigTestAssets} from './lib/fpsRigTestAssets.mjs';
import {createVisibleGroundingProposal} from './lib/fpsGroundingProposal.mjs';
const input=process.argv[2];if(!input)throw Error('Provide actual 15-sample fastfoot proposal JSON');const report=JSON.parse(fs.readFileSync(input,'utf8'));let count=0;
const ck=(label,fn)=>{fn();count++;console.log('PASS '+label);};
ck('Original 27 Before gates remain intact and pass in proposal',()=>{assert.equal(report.checks.length,27);assert(report.checks.every(c=>c.ok));});
ck('All 15 genuine GLB pose/terrain samples have positive full-visible oracle',()=>{assert.equal(report.samples.length,15);assert(report.samples.every(s=>s.visibleVertices>10000&&s.footVertices===800));});
ck('80 sole candidates remain within 5mm of all 800 real soles for 12 alive samples',()=>{const alive=report.samples.filter(s=>s.state!=='death-paused-seek');assert.equal(alive.length,12);assert(alive.every(s=>s.proposalMeasure.fast.samples===80&&Math.abs(s.minFootPavingGap)<=.005));});
ck('1597 corpse candidates remain within 5mm of full visible mesh for three death samples',()=>{const dead=report.samples.filter(s=>s.state==='death-paused-seek');assert.equal(dead.length,3);assert(dead.every(s=>s.proposalMeasure.fast.samples===1597&&Math.abs(s.minVisiblePavingGap)<=.005));});
const assets=await readFpsRigTestAssets();try{for(const dead of [false,true]){
 const f=assets.make({importedWeapons:true,continuousClothing:true});try{
  f.c.root.visible=true;f.update({player:{...f.player,dead},previousPlayer:{...f.player,dead},playbackActive:false,dt:0});f.parent.updateMatrixWorld(true);
  const ground=createVisibleGroundingProposal({root:f.c.root,fastAlive:true,sampleGroundHeight:()=>.045}),base=f.c.model.position.clone(),authority=JSON.stringify(f.player),root=f.parent.position.clone();
  ck(`${dead?'death':'alive'} 100 sample/apply/exact restore cycles preserve model/root/authority`,()=>{
   for(let i=0;i<100;i++){ground.apply({model:f.c.model,dead});ground.restore();assert(f.c.model.position.equals(base));assert(f.parent.position.equals(root));assert.equal(JSON.stringify(f.player),authority);}
  });
  ck(`${dead?'death':'alive'} missing restore is explicitly rejected instead of accumulated offset`,()=>{ground.apply({model:f.c.model,dead});assert.throws(()=>ground.apply({model:f.c.model,dead}),/restore/);ground.restore();assert(f.c.model.position.equals(base));});
 }finally{f.dispose();}
}}finally{assets.dispose();}
console.log(`Owner4B grounding PROPOSAL_ONLY: ${count}/${count}; 27 original gates retained; NO_GPU; NO_SIM; NO_PRODUCT_CHANGE`);
