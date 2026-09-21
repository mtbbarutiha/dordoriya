#!/usr/bin/env python3
"""Dordoriya channel banner composer v2 — CTR-tuned layout.

Changes vs v1: hero headline (large, max 2 lines), one short promise line,
three short chips instead of long feature sentences, a timing/urgency badge,
and a brighter glowing CTA pill. Face stays uncovered on the right.

Persian is drawn with Vazirmatn via Pillow RTL — the image model never writes text.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[3]
FONTS = ROOT / "assets/banners/channel-posts/earn-teaser-pro/fonts"
OUT = ROOT / "assets/banners/channel-posts"
LOGO = ROOT / "assets/banners/channel-posts/earn-teaser-pro/frames/logo_ref.png"

W = H = 1080
TEXT_RIGHT = 596          # right edge of the RTL text column
TEXT_MAX = 500            # wrap width — keeps copy off the subject and mascot
WHITE = (255, 255, 255, 255)
SOFT = (232, 224, 252, 240)
CHIP_TEXT = (245, 240, 255, 250)
BADGE_BG = (255, 78, 160, 235)


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


def is_fa(text: str) -> bool:
    return any("\u0600" <= c <= "\u06FF" for c in text)


def rtl(text: str) -> dict:
    return {"direction": "rtl", "language": "fa"} if is_fa(text) else {}


def measure(draw: ImageDraw.ImageDraw, text: str, fnt) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=fnt, **rtl(text))
    return box[2] - box[0], box[3] - box[1]


def draw_rtl(draw, right_x: int, y: int, text: str, fnt, fill, shadow=True):
    kw = rtl(text)
    anchor = "ra" if is_fa(text) else "la"
    if shadow:
        draw.text((right_x + 3, y + 4), text, font=fnt, fill=(0, 0, 0, 185), anchor=anchor, **kw)
        draw.text((right_x + 1, y + 2), text, font=fnt, fill=(0, 0, 0, 120), anchor=anchor, **kw)
    draw.text((right_x, y), text, font=fnt, fill=fill, anchor=anchor, **kw)


def wrap(draw, text: str, fnt, max_w: int) -> list[str]:
    words = text.split(" ")
    lines: list[str] = []
    cur = ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if measure(draw, trial, fnt)[0] <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def fit(src: Image.Image) -> Image.Image:
    """Cover-crop keeping the right side (subject) in frame."""
    sw, sh = src.size
    scale = max(W / sw, H / sh)
    nw, nh = int(sw * scale + 0.5), int(sh * scale + 0.5)
    img = src.resize((nw, nh), Image.Resampling.LANCZOS)
    left = max(0, nw - W - 20)
    top = (nh - H) // 2
    return img.crop((left, top, left + W, top + H)).convert("RGBA")


def scrim(img: Image.Image) -> Image.Image:
    """Flat dark plate under the text column, then a soft falloff toward the subject.

    A pure linear ramp left too little contrast at the right edge of the copy,
    so the headline sat on top of the bright mascot.
    """
    flat_to, fade_to, peak = 540, 790, 236
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    px = layer.load()
    for x in range(W):
        if x <= flat_to:
            a = peak
        elif x < fade_to:
            t = 1 - (x - flat_to) / (fade_to - flat_to)
            a = int(peak * (t**1.5))
        else:
            a = 0
        for y in range(H):
            px[x, y] = (5, 3, 16, a)
    out = Image.alpha_composite(img, layer)
    # gentle bottom fade so the brand lockup stays legible
    bottom = Image.new("RGBA", (W, 200), (0, 0, 0, 0))
    bp = bottom.load()
    for y in range(200):
        a = int(170 * (y / 199) ** 1.2)
        for x in range(W):
            bp[x, y] = (5, 3, 16, a)
    out.alpha_composite(bottom, (0, H - 200))
    return out


def glow_pill(size: tuple[int, int], radius: int, colors: tuple) -> Image.Image:
    w, h = size
    grad = Image.new("RGBA", size, (0, 0, 0, 0))
    gp = grad.load()
    (r1, g1, b1), (r2, g2, b2) = colors
    for x in range(w):
        u = x / max(w - 1, 1)
        r = int(r1 + (r2 - r1) * u)
        g = int(g1 + (g2 - g1) * u)
        b = int(b1 + (b2 - b1) * u)
        for y in range(h):
            gp[x, y] = (r, g, b, 252)
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius, fill=255)
    grad.putalpha(mask)
    return grad


def compose(spec: dict) -> Path:
    base = scrim(fit(Image.open(spec["base"]).convert("RGB")))
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # brand lockup, top
    if LOGO.is_file():
        logo = Image.open(LOGO).convert("RGBA").resize((66, 66), Image.Resampling.LANCZOS)
        overlay.alpha_composite(logo, (46, 46))
    draw_rtl(draw, 200, 58, "دوردوریا", font("Vazirmatn-SemiBold.ttf", 27), SOFT)

    y = 150

    # urgency / timing badge
    badge = spec.get("badge")
    if badge:
        f_badge = font("Vazirmatn-Bold.ttf", 25)
        bw, bh = measure(draw, badge, f_badge)
        pw, ph = bw + 44, bh + 26
        pill = glow_pill((pw, ph), ph // 2, ((255, 60, 150), (168, 60, 255)))
        overlay.alpha_composite(pill, (TEXT_RIGHT - pw, y))
        draw_rtl(draw, TEXT_RIGHT - 22, y + 11, badge, f_badge, WHITE, shadow=False)
        y += ph + 26

    # hero headline
    f_h = font("Vazirmatn-Bold.ttf", spec.get("headline_size", 66))
    for line in wrap(draw, spec["headline"], f_h, TEXT_MAX):
        draw_rtl(draw, TEXT_RIGHT, y, line, f_h, WHITE)
        y += int(f_h.size * 1.28)
    y += 14

    # single promise line
    if spec.get("sub"):
        f_s = font("Vazirmatn-Medium.ttf", spec.get("sub_size", 33))
        for line in wrap(draw, spec["sub"], f_s, TEXT_MAX):
            draw_rtl(draw, TEXT_RIGHT, y, line, f_s, SOFT)
            y += int(f_s.size * 1.42)
    y += 18

    # chips — max three, short
    chips = spec.get("chips", [])[:3]
    if chips:
        f_c = font("Vazirmatn-Medium.ttf", 26)
        cx = TEXT_RIGHT
        for chip in chips:
            cw, ch = measure(draw, chip, f_c)
            pw, ph = cw + 38, ch + 24
            if cx - pw < 70:  # wrap to a second row
                cx = TEXT_RIGHT
                y += ph + 14
            box = (cx - pw, y, cx - 1, y + ph - 1)
            draw.rounded_rectangle(box, radius=ph // 2, fill=(120, 70, 210, 105),
                                   outline=(190, 150, 255, 170), width=2)
            draw_rtl(draw, cx - 19, y + 10, chip, f_c, CHIP_TEXT, shadow=False)
            cx -= pw + 14
        y += ph + 34

    # CTA pill with outer glow
    cta = spec["cta"]
    f_cta = font("Vazirmatn-Bold.ttf", 34)
    tw, th = measure(draw, cta, f_cta)
    # pill padding: 34 right of text, then 18 gap, 16 arrow, 26 left edge
    pw, ph = tw + 94, th + 44
    cta_y = max(y + 12, 760)
    cta_x = TEXT_RIGHT - pw
    ImageDraw.Draw(glow).rounded_rectangle(
        (cta_x - 16, cta_y - 16, cta_x + pw + 16, cta_y + ph + 16),
        radius=(ph + 32) // 2,
        fill=(190, 60, 230, 120),
    )
    pill = glow_pill((pw, ph), ph // 2, ((120, 50, 235), (255, 70, 150)))
    overlay.alpha_composite(pill, (cta_x, cta_y))
    draw_rtl(draw, TEXT_RIGHT - 34, cta_y + 18, cta, f_cta, WHITE, shadow=False)
    # Vazirmatn has no arrow glyphs, so draw the left-pointing cue as a polygon
    ax, ay = cta_x + 26, cta_y + ph // 2
    draw.polygon([(ax, ay), (ax + 16, ay - 13), (ax + 16, ay + 13)], fill=WHITE)

    # bottom brand lockup
    draw.text((48, 972), "DORDOORIYA", font=font("Vazirmatn-SemiBold.ttf", 23),
              fill=(255, 255, 255, 235))
    draw.text((48, 1006), "REAL PEOPLE  •  REAL CONNECTIONS",
              font=font("Vazirmatn-Regular.ttf", 18), fill=(216, 206, 238, 205))

    glow = glow.filter(ImageFilter.GaussianBlur(26))
    out = Image.alpha_composite(base, glow)
    out = Image.alpha_composite(out, overlay).convert("RGB")
    out = out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=85, threshold=2))
    dest = OUT / spec["out"]
    out.save(dest, "JPEG", quality=92, optimize=True)
    print("wrote", dest.name, dest.stat().st_size)
    return dest


def main() -> None:
    specs = json.loads(Path(sys.argv[1]).read_text("utf-8"))
    for spec in specs:
        compose(spec)


if __name__ == "__main__":
    main()
