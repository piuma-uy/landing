"""
Imágenes para compartir (Open Graph / Twitter, 1200x630) de cada página pública (T88).

  python3 scripts/og-images.py <PlayfairDisplay.ttf> <Inter.ttf>

Escribe src/assets/images/og/: inicio.jpg (la foto del hero), envios.jpg, categoria-<id>.jpg y
<producto>.jpg para cada categoría y producto de src/assets/data/catalog.json. scripts/seo.ts las usa
por nombre y tests/seo.test.ts controla que existan y midan 1200x630: un producto nuevo necesita
correr esto otra vez. Las fuentes son las variables de Google Fonts (ofl/playfairdisplay y ofl/inter);
requiere Pillow. No corre en el build: las imágenes van en el repo.

Diseño: fondo, textos y acento con los tokens de src/styles/_tokens.scss; la foto del producto a la
derecha en su proporción 4:5 (sin agrandarla), logo, nombre y una línea de detalle a la izquierda.
JPEG porque WhatsApp, Instagram y Facebook no siempre muestran WebP en la vista previa.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
OUT = SRC / "assets" / "images" / "og"
W, H = 1200, 630

BG = "#fbf8f4"  # --color-bg
TEXT = "#2f2c29"  # --color-text
MUTED = "#6e6862"  # --color-text-muted
PRIMARY = "#b07a5c"  # --color-primary
BORDER = "#e5dcd2"  # --color-border


def font(path, size, weight):
    f = ImageFont.truetype(path, size)
    f.set_variation_by_name(weight)
    return f


def wrap(draw, text, f, width):
    lines, line = [], ""
    for word in text.split():
        candidate = f"{line} {word}".strip()
        if draw.textlength(candidate, font=f) <= width or not line:
            line = candidate
        else:
            lines.append(line)
            line = word
    return lines + [line]


def card(photo, title, detail, heading_font, body_font, out):
    img = Image.new("RGB", (W, H), BG)
    pic = Image.open(SRC / photo).convert("RGB")
    # 4:5 recortada al centro y llevada a 504x630 (las fotos de producto miden 800x1000).
    pw, ph = pic.size
    target = 504 / 630
    if pw / ph > target:
        nw = round(ph * target)
        pic = pic.crop(((pw - nw) // 2, 0, (pw - nw) // 2 + nw, ph))
    else:
        nh = round(pw / target)
        pic = pic.crop((0, (ph - nh) // 2, pw, (ph - nh) // 2 + nh))
    img.paste(pic.resize((504, 630), Image.LANCZOS), (W - 504, 0))
    draw = ImageDraw.Draw(img)
    draw.line([(W - 505, 0), (W - 505, H)], fill=BORDER, width=1)

    logo = Image.open(SRC / "assets/images/logo/logo-piuma-terracota.webp").convert("RGBA")
    logo = logo.resize((200, round(200 * logo.height / logo.width)), Image.LANCZOS)
    img.paste(logo, (72, 64), logo)

    left, width = 72, W - 504 - 72 * 2
    size = 64
    while True:
        f = font(heading_font, size, b"SemiBold")
        lines = wrap(draw, title, f, width)
        if len(lines) <= 3 or size <= 44:
            break
        size -= 4
    small = font(body_font, 28, b"Regular")
    details = wrap(draw, detail, small, width)[:2]
    # Nombre y detalle centrados entre el logo (hasta y=180) y "piuma.uy" (desde y=540).
    block = len(lines) * round(size * 1.18) + len(details) * 42
    y = 180 + (540 - 180 - block) // 2
    for line in lines:
        draw.text((left, y), line, font=f, fill=TEXT)
        y += round(size * 1.18)
    for line in details:
        y += 6
        draw.text((left, y), line, font=small, fill=MUTED)
        y += 36
    draw.text((left, H - 64 - 26), "piuma.uy", font=font(body_font, 26, b"Medium"), fill=PRIMARY)
    img.save(out, "JPEG", quality=82, optimize=True, progressive=True)


def hero(out):
    pic = Image.open(SRC / "assets/images/hero-piuma.webp").convert("RGB")
    pw, ph = pic.size
    nh = round(pw * H / W)
    top = (ph - nh) // 2
    pic.crop((0, top, pw, top + nh)).resize((W, H), Image.LANCZOS).save(
        out, "JPEG", quality=82, optimize=True, progressive=True
    )


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    heading_font, body_font = sys.argv[1:]
    OUT.mkdir(parents=True, exist_ok=True)
    catalog = json.loads((SRC / "assets/data/catalog.json").read_text())
    hero(OUT / "inicio.jpg")
    # El mismo texto que el title de /envios/ (policyTitle con FALLBACK_POLICY).
    card(
        "assets/images/productos/producto-acolchado-pluma-natural-3.webp",
        "Envío gratis en zonas de Montevideo y Canelones",
        "Resto del país, a coordinar por WhatsApp",
        heading_font,
        body_font,
        OUT / "envios.jpg",
    )
    for category in catalog:
        names = [t["name"] for t in category["types"]]
        card(
            category["image"],
            category["name"],
            ", ".join(names[:-1]) + " y " + names[-1] if len(names) > 1 else names[0],
            heading_font,
            body_font,
            OUT / f"categoria-{category['id']}.jpg",
        )
        for t in category["types"]:
            card(
                t["image"],
                t["fullName"],
                t["material"] or category["name"],
                heading_font,
                body_font,
                OUT / f"{t['id']}.jpg",
            )


main()
