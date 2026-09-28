"""Render the complete 500-icon atlas at formal HUD and enlarged sizes."""

from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tmp" / "moba-skill-talent-owner-review"
BASE = "http://127.0.0.1:5173/ESMO-/"


def sheet_html(sheet: int, heroes: list[dict], size: int, height: int, label: str) -> str:
    rows = []
    for hero in heroes:
        cells = "".join(
            f'<div class="cell"><img src="{BASE}assets/skill-icons/v1/{hero["id"]}/{slot.lower()}.svg" '
            f'width="{size}" height="{height}" alt="{hero["name"]} {slot}"><small>{slot}</small>'
            f'<em>{hero["skills"][slot]}</em></div>' for slot in "PQWER"
        )
        rows.append(f'<section><h2>{hero["name"]}<small>{hero["id"]} · {hero["arch"]} · {hero["lane"]}</small></h2>{cells}</section>')
    return f"""<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>ESMO {label}</title>
    <style>
      *{{box-sizing:border-box}}body{{margin:0;padding:18px;background:#07111e;color:#f5efdf;font:13px/1.25 'Segoe UI','Microsoft JhengHei',sans-serif}}
      h1{{margin:0 0 10px;color:#f3c969;font-size:20px}}section{{display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid #27374d}}
      h2{{width:235px;flex:0 0 235px;margin:0;font-size:14px;color:#fff}}h2 small{{display:block;margin-top:3px;color:#93a8bd;font-size:10px;font-weight:400}}
      .cell{{display:grid;justify-items:center;gap:2px;width:{max(size + 18, 72)}px;text-align:center}}img{{display:block;border:1px solid #607089;border-radius:6px;background:#07111e;object-fit:cover}}
      .cell small{{font:700 10px Consolas,monospace;color:#d5e1ee}}.cell em{{width:{max(size + 12, 66)}px;color:#f1d27d;font-size:9px;font-style:normal;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
    </style><body><h1>{label} · {sheet + 1}/4 · 25 heroes · P/Q/W/E/R</h1>{''.join(rows)}</body></html>"""


def compose(paths: list[Path], output: Path) -> None:
    images = [Image.open(path).convert("RGB") for path in paths]
    width = max(image.width for image in images)
    height = max(image.height for image in images)
    canvas = Image.new("RGB", (width * 2, height * 2), "#07111e")
    for index, image in enumerate(images):
        canvas.paste(image, ((index % 2) * width, (index // 2) * height))
    canvas.save(output, optimize=True)
    for image in images:
        image.close()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page.goto(BASE, wait_until="networkidle", timeout=90000)
        heroes = page.evaluate("""async () => {
          const { CHAMPIONS_100 } = await import('/ESMO-/src/data/heroDatabase.js');
          return CHAMPIONS_100.map(hero => ({id: hero.id, name: hero.zh, arch: hero.arch, lane: hero.lane,
            skills: Object.fromEntries(Object.entries(hero.skills).map(([slot, skill]) => [slot, skill.name]))}));
        }""")
        if len(heroes) != 100:
            raise SystemExit(f"expected 100 heroes, got {len(heroes)}")
        formal_paths = []
        enlarged_paths = []
        for sheet in range(4):
            chunk = heroes[sheet * 25:(sheet + 1) * 25]
            page.set_content(sheet_html(sheet, chunk, 42, 44, "Battle HUD Final Atlas · 42×44px"), wait_until="load")
            page.wait_for_function("[...document.images].every((img) => img.complete && img.naturalWidth > 0)", timeout=60000)
            formal = OUT / f"icon-atlas-final-hud-42x44-{sheet + 1:02d}.png"
            page.screenshot(path=str(formal), full_page=True)
            formal_paths.append(formal)
            page.set_content(sheet_html(sheet, chunk, 112, 112, "Battle HUD Final Atlas · enlarged 112×112px"), wait_until="load")
            page.wait_for_function("[...document.images].every((img) => img.complete && img.naturalWidth > 0)", timeout=60000)
            enlarged = OUT / f"icon-atlas-final-enlarged-{sheet + 1:02d}.png"
            page.screenshot(path=str(enlarged), full_page=True)
            enlarged_paths.append(enlarged)
        browser.close()
    compose(formal_paths, OUT / "icon-atlas-final-500-hud-42x44.png")
    compose(enlarged_paths, OUT / "icon-atlas-final-500-enlarged.png")
    print(f"PASS full final atlas: {OUT / 'icon-atlas-final-500-hud-42x44.png'}")
    print(f"PASS full enlarged atlas: {OUT / 'icon-atlas-final-500-enlarged.png'}")


if __name__ == "__main__":
    main()
