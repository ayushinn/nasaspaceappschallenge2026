"""
Build submission/SPHEREx-Blink-demo.pptx — the 7-slide PowerPoint version of the
demo deck, same copy and screenshots as demo-deck.html but in a format the
Space Apps submission form accepts (a slide deck can be uploaded to Drive and
previewed without installing anything).

Run with a Python that has python-pptx installed:

    python3 scripts/build_deck.py

The deck is deliberately plain OOXML shapes and text boxes: no template, no
external fonts, no images beyond the two application screenshots, so it opens
identically in PowerPoint, Keynote, LibreOffice and Google Slides.
"""

from __future__ import annotations

import struct
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Inches, Pt

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "submission" / "SPHEREx-Blink-demo.pptx"

BG = RGBColor(0x07, 0x09, 0x0D)
PANEL = RGBColor(0x0B, 0x0F, 0x16)
BORDER = RGBColor(0x1B, 0x22, 0x31)
TEXT = RGBColor(0xDD, 0xE5, 0xF2)
BODY = RGBColor(0xB9, 0xC4, 0xD4)
MUTED = RGBColor(0x78, 0x86, 0x9A)
ORANGE = RGBColor(0xFF, 0xB3, 0x47)
CYAN = RGBColor(0x4F, 0xD1, 0xFF)
FOOT = RGBColor(0x4E, 0x57, 0x66)

SANS = "Segoe UI"
MONO = "Consolas"

W, H = 13.333, 7.5
MARGIN = 0.72
CONTENT_W = W - 2 * MARGIN

TOTAL_SLIDES = 7


def png_size(path: Path) -> tuple[int, int]:
    """Read width/height straight from the PNG IHDR chunk (no Pillow needed)."""
    with path.open("rb") as fh:
        head = fh.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path} is not a PNG")
    return struct.unpack(">II", head[16:24])


def textbox(slide, x, y, w, h, *, anchor=MSO_ANCHOR.TOP):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = 0
    tf.margin_right = 0
    tf.margin_top = 0
    tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    return tf


def para(tf, text, *, size=14, bold=False, color=BODY, font=SANS, first=False,
         space_before=0, space_after=6, line=1.22, align=PP_ALIGN.LEFT):
    p = tf.paragraphs[0] if first else tf.add_paragraph()
    p.alignment = align
    p.space_before = Pt(space_before)
    p.space_after = Pt(space_after)
    p.line_spacing = line
    run = p.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    run.font.name = font
    return p


def bullet(tf, text, *, size=14, first=False, color=BODY, space_after=9):
    p = tf.paragraphs[0] if first else tf.add_paragraph()
    p.space_before = Pt(0)
    p.space_after = Pt(space_after)
    p.line_spacing = 1.22
    dot = p.add_run()
    dot.text = "—  "
    dot.font.size = Pt(size)
    dot.font.color.rgb = ORANGE
    dot.font.bold = True
    dot.font.name = SANS
    run = p.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.color.rgb = color
    run.font.name = SANS
    return p


def card(slide, x, y, w, h, *, fill=PANEL, line=BORDER):
    shape = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h)
    )
    shape.adjustments[0] = 0.06
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    shape.line.color.rgb = line
    shape.line.width = Pt(0.75)
    shape.shadow.inherit = False
    tf = shape.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0.22)
    tf.margin_right = Inches(0.22)
    tf.margin_top = Inches(0.18)
    tf.margin_bottom = Inches(0.18)
    tf.vertical_anchor = MSO_ANCHOR.TOP
    return tf


def new_slide(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = BG
    return slide


def kicker(slide, text, y=0.46):
    tf = textbox(slide, MARGIN, y, CONTENT_W, 0.32)
    para(tf, text.upper(), size=10.5, bold=True, color=ORANGE, font=MONO, first=True)


def heading(slide, text, y=0.78, size=27, width=CONTENT_W):
    tf = textbox(slide, MARGIN, y, width, 1.0)
    para(tf, text, size=size, bold=True, color=TEXT, first=True, line=1.08)


def footer(slide, index):
    left = textbox(slide, MARGIN, H - 0.46, 4.0, 0.25)
    para(left, "SPHEREx Blink", size=8.5, color=FOOT, font=MONO, first=True)
    right = textbox(slide, W - MARGIN - 4.0, H - 0.46, 4.0, 0.25)
    para(right, f"{index} / {TOTAL_SLIDES}", size=8.5, color=FOOT, font=MONO,
         first=True, align=PP_ALIGN.RIGHT)


def hairline(slide, x, y, w, *, color=BORDER):
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(0.012))
    bar.fill.solid()
    bar.fill.fore_color.rgb = color
    bar.line.fill.background()
    bar.shadow.inherit = False
    return bar


def picture(slide, path, x, y, *, width=None, max_h=None):
    iw, ih = png_size(path)
    w = width if width is not None else CONTENT_W
    h = w * ih / iw
    if max_h is not None and h > max_h:
        h = max_h
        w = h * iw / ih
    pic = slide.shapes.add_picture(str(path), Inches(x), Inches(y), Inches(w), Inches(h))
    pic.line.color.rgb = BORDER
    pic.line.width = Pt(0.75)
    return pic, w, h


def build() -> Path:
    prs = Presentation()
    prs.slide_width = Inches(W)
    prs.slide_height = Inches(H)

    # 1 — title -------------------------------------------------------------
    s = new_slide(prs)
    tf = textbox(s, MARGIN, 0.95, CONTENT_W, 0.35)
    para(tf, "NASA SPACE APPS CHALLENGE 2026  ·  PLANET X AND SPHEREX",
         size=11, bold=True, color=ORANGE, font=MONO, first=True)

    tf = textbox(s, MARGIN, 1.45, CONTENT_W, 1.1)
    para(tf, "SPHEREx Blink", size=54, bold=True, color=TEXT, first=True, line=1.0)

    tf = textbox(s, MARGIN, 2.62, 8.6, 1.0)
    para(tf, "Pick any patch of sky. Watch every epoch NASA's SPHEREx has taken of it. See what moved.",
         size=19, color=RGBColor(0xCF, 0xD8, 0xE6), first=True, line=1.35)

    hairline(s, MARGIN, 3.95, CONTENT_W)

    cols = [
        ("Team", "kepleris — Ayushi Upadhyay (solo)"),
        ("Local event", "Delhi (virtual)"),
        ("Built with", "NASA SPHEREx DR1 & QR3 from IRSA, ESA Gaia DR3"),
    ]
    col_w = (CONTENT_W - 0.6) / 3
    for i, (label, value) in enumerate(cols):
        x = MARGIN + i * (col_w + 0.3)
        tf = textbox(s, x, 4.25, col_w, 0.3)
        para(tf, label, size=11, bold=True, color=ORANGE, first=True)
        tf = textbox(s, x, 4.6, col_w, 0.9)
        para(tf, value, size=13, color=BODY, first=True, line=1.3)
    footer(s, 1)

    # 2 — problem -----------------------------------------------------------
    s = new_slide(prs)
    kicker(s, "The problem")
    heading(s, "A billion objects, and the moving ones\nare the interesting ones.")
    tf = textbox(s, MARGIN, 2.15, 6.5, 3.6)
    bullet(tf, "SPHEREx images the whole sky every six months, in 102 near-infrared bands.", first=True)
    bullet(tf, "Comets, asteroids, brown dwarfs and nearby stars reveal themselves by changing position between images.")
    bullet(tf, "Volunteers found most known comets and brown dwarfs this way — Pluto, too.")
    bullet(tf, "But at 6.2 arcseconds per pixel, a year of motion is often less than one pixel.")

    tf = card(s, 7.55, 2.15, 5.05, 1.95)
    para(tf, "The gap", size=13, bold=True, color=ORANGE, first=True, space_after=6)
    para(tf, "There is no simple public way to say \"show me this patch at every epoch, lined up, "
             "so I can see what changed.\" The archive gives you files. It does not give you a view.",
         size=12.5, color=BODY)

    tf = card(s, 7.55, 4.28, 5.05, 1.75)
    para(tf, "The question", size=13, bold=True, color=CYAN, first=True, space_after=6)
    para(tf, "What would it take for a volunteer with no astronomy software to spot a moving object?",
         size=12.5, color=BODY)
    footer(s, 2)

    # 3 — what it does ------------------------------------------------------
    s = new_slide(prs)
    kicker(s, "What it does")
    heading(s, "Coordinates in, time series out.")
    tf = textbox(s, MARGIN, 2.0, 4.55, 3.9)
    bullet(tf, "Any RA/Dec, decimal or sexagesimal — or one click on the five challenge targets.", first=True)
    bullet(tf, "Blink, Difference and Mean stack playback, with speed control and scrubbing.")
    bullet(tf, "All six detector arrays, 0.75–5.0 µm.")
    bullet(tf, "Light curve and full metadata for every epoch.")
    bullet(tf, "A shareable URL for every view.")

    shot = ROOT / "artifacts" / "blink-default.png"
    _, iw, ih = picture(s, shot, 5.75, 1.95, width=6.85, max_h=3.85)
    tf = textbox(s, 5.75, 1.95 + ih + 0.16, 6.85, 0.8)
    para(tf, "Epsilon Indi, 6 epochs over a 514-day baseline. The ring is the object: "
             "SPHEREx saturates on bright stars and masks the core.",
         size=10, color=MUTED, first=True, line=1.3)
    footer(s, 3)

    # 4 — difference --------------------------------------------------------
    s = new_slide(prs)
    kicker(s, "The idea that makes it work")
    heading(s, "When the motion is smaller than a pixel,\nsubtract instead of blink.", size=25)
    _, iw, ih = picture(s, ROOT / "artifacts" / "blink-difference.png", MARGIN, 2.05, width=6.5, max_h=3.6)
    tf = textbox(s, MARGIN, 2.05 + ih + 0.16, 6.5, 0.7)
    para(tf, "R Draconis, epoch minus reference. Warm = brighter now, cool = dimmer.",
         size=10, color=MUTED, first=True, line=1.3)

    tf = textbox(s, 7.6, 2.05, 5.0, 2.4)
    bullet(tf, "Difference imaging turns a sub-pixel shift into a bright, obvious signal.", first=True)
    bullet(tf, "The background pedestal between epochs is removed first, or zodiacal light swamps everything.")
    bullet(tf, "Registration is measured, not assumed — residual offsets are reported in the interface.")

    tf = card(s, 7.6, 4.6, 5.0, 1.55)
    para(tf, "Result", size=13, bold=True, color=ORANGE, first=True, space_after=6)
    para(tf, "R Draconis swings 1.6× and Barnard's Star 1.5× across the epochs shown — "
             "visible in seconds, from a browser.", size=12.5, color=BODY)
    footer(s, 4)

    # 5 — how it works ------------------------------------------------------
    s = new_slide(prs)
    kicker(s, "How it works")
    heading(s, "Six steps from archive to animation.")
    steps = [
        ("1", "IVOA SIA2 query", "IRSA, DR1 + QR3"),
        ("2", "Cluster into epochs", "32-day window"),
        ("3", "Cutout per epoch", "~4 MB MEF"),
        ("4", "Decode FITS", "own reader"),
        ("5", "Resample north-up", "CD matrix"),
        ("6", "Register + photometry", "correlation"),
    ]
    gap = 0.18
    step_w = (CONTENT_W - gap * (len(steps) - 1)) / len(steps)
    for i, (num, title, note) in enumerate(steps):
        x = MARGIN + i * (step_w + gap)
        tf = card(s, x, 1.95, step_w, 1.12)
        para(tf, num, size=9.5, bold=True, color=CYAN, font=MONO, first=True, space_after=2)
        para(tf, title, size=11.5, bold=True, color=TEXT, space_after=1)
        para(tf, note, size=9.5, color=MUTED, font=MONO, space_after=0)

    cards = [
        ("Why re-orient",
         "Cutouts arrive in the spacecraft's orientation: −163.7° in survey 1, +19.6° in survey 2 "
         "at the same field. Blinking raws shows rotation, not motion."),
        ("Why register",
         "Masked, high-pass Pearson correlation with a sub-pixel parabola fit. Frames that fail "
         "to align are reported, not silently shown."),
        ("Why it is fast",
         "The 3.9 MB PSF table in every cutout is skipped by size arithmetic, and results are "
         "cached — the five targets reload instantly."),
    ]
    card_w = (CONTENT_W - 0.4) / 3
    for i, (title, body) in enumerate(cards):
        x = MARGIN + i * (card_w + 0.2)
        tf = card(s, x, 3.35, card_w, 1.95)
        para(tf, title, size=13, bold=True, color=TEXT, first=True, space_after=6)
        para(tf, body, size=12, color=BODY)
    footer(s, 5)

    # 6 — insight -----------------------------------------------------------
    s = new_slide(prs)
    kicker(s, "What the data taught us")
    heading(s, "The sky has moved since the catalogue epoch.")
    tf = textbox(s, MARGIN, 2.05, 6.6, 3.9)
    para(tf, "Barnard's Star travels 10.3 arcseconds a year. By 2026 its published J2000 position is "
             "4.5 arcminutes away from where SPHEREx actually sees it — almost the entire default field.",
         size=14, color=BODY, first=True, space_after=12)
    para(tf, "So presets carry Gaia DR3 proper motion and are propagated to the observation epoch "
             "before the archive is searched. Without that step the tool shows an empty field and the "
             "object you asked for is off the edge.", size=14, color=BODY, space_after=12)
    para(tf, "The same check caught two wrong coordinates in our own target list, which were corrected "
             "against Gaia before submission.", size=12, color=MUTED, space_after=0)

    tf = card(s, 7.75, 2.05, 4.85, 3.55)
    stats = [("10.3″/yr", "Barnard's Star proper motion"),
             ("4.5′", "drift since J2000 — nearly one field"),
             ("6.2″", "one SPHEREx pixel")]
    for i, (value, label) in enumerate(stats):
        para(tf, value, size=30, bold=True, color=CYAN, font=MONO, first=(i == 0),
             space_after=2, space_before=(0 if i == 0 else 14))
        para(tf, label, size=11.5, color=MUTED, space_after=0)
    footer(s, 6)

    # 7 — impact ------------------------------------------------------------
    s = new_slide(prs)
    kicker(s, "Impact")
    heading(s, "Anybody can now ask \"what changed here?\"")
    tf = textbox(s, MARGIN, 2.0, 7.35, 3.2)
    bullet(tf, "For volunteers: a one-click path to blinking and difference imaging, with the "
               "alignment and photometry done properly.", first=True)
    bullet(tf, "For educators: URL-shareable views of real near-infrared survey data, stable across a lesson.")
    bullet(tf, "Next: spectra on the fly from the LVF axis, a combined six-array stack for depth, "
               "and Gaia/WISE overlays.")
    tf = textbox(s, MARGIN, 5.15, 7.35, 0.8)
    para(tf, "TypeScript, React and a hand-written FITS reader. No Python, no database, no API keys — "
             "IRSA's services are public. Built solo in about a day.",
         size=11.5, color=MUTED, first=True, line=1.3)

    tf = card(s, 8.35, 2.0, 4.25, 3.05)
    para(tf, "Try it", size=13, bold=True, color=ORANGE, first=True, space_after=6)
    para(tf, "github.com/ayushinn/nasaspaceappschallenge2026", size=11.5, color=BODY, font=MONO,
         space_after=10)
    para(tf, "Live demo", size=13, bold=True, color=TEXT, space_after=4, space_before=6)
    para(tf, "Replace with your deployed URL before uploading.", size=11, color=MUTED, space_after=10)
    para(tf, "Data", size=13, bold=True, color=TEXT, space_after=4, space_before=6)
    para(tf, "SPHEREx spectral images, DR1 and QR3, NASA/IPAC Infrared Science Archive. "
             "Gaia DR3 proper motions, ESA.", size=11, color=BODY)

    tf = textbox(s, MARGIN, 6.05, CONTENT_W, 1.0)
    para(tf, "This publication makes use of data products from the Spectro-Photometer for the History of the "
             "Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet "
             "Propulsion Laboratory and the California Institute of Technology, and is funded by the National "
             "Aeronautics and Space Administration. This work has made use of data from the European Space "
             "Agency (ESA) mission Gaia, processed by the Gaia Data Processing and Analysis Consortium (DPAC). "
             "Code and text were developed with AI assistance; see the repository README for the disclosure.",
         size=8, color=RGBColor(0x5B, 0x66, 0x76), first=True, line=1.35)
    footer(s, 7)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    prs.save(OUT)
    return OUT


if __name__ == "__main__":
    path = build()
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} kB, {TOTAL_SLIDES} slides)")
