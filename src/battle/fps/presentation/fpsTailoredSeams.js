import * as THREE from "three";

// Cache-time garment seam subdivision only. Original vertices and weights stay
// in the prefix; new edge vertices interpolate UVs and normalized influences.
export function splitTailoredSeams(geometry, planes) {
  const attrs = geometry.attributes, positions = [], uvs = [], joints = [], weights = [];
  const components = ["getX", "getY", "getZ", "getW"];
  for (let i=0;i<attrs.position.count;i++) {
    positions.push(attrs.position.getX(i),attrs.position.getY(i),attrs.position.getZ(i));
    uvs.push(attrs.uv?.getX(i)||0,attrs.uv?.getY(i)||0);
    for(const fn of components){joints.push(attrs.skinIndex[fn](i));weights.push(attrs.skinWeight[fn](i));}
  }
  const originalVertices = positions.length/3, originalTriangles = geometry.index.count/3;
  const edgeCache = new Map(), result = [], coverage = [];
  const point = i => new THREE.Vector3(...positions.slice(i*3,i*3+3));
  const area = (a,b,c) => point(b).sub(point(a)).cross(point(c).sub(point(a))).length()*.5;
  const intersect = (a,b,y) => {
    if(Math.abs(positions[a*3+1]-y)<1e-7)return a;
    if(Math.abs(positions[b*3+1]-y)<1e-7)return b;
    const key = `${Math.min(a,b)}:${Math.max(a,b)}:${y}`;
    if(edgeCache.has(key))return edgeCache.get(key);
    const t=(y-positions[a*3+1])/(positions[b*3+1]-positions[a*3+1]),id=positions.length/3;
    const p=point(a).lerp(point(b),t);positions.push(p.x,y,p.z);
    for(let k=0;k<2;k++)uvs.push(uvs[a*2+k]*(1-t)+uvs[b*2+k]*t);
    const influence=new Map();
    for(const [v,mix] of [[a,1-t],[b,t]])for(let k=0;k<4;k++){
      const bone=joints[v*4+k],weight=weights[v*4+k]*mix;
      influence.set(bone,(influence.get(bone)||0)+weight);
    }
    const top=[...influence].filter(([,w])=>w>0).sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,4),sum=top.reduce((n,[,w])=>n+w,0);
    for(let k=0;k<4;k++){joints.push(top[k]?.[0]||0);weights.push((top[k]?.[1]||0)/sum);}
    edgeCache.set(key,id);return id;
  };
  const clip = (polygon,y,above) => {
    const out=[];
    for(let k=0;k<polygon.length;k++){
      const a=polygon[k],b=polygon[(k+1)%polygon.length],ay=positions[a*3+1]-y,by=positions[b*3+1]-y;
      const inside=above?ay>=0:ay<=0,next=above?by>=0:by<=0;
      if(inside)out.push(a);if(inside!==next)out.push(intersect(a,b,y));
    }
    return out.filter((v,i)=>v!==out[(i+out.length-1)%out.length]);
  };
  for(let i=0;i<geometry.index.count;i+=3){
    const original=[geometry.index.getX(i),geometry.index.getX(i+1),geometry.index.getX(i+2)];let polygons=[original];
    for(const y of planes)polygons=polygons.flatMap(p=>{
      const ys=p.map(v=>positions[v*3+1]);
      return Math.min(...ys)<y-1e-7&&Math.max(...ys)>y+1e-7?[clip(p,y,true),clip(p,y,false)]:[p];
    });
    let total=0;
    for(const p of polygons)for(let k=1;k<p.length-1;k++){
      const a=area(p[0],p[k],p[k+1]);if(a<1e-12)continue;
      result.push(p[0],p[k],p[k+1]);total+=a;
    }
    coverage.push(Math.abs(total-area(...original)));
  }
  for(const key of Object.keys(geometry.attributes))geometry.deleteAttribute(key);
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  geometry.setAttribute("skinIndex",new THREE.Uint16BufferAttribute(joints,4));
  geometry.setAttribute("skinWeight",new THREE.Float32BufferAttribute(weights,4));
  geometry.setIndex(result);
  let crossingTriangles=0;
  for(let i=0;i<result.length;i+=3)for(const y of planes){const ys=[result[i],result[i+1],result[i+2]].map(v=>positions[v*3+1]);if(Math.min(...ys)<y-1e-7&&Math.max(...ys)>y+1e-7)crossingTriangles++;}
  geometry.userData.esmoSeams={originalVertices,originalTriangles,addedVertices:positions.length/3-originalVertices,addedTriangles:result.length/3-originalTriangles,maxCoverageError:Math.max(...coverage),crossingTriangles,planes:[...planes]};
  return geometry.userData.esmoSeams;
}
