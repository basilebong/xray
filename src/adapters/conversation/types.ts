import type { AgentId } from "../agent/types.ts";
import type { EdgeId, NodeId } from "../workflow/types.ts";

export type ConversationId = string;
export type TurnId = string;

export type Role = "user" | "agent" | "tool" | "system";

export interface ToolCall {
	name: string;
	args: unknown;
	result?: unknown;
	latencyMs?: number;
}

/**
 * One logical step in a conversation: a user utterance, an agent reply, a tool
 * call + return, or a system event. `activeNodeId` + `edgeFiredId` are how we
 * paint the graph for this turn.
 */
export interface Turn {
	id: TurnId;
	role: Role;
	text: string;
	/** ISO 8601 timestamp. */
	timestamp: string;
	/** Node that was active when this turn was produced. */
	activeNodeId?: NodeId;
	/** Edge that fired to *reach* the active node, if any. */
	edgeFiredId?: EdgeId;
	/** LLM's natural-language reasoning for picking the edge. */
	edgeReasoning?: string;
	/** Full prompt the LLM saw at this turn (system + node override + KB context). */
	promptSeen?: string;
	toolCalls?: ToolCall[];
	llmLatencyMs?: number;
}

export interface ConversationMeta {
	id: ConversationId;
	agentId: AgentId;
	/** ISO 8601 timestamp of the conversation start. */
	startedAt: string;
	durationMs?: number;
}

export interface Conversation extends ConversationMeta {
	turns: Turn[];
	/** Ordered list of node IDs the conversation actually walked through. */
	visitedPath: NodeId[];
}
