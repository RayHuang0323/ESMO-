// Major-only weapon handling. Round-local milliseconds and scalar fields keep
// recorded frames independent; presentation never spends ammunition.
const CAPACITY = Object.freeze({ak:30,m4:25,m4a4:30,galil:35,famas:25,aug:30,sg:30,
  awp:5,scout:10,mp9:30,mac10:30,ump:25,p90:50,deagle:7,glock:20,usp:12,p250:13,
  tec9:18,nova:8,xm1014:7,mag7:5,sawedoff:7});
const SNIPERS = new Set(['awp','scout']);
const SMGS = new Set(['mp9','mac10','ump','p90']);
const PISTOLS = new Set(['deagle','glock','usp','p250','tec9']);
const SHOTGUNS = new Set(['nova','xm1014','mag7','sawedoff']);

export function fpsWeaponHandlingProfile(gun) {
  const capacity = CAPACITY[gun];
  if (!capacity) throw new Error(`Unknown FPS weapon handling profile: ${gun}`);
  const family = SNIPERS.has(gun)?'sniper':SMGS.has(gun)?'smg':PISTOLS.has(gun)?'pistol':SHOTGUNS.has(gun)?'shotgun':'rifle';
  return {capacity, reserve:capacity*3, reloadMs:{pistol:1800,smg:2200,rifle:2500,sniper:3000,shotgun:2800}[family], family};
}

export function createFpsWeaponHandling(gun, dropped = null) {
  const profile = fpsWeaponHandlingProfile(gun);
  const bounded = (value,max) => Math.max(0,Math.min(max,Math.floor(Number(value)||0)));
  return {weaponHandlingVersion:1,handlingGun:gun,
    ammo:dropped?bounded(dropped.ammo,profile.capacity):profile.capacity,
    reserveAmmo:dropped?bounded(dropped.reserveAmmo,profile.reserve):profile.reserve,
    reloading:false,reloadStartedAtMs:null,reloadEndsAtMs:null,handlingAtMs:0};
}

export function advanceFpsWeaponHandling(player, nowMs, dead = player.dead) {
  const profile = fpsWeaponHandlingProfile(player.gun);
  const state = player.handlingGun===player.gun ? {
    weaponHandlingVersion:1,handlingGun:player.gun,ammo:player.ammo,reserveAmmo:player.reserveAmmo,
    reloading:player.reloading,reloadStartedAtMs:player.reloadStartedAtMs,reloadEndsAtMs:player.reloadEndsAtMs,
    handlingAtMs:nowMs,
  } : {...createFpsWeaponHandling(player.gun),handlingAtMs:nowMs};
  if (dead) return {...state,reloading:false,reloadStartedAtMs:null,reloadEndsAtMs:null};
  if (state.reloading && nowMs>=state.reloadEndsAtMs) {
    const transfer = Math.min(profile.capacity-state.ammo,state.reserveAmmo);
    state.ammo+=transfer;state.reserveAmmo-=transfer;
    state.reloading=false;state.reloadStartedAtMs=null;state.reloadEndsAtMs=null;
  }
  if (!state.reloading && state.ammo===0 && state.reserveAmmo>0) {
    state.reloading=true;state.reloadStartedAtMs=nowMs;state.reloadEndsAtMs=nowMs+profile.reloadMs;
  }
  return state;
}

export function fpsWeaponReadyAtMs(player, nowMs) {
  if (player.dead || player._objectiveLocked || (player.ammo===0 && player.reserveAmmo===0)) return Infinity;
  return player.reloading ? player.reloadEndsAtMs : nowMs;
}

export function consumeFpsWeaponShot(player, shotAtMs) {
  const state = advanceFpsWeaponHandling(player,shotAtMs);
  if (player.dead || state.reloading || state.ammo<=0) return {fired:false,state};
  const ammoBefore=state.ammo;
  state.ammo-=1;
  return {fired:true,ammoBefore,state:advanceFpsWeaponHandling({...player,...state},shotAtMs)};
}

export function resolveFpsWeaponStance(player) {
  if (player.dead) return 'standing';
  const moved = Math.hypot(player.pos.x-player.prevPos.x,player.pos.y-player.prevPos.y);
  return moved<=.02 && player.coverAssessment?.protected===true && ['HOLD','COVER','POST_PLANT','ENGAGE','架槍'].includes(player.state) ? 'crouched' : 'standing';
}
