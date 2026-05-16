import { ConversationsError, SessionsLoadError } from "./errors.ts";
import { describe, expect, it } from "bun:test";

describe("SessionsLoadError", () => {
	it("is a ConversationsError + carries status", () => {
		const e = new SessionsLoadError(503);
		expect(e).toBeInstanceOf(ConversationsError);
		expect(e).toBeInstanceOf(Error);
		expect(e.name).toBe("SessionsLoadError");
		expect(e.status).toBe(503);
	});
});
