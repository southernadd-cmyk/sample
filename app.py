from flask import Flask, Response, jsonify, request, send_from_directory
import os
import requests
import yt_dlp
from flask_cors import CORS
from urllib.parse import urlparse

app = Flask(__name__, static_folder="static", static_url_path="/static")

FRONTEND_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "https://southernadd-cmyk.github.io"
    ).split(",")
    if origin.strip()
]

CORS(
    app,
    resources={r"/api/*": {"origins": FRONTEND_ORIGINS}},
    expose_headers=["X-Track-Title"],
)

MAX_DURATION_SECONDS = 15 * 60
# backend-build: youtube-format-fallback-2

def is_youtube_url(value: str) -> bool:
    try:
        host = (urlparse(value).hostname or "").lower()
        return host in {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "music.youtube.com"}
    except Exception:
        return False

@app.get("/")
def index():
    return send_from_directory("static", "index.html")

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/api/youtube")
def youtube_audio():
    data = request.get_json(silent=True) or {}
    url = str(data.get("url", "")).strip()

    if not is_youtube_url(url):
        return jsonify(error="Enter a valid YouTube URL."), 400

    pot_provider_url = os.getenv("POT_PROVIDER_URL", "").strip()

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        # Prefer a direct audio-only stream. If YouTube exposes only a combined
        # A/V stream for this client/session, allow that as a browser-decodable
        # fallback rather than failing the import.
        "format": "bestaudio[acodec!=none]/best[acodec!=none]",
        "skip_download": True,
        "socket_timeout": 20,
        "extractor_args": {
            "youtube": {
                # Current yt-dlp guidance for PO-token-backed web extraction is
                # to include the default clients alongside mweb rather than
                # forcing mweb alone.
                "player_client": ["default", "mweb"],
            },
        },
    }

    # Railway/datacentre IPs are frequently challenged by YouTube. When configured,
    # bgutil supplies fresh Proof-of-Origin tokens to yt-dlp without storing a user's
    # personal YouTube cookies on the server.
    if pot_provider_url:
        ydl_opts["extractor_args"]["youtubepot-bgutilhttp"] = {
            "base_url": [pot_provider_url],
        }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        duration = int(info.get("duration") or 0)
        if duration and duration > MAX_DURATION_SECONDS:
            return jsonify(error="For this prototype, use a YouTube video shorter than 15 minutes."), 400

        media_url = info.get("url")
        if not media_url:
            return jsonify(error="Could not find an audio stream for that video."), 502

        headers = info.get("http_headers") or {}
        upstream = requests.get(media_url, headers=headers, stream=True, timeout=30)
        upstream.raise_for_status()

        content_type = upstream.headers.get("Content-Type", "audio/mp4")
        title = str(info.get("title") or "YouTube sample")
        safe_title = title.replace("\r", " ").replace("\n", " ")[:180]

        def generate():
            try:
                for chunk in upstream.iter_content(chunk_size=256 * 1024):
                    if chunk:
                        yield chunk
            finally:
                upstream.close()

        response = Response(generate(), content_type=content_type)
        response.headers["X-Track-Title"] = safe_title
        response.headers["Cache-Control"] = "no-store"
        return response

    except yt_dlp.utils.DownloadError as exc:
        message = str(exc)
        if "confirm you’re not a bot" in message.lower() or "confirm you're not a bot" in message.lower():
            return jsonify(
                error="YouTube is still challenging the server connection. "
                      "Try the same URL again once; if it persists, use a local audio file."
            ), 502
        return jsonify(error=f"YouTube import failed: {message}"), 502
    except requests.RequestException:
        return jsonify(error="YouTube audio stream could not be downloaded."), 502
    except Exception as exc:
        return jsonify(error=f"Import failed: {exc}"), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
