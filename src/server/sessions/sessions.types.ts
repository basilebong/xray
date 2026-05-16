import * as v from "valibot";

import { ALL_PROVIDERS } from "@/adapters/types.ts";

import { tryDecodeCursor } from "./cursor/cursor.ts";
import type { CursorPayload } from "./cursor/types.ts";

const MAX_AGENT_ID = 256;
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 100;
/** base64 of `{"startedAt":"…","id":"…"}` — both fields capped, so any legit cursor fits in 512 bytes. */
const MAX_CURSOR = 512;

/**
 * Pipe that turns the on-wire cursor string into a `{ startedAt, id }` pair.
 * A malformed cursor is a 400 — consistent with every other query field —
 * not a silent "ignore and return page 1", which would mask client bugs.
 */
const CursorStringSchema = v.pipe(
	v.string(),
	v.nonEmpty(),
	v.maxLength(MAX_CURSOR),
	v.rawTransform<string, CursorPayload>(({ dataset, addIssue, NEVER }) => {
		const decoded = tryDecodeCursor(dataset.value);
		if (decoded !== undefined) return decoded;
		addIssue({ message: "Malformed cursor" });
		return NEVER;
	}),
);

export const ListSessionsQuerySchema = v.object({
	agentId: v.optional(v.pipe(v.string(), v.nonEmpty(), v.maxLength(MAX_AGENT_ID))),
	limit: v.optional(
		v.pipe(
			v.string(),
			v.transform((s) => Number(s)),
			v.number(),
			v.integer(),
			v.minValue(1),
			v.maxValue(MAX_LIMIT),
		),
		String(DEFAULT_LIMIT),
	),
	cursor: v.optional(CursorStringSchema),
});
export type ListSessionsQuery = v.InferOutput<typeof ListSessionsQuerySchema>;

/**
 * Wire shape of one session row. Mirrors the store's `Session` minus the raw
 * `source`/`provider` split — the client renders a single source tag, so the
 * server emits `source: "ingest" | "adapter:<provider>"` already composed.
 */
export const SessionListItemSchema = v.object({
	id: v.string(),
	agentId: v.string(),
	startedAt: v.string(),
	endedAt: v.nullable(v.string()),
	durationMs: v.nullable(v.number()),
	source: v.union([
		v.literal("ingest"),
		...ALL_PROVIDERS.map((p) => v.literal(`adapter:${p}` as const)),
	]),
});
export type SessionListItem = v.InferOutput<typeof SessionListItemSchema>;

export const ListSessionsResponseSchema = v.object({
	sessions: v.array(SessionListItemSchema),
	/** Opaque base64url string the client must echo back as `?cursor=...` for the next page. */
	nextCursor: v.nullable(v.string()),
});
export type ListSessionsResponse = v.InferOutput<typeof ListSessionsResponseSchema>;
