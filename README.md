# Sample — browser MPC-style sampler

A browser-based 16-pad sampler that can import a YouTube track, chop it across pads, capture pad performances in layers and export the finished performance as a WAV.

## Keyboard layout

```
1  2  3  4
Q  W  E  R
A  S  D  F
Z  X  C  V
```

## Features

- YouTube URL import through the Flask backend
- local audio-file import
- 16 automatic equal slices
- keyboard and mouse/touch pads
- waveform display with slice markers
- per-pad start/end nudging
- one-shot and gate playback
- mono choke on/off
- performance recording
- unlimited overdub layers for a session
- mute, solo and delete individual layers
- playback of the complete layered mix
- client-side stereo WAV rendering/export
- responsive MPC-style interface

## Recording workflow

1. Load a song.
2. Play the pads to find the chops you want.
3. Click **Record Layer** and perform using the keyboard/pads.
4. Click **Stop**.
5. Click **Record Layer** again to overdub. Existing active layers play while the new layer is recorded.
6. Mute, solo or delete layers as required.
7. Click **Play Mix** to preview the arrangement.
8. Click **Export WAV** to render and download the combined performance.

The browser stores the performance as timed pad-trigger events. WAV export uses an OfflineAudioContext, so no server-side audio rendering is needed.


## Exporting an Akai MPC Sample kit

**Export MPC Sample Kit now includes the native `.xpj` project automatically.**
No blank project from your hardware is required. Each ZIP contains
`<KitName>.xpj`, the matching `<KitName>_[ProjectData]/` folder with
`A01.wav` through `A16.wav`, `PAD MAP.csv`, and loading instructions.
Chrome opens Save As (other browsers use a download).

The 16 samples come from the active source with precise edited chop boundaries;
44.1 kHz 16-bit stereo WAV output bakes in current tempo/pitch playback rate.
Performance layers, recordings, and sequences are not exported.

The built-in project is a compact native MPC Sample blank-project skeleton,
expanded to 128 pads in the browser. MPC Sample floating-point numeric
representations are preserved when the project is written, rather than
round-tripping through normal JavaScript JSON formatting.

Unzip the downloaded kit and copy **both** the `.xpj` and matching
`_[ProjectData]` folder to the MPC Sample microSD card. Hardware and firmware
compatibility still need verifying on the actual MPC Sample. If a particular
firmware requires a different base project, a **device template override**
remains available under MPC Sample Kit · Optional Device Template Override.

### Bundled template provenance

`docs/mpc-sample-template.json` is a compact blank-device project
skeleton adapted from the open-source
[WorldLinkStudio/mpcsample](https://github.com/WorldLinkStudio/mpcsample)
template, under GPL-3.0. The asset is stored separately from MPCTube's
own JavaScript implementation. See `docs/mpc-template-NOTICE.txt` and
`docs/mpc-template-LICENSE.txt` for attribution/licensing. The samples
produced by users remain their own content.

## Run locally

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open http://localhost:5000

## Railway

1. Create a Railway project.
2. Deploy from this GitHub repository.
3. Railway installs `requirements.txt`.
4. The `Procfile` starts Gunicorn.
5. No environment variables are required for the prototype.

## Why GitHub Pages alone is not enough

The sampler itself is browser-side, but reliable YouTube audio resolving requires a backend. Flask + `yt-dlp` resolves the media stream and sends it to the browser. The pad engine, layering and WAV export then all happen locally in the browser.

## Important

Use source material you have permission or a legal right to sample. YouTube delivery can change over time, so URL import may occasionally require updating `yt-dlp`.

## Strong next additions

- transient/onset detection instead of equal divisions
- draggable chop markers
- BPM detection and metronome
- quantisation and swing
- loop length / bar-based recording
- pad banks A–D
- pitch, filter and envelope per pad
- save/load projects

## GitHub Pages voice count-in

The browser recorder counts aloud **3, 2, 1, GO**, one cue per beat at the target BPM. Recording starts exactly on GO. The clock displays the same cues, then the loop position. Turning voice count-in off starts without the countdown. Voice cues are scheduled through Web Audio for consistent timing, cancel on Stop, and are not included in recorded layer events or the exported WAV. If the audio assets cannot load, visual cues and clicks remain available. The short synthetic voice clips in `docs/audio` were generated using CMU Flite (SLT voice).
