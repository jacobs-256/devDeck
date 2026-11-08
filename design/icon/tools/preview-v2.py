#!/usr/bin/env python3
"""Comparison sheet for the four "tech" icon directions (round 2)."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
RENDER = ROOT / "render-v2"
OUT = ROOT / "preview"
OUT.mkdir(exist_ok=True)

FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"

CONCEPTS = [
    ("v2-nexus-grid.png", "01", "模块网络", "Nexus Grid", "四块工具模块，共用一块背板"),
    ("v2-orbit-core.png", "02", "轨道核心", "Orbit Core", "工具模块围绕核心运行"),
    ("v2-prism-split.png", "03", "棱镜分流", "Prism Split", "一束输入，分派到不同工具"),
    ("v2-circuit-case.png", "04", "电路工具箱", "Circuit Case", "发光插槽 + 电路走线的工具盒"),
    ("v2-module-case.png", "05", "模块工具箱", "Module Case", "箱体 + 四块工具模块 + 电路"),
]

W, H = 1700, 700


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size)


def draw_text(d, xy, s, size, fill, anchor="la"):
    d.text(xy, s, font=font(size), fill=fill, anchor=anchor)


def resize(im: Image.Image, size: int) -> Image.Image:
    return im.resize((size, size), Image.LANCZOS)


def sheet(dark: bool) -> Image.Image:
    bg = (9, 12, 18) if dark else (243, 245, 249)
    fg = (236, 240, 246) if dark else (20, 25, 34)
    muted = (139, 149, 166) if dark else (92, 102, 119)
    chip = (17, 21, 28) if dark else (255, 255, 255)
    border = (40, 46, 58) if dark else (222, 227, 236)

    im = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(im)

    draw_text(d, (56, 34), "DevDeck · 第二轮：科技感方向（含 05 组合款）", 27, fg)
    draw_text(d, (56, 72), "五个方向  ·  强调「工具」「集合」与工程感  ·  1024 × 1024 矢量源", 14, muted)

    col_w, gap = 300, 22
    for i, (file, num, zh, en, tagline) in enumerate(CONCEPTS):
        src = Image.open(RENDER / file).convert("RGBA")
        x = 56 + i * (col_w + gap)
        cx = x + col_w / 2

        hero = resize(src, 196)
        im.paste(hero, (int(cx - 98), 120), hero)

        draw_text(d, (cx, 350), f"{num} · {zh}", 21, fg, anchor="ma")
        draw_text(d, (cx, 382), en, 12, muted, anchor="ma")
        draw_text(d, (cx, 406), tagline, 12, muted, anchor="ma")

        d.rounded_rectangle(
            [x, 444, x + col_w, 528], radius=16, fill=chip, outline=border, width=1
        )
        ladder = [128, 64, 32, 16]
        g = 8
        total = sum(ladder) + g * (len(ladder) - 1)
        sx = x + (col_w - total) / 2
        for size in ladder:
            icon = resize(src, size)
            im.paste(icon, (int(sx), int(486 - size / 2)), icon)
            sx += size + g
        draw_text(d, (cx, 546), "128 / 64 / 32 / 16 px", 11, muted, anchor="ma")

    draw_text(
        d,
        (56, 620),
        "均为圆角方形 + 深色科技底；无文字、无外部字体，可直接导出 macOS .icns / Windows .ico。",
        13,
        muted,
    )
    return im


if __name__ == "__main__":
    sheet(True).save(OUT / "compare-v2-dark.png")
    sheet(False).save(OUT / "compare-v2-light.png")
    print("wrote compare-v2-dark.png / compare-v2-light.png")
