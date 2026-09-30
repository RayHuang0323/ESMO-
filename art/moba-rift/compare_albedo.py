"""Albedo (terrain atlas + minimap texture) diff for the v16 objective pit art fix.

Run: blender --background --factory-startup --python art/moba-rift/compare_albedo.py -- <a.png> <b.png> <source.json> [radius]
Reports how many pixels differ, and how many of those lie OUTSIDE `radius` sim units of either pit centre
(must be 0 for "other terrain unchanged"). Pixel rows follow build_rift.py: row r <-> sim y = SPAN - r/(N-1)*SPAN.
"""
import bpy, json, sys
import numpy as np

args = sys.argv[sys.argv.index('--') + 1:]
a_path, b_path, src_path = args[:3]
radius = float(args[3]) if len(args) > 3 else 22.0
src = json.load(open(src_path, encoding='utf-8'))
span = src['WORLD_BOUNDS']['width']
pits = list(src['PITS'].values())

def load(p):
    img = bpy.data.images.load(p)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(px)
    return px.reshape(h, w, 4), w, h

A, w, h = load(a_path); B, w2, h2 = load(b_path)
assert (w, h) == (w2, h2), f'size mismatch {(w, h)} vs {(w2, h2)}'
diff = np.any(np.abs(A[:, :, :3] - B[:, :, :3]) > (0.5 / 255), axis=2)
rows, cols = np.nonzero(diff)
sx = cols / (w - 1) * span; sy = span - rows / (h - 1) * span
near = np.zeros(len(rows), dtype=bool)
for p in pits: near |= np.hypot(sx - p['x'], sy - p['y']) <= radius
out = {'size': [w, h], 'diffPixels': int(diff.sum()), 'outsideRadius': int((~near).sum()), 'radius': radius,
       'maxDistFromPit': float(max((min(np.hypot(x - p['x'], y - p['y']) for p in pits) for x, y in zip(sx, sy)), default=0))}
print('ALBEDO_DIFF ' + json.dumps(out))
