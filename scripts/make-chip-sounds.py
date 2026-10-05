#!/usr/bin/env python3
"""
Build the call and raise chip cues from the one real chip recording.

Why this exists
---------------
`chipCall.wav` was a byte copy of the single `chip.wav` transient and
`chipRaise.wav` was three identical copies of it. Measured, both sat at a
spectral centroid near 6kHz with a 0.92 peak, while every other cue in the app
peaks between 0.16 and 0.39. So the betting sounds were the brightest and by
far the loudest things on the table, and they were built from one unvarying
click. That is why they read as a user interface tick rather than as money.

Real chips are not one click. They are several, overlapping, each slightly
different in pitch and loudness, with the body of the sound well below the
attack. This rebuilds both cues to be exactly that:

  1. several copies of the source hit, not one,
  2. each resampled to a different pitch, so no two hits are identical, which
     is the single biggest reason a repeat reads as a machine rather than as
     objects,
  3. jittered onsets, because chips do not land on a grid,
  4. a one pole low pass to move the centroid down towards where clay actually
     sits, keeping the attack but losing the glassy top,
  5. normalised to sit with the rest of the mix rather than above it.

Deterministic on purpose. The repo checks that regenerating a sound produces
identical bytes, so the jitter comes from a fixed table rather than from a
random number generator.

Source audio and its licence are recorded in assets/textures/CREDITS.md. This
script only re-edits the already vendored CC0 recording; it downloads nothing.
"""

import struct
import wave
from pathlib import Path

SOUNDS = Path(__file__).resolve().parent.parent / "assets" / "sounds"
SOURCE = SOUNDS / "chip.wav"
RATE = 44100


def read_wav(path: Path) -> list[float]:
    with wave.open(str(path), "rb") as w:
        frames = w.getnframes()
        channels = w.getnchannels()
        raw = w.readframes(frames)
        data = struct.unpack("<%dh" % (frames * channels), raw)
        if channels == 2:
            data = [(data[i] + data[i + 1]) / 2 for i in range(0, len(data), 2)]
        return [s / 32768.0 for s in data]


def write_wav(path: Path, samples: list[float]) -> None:
    clipped = [max(-1.0, min(1.0, s)) for s in samples]
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(s * 32767)) for s in clipped))


def resample(samples: list[float], ratio: float) -> list[float]:
    """
    Pitch shift by reading the source at a different rate.

    Length changes with pitch, which is correct here: a smaller chip really is
    both brighter and shorter. Linear interpolation is plenty for a transient
    this short, and it keeps the script dependency free.
    """
    out_len = max(1, int(len(samples) / ratio))
    out = []
    for i in range(out_len):
        pos = i * ratio
        left = int(pos)
        frac = pos - left
        a = samples[left] if left < len(samples) else 0.0
        b = samples[left + 1] if left + 1 < len(samples) else 0.0
        out.append(a + (b - a) * frac)
    return out


def low_pass(samples: list[float], cutoff_hz: float) -> list[float]:
    """
    One pole low pass.

    Gentle on purpose. The attack is what makes a chip sound like it was put
    down hard, so the aim is to take the glassy top off, not to muffle it.
    """
    import math

    dt = 1.0 / RATE
    rc = 1.0 / (2 * math.pi * cutoff_hz)
    alpha = dt / (rc + dt)
    out = []
    prev = 0.0
    for s in samples:
        prev = prev + alpha * (s - prev)
        out.append(prev)
    return out


def build(hits: list[tuple[int, float, float]], cutoff: float, peak: float) -> list[float]:
    """
    Lay the source hit down several times.

    Each entry is an onset in milliseconds, a pitch ratio and a gain. Above 1.0
    the pitch ratio means a smaller, brighter chip; below means a bigger one.
    """
    source = read_wav(SOURCE)
    voices = [(onset, resample(source, ratio), gain) for onset, ratio, gain in hits]
    length = max(int(onset * RATE / 1000) + len(voice) for onset, voice, _ in voices)
    mixed = [0.0] * length
    for onset, voice, gain in voices:
        start = int(onset * RATE / 1000)
        for i, s in enumerate(voice):
            mixed[start + i] += s * gain
    mixed = low_pass(mixed, cutoff)
    loudest = max(abs(s) for s in mixed) or 1.0
    return [s * (peak / loudest) for s in mixed]


"""
A call is one small push of chips forward: three hits, close together.

A raise is a bigger handful, so it gets more hits over a longer window and
reaches lower in pitch, because more chips means more mass. Both stay short:
these play on every betting action and a long cue would be in the way.
"""
CALL_HITS = [(0, 1.00, 0.95), (23, 1.18, 0.55), (58, 0.92, 0.42)]
RAISE_HITS = [
    (0, 0.94, 0.95),
    (19, 1.14, 0.62),
    (47, 1.02, 0.78),
    (86, 0.88, 0.70),
    (119, 1.22, 0.48),
    (162, 0.97, 0.55),
]

# Clay chips sit far lower than the 6kHz the raw transient measured at. These
# cutoffs were chosen by measuring the result, not by ear alone.
CALL_CUTOFF = 2100
RAISE_CUTOFF = 1850

# Everything else in the app peaks between 0.16 and 0.39, so the betting cues
# were roughly three times louder than the table around them.
CALL_PEAK = 0.42
RAISE_PEAK = 0.46


# The knock is the right recording and the right sound, it was just the
# loudest thing on the table by a wide margin, which reads as harshness rather
# than as wood. Level only: the character is left exactly as recorded.
CHECK_PEAK = 0.55


def level_check() -> None:
    samples = read_wav(SOUNDS / "check.wav")
    loudest = max(abs(s) for s in samples) or 1.0
    write_wav(SOUNDS / "check.wav", [s * (CHECK_PEAK / loudest) for s in samples])


def main() -> None:
    write_wav(SOUNDS / "chipCall.wav", build(CALL_HITS, CALL_CUTOFF, CALL_PEAK))
    write_wav(SOUNDS / "chipRaise.wav", build(RAISE_HITS, RAISE_CUTOFF, RAISE_PEAK))
    # Normalising to an absolute peak, so running this twice is a no-op.
    level_check()
    print("wrote chipCall.wav, chipRaise.wav and levelled check.wav")


if __name__ == "__main__":
    main()
