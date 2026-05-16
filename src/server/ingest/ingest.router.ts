import { Hono } from "hono";
import * as v from "valibot";

import type { Store } from "@/server/store/store.ts";

import { InvalidEventError, UnknownTurnError } from "./ingest.errors.ts";
import { applyEvent } from "./ingest.service.ts";
import { IngestEventSchema } from "./ingest.types.ts";

/**
 * HTTP ingest router. Mounted at `/v1`; final URL is
 * `POST /v1/sessions/:id/events`.
 *
 * **No authentication.** Network exposure is the operator's responsibility:
 * default bind is `0.0.0.0` (set `HOST=127.0.0.1` for single-host self-hosting
 * or front with an auth-checking reverse proxy).
 *
 * Idempotency: replaying any event with the same identity key
 * (`session_id` + `idx` for turns and tool calls; `session_id` for
 * session_started / session_ended) is a no-op. Idempotency lives in
 * `ingest.service.ts`; this file is HTTP plumbing only.
 */
export function createIngestRouter(store: Store): Hono {
	const router = new Hono();

	router.post("/sessions/:id/events", async (c) => {
		const sessionId = c.req.param("id");

		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return c.json(
				{
					error: "invalid_event",
					issues: [{ message: "Request body must be valid JSON" }],
				},
				400,
			);
		}

		const parsed = v.safeParse(IngestEventSchema, raw);
		if (!parsed.success) {
			throw new InvalidEventError(sessionId, parsed.issues);
		}

		applyEvent(store, sessionId, parsed.output);
		return c.json({ ok: true });
	});

	router.onError((err, c) => {
		if (err instanceof InvalidEventError) {
			return c.json({ error: "invalid_event", issues: err.issues }, 400);
		}
		if (err instanceof UnknownTurnError) {
			return c.json({ error: "unknown_turn", sessionId: err.sessionId, turnIdx: err.turnIdx }, 422);
		}
		console.error("store error during ingest", err);
		return c.json({ error: "store_failure" }, 500);
	});

	return router;
}
