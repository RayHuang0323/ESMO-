import fs from 'node:fs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGzip} from 'node:zlib';
import {createHash} from 'node:crypto';
// Exact JSON.stringify byte order; bounded to one root-array entry. Shared
// roundHist prefixes are intentionally serialized exactly as the old fixture.
function* chunks(value,fields={}){
  yield '{';let first=true;
  for(const [key,item]of Object.entries(value)){
    if(item===undefined)continue;if(!first)yield ',';first=false;yield JSON.stringify(key)+':';
    let bytes=0;const emit=s=>{bytes+=Buffer.byteLength(s);return s;};
    if(Array.isArray(item)){yield emit('[');for(let i=0;i<item.length;i++){if(i)yield emit(',');yield emit(JSON.stringify(item[i])??'null');}yield emit(']');}
    else yield emit(JSON.stringify(item));fields[key]=bytes;
  }
  yield '}';
}
export function hashFpsSimulationJson(value){const hash=createHash('sha256');for(const s of chunks(value))hash.update(s);return hash.digest('hex');}
export async function writeFpsSimulationGzip(value,file){
  const hash=createHash('sha256'),fields={};let jsonBytes=0;
  const source=async function*(){for(const s of chunks(value,fields)){const b=Buffer.from(s);jsonBytes+=b.length;hash.update(b);yield b;}};
  await pipeline(Readable.from(source()),createGzip({level:6}),fs.createWriteStream(file,{flags:'wx'}));
  return{jsonBytes,jsonSHA:hash.digest('hex'),fields};
}
