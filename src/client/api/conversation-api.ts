import * as v from "valibot";

import type { Conversation } from "@/server/sessions/sessions.types.ts";
import { ConversationSchema } from "@/server/sessions/sessions.types.ts";

import { ConversationInvalidResponseError, ConversationLoadError } from "../inspector/errors.ts";

export interface FetchConversationParams {
	sessionId: string;
	signal: AbortSignal;
	apiBase?: string;
}

/**
 * Single network call to `GET /v1/sessions/:id`. Pure function — no React,
 * no state. `useQuery` wraps this; tests call it directly. Validates the
 * response against the server-emitted schema at the boundary per
 * `.claude/rules/boundary-validation.md` §2.
 */
export async function fetchConversation({
	sessionId,
	signal,
	apiBase,
}: FetchConversationParams): Promise<Conversation> {
	const base = apiBase ?? window.location.origin;
	const url = new URL(`/v1/sessions/${encodeURIComponent(sessionId)}`, base);
	const res = await fetch(url, { signal });
	if (!res.ok) throw new ConversationLoadError(res.status);
	const parsed = v.safeParse(ConversationSchema, await res.json());
	if (!parsed.success) throw new ConversationInvalidResponseError(parsed.issues);
	return parsed.output;
}
