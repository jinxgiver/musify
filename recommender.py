"""Content-based recommendations: songs are vectors, taste is their weighted mean.

No external ML library is needed. Each song becomes a small feature vector
(genre one-hot + tempo + energy + mood) and cosine similarity ranks candidates.
"""
import math

GENRES = ["Synthwave", "Lo-Fi", "Pop", "Ambient"]


def vector(song):
    genre = [1.0 if song["genre"] == g else 0.0 for g in GENRES]
    tempo = (song["tempo"] - 50) / 80.0          # roughly 0..1 for 50-130 BPM
    return genre + [tempo, song["energy"], song["valence"]]


def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def similar(target, songs, k=4):
    """Songs most like `target` (never the target itself)."""
    tv = vector(target)
    scored = [(cosine(tv, vector(s)), s) for s in songs if s["id"] != target["id"]]
    scored.sort(key=lambda p: p[0], reverse=True)
    return [s for _, s in scored[:k]]


def for_user(profile, songs, k=6):
    """`profile` = [(song, weight)] from likes and plays; returns best unseen songs."""
    if not profile:
        return sorted(songs, key=lambda s: s["energy"], reverse=True)[:k]
    dims = len(vector(profile[0][0]))
    total = sum(w for _, w in profile)
    taste = [sum(vector(s)[d] * w for s, w in profile) / total for d in range(dims)]
    liked_ids = {s["id"] for s, _ in profile}
    candidates = [s for s in songs if s["id"] not in liked_ids] or songs
    candidates.sort(key=lambda s: cosine(taste, vector(s)), reverse=True)
    return candidates[:k]
