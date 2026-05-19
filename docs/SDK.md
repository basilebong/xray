# xray-py — SDK guide

The Python SDK has three pieces. Each one is independently usable; `xray.run(...)` composes all three for the common case.

```
xray.conversation   — test definitions (Conversation, Turn, expect_agent_turn)
xray.trace          — OpenTelemetry decorators + baggage helpers
xray.runtime        — pluggable runtime ABC
xray.runtime.livekit — v1 LiveKit implementation
xray.run            — orchestrator (creates Conversation + Replay, runs the
                      runtime, evaluates assertions/judge, PATCHes the row)
```

## 1 · Conversation

A `Conversation` is a Python module the dev imports — it's not a YAML file, not a JSON spec, and there's no UI builder. The "Conversation as code" framing is the headline.

```python
from xray import Conversation, Turn, expect_agent_turn

conv = Conversation(
    id="booking-happy-path",
    title="Books a table for two",
    turns=[
        Turn.user("Hi, I'd like to book a table for two at 7pm.", key="u0"),
        expect_agent_turn(
            key="a0",
            assertion=lambda agent: "confirmed" in agent.transcript.lower(),
            assertion_name="confirms_booking",
        ),
    ],
)
```

### `id` and `version`

`id` is dev-chosen — typically the file's module name with hyphens. `version` is auto-computed as a SHA256 fingerprint of the turn structure (text, role, key, assertion presence). The SDK posts `(id, version)` to `POST /v1/conversations` as an idempotent upsert; xray rejects an upsert against the same `(id, version)` with a *different* fingerprint as `VersionFingerprintMismatchError` — i.e. the dev edited the spec without bumping `id`.

You can pin `version` explicitly (`Conversation(..., version="pinned-v1")`) if you'd rather control it. The fingerprint default is what we recommend.

### Turns

- `Turn.user(text, *, key=None, audio=None)` — the user-side script.
- `expect_agent_turn(*, key=None, assertion=None, assertion_name=None)` — the agent's response is observed at runtime; the assertion runs against the captured `AgentResponse`.

`key` is the cross-Conversation alignment join key surfaced in compare views. Without `key`, the UI aligns positionally — which is fine until you add a turn in the middle.

### Assertions

Per-turn predicates run in the SDK process against `AgentResponse(transcript, duration_ms)`. Return `True` / `False` / raise (counts as `errored`). They are evaluated synchronously after the runtime returns and posted to xray via `PATCH /v1/replays/:id` — they do not require the OTEL receiver to be reachable.

`AgentResponse` carries no per-turn audio path. xray's storage model is **one WAV per replay** — the orchestrator uploads the runtime's full mixdown to `POST /v1/replays/:id/audio`; the inspector slices it client-side using the `started_at` / `ended_at` columns on `replay_turns`.

### Judges

Optional per-replay predicate that receives a `ReplayResult` and returns a `JudgeOutcome(status, score?, reason?, error?)`. The judge runs in your process against your LLM credentials — **xray never holds LLM provider keys** by design. This keeps secrets out of the single-image distribution.

## 2 · `xray.trace`

`xray.trace.set_replay_context(replay_id, conversation_id, conversation_version)` attaches the replay identity to the current OpenTelemetry context as baggage. Every span the agent emits in this asyncio task / thread inherits it — your `gen_ai.*` and Langfuse spans pick up `xray.replay.id` automatically and route to the right Replay.

```python
from xray.trace import set_replay_context, stage, turn, aturn

# In your LiveKit agent's on-room-joined handler:
metadata = json.loads(room.metadata or "{}")
set_replay_context(
    replay_id=metadata["xray.replay.id"],
    conversation_id=metadata["xray.conversation.id"],
    conversation_version=metadata["xray.conversation.version"],
)

# Per-stage timing — STT and TTS in v1
@stage("stt")
async def transcribe(audio_chunk):
    return await my_stt.transcribe(audio_chunk)
```

`stage("stt")` / `stage("tts")` wrap the function in an `xray.stage.<name>` span and stamp the baggage on it.

### Per-turn attribution

`xray.trace.turn(idx, key=None)` (sync) and `xray.trace.aturn(idx, key=None)` (async) scope `xray.turn.idx` (and optionally `xray.turn.key`) baggage to a block:

```python
async with xray.trace.aturn(idx=3, key="a3"):
    # Every gen_ai.* / langfuse.* span emitted inside inherits
    # xray.turn.idx=3 → the server folds it into model_usage /
    # tool_calls rows so the inspector can attribute each LLM call to
    # the turn that produced it.
    response = await my_agent.handle_user_message(...)
```

The `LiveKitRuntime` wraps each turn with `aturn(...)` automatically — you only need to reach for `turn` / `aturn` if you're emitting spans outside the runtime's loop or writing a custom `Runtime`.

## 3 · `xray.runtime`

A `Runtime` joins your transport (LiveKit room, Pipecat session, …), plays the user side of the Conversation, captures the agent's output per turn, and returns a `RuntimeResult`.

```python
from xray.runtime.base import Runtime, RuntimeResult

class MyRuntime(Runtime):
    async def run(self, conversation) -> RuntimeResult: ...
    async def aclose(self) -> None: ...
```

v1 ships `xray.runtime.livekit.LiveKitRuntime`. Other runtimes (Pipecat, OpenAI Realtime, Gemini Live, raw WebSocket) are on the roadmap — the ABC exists from day one so adding one is a new sub-module, not a refactor.

### `LiveKitRuntime` — audio and environment

The runtime joins your LiveKit room as the user side of the conversation, publishes each user turn as a real audio track, captures the agent's audio + transcription, and emits **one stereo WAV per replay** (left = user, right = agent) that the orchestrator uploads to `POST /v1/replays/:id/audio`. The inspector slices that mixdown client-side using the per-turn timestamps on `replay_turns`.

User-side audio comes from one of two sources, per `Turn.audio`:

- `AudioRef(kind="recorded", path="...")` — a WAV on disk. **Required format**: 48 kHz, mono, 16-bit signed. Re-encode with `ffmpeg -i in.wav -ar 48000 -ac 1 -sample_fmt s16 out.wav`.
- `AudioRef(kind="tts", voice_id=...)` (or no `audio` + a `Turn.text`) — the runtime calls OpenAI's `/v1/audio/speech` once and caches the result at `~/.cache/xray-py/<conversation_id>/<fingerprint>.wav` so re-runs reuse bytes.

Environment variables the runtime reads:

| Var | Required? | Default | Purpose |
|---|---|---|---|
| `LIVEKIT_URL` | yes (when constructed via env) | — | LiveKit WS URL |
| `LIVEKIT_API_KEY` | yes | — | LiveKit API key for the user-side token |
| `LIVEKIT_API_SECRET` | yes | — | LiveKit API secret for the user-side token |
| `OPENAI_API_KEY` | only for `kind="tts"` turns | — | Used directly from the SDK process — **xray never sees this key**. |
| `OPENAI_TTS_MODEL` | no | `gpt-4o-mini-tts` | TTS model |
| `OPENAI_TTS_VOICE` | no | `alloy` | Default voice; per-turn `AudioRef.voice_id` overrides |

Failure modes surface as typed errors from `xray.errors`:

- `AgentNotJoinedError` — agent participant never joined the room in time. → `failureReason="agent_not_joined"`.
- `AudioMissingError` — recorded WAV missing / wrong format, or TTS requested without an API key. → `failureReason="audio_missing"`.
- `RuntimeBindError` — `runtime.run(...)` called before `bind(...)`. → `failureReason="sdk_aborted"`.
- `MixdownError` — couldn't write the WAV mixdown.
- `AudioTooLargeError` — mixdown exceeded the 50 MiB server cap. → demotes to `failed`.

## 4 · `xray.run(...)`

The convenience orchestrator. Lifecycle:

1. `POST /v1/conversations` — idempotent upsert keyed by `(id, version)`.
2. `POST /v1/replays` — eager row creation; returns `replay_id`.
3. `runtime.bind(replay_id, conversation_id, conversation_version)` — gives the runtime the values it propagates as LiveKit room metadata.
4. `await runtime.run(conversation)` — captures `RuntimeResult` (responses + optional full audio mixdown / transcript).
5. `POST /v1/replays/:id/audio` — uploads `RuntimeResult.full_audio_path` if the runtime produced a mixdown WAV. Capped at 50 MiB; an over-cap mixdown demotes the replay to `failed`.
6. Per-turn assertions evaluate against `RuntimeResult.responses`.
7. Per-replay judge (if any) evaluates against the assembled `ReplayResult`.
8. `PATCH /v1/replays/:id` — final status (`completed` / `failed`) + judge result.

Sync (`run(...)`) and async (`run_async(...)`) entrypoints are both exported.

## What lives on the SDK side vs. the xray side

| Concern | Lives in |
|---|---|
| Conversation definition + fingerprint | SDK (Python) |
| LiveKit room join + audio I/O | SDK (`LiveKitRuntime`) |
| Assertion predicates | SDK process (your machine) |
| LLM judge | SDK process — xray never holds your provider keys |
| Conversation + Replay rows | xray (single source of truth) |
| OTLP span persistence + filtering | xray (filter-not-gate via vocabulary registry) |
| Mixdown WAV (one file per replay) | xray volume (`XRAY_AUDIO_ROOT`, default `/data/audio`); inspector slices it client-side via `replay_turns` timestamps |

## Security

No auth on the SDK→xray wire. Keep port 8080 private — same Docker network is the assumed deployment. The README documents the bind.
