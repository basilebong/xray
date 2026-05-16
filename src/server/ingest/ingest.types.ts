import * as v from "valibot";

// The session id lives in the URL path, never in the body — retries are
// idempotent on the URL alone.
//
// Every timestamp is ISO 8601: `sessions-repo.listSessions` orders by
// `started_at` using SQLite TEXT comparison, which only matches
// chronological order when the inputs are lex-comparable.

const RoleSchema = v.picklist(["user", "agent", "tool", "system"]);
const IsoTimestampSchema = v.pipe(v.string(), v.isoTimestamp());
const NonNegativeIntSchema = v.pipe(v.number(), v.integer(), v.minValue(0));

export const SessionStartedEventSchema = v.object({
	type: v.literal("session_started"),
	agentId: v.string(),
	startedAt: IsoTimestampSchema,
	workflow: v.optional(v.unknown()),
	metadata: v.optional(v.record(v.string(), v.unknown())),
});
export type SessionStartedEvent = v.InferOutput<typeof SessionStartedEventSchema>;

export const TurnCompletedEventSchema = v.object({
	type: v.literal("turn_completed"),
	idx: NonNegativeIntSchema,
	role: RoleSchema,
	text: v.string(),
	timestamp: IsoTimestampSchema,
	llmLatencyMs: v.optional(v.pipe(v.number(), v.minValue(0))),
});
export type TurnCompletedEvent = v.InferOutput<typeof TurnCompletedEventSchema>;

export const ToolCalledEventSchema = v.object({
	type: v.literal("tool_called"),
	turnIdx: NonNegativeIntSchema,
	idx: NonNegativeIntSchema,
	name: v.string(),
	args: v.unknown(),
	result: v.optional(v.unknown()),
	latencyMs: v.optional(v.pipe(v.number(), v.minValue(0))),
});
export type ToolCalledEvent = v.InferOutput<typeof ToolCalledEventSchema>;

export const SessionEndedEventSchema = v.object({
	type: v.literal("session_ended"),
	endedAt: IsoTimestampSchema,
	durationMs: v.pipe(v.number(), v.minValue(0)),
});
export type SessionEndedEvent = v.InferOutput<typeof SessionEndedEventSchema>;

export const IngestEventSchema = v.variant("type", [
	SessionStartedEventSchema,
	TurnCompletedEventSchema,
	ToolCalledEventSchema,
	SessionEndedEventSchema,
]);
export type IngestEvent = v.InferOutput<typeof IngestEventSchema>;
