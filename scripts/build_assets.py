#!/usr/bin/env python3
"""Generates the animated SVGs used by README.md.

GitHub strips JavaScript and external CSS from READMEs, but it does render SVG
files that carry their own SMIL / CSS animation. So the "3D" here is real: every
shape is rotated and perspective-projected in Python, and the resulting frames
are baked into <animate> keyframes.

Run:  python scripts/build_assets.py
"""
import math
import os
import random

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets")
W = 1000

# ---- palette -------------------------------------------------------------
BG = "#05060A"
VIOLET = "#8B5CF6"
CYAN = "#22D3EE"
PINK = "#F472B6"
LIME = "#A3E635"
TEXT = "#F4F5F9"
MUTED = "#9AA3B5"
SANS = "'Inter','SF Pro Display','Segoe UI',system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif"
MONO = "'JetBrains Mono','SF Mono',Menlo,Consolas,'Liberation Mono',monospace"

random.seed(7)


# ---- 3D helpers ----------------------------------------------------------
def rot(v, ax, ay, az):
    x, y, z = v
    c, s = math.cos(az), math.sin(az)
    x, y = x * c - y * s, x * s + y * c
    c, s = math.cos(ax), math.sin(ax)
    y, z = y * c - z * s, y * s + z * c
    c, s = math.cos(ay), math.sin(ay)
    x, z = x * c + z * s, -x * s + z * c
    return x, y, z


def project(v, cx, cy, scale, cam=4.4):
    x, y, z = v
    f = cam / (cam + z)
    return cx + x * scale * f, cy - y * scale * f, z, f


def front(z):
    """0 (far) .. 1 (near) for a unit-radius object."""
    return max(0.0, min(1.0, (1 - z) / 2))


def fmt(vals):
    return ";".join(vals)


def icosahedron():
    p = (1 + math.sqrt(5)) / 2
    raw = []
    for a in (-1, 1):
        for b in (-p, p):
            raw += [(0, a, b), (a, b, 0), (b, 0, a)]
    n = math.sqrt(1 + p * p)
    verts = [(x / n, y / n, z / n) for x, y, z in raw]
    edges = []
    for i in range(len(verts)):
        for j in range(i + 1, len(verts)):
            d = math.dist(raw[i], raw[j])
            if abs(d - 2) < 1e-6:
                edges.append((i, j))
    return verts, edges


def octahedron():
    verts = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]
    edges = [(i, j) for i in range(6) for j in range(i + 1, 6)
             if math.dist(verts[i], verts[j]) < 1.5]
    return verts, edges


def cube():
    k = 1 / math.sqrt(3)
    verts = [(x * k, y * k, z * k) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    edges = [(i, j) for i in range(8) for j in range(i + 1, 8)
             if abs(math.dist(verts[i], verts[j]) - 2 * k) < 1e-6]
    return verts, edges


def wireframe(shape, cx, cy, scale, color, rotfn, frames, dur, width=1.5, dot=3.0, begin=0):
    """Animated wireframe: one <path> per edge + one <circle> per vertex."""
    verts, edges = shape
    per_frame = []
    for k in range(frames + 1):
        t = k / frames
        ax, ay, az = rotfn(t)
        per_frame.append([project(rot(v, ax, ay, az), cx, cy, scale) for v in verts])
    out = []
    for i, j in edges:
        d, o = [], []
        for pts in per_frame:
            (x1, y1, z1, _), (x2, y2, z2, _) = pts[i], pts[j]
            d.append(f"M{x1:.1f} {y1:.1f}L{x2:.1f} {y2:.1f}")
            o.append(f"{0.12 + 0.88 * front((z1 + z2) / 2) ** 1.4:.2f}")
        out.append(
            f'<path d="{d[0]}" stroke="{color}" stroke-width="{width}" fill="none" stroke-linecap="round">'
            f'<animate attributeName="d" values="{fmt(d)}" dur="{dur}s" repeatCount="indefinite"/>'
            f'<animate attributeName="stroke-opacity" values="{fmt(o)}" dur="{dur}s" repeatCount="indefinite"/></path>'
        )
    for i in range(len(verts)):
        xs, ys, rs, os_ = [], [], [], []
        for pts in per_frame:
            x, y, z, f = pts[i]
            xs.append(f"{x:.1f}")
            ys.append(f"{y:.1f}")
            rs.append(f"{dot * (0.55 + 0.9 * front(z)):.2f}")
            os_.append(f"{0.25 + 0.75 * front(z):.2f}")
        out.append(
            f'<circle cx="{xs[0]}" cy="{ys[0]}" r="{rs[0]}" fill="#fff">'
            f'<animate attributeName="cx" values="{fmt(xs)}" dur="{dur}s" repeatCount="indefinite"/>'
            f'<animate attributeName="cy" values="{fmt(ys)}" dur="{dur}s" repeatCount="indefinite"/>'
            f'<animate attributeName="r" values="{fmt(rs)}" dur="{dur}s" repeatCount="indefinite"/>'
            f'<animate attributeName="opacity" values="{fmt(os_)}" dur="{dur}s" repeatCount="indefinite"/></circle>'
        )
    return "".join(out)


def ring(cx, cy, scale, radius, color, rotfn, frames, dur, segs=6, pts_per=7, width=1.6,
         sat_phase=None, sat_color="#fff"):
    """A 3D circle drawn as arcs whose brightness follows depth, plus an optional satellite."""
    n = segs * (pts_per - 1)
    base = [(radius * math.cos(2 * math.pi * k / n), 0.0, radius * math.sin(2 * math.pi * k / n))
            for k in range(n)]
    frames_pts = []
    for k in range(frames + 1):
        ax, ay, az = rotfn(k / frames)
        frames_pts.append([project(rot(v, ax, ay, az), cx, cy, scale) for v in base])
    out = []
    for s in range(segs):
        idx = [(s * (pts_per - 1) + q) % n for q in range(pts_per)]
        d, o = [], []
        for pts in frames_pts:
            seg = [pts[i] for i in idx]
            d.append("M" + "L".join(f"{p[0]:.1f} {p[1]:.1f}" for p in seg))
            zmid = sum(p[2] for p in seg) / len(seg) / radius
            o.append(f"{0.08 + 0.8 * front(max(-1, min(1, zmid))) ** 1.3:.2f}")
        out.append(
            f'<path d="{d[0]}" stroke="{color}" stroke-width="{width}" fill="none" stroke-linecap="round">'
            f'<animate attributeName="d" values="{fmt(d)}" dur="{dur}s" repeatCount="indefinite"/>'
            f'<animate attributeName="stroke-opacity" values="{fmt(o)}" dur="{dur}s" repeatCount="indefinite"/></path>'
        )
    if sat_phase is not None:
        # satellite travels the ring: it is a point whose angle advances 2 turns per loop
        xs, ys, rs = [], [], []
        for k in range(frames + 1):
            t = k / frames
            ang = 2 * math.pi * (sat_phase + 2 * t)
            v = (radius * math.cos(ang), 0.0, radius * math.sin(ang))
            ax, ay, az = rotfn(t)
            x, y, z, _ = project(rot(v, ax, ay, az), cx, cy, scale)
            xs.append(f"{x:.1f}")
            ys.append(f"{y:.1f}")
            rs.append(f"{3 + 3.2 * front(max(-1, min(1, z / radius))):.2f}")
        out.append(
            f'<circle r="{rs[0]}" fill="{sat_color}" filter="url(#soft)">'
            f'<animate attributeName="cx" values="{fmt(xs)}" dur="{dur}s" repeatCount="indefinite"/>'
            f'<animate attributeName="cy" values="{fmt(ys)}" dur="{dur}s" repeatCount="indefinite"/>'
            f'<animate attributeName="r" values="{fmt(rs)}" dur="{dur}s" repeatCount="indefinite"/></circle>'
        )
    return "".join(out)


# ---- shared svg pieces ---------------------------------------------------
def svg(width, height, defs, style, body):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">'
        f"<defs>{defs}</defs><style>{style}</style>{body}</svg>"
    )


def write(name, content):
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"{name:<18}{len(content) / 1024:7.1f} KB")


COMMON_DEFS = (
    f'<filter id="soft" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="3.2"/></filter>'
    f'<filter id="bloom" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>'
)

STARS_CSS = (
    ".st{animation:tw 4s ease-in-out infinite}"
    "@keyframes tw{0%,100%{opacity:.1}50%{opacity:.7}}"
)


def stars(w, h, n, seed=1):
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        x, y = rnd.uniform(0, w), rnd.uniform(0, h)
        r = rnd.uniform(0.5, 1.5)
        out.append(
            f'<circle class="st" cx="{x:.0f}" cy="{y:.0f}" r="{r:.1f}" fill="#fff" '
            f'style="animation-delay:-{rnd.uniform(0, 4):.1f}s;animation-duration:{rnd.uniform(2.5, 6):.1f}s"/>'
        )
    return "".join(out)


def aurora(w, h, blobs):
    """blobs: (cx, cy, r, color, dx, dy, dur)"""
    defs, body = [], []
    for i, (cx, cy, r, col, dx, dy, dur) in enumerate(blobs):
        defs.append(
            f'<radialGradient id="au{i}"><stop offset="0" stop-color="{col}" stop-opacity=".55"/>'
            f'<stop offset="1" stop-color="{col}" stop-opacity="0"/></radialGradient>'
        )
        body.append(
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#au{i})">'
            f'<animateTransform attributeName="transform" type="translate" values="0 0;{dx} {dy};0 0" '
            f'dur="{dur}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.5;1" '
            f'keySplines=".45 0 .55 1;.45 0 .55 1"/></circle>'
        )
    return "".join(defs), "".join(body)


def header(x, y, kicker, title, sub=None, delay=0.0):
    s = (
        f'<g class="rise" style="animation-delay:{delay}s">'
        f'<text x="{x}" y="{y}" class="kick">{kicker}</text>'
        f'<text x="{x}" y="{y + 50}" class="h2">{title}</text>'
    )
    if sub:
        s += f'<text x="{x}" y="{y + 84}" class="sub">{sub}</text>'
    s += "</g>"
    return s


BASE_CSS = (
    f".kick{{font:700 15px {MONO};letter-spacing:5px;fill:{CYAN}}}"
    f".h2{{font:800 42px {SANS};fill:{TEXT};letter-spacing:-1px}}"
    f".sub{{font:500 18px {SANS};fill:{MUTED}}}"
    ".rise{opacity:0;animation:rise 1s cubic-bezier(.2,.8,.2,1) forwards}"
    "@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}"
    + STARS_CSS
)


# ==========================================================================
# 1. HERO
# ==========================================================================
def build_hero():
    H = 620
    cx, cy, sc = 705, 255, 165
    FR, DUR = 72, 30

    ico = icosahedron()
    octa = octahedron()
    cub = cube()

    outer = wireframe(
        ico, cx, cy, sc, CYAN,
        lambda t: (0.45 + 0.22 * math.sin(2 * math.pi * t), 2 * math.pi * t, 0.12),
        FR, DUR, width=1.5, dot=3.2)
    mid = wireframe(
        cub, cx, cy, sc * 0.62, PINK,
        lambda t: (0.3, -4 * math.pi * t, 2 * math.pi * t),
        FR, DUR, width=1.4, dot=2.4)
    inner = wireframe(
        octa, cx, cy, sc * 0.28, "#FFFFFF",
        lambda t: (2 * math.pi * t, 6 * math.pi * t, 0.0),
        FR, DUR, width=1.3, dot=2.0)

    r1 = ring(cx, cy, sc, 1.55, VIOLET,
              lambda t: (0.9 + 0.1 * math.sin(2 * math.pi * t), 2 * math.pi * t, 0.35),
              FR, DUR, width=2.0, sat_phase=0.0, sat_color=VIOLET)
    r2 = ring(cx, cy, sc, 1.95, CYAN,
              lambda t: (1.25, -2 * math.pi * t, -0.5 + 0.12 * math.sin(4 * math.pi * t)),
              FR, DUR, width=1.3, sat_phase=0.4, sat_color=CYAN)
    r3 = ring(cx, cy, sc, 1.25, PINK,
              lambda t: (0.55, 4 * math.pi * t, 0.9),
              FR, DUR, width=1.2, sat_phase=0.7, sat_color=PINK)

    adefs, abody = aurora(W, H, [
        (760, 220, 340, VIOLET, -60, 40, 20),
        (880, 420, 260, CYAN, 50, -50, 24),
        (180, 120, 280, PINK, 60, 60, 28),
    ])

    # moving perspective floor
    hz, vx = 470, 500
    floor = []
    for i in range(-14, 15):
        xb = vx + i * 150
        floor.append(f'<line x1="{vx + i * 12}" y1="{hz}" x2="{xb}" y2="{H}" stroke="{VIOLET}" stroke-opacity=".28"/>')
    N = 9
    pos = [(i / N) ** 2.1 for i in range(N + 2)]
    for i in range(N + 1):
        ys = [f"{hz + (H - hz) * p:.1f}" for p in (pos[i], pos[i + 1])]
        op = [f"{0.05 + 0.5 * p:.2f}" for p in (pos[i], pos[i + 1])]
        floor.append(
            f'<line x1="0" x2="{W}" y1="{ys[0]}" y2="{ys[0]}" stroke="{CYAN}" stroke-opacity="{op[0]}">'
            f'<animate attributeName="y1" values="{ys[0]};{ys[1]}" dur="3s" repeatCount="indefinite"/>'
            f'<animate attributeName="y2" values="{ys[0]};{ys[1]}" dur="3s" repeatCount="indefinite"/>'
            f'<animate attributeName="stroke-opacity" values="{op[0]};{op[1]}" dur="3s" repeatCount="indefinite"/></line>'
        )

    phrases = [
        ("Web and mobile apps", "that feel fast and simple"),
        ("AI that does real work", "not just a demo"),
        ("Automation and pipelines", "that run while you sleep"),
        ("Clean data, clear decisions", "from messy numbers"),
    ]
    ph = "".join(
        f'<g class="ph p{i}"><text x="60" y="456" class="ph1">{a}</text>'
        f'<text x="60" y="486" class="ph2">{b}</text></g>'
        for i, (a, b) in enumerate(phrases)
    )

    defs = (
        COMMON_DEFS + adefs +
        f'<linearGradient id="nm" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="520" y2="0" spreadMethod="repeat">'
        f'<stop offset="0" stop-color="{VIOLET}"/><stop offset=".33" stop-color="{CYAN}"/>'
        f'<stop offset=".66" stop-color="{PINK}"/><stop offset="1" stop-color="{VIOLET}"/>'
        f'<animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="520 0" dur="7s" repeatCount="indefinite"/></linearGradient>'
        f'<linearGradient id="fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".25" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity=".8"/></linearGradient>'
        f'<mask id="flm"><rect y="{hz}" width="{W}" height="{H - hz}" fill="url(#fl)"/></mask>'
        f'<radialGradient id="core"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".25" stop-color="{CYAN}" stop-opacity=".45"/><stop offset="1" stop-color="{CYAN}" stop-opacity="0"/></radialGradient>'
        f'<clipPath id="card"><rect width="{W}" height="{H}" rx="28"/></clipPath>'
    )
    style = BASE_CSS + (
        f".nm{{font:800 96px {SANS};letter-spacing:-4px;fill:url(#nm)}}"
        f".tag{{font:700 15px {MONO};letter-spacing:5px;fill:{CYAN}}}"
        f".ph1{{font:700 30px {SANS};fill:{TEXT};letter-spacing:-.6px}}"
        f".ph2{{font:500 22px {SANS};fill:{MUTED}}}"
        ".ph{opacity:0;animation:cyc 12s infinite}.p1{animation-delay:3s}.p2{animation-delay:6s}.p3{animation-delay:9s}"
        "@keyframes cyc{0%{opacity:0;transform:translateY(12px)}4%,22%{opacity:1;transform:none}27%,100%{opacity:0;transform:translateY(-8px)}}"
        f".chip{{font:600 15px {MONO};fill:{TEXT}}}"
        ".pulse{animation:pl 1.8s ease-in-out infinite}@keyframes pl{0%,100%{opacity:1;r:5}50%{opacity:.35;r:8}}"
        ".in1{opacity:0;animation:rise 1s .1s cubic-bezier(.2,.8,.2,1) forwards}"
        ".in2{opacity:0;animation:rise 1s .3s cubic-bezier(.2,.8,.2,1) forwards}"
        ".in3{opacity:0;animation:rise 1s .5s cubic-bezier(.2,.8,.2,1) forwards}"
        ".in4{opacity:0;animation:rise 1s .8s cubic-bezier(.2,.8,.2,1) forwards}"
        ".bob{animation:bob 6s ease-in-out infinite}@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}"
    )

    # floating dust
    dust = []
    for i in range(34):
        x = random.uniform(0, W)
        y = random.uniform(120, H)
        d = random.uniform(7, 16)
        dust.append(
            f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{random.uniform(.8, 2):.1f}" fill="{random.choice([CYAN, PINK, VIOLET, "#fff"])}" opacity=".0">'
            f'<animate attributeName="cy" values="{y:.0f};{y - 140:.0f}" dur="{d:.1f}s" begin="-{random.uniform(0, d):.1f}s" repeatCount="indefinite"/>'
            f'<animate attributeName="opacity" values="0;.8;0" dur="{d:.1f}s" begin="-{random.uniform(0, d):.1f}s" repeatCount="indefinite"/></circle>'
        )

    body = (
        f'<g clip-path="url(#card)"><rect width="{W}" height="{H}" fill="{BG}"/>'
        + stars(W, H, 70) + abody
        + f'<g mask="url(#flm)">{"".join(floor)}</g>'
        + f'<ellipse cx="{vx}" cy="{hz}" rx="520" ry="26" fill="{VIOLET}" opacity=".18" filter="url(#bloom)"/>'
        + "".join(dust)
        # 3D object
        + f'<g class="bob">'
        + f'<circle cx="{cx}" cy="{cy}" r="150" fill="url(#core)"><animate attributeName="r" values="130;165;130" dur="5s" repeatCount="indefinite"/></circle>'
        + f'<g id="obj">{r2}{r1}{r3}{outer}{mid}{inner}</g>'
        + f'<use href="#obj" filter="url(#bloom)" opacity=".9"/>'
        + "</g>"
        # copy
        + f'<text x="60" y="128" class="tag in1">FULL-STACK ENGINEER</text>'
        + f'<text x="56" y="232" class="nm in2">Chanakya</text>'
        + f'<text x="56" y="326" class="nm in3">Bugata</text>'
        + f'<g class="in4">{ph}</g>'
        + f'<g class="in4"><rect x="60" y="530" width="300" height="42" rx="21" fill="#0E1118" stroke="{LIME}" stroke-opacity=".5"/>'
        + f'<circle class="pulse" cx="84" cy="551" r="5" fill="{LIME}"/>'
        + f'<text x="104" y="557" class="chip">Available for new work</text></g>'
        + f'<rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="28" fill="none" stroke="#fff" stroke-opacity=".08"/></g>'
    )
    write("hero.svg", svg(W, H, defs, style, body))


# ==========================================================================
# 2. A NORMAL DAY  (isometric cubes on a pipeline)
# ==========================================================================
def iso_cube(x, y, hue, i, w=42, h=46):
    top = f"0,{-h - w / 2} {w},{-h} 0,{-h + w / 2} {-w},{-h}"
    left = f"{-w},{-h} 0,{-h + w / 2} 0,{w / 2} {-w},0"
    right = f"{w},{-h} 0,{-h + w / 2} 0,{w / 2} {w},0"
    return (
        f'<g transform="translate({x},{y})">'
        f'<ellipse cx="0" cy="{w / 2 + 14}" rx="44" ry="11" fill="{hue}" opacity=".35" filter="url(#soft)" class="sh" style="animation-delay:{i * .5}s"/>'
        f'<g class="fl" style="animation-delay:{i * .5}s">'
        f'<polygon points="{left}" fill="url(#cl{i})"/>'
        f'<polygon points="{right}" fill="url(#cr{i})"/>'
        f'<polygon points="{top}" fill="url(#ct{i})"/>'
        f'<polyline points="{-w},{-h} 0,{-h + w / 2} {w},{-h}" fill="none" stroke="#fff" stroke-opacity=".5"/>'
        f'<line x1="0" y1="{-h + w / 2}" x2="0" y2="{w / 2}" stroke="#fff" stroke-opacity=".35"/>'
        f'<text x="0" y="{-h + 5}" text-anchor="middle" class="num">{i + 1:02d}</text>'
        f"</g></g>"
    )


def build_day():
    H = 520
    steps = [
        ("Analyse", CYAN, ["Read the numbers,", "logs and needs to", "find what matters"]),
        ("Design", VIOLET, ["Plan the data, the", "screens and how", "they connect"]),
        ("Build", PINK, ["Write clean web,", "mobile and backend", "code"]),
        ("Test", LIME, ["Automated checks", "catch bugs before", "anyone sees them"]),
        ("Ship", "#FB923C", ["Release safely", "through automated", "pipelines"]),
        ("Monitor", "#38BDF8", ["Watch jobs that run", "on a schedule and", "fix anything off"]),
    ]
    adefs, abody = aurora(W, H, [(200, 260, 300, VIOLET, 50, 20, 22), (820, 300, 300, CYAN, -40, -20, 26)])
    grads, cubes, labels = "", "", ""
    x0, dx, y = 100, 160, 270
    for i, (name, col, lines) in enumerate(steps):
        grads += (
            f'<linearGradient id="ct{i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="{col}"/></linearGradient>'
            f'<linearGradient id="cl{i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{col}"/><stop offset="1" stop-color="{col}" stop-opacity=".45"/></linearGradient>'
            f'<linearGradient id="cr{i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{col}" stop-opacity=".6"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient>'
        )
        x = x0 + i * dx
        cubes += iso_cube(x, y, col, i)
        labels += (
            f'<g class="rise" style="animation-delay:{.2 + i * .12}s"><text x="{x}" y="372" text-anchor="middle" class="st-t" fill="{col}">{name}</text>'
            + "".join(f'<text x="{x}" y="{400 + k * 22}" text-anchor="middle" class="st-d">{l}</text>' for k, l in enumerate(lines))
            + "</g>"
        )
    path = f"M{x0} 338 L{x0 + 5 * dx} 338"
    defs = COMMON_DEFS + adefs + grads
    style = BASE_CSS + (
        f".st-t{{font:800 24px {SANS};letter-spacing:-.4px}}"
        f".st-d{{font:500 15px {SANS};fill:{MUTED}}}"
        f".num{{font:800 14px {MONO};fill:#06070B}}"
        ".fl{animation:fl 4s ease-in-out infinite}@keyframes fl{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}"
        ".sh{animation:sh 4s ease-in-out infinite}@keyframes sh{0%,100%{opacity:.4;transform:scale(1)}50%{opacity:.15;transform:scale(.8)}}"
        ".sh{transform-box:fill-box;transform-origin:center}"
    )
    body = (
        f'<rect width="{W}" height="{H}" rx="28" fill="{BG}"/>' + stars(W, H, 40, 3) + abody
        + header(50, 70, "01 — EVERY DAY", "A normal day, step by step", "The same loop, from first idea to a system that keeps running.")
        + f'<path d="{path}" stroke="{VIOLET}" stroke-opacity=".5" stroke-width="2" stroke-dasharray="3 9" stroke-linecap="round" fill="none">'
        f'<animate attributeName="stroke-dashoffset" from="0" to="-48" dur="2s" repeatCount="indefinite"/></path>'
        + f'<circle r="6" fill="#fff" filter="url(#soft)"><animateMotion path="{path}" dur="6s" repeatCount="indefinite"/></circle>'
        + f'<circle r="3" fill="#fff"><animateMotion path="{path}" dur="6s" repeatCount="indefinite"/></circle>'
        + cubes + labels
        + f'<rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="28" fill="none" stroke="#fff" stroke-opacity=".08"/>'
    )
    write("day.svg", svg(W, H, defs, style, body))


# ==========================================================================
# 3. SERVICES (glass cards with a light runner on the border)
# ==========================================================================
def glyph(kind, col):
    s = f'stroke="{col}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"'
    if kind == "web":
        return (
            f'<rect x="4" y="10" width="64" height="48" rx="8" {s}/><line x1="4" y1="24" x2="68" y2="24" {s}/>'
            f'<circle cx="14" cy="17" r="2" fill="{col}"/><circle cx="22" cy="17" r="2" fill="{col}"/><circle cx="30" cy="17" r="2" fill="{col}"/>'
            f'<rect x="12" y="32" width="22" height="18" rx="3" {s}><animate attributeName="stroke-opacity" values="1;.3;1" dur="3s" repeatCount="indefinite"/></rect>'
            f'<line x1="42" y1="34" x2="60" y2="34" {s}/><line x1="42" y1="42" x2="56" y2="42" {s}/><line x1="42" y1="50" x2="60" y2="50" {s}/>'
        )
    if kind == "mobile":
        return (
            f'<rect x="20" y="2" width="34" height="62" rx="9" {s}/><line x1="31" y1="9" x2="43" y2="9" {s}/>'
            f'<circle cx="37" cy="54" r="3" {s}/>'
            f'<rect x="27" y="20" width="20" height="8" rx="3" fill="{col}" opacity=".6"><animate attributeName="width" values="8;20;8" dur="3.5s" repeatCount="indefinite"/></rect>'
            f'<rect x="27" y="33" width="20" height="8" rx="3" {s}/>'
        )
    if kind == "ai":
        pts = [(14, 20), (14, 48), (38, 12), (38, 34), (38, 56), (62, 34)]
        edges = [(0, 2), (0, 3), (1, 3), (1, 4), (2, 5), (3, 5), (4, 5)]
        out = "".join(f'<line x1="{pts[a][0]}" y1="{pts[a][1]}" x2="{pts[b][0]}" y2="{pts[b][1]}" stroke="{col}" stroke-opacity=".6" stroke-width="1.8"/>' for a, b in edges)
        for k, (x, y) in enumerate(pts):
            out += (f'<circle cx="{x}" cy="{y}" r="6" fill="{BG}" stroke="{col}" stroke-width="2.4">'
                    f'<animate attributeName="r" values="5;8;5" dur="2.4s" begin="{k * .3}s" repeatCount="indefinite"/></circle>')
        return out
    if kind == "api":
        out = ""
        for k in range(3):
            y = 8 + k * 18
            out += (f'<rect x="6" y="{y}" width="60" height="14" rx="5" {s}/>'
                    f'<circle cx="16" cy="{y + 7}" r="2.4" fill="{col}"><animate attributeName="opacity" values="1;.2;1" dur="1.6s" begin="{k * .4}s" repeatCount="indefinite"/></circle>'
                    f'<line x1="28" y1="{y + 7}" x2="56" y2="{y + 7}" {s}/>')
        return out
    if kind == "data":
        out = f'<line x1="4" y1="62" x2="68" y2="62" {s}/>'
        for k, hgt in enumerate((22, 38, 30, 52)):
            x = 10 + k * 15
            out += (f'<rect x="{x}" y="{62 - hgt}" width="10" height="{hgt}" rx="3" fill="{col}" opacity=".8">'
                    f'<animate attributeName="height" values="{hgt * .4:.0f};{hgt};{hgt * .4:.0f}" dur="3.2s" begin="{k * .25}s" repeatCount="indefinite"/>'
                    f'<animate attributeName="y" values="{62 - hgt * .4:.0f};{62 - hgt};{62 - hgt * .4:.0f}" dur="3.2s" begin="{k * .25}s" repeatCount="indefinite"/></rect>')
        return out
    # automation: gear
    teeth = ""
    for k in range(8):
        a = k * 45
        teeth += f'<rect x="31" y="2" width="10" height="12" rx="3" fill="{col}" transform="rotate({a} 36 33)"/>'
    return (
        f'<g><animateTransform attributeName="transform" type="rotate" from="0 36 33" to="360 36 33" dur="14s" repeatCount="indefinite"/>'
        f'{teeth}<circle cx="36" cy="33" r="19" {s}/><circle cx="36" cy="33" r="7" {s}/></g>'
    )


def build_services():
    cards = [
        ("web", "Web apps and dashboards", CYAN,
         ["Fast, easy-to-use sites, admin", "panels and internal tools."], "React · TypeScript · Node.js"),
        ("mobile", "Mobile apps", PINK,
         ["Apps for iPhone that feel", "smooth, from idea to store."], "Swift · iOS"),
        ("ai", "AI and smart features", VIOLET,
         ["Chatbots, document helpers and", "computer vision that save time."], "LLMs · Python · Vision"),
        ("api", "APIs and backends", "#38BDF8",
         ["Secure, reliable services and", "databases behind your product."], "Spring Boot · Node.js · Postgres"),
        ("data", "Data and analysis", LIME,
         ["Turn raw numbers into scores,", "reports and clear decisions."], "Python · SQL · Reports"),
        ("auto", "Automation and quality", "#FB923C",
         ["Scheduled jobs, release pipelines", "and automated testing."], "GitHub Actions · Jenkins · Selenium"),
    ]
    cw, ch, gap, mx, top = 304, 262, 24, 20, 196
    H = top + 2 * ch + gap + 30
    body = ""
    defs = COMMON_DEFS
    for i, (kind, title, col, desc, tags) in enumerate(cards):
        r, c = divmod(i, 3)
        x, y = mx + c * (cw + gap), top + r * (ch + gap)
        defs += (
            f'<radialGradient id="g{i}" cx="0" cy="0" r="1"><stop offset="0" stop-color="{col}" stop-opacity=".32"/>'
            f'<stop offset="1" stop-color="{col}" stop-opacity="0"/></radialGradient>'
        )
        body += (
            f'<g transform="translate({x},{y})"><g class="rise" style="animation-delay:{.15 + i * .12}s">'
            f'<rect width="{cw}" height="{ch}" rx="22" fill="#0B0D14"/>'
            f'<rect width="{cw}" height="{ch}" rx="22" fill="url(#g{i})" transform="scale(1)" opacity=".9"/>'
            f'<rect width="{cw}" height="{ch}" rx="22" fill="none" stroke="#fff" stroke-opacity=".09"/>'
            f'<rect width="{cw}" height="{ch}" rx="22" fill="none" stroke="{col}" stroke-width="2.5" pathLength="1000" '
            f'stroke-dasharray="130 870" stroke-linecap="round" filter="url(#soft)" opacity=".9">'
            f'<animate attributeName="stroke-dashoffset" from="1000" to="0" dur="7s" begin="{i * .9}s" repeatCount="indefinite"/></rect>'
            f'<rect width="{cw}" height="{ch}" rx="22" fill="none" stroke="{col}" stroke-width="1.6" pathLength="1000" '
            f'stroke-dasharray="130 870" stroke-linecap="round">'
            f'<animate attributeName="stroke-dashoffset" from="1000" to="0" dur="7s" begin="{i * .9}s" repeatCount="indefinite"/></rect>'
            f'<g transform="translate(30,30)">{glyph(kind, col)}</g>'
            f'<text x="30" y="142" class="ct">{title}</text>'
            f'<text x="30" y="172" class="cd">{desc[0]}</text><text x="30" y="194" class="cd">{desc[1]}</text>'
            f'<line x1="30" x2="{cw - 30}" y1="214" y2="214" stroke="#fff" stroke-opacity=".08"/>'
            f'<text x="30" y="238" class="tg" fill="{col}">{tags}</text>'
            + "</g></g>"
        )
    adefs, abody = aurora(W, H, [(120, 100, 320, VIOLET, 50, 40, 24), (900, H - 100, 340, CYAN, -50, -30, 28)])
    style = BASE_CSS + (
        f".ct{{font:800 21px {SANS};fill:{TEXT};letter-spacing:-.4px}}"
        f".cd{{font:500 16px {SANS};fill:{MUTED}}}"
        f".tg{{font:600 13.5px {MONO}}}"
    )
    full = (
        f'<rect width="{W}" height="{H}" rx="28" fill="{BG}"/>' + stars(W, H, 50, 5) + abody
        + header(50, 66, "02 — WHAT I OFFER", "Services, in plain words", "Everything below is work I do day to day, for people and teams of any size.")
        + body
        + f'<rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="28" fill="none" stroke="#fff" stroke-opacity=".08"/>'
    )
    write("services.svg", svg(W, H, defs + adefs, style, full))


# ==========================================================================
# 4. TOOLBELT (two counter-running marquee rows)
# ==========================================================================
def build_stack():
    H = 330
    row1 = [("TypeScript", CYAN), ("React", CYAN), ("Node.js", CYAN), ("Python", VIOLET), ("Swift", PINK),
            ("Java", PINK), ("Spring Boot", PINK), ("SQL", LIME)]
    row2 = [("PostgreSQL", "#38BDF8"), ("Docker", "#38BDF8"), ("GitHub Actions", "#FB923C"), ("Jenkins", "#FB923C"),
            ("Selenium", LIME), ("Cloudflare", "#FB923C"), ("LLMs", VIOLET), ("Computer Vision", VIOLET)]

    def row(items, y, direction, dur):
        pad, gap = 54, 16
        widths = [len(n) * 9.6 + pad for n, _ in items]
        total = sum(widths) + gap * len(items)
        chips, x = "", 0.0
        for (n, col), w in zip(items, widths):
            chips += (
                f'<g transform="translate({x:.1f},0)"><rect width="{w:.1f}" height="52" rx="26" fill="#0C0F17" stroke="{col}" stroke-opacity=".45"/>'
                f'<circle cx="26" cy="26" r="5" fill="{col}"/><text x="42" y="32" class="c">{n}</text></g>'
            )
            x += w + gap
        a, b = (0, -total) if direction < 0 else (-total, 0)
        return (
            f'<g transform="translate(0,{y})"><g><animateTransform attributeName="transform" type="translate" '
            f'values="{a:.1f} 0;{b:.1f} 0" dur="{dur}s" repeatCount="indefinite"/>'
            + "".join(f'<g transform="translate({k * total:.1f},0)">{chips}</g>' for k in range(3))
            + "</g></g>"
        )

    r1 = row(row1, 160, -1, 40)
    r2 = row(row2, 232, 1, 46)
    defs = (
        COMMON_DEFS +
        f'<linearGradient id="ed" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".1" stop-color="#fff"/>'
        f'<stop offset=".9" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
        f'<mask id="em"><rect width="{W}" height="{H}" fill="url(#ed)"/></mask>'
    )
    adefs, abody = aurora(W, H, [(500, 230, 420, VIOLET, 40, 0, 22)])
    style = BASE_CSS + f".c{{font:600 18px {MONO};fill:{TEXT}}}"
    body = (
        f'<rect width="{W}" height="{H}" rx="28" fill="{BG}"/>' + stars(W, H, 30, 9) + abody
        + header(50, 66, "03 — TOOLBELT", "What I build with")
        + f'<g mask="url(#em)">{r1}{r2}</g>'
        + f'<rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="28" fill="none" stroke="#fff" stroke-opacity=".08"/>'
    )
    write("stack.svg", svg(W, H, defs + adefs, style, body))


# ==========================================================================
# 5. ACTIVITY heading (the graphs themselves are generated by the workflow)
# ==========================================================================
def build_activity():
    H = 190
    adefs, abody = aurora(W, H, [(800, 80, 300, PINK, -50, 20, 20), (150, 100, 260, CYAN, 40, -10, 24)])
    style = BASE_CSS
    body = (
        f'<rect width="{W}" height="{H}" rx="28" fill="{BG}"/>' + stars(W, H, 30, 11) + abody
        + header(50, 66, "04 — SHOWING UP", "Daily activity, in 3D", "A live picture of how often I ship. It refreshes itself every 12 hours.")
        + f'<rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="28" fill="none" stroke="#fff" stroke-opacity=".08"/>'
    )
    write("activity.svg", svg(W, H, COMMON_DEFS + adefs, style, body))


# ==========================================================================
# 6. CONTACT
# ==========================================================================
def build_contact():
    H = 340
    cx, cy, sc = 805, 165, 105
    FR, DUR = 60, 24
    obj = wireframe(
        icosahedron(), cx, cy, sc, CYAN,
        lambda t: (0.5, 2 * math.pi * t, 0.2), FR, DUR, width=1.4, dot=2.6)
    obj2 = wireframe(
        octahedron(), cx, cy, sc * .45, PINK,
        lambda t: (2 * math.pi * t, -4 * math.pi * t, 0), FR, DUR, width=1.3, dot=2.0)
    rg = ring(cx, cy, sc, 1.6, VIOLET, lambda t: (1.0, 2 * math.pi * t, 0.3), FR, DUR, width=1.6,
              sat_phase=0.2, sat_color=VIOLET)
    adefs, abody = aurora(W, H, [(760, 160, 320, VIOLET, -40, 20, 20), (180, 260, 280, PINK, 50, -20, 26)])
    defs = (
        COMMON_DEFS + adefs +
        f'<linearGradient id="btn" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{VIOLET}"/><stop offset="1" stop-color="{CYAN}"/></linearGradient>'
    )
    style = BASE_CSS + (
        f".big{{font:800 60px {SANS};fill:{TEXT};letter-spacing:-2.5px}}"
        f".mail{{font:700 20px {MONO};fill:#06070B}}"
        ".btn{animation:bt 3s ease-in-out infinite}@keyframes bt{0%,100%{filter:brightness(1)}50%{filter:brightness(1.25)}}"
        ".bob{animation:bob 6s ease-in-out infinite}@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}"
    )
    body = (
        f'<rect width="{W}" height="{H}" rx="28" fill="{BG}"/>' + stars(W, H, 50, 13) + abody
        + f'<g class="bob"><g id="o">{rg}{obj}{obj2}</g><use href="#o" filter="url(#bloom)" opacity=".8"/></g>'
        + f'<text x="56" y="76" class="kick rise">05 — SAY HELLO</text>'
        + f'<text x="54" y="150" class="big rise" style="animation-delay:.15s">Have something</text>'
        + f'<text x="54" y="214" class="big rise" style="animation-delay:.3s">to build?</text>'
        + f'<g class="rise btn" style="animation-delay:.5s"><rect x="56" y="244" width="378" height="56" rx="28" fill="url(#btn)"/>'
        + f'<text x="245" y="279" text-anchor="middle" class="mail">chanakya.offc@gmail.com</text></g>'
        + f'<rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="28" fill="none" stroke="#fff" stroke-opacity=".08"/>'
    )
    write("contact.svg", svg(W, H, defs, style, body))


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith(".svg"):
            os.remove(os.path.join(OUT, f))
    build_hero()
    build_day()
    build_services()
    build_stack()
    build_activity()
    build_contact()
