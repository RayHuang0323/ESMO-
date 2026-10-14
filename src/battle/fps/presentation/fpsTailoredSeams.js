import * as THREE from "three";

// Cache-time garment seam subdivision only. Original vertices and weights stay
// in the prefix; new edge vertices interpolate UVs and normalized influences.
export function splitTailoredSeams(geometry, planes, {metadataKey='esmoSeams',minFrontZ=null}={}) {
  if(minFrontZ!==null&&!Number.isFinite(minFrontZ))throw new Error('局部衣料切面範圍必須有限');
  const cuts=planes.map((plane,id)=>typeof plane==='number'?
    {normal:new THREE.Vector3(0,1,0),constant:plane,id,y:plane}:
    {normal:new THREE.Vector3(...plane.normal),constant:plane.constant,id});
  if(cuts.some(p=>!Number.isFinite(p.constant)||!p.normal.toArray().every(Number.isFinite)||Math.abs(p.normal.length()-1)>1e-6))throw new Error('服裝切面必須有限且正規化');
  const attrs = geometry.attributes, positions = [], uvs = [], joints = [], weights = [];
  const components = ["getX", "getY", "getZ", "getW"];
  for (let i=0;i<attrs.position.count;i++) {
    positions.push(attrs.position.getX(i),attrs.position.getY(i),attrs.position.getZ(i));
    uvs.push(attrs.uv?.getX(i)||0,attrs.uv?.getY(i)||0);
    for(const fn of components){joints.push(attrs.skinIndex[fn](i));weights.push(attrs.skinWeight[fn](i));}
  }
  const originalVertices = positions.length/3, originalTriangles = geometry.index.count/3;
  const edgeCache = new Map(), result = [], coverage = [],polygonsByFace=[],edgePoints=new Map();
  const roots=Array.from({length:originalVertices},(_,i)=>[i]);
  const point = i => new THREE.Vector3(...positions.slice(i*3,i*3+3));
  const area = (a,b,c) => point(b).sub(point(a)).cross(point(c).sub(point(a))).length()*.5;
  const distance=(i,plane)=>plane.normal.dot(point(i))-plane.constant;
  let maxDroppedWeight=0,discardedDegenerateTriangles=0;
  const intersect = (a,b,plane) => {
    const da=distance(a,plane),db=distance(b,plane);
    if(Math.abs(da)<1e-7)return a;
    if(Math.abs(db)<1e-7)return b;
    const key = `${Math.min(a,b)}:${Math.max(a,b)}:${plane.id}`;
    if(edgeCache.has(key))return edgeCache.get(key);
    const t=plane.y!==undefined?(plane.y-positions[a*3+1])/(positions[b*3+1]-positions[a*3+1]):da/(da-db),id=positions.length/3;
    const p=point(a).lerp(point(b),t);if(plane.y!==undefined)p.y=plane.y;positions.push(p.x,p.y,p.z);
    const parents=[...new Set([...roots[a],...roots[b]])];roots.push(parents);
    if(parents.length===2){const edge=parents.sort((a,b)=>a-b).join(':');if(!edgePoints.has(edge))edgePoints.set(edge,[]);edgePoints.get(edge).push(id);}
    for(let k=0;k<2;k++)uvs.push(uvs[a*2+k]*(1-t)+uvs[b*2+k]*t);
    const influence=new Map();
    for(const [v,mix] of [[a,1-t],[b,t]])for(let k=0;k<4;k++){
      const bone=joints[v*4+k],weight=weights[v*4+k]*mix;
      influence.set(bone,(influence.get(bone)||0)+weight);
    }
    const top=[...influence].filter(([,w])=>w>0).sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,4),sum=top.reduce((n,[,w])=>n+w,0);
    if(!Number.isFinite(sum)||sum<=1e-12)throw new Error('服裝交點缺少有效骨權重');
    maxDroppedWeight=Math.max(maxDroppedWeight,[...influence.values()].reduce((n,w)=>n+w,0)-sum);
    for(let k=0;k<4;k++){joints.push(top[k]?.[0]||0);weights.push((top[k]?.[1]||0)/sum);}
    edgeCache.set(key,id);return id;
  };
  const clip = (polygon,plane,above) => {
    const out=[];
    for(let k=0;k<polygon.length;k++){
      const a=polygon[k],b=polygon[(k+1)%polygon.length],ay=distance(a,plane),by=distance(b,plane);
      const inside=above?ay>=0:ay<=0,next=above?by>=0:by<=0;
      if(inside)out.push(a);if(inside!==next)out.push(intersect(a,b,plane));
    }
    return out.filter((v,i)=>v!==out[(i+out.length-1)%out.length]);
  };
  for(let i=0;i<geometry.index.count;i+=3){
    const original=[geometry.index.getX(i),geometry.index.getX(i+1),geometry.index.getX(i+2)];let polygons=[original];
    for(const plane of cuts)polygons=polygons.flatMap(p=>{
      if(minFrontZ!==null&&Math.max(...p.map(v=>positions[v*3+2]))<=minFrontZ)return[p];
      const ds=p.map(v=>distance(v,plane));
      return Math.min(...ds)<-1e-7&&Math.max(...ds)>1e-7?[clip(p,plane,true),clip(p,plane,false)]:[p];
    });
    polygonsByFace.push({original,polygons});
  }
  // Conform neighbouring faces to each inserted original-edge vertex. Partial
  // sleeve cuts must not leave T junctions that crack when the cloth deforms.
  for(const {original,polygons} of polygonsByFace){
    let total=0;
    if(minFrontZ===null){
      for(const p of polygons)for(let k=1;k<p.length-1;k++){const a=area(p[0],p[k],p[k+1]);if(a<1e-12){discardedDegenerateTriangles++;continue;}result.push(p[0],p[k],p[k+1]);total+=a;}
      coverage.push(Math.abs(total-area(...original)));continue;
    }
    for(const polygon of polygons){
      const expanded=[];
      for(let j=0;j<polygon.length;j++){
        const a=polygon[j],b=polygon[(j+1)%polygon.length],parents=[...new Set([...roots[a],...roots[b]])];expanded.push(a);
        if(parents.length!==2)continue;
        const candidates=edgePoints.get(parents.sort((a,b)=>a-b).join(':'))||[],start=point(a),direction=point(b).sub(start),length=direction.lengthSq();
        if(length<1e-16)continue;
        const between=candidates.map(i=>({i,t:point(i).sub(start).dot(direction)/length})).filter(v=>v.i!==a&&v.i!==b&&v.t>1e-7&&v.t<1-1e-7).sort((a,b)=>a.t-b.t);
        for(const {i} of between)if(expanded[expanded.length-1]!==i)expanded.push(i);
      }
      // A fan may skip an inserted collinear edge point, recreating the very
      // T junction we must avoid. Clip only ears containing no other outline
      // point (including points on their boundary), retaining every seam edge.
      while(expanded.length>3){
        let found=false;
        for(let j=0;j<expanded.length;j++){
          const a=expanded[(j+expanded.length-1)%expanded.length],b=expanded[j],c=expanded[(j+1)%expanded.length],size=area(a,b,c);
          if(size<1e-12)continue;
          if(expanded.some(i=>i!==a&&i!==b&&i!==c&&Math.abs(area(a,b,i)+area(b,c,i)+area(c,a,i)-size)<=Math.max(1e-12,size*1e-7)))continue;
          result.push(a,b,c);total+=size;expanded.splice(j,1);found=true;break;
        }
        if(!found)throw new Error('局部裁片邊界無法無裂縫三角化');
      }
      if(expanded.length===3){const size=area(...expanded);if(size<1e-12)discardedDegenerateTriangles++;else{result.push(...expanded);total+=size;}}
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
  for(let i=0;i<result.length;i+=3)for(const plane of cuts){const ids=[result[i],result[i+1],result[i+2]];if(minFrontZ!==null&&Math.max(...ids.map(v=>positions[v*3+2]))<=minFrontZ)continue;const ds=ids.map(v=>distance(v,plane));if(Math.min(...ds)<-1e-7&&Math.max(...ds)>1e-7)crossingTriangles++;}
  let hangingEdges=0;
  if(minFrontZ!==null){
    const originalEdges=new Map(),newEdges=new Map(),add=(map,a,b)=>{const key=[a,b].sort((a,b)=>a-b).join(':');map.set(key,(map.get(key)||0)+1);};
    for(const {original} of polygonsByFace)for(let j=0;j<3;j++)add(originalEdges,original[j],original[(j+1)%3]);
    for(let at=0;at<result.length;at+=3)for(let j=0;j<3;j++)add(newEdges,result[at+j],result[at+(j+1)%3]);
    for(const [edge,ids] of edgePoints){
      const [a,b]=edge.split(':').map(Number),start=point(a),direction=point(b).sub(start),length=direction.lengthSq();
      const ordered=[a,...new Set(ids),b].sort((i,j)=>point(i).sub(start).dot(direction)/length-point(j).sub(start).dot(direction)/length);
      if(newEdges.has(edge))hangingEdges++;
      for(let j=1;j<ordered.length;j++)if(newEdges.get([ordered[j-1],ordered[j]].sort((a,b)=>a-b).join(':'))!==originalEdges.get(edge))hangingEdges++;
    }
    if(hangingEdges)throw new Error('局部裁片仍有未縫合邊界');
  }
  geometry.userData[metadataKey]={originalVertices,originalTriangles,addedVertices:positions.length/3-originalVertices,addedTriangles:result.length/3-originalTriangles,maxCoverageError:Math.max(...coverage),maxDroppedWeight,discardedDegenerateTriangles,crossingTriangles,minFrontZ,hangingEdges,conformingEdges:minFrontZ!==null?edgePoints.size:0,planes:planes.map(p=>typeof p==='number'?p:{normal:[...p.normal],constant:p.constant})};
  return geometry.userData[metadataKey];
}
