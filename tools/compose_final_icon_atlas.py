"""Compose the four 25-hero sheets into one complete 500-icon atlas."""
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw

root = Path("tmp/moba-skill-talent-owner-review")
inputs = [root / f"icon-atlas-{index:02d}.png" for index in range(1, 5)]
images = [Image.open(path).convert("RGB") for path in inputs]
cell_width = max(image.width for image in images)
cell_height = max(image.height for image in images)
canvas = Image.new("RGB", (cell_width * 2, cell_height * 2), "#07111e")
for index, image in enumerate(images):
    x = (index % 2) * cell_width
    y = (index // 2) * cell_height
    canvas.paste(image, (x, y))
output = root / "icon-atlas-final-500.png"
canvas.save(output, optimize=True)
print(f"PASS final 500 icon atlas: {output} ({canvas.width}x{canvas.height})")
