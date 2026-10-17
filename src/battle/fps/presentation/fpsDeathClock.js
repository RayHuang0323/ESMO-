// A saved snapshot may already contain a victim killed later inside its .5s
// combat interval. Reveal the saved death only at the actual kill event clock.
// This is a presentation projection; original players/events remain untouched.
export function fpsDeathClockPlayer({player,previousPlayer,events=[],roundSec,sameRound=true}){
 if(!player?.dead||!sameRound||!previousPlayer||previousPlayer.dead||!Number.isFinite(roundSec))return{player,pendingDeath:false,deathAtSec:null};
 const kill=events.find(e=>e.type==='kill'&&e.victimId===player.id&&Number.isFinite(e.roundSec));
 if(!kill)return{player,pendingDeath:false,deathAtSec:null};
 return{player:roundSec<kill.roundSec?{...player,dead:false,hp:previousPlayer.hp,state:previousPlayer.state}:player,pendingDeath:roundSec<kill.roundSec,deathAtSec:kill.roundSec};
}
