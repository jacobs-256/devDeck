#!/usr/bin/env python3
"""Generate DevToolBox app icon concepts as SVG.

The icons follow the macOS app-icon grid (1024 canvas, squircle body) so the
same source renders cleanly in a Dock, a Windows taskbar, and a browser tab.

Usage: python3 generate.py
"""

from __future__ import annotations

import math
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src"
OUT.mkdir(parents=True, exist_ok=True)

CANVAS = 1024
CX = CY = CANVAS / 2
INSET = 76          # transparent margin around the squircle body
HALF = CX - INSET   # 436 -> body is 872 x 872
N = 5.0             # superellipse exponent; 5 is very close to Apple's squircle


def squircle(cx: float, cy: float, r: float, n: float = N, steps: int = 480) -> str:
    """Closed superellipse path, sampled densely enough to look smooth."""
    pts: list[tuple[float, float]] = []
    for i in range(steps):
        t = 2.0 * math.pi * i / steps
        c, s = math.cos(t), math.sin(t)
        x = cx + r * math.copysign(abs(c) ** (2.0 / n), c)
        y = cy + r * math.copysign(abs(s) ** (2.0 / n), s)
        pts.append((x, y))
    d = "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in pts)
    return d + " Z"


BODY = squircle(CX, CY, HALF)
CLIP = f'<clipPath id="body-clip"><path d="{BODY}"/></clipPath>'

RIM_GRADIENT = """
<linearGradient id="rim" x1="0.5" y1="0" x2="0.5" y2="1">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>
  <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.16"/>
  <stop offset="1" stop-color="#ffffff" stop-opacity="0.00"/>
</linearGradient>
"""


def sparkle(cx: float, cy: float, r: float, rotate: float = 0.0) -> str:
    """Four-point sparkle with concave sides."""
    k1, k2 = 0.10 * r, 0.45 * r
    d = (
        f"M {cx} {cy - r} "
        f"C {cx + k1} {cy - k2} {cx + k2} {cy - k1} {cx + r} {cy} "
        f"C {cx + k2} {cy + k1} {cx + k1} {cy + k2} {cx} {cy + r} "
        f"C {cx - k1} {cy + k2} {cx - k2} {cy + k1} {cx - r} {cy} "
        f"C {cx - k2} {cy - k1} {cx - k1} {cy - k2} {cx} {cy - r} Z"
    )
    if rotate:
        return f'<g transform="rotate({rotate} {cx} {cy})"><path d="{d}"/></g>'
    return f'<path d="{d}"/>'


def brace(cx: float, cy: float, scale: float = 1.0, mirror: bool = False) -> str:
    """A single curly brace path, centred on (cx, cy)."""
    path = (
        "M 24 -72 C 9 -72 4 -60 4 -44 L 4 -18 "
        "C 4 -6 -2 0 -14 0 C -2 0 4 6 4 18 "
        "L 4 44 C 4 60 9 72 24 72"
    )
    sx = -scale if mirror else scale
    return (
        f'<path d="{path}" transform="translate({cx} {cy}) scale({sx} {scale})" '
        'fill="none" stroke="#2B5BE0" stroke-width="22" stroke-linecap="round" '
        'stroke-linejoin="round"/>'
    )


def rim_stroke(opacity: float = 0.30, width: float = 3.0) -> str:
    return f'<path d="{BODY}" fill="none" stroke="url(#rim)" stroke-width="{width}"/>'


def svg(body: str, defs: str) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" '
        'viewBox="0 0 1024 1024" fill="none">\n'
        f"<defs>{defs}{RIM_GRADIENT}{CLIP}</defs>\n"
        f'<g id="app-icon">{body}</g>\n'
        "</svg>\n"
    )


# ---------------------------------------------------------------------------
# Concept A — Modular Matrix
# ---------------------------------------------------------------------------

def concept_matrix() -> str:
    defs = """
<linearGradient id="bg" x1="0.18" y1="-0.1" x2="0.85" y2="1.15">
  <stop offset="0" stop-color="#1E2E52"/>
  <stop offset="0.52" stop-color="#111C33"/>
  <stop offset="1" stop-color="#090E1B"/>
</linearGradient>
<radialGradient id="glow-blue" cx="0.72" cy="0.78" r="0.62">
  <stop offset="0" stop-color="#3F7BFF" stop-opacity="0.55"/>
  <stop offset="0.55" stop-color="#3F7BFF" stop-opacity="0.14"/>
  <stop offset="1" stop-color="#3F7BFF" stop-opacity="0"/>
</radialGradient>
<radialGradient id="glow-teal" cx="0.18" cy="0.06" r="0.62">
  <stop offset="0" stop-color="#58C7FF" stop-opacity="0.22"/>
  <stop offset="1" stop-color="#58C7FF" stop-opacity="0"/>
</radialGradient>
<linearGradient id="tile-white" x1="0.1" y1="0" x2="0.85" y2="1">
  <stop offset="0" stop-color="#FFFFFF"/>
  <stop offset="0.58" stop-color="#F1F6FF"/>
  <stop offset="1" stop-color="#D3E1F8"/>
</linearGradient>
<linearGradient id="tile-accent" x1="0.05" y1="0" x2="0.9" y2="1">
  <stop offset="0" stop-color="#74B4FF"/>
  <stop offset="0.45" stop-color="#4F8CFF"/>
  <stop offset="1" stop-color="#23B6F0"/>
</linearGradient>
<linearGradient id="glass" x1="0.1" y1="0" x2="0.9" y2="1">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0.11"/>
  <stop offset="1" stop-color="#ffffff" stop-opacity="0.035"/>
</linearGradient>
<linearGradient id="accent-sheen" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0.26"/>
  <stop offset="0.55" stop-color="#ffffff" stop-opacity="0.02"/>
  <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<filter id="tile-shadow" x="-45%" y="-45%" width="190%" height="210%">
  <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#02060F" flood-opacity="0.62"/>
</filter>
<filter id="soft-glow" x="-60%" y="-60%" width="220%" height="220%">
  <feGaussianBlur stdDeviation="26"/>
</filter>
"""

    size, gap = 292, 40
    x0 = (CANVAS - (2 * size + gap)) / 2          # 200
    y0 = x0
    r = 76
    tl, tr = (x0, y0), (x0 + size + gap, y0)
    bl, br = (x0, y0 + size + gap), (x0 + size + gap, y0 + size + gap)

    def tile(pos, fill, stroke="none", stroke_opacity=1.0):
        x, y = pos
        return (
            f'<rect x="{x}" y="{y}" width="{size}" height="{size}" rx="{r}" '
            f'fill="{fill}" stroke="{stroke}" stroke-opacity="{stroke_opacity}" stroke-width="2"/>'
        )

    c_tl = (tl[0] + size / 2, tl[1] + size / 2)
    c_tr = (tr[0] + size / 2, tr[1] + size / 2)
    c_bl = (bl[0] + size / 2, bl[1] + size / 2)
    c_br = (br[0] + size / 2, br[1] + size / 2)

    tr_lines = "".join(
        f'<rect x="{c_tr[0] - 78}" y="{c_tr[1] - 46 + i * 40}" width="{w}" height="15" '
        f'rx="7.5" fill="#ffffff" fill-opacity="0.28"/>'
        for i, w in enumerate((156, 108, 134))
    )
    hash_glyph = (
        f'<g stroke="#ffffff" stroke-opacity="0.26" stroke-width="13" stroke-linecap="round">'
        f'<path d="M {c_bl[0] - 28} {c_bl[1] - 62} L {c_bl[0] - 28} {c_bl[1] + 62}"/>'
        f'<path d="M {c_bl[0] + 28} {c_bl[1] - 62} L {c_bl[0] + 28} {c_bl[1] + 62}"/>'
        f'<path d="M {c_bl[0] - 66} {c_bl[1] - 24} L {c_bl[0] + 66} {c_bl[1] - 24}"/>'
        f'<path d="M {c_bl[0] - 66} {c_bl[1] + 24} L {c_bl[0] + 66} {c_bl[1] + 24}"/>'
        "</g>"
    )

    body = f"""
<path d="{BODY}" fill="url(#bg)"/>
<g clip-path="url(#body-clip)">
  <rect x="0" y="0" width="1024" height="1024" fill="url(#glow-blue)"/>
  <rect x="0" y="0" width="1024" height="1024" fill="url(#glow-teal)"/>
  <ellipse cx="{c_br[0]}" cy="{c_br[1]}" rx="190" ry="190" fill="#3E86FF" fill-opacity="0.55" filter="url(#soft-glow)"/>
</g>
{rim_stroke()}
<g filter="url(#tile-shadow)">{tile(tr, "url(#glass)", "#ffffff", 0.13)}</g>
<g filter="url(#tile-shadow)">{tile(bl, "url(#glass)", "#ffffff", 0.10)}</g>
<g filter="url(#tile-shadow)">{tile(br, "url(#tile-accent)")}</g>
<g filter="url(#tile-shadow)">{tile(tl, "url(#tile-white)")}</g>
<g clip-path="url(#body-clip)">
  <rect x="{br[0]}" y="{br[1]}" width="{size}" height="{size}" rx="{r}" fill="url(#accent-sheen)"/>
</g>
{tr_lines}
{hash_glyph}
<g fill="none" stroke="#2B5BE0" stroke-width="22" stroke-linecap="round" stroke-linejoin="round">
  {brace(c_tl[0] - 56, c_tl[1], scale=1.08)}
  {brace(c_tl[0] + 56, c_tl[1], scale=1.08, mirror=True)}
</g>
<g fill="#ffffff">
  {sparkle(c_br[0], c_br[1], 60, rotate=-8)}
</g>
"""
    return svg(body, defs)


# ---------------------------------------------------------------------------
# Concept B — Command Spark
# ---------------------------------------------------------------------------

def _b_body(defs_extra: str, glyph: str, glow) -> str:
    pass


def concept_spark() -> str:
    defs = """
<linearGradient id="bg" x1="0.12" y1="0" x2="0.9" y2="1.05">
  <stop offset="0" stop-color="#6FB0FF"/>
  <stop offset="0.42" stop-color="#3F7BFF"/>
  <stop offset="1" stop-color="#2440E0"/>
</linearGradient>
<radialGradient id="cyan" cx="0.86" cy="0.9" r="0.7">
  <stop offset="0" stop-color="#43E8F5" stop-opacity="0.5"/>
  <stop offset="0.5" stop-color="#43E8F5" stop-opacity="0.09"/>
  <stop offset="1" stop-color="#43E8F5" stop-opacity="0"/>
</radialGradient>
<radialGradient id="toplight" cx="0.28" cy="0.04" r="0.7">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0.28"/>
  <stop offset="0.6" stop-color="#ffffff" stop-opacity="0.04"/>
  <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</radialGradient>
<linearGradient id="slash" x1="0.1" y1="1" x2="0.9" y2="0">
  <stop offset="0" stop-color="#DCE9FF"/>
  <stop offset="0.55" stop-color="#FFFFFF"/>
  <stop offset="1" stop-color="#FFFFFF"/>
</linearGradient>
<filter id="glyph-shadow" x="-40%" y="-40%" width="180%" height="200%">
  <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#0B1B63" flood-opacity="0.4"/>
</filter>
<filter id="spark-glow" x="-70%" y="-70%" width="240%" height="240%">
  <feGaussianBlur stdDeviation="20"/>
</filter>
"""
    slash = (
        '<path d="M 404 742 L 616 384" stroke="url(#slash)" stroke-width="96" '
        'stroke-linecap="round" fill="none"/>'
    )
    sx, sy, sr = 772, 292, 82

    body = f"""
<path d="{BODY}" fill="url(#bg)"/>
<g clip-path="url(#body-clip)">
  <rect width="1024" height="1024" fill="url(#cyan)"/>
  <rect width="1024" height="1024" fill="url(#toplight)"/>
</g>
{rim_stroke(0.32, 3)}
<g filter="url(#glyph-shadow)">{slash}</g>
<circle cx="{sx}" cy="{sy}" r="{sr * 0.85}" fill="#A9F6FF" fill-opacity="0.5" filter="url(#spark-glow)"/>
<g fill="#ffffff">
  {sparkle(sx, sy, sr, rotate=-8)}
  {sparkle(856, 396, 24, rotate=10)}
</g>
"""
    return svg(body, defs)


def concept_double_slash() -> str:
    defs = """
<linearGradient id="bg" x1="0.1" y1="0" x2="0.92" y2="1.08">
  <stop offset="0" stop-color="#6AAEFF"/>
  <stop offset="0.45" stop-color="#3D77FF"/>
  <stop offset="1" stop-color="#2A34D8"/>
</linearGradient>
<radialGradient id="cyan" cx="0.84" cy="0.88" r="0.72">
  <stop offset="0" stop-color="#3DE5F0" stop-opacity="0.42"/>
  <stop offset="0.55" stop-color="#3DE5F0" stop-opacity="0.07"/>
  <stop offset="1" stop-color="#3DE5F0" stop-opacity="0"/>
</radialGradient>
<radialGradient id="toplight" cx="0.26" cy="0.02" r="0.72">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0.30"/>
  <stop offset="0.6" stop-color="#ffffff" stop-opacity="0.04"/>
  <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</radialGradient>
<linearGradient id="bar-a" x1="0" y1="1" x2="1" y2="0">
  <stop offset="0" stop-color="#E7F0FF"/>
  <stop offset="1" stop-color="#FFFFFF"/>
</linearGradient>
<linearGradient id="bar-b" x1="0" y1="1" x2="1" y2="0">
  <stop offset="0" stop-color="#B9E9FF"/>
  <stop offset="1" stop-color="#E9FBFF"/>
</linearGradient>
<filter id="glyph-shadow" x="-40%" y="-40%" width="180%" height="200%">
  <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#0B1B63" flood-opacity="0.35"/>
</filter>
"""
    body = f"""
<path d="{BODY}" fill="url(#bg)"/>
<g clip-path="url(#body-clip)">
  <rect width="1024" height="1024" fill="url(#cyan)"/>
  <rect width="1024" height="1024" fill="url(#toplight)"/>
</g>
{rim_stroke(0.32, 3)}
<g filter="url(#glyph-shadow)">
  <path d="M 396 748 L 512 296" stroke="url(#bar-a)" stroke-width="94" stroke-linecap="round"/>
  <path d="M 550 748 L 666 296" stroke="url(#bar-b)" stroke-width="94" stroke-linecap="round"/>
</g>
"""
    return svg(body, defs)


# ---------------------------------------------------------------------------
# Concept C — Plugin Piece
# ---------------------------------------------------------------------------

def concept_piece4() -> str:
    defs = """
<linearGradient id="bg" x1="0.15" y1="0" x2="0.88" y2="1.1">
  <stop offset="0" stop-color="#152340"/>
  <stop offset="0.55" stop-color="#0C1424"/>
  <stop offset="1" stop-color="#070B14"/>
</linearGradient>
<radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
  <stop offset="0" stop-color="#4F8CFF" stop-opacity="0.5"/>
  <stop offset="0.55" stop-color="#4F8CFF" stop-opacity="0.13"/>
  <stop offset="1" stop-color="#4F8CFF" stop-opacity="0"/>
</radialGradient>
<linearGradient id="piece" x1="0.12" y1="0" x2="0.82" y2="1">
  <stop offset="0" stop-color="#FFFFFF"/>
  <stop offset="0.42" stop-color="#E4EEFF"/>
  <stop offset="1" stop-color="#A3BEEA"/>
</linearGradient>
<linearGradient id="bevel-light" x1="0.1" y1="0" x2="0.75" y2="1">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
  <stop offset="0.55" stop-color="#ffffff" stop-opacity="0.25"/>
  <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<linearGradient id="bevel-dark" x1="0.2" y1="0.2" x2="0.9" y2="1">
  <stop offset="0" stop-color="#2A4FA8" stop-opacity="0"/>
  <stop offset="0.6" stop-color="#2A4FA8" stop-opacity="0.10"/>
  <stop offset="1" stop-color="#1E3E8C" stop-opacity="0.30"/>
</linearGradient>
<pattern id="dots" width="56" height="56" patternUnits="userSpaceOnUse">
  <circle cx="28" cy="28" r="1.6" fill="#ffffff" fill-opacity="0.06"/>
</pattern>
<filter id="piece-shadow" x="-35%" y="-35%" width="180%" height="190%">
  <feDropShadow dx="0" dy="30" stdDeviation="34" flood-color="#02060F" flood-opacity="0.62"/>
</filter>
<filter id="halo-blur" x="-60%" y="-60%" width="220%" height="220%">
  <feGaussianBlur stdDeviation="34"/>
</filter>
<mask id="piece-mask">
  <rect width="1024" height="1024" fill="#000"/>
  <rect x="347" y="347" width="330" height="330" rx="76" fill="#fff"/>
  <rect x="667" y="470" width="96" height="84" rx="16" fill="#fff"/>
  <circle cx="749" cy="512" r="62" fill="#fff"/>
  <rect x="470" y="667" width="84" height="96" rx="16" fill="#fff"/>
  <circle cx="512" cy="749" r="62" fill="#fff"/>
  <rect x="347" y="470" width="96" height="84" rx="16" fill="#000"/>
  <circle cx="428" cy="512" r="62" fill="#000"/>
  <rect x="470" y="347" width="84" height="96" rx="16" fill="#000"/>
  <circle cx="512" cy="428" r="62" fill="#000"/>
</mask>
"""

    piece = f"""
<rect width="1024" height="1024" fill="url(#piece)"/>
<ellipse cx="430" cy="410" rx="190" ry="120" fill="#ffffff" fill-opacity="0.8" filter="url(#halo-blur)"/>
<rect width="1024" height="1024" fill="url(#bevel-dark)"/>

"""

    body = f"""
<path d="{BODY}" fill="url(#bg)"/>
<g clip-path="url(#body-clip)">
  <rect width="1024" height="1024" fill="url(#dots)"/>
  <ellipse cx="512" cy="506" rx="330" ry="330" fill="url(#halo)"/>
  <ellipse cx="512" cy="506" rx="238" ry="238" fill="#7FB4FF" fill-opacity="0.24" filter="url(#halo-blur)"/>
</g>
{rim_stroke(0.34, 3)}
<g transform="translate(-46 -42) rotate(-7 512 508) translate(512 508) scale(1.03) translate(-512 -508)" filter="url(#piece-shadow)">
  <g mask="url(#piece-mask)">
    {piece}
  </g>
</g>
"""
    return svg(body, defs)


def concept_piece3() -> str:
    defs = """
<linearGradient id="bg" x1="0.15" y1="0" x2="0.88" y2="1.1">
  <stop offset="0" stop-color="#152340"/>
  <stop offset="0.55" stop-color="#0C1424"/>
  <stop offset="1" stop-color="#070B14"/>
</linearGradient>
<radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
  <stop offset="0" stop-color="#4F8CFF" stop-opacity="0.5"/>
  <stop offset="0.55" stop-color="#4F8CFF" stop-opacity="0.13"/>
  <stop offset="1" stop-color="#4F8CFF" stop-opacity="0"/>
</radialGradient>
<linearGradient id="piece" x1="0.12" y1="0" x2="0.82" y2="1">
  <stop offset="0" stop-color="#FFFFFF"/>
  <stop offset="0.42" stop-color="#E4EEFF"/>
  <stop offset="1" stop-color="#A3BEEA"/>
</linearGradient>
<linearGradient id="bevel-light" x1="0.1" y1="0" x2="0.75" y2="1">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
  <stop offset="0.55" stop-color="#ffffff" stop-opacity="0.25"/>
  <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<linearGradient id="bevel-dark" x1="0.2" y1="0.2" x2="0.9" y2="1">
  <stop offset="0" stop-color="#2A4FA8" stop-opacity="0"/>
  <stop offset="0.6" stop-color="#2A4FA8" stop-opacity="0.10"/>
  <stop offset="1" stop-color="#1E3E8C" stop-opacity="0.30"/>
</linearGradient>
<pattern id="dots" width="56" height="56" patternUnits="userSpaceOnUse">
  <circle cx="28" cy="28" r="1.6" fill="#ffffff" fill-opacity="0.06"/>
</pattern>
<filter id="piece-shadow" x="-35%" y="-35%" width="180%" height="190%">
  <feDropShadow dx="0" dy="30" stdDeviation="34" flood-color="#02060F" flood-opacity="0.62"/>
</filter>
<filter id="halo-blur" x="-60%" y="-60%" width="220%" height="220%">
  <feGaussianBlur stdDeviation="34"/>
</filter>
<mask id="piece-mask">
  <rect width="1024" height="1024" fill="#000"/>
  <rect x="347" y="347" width="330" height="330" rx="44" fill="#fff"/>
  <rect x="667" y="474" width="92" height="76" rx="14" fill="#fff"/>
  <circle cx="749" cy="512" r="58" fill="#fff"/>
  <rect x="470" y="347" width="76" height="92" rx="14" fill="#000"/>
  <circle cx="512" cy="421" r="58" fill="#000"/>
</mask>
"""

    piece = f"""
<rect width="1024" height="1024" fill="url(#piece)"/>
<ellipse cx="430" cy="410" rx="190" ry="120" fill="#ffffff" fill-opacity="0.8" filter="url(#halo-blur)"/>
<rect width="1024" height="1024" fill="url(#bevel-dark)"/>
"""

    body = f"""
<path d="{BODY}" fill="url(#bg)"/>
<g clip-path="url(#body-clip)">
  <rect width="1024" height="1024" fill="url(#dots)"/>
  <ellipse cx="512" cy="506" rx="330" ry="330" fill="url(#halo)"/>
  <ellipse cx="512" cy="506" rx="238" ry="238" fill="#7FB4FF" fill-opacity="0.24" filter="url(#halo-blur)"/>
</g>
{rim_stroke(0.34, 3)}
<g transform="translate(-80 -30) rotate(-6 512 506) translate(512 508) scale(1.07) translate(-512 -508)" filter="url(#piece-shadow)">
  <g mask="url(#piece-mask)">
    {piece}
  </g>
</g>
"""
    return svg(body, defs)


def concept_toolbox() -> str:
    defs = """
<linearGradient id="bg" x1="0.1" y1="0" x2="0.92" y2="1.08">
  <stop offset="0" stop-color="#6AAEFF"/>
  <stop offset="0.45" stop-color="#3D77FF"/>
  <stop offset="1" stop-color="#2A34D8"/>
</linearGradient>
<radialGradient id="cyan" cx="0.84" cy="0.9" r="0.72">
  <stop offset="0" stop-color="#3DE5F0" stop-opacity="0.42"/>
  <stop offset="0.55" stop-color="#3DE5F0" stop-opacity="0.07"/>
  <stop offset="1" stop-color="#3DE5F0" stop-opacity="0"/>
</radialGradient>
<radialGradient id="toplight" cx="0.26" cy="0.02" r="0.72">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0.30"/>
  <stop offset="0.6" stop-color="#ffffff" stop-opacity="0.04"/>
  <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</radialGradient>
<linearGradient id="box" x1="0.15" y1="0" x2="0.85" y2="1">
  <stop offset="0" stop-color="#FFFFFF"/>
  <stop offset="0.55" stop-color="#F2F6FF"/>
  <stop offset="1" stop-color="#C9DAF6"/>
</linearGradient>
<linearGradient id="lid" x1="0.1" y1="0" x2="0.9" y2="1">
  <stop offset="0" stop-color="#FFFFFF"/>
  <stop offset="1" stop-color="#E1EBFF"/>
</linearGradient>
<linearGradient id="latch" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#EAF2FF"/>
  <stop offset="1" stop-color="#C6D6F2"/>
</linearGradient>
<filter id="box-shadow" x="-30%" y="-30%" width="160%" height="170%">
  <feDropShadow dx="0" dy="24" stdDeviation="26" flood-color="#06124F" flood-opacity="0.45"/>
</filter>
<filter id="glyph-shadow" x="-40%" y="-40%" width="180%" height="200%">
  <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#0B1B63" flood-opacity="0.25"/>
</filter>
"""
    body = f"""
<path d="{BODY}" fill="url(#bg)"/>
<g clip-path="url(#body-clip)">
  <rect width="1024" height="1024" fill="url(#cyan)"/>
  <rect width="1024" height="1024" fill="url(#toplight)"/>
</g>
{rim_stroke(0.32, 3)}
<g filter="url(#box-shadow)">
  <path d="M 452 344 L 452 302 Q 452 274 480 274 L 544 274 Q 572 274 572 302 L 572 344" stroke="#FFFFFF" stroke-width="36" stroke-linecap="round" fill="none"/>
  <rect x="250" y="444" width="524" height="304" rx="54" fill="url(#box)"/>
  <rect x="250" y="332" width="524" height="120" rx="52" fill="url(#lid)"/>
  <rect x="250" y="436" width="524" height="12" rx="6" fill="#1E3A8C" fill-opacity="0.22"/>
  <g>
    <rect x="332" y="412" width="64" height="76" rx="16" fill="url(#latch)" stroke="#B7CBEC" stroke-width="2"/>
    <rect x="628" y="412" width="64" height="76" rx="16" fill="url(#latch)" stroke="#B7CBEC" stroke-width="2"/>
    <path d="M 350 452 L 378 452 M 646 452 L 674 452" stroke="#2E5BFF" stroke-opacity="0.55" stroke-width="7" stroke-linecap="round"/>
  </g>
</g>
<g fill="none" stroke="#2E5BFF" stroke-width="20" stroke-linecap="round" stroke-linejoin="round">
  <path d="M 486 640 C 474 640 469 630 469 616 L 469 602 C 469 594 463 590 453 590 C 463 590 469 586 469 578 L 469 564 C 469 550 474 540 486 540"/>
  <path d="M 538 640 C 550 640 555 630 555 616 L 555 602 C 555 594 561 590 571 590 C 561 590 555 586 555 578 L 555 564 C 555 550 550 540 538 540"/>
</g>
"""
    return svg(body, defs)


def concept_terminal() -> str:
    defs = """
<linearGradient id="bg" x1="0.1" y1="0" x2="0.92" y2="1.08">
  <stop offset="0" stop-color="#6FB2FF"/>
  <stop offset="0.45" stop-color="#3B74FF"/>
  <stop offset="1" stop-color="#2128C4"/>
</linearGradient>
<radialGradient id="cyan" cx="0.86" cy="0.9" r="0.72">
  <stop offset="0" stop-color="#3DE5F0" stop-opacity="0.45"/>
  <stop offset="0.55" stop-color="#3DE5F0" stop-opacity="0.08"/>
  <stop offset="1" stop-color="#3DE5F0" stop-opacity="0"/>
</radialGradient>
<radialGradient id="toplight" cx="0.24" cy="0.02" r="0.72">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0.32"/>
  <stop offset="0.6" stop-color="#ffffff" stop-opacity="0.05"/>
  <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</radialGradient>
<linearGradient id="glyph" gradientUnits="userSpaceOnUse" x1="300" y1="760" x2="820" y2="260">
  <stop offset="0" stop-color="#DCE9FF"/>
  <stop offset="0.5" stop-color="#FFFFFF"/>
  <stop offset="1" stop-color="#FFFFFF"/>
</linearGradient>
<filter id="glyph-shadow" x="-40%" y="-40%" width="180%" height="200%">
  <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#0B1470" flood-opacity="0.38"/>
</filter>
"""
    body = f"""
<path d="{BODY}" fill="url(#bg)"/>
<g clip-path="url(#body-clip)">
  <rect width="1024" height="1024" fill="url(#cyan)"/>
  <rect width="1024" height="1024" fill="url(#toplight)"/>
</g>
{rim_stroke(0.32, 3)}
<g filter="url(#glyph-shadow)" stroke="url(#glyph)" stroke-width="86" stroke-linecap="round" stroke-linejoin="round" fill="none">
  <path d="M 344 326 L 536 512 L 344 698"/>
  <path d="M 592 700 L 780 700"/>
</g>
"""
    return svg(body, defs)


if __name__ == "__main__":
    finals = {
        "icon-a-module-matrix.svg": concept_matrix(),
        "icon-b-devkit-case.svg": concept_toolbox(),
        "icon-c-plugin-piece.svg": concept_piece3(),
    }
    for name, text in finals.items():
        (OUT / name).write_text(text, encoding="utf-8")
        print("wrote", OUT / name, len(text), "bytes")

    drafts = {
        "alt-command-spark.svg": concept_spark(),
        "alt-double-slash.svg": concept_double_slash(),
        "alt-terminal.svg": concept_terminal(),
        "alt-plugin-piece-4side.svg": concept_piece4(),
    }
    drafts_dir = OUT.parent / "drafts"
    for name, text in drafts.items():
        (drafts_dir / name).write_text(text, encoding="utf-8")
    print("wrote", len(drafts), "drafts")
