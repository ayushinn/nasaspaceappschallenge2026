# Submission copy — SPHEREx Blink

Team **kepleris** · Ayushi Upadhyay (solo) · Delhi (virtual)
Challenge: **Planet X and SPHEREx**

Everything below is ready to paste into the Project tab. The two link fields marked
**⚠ needs a URL** are the only things that depend on you (deployment / GitHub / Drive).

---

## Project Name

```
SPHEREx Blink
```

---

## Summary (185 words)

```
SPHEREx Blink is a public web tool that turns NASA's SPHEREx all-sky spectral survey into
something anyone can watch. You enter a Right Ascension and declination; the tool finds every
epoch SPHEREx has imaged that patch, pulls the cutouts from the NASA/IPAC Infrared Science
Archive, re-orients and co-aligns them, and plays them back as a short video — with difference
imaging, mean stacking and a per-epoch light curve alongside.

It works for any coordinates and one-click for the five targets named in the challenge, from
Data Release 1 and Quick Release 3, across all six detector arrays.

The design is driven by what the data actually does. SPHEREx pixels are 6.2 arcseconds, so a
year of motion is often less than one pixel; and cutouts arrive in the spacecraft's orientation,
which flipped by ~180° between survey 1 and survey 2. Every frame is therefore resampled
north-up and registered by cross-correlation before display. Presets are propagated with Gaia
proper motion, because Barnard's Star has moved 4.5 arcminutes since J2000 — almost a whole
field — and would otherwise not be in the picture at all.

SPHEREx will image more than a billion objects. Tools like this let volunteers find the ones
that move.
```

---

## Project Demonstration **⚠ needs a URL**

You have two options; the deck is already built for you.

1. **Slide deck (recommended, already done).** `submission/SPHEREx-Blink-demo.pptx` — 7 slides,
   16:9, real PowerPoint format. Regenerate with `python3 scripts/build_deck.py`. Before uploading,
   replace the "Live demo" line on slide 7 with your deployed URL. Upload to Google Drive, set
   "Anyone with the link → Viewer", and paste that URL here. (`submission/demo-deck.html` is the
   same deck as a web page if you would rather print it to PDF.)
2. **30-second video.** Script below, if you would rather record your screen.

```
Demo video script (30 s, screen recording of the live app)

0:00–0:02  "I'm Ayushi from team kepleris. This is the SPHEREx challenge."
0:02–0:07  "SPHEREx maps the whole sky every six months. Somewhere in a billion objects are
            the ones that moved — and no one can eyeball that."
0:07–0:10  "This is SPHEREx Blink. Type any coordinates — or click a challenge target."
0:10–0:20  [click R Draconis] "Six months of real SPHEREx data, co-aligned. Play.
            Switch to Difference — the star brightened. That's a Mira variable."
0:20–0:25  [click Barnard's Star] "Same tool finds fast movers — propagated with Gaia proper
            motion, because it has drifted four and a half arcminutes since J2000."
0:25–0:30  "Every epoch, every band, straight from NASA's archive. Anyone can do this now."
```

---

## Project **⚠ needs a URL**

Paste **both** of these as links in the field (or put the repo URL in Project Details):

- Deployed app: `<your deployment URL>` — ask me to deploy it and this is filled in.
- Source code: `<your GitHub repo URL>`

Both must open without a login.

---

## Project Details

```
WHAT IT DOES
You give SPHEREx Blink a patch of sky — Right Ascension and declination, typed in decimal or
sexagesimal — and it shows you every epoch the telescope has observed there, played back like a
short video. Playback has a speed control, a scrubber and frame stepping. Three display modes:
Blink (raw epochs), Difference (each epoch minus a reference epoch) and Mean stack (all epochs
averaged). A detector selector covers all six arrays from 0.75 to 5.0 microns. Beside the image
are the epoch list with registration quality, a per-epoch light curve measured in an aperture at
the requested position, and full observation metadata: release, band, exposure, visit count, MJD
and Level-2 flag bits. Every query is a shareable URL, so a view can be embedded or sent to
another person.

HOW IT WORKS
1. An IVOA SIA2 query to IRSA finds every SPHEREx spectral image whose footprint covers the
   position, across Data Release 1 and Quick Release 3.
2. Observations are clustered into epochs (32-day window), so the year-long baseline is not
   drowned by near-duplicate frames from consecutive weeks.
3. Each epoch is fetched through IRSA's cutout service and decoded by a FITS reader written for
   this project — no astronomy library in the request path.
4. Every frame is resampled to a north-up, east-left grid using the CD matrix from its own
   header, then registered to a common grid by masked, high-pass Pearson correlation.
5. Aperture photometry at the requested position produces the light curve; the response is
   cached so repeat views are instant.

WHAT WE FOUND IN THE DATA (and how the tool responds)
- Cutout orientation follows the spacecraft, not the sky: measured at -163.7 degrees in survey 1
  and +19.6 degrees in survey 2. Raw blinking would show rotation and look like motion. Hence
  the north-up resampling stage, which is what makes the difference mode meaningful.
- A cutout is about 4 MB regardless of field size, because each file carries a 3.9 MB
  exposure-averaged PSF table. The reader skips that extension by size arithmetic, requests a
  generous box, bins it down, and caches results.
- High proper motion moves objects out of the field: Barnard's Star moves 10.3 arcsec per year,
  so its J2000 position is about 4.5 arcmin from where SPHEREx actually sees it in 2026. Presets
  carry Gaia DR3 proper motions and are propagated to the observation epoch before searching.
- Bright stars appear as rings. The detectors saturate and the Level-2 products mask the core, so
  only the wings survive; photometry uses a 2.2-pixel aperture to include them, and the interface
  explains the artefact rather than hiding it.
- The archive is not always available; when a frame cannot be downloaded or registered, the tool
  says so instead of silently dropping it.

BENEFITS AND IMPACT
Finding moving objects by comparing images at different times is how Pluto was found and how
volunteers have discovered most known comets and brown dwarfs. SPHEREx is about to make that
problem a thousand times bigger. A tool that makes "show me what changed here" a one-click
operation, with the alignment and the photometry done properly, lets citizen scientists spend
their time on judgement instead of data wrangling.

CREATIVITY AND CONSIDERATIONS
The tool leans on the specific physics of the dataset rather than generic image viewing:
sub-pixel registration because the pixel is huge, difference imaging because a year of motion is
often under one pixel, proper-motion propagation because the sky has moved since the catalogue
epoch, and a light-curve panel because two of the five challenge targets are variables, not movers.
URL parameters make every view shareable.

TOOLS
TypeScript and React, Vite, a hand-written FITS decoder, Node for the server-side archive layer.
No Python, no database, no API keys — IRSA's services are public. Roughly 2,500 lines written in
about a day, solo.

LIMITS (stated honestly)
One exposure per epoch rather than averaging the repeat visits; no spectral extraction from the
LVF axis yet; no Gaia/WISE image overlay yet. Each is a clear next step and none is hidden.
```

---

## Use of Super Intelligence (SI)

Select these:

- ✅ **Research or Information Gathering** — querying IRSA/IVOA service documentation and Gaia astrometry to establish what data is public and how the cutouts behave.
- ✅ **Data Analysis and Interpretation** — interpreting the FITS headers and the survey's orientation/cadence behaviour during development.
- ✅ **Coding, Debugging, or Troubleshooting** — code was written with an AI coding agent, reviewed and validated against the archive's own header values.
- ✅ **Writing, Editing, or Translation** — README and this submission text.
- ✅ **Visual Design or Image Creation** — interface layout and styling.
- ✅ **Presentation, Video, or Audio** — if you use the generated deck or the video script above.
- ❌ **Building SI/ML into the Project** — no model runs inside the tool.
- ❌ **Ideation or Brainstorming** — the challenge brief supplied the problem and targets; AI was not used to invent the idea.

Optional text box, if offered:

```
Code, documentation and the demo deck were written with an AI coding agent (Freebuff), working
from the team member's direction. Every scientific choice — epoch clustering, north-up
resampling, proper-motion propagation, aperture size, the saturation caveat — was checked
against the SPHEREx FITS headers or Gaia astrometry before being accepted. No generative imagery
is used in the project or the demo: all screenshots show the application rendering real NASA
data. This disclosure also appears in the repository README and in the application footer.
```

---

## NASA Data (add each as a link)

| Link Text | Link Url |
|---|---|
| SPHEREx spectral images, Data Release 1 (IRSA) | https://irsa.ipac.caltech.edu/Missions/spherex.html |
| IRSA SIA2 image access service | https://irsa.ipac.caltech.edu/SIA |
| SPHEREx cutout service (IRSA IBE) | https://irsa.ipac.caltech.edu/ibe/cutouts.html |
| SPHEREx Explanatory Supplement (SSDC-DP-017) | https://irsa.ipac.caltech.edu/data/SPHEREx/docs/SPHEREx_Expsupp_QR.pdf |
| SPHEREx DR1 release announcement | https://spherex.caltech.edu/news/spherex-data-release-1-dr1-is-now-available-at-irsa |
| SPHEREx archive at IRSA user guide | https://caltech-ipac.github.io/spherex-archive-documentation/ |
| SPHEREx data on AWS Open Data | https://irsa.ipac.caltech.edu/cloud_access/ |
| SPHEREx mission | https://spherex.caltech.edu/ |

Required acknowledgement, already in the README and the app footer:

> This publication makes use of data products from the Spectro-Photometer for the History of the
> Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet
> Propulsion Laboratory and the California Institute of Technology, and is funded by the National
> Aeronautics and Space Administration.

---

## Space Agency Partner & Other Data

ESA is a 2026 Space Agency Partner, which is where Gaia belongs.

| Link Text | Link Url |
|---|---|
| ESA Gaia DR3 archive (proper motions for presets) | https://gea.esac.esa.int/archive/ |
| Gaia DR3 table access (TAP / ADQL) | https://gea.esac.esa.int/tap-server/tap |
| IRSA SPHEREx tutorial notebooks | https://caltech-ipac.github.io/irsa-tutorials/ |
| React (UI library) | https://react.dev/ |
| Vite (build tool) | https://vite.dev/ |
| TypeScript | https://www.typescriptlang.org/ |

Note: coordinates for the five challenge targets were checked against Gaia DR3, and two of the
team's initial values were found to be wrong and corrected — worth mentioning if asked, it shows
the verification was real.

---

## Before you press Submit for Judging

- [ ] Deck exported to PDF and uploaded, link opens in a private window
- [ ] App deployed and its URL opens without a login
- [ ] Repo public
- [ ] NASA acknowledgement present (it is, in README + footer)
- [ ] No NASA logos or mission branding used as design elements (there are none)
- [ ] Clicked "Submit for Judging" — a saved draft earns no certificate
