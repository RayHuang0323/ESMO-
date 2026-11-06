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
      const minX=Math.min(ax,bx,cx),maxX=Math.max(ax,bx,cx),minZ=Math.min(az,bz,cz),maxZ=Math.max(az,bz,cz),maxY=Math.max(ay,by,cy);
      // The barycentric tolerance permits a tiny extrapolation at an edge.
      // Bounds include it so the fast reject cannot change floor membership.
      const row={ax,ay,az,bx,by,bz,cx,cy,cz,d,
        minX:minX-2e-6*(maxX-minX),maxX:maxX+2e-6*(maxX-minX),
        minZ:minZ-2e-6*(maxZ-minZ),maxZ:maxZ+2e-6*(maxZ-minZ),
        flat:ay===by&&by===cy,upper:maxY+1e-6*(3*maxY-ay-by-cy)};
      for(let x=Math.floor(Math.min(ax,bx,cx)/size);x<=Math.floor(Math.max(ax,bx,cx)/size);x++)
        for(let z=Math.floor(Math.min(az,bz,cz)/size);z<=Math.floor(Math.max(az,bz,cz)/size);z++){
          let column=cells.get(x);if(!column){column=new Map();cells.set(x,column);}
          let list=column.get(z);if(!list){list=[];column.set(z,list);}list.push(row);
        }
    }
  });
  const classify=(triangles,x0,z0,width)=>{
    let height=null;
    // A containing triangle is convex. If its flat, highest surface covers
    // all four cell corners, it covers every query in the cell. This proves
    // a constant answer, rather than approximating contact with a heightmap.
    for(const t of triangles){
      if(!t.flat||t.ay<triangles[0].upper)continue;
      const contains=(px,pz)=>{const a=((t.bz-t.cz)*(px-t.cx)+(t.cx-t.bx)*(pz-t.cz))/t.d,b=((t.cz-t.az)*(px-t.cx)+(t.ax-t.cx)*(pz-t.cz))/t.d;return a>=-1e-6&&b>=-1e-6&&1-a-b>=-1e-6;};
      if(contains(x0,z0)&&contains(x0+width,z0)&&contains(x0,z0+width)&&contains(x0+width,z0+width)){height=t.ay;break;}
    }
    return{triangles,height};
  };
  for(const [x,column] of cells)for(const [z,triangles] of column){
    triangles.sort((a,b)=>b.upper-a.upper);const parent=classify(triangles,x*size,z*size,size);
    if(parent.height===null){
      // Refine within the original 2m bucket. Keeping its ownership preserves
      // the original edge/tolerance semantics while removing impossible tests.
      parent.subcells=[];
      for(let sz=0;sz<4;sz++)for(let sx=0;sx<4;sx++){
        const x0=x*size+sx*.5,z0=z*size+sz*.5;
        const candidates=triangles.filter(t=>t.maxX>=x0&&t.minX<=x0+.5&&t.maxZ>=z0&&t.minZ<=z0+.5);
        parent.subcells.push(classify(candidates,x0,z0,.5));
      }
    }
    column.set(z,parent);
  }
  const empty={triangles:[],height:null};let lastX=null,lastZ=null,lastCell=empty,parentX=null,parentZ=null,parentCell=empty;
  return (x,z)=>{
    const fineX=Math.floor(x*2),fineZ=Math.floor(z*2);
    if(fineX!==lastX||fineZ!==lastZ){
      lastX=fineX;lastZ=fineZ;const cellX=Math.floor(fineX/4),cellZ=Math.floor(fineZ/4);
      if(cellX!==parentX||cellZ!==parentZ){parentX=cellX;parentZ=cellZ;parentCell=cells.get(cellX)?.get(cellZ)||empty;}
      lastCell=parentCell.subcells?.[(fineX-cellX*4)+(fineZ-cellZ*4)*4]||parentCell;
    }
    const cell=lastCell;if(cell.height!==null)return cell.height;
    let height=-Infinity;
    for(const t of cell.triangles){
      // Once the highest containing surface is found, lower paving cannot
      // change contact. The same rendered triangles remain authoritative.
      if(height>=t.upper)break;
      if(x<t.minX||x>t.maxX||z<t.minZ||z>t.maxZ)continue;
      const a=((t.bz-t.cz)*(x-t.cx)+(t.cx-t.bx)*(z-t.cz))/t.d;
      const b=((t.cz-t.az)*(x-t.cx)+(t.ax-t.cx)*(z-t.cz))/t.d,c=1-a-b;
      if(a>=-1e-6&&b>=-1e-6&&c>=-1e-6)height=Math.max(height,t.flat?t.ay:a*t.ay+b*t.by+c*t.cy);
    }
    return Number.isFinite(height)?height:fallback(x,z);
  };
}
