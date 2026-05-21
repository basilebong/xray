"""Minimal LiveKit Agents worker — Gemini Live (v2v).

xray integration is one line: ``async with xray.attach(ctx, ...)``.
Inside the block, OTEL baggage carries the replay scope and every
span the agent emits inherits ``xray.replay.id`` / ``xray.conversation.hash``
via the bundled :class:`XrayBaggageSpanProcessor`. The block force-flushes
the tracer provider on exit so spans land in xray before the worker
shuts down.

Reads:
- ``LIVEKIT_URL`` / ``LIVEKIT_API_KEY`` / ``LIVEKIT_API_SECRET`` — worker
  registration (LiveKit Agents convention).
- ``GEMINI_API_KEY`` or ``GOOGLE_API_KEY`` — passed to the Gemini Live
  realtime model. Never written into any image layer.
- ``XRAY_OTLP_ENDPOINT`` — where ``xray.attach`` ships OTLP/JSON.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time

import xray
from google.genai import types as genai_types
from langfuse import observe
from livekit import rtc
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.agents.llm import ChatMessage
from livekit.agents.voice.events import ConversationItemAddedEvent
from livekit.plugins import google
from opentelemetry import trace

logger = logging.getLogger("voice-agent")

# Plain OpenTelemetry tracer. `xray.attach` installs an OTLP/JSON exporter
# on the active tracer provider and lifts `xray.replay.id` onto every span
# via baggage, so spans emitted through THIS tracer (or via Langfuse's
# `@observe`, or via xray's session helpers) reach xray with no extra wiring.
_tracer = trace.get_tracer("example-voice-agent")


@observe(as_type="generation", name="example_langfuse_step")
def _langfuse_step(model: str) -> str:
    """Demonstrate xray's Langfuse vocabulary: the Langfuse Python SDK v3+
    `@observe` decorator emits OTel spans tagged with `langfuse.observation.*`
    attributes. xray's vocabulary registry recognizes them automatically and
    persists them as `langfuse` spans. `as_type="generation"` additionally
    extracts a `model_usage` row when token-count attributes are set."""
    return f"agent will use {model}"


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()
    async with xray.attach(ctx, service_name="example-voice-agent") as xray_session:
        session = AgentSession(
            llm=google.realtime.RealtimeModel(
                model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-native-audio-preview-12-2025"),
                voice="Puck",
                instructions=(
                    "You are a friendly voice assistant. Greet the caller, then "
                    "answer their question briefly in one or two sentences."
                ),
                # Tell Gemini Live to produce transcripts alongside audio. The
                # AgentSession's RoomIO forwards them to RTC by default — but
                # only when the model actually emits them, hence this config.
                output_audio_transcription=genai_types.AudioTranscriptionConfig(),
                input_audio_transcription=genai_types.AudioTranscriptionConfig(),
            ),
        )

        # Belt-and-braces transcript republishing. RoomIO's default forwarder
        # only fires reliably once an audio track is published + a track_sid
        # is bound — order-of-events with Gemini Live's first frame can race.
        # Republishing on `conversation_item_added` guarantees the SDK driver's
        # `transcription_received` listener sees one final segment per agent
        # message, which is the only signal it needs to fill `AgentResponse`.
        @session.on("conversation_item_added")
        def _on_item(event: ConversationItemAddedEvent) -> None:
            item = event.item
            if not isinstance(item, ChatMessage) or item.role != "assistant":
                return
            text = item.text_content
            if not text:
                return
            asyncio.create_task(_publish_agent_transcript(ctx.room, text))

        await session.start(agent=Agent(instructions=""), room=ctx.room)

        # Demonstrate ONE span per recognized vocabulary so all three end up
        # in the inspector's spans tab:
        model_id = os.environ.get(
            "GEMINI_MODEL", "gemini-2.5-flash-native-audio-preview-12-2025"
        )

        # (a) `xray.*` vocabulary — a raw OTel span using a name from the
        #     allowlist (see `src/server/otlp/vocabularies/xray.ts`). Wraps
        #     the greeting kickoff so the timing is meaningful.
        with _tracer.start_as_current_span("xray.stage.tts") as span:
            span.set_attribute("xray.stage.tts.provider", "gemini-live")
            span.set_attribute("xray.stage.tts.model", model_id)
            session.generate_reply(
                instructions="Greet the caller in one short sentence."
            )

        # (b) `langfuse.*` vocabulary — the Langfuse Python SDK's `@observe`
        #     decorator. See `_langfuse_step` at module level.
        _langfuse_step(model_id)

        # (c) `gen_ai.*` vocabulary — emit via the xray session helper, which
        #     produces an `execute_tool` span carrying OTel GenAI semconv
        #     attributes. xray extracts it into a `tool_calls` row in
        #     addition to landing as a raw span. Arguments are illustrative.
        if xray_session is not None:
            xray_session.record_tool_call(
                name="get_current_year",
                args_json="{}",
                result_json='{"year": 2026}',
                latency_ms=5,
            )

        # Hold the entrypoint open until the room disconnects so xray.attach's
        # force-flush has actual spans to flush. LiveKit fires "disconnected"
        # on ctx.room when the SDK driver leaves.
        disconnect = asyncio.Event()
        ctx.room.on("disconnected", lambda *_: disconnect.set())
        await disconnect.wait()


async def _publish_agent_transcript(room: rtc.Room, text: str) -> None:
    """Republish a completed agent message as an ``rtc.Transcription`` event
    on the agent's published audio track, so xray's SDK driver receives a
    ``transcription_received`` callback and fills in
    ``AgentResponse.transcript``."""
    publication = next(
        (p for p in room.local_participant.track_publications.values() if p.sid),
        None,
    )
    if publication is None or publication.sid is None:
        logger.warning("no published track; cannot forward transcript")
        return
    segment = rtc.TranscriptionSegment(
        id=f"agent-{int(time.time() * 1000)}",
        text=text,
        start_time=0,
        end_time=0,
        final=True,
        language="",
    )
    transcription = rtc.Transcription(
        participant_identity=room.local_participant.identity,
        track_sid=publication.sid,
        segments=[segment],
    )
    try:
        await room.local_participant.publish_transcription(transcription)
    except Exception:
        logger.exception("publish_transcription failed; continuing")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
