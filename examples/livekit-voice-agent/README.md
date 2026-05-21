# xray + LiveKit voice agent — minimal example

A self-contained example that runs **xray**, a **LiveKit** server, and a
**minimal Gemini Live voice agent** in one `docker compose` stack, then
drives one Replay through the whole thing to prove the wiring works
end-to-end.

This is the canonical reference for "how do I bolt xray onto an existing
LiveKit Agents worker."

```
.
├── README.md
├── compose.yaml           ← 4 services: livekit, xray, agent, driver(profile:test)
├── .env.example           ← only GEMINI_API_KEY required
├── agent/
│   ├── Dockerfile         ← python:3.12-slim, COPY ../../sdk/python
│   ├── main.py            ← ~40 LOC; the one xray.attach() call is line 30
│   └── pyproject.toml
├── driver/
│   ├── Dockerfile         ← python:3.12-slim, COPY ../../sdk/python
│   ├── test_e2e.py        ← pytest; drives one Replay, asserts the wire
│   └── pyproject.toml
└── fixtures/
    └── user_turn_1.wav    ← 48kHz mono int16, ~2s. "Hello, can you tell me what year it is?"
```

## Quickstart

```bash
# 1. Get a Gemini API key — https://aistudio.google.com/app/apikey
export GEMINI_API_KEY=...

# 2. Boot livekit + xray + agent (build context is the repo root, so this
#    rebuilds xray from your current working tree)
cd examples/livekit-voice-agent
docker compose up --build

# 3. In another shell — drive one Replay through the stack
docker compose --profile test run --rm driver

# 4. Open the inspector — http://localhost:8080
#    The Replay you just drove is at the top of the list.
```

`GEMINI_API_KEY` is read at runtime by `compose.yaml` and forwarded to the
agent container only. It is never baked into any image layer (per
`.claude/rules/public-repo.md` §2).

## What's wired where

```
                                +--------------------+
                                |   LiveKit server   |
                                |  (--dev, ws:7880)  |
                                +---------+----------+
                                          ^
                                          | room: example-<uuid>
                  +---------------+       | join as "xray-driver"
                  |    driver     |-------+
                  |  (pytest, SDK)|       |
                  +-------+-------+       |
                          |               | participant
       POST /v1/replays   |   join as     | attributes carry
       POST .../audio     |   xray-agent  | xray.replay.id +
       GET  .../:id       |               | xray.conversation.hash
                          v               v
                  +---------------+   +------------------+
                  |     xray      |<--+   voice-agent    |
                  |  Hono+SQLite  |   |  LiveKit Agents  |
                  | OTLP receiver |<--+  + xray.attach() |
                  +---------------+   +------------------+
                                       OTLP/JSON traces
```

1. **driver** calls `xray.run(conversation=..., runtime=LiveKitRuntime(...))`.
   That POSTs the Replay (with the conversation spec + the user-turn WAV)
   to xray, gets back the `replay_id`, then joins the LiveKit room as the
   user-side participant.
2. The driver's JWT carries an `xray` attribute (`participant.attributes`,
   not metadata — no `can_update_own_metadata` grant required).
3. LiveKit dispatches a job to **agent**. Inside the worker entrypoint
   (`agent/main.py`), `async with xray.attach(ctx, service_name=...)`
   reads the JWT attribute, binds the replay scope to OTEL baggage, and
   installs the OTLP/JSON exporter pointed at xray.
4. The agent's Gemini Live model handles audio in/out via LiveKit.
   Every span the worker emits inside the `xray.attach` block carries the
   replay id via baggage, so xray's OTLP receiver routes them to the
   correct row.
5. The driver plays each user turn, captures the agent's audio +
   transcripts, writes a stereo mixdown WAV (left = user, right = agent),
   uploads it to `POST /v1/replays/:id/audio`, evaluates per-turn
   assertions, and PATCHes the Replay's final status.

## The conversation

Three turns, defined in `driver/test_e2e.py`:

| Turn | Role  | Audio                          | Assertion                        |
|------|-------|--------------------------------|----------------------------------|
| 0    | agent | (Gemini Live greets on join)   | `len(r.transcript) > 5`          |
| 1    | user  | `fixtures/user_turn_1.wav`     | —                                |
| 2    | agent | (Gemini Live answers)          | `len(r.transcript) > 5`          |

The assertion is intentionally lenient (`> 5`, not a keyword match)
because Gemini Live wording varies; the wire is what's under test, not
LLM phrasing.

### What the agent emits to xray (user-written OTEL spans)

The example deliberately emits **one span per recognized vocabulary** to
prove all three wires work end-to-end:

```python
# (a) xray vocabulary — raw OTel span using a recognized `xray.*` name.
with _tracer.start_as_current_span("xray.stage.tts") as span:
    span.set_attribute("xray.stage.tts.provider", "gemini-live")
    span.set_attribute("xray.stage.tts.model", model_id)
    session.generate_reply(instructions="Greet the caller…")

# (b) Langfuse vocabulary — Langfuse Python SDK v3+ `@observe` decorator.
#     Emits OTel spans tagged with `langfuse.observation.*` attributes
#     through whichever TracerProvider is global — which is the one
#     `xray.attach` installed an exporter on. No xray-specific code.
@observe(as_type="generation", name="example_langfuse_step")
def _langfuse_step(model: str) -> str:
    return f"agent will use {model}"

# (c) OTel GenAI semconv vocabulary — emit via the xray session helper.
#     Produces an `execute_tool` span; xray extracts it into a `tool_calls`
#     row in addition to landing as a raw span.
xray_session.record_tool_call(
    name="get_current_year",
    args_json="{}",
    result_json='{"year": 2026}',
    latency_ms=5,
)
```

After a run, `GET /v1/replays/:id` returns **7 spans**:

| Span                      | Vocabulary | Source                                |
|---------------------------|------------|---------------------------------------|
| `xray.stage.tts`          | xray       | user code (a)                         |
| `example_langfuse_step`   | langfuse   | user code (b) via `@observe`          |
| `execute_tool`            | gen_ai     | user code (c) via `record_tool_call`  |
| `xray.turn` × 3           | xray       | SDK driver per-turn + `xray.attach`   |
| `agent_turn`              | gen_ai     | livekit-agents framework auto-emit    |

Plus structured rows:
- `tool_calls` — `get_current_year` from (c).
- `model_usage` × 2 — one from langfuse `as_type="generation"` (b), one
  from Gemini Live's auto-emitted usage span (Gemini's actual tokens land
  here: ~366 input / ~47 output for this conversation).

### Langfuse setup notes

Langfuse SDK v3 refuses to start its `@observe` decorator without
`LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` env vars. The compose
file sets dummy values + points `LANGFUSE_HOST` at `127.0.0.1:1` so the
client initializes (and thus the decorator emits spans through the
shared OTel tracer provider), while the langfuse cloud upload fails
fast against the non-routable host. For real production use, point
`LANGFUSE_HOST` at your actual Langfuse instance and use real keys —
xray will still receive the same spans via OTel, **in parallel with**
Langfuse's own ingestion.

**xray's vocabulary registry** drops any span whose name + attributes
match no known vocabulary. The three recognized vocabularies are:

| Vocabulary | What matches | What gets extracted |
|---|---|---|
| `xray.*` | Allowlist of named spans (`xray.turn`, `xray.judge`, `xray.assertion`, `xray.stage.stt`, `xray.stage.tts`) | Raw spans only — no structured row extraction in v0.2 |
| OTel GenAI semconv | Any span carrying a `gen_ai.*` attribute, OR named `chat <model>` / `text_completion <model>` / `execute_tool <tool>` | `execute_tool` → `tool_calls` row; chat/text_completion with usage attrs → `model_usage` row |
| Langfuse | Any span carrying `langfuse.observation.*` (v3) or legacy `langfuse.*` attributes | `type == "generation"` → `model_usage`; `type == "tool"` → `tool_calls`; everything else → raw langfuse span |

This is the **"filter, not a gate"** design — emitting random framework
spans from your agent is safe; they just won't be persisted. Three ways
to get a custom span to land:

1. Give it any `gen_ai.*` attribute (cheapest — what `example_startup`
   does in this example).
2. Use one of the recognized `xray.*` names from
   `src/server/otlp/vocabularies/xray.ts`.
3. **Use Langfuse's `@observe()` decorator** (Langfuse Python SDK ≥ v3).
   It emits spans through the active OTel tracer provider with
   `langfuse.observation.*` attributes, which xray's Langfuse vocabulary
   picks up automatically. No extra wiring beyond `pip install langfuse`
   and pointing it at the same tracer provider `xray.attach` installs
   (Langfuse v3 picks up the global provider by default). Both
   `@observe(as_type="generation")` and `@observe(as_type="tool")` extract
   into structured rows in xray.

### Two non-obvious bits in `agent/main.py`

**1. Greeting kickoff.** Gemini Live waits for the user to speak first
by default. `session.generate_reply(instructions="Greet…")` immediately
after `session.start(...)` triggers the agent's first utterance so turn 0
isn't ~30 s of silence.

**2. Transcript republishing.** When `AgentSession` is driven by
`livekit-plugins-google`'s `RealtimeModel`, the model's transcripts
sometimes don't reach the RTC `transcription_received` channel reliably
(race with the audio track's `sid` assignment). The example listens for
`AgentSession.on("conversation_item_added")` and explicitly republishes
each assistant message as an `rtc.Transcription` segment. The SDK
driver's existing listener picks it up, fills `AgentResponse.transcript`,
and per-turn assertions can run.

Both pieces are explicitly highlighted because they're the parts a
production agent would need to handle once they aren't using xray's
example template.

What the test verifies beyond the per-turn assertions:

- Full xray HTTP control plane exercised (`POST /v1/conversations`,
  `POST /v1/replays`, audio upload, `POST .../analyze`, SSE events,
  `GET /v1/replays/:id`, final `PATCH`).
- Agent's OTLP/JSON spans reached the receiver (`xray.turn` +
  `gen_ai.client.operation`).
- Server-side `analyze-replay` bunqueue job ran VAD on the uploaded
  mixdown and derived `turns` + `speech_segments` rows.
- A `model_usage` row was extracted from a `gen_ai.*` span — vocabulary
  registry worked.

## Adapting this to your own agent

You almost certainly already have an existing LiveKit Agents worker.
The integration is two lines in your existing entrypoint:

```python
async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()
    async with xray.attach(ctx, service_name="my-agent"):
        # your existing agent code — unchanged
        ...
```

See `docs/integrate.md` for the deep-dive walkthrough.

## The fixture

`fixtures/user_turn_1.wav` was generated once via macOS `say` →
`ffmpeg` to keep the example free of an OpenAI-key runtime dependency.
The phrase is innocuous + concrete enough that Gemini gives a
substantive reply. The bytes are committed (~220 KB) so `git clone`
→ `docker compose up` works with no generation step.

For your own conversations, point `RecordedAudio(path=...)` at any
**48 kHz / mono / 16-bit** WAV:

```bash
ffmpeg -i input.wav -ar 48000 -ac 1 -sample_fmt s16 output.wav
```

or use `TtsAudio()` with `OPENAI_API_KEY` set in your driver process
(xray never sees the key).
