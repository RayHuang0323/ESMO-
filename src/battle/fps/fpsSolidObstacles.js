// 單一原實體來源；由既有c5a2幾何原樣搬出，供煙霧／投擲與原導航共用。
function centeredSolidObstacle(x,y,width,depth,kind,angle=0){
  const c=Math.abs(Math.cos(angle||0)),s=Math.abs(Math.sin(angle||0));
  const w=width*c+depth*s,h=width*s+depth*c;
  return{x:x-w/2,y:y-h/2,w,h,hgt:kind==="building"?5:2,deco:kind!=="building",kind};
}
export function fpsSolidObstacles(map){
  const obstacles=(map.walls||[]).map(w=>({...w,kind:"building"}));
  (map.crates||[]).forEach(crate=>obstacles.push(centeredSolidObstacle(crate.x,crate.y,2.7,2.7,"crate")));
  (map.props||[]).forEach(prop=>{
    const angle=Number(prop.a)||0;
    if(prop.t==="car")obstacles.push(centeredSolidObstacle(prop.x,prop.y,6,2.9,"car",angle));
    else if(prop.t==="sandbag")obstacles.push(centeredSolidObstacle(prop.x,prop.y,3.4,1.9,"sandbag",angle));
    else if(prop.t==="barrel")obstacles.push(centeredSolidObstacle(prop.x,prop.y,2.2,2.2,"barrel"));
    // "plat" is a walkable bomb-site presentation slab, not a blocking prop.
    // Treating it as a 7x7 solid put Inferno A's authoritative destination
    // inside an obstacle and caused an endless replan loop.
    else if(prop.t==="plat")return;
    else obstacles.push(centeredSolidObstacle(prop.x,prop.y,2.7,2.7,"crate",angle));
  });
  // major 房間的工位是真 cover：同一 bounds 服務導航、角色 separation、
  // LOS 與呈現；legacy rooms 沒有 fixtures，保留原輸出與搜尋順序。
  for(const room of map.rooms||[])for(const fixture of room.fixtures||[]){
    obstacles.push({...fixture,roomId:room.id,kind:"room-fixture",deco:true});
  }
  return obstacles;
}

