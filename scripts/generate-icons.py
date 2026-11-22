"""Generate the PWA icons (no external image assets needed).

    python3 scripts/generate-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

DARK = (14, 21, 18, 255)
MINT = (168, 230, 196, 255)
CORAL = (226, 98, 60, 255)


def draw_icon(size: int, maskable: bool = False) -> Image.Image:
    img = Image.new("RGBA", (size, size), DARK)
    if not maskable:
        # Rounded square for regular icons.
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=size // 5, fill=255)
        bg = Image.new("RGBA", (size, size), DARK)
        img.paste(bg, (0, 0), mask)

    d = ImageDraw.Draw(img)
    s = size / 512.0
    scale = 0.82 if maskable else 1.0

    # Track: an open circular loop.
    box = (int(118 * s * scale + size * (1 - scale) / 2),
           int(118 * s * scale + size * (1 - scale) / 2),
           int(394 * s * scale + size * (1 - scale) / 2),
           int(394 * s * scale + size * (1 - scale) / 2))
    width = max(2, int(38 * s * scale))
    d.arc(box, start=55, end=390, fill=MINT, width=width)

    # Runner dot at the start of the loop + a motion trail.
    cx = box[2] - int(12 * s * scale)
    cy = box[1] + int(70 * s * scale)
    r = int(46 * s * scale)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=CORAL)

    # A short "pace" line inside the loop.
    x0 = int(196 * s * scale + size * (1 - scale) / 2)
    y0 = int(268 * s * scale + size * (1 - scale) / 2)
    x1 = int(322 * s * scale + size * (1 - scale) / 2)
    d.line((x0, y0, x1, y0), fill=MINT, width=max(2, int(24 * s * scale)))
    d.ellipse((x1 - int(14 * s * scale), y0 - int(14 * s * scale),
               x1 + int(14 * s * scale), y0 + int(14 * s * scale)), fill=MINT)
    return img


for filename, size, maskable in [
    ("icon-192.png", 192, False),
    ("icon-512.png", 512, False),
    ("icon-maskable-512.png", 512, True),
]:
    draw_icon(size, maskable).save(OUT / filename)
    print(f"wrote {OUT / filename}")

(ROOT / "public" / "favicon.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
    '<rect width="512" height="512" rx="104" fill="#0e1512"/>'
    '<path d="M118 256a138 138 0 1 1 276 0" fill="none" stroke="#a8e6c4" stroke-width="38" '
    'stroke-linecap="round" transform="rotate(35 256 256)"/>'
    '<circle cx="382" cy="188" r="46" fill="#e2623c"/>'
    '<path d="M196 268h126" stroke="#a8e6c4" stroke-width="24" stroke-linecap="round"/>'
    '</svg>\n',
    encoding="utf-8",
)
print("wrote", ROOT / "public" / "favicon.svg")
