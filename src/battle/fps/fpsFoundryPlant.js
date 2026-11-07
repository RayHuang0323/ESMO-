import {foundryGroundHeight} from './fpsFoundryTerrain.js';

// 同一安包區資料供真實carrier資格、地坪及雷達；舊v5.1只重播歷史frames。
export function foundryPlantZoneContains(point,siteKey,map){
 const zone=map.plantZones?.[siteKey],site=map.sites?.[siteKey];if(!zone||!point||!site)return false;
 return point.x>=zone.x&&point.x<=zone.x+zone.w&&point.y>=zone.y&&point.y<=zone.y+zone.h&&Math.abs(foundryGroundHeight(point)-foundryGroundHeight(site))<=zone.maxGroundDelta+1e-9;
}
