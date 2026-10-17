// Presentation reads the same saved positions, solid walls and smoke as AI.
// Only a single immutable saved frame is cached; no accumulated intel or locks.
const finite=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y);
export function createFpsPovOverlayVisibility({lineBlocked,smokeBlocks}){
 let lastFrame=null,lastObserver=null,lastWalls=null,hidden=new Set();
 return{
  read({frame,observer,walls}){
   if(frame===lastFrame&&observer?.id===lastObserver&&walls===lastWalls)return hidden;
   hidden=new Set();lastFrame=frame;lastObserver=observer?.id;lastWalls=walls;
   if(!observer||observer.dead)return hidden;
   for(const target of frame.players||[]){
    if(target.side===observer.side)continue;
    if(!finite(observer.pos)||!finite(target.pos)||lineBlocked(observer.pos,target.pos,walls)||smokeBlocks(observer.pos,target.pos,frame.smokes))hidden.add(target.id);
   }
   return hidden;
  },
 };
}
