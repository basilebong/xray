# xray-py

Python SDK for [xray](https://github.com/xray-eval/xray) — replay/eval framework for LiveKit voice agents.

> **Alpha.** Wire and API surface can break between minor versions.

## Install

```bash
pip install xray-py[livekit]
```

The `[livekit]` extra pulls in the `livekit` Python client. Drop it if you implement your own runtime.

## Quickstart

```python
import os

from xray import Conversation, Turn, expect_agent_turn, run
from xray.conversation import AudioRef
from xray.runtime.livekit import LiveKitRuntime

conv = Conversation(
    id="booking-happy-path",
    turns=[
        Turn.user(
            "Hi, I'd like to book a table for two at 7pm.",
            key="u0",
            audio=AudioRef(kind="tts"),  # or kind="recorded", path="...wav"
        ),
        expect_agent_turn(
            key="a0",
            assertion=lambda agent: "confirmed" in agent.transcript.lower(),
        ),
    ],
)

runtime = LiveKitRuntime(
    url=os.environ["LIVEKIT_URL"],
    api_key=os.environ["LIVEKIT_API_KEY"],
    api_secret=os.environ["LIVEKIT_API_SECRET"],
    room="booking-test-room",
)

replay = run(
    conversation=conv,
    runtime=runtime,
    xray_url="http://localhost:8080",
    run_config={"model": "gpt-4o", "temperature": 0.5},
)
print(f"replay: http://localhost:8080/replays/{replay.id}")
```

The runtime produces **one stereo WAV per replay** (left = user, right = agent); `run(...)` uploads it to `POST /v1/replays/:id/audio`. The inspector slices it per-turn using the `replay_turns` timestamps.

When a user `Turn` uses `kind="tts"` (or has no `audio` + a text fallback), the runtime calls OpenAI's `/v1/audio/speech` directly using `OPENAI_API_KEY` from your environment — xray never sees the key — and caches the result at `~/.cache/xray-py/<conv_id>/<fingerprint>.wav` so re-runs reuse the bytes.

## Three modules

- `xray.conversation` — `Conversation`, `Turn`, `expect_agent_turn` test-definition primitives.
- `xray.trace` — `@xray.trace.stage("stt")` / `@xray.trace.stage("tts")` OpenTelemetry decorators that propagate `xray.replay.id` from LiveKit room metadata via OTEL baggage, plus `xray.trace.turn(idx, key)` (sync) / `aturn(idx, key)` (async) to scope per-turn baggage so `gen_ai.*` / Langfuse spans attribute to the right turn.
- `xray.runtime` — pluggable `Runtime` ABC; `xray.runtime.livekit.LiveKitRuntime` is the v1 implementation.

See `examples/booking_happy_path.py` for a full example.

## Environment

The LiveKit runtime reads:

| Var | Required? | Default | Purpose |
|---|---|---|---|
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | yes | — | LiveKit credentials |
| `OPENAI_API_KEY` | only for TTS turns | — | OpenAI key used directly — xray never holds it |
| `OPENAI_TTS_MODEL` | no | `gpt-4o-mini-tts` | TTS model |
| `OPENAI_TTS_VOICE` | no | `alloy` | Voice; per-turn `AudioRef.voice_id` overrides |

Recorded audio must be **48 kHz mono 16-bit WAV** (`ffmpeg -i in.wav -ar 48000 -ac 1 -sample_fmt s16 out.wav`).

## How it wires to xray

1. `run(...)` POSTs the Conversation to `POST /v1/conversations` (idempotent).
2. `run(...)` POSTs a Replay to `POST /v1/replays` and gets back a `replay_id`.
3. The runtime joins the LiveKit room with `replay_id` in room metadata.
4. The dev's agent reads metadata, propagates it via OTEL baggage on every span.
5. xray's OTLP receiver routes spans by `xray.replay.id` and persists what it recognizes (xray.*, OTel GenAI semconv, Langfuse).
6. `run(...)` uploads the mixdown WAV to `POST /v1/replays/:id/audio`.
7. `run(...)` evaluates assertions + judge and PATCHes the Replay row with the result.

See `docs/SDK.md` and `docs/WIRE.md` in the main repo for the contract.
