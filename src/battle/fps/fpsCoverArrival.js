// A committed hold is complete at its real arrival tolerance. A later tactical
// route assignment must not leave a zero-pace actor with an unfinished cursor.
export function fpsCoverArrivalCompleted(player,intent){
 return !player.dead&&intent?.kind==='take-cover'&&intent.stopMovement===true&&
  intent.coverAssignment?.reason==='arrived-hold-covered-angle'&&
  Number.isFinite(intent.routeTarget?.x)&&Number.isFinite(intent.routeTarget?.y)&&
  Math.hypot(player.pos.x-intent.routeTarget.x,player.pos.y-intent.routeTarget.y)<=.55&&
  player.route?.length>1&&player.routeIdx<player.route.length-1;
}
