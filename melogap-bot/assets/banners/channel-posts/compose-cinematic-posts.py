#!/usr/bin/env python3
"""Overlay exact Persian copy on cinematic Dordoriya channel bases (1080 square)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[3]
FONTS = (
    ROOT
    / "assets"
    / "banners"
    / "channel-posts"
    / "earn-teaser-pro"
    / "fonts"
)
OUT = ROOT / "assets" / "banners" / "channel-posts"
BASES = Path("/opt/cursor/artifacts/assets")
LOGO = (
    ROOT
    / "assets"
    / "banners"
    / "channel-posts"
    / "earn-teaser-pro"
    / "frames"
    / "logo_ref.png"
)

W = H = 1080
WHITE = (255, 255, 255, 255)
SOFT = (236, 228, 255, 235)
MUTED = (210, 198, 230, 220)
PINK = (255, 120, 190, 255)


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


def rtl(text: str) -> dict:
    if any("\u0600" <= c <= "\u06FF" for c in text):
        return {"direction": "rtl", "language": "fa", "anchor": "ra"}
    return {"anchor": "la"}


def text_w(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont) -> int:
    kw = {k: v for k, v in rtl(text).items() if k != "anchor"}
    box = draw.textbbox((0, 0), text, font=fnt, **kw)
    return box[2] - box[0]


def draw_text(draw, xy, text, fnt, fill):
    x, y = xy
    kw = rtl(text)
    draw.text((x + 2, y + 3), text, font=fnt, fill=(0, 0, 0, 170), **kw)
    draw.text((x, y), text, font=fnt, fill=fill, **kw)


def left_scrim(img: Image.Image) -> Image.Image:
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    px = layer.load()
    for x in range(W):
        # darker on the left so Persian type stays readable
        t = max(0.0, 1 - x / 720)
        a = int(210 * (t**1.15))
        for y in range(H):
            px[x, y] = (6, 4, 18, a)
    return Image.alpha_composite(img, layer)


def fit(src: Image.Image) -> Image.Image:
    sw, sh = src.size
    scale = max(W / sw, H / sh)
    nw, nh = int(sw * scale + 0.5), int(sh * scale + 0.5)
    img = src.resize((nw, nh), Image.Resampling.LANCZOS)
    left = max(0, nw - W - 40)
    top = (nh - H) // 2
    return img.crop((left, top, left + W, top + H)).convert("RGBA")


def pill(draw, box, fill, radius=28):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def compose(base_name: str, out_name: str, spec: dict) -> None:
    base = fit(Image.open(BASES / base_name).convert("RGB"))
    base = left_scrim(base)
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # small brand mark
    if LOGO.is_file():
        logo = Image.open(LOGO).convert("RGBA").resize((78, 78), Image.Resampling.LANCZOS)
        overlay.alpha_composite(logo, (46, 48))

    f_brand = font("Vazirmatn-SemiBold.ttf", 28)
    draw_text(draw, (150, 62), "دوردوریا", f_brand, SOFT)

    f_h = font("Vazirmatn-Bold.ttf", 62)
    draw_text(draw, (620, 175), spec["headline"], f_h, WHITE)

    f_sub = font("Vazirmatn-Medium.ttf", 30)
    y = 270
    for line in spec["subs"]:
        draw_text(draw, (620, y), line, f_sub, SOFT)
        y += 48

    f_feat = font("Vazirmatn-Medium.ttf", 26)
    y = 430
    for line in spec["features"]:
        draw.ellipse((588, y + 8, 610, y + 30), fill=(180, 90, 255, 230))
        draw_text(draw, (570, y), line, f_feat, WHITE)
        y += 58

    # CTA
    cta = spec["cta"]
    f_cta = font("Vazirmatn-Bold.ttf", 30)
    tw = text_w(draw, cta, f_cta)
    btn_r = 640
    btn_l = btn_r - tw - 72
    btn_t, btn_b = 760, 832
    grad = Image.new("RGBA", (btn_r - btn_l, btn_b - btn_t), (0, 0, 0, 0))
    gp = grad.load()
    gw = btn_r - btn_l
    for x in range(gw):
        u = x / max(gw - 1, 1)
        r = int(90 + 150 * u)
        g = int(40 + 30 * (1 - u))
        b = int(220 - 40 * u)
        for yy in range(btn_b - btn_t):
            gp[x, yy] = (r, g, b, 245)
    mask = Image.new("L", grad.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, gw - 1, btn_b - btn_t - 1), 28, fill=255)
    grad.putalpha(mask)
    overlay.alpha_composite(grad, (btn_l, btn_t))
    draw_text(draw, (btn_r - 28, btn_t + 18), cta, f_cta, WHITE)

    f_en = font("Vazirmatn-SemiBold.ttf", 22)
    f_en2 = font("Vazirmatn-Regular.ttf", 18)
    draw.text((48, 980), "DORDOORIYA", font=f_en, fill=(255, 255, 255, 230))
    draw.text(
        (48, 1012),
        "REAL PEOPLE  •  REAL CONNECTIONS",
        font=f_en2,
        fill=(220, 210, 240, 210),
    )

    out = Image.alpha_composite(base, overlay).convert("RGB")
    out = out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=80, threshold=2))
    dest = OUT / out_name
    out.save(dest, "JPEG", quality=92, optimize=True)
    print("wrote", dest, dest.stat().st_size)


def main() -> None:
    compose(
        "dordoriya-night-base.png",
        "channel-saturday-night-cinematic.jpg",
        {
            "headline": "امشب آشنایی تازه؟",
            "subs": [
                "با آدم‌های واقعی آشنا شو...",
                "دور از قضاوت، نزدیک به احساس",
            ],
            "features": [
                "کاملاً امن و ناشناس",
                "دورهمی‌های واقعی و جذاب",
                "آشنایی بر اساس علایق مشترک",
            ],
            "cta": "همین حالا وارد شو ←",
        },
    )
    compose(
        "dordoriya-nearby-base.png",
        "channel-nearby-cinematic.jpg",
        {
            "headline": "اطرافت کی آنلاینه؟",
            "subs": [
                "آدم‌های واقعی، همین اطراف",
                "نزدیک، بدون لو رفتن موقعیت",
            ],
            "features": [
                "جستجو تا ۱۰۰ کیلومتر",
                "چت ناشناس، دایرکت و ویس",
                "فضای امن و خصوصی",
            ],
            "cta": "نزدیک‌ها رو ببین ←",
        },
    )


if __name__ == "__main__":
    main()
