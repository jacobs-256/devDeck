#!/usr/bin/env python3
"""Build comparison sheets for the three final icon concepts.

Usage: python3 tools/preview.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
RENDER = ROOT / "render"
OUT = ROOT / "preview"
OUT.mkdir(exist_ok=True)

FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"

CONCEPTS = [
    ("icon-a-module-matrix.png", "A", "模块矩阵", "Module Matrix", "一个工作台，装下所有工具"),
    ("icon-b-devkit-case.png", "B", "开发者工具箱", "Dev Kit", "一只随身工具箱，打开即用"),
    ("icon-c-plugin-piece.png", "C", "插件拼图", "Plugin Piece", "每个插件，都严丝合缝"),
]

W, H = 1440, 760


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size)


def draw_text(d, xy, s, size, fill, anchor="la"):
    d.text(xy, s, font=font(size), fill=fill, anchor=anchor)


def resize(im: Image.Image, size: int) -> Image.Image:
    return im.resize((size, size), Image.LANCZOS)


def sheet(dark: bool) -> Image.Image:
    bg = (10, 13, 19) if dark else (243, 245, 249)
    fg = (236, 240, 246) if dark else (20, 25, 34)
    muted = (139, 149, 166) if dark else (92, 102, 119)
    panel = (23, 28, 36) if dark else (255, 255, 255)
    border = (42, 48, 60) if dark else (222, 227, 236)
    chip = (17, 21, 28) if dark else (238, 241, 246)

    im = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(im)

    draw_text(d, (56, 38), "DevToolBox · 图标方案", 27, fg)
    draw_text(d, (56, 76), "按应用场景、功能与用户群体设计的三个方向  ·  1024 × 1024 矢量源", 14, muted)

    col_w, gap = 416, 40
    for i, (file, letter, zh, en, tagline) in enumerate(CONCEPTS):
        src = Image.open(RENDER / file).convert("RGBA")
        x = 56 + i * (col_w + gap)
        cx = x + col_w / 2

        hero = resize(src, 236)
        im.paste(hero, (int(cx - 118), 132), hero)

        draw_text(d, (cx, 402), f"{letter} · {zh}", 25, fg, anchor="ma")
        draw_text(d, (cx, 438), f"{en} — {tagline}", 14, muted, anchor="ma")

        # Dock / taskbar size ladder
        d.rounded_rectangle(
            [x, 486, x + col_w, 578],
            radius=18,
            fill=chip,
            outline=border,
            width=1,
        )
        ladder = [128, 64, 32, 16]
        g = 18
        total = sum(ladder) + g * (len(ladder) - 1)
        sx = x + (col_w - total) / 2
        for size in ladder:
            icon = resize(src, size)
            im.paste(icon, (int(sx), int(532 - size / 2)), icon)
            sx += size + g
        draw_text(d, (cx, 596), "128 / 64 / 32 / 16 px", 12, muted, anchor="ma")

    draw_text(
        d,
        (56, 668),
        "同一套几何与配色可导出 macOS .icns、Windows .ico 与自适应图标；所有方案均无文字，16 px 下仍可辨识。",
        13,
        muted,
    )
    return im


if __name__ == "__main__":
    sheet(True).save(OUT / "compare-dark.png")
    sheet(False).save(OUT / "compare-light.png")
    print("wrote", OUT / "compare-dark.png", OUT / "compare-light.png")
