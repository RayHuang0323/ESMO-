"""Render the high-risk icon before/after atlas from the 17 targeted SVGs."""
import base64
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tmp/moba-skill-talent-owner-review/icon-refinement-before-after-atlas.png"
BEFORE_ROOT = Path(os.environ.get("TEMP", "C:/Windows/Temp")) / "esmo-icon-before"
TARGETS = [
    ("hexweave:E", "shield/thread overlap"),
    ("rongyan:Q", "fire fist / dragon claw overlap"),
    ("luminary:W", "star ward / weave ward overlap"),
    ("mantra:E", "linked shield / radiant shield overlap"),
    ("yueying:P", "crescent passive / phantom passive overlap"),
    ("shiguang:Q", "time lock / soul-fate bind overlap"),
    ("suishan:E", "mountain grasp / fate tether overlap"),
    ("mingyun2:E", "fate tether / soul bind overlap"),
    ("maestro:E", "sonic mark / moon mark overlap"),
    ("hunpo:P", "soul passive / ghostfire passive overlap"),
    ("lieyan:R", "meteor fire / ghostfire ultimate overlap"),
    ("leiming:R", "thunder pillar / lightning hunter overlap"),
    ("xingchen:P", "constellation passive / astral passive overlap"),
    ("cinderfist:Q", "fire fist / dragon claw overlap"),
    ("stoneguard:Q", "stone punch cluster overlap"),
    ("dianguang:Q", "lightning slash cluster overlap"),
    ("sting:P", "venom passive / silk passive overlap"),
]


def data_uri(path: Path) -> str:
    return "data:image/svg+xml;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


cards = []
for key, reason in TARGETS:
    hero, slot = key.split(":")
    rel = Path(hero) / f"{slot.lower()}.svg"
    before = BEFORE_ROOT / rel
    after = ROOT / "public/assets/skill-icons/v1" / rel
    if not before.exists():
        raise SystemExit(f"missing before asset: {before}")
    if not after.exists():
        raise SystemExit(f"missing after asset: {after}")
    cards.append(f"""
      <article><h2>{key}</h2><p>{reason}</p>
        <div class="pair"><figure><img src="{data_uri(before)}"><figcaption>before</figcaption></figure>
        <figure><img src="{data_uri(after)}"><figcaption>after</figcaption></figure></div>
      </article>
    """)

OUT.parent.mkdir(parents=True, exist_ok=True)
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1200, "height": 900}, device_scale_factor=1)
    page.set_content("""<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;padding:24px;background:#07111e;color:#f5efdf;font:14px/1.4 system-ui,sans-serif}
      h1{margin:0 0 8px;color:#e9bf64;font-size:24px}header{margin-bottom:18px;color:#b8c5d4}
      main{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}article{padding:12px;border:1px solid #30465a;border-radius:10px;background:#0d1b2a}
      h2{margin:0;color:#f3d38a;font-size:17px}p{height:38px;margin:5px 0 10px;color:#aebdca;font-size:12px}
      .pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}figure{margin:0;text-align:center}img{width:150px;height:150px;border-radius:10px;border:1px solid #3b5067;background:#07111e}figcaption{margin-top:3px;color:#c5d0dc;font-size:12px}
    </style></head><body><h1>Skill Icon Final Closure：高風險 before / after</h1>
    <header>17 張局部 refinement；差異從中央輪廓、主符號、構圖、朝向、留白與衝擊語意中至少兩項改善。</header><main>""" + "".join(cards) + "</main></body></html>")
    page.wait_for_function("[...document.images].every(img => img.complete && img.naturalWidth > 0)", timeout=30000)
    page.screenshot(path=str(OUT), full_page=True)
    browser.close()
print(f"PASS 17/17 refinement atlas: {OUT}")
