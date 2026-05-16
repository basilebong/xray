import type { BaseIssue } from "valibot";

export class SessionsError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "SessionsError";
	}
}

/**
 * Query string failed Valibot validation (`agentId` too long, `limit` non-numeric,
 * `cursor` undecodable, etc). Carries the issues so the 400 response shape
 * matches the ingest route's — a client parsing `issues[].path` doesn't need
 * to branch on which 400 it got.
 */
export class InvalidQueryError extends SessionsError {
	readonly issues: readonly BaseIssue<unknown>[];

	constructor(issues: readonly BaseIssue<unknown>[]) {
		super("Invalid query parameters for /v1/sessions");
		this.name = "InvalidQueryError";
		this.issues = issues;
	}
}
