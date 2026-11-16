// Presentation-only location hints; never contain ability/growth/result values.
const KEYS=['csCoach','csMatchId','csPlayerId','csCourseId'];
export const csCoachingTrainingBlock=session=>session?.state==='launched'?'請先完成目前比賽或系列賽，再安排訓練。':null;
export function readCsCoachingLocation(search=typeof window==='undefined'?'':window.location.search){
 const params=new URLSearchParams(search),mode=params.get('csCoach');
 if(!['report','training'].includes(mode))return null;
 const value=key=>{const s=params.get(key);return s&&s.length<=160&&!/[\u0000-\u001f]/.test(s)?s:null;};
 return {mode,matchId:value('csMatchId'),playerId:value('csPlayerId'),courseId:value('csCourseId')};
}
export function writeCsCoachingLocation(intent){
 if(typeof window==='undefined')return;
 const url=new URL(window.location.href);for(const key of KEYS)url.searchParams.delete(key);
 if(intent){url.searchParams.set('csCoach',intent.mode);for(const [key,value] of [['csMatchId',intent.matchId],['csPlayerId',intent.playerId],['csCourseId',intent.courseId]])if(value)url.searchParams.set(key,value);}
 window.history.replaceState(window.history.state,'',url);
}
