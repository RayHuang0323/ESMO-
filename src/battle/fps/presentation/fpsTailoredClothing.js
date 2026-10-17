import * as THREE from "three";
import { splitTailoredSeams } from "./fpsTailoredSeams.js";
import { applyMajorWovenTextiles, applyMajorClothSurfaceDetail } from './fpsTextileMaterials.js';
import { applyAuthoredPosedSleeve } from './fpsPosedSleeve.js';
import { applyFpsGloveSurface } from './fpsGloveSurface.js';
import { applyFpsGloveAnatomy } from './fpsGloveAnatomy.js';
import { applyFpsGloveProportion } from './fpsGloveProportion.js';
import { createFpsGloveJointCoordinates } from './fpsGloveJointCoordinates.js';

// Major-only derivative of the licensed rig: one continuous skin, no new
// skeleton and no source-geometry mutation. Entries live only while acquired.
const cache = new WeakMap();
export const TAILORED_PROXY = /^C2C_(CombatTopShell|TacticalPantsWaist|CombatTopNeckline|NeckGaiter|HeadBase|NoseBridge|CombatSleeveUpper|CombatSleeve|ElbowJoint|GloveCuff|Glove|TacticalPantsThigh|TacticalPantsCalf|KneeJoint|BootCuff|Boot)(_|$)/;

// Broad garment construction is baked once into the shared bind geometry.
// +Z is the inside of the elbow in the licensed hold/fire poses, verified
// against the posed shoulder/elbow/wrist bisector, not the camera direction.
export function sleeveCutRelief(x, up, front, upper, total) {
  const fold = (value, width) => Math.max(0, 1-Math.abs(value)/width);
  const radius = Math.max(.025, Math.hypot(up, front));
  const inside = THREE.MathUtils.smoothstep(front / radius, .05, .65);
  const outside = THREE.MathUtils.smoothstep(-front / radius, .05, .65);
  const top = THREE.MathUtils.smoothstep(up / radius, -.15, .55);
  const elbow = x - upper;
  let compression = 0;
  for (const [center, slope, height] of [[-.046, .28, .025], [-.015,.04,.020], [.014, -.20, .030]]) {
    const delta = elbow - center + up * slope;
    // Pressure folds die out across the cloth rather than running as two
    // uniform ribs around the joint. Each fold has a different wedge span.
    const wedge=1-THREE.MathUtils.smoothstep(Math.abs(up+(center<0?.012:-.008)),center<0?.030:.018,center<0?.115:.100);
    compression += wedge*(height * fold(delta,center===-.015?.013:.022)-.018*fold(delta-.024,.014));
  }
  // Broad peaks/valleys use existing vertex rows. Shoulder and wrist folds
  // reach the silhouette; their angular masks prevent circumferential rings.
  const shoulder=top*(.031*fold(x-.040,.025)-.014*fold(x-.066,.018));
  const patch=outside*fold(elbow-.008,.068)*fold(up,.075);
  const wristPhase=x-(total-.025)+up*.30;
  const wrist=(inside*.90+outside*.72+top*.20)*
    (.014*fold(wristPhase,.032)-.008*fold(wristPhase-.017,.009));
  return { relief: THREE.MathUtils.clamp(shoulder+inside*compression+patch*.008+wrist,-.020,.040),patch,
    shoulder,compression:inside*compression,wrist };
}

export function sleevePanelProjection(x, up, front, frontDepth, rearDepth, options={}) {
  // The interior is a plane, not a radial bulge. A 20mm bevel spans the
  // existing vertex rows and meets the untouched cloth without new topology.
  const upper=options.upper??.251,total=options.total??.4945;
  const forearm=x>upper+.045;
  const start=forearm?upper+.055:.060,end=forearm?total-.105:.185;
  const width=THREE.MathUtils.lerp(forearm ? .054 : .057,forearm ? .035 : .045,THREE.MathUtils.clamp((x-start)/(end-start),0,1));
  const distance=Math.max(start-x,x-end,Math.abs(up+(forearm ? .004 : .014))-width);
  const coverage=THREE.MathUtils.clamp(1-Math.max(0,distance)/.020,0,1)*
    THREE.MathUtils.smoothstep(Math.abs(front),.026,.046);
  const sign=front<0?-1:1;
  const depths=forearm?(options.forearmDepths??[frontDepth*.78,rearDepth*.78]):[frontDepth,rearDepth];
  // A forearm is loose cloth with directional volume, not a flat rigid panel.
  // Two unequal diagonal folds fade into the elbow and sewn cuff; upper-arm
  // yoke planes remain unchanged. This is bind geometry, not shader embossing.
  const drape=forearm?THREE.MathUtils.smoothstep(x,upper+.055,upper+.080)*(1-THREE.MathUtils.smoothstep(x,total-.090,total-.065))*(
    .014*Math.exp(-Math.pow((x-(total-.145)+up*(sign>0?.32:-.22))/.027,2))-
    .009*Math.exp(-Math.pow((x-(total-.180)-up*(sign>0?.18:-.28))/.022,2))):0;
  const planeDepth=sign*((sign>0?depths[0]:depths[1])-(forearm ? .12 : .045)*(x-(forearm ? (start+end)*.5 : .12))+drape);
  return { coverage,planeDepth,panel:forearm?'forearm':'upper',shift:THREE.MathUtils.clamp((planeDepth-front)*coverage,-.040,.040) };
}

// Broad sewn pieces are baked into the existing skin, not rigid armour or
// screen-space lines. The shoulder yoke follows the upper-arm cap; the hem
// terminates before the black glove and remains distinct in side views.
export function sleeveConstruction(x,up,front,upper,total) {
  const smooth=THREE.MathUtils.smoothstep;
  const yoke=smooth(x,.015,.040)*(1-smooth(x,.105,.140))*smooth(up,-.045,.020);
  const cap=yoke*smooth(up,.040,.065)*(1-smooth(Math.abs(front),.075,.110));
  const cuff=smooth(x,total-.055,total-.035)*(1-smooth(x,total-.012,total-.002));
  const elbow=smooth(-front,.015,.050)*(1-smooth(Math.abs(x-upper),.045,.075))*
    (1-smooth(Math.abs(up),.050,.080));
  const hemEdge=(1-smooth(Math.abs(x-(total-.033)),.003,.009))*cuff;
  // A folded cuff has a broad outer band and a short return wall. The old
  // isolated peak at -15mm made a flared bell, then smoothed into the glove.
  const hemBand=smooth(x,total-.052,total-.035)*(1-smooth(x,total-.015,total-.004));
  const hemWall=smooth(x,total-.016,total-.010)*(1-smooth(x,total-.004,total+.004));
  return {yoke,cap,cuff,elbow,capHeight:.072-.16*(x-.040),
    hemLift:.004*hemBand,hemReturn:-.007*hemWall,
    shade:THREE.MathUtils.clamp(.80+.20*yoke-.20*elbow+.20*hemBand-.26*hemEdge-.24*hemWall,0,1)};
}

function zone(name) {
  if (/Head|neck/i.test(name)) return 2;
  if (/hand|index|middle|ring|pinky|thumb/i.test(name)) return 3;
  if (/foot|ball/i.test(name)) return 3;
  if (/pelvis|thigh|calf/i.test(name)) return 1;
  return 0;
}

// Sew a return-facing cuff into the same skin/material batch. Its sampled
// elliptical outline and weights come from the actual sleeve, not a rigid
// cylinder attached to a wrist. Six profile points expose an 6mm rolled edge
// and a full inner return instead of ending after the short rounded lip.
function appendFoldedCuffs(geometry,arms) {
  const oldCount=geometry.attributes.position.count,attrs=geometry.attributes;
  const added=Object.fromEntries(Object.keys(attrs).map(key=>[key,[]])),indices=[];
  const methods=['getX','getY','getZ','getW'],radialSegments=13;
  let count=oldCount;
  for(const arm of arms){
    const total=arm.upper+arm.lower,ringPoints=radialSegments+1,candidates=[];
    // A long returned face must follow the taper and bone weights at each
    // row. Extruding one wrist sample through the whole cuff buried its
    // elbow-side seam inside the wider forearm and stretched the hand skin.
    for(let i=0;i<oldCount;i++){
      const point=new THREE.Vector3().fromBufferAttribute(attrs.position,i);
      if((point.x>0)!==(arm.shoulder.x>0)||attrs.esmoSleeveCoord.getW(i)<.5)continue;
      const q=point.sub(arm.shoulder),x=q.dot(arm.axis),y=q.dot(arm.upAxis),z=q.dot(arm.frontAxis),radius=Math.hypot(y,z);
      if(x>total-.12&&x<total-.006&&radius>.01)candidates.push({nearest:i,x,y,z,radius});
    }
    const sampleRow=along=>Array.from({length:ringPoints},(_,step)=>{
      const angle=(step%radialSegments)/radialSegments*Math.PI*2,up=Math.cos(angle),front=Math.sin(angle);
      // The sewn root stays fixed; the rolled lip gathers unevenly around the
      // arm instead of copying an identical circular band along every row.
      const lipWeight=THREE.MathUtils.smoothstep(-along,.020,.065);
      const lipShift=lipWeight*(.0065*Math.sin(angle+.3)+.0015*Math.sin(angle*2+1.3));
      const x=total+along+lipShift;
      let nearest,best=Infinity;
      for(const sample of candidates){
        const distance=(sample.x-x)**2+(1-(sample.y*up+sample.z*front)/sample.radius)*.02;
        if(distance<best){best=distance;nearest=sample;}
      }
      if(!nearest)throw new Error('布袖翻邊缺少實際袖面與骨權重樣本');
      return {...nearest,x,up,front,segment:step};
    });
    // A short 45mm return avoids the former wide strap silhouette. Thirteen
    // angular samples and five profile strips allocate 236 triangles to an
    // actual 6mm round cloth edge, including both sewn vent end sections.
    const profile=[[-.020,.002],[-.065,.006],[-.067121320,.005121320],[-.068,.003],[-.065,0],[-.020,.004]];
    const sampled=new Map(),rows=profile.map(([along,offset],row)=>{
      if(!sampled.has(along))sampled.set(along,sampleRow(along));
      const section=sampled.get(along);
      return section.map(sample=>{
        // The folded lip gathers more than its sewn root. Two unequal soft
        // lobes break the rigid, constant-radius wristband silhouette while
        // the matching outer/inner lip rows still retain their true 6mm wall.
        const angle=sample.segment/radialSegments*Math.PI*2;
        const lipWeight=THREE.MathUtils.smoothstep(-profile[row][0],.020,.065);
        const gather=.003*Math.sin(angle+1.1)+lipWeight*(.003*Math.sin(angle*2+.5)+.001*Math.sin(angle*3+1.4));
        // 平順真來源截面的唇緣，縫合根與來源骨權重保持。
        const step=sample.segment%radialSegments;
        const radiusNear=(section[(step+radialSegments-1)%radialSegments].radius+section[(step+1)%radialSegments].radius)*.25+sample.radius*.5;
        const radius=THREE.MathUtils.lerp(sample.radius,radiusNear,lipWeight)+offset+gather;
        const point=arm.shoulder.clone().addScaledVector(arm.axis,sample.x).addScaledVector(arm.upAxis,sample.up*radius).addScaledVector(arm.frontAxis,sample.front*radius);
        return {...sample,radius,point,row};
      });
    });
    // Unwrap the real surface, including its U turn. Signed axial distance
    // reversed the same texels through the lip; circular circumference also
    // stretched the weave on the sampled non-circular sleeve.
    const u=rows.map(row=>{let length=0;return row.map((sample,i)=>{if(i)length+=sample.point.distanceTo(row[i-1].point);return length/1.5;});});
    const v=rows.map((row,r)=>row.map((sample,i)=>r?rows.slice(1,r+1).reduce((sum,part,j)=>sum+part[i].point.distanceTo(rows[j][i].point),0)/1.5:0));
    // Separate profile strips give the return wall its own normals while
    // preserving continuous positions/weights along the sewn surface.
    const armStart=count,ventSegment=2,ventSegmentCount=2;
    for(let strip=0;strip<profile.length-1;strip++){
      const start=count;
      for(const row of [strip,strip+1])for(const sample of rows[row]){
        const {point:p,radius,x}=sample;
        // The lit return edge fades into the recessed stitch shadow; both
        // retain the shirt hue instead of reading as a dark glove bracelet.
        const clothTone=row===5?.42:row===4?.82:1;
        for(const [key,attr] of Object.entries(attrs)){
          // Give the folded strip its own continuous cloth UVs; copying one
          // source vertex's UV on both edges stretched a single texel row.
          const values=key==='position'?p.toArray():key==='color'?[clothTone,clothTone,clothTone]:key==='uv'?[u[row][sample.segment],v[row][sample.segment]]:key==='esmoCuffFace'?[1]:key==='esmoCuffReverse'?[strip===0?1:0]:key==='esmoSleeveCoord'?[x-arm.upper,sample.up*radius,sample.front*radius,1]:methods.slice(0,attr.itemSize).map(fn=>attr[fn](sample.nearest));
          added[key].push(...values);
        }
        count++;
      }
      for(let step=0;step<radialSegments;step++){
        if(step>=ventSegment&&step<ventSegment+ventSegmentCount)continue;
        const next=step+1,a=start+step,b=start+next,c=start+ringPoints+step,d=start+ringPoints+next;
        // Bind-axis handedness differs between arms.
        if(arm.axis.x<0)indices.push(a,b,c,b,d,c);else indices.push(a,c,b,b,c,d);
      }
    }
    // A sewn cuff has an open placket, not a rigid closed bracelet. Close
    // both cut edges through the actual six-point cloth profile; these true
    // end sections expose the folded layers without a new mesh or material.
    const profileVertexRows=[0,1,3,5,7,9];
    for(const step of [ventSegment,ventSegment+ventSegmentCount]){
      const angle=step/radialSegments*Math.PI*2;
      const intoVent=arm.upAxis.clone().multiplyScalar(-Math.sin(angle)).addScaledVector(arm.frontAxis,Math.cos(angle)).multiplyScalar(step===ventSegment?1:-1);
      for(const face of [[0,1,5],[1,4,5],[1,2,4],[2,3,4]]){
        const [a,b,c]=face.map(row=>armStart+profileVertexRows[row]*ringPoints+step);
        const [pa,pb,pc]=face.map(row=>rows[row][step].point);
        if(pb.clone().sub(pa).cross(pc.clone().sub(pa)).dot(intoVent)>0)indices.push(a,b,c);else indices.push(a,c,b);
      }
    }
  }
  for(const [key,attr] of Object.entries(attrs)){
    const Type=key==='skinIndex'?Uint16Array:Float32Array,values=new Type(count*attr.itemSize);
    for(let i=0;i<oldCount;i++)for(let component=0;component<attr.itemSize;component++)values[i*attr.itemSize+component]=attr[methods[component]](i);
    values.set(added[key],oldCount*attr.itemSize);geometry.setAttribute(key,new THREE.BufferAttribute(values,attr.itemSize,attr.normalized));
  }
  const previous=Array.from(geometry.index.array),offset=previous.length;
  geometry.setIndex([...previous,...indices]);geometry.addGroup(offset,indices.length,0);
  geometry.userData.esmoCuffRoll={addedVertices:count-oldCount,addedTriangles:indices.length/3,radialSegments,ventSegment:2,ventSegmentCount:2,ringPoints:radialSegments+1,profileRows:10,outerRow:2,lipRow:5,innerRow:7,returnStartRow:8,returnEndRow:9,returnLength:.045,verticesPerArm:10*(radialSegments+1),textureMetresPerUv:1.5,uvSpace:'measured-surface-arclength',sourceWeights:'per-profile-row',thickness:.006,source:'sampled-sleeve-skin',extraDraws:1};
}

function derive(source) {
  const geometry = source.geometry.clone();
  const headIndex = source.skeleton.bones.findIndex(b => b.name === "Head");
  const pelvisIndex = source.skeleton.bones.findIndex(b => b.name === "pelvis");
  const inverseBind = source.bindMatrix.clone().invert();
  const bindPoint = i => new THREE.Vector3().setFromMatrixPosition(source.skeleton.boneInverses[i].clone().invert()).applyMatrix4(inverseBind);
  const necklineY = bindPoint(headIndex).y - .035, waistY = bindPoint(pelvisIndex).y + .08;
  splitTailoredSeams(geometry, [necklineY, waistY]);
  // Three oblique crease rows focus on the real inner elbow. Conforming edge
  // subdivision sews neighbouring faces without T junctions; the saved outer
  // surface triangles fund a smoother ten-segment returned cloth cuff.
  const sleeveCuts=['l','r'].flatMap(side=>{
    const bone=name=>source.skeleton.bones.findIndex(b=>b.name===`${name}_${side}`);
    const shoulder=bindPoint(bone('upperarm')),elbow=bindPoint(bone('lowerarm')),wrist=bindPoint(bone('hand'));
    const axis=wrist.clone().sub(shoulder).normalize(),upper=shoulder.distanceTo(elbow),total=upper+elbow.distanceTo(wrist);
    const frontAxis=new THREE.Vector3(0,0,1).addScaledVector(axis,-axis.z).normalize();
    const upAxis=new THREE.Vector3().crossVectors(frontAxis,axis).multiplyScalar(axis.x<0?-1:1);
    // Oblique crease rows follow the actual pressure-fold phase, rather than
    // cutting perpendicular to the arm and missing the peak on the top/bottom.
    return [[upper-.046,.28],[upper-.015,.04],[upper+.014,-.20]].map(([along,slope])=>{
      const normal=axis.clone().addScaledVector(upAxis,slope),length=normal.length();
      return {normal:normal.divideScalar(length).toArray(),constant:(axis.dot(shoulder)+slope*upAxis.dot(shoulder)+along)/length};
    });
  });
  const rows=splitTailoredSeams(geometry,sleeveCuts,{metadataKey:'esmoSleeveRows',minFrontZ:bindPoint(source.skeleton.bones.findIndex(b=>b.name==='upperarm_l')).z+.012});
  if(rows.addedTriangles>450||rows.crossingTriangles||rows.maxCoverageError>1e-8||rows.maxDroppedWeight>.01)throw new Error('袖裁片細分超出幾何／蒙皮守門');
  const originalPosition = geometry.getAttribute("position"), joints = geometry.getAttribute("skinIndex"), weights = geometry.getAttribute("skinWeight");
  if (!originalPosition) throw new Error("連續服裝缺少position");
  // GLTF uses interleaved attributes; raw array offsets are not vertex offsets.
  const positions = new Float32Array(originalPosition.count * 3);
  for (let i = 0; i < originalPosition.count; i++) positions.set([originalPosition.getX(i), originalPosition.getY(i), originalPosition.getZ(i)], i * 3);
  const pos = new THREE.BufferAttribute(positions, 3);
  geometry.setAttribute("position", pos); geometry.deleteAttribute("normal");
  if (!pos || !joints || !weights || !geometry.index) throw new Error("連續服裝缺少真蒙皮資料");
  // Record the actual new cut vertices before smoothing/inflation. Restore
  // their along-plane position afterwards so smoothing cannot move an elbow
  // pressure ridge away from the phase used by geometry and the cloth shader.
  const rowPlanes=rows.planes.map(plane=>({normal:new THREE.Vector3().fromArray(plane.normal),constant:plane.constant}));
  const rowMembership=new Int8Array(pos.count).fill(-1),rowPoint=new THREE.Vector3();
  for(let i=rows.originalVertices;i<pos.count;i++){
    rowPoint.fromBufferAttribute(pos,i);
    let nearest=Infinity;
    rowPlanes.forEach((plane,index)=>{const distance=Math.abs(plane.normal.dot(rowPoint)-plane.constant);if(distance<nearest&&distance<2e-7){nearest=distance;rowMembership[i]=index;}});
  }
  const zones = new Uint8Array(pos.count), adjacent = Array.from({ length: pos.count }, () => new Set());
  // Neck weights extend into the trapezius. They are animation influence,
  // not a garment seam; the stand collar ends 3.5cm below the skull-base pivot.
  const components = ["getX", "getY", "getZ", "getW"];
  const wrists=['l','r'].map(side=>{
    const hand=source.skeleton.bones.findIndex(b=>b.name===`hand_${side}`),elbow=source.skeleton.bones.findIndex(b=>b.name===`lowerarm_${side}`);
    if(hand<0||elbow<0)throw new Error('連續服裝缺少真腕口骨');
    const origin=bindPoint(hand);return{origin,direction:origin.clone().sub(bindPoint(elbow)).normalize()};
  });
  const gloveBlend=new Float32Array(pos.count),colours=new Float32Array(pos.count*3),point=new THREE.Vector3();
  let gloveVertices=0,transitionVertices=0;
  for(let i=0;i<pos.count;i++){
    point.fromBufferAttribute(pos,i);
    const blend=Math.max(...wrists.map(w=>THREE.MathUtils.clamp((point.clone().sub(w.origin).dot(w.direction)+.010)/.020,0,1)));
    gloveBlend[i]=blend;if(blend>0)gloveVertices++;if(blend>0&&blend<1)transitionVertices++;
    // New private colour field, never the source superhero paint. Continuous
    // interpolation across the real wrist replaces jagged material islands.
    colours.set([1-.66*blend,1-.61*blend,1-.66*blend],i*3);
  }
  for (let i = 0; i < pos.count; i++) {
    let best = -1, joint = 0;
    for (let j = 0; j < 4; j++) { const w = weights[components[j]](i); if (w > best) { best = w; joint = joints[components[j]](i); } }
    zones[i] = zone(source.skeleton.bones[joint]?.name || "");
    if (zones[i] === 2 && pos.getY(i) < necklineY) zones[i] = 0;
    if (zones[i] < 2) zones[i] = pos.getY(i) < waistY ? 1 : 0;
  }
  const buckets = Array.from({ length: 4 }, () => []), index = geometry.index;
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    adjacent[a].add(b).add(c); adjacent[b].add(a).add(c); adjacent[c].add(a).add(b);
    let z = zones[a] === zones[b] || zones[a] === zones[c] ? zones[a] : zones[b];
    const centerY=(pos.getY(a)+pos.getY(b)+pos.getY(c))/3;
    if(z!==3)z=centerY>=necklineY?2:centerY<waistY?1:0;
    if(z===3&&(gloveBlend[a]>0||gloveBlend[b]>0||gloveBlend[c]>0))z=0;
    buckets[z].push(a, b, c);
  }
  // UV/normal seams duplicate positions. Moving each copy independently tears
  // the surface, even when every original triangle is retained. Weld only the
  // derivative's deformation neighbourhood, never its UV/index/skin attributes.
  const seams = new Map(), welded = new Int32Array(pos.count), members = [];
  for (let i = 0; i < pos.count; i++) {
    const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map(v => v.toFixed(6)).join(",");
    let id = seams.get(key);
    if (id === undefined) { id = members.length; seams.set(key, id); members.push([]); }
    welded[i] = id; members[id].push(i);
  }
  const neighbours = members.map(() => new Set());
  for (let i = 0; i < pos.count; i++) for (const j of adjacent[i]) {
    if (welded[i] !== welded[j]) neighbours[welded[i]].add(welded[j]);
  }
  // Pin garment/anatomy boundaries instead of shrinking an open cloth edge.
  const movable = members.map((ids, id) => zones[ids[0]] < 2 &&
    ids.every(i => zones[i] === zones[ids[0]]) &&
    [...neighbours[id]].every(n => zones[members[n][0]] === zones[ids[0]]));
  const scratch = new Float32Array(pos.array.length);
  for (let pass = 0; pass < 12; pass++) {
    scratch.set(pos.array);
    for (let id = 0; id < members.length; id++) {
      const ids = members[id], i = ids[0];
      if (!movable[id] || !neighbours[id].size) continue;
      for (let axis = 0; axis < 3; axis++) {
        let sum = 0; for (const n of neighbours[id]) sum += pos.array[members[n][0] * 3 + axis];
        const value = pos.array[i * 3 + axis] * .7 + sum / neighbours[id].size * .3;
        for (const j of ids) scratch[j * 3 + axis] = value;
      }
    }
    pos.array.set(scratch);
  }
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute("normal");
  for (const ids of members) {
    const direction = new THREE.Vector3();
    let allowance = 0;
    for (const i of ids) {
      direction.add(new THREE.Vector3().fromBufferAttribute(normal, i));
      // The source wrist is ~30mm radius. Uniform 28mm padding plus an 18mm
      // hem made it ~79mm, so even a cloth fold looked like a rigid gauntlet.
      // Keep upper-arm ease, taper the forearm's allowance toward the wrist.
      const wrist=wrists[pos.getX(i)>0?0:1],fromWrist=new THREE.Vector3().fromBufferAttribute(pos,i).sub(wrist.origin).dot(wrist.direction);
      const taper=Math.abs(pos.getX(i))>.40?THREE.MathUtils.smoothstep(fromWrist,-.24,-.035):0;
      allowance += zones[i] === 0 ? THREE.MathUtils.lerp(.028,.008,taper) : zones[i] === 1 ? .025 : zones[i] === 3 ? .003 : 0;
    }
    direction.normalize().multiplyScalar(allowance / ids.length);
    const i = ids[0];
    const point = new THREE.Vector3().fromBufferAttribute(pos, i).add(direction);
    const row=ids.map(j=>rowMembership[j]).find(index=>index>=0);
    if(row!==undefined){const plane=rowPlanes[row];point.addScaledVector(plane.normal,plane.constant-plane.normal.dot(point));}
    for (const j of ids) pos.setXYZ(j, point.x, point.y, point.z);
  }
  pos.needsUpdate = true;
  // Each sleeve has its own pattern space, sewn to the bind pose. Body-space
  // x=0 stitches land on the chest, not on either arm. Keep original topology,
  // skin weights and shared textures; one private attribute costs no draw call.
  const sleeveCoords = new Float32Array(pos.count * 4);
  const sleeveArms = ['l','r'].map(side => {
    const joint = name => source.skeleton.bones.findIndex(b => b.name === `${name}_${side}`);
    const shoulder = bindPoint(joint('upperarm')), elbow = bindPoint(joint('lowerarm')), wrist = bindPoint(joint('hand'));
    const axis=wrist.clone().sub(shoulder).normalize();
    const frontAxis=new THREE.Vector3(0,0,1).addScaledVector(axis,-axis.z).normalize();
    const upAxis=new THREE.Vector3().crossVectors(frontAxis,axis).multiplyScalar(axis.x<0?-1:1);
    const frontSamples=[],rearSamples=[],forearmFront=[],forearmRear=[];
    const upper=elbow.clone().sub(shoulder).length(),lower=wrist.clone().sub(elbow).length();
    for(const ids of members){
      const i=ids[0];if(zones[i]!==0)continue;
      const delta=new THREE.Vector3().fromBufferAttribute(pos,i).sub(shoulder);
      const along=delta.dot(axis),up=delta.dot(upAxis),front=delta.dot(frontAxis);
      if(along>.060&&along<.190&&Math.abs(up)<.065&&Math.abs(front)>.035&&Math.abs(front)<.140)(front>0?frontSamples:rearSamples).push(Math.abs(front));
      if(along>upper+.055&&along<upper+lower-.105&&Math.abs(up)<.055&&Math.abs(front)>.018&&Math.abs(front)<.110)(front>0?forearmFront:forearmRear).push(Math.abs(front));
    }
    const depth=samples=>{if(samples.length<4)throw new Error('袖裁片缺少來源表面高度');samples.sort((a,b)=>a-b);return samples[Math.floor((samples.length-1)*.75)]+.0015;};
    return { shoulder,elbow,wrist,axis,frontAxis,upAxis,frontDepth:depth(frontSamples),rearDepth:depth(rearSamples),forearmDepths:[depth(forearmFront),depth(forearmRear)],upper,lower };
  });
  for (const ids of members) {
    const i = ids[0], p = new THREE.Vector3().fromBufferAttribute(pos,i);
    let closest;
    for (const arm of sleeveArms) {
      // One continuous axis avoids switching coordinate frames at the elbow.
      const start = arm.shoulder, end = arm.wrist;
      const axis = arm.axis, delta = p.clone().sub(start);
      const length = arm.upper + arm.lower, along = THREE.MathUtils.clamp(delta.dot(axis),0,length);
      const radial = delta.clone().addScaledVector(axis,-along);
      if (!closest || radial.lengthSq() < closest.distance) {
        closest = { distance:radial.lengthSq(), x:along, y:radial.dot(arm.upAxis), z:radial.dot(arm.frontAxis), arm };
      }
    }
    const q = closest, total=q.arm.upper+q.arm.lower;
    const beforeGlove=zones[i]===3&&q.x>total-.050&&q.x<total-.010&&gloveBlend[i]===0;
    const mask = zones[i] === 0 || beforeGlove ? THREE.MathUtils.smoothstep(q.x,.015,.045) *
      (1-THREE.MathUtils.smoothstep(q.x,total-.015,total+.005)) *
      (1-THREE.MathUtils.smoothstep(Math.sqrt(q.distance),.12,.18)) * (1-gloveBlend[i]) : 0;
    const cut = sleeveCutRelief(q.x,q.y,q.z,q.arm.upper,total);
    const projection=zones[i]===0?sleevePanelProjection(q.x,q.y,q.z,q.arm.frontDepth,q.arm.rearDepth,{upper:q.arm.upper,total,forearmDepths:q.arm.forearmDepths}):{coverage:0,shift:0};
    const direction = new THREE.Vector3();
    for(const j of ids)direction.add(new THREE.Vector3().fromBufferAttribute(normal,j));
    direction.normalize().multiplyScalar(cut.relief*mask*(1-projection.coverage));
    direction.addScaledVector(q.arm.frontAxis,projection.shift);
    const construction=sleeveConstruction(q.x,q.y,q.z,q.arm.upper,total);
    const radial=q.arm.upAxis.clone().multiplyScalar(q.y).addScaledVector(q.arm.frontAxis,q.z).normalize();
    direction.addScaledVector(radial,construction.hemLift*mask);
    direction.addScaledVector(q.arm.axis,construction.hemReturn*mask);
    // Flatten the shoulder cap into a bounded sloping yoke rather than
    // inflating the source anatomy. The existing upper/forearm planes stay.
    direction.addScaledVector(q.arm.upAxis,(construction.capHeight-q.y-direction.dot(q.arm.upAxis))*construction.cap*mask);
    direction.clampLength(0,.040);p.add(direction);
    for(const j of ids){
      pos.setXYZ(j,p.x,p.y,p.z);sleeveCoords.set([q.x-q.arm.upper,q.y,q.z,mask],j*4);
      // The broad rear reinforcement is readable beyond stitch-sized pixels.
      const shade=(1-mask*.26*cut.patch-.16*projection.coverage)*
        (1-mask*(1-construction.shade));
      for(let c=0;c<3;c++)colours[j*3+c]*=shade;
    }
  }
  geometry.setAttribute('esmoSleeveCoord',new THREE.BufferAttribute(sleeveCoords,4));
  // The actual folded return wall is geometry, not another pressure crease.
  // Keep broad sleeve bump/stitch relief off this small face; retain weave.
  geometry.setAttribute('esmoCuffFace',new THREE.BufferAttribute(new Float32Array(pos.count),1));
  // Only the exposed returned cloth face gets the reverse-dye role. The
  // rounded edge, inner wall, sewn root, glove and sleeve keep their own dye.
  geometry.setAttribute('esmoCuffReverse',new THREE.BufferAttribute(new Float32Array(pos.count),1));
  geometry.userData.esmoSleevePattern={space:'arm-bind',construction:'yoke-plane-directional-forearm-drape',profile:'shoulder-elbow-forearm-cuff',panelDepths:sleeveArms.map(a=>[a.frontDepth,a.rearDepth]),forearmDepths:sleeveArms.map(a=>a.forearmDepths),maxDisplacement:.040,extraTriangles:rows.addedTriangles,extraDraws:0};
  geometry.setAttribute('color',new THREE.BufferAttribute(colours,3));
  geometry.userData.esmoHandBlend={widthMetres:.020,gloveVertices,transitionVertices,wrists:wrists.map(w=>w.origin.toArray()),sourcePaintReused:false};
  geometry.clearGroups(); let offset = 0;
  for (let z = 0; z < buckets.length; z++) { if (buckets[z].length) geometry.addGroup(offset, buckets[z].length, z); offset += buckets[z].length; }
  geometry.setIndex(buckets.flat());
  appendFoldedCuffs(geometry,sleeveArms);
  // The original continuous sleeve kept occupying the cuff's inner return:
  // true hold-pose rays found 10/20 and 11/20 returned faces within 4mm of
  // it (some <0.13mm). Keep a tapered undersleeve clear of the folded layer;
  // the visible roll/profile and its sampled skin weights remain unchanged.
  let underlayerVertices=0;
  const underlayerPosition=geometry.attributes.position;
  const cuffStartVertex=geometry.attributes.position.count-geometry.userData.esmoCuffRoll.addedVertices;
  for(let i=0;i<cuffStartVertex;i++){
    if(geometry.attributes.esmoSleeveCoord.getW(i)<.45)continue;
    const arm=sleeveArms[underlayerPosition.getX(i)>0?0:1],total=arm.upper+arm.lower;
    const point=new THREE.Vector3().fromBufferAttribute(underlayerPosition,i),delta=point.clone().sub(arm.shoulder),along=delta.dot(arm.axis);
    if(along<=total-.100||along>=total-.010)continue;
    const radial=delta.addScaledVector(arm.axis,-along),radius=radial.length();
    const recess=Math.min(Math.max(0,radius-.026),.012*THREE.MathUtils.smoothstep(along,total-.100,total-.075)*(1-THREE.MathUtils.smoothstep(along,total-.035,total-.020)));
    if(recess<1e-7)continue;
    point.addScaledVector(radial,-recess/radius);underlayerPosition.setXYZ(i,point.x,point.y,point.z);underlayerVertices++;
  }
  geometry.userData.esmoCuffUnderlayer={movedVertices:underlayerVertices,maxRecessMetres:.012,runtimeSolver:false,extraTriangles:0,extraDraws:0};
  if(rows.addedTriangles+geometry.userData.esmoCuffRoll.addedTriangles>450)throw new Error('肘切面與袖口合計超出450tri預算');
  // Join the cuff indices into the existing fabric group: no extra draw call.
  const cuff=Array.from(geometry.index.array).slice(index.count),joined=[...buckets[0],...cuff,...buckets.slice(1).flat()];
  geometry.clearGroups();offset=0;
  for(let z=0;z<buckets.length;z++){const length=buckets[z].length+(z===0?cuff.length:0);if(length)geometry.addGroup(offset,length,z);offset+=length;}
  geometry.setIndex(joined);geometry.userData.esmoCuffRoll.extraDraws=0;
  geometry.userData.esmoSleevePattern.extraTriangles=rows.addedTriangles+geometry.userData.esmoCuffRoll.addedTriangles;
  applyAuthoredPosedSleeve(geometry,sleeveArms);
  applyFpsGloveSurface(geometry,source);
  applyFpsGloveAnatomy(geometry,source);
  applyFpsGloveProportion(geometry,source);
  createFpsGloveJointCoordinates(geometry,source);
  geometry.computeVertexNormals();
  // Smooth the entire sewn U-turn, including its apex. A rigid face-normal
  // seam here makes cloth read as a hard bracelet despite a curved profile.
  const sewnNormals=geometry.attributes.normal,sewnStart=geometry.attributes.position.count-geometry.userData.esmoCuffRoll.addedVertices;
  for(let arm=0;arm<2;arm++)for(let joint=0;joint<geometry.userData.esmoCuffRoll.profileRows/2-1;joint++)for(let i=0;i<geometry.userData.esmoCuffRoll.ringPoints;i++){
    const ring=geometry.userData.esmoCuffRoll.ringPoints,a=sewnStart+arm*geometry.userData.esmoCuffRoll.verticesPerArm+(joint*2+1)*ring+i,b=a+ring;
    const n=new THREE.Vector3().fromBufferAttribute(sewnNormals,a).add(new THREE.Vector3().fromBufferAttribute(sewnNormals,b)).normalize();
    sewnNormals.setXYZ(a,n.x,n.y,n.z);sewnNormals.setXYZ(b,n.x,n.y,n.z);
  }
  // At the rounded lip apex use the smooth surface's two actual tangents.
  // Triangle-area averaging biases this normal toward the larger outer ring
  // and leaves a hard diagonal highlight on an otherwise symmetric U-turn.
  const cuffPositions=geometry.attributes.position,cuffShape=geometry.userData.esmoCuffRoll;
  for(let arm=0;arm<2;arm++)for(let i=0;i<cuffShape.ringPoints;i++){
    const base=sewnStart+arm*cuffShape.verticesPerArm,step=i%cuffShape.radialSegments;
    const before=base+cuffShape.lipRow*cuffShape.ringPoints+(step+cuffShape.radialSegments-1)%cuffShape.radialSegments,after=base+cuffShape.lipRow*cuffShape.ringPoints+(step+1)%cuffShape.radialSegments;
    const tangent=new THREE.Vector3().fromBufferAttribute(cuffPositions,after).sub(new THREE.Vector3().fromBufferAttribute(cuffPositions,before));
    const across=new THREE.Vector3().fromBufferAttribute(cuffPositions,base+cuffShape.outerRow*cuffShape.ringPoints+i).sub(new THREE.Vector3().fromBufferAttribute(cuffPositions,base+cuffShape.innerRow*cuffShape.ringPoints+i));
    const n=tangent.cross(across).normalize();if(n.dot(sleeveArms[arm].axis)>0)n.negate();
    for(const row of[cuffShape.lipRow,cuffShape.lipRow+1])sewnNormals.setXYZ(base+row*cuffShape.ringPoints+i,n.x,n.y,n.z);
  }
  // UV closure must not introduce a lighting seam on the same cloth surface.
  const cuffNormal=geometry.attributes.normal,cuffStart=geometry.attributes.position.count-geometry.userData.esmoCuffRoll.addedVertices;
  for(let arm=0;arm<2;arm++)for(let row=0;row<geometry.userData.esmoCuffRoll.profileRows;row++){
    const first=cuffStart+arm*geometry.userData.esmoCuffRoll.verticesPerArm+row*geometry.userData.esmoCuffRoll.ringPoints,last=first+geometry.userData.esmoCuffRoll.radialSegments;
    const n=new THREE.Vector3().fromBufferAttribute(cuffNormal,first).add(new THREE.Vector3().fromBufferAttribute(cuffNormal,last)).normalize();
    cuffNormal.setXYZ(first,n.x,n.y,n.z);cuffNormal.setXYZ(last,n.x,n.y,n.z);
  }
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData.esmoTailoredShared = true;
  return { geometry, refs: 0, triangles: geometry.index.count / 3 };
}

export function createFpsTailoredClothing({ root, materials, mobile = false }) {
  let source;
  root.traverse(o => { if (o.isSkinnedMesh && o.name === "SuperHero_Male") source = o; });
  if (!source) throw new Error("連續服裝找不到授權來源人體");
  let entry = cache.get(source.geometry);
  if (!entry) { entry = derive(source); cache.set(source.geometry, entry); }
  entry.refs++;
  // Three r160 stores skinning flags on each material's renderer properties.
  // Sharing one instance with rigid kit meshes toggles that flag every pass
  // and repeatedly rebuilds program parameters, even with cached shaders.
  // Preserve the authored surface exactly; isolate only the material state.
  const skinMaterials = [materials.fabric, materials.pants, materials.skin, materials.armor].map(material => material.clone());
  skinMaterials.forEach(material=>{material.vertexColors=true;});
  for(let i=0;i<2;i++)applyMajorWovenTextiles(skinMaterials[i],{colour:materials[i===0?'fabric':'pants'].map,normal:materials[i===0?'fabric':'pants'].normalMap});
  applyMajorClothSurfaceDetail(skinMaterials[0],{sleevePattern:true,glovePattern:true,detailStrength:.0032,toneStrength:.08});
  const garment = new THREE.SkinnedMesh(entry.geometry, skinMaterials);
  garment.name = "ESMO_Major_ContinuousClothing";
  garment.position.copy(source.position); garment.quaternion.copy(source.quaternion); garment.scale.copy(source.scale);
  garment.bindMode = source.bindMode; garment.bind(source.skeleton, source.bindMatrix);
  garment.castShadow = !mobile; garment.receiveShadow = true; garment.frustumCulled = false;
  garment.userData.esmoTailoredShared = true;
  source.parent.add(garment);
  let removedProxies = 0;
  root.traverse(o => { if (o.isMesh && TAILORED_PROXY.test(o.name)) { o.visible = false; o.userData.esmoTailoredReplaced = true; removedProxies++; } });
  let disposed = false;
  return {
    mesh: garment, geometry: entry.geometry, triangles: entry.triangles, removedProxies,
    dispose() {
      if (disposed) return; disposed = true;
      garment.parent?.remove(garment);
      skinMaterials.forEach(material => material.dispose());
      if (--entry.refs === 0) { entry.geometry.dispose(); cache.delete(source.geometry); }
    },
  };
}
