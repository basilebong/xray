import type { Workflow, WorkflowEdge, WorkflowNode } from "./types.ts";

export function makeWorkflowNode(overrides: Partial<WorkflowNode> = {}): WorkflowNode {
	return {
		id: "node_test_1",
		label: "Test Node",
		...overrides,
	};
}

export function makeWorkflowEdge(overrides: Partial<WorkflowEdge> = {}): WorkflowEdge {
	return {
		id: "edge_test_1",
		from: "node_test_1",
		to: "node_test_2",
		...overrides,
	};
}

export function makeWorkflow(overrides: Partial<Workflow> = {}): Workflow {
	return {
		agentId: "agent_test_1",
		nodes: [makeWorkflowNode()],
		edges: [],
		...overrides,
	};
}
