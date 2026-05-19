"""OpenTelemetry decorators that propagate ``xray.replay.id`` from LiveKit
room metadata via OTEL baggage.

The dev's agent calls ``set_replay_context(...)`` once when joining the
room (with the values from ``LocalParticipant.metadata`` or the SDK's
helper) — every subsequent ``@stage(...)``-decorated call attaches the
context to its span, and any downstream ``gen_ai.*`` / ``langfuse.*``
spans the agent emits inherit it via baggage propagation.

``turn(idx, key)`` scopes the per-turn baggage (``xray.turn.idx``,
``xray.turn.key``) — spans emitted inside the scope get attributed to
that turn on the server side.
"""

from __future__ import annotations

import inspect
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from contextlib import asynccontextmanager, contextmanager
from functools import wraps
from typing import Any, Literal, ParamSpec, TypeVar

from opentelemetry import baggage, context, trace
from opentelemetry.trace import Span

P = ParamSpec("P")
R = TypeVar("R")

_tracer = trace.get_tracer("xray-py", "0.0.1")

XRAY_REPLAY_ID = "xray.replay.id"
XRAY_CONVERSATION_ID = "xray.conversation.id"
XRAY_CONVERSATION_VERSION = "xray.conversation.version"
XRAY_TURN_KEY = "xray.turn.key"
XRAY_TURN_IDX = "xray.turn.idx"
XRAY_MODALITY = "xray.modality"


def set_replay_context(
    replay_id: str,
    conversation_id: str,
    conversation_version: str,
    modality: Literal["voice"] = "voice",
) -> object:
    """Attach the replay's identity to the current OTEL context so every
    span emitted from now on (in this task / thread) inherits it.

    Returns a detach token. Pass it to :func:`detach` to undo.
    """
    ctx = context.get_current()
    ctx = baggage.set_baggage(XRAY_REPLAY_ID, replay_id, context=ctx)
    ctx = baggage.set_baggage(XRAY_CONVERSATION_ID, conversation_id, context=ctx)
    ctx = baggage.set_baggage(XRAY_CONVERSATION_VERSION, conversation_version, context=ctx)
    ctx = baggage.set_baggage(XRAY_MODALITY, modality, context=ctx)
    return context.attach(ctx)


def detach(token: object) -> None:
    context.detach(token)  # type-checked at call sites; OTEL types token loosely


@contextmanager
def replay_context(
    replay_id: str,
    conversation_id: str,
    conversation_version: str,
    modality: Literal["voice"] = "voice",
) -> Iterator[None]:
    """Scoped variant of ``set_replay_context``."""
    token = set_replay_context(replay_id, conversation_id, conversation_version, modality)
    try:
        yield
    finally:
        detach(token)


def _attach_turn_context(idx: int, key: str | None) -> object:
    ctx = context.get_current()
    ctx = baggage.set_baggage(XRAY_TURN_IDX, str(idx), context=ctx)
    if key is not None:
        ctx = baggage.set_baggage(XRAY_TURN_KEY, key, context=ctx)
    return context.attach(ctx)


@contextmanager
def turn(idx: int, key: str | None = None) -> Iterator[None]:
    """Scope ``xray.turn.idx`` (and optionally ``xray.turn.key``) baggage to
    a block. Every ``gen_ai.*`` / ``langfuse.*`` span emitted inside the
    block inherits the turn attribution via baggage propagation — the
    server's OTLP receiver folds that into ``turn_idx`` on
    ``model_usage`` / ``tool_calls`` rows.
    """
    token = _attach_turn_context(idx, key)
    try:
        yield
    finally:
        detach(token)


@asynccontextmanager
async def aturn(idx: int, key: str | None = None) -> AsyncIterator[None]:
    """Async variant of :func:`turn` — same semantics, usable from
    ``async with``."""
    token = _attach_turn_context(idx, key)
    try:
        yield
    finally:
        detach(token)


def _stamp_baggage(span: Span) -> None:
    """Lift current baggage onto the span as xray.* resource-style attrs."""
    for key in (
        XRAY_REPLAY_ID,
        XRAY_CONVERSATION_ID,
        XRAY_CONVERSATION_VERSION,
        XRAY_MODALITY,
        XRAY_TURN_IDX,
        XRAY_TURN_KEY,
    ):
        value = baggage.get_baggage(key)
        if value is not None:
            span.set_attribute(key, str(value))


def stage(name: Literal["stt", "tts"]) -> Callable[[Callable[P, R]], Callable[P, R]]:
    """Decorator for STT/TTS stage timing.

    Wraps the decorated function in a span named ``xray.stage.<name>`` and
    stamps the current baggage on it. Sync and async functions both work.
    """

    span_name = f"xray.stage.{name}"

    def decorator(fn: Callable[P, R]) -> Callable[P, R]:
        # OTEL's start_as_current_span defaults record_exception=True and
        # set_status_on_exception=True, so the context manager handles both
        # on its own as the exception unwinds — no broad except needed.
        if inspect.iscoroutinefunction(fn):
            async_fn: Callable[P, Awaitable[Any]] = fn

            @wraps(fn)
            async def async_wrapper(*args: P.args, **kwargs: P.kwargs) -> Any:
                with _tracer.start_as_current_span(span_name) as span:
                    _stamp_baggage(span)
                    return await async_fn(*args, **kwargs)

            return async_wrapper  # async/sync fan-out is statically opaque

        @wraps(fn)
        def sync_wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            with _tracer.start_as_current_span(span_name) as span:
                _stamp_baggage(span)
                return fn(*args, **kwargs)

        return sync_wrapper

    return decorator
