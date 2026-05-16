import type { AgentId } from "../agent/types.ts";

export type NodeId = string;
export type EdgeId = string;

export interface WorkflowNode {
	id: NodeId;
	label: string;
	/** System / instruction prompt attached to this node, if the provider exposes it. */
	prompt?: string;
}

export interface WorkflowEdge {
	id: EdgeId;
	from: NodeId;
	to: NodeId;
	/** Natural-language routing condition the provider evaluates with an LLM. */
	condition?: string;
}

export interface Workflow {
	agentId: AgentId;
	nodes: WorkflowNode[];
	edges: WorkflowEdge[];
}
