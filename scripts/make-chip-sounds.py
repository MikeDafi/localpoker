#!/usr/bin/env python3
"""
Build the table action cues from deterministic ingredients.

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
attack. This rebuilds the betting cues to be exactly that:

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
script only re-edits the already vendored CC0 chip recording and synthesises the
check knock locally; it downloads nothing.
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


# Toss is the existing liked cue: one small handful, then a larger handful for a raise.
TOSS_CALL_HITS = [(0, 1.00, 0.95), (23, 1.18, 0.55), (58, 0.92, 0.42)]
TOSS_RAISE_HITS = [
    (0, 0.94, 0.95),
    (19, 1.14, 0.62),
    (47, 1.02, 0.78),
    (86, 0.88, 0.70),
    (119, 1.22, 0.48),
    (162, 0.97, 0.55),
]

# Splash has more chips and a longer scatter, with lower filtering so it reads as cloth.
SPLASH_CALL_HITS = [
    (0, 0.86, 0.88),
    (17, 1.28, 0.46),
    (45, 0.98, 0.68),
    (83, 1.36, 0.32),
    (139, 0.78, 0.46),
    (214, 1.12, 0.28),
]
SPLASH_RAISE_HITS = [
    (0, 0.80, 0.95),
    (15, 1.31, 0.52),
    (39, 0.91, 0.68),
    (70, 1.20, 0.45),
    (108, 0.84, 0.58),
    (153, 1.39, 0.31),
    (205, 0.97, 0.46),
    (267, 0.73, 0.36),
    (329, 1.14, 0.25),
]

# Riffle is a compact stack landing: tighter timing, less pitch spread and a crisp attack.
RIFFLE_CALL_HITS = [(0, 1.04, 0.90), (18, 0.99, 0.64), (36, 1.07, 0.56), (55, 0.96, 0.42)]
RIFFLE_RAISE_HITS = [
    (0, 0.98, 0.92),
    (16, 1.05, 0.72),
    (32, 1.00, 0.66),
    (49, 1.08, 0.58),
    (67, 0.95, 0.46),
    (88, 1.03, 0.38),
]

STYLE_SPECS = {
    "toss": {
        "call": (TOSS_CALL_HITS, 2100, 0.42),
        "raise": (TOSS_RAISE_HITS, 1850, 0.46),
    },
    "splash": {
        "call": (SPLASH_CALL_HITS, 1700, 0.38),
        "raise": (SPLASH_RAISE_HITS, 1550, 0.39),
    },
    "riffle": {
        "call": (RIFFLE_CALL_HITS, 2550, 0.34),
        "raise": (RIFFLE_RAISE_HITS, 2450, 0.37),
    },
}

# The old check recording had a persistent low partial, so do not use a short
# resonator here. A filtered noise burst gives a hard rap without giving the
# ear a note to follow.
CHECK_PEAK = 0.40
CHECK_RAPS = [(0, 1.0, 17), (126, 0.86, 41)]


def high_pass(samples: list[float], cutoff_hz: float) -> list[float]:
    import math

    dt = 1.0 / RATE
    rc = 1.0 / (2 * math.pi * cutoff_hz)
    alpha = rc / (rc + dt)
    out = []
    prev_y = 0.0
    prev_x = 0.0
    for s in samples:
        y = alpha * (prev_y + s - prev_x)
        out.append(y)
        prev_y = y
        prev_x = s
    return out


def stable_noise(index: int, salt: int) -> float:
    n = (index * 1103515245 + 12345 + salt * 2654435761) & 0xFFFFFFFF
    n ^= n >> 16
    n = (n * 2246822519) & 0xFFFFFFFF
    n ^= n >> 13
    return (n / 2147483647.5) - 1.0


def knock_hit(duration_ms: int, salt: int) -> list[float]:
    import math

    length = int(RATE * duration_ms / 1000)
    raw_attack = [stable_noise(i, salt) for i in range(length)]
    raw_body = [stable_noise(i, salt + 101) for i in range(length)]
    attack = low_pass(high_pass(raw_attack, 260), 3200)
    body = low_pass(high_pass(raw_body, 180), 1800)
    attack_peak = max(abs(s) for s in attack) or 1.0
    body_peak = max(abs(s) for s in body) or 1.0
    attack = [s / attack_peak for s in attack]
    body = [s / body_peak for s in body]

    out = []
    for i in range(length):
        t = i / RATE
        ramp = min(1.0, i / max(1, int(RATE * 0.00045)))
        fast = math.exp(-t / 0.003)
        wood = math.exp(-t / 0.018)
        pulse = 0.0
        if i < 16:
            pulse_shape = [0.90, -0.72, 0.48, -0.31, 0.19, -0.11, 0.07, -0.04]
            pulse = pulse_shape[i] if i < len(pulse_shape) else 0.0
        sample = 0.22 * attack[i] * fast + 1.0 * body[i] * wood + pulse * fast
        out.append(ramp * sample)
    return low_pass(low_pass(out, 2600), 2600)


def build_check() -> list[float]:
    length = int(RATE * 0.225)
    mixed = [0.0] * length
    for onset_ms, gain, salt in CHECK_RAPS:
        hit = knock_hit(66, salt)
        start = int(onset_ms * RATE / 1000)
        for i, s in enumerate(hit):
            if start + i < len(mixed):
                mixed[start + i] += s * gain

    fade = int(RATE * 0.006)
    for i in range(1, fade + 1):
        mixed[-i] *= i / fade
    loudest = max(abs(s) for s in mixed) or 1.0
    return [s * (CHECK_PEAK / loudest) for s in mixed]


def chip_path(action: str, style: str) -> Path:
    stem = "chipCall" if action == "call" else "chipRaise"
    return SOUNDS / f"{stem}-{style}.wav"


def main() -> None:
    generated = {}
    for style, actions in STYLE_SPECS.items():
        for action, (hits, cutoff, peak) in actions.items():
            samples = build(hits, cutoff, peak)
            generated[(style, action)] = samples
            write_wav(chip_path(action, style), samples)

    write_wav(SOUNDS / "chipCall.wav", generated[("toss", "call")])
    write_wav(SOUNDS / "chipRaise.wav", generated[("toss", "raise")])
    write_wav(SOUNDS / "check.wav", build_check())
    print("wrote chipCall variants, chipRaise variants and check.wav")


if __name__ == "__main__":
    main()
