import {
	ConversationError,
	ConversationNotFoundError,
	InvalidConversationHashError,
} from "./conversations.errors.ts";
import { describe, expect, it } from "bun:test";

describe("ConversationError subclasses", () => {
	it("InvalidConversationHashError carries issues + name", () => {
		const err = new InvalidConversationHashError([
			{
				kind: "schema",
				type: "x",
				input: undefined,
				expected: null,
				received: "undefined",
				message: "m",
			},
		]);
		expect(err).toBeInstanceOf(ConversationError);
		expect(err.name).toBe("InvalidConversationHashError");
		expect(err.issues).toHaveLength(1);
	});

	it("ConversationNotFoundError carries hash + name", () => {
		const e = new ConversationNotFoundError("a".repeat(64));
		expect(e).toBeInstanceOf(ConversationError);
		expect(e.name).toBe("ConversationNotFoundError");
		expect(e.conversationHash).toBe("a".repeat(64));
	});
});
