import fs from 'node:fs';import {createHash} from 'node:crypto';import {gzipSync} from 'node:zlib';
const paths=['src/battle/fps/EsportsFPS3D.jsx','src/battle/fps/fpsBombObjectivePlanning.js'];
const out='review/cs-major-upgrade/evidence/owner5-review-20261013/utility-plan-before-fallback.json.gz';
fs.writeFileSync(out,gzipSync(JSON.stringify({at:new Date().toISOString(),files:paths.map(path=>{const bytes=fs.readFileSync(path);return{path,sha256:createHash('sha256').update(bytes).digest('hex'),base64:bytes.toString('base64')};})})),{flag:'wx'});console.log(out);
