// Shared map/world geometry: X=x-50, Z=y-50, one map unit per world unit.
// Keep the established navigation capsule radius; C4 dimensions also construct
// the visible case. An actor must touch the case's footprint with that capsule.
export const FPS_PLAYER_COLLISION_RADIUS = 1.35;
export const FPS_C4_CASE = Object.freeze({width:.95,height:.28,depth:.62});
export function fpsBombInteractionGeometry(player,bombPos,{groundHeightAt=()=>0}={}) {
 const p=player?.pos,b=bombPos;
 if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y)||!Number.isFinite(b?.x)||!Number.isFinite(b?.y))return {eligible:false,reason:'invalid-position'};
 const dx=Math.max(0,Math.abs(p.x-b.x)-FPS_C4_CASE.width/2),dz=Math.max(0,Math.abs(p.y-b.y)-FPS_C4_CASE.depth/2);
 const footprintGap=Math.hypot(dx,dz),heightDelta=Math.abs(groundHeightAt(p)-groundHeightAt(b));
 // Coordinate subtraction can put an exact contact a few binary bits outside.
 const touching=footprintGap<=FPS_PLAYER_COLLISION_RADIUS+1e-12;
 return {eligible:Number.isFinite(heightDelta)&&heightDelta<=.6&&touching,reason:heightDelta>.6?'different-elevation':!touching?'outside-interaction-range':'touching-c4',centerDistance:Math.hypot(p.x-b.x,p.y-b.y),footprintGap,heightDelta,radius:FPS_PLAYER_COLLISION_RADIUS};
}
