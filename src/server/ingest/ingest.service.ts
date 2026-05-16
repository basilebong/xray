import { ensureStubSession, markSessionEnded, saveSession } from "@/server/store/sessions-repo.ts";
import type { Store } from "@/server/store/store.ts";
import { appendToolCallIdempotent } from "@/server/store/tool-calls-repo.ts";
import { appendTurnIdempotent, getTurnByIdx } from "@/server/store/turns-repo.ts";

import { UnknownTurnError } from "./ingest.errors.ts";
import type { IngestEvent } from "./ingest.types.ts";

/**
 * Apply a validated ingest event to the store.
 *
 * Every branch MUST be idempotent — replaying the same event (same
 * identity key) is a no-op. That's the contract the router promises
 * callers; this is where it's actually enforced (via the underlying
 * repo functions, all of which use UPSERT / INSERT-OR-IGNORE).
 */
export function applyEvent(store: Store, sessionId: string, event: IngestEvent): void {
	const db = store.db;
	switch (event.type) {
		case "session_started":
			saveSession(db, {
				id: sessionId,
				source: "ingest",
				provider: null,
				agentId: event.agentId,
				startedAt: event.startedAt,
				endedAt: null,
				durationMs: null,
			});
			return;

		case "turn_completed":
			ensureStubSession(db, sessionId, event.timestamp);
			appendTurnIdempotent(db, sessionId, {
				id: crypto.randomUUID(),
				idx: event.idx,
				role: event.role,
				text: event.text,
				ts: event.timestamp,
				activeNodeId: null,
				edgeFiredId: null,
				edgeReasoning: null,
				promptSeen: null,
				llmLatencyMs: event.llmLatencyMs ?? null,
			});
			return;

		case "tool_called": {
			// No `ensureStubSession` here: the `turns.session_id` FK guarantees
			// the session exists whenever a turn exists, so the lookup below
			// is sufficient.
			const turn = getTurnByIdx(db, sessionId, event.turnIdx);
			if (!turn) {
				throw new UnknownTurnError(sessionId, event.turnIdx);
			}
			appendToolCallIdempotent(db, turn.id, {
				idx: event.idx,
				name: event.name,
				argsJson: JSON.stringify(event.args ?? null),
				resultJson: event.result === undefined ? null : JSON.stringify(event.result),
				latencyMs: event.latencyMs ?? null,
			});
			return;
		}

		case "session_ended":
			ensureStubSession(db, sessionId, event.endedAt);
			markSessionEnded(db, sessionId, event.endedAt, event.durationMs);
			return;

		default:
			event satisfies never;
			return;
	}
}
