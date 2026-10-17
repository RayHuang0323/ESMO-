// Spectator presentation only. Saved weapon, shot clock, handling and motion
// own eligibility; no aim assist, enemy queries, RNG or simulation writes.
export function resolveFpsSniperScope({player,pov,roundSec,events=[],nextEvents=[]}){
 const sniper=['awp','scout'].includes(player?.gun);
 const moving=Math.hypot((player?.pos?.x||0)-(player?.prevPos?.x||0),(player?.pos?.y||0)-(player?.prevPos?.y||0))>.22;
 const shots=events.filter(e=>e.attackerId===player?.id&&Number.isFinite(e.shotAtMs));
 const last=shots.filter(e=>e.shotAtMs<=roundSec*1000).at(-1),age=last?(roundSec*1000-last.shotAtMs)/1000:null;
 const beforeShot=[...shots,...nextEvents].some(e=>e.attackerId===player?.id&&e.weaponFamily==='sniper'&&e.shotAtMs>=roundSec*1000&&e.shotAtMs-roundSec*1000<650);
 const cycling=age!==null&&age>.09&&age<.80;
 const handling=player?.reloading&&player?.reloadEndsAtMs>roundSec*1000;
 const planting=Boolean(player?.hasBomb&&(player.state==='安裝中'||player.plantProgressSec>0));
 const active=Boolean(pov&&sniper&&!player.dead&&player.state!=='BUY'&&!handling&&!planting&&!cycling&&(!moving||beforeShot));
 return{active,fov:active?18:null,gun:player?.gun||null,shotAgeSec:age,cycling,recoil:age!==null&&age<.09?Math.max(0,1-age/.09):0,reason:!sniper?'not-sniper':planting?'planting':cycling?'bolt-cycle':moving&&!beforeShot?'moving':'aimed'};
}
