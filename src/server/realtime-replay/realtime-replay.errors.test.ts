import type { BaseIssue } from "valibot";

import {
	ContentTypeChangedMidTurnError,
	InvalidRealtimeReplayRequestError,
	RealtimeReplayError,
	UnknownTurnIdxError,
	WebhookClosedEarlyError,
	WebhookConnectError,
	WebhookInvalidFrameError,
	WebhookMalformedFrameError,
	WebhookReportedError,
} from "./realtime-replay.errors.ts";
import { describe, expect, it } from "bun:test";

function fakeIssues(message: string): readonly BaseIssue<unknown>[] {
	return [
		{
			kind: "schema",
			type: "test",
			input: undefined,
			expected: "(anything)",
			received: "(nothing)",
			message,
		},
	] satisfies readonly BaseIssue<unknown>[];
}

describe("RealtimeReplayError subclasses", () => {
	it("InvalidRealtimeReplayRequestError carries issues and is an instance of RealtimeReplayError", () => {
		const issues = fakeIssues("bad");
		const err = new InvalidRealtimeReplayRequestError(issues);
		expect(err).toBeInstanceOf(RealtimeReplayError);
		expect(err.name).toBe("InvalidRealtimeReplayRequestError");
		expect(err.issues).toBe(issues);
	});

	it("WebhookConnectError carries the URL and a wrapped cause", () => {
		const cause = new Error("ECONNREFUSED");
		const err = new WebhookConnectError("ws://x/", "refused", { cause });
		expect(err).toBeInstanceOf(RealtimeReplayError);
		expect(err.name).toBe("WebhookConnectError");
		expect(err.webhookUrl).toBe("ws://x/");
		expect(err.cause).toBe(cause);
		expect(err.message).toContain("refused");
	});

	it("WebhookClosedEarlyError surfaces code, reason, and progress", () => {
		const err = new WebhookClosedEarlyError(2, 5, 1011, "bye");
		expect(err.name).toBe("WebhookClosedEarlyError");
		expect(err.turnsCompleted).toBe(2);
		expect(err.turnsExpected).toBe(5);
		expect(err.code).toBe(1011);
		expect(err.reason).toBe("bye");
		expect(err.message).toContain("1011");
		expect(err.message).toContain("2/5");
	});

	it("WebhookInvalidFrameError carries the Valibot issues", () => {
		const issues = fakeIssues("missing transcript");
		const err = new WebhookInvalidFrameError(issues);
		expect(err.name).toBe("WebhookInvalidFrameError");
		expect(err.issues).toBe(issues);
	});

	it("WebhookMalformedFrameError wraps the parse cause", () => {
		const cause = new SyntaxError("Unexpected token");
		const err = new WebhookMalformedFrameError({ cause });
		expect(err.name).toBe("WebhookMalformedFrameError");
		expect(err.cause).toBe(cause);
	});

	it("WebhookReportedError exposes the code", () => {
		const err = new WebhookReportedError("no_api_key", "missing");
		expect(err.name).toBe("WebhookReportedError");
		expect(err.code).toBe("no_api_key");
		expect(err.message).toContain("no_api_key");
		expect(err.message).toContain("missing");
	});

	it("UnknownTurnIdxError carries turnIdx", () => {
		const e = new UnknownTurnIdxError(99);
		expect(e.name).toBe("UnknownTurnIdxError");
		expect(e.turnIdx).toBe(99);
	});

	it("ContentTypeChangedMidTurnError surfaces both content types", () => {
		const err = new ContentTypeChangedMidTurnError(1, "audio/wav", "audio/opus");
		expect(err.name).toBe("ContentTypeChangedMidTurnError");
		expect(err.first).toBe("audio/wav");
		expect(err.conflicting).toBe("audio/opus");
		expect(err.message).toContain("audio/wav");
		expect(err.message).toContain("audio/opus");
	});
});
