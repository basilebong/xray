import type { ProviderId } from "../provider/types.ts";

export type AgentId = string;

export interface Agent {
	id: AgentId;
	name: string;
	provider: ProviderId;
}
