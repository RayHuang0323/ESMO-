from pathlib import Path
def write(p,s):
 with open(p,'w',encoding='utf-8',newline='\n') as f:f.write(s)
s=Path('tools/lib/fpsGroundingProposal.mjs').read_text(encoding='utf-8').replace('// CPU-only review proposal; not connected to the product renderer.','// Visible skinned support; cached bounds are not a ground-contact oracle.').replace('createVisibleGroundingProposal','createVisibleGroundingSampler').replace('fastAlive=false','fastAlive=true')
write('src/battle/fps/presentation/fpsVisibleGrounding.js',s)
p=Path('src/battle/fps/presentation/FpsCharacterRenderer.js');s=p.read_text(encoding='utf-8');s='import {projectNonDeathPelvisWorldVertical,createVisibleGroundingSampler} from "./fpsVisibleGrounding.js";\n'+s
s=s.replace('function cloneWithoutRootMotion(clip) {','function cloneWithoutRootMotion(clip, model = null) {\n  if(model)return projectNonDeathPelvisWorldVertical(clip,model);')
s=s.replace('function clipMap(animationLibrary, shared = false)', 'function clipMap(animationLibrary, shared = false, model = null)')
s=s.replace('cloneWithoutRootMotion(clip)]','cloneWithoutRootMotion(clip,model)]')
s=s.replace('clipMap(animationLibrary, optimized)','clipMap(animationLibrary, optimized, optimized ? model : null)')
s=s.replace('playbackDeltaSec = dt } = {})','playbackDeltaSec = dt, sampleGroundHeight = null } = {})')
s=s.replace('      controller.actionPose?.restore();\n      controller.gripPose?.restore();\n      if (optimized', '      controller.visibleGrounding?.restore();\n      controller.actionPose?.restore();\n      controller.gripPose?.restore();\n      if (optimized',1)
a=s.index('      if (optimized) controller.c2c?.syncAnchors?.();');b=s.index('      // Measure only local child displacement',a)
old=s[a:b]
death=old[old.index('      if (controller.deathTriggered'):]
replacement='''      if (optimized && controller.model) {
        riggedRoot.updateWorldMatrix(true,true);
        controller.sampleGroundHeight = sampleGroundHeight || ((x,z)=>riggedRoot.getWorldPosition(controller._groundPosition||(controller._groundPosition=new THREE.Vector3())).y+.045);
        if(!controller.visibleGrounding)controller.visibleGrounding=createVisibleGroundingSampler({root:riggedRoot,fastAlive:true,sampleGroundHeight:(x,z)=>controller.sampleGroundHeight(x,z)});
        const action=controller.actions.get(controller.currentAction);
        const signature=JSON.stringify([riggedRoot.matrixWorld.elements,controller.deathTriggered,controller.currentAction,action?.time,controller.poseLayers?.lowerName,controller.mixer.time,gesture.kind]);
        if(signature===controller.groundSignature&&Number.isFinite(controller.groundOffset)) {
          controller.model.position.y+=controller.groundOffset;
          controller.model.updateWorldMatrix(true,true);
        } else {
          const measured=controller.visibleGrounding.apply({model:controller.model,dead:controller.deathTriggered});
          controller.groundOffset=measured.applied?measured.offset:0;
          controller.groundSignature=signature;
          controller.groundSupportSamples=measured.samples;
        }
        if(controller.deathTriggered){controller.deathGroundCorrection=controller.groundOffset;controller.deathGroundContactY=riggedRoot.getWorldPosition(controller._groundPosition||(controller._groundPosition=new THREE.Vector3())).y+controller.groundOffset;}
        controller.c2c?.syncAnchors?.();
      } else {
'''+death+'''      }
'''
# Cache reapplication must remain owned by the support sampler, so restore
# always removes exactly the currently applied offset.
replacement=replacement.replace('controller.model.position.y+=controller.groundOffset;\n          controller.model.updateWorldMatrix(true,true);','controller.visibleGrounding.reapply({model:controller.model,offset:controller.groundOffset});')
s=s[:a]+replacement+s[b:]
s=s.replace('      controller.poseLayers?.stop();\n      controller.actions.forEach','      controller.visibleGrounding?.restore();\n      controller.groundSignature=null;\n      controller.poseLayers?.stop();\n      controller.actions.forEach',1)
write(p,s)
p=Path('src/battle/fps/presentation/fpsVisibleGrounding.js');s=p.read_text(encoding='utf-8');s=s.replace('return{evaluate,restore()', 'return{evaluate,reapply({model,offset:cached}){offset=cached;owner=model;model.position.y+=offset;model.updateWorldMatrix(true,true);},restore()');write(p,s)
p=Path('src/battle/fps/EsportsFPS3D.jsx');s=p.read_text(encoding='utf-8');s='import { createFpsFloorSampler } from "./presentation/fpsFloorSampler.js";\n'+s
needle='    st.c3Environment=csLoadTime';start=s.index(needle);end=s.index('\n',start)
s=s[:end]+'\n    if(sceneVersion!=="legacy")st.sampleGroundHeight=createFpsFloorSampler(st.c3Environment.group,(x,z)=>fpsMajorElevation(mapKey,{x:x+50,y:z+50}));'+s[end:]
s=s.replace('    P.rigged?.update?.({events:frame.events','    P.rigged?.setFacingDegrees?.(va);\n    P.rigged?.update?.({sampleGroundHeight:st.sampleGroundHeight,events:frame.events',1)
write(p,s)
p=Path('tools/lib/fpsRigTestAssets.mjs');s=p.read_text(encoding='utf-8');s='import {projectNonDeathPelvisWorldVertical} from "../../src/battle/fps/presentation/fpsVisibleGrounding.js";\n'+s
s=s.replace('new Map(clips.map(clip=>[clip.name,c.mixer.clipAction(clip)]))','new Map((optimized?library.gltf.animations.map(clip=>projectNonDeathPelvisWorldVertical(clip,model)):clips).map(clip=>[clip.name,c.mixer.clipAction(clip)]))');write(p,s)
p=Path('tools/audit_cs_owner4b_visible_ground.mjs');s=p.read_text(encoding='utf-8');s=s.replace('f.update({player:p,previousPlayer:p,','f.update({sampleGroundHeight:(x,z)=>fpsMajorElevation(scene.map,{x:x+50,y:z+50})+.045,player:p,previousPlayer:p,');write(p,s)
