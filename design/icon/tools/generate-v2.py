#!/usr/bin/env python3
"""Round-2 icon concepts for DevDeck — techy, "tools + collection".

Outputs 1024x1024 SVGs to design/icon/src-v2/. Nothing here touches the app icon.

Usage: python3 generate-v2.py
"""

from __future__ import annotations

import math
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src-v2"
OUT.mkdir(parents=True, exist_ok=True)

CANVAS = 1024
CX = CY = 512.0
INSET = 76
HALF = CX - INSET
N = 5.0

BLUE = "#4F8CFF"
CYAN = "#5CE1F5"
MINT = "#5EEAD4"
VIOLET = "#A78BFA"


def squircle(cx: float, cy: float, r: float, n: float = N, steps: int = 480) -> str:
    pts = []
    for i in range(steps):
        t = 2.0 * math.pi * i / steps
        c, s = math.cos(t), math.sin(t)
        x = cx + r * math.copysign(abs(c) ** (2.0 / n), c)
        y = cy + r * math.copysign(abs(s) ** (2.0 / n), s)
        pts.append((x, y))
    return "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in pts) + " Z"


BODY = squircle(CX, CY, HALF)
CLIP = f'<clipPath id="body-clip"><path d="{BODY}"/></clipPath>'

RIM = """
<linearGradient id="rim" x1="0.5" y1="0" x2="0.5" y2="1">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0.50"/>
  <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.14"/>
  <stop offset="1" stop-color="#ffffff" stop-opacity="0.00"/>
</linearGradient>
"""

DOTS = """
<pattern id="dots" width="54" height="54" patternUnits="userSpaceOnUse">
  <circle cx="27" cy="27" r="1.5" fill="#ffffff" fill-opacity="0.055"/>
</pattern>
"""


def rim_stroke(width: float = 3.0) -> str:
    return f'<path d="{BODY}" fill="none" stroke="url(#rim)" stroke-width="{width}"/>'


def svg(body: str, defs: str) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" '
        'viewBox="0 0 1024 1024" fill="none">\n'
        f"<defs>{defs}{RIM}{DOTS}{CLIP}</defs>\n"
        f'<g id="app-icon">{body}</g>\n'
        "</svg>\n"
    )


def sparkle(cx: float, cy: float, r: float, rotate: float = 0.0) -> str:
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


def rounded_polygon(points: list[tuple[float, float]], radius: float) -> str:
    """Closed path with rounded corners, radius is the visual corner radius."""
    n = len(points)
    segs = []
    for i in range(n):
        p0 = points[(i - 1) % n]
        p1 = points[i]
        p2 = points[(i + 1) % n]
        v1 = (p0[0] - p1[0], p0[1] - p1[1])
        v2 = (p2[0] - p1[0], p2[1] - p1[1])
        l1 = math.hypot(*v1)
        l2 = math.hypot(*v2)
        d1 = (v1[0] / l1, v1[1] / l1)
        d2 = (v2[0] / l2, v2[1] / l2)
        cos_a = max(-1.0, min(1.0, d1[0] * d2[0] + d1[1] * d2[1]))
        angle = math.acos(cos_a)
        dist = min(radius / math.tan(angle / 2), l1 * 0.45, l2 * 0.45)
        a = (p1[0] + d1[0] * dist, p1[1] + d1[1] * dist)
        b = (p1[0] + d2[0] * dist, p1[1] + d2[1] * dist)
        segs.append((a, p1, b))
    d = f"M {segs[0][2][0]:.2f} {segs[0][2][1]:.2f} "
    for i in range(1, n + 1):
        a, p, b = segs[i % n]
        d += f"L {a[0]:.2f} {a[1]:.2f} Q {p[0]:.2f} {p[1]:.2f} {b[0]:.2f} {b[1]:.2f} "
    return d + "Z"


# ---------------------------------------------------------------------------
# 1 — Nexus Grid: four tool modules wired into one core
# ---------------------------------------------------------------------------

def concept_nexus() -> str:
    defs = """
<linearGradient id="bg" x1="0.16" y1="-0.05" x2="0.86" y2="1.08">
  <stop offset="0" stop-color="#101E3C"/>
  <stop offset="0.5" stop-color="#0A1326"/>
  <stop offset="1" stop-color="#05080F"/>
</linearGradient>
<radialGradient id="glow-blue" cx="0.18" cy="0.1" r="0.66">
  <stop offset="0" stop-color="#2F6BFF" stop-opacity="0.34"/>
  <stop offset="1" stop-color="#2F6BFF" stop-opacity="0"/>
</radialGradient>
<radialGradient id="glow-cyan" cx="0.84" cy="0.9" r="0.6">
  <stop offset="0" stop-color="#22D3EE" stop-opacity="0.30"/>
  <stop offset="1" stop-color="#22D3EE" stop-opacity="0"/>
</radialGradient>
<linearGradient id="glass" x1="0.1" y1="0" x2="0.9" y2="1">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/>
  <stop offset="1" stop-color="#ffffff" stop-opacity="0.028"/>
</linearGradient>
<linearGradient id="accent" x1="0.05" y1="0" x2="0.95" y2="1">
  <stop offset="0" stop-color="#6EE7FF"/>
  <stop offset="0.45" stop-color="#4F8CFF"/>
  <stop offset="1" stop-color="#2E4FE0"/>
</linearGradient>
<linearGradient id="trace" gradientUnits="userSpaceOnUse" x1="180" y1="180" x2="844" y2="844">
  <stop offset="0" stop-color="#8FF3FF" stop-opacity="0.95"/>
  <stop offset="0.5" stop-color="#4F8CFF" stop-opacity="0.7"/>
  <stop offset="1" stop-color="#8FF3FF" stop-opacity="0.95"/>
</linearGradient>
<filter id="tile-shadow" x="-45%" y="-45%" width="190%" height="210%">
  <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#01040A" flood-opacity="0.7"/>
</filter>
<filter id="soft" x="-80%" y="-80%" width="260%" height="260%">
  <feGaussianBlur stdDeviation="16"/>
</filter>
<filter id="wide-glow" x="-80%" y="-80%" width="260%" height="260%">
  <feGaussianBlur stdDeviation="34"/>
</filter>
"""

    size, gap = 286, 40
    x0 = (CANVAS - (2 * size + gap)) / 2
    y0 = x0
    TL, TR = (x0, y0), (x0 + size + gap, y0)
    BL, BR = (x0, y0 + size + gap), (x0 + size + gap, y0 + size + gap)
    ct = lambda p: (p[0] + size / 2, p[1] + size / 2)  # noqa: E731
    c_tl, c_tr, c_bl, c_br = ct(TL), ct(TR), ct(BL), ct(BR)

    def tile(pos, fill, border=0.16, pins=False):
        x, y = pos
        out = (
            f'<rect x="{x}" y="{y}" width="{size}" height="{size}" rx="62" '
            f'fill="{fill}" stroke="#ffffff" stroke-opacity="{border}" stroke-width="1.6"/>'
        )
        if pins:
            ticks = []
            for i in range(3):
                off = 86 + i * 57
                # top / bottom / left / right pins
                ticks.append(f'<path d="M {x + off} {y - 1} v 18"/>')
                ticks.append(f'<path d="M {x + off} {y + size + 1} v -18"/>')
                ticks.append(f'<path d="M {x - 1} {y + off} h 18"/>')
                ticks.append(f'<path d="M {x + size + 1} {y + off} h -18"/>')
            out += (
                f'<g stroke="#BFE9FF" stroke-opacity="0.32" stroke-width="5" '
                f'stroke-linecap="round">{"".join(ticks)}</g>'
            )
        return out

    def glyph_brace(cx, cy, s=0.82):
        p = (
            "M 24 -72 C 9 -72 4 -60 4 -44 L 4 -18 "
            "C 4 -6 -2 0 -14 0 C -2 0 4 6 4 18 "
            "L 4 44 C 4 60 9 72 24 72"
        )
        out = ""
        for mirror in (False, True):
            sx = -s if mirror else s
            out += (
                f'<path d="{p}" transform="translate({cx + (-52 if not mirror else 52)} {cy}) '
                f'scale({sx} {s})" fill="none" stroke="#EAF2FF" stroke-width="17" '
                'stroke-linecap="round" stroke-linejoin="round"/>'
            )
        return out

    hash_glyph = (
        f'<g stroke="#CFE6FF" stroke-opacity="0.72" stroke-width="13" stroke-linecap="round">'
        f'<path d="M {c_tr[0] - 30} {c_tr[1] - 62} L {c_tr[0] - 30} {c_tr[1] + 62}"/>'
        f'<path d="M {c_tr[0] + 30} {c_tr[1] - 62} L {c_tr[0] + 30} {c_tr[1] + 62}"/>'
        f'<path d="M {c_tr[0] - 70} {c_tr[1] - 22} L {c_tr[0] + 70} {c_tr[1] - 22}"/>'
        f'<path d="M {c_tr[0] - 70} {c_tr[1] + 22} L {c_tr[0] + 70} {c_tr[1] + 22}"/>'
        "</g>"
    )
    angle_glyph = (
        f'<g fill="none" stroke="#CFE6FF" stroke-opacity="0.72" stroke-width="14" '
        'stroke-linecap="round" stroke-linejoin="round">'
        f'<path d="M {c_bl[0] - 44} {c_bl[1] - 56} L {c_bl[0] - 92} {c_bl[1]} L {c_bl[0] - 44} {c_bl[1] + 56}"/>'
        f'<path d="M {c_bl[0] + 44} {c_bl[1] - 56} L {c_bl[0] + 92} {c_bl[1]} L {c_bl[0] + 44} {c_bl[1] + 56}"/>'
        "</g>"
    )

    body = f"""
<path d="{BODY}" fill="url(#bg)"/>
<g clip-path="url(#body-clip)">
  <rect width="1024" height="1024" fill="url(#dots)"/>
  <rect width="1024" height="1024" fill="url(#glow-blue)"/>
  <rect width="1024" height="1024" fill="url(#glow-cyan)"/>
  <ellipse cx="{c_br[0]}" cy="{c_br[1]}" rx="210" ry="210" fill="#2E7BFF" fill-opacity="0.45" filter="url(#wide-glow)"/>
</g>
{rim_stroke()}
<g filter="url(#tile-shadow)">
  <g stroke="url(#trace)" stroke-linecap="round" fill="none">
    <path d="M {x0 - 18} 512 L {x0 + 2 * size + gap + 18} 512" stroke-width="4.5"/>
    <path d="M 512 {y0 - 18} L 512 {y0 + 2 * size + gap + 18}" stroke-width="4.5"/>
    <path d="M 512 512 l -72 0" stroke-width="9" stroke-opacity="0.55"/>
    <path d="M 512 512 l 72 0" stroke-width="9" stroke-opacity="0.55"/>
    <path d="M 512 512 l 0 -72" stroke-width="9" stroke-opacity="0.55"/>
    <path d="M 512 512 l 0 72" stroke-width="9" stroke-opacity="0.55"/>
  </g>
  <circle cx="512" cy="512" r="30" fill="#5CE1F5" fill-opacity="0.45" filter="url(#soft)"/>
  <circle cx="512" cy="512" r="10" fill="#D9FBFF"/>
  <circle cx="512" cy="512" r="22" fill="none" stroke="#8FE9FF" stroke-opacity="0.5" stroke-width="2"/>
  {tile(TR, "url(#glass)", 0.16)}
  {tile(BL, "url(#glass)", 0.13)}
  {tile(BR, "url(#accent)", 0.35, pins=True)}
  {tile(TL, "url(#glass)", 0.20)}
</g>
<g clip-path="url(#body-clip)">
  <rect x="{BR[0]}" y="{BR[1]}" width="{size}" height="{size}" rx="62" fill="url(#accent-sheen)"/>
</g>
{glyph_brace(c_tl[0], c_tl[1], 0.78)}
{hash_glyph}
{angle_glyph}
<g fill="none" stroke="#FFFFFF" stroke-width="17" stroke-linejoin="round">
  <path d="M {c_br[0]} {c_br[1] - 62} L {c_br[0] + 54} {c_br[1] - 31} L {c_br[0] + 54} {c_br[1] + 31}
           L {c_br[0]} {c_br[1] + 62} L {c_br[0] - 54} {c_br[1] + 31} L {c_br[0] - 54} {c_br[1] - 31} Z"/>
</g>
<circle cx="{c_br[0]}" cy="{c_br[1]}" r="15" fill="#FFFFFF"/>

"""
    defs += """
<linearGradient id="accent-sheen" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0.24"/>
  <stop offset="0.55" stop-color="#ffffff" stop-opacity="0.02"/>
  <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
"""
    return svg(body, defs)


# ---------------------------------------------------------------------------
# 2 — Orbit Core: a toolkit in orbit around one core
# ---------------------------------------------------------------------------

def concept_orbit() -> str:
    defs = """
<linearGradient id="bg" x1="0.14" y1="0" x2="0.88" y2="1.1">
  <stop offset="0" stop-color="#0D1A33"/>
  <stop offset="0.55" stop-color="#08101F"/>
  <stop offset="1" stop-color="#04070D"/>
</linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.46" r="0.55">
  <stop offset="0" stop-color="#3F7BFF" stop-opacity="0.42"/>
  <stop offset="0.55" stop-color="#3F7BFF" stop-opacity="0.10"/>
  <stop offset="1" stop-color="#3F7BFF" stop-opacity="0"/>
</radialGradient>
<radialGradient id="core" cx="0.36" cy="0.3" r="0.85">
  <stop offset="0" stop-color="#F4FAFF"/>
  <stop offset="0.22" stop-color="#A9CDFF"/>
  <stop offset="0.55" stop-color="#4F8CFF"/>
  <stop offset="0.82" stop-color="#2544C8"/>
  <stop offset="1" stop-color="#14206E"/>
</radialGradient>
<linearGradient id="chip-a" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#8DF3FF"/>
  <stop offset="1" stop-color="#2597E8"/>
</linearGradient>
<linearGradient id="chip-b" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#FFFFFF"/>
  <stop offset="1" stop-color="#BFD5F5"/>
</linearGradient>
<linearGradient id="chip-c" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#C4B5FD"/>
  <stop offset="1" stop-color="#6D4BE8"/>
</linearGradient>
<filter id="core-glow" x="-80%" y="-80%" width="260%" height="260%">
  <feGaussianBlur stdDeviation="30"/>
</filter>
<filter id="chip-shadow" x="-60%" y="-60%" width="220%" height="220%">
  <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#01040C" flood-opacity="0.75"/>
</filter>
<filter id="ring-glow" x="-50%" y="-50%" width="200%" height="200%">
  <feGaussianBlur stdDeviation="8"/>
</filter>
"""

    def glyph_brace(cx: float, cy: float, s: float) -> str:
        path = (
            "M 24 -72 C 9 -72 4 -60 4 -44 L 4 -18 "
            "C 4 -6 -2 0 -14 0 C -2 0 4 6 4 18 "
            "L 4 44 C 4 60 9 72 24 72"
        )
        out = ""
        for mirror in (False, True):
            sx = -s if mirror else s
            dx = cx + (-s * 24 if not mirror else s * 24)
            out += (
                f'<path d="{path}" transform="translate({dx:.2f} {cy}) scale({sx:.3f} {s:.3f})" '
                'fill="none" stroke="#12306B" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>'
            )
        return out

    def glyph_hash(cx: float, cy: float, s: float) -> str:
        w, h, k = 14 * s, 26 * s, 30 * s
        return (
            f'<g stroke="#0B2A56" stroke-width="{7*s:.1f}" stroke-linecap="round">'
            f'<path d="M {cx-w} {cy-h} L {cx-w} {cy+h}"/>'
            f'<path d="M {cx+w} {cy-h} L {cx+w} {cy+h}"/>'
            f'<path d="M {cx-k} {cy-9*s} L {cx+k} {cy-9*s}"/>'
            f'<path d="M {cx-k} {cy+9*s} L {cx+k} {cy+9*s}"/>'
            "</g>"
        )

    def glyph_chevron(cx: float, cy: float, size: float) -> str:
        k = size * 0.22
        return (
            f'<path d="M {cx - k} {cy - k * 1.25} L {cx + k * 0.85} {cy} L {cx - k} {cy + k * 1.25}" '
            f'fill="none" stroke="#0B2A56" stroke-width="{size*0.11:.1f}" stroke-linecap="round" stroke-linejoin="round"/>'
        )

    def glyph_plus(cx: float, cy: float, size: float) -> str:
        k = size * 0.22
        w = size * 0.11
        return (
            f'<path d="M {cx - k} {cy} L {cx + k} {cy} M {cx} {cy - k} L {cx} {cy + k}" '
            f'fill="none" stroke="#0B2A56" stroke-width="{w:.1f}" stroke-linecap="round"/>'
        )

    def glyph_dot(cx: float, cy: float, size: float) -> str:
        r = size * 0.14
        return (
            f'<circle cx="{cx}" cy="{cy}" r="{r:.1f}" fill="#221652" fill-opacity="0.6"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r*0.45:.1f}" fill="#A78BFA"/>'
        )

    def chip(cx: float, cy: float, size: float, fill: str, glyph: str) -> str:
        half = size / 2
        return f"""
<g transform="rotate(-22 {cx:.2f} {cy:.2f})" filter="url(#chip-shadow)">
  <rect x="{cx - half:.2f}" y="{cy - half:.2f}" width="{size}" height="{size}" rx="{size * 0.28:.1f}" fill="{fill}"/>
  <rect x="{cx - half:.2f}" y="{cy - half:.2f}" width="{size}" height="{size}" rx="{size * 0.28:.1f}" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="2"/>
  {glyph}
</g>"""

    positions = [0, 120, 240]
    chips = []
    for i, deg in enumerate(positions):
        t = math.radians(deg)
        lx = 512 + 340 * math.cos(t)
        ly = 512 + 130 * math.sin(t)
        ang = math.radians(-22)
        dx, dy = lx - 512, ly - 512
        x = 512 + dx * math.cos(ang) - dy * math.sin(ang)
        y = 512 + dx * math.sin(ang) + dy * math.cos(ang)
        fill = ["url(#chip-a)", "url(#chip-b)", "url(#chip-c)"][i]
        size = 92 if y > 512 else 84
        s = size / 96
        if i == 0:
            glyph = glyph_plus(x, y, size)
        elif i == 1:
            glyph = glyph_hash(x, y, s)
        else:
            glyph = glyph_dot(x, y, size)
        chips.append((y, chip(x, y, size, fill, glyph)))

    back = "".join(c for y, c in chips if y <= 512)
    front = "".join(c for y, c in chips if y > 512)

    body = f"""
<path d="{BODY}" fill="url(#bg)"/>
<g clip-path="url(#body-clip)">
  <rect width="1024" height="1024" fill="url(#dots)"/>
  <rect width="1024" height="1024" fill="url(#glow)"/>
  <circle cx="512" cy="512" r="210" fill="#2E6BFF" fill-opacity="0.35" filter="url(#core-glow)"/>
</g>
{rim_stroke()}
{back}
<g transform="rotate(-22 512 512)">
  <ellipse cx="512" cy="512" rx="340" ry="130" fill="none" stroke="#7FE7FF" stroke-opacity="0.18" stroke-width="22" filter="url(#ring-glow)"/>
  <ellipse cx="512" cy="512" rx="340" ry="130" fill="none" stroke="#CFE6FF" stroke-opacity="0.32" stroke-width="5"/>
</g>
<circle cx="512" cy="512" r="132" fill="url(#core)"/>
<circle cx="512" cy="512" r="132" fill="none" stroke="#BFD9FF" stroke-opacity="0.45" stroke-width="2"/>
<ellipse cx="458" cy="446" rx="62" ry="36" fill="#ffffff" fill-opacity="0.35" filter="url(#core-glow)"/>
<g transform="rotate(-22 512 512)">
  <path d="M 172 512 A 340 130 0 0 1 852 512" fill="none" stroke="#EAF6FF" stroke-opacity="0.55" stroke-width="6" stroke-linecap="round"/>
</g>
{front}
"""
    return svg(body, defs)


# ---------------------------------------------------------------------------
# 3 — Prism Split: one input, many utilities
# ---------------------------------------------------------------------------

def concept_prism() -> str:
    defs = """
<linearGradient id="bg" x1="0.14" y1="0" x2="0.88" y2="1.1">
  <stop offset="0" stop-color="#101C36"/>
  <stop offset="0.55" stop-color="#090F1D"/>
  <stop offset="1" stop-color="#04070D"/>
</linearGradient>
<radialGradient id="glow-violet" cx="0.8" cy="0.78" r="0.6">
  <stop offset="0" stop-color="#8B5CF6" stop-opacity="0.26"/>
  <stop offset="1" stop-color="#8B5CF6" stop-opacity="0"/>
</radialGradient>
<radialGradient id="glow-cyan" cx="0.16" cy="0.24" r="0.6">
  <stop offset="0" stop-color="#22D3EE" stop-opacity="0.22"/>
  <stop offset="1" stop-color="#22D3EE" stop-opacity="0"/>
</radialGradient>
<linearGradient id="glass" x1="0.15" y1="0" x2="0.85" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.34"/>
  <stop offset="0.45" stop-color="#CFE2FF" stop-opacity="0.14"/>
  <stop offset="1" stop-color="#7FB0FF" stop-opacity="0.20"/>
</linearGradient>
<linearGradient id="spectrum" gradientUnits="userSpaceOnUse" x1="300" y1="512" x2="724" y2="512">
  <stop offset="0" stop-color="#22D3EE" stop-opacity="0.55"/>
  <stop offset="0.5" stop-color="#4F8CFF" stop-opacity="0.25"/>
  <stop offset="1" stop-color="#A78BFA" stop-opacity="0.55"/>
</linearGradient>
<radialGradient id="flare" cx="0.5" cy="0.5" r="0.5">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.9"/>
  <stop offset="0.45" stop-color="#DFF6FF" stop-opacity="0.35"/>
  <stop offset="1" stop-color="#DFF6FF" stop-opacity="0"/>
</radialGradient>
<linearGradient id="beam" x1="0" y1="1" x2="1" y2="0">
  <stop offset="0" stop-color="#E3EEFF"/>
  <stop offset="1" stop-color="#FFFFFF"/>
</linearGradient>
<filter id="beam-glow" x="-60%" y="-60%" width="220%" height="220%">
  <feGaussianBlur stdDeviation="14"/>
</filter>
<filter id="prism-glow" x="-60%" y="-60%" width="220%" height="220%">
  <feGaussianBlur stdDeviation="26"/>
</filter>
"""
    tri = rounded_polygon([(512, 286), (300, 730), (724, 730)], 44)
    defs += f'<clipPath id="tri-clip"><path d="{tri}"/></clipPath>'

    body = f"""
<path d="{BODY}" fill="url(#bg)"/>
<g clip-path="url(#body-clip)">
  <rect width="1024" height="1024" fill="url(#dots)"/>
  <rect width="1024" height="1024" fill="url(#glow-violet)"/>
  <rect width="1024" height="1024" fill="url(#glow-cyan)"/>
</g>
{rim_stroke()}
<g filter="url(#prism-glow)" opacity="0.55">
  <path d="{tri}" fill="#4F7BFF"/>
</g>
<g stroke="#FFFFFF" stroke-linecap="round">
  <path d="M 152 512 L 416 512" stroke="#CFE0FF" stroke-opacity="0.22" stroke-width="70" filter="url(#beam-glow)"/>
  <path d="M 152 512 L 410 512" stroke="url(#beam)" stroke-width="34"/>
</g>
<path d="{tri}" fill="url(#glass)" stroke="#E6F1FF" stroke-opacity="0.82" stroke-width="3"/>
<g clip-path="url(#tri-clip)">
  <rect width="1024" height="1024" fill="url(#spectrum)" opacity="0.5"/>
  <path d="M 380 512 L 622 512" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="34" filter="url(#beam-glow)"/>
  <path d="M 404 512 L 620 512" stroke="#FFFFFF" stroke-opacity="0.62" stroke-width="16" stroke-linecap="round"/>
  <ellipse cx="624" cy="512" rx="64" ry="96" fill="url(#flare)"/>
</g>
<circle cx="404" cy="512" r="46" fill="url(#flare)" opacity="0.75"/>
<circle cx="404" cy="512" r="7" fill="#FFFFFF"/>
<g stroke-linecap="round">
  <g opacity="0.55" filter="url(#beam-glow)">
    <path d="M 620 512 L 878 396" stroke="#67E8F9" stroke-width="52"/>
    <path d="M 620 512 L 884 512" stroke="#4F8CFF" stroke-width="52"/>
    <path d="M 620 512 L 878 628" stroke="#A78BFA" stroke-width="52"/>
  </g>
  <path d="M 620 512 L 878 396" stroke="#A5F3FC" stroke-width="30"/>
  <path d="M 620 512 L 884 512" stroke="#8FB8FF" stroke-width="30"/>
  <path d="M 620 512 L 878 628" stroke="#C4B5FD" stroke-width="30"/>
</g>
<circle cx="620" cy="512" r="44" fill="url(#flare)"/>
<circle cx="620" cy="512" r="12" fill="#FFFFFF"/>
"""
    return svg(body, defs)


# ---------------------------------------------------------------------------
# 4 — Circuit Case: a hard-edged tech toolbox
# ---------------------------------------------------------------------------

def concept_case() -> str:
    defs = """
<linearGradient id="bg" x1="0.12" y1="0" x2="0.9" y2="1.08">
  <stop offset="0" stop-color="#0B1830"/>
  <stop offset="0.52" stop-color="#070D19"/>
  <stop offset="1" stop-color="#03060C"/>
</linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.52" r="0.62">
  <stop offset="0" stop-color="#2E7BFF" stop-opacity="0.34"/>
  <stop offset="0.55" stop-color="#2E7BFF" stop-opacity="0.10"/>
  <stop offset="1" stop-color="#2E7BFF" stop-opacity="0"/>
</radialGradient>
<linearGradient id="body" x1="0.1" y1="0" x2="0.9" y2="1">
  <stop offset="0" stop-color="#33528F"/>
  <stop offset="0.5" stop-color="#1B3157"/>
  <stop offset="1" stop-color="#0E1C36"/>
</linearGradient>
<linearGradient id="lid" x1="0.1" y1="0" x2="0.9" y2="1">
  <stop offset="0" stop-color="#3B5C9C"/>
  <stop offset="1" stop-color="#1D3359"/>
</linearGradient>
<linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#8FE9FF" stop-opacity="0.95"/>
  <stop offset="0.5" stop-color="#4F8CFF" stop-opacity="0.55"/>
  <stop offset="1" stop-color="#8B5CF6" stop-opacity="0.5"/>
</linearGradient>
<linearGradient id="slot" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#9DF3FF"/>
  <stop offset="1" stop-color="#2E8BFF"/>
</linearGradient>
<filter id="case-shadow" x="-40%" y="-40%" width="180%" height="190%">
  <feDropShadow dx="0" dy="26" stdDeviation="30" flood-color="#01040A" flood-opacity="0.8"/>
</filter>
<linearGradient id="deck-shade" x1="0.5" y1="0" x2="0.5" y2="1">
  <stop offset="0" stop-color="#000308" stop-opacity="0.75"/>
  <stop offset="1" stop-color="#000308" stop-opacity="0"/>
</linearGradient>
<linearGradient id="deck-bounce" x1="0.5" y1="0" x2="0.5" y2="1">
  <stop offset="0" stop-color="#2E7BFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#2E7BFF" stop-opacity="0.16"/>
</linearGradient>
<filter id="neon" x="-80%" y="-80%" width="260%" height="260%">
  <feGaussianBlur stdDeviation="12"/>
</filter>
<filter id="neon-wide" x="-80%" y="-80%" width="260%" height="260%">
  <feGaussianBlur stdDeviation="26"/>
</filter>
"""

    body = f"""
<path d="{BODY}" fill="url(#bg)"/>
<g clip-path="url(#body-clip)">
  <rect width="1024" height="1024" fill="url(#dots)"/>
  <rect width="1024" height="1024" fill="url(#glow)"/>
</g>
{rim_stroke()}
<g filter="url(#case-shadow)">
  <path d="M 452 350 L 452 306 Q 452 276 482 276 L 542 276 Q 572 276 572 306 L 572 350"
        fill="none" stroke="url(#edge)" stroke-width="26" stroke-linecap="round"/>
  <rect x="242" y="452" width="540" height="296" rx="52" fill="url(#body)"/>
  <rect x="242" y="452" width="540" height="296" rx="52" fill="none" stroke="url(#edge)" stroke-width="2.4"/>
  <rect x="242" y="342" width="540" height="126" rx="52" fill="url(#lid)"/>
  <rect x="242" y="342" width="540" height="126" rx="52" fill="none" stroke="url(#edge)" stroke-width="2.4"/>
</g>
<g clip-path="url(#body-clip)">
  <rect x="242" y="458" width="540" height="10" fill="#7FE7FF" fill-opacity="0.25" filter="url(#neon)"/>
  <rect x="258" y="454" width="508" height="3" fill="#BFF6FF" fill-opacity="0.8"/>
</g>
<g stroke="#7FE7FF" stroke-opacity="0.45" stroke-width="3" fill="none">
  <path d="M 300 596 h 84 v 38 h 84"/>
  <path d="M 724 596 h -84 v 38 h -84"/>
  <path d="M 300 660 h 60"/>
  <path d="M 724 660 h -60"/>
</g>
<g>
  <circle cx="300" cy="596" r="6" fill="#8FF3FF"/>
  <circle cx="724" cy="596" r="6" fill="#8FF3FF"/>
  <circle cx="468" cy="634" r="5" fill="#8FF3FF" fill-opacity="0.7"/>
  <circle cx="556" cy="634" r="5" fill="#8FF3FF" fill-opacity="0.7"/>
</g>
<g>
  <rect x="404" y="560" width="52" height="52" rx="14" fill="#0D1A30" stroke="#63D8FF" stroke-opacity="0.5" stroke-width="2"/>
  <rect x="472" y="560" width="52" height="52" rx="14" fill="#0D1A30" stroke="#63D8FF" stroke-opacity="0.5" stroke-width="2"/>
  <rect x="540" y="560" width="52" height="52" rx="14" fill="url(#slot)" stroke="#CFFAFF" stroke-width="2"/>
  <rect x="608" y="560" width="52" height="52" rx="14" fill="#0D1A30" stroke="#63D8FF" stroke-opacity="0.5" stroke-width="2"/>
</g>
<circle cx="566" cy="586" r="30" fill="#7FE7FF" fill-opacity="0.55" filter="url(#neon-wide)"/>
<g>
  <g stroke="#8FE9FF" stroke-opacity="0.55" stroke-width="5" stroke-linecap="round">
  <path d="M 234 536 h -18"/><path d="M 234 588 h -18"/><path d="M 234 640 h -18"/><path d="M 234 692 h -18"/>
  <path d="M 790 536 h 18"/><path d="M 790 588 h 18"/><path d="M 790 640 h 18"/><path d="M 790 692 h 18"/>
</g>
<circle cx="512" cy="438" r="30" fill="#0A1426" stroke="url(#edge)" stroke-width="3"/>
  <circle cx="512" cy="438" r="11" fill="#8FF3FF"/>
  <circle cx="512" cy="438" r="22" fill="#7FE7FF" fill-opacity="0.35" filter="url(#neon)"/>
</g>
"""
    return svg(body, defs)


def concept_module_case() -> str:
    """Case shell (04) + four tool modules (01) + circuit bus (04)."""
    defs = """
<linearGradient id="bg" x1="0.12" y1="0" x2="0.9" y2="1.08">
  <stop offset="0" stop-color="#0B1830"/>
  <stop offset="0.52" stop-color="#070D19"/>
  <stop offset="1" stop-color="#03060C"/>
</linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.54" r="0.62">
  <stop offset="0" stop-color="#2E7BFF" stop-opacity="0.36"/>
  <stop offset="0.55" stop-color="#2E7BFF" stop-opacity="0.10"/>
  <stop offset="1" stop-color="#2E7BFF" stop-opacity="0"/>
</radialGradient>
<linearGradient id="body" x1="0.1" y1="0" x2="0.9" y2="1">
  <stop offset="0" stop-color="#35548F"/>
  <stop offset="0.5" stop-color="#1C3258"/>
  <stop offset="1" stop-color="#0E1C36"/>
</linearGradient>
<linearGradient id="lid" x1="0.1" y1="0" x2="0.9" y2="1">
  <stop offset="0" stop-color="#3D5F9F"/>
  <stop offset="1" stop-color="#1E355C"/>
</linearGradient>
<linearGradient id="deck" x1="0.5" y1="0" x2="0.5" y2="1">
  <stop offset="0" stop-color="#0A1528"/>
  <stop offset="1" stop-color="#060D1B"/>
</linearGradient>
<linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#8FE9FF" stop-opacity="0.95"/>
  <stop offset="0.5" stop-color="#4F8CFF" stop-opacity="0.55"/>
  <stop offset="1" stop-color="#8B5CF6" stop-opacity="0.5"/>
</linearGradient>
<linearGradient id="glass" x1="0.1" y1="0" x2="0.9" y2="1">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0.13"/>
  <stop offset="1" stop-color="#ffffff" stop-opacity="0.04"/>
</linearGradient>
<linearGradient id="accent" x1="0.05" y1="0" x2="0.95" y2="1">
  <stop offset="0" stop-color="#6EE7FF"/>
  <stop offset="0.45" stop-color="#4F8CFF"/>
  <stop offset="1" stop-color="#2E4FE0"/>
</linearGradient>
<linearGradient id="accent-sheen" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0.26"/>
  <stop offset="0.55" stop-color="#ffffff" stop-opacity="0.02"/>
  <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<filter id="case-shadow" x="-40%" y="-40%" width="180%" height="190%">
  <feDropShadow dx="0" dy="26" stdDeviation="30" flood-color="#01040A" flood-opacity="0.8"/>
</filter>
<filter id="tile-shadow" x="-50%" y="-50%" width="200%" height="220%">
  <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#01040A" flood-opacity="0.65"/>
</filter>
<linearGradient id="deck-shade" x1="0.5" y1="0" x2="0.5" y2="1">
  <stop offset="0" stop-color="#000308" stop-opacity="0.75"/>
  <stop offset="1" stop-color="#000308" stop-opacity="0"/>
</linearGradient>
<linearGradient id="deck-bounce" x1="0.5" y1="0" x2="0.5" y2="1">
  <stop offset="0" stop-color="#2E7BFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#2E7BFF" stop-opacity="0.16"/>
</linearGradient>
<filter id="neon" x="-80%" y="-80%" width="260%" height="260%">
  <feGaussianBlur stdDeviation="12"/>
</filter>
<filter id="neon-wide" x="-80%" y="-80%" width="260%" height="260%">
  <feGaussianBlur stdDeviation="26"/>
</filter>
"""

    # ---- glyphs, one consistent optical weight (h about 50) ----
    def brace(cx, cy, s=0.34):
        path = (
            "M 24 -72 C 9 -72 4 -60 4 -44 L 4 -18 "
            "C 4 -6 -2 0 -14 0 C -2 0 4 6 4 18 "
            "L 4 44 C 4 60 9 72 24 72"
        )
        out = ""
        for mirror in (False, True):
            sx = -s if mirror else s
            dx = cx + (-24 if not mirror else 24)
            out += (
                f'<path d="{path}" transform="translate({dx:.2f} {cy}) scale({sx:.3f} {s:.3f})" '
                'fill="none" stroke="#EAF2FF" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>'
            )
        return out

    def hash_glyph(cx, cy, k=0.44):
        w, h, j = 30 * k, 62 * k, 70 * k
        return (
            f'<g stroke="#CFE6FF" stroke-opacity="0.75" stroke-width="{14*k:.1f}" stroke-linecap="round">'
            f'<path d="M {cx-w:.1f} {cy-h:.1f} L {cx-w:.1f} {cy+h:.1f}"/>'
            f'<path d="M {cx+w:.1f} {cy-h:.1f} L {cx+w:.1f} {cy+h:.1f}"/>'
            f'<path d="M {cx-j:.1f} {cy-20*k:.1f} L {cx+j:.1f} {cy-20*k:.1f}"/>'
            f'<path d="M {cx-j:.1f} {cy+20*k:.1f} L {cx+j:.1f} {cy+20*k:.1f}"/>'
            "</g>"
        )

    def angle_glyph(cx, cy, k=0.42):
        return (
            f'<g fill="none" stroke="#CFE6FF" stroke-opacity="0.75" stroke-width="{14*k:.1f}" '
            'stroke-linecap="round" stroke-linejoin="round">'
            f'<path d="M {cx-44*k:.1f} {cy-56*k:.1f} L {cx-92*k:.1f} {cy:.1f} L {cx-44*k:.1f} {cy+56*k:.1f}"/>'
            f'<path d="M {cx+44*k:.1f} {cy-56*k:.1f} L {cx+92*k:.1f} {cy:.1f} L {cx+44*k:.1f} {cy+56*k:.1f}"/>'
            "</g>"
        )

    def nut_glyph(cx, cy, r=25):
        pts = []
        for i in range(6):
            a = math.radians(-90 + i * 60)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        d = "M " + " L ".join(f"{x:.2f} {y:.2f}" for x, y in pts) + " Z"
        return (
            f'<path d="{d}" fill="none" stroke="#FFFFFF" stroke-width="10" stroke-linejoin="round"/>'
            f'<circle cx="{cx}" cy="{cy}" r="6" fill="#FFFFFF"/>'
        )

    # ---- layout ----
    tile, gap = 108, 12
    total = 4 * tile + 3 * gap
    x0 = (CANVAS - total) / 2
    y0 = 512
    xs = [x0 + i * (tile + gap) for i in range(4)]
    centers = [(x + tile / 2, y0 + tile / 2) for x in xs]
    deck = (262, 480, 500, 244)  # x, y, w, h
    defs += (
        f'<clipPath id="deck-clip"><rect x="{deck[0]}" y="{deck[1]}" '
        f'width="{deck[2]}" height="{deck[3]}" rx="36"/></clipPath>'
    )
    bus_y = 690

    def tile_rect(i):
        x = xs[i]
        if i == 2:
            return (
                f'<g filter="url(#tile-shadow)">'
                f'<rect x="{x}" y="{y0}" width="{tile}" height="{tile}" rx="26" fill="url(#accent)" stroke="#DFF6FF" stroke-opacity="0.6" stroke-width="1.6"/>'
                f'</g>'
            )
        return (
            f'<g filter="url(#tile-shadow)">'
            f'<rect x="{x}" y="{y0}" width="{tile}" height="{tile}" rx="26" fill="url(#glass)" stroke="#ffffff" stroke-opacity="0.18" stroke-width="1.4"/>'
            f'</g>'
        )

    stubs = "".join(
        f'<path d="M {c[0]:.0f} {y0 + tile} L {c[0]:.0f} {bus_y}"/>' for c in centers
    )
    nodes = "".join(f'<circle cx="{c[0]:.0f}" cy="{bus_y}" r="5"/>' for c in centers)

    body = f"""
<path d="{BODY}" fill="url(#bg)"/>
<g clip-path="url(#body-clip)">
  <rect width="1024" height="1024" fill="url(#dots)"/>
  <rect width="1024" height="1024" fill="url(#glow)"/>
</g>
{rim_stroke()}
<g filter="url(#case-shadow)">
  <path d="M 448 320 L 448 284 Q 448 254 476 254 L 548 254 Q 576 254 576 284 L 576 320"
        fill="none" stroke="url(#edge)" stroke-width="30" stroke-linecap="round"/>
  <rect x="236" y="432" width="552" height="338" rx="54" fill="url(#body)"/>
  <rect x="236" y="432" width="552" height="338" rx="54" fill="none" stroke="url(#edge)" stroke-width="2.4"/>
  <rect x="236" y="320" width="552" height="132" rx="54" fill="url(#lid)"/>
  <rect x="236" y="320" width="552" height="132" rx="54" fill="none" stroke="url(#edge)" stroke-width="2.4"/>
</g>
<g clip-path="url(#body-clip)">
  <rect x="242" y="440" width="540" height="10" fill="#7FE7FF" fill-opacity="0.28" filter="url(#neon)"/>
  <rect x="252" y="436" width="520" height="3" fill="#BFF6FF" fill-opacity="0.9"/>
</g>
<g>
  <rect x="{deck[0]}" y="{deck[1]}" width="{deck[2]}" height="{deck[3]}" rx="36" fill="url(#deck)"/>
  <g clip-path="url(#deck-clip)">
    <rect x="{deck[0]}" y="{deck[1]}" width="{deck[2]}" height="56" fill="url(#deck-shade)"/>
    <rect x="{deck[0]}" y="{deck[1] + deck[3] - 70}" width="{deck[2]}" height="70" fill="url(#deck-bounce)"/>
  </g>
  <rect x="{deck[0]}" y="{deck[1]}" width="{deck[2]}" height="{deck[3]}" rx="36" fill="none" stroke="#7FE7FF" stroke-opacity="0.20" stroke-width="2"/>
  <rect x="{deck[0] + 2}" y="{deck[1] + 2}" width="{deck[2] - 4}" height="2" fill="#BFE9FF" fill-opacity="0.28"/>
</g>
<g stroke="#8FE9FF" stroke-opacity="0.6" stroke-width="5" stroke-linecap="round">
  <path d="M 236 492 h -20"/><path d="M 236 548 h -20"/><path d="M 236 604 h -20"/><path d="M 236 660 h -20"/>
  <path d="M 788 492 h 20"/><path d="M 788 548 h 20"/><path d="M 788 604 h 20"/><path d="M 788 660 h 20"/>
</g>
<circle cx="{centers[2][0]:.0f}" cy="{centers[2][1]:.0f}" r="96" fill="#2E7BFF" fill-opacity="0.42" filter="url(#neon-wide)"/>
<g stroke="#7FE7FF" stroke-opacity="0.62" stroke-width="3.6" fill="none">
  <path d="M 512 466 L 512 {bus_y}"/>
  <path d="M 286 {bus_y} L 738 {bus_y}"/>
  {stubs}
</g>
<g fill="#8FF3FF">
  {nodes}
  <circle cx="512" cy="{bus_y}" r="6"/>
</g>
{tile_rect(0)}
{tile_rect(1)}
{tile_rect(2)}
{tile_rect(3)}
<g clip-path="url(#body-clip)">
  <rect x="{xs[2]}" y="{y0}" width="{tile}" height="{tile}" rx="26" fill="url(#accent-sheen)"/>
</g>
{brace(centers[0][0], centers[0][1])}
{hash_glyph(centers[1][0], centers[1][1])}
{nut_glyph(centers[2][0], centers[2][1])}
{angle_glyph(centers[3][0], centers[3][1])}
<g>
  <circle cx="512" cy="438" r="32" fill="#0A1426" stroke="url(#edge)" stroke-width="3"/>
  <circle cx="512" cy="438" r="10" fill="#8FF3FF"/>
  <circle cx="512" cy="438" r="24" fill="#7FE7FF" fill-opacity="0.35" filter="url(#neon)"/>
</g>
"""
    return svg(body, defs)


if __name__ == "__main__":
    files = {
        "v2-nexus-grid.svg": concept_nexus(),
        "v2-orbit-core.svg": concept_orbit(),
        "v2-prism-split.svg": concept_prism(),
        "v2-circuit-case.svg": concept_case(),
        "v2-module-case.svg": concept_module_case(),
    }
    for name, text in files.items():
        (OUT / name).write_text(text, encoding="utf-8")
        print("wrote", OUT / name, len(text), "bytes")
