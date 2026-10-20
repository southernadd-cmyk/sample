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


## Exporting a hardware-ready Akai MPC Sample kit

The **Export MPC Sample Kit** button in the GitHub Pages version exports the
**currently active source's 16 edited chops**, not the recorded performance
layers. The ZIP contains a firmware-compatible `.xpj` drum project, plus
`<KitName>_[ProjectData]/A01.wav` through `A16.wav`.

**One-time hardware setup:** on your Akai MPC Sample, create and save a new,
empty project containing a drum track. Copy its `.xpj` file to your computer.
On MPCTube, open **MPC Sample Kit Export · First-time Setup** and select it.
The compressed template is retained in the current browser's local storage;
nothing is uploaded to the server. MPCTube uses your device's project
structure as the basis for each new kit because firmware versions differ.
To change devices/firmware, select a new template.

Then capture/chop a source and click **Export MPC Sample Kit**. Unzip the ZIP
and transfer **both** `<KitName>.xpj` and the matching
`<KitName>_[ProjectData]` folder together onto the microSD card. Load the
project in the MPC Sample's Project menu. The per-pad WAVs are rendered as
44.1 kHz 16-bit stereo, with the current playback tempo/pitch rate baked into
the audio. Pad A01 in MPCTube maps to hardware A01, and so on through A16.

Recorded layer performances are **not** transferred, and the physical pad
orientation may differ from MPCTube's on-screen grid; pad **numbers** are the
mapping. Actual on-device loading depends on the user's firmware and must be
verified with a real MPC Sample. The standalone exporter is covered by
`node --test tests/mpc-kit-export.test.cjs`.

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
