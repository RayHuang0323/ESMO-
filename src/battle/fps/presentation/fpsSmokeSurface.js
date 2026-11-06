import * as THREE from 'three';

// 每個煙源只建立一次邊資料。每幀只更新半徑uniform與活躍三角形索引，
// 不重做可達搜尋、不配置新陣列；插值永遠留在同一個合法空氣四面體內。
export function createSmokeSurface(field,W,material){
 const positions=[],ends=[],distances=[],uv=[],colors=[],edges=new Map(),triangles=[],low=[],high=[],extra=[];
 const count=field.values.length,value=v=>v<count?field.values[v]:1e9,point=v=>v<count?field.vertices.subarray(v*3,v*3+3):extra[v-count];
 const edge=(a,b)=>{
  if(value(a)>value(b))[a,b]=[b,a];const key=a+':'+b;if(edges.has(key))return edges.get(key);
  const i=positions.length/3,A=point(a),B=point(b);
  positions.push(W.vx(A[0]),A[1],W.vz(A[2]));ends.push(W.vx(B[0]),B[1],W.vz(B[2]));distances.push(value(a),value(b));uv.push((A[0]-field.origin.x)/4,(A[1]-field.baseHeight)/3);
  const noise=.5+.5*Math.sin(A[0]*2+A[1]*3+A[2]*4)*Math.cos(A[0]*3-A[1]*4+A[2]*2),v=.62+.38*noise;colors.push(v,v,v);edges.set(key,i);return i;
 };
 const at=(e,r)=>{const a=distances[e*2],b=distances[e*2+1],t=Math.max(0,Math.min(1,(r-a)/Math.max(1e-9,b-a)));return[0,1,2].map(k=>positions[e*3+k]+(ends[e*3+k]-positions[e*3+k])*t);};
 const face=(a,b,c,min,max,inside)=>{
  if(min>=6.00001||max<=0||max-min<1e-8)return;const r=(Math.max(0,min)+Math.min(6.00001,max))/2,A=at(a,r),B=at(b,r),C=at(c,r),p=Array.isArray(inside)?inside:point(inside),P=[W.vx(p[0]),p[1],W.vz(p[2])],u=B.map((v,k)=>v-A[k]),v=C.map((v,k)=>v-A[k]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  if(normal.reduce((s,v,k)=>s+v*(A[k]-P[k]),0)<0)[b,c]=[c,b];triangles.push(a,b,c);low.push(min);high.push(max);
 };
 const emit=(vertices,inside=null)=>{
  const[a,b,c,d]=vertices.slice().sort((a,b)=>value(a)-value(b)),A=value(a),B=value(b),C=value(c),D=value(d);if(A>=6.00001||D<=0||D-A<1e-8)return;
  const ab=edge(a,b),ac=edge(a,c),ad=edge(a,d),bc=edge(b,c),bd=edge(b,d),cd=edge(c,d),p=inside||a;
  face(ab,ac,ad,A,B,p);face(ac,ad,bd,B,C,p);face(ac,bd,bc,B,C,p);face(ad,bd,cd,C,D,p);
 };
 const offsets=[[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]],tetra=[[0,1,3,7],[0,1,5,7],[0,2,3,7],[0,2,6,7],[0,4,5,7],[0,4,6,7]];
 for(let j=0;j<field.ny;j++)for(let k=0;k<field.nz;k++)for(let i=0;i<field.nx;i++){
  const cell=field.index(i,j,k);if(field.cells[cell]||field.distance[cell]>=1e4)continue;const vertices=offsets.map(([x,y,z])=>field.vertexIndex(i+x,j+y,k+z));
  for(const t of tetra)emit(t.map(v=>vertices[v]));
  // 實牆／地板／屋頂切面也封口；退化四面體把裁切留在原格的精確平面。
  const faces=[[-1,0,0,[0,2,6,4]],[1,0,0,[1,5,7,3]],[0,-1,0,[0,4,5,1]],[0,1,0,[2,3,7,6]],[0,0,-1,[0,1,3,2]],[0,0,1,[4,6,7,5]]];
  for(const[dx,dy,dz,ids]of faces){const a=i+dx,b=j+dy,c=k+dz,n=a<0||a>=field.nx||b<0||b>=field.ny||c<0||c>=field.nz?-1:field.index(a,b,c);if(n>=0&&!field.cells[n]&&field.distance[n]<1e4)continue;const v=ids.map(n=>vertices[n]),center=[0,1,2].map(q=>v.reduce((s,n)=>s+point(n)[q],0)/4),apex=count+extra.length;extra.push(center);const inside=[(field.x[i]+field.x[i+1])/2,(field.y[j]+field.y[j+1])/2,(field.z[k]+field.z[k+1])/2];emit([v[0],v[1],v[2],apex],inside);emit([v[0],v[2],v[3],apex],inside);}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('smokeEdgeEnd',new THREE.Float32BufferAttribute(ends,3));geometry.setAttribute('smokeEdgeDistance',new THREE.Float32BufferAttribute(distances,2));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 const indices=new Uint32Array(triangles.length);geometry.setIndex(new THREE.BufferAttribute(indices,1).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const radius={value:0};material.onBeforeCompile=shader=>{
  shader.uniforms.smokeDomainRadius=radius;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 smokeEdgeEnd;\nattribute vec2 smokeEdgeDistance;\nuniform float smokeDomainRadius;')
   .replace('#include <begin_vertex>','float smokeT=clamp((smokeDomainRadius-smokeEdgeDistance.x)/max(0.0000001,smokeEdgeDistance.y-smokeEdgeDistance.x),0.0,1.0);\nvec3 transformed=mix(position,smokeEdgeEnd,smokeT);\n#ifdef USE_MAP\nvMapUv=(mapTransform*vec3(transformed.x*.21+transformed.y*.18,transformed.z*.23+transformed.y*.12,1.0)).xy;\n#endif\n#ifdef USE_COLOR\nfloat smokeNoise=.5+.5*sin(transformed.x*.7+transformed.y*.6)*cos(transformed.z*.8-transformed.y*.5);\nvColor=vec3(.78+.22*smokeNoise);\n#endif');
 };
 material.customProgramCacheKey=()=> 'fps-smoke-domain-surface.v1';material.needsUpdate=true;
 let previous=-1;return{geometry,field,update(r){radius.value=r;if(r===previous)return geometry.drawRange.count/3;previous=r;let n=0;for(let i=0;i<low.length;i++)if(r>=low[i]&&r<high[i]){indices[n++]=triangles[i*3];indices[n++]=triangles[i*3+1];indices[n++]=triangles[i*3+2];}geometry.index.needsUpdate=true;geometry.setDrawRange(0,n);return n/3;},edgeCount:positions.length/3,candidateTriangles:low.length,dispose(){geometry.dispose();}};
}

export function createSmokeDepthMask(world,W){
 const geometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshBasicMaterial({colorWrite:false,depthTest:true,depthWrite:true}),mesh=new THREE.InstancedMesh(geometry,material,world.boxes.length),matrix=new THREE.Matrix4();
 world.boxes.forEach((b,i)=>{const min=b.min,max=b.max;matrix.makeScale(max[0]-min[0],max[1]-min[1],max[2]-min[2]);matrix.setPosition(W.vx((min[0]+max[0])/2),(min[1]+max[1])/2,W.vz((min[2]+max[2])/2));mesh.setMatrixAt(i,matrix);});
 mesh.name='fps-smoke-wall-depth-mask';mesh.renderOrder=11;mesh.frustumCulled=false;mesh.visible=false;mesh.instanceMatrix.needsUpdate=true;
 return{mesh,dispose(){mesh.parent?.remove(mesh);geometry.dispose();material.dispose();}};
}
