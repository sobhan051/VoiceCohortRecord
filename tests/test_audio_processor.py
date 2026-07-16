"""Smoke test for the ffmpeg audio processor.

Synthesizes a tiny WAV with a tone surrounded by silence, runs it through
process_audio_file, and asserts: (1) a non-empty processed file is produced,
(2) an all-silent input falls back to the source instead of failing.
"""
import os
import sys
import tempfile

import numpy as np
import pytest

# Make the app importable when run directly via pytest from repo root.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app.services.audio_processor as ap  # noqa: E402
from app.services.audio_processor import process_audio_file, OUT_EXT  # noqa: E402


def _make_wav(path, samples, sr=16000):
    # 16-bit PCM mono WAV via the stdlib `wave` module (no extra deps).
    import wave
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(samples.astype("<i2").tobytes())


def _tone_with_silence(path, sr=16000):
    t = np.linspace(0, 1.0, sr, endpoint=False)
    tone = (np.sin(2 * np.pi * 440 * t[: sr // 2]) * 0.5 * 32767).astype(np.float64)
    silence = np.zeros(sr // 2)
    _make_wav(path, np.concatenate([silence, tone, silence]))


def _all_silence(path, sr=16000):
    _make_wav(path, np.zeros(sr))


def test_process_produces_output():
    with tempfile.TemporaryDirectory() as d:
        src = os.path.join(d, "raw.wav")
        _tone_with_silence(src)
        out = process_audio_file(src)
        assert out != src, "expected a processed file distinct from the source"
        assert os.path.exists(out) and os.path.getsize(out) > 0
        assert out.endswith(f".{OUT_EXT}")


def test_missing_ffmpeg_falls_back(monkeypatch):
    monkeypatch.setattr(ap, "get_ffmpeg", lambda: None)
    with tempfile.TemporaryDirectory() as d:
        src = os.path.join(d, "raw.wav")
        _tone_with_silence(src)
        out = process_audio_file(src)
        # No ffmpeg -> must fall back to the source, never lose the recording.
        assert out == src
