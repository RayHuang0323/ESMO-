// 每場 major 模擬使用自己的快取，walls 與角色半徑在該場期間保持不變。
// 不量化座標、不共用反向射線結果、不把快取寫入 replay／result。
export function createFpsMajorSegmentCache(walls,radius,{maxEntries=2048,maxPoints=16384}={}){
  const entries=new Map();let points=0,hits=0,misses=0;
  if(!Number.isInteger(maxEntries)||maxEntries<1||!Number.isInteger(maxPoints)||maxPoints<1)throw new Error('導航快取上限必須是正整數');
  const key=(a,b)=>{
    const values=[a.x,a.y,b.x,b.y];
    return values.every(Number.isFinite)?values.map(v=>Object.is(v,-0)?'-0':String(v)).join('|'):null;
  };
  const compatible=(currentWalls,currentRadius)=>currentWalls===walls&&Object.is(currentRadius,radius);
  const remove=k=>{points-=entries.get(k).length;entries.delete(k);};
  return{
    getSegment(a,b,currentWalls,currentRadius){
      if(!compatible(currentWalls,currentRadius))return undefined;
      const k=key(a,b),route=k===null?undefined:entries.get(k);
      if(!route){misses++;return undefined;}
      hits++;entries.delete(k);entries.set(k,route);
      return route.map(p=>({...p}));
    },
    setSegment(a,b,route,currentWalls,currentRadius){
      if(!compatible(currentWalls,currentRadius))return;
      const k=key(a,b);
      if(k===null||!Array.isArray(route)||route.length>maxPoints)return;
      if(entries.has(k))remove(k);
      while(entries.size&&(entries.size>=maxEntries||points+route.length>maxPoints))remove(entries.keys().next().value);
      entries.set(k,route.map(p=>({...p})));points+=route.length;
    },
    getStats(){return{entries:entries.size,points,hits,misses,maxEntries,maxPoints};},
  };
}
