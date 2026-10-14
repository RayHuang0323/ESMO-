import * as THREE from 'three';

// 每個角色私有的呈現約束。原GLB socket、骨長、動畫來源及權威frame不變。
// 真狙擊槍的木護面下緣作者握點，與來源socket分開保存；見SOURCES.md。
// 長槍從手槍伸臂姿態收回；雙臂只旋轉既有骨骼，不伸長或搬動骨節。
const RETRACTION = Object.freeze({pistol:.10,smg:.39,rifle:.535,sniper:.61,shotgun:.575});
// 真 CC0 木護面 Cube001 三角1180下緣的作者握點；原GLB socket仍保留。
const SNIPER_SOURCE_SUPPORT=new THREE.Vector3(...[1.304199934,0.0797999948,0]);
const SNIPER_AUTHORED_SUPPORT=new THREE.Vector3(...[0.9,0.019713964452570676,0]);
const PALM = new THREE.Vector3(0,.055,.015);
// 真CC0 Pistol_Aim_Neutral第0秒的左手相對右手姿態。
// 以相同握姿跟隨真射擊抬槍，不能沿用Shoot中已鬆開的支撐手翻向。
const SUPPORT_ROTATION=new THREE.Quaternion(.09716844675243441,.4184158784275468,.14039624318795124,-.8920624079010891).normalize();
// 長槍：掌面朝槍械+Y、指長沿槍械+Z、四指排列沿槍械+X護木。
// 相對hand_r（槍械已繞Z轉90度）的正交基，與手槍雙手包覆分開。
const FORE_END_ROTATION=new THREE.Quaternion(0,Math.SQRT1_2,Math.SQRT1_2,0);
const X_AXIS=new THREE.Vector3(1,0,0),Y_AXIS=new THREE.Vector3(0,1,0);
const FINGER_FLEX=Object.freeze({
  r:[[.35,.75,.55],[1.12,1.05,.62],[1.20,.98,.65],[1.15,.92,.58]],
  l:[[1.05,1.05,.65],[1.12,1.08,.65],[1.18,1.02,.62],[1.10,.94,.60]],
});
// 狹窄狙擊護木依真GLB表面離線配握；只保存原指骨角度，runtime不跑搜尋。
const SNIPER_SUPPORT_FLEX=Object.freeze([[1.35,1.3,0.4],[1.35,1.3,0.4],[1.35,1.3,0.4],[1.35,1.3,0.4]]);
// 真Aim手指骨的+Y沿指節、左右指根的±Y四分之一轉把屈曲朝掌面。
// 明確三節屈曲而非移動指尖／放大假手套；右食指仍保留扳機姿態。

export function createFpsSupportGripPose({model,presentation}) {
  if (!model || presentation?.weaponPose !== 'hand_r') return null;
  const chains=['r','l'].map(side=>['upperarm','lowerarm','hand'].map(name=>model.getObjectByName(`${name}_${side}`)));
  if(chains.some(chain=>chain.some(bone=>!bone?.isBone)))return null;
  const spine=model.getObjectByName('spine_03');if(!spine?.isBone)return null;
  const fingers=['r','l'].flatMap(side=>['index','middle','ring','pinky'].flatMap((name,digit)=>[1,2,3].map((joint)=>({bone:model.getObjectByName(`${name}_0${joint}_${side}`),side,digit,joint}))));
  const thumbs=['r','l'].flatMap(side=>[1,2,3].map(joint=>model.getObjectByName(`thumb_0${joint}_${side}`)));
  if(fingers.some(row=>!row.bone?.isBone)||thumbs.some(bone=>!bone?.isBone))return null;
  const bones=[...chains.flat(),...fingers.map(row=>row.bone),...thumbs],raw=bones.map(bone=>bone.quaternion.clone());
  const p=Array.from({length:18},()=>new THREE.Vector3());
  const q=Array.from({length:6},()=>new THREE.Quaternion());
  let applied=false,status='not-applied',distance=null,reach=null,limit=null,supportReachAdjustment=0;
  function restore(){
    if(!applied)return;
    bones.forEach((bone,i)=>bone.quaternion.copy(raw[i]));applied=false;
  }
  function worldRotation(bone,desired){
    bone.parent.getWorldQuaternion(q[5]).invert();
    bone.quaternion.copy(q[5]).multiply(desired).normalize();
    // 求解只需要臂鏈；手指與衣料在既有syncAnchors統一更新一次。
    bone.updateWorldMatrix(false,false);
  }
  function solve(chain,target,handRotation){
    const [upper,lower,hand]=chain;
    upper.getWorldPosition(p[0]);lower.getWorldPosition(p[1]);hand.getWorldPosition(p[2]);
    const a=p[0].distanceTo(p[1]),b=p[1].distanceTo(p[2]);
    p[3].subVectors(target,p[0]);const d=p[3].length();
    reach=d;limit=a+b;
    if(!Number.isFinite(d)||d>=a+b-1e-5||d<=Math.abs(a-b)+1e-5)return false;
    p[3].divideScalar(d);
    // 肘朝下且稍向外，避免直臂／跨中線時極點翻轉。
    spine.getWorldPosition(p[4]);
    p[4].subVectors(p[0],p[4]);p[4].y=0;p[4].normalize().multiplyScalar(.25);p[4].y=-1;
    p[4].addScaledVector(p[3],-p[4].dot(p[3])).normalize();
    const along=(a*a-b*b+d*d)/(2*d),height=Math.sqrt(Math.max(0,a*a-along*along));
    p[5].copy(p[0]).addScaledVector(p[3],along).addScaledVector(p[4],height);
    p[6].subVectors(p[1],p[0]).normalize();p[7].subVectors(p[5],p[0]).normalize();
    q[0].setFromUnitVectors(p[6],p[7]);upper.getWorldQuaternion(q[1]);q[0].multiply(q[1]);worldRotation(upper,q[0]);
    lower.getWorldPosition(p[1]);hand.getWorldPosition(p[2]);
    p[6].subVectors(p[2],p[1]).normalize();p[7].subVectors(target,p[1]).normalize();
    q[0].setFromUnitVectors(p[6],p[7]);lower.getWorldQuaternion(q[1]);q[0].multiply(q[1]);worldRotation(lower,q[0]);
    worldRotation(hand,handRotation);
    hand.getWorldPosition(p[2]);return p[2].distanceTo(target)<1e-4;
  }
  return {
    restore,
    apply({enabled=true}={}) {
      restore();distance=null;reach=null;limit=null;supportReachAdjustment=0;
      if(!enabled){status='animation-owned';return;}
      const family=presentation.weaponFamily,weapon=presentation.weaponGroups[family],socket=presentation.weaponSockets[family]?.support;
      if(!weapon||!socket||!Number.isFinite(RETRACTION[family])){status='missing-socket';return;}
      const authoredSupport=family==='sniper'&&weapon.userData.esmoAuthoredWeapon?.imported&&socket.position.equals(SNIPER_SOURCE_SUPPORT);
      bones.forEach((bone,i)=>raw[i].copy(bone.quaternion));applied=true;
      model.updateWorldMatrix(true,false);
      const right=chains[0][2],left=chains[1][2];
      right.getWorldQuaternion(q[2]);q[3].copy(q[2]).multiply(family==='pistol'?SUPPORT_ROTATION:FORE_END_ROTATION);model.getWorldScale(p[8]);
      right.getWorldPosition(p[9]);
      p[10].set(0,1,0).applyQuaternion(q[2]).normalize();
      p[11].copy(p[9]).addScaledVector(p[10],-(authoredSupport ? .38 : RETRACTION[family])*p[8].y);
      // 原Pistol_Shoot會把右手推向身體外側。握槍中心留在胸前，
      // 保留clip的真槍管朝向／上揚；不能讓左臂跨越不可達的側向跨度。
      chains[0][0].getWorldPosition(p[14]);chains[1][0].getWorldPosition(p[15]);
      p[17].subVectors(p[14],p[15]);p[17].y=0;p[17].normalize();
      const centre=(p[14].dot(p[17])+p[15].dot(p[17]))*.5;
      p[11].addScaledVector(p[17],centre+.045*p[8].y-p[11].dot(p[17]));
      if(authoredSupport){
        // 蹲姿clip會縮短真臂鏈；沿槍軸收回必要距離，留20mm餘裕。
        // 解析直線／可達球交點，不移動socket、不伸骨、不用輸入state猜姿態。
        weapon.updateMatrix();
        p[12].copy(SNIPER_AUTHORED_SUPPORT).applyMatrix4(weapon.matrix).multiply(p[8]).applyQuaternion(q[2]);
        left.getWorldScale(p[13]);p[14].copy(PALM).multiply(p[13]).applyQuaternion(q[3]);
        p[15].copy(p[11]).add(p[12]).sub(p[14]);
        chains[1][0].getWorldPosition(p[0]);chains[1][1].getWorldPosition(p[1]);left.getWorldPosition(p[2]);
        const radius=p[0].distanceTo(p[1])+p[1].distanceTo(p[2])-.020*p[8].y;
        p[3].subVectors(p[15],p[0]);
        if(p[3].length()>radius){
          const along=p[3].dot(p[10]),radicand=radius*radius-p[3].lengthSq()+along*along;
          if(radicand<0){restore();status='support-unreachable';return;}
          const withdrawal=along-Math.sqrt(radicand);
          if(withdrawal<0||withdrawal>.12*p[8].y){restore();status='support-unreachable';return;}
          supportReachAdjustment=withdrawal;p[11].addScaledVector(p[10],-withdrawal);
        }
      }
      if(!solve(chains[0],p[11],q[2])){restore();status='right-unreachable';return;}
      right.getWorldPosition(p[9]);
      // 同 syncAnchors 的剛體槍械變換：不繼承手骨非均勻scale。
      weapon.updateMatrix();
      p[12].copy(authoredSupport?SNIPER_AUTHORED_SUPPORT:socket.position).applyMatrix4(weapon.matrix).multiply(p[8]).applyQuaternion(q[2]).add(p[9]);
      left.getWorldScale(p[13]);
      p[14].copy(PALM).multiply(p[13]).applyQuaternion(q[3]);
      p[15].copy(p[12]).sub(p[14]);
      if(!solve(chains[1],p[15],q[3])){restore();status='support-unreachable';return;}
      for(const {bone,side,digit,joint} of fingers){
        const angle=(side==='l'&&family==='sniper'?SNIPER_SUPPORT_FLEX:FINGER_FLEX[side])[digit][joint-1];
        bone.quaternion.setFromAxisAngle(X_AXIS,angle);
        if(joint===1){q[4].setFromAxisAngle(Y_AXIS,side==='r'?-Math.PI/2:Math.PI/2);bone.quaternion.premultiply(q[4]);}
      }
      // 支撐拇指從原Aim張開姿態對掌；右拇指保留來源已有握把姿態。
      if(family==='sniper'){
        thumbs[3].quaternion.set(...[0.9851086576163256,-0.00174821076138236,0.1597999021514165,-0.06341819708011906]).normalize();
        thumbs[4].quaternion.setFromAxisAngle(X_AXIS,1.95);thumbs[5].quaternion.setFromAxisAngle(X_AXIS,0.3);
      }else{
        thumbs[3].quaternion.set(.2474129945,.9457944632,.2034414262,.0535840280).normalize();
        thumbs[4].quaternion.setFromAxisAngle(X_AXIS,.65);thumbs[5].quaternion.setFromAxisAngle(X_AXIS,.55);
      }
      left.localToWorld(p[16].copy(PALM));distance=p[16].distanceTo(p[12]);
      status=distance<1e-4?'contact':'contact-error';
      if(status!=='contact')restore();
    },
    diagnostics(){
      const family=presentation.weaponFamily,weapon=presentation.weaponGroups[family],socket=presentation.weaponSockets[family]?.support;
      const authoredSupport=!!(family==='sniper'&&weapon?.userData.esmoAuthoredWeapon?.imported&&socket?.position.equals(SNIPER_SOURCE_SUPPORT));
      return {status,applied,supportContactMetres:distance,wristReachMetres:reach,armLengthMetres:limit,
        authoredSupport,supportReachAdjustmentMetres:supportReachAdjustment,
        supportLocal:(authoredSupport?SNIPER_AUTHORED_SUPPORT:socket?.position)?.toArray()};
    },
  };
}
