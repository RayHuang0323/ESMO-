// Scoped evidence wrapper: native exit, both streams, unique prefix; no approval or product mutation.
import fs from 'node:fs';
import {spawn} from 'node:child_process';
const [prefix,script,...args]=process.argv.slice(2);
if(!prefix||!script||!prefix.startsWith('review/cs-major-upgrade/evidence/authenticity-closure-20261012/'))throw new Error('require scoped evidence prefix and Node script');
for(const suffix of ['.stdout.log','.stderr.log','.exit.json'])if(fs.existsSync(prefix+suffix))throw new Error('refuse evidence overwrite');
fs.mkdirSync(prefix.slice(0,prefix.lastIndexOf('/')),{recursive:true});
const stdout=fs.openSync(prefix+'.stdout.log','wx'),stderr=fs.openSync(prefix+'.stderr.log','wx'),started=Date.now();
const child=spawn(process.execPath,[script,...args],{stdio:['ignore',stdout,stderr],windowsHide:true});
child.on('error',error=>{fs.writeFileSync(prefix+'.launch-error.txt',error.stack);});
child.on('close',(code,signal)=>{fs.closeSync(stdout);fs.closeSync(stderr);const result={script,args,nativeExitCode:code,signal,elapsedMs:Date.now()-started};fs.writeFileSync(prefix+'.exit.json',JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));process.exitCode=code??2;});
