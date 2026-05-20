import type { ConversationTurn } from "./conversations.types.ts";

export function makeConversationTurn(overrides: Partial<ConversationTurn> = {}): ConversationTurn {
	return {
		role: "user",
		text: "hello",
		...overrides,
	};
}

export interface MakeTurnsOptions {
	turns?: ConversationTurn[];
}

export function makeTurns(opts: MakeTurnsOptions = {}): ConversationTurn[] {
	if (opts.turns !== undefined) return opts.turns;
	return [
		makeConversationTurn({ role: "user", text: "hi", key: "u0" }),
		makeConversationTurn({ role: "agent", key: "a0" }),
	];
}
