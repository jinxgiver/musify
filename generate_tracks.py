"""Generate eight short, original synthetic tracks for the Musify demo.

Every track is composed from a seeded random generator and rendered with plain
Python (math + wave), so the project ships with real audio without any
copyrighted files and without third-party audio libraries.
"""
import math
import random
import wave
from array import array
from pathlib import Path

SR = 22050                                   # sample rate (Hz)
AUDIO_DIR = Path(__file__).parent / "static" / "audio"

SCALES = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
    "penta": [0, 2, 4, 7, 9],
}
PROGRESSIONS = [[0, 5, 3, 4], [0, 3, 4, 3], [5, 3, 0, 4], [0, 4, 5, 3]]

# Timbre = harmonic amplitudes + attack time (s) + decay rate (1/s)
TIMBRES = {
    "bright": dict(h=(1.0, 0.45, 0.22), attack=0.01, decay=3.2),
    "soft":   dict(h=(1.0, 0.18),       attack=0.03, decay=2.0),
    "pad":    dict(h=(1.0, 0.30, 0.12), attack=0.35, decay=0.5),
}

TRACKS = [
    dict(id=1, title="Neon Drive",      artist="Pixel Harbor",  album="Night Circuit", genre="Synthwave",
         tempo=110, energy=0.80, valence=0.55, root=45, scale="minor", timbre="bright",
         color1="#7c3aed", color2="#ec4899", seed=11),
    dict(id=2, title="Midnight Rain",   artist="Lo-Fi Lantern", album="Rooftop Tapes", genre="Lo-Fi",
         tempo=72,  energy=0.30, valence=0.40, root=50, scale="minor", timbre="soft",
         color1="#1e3a8a", color2="#38bdf8", seed=22),
    dict(id=3, title="Golden Hour",     artist="Sundial Club",  album="Long Days",     genre="Pop",
         tempo=118, energy=0.72, valence=0.85, root=48, scale="major", timbre="bright",
         color1="#f59e0b", color2="#ef4444", seed=33),
    dict(id=4, title="Static Bloom",    artist="Pixel Harbor",  album="Night Circuit", genre="Synthwave",
         tempo=100, energy=0.70, valence=0.45, root=43, scale="minor", timbre="bright",
         color1="#0ea5e9", color2="#a855f7", seed=44),
    dict(id=5, title="Paper Boats",     artist="Lo-Fi Lantern", album="Rooftop Tapes", genre="Lo-Fi",
         tempo=68,  energy=0.25, valence=0.60, root=53, scale="major", timbre="soft",
         color1="#065f46", color2="#a3e635", seed=55),
    dict(id=6, title="Tidal Run",       artist="Sundial Club",  album="Long Days",     genre="Pop",
         tempo=124, energy=0.85, valence=0.80, root=52, scale="major", timbre="bright",
         color1="#06b6d4", color2="#22c55e", seed=66),
    dict(id=7, title="Still Water",     artist="Aria Vale",     album="Slow Light",    genre="Ambient",
         tempo=60,  energy=0.15, valence=0.50, root=48, scale="penta", timbre="pad",
         color1="#0f766e", color2="#5eead4", seed=77),
    dict(id=8, title="Northern Lights", artist="Aria Vale",     album="Slow Light",    genre="Ambient",
         tempo=56,  energy=0.20, valence=0.65, root=50, scale="penta", timbre="pad",
         color1="#4c1d95", color2="#34d399", seed=88),
]
for _t in TRACKS:
    _t["file"] = f"track{_t['id']:02d}.wav"


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def degree_to_midi(root, scale, degree):
    return root + 12 * (degree // len(scale)) + scale[degree % len(scale)]


def render_note(buf, start, midi, dur, amp, timbre):
    """Add one note (additive synthesis with an envelope) into the buffer."""
    p = TIMBRES[timbre]
    s0 = int(start * SR)
    if s0 >= len(buf):
        return
    n = min(int(dur * SR), len(buf) - s0)
    att = max(1, int(p["attack"] * SR))
    rel = int(0.05 * SR)
    w = 2 * math.pi * midi_hz(midi) / SR
    harmonics = list(enumerate(p["h"], 1))
    decay = p["decay"] / SR
    for i in range(n):
        env = min(1.0, i / att) * math.exp(-decay * i)
        if n - i < rel:
            env *= (n - i) / rel
        x = 0.0
        for k, a in harmonics:
            x += a * math.sin(w * k * i)
        buf[s0 + i] += amp * env * x


def compose(t):
    rng = random.Random(t["seed"])
    beat = 60.0 / t["tempo"]
    bar = 4 * beat
    n_bars = max(1, round(24 / bar))
    buf = [0.0] * int((n_bars * bar + 1.5) * SR)       # +1.5 s tail for the echo
    scale, root = SCALES[t["scale"]], t["root"]
    prog = rng.choice(PROGRESSIONS)
    lively = t["energy"] > 0.5
    step = beat / 2 if lively else beat
    melody_timbre = "soft" if t["timbre"] == "pad" else t["timbre"]
    pad_amp = 0.18 if t["timbre"] == "pad" else 0.10
    deg = 2

    for b in range(n_bars):
        chord = prog[b % len(prog)]
        t0 = b * bar
        chord_notes = [degree_to_midi(root, scale, chord + o) for o in (0, 2, 4)]
        for m in chord_notes:                                     # pad: sustained chord
            render_note(buf, t0, m + 12, bar, pad_amp, "pad")
        pulses = 4 if lively else 1                               # bass line
        for k in range(pulses):
            render_note(buf, t0 + k * bar / pulses, chord_notes[0], bar / pulses * 0.9, 0.22, "soft")
        for k in range(int(bar / step)):                          # melody: random walk
            if rng.random() < (0.15 if lively else 0.4):
                continue
            deg = max(0, min(len(scale) + 2, deg + rng.choice((-2, -1, -1, 0, 1, 1, 2))))
            render_note(buf, t0 + k * step, degree_to_midi(root + 24, scale, deg),
                        step * 1.6, 0.16, melody_timbre)

    delay = int(beat * 0.75 * SR)                                 # feedback echo
    for i in range(delay, len(buf)):
        buf[i] += 0.35 * buf[i - delay]

    peak = max(abs(x) for x in buf) or 1.0                        # normalise + fades
    fade = int(0.4 * SR)
    for i in range(len(buf)):
        g = 0.85 / peak
        if i < fade:
            g *= i / fade
        elif len(buf) - i < fade:
            g *= (len(buf) - i) / fade
        buf[i] *= g
    return buf


def write_wav(path, buf):
    pcm = array("h", (int(max(-1.0, min(1.0, x)) * 32767) for x in buf))
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def generate_all():
    """Render any missing track. Safe to call on every start-up."""
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    for t in TRACKS:
        path = AUDIO_DIR / t["file"]
        if not path.exists():
            print(f"Rendering {t['title']} ...", flush=True)
            write_wav(path, compose(t))


if __name__ == "__main__":
    generate_all()
