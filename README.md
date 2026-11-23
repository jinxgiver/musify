# 🎵 Musify

A Spotify-style music streaming web app, built as an installable Progressive Web App (PWA) with **Python + Flask**, SQLite and vanilla JavaScript. No external audio files, ML libraries or front-end frameworks are needed: the demo tracks are synthesised in plain Python on first run.

| Home | Playlist playing | Search |
| --- | --- | --- |
| ![Home](screenshots/01-home.png) | ![Playlist playing](screenshots/02-playlist-playing.png) | ![Search](screenshots/03-search.png) |

| Add to playlist | Browse by genre | Mobile |
| --- | --- | --- |
| ![Add to playlist](screenshots/04-add-to-playlist.png) | ![Genre](screenshots/05-genre.png) | ![Mobile home](screenshots/06-mobile-home.png) |

## Features

- **Streaming player** with play/pause, seek, next/previous and HTTP Range-based audio streaming for instant scrubbing
- **Search** by title or artist, and **browse by genre**
- **Playlists**: create playlists, add and remove songs
- **Likes, recently played and play history**
- **Recommendations** using content-based filtering (cosine similarity over genre, tempo, energy and mood), implemented without any ML library
- **Similar songs** for any track
- **PWA**: installable, offline app shell via a service worker, Media Session API for lock-screen / media-key controls
- **Responsive UI** that works on desktop and mobile
- **Original demo audio**: eight short synthetic tracks generated at first start, so there are no copyright concerns

## Quick start

Requires Python 3.9+.

```bash
git clone https://github.com/jinxgiver/musify.git
cd musify

python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

pip install -r requirements.txt
python app.py
```

Open <http://127.0.0.1:5000>.

On the first start the app renders the demo tracks into `static/audio/` and creates `instance/musify.db` with demo playlists. To regenerate the audio manually, run `python generate_tracks.py`.

## Project layout

| Path | Purpose |
| --- | --- |
| `app.py` | Flask routes: pages, REST API, range-based audio streaming |
| `db.py` | SQLite schema, connection helper and first-run seeding |
| `recommender.py` | Content-based recommendations (cosine similarity) |
| `generate_tracks.py` | Synthesises the demo audio with plain Python |
| `templates/index.html` | The single page shell |
| `static/app.js` | Front end: routing, player, playlists, Media Session |
| `static/sw.js` | Service worker: offline app shell |
| `static/manifest.webmanifest` | Makes the site installable |
| `screenshots/` | Images used in this README |

## API overview

| Method & route | Description |
| --- | --- |
| `GET /stream/<id>` | Stream a track (supports HTTP Range requests) |
| `GET /api/songs` | List songs; filter with `?q=` and `?genre=` |
| `GET /api/genres` | List genres |
| `GET /api/songs/<id>/similar` | Songs most similar to a track |
| `POST /api/songs/<id>/like` | Toggle like |
| `POST /api/songs/<id>/play` | Log a play |
| `GET /api/likes` | Liked songs |
| `GET /api/recent` | Recently played |
| `GET /api/recommendations` | Personalised recommendations |
| `GET /api/playlists` | List playlists |
| `POST /api/playlists` | Create a playlist |
| `GET /api/playlists/<id>` | Playlist with its songs |
| `POST /api/playlists/<id>/songs` | Add a song to a playlist |
| `DELETE /api/playlists/<id>/songs/<song_id>` | Remove a song from a playlist |

## How recommendations work

Each song becomes a small feature vector: a genre one-hot encoding plus normalised tempo, energy and valence (mood). Your taste profile is the weighted mean of the vectors of songs you liked and played, and unseen songs are ranked by cosine similarity to it. With no history, the app falls back to the highest-energy tracks. See [`recommender.py`](recommender.py).

## Tech stack

Python · Flask · SQLite · HTML/CSS · Vanilla JS · Service Worker · Web App Manifest · Media Session API

## Notes

This is a demo project intended for learning and experimentation, not a production streaming service.
