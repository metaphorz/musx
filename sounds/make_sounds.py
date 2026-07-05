#!/usr/bin/env python
"""Generate a small library of characterful source sounds for MusX's sndfile~ node.

These are deliberately "concrète" raw materials — a bell, a vowel, a pluck, filtered
noise, scattered glass pings, and an evolving drone — good fodder for the CDP-style
resonator / dub / granular patches. Mono, 44.1 kHz, 16-bit WAV.

Run:  source venv/bin/activate && python sounds/make_sounds.py
Writes sounds/*.wav next to this script.
"""
import os
import wave
import numpy as np

SR = 44100
HERE = os.path.dirname(__file__)
rng = np.random.default_rng(7)


def write_wav(name, y):
    y = np.asarray(y, dtype=np.float64)
    # short fades to kill clicks, then normalise to -1 dBFS
    fade = int(0.005 * SR)
    env = np.ones(len(y))
    env[:fade] = np.linspace(0, 1, fade)
    env[-fade:] = np.linspace(1, 0, fade)
    y *= env
    peak = np.max(np.abs(y)) or 1.0
    y = (y / peak) * 0.89
    data = (np.clip(y, -1, 1) * 32767).astype("<i2").tobytes()
    path = os.path.join(HERE, name)  # name may include a subfolder (e.g. "tonal/bell.wav")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data)
    print(f"wrote {name}  ({len(y)/SR:.1f}s)")


def t(dur):
    return np.linspace(0, dur, int(dur * SR), endpoint=False)


def bell(dur=3.0, f0=220.0):
    """Inharmonic struck bell — classic tuned-percussion partials with fast/slow decays."""
    x = t(dur)
    ratios = [0.56, 1.0, 1.49, 2.0, 2.76, 3.9, 5.4]
    amps = [0.6, 1.0, 0.5, 0.55, 0.35, 0.25, 0.18]
    decays = [3.0, 2.6, 2.2, 1.8, 1.4, 1.0, 0.7]
    y = np.zeros_like(x)
    for r, a, d in zip(ratios, amps, decays):
        y += a * np.exp(-x * (1.0 / d) * 3) * np.sin(2 * np.pi * f0 * r * x)
    return y


def vowel_ah(dur=2.6, f0=130.0):
    """Buzzy glottal tone shaped by 'ah' formants (additive, formant-weighted harmonics)."""
    x = t(dur)
    formants = [(730, 90, 1.0), (1090, 110, 0.5), (2440, 160, 0.28), (3400, 220, 0.12)]
    y = np.zeros_like(x)
    h = 1
    while f0 * h < SR / 2:
        fh = f0 * h
        gain = 0.0
        for fc, bw, fa in formants:
            gain += fa / (1.0 + ((fh - fc) / bw) ** 2)  # simple resonance envelope
        y += (gain / h) * np.sin(2 * np.pi * fh * x + rng.uniform(0, 2 * np.pi))
        h += 1
    vib = 1.0 + 0.004 * np.sin(2 * np.pi * 5.5 * x)  # gentle vibrato via slow AM
    return y * vib


def pluck(dur=2.2, freq=196.0):
    """Karplus-Strong plucked string."""
    n = int(SR / freq)
    buf = rng.uniform(-1, 1, n)
    total = int(dur * SR)
    out = np.zeros(total)
    idx = 0
    for i in range(total):
        out[i] = buf[idx]
        nxt = (idx + 1) % n
        buf[idx] = 0.5 * (buf[idx] + buf[nxt]) * 0.996  # average + slight loss
        idx = nxt
    return out


def noise_sweep(dur=3.0):
    """White noise through a one-pole lowpass whose cutoff sweeps up then down (a whoosh)."""
    n = int(dur * SR)
    x = rng.uniform(-1, 1, n)
    # sweep alpha (smoothing) with a raised-cosine over time
    phase = (1 - np.cos(2 * np.pi * np.linspace(0, 1, n))) * 0.5  # 0->1->0
    alpha = 0.0009 + phase * 0.35
    y = np.zeros(n)
    prev = 0.0
    for i in range(n):
        prev = prev + alpha[i] * (x[i] - prev)
        y[i] = prev
    return y * (0.4 + 0.6 * phase)  # a little amplitude shaping


def glass_hits(dur=3.5):
    """Several short inharmonic pings scattered in time — granular/rhythmic fodder."""
    n = int(dur * SR)
    y = np.zeros(n)
    times = np.sort(rng.uniform(0.05, dur - 0.4, 9))
    for ts in times:
        f0 = rng.uniform(600, 2600)
        d = rng.uniform(0.12, 0.4)
        seg = bell(d, f0)
        s = int(ts * SR)
        e = min(n, s + len(seg))
        y[s:e] += seg[: e - s] * rng.uniform(0.5, 1.0)
    return y


def drone(dur=5.0, base=98.0):
    """Evolving detuned drone with slow beating — sustained looping material."""
    x = t(dur)
    y = np.zeros_like(x)
    for mult in (1.0, 1.5, 2.0, 3.0):
        for det in (-0.4, 0.0, 0.5):
            f = base * mult + det
            lfo = 0.5 + 0.5 * np.sin(2 * np.pi * rng.uniform(0.05, 0.18) * x + rng.uniform(0, 6))
            y += (lfo / mult) * np.sin(2 * np.pi * f * x + rng.uniform(0, 6))
    return y


if __name__ == "__main__":
    # subfolder = group name shown in the sndfile~/grain~ dropdown
    write_wav("tonal/bell.wav", bell())
    write_wav("tonal/pluck.wav", pluck())
    write_wav("tonal/drone.wav", drone())
    write_wav("vocal/voice-ah.wav", vowel_ah())
    write_wav("texture/noise-sweep.wav", noise_sweep())
    write_wav("texture/glass-hits.wav", glass_hits())
    print("done")
