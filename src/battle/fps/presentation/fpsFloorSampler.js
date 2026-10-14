import * as THREE from 'three';

// Read the same rendered walkable triangles, including ramp tessellation and
// paving lifts. This is presentation contact only, never a navigation collider.
export function createFpsFloorSampler(root, fallback) {
  const cells=new Map(),v=new THREE.Vector3(),size=2;
  root.updateWorldMatrix(true,true);
  root.traverse(mesh=>{
    if(!mesh.isMesh||!/^(Continuous_ground_|Service-streets_|Courtyards_|Authored-rooms_continuous-floor|Site_safety-lines)/.test(mesh.name))return;
    const p=mesh.geometry.attributes.position,ix=mesh.geometry.index;
    for(let n=0;n<(ix?.count||p.count);n+=3){
      const t=[0,1,2].map(i=>v.fromBufferAttribute(p,ix?ix.getX(n+i):n+i).applyMatrix4(mesh.matrixWorld).toArray());
      const [[ax,ay,az],[bx,by,bz],[cx,cy,cz]]=t,d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
      if(Math.abs(d)<1e-9)continue;
      const row={ax,ay,az,bx,by,bz,cx,cy,cz,d};
      for(let x=Math.floor(Math.min(ax,bx,cx)/size);x<=Math.floor(Math.max(ax,bx,cx)/size);x++)
        for(let z=Math.floor(Math.min(az,bz,cz)/size);z<=Math.floor(Math.max(az,bz,cz)/size);z++){
          const k=x+','+z,list=cells.get(k)||[];list.push(row);cells.set(k,list);
        }
    }
  });
  return (x,z)=>{
    let height=-Infinity;
    for(const t of cells.get(Math.floor(x/size)+','+Math.floor(z/size))||[]){
      const a=((t.bz-t.cz)*(x-t.cx)+(t.cx-t.bx)*(z-t.cz))/t.d;
      const b=((t.cz-t.az)*(x-t.cx)+(t.ax-t.cx)*(z-t.cz))/t.d,c=1-a-b;
      if(a>=-1e-6&&b>=-1e-6&&c>=-1e-6)height=Math.max(height,a*t.ay+b*t.by+c*t.cy);
    }
    return Number.isFinite(height)?height:fallback(x,z);
  };
}
