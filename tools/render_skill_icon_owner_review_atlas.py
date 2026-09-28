"""Render the selected Owner Review icon pairs at the real HUD size and enlarged."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "tmp" / "moba-skill-talent-owner-review"
RANKING = REVIEW / "owner-review-ranking.json"
FORMAL = REVIEW / "owner-review-atlas-formal-hud.png"
ENLARGED = REVIEW / "owner-review-atlas-enlarged.png"
HTML_OUT = REVIEW / "owner-review-atlas.html"


def svg_data(path: Path) -> str:
    payload = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/svg+xml;base64,{payload}"


def esc(value: object) -> str:
    return html.escape(str(value if value is not None else "—"), quote=True)


def pair_card(row: dict, size: int, height: int, enlarged: bool = False) -> str:
    category = row["category"]
    a = row["a"]
    b = row["b"]
    a_svg = svg_data(ROOT / a["asset"])
    b_svg = svg_data(ROOT / b["asset"])
    detail = (
        f"距離 {row['distance']} · scene {row['scene']['a']} / {row['scene']['b']} · "
        f"{'同' if row['sameSlot'] else '異'}槽 · "
        f"{'同' if row['sameLane'] else '異'} lane · "
        f"{'同' if row['sameArch'] else '異'} role"
    )
    reason = "、".join(row["reasons"][:4])
    return f"""
      <article class="pair-card category-{category} {'enlarged' if enlarged else 'formal'}">
        <header><strong>#{row['group']} · {category}</strong><span>cluster {row['cluster']} · risk {row['riskScore']}</span></header>
        <p class="metric">{esc(detail)}</p>
        <div class="pair">
          <div class="icon-side"><img src="{a_svg}" width="{size}" height="{height}" alt="{esc(a['hero'])} {esc(a['slot'])} {esc(a['name'])}">
            <b>{esc(a['hero'])} · {esc(a['slot'])}</b><small>{esc(a['name'])}</small><em>{esc(a['lane'])} · {esc(a['role'])}</em></div>
          <div class="vs">VS</div>
          <div class="icon-side"><img src="{b_svg}" width="{size}" height="{height}" alt="{esc(b['hero'])} {esc(b['slot'])} {esc(b['name'])}">
            <b>{esc(b['hero'])} · {esc(b['slot'])}</b><small>{esc(b['name'])}</small><em>{esc(b['lane'])} · {esc(b['role'])}</em></div>
        </div>
        <p class="reason">{esc(reason)}</p>
      </article>
    """


def page_html(rows: list[dict], mode: str) -> str:
    if mode == "formal":
        title = "Owner Review · 正式 Battle HUD 尺寸（桌機 42×44px；手機 30×40px）"
        subtitle = "每組使用桌機 Battle HUD .observer-ability 實際 42×44px；A=建議重做、B=合理共享 archetype、C=數學近似但實際可辨。"
        cards = "".join(pair_card(row, 42, 44) for row in rows)
        layout = "formal-grid"
    else:
        title = "Owner Review · 放大比較（128×128px）"
        subtitle = "同一批 40 組候選的放大比較；放大只為 Owner 判讀，不代表實際 HUD 尺寸。"
        cards = "".join(pair_card(row, 128, 128, enlarged=True) for row in rows)
        layout = "enlarged-grid"
    counts = {key: sum(1 for row in rows if row["category"] == key) for key in "ABC"}
    return f"""<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>{html.escape(title)}</title>
    <style>
      *{{box-sizing:border-box}} body{{margin:0;padding:24px;background:#07111e;color:#f5efdf;font:14px/1.4 'Segoe UI','Microsoft JhengHei',sans-serif}}
      h1{{margin:0;color:#f3c969;font-size:24px}} .subtitle{{margin:6px 0 16px;color:#aebdce}}
      .legend{{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 18px}} .legend span{{padding:5px 10px;border-radius:999px;font-weight:800}}
      .legend .A{{background:#7f1d1d;color:#fecaca}} .legend .B{{background:#713f12;color:#fde68a}} .legend .C{{background:#14532d;color:#bbf7d0}}
      .{layout}{{display:grid;grid-template-columns:{'repeat(4,minmax(280px,1fr))' if mode == 'formal' else 'repeat(2,minmax(470px,1fr))'};gap:12px;align-items:start}}
      .pair-card{{background:#101e2e;border:1px solid #31445d;border-radius:10px;padding:10px;break-inside:avoid}}
      .pair-card.category-A{{border-color:#dc4545}} .pair-card.category-B{{border-color:#d69e2e}} .pair-card.category-C{{border-color:#36a269}}
      header{{display:flex;justify-content:space-between;gap:8px;align-items:baseline}} header strong{{font-size:16px}} header span{{color:#9fb0c4;font-size:11px}}
      .category-A header strong{{color:#ff9b9b}} .category-B header strong{{color:#f7d36b}} .category-C header strong{{color:#82e2ac}}
      .metric,.reason{{margin:5px 0;color:#b9c7d7;font-size:11px;min-height:30px}} .reason{{color:#d8e4f0;min-height:45px}}
      .pair{{display:flex;justify-content:center;align-items:center;gap:10px}} .icon-side{{display:grid;justify-items:center;text-align:center;min-width:{'112px' if mode == 'formal' else '210px'}}}
      img{{display:block;object-fit:cover;border-radius:6px;border:1px solid #607089;background:#07111e;image-rendering:auto}}
      .icon-side b{{margin-top:5px;color:#fff;font-size:12px}} .icon-side small{{max-width:190px;color:#f3d27b;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}} .icon-side em{{color:#99acc1;font-size:10px;font-style:normal}}
      .vs{{color:#8294a8;font:700 11px Consolas,monospace}}
    </style><body><h1>{html.escape(title)}</h1><p class="subtitle">{html.escape(subtitle)}</p>
    <div class="legend"><span class="A">A 建議重做：{counts['A']}</span><span class="B">B 合理共享：{counts['B']}</span><span class="C">C 實際可辨：{counts['C']}</span></div>
    <main class="{layout}">{cards}</main></body></html>"""


def main() -> None:
    data = json.loads(RANKING.read_text(encoding="utf-8"))
    rows = data["items"]
    REVIEW.mkdir(parents=True, exist_ok=True)
    formal_html = page_html(rows, "formal")
    enlarged_html = page_html(rows, "enlarged")
    HTML_OUT.write_text(
        "<!doctype html><meta charset='utf-8'><title>Owner Review Atlas</title>"
        "<p><a href='#formal'>正式 HUD</a> · <a href='#enlarged'>放大比較</a></p>"
        "<h1 id='formal'>正式 HUD</h1>" + formal_html.split("<body>", 1)[1].split("</body>", 1)[0]
        + "<hr><h1 id='enlarged'>放大比較</h1>"
        + enlarged_html.split("<body>", 1)[1].split("</body>", 1)[0]
        + "</html>",
        encoding="utf-8",
    )
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        for mode, out_path in (("formal", FORMAL), ("enlarged", ENLARGED)):
            page.set_content(page_html(rows, mode), wait_until="load")
            page.wait_for_function("[...document.images].every((img) => img.complete && img.naturalWidth > 0)", timeout=60000)
            page.screenshot(path=str(out_path), full_page=True)
        browser.close()
    print(json.dumps({
        "selectedGroups": len(rows),
        "formalHud": str(FORMAL),
        "enlarged": str(ENLARGED),
        "html": str(HTML_OUT),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
