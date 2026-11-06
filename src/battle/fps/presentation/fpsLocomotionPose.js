import * as THREE from 'three';

// 方向只來自已呈現的速度／瞄準角；不移動root或修改保存frame。
// 側移讓下身沿步進方向工作，上身維持原瞄準；後退反向播放原步態。
export function resolveFpsLocomotionDirection({forward=0,lateral=0,previousReverse=false}={}){
 const speed=Math.hypot(forward,lateral);if(speed<=.22)return{yaw:0,reverse:previousReverse};
 // 純側移附近保留步態方向，避免輕微瞄準角抖動反覆翻轉步態。
 const reverse=Math.abs(forward)>speed*.2?forward<0:previousReverse;
 return{yaw:-Math.atan2(reverse?-lateral:lateral,reverse?-forward:forward),reverse};
}

export function createFpsLocomotionPose({model}){
 const pelvis=model?.getObjectByName('pelvis'),spine=model?.getObjectByName('spine_01');
 if(!pelvis?.isBone||!spine?.isBone)return null;
 const rawPelvis=new THREE.Quaternion(),rawSpine=new THREE.Quaternion(),worldPelvis=new THREE.Quaternion(),worldSpine=new THREE.Quaternion(),parent=new THREE.Quaternion(),turn=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
 let applied=false,yaw=null,reverse=false,target=0;
 const restore=()=>{if(!applied)return;pelvis.quaternion.copy(rawPelvis);spine.quaternion.copy(rawSpine);applied=false;};
 return{
  restore,
  reset(){restore();yaw=null;target=0;reverse=false;},
  direction({forward,lateral}){const d=resolveFpsLocomotionDirection({forward,lateral,previousReverse:reverse});reverse=d.reverse;target=d.yaw;return d;},
  apply({enabled=true,dt=0,immediate=false}={}){
   restore();if(!enabled){yaw=null;target=0;reverse=false;return;}
   yaw=yaw===null||immediate?target:yaw+(target-yaw)*(1-Math.exp(-Math.max(0,dt)*24));
   if(Math.abs(yaw)<1e-5)return;
   rawPelvis.copy(pelvis.quaternion);rawSpine.copy(spine.quaternion);
   pelvis.getWorldQuaternion(worldPelvis);spine.getWorldQuaternion(worldSpine);
   turn.setFromAxisAngle(up,yaw);worldPelvis.premultiply(turn);
   pelvis.parent.getWorldQuaternion(parent).invert();pelvis.quaternion.copy(parent).multiply(worldPelvis).normalize();pelvis.updateWorldMatrix(false,true);
   // 恢復spine的原世界朝向：武器／手臂不跟腿一起轉向移動方向。
   spine.parent.getWorldQuaternion(parent).invert();spine.quaternion.copy(parent).multiply(worldSpine).normalize();spine.updateWorldMatrix(false,true);applied=true;
  },
  diagnostics(){return{yaw,target,reverse,applied};},
 };
}
