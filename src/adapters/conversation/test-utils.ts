import type { Conversation, ConversationMeta, ToolCall, Turn } from "./types.ts";

export function makeToolCall(overrides: Partial<ToolCall> = {}): ToolCall {
	return {
		name: "lookup_balance",
		args: { customer_id: "abc" },
		result: { balance: 1247.55, currency: "EUR" },
		latencyMs: 120,
		...overrides,
	};
}

export function makeTurn(overrides: Partial<Turn> = {}): Turn {
	return {
		id: "turn_test_1",
		role: "user",
		text: "hello",
		timestamp: "2026-05-16T10:00:00.000Z",
		...overrides,
	};
}

export function makeConversationMeta(overrides: Partial<ConversationMeta> = {}): ConversationMeta {
	return {
		id: "conv_test_1",
		agentId: "agent_test_1",
		startedAt: "2026-05-16T10:00:00.000Z",
		...overrides,
	};
}

export function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
	return {
		...makeConversationMeta(),
		turns: [makeTurn()],
		visitedPath: [],
		...overrides,
	};
}
