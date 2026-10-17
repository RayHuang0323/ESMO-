import fs from 'node:fs';
import path from 'node:path';
import { HarnessError } from './harness.mjs';
import { seekFpsNativeTimeline } from './fpsNativeTimeline.mjs';

// 保存幀唯讀取樣；所有選取、seek、縮放與環繞均走產品原生 UI。
export async function captureFpsOperatorArtGallery({chrome,sleep,ck,map,out,threeQuarter=false,frontQuarter=false,focusVariation=null,cuffViews=false,handClose=false,handFamily=null,triggerClose=false}) {
  if(focusVariation!==null&&focusVariation!=='support')throw new HarnessError('局部人物診斷只允許明確support，不得默默縮減完整圖庫');
  if(cuffViews&&focusVariation!=='support')throw new HarnessError('袖口補證只允許局部support，不縮減完整圖庫');
  if(handClose&&(focusVariation!=='support'||cuffViews))throw new HarnessError('手腕近拍須獨立support範圍，不冒充全身／袖口四角度圖庫');
  if(handFamily!==null&&(!handClose||handFamily!=='sniper'))throw new HarnessError('窄護木補證只允許明確真sniper保存幀，不覆寫槍型');
  if(triggerClose&&(!handClose||handFamily!=='sniper'))throw new HarnessError('兩圖扳機補證須真sniper手部近拍，不改正常姿勢');
  const targets=await chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__;for(let frame=0;frame<s.liveRef.current.sim.frames.length;frame++){const f=s.liveRef.current.sim.frames[frame];if(!f.muzzles?.length)continue;const seen={t:new Set(),ct:new Set()},result=[];for(const p of f.players){const variation=s.players.find(a=>a.id===p.id)?.rigged?.c2c?.variationId;if(!p.dead&&variation&&seen[p.side]?.size<3&&!seen[p.side].has(variation)){seen[p.side].add(variation);result.push({id:p.id,side:p.side,variation,frame});}}if(result.length===6)return result;}return[];`);
  if(targets.length!==6)throw new HarnessError('人物圖庫缺少兩隊各三種真角色剪影');
  const selectedTargets=handFamily?await chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__,found={};for(let frame=0;frame<s.liveRef.current.sim.frames.length;frame++){for(const p of s.liveRef.current.sim.frames[frame].players){const c=s.players.find(a=>a.id===p.id)?.rigged?.c2c;if(!p.dead&&!p.reloading&&c?.variationId==='support'&&c.weaponFamilyMap[p.gun]==='sniper'&&!found[p.side])found[p.side]={id:p.id,side:p.side,variation:c.variationId,frame,gun:p.gun,family:'sniper'};}}return Object.values(found);`):targets.filter(target=>focusVariation===null||target.variation===focusVariation);
  if(handFamily&&(selectedTargets.length!==2||!['ct','t'].every(side=>selectedTargets.some(t=>t.side===side))))throw new HarnessError('保存幀沒有兩隊真support狙擊槍，明確NOT RUN、不製造槍型');
  await seekFpsNativeTimeline({chrome,sleep,index:targets[0].frame});
  fs.mkdirSync(path.join(out,'operator-gallery'),{recursive:true});const rows=[];
  for(const target of selectedTargets){
    if(handFamily)await seekFpsNativeTimeline({chrome,sleep,index:target.frame});
    await chrome.evaluate(`const b=document.querySelector('[data-testid="cs-camera-preset-overview"]');if(!b)throw new Error('缺少全景按鈕');b.click();return true;`);await sleep(200);
    await chrome.evaluate(`const e=document.querySelector('[data-esmo-fps-player-card="${target.id}"]');if(!e)throw new Error('缺少真選手卡');e.click();document.querySelector('canvas').scrollIntoView({block:'center'});return true;`);await sleep(600);
    const rect=await chrome.evaluate(`const r=document.querySelector('canvas').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};`);
    const x=rect.x+rect.width*.5,y=rect.y+rect.height*.35;
    for(let n=0;n<(handClose?36:20);n++){await chrome.send('Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX:0,deltaY:-60});await sleep(25);}await sleep(700);
    // 原生向上拖曳把近鏡頭降至人眼高度；維持實際選手焦點。
    await chrome.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
    await chrome.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y:y-(triggerClose?100:60),button:'left',buttons:1});
    await chrome.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y:y-(triggerClose?100:60),button:'left',buttons:0,clickCount:1});await sleep(500);
    const facing=()=>chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__,a=s.players.find(a=>a.id===s.liveRef.current.selected),V=s.camera.position.constructor,origin=a.rigged.root.getWorldPosition(new V()),toEye=s.camera.position.clone().sub(origin);toEye.y=0;toEye.normalize();const angle=a.rigged.facingDegrees*Math.PI/180;return{angle,toEyeAngle:Math.atan2(toEye.z,toEye.x),dot:toEye.x*Math.cos(angle)+toEye.z*Math.sin(angle)};`);
    const orbit=async(delta)=>{const dx=Math.max(-rect.width*.35,Math.min(rect.width*.35,delta/.006));await chrome.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});await chrome.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+dx,y,button:'left',buttons:1});await chrome.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+dx,y,button:'left',buttons:0,clickCount:1});await sleep(500);};
    const triggerSide=()=>chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__,a=s.players.find(a=>a.id===s.liveRef.current.selected),V=s.camera.position.constructor,r=a.rigged.model.getObjectByName('upperarm_r').getWorldPosition(new V()),l=a.rigged.model.getObjectByName('upperarm_l').getWorldPosition(new V());return{angle:Math.atan2(r.z-l.z,r.x-l.x)};`);
    // 袖口診斷的第二視角從前側看腕口；後側常被身體遮住。
    // 完整六身份圖庫仍維持原四角度，局部不取代完整驗收。
    // Full captures include all six identities. An additional front-quarter
    // is needed when rear angles occlude the cloth elbow/returned sleeve;
    // retain every original angle rather than replacing inconvenient views.
    const fullViews=threeQuarter?['rear','front','rear-left','rear-right']:['rear','front'];
    if(frontQuarter)fullViews.push('front-left');
    // 真握槍缺口分別看兩側手，固定左右前斜角；仍四圖，不挑好看的角度。
    for(const view of focusVariation?(triggerClose?['trigger-side-low']:handClose?['front-right','front-left']:cuffViews?['front-right','right']:['front','front-left']):fullViews){
      // Spectator follows enemy aim, which can differ from the actual body yaw.
      // Two fixed drags do not prove a front view. Align via native orbit to
      // the product controller's real facing, then assert that precondition.
      for(let attempt=0;attempt<12;attempt++){
        const f=await facing();if(!Number.isFinite(f.angle))throw new HarnessError('缺真人物面向，不能標正背');
        const offset={rear:Math.PI,front:0,'front-left':Math.PI*.30,'front-right':-Math.PI*.30,right:-Math.PI*.50,'rear-left':Math.PI*.65,'rear-right':-Math.PI*.65}[view];
        const desired=triggerClose?(await triggerSide()).angle:f.angle+offset,delta=Math.atan2(Math.sin(desired-f.toEyeAngle),Math.cos(desired-f.toEyeAngle));
        if(Math.abs(delta)<.15)break;await orbit(delta);
      }
      let framing;
      for(let n=0;n<9;n++){
        framing=await chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__,a=s.players.find(a=>a.id===s.liveRef.current.selected),c=a.rigged.c2c,V=s.camera.position.constructor,m=c.getMuzzleWorldPosition(new V(),c.weaponFamily),g=c.weaponSockets[c.weaponFamily]?.grip.getWorldPosition(new V()),b=a.rigged.model.getObjectByName('Head')?.getWorldPosition(new V()),d=a.rigged.gripPose?.diagnostics(),support=d?.authoredSupport?c.weaponGroups[c.weaponFamily].localToWorld(new V().fromArray(d.supportLocal)):c.weaponSockets[c.weaponFamily]?.support.getWorldPosition(new V());const close=${handClose},names=['hand_l','hand_r',...['l','r'].flatMap(side=>['index','middle','ring','pinky','thumb'].map(d=>d+'_04_leaf_'+side))];const points=close?[g,support,...names.map(n=>a.rigged.model.getObjectByName(n)?.getWorldPosition(new V()))]:[m,g,b];return{radius:s.cam.manualRadius,scope:close?'WRISTS_AND_FINGERS_NOT_FULL_BODY':'FULL_HEAD_GRIP_MUZZLE',points:points.map(p=>p?.project(s.camera).toArray()||null)};`);
        if(framing.points.every(p=>p&&Math.abs(p[0])<.90&&Math.abs(p[1])<.90&&p[2]>-1&&p[2]<1))break;
        await chrome.send('Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX:0,deltaY:60});await sleep(350);
      }
      const observed=await chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__,l=s.liveRef.current,p=l.sim.frames[l.fIdx].players.find(p=>p.id===l.selected),a=s.players.find(a=>a.id===l.selected),card=document.querySelector('[data-esmo-fps-player-card="${target.id}"]');return{selected:l.selected,frame:l.fIdx,playing:l.playing,camera:l.cameraMode,dead:p?.dead,gun:p?.gun,weaponFamily:a?.rigged?.c2c?.weaponFamily,variation:a?.rigged?.c2c?.variationId,yaw:s.cam.chaseYaw,radius:s.cam.manualRadius,cardText:card?.textContent,bodyVisible:a?.rigged?.root?.visible};`);
      if(handFamily&&(observed.weaponFamily!==handFamily||observed.gun!==target.gun))throw new HarnessError('畫面真槍族／槍型與保存目標不符，不以local內部種子冒充');
      observed.bodyFacing=await facing();
      const offset={rear:Math.PI,front:0,'front-left':Math.PI*.30,'front-right':-Math.PI*.30,right:-Math.PI*.50,'rear-left':Math.PI*.65,'rear-right':-Math.PI*.65}[view];
      const desiredAngle=triggerClose?(await triggerSide()).angle:observed.bodyFacing.angle+offset;
      const angularError=Math.atan2(Math.sin(observed.bodyFacing.toEyeAngle-desiredAngle),Math.cos(observed.bodyFacing.toEyeAngle-desiredAngle));
      if(view==='front'?observed.bodyFacing.dot<.9:view==='rear'?observed.bodyFacing.dot>-.9:Math.abs(angularError)>.15)throw new HarnessError('原生環繞未取得實際'+view+'，不以側背冒充');
      observed.viewAngularError=angularError;
      if(triggerClose){
        observed.triggerView=await chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__,a=s.players.find(a=>a.id===s.liveRef.current.selected),V=s.camera.position.constructor,g=a.rigged.c2c.weaponSockets.sniper.grip.getWorldPosition(new V());return{eyeY:s.camera.position.y,gripY:g.y,belowGrip:s.camera.position.y<=g.y};`);
        if(!observed.triggerView.belowGrip)throw new HarnessError('原生鏡頭未低於真槍柄，不冒充扳機低角度');
      }
      if(focusVariation)observed.cuffProjection=await chrome.evaluate(`
        const s=window.__ESMO_FPS_SCENE__,actor=s.players.find(a=>a.id===s.liveRef.current.selected),mesh=actor.rigged.c2c.tailored.mesh;
        const g=mesh.geometry,p=g.attributes.position,index=g.index,V=s.camera.position.constructor,start=p.count-g.userData.esmoCuffRoll.addedVertices;
        const rect=document.querySelector('canvas').getBoundingClientRect(),fabric=g.groups.find(x=>x.materialIndex===0);
        mesh.updateWorldMatrix(true,false);mesh.skeleton.update();
        const point=i=>{const v=new V().fromBufferAttribute(p,i);mesh.applyBoneTransform(i,v);return mesh.localToWorld(v);};
        const cuff=g.userData.esmoCuffRoll,ring=cuff.ringPoints||cuff.radialSegments,stride=cuff.verticesPerArm||ring*6;
        return [0,1].map(arm=>{const base=start+stride*arm,width=[];let frontFacing=0,projectedAreaPixels=0;
          const outer=cuff.outerRow??4,inner=cuff.innerRow??5,end=cuff.profileRows??6;
          for(let i=0;i<cuff.radialSegments;i++){const a=point(base+outer*ring+i).project(s.camera),b=point(base+inner*ring+i).project(s.camera);width.push(Math.hypot((a.x-b.x)*rect.width*.5,(a.y-b.y)*rect.height*.5));}
          for(let at=fabric.start;at<fabric.start+fabric.count;at+=3){const ids=[index.getX(at),index.getX(at+1),index.getX(at+2)];if(!ids.every(i=>i>=base+outer*ring&&i<base+end*ring))continue;
            const [a,b,c]=ids.map(point),normal=b.clone().sub(a).cross(c.clone().sub(a)),center=a.clone().add(b).add(c).multiplyScalar(1/3);
            if(normal.dot(s.camera.position.clone().sub(center))<=0)continue;frontFacing++;
            const q=[a,b,c].map(v=>v.project(s.camera));projectedAreaPixels+=Math.abs((q[1].x-q[0].x)*(q[2].y-q[0].y)-(q[1].y-q[0].y)*(q[2].x-q[0].x))*rect.width*rect.height/8;
          }
          return {arm,frontFacingEndFaces:frontFacing,totalEndFaces:cuff.radialSegments*(end-outer),projectedAreaPixels,endThicknessPixels:{min:Math.min(...width),max:Math.max(...width),mean:width.reduce((a,b)=>a+b,0)/width.length}};
        });`);
      ck(`${map} ${target.id} ${view} 真人物近鏡頭前提`,observed.selected===target.id&&observed.frame===target.frame&&!observed.playing&&observed.camera==='tactical'&&!observed.dead&&observed.variation===target.variation&&observed.radius<=6&&observed.bodyVisible===true&&Boolean(observed.cardText)&&framing.points.every(p=>p&&Math.abs(p[0])<.90&&Math.abs(p[1])<.90&&p[2]>-1&&p[2]<1),JSON.stringify({observed,framing}));
      const captureRect=await chrome.evaluate(`const r=document.querySelector('canvas').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};`);
      const file=`operator-gallery/${map}-${target.id}-${target.variation}-${handClose?'hands-':''}${view}.png`,shot=await chrome.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,file),Buffer.from(shot.data,'base64'));
      rows.push({status:'MEASURED',target,view,observed,framing,file,captureRect});
    }
  }
  return rows;
}
