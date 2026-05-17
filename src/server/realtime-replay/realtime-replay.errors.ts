import type { BaseIssue } from "valibot";

/** Base class for every error thrown by the realtime-replay slice. */
export class RealtimeReplayError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "RealtimeReplayError";
	}
}

/** `POST /v1/replays/realtime` body failed Valibot validation. */
export class InvalidRealtimeReplayRequestError extends RealtimeReplayError {
	readonly issues: readonly BaseIssue<unknown>[];

	constructor(issues: readonly BaseIssue<unknown>[]) {
		super("Invalid POST /v1/replays/realtime body");
		this.name = "InvalidRealtimeReplayRequestError";
		this.issues = issues;
	}
}

/** WS handshake to the webhook failed (DNS, refused, TLS, HTTP error pre-upgrade). */
export class WebhookConnectError extends RealtimeReplayError {
	readonly webhookUrl: string;

	constructor(webhookUrl: string, message: string, options?: ErrorOptions) {
		super(`Failed to open WebSocket to ${webhookUrl}: ${message}`, options);
		this.name = "WebhookConnectError";
		this.webhookUrl = webhookUrl;
	}
}

/** WS closed before the engine saw the expected number of `turn.done` frames. */
export class WebhookClosedEarlyError extends RealtimeReplayError {
	readonly turnsCompleted: number;
	readonly turnsExpected: number;
	readonly code: number;
	readonly reason: string;

	constructor(turnsCompleted: number, turnsExpected: number, code: number, reason: string) {
		super(
			`WebSocket closed (code=${code}) after ${turnsCompleted}/${turnsExpected} turns: ${reason || "(no reason)"}`,
		);
		this.name = "WebhookClosedEarlyError";
		this.turnsCompleted = turnsCompleted;
		this.turnsExpected = turnsExpected;
		this.code = code;
		this.reason = reason;
	}
}

/** A frame the webhook sent failed `ServerFrameSchema`. */
export class WebhookInvalidFrameError extends RealtimeReplayError {
	readonly issues: readonly BaseIssue<unknown>[];

	constructor(issues: readonly BaseIssue<unknown>[]) {
		super("Webhook sent a frame that did not match ServerFrameSchema");
		this.name = "WebhookInvalidFrameError";
		this.issues = issues;
	}
}

/** A frame arrived that wasn't valid JSON (or wasn't a string at all). */
export class WebhookMalformedFrameError extends RealtimeReplayError {
	constructor(options?: ErrorOptions) {
		super("Webhook sent a frame that was not valid JSON text", options);
		this.name = "WebhookMalformedFrameError";
	}
}

/** Webhook sent an error frame; the message is surfaced to the operator via the run row. */
export class WebhookReportedError extends RealtimeReplayError {
	readonly code: string;

	constructor(code: string, message: string) {
		super(`Webhook reported "${code}": ${message}`);
		this.name = "WebhookReportedError";
		this.code = code;
	}
}

/** Webhook sent frames for a turn idx that isn't in the source manifest. */
export class UnknownTurnIdxError extends RealtimeReplayError {
	readonly turnIdx: number;

	constructor(turnIdx: number) {
		super(`Webhook referenced turn idx ${turnIdx} which is not in the source session`);
		this.name = "UnknownTurnIdxError";
		this.turnIdx = turnIdx;
	}
}

/** Audio chunks within one turn switched content type mid-stream. */
export class ContentTypeChangedMidTurnError extends RealtimeReplayError {
	readonly turnIdx: number;
	readonly first: string;
	readonly conflicting: string;

	constructor(turnIdx: number, first: string, conflicting: string) {
		super(
			`Turn ${turnIdx} agent_audio.delta chunks switched content type from "${first}" to "${conflicting}"`,
		);
		this.name = "ContentTypeChangedMidTurnError";
		this.turnIdx = turnIdx;
		this.first = first;
		this.conflicting = conflicting;
	}
}
