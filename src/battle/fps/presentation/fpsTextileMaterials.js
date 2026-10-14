import * as THREE from 'three';

// Original CC0 JPEG linear RGB mean compensation; leaves actor uniform colours
// and borrowed texture transforms unchanged (also used by the POV sleeves).
export const FPS_TEXTILE_COLOUR_GAIN=Object.freeze({
  fabric:Object.freeze([1.7857399024,2.3367278146,3.1404382655]),
  leather:Object.freeze([3.2890707523,3.4416660147,4.6354336065]),
});

export function applyMajorWovenTextiles(material,{colour,normal}={}) {
  if(!colour||!normal)return false;
  material.map=colour;material.normalMap=normal;material.normalScale.set(.38,.38);
  applyMajorClothSurfaceDetail(material);
  return true;
}

// Bind-space folds stay sewn to the authored surface during skinning. The
// original colour/normal JPEG supplies the weave; this adds millimetre-scale
// garment folds and stitching without another texture, mesh or light.
export function applyMajorClothSurfaceDetail(material,{compensateColour=true,detailStrength=.0016,toneStrength=.04,sleevePattern=false,glovePattern=false}={}) {
  if(glovePattern&&!sleevePattern)throw new Error('手皮材質只供連續第三人稱服裝');
  material.onBeforeCompile=shader=>{
    shader.uniforms.esmoClothColourGain={value:new THREE.Vector3(...FPS_TEXTILE_COLOUR_GAIN.fabric)};
    shader.uniforms.esmoClothDetailStrength={value:detailStrength};
    shader.uniforms.esmoClothToneStrength={value:toneStrength};
    shader.vertexShader='varying vec3 vEsmoClothPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvEsmoClothPoint=position;');
    if(sleevePattern)shader.vertexShader='attribute vec4 esmoSleeveCoord;\nattribute float esmoCuffFace;\nattribute float esmoCuffReverse;\nvarying vec4 vEsmoSleeve;\nvarying float vEsmoCuffFace;\nvarying float vEsmoCuffReverse;\n'+shader.vertexShader.replace('vEsmoClothPoint=position;','vEsmoClothPoint=position;\nvEsmoSleeve=esmoSleeveCoord;\nvEsmoCuffFace=esmoCuffFace;\nvEsmoCuffReverse=esmoCuffReverse;');
    if(glovePattern)shader.vertexShader='attribute vec4 esmoGloveJoint;\nattribute float esmoGloveMask;\nvarying vec4 vEsmoGloveJoint;\nvarying float vEsmoGloveMask;\n'+shader.vertexShader.replace('vEsmoClothPoint=position;','vEsmoClothPoint=position;\nvEsmoGloveJoint=esmoGloveJoint;\nvEsmoGloveMask=esmoGloveMask;');
    if(sleevePattern){
      shader.vertexShader='attribute vec2 esmoCuffStitchPath;\nvarying vec2 vEsmoCuffStitchPath;\n'+shader.vertexShader.replace('vEsmoCuffReverse=esmoCuffReverse;','vEsmoCuffReverse=esmoCuffReverse;\nvEsmoCuffStitchPath=esmoCuffStitchPath;');
      shader.vertexShader='attribute float esmoClothVisibility;\nvarying float vEsmoClothVisibility;\n'+shader.vertexShader.replace('vEsmoCuffFace=esmoCuffFace;','vEsmoCuffFace=esmoCuffFace;\nvEsmoClothVisibility=esmoClothVisibility;');
      // Offline true-surface hemisphere visibility affects indirect light,
      // like r160's AO chunk. Direct/key lighting and garment colour remain.
      shader.fragmentShader='varying float vEsmoClothVisibility;\n'+shader.fragmentShader.replace('#include <aomap_fragment>',`#include <aomap_fragment>
float esmoClothAmbient=1.0-.75*(1.0-clamp(vEsmoClothVisibility,0.0,1.0));
reflectedLight.indirectDiffuse*=esmoClothAmbient;
#ifdef USE_SHEEN
sheenSpecularIndirect*=esmoClothAmbient;
#endif
#ifdef USE_CLEARCOAT
clearcoatSpecularIndirect*=esmoClothAmbient;
#endif
#if defined(USE_ENVMAP) && defined(STANDARD)
reflectedLight.indirectSpecular*=computeSpecularOcclusion(saturate(dot(geometryNormal,geometryViewDir)),esmoClothAmbient,material.roughness);
#endif`);
    }
    // Keep the original shared JPEGs unchanged; a private garment sampling
    // scale avoids reducing their weave to subpixel noise in the near view.
    if(sleevePattern)shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
#ifdef USE_MAP
vMapUv*=0.45;
#endif
#ifdef USE_NORMALMAP
vNormalMapUv*=0.45;
#endif`);
    const header=`uniform vec3 esmoClothColourGain;
uniform float esmoClothDetailStrength;
uniform float esmoClothToneStrength;
varying vec3 vEsmoClothPoint;
float esmoClothHeight(vec3 p){
  float fold=p.y+.017*sin(p.x*24.0+p.z*13.0);
  float broad=sin(fold*92.0+.4*sin(p.z*19.0));
  float fine=sin(fold*161.0+p.x*9.0)*.22;
  float seam=exp(-abs(p.x)/.0025)*.36;
  return esmoClothDetailStrength*(broad+fine+seam);
}
float esmoClothStitch(vec3 p){
  float distance=min(abs(p.x-.0035),abs(p.x+.0035));
  float thread=1.0-smoothstep(.0006,.0018,distance);
  return thread*(1.0-smoothstep(.40,.55,fract((p.y+.01)*160.0)));
}
`;
    // Centres are metres from the licensed rig's elbow, not generic skeleton
    // proportions. Mask zero keeps the original body/rigid/POV surface.
    const sleeveHeader=sleevePattern?`varying vec4 vEsmoSleeve;
varying float vEsmoCuffFace;
varying float vEsmoCuffReverse;
varying vec2 vEsmoCuffStitchPath;
float esmoSleeveShoulder(vec4 q){
  float join=q.x+.145+.18*abs(q.z);
  return (1.0-smoothstep(.002,.010,abs(join)))*smoothstep(-.065,-.020,q.y)*q.w;
}
float esmoSleeveHem(vec4 q){
  return (1.0-smoothstep(.003,.011,abs(q.x-.228+.20*q.y)))*q.w;
}
float esmoSleeveHeight(vec4 q){
  float inside=smoothstep(.05,.65,q.z/max(.025,length(q.yz)));
  float creaseA=1.0-smoothstep(.004,.028,abs(q.x+.046+.28*q.y));
  float creaseB=1.0-smoothstep(.004,.026,abs(q.x-.014-.20*q.y));
  float creaseC=1.0-smoothstep(.003,.013,abs(q.x+.015+.04*q.y));
  float valley=1.0-smoothstep(.006,.022,abs(q.x-.045-.20*q.y));
  float wedgeA=1.0-smoothstep(.030,.115,abs(q.y+.012));
  float wedgeB=1.0-smoothstep(.018,.100,abs(q.y-.008));
  return clamp(.0055*inside*(creaseA*wedgeA+creaseB*wedgeB+.55*creaseC*wedgeA-.65*valley*wedgeB)+.0025*esmoSleeveShoulder(q)+.004*esmoSleeveHem(q),-.006,.012);
}
float esmoSleeveSeam(vec4 q){
  float edge=abs(q.y-(.020+.008*sin(q.x*9.0)));
  return (1.0-smoothstep(.001,.004,edge))*q.w;
}
`:'';
    const clothHeight=sleevePattern?'mix(mix(esmoClothHeight(vEsmoClothPoint),esmoSleeveHeight(vEsmoSleeve),vEsmoSleeve.w),0.0,vEsmoCuffFace)':'esmoClothHeight(vEsmoClothPoint)';
    const surfaceHeight=glovePattern?`mix(${clothHeight},esmoGloveHeight(vEsmoClothPoint,vEsmoGloveJoint),esmoGloveAmount)`:clothHeight;
    const gloveHeader=glovePattern?`varying vec4 vEsmoGloveJoint;
varying float vEsmoGloveMask;
float esmoGloveCrease(vec4 q){
  float distance=min(abs(q.x-q.y),abs(q.x-q.z));
  return (1.0-smoothstep(.0012,.0035,distance))*q.w;
}
float esmoGloveHeight(vec3 p,vec4 q){
  return .00010*sin(p.x*700.0)*sin(p.y*900.0)-.0006*esmoGloveCrease(q);
}
`:'';
    shader.fragmentShader=gloveHeader+sleeveHeader+header+shader.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\n'+(compensateColour?'#ifdef USE_MAP\ndiffuseColor.rgb*=esmoClothColourGain;\n#endif\n':'')+
      'float esmoFoldTone='+clothHeight+'/esmoClothDetailStrength;\ndiffuseColor.rgb*='+(sleevePattern?'clamp(1.0-esmoClothToneStrength+esmoClothToneStrength*esmoFoldTone,.82,1.18)':'1.0-esmoClothToneStrength+esmoClothToneStrength*esmoFoldTone')+';\ndiffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.6+vec3(.04,.04,.025),esmoClothStitch(vEsmoClothPoint)*.45);'+(sleevePattern?`
float esmoPanel=smoothstep(.011,.019,vEsmoSleeve.y)*vEsmoSleeve.w;
// Only the folded fabric exposes its paler reverse dye. Reflectance stays
// bounded; this is an albedo role, not emissive light or an equipment edge.
diffuseColor.rgb=mix(diffuseColor.rgb,clamp(diffuseColor.rgb*1.08+vec3(.006),0.0,1.0),vEsmoCuffFace);
// The inside of the same woven textile is less saturated and more exposed
// than its dyed outer sleeve. A dedicated actual-face mask separates it from
// the roll and glove; bounded albedo still receives all scene lighting.
diffuseColor.rgb=mix(diffuseColor.rgb,clamp(diffuseColor.rgb*1.48+vec3(.030),0.0,1.0),vEsmoCuffReverse);
float esmoSeam=esmoSleeveSeam(vEsmoSleeve)*(1.0-vEsmoCuffFace);
float esmoThread=1.0-smoothstep(.45,.65,fract((vEsmoSleeve.x+.5)*135.0));
diffuseColor.rgb*=1.0-.16*esmoPanel-.28*esmoSeam;
diffuseColor.rgb+=vec3(.065,.066,.055)*esmoSeam*esmoThread;
float esmoShoulder=esmoSleeveShoulder(vEsmoSleeve),esmoHem=esmoSleeveHem(vEsmoSleeve)*(1.0-vEsmoCuffFace);
diffuseColor.rgb*=1.0-.30*esmoShoulder-.24*esmoHem;
diffuseColor.rgb+=vec3(.075,.080,.065)*(esmoShoulder+esmoHem)*esmoThread;
// A returned sleeve keeps its visible sewing finish. Follow the actual
// uneven lip in bind coordinates; do not borrow the glove or screen edge.
float esmoCuffAngle=atan(vEsmoSleeve.z,vEsmoSleeve.y);
float esmoCuffDistance=min(abs(vEsmoCuffStitchPath.x),abs(vEsmoCuffStitchPath.x-vEsmoCuffStitchPath.y));
float esmoCuffStitch=(1.0-smoothstep(.0015,.0035,esmoCuffDistance))*vEsmoCuffFace;
float esmoCuffThread=1.0-smoothstep(.40,.60,fract((esmoCuffAngle+3.141593)*42.0));
diffuseColor.rgb*=1.0-.22*esmoCuffStitch;
diffuseColor.rgb+=vec3(.065,.066,.055)*esmoCuffStitch*esmoCuffThread;
`:'' )+(glovePattern?`
// Shared draw, distinct leather role. Vertex colour still supplies the
// authored palm/finger tone in the subsequent Three colour chunk.
float esmoGloveAmount=clamp(vEsmoGloveMask,0.0,1.0);
float esmoGloveFold=esmoGloveCrease(vEsmoGloveJoint);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.18,.174,.165)*(1.0-.32*esmoGloveFold),esmoGloveAmount);
`:''));
    if(glovePattern)shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
roughnessFactor=mix(roughnessFactor,.68+.10*esmoGloveFold,esmoGloveAmount);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
${glovePattern?'normal=normalize(mix(normal,nonPerturbedNormal,esmoGloveAmount));':''}
float esmoHeight=${surfaceHeight}${sleevePattern?'+.0015*esmoCuffStitch*esmoCuffThread':''};
vec3 esmoSigmaX=dFdx(-vViewPosition),esmoSigmaY=dFdy(-vViewPosition);
vec3 esmoR1=cross(esmoSigmaY,normal),esmoR2=cross(normal,esmoSigmaX);
float esmoDet=dot(esmoSigmaX,esmoR1)*faceDirection;
if(abs(esmoDet)>1e-10)normal=normalize(abs(esmoDet)*normal-sign(esmoDet)*(dFdx(esmoHeight)*esmoR1+dFdy(esmoHeight)*esmoR2));`);
  };
  material.customProgramCacheKey=()=> 'esmo-major-sewn-cloth-v3-'+Number(compensateColour)+(sleevePattern?'-arm-cut-v19':'')+(glovePattern?'-glove-joints-v1':'');
  material.needsUpdate=true;
}
