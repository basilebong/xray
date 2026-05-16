import type { LiveSession } from "./types.ts";

export function makeLiveSession(overrides: Partial<LiveSession> = {}): LiveSession {
	return {
		conversationId: "conv_test_1",
		onTurn: () => () => undefined,
		stop: () => Promise.resolve(),
		...overrides,
	};
}
