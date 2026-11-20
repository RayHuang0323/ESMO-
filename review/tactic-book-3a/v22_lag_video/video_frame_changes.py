"""Finer per-frame change map at 960x540: changed-pixel counts per region (diff > 16).
Regions: map (game 3D area excluding HUD panels), clock, minimap, hero strip right, cursor excluded by being noisy anyway."""
import subprocess, sys, json, re
import numpy as np
FF = r"C:\Users\ifikn\AppData\Roaming\Python\Python312\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v9.0.2.exe"
SRC, OUT = sys.argv[1], sys.argv[2]
W, H = 960, 540
p = subprocess.run([FF, "-hide_banner", "-i", SRC, "-an", "-vf", "showinfo", "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace")
pts = [float(m.group(1)) for m in re.finditer(r"pts_time:([0-9.]+)", p.stderr)]
types = re.findall(r"type:([IPB])", p.stderr)
proc = subprocess.Popen([FF, "-hide_banner", "-loglevel", "error", "-i", SRC, "-an", "-fps_mode", "passthrough", "-vf", f"scale={W}:{H}", "-pix_fmt", "gray", "-f", "rawvideo", "-"], stdout=subprocess.PIPE)
R = {  # (y0,y1,x0,x1) fractions
  "map": (0.15, 0.80, 0.18, 0.82),
  "clock": (0.015, 0.06, 0.44, 0.56),
  "minimap": (0.73, 0.98, 0.85, 0.99),
  "strip": (0.15, 0.55, 0.84, 0.99),
}
out = []; prev = None; i = 0
while True:
    b = proc.stdout.read(W * H)
    if len(b) < W * H: break
    f = np.frombuffer(b, np.uint8).reshape(H, W).astype(np.int16)
    row = {"i": i, "t": pts[i] if i < len(pts) else None, "type": types[i] if i < len(types) else None}
    if prev is not None:
        d = np.abs(f - prev) > 16
        for k, (y0, y1, x0, x1) in R.items():
            row[k] = int(d[int(H*y0):int(H*y1), int(W*x0):int(W*x1)].sum())
    out.append(row); prev = f; i += 1
json.dump(out, open(OUT, "w"))
print(len(out))
