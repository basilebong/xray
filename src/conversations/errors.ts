export class ConversationsError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "ConversationsError";
	}
}

/**
 * The `/v1/sessions` endpoint returned a non-2xx status. Carries the status so
 * callers (telemetry, retry policy) can branch on it without parsing the
 * message.
 */
export class SessionsLoadError extends ConversationsError {
	readonly status: number;

	constructor(status: number) {
		super(`Server returned ${status}`);
		this.name = "SessionsLoadError";
		this.status = status;
	}
}
