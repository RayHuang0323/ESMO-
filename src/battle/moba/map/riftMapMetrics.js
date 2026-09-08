// Expand world extent independently of core route lengths and combat footprints.
export const RIFT_EXTENT_RATIO = 1.5;
export const RIFT_DESIGN_SPAN = 220;
export const RIFT_CORE_OFFSET = RIFT_DESIGN_SPAN * (RIFT_EXTENT_RATIO - 1) / 2;
export const RIFT_MAP_VERSION = 'esmo-rift-330-corridor-v3';
export const placeRiftAnchor = (p) => ({ ...p, x: p.x + RIFT_CORE_OFFSET, y: p.y + RIFT_CORE_OFFSET });
