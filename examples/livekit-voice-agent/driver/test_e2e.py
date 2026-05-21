"""End-to-end test for the LiveKit voice-agent example.

Drives one Replay through ``xray.run`` against the compose stack
(LiveKit + xray + agent). Verifies the full wire:

- ``RunResult.status == "completed"`` (SDK-side outcome).
- Server's final ``lifecycle_state == "completed"`` (after VAD/analyze).
- Mixdown WAV uploaded (``audio_path != null``).
- At least one OTLP span landed at the receiver, proving baggage
  propagation worked end-to-end from JWT attribute → agent-side OTEL →
  OTLP/JSON exporter → xray's ``POST /v1/otlp/v1/traces`` route.
- Server-derived ``turns`` and ``speech_segments`` are populated
  (proves the bunqueue analyze-replay worker ran VAD on the upload).
- Per-turn assertion: agent transcript is non-empty (the agent emits
  via ``rtc.Transcription`` republished by the example agent — see
  the ``conversation_item_added`` bridge in ``agent/main.py``).
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path

import httpx
import pytest

from xray import Conversation, Turn, run
from xray.conversation import RecordedAudio
from xray.runtime.livekit import LiveKitRuntime

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"
USER_TURN_WAV = FIXTURES / "user_turn_1.wav"


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        pytest.fail(f"{name} must be set in the driver container's env")
    return value


@pytest.mark.asyncio
async def test_e2e_voice_agent_replay() -> None:
    assert USER_TURN_WAV.exists(), f"missing fixture: {USER_TURN_WAV}"

    xray_url = _require_env("XRAY_URL")
    livekit_url = _require_env("LIVEKIT_URL")
    livekit_key = _require_env("LIVEKIT_API_KEY")
    livekit_secret = _require_env("LIVEKIT_API_SECRET")

    room_name = f"example-{uuid.uuid4().hex[:8]}"
    runtime = LiveKitRuntime(
        url=livekit_url,
        api_key=livekit_key,
        api_secret=livekit_secret,
        room=room_name,
        agent_join_timeout_s=30.0,
        agent_turn_timeout_s=30.0,
    )

    conv = Conversation(
        name="example/livekit-voice-agent/quickstart",
        turns=[
            Turn.agent(
                key="a-greet",
                assertion=lambda r: len(r.transcript) > 5,
                assertion_name="agent_greeted",
            ),
            Turn.user(
                "Hello, can you tell me what year it is?",
                key="u-ask",
                audio=RecordedAudio(path=str(USER_TURN_WAV)),
            ),
            Turn.agent(
                key="a-answer",
                assertion=lambda r: len(r.transcript) > 5,
                assertion_name="agent_answered",
            ),
        ],
    )

    result = await run(conversation=conv, runtime=runtime, xray_url=xray_url)

    assert result.status == "completed", f"replay status={result.status} result={result}"
    for assertion in result.assertions:
        assert assertion.status == "passed", (
            f"assertion {assertion.name!r} did not pass: {assertion}"
        )

    async with httpx.AsyncClient(base_url=xray_url, timeout=10.0) as client:
        response = await client.get(f"/v1/replays/{result.id}")
        response.raise_for_status()
        replay = response.json()

    assert replay["lifecycle_state"] == "completed", replay
    assert replay["audio_path"] is not None, "mixdown WAV was not uploaded"
    assert len(replay["spans"]) > 0, "no OTLP spans landed at the receiver"
    assert len(replay["turns"]) > 0, (
        f"server-derived turns missing — VAD didn't find any speech: {replay}"
    )
    assert len(replay["speech_segments"]) > 0, (
        f"speech_segments missing — VAD couldn't segment the mixdown: {replay}"
    )

    # The example agent emits exactly one span per recognized vocabulary,
    # to prove all three are wired:
    # (a) xray   → `xray.stage.tts`
    # (b) langfuse → `example_langfuse_step` (via Langfuse `@observe`)
    # (c) gen_ai → `execute_tool` (via `xray_session.record_tool_call(...)`)
    #              which also extracts into a `tool_calls` row.
    spans_by_vocab: dict[str, set[str]] = {}
    for s in replay["spans"]:
        spans_by_vocab.setdefault(s["vocabulary"], set()).add(s["name"])

    assert "xray.stage.tts" in spans_by_vocab.get("xray", set()), (
        f"`xray.stage.tts` span did not land: spans_by_vocab={spans_by_vocab}"
    )
    assert "example_langfuse_step" in spans_by_vocab.get("langfuse", set()), (
        f"Langfuse `@observe` span did not land: spans_by_vocab={spans_by_vocab}"
    )
    tool_names = {t["name"] for t in replay["tool_calls"]}
    assert "get_current_year" in tool_names, (
        f"gen_ai `execute_tool` span did not extract into tool_calls: "
        f"{replay['tool_calls']}"
    )
