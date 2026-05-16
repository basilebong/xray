import type { Agent } from "./types.ts";

export function makeAgent(overrides: Partial<Agent> = {}): Agent {
	return {
		id: "agent_test_1",
		name: "Test Agent",
		provider: "elevenlabs",
		...overrides,
	};
}
