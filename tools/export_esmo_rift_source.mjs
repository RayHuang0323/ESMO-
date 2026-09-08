import fs from 'node:fs';
import path from 'node:path';
import { buildMobaLayout } from '../src/battle/moba/map/mobaMapLayout.js';
import { buildTerrainShapes } from '../src/battle/moba/map/mapTerrainShapes.js';
import { LANES, RIVER, BASE, FOUNTAIN, PITS, CAMPS, BUSHES, WORLD_BOUNDS, WORLD_SCALE } from '../src/gameData.js';
const t = buildTerrainShapes(buildMobaLayout());
const source = { schema: 'EsmoRiftArtSource.v1', assetSpan: WORLD_BOUNDS.width, WORLD_BOUNDS, WORLD_SCALE,
  LANES, RIVER, BASE, FOUNTAIN, PITS, CAMPS, BUSHES,
  ground: t.groundLayers, walls: t.wallItems,
  bushes: t.bushClusters, arena: t.meta.arena };
const destination=process.argv[2]??'art/moba-rift/source.json';
fs.mkdirSync(path.dirname(destination), {recursive:true});
fs.writeFileSync(destination, JSON.stringify(source));
console.log(JSON.stringify({ground:source.ground.length,walls:source.walls.length,bushSample:source.bushes?.[0],arena:source.arena?.length}));
