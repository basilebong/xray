import { makeAgent } from "../agent/test-utils.ts";
import { makeConversation, makeConversationMeta } from "../conversation/test-utils.ts";
import { makeLiveSession } from "../live-session/test-utils.ts";
import type { ProviderId } from "../provider/types.ts";
import { makeWorkflow } from "../workflow/test-utils.ts";
import type { VoiceAgentAdapter } from "./types.ts";

export function makeFakeAdapter(
	provider: ProviderId = "elevenlabs",
	overrides: Partial<VoiceAgentAdapter> = {},
): VoiceAgentAdapter {
	return {
		provider,
		listAgents: () => Promise.resolve([makeAgent({ provider })]),
		getWorkflow: () => Promise.resolve(makeWorkflow()),
		listConversations: () => Promise.resolve([makeConversationMeta()]),
		getConversation: () => Promise.resolve(makeConversation()),
		streamLiveConversation: () => Promise.resolve(makeLiveSession()),
		...overrides,
	};
}
