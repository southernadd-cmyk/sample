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

**Export MPC Sample Kit always initiates saving a ZIP**, never opening a file
to import. In browsers that support the File System Access API, Chrome displays
a native **Save As** dialog. Other browsers use a normal file download.

The ZIP always includes 16 individual 44.1 kHz, 16-bit stereo WAV chops from
the active source with their edited boundaries and tempo/pitch playback rate
baked in, plus a `PAD MAP.csv` file for pads A01–A16. Recorded performances
are not exported.

**Optional native MPC Sample project:** Automatic mapping on hardware requires
a firmware-compatible `.xpj` template. On your MPC Sample, save an empty drum
project and transfer its `.xpj` to your computer. In MPCTube, expand
**MPC Sample Kit Setup · Optional Native Project** and click
**Load / Change Device .XPJ Template**. The device file is imported *only*
through that button, not via the Export action. MPCTube stores the template
locally in your browser. Subsequent exports then include `<KitName>.xpj`
and a matching `<KitName>_[ProjectData]/` WAV folder alongside the pad map.

Without a template the saved ZIP contains only a WAV folder and pad map,
so pad assignments must be made manually on the MPC Sample; the export
message makes this limitation explicit. Unzip native kits and transfer
both the `.xpj` and matching `_[ProjectData]` folder to the microSD card.
Actual on-device loading should be verified on a physical MPC Sample.

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
