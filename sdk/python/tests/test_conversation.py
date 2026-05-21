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


def test_conversation_hash_stable_across_recorded_audio_path(tmp_path: Path):
    """Same bytes, different filesystem paths ⇒ same hash. Locks in the
    rule that `path` does NOT ride the wire — otherwise the same checked-in
    spec would fork conversations across developers' boxes."""
    bytes_ = b"\x00\x01\x02\x03"
    wav1 = tmp_path / "alice" / "a.wav"
    wav1.parent.mkdir()
    wav1.write_bytes(bytes_)
    wav2 = tmp_path / "bob" / "b.wav"
    wav2.parent.mkdir()
    wav2.write_bytes(bytes_)

    a = Conversation(
        name="x",
        turns=[Turn.user("hi", key="u0", audio=RecordedAudio(path=str(wav1)))],
    )
    b = Conversation(
        name="x",
        turns=[Turn.user("hi", key="u0", audio=RecordedAudio(path=str(wav2)))],
    )
    assert a.hash == b.hash


def test_conversation_hash_changes_with_tts_voice_id():
    a = Conversation(name="x", turns=[Turn.user("hi", key="u0", audio=TtsAudio(voice_id="alloy"))])
    b = Conversation(name="x", turns=[Turn.user("hi", key="u0", audio=TtsAudio(voice_id="nova"))])
    assert a.hash != b.hash


def test_canonical_turns_json_rejects_numeric_values():
    """`json.dumps` and `JSON.stringify` disagree on numeric formatting
    (`1.0` ↔ `"1.0"` vs `"1"`, large ints, `-0`). The canonical encoder
    rejects numbers on both sides so the hash stays bit-identical."""
    from xray.conversation import _canonical_turns_json

    with pytest.raises(TypeError, match="Cannot canonicalize a number"):
        _canonical_turns_json([{"role": "user", "score": 1}])  # type: ignore[list-item]
    with pytest.raises(TypeError, match="Cannot canonicalize a number"):
        _canonical_turns_json([{"role": "user", "score": 1.5}])  # type: ignore[list-item]
    with pytest.raises(TypeError, match="Cannot canonicalize a number"):
        _canonical_turns_json([{"role": "user", "nested": {"deep": [{"x": 0}]}}])  # type: ignore[list-item]


def test_canonical_turns_json_accepts_booleans():
    """Booleans roundtrip identically (`true`/`false`) across encoders,
    so they don't trigger the numeric-rejection guard."""
    from xray.conversation import _canonical_turns_json

    out = _canonical_turns_json([{"role": "user", "flag": True}])  # type: ignore[list-item]
    assert "true" in out


def test_canonical_turns_json_accepts_digits_inside_strings():
    """Numbers as text inside a string MUST be allowed — only unquoted
    numeric tokens are forbidden. Regression guard for the token scanner."""
    from xray.conversation import _canonical_turns_json

    out = _canonical_turns_json([{"role": "user", "text": "I owe you $42.50"}])
    assert "$42.50" in out


def test_empty_conversation_rejected():
    with pytest.raises(ValueError):
        Conversation(name="x", turns=[])


def test_empty_name_rejected():
    with pytest.raises(ValueError):
        Conversation(name="", turns=[Turn.user("hi")])


def test_conversation_hash_matches_parity_fixture():
    """Both Python SDK and TS server must produce the same canonical JSON
    and SHA-256 for every case in the parity vector. If either side drifts
    on any case (ASCII / unicode / control chars / U+2028 / DEL / empty /
    audio refs), this fails — single source of truth for the wire contract.
    """
    import json as _json

    from xray.conversation import _canonical_turns_json, _hash_turns_wire

    fixture_path = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "hash-parity.json"
    with fixture_path.open("r", encoding="utf-8") as f:
        fixture = _json.load(f)
    assert len(fixture["cases"]) > 1, "parity fixture must cover more than one case"
    for case in fixture["cases"]:
        name = case["name"]
        assert _canonical_turns_json(case["turns_wire"]) == case["canonical_json"], (
            f"case {name}: canonical_json drift"
        )
        assert _hash_turns_wire(case["turns_wire"]) == case["expected_hash"], (
            f"case {name}: expected_hash drift"
        )


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
