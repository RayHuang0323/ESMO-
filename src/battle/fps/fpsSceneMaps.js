import {fpsSceneMap as previousMap,fpsSceneTactic as previousTactic} from './fpsOriginalMapV2.js';
import {FPS_CONFLUENCE_STATION,FPS_CONFLUENCE_STATION_V3_2,CONFLUENCE_CURRENT_LAYOUT,confluenceTactic} from './fpsConfluenceStation.js';
import {FPS_DUNE_TERMINAL,DUNE_TERMINAL_LAYOUT,duneTerminalTactic} from './fpsDuneTerminal.js';
import {FPS_DUNE_TERMINAL as DUNE_TERMINAL_V41} from './fpsDuneTerminalV41.js';
import {FPS_FOUNDRY_CIRCUIT,FOUNDRY_CIRCUIT_LAYOUT,foundryCircuitTactic} from './fpsFoundryCircuit.js';
import {FPS_FOUNDRY_CIRCUIT as FOUNDRY_CIRCUIT_V51} from './fpsFoundryCircuitV51.js';

export function fpsSceneMap(mapKey,sceneVersion,majorMaps,legacyMaps,layoutId){
 if(sceneVersion==='major.v5'){
  if(mapKey!=='inferno')throw new Error('Foundry Circuit 地圖版本不一致');
  if(layoutId==='esmo-foundry-circuit.v5.1')return FOUNDRY_CIRCUIT_V51;
  if(layoutId!=null&&layoutId!==FOUNDRY_CIRCUIT_LAYOUT)throw new Error('Foundry Circuit 場景版本不支援');
  return FPS_FOUNDRY_CIRCUIT;
 }
 if(sceneVersion==='major.v4'){
  if(mapKey!=='dust2')throw new Error('Dune Terminal 地圖版本不一致');
  if(layoutId==='esmo-dune-terminal.v4.1')return DUNE_TERMINAL_V41;
  if(layoutId!=null&&layoutId!==DUNE_TERMINAL_LAYOUT)throw new Error('Dune Terminal 場景版本不支援');
  return FPS_DUNE_TERMINAL;
 }
 if(layoutId===undefined)layoutId=CONFLUENCE_CURRENT_LAYOUT;
 if(sceneVersion!=='major.v3')return previousMap(mapKey,sceneVersion,majorMaps,legacyMaps);
 if(mapKey!=='mirage')throw new Error('Confluence Station 地圖版本不一致');
 if(layoutId==='esmo-confluence.v3.2')return FPS_CONFLUENCE_STATION_V3_2;
 if(layoutId!==CONFLUENCE_CURRENT_LAYOUT)throw new Error('Confluence Station 場景版本不支援');
 return FPS_CONFLUENCE_STATION;
}
export function fpsSceneTactic(tactic,side,sceneVersion){
 if(sceneVersion==='major.v5')return foundryCircuitTactic(tactic,side);
 if(sceneVersion==='major.v4')return duneTerminalTactic(tactic,side);
 return sceneVersion==='major.v3'?confluenceTactic(tactic,side):previousTactic(tactic,side,sceneVersion);
}
