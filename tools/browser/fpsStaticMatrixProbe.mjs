import fs from 'node:fs';
import path from 'node:path';
import { HarnessError } from './harness.mjs';

// Diagnostic only: one synchronous evaluation owns the experiment. No RAF,
// simulation, camera, quality or visibility update can interleave with it.
export async function measureFpsStaticMatrixCost({chrome,map,out,target='static'}) {
  if(!['static','shadow'].includes(target))throw new HarnessError('unknown matrix diagnostic target');
  await chrome.evaluate(`const controls=document.querySelector('[data-testid="cs-playback-controls"]');
    const pause=[...(controls?.querySelectorAll('button')||[])].find(b=>b.textContent==='❚❚');
    if(pause)pause.click();return true;`);
  await chrome.evaluate(`return new Promise((resolve,reject)=>{const started=performance.now();const check=()=>{
    if(window.__ESMO_FPS_SCENE__?.liveRef.current.playing===false&&[...document.querySelectorAll('[data-testid="cs-playback-controls"] button')].some(b=>b.textContent==='▶'))return resolve(true);
    if(performance.now()-started>3000)return reject(new Error('native pause UI did not settle'));requestAnimationFrame(check);};check();});`);
  const result=await chrome.evaluate(`
    const st=window.__ESMO_FPS_SCENE__;
    if(!st?.mapReady||st.liveRef.current.sim.sceneVersion!=='major.v1'||!st.c3Environment?.summary?.atlasLoaded||
      !['ready','not-needed'].includes(st.roofShaderWarmup?.result?.status)||
      st.liveRef.current.playing||st.players.length!==10||st.players.some(a=>a.rigged?.mode!=='rigged'))
      throw new Error('static matrix diagnostic preconditions '+JSON.stringify({mapReady:st?.mapReady,sceneVersion:st?.liveRef.current.sim.sceneVersion,atlasLoaded:st?.c3Environment?.summary?.atlasLoaded,warmup:st?.roofShaderWarmup?.result,playing:st?.liveRef.current.playing,actors:st?.players.map(a=>a.rigged?.mode)}));
    const renderer=st.renderer,scene=st.scene,world=st.worldGroup,gl=renderer.getContext();
    const target=${JSON.stringify(target)},shadowAuto=renderer.shadowMap.autoUpdate,shadowDirty=renderer.shadowMap.needsUpdate;
    if(renderer.getRenderTarget()!==null||gl.isContextLost())throw new Error('diagnostic requires default live render target');
    const render=()=>renderer.render(scene,st.camera);
    for(let i=0;i<3;i++)render();
    const objects=[];scene.traverse(o=>objects.push(o));
    const shadow=st.sun.shadow;
    if(!objects.includes(shadow.camera))objects.push(shadow.camera);
    const statics=[];world.traverse(o=>statics.push(o));
    const bytes=a=>Array.from(new Uint8Array(new Float64Array(a).buffer));
    const saved=objects.map(o=>({o,auto:o.matrixAutoUpdate,worldAuto:o.matrixWorldAutoUpdate,
      dirty:o.matrixWorldNeedsUpdate,matrix:o.matrix.elements.slice(),world:o.matrixWorld.elements.slice(),
      position:o.position.toArray(),quaternion:o.quaternion.toArray(),rotation:o.rotation.toArray(),scale:o.scale.toArray(),inverse:o.matrixWorldInverse?.elements.slice()}));
    const shadowMatrix=shadow.matrix.elements.slice();
    if(saved.some(s=>[...s.matrix,...s.world,...s.position,...s.quaternion,...s.scale].some(v=>!Number.isFinite(v)))||shadowMatrix.some(v=>!Number.isFinite(v)))throw new Error('nonfinite diagnostic transform');
    const read=()=>{const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
      gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      if(gl.getError()!==gl.NO_ERROR)throw new Error('readPixels diagnostic failed');return pixels;};
    const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
    const matrixDiff=()=>saved.filter(s=>!same(bytes(s.matrix),bytes(s.o.matrix.elements))||!same(bytes(s.world),bytes(s.o.matrixWorld.elements))||
      !same(bytes(s.position),bytes(s.o.position.toArray()))||!same(bytes(s.quaternion),bytes(s.o.quaternion.toArray()))||!same(s.rotation,s.o.rotation.toArray())||!same(bytes(s.scale),bytes(s.o.scale.toArray()))||
      (s.inverse&&!same(bytes(s.inverse),bytes(s.o.matrixWorldInverse.elements)))).map(s=>s.o.name||s.o.type);
    const freeze=()=>{if(target==='shadow'){renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;return;}scene.matrixAutoUpdate=false;scene.matrixWorldNeedsUpdate=false;for(const o of statics){o.matrixAutoUpdate=false;o.matrixWorldAutoUpdate=false;o.matrixWorldNeedsUpdate=false;}};
    const restore=()=>{renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowDirty;for(const s of saved){s.o.matrixAutoUpdate=s.auto;s.o.matrixWorldAutoUpdate=s.worldAuto;s.o.matrixWorldNeedsUpdate=s.dirty;}};
    const restoreMatrices=()=>{for(const s of saved){s.o.matrix.fromArray(s.matrix);s.o.matrixWorld.fromArray(s.world);s.o.position.fromArray(s.position);s.o.quaternion.fromArray(s.quaternion);
      // r160 Euler.set has no update=false argument. Restore its exact saved
      // representation without triggering the reciprocal quaternion callback.
      const r=s.o.rotation;[r._x,r._y,r._z,r._order]=s.rotation;
      s.o.scale.fromArray(s.scale);if(s.inverse)s.o.matrixWorldInverse.fromArray(s.inverse);}shadow.matrix.fromArray(shadowMatrix);};
    const descriptors=[];
    const counted=()=>{let updates=0,draws=0,activeDraw=null;const glDescriptors=[],callbacks=[],drawRows=new Map();try{
      const descendant=(o,root)=>{for(let p=o;p;p=p.parent)if(p===root)return true;return false;};
      for(const o of objects.filter(o=>o.isMesh||o.isLine||o.isPoints))for(const [key,pass]of[['onBeforeRender','colour'],['onBeforeShadow','shadow']]){
        const descriptor=Object.getOwnPropertyDescriptor(o,key),method=o[key];callbacks.push({o,key,descriptor,method});
        o[key]=function(...args){const group=args[pass==='colour'?5:6],material=Array.isArray(o.material)?o.material[group?.materialIndex??0]:o.material;
          const actor=st.players.find(p=>descendant(o,p.rigged.model));
          activeDraw={objectId:o.id,name:o.name||o.type,pass,scope:descendant(o,world)?'world':actor?'actor:'+actor.id:'other',material:material?.name||material?.type};
          return method.apply(this,args);};
      }
      for(const key of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){const method=gl[key];if(typeof method!=='function')continue;const descriptor=Object.getOwnPropertyDescriptor(gl,key);glDescriptors.push({key,descriptor,method});gl[key]=function(...args){draws++;const row=activeDraw||{name:'UNATTRIBUTED',pass:'unknown',scope:'unknown'},id=JSON.stringify(row);if(!drawRows.has(id))drawRows.set(id,{...row,draws:0});drawRows.get(id).draws++;return method.apply(this,args);};}
      for(const o of statics){const descriptor=Object.getOwnPropertyDescriptor(o,'updateMatrix'),method=o.updateMatrix;
      descriptors.push({o,descriptor});o.updateMatrix=function(){updates++;return method.call(this);};}render();return updates;
      }finally{for(const s of callbacks){if(s.descriptor)Object.defineProperty(s.o,s.key,s.descriptor);else delete s.o[s.key];}for(const s of glDescriptors){if(s.descriptor)Object.defineProperty(gl,s.key,s.descriptor);else delete gl[s.key];}for(const s of descriptors.splice(0)){if(s.descriptor)Object.defineProperty(s.o,'updateMatrix',s.descriptor);else delete s.o.updateMatrix;}counted.lastDraws=draws;counted.lastRows=[...drawRows.values()];counted.restored=callbacks.every(s=>s.o[s.key]===s.method)&&glDescriptors.every(s=>gl[s.key]===s.method);}};
    const timing=()=>{const samples=[];for(let i=0;i<20;i++){gl.finish();const start=performance.now();render();samples.push(performance.now()-start);}gl.finish();const sorted=samples.slice().sort((a,b)=>a-b);
      return{samplesMs:samples,medianMs:(sorted[9]+sorted[10])/2,p95Ms:sorted[18],meanMs:samples.reduce((a,b)=>a+b,0)/samples.length};};
    const state=()=>({frame:st.liveRef.current.fIdx,playing:st.liveRef.current.playing,time:st.time,subT:st.subT,seekNonce:st.liveRef.current.seekNonce,sceneSeekNonce:st.seekNonce,
      frameTime:st.liveRef.current.sim.frames[st.liveRef.current.fIdx]?.ts,shadowMatrixBytes:bytes(shadow.matrix.elements),
      camera:st.camera.matrixWorld.elements.slice(),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
      dpr:renderer.getPixelRatio(),shadowSize:st.sun.shadow.mapSize.x});
    let data;
    try{
      const baselineUpdates=counted(),baselineDrawCalls=counted.lastDraws,baselineDrawInventory=counted.lastRows,baselineCallbacksRestored=counted.restored;render();const pixelsA=read(),baselineState=state();
      render();const pixelsA2=read(),baselineStable=same(pixelsA,pixelsA2);
      const baselineTiming=timing();freeze();const frozenUpdates=counted(),frozenDrawCalls=counted.lastDraws,frozenDrawInventory=counted.lastRows,callbacksRestored=baselineCallbacksRestored&&counted.restored;
      const frozenTiming=timing();render();const pixelsB=read(),frozenState=state(),frozenMatrixDiff=matrixDiff();
      restore();const restoredTiming=timing();render();const pixelsRestored=read(),restoredState=state();
      const comparable=s=>{const {calls,triangles,...rest}=s;return target==='shadow'?rest:s;};
      data={version:'cs-static-matrix-diagnostic.v2',target,diagnosticOnly:true,
        caveat:'Synchronous paused render submission timings, not active gameplay FPS or GPU timer. A/B/A order may carry driver/system drift.',
        baselineStable,pixelsEqual:same(pixelsA,pixelsB),restoredPixelsEqual:same(pixelsA,pixelsRestored),
        matrixDiff:frozenMatrixDiff,restoredMatrixDiff:matrixDiff(),stateEqual:JSON.stringify(comparable(baselineState))===JSON.stringify(comparable(frozenState))&&JSON.stringify(baselineState)===JSON.stringify(restoredState),baselineState,frozenState,restoredState,
        staticObjects:statics.length,baselineUpdates,frozenUpdates,baselineDrawCalls,frozenDrawCalls,baselineDrawInventory,frozenDrawInventory,callbacksRestored,baselineTiming,frozenTiming,restoredTiming};
    }finally{restoreMatrices();restore();}
    data.flagsRestored=renderer.shadowMap.autoUpdate===shadowAuto&&renderer.shadowMap.needsUpdate===shadowDirty&&saved.every(s=>s.o.matrixAutoUpdate===s.auto&&s.o.matrixWorldAutoUpdate===s.worldAuto&&s.o.matrixWorldNeedsUpdate===s.dirty);
    data.finalMatrixDiff=matrixDiff();data.finalShadowRestored=same(bytes(shadowMatrix),bytes(shadow.matrix.elements));
    return data;
  `);
  fs.writeFileSync(path.join(out,`${map}-${target}-matrix-diagnostic.json`),JSON.stringify(result,null,2));
  // r160 resets renderer.info after its shadow pass. Count real GL draw
  // submissions in a separate untimed sample to prove shadow work was skipped.
  const costShape=target==='static'?result.frozenUpdates===0&&result.frozenDrawCalls===result.baselineDrawCalls:result.frozenUpdates===result.baselineUpdates&&result.frozenDrawCalls<result.baselineDrawCalls;
  if(!result.baselineStable||!result.pixelsEqual||!result.restoredPixelsEqual||!result.stateEqual||result.matrixDiff.length||result.restoredMatrixDiff.length||result.finalMatrixDiff.length||!result.finalShadowRestored||!result.flagsRestored||!result.callbacksRestored||result.baselineUpdates===0||!costShape)
    throw new HarnessError('static matrix diagnostic integrity failed; full JSON retained: '+JSON.stringify({baselineStable:result.baselineStable,pixelsEqual:result.pixelsEqual,restoredPixelsEqual:result.restoredPixelsEqual,stateEqual:result.stateEqual,matrixDiff:result.matrixDiff,restoredMatrixDiff:result.restoredMatrixDiff,finalMatrixDiff:result.finalMatrixDiff,finalShadowRestored:result.finalShadowRestored,flagsRestored:result.flagsRestored}));
  return result;
}
