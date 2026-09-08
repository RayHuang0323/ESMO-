// Keep the authored lane centreline inside an eight-unit traversable corridor.
// This clips static rock capsules only; tower footprints and combat rules stay
// in their existing sources. Rendering and navigation consume the same result.
const distanceToSegment = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));
  return Math.hypot(p.x-a.x-t*dx, p.y-a.y-t*dy);
};

export function clearRiftLaneWalls(walls, lanes, pad = 4) {
  const segments = Object.values(lanes).flatMap(points => points.slice(1).map((p,i) => [points[i],p]));
  return walls.flatMap(w => {
    const count = Math.max(1, Math.ceil(w.len/.5)), step = w.len/count;
    const ux = Math.sin(w.angle), uy = Math.cos(w.angle);
    const valid = Array.from({length:count}, (_,i) => {
      const t = -w.len/2+(i+.5)*step, p = {x:w.x+ux*t,y:w.y+uy*t};
      return segments.every(([a,b]) => distanceToSegment(p,a,b) >= pad+w.thick/2+step/2);
    });
    if (valid.every(Boolean)) return [w];
    const out = []; let begin = -1;
    for (let i=0; i<=count; i++) {
      if (valid[i] && begin<0) begin=i;
      if (!valid[i] && begin>=0) {
        const t = -w.len/2+(begin+i)*step/2;
        out.push({...w,id:`${w.id??'wall'}_lane_clip_${begin}`,x:w.x+ux*t,y:w.y+uy*t,len:(i-begin)*step});
        begin=-1;
      }
    }
    return out;
  });
}
