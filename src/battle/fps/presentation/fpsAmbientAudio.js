// CC0來源見public/audio/cs/major-v1/SOURCES.md；環境底床不派送gameplay事件。
export const FPS_AMBIENT_PROFILES = Object.freeze({
  mirage:Object.freeze({gain:.055,lowpassHz:2200}),
  dust2:Object.freeze({gain:.07,lowpassHz:3200}),
  inferno:Object.freeze({gain:.045,lowpassHz:1600}),
});

export function createFpsAmbientAudio({context,destination,url,fetchAsset=fetch,onChange=()=>{}}) {
  const gain=context.createGain(),filter=context.createBiquadFilter();
  gain.gain.value=0;filter.type='lowpass';filter.connect(gain);gain.connect(destination);
  let buffer=null,source=null,desired=null,identity=null,disposed=false;
  const diag={version:1,status:'loading',active:false,sourceStarts:0,voiceGraphs:1,gainNodes:1,
    sourcePolicy:'CC0 asset loop; no gunfire or gameplay events',sample:'wind-loop.ogg',error:null};
  const publish=()=>{try{onChange({...diag});}catch{}};
  function stop() {
    if(source){source.onended=null;try{source.stop();}catch{} source.disconnect();source=null;}
    identity=null;diag.active=false;publish();
  }
  function sync(state) {
    if(disposed)return;desired=state;
    if(!state?.playing||!state.soundOn||state.simulation==null||context.state!=='running'){stop();return;}
    if(!buffer)return;
    const profile=FPS_AMBIENT_PROFILES[state.mapKey]||FPS_AMBIENT_PROFILES.mirage;
    if(source&&identity?.simulation===state.simulation&&identity.seekNonce===state.seekNonce&&identity.mapKey===state.mapKey)return;
    stop();
    try {
    filter.frequency.setValueAtTime(profile.lowpassHz,context.currentTime);
    gain.gain.setValueAtTime(0,context.currentTime);gain.gain.linearRampToValueAtTime(profile.gain,context.currentTime+.12);
    source=context.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(filter);
    const time=Number.isFinite(state.frameTimeSec)?Math.max(0,state.frameTimeSec):0;
    const offset=time%buffer.duration;source.start(context.currentTime,offset);
    identity={simulation:state.simulation,seekNonce:state.seekNonce,mapKey:state.mapKey};
    diag.active=true;diag.sourceStarts++;diag.offsetSec=offset;diag.gain=profile.gain;diag.lowpassHz=profile.lowpassHz;publish();
    } catch(error){stop();diag.status='failed';diag.error=String(error?.message||error);publish();}
  }
  const ready=(async()=>{
    try {
      const response=await fetchAsset(url,{cache:'force-cache'});if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const bytes=await response.arrayBuffer();if(disposed)return false;
      const decoded=await context.decodeAudioData(bytes.slice(0));if(disposed)return false;
      if(!Number.isFinite(decoded.duration)||decoded.duration<=0||decoded.numberOfChannels<1)throw new Error('環境音解碼格式不符');
      buffer=decoded;const data=buffer.getChannelData(0);let energy=0,peak=0;
      for(const value of data){if(!Number.isFinite(value))throw new Error('環境音PCM非有限數');energy+=value*value;peak=Math.max(peak,Math.abs(value));}
      diag.status='ready';diag.bytes=bytes.byteLength;diag.durationSec=buffer.duration;diag.channels=buffer.numberOfChannels;
      diag.rms=Math.sqrt(energy/Math.max(1,data.length));diag.peak=peak;publish();sync(desired);return true;
    } catch(error) {buffer=null;if(!disposed){diag.status='failed';diag.error=String(error?.message||error);publish();}return false;}
  })();
  return {ready,sync,stop(){desired=null;stop();},diagnostics:()=>({...diag}),dispose(){if(disposed)return;stop();disposed=true;
    buffer=null;desired=null;filter.disconnect();gain.disconnect();diag.status='disposed';publish();}};
}
