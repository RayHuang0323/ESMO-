#!/usr/bin/env node
// Root-only final cleanup entry. Default dry-run; never invokes another shell for file operations.
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const allowed=new Set(['manifest','expectedManifestSha256','rootReview','outputPrefix','execute','dry-run']);
const opts={};
for(const arg of process.argv.slice(2)) {
 const match=/^--([^=]+)(?:=(.*))?$/.exec(arg);
 if(!match||!allowed.has(match[1]))throw Error('Unknown cleanup argument: '+arg);
 if(['execute','dry-run'].includes(match[1])&&match[2]!==undefined)throw Error('Boolean flags accept no value: '+arg);
 opts[match[1]]=match[2]??true;
}
if(!opts.manifest)throw Error('--manifest=<explicit manifest path> is required');
if(opts.execute&&opts['dry-run'])throw Error('Choose --dry-run or --execute');
const args=['-NoProfile','-File',path.join(path.dirname(fileURLToPath(import.meta.url)),'invoke_root_cleanup_subset.ps1'),'-ManifestPath',path.resolve(opts.manifest)];
for(const [flag,key]of [['ExpectedManifestSha256','expectedManifestSha256'],['RootReviewPath','rootReview'],['OutputPrefix','outputPrefix']])if(opts[key])args.push('-'+flag,opts[key]);
if(opts.execute)args.push('-Execute');
const result=spawnSync('powershell.exe',args,{stdio:'inherit',windowsHide:true});
if(result.error){console.error(result.error.message);process.exitCode=2;}else process.exitCode=result.status??2;
