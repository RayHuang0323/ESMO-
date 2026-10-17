// Original mathematical PCM, no sampled or copied game recording.
import fs from 'node:fs';import {createHash} from 'node:crypto';
const rate=44100,root='public/audio/cs/c5a2/';const reports=[];
for(const [name,hz,seconds]of [['a',1850,.12],['b',1580,.12],['warning',2350,.13]]){
 const count=Math.round(rate*seconds),bytes=Buffer.alloc(44+count*2);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(count*2,40);
 for(let i=0;i<count;i++){const t=i/rate,envelope=Math.min(1,t/.004)*Math.pow(Math.max(0,1-t/seconds),2),phase=2*Math.PI*hz*t,carrier=Math.sin(phase)+.12*Math.sin(phase*3),modulation=name==='warning'?.72+.28*Math.cos(2*Math.PI*36*t):1;bytes.writeInt16LE(Math.round(.62*32767*carrier*envelope*modulation),44+i*2);}
 const file=root+`esmo-c4-${name}.wav`;if(fs.existsSync(file))throw Error('Refuse overwrite');fs.writeFileSync(file,bytes);reports.push({file,sha256:createHash('sha256').update(bytes).digest('hex'),hz,seconds,rate,channels:1});
}
fs.writeFileSync('review/cs-major-upgrade/evidence/owner4e-review-20261015/original-audio.json',JSON.stringify({author:'ESMO original synthesis authored in this task',license:'Original project material; no third-party audio used',generator:import.meta.url,files:reports},null,2),{flag:'wx'});console.log(JSON.stringify(reports));
