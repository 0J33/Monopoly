#!/usr/bin/env python3
"""Render the link-preview card. 1200x630, the site's own icon and palette.

Run from anywhere:  python3 assets/make-og.py
Needs Pillow and rsvg-convert. Writes client/public/og.png.
"""
import os, subprocess, tempfile
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Palette is theme.css: --bg, --surface, --gold, --text, --text-3.
CARD = dict(out="client/public/og.png", svg="client/public/favicon-v4.svg",
            bg="#0c1210", panel="#15201a", accent="#f6c445", ink="#eef2ec", dim="#869382",
            title="monopoly.", sub="board game",
            lines=["Full-rules Monopoly to play online with friends",
                   "auctions · trades · houses · mortgages · custom boards"])

W, H = 1200, 630
LEFT, INSET = 110, 56

def font(size, bold=False):
    for path in ("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf" if bold else
                 "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
                 "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf"):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()

c = CARD
im = Image.new("RGB", (W, H), c["bg"])
d = ImageDraw.Draw(im)
# a faint grid, the same texture the other ojee.net cards use
for x in range(0, W, 40):
    d.line([(x, 0), (x, H)], fill=c["panel"], width=1)
for y in range(0, H, 40):
    d.line([(0, y), (W, y)], fill=c["panel"], width=1)
d.rectangle([INSET, INSET, W - INSET, H - INSET], outline=c["accent"], width=2)

with tempfile.TemporaryDirectory() as tmp:
    png = os.path.join(tmp, "glyph.png")
    subprocess.run(["rsvg-convert", "-w", "150", "-h", "150",
                    os.path.join(ROOT, c["svg"]), "-o", png], check=True)
    glyph = Image.open(png).convert("RGBA")
    im.paste(glyph, (LEFT, 150), glyph)

# Title at 84px, shrunk until title + sub-word clear the frame with margin.
size = 84
while size > 40:
    tw = d.textlength(c["title"], font=font(size, True))
    sw = d.textlength(c["sub"], font=font(40))
    if LEFT + tw + 16 + sw <= W - INSET - 54:
        break
    size -= 2
d.text((LEFT, 340 + (84 - size)), c["title"], font=font(size, True), fill=c["ink"])
d.text((LEFT + tw + 16, 372), c["sub"], font=font(40), fill=c["accent"])
for i, line in enumerate(c["lines"]):
    d.text((LEFT + 2, 442 + i * 40), line, font=font(26), fill=c["dim"] if i else c["ink"])
d.text((LEFT + 2, H - 88), "ojee.net", font=font(22), fill=c["accent"])

out = os.path.join(ROOT, c["out"])
im.save(out)
print("wrote", out, "title size", size)
