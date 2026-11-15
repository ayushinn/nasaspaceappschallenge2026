# SPHEREx Blink

A public web tool for blinking through NASA's SPHEREx infrared sky survey: enter a
Right Ascension and declination, get every epoch the telescope has taken of that
patch, and play them like a short video to spot what moved, appeared, or changed
brightness.

Built for the **2026 NASA Space Apps Challenge** — *Planet X and SPHEREx* challenge,
solo entry, team **kepleris** (Ayushi Upadhyay).

---

## What it does

- **Any patch of sky.** Type `ra`/`dec` in decimal degrees or sexagesimal, or pick one of
  the five targets named in the challenge. Every query is a shareable URL
  (`?ra=…&dec=…&fov=…&det=…&release=…&mode=…`), so a view can be embedded or sent to someone.
- **Multi-epoch playback.** The archive is searched, frames are downloaded, reoriented,
  registered to a common grid, and played back with play/pause, speed, scrubbing and
  frame stepping (space bar and arrow keys work too).
- **Difference imaging.** `Difference` subtracts a reference epoch, which is the only way
  to see motion smaller than SPHEREx's 6.2″ pixel in a year.
- **Mean stack.** All epochs combined, for depth.
- **Per-epoch photometry.** A light curve measured in an aperture at the requested
  position, with background subtracted and error bars from the local background scatter.
- **Full provenance.** Release, detector band, exposure, visit counts, MJD, registration
  residuals and Level-2 flag bits are all shown, and epochs that cannot be registered are
  reported rather than silently dropped.
- **104-band story, honestly.** Each detector covers 17 spectral channels (0.75–5.0 µm
  across six detectors); the detector selector switches between them so the same patch
  can be compared across wavelength.

## How it works

```
browser ──► /api/dataset?ra&dec&fov&det&release
              │
              ├─ IVOA SIA2 search at IRSA  (COLLECTION=spherex_dr1 | spherex_qr3)
              ├─ group observations into epochs (32-day clustering)
              ├─ IRSA cutout service: ~4 MB FITS per frame (center,size in degrees)
              ├─ FITS decode: primary image, flags, variance  (no external library)
              ├─ resample to north-up using the CD matrix  ← essential, see below
              ├─ register every epoch by masked, high-pass Pearson correlation
              ├─ aperture photometry at the requested position
              └─ JSON: float arrays + metadata
```

Three properties of the real data shaped the pipeline:

1. **Cutout axes follow the spacecraft, not the sky.** Measured at one field, the
   orientation was −163.7° in survey 1 and +19.6° in survey 2 — the field arrives almost
   inverted between epochs. Blinking raw arrays shows rotation, not motion, so every frame
   is resampled to a north-up, east-left grid with bilinear sampling before anything else.
2. **A cutout is ~4 MB regardless of size**, because it always carries the exposure-averaged
   PSF extension (3.9 MB of tile-compressed table). The reader skips that HDU by size
   arithmetic instead of decoding it, and the request box is chosen generously then binned
   down. Epochs are cached server-side for 6 hours, and `npm run warm` pre-fetches the five
   challenge targets so the demo never waits.
3. **High proper motion moves objects out of the box.** Barnard's Star travels 10.3″/yr;
   by 2026 its J2000 position is ~4.5′ — nearly the entire default field — away from where
   SPHEREx sees it. Presets therefore carry Gaia DR3 proper motions and are propagated to
   epoch 2026.0 before the search. Typing a preset's published J2000 coordinates also works,
   because the app matches it back to the preset and propagates.

A fourth thing worth knowing when reading the images: **bright stars render as rings.** The
detectors saturate on them and the Level-2 products mask the core, so what survives is the
wings. Photometry uses a 2.2-pixel aperture to include them.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run warm         # pre-fetch the five presets (needs the dev server running)
```

The archive layer runs inside the Vite dev server as middleware, so there is one process and
one origin: `server/api.ts` exports `handleApi(pathname, params)`, which is all a serverless
adapter needs to call. No Python, no database, no API keys — IRSA's services are public.

Node 22+ is required for running the TypeScript scripts directly (`node --experimental-strip-types`).

## Data

- **SPHEREx Data Release 1 (DR1)** — Year-1 reprocessing plus the 102-channel all-sky
  spectral cube; released 12 November 2026.
- **SPHEREx Quick Release 3 (QR3)** — weekly release, September 2026 onward.
- Access: [IRSA SPHEREx archive](https://irsa.ipac.caltech.edu/Missions/spherex.html),
  IVOA SIA2 at `https://irsa.ipac.caltech.edu/SIA`, cutouts via the IBE cutout service.
- Proper motions: **Gaia DR3** (`gaiadr3.gaia_source`) via the ESA Gaia Archive TAP service.

**Required acknowledgement.** This publication makes use of data products from the
Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer
(SPHEREx), which is a joint project of the Jet Propulsion Laboratory and the California
Institute of Technology, and is funded by the National Aeronautics and Space Administration.

Cite the SPHEREx release you use: DR1 (DOI listed on the IRSA SPHEREx pages), QR3
`10.26131/IRSA662`. This project also uses data from the European Space Agency (ESA) mission
Gaia, processed by the Gaia Data Processing and Analysis Consortium (DPAC).

## Limits and next steps

- **One frame per epoch.** Epochs with up to 38 visits are collapsed to a single exposure for
  speed; averaging the repeat visits within an epoch would improve signal-to-noise
  substantially and is the obvious next optimisation.
- **Six detectors are queried one at a time.** A combined six-array stack (0.75–5.0 µm at once)
  would be deeper than any single detector image.
- **No spectral extraction.** SPHEREx spectral images encode wavelength along the detector
  y-axis (LVF); turning a cutout into a spectrum needs the WAVE-TAB lookup table and the
  archive's spectrophotometry tool. Not implemented.
- **SIP distortion is ignored** in the resampling. Over a 3–9′ box it is well below one pixel,
  and the cross-correlation registration measures and reports the residual.
- **No external catalogue overlay yet.** Gaia and WISE overlays would let users check whether a
  moving point is a known source.
- The archive's cutout service returns HTTP 503 when busy; frames are retried with backoff, and
  a failed epoch is reported in the UI instead of being hidden.

## Use of AI (required disclosure)

Code, data pipeline and documentation were developed with AI assistance (an AI coding agent
in the Freebuff environment, driven by the team member). The scientific decisions — epoch
clustering, north-up resampling, proper-motion propagation, aperture photometry and the
saturation caveat — were validated against the archive's own headers and Gaia astrometry
rather than accepted on trust. Generated code is acknowledged here and in the footer of the
application, per the Space Apps Super Intelligence guidance. No NASA branding is used.

## Repository layout

```
server/fits.ts        FITS reader (HDU walk, image decode, skips compressed tables)
server/spherex.ts     SIA2 search, epoch clustering, proper-motion helpers
server/frames.ts      cutout fetch + retry, north-up resample, registration, photometry
server/api.ts         request parsing, caching, payload assembly
src/                  React front end (viewer, controls, epoch list, light curve, metadata)
scripts/check.ts      CLI harness for the API layer
scripts/warm.ts       pre-fetch the five challenge targets
```
