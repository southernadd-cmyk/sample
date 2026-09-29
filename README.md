# Sample — browser MPC-style sampler

A 16-pad browser sampler that can load audio from a YouTube URL, split the track into 16 equal chops, and play those chops from the computer keyboard.

## Keyboard layout

```
1  2  3  4
Q  W  E  R
A  S  D  F
Z  X  C  V
```

Pads can also be clicked/tapped.

## Features

- YouTube URL import
- local audio-file import
- 16 automatic equal slices
- keyboard-triggered pads
- waveform display with slice markers
- one-shot and gate playback modes
- mono choke on/off
- master volume
- per-pad start/end nudging
- responsive UI

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

This repository is ready for Railway:

1. Create a Railway project.
2. Deploy from this GitHub repository.
3. Railway will install `requirements.txt`.
4. The `Procfile` starts Gunicorn.
5. No environment variables are required for the first prototype.

## Why GitHub Pages alone is not enough

The sampler UI is ordinary HTML/CSS/JavaScript, but importing audio from an arbitrary YouTube URL cannot reliably be done directly in the browser because the media request is restricted and YouTube does not expose a browser-friendly audio-download API for this purpose.

The Flask endpoint uses `yt-dlp` server-side to resolve the audio stream, then streams it back to the sampler.

## Important

Use source material you have the right or permission to sample. YouTube may also change its delivery mechanisms, so URL importing can occasionally require a `yt-dlp` update.

## Next ideas

- transient/onset detection instead of equal slices
- draggable slice markers
- pad banks A–D
- pitch/tune per pad
- filter and envelope controls
- sequence recorder / step sequencer
- swing and BPM
- export a chopped sample pack
