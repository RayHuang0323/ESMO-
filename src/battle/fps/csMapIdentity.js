// Additive CS identity boundary. Engine keys remain compatible with saved frames.
import {CONFLUENCE_CURRENT_LAYOUT} from './fpsConfluenceStation.js';
import {DUNE_TERMINAL_LAYOUT} from './fpsDuneTerminal.js';
import {FOUNDRY_CIRCUIT_LAYOUT} from './fpsFoundryCircuit.js';
const ORIGINAL=Object.freeze({
 mirage:Object.freeze({competitionMapId:'confluence-station',mapKey:'mirage',name:'Confluence Station',sceneVersion:'major.v3'}),
 dust2:Object.freeze({competitionMapId:'dune-terminal',mapKey:'dust2',name:'Dune Terminal',sceneVersion:'major.v4'}),
 inferno:Object.freeze({competitionMapId:'foundry-circuit',mapKey:'inferno',name:'Foundry Circuit',sceneVersion:'major.v5'}),
});
export const CS_ORIGINAL_COMPETITION_POOL='original-v1';
export function csOriginalMapIdentity(mapKey){return ORIGINAL[mapKey]??null;}
export function csOriginalCompetitionSnapshot(){return Object.fromEntries(Object.entries(ORIGINAL).map(([key,value])=>[key,{...value,layoutId:({mirage:CONFLUENCE_CURRENT_LAYOUT,dust2:DUNE_TERMINAL_LAYOUT,inferno:FOUNDRY_CIRCUIT_LAYOUT})[key]}]));}
export function resolveCsMapIdentity({mapKey,mapId,sceneVersion='major.v1'}={}){
 const key=mapKey??mapId,original=ORIGINAL[key];
 if(original?.sceneVersion===sceneVersion)return {...original,poolId:CS_ORIGINAL_COMPETITION_POOL};
 return {competitionMapId:`legacy:${key??'unknown'}:${sceneVersion}`,mapKey:key,sceneVersion,poolId:'legacy'};
}
