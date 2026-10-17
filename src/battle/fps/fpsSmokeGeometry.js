// Authoritative horizontal smoke envelope, shared by simulation and rendering.
export const FPS_SMOKE_RADIUS = 6;
export function fpsPointInSmoke(point,smokes) {
 if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y))return false;
 for(const smoke of smokes||[])if((smoke.tl??1)>0&&Math.hypot(point.x-smoke.pos.x,point.y-smoke.pos.y)<FPS_SMOKE_RADIUS)return true;
 return false;
}
