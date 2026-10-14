import React, {useEffect, useRef, useState} from 'react';
import './fpsTeamRadio.css';

// Device speech is optional presentation, never a second source of team intel.
export default function FpsTeamRadio({messages=[],side=null,playing,soundOn,simulation,seekNonce=0}){
  const [enabled,setEnabled]=useState(false),[speaker,setSpeaker]=useState(null),[voices,setVoices]=useState([]),[error,setError]=useState(null);
  const seen=useRef(new Set()),queue=useRef([]),busy=useRef(false),epoch=useRef(0),suppressBatch=useRef(true);
  const visible=messages.filter(m=>!side||m.side===side);
  const voice=voices.find(v=>/^zh[-_]/i.test(v.lang));
  const supported=typeof window!=='undefined'&&!!window.speechSynthesis;
  useEffect(()=>{
    if(!supported)return;
    const synth=window.speechSynthesis,read=()=>setVoices(synth.getVoices());read();
    synth.addEventListener('voiceschanged',read);return()=>{synth.removeEventListener('voiceschanged',read);synth.cancel();};
  },[supported]);
  useEffect(()=>{seen.current.clear();suppressBatch.current=true;queue.current=[];busy.current=false;epoch.current++;setSpeaker(null);window.speechSynthesis?.cancel();},[simulation,seekNonce,side]);
  useEffect(()=>{
    if(!enabled||!playing||!soundOn||!voice){queue.current=[];busy.current=false;epoch.current++;setSpeaker(null);window.speechSynthesis?.cancel();}
    const newly=visible.filter(m=>!seen.current.has(m.id));
    newly.forEach(m=>seen.current.add(m.id));
    if(suppressBatch.current){suppressBatch.current=false;return;}
    // Turning audio on does not replay the rolling transcript backlog.
    if(!enabled||!playing||!soundOn||!voice)return;
    queue.current.push(...newly);queue.current=queue.current.slice(-3);
    const next=()=>{
      if(busy.current||!queue.current.length)return;
      const message=queue.current.shift(),token=epoch.current;
      const utterance=new SpeechSynthesisUtterance(message.text);utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=1.12;utterance.volume=.8;
      busy.current=true;
      utterance.onstart=()=>{if(token===epoch.current){setSpeaker(message.name);setError(null);}};
      const done=()=>{if(token!==epoch.current)return;busy.current=false;setSpeaker(null);next();};
      utterance.onend=done;utterance.onerror=()=>{if(token===epoch.current)setError('語音暫時無法播放，保留文字通訊');done();};
      window.speechSynthesis.speak(utterance);
    };next();
  },[messages,enabled,playing,soundOn,voice,side]);
  const unavailable=!supported?'此瀏覽器不支援語音':!voice?'本機尚無中文語音':!soundOn?'開啟聲音後可用':null;
  return <details className="fps-team-radio" data-testid="cs-team-radio">
    <summary><span>📻 {side?'隊伍通訊':'雙方通訊'}</span><span className="fps-team-radio-latest">{visible.length?`${visible.at(-1).name}：${visible.at(-1).text}`:'目前沒有通訊'}</span></summary>
    <div className="fps-team-radio-controls"><button type="button" disabled={!!unavailable} aria-pressed={enabled} onClick={()=>setEnabled(v=>!v)}>{enabled?'關閉通訊語音':'開啟通訊語音'}</button>
      <span role="status">{speaker?`${speaker} 正在通訊`:error||unavailable|| (enabled?'語音已開啟':'文字通訊・可開語音')}</span></div>
    <small>語音使用本機中文朗讀；內容來自實際隊伍報點。{side?'第一人稱只播放同隊通訊。':'觀戰可查看雙方通訊。'}</small>
    <ol>{visible.map(m=><li key={m.id}><b>{m.name}</b>：{m.text}</li>)}</ol>
  </details>;
}
