// Original ESMO 40-second presentation rhythm, timed to the saved bomb clock.
// Not an official Counter-Strike recording or a gameplay timer.
const duration=40,schedule=[];
for(let elapsed=1;elapsed<duration;){schedule.push(elapsed);elapsed+=Math.max(.135,1.12*Math.pow((duration-elapsed)/duration,.72));}
export function fpsBombBeepCues(frame,frameSec=.5){
 if(!frame?.planted||frame.bombState&&frame.bombState!=='planted')return[];
 const remaining=Number.isFinite(frame.bombTimeRemainingSec)?frame.bombTimeRemainingSec:Number(frame.c4t)*2;
 if(!(remaining>0))return[];const elapsed=duration-remaining;
 return schedule.filter(t=>t>=elapsed-1e-7&&t<elapsed+frameSec-1e-7).map(t=>({id:`beep-${frame.rnd}-${t.toFixed(6)}`,delaySec:Math.max(0,t-elapsed),variant:duration-t<=10?'warning':frame.target==='b'?'b':'a',pos:frame.c4pos}));
}
export function fpsBombBeepPulse(remaining){const elapsed=duration-remaining,last=schedule.filter(t=>t<=elapsed).at(-1);return last==null?0:Math.max(0,1-(elapsed-last)/.12);}
