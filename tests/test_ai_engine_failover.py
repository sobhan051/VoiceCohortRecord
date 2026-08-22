"""Tests for model-level failover in ai_engine._run_with_failover.

Asserts: (1) when the primary model returns 503 "high demand" on every key,
the call retries on the next model in FALLBACK_MODELS and succeeds;
(2) quota exhaustion (429) on every key raises without switching models.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from google.genai import errors  # noqa: E402

import app.services.ai_engine as ai  # noqa: E402

PRIMARY = "gemini-3.5-flash"
FALLBACK = "gemini-2.5-flash"


class _FakeModels:
    def __init__(self, failing_models):
        self.failing_models = set(failing_models)
        self.calls = []

    def generate_content(self, model, **kwargs):
        self.calls.append(model)
        if model in self.failing_models:
            raise errors.APIError(
                503, {"error": {"code": 503, "message": "high demand", "status": "UNAVAILABLE"}}
            )
        return type("R", (), {"text": "[]"})()


class _FakeClient:
    def __init__(self, models):
        self.models = models


@pytest.fixture
def _fast(monkeypatch):
    monkeypatch.setattr(ai.config, "get_api_keys", lambda: ["k0", "k1"])
    monkeypatch.setattr(ai.config, "GENAI_RETRY_BACKOFF_SECONDS", 0.0)
    monkeypatch.setattr(ai.config, "GENAI_OVERLOAD_RETRIES", 1)
    monkeypatch.setattr(ai, "_build_client", lambda api_key=None: None)


def test_overload_switches_model(_fast, monkeypatch):
    fake = _FakeModels([PRIMARY])
    monkeypatch.setattr(ai.config, "FALLBACK_MODELS", [FALLBACK])
    seen = []
    result = ai._run_with_failover(lambda client, model: (seen.append(model), fake.generate_content(model))[1], PRIMARY)
    assert result.text == "[]"
    assert set(seen) == {PRIMARY, FALLBACK}


def test_quota_does_not_switch_model(_fast, monkeypatch):
    def boom(client, model):
        raise errors.APIError(429, {"error": {"code": 429, "message": "quota", "status": "RESOURCE_EXHAUSTED"}})

    with pytest.raises(errors.APIError) as exc:
        ai._run_with_failover(boom, PRIMARY)
    assert exc.value.code == 429
