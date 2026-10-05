import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FPS_MAJOR_MAP_ART } from "../fpsMapIdentity.js";
import { fpsMajorElevation, FPS_MAJOR_PLATFORMS } from "../fpsMajorTerrain.js";
import { decodeFpsAuthoredGeometry } from "./fpsAuthoredKit.js";
import { majorPlantKind, appendMajorPlantAssembly } from "./fpsMajorPlantAssemblies.js";
export { FPS_MAJOR_MAP_ART } from "../fpsMapIdentity.js";

// 原創美術套件；legacy map key 僅作存檔相容。所有實體外框來自同一份
// authoritative obstacles；裝飾只在實體內、屋頂或不可行走的外圍。

const ATLAS = `${import.meta.env?.BASE_URL || "/"}assets/fps/major-v1/environment-albedo-atlas.png`;
const TERRAIN_ATLAS = `${import.meta.env?.BASE_URL || "/"}assets/fps/major-v1/terrain-albedo-atlas-v1.png`;

export function createMajorMapEnvironment({ group, mapKey, map, obstacles, W, mobile = false, atlasTexture = null, streets=[], terrain=true }) {
  const art = FPS_MAJOR_MAP_ART[mapKey];
  if (!art) throw new Error(`未知 CS 場景：${mapKey}`);
  const environment = new THREE.Group();
  environment.name = `ESMO_Major_${mapKey}`;
  group.add(environment);
  const ownedGeometries = new Set(), ownedMaterials = new Set(), fadeWalls = [], fadeDetails = [];
  const districtHeight=(x,z)=>{
    // 東側是既有海面，港機／船舶不可再套用陸側丘陵高度。
    if(mapKey!=='inferno'&&x>=100)return 0;
    const xx=x-50,zz=z-50,distance=Math.max(Math.abs(xx),Math.abs(zz));
    if(distance<=55)return 0;
    // 保留已設計廠房／裝卸坪的平整地基；石脊繞過街區而非穿過建物。
    const pads=[[-38,0,5,100],[-5,95,-38,0],[5,95,100,143]];
    let clearance=1;
    for(const [x0,x1,z0,z1] of pads){const d=Math.hypot(Math.max(x0-x,0,x-x1),Math.max(z0-z,0,z-z1));clearance=Math.min(clearance,THREE.MathUtils.smoothstep(d,2,18));}
    const rise=mapKey==='inferno'?10+Math.abs(Math.sin(xx*.039+zz*.018))*17:3+Math.abs(Math.sin(xx*.029+zz*.017))*5;
    return THREE.MathUtils.smoothstep(distance,55,100)*clearance*rise;
  };
  const elevation=(x,z)=>terrain?((x<0||x>100||z<0||z>100)?districtHeight(x,z):fpsMajorElevation(mapKey,{x,y:z})):0;
  let disposed = false, atlasLoaded = false,terrainAtlasLoaded=Boolean(atlasTexture);
  const atlas = atlasTexture || new THREE.TextureLoader().load(ATLAS, () => { if (disposed) atlas.dispose(); else atlasLoaded = true; }, undefined, () => { atlasLoaded = false; });
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = mobile ? 2 : 4;
  // 測試注入共用Texture；瀏覽器地形圖以桌機1024／手機512上傳，控制額外記憶體。
  const terrainAtlas=atlasTexture||new THREE.TextureLoader().load(TERRAIN_ATLAS,texture=>{
    if(disposed){texture.dispose();return;}
    const size=mobile?512:1024,canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
    const context=canvas.getContext('2d');context.drawImage(texture.image,0,0,size,size);texture.image=canvas;texture.needsUpdate=true;terrainAtlasLoaded=true;
  },undefined,()=>{terrainAtlasLoaded=false;});
  terrainAtlas.colorSpace=THREE.SRGBColorSpace;terrainAtlas.anisotropy=mobile?2:4;
  const unit = new THREE.BoxGeometry(1, 1, 1);
  ownedGeometries.add(unit);
  const material = (color, extra = {}, atlasRole = 'structure') => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: .84, metalness: .04, ...extra });
    if(extra.map===atlas||extra.map===terrainAtlas){
      const neutralMetal=terrain&&atlasRole==='structure';
      // 世界比例投影：長牆與小箱都維持約四公尺一格，不拉伸整張 atlas。
      // 延用 Standard 的燈光／陰影；只替換 albedo UV，不另加 render pass。
      m.onBeforeCompile=shader=>{
        shader.vertexShader='varying vec3 majorWorldPosition;\nvarying vec3 majorWorldNormal;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
          vec4 majorPosition = vec4(transformed,1.0);
          #ifdef USE_INSTANCING
            majorPosition = instanceMatrix * majorPosition;
          #endif
          majorWorldPosition=(modelMatrix*majorPosition).xyz;
          majorWorldNormal=normalize(mat3(modelMatrix)*objectNormal);`);
        shader.fragmentShader='varying vec3 majorWorldPosition;\nvarying vec3 majorWorldNormal;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
          vec3 majorNormal=abs(normalize(majorWorldNormal));
          vec2 majorUV=majorNormal.y>.65?majorWorldPosition.xz:(majorNormal.x>majorNormal.z?majorWorldPosition.zy:majorWorldPosition.xy);
          vec2 majorCell=floor(vMapUv*2.0)*.5;
          // 先求連續座標的導數，避免fract接縫讓GPU選到整張atlas的粗mip。
          vec2 majorContinuousUV=majorUV*.25;
          vec2 majorDx=dFdx(majorContinuousUV)*.494;
          vec2 majorDy=dFdy(majorContinuousUV)*.494;
          vec2 majorAtlasUV=majorCell+vec2(.003)+fract(majorContinuousUV)*.494;
          vec4 majorAlbedo=texture2DGradEXT(map,majorAtlasUV,majorDx,majorDy);
          majorAlbedo.rgb=max(majorAlbedo.rgb,vec3(.045));
          ${neutralMetal?`// 金屬掃描只提供明暗細節；塗裝色由模型頂點色負責，避免深青色重複相乘。
          if(majorCell.x>.25&&majorCell.y>.25){
            float majorMetalLuma=dot(majorAlbedo.rgb,vec3(.2126,.7152,.0722));
            vec3 majorMetalBase=vec3(clamp(.24+majorMetalLuma*.9,.24,.85));
            majorAlbedo.rgb=mix(majorMetalBase,majorAlbedo.rgb,.12);
          }`:''}
          diffuseColor*=majorAlbedo;
        #endif`);
      };
      m.customProgramCacheKey=()=> `esmo-major-world-atlas-v3-${neutralMetal?'neutral-metal':'unaltered-terrain'}`;
    }
    ownedMaterials.add(m);
    return m;
  };
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion();
  const position = new THREE.Vector3(), scale = new THREE.Vector3();
  const transform = (x, y, z, sx, sy, sz, rotation = 0) => {
    position.set(W.vx(x), y+elevation(x,z), W.vz(z)); scale.set(sx, sy, sz);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
    return matrix.compose(position, q, scale).clone();
  };
  const remap = (geo, tile, color) => {
    const uv = geo.getAttribute("uv"), colors = [];
    let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity;
    for(let i=0;i<uv.count;i++){minU=Math.min(minU,uv.getX(i));maxU=Math.max(maxU,uv.getX(i));minV=Math.min(minV,uv.getY(i));maxV=Math.max(maxV,uv.getY(i));}
    // 留半個 texel 邊距，防止 atlas 鄰格滲色；每格本身為獨立材質掃描。
    const u = tile % 2 * .5 + .001, v = tile < 2 ? .501 : .001;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u + (uv.getX(i)-minU)/Math.max(.0001,maxU-minU) * .498, v + (uv.getY(i)-minV)/Math.max(.0001,maxV-minV) * .498);
    const tint = new THREE.Color(color);
    for (let i = 0; i < geo.getAttribute("position").count; i++) colors.push(tint.r, tint.g, tint.b);
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  };
  const box = (list, tile, color, x, height, z, sx, sy, sz, rotation = 0) => {
    const geo = remap(unit.clone(), tile, color);
    geo.applyMatrix4(transform(x, height, z, sx, sy, sz, rotation));
    list.push(geo);
  };
  const extrusion = (list, shape, depth, tile, color, x, y, z, rotation=0, closedFacade=false) => {
    const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:mobile?4:6});
    if(closedFacade){
      // 不能進入的封閉建物省掉內側背板；保留窗洞四邊、外牆與厚度。
      const normals=geo.attributes.normal,indices=[];
      for(let i=0;i<normals.count;i+=3)if(!(normals.getZ(i)<-.99&&normals.getZ(i+1)<-.99&&normals.getZ(i+2)<-.99))indices.push(i,i+1,i+2);
      geo.setIndex(indices);
    }
    remap(geo,tile,color);geo.applyMatrix4(transform(x,y,z,1,1,1,rotation));list.push(geo);
  };
  const barrelRoof = (list,x,y,z,width,depth,tile,color,rise=2) => {
    const shape=new THREE.Shape();shape.moveTo(-width/2,0);shape.lineTo(width/2,0);
    shape.quadraticCurveTo(width*.48,rise*.85,0,rise);shape.quadraticCurveTo(-width*.48,rise*.85,-width/2,0);shape.closePath();
    extrusion(list,shape,depth,tile,color,x,y,z);
  };
  const flush = (list, mat, name, shadows = false, parent = environment) => {
    if (!list.length) return null;
    // ExtrudeGeometry 是 non-indexed；Box/Tube/Cylinder 是 indexed。
    // 只在混合批次正規化，避免不必要地展開純 box 批次。
    const mixed=list.some(g=>g.index)&&list.some(g=>!g.index);
    const compatible=mixed?list.map(g=>g.index?g.toNonIndexed():g):list;
    const geo = mergeGeometries(compatible, false);
    if(mixed)compatible.forEach((g,i)=>{if(g!==list[i])g.dispose();});
    list.forEach(g => g.dispose());
    if (!geo) throw new Error(`CS 合批失敗：${name}`);
    geo.computeBoundingSphere(); ownedGeometries.add(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name; mesh.castShadow = shadows; mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const localOccluder=(mesh,mat)=>{
    if(!mesh)return;
    mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox;
    fadeDetails.push({sourceMesh:mesh.name,rect:{x0:b.min.x,z0:b.min.z,x1:b.max.x,z1:b.max.z},minHeight:b.min.y,height:b.max.y,mats:[{m:mat,base:1}],cur:1});
  };
  const authoredGeometry=new Map(),authoredSources=new Map();
  const sourceGeometry=id=>{
    if(!authoredGeometry.has(id)){
      const geo=decodeFpsAuthoredGeometry(id);authoredGeometry.set(id,geo);ownedGeometries.add(geo);
      authoredSources.set(id,{...geo.userData.authoredSource,instances:0});
    }
    return authoredGeometry.get(id);
  };
  const authored=(list,id,x,y,z,sx=1,sy=1,sz=1,rotation=0)=>{
    const geo=sourceGeometry(id).clone();geo.applyMatrix4(transform(x,y,z,sx,sy,sz,rotation));list.push(geo);authoredSources.get(id).instances++;
  };
  const authoredFit=(list,id,x,y,z,width,height,depth,rotation=0)=>{
    const source=sourceGeometry(id),b=source.boundingBox,center=b.getCenter(new THREE.Vector3()),size=b.getSize(new THREE.Vector3()),geo=source.clone();
    geo.translate(-center.x,-b.min.y,-center.z);geo.applyMatrix4(transform(x,y,z,width/size.x,height/size.y,depth/size.z,rotation));list.push(geo);authoredSources.get(id).instances++;
  };

  // 每棟的 shell/細節合為一個 draw；保留獨立 fade material，不讓一棟
  // 遮擋淡出連帶把全地圖 InstancedMesh 淡掉。
  const roomWallBatches=new Map();
  map.walls.forEach((w, index) => {
    const x = w.x + w.w / 2, z = w.y + w.h / 2, height = W.vy(w.hgt || 7);
    const shell = [], dark = [], upper = [];
    if(w.architecture){
      // 牆是同源薄實體，不把整個房間重新填成盒子。窗模組有真實框厚、
      // 內縮玻璃與窗台；底牆保留碰撞，窗不是新增可射穿的第二套規則。
      const alongX=w.w>w.h,len=alongX?w.w:w.h,panels=[];
      const processRoom=(map.rooms||[]).find(room=>room.id===w.architecture&&room.processKind);
      if(processRoom){
        // 耐火牆裙與成跨鋼骨是同一承重系統；替換石牆／青柱拼接。
        const pump=processRoom.processKind==='pump-hall';
        const cap=pump?.4:.65,sill=pump?Math.min(2.45,height-cap-.4):4.4,span=Math.max(1,Math.ceil(len/5));
        box(shell,pump?0:2,pump?0xb5b29a:0x938978,x,sill/2,z,w.w,sill,w.h);
        box(shell,1,0x555b55,x,height-cap/2,z,w.w,cap,w.h);
        box(panels,1,0x4d605d,x,(sill+height-cap)/2,z,alongX?w.w:.12,height-cap-sill,alongX?.12:w.h);
        for(let n=0;n<=span;n++){
          const p=Math.max(.25,Math.min(len-.25,n*len/span)),px=alongX?w.x+p:x,pz=alongX?z:w.y+p;
          if(pump)box(shell,0,0xc1b99f,px,height/2,pz,alongX?.5:.8,height,alongX?.8:.5);
          else{
            box(shell,1,0x535a54,px,height/2,pz,alongX?.22:.76,height,alongX?.76:.22);
            for(const side of [-1,1])box(shell,1,0x737568,px+(alongX?0:side*.32),height/2,pz+(alongX?side*.32:0),alongX?.5:.12,height,alongX?.12:.5);
          }
        }
      }else if(mapKey==='dust2'){
        // 裝卸房：實心下板、高位窄採光與整高鋼柱；移除住宅窗模型和白窗套。
        const sill=4.7,windowTop=6,span=Math.max(1,Math.ceil(len/3.5));
        box(shell,1,0x899489,x,sill/2,z,w.w,sill,w.h);
        box(shell,1,0x717c74,x,(windowTop+height)/2,z,w.w,height-windowTop,w.h);
        if(w.architecture==='repair-bay'&&alongX&&len>8){
          // 維修庫兩面高位採光保留真CC0厚窗套，縮成工業帶窗而非住宅大窗。
          const first=panels.length;
          authoredFit(panels,'building-kit/wall-window-wide-square-detailed',x,sill,z,.6,windowTop-sill,len,Math.PI/2);
          for(const geo of panels.slice(first)){
            const colors=geo.getAttribute('color'),paint=new THREE.Color(0x83998e);
            if(colors)for(let i=0;i<colors.count;i++)colors.setXYZ(i,colors.getX(i)*paint.r,colors.getY(i)*paint.g,colors.getZ(i)*paint.b);
          }
        }else box(panels,1,0x647f7c,x,(sill+windowTop)/2,z,alongX?w.w:.12,windowTop-sill,alongX?.12:w.h);
        for(let n=0;n<=span;n++){
          const p=Math.max(.22,Math.min(len-.22,n*len/span)),px=alongX?w.x+p:x,pz=alongX?z:w.y+p;
          box(shell,1,0x414e4c,px,height/2,pz,alongX?.28:.76,height,alongX?.76:.28);
          box(shell,1,0x6b7970,px,1.05/2,pz,alongX?.44:.8,1.05,alongX?.8:.44);
        }
        box(shell,1,0x4f5b56,x,3.9,z,w.w,.36,w.h);
      }else if(len>8){
        const sill=1.8,windowHeight=2.4,bays=Math.max(2,Math.floor(len/4));
        box(shell,art.tile,art.shell,x,sill/2,z,w.w,sill,w.h);
        box(shell,art.tile,art.shell,x,(sill+windowHeight+height)/2,z,w.w,height-sill-windowHeight,w.h);
        for(let bay=0;bay<bays;bay++){
          const along=(bay+.5)*len/bays;
          if(w.compactArchitecture){
            // 次要廊道使用共批次厚框與內縮窗，保留入口空間並控制三角形。
            const px=alongX?w.x+along:x,pz=alongX?z:w.y+along,span=len/bays;
            box(shell,1,art.trim,px,sill+windowHeight/2,pz,alongX?.18:.8,windowHeight,alongX?.8:.18);
            box(panels,1,0x819a9b,px,sill+windowHeight/2,pz,alongX?span-.18:.12,windowHeight,alongX?.12:span-.18);
            continue;
          }
          const id=mapKey==='mirage'?(bay===0?'building-kit/wall-window-wide-round-detailed':'building-kit/wall-window-wide-round'):'building-kit/wall-window-wide-square-detailed';
          authored(panels,id,alongX?w.x+along:x,sill,alongX?z:w.y+along,4,1,len/bays/4,alongX?Math.PI/2:0);
        }
      }else box(shell,art.tile,art.shell,x,height/2,z,w.w,height,w.h);
      let batch=roomWallBatches.get(w.architecture);
      if(!batch){batch={shell:[],panels:[],fades:[],mat:material(0xffffff,{map:atlas,vertexColors:true}),panelMat:material(0xffffff,{vertexColors:true,roughness:.65})};roomWallBatches.set(w.architecture,batch);}
      batch.shell.push(...shell);batch.panels.push(...panels);
      const {mat,panelMat}=batch;
      const wallFade={rect:{x0:W.vx(w.x),z0:W.vz(w.y),x1:W.vx(w.x+w.w),z1:W.vz(w.y+w.h)},height:height+elevation(x,z),mats:[{m:mat,base:1},{m:panelMat,base:1}],cur:1};
      fadeWalls.push(wallFade);batch.fades.push(wallFade);
      return;
    }
    const shade = new THREE.Color(art.shell).offsetHSL(0, 0, (index % 4 - 1.5) * .025);
    const perimeter=(w.w<=5&&w.h>60)||(w.h<=5&&w.w>60)||w.x<7||w.y<7;
    const building=w.w>=6&&w.h>=6&&!perimeter;
    // 屋型由廠區用途與建物比例決定，避免牆資料插入後整片街廓換屋頂。
    const family=mapKey==='mirage'?(w.y>=70?1:w.w>=w.h?0:2):mapKey==='dust2'?(w.h>w.w*1.35?0:w.y>=60?2:1):(w.y>=60?1:0);
    const coldStore=w.art==='cold-store',loadingHall=w.art==='loading-hall';
    const framedBuilding=building&&!coldStore&&!loadingHall;
    const plantKind=building?majorPlantKind(mapKey,w):null;
    const waterFacade=mapKey==='mirage'&&plantKind?(plantKind==='pressure-bank'?'pressure':'pump'):null;
    const cargoFacade=mapKey==='dust2'&&w.x===64&&w.y===58;
    const serviceGate=mapKey==='mirage'&&w.y===95?{alongX:true,center:68,width:8}
      :mapKey==='dust2'&&w.x===93&&w.h>60?{alongX:false,center:64,width:8}
      :mapKey==='inferno'&&w.x===2&&w.h>60?{alongX:false,center:62,width:6}:null;
    const loadingFace=face=>loadingHall&&face.len===Math.max(w.w,w.h);
    const faces = perimeter?[]:[
      { axis: "x", sign: -1, len: w.w, fixed: w.y }, { axis: "x", sign: 1, len: w.w, fixed: w.y + w.h },
      { axis: "z", sign: -1, len: w.h, fixed: w.x }, { axis: "z", sign: 1, len: w.h, fixed: w.x + w.w },
    ];
    const recessed=mapKey!=='mirage'&&!perimeter&&Math.min(w.w,w.h)>=1.4;
    if(serviceGate){
      // 關閉維修閘門替換同一實牆段，不鑿通碰撞；所有封板/門柱仍在原bbox內。
      const {alongX,center,width}=serviceGate,start=alongX?w.x:w.y,end=start+(alongX?w.w:w.h),depth=alongX?w.h:w.w;
      const piece=(color,c,y,len,tall,thick=depth,tile=1)=>box(shell,tile,color,alongX?c:x,y,alongX?z:c,alongX?len:thick,tall,alongX?thick:len);
      const left=center-width/2-start,right=end-center-width/2;
      piece(art.shell,start+left/2,height/2,left,height,depth,art.tile);
      piece(art.shell,end-right/2,height/2,right,height,depth,art.tile);
      piece(0x596f65,center,(height-.45)/2,width-.6,height-.45,depth-.36);
      for(const side of [-1,1])piece(0x979f88,center+side*(width/2-.15),height/2,.3,height);
      piece(0x737e6c,center,height-.225,width,.45);
      piece(0x3f504b,center,(height-.45)/2,.12,height-.45,depth-.18);
      piece(0xa99d72,center,1.35,width-.8,.18,depth-.12);
    }else if(framedBuilding){
      // 封閉外殼改為真正有厚度的凹龕。退縮僅0.28m、窗台至少1.25m，
      // 背面全部有封板；不提供可站立凹槽、假門洞或第二份碰撞資料。
      for(const face of faces){
        const horizontal=face.axis==='x',depth=.28;
        const rotation=horizontal?(face.sign>0?0:Math.PI):(face.sign>0?Math.PI/2:-Math.PI/2);
        const bx=horizontal?x:face.fixed-face.sign*depth,bz=horizontal?face.fixed-face.sign*depth:z;
        const bays=Math.max(1,Math.floor(face.len/(mapKey==='mirage'?6:7))),pitch=face.len/bays;
        const top=height-.8;
        const sill=waterFacade==='pump'?Math.max(2.45,top-1.45):waterFacade==='pressure'?height*.48:cargoFacade?height-2.15:mapKey==='inferno'?1.25:1.65;
        const archRise=waterFacade==='pump'?.55:.9;
        const openingWidth=waterFacade==='pressure'?1.35:Math.min(pitch-(waterFacade?1.8:1.1),mapKey==='mirage'?3.5:5.2);
        const outline=new THREE.Shape();outline.moveTo(-face.len/2,0);outline.lineTo(face.len/2,0);outline.lineTo(face.len/2,height);outline.lineTo(-face.len/2,height);outline.closePath();
        const profile=(center,path)=>{
          const left=center-openingWidth/2,right=center+openingWidth/2;
          path.moveTo(left,sill);path.lineTo(left,mapKey==='mirage'&&waterFacade!=='pressure'?top-archRise:top);
          if(mapKey==='mirage'&&waterFacade!=='pressure'){
            // 固定低段數只保留拱頂輪廓；不讓每扇洞及封板各重複12段曲線。
            const segments=mobile?4:6;
            for(let segment=1;segment<=segments;segment++){
              const angle=Math.PI-segment*Math.PI/segments;
              path.lineTo(center+Math.cos(angle)*openingWidth/2,top-archRise+Math.sin(angle)*archRise);
            }
          }
          else path.lineTo(right,top);
          path.lineTo(right,sill);path.closePath();return path;
        };
        const panel=(list,tile,color,along,y,width,h,inset,thickness)=>{
          const offset=face.sign*inset;
          if(thickness<=.012){
            const strip=remap(new THREE.PlaneGeometry(width,h),tile,color);
            strip.applyMatrix4(transform(horizontal?x+along:face.fixed-offset,y,horizontal?face.fixed-offset:z+along,1,1,1,rotation));
            list.push(strip);return;
          }
          box(list,tile,color,horizontal?x+along:face.fixed-offset,y,horizontal?face.fixed-offset:z+along,horizontal?width:thickness,h,horizontal?thickness:width);
        };
        for(let bay=0;bay<bays;bay++){
          const center=(bay+.5)*pitch-face.len/2;
          outline.holes.push(profile(center,new THREE.Path()));
          // 封板和壁厚之間保留清楚深度；不是貼在石牆上的藍色圖形。
          const closed=profile(center,new THREE.Shape());
          extrusion(dark,closed,.035,1,waterFacade?0x4c6560:mapKey==='mirage'?0x6e8985:mapKey==='dust2'?0x82999b:0x697472,bx-face.sign*(!horizontal?.015:0),0,bz-face.sign*(horizontal?.015:0),rotation);
          panel(shell,2,mapKey==='mirage'?0xc6b99a:0xa4a894,center,sill-.13,openingWidth+.45,.26,.14,.28);
          if(waterFacade){
            // 藍色大窗換成高位採光與厚實拱墩；下方檢修板完全封閉且後退不超0.28m。
            if(waterFacade==='pump'){
              panel(shell,1,0x6f8175,center,1.28,openingWidth*.7,1.25,.21,.12);
              panel(shell,1,0xa7ac91,center,sill+.23,openingWidth,.13,.18,.11);
            }else{
              panel(shell,1,0x969e88,center,(sill+top)/2,.12,top-sill,.18,.11);
            }
          }else if(mapKey==='mirage'){
            // 工業採光窗用可辨識的細框格，不再是一整片數公尺高藍板。
            // 實心封底仍在；玻璃保持不透明，無透明排序或額外材質批次。
            panel(shell,1,0xa7b5a5,center,(sill+top)/2,.085,top-sill,.18,.11);
            const rectangularTop=top-.9;
            for(const fraction of [.33,.66,1]){
              panel(shell,1,0xa7b5a5,center,sill+(rectangularTop-sill)*fraction,openingWidth,.085,.18,.011);
            }
            // 窗框內側的窄暗邊提供固定接觸陰影；與封板同批次且位於凹龕內。
            for(const side of [-1,1])panel(dark,1,0x344642,center+side*(openingWidth/2-.055),(sill+rectangularTop)/2,.11,rectangularTop-sill,.255,.012);
          }else if(mapKey==='inferno'){
            // 爐房低部防護鋼板＋上部百葉，連續節奏取代住宅十字窗。
            panel(dark,1,0xa3957c,center,sill+.55,openingWidth,1.1,.23,.045);
            for(let l=0;l<(mobile?2:3);l++)panel(shell,1,0x404c4a,center,top-.3-l*.35,openingWidth,.12,.12,.22);
          }else if(cargoFacade){
            panel(shell,1,0x52675f,center,1.85,openingWidth,2.55,.22,.1);
            panel(shell,1,0x9aa68e,center,3.9,openingWidth,.28,.14,.25);
          }else{
            panel(shell,1,0xc3c5b6,center,(sill+top)/2,.18,top-sill,.12,.24);
            panel(shell,1,0xb4b8ab,center,sill+(top-sill)*.5,openingWidth,.2,.12,.24);
          }
        }
        extrusion(shell,outline,depth,art.tile,shade,bx,0,bz,rotation,true);
        // 寬石墩／工字柱是整個立面節奏，最大外界仍對齊原bbox。
        for(let bay=0;bay<=bays;bay++){
          const center=Math.max(-face.len/2+.3,Math.min(face.len/2-.3,bay*pitch-face.len/2));
          const pierWidth=waterFacade?1.05:.56;
          const pierCenter=Math.max(-face.len/2+pierWidth/2,Math.min(face.len/2-pierWidth/2,center));
          panel(shell,mapKey==='mirage'?0:1,mapKey==='mirage'?0xc6b99a:art.trim,pierCenter,height*.48,pierWidth,height*.96,.14,.28);
        }
        panel(shell,2,mapKey==='mirage'?0xd0c3a6:0x9faeaa,0,height-.2,face.len,.4,.14,.28);
      }
    }else if(recessed){
      // 關閉廠房的厚牆與內凹窗；完整 collider 不變，玻璃封口不假裝可通行。
      for(const face of faces){
        const shape=new THREE.Shape();shape.moveTo(-face.len/2,0);shape.lineTo(face.len/2,0);shape.lineTo(face.len/2,height);shape.lineTo(-face.len/2,height);shape.closePath();
        if(face.len>=3&&!coldStore&&!loadingFace(face)){
          const count=Math.max(1,Math.floor(face.len/4.4)),width=Math.min(1.55,face.len/count*.58);
          for(let n=0;n<count;n++){
            const center=(n+.5)*face.len/count-face.len/2,y0=height*.66-.69,hole=new THREE.Path();
            hole.moveTo(center-width/2,y0);hole.lineTo(center-width/2,y0+1.38);hole.lineTo(center+width/2,y0+1.38);hole.lineTo(center+width/2,y0);hole.closePath();shape.holes.push(hole);
          }
        }
        const horizontal=face.axis==='x',rotation=horizontal?(face.sign>0?0:Math.PI):(face.sign>0?Math.PI/2:-Math.PI/2);
        extrusion(shell,shape,.48,art.tile,shade,horizontal?x:face.fixed-face.sign*.48,0,horizontal?face.fixed-face.sign*.48:z,rotation,true);
      }
    }else if(building){
      // 八邊切角體量；碰撞仍使用原外框，微小切角小於選手半徑。
      const c=.28,shape=new THREE.Shape();
      const points=[[-w.w/2+c,-w.h/2],[w.w/2-c,-w.h/2],[w.w/2,-w.h/2+c],[w.w/2,w.h/2-c],[w.w/2-c,w.h/2],[-w.w/2+c,w.h/2],[-w.w/2,w.h/2-c],[-w.w/2,-w.h/2+c]];
      points.forEach(([px,pz],i)=>i?shape.lineTo(px,pz):shape.moveTo(px,pz));shape.closePath();
      const geo=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false});geo.rotateX(-Math.PI/2);
      remap(geo,art.tile,shade);geo.applyMatrix4(transform(x,0,z,1,1,1));shell.push(geo);
    }else box(shell, art.tile, shade, x, height / 2, z, w.w, height, w.h);
    // 基座、腰線及屋頂收邊都貼在 collider 內；不製造新增的戰術掩體。
    box(shell, 2, 0x96988c, x, .28, z, w.w, .56, w.h);
    if(!framedBuilding)box(shell, 2, art.trim, x, height * .55, z, w.w + .05, .18, w.h + .05);
    box(shell, perimeter&&terrain?2:1, perimeter&&terrain?art.shell:art.roof, x, height + .16, z, w.w, .32, w.h);
    // 依用途及區域改變天際線，並非全場同一棟盒子複製。
    if (building) {
      if(plantKind){
        appendMajorPlantAssembly({kind:plantKind,w,height,mobile,upper,box,extrusion,remap,transform});
      }else if(w.art==='furnace'){
        // 密閉下部沿用同源實體；上部是錯層爐膽、煙道與維修平台，
        // 不以再加一個平盒屋頂代表鑄造建築。
        const wide=w.w>=12,count=wide?2:1,radius=wide?2.3:2.05;
        for(let n=0;n<count;n++){
          const fx=wide?w.x+4+n*7:x,fz=wide?w.y+6+n*5:z;
          const profile=[[radius,height+.3],[radius,height+2.6],[radius*.9,height+3.1],[radius*.66,height+4.1],[radius*.66,height+6.5],[radius*.43,height+7.1],[radius*.43,height+10.1-n*1.7],[radius*.55,height+10.3-n*1.7]].map(([r,y])=>new THREE.Vector2(r,y));
          const furnace=new THREE.LatheGeometry(profile,mobile?10:14);remap(furnace,2,n?0xb9aa90:0xa48b6c);furnace.applyMatrix4(transform(fx,0,fz,1,1,1));upper.push(furnace);
          for(const [level,r] of [[height+2.5,radius],[height+6.3,radius*.67]]){
            const band=new THREE.TorusGeometry(r+.05,.12,3,mobile?10:14);band.rotateX(Math.PI/2);remap(band,1,0xb4c0b3);band.applyMatrix4(transform(fx,level,fz,1,1,1));upper.push(band);
          }
          const duct=new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(W.vx(fx),height+5.8,W.vz(fz)),new THREE.Vector3(W.vx(fx),height+6.8,W.vz(w.y+1.8)),new THREE.Vector3(W.vx(w.x+w.w-1.5),height+6.8,W.vz(w.y+1.8)),new THREE.Vector3(W.vx(w.x+w.w-1.5),height+2.5,W.vz(w.y+3.2))]),mobile?8:12,.3,6,false);remap(duct,1,0x7c9697);upper.push(duct);
        }
        // 平台在不可進入的爐房上部，並非新增可站立戰術高地。
        box(shell,1,0x819a9c,x,height+.75,w.y+w.h-1.3,w.w-1.2,.25,1.8);
        for(const level of [height+1.25,height+1.9])box(shell,1,0xd0b678,x,level,w.y+w.h-.55,w.w-1.3,.09,.09);
        for(let n=0;n<5;n++)box(shell,1,0xc0ac7b,w.x+.8+n*(w.w-1.6)/4,height+1.4,w.y+w.h-.55,.1,1.2,.1);
        box(shell,2,0xc5b79c,x,height*.2,z,w.w-.05,height*.4,w.h-.05);
      }else if(w.art==='water-tower'){
        // 中庭西側的高塔和下方拱廊形成高／低／負空間組合。
        const towerX=w.x+w.w*.38,towerZ=w.y+w.h*.35;
        const tower=new THREE.LatheGeometry([[2.4,height+.2],[2.4,height+4],[2.1,height+4.4],[2.1,height+7.2],[3.2,height+7.5],[3.2,height+10.5],[2.65,height+11.2],[0,height+11.8]].map(([r,y])=>new THREE.Vector2(r,y)),mobile?10:16);
        remap(tower,0,0xcbbfa6);tower.applyMatrix4(transform(towerX,0,towerZ,1,1,1));upper.push(tower);
        for(const level of [height+7.5,height+10.5]){
          const band=new THREE.TorusGeometry(3.22,.15,3,mobile?10:16);band.rotateX(Math.PI/2);remap(band,1,0x81a7a2);band.applyMatrix4(transform(towerX,level,towerZ,1,1,1));upper.push(band);
        }
        box(shell,1,0x7c9998,x,height+.55,z,w.w-.4,.22,w.h-.4);
      }else if(w.art==='cooling'){
        // 冷卻站為雙筒收腰塔與低機座；不是兩棟換色民宅。
        for(const side of [-1,1]){
          const radius=Math.min(2.4,w.w*.25),fz=z+side*w.h*.26;
          const profile=[[radius,height+.15],[radius*1.15,height+.8],[radius*.8,height+2.8],[radius*.65,height+5.4],[radius*.86,height+8.4],[radius,height+8.9]].map(([r,y])=>new THREE.Vector2(r,y));
          const tower=new THREE.LatheGeometry(profile,mobile?10:16);remap(tower,2,side===1?0xbbc0ae:0x9baaa4);tower.applyMatrix4(transform(x,0,fz,1,1,1));upper.push(tower);
          const lip=new THREE.TorusGeometry(radius,.16,3,mobile?10:16);lip.rotateX(Math.PI/2);remap(lip,1,0x819d98);lip.applyMatrix4(transform(x,height+8.9,fz,1,1,1));upper.push(lip);
        }
        box(upper,1,0x91aba4,x,height+2.3,z,.35,.35,w.h*.6);
      }else if(w.art==='conveyor'){
        // 封閉低基座上是傾斜料斗與輸送槽，具有不同於屋頂的生產輪廓。
        const hopper=new THREE.Shape();hopper.moveTo(-w.w*.46,0);hopper.lineTo(w.w*.46,0);hopper.lineTo(w.w*.32,4.1);hopper.lineTo(-w.w*.19,5.2);hopper.closePath();
        extrusion(upper,hopper,w.h*.58,1,0xa9b4a2,x,height,w.y+w.h*.2);
        box(upper,1,0x708e88,x+w.w*.31,height+2,z,w.w*.19,.28,w.h*.92);
      }else if(w.art==='press-hall'){
        barrelRoof(shell,x,height,z-w.h/2,w.w,w.h,1,0x93aaa5,3.2);
        box(dark,1,0xa3c0bd,x,height+.8,z+w.h/2+.04,w.w*.76,1.3,.08);
        box(shell,1,0xc1b68c,x,height+2.5,z,w.w*.2,.4,w.h*.96);
      }else if(w.art==='cold-store'){
        // 冷鏈庫採白色隔熱平頂與屋頂冷凝機，不再套用貨倉的青色拱頂。
        box(dark,2,0xcdd5ce,x,height+.45,z,w.w-.35,.6,w.h-.35);
        for(let unitIndex=0;unitIndex<3;unitIndex++){
          const ux=w.x+3.5+unitIndex*5.7;
          box(dark,1,0x91a19e,ux,height+1.25,z,3.6,1.1,4.4);
          for(const dz of [-1,1]){
            const vent=new THREE.CylinderGeometry(.72,.72,.12,mobile?10:14);
            remap(vent,1,0x344d53);vent.applyMatrix4(transform(ux,height+1.86,z+dz,1,1,1));dark.push(vent);
            for(const angle of [0,Math.PI/3,Math.PI*2/3])box(dark,1,0xaebbb5,ux,height+1.94,z+dz,1.24,.035,.1,angle);
          }
        }
        box(dark,1,0x76999b,x,height+.97,z-w.h*.36,w.w-.8,.4,.38);
      }else if(mapKey==='mirage'&&framedBuilding){
        // 泵房採錯層機房、低維修台與高採光脊；降低整排拱頂／人字頂重複。
        const long=w.h>w.w,width=w.w*(long?.68:.58),depth=w.h*(long?.72:.76);
        const cx=x-w.w*.12,cz=z-w.h*.08,rise=long?2.7:1.65;
        box(shell,0,0xc2b79e,cx,height+rise*.5,cz,width,rise,depth);
        box(shell,1,0x728c87,cx,height+rise+.14,cz,width,.28,depth);
        box(dark,1,0x678b88,cx,height+rise*.65,cz+depth*.5+.015,width*.78,.65,.035);
        box(shell,2,0xacad97,x+w.w*.32,height+.45,z,Math.min(2.1,w.w*.23),.5,w.h*.78);
      }else if(mapKey==='inferno'&&framedBuilding){
        // 工業排煙脊／側機房保持不對稱輪廓，取代住宅斜屋頂。
        const monitor=new THREE.Shape();monitor.moveTo(-w.w*.46,0);monitor.lineTo(w.w*.46,0);monitor.lineTo(w.w*.18,1.4);monitor.lineTo(w.w*.18,2.7);monitor.lineTo(-w.w*.18,2.7);monitor.lineTo(-w.w*.18,1.4);monitor.closePath();
        extrusion(shell,monitor,w.h-.4,1,0x8c9a8e,x,height+.32,w.y+.2);
        box(dark,1,0x465a59,x,height+2.1,w.y+.19,w.w*.34,.8,.04);
        box(shell,2,0xb4a485,x-w.w*.35,height+.85,z,w.w*.2,1.1,w.h*.72);
      }else if (mapKey === "dust2"&&(family===0||w.art==='loading-hall')) {
        for (let rib = 0; rib < 3; rib++) {
          const shape = new THREE.Shape();
          shape.moveTo(-w.w / 2, 0); shape.lineTo(w.w / 2, 0); shape.lineTo(w.w / 2, 1.2); shape.closePath();
          const roof = new THREE.ExtrudeGeometry(shape, { depth: w.h / 3 - .1, bevelEnabled: false });
          remap(roof, 1, art.trim); roof.translate(W.vx(x), height + .32, W.vz(w.y + rib * w.h / 3)); shell.push(roof);
        }
      } else if ((mapKey === "inferno"&&family!==2)||(mapKey==='mirage'&&family===2)) {
        const shape = new THREE.Shape(); shape.moveTo(-w.w / 2, 0); shape.lineTo(0, 2); shape.lineTo(w.w / 2, 0); shape.closePath();
        const roof = new THREE.ExtrudeGeometry(shape, { depth: w.h, bevelEnabled: false });
        remap(roof, 1, 0x8f7263); roof.translate(W.vx(x), height + .35, W.vz(w.y)); shell.push(roof);
      } else if(family===0||mapKey==='dust2'&&family===1||mapKey==='inferno'){
        barrelRoof(shell,x,height+.32,w.y,w.w-.3,w.h,1,mapKey==='mirage'?0x719c9b:mapKey==='dust2'?0xa8bac0:0xa59480,Math.min(3,w.w*.3));
        for(let rib=0;rib<3;rib++){
          const arch=new THREE.TorusGeometry(w.w*.5-.15,.12,3,mobile?8:12,Math.PI);remap(arch,1,0xc0c7b5);
          arch.scale(1,Math.min(3,w.w*.3)/(w.w*.5-.15),1);arch.translate(W.vx(x),height+.32,W.vz(w.y+(rib+.5)*w.h/3));shell.push(arch);
        }
      }else{
        // 台階式機房＋圓柱設備，不讓每棟共享同款黑色平屋頂。
        box(shell,art.tile,art.shell,x-w.w*.15,height+1,z,w.w*.56,1.7,w.h*.74);
        const tank=new THREE.CylinderGeometry(Math.min(w.w,w.h)*.18,Math.min(w.w,w.h)*.18,3.5,mobile?10:14);
        remap(tank,1,0xc3d2c6);tank.applyMatrix4(transform(x+w.w*.25,height+2,z,1,1,1));shell.push(tank);
      }
    }
    if (building&&!plantKind) {
      // 屋頂設備不佔可行走區，階梯天窗打破整齊盒子輪廓。
      if(family===1&&!framedBuilding){
        box(shell, 1, 0xa9b7b1, x-w.w*.18, height + .65, z, w.w * .25, .95, w.h * .4);
        for(let fin=0;fin<4;fin++)box(dark,1,0x758e95,x-w.w*.18,height+1.16,z+(fin-1.5)*w.h*.07,w.w*.22,.08,.12);
      }
      for (const side of [-1, 1]) {
        box(shell, 0, 0xc8bda6, x + side * (w.w / 2 - .16), height + .42, z, .3, .65, w.h);
        box(shell, 0, 0xc8bda6, x, height + .42, z + side * (w.h / 2 - .16), w.w, .65, .3);
      }
      if (!mobile || index % 2 === 0) {
        const px=x+w.w/2-.32,pz=z+w.h/2-.32;
        const pipe = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
          new THREE.Vector3(W.vx(px), .55, W.vz(pz-1.4)),
          new THREE.Vector3(W.vx(px), .55, W.vz(pz)),
          new THREE.Vector3(W.vx(px), height-.5, W.vz(pz)),
          new THREE.Vector3(W.vx(px-1.4), height+.45, W.vz(pz)),
        ]), 8, .13, 6, false);
        remap(pipe, 1, 0xb4aa83); shell.push(pipe);
      }
    }
    const nearestSite=Math.hypot(x-map.sites.a.x,z-map.sites.a.y)<Math.hypot(x-map.sites.b.x,z-map.sites.b.y)?map.sites.a:map.sites.b;
    const siteDX=nearestSite.x-x,siteDZ=nearestSite.y-z;
    const serviceAxis=Math.abs(siteDX)>Math.abs(siteDZ)?'z':'x',serviceSign=Math.sign(serviceAxis==='z'?siteDX:siteDZ)||1;
    for (const face of faces) {
      if (face.len < 3) continue;
      if(framedBuilding)continue;
      if(coldStore||loadingFace(face)){
        // 密閉裝卸門明確畫成捲門／氣密門；不存在假門洞或新增地面障礙。
        const horizontal=face.axis==='x',front=face.axis===serviceAxis&&face.sign===serviceSign;
        const px=along=>horizontal?w.x+along:face.fixed-face.sign*.045;
        const pz=along=>horizontal?face.fixed-face.sign*.045:w.y+along;
        const panel=(list,color,along,y,width,h,depth=.08)=>box(list,1,color,px(along),y,pz(along),horizontal?width:depth,h,horizontal?depth:width);
        if(coldStore){
          const bays=Math.max(2,Math.ceil(face.len/2));
          for(let n=0;n<bays;n++){
            const along=(n+.5)*face.len/bays;
            panel(dark,n%2?0xc4ceca:0xd8dfd5,along,height*.5,face.len/bays-.045,height-.35,.14);
          }
          panel(dark,0x3a7383,face.len*.5,height*.75,face.len-.1,.55,.22);
          if(front){
            panel(dark,0x355561,face.len*.5,2.05,4.9,4.1,.26);
            panel(dark,0xa8b9b7,face.len*.5,1.9,4.25,3.6,.32);
            panel(dark,0x526c71,face.len*.5,1.9,.065,3.6,.37);
          }
        }else{
          const bays=Math.max(2,Math.floor(face.len/5.5));
          for(let n=0;n<bays;n++){
            const along=(n+.5)*face.len/bays,width=Math.min(3.6,face.len/bays-1.3);
            panel(dark,0x283e48,along,2.25,width+.42,4.5,.14);
            panel(dark,n%2?0xaab3a8:0xb9bba4,along,2.1,width,4.1,.22);
            for(let slat=1;slat<7;slat++)panel(dark,0x6b7b78,along,slat*.56,width,.055,.28);
            for(const side of [-1,1])panel(dark,0xc7a96a,along+side*(width*.5+.26),.7,.16,1.3,.3);
            panel(dark,0x355969,along,5.1,width+.55,.5,.22);
          }
          for(let n=0;n<=bays;n++)panel(dark,0x90a3a0,Math.max(.16,Math.min(face.len-.16,n*face.len/bays)),height*.5,.24,height,.26);
          panel(dark,0xbec6b7,face.len*.5,height-.4,face.len,.24,.35);
        }
        continue;
      }
      const count = Math.max(1, Math.floor(face.len / 4.4));
      for (let n = 0; n < count; n++) {
        const along = (n + .5) * face.len / count;
        const xx = face.axis === "x" ? w.x + along : face.fixed + face.sign * .035;
        const zz = face.axis === "z" ? w.y + along : face.fixed + face.sign * .035;
        const horizontal = face.axis === "x";
        const windowWidth = Math.min(1.55, face.len / count * .58);
        const glassX=xx-(!horizontal&&recessed?face.sign*.37:0),glassZ=zz-(horizontal&&recessed?face.sign*.37:0);
        // 水務石造機房的拱窗、貨港百葉、鑄造高窗是不同結構語彙。
        // 皆為閉合立面，不冒充可穿越的門洞。
        if(mapKey==='mirage'&&height>5){
          const arch=new THREE.Shape();arch.moveTo(-windowWidth/2,0);arch.lineTo(windowWidth/2,0);arch.lineTo(windowWidth/2,.95);arch.quadraticCurveTo(windowWidth/2,1.7,0,1.7);arch.quadraticCurveTo(-windowWidth/2,1.7,-windowWidth/2,.95);arch.closePath();
          const panel=new THREE.ExtrudeGeometry(arch,{depth:.055,bevelEnabled:false,curveSegments:mobile?2:3});remap(panel,1,0x84a3aa);panel.applyMatrix4(transform(xx,height*.66-.7,zz,1,1,1,horizontal?0:Math.PI/2));dark.push(panel);
          const crown=new THREE.TorusGeometry(windowWidth/2+.09,.105,2,mobile?5:6,Math.PI);remap(crown,0,0xdbcdb1);crown.applyMatrix4(transform(xx,height*.66+.25,zz,1,1,1,horizontal?0:Math.PI/2));shell.push(crown);
        }else{
          box(dark, 1, mapKey==='inferno'?0x648088:0x8aa2aa, glassX, height * .66, glassZ, horizontal ? windowWidth : .055, 1.38, horizontal ? .055 : windowWidth);
          if(mapKey==='dust2')for(let slat=0;slat<3;slat++)box(shell,1,0x587880,xx,height*.66-.46+slat*.46,zz,horizontal?windowWidth:.08,.08,horizontal?.08:windowWidth);
          if(mapKey==='inferno')box(shell,1,0x342f2c,xx,height*.66,zz,horizontal?windowWidth:.12,.12,horizontal?.12:windowWidth);
        }
        box(shell, 0, 0xc9c8b6, xx, height * .66 - .77, zz, horizontal ? windowWidth + .3 : .16, .15, horizontal ? .16 : windowWidth + .3);
        box(shell, 1, art.trim, xx, height * .66, zz, horizontal ? .085 : .14, 1.45, horizontal ? .14 : .085);
        if (!mobile&&!recessed) box(shell, 2, 0x93978e, xx, height * .33, zz, horizontal ? .2 : .12, height * .62, horizontal ? .12 : .2);
      }
      if(face.len>=6&&(!terrain||(face.axis===serviceAxis&&face.sign===serviceSign))){
        const horizontal=face.axis==='x',along=face.len*.5;
        const xx=horizontal?w.x+along:face.fixed+face.sign*.04,zz=horizontal?face.fixed+face.sign*.04:w.y+along;
        const doorWidth=Math.min(2.6,face.len*.34),doorHeight=Math.min(3.15,height*.44);
        box(dark,1,mapKey==='inferno'?0x604439:0x477078,xx,doorHeight*.5,zz,horizontal?doorWidth:.08,doorHeight,horizontal?.08:doorWidth);
        // 門把與兩道補強取代六條懸浮橫桿，保留實心設備門的辨識。
        for(const fraction of (recessed?[.2,.8]:[1/12,3/12,5/12,7/12,9/12,11/12]))box(shell,1,art.trim,xx,doorHeight*fraction,zz,horizontal?doorWidth:.14,.065,horizontal?.14:doorWidth);
        // 門楣、設備編號底板及嵌入式管閥，全部跟所屬建物一起淡出。
        box(shell,0,0xd4c5a5,xx,doorHeight+.2,zz,horizontal?doorWidth+.35:.2,.3,horizontal?.2:doorWidth+.35);
        box(dark,1,0xe0c27a,xx,doorHeight+.62,zz,horizontal?.7:.08,.25,horizontal?.08:.7);
      }
    }
    const mat = material(0xffffff, { map: atlas, vertexColors: true,roughness:mapKey==='dust2'?.6:.84,metalness:mapKey==='dust2'?.18:.04 });
    // 關閉的窗／門使用獨立較亮材質，不把深色金屬掃描再乘一次暗色。
    const glass = material(0xffffff, { vertexColors: true, roughness: .48, metalness: .12 });
    const solidMesh=flush(shell, mat, `Building_${index}_solid`, true);
    solidMesh.geometry.computeBoundingBox();
    flush(dark, glass, `Building_${index}_closed-panels`);
    fadeWalls.push({ rect: { x0: W.vx(w.x), z0: W.vz(w.y), x1: W.vx(w.x + w.w), z1: W.vz(w.y + w.h) }, height:Math.max(height+elevation(x,z)+3,solidMesh.geometry.boundingBox.max.y), mats: [{ m: mat, base: 1 }, { m: glass, base: 1 }], cur: 1 });
    if(upper.length){const upperMat=material(0xffffff,{map:atlas,vertexColors:true,roughness:.72,metalness:.1});localOccluder(flush(upper,upperMat,`Building_${index}_upper-landmark`,true),upperMat);}
  });

  const groundMat = material(0xffffff, { map: atlas, vertexColors: true, roughness: .97 });
  const terrainMat = material(0xffffff, { map: terrainAtlas, vertexColors: true, roughness: .98,metalness:0 }, 'terrain');
  const paving = [], accents = [];
  const groundPatch=(list,tile,color,x,z,width,depth,lift=.045)=>{
    const geo=new THREE.PlaneGeometry(width,depth,Math.max(1,Math.min(6,Math.ceil(width))),Math.max(1,Math.min(6,Math.ceil(depth))));geo.rotateX(-Math.PI/2);geo.translate(W.vx(x),0,W.vz(z));
    const pos=geo.attributes.position;for(let i=0;i<pos.count;i++)pos.setY(i,lift+elevation(pos.getX(i)+50,pos.getZ(i)+50));geo.computeVertexNormals();remap(geo,tile,color);list.push(geo);
  };
  const roadParts=[];
  for(const route of streets)for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.y-a.y,len=Math.hypot(dx,dz);if(len<.1)continue;
    const halfWidth=terrain?3.6:2.25,nx=-dz/len*halfWidth,nz=dx/len*halfWidth;
    const points=[[a.x+nx,a.y+nz],[a.x-nx,a.y-nz],[b.x+nx,b.y+nz],[b.x-nx,b.y-nz]];
    const platform=terrain?FPS_MAJOR_PLATFORMS[mapKey]:null;
    const crossesPlatform=platform&&Math.max(...points.map(p=>p[0]))>platform.x&&Math.min(...points.map(p=>p[0]))<platform.x+platform.w&&Math.max(...points.map(p=>p[1]))>platform.y&&Math.min(...points.map(p=>p[1]))<platform.y+platform.h;
    // 只對跨平台的路段取細格；四角接高度會把數十公尺平地抬成斜橋。
    // 桌機／低階保留相同貼地形狀，平地仍只有兩個三角形且同一draw。
    const alongSegments=crossesPlatform?Math.ceil(len/2):1,acrossSegments=crossesPlatform?4:1,positions=[],uv=[],indices=[];
    for(let along=0;along<=alongSegments;along++)for(let across=0;across<=acrossSegments;across++){
      const t=along/alongSegments,u=across/acrossSegments,x=a.x+dx*t+nx*(1-2*u),z=a.y+dz*t+nz*(1-2*u);
      positions.push(W.vx(x),.032+elevation(x,z),W.vz(z));uv.push(t,u);
    }
    for(let along=0;along<alongSegments;along++)for(let across=0;across<acrossSegments;across++){
      const start=along*(acrossSegments+1)+across,next=start+acrossSegments+1;indices.push(start,next,start+1,start+1,next,next+1);
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();remap(geo,terrain?(mapKey==='mirage'?1:3):2,terrain?0xc5ccbe:0x6c7371);roadParts.push(geo);
  }
  if(terrain){
    const joins=new Set();
    for(const route of streets)for(let i=1;i<route.length-1;i++){
      const a=route[i-1],p=route[i],b=route[i+1],key=`${p.x.toFixed(3)},${p.y.toFixed(3)}`;
      const ux=p.x-a.x,uz=p.y-a.y,vx=b.x-p.x,vz=b.y-p.y,den=Math.hypot(ux,uz)*Math.hypot(vx,vz);
      if(joins.has(key)||den<.01||Math.abs(ux*vz-uz*vx)/den<.03)continue;
      joins.add(key);
      const disc=new THREE.CircleGeometry(3.6,12);disc.rotateX(-Math.PI/2);disc.translate(W.vx(p.x),0,W.vz(p.y));
      const positions=disc.attributes.position;
      for(let n=0;n<positions.count;n++)positions.setY(n,.032+elevation(positions.getX(n)+50,positions.getZ(n)+50));
      disc.computeVertexNormals();remap(disc,mapKey==='mirage'?1:3,0xc5ccbe);roadParts.push(disc);
    }
  }
  // 水務維修碎石路、貨港／鑄造瀝青路與混凝土據點分材質；共用既有地形atlas。
  flush(roadParts,terrain?terrainMat:groundMat,'Service-streets_walkable-route-source');
  // 薄的接觸遮蔭只有一個批次；幾何在地表上，不增加碰撞或動態燈。
  const contact=[];
  for(const o of obstacles){
    const edges=[[o.x,o.y,o.x+o.w,o.y],[o.x,o.y+o.h,o.x+o.w,o.y+o.h],[o.x,o.y,o.x,o.y+o.h],[o.x+o.w,o.y,o.x+o.w,o.y+o.h]];
    for(const [ax,az,bx,bz] of edges){
      const dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz),sign=ax===o.x&&bx===o.x?-1:az===o.y&&bz===o.y?-1:1;
      const nx=dz!==0?sign*.85:0,nz=dx!==0?sign*.85:0,points=[[ax,az],[bx,bz],[ax+nx,az+nz],[bx+nx,bz+nz]];
      if(len<.1)continue;const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(([x,z])=>[W.vx(x),.018+elevation(x,z),W.vz(z)]),3));
      geo.setAttribute('color',new THREE.Float32BufferAttribute([.42,.42,.42,.42,.42,.42,1,1,1,1,1,1],3));geo.setIndex([0,1,2,2,1,3]);geo.computeVertexNormals();contact.push(geo);
    }
  }
  // 接觸遮蔭是無厚度三角片；DoubleSide保留兩側可見，但不需要透明體積的
  // 前／背分開draw，避免r160每幀切兩次side與material.version。
  const contactMat=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.38,blending:THREE.MultiplyBlending,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true});ownedMaterials.add(contactMat);flush(contact,contactMat,'Contact-shading_single-batch');
  // 平貼的工業鋪面用可視節點作區域定位，不新增升降/碰撞真相。
  const zonePoints = [map.sites.a, map.sites.b, map.nodes.mid, map.spawns.t, map.spawns.ct].filter(Boolean);
  zonePoints.forEach((p, i) => {
    const siteColor=mapKey==='mirage'?(i===0?0xc5c1a8:0xb9c6bc):mapKey==='dust2'?(i===0?0xc6d2ce:0xbab5a0):(i===0?0xb9a18a:0xb8c5bb);
    groundPatch(paving, 2, i < 2 ? siteColor : art.paving, p.x,p.y,i < 2 ? 15 : 10,i < 2 ? 14 : 11);
    // 工業警戒線與 site 語意相同，細節無透明 overdraw。
    if (i < 2) for (const side of [-1, 1]) {
      groundPatch(accents,2,0xc6a557,p.x+side*6.8,p.y,.18,12,.058);
      groundPatch(accents,2,0xc6a557,p.x,p.y+side*6,13.6,.18,.058);
    }
    if(i<2)for(let n=0;n<10;n++)groundPatch(accents,2,n%2?0x343e40:0xd7b65b,p.x-5.8+n*1.28,p.y-6.1,.7,.55,.06);
    if(i===2){
      for(let n=-2;n<=2;n++)groundPatch(accents,1,0x456771,p.x+n*.32,p.y, .14,7);
      groundPatch(accents,2,0xaab3a6,p.x,p.y+4,6,.14);
    }
  });
  // 地面齊平排水溝與檢修蓋只沿已有實體邊緣配置，不增加導航／射線碰撞。
  // 短條與格柵全部併入同一accents批次，不為小裝飾增Mesh。
  if(terrain)for(const w of map.walls){
    if(w.architecture||w.w<6||w.h<6||w.x<7||w.y<7)continue;
    const z=w.y+w.h+.5;
    if(z>93)continue;
    const length=Math.min(6,w.w-1),x=w.x+w.w*.5;
    groundPatch(accents,2,0x455454,x,z,length,.32,.065);
    for(let n=0;n<6;n++)groundPatch(accents,2,0x93a29c,x+(n-2.5)*length/6,z,.045,.3,.07);
  }
  flush(paving, groundMat, "Courtyards_and_service-paving");
  flush(accents, groundMat, "Site_safety-lines");

  // 真正的室內中繼空間：屋頂梁架位於牆頂，門洞仍以原碰撞資料為準。
  const fadeRoofs=[],allRoomPaving=[];
  for(const room of map.rooms||[]){
    const beams=[],roofMat=material(0xffffff,{map:atlas,vertexColors:true,side:room.authored?THREE.DoubleSide:THREE.FrontSide});
    if(room.authored){
      const spring=W.vy(room.height),cx=room.x+room.w/2,cz=room.y+room.h/2,doorParts=[],fittings=[];
      const doors=room.entryAxis==='y'?[[cx,room.y+.4],[cx,room.y+room.h-.4]]:[[room.x+.4,cz],[room.x+room.w-.4,cz]];
      for(const [x,z] of doors){
        // 官方模型最窄門口為2.9m；縮放後恰與 authoritative 4.8m門洞一致。
        if(!room.processKind&&(mapKey!=='dust2'||room.id==='customs-transfer')){
          const first=doorParts.length;
          authored(doorParts,'building-kit/wall-doorway-wide-square',x,0,z,4,1.5,room.doorWidth/2.9,room.entryAxis==='y'?Math.PI/2:0);
          // 真正使用的海關門框保留官方厚轉角；只在clone上統一鋼骨塗裝，非白框貼片。
          if(mapKey==='dust2')for(const geo of doorParts.slice(first)){
            const colors=geo.getAttribute('color'),paint=new THREE.Color(0x63736b);
            if(colors)for(let i=0;i<colors.count;i++)colors.setXYZ(i,paint.r,paint.g,paint.b);
          }
        }
        const alongX=room.entryAxis==='y',top=3.6;
        if(mapKey!=='dust2'&&!room.processKind)box(beams,art.tile,art.shell,x,(top+spring)/2,z,alongX?room.doorWidth:.8,spring-top,alongX?.8:room.doorWidth);
        if(mapKey==='dust2'||room.processKind){
          // 深色工字門架替換薄白框；翼板內緣仍在±2.4m，無縮口。
          for(const side of [-1,1]){
            const offset=side*(room.doorWidth/2+.22);
            box(doorParts,1,0x3e4946,x+(alongX?offset:0),1.8,z+(alongX?0:offset),alongX?.2:.72,3.6,alongX?.72:.2);
            for(const face of [-1,1])box(doorParts,1,0x667168,x+(alongX?offset:face*.3),1.8,z+(alongX?face*.3:offset),alongX?.44:.12,3.6,alongX?.12:.44);
            box(doorParts,1,0x9b9478,x+(alongX?offset:0),.3,z+(alongX?0:offset),alongX?.44:.76,.6,alongX?.76:.44);
          }
          box(doorParts,1,0x3e4946,x,3.925,z,alongX?room.doorWidth+.88:.35,.65,alongX?.35:room.doorWidth+.88);
          for(const y of [3.66,4.19])box(doorParts,1,0x737b6c,x,y,z,alongX?room.doorWidth+.88:.76,.12,alongX?.76:room.doorWidth+.88);
          // 上部仍完全封閉：薄退縮板與兩條立梃取代整塊3.4m高棕色門楣。
          const panelBottom=4.25,panelHeight=spring-panelBottom;
          if(panelHeight>0){
            box(doorParts,1,room.processKind?0x827d6c:0x87958c,x,panelBottom+panelHeight/2,z,alongX?room.doorWidth:.18,panelHeight,alongX?.18:room.doorWidth);
            for(const side of [-1,1])box(doorParts,1,0x535e56,x+(alongX?side*room.doorWidth/6:0),panelBottom+panelHeight/2,z+(alongX?0:side*room.doorWidth/6),alongX?.12:.3,panelHeight,alongX?.3:.12);
          }
          box(doorParts,1,0x59635c,x,spring-.15,z,alongX?room.doorWidth+.88:.76,.3,alongX?.76:room.doorWidth+.88);
        }
      }
      if(room.processKind==='pump-hall'){
        // 低泵廊只有靠屋面的支承梁；不把鑄造吊罩壓到玩家頭頂。
        for(const side of [-1,1])box(beams,1,0x708d80,cx+side*room.w*.3,spring-.16,cz,.25,.2,room.h-.8);
      }else if(mapKey==='dust2'||room.processKind){
        // 三組有腹板／上下翼板的屋架取代四條細桿，吊軌在高處，地面通路完全保留。
        for(let n=0;n<3;n++){
          const z=room.y+(n+.5)*room.h/3;
          box(beams,1,0x708d88,cx,spring-.7,z,room.w-.8,.66,.16);
          for(const y of [spring-1.05,spring-.35])box(beams,1,0xa9b3a4,cx,y,z,room.w-.8,.12,.5);
        }
        for(const side of [-1,1])box(beams,1,0x9d9e7e,cx+side*room.w*.25,spring-1.2,cz,.18,.28,room.h-1.6);
      }else for(let n=0;n<4;n++)box(beams,1,art.trim,cx,spring-.25,room.y+(n+.5)*room.h/4,room.w-.8,.3,.22);
      if(room.processKind){
        // 真通廊的排氣罩與吊運梁全在3.6m以上，中央視線及地面不添障礙。
        box(beams,1,0x778579,cx,spring+.1,cz,room.w,.2,room.h);
        if(room.processKind!=='pump-hall'){
          box(beams,1,0x596e68,cx,4.8,cz,room.w*.5,.5,room.h*.4);
          for(const side of [-1,1])box(beams,1,0xa5a58b,cx+side*room.w*.22,5.65,cz,.15,1.2,.15);
          box(beams,1,0x9a9275,cx,4.05,cz,room.w*.35,.3,.55);
        }
        const upper=[];
        appendMajorPlantAssembly({kind:room.processKind,w:room,height:spring,mobile,upper,box,extrusion,remap,transform});
        const upperMat=material(0xffffff,{map:atlas,vertexColors:true,roughness:.72,metalness:.1});
        localOccluder(flush(upper,upperMat,`Process_${room.id}_upper-landmark`,true),upperMat);
      }else if(room.roof==='vault')barrelRoof(beams,cx,spring,room.y,room.w,room.h,1,0x91aaa1,2.6);
      else if(room.roof==='clerestory'||room.roof==='shed'){
        // 通關廊有中脊採光帶；鑄件廊是單向排水斜屋面，不再複製鋸齒房。
        const roofPlane=(x0,x1,y0,y1)=>{
          const geo=new THREE.BufferGeometry(),points=[[x0,y0,room.y],[x1,y1,room.y],[x0,y0,room.y+room.h],[x1,y1,room.y+room.h]];
          geo.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(([x,y,z])=>[W.vx(x),y+elevation(x,z),W.vz(z)]),3));
          geo.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));geo.setIndex([0,2,1,1,2,3]);geo.computeVertexNormals();remap(geo,1,0x9caaa5);beams.push(geo);
        };
        if(room.roof==='shed')roofPlane(room.x,room.x+room.w,spring+2.2,spring);
        else{
          roofPlane(room.x,cx-.8,spring,spring+1.4);roofPlane(cx+.8,room.x+room.w,spring+1.4,spring);
          box(beams,1,0x678d91,cx,spring+1.8,cz,1.6,.12,room.h);
          for(const side of [-1,1])box(beams,1,0x9cbfc1,cx+side*.8,spring+1.6,cz,.08,.4,room.h);
        }
      }else{
        // 有採光豎面的薄鋸齒屋頂，而非完整實心楔塊。
        const bayDepth=room.h/3;
        for(let bay=0;bay<3;bay++){
          const z0=room.y+bay*bayDepth,z1=z0+bayDepth;
          box(beams,1,0x8aa6a3,cx,spring+1.3,z1-.08,room.w,.12,.16);
          const geo=new THREE.BufferGeometry(),points=[[room.x,spring,z0],[room.x+room.w,spring,z0],[room.x,spring+1.7,z1],[room.x+room.w,spring+1.7,z1]];
          geo.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(([x,y,z])=>[W.vx(x),y+elevation(x,z),W.vz(z)]),3));
          geo.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));geo.setIndex([0,2,1,1,2,3]);geo.computeVertexNormals();remap(geo,1,0xa8b9b0);beams.push(geo);
        }
      }
      const wallBatch=roomWallBatches.get(room.id);
      // 控制盤／機械只嵌在已有牆帶內，不在室內偷偷新增不可見碰撞。
      const fittingZ=room.entryAxis==='x'?room.y+(room.h-room.doorWidth)/4:room.y+room.h*.28;
      const fittingDepth=room.entryAxis==='x'?Math.max(.2,(room.h-room.doorWidth)/2-.2):2.6;
      if(room.fixtures?.length){
        // 真實工位由同源obstacles放入opaque掩體批；不保留牆內壓扁副本。
      }else if(room.processKind){
        // 設備只放無門的整段側牆，深度0.7m完全含於authoritative 0.8m牆帶。
        const wallAlongX=room.entryAxis==='x',length=wallAlongX?room.w:room.h;
        for(let n=0;n<3;n++){
          const along=(n+.5)*length/3,px=wallAlongX?room.x+along:room.x+.4,pz=wallAlongX?room.y+.4:room.y+along;
          box(fittings,1,n===1?0x8a8270:0x626c60,px,1.65,pz,wallAlongX?length/3-.3:.7,3.1,wallAlongX?.7:length/3-.3);
          box(fittings,1,0x3d4740,px+(wallAlongX?0:.37),2,pz+(wallAlongX?.37:0),wallAlongX?length/3-.7:.035,1.25,wallAlongX?.035:length/3-.7);
          if(!mobile)box(fittings,1,0xb0a279,px+(wallAlongX?0:.39),1.15,pz+(wallAlongX?.39:0),wallAlongX?length/3-.8:.025,.12,wallAlongX?.025:length/3-.8);
        }
      }else if(room.compact){
        box(fittings,1,0x486e72,room.x+.4,1.3,fittingZ,.6,1.8,Math.min(1.4,fittingDepth));
        box(fittings,1,0xa7b99c,room.x+.72,1.65,fittingZ,.05,.42,Math.min(.7,fittingDepth));
      }else if(!(map.rooms||[]).some(r=>r.fixtures?.length))authoredFit(fittings,'factory-kit/machine-fortified',room.x+.4,1,fittingZ,.62,1.9,Math.min(2.6,fittingDepth));
      if(mapKey==='dust2'&&!room.fixtures?.length){
        // 維修帶嵌在0.8m既有牆裡；維修房取兩端牆段，避免穿過側入口。
        for(const fraction of (room.entryAxis==='x'?[.2,.8]:[.24,.5,.76])){
          const z=room.y+room.h*fraction;
          box(fittings,1,0x577674,room.x+.4,1.35,z,.62,2.4,1.7);
          box(fittings,1,0xa9b5a2,room.x+.735,1.65,z,.045,.75,1.25);
          if(!mobile)for(const side of [-1,1])box(fittings,1,0x344b49,room.x+.765,1.65,z+side*.35,.02,.4,.25);
        }
      }
      // 門、牆內控制盤與窗套共用同房間材質及最小fade；真cover不加入此處。
      wallBatch.panels.push(...doorParts,...fittings);
      const roof=flush(beams,roofMat,`${room.label}_authored-hall-roof`,true);roof.geometry.computeBoundingBox();
      fadeRoofs.push({rect:{x0:W.vx(room.x),z0:W.vz(room.y),x1:W.vx(room.x+room.w),z1:W.vz(room.y+room.h)},material:roofMat,cur:1,occupiedOpacity:.1});
      const roomPaving=[];groundPatch(roomPaving,2,art.paving,cx,cz,room.w-.8,room.h-.8);
      if(mapKey==='dust2')for(const side of [-1,1]){
        groundPatch(roomPaving,1,0xa69d72,cx+side*(room.w*.5-1.15),cz,.13,room.h-1.6,.06);
      }
      allRoomPaving.push(...roomPaving);
      continue;
    }
    const crossBeams=room.roof==='vault'?2:5;
    for(let n=0;n<crossBeams;n++)box(beams,1,art.trim,room.x+room.w/2,W.vy(room.height)+.25,room.y+(n+.5)*room.h/crossBeams,room.w-.4,.38,.28);
    for(const side of [-1,1])box(beams,1,art.roof,room.x+room.w/2,W.vy(room.height)+.4,room.y+room.h/2+side*room.h*.32,room.w-.4,.16,room.h*.2);
    const spring=W.vy(room.height)+.35,cx=room.x+room.w/2;
    if(room.roof==='vault'){
      // 石造低拱廊包住開口內院；不把中央全部蓋成另一座大盒屋。
      for(const side of [-1,1])barrelRoof(beams,cx+side*(room.w/2-2.25),spring,room.y,4.1,room.h,1,0x91ada5,1.25);
      for(const z of [room.y+.25,room.y+room.h-.75]){
        const arch=new THREE.Shape(),half=room.w/2;
        arch.moveTo(-half,0);arch.lineTo(-half+.65,0);arch.quadraticCurveTo(-half+1.1,3.6,0,4.4);arch.quadraticCurveTo(half-1.1,3.6,half-.65,0);arch.lineTo(half,0);arch.quadraticCurveTo(half-.5,4.25,0,5.15);arch.quadraticCurveTo(-half+.5,4.25,-half,0);arch.closePath();
        extrusion(beams,arch,.55,0,0xd2c4a8,cx,3.2,z);
      }
      for(const x of [room.x-.25,room.x+room.w+.25])for(const z of [room.y+2,room.y+room.h-2])box(beams,0,0xcbb99c,x,spring/2,z,.4,spring,.65);
    }else if(room.roof==='sawtooth'){
      // 海關檢查廊的拱形雨棚連接兩側實體牆；不冒充新的可穿越掩體。
      barrelRoof(beams,cx,spring,room.y,room.w-.4,room.h,1,0xa5c2c5,2.5);
      for(const z of [room.y+.3,room.y+room.h-.3])for(const x of [room.x-.2,room.x+room.w+.2])box(beams,1,0xbacbc4,x,spring/2,z,.3,spring,.35);
      for(let n=0;n<3;n++)box(beams,1,0x678892,cx,spring+2.5,room.y+(n+.5)*room.h/3,room.w*.15,.14,room.h*.2);
    }else{
      const gable=new THREE.Shape();gable.moveTo(-room.w/2+.15,0);gable.lineTo(-room.w*.12,4.1);gable.lineTo(room.w/2-.15,0);gable.closePath();
      extrusion(beams,gable,room.h,1,0xb1a78e,cx,spring,room.y);
      for(const z of [room.y+.25,room.y+room.h-.25])box(beams,1,0xc5a275,cx-room.w*.12,spring+4.1,z,.25,.22,.5);
    }
    flush(beams,roofMat,`${room.label}_indoor-roof-and-skylight`,true);
    fadeRoofs.push({rect:{x0:W.vx(room.x),z0:W.vz(room.y),x1:W.vx(room.x+room.w),z1:W.vz(room.y+room.h)},material:roofMat,cur:1,occupiedOpacity:room.roof==='vault'?.7:.16});
  }
  flush(allRoomPaving,groundMat,'Authored-rooms_continuous-floor');
  for(const [id,batch] of roomWallBatches){
    flush(batch.shell,batch.mat,`Room_${id}_room-wall`,true);
    flush(batch.panels,batch.panelMat,`Room_${id}_recessed-window-kit`,true);
  }
  if(mapKey==='dust2'){
    // 冷鏈裝卸區的整體高架橋式吊運架，下方使用同源1.8m平台／緩坡。
    // 四根支柱分別落在北庫房、南維修房及東庫房的實體內。
    const gantry=[],gantryMat=material(0xffffff,{map:atlas,vertexColors:true}),top=12.8;
    for(const [x,z] of [[69.5,16],[69.5,33],[83.5,19],[83.5,33]]){
      const base=elevation(x,z);box(gantry,1,0xd5b67c,x,(top-base)/2,z,.6,top-base,.7);
    }
    for(const x of [69.5,83.5])box(gantry,1,0xc8aa72,x,top-elevation(x,24.5),24.5,.75,.8,19);
    box(gantry,1,0xe0c288,76.5,top+.15-elevation(76.5,25.5),25.5,15.2,.8,1.3);
    for(let n=0;n<6;n++)box(gantry,1,0x789391,70+n*2.6,top+1-elevation(70+n*2.6,25.5),25.5,.12,1.15,.12);
    box(gantry,1,0x8caaa6,76.5,top+1.5-elevation(76.5,25.5),25.5,15.2,.1,.1);
    box(gantry,1,0x5e838a,76.5,top-1-elevation(76.5,25.5),25.5,2.7,1.4,1.8);
    for(const x of [75.8,77.2])box(gantry,1,0xa6b6ae,x,9-elevation(x,25.5),25.5,.08,3.4,.08);
    box(gantry,1,0xced3b4,76.5,7.2-elevation(76.5,25.5),25.5,2.3,.15,1.1);
    flush(gantry,gantryMat,'A_cold-chain_loading-gantry',true);
    fadeRoofs.push({rect:{x0:W.vx(68),z0:W.vz(17),x1:W.vx(85),z1:W.vz(34)},material:gantryMat,cur:1,occupiedOpacity:.72});
  }
  if(mapKey==='inferno'){
    // 壓機庭院的橋式吊機。支柱嵌在兩側 authoritative 建物內，吊具最低點
    // 高於平台上選手，地面動線、射線及掩體沒有第二份視覺真相。
    const bridge=[],bridgeMat=material(0xffffff,{map:atlas,vertexColors:true});
    for(const x of [71.7,83.3]){
      const base=elevation(x,82),top=11.5;
      box(bridge,1,0xd0b570,x,(top-base)/2,82,.4,top-base,.7);
    }
    box(bridge,1,0xd0b570,77.5,11.5-elevation(77.5,82),82,12.2,.65,1.1);
    box(bridge,1,0x536d74,78.5,10.6-elevation(78.5,82),82,2,1.2,1.3);
    box(bridge,1,0xc0b896,78.5,8.8-elevation(78.5,82),82,.12,2.4,.12);
    const hook=new THREE.TorusGeometry(.42,.1,3,8,Math.PI*1.55);remap(hook,1,0xc0b896);hook.applyMatrix4(transform(78.5,7.45-elevation(78.5,82),82,1,1,1));bridge.push(hook);
    flush(bridge,bridgeMat,'A_press-courtyard_bridge-crane',true);
    fadeRoofs.push({rect:{x0:W.vx(72),z0:W.vz(79),x1:W.vx(83),z1:W.vz(85)},material:bridgeMat,cur:1,occupiedOpacity:.65});
  }

  // Authoritative 低掩體以同源 AABB 建造，再加內縮細節。共享 unit geometry
  // 的 Instancing，避免每個箱條/鉚釘都是一個 draw call。
  const coverMat = material(0xffffff, { map: atlas, vertexColors: false });
  const coverGeo = remap(unit.clone(), 3, 0xffffff); ownedGeometries.add(coverGeo);
  const cover = obstacles.filter(o => o.kind !== "building");
  const coverVariants=[],roomFixtureBounds=[];
  const coverMesh = new THREE.InstancedMesh(coverGeo, coverMat, cover.length);
  coverMesh.name = "Authoritative_cover_pool"; coverMesh.castShadow = true; coverMesh.receiveShadow = true;
  const coverTrim = [], coverBounds = [];
  cover.forEach((o, i) => {
    const x = o.x + o.w / 2, z = o.y + o.h / 2, h = W.vy(o.hgt);
    const siteEquipment=o.kind==='crate'&&Math.min(Math.hypot(x-map.sites.a.x,z-map.sites.a.y),Math.hypot(x-map.sites.b.x,z-map.sites.b.y))<15;
    const isBox=o.kind==='crate'&&!siteEquipment;
    coverMesh.setMatrixAt(i, transform(x, h / 2, z, isBox?o.w:0, isBox?h:0, isBox?o.h:0));
    coverMesh.setColorAt(i, new THREE.Color(o.kind === "sandbag" ? 0xa6a289 : o.kind === "car" ? art.trim : o.kind === "barrel" ? 0x708087 : 0xb6a48a));
    if(o.kind==='room-fixture'){
      const first=coverVariants.length,rotation=o.rotation||0,quarterTurn=Math.abs(Math.sin(rotation))>.5;
      authoredFit(coverVariants,o.asset,x,0,z,quarterTurn?o.h:o.w,h,quarterTurn?o.w:o.h,rotation);
      // 正常尺度CC0機身保留自己的面板色；UV改用既有金屬atlas，無新材質批。
      const machine=coverVariants[first],sourceColors=machine.getAttribute('color').clone();
      remap(machine,1,0xffffff);machine.setAttribute('color',sourceColors);
      // 低基座及背板封閉機架空隙，均完全包含在authoritative fixture AABB。
      // 機架腿間改為實心維修櫃體：蹲姿也不能透過proxy阻擋的底部空隙。
      box(coverVariants,2,0x8b9284,x,h*.28,z,o.w,h*.56,o.h);
      box(coverVariants,1,0x566d64,quarterTurn?o.x+.06:x,h*.5,quarterTurn?z:o.y+.06,quarterTurn?.12:o.w,h,quarterTurn?o.h:.12);
      const bounds=new THREE.Box3();
      for(const geo of coverVariants.slice(first)){geo.computeBoundingBox();bounds.union(geo.boundingBox);}
      roomFixtureBounds.push({id:o.id,roomId:o.roomId,sourceMesh:'Cover_barrels-sandbags-maintenance-carts',min:{x:bounds.min.x,y:bounds.min.y,z:bounds.min.z},max:{x:bounds.max.x,y:bounds.max.y,z:bounds.max.z}});
    }else if(siteEquipment&&mapKey==='mirage'){
      // 安包區調壓泵／濾水組：密封圓罐、底座、管歧、閥輪，仍在同一AABB內。
      box(coverVariants,2,0xaab4ad,x,h*.12,z,o.w*.98,h*.24,o.h*.98);
      for(const side of [-1,1]){
        const tank=new THREE.CylinderGeometry(o.w*.22,o.w*.23,h*.7,mobile?10:14);remap(tank,1,0x9bc0b9);tank.applyMatrix4(transform(x+side*o.w*.25,h*.6,z,1,1,1));coverVariants.push(tank);
      }
      box(coverVariants,1,0xc0b591,x,h*.58,z+o.h*.31,o.w*.8,.18,.18);
      const valve=new THREE.TorusGeometry(Math.min(o.w,o.h)*.18,.07,3,10);remap(valve,1,0xbfc895);valve.applyMatrix4(transform(x,h*.66,z+o.h*.4,1,1,1));coverVariants.push(valve);
    }else if(siteEquipment&&mapKey==='dust2'){
      // 冷鏈貨櫃：閉合門片、壓條、鉸鏈及冷卻背箱，不只換色木箱。
      box(coverVariants,1,i%2?0x9badae:0x477a86,x,h*.5,z,o.w,h,o.h);
      for(let rib=0;rib<5;rib++)for(const side of [-1,1])box(coverVariants,1,0xbac5be,x+(rib-2)*o.w*.17,h*.5,z+side*(o.h*.5-.035),.045,h*.93,.05);
      for(const side of [-1,1])box(coverVariants,1,0xd1b876,x+side*o.w*.18,h*.5,z+o.h*.5-.045,.055,h*.85,.07);
      box(coverVariants,2,0xadb5ad,x,h*.8,z-o.h*.36,o.w*.72,h*.24,o.h*.25);
    }else if(siteEquipment&&mapKey==='inferno'){
      // 壓機護罩：切角封閉機體、雙柱與上橫樑，沒有可穿越的假空洞。
      box(coverVariants,1,0x867b68,x,h*.4,z,o.w*.98,h*.8,o.h*.98);
      for(const side of [-1,1])box(coverVariants,1,0xb7a173,x+side*o.w*.35,h*.65,z,o.w*.16,h*.7,o.h*.8);
      box(coverVariants,1,0x56666b,x,h*.92,z,o.w,.16,o.h);
      box(coverVariants,1,0xcdb964,x,h*.72,z+o.h*.47,o.w*.6,.12,.045);
      for(let n=0;n<3;n++)box(coverVariants,1,0x3c4c4f,x+(n-1)*o.w*.22,h*.32,z+o.h*.49,o.w*.1,h*.35,.03);
    }else if(o.kind==='barrel'){
      const cylinder=new THREE.CylinderGeometry(o.w*.44,o.w*.47,h,mobile?10:16);remap(cylinder,1,0x7c9999);cylinder.applyMatrix4(transform(x,h/2,z,1,1,1));coverVariants.push(cylinder);
      for(const level of [.2,.8]){const band=new THREE.CylinderGeometry(o.w*.48,o.w*.48,.1,mobile?10:16);remap(band,1,0x435459);band.applyMatrix4(transform(x,h*level,z,1,1,1));coverVariants.push(band);}
    }else if(o.kind==='sandbag'){
      for(let row=0;row<3;row++)for(let n=0;n<3;n++)box(coverVariants,0,row%2?0xa99e7b:0xbeb494,x+(n-1)*o.w*.31,h*(row+.5)/3,z,o.w*.3,h*.3,o.h*.92);
    }else if(o.kind==='car'){
      // ESMO 維修電動車：車體、駕駛室、輪胎與載台皆在同源 AABB 內。
      box(coverVariants,1,art.trim,x,h*.28,z,o.w*.9,h*.36,o.h*.85);
      box(coverVariants,1,0x567782,x-o.w*.22,h*.67,z,o.w*.3,h*.42,o.h*.76);
      box(coverVariants,1,0x1e3139,x-o.w*.22,h*.83,z,o.w*.26,h*.18,o.h*.78);
      box(coverVariants,2,0xaaa995,x+o.w*.24,h*.48,z,o.w*.37,h*.08,o.h*.82);
      for(const side of [-1,1])for(const axle of [-1,1]){
        const wheel=new THREE.CylinderGeometry(h*.22,h*.22,.24,mobile?8:12);remap(wheel,2,0x293032);wheel.rotateX(Math.PI/2);wheel.applyMatrix4(transform(x+axle*o.w*.3,h*.23,z+side*(o.h*.5-.16),1,1,1));coverVariants.push(wheel);
      }
    }else{
      for (const side of [-1, 1]) box(coverTrim, 1, 0x6b706b, x + side * (o.w / 2 - .13), h / 2, z, .18, h, o.h);
      box(coverTrim, 1, 0x858b7b, x, h * .85, z, o.w, .13, o.h);
    }
    coverBounds.push({ x: o.x, y: o.y, w: o.w, h: o.h, height: h, kind: o.kind });
  });
  coverMesh.computeBoundingSphere(); environment.add(coverMesh);
  flush(coverVariants,groundMat,'Cover_barrels-sandbags-maintenance-carts',true);
  flush(coverTrim, groundMat, "Cover_steel-bindings");

  // 各圖地標均落在高建物 collider 內；不另建「裝飾掩體」。
  const heroIndex=Math.max(0,map.walls.findIndex(w=>w.w>=8&&w.h>=8));
  const hero = [], first = map.walls[heroIndex], hx = first.x + first.w / 2, hz = first.y + first.h / 2, base = W.vy(first.hgt);
  const heroMat = material(0xffffff, { map: atlas, vertexColors: true, roughness: .68, metalness: .12 });
  if (mapKey === "mirage") {
    for (const side of [-1, 1]) box(hero, 1, art.trim, hx + side * 2, base + 3, hz, .5, 6, 1);
    // 圓柱塔體相較矩形樓群形成可辨識的遠景輪廓。
    const tankGeo = new THREE.CylinderGeometry(2.7, 2.7, 4, mobile ? 12 : 20);
    remap(tankGeo, 1, 0xbed0c7); tankGeo.applyMatrix4(transform(hx, base + 6, hz, 1, 1, 1)); hero.push(tankGeo);
    box(hero, 1, art.roof, hx, base + 8.2, hz, 6, .38, 6);
  } else if (mapKey === "dust2") {
    for (const side of [-1, 1]) box(hero, 1, 0xb98c54, hx + side * first.w * .32, base + 3.5, hz, .65, 7, .65);
    box(hero, 1, 0xc5a16a, hx, base + 7, hz, first.w * .84, .7, .85);
    box(hero, 1, art.trim, hx, base + 4.8, hz, 2.6, 1.8, 2.4);
  } else {
    for (const side of [-1, 0, 1]) {
      const spacing=Math.min(4,(first.w-3)/3);
      const chimney = new THREE.CylinderGeometry(.8, 1.2, 8 + side, mobile ? 8 : 12);
      remap(chimney, 2, 0xa18f7d); chimney.applyMatrix4(transform(hx + side * spacing, base + (8 + side) / 2, hz, 1, 1, 1)); hero.push(chimney);
      box(hero, 1, art.roof, hx + side * spacing, base + 8 + side, hz, 2.5, .38, 2.5);
    }
  }
  const heroMesh = flush(hero, heroMat, `${art.landmark}_roof-landmark`);
  // 地標跟所屬建物一起淡出，不出現孤立懸空屋頂。
  localOccluder(heroMesh,heroMat);
  heroMesh.userData.landmark = art.landmark;

  // 場外建築群不是可行走掩體；承接街廓／港區／鑄造廠，消除孤立沙盤邊界。
  // 所有背景細節合為兩批，不用獨立mesh堆出城市。
  const district=[],districtPanels=[];
  if(terrain){
    // 外側體量連到既有周界的外緣；競技區內仍只有 authoritative 牆。
    // 長廠房、錯層辦公翼及碼頭是街區組織，不是分散的屋頂展示件。
    // 採用 CC0 有完整建築細節的廠房：機房翼、拱形裝卸洞口、退台、
    // 管線及設備已在資產內。依 bounds 正規化，與近景同樣以米為尺度。
    const buildings=[],buildingMat=material(0xffffff,{map:atlas,vertexColors:true,roughness:.78,metalness:.08}),buildingAccents=[];
    const districtBuildings=mapKey==='mirage'
      ?[['building-j',-17,63,22,12,25,0],['building-n',24,-16,20,16,26,0]]
      :mapKey==='dust2'
        ?[['building-j',24,-16,28,13,20,0],['building-n',-17,75,20,15,26,Math.PI/2]]
        :[['building-j',-17,70,24,14,25,0],['building-n',30,-18,30,18,20,Math.PI/2]];
    for(const [id,x,z,width,height,depth,rotation] of districtBuildings)authoredFit(buildings,'city-kit-industrial/'+id,x,0,z,width,height,depth,rotation);
    // 以來源模型的實際面與調色盤分區；牆／屋頂接上共享材質，玻璃、
    // 警戒塗裝與設備色保留。僅拆成兩批，不加貼圖或每棟獨立材質。
    const textured=[];
    for(const source of buildings){
      const geo=source.index?source.toNonIndexed():source,p=geo.attributes.position,n=geo.attributes.normal,c=geo.attributes.color;
      const bins=[{position:[],normal:[],uv:[],color:[]},{position:[],normal:[],uv:[],color:[]}];
      for(let i=0;i<p.count;i+=3){
        let r=0,g=0,b=0,ny=0;for(let j=0;j<3;j++){r+=c.getX(i+j)/3;g+=c.getY(i+j)/3;b+=c.getZ(i+j)/3;ny+=n.getY(i+j)/3;}
        const max=Math.max(r,g,b),min=Math.min(r,g,b),accent=max<.13||(max>.2&&max>min*3),bin=bins[accent?1:0];
        const roof=ny>.35,tile=roof?1:art.tile,tint=new THREE.Color(roof?0xa0b0a8:art.shell);
        tint.multiplyScalar(THREE.MathUtils.clamp(.8+(r+g+b)/3*.55,.82,1.12));
        for(let j=0;j<3;j++){
          const k=i+j;bin.position.push(p.getX(k),p.getY(k),p.getZ(k));bin.normal.push(n.getX(k),n.getY(k),n.getZ(k));
          bin.uv.push(tile%2*.5+.25,tile<2?.75:.25);bin.color.push(...(accent?[c.getX(k),c.getY(k),c.getZ(k)]:[tint.r,tint.g,tint.b]));
        }
      }
      bins.forEach((bin,i)=>{if(!bin.position.length)return;const part=new THREE.BufferGeometry();for(const key of ['position','normal','uv','color'])part.setAttribute(key,new THREE.Float32BufferAttribute(bin[key],key==='uv'?2:3));(i?buildingAccents:textured).push(part);});
      if(geo!==source)geo.dispose();source.dispose();
    }
    flush(textured,buildingMat,'Authored_industrial-district_CC0',true);
    flush(buildingAccents,material(0xffffff,{vertexColors:true,roughness:.48,metalness:.12}),'Authored_industrial-district_equipment',true);
    // 低矮服務牆與綠地連接廠房，不以六座長方形盒體包住世界。
    for(const [x,z,width,depth] of (mapKey==='inferno'?[]:[[-8,10,22,3],[-8,83,22,3],[81,-8,3,22],[22,109,22,3]])){
      box(district,2,art.shell,x,.65,z,width,1.3,depth);
      box(district,1,art.trim,x,1.4,z,width,.18,depth);
    }
    if(mapKey!=='mirage'){
      // 場外運輸道路、裝卸坪與種植帶接續廠房；全部在競技邊界之外。
      const yard=[];
      const surface=(x,z,width,depth,color,tile=3,lift=.025)=>{
        const geo=new THREE.PlaneGeometry(width,depth);geo.rotateX(-Math.PI/2);remap(geo,tile,color);geo.translate(W.vx(x),lift,W.vz(z));yard.push(geo);
      };
      if(mapKey==='inferno'){
        // 位於既有平整district pads，低於道路薄面；西供料帶接南側公用設備坪。
        surface(-20,52,36,96,0xa4afa4,1,.018);
        surface(50,123,90,40,0x9eaaa3,1,.018);
      }
      for(const [x,z,width,depth] of [[-5,50,8,126],[105,50,8,126],[50,-7,118,8],[50,105,118,8]])surface(x,z,width,depth,0x566365);
      for(const [x,z,width,depth] of [[-15,26,27,11],[-15,77,27,11],[24,-26,35,10],[65,135,45,10]])surface(x,z,width,depth,0xd1c9b7,1);
      // 閘門外作業坪真正接上既有環廠路/碼頭；閘門保持封閉，無穿越提示。
      if(mapKey==='dust2')surface(102,64,8,8,0xa4afa1,1,.03);
      else surface(-1.5,62,7,6,0xa4afa1,1,.03);
      for(const [x,z,width,depth] of [[-33,50,9,122],[51,-35,118,12],[46,145,114,9]])surface(x,z,width,depth,0xc1c9ae,2);
      for(let n=0;n<12;n++)for(const [x,z,width,depth] of [[-5,-3+n*10,.14,3],[10+n*8,105,3,.14]])surface(x,z,width,depth,0xd2c4a0);
      for(const [x,z,width,depth] of [[-9.4,50,.3,126],[-.6,50,.3,126],[50,-11.4,118,.3],[50,100.6,118,.3]])box(district,2,0x969c8c,x,.13,z,width,.25,depth);
      flush(yard,terrainMat,'Industrial_access-roads_and_service-yards');
    }
    if(mapKey==='mirage'){
      // 水務的濾池／高架配水主管與石造辦公街廓相接。
      // 三座開放濾池、刮泥橋與環形池壁形成低而寬的水務輪廓。
      // 取代重複巨型倉庫，水面與玻璃共批次；無透明反射或動態水面pass。
      for(const [x,z,r] of [[24,116,7.5],[47,121,9],[73,114,7.5]]){
        const rim=new THREE.LatheGeometry([[r-.45,.2],[r-.45,2.5],[r,2.5],[r,.2]].map(([r,y])=>new THREE.Vector2(r,y)),mobile?12:18);
        remap(rim,2,0xc5c4ad);rim.applyMatrix4(transform(x,0,z,1,1,1));district.push(rim);
        const water=new THREE.CircleGeometry(r-.5,mobile?12:18);water.rotateX(-Math.PI/2);remap(water,1,0x527f7d);water.applyMatrix4(transform(x,1.85,z,1,1,1));districtPanels.push(water);
        box(district,1,0x75968e,x,2.7,z,r*2,.16,.85);
        box(district,1,0xc6b67c,x,3.6,z,.8,1.7,.8);
        for(const side of [-1,1])box(district,1,0x9cac92,x,3.35,z+side*.42,r*2,.07,.07);
      }
      for(const [x,z] of [[-17,27],[-25,39]]){
        const tank=new THREE.CylinderGeometry(3.1,3.3,7,mobile?10:14);remap(tank,1,0xb3c8bc);tank.applyMatrix4(transform(x,3.5,z,1,1,1));district.push(tank);
      }
      box(district,2,0xa5aa93,49,.12,104,91,.24,4);
      // 南側封閉水務服務閘門接既有濾池步道，皆在不可行走邊界外。
      box(district,2,0xa5aa93,68,.12,101,8,.24,6);
      for(const x of [24,47,73])box(district,2,0xa5aa93,x,.12,110,2.4,.24,12);
      box(district,1,0x78a6a0,-5,5,52,.45,.45,70);
    }else if(mapKey==='dust2'){
      // 沿同一水岸建立連續碼頭，不把港機單獨放在小平台上。
      box(district,2,0xb2b6a7,122,-.2,49,48,1.2,104);
      box(district,2,0x767f79,99,.4,49,2,2,104);
      for(let stack=0;stack<7;stack++)for(let level=0;level<2+(stack%2);level++){
        const x=106+(stack%2)*9,z=5+stack*13;
        box(district,1,stack%3===0?0x849681:stack%3===1?0x7499a0:0xba9e7e,x,2+level*3.8,z,7.6,3.7,10.5);
        box(district,1,0xc8bda0,x,3.85+level*3.8,z,7.8,.15,10.6);
      }
      for(let rail=0;rail<2;rail++)box(district,1,0x697f81,130+rail*3,.43,49,.16,.15,104);
      // 場外轉運雨棚是開放門架，不再以一棟封閉巨倉填滿前景。
      box(district,2,0xa7aaa0,55,.35,116,52,.7,15);
      for(const x of [31,43,55,67,79]){
        for(const z of [110,122])box(district,1,0xb29d76,x,3.9,z,.4,7.1,.4);
        box(district,1,0x8aa7a8,x,7.6,116,.35,.4,13);
      }
      box(district,1,0x8aa7a8,55,7.9,116,53,.18,15);
      for(const z of [110,122])box(district,1,0xb29d76,55,6.8,z,50,.25,.25);
      // 原創工作船停靠既有岸線，船首／工作甲板／駕駛室提供港灣尺度。
      const hullShape=new THREE.Shape();
      [[0,-23],[5.5,-16],[7,12],[5,19],[-5,19],[-7,12],[-5.5,-16]].forEach(([x,z],i)=>i?hullShape.lineTo(x,z):hullShape.moveTo(x,z));hullShape.closePath();
      const hull=new THREE.ExtrudeGeometry(hullShape,{depth:3.5,bevelEnabled:false});hull.rotateX(-Math.PI/2);remap(hull,1,0x657f84);hull.applyMatrix4(transform(155,-.7,64,1,1,1));district.push(hull);
      box(district,2,0xb2b7a3,155,3,57,10,.3,22);
      box(district,1,0xc2c4aa,155,5.4,51,8,4.6,7);
      box(districtPanels,1,0x668b99,155,6.3,54.55,7,1.5,.08);
      box(district,1,0x718c8c,155,7.9,51,9,.22,8);
      box(district,1,0xc1b084,155,10,51,.22,4,.22);
      for(const side of [-1,1]){
        box(district,1,0xc0bba5,155+side*6,3.8,66,.08,.08,22);
        for(const z of [56,63,70,77])box(district,1,0xc0bba5,155+side*6,3.25,z,.08,1.2,.08);
      }
    }else{
      // 鑄造生產翼：大型爐脊與連接煙道跨場外廠房，形成連續工序天際線。
      for(const [x,z,height] of [[-16,54,25],[-12,81,20],[18,-13,24]]){
        const stack=new THREE.LatheGeometry([[3.1,8],[3.1,12],[2.4,14],[1.3,17],[1.3,height],[1.6,height+.3]].map(([r,y])=>new THREE.Vector2(r,y)),mobile?8:12);
        remap(stack,2,0xab9780);stack.applyMatrix4(transform(x,0,z,1,1,1));district.push(stack);
      }
      for(const x of [-21,-17])box(district,1,0x8eaaa6,x,16.2,53,.55,.55,63);
      box(district,1,0x879d98,17,16,-14,72,.55,.55);
      box(district,1,0xb4a27e,-8,16.5,52,2,.4,94);
      // 前景以儲氣設備和管廊承接工序，建立圓形高體量與低水平走向。
      for(const [x,z,r,height] of [[34,116,5.5,11],[72,118,7,15]]){
        const vessel=new THREE.LatheGeometry([[r*.75,0],[r,1],[r,height-2],[r*.92,height],[r*.55,height+1.3],[0,height+1.6]].map(([r,y])=>new THREE.Vector2(r,y)),mobile?12:18);
        remap(vessel,1,0xa6b4aa);vessel.applyMatrix4(transform(x,0,z,1,1,1));district.push(vessel);
        for(const h of [3,height-2]){
          const band=new THREE.TorusGeometry(r+.08,.13,3,mobile?8:12);band.rotateX(Math.PI/2);remap(band,1,0x8c7261);band.applyMatrix4(transform(x,h,z,1,1,1));district.push(band);
        }
      }
      for(const x of [22,44,66,88]){
        for(const z of [103,106])box(district,1,0xb1a080,x,3.4,z,.24,6.8,.24);
        box(district,1,0xb1a080,x,6.7,104.5,.3,.3,4);
      }
      for(const z of [103.5,105.5])box(district,1,0x819d99,55,7, z,78,.4,.4);
    }
  }else for(let n=0;n<12;n++){
    const west=n<6,x=west?-18-(n%3)*11:4+(n-6)*19,z=west?8+(n%6)*20:-19-(n%2)*13;
    const bw=8+(n%3)*3,bd=10+(n%2)*7,bh=8+(n%4)*3;
    if(mapKey==='inferno'){
      // 鑄造街區承接爐房、冷卻／電力與管材工序，場外不再排同款民宅。
      const baseHeight=n%4===0?bh*.65:2.8;
      box(district,2,0xa89a82,x,baseHeight/2,z,bw,baseHeight,bd);
      if(n%4===0){
        for(let bay=0;bay<3;bay++){
          const tooth=new THREE.Shape();tooth.moveTo(-bw/2,0);tooth.lineTo(bw/2,0);tooth.lineTo(bw/2,2.8);tooth.lineTo(bw*.15,2.8);tooth.closePath();
          extrusion(district,tooth,bd/3-.1,1,0x839594,x,baseHeight,z-bd/2+bay*bd/3);
        }
        box(districtPanels,1,0xa5bbc0,x,baseHeight*.65,z+bd*.5+.03,bw*.84,1.3,.05);
      }else if(n%4===1){
        for(const side of [-1,1]){
          const cooler=new THREE.CylinderGeometry(2.15,2.55,6,mobile?8:12);remap(cooler,1,0x83a1a1);cooler.applyMatrix4(transform(x+side*2.5,5.7,z,1,1,1));district.push(cooler);
        }
        const duct=new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(W.vx(x-2.5),7.2,W.vz(z)),new THREE.Vector3(W.vx(x-2.5),9.3,W.vz(z)),new THREE.Vector3(W.vx(x+2.5),9.3,W.vz(z)),new THREE.Vector3(W.vx(x+2.5),7.2,W.vz(z))]),6,.5,5,false);remap(duct,1,0xb3b7a7);district.push(duct);
      }else if(n%4===2){
        for(let unitIndex=-1;unitIndex<=1;unitIndex++){
          const core=new THREE.CylinderGeometry(1.05,1.35,7,mobile?8:10);remap(core,1,0x657f83);core.applyMatrix4(transform(x+unitIndex*2.55,6.2,z,1,1,1));district.push(core);
          box(district,1,0xb8ae88,x+unitIndex*2.55,9.8,z,2.7,.25,3.2);
        }
      }else{
        for(let row=-1;row<=1;row++){
          const pipe=new THREE.CylinderGeometry(.95,.95,bd-1,mobile?8:12,1,true);pipe.rotateX(Math.PI/2);remap(pipe,1,0xa79a7e);pipe.applyMatrix4(transform(x+row*2.3,4.1,z,1,1,1));district.push(pipe);
        }
        for(const side of [-1,1])box(district,1,0x6d8e8c,x,4.1,z+side*(bd*.5-1),bw*.9,.3,.3);
      }
      continue;
    }
    box(district,art.tile,art.shell,x,bh/2,z,bw,bh,bd);
    if(n%3===0)barrelRoof(district,x,bh,z-bd/2,bw,bd,1,art.trim,3);
    else if(n%3===1){
      const gable=new THREE.Shape();gable.moveTo(-bw/2,0);gable.lineTo(0,4);gable.lineTo(bw/2,0);gable.closePath();extrusion(district,gable,bd,1,art.roof,x,bh,z-bd/2);
    }else{
      box(district,art.tile,art.shell,x-bw*.15,bh+2,z,bw*.65,4,bd*.7);
      box(district,1,0x839e9c,x+bw*.28,bh+1.5,z,2.5,3,bd*.8);
    }
    for(let floor=0;floor<2;floor++)box(districtPanels,1,0x8eabb1,x,bh*.38+floor*2.6,z+bd*.5+.03,bw*.78,.75,.05);
  }
  if(mapKey==='dust2'){
    // 水道另一側的大型港機，遠近景具有一致且明顯的港口用途。
    if(!terrain)box(district,2,0xb3b6a2,120,-.35,43.5,34,1.5,38);
    for(const side of [-1,1]){
      for(const z of [30,57])box(district,2,0xc3c1a8,120+side*9,.6,z,2.4,1.2,2.4);
      box(district,1,0xbe995d,120+side*9,14,30,.9,28,.9);
      box(district,1,0xbe995d,120+side*9,14,57,.9,28,.9);
    }
    box(district,1,0xd2b271,120,28,43.5,22,1,31);
    box(district,1,0x8faaa9,120,24,43.5,5,4,5);
  }else{
    for(let n=0;n<3;n++){
      const tower=new THREE.LatheGeometry([new THREE.Vector2(2.4,0),new THREE.Vector2(2.4,4),new THREE.Vector2(1.7,5),new THREE.Vector2(1.7,19+n*4),new THREE.Vector2(2.1,20+n*4)],mobile?10:14);
      remap(tower,1,mapKey==='mirage'?0x99bcb5:0xa6947e);tower.applyMatrix4(transform(-22-n*8,0,90-n*6,1,1,1));district.push(tower);
    }
  }
  if(mapKey==='inferno'){
    // 西側原料→輸送→既有CC0廠房；全部x<0，保留原競技外框及服務道路。
    // 以三個相接棚跨與料倉建立產業尺度，替换孤立管材展示台／短矮牆。
    for(let bay=0;bay<3;bay++){
      const z=15+bay*12;
      box(district,2,0xa5a28c,-26,.3,z,20,.6,11.7);
      for(const x of [-35,-17])box(district,1,0xa9966f,x,4.2,z-5.5,.45,8.4,.45);
      box(district,1,0x8e9e95,-26,8.2,z-5.5,18.6,.45,.4);
      const roof=new THREE.Shape();roof.moveTo(-10,0);roof.lineTo(0,2.4);roof.lineTo(10,0);roof.lineTo(10,.18);roof.lineTo(0,2.65);roof.lineTo(-10,.18);roof.closePath();
      extrusion(district,roof,11.9,1,0x7e9592,-26,8.5,z-6);
      // 低料斗外壁与斜面原料堆，不以封閉新房子填滿場外。
      for(const x of [-34.5,-18])box(district,2,0x989780,x,1.55,z,.4,2.5,9.2);
      box(district,2,0x989780,-26.25,1.55,z-4.6,16.9,2.5,.4);
      const pile=new THREE.ConeGeometry(1,1,mobile?4:6,1);pile.scale(6.4,3.8,4);pile.rotateY(bay*.55);
      remap(pile,0,bay===1?0x69716b:0x8e8872);pile.applyMatrix4(transform(-26,2.45,z,1,1,1));district.push(pile);
    }
    for(const x of [-35,-17])box(district,1,0xa9966f,x,4.2,44.5,.45,8.4,.45);
    const conveyor=(x,z,run,rise,startHeight)=>{
      const length=Math.hypot(run,rise),angle=-Math.atan2(rise,run);
      for(const side of [-1,0,1]){
        const g=new THREE.BoxGeometry(side? .22:2.6,side?.8:.22,length);g.rotateX(angle);
        remap(g,1,side?0x82958c:0x465b55);g.applyMatrix4(transform(x+side*1.35,startHeight+rise/2,z+run/2,1,1,1));district.push(g);
      }
      for(const f of [.15,.8])for(const side of [-1,1])box(district,1,0xaaa07e,x+side*1.3,(startHeight+rise*f)/2,z+run*f,.25,startHeight+rise*f,.25);
    };
    conveyor(-24,43,18,3.2,3.4);
    // 南側服務翼把兩個既有儲氣槽接到同一管匯與檢修棚；z>=103，不侵入戰場。
    for(const x of [12,28,44,60,76,88]){
      for(const z of [129,139])box(district,1,0xa69d7e,x,2.8,z,.35,5.6,.35);
      box(district,1,0x899c92,x,5.6,134,.35,.3,10.5);
    }
    const serviceRoof=new THREE.Shape();serviceRoof.moveTo(-39,0);serviceRoof.lineTo(39,0);serviceRoof.lineTo(39,.24);serviceRoof.lineTo(-39,.24);serviceRoof.closePath();
    extrusion(district,serviceRoof,11,1,0x7c9690,50,5.9,128.5);
    box(district,2,0xaaa78d,82,1.9,134,10,3.8,8);
    box(districtPanels,1,0x557a7b,82,2.45,129.98,7.4,1.25,.035);
    const servicePipe=(a,b,r)=>{
      const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av),g=new THREE.CylinderGeometry(r,r,delta.length(),mobile?6:8);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
      const p=av.add(bv).multiplyScalar(.5);remap(g,1,0x819d92);g.applyMatrix4(transform(p.x,p.y,p.z,1,1,1));district.push(g);
    };
    servicePipe([23,3.8,127],[85,3.8,127],.38);
    for(const [x,z,r] of [[34,116,5.5],[72,118,7]]){
      servicePipe([x,3.8,z+r-.25],[x,3.8,127],.32);
      box(district,2,0x9b9e85,x,1.7,126,.4,3.4,.4);
    }
  }
  flush(district,groundMat,'Non-playable_district_architecture',true);
  const districtGlass=material(0xffffff,{vertexColors:true,roughness:.48,metalness:.1});flush(districtPanels,districtGlass,'Non-playable_district_window-bands');

  // 無貼圖、無環境反射 pass 的漸層天空；近鏡頭不再露出純黑空白。
  const skyGeo=new THREE.SphereGeometry(350,mobile?12:20,10),skyColors=[];
  const skyPosition=skyGeo.attributes.position,skyTop=new THREE.Color(mapKey==='inferno'?0x657f91:0x507b9c),skyHorizon=new THREE.Color(mapKey==='inferno'?0xdac6a7:0xb9d1d3),skyColor=new THREE.Color();
  for(let i=0;i<skyPosition.count;i++){const t=Math.min(1,Math.max(0,skyPosition.getY(i)/240));skyColor.copy(skyHorizon).lerp(skyTop,t);skyColors.push(skyColor.r,skyColor.g,skyColor.b);}
  skyGeo.setAttribute('color',new THREE.Float32BufferAttribute(skyColors,3));ownedGeometries.add(skyGeo);
  const skyMat=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide,depthWrite:false,fog:false,toneMapped:false});ownedMaterials.add(skyMat);
  const sky=new THREE.Mesh(skyGeo,skyMat);sky.name='Atmosphere_gradient-sky';sky.renderOrder=-1000;sky.frustumCulled=false;environment.add(sky);

  // 海岸水面／鑄造廠石脊只位於不可行走範圍；陸地三側、東側水道。
  const backdropGeo = new THREE.PlaneGeometry(560, 560); ownedGeometries.add(backdropGeo);
  const backdropMat = material(mapKey==="inferno"?0x625b54:0x547c86,{roughness:mapKey==="inferno"?.95:.28,metalness:mapKey==='inferno'?0:.12});
  if(mapKey!=='inferno'){
    // 靜態海面色階／細波紋：無反射 render pass、無粒子、無逐幀 uniform。
    backdropMat.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 coastWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\n coastWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
      shader.fragmentShader='varying vec3 coastWorld;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float coastDistance=max(abs(coastWorld.x),abs(coastWorld.z));
        float coastWave=.5+.5*sin(coastWorld.x*.3+coastWorld.z*.66+sin(coastWorld.x*.17)*1.6);
        diffuseColor.rgb*=mix(vec3(1.13,1.2,1.13),vec3(.54,.74,.86),smoothstep(54.0,210.0,coastDistance))*(.985+coastWave*.03);`);
    };
    backdropMat.customProgramCacheKey=()=> 'esmo-static-coast-v1';
  }
  const backdrop = new THREE.Mesh(backdropGeo,backdropMat); backdrop.rotation.x=-Math.PI/2;backdrop.position.y=-.18;
  backdrop.name="Non-playable_backdrop"; environment.add(backdrop);
  // 延伸三側地表到視野外，保持同樣頂點數，不以矩形島嶼邊緣包住競技場。
  const bank = new THREE.PlaneGeometry(180, 180, terrain?2:mobile?16:32, terrain?2:mobile?16:32);
  const vertices=bank.attributes.position;
  for(let i=0;i<vertices.count;i++){
    const extend=value=>Math.abs(value)<=60?value:Math.sign(value)*(60+(Math.abs(value)-60)*200/30);
    const x=extend(vertices.getX(i)),z=extend(-vertices.getY(i)),outside=Math.max(Math.abs(x),Math.abs(z));
    vertices.setX(i,x);vertices.setY(i,-z);
    // 中央永遠低於可行走平面，避免假高低差／玩家穿入坡岸。
    const elevation=outside<58?-.1:mapKey==='inferno'?Math.max(0,(outside-60)*.035)+Math.sin(x*.16)*Math.cos(z*.14)*.45:x>58?-.35-(x-58)*.12:.04+Math.sin(x*.12)*Math.cos(z*.15)*.12;
    vertices.setZ(i,elevation);
  }
  bank.computeVertexNormals();ownedGeometries.add(bank);
  remap(bank,2,mapKey==="inferno"?0x9b9f98:0xa6aca2);
  const bankMesh=new THREE.Mesh(bank,groundMat);
  bankMesh.rotation.x=-Math.PI/2;bankMesh.name="Outer-bank_not-walkable";bankMesh.receiveShadow=true;
  if(!terrain)environment.add(bankMesh);
  else{
    // 競技地形保持原40/24格與同源高度；相連場外地坪只需少量遠景面。
    // 兩者共用 atlas／material，不再有白色棋盤與褐色外圍的矩形斷層。
    const land=[],floor=new THREE.PlaneGeometry(100,100,mobile?24:40,mobile?24:40);floor.rotateX(-Math.PI/2);
    const p=floor.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,elevation(p.getX(i)+50,p.getZ(i)+50));floor.computeVertexNormals();
    const landColor=mapKey==='mirage'?0xb2b7a7:mapKey==='dust2'?0x9daeb0:0x949f9e;
    remap(floor,2,landColor);flush([floor],groundMat,'Continuous_ground_authoritative-elevation');
    const edges=[[-105,50,210,520],[50,-105,100,210],[50,205,100,210]];
    if(mapKey==='inferno')edges.push([205,50,210,520]);
    for(const [x,z,w,d] of edges){
      const edge=new THREE.PlaneGeometry(w,d,8,8);edge.rotateX(-Math.PI/2);edge.translate(W.vx(x),-.01,W.vz(z));
      // 將有限格點集中於可見街區周圍；舊均分520m造成近景一整片平地。
      const nearToFar=[50,58,68,80,100,135,175,220,260],across=[-260,-180,-120,-80,0,80,120,180,260];
      const xs=x<0?nearToFar.map(v=>-v).reverse():x>100?nearToFar:Array.from({length:9},(_,i)=>-50+i*12.5);
      const zs=z<0?nearToFar.map(v=>-v).reverse():z>100?nearToFar:across;
      const p=edge.attributes.position;
      for(let i=0;i<p.count;i++){
        const xx=xs[i%9],zz=zs[Math.floor(i/9)];p.setXYZ(i,xx,-.01+districtHeight(xx+50,zz+50),zz);
      }
      edge.computeVertexNormals();
      remap(edge,mapKey==='inferno'?0:2,0xffffff);
      const colors=edge.attributes.color,low=new THREE.Color(mapKey==='inferno'?0xb9b7a5:0xd5dec2),rock=new THREE.Color(0xd9d8c7),tint=new THREE.Color();
      for(let i=0;i<p.count;i++){tint.copy(low).lerp(rock,THREE.MathUtils.smoothstep(p.getY(i),3,22));colors.setXYZ(i,tint.r,tint.g,tint.b);}
      land.push(edge);
    }
    flush(land,terrainMat,'Outer_terrain_authored-albedo');
  }

  const treeParts=[];
  for(let n=0;n<4;n++){
    const leaf=new THREE.IcosahedronGeometry(1,0);remap(leaf,0,n%2?0x688373:0x496958);leaf.scale(n===0?1.5:1.1,n===0?1.55:.95,1.25);leaf.translate(n===0?0:Math.cos(n*2.1)*.85,3.7+n*.18,n===0?0:Math.sin(n*2.1)*.75);treeParts.push(leaf);
  }
  const trunkSource=new THREE.CylinderGeometry(.13,.27,3.4,6),trunk=trunkSource.toNonIndexed();trunkSource.dispose();remap(trunk,3,0x796452);trunk.translate(0,1.7,0);treeParts.push(trunk);
  const treeGeo=mergeGeometries(treeParts,false);treeParts.forEach(g=>g.dispose());ownedGeometries.add(treeGeo);
  const treeCount=mapKey==='mirage'?(mobile?10:18):mapKey==='dust2'?(mobile?6:10):(mobile?4:6),foliage=new THREE.InstancedMesh(treeGeo,groundMat,treeCount);
  foliage.name='Outer-bank_tree-pool_not-walkable';foliage.castShadow=!mobile;foliage.receiveShadow=true;
  for(let i=0;i<treeCount;i++){const edge=i%3,n=Math.floor(i/3),x=edge===0?-35-(i%2)*3:10+n*15+(i%2)*4,z=edge===0?13+n*19+(i%2)*4:edge===1?-30-(i%2)*4:140+(i%2)*3,s=.85+(i%3)*.14;foliage.setMatrixAt(i,transform(x,.03,z,s,s,s,i*.9));}
  foliage.computeBoundingSphere();environment.add(foliage);

  const summary = {
    enabled: true, version: "cs-major-scene.v1", mapKey, fullMap: true,
    mapIdentity: { id: mapKey, name: art.name, style: art.style },
    colliderSource: "c5a2SolidObstacles", collisionMutation: false,
    buildingCount: map.walls.length, coverBounds, roomFixtureBounds, landmark: art.landmark,
    authoredSources:[...authoredSources.values()],walkableAuthoredRooms:(map.rooms||[]).filter(r=>r.authored).map(r=>({id:r.id,label:r.label,doors:2,doorWidth:r.doorWidth,colliderSource:'majorRoomWalls'})),
    zones: zonePoints.map((p, i) => ({ id: ["a-site", "b-site", "mid", "t-spawn", "ct-spawn"][i], center: [p.x, p.y], label: art.zones[i] || (i === 3 ? "進攻集結場" : "防守勤務場") })),
    quality: mobile ? "mobile" : "desktop", dynamicEnvironmentLights: 0,
    get atlasLoaded() { return atlasLoaded&&terrainAtlasLoaded; },
    get decorationMeshes() { return environment.children.length; },
    get estimatedTriangles() { let n = 0; environment.traverse(o => { if (o.geometry) n += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); }); return n; },
  };
  return {
    group: environment, fadeWalls, fadeDetails, fadeRoofs, summary,
    dispose() {
      if (disposed) return; disposed = true;
      environment.parent?.remove(environment);
      ownedGeometries.forEach(g => g.dispose()); ownedMaterials.forEach(m => m.dispose());
      atlas.dispose();if(terrainAtlas!==atlas)terrainAtlas.dispose();environment.clear();
    },
  };
}
