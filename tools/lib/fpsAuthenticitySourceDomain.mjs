import fs from 'node:fs';
import {createHash} from 'node:crypto';
export function fpsAuthenticitySourceDomain(){
  const paths=['src/battle/fps/EsportsFPS3D.jsx','src/battle/fps/fpsBombObjectivePlanning.js','src/battle/fps/fpsTacticalCoordinator.js','src/battle/fps/fpsMajorUtilityRules.js'];
  const hashes=Object.fromEntries(paths.map(file=>[file,createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
  return{hashes,sha256:createHash('sha256').update(JSON.stringify(hashes)).digest('hex')};
}
