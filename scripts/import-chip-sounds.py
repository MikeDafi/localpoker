#!/usr/bin/env python3
"""
Import the call and raise cues from real recordings of chips being thrown.

Why this exists
---------------
The bet cues used to be built by `make-chip-sounds.py`, which stacks copies of
one recorded chip click. However the copies were spaced and pitched, a player
heard one click repeating: "a buzz, like a fly", and nothing like money. The
same CC0 pack that click came from has real takes of a handful of chips being
handled and of chips colliding, which is what a bet actually sounds like, so
the cues are now those recordings, trimmed and levelled, and nothing else.

Source: Kenney, "Casino Audio" (CC0), `kenney_casino-audio.zip` from
https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips
See assets/textures/CREDITS.md.

Run with the pack unzipped somewhere and its `Audio` folder as the argument:

    uvx --with soundfile --with numpy python scripts/import-chip-sounds.py <Audio dir>
"""

import sys
from pathlib import Path

import numpy as np
import soundfile as sf

SOUNDS = Path(__file__).resolve().parent.parent / "assets" / "sounds"
RATE = 44100

# One take per cue. A call is a few chips going in, a raise a whole handful.
# Each style keeps its character: toss is chips tossed onto the felt, splash a
# looser, longer spill, riffle a neat stack being set down.
TAKES = {
    ("toss", "call"): ("chips-collide-2.ogg", 0.42),
    ("toss", "raise"): ("chips-handle-5.ogg", 0.46),
    ("splash", "call"): ("chips-handle-6.ogg", 0.38),
    ("splash", "raise"): ("chips-handle-1.ogg", 0.40),
    ("riffle", "call"): ("chips-stack-3.ogg", 0.36),
    ("riffle", "raise"): ("chips-handle-2.ogg", 0.39),
}


def load(path: Path) -> np.ndarray:
    data, rate = sf.read(str(path), always_2d=True)
    mono = data.mean(axis=1)
    if rate != RATE:
        # Linear resample; the pack is already 44.1kHz, this is a safety net.
        positions = np.arange(0, len(mono) * RATE / rate) * rate / RATE
        mono = np.interp(positions, np.arange(len(mono)), mono)
    return mono


def tidy(samples: np.ndarray, peak: float) -> np.ndarray:
    """
    Trim the silence before the first chip, so the cue lands with the action
    rather than a beat after it, fade the tail so the cut is not a click, and
    level it to sit with the rest of the table instead of above it.
    """
    loudest = np.abs(samples).max() or 1.0
    start = int(np.argmax(np.abs(samples) > loudest * 0.08))
    start = max(0, start - int(RATE * 0.003))
    out = samples[start:].copy()
    fade = min(len(out), int(RATE * 0.03))
    out[-fade:] *= np.linspace(1.0, 0.0, fade)
    return out * (peak / (np.abs(out).max() or 1.0))


def write(path: Path, samples: np.ndarray) -> None:
    sf.write(str(path), np.clip(samples, -1.0, 1.0), RATE, subtype="PCM_16")


def main() -> None:
    source = Path(sys.argv[1])
    for (style, action), (name, peak) in TAKES.items():
        stem = "chipCall" if action == "call" else "chipRaise"
        cue = tidy(load(source / name), peak)
        write(SOUNDS / f"{stem}-{style}.wav", cue)
        if style == "toss":
            write(SOUNDS / f"{stem}.wav", cue)
    print("wrote chipCall and chipRaise cues from", source)


if __name__ == "__main__":
    main()
