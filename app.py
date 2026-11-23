"""Musify - a Spotify-style music streaming web app (Flask demo).

Run:  python app.py      then open http://127.0.0.1:5000
"""
from flask import (Flask, abort, g, jsonify, render_template, request,
                   send_file, send_from_directory)

import db
import recommender
from generate_tracks import AUDIO_DIR, TRACKS, generate_all

app = Flask(__name__)

SONG_SQL = ("SELECT s.*, EXISTS(SELECT 1 FROM likes l WHERE l.song_id = s.id) AS liked "
            "FROM songs s")


# ---------------------------------------------------------------- helpers
def get_db():
    if "db" not in g:
        g.db = db.connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def song_dict(row):
    d = dict(row)
    d["liked"] = bool(d.get("liked"))
    return d


def query_songs(sql_tail="", params=()):
    rows = get_db().execute(SONG_SQL + " " + sql_tail, params).fetchall()
    return [song_dict(r) for r in rows]


# ------------------------------------------------------------------ pages
@app.get("/")
def index():
    return render_template("index.html")


@app.get("/sw.js")
def service_worker():
    """Served from the site root so the worker's scope covers the whole app."""
    resp = send_from_directory(app.static_folder, "sw.js", mimetype="application/javascript")
    resp.headers["Service-Worker-Allowed"] = "/"
    resp.headers["Cache-Control"] = "no-cache"
    return resp


# -------------------------------------------------------------- streaming
@app.get("/stream/<int:song_id>")
def stream(song_id):
    """Serve audio with HTTP Range support so the player can seek instantly."""
    row = get_db().execute("SELECT file FROM songs WHERE id = ?", (song_id,)).fetchone()
    if row is None:
        abort(404)
    return send_file(AUDIO_DIR / row["file"], mimetype="audio/wav", conditional=True)


# --------------------------------------------------------------- catalogue
@app.get("/api/songs")
def list_songs():
    q = request.args.get("q", "").strip().lower()
    genre = request.args.get("genre")
    where, params = [], []
    if q:
        where.append("(lower(s.title) LIKE ? OR lower(s.artist) LIKE ? "
                     "OR lower(s.album) LIKE ? OR lower(s.genre) LIKE ?)")
        params += [f"%{q}%"] * 4
    if genre:
        where.append("s.genre = ?")
        params.append(genre)
    tail = ("WHERE " + " AND ".join(where) if where else "") + " ORDER BY s.id"
    return jsonify(query_songs(tail, params))


@app.get("/api/genres")
def genres():
    rows = get_db().execute(
        "SELECT genre, COUNT(*) AS count, MIN(color1) AS color1, MAX(color2) AS color2 "
        "FROM songs GROUP BY genre ORDER BY genre").fetchall()
    return jsonify([dict(r) for r in rows])


@app.get("/api/songs/<int:song_id>/similar")
def similar(song_id):
    songs = query_songs()
    target = next((s for s in songs if s["id"] == song_id), None)
    if target is None:
        abort(404)
    return jsonify(recommender.similar(target, songs))


# ------------------------------------------------- listening history, likes
@app.post("/api/songs/<int:song_id>/play")
def log_play(song_id):
    conn = get_db()
    conn.execute("INSERT INTO plays (song_id) VALUES (?)", (song_id,))
    conn.commit()
    return "", 204


@app.post("/api/songs/<int:song_id>/like")
def toggle_like(song_id):
    conn = get_db()
    removed = conn.execute("DELETE FROM likes WHERE song_id = ?", (song_id,)).rowcount
    if not removed:
        conn.execute("INSERT INTO likes (song_id) VALUES (?)", (song_id,))
    conn.commit()
    return jsonify(liked=not removed)


@app.get("/api/likes")
def liked_songs():
    return jsonify(query_songs("JOIN likes k ON k.song_id = s.id ORDER BY k.id DESC"))


@app.get("/api/recent")
def recent():
    return jsonify(query_songs(
        "JOIN (SELECT song_id, MAX(id) AS last FROM plays GROUP BY song_id) p "
        "ON p.song_id = s.id ORDER BY p.last DESC LIMIT 8"))


@app.get("/api/recommendations")
def recommendations():
    songs = query_songs()
    counts = {r["song_id"]: r["n"] for r in get_db().execute(
        "SELECT song_id, COUNT(*) AS n FROM plays GROUP BY song_id")}
    profile = [(s, (2 if s["liked"] else 0) + counts.get(s["id"], 0))
               for s in songs if s["liked"] or s["id"] in counts]
    return jsonify(recommender.for_user(profile, songs, k=6))


# ---------------------------------------------------------------- playlists
@app.get("/api/playlists")
def list_playlists():
    rows = get_db().execute(
        "SELECT p.id, p.name, COUNT(ps.song_id) AS count, "
        "  (SELECT s.color1 FROM playlist_songs x JOIN songs s ON s.id = x.song_id "
        "   WHERE x.playlist_id = p.id ORDER BY x.position LIMIT 1) AS color1, "
        "  (SELECT s.color2 FROM playlist_songs x JOIN songs s ON s.id = x.song_id "
        "   WHERE x.playlist_id = p.id ORDER BY x.position LIMIT 1) AS color2 "
        "FROM playlists p LEFT JOIN playlist_songs ps ON ps.playlist_id = p.id "
        "GROUP BY p.id ORDER BY p.id").fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/playlists")
def create_playlist():
    name = (request.get_json(silent=True) or {}).get("name", "").strip()
    if not 1 <= len(name) <= 60:
        return jsonify(error="Name must be 1-60 characters"), 400
    conn = get_db()
    pid = conn.execute("INSERT INTO playlists (name) VALUES (?)", (name,)).lastrowid
    conn.commit()
    return jsonify(id=pid, name=name), 201


@app.get("/api/playlists/<int:pid>")
def get_playlist(pid):
    conn = get_db()
    pl = conn.execute("SELECT id, name FROM playlists WHERE id = ?", (pid,)).fetchone()
    if pl is None:
        abort(404)
    songs = query_songs("JOIN playlist_songs ps ON ps.song_id = s.id "
                        "WHERE ps.playlist_id = ? ORDER BY ps.position", (pid,))
    return jsonify(id=pl["id"], name=pl["name"], songs=songs)


@app.post("/api/playlists/<int:pid>/songs")
def add_to_playlist(pid):
    song_id = (request.get_json(silent=True) or {}).get("song_id")
    conn = get_db()
    if not conn.execute("SELECT 1 FROM playlists WHERE id = ?", (pid,)).fetchone() or \
       not conn.execute("SELECT 1 FROM songs WHERE id = ?", (song_id,)).fetchone():
        abort(404)
    pos = conn.execute("SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_songs "
                       "WHERE playlist_id = ?", (pid,)).fetchone()[0]
    cur = conn.execute("INSERT OR IGNORE INTO playlist_songs VALUES (?,?,?)", (pid, song_id, pos))
    conn.commit()
    return jsonify(added=bool(cur.rowcount))


@app.delete("/api/playlists/<int:pid>/songs/<int:song_id>")
def remove_from_playlist(pid, song_id):
    conn = get_db()
    conn.execute("DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?", (pid, song_id))
    conn.commit()
    return "", 204


# -------------------------------------------------------------- bootstrap
def bootstrap():
    generate_all()                       # render audio on the first run only
    db.init_db(TRACKS, AUDIO_DIR)        # create tables + seed demo data once


bootstrap()

if __name__ == "__main__":
    app.run(debug=False, port=5000)
