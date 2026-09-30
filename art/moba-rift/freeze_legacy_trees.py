"""One-time migration (2026-09-30, v16 objective pit art fix): freeze the legacy tree layout into source.json.

Why: build_rift.py used to place trees by wall *index* (i % 3) and draw heights from one shared
random.Random(93017) stream, which the reed pass then continued. Changing the number of walls anywhere
(e.g. the v16 symmetric pits: 95 -> 96 segments) shifted every later tree and every reed on the map.
This script replays that legacy logic exactly once and stores the result as data:
  walls[i]['tree']  = tree height (only on walls that had a tree)
  treeModel         = 'explicit.v1'
  reedRngSkip       = how many draws the legacy wall pass consumed before the reeds
After this, build_rift.py reads trees from data and burns reedRngSkip draws ⇒ output is byte-for-byte the
same geometry as before, and later edits to some walls no longer move the rest of the map.

Run (plain Python or Blender's Python; only the stdlib `random` is used, same as build_rift.py):
  blender --background --factory-startup --python art/moba-rift/freeze_legacy_trees.py
Optional env: ESMO_RIFT_SOURCE=<path> (default: art/moba-rift/source.json next to this file).
Idempotent: refuses to run twice (treeModel already set).
"""
import json, os, random
from pathlib import Path

SRC = Path(os.environ.get('ESMO_RIFT_SOURCE') or Path(__file__).parent / 'source.json')
data = json.loads(SRC.read_text(encoding='utf-8'))
if data.get('treeModel'):
    raise SystemExit(f"already migrated: treeModel={data['treeModel']}")

RNG = random.Random(93017)            # identical seed and call order to legacy build_rift.py
draws = 0
for i, w in enumerate(data['walls']):
    #  legacy condition, verbatim from build_rift.py
    if (i % 3 == 0 or w.get('kind') == 'outer_ridge') and min(w['len'], w['thick']) > 1.4 and 'base' not in w.get('kind', ''):
        w['tree'] = RNG.uniform(7, 12)
        draws += 1
data['treeModel'] = 'explicit.v1'
data['reedRngSkip'] = draws
SRC.write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
print(json.dumps({'source': str(SRC), 'walls': len(data['walls']), 'trees': draws, 'reedRngSkip': draws}))
