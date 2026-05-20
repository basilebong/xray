import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { match, P } from "ts-pattern";
import * as v from "valibot";

import {
	ConversationNotFoundResponseSchema,
	openApiSchemaFromValibot,
	ValidationErrorResponseSchema,
} from "@/server/core/types.ts";
import { listReplaysForConversation } from "@/server/replays/replays.service.ts";
import { ListReplaysResponseSchema } from "@/server/replays/replays.types.ts";
import { sanitizeIssues } from "@/server/sanitize-issues/sanitize-issues.ts";
import type { Store } from "@/server/store/store.ts";

import { ConversationNotFoundError, InvalidConversationHashError } from "./conversations.errors.ts";
import {
	getConversationByHash,
	listConversations,
	toConversationResponse,
} from "./conversations.service.ts";
import {
	ConversationHashSchema,
	ConversationResponseSchema,
	ListConversationsResponseSchema,
} from "./conversations.types.ts";

export function createConversationsRouter(store: Store): Hono {
	const router = new Hono();

	router.get(
		"/conversations",
		describeRoute({
			tags: ["Conversations"],
			summary: "List all conversations",
			description:
				"Returns one row per content hash with name, replay count, and last-run timestamp. Sorted by most-recent activity.",
			responses: {
				"200": {
					description: "All conversations, newest-active first.",
					content: {
						"application/json": {
							schema: openApiSchemaFromValibot(ListConversationsResponseSchema),
						},
					},
				},
			},
		}),
		(c) => {
			return c.json({ items: listConversations(store) });
		},
	);

	router.get(
		"/conversations/:hash",
		describeRoute({
			tags: ["Conversations"],
			summary: "Get a conversation by content hash",
			parameters: [
				{
					in: "path",
					name: "hash",
					required: true,
					schema: openApiSchemaFromValibot(ConversationHashSchema),
				},
			],
			responses: {
				"200": {
					description: "Conversation row.",
					content: {
						"application/json": { schema: openApiSchemaFromValibot(ConversationResponseSchema) },
					},
				},
				"400": {
					description: "Hash failed validation.",
					content: {
						"application/json": { schema: openApiSchemaFromValibot(ValidationErrorResponseSchema) },
					},
				},
				"404": {
					description: "Conversation not found.",
					content: {
						"application/json": {
							schema: openApiSchemaFromValibot(ConversationNotFoundResponseSchema),
						},
					},
				},
			},
		}),
		(c) => {
			const hash = parseConversationHash(c.req.param("hash"));
			const row = getConversationByHash(store, hash);
			if (row === undefined) throw new ConversationNotFoundError(hash);
			return c.json(toConversationResponse(row));
		},
	);

	router.get(
		"/conversations/:hash/replays",
		describeRoute({
			tags: ["Conversations"],
			summary: "List replays for a conversation",
			description: "Lists every Replay attached to the given conversation hash, newest first.",
			parameters: [
				{
					in: "path",
					name: "hash",
					required: true,
					schema: openApiSchemaFromValibot(ConversationHashSchema),
				},
			],
			responses: {
				"200": {
					description: "Replays for the conversation (possibly empty).",
					content: {
						"application/json": {
							schema: openApiSchemaFromValibot(ListReplaysResponseSchema),
						},
					},
				},
				"400": {
					description: "Conversation hash failed validation.",
					content: {
						"application/json": { schema: openApiSchemaFromValibot(ValidationErrorResponseSchema) },
					},
				},
				"404": {
					description: "Conversation not found.",
					content: {
						"application/json": {
							schema: openApiSchemaFromValibot(ConversationNotFoundResponseSchema),
						},
					},
				},
			},
		}),
		(c) => {
			const hash = parseConversationHash(c.req.param("hash"));
			if (getConversationByHash(store, hash) === undefined) {
				throw new ConversationNotFoundError(hash);
			}
			return c.json({ items: listReplaysForConversation(store, hash) });
		},
	);

	router.onError((err, c) =>
		match(err)
			.with(P.instanceOf(InvalidConversationHashError), (e) =>
				c.json({ error: "invalid_conversation_hash", issues: sanitizeIssues(e.issues) }, 400),
			)
			.with(P.instanceOf(ConversationNotFoundError), (e) =>
				c.json(
					{
						error: "conversation_not_found",
						conversation_hash: e.conversationHash,
					},
					404,
				),
			)
			.with(P.instanceOf(Error), (e) => {
				console.error("unhandled error during conversation request", e);
				return c.json({ error: "internal_error" }, 500);
			})
			.otherwise((e) => {
				throw e;
			}),
	);

	return router;
}

function parseConversationHash(raw: string): string {
	const check = v.safeParse(ConversationHashSchema, raw);
	if (!check.success) throw new InvalidConversationHashError(check.issues);
	return check.output;
}
