import fs from 'node:fs';
import {createGunzip} from 'node:zlib';
// Diagnostic reader for our canonical stream writer (frames is the first key).
// At most one saved frame is parsed; never allocates the entire match string.
export async function* streamFpsSavedFrames(file,{onTail}={}){
 const stream=fs.createReadStream(file).pipe(createGunzip()),decoder=new TextDecoder();
 let prefix='',ready=false,depth=0,string=false,escaped=false,parts=[],bytes=0;
 try{for await(const chunk of stream){let text=decoder.decode(chunk,{stream:true}),at=0,start=depth?0:-1;
  if(!ready){prefix+=text;const marker=/^\s*\{\s*"frames"\s*:\s*\[/.exec(prefix);if(!marker){if(prefix.length>128)throw Error('Canonical frames-first JSON required');continue;}text=prefix.slice(marker[0].length);prefix='';ready=true;start=-1;}
  for(;at<text.length;at++){
   const c=text[at];if(!depth){if(c===']'){
    if(onTail){const tail=[text.slice(at+1)];let length=tail[0].length;for await(const remaining of stream){const part=decoder.decode(remaining,{stream:true});length+=part.length;if(length>64*1024*1024)throw Error('Simulation metadata exceeds diagnostic bound');tail.push(part);}tail.push(decoder.decode());onTail(JSON.parse('{'+tail.join('').replace(/^\s*,/,'')));}
    return;
   }if(c==='{' ){depth=1;start=at;string=false;escaped=false;}else if(!/[\s,]/.test(c))throw Error('Expected saved frame object');continue;}
   if(string){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')string=false;continue;}
   if(c==='"'){string=true;continue;}if(c==='{')depth++;else if(c==='}')depth--;
   if(!depth){parts.push(text.slice(start,at+1));const value=JSON.parse(parts.join(''));parts=[];bytes=0;start=-1;yield value;}
  }
  if(depth&&start>=0){const part=text.slice(start);parts.push(part);bytes+=part.length;if(bytes>20*1024*1024)throw Error('Saved frame exceeds diagnostic bound');}
 }throw Error('Truncated saved frames array');}finally{stream.destroy();}
}
