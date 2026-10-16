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
    mixed = low_pass(low_pass(mixed, cutoff), cutoff)
    loudest = max(abs(s) for s in mixed) or 1.0
    return [s * (peak / loudest) for s in mixed]


# Every hit is pitched well down from the recording. The source rings at about
# 5.3kHz, a small, thin click, and six of those 20 to 40ms apart is a 30Hz
# rhythm of a high note: what a player heard was a buzz, "like a fly", not
# money. Pitched to roughly 0.6 the ring sits near 3kHz, where clay chips
# actually clack, and each hit gets longer, the way a heavier chip is.
#
# The hits are also spaced like chips landing rather than like a rattle, 45ms
# and more apart and drifting wider as the pile settles, and there are fewer
# of them. Below about 40ms the ear stops hearing separate chips and hears a
# tone, which was the other half of the buzz.
TOSS_CALL_HITS = [(0, 0.62, 0.95), (58, 0.70, 0.55), (131, 0.58, 0.38)]
TOSS_RAISE_HITS = [
    (0, 0.60, 0.95),
    (52, 0.68, 0.70),
    (109, 0.57, 0.62),
    (178, 0.72, 0.45),
    (262, 0.63, 0.30),
]

# Splash has more chips and a longer scatter, with lower filtering so it reads as cloth.
SPLASH_CALL_HITS = [
    (0, 0.56, 0.88),
    (47, 0.71, 0.50),
    (103, 0.60, 0.62),
    (176, 0.75, 0.32),
    (262, 0.54, 0.26),
]
SPLASH_RAISE_HITS = [
    (0, 0.54, 0.95),
    (45, 0.72, 0.56),
    (98, 0.60, 0.68),
    (160, 0.76, 0.45),
    (231, 0.56, 0.50),
    (315, 0.70, 0.32),
    (410, 0.58, 0.22),
]

# Riffle is a compact stack landing: tighter timing, less pitch spread and a crisp attack.
RIFFLE_CALL_HITS = [(0, 0.68, 0.90), (44, 0.64, 0.62), (90, 0.70, 0.48)]
RIFFLE_RAISE_HITS = [
    (0, 0.66, 0.92),
    (42, 0.70, 0.70),
    (86, 0.63, 0.62),
    (133, 0.69, 0.50),
    (185, 0.65, 0.36),
]

STYLE_SPECS = {
    "toss": {
        "call": (TOSS_CALL_HITS, 3400, 0.42),
        "raise": (TOSS_RAISE_HITS, 3200, 0.46),
    },
    "splash": {
        "call": (SPLASH_CALL_HITS, 2800, 0.38),
        "raise": (SPLASH_RAISE_HITS, 2700, 0.40),
    },
    "riffle": {
        "call": (RIFFLE_CALL_HITS, 3800, 0.36),
        "raise": (RIFFLE_RAISE_HITS, 3600, 0.39),
    },
}

# The old check recording had a persistent low partial, so do not use a short
# resonator here. A filtered noise burst gives a hard rap without giving the
# ear a note to follow.
CHECK_PEAK = 0.40
# One rap, not two: a double knock read as the same cue playing twice.
CHECK_RAPS = [(0, 1.0, 17)]


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
    length = int(RATE * 0.1)
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
