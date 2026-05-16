import type { Agent, AgentId } from "../agent/types.ts";
import type { Conversation, ConversationId, ConversationMeta } from "../conversation/types.ts";
import type { LiveSession } from "../live-session/types.ts";
import type { ProviderId } from "../provider/types.ts";
import type { Workflow } from "../workflow/types.ts";

/**
 * The provider-agnostic contract for a voice-agent platform.
 *
 * Each platform (ElevenLabs, Vapi, Retell, OpenAI Realtime, Voiceflow) ships
 * as a slice under `src/adapters/<provider>/` whose `adapter.ts` implements
 * this interface. Everything else in the app — graph rendering, transcript
 * view, inspector, path highlighting — is provider-agnostic and lives above
 * this boundary.
 *
 * Keep this interface small. If a new provider needs something it cannot
 * express, prefer extending the shared types over adding provider-specific
 * methods — interface churn affects every adapter.
 */
export interface VoiceAgentAdapter {
	readonly provider: ProviderId;
	listAgents(): Promise<Agent[]>;
	getWorkflow(agentId: AgentId): Promise<Workflow>;
	listConversations(agentId: AgentId): Promise<ConversationMeta[]>;
	getConversation(id: ConversationId): Promise<Conversation>;
	streamLiveConversation(agentId: AgentId): Promise<LiveSession>;
}
