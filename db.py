"""SQLite storage layer for Musify (standard library only)."""
import sqlite3
import wave
from pathlib import Path

DB_PATH = Path(__file__).parent / "instance" / "musify.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS songs (
    id        INTEGER PRIMARY KEY,
    title     TEXT NOT NULL,
    artist    TEXT NOT NULL,
    album     TEXT NOT NULL,
    genre     TEXT NOT NULL,
    tempo     REAL NOT NULL,          -- beats per minute
    energy    REAL NOT NULL,          -- 0..1
    valence   REAL NOT NULL,          -- 0..1 (mood: sad -> happy)
    duration  REAL NOT NULL,          -- seconds
    file      TEXT NOT NULL,
    color1    TEXT NOT NULL,
    color2    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS playlists (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS playlist_songs (
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    song_id     INTEGER NOT NULL REFERENCES songs(id)     ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, song_id)
);
CREATE TABLE IF NOT EXISTS likes (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id INTEGER NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS plays (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id   INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    played_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


def connect():
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _duration(path):
    with wave.open(str(path), "rb") as w:
        return w.getnframes() / w.getframerate()


def init_db(tracks, audio_dir):
    """Create tables and, on first run, seed songs plus a little demo history."""
    conn = connect()
    conn.executescript(SCHEMA)
    if conn.execute("SELECT COUNT(*) FROM songs").fetchone()[0] == 0:
        for t in tracks:
            conn.execute(
                "INSERT INTO songs (id,title,artist,album,genre,tempo,energy,valence,duration,file,color1,color2)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (t["id"], t["title"], t["artist"], t["album"], t["genre"], t["tempo"], t["energy"],
                 t["valence"], round(_duration(audio_dir / t["file"]), 2), t["file"], t["color1"], t["color2"]))
        demo = {"Focus Mix": [2, 5, 7, 8], "Workout": [6, 1, 3, 4], "Late Night Drive": [1, 4, 2]}
        for name, ids in demo.items():
            pid = conn.execute("INSERT INTO playlists (name) VALUES (?)", (name,)).lastrowid
            for pos, sid in enumerate(ids):
                conn.execute("INSERT INTO playlist_songs VALUES (?,?,?)", (pid, sid, pos))
        for sid in (1, 3):
            conn.execute("INSERT INTO likes (song_id) VALUES (?)", (sid,))
        for sid in (2, 4, 3, 1):
            conn.execute("INSERT INTO plays (song_id) VALUES (?)", (sid,))
        conn.commit()
    conn.close()
