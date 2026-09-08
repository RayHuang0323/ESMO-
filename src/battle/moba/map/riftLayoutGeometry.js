// Map-authoring coordinates only. Local meshes, directions and dimensions are
// unchanged; core anchors are translated into the larger world, never stretched.
const LOCAL_KEYS = new Set(['members','parts','tiers','crown','baseGeo',
  'tangent','normal','dir','forward','right']);
export function translateRiftSpatial(value, offset, key = '') {
  if (LOCAL_KEYS.has(key)) return value;
  if (Array.isArray(value)) return value.map(item => translateRiftSpatial(item, offset, key));
  if (!value || typeof value !== 'object') return value;
  const out = Object.fromEntries(Object.entries(value).map(([k, item]) =>
    [k, translateRiftSpatial(item, offset, k)]));
  if (Number.isFinite(value.x) && Number.isFinite(value.y)) {
    out.x = value.x + offset; out.y = value.y + offset;
  }
  for (const k of ['minX','maxX','minY','maxY','centerX','centerY']) {
    if (Number.isFinite(value[k])) out[k] = value[k] + offset;
  }
  return out;
}
