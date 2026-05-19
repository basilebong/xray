"""Typed errors for the xray SDK.

Every error carries a ``failure_reason`` that maps onto the server's
``REPLAY_FAILURE_REASONS`` picklist (see ``src/server/store/types.ts``).
The orchestrator reads ``failure_reason`` directly from typed exceptions
instead of string-matching on ``str(e)``.

Callers narrow via ``isinstance`` and read the typed structured fields —
no message parsing, ever.
"""

from __future__ import annotations

from typing import Literal

# Mirrors REPLAY_FAILURE_REASONS in src/server/store/types.ts. Kept as a
# Literal alias so a typo on construction is a static error, not a runtime
# 422 from the PATCH.
FailureReason = Literal[
    "agent_not_joined",
    "runtime_error",
    "audio_missing",
    "sdk_aborted",
    "other",
]


class XrayError(Exception):
    """Base class for every error raised by the SDK."""

    failure_reason: FailureReason = "runtime_error"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        # __init__ sets type for IDE-friendliness; subclasses overwrite below.
        self.name = type(self).__name__


class RuntimeBindError(XrayError):
    """A runtime was asked to ``run`` before ``bind(replay_id=...)``."""

    failure_reason: FailureReason = "sdk_aborted"


class AgentNotJoinedError(XrayError):
    """The agent participant never joined the LiveKit room in time."""

    failure_reason: FailureReason = "agent_not_joined"

    def __init__(self, room: str, timeout_s: float) -> None:
        super().__init__(
            f"agent participant did not join room {room!r} within {timeout_s}s"
        )
        self.room = room
        self.timeout_s = timeout_s


class AudioMissingError(XrayError):
    """A user turn requires audio but none is available.

    Raised when ``Turn.audio.kind == 'recorded'`` and the file is missing,
    or when ``kind == 'tts'`` and no OpenAI API key is configured.
    """

    failure_reason: FailureReason = "audio_missing"

    def __init__(self, message: str, *, turn_idx: int | None = None) -> None:
        super().__init__(message)
        self.turn_idx = turn_idx


class AudioTooLargeError(XrayError):
    """Mixdown WAV exceeds the server's per-upload cap."""

    failure_reason: FailureReason = "runtime_error"

    def __init__(self, *, byte_size: int, max_bytes: int) -> None:
        super().__init__(
            f"replay mixdown is {byte_size} bytes; server cap is {max_bytes} bytes"
        )
        self.byte_size = byte_size
        self.max_bytes = max_bytes


class MixdownError(XrayError):
    """Encoding the per-turn PCM streams into a single WAV failed."""

    failure_reason: FailureReason = "runtime_error"


class LiveKitDependencyError(XrayError):
    """The optional ``[livekit]`` extra is not installed."""

    failure_reason: FailureReason = "runtime_error"


__all__ = [
    "AgentNotJoinedError",
    "AudioMissingError",
    "AudioTooLargeError",
    "FailureReason",
    "LiveKitDependencyError",
    "MixdownError",
    "RuntimeBindError",
    "XrayError",
]
