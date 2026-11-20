"""Render route trails exported by export_route_trails.mjs into a side-by-side PNG (2026-11-12; measurement tool).
usage: python tools/owner_preview/render_route_trails.py <in.json> <out.png>
Left = first ruleset (before), right = second (after). Gray = walls, light = walkable,
red disk = enemy tower range, dashed ring = danger radius (range + towerSafePad), trail colored by state:
orange = invading, blue = normal move, magenta = retreating, black X = death. Labels in English to avoid font issues.
"""
import json, sys
from PIL import Image, ImageDraw

d = json.load(open(sys.argv[1], encoding="utf-8"))
out = sys.argv[2]
S = 6  # pixels per sim unit
box = d["box"]; W = (box["x1"] - box["x0"] + 1) * S; H = (box["y1"] - box["y0"] + 1) * S
names = list(d["runs"].keys())

def panel(name):
    img = Image.new("RGB", (W, H + 40), (255, 255, 255))
    dr = ImageDraw.Draw(img)
    for j, row in enumerate(d["walk"]):
        for i, c in enumerate(row):
            dr.rectangle([i * S, j * S, i * S + S - 1, j * S + S - 1], fill=(236, 240, 232) if c == "1" else (120, 120, 120))
    P = lambda x, y: ((x - box["x0"]) * S, (y - box["y0"]) * S)
    for t in d["towers"]:
        cx, cy = P(t["x"], t["y"])
        r = t["range"] * S; rd = t["danger"] * S
        ov = Image.new("RGBA", img.size, (0, 0, 0, 0)); od = ImageDraw.Draw(ov)
        od.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(230, 60, 60, 70), outline=(200, 30, 30, 255), width=2)
        img.paste(Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB"))
        dr = ImageDraw.Draw(img)
        for a in range(0, 360, 8):
            import math
            a0, a1 = math.radians(a), math.radians(a + 4)
            dr.line([cx + rd * math.cos(a0), cy + rd * math.sin(a0), cx + rd * math.cos(a1), cy + rd * math.sin(a1)], fill=(200, 30, 30), width=1)
        dr.rectangle([cx - 5, cy - 5, cx + 5, cy + 5], fill=(150, 0, 0))
    tr = d["runs"][name]
    prev = None
    for q in tr:
        if q["dead"]:
            if prev:
                x, y = P(prev["x"], prev["y"]); dr.line([x - 9, y - 9, x + 9, y + 9], fill=(0, 0, 0), width=4); dr.line([x - 9, y + 9, x + 9, y - 9], fill=(0, 0, 0), width=4)
            break
        col = (230, 140, 0) if q["inv"] == "on" else (200, 0, 200) if q["ret"] else (30, 90, 220)
        if prev:
            dr.line([*P(prev["x"], prev["y"]), *P(q["x"], q["y"])], fill=col, width=3)
        x, y = P(q["x"], q["y"]); dr.ellipse([x - 3, y - 3, x + 3, y + 3], fill=col)
        prev = q
    if tr:
        x, y = P(tr[0]["x"], tr[0]["y"]); dr.text((x + 6, y - 14), "t=%g" % tr[0]["t"], fill=(0, 0, 0))
        last = prev or tr[-1]; x, y = P(last["x"], last["y"]); dr.text((x + 6, y + 4), "t=%g hp=%d%%" % (last["t"], round(last["hp"] * 100)), fill=(0, 0, 0))
    died = next((q["t"] for q in tr if q["dead"]), None)
    dr.rectangle([0, H, W, H + 40], fill=(255, 255, 255))
    dr.text((8, H + 6), "%s  seed %s hero %s  %s" % (name, d["seed"], d["hero"], ("DIED at t=%g" % died) if died else "alive"), fill=(0, 0, 0))
    dr.text((8, H + 22), "orange=invading  blue=move  magenta=retreat  red=tower range  dashed=danger radius", fill=(60, 60, 60))
    return img

a = panel(names[0]); b = panel(names[1]) if len(names) > 1 else None
outimg = Image.new("RGB", (a.width * (2 if b else 1) + (10 if b else 0), a.height), (255, 255, 255))
outimg.paste(a, (0, 0))
if b: outimg.paste(b, (a.width + 10, 0))
outimg.save(out)
print("saved", out, outimg.size)
