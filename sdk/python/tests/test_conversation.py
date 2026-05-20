from __future__ import annotations

from pathlib import Path

import pytest

from xray import Conversation, Turn
from xray.conversation import RecordedAudio, TtsAudio


def test_conversation_hash_stable_for_same_turns():
    a = Conversation(name="x", turns=[Turn.user("hi", key="u0"), Turn.agent(key="a0")])
    b = Conversation(name="x", turns=[Turn.user("hi", key="u0"), Turn.agent(key="a0")])
    assert a.hash == b.hash
    assert len(a.hash) == 64


def test_conversation_hash_changes_with_turn_text():
    a = Conversation(name="x", turns=[Turn.user("hi", key="u0"), Turn.agent(key="a0")])
    b = Conversation(name="x", turns=[Turn.user("hello", key="u0"), Turn.agent(key="a0")])
    assert a.hash != b.hash


def test_conversation_hash_stable_under_name_change():
    """Name is a mutable display label — renaming MUST NOT fork identity."""
    a = Conversation(name="first", turns=[Turn.user("hi", key="u0"), Turn.agent(key="a0")])
    b = Conversation(name="second", turns=[Turn.user("hi", key="u0"), Turn.agent(key="a0")])
    assert a.hash == b.hash


def test_conversation_hash_omits_judge_callable():
    """Judge is deprecated and ignored; including or omitting it must not change identity."""
    a = Conversation(name="x", turns=[Turn.user("hi", key="u0")])
    b = Conversation(name="x", turns=[Turn.user("hi", key="u0")], judge=lambda _: None)  # type: ignore[arg-type]
    assert a.hash == b.hash


def test_conversation_hash_changes_with_recorded_audio_bytes(tmp_path: Path):
    """The whole point of the new model: editing the WAV ⇒ new hash."""
    wav1 = tmp_path / "a.wav"
    wav1.write_bytes(b"\x00\x01\x02\x03")
    wav2 = tmp_path / "b.wav"
    wav2.write_bytes(b"\x00\x01\x02\x04")

    a = Conversation(
        name="x",
        turns=[Turn.user("hi", key="u0", audio=RecordedAudio(path=str(wav1)))],
    )
    b = Conversation(
        name="x",
        turns=[Turn.user("hi", key="u0", audio=RecordedAudio(path=str(wav2)))],
    )
    assert a.hash != b.hash


def test_conversation_hash_changes_with_tts_voice_id():
    a = Conversation(name="x", turns=[Turn.user("hi", key="u0", audio=TtsAudio(voice_id="alloy"))])
    b = Conversation(name="x", turns=[Turn.user("hi", key="u0", audio=TtsAudio(voice_id="nova"))])
    assert a.hash != b.hash


def test_empty_conversation_rejected():
    with pytest.raises(ValueError):
        Conversation(name="x", turns=[])


def test_empty_name_rejected():
    with pytest.raises(ValueError):
        Conversation(name="", turns=[Turn.user("hi")])


def test_conversation_hash_matches_parity_fixture():
    """Both Python SDK and TS server must produce the same hash for the
    canonical fixture. If either side drifts, this fails — single source
    of truth for the wire contract."""
    import json as _json

    fixture_path = (
        Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "hash-parity.json"
    )
    with fixture_path.open("r", encoding="utf-8") as f:
        fixture = _json.load(f)
    turns = [
        Turn(
            role=t["role"],
            text=t.get("text"),
            key=t.get("key"),
        )
        for t in fixture["turns"]
    ]
    conv = Conversation(name="parity", turns=turns)
    assert conv.hash == fixture["expected_hash"]


def test_replay_create_payload_matches_wire_shape():
    c = Conversation(
        name="My conv",
        turns=[Turn.user("hi there", key="u0"), Turn.agent(key="a0")],
    )
    payload = c.to_replay_create_payload()
    assert payload["name"] == "My conv"
    assert payload["modality"] == "voice"
    assert payload["turns"] == [
        {"role": "user", "text": "hi there", "key": "u0"},
        {"role": "agent", "key": "a0"},
    ]
    # SDK does NOT send the hash — server recomputes (trust boundary).
    assert "hash" not in payload
