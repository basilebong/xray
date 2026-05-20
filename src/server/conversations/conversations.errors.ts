import type { BaseIssue } from "valibot";

export class ConversationError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "ConversationError";
	}
}

/** Path-param conversation hash failed validation. */
export class InvalidConversationHashError extends ConversationError {
	readonly issues: readonly BaseIssue<unknown>[];

	constructor(issues: readonly BaseIssue<unknown>[]) {
		super("Invalid conversation hash in path");
		this.name = "InvalidConversationHashError";
		this.issues = issues;
	}
}

/** `GET /v1/conversations/:hash` looked up a hash that doesn't exist. */
export class ConversationNotFoundError extends ConversationError {
	readonly conversationHash: string;

	constructor(conversationHash: string) {
		super(`Conversation "${conversationHash}" not found`);
		this.name = "ConversationNotFoundError";
		this.conversationHash = conversationHash;
	}
}
