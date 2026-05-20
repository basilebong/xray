import * as v from "valibot";

// Caps. Conversation specs are author-time artifacts — a 100-turn script with
// long text is the realistic worst case, plus a few KB of overhead. 256 KB
// covers the longest plausible spec with three orders of magnitude of headroom.
export const MAX_CONVERSATION_BODY_BYTES = 256 * 1024;
export const MAX_CONVERSATION_NAME = 256;
export const MAX_TURNS_PER_CONVERSATION = 1024;
const MAX_TURN_TEXT = 64 * 1024;
const MAX_TURN_KEY = 128;
const MAX_AUDIO_PATH = 1024;
/** Shared validator: 64-char lowercase hex SHA-256. */
export const HEX_SHA256_RE = /^[0-9a-f]{64}$/;

/**
 * Conversation hash — full SHA-256 hex over the canonical-JSON encoding of
 * the turn array (including per-turn `RecordedAudio` byte sha256).
 */
export const ConversationHashSchema = v.pipe(
	v.string(),
	v.regex(HEX_SHA256_RE, "Must be a 64-char lowercase hex SHA-256"),
);
export type ConversationHash = v.InferOutput<typeof ConversationHashSchema>;

export const ConversationNameSchema = v.pipe(
	v.string(),
	v.nonEmpty(),
	v.maxLength(MAX_CONVERSATION_NAME),
);

const TurnRoleSchema = v.picklist(["user", "agent"]);

const RecordedAudioRefSchema = v.object({
	kind: v.literal("recorded"),
	path: v.pipe(v.string(), v.nonEmpty(), v.maxLength(MAX_AUDIO_PATH)),
	// sha256 of the WAV file bytes. The SDK computes this at hash time so
	// editing the file changes the conversation hash. The server stores it
	// alongside `path` so the canonical turns_json captures both.
	sha256: v.pipe(v.string(), v.regex(HEX_SHA256_RE, "Must be a 64-char lowercase hex SHA-256")),
});

const TtsAudioRefSchema = v.object({
	kind: v.literal("tts"),
	voice_id: v.optional(v.pipe(v.string(), v.maxLength(MAX_AUDIO_PATH))),
});

const TurnAudioRefSchema = v.variant("kind", [RecordedAudioRefSchema, TtsAudioRefSchema]);

/**
 * One step in a Conversation spec. v1 supports `user` and `agent`. `agent`
 * is a placeholder turn — the agent's response is observed at runtime, not
 * pre-written. `key` is the cross-Conversation alignment join key surfaced
 * in compare views.
 */
export const ConversationTurnSchema = v.object({
	role: TurnRoleSchema,
	text: v.optional(v.pipe(v.string(), v.maxLength(MAX_TURN_TEXT))),
	key: v.optional(v.pipe(v.string(), v.nonEmpty(), v.maxLength(MAX_TURN_KEY))),
	audio: v.optional(TurnAudioRefSchema),
});
export type ConversationTurn = v.InferOutput<typeof ConversationTurnSchema>;

export const TurnsArraySchema = v.pipe(
	v.array(ConversationTurnSchema),
	v.minLength(1),
	v.maxLength(MAX_TURNS_PER_CONVERSATION),
);

/** Response of `GET /v1/conversations/:hash`. */
export const ConversationResponseSchema = v.object({
	hash: v.string(),
	name: v.string(),
	created_at: v.string(),
	last_run_at: v.nullable(v.string()),
	turns: v.array(ConversationTurnSchema),
});
export type ConversationResponse = v.InferOutput<typeof ConversationResponseSchema>;

export const ConversationSummarySchema = v.object({
	hash: v.string(),
	name: v.string(),
	created_at: v.string(),
	last_run_at: v.nullable(v.string()),
	replays: v.number(),
});
export type ConversationSummary = v.InferOutput<typeof ConversationSummarySchema>;

export const ListConversationsResponseSchema = v.object({
	items: v.array(ConversationSummarySchema),
});
export type ListConversationsResponse = v.InferOutput<typeof ListConversationsResponseSchema>;
