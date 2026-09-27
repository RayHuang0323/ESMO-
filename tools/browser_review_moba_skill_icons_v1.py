"""Render a representative 10-hero × P/Q/W/E/R icon sheet for Owner Review."""
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path('tmp/moba-skill-talent-owner-review/icon-gallery.png')
out.parent.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 930, 'height': 1380}, device_scale_factor=1)
    page.goto('http://127.0.0.1:5173/ESMO-/', wait_until='domcontentloaded', timeout=90000)
    heroes = page.evaluate("""async () => {
      const { heroById } = await import('/ESMO-/src/data/heroDatabase.js');
      return ['ironclad','cinderfist','bingshuang','leiting','sting','shengming','dadi','gambler','hanbing','chichuan']
        .map(id => ({ id, name: heroById(id)?.zh ?? id }));
    }""")
    rows = []
    for hero in heroes:
        cells = ''.join(f'<div><img src="http://127.0.0.1:5173/ESMO-/assets/skill-icons/v1/{hero["id"]}/{slot.lower()}.svg"><small>{slot}</small></div>' for slot in 'PQWER')
        rows.append(f'<section><h2>{hero["name"]} <em>{hero["id"]}</em></h2>{cells}</section>')
    page.set_content('''<html><head><style>
      *{box-sizing:border-box}body{margin:0;padding:22px;background:#07111e;color:#f5efdf;font:16px sans-serif}
      h1{margin:0 0 18px;color:#e9bf64;font-size:24px}h2{width:190px;font-size:17px;margin:0}
      em{display:block;color:#8294a8;font-size:11px;font-style:normal}
      section{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #27374d}
      section div{display:grid;justify-items:center;gap:2px}img{width:110px;height:110px;border-radius:10px}
      small{font-size:12px;color:#cbd5e1}
    </style></head><body><h1>Hero Skill Icons v1 · 10 位代表英雄 × P/Q/W/E/R</h1>'''+''.join(rows)+'</body></html>')
    page.wait_for_function("[...document.images].every(img => img.complete && img.naturalWidth > 0)", timeout=30000)
    page.screenshot(path=str(out), full_page=True)
    print(f'PASS 50/50 gallery icons: {out}')
    browser.close()
